// The soundtrack's long form: what plays besides the cells. Each climate era chooses its own
// ensemble, two of the layers below, and the season shapes them: as the tide strengthens they
// build voice by voice and brighten, as it slackens they thin out again. A change of era is a
// modulation: the old world sinks into a long reverb while strings swell on a chord the two
// keys share, then resolve into the new key. Now and then (a new era, a new reigning species,
// the height of a season) a piano develops the reigning species' motif into a short interlude.
//
// Every world has its own music: its seed (the conductor's ws) picks the key and mode it opens in,
// its first ensemble, the way its overture unfolds and the figure it opens on, and with each era's
// name, that era's progression, loops, pings and figures. So two worlds in the same era differ, and
// one world sounds the same each time it is loaded.
//
// The layers, each a way of letting a few notes evolve slowly:
//   loops    single notes on loops of incommensurate lengths, drifting a step now and then (Eno's 2/2)
//   circles  interlocking mallet figures from the reigning motif, mutating a note at a time
//   piano    a felt piano breaking chords, sparse when the water is calm
//   dub      chord stabs dissolving into the echoes
//   pad      string chords swelling and fading
//   sonar    a far ping on a long period, and its answer, never the same call twice running
//   arp      an echoing synth arpeggio that opens up and climbs as the tide rises
//   pulse    a muffled heartbeat under a haze, felt more than heard, only in lively water
//   hymn     a slow chorale of bowed glass or reed voices, each moving to the nearest note
//
// The score keeps time on the conductor's `slow` clock (this.s, a step of it): at a fast speed it
// quickens with the square root of the speed while the cells keep the full pulse, so sped-up time is
// heard without the score turning into a blur of notes or a bell ringing on repeat.

import { d2m, worldHash, STEP } from './conductor.js';

const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// Levels: amps are set so that one note sits a little under one cell's note heard up close.
// A struck bar's loudness falls with pitch (its strike excites less of a higher bar): even it out.
const vibeAmp = (f) => Math.pow(f / 440, 0.8);

export const LAYERS = ['loops', 'circles', 'piano', 'dub', 'pad', 'sonar', 'arp', 'pulse', 'hymn'];
// A world's first ensemble: one layer that moves and one that holds the space, gentle enough to open on.
export const OPENINGS = [['loops', 'sonar'], ['hymn', 'arp'], ['circles', 'pad'], ['loops', 'arp'], ['piano', 'hymn'], ['sonar', 'circles'],
  ['pad', 'arp'], ['hymn', 'pulse'], ['dub', 'loops'], ['piano', 'sonar'], ['circles', 'hymn'], ['arp', 'sonar']];
// the ways a world's overture unfolds (see overture)
export const OVERTURES = ['swell', 'tape', 'bells', 'rise', 'felt', 'deep'];
// figures a world opens on while no species reigns yet (scale degrees)
export const THEMES = [[0, 2, 4, 1, 3], [4, 2, 3, 1, 0], [0, 4, 3, 2, 4], [2, 0, -1, 0, 4], [0, 1, 2, 4, 2], [4, 5, 4, 2, 1, 0],
  [0, -3, -1, 0, 2], [7, 4, 5, 2, 3], [0, 2, 0, 4, 3, 1], [2, 4, 7, 6, 4], [0, 3, 2, 5, 4], [4, 3, 0, 1, 2]];
