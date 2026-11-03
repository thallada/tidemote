// Live annotations (docs/annotations.md): what is happening in view, told as it happens, in the instrument's own
// marks (src/noteview.js draws them). Two things come back from the GPU every few frames (Engine.onNotes):
// the view (every living cell and husk in the stretch of world annotated: its place, motion, kind, state, how far
// its water lies from its optimum, its bonded partners) and the ring of events the steps wrote there as they
// happened (who killed, bit, bore or scavenged whom, who starved, scalded, froze, dried, encysted or woke). So every
// mark stands on what the world did, by ID: nothing is guessed from what disappeared between looks. Pure: the page
// hands in the readbacks and what it knows of each species, and gets back the notes to draw.
import { NOTE_EV, NOTE_MAX, NOTE_W, NOTE_LITTER, NOTE_HEAD, NOTE_REC, NOTE_TG, NOTE_TEMPS, FIRST_LIFE, CYST } from './shaders.js';

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
const WATER_TYPES = new Set(['heat', 'cold', 'drying']);

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
      for (const id of n.track || []) {
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
    for (let i = 0; i < v.n; i++) {
      const k = v.kind[i];
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
    return { by, living, torpid, scale };
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
   * visible(x, y) whether a world point shows clear of the panels }. Returns the notes to draw.
   */
  update(ctx) {
    this._now = ctx.now;
    if (this.fresh && this.view) {
      this.fresh = false;
      this.stats = this._stats();
      this.water = this._water();
      if (ctx.now - (this.detectAt ?? -1e9) >= this.T.detectEvery) {
        const t0 = performance.now();
        this.detectAt = ctx.now;
        this.cands = this.detect(ctx);
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
    const n = new Map(), recent = [], pairs = new Map();
    const tally = (k) => n.set(k, (n.get(k) || 0) + 1);
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.t < t - W) break;
      tally(`${e.ev}:${e.kind}`);
      if (e.t >= t - 20) tally(`${e.ev}20:${e.kind}`);
      if (e.ev === 'kill' || e.ev === 'scavenge') tally(`${e.ev}by:${e.akind}`);
      tally(e.ev);
      if (e.t >= t - 8) recent.push(e);
      if ((e.ev === 'bite' || e.ev === 'grazed') && band !== 'wide') {
        let ak = e.akind, aid = e.aid;
        if (aid === NONE) { const g = this._grazerOf(e); if (!g) continue; ak = g.kind; aid = g.id; }
        const key = `${ak}>${e.kind}`;
        let p = pairs.get(key);
        if (!p) pairs.set(key, (p = { akind: ak, kind: e.kind, n: 0, dead: 0, last: null }));
        p.n += e.w ?? 1;
        if (e.ev === 'grazed') p.dead++;
        if (!p.last) p.last = { ...e, aid };
      }
    }
    const count = (k) => n.get(k) || 0;

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
      const scalds = count(`scalded:${s.kind}`);
      if ((scalds < 3 && !(s.hot >= 5 && s.hot >= 0.25 * s.n)) || !name(s.kind)) continue;
      const hot = this._hotCells(this.sp(s.kind));
      let fine = null;
      if (band !== 'wide') for (const o of S.by.values()) {
        if (o.kind === s.kind || o.n < 4 || o.hot > 0 || !name(o.kind)) continue;
        // in the same warm water: its cells in the squares too warm for the first
        let inHot = 0;
        for (const i of o.rows) if (hot.has(squareOf(v, v.x[i], v.y[i], this.world()))) inHot++;
        if (inHot >= 3 && (!fine || inHot > fine.n)) fine = { kind: o.kind, n: inHot };
      }
      out.push({ type: 'heat', key: `heat:${s.kind}`, prio: 0.85, strength: s.hot / s.n * 10 + 2 * scalds, kind: s.kind, hot: Math.round(s.hot * S.scale), scalds,
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
      out.push({ type: 'cold', key: 'cold', prio: 0.78, strength: S.torpid + froze, torpid: S.torpid, living: S.living,
        froze, species: [...S.by.values()].filter((s) => s.torpid > 0).length, kind: most ? most.kind : -1, warm: warm && band !== 'wide' ? warm.kind : -1 });
    }
    const dried = count('dried');
    if (dried >= 3) {
      let most = -1, mn = 0;
      for (const s of S.by.values()) { const d = count(`dried:${s.kind}`); if (d > mn) { mn = d; most = s.kind; } }
      out.push({ type: 'drying', key: 'drying', prio: 0.7, strength: dried, count: dried, kind: most });
    }
    for (const c of out) c.band = band;
    return out;
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
    const byKey = new Map(this.cands.map((c) => [c.key, c]));
    let live = 0;
    for (const n of [...this.notes].reverse()) {
      if (n.exitAt != null) continue;
      // a wide view keeps only the water's own stories, and only as many as it has room for (the newest)
      if ((wide && !WATER_TYPES.has(n.type)) || ++live > maxOn) { this._exit(n, now); continue; }
      const c = byKey.get(n.key);
      const age = now - n.born;
      if (c) { Object.assign(n.data, c, { track: c.track?.length ? c.track : n.data.track }); n.track = n.data.track; n.lastHeld = now; }
      const held = c || now - n.lastHeld < 1.5;
      const marked = this._marked(n, ctx);
      if (!marked || (!held && age > T.dwell) || age > (n.data.one ? T.lifeOne : T.life)) this._exit(n, now);
    }
    this.notes = this.notes.filter((n) => n.exitAt == null || now - n.exitAt < T.exit);
    const on = this.notes.filter((n) => n.exitAt == null);
    if (now - this.lastArrive < T.gap) return;
    const fast = ctx.speed > T.fast;
    const score = (c) => c.prio * (1 + 0.12 * Math.log1p(c.strength || 0));
    const pick = this.cands
      .filter((c) => !(fast && c.one) && !on.some((n) => n.key === c.key || this._clash(n.data, c))
        && now - (this.keyAt.get(c.key) ?? -1e9) > T.keyCool && now - (this.typeAt.get(c.type) ?? -1e9) > T.typeCool
        && this._marked({ data: c }, ctx))
      .sort((a, b) => score(b) - score(a))[0];
    if (!pick) return;
    if (on.length >= maxOn) {
      // a much stronger story takes the place of the weakest that has been read
      const weak = on.filter((n) => now - n.born > T.dwell).sort((a, b) => score(a.data) - score(b.data))[0];
      if (!weak || score(pick) < score(weak.data) + 0.3) return;
      this._exit(weak, now);
    }
    this.notes.push({ id: ++this.seq, type: pick.type, key: pick.key, born: now, lastHeld: now, exitAt: null, data: { ...pick }, track: pick.track || [] });
    this.lastArrive = now;
    this.keyAt.set(pick.key, now);
    this.typeAt.set(pick.type, now);
  }

  _exit(n, now) { n.exitAt = now; this.keyAt.set(n.key, now); }

  // two notes that would mark the same cells or the same species' census
  _clash(a, b) {
    if (a.census != null && a.census === b.census) return true;
    for (const id of b.track || []) if ((a.track || []).includes(id)) return true;
    return (a.type === 'heat' || a.type === 'cold') && (b.type === 'heat' || b.type === 'cold');
  }

  // whether what a note points at still shows: its cells in view and clear of the panels
  _marked(n, ctx) {
    const d = n.data;
    for (const id of [d.actor, d.target]) {
      if (id == null || id === NONE) continue;
      const c = this.cell(id);
      if (!c || !ctx.visible(c.x, c.y)) return false;
    }
    if (d.census != null) return !!this.stats?.by.get(d.census);
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
    return { drawn, lost: this.lost, biteKeep: this.biteKeep, ms: Object.fromEntries(Object.entries(this.ms).filter(([k]) => k !== 'drawn').map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Math.round(b)]))])), cells: this.view?.n ?? 0, inView: this.view?.inView ?? 0, events: this.events.length, cands: this.cands.map((c) => c.key), notes: this.notes.map((n) => `${n.key}${n.exitAt != null ? '(out)' : ''}`) };
  }
}
