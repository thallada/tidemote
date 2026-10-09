// Time one simulation step dispatch by dispatch on a saved world (tools/perf/bench.mjs saves them),
// through Dawn on the real GPU, every repetition from the same moment. For comparing kernel variants
// on identical input; --dump writes the particles after one step, --against compares with a dump.
//
//   tools/gpu-node.sh tools/perf/stepbench.mjs --world runs/perf/worlds/w1m.bin --reps 30
//   tools/gpu-node.sh tools/perf/stepbench.mjs --world ... --src ../tidemote-wt/base/src   # another tree's engine
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';

const { values: v } = parseArgs({ options: {
  world: { type: 'string' }, k: { type: 'string', default: '{}' }, reps: { type: 'string', default: '20' },
  ticks: { type: 'string', default: '1' }, src: { type: 'string' }, dump: { type: 'string' }, against: { type: 'string' },
} });
const src = v.src ? path.resolve(v.src) : fileURLToPath(new URL('../../src/', import.meta.url));
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const { createEngine } = await import(pathToFileURL(path.join(src, 'engine.js')).href);
const { P_BYTES, FIRST_LIFE } = await import(pathToFileURL(path.join(src, 'shaders.js')).href);
const gpu = create(['disable-dawn-features=timestamp_quantization', 'enable-dawn-features=use_dxc']);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
if (adapter.info.architecture === 'software') throw new Error('software adapter: run through tools/gpu-node.sh');
const lim = adapter.limits;
const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query'], requiredLimits: {
  maxStorageBufferBindingSize: Math.min(lim.maxStorageBufferBindingSize, 2 ** 31 - 4), maxBufferSize: Math.min(lim.maxBufferSize, 2 ** 31 - 4), maxStorageBuffersPerShaderStage: 10 } });
device.addEventListener?.('uncapturederror', (e) => console.error(e.error.message));

const buf = fs.readFileSync(v.world);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const head = new Uint32Array(ab, 0, 1)[0];
const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, head)));
const state = { cpu: meta.cpu, gpu: {} };
let at = 4 + head;
for (const [k, size] of meta.sizes) { state.gpu[k] = ab.slice(at, at + size); at += size; }

const eng = await createEngine(device, 'rgba8unorm', { hasTimestamps: true, K: JSON.parse(v.k) });
if (!(await eng.allocate(meta.cpu.count))) throw new Error('allocation failed');
eng.writeState(state);
const keep = eng.snapshot();
const dt = +v.ticks / 60;
// warm up, then every repetition from the saved moment
for (let i = 0; i < 3; i++) await eng.profileStep(dt);
const reps = +v.reps, per = {};
for (let r = 0; r < reps; r++) {
  eng.restore(keep);
  for (const [k, ms] of await eng.profileStep(dt)) (per[k] ||= []).push(ms);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const out = Object.fromEntries(Object.entries(per).map(([k, a]) => [k, +med(a).toFixed(4)]));
const total = Object.values(out).reduce((a, b) => a + b, 0);
let living = 0;
{
  eng.restore(keep);
  await eng.profileStep(dt);
  const { u32, f32 } = await eng.readParticles();
  for (let i = 0; i < eng.count; i++) if (u32[i * 10 + 4] >= FIRST_LIFE) living++;
  if (v.dump) fs.writeFileSync(v.dump, Buffer.from(u32.buffer));
  if (v.against) {
    const b = fs.readFileSync(v.against), o = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), ou = new Uint32Array(o.buffer, o.byteOffset, o.length);
    // particles move within their grid cell's range every step (an atomic counting sort): match by id
    const W = P_BYTES / 4, byId = new Map();
    for (let i = 0; i < eng.count; i++) byId.set(ou[i * W + 7], i);
    let same = 0, kindDiff = 0, maxPos = 0, sumPos = 0, n = 0;
    for (let i = 0; i < eng.count; i++) {
      const w = i * W, j = byId.get(u32[w + 7]);
      if (j === undefined || ou[j * W + 4] !== u32[w + 4]) { kindDiff++; continue; }
      const x = j * W, dp = Math.hypot(o[x] - f32[w], o[x + 1] - f32[w + 1]);
      if (dp === 0 && o[x + 2] === f32[w + 2] && o[x + 5] === f32[w + 5]) same++;
      if (dp < 1) { maxPos = Math.max(maxPos, dp); sumPos += dp; n++; }
    }
    console.log(`vs dump: identical ${(same / eng.count * 100).toFixed(2)}%, kind differs ${kindDiff}, pos diff mean ${(sumPos / n).toExponential(2)} max ${maxPos.toExponential(2)}`);
  }
}
console.log(JSON.stringify({ count: eng.count, living, total: +total.toFixed(3), ...out }));
device.destroy();
process.exit(0);
