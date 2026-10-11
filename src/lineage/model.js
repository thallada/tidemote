// The Lab's Lineage view as data. Every established species is a node in its ancestry tree with its
// own population record (sp.series, kept by main.js at its own resolution). Each lineage is followed
// through its heir (the daughter whose clade held the most life) as a strand, so a population that
// drifts through species after species reads as one line. A cut keeps the k strands that held the
// most life in a time window and counts every other species with its nearest shown strand: the whole
// world in a few dozen rows, finer lineages appearing as the window narrows or the view follows one
// clade. Pure: no DOM (test/lineage.test.js).
import { unpackUnorm } from '../genome.js';

/** The most points a species' record keeps; past it every other point goes. */
export const SERIES_MAX = 64;

/** Add a census point to a species' record ({ t: [], v: [] }), halving it when full. */
export function record(series, t, v) {
  if (!Array.isArray(series.t)) { series.t = Array.from(series.t); series.v = Array.from(series.v); } // sealed, then seen again
  const n = series.t.length;
  if (n && series.t[n - 1] === t) { series.v[n - 1] = v; return; }
  series.t.push(t); series.v.push(v);
  if (series.t.length > SERIES_MAX) {
    // keep the first and last points, every other one between
    const keep = (_, i, a) => i === 0 || i === a.length - 1 || i % 2 === 0;
    series.t = series.t.filter(keep); series.v = series.v.filter(keep);
  }
}

/** A finished record (its species gone) as compact typed arrays. */
export const seal = (series) => ({ t: Float32Array.from(series.t), v: Float32Array.from(series.v) });

// what never changes once a species is gone (its record, colour and life), kept from build to build
const settled = new WeakMap();

/**
 * The established species of life ({ reg }) at time T as a forest with strands:
 * { T, nodes (oldest first), strands, bySerial }. A node: { serial, s, name, rgb, born, end, alive,
 * pop, parent, kids, t, v (its record), w (its life: cells × seconds), cw (its clade's), heir,
 * strand }. A strand: { id, nodes, first, born, end, alive, live (its clade holds the living),
 * parent, kids }.
 */
export function lineageModel(life, T) {
  const nodes = [], bySerial = new Map();
  for (const s of life.reg.values()) {
    if (!s.established) continue;
    const done = !s.alive && settled.get(s);
    const n = done && done.end === s.extinct
      ? { serial: s.serial, s, name: s.name, rgb: done.rgb, born: s.born, end: done.end, alive: false, pop: 0, parent: null, kids: [], t: done.t, v: done.v, w: done.w, cw: 0, heir: null, strand: null }
      : { serial: s.serial, s, name: s.name, rgb: unpackUnorm(s.genome.col), born: s.born, end: s.alive ? T : (s.extinct ?? T), alive: s.alive, pop: s.pop,
        parent: null, kids: [], t: Float64Array.from(s.series.t), v: Float32Array.from(s.series.v), w: 0, cw: 0, heir: null, strand: null };
    nodes.push(n);
    bySerial.set(n.serial, n);
  }
  nodes.sort((a, b) => a.born - b.born || a.serial - b.serial);
  for (const n of nodes) {
    const p = n.s.ancestor != null ? bySerial.get(n.s.ancestor) : null;
    if (p) { n.parent = p; p.kids.push(n); }
  }
  // each species' life and its clade's; the heir is the daughter whose clade held the most
  for (let j = nodes.length - 1; j >= 0; j--) {
    const n = nodes[j];
    if (n.alive || !settled.has(n.s)) {
      n.w = integrate(n, -Infinity, Infinity);
      if (!n.alive && n.s.extinct != null) settled.set(n.s, { t: n.t, v: n.v, rgb: n.rgb, w: n.w, end: n.end });
    }
    n.cw = n.w;
    for (const k of n.kids) { n.cw += k.cw; if (!n.heir || k.cw > n.heir.cw) n.heir = k; }
  }
  const strands = [];
  for (const n of nodes) {
    if (n.parent && n.parent.heir === n) continue;
    const st = { id: strands.length, nodes: [], first: n, born: n.born, end: n.end, alive: false, live: false, parent: null, kids: [] };
    for (let c = n; c; c = c.heir) { st.nodes.push(c); c.strand = st; if (c.end > st.end) st.end = c.end; st.alive ||= c.alive; }
    strands.push(st);
  }
  for (const st of strands) if (st.first.parent) { st.parent = st.first.parent.strand; st.parent.kids.push(st); }
  for (let j = strands.length - 1; j >= 0; j--) { const st = strands[j]; st.live = st.alive || st.kids.some((k) => k.live); }
  return { T, nodes, strands, bySerial };
}

