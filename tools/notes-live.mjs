// Film the auto camera with the interface and the live annotations showing (docs/annotations.md): a fresh world warmed
// at Max, then a screenshot every few seconds and a log of what the notes held and cost (__tidemote.notes.debug()).
//   tools/gpu-node.sh tools/notes-live.mjs --out runs/notes/a [--warm 60] [--secs 60] [--every 5] [--speed 1] [--zoom Z] [--phone] [--eval JS] [--audit]
// --audit: how steadily the marks and labels ride the scene and any text that overlaps (src/noteaudit.js), in audit.json
// --frames: the time between frames as the page draws them (requestAnimationFrame), its spread and its long ones, with
// the annotations' own share of each frame (the browser's long tasks too), in frames.json
// --notes 0: the annotations off (state.notes = 0), to compare
// --mouse X,Y: the pointer held there (nudged now and then, so a loupe that follows it shows), to check the loupe
// --when TYPE: also a screenshot (w-*.png) whenever a note of that type shows, 4 s apart at most
// --profile S: a CPU profile of the page's main thread over S seconds, from --profileAt seconds in (default 30): the
// functions that took the most time themselves, in profile.txt
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { launchOptions, windowFlags } from './lib/browser.mjs';
import { viewPrefs } from './lib/prefs.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));
const v = { out: 'runs/notes/a', warm: 60, secs: 60, every: 5, speed: 1, n: 131072, w: 1440, h: 900, html: 'dist/tidemote.html', ...args };
fs.mkdirSync(v.out, { recursive: true });
const html = path.resolve(v.html);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(html).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'live-')), {
  ...launchOptions({ args: windowFlags(v.w, v.h), vk: false }),
  // --phone: a phone's screen (390 × 844 CSS px, touch), else the window's own
  ...(v.phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: null }) });
const page = ctx.pages()[0];
page.setDefaultTimeout(0);
const log = [];
page.on('pageerror', (e) => { console.log(`[page error] ${e.message}`); log.push(`pageerror ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()} ${m.text()}`); });
await page.addInitScript((view) => {
  if (sessionStorage.getItem('tm-init')) return;
  sessionStorage.setItem('tm-init', '1');
  localStorage.setItem('tidemote.view', JSON.stringify(view));
  localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
}, viewPrefs({ particles: +v.n, auto: false, labOpen: false }));
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
if (v.audit) await page.evaluate(() => globalThis.__tidemote.noteView.audit('reset'));
if (v.notes != null) await page.evaluate((x) => { const T = globalThis.__tidemote; setTimeout(() => { T.state.notes = x; }, 100); }, +v.notes);
if (v.frames) await page.evaluate(() => {
  const F = (globalThis.__frames = { d: [], long: [] });
  let last = performance.now();
  const tick = (t) => { F.d.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) F.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: false }); } catch {}
});
// (the loops beside the main one stop when it ends and swallow their own errors, so none outlives the browser)
let done = false;
if (v.mouse) {
  const [mx, my] = v.mouse.split(',').map(Number);
  (async () => { for (let q = 0; !done; q++) { await page.mouse.move(mx + (q % 2) * 3, my).catch(() => {}); await page.waitForTimeout(400).catch(() => {}); } })().catch(() => {});
}
const t0 = Date.now();
let k = 0;
if (v.when) (async () => {
  let shots = 0, last = 0;
  while (!done && Date.now() - t0 < v.secs * 1000 && shots < 12) {
    await page.waitForTimeout(700).catch(() => {});
    const on = await page.evaluate((ty) => globalThis.__tidemote.notes.notes.some((n) => n.type === ty && n.exitAt == null && performance.now() / 1000 - n.born > 1.5), v.when).catch(() => false);
    if (on && Date.now() - last > 4000) { last = Date.now(); await page.screenshot({ path: path.join(v.out, `w-${String(shots++).padStart(2, '0')}.png`) }).catch(() => {}); }
  }
})().catch(() => {});
if (v.profile) setTimeout(async () => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await new Promise((r) => setTimeout(r, +v.profile * 1000));
  const { profile } = await cdp.send('Profiler.stop');
  // self time by function, from the samples' intervals
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map();
  profile.samples.forEach((id, i) => {
    const n = byId.get(id), f = n.callFrame, key = `${f.functionName || '(anon)'} :${f.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000);
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const lines = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k2, ms]) => `${(ms / v.profile).toFixed(2).padStart(8)} ms/s  ${(100 * ms / total).toFixed(1).padStart(5)}%  ${k2}`);
  fs.writeFileSync(path.join(v.out, 'profile.txt'), lines.join('\n'));
  console.log(lines.slice(0, 25).join('\n'));
}, (+v.profileAt || 30) * 1000);
while (Date.now() - t0 < v.secs * 1000) {
  await page.waitForTimeout(v.every * 1000);
  const info = await page.evaluate(() => { const T = globalThis.__tidemote; return { sim: T.eng.simTime, fps: T.perf?.fps, notes: T.notes ? T.notes.debug() : null, why: T.director.shot?.why?.kind }; });
  log.push(JSON.stringify({ k, ...info }));
  await page.screenshot({ path: path.join(v.out, `s${String(k).padStart(3, '0')}.png`) });
  k++;
}
if (v.audit) {
  const a = await page.evaluate(() => globalThis.__tidemote.noteView.audit());
  fs.writeFileSync(path.join(v.out, 'audit.json'), JSON.stringify(a, null, 1));
  console.log(JSON.stringify({ frames: a.frames, overlapFrames: a.overlapFrames, jerk: a.jerk, swaps: a.swaps, hidden: a.hidden, blinks: a.blinks, blinked: a.blinked }, null, 1));
  console.log(a.examples.slice(0, 12).join('\n'));
}
if (v.frames) {
  const F = await page.evaluate(() => globalThis.__frames);
  const d = F.d.slice(30).sort((a, b) => a - b), q = (p) => d[Math.min(d.length - 1, Math.floor(p * d.length))];
  const r = { frames: d.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +d[d.length - 1].toFixed(1),
    over25: d.filter((x) => x > 25).length, over50: d.filter((x) => x > 50).length, over100: d.filter((x) => x > 100).length, longTasks: F.long.length, longMs: F.long.reduce((a, x) => a + x[1], 0) };
  fs.writeFileSync(path.join(v.out, 'frames.json'), JSON.stringify({ ...r, long: F.long }, null, 1));
  console.log('frames', JSON.stringify(r));
}
fs.writeFileSync(path.join(v.out, 'log.txt'), log.join('\n'));
done = true;
await ctx.close(); server.close();
