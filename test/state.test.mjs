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
  const { createEngine, compactState } = await import('../src/engine.js');
  const { encodeWorld, decodeWorld } = await import('../src/worlds.js');
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
      assert.ok(Buffer.from(b.gpu[k]).equals(Buffer.from(st.gpu[k], 0, b.gpu[k].byteLength)), k);
    }
    const census = bodyCensus(b.cpu, b.gpu);
    assert.ok(census.living > 0);
    assert.deepEqual(census, bodyCensus(st.cpu, st.gpu));
  });

  // (2891207: snapshot() kept the whole heat buffer, past what stateSizes says, and main.js openWorld refused every save)
  await t.test('readState keeps each buffer at exactly the size stateSizes gives, as a save that opens', async () => {
    const st = await eng.readState(), want = eng.stateSizes(st.cpu.count);
    assert.deepEqual(Object.keys(st.gpu).sort(), Object.keys(want).sort());
    for (const [k, size] of Object.entries(want)) assert.equal(st.gpu[k].byteLength, size, k);
    // through a save file and back, as the page saves and openWorld checks one
    const w = await decodeWorld(await encodeWorld({ meta: {}, cpu: st.cpu, ...compactState(st), page: {} }));
    for (const [k, size] of Object.entries(eng.stateSizes(w.cpu.count))) assert.equal(w.gpu[k]?.byteLength, size, k);
  });

  await t.test('a world put back with writeState reads back as it was', async () => {
    const st = await eng.readState(), relief = eng.relief.slice();
    // the world runs on, and the engine holds another world's grid and floor when it is put back
    for (let f = 0; f < 5; f++) eng.frame({ target: null, simDt: 1 / 60, time: f / 60 });
    assert.ok(!Buffer.from((await eng.readState()).gpu.parts).equals(Buffer.from(st.gpu.parts)));
    eng.grid = [3, 3]; eng.relief = null;
    eng.writeState(st);
    const back = await eng.readState();
    assert.equal(back.cpu.count, st.cpu.count);
    assert.deepEqual(back.cpu.grid, st.cpu.grid);
    assert.equal(back.cpu.seedValue, st.cpu.seedValue);
    for (const k of Object.keys(st.gpu)) assert.ok(Buffer.from(back.gpu[k]).equals(Buffer.from(st.gpu[k])), k);
    assert.deepEqual(eng.relief, relief);
  });

  // a world saved in the middle of a floor shift goes on shifting when opened, as one put back by restore() does
  await t.test('a floor shift under way goes through a save file and on', async () => {
    const through = async () => {
      const st = await eng.readState();
      return decodeWorld(await encodeWorld({ meta: {}, cpu: st.cpu, ...compactState(st), page: {} }));
    };
    const workOut = () => { for (let k = 0; k < 10000 && eng.floor?.work; k++) eng.stepFloor(); };
    const run = (n) => { for (let f = 0; f < n; f++) eng.frame({ target: null, simDt: 1 / 60, time: f / 60 }); };
    // (under a full pool the floor takes its new shape at once: eased, the shore creeps)
    eng.level = 0.95;
    // saved while the new floor is still being worked out: opened, it is worked out again, the same
    eng.shiftFloor(3, 0.5, 120);
    assert.ok(eng.floor?.work);
    const early = await through(), reliefThen = eng.relief.slice();
    workOut();
    const to = eng.floor.to.slice();
    run(5);
    eng.writeState({ cpu: early.cpu, gpu: early.gpu });
    assert.deepEqual(eng.relief, reliefThen);
    assert.ok(eng.floor?.work);
    workOut();
    assert.deepEqual(eng.floor.to, to);
    assert.deepEqual(eng.floor.from, reliefThen);
    // saved part way through easing there: opened, it eases on from where it was, toward the same floor
    run(30); eng.stepFloor();
    const f = eng.floor, u = (eng.simTime - f.t0) / f.secs;
    assert.ok(u > 0 && u < 1, `part way (${u})`);
    assert.ok(eng.relief.some((x, i) => x !== f.from[i]), 'the floor has moved');
    const mid = await through(), want = { ...f, from: f.from.slice(), to: f.to.slice() }, reliefMid = eng.relief.slice(), t0 = eng.simTime;
    eng.floor = null; eng.relief = null; run(5);
    eng.writeState({ cpu: mid.cpu, gpu: mid.gpu });
    assert.equal(eng.simTime, t0);
    assert.deepEqual(eng.relief, reliefMid);
    assert.deepEqual(eng.floor, want);
    // and arrives: the floor it eased toward, the shift over
    eng.simTime = want.t0 + want.secs;
    eng.stepFloor();
    assert.equal(eng.floor, null);
    assert.deepEqual(eng.relief, want.to);
    eng.level = 1;
  });

  assert.deepEqual(errors, []);
});
