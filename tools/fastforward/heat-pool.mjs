// Long-run ensembles side by side, ecology and heat: late-phase means with standard errors, and for runs
// that share seeds the paired difference of each set from the first (mean ± 2 se over seeds).
// Usage: node tools/fastforward/heat-pool.mjs runs/A runs/B ...  (each a directory with report.json)
import fs from 'node:fs';
const sets = process.argv.slice(2).map((d) => ({ name: d.split('/').filter(Boolean).at(-1), runs: JSON.parse(fs.readFileSync(`${d}/report.json`, 'utf8')).runs }));
const KEYS = [
  ['lateEffSpecies', (r) => r.lateEffSpecies], ['lateHill2', (r) => r.lateHill2], ['lateLivingFrac', (r) => r.lateLivingFrac],
  ['notableSpecies', (r) => r.notableSpecies], ['leaderChanges', (r) => r.leaderChanges], ['foodWeb', (r) => +r.foodWeb],
  ['persisted', (r) => +r.persisted], ['lateGuilds', (r) => r.lateGuilds],
  ['tbg', (r) => r.thermal?.tbg], ['felt', (r) => r.thermal?.felt], ['felt-tbg', (r) => r.thermal && r.thermal.felt - r.thermal.tbg],
  ['feltSpread', (r) => r.thermal?.feltSpread], ['toptSD', (r) => r.thermal?.toptSD], ['lag', (r) => r.thermal?.lag], ['tolMean', (r) => r.thermal?.tolMean],
  ['torpid', (r) => r.thermal?.torpid], ['torpidPeak', (r) => r.thermal?.torpidPeak], ['makers', (r) => r.thermal?.makers],
  ['scalded/min', (r) => r.thermal?.scalded], ['scaldTotal', (r) => r.thermal?.scaldTotal],
  ['framboids', (r) => r.thermal?.framboids], ['framboidsMade', (r) => r.thermal?.framboidsMade],
  ['hotFrac', (r) => r.thermal?.hotFrac], ['fieldP99', (r) => r.thermal?.fieldP99],
];
const ok = (x) => x != null && Number.isFinite(x);
const ms = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); return [m, sd / Math.sqrt(xs.length)]; };
const f = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(3));
console.log('metric'.padEnd(16) + sets.map((s) => `${s.name} (${s.runs.length})`.padStart(22)).join('') + sets.slice(1).map((s) => `${s.name}-${sets[0].name}`.padStart(26)).join(''));
for (const [k, get] of KEYS) {
  let line = k.padEnd(16);
  for (const s of sets) { const xs = s.runs.map(get).filter(ok); line += (xs.length ? `${f(ms(xs)[0])}±${f(ms(xs)[1])}` : 'n/a').padStart(22); }
  const base = new Map(sets[0].runs.map((r) => [r.seed, get(r)]));
  for (const s of sets.slice(1)) {
    const ds = s.runs.filter((r) => ok(get(r)) && ok(base.get(r.seed))).map((r) => get(r) - base.get(r.seed));
    if (ds.length < 3) { line += 'n/a'.padStart(26); continue; }
    const [m, se] = ms(ds);
    line += `${m >= 0 ? '+' : ''}${f(m)}±${f(2 * se)}${Math.abs(m) > 2 * se ? '*' : ' '} (${ds.length})`.padStart(26);
  }
  console.log(line);
}
// outcome mixes
for (const s of sets) {
  const c = {};
  for (const r of s.runs) c[r.outcome] = (c[r.outcome] || 0) + 1;
  console.log(`${s.name}: ${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ×${n}`).join(', ')}`);
}
