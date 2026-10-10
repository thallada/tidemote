// The total light of the scene image (before bloom and tone mapping) of a saved world drawn from afar,
// with sprites splatted and as quads: the two should bring the same light.
//   tools/gpu-node.sh tools/perf/lightsum.mjs runs/perf/worlds/w1m.bin
import fs from 'node:fs';
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const { createEngine } = await import('../../src/engine.js');
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
const lim = adapter.limits;
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: Math.min(lim.maxStorageBufferBindingSize, 2 ** 31 - 4), maxBufferSize: Math.min(lim.maxBufferSize, 2 ** 31 - 4), maxStorageBuffersPerShaderStage: 10 } });
const buf = fs.readFileSync(process.argv[2]), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const head = new Uint32Array(ab, 0, 1)[0], meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, head)));
const state = { cpu: meta.cpu, gpu: {} }; let at = 4 + head;
for (const [k, size] of meta.sizes) { state.gpu[k] = ab.slice(at, at + size); at += size; }
const eng = await createEngine(device, 'rgba8unorm', {});
await eng.allocate(meta.cpu.count);
eng.writeState(state);
const W = 1600, H = 900;
// the scene textures must be readable here
const mk = device.createTexture.bind(device);
device.createTexture = (d) => mk({ ...d, usage: d.usage | GPUTextureUsage.COPY_SRC });
eng.resize(W, H);
eng.settings.trails = 0; eng.settings.bloom = 0;
const target = device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
const ppu = Math.max(W / eng.grid[0], H / eng.grid[1]) * +(process.argv[3] || 1);
const cam = { x: eng.grid[0] * 0.37, y: eng.grid[1] * 0.61, ppu };
eng.frame({ target: null, steps: 1 }); // a step sorts the world
const half = (h) => { const e = (h >> 10) & 31, m = h & 1023, s = h & 0x8000 ? -1 : 1; return s * (e ? (1 + m / 1024) * 2 ** (e - 15) : m * 2 ** -24); };
async function light(noSplat) {
  globalThis.__noSplat = noSplat;
  eng.frame({ target: target.createView(), cam, paused: true, time: 1 });
  const rb = device.createBuffer({ size: W * H * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: eng.accum[eng.accIdx] }, { buffer: rb, bytesPerRow: W * 8 }, [W, H]);
  device.queue.submit([enc.finish()]);
  await rb.mapAsync(GPUMapMode.READ);
  const u = new Uint16Array(rb.getMappedRange());
  let s = 0; for (let i = 0; i < u.length; i += 4) s += half(u[i]) + half(u[i + 1]) + half(u[i + 2]);
  rb.unmap();
  return s;
}
const q = await light(true), sp = await light(false), q2 = await light(true);
console.log(`quads ${q.toFixed(1)} (again ${q2.toFixed(1)}), splats ${sp.toFixed(1)}: ratio ${(sp / q).toFixed(4)}`);
process.exit(0);
