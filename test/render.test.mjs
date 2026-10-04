import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

// Exercise real rasterization, including the three views, rather than matching shader text.
test('cell LOD preserves scale, reflects state, clips walls and renders auxiliary views', { timeout: 60_000 }, async (t) => {
  if (process.platform === 'linux' && existsSync('/usr/share/vulkan/icd.d/lvp_icd.json')) {
    process.env.VK_ICD_FILENAMES = '/usr/share/vulkan/icd.d/lvp_icd.json';
  }
  const { create, globals } = await import('webgpu');
  Object.assign(globalThis, globals);
  const gpu = create([]), adapter = await gpu.requestAdapter();
  if (!adapter) { t.skip('No WebGPU adapter available'); return; }
  const device = await adapter.requestDevice();
  t.after(() => device.destroy());
  const errors = [];
  device.addEventListener('uncapturederror', (e) => errors.push(e.error.message));
  const { createEngine } = await import('../src/engine.js');
  const { archetypeGenome, writeGenome, packUnorm } = await import('../src/genome.js');
  const { MAXK, G_WORDS } = await import('../src/shaders.js');
  const eng = await createEngine(device, 'rgba8unorm');
  assert.ok(await eng.allocate(8));
  eng.grid = [10, 10]; eng.count = 1; eng.resize(256, 256);
  Object.assign(eng.settings, { links: false, trails: 0, bloom: 0, tide: 0 });
  const g = Object.assign(archetypeGenome('reef', () => 0.5), {
    size: 1, shape: 0, pulse: 0, swim: 0, calcify: 0, photo: 1, lifespan: 100, reproE: 1,
  });
  const genome = new ArrayBuffer(MAXK * G_WORDS * 4);
  const updateGenome = () => {
    writeGenome(new Uint32Array(genome), new Float32Array(genome), 4, g);
    device.queue.writeBuffer(eng.b.genomes, 0, genome);
  };
  const particles = new ArrayBuffer(8 * 40), pf = new Float32Array(particles), pu = new Uint32Array(particles);
  const particle = (i, x, y, kind = 4) => {
    const j = i * 10;
    pf[j] = x; pf[j + 1] = y; pf[j + 2] = 0.1; pu[j + 4] = kind;
    pf[j + 5] = 0.4; pf[j + 6] = 5; pu[j + 7] = 123 + i; pu[j + 8] = packUnorm(0.4, 0.7, 0.5, 1);
  };
  particle(0, 5, 5); particle(1, 5.14, 5);
  const intent = new Uint32Array(8 * 4).fill(0xffffffff);
  const texture = device.createTexture({ size: [256, 256], format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  t.after(() => texture.destroy());
  const half = (h) => ((h & 0x8000) ? -1 : 1) * ((h & 0x7c00) ? (1 + (h & 1023) / 1024) * 2 ** (((h >> 10) & 31) - 15) : (h & 1023) * 2 ** -24);
  const render = async (ppu) => {
    updateGenome();
    device.queue.writeBuffer(eng.b.parts, 0, particles);
    device.queue.writeBuffer(eng.b.intent, 0, intent);
    eng._writeView(eng.b.view, eng.viewData, { x: 5, y: 5, ppu }, 256, 256, 1, 2, 0xffffffff);
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(eng.b.frameCtr, 20, eng.b.bridgeDraw, 4, 4);
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: texture.createView(), loadOp: 'clear', storeOp: 'store' }] });
    eng._drawScene(pass, eng.bgLine, eng.bgPoint, eng.bgPointFar, eng.bgBridge, eng.viewData);
    pass.end();
    const buf = device.createBuffer({ size: 256 * 256 * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture }, { buffer: buf, bytesPerRow: 2048 }, [256, 256]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint16Array(buf.getMappedRange());
    const green = Float32Array.from({ length: 256 * 256 }, (_, j) => half(src[j * 4 + 1]));
    buf.unmap(); buf.destroy();
    assert.deepEqual(errors, []);
    return green;
  };
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const span = (a) => {
    let left = 256, right = 0;
    for (let j = 0; j < a.length; j++) if (a[j] > 0.01) { left = Math.min(left, j % 256); right = Math.max(right, j % 256); }
    return right - left;
  };
  const far = await render(20), small = await render(400), large = await render(800);
  assert.ok(span(far) < 6);
  assert.ok(span(large) > 120, 'cell grows well beyond the previous 40px radius cap');
  assert.ok(Math.abs(span(large) / span(small) - 2) < 0.08, 'deep radius follows world scale');
  assert.ok(Math.abs(sum(large) / sum(small) - 4) < 0.3, 'brightness per world area stays stable');
  const belowLOD = await render(70.5), aboveLOD = await render(70.8);
  assert.ok(Math.abs(sum(aboveLOD) / sum(belowLOD) - 1) < 0.03, 'detail onset introduces no brightness jump');

  const at = (a, x, y = 128) => a[y * 256 + x];
  const beforeWall = await render(500);
  intent[2] = 1;
  const wall = await render(500);
  assert.ok(at(beforeWall, 170) > 0.05 && at(wall, 170) < 0.005, 'partner bisector removes the overlapping side');
  assert.ok(at(wall, 110) > 0.05, 'the opposite side survives clipping');
  intent[2] = 0xffffffff;

  pf[5] = 0.99;
  const dividing = await render(500);
  assert.ok(at(dividing, 128) / (0.35 + 0.65 * 0.99) > at(beforeWall, 128) / (0.35 + 0.65 * 0.4) * 1.15,
    'division opens a bright neck between the two darker nucleus lobes');
  pf[5] = 0.4; g.photo = 0;
  const eating = await render(500);
  assert.ok(eating.filter((v, j) => Math.abs(v - beforeWall[j]) > 0.01).length > 100, 'diet changes organelles');

  eng.setFocus({ kinds: new Uint32Array(MAXK / 32), mute: 0.1 });
  const muted = await render(500);
  assert.ok(sum(muted) < sum(eating) * 0.1, 'focus filters mute both colour and footprint');
  eng.setFocus({ members: new Uint32Array([123]), memberKind: 4 });
  const member = await render(500);
  assert.ok(sum(member) > sum(eating) * 1.2, 'member highlight survives detailed rendering');
  eng.setFocus();

  for (const kind of [0, 1, 2, 3]) {
    pu[4] = kind;
    const matter = await render(800);
    assert.ok(matter.every(Number.isFinite) && sum(matter) > 1, `matter kind ${kind} renders a finite, visible detailed grain`);
  }
  pu[4] = 4;

  // Real indirect bridges, both partner slots, and the collapsed single-partner strip.
  eng.count = 3; particle(1, 5.25, 5); particle(2, 5.5, 5.1);
  intent[2] = 1; intent[6] = 0; intent[7] = 2; intent[10] = 1;
  device.queue.writeBuffer(eng.b.livingList, 0, new Uint32Array([0, 1, 2]));
  device.queue.writeBuffer(eng.b.frameCtr, 0, new Uint32Array([3, 1, 1, 1, 4, 3, 0, 0]));
  eng.settings.nodes = false; eng.settings.links = true;
  assert.ok(sum(await render(500)) > 1, 'curved strips produce visible bridges');
  eng.settings.nodes = true;
  const target = device.createTexture({ size: [256, 256], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  t.after(() => target.destroy());
  eng.frame({ target: target.createView(), cam: { x: 5, y: 5, ppu: 20 }, paused: true, selId: 123,
    loupe: { cx: 5, cy: 5, x: 128, y: 128, r: 64, ppu: 500 },
    specimen: { cx: 5, cy: 5, ppu: 800, w: 256, h: 256, dpr: 1, target: target.createView() } });
  await device.queue.onSubmittedWorkDone();
  assert.deepEqual(errors, [], 'all three view bind groups and indirect arguments validate');
});
