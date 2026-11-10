// Drives the intro's menu in Chrome as a visitor meets it (navigator.webdriver hidden, so the world waits for
// Begin) and checks it: a first visit measures the GPU and holds the world on Begin; a count chosen while the
// GPU is still measured cuts the measuring short, seeds that count and is kept; a saved world chosen while
// measured opens and begins; a click outside an open panel and Escape close it without beginning; Tab and Shift
// do not begin, another key does; and at phone and laptop sizes the open panels fit the screen.
//   npm run build && tools/gpu-node.sh tools/menu-check.mjs [--out DIR for screenshots]
//   (on Linux without a display: TIDEMOTE_VK=1 tools/capped.sh node tools/menu-check.mjs)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { vkOn as vk, retryAdapter } from './vk.mjs';
import { launchOptions } from './lib/browser.mjs';
const outAt = process.argv.indexOf('--out'), out = outAt > 0 ? process.argv[outAt + 1] : null;
if (out) fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.resolve('dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-webgpu'] }));
let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };

for (const size of [{ tag: 'laptop', viewport: { width: 1366, height: 768 } }, { tag: 'phone', viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }]) {
  const { tag, ...opts } = size;
  const ctx = await browser.newContext(opts);
  if (vk) await ctx.addInitScript(retryAdapter);
  // as a visitor's browser (the page lets an automated one's intro go by itself); a small pool, sound off
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.__MC_MAX = 65536;
    if (sessionStorage.getItem('i')) return;
    sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0.7 }));
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const st = () => page.evaluate(() => ({ phase: __tidemote.state.phase, n: __tidemote.eng.count, live: document.body.classList.contains('live'), paused: __tidemote.state.paused, kept: __tidemote.state.perf.particles, open: !document.getElementById('menu-panel').hidden }));
  const shot = (name) => out && page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
  const held = () => page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running' && document.getElementById('intro').classList.contains('ask'), null, { polling: 100, timeout: 120000 });
  const measuring = () => page.waitForFunction(() => /Measuring/.test(document.getElementById('calib').textContent), null, { polling: 50, timeout: 120000 });
  // the open panel within the screen, and nothing in it wider than it
  const fits = () => page.evaluate(() => {
    const p = document.getElementById('menu-panel').getBoundingClientRect();
    const over = [...document.querySelectorAll('#menu-panel *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.left < p.left - 1 || r.right > p.right + 1); }).length;
    return { inView: p.top >= 0 && p.bottom <= innerHeight && p.left >= 0 && p.right <= innerWidth, over };
  });

  // a first visit, left alone: measured, then held on Begin
  await page.goto(url);
  await held();
  await page.waitForTimeout(1000);
  let s = await st();
  check(`${tag} first visit held on Begin`, !s.live && s.paused && s.kept == null, JSON.stringify(s));
  await shot('ready');
  await page.click('#menu-n');
  let f = await fits();
  check(`${tag} particles panel fits`, f.inView && !f.over, JSON.stringify(f));
  check(`${tag} Auto shows the measured count`, /\d/.test(await page.textContent('[data-n="auto"]')));
  await shot('particles');
  await page.evaluate(() => __tidemote.saveWorld('Measured pool'));

  // a count chosen while the GPU is measured
  await page.reload();
  await measuring();
  await page.click('#menu-n'); await page.click('[data-n="16384"]');
  await page.waitForFunction(() => __tidemote.eng.count === 16384 && document.getElementById('intro').classList.contains('ask'), null, { polling: 50, timeout: 60000 });
  s = await st();
  check(`${tag} a count cuts the measuring and is seeded, held`, s.n === 16384 && s.kept === 16384 && !s.live && s.paused, JSON.stringify(s));
  await page.click('#begin');
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 100, timeout: 20000 });
  s = await st();
  check(`${tag} Begin starts it`, s.live && !s.paused && s.n === 16384, JSON.stringify(s));

  // the kept count: no measuring on the next visit
  await page.reload();
  await held();
  s = await st();
  check(`${tag} the kept count is used`, s.n === 16384 && !(await page.textContent('#calib')).includes('Measuring'), JSON.stringify(s));

  // a saved world chosen while measured opens and begins
  await page.evaluate(() => localStorage.removeItem('tidemote.view'));
  await page.reload();
  await measuring();
  await page.click('#menu-w');
  await page.waitForSelector('.menu-list .w-row:not([disabled])');
  f = await fits();
  check(`${tag} saved worlds panel fits`, f.inView && !f.over, JSON.stringify(f));
  await shot('worlds');
  await page.click('.menu-list .w-row');
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 50, timeout: 60000 });
  s = await st();
  check(`${tag} a saved world opens and begins`, s.live && !s.paused && s.n === 65536 && /Measured pool/.test(await page.textContent('#calib')), JSON.stringify(s));

  // closing a panel never begins; Tab and Shift do not, another key does
  await page.reload();
  await held();
  await page.click('#menu-w'); await page.mouse.click(8, 8); await page.waitForTimeout(150);
  s = await st();
  check(`${tag} a click outside closes the panel`, !s.open && !s.live, JSON.stringify(s));
  await page.click('#menu-n'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  s = await st();
  check(`${tag} Escape closes the panel`, !s.open && !s.live, JSON.stringify(s));
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift'); await page.waitForTimeout(150);
  check(`${tag} Tab and Shift do not begin`, !(await st()).live);
  await page.keyboard.press('KeyG'); await page.waitForTimeout(300);
  s = await st();
  check(`${tag} another key begins`, s.live && !s.paused, JSON.stringify(s));
  check(`${tag} no page errors`, !errs.length, errs.join(' | '));
  await ctx.close();
}
await browser.close(); server.close();
console.log(bad ? `${bad} failed` : 'all ok');
process.exit(bad ? 1 : 0);
