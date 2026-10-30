// The hand heard (docs/hand.md): what the viewer does with the tool in hand echoes in the soundtrack, clear over
// the field but never over it for long. Runs in the audio thread on the conductor's clock. The page sends the
// hand's acts as they happen ({ type: 'hand', ev, ... }) and, every frame something is held, its state
// ({ type: 'hand', ev: 'state', tool, level, rod, held, ride, will, pan }); the sounds are the soundtrack's own voices in the
// world's key, the notes on its pulse.
//   picking up a tool: instruments on a metal tray (glass, steel, a switch)
//   the rod: a fingertip in a basin (a tap plips, the dip glooops, a stir sloshes as fast as it goes, a ring
//     wave whomps, lifting out plips)
//   the needle: snipping harp strings (a prick one muted pluck, every bond cut a note of a falling run)
//   the pipette: glass marbles (a click for every cell taken or set down, lower set down; full, a cork)
//   the lamp: wind chimes catching the light, more of them the brighter it is
//   the shade: a low bowed harmonic sliding down a step as it darkens
//   the warm stage: a heavy pan warming (a rumble under the water, a few low bubbles, then the boil)
//   the cold probe: the pond freezing over (ice cracking in runs of snaps, two deep groans sinking, the whole world
//     dimming and stepping back while the cold holds)
//   riding: the ridden cell's song forward (it is the picked species), the rest stepped back, and while it is
//     steered the low rush of the water past it
//   the loupe: a camera shutter as the lens is set down (on a touch screen only, where that is the act)
// While the rod or the pipette is at work the field steps back a little (duck), more in the cold, most riding.

import { d2m } from './conductor.js';
import { BS } from './ugens.js';

const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const AHEAD = 0.02; // seconds from a message to its sound (the next block or so)
const DUCK = 0.8; // the field while the rod or the pipette is at work
const LAMP_STEP = 0.18; // the chimes' chances come this often (seconds), whatever the simulation's speed
const RUN_GAP = 2; // seconds without a cut before the needle's run starts again from its top
const MARBLE_GAP = 0.04; // seconds between the pipette's marbles at most
const AHEAD_MAX = 1.2; // seconds of the needle's or the pipette's notes queued at most (the rest are dropped)
const SLIDE = 3; // seconds the shade's harmonic takes to slide down its step
const BOIL = 3.2; // seconds the warm stage, held, takes to bring the water to the boil (as heard)
const ICE = [1.2, 2]; // seconds of the cold probe held before ice is heard forming, and over which it thickens
const THAW = 1.2; // seconds the ice's sound takes to fade once the probe is gone (a time constant)
const KEEP = 2; // seconds a held voice stays silent before it ends

export class HandSound {
  constructor(cond) {
    this.c = cond; this.rnd = cond.rnd; this.dt = BS / cond.sr; // (a block's seconds)
    this.s = { tool: 'none', level: 0, rod: 0, pan: 0, held: false };
    this.duck = 1;
    this.cuts = 0; this.lastCut = -1e9; this.pluckAt = 0; this.marbleAt = 0;
    this.chimeAt = 0; this.stirAt = 0; this.bubbleAt = 0;
    this.held = {}; // the held voices: name -> { id, on (when it began), quiet (when it was last heard) }
    this.heat = 0; this.chill = 0; this.frost = 0; this.groans = 0; this.rush = 0; this.dim = false;
    this.fizzAt = 0; this.rushAt = 0; this.crackAt = 0;
  }
  // a scale degree of the world's key, oct octaves up from its root's
  hz(deg, oct = 0) { const c = this.c; return midicps(d2m(deg, c.root, c.scale) + 12 * oct); }
  // the pulse's next sixteenth at or after t
  grid(t) {
    const c = this.c, st = c.step;
    let s = c.nextStep;
    while (s - st >= t) s -= st;
    while (s < t) s += st;
    return s;
  }
  at(t, def, p) { this.c.at(t, def, p); }

