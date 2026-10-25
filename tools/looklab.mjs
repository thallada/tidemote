// The look lab: grow a world in the built page (Windows Chrome on the GPU), then hold it still and photograph
// staged scenes of the pool (a water level, ice, raindrops of given ages), swapping in each new composite shader
// as it is written, without growing the world again (docs/catastrophes.md).
//   tools/gpu-node.sh tools/looklab.mjs --dir runs/look [--n 262144] [--mature 90] [--k '{}']
// It waits for DIR/cmd.json ({ id, wgsl?: path to a composite shader, scenes: [...] }); each scene:
//   { name, level: 1, frost: 0, rain: 0, drops: [[dx, dy, age, strength], ...] (from the scene's center), at: [x, y] | 'shore' | 'ice',
//     zoom: pixels per world unit | 'fit', run: simulated seconds to run first (at speed 1) }
// and writes DIR/NAME.png for each, then DIR/done.json ({ id, errors }). `node tools/looklab.mjs --dump FILE` writes
// the current POST_WGSL to FILE (run it under WSL's node; the lab reads the file).
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage, aim } from './pagelab.mjs';

const args = cliArgs();
if (args.dump) {
  const { POST_WGSL } = await import('../src/shaders.js');
  fs.writeFileSync(args.dump, POST_WGSL);
  process.exit(0);
}
const v = { dir: 'runs/look', k: '{}', n: 262144, mature: 90, ...args };
fs.mkdirSync(v.dir, { recursive: true });
const { page, simTime, runTo, evalCode, close } = await openPage({ ...v, tmp: 'look-' });
// while a scene is staged the climate holds still (the page ticks it even when paused, which would reset the weather)
await page.evaluate(() => { const c = globalThis.__tidemote.climate(), tick = c.tick.bind(c); c.tick = (dt) => { if (!globalThis.__lookHold) tick(dt); }; });
console.log('ready', (await simTime()).toFixed(0));

let last = null;
const cmdPath = path.join(v.dir, 'cmd.json');
for (;;) {
  await new Promise((r) => setTimeout(r, 400));
  let cmd;
  try { cmd = JSON.parse(fs.readFileSync(cmdPath, 'utf8')); } catch { continue; }
  if (cmd.id === last) continue;
  last = cmd.id;
  if (cmd.quit) break;
  let errors = [];
  if (cmd.eval) console.log('eval', JSON.stringify(await evalCode(cmd.eval)));
  if (cmd.wgsl) errors = await page.evaluate((code) => globalThis.__tidemote.eng.hotComposite(code), fs.readFileSync(cmd.wgsl, 'utf8'));
  for (const s of errors.length ? [] : cmd.scenes ?? []) {
    if (s.run) {
      await page.evaluate(() => { globalThis.__lookHold = false; });
      await runTo((await simTime()) + s.run, s.speed ?? 1);
    }
    await page.evaluate((s) => {
      globalThis.__lookHold = !s.live;
      if (s.live) return;
      const e = globalThis.__tidemote.eng;
      e.level = s.level ?? 1; e.frost = s.frost ?? 0; e.rain = s.rain ?? (s.drops?.length ? 1 : 0); e.freezing = s.freezing ?? 0;
    }, s);
    const [x, y] = await aim(page, s.at, s.zoom ?? 'fit', s.off);
    if (!s.live) {
      await page.evaluate(([drops, x, y]) => {
        const e = globalThis.__tidemote.eng;
        e.drops.fill(0);
        drops.forEach(([dx, dy, age, w], k) => e.drops.set([x + dx, y + dy, e.simTime - age, w ?? 2], k * 4));
      }, [s.drops ?? [], x, y]);
    }
    await page.waitForTimeout(s.wait ?? 700);
    await page.screenshot({ path: path.join(v.dir, `${s.name}.png`) });
  }
  fs.writeFileSync(path.join(v.dir, 'done.json'), JSON.stringify({ id: cmd.id, errors }));
  console.log('done', cmd.id, errors.length ? errors.slice(0, 5) : '');
}
await close();
