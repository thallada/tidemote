// Gamepads (docs/controller.md): read every frame from navigator.getGamepads(), turned into presses, taps, holds,
// repeats and stick vectors. The core (padStep) is pure, a snapshot in and events out, so tests drive it with
// recorded snapshots; createPads() is the browser's side.
//
// What the Gamepad API is like: no pad shows until a button is pressed with the page in view (a fingerprinting
// gate), so "no pad" is never final; the list is read fresh each frame (Chrome hands back a fixed array with holes,
// and a pad plugged in again may take another's index); triggers are buttons with an analog value, except on pads
// without the standard mapping (and older Firefox on Linux), where they can be axes; and Steam's virtual pad and the
// raw device it stands for can both show. Every pad's state is merged into one (a press on either is a press;
// the stronger stick wins), which makes such duplicates harmless.
import { BTN, HOLD_MS, padBinding } from './actions.js';

export const DEADZONE = 0.18;   // a stick's rest (sticks rest a little off zero)
const TRIGGER_ON = 0.35; // a trigger read as a press past this
export const REPEAT_MS = [400, 90]; // a held direction repeats after the first, then every second

/** A stick's (x, y) with a scaled radial deadzone: 0 inside it, then rising from 0 to 1 along the same direction. */
export function radial(x, y, dz = DEADZONE) {
  const m = Math.hypot(x, y);
  if (m <= dz) return [0, 0];
  const s = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * s, y * s];
}

/**
 * One frame's snapshot of the pads: { buttons: 17 values 0..1, axes: [lx, ly, rx, ry], id, standard, any }.
 * pads: what navigator.getGamepads() gave (nulls and all). A pad without the standard mapping gives only its first
 * four buttons and left stick, whose places are the likeliest to agree with the standard's.
 */
export function snapshot(pads) {
  const buttons = new Array(17).fill(0), axes = [0, 0, 0, 0];
  let id = null, standard = true, any = false, best = -1;
  for (const p of pads || []) {
    if (!p || p.connected === false) continue;
    any = true;
    const std = p.mapping === 'standard';
    const n = std ? Math.min(17, p.buttons.length) : Math.min(4, p.buttons.length);
    let act = 0;
    // (a digital button may say pressed with a value of 0)
    for (let i = 0; i < n; i++) { const b = p.buttons[i], v = typeof b === 'number' ? b : b.value > 0 ? b.value : b.pressed ? 1 : 0; buttons[i] = Math.max(buttons[i], v); act += v; }
    for (let i = 0; i < Math.min(std ? 4 : 2, p.axes.length); i++) { const v = p.axes[i] || 0; if (Math.abs(v) > Math.abs(axes[i])) axes[i] = v; act += Math.abs(v) > DEADZONE ? 1 : 0; }
    // the pad named is the one being used (for its glyphs): the busiest this frame, the first otherwise
    if (act > best) { best = act; id = p.id; standard = std; }
  }
  return { buttons, axes, id, standard, any };
}

/** A pad's state between frames. */
export function createPadState() {
  return { down: new Array(17).fill(-1), held: new Array(17).fill(false), next: new Array(17).fill(0), left: [0, 0], right: [0, 0], lt: 0, rt: 0, active: false };
}

const pressed = (snap, b) => (b === BTN.LT || b === BTN.RT ? snap.buttons[b] > TRIGGER_ON : snap.buttons[b] > 0.5);

/**
 * Step the state st by one frame's snapshot at time now (ms) in context ctx ('world', 'tool', 'ride', 'panel'), and
 * return the actions it asks for, in order: [{ id, btn }]. Sticks and triggers are left in st (left, right: deadzoned
 * vectors; lt, rt: 0..1). st.active is whether anything on the pad moved (a press, or a stick or trigger past its rest).
 * A button bound to a tap acts when let go before HOLD_MS, its hold at HOLD_MS (once); a repeating one again after
 * REPEAT_MS. Contexts change between frames: a hold or tap is read in the context it began in.
 */
export function padStep(st, snap, now, ctx = 'world') {
  const out = [];
  st.active = false;
  for (let b = 0; b < 17; b++) {
    const on = pressed(snap, b);
    if (on && st.down[b] < 0) {
      st.down[b] = now; st.held[b] = false; st.ctx = st.ctx || [];
      st.ctx[b] = ctx; st.active = true;
      const bind = padBinding(b, ctx);
      if (bind?.press) { out.push({ id: bind.press, btn: b }); st.next[b] = bind.repeat ? now + REPEAT_MS[0] : Infinity; }
    } else if (on) {
      const bind = padBinding(b, st.ctx[b]);
      if (bind?.hold && !st.held[b] && now - st.down[b] >= HOLD_MS) { st.held[b] = true; out.push({ id: bind.hold, btn: b }); }
      if (bind?.press && bind.repeat && now >= st.next[b]) { st.next[b] = now + REPEAT_MS[1]; out.push({ id: bind.press, btn: b, repeat: true }); }
    } else if (st.down[b] >= 0) {
      const bind = padBinding(b, st.ctx[b]);
      if (bind?.tap && !st.held[b]) out.push({ id: bind.tap, btn: b });
      if (bind?.hold && st.held[b]) out.push({ id: `${bind.hold}:end`, btn: b });
      st.down[b] = -1; st.held[b] = false;
    }
  }
  st.left = radial(snap.axes[0], snap.axes[1]);
  st.right = radial(snap.axes[2], snap.axes[3]);
  st.lt = snap.buttons[BTN.LT] > 0.05 ? snap.buttons[BTN.LT] : 0;
  st.rt = snap.buttons[BTN.RT] > 0.05 ? snap.buttons[BTN.RT] : 0;
  if (st.left[0] || st.left[1] || st.right[0] || st.right[1] || st.lt || st.rt) st.active = true;
  return out;
}

/** Let go of everything (focus lost, the page hidden, a pad unplugged): ends holds without their taps. */
export function releaseAll(st) {
  const out = [];
  for (let b = 0; b < 17; b++) {
    if (st.down[b] >= 0 && st.held[b]) { const bind = padBinding(b, st.ctx?.[b]); if (bind?.hold) out.push({ id: `${bind.hold}:end`, btn: b, cancel: true }); }
    st.down[b] = -1; st.held[b] = false;
  }
  st.left = [0, 0]; st.right = [0, 0]; st.lt = st.rt = 0; st.active = false;
  return out;
}

/** The browser's side: poll() once a frame returns the frame's actions; state() the sticks and triggers. */
export function createPads({ win = globalThis, getPads = () => win.navigator?.getGamepads?.() || [] } = {}) {
  const st = createPadState();
  // (read every frame whether or not a pad has announced itself: the list costs next to nothing, and a pad shows
  // in it only after its first press anyway)
  let connected = false, id = null, lost = [];
  const drop = () => { lost.push(...releaseAll(st)); };
  win.addEventListener?.('gamepaddisconnected', drop);
  win.addEventListener?.('blur', drop);
  win.document?.addEventListener?.('visibilitychange', () => { if (win.document.hidden) drop(); });
  return {
    get connected() { return connected; },
    get id() { return id; },
    state: st,
    poll(now, ctx) {
      const out = lost; lost = [];
      let pads;
      try { pads = getPads(); } catch { return out; } // a permissions policy that blocks the pad throws
      const snap = snapshot(pads);
      if (!snap.any) { if (connected) out.push(...releaseAll(st)); connected = false; return out; }
      connected = true;
      if (snap.id) id = snap.id;
      out.push(...padStep(st, snap, now, ctx));
      return out;
    },
  };
}
