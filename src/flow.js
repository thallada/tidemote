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


// CPU counterpart of duckShade in shaders.js: the shade (0..1) a colony of duckweed casts at (x, y). d: the engine's
// duck (the uniforms' duck and duckB: center, half-length, darkness; turn, seed, width, daughters).
const fract = (x) => x - Math.floor(x);
const duckHash = (x) => { let p = fract(x * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); };
const mix = (a, b, t) => a + (b - a) * t;
function frondOf(d, k) {
  const [cx, cy, L0, , turn, seed, width] = d;
  const ax = [Math.cos(turn), Math.sin(turn)];
  if (k === 0) return { c: [cx, cy], ax, L: L0, W: L0 * width };
  const node = [cx - ax[0] * 0.7 * L0, cy - ax[1] * 0.7 * L0];
  const side = k === 2 ? -1 : 1;
  const back = side * (0.5 + 0.6 * duckHash(seed + k * 3.1) + (k === 3 ? 0.5 : 0));
  const c = Math.cos(back), s = Math.sin(back);
  const dax = [-c * ax[0] + s * ax[1], -s * ax[0] - c * ax[1]];
  const L = L0 * (k === 3 ? mix(0.25, 0.4, duckHash(seed + 9.3)) : mix(0.45, 0.85, duckHash(seed + k * 5.7)));
  return { c: [node[0] + dax[0] * 0.72 * L, node[1] + dax[1] * 0.72 * L], ax: dax, L, W: L * width * mix(0.9, 1.05, duckHash(seed + k * 7.9)) };
}
export function duckShade(x, y, d, W, H) {
  if (!(d[3] > 0)) return 0;
  let sh = 0;
  for (let k = 0; k <= d[7]; k++) {
    const f = frondOf(d, k);
    let dx = x - f.c[0], dy = y - f.c[1];
    dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
    const u = (dx * f.ax[0] + dy * f.ax[1]) / f.L, v = (f.ax[0] * dy - f.ax[1] * dx) / f.L;
    const r = Math.hypot(u, (v * f.L) / (f.W * (1 + 0.12 * clamp(u, -1, 1))));
    sh = Math.max(sh, 1 - smoothstep(-1.2, 1.2, (r - 1) * f.W));
  }
  return d[3] * sh;
}
