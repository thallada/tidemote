// The built page in headless Chrome for the film tools (tools/film-check.mjs, tools/film-quality.mjs):
// a profile on disk (not an incognito context, so the browser's private files and its blob store behave
// as a visitor's do), a small world, sound off, the intro passed, running.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { vkOn as vk, retryAdapter } from './vk.mjs';
import { launchOptions } from './lib/browser.mjs';

export const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
// --size: the window
export const SIZES = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, '4k': { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 } };

/** Opens `html` at `size` with `n` particles, `init(initArg)` run in the page before it starts: { page, prof, errs, close }. */
export async function openPage({ size, html, n = 16384, init = null, initArg = null }) {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(html).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.homedir(), '.cache', 'tidemote-film-'));
  const ctx = await chromium.launchPersistentContext(prof, { ...launchOptions({ args: ['--enable-unsafe-webgpu'] }), ...SIZES[size], acceptDownloads: true });
  await ctx.addInitScript((mc) => {
    window.__MC_MAX = mc;
    if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0.7 })); }
  }, n);
  if (init) await ctx.addInitScript(init, initArg);
  if (vk) await ctx.addInitScript(retryAdapter);
  const page = ctx.pages()[0] || await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250, timeout: 180000 });
  if (vk) await page.keyboard.press('Shift'); // headless, the intro waits for a key
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
  return { page, prof, errs, close: async () => { await ctx.close(); server.close(); fs.rmSync(prof, { recursive: true, force: true }); } };
}

/** The page's next download (a film), saved as `file` with its extension: its path. Ask before the film ends. */
export async function savedFilm(page, file) {
  const d = await page.waitForEvent('download', { timeout: 0 });
  const f = `${file}${path.extname(d.suggestedFilename())}`;
  await d.saveAs(f);
  return f;
}
