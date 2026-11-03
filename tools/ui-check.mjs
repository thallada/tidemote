// Drives the built page in Chrome and checks its interactions: a click on a species in the census chart
// opens and highlights it, and a second click on it clears both; Save keeps a species' card in the cabinet and
// Card opens it; the bench, a tool held, Esc, the speed ladder, the pipette loaded from a card and set down (docs/
// hand.md); filming (R, the strip under the rail and its Stop, the red frame); the phone dock's slots even and
// its labels fitting with every tool in hand; Settings → Audio → Volume sets the volume by mouse and by finger,
// turns sound on, and keeps the dock slider in step.
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
    // Film: R starts it, the strip under the rail and the red frame show while it rolls, counting time and
    // size; R again stops and saves; then the strip's Stop does
    const film = await page.$('#film');
    if (film && await film.isVisible()) {
      await page.keyboard.press('r');
      // (the first bytes come with the recorder's first whole fragment, about two seconds in)
      await page.waitForFunction(() => !/^0(\.0)? MB$/.test(document.getElementById('rec-mb').textContent), null, { timeout: 8000 }).catch(() => {});
      const st = await page.evaluate(() => ({ s: globalThis.__tidemote.film.state, pressed: document.getElementById('film').getAttribute('aria-pressed'), bar: !document.getElementById('recbar').hidden, frame: !document.getElementById('recframe').hidden, t: document.getElementById('rec-t').textContent, mb: document.getElementById('rec-mb').textContent }));
      check(`${tag} R starts filming: the strip and the frame show, counting`, st.s === 'recording' && st.pressed === 'true' && st.bar && st.frame && /^0:0[1-8]$/.test(st.t) && /MB$/.test(st.mb) && st.mb !== '0.0 MB', JSON.stringify(st));
      const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await page.keyboard.press('r');
      const d = await dl;
      check(`${tag} R again stops and saves the film`, !!d && /\.(webm|mp4)$/.test(d.suggestedFilename()), d ? d.suggestedFilename() : 'no download');
      await page.waitForFunction(() => globalThis.__tidemote.film.state === 'idle', null, { timeout: 10000 });
      check(`${tag} the strip and the frame go when it is saved`, await page.evaluate(() => document.getElementById('recbar').hidden && document.getElementById('recframe').hidden));
    }
  }
  {
    // the strip's Stop (on a phone the only one in sight): started from Settings' Now, tapped or clicked
    await page.evaluate(() => globalThis.__tidemote.filmAct('now'));
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const b = document.getElementById('rec-stop').getBoundingClientRect(), s = document.getElementById('recbar').getBoundingClientRect(); return { w: b.width, h: b.height, left: s.left, right: s.right, vw: innerWidth }; });
    check(`${tag} the strip fits the window and its Stop is a fair target`, r.left >= 0 && r.right <= r.vw && r.w >= 24 && r.h >= 24, JSON.stringify(r));
    const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    if (touch) await page.tap('#rec-stop'); else await page.click('#rec-stop');
    const d = await dl;
    check(`${tag} the strip's Stop stops and saves the film`, !!d, d ? d.suggestedFilename() : 'no download');
    await page.waitForFunction(() => globalThis.__tidemote.film.state === 'idle', null, { timeout: 10000 }).catch(() => {});
  }
  // the phone's dock: equal slots, each label inside its slot with room to spare, with every tool in hand (the
  // Bench slot names it), paused and at the fastest speed, from the narrowest phone up; nothing scrolls sideways
  if (touch) {
    const fit = (min) => page.evaluate((min) => {
      const dock = document.getElementById('dock'), bad = [];
      const slots = [...dock.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0);
      const ws = slots.map((b) => b.getBoundingClientRect().width);
      for (const b of slots) {
        // (the label under the icon, or under the speed: as wide as its text)
        const lab = b.querySelector(':scope > small') || b.querySelector(':scope > span');
        if (!lab || !lab.getBoundingClientRect().width) { bad.push(`${b.id} unlabeled`); continue; }
        const r = b.getBoundingClientRect(), t = lab.getBoundingClientRect(), room = Math.min(t.left - r.left, r.right - t.right);
        if (lab.scrollWidth > lab.clientWidth + 0.5 || room < min) bad.push(`${b.id} "${lab.textContent || 'Speed'}" ${room.toFixed(1)}px`);
      }
      return { n: slots.length, even: Math.max(...ws) - Math.min(...ws) < 1, scroll: dock.scrollWidth > dock.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth, bad };
    }, min);
    for (const [w, min] of [[320, 2], [360, 4], [390, 4]]) {
      await page.setViewportSize({ width: w, height: 700 }); await page.waitForTimeout(400);
      const seen = [];
      for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8']) { await page.keyboard.press(k); await page.waitForTimeout(150); seen.push(await fit(min)); }
      await page.keyboard.press('0');
      await page.evaluate(() => globalThis.__tidemote.setSpeed('fast', true)); await page.waitForTimeout(1200); seen.push(await fit(min));
      await page.evaluate(() => globalThis.__tidemote.setSpeed(1, true)); await page.click('#t-play'); await page.waitForTimeout(150); seen.push(await fit(min)); await page.click('#t-play');
      const bad = [...new Set(seen.flatMap((s) => s.bad))];
      check(`[phone ${w}] the dock's seven slots are even, every label fits (${min}px), nothing scrolls`, seen.every((s) => s.n === 7 && s.even && !s.scroll) && !bad.length, JSON.stringify({ n: seen.map((s) => s.n).join(''), bad }));
    }
    await page.setViewportSize({ width: 390, height: 700 }); await page.waitForTimeout(400);
  }
  // the bench (docs/hand.md): a tool picked, held on the world, put down; the speed ladder; the pipette
  {
    const T = (f, a) => page.evaluate(f, a);
    const vp = page.viewportSize(), at = [vp.width * 0.6, vp.height * 0.35];
    check(`${tag} the page opens with ${touch ? 'Pan' : 'the loupe'} in hand`, await T(() => globalThis.__tidemote.hand.tool) === (touch ? 'none' : 'loupe'));
    if (!touch) {
      await page.keyboard.press('3'); await page.keyboard.press('3');
      check(`${tag} a tool's key again puts it down`, await T(() => globalThis.__tidemote.hand.tool === 'none'));
      await page.keyboard.press('1');
    }
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
    check(`${tag} ${touch ? 'Its ×' : 'Esc'} puts the tool down`, await T(() => globalThis.__tidemote.hand.tool === 'none' && globalThis.__tidemote.life().hand.length > 0));
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
    // the chip held and dragged down two rungs: ×0.5 once let go
    {
      const cb = await page.locator('#t-speed').boundingBox(), cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
      const rh = rb.height;
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
        await page.waitForTimeout(400);
        for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy + (k / 6) * 2.1 * rh }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(400);
        await page.mouse.move(cx, cy + 2.1 * rh, { steps: 6 }); await page.mouse.up();
      }
      await page.waitForTimeout(300);
      check(`${tag} the chip held and dragged picks a speed`, await T(() => globalThis.__tidemote.state.speed === 0.5 && document.getElementById('ladder').hidden), String(await T(() => globalThis.__tidemote.state.speed)));
      await page.keyboard.press('/');
      // dragged to the screen's bottom edge and held there, it goes on down the ladder by itself to the slowest
      await page.waitForTimeout(300);
      const edge = page.viewportSize().height - 3;
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
        await page.waitForTimeout(400);
        for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy + (k / 6) * (edge - cy) }] });
      } else {
        await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(400);
        await page.mouse.move(cx, edge, { steps: 6 });
      }
      await page.waitForTimeout(2500);
      const slowest = await T(() => Math.min(...[...document.querySelectorAll('#ladder .rung')].map((r) => +r.dataset.v).filter((v) => v >= 0)));
      if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.mouse.up();
      await page.waitForTimeout(300);
      check(`${tag} the chip dragged to the screen's edge and held goes on to the slowest`, await T((v) => globalThis.__tidemote.state.speed === v, slowest), `${await T(() => globalThis.__tidemote.state.speed)} of ${slowest}`);
      await page.keyboard.press('/');
    }
    // the pipette: a colony from a card, set down
    await T(() => { const t = globalThis.__tidemote, sp = [...t.life().reg.values()].filter((x) => x.alive && x.established).sort((a, b) => b.pop - a.pop)[0]; t.loadCard(sp.serial); });
    const held = () => T(() => globalThis.__tidemote.life().pipette.species.reduce((n, x) => n + (x.made || 0) + x.orgs.reduce((m, o) => m + o.cells.length, 0), 0));
    const n0 = await held();
    check(`${tag} a card loads a colony into the pipette`, n0 >= 12, String(n0));
    // (a click sets down a whole colony, a cell at a time: with ⇧, or on a phone once Dispense is on)
    if (touch) {
      // (the tile scrolled into view and settled first; a tap high on the world folds the drawer, which is tall)
      await page.tap('#bench-open'); await page.waitForTimeout(300);
      await page.locator('.tile[data-tool="pipette"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await page.tap('.tile[data-tool="pipette"]'); await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.15); await page.waitForTimeout(300);
      await page.tap('#held-dispense'); await page.touchscreen.tap(...at);
    }
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
  // Settings → Audio → Volume (an older build has it on Display)
  await page.click('#set-open');
  await page.waitForTimeout(300);
  const tabOf = async (t) => { const b = await page.$(`#set-tabs [data-tab="${t}"]`); if (b) { await b.click(); await page.waitForTimeout(300); } return !!b; };
  await tabOf('audio');
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
  // Settings → Audio's mix (src/audio/mix.js; an older build has none): a choice reaches the soundtrack and is shown
  if (await page.$('[data-o="mix-water"]')) {
    await page.click('[data-o="mix-water"][data-v="0"]');
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ water: globalThis.__tidemote.sound.mix.water, shown: document.querySelector('[data-o="mix-water"][data-v="0"]')?.getAttribute('aria-pressed') ?? document.querySelector('[data-o="mix-water"][data-v="0"]')?.className }));
    await page.click('[data-o="mix-water"][data-v="2"]');
    check(`${tag} an Audio mix choice sets the soundtrack's mix`, m.water === 0 && /true|on|sel/.test(String(m.shown)), JSON.stringify(m));
  }
  // Settings → Display's look (src/look.js; an older build has none): Strong, then Heavy grain, set the look's words;
  // Off clears them and hides the row under it
  await tabOf('display');
  if (await page.$('[data-o="microlook"]')) {
    const pick = async (o, v) => { const b = await page.$(`[data-o="${o}"][data-v="${v}"]`); await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(300); };
    await pick('microlook', 3);
    await pick('grain', 2);
    const on = await page.evaluate(() => ({ rims: globalThis.__tidemote.eng.look[2], grain: globalThis.__tidemote.eng.look[7] }));
    await pick('microlook', 0);
    const off = await page.evaluate(() => ({ sum: [...globalThis.__tidemote.eng.look].reduce((a, x) => a + Math.abs(x), 0), rows: !!document.querySelector('[data-o="grain"]') }));
    await pick('microlook', 2);
    check(`${tag} the microscope look's settings set the look`, Math.abs(on.rims - 0.45 * 1.35) < 1e-5 && Math.abs(on.grain - 0.5 * 1.35) < 1e-5 && off.sum === 0 && !off.rows, JSON.stringify({ ...on, ...off }));
  }
  check(`${tag} no page errors`, !errs.length, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await browser.close(); server.close(); process.exit(bad ? 1 : 0);
