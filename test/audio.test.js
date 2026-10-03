import test from 'node:test';
import assert from 'node:assert/strict';
import { archetypeGenome, ARCHETYPE_TYPES, finalizeGenome } from '../src/genome.js';
import { voiceOf, archOf, walk, ARCH } from '../src/audio/mapping.js';
import { closeness, mixFromCensus } from '../src/audio/sound.js';
import { Engine } from '../src/audio/voices.js';
import { Conductor } from '../src/audio/conductor.js';

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

test('every archetype genome maps to a playable voice', () => {
  const r = rng(7);
  for (const type of ARCHETYPE_TYPES) {
    for (let i = 0; i < 20; i++) {
      const g = finalizeGenome(archetypeGenome(type, r));
      const v = voiceOf(g);
      assert.ok(ARCH[v.arch], `${type} -> ${v.arch}`);
      assert.equal(v.arch, archOf(g));
      assert.ok(v.seq.length >= 3 && v.seq.every(Number.isInteger));
      assert.ok(v.rate > 0 && Math.abs(v.pan) <= 0.85);
    }
  }
});

test('melodic walk stays in range and is a pure function of the signature', () => {
  const surf = [1, -1, 0.5, 0.95, -0.95, 0, 0.2, -0.3];
  const a = walk(surf, [0.1, 0, 0], 12);
  assert.deepEqual(a, walk(surf, [0.1, 0, 0], 12));
  assert.ok(a.every((d) => d >= -3 && d <= 10));
});

test('closeness follows zoom on a log scale', () => {
  assert.equal(closeness(100, 100), 0);
  assert.equal(closeness(1, 256), 1);
  assert.ok(Math.abs(closeness(1, 16) - 0.5) < 1e-9);
  assert.equal(closeness(1e-6, 1), 1);
});

test('zooming in makes on-screen species near and the rest distant', () => {
  const MAXK = 8, pop = new Uint32Array(MAXK), n = new Uint32Array(MAXK), sx = new Uint32Array(MAXK), sy = new Uint32Array(MAXK);
  pop[3] = 900; pop[4] = 100; n[4] = 50; sx[4] = 50 * 200; sy[4] = 50 * 128;
  const view = { n, sx, sy };
  const far = mixFromCensus({ slots: [3, 4], pop, living: 1000, view, z: 0 });
  const near = mixFromCensus({ slots: [3, 4], pop, living: 1000, view, z: 1 });
  const by = (arr, s) => arr.find((m) => m.slot === s);
  assert.ok(by(far, 3).p > by(far, 4).p, 'zoomed out: the abundant species dominates');
  assert.ok(by(near, 4).p > by(near, 3).p, 'zoomed in: only what is on screen is present');
  assert.ok(by(near, 4).q > by(near, 3).q);
  assert.ok(by(near, 4).x > 0, 'on-screen position pans right');
  const sel = mixFromCensus({ slots: [3, 4], pop, living: 1000, view, z: 1, selSlot: 3 });
  assert.equal(by(sel, 3).q, 1, 'a selected species is always near');
});

test('engine and conductor render finite, bounded audio', () => {
  const sr = 48000, eng = new Engine(sr, { seed: 3 }), cond = new Conductor(eng, { seed: 3 });
  const r = rng(11), species = [];
  ARCHETYPE_TYPES.slice(0, 6).forEach((type, i) => {
    const g = finalizeGenome(archetypeGenome(type, r));
    species.push({ id: 100 + i, voice: voiceOf(g), p: 0.15, q: i % 2 ? 1 : 0.3, x: 0, inView: true, sel: i === 0 });
  });
  cond.message({ type: 'world', world: { glint: 0.3, husk: 0.2, light: 0.7, tide: 0.5, season: 0.6, zoom: 0.5, selected: 1, level: 1 }, species });
  const L = new Float32Array(64), R = new Float32Array(64);
  let peak = 0, energy = 0;
  const blocks = Math.ceil((sr * 12) / 64);
  for (let b = 0; b < blocks; b++) {
    if (b === 3000) cond.message({ type: 'spark', pan: 0.2, near: 1 });
    cond.render(L, R);
    for (let i = 0; i < 64; i++) {
      assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]));
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      energy += L[i] * L[i] + R[i] * R[i];
    }
  }
  assert.ok(peak <= 0.97 + 1e-6, `peak ${peak}`);
  assert.ok(energy / (blocks * 128) > 1e-6, 'it makes sound');
});
