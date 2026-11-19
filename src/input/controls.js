// The Controls dialog's table, from the action table (actions.js helpRows): each row what it does, its keys and mouse,
// and its controller buttons in the family in use. The column of the input in use comes first in the hints; here both
// always show. A table with row groups, so a screen reader reads each row with its group and column headings.
import { helpRows } from './actions.js';
import { glyph } from './glyphs.js';
import { tr } from '../i18n.js';
import { esc } from '../fmt.js';

const keyHtml = (t) => (t.k != null ? `<kbd>${esc(t.k)}</kbd>` : `<span class="w">${esc(t.w)}</span>`);
const padHtml = (t, family) => (t.p != null ? glyph(t.p, family) : `<span class="w">${esc(t.w)}</span>`);

/** The table's markup for a controller family (glyphs.js FAMILIES). */
export function controlsTable(family) {
  // i18n: the Controls dialog's column headings
  const head = `<thead><tr><th scope="col">${tr('help.col.action', 'Action')}</th><th scope="col">${tr('help.col.keys', 'Keyboard · mouse')}</th><th scope="col">${tr('help.col.pad', 'Controller')}</th></tr></thead>`;
  const body = helpRows().map((g) => `<tbody><tr class="g"><th scope="rowgroup" colspan="3">${esc(g.group)}</th></tr>`
    + g.rows.map((r) => `<tr><th scope="row">${esc(r.text)}</th><td>${r.keys.map(keyHtml).join(' ')}</td><td>${r.pad.map((t) => padHtml(t, family)).join(' ')}</td></tr>`).join('')
    + '</tbody>').join('');
  return `<table class="keys">${head}${body}</table>`;
}
