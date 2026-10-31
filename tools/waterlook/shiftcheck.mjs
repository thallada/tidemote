// Check Engine.seaShift against the view the GPU draws: one still moment (paused, the sea held still with it) seen
// with the water off and then on, a storm's, and the predicted offset at a grid of points written beside the two
// shots for tools/waterlook/shiftreport.py to measure against where the scene actually moved.
//   tools/gpu-node.sh tools/waterlook/shiftcheck.mjs --out runs/look/shift [--zoom 150]
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage } from '../pagelab.mjs';

const v = { out: 'runs/look/shift', n: 262144, mature: 20, zoom: 150, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, setSpeed, close } = await openPage({ ...v, tmp: 'shiftcheck-' });
await setSpeed(0);
await page.evaluate((z) => {
  const T = globalThis.__tidemote, e = T.eng, g = e.grid, fit = Math.max(innerWidth / g[0], innerHeight / g[1]);
  e.seaTune.rough = 1; e.seaTune.view = 3;
  T.cam.x = g[0] * 0.43; T.cam.y = g[1] * 0.47; T.cam.anchor = null; T.cam.zoom = T.cam.zoomTarget = Math.max(z / fit, 1);
}, +v.zoom);
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(v.out, 'off.png') });
await page.evaluate(() => { globalThis.__tidemote.eng.seaTune.view = 0; });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(v.out, 'on.png') });
const pred = await page.evaluate(() => {
  const T = globalThis.__tidemote, e = T.eng, c = e.lastCam, dpr = document.querySelector('canvas').width / innerWidth, out = [];
  for (let j = 1; j < 6; j++) for (let i = 1; i < 9; i++) {
    const sx = (innerWidth * i) / 9, sy = (innerHeight * j) / 6;
    const wx = c.x + (sx * dpr - c.w / 2) / c.ppu, wy = c.y + (sy * dpr - c.h / 2) / c.ppu;
    const [dx, dy] = e.seaShift(wx, wy, { ppu: c.ppu });
    out.push({ sx, sy, dx: dx / dpr, dy: dy / dpr });
  }
  return { out, maps: e.seaShifts.length };
});
fs.writeFileSync(path.join(v.out, 'pred.json'), JSON.stringify(pred));
console.log('maps', pred.maps);
await close();
