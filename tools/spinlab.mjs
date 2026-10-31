// Spin lab (investigation): grow a world headless, then step it at --step ticks reading every cell back each
// step, and report per kind of cell (lone, mat/body, tree, tail) how fast it moves (radii/s, from its
// positions) and how fast its drawn heading turns (rad/s): the contactGather face emulated on the CPU for
// cells drawn by cellDirection, the bond to intent.z for tree and tail cells (bodyDirection).
//   tools/gpu-node.sh tools/spinlab.mjs --n 16384 --warm 180 --seconds 10 --step 1 --out x.json
import fs from 'node:fs';
import { parseArgs } from 'node:util';
const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '16384' }, warm: { type: 'string', default: '180' }, seconds: { type: 'string', default: '10' },
  step: { type: 'string', default: '1' }, seed: { type: 'string', default: '23' }, k: { type: 'string', default: '{}' }, out: { type: 'string' },
} });
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const { runHeadless } = await import('../src/headless.js');
const { G_WORDS, FIRST_LIFE, MAXK } = await import('../src/shaders.js').then((m) => ({ ...m, MAXK: m.MAXK ?? 4096 }));
const { readGenome } = await import('../src/genome.js');
const NONE = 0xffffffff, TAU = Math.PI * 2;

async function read(eng, buf, size) {
  const st = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, st, 0, size);
  device.queue.submit([enc.finish()]);
  await st.mapAsync(GPUMapMode.READ);
  const c = st.getMappedRange().slice(0); st.unmap(); st.destroy();
  return c;
}
const wrapAng = (a) => a - TAU * Math.round(a / TAU);

