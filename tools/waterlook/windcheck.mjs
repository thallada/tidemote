// Check the sea's wind in the built page: its waves run the way the tide's light bands drift (the drift of the sea's
// light, measured by phase correlation between frames, against Engine.tideWind), and across a change of era the wind
// turns gradually (its angle sampled every simulated second, with the frame-to-frame change of the sea's light).
//   tools/gpu-node.sh tools/waterlook/windcheck.mjs --out runs/look/wind
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage } from '../pagelab.mjs';

const v = { out: 'runs/look/wind', n: 131072, mature: 20, zoom: 30, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, setSpeed, close } = await openPage({ ...v, tmp: 'windcheck-' });
// the sea's light alone, a storm's (plainest to follow), the camera fixed
await page.evaluate((z) => {
  const T = globalThis.__tidemote, e = T.eng, g = e.grid, fit = Math.max(innerWidth / g[0], innerHeight / g[1]);
  e.seaTune.view = 1; e.seaTune.rough = 1;
  T.cam.x = g[0] / 2; T.cam.y = g[1] / 2; T.cam.anchor = null; T.cam.zoom = T.cam.zoomTarget = Math.max(z / fit, 1);
}, +v.zoom);
const grab = async () => (await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 512 } })).toString('base64');
const winds = () => page.evaluate(() => { const e = globalThis.__tidemote.eng; return { tide: e.tideWind, sea: e._seaWind, t: e.simTime, ppu: globalThis.__tidemote.eng.lastCam?.ppu }; });

// 1. which way the waves run: pairs of frames 0.3 s of real time apart at 1×
await setSpeed(1);
const pairs = [];
for (let i = 0; i < 4; i++) {
  const a = await grab(); const w0 = await winds();
  await page.waitForTimeout(300);
  const b = await grab(); const w1 = await winds();
  pairs.push({ a, b, wind: w0, dt: w1.t - w0.t });
  await page.waitForTimeout(700);
}
fs.writeFileSync(path.join(v.out, 'pairs.json'), JSON.stringify(pairs));

if (v.pairsOnly) { await close(); process.exit(0); }
// 2. a change of era: the wind sampled each simulated second for 90 s, at 4×
await page.evaluate(() => { const c = globalThis.__tidemote.climate(); c.next = globalThis.__tidemote.eng.simTime; });
await setSpeed(4);
const turn = [];
const t0 = (await winds()).t;
let last = await grab();
while ((await winds()).t < t0 + 90) {
  await page.waitForTimeout(250);
  const w = await winds(), f = await grab();
  turn.push({ ...w, frame: f, prev: last });
  last = f;
}
fs.writeFileSync(path.join(v.out, 'turn.json'), JSON.stringify(turn.map(({ frame, prev, ...w }) => w)));
fs.writeFileSync(path.join(v.out, 'turnframes.json'), JSON.stringify(turn.map((x) => [x.prev, x.frame])));
await setSpeed(0);
console.log('done', pairs.length, 'pairs', turn.length, 'turn samples');
await close();
