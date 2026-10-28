// Drives the built page in Chrome and checks its interactions: a click on a species in the census chart
// opens and highlights it, and a second click on it clears both; Save keeps a species' card in the cabinet and
// Card opens it; the bench, a tool held, Esc, the speed ladder, the pipette loaded from a card and set down (docs/
// hand.md); Settings → Sound → Volume sets the volume by mouse and by finger, turns sound on, and keeps the dock
// slider in step.
//   npm run build && tools/gpu-node.sh tools/ui-check.mjs
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { vkOn as vk, vkLaunch, retryAdapter } from './vk.mjs';
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.resolve('dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// on Linux without a display (TIDEMOTE_VK): headless, on the GPU through Vulkan
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
    await page.click('#spec-acts [data-act="save"]');
    await page.waitForTimeout(5000);
    check(`${tag} Save keeps its card in the cabinet`, await page.evaluate(() => globalThis.__tidemote.cabinet.cards.length === 1 && !!document.querySelector('#spec-acts [data-act="card"]')));
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
  // the bench (docs/hand.md): a tool picked, held on the world, put down; the speed ladder; the pipette
  {
    const T = (f) => page.evaluate(f);
    const vp = page.viewportSize(), at = [vp.width * 0.6, vp.height * 0.35];
    if (touch) { await page.tap('#bench-open'); await page.waitForTimeout(300); await page.tap('.tile[data-tool="lamp"]'); }
    else { await page.keyboard.press('b'); await page.waitForTimeout(300); await page.keyboard.press('3'); await page.keyboard.press('b'); }
    await page.waitForTimeout(300);
    check(`${tag} the bench picks the lamp`, await T(() => globalThis.__tidemote.hand.tool === 'lamp'));
    if (touch) { await page.touchscreen.tap(...at); await page.waitForTimeout(200); }
    const cdp = touch ? await ctx.newCDPSession(page) : null;
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at[0], y: at[1] }] });
    else { await page.mouse.move(...at); await page.mouse.down(); }
    await page.waitForTimeout(1500);
    check(`${tag} the lamp held lights the water`, await T(() => globalThis.__tidemote.eng.hand[3] > 0.3), String(await T(() => globalThis.__tidemote.eng.hand[3])));
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.mouse.up();
    if (touch) await page.tap('#held-down'); else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${tag} ${touch ? 'Put down' : 'Esc'} puts the tool down`, await T(() => globalThis.__tidemote.hand.tool === 'loupe' && globalThis.__tidemote.life().hand.length > 0));
    // the ladder: a speed picked (a slow one: those above real time are on offer only as the GPU sustains them),
    // then a double tap back to real time
    await page.click('#t-speed');
    await page.waitForTimeout(300);
    const rung = page.locator('#ladder .rung[data-v="0.5"]');
    check(`${tag} the speed chip opens the ladder`, await rung.isVisible());
    const rb = await rung.boundingBox();
    check(`${tag} the ladder's rungs are big enough to touch`, rb.height >= 24, `${Math.round(rb.height)}`);
    await rung.click();
    await page.waitForTimeout(300);
    check(`${tag} a rung sets its speed and closes the ladder`, await T(() => globalThis.__tidemote.state.speed === 0.5 && document.getElementById('ladder').hidden));
    await page.click('#t-speed'); await page.click('#t-speed');
    await page.waitForTimeout(300);
    check(`${tag} a double tap on the chip is real time`, await T(() => globalThis.__tidemote.state.speed === 1 && document.getElementById('ladder').hidden));
    // the pipette: a colony from a card, set down
    await T(() => { const t = globalThis.__tidemote, sp = [...t.life().reg.values()].filter((x) => x.alive && x.established).sort((a, b) => b.pop - a.pop)[0]; t.loadCard(sp.serial); });
    const held = () => T(() => globalThis.__tidemote.life().pipette.species.reduce((n, x) => n + (x.made || 0) + x.orgs.reduce((m, o) => m + o.cells.length, 0), 0));
    const n0 = await held();
    check(`${tag} a card loads a colony into the pipette`, n0 >= 12, String(n0));
    // (a click sets down a whole colony, a cell at a time: with ⇧, or on a phone once Set down is on)
    if (touch) { await page.tap('#bench-open'); await page.waitForTimeout(300); await page.tap('.tile[data-tool="pipette"]'); await page.touchscreen.tap(...at); await page.waitForTimeout(300); await page.tap('#held-pull'); await page.touchscreen.tap(...at); }
    else { await page.keyboard.press('8'); await page.keyboard.down('Shift'); await page.mouse.click(...at); await page.keyboard.up('Shift'); }
    await page.waitForTimeout(8000);
    check(`${tag} the pipette sets the colony down`, (await held()) === 0, String(await held()));
    if (touch) await page.tap('#held-down'); else await page.keyboard.press('Escape');
  }
  // the auto camera's Next button (laptop only) and X: on to a new shot
  {
    const nx = () => page.evaluate(() => ({ shown: getComputedStyle(document.getElementById('auto-next')).display !== 'none', active: globalThis.__tidemote.director.active }));
    check(`${tag} Next is hidden while the auto camera is off`, !(await nx()).shown);
    await page.keyboard.press('a');
    await page.waitForTimeout(3000);
    const on = await nx();
    check(`${tag} Next ${touch ? 'stays hidden on a phone' : 'shows beside Auto'} with the auto camera on`, on.active && on.shown === !touch, JSON.stringify(on));
    const shotId = () => page.evaluate(() => globalThis.__tidemote.director.shot?.id);
    let id = await shotId();
    if (!touch) {
      const box = await page.locator('#auto-next').boundingBox(), auto = await page.locator('#auto-play').boundingBox();
      check(`${tag} Next sits right of Auto, a square target`, box.x > auto.x + auto.width - 1 && box.x - (auto.x + auto.width) < 12 && Math.abs(box.width - box.height) < 1 && box.width >= 24, JSON.stringify(box));
      await page.click('#auto-next');
      await page.waitForTimeout(1500);
      check(`${tag} clicking Next moves the camera on`, (await shotId()) !== id && (await nx()).active);
      id = await shotId();
    }
    await page.keyboard.press('x');
    await page.waitForTimeout(1500);
    check(`${tag} X moves the camera on`, (await shotId()) !== id && (await nx()).active);
    await page.keyboard.press('a');
    await page.waitForTimeout(300);
    check(`${tag} Next hides once the auto camera stops`, !(await nx()).shown);
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