async function measure(eng, step) {
  const N = eng.count, [W, H] = eng.grid, dt = step / 60;
  const gb = await read(eng, eng.b.genomes, eng.b.genomes.size);
  const gu = new Uint32Array(gb), gf = new Float32Array(gb);
  const gcache = new Map();
  const gen = (k) => { if (!gcache.has(k)) { const g = readGenome(gu, gf, k); g.tree = gu[k * G_WORDS + 12] >= 0x80000000; gcache.set(k, g); } return gcache.get(k); };
  const adhMin = eng.K.adhMin;
  const prev = new Map(); // id -> { x, y, face, draw, vel }
  const acc = new Map();
  const stats = {}; // cat -> { speed: [], omegaDraw: [], omegaVel: [], omegaFace: [] }
  const frames = Math.round(+v.seconds * 60 / step);
  for (let f = 0; f < frames; f++) {
    eng.frame({ target: null, simDt: dt, time: eng.simTime });
    const pb = await read(eng, eng.b.parts, N * 40), ib = await read(eng, eng.b.intent, N * 16);
    const pu = new Uint32Array(pb), pf = new Float32Array(pb), iu = new Uint32Array(ib);
    const cur = new Map();
    for (let i = 0; i < N; i++) {
      const o = i * 10, k = pu[o + 4];
      if (k < FIRST_LIFE || (pu[o + 9] & 15) === 14) continue;
      const g = gen(k), info = pu[o + 9], order = info >>> 30;
      const tail = !g.tree && g.adhesion > adhMin && g.tail[0] > 0 && order === 2;
      const m = iu[i * 4 + 2], m2 = iu[i * 4 + 3];
      const bonded = m !== NONE || m2 !== NONE;
      const cat = g.tree && bonded ? 'tree' : tail ? 'tail' : bonded ? (g.tail[0] > 0 ? 'bodyT' : 'body') : 'lone';
      const x = pf[o], y = pf[o + 1], vx = pf[o + 2], vy = pf[o + 3], id = pu[o + 7];
      const radius = 0.085 * g.size, speed = Math.hypot(vx, vy);
      const velA = Math.atan2(vy, vx);
      let draw = null;
      if ((g.tree || tail) && g.adhesion > adhMin && m < N && m !== i && pu[m * 10 + 4] === k) {
        let dx = x - pf[m * 10], dy = y - pf[m * 10 + 1];
        dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
        if (dx * dx + dy * dy > 1e-10) draw = Math.atan2(dy, dx);
      }
      const p = prev.get(id);
      let face = velA, svel = [vx, vy];
      if (p) {
        // contactGather: velocity smoothed over 0.08 s, the face turning a radian per radius travelled
        const a = 1 - Math.exp(-dt / 0.08);
        svel = [p.svel[0] + (vx - p.svel[0]) * a, p.svel[1] + (vy - p.svel[1]) * a];
        const sp = Math.hypot(svel[0], svel[1]);
        const swing = wrapAng(Math.atan2(svel[1], svel[0]) - p.face);
        face = p.face + Math.max(-1, Math.min(1, swing)) * Math.min(1, (sp / radius + 0.3) * dt);
      }
      if (draw == null) draw = face;
      // the bond to its first partner (any kind of body): its angle turns as the body rotates
      let bondA = null, bondTo = NONE;
      if (m < N && m !== i && pu[m * 10 + 4] >= FIRST_LIFE) {
        let dx = x - pf[m * 10], dy = y - pf[m * 10 + 1];
        dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
        bondA = Math.atan2(dy, dx); bondTo = pu[m * 10 + 7];
      }
      cur.set(id, { x, y, face, draw, svel, velA, bondA, bondTo });
      if (p) {
        let dx = x - p.x, dy = y - p.y;
        dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
        if (dx * dx + dy * dy > 0.25) continue;
        const s = (stats[cat] ??= { n: 0, speed: [], vel: [], omegaDraw: [], omegaFace: [], omegaVel: [], omegaBond: [] });
        s.n++;
        s.speed.push(Math.hypot(dx, dy) / dt / radius);
        s.vel.push(speed / radius);
        s.omegaDraw.push(Math.abs(wrapAng(draw - p.draw)) / dt);
        s.omegaFace.push(Math.abs(wrapAng(face - p.face)) / dt);
        s.omegaVel.push(Math.abs(wrapAng(velA - p.velA)) / dt);
        if (bondA != null && p.bondTo === bondTo) s.omegaBond.push(Math.abs(wrapAng(bondA - p.bondA)) / dt);
        // over the run: net (signed) turn of the drawn heading and of the position path, and time seen
        const a = (acc.get(id) ?? (acc.set(id, { cat, net: 0, abs: 0, t: 0, dist: 0 }), acc.get(id)));
        const dd = wrapAng(draw - p.draw);
        a.net += dd; a.abs += Math.abs(dd); a.t += dt; a.dist += Math.hypot(dx, dy) / radius; a.cat = cat;
        a.k = k; a.gen = (info >> 16) & 4095; a.order = order; a.slot = i;
        // a reversal: this step's displacement against the last one's (both over 5% of a radius)
        if (p.mx != null && Math.hypot(dx, dy) > 0.05 * radius && Math.hypot(p.mx, p.my) > 0.05 * radius) { s.revN = (s.revN || 0) + 1; if (dx * p.mx + dy * p.my < 0) s.rev = (s.rev || 0) + 1; }
        cur.get(id).mx = dx; cur.get(id).my = dy;
      }
    }
    prev.clear(); for (const [id, c] of cur) prev.set(id, c);
    if (f === frames - 1) {
      // bodies (bonded components of one kind) at the last step, for the size of each fast cell's body
      const root = new Int32Array(N).map((_, j) => j);
      const find = (j) => { while (root[j] !== j) { root[j] = root[root[j]]; j = root[j]; } return j; };
      for (let j = 0; j < N; j++) for (const m of [iu[j * 4 + 2], iu[j * 4 + 3]]) {
        if (m < N && pu[m * 10 + 4] === pu[j * 10 + 4] && pu[j * 10 + 4] >= FIRST_LIFE) root[find(j)] = find(m);
      }
      const size = new Map();
      for (let j = 0; j < N; j++) if (pu[j * 10 + 4] >= FIRST_LIFE) size.set(find(j), (size.get(find(j)) || 0) + 1);
      for (const [id, a] of acc) { const c = cur.get(id); if (c && pu[a.slot * 10 + 7] === id) a.body = size.get(find(a.slot)); }
    }
  }
  const q = (a, p) => { const s = Float64Array.from(a).sort(); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : null; };
  const frac = (a, t) => +(a.filter((x) => x > t).length / Math.max(1, a.length)).toFixed(4);
  const out = {};
  for (const [cat, s] of Object.entries(stats)) {
    out[cat] = { samples: s.n, reversals: +((s.rev || 0) / Math.max(1, s.revN || 0)).toFixed(4),
      speed: { p50: q(s.speed, 0.5), p90: q(s.speed, 0.9), p99: q(s.speed, 0.99), over5: frac(s.speed, 5), over20: frac(s.speed, 20) },
      omegaDraw: { p50: q(s.omegaDraw, 0.5), p90: q(s.omegaDraw, 0.9), p99: q(s.omegaDraw, 0.99), over2pi: frac(s.omegaDraw, TAU), over20: frac(s.omegaDraw, 20) },
      omegaFace: { p50: q(s.omegaFace, 0.5), p90: q(s.omegaFace, 0.9), p99: q(s.omegaFace, 0.99), over2pi: frac(s.omegaFace, TAU) },
      omegaVel: { p50: q(s.omegaVel, 0.5), p90: q(s.omegaVel, 0.9), over2pi: frac(s.omegaVel, TAU) },
      omegaBond: { n: s.omegaBond.length, p50: q(s.omegaBond, 0.5), p90: q(s.omegaBond, 0.9), p99: q(s.omegaBond, 0.99), over2pi: frac(s.omegaBond, TAU), over20: frac(s.omegaBond, 20) } };
  }
  // cells seen at least 2 s: how many turn on average over a turn a second (net, one way: spinning), or
  // swing over 3 turns a second either way (jerking), or travel over 8 radii a second
  const per = {};
  for (const a of acc.values()) {
    if (a.t < 2) continue;
    const c = (per[a.cat] ??= { cells: 0, spinNet: 0, swingAbs: 0, fast: 0 });
    c.cells++;
    if (Math.abs(a.net) / a.t > TAU) c.spinNet++;
    if (a.abs / a.t > 3 * TAU) c.swingAbs++;
    if (a.dist / a.t > 8) c.fast++;
    if (a.dist / a.t > 8 || Math.abs(a.net) / a.t > TAU || a.abs / a.t > 2 * TAU) {
      const g = gen(a.k);
      (out.odd ??= []).push({ cat: a.cat, kind: a.k, body: a.body ?? null, gen: a.gen, order: a.order, radiiS: +(a.dist / a.t).toFixed(1),
        netS: +(a.net / a.t).toFixed(2), absS: +(a.abs / a.t).toFixed(2), beat: g.beat.map((x) => +x.toFixed(2)), tail: g.tail.map((x) => +x.toFixed(2)),
        size: +g.size.toFixed(2), adh: +g.adhesion.toFixed(2), swim: +g.swim.toFixed(2) });
    }
  }
  out.perCell = per;
  return out;
}
let result;
await runHeadless(device, { n: +v.n, minutes: +v.warm / 60, seed: +v.seed, k: JSON.parse(v.k), eras: true, sample: 30, print: 60, step: 1 },
  { print: (l) => console.log(l), snapshot: async (eng) => { result = {}; for (const s of v.step.split(",")) result["s" + s] = await measure(eng, +s); } });
console.log(JSON.stringify(result, null, 1));
if (v.out) fs.writeFileSync(v.out, JSON.stringify(result, null, 1));
process.exit(0);
