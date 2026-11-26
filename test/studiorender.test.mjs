import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

// The card page's studio (src/studiorender.js): a species drawn alone on a device of its own, with only the
// pipelines that takes, its cells where the frame puts them, and a clear refusal where there is no GPU.
test('the card page\'s studio draws a species alone with three pipelines, and says when there is no GPU', { timeout: 120_000 }, async (t) => {
  const { studioPortrait, STUDIO_SIZE } = await import('../src/studiorender.js');
  const { archetypeGenome, writeGenome, readGenome, roleColor, packUnorm } = await import('../src/genome.js');
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
  // In the species' own color, round the whole wheel (so a channel swapped or the genome's color ignored shows): six
  // species alike but for their hue, each portrait's hue (its lit pixels' color above their grey, summed) against its
  // genome's, and a grey species (no saturation) beside them. A pigmented cell's body is drawn in its color: its hue
  // holds close, well clear of grey's. An unpigmented one's body is a dim cool grey, its color in its line, which turns
  // toward a cool white as it resolves (cellWhite): its hue is pulled toward blue (by up to about 55 degrees) and it is
  // little more colored than grey, but its hues must still go round the wheel in the genomes' order.
  const hueOf = ([r, gr, b]) => { const mx = Math.max(r, gr, b), d = mx - Math.min(r, gr, b) || 1e-9; return ((mx === r ? ((gr - b) / d) % 6 : mx === gr ? (b - r) / d + 2 : (r - gr) / d + 4) * 60 + 360) % 360; };
  const turn = (a, b) => ((b - a + 540) % 360) - 180;
  const portraitColor = async (type, change) => {
    const a = { ...archetypeGenome(type, () => 0.4), ...change };
    a.col = packUnorm(...roleColor(a, 0));
    const u = new Uint32Array(G_WORDS), f = new Float32Array(u.buffer);
    writeGenome(u, f, 0, a);
    const sg = readGenome(u, f, 0), px = await studioPortrait(u, sg, portraitCells(sg, null));
    let c = [0, 0, 0], chroma = 0, n = 0;
    for (let o = 0; o < px.data.length; o += 4) {
      const p = [px.data[o], px.data[o + 1], px.data[o + 2]], mn = Math.min(...p), mx = Math.max(...p);
      if (mx <= 60) continue;
      c = c.map((v, k) => v + p[k] - mn); chroma += mx - mn; n++;
    }
    return { hue: hueOf(c), chroma: chroma / Math.max(n, 1), photo: sg.photo };
  };
  for (const [type, pigmented] of [['plankton', true], ['grazer', false]]) {
    const grey = await portraitColor(type, { sat: 0 }), hues = [];
    for (let k = 0; k < 6; k++) {
      const { hue, chroma, photo } = await portraitColor(type, { hue: k / 6 });
      assert.equal(photo > 0.5, pigmented, `a ${type} ${pigmented ? 'pigmented' : 'unpigmented'}`);
      assert.ok(Math.abs(turn(k * 60, hue)) <= (pigmented ? 25 : 60), `a ${type} of hue ${k * 60} drawn at hue ${hue.toFixed(0)}`);
      if (pigmented) assert.ok(chroma > 2 * grey.chroma, `a ${type} of hue ${k * 60} drawn colored (${chroma.toFixed(0)} above its grey, a grey one's ${grey.chroma.toFixed(0)})`);
      hues.push(hue);
    }
    // (each step to the next hue forward, and once round in all)
    const steps = hues.map((h, k) => turn(h, hues[(k + 1) % 6]));
    assert.ok(steps.every((d) => d > 5) && Math.round(steps.reduce((x, d) => x + d, 0)) === 360, `${type}s' hues in the genomes' order round the wheel (${hues.map((h) => h.toFixed(0))})`);
  }

  // a body as a card carries it: its cells bonded, laid out by their bonds, drawn as one
  const body = genome('reef'), cells = portraitCells(body.g, Array.from({ length: 8 }, (_, i) => ({ role: i % 2, bonds: i ? [i - 1] : [] })));
  const bpx = await studioPortrait(body.words, body.g, cells);
  assert.ok(lit(bpx, S * 0.2, S * 0.2, S * 0.8, S * 0.8) > S * S * 0.004, 'a body drawn');
  assert.deepEqual(errors, []);
  assert.ok(gpu);
});
