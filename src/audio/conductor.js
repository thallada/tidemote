// The conductor keeps the soundtrack's time and harmony: the pulse (following the simulation's
// speed), the climate era's mode and root, the pivot, the sea, the waves and the drone. The field
// mix (field.js) schedules the cells' notes on it and the score (score.js) the long form. Runs
// inside the AudioWorklet; times are in seconds of audio rendered.

import { BS } from './ugens.js';
import { Field } from './field.js';
import { Score } from './score.js';

export const STEP = 0.18; // one sixteenth: tidemote's soundtrack pulse

export const MODES = {
  lydian: [[0, 2, 4, 6, 7, 9, 11], [0, 0, -2, -3]],
  dorian: [[0, 2, 3, 5, 7, 9, 10], [0, 0, -1, -4]],
  aeolian: [[0, 2, 3, 5, 7, 8, 10], [0, 0, -2, -1]],
  mixolydian: [[0, 2, 4, 5, 7, 9, 10], [0, 0, -1, -4]],
  phrygian: [[0, 1, 3, 5, 7, 8, 10], [0, 0, 1, -2]],
  penta: [[0, 2, 4, 7, 9], [0, 0, -1, 1]],
  ionian: [[0, 2, 4, 5, 7, 9, 11], [0, 0, 3, -2]],
  lyddom: [[0, 2, 4, 6, 7, 9, 10], [0, 0, 1, 0]],
};
// tidemote's era words, each with a musical meaning
const ADJ = { Restless: 'dorian', Dim: 'aeolian', Bright: 'lydian', Still: 'penta', Pale: 'lyddom', Warm: 'ionian', Hollow: 'phrygian', Rising: 'lydian', Long: 'dorian', Bitter: 'phrygian', Green: 'mixolydian', Silver: 'lyddom' };
const NOUN = {
  Glare: { glint: 1.8, bright: 1.25 }, Tides: { tide: 1.4 }, Drift: { dens: 0.85, gyre: 2 }, Calm: { dens: 0.65 },
  Surge: { dens: 1.25 }, Murk: { bright: 0.6, sea: 1.5 }, Bloom: { bloom: 1.3 }, Shallows: { shift: 5 }, Gyre: { gyre: 3 },
  Hush: { level: 0.7, dens: 0.6 },
};
const ROOTS = [45, 47, 48, 50, 52, 53];
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export function eraMusic(name, prevRoot) {
  const w = String(name || '').split(' ');
  if (!name || name === 'The First Tides' || !ADJ[w[1]]) return { name: name || 'The First Tides', mode: 'lydian', root: 50, fx: {} };
  const roots = ROOTS.filter((r) => r !== prevRoot);
  return { name, mode: ADJ[w[1]], root: roots[hashStr(name) % roots.length], fx: NOUN[w[2]] || {} };
}

// Scale degree → MIDI note, as SuperCollider's degreeToKey: a fractional degree carries an
// accidental of ten times its distance from the nearest degree (2.1 is the third degree raised a
// semitone, 2.9 the fourth lowered one).
export const d2m = (deg, root, scale) => {
  const sd = Math.round(deg), acc = Math.round((deg - sd) * 10 * 1e6) / 1e6;
  const n = scale.length, o = Math.floor(sd / n);
  return root + scale[((sd % n) + n) % n] + 12 * o + acc;
};
const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);


