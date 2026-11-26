// The jelly lab (K.sheath, docs/ecosystem.md, Jelly): grow a world headless (Dawn) and look every --every simulated
// seconds at its jelly bodies and the cells about them. How many producers' cells live in jelly (a sheathed species'
// bonded, loose body, the wall contactMain holds strangers off with), in how many bodies; how many eaters may pierce
// it (and how many are hungry, so piercing now); and how many strangers' cells are inside a hull (a cell's center
// nearer a jelly cell of another species than sheathHull): piercers, hungry piercers, others. With K.sheath 0 the
// same counts show how far strangers mix into jelly bodies when nothing holds them off.
//   tools/gpu-node.sh tools/jellylab.mjs --n 16384 --minutes 10 --every 30 --seed 1 --k '{}' [--step 1] [--out runs/jelly/x.json]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { runHeadless } from '../src/headless.js';
import { refuseSoftware } from './adapter.mjs';
import { P_BYTES, G_BYTES, MAXK, FIRST_LIFE, CYST, DEFAULT_K } from '../src/shaders.js';
import { readGenome, dietGuild, growPlan, sheathOf, pierceOf, divEnergy } from '../src/genome.js';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '16384' }, minutes: { type: 'string', default: '10' }, every: { type: 'string', default: '30' },
  seed: { type: 'string', default: '1' }, k: { type: 'string', default: '{}' }, step: { type: 'string', default: '1' },
  out: { type: 'string' }, cpu: { type: 'boolean' },
} });
const K = { ...DEFAULT_K, ...JSON.parse(v.k) };
const config = { n: +v.n, minutes: +v.minutes, seed: +v.seed, k: JSON.parse(v.k), eras: true, sample: 5, print: 600, step: +v.step };
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
config.adapter = refuseSoftware(adapter, v.cpu);
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const looks = [];
const NONE = 0xffffffff;

async function look(eng) {
  const pb = eng.count * P_BYTES, gb = MAXK * G_BYTES, ib = eng.count * 16;
  const buf = device.createBuffer({ size: pb + gb + ib, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(eng.b.parts, 0, buf, 0, pb);
  enc.copyBufferToBuffer(eng.b.genomes, 0, buf, pb, gb);
  enc.copyBufferToBuffer(eng.b.intent, 0, buf, pb + gb, ib);
  device.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const ab = buf.getMappedRange().slice(0);
  buf.unmap(); buf.destroy();
  const f = new Float32Array(ab, 0, pb / 4), u = new Uint32Array(ab, 0, pb / 4);
  const gu = new Uint32Array(ab, pb, gb / 4), gf = new Float32Array(ab, pb, gb / 4), iu = new Uint32Array(ab, pb + gb, ib / 4);
  const PW = P_BYTES / 4, gs = new Map();
  const genome = (k) => { if (!gs.has(k)) gs.set(k, readGenome(gu, gf, k)); return gs.get(k); };
  const [W, H] = eng.size;
  const out = { t: Math.round(eng.simTime), living: 0, producers: 0, jellyCells: 0, jellyBodies: 0, eaters: 0, piercers: 0, hungryPiercers: 0,
    inside: { piercer: 0, hungry: 0, other: 0, otherProducer: 0 }, jellySpecies: 0, pierceSpecies: 0 };
  const jelly = [], living = [];
  const spJ = new Set(), spP = new Set();
  for (let i = 0; i < eng.count; i++) {
    const o = i * PW, kind = u[o + 4];
    if (kind < FIRST_LIFE || kind >= MAXK || (u[o + 9] & 15) === CYST) continue;
    out.living++;
    living.push(i);
    const g = genome(kind);
    const guild = dietGuild(g);
    if (guild === 'producer') out.producers++; else out.eaters++;
    if (pierceOf(g)) { out.piercers++; spP.add(kind); if (f[o + 5] < divEnergy(g, K) * K.sated) out.hungryPiercers++; }
    const bonded = iu[i * 4 + 2] !== NONE || iu[i * 4 + 3] !== NONE;
    const tight = ((g.adhesion || 0) - K.tightFrom) / K.tightSpan;
    const tailCell = !growPlan(g, K) && (g.tail?.[0] ?? 0) > 0 && u[o + 9] >>> 30 === 2;
    if (sheathOf(g) && bonded && (g.adhesion || 0) > K.adhMin && !growPlan(g, K) && !tailCell && tight <= 0.9) { jelly.push(i); spJ.add(kind); }
  }
  out.jellyCells = jelly.length; out.jellySpecies = spJ.size; out.pierceSpecies = spP.size;
  // bodies: bonded components of jelly cells of one species
  const root = new Map(), find = (j) => { while (root.get(j) !== j) { root.set(j, root.get(root.get(j))); j = root.get(j); } return j; };
  for (const i of jelly) root.set(i, i);
  for (const i of jelly) for (const m of [iu[i * 4 + 2], iu[i * 4 + 3]]) if (root.has(m) && u[m * PW + 4] === u[i * PW + 4]) root.set(find(i), find(m));
  const roots = new Set(); for (const i of jelly) roots.add(find(i));
  out.jellyBodies = roots.size;
  // strangers inside a hull: a grid of half units over the jelly cells
  const cell = 0.5, gx = Math.ceil(W / cell), grid = new Map();
  for (const i of jelly) { const k = Math.floor(f[i * PW] / cell) + gx * Math.floor(f[i * PW + 1] / cell); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  const hull = K.sheathHull, h2 = hull * hull, gy = Math.ceil(H / cell);
  for (const i of living) {
    const o = i * PW, x = f[o], y = f[o + 1], kind = u[o + 4];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) {
      const L = grid.get(((cx + dx + gx) % gx) + gx * ((cy + dy + gy) % gy));
      if (!L) continue;
      for (const j of L) {
        if (u[j * PW + 4] === kind) continue;
        let ex = f[j * PW] - x, ey = f[j * PW + 1] - y;
        ex -= W * Math.round(ex / W); ey -= H * Math.round(ey / H);
        if (ex * ex + ey * ey < h2) { hit = true; break; }
      }
    }
    if (!hit) continue;
    const g = genome(kind);
    if (pierceOf(g)) out.inside[f[o + 5] < divEnergy(g, K) * K.sated ? 'hungry' : 'piercer']++;
    else { out.inside.other++; if (dietGuild(g) === 'producer') out.inside.otherProducer++; }
  }
  return out;
}

try {
  const perSec = Math.round(60 / config.step);
  await runHeadless(device, config, {
    print: (l) => console.log(`[${v.seed}] ${l}`),
    tap: { every: Math.round(+v.every * perSec), fn: async (eng) => {
      const L = await look(eng);
      looks.push(L);
      const pc = (a, b) => (b ? Math.round(100 * a / b) : 0);
      console.log(`[${v.seed}] t=${L.t}s living ${L.living}: jelly ${L.jellyCells} cells (${pc(L.jellyCells, L.producers)}% of producers, ${L.jellySpecies} sp, ${L.jellyBodies} bodies)`
        + ` | piercers ${L.piercers} (${pc(L.piercers, L.eaters)}% of eaters, ${L.pierceSpecies} sp), hungry ${L.hungryPiercers}`
        + ` | inside a hull: hungry piercers ${L.inside.hungry}, fed piercers ${L.inside.piercer}, others ${L.inside.other} (producers ${L.inside.otherProducer})`);
      if (v.out) fs.writeFileSync(v.out, JSON.stringify({ n: config.n, k: config.k, seed: config.seed, step: config.step, looks }));
    } },
  });
} finally {
  device.destroy();
}
process.exit(0);
