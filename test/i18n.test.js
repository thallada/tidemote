// The page's words (docs/i18n.md): every message extracted and current, no prose bypassing tr(), page.html's
// messages baked back to the same page, the pseudo-locale and every catalog in locales/ structurally the source's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'parse5';
import { parse as parseIcu, TYPE } from '@formatjs/icu-messageformat-parser';
import { extract, audit, ROOT } from '../tools/i18n/extract.mjs';
import { scanHtml, bakeHtml } from '../tools/i18n/html.mjs';
import { pseudo } from '../tools/i18n/locale.mjs';
import { tr, mark, marks, unmark } from '../src/i18n.js';

const { messages, errors } = extract();

test('every message parses, and each call supplies its arguments and tags', () => {
  assert.deepEqual(errors, []);
  assert.ok(messages.size > 100);
});

test('locales/en.json is what the source says (node tools/i18n/extract.mjs)', () => {
  const have = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8'));
  assert.deepEqual(have, Object.fromEntries(messages));
});

test('no prose in the source bypasses tr() (node tools/i18n/extract.mjs --audit)', () => {
  const found = audit();
  assert.deepEqual(found.map((f) => `${f.file}:${f.line} ${f.text}`), []);
});

const textOf = (html) => {
  const out = [];
  const walk = (n) => {
    if (n.nodeName === '#text') out.push(n.value);
    for (const a of n.attrs || []) if (['aria-label', 'data-hint', 'alt', 'placeholder', 'title', 'content'].includes(a.name)) out.push(`[${a.name}=${a.value}]`);
    for (const c of n.childNodes || []) walk(c);
    if (n.content) walk(n.content);
  };
  walk(parse(html));
  return out.join('|').replace(/\s+/g, ' ');
};

test('page.html baked in the source\'s own words is the same page', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/page.html'), 'utf8');
  assert.equal(textOf(bakeHtml(src, scanHtml(src))), textOf(src));
});

test('the pseudo-locale keeps every message\'s arguments and tags', () => {
  for (const [id, m] of messages) {
    const p = pseudo(m);
    assert.deepEqual(shape(parseIcu(p)), shape(parseIcu(m)), id);
  }
});

// a message's structure: its arguments (with their kinds) and tags; a translation must keep them
function shape(els, out = new Set()) {
  for (const e of els) {
    if (e.type === TYPE.tag) { out.add(`<${e.value}>`); shape(e.children, out); }
    else if (e.type !== TYPE.literal && e.type !== TYPE.pound) out.add(`{${e.value}:${TYPE[e.type]}}`);
    if (e.options) for (const o of Object.values(e.options)) shape(o.value, out);
  }
  return [...out].sort();
}

test('every catalog in locales/ uses the source\'s arguments and tags', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'locales'))) {
    if (!/^[a-z]{2}(-[A-Za-z0-9]+)*\.json$/.test(f) || f === 'en.json') continue;
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', f), 'utf8'));
    for (const [id, m] of Object.entries(cat)) {
      if (!messages.has(id) || m === '') continue;
      let ast;
      assert.doesNotThrow(() => { ast = parseIcu(m); }, `${f} ${id}`);
      // (a plural or select may be added or dropped in another language; the arguments must stay)
      const args = (s) => s.filter((x) => !x.endsWith(':plural}') && !x.endsWith(':select}')).map((x) => x.replace(/:.*\}$/, '}'));
      const want = new Set(args(shape(parseIcu(messages.get(id))))), got = new Set(args(shape(ast)));
      for (const x of got) assert.ok(want.has(x), `${f} ${id} uses ${x}, which the source does not give`);
    }
  }
});

test('tr: plain text, arguments, plurals and inline tags', () => {
  assert.equal(tr('test.a', 'Pause'), 'Pause');
  assert.equal(tr('test.b', 'the world\'s {n} cells', { n: 12345 }), 'the world\'s 12345 cells');
  assert.equal(tr('test.c', '{n, plural, one {# cell} other {# cells}}', { n: 12345 }), '12,345 cells');
  assert.equal(tr('test.d', 'a <b>bold</b> {x}', { x: '<i>y</i>' }), 'a <b>bold</b> <i>y</i>');
  assert.equal(tr('test.e', 'its <term>diet</term>', { term: (c) => `[${c.join('')}]` }), 'its [diet]');
});

test('the editor\'s marks carry an id and come off again', () => {
  const s = mark('chron.obit.head', 'Hello') + ' and ' + mark('dock.pause', 'Pause');
  assert.deepEqual(marks(s), ['chron.obit.head', 'dock.pause']);
  assert.equal(unmark(s), 'Hello and Pause');
});
