// A message laid out for editing: a select or plural with several branches gets a line for each (ICU ignores
// the whitespace between branches), so a 22-way sentence reads as a list; same() tells whether two layouts are
// the same message (the editor saves a reflowed message as unchanged).
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js';

const strip = (els) => JSON.stringify(els, (k, v) => (k === 'location' ? undefined : v));
/** Whether a and b are the same message, however laid out. */
export function same(a, b) {
  try { return strip(parse(a)) === strip(parse(b)); } catch { return a === b; }
}

// a run of elements in the source's own spelling where it can be had: printAST of each piece
const flat = (els) => printAST(els);
const big = (e) => e.options && (Object.keys(e.options).length > 2 || printAST([e]).length > 70);

/** The message with each big choice's branches on lines of their own, indented by depth. */
export function pretty(message) {
  let ast;
  try { ast = parse(message); } catch { return message; }
  if (!hasBig(ast)) return message;
  const out = lay(ast, 0);
  // never a layout that means something else
  return same(out, message) ? out : message;
}
function hasBig(els) { return els.some((e) => big(e) || (e.options && Object.values(e.options).some((o) => hasBig(o.value))) || (e.children && hasBig(e.children))); }
function lay(els, depth) {
  let s = '';
  for (const e of els) {
    if (!big(e)) { s += e.type === TYPE.tag ? `<${e.value}>${lay(e.children, depth)}</${e.value}>` : flat([e]); continue; }
    const pad = '  '.repeat(depth + 1);
    const head = e.type === TYPE.plural ? `{${e.value}, ${e.pluralType === 'ordinal' ? 'selectordinal' : 'plural'},${e.offset ? ` offset:${e.offset}` : ''}` : `{${e.value}, select,`;
    s += `${head}\n${Object.entries(e.options).map(([k, o]) => `${pad}${k} {${lay(o.value, depth + 1)}}`).join('\n')}\n${'  '.repeat(depth)}}`;
  }
  return s;
}
