// The viewer's hand (docs/hand.md): the bench's tools, what the one in hand does to the world, and the record of
// what it has done. Every tool is a local cause the world could have made itself (a lamp is more sun on one
// place, a stir a gust, the needle a hunter), written into the engine's hand words (Hand in simWGSL), which are
// zero in every headless run. Pure but for those words; the page feeds it the pointer in world units.

export const TOOLS = [
  { id: 'loupe', name: 'Loupe', hint: 'Look closer: click a cell to examine it' },
  { id: 'touch', name: 'Touch', hint: 'Tap: a drop’s ring · drag: stir the water along the stroke' },
  { id: 'lamp', name: 'Lamp', hint: 'More sun on one place: hold to brighten, let go and it fades' },
  { id: 'shade', name: 'Shade', hint: 'Shade one place: hold to darken, let go and the light returns' },
  { id: 'warm', name: 'Warm', hint: 'The heated stage: hold to warm the water under it' },
  { id: 'cold', name: 'Cold', hint: 'The cold probe: hold to chill the water under it' },
  { id: 'needle', name: 'Needle', hint: 'Click: prick one cell · drag: cut the bonds the tip crosses' },
  { id: 'pipette', name: 'Pipette', hint: 'Right button pulls what is under it · left sets down the tip species' },
];
export const toolOf = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];
export const keyOf = (id) => String(TOOLS.findIndex((t) => t.id === id) + 1);

// The reach of every tool but the needle, in world units (1 unit is about 59 µm): the slider's range and default.
export const REACH = { min: 0.6, max: 8, def: 2 };
const LAMP = 0.6; // the light a lamp adds at its center, at full brightness (the sun at noon gives about 1)
const SHADE = 0.9; // the share of the light a shade takes at its center
const STAGE = 1.0; // degrees a second the stage adds at its center (the water relaxes at 3% a second)
const STIR_MAX = 2; // the fastest the finger drags the water, world units a second
const CUT = 0.12; // the needle's half-width
// how the lamp and stage come up while held and go when let go (time constants, real seconds)
const EASE = { lamp: [0.35, 3.5], stage: [0.25, 0.25], stir: [0.08, 0.8] };
const NONE = 0xffffffff;

/**
 * words, ids: the engine's hand words (eng.hand, eng.handU), which update() writes. The page calls down, move and
 * up with world points, tap and prick for Touch's taps and the needle's cell, and update(dt) every frame.
 */