// harmonic progressions (scale degrees above the pivot) for the piano, pads, arps and chorales
const PROGS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, -2, -4, -3], [0, 2, 5, 3], [0, 4, 5, 3], [0, -1, -3, -4], [0, 3, 1, 4], [0, 5, 1, 4], [0, 2, 3, -1], [0, -3, -2, 1]];
// loops: periods in slow steps (pairwise coprime), places in the stereo field, and sets of degrees above the root
const LOOP_P = [109, 131, 151, 173, 197, 223], LOOP_PAN = [-0.5, 0.45, -0.2, 0.65, 0.1, -0.7];
const LOOP_DEGS = [[0, 4, 9, 5, 8, 2], [0, 2, 4, 7, 9, 11], [4, 0, 7, 2, 9, 6], [0, 5, 3, 8, 10, 1], [2, 6, 4, 9, 0, 7], [0, 7, 4, 11, 2, 9]];
// sonar: calls (a ping and its answer, degrees above the pivot); an era takes three and goes round them
const SONAR = [[4, 8], [2, 7], [4, 6], [0, 4], [7, 9], [2, 5], [6, 4], [9, 7]];
// circles: a note every `every` steps from a cell of `len`, entering above intensity `at`
const CIRCLES = [{ every: 2, len: 5, oct: 1, at: 0, pan: -0.35 }, { every: 3, len: 4, oct: 1, at: 0.35, pan: 0.4 }, { every: 8, len: 3, oct: -1, at: 0.6, pan: 0 }];
// piano: [step, chord tone] per bar, from calm to lively; tones are triad degrees and the octave
const PIANO_PAT = [[[0, 0], [8, 2]], [[0, 0], [4, 1], [8, 2], [12, 1]], [[0, 0], [2, 1], [4, 2], [6, 3], [8, 2], [10, 1], [12, 2], [14, 1]]];
// arp: orders through the chord's tones (ARP_TONE: degrees above its root)
const ARP_TONE = [0, 2, 4, 7, 9], ARP_PATS = [[0, 1, 2, 3], [0, 1, 2, 3, 2, 1], [0, 2, 1, 3], [0, 3, 1, 2], [0, 2, 4, 1, 3], [3, 2, 0, 1], [0, 1, 3, 2, 4, 2]];
// interlude rhythms (steps per note)
const RHYTHMS = [[4, 2, 2, 8], [3, 3, 2, 8], [2, 2, 4, 8], [6, 2, 4, 4], [2, 4, 2, 8], [4, 4, 2, 6], [3, 1, 4, 8], [2, 6, 2, 6]];

// The ensemble of an era: two layers the previous era did not play, so every new era sounds
// new. A world opens on one of OPENINGS.
export function palette(name, prev = [], ws = 0) {
  if (!name || name === 'The First Tides') return OPENINGS[worldHash('ensemble', ws) % OPENINGS.length].slice();
  const free = LAYERS.filter((l) => !prev.includes(l)), h = worldHash(name, ws), a = h % free.length;
  let b = (h >>> 8) % (free.length - 1); if (b >= a) b++;
  return [free[a], free[b]];
}

export class Score {
  constructor(cond) {
    this.c = cond; this.rnd = cond.rnd;
    this.I = 0.3;           // intensity 0..1, following the season's tide
    this.layers = [];
    this.reset();
    this.setEra(cond.era);
  }
  reset() {
    this.lastInterlude = -1e9; this.duckUntil = 0; this.reign = -1; this.peaked = false;
    this.landAt = null; this.lapseEnd = null; this.openAt = null;
    this.at = null; this.barN = 0; this.s = this.c.step; this.k = 1; this.fast = false;
  }
  rr(lo, hi) { return lo + (hi - lo) * this.rnd(); }
  pick(a) { return a[Math.floor(this.rnd() * a.length)]; }

  setEra(era) {
    const h = worldHash(era.name, this.c.ws);
    this.layers = palette(era.name, this.played || [], this.c.ws);
    this.played = this.layers;
    this.prog = PROGS[(h >>> 4) % PROGS.length];
    this.loopDef = (h >>> 12) & 1 ? 'glass' : 'breath';
    this.loopDeg = LOOP_DEGS[(h >>> 7) % LOOP_DEGS.length].slice();
    this.loopAt = LOOP_P.map(() => ({ next: null }));
    const s0 = (h >>> 11) % SONAR.length;
    this.calls = [0, 3, 5].map((k) => SONAR[(s0 + k) % SONAR.length]); this.callN = 0;
    this.sonarP = 36 + 4 * ((h >>> 14) % 5);
    this.arpPat = ARP_PATS[(h >>> 15) % ARP_PATS.length];
    this.hymnDef = (h >>> 19) & 1 ? 'glass' : 'breath'; this.hymnV = null; this.hymnNext = null;
    this.pulseNext = null;
    this.cells = null; this.sonarNext = null;
    this.c.eng.set('ping', { fb: this.layers.includes('dub') || this.layers.includes('arp') ? 0.62 : 0.45 });
  }

