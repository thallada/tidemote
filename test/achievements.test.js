import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, earned, reached, worthy, worldFacts, createPacer, EVENT_BITS } from '../src/achievements.js';

test('achievement ids are Steam API names, each once, each in a tier', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ACHIEVEMENTS) {
    assert.match(a.id, /^[A-Z][A-Z0-9_]*$/);
    assert.ok(a.name && a.desc, a.id);
    assert.ok(['core', 'rare', 'viewer'].includes(a.tier), a.id);
    // each comes one way: a story, the world's numbers, the stories read, or (the viewer's) the page's own call
    assert.ok([a.story, a.world, a.stories].filter(Boolean).length <= 1, a.id);
    if (a.tier === 'viewer') assert.ok(!a.story && !a.world, a.id);
  }
});

test('a story earns what it tells of', () => {
  const ids = (s, told) => earned(s, told).filter((id) => id !== 'FIRST_STORY');
  assert.ok(earned({ kind: 'boom' }).includes('FIRST_STORY'));
  assert.deepEqual(ids({ kind: 'cycle', key: 'cycle:1:2' }), ['CYCLE']);
  assert.deepEqual(ids({ kind: 'guild' }), ['GUILD_LOST']);
  assert.deepEqual(ids({ kind: 'guild', moment: 'back' }), []);
  assert.deepEqual(ids({ kind: 'reign', span: 25 * 60 }), []);
  assert.deepEqual(ids({ kind: 'reign', span: 1800 }), ['REIGN']);
  assert.deepEqual(ids({ kind: 'reign', key: 'reign:5:2' }), []); // a reign held, not ended
  assert.deepEqual(ids({ kind: 'comeback', low: 14 }), []);
  assert.deepEqual(ids({ kind: 'comeback', low: 9 }), ['COMEBACK']);
  assert.deepEqual(ids({ kind: 'collapse' }), ['COLLAPSE']);
  assert.deepEqual(ids({ kind: 'collapse', moment: 'back' }), ['RETURN']);
  assert.deepEqual(ids({ kind: 'boom' }, 50), ['STORIES_50']);
  assert.deepEqual(ids({ kind: 'boom' }, 49), []);
});

test('a story is worthy only of what is not yet earned', () => {
  assert.equal(worthy({ kind: 'cycle' }, new Set(['FIRST_STORY'])), true);
  assert.equal(worthy({ kind: 'cycle' }, new Set(['FIRST_STORY', 'CYCLE'])), false);
  assert.equal(worthy({ kind: 'boom' }, new Set(['FIRST_STORY'])), false);
  assert.equal(worthy({ kind: 'boom' }, new Set()), true);
});

const H = 3600;
const facts = (o) => worldFacts({ t: 2 * H, living: 50000, count: 131072, species: [], guildOf: () => 'producer', events: [], top: 0, topSince: 0, ...o });

test('a young world has reached nothing', () => {
  assert.deepEqual(reached(facts({ t: 10 * 60, topSince: 9 * 60 })), []);
});

test('the pool\'s events count once they are over', () => {
  const ev = [{ type: 'storm', end: 1.5 * H }, { type: 'frost', end: 3 * H }];
  assert.deepEqual(reached(facts({ events: ev, topSince: 2 * H })), ['STORM']);
  assert.deepEqual(reached(facts({ t: 3 * H, events: ev, topSince: 3 * H })).sort(), ['FROST', 'STORM']);
});

test('the most numerous species: its share, its guild, its reign', () => {
  const sp = (o) => ({ serial: 7, alive: true, established: true, pop: 30000, establishedAt: 0, ...o });
  assert.ok(reached(facts({ species: [sp({ pop: 46000 })], top: 7, topSince: 2 * H })).includes('MONOCULTURE'));
  assert.ok(!reached(facts({ species: [sp({ pop: 40000 })], top: 7, topSince: 2 * H })).includes('MONOCULTURE'));
  // a few cells after a collapse are no monoculture
  assert.ok(!reached(facts({ living: 500, species: [sp({ pop: 480 })], top: 7, topSince: 2 * H })).includes('MONOCULTURE'));
  assert.ok(reached(facts({ species: [sp()], top: 7, topSince: 0.5 * H, guildOf: () => 'predator' })).includes('APEX'));
  assert.ok(!reached(facts({ species: [sp()], top: 7, topSince: 1.5 * H, guildOf: () => 'predator' })).includes('APEX'));
  assert.ok(reached(facts({ t: 7 * H, species: [sp()], top: 7, topSince: 0.5 * H })).includes('DYNASTY'));
  assert.ok(!reached(facts({ t: 7 * H, species: [sp()], top: 7, topSince: 1.5 * H })).includes('DYNASTY'));
});

