// The promo editor driven in Windows Chrome (H.264 proxies need Chrome's codecs), from a cold browser (nothing cached):
// plays the program from --at for --secs (the whole track by default) and, every animation frame, checks that what the
// viewer shows is the frame the master will have there: the shown element's last presented frame (requestVideoFrameCallback)
// against the cut's in-point plus the time into it. Counts black (a cut with a shot but no decoded frame shown), stale
// (the frame more than 2 frames off: frozen or out of step), the title image undecoded while it shows, and the time the
// playback spent waiting for video. Then fullscreen and closing the inspector.
// With the rendered preview (editor/preview.mjs) it first waits for the server to have every cut made (--live: plays the
// cuts live, the rendered preview off), then counts the frames shown from it and from live shots.
//   tools/gpu-node.sh tools/promo/edcheck.mjs [--edl v12-manual] [--out DIR] [--at 0] [--secs all] [--throttle MBPS] [--latency 30] [--live] [--passes 2]
import fs from 'node:fs';
import { openEditor, args } from './edpage.mjs';
const LIVE = !!args.live, OUT = args.out || 'C:/Users/Public/edcheck', AT = +(args.at || 0), SECS = args.secs || 'all', PASSES = +(args.passes || 1);
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errs } = await openEditor();
if (LIVE) await page.evaluate(() => { const r = document.getElementById('rendered'); r.checked = false; r.onchange(); });
else { const t0 = Date.now(); await page.waitForFunction(() => window.__ed.P.man?.state === 'ready', null, { timeout: 600000, polling: 500 }); console.log(`preview rendered (server) after ${((Date.now() - t0) / 1000).toFixed(1)} s`); }
await page.screenshot({ path: `${OUT}/editor.png` });
for (let pass = 1; pass <= PASSES; pass++) {
if (pass > 1) { await page.evaluate(() => window.__ed.pause()); console.log(`pass ${pass}`); }
const res = await page.evaluate(async ([at, secs]) => {
  const E = window.__ed, S = E.S;
  // every element's last presented frame
  const last = new Map();
  for (const v of [...E.vids, E.prog]) { const f = (now, md) => { last.set(v, { mt: md.mediaTime, src: v.currentSrc }); v.requestVideoFrameCallback(f); }; v.requestVideoFrameCallback(f); }
  const end = secs === 'all' ? S.times.total - 0.1 : at + +secs;
  E.seek(at); E.play();
  const t0 = performance.now(); let pauses = 0, wasWaiting = false, rendered = 0, frames = 0, black = 0, stale = 0, title = 0, waitMs = 0, prev = performance.now();
  const bad = [], perCut = {}; const note = (k, i) => { perCut[i + 1] = perCut[i + 1] || {}; perCut[i + 1][k] = (perCut[i + 1][k] || 0) + 1; };
  while (S.t < end && performance.now() - t0 < (end - at) * 1000 * 3 + 20000) {
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now(), dt = now - prev; prev = now;
    if (!S.playing) { if (S.t >= end - 0.2) break; continue; }
    if (S.waiting) { if (!wasWaiting) pauses++; wasWaiting = true; waitMs += dt; continue; }
    wasWaiting = false;
    const t = E.audio.currentTime, i = S.sp.findLastIndex((c) => c.t0 <= t), c = S.sp[i];
    if (!c) continue;
    frames++;
    // a title due here (past its first frames) with no decoded card showing
    for (const tt of S.edl.titles || []) { const a = S.when(tt.from), b = S.when(tt.to); if (t > a + 0.1 && t < b - 0.1 && ![...document.querySelectorAll('.titlecard')].some((im) => +im.style.opacity > 0 && im.complete && im.naturalWidth)) title++; }
    if (!c.clipInfo) continue;
    const local = t - c.t0;
    const v = [...E.vids, E.prog].find((v) => v.classList.contains('show'));
    if (v === E.prog) {
      // the program: frame f is f/60 s on the timeline
      rendered++; const l = last.get(v);
      if (!l) { if (local > 1 / 30) { black++; note('black', i); } continue; }
      const err = l.mt - t;
      if (Math.abs(err) > 2.5 / 60 && local > 1 / 30) { stale++; note('off', i); if (bad.length < 12) bad.push(`off ${t.toFixed(2)} cut ${i + 1} by ${(err * 60).toFixed(1)}f (rendered)`); }
      continue;
    }
    const want = '/lib/' + c.clipInfo.proxy, l = v && last.get(v);
    if (!v || !l || !decodeURI(l.src).split('?')[0].endsWith(want)) {
      if (local > 1 / 30) { black++; note('black', i); }
      continue;
    }
    const err = l.mt - (Math.ceil(c.cin * 60 - 1e-6) / 60 + local); // the render starts a cut on the in-point's next whole frame
    if (Math.abs(err) > 2.5 / 60 && local > 1 / 30) { stale++; note('off', i); if (bad.length < 12) bad.push(`off ${t.toFixed(2)} cut ${i + 1} by ${(err * 60).toFixed(1)}f`); }
  }
  E.pause();
  // scrubbing while paused: random times; how long until the viewer shows the right frame (or 3 s: never)
  const lat = [];
  for (let k = 0; k < 30; k++) {
    const t = 1 + ((k * 0.6180339) % 1) * (S.times.total - 3); E.seek(t);
    const i = S.sp.findLastIndex((c) => c.t0 <= S.t), c = S.sp[i]; if (!c?.clipInfo) continue;
    const exp = Math.floor((Math.ceil(c.cin * 60 - 1e-6) / 60 + (S.t - c.t0)) * 60 + 1e-6) / 60, s0 = performance.now(); let ok = false;
    while (performance.now() - s0 < 3000) {
      await new Promise((r) => requestAnimationFrame(r));
      const v = [...E.vids, E.prog].find((v) => v.classList.contains('show')), l = v && last.get(v);
      if (v === E.prog && l && Math.abs(l.mt - Math.floor(S.t * 60 + 1e-6) / 60) < 0.5 / 60) { ok = true; break; }
      if (l && decodeURI(l.src).split('?')[0].endsWith('/lib/' + c.clipInfo.proxy) && Math.abs(l.mt - exp) < 0.5 / 60) { ok = true; break; }
    }
    lat.push(ok ? Math.round(performance.now() - s0) : 9999);
  }
  lat.sort((a, b) => a - b);
  return { scrubMs: { median: lat[lat.length >> 1], p90: lat[Math.floor(lat.length * 0.9)], never: lat.filter((x) => x === 9999).length }, perCut, frames, rendered, black, stale, titleUndecoded: title, waitedS: +(waitMs / 1000).toFixed(2), pauses, wallS: +((performance.now() - t0) / 1000).toFixed(1), bad };
}, [AT, SECS]);
console.log('playback', JSON.stringify(res, null, 1));
}
await page.screenshot({ path: `${OUT}/editor-after.png` });
// fullscreen and the inspector's close
const ui = await page.evaluate(async () => {
  const E = window.__ed, out = {};
  E.selectCut(3); out.inspOpen = !!document.querySelector('#insp h3');
  const x = document.getElementById('i-close'); if (x) x.click(); out.closedByButton = E.S.sel === -1 && !document.querySelector('#insp h3');
  E.selectCut(4); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); out.closedByEsc = E.S.sel === -1;
  out.fsButton = !!document.getElementById('fs');
  return out;
});
await page.click('#fs').catch(() => {});
await page.waitForTimeout(800);
ui.fullscreen = await page.evaluate(() => !!document.fullscreenElement && document.fullscreenElement.id);
await page.screenshot({ path: `${OUT}/fullscreen.png` });
console.log('ui', JSON.stringify(ui));
console.log('errors', errs.length ? errs : 'none');
await browser.close();
