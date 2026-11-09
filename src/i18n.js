// The page's words (docs/i18n.md). Every string a visitor reads goes through tr(id, message, values):
// `message` is the source text (ICU MessageFormat: {name} arguments, {n, plural, ...}, {x, select, ...},
// <tag>...</tag> rich text), `id` names it in the catalogs under locales/. A build for another locale (or
// for the viewer's own rewrite of the source) carries that locale's catalog; an id it lacks falls back to
// the source text here, so a partial catalog still runs. tools/i18n/extract.mjs reads every tr() call (and
// every data-i18n element in page.html) into locales/en.json; test/i18n.test.js keeps text from bypassing it.
//
// Tags in a message are HTML the code puts around words: a tag the caller passes in values is a function of
// its contents (tr('x', 'its <term>diet</term>', { term: (c) => term('diet', c) })); any other tag comes out
// as itself (<b>, <kbd>, <i>...), so a message for innerHTML reads like the markup it makes. Values are put
// in as given, unescaped, exactly as the template literals they replace did: escape names with esc().
import { IntlMessageFormat } from 'intl-messageformat';

/* global __TIDEMOTE_MESSAGES__, __TIDEMOTE_LOCALE__, __TIDEMOTE_I18N_MARK__ */
const CATALOG = typeof __TIDEMOTE_MESSAGES__ !== 'undefined' ? __TIDEMOTE_MESSAGES__ : {};
/** The locale the build speaks: numbers, plurals and dates follow it. */
export const LOCALE = typeof __TIDEMOTE_LOCALE__ !== 'undefined' ? __TIDEMOTE_LOCALE__ : 'en';
// The text editor's build (tools/i18n/textlab.mjs) marks each message with its id in invisible characters,
// so an Alt-click on any text on the page can find which message it is.
const MARK = typeof __TIDEMOTE_I18N_MARK__ !== 'undefined' && __TIDEMOTE_I18N_MARK__;

const compiled = new Map();
const own = (tag) => (chunks) => `<${tag}>${chunks.join('')}</${tag}>`;

function tagsOf(els, out = new Set()) {
  for (const el of els) {
    if (el.type === 8) { out.add(el.value); tagsOf(el.children, out); } // TYPE.tag
    else if (el.options) for (const o of Object.values(el.options)) tagsOf(o.value, out); // plural, select
  }
  return out;
}

function compile(id, message) {
  let fmt;
  try {
    fmt = new IntlMessageFormat(message, LOCALE, undefined, { ignoreTag: false });
  } catch (e) {
    // a broken translation must not break the page: fall back to the source text
    console.warn(`i18n: ${id}: ${e.message}`);
    return null;
  }
  const ast = fmt.getAst();
  // plain text (most labels): no formatting at all on every call
  if (ast.length === 1 && ast[0].type === 0) { const s = ast[0].value; return () => s; }
  if (!ast.length) return () => '';
  const tags = [...tagsOf(ast)];
  const defaults = Object.fromEntries(tags.map((tg) => [tg, own(tg)]));
  return (values) => {
    const r = fmt.format(tags.length ? { ...defaults, ...values } : values);
    return Array.isArray(r) ? r.join('') : String(r);
  };
}

/** The text of message `id` in the build's locale: `message` (the source) where the catalog has none. */
export function tr(id, message, values) {
  let f = compiled.get(id);
  if (!f) {
    const own = compile(id, message) || (() => message);
    const theirs = CATALOG[id] !== undefined && compile(id, CATALOG[id]);
    // a catalog's message that cannot be formatted with what the code gives falls back to the source's
    f = theirs ? (v) => { try { return theirs(v); } catch (e) { console.warn(`i18n: ${id}: ${e.message}`); return own(v); } } : own;
    compiled.set(id, f);
  }
  const s = f(values);
  return MARK ? mark(id, s) : s;
}

/** The page's own copy of a catalog entry changed (the text editor's live preview). */
export function setMessage(id, message) { CATALOG[id] = message; compiled.delete(id); }

// The editor's marks: the id in zero-width characters, after a start character, at the message's end.
const ZW = ['​', '‌', '‍', '⁠'], START = '⁣';
export function mark(id, s) {
  let m = START;
  for (const b of new TextEncoder().encode(id)) m += ZW[b >> 6] + ZW[(b >> 4) & 3] + ZW[(b >> 2) & 3] + ZW[b & 3];
  return s + m + START;
}
/** The ids marked in a string (the editor's), in order. */
export function marks(s) {
  const out = [];
  const re = new RegExp(`${START}([${ZW.join('')}]+)${START}`, 'g');
  for (const [, run] of s.matchAll(re)) {
    const bytes = [];
    for (let i = 0; i + 3 < run.length; i += 4) bytes.push((ZW.indexOf(run[i]) << 6) | (ZW.indexOf(run[i + 1]) << 4) | (ZW.indexOf(run[i + 2]) << 2) | ZW.indexOf(run[i + 3]));
    out.push(new TextDecoder().decode(new Uint8Array(bytes)));
  }
  return out;
}
/** A string without the editor's marks. */
export const unmark = (s) => s.replace(new RegExp(`${START}[${ZW.join('')}]*${START}`, 'g'), '');

// the editor's page reaches in to show an edit at once (tools/i18n/textlab.mjs)
if (MARK) globalThis.__i18n = { setMessage, marks, unmark, mark };
