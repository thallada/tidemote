#!/usr/bin/env node
// How a world goes through an event (docs/catastrophes.md): groups of sim.mjs runs aligned on their first event (or on
// --at seconds, for runs without one), each measure averaged over the runs at minutes from it.
//   node tools/events.mjs runs/A runs/B ... [--at 900] [--offsets -5,0,5,10,15,20,30,45] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  at: { type: 'string', default: '900' }, offsets: { type: 'string', default: '-5,0,5,10,15,20,30,45' }, json: { type: 'string' } } });
const OFF = v.offsets.split(',').map(Number);
const CORE = ['producer', 'grazer', 'predator', 'scavenger'];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const se = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) / xs.length) : 0; };

function load(dir) {
  return fs.readdirSync(dir).filter((f) => /seed\d+\.json$/.test(f)).map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
  }).filter((r) => r?.samples?.length);
}
// a sample's measures: the living, effective species, species, guilds awake (1%), the dry share of the floor
function measures(s) {
  const awake = (g) => Math.max(0, (s.diet?.[g] ?? 0) - (s.dormant?.[g] ?? 0) / Math.max(s.living, 1));
  return { living: s.living, eff: s.effSpecies, species: s.species, guilds: CORE.filter((g) => awake(g) >= 0.01).length,
    dormant: CORE.reduce((a, g) => a + (s.dormant?.[g] ?? 0), 0) / Math.max(s.living, 1), dry: s.pond ? Math.max(0, 1 - s.pond.level) : 0 };
}
const KEYS = ['living', 'eff', 'species', 'guilds', 'dormant', 'dry'];
const out = [];
for (const dir of positionals) {
  const runs = load(dir);
  const rows = OFF.map(() => Object.fromEntries(KEYS.map((k) => [k, []])));
  const lows = [];
  for (const r of runs) {
    const t0 = r.events?.[0]?.t ?? +v.at;
    const pre = r.samples.filter((s) => s.t >= t0 - 300 && s.t <= t0).map(measures);
    if (!pre.length) continue;
    const preLiving = mean(pre.map((m) => m.living));
    OFF.forEach((o, i) => {
      const s = r.samples.reduce((a, b) => (Math.abs(b.t - (t0 + o * 60)) < Math.abs(a.t - (t0 + o * 60)) ? b : a));
      if (Math.abs(s.t - (t0 + o * 60)) > 60) return;
      const m = measures(s);
      for (const k of KEYS) rows[i][k].push(m[k]);
    });
    // the deepest fall of the living after the event, against before it
    const after = r.samples.filter((s) => s.t > t0).map((s) => s.living);
    if (after.length) lows.push(Math.min(...after) / preLiving);
  }
  const g = { group: path.basename(dir), n: runs.length, low: mean(lows), lowSE: se(lows), at: OFF.map((o, i) => ({ min: o, ...Object.fromEntries(KEYS.flatMap((k) => [[k, mean(rows[i][k])], [k + 'SE', se(rows[i][k])]])) })) };
  out.push(g);
}
const fmt = (x, d = 1) => (x == null ? '-' : x.toFixed(d));
for (const k of ['eff', 'living', 'guilds', 'dry']) {
  console.log(`\n${k} at minutes from the event`);
  console.log('group'.padEnd(22), ...OFF.map((o) => String(o).padStart(9)));
  for (const g of out) console.log(g.group.padEnd(22), ...g.at.map((a) => (k === 'living' ? fmt(a[k], 0) : fmt(a[k], k === 'eff' ? 1 : 2)).padStart(9)));
}
console.log('\nlowest living after the event / before');
for (const g of out) console.log(g.group.padEnd(22), `${fmt(g.low, 2)} ± ${fmt(g.lowSE, 2)}  (n ${g.n})`);
if (v.json) fs.writeFileSync(v.json, JSON.stringify(out, null, 2));
