import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPipette, setDownJob } from '../src/pipette.js';

const NONE = 0xffffffff;
const rec = (id, partners = [NONE, NONE], energy = 1) => ({ kind: 9, energy, age: 5, id, col: 0xff00ff00, info: 16, partners });
const sp = (serial) => ({ serial, words: new Array(56).fill(serial), slot: 9, name: `S${serial}` });

test('an organism drawn up keeps its shape and its bonds among the cells that came', () => {
  const pp = createPipette();
  const shape = new Map([[1, [0, 0]], [2, [0.2, 0]], [3, [0.4, 0]]]);
  // 3 kept a bond to 4, which tore off and stayed behind
  pp.add(sp(7), [rec(1, [2, NONE]), rec(2, [3, NONE]), rec(3, [4, NONE])], shape);
  assert.equal(pp.count, 3);
  const o = pp.species[0].orgs[0];
  assert.deepEqual(o.cells.map((c) => [c[0], c[6]]), [[0, 1], [0.2, 2], [0.4, -1]]);
});

test('species in the order their first cells came in; the tip leaves first, its last organism first', () => {
  const pp = createPipette();
  pp.add(sp(7), [rec(1)], new Map());
  pp.add(sp(8), [rec(2), rec(3)], new Map());
  pp.add(sp(7), [rec(4), rec(5), rec(6)], new Map());
  assert.deepEqual(pp.species.map((s) => s.serial), [7, 8]);
  const n = pp.next();
  assert.equal(n.cells.length, 3, 'the last in');
  pp.placed(3, n, 3);
  assert.equal(pp.count, 3);
  pp.placed(1, pp.next(), 1);
  assert.deepEqual(pp.species.map((s) => s.serial), [8], 'a species set down whole leaves the strip');
  pp.toTip(pp.species[0]);
  assert.equal(pp.tip.serial, 8);
});

test('a body only partly set down keeps the rest, its bonds to the placed dropped', () => {
  const pp = createPipette();
  pp.add(sp(7), [rec(1, [2, NONE]), rec(2, [3, NONE]), rec(3, [NONE, NONE])], new Map());
  const n = pp.next();
  pp.placed(3, n, 1);
  assert.deepEqual(pp.species[0].orgs[0].cells.map((c) => [c[6], c[7]]), [[1, -1], [-1, -1]]);
});

test('the limit: whether a body fits, and a card’s colony that does not is refused', () => {
  const pp = createPipette(undefined, 10);
  pp.add(sp(7), Array.from({ length: 6 }, (_, i) => rec(i + 1)), new Map());
  assert.equal(pp.fits(4), true);
  assert.equal(pp.fits(5), false);
  assert.equal(pp.load({ card: 'c1', serial: 99, words: [], name: 'Card', stranger: true }, 4), true);
  assert.equal(pp.count, 10);
  assert.equal(pp.load({ card: 'c1', serial: 99, words: [], name: 'Card', stranger: true }, 1), false);
  assert.equal(pp.species[1].made, 4);
  const n = pp.next(pp.species[1], 3);
  assert.equal(n.made, 3, 'a colony at a time');
  pp.placed(3, n, 3);
  assert.equal(pp.species[1].made, 1);
});

test('a set-down job lays organisms out in their shapes, and newborns as a pocket', () => {
  const pp = createPipette();
  pp.add(sp(7), [rec(1, [2, NONE]), rec(2)], new Map([[1, [0, 0]], [2, [0.3, 0.1]]]));
  pp.add(sp(7), [rec(3)], new Map());
  const s7 = pp.species[0];
  const job = setDownJob([...pp.all(s7), { sp: { words: [], slot: null, stranger: true }, made: 4, cells: null }], () => [0.5, 1, 2], () => 0.5);
  assert.equal(job.species.length, 2);
  assert.equal(job.species[1].stranger, true);
  assert.deepEqual(job.counts, [2, 1, 4]);
  assert.deepEqual(job.cells[0].bonds, [1, -1]);
  assert.deepEqual([job.cells[1].dx, job.cells[1].dy], [0.3, 0.1]);
  assert.ok(Math.hypot(job.cells[2].dx, job.cells[2].dy) > 0.5, 'the second set apart');
  assert.equal(job.cells[3].energy, 0.5);
});
