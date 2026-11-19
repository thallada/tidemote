// A controller's buttons as drawn in hints, the pad's legend and the Controls dialog (docs/controller.md): four
// families (Xbox, PlayStation, Switch, Steam Deck), each button named by its place on the pad (actions.js BTN) and
// drawn in the family's own labels. Our own simple drawings (letters and shapes in the page's line style), no logos.
import { tr } from '../i18n.js';
import { PAD_MAP, BTN_NAME } from './actions.js';

export const FAMILIES = ['xbox', 'ps', 'switch', 'deck'];

/**
 * The family of a pad from its Gamepad.id, and what the page knows besides (steamDeck: the desktop app running on a
 * Deck, where Steam's virtual pad stands for the Deck's own controls). Chrome's ids carry "Vendor: 054c Product: 05c4",
 * Firefox's begin "054c-05c4-"; Windows' XInput ids carry neither, so they read as Xbox.
 */
export function familyOf(id = '', { steamDeck = false } = {}) {
  const s = String(id).toLowerCase();
  const m = s.match(/vendor:\s*([0-9a-f]{4})/) || s.match(/^([0-9a-f]{1,4})-[0-9a-f]{1,4}-/);
  const v = m ? m[1].padStart(4, '0') : '';
  if (v === '054c' || /dualsense|dualshock|playstation|wireless controller/.test(s)) return 'ps';
  if (v === '057e' || /pro controller|joy-con|nintendo/.test(s)) return 'switch';
  if (/steam deck/.test(s) || (v === '28de' && /1205/.test(s))) return 'deck';
  if (steamDeck && (v === '28de' || /xinput|xbox|steam/.test(s) || !v)) return 'deck';
  return 'xbox';
}

// Each family's label for a place: a short text, or an icon (svg id below).
const FACE = {
  xbox: { S: 'A', E: 'B', W: 'X', N: 'Y' }, deck: { S: 'A', E: 'B', W: 'X', N: 'Y' },
  switch: { S: 'B', E: 'A', W: 'Y', N: 'X' }, ps: { S: '#cross', E: '#circle', W: '#square', N: '#triangle' },
};
const SHOULDER = {
  xbox: { LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', L3: 'LS', R3: 'RS' },
  deck: { LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', L3: 'L3', R3: 'R3' },
  ps: { LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', L3: 'L3', R3: 'R3' },
  switch: { LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', L3: 'LS', R3: 'RS' },
};
const MENUS = { xbox: ['#view', '#menu'], deck: ['#view', '#menu'], ps: ['#create', '#options'], switch: ['−', '+'] };
const ICON = {
  cross: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  circle: '<circle cx="8" cy="8" r="4"/>',
  square: '<rect x="4.2" y="4.2" width="7.6" height="7.6"/>',
  triangle: '<path d="M8 3.8l4.4 7.6H3.6z"/>',
  view: '<rect x="3" y="4" width="6.5" height="5"/><rect x="6.5" y="7" width="6.5" height="5"/>',
  menu: '<path d="M3.5 5h9M3.5 8h9M3.5 11h9"/>',
  create: '<path d="M8 3v3M8 10v3M3 8h3M10 8h3"/>',
  options: '<path d="M3.5 5h9M3.5 8h9M3.5 11h9"/>',
};
const DPAD = { UP: 'M6 1h4v5H6z', DOWN: 'M6 10h4v5H6z', LEFT: 'M1 6h5v4H1z', RIGHT: 'M10 6h5v4h-5z' };

/** What a place is called, for screen readers (the drawn glyph is hidden from them). */
function nameOf(place, label) {
  // i18n: a controller's d-pad and sticks, named for screen readers
  const names = { UP: tr('glyph.dpad-up', 'D-pad up'), DOWN: tr('glyph.dpad-down', 'D-pad down'), LEFT: tr('glyph.dpad-left', 'D-pad left'), RIGHT: tr('glyph.dpad-right', 'D-pad right'),
    L: tr('glyph.stick-left', 'Left stick'), R: tr('glyph.stick-right', 'Right stick') };
  if (names[place]) return names[place];
  // i18n: PlayStation's face buttons and the menu buttons, named for screen readers
  const icons = { '#cross': tr('glyph.cross', 'Cross'), '#circle': tr('glyph.circle', 'Circle'), '#square': tr('glyph.square', 'Square'), '#triangle': tr('glyph.triangle', 'Triangle'),
    '#view': tr('glyph.view', 'View'), '#menu': tr('glyph.menu', 'Menu'), '#create': tr('glyph.create', 'Create'), '#options': tr('glyph.options', 'Options') };
  return icons[label] || label;
}

const svg = (body, cls = '') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;

/**
 * One place on the pad (actions.js BTN name, or 'L'/'R' for the sticks) drawn as HTML in a family's labels.
 * Returned as markup: a span carrying role="img" and an aria-label, its drawing hidden from screen readers.
 */
export function glyph(place, family = 'xbox') {
  const f = FAMILIES.includes(family) ? family : 'xbox';
  let label, kind, inner;
  if (DPAD[place]) {
    kind = 'dpad';
    inner = svg(`<path class="arm" d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z"/><path class="on" d="${DPAD[place]}"/>`);
  } else if (place === 'L' || place === 'R') {
    kind = 'stick'; label = place; inner = place;
  } else if (FACE[f][place]) {
    kind = `face face-${place.toLowerCase()}`; label = FACE[f][place]; // i18n-ignore (key names, selectors and styles)
  } else if (SHOULDER[f][place]) {
    kind = 'sh'; label = SHOULDER[f][place];
  } else if (place === 'VIEW' || place === 'MENU') {
    kind = 'menu'; label = MENUS[f][place === 'VIEW' ? 0 : 1];
  } else return '';
  if (inner == null) inner = label.startsWith('#') ? svg(ICON[label.slice(1)]) : label;
  return `<span class="gl gl-${kind}" role="img" aria-label="${nameOf(place, label)}"><span aria-hidden="true">${inner}</span></span>`;
}

/**
 * The controller's button for an action (actions.js) in the world, drawn for a hint: what a press or a tap does,
 * or a hold (marked as one). The speed chip's hint: the d-pad's left and right. null: no button.
 */
export function padGlyphFor(act, family) {
  if (act === 'speed') return glyph('LEFT', family) + glyph('RIGHT', family);
  for (const [b, bind] of Object.entries(PAD_MAP.world)) {
    if (bind.press === act || bind.tap === act) return glyph(BTN_NAME[b], family);
    // i18n: a controller button held down, in a hint ({button}: its glyph)
    if (bind.hold === act) return tr('glyph.held', '{button} held', { button: glyph(BTN_NAME[b], family) });
  }
  return null;
}
