// The hand heard (docs/hand.md): what the viewer does with the tool in hand echoes in the soundtrack, clear over
// the field but never over it for long. Runs in the audio thread on the conductor's clock. The page sends the
// hand's acts as they happen ({ type: 'hand', ev, ... }) and, every frame something changes, its state
// ({ type: 'hand', ev: 'state', tool, level, move, held, water, freezing, ice, ride, will, pan }); the sounds are
// the soundtrack's own voices in the world's key.
//   picking up a tool: instruments on a metal tray (glass, steel, a switch)
//   the rod: a fingertip in a basin (a tap plips, the dip gloops, a stir sloshes as fast as it goes, a ring wave
//     whomps, lifting out plips)
//   the needle: a prick is one muted pluck; drawn through the water, a scalpel through paper, rougher where it
//     cuts bonds
//   the pipette: glass marbles (a click for every cell taken or set down, lower set down; full, a cork)
//   the lamp: wind chimes catching the light, more of them the brighter it is
//   the shade: a low bowed harmonic sliding down a step as it darkens
//   the warm stage: a heavy pan warming (a rumble under the water as hot as the water under it is, a few low
//     bubbles, and the boil's)
//   the cold probe: the pond freezing over (while the water under it freezes, ice cracking in runs of snaps; two
//     groans as the ice begins and as it fills the reach; the whole world dimming and stepping back with the ice)
//   riding: the ridden cell's song forward (it is the picked species), the rest stepped back, and while it is
//     steered the low rush of the water past it
//   the loupe: a camera shutter as the lens is set down (on a touch screen only, where that is the act)
// The held sounds (the stir, the scalpel, the shade's note, the rumble, the rush) are single voices that swell and
// fade with what the hand does, never a train of notes restarting. While the rod or the pipette is at work the
// field steps back a little (duck), more in the ice, most riding.

import { d2m } from './conductor.js';
import { BS } from './ugens.js';

const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const AHEAD = 0.02; // seconds from a message to its sound (the next block or so)
const DUCK = 0.8; // the field while the rod or the pipette is at work
const LAMP_STEP = 0.18; // the chimes' chances come this often (seconds), whatever the simulation's speed
const MARBLE_GAP = 0.04; // seconds between the pipette's marbles at most
const AHEAD_MAX = 1.2; // seconds of the pipette's marbles queued at most (the rest are dropped)
const SLIDE = 3; // seconds the shade's harmonic takes to slide down its step
const HEAT = [30, 95]; // the water under the stage (°): heard warming from, and at the full rumble by
const BOILING = 92; // the water under the stage (°) from which the boil's bubbles come
const KEEP = 2; // seconds a held voice stays silent before it ends

