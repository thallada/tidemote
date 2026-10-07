// Ports of the SuperCollider 3.13 unit generators the soundtrack uses, kept to their
// server/plugins source semantics: 64-sample blocks, control-rate inputs read once per
// block, biquad coefficients ramped over the block in 21 steps of three samples, envelope
// and lag formulas, the taus88 random generator and the wavetable sine. Each class
// processes one block into a Float32Array.

export const BS = 64;
const LOOPS = (BS / 3) | 0; // mFilterLoops
const REMAIN = BS % 3; // mFilterRemain
const FSLOPE = 1 / LOOPS; // mFilterSlope
const SLOPE = 1 / BS; // mSlopeFactor (CALCSLOPE)
const LOG001 = Math.log(0.001);
const LOG1 = Math.log(0.1);
const TWOPI = Math.PI * 2;
const f32 = Math.fround;

export const zap = (x) => { const a = Math.abs(x); return a > 1e-15 && a < 1e15 ? x : 0; };

// ── taus88, seeded like RGen::init ───────────────────────────────────────────
function hash32(k) {
  let h = k >>> 0;
  h = (h + ~(h << 15)) >>> 0; h = (h ^ (h >>> 10)) >>> 0; h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 6)) >>> 0; h = (h + ~(h << 11)) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  return h;
}
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
export class RGen {
  constructor(seed) {
    const s = hash32(seed);
    this.s1 = (1243598713 ^ s) >>> 0; if (this.s1 < 2) this.s1 = 1243598713;
    this.s2 = (3093459404 ^ s) >>> 0; if (this.s2 < 8) this.s2 = 3093459404;
    this.s3 = (1821928721 ^ s) >>> 0; if (this.s3 < 16) this.s3 = 1821928721;
    this.off = false; // test switch: every noise source outputs zero
  }
  trand() {
    let { s1, s2, s3 } = this;
    s1 = ((((s1 & 0xfffffffe) << 12) >>> 0) ^ ((((s1 << 13) >>> 0) ^ s1) >>> 19)) >>> 0;
    s2 = ((((s2 & 0xfffffff8) << 4) >>> 0) ^ ((((s2 << 2) >>> 0) ^ s2) >>> 25)) >>> 0;
    s3 = ((((s3 & 0xfffffff0) << 17) >>> 0) ^ ((((s3 << 3) >>> 0) ^ s3) >>> 11)) >>> 0;
    this.s1 = s1; this.s2 = s2; this.s3 = s3;
    return (s1 ^ s2 ^ s3) >>> 0;
  }
  frand2() { U32[0] = (0x40000000 | (this.trand() >>> 9)) >>> 0; return F32[0] - 3; } // [-1, 1)
  frand8() { U32[0] = (0x3e800000 | (this.trand() >>> 9)) >>> 0; return F32[0] - 0.375; } // [-1/8, 1/8)
  frand() { U32[0] = (0x3f800000 | (this.trand() >>> 9)) >>> 0; return F32[0] - 1; } // [0, 1)
  rand(lo, hi) { return lo + (hi - lo) * this.frand(); } // Rand.ir
}

// ── sine wavetable (SignalAsWavetable over 8192 points) ──────────────────────
const SINE_N = 8192;
const SINE = new Float32Array(SINE_N + 1);
for (let i = 0; i <= SINE_N; i++) SINE[i] = Math.sin((i * TWOPI) / SINE_N);
const WT = new Float32Array(SINE_N * 2);
for (let i = 0; i < SINE_N; i++) { const a = SINE[i], b = SINE[(i + 1) % SINE_N]; WT[2 * i] = 2 * a - b; WT[2 * i + 1] = b - a; }
const PHASE_ONE = 2 ** 29; // one cycle of the 32-bit phase accumulator (tableSize2 * 65536)
function lookupi1(phase) {
  const p = phase >>> 0;
  const idx = (p >>> 16) & (SINE_N - 1);
  U32[0] = (0x3f800000 | ((p << 7) & 0x007fff80)) >>> 0;
  return WT[2 * idx] + WT[2 * idx + 1] * F32[0];
}
export const sinTable = SINE;

export class SinOsc {
  // SinOsc.ar(freq, phase): freq control-rate (k) or audio (a); phase audio (a) or constant.
  constructor(sr, freq0 = 0, phase0 = 0) {
    this.cpstoinc = (SINE_N * 65536) / sr; // double in TableLookup
    this.radtoinc = (SINE_N * 65536) / TWOPI;
    this.cpsF = f32(this.cpstoinc); this.radF = f32(this.radtoinc); // the float locals of Osc_iaa / ika
    this.phase = 0;
    this.phasein = phase0;
  }
  // freq constant over the block, phase modulation audio-rate (Osc_ika)
  ka(freq, phaseIn, out) {
    let phase = this.phase;
    const inc = Math.trunc(this.cpstoinc * freq) | 0;
    for (let i = 0; i < BS; i++) {
      const po = (phase + Math.trunc(f32(this.radF * phaseIn[i]))) | 0;
      out[i] = lookupi1(po);
      phase = (phase + inc) | 0;
    }
    this.phase = phase;
  }
  // freq constant, no phase modulation (Osc_ikk with constant phase)
  kk(freq, out) {
    let phase = this.phase;
    const inc = Math.trunc(this.cpstoinc * freq) | 0;
    for (let i = 0; i < BS; i++) { out[i] = lookupi1(phase); phase = (phase + inc) | 0; }
    this.phase = phase;
  }
  // freq audio-rate, phase audio-rate (Osc_iaa)
  aa(freq, phaseIn, out) {
    let phase = this.phase;
    for (let i = 0; i < BS; i++) {
      const po = (phase + Math.trunc(f32(this.radF * phaseIn[i]))) | 0;
      out[i] = lookupi1(po);
      phase = (phase + Math.trunc(f32(this.cpsF * freq[i]))) | 0;
    }
    this.phase = phase;
  }
  // freq audio-rate, constant phase (Osc_iai)
  ai(freq, out) {
    let phase = this.phase;
    const pm = Math.trunc(f32(this.radF * this.phasein)) | 0;
    for (let i = 0; i < BS; i++) { out[i] = lookupi1(phase + pm); phase = (phase + Math.trunc(f32(this.cpsF * freq[i]))) | 0; }
    this.phase = phase;
  }
}

