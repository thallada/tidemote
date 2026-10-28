// The speed ladder: the dock's speed chip opens every speed on offer as a stop on a ticked rule, fastest at the
// top, the current one bracketed in the sun color with what it means. A speed tapped, the chip tapped again, or a
// tap anywhere else closes it; a double tap on the chip is real time. Built afresh only when its speeds change.
const MEANING = new Map([[Infinity, 'as fast as it runs'], [16, 'coarse steps'], [1, 'real time'], [0.25, 'slow motion']]);
const fmtSpeed = (s) => (s === Infinity ? 'Max' : `×${s}`);

/** chip, el: the dock's speed button and the ladder's element; choices() the speeds on offer; current() the
 * speed now; pick(v) sets one; real() goes back to real time. */
export function createLadder({ chip, el, choices, current, pick, real }) {
  let lastTap = 0, drawn = '';
  function render() {
    const now = current(), list = choices(), key = `${now}|${list}`;
    if (key === drawn) return;
    drawn = key;
    el.innerHTML = `<div class="sub-h"><span class="ladder-t">Speed</span><span class="sub-a">double-tap: ×1</span></div>`
      + [...list].reverse().map((v) => `<button type="button" role="option" class="rung" data-v="${v}" aria-selected="${v === now}"><i aria-hidden="true"></i><b>${fmtSpeed(v)}</b><span>${MEANING.get(v) || ''}</span></button>`).join('');
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
  chip.addEventListener('click', () => {
    const t = performance.now();
    if (t - lastTap < 350) { lastTap = 0; toggle(false); real(); return; }
    lastTap = t;
    toggle();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    toggle(false);
    pick(Number(b.dataset.v));
  });
  document.addEventListener('pointerdown', (e) => { if (!el.hidden && !el.contains(e.target) && !chip.contains(e.target)) toggle(false); }, true);
  return { toggle, isOpen: () => !el.hidden, render: () => { if (!el.hidden) render(); } };
}
