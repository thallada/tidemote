// How the controller's interface looks, measured and photographed (docs/controller.md, Tests): pad-check drives what
// the buttons do; this checks what the eye sees, at a Steam Deck's size by default, in device pixels enough to read.
//   - focus rings: every control of every panel focused in turn (Settings' and the Lab's tabs each, the bench, the
//     specimen, the dock, the Controls), its ring's rectangle never cut by a panel or row that clips;
//   - layout: in the panels open, no label or chip whose text overflows it or runs into its neighbour, no chip row
//     wrapping a chip onto a line of its own;
//   - the glyphs: each family's buttons photographed, the ink of each label centered in its outline (pixels, pngjs);
//   - the legend over the dock in each context, sliders taken hold of, a glossary hint shown by A, the instruments
//     in the water as A holds them, the roses: photographed into --out for a person to look at.
//   npm run build && tools/gpu-node.sh tools/pad-look.mjs [--size 1280x800] [--out runs/ui/pad-look] [--page dist/x.html]
import fs from 'node:fs'; import path from 'node:path';
import { PNG } from 'pngjs';
import { openPage, BTN } from './lib/inputpage.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [w, h] = arg('--size', '1280x800').split('x').map(Number);
const out = arg('--out', 'runs/ui/pad-look');
const SCALE = 2;
fs.mkdirSync(out, { recursive: true });
const { page, check, done, T, pad, frames } = await openPage({ size: { width: w, height: h }, file: arg('--page', 'dist/tidemote.html'), scale: SCALE });
const shot = async (name, clip) => { await page.screenshot({ path: path.join(out, `${name}.png`), ...(clip ? { clip } : {}) }); };
const wait = (ms) => page.waitForTimeout(ms);
// Settings as a controller opens them: Menu (unless the menu is open), then A on its Settings; closed by B, back to the
// menu, and B again
const menuOpen = () => T(() => !document.getElementById('gmenu').hidden);
async function openSettings() {
  if (!(await menuOpen())) { await pad.press(BTN.MENU); await wait(250); }
  await T(() => document.querySelector('#gmenu [data-g="settings"]')?.focus());
  await pad.press(BTN.S); await wait(300);
}
async function closeSettings() {
  await pad.press(BTN.E); await wait(200);
  if (await menuOpen()) { await pad.press(BTN.E); await wait(200); }
}
const box = (sel, pad = 8) => T(([s, p]) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.width ? { x: Math.max(0, r.left - p), y: Math.max(0, r.top - p), width: Math.min(innerWidth - Math.max(0, r.left - p), r.width + 2 * p), height: Math.min(innerHeight - Math.max(0, r.top - p), r.height + 2 * p) } : null; }, [sel, pad]);
const S = () => T(() => { const i = __tidemote.input; return { ctx: i.padCtx(), glyphs: i.mode.glyphs, ...i.open(), ...i.held(), active: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName }; });

// a controller in use
await pad.plug();
await pad.press(BTN.DOWN); await pad.press(BTN.DOWN);
await T(() => __tidemote.setSpeed(1));
await wait(1500);
check('the pad is in use', (await S()).glyphs === 'pad');

