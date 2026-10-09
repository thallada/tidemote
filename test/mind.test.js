import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_K as K, MIND_HEAD, MIND_NBR_WORDS, MIND_BYTES } from '../src/shaders.js';
import { parseMind, interpretMind, settleMind, catchSkill, strikeChance, slotRows, groupsFor } from '../src/mind.js';

const NONE = 0xffffffff;
const ME = 10, HUNTER = 11, ALGA = 12, BUG = 13;
const G = {
  [ME]: { photo: 0, dGlint: 0.2, dHusk: 0, dFlesh: 0.8, reproE: 1.2, adhesion: 0 },
  [HUNTER]: { photo: 0, dGlint: 0, dHusk: 0, dFlesh: 1, reproE: 1.5, adhesion: 0 },
  [ALGA]: { photo: 0.9, dGlint: 0.5, dHusk: 0.5, dFlesh: 0, reproE: 1, adhesion: 0 },
  [BUG]: { photo: 0, dGlint: 1, dHusk: 0, dFlesh: 0, reproE: 1, adhesion: 0.5 },
};
const genomeOf = (k) => G[k] || null;

/** A mind buffer as mindMain writes it. */
function buffer({ hungry = false, silt = false, food = null, energy = 0.5, photoGain = 0, upkeep = 0.02, light = 0.5, drives = {}, nbrs = [], stoneN = 0, kinCost = 1, image = 0, flow = [0, 0], vel = [0, 0] } = {}) {
  const buf = new ArrayBuffer(MIND_BYTES);
  const u32 = new Uint32Array(buf), f32 = new Float32Array(buf);
  u32[0] = 77; u32[1] = 1;
  u32[2] = (hungry ? 1 : 0) | (silt ? 2 : 0) | (food ? 4 : 0);
  u32[3] = food ? food.kind : NONE; f32[4] = food ? food.dist : 0; u32[5] = food ? 5 : NONE;
  u32[6] = image; u32[7] = nbrs.length;
  Object.assign(f32, { 8: photoGain, 9: upkeep, 10: light, 11: 10, 12: 0, 13: 0, 14: kinCost, 15: stoneN, 16: 1, 17: 1, 18: 1 / 60, 19: energy, 20: 1 });
  f32.set(vel, 22);
  const order = ['space', 'kin', 'other', 'diet', 'matter', 'forage', 'align', 'bond', 'stone', 'swim'];
  order.forEach((k, i) => f32.set(drives[k] || [0, 0], 24 + 2 * i));
  f32.set(flow, 44);
  nbrs.forEach((q, k) => {
    const o = MIND_HEAD + k * MIND_NBR_WORDS;
    u32[o] = q.kind; u32[o + 1] = q.inside ? 1 : 0;
    f32[o + 2] = q.d[0]; f32[o + 3] = q.d[1]; f32[o + 4] = q.fSig; f32[o + 5] = q.fDiet || 0; u32[o + 6] = k;
  });
  return parseMind(u32, f32);
}

test('parseMind reads the header, drives and neighbours', () => {
  const m = buffer({ hungry: true, silt: true, food: { kind: 1, dist: 0.2 }, drives: { diet: [0.5, 0] }, nbrs: [{ kind: HUNTER, d: [0.3, 0], fSig: -0.2, inside: true }] });
  assert.equal(m.hungry, true);
  assert.equal(m.siltNear, true);
  assert.deepEqual(m.food, { kind: 1, dist: m.food.dist, j: 5 });
  assert.ok(Math.abs(m.food.dist - 0.2) < 1e-6);
  assert.deepEqual(m.drives.diet, [0.5, 0]);
  assert.equal(m.nbrs.length, 1);
  assert.equal(m.nbrs[0].inside, true);
  const none = new Uint32Array(MIND_BYTES / 4);
  assert.equal(parseMind(none, new Float32Array(none.buffer)), null);
});

test('a hungry flesh-eater with prey in reach is hunting it', () => {
  const m = buffer({ hungry: true, food: { kind: BUG, dist: 0.2 }, drives: { diet: [0.4, 0] }, nbrs: [{ kind: BUG, d: [0.2, 0], fSig: 0, fDiet: 0.4 }] });
  const it = interpretMind(m, G[ME], ME, { K, genomeOf });
  assert.equal(it.key, 'hunt');
  assert.equal(it.target, BUG);
  assert.match(it.why, /kills about \d+% of the time/);
});

test('a cell repelled by a species that can catch it is fleeing', () => {
  const m = buffer({ hungry: true, drives: { other: [-0.6, 0], swim: [0.1, 0] }, nbrs: [{ kind: HUNTER, d: [0.6, 0], fSig: -0.6 }] });
  const it = interpretMind(m, G[BUG], BUG, { K, genomeOf });
  assert.equal(it.key, 'flee');
  assert.equal(it.target, HUNTER);
  // the same push from a harmless species is mere avoidance
  const m2 = buffer({ hungry: true, drives: { other: [-0.6, 0] }, nbrs: [{ kind: ALGA, d: [0.6, 0], fSig: -0.6 }] });
  assert.equal(interpretMind(m2, G[BUG], BUG, { K, genomeOf }).key, 'avoid');
});

test('a hungry cell drawn by its diet toward prey out of reach is stalking', () => {
  const m = buffer({ hungry: true, drives: { diet: [0.3, 0.1], space: [0.05, 0] }, nbrs: [{ kind: BUG, d: [0.7, 0.2], fSig: 0.01, fDiet: 0.3 }] });
  const it = interpretMind(m, G[ME], ME, { K, genomeOf });
  assert.equal(it.key, 'stalk');
  assert.equal(it.target, BUG);
});

