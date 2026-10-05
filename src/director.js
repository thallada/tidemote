// The auto camera. Left alone for a while, the page hands the view to a director that films the
// world: slow establishing shots of the whole torus, scenes where the survey (SURVEY_WGSL) finds
// life dense, diverse and busy, and long takes that follow one organism, preferably a swimmer or a
// body. Newly established species get a visit. Nothing it does touches the simulation.
//
// Every move is slow. Between shots the view flies along a smooth zoom-and-pan path (van Wijk &
// Nuij: from afar it rises, crosses and descends, never sweeping across a close view); within a
// shot it drifts and creeps in or out at a few percent of the view per second; and the camera
// trails all of this through a critically damped spring, so even a change of plan only bends its
// course.
//
// Positions are unwrapped world coordinates (the page wraps them onto the torus); a view is
// { x, y, w }, w its width in world units.
//
// Every shot carries `why`, what the director knows of its reasons, for the page's caption:
//   { kind: 'settle' } | { kind: 'wide' }
//   { kind: 'scene', reasons: [{ key, v }], div, species?: [{ slot, serial, cells }], lost?: { serial, cells, fate } }
//   { kind: 'follow', slot, serial, cells, reasons, spotlight? } | { kind: 'linger', serial, cells, fate }
// Reasons are ranked; keys: 'mutations', 'sparks', 'kills', 'births', 'deaths', 'diverse',
// 'bodies', 'swift', 'dense'. A scene learns which species are in view once it arrives (whyVer
// counts such updates). fate is the particle the subject became, or null if it vanished.

import { SURVEY, SURVEY_WORDS, FIRST_LIFE, PICK_WORDS } from './shaders.js';
import { traceBody } from './trace.js';

const NONE = 0xffffffff;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapD = (d, W) => d - W * Math.round(d / W);
const ease = (t) => (1 - Math.cos(Math.PI * clamp(t, 0, 1))) / 2;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const RATES = ['births', 'deaths', 'kills', 'mutations', 'sparks'];
const PARTS = ['dense', 'diverse', 'births', 'deaths', 'kills', 'bodies', 'swift', 'mutations', 'sparks'];
const popcount = (v) => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

/**
 * The smooth zoom-and-pan path between two views (van Wijk & Nuij 2003, as in d3.interpolateZoom).
 * Returns at(t) for t in [0, 1] and its length S, which grows with the log of the zoom change and
 * with the distance measured in view widths.
 */
export function zoomPath(a, b, rho = 1.3) {
  const r2 = rho * rho, r4 = r2 * r2;
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
  if (d2 < 1e-12) {
    const S = Math.log(b.w / a.w) / rho;
    return { S: Math.abs(S), at: (t) => ({ x: a.x + t * dx, y: a.y + t * dy, w: a.w * Math.exp(rho * t * S) }) };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (b.w * b.w - a.w * a.w + r4 * d2) / (2 * a.w * r2 * d1);
  const b1 = (b.w * b.w - a.w * a.w - r4 * d2) / (2 * b.w * r2 * d1);
  const q0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), q1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (q1 - q0) / rho;
  const c0 = Math.cosh(q0), s0 = Math.sinh(q0);
  return {
    S,
    at(t) {
      if (t >= 1) return { ...b };
      const s = t * S;
      const u = (a.w / (r2 * d1)) * (c0 * Math.tanh(rho * s + q0) - s0);
      return { x: a.x + u * dx, y: a.y + u * dy, w: (a.w * c0) / Math.cosh(rho * s + q0) };
    },
  };
}

/** Seconds a flight along a path of length S takes: unhurried, however short. */
export const flightTime = (S) => clamp(Math.abs(S) * 7, 9, 32);

/**
 * What the director knows of the world: per survey tile, smoothed rates of what happens there.
 * Activity (births, deaths, kills) fades over about 15 s of wall time; novelty (new species,
 * life sparked from glint) is remembered for about a minute.
 */
