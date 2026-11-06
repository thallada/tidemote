// The night's features in the built page: every stain from afar, then a grafted cell picked close up (its mind view's
// words and lamps read back), the Grafts stain close up.
//   TIDEMOTE_VK=1 ~/.local/bin/capped node tools/night/pagecheck.mjs --out runs/night/page --n 16384 --mature 360
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage, aim } from '../pagelab.mjs';

const v = { out: 'runs/night/page', n: 16384, mature: 360, k: '{}', html: 'dist/tidemote.html', w: 1280, h: 800, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, setSpeed, close } = await openPage({ ...v, tmp: 'night-' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => { const f = path.join(v.out, `${name}.png`); await page.screenshot({ path: f }); console.log(f); };
const stains = await page.evaluate(() => 8);
await aim(page, 'center', 'fit');
for (let s = 0; s < stains; s++) {
  await setSpeed(1); await page.waitForTimeout(1200); await setSpeed(0);
  await shot(`stain${s}`);
  console.log('stain', s, await page.evaluate(() => [globalThis.__tidemote.state.stain, document.getElementById('maps-label')?.textContent, document.getElementById('maps')?.hidden]));
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
}
// a grafted cell: the one with the most grafts near it
const g = await page.evaluate(async () => {
  const T = globalThis.__tidemote, st = await T.eng.readState();
  const n = st.cpu.count, pf = new Float32Array(st.gpu.parts), pu = new Uint32Array(st.gpu.parts), it = new Uint32Array(st.gpu.intent);
  const all = [];
  for (let i = 0; i < n; i++) {
    const k = pu[i * 10 + 4]; if (k < 5) continue;
    for (const j of [it[i * 4 + 2], it[i * 4 + 3]]) if (j < n && j !== i && pu[j * 10 + 4] >= 5 && pu[j * 10 + 4] !== k) all.push([pf[i * 10], pf[i * 10 + 1], pu[i * 10 + 7]]);
  }
  let best = null, bs = -1;
  for (const a of all) { const s = all.filter((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 2).length; if (s > bs) { bs = s; best = a; } }
  return { count: all.length, best, near: bs };
});
console.log('grafts', JSON.stringify(g));
if (g.best) {
  await aim(page, [g.best[0], g.best[1]], 260);
  await page.waitForTimeout(500);
  await shot('graft-close');
  await page.mouse.click(v.w / 2, v.h / 2);
  await setSpeed(1); await page.waitForTimeout(2500);
  await shot('graft-picked');
  console.log('mind:', await page.evaluate(() => {
    const m = document.querySelector('.mv');
    return m ? [...m.querySelectorAll('.mv-mode, .mv-tname, .lamp.on span')].map((e) => e.textContent).join(' | ') + ' || ' + (document.querySelector('.mv-mode')?.dataset.hint || '') : 'no mind view';
  }));
  // the Grafts stain close up (stain index 3)
  await page.evaluate(() => { globalThis.__tidemote.state.stain = 0; });
  for (let s = 0; s < 3; s++) await page.keyboard.press('j');
  await page.waitForTimeout(1500);
  await shot('graft-stain-close');
  await setSpeed(0);
}
fs.writeFileSync(path.join(v.out, 'book.html'), await page.evaluate(() => globalThis.__tidemote.bookHtml()));
console.log('stories:', await page.evaluate(() => globalThis.__tidemote.life().chronicle.filter((e) => e.type === 'story').map((e) => e.text)));
console.log('page errors:', errors.length ? errors : 'none');
await close();
