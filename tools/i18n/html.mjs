// page.html's messages (docs/i18n.md). An element marked data-i18n="id" holds message `id` (its text, with
// any inline elements that hold text as rich-text tags: <b>, <kbd>, <a1>/<a2> when a tag repeats) and, for
// each translatable attribute it carries, message `id.<suffix>` (ATTRS). The build bakes a locale into
// the page by replacing exactly those spans of the source; the extractor reads them into locales/en.json.
import { parse } from 'parse5';
import { parse as parseIcu, TYPE } from '@formatjs/icu-messageformat-parser';

export const ATTRS = { 'aria-label': 'aria', 'data-hint': 'hint', alt: 'alt', placeholder: 'ph', title: 'title', content: '' };
const TEXTLESS = (n) => !n.childNodes || !text(n).trim();
const text = (n) => (n.nodeName === '#text' ? n.value : n.childNodes ? n.childNodes.map(text).join('') : '');
const isEl = (n) => n.tagName !== undefined;

// ICU's syntax characters, quoted where they would be read as syntax
export const icuQuote = (s) => s.replace(/'/g, (m, i) => (/[{}<#|']/.test(s[i + 1] || '') ? "''" : m))
  .replace(/[{}]/g, (c) => `'${c}'`).replace(/<(?=[A-Za-z/])/g, "'<'");
const squash = (s) => s.replace(/\s+/g, ' ');

/** Every message in page.html: [{ id, message, attr?, start, end, tags: {name: [open, close]}, line }]. */
export function scanHtml(src) {
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const out = [];
  const walk = (n) => {
    if (isEl(n) && n.attrs) {
      const id = n.attrs.find((a) => a.name === 'data-i18n')?.value;
      if (id) {
        const loc = n.sourceCodeLocation;
        for (const a of n.attrs) {
          if (!(a.name in ATTRS) || (a.name === 'content' && n.tagName !== 'meta')) continue;
          const al = loc.attrs[a.name];
          // the value's span: after name=" up to the closing quote
          const raw = src.slice(al.startOffset, al.endOffset);
          const q = raw.indexOf('=') + 1, quoted = /["']/.test(raw[q]);
          out.push({ id: ATTRS[a.name] ? `${id}.${ATTRS[a.name]}` : id, message: icuQuote(a.value), attr: a.name,
            start: al.startOffset + q + (quoted ? 1 : 0), end: al.endOffset - (quoted ? 1 : 0), tags: {}, line: al.startLine });
        }
        // an element with words of its own holds one message, inline elements and all; one with only
        // attributes (a group's label, an icon button) may hold marked elements of its own
        if (n.tagName !== 'meta' && n.childNodes.some((c) => c.nodeName === '#text' && /\p{L}/u.test(c.value))) {
          out.push({ id, ...inner(src, n), line: loc.startLine });
          return;
        }
      }
    }
    for (const c of n.childNodes || []) walk(c);
    if (n.content) walk(n.content); // <template>
  };
  walk(doc);
  return out;
}

// an element's text as a message: the span from its first text to its last, inline elements as tags
function inner(src, el) {
  const kids = el.childNodes;
  const holds = kids.map((c) => (c.nodeName === '#text' ? !!c.value.trim() : !TEXTLESS(c)));
  const a = holds.indexOf(true), b = holds.lastIndexOf(true);
  const span = kids.slice(a, b + 1).filter((c) => c.nodeName !== '#comment');
  const count = {}, seen = {}, tags = {};
  for (const c of span) if (isEl(c)) count[c.tagName] = (count[c.tagName] || 0) + 1;
  let message = '';
  for (const c of span) {
    if (c.nodeName === '#text') { message += icuQuote(c.value); continue; }
    const where = `page.html:${c.sourceCodeLocation.startLine}`;
    if (TEXTLESS(c)) throw new Error(`${where}: a textless <${c.tagName}> between the words of ${el.attrs.find((x) => x.name === 'data-i18n').value}`);
    if (c.childNodes.some(isEl)) throw new Error(`${where}: <${c.tagName}> inside a message holds elements of its own`);
    const l = c.sourceCodeLocation;
    const name = count[c.tagName] > 1 ? `${c.tagName}${(seen[c.tagName] = (seen[c.tagName] || 0) + 1)}` : c.tagName;
    tags[name] = [src.slice(l.startTag.startOffset, l.startTag.endOffset), l.endTag ? src.slice(l.endTag.startOffset, l.endTag.endOffset) : ''];
    message += `<${name}>${icuQuote(text(c))}</${name}>`;
  }
  const first = kids[a], last = kids[b];
  const start = first.sourceCodeLocation.startOffset + (first.nodeName === '#text' ? first.value.length - first.value.trimStart().length : 0);
  const end = last.sourceCodeLocation.endOffset - (last.nodeName === '#text' ? last.value.length - last.value.trimEnd().length : 0);
  return { message: squash(message).trim(), start, end, tags };
}

const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** page.html with each message's span replaced by the text of messageOf(id) (falling back to the source's):
 * literal text escaped, tags given back the HTML they stood for. Static messages are text and tags only. */
export function bakeHtml(src, items, messageOf = () => undefined, mark) {
  let out = '', at = 0;
  for (const it of [...items].sort((x, y) => x.start - y.start)) {
    const esc = it.attr ? escAttr : escText;
    let ast;
    try { ast = parseIcu(messageOf(it.id) ?? it.message); } catch { ast = parseIcu(it.message); }
    const put = (els) => els.map((e) => {
      if (e.type === TYPE.literal) return esc(e.value);
      if (e.type === TYPE.tag) {
        const [o, c] = it.tags[e.value] || [`<${e.value}>`, `</${e.value}>`];
        return o + put(e.children) + c;
      }
      throw new Error(`page.html: ${it.id} takes no arguments`);
    }).join('');
    out += src.slice(at, it.start) + put(ast) + (mark ? mark(it.id, '') : '');
    at = it.end;
  }
  return out + src.slice(at);
}
