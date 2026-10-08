// Paired-by-seed fidelity table: early window [t0, t1] means per run; each candidate's mean relative
// difference from the reference across seeds with a 95% t interval. Usage: paired-early.cjs t0 t1 refDir candDir... [--all]
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), all = args.includes('--all');
const [t0, t1, ref, ...cands] = args.filter((a) => a !== '--all');
const G = ['producer', 'grazer', 'predator', 'scavenger', 'omnivore'];
function metrics(file) {
  const ss = JSON.parse(fs.readFileSync(file)).samples.filter((s) => s.t >= +t0 && s.t <= +t1);
  const m = {}; const add = (k, v) => { if (Number.isFinite(v)) m[k] = (m[k] || 0) + v / ss.length; };
  for (const s of ss) {
    add('living', s.living); add('silt', s.silt); add('glint', s.glint); add('husk', s.husk); add('stone', s.stone);
    add('effSpecies', s.effSpecies); add('hill2', s.hill2); add('species', s.species);
    for (const [k, v] of Object.entries(s.rates)) add(k, v);
    for (const g of G) { add(`${g}.pop`, s.living * (s.diet[g] || 0)); for (const [e, v] of Object.entries(s.demography[g])) add(`${g}.${e}`, v); add(`${g}.light`, s.energy[g].light); add(`${g}.upkeep`, s.energy[g].upkeep); }
  }
  const r = (a, b) => (m[b] ? m[a] / m[b] : undefined);
  if (m['dg.opportunities'] != null) {
    m['x.foodInReach'] = r('dg.foodInReach', 'dg.opportunities');
    m['x.matterWin'] = r('dg.matterWon', 'dg.matterTried');
    m['x.livingWin'] = r('dg.livingWon', 'dg.livingTried');
    m['x.readyNoSilt'] = r('dg.readyNoSilt', 'dg.readySteps');
    m['x.perCapBirths'] = m.births / m.living;
  }
  return m;
}
const load = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((f) => /^seed\d+\.json$/.test(f)).map((f) => [f, metrics(path.join(dir, f))]));
const R = load(ref), C = cands.map(load), seeds = Object.keys(R);
const keys = Object.keys(R[seeds[0]]).filter((k) => all || !/^(omnivore|stone)/.test(k));
console.log('metric'.padEnd(22) + 'ref'.padStart(10) + cands.map((c) => path.basename(c).slice(0, 15).padStart(17)).join(''));
for (const k of keys) {
  const rm = seeds.reduce((a, s) => a + (R[s][k] ?? 0), 0) / seeds.length;
  if (!rm) continue;
  console.log(k.padEnd(22) + (Math.abs(rm) < 10 ? rm.toFixed(3) : rm.toFixed(0)).padStart(10) + C.map((c) => {
    const d = seeds.filter((s) => c[s] && c[s][k] != null && R[s][k] != null).map((s) => (c[s][k] - R[s][k]) / rm);
    if (d.length < 3) return ''.padStart(17);
    const mu = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - mu) ** 2, 0) / (d.length - 1)), h = 2.04 * sd / Math.sqrt(d.length);
    return `${mu >= 0 ? '+' : ''}${(mu * 100).toFixed(1)}±${(h * 100).toFixed(1)}${Math.abs(mu) > h ? '*' : ' '}`.padStart(17);
  }).join(''));
}
