import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHand, TOOLS, keyOf } from '../src/hand.js';

const make = () => {
  const words = new Float32Array(28), ids = new Uint32Array(words.buffer);
  ids.fill(0xffffffff, 20, 22);
  return { words, ids, hand: createHand(words, ids, { reach: 3 }) };
};
const run = (h, s, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) h.update(dt); };

test('eight tools, keyed 1 to 8 in order', () => {
  assert.equal(TOOLS.length, 8);
  assert.equal(keyOf('loupe'), '1');
  assert.equal(keyOf('pipette'), '8');
});

test('the loupe writes nothing: the world untouched', () => {
  const { hand, words, ids } = make();
  hand.down(10, 10, 0); hand.move(12, 10, 0.1, 1); run(hand, 1); hand.up();
  for (const i of [3, 7, 10, 11, 17]) assert.equal(words[i], 0, `word ${i}`);
  assert.equal(ids[21], 0xffffffff);
  assert.equal(hand.touched, false);
});

test('a lamp held brightens within a second, and fades over about ten once let go', () => {
  const { hand, words } = make();
  hand.set('lamp'); hand.down(5, 6, 100);
  run(hand, 1);
  assert.ok(words[3] > 0.5, `lit ${words[3]}`);
  assert.deepEqual([words[0], words[1], words[2]], [5, 6, 3]);
  hand.up();
  run(hand, 3);
  assert.ok(words[3] > 0.1 && words[3] < 0.4, `fading ${words[3]}`);
  run(hand, 20);
  assert.equal(words[3], 0, 'gone, and exactly nothing');
  assert.equal(hand.touched, true);
  assert.equal(hand.acts[0].tool, 'lamp');
});

test('a shade takes light; warm and cold heat and chill', () => {
  const { hand, words } = make();
  hand.set('shade'); hand.down(0, 0, 0); run(hand, 2);
  assert.ok(words[3] < -0.8);
  hand.set('cold'); hand.down(1, 1, 3); run(hand, 1);
  assert.ok(words[7] < -0.9);
  hand.set('warm'); hand.down(1, 1, 5); run(hand, 1);
  assert.ok(words[7] > 0.9);
});

test('a stir drags the water as fast as the finger, in the world’s seconds, capped', () => {
  const { hand, words } = make();
  hand.set('touch'); hand.down(0, 0, 0);
  hand.move(0.5, 0, 0.5, 1); run(hand, 0.5);
  assert.ok(Math.abs(words[10] - 1) < 0.05, `vx ${words[10]}`);
  hand.move(1.0, 0, 0.5, 2); run(hand, 0.5);
  assert.ok(Math.abs(words[10] - 0.5) < 0.05, 'at ×2 the same stroke is half as fast');
  hand.move(100, 0, 0.1, 1); run(hand, 0.5);
  assert.ok(words[10] <= 2.0001, 'capped');
  hand.up(); run(hand, 8);
  assert.equal(words[10], 0);
});

test('a tap rings from the oldest raindrop slot; a prick names its cell once', () => {
  const { hand, ids } = make();
  const drops = new Float64Array(16);
  drops.set([0, 0, 5, 1, 0, 0, 2, 1, 0, 0, 9, 1, 0, 0, 7, 1]);
  hand.tap(drops, 3, 4, 20);
  assert.deepEqual([...drops.subarray(4, 8)], [3, 4, 20, 2.5]);
  hand.set('needle');
  hand.prick(1234, 1, 1, 21);
  assert.equal(ids[20], 1234);
});

test('the needle cuts along its stroke for one frame', () => {
  const { hand, words } = make();
  hand.set('needle'); hand.down(1, 1, 0); hand.move(2, 1, 1 / 60, 1);
  hand.update(1 / 60);
  assert.deepEqual([...words.subarray(12, 16)], [1, 1, 2, 1]);
  assert.ok(words[17] > 0);
  hand.update(1 / 60);
  assert.equal(words[17], 0);
});

test('acts in one place run together; elsewhere or later they are new', () => {
  const { hand } = make();
  hand.set('touch');
  hand.tap(new Float64Array(16), 1, 1, 10);
  hand.tap(new Float64Array(16), 1.5, 1, 12);
  hand.tap(new Float64Array(16), 30, 1, 13);
  hand.tap(new Float64Array(16), 30, 1, 40);
  assert.equal(hand.acts.length, 3);
  assert.equal(hand.acts[0].n, 2);
});

test('steering writes the rider, its target and strength', () => {
  const { hand, words, ids } = make();
  hand.steer(77, 4, 5, 0.8); hand.update(1 / 60);
  assert.equal(ids[21], 77);
  assert.deepEqual([words[18], words[19]], [4, 5]);
  assert.ok(Math.abs(words[22] - 0.8) < 1e-6);
  hand.steer(0xffffffff); hand.update(1 / 60);
  assert.equal(ids[21], 0xffffffff);
});

test('a held act lasts until it is let go', () => {
  const { hand } = make();
  hand.set('lamp'); hand.down(1, 1, 10); hand.up(40);
  assert.equal(hand.acts[0].end, 40);
  hand.set('warm'); hand.down(1, 1, 50); hand.set('cold', 55);
  assert.equal(hand.acts[1].end, 55, 'taking another tool lets go');
});

test('the pipette draws at its tip while the page says so', () => {
  const { hand, words } = make();
  hand.suck = [3, 4, 2, 10]; hand.update(1 / 60);
  assert.deepEqual([...words.subarray(24, 28)], [3, 4, 2, 10]);
  hand.suck = null; hand.update(1 / 60);
  assert.deepEqual([...words.subarray(24, 28)], [0, 0, 0, 0]);
});
