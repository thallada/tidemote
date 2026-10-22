// The pool's floor (docs/catastrophes.md): each world's relief, a smooth periodic height field on the binning grid,
// stored as each grid cell's quantile (0 the deepest, 1 the highest), so a water level L leaves the share 1 - L of the
// floor dry. Shared by the page and headless runs; the GPU reads it bilinearly (thermal block 3).

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
  const sum = (ws, x, y) => { let s = 0, n = 0; for (const w of ws) { s += w.amp * Math.cos(w.ax * x + w.ay * y + w.ph); n += w.amp; } return s / n; };
  const n = gw * gh, h = new Float32Array(n);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      h[y * gw + x] = sum(H, cx + warp * sum(WX, cx, cy) * 2, cy + warp * sum(WY, cx, cy) * 2);
    }
  }
  // ranked: each cell's share of the floor lying lower than it
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => h[a] - h[b]);
  const q = new Float32Array(n);
  order.forEach((i, r) => { q[i] = (r + 0.5) / n; });
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
