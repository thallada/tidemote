// A species' mini-card (docs/hand.md): its sigil, name, kind (diet · motion) and home water, bracketed at the
// corners, the full card being unreadable at that size. The pipette's strip and the cabinet are made of them.
import { sigilSVG } from './song.js';
import { voiceOf } from './audio/mapping.js';
import { facets } from './facets.js';
import { esc, fmt } from './fmt.js';

/**
 * g: the species' genome; name; home: where it lives or came from; n, bodies: what the pipette holds of it (cells,
 * bodies); tip: it leaves next; flat: one row (a phone's held strip). key: what the card stands for (data-key).
 */
export function miniCard(g, K, { key, name, home = '', n = 0, bodies = 0, tip = false, flat = false }) {
  const f = facets(g, K);
  const count = n ? `<span class="mc-n">${tip ? '<i>Tip</i>' : ''}<b>×${fmt(n)}</b>${bodies > 1 ? `<small>${fmt(bodies)} bodies</small>` : ''}</span>` : '';
  return `<button type="button" class="mini${flat ? ' flat' : ''}${tip ? ' at-tip' : ''}" data-key="${esc(key)}" aria-label="${esc(name)}${n ? `, ${n} cells` : ''}">`
    + `${count}<span class="mc-sig">${sigilSVG(voiceOf(g), g, { size: flat ? 22 : 30 })}</span>`
    + `<span class="mc-name" translate="no">${esc(name)}</span><span class="mc-kind">${f.diet} · ${f.mobility}</span>${home && !flat ? `<span class="mc-home">${esc(home)}</span>` : ''}</button>`;
}

/**
 * Mini-cards in root to tap and drag: a tap calls tap(key, double) (double: a second tap soon after), a drag lifts
 * a ghost of the card that follows the pointer (a long press first, on a touch screen, so the strip still scrolls)
 * and, let go, calls drop(key, x, y, el) with the element under the pointer.
 */
export function wireCardDrag(root, { tap, drop }) {
  let drag = null, last = { key: null, t: 0 };
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.mini');
    if (!b || e.button > 0) return;
    drag = { key: b.dataset.key, el: b, x: e.clientX, y: e.clientY, at: performance.now(), touch: e.pointerType !== 'mouse', ghost: null, id: e.pointerId };
  });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.ghost && moved > 8) {
      // a touch that moves before its long press scrolls the strip instead
      if (drag.touch && performance.now() - drag.at < 350) { drag = null; return; }
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.classList.add('ghost-card');
      document.body.append(drag.ghost);
      document.body.classList.add('dragging-card');
    }
    if (drag.ghost) drag.ghost.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 50}px) rotate(-4deg)`;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.ghost) {
      d.ghost.remove();
      document.body.classList.remove('dragging-card');
      if (e.type === 'pointerup') drop(d.key, e.clientX, e.clientY, document.elementFromPoint(e.clientX, e.clientY));
      return;
    }
    if (e.type !== 'pointerup') return;
    const now = performance.now(), double = last.key === d.key && now - last.t < 350;
    last = double ? { key: null, t: 0 } : { key: d.key, t: now };
    tap(d.key, double);
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  return { dragging: () => !!drag?.ghost };
}
