#!/usr/bin/env node
// The review of rewritten messages (docs/i18n.md): what the viewer marked Done in the text editor, checked for
// structure (tools/i18n/check.mjs: it parses, uses only the values the code gives, keeps tags and hint keys),
// spelling and grammar (Harper, offline, American English, with every word the source already uses accepted),
// and written back as findings beside each message, which the editor shows. A message with an open finding is
// flagged; one with none waits for the reader's review (Claude's, for sense and logic against what the page
// does), which approves it or adds findings of its own:
//   node tools/i18n/review.mjs                          check every Done message not yet checked in its current words
//   node tools/i18n/review.mjs --all                    check every rewritten message again
//   node tools/i18n/review.mjs --source                 check the source's own English (a baseline; writes nothing)
//   node tools/i18n/review.mjs --list [done|flagged|checked]   print messages for a reader's review, with context
//   node tools/i18n/review.mjs --approve ID [ID...]     approve (after a reader's review)
//   node tools/i18n/review.mjs --note ID "what" [--suggest "text"] [--level warn|error] [--kind logic]
// Runs as tools/capped.sh -m 600M node tools/i18n/review.mjs (Harper's dictionary takes about 300 MB).
import { parseArgs } from 'node:util';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { extract } from './extract.mjs';
import { checkMessage } from './check.mjs';
import { catalogFile, reviewFile, readJson, writeJson } from './locale.mjs';

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  locale: { type: 'string', default: 'en-x-rewrite' }, all: { type: 'boolean' }, source: { type: 'boolean' }, list: { type: 'string' },
  approve: { type: 'boolean' }, note: { type: 'string' }, suggest: { type: 'string' }, level: { type: 'string', default: 'warn' }, kind: { type: 'string', default: 'logic' } } });
const CAT = catalogFile(opt.locale), REV = reviewFile(opt.locale);
const { messages, context } = extract();
const catalog = readJson(CAT, {}), review = readJson(REV, {});
const now = new Date().toISOString();
const textOf = (id) => catalog[id] ?? messages.get(id);

// ---- a reader's verdicts ----
if (opt.approve) {
  for (const id of positionals) {
    const r = review[id];
    if (!r) { console.error(`${id}: not in the review`); continue; }
    const open = (r.findings || []).filter((f) => !f.resolved && !f.stale && f.level !== 'ok');
    if (open.some((f) => f.by !== 'claude' && f.level === 'error')) { console.error(`${id}: has an open error; not approved`); continue; }
    r.status = 'approved'; r.approvedAt = now; r.approvedText = textOf(id);
    console.log(`approved ${id}`);
  }
  writeJson(REV, review);
  process.exit(0);
}
if (opt.note) {
  const id = opt.note, r = review[id];
  if (!r || !positionals[0]) { console.error('usage: --note ID "what" [--suggest "text"]'); process.exit(1); }
  (r.findings ||= []).push({ by: 'claude', kind: opt.kind, level: opt.level, msg: positionals[0], suggest: opt.suggest, text: textOf(id), at: now });
  r.status = 'flagged';
  writeJson(REV, review);
  console.log(`noted ${id}`);
  process.exit(0);
}
if (opt.list) {
  const want = opt.list;
  for (const id of messages.keys()) {
    const r = review[id];
    if (!r) continue;
    const checked = r.checkedText === textOf(id);
    if (want === 'done' ? r.status !== 'done' : want === 'checked' ? !(r.status === 'done' && checked) : r.status !== want) continue;
    const ref = context[id]?.refs[0];
    console.log(`\n## ${id}  [${r.status}${checked ? ', checked' : ''}]  ${ref ? `${ref.file}:${ref.line} ${ref.sink}` : ''}`);
    if (ref?.note) console.log(`   note: ${ref.note}`);
    console.log(`   was: ${messages.get(id)}`);
    console.log(`   now: ${textOf(id)}`);
    for (const f of (r.findings || []).filter((x) => !x.resolved && !x.stale)) console.log(`   ! ${f.by}/${f.kind}: ${f.msg}`);
  }
  process.exit(0);
}

// ---- the machine's checks ----
const { LocalLinter, Dialect } = await import('harper.js');
const { binary } = await import('harper.js/binary');
const linter = new LocalLinter({ binary });
await linter.setup();
await linter.setDialect(Dialect.American);
// every word the source already uses is a word (framboid, grazer, Tidemote...), and the stand-ins for values
const words = new Set();
for (const m of messages.values()) for (const w of m.match(/\p{L}[\p{L}'’-]*/gu) || []) words.add(w.replace(/['’]s$/, ''));
await linter.importWords([...words, 'Velloria', 'Quillon']);

