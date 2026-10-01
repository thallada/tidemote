import test from 'node:test';
import assert from 'node:assert/strict';
import { traceBody } from '../src/trace.js';

function particles(positions) {
  const buffer = new ArrayBuffer(positions.length * 10 * 4);
  const u32 = new Uint32Array(buffer), f32 = new Float32Array(buffer);
  positions.forEach(([x, y], i) => {
    f32[i * 10] = x; f32[i * 10 + 1] = y;
    u32[i * 10 + 4] = 3; u32[i * 10 + 7] = 100 + i;
  });
  return [u32, f32, positions.length];
}

test('traceBody finds a three-cell chain and ignores a far cell', () => {
  const packed = particles([[10, 10], [11, 10], [12, 10], [50, 50]]);
  const result = traceBody(...packed, 100, 100, 100, 1.1);
  assert.deepEqual([...result.body].sort(), [0, 1, 2]);
  assert.deepEqual([...result.X], [10, 11, 12, 50]);
  assert.deepEqual([...result.Y], [10, 10, 10, 50]);
  assert.equal(traceBody(...packed, 999, 100, 100, 1.1), null);
  assert.deepEqual(traceBody(...packed, 103, 100, 100, 1.1).body, [3]);
});

test('traceBody joins across the torus and resets scratch bins between calls', () => {
  const result = traceBody(...particles([[99.5, 99.5], [0.5, 0.5], [1.5, 1.5], [50, 50]]), 100, 100, 100, 1.5);
  assert.deepEqual([...result.body].sort(), [0, 1, 2]);
  assert.deepEqual(traceBody(...particles([[10, 10], [50, 50]]), 100, 100, 100, 1.5).body, [0]);
  assert.equal(traceBody(...particles([]), 100, 10, 10, 1), null);
});
