// The built page in headless Chromium on the GPU through Vulkan (tools/vk.mjs), for capture.mjs and page-shots.mjs.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retryAdapter } from '../vk.mjs';
import { launchOptions } from '../lib/browser.mjs';
import { viewPrefs } from '../lib/prefs.mjs';

export const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Serve dist/tidemote.html at / (and repo files by path) and launch Chromium: { url, browser, close }. */
export async function start() {
  const server = http.createServer((req, res) => {
    const f = req.url === '/' || req.url.startsWith('/#') ? path.join(root, 'dist/tidemote.html') : path.join(root, decodeURIComponent(req.url));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/json' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-webgpu'], vk: true }));
  return { url: `http://127.0.0.1:${server.address().port}/`, browser, close: async () => { await browser.close(); server.close(); } };
}

/** A new page running the world (sound off, Lab closed; particles: the page's default if null), once it is running. */
export async function open(env, { viewport = { width: 1280, height: 800 }, mobile = false, particles = null, hash = '' } = {}) {
  const page = await env.browser.newPage({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', (e) => console.error('page:', e.stack));
  await page.addInitScript((view) => {
    localStorage.setItem('tidemote.view', JSON.stringify(view));
    localStorage.setItem('tidemote.sound', '{"on":false}');
  }, viewPrefs({ auto: false, labOpen: false, ...(particles ? { particles } : {}) }));
  await page.addInitScript(retryAdapter);
  await page.goto(env.url + hash);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { timeout: 120000 });
  await page.keyboard.press('Shift');
  return page;
}

/** Hand the page a saved world's records (tools/lineage/capture.mjs; rel, a path from the repo's root) in place of its own, paused. */
export const loadRecords = (page, rel) => page.evaluate(async (url) => {
  const T = globalThis.__tidemote, snap = await (await fetch(url)).json();
  T.state.paused = true;
  await new Promise((r) => setTimeout(r, 300));
  const life = T.life();
  // a capture keeps only each genome's color: the rest from one of the page's own, so the census can read it
  const like = [...life.reg.values()].find((s) => s.genome)?.genome;
  for (const s of snap.reg) s.genome = { ...like, ...s.genome };
  life.reg = new Map(snap.reg.map((s) => [s.serial, s]));
  // captures from before species kept their own records: rebuild them from the history
  const bare = new Map(snap.reg.filter((s) => !s.series).map((s) => [s.serial, (s.series = { t: [], v: [] })]));
  for (const h of snap.history) for (const [k, v] of h.sp) { const r = bare.get(k); if (r) { r.t.push(h.t); r.v.push(v); } }
  life.history = snap.history;
  T.climate().history = snap.eras;
  T.eng.simTime = snap.simTime;
}, `/${rel}`);
