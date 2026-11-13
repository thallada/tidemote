import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOBS, decide, costOf, scaleLoss, adaptation, COMP_GUESS, judge, LATE } from '../src/tuner.js';

const ladder = [1, 0.85, 0.7, 0.6, 0.5, 0.42, 0.35, 0.25];
const all = (over = {}) => ({
  sea: { level: 3, auto: true, cost: null }, bloom: { level: 1, auto: true, cost: null },
  specks: { level: 1, auto: true, cost: null }, stone: { level: 2, auto: true, cost: null },
  neighbors: { level: 2, auto: true, cost: 2, rel: [0.97, 0.98, 1] }, ...over,
});
const base = (o = {}) => ({ behind: true, T: 16.7, gpu: 20, draw: 9, knobs: all(), scale: { cur: 1, ladder, floor: 0.5, auto: true }, ...o });

test('every knob runs from cheapest to best, with a loss for each step', () => {
  for (const [id, k] of Object.entries(KNOBS)) {
    assert.equal(k.loss.length, k.levels.length - 1, id);
    // a step up never keeps less of the top level's cost than the step below it
    const top = k.levels.at(-1);
    for (let i = 1; i < k.levels.length; i++) assert.ok(k.share(top, k.levels[i], {}) >= k.share(top, k.levels[i - 1], {}), `${id} ${i}`);
    assert.equal(k.share(top, top), 1, id);
  }
});

test('costOf sums each knob\'s passes', () => {
  const c = costOf([['seaSpectrum+fftRows+fftCols', 2.5], ['seaShiftMap', 0.15], ['fsDown', 0.2], ['fsUp', 0.1], ['fsComposite', 3], ['fsStone+fsStone edge', 0.3]]);
  assert.ok(Math.abs(c.sea - 2.65) < 1e-9);
  assert.ok(Math.abs(c.bloom - 0.3) < 1e-9);
  assert.equal(c.specks, 0);
  assert.ok(Math.abs(c.stone - 0.3) < 1e-9);
});

test('costOf counts a fresh sea\'s pass and the stone cache\'s relighting, not the stone lit every frame', () => {
  const c = costOf([['seaInit+seaSpectrum+fftRows', 3], ['fsStone', 0.1], ['fsStone+fsStone edge', 0.2], ['fsStoneCache', 0.05],
    ['fsStoneLit', 1], ['fsStoneLitScene', 1], ['fsStoneLitMicro', 1]]);
  assert.equal(c.sea, 3);
  assert.ok(Math.abs(c.stone - 0.35) < 1e-9);
});

test('behind on a phone, where the sea is dear, the sea is turned less often before the resolution falls', () => {
  const s = base({ knobs: all({ sea: { level: 3, auto: true, cost: 2.6 }, bloom: { level: 1, auto: true, cost: 0.3 } }) });
  assert.deepEqual(decide(s), { id: 'sea', to: 2 });
});

test('behind on a desktop, where the dressing costs next to nothing, the resolution falls first', () => {
  const s = base({ draw: 6, knobs: all({ sea: { level: 3, auto: true, cost: 0.03 }, bloom: { level: 1, auto: true, cost: 0.05 }, specks: { level: 1, auto: true, cost: 0.01 }, stone: { level: 2, auto: true, cost: 0.02 } }) });
  assert.deepEqual(decide(s), { id: 'scale', to: 0.85 });
});

test('a knob the viewer fixed is never moved, nor one already at its floor', () => {
  const s = base({ knobs: all({ sea: { level: 3, auto: false, cost: 2.6 }, bloom: { level: 0, auto: true, cost: 0 } }), scale: { cur: 0.5, ladder, floor: 0.5, auto: true } });
  const d = decide(s);
  assert.ok(d && d.id !== 'sea' && d.id !== 'bloom' && d.id !== 'scale', JSON.stringify(d));
  assert.equal(decide({ ...s, knobs: { sea: s.knobs.sea } }), null);
});

test('with room, what is won back must fit in ROOM of the frame', () => {
  const s = base({ behind: false, gpu: 8, knobs: all({ sea: { level: 1, auto: true, cost: 0.65 } }) });
  assert.deepEqual(decide(s), { id: 'sea', to: 2 });
  // no room for any of it: nothing is raised (though a cheaper step may be given up to pay for one, a rebalance)
  const d = decide({ ...s, gpu: 14.0, draw: 30, scale: { cur: 0.7, ladder, floor: 0.5, auto: true } });
  assert.ok(d === null || (d.rebalance && d.to < s.knobs[d.id].level), JSON.stringify(d));
});

