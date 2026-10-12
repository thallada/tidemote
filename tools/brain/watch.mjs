// Runs the built page with #k={...}, grows the world, follows a swimmer of the commonest swimming species,
// records a video and screenshots. tools/gpu-node.sh tools/brain/watch.mjs OUTDIR K_JSON [growSeconds]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [outDir, kjson = '{"brain":1}', grow = '90', zoomArg = '40', particles = '0'] = process.argv.slice(2);
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const out = path.resolve(root, outDir);
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.join(root, 'dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const dir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'tm-watch-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false,
  viewport: { width: 1600, height: 900 }, args: ['--window-size=1600,980', '--window-position=0,0'] });
const page = ctx.pages()[0];
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /error|invalid/i.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript((n) => {
  localStorage.setItem('tidemote.view', JSON.stringify({ v: 2, auto: false, labOpen: false, ...(n ? { particles: n } : {}) }));
  localStorage.setItem('tidemote.sound', '{"on":false}');
}, +particles);
await page.goto(`http://127.0.0.1:${server.address().port}/#k=${encodeURIComponent(kjson)}`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { timeout: 120000 });
await page.evaluate(() => globalThis.__tidemote.setSpeed?.(Infinity));
await page.waitForTimeout(+grow * 1000);
await page.evaluate(() => globalThis.__tidemote.setSpeed?.(1));
const pick = await page.evaluate(async () => {
  const T = globalThis.__tidemote;
  const sw = [...T.life().reg.values()].filter((s) => s.alive && s.genome.swim * (1 - s.genome.photo) > 0.4).sort((a, b) => b.pop - a.pop);
  if (!sw.length) return null;
  await T.findMember(sw[0].serial);
  return { serial: sw[0].serial, pop: sw[0].pop, swim: sw[0].genome.swim, name: sw[0].name };
});
console.log('picked', JSON.stringify(pick));
await page.evaluate((z) => { const { cam } = globalThis.__tidemote; cam.zoom = cam.zoomTarget = z; }, +zoomArg);
await page.mouse.move(10, 450);
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelector('.mv-brain')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, 'specimen.png') });
// a clip: frames at 10 fps for 12 s, assembled by ffmpeg if available
const frames = path.join(out, 'frames');
fs.mkdirSync(frames, { recursive: true });
for (let i = 0; i < 120; i++) { await page.screenshot({ path: path.join(frames, `f${String(i).padStart(3, '0')}.jpg`), quality: 80, type: 'jpeg' }); await page.waitForTimeout(60); }
await page.screenshot({ path: path.join(out, 'specimen2.png') });
console.log('errors', JSON.stringify(errors.slice(0, 10)));
await ctx.close(); server.close();
