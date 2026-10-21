// Swim lab: one body alone in still water, measured. The world is cleared to silt heaped far away (no
// currents, tides, other life or food, upkeep off so nothing grows, starves or ages out), a body is built
// cell by cell from a genome and a layout, and run forward; its cells are read back every step.
// Reports the body's speed (its centre's travel, along its head: root first), the beat's kinematics
// (bend amplitude, wave speed), and what resistive force theory predicts from those same kinematics
// (the rigid motion that leaves the sum of drag forces and torques on its cells at zero, with drag
// sideDrag times as hard across each cell's branch as along it). A body that waves well but moves less
// than that loses its thrust somewhere other than the water.
//   tools/gpu-node.sh tools/swimlab.mjs --body filament:12 --genome '{"beat":[0.4,1.5,0.6,1]}' --k '{}' --seconds 20
//   --sweep '[{...genome overrides...}, ...]' runs several in turn; --step 4 takes coarse steps.
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values: v } = parseArgs({ options: {
  body: { type: 'string', default: 'filament:12' }, genome: { type: 'string', default: '{}' }, k: { type: 'string', default: '{}' },
  seconds: { type: 'string', default: '20' }, warm: { type: 'string', default: '4' }, step: { type: 'string', default: '1' },
  sweep: { type: 'string' }, out: { type: 'string' }, n: { type: 'string', default: '4096' }, trace: { type: 'boolean' }, every: { type: 'string', default: '2' },
} });

const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const E = await import('../src/engine.js');
const { archetypeGenome, finalizeGenome, writeGenome, growPlan } = await import('../src/genome.js');
const { G_WORDS, P_BYTES, DEFAULT_K } = await import('../src/shaders.js');

const K = { ...JSON.parse(v.k), metab: 0 };
const KK = () => eng.K;
const eng = await E.createEngine(device, 'rgba8unorm', { K });
await eng.allocate(+v.n);
eng.resize(640, 360);
let seed = 7;
const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// the test genome: a hunter founder made into a tree that beats, then the overrides
function testGenome(over) {
  let s = 99; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const g = archetypeGenome('hunter', r, eng.K);
  Object.assign(g, { adhesion: 0.6, swim: 0, size: 1, drag: 0.08, advect: 0.8, force: 4, photo: 0, align: 0, lifespan: 1e6,
    beat: [0.4, 1.5, 0.6, 1], grow: [1, 0.3, 0, 0.5, 0, 0], mutRate: 0, thermo: 0 }, over);
  return finalizeGenome(g, eng.K);
}

// layouts: cells as { mom, turn } in budding order (mom -1: the root)
function layout(spec) {
  const [kind, a, b] = spec.split(':');
  const n = +a || 12;
  const cells = [{ mom: -1, turn: 0 }];
  if (kind === 'filament') for (let i = 1; i < n; i++) cells.push({ mom: i - 1, turn: 0 });
  else if (kind === 'branch') {
    // a main axis of n cells with side branches of b cells every e cells, alternately left and right
    const e = +b || 3, len = +spec.split(':')[3] || 2;
    let axis = 0, side = 1;
    for (let i = 1; i < n; i++) {
      cells.push({ mom: axis, turn: 0 }); const me = cells.length - 1;
      if (i % e === 0) { let m = me; for (let q = 0; q < len; q++) { cells.push({ mom: m, turn: q ? 0 : side }); m = cells.length - 1; } side = 3 - side; }
      axis = me;
    }
  }
  else throw new Error(`unknown body ${spec}`);
  return cells;
}

const turnAngle = (plan, turn, gen) => {
  if (!plan) return 0;
  const pat = plan.pattern;
  const curl = pat === 'zigzag' && (gen & 1) ? -plan.curl : plan.curl;
  const side = (turn === 1 ? 1 : 0) - (turn === 2 ? 1 : 0);
  return curl + side * plan.angle * (pat === 'forking' ? 0.5 : 1);
};

