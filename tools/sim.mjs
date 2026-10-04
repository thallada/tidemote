// Headless ecology through Dawn or Chromium, without real-time pacing.
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runHeadless } from '../src/headless.js';
import { P_BYTES, FIRST_LIFE } from '../src/shaders.js';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '8192' }, minutes: { type: 'string', default: '10' },
  seed: { type: 'string', default: '23' }, k: { type: 'string', default: '{}' },
  'no-eras': { type: 'boolean' },
  sample: { type: 'string', default: '5' }, print: { type: 'string', default: '30' },
  out: { type: 'string' }, png: { type: 'string' }, cpu: { type: 'boolean' },
  chrome: { type: 'boolean' }, help: { type: 'boolean' },
  'aim-life': { type: 'boolean' }, 'aim-body': { type: 'boolean' }, 'render-bench': { type: 'boolean' },
} });
if (v.help) {
  console.log(`Usage: node tools/sim.mjs [options]
  --n 8192 --minutes 10 --seed 23 --k '{}'
  --sample 5 --print 30 --out run.json
  --no-eras
  --chrome       Run in headless Chromium (recommended without a GPU)
                 Override the executable with PLAYWRIGHT_CHROMIUM
  --cpu          Select Mesa lavapipe for Dawn only
  --png file.png Render the final frame with Dawn only (W, H, ZOOM env supported)
  --aim-life     Centre PNGs on the living cell nearest the world centre
  --aim-body     Centre PNGs on the densest part of the largest bonded body
  --render-bench Time 180 paused render frames per zoom with GPU timestamps
  --help         Show this help`);
  process.exit(0);
}
if (v.chrome && v.png) throw new Error('--png is supported only with Dawn; omit --chrome');
if ((v['aim-life'] || v['aim-body'] || v['render-bench']) && !v.png) throw new Error('--aim-life, --aim-body and --render-bench require --png');
if (v['aim-life'] && v['aim-body']) throw new Error('Choose either --aim-life or --aim-body');
const config = { n: +v.n, minutes: +v.minutes, seed: +v.seed, k: JSON.parse(v.k),
  eras: !v['no-eras'], sample: +v.sample, print: +v.print, cpu: !!v.cpu };
for (const key of ['n', 'minutes', 'sample', 'print']) {
  if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`--${key} must be positive`);
}
if (!Number.isInteger(config.n) || !Number.isInteger(config.seed)) throw new Error('--n and --seed must be integers');
const W = +process.env.W || 640, H = +process.env.H || 360;
const result = v.chrome ? await runChrome() : await runDawn();
console.log(JSON.stringify(result.summary, null, 2));
if (v.out) fs.writeFileSync(v.out, JSON.stringify(result, null, 2) + '\n');
process.exit(0);

