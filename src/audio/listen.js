// Event types reported by the GPU listening scan (LISTEN_WGSL in shaders.js; the order must match
// LISTEN_TYPES there) and the decoding of its records for the audio thread.
// words per record: LISTEN_REC in shaders.js (not imported: this module runs in the audio thread)
export const LISTEN_REC = 6;

export const LISTEN = {
  stride: 9, // floats per decoded event (decodeRecords)
  types: ['birth', 'mutation', 'spark', 'starved', 'old', 'killed', 'eaten', 'charged', 'alive'],
  index: { birth: 0, mutation: 1, spark: 2, starved: 3, old: 4, killed: 5, eaten: 6, charged: 7, alive: 8 },
  // how many of each type per second the scan reports at most (it samples down to this); 'alive'
  // is a sample of the living cells in view
  target: [14, 1e3, 1e3, 4, 4, 6, 12, 10, 60],
};

const hueOf = (col) => {
  const r = (col & 255) / 255, g = ((col >>> 8) & 255) / 255, b = ((col >>> 16) & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h / 6) % 1 + 1) % 1;
};

/**
 * Records (LISTEN_REC words each) → Float32Array, LISTEN.stride per event: type, slot, x, y (0..1
 * across the view), age (sim seconds; for 'alive', energy toward division 0..1.5), speed (0..1 of
 * vscale), hue, a per-particle byte, cell type (0 α, 1 β, 2 γ).
 * Also returns how many of each type were recorded.
 */
export function decodeRecords(u32, f32) {
  const R = LISTEN_REC, S = LISTEN.stride, n = Math.floor(u32.length / R), out = new Float32Array(n * S), recorded = new Uint32Array(9);
  for (let i = 0; i < n; i++) {
    const w = u32[i * R], uv = u32[i * R + 1], o = i * S, t = w & 15;
    out[o] = t; out[o + 1] = (w >>> 4) & 1023;
    out[o + 2] = (uv & 0xffff) / 65535; out[o + 3] = (uv >>> 16) / 65535;
    out[o + 4] = f32[i * R + 2]; out[o + 5] = (w >>> 24) / 255;
    out[o + 6] = hueOf(u32[i * R + 3]); out[o + 7] = (w >>> 16) & 255; out[o + 8] = (w >>> 14) & 3;
    if (t < 9) recorded[t]++;
  }
  return { ev: out, recorded };
}

const f16 = (h) => { // IEEE half → number (WGSL pack2x16float)
  const s = h & 0x8000 ? -1 : 1, e = (h >>> 10) & 31, m = h & 1023;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
};

/**
 * Where each recorded particle was in the world and where it was going, 5 floats per record:
 * x, y, vx, vy (world units, per sim second) and its particle id. For marking the cells that sing.
 */
export function recordCells(u32, view) {
  // 64-bit, so particle ids (a counter that passes 2^24 in a long or large world) stay exact
  const R = LISTEN_REC, n = Math.floor(u32.length / R), out = new Float64Array(n * 5);
  for (let i = 0; i < n; i++) {
    const uv = u32[i * R + 1], vel = u32[i * R + 4], o = i * 5;
    out[o] = view.x + ((uv & 0xffff) / 65535 - 0.5) * 2 * view.hx;
    out[o + 1] = view.y + ((uv >>> 16) / 65535 - 0.5) * 2 * view.hy;
    out[o + 2] = f16(vel & 0xffff); out[o + 3] = f16(vel >>> 16); out[o + 4] = u32[i * R + 5];
  }
  return out;
}

/** Per-type keep probabilities for the next scan, from this scan's counts. */
export function keepFor(inView, wallWindow, target = LISTEN.target) {
  const keep = new Array(9);
  for (let t = 0; t < 9; t++) keep[t] = Math.min(1, (target[t] * wallWindow) / Math.max(1, inView[t]));
  return keep;
}

// Listener distance in world units: the side of the view. dRef is a patch of about a dozen cells:
// sounds are as loud as dRef / d. Closeness z (timbre, reverb, single voices over the swarm)
// follows what the page shows: none from dFar, where cells blur into a haze (under ~25 px per
// unit on a 1920 px screen), full from dNear, where their shapes resolve (~120 px per unit).
export const D_REF = 1.2, D_NEAR = 12, D_FAR = 60;
// living cells' typical speed (world units per second) maps to activity 1
export const V_SCALE = 0.4;
/** Distance gain (dRef/d, capped) and closeness z (0 far .. 1 at dRef or nearer). */
export function hearing(hx, hy) {
  const d = Math.sqrt(4 * hx * hy);
  return { d, gd: Math.min(1.25, D_REF / d), z: clamp01(Math.log(D_FAR / d) / Math.log(D_FAR / D_NEAR)) };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * One scan (engine.onListen data) → the message for the audio thread, and keep probabilities
 * for the next scan. speed: sim seconds per wall second; selSlot/lit: selection and highlight.
 */
export function digest(data, { speed = 1, selSlot = -1, lit = null, vscale = V_SCALE, seq = -1 } = {}) {
  const { ev, recorded } = decodeRecords(data.records, data.f32);
  const { gd, z } = hearing(data.view.hx, data.view.hy);
  const wall = data.window / Math.max(speed, 1e-6);
  const inView = [...data.inView, data.living]; // events per type, then living cells in view
  return {
    msg: {
      type: 'listen', window: data.window, speed, z, gd, seq,
      inView, outView: [...data.outView, Math.max(0, data.livingAll - data.living)], recorded: Array.from(recorded),
      living: data.living, act: Math.min(1.5, data.speed / vscale), ev, selSlot, lit,
    },
    keep: keepFor(inView, wall),
  };
}
