// A species' mini-card (docs/hand.md): its sigil, name, kind (diet · motion) and home water, bracketed at the
// corners, the full card being unreadable at that size. The pipette's strip and the cabinet are made of them.
import { sigilSVG } from './song.js';
import { voiceOf } from './audio/mapping.js';
import { facets } from './facets.js';
import { esc, fmt } from './fmt.js';

/** What a mini-card says the pipette holds of its species: n cells, in bodies (updated in place as they come and go). */
export const countText = (n, bodies, flat) => `×${fmt(n)}${bodies > 1 && !flat ? `<small> · ${fmt(bodies)} bodies</small>` : ''}`;

/**
 * g: the species' genome; name; home: where it lives or came from; n, bodies: what the pipette holds of it (cells,
 * bodies); tip: it leaves next; kept: its card is in the cabinet; flat: one row (a phone's held strip). key: what
 * the card stands for (data-key).
 */
export function miniCard(g, K, { key, name, home = '', n = 0, bodies = 0, tip = false, kept = false, flat = false }) {
  const f = facets(g, K);
  const count = n ? `<span class="mc-n">${tip ? '<i>Tip</i>' : ''}<b>${countText(n, bodies, flat)}</b></span>` : '';
  return `<button type="button" class="mini${flat ? ' flat' : ''}${tip ? ' at-tip' : ''}" data-key="${esc(key)}" aria-label="${esc(name)}${n ? `, ${n} cells` : ''}">`
    + `${count}${kept ? '<span class="mc-kept" data-hint="Its card is in the cabinet"><svg aria-hidden="true"><use href="#i-cabinet"/></svg></span>' : ''}<span class="mc-sig">${sigilSVG(voiceOf(g), g, { size: flat ? 22 : 30 })}</span>`
    + `<span class="mc-name" translate="no">${esc(name)}</span><span class="mc-kind">${f.diet} · ${f.mobility}</span>${home && !flat ? `<span class="mc-home">${esc(home)}</span>` : ''}</button>`;
}

const HOLD = 350; // a touch held this long (ms) lifts the card

/**
 * Mini-cards in root to tap and drag: a tap calls tap(key), a drag lifts a ghost of the card that follows the
 * pointer (a long press first, on a touch screen, so the strip still scrolls) and, let go, calls drop(key, x, y, el) with the element under the pointer. With reorder, the card's place stays
 * open in root and moves to where the pointer is over it, the others making way; let go there, reorder(key, i).
 */
export function wireCardDrag(root, { tap, drop, reorder }) {
  let drag = null;
  const cards = () => [...root.querySelectorAll('.mini')];
  const over = (x, y) => { const r = root.getBoundingClientRect(); return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12; };
  // the open place moved to where (x, y) falls among the other cards, each sliding from where it was
  function makeWay(slot, x, y) {
    const others = cards().filter((c) => c !== slot);
    const before = (r) => r.top + r.height / 2 < y - r.height / 2 || (Math.abs(r.top + r.height / 2 - y) <= r.height / 2 && r.left + r.width / 2 < x);
    const at = others.filter((c) => before(c.getBoundingClientRect())).length;
    if (cards().indexOf(slot) === at) return;
    const from = new Map(cards().map((c) => [c, c.getBoundingClientRect()]));
    root.insertBefore(slot, others[at] || null);
    for (const [c, r] of from) {
      const n = c.getBoundingClientRect(), dx = r.left - n.left, dy = r.top - n.top;
      if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.mini');
    if (!b || e.button > 0) return;
    drag = { key: b.dataset.key, el: b, x: e.clientX, y: e.clientY, at: performance.now(), touch: e.pointerType !== 'mouse', ghost: null, id: e.pointerId };
  });
  // (held long enough to lift, the card moves rather than the strip scrolling)
  root.addEventListener('touchmove', (e) => { if (drag && (drag.ghost || performance.now() - drag.at >= HOLD)) e.preventDefault(); }, { passive: false });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.ghost && moved > 8) {
      // a touch that moves before its long press scrolls the strip instead
      if (drag.touch && performance.now() - drag.at < HOLD) { drag = null; return; }
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.classList.add('ghost-card');
      document.body.append(drag.ghost);
      document.body.classList.add('dragging-card');
      if (reorder) drag.el.classList.add('mc-slot');
    }
    if (!drag.ghost) return;
    drag.ghost.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 50}px) rotate(-4deg)`;
    if (reorder && over(e.clientX, e.clientY)) makeWay(drag.el, e.clientX, e.clientY);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.ghost) {
      d.ghost.remove();
      d.el.classList.remove('mc-slot');
      document.body.classList.remove('dragging-card');
      if (e.type !== 'pointerup') return;
      if (reorder && over(e.clientX, e.clientY)) reorder(d.key, cards().indexOf(d.el));
      else drop(d.key, e.clientX, e.clientY, document.elementFromPoint(e.clientX, e.clientY));
      return;
    }
    if (e.type !== 'pointerup') return;
    tap(d.key);
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  return { dragging: () => !!drag?.ghost };
}
