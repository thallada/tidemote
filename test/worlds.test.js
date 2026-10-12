import test from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack, encodeWorld, decodeWorld } from '../src/worlds.js';

test('pack keeps Maps and typed arrays', () => {
  const v = { reg: new Map([[7, { name: 'a', series: { t: Float32Array.of(1, 2.5), v: Float32Array.of(3, 4) } }]]), tide: Float32Array.of(0.25), x: null };
  const back = unpack(pack(v));
  assert.ok(back.reg instanceof Map);
  assert.equal(back.reg.get(7).name, 'a');
  assert.ok(back.reg.get(7).series.t instanceof Float32Array);
  assert.deepEqual([...back.reg.get(7).series.t], [1, 2.5]);
  assert.deepEqual([...back.tide], [0.25]);
  assert.equal(back.x, null);
});

test('a world comes back as it was saved', async () => {
  const parts = new Uint8Array(4000).map((_, i) => (i * 37) & 255);
  const thermal = new Float32Array(300).map((_, i) => i / 7);
  const w = {
    meta: { id: 'w1', name: 'The Still Gyre', simTime: 123.5 },
    cpu: { simTime: 123.5, count: 100, grid: [12, 7], tide: Float32Array.of(1, 2, 3) },
    gpu: { parts: parts.buffer, thermal: thermal.buffer },
    page: { life: { reg: new Map([[3, { pop: 9 }]]) } },
  };
  const bytes = await encodeWorld(w);
  assert.equal(bytes[0], 0x1f, 'gzipped');
  const back = await decodeWorld(bytes);
  assert.deepEqual(back.meta, w.meta);
  assert.deepEqual(back.cpu.grid, [12, 7]);
  assert.deepEqual([...back.cpu.tide], [1, 2, 3]);
  assert.deepEqual(new Uint8Array(back.gpu.parts), parts);
  assert.deepEqual(new Float32Array(back.gpu.thermal), thermal);
  assert.equal(back.page.life.reg.get(3).pop, 9);
});

test('a file that is not a world is refused', async () => {
  await assert.rejects(decodeWorld(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer), /Not a Tidemote world/);
});
