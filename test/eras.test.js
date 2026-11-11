import test from 'node:test';
import assert from 'node:assert/strict';
import { nameEra, eraMemo, eraThemes, eraTheme, parseEra, THEMES, KIN, SPAN, TIME, ORDINAL, NAME_MAX, FIRST_ERA } from '../src/eras.js';
import { eraName } from '../src/eraname.js';
import { createClimate } from '../src/climate.js';

const lcg = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const GENERA = ['Quesku', 'Thaxor', 'Vrouth', 'Mirael', 'Skolin', 'Chyrix'];
// varied eras: the water, the light, the level, events, and (half the time) life
function facts(r, withLife = true, memo = null) {
  const light = 0.1 + 0.24 * r(), level = r() < 0.2 ? 0.95 : 1;
  const g = GENERA[Math.floor(r() * GENERA.length)];
  return {
    dT: -10 + 20 * r(), temp: 4 + 24 * r(), light, prevLight: 0.1 + 0.24 * r(), level, prevLevel: r() < 0.2 ? 0.95 : 1,
    excursion: r() < 0.35 ? (r() < 0.5 ? -6 : 6) : 0, events: r() < 0.25 ? [['storm', 'drought', 'frost', 'duckweed'][Math.floor(r() * 4)]] : [],
    life: withLife && r() < 0.7 ? {
      living: (memo?.living || 20000) * (0.4 + 1.4 * r()), species: Math.max(5, (memo?.species || 20) + Math.round(-6 + 16 * r())),
      guilds: { producer: 0.5, grazer: 0.45 * r(), scavenger: 0.25 * r(), predator: 0.2 * r() }, moves: { swimmer: 0.5 * r(), drifter: 0.5 * r(), crawler: 0.5 * r(), sessile: 0.6 * r() },
      genus: [g, 0.1 + 0.6 * r()], top: { predator: GENERA[Math.floor(r() * 6)], grazer: GENERA[Math.floor(r() * 6)], scavenger: null },
    } : null,
  };
}
// a world's eras named one after another, as the climate names them (its record of the last 500 names)
function world(seed, n, withLife = true) {
  const r = lcg(seed), memo = eraMemo(), names = [FIRST_ERA];
  for (let i = 0; i < n; i++) names.push(nameEra(facts(r, withLife, memo), [r(), r()], memo, new Set(names.slice(-500))));
  return { names, memo };
}
const fakeEng = () => ({ simTime: 0, ambient: 0.2, temp: 16, excursion: 0, level: 1, tide: new Float32Array(16).fill(1), waves: new Float32Array(16),
  newTideWave() {}, randomizeCurrents: (r, into) => into, grid: [256, 144], duck: new Float32Array(8), drops: new Float32Array(16), K: { pond: 1 } });

test('an era is named the same for the same world, and its name never draws from the climate', () => {
  const run = (life) => {
    const eng = fakeEng(), climate = createClimate(eng, lcg(5));
    if (life) { let k = 0; climate.lifeFacts = () => ({ living: 1000 + 900 * (k++ % 3), species: 12, guilds: { producer: 0.5, grazer: 0.3, scavenger: 0.1, predator: 0.1 }, moves: {}, genus: ['Quesku', 0.6], top: {} }); }
    for (let t = 0; t < 40 * 1100; t += 5) { eng.simTime = t; climate.tick(5); }
    return climate.history;
  };
  const a = run(false), b = run(false), c = run(true);
  assert.deepEqual(a.map((h) => h.name), b.map((h) => h.name));
  // the page's life facts steer the names but not the climate: the same eras, lights, waters and levels
  const strip = (hs) => hs.map(({ name, ...h }) => JSON.stringify(h));
  assert.deepEqual(strip(a), strip(c));
  assert.notDeepEqual(a.map((h) => h.name), c.map((h) => h.name));
  // and a name depends on nothing but what it is given
  const r = lcg(9), f = facts(r), memo = eraMemo();
  assert.equal(nameEra(f, [0.25, 0.75], structuredClone(memo)), nameEra(f, [0.25, 0.75], structuredClone(memo)));
});

