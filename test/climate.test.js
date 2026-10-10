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

test('the water walks within its bounds, and excursions ease in and out', async () => {
  const { createClimate, excursionAt, TEMP_MIN, TEMP_MAX } = await import('../src/climate.js');
  let seed = 7;
  const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const eng = { simTime: 0, ambient: 0.2, chargeMul: 1, temp: 16, ventMul: 1, excursion: 0, tide: new Float32Array(16).fill(1), waves: new Float32Array(16),
    newTideWave() {}, randomizeCurrents: (r, into) => into };
  const climate = createClimate(eng, rng);
  let excursions = 0;
  climate.onExcursion = () => excursions++;
  for (let t = 0; t < 4 * 3600; t++) { eng.simTime = t; climate.tick(1); }
  assert.ok(climate.history.length > 10);
  for (const h of climate.history) assert.ok(h.temp >= TEMP_MIN && h.temp <= TEMP_MAX);
  assert.ok(excursions > 0);
  const x = { t: 100, dT: 6, dur: 200 };
  assert.equal(excursionAt(x, 99), 0);
  assert.ok(Math.abs(excursionAt(x, 200) - 6) < 1e-9);
  assert.equal(excursionAt(x, 301), 0);
});
