import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIDE, RIDE_CAM, keyWay, isRideKey, pointerWay, createThrottle, stepThrottle, throttleGrip, createRideCam, stepRideCam } from '../src/ride.js';
import { DEFAULT_K } from '../src/shaders.js';

const DT = 1 / 60;
// hold `way` for `s` seconds; returns [the throttle's length at the end, the distance it carried the cell (world units)]
function hold(th, way, s, dt = DT) {
  let d = 0;
  for (let t = 0; t < s - 1e-9; t += dt) { const u = stepThrottle(th, way, dt); d += Math.hypot(u[0], u[1]) * DEFAULT_K.will * dt; }
  return [Math.hypot(th.u[0], th.u[1]), d];
}

test('WASD and the arrows steer; a diagonal is no faster', () => {
  for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) assert.ok(isRideKey(c));
  assert.ok(!isRideKey('KeyQ'));
  assert.deepEqual(keyWay(new Set(['KeyW'])), [0, -1]);
  const d = keyWay(new Set(['KeyD', 'ArrowDown']));
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9 && d[0] > 0 && d[1] > 0);
  assert.deepEqual(keyWay(new Set(['KeyA', 'KeyD'])), [0, 0]);
  assert.deepEqual(keyWay(new Set()), [0, 0]);
});

test('a held pointer steers at full speed beyond its reach, slower nearer', () => {
  assert.ok(Math.abs(Math.hypot(...pointerWay(3, 4)) - 1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...pointerWay(0.25, 0)) - 0.5) < 1e-9);
  assert.deepEqual(pointerWay(0, 0), [0, 0]);
});

test('top speed takes a second or two of holding; a tap barely moves it', () => {
  // the time to 90% of top speed
  const th = createThrottle();
  let t = 0;
  while (Math.hypot(...th.u) < 0.9 && t < 5) { stepThrottle(th, [1, 0], DT); t += DT; }
  assert.ok(t > 1 && t < 2, `90% after ${t.toFixed(2)} s`);
  // a 100 ms tap, then let go: how far it carries the cell at most (a cell is about 0.1-0.2 across)
  const tap = createThrottle();
  const [, d1] = hold(tap, [1, 0], 0.1);
  const [, d2] = hold(tap, [0, 0], 2);
  assert.ok(d1 + d2 < 0.1, `a tap carried it ${(d1 + d2).toFixed(3)}`);
  assert.deepEqual(tap.u, [0, 0], 'let go, it comes to rest exactly');
  // a 300 ms press moves it further, still under half a unit
  const p = createThrottle();
  const [, e1] = hold(p, [1, 0], 0.3), [, e2] = hold(p, [0, 0], 2);
  assert.ok(e1 + e2 > d1 + d2 && e1 + e2 < 0.5, `a press carried it ${(e1 + e2).toFixed(3)}`);
});

test('it stops quicker than it starts, never past 1, the same at any frame rate', () => {
  const th = createThrottle();
  hold(th, [0, 1], 3);
  let t = 0;
  while (Math.hypot(...th.u) > 0.1 && t < 5) { stepThrottle(th, [0, 0], DT); t += DT; }
  assert.ok(t < 0.75, `to a tenth in ${t.toFixed(2)} s`);
  // turned about, it brakes at the quicker rate before it builds the other way
  const b = createThrottle();
  hold(b, [1, 0], 3);
  const [l] = hold(b, [-1, 0], 0.5);
  assert.ok(b.u[0] < 0.05, 'turned about within half a second');
  assert.ok(l <= 1 + 1e-9);
  for (const dt of [1 / 30, 1 / 144]) {
    const a = createThrottle();
    const [la] = hold(a, [1, 0], 1, dt), [lb] = hold(createThrottle(), [1, 0], 1);
    assert.ok(Math.abs(la - lb) < 0.01, `${la} at ${1 / dt} Hz vs ${lb}`);
  }
  for (let k = 0; k < 600; k++) { stepThrottle(th, [Math.cos(k), Math.sin(k)], DT); assert.ok(Math.hypot(...th.u) <= 1 + 1e-9); }
});

test('its hold on the cell follows the throttle: none at rest', () => {
  assert.equal(throttleGrip([0, 0]), 0);
  assert.ok(throttleGrip([0.1, 0]) < 0.25);
  assert.equal(throttleGrip([0.5 / RIDE.grip * 2, 0]), 1);
});

// run the ride camera; returns the spans it showed each frame
function film(c, speedAt, s, span = 0) {
  const out = [];
  for (let t = 0; t < s - 1e-9; t += DT) out.push(stepRideCam(c, speedAt(t), span, DT));
  return out;
}

test('the ride dives in from afar, out from very close, and keeps a view already near', () => {
  const far = createRideCam(40), close = createRideCam(0.6), near = createRideCam(RIDE_CAM.short * 1.2);
  const f = film(far, () => 0, 1.2), c = film(close, () => 0, 1.2), n = film(near, () => 0, 1.2);
  assert.ok(Math.abs(f.at(-1) / RIDE_CAM.short - 1) < 0.03, `dived to ${f.at(-1)}`);
  assert.ok(Math.abs(c.at(-1) / RIDE_CAM.short - 1) < 0.03, `out to ${c.at(-1)}`);
  assert.ok(Math.abs(n.at(-1) / (RIDE_CAM.short * 1.2) - 1) < 0.01, 'a near view kept');
  // gradual: no frame changes the zoom by more than 12%, the first frames least, and it never overshoots
  const steps = f.slice(1).map((w, i) => Math.abs(Math.log(w / f[i])));
  assert.ok(Math.max(...steps) < Math.log(1.12), `largest step ${Math.max(...steps)}`);
  assert.ok(steps[0] < steps[20], 'it eases in');
  assert.ok(Math.min(...f) >= RIDE_CAM.short * 0.999, 'no overshoot');
  // half of the way (in log) within half a second
  const half = f.findIndex((w) => Math.log(w) < (Math.log(40) + Math.log(RIDE_CAM.short)) / 2);
  assert.ok(half > 0 && half * DT < 0.5, `halfway after ${half * DT}s`);
});

test('the view widens subtly with the speed and closes in as it slows; a body is framed whole', () => {
  const c = createRideCam(RIDE_CAM.short);
  const w0 = film(c, () => 0, 2).at(-1);
  const fast = film(c, () => 1.2, 4);
  const w1 = fast.at(-1);
  assert.ok(w1 / w0 > 1.18 && w1 / w0 <= 1 + RIDE_CAM.wide + 1e-6, `${w1 / w0}`);
  const fr = fast.slice(1).map((w, i) => Math.abs(Math.log(w / fast[i])));
  assert.ok(Math.max(...fr) < 0.004, 'it breathes, never jumps');
  const back = film(c, () => 0, 5).at(-1);
  assert.ok(Math.abs(back / w0 - 1) < 0.01);
  // a jittery speed moves it less than a steady one
  const j = createRideCam(RIDE_CAM.short), jw = film(j, (t) => (Math.floor(t * 30) % 2 ? 1 : 0), 6);
  assert.ok(Math.max(...jw.slice(-120)) / Math.min(...jw.slice(-120)) < 1.04);
  const b = createRideCam(RIDE_CAM.short);
  assert.ok(Math.abs(film(b, () => 0, 3, 4).at(-1) / (4 * RIDE_CAM.body) - 1) < 0.02, 'a body framed');
  const big = createRideCam(RIDE_CAM.short);
  assert.ok(Math.abs(film(big, () => 0, 3, 40).at(-1) / (RIDE_CAM.short * RIDE_CAM.bodyMax) - 1) < 0.02, 'a big body about the cell');
});
