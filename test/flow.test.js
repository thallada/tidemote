import test from 'node:test';
import assert from 'node:assert/strict';
import { tideAt, flowAt } from '../src/flow.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('tide matches the shader smoothstep, normalisation and torus coordinates', () => {
  const w = [1, 0, 1, 2, ...Array(12).fill(0)];
  const s = (2.7 * Math.sin(0.5) - 0.35) / (1.9 - 0.35);
  near(tideAt(0, 0, 100, 80, 0.5, w), s * s * (3 - 2 * s));
  near(tideAt(100, 80, 100, 80, 0.5, w), tideAt(0, 0, 100, 80, 0.5, w));
  assert.equal(tideAt(0, 0, 100, 80, 0, w), 0);
  assert.equal(tideAt(0, 0, 100, 80, Math.PI / 2, w), 1);
  assert.equal(tideAt(0, 0, 100, 80, 1, Array(16).fill(0)), 0);
  const phase = [0, 0, 0, 0, 0, 0, 0, 1, ...Array(8).fill(0)];
  assert.equal(tideAt(0, 0, 100, 80, 0, phase), 1); // second wave has the 1.7 phase offset
});

test('flow is perpendicular to the wave vector, with finite zero-wave output', () => {
  const w = [3, 4, 0, 2, ...Array(12).fill(0)];
  const [vx, vy] = flowAt(0, 0, 0, w);
  near(vx, 1.6); near(vy, -1.2); near(3 * vx + 4 * vy, 0);
  assert.deepEqual(flowAt(1, 2, 3, Array(16).fill(0)), [0, 0]);
});
