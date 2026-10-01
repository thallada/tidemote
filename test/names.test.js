import test from 'node:test';
import assert from 'node:assert/strict';
import { prng, word, cap, genusName, speciesEpithet } from '../src/names.js';

test('names preserve the original seeded outputs', () => {
  for (const [seed, genus, epithet] of [
    [1, 'Biachyl', 'nymens'], [42, 'Thabel', 'saxoth'],
    [123456, 'Nyghex', 'phyghisyx'], [0xffffffff, 'Quaeyophesh', 'xernora'],
  ]) {
    assert.equal(genusName(seed, new Set()), genus);
    assert.equal(speciesEpithet(seed), epithet);
  }
  const a = prng(42), b = prng(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('words have capitalised syllables and genus retries do not mutate existing names', () => {
  // The syllable grammar checks pronounceable structure, not just alphabetic output.
  const syllables = /^(?:V|Th|K|Z|Qu|R|M|S|N|X|Ph|Dr|Gh|L|Y|Sk|Tr|H|B|C|Vr|Ch)[aoeiuy](?:e|u|a|o)?(?:(?:v|th|k|z|qu|r|m|s|n|x|ph|dr|gh|l|y|sk|tr|h|b|c|vr|ch)[aoeiuy](?:e|u|a|o)?)*(?:n|r|th|x|s|l|m|k|sh|rn)?$/;
  for (let seed = 0; seed < 100; seed++) {
    assert.match(cap(word(prng(seed), 2)), syllables);
    assert.match(genusName(seed, new Set()), syllables);
    assert.match(speciesEpithet(seed), /^[a-z]+$/);
  }
  const first = genusName(42, new Set());
  const existing = new Set([first]);
  const next = genusName(42, existing);
  assert.notEqual(next, first);
  assert.equal(genusName(42, existing), next);
  assert.deepEqual([...existing], [first]);
  let attempts = 0;
  assert.match(genusName(42, { has: () => { attempts++; return true; } }), syllables);
  assert.equal(attempts, 8);
});