// ── LFNoise2: quadratically interpolated random midpoints ────────────────────
export class LFNoise2 {
  constructor(rate, rgen) { // rate = samples per second of this unit (sr for .ar, sr/64 for .kr)
    this.rate = rate; this.rg = rgen;
    this.counter = 0; this.slope = 0; this.level = 0; this.curve = 0;
    this.next = rgen.off ? 0 : rgen.frand2(); this.mid = this.next * 0.5;
    this.step(1, null);
  }
  step(n, out, freq = 0) {
    let { level, slope, curve, counter } = this;
    let remain = n, o = 0;
    const rg = this.rg;
    do {
      if (counter <= 0) {
        const value = this.next;
        this.next = rg.off ? 0 : rg.frand2();
        level = this.mid;
        this.mid = (this.next + value) * 0.5;
        counter = Math.max(2, Math.trunc(this.rate / Math.max(freq, 0.001)));
        const fl = counter;
        curve = (2 * (this.mid - level - fl * slope)) / (fl * fl + fl);
      }
      const ns = Math.min(remain, counter);
      remain -= ns; counter -= ns;
      for (let i = 0; i < ns; i++) { if (out) out[o] = level; o++; slope += curve; level += slope; }
    } while (remain);
    this.level = level; this.slope = slope; this.curve = curve; this.counter = counter;
  }
  kr(freq) { const o = this.out1 || (this.out1 = new Float32Array(1)); this.step(1, o, freq); return o[0]; }
  ar(freq, out) { this.step(BS, out, freq); }
}

export class WhiteNoise { constructor(rg) { this.rg = rg; } ar(out) { const rg = this.rg; for (let i = 0; i < BS; i++) out[i] = rg.off ? 0 : rg.frand2(); } }

// Dust (impulses of 0..1) and Dust2 (-1..1) at a random density; the constructor runs one sample
export class Dust {
  constructor(sr, rg, bipolar = false) { this.sd = 1 / sr; this.rg = rg; this.bi = bipolar; this.density = 0; this.thresh = 0; this.scale = 0; this.step(0, null, 1); }
  step(density, out, n = BS) {
    if (density !== this.density) { this.thresh = f32(density * this.sd); this.scale = this.thresh > 0 ? f32((this.bi ? 2 : 1) / this.thresh) : 0; this.density = density; }
    const rg = this.rg, th = this.thresh, sc = this.scale, off = this.bi ? 1 : 0;
    for (let i = 0; i < n; i++) {
      let v = 0;
      if (!rg.off) { const z = rg.frand(); if (z < th) v = f32(z * sc) - off; }
      if (out) out[i] = v;
    }
  }
  ar(density, out) { this.step(density, out); }
}

export class BrownNoise {
  constructor(rg) { this.rg = rg; this.z = rg.off ? 0 : rg.frand2(); }
  ar(out) {
    const rg = this.rg; let z = this.z;
    for (let i = 0; i < BS; i++) { if (!rg.off) { z += rg.frand8(); if (z > 1) z = 2 - z; else if (z < -1) z = -2 - z; } out[i] = rg.off ? 0 : z; }
    this.z = z;
  }
}

export class PinkNoise {
  constructor(rg) {
    this.rg = rg; this.dice = new Uint32Array(16); let total = 0;
    for (let i = 0; i < 16; i++) { const r = rg.off ? 0 : rg.trand() >>> 13; total += r; this.dice[i] = r; }
    this.total = total >>> 0;
    this.ar(new Float32Array(BS), 1);
  }
  ar(out, n = BS) {
    const rg = this.rg, dice = this.dice; let total = this.total;
    for (let i = 0; i < n; i++) {
      if (rg.off) { out[i] = 0; continue; }
      const counter = rg.trand();
      const nr = counter >>> 13;
      const k = (counter === 0 ? 32 : 31 - Math.clz32(counter & -counter)) & 15; // count trailing zeros
      const prev = dice[k]; dice[k] = nr;
      total = (total + nr - prev) >>> 0;
      const r2 = rg.trand() >>> 13;
      U32[0] = (((total + r2) >>> 0) | 0x40000000) >>> 0;
      out[i] = F32[0] - 3;
    }
    this.total = total;
  }
}

// ── LFSaw (control rate) ─────────────────────────────────────────────────────
export class LFSawK {
  constructor(krate, iphase = 0) { this.mul = 2 / krate; this.phase = iphase; }
  kr(freq) { const f = freq * this.mul; const out = this.phase; let p = this.phase + f; if (f >= 0) { if (p >= 1) p -= 2; } else if (p <= -1) p += 2; this.phase = p; return out; }
}

