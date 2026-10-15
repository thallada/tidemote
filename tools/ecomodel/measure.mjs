// Measures an ensemble's state for the food-web model (tools/ecomodel/model.py): per guild the awake
// density, income per cell, upkeep, energy per birth and per-cell rates of births, old age, being eaten
// and starving, medians over runs, in a window of the run (minutes from..to). Writes JSON.
//   node tools/ecomodel/measure.mjs runs/A --from 15 --to 30 [--out tools/ecomodel/meas/A.json]
import fs from 'node:fs';

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const from = +opt('from', 0) * 60, to = +opt('to', 1e9) * 60, out = opt('out', null);
const N0 = 32768;
const G = { P: 'producer', G: 'grazer', H: 'predator', S: 'scavenger' };
const R = fs.readdirSync(dir).filter((f) => /^seed\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(dir + '/' + f)));
const rows = [];
for (const r of R) {
  const late = r.samples.filter((s) => s.t >= from && s.t <= to);
  if (!late.length) continue;
  const m = (f) => late.reduce((a, s) => a + f(s), 0) / late.length;
  const o = { silt: m((s) => s.silt) / N0, D: m((s) => s.husk) / N0 };
  for (const [k, g] of Object.entries(G)) {
    const N = m((s) => Math.max(0, s.diet[g] * s.living - (s.dormant?.[g] ?? 0)));
    o[k] = N / N0;
    if (N < 30) continue;
    const e = (x) => m((s) => s.energy[g][x]);
    const d = (x) => m((s) => s.demography[g][x]);
    o['inc' + k] = (e('light') + e('glint') + e('plant') + e('husk') + e('flesh')) / N;
    o['u' + k] = e('upkeep') / N;
    o['b' + k] = e('children') / Math.max(d('births'), 1e-9);
    o['birth' + k] = d('births') / N;
    o['old' + k] = d('oldAge') / N;
    o['eaten' + k] = d('eaten') / N;
    o['starved' + k] = d('starved') / N;
  }
  // who eats whom (cells per minute): hunters' kills by prey guild
  o.killG = m((s) => s.meals.predator.grazer) / N0; o.killS = m((s) => s.meals.predator.scavenger) / N0; o.killH = m((s) => s.meals.predator.predator) / N0;
  rows.push(o);
}
const keys = [...new Set(rows.flatMap((o) => Object.keys(o)))];
const med = (v) => { v = v.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
const res = Object.fromEntries(keys.map((k) => [k, med(rows.map((o) => o[k]))]));
res.runs = rows.length; res.window = [from / 60, Math.min(to, R[0].samples.at(-1).t) / 60]; res.source = dir;
const txt = JSON.stringify(res, null, 1);
if (out) fs.writeFileSync(out, txt); else console.log(txt);
