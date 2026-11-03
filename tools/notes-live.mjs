// Film the auto camera with the interface and the live annotations showing (docs/annotations.md): a fresh world warmed
// at Max, then a screenshot every few seconds and a log of what the notes held and cost (__tidemote.notes.debug()).
//   tools/gpu-node.sh tools/notes-live.mjs --out runs/notes/a [--warm 60] [--secs 60] [--every 5] [--speed 1] [--zoom Z] [--phone] [--eval JS]
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));
const v = { out: 'runs/notes/a', warm: 60, secs: 60, every: 5, speed: 1, n: 131072, w: 1440, h: 900, html: 'dist/tidemote.html', ...args };
fs.mkdirSync(v.out, { recursive: true });
const html = path.resolve(v.html);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(html).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'live-')), {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false,
  // --phone: a phone's screen (390 × 844 CSS px, touch), else the window's own
  ...(v.phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: null }),
  args: [`--window-size=${v.w},${v.h}`, '--window-position=0,0', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0];
page.setDefaultTimeout(0);
const log = [];
page.on('pageerror', (e) => { console.log(`[page error] ${e.message}`); log.push(`pageerror ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()} ${m.text()}`); });
await page.addInitScript((n) => {
  if (sessionStorage.getItem('tm-init')) return;
  sessionStorage.setItem('tm-init', '1');
  localStorage.setItem('tidemote.view', JSON.stringify({ v: 2, particles: n, auto: false, labOpen: false }));
  localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
}, +v.n);
await page.goto(`http://127.0.0.1:${server.address().port}`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
await page.keyboard.press('Shift');
await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
if (!v.phone) await page.mouse.move(v.w - 2, v.h / 2);
console.log(`warming at Max for ${v.warm} s`);
await page.evaluate(() => globalThis.__tidemote.setSpeed(Infinity));
await page.waitForTimeout(+v.warm * 1000);
await page.evaluate((s) => globalThis.__tidemote.setSpeed(s), +v.speed);
if (v.eval) await page.evaluate(v.eval);
// --zoom Z: no auto camera, the annotations always on and the view held at that zoom (over the busiest part of the
// world, as the director's survey last saw it, or where it is)
if (v.zoom) await page.evaluate((z) => {
  const T = globalThis.__tidemote;
  T.state.notes = 2;
  T.cam.zoom = T.cam.zoomTarget = z;
}, +v.zoom);
else await page.evaluate(() => { if (!globalThis.__tidemote.director.active) document.getElementById('auto-play').click(); });
const t0 = Date.now();
let k = 0;
while (Date.now() - t0 < v.secs * 1000) {
  await page.waitForTimeout(v.every * 1000);
  const info = await page.evaluate(() => { const T = globalThis.__tidemote; return { sim: T.eng.simTime, fps: T.perf?.fps, notes: T.notes ? T.notes.debug() : null, why: T.director.shot?.why?.kind }; });
  log.push(JSON.stringify({ k, ...info }));
  await page.screenshot({ path: path.join(v.out, `s${String(k).padStart(3, '0')}.png`) });
  k++;
}
fs.writeFileSync(path.join(v.out, 'log.txt'), log.join('\n'));
await ctx.close(); server.close();