// ── EnvGen (SuperCollider 3.13.0 semantics) ─────────────────────────────────
// env: { levels: [l0, l1, ...], times: [...], curves: number|array }; numbers are
// shape_Curve (5), 'lin' 1, 'exp' 2, 'sin' 3. `rate` is steps per second (sr for .ar,
// sr/64 for .kr). As in 3.13 the constructor runs one control step (EnvGen_next_k)
// and keeps it, segment lengths are whole steps, and a finished envelope holds its
// end level.
export class EnvGen {
  constructor(env, rate, { levelScale = 1, timeScale = 1 } = {}) {
    this.rate = rate; this.ls = levelScale; this.ts = timeScale;
    this.levels = env.levels; this.times = env.times;
    this.shapes = env.times.map((_, i) => {
      const c = Array.isArray(env.curves) ? env.curves[i] : env.curves;
      return typeof c === 'number' ? [5, c] : c === 'lin' ? [1, 0] : c === 'sin' ? [3, 0] : c === 'exp' ? [2, 0] : [1, 0];
    });
    this.level = this.endLevel = env.levels[0] * levelScale;
    this.stage = -1; this.counter = 0; this.shape = 8; this.grow = 0; this.done = false;
    this.k1 = new Float32Array(1);
    this.kr(); // EnvGen_Ctor -> EnvGen_next_k(unit, 1), state kept
  }
  initSegment() {
    const s = this.stage;
    if (this.shape === 8) this.level = this.endLevel; // shape_Hold: start from the previous end level
    const endLevel = this.levels[s + 1] * this.ls;
    const dur = this.times[s] * this.ts;
    const [shape, curve] = this.shapes[s];
    this.shape = shape; this.endLevel = endLevel;
    const counter = Math.max(1, Math.trunc(dur * this.rate));
    this.counter = counter;
    if (counter === 1) this.shape = 1;
    const level = this.level;
    switch (this.shape) {
      case 1: this.grow = (endLevel - level) / counter; break;
      case 2: this.grow = Math.pow(endLevel / level, 1 / counter); break;
      case 3: { const w = Math.PI / counter; this.a2 = (endLevel + level) * 0.5; this.b1 = 2 * Math.cos(w); this.y1 = (endLevel - level) * 0.5; this.y2 = this.y1 * Math.sin(Math.PI * 0.5 - w); this.level = this.a2 - this.y1; break; }
      case 5:
        if (Math.abs(curve) < 0.001) { this.shape = 1; this.grow = (endLevel - level) / counter; }
        else { const a1 = (endLevel - level) / (1 - Math.exp(curve)); this.a2 = level + a1; this.b1 = a1; this.grow = Math.exp(curve / counter); }
        break;
    }
  }
  nextSegment() {
    if (this.stage + 1 >= this.times.length) { this.counter = 0x7fffffff; this.shape = 0; this.level = this.endLevel; this.done = true; return; }
    this.stage++;
    this.initSegment();
  }
  perform(out, o, n) {
    let level = this.level;
    switch (this.shape) {
      case 0: case 8: for (let i = 0; i < n; i++) out[o + i] = level; break;
      case 1: { const g = this.grow; for (let i = 0; i < n; i++) { out[o + i] = level; level += g; } break; }
      case 2: { const g = this.grow; for (let i = 0; i < n; i++) { out[o + i] = level; level *= g; } break; }
      case 3: { let { a2, b1, y1, y2 } = this; for (let i = 0; i < n; i++) { out[o + i] = level; const y0 = b1 * y1 - y2; level = a2 - y0; y2 = y1; y1 = y0; } this.y1 = y1; this.y2 = y2; break; }
      case 5: { const a2 = this.a2, g = this.grow; let b1 = this.b1; for (let i = 0; i < n; i++) { out[o + i] = level; b1 *= g; level = a2 - b1; } this.b1 = b1; break; }
    }
    this.level = level;
  }
  // audio rate: one block (EnvGen_next_ak)
  ar(out) {
    let remain = BS, o = 0;
    while (remain) {
      if (this.counter <= 0) this.nextSegment();
      const ns = Math.min(remain, this.counter);
      this.perform(out, o, ns);
      o += ns; remain -= ns; this.counter -= ns;
    }
  }
  // control rate: one value per block (EnvGen_next_k)
  kr() {
    if (this.counter <= 0) this.nextSegment();
    this.perform(this.k1, 0, 1);
    this.counter--;
    return this.k1[0];
  }
}
export const envDur = (env, ts = 1) => env.times.reduce((a, b) => a + b, 0) * ts;

// ── control-rate value interpolated into an audio block (BinaryOp *_ak) ──────
export class KtoA {
  constructor(v0) { this.prev = v0; }
  fill(next, out) { const p = this.prev, s = (next - p) * SLOPE; for (let i = 0; i < BS; i++) out[i] = p + s * i; this.prev = next; return out; }
}

// ── SC biquads with per-block coefficient ramps ─────────────────────────────
// Generic driver: form 'a0x' (y0 = a0*x + b1*y1 + b2*y2; out = y0 + 2y1 + y2), etc.
class SCBiquad {
  constructor() { this.y1 = 0; this.y2 = 0; this.init = false; }
  // run with coefficient vectors cur -> next; form is a function (x, y0, y1, y2, c) -> out
}

export class LPF {
  constructor(sr) { this.rps = TWOPI / sr; this.y1 = 0; this.y2 = 0; this.freq = NaN; this.a0 = 0; this.b1 = 0; this.b2 = 0; }
  coefs(freq) { const C = 1 / Math.tan(freq * this.rps * 0.5), C2 = C * C, s = C * Math.SQRT2; const a0 = 1 / (1 + s + C2); return [a0, -2 * (1 - C2) * a0, -(1 - s + C2) * a0]; }
  ar(inp, freq, out) {
    let { y1, y2, a0, b1, b2 } = this;
    let da0 = 0, db1 = 0, db2 = 0;
    if (freq !== this.freq) {
      const [na0, nb1, nb2] = this.coefs(freq);
      if (Number.isNaN(this.freq)) { a0 = na0; b1 = nb1; b2 = nb2; }
      else { da0 = (na0 - a0) * FSLOPE; db1 = (nb1 - b1) * FSLOPE; db2 = (nb2 - b2) * FSLOPE; }
      this.freq = freq; this.a0 = na0; this.b1 = nb1; this.b2 = nb2;
    }
    let j = 0;
    for (let l = 0; l < LOOPS; l++) {
      let y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * (y0 + 2 * y1 + y2);
      y2 = inp[j] + b1 * y0 + b2 * y1; out[j++] = a0 * (y2 + 2 * y0 + y1);
      y1 = inp[j] + b1 * y2 + b2 * y0; out[j++] = a0 * (y1 + 2 * y2 + y0);
      a0 += da0; b1 += db1; b2 += db2;
    }
    for (let r = 0; r < REMAIN; r++) { const y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * (y0 + 2 * y1 + y2); y2 = y1; y1 = y0; }
    this.y1 = zap(y1); this.y2 = zap(y2);
  }
}

export class HPF extends LPF {
  coefs(freq) { const C = Math.tan(freq * this.rps * 0.5), C2 = C * C, s = C * Math.SQRT2; const a0 = 1 / (1 + s + C2); return [a0, 2 * (1 - C2) * a0, -(1 - s + C2) * a0]; }
  ar(inp, freq, out) {
    let { y1, y2, a0, b1, b2 } = this;
    let da0 = 0, db1 = 0, db2 = 0;
    if (freq !== this.freq) {
      const [na0, nb1, nb2] = this.coefs(freq);
      if (Number.isNaN(this.freq)) { a0 = na0; b1 = nb1; b2 = nb2; }
      else { da0 = (na0 - a0) * FSLOPE; db1 = (nb1 - b1) * FSLOPE; db2 = (nb2 - b2) * FSLOPE; }
      this.freq = freq; this.a0 = na0; this.b1 = nb1; this.b2 = nb2;
    }
    let j = 0;
    for (let l = 0; l < LOOPS; l++) {
      let y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * (y0 - 2 * y1 + y2);
      y2 = inp[j] + b1 * y0 + b2 * y1; out[j++] = a0 * (y2 - 2 * y0 + y1);
      y1 = inp[j] + b1 * y2 + b2 * y0; out[j++] = a0 * (y1 - 2 * y2 + y0);
      a0 += da0; b1 += db1; b2 += db2;
    }
    for (let r = 0; r < REMAIN; r++) { const y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * (y0 - 2 * y1 + y2); y2 = y1; y1 = y0; }
    this.y1 = zap(y1); this.y2 = zap(y2);
  }
}

