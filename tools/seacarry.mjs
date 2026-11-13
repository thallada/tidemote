// The sea between its turns (Engine.fx.seaEvery), as the composite shows it: a held world, the sea turned at a moment,
// then shown d seconds later (of real time, at the sea's pace for its roughness) three ways: turned afresh (the full
// rate), carried along its drift since the turn (as the page does), and held as turned (no drift). Writes
// DIR/r<rough>-v<view>-<d>-{full,carried,held,again}.png (again: the full rate shot twice, the floor) for
// tools/seacarry.py (1 - SSIM of each against the full rate). view 1: the sea's light alone (seaTune.view).
//   tools/gpu-node.sh tools/seacarry.mjs --out runs/seacarry [--n 8192] [--zoom 150]
import fs from 'node:fs';
import path from 'node:path';
import { cliArgs, openPage } from './pagelab.mjs';

const v = { n: 8192, mature: 20, zoom: 150, out: 'runs/seacarry', ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, close } = await openPage({ ...v, tmp: 'seacarry-' });
await page.evaluate(async (zoom) => {
  const T = globalThis.__tidemote, e = T.eng, cam = T.cam;
  T.setSpeed(0);
  const ppuFit = Math.max(innerWidth / e.grid[0], innerHeight / e.grid[1]);
  cam.zoom = cam.zoomTarget = zoom / ppuFit; cam.anchor = null;
  // (the sea turned only when made afresh: paused, its clock still)
  e.fx.seaEvery = 1e9;
  e.seaTune.pace = 0;
}, +v.zoom);
const settle = () => page.waitForTimeout(400);
const shot = (name) => page.screenshot({ path: path.join(v.out, `${name}.png`) });
for (const rough of [0, 1]) for (const view of [0, 1]) for (const d of [1 / 30, 1 / 10]) {
  const tag = `r${rough}-v${view}-${d.toFixed(3)}`;
  await page.evaluate(([rough, view]) => { const e = globalThis.__tidemote.eng; e.seaTune.rough = rough; e.seaTune.view = view; e._seaT = 200; e._seaVer++; }, [rough, view]);
  await settle();
  // the clock on by d (as the sea's pace has it at this roughness), not turned: carried, then held
  await page.evaluate(([d]) => { const e = globalThis.__tidemote.eng, t = e.seaTune; e._seaT = 200 + d * (t.calmPace + (1 - t.calmPace) * e.seaRough); }, [d]);
  await settle(); await shot(`${tag}-carried`);
  await page.evaluate(() => { const e = globalThis.__tidemote.eng; e._driftWas = e._seaDrift; e._seaDrift = 0; });
  await settle(); await shot(`${tag}-held`);
  await page.evaluate(() => { const e = globalThis.__tidemote.eng; e._seaDrift = e._driftWas; e._seaVer++; });
  await settle(); await shot(`${tag}-full`);
  // (the same again, a moment later: what changes with nothing changed, the floor)
  await settle(); await shot(`${tag}-again`);
}
await close();
console.log('wrote', v.out);
