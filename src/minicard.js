// A species' mini-card (docs/hand.md), a field-guide plate: its portrait (the sigil standing in until it has one), an
// edge split by what it eats, its diet and motion marked on the portrait, its name in two set lines (genus, then the
// rest), and below it, in the pipette, its kind, or in the cabinet, how it does here. The pipette's strip and the
// cabinet are made of them; a phone's held strip has a flat one (one row).
import { sigilSVG } from './song.js';
import { voiceOf } from './audio/mapping.js';
import { facets, dietMix, DIET_COL } from './facets.js';
import { esc, fmt } from './fmt.js';

/** What a mini-card says the pipette holds of its species: n cells, in bodies (updated in place as they come and go). */
export const countText = (n, bodies, flat) => `×${fmt(n)}${bodies > 1 && !flat ? `<small> · ${fmt(bodies)} bodies</small>` : ''}`;

/** How a cabinet card's species does here (updated in place): [ 'live', n ] alive, [ 'gone' ], or [ 'from', home ]. */
const statusText = ([k, v]) => (k === 'live' ? `<i class="mc-live"></i>${fmt(v)} alive` : k === 'gone' ? 'extinct here' : `↗ from ${esc(v)}`);

/** A cabinet card's status line (.mc-st) brought up to st, in place. */
export function setStatus(el, st) {
  const html = statusText(st);
  if (el.innerHTML === html) return;
  el.innerHTML = html;
  el.classList.toggle('from', st[0] === 'from');
  el.classList.toggle('gone', st[0] === 'gone');
}

// ---- portraits: small JPEGs by key ('c' + a card's id, 's' + a species' serial in this world), as object URLs; a
// card drawn before its portrait shows its sigil and takes the portrait in place when it comes
const thumbs = new Map();
const THUMBS_MAX = 512; // (a cabinet's worth; the oldest let go first)
/** Whether a portrait is kept under key. */
export const hasThumb = (key) => thumbs.has(key);
/** A portrait (JPEG bytes) kept under key, and shown on every card drawn with it. */
export function setThumb(key, bytes) {
  dropThumb(key);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  thumbs.set(key, url);
  if (thumbs.size > THUMBS_MAX) dropThumb(thumbs.keys().next().value);
  for (const el of document.querySelectorAll(`.minicard[data-thumb="${CSS.escape(key)}"] .mc-ph`)) { el.style.backgroundImage = `url(${url})`; el.classList.add('on'); }
}
/** Lets the portrait under key go (or every one whose key starts with prefix, with all). */
export function dropThumb(key, all = false) {
  for (const k of all ? [...thumbs.keys()].filter((x) => x.startsWith(key)) : [key]) {
    const url = thumbs.get(k);
    if (url) { URL.revokeObjectURL(url); thumbs.delete(k); }
  }
}

// sigils by genome (gid): the strip is rebuilt whenever the pipette's species change, each card's sigil with it
const sigils = new Map();
function sigilOf(g, gid, size) {
  const k = `${size}|${gid}`;
  let s = sigils.get(k);
  if (!s) {
    s = sigilSVG(voiceOf(g), g, { size });
    sigils.set(k, s);
    if (sigils.size > 256) sigils.delete(sigils.keys().next().value);
  }
  return s;
}

/**
 * g: the species' genome (gid: a string naming it, its words, to keep its sigil by); name; home: the water it came from, if not this one; n, bodies: what the pipette holds of
 * it (cells, bodies); tip: it leaves next; kept: its card is in the cabinet; flat: one row (a phone's held strip);
 * status: how it does here (statusText), for the cabinet. key: what the card stands for (data-key); thumb: the key
 * of its portrait.
 */
export function miniCard(g, K, { gid, key, name, home = '', n = 0, bodies = 0, tip = false, kept = false, flat = false, status = null, thumb = '' }) {
  const f = facets(g, K), url = thumb && thumbs.get(thumb);
  const sp = name.indexOf(' '), genus = sp > 0 ? name.slice(0, sp) : name, rest = sp > 0 ? name.slice(sp + 1) : '';
  const mix = dietMix(g).filter(([, v]) => v >= 0.02).map(([d, v]) => `<i style="flex:${v.toFixed(3)};background:${DIET_COL[d]}"></i>`).join('');
  const ph = `<span class="mc-ph${url ? ' on' : ''}"${url ? ` style="background-image:url(${url})"` : ''}><span class="mc-sig">${sigilOf(g, gid, flat ? 30 : 40)}</span></span><span class="mc-mix">${mix}</span>`;
  const count = n ? `<span class="mc-n"><b>${countText(n, bodies, flat)}</b></span>` : '';
  const keptMark = kept ? '<span class="mc-kept" data-hint="Its card is in the cabinet"><svg aria-hidden="true"><use href="#i-cabinet"/></svg></span>' : '';
  const nm = `<span class="mc-name" translate="no"><b>${esc(genus)}</b><span>${esc(rest)}</span></span>`;
  const label = `${name}, ${f.diet}, ${f.mobility}${home ? `, from ${home}` : ''}${n ? `, ${n} cells` : ''}${tip ? ', at the tip' : ''}`;
  const open = `<button type="button" class="minicard${flat ? ' flat' : ''}${tip ? ' at-tip' : ''}" data-key="${esc(key)}"${thumb ? ` data-thumb="${esc(thumb)}"` : ''} aria-label="${esc(label)}">`;
  if (flat) return `${open}${ph}${nm}<span class="mc-end">${tip ? '<span class="mc-tip">Tip</span>' : ''}${count}${keptMark}</span></button>`;
  const kind = `<span class="mc-kind" aria-hidden="true"><svg style="color:${DIET_COL[f.diet]}"><use href="#i-d-${f.diet}"/></svg><svg><use href="#i-m-${f.mobility}"/></svg></span>`;
  const sub = status ? `<span class="mc-sub mc-st${status[0] === 'live' ? '' : ` ${status[0]}`}">${statusText(status)}</span>`
    : home ? `<span class="mc-sub from">↗ from ${esc(home)}</span>` : `<span class="mc-sub"><span style="color:${DIET_COL[f.diet]}">${f.diet}</span> · ${f.mobility}</span>`;
  return `${open}${ph}${tip ? '<span class="mc-tip">Tip</span>' : ''}${count}${keptMark}${kind}${nm}${sub}</button>`;
}

const HOLD = 350; // a touch held this long (ms) lifts the card

/**
 * Mini-cards in root to tap and drag: a tap calls tap(key), a drag lifts a ghost of the card that follows the
 * pointer (a long press first, on a touch screen, so the strip still scrolls) and, let go, calls drop(key, x, y, el) with the element under the pointer. With reorder, the card's place stays
 * open in root and moves to where the pointer is over it, the others making way; let go there, reorder(key, i).
 */
export function wireCardDrag(root, { tap, drop, reorder }) {
  let drag = null;
  const cards = () => [...root.querySelectorAll('.minicard')];
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
    const b = e.target.closest('.minicard');
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