// RLPF: y0 = a0*x + b1*y1 + b2*y2, out = y0 + 2y1 + y2
export class RLPF {
  constructor(sr) { this.rps = TWOPI / sr; this.y1 = 0; this.y2 = 0; this.freq = NaN; this.rq = NaN; this.a0 = 0; this.b1 = 0; this.b2 = 0; }
  ar(inp, freq, rq, out) {
    let { y1, y2, a0, b1, b2 } = this;
    let da0 = 0, db1 = 0, db2 = 0;
    if (freq !== this.freq || rq !== this.rq) {
      const q = Math.max(0.001, rq), pf = freq * this.rps;
      const D = Math.tan(pf * q * 0.5), C = (1 - D) / (1 + D), cf = Math.cos(pf);
      const nb1 = (1 + C) * cf, nb2 = -C, na0 = (1 + C - nb1) * 0.25;
      if (Number.isNaN(this.freq)) { a0 = na0; b1 = nb1; b2 = nb2; }
      else { da0 = (na0 - a0) * FSLOPE; db1 = (nb1 - b1) * FSLOPE; db2 = (nb2 - b2) * FSLOPE; }
      this.freq = freq; this.rq = rq; this.a0 = na0; this.b1 = nb1; this.b2 = nb2;
    }
    let j = 0;
    for (let l = 0; l < LOOPS; l++) {
      let y0 = a0 * inp[j] + b1 * y1 + b2 * y2; out[j++] = y0 + 2 * y1 + y2;
      y2 = a0 * inp[j] + b1 * y0 + b2 * y1; out[j++] = y2 + 2 * y0 + y1;
      y1 = a0 * inp[j] + b1 * y2 + b2 * y0; out[j++] = y1 + 2 * y2 + y0;
      a0 += da0; b1 += db1; b2 += db2;
    }
    for (let r = 0; r < REMAIN; r++) { const y0 = a0 * inp[j] + b1 * y1 + b2 * y2; out[j++] = y0 + 2 * y1 + y2; y2 = y1; y1 = y0; }
    this.y1 = zap(y1); this.y2 = zap(y2);
  }
}

// Resonz (a0 slope) and Ringz (a0 = 0.5): y0 = x + b1*y1 + b2*y2, out = a0*(y0 - y2)
export class Resonz {
  constructor(sr) { this.rps = TWOPI / sr; this.y1 = 0; this.y2 = 0; this.freq = NaN; this.rq = NaN; this.a0 = 0; this.b1 = 0; this.b2 = 0; }
  ar(inp, freq, rq, out) {
    let { y1, y2, a0, b1, b2 } = this;
    let da0 = 0, db1 = 0, db2 = 0;
    if (freq !== this.freq || rq !== this.rq) {
      const ff = freq * this.rps, B = ff * rq, R = 1 - B * 0.5, twoR = 2 * R, R2 = R * R;
      const cost = (twoR * Math.cos(ff)) / (1 + R2);
      const nb1 = twoR * cost, nb2 = -R2, na0 = (1 - R2) * 0.5;
      if (Number.isNaN(this.freq)) { a0 = na0; b1 = nb1; b2 = nb2; }
      else { da0 = (na0 - a0) * FSLOPE; db1 = (nb1 - b1) * FSLOPE; db2 = (nb2 - b2) * FSLOPE; }
      this.freq = freq; this.rq = rq; this.a0 = na0; this.b1 = nb1; this.b2 = nb2;
    }
    let j = 0;
    for (let l = 0; l < LOOPS; l++) {
      let y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * (y0 - y2);
      y2 = inp[j] + b1 * y0 + b2 * y1; out[j++] = a0 * (y2 - y1);
      y1 = inp[j] + b1 * y2 + b2 * y0; out[j++] = a0 * (y1 - y0);
      a0 += da0; b1 += db1; b2 += db2;
    }
    for (let r = 0; r < REMAIN; r++) { const y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * (y0 - y2); y2 = y1; y1 = y0; }
    this.y1 = zap(y1); this.y2 = zap(y2);
  }
}

export class Ringz {
  constructor(sr) { this.sr = sr; this.rps = TWOPI / sr; this.y1 = 0; this.y2 = 0; this.freq = NaN; this.dt = NaN; this.b1 = 0; this.b2 = 0; }
  // adds amp * output into acc (DynKlank sums its resonators)
  arAdd(inp, freq, decayTime, amp, acc) {
    let { y1, y2, b1, b2 } = this;
    let db1 = 0, db2 = 0;
    if (freq !== this.freq || decayTime !== this.dt) {
      const ff = freq * this.rps;
      const R = decayTime === 0 ? 0 : Math.exp(LOG001 / (decayTime * this.sr));
      const twoR = 2 * R, R2 = R * R, cost = (twoR * Math.cos(ff)) / (1 + R2);
      const nb1 = twoR * cost, nb2 = -R2;
      if (Number.isNaN(this.freq)) { b1 = nb1; b2 = nb2; }
      else { db1 = (nb1 - b1) * FSLOPE; db2 = (nb2 - b2) * FSLOPE; }
      this.freq = freq; this.dt = decayTime; this.b1 = nb1; this.b2 = nb2;
    }
    let j = 0;
    for (let l = 0; l < LOOPS; l++) {
      let y0 = inp[j] + b1 * y1 + b2 * y2; acc[j++] += f32(0.5 * (y0 - y2)) * amp;
      y2 = inp[j] + b1 * y0 + b2 * y1; acc[j++] += f32(0.5 * (y2 - y1)) * amp;
      y1 = inp[j] + b1 * y2 + b2 * y0; acc[j++] += f32(0.5 * (y1 - y0)) * amp;
      b1 += db1; b2 += db2;
    }
    for (let r = 0; r < REMAIN; r++) { const y0 = inp[j] + b1 * y1 + b2 * y2; acc[j++] += f32(0.5 * (y0 - y2)) * amp; y2 = y1; y1 = y0; }
    this.y1 = zap(y1); this.y2 = zap(y2);
  }
}

