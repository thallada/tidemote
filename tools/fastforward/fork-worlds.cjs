// One line per fork world: its start (living, guild mix), how crowded its animals are at the first variant
// (K.diag crowd and overlap, the most crowded guild), heat (felt over the background, field), and each
// other variant's paired deviation in births, kills, starvation and end living.
// Usage: node tools/fastforward/fork-worlds.cjs file.json...
const fs = require('fs');
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(f));
  const names = r.config.variants.map((v) => v.name);
  const b = r.forks.filter((x) => x.variant === names[0]);
  const mean = (xs, g) => xs.reduce((a, x) => a + g(x), 0) / xs.length;
  const s = r.start;
  const mix = ['producer', 'grazer', 'predator', 'scavenger'].map((g) => `${g[0]}${Math.round((100 * s[g]) / s.living)}`).join(' ');
  let crowd = 0, cg = '-';
  for (const g of ['grazer', 'predator', 'scavenger', 'omnivore']) { const c = mean(b, (x) => x.diag?.[g]?.crowd || 0); if (c > crowd) { crowd = c; cg = g[0]; } }
  const heat = !b[0].thermal?.felt ? 'heat off' : `felt+${mean(b, (x) => x.thermal.felt.mean - x.thermal.tbg).toFixed(1)} fld${mean(b, (x) => x.thermal.field.mean).toFixed(1)}/${mean(b, (x) => x.thermal.field.max).toFixed(0)} tbg${mean(b, (x) => x.thermal.tbg).toFixed(0)}`;
  const dev = names.slice(1).map((v) => {
    const d = (k, end) => { const bm = mean(b, (x) => (end ? x.end[k] : x.rates[k])); return mean(b, (x) => { const o = r.forks.find((y) => y.rep === x.rep && y.variant === v); return ((end ? o.end[k] : o.rates[k]) - (end ? x.end[k] : x.rates[k])) / bm; }); };
    return `${v}: b${pct(d('births'))} k${pct(d('kills'))} s${pct(d('starved'))} L${pct(d('living', true))}`;
  }).join('  ');
  console.log(`${f.split('/').at(-1).replace('.json', '').padEnd(12)} L${String(Math.round(s.living)).padStart(6)} ${mix.padEnd(18)} crowd ${cg}${crowd.toFixed(0).padStart(4)}  ${heat.padEnd(28)} ${dev}`);
}
