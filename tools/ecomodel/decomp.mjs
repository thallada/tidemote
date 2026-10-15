// The identity behind guild sizes, per ensemble (docs/ecosystem.md): awake animals over producers =
// sum over animal guilds of (income / producer light) x (producer income per cell / animal income per cell).
//   node tools/ecomodel/decomp.mjs runs/A runs/B ...
// N_a/N_p = r_a * (c_p / c_a): r = guild income / producer light, c = income per awake cell (= cost per cell at steady state)
import fs from 'node:fs';
const A = ['grazer', 'predator', 'scavenger'];
const med = (v) => { v = v.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : NaN; };
console.log('set              late%  | animals/producers: measured  model | routing r: graz  pred  scav | cost ratio c_p/c_a: graz pred scav | prod upkeep% | life min: P   G   H   S');
for (const d of process.argv.slice(2)) {
  const R = fs.readdirSync(d).filter((f) => /^seed\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(d + '/' + f)));
  const out = [];
  for (const r of R) {
    const S = r.samples, T = S.at(-1).t, late = S.filter((s) => s.t > T * 0.5);
    const m = (f) => late.reduce((a, s) => a + f(s), 0) / late.length;
    const N = (g) => m((s) => Math.max(0, s.diet[g] * s.living - (s.dormant?.[g] ?? 0)));
    const inc = (g) => m((s) => { const e = s.energy?.[g] || {}; return (e.light || 0) + (e.glint || 0) + (e.plant || 0) + (e.husk || 0) + (e.flesh || 0); });
    const L = inc('producer'), Np = N('producer'), cp = L / Np;
    const o = { meas: A.reduce((a, g) => a + N(g), 0) / Np, model: 0, upP: m((s) => s.energy.producer.upkeep) / L };
    for (const g of A) { const n = N(g); o['r' + g] = inc(g) / L; o['c' + g] = n > 20 ? cp / (inc(g) / n) : NaN; o.model += o['r' + g] * (n > 20 ? o['c' + g] : 0); }
    for (const g of ['producer', ...A]) { const dm = (k) => m((s) => s.demography[g][k]); o['L' + g] = N(g) / Math.max(dm('starved') + dm('oldAge') + dm('eaten'), 1e-9); }
    out.push(o);
  }
  const q = (k) => med(out.map((o) => o[k]));
  console.log(`${d.replace('runs/', '').padEnd(16)} ${String(R[0].samples.at(-1).t / 60 | 0).padStart(3)}m  |       ${q('meas').toFixed(2).padStart(5)}  ${q('model').toFixed(2).padStart(5)} |   ${A.map((g) => q('r' + g).toFixed(3)).join(' ')} |  ${A.map((g) => q('c' + g).toFixed(2).padStart(4)).join(' ')} |   ${(100 * q('upP')).toFixed(0).padStart(4)} | ${['producer', ...A].map((g) => q('L' + g).toFixed(1)).join(' ')}`);
}