export class Interest {
  constructor() { this.n = 0; }
  ingest(s, wallDt) {
    const [tx, ty] = s.tiles, n = tx * ty;
    if (n !== this.n || s.tile !== this.tile || s.grid[0] !== this.grid?.[0] || s.grid[1] !== this.grid?.[1]) {
      this.n = n; this.tiles = s.tiles; this.tile = s.tile; this.grid = s.grid;
      this.living = new Float32Array(n); this.bonded = new Float32Array(n); this.speed = new Float32Array(n);
      this.div = new Float32Array(n);
      for (const k of RATES) this[k] = new Float32Array(n);
      this.fresh = true;
    }
    const win = Math.max(s.window, 1 / 60);
    const kf = this.fresh ? 1 : 1 - Math.exp(-wallDt / 15);
    const ks = this.fresh ? 1 : 1 - Math.exp(-wallDt / 60);
    const ka = this.fresh ? 1 : 1 - Math.exp(-wallDt / 4);
    this.fresh = false;
    const d = s.data;
    for (let i = 0; i < n; i++) {
      const o = i * SURVEY_WORDS;
      const L = d[o + SURVEY.living];
      this.living[i] += (L - this.living[i]) * ka;
      this.bonded[i] += (d[o + SURVEY.bonded] - this.bonded[i]) * ka;
      this.speed[i] += ((L ? d[o + SURVEY.speed] / 100 / L : 0) - this.speed[i]) * ka;
      this.div[i] += (popcount(d[o + SURVEY.species]) - this.div[i]) * ka;
      for (const k of ['births', 'deaths', 'kills']) this[k][i] += (d[o + SURVEY[k]] / win - this[k][i]) * kf;
      for (const k of ['mutations', 'sparks']) this[k][i] += (d[o + SURVEY[k]] / win - this[k][i]) * ks;
    }
  }

  // Each tile's score in parts, by what draws the eye there (before blurring).
  parts() {
    const n = this.n;
    const max = (f) => { let m = 1e-9; for (let i = 0; i < n; i++) { const v = f(i); if (v > m) m = v; } return m; };
    const act = (i) => this.births[i] + this.deaths[i] + 2 * this.kills[i];
    const nov = (i) => 8 * this.mutations[i] + 3 * this.sparks[i];
    const mL = max((i) => this.living[i]), mD = max((i) => this.div[i]), mA = max(act), mN = max(nov);
    const mS = max((i) => (this.living[i] > 3 ? this.speed[i] : 0));
    const out = { total: new Float32Array(n) };
    for (const k of PARTS) out[k] = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const L = this.living[i];
      if (L < 3) continue;
      const a = act(i), sa = a > 0 ? 0.25 * Math.sqrt(a / mA) / a : 0;
      const v = nov(i), sn = v > 0 && mN > 1e-6 ? 0.6 * Math.sqrt(v / mN) / v : 0;
      out.dense[i] = 0.15 * (L / mL);
      out.diverse[i] = 0.25 * (this.div[i] / mD);
      out.births[i] = sa * this.births[i]; out.deaths[i] = sa * this.deaths[i]; out.kills[i] = sa * 2 * this.kills[i];
      out.bodies[i] = 0.2 * (this.bonded[i] / L);
      out.swift[i] = 0.15 * Math.min(1, this.speed[i] / mS);
      out.mutations[i] = sn * 8 * this.mutations[i]; out.sparks[i] = sn * 3 * this.sparks[i];
      for (const k of PARTS) out.total[i] += out[k][i];
    }
    return out;
  }

  // The tiles around tile i (3 x 3, wrapping) with their weights in the blur.
  around(i, f) {
    const [tx, ty] = this.tiles, x = i % tx, y = Math.floor(i / tx);
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) f(((y + j + ty) % ty) * tx + ((x + k + tx) % tx), (j || k) ? 0.5 : 1);
  }

  /** Why tile i draws the eye: the parts of its score around it, strongest first. */
  reasons(i, parts = this.parts()) {
    const sum = Object.fromEntries(PARTS.map((k) => [k, 0]));
    const recent = { mutations: 0, sparks: 0 };
    let div = 0;
    this.around(i, (j, w) => {
      for (const k of PARTS) sum[k] += parts[k][j] * w;
      for (const k in recent) recent[k] += this[k][j] * 60; // about how many in the last minute
      div = Math.max(div, this.div[j]);
    });
    // something new outranks everything else, if it really happened lately
    const reasons = PARTS.map((key) => ({ key, v: sum[key] + (key in recent ? 10 : 0) }))
      .filter((r) => (r.key in recent ? recent[r.key] >= 0.5 : r.v > 1e-6));
    reasons.sort((a, b) => b.v - a.v);
    return { reasons, div: Math.round(div) };
  }

  /** Tile scores in [0, 1], each blurred over its neighbours, since a shot frames several tiles. */
  scores(parts = this.parts()) {
    if (!this.n) return null;
    const n = this.n, raw = parts.total;
    const out = new Float32Array(n);
    let m = 1e-9;
    for (let i = 0; i < n; i++) {
      let s = 0, w = 0;
      this.around(i, (j, k) => { s += raw[j] * k; w += k; });
      out[i] = s / w;
      if (out[i] > m) m = out[i];
    }
    for (let i = 0; i < n; i++) out[i] /= m;
    return out;
  }

  /** World position of a tile's centre (tiles at the world's edge may be partial). */
  center(i) {
    const [tx] = this.tiles, t = this.tile;
    const x = i % tx, y = Math.floor(i / tx);
    return [Math.min((x + 0.5) * t, (x * t + this.grid[0]) / 2), Math.min((y + 0.5) * t, (y * t + this.grid[1]) / 2)];
  }
}

