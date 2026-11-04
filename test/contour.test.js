import test from 'node:test';
import assert from 'node:assert/strict';
import { contours, smooth, area } from '../src/contour.js';

const field = (nx, ny, fn) => { const f = new Float32Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = fn(i, j); return f; };

test('a round hill gives one closed loop about its middle, at the level\'s radius', () => {
  const f = field(21, 21, (i, j) => 10 - Math.hypot(i - 10, j - 10));
  const loops = contours(f, 21, 21, 5);
  assert.equal(loops.length, 1);
  for (const [x, y] of loops[0]) assert.ok(Math.abs(Math.hypot(x - 10, y - 10) - 5) < 0.2);
  assert.ok(Math.abs(Math.abs(area(loops[0])) - Math.PI * 25) < 3);
});

test('two hills apart give two loops; one at the field\'s edge still closes', () => {
  const f = field(30, 12, (i, j) => Math.max(4 - Math.hypot(i - 6, j - 6), 4 - Math.hypot(i - 23, j - 6)));
  assert.equal(contours(f, 30, 12, 2).length, 2);
  const g = field(10, 10, (i, j) => 5 - Math.hypot(i, j));
  const loops = contours(g, 10, 10, 2);
  assert.equal(loops.length, 1);
  assert.ok(loops[0].length >= 4);
});

test('a ring gives its outer edge and its hole; smoothing keeps a loop closed and near', () => {
  const f = field(31, 31, (i, j) => { const d = Math.hypot(i - 15, j - 15); return d > 5 && d < 11 ? 1 : 0; });
  const loops = contours(f, 31, 31, 0.5);
  assert.equal(loops.length, 2);
  const s = smooth(loops[0], 2);
  assert.equal(s.length, loops[0].length * 4);
  assert.ok(Math.abs(Math.abs(area(s)) - Math.abs(area(loops[0]))) / Math.abs(area(loops[0])) < 0.1);
});