test('a knob held after a failed climb is not raised again', () => {
  const s = base({ behind: false, gpu: 6, knobs: { sea: { level: 1, auto: true, cost: 0.65 } }, scale: { cur: 1, ladder, floor: 0.5, auto: true }, held: { sea: true } });
  assert.equal(decide(s), null);
});

test('the heat haze and the microscope keep the old finish ladder\'s costs: the haze 12% of the composite, the microscope the rest down to plain', () => {
  // (both on, as the old full finish; the haze alone off as its still one, both off as its plain one)
  assert.ok(Math.abs(KNOBS.haze.share(true, false, { other: 1 }) - 0.88) < 1e-9);
  assert.ok(Math.abs(KNOBS.microscope.share(true, false, { other: 0 }) - 0.45 / 0.88) < 1e-9);
  assert.ok(Math.abs(KNOBS.haze.share(true, false, { other: 1 }) * KNOBS.microscope.share(true, false, { other: 0 }) - 0.45) < 1e-9);
  // learned on the device: the composite in each state, against both on
  const rel = [0.3, 0.4, 0.9, 1];
  assert.ok(Math.abs(KNOBS.haze.share(true, false, { rel, other: 1 }) - 0.9) < 1e-9);
  assert.ok(Math.abs(KNOBS.microscope.share(true, false, { rel, other: 0 }) - 0.3 / 0.9) < 1e-9);
  assert.equal(COMP_GUESS.length, 4);
});

test('behind, the haze goes long before the microscope; with room, the microscope comes back first (the old finish\'s order)', () => {
  const off = { sea: { level: 0, auto: true, cost: 0 }, bloom: { level: 0, auto: true, cost: 0 }, specks: { level: 0, auto: true, cost: 0 }, stone: { level: 0, auto: true, cost: 0 } };
  const comp = (h, m) => ({ haze: { level: h, auto: true, cost: 2 * COMP_GUESS[h + 2 * m], other: m }, microscope: { level: m, auto: true, cost: 2 * COMP_GUESS[h + 2 * m], other: h } });
  const pin = { scale: { cur: 0.5, ladder, floor: 0.5, auto: true } };
  assert.deepEqual(decide(base({ ...pin, knobs: all({ ...off, ...comp(1, 1) }) })), { id: 'haze', to: 0 });
  assert.deepEqual(decide(base({ ...pin, knobs: all({ ...off, ...comp(0, 1) }) })), { id: 'microscope', to: 0 });
  assert.deepEqual(decide(base({ behind: false, gpu: 6, knobs: all(comp(0, 0)), scale: { cur: 1, ladder, floor: 0.5, auto: true } })), { id: 'microscope', to: 1 });
  // a microscope the viewer has off (not free to move) is never counted as saving anything
  assert.deepEqual(decide(base({ ...pin, knobs: { microscope: { ...comp(0, 1).microscope, auto: false } } })), null);
});

test('adaptation: every setting, what is eased of what the viewer shows and leaves on Auto', () => {
  const top = Object.fromEntries(Object.entries(KNOBS).map(([id, k]) => [id, k.levels.length - 1]));
  const held = (...a) => adaptation(...a).filter((r) => r[2] === 'held').map(([id, v]) => [id, v]);
  const auto = { scale: { v: 1, auto: true }, fps: { v: 60, auto: true, slow: 1 } };
  // every knob in KNOBS' order, then the render scale and the frame rate, all at their best
  assert.deepEqual(adaptation(top, auto).map(([id, , s]) => `${id}:${s}`), [...Object.keys(KNOBS), 'scale', 'fps'].map((id) => `${id}:best`));
  assert.deepEqual(held(top), []);
  assert.deepEqual(held({ ...top, sea: 2, bloom: 0, microscope: 0 }, { scale: { v: 0.7, auto: true }, fps: { v: 30, auto: true, slow: 2 } }), [['sea', 2], ['bloom', 0], ['microscope', 0], ['scale', 0.7], ['fps', 30]]);
  // an effect the viewer has off is never said to be held back, whatever its knob's level
  assert.deepEqual(held({ ...top, bloom: 0, haze: 0 }, { shown: { bloom: false, haze: false } }), []);
  assert.equal(adaptation({ ...top, bloom: 0 }, { shown: { bloom: false } })[1][2], 'off');
  // a value the viewer chose (a knob, a render scale, a frame rate) is theirs, not held back
  const mine = adaptation({ ...top, bloom: 0 }, { fixed: { bloom: true }, scale: { v: 0.5, auto: false }, fps: { v: 30, auto: false, slow: 1 } });
  assert.deepEqual(mine.filter((r) => r[2] === 'fixed').map((r) => r[0]), ['bloom', 'scale', 'fps']);
  assert.deepEqual(held({ ...top, neighbors: 1 }), [['neighbors', 1]]);
});