// One note of a species voice: the synth parameters for its material.
// o: { light, td (tide), dim (distance darkening), wet(r) (distance reverb), k, rr }.
export function noteParams(v, midi, dur, amp, o) {
  const { light, td, dim, wet, k, rr } = o;
  let p;
  switch (v.mat) {
    case 'cplx': p = { freq: midicps(midi), amp: amp * rr(0.7, 1), ratio: v.ratio, index: v.index * (0.5 + td), fold: v.fold * (0.6 + 0.6 * light),
      dec: (0.12 + 0.25 * v.dec) * (dur > 0.3 ? 1.5 : 1), bright: v.bright * (0.4 + 0.6 * light) * dim, rev: wet(0.22), dly: 0.12 }; break;
    case 'tine': p = { freq: midicps(midi), amp: amp * rr(0.7, 1), dec: 0.8 + v.dec, bright: v.bright * dim, rev: wet(0.28), dly: 0.14 }; break;
    // the swell's bloom is long, bright and folded: it sits lower and darker than the rest, or it drowns them out
    case 'swell': p = { freq: midicps(midi), amp: amp * 0.7, ratio: v.ratio, index: v.index * 0.7, fold: v.fold * 0.6, atk: dur * 0.45, hold: dur * 0.5, rel: dur * 2,
      bright: Math.min(0.6, v.bright * (0.25 + 0.5 * light)) * dim, rev: wet(0.35), dly: 0.06 }; break;
    case 'breath': p = { freq: midicps(midi), amp, atk: dur * 0.5, sus: dur * 0.4, rel: dur * 1.5, bright: v.bright * 0.6 * dim, glide: [0, 0.03, -0.03][Math.min(2, Math.floor(rr(0, 3)))], rev: wet(0.4), dly: 0.08 }; break;
    case 'glass': p = { freq: midicps(midi), amp, atk: dur * 0.4, sus: dur * 0.6, rel: dur * 1.6, bright: Math.min(1.2, v.bright * (0.5 + light)) * dim, rev: wet(0.5), dly: 0.04 }; break;
    case 'pluck': p = { freq: midicps(midi), amp: amp * rr(0.75, 1), dec: (0.35 + 0.8 * v.dec) * (dur > 0.5 ? 1.4 : 1), bright: v.bright * dim,
      coef: 0.12 + 0.45 * (1 - v.bright) + 0.2 * (1 - light), rev: wet(0.2), dly: 0.1 }; break;
    case 'bite': p = { freq: midicps(midi), amp: amp * rr(0.7, 1), dec: 0.25 + 0.25 * v.dec, bright: v.bright * dim, rev: wet(0.12) }; break;
    case 'wood': p = { freq: midicps(midi), amp: amp * rr(0.7, 1), dec: 0.35 + 0.3 * v.dec, bright: v.bright * dim, rev: wet(0.18) }; break;
    default: p = null;
  }
  return p;
}

