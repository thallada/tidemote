// Unpaired mature-phase comparison (t in [t0, t1]): per-run means of totals and per-capita guild rates,
// candidate mean as % of reference with a 95% interval (Welch). Usage: mature.cjs t0 t1 ref cand...
const fs = require('fs'), path = require('path');
const [t0, t1, ref, ...cands] = process.argv.slice(2);
const G = ['producer', 'grazer', 'predator', 'scavenger'];
function metrics(file) {
  const ss = JSON.parse(fs.readFileSync(file)).samples.filter((s) => s.t >= +t0 && s.t <= +t1);
  const m = {}; const av = (f) => ss.reduce((a, s) => a + f(s), 0) / ss.length;
  m.living = av((s) => s.living); m.silt = av((s) => s.silt); m.glint = av((s) => s.glint); m.husk = av((s) => s.husk);
  m.effSpecies = av((s) => s.effSpecies); m.hill2 = av((s) => s.hill2); m.bodies = av((s) => s.bodies);
  for (const k of ['births', 'starved', 'oldAge', 'kills', 'grazes', 'scavenges', 'bites', 'mutants', 'extinctions']) m[k + '/liv'] = av((s) => s.rates[k]) / m.living;
  for (const g of G) {
    const pop = av((s) => s.living * (s.diet[g] || 0)); m[g + '.share'] = pop / m.living;
    if (pop < 30) continue;
    for (const e of ['births', 'starved', 'oldAge', 'eaten']) m[`${g}.${e}/cap`] = av((s) => s.demography[g][e]) / pop;
    m[`${g}.light/cap`] = av((s) => s.energy[g].light) / pop; m[`${g}.upkeep/cap`] = av((s) => s.energy[g].upkeep) / pop;
  }
  for (const k of ['photo', 'swim', 'advect', 'adhesion', 'size', 'lifespan', 'reproE', 'dFlesh', 'dGlint', 'dHusk']) m['trait.' + k] = av((s) => s.traits[k]);
  for (const k of ['sessile', 'crawler', 'swimmer', 'drifter']) m['move.' + k] = av((s) => s.movement[k]);
  return m;
}
const load = (d) => fs.readdirSync(d).filter((f) => /^seed\d+\.json$/.test(f)).map((f) => metrics(path.join(d, f)));
const R = load(ref), C = cands.map(load);
const keys = [...new Set(R.flatMap((r) => Object.keys(r)))];
const st = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return [m, xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length]; };
console.log('metric'.padEnd(24) + 'ref'.padStart(9) + cands.map((c) => path.basename(c).slice(0, 14).padStart(16)).join(''));
for (const k of keys) {
  const rx = R.map((r) => r[k]).filter((x) => x != null); if (rx.length < 8) continue;
  const [rm, rv] = st(rx); if (!rm) continue;
  console.log(k.padEnd(24) + (Math.abs(rm) < 10 ? rm.toFixed(3) : rm.toFixed(0)).padStart(9) + C.map((c) => {
    const cx = c.map((r) => r[k]).filter((x) => x != null); if (cx.length < 8) return ''.padStart(16);
    const [cm, cv] = st(cx); const d = (cm - rm) / rm, h = 1.96 * Math.sqrt(rv + cv) / Math.abs(rm);
    return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}±${(h * 100).toFixed(1)}${Math.abs(d) > h ? '*' : ' '}`.padStart(16);
  }).join(''));
}
