// The conductor turns the simulation's census into notes. It is the musical logic of the
// SuperCollider soundtrack (motifs, rhythms, the sea, glint, sparks, climate eras), driven
// by tidemote's real species instead of a model, plus a spatial mix: species in view (or
// selected) sound near; everything else recedes into a darker, wetter, quieter distance.
// Runs inside the AudioWorklet; times are in seconds of audio rendered.

import { BS } from './ugens.js';
import { PRODUCERS } from './mapping.js';
import { Field } from './field.js';

export const STEP = 0.18; // one sixteenth: tidemote's soundtrack pulse
const MAX_VOICES = 9;

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
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export function eraMusic(name, prevRoot) {
  const w = String(name || '').split(' ');
  if (!name || name === 'The First Tides' || !ADJ[w[1]]) return { name: name || 'The First Tides', mode: 'lydian', root: 50, fx: {} };
  const roots = ROOTS.filter((r) => r !== prevRoot);
  return { name, mode: ADJ[w[1]], root: roots[hashStr(name) % roots.length], fx: NOUN[w[2]] || {} };
}

export const d2m = (deg, root, scale) => { const n = scale.length, o = Math.floor(deg / n); return root + scale[((deg % n) + n) % n] + 12 * o; };
const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;


// One note of a species voice: the synth parameters for its material (shared by the score and
// the field mix). o: { light, td (tide), dim (distance darkening), wet(r) (distance reverb), k, rr }.
export function noteParams(v, midi, dur, amp, o) {
  const { light, td, dim, wet, k, rr } = o;
  let p;
  switch (v.mat) {
    case 'cplx': p = { freq: midicps(midi), amp: amp * rr(0.7, 1), ratio: v.ratio, index: v.index * (0.5 + td), fold: v.fold * (0.6 + 0.6 * light),
      dec: (0.12 + 0.25 * v.dec) * (dur > 0.3 ? 1.5 : 1), bright: v.bright * (0.4 + 0.6 * light) * dim, rev: wet(0.22), dly: 0.12 }; break;
    case 'tine': if (v.arch === 'crawler' && (k & 1)) midi += 12;
      p = { freq: midicps(midi), amp: amp * rr(0.7, 1), dec: 0.8 + v.dec, bright: v.bright * dim, rev: wet(0.28), dly: 0.14 }; break;
    case 'swell': p = { freq: midicps(midi), amp, ratio: v.ratio, index: v.index * 0.7, fold: v.fold * 0.8, atk: dur * 0.45, hold: dur * 0.5, rel: dur * 2,
      bright: Math.min(1.2, v.bright * (0.5 + light)) * dim, rev: wet(0.35), dly: 0.06 }; break;
    case 'breath': p = { freq: midicps(midi), amp, atk: dur * 0.5, sus: dur * 0.4, rel: dur * 1.5, bright: v.bright * 0.6 * dim, glide: [0, 0.03, -0.03][Math.min(2, Math.floor(rr(0, 3)))], rev: wet(0.4), dly: 0.08 }; break;
    case 'glass': p = { freq: midicps(midi), amp, atk: dur * 0.4, sus: dur * 0.6, rel: dur * 1.6, bright: Math.min(1.2, v.bright * (0.5 + light)) * dim, rev: wet(0.5), dly: 0.04 }; break;
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
    this.mode = 'field'; // 'field': the sound of what is in view; 'score': the species score; 'both'
    this.field = new Field(this);
    this.queue = [];
    this.species = new Map();
    this.world = { glint: 0.1, husk: 0.08, light: 0.6, tide: 0.5, season: 0.55, zoom: 0, selected: null, focus: false, level: 1 };
    this.setEra(eraMusic('The First Tides'), true);
    engine.master.p.gain = 1.6;
    const r = this.root;
    engine.spawn('sea', { amp: 0.09, surf: 0.45, sing: 1.3, f1: r - 12, f2: r, f3: r + 7, f4: r + 14, f5: r + 19 }, 'sea');
    engine.spawn('drone', { amp: 0, note: r - 12 }, 'drone');
  }
  rr(lo, hi) { return lo + (hi - lo) * this.rnd(); }
  // the music follows the simulation's speed
  setTempo(tf) { if (tf > 0 && Math.abs(tf - this.tempo) > 1e-3) { this.tempo = tf; this.step = STEP / tf; } }
  choose(a) { return a[Math.floor(this.rnd() * a.length)]; }

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
    if (m.type === 'world') this.setWorld(m);
    else if (m.type === 'listen') this.field.listen(m);
    else if (m.type === 'slots') this.field.slotsMsg(m);
    else if (m.type === 'mode') this.mode = m.mode;
    else if (m.type === 'fieldGain') Object.assign(this.field.gain, m.gain);
    else if (m.type === 'tempo') this.setTempo(m.tempo);
    else if (m.type === 'spark') { if (this.mode !== 'field') this.pendingSparks = (this.pendingSparks || []).concat([m]); }
    else if (m.type === 'era') this.pendingEra = m.name;
    else if (m.type === 'reset') { this.species.clear(); this.field.slots.clear(); this.pendingEra = null; this.switchAt = null; this.setEra(eraMusic('The First Tides'), true); this.eng.set('sea', { lag: 20, f1: 38, f2: 50, f3: 57, f4: 64, f5: 69 }); }
  }
  setWorld(m) {
    Object.assign(this.world, m.world);
    const seen = new Set();
    for (const s of m.species) {
      seen.add(s.id);
      let e = this.species.get(s.id);
      if (!e) { if (!s.voice) continue; e = { id: s.id, v: s.voice, w: 0, q: s.q, x: s.x, k: 0, tn: 0, born: this.time }; this.species.set(s.id, e); }
      if (s.voice) e.v = s.voice;
      e.wT = s.p; e.qT = s.q; e.xT = s.x; e.inView = s.inView; e.sel = s.sel; e.gone = false;
    }
    for (const e of this.species.values()) if (!seen.has(e.id)) { e.wT = 0; e.gone = true; }
  }

  // ── scheduling ─────────────────────────────────────────────────────────────
  at(t, def, params) { this.queue.push({ t, def, params }); }
  setAt(t, id, params) { this.queue.push({ t, set: id, params }); }

  // render one 64-sample block
  render(outL, outR) {
    const t1 = this.time + BS / this.sr;
    while (this.nextStep < t1 + this.step) { this.doStep(this.nextStep); this.nextStep += this.step; this.stepN++; }
    if (this.queue.length) {
      this.queue.sort((a, b) => a.t - b.t);
      let i = 0;
      for (; i < this.queue.length && this.queue[i].t <= t1; i++) {
        const q = this.queue[i];
        if (q.set) this.eng.set(q.set, q.params); else this.eng.spawn(q.def, q.params);
      }
      if (i) this.queue.splice(0, i);
    }
    this.eng.block(outL, outR);
    this.time = t1;
  }

  doStep(ts) {
    const W = this.world, fx = this.era.fx;
    // smooth presence, proximity and screen position (time constant ~1 s, ~0.4 s for proximity)
    const kw = 1 - Math.exp(-this.step / 1.2), kq = 1 - Math.exp(-this.step / 0.45);
    for (const e of this.species.values()) {
      e.w += ((e.wT ?? 0) - e.w) * kw; e.q += ((e.qT ?? 1) - e.q) * kq; e.x += ((e.xT ?? 0) - e.x) * kq;
      if (e.gone && e.w < 0.002) this.species.delete(e.id);
    }
    if (this.stepN % 16 === 0) this.bar(ts);
    if (this.mode === 'field') return;

    // the most present species are heard (a selected species always is)
    const list = [...this.species.values()].filter((e) => e.w > (PRODUCERS.has(e.v.arch) ? 0.004 : 0.008) || e.sel);
    list.sort((a, b) => (b.sel - a.sel) || (b.w - a.w));
    const aud = list.slice(0, MAX_VOICES);
    const wmax = aud.reduce((m, e) => Math.max(m, e.w), 0.04);
    const tEnd = ts + this.step, lvl = (fx.level || 1) * W.level * (this.mode === 'both' ? 0.6 : 1);
    aud.forEach((e, rank) => {
      const v = e.v;
      const near = clamp(e.sel ? 1 : e.q, 0, 1);
      const amp = Math.sqrt(Math.min(1, e.w / wmax)) * v.amp * lvl * (1 - rank * 0.05) * (0.2 + 0.8 * near) * (e.sel ? 1.4 : W.selected != null ? 0.75 : 1);
      const prob = (0.3 + 0.7 * e.w / (e.w + 0.04)) * (fx.dens || 1) * (0.55 + 0.45 * near);
      const pan = clamp(mix(v.pan + 0.25 * Math.sin((ts * 2 * Math.PI) / (47 / (fx.gyre || 1)) + e.id), e.x, W.zoom * (e.inView ? 1 : 0)), -0.9, 0.9);
      this.voice(e, ts, tEnd, amp, prob, near, pan);
    });
    for (const e of this.species.values()) if (!aud.includes(e)) e.tn = tEnd;
  }

  // one species' notes inside [ts, tEnd)
  voice(e, ts, tEnd, amp, prob, near, pan) {
    const v = e.v, W = this.world, fx = this.era.fx;
    const light = clamp(W.light * (fx.bright || 1), 0, 1.2), td = W.tide;
    const piv = PRODUCERS.has(v.arch) || v.arch === 'hunter' ? this.pivot : 0;
    const far = 1 - near;
    const space = { pan, rev: 0, dly: 0 };
    const wet = (r) => Math.min(0.95, r * (1 + 1.6 * far)), dim = 0.35 + 0.65 * near;
    if (e.tn < ts) e.tn = ts;
    if (v.arch === 'scavenger') {
      if (this.stepN % 4) { e.tn = tEnd; return; } // scattered once per beat, like the original's per-bar scatter
      const n = Math.min(4, Math.floor(e.w * W.husk * 140 + this.rnd() * 0.9 + 0.15));
      for (let i = 0; i < n; i++) {
        const deg = this.choose(v.seq) + 7, f = midicps(d2m(deg, this.root, this.scale)) * 2;
        this.at(ts + Math.floor(this.rnd() * 8) * (this.step / 2), v.mat, { freq: v.mat === 'tick' ? f * 2 : f, amp: amp * this.rr(0.4, 1), pan,
          dec: v.mat === 'tick' ? this.rr(0.02, 0.05) : this.rr(0.04, 0.09), rise: this.rr(1.3, 2.2), rev: wet(0.35), dly: 0.18 });
      }
      e.tn = tEnd; return;
    }
    const young = this.time - e.born < 8;
    while (e.tn < tEnd) {
      const dur = v.rate * this.step, k = e.k;
      if (this.rnd() < prob * (young ? 1.3 : 1)) {
        const line = v.arch === 'crawler' && (k & 1) ? v.seq2 : v.seq;
        const deg = line[k % line.length];
        let midi = d2m(deg + piv, this.root, this.scale) + 12 * v.oct;
        const p = noteParams(v, midi, dur, amp, { light, td, dim, wet, k, rr: (a, b) => this.rr(a, b) });
        if (p) {
          p.pan = pan;
          this.at(e.tn, v.mat, p);
          // reefs are bonded bodies: they sound as chords
          if (v.arch === 'reef') v.seq.slice(1).forEach((d, j) => this.at(e.tn + 0.04 * (j + 1), v.mat, { ...p, freq: midicps(d2m(deg + piv + d, this.root, this.scale) + 12 * v.oct) }));
        }
      }
      e.tn += dur; e.k = k + 1;
    }
  }

  // once per bar: climate, harmony, the sea and the drone, glint
  bar(ts) {
    const W = this.world;
    if (this.pendingEra) {
      const nx = eraMusic(this.pendingEra, this.era.root);
      this.pendingEra = null;
      const sh = nx.fx.shift || 0, r = nx.root + sh;
      this.nextEra = nx; this.switchAt = ts + 45;
      this.setAt(ts, 'sea', { lag: 40, f1: r - 12, f2: r, f3: r + 7, f4: r + 14, f5: r + 19 });
      this.setAt(ts, 'master', { toneLag: 20, tone: 2500 });   // the currents churn: the world dims
      this.at(ts + 1.5, 'breath', { freq: midicps(r - 12), amp: 0.35, atk: 9, sus: 10, rel: 14, glide: -0.25, bright: 0.25, rev: 0.6, pan: 0 }); // a long low call
    }
    if (this.switchAt != null && ts >= this.switchAt) {
      this.setEra(this.nextEra, true); this.switchAt = null;
      this.setAt(ts, 'master', { toneLag: 25, tone: 16000 });
    }
    const bar = Math.round(this.stepN / 16);
    if (bar % 12 === 0) this.pivot = this.pivots[(bar / 12) % this.pivots.length | 0];
    const fx = this.era.fx, lvl = (fx.level || 1) * W.level, br = fx.bright || 1;
    const light = clamp(W.light * br, 0, 1.2), td = clamp(W.tide * (fx.tide || 1), 0, 1);
    const seaDim = 1 - 0.3 * W.zoom; // zoomed in, the open water steps back a little
    this.setAt(ts, 'sea', { tide: td, light, amp: 0.09 * (fx.sea || 1) * lvl * seaDim });
    this.setAt(ts, 'drone', { note: d2m(this.pivot, this.root, this.scale) - 12, light, amp: 0.048 * lvl * seaDim });
    // glint sparkle: density from the glint around (what is in view, when zoomed in)
    const n = this.mode === 'field' ? 0 : Math.min(18, Math.floor(W.glint * 34 * (0.4 + td)) + (this.rnd() < 0.5 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      this.at(ts + Math.floor(this.rnd() * 16) * this.step + this.choose([0, this.step / 2]), 'glint', {
        freq: midicps(d2m(Math.floor(this.rnd() * 14), this.root, this.scale)) * this.choose([4, 4, 8]),
        amp: this.rr(0.1, 0.26) * lvl * (0.5 + W.season), dec: this.rr(0.05, 0.25), pan: this.rr(-0.9, 0.9), rev: 0.55, dly: 0.25,
      });
    }
    // sparks: glint quickening into a new lineage
    for (const s of this.pendingSparks || []) {
      const near = s.near ?? 1;
      for (let i = 0; i < 8; i++) this.at(ts + 0.4 + i * 0.09, 'glint', { freq: midicps(d2m(i + 2, this.root, this.scale)) * 4,
        amp: 0.035 * (1 - i * 0.06) * (0.25 + 0.75 * near), dec: 0.3, pan: clamp((s.pan ?? 0) + this.rr(-0.2, 0.2), -0.9, 0.9), rev: Math.min(0.95, 0.6 * (1 + far(near))), dly: 0.3 });
    }
    this.pendingSparks = null;
  }
}
const far = (near) => Math.min(0.9, 1 - near);
