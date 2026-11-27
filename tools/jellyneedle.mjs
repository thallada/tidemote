// The needle and the jelly (K.tearSpread, docs/ecosystem.md, Jelly): stroke the needle across the biggest jelly body of a
// saved world with few piercers near, and photograph it every --step simulated seconds after, --secs frames.
//   tools/gpu-node.sh tools/jellyneedle.mjs --out runs/jelly/film/needle [--k '{...}'] [--zoom 250] [--secs 14] [--step 1]
// --video S: instead, a film of S simulated seconds, a frame every 1/--fps (15) of them, the stroke in it, encoded to
// OUT/needle.mp4 at --play (30) frames a second (so twice as fast as the world runs at 1x by default); with --piercers 1
// a body with a few piercers at it instead, and no needle
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
  const fps = +(v.fps || 15), n = Math.round(+v.video * fps), strokeN = Math.round(1.5 * fps);
  const step = (dt) => page.evaluate(async (dt) => { const T = globalThis.__tidemote, t0 = T.eng.simTime; T.setSpeed(1); while (T.eng.simTime < t0 + dt - 1e-4) await new Promise((r) => setTimeout(r, 4)); T.setSpeed(0); }, dt);
  for (let f = 0; f < Math.round(0.5 * fps); f++) { await step(1 / fps); await page.screenshot({ path: path.join(v.out, `v${String(f).padStart(4, '0')}.png`) }); }
  if (!v.piercers) await page.evaluate(() => globalThis.__tidemote.hand.set('needle'));
  const a = [cxp - 300, cyp - 140], b = [cxp + 260, cyp + 120];
  if (!v.piercers) { await page.mouse.move(...a); await page.mouse.down(); }
  for (let f = Math.round(0.5 * fps); f < n; f++) {
    const k = f - Math.round(0.5 * fps);
    if (!v.piercers && k <= strokeN) await page.mouse.move(a[0] + (b[0] - a[0]) * k / strokeN, a[1] + (b[1] - a[1]) * k / strokeN);
    if (!v.piercers && k === strokeN) { await page.mouse.up(); await page.evaluate(() => globalThis.__tidemote.hand.set('none')); await page.mouse.move(5, 5); }
    await step(1 / fps);
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