async function run(over) {
  const g = testGenome(over);
  eng.seed(+v.n, { aspect: 16 / 9, rng });
  eng.abio = 0; eng.settings.tide = 0;
  eng.waves.fill(0); eng.tide.fill(0); eng.excursion = 0;
  g.topt = eng.tbg; g.tol = 15;
  const st = await eng.readState();
  const [W, H] = st.cpu.grid;
  const pu = new Uint32Array(st.gpu.parts), pf = new Float32Array(st.gpu.parts), PW = P_BYTES / 4;
  const iu = new Uint32Array(st.gpu.intent);
  const N = st.cpu.count;
  // everything else becomes silt heaped in a far corner, at rest
  for (let i = 0; i < N; i++) {
    const o = i * PW;
    pf[o] = 0.5 + rng() * W * 0.2; pf[o + 1] = 0.5 + rng() * H * 0.2; pf[o + 2] = 0; pf[o + 3] = 0;
    pu[o + 4] = 0; pf[o + 5] = 0; pf[o + 6] = 0; pu[o + 8] = 0; pu[o + 9] = 0;
    iu.set([0, 0, 0xffffffff, 0xffffffff], i * 4);
  }
  const gu = new Uint32Array(st.gpu.genomes), gf = new Float32Array(st.gpu.genomes);
  gu.fill(0, E.FIRST_LIFE * G_WORDS, (E.FIRST_LIFE + 1) * G_WORDS);
  writeGenome(gu, gf, E.FIRST_LIFE, g);
  // the body, laid out at rest at its plan's angles from the middle of the water, heading -x (root first)
  const plan = growPlan(g);
  const cells = layout(v.body);
  const gap = 0.085 * g.size * 2 * 0.95;
  const pos = [], head = [], gen = [];
  cells.forEach((c, i) => {
    if (c.mom < 0) { pos.push([W / 2, H / 2]); head.push(0); gen.push(0); return; }
    gen.push(gen[c.mom] + 1);
    const h = (c.mom === 0 && i === 1 ? 0 : head[c.mom]) + turnAngle(plan, c.turn, gen[i]);
    head.push(h);
    pos.push([pos[c.mom][0] + Math.cos(h) * gap, pos[c.mom][1] + Math.sin(h) * gap]);
  });
  const idx = cells.map((_, i) => N - 1 - i);
  cells.forEach((c, i) => {
    const o = idx[i] * PW;
    pf[o] = pos[i][0]; pf[o + 1] = pos[i][1]; pf[o + 2] = 0; pf[o + 3] = 0;
    pu[o + 4] = E.FIRST_LIFE; pf[o + 5] = 0.9 * g.reproE; pf[o + 6] = 1; pu[o + 7] = 1000000 + i; pu[o + 8] = g.col;
    pu[o + 9] = (gen[i] << 16) | (c.turn << 28) | 9;
    iu.set([0, 0, c.mom < 0 ? 0xffffffff : idx[c.mom], 0xffffffff], idx[i] * 4);
  });
  eng.writeState(st);
  const step = +v.step, dt = step / 60;
  const frames = Math.round(((+v.seconds) + (+v.warm)) * 60 / step);
  const samples = [];
  for (let f = 0; f < frames; f++) {
    eng.abio = 0;
    eng.frame({ target: null, cam: { x: W / 2, y: H / 2, ppu: 1 }, simDt: dt, steps: 1, time: eng.simTime });
    if (eng.simTime < +v.warm || f % +v.every) continue;
    const r = await eng.readParticles();
    const s = { t: eng.simTime, x: cells.map(() => null), v: cells.map(() => null), alive: 0 };
    for (let i = 0; i < N; i++) {
      const o = i * PW, id = r.u32[o + 7] - 1000000;
      if (r.u32[o + 4] !== E.FIRST_LIFE || !(id >= 0 && id < cells.length)) continue;
      s.alive++;
      s.x[id] = [r.f32[o], r.f32[o + 1]]; s.v[id] = [r.f32[o + 2], r.f32[o + 3]];
      if (v.trace && id === cells.length - 1 && f % 60 === 0) console.error('tip', eng.simTime.toFixed(1), 'E', r.f32[o + 5].toFixed(3), 'age', r.f32[o + 6].toFixed(1), 'cause', r.u32[o + 9] & 15, 'role', (r.u32[o + 9] >> 4) & 3);
    }
    if (f === frames - 1 || (eng.simTime - +v.warm) < dt) {
      const moved = [...Array(cells.length).keys()].filter((c) => r.u32[idx[c] * PW + 7] !== 1000000 + c).length;
      if (moved) console.error(`${moved} cells changed slots`);
    }
    samples.push(s);
  }
  return analyse(g, cells, samples, eng.K, [W, H]);
}

