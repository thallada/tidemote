import test from 'node:test';
import assert from 'node:assert/strict';
import { archetypeGenome, ARCHETYPE_TYPES, finalizeGenome } from '../src/genome.js';
import { voiceOf, archOf, ARCH } from '../src/audio/mapping.js';
import { Engine } from '../src/audio/voices.js';
import { Conductor } from '../src/audio/conductor.js';
import { LISTEN, LISTEN_REC as REC, decodeRecords, recordCells, keepFor, hearing, D_REF, digest } from '../src/audio/listen.js';
import { LISTEN_TYPES, LISTEN_REC } from '../src/shaders.js';
import { d2m } from '../src/audio/conductor.js';
import { tempoFor, cellRate, SONG_RATE, MUTE_FLOOR } from '../src/audio/field.js';
import { BAND_VOICE } from '../src/audio/listen.js';
import { palette, ENSEMBLE, OVERTURES, THEMES } from '../src/audio/score.js';
import { eraMusic, worldHash, STEP } from '../src/audio/conductor.js';

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
    assert.equal(p.length, 2); assert.notEqual(p[0], p[1]); assert.ok(p.every((l) => ENSEMBLE.includes(l)));
    assert.deepEqual(p, palette(name));
  }
  for (const layer of ENSEMBLE) {
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
  const ga = finalizeGenome(archetypeGenome('grazer', rng(33))), gb = finalizeGenome(archetypeGenome('grazer', rng(34)));
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

test('every world opens in its own key, ensemble, overture and figure, the same each time', () => {
  const open = (ws) => { const m = eraMusic('The First Tides', null, ws); return [m.mode, m.root, palette('The First Tides', [], ws).join('+'), OVERTURES[worldHash('overture', ws) % OVERTURES.length], THEMES[worldHash('theme', ws) % THEMES.length].join()]; };
  const seen = [new Set(), new Set(), new Set(), new Set(), new Set()];
  for (let ws = 1; ws <= 200; ws++) { const o = open(ws); assert.deepEqual(o, open(ws)); o.forEach((x, i) => seen[i].add(x)); }
  assert.ok(seen[0].size >= 6 && seen[1].size >= 5 && seen[2].size >= 10 && seen[3].size === OVERTURES.length && seen[4].size >= 10, seen.map((x) => x.size).join());
  // an era keeps its name's mode in every world, but not its key and ensemble in all of them
  const eras = new Set(), keys = new Set();
  for (let ws = 1; ws <= 40; ws++) { const m = eraMusic('The Dim Gyre', 50, ws); assert.equal(m.mode, 'aeolian'); assert.notEqual(m.root, 50); keys.add(m.root); eras.add(palette('The Dim Gyre', [], ws).join('+')); }
  assert.ok(keys.size >= 4 && eras.size >= 8);
});

test('a world opens with its own overture, and it lands only after the warm-up', () => {
  for (const seed of [3, 8]) {
    const eng = new Engine(48000, { seed: 1 }), cond = new Conductor(eng, { seed: 1 });
    const pianos = [];
    const spawn0 = eng.spawn.bind(eng); eng.spawn = (d, p, id) => { if (d === 'piano' && p.amp > 0.2) pianos.push(cond.time); return spawn0(d, p, id); };
    cond.message({ type: 'reset', seed });
    cond.score.layers = [];
    cond.message({ type: 'open', seed }); cond.message({ type: 'warm', on: true });
    renderBars(cond, 20); // ~58 s: the overture has rung out, but the warm-up goes on
    cond.score.layers = [];
    assert.equal(pianos.length, 0, 'the theme waited for the warm-up');
    cond.message({ type: 'warm', on: false });
    renderBars(cond, 8);
    assert.ok(pianos.length >= 5, `the theme landed (${pianos.length} notes)`);
  }
});

test("a new world drops the old one's notes still to come, but still frees the old sea", () => {
  const eng = new Engine(48000, { seed: 1 }), cond = new Conductor(eng, { seed: 1 });
  const sea0 = cond.sea;
  cond.message({ type: 'reset', seed: 3 }); cond.message({ type: 'open', seed: 3 });
  renderBars(cond, 1);
  assert.ok(cond.queue.some((q) => q.def && q.id == null), 'the overture is under way');
  const sea1 = cond.sea;
  cond.message({ type: 'reset', seed: 8 });
  assert.ok(!cond.queue.some((q) => (q.def && q.id == null) || q.set === 'fdn'), "the old world's notes and reverb are gone");
  renderBars(cond, 8);
  assert.ok(!eng.nodes.has(sea0) && !eng.nodes.has(sea1) && eng.nodes.has(cond.sea), 'the old seas are freed');
});

test("a world set before anything is heard (a card's song clip) has its sea at once; later, the seas crossfade", () => {
  const eng = new Engine(48000, { seed: 1 }), cond = new Conductor(eng, { seed: 1 });
  const sea0 = cond.sea;
  cond.message({ type: 'reset', seed: 1, era: 'The Dim Gyre' });
  renderBars(cond, 0.1);
  assert.ok(!eng.nodes.has(sea0) && eng.nodes.get(cond.sea).p.fade === 1, 'the clip is in its own key from the start');
  const sea1 = cond.sea;
  cond.message({ type: 'reset', seed: 2 });
  renderBars(cond, 1);
  assert.ok(eng.nodes.has(sea1) && eng.nodes.get(sea1).p.fadeTime === 10, 'a world begun later crossfades its sea');
});

test("an overture's hall rings out, then the water's own reverb comes back", () => {
  const eng = new Engine(48000, { seed: 1 }), cond = new Conductor(eng, { seed: 1 });
  cond.message({ type: 'world', world: { light: 0.6, tide: 0.5, warm: -1 } });
  renderBars(cond, 12); // (cold water: a long hall of its own)
  const own = eng.fdn.p.decay;
  assert.ok(own > 10, `cold water's decay ${own}`);
  cond.message({ type: 'open', seed: 1 });
  renderBars(cond, 2);
  assert.equal(eng.fdn.p.decay, 18, 'the overture rings in its hall');
  renderBars(cond, 6);
  assert.ok(eng.fdn.p.decay >= own && eng.fdn.p.decay === cond.fdnDecay, `the water's reverb is back (${eng.fdn.p.decay})`);
});

test('sparks shower in many shapes, a few times a minute, never one figure on repeat', () => {
  const eng = new Engine(48000, { seed: 6 }), cond = new Conductor(eng, { seed: 6 });
  const glints = [];
  const at0 = cond.at.bind(cond); cond.at = (t, d, p, id) => { if (d === 'glint') glints.push([cond.time, Math.round(p.freq)]); return at0(t, d, p, id); };
  const o = { pan: 0, hue: 0.3, wet: (r) => r };
  const L = new Float32Array(64), R = new Float32Array(64);
  // a sped-up new world: 100 sparks a second for 20 s
  for (let b = 0; b < 15000; b++) {
    if (b % 15 === 0) for (let i = 0; i < 5; i++) cond.field.play('spark', cond.time + 0.05, 0.05, { ...o, hue: (b * 0.37 + i * 0.13) % 1 });
    cond.render(L, R);
  }
  const per = glints.length / 20;
  assert.ok(per > 2 && per < 8, `${per.toFixed(1)} glints a second`);
  // showers: the glints scheduled at one moment; most differ from each other
  const showers = new Map();
  for (const [t, f] of glints) showers.set(t, [...(showers.get(t) || []), f]);
  const figures = [...showers.values()].filter((x) => x.length >= 3).map((x) => x.join());
  assert.ok(figures.length >= 5 && new Set(figures).size >= figures.length * 0.7, `${new Set(figures).size} of ${figures.length} showers differ`);
});

test('a cell waking from a cyst stirs, softly and a few times a second however many wake', () => {
  const r = rng(11), g = finalizeGenome(archetypeGenome('grazer', r));
  // a close view: two births and `woke` wakes a scan (in view; the scan recorded at most 40 of them), 6 s of scans
  const run = (woke) => {
    const eng = new Engine(48000, { seed: 8 }), cond = new Conductor(eng, { seed: 8 });
    cond.score.layers = [];
    cond.message({ type: 'slots', all: true, slots: [{ slot: 7, serial: 70, voice: voiceOf(g), pop: 500 }] });
    const n = 2 + Math.min(woke, 40), u = new Uint32Array(REC * n), f = new Float32Array(u.buffer);
    for (let i = 0; i < n; i++) { u[i * REC] = (i < 2 ? 0 : 7) | (7 << 4) | (i << 16); u[i * REC + 1] = (i * 1000) | (30000 << 16); f[i * REC + 2] = 0.01 * (i % 10); u[i * REC + 3] = 0xff3080ff; }
    const data = { records: u, f32: f, window: 0.1, view: { hx: 0.6, hy: 0.6 }, inView: [2, 0, 0, 0, 0, 0, 0, woke], outView: [0, 0, 0, 0, 0, 0, 0, 0], living: 30, speed: 0.1 };
    const stirs = [], births = [], at0 = cond.at.bind(cond);
    cond.at = (t, d, p, id) => {
      if (d === 'breath' && p.glide < -0.05) stirs.push(p);
      else if (d === 'glint') births.push(p);
      return at0(t, d, p, id);
    };
    let agc = 0;
    for (let k = 0; k < 60; k++) { cond.message(digest(data, { speed: 1 }).msg); renderBars(cond, 0.1 / (16 * cond.step)); if (k >= 20) agc += cond.field.agc / 40; }
    return { stirs, births, agc };
  };
  const few = run(1), rain = run(400), none = run(0);
  assert.equal(none.stirs.length, 0);
  // one wake a scan (10 a second) and four hundred: a few stirs a second either way
  for (const x of [few, rain]) assert.ok(x.stirs.length >= 6 && x.stirs.length <= 1.7 * 6 + 2, `${x.stirs.length} stirs in 6 s`);
  // each rises onto its note from below, with a soft attack, quieter than a birth's ring
  const ring = Math.max(...few.births.map((p) => p.amp));
  for (const p of rain.stirs) assert.ok(p.glide < 0 && p.atk > 0.2 && p.amp < ring, JSON.stringify(p));
  // the wakes left unheard do not duck the field
  assert.ok(rain.agc > 0.9 * none.agc, `level riding ${rain.agc.toFixed(2)} with the rain, ${none.agc.toFixed(2)} without`);
});

test('sped up, the score quickens but stays a score', () => {
  for (const layer of ENSEMBLE) {
    const eng = new Engine(48000, { seed: 4 }), cond = new Conductor(eng, { seed: 4 });
    cond.score.layers = [layer];
    let n = 0; const spawn0 = eng.spawn.bind(eng);
    eng.spawn = (d, p, id) => { if (id == null) n++; return spawn0(d, p, id); };
    cond.setTempo(tempoFor(1e6));
    assert.ok(cond.step < STEP / 3.9 && cond.slow > STEP / 2.01);
    cond.message({ type: 'world', world: { tide: 0.95, light: 0.6 } });
    const secs = 30; renderBars(cond, (secs / (16 * cond.step)) | 0);
    assert.ok(n / secs < 7, `${layer}: ${(n / secs).toFixed(1)} notes a second`);
  }
});

test('the hand is heard: each act its sound, held sounds one voice each, the ice only while the water freezes', () => {
  const sr = 48000, eng = new Engine(sr, { seed: 9 }), cond = new Conductor(eng, { seed: 9 });
  const L = new Float32Array(64), R = new Float32Array(64);
  // (the hand's notes, at the times they are scheduled for)
  const notes = [];
  cond.hand.at = (t, d, p) => { notes.push({ d, p, t }); cond.at(t, d, p); };
  const run = (s) => { for (let b = 0; b < (s * sr) / 64; b++) { cond.render(L, R); for (let i = 0; i < 64; i++) assert.ok(Number.isFinite(L[i]) && Math.abs(L[i]) <= 0.97 + 1e-6); } };
  const hand = (m) => cond.message({ type: 'hand', ...m });
  const since = (t) => notes.filter((n) => n.t >= t);
  // picking up the needle clinks steel; picking up nothing (Pan) is silent
  run(0.5); let t = cond.time;
  hand({ ev: 'pick', tool: 'needle' }); run(0.3);
  assert.deepEqual(since(t).map((n) => n.d).sort(), ['tick', 'tine']);
  t = cond.time; hand({ ev: 'pick', tool: 'none' }); run(0.3);
  assert.equal(since(t).length, 0);
  // the needle drawn through the water: one held tearing voice (no train of notes), rougher where it cuts bonds
  t = cond.time; hand({ ev: 'state', tool: 'needle', held: true, move: 2 }); run(0.5);
  const tear = cond.hand.held.scalpel?.id, a0 = eng.nodes.get(tear).p.amp;
  hand({ ev: 'cut', n: 5 }); run(0.05);
  assert.ok(eng.nodes.get(tear).p.amp > a0 * 1.2 && since(t).length === 0);
  hand({ ev: 'state', tool: 'needle', held: false, move: 0 }); run(3);
  assert.ok(!cond.hand.held.scalpel);
  // the pipette's cells: as many marbles as fit at once, the rest dropped (no backlog: they stop when the cells do)
  t = cond.time; hand({ ev: 'cells', n: 500 }); run(3);
  const m = since(t).filter((n) => n.d === 'tine');
  assert.ok(m.length >= 2 && m.length < 6 && m.every((n) => n.t < t + 0.2), `${m.length} marbles`);
  // the rod stirring: one held voice of sloshing water; at work it ducks the field; let go, it comes back
  hand({ ev: 'state', tool: 'touch', held: true, move: 2 }); run(1);
  assert.ok(cond.hand.duck < 0.85 && eng.nodes.get(cond.hand.held.stir.id).p.amp > 0.01);
  hand({ ev: 'state', tool: 'touch', held: false, move: 0 }); run(1);
  assert.ok(cond.hand.duck > 0.98);
  // the shade: a held note while it is on, ended a while after it is let go
  hand({ ev: 'state', tool: 'shade', level: 1 }); run(1);
  const id = cond.hand.held.shade?.id;
  assert.ok(id && eng.nodes.has(id) && eng.nodes.get(id).p.amp > 0.05);
  hand({ ev: 'state', tool: 'shade', level: 0 }); run(3);
  assert.ok(!cond.hand.held.shade && !eng.nodes.has(id));
  // the warm stage over water that heats: a rumble as hot as it is, and bubbles at the boil
  t = cond.time; hand({ ev: 'state', tool: 'warm', level: 1, water: 40 }); run(2);
  const lukewarm = eng.nodes.get(cond.hand.held.rumble.id).p.amp;
  hand({ ev: 'state', tool: 'warm', level: 1, water: 100 }); run(2);
  assert.ok(eng.nodes.get(cond.hand.held.rumble.id).p.amp > 3 * lukewarm && since(t).filter((n) => n.d === 'drop').length > 20);
  hand({ ev: 'state', tool: 'warm', level: 0, water: null }); run(4);
  assert.ok(!cond.hand.held.rumble);
  // the cold probe: ice cracks only while the water under it freezes; the ice there groans and dims the world, and
  // holding the probe over ice already formed is still
  t = cond.time; hand({ ev: 'state', tool: 'cold', level: 1, freezing: 0, ice: 0 }); run(1);
  assert.equal(since(t).length, 0);
  hand({ ev: 'state', tool: 'cold', level: 1, freezing: 1, ice: 0.3 }); run(2);
  assert.ok(since(t).filter((n) => n.d === 'rustle').length > 10 && cond.hand.groans === 1 && eng.nodes.has(cond.hand.groan.id));
  hand({ ev: 'state', tool: 'cold', level: 1, freezing: 0, ice: 1 }); run(3);
  assert.ok(eng.master.p.tone < 4000 && cond.hand.duck < 0.8 && cond.hand.groans === 2);
  t = cond.time; run(2);
  assert.equal(since(t).filter((n) => n.d === 'rustle').length, 0);
  hand({ ev: 'state', tool: 'none', level: 0, freezing: 0, ice: 0 }); run(10);
  assert.ok(eng.master.p.tone === 16000 && cond.hand.duck > 0.98);
  // riding: the rest of the field steps back; steered, the water rushes past
  hand({ ev: 'state', tool: 'none', ride: true, will: 1 }); run(2);
  assert.ok(cond.hand.duck < 0.6 && eng.nodes.get(cond.hand.held.rush.id).p.amp > 0.08);
});

// a living cell's third word as LISTEN_WGSL's callWord packs it: energy toward division (0..1.5), a call (0..1), its band
const callWord = (energy, a, band) => (Math.round((energy / 1.5) * 65535) | (Math.round(a * 255) << 16) | (band << 24)) >>> 0;

test('a living cell\'s record carries its song now, an alarm record its alarm, each with its band', () => {
  const u = new Uint32Array(3 * REC), f = new Float32Array(u.buffer);
  u[0] = 8 | (12 << 4); u[2] = callWord(0.75, 0.6, 2);
  u[REC] = 9 | (12 << 4); u[REC + 2] = callWord(1.5, 1, 0);
  u[2 * REC] = 3; f[2 * REC + 2] = 0.04; // an event keeps its age
  const { ev, recorded } = decodeRecords(u, f), S = LISTEN.stride;
  assert.ok(Math.abs(ev[4] - 0.75) < 1e-4 && Math.abs(ev[9] - 0.6) < 3e-3 && ev[10] === 2);
  assert.equal(ev[S], 9); assert.ok(Math.abs(ev[S + 4] - 1.5) < 1e-4 && ev[S + 9] === 1 && ev[S + 10] === 0);
  assert.ok(Math.abs(ev[2 * S + 4] - 0.04) < 1e-7 && ev[2 * S + 9] === 0);
  assert.equal(recorded[8], 1); assert.equal(recorded[9], 1); assert.equal(recorded[3], 1);
  // the scan's count of alarm callers rides as the last of inView, and is sampled to its target
  const m = digest({ records: u, f32: f, window: 0.1, view: { hx: 1, hy: 1 }, inView: [0, 0, 0, 0, 0, 0, 0, 0], outView: [0, 0, 0, 0, 0, 0, 0, 0], living: 50, livingAll: 50, speed: 0.1, alarm: 500 }, { signals: true });
  assert.equal(m.msg.inView.length, LISTEN.types.length); assert.equal(m.msg.inView[9], 500); assert.equal(m.msg.signals, true);
  assert.ok(Math.abs(m.keep[9] - (LISTEN.target[9] * 0.1) / 500) < 1e-12);
});

test('who sings: with signals, singers as loud as they sing now, mutes faintly; without, everyone as before', () => {
  const v = { rate: 2, song: 0.7 }, mute = { rate: 2, song: 0 }, step = STEP;
  const old = cellRate(v, 0.5, 0, step, false);
  assert.equal(cellRate(v, 0.5, 0.9, step, false), old, 'without signals the song changes nothing');
  assert.equal(cellRate(v, 0.5, 0, step, true), 0, 'a hushed singer is silent');
  assert.ok(Math.abs(cellRate(v, 0.5, 1, step, true) - SONG_RATE / (2 * step * 4)) < 1e-9, 'in full voice, at its pace times SONG_RATE');
  assert.equal(cellRate(v, 0.9, 0.5, step, true), cellRate(v, 0, 0.5, step, true), 'a singer sings by its song, not by how it moves');
  assert.ok(Math.abs(cellRate(mute, 0.5, 0, step, true) - MUTE_FLOOR * cellRate(mute, 0.5, 0, step, false)) < 1e-12, 'a mute at the floor');
  assert.equal(cellRate(null, 0.5, 0, step, true), MUTE_FLOOR * cellRate(null, 0.5, 0, step, false), 'unknown and silent: a mute');
  assert.ok(cellRate(null, 0.5, 0.8, step, true) > 0, 'unknown but singing: a singer');
});

test('a silent reef: singers that hush stop coming in, and come back when they sing', () => {
  const eng = new Engine(48000, { seed: 4 }), cond = new Conductor(eng, { seed: 4 }), f = cond.field;
  const ga = finalizeGenome(archetypeGenome('grazer', rng(41))), gb = finalizeGenome(archetypeGenome('grazer', rng(42)));
  ga.call = [0.8, 0.3, 0, 0]; gb.call = [0, 0, 0, 0]; // a singer (in the song band) and a mute
  cond.message({ type: 'slots', all: true, slots: [{ slot: 9, serial: 90, voice: voiceOf(ga), pop: 30 }, { slot: 10, serial: 100, voice: voiceOf(gb), pop: 30 }] });
  const msg = (song) => {
    const n = 40, u = new Uint32Array(REC * n), fl = new Float32Array(u.buffer);
    for (let i = 0; i < n; i++) { u[i * REC] = 8 | ((i < 20 ? 9 : 10) << 4) | (i << 16) | (128 << 24); u[i * REC + 1] = (i * 1500) | (30000 << 16); u[i * REC + 2] = callWord(0.8, i < 20 ? song : 0, 1); u[i * REC + 3] = 0xff3080ff; }
    return digest({ records: u, f32: fl, window: 0.1, view: { hx: 0.6, hy: 0.6 }, inView: [0, 0, 0, 0, 0, 0, 0, 0], outView: [0, 0, 0, 0, 0, 0, 0, 0], living: 40, livingAll: 40, speed: 0.3 }, { speed: 1, signals: true }).msg;
  };
  const sung = (song) => {
    const count = { 9: 0, 10: 0 };
    for (let k = 0; k < 200; k++) { f.plan = []; f.collect(msg(song)); for (const n of f.plan) if (n[0] === 'alive') count[n[3].slot]++; f.plan = null; }
    return count;
  };
  const singing = sung(0.8), hushed = sung(0), again = sung(0.8);
  assert.ok(singing[9] > 4 * singing[10], `singers lead: ${singing[9]} vs mutes ${singing[10]}`);
  assert.equal(hushed[9], 0, 'hushed singers are not heard');
  assert.ok(hushed[10] > 0, 'the mutes are still faintly there');
  assert.ok(again[9] > 0.5 * singing[9], 'singing again, heard again');
  // a view of singers only, every one hushed: silence, and the level riding unharmed
  const quiet = () => { const u = new Uint32Array(REC * 5), fl = new Float32Array(u.buffer); for (let i = 0; i < 5; i++) { u[i * REC] = 8 | (9 << 4); u[i * REC + 2] = callWord(0.8, 0, 1); } return digest({ records: u, f32: fl, window: 0.1, view: { hx: 0.6, hy: 0.6 }, inView: [0, 0, 0, 0, 0, 0, 0, 0], outView: [0, 0, 0, 0, 0, 0, 0, 0], living: 5, livingAll: 5, speed: 0.3 }, { speed: 1, signals: true }).msg; };
  for (let k = 0; k < 5; k++) cond.message(quiet());
  assert.ok(Number.isFinite(f.agc) && Number.isFinite(f.power), `agc ${f.agc} power ${f.power}`);
  // a singer's notes are held to about a second after it was heard
  f.plan = []; f.collect(msg(0.8));
  for (const n of f.plan) if (n[0] === 'alive' && n[3].slot === 9) assert.ok(n[3].until > 0 && n[3].until - n[1] <= 0.8 + 1e-9);
  f.plan = null;
});

test('an alarm call ticks from where the cell is, in its band\'s register', () => {
  const eng = new Engine(48000, { seed: 3 }), cond = new Conductor(eng, { seed: 3 });
  const g = finalizeGenome(archetypeGenome('grazer', rng(5)));
  cond.message({ type: 'slots', all: true, slots: [{ slot: 9, serial: 90, voice: voiceOf(g), pop: 30 }] });
  const heard = [];
  const spawn0 = eng.spawn.bind(eng);
  eng.spawn = (d, p, id) => { if (id == null) heard.push([d, p]); return spawn0(d, p, id); };
  const scan = (band) => {
    const u = new Uint32Array(REC), fl = new Float32Array(u.buffer);
    u[0] = 9 | (9 << 4); u[1] = 60000 | (30000 << 16); u[2] = callWord(1, 1, band); u[3] = 0xff3080ff;
    return digest({ records: u, f32: fl, window: 0.1, view: { hx: 0.6, hy: 0.6 }, inView: [0, 0, 0, 0, 0, 0, 0, 0], outView: [0, 0, 0, 0, 0, 0, 0, 0], living: 1, livingAll: 1, speed: 0, alarm: 1 }, { speed: 1, signals: true }).msg;
  };
  const kinds = [];
  for (const band of [0, 1, 2, 3]) {
    heard.length = 0; cond.message(scan(band)); renderBars(cond, 0.25);
    const a = heard.filter(([d]) => d === 'tick' || d === 'wood' || d === 'glint');
    assert.equal(a.length, 2, `band ${band}: a double tick`);
    assert.ok(a.every(([, p]) => p.pan > 0.5), 'from the right, where the cell is');
    kinds.push(a[0][0]);
  }
  assert.deepEqual(kinds, ['wood', 'tick', 'tick', 'glint']);
});

test('a species\' song band shifts its register: rumble down and darker, click and flash up', () => {
  const g = finalizeGenome(archetypeGenome('grazer', rng(77)));
  const at = (band) => voiceOf({ ...g, call: [0.6, (band + 0.5) / 4, 0, 0] });
  const base = voiceOf({ ...g, call: [0, 0, 0, 0] }), song = at(1);
  assert.equal(song.oct, base.oct); assert.equal(song.mat, base.mat); assert.equal(song.bright, base.bright);
  assert.equal(at(0).oct, base.oct - 1); assert.ok(at(0).bright < base.bright && at(0).dec > base.dec);
  assert.equal(at(2).oct, base.oct + 1); assert.ok(at(2).dec < base.dec);
  assert.equal(at(3).mat, 'glass'); assert.equal(at(3).oct, base.oct + BAND_VOICE[3].oct);
  assert.equal(voiceOf({ ...g, call: [0, 0.9, 0, 0] }).oct, base.oct, 'a mute sings as it did, whatever its band gene');
});
