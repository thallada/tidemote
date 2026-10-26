import test from 'node:test';
import assert from 'node:assert/strict';
import { createChronicler, watchMap, durWords, shareWords, fitOf, firstsOf, TUNE } from '../src/chronicler.js';
import { archetypeGenome, finalizeGenome, dietGuild } from '../src/genome.js';
import { MAXK, FIRST_LIFE, SPL_WORDS, SPL_WATCH, SPL_CAUSE, SPL_CAUSES, SPL_PAIR, SPL_RANGE, DEFAULT_K } from '../src/shaders.js';
import { pack, unpack } from '../src/worlds.js';
import { earned } from '../src/achievements.js';

const NC = SPL_CAUSES.length;
const C = Object.fromEntries(SPL_CAUSES.map((k, i) => [k, i]));
const rng = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

// A fake world as the page sees it: a registry, slots, and a species ledger the test writes.
function world(seed = 1) {
  const r = rng(seed);
  const reg = new Map(), slotSerial = new Uint32Array(MAXK), spl = new Uint32Array(SPL_WORDS);
  let serial = 100, slot = FIRST_LIFE;
  const w = {
    reg, spl, slotSerial, t: 0, now: 0, events: [], range: new Map(),
    add(type, { genus = 'Gen', pop = 200, born = 0, ancestor = null, mut = null } = {}) {
      const g = finalizeGenome(archetypeGenome(type, r), DEFAULT_K);
      if (mut) mut(g);
      g.serial = ++serial; g.slot = slot++; g.born = born;
      const sp = { serial: g.serial, slot: g.slot, genome: g, genus, name: `${genus} ${type}${g.serial}`, pop, peak: pop, alive: true, established: true,
        establishedAt: born, born, ancestor, founder: !ancestor, extinct: null };
      reg.set(sp.serial, sp);
      slotSerial[sp.slot] = sp.serial;
      return sp;
    },
    set(sp, pop) { sp.pop = pop; sp.peak = Math.max(sp.peak, pop); if (pop === 0 && sp.alive) { sp.alive = false; sp.extinct = w.t; } },
    cause(sp, c, n) { spl[SPL_CAUSE + sp.slot * NC + C[c]] += n; },
    // tries and meals of h on q, by their watched indices (the chronicler's watch list)
    meal(ch, h, q, tries, meals) {
      const s = ch.watch().serials, a = s.indexOf(h.serial), b = s.indexOf(q.serial);
      if (a < 0 || b < 0) return;
      const o = SPL_PAIR + (a * SPL_WATCH + b) * 2;
      spl[o] += tries; spl[o + 1] += meals;
    },
    // where a species is: its cells at x, y (0..1), spread s (0 tight .. 1 everywhere)
    place(sp, x, y, s = 0.1) { w.range.set(sp.serial, [x, y, s]); },
    obs(extra = {}) {
      spl[0] = 0;
      spl.fill(0, SPL_RANGE);
      for (const sp of reg.values()) {
        const at = w.range.get(sp.serial);
        if (!sp.alive || !at) continue;
        const o = SPL_RANGE + sp.slot * 5, n = 200, R = 1 - at[2];
        const put = (i, a) => { spl[o + i] = Math.round((R * Math.cos(a) + 1) * 127 * n); spl[o + i + 1] = Math.round((R * Math.sin(a) + 1) * 127 * n); };
        put(0, at[0] * 2 * Math.PI); put(2, at[1] * 2 * Math.PI); spl[o + 4] = n;
      }
      return { t: w.t, now: w.now, reg, living: [...reg.values()].reduce((a, sp) => a + (sp.alive ? sp.pop : 0), 0), est: 30, founders: 24,
        slotSerial, spl: w.splOn === false ? null : spl, temp: 19, light: 0.25, world: [256, 144], stone: 1000, count: 65536, era: 'The First Tides', ...extra };
    },
  };
  return w;
}
// run the world forward: each step dt sim seconds and 1 s real; step(w, i) changes it; collects stories
function run(ch, w, steps, dt, step, extra) {
  const told = [];
  for (let i = 0; i < steps; i++) {
    w.t += dt; w.now += 1000;
    step?.(w, i);
    const o = w.obs(extra?.(w, i));
    o.spl[0] = ch.watch().version;
    for (const s of ch.observe(o)) told.push({ ...s, t: w.t, now: w.now });
  }
  return told;
}

