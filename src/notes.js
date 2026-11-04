// Live annotations (docs/annotations.md): what is happening in view, told as it happens, in the instrument's own
// marks (src/noteview.js draws them). Two things come back from the GPU every few frames (Engine.onNotes):
// the view (every living cell and husk in the stretch of world annotated: its place, motion, kind, state, how far
// its water lies from its optimum, its bonded partners) and the ring of events the steps wrote there as they
// happened (who killed, bit, bore or scavenged whom, who starved, scalded, froze, dried, encysted or woke). So every
// mark stands on what the world did, by ID: nothing is guessed from what disappeared between looks. Pure: the page
// hands in the readbacks and what it knows of each species, and gets back the notes to draw.
import { NOTE_EV, NOTE_MAX, NOTE_W, NOTE_LITTER, NOTE_HEAD, NOTE_REC, NOTE_TG, NOTE_TEMPS, FIRST_LIFE, CYST } from './shaders.js';

const HUSK = 2; // a husk's kind (the dead, rotting back to silt)

const NONE = 0xffffffff;
export const EV = Object.fromEntries(NOTE_EV.map((n, i) => [n, i]).filter(([n]) => n));

// how a note is chosen and kept (real seconds: the viewer reads at the same pace whatever the world's speed)
export const TUNE = {
  maxOn: 3,        // notes on screen at once up close (a phone: 2; a wide view, where cells are specks: 1)
  maxOnPhone: 2,
  close: 50,       // CSS px a world unit from which cells are big enough to point at one by one
  wide: 18,        // and below which a view is wide: only the water's own stories (heat, cold, drought)
  detectEvery: 0.35, // real seconds between looks for stories
  gap: 4.5,        // between one note's arrival and the next
  dwell: 6,        // a note stays at least this long
  life: 16,        // and at most this long (a single moment: lifeOne)
  lifeOne: 9,
  exit: 0.6,       // its fade out
  typeCool: 18,    // before another note of the same type
  keyCool: 60,     // before the same story again
  fast: 4,         // past this speed, single moments are too quick to follow: only what holds for a while
  window: 30,      // sim seconds counted for "in the last 30 s"
  settle: 0.8,     // a new note waits until the camera has held still this long (and leaves when it flies on)
  hold: 0.7,       // and until its story has held this long (a single moment: is still in view, well inside it)
  grace: 0.6,      // a note whose cell has left the view (or whose label has no room) goes after this long
  minLife: 3,      // a note, once shown, stays at least this long, whatever becomes of what it marks (but for the
                   // camera setting off: then it fades out slowly)
  subjectCool: 60, // the same kind of story about the same species not again within this long (another cell of it)
  ahead: 5,        // a new note waits for a shot with this long still to run (a single moment: aheadOne)
  aheadOne: 5,
  variety: 120,    // a kind of story shown in the last this many seconds counts against another of its kind
  body: 6,         // cells bonded into one organism worth telling
  swim: 0.5,       // body lengths a second from which a body is told swimming
  current: 0.05,   // world units a second from which the water's current is told
};

// half float to float
function half(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

/**
 * The view's cells from a scan (Engine.onNotes), as columns, with an id -> row index; and its water, square by square
 * (grid: the squares' corner and side, fixed in the world; inView: those that overlap the stretch scanned).
 */
export function readView(scan, world) {
  const { n, u32, f32, rect } = scan;
  const [W, H] = world, G = NOTE_TG * NOTE_TG;
  const grid = scan.grid && scan.grid[2] > 0 ? scan.grid : [rect[0], rect[1], Math.max(rect[2], rect[3]) / NOTE_TG];
  const v = {
    n, simTime: scan.simTime, rect, grid, keep: scan.keep, inView: scan.inView,
    id: new Uint32Array(n), x: new Float32Array(n), y: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n), kind: new Uint16Array(n), cause: new Uint8Array(n), role: new Uint8Array(n),
    img: new Uint16Array(n), litter: new Uint8Array(n), torpid: new Uint8Array(n), fed: new Float32Array(n), tx: new Float32Array(n),
    p1: new Uint32Array(n), p2: new Uint32Array(n), at: new Map(),
    temps: new Float32Array(G), ice: new Float32Array(G), sqIn: new Uint8Array(G),
  };
  const s = grid[2], cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
  for (let k = 0; k < G; k++) {
    v.temps[k] = f32[NOTE_TEMPS + k]; v.ice[k] = f32[NOTE_TEMPS + G + k];
    let dx = grid[0] + ((k % NOTE_TG) + 0.5) * s - cx, dy = grid[1] + (Math.floor(k / NOTE_TG) + 0.5) * s - cy;
    dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
    v.sqIn[k] = Math.abs(dx) < (rect[2] + s) / 2 && Math.abs(dy) < (rect[3] + s) / 2 ? 1 : 0;
  }
  for (let i = 0; i < n; i++) {
    const o = NOTE_HEAD + i * NOTE_REC, w = u32[o + 3];
    v.id[i] = u32[o]; v.x[i] = f32[o + 1]; v.y[i] = f32[o + 2];
    v.kind[i] = w & 1023; v.cause[i] = (w >>> 10) & 15; v.role[i] = (w >>> 14) & 3; v.img[i] = (w >>> 16) & 1023;
    v.litter[i] = (w >>> 26) & 1; v.torpid[i] = (w >>> 27) & 1;
    v.vx[i] = half(u32[o + 4] & 0xffff); v.vy[i] = half(u32[o + 4] >>> 16);
    v.fed[i] = half(u32[o + 5] & 0xffff); v.tx[i] = half(u32[o + 5] >>> 16);
    v.p1[i] = u32[o + 6]; v.p2[i] = u32[o + 7];
    v.at.set(v.id[i], i);
  }
  return v;
}

