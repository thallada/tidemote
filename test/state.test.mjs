import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

// The engine's state read back from a running world (under Dawn, on lavapipe where there is no GPU).
test('what the engine reads back of a world', { timeout: 120_000 }, async (t) => {
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
  const { bodyCensus } = await import('../src/bodies.js');
  let r = 7;
  const rng = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const N = 2048, eng = await createEngine(device, 'rgba8unorm', { hasTimestamps: false });
  assert.ok(await eng.allocate(N));
  eng.resize(64, 36);
  eng.seed(N, { aspect: 16 / 9, rng });
  for (let f = 0; f < 30; f++) eng.frame({ target: null, simDt: 1 / 60, time: f / 60 });

  await t.test('readBodies reads what bodyCensus takes of readState, byte for byte', async () => {
    const st = await eng.readState(), b = await eng.readBodies();
    assert.equal(b.cpu.count, st.cpu.count);
    for (const k of ['parts', 'intent', 'genomes']) {
      assert.deepEqual(new Uint8Array(b.gpu[k]), new Uint8Array(st.gpu[k], 0, b.gpu[k].byteLength), k);
    }
    const census = bodyCensus(b.cpu, b.gpu);
    assert.ok(census.living > 0);
    assert.deepEqual(census, bodyCensus(st.cpu, st.gpu));
  });

  assert.deepEqual(errors, []);
});