  // the reigning species' motif (scale degrees), or the world's own opening figure
  theme() { const m = this.reigning(); return m ? m.seq : this.openTheme(); }
  openTheme() { return THEMES[worldHash('theme', this.c.ws) % THEMES.length]; }
  reigning() {
    let best = null;
    for (const e of this.c.field.slots.values()) if (e.v && (!best || e.pop > best.pop)) best = e;
    return best ? best.v.motif : null;
  }
  chord(deg, n = 3) { const c = this.c; return Array.from({ length: n }, (_, i) => d2m(deg + 2 * i, c.root, c.scale)); }

  // Once per bar of the conductor's, which spans [ts, ts + 16 steps): the score's own bars that
  // begin in it. The score keeps time on the slow clock (this.s), so at a fast speed its bars are
  // longer than the conductor's: it quickens with the square root of the speed.
  bar(ts) {
    const c = this.c, end = ts + 16 * c.step;
    if (this.at == null || this.at < ts - 1) this.at = ts;
    while (this.at < end) { this.s = c.slow; this.sbar(this.at, this.barN++); this.at += 16 * this.s; }
  }
  sbar(ts, barN) {
    const c = this.c, W = c.world, fx = c.era.fx;
    // sped up, notes ring shorter and the busiest figures thin out, so the score never crowds out the cells
    this.k = clamp(this.s / STEP, 0.5, 1); this.fast = this.k < 0.8;
    const target = clamp((W.tide - 0.1) / 0.8, 0, 1) * (fx.dens || 1);
    this.I += (clamp(target, 0, 1) - this.I) * 0.15;
    const I = this.I;
    if (c.switchAt != null) return; // the era is changing: the bridge plays alone
    // the overture lands (its theme) once it has rung out and the warm-up is over
    if (this.landAt != null && ts >= this.landAt && !c.lapse) {
      const lapsed = this.lapseEnd != null && this.lapseEnd >= this.openAt;
      this.landAt = null;
      this.land(ts + 0.4, lapsed ? c.realStep() : this.s);
    }
    // interludes: a new reign, or the height of a season, at most every three minutes
    const top = this.topSlot();
    if (top !== this.reign) {
      const first = this.reign < 0; this.reign = top;
      if (!first && top >= 0 && ts - this.lastInterlude > 180) this.interlude(ts + 2 * 16 * this.s);
    }
    if (I > 0.85 && !this.peaked) { this.peaked = true; if (ts - this.lastInterlude > 240) this.interlude(ts + 16 * this.s); }
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
    const c = this.c, s = this.s, end = ts + 16 * s, n = 2 + Math.round(4 * I);
    for (let i = 0; i < n; i++) {
      const lp = this.loopAt[i], P = LOOP_P[i] * s;
      if (lp.next == null || lp.next < ts - P) lp.next = ts + this.rnd() * P; // stagger new loops
      for (; lp.next < end; lp.next += P) {
        if (lp.next < ts) continue;
        const f = midicps(d2m(this.loopDeg[i], c.root, c.scale) + 12);
        c.at(lp.next, this.loopDef, { freq: f, amp: (this.loopDef === 'breath' ? 0.027 : 0.09) * L * (0.7 + 0.3 * I), atk: 2.5, sus: 2, rel: 7, glide: 0, bright: 0.35 + 0.35 * clamp(c.world.light, 0, 1), pan: LOOP_PAN[i], rev: 0.6, dly: 0.12 });
        // now and then a loop's note drifts a step or two, so the pattern slowly changes shape
        if (this.rnd() < 0.15) this.loopDeg[i] = clamp(this.loopDeg[i] + this.pick([-2, -1, 1, 2]), -2, 11);
      }
    }
  }

