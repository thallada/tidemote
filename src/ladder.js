// The speed ladder: the dock's speed chip opens every speed on offer as a stop on a ticked rule, fastest at the
// top, the current one bracketed in the sun color with what it means. Held, the chip opens it at once and a drag up
// or down moves along it, a speed a rung; let go, that speed. Open, a drag or the wheel on it moves along it too. A
// speed tapped, the chip tapped again, or a tap anywhere else closes it; a double tap on the chip is real time.
// Built afresh only when its speeds, or the one marked, change.
const MEANING = new Map([[Infinity, 'as fast as it runs'], [16, 'coarse steps'], [1, 'real time'], [0.25, 'slow motion']]);
const fmtSpeed = (s) => (s === Infinity ? 'Max' : `×${s}`);
const HOLD = 300; // a press on the chip held this long (ms) opens the ladder to drag along

/** chip, el: the dock's speed button and the ladder's element; choices() the speeds on offer; current() the
 * speed now; pick(v, quiet) sets one (quiet: without a word, as the ladder shows it); real() goes back to real time. */
export function createLadder({ chip, el, choices, current, pick, real }) {
  let lastTap = 0, drawn = '', drag = null, wheel = 0, swallowed = 0;
  function render(marked = current()) {
    const list = choices(), key = `${marked}|${list}`;
    if (key === drawn) return;
    drawn = key;
    el.innerHTML = `<div class="sub-h"><span class="ladder-t">Speed</span><span class="sub-a">double-tap: ×1</span></div>`
      + [...list].reverse().map((v) => `<button type="button" role="option" class="rung" data-v="${v}" aria-selected="${v === marked}"><i aria-hidden="true"></i><b>${fmtSpeed(v)}</b><span>${MEANING.get(v) || ''}</span></button>`).join('');
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
    if (i < 0) i = Math.max(0, list.findIndex((x) => x > v) - 1);
    return list[Math.max(0, Math.min(list.length - 1, i + d))];
  }
  const rung = () => el.querySelector('.rung')?.offsetHeight || 28;

  // a press on the chip, or on the open ladder: dragged up or down, it moves along the ladder (from the chip, the
  // speed is taken when let go and the ladder closes; on the ladder, it stays open)
  function press(e, onChip) {
    if (e.button > 0) return;
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
  }
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
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
    pick(Number(b.dataset.v));
  });
  document.addEventListener('pointerdown', (e) => { if (!el.hidden && !el.contains(e.target) && !chip.contains(e.target)) toggle(false); }, true);
  return { toggle, isOpen: () => !el.hidden, render: () => { if (!el.hidden && !drag?.moved) render(); } };
}
