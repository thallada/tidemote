// Cells popping in and out at a zoom threshold: the built page in Chrome on the GPU, a grown world held still (its
// draws' real time frozen), the main view zoomed about a fixed point in small steps (--ratio, default 1.02). Each
// frame is compared with the one before, scaled by the zoom between them (and the best shift of a few pixels): a cell
// lit in one and dark all around it in the other appeared or vanished between two zooms that differ by a hair.
// --bisect N: at the first step with N or more vanished, each of the main view's choices toggled there, and the same
// zoom drawn again (a pop that is gone a frame later is transient). Check drawing changes to vsPoint, contactGather
// and the culled, listed or splatted draws with it on Metal too. `node tools/popzoom.mjs --n 262144 --lo 12 --hi 80 --out runs/pop/zoom`
import fs from 'node:fs'; import path from 'node:path';
import { PNG } from 'pngjs';
import { openPage, cliArgs, aim } from './pagelab.mjs';

const a = cliArgs();
const out = a.out || 'runs/pop/zoom';
fs.mkdirSync(out, { recursive: true });
const w = +(a.w || 1280), h = +(a.h || 800);
const pg = await openPage({ html: a.html || 'dist/tidemote.html', n: +(a.n || 65536), w, h, mature: +(a.mature || 90), k: a.k || '{}', prefs: { scale: +(a.scale || 1) } });
const { page } = pg;
await page.addStyleTag({ content: '#overlay{display:none!important}' });
await page.evaluate(() => {
  const e = globalThis.__tidemote.eng, f = e.frame.bind(e);
  e.frame = (o) => f({ ...o, time: 1000, paused: true, steps: 0, loupe: null, specimen: null });
});
if (a.run) await pg.runTo((await pg.simTime()) + +a.run, Infinity);
const lo = +(a.lo || 12), hi = +(a.hi || 80), ratio = +(a.ratio || 1.02);
const center = a.at ? a.at.split(',').map(Number) : await page.evaluate(() => { const g = globalThis.__tidemote.eng.grid; return [g[0] * 0.37, g[1] * 0.41]; });
const shot = async () => { await page.waitForTimeout(150); return PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } })); };
const lum = (P, x, y) => { const i = (y * P.width + x) * 4; return 0.3 * P.data[i] + 0.5 * P.data[i + 1] + 0.2 * P.data[i + 2]; };
// where a pixel of B lies in A: about the canvas point the camera centers on, plus a shift
function register(A, B, s) {
  let best = [0, 0], be = Infinity;
  const W = B.width, H = B.height;
  for (let sy = -6; sy <= 6; sy++) for (let sx = -6; sx <= 6; sx++) {
    let e = 0;
    for (let y = 40; y < H - 40; y += 7) for (let x = 40; x < W - 40; x += 7) {
      const ax = Math.round(W / 2 + (x - W / 2) * s + sx), ay = Math.round(H / 2 + (y - H / 2) * s + sy);
      e += Math.abs(lum(A, ax, ay) - lum(B, x, y));
    }
    if (e < be) { be = e; best = [sx, sy]; }
  }
  return best;
}
function appeared(A, B, s, sh, r, lit, dark) {
  const W = B.width, H = B.height, hits = [];
  for (let y = 30; y < H - 30; y += 2) for (let x = 30; x < W - 30; x += 2) {
    if (lum(B, x, y) < lit) continue;
    const ax = W / 2 + (x - W / 2) * s + sh[0], ay = H / 2 + (y - H / 2) * s + sh[1];
    let m = 0;
    for (let j = -r; j <= r && m < dark; j++) for (let i = -r; i <= r; i++) { m = Math.max(m, lum(A, Math.round(ax + i), Math.round(ay + j))); if (m >= dark) break; }
    if (m < dark) hits.push([x, y]);
  }
  const bs = [];
  for (const [x, y] of hits) { const b = bs.find((b) => Math.abs(b.x - x) < 10 && Math.abs(b.y - y) < 10); if (b) b.n++; else bs.push({ x, y, n: 1 }); }
  return bs.filter((b) => b.n >= 2);
}
let prev = null, prevPPU = 0, i = 0, total = 0;
const log = [];
for (let ppu = lo; ppu <= hi * 1.0001; ppu *= ratio, i++) {
  await aim(page, center, ppu);
  const cur = await shot();
  const info = await page.evaluate(() => { const e = globalThis.__tidemote.eng, v = new Float32Array(e.viewData), u = new Uint32Array(e.viewData); return { ppu: v[6], ps: v[7], culled: u[21], splat: v[22] }; });
  if (prev) {
    const s = info.ppu / prevPPU; // B's pixel offsets from the center are s times A's: A = center + (B - center) / s
    const sh = register(prev, cur, 1 / s);
    const app = appeared(prev, cur, 1 / s, sh, 3, +(a.lit || 45), +(a.dark || 18));
    const shB = [-sh[0] * s, -sh[1] * s];
    const gone = appeared(cur, prev, s, shB, 3, +(a.lit || 45), +(a.dark || 18));
    total += app.length + gone.length;
    log.push({ i, ...info, sh, app, gone });
    console.log(`${i}\tppu ${info.ppu.toFixed(2)}\tpx ${info.ps.toFixed(2)}\tculled ${info.culled}\tsplat ${info.splat}\tshift ${sh}\tappeared ${app.length}\tvanished ${gone.length}`);
    if (a.bisect && gone.length >= +(a.bisect)) {
      // which of the main view's choices hides them: each toggled at this zoom, the frame compared with the last again
      const tries = [['lod off', 'e.settings.lod = false', 'e.settings.lod = true'], ['links off', 'e.settings.links = false', 'e.settings.links = true'],
        ['interiors off', 'e.fx.interiors = false', 'e.fx.interiors = true'], ['plain draw', 'e.plainDraw = true', 'e.plainDraw = false'],
        ['finish 0', 'e.fx.finish = 0', 'e.fx.finish = 2'], ['look off', 'globalThis.__tidemote.eng.look.fill(0)', ''],
        ['nodes off', 'e.settings.nodes = false', 'e.settings.nodes = true']];
      for (const [name, on, off] of tries) {
        await page.evaluate((c) => { const e = globalThis.__tidemote.eng; eval(c); }, on);
        const t = await shot();
        const g2 = appeared(t, prev, s, shB, 3, +(a.lit || 45), +(a.dark || 18));
        console.log(`  ${name}: vanished ${g2.length}`);
        fs.writeFileSync(path.join(out, `z${i}-${name.replace(/ /g, '_')}.png`), PNG.sync.write(t));
        if (off) await page.evaluate((c) => { const e = globalThis.__tidemote.eng; eval(c); }, off);
      }
      // and the frame a hair before and after this zoom
      for (const f of [0.99, 0.995, 1.005]) {
        await aim(page, center, info.ppu * f);
        const t = await shot();
        console.log(`  at ${(info.ppu * f).toFixed(2)}: vanished ${appeared(t, prev, info.ppu * f / prevPPU, [0, 0], 3, +(a.lit || 45), +(a.dark || 18)).length}`);
      }
      await aim(page, center, info.ppu);
      a.bisect = 0;
    }
    if (app.length + gone.length) {
      fs.writeFileSync(path.join(out, `z${i - 1}.png`), PNG.sync.write(prev));
      fs.writeFileSync(path.join(out, `z${i}.png`), PNG.sync.write(cur));
    }
  }
  prev = cur; prevPPU = info.ppu;
}
fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
console.log(`pops: ${total}`);
await pg.close();