/**
 * The director. io supplies what it needs from the page:
 *   world() -> [W, H]; widths() -> [closest, widest] view widths in world units;
 *   pick(center, radius, opts) -> engine pick (raw); predict(particle, sampleT) -> [x, y];
 *   species(slot) -> { serial, pop } of the living species in a slot, or null;
 *   lifespan(slot) -> its cells' lifespan in sim seconds; now() -> wall seconds.
 */
export class Director {
  constructor(io, rng = Math.random) {
    this.io = io;
    this.rng = rng;
    this.interest = new Interest();
    this.active = false;
    this.trackId = NONE;
    this.spotlights = [];
    this.visited = [];
    this.history = [];
  }

  /** A new world: forget everything. */
  reset() {
    this.stop();
    this.interest = new Interest();
    this.spotlights = [];
    this.visited = [];
  }

  survey(s, wallDt) { this.interest.ingest(s, wallDt); }

  /** A species was just established: worth a visit while it is new. */
  spotlight(slot, serial) {
    this.spotlights.push({ slot, serial, t: this.io.now() });
    if (this.spotlights.length > 4) this.spotlights.shift();
  }

  start(view) {
    this.active = true;
    this.cam = { x: view.x, y: view.y, lw: Math.log(view.w), vx: 0, vy: 0, vw: 0 };
    this.history = [];
    this.planning = null;
    this.gen = (this.gen || 0) + 1;
    // first the camera wakes: the view it was left at, starting to drift
    this.lastRig = null;
    this.shot = this.makeShot('settle', view, { hold: 9 + 4 * this.rng(), fly: false });
    this.looked = 0;
  }

  stop() {
    this.active = false;
    this.shot = null;
    this.planning = null;
    this.trackId = NONE;
    this.lastRig = null;
    this.gen = (this.gen || 0) + 1;
  }

  /** Engine track samples for the followed cell. */
  onTrack(r) {
    const sh = this.shot;
    if (!sh || !sh.subject || r.id !== sh.subject.id) return;
    const dead = r.found && r.tracked.kind < FIRST_LIFE && sh.subject.p.kind >= FIRST_LIFE;
    if (!r.found || dead) {
      const fate = dead ? r.tracked : null;
      // a body lives on in its other cells; a cell not yet seen can be swapped for a kin nearby
      if (sh.why.cells > 1 || sh.t < sh.flight - 2) this.rehome(sh, fate); else this.lose(fate);
      return;
    }
    sh.subject.p = r.tracked;
    sh.subject.t = r.simTime;
  }