  circles(ts, barN, I, L) {
    const c = this.c, s = this.s;
    if (!this.cells) { const th = this.theme(); this.cells = CIRCLES.map((v, i) => Array.from({ length: v.len }, (_, k) => (i === 2 ? [0, 4, -3][k] : i ? th[(th.length - 1 - k + th.length) % th.length] : th[k % th.length]))); }
    for (let i = 0; i < CIRCLES.length; i++) {
      const v = CIRCLES[i], cell = this.cells[i];
      if (I < v.at) continue;
      for (let k = 0; k < 16; k++) {
        const g = barN * 16 + k, every = v.every * (this.fast && i < 2 ? 2 : 1);
        if (g % every) continue;
        const idx = g / every;
        if (idx % v.len === 0 && this.rnd() < 0.1) { const j = Math.floor(this.rnd() * v.len); cell[j] = clamp(cell[j] + (this.rnd() < 0.5 ? -1 : 1), -3, 9); } // a mutation
        const deg = cell[idx % v.len] + c.pivot, accent = idx % v.len === 0 ? 1 : 0.75, t = ts + k * s;
        if (i === 2) c.at(t, 'strings', { freq: midicps(d2m(deg, c.root, c.scale) - 12), amp: 0.11 * L * accent, atk: 0.12, sus: 4 * s, rel: 1.2, bright: 0.3, pan: v.pan, rev: 0.4 });
        else { const f = midicps(d2m(deg, c.root, c.scale) + 12 * v.oct); c.at(t, 'vibe', { freq: f, amp: 0.087 * vibeAmp(f) * L * accent * (0.5 + 0.5 * I), dec: 2.2 * this.k, bright: 0.35 + 0.4 * I, trem: 4.5, depth: 0.25, pan: v.pan, rev: 0.35, dly: 0.15 }); }
      }
    }
    if (I > 0.8 && barN % 2 === 0) c.at(ts, 'strings', { freq: midicps(d2m(c.pivot, c.root, c.scale) - 12), amp: 0.08 * L, atk: 2, sus: 16 * s, rel: 4, bright: 0.25, pan: 0, rev: 0.5 });
  }

  piano(ts, barN, I, L) {
    const c = this.c, s = this.s, ch = c.pivot + this.prog[(barN >> 1) % 4];
    const tones = [0, 2, 4, 7].map((d) => d2m(ch + d, c.root, c.scale));
    const human = () => (this.rnd() - 0.5) * 0.03;
    if (barN % 2 === 0) c.at(ts + 0.01, 'piano', { freq: midicps(tones[0] - 12), amp: 0.1 * L, dec: 6, felt: 0.7, pan: -0.15, rev: 0.35, dly: 0.03 });
    const pat = PIANO_PAT[Math.min(I < 0.35 ? 0 : I < 0.65 ? 1 : 2, this.fast ? 1 : 2)];
    for (const [k, tone] of pat) c.at(ts + k * s + 0.02 + human(), 'piano', { freq: midicps(tones[tone] + 12), amp: 0.17 * L * (k === 0 ? 1 : 0.8) * this.rr(0.85, 1), dec: 4 * this.k, felt: 0.65, pan: 0.15, rev: 0.35, dly: 0.05 });
    if (I > 0.6) { const th = this.theme(); for (const k of this.fast ? [0] : [0, 8]) c.at(ts + k * s + 0.03 + human(), 'piano', { freq: midicps(d2m(th[(barN * 2 + k / 8) % th.length] + c.pivot, c.root, c.scale) + 24), amp: 0.15 * L, dec: 4 * this.k, felt: 0.5, pan: 0.25, rev: 0.4, dly: 0.08 }); }
  }

