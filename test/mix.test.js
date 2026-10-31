import test from 'node:test';
import assert from 'node:assert/strict';
import { MIX, LAYERS, defaultMix, fullMix, mixMessage } from '../src/audio/mix.js';
import { Engine, Master, FDN, Buses } from '../src/audio/voices.js';
import { Conductor } from '../src/audio/conductor.js';
import { BS, RGen } from '../src/audio/ugens.js';

const SR = 48000;
// (the master's scratch buffers, as the engine's)
class Scratch { constructor() { this.b = Array.from({ length: 48 }, () => new Float32Array(BS)); this.i = 0; } reset() { this.i = 0; } get() { return this.b[this.i++]; } } // (as the page's: the master's tone sits above a lower rate's Nyquist frequency)

// the conductor run for secs with a mix (null: never sent), its gains at once; ev(c, block) before each block
function render(mix, secs, ev = null) {
  const eng = new Engine(SR, { seed: 5 }), c = new Conductor(eng, { seed: 5 });
  if (mix) { c.message(mixMessage(mix)); Object.assign(eng.groups, eng.groupTo); }
  const n = Math.ceil((secs * SR) / BS), out = new Float32Array(n * BS), l = new Float32Array(BS), r = new Float32Array(BS);
  for (let b = 0; b < n; b++) { if (ev) ev(c, b); c.render(l, r); out.set(l, b * BS); }
  return out;
}
const db = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return 10 * Math.log10(s / (b - a) + 1e-30); };

test('the default mix is the soundtrack as it was: unity everywhere, the same samples', () => {
  const m = mixMessage(defaultMix());
  for (const k of LAYERS) assert.equal(m.groups[k], 1);
  const master = new Master(SR).p, fdn = new FDN(SR, new RGen(1)).p;
  for (const [k, v] of Object.entries(m.master)) assert.equal(master[k], v, k);
  for (const [k, v] of Object.entries(m.fdn)) assert.equal(fdn[k], v, k);
  const a = render(null, 3), b = render({}, 3);
  assert.ok(a.every((x, i) => x === b[i]));
});

test('a mix is made whole: unknown or out-of-range choices fall back to the default', () => {
  const f = fullMix({ music: 0, cells: 9, water: 'loud', space: -1, nonsense: 3 });
  assert.equal(f.music, 0);
  for (const k of ['cells', 'water', 'space']) assert.equal(f[k], MIX[k].def);
  assert.ok(!('nonsense' in f));
  for (const [k, s] of Object.entries(MIX)) assert.ok(s.def >= 0 && s.def < s.choices.length, k);
});

test('every layer off is silence, and Quiet is about 6 dB down', () => {
  const off = render({ music: 0, cells: 0, water: 0, tools: 0 }, 4);
  assert.ok(off.every((x) => x === 0));
  // the hand's taps alone, every half second
  const taps = (c, b) => { if (b % 375 === 50) c.message({ type: 'hand', ev: 'ring', pan: 0 }); };
  const alone = { music: 0, cells: 0, water: 0 };
  const normal = db(render(alone, 6, taps)), quiet = db(render({ ...alone, tools: 1 }, 6, taps));
  assert.ok(Math.abs(normal - quiet - 6) < 1.5, `${normal} vs ${quiet}`);
});

test('a close space dies away sooner than a vast one', () => {
  const tail = (space) => {
    const x = render({ music: 0, cells: 0, water: 0, space }, 4, (c, b) => { if (b === 750) c.message({ type: 'hand', ev: 'ring', pan: 0 }); });
    const at = (t) => db(x, Math.round(t * SR), Math.round(t * SR) + 2400);
    return at(3.5) - at(1.02);
  };
  const close = tail(0), normal = tail(1), vast = tail(2);
  assert.ok(close < normal - 6 && normal < vast - 4, `${close} ${normal} ${vast}`);
});

test('Warm takes the highs well down and Bright lifts them', () => {
  // white noise through the master alone: its energy above about 4 kHz (a one-pole high-pass) at each tone
  const highs = (tone) => {
    const m = new Master(SR, { gain: 1.6, ...MIX.tone.choices[tone][1] }), B = new Buses(), S = new Scratch(), l = new Float32Array(BS), r = new Float32Array(BS);
    const a = Math.exp((-2 * Math.PI * 4000) / SR), rnd = new RGen(3);
    let y = 0, p = 0, e = 0;
    for (let b = 0; b < 3000; b++) {
      for (let i = 0; i < BS; i++) B.dryL[i] = B.dryR[i] = 0.02 * rnd.frand2();
      S.reset(); m.process(B, S, l, r); B.clear();
      if (b > 1500) for (const v of l) { y = a * (y + v - p); p = v; e += y * y; }
    }
    return 10 * Math.log10(e);
  };
  const warm = highs(0), normal = highs(1), bright = highs(2);
  assert.ok(warm < normal - 15 && bright > normal + 4, `${warm} ${normal} ${bright}`);
});
