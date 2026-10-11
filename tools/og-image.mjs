// The link-preview image (site/og.jpg, og:image): a world run in headless Chromium (WebGPU on
// SwiftShader) and drawn with the page's default view settings into an offscreen texture
// (presenting to a canvas loses the device in headless Chromium), framed where life is densest.
//   node tools/og-image.mjs [--n 16384] [--seconds 60] [--view 14] [--seed 7] [--out site/og.jpg]
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? def : process.argv[i + 1]; };
const opts = { N: +arg('n', 16384), SEC: +arg('seconds', 60), VIEW: +arg('view', 14), SEED: +arg('seed', 7), W: 1200, H: 630 };
const out = path.resolve(root, arg('out', 'site/og.jpg'));

const entry = `
import { createEngine, FIRST_LIFE } from './src/engine.js';
window.shoot = async ({ N, SEC, VIEW, SEED, W, H }) => {
  let s = SEED >>> 0; const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const device = await (await navigator.gpu.requestAdapter()).requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
  const eng = await createEngine(device, 'rgba8unorm', {});
  await eng.allocate(N); eng.resize(W, H); eng.seed(N, { aspect: W / H, rng });
  const [GW, GH] = eng.grid, whole = { x: GW / 2, y: GH / 2, ppu: W / GW };
  for (let f = 0, frames = Math.round((SEC * 60) / 4); f < frames; f++) {
    while (eng.censusStage.every((x) => x.busy)) await new Promise((r) => setTimeout(r, 0));
    eng.frame({ target: null, cam: whole, simDt: 1 / 60, steps: 4, time: eng.simTime });
  }
  await device.queue.onSubmittedWorkDone();
  // frame the camera where living cells are densest
  const rb = device.createBuffer({ size: eng.count * 40, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  let enc = device.createCommandEncoder(); enc.copyBufferToBuffer(eng.b.parts, 0, rb, 0, eng.count * 40); device.queue.submit([enc.finish()]);
  await rb.mapAsync(GPUMapMode.READ); const pu = new Uint32Array(rb.getMappedRange().slice(0)), pf = new Float32Array(pu.buffer); rb.unmap();
  const cells = [];
  for (let i = 0; i < eng.count; i++) if (pu[i * 10 + 4] >= FIRST_LIFE) cells.push([pf[i * 10], pf[i * 10 + 1]]);
  const wrap = (d, L) => d - L * Math.round(d / L), r2 = (VIEW / 4) ** 2;
  let best = [GW / 2, GH / 2], bestN = -1;
  for (const a of cells.filter((_, j) => j % Math.max(1, Math.ceil(cells.length / 300)) === 0)) {
    let n = 0; for (const b of cells) { const dx = wrap(b[0] - a[0], GW), dy = wrap(b[1] - a[1], GH); if (dx * dx + dy * dy < r2) n++; }
    if (n > bestN) { bestN = n; best = a; }
  }
  const tex = device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const cam = { x: best[0], y: best[1], ppu: W / VIEW };
  for (let k = 0; k < 3; k++) eng.frame({ target: tex.createView(), cam, paused: true, steps: 0, simDt: 1 / 60, time: eng.simTime + k / 60, dpr: 1 });
  const bpr = Math.ceil((W * 4) / 256) * 256;
  const px = device.createBuffer({ size: bpr * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  enc = device.createCommandEncoder(); enc.copyTextureToBuffer({ texture: tex }, { buffer: px, bytesPerRow: bpr }, [W, H]); device.queue.submit([enc.finish()]);
  await px.mapAsync(GPUMapMode.READ); const src = new Uint8Array(px.getMappedRange());
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.append(cv);
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(src.subarray(y * bpr, y * bpr + W * 4), y * W * 4);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  ctx.putImageData(img, 0, 0); px.unmap();
  return { living: cells.length, near: bestN, simTime: eng.simTime };
};`;

const bundle = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, format: 'iife', target: 'es2022' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidemote-og-'));
fs.writeFileSync(path.join(dir, 'i.html'), '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#06090a}canvas{display:block}</style>');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: opts.W, height: opts.H } });
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.error(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  await page.goto(pathToFileURL(path.join(dir, 'i.html')).href);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const res = await page.evaluate((o) => window.shoot(o), opts);
  await page.locator('canvas').screenshot({ path: out, type: 'jpeg', quality: 86 });
  console.log(`wrote ${path.relative(root, out)}: ${res.living} living cells, ${res.near} in frame, ${res.simTime.toFixed(0)} s simulated`);
} finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