// unwrap positions against the first sample's, cell by cell
function unwrap(samples, [W, H]) {
  const last = samples[0].x.map((p) => p && [...p]);
  for (const s of samples) s.x = s.x.map((p, i) => {
    if (!p || !last[i]) return p;
    const q = [p[0] - W * Math.round((p[0] - last[i][0]) / W), p[1] - H * Math.round((p[1] - last[i][1]) / H)];
    last[i] = q; return q;
  });
}

function analyse(g, cells, samples, K, grid) {
  unwrap(samples, grid);
  const n = cells.length;
  const ok = samples.filter((s) => s.alive === n);
  if (ok.length < 10) return { error: `body fell apart or died: ${samples.at(-1)?.alive}/${n}` };
  const com = (s) => { let x = 0, y = 0; for (const p of s.x) { x += p[0]; y += p[1]; } return [x / n, y / n]; };
  const a = ok[0], b = ok.at(-1), T = b.t - a.t;
  const c0 = com(a), c1 = com(b);
  // the head's direction, averaged over the run: from the body's centre to its root
  let hx = 0, hy = 0;
  for (const s of ok) { const c = com(s); hx += s.x[0][0] - c[0]; hy += s.x[0][1] - c[1]; }
  const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
  const dx = c1[0] - c0[0], dy = c1[1] - c0[1];
  // the longest a bond got, and the share of samples with one past breaking (bondBreak x linkR)
  let maxBond = 0, broken = 0;
  if (v.trace) for (const s of samples) { if (s.alive < n) continue; const ls = cells.map((c, i) => c.mom >= 0 ? Math.hypot(s.x[i][0] - s.x[c.mom][0], s.x[i][1] - s.x[c.mom][1]).toFixed(2) : '').slice(1); console.error(s.t.toFixed(3), ls.join(' ')); }
  for (const s of ok) { let mb = 0; cells.forEach((c, i) => { if (c.mom >= 0) mb = Math.max(mb, Math.hypot(s.x[i][0] - s.x[c.mom][0], s.x[i][1] - s.x[c.mom][1])); }); maxBond = Math.max(maxBond, mb); if (mb > K.linkR * K.bondBreak) broken++; }
  // the body's length (root to farthest cell, mean)
  let L = 0; for (const s of ok) { let m = 0; for (const p of s.x) m = Math.max(m, Math.hypot(p[0] - s.x[0][0], p[1] - s.x[0][1])); L += m; } L /= ok.length;
  // bend angles at each interior cell of the main axis (cells whose mother is the one before)
  const chain = [0]; for (let i = 1; i < n; i++) if (cells[i].mom === chain.at(-1)) chain.push(i);
  const bends = ok.map((s) => chain.slice(1, -1).map((c, j) => {
    const p0 = s.x[chain[j]], p1 = s.x[c], p2 = s.x[chain[j + 2]];
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
    return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }));
  const nb = bends[0].length;
  const mean = Array(nb).fill(0); for (const r of bends) r.forEach((x, j) => (mean[j] += x / bends.length));
  const amp = Array(nb).fill(0); for (const r of bends) r.forEach((x, j) => (amp[j] += (x - mean[j]) ** 2 / bends.length));
  const bendAmp = amp.map(Math.sqrt);
  // the wave: phase lag between neighbouring bends at the beat frequency
  const w = g.beat[1] * 2 * Math.PI;
  const ph = Array(nb).fill(0).map((_, j) => { let c = 0, sn = 0; ok.forEach((s, t) => { const x = bends[t][j] - mean[j]; c += x * Math.cos(w * s.t); sn += x * Math.sin(w * s.t); }); return Math.atan2(sn, c); });
  let lag = 0, lagN = 0; for (let j = 1; j < nb; j++) { let d = ph[j - 1] - ph[j]; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); lag += d; lagN++; }
  lag /= Math.max(1, lagN);
  // resistive force theory from the same motion: each sample, the rigid velocity (U, Ω) that, added to the
  // cells' own motion relative to their mean, leaves no net drag force or torque
  const gamma = K.sideDrag;
  let pred = [0, 0], dragRes = [0, 0], spin = 0;
  for (const s of ok) {
    const c = com(s);
    let vx = 0, vy = 0; for (const q of s.v) { vx += q[0] / n; vy += q[1] / n; }
    // each cell's drag tensor: 1 along its arm, gamma across
    const tens = s.x.map((p, i) => {
      const arm = cells[i].mom >= 0 ? cells[i].mom : cells.findIndex((c2) => c2.mom === i);
      if (arm < 0) return [1, 0, 1];
      let tx = s.x[arm][0] - p[0], ty = s.x[arm][1] - p[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      return [tx * tx + gamma * ty * ty, (1 - gamma) * tx * ty, ty * ty + gamma * tx * tx];
    });
    // net drag of the observed velocities (should be ~0 if only internal forces act)
    let Fx = 0, Fy = 0; s.v.forEach((q, i) => { const m = tens[i]; Fx += m[0] * q[0] + m[1] * q[1]; Fy += m[1] * q[0] + m[2] * q[1]; });
    dragRes[0] += Fx; dragRes[1] += Fy;
    // solve: sum M_i (u_i + U + Ω×r_i) = 0, sum r_i × M_i (...) = 0, with u_i the observed velocity less its rigid part
    // (subtracting any rigid part from u_i leaves the answer's total U + rigid the same): use u_i = v_i, so
    // U_pred = U_obs + correction; the correction is the rigid motion the drag imbalance asks for
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], rhs = [0, 0, 0];
    s.x.forEach((p, i) => {
      const m = tens[i], rx = p[0] - c[0], ry = p[1] - c[1], q = s.v[i];
      // Ω×r = (-Ω ry, Ω rx)
      const col = [[m[0], m[1]], [m[1], m[2]], [-m[0] * ry + m[1] * rx, -m[1] * ry + m[2] * rx]];
      const f = [m[0] * q[0] + m[1] * q[1], m[1] * q[0] + m[2] * q[1]];
      const rows = [[1, 0], [0, 1], [-ry, rx]];
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 3; k++) A[r][k] += rows[r][0] * col[k][0] + rows[r][1] * col[k][1];
        rhs[r] -= rows[r][0] * f[0] + rows[r][1] * f[1];
      }
    });
    const sol = solve3(A, rhs);
    pred[0] += vx + sol[0]; pred[1] += vy + sol[1]; spin += sol[2];
  }
  pred = pred.map((x) => x / ok.length); dragRes = dragRes.map((x) => x / ok.length);
  // predicted velocity is instantaneous; the body's centre velocity over the run is dx/T
  return {
    cells: n, seconds: +T.toFixed(2), length: +L.toFixed(3), maxBond: +maxBond.toFixed(3), brokenShare: +(broken / ok.length).toFixed(3),
    speed: +(Math.hypot(dx, dy) / T).toFixed(4), forward: +((dx * hx + dy * hy) / T).toFixed(4),
    rftForward: +(pred[0] * hx + pred[1] * hy).toFixed(4), rftSpeed: +Math.hypot(...pred).toFixed(4),
    meanV: +(Math.hypot(...ok.reduce((a2, s) => { let x = 0, y = 0; for (const q of s.v) { x += q[0] / n; y += q[1] / n; } return [a2[0] + x / ok.length, a2[1] + y / ok.length]; }, [0, 0]))).toFixed(4),
    dragImbalance: +Math.hypot(...dragRes).toFixed(4),
    bendAmp: bendAmp.map((x) => +x.toFixed(3)), meanBend: mean.map((x) => +x.toFixed(3)),
    lagPerCell: +lag.toFixed(3), waveCellsPerS: +(w / Math.max(1e-6, lag)).toFixed(2),
    bodyLengthsPerBeat: +(((dx * hx + dy * hy) / T) / (L * g.beat[1])).toFixed(4),
    trace: v.trace ? ok.map((s) => [s.t, ...com(s)]) : undefined,
  };
}

function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return [0, 0, 0];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

const runs = v.sweep ? JSON.parse(v.sweep) : [{}];
const base = JSON.parse(v.genome);
const results = [];
for (const o of runs) {
  const over = { ...base, ...o };
  const res = await run(over);
  results.push({ over, ...res });
  const { trace, ...show } = res;
  console.log(JSON.stringify(o), JSON.stringify(show));
}
if (v.out) fs.writeFileSync(v.out, JSON.stringify({ body: v.body, k: K, step: +v.step, results }, null, 1));
process.exit(0);
