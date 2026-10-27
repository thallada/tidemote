// Runs the built page on the GPU as fast as it goes and saves its lineage records (the established
// species with their population records, the history, the climate's eras) every few minutes, for
// checking the Lab's Lineage view on long worlds (tools/lineage/page-shots.mjs).
//   node tools/lineage/capture.mjs --out runs/lineage/w1 --minutes 60 --every 5 [--n 65536] [--k '{...}']
import fs from 'node:fs';
import path from 'node:path';
import { root, start, open } from './browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(root, arg('out', 'runs/lineage/w'));
const minutes = +arg('minutes', 30), every = +arg('every', 5), n = arg('n') ? +arg('n') : null, k = arg('k', '');
fs.mkdirSync(out, { recursive: true });

const env = await start();
const page = await open(env, { particles: n, hash: k ? `#k=${encodeURIComponent(k)}` : '' });
await page.evaluate(() => globalThis.__tidemote.setSpeed(Infinity));

const snap = () => page.evaluate(() => {
  const T = globalThis.__tidemote, life = T.life();
  return {
    simTime: T.eng.simTime,
    reg: [...life.reg.values()].filter((s) => s.established).map((s) => ({ ...s, genome: { col: s.genome.col }, series: { t: Array.from(s.series.t), v: Array.from(s.series.v) } })),
    history: life.history.map((h) => ({ t: h.t, sp: h.sp })),
    eras: T.climate().history.map((e) => ({ t: e.t, name: e.name })),
  };
});
const t0 = Date.now();
for (let m = every; m <= minutes; m += every) {
  await page.waitForTimeout(Math.max(0, t0 + m * 60000 - Date.now()));
  const s = await snap();
  const file = path.join(out, `t${String(Math.round(s.simTime / 60)).padStart(5, '0')}m.json`);
  fs.writeFileSync(file, JSON.stringify(s));
  console.log(`${m} min real · ${(s.simTime / 3600).toFixed(2)} h world · ${s.reg.length} established (${s.reg.filter((r) => r.alive).length} alive) → ${path.relative(root, file)}`);
}
await env.close();
