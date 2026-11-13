// The auto-tuner: which of the frame's costs to give up when frames run late, and which to win back when there is
// room (main.js adaptQuality asks every two seconds, judge says when; its emergency step-down, overload, acts at
// once). Each knob is a ladder of settings, cheapest first, and while Settings → Performance → Adaptation is on (and
// the Display row of the effect it eases is on Auto) the tuner moves it one step at a time:
// down, the step that saves the most GPU time for the least that is lost to the eye; up, the one that brings back the
// most for the time it costs, if it fits (or, frames on time a while, tried anyway: probe). What a knob costs is
// measured where it can be (the GPU's timestamps, pass by
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
// cadence: a knob whose steps down, short of its level 0's value (0 or false: the effect off), make its work less often
// (or over less of it each frame), not less of it; behind, such steps are taken before any other (decide), so an effect
// is turned less often before anything is turned off, and won back after.
export const KNOBS = {
  sea: {
    levels: [0, 4, 2, 1], // frames between turns of the sea (0: no sea; between, it is read carried along its drift)
    // (a pass is named by its first three pipelines, Engine._profileEncoder: a fresh sea's 'seaInit+seaSpectrum+fftRows')
    passes: /^seaInit|^seaSpectrum|^fftRows|^fftCols|^seaMip|^seaShiftMap|^seaFieldMain/,
    share: (from, to) => rate(to) / Math.max(1e-6, rate(from)),
    loss: [3, 0.3, 0.15],
    cadence: true,
  },
  bloom: { levels: [false, true], passes: /^fsDown$|^fsUp$/, share: (from, to) => (to ? 1 : 0), loss: [1] },
  specks: { levels: [false, true], passes: /^microSpecks$|^fsSpeck$/, share: (from, to) => (to ? 1 : 0), loss: [0.2] },
  // seconds between relightings: the cache's grains ('fsStone', 'fsStone+fsStone edge') and its light ('fsStoneCache'),
  // not the cache lit under the cells every frame (fsStoneLit, fsStoneLitScene, fsStoneLitMicro). The loupe's and the
  // close-up's grains, drawn every frame they are open, share the cache's names and are counted with it
  stone: { levels: [2, 1, 0.5], passes: /^fsStone($|\+)|^fsStoneCache$/, share: (from, to) => from / to, loss: [0.3, 0.2], cadence: true },
  // Frames between a grid cell's searches for its cells' contacts (Engine.fx.contactsEvery: half the grid cells search
  // each frame, or a quarter; the rest carry theirs through the steps between, touchCarry). The search is about two
  // thirds of contactGather, the animation records the rest (GATHER_SEARCH). A contact is a few frames old at most, and
  // a bite or a birth seen without a search is judged on the cell's next frame that searches: nothing is lost.
  contacts: { levels: [4, 2], passes: /contactGather/, share: (from, to) => gather(to) / gather(from), loss: [0.1], cadence: true },
  // The composite's finish, as two knobs (Engine.fx.haze, Engine.fx.microscope), once one ladder (all of it; without
  // the haze; without the microscope either): the heat haze, the shimmer over warm water (1 - SSIM 0.001-0.006 against
  // full quality: barely seen, 10-15% of the composite; boiling water still roils without it), and the microscope, the
  // optics and the look (0.10-0.13, as much as half the render scale; the composite about halved, 0.61 → 0.27 ms on an
  // RTX 4070 Ti at 2544 × 1289). Their losses are the old ladder's steps', so the haze still goes long before the
  // microscope and the microscope comes back first. Their cost is the composite's in each state of the two (k.other:
  // the other's level as shown), learned on the device per pixel (rel), guessed from the RTX until then.
  haze: { levels: [false, true], passes: null, share: (from, to, k) => comp(k, +to + 2 * other(k)) / comp(k, +from + 2 * other(k)), loss: [0.05] },
  microscope: { levels: [false, true], passes: null, share: (from, to, k) => comp(k, other(k) + 2 * +to) / comp(k, other(k) + 2 * +from), loss: [1.2] },
  // Cells' insides in the main view, the loupe and the live close-up (Engine.fx.interiors): left out, every cell takes the lean pipeline, its outline,
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
// contactGather's share that is the search (a grid cell's every `every` frames), against the records made every frame
export const GATHER_SEARCH = 0.65;
const gather = (every) => 1 - GATHER_SEARCH + GATHER_SEARCH / every;
// the composite per pixel with the haze and the microscope each off or on (index: haze + 2 × microscope) against both
// on: the old ladder's plain (0.45) and still (0.88) finishes, and the haze alone its 0.12 over plain
export const COMP_GUESS = [0.45, 0.57, 0.88, 1];
const comp = (k, i) => Math.max(0.05, k?.rel?.[i] ?? COMP_GUESS[i]);
const other = (k) => k?.other ?? 1;
const NB_GUESS = { 64: 0.75, 88: 0.85, 112: 1 };
const nbRel = (k, n) => Math.max(0.05, k?.rel?.[KNOBS.neighbors.levels.indexOf(n)] ?? NB_GUESS[n] ?? 1);
// the share of the frame's interval a step up must leave the GPU under
export const ROOM = 0.85;

// A window of frames (main.js adaptQuality, every two seconds) judged by the frames: late when their mean interval
// runs an eighth over the frame's (a hitch of any length counts as one frame of at most 50 ms or 2.5 intervals,
// main.js), or over 3% while over 3% of them waited on the GPU (the GPU behind, not a hitch); on time within 3%. Not by
// the GPU's measured time: a GPU that slows its clock to its work, as Apple's do at 60 fps, measures busy for most
// of the frame whatever it has to spare (an M1 at 60 fps, judged behind by a GPU busy over 92% of the frame, gave up
// the microscope, the glow and the insides with its frames on time, and never took them back: what a step up costs
// never fit beside a time that filled the frame). A frame that waited on the GPU (two frames still in flight when it
// was due) is the GPU's own word that it is behind, at any clock.
export const LATE = 1.125, ON_TIME = 1.03;
/**
 * A window's verdict. w: { late, good }, the windows late and on time in a row before this one; dts: its frames'
 * intervals (ms); T: the frame's interval (ms). o: { climbed: a step up was just taken, cheap: the page's own work
 * fills under a quarter of the interval (frames a little late are the browser's pace, which nothing here can
 * help), stressed: Compute Pressure serious or worse (no step up), waited: the share of its frames that waited on
 * the GPU }. Returns { m: the mean interval, late, good, behind: give something up (two windows late in a row: a
 * hitch or two is not a frame rate missed; or frames off time just after a step up, which takes it back), room:
 * three windows on time }.
 */
export function judge(w, dts, T, { climbed = false, cheap = false, stressed = false, waited = 0 } = {}) {
  const m = dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length), slipped = m > ON_TIME * T && !cheap;
  const late = m > LATE * T || (slipped && waited > 0.03) ? w.late + 1 : 0;
  const good = late || slipped || stressed ? 0 : w.good + 1;
  return { m, late, good, behind: late >= 2 || (climbed && slipped), room: good >= 3 };
}