// a message as the sentences a reader meets: each plural and select branch, values as stand-ins
const STAND = (name) => (/^(n|count|num|cells|k|pop|i|total|max|min|living|was|now|lost|from|to|kin)$|(^n[A-Z])|Count$|^n\d$/.test(name) ? '3' : /name|sp$|species|who|by|food|hunter|quarry|lead|link|genus/i.test(name) ? 'Velloria' : /dur|ago|age|time|when|at$|clock/i.test(name) ? 'four minutes' : 'Quillon');
function sentences(text) {
  let ast;
  try { ast = parse(text); } catch { return []; }
  const out = new Set();
  const dims = [];
  const walk = (els) => { for (const e of els) { if (e.type === TYPE.plural || e.type === TYPE.select) dims.push(e); if (e.children) walk(e.children); if (e.options) for (const o of Object.values(e.options)) walk(o.value); } };
  walk(ast);
  const flat = (els, branch, n) => els.map((e) => {
    if (e.type === TYPE.literal) return e.value;
    if (e.type === TYPE.pound) return String(n ?? 3);
    if (e.type === TYPE.tag) return flat(e.children, branch, n);
    if (e.options) { const k = branch.get(e) ?? 'other'; const o = e.options[k] || e.options.other; return flat(o.value, branch, e.type === TYPE.plural ? (k === 'one' ? 1 : /^=\d+$/.test(k) ? +k.slice(1) : 3) : n); }
    return STAND(e.value);
  }).join('');
  // each branch of each choice once, the others at their 'other'
  out.add(flat(ast, new Map(), null));
  for (const d of dims) for (const k of Object.keys(d.options)) out.add(flat(ast, new Map([[d, k]]), null));
  return [...out].slice(0, 16);
}
// a lint worth showing: not about a stand-in, not a fragment's missing capital or period
async function lintsOf(id, text) {
  const out = [];
  const source = messages.get(id);
  const fragment = !/^[A-Z]/.test(source.replace(/^[^A-Za-z]+/, '')) || !/[.!?]$/.test(source.trim());
  for (const s of sentences(text)) {
    for (const l of await linter.lint(s)) {
      const kind = l.lint_kind(), what = l.get_problem_text();
      if (/Velloria|Quillon/.test(what)) continue;
      if (fragment && /Capitalization|Punctuation/.test(kind)) continue;
      const sug = l.suggestions().map((x) => x.get_replacement_text()).filter(Boolean).slice(0, 3);
      out.push({ by: 'harper', kind: kind.toLowerCase(), level: kind === 'Spelling' || kind === 'Grammar' || kind === 'Repetition' || kind === 'Agreement' ? 'warn' : 'info', msg: `${l.message()} (“${what}”${sug.length ? `; perhaps ${sug.map((x) => `“${x}”`).join(', ')}` : ''})` });
    }
  }
  // the same finding from two branches once
  return out.filter((f, i) => out.findIndex((g) => g.msg === f.msg) === i);
}

if (opt.source) {
  let n = 0;
  for (const [id, m] of messages) {
    const ls = await lintsOf(id, m);
    if (!ls.length) continue;
    n++;
    console.log(`\n${id}: ${m.length > 160 ? `${m.slice(0, 157)}...` : m}`);
    for (const l of ls) console.log(`   ${l.level === 'warn' ? '!' : '·'} ${l.kind}: ${l.msg}`);
  }
  console.log(`\n${n} of ${messages.size} source messages with something to look at`);
  process.exit(0);
}

let checked = 0, flagged = 0;
for (const id of messages.keys()) {
  const r = review[id];
  if (!r || !(r.status === 'done' || (opt.all && ['flagged', 'approved', 'done'].includes(r.status)))) continue;
  const text = textOf(id);
  if (!opt.all && r.checkedText === text) continue;
  const ref = context[id]?.refs[0];
  const found = [
    ...checkMessage(text, messages.get(id), { sink: ref?.sink }).map((p) => ({ by: 'check', kind: p.code, level: p.level, msg: p.msg })),
    ...await lintsOf(id, text),
  ].map((f) => ({ ...f, text, at: now }));
  // the machine's earlier findings give way to these; a reader's stay until answered
  r.findings = [...(r.findings || []).filter((f) => f.by === 'claude' || f.resolved), ...found];
  r.checkedText = text; r.checkedAt = now;
  const open = r.findings.filter((f) => !f.resolved && !f.stale && (f.level === 'error' || f.level === 'warn'));
  if (open.length) { r.status = 'flagged'; flagged++; } else if (r.status === 'flagged') r.status = 'done';
  checked++;
}
writeJson(REV, review);
console.log(`checked ${checked} messages: ${flagged} flagged, ${checked - flagged} clean (waiting for a reader's review: --list checked)`);
