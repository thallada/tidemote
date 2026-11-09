// The editor at a phone's size, touch on (Windows Chrome, its emulation): screenshots of the layout, a cut tapped on
// the timeline, the library with a cut selected, a card's → cut, and a two-finger pinch on the timeline.
//   tools/gpu-node.sh tools/promo/mobcheck.mjs [--w 412 --h 915] [--out C:/Users/Public/mobcheck]
import fs from 'node:fs';
import { openEditor, args } from './edpage.mjs';
const W = +(args.w || 412), H = +(args.h || 915), OUT = args.out || 'C:/Users/Public/mobcheck';
fs.mkdirSync(OUT, { recursive: true });
const { browser, ctx, page, errs } = await openEditor({ viewport: { width: W, height: H }, context: { deviceScaleFactor: 2.6, isMobile: true, hasTouch: true } });
await page.waitForTimeout(2500);
const box = async (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom }; }, sel);
const out = { mob: await page.evaluate(() => document.body.classList.contains('mob')), vh: H, stage: await box('#stage'), tl: await box('#tl'), track: await box('#track'), tabs: await box('#mtabs'), lib: await box('#lib'), scrollW: await page.evaluate(() => document.documentElement.scrollWidth) };
await page.screenshot({ path: `${OUT}/1-layout.png` });
// tap the 5th cut on the timeline
const t = await box('#track'), cx = await page.evaluate(() => { const c = window.__ed.S.sp[4]; return (c.t0 + c.t1) / 2 * window.__ed.S.pps - document.getElementById('tlscroll').scrollLeft; });
await page.touchscreen.tap(t.x + cx, t.y + t.h / 2); await page.waitForTimeout(800);
out.selAfterTap = await page.evaluate(() => window.__ed.S.sel); out.tabCut = await page.evaluate(() => document.body.classList.contains('tab-cut'));
await page.screenshot({ path: `${OUT}/2-cut.png` });
// start ▶ button
const before = await page.evaluate(() => window.__ed.S.edl.cuts[4].at);
await page.tap('#i-next'); await page.waitForTimeout(300);
out.moved = [before, await page.evaluate(() => window.__ed.S.edl.cuts[4].at)];
await page.evaluate(() => document.getElementById('undo').click());
// the library tab, a card's → cut
await page.tap('#tab-lib'); await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/3-lib.png` });
const card = await page.evaluate(() => { const b = document.querySelector('.card .use'); const r = b?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2, id: b.closest('.card').dataset.id, txt: b.textContent, vis: getComputedStyle(b).display }; });
out.useBtn = card;
if (card) { await page.touchscreen.tap(card.x, card.y); await page.waitForTimeout(500); out.replaced = await page.evaluate((id) => window.__ed.S.edl.cuts[4].clip === id, card.id); await page.evaluate(() => document.getElementById('undo').click()); }
// pinch: two touches spreading on the timeline (CDP)
const cdp = await ctx.newCDPSession(page), y = t.y + t.h / 2, pps0 = await page.evaluate(() => window.__ed.S.pps);
const tp = (type, a, b) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: a, y, id: 1 }, { x: b, y, id: 2 }] });
await tp('touchStart', W / 2 - 30, W / 2 + 30);
for (let k = 1; k <= 10; k++) { await tp('touchMove', W / 2 - 30 - k * 8, W / 2 + 30 + k * 8); await page.waitForTimeout(30); }
await tp('touchEnd'); await page.waitForTimeout(300);
out.pinch = [pps0, +(await page.evaluate(() => window.__ed.S.pps)).toFixed(1)];
await page.screenshot({ path: `${OUT}/4-pinch.png` });
out.dirty = await page.evaluate(() => window.__ed.S.dirty);
console.log(JSON.stringify(out, null, 1)); console.log('errors', errs.length ? errs : 'none');
await browser.close();
