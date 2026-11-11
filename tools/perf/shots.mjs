// Screenshots of a saved world at a few zooms, paused, for comparing rendering variants pixel by pixel.
//   tools/gpu-node.sh tools/perf/shots.mjs WORLD OUTDIR [initScript] [zooms]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchOptions } from '../lib/browser.mjs';
import { viewPrefs } from '../lib/prefs.mjs';
const [world, outDir, init, zoomList, look] = process.argv.slice(2);
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
fs.mkdirSync(path.resolve(root, outDir), { recursive: true });
const server = http.createServer((req, res) => {
  const file = req.url.startsWith('/w') ? path.join(root, 'runs/perf/worlds', `${world}.bin`) : path.join(root, 'dist/tidemote.html');
  res.writeHead(200); fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const dir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'tm-shots-'));
const ctx = await chromium.launchPersistentContext(dir, { ...launchOptions({ args: ['--window-size=1600,900', '--window-position=0,0'], vk: false }), viewport: null });
const page = ctx.pages()[0];
const meta = JSON.parse(fs.readFileSync(path.join(root, 'runs/perf/worlds', `${world}.bin`)).subarray(4, 4 + fs.readFileSync(path.join(root, 'runs/perf/worlds', `${world}.bin`)).readUInt32LE(0)).toString());
// the default look (look = 'default'), or plain: no optics, specks or trails, so frames compare pixel by pixel; the
// interface hidden (Settings → Display → Interface, U), the scale bar and its ticks with it: only the world shows
const view = viewPrefs({ particles: meta.cpu.count, auto: false, labOpen: false, ui: false, scale: 1, ...(look === 'default' ? {} : { look: 0, specks: false, trails: 0 }) });
await page.addInitScript(({ view, init }) => {
  localStorage.setItem('tidemote.view', JSON.stringify(view));
  localStorage.setItem('tidemote.sound', '{"on":false}');
  if (init) (0, eval)(init);
}, { view, init });
const base = `http://127.0.0.1:${server.address().port}`;
await page.goto(`${base}/`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running');
// the intro gone before the world is loaded: in an automated browser it goes by itself a few seconds after the
// world first runs (src/main.js, the menu), and a world loaded and paused before then is shot under the title;
// then faded out (1.2 s)
await page.waitForFunction(() => document.body.classList.contains('live') && getComputedStyle(document.getElementById('intro')).opacity === '0', null, { polling: 250 });
await page.evaluate(async (url) => {
  const T = globalThis.__tidemote, buf = await (await fetch(url)).arrayBuffer();
  const head = new Uint32Array(buf, 0, 1)[0], meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, head)));
  const gpu = {}; let at = 4 + head;
  for (const [k, size] of meta.sizes) { gpu[k] = buf.slice(at, at + size); at += size; }
  T.loadWorld({ cpu: meta.cpu, gpu });
  // one step sorts the world; then hold it still
  await new Promise((r) => setTimeout(r, 300));
  T.state.paused = true;
  document.body.classList.add('cursor-off');
}, `${base}/w`);
const zooms = (zoomList || '1,4,30,150,600').split(',').map(Number);
for (const z of zooms) {
  await page.evaluate((z) => {
    const T = globalThis.__tidemote, { cam, eng } = T;
    cam.x = eng.grid[0] * 0.37; cam.y = eng.grid[1] * 0.61;
    const ppuFit = Math.max(innerWidth / eng.grid[0], innerHeight / eng.grid[1]);
    cam.zoom = cam.zoomTarget = Math.max(1, Math.min(T.maxZoom(), z === 1 ? 1 : z / ppuFit)); cam.anchor = null;
  }, z);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.resolve(root, outDir, `z${z}.png`) });
}
await ctx.close(); server.close();
