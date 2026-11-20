import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radial, snapshot, createPadState, padStep, releaseAll, createPads, DEADZONE, REPEAT_MS } from '../src/input/pad.js';
import { BTN, HOLD_MS } from '../src/input/actions.js';
import { createMode, noteInput, MOUSE_TAKES } from '../src/input/mode.js';
import { sectorOf, ROSE_GRACE, createRose } from '../src/rose.js';
import { nextIndex, adjust, isAdjustable } from '../src/input/focus.js';

// a pad as navigator.getGamepads() gives one: pressed buttons by name, axes [lx, ly, rx, ry], triggers 0..1
function pad({ press = [], axes = [0, 0, 0, 0], lt = 0, rt = 0, id = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', mapping = 'standard' } = {}) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: press.includes(i), value: press.includes(i) ? 1 : 0 }));
  buttons[BTN.LT] = { pressed: lt > 0.1, value: lt }; buttons[BTN.RT] = { pressed: rt > 0.1, value: rt };
  return { id, mapping, connected: true, buttons, axes };
}
const ids = (evs) => evs.map((e) => e.id);
// run frames of [time, pads, ctx]; returns every frame's action ids
function run(frames, st = createPadState()) {
  return frames.map(([t, pads, ctx = 'world']) => ids(padStep(st, snapshot(pads), t, ctx)));
}

test('a stick at rest reads zero; past its rest it rises smoothly from zero along the same way', () => {
  assert.deepEqual(radial(0.1, -0.1), [0, 0]);
  const [x, y] = radial(DEADZONE + 0.01, 0);
  assert.ok(x > 0 && x < 0.05 && y === 0);
  const [a, b] = radial(0.6, 0.8); // full deflection
  assert.ok(Math.abs(Math.hypot(a, b) - 1) < 1e-9 && Math.abs(a / b - 0.75) < 1e-9);
});

test('a press acts once, on the press', () => {
  const out = run([[0, [pad({ press: [BTN.S] })]], [16, [pad({ press: [BTN.S] })]], [32, [pad()]]]);
  assert.deepEqual(out, [['select'], [], []]);
});

test('a bumper tapped is its tap; held past the moment, its hold and then its end', () => {
  const tap = run([[0, [pad({ press: [BTN.LB] })]], [HOLD_MS - 30, [pad({ press: [BTN.LB] })]], [HOLD_MS - 10, [pad()]]]);
  assert.deepEqual(tap, [[], [], ['swap-tool']]);
  const hold = run([[0, [pad({ press: [BTN.LB] })]], [HOLD_MS + 5, [pad({ press: [BTN.LB] })]], [HOLD_MS + 50, [pad({ press: [BTN.LB] })]], [400, [pad()]]]);
  assert.deepEqual(hold, [[], ['rose-tools'], [], ['rose-tools:end']]);
});

test('a d-pad held in a panel repeats: once, then after a pause, then quickly', () => {
  const p = [pad({ press: [BTN.DOWN] })];
  const out = run([[0, p, 'panel'], [REPEAT_MS[0] - 1, p, 'panel'], [REPEAT_MS[0], p, 'panel'], [REPEAT_MS[0] + REPEAT_MS[1], p, 'panel']]);
  assert.deepEqual(out, [['nav-down'], [], ['nav-down'], ['nav-down']]);
  // (in the world it pauses once, however long it is held)
  assert.deepEqual(run([[0, p], [2000, p]]), [['pause'], []]);
});

test('a hold is read in the context it began in', () => {
  const st = createPadState();
  run([[0, [pad({ press: [BTN.LB] })], 'world']], st);
  // (the rose opening makes the context change; letting go still closes the world's rose)
  assert.deepEqual(run([[HOLD_MS + 1, [pad({ press: [BTN.LB] })], 'panel'], [300, [pad()], 'panel']], st), [['rose-tools'], ['rose-tools:end']]);
});

test('triggers are analog, sticks deadzoned, and either counts as using the pad', () => {
  const st = createPadState();
  padStep(st, snapshot([pad({ lt: 0.5, axes: [0.05, 0, 0, 0] })]), 0);
  assert.equal(st.lt, 0.5); assert.deepEqual(st.left, [0, 0]); assert.ok(st.active);
  padStep(st, snapshot([pad()]), 16);
  assert.ok(!st.active);
});

test('two pads (Steam\'s virtual pad and the device it stands for) act as one', () => {
  const v = (o) => pad({ ...o, id: 'Steam Virtual Gamepad (STANDARD GAMEPAD Vendor: 28de Product: 11ff)' });
  const out = run([[0, [v({ press: [BTN.S] }), pad({ press: [BTN.S] })]], [16, [v({ press: [BTN.S] }), pad()]], [32, [v(), pad()]]]);
  assert.deepEqual(out, [['select'], [], []]);
});

test('a pad without the standard mapping gives its face buttons and left stick only', () => {
  const p = pad({ press: [BTN.S, BTN.LB], axes: [0, 0, 1, 1], mapping: '' });
  const snap = snapshot([p]);
  assert.equal(snap.buttons[BTN.S], 1); assert.equal(snap.buttons[BTN.LB], 0); assert.deepEqual(snap.axes.slice(2), [0, 0]);
});

test('letting go of everything ends a hold without its tap, and stops the sticks', () => {
  const st = createPadState();
  run([[0, [pad({ press: [BTN.RB], axes: [1, 0, 0, 0] })]], [HOLD_MS + 1, [pad({ press: [BTN.RB], axes: [1, 0, 0, 0] })]]], st);
  assert.deepEqual(ids(releaseAll(st)), ['rose-view:end']);
  assert.deepEqual(st.left, [0, 0]);
  assert.deepEqual(run([[300, [pad()]]], st), [[]]); // (no tap afterwards)
});

test('the browser\'s side: a pad unplugged mid-hold lets go; the page losing focus does too', () => {
  const ev = {}; let list = [pad({ press: [BTN.RB] })];
  const win = { addEventListener: (n, f) => { ev[n] = f; }, document: { addEventListener() {}, hidden: false } };
  const pads = createPads({ win, getPads: () => list });
  pads.poll(0, 'world');
  assert.deepEqual(ids(pads.poll(HOLD_MS + 1, 'world')), ['rose-view']);
  list = [null, null, null, null];
  assert.deepEqual(ids(pads.poll(300, 'world')), ['rose-view:end']);
  assert.ok(!pads.connected);
  list = [pad({ press: [BTN.RB] })];
  pads.poll(400, 'world'); pads.poll(400 + HOLD_MS + 1, 'world');
  ev.blur();
  assert.deepEqual(ids(pads.poll(700, 'world')), ['rose-view:end']);
});

test('only keys and pads change whose names the hints show; the mouse only takes the pointer', () => {
  const m = createMode();
  assert.equal(m.glyphs, 'keys');
  assert.ok(noteInput(m, { kind: 'pad', family: 'deck' }));
  assert.deepEqual([m.glyphs, m.family, m.pointer], ['pad', 'deck', 'pad']);
  // the Deck's trackpad as a mouse: a little movement, then more, then a click; the hints stay the pad's
  assert.ok(!noteInput(m, { kind: 'move', d: MOUSE_TAKES - 1 }));
  assert.ok(noteInput(m, { kind: 'move', d: 5 }));
  assert.deepEqual([m.glyphs, m.pointer], ['pad', 'mouse']);
  noteInput(m, { kind: 'pointer', type: 'mouse' });
  assert.equal(m.glyphs, 'pad');
  // a lone Shift is no key press; a letter is
  assert.ok(!noteInput(m, { kind: 'key', key: 'Shift' }));
  assert.ok(noteInput(m, { kind: 'key', key: 'g' }));
  assert.equal(m.glyphs, 'keys');
  assert.equal(createMode({ coarse: true }).pointer, 'touch');
});

test('the rose: an octant by angle, none at rest, a band of hysteresis at its borders', () => {
  assert.equal(sectorOf(0, -1), 0); // up
  assert.equal(sectorOf(1, 0), 2); // right
  assert.equal(sectorOf(0, 1), 4); // down
  assert.equal(sectorOf(-0.7, -0.7), 7); // up and left
  assert.equal(sectorOf(0.1, 0.1), -1);
  // 25° from the top is past the border at 22.5° (octant 1), but within the band of octant 0 lit before
  const a = (25 * Math.PI) / 180, x = Math.sin(a), y = -Math.cos(a);
  assert.equal(sectorOf(x, y), 1);
  assert.equal(sectorOf(x, y, 8, 0), 0);
  const b = (35 * Math.PI) / 180;
  assert.equal(sectorOf(Math.sin(b), -Math.cos(b), 8, 0), 1);
});

test('the rose keeps its choice a moment after the stick springs back, and a stick left at rest cancels', () => {
  const el = { hidden: false, innerHTML: '', style: { setProperty() {} }, classList: { toggle() {} }, setAttribute() {}, querySelectorAll: () => [] };
  const r = createRose(el);
  const items = 'abcdefgh'.split('').map((id) => ({ id, label: id }));
  r.open(items, 0, 0, 'x');
  r.steer([1, 0], 0); r.steer([0, 0], ROSE_GRACE - 10);
  assert.equal(r.close(), 'c');
  r.open(items, 0, 0, 'x');
  r.steer([1, 0], 0); r.steer([0, 0], ROSE_GRACE + 10);
  assert.equal(r.close(), null);
  r.open(items, 0, 0, 'x');
  assert.equal(r.close(), null);
});

test('focus moves to the nearest control that way, in line before off to the side', () => {
  const R = (left, top, w = 40, h = 20) => ({ left, top, width: w, height: h, right: left + w, bottom: top + h });
  const from = R(100, 100);
  const rects = [R(160, 100), R(140, 60), R(100, 160), R(40, 100), R(100, 40), R(150, 200)];
  assert.equal(nextIndex(from, rects, 'right'), 0);
  assert.equal(nextIndex(from, rects, 'down'), 2);
  assert.equal(nextIndex(from, rects, 'left'), 3);
  assert.equal(nextIndex(from, rects, 'up'), 4);
  // a nearer control off to the side loses to one in line
  assert.equal(nextIndex(R(0, 0), [R(60, 40), R(100, 0)], 'right'), 1);
  assert.equal(nextIndex(from, [R(0, 0)], 'right'), -1);
});

test('a slider held by A moves a twentieth of its span a press, a stick by fractions that add up; a list by an option', () => {
  const ev = []; const el = (o) => ({ type: 'range', min: '0', max: '100', step: '1', value: '50', dispatchEvent: (e) => ev.push(e.type), ...o });
  const v = el();
  assert.ok(isAdjustable(v));
  assert.ok(adjust(v, 1)); assert.equal(+v.value, 55); assert.deepEqual(ev, ['input', 'change']);
  adjust(v, -1); adjust(v, -1); assert.equal(+v.value, 45);
  // (a stick's little pushes, a frame at a time, still get there; never past the end)
  for (let i = 0; i < 10; i++) adjust(v, 0.1);
  assert.equal(+v.value, 50);
  for (let i = 0; i < 40; i++) adjust(v, 1);
  assert.equal(+v.value, 100); assert.ok(!adjust(v, 1));
  // a coarse step is kept to; no step attribute is 1; "any" is fine
  const c = el({ max: '10', value: '5' }); adjust(c, 1); assert.equal(+c.value, 6);
  const a = el({ min: '0', max: '1', step: 'any', value: '0.5' }); adjust(a, 1); assert.ok(Math.abs(+a.value - 0.55) < 1e-9);
  const sel = { tagName: 'SELECT', options: [1, 2, 3], selectedIndex: 0, dispatchEvent() {} };
  adjust(sel, 1); adjust(sel, 1); adjust(sel, 1); assert.equal(sel.selectedIndex, 2);
  assert.ok(!isAdjustable({ tagName: 'BUTTON' }));
});