  // A cell of a followed body died: keep following the body through another of its cells nearby
  // (or, still on the way to a lone cell, follow another of its species there).
  rehome(sh, fate) {
    if (sh.rehoming) return;
    sh.rehoming = true;
    this.trackId = NONE;
    const old = sh.subject.p;
    const [x, y] = this.io.predict(old, sh.subject.t);
    const [W, H] = this.io.world();
    this.io.pick([x, y], 3, { kind: old.kind, maxOut: 4096, raw: true }).then((res) => {
      if (this.shot !== sh) return;
      sh.rehoming = false;
      const best = res && res.raw ? this.bodyCell(res.raw, x, y, W, H, old.id, sh.why.cells > 1) : -1;
      if (best < 0) { this.lose(fate); return; }
      const { u32, f32 } = res.raw, o = best * PICK_WORDS;
      sh.subject = { id: u32[o + 7], t: res.simTime, p: { x: f32[o], y: f32[o + 1], vx: f32[o + 2], vy: f32[o + 3], kind: u32[o + 4], energy: f32[o + 5], age: f32[o + 6], id: u32[o + 7] } };
      sh.last = null; // the new cell sits a little apart; don't read that as speed
      this.trackId = sh.subject.id;
    }, () => { if (this.shot === sh) { sh.rehoming = false; this.lose(fate); } });
  }

  // The cell near (x, y) most worth watching (bonded, for a body): close, and young enough to last.
  bodyCell({ u32, f32, count }, x, y, W, H, skip, bonded = true) {
    let best = -1, bs = Infinity;
    for (let i = 0; i < count; i++) {
      const o = i * PICK_WORDS;
      if (u32[o + 7] === skip || (bonded && u32[o + 10] === NONE && u32[o + 11] === NONE)) continue;
      const d = Math.hypot(wrapD(f32[o] - x, W), wrapD(f32[o + 1] - y, H));
      const s = d + 2 * f32[o + 6] / (this.io.lifespan(u32[o + 4]) || 100);
      if (s < bs) { bs = s; best = i; }
    }
    return best;
  }

  // The subject died or vanished: linger on the spot a moment, easing back, then move on. Lost
  // before the camera got there, the flight goes on to where it was.
  lose(fate) {
    const sh = this.shot;
    if (!sh || sh.type !== 'follow') return;
    this.trackId = NONE;
    const lost = { slot: sh.subject.p.kind, serial: sh.why.serial, cells: sh.why.cells, fate };
    if (sh.t < sh.flight - 2) {
      const [x, y] = this.io.predict(sh.subject.p, sh.subject.t);
      this.shot = this.makeShot('scene', { x, y, w: sh.target.w * 1.5 }, { hold: 10 + 6 * this.rng(), drift: 0.006, zr: 0.006,
        why: { kind: 'scene', reasons: sh.why.reasons || [], div: 0, lost } });
      return;
    }
    this.shot = this.makeShot('linger', this.lastRig || this.view(), { hold: 5 + 3 * this.rng(), zr: 0.025, drift: 0, fly: false, why: { kind: 'linger', ...lost } });
  }

  serialOf(slot) { const sp = this.io.species(slot); return sp ? sp.serial : 0; }

  view() { return { x: this.cam.x, y: this.cam.y, w: Math.exp(this.cam.lw) }; }

  /**
   * A shot flies from the current view to `to`, then holds, drifting at `drift` view widths per
   * second in a random direction and changing its width by zr per second (negative creeps in).
   */
  makeShot(type, to, { hold = 25, drift = 0.01, zr = 0, subject = null, fly = true, why = { kind: type } } = {}) {
    // from where the last shot was taking the view, so a new plan only bends the camera's course
    const from = this.lastRig || this.view();
    const [wMin, wMax] = this.io.widths();
    const [W, H] = this.io.world();
    const target = { x: from.x + wrapD(to.x - from.x, W), y: from.y + wrapD(to.y - from.y, H), w: clamp(to.w, wMin, wMax) };
    const path = zoomPath(from, target);
    const flight = fly ? flightTime(path.S) : 0;
    const a = this.rng() * Math.PI * 2;
    return {
      id: (this.shots = (this.shots || 0) + 1), why, whyVer: 0,
      type, path, target, flight, dur: flight + hold, t: 0, subject,
      dx: Math.cos(a) * drift, dy: Math.sin(a) * drift, zr,
      off: { x: 0, y: 0 }, wMul: 1, wide: 1, lead: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, last: null,
    };
  }

