// The soundtrack's synth voices, effects and master bus: line-by-line translations of the
// SuperCollider SynthDefs in the original tidemote_soundtrack.scd, built from the UGen
// ports in ugens.js. Rates follow the SynthDefs: SynthDef arguments are control rate,
// `.kr` units step once per block, control values that multiply audio are ramped across
// the block (BinaryOpUGen *_ak), filters read cutoffs at the start of each block.

import {
  BS, RGen, SinOsc, LFNoise2, WhiteNoise, BrownNoise, PinkNoise, EnvGen, KtoA, LPF, HPF, RLPF, Resonz,
  Ringz, BPF, BLowPass, BLowShelf, BHiShelf, MoogFF, Lag, LagUD, Decay2, LeakDC, Compander, Limiter,
  DelayN, DelayC, AllpassC, Pan2, Balance2, Dust, sinTable,
} from './ugens.js';

const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clip = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const f32 = Math.fround;

// a pool of scratch blocks shared by every voice (voices run one after another)
class Scratch {
  constructor(n = 48) { this.b = Array.from({ length: n }, () => new Float32Array(BS)); this.i = 0; }
  reset() { this.i = 0; }
  get() { const a = this.b[this.i++]; if (!a) throw new Error('scratch exhausted'); return a; }
  zero() { const a = this.get(); a.fill(0); return a; }
}

// buses as in the SuperCollider score: dry 64, reverb send 66, delay send 68 (all stereo)
export class Buses {
  constructor() { this.dryL = new Float32Array(BS); this.dryR = new Float32Array(BS); this.revL = new Float32Array(BS); this.revR = new Float32Array(BS); this.dlyL = new Float32Array(BS); this.dlyR = new Float32Array(BS); }
  clear() { this.dryL.fill(0); this.dryR.fill(0); this.revL.fill(0); this.revR.fill(0); this.dlyL.fill(0); this.dlyR.fill(0); }
}

// Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly)
function outAll(B, L, R, rev, dly, send = 1) {
  const g = send;
  for (let i = 0; i < BS; i++) {
    const l = L[i] * g, r = R[i] * g;
    B.dryL[i] += l; B.dryR[i] += r;
    if (rev) { B.revL[i] += l * rev; B.revR[i] += r * rev; }
    if (dly) { B.dlyL[i] += l * dly; B.dlyR[i] += r * dly; }
  }
}

// Line.kr(0, 0, dur, doneAction: 2): the synth lives this many control blocks
const lineBlocks = (dur, kr) => Math.max(1, Math.trunc(dur * kr + 0.5));
const perc = (atk, rel, level, curve) => ({ levels: [0, level, 0], times: [atk, rel], curves: curve });

class Voice {
  constructor(eng, p) {
    this.eng = eng; this.sr = eng.sr; this.kr = eng.kr; this.p = p; this.done = false;
    this.rg = new RGen(eng.nextSeed()); this.rg.off = eng.noiseOff;
    this.age = 0; this.send = p.send ?? 1; // spatial send gain (the in-page mix sets this per note)
  }
  tick(B, S) { this.render(B, S); this.age++; }
}

// ── \cplx: Buchla complex oscillator → sine wavefolder → lowpass gate ───────
export class Cplx extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const { atk = 0.003, dec = 0.3 } = p;
    this.env = new EnvGen(perc(atk, dec, 1, -5), this.sr);
    this.lpg = new LagUD(this.sr);
    this.n1 = new LFNoise2(this.kr, this.rg);
    this.mod = new SinOsc(this.sr); this.carL = new SinOsc(this.sr); this.carR = new SinOsc(this.sr);
    this.subL = new SinOsc(this.sr); this.subR = new SinOsc(this.sr);
    this.mfL = new MoogFF(this.sr, 0.3); this.mfR = new MoogFF(this.sr, 0.3);
    this.bal = new Balance2(p.pan ?? 0, 1);
    this.life = lineBlocks(atk + dec * 1.6 + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 440, ratio = p.ratio ?? 2, index = p.index ?? 1, fold = p.fold ?? 1;
    const bright = p.bright ?? 0.5, amp = p.amp ?? 0.1, dec = p.dec ?? 0.3;
    const venv = S.get(), lpg = S.get(), mod = S.get(), ph = S.get(), cL = S.get(), cR = S.get(), sL = S.get(), sR = S.get();
    this.env.ar(venv);
    this.lpg.ar(venv, 0.0005, dec * 0.3, lpg);
    const nz = this.n1.kr(0.3) * 0.4;
    this.mod.kk(f32(freq * ratio + nz), mod);
    for (let i = 0; i < BS; i++) ph[i] = mod[i] * (index * (0.3 + 0.7 * lpg[i]));
    this.carL.ka(freq, ph, cL); this.carR.ka(f32(freq * 1.0023), ph, cR);
    const fk = Math.min(fold, 2400 / freq);
    this.subL.kk(freq, sL); this.subR.kk(f32(freq * 1.0023), sR);
    for (let i = 0; i < BS; i++) {
      const g = fk * (0.35 + 0.65 * lpg[i]);
      cL[i] = Math.sin(cL[i] * g) * 0.6 + sL[i] * 0.4;
      cR[i] = Math.sin(cR[i] * g) * 0.6 + sR[i] * 0.4;
    }
    const cut = clip(freq * 1.2 + lpg[0] * lpg[0] * bright * 9000, 40, 12000); // MoogFF reads IN0(1)
    this.mfL.ar(cL, cut, 0.3, sL); this.mfR.ar(cR, cut, 0.3, sR);
    for (let i = 0; i < BS; i++) {
      const l = sL[i] * 1.6, r = sR[i] * 1.6;
      cL[i] = (l + r * 0.3) * 0.77; cR[i] = (r + l * 0.3) * 0.77;
    }
    const L = S.zero(), R = S.zero();
    this.bal.addK2(cL, cR, p.pan ?? 0, 1, L, R);
    for (let i = 0; i < BS; i++) { const g = lpg[i] * amp * 0.6; L[i] *= g; R[i] *= g; }
    outAll(B, L, R, p.rev ?? 0.2, p.dly ?? 0.1, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \swell: legato bloom ─────────────────────────────────────────────────────
export class Swell extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const { atk = 0.3, hold = 0.3, rel = 0.9 } = p;
    this.env = new EnvGen({ levels: [0, 1, 0.75, 0], times: [atk, hold, rel], curves: [2, -1, -3] }, this.sr);
    this.n1 = new LFNoise2(this.kr, this.rg);
    this.mod = new SinOsc(this.sr); this.carL = new SinOsc(this.sr); this.carR = new SinOsc(this.sr);
    this.rL = new RLPF(this.sr); this.rR = new RLPF(this.sr); this.lL = new LPF(this.sr); this.lR = new LPF(this.sr);
    this.bal = new Balance2(p.pan ?? 0, 1);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 440, ratio = p.ratio ?? 2, index = p.index ?? 1, fold = p.fold ?? 1.5;
    const bright = p.bright ?? 0.5, amp = p.amp ?? 0.1;
    const env = S.get(), mod = S.get(), ph = S.get(), cL = S.get(), cR = S.get(), t1 = S.get(), t2 = S.get();
    this.env.ar(env);
    const nz = this.n1.kr(0.2) * 0.001;
    this.mod.kk(f32(freq * ratio * (1 + nz)), mod);
    for (let i = 0; i < BS; i++) ph[i] = mod[i] * index * (0.4 + 0.6 * env[i] * env[i]);
    this.carL.ka(freq, ph, cL); this.carR.ka(f32(freq * 1.003), ph, cR);
    const fk = Math.min(fold, 2400 / freq);
    for (let i = 0; i < BS; i++) { const g = fk * (0.5 + 0.5 * env[i] * env[i]); cL[i] = Math.sin(cL[i] * g); cR[i] = Math.sin(cR[i] * g); }
    const cut = clip(freq + env[0] * env[0] * bright * 8000, 40, 11000);
    this.rL.ar(cL, cut, 0.55, t1); this.lL.ar(t1, f32(cut * 1.5), cL);
    this.rR.ar(cR, cut, 0.55, t2); this.lR.ar(t2, f32(cut * 1.5), cR);
    for (let i = 0; i < BS; i++) { const l = cL[i], r = cR[i]; t1[i] = (l + r * 0.3) * 0.77; t2[i] = (r + l * 0.3) * 0.77; }
    const L = S.zero(), R = S.zero();
    this.bal.addK2(t1, t2, p.pan ?? 0, 1, L, R);
    for (let i = 0; i < BS; i++) { const g = env[i] * amp * 0.6; L[i] *= g; R[i] *= g; }
    outAll(B, L, R, p.rev ?? 0.3, p.dly ?? 0.1, this.send);
    if (this.env.done) this.done = true;
  }
}

