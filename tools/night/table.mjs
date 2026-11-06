// Summarize run JSONs in directories by config prefix: node tools/night/table.mjs DIR [DIR...] [--seeds 1,2,3,4]
import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2), si = args.indexOf('--seeds');
const seeds = si >= 0 ? new Set(args[si + 1].split(',').map(Number)) : null;
const dirs = args.filter((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1));
const rows = {};
for (const d of dirs) for (const f of fs.readdirSync(d).filter((f) => /-seed\d+\.json$/.test(f))) {
  const [cfg, sd] = f.replace('.json', '').split('-seed');
  if (seeds && !seeds.has(+sd)) continue;
  const r = JSON.parse(fs.readFileSync(path.join(d, f))); const o = r.outcome || {}; const gs = r.samples.filter((s) => s.grafts);
  const late = gs.slice(Math.floor(gs.length * 2 / 3));
  const avg = (k) => late.reduce((a, s) => a + (s.grafts[k] || 0), 0) / Math.max(1, late.length);
  const eng = gs.reduce((a, s) => a + (s.grafts.engulfed || 0), 0);
  (rows[cfg] ||= []).push({ eff: o.lateEffSpecies, h2: o.lateHill2, max: o.lateMaxShare, guilds: o.lateGuilds, liv: o.lateLivingFrac, persisted: o.persisted ? 1 : 0, grafted: avg('grafted'), grafters: avg('grafters'), engulfed: eng });
}
const keys = ['eff', 'h2', 'max', 'guilds', 'liv', 'persisted', 'grafted', 'grafters', 'engulfed'];
console.log('cfg'.padEnd(8), 'n', ...keys.map((k) => k.padStart(9)));
for (const [c, rs] of Object.entries(rows)) {
  console.log(c.padEnd(8), rs.length, ...keys.map((k) => { const xs = rs.map((r) => r[k] ?? 0); const m = xs.reduce((a, b) => a + b, 0) / xs.length; return m.toFixed(m >= 10 ? 1 : 3).padStart(9); }));
}
