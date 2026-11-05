// Ride lab (docs/hand.md, Riding): one body alone in still water (tools/swimlab-bodies.mjs), ridden by a script of
// held ways, measured on the GPU: its bonds and how many of its cells stay one body, how fast it goes as a way is held
// (the throttle's ramp), how far a tap carries it, and (--stone) whether a wall of stone stops it.
//   node tools/ridelab.mjs --body mat:19:4:2 --rider last --plan '[[3,1,0],[3,0,-1],[3,-1,0],[3,0,1],[2,0,0]]'
//   --stone 1: a wall of stone 1.5 units ahead of it across its way (ride it right); --genome '{...}' overrides;
//   --old DIR: the page's ride as it was at the source tree DIR (a git worktree of an earlier commit): the will a
//   target 4 units ahead at full strength the moment a key is down, the rider and its bonded neighbors only.
//   --step N coarse steps; --json prints each frame's trace too.
import { parseArgs } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { values: v } = parseArgs({ options: {
  body: { type: 'string', default: 'mat:19:4:2' }, genome: { type: 'string', default: '{}' }, k: { type: 'string', default: '{}' },
  rider: { type: 'string', default: 'last' }, plan: { type: 'string', default: '[[3,1,0],[3,0,-1],[3,-1,0],[3,0,1],[2,0,0]]' },
  stone: { type: 'string', default: '0' }, old: { type: 'string' }, step: { type: 'string', default: '1' }, n: { type: 'string', default: '4096' },
  warm: { type: 'string', default: '1' }, json: { type: 'boolean' },
} });

const src = v.old ? pathToFileURL(path.resolve(v.old, 'src') + '/').href : new URL('../src/', import.meta.url).href;
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const E = await import(src + 'engine.js');
const { P_BYTES, FIRST_LIFE, NONE = 0xffffffff } = await import(src + 'shaders.js');
const { testGenome, aloneInWater } = await import('./swimlab-bodies.mjs');
const R = await import('../src/ride.js');

const K = { metab: 0, ...JSON.parse(v.k) };
const eng = await E.createEngine(device, 'rgba8unorm', { K });
await eng.allocate(+v.n);
eng.resize(640, 360);
const PW = P_BYTES / 4, STONE = 3, BASE = 1000000;
const plan = JSON.parse(v.plan), step = +v.step, dt = step / 60;
const wrapD = (d, W) => d - W * Math.round(d / W);