test('words for durations and shares', () => {
  assert.equal(durWords(30), '30 seconds');
  assert.equal(durWords(12 * 60), '12 minutes');
  assert.equal(durWords(3600 + 5 * 60), 'an hour 5 minutes');
  assert.equal(durWords(2 * 3600), '2 hours');
  assert.equal(shareWords(0.95), 'nearly all');
  assert.equal(shareWords(0.5), 'half');
});

test('fit follows the receptors: a quarry wearing the hunter’s receptors fits, its opposite does not', () => {
  const r = rng(4);
  const h = finalizeGenome(archetypeGenome('hunter', r));
  const like = structuredClone(h), unlike = structuredClone(h);
  for (let k = 0; k < 8; k++) { like.roles[0].surf[k] = h.roles[0].rec[k]; unlike.roles[0].surf[k] = -h.roles[0].rec[k]; }
  for (const x of [like, unlike]) for (let ro = 1; ro < 3; ro++) for (let k = 0; k < 8; k++) x.roles[ro].rec[k] = h.roles[ro].rec[k];
  const hh = { ...h, roles: h.roles.map((ro) => ({ ...ro, rec: h.roles[0].rec })) };
  assert.ok(fitOf(hh, like) > fitOf(hh, unlike));
});

test('firsts name what a genome brings', () => {
  const g = finalizeGenome(archetypeGenome('hunter', rng(2)));
  assert.ok(firstsOf(g).some(([k]) => k === `guild:${dietGuild(g)}`));
});

test('the watch list keeps each species at its index and the map follows the slots', () => {
  const ch = createChronicler();
  const w = world();
  const a = w.add('grazer', { pop: 500 }), b = w.add('hunter', { pop: 100 });
  run(ch, w, 2, 10);
  const W = ch.watch();
  const ia = W.serials.indexOf(a.serial), ib = W.serials.indexOf(b.serial);
  assert.ok(ia >= 0 && ib >= 0);
  const v = W.version;
  const c = w.add('plankton', { pop: 50 });
  run(ch, w, 1, 10);
  assert.equal(ch.watch().serials.indexOf(a.serial), ia, 'a keeps its index');
  assert.ok(ch.watch().version !== v && ch.watch().serials.includes(c.serial));
  const map = watchMap(ch.watch(), w.reg);
  assert.equal(map[a.slot], ia + 1);
  assert.equal(map[c.slot], ch.watch().serials.indexOf(c.serial) + 1);
});

test('a steady world goes unremarked', () => {
  const ch = createChronicler();
  const w = world(3);
  const sp = ['plankton', 'plankton', 'grazer', 'grazer', 'hunter', 'scavenger'].map((t, i) => w.add(t, { genus: `G${i}`, pop: 400 + 50 * i }));
  const r = rng(9);
  const told = run(ch, w, 600, 10, (w2) => {
    for (const s of sp) { w2.set(s, Math.round(s.peak * (0.9 + 0.1 * r()))); w2.cause(s, 'born', 20); w2.cause(s, 'old', 20); }
  });
  assert.ok(told.length <= 2, `a quiet world told ${told.length}: ${told.map((x) => x.text).join(' | ')}`);
});

test('a hunted species gets a post-mortem naming its hunter', () => {
  const ch = createChronicler();
  const w = world(5);
  const prey = w.add('grazer', { genus: 'Thax', pop: 3000 });
  const hunter = w.add('hunter', { genus: 'Vorath', pop: 400 });
  w.add('plankton', { genus: 'Mo', pop: 4000 });
  w.add('grazer', { genus: 'Dru', pop: 2000 });
  run(ch, w, 120, 10); // twenty quiet minutes
  // then hunted down over eight minutes
  let pop = 3000;
  const told = run(ch, w, 80, 10, (w2, i) => {
    const eaten = i < 48 ? Math.ceil(pop * 0.12) : pop;
    pop = Math.max(0, pop - eaten);
    w2.cause(prey, 'eaten', eaten);
    w2.meal(ch, hunter, prey, eaten * 3, eaten);
    w2.set(prey, pop);
  });
  const obit = told.find((s) => s.kind === 'obit');
  assert.ok(obit, `an obituary: ${told.map((x) => x.text).join(' | ')}`);
  assert.match(obit.text, new RegExp(`${prey.name} is no more`));
  assert.match(obit.text, new RegExp(`hunted down by ${hunter.name}`));
});

