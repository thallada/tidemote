#!/usr/bin/env node
// The page's messages, read from the source (docs/i18n.md): every tr(id, message, values) call in src/ and
// desktop/, and every data-i18n element of src/page.html, into locales/en.json (id → ICU message, in the
// order the page's files hold them) and locales/context.json (where each is used: file, line, function,
// what it fills, the code around it; for the text editor, tools/i18n/textlab.mjs; not committed).
//   node tools/i18n/extract.mjs            write both
//   node tools/i18n/extract.mjs --check    fail if locales/en.json is not what the source says
//   node tools/i18n/extract.mjs --audit    list prose in the source that does not go through tr()
// It fails on a message that does not parse, an id used for two different messages, a dynamic id or
// message, and arguments or tags a call does not supply.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJs } from 'acorn';
import { ancestor, full } from 'acorn-walk';
import { parse as parseIcu, TYPE } from '@formatjs/icu-messageformat-parser';
import { scanHtml } from './html.mjs';

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
// what the build carries, in the order a visitor tends to meet it (the editor lists messages in this order)
const FIRST = ['src/page.html', 'src/main.js', 'src/ui.js', 'src/fmt.js', 'src/ladder.js', 'src/bench.js', 'src/hand.js', 'src/specimen.js', 'src/mindview.js', 'src/mind.js', 'src/lab.js', 'src/guide.js', 'src/chronicler.js'];
// never shown to a visitor: the simulation's WGSL, headless runs, the soundtrack's DSP, tools
const SKIP = /^desktop\/scripts\/|^src\/(shaders|headless|ecostats|seatune|sea|webm|qr|encode|engine)\.js$|^src\/audio\/(ugens|voices|worklet|conductor|listen|score|field)\.js$/;
// HTML tags a message may hold without the call supplying them (tr gives them back as themselves)
export const OWN_TAGS = new Set(['b', 'i', 'em', 'strong', 'kbd', 'small', 'sub', 'sup', 'u', 'code', 'span']);

export function sourceFiles() {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(m?js|cjs)$/.test(e.name)) out.push(p); } };
  out.push('src/page.html');
  walk('src'); walk('desktop/scripts'); for (const f of fs.readdirSync(path.join(ROOT, 'desktop'))) if (/\.(m?js)$/.test(f)) out.push(`desktop/${f}`);
  const rank = (f) => { const i = FIRST.indexOf(f); return i < 0 ? FIRST.length : i; };
  return out.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const parseFile = (src, file) => {
  const comments = [];
  try { return { ast: parseJs(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments, allowHashBang: true }), comments }; }
  catch (e) { throw new Error(`${file}: ${e.message}`); }
};
const literal = (n) => (n?.type === 'Literal' && typeof n.value === 'string' ? n.value
  : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : undefined);
const nameOf = (n) => n?.type === 'Identifier' ? n.name : n?.type === 'Literal' ? String(n.value) : n?.type === 'PrivateIdentifier' ? `#${n.name}` : n?.type === 'MemberExpression' ? `${nameOf(n.object)}.${nameOf(n.property)}` : '';

// which local names call tr (import { tr } / import { tr as x } from './i18n.js')
export function trNames(ast) {
  const names = new Set();
  for (const d of ast.body) if (d.type === 'ImportDeclaration' && /(^|\/)i18n\.js$/.test(d.source.value)) for (const s of d.specifiers) if (s.imported?.name === 'tr') names.add(s.local.name);
  return names;
}

