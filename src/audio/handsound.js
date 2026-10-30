// The hand heard (docs/hand.md): what the viewer does with the tool in hand echoes in the soundtrack, clear over
// the field but never over it for long. Runs in the audio thread on the conductor's clock. The page sends the
// hand's acts as they happen ({ type: 'hand', ev, ... }) and, every frame something is held, its state
// ({ type: 'hand', ev: 'state', tool, level, rod, pan }); the sounds are the soundtrack's own voices in the
// world's key, the notes on its pulse.
//   picking up a tool: instruments on a metal tray (glass, steel, a switch)
//   the rod: a fingertip in a basin (a tap plips, the dip glooops, a stir sloshes as fast as it goes, a ring
//     wave whomps, lifting out plips)
//   the needle: snipping harp strings (a prick one muted pluck, every bond cut a note of a falling run)
//   the pipette: glass marbles (a click for every cell taken or set down, lower set down; full, a cork)
//   the lamp: wind chimes catching the light, more of them the brighter it is
//   the shade: a low bowed harmonic sliding down a step as it darkens
//   the loupe: a camera shutter as the lens is set down (on a touch screen only, where that is the act)
// While the rod or the pipette is at work the field steps back a little (duck).

import { d2m } from './conductor.js';

const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const AHEAD = 0.02; // seconds from a message to its sound (the next block or so)
const DUCK = 0.8; // the field while the rod or the pipette is at work
const LAMP_STEP = 0.18; // the chimes' chances come this often (seconds), whatever the simulation's speed
const RUN_GAP = 2; // seconds without a cut before the needle's run starts again from its top
const MARBLE_GAP = 0.04; // seconds between the pipette's marbles at most
const AHEAD_MAX = 1.2; // seconds of the needle's or the pipette's notes queued at most (the rest are dropped)
const SLIDE = 3; // seconds the shade's harmonic takes to slide down its step

export class HandSound {
  constructor(cond) {
    this.c = cond; this.rnd = cond.rnd;
    this.s = { tool: 'none', level: 0, rod: 0, pan: 0, held: false };
    this.duck = 1;
    this.cuts = 0; this.lastCut = -1e9; this.pluckAt = 0; this.marbleAt = 0;
    this.chimeAt = 0; this.stirAt = 0; this.bubbleAt = 0;
    this.shade = null; this.shadeOn = 0; this.shadeQuiet = 0;
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
    // (the rod's stir and the pipette at work duck the field, and it comes back when they stop)
    const busy = (s.tool === 'touch' && s.held) || (s.tool === 'pipette' && s.held);
    this.duck += ((busy ? DUCK : 1) - this.duck) * 0.02;
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
    this.shadeTick(s.tool === 'shade' ? v : 0, t);
  }

  // the shade: one held glass note, as loud as the shade is deep, sliding down a step over SLIDE seconds while it
  // is on; let go for a while, it ends
  shadeTick(v, t) {
    const c = this.c;
    if (v > 0.01 && !this.shade) {
      this.shade = 'handShade' + ++c.nodeN; this.shadeOn = t;
      c.eng.spawn('glass', { freq: this.hz(4, -1), amp: 0, atk: 0.05, sus: 1e5, rel: 1.5, bright: 0.3, rev: 0.45 }, this.shade);
    }
    if (!this.shade) return;
    if (v > 0.01) this.shadeQuiet = t;
    else if (t - this.shadeQuiet > 2) { c.eng.free(this.shade); this.shade = null; return; }
    const slide = Math.pow(2, (-2 * Math.min(1, (t - this.shadeOn) / SLIDE)) / 12);
    c.eng.set(this.shade, { amp: 0.086 * v, freq: this.hz(4, -1) * slide, pan: this.s.pan });
  }
}
