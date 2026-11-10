// The stone lab: photograph the same grains of stone, at the same moment of the same world, across zooms and looks,
// so a change to how stone is drawn (vsStone, mineralSurf, boulder in src/shaders.js; docs/look.md) is judged frame
// against frame. The first run grows a world at Max and saves it (DIR/world.bin); every later run loads it into the
// page as now built, so rebuild (npm run build) between runs.
//   TIDEMOTE_VK=1 node tools/stonelab.mjs --out runs/stone/NAME [--world runs/stone/world.bin] [--n 65536] [--mature 150]
//     [--zoom 25,70,150,400] [--looks off,normal,strong,nofocus] [--spots 3] [--loupe 1] [--shift 1] [--html dist/tidemote.html]
// Spots are where the most stone lies within a few units: bedrock and reef, each its densest (or --at x,y;x,y: those
// points, named at0, at1...: a framboid, say). Writes
// OUT/SPOT_zZOOM_LOOK.png and OUT/spots.json; --loupe also OUT/SPOT_zZOOM_LOOK_loupe.png, the loupe held over the spot
// (the loupe and the close-ups draw stone through their own targets). --shift also photographs the middle of each
// spot with the camera moved by eighths of a pixel (OUT/shift/SPOT_zZOOM_LOOK_K.png, the offsets in a .json beside
// them), twice unmoved, for how much stone shimmers as the view moves: tools/stonelab-shimmer.py OUT/shift (film grain
// is off for these).
import fs from 'node:fs'; import path from 'node:path';
import { openPage, cliArgs, aim } from './pagelab.mjs';
import { loadBinWorld, saveBinWorld, unpackWorld } from './lib/world.mjs';

const v = { out: 'runs/stone/x', world: 'runs/stone/world.bin', n: 65536, mature: 150, zoom: '25,70,150,400', looks: 'off,normal,strong', spots: 3, loupe: '', w: 1280, h: 800, html: 'dist/tidemote.html', ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
fs.mkdirSync(path.dirname(v.world), { recursive: true });
const fresh = !fs.existsSync(v.world);
const { page, close } = await openPage({ ...v, mature: fresh ? +v.mature : 1, tmp: 'stone-' });

// the world's state as one blob (tools/lib/world.mjs's .bin), carried as base64
if (fresh) {
  fs.writeFileSync(v.world, Buffer.from((await saveBinWorld(page)).b64, 'base64'));
  console.log(`saved ${v.world}`);
} else {
  await loadBinWorld(page, `data:application/octet-stream;base64,${fs.readFileSync(v.world).toString('base64')}`);
  // a step or two, so the stone list (gathered as matter moves) is drawn from the loaded world
  await page.evaluate(async () => {
    const T = globalThis.__tidemote, t0 = T.eng.simTime;
    T.setSpeed(1);
    while (T.eng.simTime < t0 + 0.1) await new Promise((r) => setTimeout(r, 50));
  });
}
await page.evaluate(() => globalThis.__tidemote.setSpeed(0));

// where stone lies: the densest few-unit squares of bedrock and of reef
const world = unpackWorld(fs.readFileSync(v.world));
const P = new DataView(world.gpu.parts), grid = world.cpu.grid, cnt = world.cpu.count;
const bins = new Map();
for (let i = 0; i < cnt; i++) {
  const o = i * 40, kind = P.getUint32(o + 16, true);
  if (kind !== 3) continue;
  const x = P.getFloat32(o, true), y = P.getFloat32(o + 4, true), reef = (P.getUint32(o + 36, true) & 15) !== 0;
  const key = `${reef ? 'reef' : 'bed'}:${Math.floor(x / 3)}:${Math.floor(y / 3)}`;
  const e = bins.get(key) ?? { n: 0, x: 0, y: 0, reef };
  e.n++; e.x += x; e.y += y; bins.set(key, e);
}
const ranked = [...bins.values()].sort((a, b) => b.n - a.n);
const spots = [];
for (const want of [false, true, false, true]) {
  const e = ranked.find((e) => e.reef === want && spots.every((p) => Math.hypot(p.x - e.x / e.n, p.y - e.y / e.n) > 8));
  if (e) spots.push({ name: `${want ? 'reef' : 'bed'}${spots.filter((p) => p.reef === want).length}`, reef: want, n: e.n, x: e.x / e.n, y: e.y / e.n });
}
spots.splice(+v.spots);
if (v.at) spots.splice(0, spots.length, ...v.at.split(';').map((p, k) => { const [x, y] = p.split(',').map(Number); return { name: `at${k}`, x, y }; }));
fs.writeFileSync(path.join(v.out, 'spots.json'), JSON.stringify({ grid, spots }, null, 1));
console.log('spots', spots.map((p) => `${p.name} ${p.n} @ ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('; '));

// the view moved by eighths of a pixel, diagonally (each frame's offset in pixels: the picture moves the other way)
const shifted = async (p, z, look) => {
  const dir = path.join(v.out, 'shift'), name = `${p.name}_z${z}_${look}`, offs = [[0, 0], [0, 0]];
  fs.mkdirSync(dir, { recursive: true });
  for (let k = 1; k < 8; k++) offs.push([k / 8, ((3 * k) % 8) / 8]);
  await page.evaluate(`(${quiet[look]})(globalThis.__tidemote)`);
  const frames = [];
  for (const [k, [dx, dy]] of offs.entries()) {
    await page.evaluate(([x, y]) => { const T = globalThis.__tidemote; T.cam.x = x; T.cam.y = y; }, [p.x + dx / +z, p.y + dy / +z]);
    await page.waitForTimeout(250);
    const f = `${name}_${k}.png`;
    await page.screenshot({ path: path.join(dir, f), clip: { x: v.w / 2 - 128, y: v.h / 2 - 128, width: 256, height: 256 } });
    frames.push({ f, dx, dy });
  }
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ zoom: +z, look, frames }));
  await aim(page, [p.x, p.y], z);
  await page.evaluate(`(${looks[look]})(globalThis.__tidemote)`);
};
const looks = { off: (T) => T.look.off(), normal: (T) => T.look.set({}, 1), strong: (T) => T.look.set({}, 1.35), nofocus: (T) => T.look.set({ dof: 0 }, 1) };
const quiet = { off: looks.off, normal: (T) => T.look.set({ grain: 0 }, 1), strong: (T) => T.look.set({ grain: 0 }, 1.35), nofocus: (T) => T.look.set({ grain: 0, dof: 0 }, 1) };
for (const look of v.looks.split(',')) {
  await page.evaluate(`(${looks[look]})(globalThis.__tidemote)`);
  for (const p of spots) for (const z of v.zoom.split(',')) {
    await aim(page, [p.x, p.y], z);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(v.out, `${p.name}_z${z}_${look}.png`) });
    if (v.shift) await shifted(p, z, look);
    if (v.loupe) {
      await page.mouse.move(v.w / 2, v.h / 2);
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(v.out, `${p.name}_z${z}_${look}_loupe.png`) });
      await page.mouse.move(v.w - 2, 2);
    }
  }
}
console.log('done', v.out);
await close();
