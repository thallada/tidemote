// The sea's tunables: Engine.seaTune holds the live values (the page's Water surface and Wave motion settings scale
// height and pace; tools/waterlook sets the rest), and the wave settings rebuild its spectrum when they change
// (Engine.seaRebuild). Pure; the defaults are the sea's (src/sea.js SEA, and Engine._seaPost's look). follow: how the
// sea's clock follows the sim's speed, 1 on simulated time (64× is 64 times faster), 0 on real time, between: the
// speed to this power (0.5: 64× is 8 times faster), so sped-up worlds still read as water.

// what is drawn (view): 0 the sea as it looks, 1 its light alone, 2 its sheen alone (tools/waterlook), 3 no sea (Settings
// → Display → Water surface: Off); rough -1 the climate's weather, or a roughness held (tools)
/** The default tunables, from the sea's spectrum P (src/sea.js SEA) and the post pass's look. */
export function seaTuneDefaults(P) {
  return {
    calm: 0.3, calmPace: 0.45, follow: 0.5, pace: 1, Tp: P.Tp, beta: P.beta,
    height: 1, tilt: 0.25, refract: 1.5, caustic: 3.5, lightSoft: 0.1, lightCap: 2.5, chop: P.chop,
    lp0: P.systems[0].lp, slope0: P.systems[0].slope, spread0: P.systems[0].spread,
    lp1: P.systems[1].lp, slope1: P.systems[1].slope, spread1: P.systems[1].spread,
    lmin: P.lmin, gamma: P.gamma, rough: -1, view: 0,
  };
}

/** The spectrum the tunables ask for: SEA with their wave settings. */
export function seaSpecOf(P, t) {
  return {
    ...P, Tp: t.Tp, beta: t.beta, lmin: t.lmin, gamma: t.gamma, chop: t.chop,
    systems: [{ lp: t.lp0, slope: t.slope0, spread: t.spread0 }, { lp: t.lp1, slope: t.slope1, spread: t.spread1 }],
  };
}
