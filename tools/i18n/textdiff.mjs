#!/usr/bin/env node
// Two tours' words compared (tools/i18n/tour.mjs): what one build showed that the other did not, state by
// state, with numbers, clock times and names (translate="no", species links) masked, since two runs' worlds
// differ. The chronicler's log and the specimen's live readouts differ between runs too: their states are
// compared for the static words around them; their prose is checked by the modules' differential tests.
//   node tools/i18n/textdiff.mjs runs/i18n/base runs/i18n/after [--all]
import fs from 'node:fs'; import path from 'node:path';
const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const all = process.argv.includes('--all');
// --union: every state's words together (two runs' worlds differ in which states show what)
const union = process.argv.includes('--union');
const load = (d) => JSON.parse(fs.readFileSync(path.join(d, 'texts.json'), 'utf8')).states;
let A = load(a), B = load(b);
if (union) { const u = (S) => ({ all: Object.values(S).flat() }); A = u(A); B = u(B); }
// what varies from run to run: numbers, times, names. A word no message holds is a name (species and genera
// are made up), masked as *, except words that betray a bug
const vocab = new Set();
for (const m of Object.values(JSON.parse(fs.readFileSync(new URL('../../locales/en.json', import.meta.url), 'utf8')))) for (const w of m.match(/\p{L}+/gu) || []) vocab.add(w.toLowerCase());
const BUG = /^(undefined|null|nan|object|function|infinity)$/i;
const mask = (s) => s.replace(/[⁣​‌‍⁠]/g, '').replace(/\d[\d,.:]*/g, '#').replace(/#\s*(?:[kM]|µm|mm|ms|s|°|%)\b/g, '#u')
  .replace(/\p{L}+/gu, (w) => (vocab.has(w.toLowerCase()) || BUG.test(w) ? w : '*')).replace(/\*(?:[\s-]*\*)+/g, '*').trim();
// rows that are the world's own, not the page's words: the log, names, live numbers
const volatile = (r) => r.name || /#feed|\.feed|#caption|#flash|#chart|#ov-census|canvas#chart|#spec-name|#linked-h|#era\b|#event-v|#world-sum|mind|\.mv-/.test(r.el);
const bag = (rows) => { const m = new Map(); for (const r of rows) { if (!all && volatile(r)) continue; const k = (r.attr ? `[${r.attr}] ` : '') + mask(r.s); m.set(k, (m.get(k) || 0) + 1); } return m; };
let diffs = 0;
for (const st of [...new Set([...Object.keys(A), ...Object.keys(B)])]) {
  if (!A[st] || !B[st]) { console.log(`${st}: only in ${A[st] ? a : b}`); continue; }
  const x = bag(A[st]), y = bag(B[st]);
  const only = (p, q) => [...p.keys()].filter((k) => !q.has(k));
  const ox = only(x, y), oy = only(y, x);
  if (!ox.length && !oy.length) continue;
  diffs += ox.length + oy.length;
  console.log(`\n${st}`);
  for (const k of ox) console.log(`  - ${k}`);
  for (const k of oy) console.log(`  + ${k}`);
}
console.log(diffs ? `\n${diffs} differences` : 'no differences');
process.exit(diffs ? 1 : 0);
