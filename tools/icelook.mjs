// The ice's look held still, drawn by two composite shaders (the page's own and another, or two others) on the same
// frames: a frost grown in the built page (Windows Chrome on the GPU), stopped as it freezes, as it holds and as it
// thaws, each moment photographed at fit, 80, 150 and 300 pixels a unit at its front and deep in the ice with each
// shader swapped in (Engine.hotComposite), the draws' real time frozen; then each pair's SSIM and pixel difference.
//   tools/gpu-node.sh tools/icelook.mjs --out runs/ice/look --a A.wgsl --b B.wgsl [--n 65536] [--html dist/tidemote.html]
//   [--tuneb '{"ice":0}'] (the tuner's knobs pinned for b's shots: there the ice at half resolution)
// A.wgsl, B.wgsl: composite shaders (`node tools/looklab.mjs --dump FILE` writes the current POST_WGSL). Prints a line a
// shot and writes OUT/NAME-a.png, NAME-b.png, NAME-d.png (the difference, x8) and OUT/look.json.
import fs from 'node:fs'; import path from 'node:path';
import { PNG } from 'pngjs';
import { openPage, cliArgs, aim } from './pagelab.mjs';

const a = cliArgs();
const out = a.out || 'runs/ice/look';
fs.mkdirSync(out, { recursive: true });
const w = +(a.w || 1280), h = +(a.h || 800);
// a frost from 10 s: cooling to 100, freezing to 160, held to 220, thawing to 320
const k = JSON.stringify({ lowEras: 0, eventPlan: 'frost@10', frostGrow: [60, 60], frostHold: [60, 60], frostThaw: [100, 100], frostMax: [0.85, 0.85], ...JSON.parse(a.k || '{}') });
const moments = (a.moments || 'grow:140,hold:210,thaw:262').split(',').map((s) => s.split(':')).map(([n, t]) => [n, +t]);
const pg = await openPage({ html: a.html || 'dist/tidemote.html', n: +(a.n || 65536), w, h, k, mature: moments[0][1] - 40 });
const { page } = pg;
await page.addStyleTag({ content: '#overlay{display:none!important}' });
const code = { a: fs.readFileSync(a.a, 'utf8'), b: fs.readFileSync(a.b, 'utf8') };
const hold = (on) => page.evaluate((on) => {
  const e = globalThis.__tidemote.eng;
  e._frame0 ||= e.frame.bind(e);
  e.frame = on ? (o) => e._frame0({ ...o, time: 1000, paused: true, steps: 0, loupe: null, specimen: null }) : e._frame0;
}, on);
// --tuneb '{"ice":0}': the tuner's knobs pinned for b's shots (T.setTune; every knob at its best for both otherwise)
const tuneb = JSON.parse(a.tuneb || '{}');
await page.evaluate(() => globalThis.__tidemote.setEffects('high'));
const swap = async (which) => {
  await page.evaluate(([o, b]) => { const T = globalThis.__tidemote; T.setEffects('high'); if (b) T.setTune(o); }, [tuneb, which === 'b']);
  const errs = await page.evaluate((c) => globalThis.__tidemote.eng.hotComposite(c), code[which]);
  if (errs.length) { console.log(which, errs.slice(0, 5)); process.exit(1); }
  await page.waitForTimeout(1500);
};
const shot = async () => { await page.waitForTimeout(400); return PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } })); };
// a point of the ice's front (its frost order at the frost's share) and one deep in it (the lowest order), nearest the
// world's middle
const spots = () => page.evaluate(() => {
  const T = globalThis.__tidemote, e = T.eng, g = e.grid, o = e.iceOrder, f = T.climate().event?.max ?? e.frost;
  let front = null, deep = null, bf = Infinity, bd = Infinity;
  for (let j = 0; j < g[1]; j++) for (let i = 0; i < g[0]; i++) {
    const r = Math.hypot(i - g[0] / 2, j - g[1] / 2), v = o[j * g[0] + i];
    if (Math.abs(v - e.frost) < 0.006 && r < bf) { bf = r; front = [i + 0.5, j + 0.5]; }
    if (v < 0.15 * e.frost && r + 200 * v < bd) { bd = r + 200 * v; deep = [i + 0.5, j + 0.5]; }
  }
  return { front, deep, frost: e.frost, f };
});
// SSIM of luminance over 8 x 8 windows, and the mean and largest absolute difference (0..255)
function compare(A, B) {
  const W = A.width, H = A.height, L = (P, i) => 0.299 * P.data[i] + 0.587 * P.data[i + 1] + 0.114 * P.data[i + 2];
  let ss = 0, n = 0, md = 0, mx = 0;
  const D = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H * 4; i += 4) {
    for (let c = 0; c < 3; c++) { const d = Math.abs(A.data[i + c] - B.data[i + c]); md += d; mx = Math.max(mx, d); D.data[i + c] = Math.min(255, d * 8); }
    D.data[i + 3] = 255;
  }
  const C1 = 6.5025, C2 = 58.5225;
  for (let y = 0; y + 8 <= H; y += 8) for (let x = 0; x + 8 <= W; x += 8) {
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      const i = ((y + v) * W + x + u) * 4, p = L(A, i), q = L(B, i);
      sa += p; sb += q; saa += p * p; sbb += q * q; sab += p * q;
    }
    const ma = sa / 64, mb = sb / 64, va = saa / 64 - ma * ma, vb = sbb / 64 - mb * mb, cv = sab / 64 - ma * mb;
    ss += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
  }
  return { ssim: ss / n, mean: md / (W * H * 3), max: mx, D };
}
const zooms = (a.zooms || 'fit,80,150,300').split(',');
const res = [];
// (the first composite swapped in after the page's own draws nothing on the RTX, its bind group refused: swap once
// to begin with)
await swap('a');
for (const [mname, t] of moments) {
  await hold(false);
  // (at Max to near it, then slowly, so as not to run past)
  if ((await pg.simTime()) < t - 20) await pg.runTo(t - 20, Infinity);
  if ((await pg.simTime()) < t) await pg.runTo(t, 4);
  // the ice as drawn eased to the simulation's (ICE_EASE, 0.6 s of real time), then the draws held
  await page.waitForTimeout(2000);
  const sp = await spots();
  console.log(mname, 't', (await pg.simTime()).toFixed(0), JSON.stringify(sp));
  await hold(true);
  const views = [];
  for (const z of zooms) for (const [sn, at] of [['front', sp.front], ['deep', sp.deep]]) if (at && !(z === 'fit' && sn === 'deep')) views.push([`${mname}-${sn}-${z}`, at, z]);
  const shots = {};
  for (const which of ['a', 'b']) {
    await swap(which);
    for (const [name, at, z] of views) {
      await aim(page, at, z === 'fit' ? 'fit' : +z);
      // (the murk's layers pan by the camera's path: from the same place each shot)
      await page.evaluate(() => { globalThis.__tidemote.eng._murk = null; });
      shots[`${name}-${which}`] = await shot();
    }
  }
  for (const [name] of views) {
    const A = shots[`${name}-a`], B = shots[`${name}-b`];
    const r = compare(A, B);
    fs.writeFileSync(path.join(out, `${name}-a.png`), PNG.sync.write(A));
    fs.writeFileSync(path.join(out, `${name}-b.png`), PNG.sync.write(B));
    fs.writeFileSync(path.join(out, `${name}-d.png`), PNG.sync.write(r.D));
    res.push({ name, ssim: +r.ssim.toFixed(5), mean: +r.mean.toFixed(3), max: r.max });
    console.log(`${name.padEnd(22)} ssim ${r.ssim.toFixed(5)}  mean ${r.mean.toFixed(3)}  max ${r.max}`);
  }
}
fs.writeFileSync(path.join(out, 'look.json'), JSON.stringify(res, null, 1));
await pg.close();
process.exit(0);
