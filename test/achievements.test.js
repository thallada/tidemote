import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, earned } from '../src/achievements.js';
import { firstsOf } from '../src/chronicler.js';
import { archetypeGenome, finalizeGenome } from '../src/genome.js';
import { DEFAULT_K } from '../src/shaders.js';

test('achievement ids are Steam API names, each once', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ACHIEVEMENTS) {
    assert.match(a.id, /^[A-Z][A-Z0-9_]*$/);
    assert.ok(a.name && a.desc, a.id);
  }
});

test('a story earns what it tells of', () => {
  assert.deepEqual(earned({ kind: 'first', key: 'first:multi' }), ['FIRST_MULTI']);
  assert.deepEqual(earned({ kind: 'first', key: 'first:calcify' }), ['REEF']);
  assert.deepEqual(earned({ kind: 'reef', key: 'reef' }), ['REEF']);
  assert.deepEqual(earned({ kind: 'guild' }), ['GUILD_LOST']);
  assert.deepEqual(earned({ kind: 'guild', moment: 'back' }), []);
  assert.deepEqual(earned({ kind: 'boom', key: 'boom:3' }), []);
  assert.deepEqual(earned({ kind: 'boom' }, 50), ['STORIES_50']);
  assert.deepEqual(earned({ kind: 'boom' }, 49), []);
});

test('every first an achievement names is one the chronicler can tell', () => {
  const keys = new Set();
  const r = () => 0.5;
  for (const type of ['plankton', 'grazer', 'hunter', 'scavenger']) for (const [k] of firstsOf(finalizeGenome(archetypeGenome(type, r), DEFAULT_K))) keys.add(k);
  // the keys firstsOf can return, by their source (genome.js archetypes give only some of them)
  const all = ['guild:producer', 'guild:grazer', 'guild:scavenger', 'guild:predator', 'multi', 'tree', 'swimbody', 'calcify', 'heat', 'thermophile', 'cold', 'types3'];
  for (const k of keys) assert.ok(all.includes(k), k);
  for (const a of ACHIEVEMENTS) {
    const named = all.filter((k) => a.story?.({ kind: 'first', key: `first:${k}` }));
    if (a.id.startsWith('FIRST_')) assert.equal(named.length, 1, a.id);
  }
});
