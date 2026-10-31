// Spin lab, as drawn (investigation): grow a world headless, then run it the way the page runs real time,
// frame by frame with the world drawn up close (so contactGather keeps each cell's drawn facing), in each
// of several modes: { ticks per step, frame interval (s), lerp (coarse steps drawn in between) }. After every
// frame it reads back the positions as drawn (lerped) and the sway records (Sway.face), and reports for
// lone cells in view: drawn turn rate of the facing (rad/s), drawn speed (radii/s), and how often the drawn
// motion reverses frame to frame.
//   tools/gpu-node.sh tools/spinpage.mjs --n 16384 --warm 240 --frames 240 --modes '[[1,0.0167,0],[2,0.0333,1]]'
import fs from 'node:fs';
import { parseArgs } from 'node:util';
const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '16384' }, warm: { type: 'string', default: '240' }, frames: { type: 'string', default: '240' },
  seed: { type: 'string', default: '23' }, k: { type: 'string', default: '{}' }, out: { type: 'string' }, zoom: { type: 'string', default: '300' },
  modes: { type: 'string', default: '[[1,0.01667,0],[2,0.03333,0],[2,0.03333,1],[3,0.05,1],[6,0.1,1],[6,0.11,1]]' },
} });
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const { runHeadless } = await import('../src/headless.js');
const { G_WORDS, FIRST_LIFE, SWAY_BYTES } = await import('../src/shaders.js');
const { readGenome } = await import('../src/genome.js');
const NONE = 0xffffffff, TAU = Math.PI * 2;
const W = 1280, H = 720;

async function read(buf, size) {
  const st = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, st, 0, size);
  device.queue.submit([enc.finish()]);
  await st.mapAsync(GPUMapMode.READ);
  const c = st.getMappedRange().slice(0); st.unmap(); st.destroy();
  return c;
}
const wrapAng = (a) => a - TAU * Math.round(a / TAU);
const half = (h) => { const s = h >> 15, e = (h >> 10) & 31, m = h & 1023; const v2 = e === 0 ? m * 2 ** -24 : e === 31 ? (m ? NaN : Infinity) : (1 + m / 1024) * 2 ** (e - 15); return s ? -v2 : v2; };
const unpack2 = (u) => [half(u & 0xffff), half(u >>> 16)];

