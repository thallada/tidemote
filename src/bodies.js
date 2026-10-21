// The mix of body types among the living: every living cell's body rebuilt from its kept bonds
// (intent.z/w, same kind), each body classed and counted by guild. Pure: the raw buffers of a saved world
// or of eng.readState(). tools/bodies.mjs reads a saved world; headless runs sample it (morphMix).
import { readGenome, dietGuild } from './genome.js';
import { FIRST_LIFE, MAXK, DEFAULT_K } from './shaders.js';

const NONE = 0xffffffff;
const PW = 10; // Particle words

/** Body census of one world: { living, guilds: {g: {cells, kinds: {type: cells}}}, bodies: {type: {n, cells, sizes}} }. */
export function bodyCensus(cpu, gpu) {
  const count = cpu.count;
  const pu = new Uint32Array(gpu.parts), pf = new Float32Array(gpu.parts), it = new Uint32Array(gpu.intent);
  const gu = new Uint32Array(gpu.genomes), gf = new Float32Array(gpu.genomes);
  const genomes = new Map();
  const genomeOf = (k) => { if (!genomes.has(k)) genomes.set(k, readGenome(gu, gf, k)); return genomes.get(k); };
  const alive = (i) => { const k = pu[i * PW + 4]; return k >= FIRST_LIFE && k < MAXK; };
  // union-find over bonds between living cells of one kind
  const par = new Int32Array(count).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const kids = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (!alive(i)) continue;
    for (const j of [it[i * 4 + 2], it[i * 4 + 3]]) {
      if (j === NONE || j >= count || j === i || !alive(j) || pu[j * PW + 4] !== pu[i * PW + 4]) continue;
      par[find(i)] = find(j);
      if (j === it[i * 4 + 2]) kids[j]++;
    }
  }
  const bodies = new Map();
  let living = 0;
  for (let i = 0; i < count; i++) {
    if (!alive(i)) continue;
    living++;
    const r = find(i);
    let b = bodies.get(r);
    if (!b) bodies.set(r, (b = { kind: pu[i * PW + 4], n: 0, branch: 0, tail: 0 }));
    b.n++; if (kids[i] > 1) b.branch++;
    // (branch order 2 in a packed body's cell: a tail's)
    if (pu[i * PW + 9] >>> 30 === 2) b.tail++;
  }
  const out = { living, guilds: {}, bodies: {}, tailCells: 0 };
  for (const b of bodies.values()) {
    const g = genomeOf(b.kind), guild = dietGuild(g);
    const tree = (g.grow?.[0] ?? 0) >= 0.5 && (g.adhesion || 0) > DEFAULT_K.adhMin;
    const type = b.n === 1 ? 'single' : !tree ? (b.tail >= 2 && b.n > b.tail ? 'tailed' : b.n < 6 ? 'clump' : 'mat')
      : `${b.branch ? 'branched' : 'chain'} ${b.n < 6 ? '2-5' : b.n < 20 ? '6-19' : '20+'}`;
    const G = (out.guilds[guild] ||= { cells: 0, kinds: {} });
    G.cells += b.n; G.kinds[type] = (G.kinds[type] || 0) + b.n;
    if (!tree) out.tailCells += b.tail;
    const B = (out.bodies[type] ||= { n: 0, cells: 0, max: 0 });
    B.n++; B.cells += b.n; B.max = Math.max(B.max, b.n);
  }
  return out;
}


/**
 * The body-type mix as shares of the living: single cells, clumps (2-5, packed bodies), mats (6+), tailed
 * (packed bodies with a tail of 2+ cells),
 * chains (trees of 2-5), filaments (unbranched trees of 6+), branched trees (6+); long: trees of 20+;
 * trees6: bodies of trees with 6+ cells; maxTree: the largest tree's cells.
 */
export function morphMix(c) {
  const share = (pred) => Object.entries(c.bodies).filter(([t]) => pred(t)).reduce((a, [, B]) => a + B.cells, 0) / Math.max(c.living, 1);
  let trees6 = 0, maxTree = 0;
  for (const [t, B] of Object.entries(c.bodies)) if (t.startsWith('chain') || t.startsWith('branched')) { maxTree = Math.max(maxTree, B.max); if (!t.endsWith('2-5')) trees6 += B.n; }
  return { single: share((t) => t === 'single'), clump: share((t) => t === 'clump'), mat: share((t) => t === 'mat'), tailed: share((t) => t === 'tailed'),
    chain: share((t) => t.startsWith('chain 2-5') || t.startsWith('branched 2-5')), filament: share((t) => t.startsWith('chain') && !t.endsWith('2-5')),
    branched: share((t) => t.startsWith('branched') && !t.endsWith('2-5')), long: share((t) => t.endsWith('20+')), trees6, maxTree,
    tailCells: (c.tailCells || 0) / Math.max(c.living, 1) };
}
