// The editor's timeline driven with a real mouse in Windows Chrome, at its opening zoom: every cut hovered at its middle
// and clicked (is it the one selected, and named in the hover label?), a pinch zoom about the pointer, ',' and '.' moving
// the selected cut, the hit marks on the cuts.   tools/gpu-node.sh tools/promo/tlcheck.mjs [--edl v12-manual]
import fs from 'node:fs';
import { openEditor, args } from './edpage.mjs';
const OUT = args.out || 'C:/Users/Public/tlcheck'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errs } = await openEditor({ viewport: { width: 1512, height: 945 } }); // a 14" MacBook's default
const info = await page.evaluate(() => { const S = window.__ed.S; return { pps: S.pps, n: S.sp.length, marks: { on: document.querySelectorAll('.hitmark.on').length, off: document.querySelectorAll('.hitmark.off').length } }; });
console.log('opening zoom', info.pps, 'px/s;', info.n, 'cuts; marks', info.marks);
const res = { ok: 0, wrong: [], label: 0, thin: 0 };
for (let i = 0; i < info.n; i++) {
  const g = await page.evaluate((i) => {
    const S = window.__ed.S, c = S.sp[i], sc = document.getElementById('tlscroll'), tin = document.getElementById('tlin').getBoundingClientRect(), tr = document.getElementById('track').getBoundingClientRect();
    const x0 = c.t0 * S.pps, x1 = c.t1 * S.pps; sc.scrollLeft = Math.max(0, (x0 + x1) / 2 - sc.clientWidth / 2);
    const r = document.getElementById('tlin').getBoundingClientRect();
    return { x: r.left + (x0 + x1) / 2, y: tr.top + tr.height / 2, w: x1 - x0 };
  }, i);
  if (g.w < 8) res.thin++;
  await page.mouse.move(g.x, g.y); await page.mouse.move(g.x + 0.2, g.y);
  const lbl = await page.evaluate(() => document.getElementById('tlhover').textContent);
  if (lbl.startsWith(`${i + 1} ·`)) res.label++;
  await page.mouse.down(); await page.mouse.up();
  const sel = await page.evaluate(() => window.__ed.S.sel);
  if (sel === i) res.ok++; else res.wrong.push(`${i + 1}→${sel + 1} (${g.w.toFixed(1)} px)`);
}
console.log(`clicked at their middles: ${res.ok}/${info.n} selected (${res.thin} narrower than 8 px), hover label right on ${res.label}; wrong: ${res.wrong.join(' ') || 'none'}`);
await page.screenshot({ path: `${OUT}/timeline.png` });
// pinch zoom over cut 60 (the peak): the time under the pointer should stay under it
const z = await page.evaluate(() => { const S = window.__ed.S, sc = document.getElementById('tlscroll'), c = S.sp[59]; sc.scrollLeft = c.t0 * S.pps - 300; const r = sc.getBoundingClientRect(), tr = document.getElementById('track').getBoundingClientRect(); return { x: r.left + 300, y: tr.top + 20, t: c.t0, pps: S.pps }; });
await page.mouse.move(z.x, z.y); await page.keyboard.down('Control'); for (let k = 0; k < 6; k++) await page.mouse.wheel(0, -100); await page.keyboard.up('Control');
await page.waitForTimeout(200);
const z2 = await page.evaluate((x) => { const S = window.__ed.S, sc = document.getElementById('tlscroll'), r = sc.getBoundingClientRect(); return { pps: S.pps, t: (sc.scrollLeft + x - r.left) / S.pps }; }, z.x);
console.log(`pinch: ${z.pps} → ${z2.pps.toFixed(1)} px/s, time under the pointer ${z.t.toFixed(3)} → ${z2.t.toFixed(3)} s`);
await page.screenshot({ path: `${OUT}/zoomed.png` });
// ',' and '.' with Snap at strong hits on cut 20
const mv = await page.evaluate(async () => {
  const E = window.__ed, S = E.S; document.getElementById('snap').value = 'hit'; E.selectCut(19, false);
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  const a = S.edl.cuts[19].at; key('.'); const b = S.edl.cuts[19].at; key(','); const c = S.edl.cuts[19].at;
  return { a, b, c, dirty: S.dirty };
});
console.log(`'.' then ',' on cut 20 (snap: strong hits): ${mv.a} → ${mv.b} → ${mv.c}`);
console.log('errors', errs.length ? errs : 'none');
await browser.close();
