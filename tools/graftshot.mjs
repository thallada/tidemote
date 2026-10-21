// Photograph grafts (docs/symbiosis.md) on the built page: grow a world at Max, find the hosts holding the most
// grafters (cells of other species bonded to them), and screenshot each up close at real time.
//   tools/gpu-node.sh tools/graftshot.mjs --out runs/sym/shots [--k '{}'] [--n 65536] [--mature 120] [--spots 4]
//     [--zoom 300,120] [--frames 3]
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));
const v = { out: 'runs/sym/shots', k: '{}', n: 65536, mature: 120, spots: 4, zoom: '300,120', frames: 3, w: 1200, h: 800, html: 'dist/tidemote.html', ...args };
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
await page.evaluate(() => globalThis.__tidemote.setSpeed(Infinity));
await page.waitForTimeout(+v.mature * 1000);
await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
await page.waitForTimeout(1000);
const spots = await page.evaluate(async (want) => {
  const T = globalThis.__tidemote, eng = T.eng;
  const s = await eng.readState();
  const u = new Uint32Array(s.gpu.parts), f = new Float32Array(s.gpu.parts), it = new Uint32Array(s.gpu.intent), n = eng.count;
  const hosts = new Map();
  for (let i = 0; i < n; i++) {
    const k = u[i * 10 + 4], h = it[i * 4 + 3];
    if (k >= 5 && h < n && u[h * 10 + 4] >= 5 && u[h * 10 + 4] !== k) hosts.set(h, (hosts.get(h) || 0) + 1);
  }
  const out = [];
  for (const [h, c] of [...hosts].sort((a, b) => b[1] - a[1])) {
    const x = f[h * 10], y = f[h * 10 + 1];
    if (out.every((o) => Math.hypot(o.x - x, o.y - y) > 4)) out.push({ x, y, grafters: c, id: u[h * 10 + 7] });
    if (out.length >= want) break;
  }
  return { out, grafted: [...hosts.values()].reduce((a, b) => a + b, 0), hosts: hosts.size, simTime: eng.simTime };
}, +v.spots);
console.log(JSON.stringify(spots));
const zooms = String(v.zoom).split(',').map(Number);
for (const [si, s] of spots.out.entries()) {
  for (const z of zooms) {
    await page.evaluate(([x, y, ppu]) => { const T = globalThis.__tidemote, fit = Math.max(innerWidth / T.eng.grid[0], innerHeight / T.eng.grid[1]); T.cam.x = x; T.cam.y = y; T.cam.anchor = null; T.cam.zoom = T.cam.zoomTarget = ppu / fit; }, [s.x, s.y, z]);
    for (let fi = 0; fi < +v.frames; fi++) {
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(v.out, `spot${si}_z${z}_${fi}.png`) });
    }
  }
}
await ctx.close(); server.close();
