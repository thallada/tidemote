// The auto-tuner: which of the frame's costs to give up when frames run late, and which to win back when there is
// room (main.js adaptQuality asks every two seconds; its emergency step-down, overload, acts at once). Each knob is a
// ladder of settings, cheapest first, and on Auto (Settings → Performance) the tuner moves it one step at a time:
// down, the step that saves the most GPU time for the least that is lost to the eye; up, the one that brings back the
// most for the time it costs, if it fits. What a knob costs is measured where it can be (the GPU's timestamps, pass by
// pass, every so often: costOf), and estimated where it cannot. Pure, tested in test/tuner.test.js.
//
// On a Pixel 11 Pro (PowerVR, 2026-11-04) the sea's spectrum and inverse FFT took 2.3-2.9 ms of a 12.6 ms frame in
// a 16k world and bloom 0.3; on an RTX 4070 Ti 0.03 and 0.1. So no device type orders the knobs: their measured cost
// does. The visual weights (loss) are judged, the cost of each step to the eye, render scale's by how far it falls:
// the resolution weighs most (a soft view is what a viewer notices first), the sea's motion turned less often least.
// Frozen frames scored against full quality (1 - SSIM, an RTX 4070 Ti's 1M world at 40 and 150 pixels a unit,
// runs/phone/ssim.py) ordered the dressing: the sea gone 0.16-0.36, bloom 0.03-0.09, the specks 0.002-0.004 (the
// sea's turns less often show only in motion, which a frozen frame cannot score). The render scale scored 0.07-0.13
// from 85% to 50%, the first step most, but SSIM judges softness on a phone's dense screen poorly: its weights are
// left as judged.

// Each knob: levels, cheapest first (the engine's own words: Engine.fx); passes, the GPU passes whose time it is (by
// their names in Engine.passProfile's report); share(from, to), the share of that time a step from level `from` to
// level `to` keeps; loss[i], what stepping from level i + 1 down to level i costs the eye.
export const KNOBS = {
  sea: {
    levels: [0, 4, 2, 1], // frames between turns of the sea (0: no sea)
    passes: /^seaSpectrum|^fftRows|^fftCols|^seaMip|^seaShiftMap|^seaFieldMain/,
    share: (from, to) => rate(to) / Math.max(1e-6, rate(from)),
    loss: [3, 0.6, 0.3],
  },
  bloom: { levels: [false, true], passes: /^fsDown$|^fsUp$/, share: (from, to) => (to ? 1 : 0), loss: [1] },
  specks: { levels: [false, true], passes: /^microSpecks$|^fsSpeck$/, share: (from, to) => (to ? 1 : 0), loss: [0.2] },
  stone: { levels: [2, 1, 0.5], passes: /^fsStone/, share: (from, to) => from / to, loss: [0.3, 0.2] }, // seconds between relightings
  // The composite's finish (Engine.fx.finish): 2 all of it; 1 without the heat map's shimmer (1 - SSIM 0.001-0.006
  // against full quality: barely seen, 10-15% of the composite); 0 without the optics and the microscope's look
  // either (0.10-0.13, as much as half the render scale; the composite about halved, 0.61 → 0.27 ms on an RTX 4070
  // Ti at 2544 × 1289). Its cost is the composite's, learned at each level on the device (rel: each level's against
  // the top's, per pixel), guessed from the RTX until then.
  finish: { levels: [0, 1, 2], passes: null, share: (from, to, k) => finishRel(k, to) / finishRel(k, from), loss: [1.2, 0.05] },
  // Cells' insides in the main view (Engine.fx.interiors): left out, every cell takes the lean pipeline, its outline,
  // walls and tissue kept (1 - SSIM 0.007-0.012 at 150 and 400 pixels a unit; weighed above that, the insides being
  // what a close look is for). Its cost is the cells' pass, learned at each level at a like zoom (ratio), none
  // where cells are drawn too small for insides.
  interiors: { levels: [false, true], passes: null, share: (from, to, k) => (from === to ? 1 : to ? 1 / (k?.ratio ?? 0.75) : k?.ratio ?? 0.75), loss: [0.4] },
  // The simulation's own: the neighbors a cell weighs per step (Engine.maxScan; the contact cap scales with them), its
  // cost a share of the step that differs most between GPUs (a Pixel 11 Pro's step 2% less at 88 than at 112),
  // learned on the device (rel: the step at each level against the top's, as the page measures them; a
  // cautious guess until then). 32 seeds × 30 min found no ecological difference at 64 or 88 in 8k worlds, nor at 88
  // in 16k ones (runs/lowend). Its loss is the simulation's fidelity, weighed above any of the dressing: taken only
  // where it pays much.
  neighbors: { levels: [64, 88, 112], passes: null, share: (from, to, k) => nbRel(k, to) / nbRel(k, from), loss: [5, 4] },
};
const rate = (every) => (every > 0 ? 1 / every : 0);
const FINISH_GUESS = [0.45, 0.88, 1];
const NB_GUESS = { 64: 0.75, 88: 0.85, 112: 1 };
const nbRel = (k, n) => Math.max(0.05, k?.rel?.[KNOBS.neighbors.levels.indexOf(n)] ?? NB_GUESS[n] ?? 1);
const finishRel = (k, i) => Math.max(0.05, k?.rel?.[i] ?? FINISH_GUESS[i]);
// the share of the frame's interval a step up must leave the GPU under
export const ROOM = 0.85;