export function createHand(words, ids, { reach = REACH.def } = {}) {
  const ease = (v, to, [up, down], dt) => v + (to - v) * (1 - Math.exp(-dt / (Math.abs(to) > Math.abs(v) ? up : down)));
  const h = {
    tool: 'loupe', reach, held: false, last: null, vel: [0, 0], cut: null,
    lamp: { x: 0, y: 0, r: reach, v: 0 }, stage: { x: 0, y: 0, r: reach, v: 0 }, stir: { x: 0, y: 0, vx: 0, vy: 0 },
    // the ridden cell and where it is steered: [x, y, strength]
    rider: NONE, will: null,
    // the record: one entry per act (a tool held, or a run of taps and pricks in one place), its times simulated
    acts: [],
    get touched() { return h.acts.length > 0; },
    /** Whether anything the hand did still acts on the world (a lamp fading, the stage still warming). */
    get acting() { return h.lamp.v !== 0 || h.stage.v !== 0 || h.stir.vx !== 0 || h.stir.vy !== 0; },
    /** A world begun or put in place: its record of acts (kept with it), nothing of the last world's still acting. */
    reset(acts = []) {
      h.up(); h.acts = acts; h.cut = null; h.rider = NONE; h.will = null;
      h.lamp.v = h.stage.v = h.stir.vx = h.stir.vy = 0;
    },
    /** The tool in hand (an id of TOOLS); taking one lets go of the last. */
    set(id, t) { h.up(t); h.tool = toolOf(id).id; },
    /** The pointer pressed at world point (x, y), simulated time t. */
    down(x, y, t) {
      h.held = true; h.last = [x, y]; h.vel = [0, 0];
      if (h.tool !== 'loupe' && h.tool !== 'pipette') act(t, x, y);
    },
    /** The pointer moved to (x, y), dt real seconds since its last move, the world running at `speed`. */
    move(x, y, dt, speed) {
      if (!h.held) return;
      const [lx, ly] = h.last;
      if (h.tool === 'needle') h.cut = [lx, ly, x, y];
      // the water a finger drags moves as the finger does, in the world's seconds
      const k = dt > 0 && speed > 0 && Number.isFinite(speed) ? 1 / (dt * speed) : 0;
      const vx = (x - lx) * k, vy = (y - ly) * k, m = Math.hypot(vx, vy), c = m > STIR_MAX ? STIR_MAX / m : 1;
      h.vel = [vx * c, vy * c];
      h.last = [x, y];
    },
    /** The pointer let go at simulated time t: a held act ends. */
    up(t) {
      const a = h.acts[h.acts.length - 1];
      if (h.held && t != null && a && a.tool === h.tool) a.end = Math.max(a.end, t);
      h.held = false; h.cut = null; h.vel = [0, 0];
    },
    /** A tap with Touch: a drop's ring from (x, y), in the oldest of the engine's raindrop slots. */
    tap(drops, x, y, t) {
      let k = 0;
      for (let j = 1; j < 4; j++) if (drops[j * 4 + 2] < drops[k * 4 + 2]) k = j;
      drops.set([x, y, t, 2.5], k * 4);
      act(t, x, y, 1);
    },
    /** The needle pricked cell id at (x, y). */
    prick(id, x, y, t) { ids[20] = id >>> 0; act(t, x, y, 1); },
    /** Steer the ridden cell id toward (x, y) at strength s (0..1), at simulated time t; steer(NONE) lets it go. */
    steer(id, x = 0, y = 0, s = 0, t = null) {
      h.rider = id >>> 0;
      h.will = h.rider === NONE ? null : [x, y, s];
      if (s > 0 && t != null) act(t, x, y, 0, 'ride');
    },
    /** Ease the lamp, stage and stir toward what the hand is doing, and write the engine's words. */
    update(dt) {
      const p = h.last, tl = h.tool;
      const lampTo = h.held && tl === 'lamp' ? LAMP : h.held && tl === 'shade' ? -SHADE : 0;
      const stageTo = h.held && tl === 'warm' ? STAGE : h.held && tl === 'cold' ? -STAGE : 0;
      // (a lamp lit where a shade was, or the reverse, starts afresh)
      if (lampTo && Math.sign(lampTo) !== Math.sign(h.lamp.v)) h.lamp.v = 0;
      if (lampTo) Object.assign(h.lamp, { x: p[0], y: p[1], r: h.reach });
      if (stageTo) Object.assign(h.stage, { x: p[0], y: p[1], r: h.reach });
      const stirring = h.held && tl === 'touch';
      if (stirring) Object.assign(h.stir, { x: p[0], y: p[1] });
      h.lamp.v = settle(ease(h.lamp.v, lampTo, EASE.lamp, dt), lampTo);
      h.stage.v = settle(ease(h.stage.v, stageTo, EASE.stage, dt), stageTo);
      // (while stirring the water keeps up with the finger; let go, it runs on and slows)
      const sk = stirring ? [EASE.stir[0], EASE.stir[0]] : EASE.stir;
      h.stir.vx = settle(ease(h.stir.vx, stirring ? h.vel[0] : 0, sk, dt), stirring);
      h.stir.vy = settle(ease(h.stir.vy, stirring ? h.vel[1] : 0, sk, dt), stirring);
      const w = h.will || [0, 0, 0];
      words.set([h.lamp.x, h.lamp.y, h.lamp.r, h.lamp.v, h.stage.x, h.stage.y, h.stage.r, h.stage.v,
        h.stir.x, h.stir.y, h.stir.vx, h.stir.vy, ...(h.cut || [0, 0, 0, 0]), h.reach, h.cut ? CUT : 0, w[0], w[1]]);
      ids[21] = h.rider;
      words[22] = w[2];
      // (a stroke cuts once: the next frame's runs on from here)
      h.cut = null;
    },
  };
  // what has faded to nothing is nothing (so the kernels' guards skip it)
  const settle = (v, on) => (!on && Math.abs(v) < 1e-3 ? 0 : v);
  // an act begun, or the last carried on: the same tool, about the same place, within a few seconds (a ride goes
  // where its cell goes: the place it is told of is where it ended)
  function act(t, x, y, n = 0, tool = h.tool) {
    const a = h.acts[h.acts.length - 1];
    if (a && a.tool === tool && t - a.end < 5 && (tool === 'ride' || Math.hypot(a.x - x, a.y - y) < 2 * h.reach)) {
      a.end = t; a.n += n;
      if (tool === 'ride') { a.x = x; a.y = y; }
      return;
    }
    h.acts.push({ tool, at: t, end: t, x, y, r: h.reach, n });
  }
  return h;
}