async function runChrome() {
  const { build } = await import('esbuild');
  const { chromium } = await import('playwright-core');
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/headless.js', import.meta.url))],
    bundle: true, format: 'iife', globalName: 'Tidemote', write: false,
  });
  const cached = '/home/thallada/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM ||
    (fs.existsSync(cached) ? cached : chromium.executablePath());
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'tidemote-chrome-'));
  let browser;
  try {
    const html = path.join(dir, 'index.html');
    fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>Tidemote headless</title>');
    browser = await chromium.launch({ headless: true, executablePath, args: ['--enable-unsafe-webgpu'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(0);
    page.on('console', (message) => console.log(message.text()));
    await page.goto(pathToFileURL(html).href);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    return await page.evaluate(async ({ config, width, height }) => {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter available');
      const device = await adapter.requestDevice();
      try {
        return await Tidemote.runHeadless(device, config, { print: (line) => console.log(line), width, height });
      } finally {
        device.destroy();
      }
    }, { config, width: W, height: H });
  } finally {
    try { await browser?.close(); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
}

async function runDawn() {
  if (v.cpu) process.env.VK_ICD_FILENAMES = '/usr/share/vulkan/icd.d/lvp_icd.json';
  const { create, globals } = await import('webgpu');
  Object.assign(globalThis, globals);
  const gpu = create([]); // The instance must outlive the device.
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { console.error('No WebGPU adapter available'); process.exit(2); }
  const info = adapter.info;
  config.adapter = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ');
  if (!v.cpu && info.architecture === 'software') {
    console.error(`Dawn found only a software adapter (${config.adapter}). Pass --cpu to use it anyway;` +
      ' under WSL run through tools/gpu-node.sh to reach the GPU via Windows D3D12 (see docs/headless-gpu.md).');
    process.exit(2);
  }
  const hasTS = v['render-bench'] && adapter.features.has('timestamp-query');
  if (v['render-bench'] && !hasTS) throw new Error('GPU timestamps unavailable');
  const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
  try {
    return await runHeadless(device, config, {
      print: (line) => console.log(line), width: W, height: H,
      snapshot: v.png ? (eng, frames) => writePNG(device, eng, frames) : undefined,
    });
  } finally {
    device.destroy();
  }
}

async function writePNG(device, eng, frames) {
  const { PNG } = await import('pngjs');
  const tex = device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  let x = eng.grid[0] / 2, y = eng.grid[1] / 2;
  if (v['aim-life'] || v['aim-body']) {
    const partBytes = eng.count * P_BYTES;
    const buf = device.createBuffer({ size: partBytes + (v['aim-body'] ? eng.count * 16 : 0), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(eng.b.parts, 0, buf, 0, partBytes);
    if (v['aim-body']) enc.copyBufferToBuffer(eng.b.intent, 0, buf, partBytes, eng.count * 16);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(buf.getMappedRange()), u = new Uint32Array(f.buffer);
    let best = Infinity, at = -1;
    let candidates = Array.from({ length: eng.count }, (_, i) => i);
    if (v['aim-body']) {
      const bonds = new Uint32Array(f.buffer, partBytes);
      const parent = Uint32Array.from(candidates);
      const find = (i) => {
        while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
        return i;
      };
      for (const i of candidates) if (u[i * 10 + 4] >= FIRST_LIFE) {
        for (const n of [bonds[i * 4 + 2], bonds[i * 4 + 3]]) {
          if (n < eng.count && u[n * 10 + 4] === u[i * 10 + 4]) parent[find(n)] = find(i);
        }
      }
      const bodies = new Map();
      for (const i of candidates) if (u[i * 10 + 4] >= FIRST_LIFE) {
        const root = find(i);
        if (!bodies.has(root)) bodies.set(root, []);
        bodies.get(root).push(i);
      }
      candidates = [...bodies.values()].reduce((a, b) => a.length >= b.length ? a : b, []);
      if (candidates.length < 3) throw new Error('No multicellular body to aim at');
      // Aim at a real member rather than a centroid that might fall in a hollow body's centre.
      const wrap = (d, axis) => d - eng.grid[axis] * Math.round(d / eng.grid[axis]);
      let densest = -1;
      for (const i of candidates) {
        let nearby = 0;
        for (const n of candidates) {
          const dx = wrap(f[i * 10] - f[n * 10], 0), dy = wrap(f[i * 10 + 1] - f[n * 10 + 1], 1);
          if (dx * dx + dy * dy < 0.64) nearby++;
        }
        const distance = (f[i * 10] - x) ** 2 + (f[i * 10 + 1] - y) ** 2;
        if (nearby > densest || (nearby === densest && distance < best)) { densest = nearby; best = distance; at = i * 10; }
      }
      console.log(`PNG body: ${candidates.length} bonded cells, ${densest} within 0.8 world units`);
    }
    for (let i = 0; i < eng.count; i++) {
      const j = i * (P_BYTES / 4), d2 = (f[j] - x) ** 2 + (f[j + 1] - y) ** 2;
      if (!v['aim-body'] && u[j + 4] >= FIRST_LIFE && d2 < best) { best = d2; at = j; }
    }
    if (at < 0) throw new Error('No living cell to aim at');
    x = f[at]; y = f[at + 1];
    console.log(`PNG camera: ${x}, ${y}; cell ${u[at + 7]}, kind ${u[at + 4]}`);
    buf.unmap(); buf.destroy();
  }
  const timings = [];
  for (const z of (process.env.ZOOM || '1').split(',').map(Number)) {
    eng.clearAccum = true;
    const ppu = Math.max(W / eng.grid[0], H / eng.grid[1]) * z;
    const render = () => eng.frame({ target: tex.createView(), cam: { x, y, ppu }, paused: true, time: frames / 60 });
    render();
    const bpr = Math.ceil((W * 4) / 256) * 256;
    const buf = device.createBuffer({ size: bpr * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [W, H]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const png = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) png.data.set(src.subarray(y * bpr, y * bpr + W * 4), y * W * 4);
    const file = process.env.ZOOM ? v.png.replace(/\.png$/, `_z${z}.png`) : v.png;
    fs.writeFileSync(file, PNG.sync.write(png));
    buf.unmap();
    buf.destroy();
    console.log(`wrote ${file}`);
    if (v['render-bench']) {
      const ms = [];
      eng.onGpuTime = (t) => ms.push(t);
      // Drain each group to include every timestamp; discard warmup and pipeline compilation.
      for (let i = 0; i < 200; i++) {
        render();
        while (eng.timing.reads.some((r) => r.busy)) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      eng.onGpuTime = null;
      const samples = ms.slice(20).sort((a, b) => a - b);
      const timing = { zoom: z, ppu, samples: samples.length,
        medianMs: samples[Math.floor(samples.length / 2)], meanMs: samples.reduce((a, b) => a + b, 0) / samples.length };
      timings.push(timing);
      console.log(`GPU render: ${JSON.stringify(timing)}`);
    }
  }
  if (timings.length) fs.writeFileSync(v.png.replace(/\.png$/, '-timing.json'), JSON.stringify({ adapter: config.adapter, n: eng.count, W, H, timings }, null, 2));
  tex.destroy();
}
