// Energy distribution at fork end: per guild, each energy band's share of living cells (energy as a share of
// the division mark: <.05 <.1 <.25 <.5 <1 <2 >=2), averaged over reps; variant minus first, in points,
// mean over worlds and worlds up/down (paired t per world).
const fs = require('fs');
const files = process.argv.slice(2);
const bands = ['<.05', '<.1', '<.25', '<.5', '<1', '<2', '>=2'];
const acc = {};
let names;
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f));
  names = r.config.variants.map((v) => v.name);
  const base = names[0];
  for (const v of names.slice(1)) for (const g of ['producer', 'grazer', 'predator', 'scavenger']) {
    const share = (fk) => { const h = fk.hist[g]; if (!h) return null; const t = h.reduce((a, b) => a + b, 0); return t > 50 ? h.map((x) => x / t) : null; };
    const ds = [];
    for (const b of r.forks.filter((x) => x.variant === base)) {
      const o = r.forks.find((y) => y.rep === b.rep && y.variant === v);
      const sb = share(b), so = share(o);
      if (sb && so) ds.push(so.map((x, i) => (x - sb[i]) * 100));
    }
    if (ds.length < 4) continue;
    const mu = bands.map((_, i) => ds.reduce((a, d) => a + d[i], 0) / ds.length);
    const h = bands.map((_, i) => { const sd = Math.sqrt(ds.reduce((a, d) => a + (d[i] - mu[i]) ** 2, 0) / (ds.length - 1)); return 2.1 * sd / Math.sqrt(ds.length); });
    const base0 = (() => { const xs = r.forks.filter((x) => x.variant === base).map(share).filter(Boolean); return bands.map((_, i) => xs.reduce((a, s) => a + s[i], 0) / xs.length * 100); })();
    ((acc[v] ??= {})[g] ??= []).push({ mu, h, base0 });
  }
}
for (const [v, gs] of Object.entries(acc)) {
  console.log(`\n${v} vs ${names[0]}: change in each band's share of living cells, percentage points (base share in brackets)`);
  for (const [g, ws] of Object.entries(gs)) {
    const line = bands.map((b, i) => {
      const m = ws.reduce((a, w) => a + w.mu[i], 0) / ws.length;
      const base = ws.reduce((a, w) => a + w.base0[i], 0) / ws.length;
      const up = ws.filter((w) => w.mu[i] > w.h[i]).length, dn = ws.filter((w) => w.mu[i] < -w.h[i]).length;
      return `${b} ${m >= 0 ? '+' : ''}${m.toFixed(2)} [${base.toFixed(1)}] ${up}/${dn}`;
    });
    console.log(`  ${g.padEnd(10)} (${ws.length} worlds)  ${line.join(' | ')}`);
  }
}
