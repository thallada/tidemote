// Compare groups of start-lab runs (tools/startlab.mjs JSON) over a window of their time:
//   node tools/startlab-report.mjs --from 1500 --to 2400 ctl='runs/B/ctl-*.json' cull='runs/B/cull-*.json'
// Each metric is averaged over the window per run, then summarized per group as mean ± 95% CI over runs
// (t-based), with the share of runs that are monocultures (one species > 50%) or lack a guild (< 5%).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  from: { type: 'string', default: '0' }, to: { type: 'string', default: '1e9' }, json: { type: 'string' }, traj: { type: 'string' },
} });
const glob = (pat) => {
  const dir = path.dirname(pat), re = new RegExp(`^${path.basename(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f));
};
const DIETS = ['producer', 'grazer', 'predator', 'scavenger'];
const METRICS = {
  living: (s) => s.living, hill1: (s) => s.hill1, hill2: (s) => s.hill2, maxShare: (s) => s.maxShare,
  n1pct: (s) => s.n1pct, thriving: (s) => s.thriving, lineHill1: (s) => s.lineHill1, abioShare: (s) => s.abioShare,
  guildEven: (s) => s.guildEven, ...Object.fromEntries(DIETS.map((d) => [d, (s) => s.diet[d]])),
  ...Object.fromEntries(DIETS.map((d) => [`h1.${d}`, (s) => s.guildHill1[d]])), cysts: (s) => s.cysts,
  swimmer: (s) => s.movement.swimmer, sessile: (s) => s.movement.sessile, bodies: (s) => s.bodies,
};
const SPATIAL = { alpha: (s) => s.alpha, beta: (s) => s.beta, leaders: (s) => s.leaders, densCV: (s) => s.densCV };
const T95 = [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12];
const stat = (xs) => {
  const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  return { n, mean: m, ci: n > 1 ? (T95[n - 2] ?? 1.96) * sd / Math.sqrt(n) : 0, sd };
};
const from = +v.from, to = +v.to, groups = {};
for (const arg of positionals) {
  const [name, pat] = arg.split('=');
  const runs = glob(pat).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const per = runs.map((r) => {
    const w = r.samples.filter((s) => s.t >= from && s.t <= to), ws = r.spatial.filter((s) => s.t >= from && s.t <= to);
    const o = {};
    for (const [k, f] of Object.entries(METRICS)) o[k] = w.length ? w.reduce((a, s) => a + f(s), 0) / w.length : NaN;
    for (const [k, f] of Object.entries(SPATIAL)) o[k] = ws.length ? ws.reduce((a, s) => a + f(s), 0) / ws.length : NaN;
    o.mono = o.maxShare > 0.5 ? 1 : 0;
    o.allGuilds = DIETS.every((d) => o[d] >= 0.05) ? 1 : 0;
    o.collapsed = w.some((s) => s.living < 0.02) ? 1 : 0;
    return o;
  });
  groups[name] = Object.fromEntries(Object.keys(per[0] || {}).map((k) => [k, stat(per.map((o) => o[k]).filter(Number.isFinite))]));
}
const names = Object.keys(groups), keys = Object.keys(groups[names[0]]);
const fmt = (s) => (Math.abs(s.mean) >= 10 ? `${s.mean.toFixed(1)}±${s.ci.toFixed(1)}` : `${s.mean.toFixed(3)}±${s.ci.toFixed(3)}`);
console.log(`window ${from}-${to}s`.padEnd(14) + names.map((n) => `${n} (${groups[n].hill1.n})`.padStart(18)).join(''));
for (const k of keys) console.log(k.padEnd(14) + names.map((n) => fmt(groups[n][k]).padStart(18)).join(''));
if (v.json) fs.writeFileSync(v.json, JSON.stringify(groups, null, 2));