/** The square of the view's water (its index, or -1 outside the grid) that world point (x, y) lies in. */
export function squareOf(v, x, y, world) {
  const [W, H] = world, [ox, oy, s] = v.grid;
  const i = Math.floor((((x - ox) % W) + W) % W / s), j = Math.floor((((y - oy) % H) + H) % H / s);
  return i < NOTE_TG && j < NOTE_TG ? j * NOTE_TG + i : -1;
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
const WATER_TYPES = new Set(['heat', 'cold', 'drying', 'current', 'clump']);

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
    if (wrote > NOTE_MAX / 2) this.biteKeep = Math.max(1 / 4096, this.biteKeep * 0.5);
    else if (wrote < NOTE_MAX / 8) this.biteKeep = Math.min(1, this.biteKeep * 1.25);
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
    const want = wide ? ['scalded', 'froze', 'dried'] : NOTE_EV.filter(Boolean);
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
    ctx.still ??= 1e9;
    ctx.ahead ??= Infinity;
    if (this.fresh && this.view) {
      this.fresh = false;
      this.stats = this._stats();
      this.water = this._water();
      if (ctx.now - (this.detectAt ?? -1e9) >= this.T.detectEvery) {
        const t0 = performance.now();
        this.detectAt = ctx.now;
        this.cands = this.detect(ctx);
        const keys = new Set(this.cands.map((c) => c.key));
        for (const k of keys) if (!this.firstSeen.has(k)) this.firstSeen.set(k, ctx.now);
        for (const k of this.firstSeen.keys()) if (!keys.has(k)) this.firstSeen.delete(k);
        this.ms.detect += performance.now() - t0;
      }
    }
    this.schedule(ctx);
    return this.notes;
  }

  // ------------------------------------------------------------------ detectors
  // Each finds the stories the view holds now, as candidates: { type, key, prio, strength, one (a single moment),
  // track (living ids to find each frame), ...what the view draws }.
  detect(ctx) {
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
    // how many: count('froze'), count('scalded:k') (30 s), count('birth20:k') (20 s), count('killby:k') (by that kind)
    const count = (q) => {
      const [h, k] = q.split(':'), win = h.endsWith('20'), byk = h.endsWith('by'), ev = EV[win ? h.slice(0, -2) : byk ? h.slice(0, -2) : h];
      if (k === undefined) return evN[ev] || 0;
      return (byk ? by : win ? n20 : n30).get(ev * 1024 + +k) || 0;
    };

    if (band !== 'wide') {
      // A kill: the hunter, its quarry's remains, and how many kills its kind has made in view.
      if (close && !fast) for (const e of recent) {
        if (e.ev !== 'kill' || e.t < t - 6 || e.aid === NONE || !name(e.akind) || !name(e.kind)) continue;
        if (!seen(e.aid) || !seen(e.id)) continue;
        const kills = count(`killby:${e.akind}`);
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
          spot: [e.x, e.y], track: [e.aid], meals: count(`scavengeby:${e.akind}`) });
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
        const b = count(`birth20:${s.kind}`);
        if (b >= 5 && s.n >= 6) out.push({ type: 'bloom', key: `bloom:${s.kind}`, prio: 0.42, strength: b, kind: s.kind, births: b, census: s.kind });
        // Dormancy and waking: a species curling up into cysts, or waking from them, many at once; starving.
        const c = count(`cyst20:${s.kind}`), w = count(`woke20:${s.kind}`), st = count(`starved20:${s.kind}`);
        if (c >= 4) out.push({ type: 'dormant', key: `dorm:${s.kind}`, prio: 0.5, strength: c, kind: s.kind, count: c, census: s.kind });
        if (w >= 4) out.push({ type: 'waking', key: `wake:${s.kind}`, prio: 0.46, strength: w, kind: s.kind, count: w, census: s.kind });
        if (st >= 3) out.push({ type: 'starving', key: `starve:${s.kind}`, prio: 0.5, strength: st, kind: s.kind, count: st });
      }
    }
    // Heat: a species whose water has warmed past what it bears (crowds warm their own water), scalding; beside it,
    // the most numerous species in the same water that bears it.
    for (const s of S.by.values()) {
      // (scalding: deaths seen, or a good share of its cells in water past what it bears)
      // (deaths seen with a fair share too warm, or most of it too warm: water merely warm for some is not a story)
      const scalds = count(`scalded:${s.kind}`);
      if (!((scalds >= 3 && s.hot >= 0.2 * s.n) || (s.hot >= 8 && s.hot >= 0.4 * s.n)) || !name(s.kind)) continue;
      const hot = this._hotCells(this.sp(s.kind));
      let fine = null;
      if (band !== 'wide') for (const o of S.by.values()) {
        if (o.kind === s.kind || o.n < 4 || o.hot > 0 || !name(o.kind)) continue;
        // in the same warm water: its cells in the squares too warm for the first
        let inHot = 0;
        for (const i of o.rows) if (hot.has(squareOf(v, v.x[i], v.y[i], this.world()))) inHot++;
        if (inHot >= 3 && (!fine || inHot > fine.n)) fine = { kind: o.kind, n: inHot };
      }
      out.push({ type: 'heat', key: `heat:${s.kind}`, prio: 0.6, strength: s.hot / s.n * 10 + 2 * scalds, kind: s.kind, hot: Math.round(s.hot * S.scale), scalds,
        squares: [...hot], fine, census: s.kind, water: this.water.hi });
    }
    // Cold: the view's water near freezing and its cells stilled (torpid), or frozen to death.
    const froze = count('froze');
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
    const dried = count('dried');
    if (dried >= 3) {
      let most = -1, mn = 0;
      for (const s of S.by.values()) { const d = count(`dried:${s.kind}`); if (d > mn) { mn = d; most = s.kind; } }
      out.push({ type: 'drying', key: 'drying', prio: 0.7, strength: dried, count: dried, kind: most });
    }

    if (band !== 'wide') {
      // An organism: cells bonded into one body (each cell's bonded partners, from the view), its size, its shape, and
      // whether it swims (body lengths a second). The biggest is told as a body; the fastest, swimming.
      let big = null, fastest = null;
      const tb = performance.now(), bodies = this._bodies();
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

      // A hunter closing on its quarry: a hunter whose last meal was the species of the nearest cell ahead of it,
      // heading for it (up close, before the kill).
      if (close && !fast) {
        const ts = performance.now(), st = this._stalk(ctx);
        this._part('stalk', ts);
        if (st) out.push({ type: 'stalk', key: `stalk:${st.actor}`, prio: 0.7, strength: 1 / Math.max(st.dist, 0.05), ...st, track: [st.actor, st.target] });
      }

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
        const born = count(`birth:${s.kind}`), died = Object.fromEntries(CAUSES.map((c) => [c, count(`${c}:${s.kind}`)]));
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
        const o = count(`old20:${s.kind}`);
        if (o >= 3 && name(s.kind)) out.push({ type: 'old', key: `old:${s.kind}`, prio: 0.38, strength: o, kind: s.kind, count: o });
      }
    }
    // A community: a dense clump where several species live together; what it holds and why it holds together.
    const tc = performance.now(), cl = this._clump(ctx, band);
    this._part('clump', tc);
    if (cl) out.push({ ...cl, type: 'clump', key: `clump:${cl.key}`, prio: 0.6, strength: cl.species * 2 + Math.log1p(cl.cells), track: [cl.anchor] });
    // Decay: the dead rotting back to silt, which feeds what grows next.
    const rot = count('rot');
    if (rot >= 12 && S.husks.length >= 10) out.push({ type: 'rot', key: 'rot', prio: 0.32, strength: rot, count: rot, husks: Math.round(S.husks.length * S.scale), sparks: count('spark') });
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
  _part(k, t0) { const d = (this.ms.detectParts ||= {}); d[k] = (d[k] || 0) + performance.now() - t0; }

  // The view's organisms: cells joined by their bonds (each cell's two bonded partners, of its own kind, as the view
  // read them), as { kind, ids, n, anchor (the member nearest its middle), its place (ax, ay), size (world units across),
  // form, speed (world units a second), lengths (body lengths a second), heading, key }, kept by key from look to look
  // (a body keeps its key while it keeps any of its cells). Once a look.
  _bodies() {
    const v = this.view;
    if (this._bodyView === v) return this._bodyList;
    const [W, H] = this.world(), parent = new Int32Array(v.n).fill(-1);
    const find = (i) => { while (parent[i] >= 0 && parent[parent[i]] >= 0) i = parent[i] = parent[parent[i]]; return parent[i] >= 0 ? parent[i] : i; };
    for (let i = 0; i < v.n; i++) {
      if (!isLiving(v.kind[i])) continue;
      for (const pid of [v.p1[i], v.p2[i]]) {
        if (pid === NONE) continue;
        const j = v.at.get(pid);
        if (j === undefined || v.kind[j] !== v.kind[i]) continue;
        const a = find(i), b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
    const groups = new Map();
    for (let i = 0; i < v.n; i++) {
      if (!isLiving(v.kind[i]) || (parent[i] < 0 && v.p1[i] === NONE && v.p2[i] === NONE)) continue;
      const r = find(i);
      let gr = groups.get(r);
      if (!gr) groups.set(r, (gr = []));
      gr.push(i);
    }
    const prev = this._bodyKeys || new Map(), keys = new Map(), list = [];
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
      const tr = (sxx + syy) / n, det = (sxx * syy - sxy * sxy) / (n * n), disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = Math.max(tr / 2 - disc, 1e-9), elong = Math.sqrt(l1 / l2);
      const size = 2 * Math.sqrt(far), speed = Math.hypot(vx, vy);
      const ids = rows.map((i) => v.id[i]);
      // its key: the one it had while it held any of these cells (the one it shared most with), else its first cell's
      let key = null, best = 0;
      for (const [k, set] of prev) { let c = 0; for (const id of ids) if (set.has(id)) c++; if (c > best) { best = c; key = k; } }
      if (key == null || keys.has(key)) key = `${v.kind[rows[0]]}.${Math.min(...ids)}`;
      keys.set(key, new Set(ids));
      list.push({ kind: v.kind[rows[0]], ids, n, anchor: v.id[anchor], ax: v.x[anchor], ay: v.y[anchor], size, speed,
        lengths: speed / Math.max(size, 0.05), heading: Math.atan2(vy, vx), key,
        form: elong >= 3.5 ? 'filament' : n >= 20 && elong < 1.8 ? 'mat' : n >= 8 ? 'colony' : 'cluster' });
    }
    this._bodyKeys = keys;
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
  _clump(ctx, band) {
    const v = this.view, [W, H] = this.world(), r = v.rect, cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
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
    const mean = living / bins.size, dense = new Set();
    for (const [key, c] of bins) if (c.length >= Math.max(6, 2.2 * mean)) dense.add(key);
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
      if (comp.length >= 4 && comp.length * b * b <= 0.5 * r[2] * r[3]) clumps.push(comp);
    }
    const prev = this._clumpKeys || new Map(), keys = new Map();
    let best = null;
    for (const comp of clumps) {
      const rows = comp.flatMap((k) => bins.get(k)), byKind = new Map();
      for (const i of rows) byKind.set(v.kind[i], (byKind.get(v.kind[i]) || 0) + 1);
      const shares = [...byKind].map(([k, c]) => ({ kind: k, share: c / rows.length })).sort((p, q) => q.share - p.share);
      const many = shares.filter((x) => x.share >= 0.05).length, eff = 1 / shares.reduce((a, x) => a + x.share * x.share, 0);
      if (many < 3 || eff < 2.5 || rows.length < 40) continue;
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
    const { comp, rows, shares } = best, set = new Set(comp), S = this.stats;
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
      size: 2 * far, b, bins: comp, anchor: v.id[anchor], band };
  }

  // the nearest hunter closing on a cell of the species it last ate: within reach, moving toward it
  _stalk(ctx) {
    const v = this.view, [W, H] = this.world(), grid = new Map(), R = 1.5;
    for (let i = 0; i < v.n; i++) {
      if (!isLiving(v.kind[i]) || v.cause[i] === CYST) continue;
      const k = Math.floor(v.x[i] / R) * 65536 + Math.floor(v.y[i] / R);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(i);
    }
    let best = null;
    for (let i = 0; i < v.n; i++) {
      const k = v.kind[i], img = v.img[i], sp = Math.hypot(v.vx[i], v.vy[i]);
      if (!isLiving(k) || !isLiving(img) || img === k || sp < 0.02 || this.sp(k)?.guild !== 'predator' || !this.sp(img)) continue;
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
  _hotCells(g) {
    const out = new Set(), v = this.view;
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
      // the camera setting off elsewhere takes the notes with it (rather than dragging them out of view)
      if (ctx.leaving) { this._exit(n, now, 'camera'); continue; }
      const young = now - n.born < T.minLife;
      // a wide view keeps only the water's own stories, and only as many as it has room for (the newest)
      if (((tooWide && !WATER_TYPES.has(n.type)) || ++live > (tooWide ? 1 : maxOn)) && !young) { this._exit(n, now, 'zoom'); continue; }
      const c = byKey.get(n.key);
      const age = now - n.born;
      if (c) { Object.assign(n.data, c, { track: c.track?.length ? c.track : n.data.track }); n.track = n.data.track; n.lastHeld = now; }
      const held = c || now - n.lastHeld < 1.5;
      // what it marks gone from view (or its label with no room) for a moment: it goes
      if (this._marked(n, ctx)) n.lostAt = null; else n.lostAt ??= now;
      const lost = n.lostAt != null && now - n.lostAt > T.grace;
      const hidden = n.hiddenAt != null && now - n.hiddenAt > T.grace;
      if (young) continue;
      if (lost || hidden || (!held && age > Math.max(T.dwell, T.minLife)) || age > (n.data.one ? T.lifeOne : T.life)) this._exit(n, now, lost ? 'lost' : hidden ? 'hidden' : 'done');
    }
    this.notes = this.notes.filter((n) => n.exitAt == null || now - n.exitAt < (n.fade || T.exit));
    const on = this.notes.filter((n) => n.exitAt == null);
    // nothing new while the camera moves, nor until it has held still a moment
    if (now - this.lastArrive < T.gap || ctx.leaving || ctx.still < T.settle) return;
    const fast = ctx.speed > T.fast;
    while (this.shownAt.length && now - this.shownAt[0][1] > T.variety) this.shownAt.shift();
    // the stronger first, a kind of story told lately counting against another of its kind
    const score = (c) => c.prio * (1 + 0.12 * Math.log1p(c.strength || 0)) / (1 + 0.5 * this.shownAt.filter(([t]) => t === c.type).length);
    // (well inside the view now, and where its cells will be two seconds on at the pace they move)
    const inner = (c) => {
      if (!this._marked({ data: c, pins: c.anchor != null ? [c.anchor] : [] }, { ...ctx, visible: ctx.inner })) return false;
      const ahead = 2 * Math.max(ctx.speed, 0.25);
      for (const id of [c.actor, c.target, c.anchor]) {
        const p = id != null && id !== NONE ? this.cell(id) : null;
        if (p && !ctx.visible(p.x + p.vx * ahead, p.y + p.vy * ahead)) return false;
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
        && (c.one || now - (this.firstSeen.get(c.key) ?? now) >= T.hold) && ctx.ahead >= (c.one ? T.aheadOne : T.ahead) && inner(c))
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

  _exit(n, now, why = '') {
    n.exitAt = now;
    // (one the camera takes before it could be read fades out slowly, rather than blinking away)
    // (readable, past half its alpha, for a moment and a half at least: its fade as long as that takes)
    n.fade = why === 'camera' && now - n.born < this.T.minLife ? Math.max(1.2, 2 * (1.5 - (now - n.born)) + 0.2) : this.T.exit;
    this.keyAt.set(n.key, now);
    // (what was shown, for how long and why it went, for debug(): the variety, and any shown too briefly to read)
    this.history.push([n.type, now - n.born, why]);
    if (this.history.length > 500) this.history.shift();
  }

  // two notes that would mark the same cells or the same species' census
  _clash(a, b) {
    if (a.census != null && a.census === b.census) return true;
    for (const id of b.track || []) if ((a.track || []).includes(id)) return true;
    return (a.type === 'heat' || a.type === 'cold') && (b.type === 'heat' || b.type === 'cold');
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
    return { shown: by, drawn, detectParts: Object.fromEntries(Object.entries(this.ms.detectParts || {}).map(([k, v]) => [k, Math.round(v)])), lost: this.lost, biteKeep: this.biteKeep, ms: Object.fromEntries(Object.entries(this.ms).filter(([k]) => k !== 'drawn' && k !== 'detectParts').map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Math.round(b)]))])), cells: this.view?.n ?? 0, inView: this.view?.inView ?? 0, events: this.events.length, cands: this.cands.map((c) => c.key), notes: this.notes.map((n) => `${n.key}${n.exitAt != null ? '(out)' : ''}`) };
  }
}