test('division waits on a grain of silt', () => {
  assert.equal(interpretMind(buffer({ energy: 1.5, silt: true }), G[ME], ME, { K, genomeOf }).key, 'divide');
  assert.equal(interpretMind(buffer({ energy: 1.5 }), G[ME], ME, { K, genomeOf }).key, 'seeksilt');
});

test('photosynthesisers bask or wait out the dark, and starvation is noted', () => {
  assert.equal(interpretMind(buffer({ photoGain: 0.1, upkeep: 0.03 }), G[ALGA], ALGA, { K, genomeOf }).key, 'bask');
  const dark = interpretMind(buffer({ energy: 0.3, photoGain: 0.001, upkeep: 0.03 }), G[ALGA], ALGA, { K, genomeOf });
  assert.equal(dark.key, 'dark');
  const low = dark.flags.find((f) => f.key === 'low');
  assert.ok(low.on && /s of energy left/.test(low.hint));
  assert.ok(dark.budget.net < 0);
});

test('catch skill and strike chance follow lifeMain', () => {
  assert.equal(catchSkill(G[HUNTER], G[BUG], K), 1);
  assert.equal(catchSkill(G[ALGA], G[BUG], K), 0);
  // grazers crop plants at grazePref; armour, unfamiliarity and stone each cut a strike's odds
  assert.ok(Math.abs(catchSkill(G[BUG], G[ALGA], K) - Math.min(1, K.grazePref / K.catchSkill)) < 1e-9);
  const base = strikeChance(G[HUNTER], G[BUG], BUG, 0, 0, K);
  assert.ok(base < 1, 'bonded prey is armoured');
  assert.ok(strikeChance(G[HUNTER], G[BUG], BUG, 99, 0, K) < base);
  assert.ok(strikeChance(G[HUNTER], G[BUG], BUG, 0, 2, K) < base);
});

test('settleMind shows a new state only once it holds', () => {
  const a = { key: 'hunt', target: 1 }, b = { key: 'flee', target: 2 };
  let memo = settleMind(null, a);
  assert.equal(memo.cur, a);
  memo = settleMind(memo, b);
  assert.equal(memo.cur, a);
  memo = settleMind(memo, a);
  assert.equal(memo.cur, a);
  memo = settleMind(memo, b);
  memo = settleMind(memo, b);
  assert.equal(memo.cur, b);
});

test('a cell with seconds of energy left and nothing to eat is starving', () => {
  const it = interpretMind(buffer({ hungry: true, energy: 0.05, upkeep: 0.03, drives: { swim: [0.2, 0] } }), G[ME], ME, { K, genomeOf });
  assert.equal(it.key, 'starve');
});

test('lifeMain carries none of mindMain\'s recording hooks', async () => {
  const { simWGSL } = await import('../src/shaders.js');
  const code = simWGSL(K);
  const life = code.slice(code.indexOf('fn lifeMain'), code.indexOf('// --------------------------------------------------------------------- mind'));
  assert.ok(life.length > 1000);
  assert.doesNotMatch(life, /\bm(Fr0|Pair|Vel|Align|Swim|Put)\b|\bmind\[/);
  assert.match(code.slice(code.indexOf('fn mindMain')), /mPair\(j, q, d, r/);
});

test('neighbouring species keep their rows', () => {
  let rows = slotRows(null, [5, 6], 4);
  assert.deepEqual(rows, [5, 6, null, null]);
  rows = slotRows(rows, [7, 6], 4);
  assert.deepEqual(rows, [7, 6, null, null]);
  rows = slotRows(rows, [6, 7, 8, 9, 10], 4);
  assert.deepEqual(rows, [7, 6, 8, 9]);
});

test('the pull rows are fixed by the genome and match the hunt', () => {
  assert.deepEqual(groupsFor(G[ALGA], K).map((g) => g.key), ['other', 'kin', 'space', 'matter']);
  assert.deepEqual(groupsFor(G[BUG], K).map((g) => g.key), ['food', 'other', 'kin', 'space', 'matter', 'bond']);
  const m = buffer({ hungry: true, food: { kind: BUG, dist: 0.2 }, drives: { diet: [0.4, 0], forage: [0, 0.3] }, nbrs: [{ kind: BUG, d: [0.2, 0], fSig: 0, fDiet: 0.4 }] });
  const it = interpretMind(m, G[ME], ME, { K, genomeOf });
  const food = it.groups.find((g) => g.key === 'food');
  assert.ok(Math.abs(food.mag - 0.5) < 1e-6);
  assert.equal(it.mode, 'Hunting');
  assert.ok(it.odds.p > 0 && it.odds.verb === 'kill');
});

test('a torpid cell reads as torpid before anything else', () => {
  const buf = new ArrayBuffer(MIND_BYTES);
  const u32 = new Uint32Array(buf), f32 = new Float32Array(buf);
  u32[1] = 1; u32[2] = 1; u32[3] = NONE; u32[5] = NONE;
  Object.assign(f32, { 9: 0.01, 17: 1, 18: 1 / 60, 19: 0.5, 20: 1, 21: 6, 52: 6, 53: 0, 54: -2 });
  u32[55] = 1;
  const m = parseMind(u32, f32);
  assert.equal(m.torpid, true);
  const it = interpretMind(m, { ...G[ME], topt: 20, tol: 6 }, ME, { K, genomeOf });
  assert.equal(it.key, 'torpid');
  assert.ok(it.flags.find((f) => f.key === 'cold').on);
});
