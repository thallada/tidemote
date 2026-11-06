import test from 'node:test';
import assert from 'node:assert/strict';
import { createTakes, stockOf, similarity, OTHER } from '../src/takes.js';

const sp = (serial, pop, parent = 0, ancestor = null) => ({ serial, pop, parent, ancestor, alive: pop > 0, name: `S${serial}`, genome: { col: serial } });
const regOf = (...xs) => new Map(xs.map((s) => [s.serial, s]));

test('a species is counted under the stock it descends from, through parents and ancestors', () => {
  const stock = new Map([[1, {}], [2, {}]]);
  const reg = regOf(sp(1, 10), sp(2, 5), sp(3, 4, 1), sp(4, 4, 99, 3), sp(5, 4, 77));
  assert.equal(stockOf(reg.get(3), reg, stock), 1);
  // its parent pruned from the registry: through its established ancestor
  assert.equal(stockOf(reg.get(4), reg, stock), 1);
  // no line back to the mark (a spark of life, or a lost line)
  assert.equal(stockOf(reg.get(5), reg, stock), OTHER);
});

test('similarity is 1 for the same shares and 0 for disjoint ones', () => {
  assert.equal(similarity({ living: 10, stocks: { 1: 5, 2: 5 } }, { living: 20, stocks: { 1: 10, 2: 10 } }), 1);
  assert.equal(similarity({ living: 10, stocks: { 1: 10 } }, { living: 10, stocks: { 2: 10 } }), 0);
  assert.ok(Math.abs(similarity({ living: 10, stocks: { 1: 10 } }, { living: 10, stocks: { 1: 5, 2: 5 } }) - 0.5) < 1e-9);
});

test('takes: a mark, a first take, a replay that goes another way', () => {
  const T = createTakes();
  let reg = regOf(sp(1, 50), sp(2, 50));
  T.mark(100, reg, new Uint8Array(4));
  // take 1: stock 1 takes over through a daughter
  reg = regOf(sp(1, 20), sp(2, 10), sp(3, 70, 1));
  T.observe(160, reg, [{ t: 150, type: 'story', html: 'x', text: 'x' }, { t: 50, type: 'era', html: 'old', text: 'old' }]);
  const one = T.current();
  assert.equal(one.n, 1);
  assert.deepEqual(one.samples.at(-1).stocks, { 1: 90, 2: 10 });
  assert.deepEqual(one.stories.map((s) => s.t), [150], 'only what was told since the mark');
  assert.equal(T.leader(one).serial, 1);
  // take 2, from the same moment: stock 2 wins this time (its new species' serial collides with take 1's, which is fine)
  assert.equal(T.replay(), 2);
  reg = regOf(sp(1, 5), sp(2, 15), sp(3, 80, 2));
  T.observe(160, reg);
  const two = T.current();
  assert.deepEqual(two.samples.at(-1).stocks, { 1: 5, 2: 95 });
  const a = T.alike(one, two);
  assert.equal(a[0][1], 1, 'both start at the mark');
  assert.ok(a.at(-1)[1] < 0.2, 'and come out differently');
  const shown = T.stocks(5);
  assert.deepEqual(shown.map((s) => s.serial).sort(), [1, 2]);
  const r = T.river(two, shown);
  assert.equal(r.length, 2);
  assert.ok(Math.abs(r.at(-1).shares.reduce((x, y) => x + y, 0) - 1) < 1e-9);
});

test('small stocks fold into other', () => {
  const T = createTakes();
  T.mark(0, regOf(sp(1, 999), sp(2, 1)), null);
  assert.deepEqual(T.current().samples[0].stocks, { [OTHER]: 1, 1: 999 });
});