// what a message fills, from where its call sits
function sinkOf(anc, call, src) {
  for (let i = anc.length - 2; i >= 0; i--) {
    const a = anc[i], child = anc[i + 1];
    if (a.type === 'AssignmentExpression' && a.left.type === 'MemberExpression') { const p = nameOf(a.left.property); if (/^(textContent|innerHTML|innerText|title|placeholder|value|ariaLabel|alt|download)$/.test(p)) return p; }
    if (a.type === 'CallExpression') {
      const fn = nameOf(a.callee);
      if (/setAttribute$/.test(fn)) return `[${literal(a.arguments[0]) ?? '?'}]`;
      if (/fillText|strokeText/.test(fn)) return 'canvas';
      if (/\b(flash|toast|say|note|status)$/i.test(fn)) return `${fn}()`;
    }
    if (a.type === 'TemplateLiteral') {
      // the markup just before the expression holding the call: inside an attribute's quotes, or text
      const k = a.expressions.indexOf(child);
      if (k >= 0) {
        const before = a.quasis.slice(0, k + 1).map((q) => q.value.raw).join('\u0000');
        const m = /([\w-]+)="[^"]*$/.exec(before.replace(/\u0000/g, ''));
        if (m && before.lastIndexOf('"') > before.lastIndexOf('>')) return `[${m[1]}]`;
        if (/<[a-z]/i.test(before)) return 'html';
      }
    }
    if (/Function|MethodDefinition/.test(a.type)) break;
  }
  return 'value';
}
function fnOf(anc) {
  for (let i = anc.length - 1; i >= 0; i--) {
    const a = anc[i];
    if (a.type === 'FunctionDeclaration' && a.id) return a.id.name;
    if (a.type === 'MethodDefinition') return nameOf(a.key);
    if (a.type === 'VariableDeclarator' && /Function/.test(a.init?.type || '')) return nameOf(a.id);
    if (a.type === 'Property' && /Function/.test(a.value?.type || '')) return nameOf(a.key);
  }
  for (let i = anc.length - 1; i >= 0; i--) if (anc[i].type === 'VariableDeclarator') return nameOf(anc[i].id);
  return '';
}

/** { args: Map name -> kind, tags: Set } a message (its parsed elements) uses */
export function shapeOf(els, out = { args: new Map(), tags: new Set() }) {
  for (const e of els) {
    if (e.type === TYPE.tag) { out.tags.add(e.value); shapeOf(e.children, out); }
    else if (e.type !== TYPE.literal && e.type !== TYPE.pound) out.args.set(e.value, TYPE[e.type]);
    if (e.options) for (const o of Object.values(e.options)) shapeOf(o.value, out);
  }
  return out;
}

