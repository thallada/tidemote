// A locale's catalog for the build (docs/i18n.md): locales/<locale>.json over the source's own messages,
// the pseudo-locale en-XA made from the source, and the marks the text editor's build carries.
import fs from 'node:fs';
import path from 'node:path';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js';
import { ROOT, extract } from './extract.mjs';
import { checkMessage } from './check.mjs';

export const SOURCE = 'en';
export const PSEUDO = 'en-XA';

// en-XA: every letter accented and every message a third longer, bracketed, so a string the catalog
// does not reach stands out as plain English and one that would overflow at another language's length does
const ACC = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [c, [...'àƀçðéƒĝĥîĵķļɱñöþǫŕšţûṽŵẋýžÅƁÇÐÉƑĜĤÎĴĶĻṀÑÖÞǪŔŠŢÛṼŴẊÝŽ'][i]]));
const pad = (s) => s.replace(/[A-Za-z]/g, (c) => ACC[c]);
export function pseudo(message) {
  const ast = parse(message);
  let letters = 0;
  const walk = (els) => { for (const e of els) { if (e.type === TYPE.literal) { letters += e.value.length; e.value = pad(e.value); } if (e.children) walk(e.children); if (e.options) for (const o of Object.values(e.options)) walk(o.value); } };
  walk(ast);
  const extra = '~'.repeat(Math.ceil(letters / 3));
  return `⟦${printAST(ast)}${extra}⟧`;
}

/** { messages: Map of the source, html items, catalog: id → message for `locale` } */
export function catalogFor(locale = SOURCE) {
  const { messages, context, errors } = extract();
  if (errors.length) throw new Error(`messages:\n${errors.join('\n')}`);
  let catalog = {};
  if (locale === PSEUDO) catalog = Object.fromEntries([...messages].map(([id, m]) => [id, pseudo(m)]));
  else if (locale !== SOURCE) {
    const file = path.join(ROOT, 'locales', `${locale}.json`);
    const theirs = JSON.parse(fs.readFileSync(file, 'utf8'));
    // only what the source still has, and only what differs from it
    // a message with an error (it does not parse, or uses a value the code does not give) stays the source's
    for (const [id, m] of Object.entries(theirs)) {
      if (!messages.has(id) || m === messages.get(id) || m === '') continue;
      const bad = checkMessage(m, messages.get(id)).filter((p) => p.level === 'error');
      if (bad.length) { console.warn(`${locale}: ${id} left in the source's words: ${bad[0].msg}`); continue; }
      catalog[id] = m;
    }
  }
  return { messages, context, catalog };
}
