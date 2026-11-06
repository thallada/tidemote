import test from 'node:test';
import assert from 'node:assert/strict';
import { chronicleBook, serialsIn } from '../src/book.js';

const sp = (serial, name, o = {}) => ({ serial, name, genome: { col: 0xff3366aa }, born: 60, alive: true, pop: 1200, ...o });
const link = (s) => `<a href="#" class="sp" data-serial="${s.serial}">${s.name}</a>`;

test('the book tells the chronicler’s stories in order, by era, and indexes the species they name', () => {
  const a = sp(7, 'Thax kaelum'), b = sp(9, 'Mo vira', { alive: false, extinct: 1800 }), c = sp(11, 'Dru ox', { symbiont: 9 });
  const reg = new Map([[7, a], [9, b], [11, c]]);
  const chronicle = [
    { t: 2500, type: 'story', html: `<b>A new kind of life:</b> ${link(c)} was born of a union with ${link(b)}.` },
    { t: 2000, type: 'est', html: 'not a story' },
    { t: 1900, type: 'story', html: `${link(b)} is no more, hunted down by ${link(a)}.` },
    { t: 600, type: 'story', html: `${link(a)} has taken to living upon ${link(b)}.` },
  ];
  const eras = [{ t: 0, name: 'The First Tides' }, { t: 1500, name: 'The Bitter Hush' }];
  const html = chronicleBook({ chronicle, reg, eras, now: 3000, sigil: (s) => `<svg data-s="${s.serial}"></svg>`, words: () => 'grazer · swimmer' });
  assert.match(html, /^<!doctype html>/);
  // oldest first; two chapters, named for their eras
  assert.ok(html.indexOf('taken to living upon') < html.indexOf('is no more'));
  assert.ok(html.indexOf('is no more') < html.indexOf('A new kind of life'));
  assert.equal((html.match(/class="chapter"/g) || []).length, 2);
  assert.match(html, /Chapter II<\/small>The Bitter Hush/);
  assert.doesNotMatch(html, /not a story/);
  // links become names in their colors; no data-serial survives into the book
  assert.doesNotMatch(html, /<a /);
  assert.match(html, /class="sp" style="--c:#aa6633">Thax kaelum/);
  // the index: every species named, with its fate and origin
  assert.match(html, /Mo vira<\/b><span>grazer · swimmer<\/span><span>arose 1:00 · extinct at 30:00/);
  assert.match(html, /born of a union with Mo vira/);
  assert.equal(serialsIn(chronicle[0].html).join(), '11,9');
});

test('an empty chronicle still makes a book', () => {
  assert.match(chronicleBook({ now: 120 }), /has not yet spoken/);
});
