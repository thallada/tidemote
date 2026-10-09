import test from 'node:test';
import assert from 'node:assert/strict';
import { facets, describe, tagsOf } from '../src/facets.js';
const K = { adhMin: 0.3, affScale: 1 };
const genome = (extra = {}) => ({
  photo: 0, dGlint: 1, dHusk: 0, dFlesh: 0, swim: 0, advect: 1,
  adhesion: 0, align: 0, lifespan: 100, mutRate: 0.01,
  dev: [[1, 0, 0], [1, 0, 0], [1, 0, 0]],
  roles: Array.from({ length: 3 }, () => ({ rec: Array(8).fill(0), surf: Array(8).fill(0) })),
  ...extra,
});

test('facets classify a producer, swimmer predator and drifter', () => {
  assert.deepEqual(facets(genome({ photo: 1, advect: 0 }), K), {
    diet: 'photosynth', mobility: 'anchored', body: 'single-cell', types: 1, schooling: false,
  });
  const hunter = genome({ dGlint: 0, dFlesh: 1, swim: 1, align: 0.6, adhesion: 0.5,
    dev: Array.from({ length: 3 }, () => [1, 1, 1]) });
  assert.deepEqual(facets(hunter, K), {
    diet: 'predator', mobility: 'swimmer', body: 'multicellular', types: 3, schooling: true,
  });
  assert.equal(describe(hunter, K), 'predator · multicellular, 3 cell types · schooling swimmer');
  assert.deepEqual(tagsOf(hunter, K), [
    ['predator', 'predator'], ['multicellular', 'adhesion'], ['3 cell types', 'bodyplan'],
    ['loose body', 'looseknit'], ['swimmer', 'swimming'], ['schooling', 'schooling'],
  ]);
  assert.deepEqual(facets(genome(), K), {
    diet: 'grazer', mobility: 'drifter', body: 'single-cell', types: 1, schooling: false,
  });
});

test('classification preserves strict thresholds and uses supplied K', () => {
  const g = genome({ photo: 0.55, dGlint: 0.55, dHusk: 0.45, advect: 0.2, adhesion: 0.3 });
  assert.equal(facets(g, K).diet, 'omnivore');
  assert.equal(facets(g, K).mobility, 'crawler');
  assert.equal(facets(g, K).body, 'single-cell');
  assert.equal(facets(g, { ...K, adhMin: 0.2 }).body, 'multicellular');
  assert.equal(facets(genome({ swim: 0.8, advect: 0.7 }), K).mobility, 'swimmer');
  assert.equal(facets(genome({ swim: 0.4 }), K).mobility, 'crawler');
  assert.equal(facets(genome({ photo: 0.6, swim: 1 }), K).mobility, 'crawler');
  const social = genome({ roles: Array.from({ length: 3 }, () => ({ rec: Array(8).fill(1), surf: Array(8).fill(1) })) });
  assert.ok(tagsOf(social, K).some(([tag]) => tag === 'swarming'));
  assert.ok(tagsOf(social, { ...K, affScale: -1 }).some(([tag]) => tag === 'solitary'));
  assert.deepEqual(tagsOf(genome({ photo: 0.4, mutRate: 0.05 }), K).map(([tag]) => tag),
    ['grazer', 'single-cell', 'loose-knit', 'drifter', 'part photosynth', 'fast-mutating']);
});
