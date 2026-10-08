// Cross-world summary of fork runs: for each world, the paired mean relative difference of each variant
// from the first (rates per minute, and population counts at the fork's end); across worlds, the mean of
// those, how many worlds were significantly up / down, and the world-to-world spread.
// Usage: meta.cjs file.json... [--keys a,b,c]
const fs = require('fs');
const args = process.argv.slice(2);
const ki = args.indexOf('--keys');
const want = ki >= 0 ? args[ki + 1].split(',') : null;
const files = args.filter((a, i) => a.endsWith('.json') && i !== ki + 1);
const per = {}; // variant -> key -> [{mu, h, base}]
let variants = null;
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f));
  const names = r.config.variants.map((v) => v.name);
  variants ??= names;
  // names like "m4:X" compare with "m1:X" (the same tunables in 1/60 s steps); others with the first
  const baseOf = (v) => (v.includes(':') && names.includes('m1:' + v.split(':')[1]) ? 'm1:' + v.split(':')[1] : names[0]);
  const val = (fk, k) => (k.startsWith('end.') ? fk.end[k.slice(4)] : fk.rates[k]);
  const keys = [...Object.keys(r.forks[0].rates), ...Object.keys(r.forks[0].end).map((k) => 'end.' + k)];
  for (const v of names.filter((n) => !n.startsWith('m1:') && n !== names[0])) {
    const base = baseOf(v);
    for (const k of keys) {
      if (want && !want.includes(k)) continue;
      const b = r.forks.filter((x) => x.variant === base);
      const bm = b.reduce((a, x) => a + val(x, k), 0) / b.length;
      if (!(bm > 20)) continue; // too rare in this world to judge
      const ds = b.map((x) => { const o = r.forks.find((y) => y.rep === x.rep && y.variant === v); return (val(o, k) - val(x, k)) / bm; });
      const mu = ds.reduce((a, c) => a + c, 0) / ds.length;
      const sd = Math.sqrt(ds.reduce((a, c) => a + (c - mu) ** 2, 0) / Math.max(1, ds.length - 1));
      ((per[v] ??= {})[k] ??= []).push({ mu, h: 2.1 * sd / Math.sqrt(ds.length) });
    }
  }
}
for (const v of variants.filter((n) => per[n])) {
  console.log(`\n${v} vs ${v.includes(':') ? 'm1:' + v.split(':')[1] : variants[0]} over ${files.length} worlds (worlds where the rate is too rare are skipped)`);
  console.log('rate'.padEnd(22) + 'worlds'.padStart(7) + 'mean'.padStart(9) + 'median'.padStart(9) + 'sd'.padStart(8) + '  up/down');
  for (const [k, xs] of Object.entries(per[v] || {})) {
    const ms = xs.map((x) => x.mu * 100).sort((a, b) => a - b);
    const mean = ms.reduce((a, c) => a + c, 0) / ms.length;
    const sd = Math.sqrt(ms.reduce((a, c) => a + (c - mean) ** 2, 0) / Math.max(1, ms.length - 1));
    const up = xs.filter((x) => x.mu > x.h).length, down = xs.filter((x) => x.mu < -x.h).length;
    console.log(k.padEnd(22) + String(xs.length).padStart(7) + `${mean >= 0 ? '+' : ''}${mean.toFixed(1)}%`.padStart(9) + `${ms[ms.length >> 1].toFixed(1)}%`.padStart(9) + sd.toFixed(1).padStart(8) + `  ${up}/${down}`);
  }
}
