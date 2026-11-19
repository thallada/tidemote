// Where the desktop app is found: the intro's note on a phone and Settings → About link to them, each as a
// hairline glyph and the store's name, quiet beside the page's own words. A store without a url yet is left out.
import { tr } from './i18n.js';
import { esc } from './fmt.js';

const svg = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

export const STORES = [
  {
    id: 'itch', name: 'itch.io', url: 'https://thallada.itch.io/tidemote',
    // the shop under its scalloped awning, with its two eyes
    icon: svg('<path d="M3 2.5h10l1.8 3.3H1.2z"/><path d="M1.2 5.8a1.36 1.36 0 0 0 2.72 0a1.36 1.36 0 0 0 2.72 0a1.36 1.36 0 0 0 2.72 0a1.36 1.36 0 0 0 2.72 0a1.36 1.36 0 0 0 2.72 0"/><path d="M2.2 7.6v6h11.6v-6"/><circle cx="6" cy="10.2" r=".9"/><circle cx="10" cy="10.2" r=".9"/>'),
  },
  {
    id: 'steam', name: 'Steam', url: null, // i18n-ignore (a store's name)
    // the valve: a disc, its wheel and the arm to the small wheel at its edge
    icon: svg('<circle cx="8" cy="8" r="6.6"/><circle cx="10.4" cy="6.2" r="2"/><circle cx="5.3" cy="10.6" r="1.2"/><path d="M6.2 9.8l2.5-2.2"/>'),
  },
];

/** The links (HTML) to every store with a page, each opening in a new tab. */
export function storeLinks(stores = STORES) {
  return stores.filter((s) => s.url).map((s) => {
    // i18n: a store link's spoken name; {store} is the store (itch.io, Steam)
    const label = tr('stores.link', 'Tidemote for desktop on {store}', { store: s.name });
    return `<a class="store" href="${s.url}" target="_blank" rel="noopener" aria-label="${esc(label)}" data-store="${s.id}">${s.icon}<span translate="no">${s.name}</span></a>`;
  }).join('');
}
