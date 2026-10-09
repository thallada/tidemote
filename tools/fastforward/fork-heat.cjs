// Heat in fork runs (tools/fork.mjs): for each world, the paired difference of each variant from the first
// in what the living felt (mean, °), torpor and heat-makers (shares), the water's field (mean and spread of
// its departure from the background, 99th percentile, °; share of cells over +2°), scalding and framboids
// grown (per minute, relative), and framboids standing at the end; across worlds, the mean difference, how
// many worlds moved significantly each way, and the world-to-world spread.
// Usage: node tools/fastforward/fork-heat.cjs file.json...
const fs = require('fs');
const files = process.argv.slice(2).filter((a) => a.endsWith('.json'));
const METRICS = {
  felt: [(f) => f.thermal?.felt?.mean, 'abs', '°'],
  torpid: [(f) => f.thermal?.torpidFrac, 'abs', ''],
  makers: [(f) => f.thermal?.makerFrac, 'abs', ''],
  fieldMean: [(f) => f.thermal?.field?.mean, 'abs', '°'],
  fieldSd: [(f) => f.thermal?.field?.sd, 'abs', '°'],
  fieldP99: [(f) => f.thermal?.field?.p99, 'abs', '°'],
  hotFrac: [(f) => f.thermal?.field?.hotFrac, 'abs', ''],
  scalded: [(f) => f.rates.scalded, 'rel', '%'],
  framboidsMade: [(f) => f.rates.framboidsMade, 'rel', '%'],
  framboids: [(f) => f.end.framboids, 'rel', '%'],
};
const per = {};
const base = {};
let variants = null;
for (const file of files) {
  const r = JSON.parse(fs.readFileSync(file));
  const names = r.config.variants.map((v) => v.name);
  variants ??= names;
  const b = r.forks.filter((x) => x.variant === names[0]);
  for (const [k, [get, mode]] of Object.entries(METRICS)) {
    const vals = b.map(get);
    if (vals.some((x) => x == null)) continue;
    const bm = vals.reduce((a, c) => a + c, 0) / vals.length;
    (base[k] ??= []).push(bm);
    if (mode === 'rel' && !(bm > 5)) continue; // too rare in this world to judge
    for (const v of names.slice(1)) {
      const ds = b.map((x) => {
        const o = r.forks.find((y) => y.rep === x.rep && y.variant === v);
        return mode === 'rel' ? (get(o) - get(x)) / bm : get(o) - get(x);
      });
      const mu = ds.reduce((a, c) => a + c, 0) / ds.length;
      const sd = Math.sqrt(ds.reduce((a, c) => a + (c - mu) ** 2, 0) / Math.max(1, ds.length - 1));
      ((per[v] ??= {})[k] ??= []).push({ mu, h: 2.1 * sd / Math.sqrt(ds.length) });
    }
  }
}
const fmt = (x, mode) => (mode === 'rel' ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%` : `${x >= 0 ? '+' : ''}${x.toFixed(3)}`);
console.log(`${files.length} worlds; base = ${variants?.[0]}`);
console.log('metric'.padEnd(15) + 'base mean'.padStart(11) + (variants || []).slice(1).map((v) => `${v}: mean  up/dn  spread`.padStart(30)).join(''));
for (const [k, [, mode]] of Object.entries(METRICS)) {
  if (!base[k]) continue;
  const bm = base[k].reduce((a, c) => a + c, 0) / base[k].length;
  let line = k.padEnd(15) + bm.toFixed(3).padStart(11);
  for (const v of (variants || []).slice(1)) {
    const xs = per[v]?.[k] || [];
    if (!xs.length) { line += 'n/a'.padStart(30); continue; }
    const m = xs.reduce((a, c) => a + c.mu, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, c) => a + (c.mu - m) ** 2, 0) / Math.max(1, xs.length - 1));
    const up = xs.filter((x) => x.mu > x.h).length, dn = xs.filter((x) => x.mu < -x.h).length;
    line += `${fmt(m, mode)}  ${up}/${dn}  ${fmt(sd, mode).replace('+', '±')}`.padStart(30);
  }
  console.log(line);
}
