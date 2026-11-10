// Drives riding on the built page (docs/hand.md, Riding) and checks it: one Ride button (no Follow), Enter on and off,
// the camera's dive (gradual, to a mid-to-close zoom) and its breathing with the speed, WASD steering with a ramp
// (and not toggling currents, the auto camera, sound or the tide map), a scroll leaving the zoom to the viewer, a
// quick click on another cell getting off, a ride that loses its cell offering Ride a relative, and Esc.
//   npm run build && TIDEMOTE_VK=1 ~/.local/bin/capped node tools/ride-check.mjs
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { vkOn as vk, retryAdapter } from './vk.mjs';
import { launchOptions } from './lib/browser.mjs';
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.resolve(process.argv[2] || 'dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-webgpu'] }));
let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0.7 })); });
if (vk) await ctx.addInitScript(retryAdapter);
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250, timeout: 120000 });
if (vk) await page.keyboard.press('Shift');
await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
await page.waitForTimeout(20000);
// sample the ride each frame for ms: the view's shorter side (world units), the throttle, the hold
const film = (ms) => page.evaluate((ms) => new Promise((res) => {
  const T = globalThis.__tidemote, out = [], t0 = performance.now();
  const f = () => { const r = T.ride.state; out.push({ t: performance.now() - t0, short: T.ride.viewShort(), u: Math.hypot(...r.th.u), s: T.hand.will?.[2] ?? 0, on: r.on }); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(out); };
  requestAnimationFrame(f);
}), ms);
const st = () => page.evaluate(() => { const T = globalThis.__tidemote, s = T.ride.sel(); return { on: T.ride.state.on, follow: T.state.follow, id: s?.id, cells: s?.org?.cells, manual: !!T.ride.state.cam?.manual, members: T.ride.members()?.length || 0 }; });

// a cell of the bonded species with the most cells, else the most common
const serial = await page.evaluate(() => {
  const T = globalThis.__tidemote, sps = [...T.life().reg.values()].filter((x) => x.alive && x.pop > 0);
  const bonded = sps.filter((x) => (x.genome.adhesion || 0) > T.eng.K.adhMin).sort((a, b) => b.pop - a.pop);
  return (bonded[0] || sps.sort((a, b) => b.pop - a.pop)[0]).serial;
});
await page.evaluate((s) => globalThis.__tidemote.findMember(s), serial);
await page.waitForTimeout(2500);
let s0 = await st();
check('jumping to a species rides one of it (follow and ride are one)', s0.on && s0.follow, JSON.stringify(s0));
const acts = await page.evaluate(() => [...document.querySelectorAll('#spec-acts [data-act]')].map((b) => b.dataset.act));
check('the panel has one Ride button and no Follow', acts.includes('ride') && !acts.includes('follow'), JSON.stringify(acts));
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
s0 = await st();
check('Enter gets off: the view stops following', !s0.on && !s0.follow, JSON.stringify(s0));
check('the toast says Ride Off', (await page.evaluate(() => document.getElementById('flash').textContent)) === 'Ride Off');

// the dive: from the whole world, Ride dives to a mid-to-close zoom, gradually
await page.evaluate(() => { const T = globalThis.__tidemote; T.cam.zoomTarget = 1; T.cam.zoom = 1; });
await page.waitForTimeout(800);
await page.click('#spec-acts [data-act="ride"]');
const dive = await film(2200);
// (per 1/60 s over windows of 50 ms, however unevenly frames come headless)
const steps = dive.map((d, i) => { const e = dive.find((q) => q.t >= d.t + 50); return e ? Math.abs(Math.log(e.short / d.short)) * (1000 / 60) / (e.t - d.t) : 0; });
const end = dive.at(-1).short, t98 = dive.find((d) => Math.abs(Math.log(d.short / end)) < Math.log(1.03))?.t;
check('Ride dives in to a mid-to-close zoom', end > 1.2 && end < 9 && dive[0].short / end > 3, `${dive[0].short.toFixed(1)} → ${end.toFixed(2)} units across`);
check('the dive settles within about two seconds (the auto camera flies 9 to 32)', t98 != null && t98 < 2000, `${t98?.toFixed(0)} ms`);
check('the dive is gradual: never more than 10% a 60th of a second', Math.max(...steps) < Math.log(1.10), `largest ${((Math.exp(Math.max(...steps)) - 1) * 100).toFixed(1)}%`);
s0 = await st();
check('Ride button pressed, riding', s0.on && await page.evaluate(() => document.querySelector('#spec-acts [data-act="ride"]')?.getAttribute('aria-pressed') === 'true'), JSON.stringify(s0));

