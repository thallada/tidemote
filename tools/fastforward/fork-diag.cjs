// Per-guild neighbourhood, motion, light and hunger (forks run with K.diag record `diag`: means over each
// cell's once-a-second samples) across fork worlds: each variant against the first (or mX:tag against
// m1:tag), the paired relative difference per world, then the mean over worlds and worlds up/down.
// Usage: fork-diag.cjs file.json... [--guilds producer,grazer]
const fs = require('fs');
const args = process.argv.slice(2);
const gi = args.indexOf('--guilds');
const want = gi >= 0 ? args[gi + 1].split(',') : null;
const files = args.filter((a) => a.endsWith('.json'));
const per = {}; // variant -> guild.key -> [{mu, h, bm}]
let variants = null;
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f));
  if (!r.forks[0].diag) continue;
  const names = r.config.variants.map((v) => v.name);
  variants ??= names;
  const baseOf = (v) => (v.includes(':') && names.includes('m1:' + v.split(':')[1]) ? 'm1:' + v.split(':')[1] : names[0]);
  for (const v of names.filter((n) => !n.startsWith('m1:') && n !== names[0])) {
    const b = r.forks.filter((x) => x.variant === baseOf(v));
    for (const [g, o] of Object.entries(b[0].diag)) {
      if (want && !want.includes(g)) continue;
      // too few cells of the guild in this world to judge: under 200 samples a fork
      if (b.some((x) => !(x.diag[g]?.samples >= 200))) continue;
      for (const k of Object.keys(o)) {
        const bm = b.reduce((a, x) => a + x.diag[g][k], 0) / b.length;
        if (!(bm > 0)) continue;
        const ds = b.map((x) => { const y = r.forks.find((z) => z.rep === x.rep && z.variant === v); return ((y.diag[g]?.[k] ?? NaN) - x.diag[g][k]) / bm; });
        if (ds.some((d) => !Number.isFinite(d))) continue;
        const mu = ds.reduce((a, c) => a + c, 0) / ds.length;
        const sd = Math.sqrt(ds.reduce((a, c) => a + (c - mu) ** 2, 0) / Math.max(1, ds.length - 1));
        ((per[v] ??= {})[`${g}.${k}`] ??= []).push({ mu, h: 2.1 * sd / Math.sqrt(ds.length), bm });
      }
    }
  }
}
for (const v of (variants || []).filter((n) => per[n])) {
  console.log(`\n${v} vs ${v.includes(':') ? 'm1:' + v.split(':')[1] : variants[0]} over ${files.length} worlds`);
  console.log('stat'.padEnd(24) + 'worlds'.padStart(7) + 'base'.padStart(10) + 'mean'.padStart(9) + 'median'.padStart(9) + 'sd'.padStart(8) + '  up/down');
  for (const [k, xs] of Object.entries(per[v]).sort(([a], [b]) => a.localeCompare(b))) {
    const ms = xs.map((x) => x.mu * 100).sort((a, b) => a - b);
    const mean = ms.reduce((a, c) => a + c, 0) / ms.length;
    const sd = Math.sqrt(ms.reduce((a, c) => a + (c - mean) ** 2, 0) / Math.max(1, ms.length - 1));
    const bm = xs.reduce((a, x) => a + x.bm, 0) / xs.length;
    const up = xs.filter((x) => x.mu > x.h).length, down = xs.filter((x) => x.mu < -x.h).length;
    console.log(k.padEnd(24) + String(xs.length).padStart(7) + bm.toPrecision(3).padStart(10) + `${mean >= 0 ? '+' : ''}${mean.toFixed(1)}%`.padStart(9)
      + `${ms[ms.length >> 1].toFixed(1)}%`.padStart(9) + sd.toFixed(1).padStart(8) + `  ${up}/${down}`);
  }
}