test('render scale costs the eye more the further it falls', () => {
  assert.ok(scaleLoss(0.7, 0.6) > scaleLoss(1, 0.85) * (0.1 / 0.15));
  assert.ok(scaleLoss(0.5, 0.42) > scaleLoss(0.85, 0.7) * (0.08 / 0.15));
});

test('with no room to climb, a cheap step is given up to pay for a dearer one worth more (the sea for resolution on a phone)', () => {
  // a phone at half scale with the sea turned every frame: 14.5 ms of 16.7, too little room for the scale back
  const s = base({ behind: false, gpu: 14.5, draw: 3, knobs: all({ sea: { level: 3, auto: true, cost: 2.6 }, bloom: { level: 1, auto: true, cost: 0.3 }, specks: { level: 1, auto: true, cost: 0 }, stone: { level: 2, auto: true, cost: 0.2 } }), scale: { cur: 0.5, ladder, floor: 0.35, auto: true } });
  const d = decide(s);
  assert.equal(d.rebalance, true);
  assert.equal(d.id, 'sea');
  // and once the sea is half as often, the scale climbs (room now), not the sea back
  const after = decide({ ...s, gpu: 9.5, knobs: { ...s.knobs, sea: { level: 2, auto: true, cost: 1.3 } } });
  assert.deepEqual(after, { id: 'scale', to: 0.6 });
});

test('no rebalance when nothing given up would pay for the climb', () => {
  const s = base({ behind: false, gpu: 15, draw: 9, knobs: all({ sea: { level: 0, auto: true, cost: 0 }, bloom: { level: 0, auto: true, cost: 0 }, specks: { level: 0, auto: true, cost: 0 }, stone: { level: 0, auto: true, cost: 0 } }), scale: { cur: 0.7, ladder, floor: 0.5, auto: true } });
  assert.equal(decide(s), null);
});

test('the neighbors are given up only where they pay much: a Pixel 3, not a Pixel 11', () => {
  const common = { draw: 5, scale: { cur: 0.5, ladder, floor: 0.5, auto: true } };
  // a Pixel 3: its step 52 ms, 88 neighbors 40% less; the dressing already down
  const p3 = decide(base({ ...common, gpu: 60, knobs: all({ sea: { level: 0, auto: true, cost: 0 }, bloom: { level: 0, auto: true, cost: 0 }, specks: { level: 0, auto: true, cost: 0 }, stone: { level: 0, auto: true, cost: 0 }, neighbors: { level: 2, auto: true, cost: 52, rel: [null, 0.6, 1] } }) }));
  assert.deepEqual(p3, { id: 'neighbors', to: 1 });
  // a Pixel 11: its step 8 ms, 88 neighbors 2% less: the sea goes first, and the neighbors never pay
  const p11 = base({ ...common, gpu: 18, knobs: all({ sea: { level: 3, auto: true, cost: 2.6 }, neighbors: { level: 2, auto: true, cost: 8, rel: [0.97, 0.98, 1] } }) });
  assert.equal(decide(p11).id, 'sea');
});

