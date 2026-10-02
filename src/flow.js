// CPU counterparts of the tide and divergence-free currents in shaders.js.
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Phase of each tide wave; every world draws its own (see Engine.randomizeTide).
export const TIDE_PHASE = [0, 1.7, 3.4, 5.1];

export function tideAt(x, y, W, H, t, w, ph = TIDE_PHASE) {
  const ux = (x / W) * TAU, uy = (y / H) * TAU;
  let s = 0, n = 0;
  for (let k = 0; k < 4; k++) {
    s += w[k * 4 + 3] * Math.sin(w[k * 4] * ux + w[k * 4 + 1] * uy + w[k * 4 + 2] * t + ph[k]);
    n += w[k * 4 + 3];
  }
  return smoothstep(0.35, 1.9, (s * 2.7) / Math.max(n, 1e-3));
}

// The same divergence-free currents the GPU uses.
export function flowAt(x, y, t, w) {
  let vx = 0, vy = 0;
  for (let k = 0; k < 4; k++) {
    const kx = w[k * 4], ky = w[k * 4 + 1];
    const c = (Math.cos(kx * x + ky * y + w[k * 4 + 2] * t + k * 1.7) * w[k * 4 + 3]) / Math.max(Math.hypot(kx, ky), 1e-4);
    vx += ky * c; vy -= kx * c;
  }
  return [vx, vy];
}

