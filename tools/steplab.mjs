// Step lab: does a coarse step move a body as the 1/60 s steps it stands for would? One body alone in still
// water (built as tools/swimlab.mjs builds it), warmed at 1/60 s; then at --moments points spread over --span
// seconds, one step of --step ticks and that many 1/60 s steps run from the same moment, and each cell's end
// position and velocity are compared in the body's frame then (x from its root to its last cell, y across).
// Prints per cell, and over the body, the RMS over the moments of the 1/60 s steps' displacement and end
// velocity and of the coarse step's error from them, and the body's travel along x either way.
//   tools/gpu-node.sh tools/steplab.mjs --body filament:5 --genome '{"beat":[0.5,1.5,0.8,1]}' --step 6
//   a tailed mat: --body mat:12:5:1 --genome '{"grow":[0,0.3,0,0.5,0,0],"tail":[1,0.3],"beat":[0.5,1.5,0.8,1]}'
//   --cpu runs on a software adapter (lavapipe).
import { parseArgs } from 'node:util';
import { dawnAdapter } from './adapter.mjs';

const { values: v } = parseArgs({ options: {
  body: { type: 'string', default: 'filament:5' }, genome: { type: 'string', default: '{}' }, k: { type: 'string', default: '{}' },
  step: { type: 'string', default: '6' }, moments: { type: 'string', default: '16' }, span: { type: 'string', default: '1.33' },
  warm: { type: 'string', default: '3' }, n: { type: 'string', default: '4096' }, cpu: { type: 'boolean' },
} });

// (gpu, the instance, kept: collected, it takes the device with it)
const { gpu, adapter } = await dawnAdapter({ cpu: v.cpu });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const E = await import('../src/engine.js');
const { testGenome, aloneInWater } = await import('./swimlab-bodies.mjs');
const { P_BYTES } = await import('../src/shaders.js');

const eng = await E.createEngine(device, 'rgba8unorm', { K: { metab: 0, ...JSON.parse(v.k) } });
await eng.allocate(+v.n);
eng.resize(640, 360);
let seed = 7;
const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const g = testGenome(JSON.parse(v.genome), eng.K);
const { cells } = await aloneInWater(eng, v.body, g, rng, { n: +v.n });
const PW = P_BYTES / 4, step = +v.step;
const frames = (n, ticks) => { for (let f = 0; f < n; f++) { eng.abio = 0; eng.frame({ target: null, simDt: ticks / 60, steps: 1, time: eng.simTime }); } };
// each cell's (x, y, vx, vy) by its place in the layout (ids 1000000 + i)
const cellsOf = ({ u32, f32 }) => {
  const out = [];
  for (let i = 0; i < u32.length / PW; i++) {
    const c = u32[i * PW + 7] - 1000000;
    if (u32[i * PW + 4] === E.FIRST_LIFE && c >= 0 && c < cells.length) out[c] = [...f32.subarray(i * PW, i * PW + 4)];
  }
  return out.length === cells.length && !out.includes(undefined) ? out : null;
};

frames(Math.round(+v.warm * 60), 1);
const n = cells.length, sq = () => Array.from({ length: n }, () => new Float64Array(8));
const acc = sq();
let S = await eng.readState(), travel = [0, 0], count = 0;
const gap = Math.max(1, Math.round(+v.span * 60 / +v.moments));
for (let m = 0; m < +v.moments; m++) {
  // (writeState puts back the moment's clock too: the beat's phase)
  eng.writeState(S); frames(gap, 1); S = await eng.readState();
  const start = cellsOf({ u32: new Uint32Array(S.gpu.parts), f32: new Float32Array(S.gpu.parts) });
  eng.writeState(S); frames(step, 1); const fine = cellsOf(await eng.readParticles());
  eng.writeState(S); frames(1, step); const coarse = cellsOf(await eng.readParticles());
  if (!start || !fine || !coarse) { process.stdout.write('the body broke\n', () => process.exit(1)); await new Promise(() => {}); }
  // the body's frame at the moment, positions unwrapped about its first cell
  const [W, H] = S.cpu.grid, o = start[0];
  const un = (p) => [p[0] - W * Math.round((p[0] - o[0]) / W), p[1] - H * Math.round((p[1] - o[1]) / H)];
  const tip = un(start[n - 1]), l = Math.hypot(tip[0] - o[0], tip[1] - o[1]), ax = (tip[0] - o[0]) / l, ay = (tip[1] - o[1]) / l;
  const rot = (x, y) => [x * ax + y * ay, y * ax - x * ay];
  for (let c = 0; c < n; c++) {
    const s0 = un(start[c]), f = un(fine[c]), k = un(coarse[c]);
    const d = rot(f[0] - s0[0], f[1] - s0[1]), e = rot(k[0] - f[0], k[1] - f[1]);
    const vf = rot(fine[c][2], fine[c][3]), ve = rot(coarse[c][2] - fine[c][2], coarse[c][3] - fine[c][3]);
    [d[1], e[1], d[0], e[0], vf[1], ve[1], vf[0], ve[0]].forEach((x, i) => { acc[c][i] += x * x; });
    travel[0] += d[0] / n; travel[1] += (d[0] + e[0]) / n;
  }
  count++;
}
const r = (c, i) => Math.sqrt(acc[c][i] / count);
const lines = [];
const row = (label, f) => lines.push(label.padEnd(6) + [0, 2, 4, 6].map((i) => `${(f(i) * (i < 4 ? 1e3 : 1e2)).toFixed(1).padStart(7)} ${(f(i + 1) * (i < 4 ? 1e3 : 1e2)).toFixed(1).padStart(6)}`).join(''));
lines.push(`${v.body} ${v.genome} ${v.k}: ${step} ticks against 1/60 s, ${count} moments over ${v.span} s`);
lines.push('cell   across: moved  error  along: moved  error (1e-3)   vel across  error  along  error (1e-2)');
for (let c = 0; c < n; c++) row(String(c), (i) => r(c, i));
row('body', (i) => Math.sqrt(acc.reduce((a, x) => a + x[i], 0) / (count * n)));
lines.push(`travel along the body a step: ${(travel[0] / count * 1e3).toFixed(2)} at 1/60 s, ${(travel[1] / count * 1e3).toFixed(2)} coarse (1e-3)`);
// (written out before exiting: an exit cuts piped output short)
process.stdout.write(lines.join('\n') + '\n', () => process.exit(0));
