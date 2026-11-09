// A body picked: the full interface (1280x720 at device scale 6, 8K HEVC, as ui.mjs) over a still camera, the
// pointer gliding to a many-celled body and clicking it, the inspector opening on it, the body staying in frame for
// the whole take. Bodies are found from the view's cells and their bonds (a raw pick: the bonded components of five
// cells or more), each measured over two seconds, and the largest of the slowest taken; the camera is set so it sits
// left of centre (the inspector opens on the right), measured again, and the click aimed where it will be then.
//   tools/gpu-node.sh tools/promo/pick.mjs --out /mnt/d/tidemote-promo/lib2/p01 --mature 1500 [--takes 3] [--z 200]
import { cliArgs, aim, openOffline, MEDIA, S, timeline, ease } from './olab.mjs';

const v = { out: MEDIA + '/p01', mature: 1500, takes: 3, z: 200, secs: 10, ...cliArgs() };
const W = 1280, H = 720;
const TRACK = ['#spec', '#spec-tabs', '#spec-body', '#spec-acts', '#viewer', '.mv-dial', '.mv-drives', '.mv', '#hud', '#rail', '#dock', '#feed', '#__ptr'];
const P = await openOffline({ ...v, ui: true, vw: W, vh: H, scale: +(v.scale ?? 6), hevc: true, track: TRACK, notes: 0 });
const { page, T, setSpeed, wait, spots, esc } = P;
const log = (...a) => console.log(`[${v.out.split('/').pop()}]`, ...a);

await setSpeed(1); await wait(3);
await P.calm();
const park = [W - 60, H - 60];

// the bodies in view (bonded components of living cells, five or more): their cells' ids, size, centre (world), span
const bodies = () => T(async () => {
  const T = globalThis.__tidemote, c = [T.cam.x, T.cam.y], fit = Math.max(innerWidth / T.eng.grid[0], innerHeight / T.eng.grid[1]), z = T.cam.zoom * fit;
  const res = await T.eng.requestPick(c, Math.hypot(innerWidth, innerHeight) / 2 / z, 0xffffffff, { maxOut: 1e6, raw: true });
  if (!res?.raw) return { at: 0, list: [] };
  const { u32, f32, count } = res.raw, PW = u32.length / Math.max(1, count), idx = new Map(), par = new Int32Array(count).map((_, i) => i);
  const find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  for (let i = 0; i < count; i++) if (u32[i * PW + 4] >= 5) idx.set(u32[i * PW + 7], i);
  for (const [, i] of idx) for (let b = 10; b < PW; b++) { const j = idx.get(u32[i * PW + b]); if (j !== undefined) par[find(i)] = find(j); }
  const comp = new Map();
  for (const [id, i] of idx) { const r = find(i); let o = comp.get(r); if (!o) comp.set(r, (o = { ids: [], xs: [], ys: [] })); o.ids.push(id); o.xs.push(f32[i * PW]); o.ys.push(f32[i * PW + 1]); }
  const GW = T.eng.grid[0], GH = T.eng.grid[1], wrap = (d, L) => d - L * Math.round(d / L), list = [];
  for (const o of comp.values()) {
    if (o.ids.length < 5) continue;
    // (the centre unwrapped about the first cell: a body across the torus' seam stays whole)
    const dx = o.xs.map((x) => wrap(x - o.xs[0], GW)), dy = o.ys.map((y) => wrap(y - o.ys[0], GH));
    const mx = dx.reduce((a, b) => a + b, 0) / dx.length, my = dy.reduce((a, b) => a + b, 0) / dy.length;
    const span = Math.max(...dx.map((x, k) => Math.hypot(x - mx, dy[k] - my))) * 2;
    list.push({ ids: o.ids, n: o.ids.length, x: o.xs[0] + mx, y: o.ys[0] + my, span, sx: innerWidth / 2 + wrap(o.xs[0] + mx - c[0], GW) * z, sy: innerHeight / 2 + wrap(o.ys[0] + my - c[1], GH) * z });
  }
  return { at: res.simTime ?? T.eng.simTime, z, list };
});
const simNow = () => T(() => globalThis.__tidemote.eng.simTime);
const wrapD = (d, L) => d - L * Math.round(d / L);
const GRID = await T(() => [...globalThis.__tidemote.eng.grid]);
// each body of a first look found again in a second (by the cells they share), with its velocity (world units / s)
const moving = (a, b) => a.list.map((o) => {
  const s = new Set(o.ids); let best = null, share = 0;
  for (const q of b.list) { const k = q.ids.filter((id) => s.has(id)).length; if (k > share) { share = k; best = q; } }
  if (!best || share < Math.min(4, o.n * 0.5)) return null;
  const dt = Math.max(1e-3, b.at - a.at);
  return { ...best, vx: wrapD(best.x - o.x, GRID[0]) / dt, vy: wrapD(best.y - o.y, GRID[1]) / dt };
}).filter(Boolean);
const measure = async (secs) => { const a = await bodies(); await wait(secs); const b = await bodies(); return moving(a, b); };

