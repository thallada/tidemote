// Functional responses measured from ensembles: per run and per 5-minute window, a grazer's intake against
// producer density, a hunter's kills against prey density, a scavenger's husk intake against husk density.
// If the mean-field model's responses hold, the points of every world fall on one curve per guild.
//   node tools/ecomodel/responses.mjs runs/A runs/B ...  (prints binned medians per set)
import fs from 'node:fs';
const N0 = 32768, W = 300;
const pts = [];
for (const dir of process.argv.slice(2).filter((a, i, all) => a !== '--json' && all[i - 1] !== '--json')) {
  const R = fs.readdirSync(dir).filter((f) => /^seed\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(dir + '/' + f)));
  for (const r of R) for (let t0 = 120; t0 + W <= r.samples.at(-1).t + 1; t0 += W) {
    const w = r.samples.filter((s) => s.t >= t0 && s.t < t0 + W);
    const m = (f) => w.reduce((a, s) => a + f(s), 0) / w.length;
    const N = (g) => m((s) => Math.max(0, s.diet[g] * s.living - (s.dormant?.[g] ?? 0)));
    const P = N('producer'), G = N('grazer'), H = N('predator'), S = N('scavenger');
    const D = m((s) => s.husk);
    pts.push({ set: dir.replace('runs/', ''), run: r.seed, t: t0 / 60,
      P: P / N0, G: G / N0, H: H / N0, S: S / N0, D: D / N0,
      intakeG: G > 30 ? m((s) => s.energy.grazer.plant) / G : NaN,
      killsH: H > 30 ? m((s) => s.meals.predator.grazer + s.meals.predator.scavenger + s.meals.predator.predator) / H : NaN,
      intakeS: S > 30 ? m((s) => s.energy.scavenger.husk) / S : NaN,
      living: m((s) => s.living) / N0, silt: m((s) => s.silt) / N0,
      ...Object.fromEntries([['P', 'producer'], ['G', 'grazer'], ['H', 'predator'], ['S', 'scavenger']].flatMap(([k, g]) => {
        const n = N(g); if (n < 30) return [];
        const e = (x) => m((s) => s.energy[g][x]), d = (x) => m((s) => s.demography[g][x]);
        return [['inc' + k, (e('light') + e('glint') + e('plant') + e('husk') + e('flesh')) / n], ['u' + k, e('upkeep') / n],
          ['b' + k, e('children') / Math.max(d('births'), 1e-9)], ['birth' + k, d('births') / n], ['old' + k, d('oldAge') / n],
          ['eaten' + k, d('eaten') / n], ['starved' + k, d('starved') / n]];
      })),
      killG: m((s) => s.meals.predator.grazer) / N0, killS: m((s) => s.meals.predator.scavenger) / N0, killHH: m((s) => s.meals.predator.predator) / N0,
      // every eater's kills of every animal guild (cells per minute per slot): meals[eater][victim]
      ...Object.fromEntries(['grazer', 'predator', 'scavenger', 'omnivore'].flatMap((e) => ['grazer', 'predator', 'scavenger', 'omnivore'].map((v) => [`m_${e[0]}${v[0]}`, m((s) => s.meals?.[e]?.[v] ?? 0) / N0]))),
      O: N('omnivore') / N0,
      // each guild's mean genome traits (guildTraits, logged since ff1a6a5), for adaptive dynamics
      ...Object.fromEntries([['P', 'producer'], ['G', 'grazer'], ['H', 'predator'], ['S', 'scavenger']].flatMap(([k, g]) =>
        ['swim', 'size', 'lifespan', 'advect', 'reproE', 'share', 'force', 'radius', 'adhesion'].map((t) => [`z${k}_${t}`, m((s) => s.guildTraits?.[g]?.[t] ?? NaN)]))) });
  }
}
// the measured rate of change of each awake density: from this window to the next of the same run
for (let i = 0; i + 1 < pts.length; i++) {
  const a = pts[i], b = pts[i + 1];
  if (a.set !== b.set || a.run !== b.run || b.t !== a.t + W / 60) continue;
  for (const k of ['P', 'G', 'H', 'S', 'D']) a['r' + k] = a[k] > 0 && b[k] > 0 ? Math.log(b[k] / a[k]) / (W / 60) : NaN;
}
const jsonAt = process.argv.indexOf('--json');
if (jsonAt >= 0) { fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(pts)); process.exit(0); }
const med = (v) => { v = v.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : NaN; };
const show = (title, x, y, edges) => {
  console.log(`\n${title}`);
  const sets = [...new Set(pts.map((p) => p.set))];
  console.log('bin'.padEnd(14) + sets.map((s) => s.padStart(14)).join(''));
  for (let i = 0; i + 1 < edges.length; i++) {
    const row = sets.map((s) => { const v = pts.filter((p) => p.set === s && x(p) >= edges[i] && x(p) < edges[i + 1]).map(y); return v.length >= 3 ? `${med(v).toFixed(2)} (${v.length})` : ''; });
    console.log(`${edges[i].toFixed(3)}-${edges[i + 1].toFixed(3)}`.padEnd(14) + row.map((c) => c.padStart(14)).join(''));
  }
};
show('grazer intake per cell (plant energy/min) by producer density', (p) => p.P, (p) => p.intakeG, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8]);
show('hunter kills per cell per min by prey density (G+S+H)', (p) => p.G + p.S + p.H, (p) => p.killsH, [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6]);
show('scavenger husk intake per cell by husk density', (p) => p.D, (p) => p.intakeS, [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.3]);