// WASD steer, with a ramp, and do nothing else
const before = await page.evaluate(() => { const T = globalThis.__tidemote; return { currents: T.state.currents, auto: T.director.active, sound: T.sound.on, bands: T.eng.settings.bands }; });
await page.keyboard.down('d');
const hold = await film(2500);
await page.keyboard.up('d');
const rel = await film(2500);
for (const k of ['w', 'a', 's']) { await page.keyboard.press(k); }
await page.waitForTimeout(200);
const after = await page.evaluate(() => { const T = globalThis.__tidemote; return { currents: T.state.currents, auto: T.director.active, sound: T.sound.on, bands: T.eng.settings.bands }; });
check('riding, W A S D leave currents, the auto camera, sound and the tide map alone', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));
// (on the page's clock: each frame's time held to 100 ms, as the page holds it, so a slow headless frame counts as the page counts it)
const clock = (arr) => { let c = 0; arr.forEach((d, i) => { c += i ? Math.min(100, d.t - arr[i - 1].t) : 0; d.c = c; }); return arr; };
clock(hold); clock(rel);
const at = (arr, ms) => arr.find((d) => d.c >= ms) || arr.at(-1);
check('a held key builds speed over a second or two', at(hold, 150).u < 0.15 && at(hold, 600).u < 0.75 && at(hold, 2400).u > 0.9,
  `throttle ${at(hold, 150).u.toFixed(2)} at 0.15 s, ${at(hold, 600).u.toFixed(2)} at 0.6 s, ${at(hold, 2400).u.toFixed(2)} at 2.4 s`);
check('let go, it comes to rest and its hold goes to 0', rel.at(-1).u === 0 && rel.at(-1).s === 0);
const base = Math.min(...hold.slice(0, 10).map((d) => d.short)), wide = Math.max(...hold.map((d) => d.short), ...rel.map((d) => d.short));
check('the view breathes out a little with the speed (subtly)', wide / base > 1.05 && wide / base < 1.3, `×${(wide / base).toFixed(3)}`);

// a scroll leaves the zoom to the viewer for the rest of the ride
await page.mouse.move(683, 384);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(600);
const z0 = await page.evaluate(() => globalThis.__tidemote.cam.zoomTarget);
await page.keyboard.down('d'); await page.waitForTimeout(1500); await page.keyboard.up('d');
const z1 = await page.evaluate(() => globalThis.__tidemote.cam.zoomTarget);
s0 = await st();
check('a scroll stops the dynamic zoom for the ride', s0.manual && s0.on && Math.abs(z1 / z0 - 1) < 1e-6, `${z0.toFixed(3)} → ${z1.toFixed(3)}`);

