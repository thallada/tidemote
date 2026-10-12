// mean end population per guild per fork variant, paired difference from the first (± ~95%, * beyond it)
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(f));
  const vs = [...new Set(r.forks.map((x) => x.variant))];
  const keys = ['living', 'producer', 'grazer', 'predator', 'scavenger', 'omnivore'];
  console.log(f, 'start', keys.map((k) => `${k}=${Math.round(r.start[k])}`).join(' '));
  for (const k of keys) {
    const base = r.forks.filter((x) => x.variant === vs[0]);
    const bm = base.reduce((a, x) => a + x.end[k], 0) / base.length;
    if (bm < 50) continue;
    const cols = vs.slice(1).map((v) => {
      const d = base.map((b) => (r.forks.find((x) => x.variant === v && x.rep === b.rep).end[k] - b.end[k]) / bm);
      const m = d.reduce((a, c) => a + c, 0) / d.length, sd = Math.sqrt(d.reduce((a, c) => a + (c - m) ** 2, 0) / (d.length - 1));
      const h = 2.1 * sd / Math.sqrt(d.length);
      return `${v} ${(m * 100).toFixed(1)}±${(h * 100).toFixed(1)}${Math.abs(m) > h ? '*' : ' '}`;
    });
    console.log(`  ${k.padEnd(10)} keep ${Math.round(bm).toString().padStart(6)}  ${cols.join('  ')}`);
  }
}
