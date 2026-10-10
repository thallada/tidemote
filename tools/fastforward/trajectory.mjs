// How worlds develop over time: each run's samples binned by simulated time and averaged over seeds, per
// set, for ecology and heat. Usage: node tools/fastforward/trajectory.mjs [--bin 300] [--csv out.csv] runs/A runs/B ...
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
const { values: v, positionals } = parseArgs({ allowPositionals: true, options: { bin: { type: 'string', default: '300' }, csv: { type: 'string' } } });
const bin = +v.bin;
const scald = (s) => Object.values(s.thermal?.scalded || {}).reduce((a, b) => a + b, 0);
const METRICS = {
  living: (s) => s.living, effSp: (s) => s.effSpecies, species: (s) => s.species, maxShare: (s) => s.maxShare,
  producer: (s) => s.diet?.producer, grazer: (s) => s.diet?.grazer, predator: (s) => s.diet?.predator, scavenger: (s) => s.diet?.scavenger,
  tbg: (s) => s.thermal?.tbg, felt: (s) => s.thermal?.felt?.p50, topt: (s) => s.thermal?.toptMean, toptSD: (s) => s.thermal?.toptSD,
  torpid: (s) => s.thermal?.torpidFrac, makers: (s) => s.thermal?.makerFrac, scalded: scald, framboids: (s) => s.thermal?.framboids,
  fieldMean: (s) => s.thermal?.field?.mean, fieldMax: (s) => s.thermal?.field?.max, births: (s) => s.rates?.births, kills: (s) => s.rates?.kills,
};
const rows = [];
for (const dir of positionals) {
  const name = path.basename(path.resolve(dir));
  const files = fs.readdirSync(dir).filter((f) => /^seed\d+\.json$/.test(f));
  const acc = {}; // bin -> metric -> [sum, n] over seeds (each seed's bin mean counts once)
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const per = {};
    for (const s of r.samples) {
      const b = Math.floor(s.t / bin);
      for (const [k, get] of Object.entries(METRICS)) { const x = get(s); if (x == null || !Number.isFinite(x)) continue; const p = ((per[b] ??= {})[k] ??= [0, 0]); p[0] += x; p[1]++; }
    }
    for (const [b, m] of Object.entries(per)) for (const [k, [sum, n]] of Object.entries(m)) { const a = ((acc[b] ??= {})[k] ??= [0, 0]); a[0] += sum / n; a[1]++; }
  }
  for (const b of Object.keys(acc).map(Number).sort((a, c) => a - c)) rows.push({ set: name, t: b * bin, seeds: acc[b].living?.[1] ?? 0, ...Object.fromEntries(Object.entries(acc[b]).map(([k, [s, n]]) => [k, s / n])) });
}
const cols = ['living', 'effSp', 'maxShare', 'producer', 'grazer', 'predator', 'scavenger', 'tbg', 'felt', 'topt', 'toptSD', 'torpid', 'scalded', 'framboids', 'fieldMean', 'fieldMax'];
const fmt = (x) => (x == null ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toFixed(3));
console.log('set'.padEnd(10) + 't'.padStart(6) + 'n'.padStart(4) + cols.map((c) => c.slice(0, 9).padStart(10)).join(''));
for (const r of rows) console.log(r.set.slice(0, 10).padEnd(10) + String(r.t).padStart(6) + String(r.seeds).padStart(4) + cols.map((c) => fmt(r[c]).padStart(10)).join(''));
if (v.csv) {
  const all = ['set', 't', 'seeds', ...Object.keys(METRICS)];
  fs.writeFileSync(v.csv, [all.join(','), ...rows.map((r) => all.map((c) => r[c] ?? '').join(','))].join('\n') + '\n');
}
