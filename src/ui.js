// The page's shared building blocks, as markup. Every panel builds its headings, blocks and rows
// from these, so they look and space alike everywhere (their styles are in page.css under
// "components"). Reach for one of these before inventing another header or row.
//
//   section   a top-level division of a panel's scroll, under a sectHead (cyan, with a rule)
//   block     a group of rows under a subHead (small grey capitals, with an optional aside)
//   kv/trait  a labelled value; a labelled meter with its value
//   disclosure a block that opens and closes from its heading
import { term, meter } from './fmt.js';

const label = (text, tip) => (tip ? term(tip, text) : text);

/** A section's heading: the largest heading inside a panel. */
export const sectHead = (text, tip) => `<h3 class="sect-h"><span>${label(text, tip)}</span></h3>`;

/** A section: its heading, then its blocks. id names it for a section bar (data-sx). */
export const section = (id, text, html) => `<section class="sx" data-sx="${id}">${text ? sectHead(text) : ''}<div class="sx-b">${html}</div></section>`;

/** A block's heading, with an optional aside on the right (a figure, a link, a button). */
export const subHead = (text, aside = '', tip) => `<div class="sub-h"><span>${label(text, tip)}</span>${aside ? `<span class="sub-a">${aside}</span>` : ''}</div>`;

/** A block: a heading and what it heads. cls adds classes ('inline': heading and content on one row);
 * aside goes to the heading's right. */
export const block = (text, html, { aside = '', tip, cls = '' } = {}) => `<div class="blk${cls ? ` ${cls}` : ''}">${text ? subHead(text, aside, tip) : ''}${html}</div>`;

/** A labelled value. */
export const kv = (text, value, tip) => `<div class="kv"><span>${label(text, tip)}</span><b>${value}</b></div>`;

/** A labelled meter (v between lo and hi) and its value. */
export const trait = (text, v, lo, hi, value, tip, cls = 'cyan thin') => `<div class="trait"><span>${label(text, tip)}</span>${meter((v - lo) / (hi - lo), cls)}<b>${value}</b></div>`;

/** A block that opens from its heading (closed by default); key names it for data-disc. */
export const disclosure = (key, text, html, open = false) => `<div class="blk disc" data-disc="${key}"><button type="button" class="sub-h disc-h" aria-expanded="${open}"><span>${text}</span><svg class="disc-i" aria-hidden="true"><use href="#i-chev"/></svg></button><div class="disc-b"${open ? '' : ' hidden'}>${html}</div></div>`;

/** Wire every disclosure inside root (once): a click on a heading opens or closes its block. */
export function wireDisclosures(root, onToggle = () => {}) {
  root.addEventListener('click', (e) => {
    const h = e.target.closest('.disc-h');
    if (!h || !root.contains(h)) return;
    const on = h.getAttribute('aria-expanded') !== 'true';
    h.setAttribute('aria-expanded', String(on));
    h.nextElementSibling.hidden = !on;
    onToggle(h.parentElement.dataset.disc, on);
  });
}
