// How steady a jelly's hull stays with the needle held near it, as the hull is drawn: every frame the hull's field
// (Engine._jellyField's texture, what fsJellyRim draws its edge from) is copied off the GPU, and about the needle's point
// the inside of the edge (the field above its level, fsJellyRim's) is compared with the frames before. The world runs
// at 1x in real time and the needle is pressed by the pointer as a finger would, with a tremor, so it is what a viewer
// sees on the page, not a stepped world.
//   tools/gpu-node.sh tools/jellyhold.mjs [--html dist/tidemote.html] [--at 0.1] [--tremor 2] [--secs 6] [--out runs/jelly/hold/X]
// --at D: the needle's point D world units out from a middling jelly body's edge cell (away from its middle; less than
// zero, inside); --tremor PX: the finger's tremor, CSS px (a wander about the point, Ornstein-Uhlenbeck, PX its spread);
// --hz: pointer moves a second; --drag PX: drawn along the edge at PX CSS px a second instead of held; --mode hold|hover|none (pressed, over the world unpressed, no needle: the control);
// --win W: world units about the point that are measured; --control S: seconds of the world alone first, measured too.
// Prints, for the control and the held needle: the edge's motion (world units a second, from texels that changed) and
// its flicker (texels that changed and changed back within 2 steps (frames drawn again unstepped are skipped), a share of the edge's texels per frame: a hull
// that drifts flickers not at all, one that jumps between shapes a lot) and its jumpy steps (a tenth of the edge back); writes OUT/hold.json and OUT/masks.png (the
// inside, a frame at a time, for the first --strip frames held).
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs } from './lib/args.mjs';
import { openPage, aim } from './pagelab.mjs';
import { loadBinWorld, unpackWorld } from './lib/world.mjs';
import { P_BYTES, FIRST_LIFE, CYST, DEFAULT_K } from '../src/shaders.js';
import { readGenome, growPlan, sheathOf } from '../src/genome.js';
const v = { world: 'runs/perf/worlds/jelly1m.bin', n: 1048576, out: 'runs/jelly/hold/x', zoom: 0, secs: 6, control: 3, at: 0.1, tremor: 2, hz: 120,
  mode: 'hold', win: 1, strip: 48, html: 'dist/tidemote.html', k: '{"lowEras":0,"eventPlan":"none@1000000000"}', pick: 0, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const K = { ...DEFAULT_K, ...JSON.parse(v.k) };
const world = unpackWorld(fs.readFileSync(v.world));
const [W, H] = world.cpu.grid, cnt = world.cpu.count, NONE = 0xffffffff, PW = P_BYTES / 4;
const pu = new Uint32Array(world.gpu.parts), pf = new Float32Array(world.gpu.parts), it = new Uint32Array(world.gpu.intent);
const gu = new Uint32Array(world.gpu.genomes), gf = new Float32Array(world.gpu.genomes);
const gs = new Map(), gen = (k) => { if (!gs.has(k)) gs.set(k, readGenome(gu, gf, k)); return gs.get(k); };
const wrap = (d, L) => d - L * Math.round(d / L);
// the jelly bodies (bonded jelly cells of one species, as the saved world has them); the middling ones (40-160 cells)
// with fewest strangers about them, the --pick'th of those
const jl = [], isJ = new Set();
for (let i = 0; i < cnt; i++) {
  const o = i * PW, kind = pu[o + 4];
  if (kind < FIRST_LIFE || (pu[o + 9] & 15) === CYST) continue;
  const g = gen(kind), bonded = it[i * 4 + 2] !== NONE || it[i * 4 + 3] !== NONE;
  if (sheathOf(g) && bonded && g.adhesion > K.adhMin && !growPlan(g, K) && (g.adhesion - K.tightFrom) / K.tightSpan <= 0.9) { jl.push(i); isJ.add(i); }
}
const root = new Map(jl.map((i) => [i, i])), find = (j) => { while (root.get(j) !== j) { root.set(j, root.get(root.get(j))); j = root.get(j); } return j; };
for (const i of jl) for (const m of [it[i * 4 + 2], it[i * 4 + 3]]) if (isJ.has(m) && pu[m * PW + 4] === pu[i * PW + 4]) root.set(find(i), find(m));
const near = new Map();
for (let i = 0; i < cnt; i++) { const o = i * PW; if (pu[o + 4] < FIRST_LIFE) continue; const key = Math.floor(pf[o]) + W * Math.floor(pf[o + 1]); (near.get(key) || near.set(key, []).get(key)).push(i); }
const bodies = new Map(); for (const i of jl) { const r = find(i); (bodies.get(r) || bodies.set(r, []).get(r)).push(i); }
const cands = [];
for (const b of bodies.values()) {
  if (b.length < 40 || b.length > 160) continue;
  const x0 = pf[b[0] * PW], y0 = pf[b[0] * PW + 1];
  let cx = 0, cy = 0; for (const i of b) { cx += wrap(pf[i * PW] - x0, W); cy += wrap(pf[i * PW + 1] - y0, H); }
  cx = x0 + cx / b.length; cy = y0 + cy / b.length;
  // (its edge cell farthest along the needle's shaft, so the shaft lies outside the body)
  let R = 0, e = b[0], eb = -Infinity;
  for (const i of b) { const dx = wrap(pf[i * PW] - cx, W), dy = wrap(pf[i * PW + 1] - cy, H); R = Math.max(R, Math.hypot(dx, dy)); const a = dx * 0.86 + dy * 0.51; if (a > eb) { eb = a; e = i; } }
  let foreign = 0;
  const kind = pu[b[0] * PW + 4], reach = R + 0.6;
  for (let dy = -Math.ceil(reach); dy <= Math.ceil(reach); dy++) for (let dx = -Math.ceil(reach); dx <= Math.ceil(reach); dx++) {
    for (const j of near.get(((Math.floor(cx) + dx + W) % W) + W * ((Math.floor(cy) + dy + H) % H)) || []) {
      if (pu[j * PW + 4] !== kind && Math.hypot(wrap(pf[j * PW] - cx, W), wrap(pf[j * PW + 1] - cy, H)) < reach) foreign++;
    }
  }
  cands.push({ n: b.length, alone: foreign / b.length, x: cx, y: cy, R, ex: cx + wrap(pf[e * PW] - cx, W), ey: cy + wrap(pf[e * PW + 1] - cy, H) });
}
cands.sort((a, b) => a.alone - b.alone);
const body = cands[+v.pick];
if (!body) throw new Error('no middling jelly body');
const zoom = +v.zoom || Math.max(120, Math.min(600, 330 / body.R));
// the needle's point: --at out from the edge cell, away from the body's middle
const ox = body.ex - body.x, oy = body.ey - body.y, ol = Math.hypot(ox, oy) || 1;
const tip = [body.ex + ox / ol * +v.at, body.ey + oy / ol * +v.at];
console.log(`body of ${body.n} jelly cells, ${body.R.toFixed(2)} across from its middle, ${body.alone.toFixed(2)} strangers a cell; zoom ${zoom.toFixed(0)}; needle ${(+v.at).toFixed(2)} out from its edge; ${v.html}`);

const { page, close } = await openPage({ ...v, mature: 1, tmp: 'hold-', prefs: { scale: 1, density: 1, adapt: false, fps: 'auto' } });
await loadBinWorld(page, `data:application/octet-stream;base64,${fs.readFileSync(v.world).toString('base64')}`);
await page.evaluate(() => { const T = globalThis.__tidemote; T.setSpeed(0); T.look.set({ grain: 0 }, 1); });
await aim(page, [body.x, body.y], zoom);
await page.waitForTimeout(1500);
const vp = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
const sx = vp.width / 2 + (tip[0] - body.x) * zoom / vp.dpr, sy = vp.height / 2 + (tip[1] - body.y) * zoom / vp.dpr;

// The capture, in the page: the field's texture made copyable (made again with COPY_SRC), copied after the field is
// drawn each frame into a buffer of a pool, mapped once the frame is submitted, and the window about the point read.
await page.evaluate(([win, linkR, at]) => {
  const T = globalThis.__tidemote, eng = T.eng, dev = eng.device, q = dev.queue;
  const ct = dev.createTexture.bind(dev);
  dev.createTexture = (d) => ct(d.label === 'jelly' ? { ...d, usage: d.usage | GPUTextureUsage.COPY_SRC } : d);
  if (eng.jelly[0]) { eng.jelly[0].tex.destroy(); eng.jelly[0] = null; }
  const half = (h) => { const s = h >> 15, e = (h >> 10) & 31, m = h & 1023; const x = e === 0 ? m / 1024 * 2 ** -14 : e === 31 ? (m ? NaN : Infinity) : (1 + m / 1024) * 2 ** (e - 15); return s ? -x : x; };
  const H16 = new Float32Array(65536); for (let i = 0; i < 65536; i++) H16[i] = half(i);
  const C = globalThis.__hold = { on: false, phase: '', frames: [], pend: [], pool: [], masks: [], prev: null, prev2: null, strip: 0, keep: 0 };
  const orig = eng._jellyField;
  eng._jellyField = function (enc, k, data) {
    orig.call(this, enc, k, data);
    if (k !== 0 || !C.on) return;
    const j = this.jelly[0], v = new Float32Array(data);
    if (!this.sceneBG[0].jelly?.on || !j) { C.frames.push({ phase: C.phase, t: this.simTime, off: 1 }); return; }
    // (the window about the point, in the field's texels: the view's cam at its middle)
    const ppu = v[6], step = ppu >= 400 ? 8 : 4, cx = (v[4] / 2 + (at[0] - globalThis.__tidemote.cam.x) * ppu) / step, cy = (v[5] / 2 + (at[1] - globalThis.__tidemote.cam.y) * ppu) / step;
    const r = Math.ceil(win * ppu / step), x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r));
    const ww = Math.min(j.w, Math.ceil(cx + r)) - x0, hh = Math.min(j.h, Math.ceil(cy + r)) - y0;
    if (ww <= 0 || hh <= 0) return;
    const bpr = Math.ceil(ww * 8 / 256) * 256, size = bpr * hh;
    let buf = C.pool.find((b) => b.size >= size && !b.busy);
    if (!buf) { buf = dev.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }); C.pool.push(buf); }
    buf.busy = true;
    enc.copyTextureToBuffer({ texture: j.tex, origin: [x0, y0] }, { buffer: buf, bytesPerRow: bpr }, [ww, hh]);
    C.pend.push({ buf, ww, hh, bpr, ppu, step, t: this.simTime, phase: C.phase, cx: cx - x0, cy: cy - y0, r });
  };
  const sub = q.submit.bind(q);
  q.submit = (cbs) => {
    sub(cbs);
    const go = C.pend.splice(0);
    for (const p of go) p.buf.mapAsync(GPUMapMode.READ).then(() => { read(p); p.buf.unmap(); p.buf.busy = false; });
  };
  // the inside (fsJellyRim's: the field above its level, raised where the field is flat) in a disc about the point
  function read(p) {
    // (a frame drawn again with the world not stepped since shows the same field: only steps are compared)
    if (p.t === C.lastT) return;
    C.lastT = p.t;
    const u16 = new Uint16Array(p.buf.getMappedRange(0, p.bpr * p.hh)), row = p.bpr / 2, n = p.ww * p.hh, m = new Uint8Array(n);
    for (let y = 0; y < p.hh; y++) for (let x = 0; x < p.ww; x++) {
      const dx = x + 0.5 - p.cx, dy = y + 0.5 - p.cy;
      if (dx * dx + dy * dy > p.r * p.r) { m[y * p.ww + x] = 2; continue; }
      const o = y * row + x * 4, f = H16[u16[o]], gx = H16[u16[o + 1]], gy = H16[u16[o + 2]];
      const slope = Math.max(Math.hypot(gx, gy), 1e-3), c = Math.min(1, Math.max(0, 1 - slope * linkR / 1.2));
      m[y * p.ww + x] = f >= 0.3 * 0.3 && f > 0.3 + 0.5 * c * c ? 1 : 0;
    }
    // (frames in the order drawn: a map that comes back late is still in order, the queue keeps it)
    let area = 0, edge = 0, chg = 0, back = 0;
    const a = C.prev, b = C.prev2, same = a && a.length === n && (!b || b.length === n);
    for (let i = 0; i < n; i++) {
      if (m[i] === 2) continue;
      if (m[i]) {
        area++;
        const x = i % p.ww, y = (i / p.ww) | 0;
        if ((x > 0 && m[i - 1] === 0) || (x < p.ww - 1 && m[i + 1] === 0) || (y > 0 && m[i - p.ww] === 0) || (y < p.hh - 1 && m[i + p.ww] === 0)) edge++;
      }
      if (same && m[i] !== a[i]) { chg++; if (b && m[i] === b[i]) back++; }
    }
    C.frames.push({ phase: p.phase, t: p.t, area, edge, chg: same ? chg : null, back: same && b ? back : null, px: p.step / p.ppu });
    if (C.keep > 0) { C.keep--; C.masks.push({ w: p.ww, h: p.hh, m: Array.from(m) }); }
    C.prev2 = same ? a : null; C.prev = m;
  }
}, [+v.win, K.linkR, tip]);