/** A species' population at time t, from its record (0 outside its life). */
export function valAt(n, t) {
  const ts = n.t, len = ts.length;
  if (!len || t < n.born || t > n.end) return 0;
  if (t <= ts[0]) return n.v[0];
  if (t >= ts[len - 1]) return n.alive ? n.pop : n.v[len - 1];
  let lo = 0, hi = len - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
  return n.v[lo] + (n.v[hi] - n.v[lo]) * ((t - ts[lo]) / (ts[hi] - ts[lo] || 1));
}

// cells × seconds a species held between t0 and t1 (its record as steps from each point)
function integrate(n, t0, t1) {
  const ts = n.t, len = ts.length;
  let w = 0;
  for (let i = 0; i < len; i++) {
    const a = Math.max(t0, ts[i]), b = Math.min(t1, i + 1 < len ? ts[i + 1] : n.end);
    if (b > a) w += n.v[i] * (b - a);
  }
  return w;
}

/**
 * Cut the model to the k strands that held the most life between t0 and t1 (a strand's clade always
 * outweighs its daughters', so the shown strands keep their ancestry). Every hidden species counts
 * with its nearest shown strand; strands with no shown ancestor make up 'other'. live: only the
 * lineages that still have living species. root: only that strand's clade. Each unit's population is
 * sampled at n points across the window.
 * Returns { t0, t1, ts, units, roots, other, outside (species in other), lineages and species (that
 * lived in the span) }; a unit: { strand, parent, kids, born, end, alive, vals, members (its strand's
 * species), count (species in the span it stands for), hidden (those not on its strand), weight, peak }.
 */
export function cut(m, { t0 = 0, t1 = m.T, k = 30, n = 240, root = null, live = false } = {}) {
  let strands = m.strands;
  if (root) { const sub = []; const walk = (st) => { sub.push(st); st.kids.forEach(walk); }; walk(root); strands = sub.sort((a, b) => a.id - b.id); }
  if (live) strands = strands.filter((st) => st.live);
  const inSet = new Map(strands.map((st, j) => [st, j]));
  // the clade weight of every strand in the window
  const ww = new Float64Array(strands.length);
  for (let j = strands.length - 1; j >= 0; j--) {
    const st = strands[j];
    let w = 0;
    for (const nd of st.nodes) if (nd.end > t0 && nd.born < t1) w += nd.born >= t0 && nd.end <= t1 ? nd.w : integrate(nd, t0, t1);
    for (const c of st.kids) { const i = inSet.get(c); if (i != null) w += ww[i]; }
    ww[j] = w;
  }
  const W = (st) => ww[inSet.get(st)];
  const ranked = [];
  for (let j = 0; j < strands.length; j++) if (ww[j] > 0) ranked.push(j);
  ranked.sort((a, b) => ww[b] - ww[a] || strands[a].born - strands[b].born);
  const shown = new Set(ranked.slice(0, k).map((j) => strands[j]));
  const ts = new Float64Array(n);
  for (let i = 0; i < n; i++) ts[i] = t0 + ((t1 - t0) * i) / (n - 1);
  const unitOf = new Map(), units = [];
  const mk = (st) => ({ strand: st, parent: null, kids: [], born: st ? st.born : Infinity, end: st ? st.end : 0, alive: st ? st.alive : false, vals: new Float32Array(n), members: st ? st.nodes : [], hidden: 0, count: 0, weight: st ? W(st) : 0, peak: 0 });
  for (const st of strands) if (shown.has(st)) { const u = mk(st); unitOf.set(st, u); units.push(u); }
  const other = mk(null);
  other.other = true;
  const owner = (st) => { for (let s = st; s && inSet.has(s); s = s.parent) { const u = unitOf.get(s); if (u) return u; } return other; };
  // counts are of the species that lived within the span
  let species = 0, lineages = 0;
  const within = (nd) => nd.end >= t0 && nd.born <= t1;
  for (const st of strands) {
    const u = owner(st);
    let k = 0;
    for (const nd of st.nodes) if (within(nd)) k++;
    species += k;
    if (k) lineages++;
    u.count += k;
    if (u.strand !== st) {
      u.hidden += k;
      if (st.end > u.end) u.end = st.end;
      if (u.other && st.born < u.born) u.born = st.born;
      u.alive ||= st.alive;
    }
    for (const nd of st.nodes) addOnGrid(nd, ts, u.vals);
  }
  const roots = [];
  for (const u of units) {
    const p = u.strand.parent && inSet.has(u.strand.parent) ? owner(u.strand.parent) : null;
    u.parent = p && !p.other ? p : null;
    (u.parent ? u.parent.kids : roots).push(u);
  }
  for (const u of [...units, other]) for (const v of u.vals) if (v > u.peak) u.peak = v;
  return { t0, t1, ts, units, roots, other: other.peak > 0 ? other : null, outside: other.count, lineages, species };
}