// DynKlank: a bank of Ringz resonators summed (freqscale applied to the frequencies)
class Klank {
  constructor(sr, n) { this.r = Array.from({ length: n }, () => new Ringz(sr)); }
  ar(exc, freqs, amps, rings, out) { out.fill(0); for (let i = 0; i < this.r.length; i++) this.r[i].arAdd(exc, f32(freqs[i]), rings[i], amps[i], out); }
}

// ── \glass: singing glass (modal resonators bowed by noise) ──────────────────
export class Glass extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const { atk = 1.5, sus = 2, rel = 4 } = p;
    this.env = new EnvGen({ levels: [0, 1, 0.8, 0], times: [atk, sus, rel], curves: [1.5, 0, -3] }, this.kr);
    this.pink = new PinkNoise(this.rg);
    this.n1 = new LFNoise2(this.kr, this.rg); this.n2 = new LFNoise2(this.kr, this.rg);
    this.exLP = new LPF(this.sr); this.kl = new Klank(this.sr, 5); this.lp = new LPF(this.sr);
    this.excA = new KtoA(0); this.envA = new KtoA(0); this.pan = new Pan2(p.pan ?? 0);
    this.first = true;
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 220, bright = p.bright ?? 0.5, amp = p.amp ?? 0.1;
    const e = this.env.kr();
    if (this.first) { this.excA.prev = 0.3 + 0.7 * e; this.envA.prev = e; this.first = false; }
    const pn = S.get(), exc = S.get(), k1 = S.get(), k2 = S.get(), sig = S.get();
    this.pink.ar(pn);
    this.exLP.ar(pn, Math.min(freq * 8, 9000), exc);
    this.excA.fill(0.3 + 0.7 * e, k1);
    for (let i = 0; i < BS; i++) exc[i] *= k1[i];
    const fs = freq * (1 + this.n1.kr(0.15) * 0.0015);
    this.kl.ar(exc, [fs, fs * 2.003, fs * 3.011, fs * 4.03, fs * 5.08], [1, 0.45, 0.3 * bright, 0.18 * bright, 0.1 * bright], [1.2, 0.9, 0.7, 0.5, 0.4], sig);
    this.lp.ar(sig, Math.min(freq * 7, 11000), k2);
    this.envA.fill(e, k1);
    for (let i = 0; i < BS; i++) k2[i] *= k1[i] * amp * 0.0095;
    const L = S.zero(), R = S.zero();
    this.pan.addK(k2, (p.pan ?? 0) + this.n2.kr(0.1) * 0.15, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.45, p.dly ?? 0.05, this.send);
    if (this.env.done) this.done = true;
  }
}

// band-limited Saw (SuperCollider's leaky-integrated DSF), control-rate frequency
class Saw {
  constructor(sr, f0) { this.sr = sr; this.cps = (8192 * 65536 * 0.5) / sr; this.fin = f0; this.N = Math.trunc((sr * 0.5) / f0); this.scale = 0.5 / this.N; this.phase = 0; this.y1 = -0.46; }
  kr(freqin, out) {
    let N, freq, scale, prevN = this.N, prevScale = this.scale, xf = false;
    if (freqin !== this.fin) {
      N = Math.trunc((this.sr * 0.5) / freqin);
      if (N !== this.N) { freq = Math.trunc(this.cps * Math.max(this.fin, freqin)); xf = true; } else freq = Math.trunc(this.cps * freqin);
      this.N = N; this.scale = scale = 0.5 / N; this.fin = freqin;
    } else { N = this.N; freq = Math.trunc(this.cps * freqin); scale = this.scale; }
    const N2 = 2 * N + 1, pN2 = 2 * prevN + 1;
    let phase = this.phase, y1 = this.y1, x = 0;
    const ang = (ph) => (((ph >>> 0) & 0x1fffffff) / 0x20000000) * Math.PI * 2;
    for (let i = 0; i < BS; i++) {
      const th = ang(phase), s = Math.sin(th);
      if (Math.abs(s) < 0.0005) y1 = 1 + 0.999 * y1;
      else {
        const n2 = (Math.sin(ang(Math.imul(phase, N2))) / s - 1) * scale;
        if (xf) { const n1 = (Math.sin(ang(Math.imul(phase, pN2))) / s - 1) * prevScale; y1 = n1 + x * (n2 - n1) + 0.999 * y1; x += 1 / BS; }
        else y1 = n2 + 0.999 * y1;
      }
      out[i] = y1;
      phase = (phase + freq) | 0;
    }
    this.phase = phase; this.y1 = y1;
  }
}

