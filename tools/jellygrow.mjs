// Grow a world for filming jelly (tools/jellyneedle.mjs --world): the page at --n cells, its tunables --k (by default
// jelly common and piercing priced out, so its bodies are many and whole), run at Max to --minutes of simulated time
// and saved as a .bin (tools/lib/world.mjs). Small enough for a machine without much memory to film.
//   TIDEMOTE_VK=1 tools/capped.sh -m 2G node tools/jellygrow.mjs --out runs/jelly/worlds/demo.bin [--n 65536] [--minutes 6]
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs } from './lib/args.mjs';
import { openPage } from './pagelab.mjs';
import { saveBinWorld } from './lib/world.mjs';
const v = { out: 'runs/jelly/worlds/demo.bin', n: 65536, minutes: 6, html: 'dist/tidemote.html',
  k: '{"foundJelly":3,"pierceCost":1,"lowEras":0,"eventPlan":"none@1000000000"}', ...cliArgs() };
fs.mkdirSync(path.dirname(v.out), { recursive: true });
const { page, close } = await openPage({ ...v, mature: 1, tmp: 'grow-' });
await page.evaluate(async (until) => {
  const T = globalThis.__tidemote;
  T.setSpeed(Infinity);
  while (T.eng.simTime < until) await new Promise((r) => setTimeout(r, 500));
  T.setSpeed(0);
}, +v.minutes * 60);
const r = await saveBinWorld(page);
fs.writeFileSync(v.out, Buffer.from(r.b64, 'base64'));
console.log(`${v.out}: ${Math.round(r.simTime)} s, ${r.living} living, ${r.species} species`);
await close();
