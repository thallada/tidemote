// The will lab (K.beatWill, docs/growth.md, A beat at will): grow a world headless (Dawn) and look every --every
// simulated seconds at the cells of beating bodies (trees and tailed bodies of species that beat): how their will to
// beat is spread (resting, part, full), by guild, against their energy, and how fast the resting and the beating move.
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

async function look(eng) {
  const pb = eng.count * P_BYTES, gb = MAXK * G_BYTES;
  const buf = device.createBuffer({ size: pb + gb, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(eng.b.parts, 0, buf, 0, pb);
  enc.copyBufferToBuffer(eng.b.genomes, 0, buf, pb, gb);
  device.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const ab = buf.getMappedRange().slice(0);
  buf.unmap(); buf.destroy();
  const f = new Float32Array(ab, 0, pb / 4), u = new Uint32Array(ab, 0, pb / 4);
  const gu = new Uint32Array(ab, pb, gb / 4), gf = new Float32Array(ab, pb, gb / 4);
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
    const w = ((u[o + 9] >>> 24) & 15) / 15, band = w < 0.1 ? 'rest' : w < 0.7 ? 'part' : 'full';
    out.beaters++; out[band]++;
    const gd = dietGuild(g);
    const G = (out.guild[gd] ||= { n: 0, will: 0, rest: 0 });
    G.n++; G.will += w; if (band === 'rest') G.rest++;
    const fill = Math.min(4, Math.floor(f[o + 5] / Math.max(divEnergy(g, K), 0.01) * 4));
    fills[fill][0]++; fills[fill][1] += w;
    if (tree || tailCell) { const s = Math.hypot(f[o + 2], f[o + 3]); out.speed[band][0]++; out.speed[band][1] += s; }
  }
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
        + ` | ${Object.entries(L.guild).map(([k, G]) => `${k} ${G.n} will ${G.will} rest ${G.rest}`).join(', ')}`);
      if (v.out) fs.writeFileSync(v.out, JSON.stringify({ n: config.n, k: config.k, seed: config.seed, looks }));
    } },
  });
} finally {
  device.destroy();
}
process.exit(0);
