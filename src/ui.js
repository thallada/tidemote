// The page's shared building blocks, as markup. Every panel builds its headings, blocks and rows
// from these, so they look and space alike everywhere (their styles are in page.css under
// "components"). Reach for one of these before inventing another header or row.
//
//   section   a top-level division of a panel's scroll, under a sectHead (cyan, with a rule)
//   block     a group of rows under a subHead (small gray capitals, with an optional aside)
//   kv/trait  a labeled value; a labeled meter with its value
//   ruled     a live readout: fixed-height labeled rows between rules
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

/** A live readout: labeled rows of fixed height between rules, so a value changing in place never
 * moves what is below. rows: [label, value markup (a <b>), row class ('two': two lines high)]. */
export const ruled = (rows, cls = '') => `<div class="ruled${cls ? ` ${cls}` : ''}">${rows.map(([text, value, rc]) => `<div${rc ? ` class="${rc}"` : ''}><span>${text}</span>${value}</div>`).join('')}</div>`;

/** A labeled value. */
export const kv = (text, value, tip) => `<div class="kv"><span>${label(text, tip)}</span><b>${value}</b></div>`;

/** A labeled meter (v between lo and hi) and its value. */
export const trait = (text, v, lo, hi, value, tip, cls = 'cyan thin') => `<div class="trait"><span>${label(text, tip)}</span>${meter((v - lo) / (hi - lo), cls)}<b>${value}</b></div>`;

/** A block that opens from its heading (closed by default); key names it for data-disc. aside: shown
 * in the heading beside the chevron (a summary that still reads while the block is closed). */
export const disclosure = (key, text, html, open = false, aside = '') => `<div class="blk disc" data-disc="${key}"><button type="button" class="sub-h disc-h" aria-expanded="${open}"><span>${text}</span>${aside ? `<span class="sub-a">${aside}</span>` : ''}<svg class="disc-i" aria-hidden="true"><use href="#i-chev"/></svg></button><div class="disc-b"${open ? '' : ' hidden'}>${html}</div></div>`;

/** A row that scrolls sideways fades at an edge only where there is more beyond it (fade-l, fade-r), as it
 * scrolls and as its size or what is in it changes. */
export function fadeEdges(row) {
  const edge = () => {
    const max = row.scrollWidth - row.clientWidth;
    row.classList.toggle('fade-l', max > 1 && row.scrollLeft > 1);
    row.classList.toggle('fade-r', max > 1 && row.scrollLeft < max - 1);
  };
  row.addEventListener('scroll', edge, { passive: true });
  new ResizeObserver(edge).observe(row);
  new MutationObserver(edge).observe(row, { childList: true });
  edge();
}

/** A row of tabs too wide for its panel scrolls sideways: by a vertical wheel too, and to bring a
 * chosen tab into view; a fade at a clipped edge says there are more. */
export function wireTabRow(row) {
  row.addEventListener('wheel', (e) => {
    if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    row.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  row.addEventListener('click', (e) => e.target.closest('[role="tab"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  fadeEdges(row);
}

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