// ------------------------------------------------------------ in the page: the audits
// Every control in root focused in turn: each whose ring (its box grown by the outline's offset and width) is cut by
// an ancestor that clips. Returns { n, cut: [descriptions] }.
async function ringAudit(rootSel, label) {
  const r = await T((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { n: 0, cut: ['(no root)'] };
    const sels = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex], [role="tab"], summary';
    // (a control that takes its own arrows draws its own focus: the lineage tree's named row)
    const shows = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.closest('[hidden], [inert], .sr-only') && !el.disabled && el.dataset.arrows == null && getComputedStyle(el).visibility !== 'hidden'; };
    const els = [...root.querySelectorAll(sels)].filter(shows);
    const cut = [];
    for (const el of els) {
      el.focus({ preventScroll: false });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (document.activeElement !== el) continue;
      const cs = getComputedStyle(el);
      // (a ring, or words' tint and bar drawn inside their box: box-shadow inset)
      // (a ring, or words' tint and thick underline: then what must show is the underline, just under the baseline,
      // about two thirds down the words' box)
      const ringed = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, under = /underline/.test(cs.textDecorationLine) && parseFloat(cs.textDecorationThickness) >= 2;
      if (!ringed && !under) { cut.push(`${desc(el)}: no ring`); continue; }
      const g = ringed ? parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth) : 0;
      const b = el.getBoundingClientRect();
      const ring = ringed ? { l: b.left - g, t: b.top - g, r: b.right + g, b: b.bottom + g }
        : { l: b.left, r: b.right, t: b.top + b.height * 0.5, b: b.top + b.height * 0.8 };
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const ncs = getComputedStyle(n);
        if (ncs.overflowX === 'visible' && ncs.overflowY === 'visible') continue;
        const nb = n.getBoundingClientRect();
        const c = { l: nb.left + n.clientLeft, t: nb.top + n.clientTop, r: nb.left + n.clientLeft + n.clientWidth, b: nb.top + n.clientTop + n.clientHeight };
        const sides = [];
        if (ncs.overflowX !== 'visible' && ring.l < c.l - 0.5) sides.push('left');
        // (words cut short by an ellipsis are cut there, underline and all, as the words are)
        if (ncs.overflowX !== 'visible' && ring.r > c.r + 0.5 && !(under && ncs.textOverflow === 'ellipsis')) sides.push('right');
        if (ncs.overflowY !== 'visible' && ring.t < c.t - 0.5) sides.push('top');
        if (ncs.overflowY !== 'visible' && ring.b > c.b + 0.5) sides.push('bottom');
        if (sides.length) { cut.push(`${desc(el)}: ${sides.join('+')} cut by ${desc(n)}`); break; }
      }
    }
    function desc(e) { return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}${e.textContent ? ` "${e.textContent.trim().slice(0, 18)}"` : ''}`; }
    document.activeElement?.blur?.();
    return { n: els.length, cut };
  }, rootSel);
  check(`${label}: every ring whole (${r.n} controls)`, r.n > 0 && !r.cut.length, r.cut.slice(0, 6).join(' | '));
}
// In root: text overflowing its box, labels running into the control beside them, chips wrapped alone onto a line
async function layoutAudit(rootSel, label) {
  const bad = await T((sel) => {
    const root = document.querySelector(sel), bad = [];
    if (!root) return ['(no root)'];
    // (the lines a range of text takes: its boxes' tops, those within 6 px of each other one line)
    const lines = (range) => { const tops = [...range.getClientRects()].map((q) => q.top).sort((a, b) => a - b); return tops.filter((t, i) => !i || t - tops[i - 1] > 6).length; };
    const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !e.closest('[hidden]'); };
    for (const e of root.querySelectorAll('button, .lbl, .chip, label, .tab, [role="tab"]')) {
      if (!vis(e)) continue;
      const cs = getComputedStyle(e);
      if (cs.overflow === 'visible' && e.scrollWidth > e.clientWidth + 1 && cs.whiteSpace === 'nowrap') bad.push(`overflows: "${e.textContent.trim().slice(0, 24)}" ${e.scrollWidth}>${e.clientWidth}`);
    }
    // a row's label and its control side by side must not overlap
    for (const o of root.querySelectorAll('.opt')) {
      if (!vis(o)) continue;
      const l = o.querySelector('.lbl'), c = o.querySelector('.lbl + *');
      if (!l || !c) continue;
      const lr = l.getBoundingClientRect(), cr = c.getBoundingClientRect();
      // (the label's text, not its box: a range of its contents)
      const rg = document.createRange(); rg.selectNodeContents(l); const tr = rg.getBoundingClientRect();
      if (tr.right > cr.left + 0.5 && tr.bottom > cr.top + 0.5 && tr.top < cr.bottom - 0.5) bad.push(`label runs into its control: "${l.textContent.trim()}"`);
      // chips in a row: every chip one line high, and in a grid none alone on a row that is not the grid's last
      const chips = [...c.querySelectorAll('.chip')].filter(vis);
      const hs = chips.map((x) => x.getBoundingClientRect().height);
      if (hs.length && Math.max(...hs) > Math.min(...hs) + 2) bad.push(`chips of unequal height in "${l.textContent.trim()}"`);
      for (const x of chips) {
        const range = document.createRange(); range.selectNodeContents(x);
        if (lines(range) > 1) bad.push(`chip wraps: "${x.textContent.trim()}" in "${l.textContent.trim()}"`);
      }
    }
    // a footer's links each on one line
    for (const f of root.querySelectorAll('.set-foot .link, .set-foot button')) {
      if (!vis(f)) continue;
      const range = document.createRange(); range.selectNodeContents(f);
      if (lines(range) > 1) bad.push(`footer link wraps: "${f.textContent.trim()}"`);
    }
    return bad;
  }, rootSel);
  check(`${label}: nothing overflows, overlaps or wraps`, !bad.length, bad.slice(0, 6).join(' | '));
}

// ------------------------------------------------------------ the glyphs: each label's ink centered in its outline
// Of glyph rects ({x, y, w, h}, CSS px) photographed in file (clip: where it was taken), how far each label's ink
// (bright pixels 3 CSS px clear of the outline) sits from the outline's center: { dx, dy, d } in CSS px, or null
function inkOffsets(file, clip, rects) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return rects.map((r) => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    const ox = (r.x - clip.x) * SCALE, oy = (r.y - clip.y) * SCALE, m = 3 * SCALE;
    for (let y = Math.ceil(oy + m); y < oy + r.h * SCALE - m; y++) for (let x = Math.ceil(ox + m); x < ox + r.w * SCALE - m; x++) {
      const k = (y * png.width + x) * 4, l = 0.3 * png.data[k] + 0.59 * png.data[k + 1] + 0.11 * png.data[k + 2];
      if (l > 140) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 < 0) return null;
    const dx = ((x0 + x1 + 1) / 2 - (ox + (r.w * SCALE) / 2)) / SCALE, dy = ((y0 + y1 + 1) / 2 - (oy + (r.h * SCALE) / 2)) / SCALE;
    return { dx: +dx.toFixed(2), dy: +dy.toFixed(2), d: Math.max(Math.abs(dx), Math.abs(dy)) };
  });
}
// Every glyph showing on the page now, where it is shown (the legend, a hint, the Controls), measured in its own
// layout: its label's box centered in its outline (the page's styles for where it sits must not move it). Returns
// the worst { where, d } and the face buttons' rects for inkOffsets.
const glyphsInPlace = () => T(() => {
  let worst = { d: 0 }; const faces = [];
  for (const g of document.querySelectorAll('.gl:not(.gl-dpad)')) {
    const b = g.getBoundingClientRect(), l = g.firstElementChild?.getBoundingClientRect();
    if (!b.width || !l) continue;
    const d = Math.max(Math.abs(l.left + l.width / 2 - (b.left + b.width / 2)), Math.abs(l.top + l.height / 2 - (b.top + b.height / 2)));
    const where = g.closest('[id]')?.id;
    if (d > worst.d) worst = { d: +d.toFixed(2), where, label: g.getAttribute('aria-label'), display: getComputedStyle(g).display };
    if (g.classList.contains('gl-face') && !g.querySelector('svg')) faces.push({ x: b.left, y: b.top, w: b.width, h: b.height });
  }
  return { worst, faces };
});
await T(() => {
  const host = document.createElement('div');
  host.id = 'gl-sheet';
  host.style.cssText = 'position:fixed;left:20px;top:70px;z-index:99;background:#0b1214;padding:10px;display:grid;grid-template-columns:repeat(13, 30px);gap:8px;';
  document.body.append(host);
});
const places = ['S', 'E', 'W', 'N', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'L', 'R', 'UP'];
let worst = { d: 0 };
for (const fam of ['xbox', 'ps', 'switch', 'deck']) {
  await T(([fam]) => { document.body.dataset.pad = fam; }, [fam]);
  const rects = await T(([fam, places]) => {
    const host = document.getElementById('gl-sheet');
    host.innerHTML = places.map((p) => `<div style="display:grid;place-items:center;height:30px">${__tidemote.input.glyph(p, fam)}</div>`).join('');
    return [...host.querySelectorAll('.gl')].map((g) => { const r = g.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  }, [fam, places]);
  await frames(2);
  const sheet = await box('#gl-sheet', 0);
  const file = path.join(out, `glyphs-${fam}.png`);
  await page.screenshot({ path: file, clip: sheet });
  inkOffsets(file, sheet, rects).forEach((o, i) => {
    if (!o || places[i] === 'UP') return; // (the d-pad: a drawing, not a label)
    if (o.d > worst.d) worst = { ...o, fam, place: places[i] };
  });
}
await T(() => document.getElementById('gl-sheet').remove());
check('every glyph\'s label centered in its outline, on a sheet (within 0.75 px)', worst.d <= 0.75, JSON.stringify(worst));

// ------------------------------------------------------------ the rail with an event and a heat wave at once: nothing in it overlaps
{
  await T(() => { const c = __tidemote.climate(), t = __tidemote.eng.simTime; c.excursion = { t: t - 1, dur: 30, dT: 7 }; c.event = { type: 'duckweed', t: t - 1 }; c.phase = 'peak'; });
  await wait(1200);
  const o = await T(() => {
    const parts = [...document.querySelectorAll('.rail > *, .rail-right > *')].filter((e) => e.offsetParent && !e.classList.contains('rail-right'));
    const bad = [];
    for (const e of parts) {
      // (what each shows: its text's extent, not its box)
      const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect();
      for (const f of parts) if (f !== e && !e.contains(f) && !f.contains(e)) { const q = f.getBoundingClientRect(); if (r.right > q.left + 1 && r.left < q.right - 1 && r.bottom > q.top + 1 && r.top < q.bottom - 1) bad.push(`${e.id || e.className.split(' ')[0]} over ${f.id || f.className.split(' ')[0]}`); }
    }
    return bad;
  });
  check('the rail with an event and a heat wave: nothing overlaps', !o.length, o.slice(0, 4).join(' | '));
  await shot('rail-event', { x: 0, y: 0, width: w, height: 60 });
  await T(() => { const c = __tidemote.climate(); c.excursion = null; c.event = null; });
}
// ------------------------------------------------------------ the legend in the world
await T(() => { document.body.dataset.pad = __tidemote.input.mode.family; });
await frames(3);
// (the legend shows a few seconds after a button: two presses of pause to bring it up)
const wake = async () => { await pad.press(BTN.DOWN); await pad.press(BTN.DOWN); await wait(350); };
const legendOn = () => T(() => !document.getElementById('padbar').classList.contains('off'));
await wake();
const legendBox = await box('#padbar');
await shot('legend-world', legendBox);
{
  const { worst: w, faces } = await glyphsInPlace();
  check('in the legend, every glyph\'s label box centered in its outline (within 0.5 px)', w.d <= 0.5, JSON.stringify(w));
  const offs = inkOffsets(path.join(out, 'legend-world.png'), legendBox, faces).filter(Boolean);
  const bad = offs.reduce((a, o) => (o.d > a.d ? o : a), { d: 0 });
  check('in the legend, the face buttons\' letters centered by their pixels (within 0.75 px)', faces.length >= 3 && bad.d <= 0.75, JSON.stringify({ n: faces.length, worst: bad }));
}
const legendFits = await T(() => { const r = document.getElementById('padbar').getBoundingClientRect(), d = document.getElementById('dock').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= d.top + 1; });
check('the legend fits the screen, above the dock', legendFits);
await shot('world');

// ------------------------------------------------------------ the menu: its list and each page within it
await pad.press(BTN.MENU); await wait(300);
await layoutAudit('#gmenu', 'Menu');
await ringAudit('#gmenu', 'Menu');
await shot('menu', await box('#gmenu', 4));
await shot('menu-screen');
for (const [g, name] of [['save', 'worlds'], ['new', 'new'], ['events', 'events'], ['about', 'about']]) {
  await T((g) => document.querySelector(`#gmenu [data-g="${g}"]`)?.focus(), g);
  await pad.press(BTN.S); await wait(400);
  await layoutAudit('#gmenu', `Menu · ${name}`);
  await ringAudit('#gmenu', `Menu · ${name}`);
  await shot(`menu-${name}`, await box('#gmenu', 4));
  await pad.press(BTN.E); await wait(200);
}
// Quit, in the desktop app only: not in a browser
check('the menu has no Quit in a browser', await T(() => !document.querySelector('#gmenu [data-g="quit"]')));

