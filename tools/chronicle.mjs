// The chronicler in a real world: the built page in headless Chromium, run at a speed to a simulated time,
// then its stories printed with how many it told an hour, and every candidate it weighed by kind (the
// best of each, with its score). docs/chronicler.md.
//
// usage: node tools/chronicle.mjs [--n 131072] [--minutes 60] [--speed 16|Infinity] [--k '{...}'] [--out stories.json]
// On Linux without a display set TIDEMOTE_VK_LAYER (docs/headless-gpu.md) to run on the GPU; otherwise Playwright's
// Chromium uses SwiftShader, which is slow but works at small sizes.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const html = path.resolve(arg('html', fileURLToPath(new URL('../dist/tidemote.html', import.meta.url))));
const n = +arg('n', 131072), minutes = +arg('minutes', 60);
const speed = arg('speed', '16') === 'Infinity' ? Infinity : +arg('speed', '16');
const W = +arg('w', 1280), H = +arg('h', 800);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(html).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const vk = process.env.TIDEMOTE_VK_LAYER;
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tidemote-chronicle-')), {
  headless: true, viewport: { width: W, height: H },
  ...(vk ? { ignoreDefaultArgs: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'], env: { ...process.env, VK_ADD_LAYER_PATH: vk, VK_INSTANCE_LAYERS: 'VK_LAYER_TIDEMOTE_headless' } } : {}),
  args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    ...(vk ? ['--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist', '--disable-vulkan-surface'] : [])],
});
const page = ctx.pages()[0] || await ctx.newPage();
page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.log(`[console] ${m.text().slice(0, 400)}`); });
// the first adapter asked for in a headless page can come back null: ask once more
await page.addInitScript(() => { const req = navigator.gpu.requestAdapter.bind(navigator.gpu); navigator.gpu.requestAdapter = async (o) => (await req(o)) || req(o); });
await page.addInitScript((n) => {
  if (sessionStorage.getItem('tm-init')) return;
  sessionStorage.setItem('tm-init', '1');
  localStorage.setItem('tidemote.view', JSON.stringify({ v: 2, particles: n, auto: false, labOpen: false }));
  localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
}, n);
await page.goto(`http://127.0.0.1:${server.address().port}/${arg('k') ? `#k=${encodeURIComponent(arg('k'))}` : ''}`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
await page.keyboard.press('Shift'); // without a gesture the page holds the world on its intro
await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
const t0 = Date.now();
await page.evaluate((s) => { globalThis.__tidemote.chronDebug = []; globalThis.__tidemote.setSpeed(s); }, speed);
let lastPrint = 0;
for (;;) {
  const st = await page.evaluate(() => { const T = globalThis.__tidemote, L = T.life(); return { t: T.eng.simTime, living: L.counts[3], thriving: L.thriving, stories: L.chronicle.filter((e) => e.type === 'story').length, all: L.chronicle.length }; });
  if (Date.now() - lastPrint > 30000) { lastPrint = Date.now(); console.log(`${(st.t / 60).toFixed(1)} min  living ${st.living}  thriving ${st.thriving}  stories ${st.stories} of ${st.all} entries`); }
  if (st.t >= minutes * 60) break;
  await page.waitForTimeout(2000);
}
const { log, debug } = await page.evaluate(() => { const T = globalThis.__tidemote; T.setSpeed(1); return { log: T.life().chronicle.slice().reverse().map((e) => ({ t: e.t, type: e.type, text: e.text })), debug: T.chronDebug }; });
const kinds = {};
for (const d of debug) for (const [k, r, txt] of d.all) { const e = (kinds[k] ||= { n: 0, max: 0, best: '' }); e.n++; if (r > e.max) { e.max = r; e.best = txt; } }
console.log('\ncandidates weighed, by kind (ticks proposed, best score, its words):');
for (const [k, e] of Object.entries(kinds).sort((a, b) => b[1].max - a[1].max)) console.log(`  ${k.padEnd(11)} ${String(e.n).padStart(5)}  ${e.max.toFixed(2)}  ${e.best}`);
console.log('\nstories told:');
const stories = log.filter((e) => e.type === 'story');
for (const e of stories) console.log(`${(e.t / 60).toFixed(1).padStart(7)} min  ${e.text}`);
console.log(`\n${stories.length} stories in ${minutes} simulated minutes (${(stories.length / (minutes / 60)).toFixed(1)} an hour) at ×${speed}, among ${log.length} log entries; ${((Date.now() - t0) / 1000).toFixed(0)} s real`);
if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ n, minutes, speed, stories, kinds }, null, 1));
await ctx.close(); server.close();
