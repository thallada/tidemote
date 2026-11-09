// The promo track: the song (song.mjs) on tidemote's own synth engine, the cells' field mix underneath in the same
// key and on the same grid. Renders offline to WAV (raw.wav, then track.wav at -14 LUFS and track.mp3) and writes the
// grid the edit cuts on (times.json) and every note it plays (events.json: the kicks the editor marks).
//   node tools/promo/track/track.mjs --out DIR [--src CHECKOUT] [--field field.json] [--seed 7]
// --src: the checkout whose audio engine (src/audio) plays it, the one the soundtrack was approved on (master.mjs passes
// paths.mjs MUSIC); field.json: [{ t (s), msg }] the shots' listen/slots messages placed on the edit's timeline (master.mjs).
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { pathToFileURL } from 'node:url';
import { cliArgs } from '../paths.mjs';
import { makeSong } from './song.mjs';

const v = { out: 'track', src: path.resolve(import.meta.dirname, '../../..'), seed: 7, field: null, ...cliArgs() };
const audio = (f) => import(pathToFileURL(path.join(v.src, 'src/audio', f)).href);
const [{ Engine }, { Conductor, d2m, MODES, STEP }, { BS, SinOsc, EnvGen, WhiteNoise, BPF, HPF, LPF, RLPF, Pan2 }, { voiceOf }] = await Promise.all(['voices.js', 'conductor.js', 'ugens.js', 'mapping.js'].map(audio));
const SONG = makeSong(d2m), OUT = v.out, SEED = +v.seed, FIELD = v.field;
fs.mkdirSync(OUT, { recursive: true });
const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ── extra voices for the promo (drums, bass, risers), same bus layout as voices.js ──
const perc = (atk, rel, curve = -4) => ({ levels: [0, 1, 0], times: [atk, rel], curves: curve });
const blocks = (s, kr) => Math.max(1, Math.round(s * kr));
function out(B, L, R, rev, dly, send = 1) {
  for (let i = 0; i < BS; i++) { const l = L[i] * send, r = R[i] * send; B.dryL[i] += l; B.dryR[i] += r; B.revL[i] += l * rev; B.revR[i] += r * rev; B.dlyL[i] += l * dly; B.dlyR[i] += r * dly; }
}
class V {
  constructor(eng, p) { this.eng = eng; this.sr = eng.sr; this.kr = eng.kr; this.p = p; this.done = false; this.age = 0; this.send = 1; this.rg = { off: false, frand2: () => Math.random() * 2 - 1, frand: () => Math.random() }; this.pan = new Pan2(p.pan ?? 0); }
  tick(B, S) { this.render(B, S); if (++this.age >= this.life) this.done = true; }
  emit(B, S, sig) { const L = S.zero(), R = S.zero(); this.pan.addK(sig, this.p.pan ?? 0, 1, L, R); out(B, L, R, this.p.rev ?? 0, this.p.dly ?? 0, this.send); }
}
// kick: sine with a fast pitch fall, a soft click
class Kick extends V {
  constructor(e, p) { super(e, p); this.env = new EnvGen(perc(0.001, p.dec ?? 0.42, -5), this.sr); this.pe = new EnvGen({ levels: [p.sweep ?? 3.2, 1], times: [0.05], curves: -7 }, this.sr); this.o = new SinOsc(this.sr); this.ce = new EnvGen(perc(0.0003, 0.006), this.sr); this.n = new WhiteNoise(this.rg); this.life = blocks((p.dec ?? 0.42) + 0.05, this.kr); }
  render(B, S) {
    const p = this.p, f = p.freq ?? 48, a = p.amp ?? 0.5, env = S.get(), pe = S.get(), fr = S.get(), s = S.get(), ce = S.get(), n = S.get();
    this.env.ar(env); this.pe.ar(pe); this.ce.ar(ce); this.n.ar(n);
    for (let i = 0; i < BS; i++) fr[i] = f * pe[i];
    this.o.ai(fr, s);
    for (let i = 0; i < BS; i++) s[i] = (Math.tanh(s[i] * env[i] * 1.6) + n[i] * ce[i] * 0.35) * a;
    this.emit(B, S, s);
  }
}
// hat: high-passed noise tick (open with a longer dec)
class Hat extends V {
  constructor(e, p) { super(e, p); this.env = new EnvGen(perc(0.0005, p.dec ?? 0.04, -6), this.sr); this.n = new WhiteNoise(this.rg); this.hp = new HPF(this.sr); this.bp = new BPF(this.sr); this.life = blocks((p.dec ?? 0.04) + 0.03, this.kr); }
  render(B, S) {
    const p = this.p, a = p.amp ?? 0.1, env = S.get(), n = S.get(), h = S.get(), b = S.get();
    this.env.ar(env); this.n.ar(n); this.hp.ar(n, 7000, h); this.bp.ar(n, 10500, 0.4, b);
    for (let i = 0; i < BS; i++) h[i] = (h[i] * 0.6 + b[i] * 0.8) * env[i] * a;
    this.emit(B, S, h);
  }
}
function polyblep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
// riser: soft noise through a gentle band sweeping up (a downlifter with up: false), swelling and easing out
// before the downbeat instead of stopping hard; mostly heard through the reverb
class Riser extends V {
  constructor(e, p) { super(e, p); this.n = new WhiteNoise(this.rg); this.f = new RLPF(this.sr); this.hp = new HPF(this.sr); this.lp = new LPF(this.sr); this.t = 0; this.dur = p.dur ?? 4; this.life = blocks(this.dur + 0.05, this.kr); }
  render(B, S) {
    const p = this.p, a = p.amp ?? 0.12, n = S.get(), s = S.get(), h = S.get(), l = S.get(), x = clamp(this.t / this.dur, 0, 1), up = p.up !== false;
    const k = up ? x : 1 - x, cut = 250 * Math.pow(p.top ?? 18, k);
    const sm = (e0, e1, v) => { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const g = up ? Math.pow(x, 1.6) * (1 - sm(0.8, 1, x)) : Math.pow(1 - x, 2) * sm(0, 0.04, x);
    this.n.ar(n); this.f.ar(n, cut, 0.8, s); this.hp.ar(s, 200, h); this.lp.ar(h, 6000, l);
    for (let i = 0; i < BS; i++) l[i] *= a * g;
    this.t += BS / this.sr;
    this.emit(B, S, l);
  }
}
// impact: a low boom with a long decay, the downbeat of a drop
class Boom extends V {
  constructor(e, p) { super(e, p); this.env = new EnvGen(perc(0.002, p.dec ?? 2.5, -4), this.sr); this.pe = new EnvGen({ levels: [2, 1], times: [0.25], curves: -4 }, this.sr); this.o = new SinOsc(this.sr); this.n = new WhiteNoise(this.rg); this.lp = new LPF(this.sr); this.life = blocks((p.dec ?? 2.5) + 0.1, this.kr); }
  render(B, S) {
    const p = this.p, a = p.amp ?? 0.4, env = S.get(), pe = S.get(), fr = S.get(), s = S.get(), n = S.get(), l = S.get();
    this.env.ar(env); this.pe.ar(pe); this.n.ar(n); this.lp.ar(n, 400, l);
    for (let i = 0; i < BS; i++) fr[i] = (p.freq ?? 40) * pe[i];
    this.o.ai(fr, s);
    for (let i = 0; i < BS; i++) s[i] = Math.tanh((s[i] + l[i] * 0.5) * env[i] * 1.4) * a;
    this.emit(B, S, s);
  }
}
// sub: a held bass with no pluck: sine plus a soft saw under a fixed low-pass, a smooth swell in and out (atk, len,
// rel), so it sits under the music instead of bouncing on it
class Sub extends V {
  constructor(e, p) { super(e, p); this.atk = p.atk ?? 0.04; this.len = p.len ?? 0.5; this.rel = p.rel ?? 0.3; this.t = 0; this.ph = [0, 0.4]; this.so = new SinOsc(this.sr); this.lp = new LPF(this.sr); this.lp2 = new LPF(this.sr); this.life = blocks(this.atk + this.len + this.rel + 0.02, this.kr); }
  render(B, S) {
    const p = this.p, f = midicps(p.note), a = p.amp ?? 0.3, sub = S.get(), s = S.get(), o = S.get(), o2 = S.get(), sr = this.sr;
    this.so.kk(f, sub);
    for (let i = 0; i < BS; i++) {
      let v = 0;
      for (let k = 0; k < 2; k++) { this.ph[k] = (this.ph[k] + f * (k ? 1.004 : 0.998) / sr) % 1; const x = this.ph[k]; v += (2 * x - 1) - polyblep(x, f / sr); }
      s[i] = v * 0.5;
    }
    this.lp.ar(s, p.cut ?? 320, o); this.lp2.ar(o, p.cut ?? 320, o2);
    for (let i = 0; i < BS; i++) {
      const t = (this.t + i) / sr, sm = (x) => x * x * (3 - 2 * x);
      const env = t < this.atk ? sm(t / this.atk) : t < this.atk + this.len ? 1 : Math.max(0, 1 - (t - this.atk - this.len) / this.rel) ** 2;
      o2[i] = Math.tanh((sub[i] * 0.8 + o2[i] * (p.body ?? 0.6)) * (p.drive ?? 1.1)) * env * a;
    }
    this.t += BS;
    this.emit(B, S, o2);
  }
}
const EXTRA = { sub: Sub, kick: Kick, hat: Hat, riser: Riser, boom: Boom };
class PromoEngine extends Engine {
  spawn(def, params, id) {
    const C = EXTRA[def];
    if (!C) return super.spawn(def, params, id);
    const v = new C(this, params || {}); this.voices.push(v);
    if (id != null) { this.nodes.set(id, v); v.persistent = true; }
    return v;
  }
}

// ── the conductor: the song's tempo map and parts on its own step clock, the field on the same grid ──
class Promo extends Conductor {
  constructor(eng, song, opts) {
    super(eng, opts);
    this.song = song; this.barTimes = []; this.stepTimes = [];
    this.score.bar = () => {}; this.score.overture = () => {}; this.score.bridge = () => {}; this.score.arrive = () => {};
    this.nextStep = song.lead ?? 0.5;
    this.nextWave = 1e9;
    this.parts = song.parts(this);
  }
  // the step's tempo from the song's tempo map: bpm at this step
  tempoAt(n) { return this.song.bpm(n / 16); }
  render(outL, outR) {
    const t1 = this.time + BS / this.sr;
    while (this.nextStep < t1 + this.step) {
      if (this.stepN >= this.song.bars * 16) { this.nextStep = 1e9; break; }
      this.setTempo((this.tempoAt(this.stepN) * 4 * STEP) / 60);
      this.step = 15 / this.tempoAt(this.stepN);
      const ts = this.nextStep;
      if (this.stepN % 16 === 0) { this.barTimes.push(ts); this.bar(ts); }
      this.stepTimes.push(ts);
      this.parts.step(ts, this.stepN, this.step);
      this.nextStep += this.step; this.stepN++;
    }
    if (this.queue.length) {
      if (this.unsorted) { this.queue.sort((a, b) => a.t - b.t); this.unsorted = false; }
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
  bar(ts) {
    const b = Math.round(this.stepN / 16), h = this.song.harmony(b);
    if (h.root !== this.root || h.mode !== this.modeName) { this.root = h.root; this.modeName = h.mode; [this.scale] = MODES[h.mode]; }
    this.pivot = h.chord;
    const lvl = this.song.bed(b);
    this.setAt(ts, this.sea, { tide: lvl.tide, light: lvl.light, amp: 0.09 * lvl.sea });
    const note = d2m(this.pivot, this.root, this.scale) - 12;
    if (note !== this.droneNote) { this.drone = this.swap(ts, 'drone', { amp: 0.048 * lvl.drone, note, light: lvl.light }, 2, this.drone); this.droneNote = note; }
    this.setAt(ts, this.drone, { light: lvl.light, amp: 0.048 * lvl.drone });
    this.field.gain && Object.assign(this.field.gain, lvl.field || {});
    this.parts.bar(ts, b, this.step);
  }
}

const sr = 48000, eng = new PromoEngine(sr, { seed: SEED }), cond = new Promo(eng, SONG, { seed: SEED });
cond.ws = SEED;
cond.events = []; // every note the song plays: [t, layer, def, amp]
// field messages
let field = [];
if (FIELD) field = JSON.parse(fs.readFileSync(FIELD, 'utf8'));
let k = 0;
const voiceCache = new Map();
const total = SONG.lead + SONG.length() + SONG.tail;
const nb = Math.ceil((total * sr) / BS), L = new Float32Array(nb * BS), R = new Float32Array(nb * BS), bl = new Float32Array(BS), br = new Float32Array(BS);
const t0 = performance.now();
for (let b = 0; b < nb; b++) {
  const ta = (b * BS) / sr;
  while (k < field.length && field[k].t <= ta) {
    const m = { ...field[k++].msg };
    if (m.type === 'listen') m.ev = Float32Array.from(m.ev);
    if (m.type === 'slots') m.slots = m.slots.map((x) => { const v = x.genome ? voiceOf(x.genome) : x.voice || voiceCache.get(x.serial) || null; if (v) voiceCache.set(x.serial, v); return { ...x, voice: v }; }).filter((x) => x.voice);
    if (m.type === 'world') continue; // the song sets the bed itself
    cond.message(m);
  }
  cond.render(bl, br);
  L.set(bl, b * BS); R.set(br, b * BS);
}
console.log(`${total.toFixed(1)} s in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${cond.barTimes.length} bars`);
const wav = (p, l, r) => {
  const n = l.length, buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(l[i], 44 + i * 8); buf.writeFloatLE(r[i], 48 + i * 8); }
  fs.writeFileSync(p, buf);
};
wav(path.join(OUT, 'raw.wav'), L, R);
fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify(cond.events));
fs.writeFileSync(path.join(OUT, 'times.json'), JSON.stringify({ bars: cond.barTimes, steps: cond.stepTimes, sections: SONG.sections, total }));
const meas = spawnSync('ffmpeg', ['-hide_banner', '-i', path.join(OUT, 'raw.wav'), '-af', 'ebur128', '-f', 'null', '-']).stderr.toString();
const I = +(meas.slice(meas.lastIndexOf('Summary')).match(/I:\s+(-?[\d.]+)/) || [0, -14])[1];
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'raw.wav'), '-af', `volume=${(-14 - I).toFixed(2)}dB,alimiter=limit=0.89:attack=2:release=60:level=false`, '-ar', '48000', '-c:a', 'pcm_s16le', path.join(OUT, 'track.wav')]);
if (r.status) console.log(r.stderr.toString());
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'track.wav'), '-b:a', '256k', path.join(OUT, 'track.mp3')]);
console.log('wrote', OUT);
