// One world's shots for the promo library, frame-exact in 4K (olab.mjs): macro pull-backs, the dive, close-ups at a
// ladder of zooms, deep holds at the highest zoom, slow pans over large scenes, slow push-ins and pull-outs, dancing
// swimmers on the beat, long exposures, the auto camera, time-lapses, a catastrophe followed through its stages, and the
// pull-back to the whole. Every shot's JSON carries meta { cat, zoom, speed, trails, move, ... } for the catalogue.
//   tools/gpu-node.sh tools/promo/shoot.mjs --out /mnt/d/tidemote-promo/lib2/w01 --mature 900 --event storm [--parts ...] [--html ...]
import fs from 'node:fs';
import { cliArgs, aim, openOffline, winPath, MEDIA, S } from './olab.mjs';

const ALL = 'macro,est,close,deep,pan,drift,swim,trails,dir,lapse,event,outro';
const v = { out: MEDIA + '/w01', mature: 900, event: 'storm', parts: ALL, crf: 16, ...cliArgs() };
const P = await openOffline({ ...v, world: { event: v.event } });
const { page, T, setSpeed, evalCode, wait, shot, spots } = P;
const log = (...a) => console.log(`[${v.out.split('/').pop()}]`, ...a);
const parts = v.parts.split(',');
const bestSpots = async (n, z, keys) => { const ss = await P.bestSpots(n, z, keys); log('best spots at', z, ss.map((o) => o.r.toFixed(2)).join(' ')); return ss; };
const fitK = () => T(() => { const T = globalThis.__tidemote; return Math.max(innerWidth / T.eng.grid[0], innerHeight / T.eng.grid[1]); });
const setZoom = (z, k) => T((z) => { const T = globalThis.__tidemote; T.cam.zoom = T.cam.zoomTarget = Math.max(1, z); }, z / k);
// a slow push in (or out): zoom from z0 to z1 (css px per world unit) over the shot, eased
const push = async (z0, z1, frames) => { const k = await fitK(); return async (f) => { if (f < 0) return; const x = f / frames, e = x * x * (3 - 2 * x); await setZoom(z0 * Math.pow(z1 / z0, e), k); }; };
// a pan: from a to b (world units, the shorter way round the wrap) at a steady speed with soft ends (raised-cosine
// ramps over the first and last quarter), the zoom drifting z0 → z1 on the way
const panPath = async (a, b, z0, z1, frames) => {
  const k = await fitK(), g = await T(() => globalThis.__tidemote.eng.grid);
  const wrap = (d, L) => d - L * Math.round(d / L), dx = wrap(b[0] - a[0], g[0]), dy = wrap(b[1] - a[1], g[1]);
  const r = 0.25, vmax = 1 / (1 - r); // position as the integral of a velocity with cosine ramps, normalised to 1
  const pos = (x) => {
    if (x < r) return vmax * (x / 2 - (r / (2 * Math.PI)) * Math.sin((Math.PI * x) / r));
    if (x > 1 - r) return 1 - pos(1 - x);
    return vmax * (r / 2 + (x - r));
  };
  return async (f) => {
    const x = Math.min(1, Math.max(0, f / frames)), p = pos(x), e = x * x * (3 - 2 * x);
    await T(([x, y, z]) => { const T = globalThis.__tidemote; T.cam.x = x; T.cam.y = y; T.cam.anchor = null; T.cam.zoom = T.cam.zoomTarget = Math.max(1, z); }, [a[0] + dx * p, a[1] + dy * p, (z0 * Math.pow(z1 / z0, e)) / k]);
  };
};
// run the world on (natural time, at a speed) until its clock reaches t
const until = async (t, speed = 16) => { await setSpeed(speed); while ((await P.simTime()) < t) await wait(0.5); };
const auto = (on) => T((on) => { const b = document.getElementById('auto-play'); if ((b.getAttribute('aria-pressed') === 'true') !== on) b.click(); }, on);
await setSpeed(1); await wait(4);

