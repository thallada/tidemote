// The sea (docs/catastrophes.md): the water's surface, gently swaying in calm water and heaving in a storm (the same sea,
// higher, choppier and faster: Engine._seaPost), a Tessendorf FFT ocean (Simulating Ocean Water, 2001) in cascades, run
// on the GPU (SEA_WGSL in shaders.js) and seen through in the post pass (seaSurface).
// This is its CPU side: the cascades' layout over the world and each wave system's scale. Pure, tested in
// test/sea.test.js; tools/waterlook/ checks it on the GPU (docs/catastrophes.md).
//
// The sea is the size it would be: a pool a few millimetres to two centimetres across (a unit is 59 µm), stirred by the
// wind into ripples a millimetre or so long, with capillary ripples a few tenths of a millimetre on them, and nothing
// much shorter (viscosity damps it). It is fixed in the world, so zooming in only magnifies it: the surface lies far
// above the focal plane, out of focus, and under the microscope it shows only by what it does to the light, bending the
// view of what lies beneath and focusing the lamp into soft bands that sweep over it. A sea of many waves, so no
// pattern of a few beats into a quilt; laid on patches that divide the world, so it tiles it. Each system is a wind sea
// (a JONSWAP-like directional height spectrum: k^-p above its peak, cut below it, the peak enhanced by gamma,
// Longuet-Higgins spread about the wind).

export const SEA_N = 256; // samples a cascade's side
export const SEA_CASCADES = 2; // patches the world / 4^c across
export const SEA = {
  // the wind's ripples, and the capillary ripples riding them: peak wavelength (units), rms slope, spread about the
  // wind (cos^(2 spread) of half the angle off it)
  systems: [{ lp: 22, slope: 0.12, spread: 6 }, { lp: 7, slope: 0.06, spread: 3 }],
  lmin: 4, // ripples much shorter than this (units) are damped away
  texels: 8, // a cascade holds waves at least this many of its texels long (along its coarser axis); shorter, the next
  p: 5, // the height spectrum's fall above a peak (k^-p)
  gamma: 3.3, // the peaks' enhancement
  chop: 1.0, // how far the water is carried toward its crests (Tessendorf's choppiness)
  T: 1024, // the sea's motion loops over T seconds of its clock (each wave's frequency rounded to a multiple of 2 pi / T)
  Tp: 2.4, // the wind ripples' period in a storm (s; calm water's is longer, Engine._sea)
  beta: 0.5, // frequency grows as k^beta
};

/**
 * The cascades over a world wx × wy: each patch (L) and its band of wavenumbers (k0..k1). A cascade holds the waves at
 * least P.texels of its texels long along its coarser axis (the world is wider than it is tall, so its texels are
 * oblong), the next the shorter ones, the last down to 4 texels: a wave sampled by fewer is smoothed away by the
 * filtering, the more so the more across the long texels it runs, which turned the shorter waves' run toward the
 * world's long axis in big worlds whatever the wind.
 */
export function seaLayout([wx, wy], P = SEA) {
  const cs = [];
  let k0 = (2 * Math.PI) / Math.max(wx, wy);
  for (let c = 0; c < SEA_CASCADES; c++) {
    const L = [wx / 4 ** c, wy / 4 ** c], texel = Math.max(...L) / SEA_N;
    const k1 = (2 * Math.PI) / ((c + 1 < SEA_CASCADES ? P.texels : 4) * texel);
    cs.push({ L, k0, k1: Math.max(k0, k1) });
    k0 = Math.max(k0, k1);
  }
  return cs;
}

/** A system's radial height spectrum at k (its spread over directions apart), peaking at kp, damped past lmin. */
export function seaRadial(k, kp, P = SEA) {
  const sig = k < kp ? 0.07 : 0.09;
  const r = Math.exp(-((Math.sqrt(k / kp) - 1) ** 2) / (2 * sig * sig));
  const kc = (2 * Math.PI) / P.lmin;
  return k ** -P.p * Math.exp(-1.25 * (kp / k) ** 2) * P.gamma ** r * Math.exp(-((k / kc) ** 2));
}

// a spread integrated over directions: ∫ |cos(θ/2)|^(2s) dθ over a circle
function spreadIntegral(s) {
  let t = 0;
  const n = 720;
  for (let i = 0; i < n; i++) t += Math.abs(Math.cos(((i + 0.5) / n) * Math.PI - Math.PI / 2)) ** (2 * s);
  return (t / n) * 2 * Math.PI;
}

// ∫ k^3 radial(k) dk from a to b (a slope's variance: k^2 for the slope, k for the polar measure), in log steps
function slopeIntegral(a, b, kp, P, steps = 256) {
  if (!(b > a)) return 0;
  const la = Math.log(a), d = (Math.log(b) - la) / steps;
  let s = 0;
  for (let i = 0; i < steps; i++) {
    const k = Math.exp(la + (i + 0.5) * d);
    s += k ** 4 * seaRadial(k, kp, P) * d; // dk = k dlog k
  }
  return s;
}

/** Each system's spectrum scale, so its rms slope over the whole sea is as asked. */
export function seaScales(layout, P = SEA) {
  const k0 = layout[0].k0, k1 = layout[layout.length - 1].k1;
  return P.systems.map((s) => s.slope ** 2 / (spreadIntegral(s.spread) * slopeIntegral(k0, k1, (2 * Math.PI) / s.lp, P)));
}
