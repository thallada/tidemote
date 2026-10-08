// Long-run ensembles against the pooled normal runs at 1/60 s: late-phase means with standard
// errors. Usage: node tools/fastforward/pool.mjs NAME... (reports NAME.json in balance/fastforward or $REPORTS)
import fs from 'node:fs';
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const F = 'balance/fastforward';
const normal = [...read('balance/baseline-32k-30m.json').runs, ...read(`${F}/normal-seeds33-64.json`).runs, ...read(`${F}/normal-main-seeds1-32.json`).runs];
const R = process.env.REPORTS || F;
const keys = ['lateSpecies', 'lateEffSpecies', 'lateHill2', 'lateMaxShare', 'lateLivingFrac', 'notableSpecies', 'foodWeb'];
const stat = (runs, k) => { const xs = runs.map((r) => r[k]).filter((x) => x != null).map(Number); const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); return [m, sd / Math.sqrt(xs.length)]; };
console.log('set'.padEnd(10) + 'n'.padStart(4) + keys.map((k) => k.slice(0, 13).padStart(16)).join(''));
const show = (name, runs) => console.log(name.padEnd(10) + String(runs.length).padStart(4) + keys.map((k) => { const [m, se] = stat(runs, k); return `${m.toFixed(m > 10 ? 1 : 3)}±${se.toFixed(m > 10 ? 1 : 3)}`.padStart(16); }).join(''));
show('normal', normal);
for (const n of process.argv.slice(2)) show(n, read(`${R}/${n}.json`).runs);