// ------------------------------------------------------------ Settings: every tab
await openSettings();
await shot('settings-open', await box('#settings', 4));
await shot('settings-screen');
const tabs = await T(() => [...document.querySelectorAll('#settings [role="tab"]')].map((t) => t.textContent.trim()));
for (let i = 0; i < tabs.length; i++) {
  await T((i) => document.querySelectorAll('#settings [role="tab"]')[i].click(), i);
  await frames(2);
  await layoutAudit('#settings', `Settings · ${tabs[i]}`);
  await ringAudit('#settings', `Settings · ${tabs[i]}`);
  await T(() => { document.querySelector('#settings [role="tab"][aria-selected="true"]').focus(); document.querySelector('#settings .set-body, #settings .opts')?.scrollTo?.(0, 0); });
  await frames(2);
  await shot(`settings-${i}-${tabs[i].toLowerCase()}`, await box('#settings', 4));
}
// the controller row, close
await T(() => { const t = [...document.querySelectorAll('#settings [role="tab"]')].find((x) => /display/i.test(x.textContent)); t?.click(); });
await frames(2);
const promptsRow = await T(() => { const b = document.querySelector('#settings [data-o="prompts"]'); const o = b?.closest('.opt'); o?.scrollIntoView({ block: 'center' }); const r = o?.getBoundingClientRect(); return r ? { x: r.left - 6, y: r.top - 6, width: r.width + 12, height: r.height + 12 } : null; });
if (promptsRow) await shot('settings-controller-row', promptsRow);
check('Settings has the controller row', !!promptsRow);
const foot = await box('#settings .set-foot', 4);
if (foot) await shot('settings-foot', foot);