export class HandSound {
  constructor(cond) {
    this.c = cond; this.rnd = cond.rnd; this.dt = BS / cond.sr; // (a block's seconds)
    this.s = { tool: 'none', level: 0, move: 0, pan: 0, held: false, water: null, freezing: 0, ice: 0 };
    this.duck = 1;
    this.marbleAt = 0; this.chimeAt = 0; this.bubbleAt = 0; this.fizzAt = 0; this.rushAt = 0; this.crackAt = 0;
    this.held = {}; // the held voices: name -> { id, on (when it began), quiet (when it was last heard) }
    // (eased: the stir's and the scalpel's speed, the scalpel's grit from the bonds it cuts, the water's heat, how
    // fast ice forms, how much there is, riding's rush; groans: how many have sounded since the ice began)
    this.stir = 0; this.cutV = 0; this.grit = 0; this.heat = 0; this.freeze = 0; this.ice = 0; this.groans = 0; this.rush = 0; this.dim = false;
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
  // x eased toward `to` with time constant tau (seconds), once a block
  ease(x, to, tau) { return x + (to - x) * (1 - Math.exp(-this.dt / tau)); }

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
      case 'cut': this.grit = Math.min(1, this.grit + 0.2 * m.n); break; // (the paper's fibers: the scalpel roughens)
      case 'cells': this.marbles(m.n, m.out, now, pan); break;
      case 'full': this.at(now, 'wood', { freq: this.hz(0, -1), dec: 0.25, bright: 0.05, amp: 0.3, pan, rev: 0.1 }); break;
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

  // n cells into the pipette's glass (or out of it, a little lower): a marble's click each
  marbles(n, out, t, pan) {
    for (let i = 0; i < n; i++) {
      const at = Math.max(t + this.rnd() * 0.03, this.marbleAt + MARBLE_GAP * (0.7 + 0.6 * this.rnd()));
      if (at - t > AHEAD_MAX) break;
      this.marbleAt = at;
      this.at(at, 'tine', { freq: (out ? 2400 : 3200) * (0.9 + 0.25 * this.rnd()), dec: 0.25, bright: 0.9, amp: 0.045, pan: pan + 0.15 * (this.rnd() - 0.5), rev: 0.3 });
    }
  }

  // once per block: the held tools' sounds, from the page's last word of what the hand is doing
  tick() {
    const c = this.c, t = c.time + AHEAD, s = this.s, v = s.level;
    // (the rod's stir and the pipette at work duck the field, the ice more, riding most, and it comes back)
    const busy = (s.tool === 'touch' && s.held) || (s.tool === 'pipette' && s.held);
    const to = s.ride ? 0.55 : Math.min(busy ? DUCK : 1, 1 - 0.3 * this.ice);
    this.duck += (to - this.duck) * 0.02;
    this.rod(s.tool === 'touch' ? s.move : 0, t);
    this.needle(s.tool === 'needle' ? s.move : 0, t);
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
    if (sh) c.eng.set(sh.id, { amp: 0.086 * (s.tool === 'shade' ? v : 0), freq: this.hz(4, -1) * Math.pow(2, (-2 * Math.min(1, (t - sh.on) / SLIDE)) / 12), pan: s.pan });
    this.warm(s.tool === 'warm' && s.water != null ? s.water : null, t);
    this.cold(s.tool === 'cold' ? s.freezing || 0 : 0, s.tool === 'cold' ? s.ice || 0 : 0, t);
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

  // the rod's stir (m: its speed, 0..4): one band of sloshing water, louder and brighter the faster it goes, a
  // bubble now and then
  rod(m, t) {
    const v = this.stir = this.ease(this.stir, m, 0.12), pan = this.s.pan;
    const h = this.hold('stir', v > 0.05, t, () => ['air', { freq: 400, rq: 0.6, gust: 0.6, rate: 3, rev: 0.3 }]);
    if (h) this.c.eng.set(h.id, { amp: 0.024 * v, freq: 380 + 260 * v, pan });
    if (v > 0.05 && t >= this.bubbleAt) {
      this.bubbleAt = t + 0.07;
      if (this.rnd() < v / 6) this.at(t, 'drop', { freq: 500 + 900 * this.rnd(), rise: 1.4, dec: 0.04, amp: 0.012, pan, rev: 0.4 });
    }
  }

  // the needle drawn through the water (m: its speed, 0..4): a scalpel through paper, a dry high tearing as fast as
  // it goes, rougher and louder for a moment where it cuts bonds (grit)
  needle(m, t) {
    const v = this.cutV = this.ease(this.cutV, Math.min(1, m), 0.06);
    this.grit = this.ease(this.grit, 0, 0.15);
    const h = this.hold('scalpel', v > 0.03, t, () => ['air', { freq: 3000, rq: 0.4, gust: 0.5, rate: 9, rev: 0.15 }]);
    if (h) this.c.eng.set(h.id, { amp: 0.16 * v * (0.7 + 0.6 * this.grit), freq: 2200 + 1800 * v + 800 * this.grit, gust: 0.4 + 0.5 * this.grit, pan: this.s.pan });
  }

  // the warm stage over water at T° (null: no stage): a rumble under it, from HEAT[0] to HEAT[1], a few low bubbles,
  // and the boil's bubbles from BOILING
  warm(T, t) {
    this.heat = this.ease(this.heat, T == null ? 0 : clamp((T - HEAT[0]) / (HEAT[1] - HEAT[0]), 0, 1), 0.3);
    const h = this.heat, boil = T == null ? 0 : clamp((T - BOILING) / (100 - BOILING), 0, 1), pan = this.s.pan;
    const r = this.hold('rumble', h > 0.01, t, () => ['air', { freq: 220, rq: 1.6, gust: 0.7, rate: 5, rev: 0.2 }]);
    if (r) this.c.eng.set(r.id, { amp: 0.32 * h, freq: 220 + 150 * h, pan });
    if (h > 0.01 && t >= this.fizzAt) {
      this.fizzAt = t + 0.02;
      if (this.rnd() < 14 * h * 0.02) this.at(t, 'drop', { freq: 700 * Math.pow(1800 / 700, this.rnd()), rise: 1.3 + 0.6 * this.rnd(), dec: 0.012 + 0.025 * this.rnd(), amp: 0.027 * (0.3 + 0.7 * this.rnd()) ** 2, pan: pan + 0.7 * (this.rnd() - 0.5), rev: 0.3 });
      if (this.rnd() < boil * 0.35) this.at(t, 'drop', { freq: 250 + 500 * this.rnd(), rise: 1.5 + this.rnd(), dec: 0.03 + 0.03 * this.rnd(), amp: 0.045, pan: pan + 0.5 * (this.rnd() - 0.5), rev: 0.3 });
    }
  }

  // the cold probe (freezing: how fast the water under it is freezing, 0..1; ice: how much of its reach is ice):
  // while ice forms it cracks in runs of snaps (each a few milliseconds of noise, no two alike), a deep crack now
  // and then; a groan as the ice begins, a lower one as it fills the reach; the world dims (the master's tone) and
  // steps back with the ice. The ice gone from under it (or the probe), all of it eases away.
  cold(freezing, ice, t) {
    this.freeze = this.ease(this.freeze, freezing, freezing > this.freeze ? 0.1 : 0.4);
    this.ice = this.ease(this.ice, ice, ice > this.ice ? 0.5 : 1.2);
    const f = this.freeze, c = this.c, pan = this.s.pan;
    if (this.ice > 0.01 || this.dim) { this.dim = this.ice > 0.01; c.eng.set('master', { tone: 16000 * Math.pow(3000 / 16000, this.dim ? this.ice : 0) }); }
    // (the groans: the first as ice begins, the second, a step lower, as it fills the reach; again once it is gone)
    if (ice <= 0 && this.ice < 0.05) this.groans = 0;
    if ((this.groans === 0 && ice > 0) || (this.groans === 1 && ice > 0.85)) {
      const d = -this.groans++;
      this.at(t, 'glass', { freq: this.hz(d, 0), amp: 0.15, atk: 0.3, sus: 1.2, rel: 1.8, bright: 0.5, pan: pan + 0.2 * d, rev: 0.6 });
    }
    if (f < 0.02 || t < this.crackAt) return;
    this.crackAt = t + 0.05;
    if (this.rnd() < f * 0.35) {
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
    const v = this.rush = this.ease(this.rush, w, 0.6);
    const r = this.hold('rush', v > 0.01, t, () => ['air', { freq: 160, rq: 1.1, gust: 0.5, rate: 0.8, rev: 0.25 }]);
    if (r) this.c.eng.set(r.id, { amp: 0.1 * v, freq: 160 + 260 * v, pan: 0.25 * Math.sin(t * 0.9) });
    if (v > 0.01 && t >= this.rushAt) {
      this.rushAt = t + 0.06;
      if (this.rnd() < v * 0.12) this.at(t, 'drop', { freq: 400 + 600 * this.rnd(), rise: 1.4, dec: 0.05, amp: 0.055, pan: 0.6 * (this.rnd() - 0.5), rev: 0.4 });
    }
  }
}
