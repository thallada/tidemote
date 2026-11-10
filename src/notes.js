// Live annotations (docs/annotations.md): what is happening in view, told as it happens, in the instrument's own
// marks (src/noteview.js draws them). Two things come back from the GPU every few frames (Engine.onNotes):
// the view (every living cell and husk in the stretch of world annotated: its place, motion, kind, state, how far
// its water lies from its optimum, its bonded partners) and the ring of events the steps wrote there as they
// happened (who killed, bit, bore or scavenged whom, who starved, scalded, froze, dried, encysted or woke). So every
// mark stands on what the world did, by ID: nothing is guessed from what disappeared between looks. Pure: the page
// hands in the readbacks and what it knows of each species, and gets back the notes to draw.
import { NOTE_EV, NOTE_MAX, NOTE_W, NOTE_LITTER, NOTE_HEAD, NOTE_REC, NOTE_TG, NOTE_TEMPS, NOTE_STONE, FIRST_LIFE, CYST } from './shaders.js';

const HUSK = 2; // a husk's kind (the dead, rotting back to silt)

const NONE = 0xffffffff;
export const EV = Object.fromEntries(NOTE_EV.map((n, i) => [n, i]).filter(([n]) => n));

// how a note is chosen and kept (real seconds: the viewer reads at the same pace whatever the world's speed)
export const TUNE = {
  maxOn: 2,        // notes on screen at once (a phone, or a wide view: 1): told one after another rather than together
  maxOnPhone: 1,
  close: 50,       // CSS px a world unit from which cells are big enough to point at one by one
  wide: 18,        // and below which a view is wide: only the water's own stories (heat, cold, drought)
  detectEvery: 0.35, // real seconds between looks for stories
  gap: 6,          // between one note's arrival and the next
  dwell: 6,        // a note stays at least this long
  life: 16,        // and at most this long (a single moment: lifeOne)
  lifeOne: 9,
  exit: 0.6,       // its fade out
  typeCool: 18,    // before another note of the same type
  keyCool: 60,     // before the same story again
  fast: 4,         // past this speed, single moments are too quick to follow: only what holds for a while
  window: 30,      // sim seconds counted for "in the last 30 s"
  hold: 0.7,       // and until its story has held this long (a single moment: is still in view, well inside it)
  grace: 0.6,      // a note whose cell has left the view (or whose label has no room) goes after this long
  minLife: 3,      // a note, once shown, stays at least this long, whatever becomes of what it marks (but for the
                   // camera setting off: then it fades out slowly)
  subjectCool: 60, // the same kind of story about the same species not again within this long (another cell of it)
  dwellLong: 12,   // a story with much to read (a community) is held at least this long
  ahead: 5,        // a new note waits for a shot with this long still to run (a single moment: aheadOne)
  aheadOne: 5,
  variety: 120,    // a kind of story shown in the last this many seconds counts against another of its kind
  body: 6,         // cells bonded into one organism worth telling
  swim: 0.5,       // body lengths a second from which a body is told swimming
  current: 0.05,   // world units a second from which the water's current is told
  sprint: 0.25,    // world units a second (about 15 µm/s) from which the fastest in view is told
  stepped: true,   // a look at the view a step a frame
};