test('a species that has lived through all four kinds of event, and a day', () => {
  const all = EVENT_BITS.drought | EVENT_BITS.storm | EVENT_BITS.frost | EVENT_BITS.duckweed;
  const sp = { serial: 3, alive: true, established: true, pop: 100, establishedAt: 0 };
  assert.ok(reached(facts({ species: [{ ...sp, weathered: all }], topSince: 2 * H })).includes('SURVIVOR'));
  assert.ok(!reached(facts({ species: [{ ...sp, weathered: all & ~EVENT_BITS.frost }], topSince: 2 * H })).includes('SURVIVOR'));
  assert.ok(!reached(facts({ species: [{ ...sp, alive: false, weathered: all }], topSince: 2 * H })).includes('SURVIVOR'));
  assert.ok(reached(facts({ t: 25 * H, species: [sp], topSince: 25 * H })).includes('LIVING_FOSSIL'));
});

test('life dwindling to its last few, and a singer taking hold', () => {
  assert.ok(reached(facts({ peak: 100000, low: 15, topSince: 2 * H })).includes('LAST_FEW'));
  assert.ok(!reached(facts({ peak: 100000, low: 900, topSince: 2 * H })).includes('LAST_FEW'));
  assert.ok(!reached(facts({ peak: 1500, low: 0, topSince: 2 * H })).includes('LAST_FEW')); // never much life to lose
  assert.ok(reached(facts({ signal: 1, topSince: 2 * H })).includes('SIGNAL'));
});

test('core achievements come one at a time; rare and the viewer\'s at once', () => {
  const p = createPacer({ sim: 900, real: 60e3 });
  const have = new Set();
  assert.deepEqual(p.take(['FIRST_STORY'], have, 480, 0), ['FIRST_STORY']);
  have.add('FIRST_STORY');
  assert.deepEqual(p.take(['FIRST_STORY'], have, 500, 1e3), []); // earned already
  assert.equal(p.ready(600, 2e3), false);
  assert.deepEqual(p.take(['CYCLE'], have, 600, 2e3), []); // held: too soon
  assert.deepEqual(p.take(['APEX', 'NAMED'], have, 700, 3e3), ['APEX', 'NAMED']); // never held, but they start the wait again
  assert.deepEqual(p.take(['CYCLE'], have, 700 + 900, 4e3), []); // the real minute not yet passed
  assert.deepEqual(p.take(['CYCLE', 'ARMS_RACE'], have, 700 + 900, 64e3), ['CYCLE']); // one at a time
  have.add('CYCLE');
  assert.deepEqual(p.take(['ARMS_RACE'], have, 700 + 1000, 200e3), []);
  assert.deepEqual(p.take(['ARMS_RACE'], have, 700 + 1800, 200e3), ['ARMS_RACE']);
  assert.equal(p.ready(10, 70e3), true); // a world begun again
});

test('life sparked from the silt filling the pool', () => {
  const sp = (o) => ({ serial: 200, founder: true, alive: true, established: true, pop: 40000, establishedAt: 0, ...o });
  assert.ok(reached(facts({ founders: 96, species: [sp()], topSince: 2 * H })).includes('SPARK'));
  assert.ok(!reached(facts({ founders: 96, species: [sp({ serial: 50 })], topSince: 2 * H })).includes('SPARK')); // a founder
  assert.ok(!reached(facts({ founders: 96, species: [sp({ pop: 30000 })], topSince: 2 * H })).includes('SPARK'));
});
