// Touch's glass rod at work, seen from far enough to show what it does to the water (the old hand_touch at z220 was
// all disc): the full interface (1280x720 at device scale 3, 4K HEVC) over a still camera at a dense spot, the rod
// used five ways, a take each:
//   tap    four taps about the view (each rings the water and pushes its cells out to the disc's rim), then a held dip
//   swirl  three turns stirred round, then lifted: the vortex it leaves turns on and dies away
//   plow   one slow straight stroke through the crowd, the cells parting to either side and closing behind
//   zigzag strokes turned back on themselves (each turn sends out a ring wave)
//   eight  a wide figure eight, two vortices turning opposite ways
//   tools/gpu-node.sh tools/promo/hand.mjs --out /mnt/d/tidemote-promo/lib2/h01 --mature 1500 [--moves tap,swirl,plow]
import { cliArgs, aim, openOffline, MEDIA, S, timeline, ease } from './olab.mjs';

const v = { out: MEDIA + '/h01', mature: 1500, moves: 'tap,swirl,plow,zigzag,eight', ...cliArgs() };
const W = 1280, H = 720;
const P = await openOffline({ ...v, ui: true, vw: W, vh: H, scale: +(v.scale ?? 3), hevc: true, track: ['#hud', '#dock', '#feed', '#rail', '#held', '#__ptr'], notes: 0 });
const { page, T, setSpeed, wait } = P;
const log = (...a) => console.log(`[${v.out.split('/').pop()}]`, ...a);

await setSpeed(1); await wait(3);
await P.calm();

// the pointer's path, a position for each frame from f0 to f0 + n (u from 0 to 1 along it)
const along = (f0, n, at) => Array.from({ length: n }, (_, i) => [f0 + i, () => page.mouse.move(...at((i + 1) / n))]);
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const C = [W * 0.5, H * 0.52];
// each move: its zoom, the rod's reach (world units), how long, where the pointer waits, and its acts by frame
const MOVES = {
  tap: { z: 80, reach: 2, secs: 10, from: [W * 0.3, H * 0.4], acts: () => {
    const pts = [[W * 0.3, H * 0.4], [W * 0.66, H * 0.34], [W * 0.38, H * 0.68], [W * 0.7, H * 0.64]], a = []; let f = 40;
    for (let k = 0; k < pts.length; k++) {
      if (k) a.push(...along(f - 30, 24, (u) => lerp(pts[k - 1], pts[k], ease(u))));
      a.push([f, () => page.mouse.down()], [f + 24, () => page.mouse.up()]); f += 90; // (held 0.4 s: the rod all the way in, so each one shows)
    }
    // then pressed and held in the middle: the disc widens as it dips, clearing a ring
    a.push(...along(f - 30, 24, (u) => lerp(pts[3], C, ease(u))), [f, () => page.mouse.down()], [f + 100, () => page.mouse.up()]);
    return a;
  } },
  swirl: { z: 70, reach: 1.4, secs: 11, from: [C[0] + 150, C[1]], acts: () => {
    const R = 150, turns = 3, f0 = 30, n = S(6), at = (u) => { const th = 2 * Math.PI * turns * u; return [C[0] + R * Math.cos(th), C[1] + R * 0.8 * Math.sin(th)]; };
    // eased in over the first half turn so the stir starts from rest
    return [[f0, () => page.mouse.down()], ...along(f0 + 2, n, (u) => at(u < 0.1 ? 0.05 * (u / 0.1) ** 2 * 2 : u)), [f0 + n + 4, () => page.mouse.up()],
      ...along(f0 + n + 20, 40, (u) => lerp(at(1), [W * 0.86, H * 0.2], ease(u)))];
  } },
  plow: { z: 90, reach: 1.5, secs: 9, from: [W * 0.06, H * 0.62], acts: () => {
    const a0 = [W * 0.06, H * 0.62], a1 = [W * 0.94, H * 0.4];
    return [[30, () => page.mouse.down()], ...along(32, S(5.5), (u) => lerp(a0, a1, u)), [32 + S(5.5) + 2, () => page.mouse.up()]];
  } },
  zigzag: { z: 60, reach: 1.4, secs: 10, from: [W * 0.2, H * 0.3], acts: () => {
    const pts = [[W * 0.2, H * 0.3], [W * 0.75, H * 0.42], [W * 0.28, H * 0.56], [W * 0.8, H * 0.7]], a = [[30, () => page.mouse.down()]]; let f = 32;
    for (let k = 1; k < pts.length; k++) { a.push(...along(f, 80, (u) => lerp(pts[k - 1], pts[k], ease(u)))); f += 80; }
    a.push([f + 2, () => page.mouse.up()]);
    return a;
  } },
  eight: { z: 55, reach: 1.6, secs: 11, from: [C[0], C[1]], acts: () => {
    const A = 300, B = 140, n = S(7), at = (u) => { const th = 2 * Math.PI * 1.5 * u; return [C[0] + A * Math.sin(th), C[1] + B * Math.sin(2 * th)]; };
    return [[30, () => page.mouse.down()], ...along(32, n, at), [32 + n + 2, () => page.mouse.up()], ...along(32 + n + 20, 40, (u) => lerp(at(1), [W * 0.86, H * 0.2], ease(u)))];
  } },
};

const used = [];
for (const name of v.moves.split(',')) {
  const m = MOVES[name]; if (!m) { log(`no move ${name}`); continue; }
  // a crowded spot (a rod in empty water shows nothing)
  const [best] = await P.bestSpots(1, m.z, ['dense', 'bodies', 'total'], { avoid: used, cells: 400 });
  if (!best) continue;
  used.push(best);
  await aim(page, best, m.z); await wait(1);
  await T((r) => { const t = globalThis.__tidemote; t.hand.set('touch'); t.hand.reach = r; }, m.reach);
  await page.mouse.move(...m.from); await wait(0.6);
  await P.shot(`hand_touch_${name}_z${m.z}`, S(m.secs), { pre: 30, meta: { cat: 'ui', speed: 1, what: `glass rod: ${name}`, zoom: m.z, reach: m.reach }, each: timeline(m.acts()) });
  await page.mouse.up().catch(() => {});
  await T(() => globalThis.__tidemote.hand.set('none'));
  log(`${name}: spot ${best.r.toFixed(2)}`);
  await wait(4); // the water settles before the next spot
}
await P.close();
console.log('done');