// Render scale: the share of the screen's resolution the world is drawn at (main.js SCALES); its loss per step grows
// as it falls, and what it saves is the drawing's pixels (its cost about the square of the scale)
export const SCALE_LOSS = 12;
export const scaleLoss = (from, to) => SCALE_LOSS * (from - to) * (1 + 2 * (1 - to));

/** The GPU time (ms a frame) of each knob's passes in one profile ([[pass, ms], ...] averaged over frames). */
export function costOf(passes) {
  const out = {};
  for (const id of Object.keys(KNOBS)) out[id] = 0;
  for (const [name, ms] of passes) for (const [id, k] of Object.entries(KNOBS)) if (k.passes?.test(name)) out[id] += ms;
  return out;
}

/**
 * The step to take, or null. s: {
 *   behind: frames run late (true) or there is room (false),
 *   T: the frame's interval (ms), gpu: GPU ms a frame (mean), draw: of it, the drawing's (render scale's to save),
 *   knobs: { id: { level: index, auto, floor: lowest index allowed, cost: ms measured at its level (or null), full: ms
 *     last measured at its top level (or null) } },
 *   scale: { cur, ladder (descending), floor, auto },
 *   held: { id: true } (not to be raised again yet), }
 * Returns { id: knob id or 'scale', to: its new level index (or scale) } .
 */
export function decide(s) {
  const opts = [];
  for (const [id, k] of Object.entries(s.knobs)) {
    const def = KNOBS[id];
    if (!def || !k.auto) continue;
    const top = def.levels.length - 1, full = fullCost(id, k, s.draw);
    const at = (i) => full * def.share(def.levels[top], def.levels[i], k);
    if (s.behind && k.level > (k.floor ?? 0)) {
      const save = at(k.level) - at(k.level - 1);
      if (save > 0.05) opts.push({ id, to: k.level - 1, gain: save, loss: def.loss[k.level - 1] });
    } else if (!s.behind && k.level < top && !s.held?.[id]) {
      opts.push({ id, to: k.level + 1, gain: def.loss[k.level], loss: Math.max(0.05, at(k.level + 1) - at(k.level)) });
    }
  }
  const sc = s.scale;
  if (sc?.auto) {
    const i = sc.ladder.findIndex((v) => v <= sc.cur + 1e-3);
    if (s.behind) {
      const next = sc.ladder.find((v) => v < sc.cur - 1e-3 && v >= sc.floor - 1e-3);
      if (next != null) opts.push({ id: 'scale', to: next, gain: s.draw * (1 - (next / sc.cur) ** 2), loss: scaleLoss(sc.cur, next) });
    } else if (i > 0 && !s.held?.scale) {
      const next = sc.ladder[i - 1];
      opts.push({ id: 'scale', to: next, gain: scaleLoss(next, sc.cur), loss: Math.max(0.05, s.draw * ((next / sc.cur) ** 2 - 1)) });
    }
  }
  if (!opts.length) return null;
  if (s.behind) {
    // the most saved for the least lost to the eye (and, asked for a rebalance, what it saves and costs the eye)
    opts.sort((a, b) => b.gain / b.loss - a.gain / a.loss);
    return s.rebalance ? { id: opts[0].id, to: opts[0].to, save: opts[0].gain, loss: opts[0].loss } : { id: opts[0].id, to: opts[0].to };
  }
  // the most brought back for its cost, among those that fit in ROOM of the frame (behind is 92%: what lies between
  // keeps a climb from tipping straight back)
  opts.sort((a, b) => b.gain / b.loss - a.gain / a.loss);
  const fit = opts.find((o) => s.gpu + o.loss < ROOM * s.T);
  if (fit) return { id: fit.id, to: fit.to };
  // None fits: a rebalance, if one pays. Give up the step that costs the eye least for the time it frees, when what it
  // makes room for brings back half as much again for its time (so the step given up is never worth climbing back
  // before what it paid for: no see-saw). A quarter of the room it needs is enough to begin with (the next windows
  // give up the next, each worth it on its own).
  const best = opts[0], need = s.gpu + best.loss - ROOM * s.T;
  // (only the dressing pays: the resolution falls only when frames are late)
  const down = decide({ ...s, behind: true, knobs: Object.fromEntries(Object.entries(s.knobs).filter(([id]) => id !== best.id)), scale: null, rebalance: true });
  if (!down || down.save < 0.25 * need || best.gain / best.loss < 1.5 * (down.loss / down.save)) return null;
  return { id: down.id, to: down.to, rebalance: true };
}

// A knob's cost at its top level: from its cost measured at its level (where that level costs anything), else the
// last measured at the top (full), else a share of the drawing judged from the phones and desktops measured (the sea
// about a fifth of it on a phone, bloom a twentieth)
const GUESS = { sea: 0.2, bloom: 0.05, specks: 0.05, stone: 0.03, finish: 0.3, interiors: 0, neighbors: 0 };
function fullCost(id, k, draw) {
  const def = KNOBS[id], share = def.share(def.levels[def.levels.length - 1], def.levels[k.level], k);
  if (k.cost != null && share > 0) return k.cost / share;
  if (k.full != null) return k.full;
  return (GUESS[id] ?? 0.05) * Math.max(draw || 0, 1);
}
