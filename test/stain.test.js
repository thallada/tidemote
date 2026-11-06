import test from 'node:test';
import assert from 'node:assert/strict';
import { STAINS, stainOf, stainColors, stainKey, hueOf } from '../src/stain.js';
import { DEFAULT_K, MAXK } from '../src/shaders.js';

const g = (o) => ({ photo: 0, dGlint: 0, dHusk: 0, dFlesh: 1, swim: 0, advect: 0.5, topt: 19, graft: 0, serial: 7, ...o });
const unpack = (u) => [u & 255, (u >>> 8) & 255, (u >>> 16) & 255, u >>> 24];

test('every stain but none colors a species, and has a key', () => {
  for (const s of STAINS.slice(1)) {
    const c = stainOf(s.id, { genome: g({ graft: 0.5 }), genus: 'Vorath', born: 0 }, 9, { t: 60, hosts: new Set() });
    assert.equal(c.length, 4);
    assert.ok(c.every((x) => Number.isFinite(x) && x >= 0 && x <= 1), `${s.id}: ${c}`);
    assert.ok(stainKey(s.id).length >= 2, s.id);
    assert.ok(s.hint, s.id);
  }
  assert.deepEqual(stainOf('none', { genome: g() }, 9), [0, 0, 0, 0]);
});

test('diet: a producer stains green, a hunter red', () => {
  const plant = stainOf('diet', { genome: g({ photo: 1 }) }, 5), hunter = stainOf('diet', { genome: g({ dFlesh: 1 }) }, 6);
  assert.ok(plant[1] > plant[0] && plant[1] > plant[2]);
  assert.ok(hunter[0] > hunter[1] && hunter[0] > hunter[2]);
});

test('grafts: grafters and their hosts take the stain, the rest are left unstained', () => {
  const ctx = { hosts: new Set([12]) };
  assert.equal(stainOf('graft', { genome: g({ graft: 0.4 }) }, 11, ctx)[3], 1);
  assert.equal(stainOf('graft', { genome: g() }, 12, ctx)[3], 1);
  assert.equal(stainOf('graft', { genome: g() }, 13, ctx)[3], 0);
  // a gene under graftMin does not graft
  assert.equal(stainOf('graft', { genome: g({ graft: DEFAULT_K.graftMin * 0.9 }) }, 13, ctx)[3], 0);
});

test('lineage: one genus, one color; the colors packed by slot', () => {
  assert.deepEqual(stainOf('clade', { genome: g(), genus: 'Thax' }, 5), stainOf('clade', { genome: g({ serial: 99 }), genus: 'Thax' }, 8));
  assert.notEqual(hueOf('Thax'), hueOf('Vorath'));
  const out = stainColors('clade', [[5, { genome: g(), genus: 'Thax' }], [8, { genome: g(), genus: 'Thax' }], [9, null]]);
  assert.equal(out.length, MAXK);
  assert.equal(out[5], out[8]);
  assert.equal(out[9], 0);
  assert.equal(unpack(out[5])[3], 255);
});

test('novelty: a species born now is brighter than an old one', () => {
  const lum = (c) => c[0] + c[1] + c[2];
  assert.ok(lum(stainOf('age', { genome: g(), born: 3590 }, 5, { t: 3600 })) > lum(stainOf('age', { genome: g(), born: 0 }, 5, { t: 7200 })));
});
