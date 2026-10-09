// The field mix: the soundtrack as the sound of what is happening in view. Every few frames the
// page's GPU scan (LISTEN_WGSL) reports a sample of the living cells in view and the births,
// deaths, kills, grazing and glint that happened since the last scan, each with its screen
// position and exact time; this turns them into notes. Runs inside the AudioWorklet next to the
// conductor, whose harmony (era mode, root, pivot), sea and drone it shares.
//
// Every living cell sings: now and then it comes in on its species' motif (from its genome, see
// motif.js), more often when it moves. A species keeps time by its motif: a cell that sings joins
// at the motif's next note, in its rhythm, so a crowd assembles the phrase between them. A
// schooling species keeps one clock and sings in unison; the others each keep their own and
// the phrase goes round in canon. Where only a few cells are heard each sings a longer stretch,
// so a handful of cells still carries the whole song. A colony's β cells sing its second voice.
// Events are accents on top: a birth rings, a kill bites, grazing drips, a dying cell falls,
// the tide's charge shimmers.
//
// Loudness follows distance. The camera is a listener at a height proportional to the view's size:
// each sound is as loud as dRef / d, and a view d times wider holds d² times as many cells, so the
// summed power of a region depends only on how much is happening there. Zoomed in on a dozen
// cells, each is a clear voice; zoomed out, thousands of faint ones blur into a chorus, and a busy
// region is louder and denser than a calm one. Only a fair sample is played; each played note
// carries the power of the ones it stands for.
//
// From afar, the notes give way to the swarm: every cell sound in view becomes one grain, a soft
// note of its species' motif, and thousands of them blur into a murmur. Distance is heard the way
// it is in air or water: far grains swell in slowly, ring long and lose their highs; diving in,
// their attacks sharpen and open until the swarm thins and the single voices step out of it.
// Close up the voices are held back a touch (CLOSE) and the sea and the score step back further,
// so diving in brings the place forward without a jump in level.

import { d2m, STEP, noteParams } from './conductor.js';
import { LISTEN } from './listen.js';

const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

const T = LISTEN.index;
// base amplitude of one sound heard from the reference distance
const AMP = { alive: 0.13, birth: 0.19, mutation: 0.09, spark: 0.045, starved: 0.13, old: 0.11, killed: 0.2, eaten: 0.075, charged: 0.04, rustle: 0.035 };
// playing grid (in steps) and how many notes of a type may share one grid point (calm water and
// far views adjust these, see snap)
const GRID = { starved: 2, old: 4, killed: 1, eaten: 0.5 };
const PER_SLOT = { starved: 1, old: 1, killed: 1, eaten: 2 };
const LATENCY = 0.22; // seconds: one scan interval plus scheduling headroom
const BG_GAIN = 0.05; // the world outside the view, relative to a sound at the reference distance
// Level riding: the field knows each scan's notes before it plays them, so it compresses their
// summed power (sum of amp^2 per second) around P_REF at RATIO:1, within GAIN_RANGE, smoothly.
// Busy places stay louder and denser than calm ones, but not by 10 dB.
const P_REF = 0.05, RATIO = 2.5, GAIN_RANGE = [0.3, 2];
// When the audio thread is crowded, the least important sounds are skipped first.
const CROWDED = 70, FULL = 92;
const MINOR = new Set(['charged', 'eaten', 'rustle']);
// The swarm: grains per second a band plays at most (beyond that a grain stands for several, so
// the activity stays audible as grains), and the level of one grain relative to a note.
const SWARM_MAX = 150, GRAIN = 1.75;
// level of the single voices fully zoomed in, relative to afar
const CLOSE = 0.9;
// seconds the picked species takes to ease back into the mix after its greeting
const FOCUS_FADE = 2.5;
// how much of the view is heard as single voices (the rest as the swarm), by closeness z
export const soloShare = (z) => { const x = clamp((z - 0.1) / 0.5, 0, 1); return x * x * (3 - 2 * x); };