// The tuner run window after window against devices modeled from measurements (ms at full scale, every knob best),
// with adaptQuality's essentials: frames judged by their intervals (judge: two windows late in a row; a frame comes
// when the GPU has done the last, at the rate aimed for at best); the frame rate halved first when the step is more
// than twice the drawing; climbs after three windows on time, by the GPU's time where it fits and tried anyway once no
// frame has been late for the hold (30 s, twice as long after each climb that failed); a climb frames slip after taken
// back. A device that slows its clock to its work (dvfs: Apple's) measures its GPU busy for most of the frame
// whatever it has to spare. It must settle, its frames on time. from: a run to carry on from (its knobs and scale).
function simulate(dev, windows = 400, from = null) {
  const T0 = 1000 / 60, top = (id) => KNOBS[id].levels.length - 1;
  const lv = from ? { ...from.lv } : Object.fromEntries(Object.keys(dev.knobs).map((id) => [id, top(id)]));
  let scale = from?.scale ?? 1, slow = 1, w = { late: 0, good: 0 }, raised = null, raisedAt = -99, hold = 0, ceilingUntil = 0;
  const held = {};
  // (the haze and the microscope share one cost, the composite's in the state the two leave it, per pixel)
  const COMP = ['haze', 'microscope'], compCost = () => dev.comp.full * dev.comp.rel[lv.haze + 2 * lv.microscope];
  const levelCost = (id) => {
    const k = dev.knobs[id], def = KNOBS[id];
    return COMP.includes(id) ? compCost() : k.full * def.share(def.levels[top(id)], def.levels[lv[id]], k);
  };
  const frame = () => {
    const ticks = 1 + 0.45 * (slow - 1);
    const step = (dev.step + (lv.neighbors != null ? levelCost('neighbors') - dev.knobs.neighbors.full : 0)) * ticks;
    const draw = dev.draw * scale * scale;
    let fx = compCost() * scale * scale;
    for (const id of Object.keys(dev.knobs)) if (id !== 'neighbors' && !COMP.includes(id)) fx += levelCost(id) * (dev.knobs[id].px ? scale * scale : 1);
    return { step, draw: draw + fx, gpu: step + draw + fx };
  };
  const apply = (d) => { if (d.id === 'scale') scale = d.to; else lv[d.id] = d.to; };
  const trail = [];
  for (let i = 0; i < windows; i++) {
    const T = T0 * slow, f = frame(), gpu = dev.dvfs ? Math.max(f.gpu, 0.97 * T) : f.gpu;
    const climbed = raised != null && i - raisedAt <= 2;
    const j = judge(w, [Math.max(T, f.gpu)], T, { climbed, waited: f.gpu > T ? 1 : 0 });
    w = { late: j.late, good: j.good };
    const knobs = Object.fromEntries(Object.keys(dev.knobs).map((id) => [id, { level: lv[id], auto: true, cost: levelCost(id), ...dev.knobs[id] }]));
    knobs.haze = { ...knobs.haze, rel: dev.comp.rel, other: lv.microscope };
    knobs.microscope = { ...knobs.microscope, rel: dev.comp.rel, other: lv.haze };
    const heldNow = Object.fromEntries(Object.entries(held).map(([id, until]) => [id, i < until]));
    const s = { T, gpu, draw: f.draw, knobs, scale: { cur: scale, ladder, floor: dev.floor ?? 0.5, auto: true } };
    let acted = '';
    if (j.behind) {
      hold = i - raisedAt <= 2 ? Math.min(120, (hold || 15) * 2) : 15;
      ceilingUntil = i + hold;
      if (climbed) {
        if (raised === 'scale') scale = ladder.find((v) => v < scale - 1e-3); else lv[raised]--;
        held[raised] = i + hold; raised = null; acted = 'back';
      } else if (f.step > 2 * f.draw && slow < 4) { slow++; acted = 'slow'; }
      else {
        const d = decide({ ...s, behind: true, held: heldNow });
        if (d) { apply(d); acted = d.id; } else if (slow < 4) { slow++; acted = 'slow'; }
      }
    } else if (j.room) {
      const faster = (T0 * (slow - 1)), cost = (m) => 1 + 0.45 * (m - 1);
      if (slow > 1) { if (f.draw + (f.step / cost(slow)) * cost(slow - 1) < 0.75 * faster) { slow--; w.good = 0; raisedAt = i; acted = 'fast'; } }
      else {
        const d = decide({ ...s, behind: false, held: { ...heldNow, scale: i < ceilingUntil }, probe: i >= ceilingUntil });
        if (d) { apply(d); w.good = 0; raised = d.rebalance ? null : d.id; raisedAt = i; acted = d.probe ? `${d.id}?` : d.id; }
      }
    }
    trail.push({ acted, gpu: f.gpu, T, scale, slow, ...lv });
  }
  return { lv, scale, slow, trail, gpu: frame().gpu, T: T0 * slow };
}
// measured (docs/performance.md, runs/phone): a Pixel 3 in an 8k world, a Pixel 11 Pro in a 16k one, an RTX 4070 Ti
// in a 1M one, an M1 in a 32k one (draw: the drawing at full scale less the knobs; px: a knob's cost follows the
// pixels; comp: the composite at full scale with the haze and the microscope on, and in each state of the two,
// haze + 2 × microscope)
const COMP_REL = [0.45, 0.57, 0.88, 1];
const DEVICES = {
  pixel3: { step: 20, draw: 12, floor: 0.5, comp: { full: 30, rel: COMP_REL }, knobs: { sea: { full: 5 }, bloom: { full: 0.6, px: true }, specks: { full: 0.2 }, stone: { full: 0.2 }, haze: {}, microscope: {}, interiors: { full: 0 }, neighbors: { full: 20, rel: [0.45, 0.6, 1] } } },
  pixel11: { step: 8, draw: 5, comp: { full: 2.5, rel: COMP_REL }, knobs: { sea: { full: 2.6 }, bloom: { full: 0.3, px: true }, specks: { full: 0.05 }, stone: { full: 0.1 }, haze: {}, microscope: {}, interiors: { full: 0 }, neighbors: { full: 8, rel: [0.97, 0.98, 1] } } },
  rtx: { step: 3.4, draw: 2.5, comp: { full: 0.8, rel: COMP_REL }, knobs: { sea: { full: 0.03 }, bloom: { full: 0.07, px: true }, specks: { full: 0.08 }, stone: { full: 0.1 }, haze: {}, microscope: {}, interiors: { full: 0 }, neighbors: { full: 3.4, rel: [0.97, 0.98, 1] } } },
  m1: { dvfs: true, step: 2.5, draw: 5, comp: { full: 3.6, rel: COMP_REL }, knobs: { sea: { full: 0.8 }, bloom: { full: 0.6, px: true }, specks: { full: 0.1 }, stone: { full: 0.2 }, haze: {}, microscope: {}, interiors: { full: 0 }, neighbors: { full: 2.5, rel: [0.9, 0.95, 1] } } },
};
const atBest = (r) => r.scale === 1 && r.slow === 1 && Object.entries(r.lv).every(([id, l]) => l === KNOBS[id].levels.length - 1);
const moved = (r) => r.trail.map((t, i) => (t.acted ? `${i}:${t.acted}` : '')).filter(Boolean).join(' ');
for (const [name, dev] of Object.entries(DEVICES)) {
  test(`the tuner settles on a ${name}, its frames on time`, () => {
    const r = simulate(dev);
    // settled: at most a step up tried and taken back now and then (every 240 s at most, once climbs keep failing)
    const moves = r.trail.slice(-200).filter((t) => t.acted).map((t) => t.acted);
    assert.ok(moves.every((a) => a === 'back' || a.endsWith('?')) && moves.length <= 4, `${name} still moving: ${moved(r)}`);
    assert.ok(r.gpu <= LATE * r.T, `${name}: ${r.gpu.toFixed(1)} ms of ${r.T.toFixed(1)}`);
    // a device with room, whatever its GPU's time says (the M1's fills the frame), gives up nothing
    if (name === 'rtx' || name === 'm1') assert.ok(atBest(r) && !moved(r), `${name}: ${moved(r)}`);
    if (process.env.TUNER_TRACE) console.log(name, JSON.stringify({ lv: r.lv, scale: r.scale, slow: r.slow, gpu: +r.gpu.toFixed(1), T: +r.T.toFixed(1) }), moved(r));
  });
}

