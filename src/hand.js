// The viewer's hand (docs/hand.md): the bench's tools, what the one in hand does to the world, and the record of
// what it has done. Every tool is a local cause the world could have made itself (a lamp is more sun on one
// place, the rod and the needle what a falling grain or a hunter would do), written into the engine's hand words (Hand in simWGSL), which are
// zero in every headless run. Pure but for those words; the page feeds it the pointer in world units.

import { NEEDLE } from './shaders.js';

export const TOOLS = [
  { id: 'none', name: 'Pan', hint: 'Nothing in hand: drag to pan, click a cell to examine it' },
  { id: 'loupe', name: 'Loupe', hint: 'The lens follows the pointer: click a cell to examine it · Reach sizes it, [ ] magnify', touch: 'A tap examines a cell and sets the lens over it · drag the lens to move it, outside it to pan' },
  { id: 'touch', name: 'Touch', hint: 'A glass rod from above: pressed, it pushes the cells and grains under it aside, drag it to plow them · a tap rings the water' },
  { id: 'lamp', name: 'Lamp', hint: 'More sun where it points, a little; hold for the full lamp' },
  { id: 'shade', name: 'Shade', hint: 'Shade where it points, a little; hold to darken it' },
  { id: 'warm', name: 'Warm', hint: 'The heated stage: hold to warm the water under it, as far as a boil' },
  { id: 'cold', name: 'Cold', hint: 'The cold probe: hold to chill the water under it, as far as ice' },
  { id: 'needle', name: 'Needle', hint: 'Pressed, it goes into the water: its point pricks the cells it touches (a tap, the nearest), its shaft pushes the rest aside · drag: cut through' },
  { id: 'pipette', name: 'Pipette', hint: 'Load: a click draws up every cell in reach, held harder · Dispense (or ⇧ click) sets the tip species down, a cell at a time', touch: 'Load: a touch draws up every cell in reach, held harder · Dispense: touches set the tip species down' },
];
export const toolOf = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];
// (Pan, nothing in hand, is 0, the tools 1 to 8)
export const keyOf = (id) => String(TOOLS.findIndex((t) => t.id === id));
/** Whether a tool acts on the world (not none, not the loupe, which only look). */
export const works = (id) => id !== 'none' && id !== 'loupe';
// The way each instrument seen in the water runs off from its point (unit, world axes: y down the screen), and its
// kind in the composite (the engine's tool words)
// (the rod comes down from near the top of the field, its end a disc the size of the reach)
export const INSTRUMENTS = { needle: { kind: 1, dir: [0.86, 0.51] }, pipette: { kind: 2, dir: [0.86, -0.51] }, cold: { kind: 3, dir: [-0.86, 0.51] }, touch: { kind: 4, dir: [0.3, -0.954] } };

// The reach of every tool but the needle, in world units (1 unit is about 59 µm): the slider's range and default.
export const REACH = { min: 0.6, max: 8, def: 2 };
const LAMP = 0.6; // the light a lamp adds within its reach, at full brightness (the sun at noon gives about 1)
const SHADE = 0.9; // the share of the light a shade takes
const HOVER = 0.25; // the lamp, shade, stage and probe over the world, not pressed: this much of their full strength
const CUT = 0.32; // the needle's half-width: it cuts bonds and parts cells this far to either side (past LINK_R apart)
// how the lamp and stage come up while held and go when let go, and the rod dips in and lifts out (time constants,
// real seconds)
const EASE = { lamp: [0.35, 0.3], stage: [0.25, 0.25], dip: [0.3, 0.15] };
// The rod's wake: while it is in the water, every `every` simulated seconds it leaves an eddy where it is, carrying
// the water there along at `couple` of its own velocity (at most `max` world units a second), fading over `life`
// seconds; at most `n` at once. A stroke turned back on itself (faster than `turn` units a second, frame to frame)
// sends a ring wave out from it.
export const WAKE = { n: 20, every: 0.1, life: 1.2, couple: 0.6, max: 8, turn: 1.5 };
const ICE_KEEPS = 120; // simulated seconds the cold probe's ice is looked for after it was last chilling the water
const NONE = 0xffffffff;

/**
 * words, ids: the engine's hand words (eng.hand, eng.handU), which update() writes; drops: the engine's raindrop
 * slots (eng.drops), where Touch's taps and the rod's waves ring. The page calls down, move and up with world points,
 * tap and prick for Touch's taps and the needle's cell, update(dt, t) every frame (t: simulated time), and stepped()
 * after a frame the world stepped in (the needle and the rod sweep what they passed since the last step).
 */