test('a world never repeats a name it still holds, nor a head word twice running, and every name fits', () => {
  for (const [seed, life] of [[1, true], [2, false], [3, true], [4, false]]) {
    const { names, memo } = world(seed, 1500, life);
    for (let i = 1; i < names.length; i++) {
      assert.ok(names[i].length <= NAME_MAX, names[i]);
      assert.ok(!names.slice(Math.max(0, i - 500), i).includes(names[i]), `${names[i]} again at ${i}`);
      const head = (n) => { const e = parseEra(n); return e.p === 'coin' ? n : e.noun ?? e.q ?? e.kin ?? e.time ?? e.event ?? e.phrase ?? e.genus; };
      if (i > 1) assert.notEqual(head(names[i]), head(names[i - 1]), `${names[i - 1]} → ${names[i]}`);
    }
    // nothing in the naming record grows with time
    assert.ok(JSON.stringify(memo).length < 1200, JSON.stringify(memo));
  }
});

test('every pattern is reachable, and every name reads back to its own words', () => {
  const seen = new Set();
  for (let s = 1; s <= 12; s++) for (const n of world(s, 300, s % 3 !== 0).names) {
    const e = parseEra(n);
    assert.ok(e, `${n} reads back`);
    seen.add(e.p);
    assert.equal(eraName(n), n, `${n} in the page's words`);
  }
  assert.deepEqual([...seen].sort(), ['adj-noun', 'after', 'coin', 'genus', 'genus-span', 'kin', 'noun', 'ordinal', 'phrase', 'span', 'years']);
});

test('every word has its message, and the old names still read', () => {
  const all = (k) => [...new Set(Object.values(THEMES).flatMap((t) => t[k] || []))];
  const names = [
    ...all('noun').map((n) => `The ${n}`), ...all('adj').map((a) => `The ${a} Thaw`), ...all('adj').map((a) => `The ${a} ${TIME[0]}`),
    ...all('q').map((q) => `${SPAN[0]} of ${q}`), ...SPAN.map((s) => `${s} of Quesku`), ...Object.values(KIN).map((k) => `Years of Pale ${k}`),
    ...all('phrase'), ...all('event').map((e) => `After the ${e}`), `In the Wake of the Ice`, ...ORDINAL.map((o) => `The ${o} Rime`),
    'The Queskian', 'Late Kalovian', 'The Vrouth Ascendancy', FIRST_ERA,
  ];
  for (const n of names) assert.equal(eraName(n), n, n);
  for (const t of Object.values(THEMES)) for (const k of ['adj', 'noun', 'q', 'phrase']) if (t[k] && !t.like) assert.equal(new Set(t[k]).size, t[k].length, `${k}: ${t[k]}`);
  // the names worlds were given before
  for (const a of 'Restless Dim Bright Still Pale Warm Hollow Rising Long Bitter Green Silver'.split(' ')) {
    for (const n of 'Glare Tides Drift Calm Surge Murk Bloom Shallows Gyre Hush'.split(' ')) assert.equal(eraName(`The ${a} ${n}`), `The ${a} ${n}`);
  }
  assert.deepEqual(eraTheme('The Dim Gyre'), { theme: 'shift', tone: 'dim' });
  assert.equal(eraTheme(FIRST_ERA), null);
  assert.equal(eraName('Some Name From Elsewhere'), 'Some Name From Elsewhere');
});

