// How much the sea's bend stretches the view by the frame's edge (keepInFrame), against how much it does inside: in a
// storm at a few zooms, the bend the GPU last drew on its coarse grid (seaShiftMap, Engine.seaShifts; the composite's
// own, edge easing and all) read back for a while each, and its slope across the grid (how much the view stretches:
// 0 none) taken in the band by the frame's edge (a tenth of its height) and inside it. A storm's waves passing should
// stretch the band no more than the inside. --html an older build to compare.
//   tools/gpu-node.sh tools/waterlook/edgecheck.mjs [--html dist/tidemote.html] [--zooms 30,150,600] [--secs 6]
import { cliArgs, openPage } from '../pagelab.mjs';

const v = { n: 32768, mature: 40, zooms: '30,150,600', secs: 6, ...cliArgs() };
const { page, simTime, setSpeed, runTo, evalCode, close } = await openPage({ ...v, tmp: 'edgecheck-' });
console.log('storm', JSON.stringify(await evalCode('T.climate().force("storm")')));
await runTo((await simTime()) + 90, 8);
console.log('rough', await evalCode('T.eng.seaRough'));
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const f = (x) => x.toFixed(3);
console.log('zoom  where   stretch p50   p99    max   |bend| px mean');
for (const z of String(v.zooms).split(',').map(Number)) {
  await page.evaluate((z) => {
    const T = globalThis.__tidemote, g = T.eng.grid, fit = Math.max(innerWidth / g[0], innerHeight / g[1]);
    T.cam.x = g[0] * 0.37; T.cam.y = g[1] * 0.41; T.cam.anchor = null;
    T.cam.zoom = T.cam.zoomTarget = Math.max(z / fit, 1);
  }, z);
  await setSpeed(1);
  await page.waitForTimeout(1500);
  const got = await page.evaluate(async ([secs, W, H]) => {
    const e = globalThis.__tidemote.eng, out = { edge: [], inner: [], edgeD: [], innerD: [] };
    let last = null;
    for (const end = performance.now() + secs * 1000; performance.now() < end;) {
      await new Promise((r) => setTimeout(r, 50));
      const m = e.seaShifts[e.seaShifts.length - 1];
      if (!m || m === last) continue;
      last = m;
      const { w, h } = m.cam, sx = w / W, sy = h / H, band = 0.1 * h;
      const d = (i, j, k) => m.data[(j * W + i) * 2 + k];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const px = (i + 0.5) * sx, py = (j + 0.5) * sy;
        const room = Math.min(px, w - px, py, h - py), at = room < band ? 'edge' : 'inner';
        // the bend's slope across the grid on both axes (the stretch and the shear)
        if (i + 1 < W) out[at].push(Math.max(Math.abs(d(i + 1, j, 0) - d(i, j, 0)), Math.abs(d(i + 1, j, 1) - d(i, j, 1))) / sx);
        if (j + 1 < H) out[at].push(Math.max(Math.abs(d(i, j + 1, 1) - d(i, j, 1)), Math.abs(d(i, j + 1, 0) - d(i, j, 0))) / sy);
        out[at + 'D'].push(Math.hypot(d(i, j, 0), d(i, j, 1)));
      }
    }
    return out;
  }, [+v.secs, 64, 36]);
  await setSpeed(0);
  for (const at of ['edge', 'inner']) {
    const a = got[at], m = got[at + 'D'];
    console.log(`${String(z).padEnd(5)} ${at.padEnd(7)} ${f(q(a, 0.5)).padStart(11)} ${f(q(a, 0.99)).padStart(6)} ${f(a.reduce((s, x) => Math.max(s, x), 0)).padStart(6)} ${(m.reduce((s, x) => s + x, 0) / m.length).toFixed(1).padStart(10)}`);
  }
}
await close();