  dub(ts, barN, I, L) {
    const c = this.c, s = this.s;
    if (I < 0.35 && barN % 2) return;
    const steps = I < 0.7 ? [4] : [4, 10], ch = c.pivot + this.prog[(barN >> 2) % 4];
    for (const k of steps) for (const d of [0, 2, 4, 6]) {
      c.at(ts + k * s, 'strings', { freq: midicps(d2m(ch + d, c.root, c.scale)), amp: 0.13 * L, atk: 0.008, sus: 0.05, rel: 0.35 + 0.4 * I, bright: 0.15 + 0.25 * I, pan: (d - 3) * 0.12, rev: 0.35, dly: 0.55 });
    }
  }

  pad(ts, barN, I, L) {
    const c = this.c, s = this.s;
    if (barN % 4) return;
    const ch = c.pivot + this.prog[(barN >> 2) % 4], dur = 64 * s;
    const notes = [d2m(ch, c.root, c.scale) - 12, ...this.chord(ch), ...(I > 0.6 ? [d2m(ch + 9, c.root, c.scale)] : [])];
    notes.forEach((m, i) => c.at(ts + i * 0.15, 'strings', { freq: midicps(m), amp: 0.07 * L * (0.35 + 0.65 * I), atk: 0.35 * dur, sus: 0.35 * dur, rel: 0.5 * dur, bright: 0.2 + 0.6 * I, pan: (i - 1.5) * 0.3, rev: 0.6 }));
  }

  sonar(ts, barN, I, L) {
    const c = this.c, s = this.s, end = ts + 16 * s, P = this.sonarP * s;
    if (this.sonarNext == null || this.sonarNext < ts - P) this.sonarNext = ts;
    for (; this.sonarNext < end; this.sonarNext += P) {
      const t = this.sonarNext, [a, b] = this.calls[this.callN % this.calls.length], oct = this.callN % 5 === 4 ? 12 : 24;
      this.callN++;
      const f1 = midicps(d2m(a + c.pivot, c.root, c.scale) + oct), f2 = midicps(d2m(b + c.pivot, c.root, c.scale) + 24);
      c.at(t, 'vibe', { freq: f1, amp: 0.06 * vibeAmp(f1) * L, dec: 4, bright: 0.3, depth: 0, pan: this.rr(0.15, 0.45), rev: 0.6, dly: 0.45 });
      if (I > 0.5) c.at(t + 24 * s, 'vibe', { freq: f2, amp: 0.045 * vibeAmp(f2) * L, dec: 4, bright: 0.3, depth: 0, pan: -this.rr(0.25, 0.55), rev: 0.6, dly: 0.45 });
    }
  }

  // An echoing arpeggio through the chord of the moment (Althai, Bersarin Quartett): quiet and
  // sparse in calm water, it quickens, brightens and climbs an octave as the tide rises.
  arp(ts, barN, I, L) {
    const c = this.c, s = this.s, every = I < 0.4 || this.fast ? 4 : 2, pat = this.arpPat;
    const ch = c.pivot + this.prog[(barN >> 1) % 4];
    for (let k = 0; k < 16; k += every) {
      const idx = (barN * 16 + k) / every;
      if (this.rnd() < 0.12) continue; // a breath in the figure
      const cyc = Math.floor(idx / pat.length), up = I > 0.7 && cyc % 4 >= 2 ? 12 : 0;
      const m = d2m(ch + ARP_TONE[pat[idx % pat.length]], c.root, c.scale) + 12 + up;
      c.at(ts + k * s, 'cplx', { freq: midicps(m), amp: 0.075 * L * (0.45 + 0.55 * I) * (idx % pat.length === 0 ? 1 : 0.8), ratio: 2, index: 0.5 + 0.9 * I, fold: 0.9 + 0.8 * I,
        dec: 0.22 + 0.35 * (1 - I), bright: 0.25 + 0.6 * I, pan: idx % 2 ? 0.35 : -0.35, rev: 0.45, dly: 0.5 });
    }
  }

