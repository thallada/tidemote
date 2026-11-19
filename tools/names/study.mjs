// How the genome names (src/names.js) fall on real worlds' species (tools/names/dump.mjs registries), beside the
// names the worlds gave them: genera and names per world, parent-to-child genus changes and what changed, names
// two genomes share, the genera worlds share, alike pairs across worlds against random ones, and the cost.
// usage: node tools/names/study.mjs runs/names/w*.json
import fs from 'node:fs';
import { speciesName, bodyPlan } from '../../src/names.js';

const files = process.argv.slice(2);
const worlds = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')).reg);
const gdist = (a, b) => {
  let s = 0;
  for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) s += (a.roles[r].surf[i] - b.roles[r].surf[i]) ** 2 + (a.roles[r].rec[i] - b.roles[r].rec[i]) ** 2;
  let d = Math.sqrt(s / 48);
  d += 0.5 * (Math.abs(a.dGlint - b.dGlint) + Math.abs(a.dHusk - b.dHusk) + Math.abs(a.dFlesh - b.dFlesh));
  d += 0.4 * Math.abs(a.photo - b.photo) + 0.15 * Math.abs(a.swim - b.swim) + 0.3 * Math.abs((a.adhesion || 0) - (b.adhesion || 0));
  const dh = Math.abs(a.hue - b.hue);
  return d + Math.min(dh, 1 - dh);
};
const pct = (a, b) => `${((100 * a) / Math.max(b, 1)).toFixed(1)}%`;
const entropy = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); let h = 0; for (const v of m.values()) { const p = v / xs.length; h -= p * Math.log2(p); } return h; };
const t0 = performance.now();
let calls = 0;
for (const reg of worlds) for (const s of reg) { s.nu = speciesName(s.genome); s.nu.name = `${s.nu.genus} ${s.nu.epithet}`; calls++; }
const ms = (performance.now() - t0) / calls;
console.log(`speciesName: ${(ms * 1000).toFixed(1)} µs a call (first call builds the genus table)\n`);
console.log('world  species  established | genera old  new | names-shared old  new | genus flips old  new | genus entropy (est.) old  new');
const flipWhy = {};
worlds.forEach((reg, w) => {
  const by = new Map(reg.map((s) => [s.serial, s]));
  const est = reg.filter((s) => s.established);
  const oldG = new Set(reg.map((s) => s.genus)), newG = new Set(reg.map((s) => s.nu.genus));
  const dup = (key) => { const m = new Map(); let d = 0; for (const s of reg) { const k = key(s); const h = s.nu.hash; if (m.has(k) && m.get(k) !== h) d++; else m.set(k, h); } return d; };
  let pairs = 0, fo = 0, fn = 0;
  for (const s of reg) {
    const p = by.get(s.parent);
    if (!p) continue;
    pairs++;
    if (p.genus !== s.genus) fo++;
    if (p.nu.genus !== s.nu.genus) {
      fn++;
      const a = p.nu.plan, b = s.nu.plan;
      for (const k of ['diet', 'mobility', 'form', 'types', 'shape']) if (a[k] !== b[k]) flipWhy[k] = (flipWhy[k] || 0) + 1;
    }
  }
  console.log(`w${w + 1}   ${String(reg.length).padStart(6)}  ${String(est.length).padStart(6)}      | ${String(oldG.size).padStart(6)} ${String(newG.size).padStart(5)} | ${String(dup((s) => s.name)).padStart(9)} ${String(dup((s) => s.nu.name)).padStart(5)} | ${pct(fo, pairs).padStart(10)} ${pct(fn, pairs).padStart(6)} | ${entropy(est.map((s) => s.genus)).toFixed(2).padStart(10)} ${entropy(est.map((s) => s.nu.genus)).toFixed(2).padStart(5)}`);
});
const flips = Object.values(flipWhy).reduce((a, b) => a + b, 0);
console.log(`\nwhat changed when a child's genus did (a flip can change several): ${Object.entries(flipWhy).map(([k, v]) => `${k} ${pct(v, flips)}`).join(', ')}`);

// one long world: every registry together, as if kept unpruned in one place
const all = worlds.flat();
const m = new Map(); let clash = 0, same = 0;
for (const s of all) { const h = m.get(s.nu.name); if (h && h !== s.nu.hash) clash++; else if (h) same++; else m.set(s.nu.name, s.nu.hash); }
console.log(`all ${all.length} species as one registry: ${clash} names two different genomes share; ${same} genomes met twice (the same name, rightly)`);

// across worlds: the genera they share, and alike pairs against random ones
const est = worlds.map((reg) => reg.filter((s) => s.established));
let jac = 0, jn = 0;
for (let i = 0; i < est.length; i++) for (let j = i + 1; j < est.length; j++) {
  const A = new Set(est[i].map((s) => s.nu.genus)), B = new Set(est[j].map((s) => s.nu.genus));
  let n = 0; for (const x of A) if (B.has(x)) n++;
  jac += n / (A.size + B.size - n); jn++;
  const Ao = new Set(est[i].map((s) => s.genus)), Bo = new Set(est[j].map((s) => s.genus));
  let no = 0; for (const x of Ao) if (Bo.has(x)) no++;
  if (i === 0 && j === 1) console.log(`w1 and w2 share ${n} of ${A.size}/${B.size} established genera (the old names: ${no} of ${Ao.size}/${Bo.size})`);
}
console.log(`mean Jaccard of established genera between worlds: ${(jac / jn).toFixed(2)}`);
const rnd = (() => { let a = 7; return () => ((a = Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
const bins = [[0, 0.3], [0.3, 0.6], [0.6, 1], [1, 9]];
const B = bins.map(() => ({ n: 0, same: 0, sameOld: 0 }));
for (let t = 0; t < 400000; t++) {
  const i = Math.floor(rnd() * est.length), j = Math.floor(rnd() * est.length);
  if (i === j || !est[i].length || !est[j].length) continue;
  const a = est[i][Math.floor(rnd() * est[i].length)], b = est[j][Math.floor(rnd() * est[j].length)];
  const d = gdist(a.genome, b.genome), k = bins.findIndex(([lo, hi]) => d >= lo && d < hi);
  B[k].n++; if (a.nu.genus === b.nu.genus) B[k].same++; if (a.genus === b.genus) B[k].sameOld++;
}
console.log('established pairs from different worlds, by genetic distance: share a genus (new; old)');
bins.forEach(([lo, hi], k) => console.log(`  gdist ${lo}-${hi === 9 ? '∞' : hi}: ${pct(B[k].same, B[k].n).padStart(6)}  ${pct(B[k].sameOld, B[k].n).padStart(6)}   of ${B[k].n}`));
console.log('\nsome names:', est[0].slice(0, 12).map((s) => `${s.nu.genus} ${s.nu.epithet}`).join(', '));
