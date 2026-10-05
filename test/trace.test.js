import test from 'node:test';
import assert from 'node:assert/strict';
import { traceBody, retraceBody, settleMembers, nearBody } from '../src/trace.js';
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

test('retraceBody re-finds a body after its watched cell is gone, and follows the larger part of a split', () => {
  const prev = new Map([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  // Cell 1 died; the rest are still bonded.
  let tb = retraceBody(...particles([[2, 0, 0, 3], [3, 0, 0, 4], [4, 0, 0, 5], [5, 0, 0], [9, 0, 0]]), prev, 1);
  assert.deepEqual(tb.body.map((i) => [2, 3, 4, 5, 9][i]).sort(), [2, 3, 4, 5]);
  // Split into {1, 2} and {3, 4, 5}: the larger part wins even though it lacks the watched cell.
  const cells = [[1, 0, 0, 2], [2, 0, 0], [3, 0, 0, 4], [4, 0, 0, 5], [5, 0, 0]];
  tb = retraceBody(...particles(cells), prev, 1);
  assert.deepEqual(tb.body.map((i) => cells[i][0]).sort(), [3, 4, 5]);
  assert.equal(tb.index.get(1), 0);
  // An even split goes to the part holding the watched cell.
  tb = retraceBody(...particles(cells), new Map([[1, 0], [2, 0], [3, 0], [4, 0]]), 1);
  assert.deepEqual(tb.body.map((i) => cells[i][0]).sort(), [1, 2]);
  // No previous members: trace from the preferred cell; none left: null.
  assert.deepEqual(retraceBody(...particles(cells), null, 4).body.map((i) => cells[i][0]).sort(), [3, 4, 5]);
  assert.equal(retraceBody(...particles([[7, 0, 0]]), prev, 1), null);
});

test('settleMembers keeps cells through brief bond breaks and drops the dead at once', () => {
  const m = new Map();
  settleMembers(m, [1, 2, 3], new Set([1, 2, 3]), 2);
  assert.deepEqual([...m.keys()].sort(), [1, 2, 3]);
  // 3 is alive but momentarily unbonded; 2 died (missing from the readback); 4 joins.
  settleMembers(m, [1, 4], new Set([1, 3, 4]), 2);
  assert.deepEqual([...m.entries()].sort(), [[1, 0], [3, 1], [4, 0]]);
  settleMembers(m, [1, 4], new Set([1, 3, 4]), 2);
  assert.equal(m.get(3), 2);
  settleMembers(m, [1, 4], new Set([1, 3, 4]), 2);
  assert.equal(m.has(3), false);
  // A partial readback cannot tell a missing cell is dead, so it only counts as a miss.
  settleMembers(m, [1], null, 2);
  assert.deepEqual([...m.entries()].sort(), [[1, 0], [4, 1]]);
  // Rebonding resets the count.
  settleMembers(m, [1, 4], null, 2);
  assert.equal(m.get(4), 0);
});

test('nearBody reaches candidates touching the body directly or through each other, across the wrap', () => {
  const X = new Float32Array([1, 1.3, 1.6, 5, 9.9]);
  const Y = new Float32Array([1, 1, 1, 1, 1]);
  // body: 0; candidates: 2 (via 1), 1 (direct), 3 (far), 4 (across the wrap from 0 at x = 1 - 1.1)
  const got = nearBody(X, Y, [0], [1, 2, 3, 4], 0.4, 10, 10);
  assert.deepEqual([...got].sort(), [1, 2]);
  X[4] = 9.8; X[0] = 0.1;
  X[1] = 0.4; X[2] = 0.7;
  assert.deepEqual([...nearBody(X, Y, [0], [1, 2, 3, 4], 0.4, 10, 10)].sort(), [1, 2, 4]);
  assert.equal(nearBody(X, Y, [0], [], 0.4, 10, 10).size, 0);
});

test('settleMembers keeps a member that is unbonded but still touching the body', () => {
  const m = new Map([[1, 0], [2, 0]]);
  for (let k = 0; k < 5; k++) settleMembers(m, [1], new Set([1, 2]), 2, new Set([2]));
  assert.equal(m.get(2), 0);
});
