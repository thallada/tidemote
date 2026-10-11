// The built page in headless Chromium on the GPU, for capture.mjs and page-shots.mjs. On Linux +
// NVIDIA pass the headless Vulkan layer's directory (--layer DIR or VK_ADD_LAYER_PATH).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Serve dist/tidemote.html at / (and repo files by path) and launch Chromium: { url, browser, close }. */
export async function start(layer = process.env.VK_ADD_LAYER_PATH) {
  const server = http.createServer((req, res) => {
    const f = req.url === '/' || req.url.startsWith('/#') ? path.join(root, 'dist/tidemote.html') : path.join(root, decodeURIComponent(req.url));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/json' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { ...process.env };
  if (layer) { env.VK_ADD_LAYER_PATH = layer; env.VK_INSTANCE_LAYERS = 'VK_LAYER_TIDEMOTE_headless'; }
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || chromium.executablePath(), headless: true, env,
    ignoreDefaultArgs: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist', '--disable-vulkan-surface'],
  });
  return { url: `http://127.0.0.1:${server.address().port}/`, browser, close: async () => { await browser.close(); server.close(); } };
}

/** A new page running the world (sound off, Lab closed; particles: the page's default if null), once it is running. */
export async function open(env, { viewport = { width: 1280, height: 800 }, mobile = false, particles = null, hash = '' } = {}) {
  const page = await env.browser.newPage({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', (e) => console.error('page:', e.stack));
  await page.addInitScript((particles) => {
    localStorage.setItem('tidemote.view', JSON.stringify({ v: 2, auto: false, labOpen: false, ...(particles ? { particles } : {}) }));
    localStorage.setItem('tidemote.sound', '{"on":false}');
    // the first adapter request can come back empty
    const req = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (o) => (await req(o)) || req(o);
  }, particles);
  await page.goto(env.url + hash);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { timeout: 120000 });
  await page.keyboard.press('Shift');
  return page;
}
