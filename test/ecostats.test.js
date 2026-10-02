import test from 'node:test';
import assert from 'node:assert/strict';
import {
  communitySample, summarizeRun, summarizeEnsemble, compareEnsembles, checkTargets, wilson, spread, quantile,
} from '../src/ecostats.js';

const genome = (serial, o = {}) => ({ serial, depth: 0, photo: 0, dGlint: 1, dHusk: 0, dFlesh: 0, swim: 1, advect: 0.5,
  adhesion: 0, size: 1, lifespan: 100, reproE: 1, ...o });
const plant = (serial) => genome(serial, { photo: 0.9, swim: 0, advect: 0.05 });

test('Hill numbers of an even and an uneven community', () => {
  const even = communitySample([1, 2, 3, 4].map((s) => ({ pop: 25, genome: genome(s) })), 0.15);
  assert.ok(Math.abs(even.effSpecies - 4) < 1e-9);
  assert.ok(Math.abs(even.hill2 - 4) < 1e-9);
  assert.equal(even.maxShare, 0.25);
  const uneven = communitySample([{ pop: 97, genome: genome(1) }, { pop: 1, genome: genome(2) },
    { pop: 1, genome: genome(3) }, { pop: 1, genome: plant(4) }], 0.15);
  assert.ok(uneven.effSpecies < 1.3 && uneven.hill2 < uneven.effSpecies);
  assert.equal(uneven.top.length, 1);
  assert.ok(Math.abs(uneven.diet.producer - 0.01) < 1e-9);
});

function series(fn, minutes = 10) {
  const out = [];
  for (let t = 5; t <= minutes * 60; t += 5) out.push({ t, ...fn(t) });
  return out;
}
const world = (species) => communitySample(species.map(([serial, pop, g]) => ({ pop, genome: g ?? genome(serial) })), 0.15);

test('summarizeRun: a stable three-guild world', () => {
  const samples = series(() => world([[1, 300, plant(1)], [2, 200], [3, 150, genome(3, { dFlesh: 1, dGlint: 0 })]]));
  const r = summarizeRun(samples, { count: 2000 });
  assert.equal(r.persisted, true);
  assert.equal(r.lateGuilds, 3);
  assert.equal(r.foodWeb, true);
  assert.equal(r.monoculture, false);
  assert.equal(r.leaderChanges, 0);
  assert.equal(r.outcome, 'producer+grazer+predator');
  assert.ok(Math.abs(r.lateLivingFrac - 0.325) < 1e-9);
  assert.equal(r.lateLivingCV, 0);
});

test('summarizeRun: collapse, monoculture, leader changes and lost guilds', () => {
  const collapse = series((t) => world(t < 300 ? [[1, 500, plant(1)], [2, 500]] : [[2, 10]]));
  const c = summarizeRun(collapse, { count: 2000 });
  assert.equal(c.persisted, false);
  assert.equal(c.outcome, 'collapsed');
  assert.equal(c.guildsLost, 1);
  // The leader alternates every minute; one-sample blips do not count.
  const swap = series((t) => world(Math.floor(t / 60) % 2 || t === 125 ? [[1, 900], [2, 100]] : [[1, 100], [2, 900]]));
  const s = summarizeRun(swap, { count: 2000 });
  assert.equal(s.monoculture, true);
  assert.ok(s.outcome.startsWith('mono:'));
  assert.equal(s.leaderChanges, 8);
  assert.equal(summarizeRun(series(() => world([[1, 5]]), 0.5), { count: 10 }), null);
});

test('wilson interval, quantile and spread', () => {
  const [lo, hi] = wilson(8, 10);
  assert.ok(lo > 0.44 && lo < 0.5 && hi > 0.94 && hi < 0.97);
  assert.deepEqual(wilson(0, 0), [0, 1]);
  assert.equal(quantile([3, 1, 2], 0.5), 2);
  assert.equal(spread([[0, 0], [3, 4]]), 5);
  assert.equal(spread([[1, 1], [1, 1], [1, 1]]), 0);
});

function fakeRuns(n, seed, f) {
  let s = seed;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, () => f(r));
}
const healthy = (r) => ({ persisted: r() < 0.95, foodWeb: r() < 0.8, producersPersist: true, monoculture: r() < 0.1,
  lateGuilds: 3 + (r() < 0.5), lateEffSpecies: 15 + r() * 6, lateHill2: 10, lateLivingFrac: 0.3, notableSpecies: 12,
  leaderChanges: 3, guildsLost: 0, lateLivingCV: 0.1, outcome: ['a', 'b', 'c', 'd'][Math.floor(r() * 4)],
  fingerprint: [r(), r(), r()] });

test('compareEnsembles: equivalent ensembles do not regress, a broken one does', () => {
  const base = fakeRuns(24, 1, healthy);
  const same = compareEnsembles(base, fakeRuns(24, 2, healthy), { iters: 1000 });
  assert.ok(same.every((row) => row.verdict !== 'regressed'), JSON.stringify(same.filter((row) => row.verdict === 'regressed')));
  const broken = fakeRuns(24, 3, (r) => ({ ...healthy(r), foodWeb: r() < 0.2, monoculture: r() < 0.7,
    lateEffSpecies: 4 + r() * 2, lateGuilds: 1 + (r() < 0.3), outcome: 'mono:grazer', fingerprint: [0.5, 0.5, 0.5 + r() * 0.05] }));
  const rows = compareEnsembles(base, broken, { iters: 1000 });
  const regressed = rows.filter((row) => row.verdict === 'regressed').map((row) => row.key);
  for (const key of ['foodWeb', 'notMonoculture', 'lateEffSpecies', 'lateGuilds', 'spread', 'modalOutcome']) assert.ok(regressed.includes(key), key);
  assert.ok(!regressed.includes('lateHill2'), 'ungated metrics never regress');
});

test('summarizeEnsemble and checkTargets', () => {
  const s = summarizeEnsemble(fakeRuns(20, 4, healthy));
  assert.equal(s.runs, 20);
  assert.ok(s.metrics.persisted.rate > 0.5 && s.metrics.persisted.ci[1] <= 1);
  assert.ok(s.metrics.lateEffSpecies.mean > 15);
  assert.ok(s.group.outcomes > 2 && s.group.modalOutcome < 0.6);
  const rows = checkTargets(s, { persisted: { min: 0.5 }, modalOutcome: { max: 0.1 }, lateGuilds: { min: 3 } });
  assert.deepEqual(rows.map((r) => r.ok), [true, false, true]);
});
