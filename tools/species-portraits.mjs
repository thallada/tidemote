// Portraits of species as the simulation draws them: a trial world in headless Chromium (WebGPU on
// SwiftShader) is seeded with the given founder genomes in place of its own, run for a while so
// bodies can grow, and each species still alive is drawn close up where its cells are densest,
// the others dimmed by the sim's own highlight, into an offscreen texture (presenting to a canvas loses the device in headless Chromium).
// Used by tools/sigil-gallery.mjs.
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = `
import { createEngine, FIRST_LIFE, MAXK } from './src/engine.js';
import { writeGenome, finalizeGenome } from './src/genome.js';
import { G_WORDS } from './src/shaders.js';
window.portraits = async ({ N, SEC, SIZE, SEED, VIEWS, genomes }) => {
  let s = SEED >>> 0; const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const device = await (await navigator.gpu.requestAdapter()).requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
  const eng = await createEngine(device, 'rgba8unorm', {});
  await eng.allocate(N); eng.resize(SIZE, SIZE); eng.seed(N, { aspect: 1, rng });
  eng.settings.trails = 0; eng.settings.tide = 0; eng.abio = 0;
  // the trial world's founders become ours (it seeds 24 founder slots)
  const gb = new ArrayBuffer(G_WORDS * 4), gu = new Uint32Array(gb), gf = new Float32Array(gb);
  genomes.slice(0, eng.founders).forEach((g, i) => {
    g = finalizeGenome({ ...g, mutRate: 0.002, serial: i + 1 }, eng.K);
    gu.fill(0); writeGenome(gu, gf, 0, g);
    device.queue.writeBuffer(eng.b.genomes, (FIRST_LIFE + i) * G_WORDS * 4, gb);
  });
  const [GW, GH] = eng.grid, whole = { x: GW / 2, y: GH / 2, ppu: SIZE / GW };
  const frames = Math.round((SEC * 60) / 4);
  for (let f = 0; f < frames; f++) {
    while (eng.censusStage.every((x) => x.busy)) await new Promise((r) => setTimeout(r, 0));
    eng.abio = 0;
    eng.frame({ target: null, cam: whole, simDt: 1 / 60, steps: 4, time: eng.simTime });
  }
  await device.queue.onSubmittedWorkDone();
  const rb = device.createBuffer({ size: eng.count * 40, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  let enc = device.createCommandEncoder(); enc.copyBufferToBuffer(eng.b.parts, 0, rb, 0, eng.count * 40); device.queue.submit([enc.finish()]);
  await rb.mapAsync(GPUMapMode.READ); const pu = new Uint32Array(rb.getMappedRange().slice(0)), pf = new Float32Array(pu.buffer); rb.unmap();
  const byKind = new Map();
  for (let i = 0; i < eng.count; i++) { const k = pu[i * 10 + 4]; if (k >= FIRST_LIFE) { if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push([pf[i * 10], pf[i * 10 + 1]]); } }
  const tex = device.createTexture({ size: [SIZE, SIZE], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const out = device.createBuffer({ size: SIZE * SIZE * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const wrap = (d, W) => d - W * Math.round(d / W);
  const result = [];
  for (let i = 0; i < Math.min(genomes.length, eng.founders); i++) {
    const cells = byKind.get(FIRST_LIFE + i) || [];
    if (!cells.length) { result.push({ alive: 0 }); continue; }
    // where its cells are densest
    const sample = cells.length > 400 ? cells.filter((_, j) => j % Math.ceil(cells.length / 400) === 0) : cells;
    let best = sample[0], bestN = -1;
    for (const a of sample) { let n = 0; for (const b of cells) { const dx = wrap(b[0] - a[0], GW), dy = wrap(b[1] - a[1], GH); if (dx * dx + dy * dy < 1.2) n++; } if (n > bestN) { bestN = n; best = a; } }
    // the sim's own highlight: everything but this species dimmed
    const kinds = new Uint32Array(MAXK / 32); kinds[(FIRST_LIFE + i) >> 5] |= 1 << ((FIRST_LIFE + i) & 31);
    eng.setFocus({ kinds, mute: 0.1 });
    const shots = [];
    for (const view of VIEWS) {
      const cam = { x: best[0], y: best[1], ppu: SIZE / view };
      for (let k = 0; k < 3; k++) eng.frame({ target: tex.createView(), cam, paused: true, steps: 0, simDt: 1 / 60, time: eng.simTime + k / 60, dpr: 1 });
      enc = device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: tex }, { buffer: out, bytesPerRow: SIZE * 4 }, [SIZE, SIZE]);
      device.queue.submit([enc.finish()]);
      await out.mapAsync(GPUMapMode.READ);
      const px = new Uint8Array(out.getMappedRange().slice(0)); out.unmap();
      let bin = ''; for (let j = 0; j < px.length; j += 0x8000) bin += String.fromCharCode.apply(null, px.subarray(j, j + 0x8000));
      shots.push(btoa(bin));
    }
    result.push({ alive: cells.length, near: bestN, shots });
  }
  return result;
};`;

/**
 * Render genomes (plain objects, at most 24) in a trial world, each at every view width (in grid
 * cells). Returns [{ alive, pngs: [Buffer per view] | null }].
 */
export async function portraits(genomes, { n = 8192, seconds = 40, size = 256, seed = 5, views = [1.4, 4] } = {}) {
  const bundle = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, format: 'iife', target: 'es2022' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidemote-portraits-'));
  fs.writeFileSync(path.join(dir, 'i.html'), '<!doctype html><meta charset="utf-8"><title>portraits</title>');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--enable-unsafe-webgpu'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(0);
    page.on('pageerror', (e) => console.error(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
    await page.goto(pathToFileURL(path.join(dir, 'i.html')).href);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const res = await page.evaluate((o) => window.portraits(o), { N: n, SEC: seconds, SIZE: size, SEED: seed, VIEWS: views, genomes });
    return res.map((r) => ({
      alive: r.alive || 0,
      pngs: r.shots ? r.shots.map((b64) => {
        const png = new PNG({ width: size, height: size });
        png.data = Buffer.from(b64, 'base64');
        for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
        return PNG.sync.write(png);
      }) : null,
    }));
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}

