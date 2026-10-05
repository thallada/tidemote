import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

// Exercise real rasterization, including the three views, rather than matching shader text.
test('LOD preserves light, bonded outlines merge, and all detail views validate', { timeout: 60_000 }, async (t) => {
  if (process.platform === 'linux' && existsSync('/usr/share/vulkan/icd.d/lvp_icd.json')) {
    process.env.VK_ICD_FILENAMES = '/usr/share/vulkan/icd.d/lvp_icd.json';
  }
  const { create, globals } = await import('webgpu');
  Object.assign(globalThis, globals);
  const gpu = create([]), adapter = await gpu.requestAdapter();
  if (!adapter) { t.skip('No WebGPU adapter available'); return; }
  const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
  // Dawn's instance must outlive the device, even if GC runs during readbacks.
  t.after(() => { assert.ok(gpu); device.destroy(); });
  const errors = [];
  device.addEventListener('uncapturederror', (e) => errors.push(e.error.message));
  const { createEngine } = await import('../src/engine.js');
  const { archetypeGenome, writeGenome, packUnorm, cellShape } = await import('../src/genome.js');
  const { MAXK, G_WORDS, DRAW_WGSL } = await import('../src/shaders.js');
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
  // Resolve the distant profile at the same radius to compare integrated light without
  // the sampling noise of a six-pixel sprite. This reference is used only in this GPU test.
  const referenceModule = device.createShaderModule({ code: DRAW_WGSL + `
    @fragment fn fsReference(i: PO) -> @location(0) vec4f {
      return vec4f(i.col * spriteFalloff(i.uv, i.shape), 0.0);
    }` });
  const reference = device.createRenderPipeline({ layout: 'auto',
    vertex: { module: referenceModule, entryPoint: 'vsPoint' },
    fragment: { module: referenceModule, entryPoint: 'fsReference', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-strip' } });
  const referenceBG = device.createBindGroup({ layout: reference.getBindGroupLayout(0), entries:
    [[0, 'view'], [1, 'parts'], [2, 'genomes'], [3, 'intent'], [5, 'focus'], [6, 'bondsIn'], [8, 'touch'], [9, 'bends']]
      .map(([binding, name]) => ({ binding, resource: { buffer: eng.b[name] } })) });
  const half = (h) => ((h & 0x8000) ? -1 : 1) * ((h & 0x7c00) ? (1 + (h & 1023) / 1024) * 2 ** (((h >> 10) & 31) - 15) : (h & 1023) * 2 ** -24);
  const render = async (ppu, distantProfile = false, onlyCell = null) => {
    updateGenome();
    device.queue.writeBuffer(eng.b.parts, 0, particles);
    device.queue.writeBuffer(eng.b.intent, 0, intent);
    eng._writeView(eng.b.view, eng.viewData, { x: 5, y: 5, ppu }, 256, 256, 1, 2, 0xffffffff);
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(eng.b.frameCtr, 20, eng.b.bridgeDraw, 4, 4);
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: texture.createView(), loadOp: 'clear', storeOp: 'store' }] });
    if (distantProfile) {
      pass.setPipeline(reference); pass.setBindGroup(0, referenceBG); pass.draw(4, eng.count);
    } else if (onlyCell !== null) {
      pass.setPipeline(eng.pPoint); pass.setBindGroup(0, eng.bgPoint); pass.draw(4, 1, 0, onlyCell);
    } else {
      eng._drawScene(pass, eng.bgLine, eng.bgPoint, eng.bgBridge, eng.viewData);
    }
    pass.end();
    const buf = device.createBuffer({ size: 256 * 256 * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture }, { buffer: buf, bytesPerRow: 2048 }, [256, 256]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint16Array(buf.getMappedRange());
    // as the composite sees it: light divided by the coverage of overlapping resolved cells
    const green = Float32Array.from({ length: 256 * 256 }, (_, j) => half(src[j * 4 + 1]) / Math.max(1, half(src[j * 4 + 3])));
    buf.unmap(); buf.destroy();
    assert.deepEqual(errors, []);
    return green;
  };
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  assert.ok(sum(await render(20)) > 0, 'far profile renders with the shared bindings');
  // Compare integrated light with the distant profile at the same constant-world radius.
  // Cover silhouettes, interiors and organelles, with two genomes and cell states.
  for (const serial of [1, 901]) {
    // These serials select the unrestricted branch for this genome's surface signature.
    Object.assign(g, { serial, photo: serial === 1 ? 0.5 : 1, calcify: serial === 1 ? 0 : 0.8,
      swim: serial === 1 ? 0 : 1.3, adhesion: 0, advect: 0.5 });
    pf[5] = serial === 1 ? 0.4 : 0.98;
    pu[7] = serial === 1 ? 123 : 719;
    for (let shape = 0; shape < 12; shape++) {
      g.shape = shape;
      assert.equal(cellShape(g), shape, 'inspector names match the unrestricted plans');
      for (const radius of [3, 8, 18, 60]) {
        const ppu = radius / 0.085;
        const light = sum(await render(ppu)), distant = sum(await render(ppu, true));
        assert.ok(Math.abs(light / distant - 1) < 0.15,
          `class ${shape}, genome ${serial}, radius ${radius}: light ratio ${light / distant}`);
      }
    }
  }
  // Real outlines, per-cell phases/orientations, and role-dependent plans/radii.
  // Read each cell alone, then both together: measure overlap and unsupported
  // protrusions beyond the old bisector using raster coverage, not shader text.
  Object.assign(g, { serial: 1, swim: 0, calcify: 0, photo: 0.5 });
  particle(0, 5, 5); particle(1, 5.08, 5);
  pf[2] = 0.04; pf[3] = 0.1; pf[13] = -0.04;
  eng.count = 2;
  let protrusionPixels = 0;
  for (const shape of [2, 3, 4]) for (const role of [0, 1]) {
    g.shape = shape; pu[19] = role << 4;
    intent.fill(0xffffffff);
    const self = await render(500, false, 0);
    const partner = await render(500, false, 1);
    const unbonded = await render(500);
    intent[2] = 1; intent[6] = 0;
    const merged = await render(500);
    if (shape === 2 && role === 1) {
      // The packed second frame must work even when the first slot is absent.
      intent[2] = 0xffffffff; intent[3] = 1;
      const secondSlot = await render(500);
      const difference = secondSlot.reduce((s, v, j) => s + Math.abs(v - merged[j]), 0);
      assert.ok(difference < sum(merged) * 0.001, 'either partner slot produces the same merge');
      intent[2] = 1; intent[3] = 0xffffffff;
    }
    // Overlaps never sum: wherever both cells cover a pixel, bonded or not, the light is no more
    // than the brighter cell alone. Protrusions the partner doesn't cover survive the merge.
    let overlap = 0, single = 0, unsupportedBefore = 0, unsupportedAfter = 0, pixels = 0;
    for (let j = 0; j < self.length; j++) {
      if (self[j] > 0.15 && partner[j] > 0.15) {
        overlap += Math.max(unbonded[j], merged[j]); single += Math.max(self[j], partner[j]);
      }
      if (j % 256 > 148 && self[j] > 0.05 && partner[j] < 1e-6) {
        unsupportedBefore += self[j]; unsupportedAfter += merged[j]; pixels++;
      }
    }
    assert.ok(single > 1, `plan ${shape}, role ${role}: real overlapping tissue`);
    assert.ok(overlap < single * 1.1, `plan ${shape}, role ${role}: overlap light ${overlap / single} of one cell`);
    protrusionPixels += pixels;
    assert.ok(unsupportedAfter >= unsupportedBefore * 0.95,
      `plan ${shape}, role ${role}: uncovered protrusions survive (${unsupportedAfter / unsupportedBefore})`);
  }
  assert.ok(protrusionPixels > 20, 'tested unsupported protrusions beyond the old bisector');
  pu[19] = 0;

  g.shape = 0;
  // Real indirect bridges, both partner slots, and the collapsed single-partner strip.
  eng.count = 3; particle(1, 5.25, 5); particle(2, 5.5, 5.1);
  intent[2] = 1; intent[6] = 0; intent[7] = 2; intent[10] = 1;
  device.queue.writeBuffer(eng.b.livingList, 0, new Uint32Array([0, 1, 2]));
  device.queue.writeBuffer(eng.b.frameCtr, 0, new Uint32Array([3, 1, 1, 1, 4, 3, 0, 0]));
  eng.settings.nodes = false; eng.settings.links = true;
  await render(500); // Validate real indirect bridges before rendering all three views.
  eng.settings.nodes = true;
  const target = device.createTexture({ size: [256, 256], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  t.after(() => target.destroy());
  eng.frame({ target: target.createView(), cam: { x: 5, y: 5, ppu: 500 }, paused: true, selId: 123,
    loupe: { cx: 5, cy: 5, x: 128, y: 128, r: 64, ppu: 500 },
    specimen: { cx: 5, cy: 5, ppu: 800, w: 256, h: 256, dpr: 1, target: target.createView() } });
  await device.queue.onSubmittedWorkDone();
  assert.deepEqual(errors, [], 'all three view bind groups and indirect arguments validate');
});