export function createHand(words, ids, { reach = REACH.def, drops = new Float64Array(16) } = {}) {
  const ease = (v, to, [up, down], dt) => v + (to - v) * (1 - Math.exp(-dt / (Math.abs(to) > Math.abs(v) ? up : down)));
  const h = {
    // (at: where the pointer is over the world, or null)
    // (from: where the point was when the world last stepped)
    // (dip: how far the rod is in the water, 0..1, at rodAt; eddies: its wake, { x, y, vx, vy, t }; wake: where it
    // was when it last left one)
    // (coldAt: when the cold probe was last chilling the water)
    // (stroke: the rod's last move, frame to frame, and when)
    tool: 'loupe', reach, held: false, last: null, at: null, from: null, dip: 0, rodAt: null, eddies: [], wake: null, stroke: null, coldAt: -Infinity,
    lamp: { x: 0, y: 0, r: reach, v: 0 }, stage: { x: 0, y: 0, r: reach, v: 0 },
    // the ridden cell and where it is steered: [x, y, strength]; the pipette's draw: [x, y, reach, speed] (the page's)
    rider: NONE, will: null, suck: null,
    // the record: one entry per act (a tool held, or a run of taps and pricks in one place), its times simulated
    acts: [],
    get touched() { return h.acts.length > 0; },
    /** How much of the lamp's, shade's, stage's or probe's full strength the tool in hand has now (0..1). */
    get level() {
      const t = h.tool, v = t === 'lamp' || t === 'shade' ? h.lamp.v / (t === 'lamp' ? LAMP : -SHADE) : t === 'warm' || t === 'cold' ? h.stage.v * (t === 'warm' ? 1 : -1) : 0;
      return Math.max(0, v);
    },
    /** A world begun or put in place: its record of acts (kept with it), nothing of the last world's still acting. */
    reset(acts = []) {
      h.up(); h.acts = acts; h.rider = NONE; h.will = null; h.suck = null;
      h.lamp.v = h.stage.v = h.dip = 0; h.eddies = []; h.coldAt = -Infinity;
    },
    /** The tool in hand (an id of TOOLS); taking one lets go of the last. */
    set(id, t) { h.up(t); h.tool = toolOf(id).id; },
    /** The pointer over the world at (x, y), or away from it (hover(null)): the lamp and stage follow it. */
    hover(x, y) { h.at = x == null ? null : [x, y]; },
    /** The pointer pressed at world point (x, y), simulated time t. */
    down(x, y, t) {
      h.held = true; h.last = h.at = h.from = [x, y];
      if (works(h.tool) && h.tool !== 'pipette') act(t, x, y);
    },
    /** The pointer moved to (x, y). */
    move(x, y) {
      if (h.held) h.last = h.at = [x, y];
    },
    /** The world stepped with the words last written: what the needle and the rod passed is behind them. */
    stepped() { h.from = h.held ? h.last : null; },
    /** The pointer let go at simulated time t: a held act ends. */
    up(t) {
      const a = h.acts[h.acts.length - 1];
      if (h.held && t != null && a && a.tool === h.tool) a.end = Math.max(a.end, t);
      h.held = false; h.from = null;
    },
    /** A tap with Touch: a drop's ring from (x, y). */
    tap(x, y, t) { ring(x, y, t, 2.5); act(t, x, y, 1); },
    /** An act the page does with a tool (the pipette drawing up or setting down n cells at (x, y)). */
    note(tool, x, y, t, n = 0) { act(t, x, y, n, tool); },
    /** The needle pricked cell id at (x, y). */
    prick(id, x, y, t) { ids[20] = id >>> 0; act(t, x, y, 1); },
    /** Steer the ridden cell id toward (x, y) at strength s (0..1), at simulated time t; steer(NONE) lets it go. */
    steer(id, x = 0, y = 0, s = 0, t = null) {
      h.rider = id >>> 0;
      h.will = h.rider === NONE ? null : [x, y, s];
      if (s > 0 && t != null) act(t, x, y, 0, 'ride');
    },
    /** Ease the lamp, stage and rod toward what the hand is doing at simulated time t, and write the engine's words. */
    update(dt, t = 0) {
      const p = h.held ? h.last : h.at, tl = h.tool;
      // (over the world a little of the tool, pressed all of it; it goes where the pointer goes, and with it)
      const s = !p ? 0 : h.held ? 1 : HOVER;
      const lampTo = tl === 'lamp' ? LAMP * s : tl === 'shade' ? -SHADE * s : 0;
      const stageTo = tl === 'warm' ? s : tl === 'cold' ? -s : 0;
      // (a lamp lit where a shade was, or the reverse, starts afresh)
      if (lampTo && Math.sign(lampTo) !== Math.sign(h.lamp.v)) h.lamp.v = 0;
      if (stageTo && Math.sign(stageTo) !== Math.sign(h.stage.v)) h.stage.v = 0;
      if (p) Object.assign(h.lamp, { x: p[0], y: p[1], r: h.reach });
      if (p) Object.assign(h.stage, { x: p[0], y: p[1], r: h.reach });
      h.lamp.v = settle(ease(h.lamp.v, lampTo, EASE.lamp, dt), lampTo);
      h.stage.v = settle(ease(h.stage.v, stageTo, EASE.stage, dt), stageTo);
      // the needle or the rod let down into the water, and where it was when the world last stepped (the needle's
      // stroke since then cuts the bonds it crosses); the rod dips in a moment, pushing out wider as it goes deeper
      const f = h.held && p ? h.from || p : null, needle = f && tl === 'needle';
      const cut = needle && Math.hypot(p[0] - f[0], p[1] - f[1]) > 1e-4;
      h.dip = settle(ease(h.dip, h.held && tl === 'touch' ? 1 : 0, EASE.dip, dt), h.held && tl === 'touch');
      if (p && tl === 'touch') h.rodAt = p;
      const rod = h.dip > 0 && h.rodAt, rf = rod && (f || h.rodAt);
      wake(rod && h.rodAt, t);
      const w = h.will || [0, 0, 0];
      words.set([h.lamp.x, h.lamp.y, h.lamp.r, h.lamp.v, h.stage.x, h.stage.y, h.stage.r, h.stage.v,
        ...(rod ? [...h.rodAt, ...rf] : [0, 0, 0, 0]), ...(cut ? [...f, ...p] : [0, 0, 0, 0]), rod ? h.reach * Math.sqrt(h.dip) : 0, cut ? CUT : 0, w[0], w[1]]);
      ids[21] = h.rider;
      words[22] = w[2];
      words.set(h.suck || [0, 0, 0, 0], 24);
      // (its point, and as much of its shaft as is in the water, running off toward its corner)
      const nd = INSTRUMENTS.needle.dir;
      words.set(needle ? [p[0], p[1], nd[0] * NEEDLE.wet, nd[1] * NEEDLE.wet] : [0, 0, 0, 0], 28);
      // the wake's eddies, as strong as they still are, and their size (0: none)
      words.fill(0, 32);
      h.eddies.forEach((e, k) => { const s = Math.exp(-(t - e.t) / WAKE.life); words.set([e.x, e.y, e.vx * s, e.vy * s], 36 + k * 4); });
      words[32] = h.eddies.length ? h.reach : 0;
      // (the water it chilled may stay frozen a while after)
      if (h.stage.v < 0) h.coldAt = t;
      words[33] = t - h.coldAt < ICE_KEEPS ? 1 : 0;
    },
  };
  // a ring wave from (x, y), of strength s, in the oldest of the raindrop slots
  function ring(x, y, t, s) {
    let k = 0;
    for (let j = 1; j < 4; j++) if (drops[j * 4 + 2] < drops[k * 4 + 2]) k = j;
    drops.set([x, y, t, s], k * 4);
  }
  // The rod in the water at `at` (or out of it, null) at simulated time t: an eddy left every WAKE.every seconds,
  // with the velocity it moved at since the last; a stroke turned back rings out a wave. Faded eddies go.
  function wake(at, t) {
    h.eddies = h.eddies.filter((e) => t >= e.t && t - e.t < 5 * WAKE.life);
    if (!at) { h.wake = h.stroke = null; return; }
    // (frame to frame, so a quick shake is seen however fast it is)
    const st = h.stroke;
    if (!st) h.stroke = { x: at[0], y: at[1], t, dx: 0, dy: 0 };
    else if (t > st.t) {
      const dx = at[0] - st.x, dy = at[1] - st.y;
      if (dx || dy) {
        if (Math.hypot(dx, dy) / (t - st.t) > WAKE.turn && dx * st.dx + dy * st.dy < 0) ring(at[0], at[1], t, Math.min(2.5, 0.15 * Math.hypot(dx, dy) / (t - st.t)));
        h.stroke = { x: at[0], y: at[1], t, dx, dy };
      }
    }
    const lw = h.wake;
    if (lw && t - lw.t < WAKE.every) return;
    h.wake = { x: at[0], y: at[1], t };
    if (!lw || t <= lw.t) return;
    let vx = (at[0] - lw.x) / (t - lw.t), vy = (at[1] - lw.y) / (t - lw.t);
    const v = Math.hypot(vx, vy), c = v > WAKE.max / WAKE.couple ? WAKE.max / WAKE.couple / v : 1;
    vx *= c; vy *= c;
    if (v > 0.2) h.eddies = [...h.eddies, { x: (at[0] + lw.x) / 2, y: (at[1] + lw.y) / 2, vx: vx * WAKE.couple, vy: vy * WAKE.couple, t }].slice(-WAKE.n);
  }
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
