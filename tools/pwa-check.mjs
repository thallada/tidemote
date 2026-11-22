// Checks the page as an installable web app (src/pwa.js, site/manifest.webmanifest, site/sw.js) in Chrome, served as
// tidemote.com serves it (site/ with dist/tidemote.html at /, revalidated by ETag): Chrome finds the manifest and calls
// the page installable; the service worker takes the page; a reload offline opens the page kept; a new deploy reaches
// the next load online; fresh-shaders.txt still reaches the server; the menu's Install row opens the browser's dialog;
// and on an iPhone (its user agent) the row explains Share → Add to Home Screen.
//   npm run build && tools/gpu-node.sh tools/pwa-check.mjs
//   (on Linux without a display: TIDEMOTE_VK=1 tools/capped.sh node tools/pwa-check.mjs)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { vkOn as vk, retryAdapter } from './vk.mjs';
import { launchOptions } from './lib/browser.mjs';

const TYPES = { '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.png': 'image/png', '.txt': 'text/plain', '.jpg': 'image/jpeg', '.html': 'text/html' };
let deploy = 1; // the page served: a second deploy differs by a comment at its end
const hits = {};
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  hits[p] = (hits[p] || 0) + 1;
  let body, type;
  if (p === '/' || p === '/index.html') {
    body = Buffer.concat([fs.readFileSync(path.resolve('dist/tidemote.html')), Buffer.from(deploy > 1 ? `\n<!--deploy ${deploy}-->\n` : '')]);
    type = 'text/html';
  } else {
    const f = path.resolve('site', '.' + p);
    if (!f.startsWith(path.resolve('site')) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    body = fs.readFileSync(f); type = TYPES[path.extname(f)] || 'application/octet-stream';
  }
  const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
  const head = { 'content-type': type, 'cache-control': 'public, max-age=0, must-revalidate', etag };
  if (p === '/fresh-shaders.txt') Object.assign(head, { 'clear-site-data': '"cache"', 'cache-control': 'no-store' });
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
  res.writeHead(200, head); res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-webgpu'] }));
let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
const running = (page) => page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 200, timeout: 180000 });
const quiet = () => { localStorage.setItem('tidemote.sound', JSON.stringify({ on: false })); };

try {
  // ---- a laptop's Chrome: the manifest, the worker, offline, a new deploy, the Install row
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    if (vk) await ctx.addInitScript(retryAdapter);
    await ctx.addInitScript(quiet);
    // a stand-in for Chrome's offer (it makes one only for a site it judges worth it, after some engagement)
    await ctx.addInitScript(() => {
      addEventListener('load', () => setTimeout(() => {
        const e = new Event('beforeinstallprompt', { cancelable: true });
        e.prompt = async () => { globalThis.__prompted = (globalThis.__prompted || 0) + 1; };
        e.userChoice = Promise.resolve({ outcome: 'accepted' });
        dispatchEvent(e);
      }, 500));
    });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(url);
    const cdp = await ctx.newCDPSession(page);
    const man = await cdp.send('Page.getAppManifest');
    check('Chrome reads the manifest without errors', man.url.endsWith('/manifest.webmanifest') && !man.errors.length, JSON.stringify(man.errors));
    const sw = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then((r) => r.active?.scriptURL || ''), new Promise((r) => setTimeout(() => r('timeout'), 30000))]));
    check('the service worker activates', sw.endsWith('/sw.js'), sw);
    const inst = await cdp.send('Page.getInstallabilityErrors');
    // (a fresh Playwright context is Chrome's incognito, where nothing installs: the one error expected)
    const why = inst.installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
    check('Chrome calls it installable (but for incognito)', !why.length, JSON.stringify(why));
    check('fresh-shaders.txt reaches the server', hits['/fresh-shaders.txt'] >= 1, JSON.stringify(hits));
    await running(page);

    // the Install row: shown, and the browser's dialog opened from it
    await page.evaluate(() => document.getElementById('gm-open').click());
    await page.waitForSelector('#gmenu:not([hidden])', { timeout: 5000 }).catch(() => {});
    const row = await page.$('#gmenu [data-g="install"]');
    check('the menu shows Install Tidemote', !!row, row ? await row.textContent() : '');
    if (row) {
      await row.click();
      await page.waitForTimeout(500);
      check('Install opens the browser\'s dialog', await page.evaluate(() => globalThis.__prompted === 1));
      check('the row goes once the offer is used', !(await page.$('#gmenu [data-g="install"]')));
    }

    // offline: the page kept, from the worker
    const before = hits['/'];
    await ctx.setOffline(true);
    const r = await page.reload();
    check('offline, the page opens from the worker', r && r.ok() && r.fromServiceWorker(), r ? `${r.status()} sw=${r.fromServiceWorker()}` : 'no response');
    await running(page);
    check('offline, the world runs', true);
    await ctx.setOffline(false);
    check('offline, the server was not asked', hits['/'] === before);

    // a new deploy: the next load online has it
    deploy = 2;
    const r2 = await page.reload();
    check('online, a new deploy loads at once', r2 && (await r2.text()).includes('<!--deploy 2-->'));
    deploy = 1;
    check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- an iPhone (its user agent and touch): the row explains Share → Add to Home Screen
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1' });
    if (vk) await ctx.addInitScript(retryAdapter);
    await ctx.addInitScript(quiet);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(url);
    await running(page);
    await page.evaluate(() => document.getElementById('gm-open').click());
    await page.waitForSelector('#gmenu:not([hidden])', { timeout: 5000 }).catch(() => {});
    const row = await page.$('#gmenu [data-g="install"]');
    check('iPhone: the menu shows Install Tidemote', !!row);
    if (row) {
      await row.tap();
      await page.waitForTimeout(300);
      const text = await page.textContent('#gm-body');
      check('iPhone: its page says Share, then Add to Home Screen', /Share/.test(text) && /Add to Home Screen/.test(text), text.slice(0, 120));
      const fit = await page.evaluate(() => { const b = document.getElementById('gm-body').getBoundingClientRect(); return b.right <= innerWidth && b.left >= 0; });
      check('iPhone: the page fits the screen', fit);
      await page.screenshot({ path: 'runs/ui/pwa-iphone-install.png' }).catch(() => {});
    }
    check('iPhone: no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(bad ? `${bad} failed` : 'all ok');
process.exit(bad ? 1 : 0);
