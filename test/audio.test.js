import test from 'node:test';
import assert from 'node:assert/strict';
import { archetypeGenome, ARCHETYPE_TYPES, finalizeGenome } from '../src/genome.js';
import { voiceOf, archOf, ARCH } from '../src/audio/mapping.js';
import { Engine } from '../src/audio/voices.js';
import { Conductor } from '../src/audio/conductor.js';
import { LISTEN, LISTEN_REC as REC, decodeRecords, recordCells, keepFor, hearing, D_REF, digest } from '../src/audio/listen.js';
import { LISTEN_TYPES, LISTEN_REC } from '../src/shaders.js';
import { d2m } from '../src/audio/conductor.js';
import { tempoFor } from '../src/audio/field.js';
import { palette, LAYERS } from '../src/audio/score.js';

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

test('every archetype genome maps to a playable voice', () => {
  const r = rng(7);
  for (const type of ARCHETYPE_TYPES) {
    for (let i = 0; i < 20; i++) {
      const g = finalizeGenome(archetypeGenome(type, r));
      const v = voiceOf(g);
      assert.ok(ARCH[v.arch], `${type} -> ${v.arch}`);
      assert.equal(v.arch, archOf(g));
      assert.ok(v.seq.length >= 2 && v.seq.every(Number.isFinite));
      assert.ok(v.rate > 0 && v.motif.cycle > 0);
    }
  }
});

test('degrees carry SuperCollider accidentals', () => {
  const ion = [0, 2, 4, 5, 7, 9, 11];
  assert.equal(d2m(2, 60, ion), 64);
  assert.equal(d2m(2.1, 60, ion), 65); // the third raised a semitone
  assert.equal(d2m(1.9, 60, ion), 63); // the third lowered one
  assert.equal(d2m(-1, 60, ion), 59);
  assert.equal(d2m(9, 60, ion), 76);
});

test('listening event types match the GPU scan', () => {
  assert.deepEqual(LISTEN.types, LISTEN_TYPES);
  assert.equal(REC, LISTEN_REC);
  LISTEN.types.forEach((t, i) => assert.equal(LISTEN.index[t], i));
});

test('scan records decode to type, slot, position, age, speed, hue, cell type', () => {
  const u = new Uint32Array(2 * REC), f = new Float32Array(u.buffer);
  u[0] = 5 | (37 << 4) | (2 << 14) | (200 << 16) | (128 << 24); u[1] = 0xffff | (0x8000 << 16); f[2] = 0.05; u[3] = 0xff0000ff; // red
  u[4] = 0x3c00 | (0xbc00 << 16); u[5] = 4242; // velocity (1, -1) as halves, particle id 4242
  u[REC] = 0 | (1023 << 4); u[REC + 1] = 0; f[REC + 2] = 0; u[REC + 3] = 0xff00ff00; // green
  const { ev, recorded } = decodeRecords(u, f);
  const S = LISTEN.stride;
  assert.equal(ev[0], 5); assert.equal(ev[1], 37); assert.ok(Math.abs(ev[2] - 1) < 1e-6); assert.ok(Math.abs(ev[3] - 0.5) < 1e-3);
  assert.ok(Math.abs(ev[4] - 0.05) < 1e-7); assert.ok(Math.abs(ev[5] - 128 / 255) < 1e-6); assert.equal(ev[6], 0); assert.equal(ev[7], 200); assert.equal(ev[8], 2);
  assert.equal(ev[S + 1], 1023); assert.ok(Math.abs(ev[S + 6] - 1 / 3) < 1e-6);
  assert.equal(recorded[5], 1); assert.equal(recorded[0], 1);
  const cells = recordCells(u, { x: 10, y: 20, hx: 2, hy: 1 });
  assert.ok(Math.abs(cells[0] - 12) < 1e-3 && Math.abs(cells[1] - 20) < 1e-3);
  assert.equal(cells[2], 1); assert.equal(cells[3], -1); assert.equal(cells[4], 4242);
});

test('the scan keeps a fair sample sized to what the audio plays', () => {
  const k = keepFor([1000, 2, 0, 0, 0, 0, 0, 0], 0.1);
  assert.ok(Math.abs(k[0] - (LISTEN.target[0] * 0.1) / 1000) < 1e-12);
  assert.equal(k[1], 1); assert.equal(k[2], 1);
});

