// Split check: does a step spread over two frames (engine frame's split: its first half after one frame's drawing,
// the rest before the next's) leave the world as a whole step does? One world grown at --ticks, then from the same
// moment --steps steps run whole (one drawn frame each) twice, and split (two drawn frames each, drawn in between as
// the page draws them; the last one's second half left for readState to finish, as a save between the halves does),
// with draws to an offscreen target. Prints the words of each buffer a save keeps (readState) that differ from the
// first whole run's (the particles and intents matched by id); the second whole run shows the GPU's own
// nondeterminism (a step's atomics and float sums), which on a real GPU hides any difference. Mesa's lavapipe on one
// thread is deterministic, and there every word must match (docs/fast-forward.md, Split steps):
//   LP_NUM_THREADS=0 node tools/splitcheck.mjs --cpu --n 4096 --steps 40 --warm 40
//   tools/gpu-node.sh tools/splitcheck.mjs --n 8192 --steps 1
import { parseArgs } from 'node:util';
import { dawnAdapter } from './adapter.mjs';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '8192' }, steps: { type: 'string', default: '120' }, ticks: { type: 'string', default: '2' },
  warm: { type: 'string', default: '60' }, cpu: { type: 'boolean' },
} });

const { gpu, adapter, name } = await dawnAdapter({ cpu: v.cpu });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const E = await import('../src/engine.js');
const { P_BYTES } = await import('../src/shaders.js');
const eng = await E.createEngine(device, 'rgba8unorm');
await eng.allocate(+v.n);
eng.resize(640, 360);
eng.seed(+v.n);
const tex = device.createTexture({ size: [640, 360], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
const target = tex.createView(), dt = +v.ticks / 60;
const cam = () => ({ x: eng.grid[0] / 2, y: eng.grid[1] / 2, ppu: 40 });
const frame = (o) => eng.frame({ target, targetTex: tex, cam: cam(), time: eng.simTime, simDt: dt, steps: 1, ...o });

for (let f = 0; f < +v.warm * 60 / +v.ticks; f++) eng.frame({ target: null, simDt: dt, steps: 1 });
const S = await eng.readState();
const living = (st) => { const u = new Uint32Array(st.gpu.parts), W = P_BYTES / 4; let c = 0; for (let i = 0; i < u.length / W; i++) if (u[i * W + 4] >= E.FIRST_LIFE) c++; return c; };

async function run(split) {
  eng.writeState(S);
  for (let s = 0; s < +v.steps; s++) {
    // (the last step's second half left owed: readState finishes it, as a save between the halves does)
    if (split) { eng.lerp = 0.75; frame({ split: true }); eng.lerp = 0.25; if (s < +v.steps - 1) frame({ paused: true }); }
    else { eng.lerp = 0.5; frame({}); }
    // (now and then a frame's GPU work finished before the next is sent, as the page's pace makes it)
    if (s % 16 === 15) await device.queue.onSubmittedWorkDone();
  }
  return eng.readState();
}
// the words that differ, buffer by buffer; the particles and their intents by each particle's id (a step sorts the world
// by atomics, whose order the GPU does not keep from run to run)
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
const ref = await run(false), again = await run(false), split = await run(true);
const lines = [
  `${name}: ${v.n} particles (${living(S)} living), ${v.steps} steps of ${v.ticks} ticks from one moment`,
  `whole again vs whole: ${JSON.stringify(diff(ref, again))}  clock ${again.cpu.simTime === ref.cpu.simTime && again.cpu.frameNo === ref.cpu.frameNo}`,
  `split vs whole:       ${JSON.stringify(diff(ref, split))}  clock ${split.cpu.simTime === ref.cpu.simTime && split.cpu.frameNo === ref.cpu.frameNo}`,
  `living at the end: ${living(ref)} / ${living(again)} / ${living(split)}`,
];
process.stdout.write(lines.join('\n') + '\n', () => process.exit(0));
void gpu;
