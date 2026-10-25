// The built page in Windows Chrome on the GPU, for the tools that photograph it (tools/shot.mjs, tools/looklab.mjs;
// docs/catastrophes.md): a world of n particles grown at Max to `mature` simulated seconds, the page's own chrome
// hidden, then held still. Run them under tools/gpu-node.sh.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';

/** --name value pairs (a bare --name is '1'). */
export const cliArgs = () => Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));

export async function openPage({ html = 'dist/tidemote.html', k = '{}', n = 262144, w = 1280, h = 800, mature = 120, tmp = 'page-' }) {
  const file = path.resolve(html);
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(file).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), tmp)), {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, viewport: null,
    args: [`--window-size=${w},${h}`, '--window-position=0,0', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const page = ctx.pages()[0];
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console] ${m.text().slice(0, 400)}`); });
  await page.addInitScript((n) => {
    if (sessionStorage.getItem('tm-init')) return;
    sessionStorage.setItem('tm-init', '1');
    localStorage.setItem('tidemote.view', JSON.stringify({ v: 2, particles: n, auto: false, labOpen: false, trails: 0 }));
    localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
  }, +n);
  await page.goto(`http://127.0.0.1:${server.address().port}/#k=${encodeURIComponent(k)}`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
  await page.mouse.move(w / 2, h / 2); await page.mouse.wheel(0, 100);
  await page.addStyleTag({ content: '#dock,#floats,#hud,#flash,#caption,#feed,#lab,.rail{display:none!important}' }); await page.mouse.move(w - 2, 2);
  const simTime = () => page.evaluate(() => globalThis.__tidemote.eng.simTime);
  const setSpeed = (s) => page.evaluate((s) => globalThis.__tidemote.setSpeed(s), s);
  /** Run at `speed` until simulated time t, then hold still. */
  const runTo = async (t, speed) => {
    await setSpeed(speed);
    while (await simTime() < t) await page.waitForTimeout(250);
    await setSpeed(0);
  };
  const evalCode = (code) => page.evaluate((code) => { const T = globalThis.__tidemote; return eval(code); }, code);
  await runTo(+mature, Infinity);
  return { ctx, page, simTime, setSpeed, runTo, evalCode, close: async () => { await ctx.close(); server.close(); } };
}

/**
 * Point the camera: at [x, y] (world units), 'event' (the current event's center), 'shore' (a point of the water's
 * edge) or 'ice' (a point of the ice front), the nearest such to the world's center, plus `off`; zoom in pixels per
 * world unit, or 'fit' (the whole world), never wider than the page lets a viewer see. Returns the spot.
 */
export const aim = (page, at, zoom = 'fit', off = [0, 0]) => page.evaluate(([at, z, off]) => {
  const T = globalThis.__tidemote, e = T.eng, g = e.grid;
  let [x, y] = [g[0] / 2, g[1] / 2];
  const near = (f, lv) => {
    let best = Infinity;
    for (let j = 0; j < g[1]; j++) for (let i = 0; i < g[0]; i++) {
      const r = Math.hypot(i - g[0] / 2, j - g[1] / 2);
      if (Math.abs(f[j * g[0] + i] - lv) < 0.006 && r < best) { best = r; [x, y] = [i + 0.5, j + 0.5]; }
    }
  };
  if (at === 'event') { const ev = T.climate().event; if (ev?.x != null) [x, y] = [ev.x, ev.y]; }
  else if (at === 'shore' && e.relief) near(e.relief, e.level);
  else if (at === 'ice' && e.iceOrder) near(e.iceOrder, e.frost);
  else if (Array.isArray(at)) [x, y] = at;
  x += off[0]; y += off[1];
  const fit = Math.max(innerWidth / g[0], innerHeight / g[1]);
  T.cam.x = x; T.cam.y = y; T.cam.anchor = null;
  T.cam.zoom = T.cam.zoomTarget = z === 'fit' ? Math.min(innerWidth / g[0], innerHeight / g[1]) / fit : Math.max(+z / fit, 1);
  return [x, y];
}, [at, zoom, off]);
