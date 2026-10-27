// The pool's floor (docs/catastrophes.md): each world's relief, a smooth periodic height field on the binning grid,
// stored as each grid cell's quantile (0 the deepest, 1 the highest), so a water level L leaves the share 1 - L of the
// floor dry. Shared by the page and headless runs; the GPU reads it bilinearly (thermal block 1).

// A small seeded generator (mulberry32), so a world's floor depends only on its seed.
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Relief of a gw × gh torus: a sum of periodic waves with wavelengths from about `minL` to `maxL` world units (red:
 * long waves carry most of the height), its coordinates warped by a second such sum so basins and ridges are organic
 * rather than sinusoidal, then ranked into quantiles.
 */
export function makeRelief(gw, gh, seed, { minL = 10, maxL = 70, modes = 28, warp = 6 } = {}) {
  const rng = seededRng(seed ^ 0x9e3779b9);
  const waves = (n, lo, hi, pow) => Array.from({ length: n }, () => {
    const L = lo * (hi / lo) ** rng();
    const th = rng() * Math.PI * 2;
    let kx = Math.round((gw / L) * Math.cos(th)), ky = Math.round((gh / L) * Math.sin(th));
    if (kx === 0 && ky === 0) kx = 1;
    const len = Math.hypot(kx / gw, ky / gh);
    return { ax: (2 * Math.PI * kx) / gw, ay: (2 * Math.PI * ky) / gh, ph: rng() * Math.PI * 2, amp: len ** -pow };
  });
  const H = waves(modes, minL, Math.min(maxL, Math.max(gw, gh)), 1.1);
  const WX = waves(6, minL * 1.5, maxL, 0.5), WY = waves(6, minL * 1.5, maxL, 0.5);
  // a sum of waves at the cell centers, separably: cos(ax x + ay y + ph) = cos(ax x) cos(ay y + ph) - sin(ax x) sin(ay y + ph)
  const field = (ws) => {
    const out = new Float32Array(gw * gh), norm = ws.reduce((a, w) => a + w.amp, 0);
    const cx = new Float32Array(gw), sx = new Float32Array(gw), cy = new Float32Array(gh), sy = new Float32Array(gh);
    for (const w of ws) {
      for (let x = 0; x < gw; x++) { cx[x] = Math.cos(w.ax * (x + 0.5)); sx[x] = Math.sin(w.ax * (x + 0.5)); }
      for (let y = 0; y < gh; y++) { cy[y] = Math.cos(w.ay * (y + 0.5) + w.ph) * w.amp / norm; sy[y] = Math.sin(w.ay * (y + 0.5) + w.ph) * w.amp / norm; }
      for (let y = 0; y < gh; y++) { const c = cy[y], sn = sy[y], row = y * gw; for (let x = 0; x < gw; x++) out[row + x] += cx[x] * c - sx[x] * sn; }
    }
    return out;
  };
  const base = field(H), wx = field(WX), wy = field(WY);
  // warped: each cell reads the smooth field at a displaced point (bilinear, across the wraps)
  const at = (x, y) => {
    const fx = Math.floor(x), fy = Math.floor(y), tx = x - fx, ty = y - fy;
    const x0 = ((fx % gw) + gw) % gw, y0 = ((fy % gh) + gh) % gh, x1 = (x0 + 1) % gw, y1 = (y0 + 1) % gh;
    return (base[y0 * gw + x0] * (1 - tx) + base[y0 * gw + x1] * tx) * (1 - ty) + (base[y1 * gw + x0] * (1 - tx) + base[y1 * gw + x1] * tx) * ty;
  };
  const h = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; h[i] = at(x + warp * 2 * wx[i], y + warp * 2 * wy[i]); }
  return rankField(h);
}

/** A field ranked into quantiles: each cell's share of the field lying lower than it. */
export function rankField(h) {
  const n = h.length, sorted = Float32Array.from(h).sort(), q = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = n;
    const v = h[i];
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    q[i] = (lo + 0.5) / n;
  }
  return q;
}

/** How many separate pools the water stands in at `level` (wet grid cells joined side to side, across the wraps),
 * counting those of at least `min` cells; and the largest one's share of the wet floor. */
export function countPools(q, gw, gh, level, min = 6) {
  const seen = new Uint8Array(gw * gh), stack = [];
  let pools = 0, wet = 0, largest = 0;
  for (let s = 0; s < gw * gh; s++) {
    if (seen[s] || q[s] > level) continue;
    let size = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const c = stack.pop(), x = c % gw, y = (c - x) / gw;
      size++;
      for (const n of [y * gw + (x + 1) % gw, y * gw + (x + gw - 1) % gw, ((y + 1) % gh) * gw + x, ((y + gh - 1) % gh) * gw + x]) {
        if (!seen[n] && q[n] <= level) { seen[n] = 1; stack.push(n); }
      }
    }
    wet += size;
    if (size >= min) pools++;
    largest = Math.max(largest, size);
  }
  return { pools, largest: wet ? largest / wet : 0 };
}

/**
 * The order in which the pool freezes (frost, docs/catastrophes.md): each grid cell's quantile, 0 the first to freeze.
 * Ice grains grow from the shallows and from their centers outward and meet along the zero lines of a random field,
 * which freeze last: the liquid left between grains is a network of veins (brine channels).
 */
export function makeIceOrder(gw, gh, seed, relief = null) {
  const v = makeRelief(gw, gh, seed ^ 0x5bd1e995, { minL: 7, maxL: 28, modes: 24, warp: 2 });
  const h = new Float32Array(gw * gh);
  for (let i = 0; i < h.length; i++) h[i] = -Math.abs(v[i] - 0.5) * 2 - (relief ? 0.35 * relief[i] : 0);
  return rankField(h);
}
