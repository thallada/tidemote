#!/usr/bin/env node
// What evolved brains do (K.brain, docs/brain.md): runs each living species' brain, as brainNet in
// shaders.js does, on a few staged situations, and compares them with the founders' reflexes.
//   node tools/sim.mjs --k '{"brain":1}' --species --out run.json ...   then
//   node tools/brain-probe.mjs run.json [more.json...]
import fs from 'node:fs';
import { brainHidden, brainOutput, brainBias, founderBrain, dietGuild } from '../src/genome.js';
import { BRAIN_SENSES, BRAIN_DIRS, BRAIN_HID, BRAIN_OUT } from '../src/shaders.js';

const SI = Object.fromEntries(BRAIN_SENSES.map((n, i) => [n, i]));
const BASE = { energy: 0.9, age: 0.3, food: 0, threat: 0, kin: 0.2, crowd: 0.2, temp: 0, light: 0.5, silt: 0.3,
  bonds: 0, speed: 0.3, 'heading-food': 0, 'heading-threat': 0, current: 0.3, clock: 0, bias: 1 };
const SITUATIONS = {
  calm: {},
  hungry: { energy: 0.3, food: 0.6 },
  sated: { energy: 1.3, food: 0.6 },
  danger: { threat: 0.6 },
  hot: { temp: 1.5 },
  cold: { temp: -1.5 },
  crowded: { kin: 0.8, crowd: 0.8 },
  tick: { clock: 1 },
  tock: { clock: -1 },
};

/** The eight direction gains of brain words w on senses x (an object by sense name). */
export function brainGains(w, x) {
  const xs = BRAIN_SENSES.map((n) => x[n] ?? 0);
  const h = Array.from({ length: BRAIN_HID }, (_, j) => Math.tanh(xs.reduce((s, v, i) => s + brainHidden(w, j, i) * v, 0)));
  return Array.from({ length: BRAIN_OUT }, (_, o) => Math.tanh(h.reduce((s, v, j) => s + brainOutput(w, o, j) * v, 0) + brainBias(w, o)));
}
const profile = (w) => Object.fromEntries(Object.entries(SITUATIONS).map(([k, d]) => [k, brainGains(w, { ...BASE, ...d })]));
const D = Object.fromEntries(BRAIN_DIRS.map((n, i) => [n, i]));
// a few readings of a brain: how much hunger turns it to food, flight, thermotaxis, clock rhythm...
function traits(w) {
  const p = profile(w);
  return {
    hungerFood: p.hungry[D.food] - p.sated[D.food],
    flee: -p.danger[D.threat],
    seekCool: -p.hot[D.warmth],
    seekWarm: p.cold[D.warmth],
    gather: p.crowded[D.jostle],
    flock: p.calm[D.flock],
    current: p.calm[D.current],
    cruise: p.calm[D.heading],
    wander: p.calm[D.wander],
    rhythm: Math.max(...BRAIN_DIRS.map((_, i) => Math.abs(p.tick[i] - p.tock[i]))),
  };
}
const template = founderBrain(() => 0.5);
const dist = (a) => { let s = 0; for (let k = 0; k < 201; k++) s += Math.abs(brainByte(a, k) - brainByte(template, k)); return s / 201; };
const brainByte = (w, k) => (((w[k >> 2] >>> ((k & 3) * 8)) & 255) << 24 >> 24) / 127;
const swims = (g) => g.swim * (1 - g.photo) > 0.05;

const fmt = (x) => (x >= 0 ? ' ' : '') + x.toFixed(2);
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: brain-probe.mjs run.json [...]'); process.exit(1); }
const keys = Object.keys(traits(template));
console.log(`founder reflex   ${keys.map((k) => `${k}=${fmt(traits(template)[k])}`).join(' ')}`);
const all = [];
for (const f of files) {
  const run = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!run.species) throw new Error(`${f}: no species (run sim.mjs with --species)`);
  const sw = run.species.filter((s) => swims(s.genome)).sort((a, b) => b.pop - a.pop);
  const tot = sw.reduce((s, x) => s + x.pop, 0);
  const mean = Object.fromEntries(keys.map((k) => [k, 0]));
  let md = 0, mdepth = 0;
  for (const s of sw) {
    const t = traits(s.genome.brain), wgt = s.pop / tot;
    for (const k of keys) mean[k] += t[k] * wgt;
    md += dist(s.genome.brain) * wgt; mdepth += s.genome.depth * wgt;
    all.push({ f, ...s, t });
  }
  console.log(`\n${f}: ${sw.length} swimming species, ${tot} cells; mean drift from the reflex ${md.toFixed(3)} per weight, mean depth ${mdepth.toFixed(1)}`);
  console.log(`  pop-weighted    ${keys.map((k) => `${k}=${fmt(mean[k])}`).join(' ')}`);
  for (const s of sw.slice(0, 6).map((x) => ({ ...x, t: traits(x.genome.brain) }))) {
    console.log(`  ${String(s.pop).padStart(6)} ${dietGuild(s.genome).padEnd(9)} d${String(s.genome.depth).padEnd(4)} drift ${dist(s.genome.brain).toFixed(3)}  ${keys.map((k) => `${k}=${fmt(s.t[k])}`).join(' ')}`);
  }
}
