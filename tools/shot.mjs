// Photograph the built page in Windows Chrome on the GPU: grow a world at Max, optionally run some page code (to
// start an event, say), then screenshot at given moments, at given zooms around given spots (docs/catastrophes.md).
//   tools/gpu-node.sh tools/shot.mjs --out runs/shots/NAME [--k '{}'] [--n 262144] [--mature 120]
//     [--eval 'T.climate().force("drought")'] [--times 0,60,120] [--speed 8] [--zoom fit,40] [--at x,y] [--frames 1]
// --times are simulated seconds after the eval, run at --speed (Infinity: Max); --zoom is pixels per world unit, or
// fit (the whole world); --at the spot (world units, default the world's centre).
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));
const v = { out: 'runs/shots/x', k: '{}', n: 262144, mature: 120, eval: '', times: '0', speed: 8, zoom: 'fit', at: '', frames: 1, w: 1280, h: 800, html: 'dist/tidemote.html', ...args };
fs.mkdirSync(v.out, { recursive: true });
const html = path.resolve(v.html);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(html).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'shot-')), {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, viewport: null,
  args: [`--window-size=${v.w},${v.h}`, '--window-position=0,0', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0];
page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.log(`[console] ${m.text()}`); });
await page.addInitScript((n) => {
  if (sessionStorage.getItem('tm-init')) return;
  sessionStorage.setItem('tm-init', '1');
  localStorage.setItem('tidemote.view', JSON.stringify({ v: 2, particles: n, auto: false, labOpen: false, trails: 0 }));
  localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
}, +v.n);
await page.goto(`http://127.0.0.1:${server.address().port}/#k=${encodeURIComponent(v.k)}`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
await page.keyboard.press('Shift');
await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
await page.mouse.move(v.w / 2, v.h / 2); await page.mouse.wheel(0, 100);
await page.addStyleTag({ content: '#dock,#floats,#hud,#flash,#caption,#feed,#lab,.rail{display:none!important}' }); await page.mouse.move(v.w - 2, 2);
const simTime = () => page.evaluate(() => globalThis.__tidemote.eng.simTime);
async function runTo(t, speed) {
  await page.evaluate((s) => globalThis.__tidemote.setSpeed(s), speed);
  while (await simTime() < t) await page.waitForTimeout(250);
  await page.evaluate(() => globalThis.__tidemote.setSpeed(0));
}
await runTo(+v.mature, Infinity);
if (v.eval) console.log('eval:', JSON.stringify(await page.evaluate((code) => { const T = globalThis.__tidemote; return eval(code); }, v.eval)));
const t0 = await simTime();
const zooms = String(v.zoom).split(',');
for (const dt of String(v.times).split(',').map(Number)) {
  await runTo(t0 + dt, v.speed === 'max' ? Infinity : +v.speed);
  for (const z of zooms) {
    await page.evaluate(([z, at]) => {
      const T = globalThis.__tidemote, g = T.eng.grid, fit = Math.max(innerWidth / g[0], innerHeight / g[1]);
      // at: "x,y"; "event" (the current event's centre, a leaf's); "shore" (a point of the water's edge near the middle)
      let [x, y] = [g[0] / 2, g[1] / 2];
      if (at === 'event') { const ev = T.climate().event; if (ev?.x != null) [x, y] = [ev.x, ev.y]; }
      else if (at === 'shore' && T.eng.relief) {
        let best = Infinity;
        for (let j = 0; j < g[1]; j++) for (let i = 0; i < g[0]; i++) {
          const d = Math.abs(T.eng.relief[j * g[0] + i] - T.eng.level), r = Math.hypot(i - g[0] / 2, j - g[1] / 2);
          if (d < 0.004 && r < best) { best = r; [x, y] = [i + 0.5, j + 0.5]; }
        }
      } else if (at) [x, y] = at.split(',').map(Number);
      T.cam.x = x; T.cam.y = y; T.cam.anchor = null;
      T.cam.zoom = T.cam.zoomTarget = z === 'fit' ? Math.min(innerWidth / g[0], innerHeight / g[1]) / fit : +z / fit;
    }, [z, v.at]);
    for (let fi = 0; fi < +v.frames; fi++) {
      await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
      await page.waitForTimeout(900);
      await page.evaluate(() => globalThis.__tidemote.setSpeed(0));
      const name = `t${String(Math.round(dt)).padStart(4, '0')}_z${z}_${fi}.png`;
      await page.screenshot({ path: path.join(v.out, name) });
      console.log(name, (await simTime()).toFixed(0));
    }
  }
}
await ctx.close(); server.close();