  update(dt) {
    if (!this.active) return null;
    const sh = this.shot;
    sh.t += dt;
    if (sh.t >= sh.dur - 1 && !this.planning) this.plan();
    else if (sh.type === 'scene' && sh.t >= sh.flight - 1 && this.looked !== sh.id) this.look(sh);
    const rig = this.rig(sh, dt);
    this.lastRig = rig;
    // the camera trails the rig through a critically damped spring
    const c = this.cam, om = 1.1;
    const lw = Math.log(rig.w);
    c.vx += (om * om * (rig.x - c.x) - 2 * om * c.vx) * dt;
    c.vy += (om * om * (rig.y - c.y) - 2 * om * c.vy) * dt;
    c.vw += (om * om * (lw - c.lw) - 2 * om * c.vw) * dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.lw += c.vw * dt;
    const [wMin, wMax] = this.io.widths();
    c.lw = clamp(c.lw, Math.log(wMin), Math.log(wMax));
    return this.view();
  }

  // Where the shot wants the view now.
  rig(sh, dt) {
    const [W, H] = this.io.world();
    const [wMin, wMax] = this.io.widths();
    let base;
    if (sh.subject) {
      const s = sh.subject;
      const [px, py] = this.io.predict(s.p, s.t);
      // the subject, unwrapped next to the shot's target, and its smoothed velocity for lead room
      const ref = sh.last || sh.target;
      const ux = ref.x + wrapD(px - ref.x, W), uy = ref.y + wrapD(py - ref.y, H);
      if (sh.last && dt > 0) {
        const k = 1 - Math.exp(-dt / 2.5);
        sh.vel.x += ((ux - sh.last.x) / dt - sh.vel.x) * k;
        sh.vel.y += ((uy - sh.last.y) / dt - sh.vel.y) * k;
      }
      sh.last = { x: ux, y: uy };
      const sp = Math.hypot(sh.vel.x, sh.vel.y);
      // a subject that hurries widens the view, so it never crosses more than a tenth of it a second
      sh.wide += (Math.max(1, sp / 0.1 / (sh.target.w * sh.wMul)) - sh.wide) * (1 - Math.exp(-dt / 2));
      const w = sh.target.w * sh.wMul * sh.wide;
      // room ahead of a moving subject, up to a sixth of the view
      const room = Math.min(1, sp / 0.3) * w / 6 / Math.max(sp, 1e-6);
      const kl = 1 - Math.exp(-dt / 3);
      sh.lead.x += (sh.vel.x * room - sh.lead.x) * kl;
      sh.lead.y += (sh.vel.y * room - sh.lead.y) * kl;
      // in flight, the path's end is carried along with the subject
      const e = sh.flight ? ease(sh.t / sh.flight) : 1;
      const p = sh.path.at(e);
      base = { x: p.x + (ux + sh.lead.x - sh.target.x) * e, y: p.y + (uy + sh.lead.y - sh.target.y) * e, w: p.w * lerp(1, sh.wide, e) };
    } else {
      base = sh.flight ? sh.path.at(ease(sh.t / sh.flight)) : { ...sh.target };
    }
    // the hold's drift fades in as the flight settles
    const ramp = smooth(sh.flight - 2, sh.flight + 5, sh.t);
    const w = base.w * sh.wMul;
    sh.off.x += sh.dx * w * ramp * dt;
    sh.off.y += sh.dy * w * ramp * dt;
    sh.wMul *= Math.exp(sh.zr * ramp * dt);
    if (base.w * sh.wMul > wMax || base.w * sh.wMul < wMin) sh.zr = -sh.zr * 0.5;
    return { x: base.x + sh.off.x, y: base.y + sh.off.y, w: clamp(base.w * sh.wMul, wMin, wMax) };
  }

