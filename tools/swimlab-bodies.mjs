// The swim lab's test bodies (tools/swimlab.mjs, tools/steplab.mjs, tools/swimlab-film.mjs): a genome and a layout,
// cell by cell, and a world with nothing else in it.
import { archetypeGenome, finalizeGenome, growPlan, writeGenome } from '../src/genome.js';
import { FIRST_LIFE, G_WORDS, P_BYTES } from '../src/shaders.js';

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

/**
 * Seed eng's world empty but for one body (layout spec, genome g) in the middle of still water: no currents or
 * tides, everything else silt heaped at rest in a corner (grow: spread everywhere, so the body can bud).
 * Returns the layout, the world's count and grid, and each cell's slot.
 */
export async function aloneInWater(eng, spec, g, rng, { n, grow = false }) {
  eng.seed(n, { aspect: 16 / 9, rng });
  eng.abio = 0; eng.settings.tide = 0;
  eng.waves.fill(0); eng.tide.fill(0); eng.excursion = 0;
  g.topt = eng.tbg; g.tol = 15;
  const st = await eng.readState();
  const [W, H] = st.cpu.grid;
  const pu = new Uint32Array(st.gpu.parts), pf = new Float32Array(st.gpu.parts), PW = P_BYTES / 4;
  const iu = new Uint32Array(st.gpu.intent);
  const N = st.cpu.count;
  const spread = grow ? 1 : 0.2;
  for (let i = 0; i < N; i++) {
    const o = i * PW;
    pf[o] = 0.5 + rng() * (W - 1) * spread; pf[o + 1] = 0.5 + rng() * (H - 1) * spread; pf[o + 2] = 0; pf[o + 3] = 0;
    pu[o + 4] = 0; pf[o + 5] = 0; pf[o + 6] = 0; pu[o + 8] = 0; pu[o + 9] = 0;
    iu.set([0, 0, 0xffffffff, 0xffffffff], i * 4);
  }
  const gu = new Uint32Array(st.gpu.genomes), gf = new Float32Array(st.gpu.genomes);
  gu.fill(0, FIRST_LIFE * G_WORDS, (FIRST_LIFE + 1) * G_WORDS);
  writeGenome(gu, gf, FIRST_LIFE, g);
  // the body, laid out at rest at its plan's angles from the middle of the water, heading -x (root first)
  const cells = layout(spec);
  const { pos, gen } = placeBody(cells, g, W / 2, H / 2);
  const idx = cells.map((_, i) => N - 1 - i);
  cells.forEach((c, i) => {
    const o = idx[i] * PW;
    pf[o] = pos[i][0]; pf[o + 1] = pos[i][1]; pf[o + 2] = 0; pf[o + 3] = 0;
    pu[o + 4] = FIRST_LIFE; pf[o + 5] = (grow ? 12 : 0.9) * g.reproE; pf[o + 6] = grow ? 20 : 1; pu[o + 7] = 1000000 + i; pu[o + 8] = g.col;
    pu[o + 9] = cellInfo(c, gen[i]);
    iu.set([0, 0, c.mom < 0 ? 0xffffffff : idx[c.mom], c.mom2 >= 0 ? idx[c.mom2] : 0xffffffff], idx[i] * 4);
  });
  eng.writeState(st);
  return { cells, N, W, H, idx };
}
