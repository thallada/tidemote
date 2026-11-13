// Jitter lab: how much do crowded cells rattle under each step length? One world grown in 1/60 s steps, then
// the same moment run forward under each variant (as tools/fork.mjs does), every living cell's position and
// velocity read every --every ticks (2: what a 30 Hz screen shows). Each cell's path, sampled alike for every
// variant, is split into a smooth part (a centered 5-sample moving average) and the rest: the rest's RMS is its
// jitter (world units; a cell's radius is about 0.085), and the same for its velocity (which the drawing's heading
// and squash follow, contactGather). Cells are grouped by how many living cells lie within 0.2 of them. Prints the
// table after each rep: on D3D12 Dawn has crashed (exit 5) on a later rep now and then, so --seed grows other worlds.
// docs/fast-forward.md, How the page runs a speed.
//   tools/gpu-node.sh tools/jitterlab.mjs --n 32768 --warm 240 --secs 4 --reps 1 --variants '[{"name":"m1","step":1},{"name":"m2","step":2}]'
import { parseArgs } from 'node:util';
import { dawnAdapter } from './adapter.mjs';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '32768' }, warm: { type: 'string', default: '240' }, secs: { type: 'string', default: '4' },
  reps: { type: 'string', default: '1' }, seed: { type: 'string', default: '1' }, every: { type: 'string', default: '2' },
  k: { type: 'string', default: '{}' }, variants: { type: 'string', default: '[{"name":"m1","step":1},{"name":"m2","step":2}]' },
  cpu: { type: 'boolean' },
} });
const { gpu, adapter } = await dawnAdapter({ cpu: v.cpu });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
let seed = +v.seed >>> 0;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
Math.random = rng;
const E = await import('../src/engine.js');
const { P_BYTES } = await import('../src/shaders.js');
const { createClimate, seasonAt, abioRate } = await import('../src/climate.js');
const eng = await E.createEngine(device, 'rgba8unorm', { K: JSON.parse(v.k), hasTimestamps: false });
if (!(await eng.allocate(+v.n))) throw new Error('could not allocate');
eng.resize(64, 36);
eng.seed(+v.n, { aspect: 16 / 9, rng });
eng.censusEvery = 20;
createClimate(eng, rng);
eng.onCensus = (c) => { eng.abio = abioRate(c.pop[0]); };
for (let f = 0; f < Math.round(+v.warm * 60); f++) {
  eng.season = seasonAt(eng.simTime);
  while ((eng.frameNo + 1) % eng.censusEvery === 0 && eng.censusStage.every((s) => s.busy)) await new Promise((r) => setTimeout(r, 0));
  eng.frame({ target: null, simDt: 1 / 60, time: f / 60 });
  if (f % 60 === 59) await device.queue.onSubmittedWorkDone();
}
console.error(`grown to ${eng.simTime.toFixed(0)} s`);
while (eng.censusStage.some((s) => s.busy)) await new Promise((r) => setTimeout(r, 0));
eng.onCensus = null;
eng.censusEvery = 1 << 30;
const snap = eng.snapshot();
const W = P_BYTES / 4, every = +v.every;
const BANDS = [[0, 3], [3, 8], [8, 16], [16, 1e9]];
const bandName = (b) => (b[1] > 1e8 ? `${b[0]}+` : `${b[0]}-${b[1] - 1}`);
const results = {};
const report = (reps) => {
  console.log(`n ${v.n}, warm ${v.warm} s, ${v.secs} s x ${reps} reps, sampled every ${every} ticks; RMS: jitter (1e-3 units), velocity jitter, path speed and velocity's mismatch with it (1e-3 units/s)`);
  console.log('variant  crowd     cells   pos-jitter  vel-jitter  path-speed  vel-mismatch');
  for (const [name, acc] of Object.entries(results)) {
    acc.forEach((a, b) => {
      const q = (s) => (a.n ? (1e3 * Math.sqrt(s / a.n)).toFixed(2) : '-').padStart(12);
      console.log(`${name.padEnd(8)} ${bandName(BANDS[b]).padEnd(6)} ${String(Math.round(a.cells / reps)).padStart(8)} ${q(a.pos)}${q(a.vel)}${q(a.speed)}${q(a.mis)}`);
    });
  }
};
for (let r = 0; r < +v.reps; r++) {
  for (const va of JSON.parse(v.variants)) {
    eng.restore(snap);
    eng.seedValue = (snap.cpu.seedValue ^ Math.imul(r + 1, 2654435761)) >>> 0;
    const n = Math.round((+v.secs * 60) / every), per = every / va.step, S = n + 1;
    if (per !== Math.round(per)) throw new Error('--every must be a multiple of each step');
    // the living at the start, each a path of S samples of (x, y, vx, vy), unwrapped; NaN once it is gone or changed
    const [gw, gh] = eng.grid;
    // every sample copied aside on the GPU and read once at the end (a readback a sample crashed Dawn on D3D12 now and then)
    const size = eng.count * P_BYTES, big = device.createBuffer({ size: size * S, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const keep = (s) => { const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(eng.b.parts, 0, big, s * size, size); device.queue.submit([enc.finish()]); };
    keep(0);
    for (let s = 1; s < S; s++) {
      for (let k = 0; k < per; k++) { eng.season = seasonAt(eng.simTime); eng.frame({ target: null, simDt: va.step / 60, time: eng.simTime }); }
      keep(s);
      if (s % 30 === 0) await device.queue.onSubmittedWorkDone();
    }
    await big.mapAsync(GPUMapMode.READ);
    const all = big.getMappedRange().slice(0);
    big.unmap(); big.destroy();
    const sample = (s) => ({ u32: new Uint32Array(all, s * size, size / 4), f32: new Float32Array(all, s * size, size / 4) });
    let q = sample(0);
    const index = new Map(), kinds = [], start = [];
    for (let i = 0; i < eng.count; i++) if (q.u32[i * W + 4] >= E.FIRST_LIFE) { index.set(q.u32[i * W + 7], kinds.length); kinds.push(q.u32[i * W + 4]); start.push([q.f32[i * W], q.f32[i * W + 1]]); }
    const C = kinds.length, path = new Float32Array(C * S * 4).fill(NaN);
    const put = (s) => {
      for (let i = 0; i < eng.count; i++) {
        const c = index.get(q.u32[i * W + 7]);
        if (c == null || q.u32[i * W + 4] !== kinds[c]) continue;
        const o = (c * S + s) * 4, pr = s ? o - 4 : -1;
        let x = q.f32[i * W], y = q.f32[i * W + 1];
        if (pr >= 0) { if (Number.isNaN(path[pr])) continue; x = path[pr] + (((x - path[pr]) % gw) + 1.5 * gw) % gw - 0.5 * gw; y = path[pr + 1] + (((y - path[pr + 1]) % gh) + 1.5 * gh) % gh - 0.5 * gh; }
        path[o] = x; path[o + 1] = y; path[o + 2] = q.f32[i * W + 2]; path[o + 3] = q.f32[i * W + 3];
      }
    };
    put(0);
    // living neighbors within 0.2 of each at the start (a hash grid of 0.2)
    const R = 0.2, nx = Math.ceil(gw / R), ny = Math.ceil(gh / R), cells = new Map(), crowd = new Int32Array(C);
    const key = (x, y) => (((Math.floor(x / R) % nx) + nx) % nx) * ny + (((Math.floor(y / R) % ny) + ny) % ny);
    start.forEach((p, c) => { const k = key(p[0], p[1]); (cells.get(k) || cells.set(k, []).get(k)).push(c); });
    start.forEach((p, c) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const d of cells.get(key(p[0] + dx * R, p[1] + dy * R)) || []) {
        let ex = start[d][0] - p[0], ey = start[d][1] - p[1]; ex -= gw * Math.round(ex / gw); ey -= gh * Math.round(ey / gh);
        if (d !== c && ex * ex + ey * ey < R * R) crowd[c]++;
      }
    });
    for (let s = 1; s < S; s++) { q = sample(s); put(s); }
    const acc = (results[va.name] ||= BANDS.map(() => ({ cells: 0, pos: 0, vel: 0, speed: 0, mis: 0, n: 0 })));
    const h = every / 60, at = (c, s, k) => path[(c * S + s) * 4 + k];
    for (let c = 0; c < C; c++) {
      if (Number.isNaN(at(c, S - 1, 0))) continue;
      const a = acc[BANDS.findIndex(([lo, hi]) => crowd[c] >= lo && crowd[c] < hi)];
      a.cells++;
      for (let i = 2; i < S - 2; i++) {
        for (const [k, name] of [[0, 'pos'], [1, 'pos'], [2, 'vel'], [3, 'vel']]) {
          const sm = (at(c, i - 2, k) + at(c, i - 1, k) + at(c, i, k) + at(c, i + 1, k) + at(c, i + 2, k)) / 5;
          a[name] += (at(c, i, k) - sm) ** 2;
        }
        // the speed its path shows, and how far its velocity is from that (central differences)
        const fx = (at(c, i + 1, 0) - at(c, i - 1, 0)) / (2 * h), fy = (at(c, i + 1, 1) - at(c, i - 1, 1)) / (2 * h);
        a.speed += fx * fx + fy * fy;
        a.mis += (at(c, i, 2) - fx) ** 2 + (at(c, i, 3) - fy) ** 2;
        a.n++;
      }
    }
  }
  console.error(`rep ${r + 1} done`);
  report(r + 1);
}
process.exit(0);