async function run() {
  let s = 7;
  const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const g = testGenome(JSON.parse(v.genome), eng.K);
  const { cells, N, W, H, idx } = await aloneInWater(eng, v.body, g, rng, { n: +v.n });
  const nc = cells.length;
  let wall = null;
  if (+v.stone) {
    // a wall of stone grains across the way, 1.5 units ahead of the body's farthest cell, from silt far off
    const st = await eng.readState();
    const pu = new Uint32Array(st.gpu.parts), pf = new Float32Array(st.gpu.parts);
    let xMax = -Infinity;
    for (let i = 0; i < nc; i++) xMax = Math.max(xMax, pf[idx[i] * PW]);
    wall = { x: xMax + 1.5, grains: [] };
    let k = 0;
    for (let y = H / 2 - 3; y <= H / 2 + 3; y += 0.08) {
      const o = k++ * PW;
      pf[o] = wall.x; pf[o + 1] = y; pf[o + 2] = 0; pf[o + 3] = 0; pu[o + 4] = STONE; pf[o + 5] = 600; pf[o + 6] = 0;
      wall.grains.push(y);
    }
    eng.writeState(st);
  }
  const riderI = v.rider === 'root' ? 0 : v.rider === 'last' ? nc - 1 : +v.rider;
  const riderId = BASE + riderI;
  const bodyIds = cells.map((_, i) => BASE + i);
  if (!v.old && nc > 1) eng.setRideBody(bodyIds);
  const th = R.createThrottle(), speedFull = R.willSpeed(g, eng.K);
  // the intents' bonds among the body's cells, and the largest group of them still bonded together
  async function bonds() {
    const st = await eng.readState();
    const pu = new Uint32Array(st.gpu.parts), iu = new Uint32Array(st.gpu.intent);
    const slotOf = new Map();
    for (let i = 0; i < N; i++) { const id = pu[i * PW + 7] - BASE; if (pu[i * PW + 4] >= FIRST_LIFE && id >= 0 && id < nc) slotOf.set(i, id); }
    const up = [...Array(nc).keys()], find = (a) => (up[a] === a ? a : (up[a] = find(up[a])));
    let n = 0;
    for (const [i, id] of slotOf) for (const w of [2, 3]) {
      const j = iu[i * 4 + w];
      if (j !== NONE && slotOf.has(j)) { n++; up[find(id)] = find(slotOf.get(j)); }
    }
    const size = new Map();
    for (const id of slotOf.values()) size.set(find(id), (size.get(find(id)) || 0) + 1);
    return { bonds: n, whole: Math.max(0, ...size.values()), alive: slotOf.size };
  }
  const frame = () => { eng.abio = 0; eng.frame({ target: null, cam: { x: W / 2, y: H / 2, ppu: 1 }, simDt: dt, steps: 1, time: eng.simTime }); };
  // read where each cell is (unwrapped against the last read)
  let last = null;
  async function where() {
    const r = await eng.readParticles();
    const x = Array(nc).fill(null), vel = Array(nc).fill(null);
    for (let i = 0; i < N; i++) {
      const o = i * PW, id = r.u32[o + 7] - BASE;
      if (r.u32[o + 4] < FIRST_LIFE || !(id >= 0 && id < nc)) continue;
      let px = r.f32[o], py = r.f32[o + 1];
      if (last?.[id]) { px = last[id][0] + wrapD(px - last[id][0], W); py = last[id][1] + wrapD(py - last[id][1], H); }
      x[id] = [px, py]; vel[id] = [r.f32[o + 2], r.f32[o + 3]];
    }
    last = x.map((p, i) => p || last?.[i]);
    return { x, vel };
  }
  for (let t = 0; t < +v.warm; t += dt) frame();
  const b0 = await bonds();
  let w = await where();
  const com = (x) => { let a = 0, b = 0, m = 0; for (const p of x) if (p) { a += p[0]; b += p[1]; m++; } return [a / m, b / m]; };
  const start = { com: com(w.x), rider: w.x[riderI] };
  const trace = []; let minWhole = b0.whole, minBonds = b0.bonds, inStone = 0, past = 0, frames = 0, minGap = Infinity;
  const hand = eng.hand, handU = eng.handU;
  let T = 0;
  for (const [secs, dx, dy] of plan) {
    for (let t = 0; t < secs - 1e-9; t += dt, T += dt) {
      const p = w.x[riderI];
      if (!p) break;
      const way = [dx, dy], held = dx !== 0 || dy !== 0;
      if (v.old) {
        handU[21] = riderId; hand[22] = held ? 1 : 0;
        hand[18] = p[0] + dx * 4; hand[19] = p[1] + dy * 4;
      } else {
        const u = R.stepThrottle(th, way, dt);
        handU[21] = riderId; hand[22] = R.throttleGrip(u);
        hand[18] = u[0] * speedFull; hand[19] = u[1] * speedFull;
      }
      frame();
      w = await where();
      frames++;
      const c = com(w.x);
      const rv = w.vel[riderI] || [0, 0];
      trace.push({ t: +T.toFixed(3), x: +(c[0] - start.com[0]).toFixed(3), y: +(c[1] - start.com[1]).toFixed(3), v: +Math.hypot(...rv).toFixed(3), vx: +rv[0].toFixed(3) });
      if (wall) {
        for (const q of w.x) {
          if (!q) continue;
          const gx = wrapD(q[0] - wall.x, W);
          if (gx > 0.2) past++;
          const gy = q[1] - (H / 2 - 3);
          const k = Math.round(gy / 0.08);
          if (k >= 0 && k < wall.grains.length) { const d = Math.hypot(gx, gy - k * 0.08); minGap = Math.min(minGap, d); if (d < 0.08) inStone++; }
        }
      }
      if (frames % 30 === 0) { const b = await bonds(); minWhole = Math.min(minWhole, b.whole); minBonds = Math.min(minBonds, b.bonds); }
    }
  }
  const b1 = await bonds();
  const c1 = com(w.x);
  return { cells: nc, bonds0: b0.bonds, bonds1: b1.bonds, minBonds: Math.min(minBonds, b1.bonds), whole0: b0.whole, whole1: b1.whole, minWhole: Math.min(minWhole, b1.whole),
    travel: +Math.hypot(c1[0] - start.com[0], c1[1] - start.com[1]).toFixed(3),
    ...(wall ? { wallAhead: +(wall.x - start.rider[0]).toFixed(2), minGapToGrain: +minGap.toFixed(3), cellFramesInStone: inStone, cellFramesPastWall: past } : {}),
    trace };
}

const { trace, ...out } = await run();
console.log(JSON.stringify(v.json ? { ...out, trace } : out));
process.exit(0);