export function extract({ files = sourceFiles() } = {}) {
  const messages = new Map(), context = {}, errors = [];
  const add = (id, message, ref) => {
    if (messages.has(id) && messages.get(id) !== message) { errors.push(`${ref.file}:${ref.line}: ${id} is also "${messages.get(id)}" (${context[id].refs[0].file}:${context[id].refs[0].line})`); return; }
    try { parseIcu(message); } catch (e) { errors.push(`${ref.file}:${ref.line}: ${id}: ${e.message} in "${message}"`); return; }
    messages.set(id, message);
    (context[id] ||= { refs: [] }).refs.push(ref);
  };
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (file.endsWith('.html')) {
      for (const it of scanHtml(src)) add(it.id, it.message, { file, line: it.line, sink: it.attr ? `[${it.attr}]` : 'html', fn: '', code: lineAt(src, it.line), tags: Object.keys(it.tags) });
      continue;
    }
    let parsed;
    try { parsed = parseFile(src, file); } catch (e) { errors.push(e.message); continue; }
    const { ast, comments } = parsed;
    const names = trNames(ast);
    if (!names.size) continue;
    const lines = src.split('\n');
    ancestor(ast, {
      CallExpression(n, _s, anc) {
        if (n.callee.type !== 'Identifier' || !names.has(n.callee.name)) return;
        const line = n.loc.start.line;
        const id = literal(n.arguments[0]), message = literal(n.arguments[1]);
        if (id === undefined || message === undefined) { errors.push(`${file}:${line}: tr() takes a literal id and message`); return; }
        // a note for whoever rewrites or translates it: a comment holding "i18n:" on the lines just above
        const note = comments.filter((c) => c.loc.end.line >= line - 2 && c.loc.end.line < line && /i18n:/.test(c.value)).map((c) => c.value.replace(/^[\s*]*i18n:\s*/, '').trim()).join(' ');
        const v = n.arguments[2];
        let given = null;
        if (v?.type === 'ObjectExpression' && !v.properties.some((p) => p.type === 'SpreadElement')) given = new Set(v.properties.map((p) => nameOf(p.key)));
        let need;
        try { need = shapeOf(parseIcu(message)); } catch { need = null; }
        if (need && given) {
          for (const a of need.args.keys()) if (!given.has(a)) errors.push(`${file}:${line}: ${id} uses {${a}} but the call gives ${[...given].join(', ') || 'nothing'}`);
          for (const tg of need.tags) if (!given.has(tg) && !OWN_TAGS.has(tg)) errors.push(`${file}:${line}: ${id} uses <${tg}> but the call gives no ${tg}`);
        } else if (need && !v) {
          if (need.args.size) errors.push(`${file}:${line}: ${id} uses {${[...need.args.keys()].join('}, {')}} but the call gives no values`);
          for (const tg of need.tags) if (!OWN_TAGS.has(tg)) errors.push(`${file}:${line}: ${id} uses <${tg}> but the call gives no ${tg}`);
        }
        const a0 = Math.max(0, line - 3), code = lines.slice(a0, line + 2).join('\n');
        add(id, message, { file, line, fn: fnOf(anc), sink: sinkOf(anc, n, src), code, note: note || undefined, args: need ? [...need.args.keys()] : [], tags: need ? [...need.tags] : [] });
      },
    });
  }
  return { messages, context, errors };
}
const lineAt = (src, line) => src.split('\n')[line - 1]?.trim() ?? '';