function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Conductor {
  constructor(engine, { seed = 1 } = {}) {
    this.eng = engine; this.sr = engine.sr;
    this.rnd = mulberry32(seed >>> 0);
    this.time = 0; this.stepN = 0; this.nextStep = 0.1;
    this.tempo = 1; this.step = STEP;
    this.field = new Field(this);
    this.post = null; // messages back to the page (the worklet sets this)
    this.queue = [];
    this.world = { light: 0.6, tide: 0.5 };
    this.nodeN = 0;
    this.setEra(eraMusic('The First Tides'), true);
    this.score = new Score(this);
    engine.master.p.gain = 1.6;
    this.sea = this.swap(0, 'sea', this.seaChord(this.root), 0);
    this.drone = this.swap(0, 'drone', { amp: 0, note: this.root - 12 }, 0);
    engine.spawn('swarm', {}, 'swarm');
    this.nextWave = 2;
  }
  seaChord(r) { return { amp: 0.09, surf: 0.45, sing: 1.3, f1: r - 12, f2: r, f3: r + 7, f4: r + 14, f5: r + 19 }; }
  // A persistent node changes pitch by fading a new one in over the old (never a glide).
  swap(t, def, params, fadeTime, old = null) {
    const id = def + ++this.nodeN;
    this.at(t, def, { ...params, fade: fadeTime ? 0 : 1, fadeTime }, id);
    if (fadeTime) this.setAt(t, id, { fade: 1 });
    if (old) { this.setAt(t, old, { fade: 0, fadeTime }); this.queue.push({ t: t + fadeTime * 1.2, free: old }); }
    return id;
  }
  // the music follows the simulation's speed
  setTempo(tf) { if (tf > 0 && Math.abs(tf - this.tempo) > 1e-3) { this.tempo = tf; this.step = STEP / tf; } }

  setEra(era, now = false) {
    this.era = era;
    if (now) {
      this.root = era.root + (era.fx.shift || 0);
      [this.scale, this.pivots] = MODES[era.mode];
      this.pivot = 0;
    }
  }

  // ── messages from the page ─────────────────────────────────────────────────
  message(m) {
    if (m.type === 'world') Object.assign(this.world, m.world);
    else if (m.type === 'listen') this.field.listen(m);
    else if (m.type === 'slots') this.field.slotsMsg(m);
    else if (m.type === 'audition') this.field.audition(m);
    else if (m.type === 'fieldGain') Object.assign(this.field.gain, m.gain);
    else if (m.type === 'era') this.pendingEra = m.name;
    else if (m.type === 'open') this.pendingOpen = true;
    else if (m.type === 'reset') {
      this.field.slots.clear(); this.pendingEra = null; this.switchAt = null; this.pendingOpen = false;
      this.setEra(eraMusic('The First Tides'), true); this.score.setEra(this.era);
      this.sea = this.swap(this.time, 'sea', this.seaChord(this.root), 10, this.sea);
    }
  }

  // ── scheduling ─────────────────────────────────────────────────────────────
  at(t, def, params, id) { this.queue.push({ t, def, params, id }); }
  setAt(t, id, params) { this.queue.push({ t, set: id, params }); }

  // render one 64-sample block
  render(outL, outR) {
    const t1 = this.time + BS / this.sr;
    while (this.nextStep < t1 + this.step) { if (this.stepN % 16 === 0) this.bar(this.nextStep); this.nextStep += this.step; this.stepN++; }
    if (this.queue.length) {
      this.queue.sort((a, b) => a.t - b.t);
      let i = 0;
      for (; i < this.queue.length && this.queue[i].t <= t1; i++) {
        const q = this.queue[i];
        if (q.set) this.eng.set(q.set, q.params); else if (q.free) this.eng.free(q.free); else this.eng.spawn(q.def, q.params, q.id);
      }
      if (i) this.queue.splice(0, i);
    }
    this.eng.block(outL, outR);
    this.time = t1;
  }

  // once per bar: climate, harmony, the sea, the waves, the drone and the score
  bar(ts) {
    const W = this.world;
    if (this.pendingEra) { // the currents churn: a bridge to the new key
      const nx = eraMusic(this.pendingEra, this.era.root);
      this.pendingEra = null;
      this.nextEra = nx; this.switchAt = ts + 45;
      this.score.bridge(ts, nx, nx.root + (nx.fx.shift || 0), MODES[nx.mode][0], this.switchAt);
    }
    // a new world opens with its era's song, unless an era change is already under way
    if (this.pendingOpen) { this.pendingOpen = false; if (this.switchAt == null) this.score.overture(ts); }
    if (this.switchAt != null && ts >= this.switchAt) {
      this.setEra(this.nextEra, true); this.switchAt = null;
      this.sea = this.swap(ts, 'sea', this.seaChord(this.root), 12, this.sea);
      this.score.arrive(ts, this.era);
    }
    const bar = Math.round(this.stepN / 16);
    if (bar % 12 === 0) this.pivot = this.pivots[(bar / 12) % this.pivots.length | 0];
    const fx = this.era.fx, lvl = fx.level || 1;
    const light = clamp(W.light * (fx.bright || 1), 0, 1.2), td = clamp(W.tide * (fx.tide || 1), 0, 1);
    const seaDim = 1 - 0.45 * this.field.z; // zoomed in, the open water steps back
    this.setAt(ts, this.sea, { tide: td, light, amp: 0.09 * (fx.sea || 1) * lvl * seaDim });
    const note = d2m(this.pivot, this.root, this.scale) - 12;
    if (note !== this.droneNote) { this.drone = this.swap(ts, 'drone', { amp: 0.048 * lvl * seaDim, note, light }, 6, this.drone); this.droneNote = note; }
    this.setAt(ts, this.drone, { light, amp: 0.048 * lvl * seaDim });
    // waves wash in now and then, more often and stronger with the tide; heard best from afar
    if (ts >= this.nextWave) {
      const far = 1 - this.field.z, dur = 5 + 4 * this.rnd();
      this.at(ts + this.rnd() * 16 * this.step, 'wave', { amp: 0.32 * lvl * (0.35 + 0.65 * far) * (0.5 + 0.5 * td), dur, bright: 0.3 + 0.4 * clamp(light, 0, 1), pan: (this.rnd() - 0.5) * 1.4, rev: 0.45 });
      this.nextWave = ts + dur * 0.6 + (14 - 9 * td) * (0.5 + this.rnd());
    }
    this.score.bar(ts, bar);
  }
}