test('hearing: nearer views are louder per event and closer in timbre', () => {
  const near = hearing(D_REF / 2, D_REF / 2), far = hearing(40, 25);
  assert.ok(Math.abs(near.gd - 1) < 1e-9 && near.z === 1);
  assert.ok(far.gd < 0.03 && far.z === 0);
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
  const u = new Uint32Array(REC * 6), f = new Float32Array(u.buffer);
  for (let i = 0; i < 6; i++) { u[i * REC] = [0, 0, 5, 6, 7, 3][i] | (7 << 4) | (i << 16); u[i * REC + 1] = (i * 10000) | (30000 << 16); f[i * REC + 2] = 0.02 * i; u[i * REC + 3] = 0xff3080ff; }
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

const renderBars = (cond, bars) => { const L = new Float32Array(64), R = new Float32Array(64); const n = Math.ceil((bars * 16 * cond.step * 48000) / 64); for (let b = 0; b < n; b++) cond.render(L, R); };

test('a change of era fades a new sea in and bridges to the new key without gliding', () => {
  const eng = new Engine(48000, { seed: 2 }), cond = new Conductor(eng, { seed: 2 });
  const sets = [], spawns = [];
  const set0 = eng.set.bind(eng), spawn0 = eng.spawn.bind(eng);
  eng.set = (id, p) => { sets.push([id, p]); return set0(id, p); };
  eng.spawn = (d, p, id) => { spawns.push([d, p, id]); return spawn0(d, p, id); };
  renderBars(cond, 4);
  const sea0 = cond.sea;
  cond.message({ type: 'era', name: 'The Hollow Murk' });
  renderBars(cond, 40);
  assert.equal(cond.era.name, 'The Hollow Murk');
  assert.notEqual(cond.sea, sea0);
  // no node is ever retuned in place, and the whole mix is never swept
  assert.ok(!sets.some(([id, p]) => ('f1' in p && id !== 'swarm') || 'note' in p || 'tone' in p), 'a set retuned a node');
  assert.ok(sets.some(([id, p]) => id === sea0 && p.fade === 0), 'the old sea fades out');
  assert.ok(spawns.some(([d]) => d === 'strings') && spawns.some(([d]) => d === 'piano'), 'bridge and interlude play');
  assert.ok(!eng.nodes.has(sea0), 'the old sea is freed');
});

test('each era has its own ensemble, and every layer plays', () => {
  for (const name of ['The Dim Gyre', 'The Bright Calm', 'The Silver Tides', 'The Bitter Bloom']) {
    const p = palette(name);
    assert.equal(p.length, 2); assert.notEqual(p[0], p[1]); assert.ok(p.every((l) => LAYERS.includes(l)));
    assert.deepEqual(p, palette(name));
  }
  for (const layer of LAYERS) {
    const eng = new Engine(48000, { seed: 4 }), cond = new Conductor(eng, { seed: 4 });
    cond.score.layers = [layer];
    let n = 0; const spawn0 = eng.spawn.bind(eng);
    eng.spawn = (d, p, id) => { if (id == null) n++; return spawn0(d, p, id); };
    for (const tide of [0.1, 0.95]) { cond.message({ type: 'world', world: { tide, light: 0.6 } }); renderBars(cond, 24); }
    assert.ok(n > 0, `${layer} played nothing`);
  }
});

test('from afar the view is heard as a swarm, up close as single voices', () => {
  const r = rng(3), g = finalizeGenome(archetypeGenome(ARCHETYPE_TYPES[0], r));
  const run = (hx) => {
    const eng = new Engine(48000, { seed: 5 }), cond = new Conductor(eng, { seed: 5 });
    cond.message({ type: 'slots', all: true, slots: [{ slot: 7, serial: 70, voice: voiceOf(g), pop: 5000 }] });
    const N = 60, u = new Uint32Array(4 * N), f = new Float32Array(u.buffer);
    for (let i = 0; i < N; i++) { u[i * 4] = 8 | (7 << 4); u[i * 4 + 1] = (i * 1000) | (30000 << 16); f[i * 4 + 2] = 0.8; u[i * 4 + 3] = 0xff3080ff; }
    const data = { records: u, f32: f, window: 0.1, view: { hx, hy: hx * 0.6 }, inView: [0, 0, 0, 0, 0, 0, 0, 0], outView: [0, 0, 0, 0, 0, 0, 0, 0], living: hx > 5 ? 50000 : 12, speed: 0.2 };
    let notes = 0; const spawn0 = eng.spawn.bind(eng);
    eng.spawn = (d, p, id) => { if (['cplx', 'tine', 'swell', 'glass', 'breath', 'bite', 'wood', 'drop'].includes(d) && id == null) notes++; return spawn0(d, p, id); };
    cond.score.layers = [];
    for (let k = 0; k < 20; k++) { cond.message(digest(data, { speed: 1 }).msg); renderBars(cond, 0.25); }
    return { notes, grains: eng.nodes.get('swarm').p.d1 };
  };
  const far = run(60), near = run(0.5);
  assert.ok(far.grains > 100 && near.grains === 0, `grains far ${far.grains} near ${near.grains}`);
  assert.ok(near.notes > far.notes, `notes near ${near.notes} far ${far.notes}`);
});

test('over its voice limit the engine fades the oldest notes out instead of breaking up', () => {
  const eng = new Engine(48000, { seed: 4 });
  eng.maxVoices = 8;
  eng.spawn('sea', { amp: 0.05 }, 'sea'); // persistent: never shed
  const L = new Float32Array(64), R = new Float32Array(64);
  let maxLive = 0, peak = 0, prev = 0, jump = 0;
  for (let b = 0; b < 1500; b++) {
    if (b % 5 === 0) eng.spawn('tine', { freq: 300 + (b % 7) * 50, amp: 0.2, dec: 2 });
    eng.block(L, R);
    maxLive = Math.max(maxLive, eng.voices.length - eng.fading);
    for (let i = 0; i < 64; i++) { assert.ok(Number.isFinite(L[i])); peak = Math.max(peak, Math.abs(L[i])); jump = Math.max(jump, Math.abs(L[i] - prev)); prev = L[i]; }
  }
  assert.ok(maxLive <= 9, `live ${maxLive}`); // the limit plus the persistent sea
  assert.ok(eng.nodes.get('sea') && eng.voices.includes(eng.nodes.get('sea')));
  assert.ok(eng.fading >= 0 && eng.fading <= eng.voices.length);
  assert.ok(peak > 1e-3 && jump < 0.5, `peak ${peak} jump ${jump}`);
});

test('picking a species plays its song once, then its cells ease back into the mix', () => {
  const eng = new Engine(48000, { seed: 6 }), cond = new Conductor(eng, { seed: 6 });
  const g = finalizeGenome(archetypeGenome('grazer', rng(12))), v = voiceOf(g);
  cond.message({ type: 'slots', all: true, slots: [{ slot: 9, serial: 90, voice: v, pop: 40 }] });
  const scan = (sel) => {
    const u = new Uint32Array(REC), f = new Float32Array(u.buffer);
    u[0] = 8 | (9 << 4); u[1] = 30000 | (30000 << 16); f[2] = 0.5; u[3] = 0xff3080ff;
    return digest({ records: u, f32: f, window: 0.1, view: { hx: 0.6, hy: 0.6 }, inView: [0, 0, 0, 0, 0, 0, 0, 0], outView: [0, 0, 0, 0, 0, 0, 0, 0], living: 1, speed: 0.2 }, { speed: 1, selSlot: sel }).msg;
  };
  const sang = [];
  cond.post = (m) => { if (m.type === 'sang') sang.push(...m.notes.filter((n) => n[5] === -1)); };
  cond.message(scan(9));
  const greeting = sang.filter((n) => n[0] === 9 && n[3] === 0).length;
  assert.equal(greeting, v.motif.notes.length, 'the whole motif, once');
  assert.equal(cond.field.focus(), 1);
  cond.message(scan(9)); // still picked: no second greeting
  assert.equal(sang.filter((n) => n[0] === 9 && n[3] === 0).length, greeting);
  renderBars(cond, Math.ceil((cond.field.focusEnd - cond.time + 3) / (16 * cond.step)) + 1);
  assert.equal(cond.field.focus(), 0, 'eased back');
  cond.message(scan(-1)); cond.message(scan(9)); // picked again: greeted again
  assert.equal(sang.filter((n) => n[0] === 9 && n[3] === 0).length, 2 * greeting);
});

test('after its greeting a picked species sings its real share, though the scan samples it in full', () => {
  const eng = new Engine(48000, { seed: 8 }), cond = new Conductor(eng, { seed: 8 }), f = cond.field;
  const ga = finalizeGenome(archetypeGenome('grazer', rng(31))), gb = finalizeGenome(archetypeGenome('grazer', rng(32)));
  cond.message({ type: 'slots', all: true, slots: [{ slot: 9, serial: 90, voice: voiceOf(ga), pop: 20 }, { slot: 10, serial: 100, voice: voiceOf(gb), pop: 20 }] });
  // 20 cells of each in view: all 20 of the picked species sampled, 4 of the other (keep 0.2)
  const msg = () => {
    const n = 24, u = new Uint32Array(REC * n), fl = new Float32Array(u.buffer);
    for (let i = 0; i < n; i++) { u[i * REC] = 8 | ((i < 20 ? 9 : 10) << 4) | (i << 16) | (128 << 24); u[i * REC + 1] = (i * 2000) | (30000 << 16); fl[i * REC + 2] = 0.5; u[i * REC + 3] = 0xff3080ff; }
    const m = digest({ records: u, f32: fl, window: 0.1, view: { hx: 0.6, hy: 0.6 }, inView: [0, 0, 0, 0, 0, 0, 0, 0], outView: [0, 0, 0, 0, 0, 0, 0, 0], living: 40, speed: 0.3 }, { speed: 1, selSlot: 9 }).msg;
    m.sampled = { sel: 9, keep: 0.2 };
    return m;
  };
  f.selPrev = 9; f.focusEnd = -100; // greeted long ago
  const count = { 9: 0, 10: 0 };
  for (let k = 0; k < 400; k++) { f.plan = []; f.collect(msg()); for (const n of f.plan) if (n[0] === 'alive') count[n[3].slot] += n[3].frag || 1; f.plan = null; }
  const share = count[9] / (count[9] + count[10]);
  assert.ok(share > 0.4 && share < 0.6, `picked species' share ${share.toFixed(2)}`);
});
