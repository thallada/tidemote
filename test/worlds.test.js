import test from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack, encodeWorld, decodeWorld, toColumns, fromColumns } from '../src/worlds.js';
import { compactState } from '../src/engine.js';
import { META_CLAIM, P_BYTES } from '../src/shaders.js';

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

test('records kept by columns come back, floats cut only as far as asked', async () => {
  const n = 257, words = 3;
  const u = new Uint32Array(n * words), f = new Float32Array(u.buffer);
  for (let i = 0; i < n; i++) { f[i * 3] = 300 + i / 7; u[i * 3 + 1] = (i * 2654435761) >>> 0; f[i * 3 + 2] = -i / 3; }
  const layout = { words, keep: [16, 32, 23], planes: [1, 0, 1] };
  const back = new Float32Array(fromColumns(toColumns(u.buffer, layout), layout)), bu = new Uint32Array(back.buffer);
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(back[i * 3] - f[i * 3]) <= 2 ** (8 - 16), `cut float ${i}`);
    assert.equal(bu[i * 3] & 0x7f, 0, 'its low mantissa bits are zero');
    assert.equal(bu[i * 3 + 1], u[i * 3 + 1], 'an integer column exact');
    assert.equal(back[i * 3 + 2], f[i * 3 + 2], 'a float kept whole exact');
  }
  // and through a whole file
  const w = await decodeWorld(await encodeWorld({ meta: {}, cpu: {}, gpu: { parts: u.buffer, other: Uint8Array.of(9, 8).buffer }, page: {}, layout: { parts: layout } }));
  assert.deepEqual(new Uint32Array(w.gpu.parts), bu);
  assert.deepEqual([...new Uint8Array(w.gpu.other)], [9, 8]);
});

test('an older world file is told apart from a file that is not a world', async () => {
  const old = new Uint8Array(await new Response(new Blob([Uint8Array.of(0x54, 0x4d, 0x57, 0x31, 0, 0, 0, 0)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  await assert.rejects(decodeWorld(old), /another version/);
});

test('a kept world drops the action words no pending claim will read', () => {
  const n = 6;
  const intent = new Uint32Array(n * 4).map((_, i) => i + 1);
  const ledger = new Uint32Array(META_CLAIM + n);
  ledger[META_CLAIM + 0] = 3 + 1; // particle 0 claimed by particle 3
  ledger[META_CLAIM + 1] = 0x80000000 | 5; // a coarse step's meal: names no claimer
  const parts = new Float32Array(n * P_BYTES / 4);
  const { gpu, layout } = compactState({ cpu: { grid: [506, 212] }, gpu: { parts: parts.buffer, intent: intent.buffer, ledger: ledger.buffer } });
  const it = new Uint32Array(gpu.intent);
  for (let i = 0; i < n; i++) {
    const kept = i === 3;
    assert.equal(it[i * 4], kept ? intent[i * 4] : 0, `x of ${i}`);
    assert.equal(it[i * 4 + 1], kept ? intent[i * 4 + 1] : 0, `y of ${i}`);
    assert.equal(it[i * 4 + 2], intent[i * 4 + 2], `bonds of ${i} stay`);
    assert.equal(it[i * 4 + 3], intent[i * 4 + 3]);
  }
  assert.equal(intent[0], 1, 'the state read is left as it was');
  assert.equal(layout.parts.keep[0], 18);
});
