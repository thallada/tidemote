import test from 'node:test';
import assert from 'node:assert/strict';
import { archetypeGenome, genomeSerial, readGenome, writeGenome, dietGuild, mobilityGuild, ARCHETYPE_TYPES, cellShape } from '../src/genome.js';
import { G_WORDS } from '../src/shaders.js';

test('genomeSerial reads the unsigned serial of a slot and its replacement', () => {
  const u32 = new Uint32Array(3 * G_WORDS), f32 = new Float32Array(u32.buffer);
  const g = archetypeGenome('reef', () => 0.5);
  for (const [slot, serial] of [[1, 7], [2, 0xffffffff], [1, 8]]) {
    writeGenome(u32, f32, slot, { ...g, serial });
    assert.equal(genomeSerial(u32, slot), serial);
    assert.equal(genomeSerial(u32, slot), readGenome(u32, f32, slot).serial);
  }
  assert.equal(genomeSerial(u32, 0), 0);
  assert.equal(genomeSerial(u32, 2), 0xffffffff);
});

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

// Widening the cosmetic draw must leave each archetype's ecological RNG stream intact.
test('twelve cosmetic shapes keep the archetype random-draw count', () => {
  for (const type of ARCHETYPE_TYPES) for (const [r, shape] of [[0, 0], [0.5, 6], [1 - Number.EPSILON, 11]]) {
    let draws = 0;
    const g = archetypeGenome(type, () => { draws++; return r; });
    assert.equal(g.shape, shape);
    // + 4 for the thermal optimum and tolerance; heat-maker founders draw one (two when chosen)
    const thermo = ['crawler', 'grazer', 'filament'].includes(type) ? (r < 0.25 ? 2 : 1) : 0;
    assert.equal(draws, (type === 'grazer' ? 77 : type === 'filament' ? 78 : 76) + 4 + thermo);
    const before = JSON.stringify(g);
    for (let role = 0; role < 3; role++) assert.ok(cellShape(g, role) >= 0 && cellShape(g, role) < 12);
    assert.equal(JSON.stringify(g), before, 'cosmetic selection leaves the genome unchanged');
  }
});

test('thermal performance peaks at the optimum, higher for specialists, steeper on the warm side', async () => {
  const { thermalPerf, thermalGuild } = await import('../src/genome.js');
  const { DEFAULT_K } = await import('../src/shaders.js');
  const narrow = { topt: 20, tol: 2 }, broad = { topt: 20, tol: 15 };
  assert.ok(Math.abs(thermalPerf(narrow, 20).perf - (1 + DEFAULT_K.specBonus)) < 1e-9);
  assert.ok(Math.abs(thermalPerf(broad, 20).perf - 1) < 1e-9);
  const g = { topt: 20, tol: 5 };
  assert.ok(thermalPerf(g, 24).perf < thermalPerf(g, 16).perf, 'heat hurts more than cold');
  assert.equal(thermalPerf(g, 12).torpid, true);
  assert.equal(thermalPerf(g, 12).perf, 0);
  assert.equal(thermalPerf(g, 14).torpid, false);
  assert.deepEqual(thermalGuild({ topt: 40, tol: 3, thermo: 0.5 }), { pref: 'thermophile', breadth: 'specialist', maker: true });
});