  message(m) {
    const now = this.c.time + AHEAD, pan = m.pan ?? this.s.pan;
    switch (m.ev) {
      case 'state': Object.assign(this.s, m); break;
      case 'pick': this.pick(m.tool, now); break;
      case 'tap': this.at(now, 'drop', { freq: this.hz(4, 2), rise: 1.8, dec: 0.07, amp: 0.039, pan, rev: 0.4 }); break;
      case 'dip': this.at(now, 'drop', { freq: this.hz(0, 1), rise: 0.55, dec: 0.22, amp: 0.053, pan, rev: 0.45 }); break;
      case 'lift': this.at(now, 'drop', { freq: this.hz(2, 1), rise: 1.5, dec: 0.12, amp: 0.029, pan }); break;
      case 'ring': this.at(now, 'wood', { freq: this.hz(0, -1), dec: 0.7, bright: 0.2, amp: 0.134, pan, rev: 0.4 }); break;
      case 'prick': this.at(this.grid(now), 'pluck', { freq: this.hz(0, 2), dec: 0.25, bright: 0.25, coef: 0.6, amp: 0.12, pan }); break;
      case 'cut': this.cut(m.n, now, pan); break;
      case 'cells': this.marbles(m.n, m.out, now, pan); break;
      case 'full': this.at(now, 'wood', { freq: this.hz(0, -1), dec: 0.25, bright: 0.05, amp: 0.19, pan, rev: 0.1 }); break;
      case 'lens': // the shutter
        this.at(now, 'tick', { freq: 3800, dec: 0.008, amp: 0.136, pan });
        this.at(now + 0.06, 'wood', { freq: 420, dec: 0.06, bright: 0.8, amp: 0.28, pan });
        break;
    }
  }

  // instruments taken up from a tray: glass for the rod and the pipette, steel for the needle and the probe, a
  // switch for the lamp, the shade and the stage, a lens's glass for the loupe (and nothing for empty hands)
  pick(tool, t) {
    const pan = 0.2;
    if (tool === 'touch' || tool === 'pipette' || tool === 'loupe') this.at(t, 'tine', { freq: { touch: 2900, pipette: 3500, loupe: 4200 }[tool], dec: 0.4, bright: 0.9, amp: 0.018, pan });
    else if (tool === 'needle' || tool === 'cold') {
      this.at(t, 'tick', { freq: tool === 'needle' ? 6200 : 3300, dec: 0.03, amp: 0.053, pan });
      this.at(t, 'tine', { freq: tool === 'needle' ? 5100 : 1900, dec: 0.25, bright: 1, amp: 0.009, pan });
    } else if (tool !== 'none') {
      const f = { lamp: 900, shade: 760, warm: 640 }[tool] || 900;
      this.at(t, 'tick', { freq: 1700, dec: 0.012, amp: 0.053, pan });
      this.at(t + 0.035, 'wood', { freq: f, dec: 0.04, bright: 0.9, amp: 0.071, pan });
    }
  }

  // n bonds cut: a pluck each, down the scale from the sixth degree two octaves up, on the pulse, one a sixteenth
  cut(n, t, pan) {
    if (t - this.lastCut > RUN_GAP) this.cuts = 0;
    this.lastCut = t;
    for (let i = 0; i < n; i++) {
      const at = this.grid(Math.max(t, this.pluckAt + this.c.step * 0.99));
      if (at - t > AHEAD_MAX) break;
      this.pluckAt = at;
      this.at(at, 'pluck', { freq: this.hz(6 - (this.cuts++ % 8), 2), dec: 0.9, bright: 0.6, amp: 0.12, pan, rev: 0.25, dly: 0.12 });
    }
  }

  // n cells into the pipette's glass (or out of it, a little lower): a marble's click each
  marbles(n, out, t, pan) {
    for (let i = 0; i < n; i++) {
      const at = Math.max(t + this.rnd() * 0.03, this.marbleAt + MARBLE_GAP * (0.7 + 0.6 * this.rnd()));
      if (at - t > AHEAD_MAX) break;
      this.marbleAt = at;
      this.at(at, 'tine', { freq: (out ? 2400 : 3200) * (0.9 + 0.25 * this.rnd()), dec: 0.25, bright: 0.9, amp: 0.016, pan: pan + 0.15 * (this.rnd() - 0.5), rev: 0.3 });
    }
  }

