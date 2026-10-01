import test from 'node:test';
import assert from 'node:assert/strict';
import { abioRate } from '../src/climate.js';

test('abiogenesis averages two sparks per simulated minute across glint populations', () => {
  for (const glint of [1, 10, 2048, 1000000]) {
    const expectedSparks = abioRate(glint) * glint * 60 * 60;
    assert.ok(Math.abs(expectedSparks - 2) < 1e-12);
  }
  assert.ok(Number.isFinite(abioRate(0)));
  assert.equal(abioRate(0), abioRate(1));
});
