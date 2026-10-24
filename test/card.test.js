import test from 'node:test';
import assert from 'node:assert/strict';
import { cardData, CARD_W, CARD_H } from '../src/card.js';
import { archetypeGenome, finalizeGenome } from '../src/genome.js';
import { DEFAULT_K } from '../src/shaders.js';

const rng = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const sp = (serial, type, extra = {}) => {
  const g = finalizeGenome(archetypeGenome(type, rng(serial)));
  g.serial = serial;
  return { serial, genome: g, name: `Thax ${type}`, genus: 'Thax', pop: 400, peak: 900, alive: true, established: true, born: 60, ancestor: null, founder: false, ...extra };
};

test('a card is shaped like a playing card, taller than it is wide', () => {
  assert.ok(CARD_W / CARD_H > 0.6 && CARD_W / CARD_H < 0.66);
});

test('a card says how a species lives, where it came from and what the chronicler said', () => {
  const a = sp(30, 'grazer', { founder: true }), b = sp(31, 'grazer', { ancestor: 30 }), c = sp(40, 'hunter', { ancestor: 31, name: 'Little Wanderer', binomial: 'Thax hunter', given: true });
  const reg = new Map([[30, a], [31, b], [40, c]]);
  const d = cardData(c, { reg, genera: new Map(), K: { ...DEFAULT_K, heat: 1 }, story: { text: 'It was hunted down.' }, simTime: 3600, era: 'The Bitter Hush', founders: 24, living: 4000 });
  assert.equal(d.name, 'Little Wanderer');
  assert.equal(d.binomial, 'Thax hunter');
  assert.ok(d.given);
  assert.deepEqual(d.lineage, ['Thax grazer', 'Thax grazer']);
  assert.equal(d.story, 'It was hunted down.');
  assert.ok(d.facts.some(([k]) => k === 'Diet') && d.facts.some(([k]) => k === 'Water'));
  assert.deepEqual(d.stats.slice(0, 2), [['Population', '400'], ['Share of life', '10.0%']]);
  assert.match(d.when, /1:00:00 · The Bitter Hush/);
  // its numbers from the census history, ending at its count now
  const history = [0, 600, 1200, 1800, 2400, 3000].map((t, i) => ({ t, sp: [[40, 100 * i], [30, 5]] }));
  const h = cardData(c, { reg, genera: new Map(), K: DEFAULT_K, history, simTime: 3600, living: 4000 });
  assert.deepEqual(h.series.v, [100, 200, 300, 400, 500, 400]); // from its birth (60 s)
  assert.equal(h.series.t.at(-1), 3600);
  const gone = cardData({ ...a, alive: false, extinct: 600 }, { reg, genera: new Map(), K: DEFAULT_K, founders: 24 });
  assert.deepEqual(gone.stats[0], ['Extinct at', '10:00']);
  assert.match(gone.origin, /sparked from silt/);
});
