// Event types reported by the GPU listening scan (LISTEN_WGSL in shaders.js; the order must match
// LISTEN_TYPES there) and the decoding of its records for the audio thread.
export const LISTEN = {
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
 * Records (4 words each) → Float32Array, 8 per event: type, slot, x, y (0..1 across the view),
 * age (sim seconds; for 'alive', energy toward division 0..1.5), speed (0..1 of vscale), hue,
 * a per-particle byte.
 * Also returns how many of each type were recorded.
 */
export function decodeRecords(u32, f32) {
  const n = u32.length >> 2, out = new Float32Array(n * 8), recorded = new Uint32Array(9);
  for (let i = 0; i < n; i++) {
    const w = u32[i * 4], uv = u32[i * 4 + 1], o = i * 8, t = w & 15;
    out[o] = t; out[o + 1] = (w >>> 4) & 1023;
    out[o + 2] = (uv & 0xffff) / 65535; out[o + 3] = (uv >>> 16) / 65535;
    out[o + 4] = f32[i * 4 + 2]; out[o + 5] = (w >>> 24) / 255;
    out[o + 6] = hueOf(u32[i * 4 + 3]); out[o + 7] = (w >>> 16) & 255;
    if (t < 9) recorded[t]++;
  }
  return { ev: out, recorded };
}

/** Per-type keep probabilities for the next scan, from this scan's counts. */
export function keepFor(inView, wallWindow, target = LISTEN.target) {
  const keep = new Array(9);
  for (let t = 0; t < 9; t++) keep[t] = Math.min(1, (target[t] * wallWindow) / Math.max(1, inView[t]));
  return keep;
}

// Listener distance in world units: the side of the view. dRef is a patch of about a dozen cells.
export const D_REF = 1.2, D_FAR = 20;
// living cells' typical speed (world units per second) maps to activity 1
export const V_SCALE = 0.4;
/** Distance gain (dRef/d, capped) and closeness z (0 far .. 1 at dRef or nearer). */
export function hearing(hx, hy) {
  const d = Math.sqrt(4 * hx * hy);
  return { d, gd: Math.min(1.25, D_REF / d), z: clamp01(Math.log(D_FAR / d) / Math.log(D_FAR / D_REF)) };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * One scan (engine.onListen data) → the message for the audio thread, and keep probabilities
 * for the next scan. speed: sim seconds per wall second; selSlot/lit: selection and highlight.
 */
export function digest(data, { speed = 1, selSlot = -1, lit = null, vscale = V_SCALE } = {}) {
  const { ev, recorded } = decodeRecords(data.records, data.f32);
  const { gd, z } = hearing(data.view.hx, data.view.hy);
  const wall = data.window / Math.max(speed, 1e-6);
  const inView = [...data.inView, data.living]; // events per type, then living cells in view
  return {
    msg: {
      type: 'listen', window: data.window, speed, z, gd,
      inView, outView: [...data.outView, Math.max(0, data.livingAll - data.living)], recorded: Array.from(recorded),
      living: data.living, act: Math.min(1.5, data.speed / vscale), ev, selSlot, lit,
    },
    keep: keepFor(inView, wall),
  };
}
