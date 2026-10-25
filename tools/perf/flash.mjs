// Does a change of render scale flash? Resize from inside a frame (immediately, as the page once did, or
// queued, as the adaptive scale does) and measure the brightness of every composited frame (CDP screencast).
//   tools/gpu-node.sh tools/perf/flash.mjs [page.html] [immediate,queued]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.join(root, process.argv[2] || 'dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const dir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'tm-flash-'));
const ctx = await chromium.launchPersistentContext(dir, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, viewport: null,
  args: ['--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'] });
const page = ctx.pages()[0];
await page.addInitScript(() => { localStorage.setItem('tidemote.view', JSON.stringify({ particles: 1048576, trails: 2, auto: false, labOpen: false })); localStorage.setItem('tidemote.sound', '{"on":false}'); });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running');
await page.waitForTimeout(6000);
const { PNG } = await import('pngjs');
const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', (f) => {
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  const png = PNG.sync.read(Buffer.from(f.data, 'base64'));
  let s = 0;
  for (let i = 0; i < png.data.length; i += 4) s += png.data[i] + png.data[i + 1] + png.data[i + 2];
  frames.push({ t: f.metadata.timestamp * 1000, b: s / (png.data.length / 4) / 3 });
});
await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 160, maxHeight: 90, everyNthFrame: 1 });
const out = {};
for (const mode of process.argv[3] ? process.argv[3].split(',') : ['immediate', 'queued']) {
  frames.length = 0;
  const marks = await page.evaluate(async (mode) => {
    const T = globalThis.__tidemote, raf = () => new Promise((r) => requestAnimationFrame(r)), marks = [];
    for (let k = 0; k < 10; k++) {
      for (let i = 0; i < 30; i++) await raf();
      const v = k % 2 ? 1 : 0.7;
      marks.push(performance.timeOrigin + performance.now());
      if (mode === 'immediate') T.setScale(v); else T.queueScale(v);
    }
    for (let i = 0; i < 30; i++) await raf();
    return marks;
  }, mode);
  // a frame much darker than the median of its neighbors is a flash
  const bs = frames.map((f) => f.b), med = [...bs].sort((a, b) => a - b)[bs.length >> 1];
  out[mode] = { frames: frames.length, median: +med.toFixed(1), dark: frames.filter((f) => f.b < med * 0.6).length, min: +Math.min(...bs).toFixed(1) };
}
await cdp.send('Page.stopScreencast');
console.log(JSON.stringify(out));
await ctx.close(); server.close();