// Render scale: the share of the screen's resolution the world is drawn at (main.js SCALES); its loss per step grows
// as it falls, and what it saves is the drawing's pixels (its cost about the square of the scale)
const SCALE_LOSS = 12;
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
 *     last measured at its top level (or null); the haze's and the microscope's also rel, the composite in each state
 *     of the two, and other, the other's level as shown } },
 *   scale: { cur, ladder (descending), floor, auto },
 *   held: { id: true } (not to be raised again yet),
 *   probe: with room, a step up even where the GPU's time says it will not fit (frames on time a while), }
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
      if (save > 0.05) opts.push({ id, to: k.level - 1, gain: save, loss: def.loss[k.level - 1], cadence: def.cadence && !!def.levels[k.level - 1] });
    } else if (!s.behind && k.level < top && !s.held?.[id]) {
      opts.push({ id, to: k.level + 1, gain: def.loss[k.level], loss: Math.max(0.05, at(k.level + 1) - at(k.level)), cadence: def.cadence && !!def.levels[k.level] });
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
    // a cadence's step first (work done less often, nothing turned off), then the most saved for the least lost to the
    // eye (and, asked for a rebalance, what it saves and costs the eye)
    const pool = opts.some((o) => o.cadence) ? opts.filter((o) => o.cadence) : opts;
    pool.sort((a, b) => b.gain / b.loss - a.gain / a.loss);
    return s.rebalance ? { id: pool[0].id, to: pool[0].to, save: pool[0].gain, loss: pool[0].loss } : { id: pool[0].id, to: pool[0].to };
  }
  // the most brought back for its cost, among those that fit in ROOM of the frame (what lies between it and the frame
  // keeps a climb from tipping straight back); a cadence's step last, as it went first
  opts.sort((a, b) => a.cadence - b.cadence || b.gain / b.loss - a.gain / a.loss);
  const fit = opts.find((o) => s.gpu + o.loss < ROOM * s.T);
  if (fit) return { id: fit.id, to: fit.to };
  // None fits by the GPU's time, but frames have kept time a while (probe): they say more than that time can (a GPU
  // that slows its clock to its work fills the frame whatever it has to spare; without timestamps the time is
  // overstated). The best step up is tried; one that makes frames late is taken back and held (main.js tuneSteps).
  if (s.probe) return { id: opts[0].id, to: opts[0].to, probe: true };
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
// about a fifth of it on a phone, bloom a twentieth, contactGather up close a quarter on a Pixel 3, a tenth on an M1;
// until measured, a Pixel 3 turned the sea off before it took the contacts' cheaper step)
const GUESS = { sea: 0.2, contacts: 0.15, bloom: 0.05, specks: 0.05, stone: 0.03, haze: 0.3, microscope: 0.3, interiors: 0, neighbors: 0 };
function fullCost(id, k, draw) {
  const def = KNOBS[id], share = def.share(def.levels[def.levels.length - 1], def.levels[k.level], k);
  if (k.cost != null && share > 0) return k.cost / share;
  if (k.full != null) return k.full;
  return (GUESS[id] ?? 0.05) * Math.max(draw || 0, 1);
}

