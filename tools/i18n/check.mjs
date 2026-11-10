// A rewritten or translated message checked against its source (docs/i18n.md): it must parse, use no argument
// or tag the source does not give, and should keep what the source shows. Shared by the text editor, the
// review (tools/i18n/review.mjs), promote.mjs and the build's catalogs (locale.mjs catalogFor).
import { parse } from '@formatjs/icu-messageformat-parser';
import { OWN_TAGS, shapeOf } from './extract.mjs';

/** Problems with `text` as message `id` (source `source`): [{ level: 'error'|'warn', code, msg }] */
export function checkMessage(text, source, ctx = {}) {
  const out = [];
  let ast;
  try { ast = parse(text); } catch (e) {
    return [{ level: 'error', code: 'syntax', msg: `Not a valid message: ${e.message.replace(/_/g, ' ').toLowerCase()}${e.location ? ` at character ${e.location.start.offset + 1}` : ''}. A { or } that is meant as text is written '{' and '}'; a < before a letter is '<'.` }];
  }
  if (!text.trim()) return [{ level: 'error', code: 'empty', msg: 'Empty. To keep the original, use Keep.' }];
  const want = shapeOf(parse(source)), got = shapeOf(ast);
  for (const [a] of got.args) if (!want.args.has(a)) out.push({ level: 'error', code: 'arg', msg: `{${a}} is not something this message is given. It can use ${[...want.args.keys()].map((x) => `{${x}}`).join(', ') || 'no arguments'}.` });
  for (const [a, k] of want.args) if (!got.args.has(a)) out.push({ level: 'warn', code: 'arg-dropped', msg: `{${a}} (${k === 'argument' ? 'a value' : k}) no longer appears.` });
  for (const [a, k] of got.args) if (want.args.has(a) && want.args.get(a) !== k && !['plural', 'select', 'selectordinal'].includes(want.args.get(a)) && !['plural', 'select', 'selectordinal'].includes(k) && !(k === 'number' && want.args.get(a) === 'argument')) out.push({ level: 'warn', code: 'arg-kind', msg: `{${a}} was ${want.args.get(a)}, is now ${k}.` });
  for (const t of got.tags) if (!want.tags.has(t) && !OWN_TAGS.has(t)) out.push({ level: 'error', code: 'tag', msg: `<${t}> is not a tag this message has. Its tags: ${[...want.tags].map((x) => `<${x}>`).join(' ') || 'none'}.` });
  for (const t of want.tags) if (!got.tags.has(t)) out.push({ level: 'warn', code: 'tag-dropped', msg: `<${t}>…</${t}> no longer appears (it marks part of the text: a link, a term, a bold run).` });
  // a fragment the code puts beside other text keeps its edge spaces
  if (/^\s/.test(source) !== /^\s/.test(text) || /\s$/.test(source) !== /\s$/.test(text)) out.push({ level: 'warn', code: 'edge-space', msg: 'The original starts or ends with a space (it sits beside other text); this does not, or the other way round.' });
  if (/ {2}/.test(text) && !/ {2}/.test(source)) out.push({ level: 'warn', code: 'double-space', msg: 'Two spaces in a row.' });
  if (source.includes('\n') !== text.includes('\n')) out.push({ level: 'warn', code: 'newline', msg: source.includes('\n') ? 'The original has a line break (a hint\'s second line).' : 'A line break the original does not have.' });
  // the shortcut after a hint's " · " is split off and shown as a key
  const key = (s) => (/ · ([^·\n]{1,12})$/.exec(s.split('\n')[0]) || [])[1];
  if (ctx.sink === '[data-hint]' && key(source) && key(text) !== key(source)) out.push({ level: 'warn', code: 'hint-key', msg: `A hint ends " · ${key(source)}": the page shows what follows the last " · " as the key to press.` });
  if (/'/.test(source) !== /'/.test(text) && /’/.test(source) !== /’/.test(text)) out.push({ level: 'warn', code: 'apostrophe', msg: `The original uses ${/’/.test(source) ? 'curly (’)' : 'straight (\')'} apostrophes.` });
  // a short label in a fixed place: much longer may not fit
  if (ctx.box && source.length <= 32 && text.length > Math.max(source.length * 1.4, source.length + 6)) out.push({ level: 'warn', code: 'length', msg: `${text.length} characters where the original has ${source.length}: it shows in a box ${ctx.box[2]}×${ctx.box[3]} px and may not fit.` });
  return out;
}