  // A muffled heartbeat (Gas, Donato Dozzy): a soft low knock on the beat, under a reed haze that
  // swells once a phrase. Only in lively water; in calm water just the haze.
  pulse(ts, barN, I, L) {
    const c = this.c, s = this.s, end = ts + 16 * s, P = 4 * s;
    if (this.pulseNext == null || this.pulseNext < ts - P) this.pulseNext = ts;
    const f = midicps(c.root - 12), beat = clamp((I - 0.3) / 0.5, 0, 1);
    for (; this.pulseNext < end; this.pulseNext += P) {
      if (beat > 0) c.at(this.pulseNext, 'wood', { freq: f, amp: 0.12 * L * beat, dec: 0.45, bright: 0.05, pan: 0, rev: 0.25 });
    }
    if (barN % 4 === 0) {
      const ch = c.pivot + this.prog[(barN >> 2) % 4], dur = 64 * s;
      [0, 4, 7].forEach((d, i) => c.at(ts + i * 0.2, 'breath', { freq: midicps(d2m(ch + d, c.root, c.scale)), amp: 0.02 * L * (0.5 + 0.5 * I), atk: 0.4 * dur, sus: 0.3 * dur, rel: 0.6 * dur, glide: 0, bright: 0.3, pan: (i - 1) * 0.5, rev: 0.7, dly: 0.3 }));
    }
  }

  // A slow chorale (Biosphere, Eno): three or four bowed voices, each moving to the nearest note of
  // the next chord, so the harmony turns without anything jumping.
  hymn(ts, barN, I, L) {
    const c = this.c, s = this.s, end = ts + 16 * s, P = 40 * s;
    if (this.hymnNext == null || this.hymnNext < ts - P) this.hymnNext = ts;
    for (; this.hymnNext < end; this.hymnNext += P) {
      const t = this.hymnNext, k = Math.round(t / P);
      const ch = c.pivot + this.prog[k % 4];
      const tones = [];
      for (let o = -1; o <= 2; o++) for (const d of [0, 2, 4]) tones.push(d2m(ch + d, c.root, c.scale) + 12 * o);
      if (!this.hymnV) this.hymnV = [c.root, c.root + 7, c.root + 12, c.root + 16];
      const n = I > 0.6 ? 4 : 3;
      for (let v = 0; v < n; v++) {
        const prev = this.hymnV[v];
        let best = tones[0];
        for (const m of tones) if (Math.abs(m - prev) < Math.abs(best - prev) || (Math.abs(m - prev) === Math.abs(best - prev) && this.rnd() < 0.5)) best = m;
        this.hymnV[v] = best;
        const glass = this.hymnDef === 'glass';
        c.at(t + v * 0.35, this.hymnDef, { freq: midicps(best), amp: (glass ? 0.06 : 0.022) * L * (0.45 + 0.55 * I), atk: 0.4 * P, sus: 0.35 * P, rel: 0.7 * P, glide: 0,
          bright: 0.25 + 0.35 * I, pan: (v - 1.5) * 0.4, rev: 0.65, dly: 0.1 });
      }
    }
  }