// --ablate cut|push: the needle's stroke cuts no bonds (and tears nothing it crossed), or its point and shaft push
// nothing aside (and prick nothing), to tell which shakes the hull
if (v.ablate) await page.evaluate((ab) => {
  const T = globalThis.__tidemote, up = T.hand.update.bind(T.hand);
  T.hand.update = (...a) => { up(...a); if (ab === 'cut') T.eng.hand[17] = 0; if (ab === 'push') T.eng.hand.fill(0, 28, 32); };
}, v.ablate);
const phase = (name, keep = 0) => page.evaluate(([name, keep]) => { const C = globalThis.__hold; C.on = true; C.phase = name; C.keep = keep; }, [name, keep]);
await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
await page.waitForTimeout(500);
// the world alone first (the control: what a hull's own drift and its cells' motion give)
await phase('control');
await page.waitForTimeout(+v.control * 1000);
// then the needle, pressed at the point, a finger's tremor about it
if (v.mode !== 'none') await page.evaluate(() => globalThis.__tidemote.hand.set('needle'));
await page.mouse.move(sx, sy);
if (v.mode === 'hold') await page.mouse.down();
await phase('held', +v.strip);
const t0 = Date.now(), tau = 0.08, dtp = 1 / +v.hz;
let wx = 0, wy = 0, moves = 0;
while (Date.now() - t0 < +v.secs * 1000) {
  // (Ornstein-Uhlenbeck: wanders about the point with spread --tremor, a tenth of a second to forget)
  const a = Math.exp(-dtp / tau), s = +v.tremor * Math.sqrt(1 - a * a);
  wx = wx * a + s * gauss(); wy = wy * a + s * gauss();
  // (--drag PX: drawn along the edge, square to the way out, PX CSS px a second, the tremor on it)
  const dg = +(v.drag || 0) * (Date.now() - t0) / 1000;
  if (+v.tremor > 0 || dg) { await page.mouse.move(sx + wx - oy / ol * dg, sy + wy + ox / ol * dg); moves++; }
  await page.waitForTimeout(1000 * dtp);
}
await page.evaluate(() => { globalThis.__hold.on = false; });
// (what the needle did: cells torn and pierced within --win of the point, at its end)
const torn = await page.evaluate(async ([at, r]) => {
  const res = await globalThis.__tidemote.eng.requestPick(at, r, 0xffffffff, { maxOut: 20000, raw: true });
  const { u32, count } = res.raw;
  let torn = 0, pierced = 0, cells = 0;
  for (let i = 0; i < count; i++) { if (u32[i * 12 + 4] < 5) continue; cells++; const info = u32[i * 12 + 9]; if (info & (1 << 30)) { torn++; if (info >>> 31) pierced++; } }
  return { cells, torn, pierced };
}, [tip, +v.win]);
if (v.mode === 'hold') await page.mouse.up();
await page.waitForTimeout(300);
const C = await page.evaluate(() => ({ frames: globalThis.__hold.frames, masks: globalThis.__hold.masks }));
// the inside a frame at a time, drawn in the page into one sheet (white: inside; grey: outside the window)
const png = await page.evaluate((masks) => {
  if (!masks.length) return null;
  const cols = 12, w = masks[0].w, h = masks[0].h, cv = document.createElement('canvas');
  cv.width = cols * (w + 2); cv.height = Math.ceil(masks.length / cols) * (h + 2);
  const g = cv.getContext('2d'), img = g.createImageData(cv.width, cv.height);
  masks.forEach((mk, k) => {
    const X = (k % cols) * (w + 2), Y = Math.floor(k / cols) * (h + 2);
    for (let y = 0; y < mk.h; y++) for (let x = 0; x < mk.w; x++) {
      const c = mk.m[y * mk.w + x] === 1 ? 255 : mk.m[y * mk.w + x] === 2 ? 60 : 0, o = ((Y + y) * cv.width + X + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = c; img.data[o + 3] = 255;
    }
  });
  g.putImageData(img, 0, 0);
  return cv.toDataURL('image/png').split(',')[1];
}, C.masks);
await close();
if (png) fs.writeFileSync(path.join(v.out, 'masks.png'), Buffer.from(png, 'base64'));
const sum = (ph) => {
  const f = C.frames.filter((x) => x.phase === ph && x.chg != null && x.edge > 0);
  if (f.length < 2) return { frames: f.length };
  const dt = (f[f.length - 1].t - f[0].t) / (f.length - 1);
  const edge = f.reduce((s, x) => s + x.edge, 0) / f.length;
  const motion = f.reduce((s, x) => s + x.chg / x.edge, 0) / f.length * f[0].px / Math.max(dt, 1e-6);
  const fb = f.filter((x) => x.back != null);
  const flicker = fb.reduce((s, x) => s + x.back / x.edge, 0) / Math.max(1, fb.length);
  // (the worst tenth of frames: a jump now and then shows there)
  const sorted = fb.map((x) => x.back / x.edge).sort((a, b) => a - b), p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const area = f.reduce((s, x) => s + x.area, 0) / f.length;
  // (steps in which a tenth of the edge or more went back to what it was two steps before: a jump seen)
  const jumpy = fb.filter((x) => x.back / x.edge >= 0.1).length / Math.max(1, fb.length);
  return { frames: f.length, fps: dt > 0 ? 1 / dt : null, edge, area, motion, flicker, flickerP90: p90, jumpy, areaFirst: f[0].area, areaLast: f[f.length - 1].area };
};
const res = { args: v, body, tip, moves, torn, control: sum('control'), held: sum('held'), frames: C.frames };
fs.writeFileSync(path.join(v.out, 'hold.json'), JSON.stringify(res));
for (const ph of ['control', 'held']) {
  const s = res[ph];
  console.log(`${ph.padEnd(8)} ${s.frames} frames${s.fps ? ` at ${s.fps.toFixed(0)}/s sim` : ''}  edge ${s.edge?.toFixed(0)} texels  motion ${s.motion?.toFixed(3)} u/s  flicker ${(100 * (s.flicker ?? 0)).toFixed(2)}% (p90 ${(100 * (s.flickerP90 ?? 0)).toFixed(2)}%)  jumpy steps ${(100 * (s.jumpy ?? 0)).toFixed(1)}%  area ${s.areaFirst} -> ${s.areaLast}`);
}
console.log(`after: ${torn.torn} of ${torn.cells} cells within ${v.win} torn, ${torn.pierced} pierced (both bits: a tail's cell counts as pierced too)`);
function gauss() { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }
