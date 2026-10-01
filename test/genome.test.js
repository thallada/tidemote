import test from 'node:test';
import assert from 'node:assert/strict';
import { dietGuild, mobilityGuild } from '../src/genome.js';

test('dietGuild preserves guild order and strict diet thresholds', () => {
  const base = { photo: 0, dGlint: 0.4, dHusk: 0.3, dFlesh: 0.3 };
  for (const [traits, expected] of [
    [{ photo: 0.56, dFlesh: 1 }, 'producer'],
    [{ photo: 0.55, dGlint: 0.6, dHusk: 0.2, dFlesh: 0.2 }, 'grazer'],
    [{ dGlint: 0.2, dHusk: 0.2, dFlesh: 0.6 }, 'predator'],
    [{ dGlint: 0.2, dHusk: 0.6, dFlesh: 0.2 }, 'scavenger'],
    [{}, 'omnivore'],
    [{ dGlint: 0.55, dHusk: 0.25, dFlesh: 0.2 }, 'omnivore'],
    [{ dGlint: 0.25, dHusk: 0.55, dFlesh: 0.2 }, 'omnivore'],
    [{ dGlint: 0.25, dHusk: 0.2, dFlesh: 0.55 }, 'omnivore'],
  ]) assert.equal(dietGuild({ ...base, ...traits }), expected);
});

test('mobilityGuild preserves effective swim and boundary comparisons', () => {
  for (const [advect, swim, photo, expected] of [
    [0.19, 0.19, 0, 'sessile'],
    [0.2, 0.19, 0, 'crawler'],
    [0.19, 0.2, 0, 'crawler'],
    [0.1, 0.8, 0, 'swimmer'],
    [0.71, 0.39, 0, 'drifter'],
    [0.7, 0.39, 0, 'crawler'],
    [0.71, 0.4, 0, 'crawler'],
    [0.1, 1, 0.9, 'sessile'],
    [0.8, 1, 0.7, 'drifter'],
    [0.5, 1, 0.5, 'crawler'],
    [0.5, 1.6, 0.5, 'swimmer'],
  ]) assert.equal(mobilityGuild({ advect, swim, photo }), expected);
});