// Formlet: a resonator with a soft attack (a Ringz of the decay time minus one of the attack
// time), out = 0.25 * ((y00 - y02) - (y10 - y12)); adds amp * output into acc
export class Formlet {
  constructor(sr) { this.sr = sr; this.rps = TWOPI / sr; this.y01 = 0; this.y02 = 0; this.y11 = 0; this.y12 = 0; this.b01 = 0; this.b02 = 0; this.b11 = 0; this.b12 = 0; this.key = null; }
  coefs(ff, t) { const R = t === 0 ? 0 : Math.exp(LOG001 / (t * this.sr)), twoR = 2 * R, R2 = R * R, cost = (twoR * Math.cos(ff)) / (1 + R2); return [twoR * cost, -R2]; }
  arAdd(inp, freq, attackTime, decayTime, amp, acc) {
    let { y01, y02, y11, y12, b01, b02, b11, b12 } = this;
    let s01 = 0, s02 = 0, s11 = 0, s12 = 0;
    const key = freq * 1e6 + decayTime * 1e3 + attackTime;
    if (key !== this.key) {
      const ff = freq * this.rps, [n01, n02] = this.coefs(ff, decayTime), [n11, n12] = this.coefs(ff, attackTime);
      if (this.key === null) { b01 = n01; b02 = n02; b11 = n11; b12 = n12; } // the constructor's first sample sets them
      else { s01 = (n01 - b01) * FSLOPE; s02 = (n02 - b02) * FSLOPE; s11 = (n11 - b11) * FSLOPE; s12 = (n12 - b12) * FSLOPE; }
      this.key = key; this.b01 = n01; this.b02 = n02; this.b11 = n11; this.b12 = n12;
    }
    let j = 0, y00, y10;
    for (let l = 0; l < LOOPS; l++) {
      let a = inp[j]; y00 = a + b01 * y01 + b02 * y02; y10 = a + b11 * y11 + b12 * y12; acc[j++] += f32(0.25 * ((y00 - y02) - (y10 - y12))) * amp;
      a = inp[j]; y02 = a + b01 * y00 + b02 * y01; y12 = a + b11 * y10 + b12 * y11; acc[j++] += f32(0.25 * ((y02 - y01) - (y12 - y11))) * amp;
      a = inp[j]; y01 = a + b01 * y02 + b02 * y00; y11 = a + b11 * y12 + b12 * y10; acc[j++] += f32(0.25 * ((y01 - y00) - (y11 - y10))) * amp;
      b01 += s01; b02 += s02; b11 += s11; b12 += s12;
    }
    for (let r = 0; r < REMAIN; r++) {
      const a = inp[j]; y00 = a + b01 * y01 + b02 * y02; y10 = a + b11 * y11 + b12 * y12; acc[j++] += f32(0.25 * ((y00 - y02) - (y10 - y12))) * amp;
      y02 = y01; y01 = y00; y12 = y11; y11 = y10;
    }
    this.y01 = zap(y01); this.y02 = zap(y02); this.y11 = zap(y11); this.y12 = zap(y12);
  }
}

// BPF (used by the wood / bite clicks)
export class BPF {
  constructor(sr) { this.rps = TWOPI / sr; this.y1 = 0; this.y2 = 0; this.freq = NaN; this.bw = NaN; this.a0 = 0; this.b1 = 0; this.b2 = 0; }
  ar(inp, freq, bw, out) {
    let { y1, y2, a0, b1, b2 } = this;
    let da0 = 0, db1 = 0, db2 = 0;
    if (freq !== this.freq || bw !== this.bw) {
      const pf = freq * this.rps, pbw = bw * pf * 0.5;
      const C = 1 / Math.tan(pbw), D = 2 * Math.cos(pf);
      const na0 = 1 / (1 + C), nb1 = C * D * na0, nb2 = (1 - C) * na0;
      if (Number.isNaN(this.freq)) { a0 = na0; b1 = nb1; b2 = nb2; }
      else { da0 = (na0 - a0) * FSLOPE; db1 = (nb1 - b1) * FSLOPE; db2 = (nb2 - b2) * FSLOPE; }
      this.freq = freq; this.bw = bw; this.a0 = na0; this.b1 = nb1; this.b2 = nb2;
    }
    let j = 0;
    for (let l = 0; l < LOOPS; l++) {
      let y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * (y0 - y2);
      y2 = inp[j] + b1 * y0 + b2 * y1; out[j++] = a0 * (y2 - y1);
      y1 = inp[j] + b1 * y2 + b2 * y0; out[j++] = a0 * (y1 - y0);
      a0 += da0; b1 += db1; b2 += db2;
    }
    for (let r = 0; r < REMAIN; r++) { const y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * (y0 - y2); y2 = y1; y1 = y0; }
    this.y1 = zap(y1); this.y2 = zap(y2);
  }
}