test('an M1 eased by a heavy moment wins it all back once the moment passes, though its GPU\'s time fills the frame', () => {
  // its frames late a while (up close on a dense colony: the drawing three times as dear), then the view as before
  const r1 = simulate({ ...DEVICES.m1, draw: 15 }, 40);
  assert.ok(!atBest(r1), 'eased while late');
  const r2 = simulate(DEVICES.m1, 400, r1);
  assert.ok(atBest(r2), moved(r2));
  if (process.env.TUNER_TRACE) console.log('m1 heavy', moved(r1), '| after', moved(r2));
});

// Windows of frames on a 60 Hz display (16.7 ms a frame aimed for): each 2 s window 120 intervals, some a vsync missed,
// some a hitch (main.js counts any as at most 50 ms)
const T60 = 1000 / 60;
const win = (missed = 0, hitches = 0) => [...Array(120 - missed - hitches).fill(T60), ...Array(missed).fill(2 * T60), ...Array(hitches).fill(50)];
const run = (windows, o = {}) => { let w = { late: 0, good: 0 }; return windows.map((dts) => (w = judge(w, dts, T60, o))); };

test('mostly 60 fps with occasional hitches never eases anything', () => {
  // a vsync or two missed a second and a 50 ms hitch (a GC, a shader compiled) every window, for ten minutes
  assert.ok(run(Array.from({ length: 300 }, (_, i) => win(i % 3 ? 4 : 2, 1))).every((j) => !j.behind));
  // nor a bad moment alone: a window 30% late (a tab come back, a panel opened) among good ones
  assert.ok(run([win(1), win(36), win(1), win(1), win(36), win(2)]).every((j) => !j.behind));
});

