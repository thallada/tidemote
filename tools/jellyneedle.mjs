// The needle and the jelly (K.tearSpread, docs/ecosystem.md, Jelly): stroke the needle across the biggest jelly body of a
// saved world with few piercers near, and photograph it every --step simulated seconds after, --secs frames.
//   tools/gpu-node.sh tools/jellyneedle.mjs --out runs/jelly/film/needle [--k '{...}'] [--zoom 250] [--secs 14] [--step 1]
// --video S: instead, a film of S simulated seconds, a frame every 1/--fps (15) of them, the stroke in it, encoded to
// OUT/needle.mp4 at --play (30) frames a second (so twice as fast as the world runs at 1x by default); with --piercers 1
// a body with a few piercers at it instead, and no needle; with --poke 1 the needle pricks the edge of a middling body
// (40-160 cells, framed whole) once, on its side away from the needle's shaft, so it is pierced there alone; with
// --edge 1 as --poke, but the needle held on the edge and drawn slowly along it for 3 s (as a finger on a phone);
// --hold 1 pressed just outside the edge and held there still for 4 s
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs } from './lib/args.mjs';
import { contactSheet } from './lib/sheet.mjs';
import { openPage, aim } from './pagelab.mjs';
import { loadBinWorld, unpackWorld } from './lib/world.mjs';
import { P_BYTES, FIRST_LIFE, CYST, DEFAULT_K } from '../src/shaders.js';
import { readGenome, growPlan, sheathOf, pierceOf } from '../src/genome.js';
const v = { world: 'runs/perf/worlds/jelly1m.bin', n: 1048576, out: 'runs/jelly/film/needle', zoom: 250, secs: 14, html: 'dist/tidemote.html',
  k: '{"lowEras":0,"eventPlan":"none@1000000000"}', ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const K = { ...DEFAULT_K, ...JSON.parse(v.k) };
const world = unpackWorld(fs.readFileSync(v.world));
const [W, H] = world.cpu.grid, cnt = world.cpu.count, NONE = 0xffffffff, PW = P_BYTES / 4;
const pu = new Uint32Array(world.gpu.parts), pf = new Float32Array(world.gpu.parts), it = new Uint32Array(world.gpu.intent);
const gu = new Uint32Array(world.gpu.genomes), gf = new Float32Array(world.gpu.genomes);
const gs = new Map(), gen = (k) => { if (!gs.has(k)) gs.set(k, readGenome(gu, gf, k)); return gs.get(k); };
const wrap = (d, L) => d - L * Math.round(d / L);
const cell = 1, gx = Math.ceil(W / cell), gy = Math.ceil(H / cell), J = new Map(), P = new Map();
for (let i = 0; i < cnt; i++) {
  const o = i * PW, kind = pu[o + 4];
  if (kind < FIRST_LIFE || (pu[o + 9] & 15) === CYST) continue;
  const g = gen(kind), key = Math.floor(pf[o] / cell) + gx * Math.floor(pf[o + 1] / cell);
  const bonded = it[i * 4 + 2] !== NONE || it[i * 4 + 3] !== NONE;
  if (sheathOf(g) && bonded && g.adhesion > K.adhMin && !growPlan(g, K) && (g.adhesion - K.tightFrom) / K.tightSpan <= 0.9) J.set(key, (J.get(key) || 0) + 1);
  if (pierceOf(g)) P.set(key, (P.get(key) || 0) + 1);
}
// the grid square with the most jelly round it (3x3) and fewest piercers (5x5)
let best = null;
for (const [key, n] of J) {
  const cx = key % gx, cy = Math.floor(key / gx);
  let j = 0, p = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const k2 = ((cx + dx + gx) % gx) + gx * ((cy + dy + gy) % gy);
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) j += J.get(k2) || 0;
    p += P.get(k2) || 0;
  }
  // (--piercers: a body with a few piercers at it, filmed without the needle, to see them tear it)
  const score = v.piercers ? (p >= 2 && p <= 8 ? j : -1) : j - 4 * p;
  if (!best || score > best.score) best = { score, j, p, x: (cx + 0.5) * cell, y: (cy + 0.5) * cell };
}
// --poke: the jelly bodies (bonded jelly cells of one species), a middling one with no piercers near, its edge cell
// farthest along the needle's shaft (so the shaft lies outside it), and a zoom that frames it
let poke = null;
if (v.edge || v.hold) v.poke = 1;
if (v.poke) {
  const jl = [], isJ = new Set();
  for (let i = 0; i < cnt; i++) {
    const o = i * PW, kind = pu[o + 4];
    if (kind < FIRST_LIFE || (pu[o + 9] & 15) === CYST) continue;
    const g = gen(kind), bonded = it[i * 4 + 2] !== NONE || it[i * 4 + 3] !== NONE;
    if (sheathOf(g) && bonded && g.adhesion > K.adhMin && !growPlan(g, K) && (g.adhesion - K.tightFrom) / K.tightSpan <= 0.9) { jl.push(i); isJ.add(i); }
  }
  const root = new Map(jl.map((i) => [i, i])), find = (j) => { while (root.get(j) !== j) { root.set(j, root.get(root.get(j))); j = root.get(j); } return j; };
  for (const i of jl) for (const m of [it[i * 4 + 2], it[i * 4 + 3]]) if (isJ.has(m) && pu[m * PW + 4] === pu[i * PW + 4]) root.set(find(i), find(m));
  // (every living cell by its grid square, to count who is near a body)
  const near = new Map();
  for (let i = 0; i < cnt; i++) { const o = i * PW; if (pu[o + 4] < FIRST_LIFE) continue; const key = Math.floor(pf[o] / cell) + gx * Math.floor(pf[o + 1] / cell); (near.get(key) || near.set(key, []).get(key)).push(i); }
  const bodies = new Map(); for (const i of jl) { const r = find(i); (bodies.get(r) || bodies.set(r, []).get(r)).push(i); }
  const dir = [0.86, 0.51];
  for (const b of bodies.values()) {
    if (b.length < 40 || b.length > 160) continue;
    const x0 = pf[b[0] * PW], y0 = pf[b[0] * PW + 1];
    let cx = 0, cy = 0; for (const i of b) { cx += wrap(pf[i * PW] - x0, W); cy += wrap(pf[i * PW + 1] - y0, H); }
    cx = x0 + cx / b.length; cy = y0 + cy / b.length;
    let R = 0, e = b[0], eb = -Infinity, mid = b[0], md = Infinity;
    for (const i of b) { const dx = wrap(pf[i * PW] - cx, W), dy = wrap(pf[i * PW + 1] - cy, H); R = Math.max(R, Math.hypot(dx, dy)); if (Math.hypot(dx, dy) < md) { md = Math.hypot(dx, dy); mid = i; } const a = dx * dir[0] + dy * dir[1]; if (a > eb) { eb = a; e = i; } }
    // (how alone it is: other species' living cells within its reach and 0.6 more, for each of its cells)
    let foreign = 0;
    const kind = pu[b[0] * PW + 4], reach = R + 0.6;
    for (let dy = -Math.ceil(reach); dy <= Math.ceil(reach); dy++) for (let dx = -Math.ceil(reach); dx <= Math.ceil(reach); dx++) {
      for (const j of near.get(((Math.floor(cx) + dx + gx) % gx) + gx * ((Math.floor(cy) + dy + gy) % gy)) || []) {
        if (pu[j * PW + 4] !== kind && Math.hypot(wrap(pf[j * PW] - cx, W), wrap(pf[j * PW + 1] - cy, H)) < reach) foreign++;
      }
    }
    const alone = foreign / b.length;
    if (!poke || alone < poke.alone) poke = { n: b.length, alone, x: cx, y: cy, R, id: pu[mid * PW + 7], mx: cx + wrap(pf[mid * PW] - cx, W), my: cy + wrap(pf[mid * PW + 1] - cy, H), ex: cx + wrap(pf[e * PW] - cx, W), ey: cy + wrap(pf[e * PW + 1] - cy, H) };
  }
  if (!poke) throw new Error('no middling jelly body without piercers near');
  best = { ...best, x: poke.x, y: poke.y };
  v.zoom = v.pokeZoom ? +v.pokeZoom : Math.max(120, Math.min(600, 330 / poke.R));
  console.log(`poke: a body of ${poke.n} jelly cells, ${poke.R.toFixed(2)} across from its middle, ${poke.alone.toFixed(2)} strangers a cell near, zoom ${v.zoom.toFixed(0)}`);
}
console.log(`spot: ${best.j} jelly cells round it, ${best.p} piercers near, at ${best.x.toFixed(1)}, ${best.y.toFixed(1)}`);
// (the render held at full scale: left to adapt, a busy GPU drew the film blurred)
const { page, close } = await openPage({ ...v, mature: 1, tmp: 'needle-', prefs: { scale: 1, density: 1, adapt: false, fps: 'auto' } });
await loadBinWorld(page, `data:application/octet-stream;base64,${fs.readFileSync(v.world).toString('base64')}`);
await page.evaluate(() => { const T = globalThis.__tidemote; T.setSpeed(0); T.look.set({ grain: 0 }, 1); });
await aim(page, [best.x, best.y], +v.zoom);
await page.waitForTimeout(1500);
const vp = await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), cxp = vp.width / 2, cyp = vp.height / 2;
const shots = [];
const shot = async (f, label) => { const file = `f${String(f).padStart(2, '0')}.png`; await page.screenshot({ path: path.join(v.out, file) }); shots.push({ file: path.join(v.out, file), label }); };
const run = (dt) => page.evaluate(async (dt) => { const T = globalThis.__tidemote, t0 = T.eng.simTime; T.setSpeed(1); while (T.eng.simTime < t0 + dt) await new Promise((r) => setTimeout(r, 15)); T.setSpeed(0); }, dt);
if (v.video) {
  // the stroke over its first 1.5 s, the world stepped a frame at a time, then on to --video seconds
  const fps = +(v.fps || 15), n = Math.round(+v.video * fps), strokeN = Math.round((v.hold ? 4 : v.edge ? 3 : v.poke ? 0.3 : 1.5) * fps);
  const step = (dt) => page.evaluate(async (dt) => { const T = globalThis.__tidemote, t0 = T.eng.simTime; T.setSpeed(1); while (T.eng.simTime < t0 + dt - 1e-4) await new Promise((r) => setTimeout(r, 4)); T.setSpeed(0); }, dt);
  for (let f = 0; f < Math.round(0.5 * fps); f++) { await step(1 / fps); await page.screenshot({ path: path.join(v.out, `v${String(f).padStart(4, '0')}.png`) }); }
  if (!v.piercers) await page.evaluate(() => globalThis.__tidemote.hand.set('needle'));
  let a = [cxp - 300, cyp - 140], b = [cxp + 260, cyp + 120];
  // (a prick: the needle down on the edge cell, still, for a few frames)
  if (poke) { a = [cxp + (poke.ex - poke.x) * +v.zoom, cyp + (poke.ey - poke.y) * +v.zoom]; b = a; }
  // (--hold: pressed and held still just outside the edge cell, a tenth of a unit out from the body's middle)
  if (v.hold) {
    const ox = poke.ex - poke.x, oy = poke.ey - poke.y, l = Math.hypot(ox, oy) || 1, z = +v.zoom;
    a = [cxp + (ox + ox / l * 0.1) * z, cyp + (oy + oy / l * 0.1) * z]; b = a;
  }
  // (--edge: along the edge, square to the way from the body's middle to its edge cell, 0.6 either side)
  if (v.edge) {
    const ox = poke.ex - poke.x, oy = poke.ey - poke.y, l = Math.hypot(ox, oy) || 1, tx = -oy / l, ty = ox / l, z = +v.zoom;
    const e = [cxp + ox * z, cyp + oy * z];
    a = [e[0] - tx * 0.6 * z, e[1] - ty * 0.6 * z]; b = [e[0] + tx * 0.6 * z, e[1] + ty * 0.6 * z];
  }
  let follow = poke ? [poke.ex, poke.ey] : null;
  if (!v.piercers) { await page.mouse.move(...a); if (!v.hover) await page.mouse.down(); }
  for (let f = Math.round(0.5 * fps); f < n; f++) {
    const k = f - Math.round(0.5 * fps);
    // (--wobble PX: a finger's tremor on a held needle, a few pixels at random each frame)
    if (v.wobble && k <= strokeN) await page.mouse.move(a[0] + (Math.random() - 0.5) * 2 * +v.wobble, a[1] + (Math.random() - 0.5) * 2 * +v.wobble);
    else if (!v.piercers && k <= strokeN) await page.mouse.move(a[0] + (b[0] - a[0]) * k / strokeN, a[1] + (b[1] - a[1]) * k / strokeN);
    if (!v.piercers && k === strokeN) { await page.mouse.up(); await page.evaluate(() => globalThis.__tidemote.hand.set('none')); await page.mouse.move(5, 5); }
    await step(1 / fps);
    // (--edge: how far the body's middle cell moved each frame, world units, for the log)
    if (v.hold) {
      // (--hold: the cells within 0.6 of the needle's point, their mean speed, world units a second)
      const tip = [poke.ex + (poke.ex - poke.x) / (Math.hypot(poke.ex - poke.x, poke.ey - poke.y) || 1) * 0.1, poke.ey + (poke.ey - poke.y) / (Math.hypot(poke.ex - poke.x, poke.ey - poke.y) || 1) * 0.1];
      // (by id from frame to frame: the needle sets where it pushes cells, which their velocities never show)
      const now = await page.evaluate(async (at) => {
        const res = await globalThis.__tidemote.eng.requestPick(at, 0.6, 0xffffffff, { maxOut: 20000, raw: true });
        const { u32, f32, count } = res.raw, o = {};
        for (let i = 0; i < count; i++) if (u32[i * 12 + 4] >= 5) o[u32[i * 12 + 7]] = [f32[i * 12], f32[i * 12 + 1]];
        return o;
      }, tip);
      let n = 0, sum = 0, big = 0, back = 0, moving = 0;
      const steps = {};
      for (const [id, p] of Object.entries(now)) {
        const q = globalThis.lastNear?.[id]; if (!q) continue;
        const dx = p[0] - q[0], dy = p[1] - q[1], d = Math.hypot(dx, dy);
        n++; sum += d; if (d > 0.05) big++;
        steps[id] = [dx, dy];
        // (jitter: a cell that moved this frame and the last, back against the way it went)
        const o = globalThis.lastSteps?.[id];
        if (o && d > 0.004 && Math.hypot(o[0], o[1]) > 0.004) { moving++; if (dx * o[0] + dy * o[1] < -0.5 * d * Math.hypot(o[0], o[1])) back++; }
      }
      globalThis.lastNear = now; globalThis.lastSteps = steps;
      if (moving) console.log(`f${f} reversals ${back}/${moving}`);
      const sp = n ? sum / n * fps : 0;
      console.log(`f${f} near-tip speed ${sp.toFixed(3)} jumps ${big}`);
    }
    if (v.edge || v.hold) {
      const pos = await page.evaluate(async ([id, at]) => {
        const res = await globalThis.__tidemote.eng.requestPick(at, 3, 0xffffffff, { maxOut: 20000, raw: true });
        const { u32, f32, count } = res.raw;
        for (let i = 0; i < count; i++) if (u32[i * 12 + 7] === id) return [f32[i * 12], f32[i * 12 + 1]];
        return null;
      }, [poke.id, [poke.mx, poke.my]]);
      if (pos && globalThis.lastPos) console.log(`f${f} moved ${Math.hypot(pos[0] - lastPos[0], pos[1] - lastPos[1]).toFixed(3)}`);
      globalThis.lastPos = pos;
    }
    // (after the prick the camera follows the body, by the cell nearest its middle, as the water carries it)
    if (poke && !v.edge && !v.hold && k > strokeN) {
      const now = await page.evaluate(async ([id, at]) => {
        const res = await globalThis.__tidemote.eng.requestPick(at, 3, 0xffffffff, { maxOut: 20000, raw: true });
        const { u32, f32, count } = res.raw;
        // (and how many cells near are torn and pierced, for the log)
        // (the camera on the pierced cells' middle, where the holes are, else on the body's middle cell)
        let here = null, torn = 0, pierced = 0, px = 0, py = 0;
        for (let i = 0; i < count; i++) {
          if (u32[i * 12 + 7] === id) here = [f32[i * 12], f32[i * 12 + 1]];
          const info = u32[i * 12 + 9];
          if (info & (1 << 30)) { torn++; if (info >>> 31) { pierced++; px += f32[i * 12] - at[0]; py += f32[i * 12 + 1] - at[1]; } }
        }
        if (pierced) here = [at[0] + px / pierced, at[1] + py / pierced];
        return here && [...here, torn, pierced];
      }, [poke.id, follow]);
      if (now && k % fps === 0) console.log(`t=${(k / fps).toFixed(0)} s: ${now[2]} torn, ${now[3]} pierced within 3`);
      if (now) { follow = [follow[0] + (now[0] - follow[0]) * 0.2, follow[1] + (now[1] - follow[1]) * 0.2]; await aim(page, follow, +v.zoom); }
    }
    await page.waitForTimeout(30);
    await page.screenshot({ path: path.join(v.out, `v${String(f).padStart(4, '0')}.png`) });
    if (f % 60 === 0) console.log(`frame ${f}/${n}`);
  }
  await close();
  console.log(`frames in ${v.out}; encode: ffmpeg -framerate ${+(v.play || 30)} -i ${v.out}/v%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 ${v.out}/needle.mp4`);
  process.exit(0);
}
await shot(0, 'before');
await page.evaluate(() => globalThis.__tidemote.hand.set('needle'));
await page.mouse.move(cxp - 260, cyp - 120);
await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
await page.mouse.down();
for (let s = 0; s <= 40; s++) { await page.mouse.move(cxp - 260 + 13 * s, cyp - 120 + 6 * s); await page.waitForTimeout(40); }
await page.mouse.up();
await page.evaluate(() => { const T = globalThis.__tidemote; T.setSpeed(0); T.hand.set('none'); });
await page.mouse.move(5, 5);
await shot(1, 'just after the stroke');
for (let f = 2; f <= +v.secs; f++) { await run(+(v.step || 1)); await page.waitForTimeout(150); await shot(f, `${(f - 1) * +(v.step || 1)} s after`); }
await contactSheet(page.context(), shots.filter((s, i) => i % 2 === 0 || i === 1), path.join(v.out, 'sheet.png'), { cols: 4, crop: [900, 560], scale: 0.5, title: 'needle through jelly' });
await close();
console.log(`done ${v.out}`);