  // ── a melodic interlude: the reigning motif, developed in one of a few ways, brought home ──
  // It keeps the motif's own rhythm, slowed to the piano's pace (its shortest note two steps).
  // s: the step to play it at (the landing after a warm-up plays it at real time).
  interlude(t0, theme = this.theme(), motif = this.reigning(), s = this.s) {
    const c = this.c, L = (c.era.fx.level || 1) * (1 - 0.3 * c.field.z);
    const th = theme.slice(0, Math.min(5, theme.length));
    let r = this.pick(RHYTHMS);
    if (motif && motif.notes.length >= 2) {
      const ds = motif.notes.slice(0, th.length).map((nt) => nt.dur), lo = Math.min(...ds);
      r = ds.map((d) => clamp(Math.round((2 * d) / lo), 2, 8));
    }
    const cad = [th[0] + 2, th[0] + 1, th[0]];
    const form = this.pick(['sequence', 'answer', 'canon']);
    const phrases = form === 'answer' ? [th, [...th].reverse().map((d) => d + 1), th.slice(0, 3).map((d) => d + 4), cad]
      : [th, th.map((d) => d + 2), th.slice(0, 3).map((d) => 2 * th[0] - d), cad];
    const bassDeg = form === 'answer' ? [0, 4, 3, 0] : [0, 3, 5, 0], dyn = [0.75, 0.9, 1, 0.7];
    let t = t0;
    phrases.forEach((ph, pi) => {
      c.at(t, 'piano', { freq: midicps(d2m(c.pivot + bassDeg[pi], c.root, c.scale) - 12), amp: 0.13 * L * dyn[pi], dec: 7, felt: 0.7, pan: -0.2, rev: 0.4, dly: 0.03 });
      ph.forEach((d, k) => {
        const last = k === ph.length - 1, len = last ? 8 : r[k % r.length], m = d2m(d + c.pivot, c.root, c.scale) + 12;
        c.at(t + (this.rnd() - 0.5) * 0.04, 'piano', { freq: midicps(m), amp: 0.28 * L * dyn[pi] * (last ? 0.85 : 1), dec: last ? 6 : 4, felt: 0.55, pan: 0.15, rev: 0.4, dly: 0.08 });
        // a canon: a vibraphone follows two steps behind, an octave up
        if (form === 'canon' && pi < 3) { const f = midicps(m + 12); c.at(t + 2 * s, 'vibe', { freq: f, amp: 0.07 * vibeAmp(f) * L * dyn[pi], dec: 2.5, bright: 0.3, trem: 4, depth: 0.2, pan: -0.3, rev: 0.45, dly: 0.2 }); }
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
    this.landAt = null; // an overture not yet landed gives way
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
  // A new world is announced in one of several ways (its seed picks which), timed in seconds so
  // that it unfolds the same at any speed; it plays over the warm-up's sped-up first minutes. Once
  // it has rung out and the warm-up is over it lands: the tonic chord, and the piano plays the
  // reigning motif (by then a species usually reigns) at real time.
  overture(ts, form = OVERTURES[worldHash('overture', this.c.ws) % OVERTURES.length]) {
    const c = this.c, T = 10, th = this.openTheme(), tonic = [c.root - 12, ...this.chord(0)];
    const hall = () => { c.setAt(ts, 'fdn', { decay: 18 }); c.setAt(ts + T, 'fdn', { decay: 9 }); };
    const lowChord = (amp) => [c.root - 24, c.root - 12, d2m(4, c.root, c.scale) - 12, d2m(2, c.root, c.scale)].forEach((m, i) => {
      c.at(ts + i * 0.02, 'piano', { freq: midicps(m), amp, dec: 9, felt: 0.35, pan: (i - 1.5) * 0.2, rev: 0.95, dly: 0.1 });
    });
    const swell = (t1, amp, bright) => tonic.forEach((m, i) => {
      c.at(t1 + i * 0.3, 'strings', { freq: midicps(m), amp, atk: 0.7 * (ts + T - t1), sus: 0.3 * (ts + T - t1), rel: 12, bright, pan: (i - 1.5) * 0.35, rev: 0.6 });
    });
    const note = (k) => d2m(th[k % th.length], c.root, c.scale);
    hall();
    if (form === 'swell') { // a low chord rings out, strings swell on the tonic
      lowChord(0.18); swell(ts + 1.5, 0.12, 0.6);
    } else if (form === 'tape') { // the figure's notes enter one by one as long tones (Eno), over a low fifth
      lowChord(0.12);
      for (let k = 0; k < 4; k++) c.at(ts + 1 + 2.1 * k, 'glass', { freq: midicps(note(k) + 12), amp: 0.11, atk: 1.6, sus: 2.5, rel: 7, glide: 0, bright: 0.5, pan: [-0.5, 0.45, -0.15, 0.6][k], rev: 0.7, dly: 0.15 });
      swell(ts + 4, 0.07, 0.4);
    } else if (form === 'bells') { // a mallet figure gathers, quickening, until it rings (Snow Palms)
      let t = ts + 0.4, dt = 0.62;
      for (let k = 0; k < 15; k++, t += dt, dt *= 0.95) { const f = midicps(note(k) + 12 + (k >= 10 ? 12 : 0)); c.at(t, 'vibe', { freq: f, amp: 0.095 * vibeAmp(f) * (0.45 + 0.04 * k), dec: 2.6, bright: 0.4, trem: 4.5, depth: 0.25, pan: k % 2 ? 0.35 : -0.35, rev: 0.45, dly: 0.25 }); }
      swell(ts + 3, 0.09, 0.5);
    } else if (form === 'rise') { // an arpeggio climbs three octaves and opens into a held chord (Althai)
      for (let k = 0; k < 12; k++) {
        const m = d2m([0, 2, 4][k % 3] + c.scale.length * Math.floor(k / 3), c.root, c.scale);
        c.at(ts + 0.3 + k * 0.42, 'cplx', { freq: midicps(m), amp: 0.05 + 0.006 * k, ratio: 2, index: 0.5 + 0.08 * k, fold: 1 + 0.06 * k, dec: 0.5, bright: 0.3 + 0.05 * k, pan: k % 2 ? 0.4 : -0.4, rev: 0.5, dly: 0.45 });
      }
      c.at(ts + 5.4, 'glass', { freq: midicps(d2m(4, c.root, c.scale) + 24), amp: 0.08, atk: 1.2, sus: 3, rel: 6, glide: 0, bright: 0.6, pan: 0, rev: 0.7, dly: 0.2 });
      swell(ts + 2, 0.1, 0.6);
    } else if (form === 'felt') { // a felt piano alone, close, breaking the tonic chord slowly (Nils Frahm)
      c.at(ts, 'piano', { freq: midicps(c.root - 12), amp: 0.14, dec: 9, felt: 0.85, pan: -0.1, rev: 0.5, dly: 0.03 });
      [0, 2, 4, 7, 4, 9].forEach((d, k) => c.at(ts + 1.2 + k * 1.15 + this.rr(-0.05, 0.05), 'piano', { freq: midicps(d2m(d, c.root, c.scale) + 12), amp: 0.17 * (k === 3 ? 1 : 0.8), dec: 6, felt: 0.8, pan: 0.15, rev: 0.45, dly: 0.05 }));
    } else { // 'deep': chord stabs dissolving into the echoes, the sea rising under them (Deepchord, loscil)
      c.setAt(ts, 'ping', { fb: 0.72 }); c.setAt(ts + T, 'ping', { fb: this.layers.includes('dub') || this.layers.includes('arp') ? 0.62 : 0.45 });
      for (const t of [ts + 0.2, ts + 3.4, ts + 5.0]) for (const d of [0, 2, 4, 6]) {
        c.at(t, 'strings', { freq: midicps(d2m(d, c.root, c.scale)), amp: 0.12, atk: 0.008, sus: 0.06, rel: 0.8, bright: 0.3, pan: (d - 3) * 0.15, rev: 0.45, dly: 0.75 });
      }
      c.at(ts + 1, 'wave', { amp: 0.3, dur: 8, bright: 0.4, pan: 0, rev: 0.5 });
      swell(ts + 4, 0.08, 0.4);
    }
    this.openAt = ts; this.landAt = ts + T; this.lastInterlude = ts;
  }
  land(ts, s) {
    const c = this.c;
    [c.root - 12, ...this.chord(0)].forEach((m, i) => {
      c.at(ts + i * 0.2, 'strings', { freq: midicps(m), amp: 0.08, atk: 3, sus: 5, rel: 10, bright: 0.45, pan: (i - 1.5) * 0.35, rev: 0.6 });
    });
    this.interlude(ts + 1, this.theme(), this.reigning(), s);
  }

  // the new key arrives: its tonic chord, then the new ensemble and the reigning motif
  arrive(ts, era) {
    const c = this.c;
    [c.root - 12, ...this.chord(0)].forEach((m, i) => {
      c.at(ts + i * 0.2, 'strings', { freq: midicps(m), amp: 0.12, atk: 3, sus: 5, rel: 12, bright: 0.5, pan: (i - 1.5) * 0.35, rev: 0.6 });
    });
    this.setEra(era);
    this.interlude(ts + 2 * 16 * this.s);
  }
}
