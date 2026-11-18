// What this machine's Chrome makes of WebGPU canvases for HDR and wide color (docs/hdr.md): the screen's media
// queries, which canvas configurations it takes, and how values in a float canvas of each color space come out (drawn
// into a float 2D canvas and read back: encoded or linear, clamped or not).
//   tools/gpu-node.sh tools/hdr/probe.mjs
import fs from 'node:fs'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { launchOptions } from '../lib/browser.mjs';
const html = fs.readFileSync(new URL('./probe.html', import.meta.url));
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(launchOptions({ args: ['--no-first-run', '--enable-unsafe-webgpu'] }));
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => document.title === 'done', null, { timeout: 30000 });
for (const [k, v] of Object.entries(await page.evaluate(() => window.__out))) console.log(k, '=>', JSON.stringify(v));
await browser.close(); server.close();