// a slider: focus moves past it until A takes hold; then the d-pad changes it, quickly; B lets go
await T(() => { const t = [...document.querySelectorAll('#settings [role="tab"]')].find((x) => /audio/i.test(x.textContent)); t?.click(); });
await frames(2);
const volAt = await T(() => { const v = document.getElementById('set-vol'); v?.focus(); return v ? +v.value : null; });
if (volAt == null) check('Settings → Audio has a volume slider', false);
else {
  await pad.press(BTN.RIGHT); let s = await S();
  const v1 = await T(() => +document.getElementById('set-vol').value);
  check('the d-pad on a slider not taken hold of moves focus, not the slider', v1 === volAt, `${volAt} → ${v1}, focus ${s.active}`);
  await T(() => document.getElementById('set-vol').focus());
  await pad.press(BTN.S); s = await S();
  check('A takes hold of the slider', s.grab === 'set-vol', JSON.stringify(s));
  await shot('slider-legend', await box('#padbar'));
  await pad.press(BTN.LEFT); await pad.press(BTN.LEFT);
  const v2 = await T(() => +document.getElementById('set-vol').value);
  check('held, ← ← moves it a tenth of its span', Math.abs(volAt - v2 - 10) <= 1, `${volAt} → ${v2}`);
  await pad.stick(1, 0); await wait(500); await pad.stick(0, 0);
  const v3 = await T(() => +document.getElementById('set-vol').value);
  check('the stick at full tilt sweeps it fast (a third of its span in half a second)', v3 - v2 >= 25, `${v2} → ${v3}`);
  s = await S(); check('the slider keeps focus and hold while it changes', s.grab === 'set-vol', JSON.stringify(s));
  await shot('slider-held', await box('#settings', 4));
  await pad.press(BTN.E); s = await S();
  check('B lets go, focus stays on it, Settings stay open', !s.grab && s.active === 'set-vol' && s.settings, JSON.stringify(s));
  await pad.press(BTN.DOWN); s = await S();
  check('let go, the d-pad moves focus off it', s.active !== 'set-vol', s.active);
  await T((v) => { const e = document.getElementById('set-vol'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, volAt);
}
// choosing an option keeps focus on it, though the panel is drawn again (and rows come and go): every option of the
// first rows of Display and Audio pressed by A in turn, then each row's first choice back
{
  const lost = [];
  for (const tabRe of ['display', 'audio']) {
    await T((re) => { [...document.querySelectorAll('#settings [role="tab"]')].find((x) => new RegExp(re, 'i').test(x.textContent))?.click(); }, tabRe);
    await frames(2);
    const rows = await T(() => [...new Set([...document.querySelectorAll('#settings .opt [data-o][data-v]')].map((b) => b.dataset.o))].filter((o) => !/^(w-|n$|prompts)/.test(o)).slice(0, 7));
    for (const o of rows) {
      const vals = await T((o) => [...document.querySelectorAll(`#settings [data-o="${o}"]`)].map((b) => ({ v: b.dataset.v, on: b.getAttribute('aria-pressed') === 'true' })), o);
      const was = vals.find((x) => x.on)?.v;
      for (const { v } of [...vals, ...(was != null ? [{ v: was }] : [])]) {
        const ok = await T(([o, v]) => { const b = document.querySelector(`#settings [data-o="${o}"][data-v="${v}"]`); if (!b || b.disabled) return null; b.focus(); return true; }, [o, v]);
        if (!ok) continue;
        await pad.press(BTN.S); await frames(2);
        const at = await T(() => { const a = document.activeElement; return a?.dataset?.o ? `${a.dataset.o}=${a.dataset.v}` : a?.id || a?.className || a?.tagName; });
        if (at !== `${o}=${v}`) lost.push(`${o}=${v} → ${at}`);
      }
    }
  }
  check('A on an option keeps focus on that option (Display and Audio, every option of their rows)', !lost.length, lost.slice(0, 6).join(' | '));
}
// chips in a grid (Display's rows of two lines: Controller; Microscope and Surface now fit in one): the d-pad down and right go to the
// chip in line below and beside, never its neighbour
{
  await T(() => [...document.querySelectorAll('#settings [role="tab"]')].find((x) => /display/i.test(x.textContent))?.click());
  await frames(2);
  const plan = await T(() => {
    const out = [];
    for (const g of document.querySelectorAll('#settings .segs.many')) {
      const chips = [...g.querySelectorAll('.chip')].filter((c) => !c.disabled);
      const r = chips.map((c) => c.getBoundingClientRect());
      const key = (c) => `${c.dataset.o}=${c.dataset.v}`;
      chips.forEach((c, i) => {
        const cx = r[i].left + r[i].width / 2, cy = r[i].top + r[i].height / 2;
        // the chip below whose span holds this one's middle; the chip beside in the same line
        const below = chips.find((d, j) => r[j].top > r[i].top + 4 && r[j].top < r[i].bottom + 4 && cx > r[j].left && cx < r[j].right);
        const beside = chips.find((d, j) => r[j].left > r[i].left + 4 && r[j].left < r[i].right + 4 && cy > r[j].top && cy < r[j].bottom);
        if (below) out.push([key(c), 'DOWN', key(below)]);
        if (beside) out.push([key(c), 'RIGHT', key(beside)]);
      });
    }
    return out;
  });
  const wrong = [];
  for (const [from, dir, want] of plan) {
    await T((k) => { const [o, v] = k.split('='); document.querySelector(`#settings [data-o="${o}"][data-v="${v}"]`)?.focus(); }, from);
    await pad.press(BTN[dir]);
    const at = await T(() => { const a = document.activeElement; return a?.dataset?.o ? `${a.dataset.o}=${a.dataset.v}` : a?.tagName; });
    if (at !== want) wrong.push(`${from} ${dir} → ${at} (not ${want})`);
  }
  check(`the d-pad in a grid of chips goes to the one in line (${plan.length} moves)`, plan.length >= 4 && !wrong.length, wrong.slice(0, 5).join(' | '));
}
// a glossary term: A shows its hint, A again hides it
const hasTerm = await T(() => { const t = [...document.querySelectorAll('#settings .term')].find((x) => x.getBoundingClientRect().height); t?.focus(); return t ? t.dataset.tip || t.dataset.hint || '?' : null; });
console.log(`     (the term: ${hasTerm})`);
if (hasTerm) {
  let s = await S(); check('focus on a term leaves its hint closed', !s.tip);
  await pad.press(BTN.S); s = await S(); check('A on a term shows its hint', s.tip);
  await shot('term-hint');
  await pad.press(BTN.S); s = await S(); check('A again hides it', !s.tip);
}
// a hint opened by a finger's tap stays until the next tap; closing its panel without one (the pad's B) closes it too
{
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const at = await T(() => { const t = [...document.querySelectorAll('#settings .term')].find((x) => x.getBoundingClientRect().height); const r = t.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at[0], y: at[1], id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(200);
  const tapped = (await S()).tip;
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await pad.press(BTN.E); await wait(300);
  const gone = await S();
  check('a hint a tap opened closes with its panel', tapped && !gone.settings && !gone.tip, JSON.stringify({ tapped, settings: gone.settings, tip: gone.tip }));
  await openSettings();
}
await closeSettings();

// ------------------------------------------------------------ the Lab: View opens and closes it, and only it
let s0 = await S();
await pad.press(BTN.VIEW); await wait(400);
let s = await S();
check('View toggles the Lab', s.lab !== s0.lab && !s.help, JSON.stringify({ before: s0.lab, after: s.lab, help: s.help }));
// (a slow press, as a thumb on a Deck: still the Lab, never the Controls)
await pad.down(BTN.VIEW); await wait(600); await pad.up(BTN.VIEW); await wait(300);
const s2 = await S();
check('View held a while toggles the Lab back, never the Controls', s2.lab === s0.lab && !s2.help, JSON.stringify({ lab: s2.lab, help: s2.help }));
if (!s2.lab) { await pad.press(BTN.VIEW); await wait(400); }
const labTabs = await T(() => [...document.querySelectorAll('#lab [role="tab"]')].map((t) => t.textContent.trim()));
for (let i = 0; i < labTabs.length; i++) {
  await T((i) => document.querySelectorAll('#lab [role="tab"]')[i].click(), i);
  await wait(300);
  await ringAudit('#lab', `Lab · ${labTabs[i] || i}`);
}
// the Lineage view by the pad: the d-pad names the tree's rows, A explores one, B goes back the way it came
{
  await T(() => [...document.querySelectorAll('#lab [role="tab"]')].find((x) => /lineage/i.test(x.textContent))?.click());
  await wait(600);
  const has = await T(() => { const t = document.getElementById('lin-tree'); if (!t || !t.getClientRects().length) return false; t.focus(); return document.activeElement === t; });
  if (!has) console.log('     (no lineage tree yet in this world: not checked)');
  else {
    const plate = () => T(() => { const p = document.getElementById('plate'); return p.hidden ? null : p.textContent.trim().slice(0, 40); });
    const crumbs = () => T(() => document.querySelectorAll('#lin-crumbs li:not([hidden])').length);
    await pad.press(BTN.DOWN); const p1 = await plate();
    await pad.press(BTN.DOWN); const p2 = await plate();
    check('in the Lineage tree the d-pad names its rows in turn', !!p1 && !!p2 && p1 !== p2, JSON.stringify({ p1, p2 }));
    const c0 = await crumbs();
    // (a row that can be explored: down until one is)
    for (let i = 0; i < 8 && !(await T(() => document.getElementById('lin-tree')._hot?.explore)); i++) await pad.press(BTN.DOWN);
    await pad.press(BTN.S); await wait(400);
    const c1 = await crumbs();
    check('A explores the row named', c1 > c0, `${c0} → ${c1} crumbs`);
    await pad.press(BTN.E); await wait(400);
    const back = { crumbs: await crumbs(), focus: (await S()).ctx };
    check('B goes back up the lineage, the Lab keeping focus', back.crumbs === c0 && back.focus === 'panel', JSON.stringify(back));
    const g = (await S()).glyphs;
    check('the arrows the pad handed the tree leave the pad\'s names', g === 'pad', g);
  }
}
await T(() => document.querySelector('#lab [role="tab"]')?.click());
await T(() => document.querySelector('#lab [role="tab"]')?.focus());
await frames(2);
await shot('lab', await box('#lab', 4));
// (left as a viewer leaves it: B; a panel the pad went into keeps its presses until then)
await pad.press(BTN.E);
check('B leaves the Lab for the world', (await S()).ctx === 'world', (await S()).ctx);

// ------------------------------------------------------------ the bench, the dock, the Controls
await pad.press(BTN.RB); await wait(300);
s = await S(); check('RB tapped opens the bench', s.bench, JSON.stringify(s));
await ringAudit('#bench', 'the bench');
{
  // RB again, focus in the bench: closes it (and opens it again for what follows)
  await T(() => __tidemote.input.open().bench && document.querySelector('#bench button')?.focus());
  // (a tool's hint open, by focus, then by the mouse over it: closing the bench closes it too, wherever it was)
  await T(() => document.querySelector('#bench .tile')?.focus()); await frames(2);
  const tipOpen = (await S()).tip;
  await pad.press(BTN.RB); await wait(200);
  const closed = await S();
  check('RB tapped with the bench open closes it', !closed.bench, JSON.stringify(closed));
  check('a bench tool\'s hint opened by focus closes with the bench', tipOpen && !closed.tip, JSON.stringify({ before: tipOpen, after: closed.tip }));
  await pad.press(BTN.RB); await wait(300);
  const tile = await box('#bench .tile', 0);
  await page.mouse.move(tile.x + tile.width / 2 - 30, tile.y + tile.height / 2); await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2, { steps: 4 }); await frames(3);
  const hovered = (await S()).tip;
  await T(() => __tidemote.input.act('bench')); await wait(300);
  const after = await S();
  check('and one opened by the mouse over it, the pointer left where it was', hovered && !after.bench && !after.tip, JSON.stringify({ before: hovered, bench: after.bench, after: after.tip }));
  await pad.press(BTN.RB); await wait(300);
}
{
  const r = await T(() => { const p = document.getElementById('padbar').getBoundingClientRect(), b = document.getElementById('bench').getBoundingClientRect(); return { legend: p.bottom, bench: b.top, shown: !document.getElementById('padbar').hidden }; });
  check('the legend sits above the bench\'s drawer while it is open', r.shown && r.legend <= r.bench, JSON.stringify(r));
  await shot('bench-legend');
}
await shot('bench', await box('#bench', 4));
await pad.press(BTN.E); await wait(200);
await ringAudit('#dock', 'the dock');
// from the dock, up to the rail at the top (and down again)
{
  await T(() => document.getElementById('t-play').focus());
  await wait(350);
  const leg = await T(() => document.getElementById('padbar').textContent);
  let at = null;
  for (let i = 0; i < 3 && at !== 'rail'; i++) { await pad.press(BTN.UP); at = await T(() => document.activeElement?.closest('[data-nav-root]')?.id); }
  check('up from the dock moves focus into the rail at the top', at === 'rail', String(at));
  await pad.press(BTN.DOWN);
  const back = await T(() => document.activeElement?.closest('[data-nav-root]')?.id);
  check('and down from the rail back into the dock', back === 'dock', String(back));
  check('the dock\'s legend says up reaches the top bar', /Top bar/.test(leg), leg);
}
await pad.press(BTN.E);
// a hint in the pad's names: the pause button's, its d-pad drawn where the key was
{
  await T(() => document.getElementById('t-play').focus());
  await frames(2);
  const tip = await T(() => !document.getElementById('tip').hidden && document.getElementById('tip').innerHTML);
  check('a control focused by the pad shows its hint with the pad\'s button', !!tip && /gl-dpad/.test(tip), String(tip).slice(0, 120));
  await shot('hint', await box('#tip'));
  await pad.press(BTN.E);
}
await T(() => __tidemote.input.act('help')); await wait(300);
await ringAudit('#help', 'the Controls');
{ const { worst: w } = await glyphsInPlace(); check('in the Controls, every glyph\'s label centered in its outline (within 0.5 px)', w.d <= 0.5, JSON.stringify(w)); }
await T(() => document.querySelector('#help')?.scrollTo?.(0, 0));
await shot('controls', await box('#help', 4));
await T(() => __tidemote.input.act('back')); await wait(200);

// ------------------------------------------------------------ a cell selected: the loupe stays on it; the specimen panel
await T(() => __tidemote.input.act('tool-loupe')); await frames(3);
const cell = await T(() => { const sps = [...__tidemote.life().reg.values()].filter((x) => x.alive && x.pop > 0).sort((p, q) => q.pop - p.pop); return sps[0]?.serial; });
await T((sr) => __tidemote.findMember(sr), cell); await wait(2500);
await T(() => { if (__tidemote.ride.state.on) __tidemote.input.act('ride'); });
await wait(300);
await T(() => { const t = __tidemote, sl = t.ride.sel(); t.deselect(); t.state.paused = true; if (sl) t.input.lookAt(sl.disp[0], sl.disp[1]); });
await frames(4);
await pad.press(BTN.S);
// the cell selected and the loupe (at the reticle) kept together, frame by frame, as the panel opens and the view
// eases the cell toward the new middle
const gaps = [];
for (let i = 0; i < 40; i++) { await frames(1); gaps.push(await T(() => { const a = __tidemote.input.aim(), c = __tidemote.input.selAt(); return c ? Math.hypot(a[0] - c[0], a[1] - c[1]) : -1; })); }
await T(() => { __tidemote.state.paused = false; });
check('the loupe stays on the cell selected as the panel opens (within 12 px every frame)', gaps.every((g) => g >= 0 && g < 12), gaps.map((g) => g.toFixed(0)).join(' '));
await wait(800);
await shot('selected-loupe');
await pad.press(BTN.N); await wait(200);
await ringAudit('#spec', 'the specimen panel');
// (the audit leaves focus nowhere: the pad's presses still go to the panel it entered, not the world)
{
  const where = () => T(() => ({ ctx: __tidemote.input.padCtx(), focus: document.activeElement?.closest('[data-nav-root]')?.id || null, bench: __tidemote.input.open().bench, rose: __tidemote.input.rose.shown,
    tab: document.querySelector('#spec [role="tab"][aria-selected="true"]')?.textContent.trim() }));
  let w = await where();
  check('focus lost in the specimen panel, the pad still holds to it', w.ctx === 'panel', JSON.stringify(w));
  // RB and LB pressed fast, again and again, with focus dropped between some: tabs change, nothing reaches the world
  const tabsSeen = new Set();
  for (let i = 0; i < 16; i++) {
    if (i % 5 === 2) await T(() => document.activeElement?.blur());
    await page.evaluate(([b]) => new Promise((r) => { const x = window.__pad.buttons[b]; x.pressed = true; x.value = 1; requestAnimationFrame(() => { x.pressed = false; x.value = 0; requestAnimationFrame(r); }); }), [i < 10 ? BTN.RB : BTN.LB]);
    w = await where(); tabsSeen.add(w.tab);
    if (w.bench || w.rose || w.ctx !== 'panel') break;
  }
  check('RB and LB spammed in the panel change its tabs and never reach the world', w.ctx === 'panel' && !w.bench && !w.rose && tabsSeen.size > 1, JSON.stringify({ ...w, tabs: [...tabsSeen] }));
  // the first tab again, then the d-pad down to the bottom: past the fold, as Tab goes
  await T(() => { const t = document.querySelector('#spec [role="tab"]'); t?.click(); t?.focus(); });
  await frames(3);
  const start = await T(() => { const b = document.getElementById('spec-body'); b.scrollTop = 0; return { sh: b.scrollHeight, ch: b.clientHeight }; });
  let deepest = 0;
  for (let i = 0; i < 80; i++) {
    await pad.press(BTN.DOWN);
    const y = await T(() => document.getElementById('spec-body').scrollTop);
    if (y > deepest) deepest = y;
    if (y >= start.sh - start.ch - 2) break;
  }
  check('the d-pad walks the panel past its fold, scrolling as it goes', start.sh <= start.ch || deepest > start.ch / 2, JSON.stringify({ ...start, deepest }));
  // the +n chip (tags that did not fit): A on it shows them all, focus on the first it showed
  await T(() => document.getElementById('spec-body').scrollTo(0, 0));
  // (the row narrowed, so its tags do not fit whatever the species: drawn again with a +n chip)
  await T(() => { const t = document.getElementById('spec-tags'); t.style.maxWidth = '150px'; t.dataset.k = ''; });
  await wait(800);
  const more = await T(() => { const m = document.querySelector('#spec-tags .more'); if (!m) return null; const n = document.querySelectorAll('#spec-tags .term').length; m.focus(); return n; });
  if (more == null) console.log('     (this species\' tags all fit: no +n chip to check)');
  else {
    await pad.press(BTN.S); await frames(2);
    const f = await T(() => { const a = document.activeElement, all = [...document.querySelectorAll('#spec-tags .term')]; return { i: all.indexOf(a), n: all.length }; });
    check('A on the +n chip shows every tag, focus on the first it showed', f.i === more && f.n > more, JSON.stringify({ before: more, ...f }));
  }
  await T(() => { const t = document.getElementById('spec-tags'); t.style.maxWidth = ''; });
}
await pad.press(BTN.E); await pad.press(BTN.E); await wait(200);

// ------------------------------------------------------------ the instruments in the water, held by A
for (const tool of ['needle', 'cold', 'pipette', 'touch']) {
  await T((t) => __tidemote.input.act(`tool-${t}`), tool); await frames(3);
  await wake();
  await shot(`legend-${tool}`, await box('#padbar'));
  await pad.down(BTN.S);
  const fs = [];
  for (let i = 0; i < 8; i++) { await wait(120); fs.push((await S()).focus); }
  s = await S();
  console.log(`     (${tool} focus over a second: ${fs.map((f) => f.toFixed(2)).join(' ')})`);
  check(`A held lets the ${tool} down into the water (in focus)`, s.focus > 0.9, s.focus.toFixed(2));
  const [ax, ay] = await T(() => __tidemote.input.aim());
  await shot(`tool-${tool}`, { x: Math.max(0, ax - 160), y: Math.max(0, ay - 160), width: 320, height: 320 });
  await pad.up(BTN.S); await wait(200);
}
// the pipette: X switches what A does, and the legend says so
await T(() => __tidemote.input.act('tool-pipette')); await frames(3);
const leg = () => T(() => document.getElementById('padbar').textContent);
await wake();
const l0 = await leg(), d0 = (await S()).dispensing;
await pad.press(BTN.W); await frames(3);
const l1 = await leg(), d1 = (await S()).dispensing;
check('X switches the pipette between loading and dispensing, the legend saying which', d0 !== d1 && l0 !== l1 && /Load|Dispense/.test(l0) && /Load|Dispense/.test(l1), `${l0} → ${l1}`);
await pad.press(BTN.W);
await T(() => __tidemote.input.act('tool-none'));

// ------------------------------------------------------------ the roses
await pad.down(BTN.LB); await wait(400);
await pad.stick(0.7, -0.7); await frames(3);
await shot('rose-tools', await box('#rose', 10));
await pad.stick(0, 0); await pad.up(BTN.LB); await wait(250);
await T(() => __tidemote.input.act('tool-none'));

// ------------------------------------------------------------ the legend fades: a few seconds after a button, not back for the sticks
{
  await T(() => document.activeElement?.blur());
  await wake();
  check('a button pressed shows the legend', await legendOn());
  const fade = await T(() => getComputedStyle(document.getElementById('padbar')).transitionDuration);
  await wait(4600);
  check('a few seconds on, it has faded', !(await legendOn()));
  await pad.stick(0.8, 0); await wait(600); await pad.stick(0, 0);
  await pad.trig(BTN.RT, 1); await wait(400); await pad.trig(BTN.RT, 0); await frames(3);
  check('panning and zooming leave it faded', !(await legendOn()));
  await pad.press(BTN.R3); await wait(350);
  check('another button brings it back', await legendOn());
  check('it fades in and out, not at once', /0\.[1-4]/.test(fade), fade);
}
// ------------------------------------------------------------ the auto camera: the legend hides while it films
{
  await T(() => document.activeElement?.blur());
  await pad.press(BTN.UP); await wait(400);
  const on = await T(() => ({ auto: __tidemote.director.active, legend: !document.getElementById('padbar').classList.contains('off'), aim: !document.getElementById('aim').hidden }));
  check('the auto camera hides the legend and the reticle', on.auto && !on.legend && !on.aim, JSON.stringify(on));
  await pad.stick(1, 0); await wait(200); await pad.stick(0, 0); await frames(3);
  await pad.press(BTN.DOWN); await pad.press(BTN.DOWN); await wait(350);
  const off = await T(() => ({ auto: __tidemote.director.active, legend: !document.getElementById('padbar').classList.contains('off') }));
  check('the stick takes the camera back, and a button the legend', !off.auto && off.legend, JSON.stringify(off));
}
// ------------------------------------------------------------ Settings → Display → Full screen, for a controller
{
  await openSettings();
  await T(() => [...document.querySelectorAll('#settings [role="tab"]')].find((x) => /display/i.test(x.textContent))?.click());
  await frames(2);
  const row = await T(() => { const b = document.querySelector('#settings [data-o="fullscreen"][data-v="1"]'); b?.focus(); return !!b; });
  check('Settings → Display has Full screen', row);
  if (row) {
    await pad.press(BTN.S); await wait(600);
    const fs = await T(() => ({ fs: !!document.fullscreenElement, pressed: document.querySelector('#settings [data-o="fullscreen"][data-v="1"]')?.getAttribute('aria-pressed'), focus: document.activeElement?.dataset?.o }));
    console.log(`     (full screen by the pad's A: ${JSON.stringify(fs)})`);
    if (fs.fs) { await T(() => document.exitFullscreen()); await wait(400); }
  }
  await closeSettings();
}
// ------------------------------------------------------------ the pointer
const cursor = await T(() => getComputedStyle(document.querySelector('#dock button')).cursor);
check('the mouse pointer hidden while the pad points', cursor === 'none', cursor);
await page.mouse.move(300, 300); await page.mouse.move(400, 380, { steps: 6 }); await frames(2);
const cursor2 = await T(() => getComputedStyle(document.querySelector('#dock button')).cursor);
check('and back once the mouse moves', cursor2 !== 'none', cursor2);

// ------------------------------------------------------------ touch (a Deck's screen): a pinch zooms, the loupe's lens dragged
{
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const [cx, cy] = await T(() => __tidemote.input.aim());
  await T(() => __tidemote.input.act('tool-none'));
  const z0 = await T(() => __tidemote.cam.zoomTarget);
  await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx - 40 - i * 15, cy], [cx + 40 + i * 15, cy]]); await frames(1); }
  await touch('touchEnd', []); await wait(400);
  const z1 = await T(() => __tidemote.cam.zoomTarget);
  check('touch: two fingers spread zoom in', z1 > z0 * 1.5, `${z0.toFixed(2)} → ${z1.toFixed(2)}`);
  let m = await S(); check('touch: the hints keep the pad\'s names, the pointer is the finger', m.glyphs === 'pad', JSON.stringify({ glyphs: m.glyphs }));
  await T(() => { __tidemote.input.act('zoom-reset'); __tidemote.input.act('tool-loupe'); });
  await wait(600);
  // a tap sets the lens there; a drag that starts on it moves it
  await touch('touchStart', [[cx, cy]]); await touch('touchEnd', []); await wait(300);
  const l0 = await T(() => __tidemote.input.lens());
  await touch('touchStart', [[cx, cy]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx + i * 12, cy + i * 4]]); await frames(1); }
  await touch('touchEnd', []); await wait(300);
  const l1 = await T(() => __tidemote.input.lens());
  check('touch: a tap sets the loupe\'s lens, a drag on it moves it', l0 && l1 && Math.hypot(l1[0] - l0[0], l1[1] - l0[1]) > 80, JSON.stringify({ l0, l1 }));
  // the right stick (the lens's magnification) after a finger placed it: the lens stays; a finger again moves it from
  // there, not from where it was before the pad
  const before = await T(() => __tidemote.input.loupeAt());
  await pad.stick(0, -1, 1); await wait(400); await pad.stick(0, 0, 1); await frames(3);
  const afterStick = await T(() => __tidemote.input.loupeAt());
  check('the right stick zooms the lens where the finger left it', before && afterStick && Math.hypot(afterStick[0] - before[0], afterStick[1] - before[1]) < 4, JSON.stringify({ before, afterStick }));
  await touch('touchStart', [[afterStick[0], afterStick[1]]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[afterStick[0] - i * 10, afterStick[1] + i * 5]]); await frames(1); }
  await touch('touchEnd', []); await wait(300);
  const again = await T(() => __tidemote.input.loupeAt());
  check('and a finger drags it on from there', again && Math.hypot(again[0] - (afterStick[0] - 60), again[1] - (afterStick[1] + 30)) < 15, JSON.stringify({ afterStick, again }));
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}

console.log(`screenshots in ${out}`);
await done();
