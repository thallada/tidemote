import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPipette, setDownJob, mergeJobs, bodiesOf } from '../src/pipette.js';
import { PIPE_EARLIER } from '../src/shaders.js';

const NONE = 0xffffffff;
const rec = (id, partners = [NONE, NONE], info = 16) => ({ kind: 9, energy: 1, age: 5, id, col: 0xff00ff00, info, partners });
const sp = (serial) => ({ serial, words: new Array(56).fill(serial), slot: 9, name: `S${serial}` });
const at = () => [0, 0, 1, 0];

test('cells drawn up come apart into their bodies, each in leaving order, bonds among the cells that came', () => {
  // a chain 1-2-3 (3 kept a bond to 4, which tore off and stayed behind), and 5 alone
  const orgs = bodiesOf([rec(3, [4, NONE]), rec(5), rec(1, [2, NONE], 32), rec(2, [3, NONE])]);
  assert.deepEqual(orgs.map((o) => o.cells.length), [3, 1]);
  const [a] = orgs;
  assert.deepEqual(a.cells.map((c) => c.slice(4)), [[-1, -1], [0, -1], [1, -1]], 'each next to one already out; the torn bond dropped');
  assert.deepEqual(a.cells.map((c) => c[3]), [16, 16, 32], 'every cell keeps its own type');
});

test('a species is in the pipette once: drawn up again, or its card loaded, it joins the same entry', () => {
  const pp = createPipette();
  pp.add(sp(7), [rec(1)]);
  pp.add(sp(8), [rec(2), rec(3)]);
  pp.add(sp(7), [rec(4, [5, NONE]), rec(5)]);
  assert.deepEqual(pp.species.map((s) => s.serial), [7, 8]);
  assert.equal(pp.load({ card: 's7', serial: 7, words: [], name: 'S7' }, 4), true);
  assert.equal(pp.species.length, 2);
  assert.equal(pp.cells(pp.species[0]), 7);
  pp.load({ card: 'c1', serial: 7, words: [], name: 'From afar', stranger: true }, 2);
  assert.equal(pp.species.length, 3, 'a stranger by its card');
  pp.move(pp.species[2], 0);
  assert.equal(pp.tip.card, 'c1');
});

test('cells leave a few at a time, the last body in first, and a species with none left leaves the strip', () => {
  const pp = createPipette();
  pp.add(sp(7), [rec(1)]);
  pp.add(sp(7), [rec(2, [3, NONE]), rec(3, [4, NONE]), rec(4)]);
  let [n] = pp.next(pp.tip, 2);
  assert.deepEqual([n.from, n.n, n.org.cells.length], [0, 2, 3]);
  pp.left(n, 2, [100, 101]);
  assert.equal(pp.count, 2);
  const both = pp.next(pp.tip, 5);
  assert.deepEqual(both.map((x) => [x.from, x.n]), [[2, 1], [0, 1]], 'a batch runs on from one body to the next');
  [n] = both;
  pp.left(n, 1, [102]);
  pp.left(pp.next()[0], 1, [103]);
  assert.equal(pp.species.length, 0);
});

test('a set-down keeps its bonds: to cells leaving with it, to cells out before by ID, and theirs to it', () => {
  const pp = createPipette();
  // 1 keeps 2, 3 keeps 2: leaving order 1, 2, 3
  pp.add(sp(7), [rec(1, [2, NONE]), rec(2), rec(3, [2, NONE])]);
  const org = pp.tip.orgs[0];
  const first = setDownJob(pp.next(pp.tip, 1)[0], at, () => []);
  assert.deepEqual(first.bonds, [], 'its partner not out yet');
  pp.left(pp.next(pp.tip, 1)[0], 1, [500]);
  const second = setDownJob(pp.next(pp.tip, 2)[0], at, () => []);
  assert.deepEqual(second.earlier, [500]);
  assert.deepEqual(second.bonds.sort(), [[1, 0, 0], [PIPE_EARLIER, 0, 0]].sort(), 'the one out before keeps it again, and the third keeps it');
  assert.equal(second.cells[0].info, org.cells[1][3]);
});

test('the limit: a card’s colony that does not fit is refused; newborns leave as made', () => {
  const pp = createPipette(undefined, 10);
  pp.add(sp(7), Array.from({ length: 6 }, (_, i) => rec(i + 1)));
  assert.equal(pp.fits(4), true);
  assert.equal(pp.fits(5), false);
  assert.equal(pp.load({ card: 'c1', serial: 99, words: [], name: 'Card', stranger: true }, 4), true);
  assert.equal(pp.load({ card: 'c1', serial: 99, words: [], name: 'Card', stranger: true }, 1), false);
  const [n] = pp.next(pp.species[1], 3);
  assert.equal(n.made, 3);
  const job = setDownJob(n, at, () => [0.5, 1, 2]);
  assert.equal(job.cells.length, 3);
  assert.equal(job.cells[0].energy, 0.5);
  assert.equal(job.species[0].stranger, true);
  pp.left(n, 3);
  assert.equal(pp.species[1].made, 1);
});

test('jobs merged into one set-down: their cells in turn, each one’s bonds and earlier cells shifted to match', () => {
  const a = { species: [{}], cells: [{}, {}], earlier: [9], bonds: [[1, 0, 0], [PIPE_EARLIER, 1, 1]] };
  const b = { species: [{}], cells: [{}], earlier: [8], bonds: [[0, PIPE_EARLIER, 0]] };
  const { job, used } = mergeJobs([a, b]);
  assert.equal(used, 2);
  assert.equal(job.cells.length, 3);
  assert.deepEqual(job.earlier, [9, 8]);
  assert.deepEqual(job.bonds, [[1, 0, 0], [PIPE_EARLIER, 1, 1], [2, PIPE_EARLIER + 1, 0]]);
});
