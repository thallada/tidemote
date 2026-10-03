import test from 'node:test';
import assert from 'node:assert/strict';
import { archetypeGenome, ARCHETYPE_TYPES, finalizeGenome } from '../src/genome.js';
import { voiceOf, archOf, walk, ARCH } from '../src/audio/mapping.js';
import { Engine } from '../src/audio/voices.js';
import { Conductor } from '../src/audio/conductor.js';
import { LISTEN, decodeRecords, keepFor, hearing, D_REF, digest } from '../src/audio/listen.js';
import { LISTEN_TYPES } from '../src/shaders.js';
import { tempoFor } from '../src/audio/field.js';

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
      assert.ok(v.rate > 0);
    }
  }
});

test('melodic walk stays in range and is a pure function of the signature', () => {
  const surf = [1, -1, 0.5, 0.95, -0.95, 0, 0.2, -0.3];
  const a = walk(surf, [0.1, 0, 0], 12);
  assert.deepEqual(a, walk(surf, [0.1, 0, 0], 12));
  assert.ok(a.every((d) => d >= -3 && d <= 10));
});

test('listening event types match the GPU scan', () => {
  assert.deepEqual(LISTEN.types, LISTEN_TYPES);
  LISTEN.types.forEach((t, i) => assert.equal(LISTEN.index[t], i));
});

test('scan records decode to type, slot, position, age, speed, hue', () => {
  const u = new Uint32Array(8), f = new Float32Array(u.buffer);
  u[0] = 5 | (37 << 4) | (2 << 14) | (200 << 16) | (128 << 24); u[1] = 0xffff | (0x8000 << 16); f[2] = 0.05; u[3] = 0xff0000ff; // red
  u[4] = 0 | (1023 << 4); u[5] = 0; f[6] = 0; u[7] = 0xff00ff00; // green
  const { ev, recorded } = decodeRecords(u, f);
  assert.equal(ev[0], 5); assert.equal(ev[1], 37); assert.ok(Math.abs(ev[2] - 1) < 1e-6); assert.ok(Math.abs(ev[3] - 0.5) < 1e-3);
  assert.ok(Math.abs(ev[4] - 0.05) < 1e-7); assert.ok(Math.abs(ev[5] - 128 / 255) < 1e-6); assert.equal(ev[6], 0); assert.equal(ev[7], 200);
  assert.equal(ev[9], 1023); assert.ok(Math.abs(ev[14] - 1 / 3) < 1e-6);
  assert.equal(recorded[5], 1); assert.equal(recorded[0], 1);
});

test('the scan keeps a fair sample sized to what the audio plays', () => {
  const k = keepFor([1000, 2, 0, 0, 0, 0, 0, 0], 0.1);
  assert.ok(Math.abs(k[0] - (LISTEN.target[0] * 0.1) / 1000) < 1e-12);
  assert.equal(k[1], 1); assert.equal(k[2], 1);
});

test('hearing: nearer views are louder per event and closer in timbre', () => {
  const near = hearing(D_REF / 2, D_REF / 2), far = hearing(10, 6);
  assert.ok(Math.abs(near.gd - 1) < 1e-9 && near.z === 1);
  assert.ok(far.gd < 0.12 && far.z < 0.3);
  // equal power for equal density: per-event power x events in view is constant
  const a = hearing(1, 1), b = hearing(4, 4);
  assert.ok(Math.abs(a.gd ** 2 * 4 - b.gd ** 2 * 64) < 1e-9);
});

test('the music follows the simulation speed', () => {
  assert.equal(tempoFor(1), 1); assert.equal(tempoFor(0.5), 0.5); assert.equal(tempoFor(0.1), 0.25);
  assert.ok(tempoFor(2) > 1 && tempoFor(8) > tempoFor(2) && tempoFor(1e6) === 4);
  assert.equal(tempoFor(0), 1);
});

test('scanned events become notes', () => {
  const sr = 48000, eng = new Engine(sr, { seed: 5 }), cond = new Conductor(eng, { seed: 5 });
  const r = rng(3), g = finalizeGenome(archetypeGenome(ARCHETYPE_TYPES[0], r));
  cond.message({ type: 'slots', all: true, slots: [{ slot: 7, serial: 70, voice: voiceOf(g), pop: 50 }] });
  const u = new Uint32Array(4 * 6), f = new Float32Array(u.buffer);
  for (let i = 0; i < 6; i++) { u[i * 4] = [0, 0, 5, 6, 7, 3][i] | (7 << 4) | (i << 16); u[i * 4 + 1] = (i * 10000) | (30000 << 16); f[i * 4 + 2] = 0.02 * i; u[i * 4 + 3] = 0xff3080ff; }
  const data = { records: u, f32: f, window: 0.1, view: { hx: 0.6, hy: 0.6 }, inView: [2, 0, 0, 1, 0, 1, 1, 1], outView: [40, 0, 0, 0, 0, 5, 30, 20], living: 12, speed: 0.2 };
  const L = new Float32Array(64), R = new Float32Array(64);
  let spawned = 0;
  const orig = eng.spawn.bind(eng); eng.spawn = (d, p, id) => { if (id == null) spawned++; return orig(d, p, id); };
  cond.message(digest(data, { speed: 1 }).msg);
  let peak = 0;
  for (let b = 0; b < 750 * 2; b++) { cond.render(L, R); for (let i = 0; i < 64; i++) { assert.ok(Number.isFinite(L[i])); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); } }
  assert.ok(spawned >= 6, `spawned ${spawned}`);
  assert.ok(peak > 1e-4 && peak <= 0.97 + 1e-6);
});

test('mixotrophs that do not swim play as producers', () => {
  const r = rng(9);
  const g = finalizeGenome(archetypeGenome(ARCHETYPE_TYPES[0], r));
  Object.assign(g, { photo: 0.48, dGlint: 0.5, dHusk: 0.1, dFlesh: 0.1, swim: 0.05, advect: 0.3, adhesion: 0 });
  assert.equal(archOf(g), 'plankton');
  Object.assign(g, { swim: 1.6, advect: 0.1 });
  assert.notEqual(archOf(g), 'plankton');
});