// ── \breath: reed formants over noise and a faint saw ────────────────────────
export class Breath extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const { atk = 1, sus = 1, rel = 2, glide = 0.02, freq = 220 } = p;
    this.env = new EnvGen({ levels: [0, 1, 0.8, 0], times: [atk, sus, rel], curves: [2, 0, -3] }, this.kr);
    this.genv = new EnvGen({ levels: [1 + glide, 1], times: [atk * 0.8], curves: -3 }, this.kr);
    this.n1 = new LFNoise2(this.kr, this.rg); this.pink = new PinkNoise(this.rg);
    this.sawA = new Saw(this.sr, freq * (1 + glide)); this.sawB = new Saw(this.sr, freq * (1 + glide) * 1.003);
    this.rz = [1, 2, 3, 4, 6].map(() => new Resonz(this.sr)); this.lp = new LPF(this.sr);
    this.envA = new KtoA(0); this.pan = new Pan2(p.pan ?? 0); this.first = true;
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 220, bright = p.bright ?? 0.4, amp = p.amp ?? 0.1;
    const e = this.env.kr(), g = this.genv.kr(), nz = this.n1.kr(3) * 0.002;
    if (this.first) { this.envA.prev = e; this.first = false; }
    const f = f32(freq * g * (1 + nz));
    const a = S.get(), b = S.get(), src = S.get(), sig = S.get(), t = S.get(), k = S.get();
    this.sawA.kr(f, a); this.sawB.kr(f32(f * 1.003), b);
    this.pink.ar(t);
    for (let i = 0; i < BS; i++) src[i] = (a[i] + b[i]) * 0.25 * bright + t[i] * 0.8;
    const muls = [9, 5, 3.5 * bright, 2.5 * bright, 1.5 * bright], rqs = [0.012, 0.015, 0.02, 0.025, 0.03], h = [1, 2, 3, 4, 6];
    sig.fill(0);
    for (let j = 0; j < 5; j++) { this.rz[j].ar(src, f32(f * h[j]), rqs[j], t); const m = muls[j]; for (let i = 0; i < BS; i++) sig[i] += t[i] * m; }
    this.lp.ar(sig, Math.min(f * 8, 11000), t);
    this.envA.fill(e, k);
    for (let i = 0; i < BS; i++) t[i] *= k[i] * amp * 1.29;
    const L = S.zero(), R = S.zero();
    this.pan.addK(t, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.35, p.dly ?? 0.08, this.send);
    if (this.env.done) this.done = true;
  }
}

// Decay2.ar(Impulse.ar(0), a, d)
class Strike {
  constructor(sr, a, d) { this.d = new Decay2(sr); this.a = a; this.dd = d; this.first = true; this.imp = new Float32Array(BS); }
  ar(out) { this.imp.fill(0); if (this.first) { this.imp[0] = 1; this.first = false; } this.d.ar(this.imp, this.a, this.dd, out); }
}

