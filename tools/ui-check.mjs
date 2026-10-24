// Drives the built page in Chrome and checks two interactions: a click on a species in the census chart
// opens and highlights it, and a second click on it clears both; Settings → Sound → Volume sets the
// volume by mouse and by finger, turns sound on, and keeps the dock slider in step.
//   npm run build && tools/gpu-node.sh tools/ui-check.mjs
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { vkLayer as vk, vkLaunch, retryAdapter } from './vk.mjs';
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.resolve('dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// on Linux without a display (TIDEMOTE_VK_LAYER): headless, on the GPU through Vulkan
const browser = await chromium.launch(vk ? vkLaunch(['--enable-unsafe-webgpu'])
  : { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, args: ['--enable-unsafe-webgpu'] });
let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
for (const touch of [false, true]) {
  const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 } : { viewport: { width: 1366, height: 657 } });
  await ctx.addInitScript(() => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0.7 })); });
  if (vk) await ctx.addInitScript(retryAdapter);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250, timeout: 120000 });
  if (vk) await page.keyboard.press('Shift'); // headless, the intro waits for a key
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running' && document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
  await page.waitForTimeout(10000);
  const tag = touch ? '[phone]' : '[laptop]';
  if (!touch) {
    // a point on the census chart over a species band
    const pt = await page.evaluate(() => {
      const cv = document.getElementById('chart'), r = cv.getBoundingClientRect();
      for (let y = r.height - 4; y > 4; y -= 2) for (let x = r.width - 6; x > r.width * 0.6; x -= 3) { const h = cv._ch && cv._ch.at(x, y); if (h && h.serial != null) return { x: r.left + x, y: r.top + y, serial: h.serial }; }
      return null;
    });
    check(`${tag} found a species band on the census chart`, !!pt);
    if (pt) {
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(600);
      const a = await page.evaluate(() => ({ spec: !document.getElementById('spec').hidden, focus: !document.getElementById('focus').hidden }));
      check(`${tag} first click opens and highlights the species`, a.spec && a.focus, JSON.stringify(a));
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(600);
      const b = await page.evaluate(() => ({ spec: !document.getElementById('spec').hidden, focus: !document.getElementById('focus').hidden }));
      check(`${tag} second click on the same species clears both`, !b.spec && !b.focus, JSON.stringify(b));
    }
  }
  if (!touch) {
    // a species card from the specimen panel: named with Enter, the name everywhere; Esc closes it
    await page.evaluate(() => { const T = globalThis.__tidemote, sp = [...T.life().reg.values()].filter((x) => x.alive && x.established).sort((a, b) => b.pop - a.pop)[0]; T.openSpecies(sp.serial); });
    await page.waitForTimeout(500);
    await page.click('#spec-acts [data-act="card"]');
    await page.waitForTimeout(2500);
    check(`${tag} Card opens the species card`, await page.evaluate(() => !document.getElementById('card').hidden));
    await page.fill('#card-name', 'Tester’s Swimmer');
    await page.press('#card-name', 'Enter');
    await page.waitForTimeout(800);
    const nm = await page.evaluate(() => ({ head: document.getElementById('spec-name').textContent, given: [...globalThis.__tidemote.life().reg.values()].some((x) => x.given && x.name === 'Tester’s Swimmer') }));
    check(`${tag} a name given on the card renames the species`, nm.given && nm.head === 'Tester’s Swimmer', JSON.stringify(nm));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${tag} Esc closes the card`, await page.evaluate(() => document.getElementById('card').hidden));
    await page.keyboard.press('Escape');
    // Film: R starts thirty seconds, R again stops and saves
    const film = await page.$('#film');
    if (film && await film.isVisible()) {
      await page.keyboard.press('r');
      await page.waitForTimeout(1500);
      const st = await page.evaluate(() => ({ s: globalThis.__tidemote.film.state, pressed: document.getElementById('film').getAttribute('aria-pressed') }));
      check(`${tag} R starts filming`, st.s === 'recording' && st.pressed === 'true', JSON.stringify(st));
      const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await page.keyboard.press('r');
      const d = await dl;
      check(`${tag} R again stops and saves the film`, !!d && /\.(webm|mp4)$/.test(d.suggestedFilename()), d ? d.suggestedFilename() : 'no download');
    }
  }
  // Settings → Sound → Volume
  await page.click('#set-open');
  await page.waitForTimeout(300);
  const sv = await page.$('#set-vol');
  check(`${tag} Settings shows a volume slider`, !!sv && await sv.isVisible());
  if (sv) {
    // (the panel scrolls: on a short laptop screen the slider lies below its fold)
    await sv.scrollIntoViewIfNeeded();
    const box = await sv.boundingBox();
    check(`${tag} the slider is big enough to touch`, box.width >= 120 && box.height >= 24, `${Math.round(box.width)}×${Math.round(box.height)}`);
    // drag to about a quarter
    await page.evaluate(() => { globalThis.__inputs = []; document.getElementById('opts').addEventListener('input', (e) => globalThis.__inputs.push(e.target.value)); });
    if (touch) {
      // a finger drag along the slider
      const cdp = await ctx.newCDPSession(page), y = box.y + box.height / 2;
      const at = (x) => [{ x, y }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(box.x + box.width * 0.7) });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(box.x + box.width * (0.7 - 0.45 * i / 8)) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    else { await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 8 }); await page.mouse.up(); }
    await page.waitForTimeout(800);
    const v = await page.evaluate(() => ({ vol: globalThis.__tidemote.sound.volume, on: globalThis.__tidemote.sound.on, label: document.getElementById('set-vol-v')?.textContent, dock: document.getElementById('vol').value, still: !!document.getElementById('set-vol'), inputs: globalThis.__inputs.join(',') }));
    check(`${tag} moving the slider sets the volume and turns sound on`, v.vol > 0.1 && v.vol < 0.4 && v.on && v.label === `${Math.round(v.vol * 100)}%` && v.dock === String(Math.round(v.vol * 100)) && v.still, JSON.stringify(v));
  }
  check(`${tag} no page errors`, !errs.length, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await browser.close(); server.close(); process.exit(bad ? 1 : 0);
