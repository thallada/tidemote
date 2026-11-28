// How steady a jelly's hull stays with the needle held near it, as the hull is drawn: every frame the hull's field
// (Engine._jellyField's texture, what fsJellyRim draws its edge from) is copied off the GPU, and about the needle's point
// the inside of the edge (the field above its level, fsJellyRim's) is compared with the frames before. The world runs
// at 1x in real time and the needle is pressed by the pointer as a finger would, with a tremor, so it is what a viewer
// sees on the page, not a stepped world.
//   tools/gpu-node.sh tools/jellyhold.mjs [--html dist/tidemote.html] [--at 0.1] [--tremor 2] [--secs 6] [--out runs/jelly/hold/X]
// --at D: the needle's point D world units out from a middling jelly body's edge cell (away from its middle; less than
// zero, inside); --tremor PX: the finger's tremor, CSS px (a wander about the point, Ornstein-Uhlenbeck, PX its spread);
// --shots 1|follow: photographs of the page about the point (follow: carried on with the body, by the cell nearest it) (--shotPx half a side, CSS px) before the press and 0.1-5 s after;
// --tap MS: pressed MS ms then let go (a tap; measured on as long); --every N, --stripFrom pierce: the sheet's frames
// every N steps from the first pierce; --hz: pointer moves a second; --drag PX: drawn along the edge at PX CSS px a second instead of held; --mode hold|hover|none (pressed, over the world unpressed, no needle: the control);
// --win W: world units about the point that are measured; --control S: seconds of the world alone first, measured too.
// Prints, for the control and the held needle: the edge's motion (world units a second, from texels that changed) and
// its flicker (texels that changed and changed back within 2 steps (frames drawn again unstepped are skipped), a share of the edge's texels per frame: a hull
// that drifts flickers not at all, one that jumps between shapes a lot) and its jumpy steps (a tenth of the edge back); writes OUT/hold.json and OUT/masks.png (the
// inside, a frame at a time, for the first --strip frames held). Also: pops (texels that changed 2 texels or more from
// the last step's edge: a jump), the frames after the first pierce apart (pierced), how far from the point the cells
// it pierced lay, and where the inside opened (0.5 and 1.5 s after the first pierce, against just before the press).
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
await page.evaluate(([win, linkR, at, v]) => {
  const T = globalThis.__tidemote, eng = T.eng, dev = eng.device, q = dev.queue;
  const ct = dev.createTexture.bind(dev);
  dev.createTexture = (d) => ct(d.label === 'jelly' ? { ...d, usage: d.usage | GPUTextureUsage.COPY_SRC } : d);
  if (eng.jelly[0]) { eng.jelly[0].tex.destroy(); eng.jelly[0] = null; }
  const half = (h) => { const s = h >> 15, e = (h >> 10) & 31, m = h & 1023; const x = e === 0 ? m / 1024 * 2 ** -14 : e === 31 ? (m ? NaN : Infinity) : (1 + m / 1024) * 2 ** (e - 15); return s ? -x : x; };
  const H16 = new Float32Array(65536); for (let i = 0; i < 65536; i++) H16[i] = half(i);
  const C = globalThis.__hold = { on: false, phase: '', frames: [], pend: [], pool: [], masks: [], prev: null, prev2: null, strip: 0, keep: 0, snaps: {}, pierceT: null, pierced: [], n: 0, every: v.every };
  // the cells the needle pierced (both of JELLY_TORN and JELLY_PIERCED: here only the needle pierces), each once, how
  // far from the point when first seen, a pick every tenth of a second while it is pressed
  const seen = new Set();
  C.watch = setInterval(async () => {
    if (!C.on || C.phase !== 'held') return;
    // (one pick at a time: a second asked for drops the first, so the photographs' picks wait for this one)
    if (C.picking) return;
    C.picking = true;
    const res = await eng.requestPick(at, 1.5, 0xffffffff, { maxOut: 20000, raw: true });
    C.picking = false;
    if (!res) return;
    const { u32, f32, count } = res.raw;
    for (let i = 0; i < count; i++) {
      if (u32[i * 12 + 4] < 5 || (u32[i * 12 + 9] >>> 30) !== 3 || seen.has(u32[i * 12 + 7])) continue;
      seen.add(u32[i * 12 + 7]);
      C.pierceT ??= res.simTime ?? eng.simTime;
      C.pierced.push({ t: eng.simTime, d: Math.hypot(f32[i * 12] - at[0], f32[i * 12 + 1] - at[1]) });
    }
  }, 100);
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
    // (pop: a texel that changed though the last step's inside or outside lay 2 texels all round it, a jump of the edge
    // faster than cells go, or a hole or a piece coming or going at once)
    let area = 0, edge = 0, chg = 0, back = 0, pop = 0, core = 0, coreN = 0;
    // (core: the texels within 0.06 of the point, the needle's own breadth, and how many of them are inside: where the
    // finger is, is the jelly cut?)
    const rc = 0.06 * p.ppu / p.step;
    const a = C.prev, b = C.prev2, same = a && a.length === n && (!b || b.length === n);
    for (let i = 0; i < n; i++) {
      if (m[i] === 2) continue;
      if (Math.hypot((i % p.ww) + 0.5 - p.cx, Math.floor(i / p.ww) + 0.5 - p.cy) < rc) { coreN++; if (m[i]) core++; }
      if (m[i]) {
        area++;
        const x = i % p.ww, y = (i / p.ww) | 0;
        if ((x > 0 && m[i - 1] === 0) || (x < p.ww - 1 && m[i + 1] === 0) || (y > 0 && m[i - p.ww] === 0) || (y < p.hh - 1 && m[i + p.ww] === 0)) edge++;
      }
      if (same && m[i] !== a[i]) {
        chg++; if (b && m[i] === b[i]) back++;
        const x = i % p.ww, y = (i / p.ww) | 0;
        let flat = true;
        for (let dy = -2; dy <= 2 && flat; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= p.ww || yy >= p.hh) continue;
          const q = a[yy * p.ww + xx];
          if (q !== 2 && q !== a[i]) { flat = false; break; }
        }
        if (flat) pop++;
      }
    }
    const ph = p.phase === 'held' && C.pierceT != null && p.t >= C.pierceT ? 'pierced' : p.phase;
    C.frames.push({ phase: ph, t: p.t, area, edge, chg: same ? chg : null, back: same && b ? back : null, pop: same ? pop : null, core: coreN ? core / coreN : null, px: p.step / p.ppu });
    // (the inside as it was just before the press, and half a second and a second and a half after the first pierce:
    // where the membrane opened)
    const snap = (k) => { C.snaps[k] = { w: p.ww, h: p.hh, cx: p.cx, cy: p.cy, px: p.step / p.ppu, m: Array.from(m) }; };
    if (p.phase === 'control') snap('pre');
    if (C.pierceT != null && p.t >= C.pierceT + 0.5 && !C.snaps.p05) snap('p05');
    if (C.pierceT != null && p.t >= C.pierceT + 1.5 && !C.snaps.p15) snap('p15');
    if (C.keep > 0 && (v.stripFrom !== 'pierce' || C.pierceT != null) && C.n++ % C.every === 0) { C.keep--; C.masks.push({ w: p.ww, h: p.hh, m: Array.from(m) }); }
    C.prev2 = same ? a : null; C.prev = m;
  }
}, [+v.win, K.linkR, tip, { every: +(v.every || 1), stripFrom: v.stripFrom || 'press' }]);

