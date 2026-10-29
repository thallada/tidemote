// The viewer's hand (docs/hand.md): the bench's tools, what the one in hand does to the world, and the record of
// what it has done. Every tool is a local cause the world could have made itself (a lamp is more sun on one
// place, a stir a gust, the needle a hunter), written into the engine's hand words (Hand in simWGSL), which are
// zero in every headless run. Pure but for those words; the page feeds it the pointer in world units.

export const TOOLS = [
  { id: 'none', name: 'No tool', hint: 'Nothing in hand: click a cell to examine it, drag to pan' },
  { id: 'loupe', name: 'Loupe', hint: 'The lens follows the pointer: click a cell to examine it · Reach sizes it, [ ] magnify', touch: 'A tap examines a cell and sets the lens over it · drag the lens to move it, outside it to pan' },
  { id: 'touch', name: 'Touch', hint: 'Tap: a drop’s ring · drag: stir the water along the stroke' },
  { id: 'lamp', name: 'Lamp', hint: 'More sun where it points, a little; hold for the full lamp' },
  { id: 'shade', name: 'Shade', hint: 'Shade where it points, a little; hold to darken it' },
  { id: 'warm', name: 'Warm', hint: 'The heated stage: hold to warm the water under it, as far as a boil' },
  { id: 'cold', name: 'Cold', hint: 'The cold probe: hold to chill the water under it, as far as ice' },
  { id: 'needle', name: 'Needle', hint: 'Pressed, it goes into the water: its point pricks the cells it touches (a tap, the nearest), its shaft pushes the rest aside · drag: cut through' },
  { id: 'pipette', name: 'Pipette', hint: 'Load: a click draws up every cell in reach, held harder · Dispense (or ⇧ click) sets the tip species down, a cell at a time', touch: 'Load: a touch draws up every cell in reach, held harder · Dispense: touches set the tip species down' },
];
export const toolOf = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];
// (no tool is 0, the tools 1 to 8)
export const keyOf = (id) => String(TOOLS.findIndex((t) => t.id === id));
/** Whether a tool acts on the world (not none, not the loupe, which only look). */
export const works = (id) => id !== 'none' && id !== 'loupe';
// The way each instrument seen in the water runs off from its point (unit, world axes: y down the screen), and its
// kind in the composite (the engine's tool words)
export const INSTRUMENTS = { needle: { kind: 1, dir: [0.86, 0.51] }, pipette: { kind: 2, dir: [0.86, -0.51] }, cold: { kind: 3, dir: [-0.86, 0.51] } };

// The reach of every tool but the needle, in world units (1 unit is about 59 µm): the slider's range and default.
export const REACH = { min: 0.6, max: 8, def: 2 };
const LAMP = 0.6; // the light a lamp adds within its reach, at full brightness (the sun at noon gives about 1)
const SHADE = 0.9; // the share of the light a shade takes
const HOVER = 0.25; // the lamp, shade, stage and probe over the world, not pressed: this much of their full strength
const STIR_MAX = 12; // the fastest the finger drags the water at the default reach, world units a second (a wider
// reach drags it harder, a narrower one less: as the square root of the reach)
const CUT = 0.32; // the needle's half-width: it cuts bonds and parts cells this far to either side (past LINK_R apart)
// how the lamp and stage come up while held and go when let go (time constants, real seconds)
const EASE = { lamp: [0.35, 0.3], stage: [0.25, 0.25], stir: [0.08, 0.8] };
const NONE = 0xffffffff;

/**
 * words, ids: the engine's hand words (eng.hand, eng.handU), which update() writes. The page calls down, move and
 * up with world points, tap and prick for Touch's taps and the needle's cell, and update(dt) every frame.
 */
export function createHand(words, ids, { reach = REACH.def } = {}) {
  const ease = (v, to, [up, down], dt) => v + (to - v) * (1 - Math.exp(-dt / (Math.abs(to) > Math.abs(v) ? up : down)));
  const h = {
    // (at: where the pointer is over the world, or null)
    tool: 'loupe', reach, held: false, last: null, at: null, vel: [0, 0], cut: null,
    // how far the needle's shaft runs back from its point (world units: the page sets it to the view's diagonal)
    span: 40,
    lamp: { x: 0, y: 0, r: reach, v: 0 }, stage: { x: 0, y: 0, r: reach, v: 0 }, stir: { x: 0, y: 0, vx: 0, vy: 0 },
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
    /** Whether anything the hand did still acts on the world (a lamp fading, the stage still warming). */
    get acting() { return h.lamp.v !== 0 || h.stage.v !== 0 || h.stir.vx !== 0 || h.stir.vy !== 0; },
    /** A world begun or put in place: its record of acts (kept with it), nothing of the last world's still acting. */
    reset(acts = []) {
      h.up(); h.acts = acts; h.cut = null; h.rider = NONE; h.will = null; h.suck = null;
      h.lamp.v = h.stage.v = h.stir.vx = h.stir.vy = 0;
    },
    /** The tool in hand (an id of TOOLS); taking one lets go of the last. */
    set(id, t) { h.up(t); h.tool = toolOf(id).id; },
    /** The pointer over the world at (x, y), or away from it (hover(null)): the lamp and stage follow it. */
    hover(x, y) { h.at = x == null ? null : [x, y]; },
    /** The pointer pressed at world point (x, y), simulated time t. */
    down(x, y, t) {
      h.held = true; h.last = h.at = [x, y]; h.vel = [0, 0];
      if (works(h.tool) && h.tool !== 'pipette') act(t, x, y);
    },
    /** The pointer moved to (x, y), dt real seconds since its last move, the world running at `speed`. */
    move(x, y, dt, speed) {
      if (!h.held) return;
      const [lx, ly] = h.last;
      // (the stroke since the last frame, however many moves it took)
      if (h.tool === 'needle') h.cut = [...(h.cut ? h.cut.slice(0, 2) : [lx, ly]), x, y];
      // the water a finger drags moves as the finger does, in the world's seconds
      const k = dt > 0 && speed > 0 && Number.isFinite(speed) ? 1 / (dt * speed) : 0;
      const g = Math.sqrt(h.reach / REACH.def), vx = (x - lx) * k * g, vy = (y - ly) * k * g, m = Math.hypot(vx, vy);
      const c = m > STIR_MAX * g ? (STIR_MAX * g) / m : 1;
      h.vel = [vx * c, vy * c];
      h.last = h.at = [x, y];
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
    /** Ease the lamp, stage and stir toward what the hand is doing, and write the engine's words. */
    update(dt) {
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
      words.set(h.suck || [0, 0, 0, 0], 24);
      // (the needle let down into the water: its point, and its shaft running off toward its corner)
      const nd = INSTRUMENTS.needle.dir, down = h.held && tl === 'needle' && p;
      words.set(down ? [p[0], p[1], nd[0] * h.span, nd[1] * h.span] : [0, 0, 0, 0], 28);
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
