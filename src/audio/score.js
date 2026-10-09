// The soundtrack's long form: what plays besides the cells. Each climate era chooses its own
// ensemble, two of the layers below, and the season shapes them: as the tide strengthens they
// build voice by voice and brighten, as it slackens they thin out again. A change of era is a
// modulation: the old world sinks into a long reverb while strings swell on a chord the two
// keys share, then resolve into the new key. Now and then (a new era, a new reigning species,
// the height of a season) a piano develops the reigning species' motif into a short interlude.
//
// The layers, each a way of letting a few notes evolve slowly:
//   loops    single notes on loops of incommensurate lengths, never lining up the same way twice
//   circles  interlocking mallet figures from the reigning motif, mutating a note at a time
//   piano    a felt piano breaking chords, sparse when the water is calm
//   dub      chord stabs dissolving into the echoes
//   pad      string chords swelling and fading
//   sonar    a far ping on a long period, and its answer

import { d2m, hashStr } from './conductor.js';

const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// Levels: amps are set so that one note sits a little under one cell's note heard up close.
// A struck bar's loudness falls with pitch (its strike excites less of a higher bar): even it out.
const vibeAmp = (f) => Math.pow(f / 440, 0.8);

export const LAYERS = ['loops', 'circles', 'piano', 'dub', 'pad', 'sonar'];
// harmonic progressions (scale degrees above the pivot) for the piano and the pads
const PROGS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, -2, -4, -3], [0, 2, 5, 3]];
// loops: periods in steps (pairwise coprime), degrees above the root, places in the stereo field
const LOOP_P = [109, 131, 151, 173, 197, 223], LOOP_DEG = [0, 4, 9, 5, 8, 2], LOOP_PAN = [-0.5, 0.45, -0.2, 0.65, 0.1, -0.7];
// circles: a note every `every` steps from a cell of `len`, entering above intensity `at`
const CIRCLES = [{ every: 2, len: 5, oct: 1, at: 0, pan: -0.35 }, { every: 3, len: 4, oct: 1, at: 0.35, pan: 0.4 }, { every: 8, len: 3, oct: -1, at: 0.6, pan: 0 }];
// piano: [step, chord tone] per bar, from calm to lively; tones are triad degrees and the octave
const PIANO_PAT = [[[0, 0], [8, 2]], [[0, 0], [4, 1], [8, 2], [12, 1]], [[0, 0], [2, 1], [4, 2], [6, 3], [8, 2], [10, 1], [12, 2], [14, 1]]];
// interlude rhythms (steps per note)
const RHYTHMS = [[4, 2, 2, 8], [3, 3, 2, 8], [2, 2, 4, 8], [6, 2, 4, 4]];

// The ensemble of an era: two layers the previous era did not play, so every new era sounds
// new (the first tides are quiet: loops and a far ping).
export function palette(name, prev = []) {
  if (!name || name === 'The First Tides') return ['loops', 'sonar'];
  const free = LAYERS.filter((l) => !prev.includes(l)), h = hashStr(name), a = h % free.length;
  let b = (h >>> 8) % (free.length - 1); if (b >= a) b++;
  return [free[a], free[b]];
}

export class Score {
  constructor(cond) {
    this.c = cond; this.rnd = cond.rnd;
    this.I = 0.3;           // intensity 0..1, following the season's tide
    this.layers = [];
    this.lastInterlude = -1e9; this.duckUntil = 0; this.reign = -1; this.peaked = false;
    this.setEra(cond.era);
  }
  rr(lo, hi) { return lo + (hi - lo) * this.rnd(); }

  setEra(era) {
    const h = hashStr(era.name);
    this.layers = palette(era.name, this.played || []);
    this.played = this.layers;
    this.prog = PROGS[(h >>> 4) % PROGS.length];
    this.loopDef = (h >>> 12) & 1 ? 'glass' : 'breath';
    this.loopAt = LOOP_P.map(() => ({ next: null }));
    this.cells = null; this.sonarNext = null;
    this.c.eng.set('ping', { fb: this.layers.includes('dub') ? 0.62 : 0.45 });
  }

  // the reigning species' motif (scale degrees), or a plain one
  theme() { const m = this.reigning(); return m ? m.seq : [0, 2, 4, 1, 3]; }
  reigning() {
    let best = null;
    for (const e of this.c.field.slots.values()) if (e.v && (!best || e.pop > best.pop)) best = e;
    return best ? best.v.motif : null;
  }
  chord(deg, n = 3) { const c = this.c; return Array.from({ length: n }, (_, i) => d2m(deg + 2 * i, c.root, c.scale)); }

