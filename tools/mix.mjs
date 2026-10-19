// How well run sets keep a good mix of body types (samples' bodies, src/bodies.js), averaged over each
// world's last ten minutes, against target bands: mostly single cells, some packed bodies, some trees, a few
// trees big enough to see, and a long one now and then.
//   node tools/mix.mjs runs/A runs/B ...
import fs from 'node:fs';
import path from 'node:path';

// shares of the living (lo, hi), and the share of worlds that should show a long tree (20+ cells)
export const MIX_BANDS = {
  single: [0.6, 0.85],     // single cells: the bulk of life in real water
  packed: [0.05, 0.2],     // clumps and mats
  trees: [0.05, 0.2],      // chains, filaments and branched trees of every size
  visible: [0.02, 0.12],   // trees of 6+ cells (filaments and branched)
};
export const LONG_WORLDS = 0.3;

/** One world's mix over its last `span` seconds (null if it never sampled bodies). */
export function worldMix(run, span = 600) {
  const s = run.samples.filter((x) => x.bodies && x.t >= run.samples.at(-1).t - span);
  if (!s.length) return null;
  const avg = (f) => s.reduce((a, x) => a + f(x.bodies), 0) / s.length;
  return { single: avg((b) => b.single), packed: avg((b) => b.clump + b.mat), trees: avg((b) => b.chain + b.filament + b.branched),
    visible: avg((b) => b.filament + b.branched), long: s.some((x) => x.bodies.long > 0), maxTree: Math.max(...s.map((x) => x.bodies.maxTree)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  console.log(`bands: ${Object.entries(MIX_BANDS).map(([k, [lo, hi]]) => `${k} ${pct(lo)}-${pct(hi)}`).join(', ')}; a long tree in ${pct(LONG_WORLDS)}+ of worlds`);
  for (const dir of process.argv.slice(2)) {
    const ws = fs.readdirSync(dir).filter((f) => /^seed\d+\.json$/.test(f)).map((f) => worldMix(JSON.parse(fs.readFileSync(path.join(dir, f))))).filter(Boolean);
    if (!ws.length) { console.log(`${dir}: no body samples`); continue; }
    const mean = (k) => ws.reduce((a, w) => a + w[k], 0) / ws.length;
    const inBand = (w, k) => w[k] >= MIX_BANDS[k][0] && w[k] <= MIX_BANDS[k][1];
    const all = ws.filter((w) => Object.keys(MIX_BANDS).every((k) => inBand(w, k))).length;
    const long = ws.filter((w) => w.long).length / ws.length;
    const med = [...ws.map((w) => w.maxTree)].sort((a, b) => a - b)[ws.length >> 1];
    console.log(`${dir.padEnd(14)} ${ws.length} worlds  ` + Object.keys(MIX_BANDS).map((k) => `${k} ${pct(mean(k))} (${ws.filter((w) => inBand(w, k)).length}/${ws.length} in band)`).join('  ')
      + `  long-tree worlds ${pct(long)}${long >= LONG_WORLDS ? '' : ' (low)'}  largest tree median ${med}  all bands ${all}/${ws.length}`);
  }
}
