// The will lab (K.beatWill, docs/growth.md, A beat at will): grow a world headless (Dawn) and look every --every
// simulated seconds at the cells of beating bodies (trees and tailed bodies of species that beat): how their will to
// beat is spread (resting, part, full), by guild, against their energy, and how fast the resting and the beating move.
// By body too (bonded components of one species): how many rest (every cell at 0), beat partway or fully (mean will),
// how far a body's cells differ from its mean (a body beats as one), and how many bodies changed state since the last
// look (start or stop: bouts by chance, body by body).
//   tools/gpu-node.sh tools/willlab.mjs --n 16384 --minutes 10 --every 30 --seed 1 --k '{}' [--out runs/will/x.json]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { runHeadless } from '../src/headless.js';
import { refuseSoftware } from './adapter.mjs';
import { P_BYTES, G_BYTES, MAXK, FIRST_LIFE, CYST, DEFAULT_K } from '../src/shaders.js';
import { readGenome, dietGuild, growPlan, divEnergy } from '../src/genome.js';

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
let lastState = new Map(); // a cell id -> whether its body was beating at the last look

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
  const beaters = [];
  const PW = P_BYTES / 4, gs = new Map();
  const genome = (k) => { if (!gs.has(k)) gs.set(k, readGenome(gu, gf, k)); return gs.get(k); };
  const out = { t: Math.round(eng.simTime), living: 0, beaters: 0, rest: 0, part: 0, full: 0, guild: {}, byFill: [], speed: { rest: [0, 0], part: [0, 0], full: [0, 0] } };
  const fills = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
  for (let i = 0; i < eng.count; i++) {
    const o = i * PW, kind = u[o + 4];
    if (kind < FIRST_LIFE || kind >= MAXK || (u[o + 9] & 15) === CYST) continue;
    out.living++;
    const g = genome(kind);
    if (!((g.beat?.[0] ?? 0) > 0.05) || !((g.adhesion || 0) > K.adhMin)) continue;
    const tree = !!growPlan(g, K), tailCell = u[o + 9] >>> 30 === 2;
    if (!tree && !((g.tail?.[0] ?? 0) > 0)) continue;
    const w = ((u[o + 9] >>> 24) & 15) / 15, band = w === 0 ? 'rest' : w < 0.7 ? 'part' : 'full';
    beaters.push(i);
    out.beaters++; out[band]++;
    const gd = dietGuild(g);
    const G = (out.guild[gd] ||= { n: 0, will: 0, rest: 0 });
    G.n++; G.will += w; if (band === 'rest') G.rest++;
    const fill = Math.min(4, Math.floor(f[o + 5] / Math.max(divEnergy(g, K), 0.01) * 4));
    fills[fill][0]++; fills[fill][1] += w;
    if (tree || tailCell) { const s = Math.hypot(f[o + 2], f[o + 3]); out.speed[band][0]++; out.speed[band][1] += s; }
  }
  // bodies: bonded components of beating cells of one species
  const root = new Map(), find = (j) => { while (root.get(j) !== j) { root.set(j, root.get(root.get(j))); j = root.get(j); } return j; };
  for (const i of beaters) root.set(i, i);
  for (const i of beaters) for (const m of [iu[i * 4 + 2], iu[i * 4 + 3]]) if (root.has(m) && u[m * PW + 4] === u[i * PW + 4]) root.set(find(i), find(m));
  const bodies = new Map();
  for (const i of beaters) { const r = find(i), w = ((u[i * PW + 9] >>> 24) & 15) / 15; const B = bodies.get(r) || bodies.set(r, { n: 0, s: 0, s2: 0, ids: [] }).get(r); B.n++; B.s += w; B.s2 += w * w; B.ids.push(u[i * PW + 7]); }
  const bb = { bodies: 0, rest: 0, part: 0, full: 0, spread: 0, changed: 0, seen: 0 }, now = new Map();
  for (const B of bodies.values()) {
    if (B.n < 3) continue;
    const m = B.s / B.n; bb.bodies++; bb[m === 0 ? 'rest' : m < 0.7 ? 'part' : 'full']++;
    bb.spread += Math.sqrt(Math.max(0, B.s2 / B.n - m * m));
    const on = m > 0; let was = null;
    for (const id of B.ids) { now.set(id, on); if (was === null && lastState.has(id)) was = lastState.get(id); }
    if (was !== null) { bb.seen++; if (was !== on) bb.changed++; }
  }
  bb.spread = bb.bodies ? +(bb.spread / bb.bodies).toFixed(3) : null;
  lastState = now;
  out.bodies = bb;
  for (const G of Object.values(out.guild)) { G.will = +(G.will / G.n).toFixed(2); G.rest = +(G.rest / G.n).toFixed(2); }
  out.byFill = fills.map(([n, w]) => (n ? +(w / n).toFixed(2) : null));
  for (const b of ['rest', 'part', 'full']) { const [n, s] = out.speed[b]; out.speed[b] = n ? +(s / n).toFixed(3) : null; }
  return out;
}

try {
  const perSec = Math.round(60 / config.step);
  await runHeadless(device, config, {
    print: (l) => console.log(`[${v.seed}] ${l}`),
    tap: { every: Math.round(+v.every * perSec), fn: async (eng) => {
      const L = await look(eng);
      looks.push(L);
      const pct = (x) => (L.beaters ? Math.round(100 * x / L.beaters) : 0);
      console.log(`[${v.seed}] t=${L.t}s beaters ${L.beaters}/${L.living}: rest ${pct(L.rest)}% part ${pct(L.part)}% full ${pct(L.full)}%`
        + ` | will by E/divE (0-.25,..,1+) ${L.byFill.join(' ')} | speed rest/part/full ${L.speed.rest} ${L.speed.part} ${L.speed.full}`
        + ` | bodies ${L.bodies.bodies}: rest ${L.bodies.rest} part ${L.bodies.part} full ${L.bodies.full}, spread in a body ${L.bodies.spread}, changed ${L.bodies.changed}/${L.bodies.seen}`
        + ` | ${Object.entries(L.guild).map(([k, G]) => `${k} ${G.n} will ${G.will} rest ${G.rest}`).join(', ')}`);
      if (v.out) fs.writeFileSync(v.out, JSON.stringify({ n: config.n, k: config.k, seed: config.seed, looks }));
    } },
  });
} finally {
  device.destroy();
}
process.exit(0);
