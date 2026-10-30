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

test('runs from the tip, the last in first: a species again after another is a run of its own', () => {
  const pp = createPipette();
  pp.add(sp(7), [rec(1)]);
  pp.add(sp(7), [rec(2)]);
  pp.add(sp(8), [rec(3), rec(4)]);
  pp.add(sp(7), [rec(5, [6, NONE]), rec(6)]);
  assert.deepEqual(pp.species.map((s) => [s.serial, pp.cells(s)]), [[7, 2], [8, 2], [7, 2]], 'A ×2 (the last in), B ×2, A ×2');
  assert.equal(pp.tip, pp.species[0]);
  assert.equal(pp.next()[0].org.cells.length, 2, 'the last body in leaves first');
  assert.equal(pp.mixed, true);
  assert.equal(new Set(pp.species.map((s) => s.id)).size, 3, 'each run its own id');
  assert.equal(pp.load({ card: 'c1', serial: 7, words: [], name: 'From afar', stranger: true }, 4), true);
  assert.equal(pp.species.length, 4, 'a stranger by its card');
  assert.equal(pp.tip.card, 'c1');
  // moved next to its own species, a run joins it, the cells of the one now nearer the tip leaving first
  pp.move(pp.species[3], 1);
  assert.deepEqual(pp.species.map((s) => [s.serial, pp.cells(s)]), [[7, 4], [7, 4], [8, 2]], 'the card, then A ×4, then B');
  assert.deepEqual(pp.next(pp.species[1], 4).map((x) => x.org.cells.length), [1, 1, 2], 'the run moved nearer the tip leaves first');
});

test('sorting: every species as one run, where the one nearest the tip was; a run emptied lets its neighbors join', () => {
  const pp = createPipette();
  for (const [s, id] of [[7, 1], [8, 2], [7, 3], [9, 4], [8, 5]]) pp.add(sp(s), [rec(id)]);
  pp.sort();
  assert.deepEqual(pp.species.map((s) => [s.serial, pp.cells(s)]), [[8, 2], [9, 1], [7, 2]]);
  assert.equal(pp.mixed, false);
  const q = createPipette();
  for (const [s, id] of [[7, 1], [8, 2], [7, 3]]) q.add(sp(s), [rec(id)]);
  q.left(q.next(q.species[1], 1)[0], 1, [100]);
  assert.deepEqual(q.species.map((s) => [s.serial, q.cells(s)]), [[7, 2]]);
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
  const [n] = pp.next(pp.tip, 3);
  assert.equal(n.made, 3);
  const job = setDownJob(n, at, () => [0.5, 1, 2]);
  assert.equal(job.cells.length, 3);
  assert.equal(job.cells[0].energy, 0.5);
  assert.equal(job.species.stranger, true);
  pp.left(n, 3);
  assert.equal(pp.tip.made, 1);
});

test('jobs merged into one set-down: their cells in turn, each one’s bonds and earlier cells shifted to match', () => {
  const a = { species: {}, cells: [{}, {}], earlier: [9], bonds: [[1, 0, 0], [PIPE_EARLIER, 1, 1]] };
  const b = { species: {}, cells: [{}], earlier: [8], bonds: [[0, PIPE_EARLIER, 0]] };
  const { job, used } = mergeJobs([a, b]);
  assert.equal(used, 2);
  assert.equal(job.cells.length, 3);
  assert.deepEqual(job.earlier, [9, 8]);
  assert.deepEqual(job.bonds, [[1, 0, 0], [PIPE_EARLIER, 1, 1], [2, PIPE_EARLIER + 1, 0]]);
});

test('one set-down across runs: each run its species, its cells told which, so short runs flow as one', () => {
  const A = { words: [1] }, B = { words: [2] };
  const a = { species: { words: [1] }, of: A, cells: [{ sp: 0 }], earlier: [], bonds: [] };
  const b = { species: { words: [2] }, of: B, cells: [{ sp: 0 }, { sp: 0 }], earlier: [], bonds: [] };
  const a2 = { species: { words: [1] }, of: A, cells: [{ sp: 0 }], earlier: [], bonds: [] };
  const { job, used } = mergeJobs([a, b, a2]);
  assert.equal(used, 3);
  assert.deepEqual(job.of, [A, B]);
  assert.deepEqual(job.cells.map((c) => c.sp), [0, 1, 1, 0]);
});
