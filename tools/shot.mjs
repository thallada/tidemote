// Photograph the built page in Windows Chrome on the GPU: grow a world at Max, optionally run some page code (to
// start an event, say), then screenshot at given moments, at given zooms around given spots (docs/catastrophes.md).
//   tools/gpu-node.sh tools/shot.mjs --out runs/shots/NAME [--k '{}'] [--n 262144] [--mature 120]
//     [--eval 'T.climate().force("drought")'] [--times 0,60,120] [--speed 8] [--zoom fit,40] [--at x,y] [--frames 1]
//     [--clip 20 --clipspeed 1]
// --clip records that many seconds of the page running at --clipspeed (the screencast, as numbered JPEGs in a folder
// per moment and zoom, with their times in frames.json) instead of stills; join them with ffmpeg.
// --times are simulated seconds after the eval, run at --speed (Infinity: Max); --zoom is pixels per world unit, or
// fit (the whole world); --at the spot: x,y (world units), event, shore or ice (default the world's center).
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage, aim } from './pagelab.mjs';

const v = { clip: 0, clipspeed: 1, out: 'runs/shots/x', k: '{}', n: 262144, mature: 120, eval: '', times: '0', speed: 8, zoom: 'fit', at: '', frames: 1, w: 1280, h: 800, html: 'dist/tidemote.html', ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { ctx, page, simTime, setSpeed, runTo, evalCode, close } = await openPage({ ...v, tmp: 'shot-' });
if (v.eval) console.log('eval:', JSON.stringify(await evalCode(v.eval)));
const t0 = await simTime();
const zooms = String(v.zoom).split(',');
for (const dt of String(v.times).split(',').map(Number)) {
  await runTo(t0 + dt, v.speed === 'max' ? Infinity : +v.speed);
  for (const z of zooms) {
    await aim(page, /^[-\d.]+,[-\d.]+$/.test(v.at) ? v.at.split(',').map(Number) : v.at, z);
    if (+v.clip > 0) {
      const dir = path.join(v.out, `clip_t${String(Math.round(dt)).padStart(4, '0')}_z${z}`);
      fs.mkdirSync(dir, { recursive: true });
      const cdp = await ctx.newCDPSession(page), times = [];
      cdp.on('Page.screencastFrame', async (f) => {
        times.push(f.metadata.timestamp);
        fs.writeFileSync(path.join(dir, `f${String(times.length).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
        await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
      await setSpeed(v.clipspeed === 'max' ? Infinity : +v.clipspeed);
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 });
      await page.waitForTimeout(+v.clip * 1000);
      await cdp.send('Page.stopScreencast');
      await setSpeed(0);
      fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(times));
      console.log(dir, times.length, 'frames', (await simTime()).toFixed(0));
      continue;
    }
    for (let fi = 0; fi < +v.frames; fi++) {
      await setSpeed(1);
      await page.waitForTimeout(900);
      await setSpeed(0);
      const name = `t${String(Math.round(dt)).padStart(4, '0')}_z${z}_${fi}.png`;
      await page.screenshot({ path: path.join(v.out, name) });
      console.log(name, (await simTime()).toFixed(0));
    }
  }
}
await close();
