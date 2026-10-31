// Film the tide's light bands themselves (Light map: Full, no sea, the whole world) a few simulated tens of seconds
// apart, to measure which way they drift against Engine.tideWind (tools/waterlook/windreport.py --tide).
//   tools/gpu-node.sh tools/waterlook/tidecheck.mjs --out runs/look/tide
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage } from '../pagelab.mjs';

const v = { out: 'runs/look/tide', n: 262144, mature: 20, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, setSpeed, close } = await openPage({ ...v, tmp: 'tidecheck-' });
await page.evaluate(() => {
  const T = globalThis.__tidemote, e = T.eng, g = e.grid;
  e.seaTune.view = 3; e.settings.tide = 2; e.settings.nodes = false;
  T.cam.x = g[0] / 2; T.cam.y = g[1] / 2; T.cam.anchor = null; T.cam.zoom = T.cam.zoomTarget = Math.min(innerWidth / g[0], innerHeight / g[1]) / Math.max(innerWidth / g[0], innerHeight / g[1]);
});
const grab = async () => (await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 512 } })).toString('base64');
const wind = () => page.evaluate(() => ({ sea: globalThis.__tidemote.eng.tideWind, t: globalThis.__tidemote.eng.simTime }));
const pairs = [];
await setSpeed(16);
for (let i = 0; i < 4; i++) {
  const a = await grab(), w = await wind();
  await page.waitForTimeout(1500);
  const b = await grab();
  pairs.push({ a, b, wind: { ...w, tide: w.sea } });
}
await setSpeed(0);
fs.writeFileSync(path.join(v.out, 'pairs.json'), JSON.stringify(pairs));
await close();
