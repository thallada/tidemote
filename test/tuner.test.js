import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOBS, decide, costOf, scaleLoss } from '../src/tuner.js';

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
// with adaptQuality's essentials: behind past 92% busy; the frame rate halved first when the step is more than twice
// the drawing; climbs after three good windows, a climb late again at once held. It must settle, within the frame.
function simulate(dev, windows = 120) {
  const T0 = 1000 / 60, top = (id) => KNOBS[id].levels.length - 1;
  const lv = Object.fromEntries(Object.keys(dev.knobs).map((id) => [id, top(id)]));
  let scale = 1, slow = 1, good = 0, raised = null, held = {};
  const levelCost = (id) => {
    const k = dev.knobs[id], def = KNOBS[id];
    return k.full * def.share(def.levels[top(id)], def.levels[lv[id]], k);
  };
  const frame = () => {
    const ticks = 1 + 0.45 * (slow - 1);
    const step = (dev.step + (lv.neighbors != null ? levelCost('neighbors') - dev.knobs.neighbors.full : 0)) * ticks;
    const draw = dev.draw * scale * scale;
    let fx = 0;
    for (const id of Object.keys(dev.knobs)) if (id !== 'neighbors') fx += levelCost(id) * (dev.knobs[id].px ? scale * scale : 1);
    return { step, draw: draw + fx, gpu: step + draw + fx };
  };
  const trail = [];
  for (let w = 0; w < windows; w++) {
    const T = T0 * slow, f = frame(), behind = f.gpu > 0.92 * T;
    const knobs = Object.fromEntries(Object.keys(dev.knobs).map((id) => [id, { level: lv[id], auto: true, cost: levelCost(id), ...dev.knobs[id] }]));
    const s = { behind, T, gpu: f.gpu, draw: f.draw, knobs, held, scale: { cur: scale, ladder, floor: dev.floor ?? 0.5, auto: true } };
    let acted = '';
    if (behind) {
      good = 0;
      if (raised) { held[raised] = true; raised = null; }
      if (f.step > 2 * f.draw && slow < 4) { slow++; acted = 'slow'; }
      else {
        const d = decide(s);
        if (d) { if (d.id === 'scale') scale = d.to; else lv[d.id] = d.to; acted = d.id; }
        else if (slow < 4) { slow++; acted = 'slow'; }
      }
    } else {
      raised = null;
      if (++good >= 3) {
        const faster = (T0 * (slow - 1)), cost = (m) => 1 + 0.45 * (m - 1);
        if (slow > 1 && f.draw + (f.step / cost(slow)) * cost(slow - 1) < 0.75 * faster) { slow--; good = 0; acted = 'fast'; }
        else if (slow === 1 || true) {
          const d = decide(s);
          if (d) { if (d.id === 'scale') scale = d.to; else lv[d.id] = d.to; good = 0; raised = d.rebalance ? null : d.id; acted = d.id; }
        }
      }
    }
    trail.push({ acted, gpu: f.gpu, T, scale, slow, ...lv });
  }
  return { lv, scale, slow, trail, gpu: frame().gpu, T: T0 * slow };
}
// measured (docs/performance.md, runs/phone): a Pixel 3 in an 8k world, a Pixel 11 Pro in a 16k one, an RTX 4070 Ti
// in a 1M one (draw: the drawing at full scale less the knobs; px: a knob's cost follows the pixels)
const DEVICES = {
  pixel3: { step: 20, draw: 12, floor: 0.5, knobs: { sea: { full: 5 }, bloom: { full: 0.6, px: true }, specks: { full: 0.2 }, stone: { full: 0.2 }, finish: { full: 30, px: true, rel: [0.45, 0.88, 1] }, interiors: { full: 0 }, neighbors: { full: 20, rel: [0.45, 0.6, 1] } } },
  pixel11: { step: 8, draw: 5, knobs: { sea: { full: 2.6 }, bloom: { full: 0.3, px: true }, specks: { full: 0.05 }, stone: { full: 0.1 }, finish: { full: 2.5, px: true, rel: [0.45, 0.88, 1] }, interiors: { full: 0 }, neighbors: { full: 8, rel: [0.97, 0.98, 1] } } },
  rtx: { step: 3.4, draw: 2.5, knobs: { sea: { full: 0.03 }, bloom: { full: 0.07, px: true }, specks: { full: 0.08 }, stone: { full: 0.1 }, finish: { full: 0.8, px: true, rel: [0.45, 0.88, 1] }, interiors: { full: 0 }, neighbors: { full: 3.4, rel: [0.97, 0.98, 1] } } },
};
for (const [name, dev] of Object.entries(DEVICES)) {
  test(`the tuner settles on a ${name}, within its frame`, () => {
    const r = simulate(dev);
    const last = r.trail.slice(-30);
    assert.ok(last.every((t) => !t.acted), `${name} still moving: ${JSON.stringify(last.filter((t) => t.acted).map((t) => t.acted))}`);
    assert.ok(r.gpu <= 0.92 * r.T, `${name}: ${r.gpu.toFixed(1)} ms of ${r.T.toFixed(1)}`);
    if (name === 'rtx') { assert.equal(r.scale, 1); assert.equal(r.slow, 1); for (const [id, l] of Object.entries(r.lv)) assert.equal(l, KNOBS[id].levels.length - 1, id); }
    if (process.env.TUNER_TRACE) console.log(name, JSON.stringify({ lv: r.lv, scale: r.scale, slow: r.slow, gpu: +r.gpu.toFixed(1), T: +r.T.toFixed(1) }), r.trail.filter((t) => t.acted).map((t) => t.acted).join(' '));
  });
}