/**
 * Where each setting the page may adapt stands right now, as Settings → Performance's line under Adaptation and the
 * dock's readout and its summary say it: [id, value, state] for each knob (its level index, in KNOBS' order), then
 * the render scale (['scale', scale]) and the frame rate aimed for (['fps', frames a second]) where given. state: 'fixed', a
 * value the viewer chose (or a tool); 'off', an effect the viewer has off; 'held', below its best (what the tuner
 * holds back); else 'best'. levels: { id: index }; shown: { id: false } for an effect off; fixed: { id: true };
 * scale: { v, auto }; fps: { v, auto, slow: the rate aimed lower, a divisor over 1 }.
 */
export function adaptation(levels, { shown = {}, fixed = {}, scale = null, fps = null } = {}) {
  const at = (fix, off, held) => (fix ? 'fixed' : off ? 'off' : held ? 'held' : 'best');
  const out = [];
  for (const [id, def] of Object.entries(KNOBS)) if (levels[id] != null) out.push([id, levels[id], at(fixed[id], shown[id] === false, levels[id] < def.levels.length - 1)]);
  if (scale) out.push(['scale', scale.v, at(!scale.auto, false, scale.v < 0.995)]);
  if (fps) out.push(['fps', fps.v, at(!fps.auto, false, fps.slow > 1)]);
  return out;
}