// add a species' population at each grid time to out
function addOnGrid(nd, ts, out) {
  const n = ts.length, t0 = ts[0], dt = (ts[n - 1] - t0) / (n - 1 || 1);
  if (nd.end < t0 || nd.born > ts[n - 1] || !nd.t.length) return;
  const i0 = Math.max(0, Math.ceil((nd.born - t0) / dt)), i1 = Math.min(n - 1, Math.floor((nd.end - t0) / dt));
  for (let i = i0; i <= i1; i++) out[i] += valAt(nd, ts[i]);
}

/** The species of a unit's strand most numerous at time t (or null). */
export function memberAt(u, t) {
  let best = null, bv = 0;
  for (const nd of u.members) { const v = valAt(nd, t); if (v > bv) { bv = v; best = nd; } }
  return best;
}

// does sorted interval list a overlap sorted list b?
function overlaps(a, b) {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i][1] <= b[j][0]) i++;
    else if (b[j][1] <= a[i][0]) j++;
    else return true;
  }
  return false;
}

/**
 * Lanes for items ({ parent, born, end, from?, reach? }) as a tree of blocks: every subtree keeps to
 * a run of lanes below its root, and runs slide up into lanes whose lineages were gone by then (a tidy
 * tree in time). An item holds its lane from born (or from, if earlier) to its end or its reach
 * (where its name ends), whichever is later, and gap after it. Sets item.lane; returns the lane count.
 */
export function packBlocks(items, gap = 0) {
  const kids = new Map(items.map((it) => [it, []])), roots = [];
  for (const it of items) (it.parent && kids.has(it.parent) ? kids.get(it.parent) : roots).push(it);
  const place = (block, sub, from) => {
    let o = from;
    for (;; o++) {
      let ok = true;
      for (let j = 0; j < sub.length && ok; j++) if (block[o + j] && overlaps(block[o + j], sub[j])) ok = false;
      if (ok) break;
    }
    for (let j = 0; j < sub.length; j++) {
      if (!block[o + j]) block[o + j] = [];
      block[o + j].push(...sub[j]);
      block[o + j].sort((p, q) => p[0] - q[0]);
    }
    return o;
  };
  const rel = new Map();
  const layout = (it) => {
    const block = [[[Math.min(it.born, it.from ?? it.born), Math.max(it.end, it.reach ?? it.end) + gap]]];
    for (const c of kids.get(it).sort((a, b) => a.born - b.born)) rel.set(c, place(block, layout(c), 1));
    return block;
  };
  const all = [];
  for (const r of roots.sort((a, b) => a.born - b.born)) rel.set(r, place(all, layout(r), 0));
  const assign = (it, base) => { it.lane = base + rel.get(it); for (const c of kids.get(it)) assign(c, it.lane); };
  for (const r of roots) assign(r, 0);
  return all.length;
}
