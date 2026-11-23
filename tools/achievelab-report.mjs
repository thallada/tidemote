// Sums worlds recorded by tools/achievelab.mjs: for each achievement (src/achievements.js), in how many worlds it came
// and when (the simulated minute of its first unlock: quartiles), by an hour, two, four and eight; and how many a world
// had given by each hour.
//
// usage: node tools/achievelab-report.mjs runs/ach/NAME/*.json [--replay]
// --replay scores the recorded worlds against the module's present thresholds and pacing instead of reading the page's
// own unlocks: stories as they were first weighed (one worth an achievement is told soon after: chronicler.js,
// T.worthy), the world's numbers as the page saw them, and a core one held by the pacing taken to come again once the
// wait is over (as most do).
import fs from 'node:fs';
import { ACHIEVEMENTS, earned, reached, PACE } from '../src/achievements.js';

const worlds = process.argv.slice(2).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))).filter((w) => w.stats.length);
const replay = process.argv.includes('--replay');
const q = (xs, p) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fm = (s) => (Number.isFinite(s) ? `${(s / 60).toFixed(0)}`.padStart(4) : '   -');
const tierOf = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a.tier]));
const span = Math.min(...worlds.map((w) => w.stats.at(-1).t));
console.log(`${worlds.length} worlds, each to ${(span / 60).toFixed(0)} simulated minutes at least\n`);

// each world's first unlock of each achievement (simulated seconds)
const firsts = worlds.map((w) => {
  const at = {};
  const mark = (ids, t) => { for (const id of ids) if (!(id in at) || t < at[id]) at[id] = t; };
  if (!replay) { for (const a of w.ach) mark([a.id], a.t); return at; }
  w.told.forEach((s, i) => mark(earned(s, i + 1), s.t));
  for (const c of w.cands) mark(earned(c).filter((id) => id !== 'FIRST_STORY'), c.first);
  for (const st of w.stats) mark(reached(st.facts), st.t);
  let last = -Infinity;
  for (const [id, t] of Object.entries(at).sort((x, y) => x[1] - y[1])) {
    if (tierOf[id] === 'core') at[id] = Math.max(t, last + PACE.sim);
    last = Math.max(last, at[id]);
  }
  return at;
});

const marks = [1, 2, 4, 8].map((h) => h * 3600);
console.log(`${'achievement'.padEnd(20)} worlds   p25  med  p75 (min)  ${marks.map((m) => `≤${m / 3600}h`.padStart(5)).join(' ')}`);
for (const a of ACHIEVEMENTS) {
  const ts = firsts.map((f) => f[a.id]).filter((t) => t != null);
  const by = marks.map((m) => `${Math.round((100 * ts.filter((t) => t <= m).length) / worlds.length)}%`.padStart(5));
  console.log(`${a.id.padEnd(20)} ${String(ts.length).padStart(3)}/${worlds.length}  ${fm(q(ts, 0.25))} ${fm(q(ts, 0.5))} ${fm(q(ts, 0.75))}       ${by.join(' ')}  ${a.tier}`);
}
console.log('\nunlocked per world by the hour (median, max):');
for (let h = 0.25; h <= span / 3600; h = h < 1 ? h * 2 : h + 1) {
  const c = firsts.map((f) => Object.values(f).filter((t) => t <= h * 3600).length);
  console.log(`  ${String(h).padStart(4)} h  ${q(c, 0.5)}  ${Math.max(...c)}`);
}
