// Screenshots of a fresh world at the default look as it grows: tools/gpu-node.sh tools/perf/fresh.mjs N OUTDIR [seconds,...]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [n, outDir, times] = process.argv.slice(2);
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
fs.mkdirSync(path.resolve(root, outDir), { recursive: true });
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.join(root, 'dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const dir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'tm-fresh-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, viewport: null,
  args: ['--window-size=2560,1440', '--window-position=0,0', '--autoplay-policy=no-user-gesture-required'] });
const page = ctx.pages()[0];
await page.addInitScript((n) => { localStorage.setItem('tidemote.view', JSON.stringify({ v: 2, particles: +n, auto: false, labOpen: false })); localStorage.setItem('tidemote.sound', '{"on":false}'); }, n);
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running');
let t0 = Date.now();
for (const s of (times || '20,60,120,240').split(',').map(Number)) {
  await page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
  await page.screenshot({ path: path.resolve(root, outDir, `t${s}.png`) });
}
await ctx.close(); server.close();