test('frames late two windows in a row ease; a climb frames slip after is taken back at once', () => {
  assert.deepEqual(run([win(), win(20), win(20), win(20)]).map((j) => j.behind), [false, false, true, true]);
  // just after a step up, frames a little late (5%: not late enough to ease anything) take it back
  assert.equal(judge({ late: 0, good: 0 }, win(6), T60, { climbed: true }).behind, true);
  assert.equal(judge({ late: 0, good: 0 }, win(6), T60).behind, false);
});

test('room after three windows on time; a little late, or under pressure, is no room', () => {
  assert.deepEqual(run([win(), win(), win()]).map((j) => j.room), [false, false, true]);
  assert.equal(run([win(), win(), win(6)]).at(-1).room, false);
  // (frames a little late while the page's own work is light: the browser's pace, counted on time)
  assert.equal(run([win(6), win(6), win(6)], { cheap: true }).at(-1).room, true);
  assert.equal(run([win(), win(), win()], { stressed: true }).at(-1).room, false);
});

test('with no step up fitting by the GPU\'s time, frames on time a while try the best one anyway (probe)', () => {
  const off = { level: 0, auto: true, cost: 0 };
  const s = base({ behind: false, gpu: 16, draw: 9, knobs: all({ sea: off, bloom: off, specks: off, stone: off }), scale: { cur: 0.7, ladder, floor: 0.5, auto: true } });
  assert.equal(decide(s), null);
  const d = decide({ ...s, probe: true });
  assert.equal(d.probe, true);
  assert.ok(d.id === 'scale' ? d.to === 0.85 : d.to === s.knobs[d.id].level + 1, JSON.stringify(d));
  // a knob held after a failed climb is not tried, probe or not
  assert.equal(decide({ ...s, probe: true, knobs: { sea: off }, held: { sea: true }, scale: null }), null);
});

test('behind, work done less often comes before any effect turned off; with room, it is won back last', () => {
  // the haze saves more for what it costs the eye, but turns an effect off: the contacts' and the sea's cadence go first
  const knobs = all({ sea: { level: 3, auto: true, cost: 1.2 }, contacts: { level: 1, auto: true, cost: 3.4 },
    haze: { level: 1, auto: true, cost: 3, other: 1 }, bloom: { level: 1, auto: true, cost: 0.3 } });
  assert.deepEqual(decide(base({ knobs })), { id: 'contacts', to: 0 });
  assert.deepEqual(decide(base({ knobs: { ...knobs, contacts: { level: 0, auto: true, cost: 2.6 } } })), { id: 'sea', to: 2 });
  // the sea turned off is no cadence's step: past a quarter rate the usual order holds
  const late = { ...knobs, contacts: { level: 0, auto: true, cost: 2.6 }, sea: { level: 1, auto: true, cost: 0.3 }, stone: { level: 0, auto: true, cost: 0 } };
  assert.notEqual(decide(base({ knobs: late })).id, 'sea');
  // with room for either, the effect comes back before the cadence
  const up = { ...knobs, sea: { level: 2, auto: true, cost: 0.6 }, bloom: { level: 0, auto: true, cost: 0, full: 0.3 } };
  assert.deepEqual(decide(base({ behind: false, gpu: 5, knobs: up })), { id: 'bloom', to: 1 });
});
