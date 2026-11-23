// Drives the page's own list of saved-world files (desktop/files.js; docs/controller.md, Opening a file) with a stand-in
// desktop bridge under gamescope: the hand starting empty (Pan), Open a file in the menu's saves (listed, picked, kept and
// offered to load, Esc back) and in the opening menu's Saved worlds (listed, Esc back, picked and begun).
//   npm run build && tools/gpu-node.sh tools/files-check.mjs
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { launchOptions } from './lib/browser.mjs';
const out = 'runs/ui/files'; fs.mkdirSync(out, { recursive: true }); // (screenshots)
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.resolve('dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-webgpu'] }));
let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  window.__MC_MAX = 8192;
  // the bridge: saves in memory (kept across a reload in sessionStorage would be too big: the files list is the saves)
  const metas = new Map(), bytes = new Map();
  const keepOf = () => JSON.parse(sessionStorage.getItem('files') || '[]');
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768)); return btoa(s); };
  const un64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  window.tidemoteDesktop = {
    worlds: {
      list: async () => [...metas.values()],
      put: async (m, b) => { metas.set(m.id, { ...m, savedAt: m.savedAt || Date.now() }); bytes.set(m.id, b); try { sessionStorage.setItem('files', JSON.stringify([{ name: m.name, b: b64(new Uint8Array(b)) }])); } catch (e) { console.log('[t] keep', e.message, b.byteLength); } },
      get: async (id) => bytes.get(id), remove: async (id) => { metas.delete(id); bytes.delete(id); },
    },
    steam: async () => ({ on: false }), achieve: async () => false, deck: async () => false, keyboard: async () => false,
    workshop: { share: async () => null, browse: async () => null, open: async () => null },
    fullscreen: { toggle: async () => {}, get: async () => false, forced: async () => true, on: () => {} },
    quit: async () => {}, onClosing: () => {},
    files: {
      own: async () => true,
      list: async () => keepOf().map((f, i) => ({ path: `/home/deck/Downloads/${i}.tidemote`, name: f.name, where: i ? 'media' : 'downloads', volume: 'SD', size: f.b.length * 0.75, at: Date.now() - 60000 })),
      read: async (p) => un64(keepOf()[+p.match(/(\d+)\.tidemote/)[1]].b),
    },
  };
  if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('tidemote.sound', JSON.stringify({ on: false })); }
});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.text().startsWith('[t]')) console.log(m.text()); });
const url = `http://127.0.0.1:${server.address().port}/`;
await page.goto(url);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running' && document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
await page.waitForTimeout(3000);
{ const t = await page.evaluate(() => document.querySelector('.dock .tool[aria-pressed="true"]')?.dataset.tool); check('Pan by default under gamescope', t === 'none', t); }
// save a world
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#gmenu [data-g="save"]'); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'pre-save.png') }); await page.click('#gmenu [data-o="w-save"]'); await page.waitForFunction(() => sessionStorage.getItem('files'), null, { timeout: 60000 }).catch(() => {}); await page.screenshot({ path: path.join(out, 'post-save.png') });
check('saved', await page.evaluate(() => !!sessionStorage.getItem('files')));
await page.reload();
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running' && document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
await page.waitForTimeout(2000);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#gmenu [data-g="load"]'); await page.waitForTimeout(500);
await page.click('#gmenu [data-o="w-open"]'); await page.waitForTimeout(800);
const f = await page.evaluate(() => ({ page: document.getElementById('gmenu').dataset.page, rows: document.querySelectorAll('#gmenu [data-o="w-pick"]').length, focus: document.activeElement?.dataset?.o, title: document.querySelector('#gmenu h2')?.textContent }));
check('game menu: Open a file lists the files in the page', f.page === 'files' && f.rows === 1, JSON.stringify(f));
await page.screenshot({ path: path.join(out, 'gmenu-files.png') });
await page.click('#gmenu [data-o="w-pick"]'); await page.waitForTimeout(3000);
const g = await page.evaluate(() => ({ page: document.getElementById('gmenu').dataset.page, ask: !!document.querySelector('#gmenu [data-o="w-yes"]'), focus: document.activeElement?.dataset?.o }));
check('game menu: a file picked is kept and offered to load', g.page === 'worlds' && g.ask && g.focus === 'w-yes', JSON.stringify(g));
await page.screenshot({ path: path.join(out, 'gmenu-load.png') });
// Esc back from files to the saves
await page.click('#gmenu [data-o="w-open"]').catch(() => {}); await page.waitForTimeout(600);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
check('game menu: Esc from the files goes back to the saves', await page.evaluate(() => document.getElementById('gmenu').dataset.page === 'worlds'));
// the opening menu (held as a visitor's browser holds it): Saved worlds → Open a file → the list → the world opens
{
  const keepVal = await page.evaluate(() => sessionStorage.getItem('files'));
  const p2 = await ctx.newPage();
  await p2.addInitScript((v) => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); if (!sessionStorage.getItem('files')) sessionStorage.setItem('files', v); }, keepVal);
  p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(url);
  await p2.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running' && document.getElementById('intro').classList.contains('ask'), null, { polling: 100, timeout: 120000 });
  await p2.click('#menu-w'); await p2.waitForTimeout(600);
  await p2.click('#menu-panel [data-m="file"]'); await p2.waitForTimeout(800);
  const a = await p2.evaluate(() => ({ rows: document.querySelectorAll('#menu-panel [data-f]').length, focus: document.activeElement?.dataset?.f }));
  check('opening menu: Open a file lists the files in the panel', a.rows === 1, JSON.stringify(a));
  await p2.screenshot({ path: path.join(out, 'intro-files.png') });
  await p2.keyboard.press('Escape'); await p2.waitForTimeout(300);
  check('opening menu: Esc goes back to the saved worlds', await p2.evaluate(() => !!document.querySelector('#menu-panel [data-m="file"]')));
  await p2.click('#menu-panel [data-m="file"]'); await p2.waitForTimeout(800);
  await p2.click('#menu-panel [data-f="0"]');
  const ok = await p2.waitForFunction(() => document.body.classList.contains('live'), null, { timeout: 60000 }).then(() => true, () => false);
  check('opening menu: the file picked opens and begins', ok);
}
check('no page errors', !errs.length, errs.join(' | '));
console.log(bad ? `${bad} failed` : 'all ok');
await browser.close(); server.close();
process.exit(bad ? 1 : 0);
