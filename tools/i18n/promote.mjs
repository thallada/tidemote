#!/usr/bin/env node
// The rewrite made the source (docs/i18n.md): every approved message of a locale (by default the viewer's
// rewrite, en-x-rewrite) written into the code where its tr() calls are, and into page.html's marked spans;
// then locales/en.json is extracted again, the promoted messages leave the locale's catalog, and their review
// entries say when. Approved means approved in the words the review approved: a message edited since waits.
//   node tools/i18n/promote.mjs [--dry] [--locale en-x-rewrite] [--ids a,b,c]
// Then: npm run build, the i18n test, and a tour of the new build against one of the old
// (tools/i18n/tour.mjs, tools/i18n/textdiff.mjs): the differences should be exactly the promoted messages.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseJs } from 'acorn';
import { simple } from 'acorn-walk';
import { extract, ROOT } from './extract.mjs';
import { scanHtml, bakeHtml } from './html.mjs';
import { checkMessage } from './check.mjs';

const { values: opt } = parseArgs({ options: { locale: { type: 'string', default: 'en-x-rewrite' }, dry: { type: 'boolean' }, ids: { type: 'string' } } });
const CAT = path.join(ROOT, 'locales', `${opt.locale}.json`);
const REV = path.join(ROOT, 'locales/review', `${opt.locale}.json`);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return d; throw e; } };
const writeJson = (f, v) => { const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(v, null, 2)}\n`); fs.renameSync(tmp, f); };

const { messages, context, errors } = extract();
if (errors.length) { console.error(`the source has message errors; fix them first:\n${errors.join('\n')}`); process.exit(1); }
const catalog = readJson(CAT, {}), review = readJson(REV, {});
const only = opt.ids ? new Set(opt.ids.split(',')) : null;

const go = new Map();
for (const [id, text] of Object.entries(catalog)) {
  const r = review[id];
  if (only && !only.has(id)) continue;
  if (!messages.has(id)) { console.warn(`${id}: no longer in the source; skipped`); continue; }
  if (r?.status !== 'approved') continue;
  if (r.approvedText !== text) { console.warn(`${id}: edited since it was approved; skipped`); continue; }
  const bad = checkMessage(text, messages.get(id)).filter((p) => p.level === 'error');
  if (bad.length) { console.warn(`${id}: ${bad[0].msg}; skipped`); continue; }
  go.set(id, text);
}
if (!go.size) { console.log('nothing approved to promote'); process.exit(0); }

// a JS string literal of `text` in the quotes the call used
function literal(text, raw) {
  const q = raw[0];
  if (q === '`') return `\`${text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
  return q + text.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), `\\${q}`).replace(/\n/g, '\\n').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + q;
}

const files = new Set();
for (const id of go.keys()) for (const r of context[id].refs) files.add(r.file);
let changed = 0;
for (const file of files) {
  const full = path.join(ROOT, file);
  let src = fs.readFileSync(full, 'utf8');
  if (file.endsWith('.html')) {
    const items = scanHtml(src).filter((it) => go.has(it.id));
    src = bakeHtml(src, items, (id) => go.get(id));
    changed += items.length;
  } else {
    const ast = parseJs(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
    const names = new Set();
    for (const d of ast.body) if (d.type === 'ImportDeclaration' && /(^|\/)i18n\.js$/.test(d.source.value)) for (const s of d.specifiers) if (s.imported?.name === 'tr') names.add(s.local.name);
    const edits = [];
    simple(ast, { CallExpression(n) {
      if (n.callee.type !== 'Identifier' || !names.has(n.callee.name)) return;
      const id = n.arguments[0]?.value;
      if (!go.has(id)) return;
      const m = n.arguments[1];
      edits.push([m.start, m.end, literal(go.get(id), src.slice(m.start, m.end))]);
    } });
    for (const [a, b, s] of edits.sort((x, y) => y[0] - x[0])) src = src.slice(0, a) + s + src.slice(b);
    changed += edits.length;
  }
  console.log(`${file}: ${opt.dry ? 'would change' : 'changed'}`);
  if (!opt.dry) fs.writeFileSync(full, src);
}
console.log(`${go.size} messages, ${changed} places${opt.dry ? ' (dry run: nothing written)' : ''}`);
if (opt.dry) process.exit(0);

// the source now says it: out of the catalog, into the record
const after = extract();
if (after.errors.length) { console.error(`after promoting, the source has message errors:\n${after.errors.join('\n')}`); process.exit(1); }
for (const id of go.keys()) if (after.messages.get(id) !== go.get(id)) { console.error(`${id}: the source does not say what was promoted (got ${JSON.stringify(after.messages.get(id))})`); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'locales/en.json'), `${JSON.stringify(Object.fromEntries(after.messages), null, 2)}\n`);
const now = new Date().toISOString();
for (const id of go.keys()) { delete catalog[id]; Object.assign(review[id], { status: 'promoted', promotedAt: now }); }
writeJson(CAT, catalog);
writeJson(REV, review);
console.log('locales/en.json extracted again; promoted messages left the rewrite. Now build, test, and tour.');
