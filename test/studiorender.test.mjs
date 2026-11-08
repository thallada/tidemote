import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

// The card page's studio (src/studiorender.js): a species drawn alone on a device of its own, with only the
// pipelines that takes, its cells where the frame puts them, and a clear refusal where there is no GPU.
test('the card page\'s studio draws a species alone with three pipelines, and says when there is no GPU', { timeout: 120_000 }, async (t) => {
  const { studioPortrait, STUDIO_SIZE } = await import('../src/studiorender.js');
  const { archetypeGenome, writeGenome, readGenome } = await import('../src/genome.js');
  const { portraitCells } = await import('../src/studio.js');
  const { G_WORDS } = await import('../src/shaders.js');
  const genome = (type) => {
    const u = new Uint32Array(G_WORDS), f = new Float32Array(u.buffer);
    writeGenome(u, f, 0, archetypeGenome(type, () => 0.4));
    return { words: u, g: readGenome(u, f, 0) };
  };
  const nav = Object.getOwnPropertyDescriptor(globalThis.navigator, 'gpu');
  t.after(() => { if (nav) Object.defineProperty(globalThis.navigator, 'gpu', nav); else delete globalThis.navigator.gpu; });

  // no WebGPU: refused, saying so, before anything else
  Object.defineProperty(globalThis.navigator, 'gpu', { value: undefined, configurable: true });
  const { words, g } = genome('grazer');
  const steps = [];
  await assert.rejects(studioPortrait(words, g, portraitCells(g, null), (s) => steps.push(s)), (e) => e.noGpu && /no WebGPU/.test(e.message));
  assert.deepEqual(steps, ['gpu']);

  if (process.platform === 'linux' && existsSync('/usr/share/vulkan/icd.d/lvp_icd.json')) {
    process.env.VK_ICD_FILENAMES = '/usr/share/vulkan/icd.d/lvp_icd.json';
  }
  const { create, globals } = await import('webgpu');
  Object.assign(globalThis, globals);
  const gpu = create([]);
  if (!await gpu.requestAdapter()) { t.skip('No WebGPU adapter available'); return; }
  // (counting the pipelines it makes, and catching any error on its device)
  const made = [], errors = [];
  const requestAdapter = gpu.requestAdapter.bind(gpu);
  Object.defineProperty(globalThis.navigator, 'gpu', { configurable: true, value: { requestAdapter: async (o) => {
    const a = await requestAdapter(o), requestDevice = a.requestDevice.bind(a);
    return Object.assign(Object.create(a), { requestDevice: async (d) => {
      const dev = await requestDevice(d);
      dev.addEventListener('uncapturederror', (e) => errors.push(e.error.message));
      for (const k of ['createRenderPipelineAsync', 'createComputePipelineAsync', 'createRenderPipeline', 'createComputePipeline']) {
        const f = dev[k].bind(dev);
        dev[k] = (desc) => { made.push(desc.fragment?.entryPoint ?? desc.compute.entryPoint); return f(desc); };
      }
      return dev;
    } });
  } } });

  const lit = (px, x0, y0, x1, y1) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * px.w + x) * 4; if (Math.max(px.data[o], px.data[o + 1], px.data[o + 2]) > 60) n++; }
    return n;
  };
  steps.length = 0;
  const px = await studioPortrait(words, g, portraitCells(g, null), (s) => steps.push(s));
  assert.deepEqual(steps, ['gpu', 'compile', 'draw']);
  assert.deepEqual(made.sort(), ['fsPlain', 'fsPoint', 'organDirs'], 'only the studio\'s pipelines');
  assert.deepEqual(errors, []);
  assert.equal(px.w, STUDIO_SIZE); assert.equal(px.h, STUDIO_SIZE); assert.equal(px.data.length, STUDIO_SIZE ** 2 * 4);
  // its cells in the middle of the frame, where a card shows it; the water about them dark
  const S = STUDIO_SIZE, inner = lit(px, S * 0.3, S * 0.3, S * 0.7, S * 0.7);
  assert.ok(inner > S * S * 0.002, `cells drawn (${inner} lit pixels)`);
  assert.equal(lit(px, 0, 0, S, S * 0.15) + lit(px, 0, S * 0.85, S, S), 0, 'the water dark at the frame\'s edges');
  // in the species' own color: its greens lead in a grazer's
  let rgb = [0, 0, 0];
  for (let o = 0; o < px.data.length; o += 4) if (Math.max(px.data[o], px.data[o + 1], px.data[o + 2]) > 60) rgb = rgb.map((v, i) => v + px.data[o + i]);
  const want = [(g.col & 255), (g.col >>> 8) & 255, (g.col >>> 16) & 255];
  assert.equal(rgb.indexOf(Math.max(...rgb)), want.indexOf(Math.max(...want)), `its hue (${rgb} for ${want})`);

  // a body as a card carries it: its cells bonded, laid out by their bonds, drawn as one
  const body = genome('reef'), cells = portraitCells(body.g, Array.from({ length: 8 }, (_, i) => ({ role: i % 2, bonds: i ? [i - 1] : [] })));
  const bpx = await studioPortrait(body.words, body.g, cells);
  assert.ok(lit(bpx, S * 0.2, S * 0.2, S * 0.8, S * 0.8) > S * S * 0.004, 'a body drawn');
  assert.deepEqual(errors, []);
  assert.ok(gpu);
});
