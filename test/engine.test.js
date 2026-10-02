import test from 'node:test';
import assert from 'node:assert/strict';
import { G_WORDS } from '../src/shaders.js';
import {
  ARCHETYPE_TYPES, archetypeGenome, writeGenome, readGenome, finalizeGenome,
  roleShares, hsl2rgb, packUnorm, unpackUnorm, affinity, parseParticle,
} from '../src/genome.js';

function near(actual, expected, tolerance = 1e-12, label = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual} (tolerance ${tolerance})`);
}

for (const type of ARCHETYPE_TYPES) {
  test(`${type} genome round trip`, () => {
    let seed = 123;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const genome = archetypeGenome(type, random);
    Object.assign(genome, { parent: 17, serial: 123456, born: 12.25, depth: 9 });
    const buffer = new ArrayBuffer(2 * G_WORDS * 4);
    const u32 = new Uint32Array(buffer), f32 = new Float32Array(buffer);
    writeGenome(u32, f32, 1, genome);
    const decoded = readGenome(u32, f32, 1);
    assert.equal(decoded.slot, 1);
    assert.ok(u32.slice(0, G_WORDS).every((word) => word === 0));
    for (const [key, value] of Object.entries(genome)) {
      if (typeof value === 'number') {
        if (['col', 'parent', 'serial', 'depth', 'shape'].includes(key)) {
          assert.equal(decoded[key], value, key);
        } else {
          near(decoded[key], value, Math.max(1, Math.abs(value)) * 1e-7, key);
        }
      }
    }
    for (let role = 0; role < 3; role++) {
      for (const signature of ['surf', 'rec']) {
        assert.equal(decoded.roles[role][signature].length, 8);
        genome.roles[role][signature].forEach((value, i) =>
          near(decoded.roles[role][signature][i], value, 1 / 127, `${role}.${signature}[${i}]`));
      }
      genome.dev[role].forEach((value, i) =>
        near(decoded.dev[role][i], value, 1 / 255, `dev[${role}][${i}]`));
    }
  });
}

test('finalizeGenome normalises diet and calculates metabolism', () => {
  const genome = archetypeGenome('hunter', () => 0.5);
  Object.assign(genome, {
    dGlint: 2, dHusk: 3, dFlesh: 5, force: 4, radius: 0.5,
    lifespan: 100, advect: 0.25, size: 2, swim: 1.5, photo: 0.4,
    align: 0.5, adhesion: 0.8,
  });
  assert.equal(finalizeGenome(genome, { metab: 2, anchorCost: 0.02, swimCost: 0.03 }), genome);
  assert.deepEqual([genome.dGlint, genome.dHusk, genome.dFlesh], [0.2, 0.3, 0.5]);
  near(genome.dGlint + genome.dHusk + genome.dFlesh, 1);
  near(genome.metab, 0.198);
});

test('roleShares returns a probability distribution', () => {
  const shares = roleShares({ dev: [[2, 3, 5], [2, 3, 5], [2, 3, 5]] });
  near(shares.reduce((sum, value) => sum + value, 0), 1);
  shares.forEach((value, i) => near(value, [0.2, 0.3, 0.5][i]));
  assert.deepEqual(roleShares({ dev: [[1, 0, 0], [1, 0, 0], [1, 0, 0]] }), [1, 0, 0]);
});

test('hsl2rgb converts known colours', () => {
  for (const [hsl, expected] of [
    [[0, 1, 0.5], [1, 0, 0]],
    [[1 / 3, 1, 0.5], [0, 1, 0]],
    [[2 / 3, 1, 0.5], [0, 0, 1]],
    [[0.7, 0, 0.25], [0.25, 0.25, 0.25]],
    [[0, 1, 0], [0, 0, 0]],
    [[0, 1, 1], [1, 1, 1]],
  ]) {
    hsl2rgb(...hsl).forEach((value, i) => near(value, expected[i]));
  }
});

test('unpackUnorm reverses packing within quantisation tolerance', () => {
  for (const rgba of [[0, 0, 0, 0], [1, 1, 1, 1], [0.1, 0.4, 0.7, 0.9]]) {
    unpackUnorm(packUnorm(...rgba)).forEach((value, i) => near(value, rgba[i], 1 / 255));
  }
  assert.equal(packUnorm(1, 0, 0, 0), 0x000000ff);
  assert.equal(packUnorm(0, 0, 0, 1), 0xff000000);
  assert.deepEqual(unpackUnorm(packUnorm(-1, 2, 0.5)), [0, 1, 128 / 255, 1]);
});

test('affinity scales symmetrically around zero and clamps to [-1, 1]', () => {
  const a = { roles: [{ rec: Array(8).fill(0) }, { rec: Array(8).fill(0.5) }] };
  const b = { roles: [{ surf: Array(8).fill(0.25) }, { surf: Array(8).fill(0) }] };
  near(affinity(a, 1, b, 0, { affScale: 0.5 }), 0.5);
  near(affinity(a, 1, b, 0, { affScale: -0.5 }), -0.5);
  assert.equal(affinity(a, 1, b, 0, { affScale: 4 }), 1);
  assert.equal(affinity(a, 1, b, 0, { affScale: -4 }), -1);
  assert.equal(affinity(a, 0, b, 0, { affScale: 4 }), 0);
});

test('parseParticle decodes cause, role and unsigned generation bits', () => {
  const buffer = new ArrayBuffer(20 * 4);
  const u32 = new Uint32Array(buffer), f32 = new Float32Array(buffer);
  const offset = 10;
  f32.set([1.25, -2.5, 0.5, -0.75], offset);
  u32[offset + 4] = 7;
  f32[offset + 5] = 3.5;
  f32[offset + 6] = 12;
  u32[offset + 7] = 123;
  u32[offset + 8] = 0xff123456;
  for (const cause of [0, 9, 15]) {
    for (const role of [0, 1, 2, 3]) {
      for (const gen of [0, 12345, 0xffff]) {
        for (const image of [0, 4, 511, 512, 1023]) {
          const info = ((gen << 16) | (image << 6) | (role << 4) | cause) >>> 0;
          u32[offset + 9] = info;
          assert.deepEqual(parseParticle(u32, f32, offset), {
            x: 1.25, y: -2.5, vx: 0.5, vy: -0.75, kind: 7,
            energy: 3.5, age: 12, id: 123, col: 0xff123456,
            info, cause, role, gen,
          });
        }
      }
    }
  }
});
