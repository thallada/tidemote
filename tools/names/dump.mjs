// Species registries of real worlds, for studying how species are named: the built page run
// headless to a simulated time, then every species on record (serial, parent, name, genome) written as JSON.
//
// usage: tools/gpu-node.sh tools/names/dump.mjs [--n 32768] [--minutes 60] [--speed Infinity] [--out reg.json]
// (TIDEMOTE_VK=1 node ... on Linux without a display.)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { retryAdapter } from '../vk.mjs';
import { launchOptions } from '../lib/browser.mjs';
import { viewPrefs } from '../lib/prefs.mjs';
import { arg } from '../lib/args.mjs';

const html = path.resolve(arg('html', fileURLToPath(new URL('../../dist/tidemote.html', import.meta.url))));
const n = +arg('n', 32768), minutes = +arg('minutes', 60);
const speed = arg('speed', 'Infinity') === 'Infinity' ? Infinity : +arg('speed');
const out = arg('out', 'reg.json');
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(html).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const args = ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tidemote-names-')),
  { viewport: { width: 960, height: 600 }, ...launchOptions({ args, headless: true }) });
const page = ctx.pages()[0] || await ctx.newPage();
page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
await page.addInitScript(retryAdapter);
await page.addInitScript((view) => {
  if (sessionStorage.getItem('tm-init')) return;
  sessionStorage.setItem('tm-init', '1');
  localStorage.setItem('tidemote.view', JSON.stringify(view));
  localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
}, viewPrefs({ particles: n, auto: false, labOpen: false }));
await page.goto(`http://127.0.0.1:${server.address().port}/${arg('k') ? `#k=${encodeURIComponent(arg('k'))}` : ''}`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
await page.keyboard.press('Shift');
await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
await page.evaluate((s) => globalThis.__tidemote.setSpeed(s), speed);
const t0 = Date.now();
let last = 0;
for (;;) {
  const t = await page.evaluate(() => globalThis.__tidemote.eng.simTime);
  if (Date.now() - last > 60000) { last = Date.now(); console.log(`${(t / 60).toFixed(1)} min`); }
  if (t >= minutes * 60) break;
  await page.waitForTimeout(3000);
}
const reg = await page.evaluate(() => [...globalThis.__tidemote.life().reg.values()].map((s) => ({
  serial: s.serial, parent: s.parent, name: s.name, hash: s.hash, given: !!s.given, genus: s.genus, established: s.established, peak: s.peak, genome: s.genome })));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const log = await page.evaluate(() => globalThis.__tidemote.life().chronicle.map((e) => ({ t: e.t, type: e.type, text: e.text })));
fs.writeFileSync(out, JSON.stringify({ n, minutes, reg, log }));
console.log(`${reg.length} species on record after ${minutes} min; ${((Date.now() - t0) / 1000).toFixed(0)} s real -> ${out}`);
await ctx.close(); server.close();
