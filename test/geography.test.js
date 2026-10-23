import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRelief, makeIceOrder, countPools, rankField } from '../src/geography.js';
import { eventAt, makeEvent, eventSpan, createClimate, EVENT_TYPES } from '../src/climate.js';

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

test('the floor is a field of quantiles, the same for a seed and different between seeds', () => {
  const a = makeRelief(40, 30, 7), b = makeRelief(40, 30, 7), c = makeRelief(40, 30, 8);
  assert.equal(a.length, 1200);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const sorted = Float32Array.from(a).sort();
  for (let i = 0; i < sorted.length; i += 97) assert.ok(Math.abs(sorted[i] - (i + 0.5) / 1200) < 1e-6);
  // smooth: neighbours mostly lie close in rank
  let jumps = 0;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 39; x++) if (Math.abs(a[y * 40 + x] - a[y * 40 + x + 1]) > 0.25) jumps++;
  assert.ok(jumps < 30, `jumps ${jumps}`);
  assert.deepEqual(rankField(Float32Array.from([3, 1, 2])), Float32Array.from([2.5 / 3, 0.5 / 3, 1.5 / 3]));
});

test('low water parts the pool; full water is one pool', () => {
  const q = makeRelief(110, 110, 7);
  assert.equal(countPools(q, 110, 110, 1).pools, 1);
  const low = countPools(q, 110, 110, 0.4);
  assert.ok(low.pools >= 2, `pools ${low.pools}`);
  assert.ok(low.largest < 1);
  // the ice's order freezes some first and leaves veins: half frozen still leaves liquid in many places
  const ice = makeIceOrder(110, 110, 7, q);
  assert.equal(ice.length, q.length);
});

test('a drought falls, holds, rains and refills; a frost freezes and thaws; duckweed comes and goes', () => {
  const r = rng(3);
  const d = makeEvent('drought', 100, r, 100, 100);
  const at = (u) => eventAt(d, 100 + u, 1);
  assert.equal(at(0).level, 1);
  assert.ok(Math.abs(at(d.fall).level - d.low) < 1e-6);
  assert.equal(at(d.fall + 1).phase, 'dry');
  const rain = at(d.fall + d.hold + d.refill / 2);
  assert.equal(rain.phase, 'rain');
  assert.ok(rain.rain > 0.5 && rain.sky < 1 && rain.turb > 1);
  assert.ok(Math.abs(at(d.fall + d.hold + d.refill).level - 1) < 1e-6);
  assert.equal(at(eventSpan(d) + 1).phase, null);
  const f = makeEvent('frost', 0, r, 100, 100);
  assert.equal(eventAt(f, f.cool + f.grow + 1, 1).frost, f.max);
  assert.ok(eventAt(f, f.cool + f.grow + f.hold + f.thaw + 1, 1).frost === 0);
  const l = makeEvent('duckweed', 0, r, 100, 100);
  assert.ok(eventAt(l, l.dur / 2, 1).duck[3] > 0.7);
  assert.equal(eventAt(l, l.dur + 1, 1).duck, null);
});

test('the climate draws events by its plan and drives the pool', () => {
  const eng = { K: { eventPlan: 'storm@10' }, simTime: 0, ambient: 0.2, temp: 16, excursion: 0, tide: new Float32Array(16), waves: new Float32Array(16), grid: [50, 50],
    level: 1, rain: 0, sky: 1, evap: 0, turb: 1, frost: 0, freezing: 0, duck: new Float32Array(8), drops: new Float32Array(16),
    newTideWave() {}, randomizeCurrents: (r, into) => into };
  const c = createClimate(eng, rng(5));
  for (let i = 0; i < 60 * 60; i++) { eng.simTime += 1 / 60; c.tick(1 / 60); }
  assert.equal(c.events.length, 1);
  assert.equal(c.events[0].type, 'storm');
  assert.ok(eng.rain > 0 && eng.sky < 1 && eng.turb > 1);
  assert.ok(EVENT_TYPES.includes('frost'));
});