  // once per bar
  bar(ts, barN) {
    const c = this.c, W = c.world, fx = c.era.fx;
    const target = clamp((W.tide - 0.1) / 0.8, 0, 1) * (fx.dens || 1);
    this.I += (clamp(target, 0, 1) - this.I) * 0.15;
    const I = this.I;
    if (c.switchAt != null) return; // the era is changing: the bridge plays alone
    // interludes: a new reign, or the height of a season, at most every three minutes
    const top = this.topSlot();
    if (top !== this.reign) {
      const first = this.reign < 0; this.reign = top;
      if (!first && top >= 0 && ts - this.lastInterlude > 180) this.interlude(ts + 2 * 16 * c.step);
    }
    if (I > 0.85 && !this.peaked) { this.peaked = true; if (ts - this.lastInterlude > 240) this.interlude(ts + 16 * c.step); }
    if (I < 0.6) this.peaked = false;
    const L = (fx.level || 1) * (1 - 0.6 * c.field.z) * (ts < this.duckUntil ? 0.45 : 1);
    for (const name of this.layers) this[name](ts, barN, I, L);
  }
  topSlot() {
    let s = -1, p = 0;
    for (const [k, e] of this.c.field.slots) if (e.v && e.pop > p) { p = e.pop; s = k; }
    return s;
  }

  // ── layers ─────────────────────────────────────────────────────────────────
  loops(ts, barN, I, L) {
    const c = this.c, s = c.step, end = ts + 16 * s, n = 2 + Math.round(4 * I);
    for (let i = 0; i < n; i++) {
      const lp = this.loopAt[i], P = LOOP_P[i] * s;
      if (lp.next == null || lp.next < ts - P) lp.next = ts + this.rnd() * P; // stagger new loops
      for (; lp.next < end; lp.next += P) {
        if (lp.next < ts) continue;
        const f = midicps(d2m(LOOP_DEG[i], c.root, c.scale) + 12);
        c.at(lp.next, this.loopDef, { freq: f, amp: (this.loopDef === 'breath' ? 0.027 : 0.09) * L * (0.7 + 0.3 * I), atk: 2.5, sus: 2, rel: 7, glide: 0, bright: 0.35 + 0.35 * clamp(c.world.light, 0, 1), pan: LOOP_PAN[i], rev: 0.6, dly: 0.12 });
      }
    }
  }

  circles(ts, barN, I, L) {
    const c = this.c, s = c.step;
    if (!this.cells) { const th = this.theme(); this.cells = CIRCLES.map((v, i) => Array.from({ length: v.len }, (_, k) => (i === 2 ? [0, 4, -3][k] : i ? th[(th.length - 1 - k + th.length) % th.length] : th[k % th.length]))); }
    for (let i = 0; i < CIRCLES.length; i++) {
      const v = CIRCLES[i], cell = this.cells[i];
      if (I < v.at) continue;
      for (let k = 0; k < 16; k++) {
        const g = barN * 16 + k;
        if (g % v.every) continue;
        const idx = g / v.every;
        if (idx % v.len === 0 && this.rnd() < 0.1) { const j = Math.floor(this.rnd() * v.len); cell[j] = clamp(cell[j] + (this.rnd() < 0.5 ? -1 : 1), -3, 9); } // a mutation
        const deg = cell[idx % v.len] + c.pivot, accent = idx % v.len === 0 ? 1 : 0.75, t = ts + k * s;
        if (i === 2) c.at(t, 'strings', { freq: midicps(d2m(deg, c.root, c.scale) - 12), amp: 0.11 * L * accent, atk: 0.12, sus: 4 * s, rel: 1.2, bright: 0.3, pan: v.pan, rev: 0.4 });
        else { const f = midicps(d2m(deg, c.root, c.scale) + 12 * v.oct); c.at(t, 'vibe', { freq: f, amp: 0.087 * vibeAmp(f) * L * accent * (0.5 + 0.5 * I), dec: 2.2, bright: 0.35 + 0.4 * I, trem: 4.5, depth: 0.25, pan: v.pan, rev: 0.35, dly: 0.15 }); }
      }
    }
    if (I > 0.8 && barN % 2 === 0) c.at(ts, 'strings', { freq: midicps(d2m(c.pivot, c.root, c.scale) - 12), amp: 0.08 * L, atk: 2, sus: 16 * s, rel: 4, bright: 0.25, pan: 0, rev: 0.5 });
  }