// how fast the music moves at a given simulation speed (sim seconds per second)
export function tempoFor(speed) {
  if (!(speed > 0)) return 1;
  return speed <= 1 ? Math.max(0.25, speed) : Math.min(4, 1 + 0.6 * Math.log2(speed));
}

// how often (per second of music) one living cell sings: its species' pace, quicker when it moves
const singRate = (v, spd, step) => (v ? 1 / (Math.max(1, v.rate) * step * 4) : 0.15) * (0.55 + 0.9 * Math.min(1, spd / 0.6));

export class Field {
  constructor(cond) {
    this.c = cond; this.rnd = cond.rnd;
    this.slots = new Map(); // species slot -> { serial, v, pop, k }
    this.taken = new Map(); // grid point key -> notes placed there
    this.z = 0; this.gd = 1; this.act = 0.3; this.speed = 1;
    this.gain = {}; // per-type gain overrides (tuning)
    this.agc = 1; this.power = P_REF; this.plan = null;
    this.swarmK = -1; this.bands = null; this.heard = new Map(); // species slot -> [grains per second, their power], smoothed over scans
    this.sang = []; // notes sung since the last report to the page: [slot, seconds from now, note, line, scan, record, seconds it sounds]
    this.duckUntil = 0; // an audition is playing: the field steps back
    this.selPrev = -1; this.greetFor = -1; this.focusEnd = -1e9; // a newly picked species: see greet
    this.litKey = ''; this.litEnd = -1e9; // a new Lab highlight: brought forward briefly, like a pick
  }

  // Picking a species greets it: its song plays once, close and clear, while the rest of the
  // field steps back; its own cells stay forward until the song ends, then ease back into the
  // mix over FOCUS_FADE seconds (they are not held forward for as long as it stays picked).
  greet(slot) {
    const v = this.slots.get(slot)?.v;
    if (!v) { this.greetFor = slot; return; } // its voice comes with the next census
    this.greetFor = -1;
    this.focusEnd = this.phrase(v, this.c.time + LATENCY, { amp: 0.13, slot, times: 1 });
  }
  // how far forward the picked species is: 1 while its greeting plays, then down to 0
  focus() { return clamp(1 - (this.c.time - this.focusEnd) / FOCUS_FADE, 0, 1); }
  rr(lo, hi) { return lo + (hi - lo) * this.rnd(); }

  slotsMsg(m) {
    for (const s of m.slots) {
      let e = this.slots.get(s.slot);
      if (!e || e.serial !== s.serial) { e = { serial: s.serial, v: null, pop: 0 }; this.slots.set(s.slot, e); }
      if (s.voice) e.v = s.voice;
      e.pop = s.pop;
    }
    if (m.all) { const live = new Set(m.slots.map((s) => s.slot)); for (const k of this.slots.keys()) if (!live.has(k)) this.slots.delete(k); }
  }

  // one scan's worth of events and living cells
  listen(m) {
    this.plan = [];
    this.collect(m);
    const plan = this.plan; this.plan = null;
    const wall = Math.max(1e-3, m.window / Math.max(m.speed, 1e-6));
    let P = 0;
    for (const n of plan) P += n[2] * n[2];
    for (const r of this.crowd.values()) P += r * wall * (AMP.alive * this.gd) ** 2; // the swarm's grains count as notes
    this.power += (P / wall - this.power) * 0.3;
    const target = clamp(Math.pow(P_REF / Math.max(this.power, 1e-9), (1 - 1 / RATIO) / 2), GAIN_RANGE[0], GAIN_RANGE[1]);
    this.agc += (target - this.agc) * 0.2;
    const close = 1 - (1 - CLOSE) * this.z;
    // cells of a species coming in on the same note of its motif sing it as one, louder note
    const unison = new Map();
    for (const n of plan) {
      if (n[0] !== 'alive' && n[0] !== 'birth') continue;
      const o = n[3], e = this.slots.get(o.slot), v = e && e.v;
      if (!v) continue;
      const line = o.role === 1 && v.motif.voice2 ? v.motif.voice2 : v.motif.notes;
      o.on = this.onset(v.motif, line, n[1], o.idb);
      n[1] = o.on.t;
      if (n[0] !== 'alive') continue;
      const key = `${o.slot}:${line === v.motif.notes ? 0 : 1}:${o.on.beat}`, u = unison.get(key);
      if (!u) { unison.set(key, n); n[4] = n[2] * n[2]; continue; }
      u[4] += n[2] * n[2]; u[3].frag = Math.max(u[3].frag || 1, o.frag || 1); n[2] = 0;
    }
    for (const u of unison.values()) u[2] = Math.min(Math.sqrt(u[4]), 2.2 * u[2]);
    const duck = this.c.time < this.duckUntil ? 0.3 : 1;
    for (const n of plan) if (n[2] > 0) this.play(n[0], n[1], n[2] * this.agc * close * duck, n[3]);
    this.swarm();
    this.report();
  }

  // tell the page which notes are about to sound (its song panel and the cells that sing them)
  report() {
    if (!this.sang.length || !this.c.post) { this.sang.length = 0; return; }
    this.c.post({ type: 'sang', notes: this.sang });
    this.sang = [];
  }

  collect(m) {
    const c = this.c, now = c.time;
    this.speed = m.speed; this.z = m.z; this.gd = m.gd;
    this.act += (m.act - this.act) * 0.25;
    // the pulse quickens a little in warm water and slows in cold
    c.setTempo(tempoFor(m.speed) * (1 + 0.06 * c.warm));
    const wall = Math.max(1e-3, m.window / Math.max(m.speed, 1e-6));
    const S = LISTEN.stride, ev = m.ev, n = ev.length / S;
    const comp = new Float32Array(8);
    for (let t = 0; t < 8; t++) comp[t] = Math.min(12, Math.sqrt(m.inView[t] / Math.max(1, m.recorded[t])));
    const W = c.world, light = clamp(W.light, 0, 1.2), td = clamp(W.tide, 0, 1);
    const far = 1 - this.z;
    const dim = 0.4 + 0.6 * this.z;
    const wet = (r) => Math.min(0.95, r * (1 + 1.4 * far));
    const lit = m.lit ? new Set(m.lit) : null;
    const solo = soloShare(this.z), toSwarm = (1 - solo) / wall;
    this.crowd = new Map(); // swarm grains per second by species slot
    const crowd = (slot, r) => this.crowd.set(slot, (this.crowd.get(slot) || 0) + r);
    const sel = m.selSlot;
    if (sel !== this.selPrev) { this.selPrev = sel; this.greetFor = -1; if (sel >= 0) this.greet(sel); else this.focusEnd = -1e9; }
    else if (sel >= 0 && this.greetFor === sel) this.greet(sel);
    const F = sel >= 0 ? this.focus() : 0, near = F > 0.3;
    // a highlight, too, comes forward only for a moment and then eases back: neither a pick nor a
    // highlight changes the mix for as long as it lasts
    const litKey = m.lit ? [...m.lit].sort((a, b) => a - b).join(',') : '';
    if (litKey !== this.litKey) { this.litKey = litKey; this.litEnd = litKey ? c.time + 1.5 : -1e9; }
    const LF = clamp(1 - (c.time - this.litEnd) / FOCUS_FADE, 0, 1);
    const focusGain = (slot) => {
      let g = 1;
      if (sel >= 0) g *= slot === sel ? 1 + 1.2 * F : 1 - 0.5 * F;
      if (lit && slot >= 4 && LF > 0) g *= lit.has(slot) ? 1 + 0.3 * LF : 1 - 0.5 * LF;
      return g;
    };
    // the scan sampled the picked species' cells in full and the rest at a fraction: weight them
    // back to their real share, so after its greeting the species sings as much as any other
    const sampled = m.sampled && m.sampled.sel >= 0 ? m.sampled : null;
    const space = (slot, x) => ({ pan: clamp((x * 2 - 1) * 0.85, -0.9, 0.9), light, td, dim: near && slot === sel ? 1 : dim, wet: near && slot === sel ? (r) => r : wet });

    // living cells: how many notes this window, and which sampled cells sing them
    const alive = [], perSp = new Map();
    let rSum = 0, wSum = 0; // wSum: the sample's size counted at the others' sampling rate
    for (let i = 0; i < n; i++) if (ev[i * S] === 8) {
      const o = i * S, e = this.slots.get(ev[o + 1]), w = sampled && ev[o + 1] === sampled.sel ? Math.min(1, sampled.keep) : 1;
      const r = singRate(e && e.v, ev[o + 5], c.step) * (ev[o + 1] === sel ? 1 + 0.6 * F : 1) * w;
      alive.push([o, r, i]); rSum += r; wSum += w;
      perSp.set(ev[o + 1], (perSp.get(ev[o + 1]) || 0) + r);
    }
    if (alive.length) {
      const nView = m.inView[8], want = (nView / Math.max(wSum, 1e-6)) * rSum * wall; // notes the whole view would sing
      for (const [o, r] of alive) crowd(ev[o + 1], ((want * r) / rSum) * toSwarm * focusGain(ev[o + 1]) ** 2);
      const cap = (4 + 4 * Math.min(1, this.act) + 10 * Math.min(1, want / (30 * wall))) * wall; // notes we play: more where more is going on
      const play = Math.min(want * solo, cap), g0 = AMP.alive * this.gd * Math.min(14, Math.sqrt((want * solo) / Math.max(play, 1e-9)));
      // where a species' cells come in less than once a phrase, each sings a stretch of it:
      // the same notes per second, gathered into phrases
      const frag = new Map();
      for (const [slot, r] of perSp) {
        const v = this.slots.get(slot)?.v;
        if (!v) continue;
        const perCycle = ((play * r) / rSum / wall) * v.motif.cycle * c.step;
        frag.set(slot, clamp(Math.round(v.motif.notes.length / Math.max(perCycle, 0.25)), 1, Math.min(6, v.motif.notes.length)));
      }
      for (const [o, r, i] of alive) {
        const slot = ev[o + 1], F = frag.get(slot) || 1;
        if (this.rnd() >= (play * r) / rSum / F) continue;
        const energy = ev[o + 4];
        const g = g0 * (0.6 + 0.4 * Math.min(1, energy)) * focusGain(slot);
        this.play('alive', now + LATENCY + this.rnd() * wall, g, { slot, ...space(slot, ev[o + 2]), hue: ev[o + 6], idb: ev[o + 7], spd: ev[o + 5], role: ev[o + 8], frag: F, rec: [m.seq, i] });
      }
    }
    // events
    for (let i = 0; i < n; i++) {
      const o = i * S, ti = ev[o];
      if (ti === 8) continue;
      const type = LISTEN.types[ti], slot = ev[o + 1];
      let t = now + LATENCY - ev[o + 4] / Math.max(m.speed, 1e-6);
      if (t < now + 0.01) t = now + 0.01 + 0.03 * this.rnd();
      // from afar, every event joins the grains of its species; only life sparking from glint
      // still rings out
      const rare = type === 'spark';
      if (!rare && slot >= 0) crowd(slot, comp[ti] ** 2 * toSwarm);
      const g = AMP[type] * this.gd * comp[ti] * focusGain(slot) * Math.sqrt(rare ? 0.3 + 0.7 * solo : solo);
      this.play(type, t, g, { slot, ...space(slot, ev[o + 2]), hue: ev[o + 6], idb: ev[o + 7], spd: ev[o + 5], role: ev[o + 8], rec: [m.seq, i] });
    }
    this.background(m, wall, light, td);
    this.rustle(m, wall);
    // the sea moves with what moves in view
    c.eng.set(c.sea, { surf: 0.3 + 0.5 * clamp(this.act, 0, 1) });
    if (this.taken.size > 400) for (const [k, v] of this.taken) if (v.t < now) this.taken.delete(k);
  }

  // cells sing on their motifs' notes: at most a few notes may start on one step
  beatCap(type, t, o) {
    const key = type + (o.on ? o.on.beat : Math.round(t / this.c.step)), e = this.taken.get(key);
    const cap = type === 'alive' ? 4 : 2;
    if (e) { if (e.n >= cap) return -1; e.n++; } else this.taken.set(key, { n: 1, t });
    return t;
  }

  // snap to the playing grid; -1 if that grid point is already full for this type
  snap(type, t) {
    const gs = GRID[type];
    if (!gs) return t;
    const step = this.c.step * gs;
    const q = Math.ceil(t / step) * step, key = type + Math.round(q / step);
    const e = this.taken.get(key);
    if (e) { if (e.n >= PER_SLOT[type]) return -1; e.n++; } else this.taken.set(key, { n: 1, t: q });
    return q;
  }

  // Where in its species' motif a cell singing at time t comes in: the motif's next note on the
  // cell's clock. A schooling species shares one clock; otherwise a cell's clock is offset by
  // whole units (fewer cells keep the common one the less the species schools).
  onset(m, line, t, idb = 0) {
    const c = this.c, b = c.stepN + (t - c.nextStep) / c.step;
    const h = (idb * 0.6180339887) % 1;
    const off = h < m.sync ? 0 : Math.floor(((h - m.sync) / (1 - m.sync)) * (m.cycle / m.unit)) * m.unit;
    const p = (((b - off) % m.cycle) + m.cycle) % m.cycle;
    let j = line.findIndex((nt) => nt.at >= p - 1e-6), wait;
    if (j < 0) { j = 0; wait = m.cycle - p + line[0].at; } else wait = line[j].at - p;
    return { j, t: t + wait * c.step, beat: Math.round(b + wait) };
  }