async function measure(eng, [ticks, every, lerp], tex, cam, t0) {
  const N = eng.count, [GW, GH] = eng.grid, dt = ticks / 60;
  const gb = await read(eng.b.genomes, eng.b.genomes.size);
  const gu = new Uint32Array(gb), gf = new Float32Array(gb);
  const gcache = new Map();
  const gen = (k) => { if (!gcache.has(k)) gcache.set(k, readGenome(gu, gf, k)); return gcache.get(k); };
  const swayN = eng.b.sway.size / SWAY_BYTES, SW = SWAY_BYTES / 4;
  const halfW = W / 2 / cam.ppu, halfH = H / 2 / cam.ppu;
  let real = t0, owed = 0;
  const prev = new Map();
  const S = { face: [], speed: [], rev: 0, revN: 0, noRecord: 0, seen: 0, faceVel: [] };
  for (let f = 0; f < +v.frames; f++) {
    real += every; owed += every;
    // the page's plan: whole steps of `ticks`, the remainder carried; drawn in between as far as owed reaches
    const steps = Math.floor(owed / dt + 0.25); owed = Math.max(-0.25 * dt, Math.min(dt, owed - steps * dt));
    eng.lerp = lerp && ticks > 1 ? Math.max(0, Math.min(1, owed / dt)) : null;
    eng.frame({ target: tex.createView(), cam, paused: steps === 0, simDt: dt, steps: Math.max(steps, 1), time: real });
    const pb = await read(eng.b.parts, N * 40), ib = await read(eng.b.intent, N * 16), sb = await read(eng.b.sway, eng.b.sway.size);
    const pu = new Uint32Array(pb), pf = new Float32Array(pb), iu = new Uint32Array(ib), su = new Uint32Array(sb), sf = new Float32Array(sb);
    const cur = new Map();
    for (let i = 0; i < N; i++) {
      const o = i * 10, k = pu[o + 4];
      if (k < FIRST_LIFE || (pu[o + 9] & 15) === 14) continue;
      if (iu[i * 4 + 2] !== NONE || iu[i * 4 + 3] !== NONE) continue;
      let dx = pf[o] - cam.x, dy = pf[o + 1] - cam.y;
      dx -= GW * Math.round(dx / GW); dy -= GH * Math.round(dy / GH);
      if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;
      // (a cell's record is in its first slot or its second: swaySlot2 in src/shaders.js)
      const id = pu[o + 7], s1 = id % swayN, h = Math.imul((id ^ (id >>> 16)) >>> 0, 0x45d9f3b) ^ 0x9e3779b9, b = (h >>> 0) % swayN;
      const slot = su[s1 * SW] === id ? s1 : b === s1 ? (s1 + 1) % swayN : b;
      const g = gen(k), radius = 0.085 * g.size;
      S.seen++;
      // what cellDirection draws: the record's face if the record is this cell's and fresh, else its raw velocity
      let face;
      if (su[slot * SW] === id && Math.abs(real % 4096 - sf[slot * SW + 3]) <= 0.2) { const q = unpack2(su[slot * SW + 6]); face = Math.atan2(q[1], q[0]); }
      else { S.noRecord++; face = Math.atan2(pf[o + 3], pf[o + 2]); }
      const c = { x: pf[o], y: pf[o + 1], face, radius };
      cur.set(id, c);
      const p = prev.get(id);
      if (p) {
        let mx = c.x - p.x, my = c.y - p.y;
        mx -= GW * Math.round(mx / GW); my -= GH * Math.round(my / GH);
        if (mx * mx + my * my > 0.25) continue;
        S.face.push(Math.abs(wrapAng(face - p.face)) / every);
        S.speed.push(Math.hypot(mx, my) / every / radius);
        if (p.mx != null && Math.hypot(mx, my) > 0.05 * radius && Math.hypot(p.mx, p.my) > 0.05 * radius) { S.revN++; if (mx * p.mx + my * p.my < 0) S.rev++; }
        c.mx = mx; c.my = my;
      }
    }
    prev.clear(); for (const [id, c] of cur) prev.set(id, c);
  }
  const q = (a, p) => { const s = Float64Array.from(a).sort(); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : null; };
  const frac = (a, t) => +(a.filter((x) => x > t).length / Math.max(1, a.length)).toFixed(4);
  return { real, out: { mode: { ticks, every, lerp }, seen: S.seen, noRecord: +(S.noRecord / Math.max(1, S.seen)).toFixed(4),
    face: { p50: q(S.face, 0.5), p90: q(S.face, 0.9), p99: q(S.face, 0.99), over2pi: frac(S.face, TAU), over20: frac(S.face, 20) },
    speed: { p50: q(S.speed, 0.5), p90: q(S.speed, 0.9), p99: q(S.speed, 0.99), over10: frac(S.speed, 10) },
    reversals: +(S.rev / Math.max(1, S.revN)).toFixed(4) } };
}

let result = [];
await runHeadless(device, { n: +v.n, minutes: +v.warm / 60, seed: +v.seed, k: JSON.parse(v.k), eras: true, sample: 30, print: 60, step: 1 },
  { print: (l) => console.log(l), width: W, height: H, snapshot: async (eng) => {
    eng.resize(W, H);
    const tex = device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    // aim at the densest patch of lone living cells
    const pb = await read(eng.b.parts, eng.count * 40), pu = new Uint32Array(pb), pf = new Float32Array(pb);
    const [GW, GH] = eng.grid, bins = new Map();
    for (let i = 0; i < eng.count; i++) if (pu[i * 10 + 4] >= FIRST_LIFE) { const key = Math.floor(pf[i * 10] / 3) + ',' + Math.floor(pf[i * 10 + 1] / 3); bins.set(key, (bins.get(key) || 0) + 1); }
    const best = [...bins].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    const cam = { x: (best[0] + 0.5) * 3, y: (best[1] + 0.5) * 3, ppu: +v.zoom };
    let t = 100;
    for (const m of JSON.parse(v.modes)) {
      // a second of the mode first, so records settle
      const warm = await measure(eng, m, tex, cam, t); t = warm.real;
      const r = await measure(eng, m, tex, cam, t); t = r.real;
      console.log(JSON.stringify(r.out));
      result.push(r.out);
    }
  } });
if (v.out) fs.writeFileSync(v.out, JSON.stringify(result, null, 1));
process.exit(0);