// BEQSuite: BLowPass, BLowShelf, BHiShelf (y0 = x + b1 y1 + b2 y2; out = a0 y0 + a1 y1 + a2 y2)
class BEQ {
  constructor(sr) { this.sd = 1 / sr; this.y1 = 0; this.y2 = 0; this.key = null; this.c = null; }
  run(inp, key, coefFn, out) {
    let { y1, y2 } = this;
    let [a0, a1, a2, b1, b2] = this.c || [0, 0, 0, 0, 0];
    let s = null;
    if (key !== this.key) {
      const n = coefFn();
      if (this.key === null) [a0, a1, a2, b1, b2] = n;
      else s = n.map((v, i) => (v - [a0, a1, a2, b1, b2][i]) * FSLOPE);
      this.key = key; this.c = n;
    }
    let j = 0;
    for (let l = 0; l < LOOPS; l++) {
      const i0 = inp[j], i1 = inp[j + 1], i2 = inp[j + 2];
      const y0 = i0 + b1 * y1 + b2 * y2; out[j++] = a0 * y0 + a1 * y1 + a2 * y2;
      y2 = i1 + b1 * y0 + b2 * y1; out[j++] = a0 * y2 + a1 * y0 + a2 * y1;
      y1 = i2 + b1 * y2 + b2 * y0; out[j++] = a0 * y1 + a1 * y2 + a2 * y0;
      if (s) { a0 += s[0]; a1 += s[1]; a2 += s[2]; b1 += s[3]; b2 += s[4]; }
    }
    for (let r = 0; r < REMAIN; r++) { const y0 = inp[j] + b1 * y1 + b2 * y2; out[j++] = a0 * y0 + a1 * y1 + a2 * y2; y2 = y1; y1 = y0; }
    this.y1 = zap(y1); this.y2 = zap(y2);
  }
}
export class BLowPass extends BEQ {
  ar(inp, freq, rq, out) {
    this.run(inp, freq * 1e6 + rq, () => {
      const w0 = TWOPI * freq * this.sd, c = Math.cos(w0), i = 1 - c, alpha = Math.sin(w0) * 0.5 * rq, b0rz = 1 / (1 + alpha);
      const a0 = i * 0.5 * b0rz;
      return [a0, i * b0rz, a0, c * 2 * b0rz, (1 - alpha) * -b0rz];
    }, out);
  }
}
export class BLowShelf extends BEQ {
  ar(inp, freq, rs, db, out) {
    this.run(inp, `${freq}:${rs}:${db}`, () => {
      const a = Math.pow(10, db * 0.025), w0 = TWOPI * freq * this.sd, s = Math.sin(w0), c = Math.cos(w0);
      const alpha = s * 0.5 * Math.sqrt((a + 1 / a) * (rs - 1) + 2), i = (a + 1) * c, j = (a - 1) * c, k = 2 * Math.sqrt(a) * alpha;
      const b0rz = 1 / ((a + 1) + j + k);
      return [a * ((a + 1) - j + k) * b0rz, 2 * a * ((a - 1) - i) * b0rz, a * ((a + 1) - j - k) * b0rz, 2 * ((a - 1) + i) * b0rz, ((a + 1) + j - k) * -b0rz];
    }, out);
  }
}
export class BHiShelf extends BEQ {
  ar(inp, freq, rs, db, out) {
    this.run(inp, `${freq}:${rs}:${db}`, () => {
      const a = Math.pow(10, db * 0.025), w0 = TWOPI * freq * this.sd, s = Math.sin(w0), c = Math.cos(w0);
      const alpha = s * 0.5 * Math.sqrt((a + 1 / a) * (rs - 1) + 2), i = (a + 1) * c, j = (a - 1) * c, k = 2 * Math.sqrt(a) * alpha;
      const b0rz = 1 / ((a + 1) - j + k);
      return [a * ((a + 1) + j + k) * b0rz, -2 * a * ((a - 1) + i) * b0rz, a * ((a + 1) + j - k) * b0rz, -2 * ((a - 1) - i) * b0rz, ((a + 1) - j - k) * -b0rz];
    }, out);
  }
}

// MoogFF (Fontana's model), freq read once per block, gain (k) ramped
export class MoogFF {
  constructor(sr, k0) { this.sr = sr; this.sd = 1 / sr; this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0; this.freq = NaN; this.b0 = 0; this.a1 = 0; this.k = k0; }
  ar(inp, freq, kIn, out) {
    const k1 = Math.min(4, Math.max(0, kIn));
    let { s1, s2, s3, s4, b0, a1 } = this;
    if (freq !== this.freq) {
      let wcD = 2 * Math.tan(this.sd * Math.PI * freq) * this.sr; if (wcD < 0) wcD = 0;
      const TwcD = this.sd * wcD;
      b0 = TwcD / (TwcD + 2); a1 = (TwcD - 2) / (TwcD + 2);
      this.freq = freq; this.b0 = b0; this.a1 = a1;
    }
    let k = this.k; const ks = k1 === k ? 0 : (k1 - k) * SLOPE;
    const b04 = b0 * b0 * b0 * b0;
    for (let i = 0; i < BS; i++) {
      const o = s4 + b0 * (s3 + b0 * (s2 + b0 * s1));
      const ins = inp[i];
      const outs = (b04 * ins + o) / (1 + b04 * k);
      out[i] = outs;
      const u = ins - k * outs;
      let past = u, future = b0 * past + s1; s1 = b0 * past - a1 * future;
      past = future; future = b0 * past + s2; s2 = b0 * past - a1 * future;
      past = future; future = b0 * past + s3; s3 = b0 * past - a1 * future;
      s4 = b0 * future - a1 * outs;
      k += ks;
    }
    this.k = k1;
    this.s1 = zap(s1); this.s2 = zap(s2); this.s3 = zap(s3); this.s4 = zap(s4);
  }
}

// Lag / LagUD / Decay2 / LeakDC
export class Lag {
  constructor(rate, y0 = 0) { this.rate = rate; this.y1 = y0; this.b1 = 0; this.lag = NaN; }
  coef(lag) { return lag === 0 ? 0 : Math.exp(LOG001 / (lag * this.rate)); }
  kr(x, lag) {
    if (lag !== this.lag) { const nb = this.coef(lag); this.b1 = Number.isNaN(this.lag) ? nb : nb; this.lag = lag; }
    this.y1 = x + this.b1 * (this.y1 - x);
    return this.y1;
  }
}
export class LagUD {
  constructor(rate) { this.rate = rate; this.y1 = 0; this.bu = 0; this.bd = 0; this.lu = NaN; this.ld = NaN; }
  ar(inp, lagu, lagd, out) {
    let y1 = this.y1, bu = this.bu, bd = this.bd;
    if (Number.isNaN(this.lu)) { // LagUD_Ctor
      bu = this.bu = lagu === 0 ? 0 : Math.exp(LOG001 / (lagu * this.rate)); bd = this.bd = lagd === 0 ? 0 : Math.exp(LOG001 / (lagd * this.rate));
      this.lu = lagu; this.ld = lagd;
    }
    if (lagu === this.lu && lagd === this.ld) {
      for (let i = 0; i < BS; i++) { const y0 = inp[i]; y1 = y0 > y1 ? y0 + bu * (y1 - y0) : y0 + bd * (y1 - y0); out[i] = y1; }
    } else {
      const nbu = lagu === 0 ? 0 : Math.exp(LOG001 / (lagu * this.rate)), nbd = lagd === 0 ? 0 : Math.exp(LOG001 / (lagd * this.rate));
      const su = (nbu - bu) * SLOPE, sd = (nbd - bd) * SLOPE;
      for (let i = 0; i < BS; i++) { bu += su; bd += sd; const y0 = inp[i]; y1 = y0 > y1 ? y0 + bu * (y1 - y0) : y0 + bd * (y1 - y0); out[i] = y1; }
      this.bu = nbu; this.bd = nbd; this.lu = lagu; this.ld = lagd;
    }
    this.y1 = zap(y1);
  }
}
export class Decay2 {
  constructor(sr) { this.sr = sr; this.ya = 0; this.yb = 0; this.ba = 0; this.bb = 0; this.at = NaN; this.dt = NaN; }
  ar(inp, attack, decay, out) {
    if (Number.isNaN(this.dt)) { // Decay2_Ctor (3.13): coefficients set, state seeded with the first input sample
      this.ba = decay === 0 ? 0 : Math.exp(LOG001 / (decay * this.sr)); this.bb = attack === 0 ? 0 : Math.exp(LOG001 / (attack * this.sr));
      this.dt = decay; this.at = attack; this.ya = this.yb = inp[0];
    }
    let { ya, yb, ba, bb } = this;
    if (decay === this.dt && attack === this.at) {
      for (let i = 0; i < BS; i++) { const y0 = inp[i]; ya = y0 + ba * ya; yb = y0 + bb * yb; out[i] = ya - yb; }
    } else {
      const na = decay === 0 ? 0 : Math.exp(LOG001 / (decay * this.sr)), nb = attack === 0 ? 0 : Math.exp(LOG001 / (attack * this.sr));
      const sa = (na - ba) * SLOPE, sb = (nb - bb) * SLOPE;
      for (let i = 0; i < BS; i++) { const y0 = inp[i]; ya = y0 + ba * ya; yb = y0 + bb * yb; out[i] = ya - yb; ba += sa; bb += sb; }
      this.dt = decay; this.at = attack;
    }
    this.ya = ya; this.yb = yb; this.ba = ba; this.bb = bb;
  }
}
export class LeakDC {
  constructor(b1 = 0.995) { this.b1 = b1; this.x1 = 0; this.y1 = 0; }
  ar(inp, out) { let { x1, y1 } = this; const b1 = this.b1; for (let i = 0; i < BS; i++) { const x0 = inp[i]; y1 = x0 - x1 + b1 * y1; out[i] = y1; x1 = x0; } this.x1 = x1; this.y1 = zap(y1); }
}