  piano(ts, barN, I, L) {
    const c = this.c, s = c.step, ch = c.pivot + this.prog[(barN >> 1) % 4];
    const tones = [0, 2, 4, 7].map((d) => d2m(ch + d, c.root, c.scale));
    const human = () => (this.rnd() - 0.5) * 0.03;
    if (barN % 2 === 0) c.at(ts + 0.01, 'piano', { freq: midicps(tones[0] - 12), amp: 0.1 * L, dec: 6, felt: 0.7, pan: -0.15, rev: 0.35, dly: 0.03 });
    const pat = PIANO_PAT[I < 0.35 ? 0 : I < 0.65 ? 1 : 2];
    for (const [k, tone] of pat) c.at(ts + k * s + 0.02 + human(), 'piano', { freq: midicps(tones[tone] + 12), amp: 0.17 * L * (k === 0 ? 1 : 0.8) * this.rr(0.85, 1), dec: 4, felt: 0.65, pan: 0.15, rev: 0.35, dly: 0.05 });
    if (I > 0.6) { const th = this.theme(); for (const k of [0, 8]) c.at(ts + k * s + 0.03 + human(), 'piano', { freq: midicps(d2m(th[(barN * 2 + k / 8) % th.length] + c.pivot, c.root, c.scale) + 24), amp: 0.15 * L, dec: 4, felt: 0.5, pan: 0.25, rev: 0.4, dly: 0.08 }); }
  }

  dub(ts, barN, I, L) {
    const c = this.c, s = c.step;
    if (I < 0.35 && barN % 2) return;
    const steps = I < 0.7 ? [4] : [4, 10], ch = c.pivot + this.prog[(barN >> 2) % 4];
    for (const k of steps) for (const d of [0, 2, 4, 6]) {
      c.at(ts + k * s, 'strings', { freq: midicps(d2m(ch + d, c.root, c.scale)), amp: 0.13 * L, atk: 0.008, sus: 0.05, rel: 0.35 + 0.4 * I, bright: 0.15 + 0.25 * I, pan: (d - 3) * 0.12, rev: 0.35, dly: 0.55 });
    }
  }

  pad(ts, barN, I, L) {
    const c = this.c, s = c.step;
    if (barN % 4) return;
    const ch = c.pivot + this.prog[(barN >> 2) % 4], dur = 64 * s;
    const notes = [d2m(ch, c.root, c.scale) - 12, ...this.chord(ch), ...(I > 0.6 ? [d2m(ch + 9, c.root, c.scale)] : [])];
    notes.forEach((m, i) => c.at(ts + i * 0.15, 'strings', { freq: midicps(m), amp: 0.07 * L * (0.35 + 0.65 * I), atk: 0.35 * dur, sus: 0.35 * dur, rel: 0.5 * dur, bright: 0.2 + 0.6 * I, pan: (i - 1.5) * 0.3, rev: 0.6 }));
  }

  sonar(ts, barN, I, L) {
    const c = this.c, s = c.step, end = ts + 16 * s, P = 36 * s;
    if (this.sonarNext == null || this.sonarNext < ts - P) this.sonarNext = ts;
    for (; this.sonarNext < end; this.sonarNext += P) {
      const t = this.sonarNext;
      const f1 = midicps(d2m(4, c.root, c.scale) + 24), f2 = midicps(d2m(8, c.root, c.scale) + 24);
      c.at(t, 'vibe', { freq: f1, amp: 0.06 * vibeAmp(f1) * L, dec: 4, bright: 0.3, depth: 0, pan: 0.3, rev: 0.6, dly: 0.45 });
      if (I > 0.5) c.at(t + 24 * s, 'vibe', { freq: f2, amp: 0.045 * vibeAmp(f2) * L, dec: 4, bright: 0.3, depth: 0, pan: -0.4, rev: 0.6, dly: 0.45 });
    }
  }

