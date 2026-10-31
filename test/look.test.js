import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOK, LOOK_WORDS, DARKFIELD, packLook } from '../src/look.js';
import { POST_WGSL } from '../src/shaders.js';

test('the look fits Post.look, and Darkfield names only its tunables', () => {
  assert.ok(LOOK.length <= LOOK_WORDS && LOOK_WORDS % 4 === 0);
  assert.match(POST_WGSL, new RegExp(`look: array<vec4f, ${LOOK_WORDS / 4}>`));
  assert.equal(new Set(LOOK).size, LOOK.length);
  for (const k of Object.keys(DARKFIELD)) assert.ok(LOOK.includes(k), k);
});

test('a look packs its tunables in order at its strength, and strength 0 is the bare view', () => {
  const w = packLook({ rims: 0.5, iris: 0.2 }, 0.5);
  assert.equal(w[LOOK.indexOf('rims')], 0.25);
  assert.ok(Math.abs(w[LOOK.indexOf('iris')] - 0.1) < 1e-7);
  assert.ok(packLook(DARKFIELD, 0).every((x) => x === 0));
});
