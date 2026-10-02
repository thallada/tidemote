// Headless ecology through Dawn or Chromium, without real-time pacing.
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runHeadless } from '../src/headless.js';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '8192' }, minutes: { type: 'string', default: '10' },
  seed: { type: 'string', default: '23' }, k: { type: 'string', default: '{}' },
  'no-eras': { type: 'boolean' },
  sample: { type: 'string', default: '5' }, print: { type: 'string', default: '30' },
  out: { type: 'string' }, png: { type: 'string' }, cpu: { type: 'boolean' },
  chrome: { type: 'boolean' }, help: { type: 'boolean' },
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
  --help         Show this help`);
  process.exit(0);
}
if (v.chrome && v.png) throw new Error('--png is supported only with Dawn; omit --chrome');
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
  const device = await adapter.requestDevice();
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
  for (const z of (process.env.ZOOM || '1').split(',').map(Number)) {
    eng.clearAccum = true;
    const ppu = Math.max(W / eng.grid[0], H / eng.grid[1]) * z;
    eng.frame({ target: tex.createView(), cam: { x: eng.grid[0] / 2, y: eng.grid[1] / 2, ppu }, paused: true, time: frames / 60 });
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
    console.log(`wrote ${file}`);
  }
}