// Compander (gain computed per block from the control signal's peak follower)
export class Compander {
  constructor(sr) { this.sr = sr; this.gain = 1; this.prevmax = 0; this.clamp = NaN; this.relax = NaN; this.cc = 0; this.rc = 0; }
  ar(inp, ctl, thresh, below, above, clamp, relax, out) {
    if (clamp !== this.clamp) { this.cc = clamp === 0 ? 0 : Math.exp(LOG1 / (clamp * this.sr)); this.clamp = clamp; }
    if (relax !== this.relax) { this.rc = relax === 0 ? 0 : Math.exp(LOG1 / (relax * this.sr)); this.relax = relax; }
    let pm = this.prevmax; const rc = this.rc, cc = this.cc;
    for (let i = 0; i < BS; i++) { let v = Math.abs(ctl[i]); v = v < pm ? v + (pm - v) * rc : v + (pm - v) * cc; pm = v; }
    this.prevmax = pm;
    let ng;
    if (pm < thresh) { ng = below === 1 ? 1 : Math.pow(pm / thresh, below - 1); const a = Math.abs(ng); ng = a < 1e-15 ? 0 : a > 1e15 ? 1 : ng; }
    else ng = above === 1 ? 1 : Math.pow(pm / thresh, above - 1);
    let g = this.gain; const gs = (ng - g) * SLOPE;
    for (let i = 0; i < BS; i++) { out[i] = inp[i] * g; g += gs; }
    this.gain = g;
  }
}

// Limiter: lookahead of two buffers of `dur` seconds (output delayed by 2 * dur)
export class Limiter {
  constructor(sr, dur) {
    this.size = Math.ceil(dur * sr);
    this.bufs = [new Float32Array(this.size), new Float32Array(this.size), new Float32Array(this.size)]; // in, mid, out
    this.flips = 0; this.pos = 0; this.slope = 0; this.level = 1; this.prevmax = 0; this.curmax = 0; this.sf = 1 / this.size;
  }
  ar(inp, amp, out) {
    let { pos, slope, level, curmax } = this;
    let remain = BS, o = 0;
    while (remain > 0) {
      const ns = Math.min(remain, this.size - pos);
      const [xin, , xout] = this.bufs;
      if (this.flips >= 2) {
        for (let i = 0; i < ns; i++) { const v = inp[o + i]; xin[pos + i] = v; out[o + i] = level * xout[pos + i]; level += slope; const a = Math.abs(v); if (a > curmax) curmax = a; }
      } else {
        for (let i = 0; i < ns; i++) { const v = inp[o + i]; xin[pos + i] = v; out[o + i] = 0; level += slope; const a = Math.abs(v); if (a > curmax) curmax = a; }
      }
      pos += ns; o += ns; remain -= ns;
      if (pos >= this.size) {
        pos = 0;
        const m2 = Math.max(this.prevmax, curmax);
        this.prevmax = curmax; curmax = 0;
        const nl = m2 > amp ? amp / m2 : 1;
        slope = this.slope = (nl - level) * this.sf;
        const [i0, m0, o0] = this.bufs; this.bufs = [o0, i0, m0]; // in <- out, mid <- in, out <- mid
        this.flips++;
      }
    }
    this.pos = pos; this.level = level; this.curmax = curmax;
  }
}

