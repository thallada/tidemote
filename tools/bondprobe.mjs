// How many bonds the bond table drops: a world run headless (Dawn), then its bond table read back. Counts
// cells kept by more than the three the table holds, and the kept bonds whose partner does not hold
// them back (they pull neither way).
//   tools/gpu-node.sh tools/bondprobe.mjs --n 32768 --minutes 10 --seed 1 [--k '{...}']
import { parseArgs } from 'node:util';
import { runHeadless } from '../src/headless.js';
const { values: v } = parseArgs({ options: { n: { type: 'string', default: '32768' }, minutes: { type: 'string', default: '10' }, seed: { type: 'string', default: '1' }, k: { type: 'string', default: '{}' }, step: { type: 'string', default: '1' } } });
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const config = { n: +v.n, minutes: +v.minutes, seed: +v.seed, k: JSON.parse(v.k), eras: true, sample: 30, print: 1e9, step: +v.step };
await runHeadless(device, config, { print: () => {}, snapshot: async (eng) => {
  const N = eng.count, W = 6;
  const rd = device.createBuffer({ size: N * W * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(eng.b.bondsNow, 0, rd, 0, N * W * 4); device.queue.submit([enc.finish()]);
  await rd.mapAsync(GPUMapMode.READ);
  const t = new Uint32Array(rd.getMappedRange().slice(0)); rd.unmap();
  const ok = (j, i) => j < N && j !== i;
  let bonded = 0, over = 0, keptBonds = 0, oneSided = 0; const hist = {};
  for (let i = 0; i < N; i++) {
    const c = t[i * W + 2], k1 = ok(t[i * W], i), k2 = ok(t[i * W + 1], i);
    if (k1 || k2 || c) { bonded++; hist[c] = (hist[c] || 0) + 1; }
    if (c > 3) over++;
    for (const j of [t[i * W], t[i * W + 1]]) {
      if (!ok(j, i)) continue;
      keptBonds++;
      const cj = Math.min(t[j * W + 2], 3);
      let back = t[j * W] === i || t[j * W + 1] === i;
      for (let q = 0; q < cj; q++) back ||= t[j * W + 3 + q] === i;
      if (!back) oneSided++;
    }
  }
  console.log(JSON.stringify({ seed: +v.seed, minutes: +v.minutes, cells: N, bonded, overThree: over, overShare: +(over / bonded).toFixed(4), keptBonds, oneSided, oneSidedShare: +(oneSided / keptBonds).toFixed(4), keepersHist: hist }));
} });
device.destroy();
