// The speed ladder: the dock's speed chip opens every speed on offer as a stop on a ticked rule, fastest at the
// top, the current one bracketed in the sun color with what it means. Held, the chip opens it at once and a drag up
// or down moves along it, a speed a rung (held at the screen's edge, on along it a rung at a time, until it ends or
// the drag turns back); let go, that speed. Open, a drag or the wheel on it moves along it too. A speed tapped, the
// chip tapped again, or a tap anywhere else closes it; a double tap on the chip is real time.
// Built afresh only when its speeds, or the one marked, change.
import { tr } from './i18n.js';

// i18n: what a speed on the speed ladder means, beside it: Max, the fastest drawn every frame, the first in coarse steps,
// ×1 and the slowest
const MEANING = new Map([[Infinity, tr('ladder.meaning.max', 'as fast as it runs')], ['fast', tr('ladder.meaning.fast', 'drawn every frame')], [16, tr('ladder.meaning.coarse', 'coarse steps')],
  [1, tr('ladder.meaning.real', 'real time')], [0.25, tr('ladder.meaning.slow', 'slow motion')]]);
const HOLD = 300; // a press on the chip held this long (ms) opens the ladder to drag along
const EDGE = 16; // a drag held this near the screen's top or bottom (px) ...
const CREEP = 220; // ... goes on along the ladder a rung every this many ms

/** chip, el: the dock's speed button and the ladder's element; choices() the stops on offer, slowest first; current()
 * the stop now; fmt(v) names one; pick(v, quiet) sets one (quiet: without a word, as the ladder shows it); real() goes
 * back to real time. */
export function createLadder({ chip, el, choices, current, fmt, pick, real }) {
  let lastTap = 0, drawn = '', drag = null, wheel = 0, swallowed = 0;
  function render(marked = current()) {
    const list = choices(), key = `${marked}|${list}`;
    if (key === drawn) return;
    drawn = key;
    // i18n: the speed ladder's heading, and a note beside it: a double tap on the speed button goes back to real time
    el.innerHTML = `<div class="sub-h"><span class="ladder-t">${tr('ladder.title', 'Speed')}</span><span class="sub-a">${tr('ladder.double-tap', 'double-tap: ×1')}</span></div>`
      + [...list].reverse().map((v) => `<button type="button" role="option" class="rung" data-v="${v}" aria-selected="${v === marked}"><i aria-hidden="true"></i><b>${fmt(v)}</b><span>${MEANING.get(v) || ''}</span></button>`).join('');
  }
  function toggle(on = el.hidden) {
    if (on) {
      render();
      const r = chip.getBoundingClientRect();
      el.style.left = `${Math.max(8, r.left)}px`;
      el.style.bottom = `${innerHeight - r.top + 8}px`;
    }
    el.hidden = !on;
    chip.setAttribute('aria-expanded', String(on));
  }
  // the speed d rungs from v (up: faster), within those on offer
  function along(v, d) {
    const list = choices();
    let i = list.indexOf(v);
    // (a speed between stops: from the stop above it, or below; a stop that is no number is above any speed)
    if (i < 0) i = list.findIndex((x) => !(x <= v)) - (d > 0 ? 1 : 0);
    return list[Math.max(0, Math.min(list.length - 1, i + d))];
  }
  const rung = () => el.querySelector('.rung')?.offsetHeight || 28;

  // a press on the chip, or on the open ladder: dragged up or down, it moves along the ladder (from the chip, the
  // speed is taken when let go and the ladder closes; on the ladder, it stays open)
  function press(e, onChip) {
    if (e.button > 0) return;
    if (drag) { clearTimeout(drag.timer); stopCreep(); } // (a second finger: the first's timers go with it)
    drag = { id: e.pointerId, y: e.clientY, from: current(), v: current(), on: !onChip, moved: false, onChip, el: e.currentTarget };
    if (onChip) drag.timer = setTimeout(() => { if (drag && !drag.on) { drag.on = true; toggle(true); } }, HOLD);
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.y - e.clientY;
    if (!drag.moved && Math.abs(dy) > 8) {
      drag.moved = true;
      try { drag.el.setPointerCapture(e.pointerId); } catch { /* the pointer already ended */ }
      if (!drag.on) { clearTimeout(drag.timer); drag.on = true; toggle(true); }
    }
    if (!drag.moved) return;
    const v = along(drag.from, Math.round(dy / rung()));
    if (v !== drag.v) { drag.v = v; render(v); }
    // (at the screen's edge there is no room to drag on: it goes on by itself, until the drag turns back)
    const edge = e.clientY < EDGE ? 1 : e.clientY > innerHeight - EDGE ? -1 : 0;
    const back = drag.py != null && Math.sign(drag.py - e.clientY) === -edge;
    drag.py = e.clientY;
    if (!edge || back) stopCreep();
    else if (!drag.creep) drag.creep = setInterval(() => creep(edge), CREEP);
  }
  // one rung on along the ladder (d: 1 faster, -1 slower) for a drag held at the screen's edge, as if dragged a rung
  function creep(d) {
    const v = along(drag.v, d);
    if (v === drag.v) { stopCreep(); return; }
    drag.y += d * rung();
    drag.v = v;
    render(v);
  }
  function stopCreep() { clearInterval(drag.creep); drag.creep = null; }
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    stopCreep();
    const d = drag;
    drag = null;
    clearTimeout(d.timer);
    // (a tap is a click's; a hold or a drag is not)
    if (!d.on) return;
    if (d.onChip || d.moved) swallowed = performance.now();
    if (!d.moved) return;
    if (e.type !== 'pointerup') { render(); return; }
    if (d.onChip) toggle(false);
    if (d.v !== current()) pick(d.v, !d.onChip);
  }
  for (const [t, on] of [[chip, true], [el, false]]) {
    t.addEventListener('pointerdown', (e) => press(e, on));
    t.addEventListener('pointermove', move);
    t.addEventListener('pointerup', end);
    t.addEventListener('pointercancel', end);
  }
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheel += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (Math.abs(wheel) < 40) return;
    const v = along(current(), wheel < 0 ? 1 : -1);
    wheel = 0;
    if (v !== current()) pick(v, true);
  }, { passive: false });

  chip.addEventListener('click', () => {
    if (performance.now() - swallowed < 400) return;
    const t = performance.now();
    if (t - lastTap < 350) { lastTap = 0; toggle(false); real(); return; }
    lastTap = t;
    toggle();
  });
  el.addEventListener('click', (e) => {
    if (performance.now() - swallowed < 400) return;
    const b = e.target.closest('[data-v]');
    if (!b) return;
    toggle(false);
    pick(choices().find((v) => String(v) === b.dataset.v));
  });
  document.addEventListener('pointerdown', (e) => { if (!el.hidden && !el.contains(e.target) && !chip.contains(e.target)) toggle(false); }, true);
  return { toggle, along, isOpen: () => !el.hidden, render: () => { if (!el.hidden && !drag?.moved) render(); } };
}
