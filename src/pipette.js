// The pipette's contents (docs/hand.md): a stack of runs of one species each, the last in at the tip (the first, as
// the strip shows them, left to right: the one that leaves next): a species drawn up again after another is a run
// of its own, and two runs of one species side by side are one. Each run has its id, its
// species' genome words and its organisms, a cell or a body of bonded cells, as they came out of the world: each
// cell's energy, age, color and info, and the cells it keeps bonds to by index, in the order they leave the tip
// again (each next to one already out, as a body squeezes through it), with how many have left and the IDs they
// were given. A species loaded from a card holds colonies not yet made (`made`: how many cells to make, as
// newborns, as they leave). Pure: the page draws up and sets down, and keeps the contents with the world
// (life.pipette).
import { PIPE_EARLIER, PIPE_IDS, PIPE_SP } from './shaders.js';

export const PIPE_LIMIT = 2048;
const NONE = 0xffffffff;

/** Bodies among records taken at the tip (the engine's onTaken: id, partners by ID, ...), each in leaving order. */
export function bodiesOf(recs) {
  const at = new Map(recs.map((r, i) => [r.id, i]));
  const near = recs.map(() => []);
  recs.forEach((r, i) => r.partners.forEach((p) => { const j = p !== NONE ? at.get(p) : undefined; if (j != null && j !== i) { near[i].push(j); near[j].push(i); } }));
  const seen = new Uint8Array(recs.length), out = [];
  for (let s = 0; s < recs.length; s++) {
    if (seen[s]) continue;
    // breadth first: each cell after one it touches
    const order = [s];
    seen[s] = 1;
    for (let k = 0; k < order.length; k++) for (const j of near[order[k]]) if (!seen[j]) { seen[j] = 1; order.push(j); }
    const idx = new Map(order.map((i, k) => [i, k]));
    out.push({ cells: order.map((i) => { const r = recs[i]; return [r.energy, r.age, r.col, r.info, ...r.partners.map((p) => idx.get(at.get(p)) ?? -1)]; }), out: 0, ids: [] });
  }
  return out;
}

export function createPipette(state = { species: [] }, limit = PIPE_LIMIT) {
  const cells = (sp) => sp.orgs.reduce((n, o) => n + o.cells.length - o.out, 0) + (sp.made || 0);
  // two runs of one species: this world's by its serial, a stranger's by its card
  const same = (a, b) => (a.card && b.card === a.card) || (!a.stranger && !b.stranger && a.serial === b.serial);
  let seq = state.species.reduce((m, sp) => Math.max(m, sp.id || 0), 0);
  for (const sp of state.species) sp.id ??= ++seq;
  // what comes in joins the run at the tip if it is of its species, else is a run of its own there
  const atTip = (x) => {
    const t = pp.tip;
    if (t && same(t, x)) return t;
    const sp = { ...x, id: ++seq, orgs: [], made: 0 };
    state.species.unshift(sp);
    return sp;
  };
  // b's cells into a, a run nearer the tip (a's leave first: the last organism in leaves first)
  const merge = (a, b) => { a.orgs.unshift(...b.orgs); a.made = (a.made || 0) + (b.made || 0); };
  // runs of one species side by side become one
  function join() {
    const l = state.species;
    for (let i = l.length - 1; i > 0; i--) if (same(l[i - 1], l[i])) { merge(l[i - 1], l[i]); l.splice(i, 1); }
  }
  const remove = (sp) => { const i = state.species.indexOf(sp); if (i >= 0) { state.species.splice(i, 1); join(); } };
  const pp = {
    get species() { return state.species; },
    /** Cells held, in all. */
    get count() { return state.species.reduce((n, sp) => n + cells(sp), 0); },
    cells,
    /** Whether n more cells fit. */
    fits: (n) => pp.count + n <= limit,
    /** Cells drawn up of one species (serial, the genome's words, the slot it lived in, its name): their bodies. */
    add(species, recs) {
      if (recs.length) atTip(species).orgs.push(...bodiesOf(recs));
    },
    /** A card's species loaded: one colony of n cells, made as they leave; false if they do not fit. */
    load(species, n) {
      if (!pp.fits(n)) return false;
      atTip(species).made += n;
      return true;
    },
    /** The run at the tip, or null. */
    get tip() { return state.species[0] || null; },
    /** The run with this id. */
    run: (id) => state.species.find((sp) => sp.id === id),
    /** Move a run to place i in the strip (0: the tip); it joins a run of its species it comes next to. */
    move(sp, i) {
      const k = state.species.indexOf(sp);
      if (k < 0) return;
      state.species.splice(k, 1);
      state.species.splice(Math.max(0, Math.min(i, state.species.length)), 0, sp);
      join();
    },
    /** Every species' runs as one, where the one nearest the tip was (each's cells in the order they were in). */
    sort() {
      const out = [];
      for (const sp of state.species) { const a = out.find((o) => same(o, sp)); if (a) merge(a, sp); else out.push(sp); }
      state.species.splice(0, state.species.length, ...out);
    },
    /** Whether a species has more than one run. */
    get mixed() { return state.species.some((sp, i) => state.species.findIndex((o) => same(o, sp)) !== i); },
    /**
     * The next k cells of species sp to leave the tip, organism by organism from the last in (the nearest the tip),
     * then a card's newborns: [{ sp, org, from, n } or { sp, made: n }], empty if it holds none.
     */
    next(sp = pp.tip, k = 1) {
      const out = [];
      if (!sp) return out;
      for (let i = sp.orgs.length - 1; i >= 0 && k > 0; i--) {
        const org = sp.orgs[i], n = Math.min(k, org.cells.length - org.out);
        out.push({ sp, org, from: org.out, n });
        k -= n;
      }
      if (k > 0 && sp.made) out.push({ sp, made: Math.min(k, sp.made) });
      return out;
    },
    /** What left of a `next`: placed of its cells, with their new IDs. */
    left({ sp, org, made }, placed, ids = []) {
      if (org) {
        org.ids.push(...ids.slice(0, placed));
        org.out += placed;
        if (org.out >= org.cells.length) sp.orgs.splice(sp.orgs.indexOf(org), 1);
      } else if (made) sp.made -= Math.min(made, placed);
      if (!cells(sp)) remove(sp);
    },
  };
  return pp;
}

