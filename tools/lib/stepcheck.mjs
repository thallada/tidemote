// What tools/splitcheck.mjs and tools/leancheck.mjs share: one world grown, then run on from the same moment in two
// ways, and the buffers a save keeps (readState) compared word for word, the particles and their intents by each
// particle's id (a step sorts the world by atomics, whose order the GPU does not keep from run to run).
import { parseArgs } from 'node:util';
import { dawnAdapter } from '../adapter.mjs';
import { P_BYTES, FIRST_LIFE } from '../../src/shaders.js';

// The options both take (more of a tool's own in `options`), as parsed.
export function stepArgs(options = {}) {
  return parseArgs({ options: {
    n: { type: 'string', default: '8192' }, steps: { type: 'string', default: '120' }, ticks: { type: 'string', default: '2' },
    warm: { type: 'string', default: '60' }, cpu: { type: 'boolean' }, ...options,
  } }).values;
}

// A world of v.n particles grown v.warm seconds in steps of v.ticks, and what drawing it takes: the engine (setup(eng)
// runs before it allocates), an offscreen target, the camera at the world's middle, and the grown moment (S).
let gpu = null; // (Dawn's instance, held for the device's life)
export async function grownWorld(v, setup = () => {}) {
  const { gpu: g, adapter, name } = await dawnAdapter({ cpu: v.cpu });
  gpu = g;
  const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
  const E = await import('../../src/engine.js');
  const eng = await E.createEngine(device, 'rgba8unorm');
  setup(eng);
  await eng.allocate(+v.n);
  eng.resize(640, 360);
  eng.seed(+v.n);
  const tex = device.createTexture({ size: [640, 360], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
  const target = tex.createView(), dt = +v.ticks / 60;
  for (let f = 0; f < +v.warm * 60 / +v.ticks; f++) eng.frame({ target: null, simDt: dt, steps: 1 });
  const S = await eng.readState();
  // one frame drawn as the page draws it, stepping v.ticks
  const frame = (o = {}) => eng.frame({ target, targetTex: tex, cam: { x: eng.grid[0] / 2, y: eng.grid[1] / 2, ppu: 40 }, time: eng.simTime, simDt: dt, steps: 1, ...o });
  return { device, eng, name, S, frame };
}

const W = P_BYTES / 4;

// the living particles of a readState()
export function living(st) {
  const u = new Uint32Array(st.gpu.parts);
  let c = 0;
  for (let i = 0; i < u.length / W; i++) if (u[i * W + 4] >= FIRST_LIFE) c++;
  return c;
}

const byId = (st, k, w) => {
  const ids = new Uint32Array(st.gpu.parts), x = new Uint32Array(st.gpu[k]), m = new Map();
  for (let i = 0; i < ids.length / W; i++) m.set(ids[i * W + 7], x.subarray(i * w, i * w + w));
  return m;
};
// the words that differ, buffer by buffer ("differing/all")
export const diffState = (a, b) => Object.fromEntries(Object.keys(a.gpu).map((k) => {
  let d = 0, n = 0;
  if (k === 'parts' || k === 'intent') {
    const w = k === 'parts' ? W : 4, x = byId(a, k, w), y = byId(b, k, w);
    for (const [id, r] of x) { const q = y.get(id); n += w; if (!q) { d += w; continue; } for (let j = 0; j < w; j++) if (r[j] !== q[j]) d++; }
  } else {
    const x = new Uint32Array(a.gpu[k]), y = new Uint32Array(b.gpu[k]);
    n = x.length;
    for (let i = 0; i < n; i++) if (x[i] !== y[i]) d++;
  }
  return [k, `${d}/${n}`];
}));

// the report, then exit once it is written
export const report = (lines) => process.stdout.write(lines.join('\n') + '\n', () => { void gpu; process.exit(0); });
