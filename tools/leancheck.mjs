// Lean check: do the lean step kernels (senseMain and lifeMain with the features idle across the world compiled out,
// IDLE_* in simWGSL; docs/performance.md, Lean step kernels) leave the world as the full ones do whenever the engine
// picks them? One world grown at --ticks, then from the same moment --steps steps run with the full kernels twice and
// with the lean ones (eng.leanSteps), each step drawn as the page draws it. Prints the words of each buffer a save
// keeps (readState) that differ from the first full run's (the particles and intents matched by id); the second full
// run shows the GPU's own nondeterminism (a step's atomics and float sums), which on a real GPU hides any difference.
// Mesa's lavapipe on one thread is deterministic, and there every word must match:
//   LP_NUM_THREADS=0 node tools/leancheck.mjs --cpu --n 4096 --steps 40 --warm 40 --ticks 1   (and --ticks 2, 6)
// --lamp, --pond: the hand's lamp lit, or the water low, through the run: the engine must pick the full kernels then
// (the lean run then matches as well); with --force the lean kernels are taken all the same, a control: the lamp's
// light or the shore left out, the worlds part.
import { parseArgs } from 'node:util';
import { dawnAdapter } from './adapter.mjs';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '8192' }, steps: { type: 'string', default: '120' }, ticks: { type: 'string', default: '2' },
  warm: { type: 'string', default: '60' }, cpu: { type: 'boolean' }, lamp: { type: 'boolean' }, pond: { type: 'boolean' }, force: { type: 'boolean' },
} });

const { gpu, adapter, name } = await dawnAdapter({ cpu: v.cpu });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const E = await import('../src/engine.js');
const { P_BYTES } = await import('../src/shaders.js');
const eng = await E.createEngine(device, 'rgba8unorm');
if (v.force) eng._stepLean = () => true;
await eng.allocate(+v.n);
eng.resize(640, 360);
eng.seed(+v.n);
const tex = device.createTexture({ size: [640, 360], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
const target = tex.createView(), dt = +v.ticks / 60;
const cam = () => ({ x: eng.grid[0] / 2, y: eng.grid[1] / 2, ppu: 40 });

for (let f = 0; f < +v.warm * 60 / +v.ticks; f++) eng.frame({ target: null, simDt: dt, steps: 1 });
const S = await eng.readState();
const living = (st) => { const u = new Uint32Array(st.gpu.parts), W = P_BYTES / 4; let c = 0; for (let i = 0; i < u.length / W; i++) if (u[i * W + 4] >= E.FIRST_LIFE) c++; return c; };

async function run(lean) {
  eng.writeState(S);
  eng.leanSteps = lean;
  if (v.lamp) eng.hand.set([eng.grid[0] / 2, eng.grid[1] / 2, 3, 0.8], 0);
  if (v.pond) eng.level = 0.4;
  let picked = 0;
  for (let s = 0; s < +v.steps; s++) {
    eng.lerp = 0.5;
    eng.frame({ target, targetTex: tex, cam: cam(), time: eng.simTime, simDt: dt, steps: 1 });
    picked += eng.leanRan ? 1 : 0;
    if (s % 16 === 15) await device.queue.onSubmittedWorkDone();
  }
  const st = await eng.readState();
  eng.hand.fill(0, 0, 4); eng.level = 1; eng.leanSteps = true;
  return { st, picked };
}
// the words that differ, buffer by buffer; the particles and their intents by each particle's id
const W = P_BYTES / 4;
const byId = (st, k, w) => {
  const ids = new Uint32Array(st.gpu.parts), x = new Uint32Array(st.gpu[k]), m = new Map();
  for (let i = 0; i < ids.length / W; i++) m.set(ids[i * W + 7], x.subarray(i * w, i * w + w));
  return m;
};
const diff = (a, b) => Object.fromEntries(Object.keys(a.gpu).map((k) => {
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
const ref = await run(false), again = await run(false), lean = await run(true);
const lines = [
  `${name}: ${v.n} particles (${living(S)} living), ${v.steps} steps of ${v.ticks} ticks from one moment${v.lamp ? ', the lamp lit' : ''}${v.pond ? ', the water low' : ''}${v.force ? ', the lean kernels forced' : ''}`,
  `full again vs full: ${JSON.stringify(diff(ref.st, again.st))}`,
  `lean vs full:       ${JSON.stringify(diff(ref.st, lean.st))}  (lean kernels in ${lean.picked} of ${v.steps} steps; full runs ${ref.picked + again.picked})`,
  `living at the end: ${living(ref.st)} / ${living(again.st)} / ${living(lean.st)}`,
];
process.stdout.write(lines.join('\n') + '\n', () => process.exit(0));
void gpu;