// --ablate cut|push: the needle's stroke cuts no bonds (and tears nothing it crossed), or its point and shaft push
// nothing aside (and prick nothing), to tell which shakes the hull
if (v.ablate) await page.evaluate((ab) => {
  const T = globalThis.__tidemote, up = T.hand.update.bind(T.hand);
  T.hand.update = (...a) => { up(...a); if (ab === 'cut') T.eng.hand[17] = 0; if (ab === 'push') T.eng.hand.fill(0, 28, 32); };
}, v.ablate);
// --still 1: the water's currents stilled (the tide's waves' strength held at 0 each frame), so a body stays where it
// is and where the jelly opened can be told against where the needle was pressed
if (v.still) await page.evaluate(() => {
  const T = globalThis.__tidemote, up = T.hand.update.bind(T.hand);
  T.hand.update = (...a) => { up(...a); for (let k = 0; k < 4; k++) T.eng.waves[k * 4 + 3] = 0; };
});
const phase = (name, keep = 0) => page.evaluate(([name, keep]) => { const C = globalThis.__hold; C.on = true; C.phase = name; C.keep = keep; }, [name, keep]);
await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
await page.waitForTimeout(500);
// the world alone first (the control: what a hull's own drift and its cells' motion give)
await phase('control');
await page.waitForTimeout(+v.control * 1000);
// then the needle, pressed at the point, a finger's tremor about it
if (v.mode !== 'none') await page.evaluate(() => globalThis.__tidemote.hand.set('needle'));
await page.mouse.move(sx, sy);
// (--shots: the page itself photographed about the point, just before the press and at these seconds after it)
const SHOTS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5], half = +(v.shotPx || 160), shots = [];
// (each about where the point was pressed as the water carries the body on: by the cell nearest the point then)
let anchor = null;
const cellAt = (id) => page.evaluate(async ([id, at]) => {
  const C = globalThis.__hold;
  while (C.picking) await new Promise((r) => setTimeout(r, 5));
  C.picking = true;
  const res = await globalThis.__tidemote.eng.requestPick(at, 1, 0xffffffff, { maxOut: 20000, raw: true });
  C.picking = false;
  if (!res) return null;
  const { u32, f32, count } = res.raw;
  let best = null, bd = Infinity;
  for (let i = 0; i < count; i++) {
    if (u32[i * 12 + 4] < 5) continue;
    if (id != null ? u32[i * 12 + 7] === id : Math.hypot(f32[i * 12] - at[0], f32[i * 12 + 1] - at[1]) < bd) { bd = Math.hypot(f32[i * 12] - at[0], f32[i * 12 + 1] - at[1]); best = { id: u32[i * 12 + 7], x: f32[i * 12], y: f32[i * 12 + 1] }; }
  }
  return best;
}, [id, anchor ? [anchor.x, anchor.y] : tip]);
const shoot = async (label) => {
  const file = path.join(v.out, `s${String(shots.length).padStart(2, '0')}.png`);
  let cx = sx, cy = sy;
  if (v.shots === 'follow') {
    if (!anchor) { const c = await cellAt(null); if (c) anchor = { id: c.id, x0: c.x, y0: c.y, x: c.x, y: c.y }; }
    else { const now = await cellAt(anchor.id); if (now) Object.assign(anchor, { x: now.x, y: now.y }); }
    if (anchor) { cx += (anchor.x - anchor.x0) * zoom / vp.dpr; cy += (anchor.y - anchor.y0) * zoom / vp.dpr; }
    cx = Math.min(vp.width - half, Math.max(half, cx)); cy = Math.min(vp.height - half, Math.max(half, cy));
  }
  await page.screenshot({ path: file, clip: { x: Math.round(cx - half), y: Math.round(cy - half), width: 2 * half, height: 2 * half } });
  shots.push({ file, label, cam: await page.evaluate(() => { const T = globalThis.__tidemote; return [T.cam.x, T.cam.y, T.cam.zoom, T.state.follow, T.state.selected ?? null]; }) });
};
if (v.shots) await shoot('before');
if (v.mode === 'hold') await page.mouse.down();
await phase('held', +v.strip);
const t0 = Date.now(), tau = 0.08, dtp = 1 / +v.hz;
let wx = 0, wy = 0, moves = 0, tapped = false;
while (Date.now() - t0 < +v.secs * 1000) {
  // (Ornstein-Uhlenbeck: wanders about the point with spread --tremor, a tenth of a second to forget)
  const a = Math.exp(-dtp / tau), s = +v.tremor * Math.sqrt(1 - a * a);
  wx = wx * a + s * gauss(); wy = wy * a + s * gauss();
  // (--drag PX: drawn along the edge, square to the way out, PX CSS px a second, the tremor on it)
  const dg = +(v.drag || 0) * (Date.now() - t0) / 1000;
  if (v.shots && shots.length - 1 < SHOTS.length && (Date.now() - t0) / 1000 >= SHOTS[shots.length - 1]) await shoot(`${SHOTS[shots.length - 1]} s`);
  if (v.mode === 'hold' && +(v.tap || 0) && Date.now() - t0 > +v.tap && !tapped) { tapped = true; await page.mouse.up(); }
  if ((+v.tremor > 0 || dg) && !tapped) { await page.mouse.move(sx + wx - oy / ol * dg, sy + wy + ox / ol * dg); moves++; }
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
if (v.mode === 'hold' && !tapped) await page.mouse.up();
await page.waitForTimeout(300);
const C = await page.evaluate(() => { const C = globalThis.__hold; clearInterval(C.watch); return { frames: C.frames, masks: C.masks, snaps: C.snaps, pierced: C.pierced, pierceT: C.pierceT }; });
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
  // (pops a share of the edge each step, and the steps in which a twentieth of the edge or more popped)
  const pp = f.filter((x) => x.pop != null), pops = pp.reduce((s, x) => s + x.pop / x.edge, 0) / Math.max(1, pp.length);
  const popSteps = pp.filter((x) => x.pop / x.edge >= 0.05).length / Math.max(1, pp.length);
  const cf = C.frames.filter((x) => x.phase === ph && x.core != null), core = cf.reduce((s, x) => s + x.core, 0) / Math.max(1, cf.length);
  return { frames: f.length, fps: dt > 0 ? 1 / dt : null, edge, area, motion, flicker, flickerP90: p90, jumpy, pops, popSteps, core, areaFirst: f[0].area, areaLast: f[f.length - 1].area };
};
// where it opened: inside before the press and outside after, how far from the point (world units; the water's drift
// and the body's own changes open some too, far from the point as near)
const opened = (k) => {
  const a = C.snaps.pre, b = C.snaps[k];
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  const d = [];
  for (let i = 0; i < a.m.length; i++) if (a.m[i] === 1 && b.m[i] === 0) d.push(Math.hypot((i % a.w) + 0.5 - a.cx, Math.floor(i / a.w) + 0.5 - a.cy) * a.px);
  d.sort((x, y) => x - y);
  return { texels: d.length, area: d.length * a.px * a.px, p50: d[Math.floor(d.length / 2)] ?? null, p90: d[Math.floor(d.length * 0.9)] ?? null };
};
if (shots.length) console.log(`shots: ${shots.map((s) => `${path.basename(s.file)} ${s.label} cam ${JSON.stringify(s.cam)}`).join('\n  ')}`);
const pd = C.pierced.map((x) => x.d).sort((a, b) => a - b);
const pierce = { n: pd.length, first: C.pierceT, nearest: pd[0] ?? null, median: pd[Math.floor(pd.length / 2)] ?? null, farthest: pd[pd.length - 1] ?? null, open05: opened('p05'), open15: opened('p15') };
const res = { args: v, body, tip, moves, torn, pierce, control: sum('control'), held: sum('held'), pierced: sum('pierced'), frames: C.frames, pierces: C.pierced };
fs.writeFileSync(path.join(v.out, 'hold.json'), JSON.stringify(res));
for (const ph of ['control', 'held', 'pierced']) {
  const s = res[ph];
  if (!s.edge) { console.log(`${ph.padEnd(8)} ${s.frames} frames`); continue; }
  console.log(`${ph.padEnd(8)} ${s.frames} frames${s.fps ? ` at ${s.fps.toFixed(0)}/s sim` : ''}  edge ${s.edge?.toFixed(0)} texels  motion ${s.motion?.toFixed(3)} u/s  flicker ${(100 * (s.flicker ?? 0)).toFixed(2)}% (p90 ${(100 * (s.flickerP90 ?? 0)).toFixed(2)}%)  jumpy steps ${(100 * (s.jumpy ?? 0)).toFixed(1)}%  pops ${(100 * s.pops).toFixed(2)}% (steps ${(100 * s.popSteps).toFixed(1)}%)  under the point ${(100 * s.core).toFixed(0)}% inside  area ${s.areaFirst} -> ${s.areaLast}`);
}
const fx = (x) => (x == null ? '-' : x.toFixed(2));
console.log(`pierced ${pierce.n} cells, from the point: nearest ${fx(pierce.nearest)} median ${fx(pierce.median)} farthest ${fx(pierce.farthest)}`);
for (const k of ['open05', 'open15']) if (pierce[k]) console.log(`opened ${k === 'open05' ? '0.5' : '1.5'} s after: ${pierce[k].area.toFixed(3)} sq units, from the point median ${fx(pierce[k].p50)} p90 ${fx(pierce[k].p90)}`);
console.log(`after: ${torn.torn} of ${torn.cells} cells within ${v.win} torn, ${torn.pierced} pierced (both bits: a tail's cell counts as pierced too)`);
function gauss() { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }
