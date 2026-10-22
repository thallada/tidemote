// The look lab: grow a world in the built page (Windows Chrome on the GPU), then hold it still and photograph
// staged scenes of the pool (a water level, ice, raindrops of given ages), swapping in each new composite shader
// as it is written, without growing the world again (docs/catastrophes.md).
//   tools/gpu-node.sh tools/looklab.mjs --dir runs/look [--n 262144] [--mature 90] [--k '{}']
// It waits for DIR/cmd.json ({ id, wgsl?: path to a composite shader, scenes: [...] }); each scene:
//   { name, level: 1, frost: 0, rain: 0, drops: [[dx, dy, age, strength], ...] (from the scene's centre), at: [x, y] | 'shore' | 'ice',
//     zoom: pixels per world unit | 'fit', run: simulated seconds to run first (at speed 1) }
// and writes DIR/NAME.png for each, then DIR/done.json ({ id, errors }). `node tools/looklab.mjs --dump FILE` writes
// the current POST_WGSL to FILE (run it under WSL's node; the lab reads the file).
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));
if (args.dump) {
  const { POST_WGSL } = await import('../src/shaders.js');
  fs.writeFileSync(args.dump, POST_WGSL);
  process.exit(0);
}
const { chromium } = await import('playwright-core');
const v = { dir: 'runs/look', k: '{}', n: 262144, mature: 90, w: 1280, h: 800, html: 'dist/tidemote.html', ...args };
fs.mkdirSync(v.dir, { recursive: true });
const html = path.resolve(v.html);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(html).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'look-')), {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, viewport: null,
  args: [`--window-size=${v.w},${v.h}`, '--window-position=0,0', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0];
page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console] ${m.text().slice(0, 400)}`); });
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
const simTime = () => page.evaluate(() => globalThis.__tidemote.eng.simTime);
const setSpeed = (s) => page.evaluate((s) => globalThis.__tidemote.setSpeed(s), s);
await setSpeed(Infinity);
while (await simTime() < +v.mature) await page.waitForTimeout(500);
await setSpeed(0);
// while a scene is staged the climate holds still (the page ticks it even when paused, which would reset the weather)
await page.evaluate(() => { const c = globalThis.__tidemote.climate(), tick = c.tick.bind(c); c.tick = (dt) => { if (!globalThis.__lookHold) tick(dt); }; });
console.log('ready', (await simTime()).toFixed(0));

let last = null;
const cmdPath = path.join(v.dir, 'cmd.json');
for (;;) {
  await new Promise((r) => setTimeout(r, 400));
  let cmd;
  try { cmd = JSON.parse(fs.readFileSync(cmdPath, 'utf8')); } catch { continue; }
  if (cmd.id === last) continue;
  last = cmd.id;
  if (cmd.quit) break;
  let errors = [];
  if (cmd.eval) console.log('eval', JSON.stringify(await page.evaluate((code) => { const T = globalThis.__tidemote; return eval(code); }, cmd.eval)));
  if (cmd.wgsl) errors = await page.evaluate((code) => globalThis.__tidemote.eng.hotComposite(code), fs.readFileSync(cmd.wgsl, 'utf8'));
  for (const s of errors.length ? [] : cmd.scenes ?? []) {
    if (s.run) {
      await page.evaluate(() => { globalThis.__lookHold = false; });
      const t = await simTime();
      await setSpeed(s.speed ?? 1);
      while (await simTime() < t + s.run) await page.waitForTimeout(100);
      await setSpeed(0);
    }
    await page.evaluate((s) => {
      globalThis.__lookHold = !s.live;
      const T = globalThis.__tidemote, e = T.eng, g = e.grid;
      if (!s.live) e.level = s.level ?? 1;
      if (!s.live) { e.frost = s.frost ?? 0; e.rain = s.rain ?? (s.drops?.length ? 1 : 0); e.freezing = s.freezing ?? 0; }
      let [x, y] = [g[0] / 2, g[1] / 2];
      const near = (f, lv) => {
        let best = Infinity;
        for (let j = 0; j < g[1]; j++) for (let i = 0; i < g[0]; i++) {
          const d = Math.abs(f[j * g[0] + i] - lv), r = Math.hypot(i - g[0] / 2, j - g[1] / 2);
          if (d < 0.006 && r < best) { best = r; [x, y] = [i + 0.5, j + 0.5]; }
        }
      };
      if (s.at === 'shore' && e.relief) near(e.relief, e.level);
      else if (s.at === 'ice' && e.iceOrder) near(e.iceOrder, e.frost);
      else if (Array.isArray(s.at)) [x, y] = s.at;
      x += s.off?.[0] ?? 0; y += s.off?.[1] ?? 0;
      if (!s.live) {
        e.drops.fill(0);
        (s.drops ?? []).forEach(([dx, dy, age, w], k) => e.drops.set([x + dx, y + dy, e.simTime - age, w ?? 2], k * 4));
      }
      const fit = Math.max(innerWidth / g[0], innerHeight / g[1]), z = s.zoom ?? 'fit';
      T.cam.x = x; T.cam.y = y; T.cam.anchor = null;
      T.cam.zoom = T.cam.zoomTarget = z === 'fit' ? Math.min(innerWidth / g[0], innerHeight / g[1]) / fit : Math.max(z / fit, 1);
    }, s);
    await page.waitForTimeout(s.wait ?? 700);
    await page.screenshot({ path: path.join(v.dir, `${s.name}.png`) });
  }
  fs.writeFileSync(path.join(v.dir, 'done.json'), JSON.stringify({ id: cmd.id, errors }));
  console.log('done', cmd.id, errors.length ? errors.slice(0, 5) : '');
}
await ctx.close(); server.close();