const used = []; let made = 0;
const z = +v.z, secs = +v.secs;
for (const key of ['bodies', 'dense', 'diverse', 'total', 'bodies']) {
  if (made >= +v.takes) break;
  // candidates: the bodies at the best spots for this key, how many cells and how still
  let best = null;
  for (const s of await spots(4, key)) {
    if (used.some((u) => Math.hypot(wrapD(u[0] - s[0], GRID[0]), wrapD(u[1] - s[1], GRID[1])) < 25)) continue;
    await aim(page, s, z); await wait(0.6);
    for (const o of await measure(2)) {
      const sp = Math.hypot(o.vx, o.vy), drift = sp * (secs + 3) * z; // px it would go in a take
      if (o.n < 6 || o.span * z < 30 || o.span * z > W * 0.35 || drift > W * 0.22) continue;
      const score = Math.min(o.n, 60) / (1 + drift / 60);
      if (!best || score > best.score) best = { ...o, score, sp, at: s };
    }
  }
  if (!best) { log(`${key}: no still body`); continue; }
  // framed left of centre (the inspector takes the right), measured again, the click aimed ahead
  await aim(page, [best.x + 0.12 * W / z, best.y], z); await wait(0.8);
  const again = await measure(1.5), sx = new Set(best.ids);
  const tgt = again.map((o) => ({ o, k: o.ids.filter((id) => sx.has(id)).length })).sort((a, b) => b.k - a.k)[0]?.o;
  if (!tgt) { log(`${key}: lost the body`); continue; }
  used.push(best.at);
  const t0 = await simNow(), cell = tgt.ids[0];
  log(`take ${made} (${key}): ${tgt.n} cells, span ${(tgt.span * z).toFixed(0)} px, ${(Math.hypot(tgt.vx, tgt.vy) * z).toFixed(1)} px/s`);
  await page.mouse.move(...park);
  let aimAt = null;
  const meta = { cat: 'ui', speed: 1, what: 'pick a body', zoom: z, cells: tgt.n, spanPx: Math.round(tgt.span * z), pxPerS: +(Math.hypot(tgt.vx, tgt.vy) * z).toFixed(1) };
  const go = timeline([
    // where the body will be at the click, from its velocity (the click lands on frame 80)
    [18, async () => { const dt = (await simNow()) - t0 + 62 / 60; aimAt = [tgt.sx + tgt.vx * z * dt, tgt.sy + tgt.vy * z * dt]; }],
    ...Array.from({ length: 60 }, (_, i) => [20 + i, () => { const e = ease((i + 1) / 60); return page.mouse.move(park[0] + (aimAt[0] - park[0]) * e, park[1] + (aimAt[1] - park[1]) * e); }]),
    [80, () => page.mouse.click(...aimAt)],
    // then out of the way, below the body
    ...Array.from({ length: 50 }, (_, i) => [200 + i, () => { const e = ease((i + 1) / 50); return page.mouse.move(aimAt[0] + (W * 0.3 - aimAt[0]) * e, aimAt[1] + (H * 0.86 - aimAt[1]) * e); }]),
  ]);
  await P.shot(`ui_pick_body_${made}_z${z}`, S(secs), { pre: 30, meta, each: go });
  // how it went: the body's place now (in frame?) and whether the inspector opened
  const end = await bodies(), still = end.list.map((o) => ({ o, k: o.ids.filter((id) => sx.has(id)).length })).sort((a, b) => b.k - a.k)[0];
  const open = await page.evaluate(() => { const r = document.querySelector('#spec-tabs')?.getBoundingClientRect(); return !!r && r.width > 0 && r.x < innerWidth && r.right > 0; });
  log(`  end: ${still && still.k ? `body at ${still.o.sx.toFixed(0)},${still.o.sy.toFixed(0)} px` : 'body not found in view'}, inspector ${open ? 'open' : '?'} (cell ${cell})`);
  made++;
  await esc(); await wait(1);
}
await P.close();
console.log('done');