  // ── a melodic interlude: the reigning motif, sequenced up, inverted, brought home ──
  // It keeps the motif's own rhythm, slowed to the piano's pace (its shortest note two steps).
  interlude(t0, theme = this.theme(), motif = this.reigning()) {
    const c = this.c, s = c.step, L = (c.era.fx.level || 1) * (1 - 0.3 * c.field.z);
    const th = theme.slice(0, Math.min(5, theme.length));
    let r = RHYTHMS[Math.floor(this.rnd() * RHYTHMS.length)];
    if (motif && motif.notes.length >= 2) {
      const ds = motif.notes.slice(0, th.length).map((nt) => nt.dur), lo = Math.min(...ds);
      r = ds.map((d) => clamp(Math.round((2 * d) / lo), 2, 8));
    }
    const phrases = [th, th.map((d) => d + 2), th.slice(0, 3).map((d) => 2 * th[0] - d), [th[0] + 2, th[0] + 1, th[0]]];
    const bassDeg = [0, 3, 5, 0], dyn = [0.75, 0.9, 1, 0.7];
    let t = t0;
    phrases.forEach((ph, pi) => {
      c.at(t, 'piano', { freq: midicps(d2m(c.pivot + bassDeg[pi], c.root, c.scale) - 12), amp: 0.13 * L * dyn[pi], dec: 7, felt: 0.7, pan: -0.2, rev: 0.4, dly: 0.03 });
      ph.forEach((d, k) => {
        const last = k === ph.length - 1, len = last ? 8 : r[k % r.length];
        c.at(t + (this.rnd() - 0.5) * 0.04, 'piano', { freq: midicps(d2m(d + c.pivot, c.root, c.scale) + 12), amp: 0.28 * L * dyn[pi] * (last ? 0.85 : 1), dec: last ? 6 : 4, felt: 0.55, pan: 0.15, rev: 0.4, dly: 0.08 });
        t += len * s;
      });
    });
    this.lastInterlude = t0; this.duckUntil = t;
  }

  // ── a change of era ────────────────────────────────────────────────────────
  // The old world sinks: a low chord drowned in a long reverb. Strings swell on a chord the two
  // keys share (the triad of the new key with the most notes already sounding) until the switch.
  bridge(ts, nx, root, scale, until) {
    const c = this.c, old = new Set(c.scale.map((x) => (x + c.root) % 12));
    for (const [i, m] of [c.root - 24, c.root - 12, d2m(4, c.root, c.scale) - 12, d2m(1, c.root, c.scale), d2m(2, c.root, c.scale)].entries()) {
      c.at(ts + i * 0.02, 'piano', { freq: midicps(m), amp: 0.2, dec: 9, felt: 0.35, pan: (i - 2) * 0.2, rev: 0.95, dly: 0.1 });
    }
    c.setAt(ts, 'fdn', { decay: 18 }); c.setAt(until, 'fdn', { decay: 9 });
    let best = 4, score = -1;
    for (const d of [4, 3, 5, 1, 2, 6]) {
      const n = [0, 2, 4].filter((i) => old.has((d2m(d + i, root, scale) % 12 + 12) % 12)).length;
      if (n > score) { score = n; best = d; }
    }
    const t1 = ts + 4, T = until - t1;
    [d2m(best, root, scale) - 12, ...[0, 2, 4].map((i) => d2m(best + i, root, scale))].forEach((m, i) => {
      c.at(t1 + i * 0.3, 'strings', { freq: midicps(m), amp: 0.13, atk: 0.8 * T, sus: 0.2 * T, rel: 9, bright: 0.7, pan: (i - 1.5) * 0.35, rev: 0.6 });
    });
    this.layers = [];
  }

  // ── the opening of a world ─────────────────────────────────────────────────
  // A new world is announced as an era arrives: a low chord rings out in a long reverb, strings
  // swell on the era's tonic chord, then the piano plays the reigning motif (or a plain one).
  overture(ts) {
    const c = this.c, T = 10;
    [c.root - 24, c.root - 12, d2m(4, c.root, c.scale) - 12, d2m(2, c.root, c.scale)].forEach((m, i) => {
      c.at(ts + i * 0.02, 'piano', { freq: midicps(m), amp: 0.18, dec: 9, felt: 0.35, pan: (i - 1.5) * 0.2, rev: 0.95, dly: 0.1 });
    });
    c.setAt(ts, 'fdn', { decay: 18 }); c.setAt(ts + T, 'fdn', { decay: 9 });
    [c.root - 12, ...this.chord(0)].forEach((m, i) => {
      c.at(ts + 1.5 + i * 0.3, 'strings', { freq: midicps(m), amp: 0.12, atk: 0.7 * T, sus: 0.3 * T, rel: 12, bright: 0.6, pan: (i - 1.5) * 0.35, rev: 0.6 });
    });
    this.interlude(ts + T);
  }

  // the new key arrives: its tonic chord, then the new ensemble and the reigning motif
  arrive(ts, era) {
    const c = this.c;
    [c.root - 12, ...this.chord(0)].forEach((m, i) => {
      c.at(ts + i * 0.2, 'strings', { freq: midicps(m), amp: 0.12, atk: 3, sus: 5, rel: 12, bright: 0.5, pan: (i - 1.5) * 0.35, rev: 0.6 });
    });
    this.setEra(era);
    this.interlude(ts + 2 * 16 * c.step);
  }
}
