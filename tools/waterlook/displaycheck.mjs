// Drive Settings → Display → Water surface and Wave motion in the built page: each choice reaches the sea
// (Engine.seaTune), Off stops its passes, and the panel is photographed.
//   tools/gpu-node.sh tools/waterlook/displaycheck.mjs --out runs/look/display
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage } from '../pagelab.mjs';

const v = { out: 'runs/look/display', n: 131072, mature: 20, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, close } = await openPage({ ...v, tmp: 'displaycheck-' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// (the dock is hidden for clean frames: its controls are pressed from within the page, and the panel shown again)
const press = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) throw new Error(`no ${sel}`); b.click(); }, sel);
await page.evaluate(() => { for (const st of document.querySelectorAll('style')) if (st.textContent.startsWith('#dock,#floats')) st.remove(); });
await press('#set-open');
await page.waitForTimeout(300);
const sea = () => page.evaluate(() => { const t = globalThis.__tidemote.eng.seaTune; return { height: t.height, view: t.view, pace: t.pace, follow: t.follow }; });
console.log('default', JSON.stringify(await sea()));
await page.screenshot({ path: path.join(v.out, 'panel.png') });
for (const w of [0, 1, 3, 2]) {
  await press(`[data-o="water"][data-v="${w}"]`);
  await page.waitForTimeout(200);
  console.log('water', w, JSON.stringify(await sea()), 'wave row', await page.evaluate(() => !!document.querySelector('[data-o="waves"]')));
}
for (const m of [0, 2, 1]) { await press(`[data-o="waves"][data-v="${m}"]`); await page.waitForTimeout(150); console.log('waves', m, JSON.stringify(await sea())); }
console.log('kept', await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('tidemote.view') || '{}'); return JSON.stringify({ water: p.water, waves: p.waves }); }));
console.log('errors', JSON.stringify(errors));
await close();
