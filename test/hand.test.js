import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHand, TOOLS, keyOf, works, INSTRUMENTS } from '../src/hand.js';

const make = () => {
  const words = new Float32Array(32), ids = new Uint32Array(words.buffer);
  ids.fill(0xffffffff, 20, 22);
  return { words, ids, hand: createHand(words, ids, { reach: 3 }) };
};
const run = (h, s, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) h.update(dt); };

test('eight tools, keyed 1 to 8 in order, and no tool at 0', () => {
  assert.equal(TOOLS.length, 9);
  assert.equal(keyOf('none'), '0');
  assert.equal(keyOf('loupe'), '1');
  assert.equal(keyOf('pipette'), '8');
  assert.deepEqual(TOOLS.filter((t) => !works(t.id)).map((t) => t.id), ['none', 'loupe']);
});

test('the loupe and no tool write nothing: the world untouched', () => {
  for (const tool of ['loupe', 'none']) {
    const { hand, words, ids } = make();
    hand.set(tool);
    hand.hover(10, 10); hand.down(10, 10, 0); hand.move(12, 10, 0.1, 1); run(hand, 1); hand.up();
    for (const i of [3, 7, 10, 11, 17, 30, 31]) assert.equal(words[i], 0, `${tool}: word ${i}`);
    assert.equal(ids[21], 0xffffffff);
    assert.equal(hand.touched, false);
  }
});

test('a lamp held brightens within a second; let go, a quarter of it stays with the pointer, and none once it leaves', () => {
  const { hand, words } = make();
  hand.set('lamp'); hand.down(5, 6, 100);
  run(hand, 1);
  assert.ok(words[3] > 0.5, `lit ${words[3]}`);
  assert.deepEqual([words[0], words[1], words[2]], [5, 6, 3]);
  hand.up();
  run(hand, 2);
  assert.ok(Math.abs(words[3] - 0.15) < 0.01, `a quarter ${words[3]}`);
  hand.hover(9, 9); run(hand, 0.1);
  assert.deepEqual([words[0], words[1]], [9, 9], 'it goes where the pointer goes');
  hand.hover(null); run(hand, 3);
  assert.equal(words[3], 0, 'gone, and exactly nothing');
  assert.equal(hand.acts.length, 1, 'only the press is an act');
  assert.equal(hand.touched, true);
});

test('over the world, not pressed, a tool is no act', () => {
  const { hand, words } = make();
  hand.set('warm'); hand.hover(2, 2); run(hand, 1);
  assert.ok(words[7] > 0.2 && words[7] <= 0.25, `a quarter ${words[7]}`);
  assert.equal(hand.touched, false);
});

test('a shade takes light; warm and cold heat and chill', () => {
  const { hand, words } = make();
  hand.set('shade'); hand.down(0, 0, 0); run(hand, 2);
  assert.ok(words[3] < -0.8);
  hand.set('cold'); hand.down(1, 1, 3); run(hand, 1);
  assert.ok(words[7] < -0.75);
  hand.set('warm'); hand.down(1, 1, 5); run(hand, 1);
  assert.ok(words[7] > 0.75);
});

test('the rod pressed is in the water, its disc the reach; it sweeps from where it was when the world last stepped', () => {
  const { hand, words } = make();
  hand.set('touch'); hand.hover(1, 1); hand.update(1 / 60);
  assert.equal(words[16], 0, 'over the water: not in it');
  hand.down(1, 1, 0); hand.update(1 / 60);
  assert.deepEqual([...words.subarray(8, 12)], [1, 1, 1, 1]);
  assert.equal(words[16], 3);
  hand.move(2, 1); hand.move(4, 1); hand.update(1 / 60);
  assert.deepEqual([...words.subarray(8, 12)], [4, 1, 1, 1], 'a frame the world did not step in: still from where it last stepped');
  hand.stepped(); hand.move(5, 1); hand.update(1 / 60);
  assert.deepEqual([...words.subarray(8, 12)], [5, 1, 4, 1]);
  hand.up(); hand.update(1 / 60);
  assert.deepEqual([...words.subarray(8, 12)], [0, 0, 0, 0]);
  assert.equal(words[16], 0);
});

test('the needle pressed is in the water: its point, its shaft running off to its corner; let go, out of it', () => {
  const { hand, words } = make();
  hand.set('needle'); hand.span = 30;
  hand.hover(4, 5); hand.update(1 / 60);
  assert.deepEqual([...words.subarray(28, 32)], [0, 0, 0, 0], 'over the water: not in it');
  hand.down(4, 5, 0); hand.update(1 / 60);
  const [dx, dy] = INSTRUMENTS.needle.dir;
  assert.deepEqual([...words.subarray(28, 32)].map((v) => +v.toFixed(3)), [4, 5, +(dx * 30).toFixed(3), +(dy * 30).toFixed(3)]);
  hand.up(); hand.update(1 / 60);
  assert.deepEqual([...words.subarray(28, 32)], [0, 0, 0, 0]);
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

test('the needle cuts along its stroke since the world last stepped', () => {
  const { hand, words } = make();
  hand.set('needle'); hand.down(1, 1, 0); hand.update(1 / 60);
  assert.equal(words[17], 0, 'not moved: nothing cut');
  hand.move(2, 1); hand.move(3, 1);
  hand.update(1 / 60);
  assert.deepEqual([...words.subarray(12, 16)], [1, 1, 3, 1]);
  assert.ok(words[17] > 0);
  hand.stepped(); hand.update(1 / 60);
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
