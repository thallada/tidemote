import test from 'node:test';
import assert from 'node:assert/strict';
import { linearTicks, shortNum, fmtVal, popOf } from '../src/charts.js';

test('linearTicks spans the data with round steps from zero', () => {
  for (const max of [0, 0.004, 0.07, 0.93, 1.3, 7, 13, 3412, 48000]) {
    const { top, ticks } = linearTicks(max, 3);
    assert.equal(ticks[0], 0);
    assert.ok(top >= max && Math.abs(ticks[ticks.length - 1] - top) < 1e-9, `top ${top} over ${max}`);
    assert.ok(ticks.length >= 2 && ticks.length <= 5, `${ticks.length} ticks for ${max}`);
    const step = ticks[1], m = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
    assert.ok([1, 2, 5].some((k) => Math.abs(m - k) < 1e-6), `round step ${step}`);
  }
});

test('axis labels are short and as precise as their step', () => {
  assert.equal(shortNum(950), '950');
  assert.equal(shortNum(2000, 1000), '2k');
  assert.equal(shortNum(1500, 500), '1.5k');
  assert.equal(shortNum(40000), '40k');
  assert.equal(shortNum(1.5e6), '1.5M');
  assert.equal(shortNum(0.5, 0.5), '0.5');
  assert.equal(shortNum(0.02, 0.01), '0.02');
  assert.deepEqual(linearTicks(0.07).ticks.map((v, _, a) => fmtVal(v, '%', a[1])), ['0%', '5%', '10%']);
  assert.deepEqual(linearTicks(13).ticks.map((v, _, a) => fmtVal(v, '°', a[1])), ['0°', '5°', '10°', '15°']);
});

test('plate values keep a sensible precision', () => {
  assert.equal(fmtVal(3412), '3,412');
  assert.equal(fmtVal(12.34), '12.3');
  assert.equal(fmtVal(1.234), '1.23');
  assert.equal(fmtVal(0.0042), '0.0042');
  assert.equal(fmtVal(0.93, '%'), '93%');
  assert.equal(fmtVal(0.042, '%'), '4.2%');
  assert.equal(fmtVal(23.46, '°'), '23.5°');
});

test('popOf reads a species from the census history', () => {
  const at = popOf(7);
  assert.equal(at({ sp: [[3, 10], [7, 42]] }), 42);
  assert.equal(at({ sp: [[3, 10]] }), 0);
});
