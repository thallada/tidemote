// The swim lab's test bodies (tools/swimlab.mjs, tools/swimlab-film.mjs): a genome and a layout, cell by cell.
import { archetypeGenome, finalizeGenome, growPlan } from '../src/genome.js';

// the test genome: a hunter founder made into a tree that beats, then the overrides
export function testGenome(over, K) {
  let s = 99; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const g = archetypeGenome('hunter', r, K);
  Object.assign(g, { adhesion: 0.6, swim: 0, size: 1, drag: 0.08, advect: 0.8, force: 4, photo: 0, align: 0, lifespan: 1e6,
    beat: [0.4, 1.5, 0.6, 1], grow: [1, 0.3, 0, 0.5, 0, 0], mutRate: 0, thermo: 0 }, over);
  return finalizeGenome(g, K);
}

// layouts: cells as { mom, turn } in budding order (mom -1: the root)
export function layout(spec) {
  const [kind, a, b] = spec.split(':');
  const n = +a || 12;
  const cells = [{ mom: -1, turn: 0 }];
  if (kind === 'filament') for (let i = 1; i < n; i++) cells.push({ mom: i - 1, turn: 0 });
  else if (kind === 'branch') {
    // a main axis of n cells with side branches of b cells every e cells, alternately left and right
    const e = +b || 3, len = +spec.split(':')[3] || 2;
    let axis = 0, side = 1;
    for (let i = 1; i < n; i++) {
      cells.push({ mom: axis, turn: 0 }); const me = cells.length - 1;
      if (i % e === 0) { let m = me; for (let q = 0; q < len; q++) { cells.push({ mom: m, turn: q ? 0 : side }); m = cells.length - 1; } side = 3 - side; }
      axis = me;
    }
  }
  else if (kind === 'mat') {
    // a packed body of n cells (a hexagonal patch, each cell bonded to two earlier neighbors), then
    // tails of b cells from its edge (mat:N:TAILLEN:TAILS)
    const tails = +(spec.split(':')[3] ?? 1);
    cells.length = 0;
    const gap = 0.153, P = [];
    for (let ring = 0, made = 0; made < n; ring++) {
      for (let q = -ring; q <= ring && made < n; q++) for (let r = -ring; r <= ring && made < n; r++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) !== ring) continue;
        P.push([gap * (q + r / 2), gap * r * 0.866]); made++;
      }
    }
    P.forEach((p, i) => {
      const near = P.slice(0, i).map((o, j) => [Math.hypot(o[0] - p[0], o[1] - p[1]), j]).sort((x, y) => x[0] - y[0]).filter((x) => x[0] < gap * 1.1);
      cells.push({ mom: near[0]?.[1] ?? -1, mom2: near[1]?.[1] ?? -1, turn: 0, at: p, mat: true });
    });
    // tails from the cells farthest out, spread round
    const out = P.map((p, i) => [Math.atan2(p[1], p[0]), Math.hypot(...p), i]).filter((x) => x[1] > 0.6 * Math.max(...P.map((p) => Math.hypot(...p)))).sort((x, y) => x[0] - y[0]);
    for (let t = 0; t < tails; t++) {
      const [ang, , base] = out[Math.floor(t * out.length / tails)];
      let mom = base;
      for (let q = 0; q < +(b ?? 6); q++) { cells.push({ mom, turn: 0, tail: true, gen: q, at: [P[base][0] + Math.cos(ang) * gap * (q + 1), P[base][1] + Math.sin(ang) * gap * (q + 1)] }); mom = cells.length - 1; }
    }
  }
  else throw new Error(`unknown body ${spec}`);
  return cells;
}

export const turnAngle = (plan, turn, gen) => {
  if (!plan) return 0;
  const pat = plan.pattern;
  const curl = pat === 'zigzag' && (gen & 1) ? -plan.curl : plan.curl;
  const side = (turn === 1 ? 1 : 0) - (turn === 2 ? 1 : 0);
  return curl + side * plan.angle * (pat === 'forking' ? 0.5 : 1);
};


/** Where each cell of a layout sits, at rest at its plan's angles from (x, y), heading -x (root first), and its generation. */
export function placeBody(cells, g, x, y) {
  const plan = growPlan(g);
  const gap = 0.085 * g.size * 2 * 0.95;
  const pos = [], head = [], gen = [];
  cells.forEach((c, i) => {
    if (c.at) { pos.push([x + c.at[0], y + c.at[1]]); head.push(0); gen.push(c.gen ?? 0); return; }
    if (c.mom < 0) { pos.push([x, y]); head.push(0); gen.push(0); return; }
    gen.push(gen[c.mom] + 1);
    const h = (c.mom === 0 && i === 1 ? 0 : head[c.mom]) + turnAngle(plan, c.turn, gen[i]);
    head.push(h);
    pos.push([pos[c.mom][0] + Math.cos(h) * gap, pos[c.mom][1] + Math.sin(h) * gap]);
  });
  return { pos, gen };
}

/** A cell's info word: generation, turn, a tail's branch order 2, born (cause 9). */
export const cellInfo = (c, gen) => (gen << 16) | (c.turn << 28) | (c.tail ? 2 << 30 : 0) | 9;
