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
    const shows = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.closest('[hidden], [inert], .sr-only') && !el.disabled && getComputedStyle(el).visibility !== 'hidden'; };
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
const glyphBoxes = await T(() => {
  const host = document.createElement('div');
  host.id = 'gl-sheet';
  host.style.cssText = 'position:fixed;left:20px;top:70px;z-index:99;background:#0b1214;padding:10px;display:grid;grid-template-columns:repeat(13, 30px);gap:8px;';
  document.body.append(host);
  return null;
});
void glyphBoxes;
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
  const png = PNG.sync.read(fs.readFileSync(file));
  rects.forEach((r, i) => {
    if (places[i] === 'UP') return; // (the d-pad: a drawing, not a label)
    // the label's ink: bright pixels well inside the outline (3 CSS px clear of its edge)
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    const ox = (r.x - sheet.x) * SCALE, oy = (r.y - sheet.y) * SCALE, m = 3 * SCALE;
    for (let y = Math.ceil(oy + m); y < oy + r.h * SCALE - m; y++) for (let x = Math.ceil(ox + m); x < ox + r.w * SCALE - m; x++) {
      const k = (y * png.width + x) * 4, l = 0.3 * png.data[k] + 0.59 * png.data[k + 1] + 0.11 * png.data[k + 2];
      if (l > 140) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 < 0) return;
    const dx = ((x0 + x1 + 1) / 2 - (ox + (r.w * SCALE) / 2)) / SCALE, dy = ((y0 + y1 + 1) / 2 - (oy + (r.h * SCALE) / 2)) / SCALE;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d > worst.d) worst = { d, fam, place: places[i], dx: dx.toFixed(2), dy: dy.toFixed(2) };
  });
}
await T(() => document.getElementById('gl-sheet').remove());
check('every glyph\'s label centered in its outline (within 0.75 px)', worst.d <= 0.75, JSON.stringify(worst));

// ------------------------------------------------------------ the legend in the world
await T(() => { document.body.dataset.pad = __tidemote.input.mode.family; });
await frames(3);
await shot('legend-world', await box('#padbar'));
const legendFits = await T(() => { const r = document.getElementById('padbar').getBoundingClientRect(), d = document.getElementById('dock').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= d.top + 1; });
check('the legend fits the screen, above the dock', legendFits);
await shot('world');

// ------------------------------------------------------------ Settings: every tab
await pad.press(BTN.MENU); await wait(300);
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
// a glossary term: A shows its hint, A again hides it
const hasTerm = await T(() => { const t = [...document.querySelectorAll('#settings .term')].find((x) => x.getBoundingClientRect().height); t?.focus(); return t ? t.dataset.tip || t.dataset.hint || '?' : null; });
console.log(`     (the term: ${hasTerm})`);
if (hasTerm) {
  let s = await S(); check('focus on a term leaves its hint closed', !s.tip);
  await pad.press(BTN.S); s = await S(); check('A on a term shows its hint', s.tip);
  await shot('term-hint');
  await pad.press(BTN.S); s = await S(); check('A again hides it', !s.tip);
}
await pad.press(BTN.E); await wait(200);

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
await T(() => document.querySelector('#lab [role="tab"]')?.click());
await T(() => document.querySelector('#lab [role="tab"]')?.focus());
await frames(2);
await shot('lab', await box('#lab', 4));
await T(() => { document.activeElement?.blur(); });

// ------------------------------------------------------------ the bench, the dock, the Controls
await pad.press(BTN.RB); await wait(300);
s = await S(); check('RB tapped opens the bench', s.bench, JSON.stringify(s));
await ringAudit('#bench', 'the bench');
await shot('bench', await box('#bench', 4));
await pad.press(BTN.E); await wait(200);
await ringAudit('#dock', 'the dock');
await T(() => __tidemote.input.act('help')); await wait(300);
await ringAudit('#help', 'the Controls');
await T(() => document.querySelector('#help')?.scrollTo?.(0, 0));
await shot('controls', await box('#help', 4));
await T(() => __tidemote.input.act('back')); await wait(200);

// ------------------------------------------------------------ a cell selected: the loupe stays on it; the specimen panel
await T(() => __tidemote.input.act('tool-loupe')); await frames(3);
const cell = await T(() => { const sps = [...__tidemote.life().reg.values()].filter((x) => x.alive && x.pop > 0).sort((p, q) => q.pop - p.pop); return sps[0]?.serial; });
await T((sr) => __tidemote.findMember(sr), cell); await wait(2500);
await T(() => { if (__tidemote.ride.state.on) __tidemote.input.act('ride'); });
await wait(300);
const aimBefore = await T(() => __tidemote.input.aim());
await T(() => { const t = __tidemote, sl = t.ride.sel(); t.deselect(); t.state.paused = true; if (sl) t.input.lookAt(sl.disp[0], sl.disp[1]); });
await frames(4);
const a0 = await T(() => __tidemote.input.aim());
await pad.press(BTN.S);
// the cell selected and the loupe (at the reticle) kept together, frame by frame, as the panel opens and the view
// eases the cell toward the new middle
const gaps = [];
for (let i = 0; i < 40; i++) { await frames(1); gaps.push(await T(() => { const a = __tidemote.input.aim(), c = __tidemote.input.selAt(); return c ? Math.hypot(a[0] - c[0], a[1] - c[1]) : -1; })); }
await T(() => { __tidemote.state.paused = false; });
check('the loupe stays on the cell selected as the panel opens (within 12 px every frame)', gaps.every((g) => g >= 0 && g < 12), `${aimBefore[0].toFixed(0)},${a0[0].toFixed(0)}: ${gaps.map((g) => g.toFixed(0)).join(' ')}`);
await wait(800);
await shot('selected-loupe');
await pad.press(BTN.N); await wait(200);
await ringAudit('#spec', 'the specimen panel');
await pad.press(BTN.E); await pad.press(BTN.E); await wait(200);

// ------------------------------------------------------------ the instruments in the water, held by A
for (const tool of ['needle', 'cold', 'pipette', 'touch']) {
  await T((t) => __tidemote.input.act(`tool-${t}`), tool); await frames(3);
  await shot(`legend-${tool}`, await box('#padbar'));
  await pad.down(BTN.S);
  const fs = [];
  for (let i = 0; i < 8; i++) { await wait(120); fs.push((await S()).focus); }
  s = await S();
  console.log(`     (${tool} focus over a second: ${fs.map((f) => f.toFixed(2)).join(' ')})`);
  check(`A held lets the ${tool} down into the water (in focus)`, s.focus > 0.95, s.focus.toFixed(2));
  const [ax, ay] = await T(() => __tidemote.input.aim());
  await shot(`tool-${tool}`, { x: Math.max(0, ax - 160), y: Math.max(0, ay - 160), width: 320, height: 320 });
  await pad.up(BTN.S); await wait(200);
}
// the pipette: X switches what A does, and the legend says so
await T(() => __tidemote.input.act('tool-pipette')); await frames(3);
const leg = () => T(() => document.getElementById('padbar').textContent);
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
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}

console.log(`screenshots in ${out}`);
await done();
