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
export const SEA_CASCADES = 2; // patches the world / 4^c across (at most 4: their heights share one layer)
// the sea texture's layers: each cascade's slope and displacement, then one of the cascades' heights
export const SEA_LAYERS = SEA_CASCADES + 1;
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

/**
 * The part of each cascade's wavenumber grid that holds waves, so the GPU turns only that (Engine._sea): a cascade whose
 * band begins past 2.5 times the damping wavenumber holds next to none (holds false: not turned, and the composite
 * skips it), and nothing past 3 times it is kept (a third of the damping length: under a thousandth of the slope's
 * spectrum, test/sea.test.js), so each turns only its frequencies |f| <= fx across and fy down (of SEA_N / 2). A world
 * of a few tens of units (a phone's 8k: 27 × 14) has waves only in the first cascade, out to |f| 21 across and 11 down.
 */
export function seaBands(layout, P = SEA) {
  const kc = (2 * Math.PI) / P.lmin;
  return layout.map((c) => {
    const k = Math.min(c.k1, 3 * kc), f = (L) => Math.min(SEA_N / 2 - 1, Math.ceil((k * L) / (2 * Math.PI)));
    return { holds: c.k0 < 2.5 * kc, fx: f(c.L[0]), fy: f(c.L[1]) };
  });
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

// a system's variance over the whole sea, per unit of its scale: ∫ k^(1+e) radial(k) dk over the cascades' bands
// times its spread over directions, in log steps (e 2 its slope's: k^2 for the slope, k for the polar measure; e 0
// its height's)
function variance(layout, s, P, e) {
  const la = Math.log(layout[0].k0), d = (Math.log(layout[layout.length - 1].k1) - la) / 256, kp = (2 * Math.PI) / s.lp;
  let v = 0;
  for (let i = 0; i < 256; i++) {
    const k = Math.exp(la + (i + 0.5) * d);
    v += k ** (2 + e) * seaRadial(k, kp, P) * d; // dk = k dlog k
  }
  return v * spreadIntegral(s.spread);
}

/** Each system's spectrum scale, so its rms slope over the whole sea is as asked. */
export function seaScales(layout, P = SEA) {
  return P.systems.map((s) => s.slope ** 2 / variance(layout, s, P, 2));
}

/** The sea's rms height (units) as scaled by seaScales, for the shallow focus (lensScene). */
export function seaHeightRms(layout, P = SEA) {
  const scale = seaScales(layout, P);
  return Math.sqrt(P.systems.reduce((v, s, j) => v + scale[j] * variance(layout, s, P, 0), 0));
}

/**
 * How fast the sea's slope drifts along the wind (units per second of its clock, at a storm's pace): the one velocity
 * that best carries the sea of a moment to the sea a moment on (least squares over its waves, each running at its own
 * speed, weighted by its slope's variance; seaBands' waves only). Between the sea's turns (Engine.fx.seaEvery) the
 * texture is read carried along it, so the waves keep moving: a sea held 1/30 s in a storm is off by 14% of its slope,
 * carried along this 5% (a 27 × 14 world; docs/performance.md, Doing less work).
 */
export function seaDrift(layout, P = SEA) {
  const scale = seaScales(layout, P), kc = (2 * Math.PI) / P.lmin, kp = (2 * Math.PI) / P.systems[0].lp, w0 = (2 * Math.PI) / P.Tp;
  const la = Math.log(layout[0].k0), d = (Math.log(Math.min(layout[layout.length - 1].k1, 3 * kc)) - la) / 96;
  let num = 0, den = 0;
  for (let i = 0; i < 96; i++) {
    const k = Math.exp(la + (i + 0.5) * d), w = w0 * (k / kp) ** P.beta;
    for (let j = 0; j < 72; j++) {
      const th = ((j + 0.5) / 72 - 0.5) * 2 * Math.PI, kx = k * Math.cos(th);
      // the slope's variance at (k, th), on the polar measure (k dk = k^2 dlog k)
      const v = k ** 4 * P.systems.reduce((a, s, n) => a + scale[n] * seaRadial(k, (2 * Math.PI) / s.lp, P) * Math.abs(Math.cos(th / 2)) ** (2 * s.spread), 0);
      num += v * w * kx; den += v * kx * kx;
    }
  }
  return den > 0 ? num / den : 0;
}
