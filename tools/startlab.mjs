// Start lab: grow a fresh world (or load a saved .tidemote) under Dawn or headless Chromium, optionally
// kill off most of its life at a moment (a collapse without the climate), and record how diverse it is over
// time: Hill numbers over species and over lineages (founders vs sparks of abiogenesis), guild shares and
// evenness, and spatial turnover (effective species per region against the whole world). The simulation is
// tools/startlab-core.js.
//   tools/gpu-node.sh tools/startlab.mjs --n 524288 --minutes 30 --seed 3 --out runs/start/x.json
//   tools/gpu-node.sh tools/startlab.mjs --load world.tidemote --minutes 20 --rep 1 --cull 0:0.98 --out y.json
//   ... --warm 120   (the first 2 minutes in 4-tick steps, as the page's warm-up at Max)
//   TIDEMOTE_VK_LAYER=DIR node tools/startlab.mjs --chrome ...   (Linux + NVIDIA; no --load or --save)
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '524288' }, minutes: { type: 'string', default: '30' }, seed: { type: 'string', default: '1' },
  k: { type: 'string', default: '{}' }, load: { type: 'string' }, rep: { type: 'string', default: '0' },
  cull: { type: 'string', multiple: true }, sample: { type: 'string', default: '10' }, spatialEvery: { type: 'string', default: '60' },
  'no-eras': { type: 'boolean' }, out: { type: 'string' }, save: { type: 'string', multiple: true },
  aspect: { type: 'string', default: '2.37' }, chrome: { type: 'boolean' }, log: { type: 'string' }, warm: { type: 'string' },
} });
// --log FILE: progress and the summary go to FILE, never to stdio (a detached Windows Node under WSL dies at
// its next write once the shell that started it is gone)
const log = v.log ? (s) => fs.appendFileSync(v.log, `${s}\n`) : (s) => console.error(s);
const t0 = Date.now();
const res = v.chrome ? await runChrome() : await runDawn();
const out = { config: { ...v, adapter: res.adapter, N: res.N, grid: res.grid, founders: res.founders }, samples: res.samples, spatial: res.spatial, eras: res.eras, wallSeconds: (Date.now() - t0) / 1000 };
if (v.out) fs.writeFileSync(v.out, JSON.stringify(out) + '\n');
const last = res.samples.at(-1), sp = res.spatial.at(-1);
(v.log ? log : console.log)(JSON.stringify({ t: last.t, living: last.living, hill1: last.hill1, hill2: last.hill2, thriving: last.thriving, n1pct: last.n1pct, diet: last.diet, lineHill1: last.lineHill1, abio: last.abioShare, beta: sp.beta, alpha: sp.alpha, wall: out.wallSeconds }));
process.exit(0);

async function runDawn() {
  const { create, globals } = await import('webgpu');
  Object.assign(globalThis, globals);
  const gpu = create([]);
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  const info = adapter.info || {};
  if (info.architecture === 'software' || /llvmpipe|lavapipe|swiftshader/i.test(`${info.description} ${info.device}`)) throw new Error(`software adapter: ${info.description}`);
  const device = await adapter.requestDevice({ requiredLimits: {
    maxStorageBuffersPerShaderStage: 10, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize } });
  const { runLab } = await import('./startlab-core.js');
  const { decodeWorld } = await import('../src/worlds.js');
  const saved = v.load ? await decodeWorld(fs.readFileSync(v.load)) : null;
  const r = await runLab(device, v, { log, saved, saveWorld: (file, bytes) => fs.writeFileSync(file, bytes) });
  device.destroy();
  return { ...r, adapter: info.description };
}

async function runChrome() {
  if (v.load || v.save) throw new Error('--load and --save need Dawn');
  const { build } = await import('esbuild');
  const { chromium } = await import('playwright-core');
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('./startlab-core.js', import.meta.url))], bundle: true, format: 'iife', globalName: 'Lab', write: false });
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'tidemote-lab-'));
  const vk = process.env.TIDEMOTE_VK_LAYER;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM || chromium.executablePath();
  const browser = await chromium.launch(vk ? {
    headless: true, executablePath, env: { ...process.env, VK_ADD_LAYER_PATH: vk, VK_INSTANCE_LAYERS: 'VK_LAYER_TIDEMOTE_headless' },
    ignoreDefaultArgs: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist', '--disable-vulkan-surface'],
  } : { headless: true, executablePath, args: ['--enable-unsafe-webgpu'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(0);
    page.on('console', (m) => log(m.text()));
    const html = path.join(dir, 'index.html');
    fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>Tidemote lab</title>');
    await page.goto(pathToFileURL(html).href);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    return await page.evaluate(async (cfg) => {
      const adapter = (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) || await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      const info = adapter.info ?? {};
      if (/swiftshader/i.test(`${info.description} ${info.architecture} ${info.vendor}`)) throw new Error(`software adapter: ${info.description}`);
      const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize } });
      try { return { ...(await Lab.runLab(device, cfg, { log: (s) => console.log(s) })), adapter: `${info.vendor} ${info.architecture} ${info.description}` }; }
      finally { device.destroy(); }
    }, v);
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
