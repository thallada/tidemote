import test from 'node:test';
import assert from 'node:assert/strict';
import { traceBody } from '../src/trace.js';
import { PICK_WORDS } from '../src/shaders.js';

const NONE = 0xffffffff;
function particles(cells) {
  const buffer = new ArrayBuffer(cells.length * PICK_WORDS * 4);
  const u32 = new Uint32Array(buffer), f32 = new Float32Array(buffer);
  cells.forEach(([id, x, y, a = NONE, b = NONE], i) => {
    const o = i * PICK_WORDS;
    f32[o] = x; f32[o + 1] = y;
    u32[o + 4] = 4; u32[o + 7] = id;
    u32[o + 10] = a; u32[o + 11] = b;
  });
  return [u32, f32, cells.length];
}

test('traceBody follows asymmetric bonds in both directions, regardless of proximity', () => {
  const packed = particles([
    [700, 10, 10, 42],
    [42, 50, 50, NONE, 900],
    [900, 99.5, 99.5],
    [13, 10, 10], // Even a coincident cell is separate without a bond.
  ]);
  for (const id of [700, 42, 900]) {
    const result = traceBody(...packed, id);
    assert.deepEqual([...result.body].sort(), [0, 1, 2]);
    assert.deepEqual([...result.X], [10, 50, 99.5, 10]);
    assert.deepEqual([...result.Y], [10, 50, 99.5, 10]);
  }
  assert.deepEqual(traceBody(...packed, 13).body, [3]);
  assert.equal(traceBody(...packed, 999), null);
});

test('traceBody visits cycles, reciprocal bonds, duplicate partners and self bonds once', () => {
  const packed = particles([
    [81, 0, 0, 12, 99],
    [12, 0, 0, 81, 99],
    [99, 0, 0, 81, 81],
    [7, 0, 0, 7],
  ]);
  assert.deepEqual(traceBody(...packed, 81).body, [0, 1, 2]);
  assert.deepEqual(traceBody(...packed, 7).body, [3]);
});

test('traceBody ignores missing partners and sentinel slots, including particle ID zero', () => {
  const packed = particles([
    [0, 0, 0, 12345], // Partner missing from a truncated readback.
    [500, 0, 0, NONE, 0],
    [22, 0, 0],
  ]);
  assert.deepEqual(traceBody(...packed, 0).body, [0, 1]);
  assert.deepEqual(traceBody(...packed, 22).body, [2]);
});

test('traceBody handles empty readbacks and independent calls', () => {
  assert.equal(traceBody(...particles([]), 100), null);
  assert.deepEqual(traceBody(...particles([[100, 0, 0, 200], [200, 0, 0]]), 100).body, [0, 1]);
  assert.deepEqual(traceBody(...particles([[100, 0, 0], [200, 0, 0]]), 100).body, [0]);
});