test('the last hunter’s death is told at once', () => {
  const ch = createChronicler();
  const w = world(6);
  w.add('plankton', { genus: 'Mo', pop: 4000 });
  w.add('grazer', { genus: 'Thax', pop: 2000 });
  const h = w.add('hunter', { genus: 'Vorath', pop: 300 });
  run(ch, w, 60, 10);
  const told = run(ch, w, 3, 10, (w2, i) => { if (i === 1) w2.set(h, 0); });
  const g = told.find((s) => s.kind === 'guild');
  assert.ok(g, told.map((x) => x.text).join(' | '));
  assert.match(g.text, /last hunter is gone/);
  assert.match(g.text, new RegExp(h.name));
});

test('life failing and returning are told apart, and earn their achievements', () => {
  const ch = createChronicler();
  const w = world(9);
  const a = w.add('plankton', { genus: 'Mo', pop: 3000 });
  const b = w.add('grazer', { genus: 'Thax', pop: 1000 });
  run(ch, w, 60, 10);
  const fell = run(ch, w, 3, 10, (w2, i) => { if (i === 0) { w2.set(a, 40); w2.set(b, 10); } });
  const down = fell.find((s) => s.kind === 'collapse');
  assert.ok(down, fell.map((x) => x.text).join(' | '));
  assert.equal(down.moment, undefined);
  assert.deepEqual(earned(down), ['COLLAPSE']);
  const rose = run(ch, w, 40, 10, (w2, i) => { if (i === 0) w2.set(a, 2000); });
  const up = rose.find((s) => s.kind === 'collapse');
  assert.ok(up, rose.map((x) => x.text).join(' | '));
  assert.equal(up.moment, 'back');
  assert.deepEqual(earned(up), ['RETURN']);
});

test('an arms race: the prey genus slips the hunters’ receptors', () => {
  const ch = createChronicler();
  const w = world(7);
  const hunter = w.add('hunter', { genus: 'Vorath', pop: 500 });
  // the hunter's receptors, and a prey that wears them (caught), then a descendant that wears their opposite
  const rec = hunter.genome.roles.map((r) => r.rec);
  const old = w.add('grazer', { genus: 'Thax', pop: 1500, mut: (g) => { for (let k = 0; k < 8; k++) g.roles[0].surf[k] = rec[0][k]; } });
  const fresh = w.add('grazer', { genus: 'Thax', pop: 1500, ancestor: old.serial, mut: (g) => { for (let k = 0; k < 8; k++) g.roles[0].surf[k] = -rec[0][k]; } });
  w.add('plankton', { genus: 'Mo', pop: 5000 });
  assert.ok(fitOf(hunter.genome, old.genome) > fitOf(hunter.genome, fresh.genome) + 0.3, 'the setup fits as intended');
  // the hunters meet the older species for 25 minutes, then the newer one
  const told = run(ch, w, 300, 10, (w2, i) => {
    const late = i > 150;
    w2.meal(ch, hunter, late ? fresh : old, 40, late ? 4 : 16);
  });
  const arms = told.find((s) => s.kind === 'arms');
  assert.ok(arms, told.map((x) => x.text).join(' | '));
  assert.match(arms.text, /slipping from the grasp/);
});

test('hunter and hunted in a cycle', () => {
  const ch = createChronicler();
  const w = world(8);
  const prey = w.add('grazer', { genus: 'Thax', pop: 2000 });
  const hunter = w.add('hunter', { genus: 'Vorath', pop: 200 });
  w.add('plankton', { genus: 'Mo', pop: 6000 });
  const period = 15 * 60, lag = 4 * 60;
  const told = run(ch, w, 600, 10, (w2) => {
    const ph = (2 * Math.PI * w2.t) / period;
    w2.set(prey, Math.round(2000 + 1500 * Math.sin(ph)));
    w2.set(hunter, Math.round(300 + 250 * Math.sin(ph - (2 * Math.PI * lag) / period)));
    w2.meal(ch, hunter, prey, 30, 10);
  });
  const cyc = told.find((s) => s.kind === 'cycle');
  assert.ok(cyc, told.map((x) => x.text).join(' | '));
  assert.match(cyc.text, /bound together as hunter and hunted/);
});