  // A scene arriving: which species are in view, most numerous first.
  look(sh) {
    this.looked = sh.id;
    const w = sh.target.w * sh.wMul;
    this.io.pick([sh.target.x, sh.target.y], Math.min(w / 2, 20), { maxOut: 8192, raw: true }).then((res) => {
      if (!res || !res.raw || this.shot !== sh) return;
      const { u32, count } = res.raw;
      const n = new Map();
      for (let i = 0; i < count; i++) { const k = u32[i * PICK_WORDS + 4]; if (k >= FIRST_LIFE) n.set(k, (n.get(k) || 0) + 1); }
      sh.why.species = [...n].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([slot, cells]) => ({ slot, serial: this.serialOf(slot), cells }));
      sh.whyVer++;
    });
  }

  // Choose the next shot. A follow or a spotlight waits on a pick; the current shot holds meanwhile.
  plan() {
    const gen = this.gen;
    const r = this.rng;
    const now = this.io.now();
    this.spotlights = this.spotlights.filter((s) => now - s.t < 150);
    const sinceWide = this.history.length - 1 - this.history.lastIndexOf('wide');
    const last = this.history[this.history.length - 1];
    let type;
    const spot = this.spotlights.find((s) => { const sp = this.io.species(s.slot); return sp && sp.serial === s.serial && sp.pop > 0; });
    if (this.shot.type === 'settle' && r() < 0.5) type = 'wide';
    else if (spot && last !== 'spotlight') type = 'spotlight';
    else if (sinceWide >= 3 + (r() < 0.5 ? 1 : 0) && last !== 'wide') type = 'wide';
    else {
      const u = r();
      type = u < 0.45 ? 'follow' : u < 0.88 ? 'scene' : 'wide';
      if (type === last && type !== 'follow' && r() < 0.7) type = type === 'scene' ? 'follow' : 'scene';
    }
    const begin = (shot) => {
      if (gen !== this.gen || !this.active) return;
      this.planning = null;
      this.shot = shot;
      this.trackId = shot.subject ? shot.subject.id : NONE;
      this.history.push(type);
      if (this.history.length > 12) this.history.shift();
      this.visited.push({ x: shot.target.x, y: shot.target.y, t: this.io.now() });
      if (this.visited.length > 24) this.visited.shift();
    };
    const fallback = () => { if (gen === this.gen) { type = 'scene'; begin(this.scene()); } };
    if (type === 'wide') { begin(this.wide()); return; }
    if (type === 'scene') { begin(this.scene()); return; }
    if (type === 'spotlight') {
      this.spotlights = this.spotlights.filter((s) => s !== spot);
      this.planning = this.spotlightShot(spot).then((sh) => (sh ? begin(sh) : fallback()), fallback);
      return;
    }
    this.planning = this.followShot().then((sh) => (sh ? begin(sh) : fallback()), fallback);
  }

  // A hotspot: high interest, away from where the camera has lately been.
  hotspot() {
    const I = this.interest;
    const [W, H] = this.io.world();
    if (!I.n) return { x: this.rng() * W, y: this.rng() * H, tile: 8, reasons: [], div: 0 };
    const parts = I.parts(), sc = I.scores(parts);
    const now = this.io.now(), R = I.tile * 2.5;
    let total = 0;
    const wts = new Float32Array(sc.length);
    for (let i = 0; i < sc.length; i++) {
      if (sc[i] <= 0) continue;
      const [x, y] = I.center(i);
      let pen = 1;
      for (const v of this.visited) {
        const d2 = wrapD(x - v.x, W) ** 2 + wrapD(y - v.y, H) ** 2;
        pen *= 1 - 0.85 * Math.exp(-(now - v.t) / 150) * Math.exp(-d2 / (2 * R * R));
      }
      wts[i] = sc[i] ** 4 * pen * (0.7 + 0.6 * this.rng());
      total += wts[i];
    }
    let u = this.rng() * total, pick = 0;
    for (let i = 0; i < wts.length; i++) { u -= wts[i]; if (u <= 0) { pick = i; break; } }
    const [x, y] = I.center(pick);
    return { x: x + (this.rng() - 0.5) * I.tile * 0.6, y: y + (this.rng() - 0.5) * I.tile * 0.6, tile: I.tile, ...I.reasons(pick, parts) };
  }

  wide() {
    const [, wMax] = this.io.widths();
    const h = this.hotspot();
    const r = this.rng;
    return this.makeShot('wide', { x: h.x, y: h.y, w: wMax * lerp(0.7, 1, r()) }, { hold: lerp(22, 34, r()), drift: lerp(0.006, 0.012, r()), zr: r() < 0.6 ? -0.006 : 0.004 });
  }

  scene() {
    const [wMin, wMax] = this.io.widths();
    const h = this.hotspot();
    const r = this.rng;
    const w = clamp(lerp(10, 30, r() ** 1.5), wMin * 4, wMax * 0.6);
    return this.makeShot('scene', { x: h.x, y: h.y, w }, { hold: lerp(20, 36, r()), drift: lerp(0.006, 0.014, r()), zr: r() < 0.65 ? -lerp(0.006, 0.014, r()) : lerp(0.004, 0.009, r()),
      why: { kind: 'scene', reasons: h.reasons, div: h.div } });
  }

  // Follow a living cell near a hotspot: a body or a swimmer if there is one.
  async followShot() {
    const h = this.hotspot();
    const res = await this.io.pick([h.x, h.y], Math.max(4, h.tile * 0.9), { maxOut: 8192, raw: true });
    if (!res || !res.raw || !res.raw.count) return null;
    const { u32, f32, count } = res.raw;
    let best = -1, bs = 0;
    for (let i = 0; i < count; i++) {
      const o = i * PICK_WORDS;
      if (u32[o + 4] < FIRST_LIFE) continue;
      const bonded = u32[o + 10] !== NONE || u32[o + 11] !== NONE;
      // young cells, so the take outlasts the flight there
      const young = clamp(1 - f32[o + 6] / (this.io.lifespan(u32[o + 4]) || 100), 0.05, 1);
      const s = (bonded ? 2.5 : 1) * young * (0.25 + Math.min(1.5, Math.hypot(f32[o + 2], f32[o + 3]))) * (0.4 + this.rng());
      if (s > bs) { bs = s; best = i; }
    }
    if (best < 0) return null;
    return this.subjectShot(res, best, u32[best * PICK_WORDS + 10] !== NONE ? [5, 12] : [3, 7], { reasons: h.reasons });
  }

  // Visit a newly established species: a cell where its members are densest.
  async spotlightShot(spot) {
    const sp = this.io.species(spot.slot);
    if (!sp) return null;
    const [W, H] = this.io.world();
    const res = await this.io.pick([W / 2, H / 2], Math.hypot(W, H), { kind: spot.slot, maxOut: Math.min(131072, sp.pop * 1.25 + 2048), raw: true });
    if (!res || !res.raw || !res.raw.count) return null;
    const { f32, count } = res.raw;
    const step = Math.max(1, Math.floor(count / 200));
    let best = 0, bn = -1;
    for (let i = 0; i < count; i += step) {
      let c = 0;
      for (let j = 0; j < count; j += step) {
        if (Math.hypot(wrapD(f32[j * PICK_WORDS] - f32[i * PICK_WORDS], W), wrapD(f32[j * PICK_WORDS + 1] - f32[i * PICK_WORDS + 1], H)) < 2.5) c++;
      }
      if (c > bn) { bn = c; best = i; }
    }
    // in that patch, a young cell (a bonded one if the species forms bodies)
    const cx = f32[best * PICK_WORDS], cy = f32[best * PICK_WORDS + 1];
    const { u32 } = res.raw;
    let pick = best, ps = -Infinity;
    for (let i = 0; i < count; i++) {
      const o = i * PICK_WORDS;
      if (Math.hypot(wrapD(f32[o] - cx, W), wrapD(f32[o + 1] - cy, H)) > 2.5) continue;
      const bonded = u32[o + 10] !== NONE || u32[o + 11] !== NONE;
      const s = (bonded ? 1 : 0) - f32[o + 6] / (this.io.lifespan(u32[o + 4]) || 100);
      if (s > ps) { ps = s; pick = i; }
    }
    return this.subjectShot(res, pick, [4, 9], { spotlight: spot.serial, reasons: [] });
  }

  subjectShot(res, i, [w0, w1], why) {
    const { u32, f32, count } = res.raw;
    const o = i * PICK_WORDS;
    const p = { x: f32[o], y: f32[o + 1], vx: f32[o + 2], vy: f32[o + 3], kind: u32[o + 4], energy: f32[o + 5], age: f32[o + 6], id: u32[o + 7] };
    // the body it belongs to, as far as the pick reached
    const tb = u32[o + 10] !== NONE || u32[o + 11] !== NONE ? traceBody(u32, f32, count, p.id) : null;
    const r = this.rng;
    return this.makeShot('follow', { x: p.x, y: p.y, w: lerp(w0, w1, r()) }, {
      hold: lerp(28, 55, r()), drift: 0, zr: r() < 0.5 ? -0.004 : 0.003,
      subject: { id: p.id, p, t: res.simTime },
      why: { kind: 'follow', slot: p.kind, serial: this.serialOf(p.kind), cells: tb ? tb.body.length : 1, ...why },
    });
  }
}