// half float to float
function half(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

/**
 * Cell ids to their rows in a view: an open-addressed table in typed arrays (no object for each, so reading ten views a
 * second makes nothing for the collector). get(id) -> row, or undefined.
 */
export class IdIndex {
  constructor() { this.cap = 0; }
  reset(n) {
    let cap = 16;
    while (cap < 2 * n) cap *= 2;
    if (cap > this.cap) { this.cap = cap; this.keys = new Uint32Array(cap); this.rows = new Int32Array(cap); }
    this.mask = cap - 1;
    this.rows.fill(-1, 0, this.cap);
    return this;
  }
  set(id, row) {
    let h = Math.imul(id, 2654435761) >>> 0 & this.mask;
    while (this.rows[h] >= 0 && this.keys[h] !== id) h = (h + 1) & this.mask;
    this.keys[h] = id; this.rows[h] = row;
  }
  get(id) {
    let h = Math.imul(id, 2654435761) >>> 0 & this.mask;
    while (this.rows[h] >= 0) { if (this.keys[h] === id) return this.rows[h]; h = (h + 1) & this.mask; }
    return undefined;
  }
}

// the views' columns, three sets taken in turn and grown only when a view outgrows them (a look at the view may still be
// reading the one before last while the next arrives)
const POOL = [{}, {}, {}];
let poolAt = 0;
const COLS = [['id', Uint32Array], ['x', Float32Array], ['y', Float32Array], ['vx', Float32Array], ['vy', Float32Array], ['kind', Uint16Array],
  ['cause', Uint8Array], ['role', Uint8Array], ['img', Uint16Array], ['litter', Uint8Array], ['torpid', Uint8Array], ['fed', Float32Array],
  ['tx', Float32Array], ['p1', Uint32Array], ['p2', Uint32Array], ['dry', Uint8Array]];

/**
 * The view's cells from a scan (Engine.onNotes), as columns, with an id -> row index; and its water, square by square
 * (grid: the squares' corner and side, fixed in the world; inView: those that overlap the stretch scanned).
 */
export function readView(scan, world) {
  const { n, u32, f32, rect } = scan;
  const [W, H] = world, G = NOTE_TG * NOTE_TG;
  const grid = scan.grid && scan.grid[2] > 0 ? scan.grid : [rect[0], rect[1], Math.max(rect[2], rect[3]) / NOTE_TG];
  const P = POOL[poolAt++ % POOL.length];
  if (!(P.cap >= n)) { P.cap = Math.max(n, Math.ceil((P.cap || 0) * 1.5), 1024); for (const [k, T] of COLS) P[k] = new T(P.cap); P.at = new IdIndex(); }
  const v = {
    n, simTime: scan.simTime, rect, grid, keep: scan.keep, inView: scan.inView, at: P.at.reset(n),
    temps: new Float32Array(G), ice: new Float32Array(G), sqIn: new Uint8Array(G), stone: new Float32Array(G),
    // (sqOnce: the squares that are not the wrap's repeat of another, in view or not: the water's fields are known
    // across the whole grid, past the view's edge)
    sqOnce: new Uint8Array(G),
  };
  for (const [k] of COLS) v[k] = P[k].subarray(0, n);
  const s = grid[2], cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
  for (let k = 0; k < G; k++) {
    v.temps[k] = f32[NOTE_TEMPS + k]; v.ice[k] = f32[NOTE_TEMPS + G + k]; v.stone[k] = u32[NOTE_STONE + k];
    // (the grid and the view are on the same side of the world's wrap, both about the camera: a square counts where it
    // lies, never again as the wrap's repeat of itself when the grid is wider than the world)
    const dx = grid[0] + ((k % NOTE_TG) + 0.5) * s - cx, dy = grid[1] + (Math.floor(k / NOTE_TG) + 0.5) * s - cy;
    v.sqIn[k] = Math.abs(dx) < Math.min((rect[2] + s) / 2, W / 2) && Math.abs(dy) < Math.min((rect[3] + s) / 2, H / 2) ? 1 : 0;
    v.sqOnce[k] = Math.abs(dx) < W / 2 && Math.abs(dy) < H / 2 ? 1 : 0;
  }
  for (let i = 0; i < n; i++) {
    const o = NOTE_HEAD + i * NOTE_REC, w = u32[o + 3];
    v.id[i] = u32[o]; v.x[i] = f32[o + 1]; v.y[i] = f32[o + 2];
    v.kind[i] = w & 1023; v.cause[i] = (w >>> 10) & 15; v.role[i] = (w >>> 14) & 3; v.img[i] = (w >>> 16) & 1023;
    v.litter[i] = (w >>> 26) & 1; v.torpid[i] = (w >>> 27) & 1; v.dry[i] = (w >>> 28) & 1;
    v.vx[i] = half(u32[o + 4] & 0xffff); v.vy[i] = half(u32[o + 4] >>> 16);
    v.fed[i] = half(u32[o + 5] & 0xffff); v.tx[i] = half(u32[o + 5] >>> 16);
    v.p1[i] = u32[o + 6]; v.p2[i] = u32[o + 7];
    v.at.set(v.id[i], i);
  }
  return v;
}

/** The square of the view's water (its index, or -1 outside the grid) that world point (x, y) lies in. */
export function squareOf(v, x, y, world) {
  // (the point taken where it lies nearest the view's middle, as the squares counted in view are: never in a repeat of
  // the world the grid also reaches when it is wider than the world)
  const [W, H] = world, [ox, oy, s] = v.grid, cx = v.rect[0] + v.rect[2] / 2, cy = v.rect[1] + v.rect[3] / 2;
  const i = Math.floor((cx + x - cx - W * Math.round((x - cx) / W) - ox) / s), j = Math.floor((cy + y - cy - H * Math.round((y - cy) / H) - oy) / s);
  return i >= 0 && j >= 0 && i < NOTE_TG && j < NOTE_TG ? j * NOTE_TG + i : -1;
}

/**
 * The ring's records written since `last` (its running count, wrapping), oldest first, each with the sim time it
 * happened (the scan's tick against its time at the steps' end). On the first read (last null) none: what lies in
 * the ring then may be from when the annotations last looked.
 */
export function readRing(ring, last, tick, stepTime) {
  const count = ring[0] >>> 0;
  if (last == null) return { count, events: [] };
  let n = (count - last) >>> 0;
  if (n > 0x7fffffff) n = 0; // (a new world's ledger: counted afresh)
  n = Math.min(n, NOTE_MAX);
  const events = [];
  const f = new Float32Array(ring.buffer, ring.byteOffset, ring.length);
  for (let k = 0; k < n; k++) {
    const r = (count - n + k) >>> 0, o = 4 + (r % NOTE_MAX) * NOTE_W, w = ring[o];
    const e = w & 31;
    if (!NOTE_EV[e]) continue;
    events.push({
      e, ev: NOTE_EV[e], kind: (w >>> 5) & 1023, akind: (w >>> 15) & 1023, litter: !!(w & NOTE_LITTER),
      id: ring[o + 1], aid: ring[o + 2], x: f[o + 3], y: f[o + 4], ax: f[o + 6], ay: f[o + 7],
      t: stepTime - ((tick - ring[o + 5]) >>> 0) / 60,
    });
  }
  return { count, events };
}

const isLiving = (k) => k >= FIRST_LIFE;
// the stories a wide view tells: the water's own, drawn on the view's squares of water
// (and the whole view's own: where the light falls, who holds the most of it, where two meet, where nothing lives, where
// most die)
const WATER_TYPES = new Set(['heat', 'cold', 'drying', 'current', 'clump', 'light', 'range', 'front', 'barren', 'deaths', 'stranded', 'frozen', 'shade', 'rain']);

/** Notes over the view: fed the GPU's readbacks, asked each frame which notes to draw. */
export class Notes {
  /**
   * species(slot) -> { name, guild ('producer' | 'grazer' | 'predator' | 'scavenger'), topt, tol, serial, col } | null
   * world() -> [W, H]
   */
  constructor({ species, world, tune = {} }) {
    this.species = species;
    this.world = world;
    this.T = { ...TUNE, ...tune };
    this.reset();
  }

  reset() {
    this.view = null;
    this.looking = null; // (a look in flight reads the view just dropped)
    this.ringLast = null;
    this.events = [];
    this.notes = [];
    this.seq = 0;
    this.fresh = false;
    this.lastArrive = -1e9;
    this.typeAt = new Map();
    this.keyAt = new Map();
    this.watched = new Map();
    this.firstSeen = new Map(); // story key -> when it was first found (a story must hold a moment before it is told)
    this.shownAt = []; // [type, when] of the notes shown lately (variety)
    this.history = []; // [type, seconds shown] of the notes that have ended
    this.spCache = new Map();
    this.cands = [];
    this.stats = null;
    this.detectAt = null;
    this.ms = { ingest: 0, detect: 0, draw: 0 };
    this.lost = 0; // events the ring overwrote before they were read
    this.biteKeep = 1; // the share of bites written (Engine.watchBites)
  }

  sp(slot) {
    const c = this.spCache.get(slot);
    if (c && c.until > this._now) return c.v;
    const v = isLiving(slot) ? this.species(slot) : null;
    this.spCache.set(slot, { v, until: this._now + 2 });
    return v;
  }

  /** A readback from Engine.onNotes. */
  ingest(scan) {
    const v = readView(scan, this.world());
    const r = readRing(scan.ring, this.ringLast, scan.tick, scan.stepTime ?? scan.simTime);
    const wrote = this.ringLast != null ? (r.count - this.ringLast) >>> 0 : 0;
    this.lost += Math.max(0, wrote - NOTE_MAX);
    this.ringLast = r.count;
    this.view = v;
    // each bite stands for those the steps were asked to leave out (biteKeep: the share written then)
    const w = 1 / (scan.biteKeep ?? this.biteKeep);
    for (const e of r.events) { if (e.ev === 'bite') e.w = w; this.events.push(e); }
    // a crowd at speed bites far more than the ring holds between reads: write a share of the bites, enough to count
    // them, keeping the ring at most half full
    // (and no more than about 150 bites a sim second kept in all: each counts for those left out, and every look at the
    // view goes over the last 30 s of them)
    let bites = 0;
    for (const e of r.events) if (e.ev === 'bite') bites++;
    // (a sim second's worth: the window is 30 sim seconds)
    const span = Math.max(1 / 60, v.simTime - (this._readAt ?? v.simTime - 0.1)), rate = bites / span;
    this._readAt = v.simTime;
    if (wrote > NOTE_MAX / 2 || rate > 200) this.biteKeep = Math.max(1 / 4096, this.biteKeep * (wrote > NOTE_MAX / 2 ? 0.5 : 0.8));
    else if (wrote < NOTE_MAX / 8 && rate < 100) this.biteKeep = Math.min(1, this.biteKeep * 1.25);
    const old = v.simTime - 120;
    let cut = 0;
    while (cut < this.events.length && (this.events[cut].t < old || this.events.length - cut > 20000)) cut++;
    if (cut) this.events.splice(0, cut);
    this.fresh = true;
  }

  /**
   * The events worth writing at this zoom (Engine.watchEv, a bit per NOTE_EV): a wide view tells only its water's
   * stories, and its countless bites and births would crowd the ring.
   */
  eventMask(ppu) {
    const wide = ppu < this.T.wide;
    // (coming in from a wide view, bites start as a small share and rise to what the ring holds)
    if (this._wide && !wide) this.biteKeep = 1 / 64;
    this._wide = wide;
    // (deaths too, which a wide view's killing grounds are told from; but none of its countless bites and births)
    const want = wide ? ['scalded', 'froze', 'dried', 'kill', 'grazed', 'starved', 'old', 'scavenge'] : NOTE_EV.filter(Boolean);
    return want.reduce((m, n) => m | (1 << EV[n]), 0) >>> 0;
  }

  /** Exact places of the cells the notes mark (Engine.onWatch), each frame. */
  watchSeen({ simTime, seen }) {
    for (const w of seen) this.watched.set(w.id, { x: w.x, y: w.y, vx: w.vx, vy: w.vy, t: simTime });
  }

  /** Where cell id was last seen: { x, y, vx, vy, t, kind, row } (row: its index in the view), or null. */
  cell(id) {
    const v = this.view;
    const i = v ? v.at.get(id) : undefined;
    const w = this.watched.get(id);
    if (i === undefined) return w && v && v.simTime - w.t < 1.5 ? { ...w, kind: -1, row: -1 } : null;
    const s = { x: v.x[i], y: v.y[i], vx: v.vx[i], vy: v.vy[i], t: v.simTime, kind: v.kind[i], row: i };
    if (w && w.t > s.t) Object.assign(s, { x: w.x, y: w.y, vx: w.vx, vy: w.vy, t: w.t });
    return s;
  }

  /** The cells to find on the GPU every frame (Engine.watch): the living the notes on screen mark. */
  wantWatch(max = 12) {
    const out = [];
    for (const n of this.notes) {
      for (const id of [...(n.track || []), ...(n.pins || [])]) {
        if (out.length >= max || out.some((c) => c.id === id)) continue;
        const c = this.cell(id);
        if (c && (c.kind === -1 || isLiving(c.kind))) out.push({ id, x: c.x, y: c.y, vx: c.vx, vy: c.vy, t: c.t });
      }
    }
    for (const id of this.watched.keys()) if (!out.some((c) => c.id === id)) this.watched.delete(id);
    return out;
  }

  /** Events of name ev (or a set of names) since sim time t0, optionally matching fn. */
  since(t0, ev, fn) {
    const out = [];
    for (let k = this.events.length - 1; k >= 0; k--) {
      const e = this.events[k];
      if (e.t < t0) break;
      if ((typeof ev === 'string' ? e.ev === ev : ev.has(e.ev)) && (!fn || fn(e))) out.push(e);
    }
    return out;
  }

  // What the view holds now, by species: how many, dormant, torpid, too warm (past 0.8 tolerances: scalding), their rows.
  _stats() {
    const v = this.view, by = new Map();
    let living = 0, torpid = 0;
    const husks = [];
    for (let i = 0; i < v.n; i++) {
      const k = v.kind[i];
      if (k === HUSK) husks.push(i);
      if (!isLiving(k)) continue;
      living++;
      let s = by.get(k);
      if (!s) by.set(k, (s = { kind: k, n: 0, cysts: 0, torpid: 0, hot: 0, rows: [], hotRows: [], cystRows: [], torpidRows: [] }));
      s.n++; s.rows.push(i);
      if (v.cause[i] === CYST) { s.cysts++; s.cystRows.push(i); }
      if (v.torpid[i]) { s.torpid++; torpid++; s.torpidRows.push(i); }
      if (v.tx[i] > 0.8 && v.cause[i] !== CYST) { s.hot++; s.hotRows.push(i); }
    }
    const scale = v.keep > 0 ? 1 / v.keep : 1;
    return { by, living, torpid, scale, husks };
  }

  // the water across the view: mean, warmest and coldest of its squares, the share iced
  _water() {
    const v = this.view;
    let s = 0, hi = -1e9, lo = 1e9, iced = 0, at = 0, n = 0;
    for (let k = 0; k < v.temps.length; k++) {
      if (!v.sqIn[k]) continue;
      const t = v.temps[k];
      n++; s += t; if (t > hi) { hi = t; at = k; } lo = Math.min(lo, t);
      if (v.ice[k] > 0.5) iced++;
    }
    return { mean: s / Math.max(1, n), hi, lo, hiAt: at, iced: iced / Math.max(1, n) };
  }

  /**
   * Each frame. ctx: { now (real seconds), speed (sim seconds a real second), ppu (CSS px a world unit), phone,
   * visible(x, y) whether a world point shows clear of the panels, inner(x, y) whether it lies well inside them,
   * still (seconds the camera has held still), leaving (the camera is setting off elsewhere), flow(x, y) the water's
   * current there (world units a second) }. Returns the notes to draw.
   */
  update(ctx) {
    this._now = ctx.now;
    ctx.inner ||= ctx.visible;
    ctx.ahead ??= Infinity;
    if (this.fresh && this.view) {
      this.fresh = false;
      this.stats = this._stats();
      this.water = this._water();
      if (!this.looking && ctx.now - (this.detectAt ?? -1e9) >= this.T.detectEvery) {
        this.detectAt = ctx.now;
        this.looking = this.detect(ctx);
        this._looked = {};
      }
    }
    // a look at the view goes a step a frame (each a few ms at most), so no one frame carries it all
    if (this.looking) {
      // (tests and tools may ask for a whole look at once: TUNE.stepped false)
      const t0 = performance.now();
      let r = this.looking.next();
      while (!this.T.stepped && !r.done) r = this.looking.next();
      const ms = performance.now() - t0;
      this.ms.detect += ms;
      this.worst('detect', ms, { ...this._looked });
      if (r.done) {
        this.looking = null;
        this.cands = r.value;
        const keys = new Set(this.cands.map((c) => c.key));
        for (const k of keys) if (!this.firstSeen.has(k)) this.firstSeen.set(k, ctx.now);
        for (const k of this.firstSeen.keys()) if (!keys.has(k)) this.firstSeen.delete(k);
        // (and the cool-downs that have run out: their keys name cells and moments, new ones all day)
        const cold = ctx.now - Math.max(this.T.keyCool, this.T.subjectCool);
        for (const [k, at] of this.keyAt) if (at < cold) this.keyAt.delete(k);
      }
    }
    this.schedule(ctx);
    return this.notes;
  }

  // ------------------------------------------------------------------ detectors
  // Each finds the stories the view holds now, as candidates: { type, key, prio, strength, one (a single moment),
  // track (living ids to find each frame), ...what the view draws }. A step at a time (yield): update() takes one a
  // frame, all on the view as it was when the look began.
  *detect(ctx) {
    const v = this.view, S = this.stats, out = [], t = v.simTime, W = this.T.window;
    const fast = ctx.speed > this.T.fast;
    const band = ctx.ppu >= this.T.close ? 'close' : ctx.ppu >= this.T.wide ? 'mid' : 'wide';
    const close = band === 'close';
    const seen = (id) => { const c = this.cell(id); return c && ctx.visible(c.x, c.y) ? c : null; };
    const name = (k) => this.sp(k)?.name;
    // the events of the last 30 s, tallied once: by what happened and to which species, and bites by pair
    // (by numbers, not strings: a busy view has tens of thousands of events in its window, looked at three times a second)
    const n30 = new Map(), n20 = new Map(), by = new Map(), kp = new Map(), evN = new Int32Array(32), recent = [], pairs = new Map();
    const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.t < t - W) break;
      const ek = e.e * 1024 + e.kind;
      bump(n30, ek);
      if (e.t >= t - 20) bump(n20, ek);
      if (e.ev === 'kill' || e.ev === 'scavenge') bump(by, e.e * 1024 + e.akind);
      if (e.ev === 'kill' && e.akind !== e.kind && isLiving(e.akind)) bump(kp, e.akind * 1024 + e.kind);
      evN[e.e]++;
      if (e.t >= t - 8) recent.push(e);
      if ((e.ev === 'bite' || e.ev === 'grazed') && band !== 'wide') {
        let ak = e.akind, aid = e.aid;
        if (aid === NONE) { const g = this._grazerOf(e); if (!g) continue; ak = g.kind; aid = g.id; }
        const key = ak * 1024 + e.kind;
        let p = pairs.get(key);
        if (!p) pairs.set(key, (p = { akind: ak, kind: e.kind, n: 0, dead: 0, last: null }));
        p.n += e.w ?? 1;
        if (e.ev === 'grazed') p.dead++;
        if (!p.last) p.last = { ...e, aid };
      }
    }
    // how many: of an event in the last 30 s (of species k, or any), in the last 20 s, done by species k
    const c30 = (ev, k) => (k === undefined ? evN[ev] : n30.get(ev * 1024 + k) || 0), c20 = (ev, k) => n20.get(ev * 1024 + k) || 0;
    const cby = (ev, k) => by.get(ev * 1024 + k) || 0;
    yield;

    if (band !== 'wide') {
      // A kill: the hunter, its quarry's remains, and how many kills its kind has made in view.
      if (close && !fast) for (const e of recent) {
        if (e.ev !== 'kill' || e.t < t - 6 || e.aid === NONE || !name(e.akind) || !name(e.kind)) continue;
        if (!seen(e.aid) || !seen(e.id)) continue;
        const kills = cby(EV.kill, e.akind);
        out.push({ type: 'hunt', key: `hunt:${e.aid}`, prio: 0.85, strength: kills, one: true, at: e.t,
          actor: e.aid, target: e.id, akind: e.akind, kind: e.kind, track: [e.aid], kills });
      }
      // Grazing: one species biting another, many times over (each bite from the ring; a coarse step's grazing names
      // no grazer, so up close its bites go to the nearest grazer in reach whose last meal was that species).
      for (const p of pairs.values()) {
        p.n = Math.round(p.n);
      if (p.n < 4 || !name(p.akind) || !name(p.kind)) continue;
        const g = S.by.get(p.akind);
        if (!g || g.n < 2) continue;
        const pin = close && p.last && seen(p.last.aid) && seen(p.last.id);
        out.push({ type: 'graze', key: `graze:${p.akind}>${p.kind}`, prio: 0.55 + (p.dead ? 0.08 : 0), strength: p.n,
          akind: p.akind, kind: p.kind, bites: p.n, dead: p.dead, actor: pin ? p.last.aid : NONE, target: pin ? p.last.id : NONE,
          track: pin ? [p.last.aid] : [], census: p.akind });
      }
      // Scavengers on a carcass.
      if (close && !fast) for (const e of recent) {
        if (e.ev !== 'scavenge' || e.litter || e.t < t - 5 || e.aid === NONE || !name(e.akind)) continue;
        if (!seen(e.aid) || !ctx.visible(e.x, e.y)) continue;
        out.push({ type: 'scavenge', key: `scav:${e.aid}`, prio: 0.35, strength: 1, one: true, at: e.t, actor: e.aid, akind: e.akind,
          spot: [e.x, e.y], track: [e.aid], meals: cby(EV.scavenge, e.akind) });
      }
      // A new species: a mutant daughter budding from her mother, or life sparked from silt.
      for (const e of recent) {
        if ((e.ev !== 'birth' || e.akind === e.kind) && e.ev !== 'spark') continue;
        const c = seen(e.id);
        if (!c || !isLiving(c.kind === -1 ? e.kind : c.kind)) continue;
        const m = e.ev === 'birth' && e.aid !== NONE ? seen(e.aid) : null;
        out.push({ type: e.ev === 'spark' ? 'spark' : 'newsp', key: `new:${e.id}`, prio: e.ev === 'spark' ? 0.95 : 0.9, strength: 1, one: true,
          at: e.t, actor: m ? e.aid : NONE, target: e.id, kind: e.kind, akind: e.akind, track: m ? [e.id, e.aid] : [e.id] });
      }
      for (const s of S.by.values()) {
        if (!name(s.kind)) continue;
        // A bloom: one species dividing fast in view.
        const b = c20(EV.birth, s.kind);
        if (b >= 5 && s.n >= 6) out.push({ type: 'bloom', key: `bloom:${s.kind}`, prio: 0.42, strength: b, kind: s.kind, births: b, census: s.kind });
        // Dormancy and waking: a species curling up into cysts, or waking from them, many at once; starving.
        const c = c20(EV.cyst, s.kind), w = c20(EV.woke, s.kind), st = c20(EV.starved, s.kind);
        if (c >= 4) out.push({ type: 'dormant', key: `dorm:${s.kind}`, prio: 0.5, strength: c, kind: s.kind, count: c, census: s.kind });
        if (w >= 4) out.push({ type: 'waking', key: `wake:${s.kind}`, prio: 0.46, strength: w, kind: s.kind, count: w, census: s.kind });
        if (st >= 3) out.push({ type: 'starving', key: `starve:${s.kind}`, prio: 0.5, strength: st, kind: s.kind, count: st });
      }
    }
    yield;
    // Heat: a species whose water has warmed past what it bears (crowds warm their own water), scalding; beside it,
    // the most numerous species in the same water that bears it.
    for (const s of S.by.values()) {
      // (scalding: deaths seen, or a good share of its cells in water past what it bears)
      // (deaths seen with a fair share too warm, or most of it too warm: water merely warm for some is not a story)
      const scalds = c30(EV.scalded, s.kind);
      if (!((scalds >= 3 && s.hot >= 0.2 * s.n) || (s.hot >= 8 && s.hot >= 0.4 * s.n)) || !name(s.kind)) continue;
      const hot = this._hotCells(this.sp(s.kind), v);
      let fine = null;
      if (band !== 'wide') for (const o of S.by.values()) {
        if (o.kind === s.kind || o.n < 4 || o.hot > 0 || !name(o.kind)) continue;
        // in the same warm water: its cells in the squares too warm for the first
        let inHot = 0;
        for (const i of o.rows) if (hot.has(squareOf(v, v.x[i], v.y[i], this.world()))) inHot++;
        if (inHot >= 3 && (!fine || inHot > fine.n)) fine = { kind: o.kind, n: inHot };
      }
      out.push({ type: 'heat', key: `heat:${s.kind}`, prio: 0.6, strength: s.hot / s.n * 10 + 2 * scalds, kind: s.kind, hot: Math.round(s.hot * S.scale), scalds,
        squares: [...hot], fine, census: s.kind });
    }
    // (from afar, the water too warm is one story, for the species it scalds most: not one for each)
    if (band === 'wide') {
      const heat = out.filter((c) => c.type === 'heat').sort((a, b) => b.strength - a.strength);
      for (const c of heat.slice(1)) out.splice(out.indexOf(c), 1);
      if (heat[0]) { heat[0].key = 'heat:wide'; heat[0].others = heat.length - 1; }
    }
    // Cold: the view's water near freezing and its cells stilled (torpid), or frozen to death.
    const froze = c30(EV.froze);
    if ((S.living >= 8 && S.torpid >= 0.3 * S.living) || froze >= 3) {
      let most = null, warm = null; // the species most stilled, and the one that stays active
      for (const s of S.by.values()) {
        if (!name(s.kind)) continue;
        if (s.torpid && (!most || s.torpid > most.torpid)) most = s;
        if (s.n >= 4 && s.torpid === 0 && s.cysts < s.n / 2 && (!warm || s.n > warm.n)) warm = s;
      }
      out.push({ type: 'cold', key: 'cold', prio: 0.66, strength: S.torpid + froze, torpid: S.torpid, living: S.living,
        froze, species: [...S.by.values()].filter((s) => s.torpid > 0).length, kind: most ? most.kind : -1, warm: warm && band !== 'wide' ? warm.kind : -1 });
    }
    const dried = c30(EV.dried);
    if (dried >= 3) {
      let most = -1, mn = 0;
      for (const s of S.by.values()) { const d = c30(EV.dried, s.kind); if (d > mn) { mn = d; most = s.kind; } }
      out.push({ type: 'drying', key: 'drying', prio: 0.7, strength: dried, count: dried, kind: most });
    }

    yield;
    if (band !== 'wide') {
      // An organism: cells bonded into one body (each cell's bonded partners, from the view), its size, its shape, and
      // whether it swims (body lengths a second). The biggest is told as a body; the fastest, swimming.
      let big = null, fastest = null;
      const tb = performance.now(), bodies = this._bodies(v);
      this._part('bodies', tb);
      for (const b of bodies) {
        if (!name(b.kind) || !ctx.inner(b.ax, b.ay)) continue;
        if (b.n >= this.T.body && (!big || b.n > big.n)) big = b;
        if (b.n >= 3 && b.lengths >= this.T.swim && (!fastest || b.lengths > fastest.lengths)) fastest = b;
      }
      const bodyOf = (b, type, prio) => ({ type, key: `${type}:${b.key}`, prio, strength: type === 'swim' ? b.lengths * 4 : b.n, kind: b.kind,
        members: b.ids, cells: b.n, size: b.size, form: b.form, speed: b.speed, lengths: b.lengths, heading: b.heading, anchor: b.anchor, track: [b.anchor] });
      if (fastest) out.push(bodyOf(fastest, 'swim', 0.58));
      if (big && big !== fastest) out.push(bodyOf(big, 'body', 0.5));

      yield;
      // A hunter closing on its quarry: a hunter whose last meal was the species of the nearest cell ahead of it,
      // heading for it (up close, before the kill).
      if (close && !fast) {
        const ts = performance.now(), st = this._stalk(ctx, v);
        this._part('stalk', ts);
        if (st) out.push({ type: 'stalk', key: `stalk:${st.actor}`, prio: 0.7, strength: 1 / Math.max(st.dist, 0.05), ...st, track: [st.actor, st.target] });
      }

      yield;
      // The food web in view: who has eaten whom here in the last 30 s, by bites and kills.
      const edges = new Map();
      for (const p of pairs.values()) if (p.n >= 2 && name(p.akind) && name(p.kind)) edges.set(`${p.akind}>${p.kind}`, { from: p.kind, to: p.akind, bites: p.n, kills: 0 });
      for (const [k, c] of kp) {
        const a = Math.floor(k / 1024), b = k % 1024;
        if (!name(a) || !name(b)) continue;
        const e = edges.get(`${a}>${b}`) || { from: b, to: a, bites: 0, kills: 0 };
        e.kills = c; edges.set(`${a}>${b}`, e);
      }
      const nodes = new Set();
      for (const e of edges.values()) { nodes.add(e.from); nodes.add(e.to); }
      if (edges.size >= 3 && nodes.size >= 3 && !ctx.phone) {
        const list = [...edges.values()].sort((a, b) => b.bites + 4 * b.kills - a.bites - 4 * a.kills).slice(0, 8);
        const ks = new Set(list.flatMap((e) => [e.from, e.to]));
        out.push({ type: 'web', key: 'web', prio: 0.52, strength: list.length, edges: list,
          nodes: [...ks].map((k) => ({ kind: k, n: Math.round((S.by.get(k)?.n || 0) * S.scale) })) });
      }

      // A species' balance: born against died, by cause, in view over the last 30 s (the busiest one).
      const CAUSES = ['kill', 'grazed', 'starved', 'old', 'scalded', 'froze', 'dried'];
      let bal = null;
      for (const s of S.by.values()) {
        if (s.n < 6 || !name(s.kind)) continue;
        const born = c30(EV.birth, s.kind), died = Object.fromEntries(CAUSES.map((c) => [c, c30(EV[c], s.kind)]));
        const dead = CAUSES.reduce((a, c) => a + died[c], 0);
        if (born + dead >= 12 && (!bal || born + dead > bal.born + bal.dead)) bal = { kind: s.kind, born, dead, died };
      }
      if (bal) out.push({ type: 'balance', key: `bal:${bal.kind}`, prio: 0.44, strength: bal.born + bal.dead, ...bal, census: bal.kind });

      // Sister species: several of one genus side by side, descendants of one founder.
      const genera = new Map();
      for (const s of S.by.values()) {
        const g = this.sp(s.kind);
        if (!g || g.genus == null || s.n < 2) continue;
        let a = genera.get(g.genus);
        if (!a) genera.set(g.genus, (a = []));
        a.push(s.kind);
      }
      let gen = null;
      for (const [g, ks] of genera) if (ks.length >= 3 && (!gen || ks.length > gen.kinds.length)) gen = { genus: g, kinds: ks };
      if (gen) {
        gen.kinds.sort((a, b) => S.by.get(b).n - S.by.get(a).n);
        out.push({ type: 'genus', key: `genus:${gen.genus}`, prio: 0.4, strength: gen.kinds.length, genus: gen.genus,
          kinds: gen.kinds.slice(0, 4), species: gen.kinds.length, genusName: this.sp(gen.kinds[0]).genusName });
      }

      // Old age: a cohort dying of its years.
      for (const s of S.by.values()) {
        const o = c20(EV.old, s.kind);
        if (o >= 3 && name(s.kind)) out.push({ type: 'old', key: `old:${s.kind}`, prio: 0.38, strength: o, kind: s.kind, count: o });
      }
    }
    yield;
    // A community: a dense clump where several species live together; what it holds and why it holds together.
    const tc = performance.now(), cl = this._clump(ctx, band, v, S);
    this._part('clump', tc);
    if (cl) out.push({ ...cl, type: 'clump', key: `clump:${cl.key}`, prio: 0.6, strength: cl.species * 2 + Math.log1p(cl.cells), track: [cl.anchor], lock: true });

    yield;
    // Scavengers: a species eating the dead, many meals over (the husks it ate, from the ring).
    if (band !== 'wide') {
      let sc = null;
      for (const s of S.by.values()) {
        const m = cby(EV.scavenge, s.kind);
        if (m >= 4 && name(s.kind) && s.n >= 2 && (!sc || m > sc.meals)) sc = { kind: s.kind, meals: m };
      }
      if (sc) out.push({ type: 'scavenging', key: `scavs:${sc.kind}`, prio: 0.5, strength: sc.meals, kind: sc.kind, akind: sc.kind, meals: sc.meals, census: sc.kind });
      // The fastest in view: a cell (or a body's) moving far faster than the rest, and how much.
      const sp = [];
      for (let i = 0; i < v.n; i++) if (isLiving(v.kind[i]) && v.cause[i] !== CYST) sp.push(Math.hypot(v.vx[i], v.vy[i]));
      if (sp.length >= 20) {
        const med = sp.sort((a, b) => a - b)[sp.length >> 1];
        let best = -1, bs = 0;
        for (let i = 0; i < v.n; i++) {
          if (!isLiving(v.kind[i]) || v.cause[i] === CYST) continue;
          const q = Math.hypot(v.vx[i], v.vy[i]);
          if (q > bs && ctx.inner(v.x[i], v.y[i]) && name(v.kind[i])) { bs = q; best = i; }
        }
        if (best >= 0 && bs >= Math.max(4 * med, this.T.sprint)) out.push({ type: 'sprint', key: `sprint:${v.id[best]}`, prio: 0.5, strength: bs / Math.max(med, 1e-3),
          actor: v.id[best], akind: v.kind[best], kind: v.kind[best], speed: bs, times: bs / Math.max(med, 1e-3), heading: Math.atan2(v.vy[best], v.vx[best]), track: [v.id[best]] });
      }
      // A beating body: an organism of a species whose cells beat, a wave running down it (its genome's beat).
      let bt = null;
      for (const b of this._bodies(v)) {
        const g = this.sp(b.kind);
        if (!g || !(g.beat > 0) || b.n < 3 || !ctx.inner(b.ax, b.ay)) continue;
        if (!bt || b.n > bt.n) bt = b;
      }
      if (bt) {
        const g = this.sp(bt.kind);
        out.push({ type: 'beat', key: `beat:${bt.key}`, prio: 0.52, strength: bt.n, kind: bt.kind, members: bt.ids, cells: bt.n, size: bt.size, form: bt.form,
          speed: bt.speed, lengths: bt.lengths, heading: bt.heading, anchor: bt.anchor, track: [bt.anchor], beat: g.beat, hz: g.beatHz, tail: g.tail });
      }
    }

    yield;
    // The water's own, in every view, from its squares: the light, the stone, who lives where.
    const G = NOTE_TG * NOTE_TG, inSq = [];
    for (let k = 0; k < G; k++) if (v.sqIn[k]) inSq.push(k);
    const [Ww, Hw] = this.world(), [gx, gy, gs] = v.grid, sqMid = (k) => [gx + ((k % NOTE_TG) + 0.5) * gs, gy + (Math.floor(k / NOTE_TG) + 0.5) * gs];
    // the living by square, all and by species (rows looked at once)
    const sqN = new Float32Array(G), sqOf = new Int16Array(v.n).fill(-1);
    for (let i = 0; i < v.n; i++) {
      if (!isLiving(v.kind[i])) continue;
      const k = squareOf(v, v.x[i], v.y[i], [Ww, Hw]);
      if (k < 0 || !v.sqIn[k]) continue;
      sqOf[i] = k; sqN[k]++;
    }
    if (inSq.length >= 12 && S.living >= 40) {
      // The light: where it falls brightest in view, and whether the producers are there (basking) or heading there.
      if (ctx.light) {
        const L = new Float32Array(G);
        let lo = Infinity, hi = -Infinity, mean = 0;
        // (every square's light, for its shape past the view's edge; the view's own for the story)
        for (let k = 0; k < G; k++) if (v.sqOnce[k]) { const [x, y] = sqMid(k); L[k] = ctx.light(x, y); }
        for (const k of inSq) { lo = Math.min(lo, L[k]); hi = Math.max(hi, L[k]); mean += L[k] / inSq.length; }
        if (hi - lo >= 0.15 && hi >= 1.25 * mean) {
          const bright = mean + 0.5 * (hi - mean), sqs = inSq.filter((k) => L[k] >= bright);
          let prodIn = 0, prod = 0, toward = 0, moving = 0;
          for (let i = 0; i < v.n; i++) {
            const k = sqOf[i];
            if (k < 0 || this.sp(v.kind[i])?.guild !== 'producer') continue;
            prod++;
            if (L[k] >= bright) prodIn++;
            // heading up the light's slope (from the squares beside it)
            const a = k % NOTE_TG, b = Math.floor(k / NOTE_TG), at = (aa, bb) => (aa >= 0 && bb >= 0 && aa < NOTE_TG && bb < NOTE_TG && v.sqIn[bb * NOTE_TG + aa] ? L[bb * NOTE_TG + aa] : L[k]);
            const gxl = at(a + 1, b) - at(a - 1, b), gyl = at(a, b + 1) - at(a, b - 1), sp2 = Math.hypot(v.vx[i], v.vy[i]), gl = Math.hypot(gxl, gyl);
            if (sp2 > 0.01 && gl > 0.02 && L[k] < bright) { moving++; if ((v.vx[i] * gxl + v.vy[i] * gyl) / (sp2 * gl) > 0.5) toward++; }
          }
          const share = prod ? prodIn / prod : 0, areaShare = sqs.length / inSq.length;
          if (prod >= 20 && (share >= areaShare * 1.5 || (moving >= 10 && toward >= 0.5 * moving))) out.push({ type: 'light', key: 'light', prio: 0.5,
            strength: share / Math.max(areaShare, 0.05), light: Array.from(L), level: bright, hi, mean, share, areaShare, seeking: moving >= 10 ? toward / moving : 0,
            producers: Math.round(prod * S.scale), grid: [...v.grid] });
        }
      }
      // Shelter: cells crowding among stone, where hunters miss more often.
      let stoneSq = 0, prey = 0, preyIn = 0, hunters = 0;
      const rocky = (k) => v.stone[k] >= 6;
      for (const k of inSq) if (rocky(k)) stoneSq++;
      if (stoneSq >= 2 && stoneSq <= 0.6 * inSq.length && band !== 'wide') {
        for (let i = 0; i < v.n; i++) {
          const k = sqOf[i];
          if (k < 0) continue;
          if (this.sp(v.kind[i])?.guild === 'predator') { hunters++; continue; }
          prey++;
          if (rocky(k)) preyIn++;
        }
        const dens = (preyIn / stoneSq) / Math.max(1e-3, (prey - preyIn) / Math.max(1, inSq.length - stoneSq));
        let killsIn = 0, kills = 0;
        for (let q = this.events.length - 1; q >= 0; q--) {
          const e = this.events[q];
          if (e.t < t - W) break;
          if (e.ev !== 'kill' && e.ev !== 'grazed') continue;
          const k = squareOf(v, e.x, e.y, [Ww, Hw]);
          if (k < 0 || !v.sqIn[k]) continue;
          kills++;
          if (rocky(k)) killsIn++;
        }
        if (preyIn >= 8 && dens >= 1.5 && (hunters >= 3 || kills >= 3)) out.push({ type: 'shelter', key: 'shelter', prio: 0.55, strength: dens,
          stone: Array.from(v.stone), grid: [...v.grid], cells: Math.round(preyIn * S.scale), dens, hunters: Math.round(hunters * S.scale), kills, killsIn,
          killShare: kills ? killsIn / kills : 0, areaShare: stoneSq / inSq.length });
      }
      // Who holds the view: a species with a quarter or more of the living, its range; two such, where they meet.
      const top = [...S.by.values()].filter((x) => name(x.kind)).sort((a, b) => b.n - a.n);
      const range = (k) => { const f = new Float32Array(G); for (const i of S.by.get(k).rows) if (sqOf[i] >= 0) f[sqOf[i]]++; return Array.from(f); };
      if (top[0] && top[0].n >= 0.25 * S.living) out.push({ type: 'range', key: `range:${top[0].kind}`, prio: 0.42, strength: top[0].n / S.living * 10, kind: top[0].kind,
        share: top[0].n / S.living, cells: Math.round(top[0].n * S.scale), field: range(top[0].kind), grid: [...v.grid] });
      if (top[1] && top[0].n >= 0.15 * S.living && top[1].n >= 0.15 * S.living) {
        const fa = range(top[0].kind), fb = range(top[1].kind);
        // squares where each holds the most, and the edges between them: a front
        let edges = 0;
        for (const k of inSq) {
          const a = fa[k] > fb[k] && fa[k] >= 3, i = k % NOTE_TG;
          if (!a) continue;
          for (const n2 of [k + 1, k - 1, k + NOTE_TG, k - NOTE_TG]) if (n2 >= 0 && n2 < G && v.sqIn[n2] && Math.abs((n2 % NOTE_TG) - i) <= 1 && fb[n2] > fa[n2] && fb[n2] >= 3) edges++;
        }
        if (edges >= 3) out.push({ type: 'front', key: `front:${top[0].kind}:${top[1].kind}`, prio: 0.48, strength: edges, kind: top[0].kind, akind: top[1].kind,
          a: { kind: top[0].kind, share: top[0].n / S.living, field: fa }, b: { kind: top[1].kind, share: top[1].n / S.living, field: fb }, edges, grid: [...v.grid] });
      }
      // Barren water: a good share of the view with no life, and what it lacks.
      // (a square nearly empty for the view: a tenth of its mean or less, the view's cells being a sample when it is wide)
      const meanN = inSq.reduce((a, k) => a + sqN[k], 0) / inSq.length, few = 0.1 * meanN;
      const empty = inSq.filter((k) => sqN[k] <= few);
      if (meanN >= 5 && empty.length >= 0.25 * inSq.length && empty.length >= 6) {
        const avg = (ks, f) => ks.reduce((a, k) => a + f(k), 0) / Math.max(1, ks.length), full = inSq.filter((k) => sqN[k] > few);
        const lightE = ctx.light ? avg(empty, (k) => ctx.light(...sqMid(k))) : 0, lightF = ctx.light ? avg(full, (k) => ctx.light(...sqMid(k))) : 0;
        const tE = avg(empty, (k) => v.temps[k]), tF = avg(full, (k) => v.temps[k]), iceE = avg(empty, (k) => v.ice[k]), stoneE = avg(empty, (k) => v.stone[k]);
        const why = iceE > 0.4 ? 'ice' : stoneE >= 6 ? 'stone' : lightE < 0.8 * lightF ? 'dark' : tE < tF - 3 ? 'cold' : tE > tF + 3 ? 'warm' : 'unsettled';
        out.push({ type: 'barren', key: 'barren', prio: 0.36, strength: empty.length / inSq.length * 10, share: empty.length / inSq.length, why,
          field: Array.from(sqN), level: Math.max(0.5, 1.5 * few), grid: [...v.grid], lightE, lightF, tE, tF });
      }
      // A killing ground: where most died here lately, and of what.
      const dead = new Float32Array(G), causes = {};
      let nd = 0;
      for (let q = this.events.length - 1; q >= 0; q--) {
        const e = this.events[q];
        if (e.t < t - W) break;
        if (e.ev !== 'kill' && e.ev !== 'grazed' && e.ev !== 'starved' && e.ev !== 'scalded' && e.ev !== 'froze' && e.ev !== 'old' && e.ev !== 'dried') continue;
        const k = squareOf(v, e.x, e.y, [Ww, Hw]);
        if (k < 0 || !v.sqIn[k]) continue;
        dead[k] += e.w ?? 1; nd++;
        causes[e.ev] = (causes[e.ev] || 0) + 1;
      }
      let peak = 0;
      for (const k of inSq) peak = Math.max(peak, dead[k]);
      // (most of them in a fifth of the view or less)
      const hot = inSq.filter((k) => dead[k] >= 0.35 * peak), inHot = hot.reduce((a, k) => a + dead[k], 0);
      if (nd >= 30 && hot.length <= 0.2 * inSq.length && inHot >= 0.5 * nd) out.push({ type: 'deaths', key: 'deaths', prio: 0.46, strength: inHot / 10,
        field: Array.from(dead), level: 0.35 * peak, grid: [...v.grid], died: Math.round(inHot), all: nd, causes });
    }

    yield;
    // The pool's catastrophes as they show in view: cells stranded on dry land, locked in ice, in the dark under
    // duckweed; a raindrop's fall.
    {
      // stranded: living cells on dry ground (the scan's flag), and those that dried to death
      let dryN = 0, dryCyst = 0, most = new Map();
      for (let i = 0; i < v.n; i++) if (v.dry[i] && isLiving(v.kind[i])) { dryN++; if (v.cause[i] === CYST) dryCyst++; most.set(v.kind[i], (most.get(v.kind[i]) || 0) + 1); }
      if (dryN >= 5) {
        const top = [...most].sort((a, b) => b[1] - a[1])[0];
        out.push({ type: 'stranded', key: 'stranded', prio: 0.82, strength: dryN, cells: Math.round(dryN * S.scale), cysts: Math.round(dryCyst * S.scale),
          dried: c30(EV.dried), kind: top ? top[0] : -1 });
      }
      // in the ice: torpid cells where the water has frozen
      let iced = 0, iceSq = 0, inSqN = 0;
      for (let k = 0; k < v.ice.length; k++) if (v.sqIn[k]) { inSqN++; if (v.ice[k] > 0.5) iceSq++; }
      if (iceSq >= 2) {
        const [Wi, Hi] = this.world();
        for (let i = 0; i < v.n; i++) {
          if (!isLiving(v.kind[i]) || !v.torpid[i]) continue;
          const k = squareOf(v, v.x[i], v.y[i], [Wi, Hi]);
          if (k >= 0 && v.ice[k] > 0.5) iced++;
        }
        if (iced >= 5) out.push({ type: 'frozen', key: 'frozen', prio: 0.8, strength: iced, cells: Math.round(iced * S.scale), froze: c30(EV.froze),
          share: iceSq / Math.max(1, inSqN) });
      }
      // under duckweed: producers in its shade (the page's duckShade), and how much less they have eaten of the light
      if (ctx.shade) {
        let under = 0, out2 = 0, fedU = 0, fedO = 0, deep = 0;
        for (let i = 0; i < v.n; i++) {
          if (!isLiving(v.kind[i]) || this.sp(v.kind[i])?.guild !== 'producer') continue;
          const sh = ctx.shade(v.x[i], v.y[i]);
          if (sh > 0.4) { under++; fedU += v.fed[i]; deep = Math.max(deep, sh); } else { out2++; fedO += v.fed[i]; }
        }
        if (under >= 8) out.push({ type: 'shade', key: 'shade', prio: 0.78, strength: under, cells: Math.round(under * S.scale), deep,
          fedU: fedU / under, fedO: out2 ? fedO / out2 : null, starved: c30(EV.starved) });
      }
      // a raindrop: one fallen in view in the last moment, its ring wave spreading
      if (ctx.drops) for (const dr of ctx.drops()) {
        if (!ctx.inner(dr.x, dr.y)) continue;
        out.push({ type: 'rain', key: `rain:${dr.t.toFixed(2)}`, prio: 0.72, strength: dr.s, one: true, x: dr.x, y: dr.y, at: dr.t, size: dr.s, drops: ctx.dropsIn30?.() ?? 1 });
        break;
      }
    }
    yield;
    // Decay: the dead rotting back to silt, which feeds what grows next.
    const rot = c30(EV.rot);
    if (rot >= 12 && S.husks.length >= 10) out.push({ type: 'rot', key: 'rot', prio: 0.32, strength: rot, count: rot, husks: Math.round(S.husks.length * S.scale), sparks: c30(EV.spark) });
    // The current: water moving through the whole view, carrying whatever does not swim against it.
    if (ctx.flow) {
      const r = v.rect;
      let fx = 0, fy = 0;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const f = ctx.flow(r[0] + (a + 0.5) * r[2] / 4, r[1] + (b + 0.5) * r[3] / 4); fx += f[0] / 16; fy += f[1] / 16; }
      const sp = Math.hypot(fx, fy);
      if (sp >= this.T.current) out.push({ type: 'current', key: 'current', prio: 0.3, strength: sp * 20, speed: sp, heading: Math.atan2(fy, fx) });
    }
    for (const c of out) c.band = band;
    return out;
  }

  // (the time a part of the looking took, for debug())
  _part(k, t0) { const d = (this.ms.detectParts ||= {}), ms = performance.now() - t0; d[k] = (d[k] || 0) + ms; (this._looked ||= {})[k] = +ms.toFixed(1); }
  /** the longest one call of a part took (ms), with what it was doing then, for debug(): a hitch is one long call */
  worst(k, ms, what) { const w = (this.ms.worst ||= {}); if (!w[k] || ms > w[k].ms) w[k] = { ms: +ms.toFixed(1), what, cells: this.view?.n, events: this.events.length }; }

  // The view's organisms: cells joined by their bonds (each cell's two bonded partners, of its own kind, as the view
  // read them), as { kind, ids, n, anchor (the member nearest its middle), its place (ax, ay), size (world units across),
  // form, speed (world units a second), lengths (body lengths a second), heading, key }, kept by key from look to look
  // (a body keeps its key while it keeps any of its cells). Once a look.
  _bodies(v = this.view) {
    if (this._bodyView === v) return this._bodyList;
    const [W, H] = this.world(), parent = new Int32Array(v.n).fill(-1);
    const find = (i) => { while (parent[i] >= 0 && parent[parent[i]] >= 0) i = parent[i] = parent[parent[i]]; return parent[i] >= 0 ? parent[i] : i; };
    for (let i = 0; i < v.n; i++) {
      if (!isLiving(v.kind[i])) continue;
      for (let q = 0; q < 2; q++) {
        const pid = q ? v.p2[i] : v.p1[i];
        if (pid === NONE) continue;
        const j = v.at.get(pid);
        if (j === undefined || v.kind[j] !== v.kind[i]) continue;
        const a = find(i), b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
    // (each group's size counted first, so only the groups of three or more are gathered)
    const root = new Int32Array(v.n), size = new Int32Array(v.n), groups = new Map();
    for (let i = 0; i < v.n; i++) { root[i] = -1; if (isLiving(v.kind[i]) && (v.p1[i] !== NONE || v.p2[i] !== NONE)) { root[i] = find(i); size[root[i]]++; } }
    for (let i = 0; i < v.n; i++) {
      const r = root[i];
      if (r < 0 || size[r] < 3) continue;
      let gr = groups.get(r);
      if (!gr) groups.set(r, (gr = []));
      gr.push(i);
    }
    // (which body each cell was in at the last look, to keep a body's key: one map of cells, not a body against each)
    const was = this._bodyCells || new Map(), keys = new Set(), cells = new Map(), list = [];
    for (const rows of groups.values()) {
      if (rows.length < 3) continue;
      // its middle, its motion and its spread (about its first cell, across the world's wrap)
      const x0 = v.x[rows[0]], y0 = v.y[rows[0]];
      let mx = 0, my = 0, vx = 0, vy = 0;
      const dx = rows.map((i) => { const d = v.x[i] - x0; return d - W * Math.round(d / W); }), dy = rows.map((i) => { const d = v.y[i] - y0; return d - H * Math.round(d / H); });
      for (let k = 0; k < rows.length; k++) { mx += dx[k]; my += dy[k]; vx += v.vx[rows[k]]; vy += v.vy[rows[k]]; }
      const n = rows.length;
      mx /= n; my /= n; vx /= n; vy /= n;
      let sxx = 0, syy = 0, sxy = 0, far = 0, anchor = rows[0], near = Infinity;
      for (let k = 0; k < n; k++) {
        const ex = dx[k] - mx, ey = dy[k] - my, d = ex * ex + ey * ey;
        sxx += ex * ex; syy += ey * ey; sxy += ex * ey;
        far = Math.max(far, d);
        if (d < near) { near = d; anchor = rows[k]; }
      }
      // its long and short axes (the spread's eigenvalues): a filament is long and thin
      const trace = (sxx + syy) / n, det = (sxx * syy - sxy * sxy) / (n * n), disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
      const l1 = trace / 2 + disc, l2 = Math.max(trace / 2 - disc, 1e-9), elong = Math.sqrt(l1 / l2);
      const size = 2 * Math.sqrt(far), speed = Math.hypot(vx, vy);
      const ids = rows.map((i) => v.id[i]);
      // its key: the one it had while it held any of these cells (the one it shared most with), else its first cell's
      const votes = new Map();
      let key = null, best = 0;
      for (const id of ids) { const k = was.get(id); if (k !== undefined) { const c = (votes.get(k) || 0) + 1; votes.set(k, c); if (c > best) { best = c; key = k; } } }
      if (key == null || keys.has(key)) { let lo = ids[0]; for (const id of ids) if (id < lo) lo = id; key = `${v.kind[rows[0]]}.${lo}`; }
      keys.add(key);
      for (const id of ids) cells.set(id, key);
      list.push({ kind: v.kind[rows[0]], ids, n, anchor: v.id[anchor], ax: v.x[anchor], ay: v.y[anchor], size, speed,
        lengths: speed / Math.max(size, 0.05), heading: Math.atan2(vy, vx), key,
        form: elong >= 3.5 ? 'filament' : n >= 20 && elong < 1.8 ? 'mat' : n >= 8 ? 'colony' : 'cluster' });
    }
    this._bodyCells = cells;
    this._bodyView = v;
    this._bodyList = list;
    return list;
  }

  // The view's biggest clump of several species: its living counted on a lattice fixed in the world (about 24 squares
  // across the view, a power of two units a side), squares much denser than the view's mean joined into clumps; the
  // biggest where three or more species each make a twentieth of it (and two and a half or more in effect), not over
  // half the view. With what it holds and why it may hold together (from what the view shows: its cells bonded into
  // bodies, grazers biting its producers there, hunters among them, births there, the current gathering water in, its
  // cells holding still). Kept by key from look to look while it keeps any of its squares.
  _clump(ctx, band, v = this.view, S = this.stats) {
    const [W, H] = this.world(), r = v.rect, cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
    const b = 2 ** Math.round(Math.log2(Math.max(r[2], r[3]) / 24));
    const bins = new Map(), near = (x, c, L) => c + (x - c) - L * Math.round((x - c) / L);
    let living = 0, speed = 0;
    for (let i = 0; i < v.n; i++) {
      if (!isLiving(v.kind[i])) continue;
      const x = near(v.x[i], cx, W), y = near(v.y[i], cy, H), key = (Math.floor(x / b) + 32768) * 65536 + (Math.floor(y / b) + 32768);
      let c = bins.get(key);
      if (!c) bins.set(key, (c = []));
      c.push(i);
      living++; speed += Math.hypot(v.vx[i], v.vy[i]);
    }
    if (!bins.size || living < 40) return null;
    // (dense: three times the view's mean a square, over all its squares, the empty too: a crowd, not just the water's
    // living part of it)
    const mean = living / Math.max(bins.size, (r[2] * r[3]) / (b * b) * 0.5), dense = new Set();
    for (const [key, c] of bins) if (c.length >= Math.max(8, 3 * mean)) dense.add(key);
    // the dense squares, joined to their neighbours (diagonals too)
    const seen = new Set(), clumps = [];
    for (const k0 of dense) {
      if (seen.has(k0)) continue;
      const comp = [], stack = [k0];
      seen.add(k0);
      while (stack.length) {
        const k = stack.pop(), i = Math.floor(k / 65536), j = k % 65536;
        comp.push(k);
        for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) { const n2 = (i + a) * 65536 + (j + c); if (dense.has(n2) && !seen.has(n2)) { seen.add(n2); stack.push(n2); } }
      }
      // (a clump: compact, filling most of the box about it, and no more than a fifth of the view)
      let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
      for (const k of comp) { const i = Math.floor(k / 65536), j = k % 65536; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
      const fill = comp.length / ((i1 - i0 + 1) * (j1 - j0 + 1));
      if (comp.length >= 4 && fill >= 0.55 && comp.length * b * b <= 0.2 * r[2] * r[3]) clumps.push(comp);
    }
    const prev = this._clumpKeys || new Map(), keys = new Map();
    let best = null;
    for (const comp of clumps) {
      const rows = comp.flatMap((k) => bins.get(k)), byKind = new Map();
      for (const i of rows) byKind.set(v.kind[i], (byKind.get(v.kind[i]) || 0) + 1);
      const shares = [...byKind].map(([k, c]) => ({ kind: k, share: c / rows.length })).sort((p, q) => q.share - p.share);
      const many = shares.filter((x) => x.share >= 0.05).length, eff = 1 / shares.reduce((a, x) => a + x.share * x.share, 0);
      if (many < 3 || eff < 2.5 || rows.length < 40) continue;
      // (and much denser than the water just about it: a ring of squares around it)
      const set2 = new Set(comp);
      let ring = 0, ringN = 0;
      for (const k of comp) {
        const i = Math.floor(k / 65536), j = k % 65536;
        for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
          const n2 = (i + a) * 65536 + (j + c);
          if (set2.has(n2)) continue;
          set2.add(n2); ringN++; ring += bins.get(n2)?.length || 0;
        }
      }
      if (rows.length / comp.length < 2.5 * (ring / Math.max(1, ringN))) continue;
      if (!best || rows.length > best.rows.length) best = { comp, rows, shares, eff, many };
    }
    // (keys kept by the squares they share)
    for (const comp of clumps) {
      let key = null, most = 0;
      for (const [k, set] of prev) { let c = 0; for (const q of comp) if (set.has(q)) c++; if (c > most) { most = c; key = k; } }
      if (key == null || keys.has(key)) key = `${b}.${comp[0]}`;
      keys.set(key, new Set(comp));
      if (best && comp === best.comp) best.key = key;
    }
    this._clumpKeys = keys;
    if (!best) return null;
    const { comp, rows, shares } = best, set = new Set(comp);
    // its middle, its size, the cell nearest its middle (the label hangs on it), how its cells move
    let mx = 0, my = 0, bonded = 0, cs = 0;
    for (const i of rows) { mx += near(v.x[i], cx, W); my += near(v.y[i], cy, H); if (v.p1[i] !== NONE || v.p2[i] !== NONE) bonded++; cs += Math.hypot(v.vx[i], v.vy[i]); }
    mx /= rows.length; my /= rows.length; cs /= rows.length;
    let anchor = rows[0], nd = Infinity, far = 0;
    for (const i of rows) {
      const d = Math.hypot(near(v.x[i], cx, W) - mx, near(v.y[i], cy, H) - my);
      if (d < nd && v.cause[i] !== CYST) { nd = d; anchor = i; }
      far = Math.max(far, d);
    }
    if (!ctx.inner(v.x[anchor], v.y[anchor])) return null;
    const guild = (k) => this.sp(k)?.guild, share = (gd) => shares.reduce((a, x) => a + (guild(x.kind) === gd ? x.share : 0), 0);
    // what happened in it in the last 30 s
    const inIt = (e) => set.has((Math.floor(near(e.x, cx, W) / b) + 32768) * 65536 + (Math.floor(near(e.y, cy, H) / b) + 32768));
    let bites = 0, births = 0;
    for (let k = this.events.length - 1; k >= 0; k--) {
      const e = this.events[k];
      if (e.t < v.simTime - this.T.window) break;
      if ((e.ev === 'bite' || e.ev === 'grazed') && inIt(e)) bites += e.w ?? 1;
      else if (e.ev === 'birth' && inIt(e)) births++;
    }
    // the current about it: how much of it flows in toward its middle (on a ring at its edge)
    let inflow = 0, flow = 0;
    if (ctx.flow) for (let q = 0; q < 8; q++) {
      const an = (q * Math.PI) / 4, R = Math.max(far, b), f = ctx.flow(mx + Math.cos(an) * R, my + Math.sin(an) * R);
      inflow -= (f[0] * Math.cos(an) + f[1] * Math.sin(an)) / 8; flow += Math.hypot(f[0], f[1]) / 8;
    }
    const why = [];
    if (bonded >= 0.4 * rows.length) why.push(['bodies', bonded / rows.length]);
    if (share('producer') >= 0.25 && share('grazer') >= 0.1 && bites >= 10) why.push(['grazing', Math.round(bites)]);
    if (share('predator') >= 0.05) why.push(['hunters', share('predator')]);
    if (births >= 10) why.push(['nursery', births]);
    if (inflow > 0.02 && inflow > 0.3 * flow) why.push(['current', inflow]);
    if (cs < 0.6 * (speed / living)) why.push(['still', cs]);
    return { key: best.key, cells: Math.round(rows.length * S.scale), species: new Set(rows.map((i) => v.kind[i])).size, many: best.many, shares: shares.slice(0, 5), why,
      size: 2 * far, b, bins: comp, anchor: v.id[anchor], band,
      // (its cells, for its outline: drawn once as found, riding with them)
      ids: rows.slice(0, 1500).map((i) => v.id[i]) };
  }

  // the nearest hunter closing on a cell of the species it last ate: within reach, moving toward it
  _stalk(ctx, v = this.view) {
    const [W, H] = this.world(), grid = new Map(), R = 1.5;
    // (only the kinds some hunter in view last ate are looked for: none, and there is nothing to do)
    const wanted = new Set();
    for (let i = 0; i < v.n; i++) { const img = v.img[i]; if (isLiving(v.kind[i]) && isLiving(img) && img !== v.kind[i] && this.sp(v.kind[i])?.guild === 'predator') wanted.add(img); }
    if (!wanted.size) return null;
    for (let i = 0; i < v.n; i++) {
      if (!wanted.has(v.kind[i]) || v.cause[i] === CYST) continue;
      const k = Math.floor(v.x[i] / R) * 65536 + Math.floor(v.y[i] / R);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(i);
    }
    let best = null;
    // (the hunters looked at: about 200 at most, taken evenly through the view; a near enough stalk ends the search)
    const hunters = [];
    for (let i = 0; i < v.n; i++) if (wanted.has(v.img[i]) && v.img[i] !== v.kind[i] && this.sp(v.kind[i])?.guild === 'predator') hunters.push(i);
    const step = Math.max(1, Math.ceil(hunters.length / 200));
    for (let h = 0; h < hunters.length && !(best && best.dist < 0.25); h += step) {
      const i = hunters[h], k = v.kind[i], img = v.img[i], sp = Math.hypot(v.vx[i], v.vy[i]);
      if (sp < 0.02 || !this.sp(img)) continue;
      if (!ctx.inner(v.x[i], v.y[i])) continue;
      const cx = Math.floor(v.x[i] / R), cy = Math.floor(v.y[i] / R);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const gx = (((cx + a) % Math.ceil(W / R)) + Math.ceil(W / R)) % Math.ceil(W / R), gy = (((cy + b) % Math.ceil(H / R)) + Math.ceil(H / R)) % Math.ceil(H / R);
        for (const j of grid.get(gx * 65536 + gy) || []) {
          if (v.kind[j] !== img) continue;
          let dx = v.x[j] - v.x[i], dy = v.y[j] - v.y[i];
          dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
          const d = Math.hypot(dx, dy);
          // heading for it: its motion within about 45° of the line to it
          if (d > R || d < 1e-4 || (v.vx[i] * dx + v.vy[i] * dy) / (sp * d) < 0.7) continue;
          if (!best || d < best.dist) best = { actor: v.id[i], target: v.id[j], akind: k, kind: img, dist: d, speed: sp };
        }
      }
    }
    return best;
  }

  // the squares of the view whose water lies past 0.8 of species g's tolerance above its optimum
  _hotCells(g, v) {
    const out = new Set();
    if (!g) return out;
    for (let k = 0; k < v.temps.length; k++) if (v.sqIn[k] && (v.temps[k] - g.topt) / Math.max(g.tol, 0.5) > 0.8) out.add(k);
    return out;
  }

  // a coarse step's bite names no grazer: the nearest living cell in reach whose last meal (its search image) was the
  // bitten one's species, found through a grid of the view's eaters by whole world units (built once a look)
  _grazerOf(e) {
    const v = this.view, [W, H] = this.world();
    if (!this._eaters || this._eaters.view !== v) {
      const grid = new Map();
      for (let i = 0; i < v.n; i++) {
        if (!isLiving(v.kind[i]) || !isLiving(v.img[i]) || v.img[i] === v.kind[i]) continue;
        const k = Math.floor(v.x[i]) * 65536 + Math.floor(v.y[i]);
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        a.push(i);
      }
      this._eaters = { view: v, grid };
    }
    let best = null, bd = 1.2 * 1.2;
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const gx = (((cx + a) % W) + W) % W, gy = (((cy + b) % H) + H) % H;
      for (const i of this._eaters.grid.get(gx * 65536 + gy) || []) {
        if (v.img[i] !== e.kind) continue;
        let dx = v.x[i] - e.x, dy = v.y[i] - e.y;
        dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { id: v.id[i], kind: v.kind[i] }; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ the budget
  // A few notes at a time, one arriving at a time, each held long enough to read; the strongest story first, never the
  // same story again soon, nor the same kind of story back to back.
  schedule(ctx) {
    const T = this.T, now = ctx.now, wide = ctx.ppu < T.wide;
    const maxOn = wide ? 1 : ctx.phone ? T.maxOnPhone : T.maxOn;
    // (a note goes for the view's zooming out only once it is well past the step, so a slow drift across it keeps it)
    const tooWide = ctx.ppu < T.wide * 0.75;
    const byKey = new Map(this.cands.map((c) => [c.key, c]));
    let live = 0;
    for (const n of [...this.notes].reverse()) {
      if (n.exitAt != null) continue;
      // the camera setting off elsewhere takes with it the notes about what it leaves behind (rather than dragging them
      // out of view); one about cells that will still show where it goes stays
      if (ctx.leaving && !this._goesTo(n, ctx)) { this._exit(n, now, 'camera'); continue; }
      // (its least counted from when it could first be read: n.readAt, from the view; one never read is not held)
      const young = n.readAt != null && now - n.readAt < T.minLife;
      // a wide view keeps only the water's own stories, and only as many as it has room for (the newest)
      if (((tooWide && !WATER_TYPES.has(n.type)) || ++live > (tooWide ? 1 : maxOn)) && !young) { this._exit(n, now, 'zoom'); continue; }
      const c = byKey.get(n.key);
      const age = now - n.born;
      // (one told as first found, its words and its outline, keeps them while it is told: data.lock; and every note keeps
      // whom it is about, the cells it points at, while they live: only its figures follow the story)
      if (c && !n.data.lock) {
        const keep = {};
        if (n.data.spot) keep.spot = n.data.spot;
        // (and is drawn as it was first found: from afar, or near, however the zoom hovers about the step)
        if (n.data.band) keep.band = n.data.band;
        for (const f of ['actor', 'target', 'anchor', 'members', 'track']) {
          const was = n.data[f], alive = (id) => id == null || id === NONE || !!this.cell(id);
          const ok = Array.isArray(was) ? was.length && was.every((id) => typeof id !== 'number' || alive(id)) : was != null && was !== NONE && alive(was);
          if (ok) keep[f] = was;
        }
        Object.assign(n.data, c, keep);
        n.track = n.data.track;
      }
      if (c) n.lastHeld = now;
      const held = c || now - n.lastHeld < 1.5 || (n.data.lock && age < T.dwellLong);
      // what it marks gone from view (or its label with no room) for a moment: it goes
      if (this._marked(n, ctx)) n.lostAt = null; else n.lostAt ??= now;
      const lost = n.lostAt != null && now - n.lostAt > T.grace;
      const hidden = n.hiddenAt != null && now - n.hiddenAt > T.grace;
      if (young) continue;
      if (lost || hidden || (!held && age > Math.max(T.dwell, T.minLife)) || age > (n.data.one ? T.lifeOne : T.life)) this._exit(n, now, lost ? 'lost' : hidden ? 'hidden' : 'done');
    }
    // (a note that has been read is kept, fading or not, until it has been read a moment and a half at least)
    this.notes = this.notes.filter((n) => n.exitAt == null || now - n.exitAt < (n.fade || T.exit) || (n.readAt != null && now - n.readAt < 1.7));
    const on = this.notes.filter((n) => n.exitAt == null);
    // (while the view is panned or zoomed, a note begins if what it points at will still show a while on: below; while
    // the auto camera flies to its next shot, only about cells that show now and will show there)
    if (now - this.lastArrive < T.gap) return;
    const fast = ctx.speed > T.fast;
    while (this.shownAt.length && now - this.shownAt[0][1] > T.variety) this.shownAt.shift();
    // the stronger first, a kind of story told lately counting against another of its kind
    const score = (c) => c.prio * (1 + 0.12 * Math.log1p(c.strength || 0)) / (1 + 0.5 * this.shownAt.filter(([t]) => t === c.type).length);
    // (well inside the view now, and where its cells will be two seconds on at the pace they move)
    const inner = (c) => {
      if (!this._marked({ data: c, pins: c.anchor != null ? [c.anchor] : [] }, { ...ctx, visible: ctx.inner })) return false;
      // (and where the view will be then, as it pans: its cells two seconds on, the camera two seconds on; zooming in,
      // only those near its middle)
      const ahead = 2 * Math.max(ctx.speed, 0.25), cv = ctx.camVel || [0, 0], seen = (ctx.zoomIn ?? 0) > 0.05 && ctx.central ? ctx.central : ctx.visible;
      for (const id of [c.actor, c.target, c.anchor]) {
        const p = id != null && id !== NONE ? this.cell(id) : null;
        if (p && !seen(p.x + p.vx * ahead - cv[0] * 2, p.y + p.vy * ahead - cv[1] * 2)) return false;
      }
      return true;
    };
    const subject = (c) => `${c.type}~${c.akind ?? c.kind ?? ''}`;
    const pick = this.cands
      .filter((c) => !(fast && c.one) && !on.some((n) => n.key === c.key || this._clash(n.data, c))
        && now - (this.keyAt.get(c.key) ?? -1e9) > T.keyCool && now - (this.typeAt.get(c.type) ?? -1e9) > T.typeCool
        && now - (this.keyAt.get(subject(c)) ?? -1e9) > T.subjectCool
        // (a story that has held a moment, a single moment one still in view; each well inside the view)
        && (c.type !== 'web' || this.panelFree !== false)
        && (c.one || now - (this.firstSeen.get(c.key) ?? now) >= T.hold) && ctx.ahead >= (c.one ? T.aheadOne : T.ahead) && inner(c)
        && (!ctx.leaving || this._goesTo({ data: c, pins: c.anchor != null ? [c.anchor] : [] }, ctx)))
      .sort((a, b) => score(b) - score(a))[0];
    if (!pick) return;
    if (on.length >= maxOn) {
      // a much stronger story takes the place of the weakest that has been read
      const weak = on.filter((n) => now - n.born > T.dwell).sort((a, b) => score(a.data) - score(b.data))[0];
      if (!weak || score(pick) < score(weak.data) + 0.3) return;
      this._exit(weak, now, 'replaced');
    }
    this.notes.push({ id: ++this.seq, type: pick.type, key: pick.key, born: now, lastHeld: now, exitAt: null, data: { ...pick }, track: pick.track || [], pins: [] });
    this.lastArrive = now;
    this.keyAt.set(pick.key, now);
    this.keyAt.set(subject(pick), now);
    this.typeAt.set(pick.type, now);
    this.shownAt.push([pick.type, now]);
  }

  // whether a note is about cells that show where the auto camera is flying to (ctx.dest: the world it will show), well
  // inside it; a note about the view's own stretch of water (no cells) goes with the view
  _goesTo(n, ctx) {
    const d = n.data, D = ctx.dest;
    if (!D) return false;
    const ids = [d.actor, d.target, d.anchor, ...(n.track || d.track || []), ...(n.pins || [])].filter((id) => id != null && id !== NONE);
    if (!ids.length) return false;
    const [W, H] = this.world();
    for (const id of ids) {
      const c = this.cell(id);
      if (!c) return false;
      let dx = c.x - D.x, dy = c.y - D.y;
      dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
      if (Math.abs(dx) > D.w * 0.38 || Math.abs(dy) > D.h * 0.38) return false;
    }
    return true;
  }

  _exit(n, now, why = '') {
    n.exitAt = now;
    // (one the camera takes before it could be read fades out slowly, rather than blinking away)
    // (readable, past half its alpha, for a moment and a half at least: its fade as long as that takes)
    const read = n.readAt != null ? now - n.readAt : null;
    n.fade = why === 'camera' && read != null && read < this.T.minLife ? Math.max(1.2, 2 * (1.5 - read) + 0.2) : this.T.exit;
    this.keyAt.set(n.key, now);
    // (what was shown, for how long and why it went, for debug(): the variety, and any shown too briefly to read)
    this.history.push([n.type, now - n.born, why]);
    if (this.history.length > 500) this.history.shift();
  }

  // two notes that would mark the same cells or the same species' census
  _clash(a, b) {
    if (a.census != null && a.census === b.census) return true;
    for (const id of b.track || []) if ((a.track || []).includes(id)) return true;
    const water = (t) => t === 'heat' || t === 'cold' || t === 'frozen' || t === 'stranded' || t === 'drying';
    return water(a.type) && water(b.type);
  }

  // whether what a note points at still shows: its cells (and the cells its labels hang on) in view and clear of the
  // panels, its species still in view
  _marked(n, ctx) {
    const d = n.data;
    for (const id of [d.actor, d.target, ...(n.track || d.track || []), ...(n.pins || [])]) {
      if (id == null || id === NONE) continue;
      const c = this.cell(id);
      if (!c || !ctx.visible(c.x, c.y)) return false;
    }
    if (d.census != null) return !!this.stats?.by.get(d.census);
    if (d.kind != null && d.kind >= 0 && (d.type === 'heat' || d.type === 'bloom' || d.type === 'dormant' || d.type === 'waking' || d.type === 'body' || d.type === 'swim')) return !!this.stats?.by.get(d.kind);
    return true;
  }

  /** The rows of species k's cells in the view (all, or only those dormant, torpid or too warm). */
  rows(k, which = 'all') {
    const s = this.stats && this.stats.by.get(k);
    if (!s) return [];
    return which === 'hot' ? s.hotRows : which === 'cyst' ? s.cystRows : which === 'torpid' ? s.torpidRows : s.rows;
  }

  /** The species in view, most numerous first: [{ kind, n, cysts, torpid, hot }] (n scaled up when the view was sampled). */
  roster() {
    const S = this.stats;
    if (!S) return [];
    return [...S.by.values()].map((s) => ({ kind: s.kind, n: Math.round(s.n * S.scale), cysts: s.cysts, torpid: s.torpid, hot: s.hot }))
      .sort((a, b) => b.n - a.n);
  }

  // (drawn: the most the view drew in a frame since the last call, which it clears)
  debug() {
    const drawn = this.ms.drawn;
    this.ms.drawn = {};
    const by = {};
    for (const [t, life, why] of this.history) { const b = (by[t] ||= { n: 0, brief: 0, secs: 0 }); b.n++; b.secs = Math.round(b.secs + life); if (life < 2.5) { b.brief++; b[why] = (b[why] || 0) + 1; } }
    return { shown: by, drawn, worst: this.ms.worst, detectParts: Object.fromEntries(Object.entries(this.ms.detectParts || {}).map(([k, v]) => [k, Math.round(v)])), lost: this.lost, biteKeep: this.biteKeep, ms: Object.fromEntries(Object.entries(this.ms).filter(([k]) => k !== 'drawn' && k !== 'detectParts' && k !== 'worst' && k !== 'lastParts').map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Math.round(b)]))])), cells: this.view?.n ?? 0, inView: this.view?.inView ?? 0, events: this.events.length, cands: this.cands.map((c) => c.key), notes: this.notes.map((n) => `${n.key}${n.exitAt != null ? '(out)' : ''}`) };
  }
}