test('an event’s aftermath names who slept through it and who was lost', () => {
  const ch = createChronicler();
  const w = world(10);
  const sleeper = w.add('grazer', { genus: 'Thax', pop: 1500 });
  const victim = w.add('crawler', { genus: 'Kel', pop: 1200 });
  w.add('plankton', { genus: 'Mo', pop: 6000 });
  run(ch, w, 60, 10);
  const note = (phase) => ch.note('event', { t: w.t, type: 'drought', phase, reg: w.reg, living: 8700 });
  note('drying');
  let vpop = 1200;
  run(ch, w, 30, 10, (w2) => {
    w2.cause(sleeper, 'cyst', 60); w2.cause(sleeper, 'woke', 20);
    vpop = Math.max(0, vpop - 60); w2.cause(victim, 'stranded', 60); w2.set(victim, vpop);
  });
  note(null);
  const told = run(ch, w, 30, 10);
  const after = told.find((s) => s.kind === 'aftermath');
  assert.ok(after, told.map((x) => x.text).join(' | '));
  assert.match(after.text, new RegExp(`^The drought is past\\. ${sleeper.name} lay sleeping as cysts`));
  assert.match(after.text, new RegExp(`${victim.name} did not live to see it end`));
});

test('the budget keeps a turbulent world from flooding the log', () => {
  const ch = createChronicler();
  const w = world(11);
  const r = rng(12);
  const list = [];
  for (let i = 0; i < 40; i++) list.push(w.add(['plankton', 'grazer', 'hunter', 'crawler'][i % 4], { genus: `G${i % 9}`, pop: 300 + Math.round(r() * 3000) }));
  // every few minutes a species crashes, booms or dies, and new ones arise
  let k = 0;
  const told = run(ch, w, 720, 10, (w2, i) => {
    for (const sp of list) if (sp.alive) {
      const f = r() < 0.02 ? 0.1 : r() < 0.02 ? 6 : 0.95 + 0.1 * r();
      w2.set(sp, Math.max(0, Math.round(sp.pop * f)));
      w2.cause(sp, f < 1 ? 'starved' : 'born', 50);
    }
    if (i % 12 === 0) list.push(w2.add(['plankton', 'grazer', 'hunter'][k++ % 3], { genus: `G${k % 9}`, pop: 200, born: w2.t, ancestor: list[k % list.length].serial }));
  }, () => ({}));
  const hours = (720 * 10) / 3600;
  assert.ok(told.length >= 3, `something was told (${told.length})`);
  assert.ok(told.length <= hours * (3600 / TUNE.storyEvery) + TUNE.storyCap + 2, `at most the budget: ${told.length} in ${hours} h`);
  for (let i = 1; i < told.length; i++) {
    assert.ok(told[i].t - told[i - 1].t >= TUNE.gapSim, 'spaced in simulated time');
    assert.ok(told[i].now - told[i - 1].now >= TUNE.gapReal, 'spaced in real time');
  }
});

test('at high speed the real-time gap holds', () => {
  const ch = createChronicler();
  const w = world(13);
  const r = rng(14);
  const list = [];
  for (let i = 0; i < 30; i++) list.push(w.add(['plankton', 'grazer', 'hunter'][i % 3], { genus: `G${i % 7}`, pop: 500 + Math.round(r() * 2000) }));
  // 64x: each real second covers 64 simulated seconds
  const told = run(ch, w, 300, 64, () => {
    for (const sp of list) if (sp.alive) w.set(sp, Math.max(0, Math.round(sp.pop * (r() < 0.05 ? 0.05 : r() < 0.03 ? 8 : 1))));
  });
  for (let i = 1; i < told.length; i++) assert.ok(told[i].now - told[i - 1].now >= TUNE.gapReal);
  assert.ok(told.length <= 300 / (TUNE.gapReal / 1000) + 1);
});

test('the chronicler’s memory survives a save', () => {
  const ch = createChronicler();
  const w = world(15);
  const a = w.add('grazer', { pop: 900 });
  w.add('hunter', { pop: 100 });
  run(ch, w, 80, 10);
  const saved = unpack(pack(ch.save()));
  const ch2 = createChronicler();
  ch2.load(saved);
  const told = run(ch2, w, 10, 10, (w2) => w2.set(a, a.pop));
  assert.ok(Array.isArray(told));
  assert.ok(ch2.watch().version > 0);
});
