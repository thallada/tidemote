// The reef lab: grow a world headless (Dawn) and record where its stone lies as it runs: every --every simulated
// minutes, each grain of reef stone and bedrock and each calcifying living cell, to OUT/seedS.json, for
// tools/reeflab.py (maps, and how reefs are spaced and shaped: patch counts, sizes, spacing regularity, outline).
//   tools/gpu-node.sh tools/reeflab.mjs --n 32768 --minutes 30 --every 5 --seed 1 --k '{}' --out runs/reef/NAME
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { runHeadless } from '../src/headless.js';
import { refuseSoftware } from './adapter.mjs';
import { P_BYTES, G_BYTES, MAXK, FIRST_LIFE, STONE, DEFAULT_K } from '../src/shaders.js';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '32768' }, minutes: { type: 'string', default: '30' }, every: { type: 'string', default: '5' },
  seed: { type: 'string', default: '1' }, k: { type: 'string', default: '{}' }, step: { type: 'string', default: '1' },
  out: { type: 'string', default: 'runs/reef/x' }, cpu: { type: 'boolean' },
} });
fs.mkdirSync(v.out, { recursive: true });
const config = { n: +v.n, minutes: +v.minutes, seed: +v.seed, k: JSON.parse(v.k), eras: true, sample: 5, print: 600, step: +v.step };
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
config.adapter = refuseSoftware(adapter, v.cpu);
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const frames = [];
const q = (x) => Math.round(x * 100) / 100;

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
  const f = new Float32Array(ab, 0, pb / 4), u = new Uint32Array(ab, 0, pb / 4), gf = new Float32Array(ab, pb, gb / 4);
  const PW = P_BYTES / 4, GW = G_BYTES / 4;
  const reef = [], bed = [], calc = [];
  for (let i = 0; i < eng.count; i++) {
    const o = i * PW, kind = u[o + 4], x = q(f[o]), y = q(f[o + 1]);
    if (kind === STONE) ((u[o + 9] & 15) !== 0 ? reef : bed).push(x, y);
    else if (kind >= FIRST_LIFE && kind < MAXK && gf[kind * GW + 45] > 0.05) calc.push(x, y);
  }
  return { t: Math.round(eng.simTime), reef, bed, calc };
}

try {
  const perMinute = Math.round(3600 / config.step);
  await runHeadless(device, config, {
    print: (l) => console.log(`[${v.seed}] ${l}`),
    tap: { every: Math.round(+v.every * perMinute), fn: async (eng) => {
      const fr = await look(eng);
      frames.push(fr);
      console.log(`[${v.seed}] t=${fr.t}s reef ${fr.reef.length / 2} bedrock ${fr.bed.length / 2} calcifiers ${fr.calc.length / 2}`);
      fs.writeFileSync(path.join(v.out, `seed${v.seed}.json`), JSON.stringify({ grid: eng.grid, n: config.n, k: config.k, ground: { ...DEFAULT_K, ...config.k }.reefGround, rockSeed: eng.rock[2], frames }));
    } },
  });
} finally {
  device.destroy();
}
process.exit(0);