// one cell of the ridden body dies (as applySample marks it): the ride goes on in another cell of the body
{
  const r0 = await page.evaluate(() => {
    const T = globalThis.__tidemote, s = T.ride.sel();
    if (!s.members || s.members.size < 2) return null;
    const dead = { ...s.particle, kind: 2 };
    s.rehome = { cell: dead, t: T.eng.simTime }; s.members.delete(s.id); s.lastOrg = -1e9;
    return s.id;
  });
  if (r0 == null) check('rode a body to test a death in it', false);
  else {
    await page.waitForTimeout(2500);
    s0 = await st();
    check('its cell dead, the ride goes on in another cell of its body', s0.on && s0.follow && s0.id !== r0 && s0.cells > 1, JSON.stringify(s0));
  }
}
// a quick click on another cell gets off and selects it; on nothing, nothing
const empty = await page.evaluate(async () => {
  const T = globalThis.__tidemote, eng = T.eng, cam = T.cam, [W, H] = eng.grid;
  const cv = document.querySelector('canvas'), dpr = cv.width / innerWidth;
  const ppu = Math.max(cv.width / W, cv.height / H) * cam.zoom / dpr, wrap = (d, L) => d - L * Math.round(d / L);
  const res = await eng.requestPick([cam.x, cam.y], innerWidth / ppu, 0xffffffff);
  const pts = res.entries.map((e) => [innerWidth / 2 + wrap(e.x - cam.x, W) * ppu, innerHeight / 2 + wrap(e.y - cam.y, H) * ppu, e.kind]);
  let best = null, bd = 0;
  for (let x = 420; x < innerWidth - 440; x += 23) for (let y = 90; y < innerHeight - 100; y += 23) {
    const d = Math.min(...pts.filter((p) => p[2] >= 5).map((p) => Math.hypot(p[0] - x, p[1] - y)));
    if (d > bd) { bd = d; best = { x, y, d }; }
  }
  return best;
});
await page.mouse.click(empty.x, empty.y);
await page.waitForTimeout(700);
s0 = await st();
check('a quick click away from any living cell keeps the ride', s0.on, `${empty.d.toFixed(0)} px from the nearest`);
const other = await page.evaluate(async () => {
  const T = globalThis.__tidemote, s = T.ride.sel(), eng = T.eng, cam = T.cam, [W, H] = eng.grid;
  const res = await eng.requestPick([cam.x, cam.y], 6, 0xffffffff);
  const mine = new Set(T.ride.members() || []); mine.add(s.id);
  const cv = document.querySelector('canvas'), dpr = cv.width / innerWidth;
  const ppu = Math.max(cv.width / W, cv.height / H) * cam.zoom / dpr, wrap = (d, L) => d - L * Math.round(d / L);
  const c = res.entries.filter((e) => e.kind >= 5 && !mine.has(e.id)).map((e) => ({ id: e.id, sx: innerWidth / 2 + wrap(e.x - cam.x, W) * ppu, sy: innerHeight / 2 + wrap(e.y - cam.y, H) * ppu }))
    .filter((e) => e.sx > 400 && e.sx < innerWidth - 420 && e.sy > 80 && e.sy < innerHeight - 90).sort((a, b) => Math.hypot(a.sx - innerWidth / 2, a.sy - innerHeight / 2) - Math.hypot(b.sx - innerWidth / 2, b.sy - innerHeight / 2));
  return c.find((e) => Math.hypot(e.sx - innerWidth / 2, e.sy - innerHeight / 2) > 40) || null;
});
if (other) {
  const id0 = (await st()).id;
  await page.mouse.click(other.sx, other.sy);
  await page.waitForTimeout(900);
  s0 = await st();
  check('a quick click on another cell gets off and selects it', !s0.on && !s0.follow && s0.id !== id0, JSON.stringify(s0));
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(600);
  const kr = await page.evaluate(() => ({ on: globalThis.__tidemote.ride.state.on, u: Math.hypot(...globalThis.__tidemote.ride.state.th.u), flash: document.getElementById('flash').textContent }));
  await page.keyboard.up('ArrowLeft');
  check('an arrow key with a cell selected rides it and steers at once', kr.on && kr.u > 0.1, JSON.stringify(kr));
  check('the toast says Ride On', /^Ride On/.test(kr.flash), kr.flash);
} else check('found another cell in view to click', false);

// its cell lost: the ride ends where the view is and the panel offers Ride a relative, which rides one
await page.evaluate(() => { const s = globalThis.__tidemote.ride.sel(); s.lost = true; });
await page.waitForTimeout(600);
s0 = await st();
const offered = await page.evaluate(() => !!document.querySelector('#spec-acts [data-act="riderel"]'));
if (!offered) console.log(await page.evaluate(() => { const s = globalThis.__tidemote.ride.sel(); return JSON.stringify({ rideEnded: s?.rideEnded, memory: !!s?.memory, lost: s?.lost, acts: document.getElementById('spec-acts')?.innerHTML.slice(0, 300), hidden: document.getElementById('spec').hidden }); }));
check('a ride that loses its cell ends, offering Ride a relative', !s0.on && !s0.follow && offered, JSON.stringify({ ...s0, offered }));
if (offered) {
  await page.click('#spec-acts [data-act="riderel"]');
  await page.waitForTimeout(1500);
  s0 = await st();
  check('Ride a relative rides the nearest of its kind', s0.on, JSON.stringify(s0));
}
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
check('Esc gets off', !(await st()).on);
// the moved keys work outside a ride
const k0 = await page.evaluate(() => { const T = globalThis.__tidemote; return { c: T.state.currents, h: T.eng.settings.bands }; });
await page.keyboard.press('c'); await page.keyboard.press('h');
const k1 = await page.evaluate(() => { const T = globalThis.__tidemote; return { c: T.state.currents, h: T.eng.settings.bands }; });
check('C toggles currents and H the tide map', k1.c !== k0.c && !!k1.h !== !!k0.h, JSON.stringify(k1));
await page.keyboard.press('p'); await page.waitForTimeout(600);
check('P starts the auto camera', await page.evaluate(() => globalThis.__tidemote.director.active));
await page.keyboard.press('p');
const help = await page.evaluate(() => document.getElementById('help').textContent);
check('the shortcuts list W A S D for riding and no Follow', /W A S D/.test(help) && !/Follow the specimen/.test(help));
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close(); server.close();
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