// ---- the audit: prose that bypasses tr() ----
const CALL_OK = /^(console\.\w+|.*\.(querySelector|querySelectorAll|getElementById|addEventListener|removeEventListener|closest|matches|createElement|createElementNS|getAttribute|removeAttribute|hasAttribute|toggleAttribute|getItem|setItem|removeItem|postMessage|getContext|startsWith|endsWith|includes|split|indexOf|lastIndexOf|replace|replaceAll|padStart|padEnd|join|toggle|add|remove|contains|has|get|set|delete|test|exec|match|matchAll|send|on|once|emit|invoke|handle|fetch|setProperty|getPropertyValue|mark|measure|dispatchEvent|play|track)|require|import|fetch|structuredClone|Symbol|new Error|new TypeError|new RangeError|Error|Event|CustomEvent|new Event|new CustomEvent|new Blob|new File|new Worker|new AudioWorkletNode|matchMedia|tr|log)$/;
const PROSE = (s) => {
  const t = s.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\$\{[^}]*\}/g, ' ');
  return /[A-Za-z][a-z]+[,;:]?\s+[a-z][a-z]+/.test(t) || /(^|[>\s])[A-Z][a-z]{2,}([\s.!?,:<]|$)/.test(s.replace(/\$\{[^}]*\}/g, '')) && !/^[A-Z][a-z]+$/.test(s.trim()) || /^[A-Z][a-z]{2,}( [A-Za-z]+)*[.!?…]?$/.test(t.trim());
};
// a string that reaches what a visitor reads (textContent, innerHTML, an aria-label...) through ternaries,
// ||, + and templates, with a letter in it, is text however short
const SINK = /^(textContent|innerHTML|innerText|outerHTML|placeholder|title|alt|ariaLabel)$/;
const reaches = (anc) => {
  for (let i = anc.length - 2; i >= 0; i--) {
    const a = anc[i], child = anc[i + 1];
    if (a.type === 'AssignmentExpression' && a.right === child && a.left.type === 'MemberExpression') return SINK.test(nameOf(a.left.property));
    if (a.type === 'CallExpression' && /setAttribute$/.test(nameOf(a.callee))) return a.arguments[1] === child && /^(aria-label|data-hint|alt|title|placeholder)$/.test(literal(a.arguments[0]) || '');
    if (a.type === 'CallExpression' && /\.(insertAdjacentHTML|append|prepend|fillText|strokeText)$/.test(nameOf(a.callee))) return true;
    if (!/^(ConditionalExpression|LogicalExpression|TemplateLiteral|BinaryExpression|ParenthesizedExpression)$/.test(a.type)) return false;
    if (a.type === 'ConditionalExpression' && a.test === child) return false;
  }
  return false;
};
export function audit({ files = sourceFiles() } = {}) {
  const found = [];
  for (const file of files) {
    if (SKIP.test(file) || file.endsWith('.html')) continue;
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/i18n-ignore-file/.test(src)) continue;
    const { ast } = parseFile(src, file);
    const names = trNames(ast);
    const lines = src.split('\n');
    const ignored = (line) => /i18n-ignore/.test(lines[line - 1] || '') || /i18n-ignore-next/.test(lines[line - 2] || '');
    ancestor(ast, {
      Literal: (n, _s, anc) => check(n, anc, n.value),
      TemplateLiteral: (n, _s, anc) => check(n, anc, n.quasis.map((q) => q.value.cooked ?? q.value.raw).join('${}')),
    });
    function check(n, anc, value) {
      if (typeof value !== 'string') return;
      if (!PROSE(value) && !(/\p{L}{2}/u.test(value.replace(/<[^>]*>/g, '')) && reaches(anc))) return;
      const line = n.loc.start.line;
      if (ignored(line)) return;
      for (let i = anc.length - 2; i >= 0; i--) {
        const a = anc[i], child = anc[i + 1];
        if (/^(Import|Export\w*)Declaration$/.test(a.type) && child === a.source) return;
        if (a.type === 'ImportExpression') return;
        if (a.type === 'Property' && a.key === child && !a.computed) return;
        if (a.type === 'BinaryExpression' && /^[!=]==?$/.test(a.operator)) return;
        if (a.type === 'SwitchCase' && a.test === child) return;
        if (a.type === 'ThrowStatement' || a.type === 'NewExpression' && /Error$/.test(nameOf(a.callee))) return;
        if (a.type === 'CallExpression' || a.type === 'NewExpression') {
          const fn = (a.type === 'NewExpression' ? 'new ' : '') + nameOf(a.callee);
          if (a.type === 'CallExpression' && a.callee.type === 'Identifier' && names.has(a.callee.name)) return;
          if (CALL_OK.test(fn) && a.arguments.includes(child)) return;
        }
        if (a.type === 'TaggedTemplateExpression') return;
      }
      found.push({ file, line, text: value.length > 140 ? `${value.slice(0, 137)}...` : value });
    }
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  if (mode === '--audit') {
    const found = audit();
    const by = {};
    for (const f of found) (by[f.file] ||= []).push(f);
    for (const [file, list] of Object.entries(by)) { console.log(`\n${file} (${list.length})`); for (const f of list) console.log(`  ${f.line}: ${JSON.stringify(f.text)}`); }
    console.log(`\n${found.length} strings of prose outside tr()`);
    process.exit(found.length ? 1 : 0);
  }
  const { messages, context, errors } = extract();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  const json = `${JSON.stringify(Object.fromEntries(messages), null, 2)}\n`;
  const file = path.join(ROOT, 'locales/en.json');
  if (mode === '--check') {
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (have !== json) { console.error('locales/en.json is out of date: run node tools/i18n/extract.mjs'); process.exit(1); }
    console.log(`locales/en.json: ${messages.size} messages, current`);
    process.exit(0);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, json);
  fs.writeFileSync(path.join(ROOT, 'locales/context.json'), JSON.stringify(context));
  console.log(`locales/en.json: ${messages.size} messages`);
}