  // once per block: the held tools' sounds, from the page's last word of what the hand is doing
  tick() {
    const c = this.c, t = c.time + AHEAD, s = this.s, v = s.level;
    // (the rod's stir and the pipette at work duck the field, the cold more, riding most, and it comes back)
    const busy = (s.tool === 'touch' && s.held) || (s.tool === 'pipette' && s.held);
    const to = s.ride ? 0.55 : Math.min(busy ? DUCK : 1, 1 - 0.3 * this.frost);
    this.duck += (to - this.duck) * 0.02;
    // the rod's stir: water sloshing, brighter the faster, a bubble now and then (v: 0..4)
    if (s.tool === 'touch' && s.rod > 0.3 && t >= this.stirAt) {
      const r = s.rod;
      this.stirAt = t + 0.09;
      this.at(t, 'rustle', { f0: 250 + 120 * r, f1: 500 + 400 * r, rq: 0.5, atk: 0.05, dec: 0.18, amp: 0.0085 * r, pan: s.pan, rev: 0.3 });
    }
    if (s.tool === 'touch' && s.rod > 0 && t >= this.bubbleAt) {
      this.bubbleAt = t + 0.07;
      if (this.rnd() < s.rod / 6) this.at(t, 'drop', { freq: 500 + 900 * this.rnd(), rise: 1.4, dec: 0.04, amp: 0.012, pan: s.pan, rev: 0.4 });
    }
    // the lamp: a chime's chance every LAMP_STEP, better the brighter it is
    if (s.tool === 'lamp' && v > 0.01 && t >= this.chimeAt) {
      this.chimeAt = t + LAMP_STEP;
      if (this.rnd() < 0.12 + 0.6 * v) {
        const deg = [0, 2, 4, 5, 7][Math.floor(this.rnd() * 5)];
        this.at(this.grid(t), 'glint', { freq: this.hz(deg, 3), dec: 0.5 + 0.6 * this.rnd(), amp: (0.025 + 0.03 * v) * 0.36, pan: s.pan + 0.6 * (this.rnd() - 0.5), rev: 0.6, dly: 0.2 });
      }
    }
    // the shade: one glass note, as loud as the shade is deep, sliding down a step over SLIDE seconds while it is on
    const sh = this.hold('shade', s.tool === 'shade' && v > 0.01, t, () => ['glass', { freq: this.hz(4, -1), atk: 0.05, sus: 1e5, rel: 1.5, bright: 0.3, rev: 0.45 }]);
    if (sh) this.c.eng.set(sh.id, { amp: 0.086 * (s.tool === 'shade' ? v : 0), freq: this.hz(4, -1) * Math.pow(2, (-2 * Math.min(1, (t - sh.on) / SLIDE)) / 12), pan: s.pan });
    this.warm(s.tool === 'warm' ? v : 0, t);
    this.cold(s.tool === 'cold' ? v : 0, t);
    this.ride(s.ride ? s.will || 0 : 0, t);
  }

  // A held voice, name: begun (make() gives its def and params, silent) when on, ended KEEP seconds after it was
  // last on; null while there is none.
  hold(name, on, t, make) {
    const c = this.c;
    let h = this.held[name];
    if (on && !h) {
      const [def, p] = make();
      h = this.held[name] = { id: 'hand' + name + ++c.nodeN, on: t, quiet: t };
      c.eng.spawn(def, { ...p, amp: 0 }, h.id);
    }
    if (!h) return null;
    if (on) h.quiet = t;
    else if (t - h.quiet > KEEP) { c.eng.free(h.id); delete this.held[name]; return null; }
    return h;
  }

  // the warm stage: the water heats while it is held (to the boil in BOIL seconds, as far as the stage's level),
  // cools quickly when it is not; a rumble under it as hot as it is, a few low bubbles, and the boil's
  warm(v, t) {
    this.heat = v > this.heat ? Math.min(v, this.heat + this.dt / BOIL) : this.heat + (v - this.heat) * (1 - Math.exp(-this.dt / 0.3));
    const h = this.heat, pan = this.s.pan;
    const r = this.hold('rumble', h > 0.01, t, () => ['air', { freq: 220, rq: 1.6, gust: 0.7, rate: 5, rev: 0.2 }]);
    if (r) this.c.eng.set(r.id, { amp: 0.633 * h, freq: 220 + 150 * h, pan });
    if (h > 0.01 && t >= this.fizzAt) {
      this.fizzAt = t + 0.02;
      if (this.rnd() < 14 * h * 0.02) this.at(t, 'drop', { freq: 700 * Math.pow(1800 / 700, this.rnd()), rise: 1.3 + 0.6 * this.rnd(), dec: 0.012 + 0.025 * this.rnd(), amp: 0.027 * (0.3 + 0.7 * this.rnd()) ** 2, pan: pan + 0.7 * (this.rnd() - 0.5), rev: 0.3 });
      if (h > 0.55 && this.rnd() < (h - 0.5) * 0.7) this.at(t, 'drop', { freq: 250 + 500 * this.rnd(), rise: 1.5 + this.rnd(), dec: 0.03 + 0.03 * this.rnd(), amp: (0.05 + 0.05 * h) * 0.452, pan: pan + 0.5 * (this.rnd() - 0.5), rev: 0.3 });
    }
  }

