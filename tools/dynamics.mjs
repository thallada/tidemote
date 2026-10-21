#!/usr/bin/env node
// How dynamic each group of runs is (docs/symbiosis.md): per region of the world (spatial.regions in src/ecostats.js,
// once a simulated minute) guild booms and crashes (a guild's awake cells x2 or /2 within five minutes, counted once
// per swing), takeovers (a new leading species), and the swing of producers (sd of ln count); per world, species
// booms and crashes among the leaders (top shares x2 or /2 in five minutes), the guilds awake and thriving at the
// end, and the graft load. Every group is a directory of sim.mjs JSONs (seed*.json or NAME-seed*.json).
//   node tools/dynamics.mjs runs/A runs/B ... [--from 600] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  from: { type: 'string', default: '300' }, json: { type: 'string' }, help: { type: 'boolean' } } });
if (v.help || !positionals.length) {
  console.log('Usage: node tools/dynamics.mjs runs/A [runs/B ...] [--from 300] [--json out.json]');
  process.exit(0);
}
const FROM = +v.from;
const CORE = ['producer', 'grazer', 'predator', 'scavenger'];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) : 0; };

function load(dir) {
  if (!fs.statSync(dir).isDirectory()) return [JSON.parse(fs.readFileSync(dir, 'utf8'))];
  return fs.readdirSync(dir).filter((f) => /seed\d+\.json$/.test(f)).map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
  }).filter((r) => r?.samples?.length);
}

// swings in a series sampled at times ts: a rise to x2 (boom) or fall to /2 (crash) within `win` seconds of a
// sample, counted once until the series has moved on past the window (floor: counts under `min` are noise)
function swings(ts, xs, win = 300, min = 8) {
  let booms = 0, crashes = 0, lastB = -Infinity, lastC = -Infinity;
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length && ts[j] - ts[i] <= win; j++) {
      const a = Math.max(xs[i], 1), b = Math.max(xs[j], 1);
      if (Math.max(a, b) < min) continue;
      if (b >= 2 * a && ts[j] > lastB) { booms++; lastB = ts[j] + win; break; }
      if (b <= a / 2 && ts[j] > lastC) { crashes++; lastC = ts[j] + win; break; }
    }
  }
  return { booms, crashes };
}

function runStats(run) {
  const S = run.samples.filter((s) => s.t >= FROM);
  const R = S.filter((s) => s.spatial?.regions);
  const out = {};
  const hours = S.length > 1 ? (S.at(-1).t - S[0].t) / 3600 : 0;
  if (R.length > 2) {
    const n = R[0].spatial.regions.lead.length, ts = R.map((s) => s.t), rh = n * (ts.at(-1) - ts[0]) / 3600;
    let booms = 0, crashes = 0, takeovers = 0, swing = [];
    for (let r = 0; r < n; r++) {
      for (const g of CORE) {
        const xs = R.map((s) => s.spatial.regions.g[g]?.[r] ?? 0);
        const w = swings(ts, xs); booms += w.booms; crashes += w.crashes;
        if (g === 'producer') swing.push(sd(xs.map((x) => Math.log(x + 1))));
      }
      for (let i = 1; i < R.length; i++) {
        const a = R[i - 1].spatial.regions.lead[r], b = R[i].spatial.regions.lead[r];
        if (a[0] && b[0] && a[0] !== b[0] && b[1] >= 8) takeovers++;
      }
    }
    Object.assign(out, { regionBooms: booms / rh, regionCrashes: crashes / rh, takeovers: takeovers / rh, producerSwing: mean(swing) });
  }
  // species among the leaders: each serial's share over time (absent: 0)
  if (hours > 0) {
    const ser = new Set(S.flatMap((s) => s.top.map((t) => t.serial)));
    let booms = 0, crashes = 0;
    const ts = S.map((s) => s.t);
    for (const k of ser) {
      const xs = S.map((s) => (s.top.find((t) => t.serial === k)?.share ?? 0) * s.living);
      const w = swings(ts, xs, 300, 40); booms += w.booms; crashes += w.crashes;
    }
    out.speciesBooms = booms / hours; out.speciesCrashes = crashes / hours;
  }
  const last = run.samples.at(-1);
  const awake = (g) => Math.max(0, last.diet[g] - (last.dormant?.[g] ?? 0) / Math.max(last.living, 1));
  out.awake4 = CORE.every((g) => awake(g) >= 0.01) ? 1 : 0;
  out.thriving4 = CORE.every((g) => awake(g) >= 0.05) ? 1 : 0;
  out.effSpecies = mean(S.map((s) => s.effSpecies));
  out.livingFrac = mean(S.map((s) => s.living)) / (run.config?.n ?? 1);
  const G = S.filter((s) => s.grafts && s.living);
  if (G.length) {
    out.grafted = mean(G.map((s) => s.grafts.grafted / s.living));
    out.taking = mean(G.map((s) => (s.grafts.grafted ? s.grafts.taking / s.grafts.grafted : 0)));
    out.giving = mean(G.map((s) => (s.grafts.grafted ? s.grafts.giving / s.grafts.grafted : 0)));
    out.graftsPerMinK = mean(G.map((s) => s.grafts.made * 1000 / s.living));
    out.rejectsPerMinK = mean(G.map((s) => s.grafts.rejected * 1000 / s.living));
    out.graftedEnd = last.grafts && last.living ? last.grafts.grafted / last.living : 0;
    const hostShare = (g) => mean(G.map((s) => (s.grafts.grafted ? s.grafts.hosts[g] / s.grafts.grafted : 0)));
    out.hostsP = hostShare('producer'); out.hostsAnimal = 1 - out.hostsP;
  }
  return out;
}

const rows = [];
for (const dir of positionals) {
  const runs = load(dir).map(runStats);
  if (!runs.length) { console.log(`${dir}: no runs`); continue; }
  const keys = [...new Set(runs.flatMap((r) => Object.keys(r)))];
  const row = { group: path.basename(dir), n: runs.length };
  for (const k of keys) {
    const xs = runs.map((r) => r[k]).filter((x) => x != null && Number.isFinite(x));
    row[k] = mean(xs); row[k + 'SE'] = xs.length > 1 ? sd(xs) / Math.sqrt(xs.length) : null;
  }
  rows.push(row);
}
const COLS = ['n', 'regionBooms', 'regionCrashes', 'takeovers', 'producerSwing', 'speciesBooms', 'speciesCrashes', 'effSpecies', 'livingFrac', 'awake4', 'thriving4', 'grafted', 'taking', 'giving', 'graftsPerMinK', 'rejectsPerMinK', 'hostsP'];
const SHORT = { regionBooms: 'rBoom', regionCrashes: 'rCrash', takeovers: 'takeov', producerSwing: 'pSwing', speciesBooms: 'sBoom', speciesCrashes: 'sCrash', effSpecies: 'effSp', livingFrac: 'living', awake4: 'awake4', thriving4: 'thrive4', grafted: 'grafted', taking: 'taking', giving: 'giving', graftsPerMinK: 'mk/min', rejectsPerMinK: 'rej/min', hostsP: 'hostP' };
const w = Math.max(8, ...rows.map((r) => r.group.length));
console.log('group'.padEnd(w), ...COLS.map((c) => (SHORT[c] ?? c).padStart(8)));
for (const r of rows) {
  console.log(r.group.padEnd(w), ...COLS.map((c) => {
    const x = r[c];
    return (x == null ? '-' : c === 'n' ? String(x) : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)).padStart(8);
  }));
}
if (v.json) fs.writeFileSync(v.json, JSON.stringify(rows, null, 2));