// ── \tine: kalimba ───────────────────────────────────────────────────────────
export class Tine extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dec = p.dec ?? 1.2;
    this.st = new Strike(this.sr, 0.0004, 0.003); this.wn = new WhiteNoise(this.rg);
    this.kl = new Klank(this.sr, 3); this.lp = new LPF(this.sr); this.pan = new Pan2(p.pan ?? 0);
    this.life = lineBlocks(dec * 1.3 + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 440, dec = p.dec ?? 1.2, bright = p.bright ?? 0.5, amp = p.amp ?? 0.1;
    const exc = S.get(), n = S.get(), sig = S.get(), t = S.get();
    this.st.ar(exc); this.wn.ar(n);
    for (let i = 0; i < BS; i++) exc[i] *= 1 + n[i] * 0.3 * bright;
    this.kl.ar(exc, [freq, freq * 5.95, freq * 13.1], [1, 0.45 * bright, 0.2 * bright], [dec, dec * 0.22, dec * 0.09], sig);
    this.lp.ar(sig, Math.min(freq * 16, 13000), t);
    for (let i = 0; i < BS; i++) t[i] *= amp * 0.0332;
    const L = S.zero(), R = S.zero();
    this.pan.addK(t, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.25, p.dly ?? 0.12, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \wood: low knock ─────────────────────────────────────────────────────────
export class Wood extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dec = p.dec ?? 0.5;
    this.st = new Strike(this.sr, 0.0008, 0.006); this.wn = new WhiteNoise(this.rg); this.bp = new BPF(this.sr);
    this.kl = new Klank(this.sr, 3); this.lp = new LPF(this.sr); this.pan = new Pan2(p.pan ?? 0);
    this.life = lineBlocks(dec * 1.2 + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 110, dec = p.dec ?? 0.5, bright = p.bright ?? 0.5, amp = p.amp ?? 0.1;
    const exc = S.get(), n = S.get(), bp = S.get(), sig = S.get(), t = S.get();
    this.st.ar(exc); this.wn.ar(n); this.bp.ar(n, 1800, 0.5, bp);
    for (let i = 0; i < BS; i++) exc[i] *= 1 + bp[i] * 0.6 * bright;
    this.kl.ar(exc, [freq, freq * 3.93, freq * 9.24], [1, 0.3 * bright, 0.1 * bright], [dec, dec * 0.22, dec * 0.06], sig);
    this.lp.ar(sig, Math.min(freq * 12, 9000), t);
    for (let i = 0; i < BS; i++) t[i] *= amp * 0.0224;
    const L = S.zero(), R = S.zero();
    this.pan.addK(t, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.15, p.dly ?? 0.05, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \bite: FM thump with a falling pitch and a shell click ───────────────────
export class Bite extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dec = p.dec ?? 0.35;
    this.env = new EnvGen(perc(0.002, dec, 1, -4), this.sr);
    this.penv = new EnvGen({ levels: [1.9, 1], times: [0.045], curves: -6 }, this.sr);
    this.cenv = new EnvGen(perc(0.0005, 0.012, 1, -4), this.sr);
    this.o1 = new SinOsc(this.sr); this.o2 = new SinOsc(this.sr);
    this.wn = new WhiteNoise(this.rg); this.bp = new BPF(this.sr); this.pan = new Pan2(p.pan ?? 0);
    this.life = lineBlocks(dec * 1.3 + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 73, bright = p.bright ?? 0.5, amp = p.amp ?? 0.1;
    const env = S.get(), pe = S.get(), f1 = S.get(), f2 = S.get(), m = S.get(), sig = S.get(), n = S.get(), c = S.get(), ce = S.get();
    this.env.ar(env); this.penv.ar(pe);
    for (let i = 0; i < BS; i++) { f1[i] = freq * pe[i]; f2[i] = freq * 2 * pe[i]; }
    this.o2.ai(f2, m);
    for (let i = 0; i < BS; i++) m[i] *= env[i] * (1 + 2 * bright);
    this.o1.aa(f1, m, sig);
    this.wn.ar(n); this.bp.ar(n, 2200 + bright * 1500, 0.3, c); this.cenv.ar(ce);
    for (let i = 0; i < BS; i++) sig[i] = (Math.tanh(sig[i] * 1.3) * env[i] + c[i] * ce[i] * 0.6) * amp * 1.17;
    const L = S.zero(), R = S.zero();
    this.pan.addK(sig, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.12, p.dly ?? 0.06, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \drop: bubble ────────────────────────────────────────────────────────────
export class Drop extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dec = p.dec ?? 0.06;
    this.env = new EnvGen(perc(0.001, dec, 1, -4), this.sr);
    this.fe = new EnvGen({ levels: [0, 1], times: [dec], curves: 2 }, this.sr);
    this.o = new SinOsc(this.sr); this.pan = new Pan2(p.pan ?? 0);
    this.life = lineBlocks(dec + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 900, rise = p.rise ?? 1.7, amp = p.amp ?? 0.1;
    const env = S.get(), fe = S.get(), sig = S.get();
    this.env.ar(env); this.fe.ar(fe);
    for (let i = 0; i < BS; i++) fe[i] = freq * (1 + (rise - 1) * fe[i]);
    this.o.ai(fe, sig);
    for (let i = 0; i < BS; i++) sig[i] *= env[i] * amp * 1.88;
    const L = S.zero(), R = S.zero();
    this.pan.addK(sig, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.35, p.dly ?? 0.15, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \tick: snapping shrimp ───────────────────────────────────────────────────
export class Tick extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dec = p.dec ?? 0.03;
    this.st = new Strike(this.sr, 0.0002, 0.002); this.wn = new WhiteNoise(this.rg);
    this.rz = new Ringz(this.sr); this.hp = new HPF(this.sr); this.pan = new Pan2(p.pan ?? 0);
    this.life = lineBlocks(dec * 3 + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 3000, dec = p.dec ?? 0.03, amp = p.amp ?? 0.1;
    const e = S.get(), n = S.get(), sig = S.zero(), t = S.get();
    this.st.ar(e); this.wn.ar(n);
    for (let i = 0; i < BS; i++) e[i] *= n[i];
    this.rz.arAdd(e, freq, dec, 1, sig);
    this.hp.ar(sig, 400, t);
    for (let i = 0; i < BS; i++) t[i] *= amp * 0.5;
    const L = S.zero(), R = S.zero();
    this.pan.addK(t, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.25, p.dly ?? 0.1, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \glint: sparkle grain ────────────────────────────────────────────────────
export class Glint extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dec = p.dec ?? 0.12;
    this.env = new EnvGen(perc(0.002, dec, 1, -6), this.sr);
    this.m = new SinOsc(this.sr); this.c = new SinOsc(this.sr); this.pan = new Pan2(p.pan ?? 0);
    this.life = lineBlocks(dec + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 2000, amp = p.amp ?? 0.05;
    const env = S.get(), m = S.get(), sig = S.get();
    this.env.ar(env);
    this.m.kk(f32(freq * 2.01), m);
    for (let i = 0; i < BS; i++) m[i] *= env[i] * 0.8;
    this.c.ka(freq, m, sig);
    for (let i = 0; i < BS; i++) sig[i] *= env[i] * amp * 0.91;
    const L = S.zero(), R = S.zero();
    this.pan.addK(sig, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.5, p.dly ?? 0.2, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \rustle: something swimming past (new for the field mix; not in the SC score) ──
// White noise through a resonant band that sweeps from f0 to f1 under a soft swell.
export class Rustle extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const atk = p.atk ?? 0.04, dec = p.dec ?? 0.25;
    this.env = new EnvGen({ levels: [0, 1, 0], times: [atk, dec], curves: [2, -3] }, this.sr);
    this.wn = new WhiteNoise(this.rg); this.rz = new Resonz(this.sr); this.pan = new Pan2(p.pan ?? 0);
    this.dur = atk + dec; this.life = lineBlocks(this.dur + 0.03, this.kr);
  }
  render(B, S) {
    const p = this.p, amp = p.amp ?? 0.1, f0 = p.f0 ?? 900, f1 = p.f1 ?? 1800, rq = p.rq ?? 0.2;
    const x = Math.min(1, (this.age * BS) / (this.sr * this.dur));
    const env = S.get(), n = S.get(), sig = S.get();
    this.env.ar(env); this.wn.ar(n);
    this.rz.ar(n, f0 * Math.pow(f1 / f0, x), rq, sig);
    const g = amp * 2.2 / Math.sqrt(rq);
    for (let i = 0; i < BS; i++) sig[i] *= env[i] * g;
    const L = S.zero(), R = S.zero();
    this.pan.addK(sig, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.3, p.dly ?? 0.05, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// SinOsc.kr: one table lookup per control block
class SinOscK {
  constructor(kr, phase0) { this.inc = (8192 * 65536) / kr; this.phase = Math.trunc(((8192 * 65536) / (Math.PI * 2)) * phase0) | 0; }
  kr(freq) { const p = this.phase >>> 0, idx = (p >>> 16) & 8191, fr = (p & 0xffff) / 65536; const v = sinTable[idx] + (sinTable[idx + 1] - sinTable[idx]) * fr; this.phase = (this.phase + Math.trunc(this.inc * freq)) | 0; return v; }
}

// ── \sea: persistent bed ─────────────────────────────────────────────────────
export class Sea extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const P = this.p = Object.assign({ amp: 0.1, f1: 38, f2: 45, f3: 50, f4: 57, f5: 64, tide: 0.5, light: 0.5, sing: 1, surf: 1, swellRate: 0.07, fade: 1, fadeTime: 8, rev: 0.3 }, p);
    this.tl = new Lag(this.kr, P.tide); this.ll = new Lag(this.kr, P.light); this.fl = new Lag(this.kr, P.fade); this.fadeA = new KtoA(0);
    this.pinks = [0, 1, 2, 3, 4].map(() => [new PinkNoise(this.rg), new PinkNoise(this.rg)]);
    this.res = [0, 1, 2, 3, 4].map(() => [new Resonz(this.sr), new Resonz(this.sr)]);
    this.nf = [0, 1, 2, 3, 4].map(() => new LFNoise2(this.kr, this.rg));
    this.na = [0, 1, 2, 3, 4].map(() => new LFNoise2(this.kr, this.rg));
    this.brown = [new BrownNoise(this.rg), new BrownNoise(this.rg)];
    this.lp = [new LPF(this.sr), new LPF(this.sr)];
    this.sw = [new SinOscK(this.kr, 0), new SinOscK(this.kr, 2)];
    this.hp = [new HPF(this.sr), new HPF(this.sr)];
    this.resA = [0, 1, 2, 3, 4].map(() => new KtoA(0)); this.wavA = [new KtoA(0), new KtoA(0)];
    this.first = true;
  }
  render(B, S) {
    const P = this.p;
    const tl = this.tl.kr(P.tide, 6), ll = this.ll.kr(P.light, 6);
    const fs = [P.f1, P.f2, P.f3, P.f4, P.f5].map(midicps), fd = this.fl.kr(P.fade, P.fadeTime);
    const L = S.zero(), R = S.zero(), t = S.get(), n = S.get(), k = S.get();
    const resGain = 9 * P.sing * (0.5 + ll);
    for (let i = 0; i < 5; i++) {
      const f = f32(fs[i] * (1 + this.nf[i].kr(0.05) * 0.002));
      const a = (this.na[i].kr(0.02 + i * 0.013) * 0.425 + 0.575) * (6 / (i + 2)) * resGain;
      if (this.first) this.resA[i].prev = a;
      this.resA[i].fill(a, k);
      for (let c = 0; c < 2; c++) {
        this.pinks[i][c].ar(n);
        this.res[i][c].ar(n, f, 0.004, t);
        const out = c ? R : L;
        for (let j = 0; j < BS; j++) out[j] += t[j] * k[j];
      }
    }
    const cut = 180 + tl * 700 + ll * 900;
    for (let c = 0; c < 2; c++) {
      this.brown[c].ar(n); this.lp[c].ar(n, cut, t);
      const s = this.sw[c].kr(P.swellRate * (c ? 1.13 : 1)) * 0.425 + 0.575;
      const w = s * s * 0.5 * P.surf * (0.4 + tl);
      if (this.first) this.wavA[c].prev = w;
      this.wavA[c].fill(w, k);
      const out = c ? R : L;
      for (let j = 0; j < BS; j++) out[j] += t[j] * k[j];
    }
    if (this.first) this.fadeA.prev = fd;
    this.first = false;
    this.fadeA.fill(fd, k);
    this.hp[0].ar(L, 30, t); for (let j = 0; j < BS; j++) L[j] = t[j] * P.amp * 1.55 * k[j];
    this.hp[1].ar(R, 30, t); for (let j = 0; j < BS; j++) R[j] = t[j] * P.amp * 1.55 * k[j];
    outAll(B, L, R, P.rev, 0, this.send);
  }
}

// ── \drone ───────────────────────────────────────────────────────────────────
export class Drone extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const P = this.p = Object.assign({ amp: 0.1, note: 38, light: 0.5, fade: 1, fadeTime: 6, rev: 0.15 }, p);
    this.ll = new Lag(this.kr, P.light); this.fl = new Lag(this.kr, P.fade);
    this.n1 = new LFNoise2(this.kr, this.rg); this.n2 = new LFNoise2(this.kr, this.rg);
    this.m = new SinOsc(this.sr); this.a = new SinOsc(this.sr); this.b = new SinOsc(this.sr); this.h = new SinOsc(this.sr);
    this.lp = new LPF(this.sr); this.ampA = new KtoA(0); this.idxA = new KtoA(0); this.first = true;
  }
  render(B, S) {
    const P = this.p;
    const f = f32(midicps(P.note)), ll = this.ll.kr(P.light, 8);
    const idx = (0.3 + 0.8 * ll) * (this.n1.kr(0.07) * 0.35 + 0.65);
    const ag = P.amp * 0.52 * (this.n2.kr(0.05) * 0.15 + 0.85) * this.fl.kr(P.fade, P.fadeTime);
    if (this.first) { this.idxA.prev = idx; this.ampA.prev = ag; this.first = false; }
    const m = S.get(), a = S.get(), b = S.get(), h = S.get(), k = S.get(), t = S.get();
    this.m.kk(f32(f * 2), m);
    this.idxA.fill(idx, k);
    for (let i = 0; i < BS; i++) m[i] *= k[i];
    this.a.ka(f, m, a); this.b.ka(f32(f * 1.002), m, b); this.h.kk(f32(f * 2.001), h);
    for (let i = 0; i < BS; i++) a[i] = (a[i] + b[i]) * 0.5 + h[i] * 0.18 * ll;
    this.lp.ar(a, f32(f * 6), t);
    this.ampA.fill(ag, k);
    for (let i = 0; i < BS; i++) t[i] *= k[i];
    outAll(B, t, t, P.rev, 0, this.send);
  }
}

// ── \piano: felt piano (two strings a cent apart, six stretched partials each) ──
const PIANO_FS = [1, 2, 3, 4, 5, 6].map((k) => k * Math.sqrt(1 + 0.0003 * k * k));
const PIANO_F = [...PIANO_FS.map((f) => f32(f * 0.9994)), ...PIANO_FS.map((f) => f32(f * 1.0006))];
const PIANO_A = [1, 0.5, 0.3, 0.2, 0.12, 0.08, 1, 0.5, 0.3, 0.2, 0.12, 0.08];
const PIANO_D = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5].map((k) => f32(1 / f32(1 + 0.55 * k)));
export class Piano extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dec = p.dec ?? 5, felt = p.felt ?? 0.6;
    this.st = new Strike(this.sr, f32(0.0004 + f32(0.0016 * felt)), f32(0.003 + f32(0.005 * felt)));
    this.kl = new Klank(this.sr, 12); this.wn = new WhiteNoise(this.rg); this.lp = new LPF(this.sr);
    this.kenv = new EnvGen(perc(0.001, 0.07, 1, -4), this.sr); this.pan = new Pan2(p.pan ?? 0);
    this.life = lineBlocks(dec * 1.1 + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 220, dec = p.dec ?? 5, felt = p.felt ?? 0.6, amp = p.amp ?? 0.1;
    const exc = S.get(), sig = S.get(), n = S.get(), kn = S.get(), ke = S.get();
    this.st.ar(exc);
    this.kl.ar(exc, PIANO_F.map((f) => f * freq), PIANO_A, PIANO_D.map((d) => d * dec), sig);
    this.wn.ar(n); this.lp.ar(n, 260, kn); this.kenv.ar(ke);
    const g = 0.0045 * Math.sqrt(freq / 220);
    for (let i = 0; i < BS; i++) sig[i] = (sig[i] * g + kn[i] * ke[i] * felt * 0.3) * amp;
    const L = S.zero(), R = S.zero();
    this.pan.addK(sig, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.3, p.dly ?? 0.05, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \strings: detuned saw ensemble with a slow vibrato; the bow brightens as it swells ──
const STR_DET = [0.9978, 1.0013, 1.0024, 0.9989];
export class Strings extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const { atk = 3, sus = 2, rel = 5 } = p, freq = f32(p.freq ?? 220);
    this.env = new EnvGen({ levels: [0, 1, 0.85, 0], times: [atk, sus, rel], curves: [2, 0, -3] }, this.kr);
    this.n1 = new LFNoise2(this.kr, this.rg); this.vib = new SinOscK(this.kr, 0);
    this.saws = STR_DET.map((m) => new Saw(this.sr, f32(freq * m))); // at construction the vibrato is still
    this.lp = [new LPF(this.sr), new LPF(this.sr)]; this.hp = [new HPF(this.sr), new HPF(this.sr)];
    this.bal = new Balance2(p.pan ?? 0, 1); this.envA = new KtoA(0);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 220, bright = p.bright ?? 0.5, amp = p.amp ?? 0.1;
    const e = this.env.kr();
    const f = f32(freq * (1 + this.vib.kr(5.2 + this.n1.kr(0.5) * 0.6) * 0.0022 * e));
    const a = S.get(), b = S.get(), cL = S.get(), cR = S.get(), t = S.get(), k = S.get();
    this.saws[0].kr(f32(f * STR_DET[0]), a); this.saws[1].kr(f32(f * STR_DET[1]), b);
    for (let i = 0; i < BS; i++) cL[i] = a[i] + b[i];
    this.saws[2].kr(f32(f * STR_DET[2]), a); this.saws[3].kr(f32(f * STR_DET[3]), b);
    for (let i = 0; i < BS; i++) cR[i] = a[i] + b[i];
    const cut = clip(freq * (1.5 + e * bright * 5), 60, 9000);
    this.lp[0].ar(cL, cut, t); this.hp[0].ar(t, 80, cL);
    this.lp[1].ar(cR, cut, t); this.hp[1].ar(t, 80, cR);
    const L = S.zero(), R = S.zero();
    this.bal.addK2(cL, cR, p.pan ?? 0, 1, L, R);
    this.envA.fill(e, k);
    for (let i = 0; i < BS; i++) { const g = k[i] * amp * 0.5; L[i] *= g; R[i] *= g; }
    outAll(B, L, R, p.rev ?? 0.5, p.dly ?? 0, this.send);
    if (this.env.done) this.done = true;
  }
}

// ── \vibe: vibraphone (soft mallet, tuned bar, the motor's tremolo) ──────────
export class Vibe extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dec = p.dec ?? 3;
    this.st = new Strike(this.sr, 0.0006, 0.004); this.kl = new Klank(this.sr, 3); this.lp = new LPF(this.sr);
    this.trem = new SinOscK(this.kr, 0); this.tA = new KtoA(0); this.pan = new Pan2(p.pan ?? 0); this.first = true;
    this.life = lineBlocks(dec * 1.2 + 0.05, this.kr);
  }
  render(B, S) {
    const p = this.p, freq = p.freq ?? 440, dec = p.dec ?? 3, bright = p.bright ?? 0.5, amp = p.amp ?? 0.1, depth = p.depth ?? 0.3;
    const exc = S.get(), sig = S.get(), t = S.get(), k = S.get();
    this.st.ar(exc);
    this.kl.ar(exc, [freq, freq * 3.99, freq * 10.1], [1, 0.3 * bright, 0.1 * bright], [dec, dec * 0.25, dec * 0.08], sig);
    this.lp.ar(sig, Math.min(freq * 14, 12000), t);
    const tv = 1 - depth * (this.trem.kr(p.trem ?? 4.5) * 0.5 + 0.5);
    if (this.first) { this.tA.prev = tv; this.first = false; }
    this.tA.fill(tv, k);
    for (let i = 0; i < BS; i++) t[i] *= k[i] * amp * 0.03;
    const L = S.zero(), R = S.zero();
    this.pan.addK(t, p.pan ?? 0, 1, L, R);
    outAll(B, L, R, p.rev ?? 0.35, p.dly ?? 0.15, this.send);
    if (this.age + 1 >= this.life) this.done = true;
  }
}

// ── \swarm: a multitude heard from afar (bands of resonator pairs rung by Dust) ──
const SWARM_POS = [-0.75, 0.55, -0.35, 0.15, -0.15, 0.35, -0.55, 0.75];
export class Swarm extends Voice {
  constructor(eng, p) {
    super(eng, p);
    this.p = Object.assign({ amp: 1, ring: 0.2, fizz: 0, fizzAmp: 0, rev: 0.6, dly: 0.1 }, p);
    for (let i = 1; i <= 8; i++) for (const [c, v] of [['f', 60], ['d', 0], ['a', 0]]) if (this.p[c + i] == null) this.p[c + i] = v;
    this.dust = SWARM_POS.map(() => new Dust(this.sr, this.rg));
    this.rz = SWARM_POS.map(() => [new Ringz(this.sr), new Ringz(this.sr)]);
    this.pans = SWARM_POS.map((x) => new Pan2(x));
    this.aA = SWARM_POS.map((_, i) => new KtoA(this.p['a' + (i + 1)]));
    this.fz = [new Dust(this.sr, this.rg, true), new Dust(this.sr, this.rg, true)]; this.hp = [new HPF(this.sr), new HPF(this.sr)];
  }
  render(B, S) {
    const P = this.p, ring = P.ring;
    const x = S.get(), k = S.get(), t = S.get(), L = S.zero(), R = S.zero();
    for (let i = 0; i < 8; i++) {
      const d = P['d' + (i + 1)], a = P['a' + (i + 1)], f = midicps(P['f' + (i + 1)]);
      if (d > 0) this.dust[i].ar(d, x); else x.fill(0); // (no impulses: skip the random draws)
      this.aA[i].fill(a, k);
      for (let j = 0; j < BS; j++) x[j] *= k[j];
      t.fill(0);
      this.rz[i][0].arAdd(x, f32(f * 0.9971), ring, 1, t); this.rz[i][1].arAdd(x, f32(f * 1.0029), ring, 1, t);
      this.pans[i].addK(t, SWARM_POS[i], 1, L, R);
    }
    if (P.fizz > 0) {
      for (let c = 0; c < 2; c++) {
        this.fz[c].ar(P.fizz, x); this.hp[c].ar(x, 3000, t);
        const o = c ? R : L;
        for (let j = 0; j < BS; j++) o[j] += t[j] * P.fizzAmp;
      }
    }
    for (let j = 0; j < BS; j++) { L[j] *= P.amp; R[j] *= P.amp; }
    outAll(B, L, R, P.rev, P.dly, this.send);
  }
}

// ── \wave: one swell of water washing in and drawing back, foam at the crest ──
export class Wave extends Voice {
  constructor(eng, p) {
    super(eng, p);
    const dur = p.dur ?? 7;
    this.env = new EnvGen({ levels: [0, 1, 0.3, 0], times: [dur * 0.4, dur * 0.2, dur * 0.4], curves: [2, -2, -2] }, this.kr);
    this.foam = new EnvGen({ levels: [0, 0, 1, 0], times: [dur * 0.32, dur * 0.18, dur * 0.5], curves: [0, -1, -3] }, this.kr);
    this.pink = [new PinkNoise(this.rg), new PinkNoise(this.rg)]; this.lp = [new LPF(this.sr), new LPF(this.sr)];
    this.dust = [new Dust(this.sr, this.rg, true), new Dust(this.sr, this.rg, true)]; this.hp = [new HPF(this.sr), new HPF(this.sr)];
    this.n1 = new LFNoise2(this.kr, this.rg); this.bal = new Balance2(p.pan ?? 0, 1);
    this.envA = new KtoA(0); this.foamA = new KtoA(0); this.first = true;
  }
  render(B, S) {
    const p = this.p, bright = p.bright ?? 0.5, amp = p.amp ?? 0.1;
    const e = this.env.kr(), fo = this.foam.kr();
    if (this.first) { this.envA.prev = e; this.foamA.prev = fo; this.first = false; }
    const ke = this.envA.fill(e, S.get()), kf = this.foamA.fill(fo, S.get());
    const n = S.get(), t = S.get(), c2 = [S.get(), S.get()];
    const cut = 200 + e * e * 2400 * bright;
    for (let c = 0; c < 2; c++) {
      const o = c2[c];
      this.pink[c].ar(n); this.lp[c].ar(n, cut, o);
      this.dust[c].ar(fo * 1200, n); this.hp[c].ar(n, 2800, t);
      for (let i = 0; i < BS; i++) o[i] = o[i] * ke[i] + t[i] * kf[i] * 0.4;
    }
    const L = S.zero(), R = S.zero();
    this.bal.addK2(c2[0], c2[1], (p.pan ?? 0) + this.n1.kr(0.25) * 0.3, 1, L, R);
    for (let i = 0; i < BS; i++) { L[i] *= amp; R[i] *= amp; }
    outAll(B, L, R, p.rev ?? 0.4, 0, this.send);
    if (this.env.done) this.done = true;
  }
}

// ── \pingpong: delay (LocalIn/LocalOut feedback is one block late) ───────────
export class PingPong {
  constructor(sr, p = {}) {
    this.p = Object.assign({ tl: 0.54, tr: 0.36, fb: 0.45, rev: 0.4 }, p); this.ctl = BS / sr;
    this.d1 = new DelayC(sr, 1.5); this.d2 = new DelayC(sr, 1.5); this.hp = new HPF(sr); this.lp = new LPF(sr);
    this.fb = new Float32Array(BS);
  }
  process(B, S) {
    const P = this.p, x = S.get(), l = S.get(), t = S.get(), r = S.get();
    for (let i = 0; i < BS; i++) x[i] = (B.dlyL[i] + B.dlyR[i]) * 0.7 + this.fb[i] * P.fb;
    this.d1.kr(x, P.tl - this.ctl, l);
    this.hp.ar(l, 300, t); this.lp.ar(t, 4200, l);
    this.d2.kr(l, P.tr, r);
    this.fb.set(r);
    for (let i = 0; i < BS; i++) { B.dryL[i] += l[i]; B.dryR[i] += r[i]; B.revL[i] += l[i] * P.rev; B.revR[i] += r[i] * P.rev; }
  }
}

// ── \fdn: 8-line feedback delay network reverb ───────────────────────────────
export class FDN {
  constructor(sr, rg, p = {}) {
    this.p = Object.assign({ decay: 9, damp: 5000, size: 1.3, mix: 0.9 }, p); this.ctl = BS / sr;
    this.pre = [new DelayN(sr, 0.06), new DelayN(sr, 0.06)];
    this.ap = [0, 1, 2, 3].map(() => [new AllpassC(sr, 0.05), new AllpassC(sr, 0.05)]);
    this.dl = Array.from({ length: 8 }, () => new DelayC(sr, 0.5));
    this.nz = Array.from({ length: 8 }, () => new LFNoise2(sr, rg));
    this.hp = Array.from({ length: 8 }, () => new HPF(sr)); this.lp = Array.from({ length: 8 }, () => new LPF(sr));
    this.outHp = [new HPF(sr), new HPF(sr)];
    this.loc = Array.from({ length: 8 }, () => new Float32Array(BS));
    this.x = Array.from({ length: 8 }, () => new Float32Array(BS));
    let h = [[1]];
    for (let k = 0; k < 3; k++) h = [...h.map((r) => [...r, ...r]), ...h.map((r) => [...r, ...r.map((v) => -v)])];
    this.H = h;
  }
  process(B, S) {
    const P = this.p, times = [0.0503, 0.0611, 0.0719, 0.0823, 0.0937, 0.1049, 0.1153, 0.1279].map((t) => t * P.size);
    const sL = S.get(), sR = S.get(), t = S.get(), dt = S.get();
    this.pre[0].ar(B.revL, 0.035, sL); this.pre[1].ar(B.revR, 0.035, sR);
    const apt = [0.0047, 0.0071, 0.0113, 0.0163];
    for (let i = 0; i < 4; i++) { this.ap[i][0].ar(sL, apt[i], 0.3, t); sL.set(t); this.ap[i][1].ar(sR, f32(apt[i] * 1.13), 0.3, t); sR.set(t); }
    const x = this.x;
    for (let c = 0; c < 8; c++) {
      const src = c & 1 ? sR : sL, li = this.loc[c];
      for (let i = 0; i < BS; i++) t[i] = li[i] + src[i];
      this.nz[c].ar(0.12, dt);
      const base = times[c] - this.ctl;
      for (let i = 0; i < BS; i++) dt[i] = base + (dt[i] * 0.00075 + 0.00075);
      this.dl[c].ar(t, dt, x[c]);
      this.hp[c].ar(x[c], 70, t); this.lp[c].ar(t, P.damp, x[c]);
    }
    const g = times.map((tt) => Math.pow(10, (-3 * tt) / P.decay)), s8 = 1 / Math.sqrt(8);
    for (let r = 0; r < 8; r++) {
      const row = this.H[r], li = this.loc[r], gr = g[r] * s8;
      for (let i = 0; i < BS; i++) { let acc = 0; for (let c = 0; c < 8; c++) acc += row[c] * x[c][i]; li[i] = acc * gr; }
    }
    const yL = S.get(), yR = S.get();
    for (let i = 0; i < BS; i++) { yL[i] = (x[0][i] + x[2][i] + x[4][i] + x[6][i]) * 0.3; yR[i] = (x[1][i] + x[3][i] + x[5][i] + x[7][i]) * 0.3; }
    this.outHp[0].ar(yL, 140, t); for (let i = 0; i < BS; i++) B.dryL[i] += t[i] * P.mix;
    this.outHp[1].ar(yR, 140, t); for (let i = 0; i < BS; i++) B.dryR[i] += t[i] * P.mix;
  }
}

// ── \master: high-pass, bass to mono, EQ, tone, glue compression, saturation, limiter ──
export class Master {
  constructor(sr, p = {}) {
    this.p = Object.assign({ gain: 1, tone: 16000, toneLag: 6, thresh: 0.3, drive: 1.2, ceiling: 0.8 }, p);
    const two = (make) => [make(), make()];
    this.hp28 = two(() => new HPF(sr));
    this.lo1 = two(() => new LPF(sr)); this.lo2 = two(() => new LPF(sr));
    this.hi1 = two(() => new HPF(sr)); this.hi2 = two(() => new HPF(sr));
    this.dc = two(() => new LeakDC()); this.ls = two(() => new BLowShelf(sr)); this.hs = two(() => new BHiShelf(sr));
    this.bl = two(() => new BLowPass(sr)); this.tone = new Lag(sr / BS, this.p.tone);
    this.comp = two(() => new Compander(sr)); this.lpa = two(() => new LPF(sr)); this.lpb = two(() => new LPF(sr));
    this.lim = two(() => new Limiter(sr, 0.01)); this.gainA = two(() => new KtoA(this.p.gain));
  }
  process(B, S, outL, outR) {
    const P = this.p, ins = [B.dryL, B.dryR];
    const x = [S.get(), S.get()], lo = [S.get(), S.get()], t = S.get(), ctl = S.get(), k = S.get();
    for (let c = 0; c < 2; c++) {
      this.hp28[c].ar(ins[c], 28, x[c]);
      this.lo1[c].ar(x[c], 120, t); this.lo2[c].ar(t, 120, lo[c]);
      this.hi1[c].ar(x[c], 120, t); this.hi2[c].ar(t, 120, x[c]);
    }
    for (let i = 0; i < BS; i++) { const m = (lo[0][i] + lo[1][i]) * 0.5; x[0][i] += m; x[1][i] += m; }
    const tone = Math.min(18000, Math.max(300, this.tone.kr(P.tone, P.toneLag)));
    for (let c = 0; c < 2; c++) {
      this.dc[c].ar(x[c], t); this.ls[c].ar(t, 150, 1, 0, x[c]); this.hs[c].ar(x[c], 8000, 1, 2.5, t);
      this.bl[c].ar(t, f32(tone), 0.8, x[c]);
      this.gainA[c].fill(P.gain, k);
      for (let i = 0; i < BS; i++) x[c][i] *= k[i];
    }
    for (let i = 0; i < BS; i++) ctl[i] = (x[0][i] + x[1][i]) * 0.5;
    const dn = Math.tanh(P.drive), outs = [outL, outR];
    for (let c = 0; c < 2; c++) {
      this.comp[c].ar(x[c], ctl, P.thresh, 1, 0.5, 0.03, 0.4, t);
      for (let i = 0; i < BS; i++) t[i] = Math.tanh(t[i] * P.drive) / dn;
      this.lpa[c].ar(t, 15000, x[c]); this.lpb[c].ar(x[c], 15000, t);
      this.lim[c].ar(t, P.ceiling, x[c]);
      const o = outs[c];
      for (let i = 0; i < BS; i++) o[i] = clip(x[c][i], -0.97, 0.97);
    }
  }
}

// ── the engine: voices → delay → reverb → master, block by block ─────────────
const DEFS = { cplx: Cplx, swell: Swell, glass: Glass, breath: Breath, tine: Tine, wood: Wood, bite: Bite, drop: Drop, tick: Tick, glint: Glint, rustle: Rustle, sea: Sea, drone: Drone, piano: Piano, strings: Strings, vibe: Vibe, swarm: Swarm, wave: Wave };

export class Engine {
  constructor(sr, { seed = 1, noiseOff = false, master = {} } = {}) {
    this.sr = sr; this.kr = sr / BS; this.seed = seed >>> 0; this.noiseOff = noiseOff;
    this.B = new Buses(); this.S = new Scratch();
    this.voices = []; this.nodes = new Map();
    this.fxRg = new RGen(this.nextSeed()); this.fxRg.off = noiseOff;
    this.ping = new PingPong(sr); this.fdn = new FDN(sr, this.fxRg); this.master = new Master(sr, master);
    this.blocks = 0;
  }
  nextSeed() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed; }
  // start a synth; id (optional) names a persistent node that can be set later
  spawn(def, params, id) {
    const C = DEFS[def]; if (!C) return null;
    const v = new C(this, params || {});
    this.voices.push(v);
    if (id != null) this.nodes.set(id, v);
    return v;
  }
  set(id, params) {
    if (id === 'master') { Object.assign(this.master.p, params); return; }
    if (id === 'fdn') { Object.assign(this.fdn.p, params); return; }
    if (id === 'ping') { Object.assign(this.ping.p, params); return; }
    const v = this.nodes.get(id); if (v) Object.assign(v.p, params);
  }
  free(id) { const v = this.nodes.get(id); if (v) { v.done = true; this.nodes.delete(id); } }
  // render one 64-sample block into outL/outR
  block(outL, outR) {
    const B = this.B, S = this.S;
    B.clear();
    const vs = this.voices;
    let w = 0;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      S.reset();
      v.tick(B, S);
      if (!v.done) vs[w++] = v;
    }
    vs.length = w;
    S.reset(); this.ping.process(B, S);
    S.reset(); this.fdn.process(B, S);
    S.reset(); this.master.process(B, S, outL, outR);
    this.blocks++;
  }
}
