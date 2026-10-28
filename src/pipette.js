// The pipette's contents (docs/hand.md): species in the order their first cells came in (the strip reads tip
// first: the first species is the one that leaves next), each with its genome's words and its organisms, a cell or
// a body of bonded cells, as they came out of the world: each cell's offset from the organism's middle, energy,
// age, color and info, and the cells it kept bonds to by index. A species loaded from a card holds colonies not
// yet made (`made`: how many cells to make, as newborns, when they are set down). Pure: the page draws up and sets
// down, and keeps the contents with the world (life.pipette).
export const PIPE_LIMIT = 2048;
const NONE = 0xffffffff;

/** A cell as kept: [dx, dy, energy, age, col, info, bond, bond] (a bond an index in its organism, -1 none). */
const cellOf = (r, dx, dy, bonds) => [dx, dy, r.energy, r.age, r.col, r.info, bonds[0], bonds[1]];

export function createPipette(state = { species: [] }, limit = PIPE_LIMIT) {
  const cells = (sp) => sp.orgs.reduce((n, o) => n + o.cells.length, 0) + (sp.made || 0);
  const pp = {
    state, limit,
    get species() { return state.species; },
    /** Cells held, in all. */
    get count() { return state.species.reduce((n, sp) => n + cells(sp), 0); },
    cells,
    /** Whether n more cells fit. */
    fits: (n) => pp.count + n <= limit,
    /**
     * An organism drawn up: the records taken at the tip (the engine's onTaken: kind, energy, age, id, col, info,
     * partners by ID), the shape it had (offsets by ID, from the body traced as the pull began), and its species
     * (serial, the genome's words, the slot it lived in, its name). Bonds to cells that did not come are dropped.
     */
    add(species, taken, shape) {
      if (!taken.length) return null;
      const at = new Map(taken.map((r, i) => [r.id, i]));
      const org = { cells: taken.map((r) => {
        const [dx, dy] = shape.get(r.id) || [0, 0];
        return cellOf(r, dx, dy, r.partners.map((p) => (p !== NONE && at.has(p) ? at.get(p) : -1)));
      }) };
      let sp = state.species.find((x) => x.serial === species.serial && !x.stranger);
      if (!sp) state.species.push((sp = { ...species, orgs: [] }));
      sp.orgs.push(org);
      return org;
    },
    /** A card's species loaded: one colony of n cells, made as they are set down; false if they do not fit. */
    load(species, n) {
      if (!pp.fits(n)) return false;
      let sp = state.species.find((x) => x.card && x.card === species.card);
      if (!sp) state.species.push((sp = { ...species, orgs: [], made: 0 }));
      sp.made = (sp.made || 0) + n;
      return true;
    },
    /** The species at the tip, or null. */
    get tip() { return state.species[0] || null; },
    /** Bring a species to the tip. */
    toTip(sp) { const i = state.species.indexOf(sp); if (i > 0) { state.species.splice(i, 1); state.species.unshift(sp); } },
    /**
     * The next organism of species sp to set down (its last in: the nearest the tip), or for a card's species a
     * colony of up to `colony` newborns: { sp, cells } (cells as kept), or null.
     */
    next(sp = pp.tip, colony = 1) {
      if (!sp) return null;
      if (sp.orgs.length) return { sp, org: sp.orgs[sp.orgs.length - 1], cells: sp.orgs[sp.orgs.length - 1].cells };
      if (sp.made) return { sp, made: Math.min(sp.made, colony), cells: null };
      return null;
    },
    /** What was set down of a `next`: placed of its cells (the rest stay, bonds to the placed dropped). */
    placed({ sp, org, made }, placed) {
      if (org) {
        if (placed >= org.cells.length) sp.orgs.splice(sp.orgs.indexOf(org), 1);
        else {
          org.cells = org.cells.slice(placed).map((c) => c.map((v, i) => (i >= 6 && v >= 0 ? (v >= placed ? v - placed : -1) : v)));
        }
      } else if (made) sp.made -= Math.min(made, placed);
      if (!cells(sp)) state.species.splice(state.species.indexOf(sp), 1);
    },
    /** Every organism of a species, in one job's cells (the strip's card dragged onto the world): [{ org | made }]. */
    all(sp) { return [...sp.orgs.map((org) => ({ sp, org, cells: org.cells })), ...(sp.made ? [{ sp, made: sp.made, cells: null }] : [])]; },
    remove(sp) { const i = state.species.indexOf(sp); if (i >= 0) state.species.splice(i, 1); },
    clear() { state.species.length = 0; },
  };
  return pp;
}

/**
 * The engine's set-down job for organisms of the pipette (from next() or all()): their cells laid out around the
 * point, each organism in its shape, side by side if several; newborns (made) as a pocket of single cells.
 * newborn(sp, k): a made cell's [energy, col, info]. Returns { species, cells } for eng.setDown, with each item's
 * share of the cells in order (counts) so what was placed can be told back.
 */
export function setDownJob(items, newborn, rnd = Math.random) {
  const species = [], cells = [], counts = [];
  const spIndex = new Map();
  let ring = 0;
  for (const it of items) {
    if (!spIndex.has(it.sp)) { spIndex.set(it.sp, species.length); species.push({ words: it.sp.words, slot: it.sp.slot, stranger: !!it.sp.stranger }); }
    const j = spIndex.get(it.sp), base = cells.length;
    // organisms after the first are set a little apart, around it
    const a = ring * 2.39996, r = ring ? 0.9 * Math.sqrt(ring) : 0;
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
    ring++;
    if (it.cells) {
      for (const c of it.cells) cells.push({ sp: j, dx: c[0] + ox, dy: c[1] + oy, energy: c[2], age: c[3], col: c[4], info: c[5], bonds: [c[6] >= 0 ? base + c[6] : -1, c[7] >= 0 ? base + c[7] : -1] });
    } else {
      // a pocket of newborns, packed as a founding colony is
      for (let k = 0; k < it.made; k++) {
        const t = rnd() * Math.PI * 2, d = 0.6 * Math.sqrt(it.made / 12) * Math.sqrt(rnd());
        const [energy, col, info] = newborn(it.sp, k);
        cells.push({ sp: j, dx: ox + Math.cos(t) * d, dy: oy + Math.sin(t) * d, energy, age: 0, col, info, bonds: [-1, -1] });
      }
    }
    counts.push(cells.length - base);
  }
  return { species, cells, counts };
}