if (parts.includes('macro')) {
  // out of the dark: from close on one organism, a continuous pull back to the teeming world
  const ss = await bestSpots(6, 300, ['bodies', 'diverse', 'swift', 'total']);
  let made = 0;
  const k = await fitK(), zmax = (await T(() => globalThis.__tidemote.maxZoom())) * k * 0.33;
  for (const s of ss) {
    if (made >= 3) break;
    await aim(page, s, 300); await wait(0.5);
    let c = null;
    for (let tries = 0; tries < 6 && !c; tries++) { if (tries) await wait(0.5); c = await T(async () => {
      const T = globalThis.__tidemote, p = [T.cam.x, T.cam.y], res = await T.eng.requestPick(p, 2, 0xffffffff);
      const life = res.entries.filter((q) => q.kind >= 5).sort((a, b) => Math.hypot(a.x - p[0], a.y - p[1]) - Math.hypot(b.x - p[0], b.y - p[1]));
      return life[0] ? [life[0].x, life[0].y] : null;
    }); }
    if (!c) continue;
    await T(([x, y]) => { const T = globalThis.__tidemote; T.cam.x = x; T.cam.y = y; }, c);
    await setZoom(zmax, k); await wait(1.5);
    const N = S(10), z1 = [22, 40, 12][made];
    await shot(`macro_${made}`, N, { pre: 90, each: await push(zmax, z1, N), meta: { cat: 'macro', zoom: [Math.round(zmax), z1], speed: 1, move: 'pull' } });
    made++;
  }
}
if (parts.includes('est')) {
  const k0 = await fitK();
  const [d] = await bestSpots(1, 750);
  await aim(page, d, 'fit');
  await shot('est_dive', S(7), { each: await push(k0, 750, S(7)), meta: { cat: 'dive', zoom: ['fit', 750], speed: 1, move: 'push' } });
  const [s] = await spots(1, 'diverse');
  await aim(page, s, 'fit');
  await shot('est_wide', S(6), { each: await push(k0, k0 * 1.6, S(6)), meta: { cat: 'wide', zoom: ['fit', 'fit*1.6'], speed: 1, move: 'push' } });
}
if (parts.includes('close')) {
  // the richest views at each zoom (rated before filming), 5 s each
  let i = 0;
  for (const [z, n] of [[300, 3], [600, 5], [900, 5], [1250, 4]]) {
    for (const c of await bestSpots(n, z)) {
      await aim(page, c, z);
      await shot(`close_${i++}_z${z}`, S(5), { pre: 20, meta: { cat: 'close', zoom: z, speed: 1, rating: +c.r.toFixed(2) } });
    }
  }
}
if (parts.includes('deep')) {
  // the highest zooms: a body's cells and their insides filling the frame, the camera still (a followed camera jerks)
  const k = await fitK(), zmax = (await T(() => globalThis.__tidemote.maxZoom())) * k;
  const z = Math.round(Math.min(2400, zmax * 0.95));
  let i = 0;
  for (const c of await bestSpots(6, 900, ['bodies', 'diverse', 'kills'])) {
    if (i >= 3) break;
    // centred on the densest knot of living cells near the spot (the frame is only ~1.3 x 0.75 units wide here; an
    // empty middle or a lone cell that swims off left w06/w07's deep shots black): the living cell with the most
    // others within r, and a spot without at least 5 there is passed over
    await aim(page, c, 900); await wait(0.4);
    const r = 0.3 * 1920 / z;
    const p = await T(async ([c, r]) => {
      const T = globalThis.__tidemote, res = await T.eng.requestPick(c, 3, 0xffffffff);
      const life = (res?.entries || []).filter((q) => q.kind >= 5);
      let best = null, bn = 0;
      for (const a of life) { const n = life.filter((b) => Math.hypot(a.x - b.x, a.y - b.y) < r).length; if (n > bn) { bn = n; best = a; } }
      return best ? [best.x, best.y, bn] : null;
    }, [[...c], r]);
    if (!p || p[2] < 5) { log(`deep: spot passed over (${p ? p[2] : 0} cells near)`); continue; }
    await aim(page, p.slice(0, 2), z);
    await shot(`deep_${i++}_z${z}`, S(5), { pre: 20, meta: { cat: 'deep', zoom: z, speed: 1 } });
  }
}
if (parts.includes('pan')) {
  // slow pans across large scenes: between two good spots about a screen or two apart, at mid and far zooms, the zoom
  // drifting a little in or out on the way
  let i = 0;
  for (const [z, drift] of [[90, 1.25], [160, 0.8], [300, 1.2], [60, 0.85], [500, 1.0]]) {
    const ss = await bestSpots(8, z, ['diverse', 'bodies', 'dense', 'swift']);
    const w = 1920 / z;
    let pair = null;
    for (const a of ss) for (const b of ss) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (a !== b && d > w * 0.7 && d < w * 2.2 && (!pair || a.r + b.r > pair[2])) pair = [a, b, a.r + b.r]; }
    if (!pair) { const a = ss[0], ang = Math.random() * Math.PI * 2; pair = [a, [a[0] + Math.cos(ang) * w * 1.2, a[1] + Math.sin(ang) * w * 1.2], 0]; }
    const N = S(9);
    await aim(page, pair[0], z);
    await shot(`pan_${i++}_z${z}`, N, { pre: 30, each: await panPath(pair[0], pair[1], z, z * drift, N), meta: { cat: 'pan', zoom: [z, Math.round(z * drift)], speed: 1, move: 'pan' } });
  }
}
if (parts.includes('drift')) {
  // slow push-ins and pull-outs over a scene, held on one spot
  const k = await fitK();
  let i = 0;
  for (const [z0, z1, sp] of [[120, 480, 1], [700, 200, 1], ['fit', 140, 2], [400, 1100, 1]]) {
    const zz0 = z0 === 'fit' ? k : z0;
    const [c] = await bestSpots(1, Math.max(zz0, z1), ['diverse', 'bodies', 'total']);
    await aim(page, c, zz0); await setSpeed(sp);
    const N = S(10);
    await shot(`drift_${i++}_${z0}to${z1}_x${sp}`, N, { pre: 30, each: await push(zz0, z1, N), meta: { cat: 'drift', zoom: [z0, z1], speed: sp, move: z1 > zz0 ? 'push' : 'pull' } });
  }
  await setSpeed(1);
}
if (parts.includes('swim')) {
  // dancers: beating species with bodies, found by skipping through the director's shots (those it follows) and then in
  // the registry (the most common first); each followed as Find does it (its largest body tracked, the ride Find starts
  // got off), close (a few cells ~z900, a big body less: the director frames them ~z300 and caps its zoom), filmed at
  // the speed that puts its strokes on the beat (at or below 1.1x) for 112 and 116 bpm
  await auto(true);
  const found = new Map(); let lastId = null;
  for (let tries = 0; tries < 120 && found.size < 4; tries++) {
    await wait(1);
    const sh = await T(() => {
      const T = globalThis.__tidemote, s = T.director.shot; if (!s) return null;
      const sp = s.why.serial != null ? T.life().reg.get(s.why.serial) : null;
      return { id: s.id, kind: s.why.kind, cells: s.why.cells || 0, serial: s.why.serial, beat: sp?.genome?.beat ? [...sp.genome.beat] : null, name: sp?.name, pop: sp?.pop };
    });
    if (sh && sh.id !== lastId) { lastId = sh.id; log('director', sh.kind, 'cells', sh.cells, 'beat', sh.beat ? sh.beat.map((x) => +x.toFixed(2)).join('/') : '-'); }
    if (sh && sh.kind === 'follow' && sh.cells >= 3 && sh.beat && sh.beat[0] > 0.2 && !found.has(sh.serial)) found.set(sh.serial, sh);
    await T(() => globalThis.__tidemote.director.next());
  }
  await auto(false);
  if (found.size < 4) {
    const more = await T((seen) => {
      const T = globalThis.__tidemote, K = T.eng.K;
      return [...T.life().reg.values()].filter((x) => x.alive && x.pop >= 20 && !seen.includes(x.serial) && x.genome?.beat?.[0] > 0.2
        && ((x.genome.adhesion || 0) > K.adhMin || x.genome.tail?.[0] > 0))
        .sort((a, b) => b.pop - a.pop).slice(0, 6).map((x) => ({ serial: x.serial, name: x.name, beat: [...x.genome.beat], pop: x.pop, cells: 0, found: 'registry' }));
    }, [...found.keys()]);
    for (const c of more) if (found.size < 4) found.set(c.serial, c);
  }
  log('dancers', found.size);
  const kAll = await fitK(); let made = 0;
  // (the inspector Find opens is hidden by the clean CSS but still insets the view, pushing the subject off centre;
  // ui-off makes it count for nothing)
  await T(() => document.body.classList.add('ui-off'));
  for (const c of found.values()) try {
    await T(() => { const T = globalThis.__tidemote; T.deselect?.(); T.state.follow = false; T.cam.zoomTarget = 1; }); await wait(0.5);
    await T((s) => globalThis.__tidemote.findMember(s), c.serial); await wait(2.5);
    if (await T(() => globalThis.__tidemote.ride.state.on)) { await page.keyboard.press('Enter'); await wait(0.3); }
    if (!(await T(() => { const T = globalThis.__tidemote; T.state.follow = true; return T.state.follow; }))) continue;
    await setZoom(c.cells ? Math.min(900, Math.max(260, 1800 / Math.sqrt(c.cells))) : 600, kAll); await wait(4);
    log('dancer', JSON.stringify(c));
    for (const bpm of [112, 116]) {
      const Pd = 60 / bpm, f = c.beat[1];
      const best = [0.5, 1, 2, 4].map((q) => ({ q, r: 1 / (f * Pd * q) })).filter((o) => o.r <= 1.1).sort((a, b) => b.r - a.r)[0];
      const speed = Math.max(0.3, best.r);
      await setSpeed(speed);
      const name = `swim_${made}_${c.cells ? 'c' + c.cells : 'r' + c.pop}_f${f.toFixed(2)}_${bpm}`;
      await shot(name, S(7), { pre: 30, meta: { cat: 'swim', bpm, speed: +speed.toFixed(4), cells: c.cells, species: c.name, move: 'follow', found: c.found || 'director' } });
      fs.writeFileSync(winPath(`${v.out}/${name}.beat.json`), JSON.stringify({ ...c, kind: 'follow', bpm, speed, perBeat: best.q }));
    }
    await setSpeed(1); made++;
  } catch (e) { log('dancer failed', e.message); await setSpeed(1); }
  await T(() => { const T = globalThis.__tidemote; T.deselect?.(); T.state.follow = false; document.body.classList.remove('ui-off'); });
  await T(() => { globalThis.__tidemote.eng.survey = { every: 45 }; });
}
if (parts.includes('trails')) {
  // long exposures (the "Van Gogh"): the swiftest spots, run faster so the strokes paint long
  const ss = await spots(8, 'swift');
  for (const [i, [z, tr, sp]] of [[40, 0.96, 2], [25, 0.97, 4], [60, 0.96, 2], [100, 0.975, 2], ['fit', 0.94, 4], [35, 0.98, 3], [150, 0.97, 1], [70, 0.985, 2]].entries()) {
    await aim(page, ss[i], z);
    await setSpeed(sp);
    await T((tr) => { globalThis.__tidemote.eng.settings.trails = tr; }, tr);
    await shot(`trails_${i}_z${z}_${tr}_x${sp}`, S(8), { pre: 120, meta: { cat: 'trails', zoom: z, speed: sp, trails: tr } });
  }
  // and a long exposure that drifts: the strokes smear along the camera's own slow push
  const [s] = await spots(1, 'swift');
  await aim(page, s, 30); await setSpeed(2);
  await T(() => { globalThis.__tidemote.eng.settings.trails = 0.97; });
  await shot('trails_push_z30to90_x2', S(9), { pre: 120, each: await push(30, 90, S(9)), meta: { cat: 'trails', zoom: [30, 90], speed: 2, trails: 0.97, move: 'push' } });
  await T(() => { globalThis.__tidemote.eng.settings.trails = 0.45; });
  await setSpeed(1);
}
if (parts.includes('dir')) {
  // the auto camera alone: its flights between scenes, no notes
  await auto(true); await wait(6);
  let lastNext = 0;
  await shot('dir', S(24), { meta: { cat: 'auto', speed: 1, move: 'auto' }, each: async (f) => {
    if (f < 0 || f % 30) return;
    const held = await T(() => { const s = globalThis.__tidemote.director.shot; return s ? s.t - (s.flight || 0) : 0; });
    if (held > 5 && f - lastNext > 240) { await T(() => globalThis.__tidemote.director.next()); lastNext = f; }
  } });
  await auto(false);
  await T(() => { globalThis.__tidemote.eng.survey = { every: 45 }; });
}
if (parts.includes('lapse')) {
  // time-lapses at constant speeds (whole coarse steps a frame, so every frame moves the same)
  const ss = await spots(3, 'diverse');
  for (const [i, z] of ['fit', 200, 600].entries()) {
    await aim(page, ss[i], z);
    for (const sp of [4, 16, 64]) {
      if (sp === 64 && z !== 'fit') continue;
      await setSpeed(sp);
      await shot(`lapse_x${sp}_z${z}`, S(6), { pre: 10, meta: { cat: 'lapse', zoom: z, speed: sp } });
    }
    await setSpeed(1);
  }
}
if (parts.includes('outro')) {
  // the whole: a long exposure pulling back to the full world
  const [s] = await spots(1, 'swift');
  await aim(page, s, 70);
  await T(() => { globalThis.__tidemote.eng.settings.trails = 0.92; });
  const N = S(10);
  await shot('outro_pull', N, { pre: 60, each: await push(70, 9, N), meta: { cat: 'outro', zoom: [70, 9], speed: 1, trails: 0.92, move: 'pull' } });
  await T(() => { globalThis.__tidemote.eng.settings.trails = 0.45; });
}
if (parts.includes('event') && v.event) {
  // a catastrophe followed through its stages: the run-up, its height, the aftermath; wide (the weather reads wide),
  // mid and close, at speeds that make each stage legible
  const ev = JSON.parse(await evalCode(`JSON.stringify(T.climate().force(${JSON.stringify(v.event)}))`));
  const t0 = ev.t, type = ev.type;
  log('event', type, JSON.stringify(ev));
  const where = type === 'drought' ? 'shore' : type === 'frost' ? 'ice' : 'event';
  const stages = type === 'storm' ? [['onset', 15], ['height', ev.dur * 0.5], ['late', ev.dur + 60]]
    : type === 'frost' ? [['onset', ev.cool + 10], ['height', ev.cool + ev.grow], ['thaw', ev.cool + ev.grow + ev.hold + ev.thaw * 0.4]]
    : type === 'drought' ? [['onset', ev.fall * 0.5], ['height', ev.fall + ev.hold * 0.5], ['refill', ev.fall + ev.hold + ev.refill * 0.5]]
    : [['onset', 20], ['height', ev.dur * 0.4], ['late', ev.dur * 0.8]];
  const m = (o) => ({ cat: 'event', event: type, ...o });
  for (const [st, at] of stages) {
    await until(t0 + at, 16); await setSpeed(8); await wait(1);
    await aim(page, where, 'fit');
    await shot(`event_${type}_${st}_fit_x8`, S(6), { meta: m({ stage: st, zoom: 'fit', speed: 8 }) });
    await setSpeed(4);
    await aim(page, where, 40);
    await shot(`event_${type}_${st}_z40_x4`, S(5), { meta: m({ stage: st, zoom: 40, speed: 4 }) });
    if (st === 'height') {
      await setSpeed(2);
      await aim(page, where, 140);
      await shot(`event_${type}_${st}_z140_x2`, S(5), { meta: m({ stage: st, zoom: 140, speed: 2 }) });
      // close in it: cells under the storm's sea, caught in ice, stranded on the shore, under the duckweed's shade
      await setSpeed(1);
      await aim(page, where, 500);
      await shot(`event_${type}_${st}_z500_x1`, S(5), { meta: m({ stage: st, zoom: 500, speed: 1 }) });
      await setSpeed(16);
      await aim(page, where, 'fit');
      await shot(`event_${type}_${st}_fit_x16`, S(5), { meta: m({ stage: st, zoom: 'fit', speed: 16 }) });
    }
  }
  await setSpeed(1);
}
await P.close();
log('done');