  // A species sings: from the motif note it comes in on, as many notes as it was given (o.frag).
  // Returns the first note's MIDI pitch, or null.
  speciesNote(slot, t, g, o) {
    const c = this.c, e = this.slots.get(slot), v = e && e.v;
    const { root, scale } = c, piv = c.pivot;
    if (!v) { // a species the census has not described yet: a plain note from its colour
      c.at(t, 'tine', { freq: midicps(d2m((Math.floor(o.hue * 10) % 8) + piv, root, scale) + 12), amp: g * 0.8, dec: 0.9, bright: 0.5 * o.dim, pan: o.pan, rev: o.wet(0.3), dly: 0.1 });
      return null;
    }
    const m = v.motif, second = o.role === 1 && !!m.voice2, line = second ? m.voice2 : m.notes;
    const on = o.on || this.onset(m, line, t, o.idb);
    const F = Math.min(o.frag || 1, line.length);
    let first = null;
    for (let i = 0; i < F; i++) {
      const k = (on.j + i) % line.length;
      const dt = (((line[k].at - line[on.j].at) % m.cycle) + m.cycle) % m.cycle;
      const ts = on.t + dt * c.step;
      const midi = this.motifNote(v, line[k], ts, g * (second ? 0.6 : 1) * (i ? 0.85 : 1), o, k);
      if (first == null) first = midi;
      if (o.rec) this.sang.push([slot, ts - c.time, k, second ? 1 : 0, o.rec[0], o.rec[1], Math.min(10, line[k].dur * line[k].leg) * c.step]);
    }
    return first;
  }

  // One note of a motif as the species' instrument plays it, with its swing, rubato and grace note.
  motifNote(v, nt, t, g, o, k = 0) {
    const c = this.c, m = v.motif, { root, scale } = c, piv = c.pivot;
    if (m.swing && Math.round(nt.at / m.unit) % 2) t += m.swing * m.unit * c.step;
    if (m.rubato) t += (this.rnd() - 0.5) * m.rubato * m.unit * c.step;
    t = Math.max(t, c.time + 0.005);
    const midi = d2m(nt.deg + piv, root, scale) + 12 * v.oct, amp = g * nt.acc;
    if (nt.grace != null) {
      const lead = Math.min(0.09, 0.3 * m.unit * c.step);
      this.strike(v, d2m(nt.grace + piv, root, scale) + 12 * v.oct, Math.max(c.time + 0.005, t - lead), lead, amp * 0.45, o, k);
    }
    this.strike(v, midi, t, Math.min(10, nt.dur * nt.leg) * c.step, amp, o, k);
    return midi;
  }
  strike(v, midi, t, dur, amp, o, k) {
    const c = this.c;
    if (v.mat === 'drop' || v.mat === 'tick') { // scavengers: drops
      c.at(t, 'drop', { freq: midicps(midi + 12), amp: amp * 0.8, dec: this.rr(0.04, 0.09), rise: this.rr(1.3, 2.0), pan: o.pan, rev: o.wet(0.35), dly: 0.15 });
      return;
    }
    const p = noteParams(v, midi, dur, amp, { light: o.light, td: o.td, dim: o.dim, wet: o.wet, k, rr: (a, b) => this.rr(a, b), warm: this.c.warm });
    if (p) { p.pan = o.pan; c.at(t, v.mat, p); }
  }

  // A species' motif played whole from t0 (the song panel's play button, the gallery): its voice
  // heard alone and close, the second voice under it, while the field steps back. Returns its end.
  phrase(v, t0, { amp = 0.16, slot = null, times = 2 } = {}) {
    const c = this.c, m = v.motif, light = clamp(c.world.light, 0, 1.2), td = clamp(c.world.tide, 0, 1);
    const o = { pan: 0, light, td, dim: 1, wet: (r) => r };
    const reps = m.cycle * c.step > 5 ? 1 : times;
    for (let r = 0; r < reps; r++) {
      const base = t0 + r * m.cycle * c.step;
      for (const [line, li, a] of [[m.notes, 0, amp], [m.voice2 || [], 1, amp * 0.6]]) {
        line.forEach((nt, k) => {
          const ts = base + nt.at * c.step;
          this.motifNote(v, nt, ts, a, o, k);
          if (slot != null) this.sang.push([slot, ts - c.time, k, li, -1, -1, Math.min(10, nt.dur * nt.leg) * c.step]);
        });
      }
    }
    const end = t0 + reps * m.cycle * c.step;
    this.duckUntil = Math.max(this.duckUntil, end);
    return end;
  }

  // the song panel's play button: { slot (a tag for its notes), voice }
  audition(msg) {
    const c = this.c, end = this.phrase(msg.voice, c.time + 0.12, { slot: msg.slot });
    c.score.duckUntil = Math.max(c.score.duckUntil, end);
    this.report();
  }

  play(type, t0, g, o) {
    const c = this.c;
    if (this.plan) { this.plan.push([type, t0, g, o]); return; }
    if (this.gain[type] != null) g *= this.gain[type];
    const busy = c.eng.voices.length + c.queue.length;
    const cap = c.eng.maxVoices; // the worklet lowers this when the device can't keep up
    if (busy > Math.min(FULL, cap + 8) || (busy > Math.min(CROWDED, cap * 0.75) && (MINOR.has(type) || o.dim === 0.3))) return;
    const t = type === 'alive' || type === 'birth' ? this.beatCap(type, t0, o) : this.snap(type, t0);
    if (t < 0 || g < 1e-4) return;
    const { root, scale } = c, piv = c.pivot;
    switch (type) {
      case 'alive': this.speciesNote(o.slot, t, g, o); return;
      case 'birth': { // the species' note, rung with a bright overtone: a new cell
        const midi = this.speciesNote(o.slot, t, g * 0.7, o);
        const f = midicps((midi ?? d2m(Math.floor(o.hue * 7) + piv, root, scale)) + 24);
        c.at(t, 'glint', { freq: f, amp: g * 0.5, dec: 0.35, pan: o.pan, rev: o.wet(0.45), dly: 0.2 });
        return;
      }
      case 'mutation': { // a new species: a quick rising figure from its colour
        const base = Math.floor(o.hue * 7);
        for (let i = 0; i < 3; i++) c.at(t + i * c.step * 0.5, 'glint', { freq: midicps(d2m(base + i * 2 + piv, root, scale)) * 4, amp: g * (1 - i * 0.15), dec: 0.25, pan: o.pan, rev: o.wet(0.45), dly: 0.25 });
        return;
      }
      case 'spark': // life from glint: a shower of sparks
        for (let i = 0; i < 6; i++) c.at(t + i * 0.09, 'glint', { freq: midicps(d2m(i + 2, root, scale)) * 4, amp: g * (1 - i * 0.08), dec: 0.3, pan: clamp(o.pan + this.rr(-0.15, 0.15), -0.9, 0.9), rev: o.wet(0.55), dly: 0.3 });
        return;
      case 'starved': // a quiet fall
        c.at(t, 'wood', { freq: midicps(d2m(-(o.idb % 4) + piv, root, scale) - 12), amp: g, dec: 0.5, bright: 0.45 * o.dim, pan: o.pan, rev: o.wet(0.3) });
        return;
      case 'old': // a long life ends: a low bell
        c.at(t, 'tine', { freq: midicps(d2m((o.idb & 1 ? 4 : 0) + piv, root, scale) - 12), amp: g, dec: 2.6, bright: 0.35 * o.dim, pan: o.pan, rev: o.wet(0.4), dly: 0.1 });
        return;
      case 'killed': // predation
        c.at(t, 'bite', { freq: midicps(d2m((o.idb % 3) * 2 + piv, root, scale) - 12), amp: g, dec: 0.3, bright: (0.4 + 0.5 * o.hue) * o.dim, pan: o.pan, rev: o.wet(0.15) });
        c.at(t, 'tick', { freq: 2600 + 1400 * o.hue, amp: g * 0.5, dec: 0.025, pan: o.pan, rev: o.wet(0.2), dly: 0.05 });
        return;
      case 'eaten': // grazing and scavenging: water drops
        c.at(t, 'drop', { freq: midicps(d2m(7 + (o.idb % 8), root, scale)) * 2, amp: g, dec: this.rr(0.035, 0.08), rise: this.rr(1.3, 2.1), pan: o.pan, rev: o.wet(0.3), dly: 0.12 });
        return;
      case 'rustle': { // something swimming past: a soft stir of water, not a whoosh
        const f0 = this.rr(300, 1200), up = this.rnd() < 0.5;
        c.at(t, 'rustle', { f0, f1: f0 * (up ? this.rr(1.15, 1.5) : this.rr(0.65, 0.85)), rq: this.rr(0.35, 0.7),
          atk: this.rr(0.06, 0.15), dec: this.rr(0.2, 0.45) / Math.sqrt(c.tempo), amp: g, pan: o.pan, rev: Math.min(0.9, 0.35 + 0.5 * (1 - this.z)), dly: 0.04 });
        return;
      }
      case 'charged': // the tide charging silt into glint: a faint shimmer
        c.at(t, 'glint', { freq: midicps(d2m(o.idb % 14, root, scale)) * (o.idb & 32 ? 8 : 4), amp: g * (0.5 + 0.5 * o.td), dec: this.rr(0.04, 0.2), pan: o.pan, rev: o.wet(0.55), dly: 0.25 });
    }
  }

  // The swarm: the species heard most get bands (a bigger share, more bands: successive notes of
  // its motif), each playing its share of grains. Bands are dealt out once a bar; each walks its
  // motif at its own pace (3 to 6 steps a note), so the crowd never moves in step.
  swarm() {
    const c = this.c, now = c.time, K = Math.floor(now / (16 * c.step));
    // each scan samples only some of the cells in view: smooth what each species sings over scans
    // (its power too, heard from where the grains were, so a zoom does not carry them along)
    for (const [s, h] of this.heard) { h[0] *= 0.85; h[1] *= 0.85; if (h[0] < 0.01 && !this.crowd.has(s)) this.heard.delete(s); }
    const g2 = (AMP.alive * this.gd) ** 2;
    for (const [s, r] of this.crowd) { const h = this.heard.get(s) || [0, 0]; h[0] += 0.15 * r; h[1] += 0.15 * r * g2; this.heard.set(s, h); }
    const sp = [...this.heard].map(([s, h]) => [s, h[0]]).filter(([s, r]) => r > 0 && this.slots.get(s)?.v).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const tot = sp.reduce((a, x) => a + x[1], 0);
    if (K !== this.swarmK || !this.bands) { // assign bands
      this.swarmK = K;
      const n = sp.map(([, r]) => Math.max(1, Math.round((8 * r) / Math.max(tot, 1e-9))));
      while (n.reduce((a, b) => a + b, 0) > 8) n[n.indexOf(Math.max(...n))]--;
      this.bands = [];
      sp.forEach(([s], i) => { for (let j = 0; j < n[i]; j++) this.bands.push({ s, j, of: n[i] }); });
    }
    const far = 1 - clamp(this.z / 0.6, 0, 1), light = clamp(c.world.light, 0, 1);
    const p = { atk: 0.012 + 0.07 * far, ring: (0.25 + 0.55 * far) * (0.8 + 0.4 * light), cut: 7000 - 5000 * far };
    const { root, scale } = c, piv = c.pivot;
    for (let b = 0; b < 8; b++) {
      const B = this.bands[b], h = B && this.heard.get(B.s), r = h ? h[0] / B.of : 0, e = B && this.slots.get(B.s);
      if (!e || !(r > 0)) { p['d' + (b + 1)] = 0; continue; }
      const seq = e.v.seq, d = Math.min(r, SWARM_MAX);
      const kb = Math.floor(now / (c.step * (3 + (b % 4))) + b * 0.37);
      p['f' + (b + 1)] = Math.min(96, d2m(seq[(kb + B.j) % seq.length] + piv, root, scale) + 12 * e.v.oct);
      p['d' + (b + 1)] = d;
      p['a' + (b + 1)] = GRAIN * this.agc * Math.sqrt(h[1] / B.of / d);
    }
    c.setAt(now + LATENCY, 'swarm', p);
  }

  // the rest of the world, outside the view: distant, dark, mostly reverb
  background(m, wall, light, td) {
    const c = this.c;
    const o = (slot) => ({ slot, pan: this.rr(-0.6, 0.6), hue: this.rnd(), idb: (this.rnd() * 256) | 0, spd: 0, light, td, dim: 0.3, wet: () => 0.9 });
    // only the chorus, new cells and the tide's shimmer carry that far; no percussion
    for (const [type, cap] of [['alive', 1], ['birth', 1], ['charged', 1]]) {
      const ti = T[type];
      const N = type === 'alive' ? m.outView[ti] * 0.25 * wall : m.outView[ti]; // expected sounds this window
      if (!(N > 0)) continue;
      let k = 0; // Poisson draw of the sounds we play, at most cap per scan
      const lam = Math.min(N, cap * 0.5);
      for (let L = Math.exp(-lam), p = this.rnd(); p > L && k < cap; k++) p *= this.rnd();
      if (!k) continue;
      const g = AMP[type] * BG_GAIN * Math.min(3, Math.sqrt(N / k));
      for (let i = 0; i < k; i++) this.play(type, c.time + LATENCY + this.rnd() * wall, g, o(type === 'alive' || type === 'birth' ? this.randomSlot() : -1));
    }
  }
  randomSlot() {
    let tot = 0; for (const e of this.slots.values()) tot += e.pop;
    let r = this.rnd() * tot;
    for (const [s, e] of this.slots) { r -= e.pop; if (r <= 0) return s; }
    return -1;
  }

  // movement: cells in view swimming past
  rustle(m, wall) {
    const c = this.c;
    const rate = m.living * Math.max(0, m.act - 0.1) * 0.5; // swishes per second if every mover were heard
    if (rate <= 0) return;
    const play = Math.min(rate, 4);
    let k = 0;
    for (let L = Math.exp(-play * wall), p = this.rnd(); p > L && k < 3; k++) p *= this.rnd();
    const g = AMP.rustle * this.gd * Math.min(10, Math.sqrt(rate / play)) * (0.4 + 0.6 * this.z);
    for (let i = 0; i < k; i++) this.play('rustle', c.time + LATENCY + this.rnd() * wall, g, { pan: this.rr(-0.85, 0.85) });
  }
}