// ── delays (power-of-two ring buffers, as DelayUnit_AllocDelayLine) ─────────
const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(n));
const cubic = (x, y0, y1, y2, y3) => {
  const c0 = y1, c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * x + c2) * x + c1) * x + c0;
};
class DelayLine {
  constructor(sr, maxDelay, minSamples) {
    this.sr = sr; this.len = nextPow2(Math.ceil(maxDelay * sr + 1) + BS); this.mask = this.len - 1;
    this.buf = new Float32Array(this.len); this.w = 0; this.min = minSamples; this.dsamp = NaN; this.dt = NaN;
  }
  calc(dt) { return Math.min(Math.max(dt * this.sr, this.min), this.len); }
}
export class DelayN extends DelayLine {
  constructor(sr, maxDelay) { super(sr, maxDelay, 1); }
  ar(inp, dt, out) { // constant delay time
    const ds = Math.trunc(this.calc(dt)); const b = this.buf, m = this.mask; let w = this.w;
    for (let i = 0; i < BS; i++) { b[w & m] = inp[i]; out[i] = b[(w - ds) & m]; w++; }
    this.w = w;
  }
}
export class DelayC extends DelayLine {
  constructor(sr, maxDelay) { super(sr, maxDelay, 2); }
  // control-rate delay time (slewed across the block when it changes)
  kr(inp, dt, out) {
    const b = this.buf, m = this.mask; let w = this.w;
    let ds = this.dsamp, sl = 0;
    if (Number.isNaN(ds)) { ds = this.calc(dt); this.dt = dt; }
    else if (dt !== this.dt) { const n = this.calc(dt); sl = (n - ds) * SLOPE; this.dt = dt; }
    for (let i = 0; i < BS; i++) {
      ds += sl;
      const id = Math.trunc(ds), fr = ds - id;
      b[w & m] = inp[i];
      const r1 = w - id;
      out[i] = cubic(fr, b[(r1 + 1) & m], b[r1 & m], b[(r1 - 1) & m], b[(r1 - 2) & m]);
      w++;
    }
    this.dsamp = ds; this.w = w;
  }
  // audio-rate delay time
  ar(inp, dtA, out) {
    const b = this.buf, m = this.mask; let w = this.w;
    for (let i = 0; i < BS; i++) {
      const ds = this.calc(dtA[i]), id = Math.trunc(ds), fr = ds - id;
      b[w & m] = inp[i];
      const r1 = w - id;
      out[i] = cubic(fr, b[(r1 + 1) & m], b[r1 & m], b[(r1 - 1) & m], b[(r1 - 2) & m]);
      w++;
    }
    this.w = w;
  }
}
export class AllpassC extends DelayLine {
  constructor(sr, maxDelay) { super(sr, maxDelay, 2); }
  ar(inp, dt, decay, out) { // constant delay and decay time
    const ds = this.calc(dt), id = Math.trunc(ds), fr = ds - id;
    const fb = dt === 0 || decay === 0 ? 0 : Math.sign(decay) * Math.exp((LOG001 * dt) / Math.abs(decay));
    const b = this.buf, m = this.mask; let w = this.w;
    for (let i = 0; i < BS; i++) {
      const r1 = w - id;
      const v = cubic(fr, b[(r1 + 1) & m], b[r1 & m], b[(r1 - 1) & m], b[(r1 - 2) & m]);
      const dwr = inp[i] + fb * v;
      b[w & m] = dwr;
      out[i] = v - fb * dwr;
      w++;
    }
    this.w = w;
  }
}

// ── Pluck: Karplus-Strong string (DelayUGens.cpp Pluck_next_kk) ─────────────
// A cubic-interpolated feedback delay with a one-pole lowpass in the loop. After a trigger the
// input is let in for one delay time; the loop then rings, darker the larger coef. Delay, decay
// and coef are control rate and slewed across the block when they change. The buffer starts
// zeroed, where scsynth's Pluck_next_kk_z reads the unwritten part as zeros: the same output.
export class Pluck extends DelayLine {
  constructor(sr, maxDelay) { super(sr, maxDelay, 2); this.last = 0; this.prevtrig = 0; this.inputs = 0; this.fb = NaN; this.coef = NaN; this.dec = NaN; }
  kk(inp, trig, dt, decay, coef, out) {
    const f = Math.fround, b = this.buf, m = this.mask, sr = this.sr;
    const calc = (d) => Math.min(Math.max(f(f(d) * f(sr)), this.min), this.len);
    const feedback = (d, dec) => (d === 0 || dec === 0 ? 0 : Math.sign(dec) * f(Math.exp((LOG001 * d) / Math.abs(dec))));
    if (Number.isNaN(this.fb)) { this.dsamp = calc(dt); this.dt = dt; this.dec = decay; this.fb = feedback(dt, decay); this.coef = coef; }
    if (this.prevtrig <= 0 && trig > 0) this.inputs = Math.trunc(dt * sr + 0.5);
    this.prevtrig = trig;
    let w = this.w, last = this.last, inputs = this.inputs, ds = this.dsamp, fb = this.fb, c = this.coef;
    let dsl = 0, fbl = 0, cl = 0;
    if (dt !== this.dt || decay !== this.dec || coef !== this.coef) {
      dsl = (calc(dt) - ds) * SLOPE; fbl = (feedback(dt, decay) - fb) * SLOPE; cl = (coef - c) * SLOPE;
    }
    for (let i = 0; i < BS; i++) {
      if (dsl) ds = f(ds + dsl);
      const id = Math.trunc(ds), fr = f(ds - id), r1 = w - id;
      const x = inputs > 0 ? (inputs--, inp[i]) : 0;
      const v = f(cubic(fr, b[(r1 + 1) & m], b[r1 & m], b[(r1 - 1) & m], b[(r1 - 2) & m]));
      const op = f((1 - Math.abs(c)) * v + c * last);
      b[w & m] = f(x + f(fb * op));
      out[i] = last = op;
      if (fbl) fb = f(fb + fbl);
      if (cl) c = f(c + cl);
      w++;
    }
    if (dsl || fbl || cl) { this.dt = dt; this.dec = decay; this.coef = coef; this.fb = fb; this.dsamp = ds; }
    this.w = w; this.last = zap(last); this.inputs = inputs;
  }
}

// ── panning (equal-power from the 8192-point sine table, 2049 positions) ─────
const panAmps = (pos, level) => {
  const ip = Math.min(2048, Math.max(0, Math.trunc(1024 * pos + 1024 + 0.5)));
  return [level * SINE[2048 - ip], level * SINE[ip]];
};
export class Pan2 {
  constructor(pos0, level0 = 1) { this.pos = pos0; this.level = level0; [this.la, this.ra] = panAmps(pos0, level0); }
  addK(inp, pos, level, L, R) { // adds into L/R
    let la = this.la, ra = this.ra, ls = 0, rs = 0;
    if (pos !== this.pos || level !== this.level) {
      const [nl, nr] = panAmps(pos, level); ls = (nl - la) * SLOPE; rs = (nr - ra) * SLOPE;
      this.pos = pos; this.level = level; this.la = nl; this.ra = nr;
    }
    for (let i = 0; i < BS; i++) { const z = inp[i]; L[i] += z * la; R[i] += z * ra; la += ls; ra += rs; }
  }
}
export class Balance2 extends Pan2 {
  addK2(inL, inR, pos, level, L, R) {
    let la = this.la, ra = this.ra, ls = 0, rs = 0;
    if (pos !== this.pos || level !== this.level) {
      const [nl, nr] = panAmps(pos, level); ls = (nl - la) * SLOPE; rs = (nr - ra) * SLOPE;
      this.pos = pos; this.level = level; this.la = nl; this.ra = nr;
    }
    for (let i = 0; i < BS; i++) { L[i] += inL[i] * la; R[i] += inR[i] * ra; la += ls; ra += rs; }
  }
}
