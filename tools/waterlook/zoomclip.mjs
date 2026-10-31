// Film the built page in a storm (or, with --calm, in calm water) while the camera zooms steadily in, then holds still:
// whether the sea keeps the same waves at every zoom and moves smoothly (docs/catastrophes.md). Numbered JPEGs in
// OUT/zoom and OUT/still, with their times; join them with ffmpeg.
//   tools/gpu-node.sh tools/waterlook/zoomclip.mjs --out runs/look/zoomclip [--n 32768] [--from 30] [--to 1500] [--secs 10] [--calm]
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage } from '../pagelab.mjs';

const v = { out: 'runs/look/zoomclip', n: 32768, mature: 40, from: 30, to: 1500, secs: 10, hold: 6, ...cliArgs() };
const { ctx, page, simTime, setSpeed, runTo, evalCode, close } = await openPage({ ...v, tmp: 'zoomclip-' });
if (!v.calm) {
  console.log('storm', JSON.stringify(await evalCode('T.climate().force("storm")')));
  await runTo((await simTime()) + 90, 8);
}
console.log('rain', await evalCode('T.eng.rain'), 'rough', await evalCode('T.eng.seaRough'));
const aimAt = (z) => page.evaluate((z) => {
  const T = globalThis.__tidemote, g = T.eng.grid, fit = Math.max(innerWidth / g[0], innerHeight / g[1]);
  T.cam.x = g[0] * 0.37; T.cam.y = g[1] * 0.41; T.cam.anchor = null;
  T.cam.zoom = T.cam.zoomTarget = Math.max(z / fit, 1);
}, z);
async function film(name, secs, each) {
  const dir = path.join(v.out, name);
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page), times = [];
  cdp.on('Page.screencastFrame', async (f) => {
    times.push(f.metadata.timestamp);
    fs.writeFileSync(path.join(dir, `f${String(times.length).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await setSpeed(1);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 });
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) { if (each) await each((Date.now() - t0) / (secs * 1000)); await page.waitForTimeout(16); }
  await cdp.send('Page.stopScreencast');
  await setSpeed(0);
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(times));
  console.log(dir, times.length, 'frames');
}
await aimAt(+v.from);
await film('zoom', +v.secs, (u) => aimAt(+v.from * (+v.to / +v.from) ** u));
await aimAt(400);
await film('still', +v.hold);
await close();