  // the cold probe: held, the cold builds and ice is heard forming after ICE[0] seconds, thickening over ICE[1];
  // gone, it fades over THAW. The ice cracks in runs of snaps (each a few milliseconds of noise, no two alike), a
  // deep crack now and then; two groans sink as it forms; the world dims (the master's tone) and steps back.
  cold(v, t) {
    if (v > 0.05) { this.chill += this.dt * v; this.frost = clamp((this.chill - ICE[0]) / ICE[1], 0, 1); }
    else { this.chill = 0; this.frost *= Math.exp(-this.dt / THAW); if (this.frost < 0.01) { this.frost = 0; this.groans = 0; } }
    const f = this.frost, c = this.c, pan = this.s.pan;
    if (f > 0 || this.dim) { c.eng.set('master', { tone: 16000 * Math.pow(3000 / 16000, f) }); this.dim = f > 0; }
    // (the groans: the first as the ice begins, the second, a step lower, as it thickens)
    if ((this.groans === 0 && f > 0.05) || (this.groans === 1 && f > 0.7)) {
      const d = -this.groans++;
      this.at(t, 'glass', { freq: this.hz(d, -1), amp: 0.063, atk: 0.4, sus: 1.4, rel: 1.6, bright: 0.35, pan: pan + 0.2 * d, rev: 0.6 });
    }
    if (f <= 0 || t < this.crackAt) return;
    this.crackAt = t + 0.05;
    if (this.rnd() < f * 0.25) {
      const p = pan + 0.9 * (this.rnd() - 0.5), k = 2 + Math.floor(this.rnd() * 6 * (0.4 + f));
      let u = t;
      for (let i = 0; i < k; i++) {
        const f0 = 700 * Math.pow(6, this.rnd());
        this.at(u, 'rustle', { f0, f1: f0 * (0.6 + 0.7 * this.rnd()), rq: 0.8 + 1.2 * this.rnd(), atk: 0.001, dec: 0.004 + 0.016 * this.rnd(), amp: 0.108 * (0.3 + 0.7 * this.rnd()), pan: p + 0.1 * (this.rnd() - 0.5), rev: 0.35 });
        u += 0.005 + 0.035 * this.rnd();
      }
    }
    if (this.rnd() < f * 0.025) {
      const p = pan + 0.8 * (this.rnd() - 0.5);
      this.at(t, 'wood', { freq: 90 + 90 * this.rnd(), dec: 0.15, bright: 0.8, amp: 0.12, pan: p, rev: 0.4 });
      this.at(t, 'rustle', { f0: 500, f1: 300, rq: 1.5, atk: 0.001, dec: 0.06, amp: 0.144, pan: p, rev: 0.4 });
    }
  }

  // riding, steered (w: the will's strength): the water rushing past the ridden cell, low and soft, louder and a
  // little higher as it is steered, a bubble now and then
  ride(w, t) {
    this.rush += (w - this.rush) * (1 - Math.exp(-this.dt / 0.6));
    const v = this.rush;
    const r = this.hold('rush', v > 0.01, t, () => ['air', { freq: 160, rq: 1.1, gust: 0.5, rate: 0.8, rev: 0.25 }]);
    if (r) this.c.eng.set(r.id, { amp: 0.1 * v, freq: 160 + 260 * v, pan: 0.25 * Math.sin(t * 0.9) });
    if (v > 0.01 && t >= this.rushAt) {
      this.rushAt = t + 0.06;
      if (this.rnd() < v * 0.12) this.at(t, 'drop', { freq: 400 + 600 * this.rnd(), rise: 1.4, dec: 0.05, amp: 0.055, pan: 0.6 * (this.rnd() - 0.5), rev: 0.4 });
    }
  }
}
