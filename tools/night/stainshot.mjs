// Photograph each stain (src/stain.js) of one world, at given zooms.
//   TIDEMOTE_VK=1 ~/.local/bin/capped node tools/night/stainshot.mjs --out runs/night/stains --n 16384 --mature 300 --zoom fit,60
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage, aim } from '../pagelab.mjs';

const v = { out: 'runs/night/stains', n: 16384, mature: 300, zoom: 'fit', k: '{}', html: 'dist/tidemote.html', w: 1280, h: 800, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, setSpeed, close } = await openPage({ ...v, tmp: 'stain-' });
const n = await page.evaluate(() => 7);
for (let s = 0; s < n; s++) {
  for (const z of String(v.zoom).split(',')) {
    await aim(page, v.at ? v.at.split(',').map(Number) : 'center', z);
    await setSpeed(1); await page.waitForTimeout(1500); await setSpeed(0);
    const f = path.join(v.out, `stain${s}_z${z}.png`);
    await page.screenshot({ path: f });
    console.log(f);
  }
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
}
await close();
