import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCard, decodeCard, cardLink, cardFromHash, pngText, cardFromPng, cardIntoPng, filterCards } from '../src/cabinet.js';
import { G_WORDS } from '../src/shaders.js';
import { qr } from '../src/qr.js';
import { PNG } from 'pngjs';

const words = Array.from({ length: G_WORDS }, (_, i) => (i * 2654435761) >>> 0);

test('a card carries its genome, its name and home water, and whether its world was touched', () => {
  const b = encodeCard({ words, name: 'Thax kaelum', home: 'The Hollow Gyre', touched: true });
  const c = decodeCard(b);
  assert.deepEqual(c.words, words);
  assert.equal(c.name, 'Thax kaelum');
  assert.equal(c.home, 'The Hollow Gyre');
  assert.equal(c.touched, true);
  // (a long name cut to its 48 bytes between characters, never through one)
  const long = decodeCard(encodeCard({ words, name: 'Ψυχή'.repeat(12), home: '深い海'.repeat(16) }));
  assert.equal(long.name, 'Ψυχή'.repeat(6));
  assert.equal(long.home, '深い海'.repeat(5) + '深');
  assert.ok(!/\uFFFD/.test(long.name + long.home));
});

test('a damaged card, another kind of file, or another format is refused', () => {
  const b = encodeCard({ words, name: 'A', home: 'B' });
  const bad = b.slice(); bad[20] ^= 1;
  assert.throws(() => decodeCard(bad), /damaged/);
  assert.throws(() => decodeCard(new Uint8Array(40)), /not a Tidemote/);
  const old = b.slice(); old[4] = 1;
  assert.throws(() => decodeCard(old), /older/);
});

test('its link and its PNG text chunk give it back', () => {
  const b = encodeCard({ words, name: 'Vorath iss', home: 'Salt Reach' });
  const link = cardLink(b);
  assert.match(link, /^https:\/\/tidemote\.com\/#card=[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCard(cardFromHash(new URL(link).hash)).words, words);
  const img = new PNG({ width: 4, height: 4 });
  const png = new Uint8Array(PNG.sync.write(img));
  const withCard = cardIntoPng(png, b);
  assert.equal(pngText(withCard, 'other'), null);
  assert.deepEqual(decodeCard(cardFromPng(withCard)).words, words);
  // still a PNG that decodes
  assert.equal(PNG.sync.read(Buffer.from(withCard)).width, 4);
  // the link fits a QR code of modest size
  assert.ok(qr(new TextEncoder().encode(link)).version <= 16);
});

test('the cabinet filters: from this world, other waters; search; newest first', () => {
  const cards = [{ id: 1, name: 'Thax', home: 'Gyre', world: 5, savedAt: 1 }, { id: 2, name: 'Vorath', home: 'Salt Reach', world: 9, savedAt: 3 }, { id: 3, name: 'Ossa', home: 'Gyre', world: 5, savedAt: 2 }];
  assert.deepEqual(filterCards(cards).map((c) => c.id), [2, 3, 1]);
  assert.deepEqual(filterCards(cards, { from: 'this', world: 5 }).map((c) => c.id), [3, 1]);
  assert.deepEqual(filterCards(cards, { from: 'other', world: 5 }).map((c) => c.id), [2]);
  assert.deepEqual(filterCards(cards, { q: 'salt' }).map((c) => c.id), [2]);
});