/**
 * One set-down of several `next`s' jobs (setDownJob), of one species or of runs one after another: their cells in
 * turn, as many of them as their cells out before fit in PIPE_IDS and their species in PIPE_SP; { job, used } (how
 * many of them it holds). job.of: the run (a pipette species) of each of job.species.
 */
export function mergeJobs(jobs) {
  const job = { species: [], of: [], cells: [], earlier: [], bonds: [] };
  let used = 0;
  for (const j of jobs) {
    if (used && job.earlier.length + j.earlier.length > PIPE_IDS) break;
    let k = job.of.indexOf(j.of);
    if (k < 0) { if (job.of.length >= PIPE_SP) break; k = job.of.push(j.of) - 1; job.species.push(j.species); }
    const c0 = job.cells.length, e0 = job.earlier.length, ref = (r) => (r < PIPE_EARLIER ? r + c0 : r + e0);
    job.cells.push(...j.cells.map((c) => ({ ...c, sp: k })));
    job.earlier.push(...j.earlier);
    job.bonds.push(...j.bonds.map(([a, b, q]) => [ref(a), ref(b), q]));
    used++;
  }
  return { job, used };
}

/**
 * The engine's set-down job for some cells leaving the tip (one of a `next`): placed(k) gives cell k's offset and velocity
 * [dx, dy, vx, vy]; newborn(sp) a made cell's [energy, col, info]. Each cell keeps again the bonds it kept, to cells
 * out before (by their IDs) or leaving with it, and each cell out before that kept one of these keeps it again.
 */
export function setDownJob(it, placed, newborn) {
  const species = { words: it.sp.words, slot: it.sp.slot, stranger: !!it.sp.stranger }, of = it.sp;
  if (!it.org) {
    return { species, of, cells: Array.from({ length: it.made }, (_, k) => { const [energy, col, info] = newborn(it.sp); const [dx, dy, vx, vy] = placed(k); return { sp: 0, dx, dy, vx, vy, energy, age: 0, col, info }; }), earlier: [], bonds: [] };
  }
  const { org, from, n } = it, earlier = [], eIdx = new Map(), bonds = [];
  const ref = (j) => {
    if (j >= from) return j - from;
    if (!eIdx.has(j) && earlier.length < PIPE_IDS && org.ids[j] != null) { eIdx.set(j, earlier.length); earlier.push(org.ids[j]); }
    return eIdx.has(j) ? PIPE_EARLIER + eIdx.get(j) : -1;
  };
  const link = (a, b, q) => { const ra = ref(a), rb = ref(b); if (ra >= 0 && rb >= 0) bonds.push([ra, rb, q]); };
  const cells = [];
  for (let k = 0; k < n; k++) {
    const c = org.cells[from + k], [dx, dy, vx, vy] = placed(k);
    cells.push({ sp: 0, dx, dy, vx, vy, energy: c[0], age: c[1], col: c[2], info: c[3] });
    for (let q = 0; q < 2; q++) if (c[4 + q] >= 0 && c[4 + q] < from + n) link(from + k, c[4 + q], q);
  }
  for (let j = 0; j < from; j++) for (let q = 0; q < 2; q++) { const p = org.cells[j][4 + q]; if (p >= from && p < from + n) link(j, p, q); }
  return { species, of, cells, earlier, bonds };
}