test('what marks an era steers its name', () => {
  const base = { dT: 3, temp: 16, light: 0.2, prevLight: 0.2, level: 1, prevLevel: 1, excursion: 0, events: [], life: null };
  const share = (f, want, n = 200) => {
    let hit = 0;
    for (let i = 0; i < n; i++) {
      const memo = eraMemo(), r = lcg(i + 1);
      const th = eraTheme(nameEra(f, [r(), r()], memo));
      if (want(th)) hit++;
    }
    return hit / n;
  };
  const is = (...ts) => (th) => ts.includes(th?.theme) || ts.includes(th?.tone);
  assert.ok(share({ ...base, dT: 9, temp: 26 }, is('warm')) > 0.9);
  assert.ok(share({ ...base, dT: -9, temp: 6 }, is('cold')) > 0.9);
  assert.ok(share({ ...base, light: 0.12, prevLight: 0.32 }, is('dim')) > 0.9);
  assert.ok(share({ ...base, light: 0.33, prevLight: 0.12 }, is('bright')) > 0.9);
  assert.ok(share({ ...base, level: 0.96 }, is('low')) > 0.9);
  assert.ok(share({ ...base, prevLevel: 0.96 }, is('flood')) > 0.9);
  // a storm just past: named for it, or for the calm after it
  assert.ok(share({ ...base, dT: 3, events: ['storm'] }, is('calm')) > 0.9);
  // a genus holding the pool
  const life = { living: 1000, species: 10, guilds: { producer: 0.9, grazer: 0.05, scavenger: 0.03, predator: 0.02 }, moves: {}, genus: ['Quesku', 0.8], top: {} };
  assert.ok(share({ ...base, dT: 3, life }, (th) => th?.theme === 'reign' || th?.theme === 'stage') > 0.9);
  let quesku = 0;
  for (let i = 0; i < 100; i++) { const r = lcg(i + 7); if (/Quesk/.test(nameEra({ ...base, dT: 3, life }, [r(), r()], eraMemo()))) quesku++; }
  assert.ok(quesku > 90, `${quesku}`);
  // hunters gaining
  const hunt = { ...life, guilds: { producer: 0.6, grazer: 0.1, scavenger: 0.05, predator: 0.25 }, genus: ['Quesku', 0.2], top: { predator: 'Vrouth' } };
  assert.ok(share({ ...base, dT: 3, life: hunt }, is('hunt')) > 0.8);
  // an unremarkable era is named from the quiet ones
  assert.deepEqual(eraThemes({ ...base, dT: 3 }).filter(([, s]) => s >= 0.45), []);
  assert.ok(share({ ...base, dT: 3 }, is('calm', 'shift', 'stage')) > 0.95);
});

test('a kind of era that returns is counted, and a quiet stage runs on into its late part', () => {
  const base = { dT: 9, temp: 26, light: 0.2, prevLight: 0.2, level: 1, prevLevel: 1, excursion: 0, events: [], life: null };
  const memo = eraMemo(), names = [];
  for (let i = 0; i < 40; i++) {
    const r = lcg(100 + i);
    names.push(nameEra(i % 2 ? base : { ...base, dT: -9, temp: 6 }, [r(), r()], memo, new Set(names)));
  }
  // counted by its own word: a Second only after the first, a Third after the Second
  for (const n of names) {
    const e = parseEra(n);
    if (e.p !== 'ordinal') continue;
    const k = ORDINAL.indexOf(e.nth), before = names.slice(0, names.indexOf(n));
    assert.ok(before.includes(k ? `The ${ORDINAL[k - 1]} ${e.noun}` : `The ${e.noun}`), `${n} after ${before.join(', ')}`);
  }
  assert.ok(names.some((n) => /^The (Second|Third) /.test(n)), names.join(', '));
  const quiet = { ...base, dT: 3, temp: 16 }, m2 = eraMemo(), seen = [];
  for (let i = 0; i < 400; i++) { const r = lcg(900 + i); seen.push(nameEra(quiet, [r(), r()], m2, new Set(seen.slice(-500)))); }
  const late = seen.findIndex((n) => n.startsWith('Late '));
  assert.ok(late > 0 && seen[late - 1] === `The ${seen[late].slice(5)}`, seen.slice(Math.max(0, late - 2), late + 1).join(', '));
});
