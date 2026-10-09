// WGSL for the Tidemote biosphere.
// Kinds: 0 silt, 1 glint, 2 husk, 3 stone, 4 framboid, 5..1023 living genomes.
// Each living genome has up to three cell roles with their own signatures.

export const MAXK = 1024;
export const FIRST_LIFE = 5;
export const MAX_CELLS = 1 << 18;
export const META_SLOT = 16;
export const META_POP = META_SLOT + MAXK;
export const META_DEATH = META_POP + MAXK;
export const META_ENERGY = META_DEATH + 64;
// K.diag's counters, DIAG_STRIDE per diet guild (headless forks record them, tools/fastforward/fork-diag.cjs):
// once a second per cell its neighbourhood, motion, light, hunger, energy and overlap (cells inside its
// core); at hunters' kill opportunities the kill funnel; and their contact density (animals within reach
// and twice reach).
export const DIAG_SLOTS = ['samples', 'crowd', 'silt', 'pack', 'kin', 'speed', 'photo', 'light', 'hungry', 'hungryFood', 'force', 'energy', 'overlap',
  'killOpp', 'preyInReach', 'tried', 'missed', 'lost', 'won', 'preyNear', 'preyNear2', 'huntSamples', 'perf', 'warmOff'];
export const DIAG_STRIDE = 24;
export const META_DIAG = META_ENERGY + 64;
export const META_CLAIM = META_DIAG + 5 * DIAG_STRIDE;
// Energy ledger per diet guild, in thousandths: light, glint, plant bites, husks, kills, upkeep,
// children, heat-making. META_ENERGY + 40.. holds the thermal sample (THERMAL_LEDGER).
export const ENERGY_SLOTS = ['light', 'glint', 'plant', 'husk', 'flesh', 'upkeep', 'children', 'heat'];
// Sampled once a second per living cell: the warmth it lives at (HEAT_BINS bins of HEAT_BIN degrees
// from 0), how many were torpid, and how many were heat-makers. Heat deaths per guild are
// META_DEATH + 20 + guild.
export const HEAT_BINS = 16;
export const HEAT_BIN = 3;
// framboids: how many have formed (seeded ones included), cumulative
export const THERMAL_LEDGER = { hist: 40, torpid: 56, makers: 57, framboidsMade: 58 };
// A pyrite framboid: its particle kind, and the cause code (info & 15) of one grown in a rotting pile.
export const FRAMBOID = 4;
export const FRAMBOID_GROWN = 12;
// The heat field: deposits (fixed point), then this step's temperatures.
export const HEAT_FIX = 1048576;
export const P_BYTES = 40;
// The loupe's barrel distortion: its rim shows this many times its radius.
export const LOUPE_FIELD = 1.1;
export const ORGANS = 12; // organelles per resolved cell (fsPoint), directions per species (organDirs)
export const PICK_WORDS = 12; // Particle's 10 words, then two partner IDs (NONE if absent).
export const G_BYTES = 192;
export const G_WORDS = 48;
export const LITE_BYTES = 32;
// The selected cell's mind (mindMain): a header of MIND_HEAD words, then MIND_NBR living neighbours
// of MIND_NBR_WORDS words each. See parseMind in mind.js for the layout.
export const MIND_HEAD = 56;
export const MIND_NBR = 48;
export const MIND_NBR_WORDS = 7;
export const MIND_BYTES = (MIND_HEAD + MIND_NBR * MIND_NBR_WORDS) * 4;

export const DEFAULT_K = {
  density: 22,
  charge: 0.28,     // silt -> glint per second at full tide
  leak: 0.03,
  glintMin: 0.2,
  decay: 0.011,
  huskMin: 0.08,
  huskBase: 0.35,
  huskFrac: 0.5,
  eatR: 0.3,
  linkR: 0.42,
  bondBreak: 1.25,  // persistent bonds break beyond 1.25 × their formation range (linkR)
  buildCost: 0.06,
  gain: 1.5,
  sated: 1.0,       // cells stop feeding above this × the energy needed to divide
  carcass: 0.45,    // energy left in the husk of a cell that was killed
  killEvery: 8,     // handling time: kills only on every Nth meal opportunity
  biteEvery: 6,     // ...and bites of plant cells on every Nth
  plantPref: 0.1,   // how much a flesh-eater values plant cells relative to a grazer
  grazePref: 0.6,   // how much a grazer values a plant cell relative to glint
  forage: 0.35,     // pull of glint and husks on a hungry forager, relative to signature forces
  hunt: 0.12,       // pull of living prey on a hungry forager
  kinCrowd: 0.06,   // upkeep added per crowding same-species neighbour, excluding bond partners
  kinFree: 4,       // same-species neighbours tolerated before crowding costs
  anchorCost: 0.003, // upkeep for resisting the currents
  flowFeed: 0.8,    // anchored photosynthesisers gain this much per 0.2 cells/s of current flowing past
  bodyThrift: 0.15, // upkeep saved by a cell with two bonds: bodies share the cost of living
  kinShade: 0.25,   // how much a bonded body shades itself, relative to strangers
  armor: 1,         // bonded bodies resist being killed or bitten
  searchImage: 0.7, // chance a hunter or grazer misses living prey unlike its last catch
  catchSkill: 0.3,  // catch chance scales with eating skill (eatEff × preference), reaching certainty here
  nutrHalf: 8.0,    // silt grains nearby at which photosynthesis runs at half speed
  swimCost: 0.018,
  preyBase: 0.35,
  preyFrac: 0.7,
  kin: 0.8,
  maxScan: 288,
  diag: 0,          // 1: count K.diag's diagnostics into the ledger (DIAG_SLOTS; headless forks record them)
  affScale: 0.42,
  matterPull: 0.6,
  metab: 0.75,
  jitter: 0.5,
  colorMix: 0.02,
  baseMix: 0.04,
  maxSpeed: 7.0,
  photo: 0.4,       // energy per second for a pure photosynth in full light
  shade: 0.07,      // self-shading per living neighbour
  align: 3.0,
  bond: 8.0,        // spring strength of bonds between cells of one body
  adhMin: 0.15,     // adhesion needed before a species forms bonds
  bite: 0.06,       // energy taken per bite from a photosynthesising cell
  eatEvery: 6,      // frames between meals
  dietMin: 0.02,    // share of the diet a food must have before a cell bothers to eat it
  // Stone: calcified remains and bedrock. Immobile, solid to all but calcifiers, slowly eroding back to silt.
  calcCost: 0.012,  // upkeep of a fully calcifying cell (× metab)
  reefs: 1,         // 0: calcifying cells never leave stone (bedrock only)
  nucleate: 0.12,   // chance of leaving stone away from other stone, relative to beside it: reefs accrete
  stoneLife: 400,   // seconds a grain of reef stone lasts on average before it crumbles to silt...
  rockLife: 3000,   // ...and a grain of bedrock
  wearLoose: 3,     // how fast a loose grain of reef stone wears, relative to stoneLife...
  wearPacked: 0.3,  // ...and a grain packed into a reef...
  packedAt: 8,      // ...with this many grains in its grid cell
  regionWear: 30,   // extra wear on reef stone whose neighbourhood (cells within regionR) holds more than...
  regionR: 4,
  regionCap: 2.0,   // ...this many reef grains per cell on average: reefs grow as separate patches
  rocks: 0.5,       // scales each world's bedrock outcrops (0: none)
  stoneR: 0.32,     // distance within which stone pushes cells away
  stoneWall: 5.0,   // how hard stone pushes (scaled down for calcifiers, which settle on it)
  refuge: 0.12,     // chance per nearby grain of stone that an attack made from among stone misses...
  refugeMax: 0.3,   // ...up to this (a leaky refuge: hunters at reefs still make a living)
  // Heat: a field on the binning grid that life writes (its spent energy) and reads (each species'
  // preferred temperature). Degrees are notional; see docs/thermal-energy-2026-10-07.md.
  heat: 1,          // 0: no field, and temperature has no effect
  // heatD and heatLoss set how far a hot spot spreads, sqrt(heatD / heatLoss) ≈ 2.8 cells: about a
  // colony's own neighbourhood, so warm patches stay distinct rather than blurring into one haze
  heatD: 0.25,      // diffusion, cells²/s
  heatLoss: 0.033,  // relaxation toward the background temperature, per second
  metabHeat: 0.18,  // degrees per unit of energy spent on upkeep
  sunHeat: 0.04,    // degrees per second in full light
  rotHeat: 0.3,     // degrees per unit of energy a husk loses as it rots
  // Pyrite framboids: raspberry clusters of iron sulfide that form where carcasses rot (their sulfide)
  // and warm their water as they oxidise, until they are spent and crumble to silt.
  framboids: 0.02,  // share of the silt in a world's mud patches that starts as framboids
  framboidLife: 300, // seconds a framboid burns on average at tRef (twice as fast per 10° warmer)
  framboidHeat: 1.5, // degrees per second it warms its grid cell (before stone's heat capacity)
  framboidForm: 0.1, // chance a husk rotting out in a pile of them leaves a framboid instead of silt...
  framboidPile: 8,  // ...in a grid cell holding this many husks (rising from three), in water no warmer than
                    // the background (none at 6° above it: pyrite forms in cool mud)
  stoneMass: 0.15,  // heat capacity added by each grain of stone in a grid cell
  tRef: 16,         // the temperature at which glint and husks wear at their base rates
  specBonus: 0.25,  // extra performance at its optimum of the narrowest tolerance (2°)
  thermalFlat: 0.5, // tolerances either side of its optimum where a cell works at its best
  thermalWarm: 0.6, // how wide the warm side of the curve is relative to the cold side (heat kills)
  stressCost: 0.5,  // extra upkeep at full thermal stress
  torporAt: 1.25,   // tolerances below its optimum where a cell goes torpid...
  torporCost: 0.25, // ...and the share of its upkeep it then pays
  scald: 0.03,      // chance per second of dying at full heat stress
  thermotaxis: 0.6, // how hard swimmers steer toward water that suits them, relative to their swimming
  thermoCost: 0.03, // energy per second a full heat-maker burns to warm itself and its water
  selfWarm: 4,      // degrees a full heat-maker runs above its water (×1.5 with two bonds)
  glintQ10: 2.0,    // glint fades this much faster per 10° above tRef
  rotQ10: 2.5,      // husks rot this much faster per 10° above tRef
  hotCharge: 0.6,   // extra chance per second that silt charges in the hottest water (hot springs)
  abioHeat: 3,      // extra weight of sparks of life in hot water
  marangoni: 0,     // matter drifts from warm water toward cold at this many cells/s per °/cell
};

const packCol = (r, g, b) => (Math.round(r * 255) | (Math.round(g * 255) << 8) | (Math.round(b * 255) << 16) | (255 << 24)) >>> 0;
const f = (x) => {
  const s = String(x);
  return /[.eE]/.test(s) ? s : s + '.0';
};

const COMMON = /* wgsl */ `
// Relief, as in DIC microscopy: one light from the upper left (screen y down) for every resolved shape.
const TO_LIGHT = vec2f(-0.633, -0.774);
const MAXK = ${MAXK}u;
const FIRST_LIFE = ${FIRST_LIFE}u;
const SILT = 0u;
const GLINT = 1u;
const HUSK = 2u;
const STONE = 3u;
const FRAMBOID = ${FRAMBOID}u;
const NONE = 0xffffffffu;
// A claim made by a coarse step's walk (lifeMain) says what it is for itself rather than through the
// claimer's intent: bit 31, then a class in bits 29-30 (0 a kill, 1 glint, 2 a husk, each taken by the
// claimer in bits 0-22; 3 bites of a photosynthesiser, counted in bits 0-15, any number of eaters).
const MEAL_CLAIM = 0x80000000u;
const MAX_CELLS = 262144u;
const META_SLOT = ${META_SLOT}u;
const META_POP = ${META_POP}u;
const META_DEATH = ${META_DEATH}u;
const META_ENERGY = ${META_ENERGY}u;
const META_DIAG = ${META_DIAG}u;
const DIAG_STRIDE = ${DIAG_STRIDE}u;
const META_CLAIM = ${META_CLAIM}u;
const TAU = 6.28318530718;
const ORGANS = ${ORGANS}u;

// Info: 0..3 cause, 4..5 role, 6..15 search image, 16..31 generation.
struct Particle { pos: vec2f, vel: vec2f, kind: u32, energy: f32, age: f32, id: u32, col: u32, info: u32 };
struct Genome {
  sig: array<vec4u, 3>,
  dev: vec4u,
  radius: f32, beta: f32, force: f32, drag: f32,
  metab: f32, lifespan: f32, reproE: f32, share: f32,
  dGlint: f32, dHusk: f32, dFlesh: f32, mutRate: f32,
  hue: f32, sat: f32, lum: f32, size: f32,
  shape: f32, pulse: f32, roleHue: f32, advect: f32,
  swim: f32, align: f32, photo: f32, col: u32,
  parent: u32, serial: u32, born: f32, depth: u32,
  adhesion: f32, calcify: f32, topt: f32, tol: f32,
};

fn roleOf(info: u32) -> u32 { return (info >> 4u) & 3u; }
fn renderHash(id: u32) -> f32 {
  var h = id * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return f32((h >> 22u) ^ h) / 4294967296.0;
}
fn genOf(info: u32) -> u32 { return info >> 16u; }

fn tideAt(p: vec2f, world: vec2f, t: f32, w: array<vec4f, 4>, ph: vec4f) -> f32 {
  let u = p / world * TAU;
  var s = 0.0;
  var n = 0.0;
  for (var k = 0u; k < 4u; k++) {
    s += w[k].w * sin(w[k].x * u.x + w[k].y * u.y + w[k].z * t + ph[k]);
    n += w[k].w;
  }
  return smoothstep(0.35, 1.9, s * 2.7 / max(n, 1e-3));
}

fn hsl2rgb(h: f32, s: f32, l: f32) -> vec3f {
  let k = (vec3f(0.0, 8.0, 4.0) + vec3f(h * 12.0)) % vec3f(12.0);
  let a = s * min(l, 1.0 - l);
  return vec3f(l) - a * clamp(min(k - vec3f(3.0), vec3f(9.0) - k), vec3f(-1.0), vec3f(1.0));
}

fn roleColor(g: Genome, r: u32) -> vec3f {
  return hsl2rgb(fract(g.hue + f32(r) * g.roleHue + 1.0), g.sat, g.lum * (1.0 - 0.08 * f32(r)));
}

// A heat-maker's output, 0..1, kept in the spare fourth developmental word.
fn thermoOf(g: Genome) -> f32 { return f32(g.dev.w & 255u) / 255.0; }
// How well a cell of genome g works at temperature t (its own, body warmth included): perf scales
// photosynthesis, digestion and swimming, peaking higher the narrower its tolerance and falling
// about twice as steeply above its optimum as below (heat kills, cold stills). x is how many
// tolerances it is from its optimum.
struct Thermal { perf: f32, stress: f32, x: f32, torpid: bool };
fn thermalState(g: Genome, t: f32, specBonus: f32, torporAt: f32, flat: f32, warm: f32) -> Thermal {
  let x = (t - g.topt) / max(g.tol, 0.5);
  let peak = 1.0 + specBonus * (1.0 - clamp((g.tol - 2.0) / 13.0, 0.0, 1.0));
  let y = select(min(x + flat, 0.0), max(x - flat, 0.0) / warm, x > 0.0);
  let torpid = x < -torporAt;
  return Thermal(select(peak * exp(-y * y), 0.0, torpid), smoothstep(0.3, 0.9, abs(x)), x, torpid);
}
`;
// The same, with the default tunables, for passes that only show it (rendering, listening).
const shownThermal = (g, t) => `thermalState(${g}, ${t}, ${f(DEFAULT_K.specBonus)}, ${f(DEFAULT_K.torporAt)}, ${f(DEFAULT_K.thermalFlat)}, ${f(DEFAULT_K.thermalWarm)})`;

// One living cell's senses, forces and energy budget for this frame, shared by lifeMain and mindMain.
// w (mindMain only) adds statements that record each term; without it the text is lifeMain's alone.
function cellWGSL(K, w) {
  const W = (s) => (w ? ' ' + s : '');
  return /* wgsl */ `  let p = sortedFull[i];
  let g = genomes[p.kind];
  let role = roleOf(p.info);
  let sg = g.sig[role];
  let rec0 = unpack4x8snorm(sg.z);
  let rec1 = unpack4x8snorm(sg.w);
  let my0 = unpack4x8snorm(sg.x);
  let my1 = unpack4x8snorm(sg.y);
  let world = sim.world;
  let invWorld = 1.0 / world;
  let gw = i32(sim.grid.x);
  let gh = i32(sim.grid.y);
  let cc = clamp(vec2i(floor(p.pos)), vec2i(0), vec2i(gw - 1, gh - 1));
  let R = g.radius;
  let R2 = R * R;
  let invR = 1.0 / R;
  let beta = g.beta;
  let invBeta = 1.0 / beta;
  let invOM = 1.0 / (1.0 - beta);
  // photosynthesis and eating don't mix well: a cell that does both does neither efficiently
  let eatEff = (1.0 - g.photo) * (1.0 - g.photo);
  let bonding = g.adhesion > ${f(K.adhMin)};
  var dn1 = vec2f(0.0);
  var dn2 = vec2f(0.0);

  var force = vec2f(0.0);
  // Coarse steps (sim.ticks > 1) also gather how the pair and stone forces change as this cell moves
  // (their gradients jF, jS: xx, xy, yy) and its neighbours' velocity weighted by how stiffly each holds
  // it (vN / wN, with wN2 for their number): see the motion below.
  var jF = vec3f(0.0);
  var jS = vec3f(0.0);
  var vN = vec2f(0.0);
  var wN = 0.0;
  var wN2 = 0.0;
  let selfVel = p.vel + flowAt(p.pos) * g.advect;
  var csum = vec3f(0.0);
  var wsum = 0.0;
  var kinVel = vec2f(0.0);
  var kinN = 0.0;
  var crowd = 0.0;
  var nutr = 0.0;
  var d1 = 1e9; var d2 = 1e9;
  var n1 = NONE; var n2 = NONE;
  if (bonding) {
    n1 = keepBond(i, bondsNow[i].x, p);
    n2 = keepBond(i, bondsNow[i].y, p);
    if (n2 == n1) { n2 = NONE; }
    if (n1 != NONE) {
      dn1 = sortedFull[n1].pos - p.pos;
      dn1 -= world * round(dn1 * invWorld);
      d1 = length(dn1);
    }
    if (n2 != NONE) {
      dn2 = sortedFull[n2].pos - p.pos;
      dn2 -= world * round(dn2 * invWorld);
      d2 = length(dn2);
    }
  }
  let keep1 = n1 != NONE; let keep2 = n2 != NONE;
  // warmth: the water here, plus a heat-maker's own (a body insulates its cells)
  let thermo = thermoOf(g);
  let heat = heatSample(p.pos);
  let Tc = heat.x + ${f(K.selfWarm)} * thermo * (1.0 + 0.5 * (select(0.0, 1.0, keep1) + select(0.0, 1.0, keep2)));
  let th = cellThermal(g, Tc);
  // a torpid cell neither hunts, grazes nor divides
  let hungry = p.energy < g.reproE * ${f(K.sated)} && eatEff > 0.1 && !th.torpid;
  let canHunt = (g.dFlesh > DIET_MIN || g.dGlint > DIET_MIN) && hungry;
  // food in reach is gathered by hungry cells; in a coarse step also by any that may grow hungry in it
  let seek = hungry || (sim.ticks > 1u && eatEff > 0.1 && !th.torpid);
  let seekHunt = canHunt || (seek && (g.dFlesh > DIET_MIN || g.dGlint > DIET_MIN));
  var food = NONE; var foodScore = -1e9;
  // a coarse step keeps the four best, for its meals and for claims lost to other eaters
  var fc = array<u32, 4>(NONE, NONE, NONE, NONE);
  var fsc = array<f32, 4>(-1e9, -1e9, -1e9, -1e9);
  var silt = NONE; var siltD = 1e9;
  var silt2 = NONE; var siltD2 = 1e9;
  var stoneF = vec2f(0.0);
  var stoneN = 0.0;
  var pack = 0.0;
  // (K.diag: neighbours inside this cell's core; animals within reach and twice reach)
  var overlap = 0.0;
  var preyNear = vec2f(0.0);
  var s = pcg(p.id ^ pcg(sim.frame * 747796405u + sim.seed));

  // The 3x3 neighbourhood as up to nine index ranges (one per row away from the wrap seam).
  var rs: array<u32, 9>;
  var re: array<u32, 9>;
  var nr = 0u;
  var total = 0u;
  for (var dy = -1; dy <= 1; dy++) {
    let y = (cc.y + dy + gh) % gh;
    let rowBase = y * gw;
    if (cc.x > 0 && cc.x < gw - 1) {
      rs[nr] = cellStart[u32(rowBase + cc.x - 1)];
      re[nr] = cellStart[u32(rowBase + cc.x + 2)];
      total += re[nr] - rs[nr];
      nr++;
    } else {
      for (var dx = -1; dx <= 1; dx++) {
        let x = (cc.x + dx + gw) % gw;
        let c = u32(rowBase + x);
        rs[nr] = cellStart[c];
        re[nr] = cellStart[c + 1u];
        total += re[nr] - rs[nr];
        nr++;
      }
    }
  }
  // Crowded neighbourhoods are sampled evenly with a random offset, each sample standing for
  // \`stride\` particles, so no direction or grid cell is favoured (scanning in order and stopping
  // at the budget left out the last row and drew dense species into grid-aligned bands).
  let stride = max(1.0, f32(total) / f32(MAX_SCAN));
  var at = select(0.0, rnd(&s) * stride, stride > 1.0);
  for (var k = 0u; k < nr; k++) {
    let len = f32(re[k] - rs[k]);
    for (; at < len; at += stride) {
      let j = rs[k] + u32(at);
      let q = sortedLite[j];
      var d = q.pos - p.pos;
      d -= world * round(d * invWorld);
      let r2 = dot(d, d);
      if (r2 >= R2 || r2 < 1e-12) { continue; }
      let r = sqrt(r2);
      let x = r * invR;
      let qk = q.kr & 1023u;
      let s0 = unpack4x8snorm(q.s0);
      let s1 = unpack4x8snorm(q.s1);
      let a = clamp((dot(rec0, s0) + dot(rec1, s1)) * ${f(K.affScale)}, -1.0, 1.0);
      let shape = 1.0 - abs(2.0 * x - 1.0 - beta) * invOM;
      var fr: f32;
      // how fr changes with distance (coarse steps' gradient), and the pull that scales shape
      var dfr = 0.0;
      var pull = 0.0;
      if (qk >= FIRST_LIFE) {
        // a hungry forager lets other species inside its personal space so it can reach them
        let core = select(1.0, 0.15, canHunt && qk != p.kind);
        if (x < beta) { fr = (x * invBeta - 1.0) * core; } else { fr = a * shape; }${W('mFr0 = fr;')}
        // hungry foragers are drawn toward the cells their diet favours
        let appetite = select(0.0, select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, (q.kr & (1u << 12u)) != 0u) * eatEff * ${f(K.hunt)}, canHunt && qk != p.kind);
        if (x >= beta) { fr += appetite * shape; pull = a + appetite; } else { dfr = core * invBeta * invR; }
        crowd += (1.0 - x) * select(1.0, ${f(K.kinShade)}, bonding && qk == p.kind);
        if (DIAG) {
          if (x < beta) { overlap += 1.0; }
          if (qk != p.kind && (q.kr & (1u << 12u)) == 0u && r < 2.0 * EAT_R) { preyNear += vec2f(select(0.0, 1.0, r < EAT_R), 1.0); }
        }
        if (r < LINK_R) { let w = 1.0 - r / LINK_R; pack += w * w; }
        if (qk == p.kind) {
          kinVel += unpack2x16float(q.vel);
          kinN += 1.0;
        }
        if (r < LINK_R) {
          // colour only blends within a species, so mixed neighbourhoods stay visibly mixed
          if (qk == p.kind) {
            let w = 1.0 - r / LINK_R;
            csum += unpack4x8unorm(q.col).rgb * w;
            wsum += w;
          }
          if (bonding && qk == p.kind && j != n1 && j != n2) {
            if (!keep1 && r < d1) {
              if (!keep2) { d2 = d1; n2 = n1; dn2 = dn1; }
              d1 = r; n1 = j; dn1 = d;
            } else if (!keep2 && r < d2) { d2 = r; n2 = j; dn2 = d; }
          }
        }
        if (seekHunt && r < EAT_R && qk != p.kind) {
          let da = s0 - my0;
          let db = s1 - my1;
          if (dot(da, da) + dot(db, db) > ${f(K.kin)}) {
            // grazers crop plant cells; flesh-eaters hunt animals (and crop plants reluctantly)
            let plant = (q.kr & (1u << 12u)) != 0u;
            let pref = select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, plant);
            let sc = pref - r;
            if (pref > DIET_MIN && sc > foodScore) { foodScore = sc; food = j; }
            if (pref > DIET_MIN && sim.ticks > 1u) { pushFood(&fc, &fsc, j, sc); }
          }
        }
      } else {
        fr = select(0.0, a * shape * ${f(K.matterPull)}, x >= beta);${W('mFr0 = fr;')}
        pull = a * ${f(K.matterPull)};
        if (qk == STONE || qk == FRAMBOID) {
          // stone (and a framboid) is solid: it pushes cells out however hard they swim, and shelters those among it
          if (r < ${f(K.stoneR)}) {
            stoneF += d * ((r - ${f(K.stoneR)}) / (${f(K.stoneR)} * r));
            // its push, g(r) = 1/stoneR - 1/r along d, has gradient -(g I + d d' / r^3)
            let gs = (r - ${f(K.stoneR)}) / (${f(K.stoneR)} * r); let cs = 1.0 / (r2 * r);
            jS -= vec3f(gs + cs * d.x * d.x, cs * d.x * d.y, gs + cs * d.y * d.y);
          }
          if (r < 0.5) { stoneN += 1.0; }
        } else {
          if (hungry && qk != SILT && x >= beta) {
            fr += select(g.dHusk, g.dGlint, qk == GLINT) * eatEff * ${f(K.forage)} * shape;
            pull += select(g.dHusk, g.dGlint, qk == GLINT) * eatEff * ${f(K.forage)};
          }
          if (qk == SILT) { nutr += 1.0; }
          // a cell ready to divide looks for a grain every tick, so in a coarse step a grain counts if it
          // came within reach at any tick of it: the closest approach of their paths over the step
          var rc = r;
          if (qk == SILT && sim.ticks > 1u) {
            let w = unpack2x16float(q.vel) - selfVel;
            let ww = dot(w, w);
            rc = length(d + w * select(0.0, clamp(-dot(d, w) / ww, 0.0, sim.dt), ww > 1e-12));
          }
          if (qk == SILT && rc < EAT_R) {
            if (rc < siltD) { siltD2 = siltD; silt2 = silt; siltD = rc; silt = j; }
            else if (rc < siltD2) { siltD2 = rc; silt2 = j; }
          } else if (qk != SILT && r < EAT_R && seek) {
            let dv = select(g.dHusk, g.dGlint, qk == GLINT);
            let sc = dv - r;
            if (dv > DIET_MIN && sc > foodScore) { foodScore = sc; food = j; }
            if (dv > DIET_MIN && sim.ticks > 1u) { pushFood(&fc, &fsc, j, sc); }
          }
        }
      }
      if (x >= beta) { dfr = select(-2.0, 2.0, 2.0 * x < 1.0 + beta) * invOM * invR * pull; }
      force += d * (fr / r);${W('mPair(j, q, d, r, x < beta, qk == p.kind, mFr0, fr);')}
      if (sim.ticks > 1u) {
        // the pair force d g(r), g = fr / r, has gradient in this cell's position -(g I + g'/r d d')
        let gr = fr / r;
        let c = (dfr * r - fr) / (r2 * r);
        jF -= vec3f(gr + c * d.x * d.x, c * d.x * d.y, gr + c * d.y * d.y);
        let w = abs(gr) + abs(c) * r2;
        vN += unpack2x16float(q.vel) * w;
        wN += w;
        wN2 += w * w;
      }
    }
    at -= len;
  }
  overlap *= stride; preyNear *= stride;
  force *= stride; crowd *= stride; pack *= stride; nutr *= stride; kinVel *= stride; kinN *= stride; stoneF *= stride; stoneN *= stride;

  let heavy = 1.0 - 0.7 * g.photo;
  // Persistent bonds pull on the partners' current positions, even outside the sampled scan.
  var bondF = vec2f(0.0);
  if (n1 != NONE) { bondF += dn1 * ((d1 - LINK_R * 0.55) / max(d1, 1e-4)); }
  if (n2 != NONE) { bondF += dn2 * ((d2 - LINK_R * 0.55) / max(d2, 1e-4)); }
  let swim = g.swim * (1.0 - g.photo) * min(th.perf, 1.0);
  let flow = flowAt(p.pos) * g.advect;
  // thermotaxis: a swimmer away from its optimum steers up or down the warmth toward it
  var taxis = vec2f(0.0);
  let slope = length(heat.yz);
  if (swim > 0.0 && slope > 1e-3) {
    taxis = heat.yz * (sign(g.topt - Tc) * min(1.0, abs(th.x)) * swim * ${f(K.thermotaxis)} / slope);
  }
  // A coarse step holds the pair and stone forces gathered at its start, and a dense clump is too stiff
  // for that: it would overshoot, heat and loosen. So they carry a correction, implicit in the stiffness.
  // The cell and its neighbourhood are taken as two bodies sharing momentum: the reaction to this cell's
  // forces is spread over Mn neighbours (the participation number of the stiffness weights), their centre
  // (v + Mn vNear) / (1 + Mn) keeps its velocity under drag, and only the relative velocity v - vNear
  // meets the restoring stiffness D (1 + 1/Mn), backward Euler in its end value. A clump drifting together
  // is untouched and a collision too stiff to resolve shares its momentum; stable for every mode of a
  // clump (tools/fastforward/stiff-modes.py, docs/fast-forward.md).
  var stiff = vec2f(0.0);
  if (sim.ticks > 1u && wN2 > 0.0) {
    let cf = g.force * heavy;
    let cw = ${f(K.stoneWall)} * (1.0 - g.calcify);
    let D = -(restoring(jF * stride) * cf + restoring(jS * stride) * cw);
    let a0 = force * cf + stoneF * cw;
    let vNear = vN / wN;
    let Mn = wN * wN / wN2;
    let frT = pow(0.5, sim.dt / g.drag);
    let G = (1.0 - frT) * g.drag / 0.69314718;
    let kk = D * (1.0 + 1.0 / Mn);
    let rhs = (p.vel - vNear) * frT + a0 * (G * (1.0 + 1.0 / Mn));
    let m00 = 1.0 + G * sim.dt * kk.x; let m01 = G * sim.dt * kk.y; let m11 = 1.0 + G * sim.dt * kk.z;
    let vr = vec2f(m11 * rhs.x - m01 * rhs.y, m00 * rhs.y - m01 * rhs.x) / max(m00 * m11 - m01 * m01, 1e-6);
    let vEnd = (p.vel + vNear * Mn) / (1.0 + Mn) * frT + vr * (Mn / (1.0 + Mn));
    stiff = (vEnd - p.vel * frT) / G - a0;
  }
  // Motion in substeps of one tick (1/60 s), so a coarse step moves a cell as that many 1/60 s steps
  // would under its forces; bonds pull toward where the partners will be, carried on their velocities.
  // A 1/60 s step is a single substep.
  let h = sim.dt / f32(sim.ticks);
  let fr0 = pow(0.5, h / g.drag);
  var vB1 = vec2f(0.0);
  var vB2 = vec2f(0.0);
  if (n1 != NONE) { vB1 = sortedFull[n1].vel; }
  if (n2 != NONE) { vB2 = sortedFull[n2].vel; }
  var vel = p.vel;
  var pos = p.pos;
  for (var k = 0u; k < sim.ticks; k++) {
    var fb = bondF;
    if (k > 0u) {
      let t = f32(k) * h;
      let moved = pos - p.pos;
      fb = vec2f(0.0);
      if (n1 != NONE) { let e = dn1 + vB1 * t - moved; let l = length(e); fb += e * ((l - LINK_R * 0.55) / max(l, 1e-4)); }
      if (n2 != NONE) { let e = dn2 + vB2 * t - moved; let l = length(e); fb += e * ((l - LINK_R * 0.55) / max(l, 1e-4)); }
    }
    vel = vel * fr0 + force * (g.force * heavy * h) + stiff * h;${W('if (k == 0u) { mVel = vel; }')}
    if (kinN > 0.0 && g.align > 0.0) {
      vel = mix(vel, kinVel / kinN, clamp(g.align * ${f(K.align)} * h, 0.0, 1.0));${W('if (k == 0u) { mAlign = vel - mVel; }')}
    }
    vel += fb * (g.adhesion * ${f(K.bond)} * h);
    // stone is solid to everything but the calcifiers that build it, which settle on their own reef
    vel += stoneF * (${f(K.stoneWall)} * (1.0 - g.calcify) * h);
    if (swim > 0.0) {
      var dir = vel;
      if (dot(dir, dir) < 1e-6) {
        let a = rnd(&s) * TAU;
        dir = vec2f(cos(a), sin(a));
      }
      vel += normalize(dir) * swim * h;${W('if (k == 0u) { mSwim = normalize(dir) * swim; }')}
    }
    vel += taxis * h;
    let sp = length(vel);
    if (sp > sim.maxSpeed) { vel *= sim.maxSpeed / sp; }
    pos += (vel + flow) * h;
  }
  pos = wrapPos(pos);

  var col = unpack4x8unorm(p.col).rgb;
  if (wsum > 0.0) { col = mix(col, csum / wsum, ${f(K.colorMix)}); }
  col = mix(col, roleColor(g, role), ${f(K.baseMix)});

  let light = sim.ambient + (1.0 - sim.ambient) * tideAt(p.pos, world, sim.time, sim.tide, sim.tidePh) * sim.season;
  // photosynthesis needs minerals: silt within reach. Drifters ride along with their own (depleting)
  // water; anchored cells have fresh silt carried past them by the currents.
  let photoGain = th.perf * g.photo * light * ${f(K.photo)} / (1.0 + crowd * ${f(K.shade)}) * (nutr / (nutr + ${f(K.nutrHalf)})) * (1.0 + ${f(K.nutrHalf)} / 20.0)
    * (1.0 + ${f(K.flowFeed)} * (1.0 - g.advect) * min(length(flowAt(p.pos)) / 0.2, 2.0));
  let bonds = select(0.0, 1.0, n1 != NONE) + select(0.0, 1.0, n2 != NONE);
  // cells packed among their own kind sicken (species-specific disease, Janzen-Connell); a body's bond partners do not count
  let kinCost = 1.0 + ${f(K.kinCrowd)} * max(0.0, kinN - bonds - ${f(K.kinFree)});
  let thrift = 1.0 - ${f(K.bodyThrift)} * 0.5 * bonds;
  // thermal stress costs upkeep (relative to the cell's own optimum); torpor saves most of it; a
  // heat-maker burns extra, all of it heat
  let heatMaking = ${f(K.heat ? K.thermoCost : 0)} * thermo;
  let upkeep = g.metab * kinCost * thrift * (0.55 + 0.45 * clamp(p.energy / g.reproE, 0.0, 1.0))
    * (1.0 + ${f(K.stressCost)} * th.stress) * select(1.0, ${f(K.torporCost)}, th.torpid) + heatMaking;`;
}

export function simWGSL(K) {
  return COMMON + /* wgsl */ `
struct Sim {
  world: vec2f, grid: vec2u,
  count: u32, frame: u32, dt: f32, time: f32,
  season: f32, abio: f32, seed: u32, maxSpeed: f32,
  seedKinds: u32, pSilt: f32, pGlint: f32, pHusk: f32,
  ambient: f32, chargeMul: f32, clump: f32, spread: f32,
  waves: array<vec4f, 4>,
  tide: array<vec4f, 4>,
  tidePh: vec4f,
  rock: vec4f,
  // tick: 1/60 s ticks simulated up to the end of this step; ticks: how many this step covers;
  // tbg: the background water temperature (climate, season, excursion)
  tick: u32, ticks: u32, tbg: f32, pad1: u32,
};
// kr: 0..9 kind, 10..11 role, 12 plant.
struct Lite { pos: vec2f, kr: u32, col: u32, vel: u32, s0: u32, s1: u32, pad: u32 };

@group(0) @binding(0) var<uniform> sim: Sim;
@group(0) @binding(1) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(2) var<storage, read_write> sortedFull: array<Particle>;
@group(0) @binding(3) var<storage, read_write> sortedLite: array<Lite>;
@group(0) @binding(4) var<storage, read_write> countsA: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read> countsP: array<u32>;
@group(0) @binding(6) var<storage, read_write> cellStart: array<u32>;
@group(0) @binding(7) var<storage, read_write> blockSums: array<u32>;
@group(0) @binding(8) var<storage, read_write> aux: array<vec2u>;
// Intent: x bits 0..1 action (0 none, 1 eat, 2 birth, 3 bite),
// 2..11 child kind (birth) or observed target kind (eat/bite),
// 12..13 child role, 14..30 child generation; y child energy, z/w bond neighbours.
@group(0) @binding(9) var<storage, read_write> intent: array<vec4u>;
@group(0) @binding(10) var<storage, read_write> genomes: array<Genome>;
@group(0) @binding(11) var<storage, read_write> ledger: array<atomic<u32>>;
@group(0) @binding(12) var<storage, read_write> livingList: array<u32>;
// 0 living count, 1..3 life dispatch, 4..7 line draw, 8..11 stone draw (for rendering).
@group(0) @binding(13) var<storage, read_write> frameCtr: array<atomic<u32>, 12>;
// Grains of reef stone in each grid cell (low 16 bits) and of bedrock (high 16), counted while binning.
@group(0) @binding(14) var<storage, read_write> stoneGrid: array<atomic<u32>>;
// Every grain of stone, gathered while matter moves, so rendering draws stone without scanning all.
@group(0) @binding(16) var<storage, read_write> stoneList: array<u32>;
@group(0) @binding(15) var<storage, read_write> bondsNow: array<vec2u>;
// The heat field: [0, MAX_CELLS) deposits this step (HEAT_FIX per degree), then the water's
// temperature per grid cell (f32 bits), then husks per grid cell this step. heatMain writes the next
// temperatures to heatNext.
@group(0) @binding(18) var<storage, read_write> thermal: array<atomic<u32>>;
@group(0) @binding(19) var<storage, read_write> heatNext: array<f32>;

const EAT_R = ${f(K.eatR)};
const DIAG = ${K.diag ? 'true' : 'false'};
const LINK_R = ${f(K.linkR)};
const MAX_SCAN = ${K.maxScan | 0}u;
const DIET_MIN = ${f(K.dietMin)};
const HEAT_ON = ${K.heat ? 'true' : 'false'};
const TREF = ${f(K.tRef)};
const HEAT_FIX = ${f(HEAT_FIX)};
const FRAMBOID_COL = ${packCol(0.8, 0.7, 0.45)}u;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(s: ptr<function, u32>) -> f32 { *s = pcg(*s); return f32(*s >> 8u) / 16777216.0; }
fn gauss(s: ptr<function, u32>) -> f32 { return (rnd(s) + rnd(s) + rnd(s) - 1.5) * 2.0; }
fn g4(s: ptr<function, u32>) -> vec4f { return vec4f(gauss(s), gauss(s), gauss(s), gauss(s)); }
fn r4(s: ptr<function, u32>) -> vec4f { return vec4f(rnd(s), rnd(s), rnd(s), rnd(s)) * 2.0 - 1.0; }

fn cellOf(p: vec2f) -> u32 {
  let g = vec2i(sim.grid);
  let c = clamp(vec2i(floor(p)), vec2i(0), g - vec2i(1));
  return u32(c.y) * sim.grid.x + u32(c.x);
}

fn flowAt(p: vec2f) -> vec2f {
  var v = vec2f(0.0);
  for (var k = 0u; k < 4u; k++) {
    let w = sim.waves[k];
    let ph = w.x * p.x + w.y * p.y + w.z * sim.time + f32(k) * 1.7;
    v += vec2f(w.y, -w.x) * (cos(ph) * w.w / max(length(w.xy), 1e-4));
  }
  return v;
}

fn wrapPos(p: vec2f) -> vec2f { return p - sim.world * floor(p / sim.world); }

fn heatCell(x: i32, y: i32) -> f32 {
  let gw = i32(sim.grid.x);
  let gh = i32(sim.grid.y);
  return bitcast<f32>(atomicLoad(&thermal[MAX_CELLS + u32(((y % gh) + gh) % gh) * sim.grid.x + u32(((x % gw) + gw) % gw)]));
}
// The water's temperature at p, bilinear between cell centres, and its gradient (degrees per cell).
fn heatSample(p: vec2f) -> vec3f {
  if (!HEAT_ON) { return vec3f(TREF, 0.0, 0.0); }
  let u = p - 0.5;
  let i = vec2i(floor(u));
  let t = u - floor(u);
  let a = heatCell(i.x, i.y);
  let b = heatCell(i.x + 1, i.y);
  let c = heatCell(i.x, i.y + 1);
  let d = heatCell(i.x + 1, i.y + 1);
  return vec3f(mix(mix(a, b, t.x), mix(c, d, t.x), t.y), mix(b - a, d - c, t.y), mix(c - a, d - b, t.x));
}
fn cellThermal(g: Genome, t: f32) -> Thermal {
  if (!HEAT_ON) { return Thermal(1.0, 0.0, 0.0, false); }
  return thermalState(g, t, ${f(K.specBonus)}, ${f(K.torporAt)}, ${f(K.thermalFlat)}, ${f(K.thermalWarm)});
}
// Warm the water at p by e degrees (before its heat capacity), in eighths of a frame's worth.
fn depositHeat(p: vec2f, e: f32) {
  if (HEAT_ON && e > 0.0) { atomicAdd(&thermal[cellOf(p)], u32(e * HEAT_FIX + 0.5)); }
}

// Specialists digest their food better than generalists: value of a food given the share of the diet devoted to it.
fn spec(d: f32) -> f32 { let c = min(d, 1.0); return c * (${f(1 - 0.6)} + ${f(0.6)} * c); }

// Ledger guild order: producer, grazer, predator, scavenger, omnivore.
fn dietGuild(g: Genome) -> u32 {
  if (g.photo > 0.55) { return 0u; }
  if (g.dFlesh > 0.55) { return 2u; }
  if (g.dHusk > 0.55) { return 3u; }
  if (g.dGlint > 0.55) { return 1u; }
  return 4u;
}

fn addEnergy(guild: u32, slot: u32, e: f32) {
  if (e > 0.0) { atomicAdd(&ledger[META_ENERGY + 8u * guild + slot], u32(e * 1000.0 + 0.5)); }
}

fn deriveMetab(g: Genome) -> f32 {
  return (0.012 + 0.0032 * g.force + 0.012 * g.radius + 0.00012 * g.lifespan
        + ${f(K.anchorCost)} * (1.0 - g.advect) + 0.004 * g.size + ${f(K.swimCost)} * g.swim * (1.0 - g.photo) + 0.006 * g.align + 0.004 * g.adhesion + ${f(K.calcCost)} * g.calcify) * ${f(K.metab)};
}

fn finalize(g: ptr<function, Genome>) {
  let s = max((*g).dGlint + (*g).dHusk + (*g).dFlesh, 1e-3);
  (*g).dGlint = (*g).dGlint / s;
  (*g).dHusk = (*g).dHusk / s;
  (*g).dFlesh = (*g).dFlesh / s;
  (*g).metab = deriveMetab(*g);
  (*g).col = pack4x8unorm(vec4f(roleColor(*g, 0u), 1.0));
}

fn allocSlot(s: ptr<function, u32>) -> u32 {
  for (var t = 0u; t < 12u; t++) {
    *s = pcg(*s);
    let k = FIRST_LIFE + (*s % (MAXK - FIRST_LIFE));
    let r = atomicCompareExchangeWeak(&ledger[META_SLOT + k], 0u, 1u);
    if (r.exchanged) { return k; }
  }
  return NONE;
}

fn mutSig(v: u32, m: f32, s: ptr<function, u32>) -> u32 {
  return pack4x8snorm(clamp(unpack4x8snorm(v) + g4(s) * m, vec4f(-1.0), vec4f(1.0)));
}

fn sampleRole(g: Genome, r: u32, s: ptr<function, u32>) -> u32 {
  let row = unpack4x8unorm(g.dev[r]).xyz;
  let u = rnd(s) * max(row.x + row.y + row.z, 1e-3);
  if (u < row.x) { return 0u; }
  if (u < row.x + row.y) { return 1u; }
  return 2u;
}

fn mutateInto(slot: u32, parentKind: u32, s: ptr<function, u32>) {
  var g = genomes[parentKind];
  let m = 0.04 + 0.8 * pow(rnd(s), 3.0);
  for (var r = 0u; r < 3u; r++) {
    g.sig[r] = vec4u(mutSig(g.sig[r].x, m, s), mutSig(g.sig[r].y, m, s), mutSig(g.sig[r].z, m, s), mutSig(g.sig[r].w, m, s));
  }
  // rare structural rewrites: a role reinvented, or one role copied over another
  if (rnd(s) < 0.06) {
    let r = min(u32(rnd(s) * 3.0), 2u);
    g.sig[r] = vec4u(pack4x8snorm(r4(s)), pack4x8snorm(r4(s)), pack4x8snorm(r4(s)), pack4x8snorm(r4(s)));
  } else if (rnd(s) < 0.05) {
    let a = min(u32(rnd(s) * 3.0), 2u);
    let b = (a + 1u + min(u32(rnd(s) * 2.0), 1u)) % 3u;
    g.sig[b] = g.sig[a];
  }
  for (var r = 0u; r < 3u; r++) {
    g.dev[r] = pack4x8unorm(clamp(unpack4x8unorm(g.dev[r]) + g4(s) * m * 0.35, vec4f(0.0), vec4f(1.0)));
  }
  g.radius = clamp(g.radius + gauss(s) * m * 0.12, 0.4, 1.0);
  g.beta = clamp(g.beta + gauss(s) * m * 0.06, 0.12, 0.5);
  g.force = clamp(g.force * exp(gauss(s) * m * 0.4), 1.0, 16.0);
  g.drag = clamp(g.drag * exp(gauss(s) * m * 0.4), 0.015, 0.4);
  g.lifespan = clamp(g.lifespan * exp(gauss(s) * m * 0.4), 20.0, 500.0);
  g.reproE = clamp(g.reproE * exp(gauss(s) * m * 0.3), 0.6, 4.0);
  g.share = clamp(g.share + gauss(s) * m * 0.08, 0.2, 0.7);
  g.dGlint = max(g.dGlint + gauss(s) * m * 0.3, 0.0);
  g.dHusk = max(g.dHusk + gauss(s) * m * 0.3, 0.0);
  g.dFlesh = max(g.dFlesh + gauss(s) * m * 0.3, 0.0);
  g.mutRate = clamp(g.mutRate * exp(gauss(s) * m * 0.5), 0.002, 0.08);
  g.hue = fract(g.hue + gauss(s) * m * 0.35 + 1.0);
  g.sat = clamp(g.sat + gauss(s) * m * 0.1, 0.4, 1.0);
  g.lum = clamp(g.lum + gauss(s) * m * 0.08, 0.45, 0.8);
  g.size = clamp(g.size * exp(gauss(s) * m * 0.35), 0.45, 2.6);
  if (rnd(s) < m * 0.6) { g.shape = floor(rnd(s) * 12.0); }
  g.pulse = clamp(g.pulse + gauss(s) * m * 0.2, 0.0, 1.0);
  g.roleHue = clamp(g.roleHue + gauss(s) * m * 0.1, -0.35, 0.35);
  g.advect = clamp(g.advect + gauss(s) * m * 0.15, 0.03, 1.0);
  g.swim = clamp(g.swim + gauss(s) * m * 0.5, 0.0, 3.0);
  g.align = clamp(g.align + gauss(s) * m * 0.3, 0.0, 1.0);
  g.photo = clamp(g.photo + gauss(s) * m * 0.25, 0.0, 1.0);
  g.adhesion = clamp(g.adhesion + gauss(s) * m * 0.25, 0.0, 1.0);
  g.calcify = clamp(g.calcify + gauss(s) * m * 0.2, 0.0, 1.0);
  if (rnd(s) < m * 0.1) { g.calcify = select(0.0, mix(0.2, 0.8, rnd(s)), g.calcify < 0.05); }
  if (rnd(s) < m * 0.15) { g.adhesion = select(0.0, mix(0.3, 1.0, rnd(s)), g.adhesion < 0.15); }
  g.topt = clamp(g.topt + gauss(s) * m * 3.0, 0.0, 45.0);
  g.tol = clamp(g.tol * exp(gauss(s) * m * 0.3), 2.0, 15.0);
  var thermo = clamp(thermoOf(g) + gauss(s) * m * 0.15, 0.0, 1.0);
  if (rnd(s) < m * 0.1) { thermo = select(0.0, mix(0.3, 0.7, rnd(s)), thermo < 0.05); }
  g.dev.w = u32(thermo * 255.0 + 0.5);
  g.parent = g.serial;
  g.serial = atomicAdd(&ledger[1], 1u) + 1u;
  g.born = sim.time;
  g.depth = g.depth + 1u;
  finalize(&g);
  genomes[slot] = g;
}

// A spark of life founds a species suited to the water it sparked in (t).
fn randomInto(slot: u32, s: ptr<function, u32>, t: f32) {
  var g: Genome;
  for (var r = 0u; r < 3u; r++) {
    g.sig[r] = vec4u(pack4x8snorm(r4(s)), pack4x8snorm(r4(s)), pack4x8snorm(r4(s)), pack4x8snorm(r4(s)));
    g.dev[r] = pack4x8unorm(vec4f(rnd(s), rnd(s), rnd(s), 0.0));
  }
  g.radius = mix(0.5, 0.95, rnd(s));
  g.beta = mix(0.2, 0.4, rnd(s));
  g.force = mix(2.0, 10.0, rnd(s));
  g.drag = mix(0.03, 0.15, rnd(s));
  g.lifespan = mix(50.0, 220.0, rnd(s));
  g.reproE = mix(0.9, 2.2, rnd(s));
  g.share = mix(0.35, 0.55, rnd(s));
  g.dGlint = rnd(s);
  g.dHusk = rnd(s) * 0.6;
  let fl = rnd(s);
  g.dFlesh = fl * fl;
  g.mutRate = mix(0.005, 0.025, rnd(s));
  g.hue = rnd(s);
  g.sat = mix(0.6, 1.0, rnd(s));
  g.lum = mix(0.5, 0.72, rnd(s));
  g.size = mix(0.6, 1.6, rnd(s));
  g.shape = floor(rnd(s) * 12.0);
  let pu = rnd(s);
  g.pulse = pu * pu;
  g.roleHue = (rnd(s) - 0.5) * 0.3;
  g.advect = mix(0.1, 0.9, rnd(s));
  let sw = rnd(s);
  g.swim = sw * sw * 1.6;
  g.align = rnd(s) * 0.8;
  let ph = rnd(s);
  g.photo = select(0.0, ph, ph > 0.5);
  let ad = rnd(s);
  g.adhesion = select(0.0, ad, ad > 0.5);
  let ca = rnd(s);
  g.calcify = select(0.0, ca, ca > 0.7);
  g.topt = clamp(t + gauss(s) * 3.0, 0.0, 45.0);
  g.tol = mix(3.0, 10.0, rnd(s));
  g.parent = 0u;
  g.serial = atomicAdd(&ledger[1], 1u) + 1u;
  g.born = sim.time;
  g.depth = 0u;
  finalize(&g);
  genomes[slot] = g;
}

// Bedrock: sim.rock.x outcrops, each a wandering chain of five discs of radius about sim.rock.y.
fn inRock(p: vec2f) -> bool {
  for (var b = 0u; b < u32(sim.rock.x); b++) {
    var s = pcg(sim.seed ^ pcg(b * 7919u + 17u));
    var c = vec2f(rnd(&s), rnd(&s)) * sim.world;
    var a = rnd(&s) * TAU;
    let r0 = sim.rock.y * (0.5 + rnd(&s));
    for (var k = 0u; k < 5u; k++) {
      let r = r0 * (0.6 + 0.6 * rnd(&s));
      var d = p - c;
      d -= sim.world * round(d / sim.world);
      if (dot(d, d) < r * r) { return true; }
      a += (rnd(&s) - 0.5) * 1.6;
      c += vec2f(cos(a), sin(a)) * r * 1.3;
    }
  }
  return false;
}

// ---------------------------------------------------------------- seeding
@compute @workgroup_size(256)
fn seedMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= sim.count) { return; }
  var s = pcg(i ^ pcg(sim.seed));
  var pos = vec2f(rnd(&s), rnd(&s)) * sim.world;
  let u = rnd(&s);
  var kind = SILT;
  var e = 0.0;
  var col = 0u;
  var age = 0.0;
  var info = 0u;
  if (u < sim.pSilt) {
  } else if (u < sim.pSilt + sim.pGlint) {
    kind = GLINT; e = 0.5 + 0.5 * rnd(&s);
  } else if (u < sim.pSilt + sim.pGlint + sim.pHusk) {
    kind = HUSK; e = 0.2 + 0.3 * rnd(&s); col = pack4x8unorm(vec4f(0.5, 0.35, 0.25, 1.0));
  } else {
    kind = FIRST_LIFE + min(u32(rnd(&s) * f32(sim.seedKinds)), sim.seedKinds - 1u);
    if (rnd(&s) < sim.clump) {
      // one of the species' one to four colonies
      let nc = 1u + pcg(kind ^ sim.seed) % 4u;
      let h = pcg(sim.seed ^ pcg(kind * 977u + min(u32(rnd(&s) * f32(nc)), nc - 1u) * 7919u + 1u));
      let center = vec2f(f32(h & 0xffffu), f32(h >> 16u)) / 65536.0 * sim.world;
      pos = wrapPos(center + vec2f(gauss(&s), gauss(&s)) * sim.spread);
    }
    let g = genomes[kind];
    e = 0.4 + 0.6 * rnd(&s);
    let r = sampleRole(g, sampleRole(g, 0u, &s), &s);
    col = pack4x8unorm(vec4f(roleColor(g, r), 1.0));
    age = rnd(&s) * g.lifespan * 0.6;
    info = r << 4u;
  }
  if (kind == SILT && sim.rock.x > 0.0 && inRock(pos)) {
    kind = STONE; e = ${f(K.rockLife)} * (0.5 + rnd(&s)); col = pack4x8unorm(vec4f(0.46, 0.42, 0.38, 1.0));
  } else if (kind == SILT && HEAT_ON && rnd(&s) < ${f(K.framboids)}
             && f32(pcg(sim.seed ^ pcg(u32(pos.x / 5.0) * 7919u + u32(pos.y / 5.0) * 104729u)) >> 8u) / 16777216.0 < 0.25) {
    // framboids lie in patches of the mud, part burnt already, so they do not all burn out together
    kind = FRAMBOID; e = ${f(K.framboidLife)} * (0.2 + rnd(&s)); col = FRAMBOID_COL;
    atomicAdd(&ledger[META_ENERGY + 58u], 1u);
  }
  parts[i] = Particle(pos, vec2f(0.0), kind, e, age, i, col, info);
  intent[i] = vec4u(0u, 0u, NONE, NONE);
}

// ------------------------------------------------- resolve claims + count
var<workgroup> hist: array<atomic<u32>, MAXK>;
var<workgroup> roleHist: array<atomic<u32>, 3>;

@compute @workgroup_size(256)
fn resolveCount(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) l: u32) {
  for (var k = l; k < MAXK; k += 256u) { atomicStore(&hist[k], 0u); }
  if (l < 3u) { atomicStore(&roleHist[l], 0u); }
  workgroupBarrier();
  let i = gid.x;
  if (i < sim.count) {
    var p = parts[i];
    // Matter has no bonds, even if this index held a living cell before the last sort.
    if (p.kind < FIRST_LIFE) { intent[i].z = NONE; intent[i].w = NONE; }
    let c = atomicLoad(&ledger[META_CLAIM + i]);
    if (c != 0u) {
      atomicStore(&ledger[META_CLAIM + i], 0u);
      var action = 0u;
      var act = 0u;
      var ck = 0u;
      var bites = 1.0;
      if ((c & MEAL_CLAIM) != 0u) {
        // a coarse step's meal: the target's kind follows from its class; bites at most one a tick
        let cls = (c >> 29u) & 3u;
        act = select(1u, 3u, cls == 3u);
        ck = select(select(HUSK, GLINT, cls == 1u), select(NONE, p.kind, p.kind >= FIRST_LIFE), cls == 0u || cls == 3u);
        if (cls == 3u) { bites = f32(min(c & 0xffffu, sim.ticks)); }
      } else {
        // Only x/y are read here; other invocations may reset their own bond slots.
        action = intent[c - 1u].x;
        act = action & 3u;
        ck = (action >> 2u) & 1023u;
      }
      if (act == 1u && p.kind == ck) {
        if (p.kind >= FIRST_LIFE) {
          // a kill leaves a carcass for the scavengers
          atomicAdd(&ledger[META_DEATH + 4u * dietGuild(genomes[p.kind]) + 3u], 1u);
          p.kind = HUSK; p.energy = ${f(K.carcass)}; p.age = 0.0; p.vel *= 0.2;
          p.info = (p.info & 0xfffffff0u) | 3u;
        } else {
          p.kind = SILT; p.energy = 0.0; p.vel = vec2f(0.0); p.age = 0.0;
          p.info = (p.info & 0xffffffc0u) | 3u;
        }
      } else if (act == 3u && p.kind == ck) {
        if (p.kind >= FIRST_LIFE) {
          p.energy -= ${f(K.bite)} * bites;
          if (p.energy <= 0.0) {
            atomicAdd(&ledger[META_DEATH + 4u * dietGuild(genomes[p.kind]) + 3u], 1u);
            p.kind = HUSK; p.energy = ${f(K.huskBase)}; p.age = 0.0;
            p.info = (p.info & 0xfffffff0u) | 3u;
          }
        }
      } else if (act == 2u && (p.kind == SILT || p.kind == GLINT)) {
        let cr = (action >> 12u) & 3u;
        let gen = (action >> 14u) & 0xffffu;
        p.kind = ck;
        p.energy = bitcast<f32>(intent[c - 1u].y);
        p.age = 0.0;
        p.vel = vec2f(0.0);
        p.id = atomicAdd(&ledger[0], 1u);
        p.col = pack4x8unorm(vec4f(roleColor(genomes[ck], cr), 1.0));
        p.info = (gen << 16u) | (cr << 4u) | 9u;
        intent[i].z = select(NONE, c - 1u, genomes[ck].adhesion > ${f(K.adhMin)});
        intent[i].w = NONE;
        atomicAdd(&ledger[2], 1u);
        atomicAdd(&ledger[META_DEATH + 4u * dietGuild(genomes[ck])], 1u);
      }
      parts[i] = p;
    }
    let cell = cellOf(p.pos);
    let r = atomicAdd(&countsA[cell], 1u);
    aux[i] = vec2u(cell, r);
    if (p.kind == STONE) { atomicAdd(&stoneGrid[cell], select(0x10000u, 1u, (p.info & 15u) != 0u)); }
    // husks per grid cell: where they pile up and rot, framboids form (matterMain)
    if (p.kind == HUSK && HEAT_ON) { atomicAdd(&thermal[2u * MAX_CELLS + cell], 1u); }
    atomicAdd(&hist[p.kind % MAXK], 1u);
    if (p.kind >= FIRST_LIFE) { atomicAdd(&roleHist[roleOf(p.info)], 1u); }
  }
  workgroupBarrier();
  for (var k = l; k < MAXK; k += 256u) {
    let v = atomicLoad(&hist[k]);
    if (v > 0u) { atomicAdd(&ledger[META_POP + k], v); }
  }
  if (l < 3u) {
    let v = atomicLoad(&roleHist[l]);
    if (v > 0u) { atomicAdd(&ledger[12u + l], v); }
  }
}

// --------------------------------------------------------------- prefix scan
var<workgroup> sh: array<u32, 256>;

@compute @workgroup_size(256)
fn scanBlocks(@builtin(local_invocation_index) l: u32, @builtin(workgroup_id) wg: vec3u) {
  let g = wg.x * 256u + l;
  let v = countsP[g];
  sh[l] = v;
  workgroupBarrier();
  for (var o = 1u; o < 256u; o = o << 1u) {
    var t = 0u;
    if (l >= o) { t = sh[l - o]; }
    workgroupBarrier();
    sh[l] = sh[l] + t;
    workgroupBarrier();
  }
  cellStart[g] = sh[l] - v;
  if (l == 255u) { blockSums[wg.x] = sh[l]; }
}

@compute @workgroup_size(256)
fn scanSums(@builtin(local_invocation_index) l: u32) {
  let b = l * 4u;
  let a0 = blockSums[b];
  let a1 = blockSums[b + 1u];
  let a2 = blockSums[b + 2u];
  let a3 = blockSums[b + 3u];
  let s = a0 + a1 + a2 + a3;
  sh[l] = s;
  workgroupBarrier();
  for (var o = 1u; o < 256u; o = o << 1u) {
    var t = 0u;
    if (l >= o) { t = sh[l - o]; }
    workgroupBarrier();
    sh[l] = sh[l] + t;
    workgroupBarrier();
  }
  let ex = sh[l] - s;
  blockSums[b] = ex;
  blockSums[b + 1u] = ex + a0;
  blockSums[b + 2u] = ex + a0 + a1;
  blockSums[b + 3u] = ex + a0 + a1 + a2;
  if (l == 255u) { cellStart[MAX_CELLS] = sh[255]; }
}

@compute @workgroup_size(256)
fn scanAdd(@builtin(global_invocation_id) gid: vec3u, @builtin(workgroup_id) wg: vec3u) {
  cellStart[gid.x] = cellStart[gid.x] + blockSums[wg.x];
}

// ------------------------------------------------------------------ scatter
var<workgroup> wgCount: atomic<u32>;
var<workgroup> wgBase: u32;

@compute @workgroup_size(256)
fn scatterMain(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) l: u32) {
  if (l == 0u) { atomicStore(&wgCount, 0u); }
  workgroupBarrier();
  let i = gid.x;
  var dst = NONE;
  var slot = NONE;
  if (i < sim.count) {
    let a = aux[i];
    dst = cellStart[a.x] + a.y;
    let p = parts[i];
    sortedFull[dst] = p;
    // Bonds use last frame's sorted indices; move each endpoint through the same sort.
    var partners = vec2u(NONE);
    if (p.kind >= FIRST_LIFE) {
      for (var k = 0u; k < 2u; k++) {
        let j = intent[i][k + 2u];
        if (j < sim.count && j != i) {
          let b = aux[j];
          partners[k] = cellStart[b.x] + b.y;
        }
      }
    }
    bondsNow[dst] = partners;
    let role = roleOf(p.info);
    let sig = genomes[p.kind].sig[role].xy;
    let plant = select(0u, 1u << 12u, p.kind >= FIRST_LIFE && genomes[p.kind].photo > 0.4);
    sortedLite[dst] = Lite(p.pos, p.kind | (role << 10u) | plant, p.col, pack2x16float(p.vel), sig.x, sig.y, 0u);
    if (p.kind >= FIRST_LIFE) { slot = atomicAdd(&wgCount, 1u); }
  }
  workgroupBarrier();
  if (l == 0u) { wgBase = atomicAdd(&frameCtr[0], atomicLoad(&wgCount)); }
  let base = workgroupUniformLoad(&wgBase);
  if (slot != NONE) { livingList[base + slot] = dst; }
}

// ------------------------------------------------------------------- census
@compute @workgroup_size(256)
fn censusMain(@builtin(global_invocation_id) gid: vec3u) {
  let s = gid.x;
  let n = atomicLoad(&frameCtr[0]);
  if (s >= FIRST_LIFE && s < MAXK) {
    if (atomicLoad(&ledger[META_SLOT + s]) == 1u && atomicLoad(&ledger[META_POP + s]) == 0u) {
      atomicStore(&ledger[META_SLOT + s], 0u);
      atomicAdd(&ledger[8], 1u);
    }
  }
  let padded = (n + 127u) / 128u * 128u;
  if (s < 128u && n + s < padded) { livingList[n + s] = NONE; }
  if (s == 0u) {
    atomicStore(&frameCtr[1], (n + 127u) / 128u);
    atomicStore(&frameCtr[2], 1u);
    atomicStore(&frameCtr[3], 1u);
    atomicStore(&frameCtr[4], 4u);
    atomicStore(&frameCtr[5], n);
    atomicStore(&frameCtr[6], 0u);
    atomicStore(&frameCtr[7], 0u);
    atomicStore(&frameCtr[8], 4u);
    atomicStore(&frameCtr[10], 0u);
    atomicStore(&frameCtr[11], 0u);
  }
}

// ------------------------------------------------------------------- matter
var<workgroup> stoneN: atomic<u32>;
var<workgroup> stoneBase: u32;

@compute @workgroup_size(256)
fn matterMain(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) l: u32) {
  let i = gid.x;
  // list this step's stone for rendering, one global atomic per workgroup
  if (l == 0u) { atomicStore(&stoneN, 0u); }
  workgroupBarrier();
  var slot = NONE;
  if (i < sim.count && (sortedFull[i].kind == STONE || sortedFull[i].kind == FRAMBOID)) { slot = atomicAdd(&stoneN, 1u); }
  workgroupBarrier();
  if (l == 0u) { stoneBase = atomicAdd(&frameCtr[9], atomicLoad(&stoneN)); }
  let base = workgroupUniformLoad(&stoneBase);
  if (slot != NONE) { stoneList[base + slot] = i; }
  if (i >= sim.count) { return; }
  var p = sortedFull[i];
  if (p.kind >= FIRST_LIFE) { return; }
  if (p.kind == STONE || p.kind == FRAMBOID) {
    // stone stays put and wears away; its energy is the time it has left. Reef stone (bedrock has cause 0)
    // wears by its surroundings: loose grains fast and grains packed into a reef slowly, so rubble clears
    // and reefs stay solid, but a neighbourhood that is mostly reef wears fast (waves and borers on a reef
    // flat), so reefs grow as separate patches about as wide as that neighbourhood.
    var wear = 1.0;
    let framboid = p.kind == FRAMBOID;
    if (framboid) {
      // a framboid oxidises: it warms its water while it lasts (every eighth frame, eight frames' worth)
      if (((sim.frame + p.id) & 7u) == 0u) { depositHeat(p.pos, ${f(K.framboidHeat)} * sim.dt * 8.0); }
      // and oxidises faster the warmer its water, so a crowded, hot cluster burns itself out
      wear = pow(2.0, (heatCell(i32(p.pos.x), i32(p.pos.y)) - TREF) / 10.0);
    } else if ((p.info & 15u) != 0u) {
      let c = vec2i(clamp(floor(p.pos), vec2f(0.0), vec2f(sim.grid) - 1.0));
      let gw = i32(sim.grid.x);
      let gh = i32(sim.grid.y);
      let here = f32(atomicLoad(&stoneGrid[u32(c.y * gw + c.x)]) & 0xffffu);
      var region = 0.0;
      if (${f(K.regionWear)} > 0.0) {
        for (var dy = -${K.regionR | 0}; dy <= ${K.regionR | 0}; dy++) {
          for (var dx = -${K.regionR | 0}; dx <= ${K.regionR | 0}; dx++) {
            let x = (c.x + dx + gw) % gw;
            let y = (c.y + dy + gh) % gh;
            region += f32(atomicLoad(&stoneGrid[u32(y * gw + x)]) & 0xffffu);
          }
        }
      }
      wear = mix(${f(K.wearLoose)}, ${f(K.wearPacked)}, smoothstep(2.0, ${f(K.packedAt)}, here))
        * (1.0 + ${f(K.regionWear)} * max(0.0, region / ${f((2 * (K.regionR | 0) + 1) ** 2)} / ${f(K.regionCap)} - 1.0));
    }
    p.energy -= sim.dt * wear;
    p.age += sim.dt;
    p.vel = vec2f(0.0);
    if (p.energy <= 0.0) {
      // worn away (7), or a spent framboid crumbling (13)
      p.kind = SILT; p.energy = 0.0; p.age = 0.0;
      p.info = (p.info & 0xffffffc0u) | select(7u, 13u, framboid);
    }
    parts[i] = p;
    return;
  }
  var s = pcg((p.id * 1664525u) ^ pcg(sim.frame * 2654435761u + sim.seed));
  // the water's warmth here: warm water wears glint and husks faster and shakes grains harder
  let T = select(TREF, heatCell(i32(p.pos.x), i32(p.pos.y)), HEAT_ON);
  let warm = (T - TREF) / 10.0;
  let hot = T - sim.tbg;
  // Brownian drift as a smooth random velocity that persists ~0.5 s (Ornstein-Uhlenbeck), scaled so
  // grains spread as far as independent per-frame kicks would, without visibly shaking up close
  let keep = exp(-sim.dt / 0.5);
  let kick = vec2f(rnd(&s) - 0.5, rnd(&s) - 0.5) * (${f(K.jitter)} * sqrt((1.0 - keep * keep) * sim.dt / (2.0 * 0.5))
    * select(1.0, sqrt(max(T, 0.0) + 10.0) / ${f(Math.sqrt(K.tRef + 10))}, HEAT_ON));
  // a fresh husk still carries its cell's velocity; cap it to the jitter's own scale so it doesn't coast
  let w = p.vel - flowAt(p.pos);
  let jit = w * (keep * min(1.0, 0.05 / max(length(w), 1e-6))) + kick;
  var vel = flowAt(p.pos) + jit;${K.heat && K.marangoni > 0 ? `
  // surface flow: warm water's surface pulls toward cooler water, carrying matter with it
  vel -= heatSample(p.pos).yz * ${f(K.marangoni)};` : ''}
  let pos = wrapPos(p.pos + vel * sim.dt);
  p.age += sim.dt;
  if (p.kind == SILT) {
    let tide = tideAt(pos, sim.world, sim.time, sim.tide, sim.tidePh) * sim.season + 0.2 * sim.ambient;
    // a step's chance of charging; for coarse steps the exact chance of at least one event in the step.
    // Hot springs: water far above the background charges silt even in the dark
    let lam = tide * ${f(K.charge)} * sim.chargeMul + ${f(K.hotCharge)} * smoothstep(5.0, 15.0, hot);
    if (rnd(&s) < select(lam * sim.dt, 1.0 - exp(-lam * sim.dt), sim.ticks > 1u)) {
      p.kind = GLINT; p.energy = 1.0; p.age = 0.0;
      p.info = (p.info & 0xffffffc0u) | 5u;
    }
  } else if (p.kind == GLINT) {
    p.energy -= ${f(K.leak)} * pow(${f(K.glintQ10)}, warm) * sim.dt;
    if (p.energy < ${f(K.glintMin)}) {
      p.kind = SILT; p.energy = 0.0; p.age = 0.0;
      p.info = (p.info & 0xffffffc0u) | 6u;
    } else if (sim.abio > 0.0) {
      // sparks favour hot water (around framboids) and found species suited to it
      if (rnd(&s) < sim.abio * (1.0 + ${f(K.abioHeat)} * smoothstep(4.0, 20.0, hot))) {
        let k = allocSlot(&s);
        if (k != NONE) {
          randomInto(k, &s, T);
          p.kind = k; p.energy = 0.9; p.age = 0.0;
          p.id = atomicAdd(&ledger[0], 1u);
          p.col = genomes[k].col;
          p.info = 8u;
          intent[i] = vec4u(0u, 0u, NONE, NONE);
          vel = vec2f(0.0);
          atomicAdd(&ledger[4], 1u);
        }
      }
    }
  } else if (p.kind == HUSK) {
    // rot is faster in warm water, and a carcass pile steams; a husk gives off no more than it holds,
    // or hot water would rot husks into heat from nothing and run away
    let rot = min(${f(K.decay)} * pow(${f(K.rotQ10)}, warm) * sim.dt, max(p.energy, 0.0));
    p.energy -= rot;
    if (((sim.frame + p.id) & 7u) == 0u) { depositHeat(p.pos, rot * 8.0 * ${f(K.rotHeat)}); }
    if (p.energy < ${f(K.huskMin)}) {
      p.kind = SILT; p.energy = 0.0; p.age = 0.0;
      p.info = (p.info & 0xffffffc0u) | 4u;
      // in a pile of rotting husks the sulfide they release may crystallise as a framboid
      let pile = f32(atomicLoad(&thermal[2u * MAX_CELLS + cellOf(p.pos)]));
      if (HEAT_ON && rnd(&s) < ${f(K.framboidForm)} * smoothstep(3.0, ${f(K.framboidPile)}, pile) * (1.0 - smoothstep(0.0, 6.0, hot))) {
        p.kind = FRAMBOID; p.energy = ${f(K.framboidLife)} * (0.5 + rnd(&s)); p.col = FRAMBOID_COL;
        p.info = (p.info & 0xffffffc0u) | ${FRAMBOID_GROWN}u;
        vel = vec2f(0.0);
        atomicAdd(&ledger[META_ENERGY + 58u], 1u);
      }
    }
  }
  p.pos = pos;
  p.vel = vel;
  parts[i] = p;
}

// --------------------------------------------------------------------- heat
// One thread per grid cell: the water is carried by the currents (semi-Lagrangian), spreads, takes
// the heat deposited this step by life, rot and framboids, plus sunlight, and relaxes toward the
// climate's background. Stone in a cell gives it thermal mass: it warms and cools slowly.
@compute @workgroup_size(64)
fn heatMain(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= sim.grid.x * sim.grid.y) { return; }
  let x = i32(c % sim.grid.x);
  let y = i32(c / sim.grid.x);
  let centre = vec2f(f32(x), f32(y)) + 0.5;
  let here = heatCell(x, y);
  let carried = heatSample(centre - flowAt(centre) * sim.dt).x;
  let lap = heatCell(x + 1, y) + heatCell(x - 1, y) + heatCell(x, y + 1) + heatCell(x, y - 1) - 4.0 * here;
  let stones = atomicLoad(&stoneGrid[c]);
  let mass = 1.0 + ${f(K.stoneMass)} * f32((stones & 0xffffu) + (stones >> 16u));
  let light = sim.ambient + (1.0 - sim.ambient) * tideAt(centre, sim.world, sim.time, sim.tide, sim.tidePh) * sim.season;
  let q = f32(atomicExchange(&thermal[c], 0u)) / HEAT_FIX + ${f(K.sunHeat)} * light * sim.dt;
  let t = carried + ${f(K.heatD)} * lap * sim.dt + (q - ${f(K.heatLoss)} * (carried - sim.tbg) * sim.dt) / mass;
  heatNext[c] = t;
}

// --------------------------------------------------------------------- life
fn keepBond(i: u32, j: u32, p: Particle) -> u32 {
  if (j >= sim.count || j == i) { return NONE; }
  let q = sortedFull[j];
  if (q.kind != p.kind) { return NONE; }
  var d = q.pos - p.pos;
  d -= sim.world * round(d / sim.world);
  if (dot(d, d) > LINK_R * LINK_R * ${f(K.bondBreak * K.bondBreak)}) { return NONE; }
  return j;
}

// Handling time: matter is eaten at every meal opportunity, living prey only at every Nth.
fn mealDue(fk: u32, meal: u32) -> bool {
  return fk < FIRST_LIFE || meal % select(${K.killEvery | 0}u, ${K.biteEvery | 0}u, genomes[fk].photo > 0.4) == 0u;
}

// Whether an attack on food of kind fk misses: armour, an unfamiliar quarry, too little skill, or prey
// hiding among stone. Every roll is drawn whatever the outcome, so the random stream stays the same.
fn mealMissed(fk: u32, info: u32, g: Genome, eatEff: f32, stoneN: f32, s: ptr<function, u32>) -> bool {
  let armored = fk >= FIRST_LIFE && rnd(s) * (1.0 + ${f(K.armor)} * max(0.0, genomes[fk].adhesion - ${f(K.adhMin)})) > 1.0;
  let image = (info >> 6u) & 1023u;
  let unfamiliar = ${f(K.searchImage)} > 0.0 && fk >= FIRST_LIFE && image != 0u && image != fk && rnd(s) < ${f(K.searchImage)};
  let unskilled = ${f(K.catchSkill)} > 0.0 && fk >= FIRST_LIFE && rnd(s) >= min(1.0, eatEff * select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, genomes[fk].photo > 0.4) / ${f(K.catchSkill)});
  // an attack made from among stone often misses: prey hides in the crevices
  let sheltered = fk >= FIRST_LIFE && rnd(s) < min(${f(K.refugeMax)}, stoneN * ${f(K.refuge)});
  return armored || unfamiliar || unskilled || sheltered;
}

// K.diag: count v into a guild's slot k
fn diagAdd(dg: u32, k: u32, v: u32) { atomicAdd(&ledger[META_DIAG + DIAG_STRIDE * dg + k], v); }
fn isAnimal(j: u32) -> bool { return j != NONE && sortedFull[j].kind >= FIRST_LIFE && genomes[sortedFull[j].kind].photo <= 0.4; }

// Keep the four best food targets (fc, best first, by score fsc).
fn pushFood(fc: ptr<function, array<u32, 4>>, fsc: ptr<function, array<f32, 4>>, j: u32, sc: f32) {
  if (sc <= (*fsc)[3]) { return; }
  var k = 3u;
  while (k > 0u && (*fsc)[k - 1u] < sc) { (*fsc)[k] = (*fsc)[k - 1u]; (*fc)[k] = (*fc)[k - 1u]; k--; }
  (*fsc)[k] = sc;
  (*fc)[k] = j;
}

// The restoring part of a symmetric 2x2 gradient (xx, xy, yy): its eigenvalues clamped to <= 0.
fn restoring(j: vec3f) -> vec3f {
  let m = 0.5 * (j.x + j.z);
  let q = sqrt(0.25 * (j.x - j.z) * (j.x - j.z) + j.y * j.y);
  // isotropic (or empty): no direction to pick, and atan2(0, 0) is undefined
  if (q < 1e-9) { return vec3f(min(m, 0.0), 0.0, min(m, 0.0)); }
  let l1 = min(m + q, 0.0);
  let l2 = min(m - q, 0.0);
  let th = 0.5 * atan2(2.0 * j.y, j.x - j.z);
  let c = cos(th); let sn = sin(th);
  return vec3f(l1 * c * c + l2 * sn * sn, (l1 - l2) * c * sn, l1 * sn * sn + l2 * c * c);
}

@compute @workgroup_size(128)
fn lifeMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = livingList[gid.x];
  if (i == NONE) { return; }
${cellWGSL(K, false)}
  var E = p.energy + (photoGain - upkeep) * sim.dt;
  let dg = dietGuild(g);
  // all the energy a cell spends warms its water (every eighth frame, eight frames' worth)
  if (((sim.frame + p.id) & 7u) == 0u) { depositHeat(p.pos, upkeep * sim.dt * 8.0 * ${f(K.metabHeat)}); }
  // light and upkeep flow every frame; the ledger samples them once a second per cell
  if (((sim.frame + p.id) % 60u) == 0u) {
    addEnergy(dg, 0u, photoGain * sim.dt * 60.0);
    addEnergy(dg, 5u, (upkeep - heatMaking) * sim.dt * 60.0);
    addEnergy(dg, 7u, heatMaking * sim.dt * 60.0);
    if (HEAT_ON) {
      atomicAdd(&ledger[META_ENERGY + 40u + u32(clamp(Tc / ${f(HEAT_BIN)}, 0.0, ${f(HEAT_BINS - 1)}))], 1u);
      if (th.torpid) { atomicAdd(&ledger[META_ENERGY + 56u], 1u); }
      if (thermo > 0.2) { atomicAdd(&ledger[META_ENERGY + 57u], 1u); }
    }
  }
  var age = p.age + sim.dt;
  var act = 0u;
  var ck = 0u;
  var cr = 0u;
  var ce = 0.0;
  var info = p.info;
  if (DIAG && (sim.tick + p.id) / 60u != (sim.tick - sim.ticks + p.id) / 60u) {
    diagAdd(dg, 0u, 1u);
    diagAdd(dg, 1u, u32(crowd * 16.0));
    diagAdd(dg, 2u, u32(nutr * 16.0));
    diagAdd(dg, 3u, u32(pack * 16.0));
    diagAdd(dg, 4u, u32(kinN * 16.0));
    diagAdd(dg, 5u, u32(length(vel) * 1000.0));
    diagAdd(dg, 6u, u32(max(photoGain, 0.0) * 1000.0));
    diagAdd(dg, 7u, u32(light * 1000.0));
    if (hungry) { diagAdd(dg, 8u, 1u); if (food != NONE) { diagAdd(dg, 9u, 1u); } }
    diagAdd(dg, 10u, u32(length(force) * 100.0));
    diagAdd(dg, 11u, u32(clamp(E / g.reproE, 0.0, 4.0) * 1000.0));
    diagAdd(dg, 12u, u32(overlap * 16.0));
    // thermal performance, and how far it sits from its optimum (warmer or cooler, offset so it stays positive)
    diagAdd(dg, 22u, u32(th.perf * 1000.0));
    diagAdd(dg, 23u, u32(clamp(Tc - g.topt + 64.0, 0.0, 128.0) * 8.0));
    if (canHunt) { diagAdd(dg, 19u, u32(preyNear.x * 16.0)); diagAdd(dg, 20u, u32(preyNear.y * 16.0)); diagAdd(dg, 21u, 1u); }
  }
  if (sim.ticks == 1u) {
    if (DIAG && canHunt && (sim.tick + p.id) % ${K.eatEvery | 0}u == 0u && ((sim.tick + p.id) / ${K.eatEvery | 0}u) % ${K.killEvery | 0}u == 0u) {
      diagAdd(dg, 13u, 1u);
      if (isAnimal(food)) { diagAdd(dg, 14u, 1u); }
    }
    if (E > g.reproE && silt != NONE && !th.torpid) {
      if (atomicCompareExchangeWeak(&ledger[META_CLAIM + silt], 0u, i + 1u).exchanged) {
        ck = p.kind;
        cr = sampleRole(g, role, &s);
        if (rnd(&s) < g.mutRate) {
          let slot = allocSlot(&s);
          if (slot != NONE) {
            mutateInto(slot, p.kind, &s);
            ck = slot;
            atomicAdd(&ledger[3], 1u);
          }
        }
        ce = E * g.share;
        E -= ce + ${f(K.buildCost)};
        addEnergy(dg, 6u, ce + ${f(K.buildCost)});
        act = 2u;
      }
    // a meal opportunity every K.eatEvery ticks, in the cell's own phase
    } else if (food != NONE && (sim.tick + p.id) % ${K.eatEvery | 0}u == 0u && mealDue(sortedFull[food].kind, (sim.tick + p.id) / ${K.eatEvery | 0}u)) {
      let fk = sortedFull[food].kind;
      let missed = mealMissed(fk, info, g, eatEff, stoneN, &s);
      let won = !missed && atomicCompareExchangeWeak(&ledger[META_CLAIM + food], 0u, i + 1u).exchanged;
      if (DIAG && canHunt && isAnimal(food)) { diagAdd(dg, 15u, 1u); diagAdd(dg, select(select(17u, 18u, won), 16u, missed), 1u); }
      if (won) {
        let fp = sortedFull[food];
        if (fp.kind >= FIRST_LIFE) {
          atomicAdd(&ledger[META_DEATH + 32u + 5u * dietGuild(g) + dietGuild(genomes[fp.kind])], 1u);
        }
        ck = fp.kind;
        var gain = 0.0;
        act = 1u;
        if (fp.kind == GLINT) {
          gain = fp.energy * spec(g.dGlint); atomicAdd(&ledger[9], 1u);
        } else if (fp.kind == HUSK) {
          gain = fp.energy * spec(g.dHusk); atomicAdd(&ledger[10], 1u);
        } else if (genomes[fp.kind].photo > 0.4) {
          gain = min(max(fp.energy, 0.0), ${f(K.bite)}) * spec(${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh); act = 3u; atomicAdd(&ledger[11], 1u);
        } else {
          gain = (${f(K.preyBase)} + ${f(K.preyFrac)} * max(fp.energy, 0.0)) * spec(g.dFlesh); atomicAdd(&ledger[7], 1u);
        }
        if (fk >= FIRST_LIFE) { info = (info & 0xffff003fu) | (fk << 6u); }
        E += gain * ${f(K.gain)} * eatEff * th.perf;
        addEnergy(dg, select(select(select(4u, 2u, act == 3u), 3u, fp.kind == HUSK), 1u, fp.kind == GLINT), gain * ${f(K.gain)} * eatEff * th.perf);
      }
    }
  } else {
    // A coarse step walks its ticks in order, as that many 1/60 s steps would: energy flows tick by tick
    // (upkeep following it), the cell divides once its energy crosses the mark (one birth a step), eats
    // at each of its own meal opportunities while still hungry then (the next-best target after a meal or
    // a target lost to another eater), and stops at the tick it starves or ages out.
    E = p.energy;
    age = p.age;
    var next = 0u;
    var born = false;
    for (var k = 1u; k <= sim.ticks; k++) {
      E += (photoGain - g.metab * kinCost * thrift * (0.55 + 0.45 * clamp(E / g.reproE, 0.0, 1.0))
        * (1.0 + ${f(K.stressCost)} * th.stress) * select(1.0, ${f(K.torporCost)}, th.torpid) - heatMaking) * h;
      age += h;
      let tk = sim.tick - sim.ticks + k;
      if (!born && E > g.reproE && silt != NONE && !th.torpid) {
        born = true;
        var won = atomicCompareExchangeWeak(&ledger[META_CLAIM + silt], 0u, i + 1u).exchanged;
        if (!won && silt2 != NONE) { won = atomicCompareExchangeWeak(&ledger[META_CLAIM + silt2], 0u, i + 1u).exchanged; }
        if (won) {
          ck = p.kind;
          cr = sampleRole(g, role, &s);
          if (rnd(&s) < g.mutRate) {
            let slot = allocSlot(&s);
            if (slot != NONE) {
              mutateInto(slot, p.kind, &s);
              ck = slot;
              atomicAdd(&ledger[3], 1u);
            }
          }
          ce = E * g.share;
          E -= ce + ${f(K.buildCost)};
          addEnergy(dg, 6u, ce + ${f(K.buildCost)});
          act = 2u;
          continue;
        }
      } else if ((tk + p.id) % ${K.eatEvery | 0}u == 0u && next < 4u && E < g.reproE * ${f(K.sated)} && eatEff > 0.1 && !th.torpid) {
        let mi = (tk + p.id) / ${K.eatEvery | 0}u;
        let hunt = DIAG && mi % ${K.killEvery | 0}u == 0u && (g.dFlesh > DIET_MIN || g.dGlint > DIET_MIN);
        if (hunt) {
          diagAdd(dg, 13u, 1u);
          if (isAnimal(fc[next])) { diagAdd(dg, 14u, 1u); diagAdd(dg, 15u, 1u); }
        }
        while (next < 4u) {
          let fd = fc[next];
          if (fd == NONE) { next = 4u; break; }
          let fp = sortedFull[fd];
          // handling time, or a miss (armour, an unfamiliar quarry, skill, shelter), ends this opportunity
          if (!mealDue(fp.kind, mi)) { break; }
          if (mealMissed(fp.kind, info, g, eatEff, stoneN, &s)) { if (hunt && isAnimal(fd)) { diagAdd(dg, 16u, 1u); } break; }
          let plant = fp.kind >= FIRST_LIFE && genomes[fp.kind].photo > 0.4;
          var got = true;
          if (plant) {
            // bites don't exclude each other: in 1/60 s steps several grazers would each have had a turn
            atomicOr(&ledger[META_CLAIM + fd], MEAL_CLAIM | (3u << 29u));
            atomicAdd(&ledger[META_CLAIM + fd], 1u);
          } else {
            let cls = select(select(2u, 1u, fp.kind == GLINT), 0u, fp.kind >= FIRST_LIFE);
            got = atomicCompareExchangeWeak(&ledger[META_CLAIM + fd], 0u, MEAL_CLAIM | (cls << 29u) | (i + 1u)).exchanged;
          }
          if (hunt && isAnimal(fd)) { diagAdd(dg, select(17u, 18u, got), 1u); }
          next++;
          if (!got) { continue; }
          var gain = 0.0;
          var slot = 4u;
          if (fp.kind == GLINT) {
            gain = fp.energy * spec(g.dGlint); atomicAdd(&ledger[9], 1u); slot = 1u;
          } else if (fp.kind == HUSK) {
            gain = fp.energy * spec(g.dHusk); atomicAdd(&ledger[10], 1u); slot = 3u;
          } else if (plant) {
            gain = min(max(fp.energy, 0.0), ${f(K.bite)}) * spec(${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh); atomicAdd(&ledger[11], 1u); slot = 2u;
          } else {
            gain = (${f(K.preyBase)} + ${f(K.preyFrac)} * max(fp.energy, 0.0)) * spec(g.dFlesh); atomicAdd(&ledger[7], 1u);
          }
          if (fp.kind >= FIRST_LIFE) {
            atomicAdd(&ledger[META_DEATH + 32u + 5u * dietGuild(g) + dietGuild(genomes[fp.kind])], 1u);
            info = (info & 0xffff003fu) | (fp.kind << 6u);
          }
          E += gain * ${f(K.gain)} * eatEff * th.perf;
          addEnergy(dg, slot, gain * ${f(K.gain)} * eatEff * th.perf);
          break;
        }
      }
      if (E <= 0.0 || age > g.lifespan) { break; }
    }
  }

  var kind = p.kind;
  if (E <= 0.0) {
    kind = HUSK; E = ${f(K.huskBase)}; age = 0.0; vel *= 0.3;
    info = (info & 0xffffffc0u) | 1u;
    atomicAdd(&ledger[5], 1u);
    atomicAdd(&ledger[META_DEATH + 4u * dietGuild(g) + 1u], 1u);
  } else if (age > g.lifespan) {
    kind = HUSK; E = ${f(K.huskBase)} + ${f(K.huskFrac)} * E; age = 0.0; vel *= 0.3;
    info = (info & 0xffffffc0u) | 2u;
    atomicAdd(&ledger[6], 1u);
    atomicAdd(&ledger[META_DEATH + 4u * dietGuild(g) + 2u], 1u);
  } else if (th.x > 0.8 && rnd(&s) < ${f(K.scald)} * smoothstep(0.8, 1.4, th.x) * sim.dt) {
    // scalded: far above its optimum, a cell's proteins come apart
    kind = HUSK; E = ${f(K.huskBase)}; age = 0.0; vel *= 0.3;
    info = (info & 0xffffffc0u) | 10u;
    atomicAdd(&ledger[META_DEATH + 20u + dg], 1u);
  }
  // calcifying cells that settled leave their skeleton as stone, in their own colour, mostly where
  // stone already is, so reefs grow outward from rock and from the rare place one starts
  if (kind == HUSK && g.calcify > 0.0 && rnd(&s) < ${f(K.reefs)} * g.calcify * (1.0 - g.advect) * select(${f(K.nucleate)}, 1.0, stoneN >= 1.0)) {
    kind = STONE; E = ${f(K.stoneLife)} * (0.5 + rnd(&s)); vel = vec2f(0.0);
  }
  let childGen = ((genOf(p.info) + 1u) & 0xffffu) << 14u;
  // y: the child's energy on a birth; otherwise how closely packed this cell is, read only by rendering
  intent[i] = vec4u(act | (ck << 2u) | (cr << 12u) | childGen, bitcast<u32>(select(pack, ce, act == 2u)), n1, n2);
  parts[i] = Particle(pos, vel, kind, E, age, p.id, pack4x8unorm(vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0)), info);
}

// --------------------------------------------------------------------- mind
// Observational: after the last step, replays the watched cell's lifeMain decision with the same
// inputs (sorted particles, bonds, uniforms and random stream) and records every term of it.
// Writes only to the mind buffer, which nothing in the simulation reads.
@group(0) @binding(17) var<storage, read_write> mind: array<u32>;
const MIND_HEAD = ${MIND_HEAD}u;
const MIND_NBR = ${MIND_NBR}u;
var<private> mFr0: f32;
var<private> mVel: vec2f;
var<private> mAlign: vec2f;
var<private> mSwim: vec2f;
var<private> mSpace: vec2f;
var<private> mKin: vec2f;
var<private> mOther: vec2f;
var<private> mDiet: vec2f;
var<private> mMatter: vec2f;
var<private> mForage: vec2f;
var<private> mMatterN: vec4f;
var<private> mN: u32;

fn mPut(o: u32, v: f32) { mind[o] = bitcast<u32>(v); }
fn mPut2(o: u32, v: vec2f) { mind[o] = bitcast<u32>(v.x); mind[o + 1u] = bitcast<u32>(v.y); }

// One sampled neighbour's pull: fr0 its signature (or personal-space) term, fr with the diet's added.
fn mPair(j: u32, q: Lite, d: vec2f, r: f32, inside: bool, kin: bool, fr0: f32, fr: f32) {
  let u = d / r;
  let qk = q.kr & 1023u;
  if (qk < FIRST_LIFE) {
    mMatter += u * fr0;
    mForage += u * (fr - fr0);
    mMatterN[min(qk, STONE)] += 1.0; // (a framboid counts with stone)
    return;
  }
  if (inside) { mSpace += u * fr0; } else if (kin) { mKin += u * fr0; } else { mOther += u * fr0; }
  mDiet += u * (fr - fr0);
  if (mN < MIND_NBR) {
    let o = MIND_HEAD + mN * ${MIND_NBR_WORDS}u;
    mind[o] = qk;
    mind[o + 1u] = select(0u, 1u, inside);
    mPut2(o + 2u, d);
    mPut(o + 4u, fr0);
    mPut(o + 5u, fr - fr0);
    mind[o + 6u] = j;
  }
  mN++;
}

@compute @workgroup_size(64)
fn mindMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= sim.count || sortedFull[i].id != mind[0] || sortedFull[i].kind < FIRST_LIFE) { return; }
${cellWGSL(K, true)}
  let acc = stride * g.force * heavy;
  mind[1] = 1u;
  mind[2] = select(0u, 1u, hungry) | select(0u, 2u, silt != NONE) | select(0u, 4u, food != NONE);
  mind[3] = NONE;
  mPut(4, 0.0);
  mind[5] = food;
  if (food != NONE) {
    var df = sortedFull[food].pos - p.pos;
    df -= world * round(df * invWorld);
    mind[3] = sortedFull[food].kind;
    mPut(4, length(df));
  }
  mind[6] = (p.info >> 6u) & 1023u;
  mind[7] = mN;
  mPut(8, photoGain);
  mPut(9, upkeep);
  mPut(10, light);
  mPut(11, nutr);
  mPut(12, kinN);
  mPut(13, bonds);
  mPut(14, kinCost);
  mPut(15, stoneN);
  mPut(16, eatEff);
  mPut(17, stride);
  mPut(18, sim.dt);
  mPut(19, p.energy);
  mPut(20, acc);
  mPut2(22, vel);
  mPut2(24, mSpace * acc);
  mPut2(26, mKin * acc);
  mPut2(28, mOther * acc);
  mPut2(30, mDiet * acc);
  mPut2(32, mMatter * acc);
  mPut2(34, mForage * acc);
  mPut2(36, mAlign / h);
  mPut2(38, bondF * (g.adhesion * ${f(K.bond)}));
  mPut2(40, stoneF * (${f(K.stoneWall)} * (1.0 - g.calcify)));
  mPut2(42, mSwim);
  mPut2(44, flowAt(p.pos) * g.advect);
  for (var k = 0u; k < 4u; k++) { mPut(46u + k, mMatterN[k] * stride); }
  // warmth: its own temperature, the steer toward its optimum, the water, how well it works there
  mPut(21, Tc);
  mPut2(50, taxis);
  mPut(52, heat.x);
  mPut(53, th.perf);
  mPut(54, th.x);
  mind[55] = select(0u, 1u, th.torpid);
}
`;
}

export const PICK_WGSL = COMMON + /* wgsl */ `
struct PickU { center: vec2f, radius: f32, selId: u32, maxOut: u32, count: u32, world: vec2f, kindFilter: u32, p0: u32, p1: u32, p2: u32 };
struct PickEntry { particle: Particle, partners: vec2u };
struct PickOut { count: atomic<u32>, found: u32, pad0: u32, pad1: u32, tracked: Particle, entries: array<PickEntry> };
@group(0) @binding(0) var<uniform> pu: PickU;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read_write> pout: PickOut;
@group(0) @binding(3) var<storage, read> intent: array<vec4u>;

@compute @workgroup_size(256)
fn pickMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= pu.count) { return; }
  let p = parts[i];
  if (p.id == pu.selId) { pout.tracked = p; pout.found = 1u; }
  var d = p.pos - pu.center;
  d -= pu.world * round(d / pu.world);
  if (dot(d, d) < pu.radius * pu.radius && (pu.kindFilter == NONE || p.kind == pu.kindFilter)) {
    let k = atomicAdd(&pout.count, 1u);
    if (k < pu.maxOut) {
      var partners = vec2u(NONE);
      if (p.kind >= FIRST_LIFE) {
        for (var b = 0u; b < 2u; b++) {
          let j = intent[i][b + 2u];
          if (j < pu.count) {
            let partner = parts[j];
            if (partner.kind == p.kind) { partners[b] = partner.id; }
          }
        }
      }
      pout.entries[k] = PickEntry(p, partners);
    }
  }
}
`;

// Where a few particles are right now, found by id (observational): the page marks the cells
// that sing their species' note exactly where they are, as it does the followed cell.
export const WATCH_MAX = 16;
export const WATCH_WGSL = COMMON + /* wgsl */ `
struct WatchU { count: u32, n: u32, p0: u32, p1: u32, ids: array<vec4u, ${WATCH_MAX / 4}> };
struct WatchOut { at: array<vec4f, ${WATCH_MAX}>, found: array<u32, ${WATCH_MAX}> };
@group(0) @binding(0) var<uniform> wu: WatchU;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read_write> wout: WatchOut;

@compute @workgroup_size(256)
fn watchMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= wu.count) { return; }
  let p = parts[i];
  if (p.kind < FIRST_LIFE) { return; }
  for (var k = 0u; k < wu.n; k++) {
    if (wu.ids[k / 4u][k % 4u] == p.id) { wout.at[k] = vec4f(p.pos, p.vel); wout.found[k] = 1u; }
  }
}
`;

// The soundtrack's ears: a read-only scan for what happened since the last scan. A particle's
// age restarts at every change of state and the low bits of info say why, so every event in the
// window (age < window) is found with its exact time. Counts are exact, in and out of the view;
// in-view events are kept with a per-type probability (set from the previous scan's counts) so
// the sample is unbiased when there are more than the audio can play. Nothing here is written
// back to the simulation.
// 'alive' is not an event: a fair sample of the living cells in view, so each one can sing.
export const LISTEN_TYPES = ['birth', 'mutation', 'spark', 'starved', 'old', 'killed', 'eaten', 'charged', 'alive'];
export const LISTEN_CAP = 512;
export const LISTEN_HEAD = 32; // u32 words before the records
export const LISTEN_REC = 6; // u32 words per record
export const LISTEN_WGSL = COMMON + /* wgsl */ `
struct ListenU {
  center: vec2f, half: vec2f, world: vec2f, count: u32, seed: u32,
  now: f32, window: f32, vscale: f32, selKind: u32,
  keep: array<vec4f, 3>,
};
@group(0) @binding(0) var<uniform> lu: ListenU;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read> genomes: array<Genome>;
@group(0) @binding(3) var<storage, read_write> lout: array<atomic<u32>>;
// the water's temperature per grid cell (heatMain): torpid cells are still and silent
@group(0) @binding(4) var<storage, read> heatField: array<f32>;
// layout: [0,8) in-view events per type, [8,16) out of view, 16 living in view, 17 their summed
// speed (x1000), 18 living everywhere, 19 their summed speed (x1000), 20 particles in view,
// 21 records written, then records of 4 words from word 32.
var<workgroup> wc: array<atomic<u32>, 21>;

fn lhash(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

@compute @workgroup_size(256)
fn listenMain(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) l: u32) {
  if (l < 21u) { atomicStore(&wc[l], 0u); }
  workgroupBarrier();
  let i = gid.x;
  if (i < lu.count) {
    let p = parts[i];
    var d = p.pos - lu.center;
    d -= lu.world * round(d / lu.world);
    let inView = abs(d.x) <= lu.half.x && abs(d.y) <= lu.half.y;
    let life = p.kind >= FIRST_LIFE;
    let speed = length(p.vel);
    if (life) {
      atomicAdd(&wc[18], 1u);
      atomicAdd(&wc[19], u32(min(speed, 50.0) * 1000.0));
    }
    if (inView) {
      atomicAdd(&wc[20], 1u);
      if (life) { atomicAdd(&wc[16], 1u); atomicAdd(&wc[17], u32(min(speed, 50.0) * 1000.0)); }
    }
    var t = NONE;
    if (life && inView) {
      let g = genomes[p.kind];
      let c = vec2u(clamp(p.pos, vec2f(0.0), lu.world - 1.0));
      let warmth = heatField[MAX_CELLS + c.y * u32(lu.world.x) + c.x] + ${f(DEFAULT_K.selfWarm)} * thermoOf(g);
      if (!${shownThermal('g', 'warmth')}.torpid) { t = 8u; }
    }
    if (p.age < lu.window) {
      let code = p.info & 15u;
      if (life) {
        if (code == 9u) {
          t = 0u;
          let g = genomes[p.kind];
          if (g.depth > 0u && abs(g.born - (lu.now - p.age)) < 0.05) { t = 1u; }
        } else if (code == 8u) { t = 2u; }
      } else if (p.kind == HUSK) {
        // a scalded cell (10) dies as a starved one sounds
        if (code == 1u || code == 10u) { t = 3u; } else if (code == 2u) { t = 4u; } else if (code == 3u) { t = 5u; }
      } else if (p.kind == SILT && code == 3u) { t = 6u; }
      else if (p.kind == GLINT && code == 5u) { t = 7u; }
    }
    if (t != NONE) {
      if (t < 8u) { atomicAdd(&wc[select(8u + t, t, inView)], 1u); }
      var keep = lu.keep[t / 4u][t % 4u];
      if (t == 8u && p.kind == lu.selKind) { keep = 1.0; }
      if (inView && f32(lhash(p.id ^ lhash(lu.seed + t)) >> 8u) / 16777216.0 < keep) {
        let r = atomicAdd(&lout[21], 1u);
        if (r < ${LISTEN_CAP}u) {
          let o = ${LISTEN_HEAD}u + r * ${LISTEN_REC}u;
          let uv = clamp(d / lu.half * 0.5 + 0.5, vec2f(0.0), vec2f(1.0));
          atomicStore(&lout[o], t | ((p.kind & 1023u) << 4u) | (((p.info >> 4u) & 3u) << 14u) | ((p.id & 255u) << 16u)
            | (u32(clamp(speed / lu.vscale, 0.0, 1.0) * 255.0) << 24u));
          atomicStore(&lout[o + 1u], pack2x16unorm(uv));
          // events: their age (when they happened); living cells: energy toward their next division
          atomicStore(&lout[o + 2u], bitcast<u32>(select(p.age, clamp(p.energy / genomes[p.kind].reproE, 0.0, 1.5), t == 8u)));
          atomicStore(&lout[o + 3u], p.col);
          // where it is going and which particle it is (the page marks the cells that sing)
          atomicStore(&lout[o + 4u], pack2x16float(p.vel));
          atomicStore(&lout[o + 5u], p.id);
        }
      }
    }
  }
  workgroupBarrier();
  if (l < 21u) {
    let v = atomicLoad(&wc[l]);
    if (v > 0u) { atomicAdd(&lout[l], v); }
  }
}
`;

// The auto camera's survey (observational): the world in coarse tiles of `tile` grid cells, with
// what happened in each since the last survey. One thread per grid cell walks that cell's
// particles (they are sorted by cell) and adds its sums to the tile's counters.
export const SURVEY_WORDS = 10;
export const SURVEY = { living: 0, bonded: 1, births: 2, mutations: 3, sparks: 4, deaths: 5, kills: 6, species: 7, speed: 8, glint: 9 };
export const SURVEY_MAX_TILES = 4096;
export const SURVEY_WGSL = COMMON + /* wgsl */ `
struct SurveyU { grid: vec2u, tiles: vec2u, tile: u32, now: f32, window: f32, adhMin: f32 };
@group(0) @binding(0) var<uniform> su: SurveyU;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read> genomes: array<Genome>;
@group(0) @binding(3) var<storage, read> cellStart: array<u32>;
@group(0) @binding(4) var<storage, read_write> sout: array<atomic<u32>>;

@compute @workgroup_size(64)
fn surveyMain(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= su.grid.x * su.grid.y) { return; }
  var n = array<u32, ${SURVEY_WORDS}>();
  var mask = 0u;
  for (var i = cellStart[c]; i < cellStart[c + 1u]; i++) {
    let p = parts[i];
    let recent = p.age < su.window;
    let code = p.info & 15u;
    if (p.kind >= FIRST_LIFE) {
      let g = genomes[p.kind];
      n[0] += 1u;
      if (g.adhesion > su.adhMin) { n[1] += 1u; }
      n[8] += u32(min(length(p.vel), 50.0) * 100.0);
      mask |= 1u << (p.kind & 31u);
      if (recent && code == 9u) {
        n[2] += 1u;
        if (g.depth > 0u && abs(g.born - (su.now - p.age)) < 0.05) { n[3] += 1u; }
      } else if (recent && code == 8u) { n[4] += 1u; }
    } else if (p.kind == HUSK && recent) {
      if (code == 1u || code == 2u) { n[5] += 1u; } else if (code == 3u) { n[6] += 1u; }
    } else if (p.kind == SILT && recent && code == 3u) { n[6] += 1u; }
    else if (p.kind == GLINT) { n[9] += 1u; }
  }
  let t = min(vec2u(c % su.grid.x, c / su.grid.x) / su.tile, su.tiles - 1u);
  let o = (t.y * su.tiles.x + t.x) * ${SURVEY_WORDS}u;
  for (var k = 0u; k < ${SURVEY_WORDS}u; k++) {
    if (k == 7u) { if (mask != 0u) { atomicOr(&sout[o + 7u], mask); } }
    else if (n[k] != 0u) { atomicAdd(&sout[o + k], n[k]); }
  }
}
`;

// Rendering only: each living cell's incoming bonds, so a body's cells fuse with every partner,
// not only the (up to two) they keep themselves. Bonds are one-sided in the sim.
export const INBOND_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(1) var<storage, read> intent: array<vec4u>;
@group(0) @binding(2) var<storage, read> parts: array<Particle>;
@group(0) @binding(3) var<storage, read_write> bondsIn: array<atomic<u32>>;
// The grid cells of up to two drawn views (main, specimen): first cell, cell count; the grid, and
// in grid.z the animation time's bits.
// Particles are sorted by grid cell, so cellStart gives each cell's range: work scales with the view.
struct Views { first: array<vec4i, 2>, count: array<vec4u, 2>, grid: vec4u };
@group(0) @binding(4) var<uniform> views: Views;
@group(0) @binding(5) var<storage, read> cellStart: array<u32>;

fn cellRange(wg: vec3u) -> vec2u {
  let v = wg.z;
  if (any(wg.xy >= views.count[v].xy)) { return vec2u(0u); }
  let g = vec2i(views.grid.xy);
  let at = views.first[v].xy + vec2i(wg.xy);
  // the specimen view leaves cells the main view already covers to it
  if (v == 1u) {
    let o = (at - views.first[0].xy) - g * vec2i(floor(vec2f(at - views.first[0].xy) / vec2f(g)));
    if (all(vec2u(o) < views.count[0].xy)) { return vec2u(0u); }
  }
  let c = (at % g + g) % g;
  let cell = u32(c.y) * views.grid.x + u32(c.x);
  return vec2u(cellStart[cell], cellStart[cell + 1u]);
}

@compute @workgroup_size(64)
fn inbondReset(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) l: u32) {
  let r = cellRange(wg);
  for (var i = r.x + l; i < r.y; i += 64u) {
    if (parts[i].kind >= FIRST_LIFE) { atomicStore(&bondsIn[i * 5u], 0u); }
  }
}

@compute @workgroup_size(64)
fn inbondGather(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) l: u32) {
  let r = cellRange(wg);
  for (var i = r.x + l; i < r.y; i += 64u) {
    let k = parts[i].kind;
    if (k < FIRST_LIFE) { continue; }
    let it = intent[i];
    for (var b = 0u; b < 2u; b++) {
      let j = select(it.z, it.w, b == 1u);
      if (j == NONE || j == i || j >= arrayLength(&parts) || parts[j].kind != k) { continue; }
      let c = atomicAdd(&bondsIn[j * 5u], 1u);
      if (c < 4u) { atomicStore(&bondsIn[j * 5u + 1u + c], i); }
    }
  }
}

// The six living cells each cell in view presses against hardest, nearest first, so vsPoint can
// flatten the two membranes against each other (fused partners too: they share a wall).
// Observational: only drawing reads it.
const TOUCH_N = 6u;
@group(0) @binding(6) var<storage, read_write> touch: array<u32>;
@group(0) @binding(7) var<storage, read> genomes: array<Genome>;
// Each living cell in view bends along the curve of its path, through a soft spring so it lags and
// sways back as it straightens, and a knock (a sudden change of velocity) squashes it along the
// knock through a quicker spring, so it jiggles and settles. Kept by ID (unique serials), so it needs
// nothing from the sort; another ID in the slot starts afresh. Half-float pairs: velocity smoothed
// over about 0.08 s, so jitter neither turns nor knocks it; bend
// and its rate; the squash (a nematic: amount times (cos, sin) of twice its axis) and its rate.
struct Sway { id: u32, vel: u32, bend: u32, time: f32, squash: u32, rate: u32 };
@group(0) @binding(8) var<storage, read_write> sway: array<Sway>;

fn drawnSize(p: Particle) -> f32 { return genomes[p.kind].size * (1.0 - 0.12 * f32(roleOf(p.info))); }

@compute @workgroup_size(64)
fn contactGather(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) l: u32) {
  let r = cellRange(wg);
  let g = vec2i(views.grid.xy);
  let world = vec2f(g);
  for (var i = r.x + l; i < r.y; i += 64u) {
    let p = parts[i];
    if (p.kind < FIRST_LIFE) { continue; }
    let si = drawnSize(p);
    var best: array<u32, TOUCH_N>;
    var key: array<f32, TOUCH_N>;
    for (var c = 0u; c < TOUCH_N; c++) { best[c] = NONE; key[c] = 1.0; }
    let at = vec2i(floor(p.pos));
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let c = ((at + vec2i(dx, dy)) % g + g) % g;
        let cell = u32(c.y) * views.grid.x + u32(c.x);
        let end = cellStart[cell + 1u];
        for (var j = cellStart[cell]; j < end; j++) {
          if (j == i) { continue; }
          let q = parts[j];
          if (q.kind < FIRST_LIFE) { continue; }
          var d = q.pos - p.pos;
          d -= world * round(d / world);
          // 0.085 world units per unit of size at full detail (pointSize); beyond 1.3 radii, no contact
          let k = length(d) / (0.085 * 1.3 * (si + drawnSize(q)));
          if (k >= key[TOUCH_N - 1u]) { continue; }
          var c = TOUCH_N - 1u;
          for (; c > 0u && key[c - 1u] > k; c--) { key[c] = key[c - 1u]; best[c] = best[c - 1u]; }
          key[c] = k;
          best[c] = j;
        }
      }
    }
    for (var c = 0u; c < TOUCH_N; c++) { touch[i * TOUCH_N + c] = best[c]; }

    let now = bitcast<f32>(views.grid.z);
    let slot = p.id % arrayLength(&sway);
    let was = sway[slot];
    let dt = now - was.time;
    if (was.id == p.id && dt == 0.0) { continue; }
    var bend = vec2f(0.0);
    var squash = vec2f(0.0);
    var rate = vec2f(0.0);
    var vel = p.vel;
    if (was.id == p.id && dt > 0.0 && dt < 0.1) {
      let prev = unpack2x16float(was.vel);
      vel = mix(prev, p.vel, 1.0 - exp(-dt / 0.08));
      bend = unpack2x16float(was.bend);
      squash = unpack2x16float(was.squash);
      rate = unpack2x16float(was.rate);
      // the path's curvature (turn rate / speed) in units of the drawn radius, trusted only once the
      // cell moves a radius or so a second, below which its heading is mostly jitter
      let speed = length(vel);
      let radius = 0.085 * si;
      var turn = atan2(vel.y, vel.x) - atan2(prev.y, prev.x);
      turn -= TAU * round(turn / TAU);
      let follow = clamp(0.5 * turn / (dt * max(speed, 1e-4)) * radius, -0.45, 0.45)
        * smoothstep(0.5, 2.0, speed / radius);
      // about 1.4 Hz, damping 0.3: it overshoots a little once the turn ends
      bend.y += ((follow - bend.x) * 80.0 - bend.y * 5.4) * dt;
      bend.x = clamp(bend.x + bend.y * dt, -0.6, 0.6);
      let dv = (vel - prev) / (dt * radius);
      let knock = length(dv);
      let axis = 2.0 * atan2(dv.y, dv.x);
      // knocks run from a few to a few hundred radii/s² (crowded colonies are shoved constantly), so
      // the squash saturates
      let push = 0.2 * (1.0 - exp(-knock / 60.0)) * vec2f(cos(axis), sin(axis));
      // about 2.5 Hz, damping 0.25
      rate += ((push - squash) * 247.0 - rate * 7.9) * dt;
      squash += rate * dt;
      let amount = length(squash);
      if (amount > 0.3) { squash *= 0.3 / amount; }
    }
    sway[slot] = Sway(p.id, pack2x16float(vel), pack2x16float(bend), now,
      pack2x16float(squash), pack2x16float(rate));
  }
}

// Each species' organelles scatter in their own directions, the same in every cell: found once per
// frame here rather than at every pixel of every cell (fsPoint).
@group(0) @binding(9) var<storage, read_write> organDir: array<u32>;
@compute @workgroup_size(64)
fn organDirs(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= MAXK * ORGANS) { return; }
  let th = TAU * renderHash(genomes[gid.x / ORGANS].serial + (gid.x % ORGANS) * 1013u + 103u);
  organDir[gid.x] = pack2x16snorm(vec2f(cos(th), sin(th)));
}
`;

export const DRAW_WGSL = 'diagnostic(off, derivative_uniformity);\n' + COMMON + /* wgsl */ `
// Unresolved views use the cheap sprite profile; resolved cells share one outline path.
struct View {
  cam: vec2f, world: vec2f, res: vec2f,
  ppu: f32, pointSize: f32, pointGain: f32, lineGain: f32,
  linkR: f32, time: f32, selId: u32, matterGain: f32,
  focusOn: u32, roleMask: u32, stateMode: u32, mute: f32,
  memberKind: u32, memberN: u32,
  // 0: draw every cell as its distant sprite at any zoom (no resolved anatomy, bonds stay lines)
  detail: u32,
};
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read> genomes: array<Genome>;
@group(0) @binding(3) var<storage, read> intent: array<vec4u>;
@group(0) @binding(4) var<storage, read> livingList: array<u32>;
@group(0) @binding(5) var<storage, read> focus: array<u32>;
// Bonds other cells keep to each cell: a count, then up to four of their indices (INBOND_WGSL).
@group(0) @binding(6) var<storage, read> bondsIn: array<u32>;
@group(0) @binding(7) var<storage, read> stoneList: array<u32>;
// The living cells each cell presses against (INBOND_WGSL contactGather).
@group(0) @binding(8) var<storage, read> touch: array<u32>;
// Each cell's bend along its path and squash from knocks (INBOND_WGSL contactGather), by ID.
struct Sway { id: u32, vel: u32, bend: u32, time: f32, squash: u32, rate: u32 };
@group(0) @binding(9) var<storage, read> sway: array<Sway>;
@group(0) @binding(10) var<storage, read> organDir: array<u32>;
// The water's temperature per grid cell (heatMain), for how heat shows on a cell.
@group(0) @binding(11) var<storage, read> heatField: array<f32>;

fn kindOn(k: u32) -> bool { return ((focus[k >> 5u] >> (k & 31u)) & 1u) == 1u; }
fn isMember(id: u32) -> bool {
  var lo = 0u;
  var hi = view.memberN;
  for (var it = 0u; it < 20u; it++) {
    if (lo >= hi) { break; }
    let mid = (lo + hi) / 2u;
    let v = focus[MAXK / 32u + mid];
    if (v == id) { return true; }
    if (v < id) { lo = mid + 1u; } else { hi = mid; }
  }
  return false;
}
fn focusPass(p: Particle) -> bool {
  if (view.focusOn == 0u) { return true; }
  let k = p.kind;
  if (!kindOn(k)) { return false; }
  if (k < FIRST_LIFE) { return true; }
  if (((view.roleMask >> roleOf(p.info)) & 1u) == 0u) { return false; }
  if (view.stateMode == 0u) { return true; }
  let g = genomes[k];
  let e = p.energy / g.reproE;
  if (view.stateMode == 1u) { return e < 0.35; }
  if (view.stateMode == 2u) { return e > 0.85; }
  if (view.stateMode >= 4u) {
    // heat-stressed (4) or torpid (5), at the water's warmth where the cell is
    let c = vec2u(clamp(p.pos, vec2f(0.0), view.world - 1.0));
    let warmth = heatField[MAX_CELLS + c.y * u32(view.world.x) + c.x] + ${f(DEFAULT_K.selfWarm)} * thermoOf(g);
    let th = ${shownThermal('g', 'warmth')};
    return select(th.x > 0.3, th.torpid, view.stateMode == 5u);
  }
  return p.age > 0.8 * g.lifespan;
}

fn wrapd(d: vec2f) -> vec2f { return d - view.world * round(d / view.world); }
fn pcgR(v: u32) -> u32 { let st = v * 747796405u + 2891336453u; let w = ((st >> ((st >> 28u) + 4u)) ^ st) * 277803737u; return (w >> 22u) ^ w; }
fn toClip(px: vec2f) -> vec4f { return vec4f(px.x / (view.res.x * 0.5), -px.y / (view.res.y * 0.5), 0.0, 1.0); }

// Radii are in framebuffer pixels: the same LOD works in the main, loupe and specimen views.
fn detailLOD(radius: f32) -> f32 { return smoothstep(2.8, 6.0, radius) * f32(view.detail); }
fn bondLOD(radius: f32) -> f32 { return smoothstep(6.0, 30.0, radius) * f32(view.detail); }
fn interiorLOD(radius: f32) -> f32 { return smoothstep(12.0, 26.0, radius); }
fn fineLOD(radius: f32) -> f32 { return smoothstep(30.0, 65.0, radius); }
fn cellGrain(v: vec2f, id: u32) -> f32 {
  let c = vec2i(floor(v));
  let t = fract(v);
  let w = t * t * (vec2f(3.0) - 2.0 * t);
  let x = bitcast<u32>(c.x) * 1597334677u;
  let y = bitcast<u32>(c.y) * 3812015801u;
  let a = mix(renderHash(x ^ y ^ id), renderHash((x + 1597334677u) ^ y ^ id), w.x);
  let b = mix(renderHash(x ^ (y + 3812015801u) ^ id), renderHash((x + 1597334677u) ^ (y + 3812015801u) ^ id), w.x);
  return mix(a, b, w.y) * 2.0 - 1.0;
}
// Unresolved living cells share a cheap soft profile; matter keeps its old light.
fn spriteFalloff(uv: vec2f, shape: u32) -> f32 {
  let d2 = dot(uv, uv);
  if (d2 >= 1.0) { return 0.0; }
  // A compact unresolved footprint saves fill; the 1/radius² gain keeps its integral.
  if (shape < 12u) {
    let t = max(0.0, 1.0 - d2 / 0.7225);
    return t * t / 0.7225;
  }
  switch (shape) {
    case 12u: { let t = (sqrt(d2) - 0.62) / 0.2; return exp(-t * t); }
    case 13u: {
      let a = abs(uv);
      let t = max(0.0, 1.0 - a.x * a.y * 40.0 - d2 * 0.7);
      return t * t * (1.0 - d2);
    }
    case 14u: { return 1.0 - smoothstep(0.7, 1.0, d2); }
    default: { let t = 1.0 - d2; return t * t; }
  }
}
// Integrated distant profiles / pi.
fn spriteMean(shape: u32) -> f32 {
  switch (shape) {
    case 12u: { return 0.4369; }
    case 13u: { return 0.0391; }
    case 14u: { return 0.85; }
    default: { return 0.33333; }
  }
}
fn polygonRadius(a: f32, sides: f32, roundness: f32) -> f32 {
  let sector = TAU / sides;
  let th = a - sector * floor(a / sector + 0.5);
  return mix(cos(sector * 0.5) / cos(th), 1.0, roundness);
}
fn localPoint(v: vec2f, dir: vec2f) -> vec2f {
  return vec2f(dot(v, dir), dot(v, vec2f(-dir.y, dir.x)));
}
fn choosePlan(g: Genome, role: u32) -> u32 {
  let gene = (u32(g.shape) + role * 5u) % 12u;
  // Only a minority are trait-biased; every plan remains available to every guild.
  if (renderHash(g.serial ^ g.sig[0].x) > 0.28) { return gene; }
  if (g.calcify > 0.55) { return select(7u, 4u, gene % 2u == 0u); }
  if (g.adhesion > 0.7) { return select(10u, 3u, gene % 2u == 0u); }
  if (g.advect < 0.18 && g.swim < 0.25) { return 9u; }
  if (g.photo > 0.6) { return select(3u, 11u, gene % 2u == 0u); }
  if (g.dFlesh > 0.6) { return select(1u, 2u, gene % 2u == 0u); }
  if (g.swim > 0.6) { return select(5u, 6u, gene % 2u == 0u); }
  return gene;
}
fn facetSD(q: vec2f, radius: f32, sides: f32, rounding: f32) -> f32 {
  // Warping the angle makes adjacent facets unequal without a vertex array.
  let a = atan2(q.y, q.x);
  return length(q) - radius * polygonRadius(a + 0.15 * sin(a * 3.0 + 1.7), sides, rounding);
}
fn loboseSD(q: vec2f, s: vec2f) -> f32 {
  let a = atan2(q.y, q.x);
  let lobes = 3.0 + floor(s.x * 3.0);
  // lobes are pseudopods: they creep round the cell as it flows
  let edge = 0.73 + 0.11 * sin(a * lobes + s.y * TAU + view.time * 0.23) + 0.07 * cos(a * 3.0 + 0.5);
  return facetSD(q, edge, 7.0 + floor(s.y * 3.0), 0.22);
}
fn radiateSD(q: vec2f, s: vec2f, filose: bool) -> f32 {
  let a = atan2(q.y, q.x);
  let arms = select(3.0 + floor(s.x * 2.0), 5.0 + floor(s.x * 3.0), filose);
  let bend = 0.32 * sin(length(q) * 4.0 + s.y * 5.0) + 0.18 * sin(a * 2.0 + s.y);
  let lobe = pow(max(0.0, cos(a * arms + bend)), select(1.8, 3.0, filose));
  let core = select(0.35, 0.33, filose);
  let edge = core + (0.51 + 0.07 * sin(a * 3.0 + s.x * TAU)) * lobe;
  return facetSD(q, edge, 9.0, 0.3);
}
fn desmidSD(q: vec2f, s: vec2f) -> f32 {
  let side = select(-1.0, 1.0, q.x > 0.0);
  let v = q - vec2f(side * 0.39, 0.04 * side);
  let a = atan2(v.y, v.x);
  let edge = 0.42 + 0.085 * cos(a * (5.0 + floor(s.x * 2.0)) + side * s.y * 1.5);
  let semicell = facetSD(v * vec2f(1.12, 0.87), edge, 8.0, 0.12);
  let isthmus = length(q * vec2f(0.8, 2.2)) - 0.24;
  return min(semicell, isthmus);
}
fn hornSD(q: vec2f, s: vec2f) -> f32 {
  let body = facetSD(q * vec2f(1.28, 0.9), 0.62, 5.0, 0.12);
  let top = q - vec2f(0.1 + q.y * q.y * 0.18, 0.25);
  let horn = length(top * vec2f(3.2, 0.75)) - (0.43 - 0.15 * clamp(top.y, 0.0, 1.0));
  let lower = q - vec2f(-0.23 - q.y * q.y * 0.12, -0.35);
  return min(body, min(horn, length(lower * vec2f(3.7, 0.95)) - 0.39 - s.x * 0.035));
}
fn spindleSD(q: vec2f, s: vec2f) -> f32 {
  let v = vec2f(q.x, q.y + 0.17 * sin(q.x * 3.4 + s.y * 3.0));
  let taper = 0.46 * pow(max(0.0, 1.0 - abs(v.x) / 0.94), 0.7);
  return max(abs(v.x) - 0.94, abs(v.y) - taper);
}
fn slipperSD(q: vec2f, s: vec2f) -> f32 {
  let v = vec2f(q.x, q.y + 0.13 * q.x + 0.06 * sin(q.x * 5.0 + s.y));
  let body = facetSD(v * vec2f(0.8, 1.38), 0.73 - 0.075 * q.x, 9.0, 0.35);
  let mouth = length((v - vec2f(0.1, 0.45)) * vec2f(1.0, 1.6)) - 0.23;
  return max(body, -mouth);
}
fn spiralSD(q: vec2f, s: vec2f) -> f32 {
  // Overlapping chambers grow along a crooked logarithmic whorl.
  var sd = 10.0;
  for (var j = 0u; j < 6u; j++) {
    let t = f32(j) / 5.0;
    let a = t * 5.3 + s.y * 0.7;
    let c = vec2f(cos(a), sin(a)) * (0.12 + t * 0.36);
    let v = q - c;
    sd = min(sd, facetSD(v, 0.21 + t * 0.23, 7.0, 0.23));
  }
  return sd;
}
fn vacuolateSD(q: vec2f, s: vec2f) -> f32 {
  let a = atan2(q.y, q.x);
  let outer = facetSD(q, 0.80 + 0.045 * sin(a * 5.0 + s.y * 5.0), 9.0, 0.18);
  let centre = vec2f(0.16 + s.x * 0.30, 0.09);
  let hole = facetSD((q - centre) * vec2f(1.0, 1.12), 0.35 + s.x * 0.10, 7.0, 0.3);
  return max(outer, -hole);
}
fn bellSD(q: vec2f, s: vec2f) -> f32 {
  let v = q - vec2f(0.20, 0.05);
  let width = 0.29 + 0.35 * clamp((v.x + 0.45) / 0.85, 0.0, 1.0);
  let bell = max(abs(v.x) - 0.43, abs(v.y + v.x * 0.09) - width);
  let stalk = max(abs(q.x + 0.55) - 0.40, abs(q.y - 0.10 * sin(q.x * 6.0 + s.y)) - 0.065);
  return min(bell, stalk);
}
fn chainSD(q: vec2f, s: vec2f) -> f32 {
  var sd = 10.0;
  for (var j = 0u; j < 4u; j++) {
    let x = (f32(j) - 1.5) * 0.40;
    let v = q - vec2f(x, 0.14 * sin(x * 5.0 + s.y * 5.0));
    sd = min(sd, facetSD(v, 0.29 + 0.03 * sin(f32(j) * 2.1 + s.x * 5.0), 6.0, 0.20));
  }
  return sd;
}
fn latticeSD(q: vec2f, s: vec2f) -> f32 {
  let v = vec2f(q.x, q.y + 0.12 * sin(q.x * 4.0 + s.y * 3.0));
  return (abs(v.x) * 0.72 + abs(v.y) * 1.35 - 0.75) / 1.5;
}
fn bodySD(q: vec2f, shape: u32, s: vec2f) -> f32 {
  switch (shape) {
    case 1u: { return radiateSD(q, s, true); }
    case 2u: { return radiateSD(q, s, false); }
    case 3u: { return desmidSD(q, s); }
    case 4u: { return hornSD(q, s); }
    case 5u: { return spindleSD(q, s); }
    case 6u: { return slipperSD(q, s); }
    case 7u: { return spiralSD(q, s); }
    case 8u: { return vacuolateSD(q, s); }
    case 9u: { return bellSD(q, s); }
    case 10u: { return chainSD(q, s); }
    case 11u: { return latticeSD(q, s); }
    default: { return loboseSD(q, s); }
  }
}
// The same local frame and warp are used for a cell and its bond partners.
// sd is in units of that cell's radius; only q survives into the interior.
struct CellOutline { sd: f32, q: vec2f };
// Elongation along the heading: the species' own, drawn out further the faster the cell moves
// through the water (pace, 0..1), keeping its area.
fn bodyAspect(s: vec2f, swim: f32, pace: f32) -> f32 {
  return (0.82 + s.x * 0.38 + min(swim, 1.5) * 0.10) * (1.0 + 0.3 * pace);
}
// Turning, the body curves along its path (an area-preserving shear); past the body, as a tail
// does, the curve runs on straight.
fn bendShift(x: f32, bend: f32) -> f32 { return bend * abs(x) * min(abs(x), 1.0); }
fn cellOutline(uv: vec2f, dir: vec2f, radius: f32, seed: f32,
    shape: u32, traits: vec4f, s: vec2f, pace: f32, bend: f32) -> CellOutline {
  let aspect = bodyAspect(s, traits.x, pace);
  var motion = localPoint(uv, dir) * vec2f(1.0 / aspect, aspect);
  motion.y -= bendShift(motion.x, bend);
  // Dragged through the water a cell is blunt in front and drawn out thin behind, by as much,
  // so its area holds (to second order in pace).
  motion.y *= exp(pace * 0.35 * (smoothstep(0.0, -0.9, motion.x) - smoothstep(0.0, 0.9, motion.x)));
  // Area-preserving shears, with each cell's own phase.
  let phase = seed * TAU + view.time * (0.18 + traits.y * 0.15) * (1.0 - traits.z * 0.7);
  var q = motion;
  q.x += 0.075 * sin(q.y * 4.0 + phase) + (s.y - 0.5) * 0.20 * q.y;
  q.y += 0.065 * sin(q.x * 4.5 + phase * 1.3);
  // and a moving one ripples, a wave running back along its body and growing toward the rear
  q.y += pace * 0.075 * sin(q.x * 4.0 + seed * 40.0 + view.time * 4.5) * (0.3 + 0.7 * smoothstep(0.5, -0.8, q.x));
  let a = atan2(q.y, q.x);
  let ripple = 0.018 * sin(a * 5.0 + seed * 23.0) * smoothstep(0.1, 0.4, length(q));
  let teeth = traits.w * fineLOD(radius) * 0.02 * pow(max(0.0, cos(a * 17.0 + seed * 11.0)), 6.0);
  return CellOutline(bodySD(q, shape, s) - ripple - teeth, q);
}
// This cell's sway, if contactGather kept it just now (the slot may hold another cell, or this one
// from when it was last in view).
fn swayOf(p: Particle) -> Sway {
  let st = sway[p.id % arrayLength(&sway)];
  if (st.id != p.id || abs(view.time - st.time) > 0.2) { var none: Sway; none.id = ~p.id; return none; }
  return st;
}
// Heading along the smoothed velocity once contactGather keeps one, so jitter doesn't spin the cell.
fn cellDirection(p: Particle) -> vec2f {
  let st = swayOf(p);
  let v = select(p.vel, unpack2x16float(st.vel), st.id == p.id);
  let a = select(renderHash(p.id) * TAU, atan2(v.y, v.x), dot(v, v) > 0.000001);
  return vec2f(cos(a), sin(a));
}
// Match vsPoint's living-cell radius, including focus and unresolved highlights.
// A resolved cell is drawn no larger than the room its living neighbours leave it, so a dense body
// reads as packed tissue rather than a stack of overlapping cells. The sim records a kernel density
// of living neighbours within LINK_R (sum of (1 - r/L)^2, i.e. pi L^2 rho / 6); a hexagonal packing
// of that density has spacing L * sqrt(0.6046 / pack). Distant sprites keep their size.
fn packFit(index: u32, size: f32) -> f32 {
  let it = intent[index];
  if ((it.x & 3u) == 2u) { return 1.0; }
  let pack = bitcast<f32>(it.y);
  if (!(pack > 0.01)) { return 1.0; }
  let room = 0.75 * view.linkR * sqrt(0.6046 / pack);
  return mix(1.0, min(1.0, room / (0.085 * size)), detailLOD(view.pointSize * size));
}
fn cellRadius(p: Particle, g: Genome, index: u32) -> f32 {
  var size = g.size * (1.0 - 0.12 * f32(roleOf(p.info)));
  size *= packFit(index, size);
  let grow = 1.0 - detailLOD(view.pointSize * size);
  if (!focusPass(p)) { size *= 0.7; }
  else if (view.focusOn == 1u) { size *= 1.0 + 0.12 * grow; }
  if (view.memberN > 0u && p.kind == view.memberKind && isMember(p.id)) { size *= 1.0 + 0.15 * grow; }
  if (p.id == view.selId) { size = mix(size, max(size, 1.2) * 1.5, grow); }
  return max(view.pointSize * size, 0.9);
}
fn smoothUnion(a: f32, b: f32, k: f32) -> f32 {
  let h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
// Occupied area / pi, before the shared, nearly area-preserving domain warp.
// Calibrated against raster integrals; avoids SDF sampling loops in the vertex shader.
fn bodyArea(shape: u32, s: vec2f) -> f32 {
  switch (shape) {
    case 1u: { return 0.215; }
    case 2u: { return 0.285; }
    case 3u: { return 0.335; }
    case 4u: { return 0.300; }
    case 5u: { return 0.324; }
    case 6u: { return 0.460; }
    case 7u: { return 0.390; }
    case 8u: { return 0.587 - pow(0.35 + s.x * 0.10, 2.0) / 1.12; }
    case 9u: { return 0.275; }
    case 10u: { return 0.300; }
    case 11u: { return 0.368; }
    default: { return 0.500; }
  }
}

struct PO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) @interpolate(flat) shape: u32,
  @location(3) @interpolate(flat) index: u32,
  @location(4) @interpolate(flat) geom: vec4f, // radius, occupied area, motion direction
  @location(5) @interpolate(flat) morph: vec2f, // species variation
  // up to three fused partners, packed as half floats: offset / own radius; radius ratio and heading;
  // ID seeds as 16-bit fractions, the third sharing a word with the plans (5 bits each, 31 = absent)
  @location(6) @interpolate(flat) bondOffset: vec3u,
  @location(7) @interpolate(flat) bondFrame: vec3u,
  @location(8) @interpolate(flat) bondSeeds: vec2u,
  // up to six planes the cell is pressed flat against, each its point nearest the centre in
  // units of own radius, packed as half floats (zero: none), pushed 4 further out for another
  // species: it only dents the cell, softly, where kin share a crisp wall
  @location(9) @interpolate(flat) contact: vec3u,
  @location(11) @interpolate(flat) contact2: vec3u,
  // squashed along this axis by its length (stretched across it), keeping area
  @location(12) @interpolate(flat) squash: vec2f,
  // inflation that restores the area those planes cut off; pace through the water (0..1); bend
  @location(10) @interpolate(flat) jelly: vec3f,
};

@vertex fn vsPoint(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  var o: PO;
  o.bondSeeds = vec2u(0u, 0x7fffu);
  o.jelly = vec3f(1.0, 0.0, 0.0);
  let p = parts[ii];
  // stone is drawn as one field of boulders (vsStone), not grain by grain
  if (p.kind == STONE || p.kind == FRAMBOID) { o.pos = vec4f(2.0, 2.0, 0.0, 1.0); return o; }
  let d = wrapd(p.pos - view.cam) * view.ppu;
  // Avoid genome/partner reads for offscreen distant sprites.
  if (view.pointSize <= 6.0 && any(abs(d) > view.res * 0.5 + vec2f(60.0))) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
    return o;
  }
  let k = p.kind;
  var size = 1.0;
  var col: vec3f;
  var shape = 0u;
  var swim = 0.0;
  if (k >= FIRST_LIFE) {
    let g = genomes[k];
    let role = roleOf(p.info);
    size = g.size * (1.0 - 0.12 * f32(role));
    size *= packFit(ii, size);
    swim = min(g.swim, 1.0);
    let e = clamp(p.energy / g.reproE, 0.0, 1.4);
    var b = 0.35 + 0.65 * e;
    let c = vec2u(clamp(p.pos, vec2f(0.0), view.world - 1.0));
    let thermo = thermoOf(g);
    let warmth = heatField[MAX_CELLS + c.y * u32(view.world.x) + c.x] + ${f(DEFAULT_K.selfWarm)} * thermo;
    let th = ${shownThermal('g', 'warmth')};
    // a torpid cell's pulse stops and it dims, cold blue
    if (!th.torpid) { b *= 1.0 + g.pulse * 0.6 * sin(view.time * (0.8 + g.pulse * 4.0) + f32(p.id % 1024u) * 0.37); }
    b *= 1.0 + 2.5 * max(0.0, 1.0 - p.age * 2.5);
    col = unpack4x8unorm(p.col).rgb;
    if (th.torpid) { col = mix(col, vec3f(0.55, 0.7, 0.95) * dot(col, vec3f(0.33)), 0.5); b *= 0.6; }
    // heat stress bleaches a cell toward pale bone; a heat-maker glows faintly warm
    col = mix(col, vec3f(1.0, 0.96, 0.9) * max(0.45, dot(col, vec3f(0.3, 0.5, 0.2))), 0.6 * smoothstep(0.3, 1.0, th.x));
    col = mix(col, col * vec3f(1.25, 0.92, 0.72) + vec3f(0.12, 0.04, 0.0), 0.7 * thermo);
    col *= b * view.pointGain;
  } else if (k == SILT) {
    size = 0.4;
    col = vec3f(0.30, 0.34, 0.46) * view.matterGain;
  } else if (k == GLINT) {
    size = 0.3;
    shape = 13u;
    let tw = 0.6 + 0.4 * sin(view.time * 6.0 + f32(p.id % 977u));
    col = vec3f(0.7, 0.93, 1.0) * (0.4 + p.energy) * tw * view.matterGain * 2.0;
  } else if (k == STONE) {
    shape = 14u;
    col = mix(unpack4x8unorm(p.col).rgb, vec3f(0.9, 0.86, 0.78), 0.5) * view.matterGain * 1.1;
  } else {
    size = 0.62;
    shape = 12u;
    let h = unpack4x8unorm(p.col).rgb;
    col = mix(h * 0.6, vec3f(0.42, 0.28, 0.16), 0.55) * (0.25 + p.energy * 0.6) * view.matterGain * 1.4;
  }
  // highlights enlarge only sprites too small to show detail; resolved cells keep their true size,
  // so resolving anatomy preserves the organism's world size
  let grow = 1.0 - detailLOD(view.pointSize * size);
  if (!focusPass(p)) {
    let l = dot(col, vec3f(0.3, 0.5, 0.2));
    col = mix(vec3f(l), col, 0.1) * view.mute;
    size *= 0.7;
  } else if (view.focusOn == 1u) {
    col *= 1.6;
    size *= 1.0 + 0.12 * grow;
  }
  if (view.memberN > 0u && k == view.memberKind && isMember(p.id)) {
    col = mix(col, vec3f(1.0, 0.97, 0.9) * max(1.0, dot(col, vec3f(0.33))), 0.35) * (1.25 + 0.2 * sin(view.time * 4.0));
    size *= 1.0 + 0.15 * grow;
  }
  if (p.id == view.selId) { col = col * 1.5 + vec3f(0.5); size = mix(size, max(size, 1.2) * 1.5, grow); }
  let px = select(max(view.pointSize * size, 0.9), max(view.ppu * 0.13, 0.9), k == STONE);
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  o.col = col;
  o.shape = shape;
  o.index = ii;
  o.geom = vec4f(px, 1.0, 1.0, 0.0);
  // Keep the whole unresolved view cheap, including its few oversized cells.
  if (px <= 2.8 || view.detail == 0u) {
    let footprint = select(1.0, 0.85, k >= FIRST_LIFE);
    o.pos = toClip(d + corner * px * footprint);
    o.uv = corner * footprint;
    o.geom.x = min(px, 2.8);
    return o;
  }
  let fine = fineLOD(px);
  var extent = 1.35 + fine * swim * 0.65;
  var pace = 0.0;
  if (k >= FIRST_LIFE) {
    // radii per second through the water (vel excludes the flow); shells barely give
    let radii = length(p.vel) * view.ppu / px;
    let give = 1.0 - 0.75 * min(genomes[k].calcify, 1.0);
    pace = (1.0 - exp(-radii * 0.25)) * give;
    let st = swayOf(p);
    if (st.id == p.id) {
      o.jelly.z = unpack2x16float(st.bend).x * give;
      // the squash's axis, its length the amount
      let q = unpack2x16float(st.squash) * give;
      let axis = 0.5 * atan2(q.y, q.x);
      o.squash = vec2f(cos(axis), sin(axis)) * length(q);
    }
    extent *= (1.0 + 0.3 * pace) * (1.0 + 0.5 * abs(o.jelly.z)) * exp(length(o.squash));
  }
  if (any(abs(d) > view.res * 0.5 + vec2f(px * extent))) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
    return o;
  }
  o.pos = toClip(d + corner * px * extent);
  o.uv = corner * extent;
  let seed = renderHash(p.id);
  // cells face where they swim; matter keeps its own orientation (its motion is mostly Brownian)
  var dir = vec2f(cos(seed * TAU), sin(seed * TAU));
  if (k >= FIRST_LIFE) { dir = cellDirection(p); }
  o.geom = vec4f(px, extent, dir);
  if (k >= FIRST_LIFE) {
    let g = genomes[k];
    shape = choosePlan(g, roleOf(p.info));
    o.shape = shape;
    let species = vec2f(renderHash(g.serial ^ g.sig[0].y), renderHash(g.serial ^ g.sig[1].x ^ 917u));
    o.morph = species;
    o.jelly.y = pace;
    o.geom.y = bodyArea(shape, species);
    // All partner storage reads and frame setup happen per vertex, never per pixel.
    var plans = 0x7fffu;
    var seeds = vec3f(0.0);
    if (detailLOD(min(px, view.pointSize)) > 0.0) {
      // Fuse with every body partner, either way round: the bonds this cell keeps, then those
      // other cells keep to it (gathered by INBOND_WGSL), up to three within reach.
      let it = intent[ii];
      let inN = min(bondsIn[ii * 5u], 4u);
      var used = 0u;
      var picked = vec2u(NONE);
      // (only from 6 px, where fsPoint starts drawing the fused neck)
      for (var c = 0u; c < 6u && used < 3u && px >= 6.0; c++) {
        var index = NONE;
        if (c < 2u) { index = select(it.z, it.w, c == 1u); }
        else if (c - 2u < inN) { index = bondsIn[ii * 5u + c - 1u]; }
        if (index == NONE || index == ii || index == picked.x || index == picked.y) { continue; }
        let partner = parts[index];
        if (partner.kind != k) { continue; }
        let ratio = cellRadius(partner, g, index) / px;
        let offset = wrapd(partner.pos - p.pos) * view.ppu / px;
        let reach = 1.65 * (1.0 + ratio) + 0.12 * min(1.0, ratio);
        if (dot(offset, offset) > reach * reach) { continue; }
        let dir = cellDirection(partner);
        plans = (plans & ~(31u << (5u * used))) | (choosePlan(g, roleOf(partner.info)) << (5u * used));
        o.bondOffset[used] = pack2x16float(offset);
        o.bondFrame[used] = pack2x16float(vec2f(ratio, atan2(dir.y, dir.x)));
        seeds[used] = renderHash(partner.id);
        if (used == 0u) { picked.x = index; } else if (used == 1u) { picked.y = index; }
        used++;
      }
      // Pressed cells meet along their radical axis, as in a foam: each is cut flat there, the cut
      // softened in fsPoint, with a hair of gap for the two membranes. The outline reaches about
      // 0.8 of the radius. What the cuts take is given back by swelling, so a squeezed cell bulges
      // out its free sides.
      var lost = 0.0;
      var n = 0u;
      for (var c = 0u; c < 6u; c++) {
        let index = touch[ii * 6u + c];
        if (index == NONE) { break; }
        if (index >= arrayLength(&parts)) { continue; }
        let other = parts[index];
        if (other.kind < FIRST_LIFE) { continue; }
        let ratio = cellRadius(other, genomes[other.kind], index) / px;
        let offset = wrapd(other.pos - p.pos) * view.ppu / px;
        let dist = length(offset);
        if (dist > 1.25 * (1.0 + ratio) || dist < 1e-3) { continue; }
        let r2 = 0.64 * ratio * ratio;
        let kin = other.kind == k;
        let t = max(select(0.6, 0.35, kin), (dist * dist + 0.64 - r2) / (2.0 * dist) - 0.012);
        let foot = pack2x16float(offset * ((t + select(4.0, 0.0, kin)) / dist));
        if (n < 3u) { o.contact[n] = foot; } else { o.contact2[n - 3u] = foot; }
        n++;
        let x = min(t / 0.8, 1.0);
        lost += (acos(x) - x * sqrt(1.0 - x * x)) * (2.0 / TAU);
      }
      o.jelly.x = 1.0 / sqrt(1.0 - 0.7 * min(lost, 0.45));
      extent *= o.jelly.x;
      o.pos = toClip(d + corner * px * extent);
      o.uv = corner * extent;
    }
    o.bondSeeds = vec2u(pack2x16unorm(seeds.xy), (plans & 0xffffu) | (u32(seeds.z * 65535.0 + 0.5) << 16u));
  }
  return o;
}

@fragment fn fsPoint(i: PO) -> @location(0) vec4f {
  let far = spriteFalloff(i.uv, i.shape);
  if (i.geom.x <= 2.8) { return vec4f(i.col * far, 0.0); }
  let lod = detailLOD(min(i.geom.x, view.pointSize));
  let p = parts[i.index];
  let seed = renderHash(p.id);
  let v = localPoint(i.uv, i.geom.zw);
  let aa = max(0.003, 0.75 / i.geom.x);
  var f = 0.0;
  // coverage of a resolved cell or grain, written to alpha: the composite divides overlapping light
  // by it, so stacked cells and matter average into one translucent layer instead of summing
  var cover = 0.0;
  if (p.kind >= FIRST_LIFE) {
    let g = genomes[p.kind];
    let s = i.morph;
    let inside = interiorLOD(i.geom.x);
    let fine = fineLOD(i.geom.x);
    var membraneSD = 0.0;
    var q = vec2f(0.0);
    var sd = 0.0;
    // One outline call site for self and its partners keeps the twelve-plan
    // switch out of duplicated inline code. Partner frames die before the interior.
    // A swollen cell's own frame is shrunk to match; partners keep the shared one.
    let swell = i.jelly.x;
    let pace = i.jelly.y;
    let bend = i.jelly.z;
    var own = i.uv / swell;
    let squashed = length(i.squash);
    if (squashed > 0.0) {
      let axis = i.squash / squashed;
      let along = dot(own, axis);
      own = (own - axis * along) * exp(-squashed) + axis * along * exp(squashed);
    }
    for (var j = 0u; j < 4u; j++) {
      var uv = own;
      var dir = i.geom.zw;
      var radius = i.geom.x;
      var cellSeed = seed;
      var plan = i.shape;
      var ratio = 1.0;
      var flags = 0u;
      if (j > 0u) {
        // The partner draws itself beyond our narrow union band. Owned pixels
        // need no further outlines or interior work.
        // Deep inside, the union only darkens sd further where rim, wall and relief are all spent;
        // below 6 px (vsPoint gathers no partners) the fused neck would be under a pixel wide.
        if (lod <= 0.0 || i.geom.x < 6.0 || membraneSD > 0.12 + aa || membraneSD < -0.45) { break; }
        flags = (i.bondSeeds.y >> (5u * (j - 1u))) & 31u;
        if (flags == 31u) { break; }
        let offset = unpack2x16float(i.bondOffset[j - 1u]);
        let shape = unpack2x16float(i.bondFrame[j - 1u]);
        ratio = shape.x;
        let blend = 0.12 * min(1.0, ratio);
        if (membraneSD > blend + aa) { continue; }
        let delta = i.uv - offset;
        let bound = ratio * 1.65 + blend + 0.75 / i.geom.x;
        if (dot(delta, delta) > bound * bound) { continue; }
        uv = delta / ratio;
        dir = vec2f(cos(shape.y), sin(shape.y));
        radius *= ratio;
        cellSeed = select(unpack2x16unorm(i.bondSeeds.x)[min(j - 1u, 1u)], f32(i.bondSeeds.y >> 16u) / 65535.0, j == 3u);
        plan = flags;
      }
      let outline = cellOutline(uv, dir, radius, cellSeed, plan,
        vec4f(g.swim, g.pulse, g.calcify, g.dFlesh), s, pace, bend);
      if (j == 0u) {
        membraneSD = outline.sd * swell;
        sd = membraneSD;
        q = outline.q;
      } else {
        let partnerSD = outline.sd * ratio;
        let blend = 0.12 * min(1.0, ratio);
        sd = smoothUnion(sd, partnerSD, blend);
      }
    }
    let resolved = smoothstep(0.7, 1.5, i.geom.x * 0.018) * fine;
    let swimmer = resolved > 0.0 && g.swim > 0.05;
    let hairRange = membraneSD < 0.035 + 4.0 * (0.018 + aa);
    // Well clear of the membrane (contacts only cut the body back, and the partners were skipped out
    // here) and of any hairs or tail, the pixel is empty: leave before the rest. The margin keeps
    // whole 2x2 quads together wherever the outline's derivatives are used.
    if (membraneSD > max(0.12, 0.035 + 4.0 * (0.018 + aa)) + 3.0 * aa) {
      var tail = false;
      if (swimmer) {
        var motion = localPoint(i.uv / swell, i.geom.zw) * vec2f(1.0 / bodyAspect(s, g.swim, pace), bodyAspect(s, g.swim, pace));
        motion.y -= bendShift(motion.x, bend);
        tail = motion.x > -1.9 && motion.x < -0.6 && abs(motion.y) < 0.148 + aa;
      }
      if (!tail) { return vec4f(i.col * far * (1.0 - lod), 0.0); }
    }
    // Flattened against the cells it presses on: a soft intersection with each contact plane. The
    // seam wanders a little, as pressed membranes do; the wander is taken in the world, so the two
    // cells on either side of a seam agree on it. It is found only for a plane that can reach the
    // pixel (the wander is at most 0.09).
    var pressed = -1.0;
    var wander = 0.0;
    var wandered = false;
    for (var c = 0u; c < 6u; c++) {
      let foot = unpack2x16float(select(i.contact2[c % 3u], i.contact[c % 3u], c < 3u));
      var t = length(foot);
      if (t <= 0.0) { break; }
      let kin = t < 4.0;
      let soft = select(0.16, 0.05, kin);
      let normal = foot / t;
      t -= select(4.0, 0.0, kin);
      let level = dot(i.uv, normal) - t;
      if (level + 0.09 < min(sd - soft, -0.15)) { continue; }
      if (!wandered) {
        let seamAt = (p.pos + i.uv * i.geom.x / view.ppu) * (6.0 / view.linkR);
        wander = 0.06 * cellGrain(seamAt, 0u) + 0.03 * cellGrain(seamAt * 2.7, 1u);
        wandered = true;
      }
      let plane = level + wander;
      pressed = max(pressed, plane);
      let h = max(soft - abs(sd - plane), 0.0) / soft;
      sd = max(sd, plane) + h * h * soft * 0.25;
    }
    let body = 1.0 - smoothstep(-aa, aa, sd);
    // The outline's outward direction on screen, before any pixel leaves: a soft dome lit from the
    // upper left, bright along the facing membrane and shadowed opposite.
    let sdGrad = vec2f(dpdx(sd), dpdy(sd));
    let outward = sdGrad / max(length(sdGrad), 1e-6);
    let lightQ = localPoint(TO_LIGHT, i.geom.zw);
    // Reconstruct motion only after the partner loop; no partner structs or
    // unneeded hair coordinates stay live across the organelle loop.
    let aspect = bodyAspect(s, g.swim, pace);
    var tailRange = false;
    if (body <= 0.0 && swimmer && !hairRange) {
      var motion = localPoint(i.uv / swell, i.geom.zw) * vec2f(1.0 / aspect, aspect);
      motion.y -= bendShift(motion.x, bend);
      tailRange = motion.x > -1.9 && motion.x < -0.6 && abs(motion.y) < 0.148 + aa;
    }
    let appendages = swimmer && (body > 0.0 || hairRange || tailRange);
    if (body <= 0.0 && !appendages) { return vec4f(i.col * far * (1.0 - lod), 0.0); }
    // Flat cytoplasm is cheap at silhouette LOD. Detail is a small modulation of
    // that same normalised light, so there is no bright jump when the nucleus appears.
    var tissue = 1.0;
    var hue = vec3f(1.0);
    if (inside > 0.0 && body > 0.0) {
      let a = atan2(q.y, q.x);
      let r = length(q);
      let age = clamp(p.age / max(g.lifespan, 1.0), 0.0, 1.0);
      let wallWidth = 0.025 + 0.008 * sin(a * 3.0 + seed * 13.0);
      let rim = exp(-pow((sd + 0.025) / (wallWidth + aa), 2.0));
      let innerRim = exp(-pow((sd + 0.10) / (0.07 + aa), 2.0));
      var detail = (0.44 + g.calcify * 0.12) * rim - 0.21 * innerRim;
      // cytoplasm is never an even fill: it is mottled, thicker in places (the difference of two
      // fields, so a cell's light is unchanged on average), and stained here and there by what the
      // cell has eaten or stored
      detail += 0.12 * (cellGrain(q * 8.0, p.id) - cellGrain(q * 8.0 + 31.7, p.id + 3u));
      hue = mix(vec3f(1.0), vec3f(1.25, 1.0, 0.65), inside * smoothstep(0.1, 0.6, cellGrain(q * 3.0 + 5.0, p.id + 13u)));
      // relief: the dome near the membrane, then each organelle's own bulge or hollow
      // kept to the membrane's own band, clear of the outline's medial axis in narrow arms
      var relief = 0.45 * dot(outward, TO_LIGHT) * (1.0 - smoothstep(0.0, 0.13, -sd));
      let division = smoothstep(0.55, 1.0, p.energy / max(g.reproE, 0.01));
      var centre = vec2f((s.x - 0.5) * 0.22, (seed - 0.5) * 0.26);
      if (i.shape == 8u) { centre = vec2f(-0.43, -0.06); }
      if (i.shape == 3u) { centre = vec2f(-0.35, 0.02); }
      if (i.shape == 9u) { centre = vec2f(0.2, 0.0); }
      let nq = q - centre;
      let nr = length(vec2f(abs(nq.x) - division * 0.17, nq.y + 0.03 * sin(nq.x * 15.0 + seed))
        / vec2f(0.17 + division * 0.04, 0.21 - division * 0.055));
      relief += 0.3 * exp(-pow((nr - 0.8) / 0.3, 2.0)) * dot(nq / max(length(nq), 1e-4), lightQ);
      detail += -0.34 * (1.0 - smoothstep(0.75, 1.0 + aa * 3.0, nr))
        + 0.22 * exp(-pow((nr - 1.0) / (0.16 + aa), 2.0));
      let plates = sin(q.x * (8.0 + s.x * 6.0) + sin(q.y * 5.0 + s.y * 3.0));
      detail += g.calcify * 0.12 * plates * smoothstep(0.2, 0.6, r);
      if (i.shape == 4u) {
        let girdle = q.y + 0.10 * sin(q.x * 5.0 + s.y);
        detail -= 0.30 * exp(-pow(girdle / (0.035 + aa), 2.0));
      }
      if (i.shape == 5u) {
        detail += 0.13 * sin(q.y * 29.0 + q.x * 10.0 + 1.2 * sin(q.x * 4.0)) * fine;
        detail += 0.40 * exp(-dot(q - vec2f(0.5, -0.12), q - vec2f(0.5, -0.12)) * 350.0);
      }
      if (i.shape == 6u || i.shape == 9u) {
        detail -= 0.25 * exp(-pow((q.y - 0.18 - 0.12 * sin(q.x * 4.0)) / (0.045 + aa), 2.0));
      }
      if (i.shape == 7u) {
        let whorl = sin(atan2(q.y, q.x) * 2.0 - r * 18.0 + s.y);
        detail -= 0.24 * exp(-whorl * whorl * 35.0) * smoothstep(0.1, 0.3, r);
      }
      if (i.shape == 11u) {
        let lattice = sin(q.x * 26.0 + q.y * 12.0) * sin(q.y * 23.0 - q.x * 8.0);
        detail += 0.23 * lattice * fine;
      }
      // Fine structure is genuinely skipped at small and mid zoom, not merely faded.
      if (fine > 0.0) {
        detail += 0.08 * cellGrain(q * 60.0, p.id) * (0.25 + age) * fine;
        for (var j = 0u; j < ORGANS; j++) {
          let h = renderHash(p.id + j * 1999u + 71u);
          // the species' own scatter direction for this organelle (organDirs, INBOND_WGSL)
          let dir = unpack2x16snorm(organDir[p.kind * ORGANS + j]);
          // Irregular scatter is clipped by the tissue for holes, horns and chain cells.
          var organCentre = dir * (0.22 + h * 0.51);
          if (i.shape == 3u) {
            organCentre = vec2f(select(-0.39, 0.39, j % 2u == 0u), 0.0)
              + dir * (0.12 + h * 0.18);
          } else if (i.shape == 5u || i.shape == 6u || i.shape == 11u) {
            let x = (h - 0.5) * 1.45;
            organCentre = vec2f(x, dir.y * (0.30 - abs(x) * 0.22));
          } else if (i.shape == 7u) {
            let t = f32(j % 6u) / 5.0;
            let chamberAngle = t * 5.3 + s.y * 0.7;
            organCentre = vec2f(cos(chamberAngle), sin(chamberAngle)) * (0.12 + t * 0.36)
              + dir * h * 0.14;
          } else if (i.shape == 8u) {
            organCentre = vec2f(0.16 + s.x * 0.30, 0.09)
              + dir * (0.51 + h * 0.07);
          } else if (i.shape == 9u) {
            organCentre = vec2f(0.2, 0.0) + dir * h * 0.39;
          } else if (i.shape == 10u) {
            let x = (f32(j % 4u) - 1.5) * 0.40;
            organCentre = vec2f(x, 0.14 * sin(x * 5.0 + s.y * 5.0))
              + dir * h * 0.13;
          }
          let oq = q - organCentre;
          let photo = smoothstep(f32(j), f32(j) + 1.0, clamp(g.photo, 0.0, 1.0) * 12.0);
          let eat = (1.0 - g.photo * 0.65) * clamp(g.dGlint + g.dHusk + g.dFlesh, 0.0, 1.0);
          let stored = smoothstep(h - 0.05, h + 0.05, eat * 0.7);
          // neither a chloroplast nor a vacuole here, or this pixel is beyond either's reach
          if ((photo <= 0.0 && stored <= 0.0) || dot(oq, oq) > 0.36 * 0.36) { continue; }
          let chl = length(oq * vec2f(1.0, 1.5 + h));
          let oDir = dot(oq / max(length(oq), 1e-4), lightQ);
          relief += photo * 0.35 * exp(-pow((chl - 0.05) / 0.03, 2.0)) * oDir * fine;
          detail += photo * (-0.35 * (1.0 - smoothstep(0.04, 0.07 + aa, chl))
            + 0.12 * exp(-pow((chl - 0.085) / (0.012 + aa), 2.0))) * fine;
          let vr = length(oq + vec2f(0.04, 0.05));
          // vacuoles are hollows: shadowed on the side toward the light
          relief -= stored * fine * 0.3 * exp(-pow((vr - 0.05) / 0.03, 2.0)) * oDir;
          detail += stored * fine
            * (0.18 * exp(-pow((vr - 0.06 - h * 0.025) / (0.012 + aa), 2.0))
              - 0.10 * (1.0 - smoothstep(0.03, 0.06 + aa, vr)));
        }
      }
      tissue += inside * (detail + relief);
    }
    f = body * tissue * spriteMean(i.shape) / i.geom.y;
    if (appendages && body < 1.0) {
      let a = atan2(q.y, q.x);
      var motion = localPoint(i.uv / swell, i.geom.zw) * vec2f(1.0 / aspect, aspect);
      motion.y -= bendShift(motion.x, bend);
      let beat = view.time * 2.5 + seed * TAU;
      // Fade subpixel hairs before widening them with the footprint; no sparkling fringe.
      let hairs = exp(-pow((membraneSD - 0.035) / (0.018 + aa), 2.0))
        * pow(max(0.0, cos(a * 23.0 + sin(a * 5.0 + beat))), 8.0)
        * (1.0 - smoothstep(-0.15, 0.0, pressed));
      let tailY = 0.13 * sin(motion.x * 7.0 + beat) * smoothstep(0.65, 1.6, -motion.x);
      let tail = (1.0 - smoothstep(0.009, 0.018 + aa, abs(motion.y - tailY)))
        * smoothstep(0.60, 0.9, -motion.x) * (1.0 - smoothstep(1.55, 1.9, -motion.x));
      f += min(g.swim, 1.0) * resolved * (1.0 - body) * (0.05 * hairs + 0.08 * tail);
    }
    cover = body;
    return vec4f(i.col * hue * mix(far, max(0.0, f), lod), lod * cover);
  } else {
    let a = atan2(v.y, v.x) + seed * TAU;
    var r = length(v);
    let sides = 4.0 + floor(seed * 4.0);
    // a broken grain: silt chips' edges wander, so no two are regular polygons
    let edge = polygonRadius(a, sides, 0.08) * select(1.0, 1.0 + 0.12 * sin(a * 2.0 + seed * 9.0) + 0.06 * sin(a * 5.0 + seed * 17.0), p.kind == SILT);
    let body = 1.0 - smoothstep(edge - aa, edge + aa, r);
    if (p.kind == HUSK) {
      // A folded membrane, with missing arcs and torn ends, retains the dead particle's colour.
      let fold = length(v * vec2f(0.86, 1.55));
      let wall = 0.64 + 0.10 * sin(a * 3.0 + seed * 21.0) + 0.06 * sin(a * 7.0);
      let breaks = smoothstep(-0.85, -0.55, sin(a * 3.0 + seed * 37.0));
      // The torn rim is a tube of membrane, crisp and lit across its section from the upper left;
      // inside it the collapsed skin is a faint film whose wrinkles catch the light.
      let lightV = localPoint(TO_LIGHT, i.geom.zw);
      let w = 0.075;
      let t = (fold - wall) / w;
      let tube = 1.0 - smoothstep(0.8, 1.0 + aa / w, abs(t));
      let outward = normalize(v * vec2f(0.74, 2.4) + vec2f(1e-5));
      let n = normalize(vec3f(outward * t, sqrt(max(1.0 - t * t, 0.05))));
      let toLight = normalize(vec3f(lightV, 0.7));
      let membrane = tube * breaks * (0.3 + 0.9 * max(dot(n, toLight), 0.0));
      let wave = v.x * 9.0 + seed * 5.0 + 1.5 * sin(v.y * 6.0 + seed * 3.0);
      let slope = cos(wave) * normalize(vec2f(1.0, cos(v.y * 6.0 + seed * 3.0)));
      let film = (1.0 - smoothstep(wall - 0.14, wall - 0.04, fold)) * (0.14 + 0.16 * dot(slope, lightV));
      f = max(membrane + film, 0.0) * spriteMean(i.shape) / 0.30;
      cover = clamp(tube * breaks + 0.6 * (1.0 - smoothstep(wall - 0.14, wall - 0.04, fold)), 0.0, 1.0);
    } else {
      // one lit face and a faint grain, so grains read as solid chips rather than sectors
      var facets = 0.70 + 0.16 * (v.x - v.y) + 0.06 * sin(v.x * 17.0 + v.y * 11.0 + seed * 23.0);
      if (p.kind == SILT) {
        // a mineral chip: a flat top and bevelled sides, each facet lit by its own angle, one may glint
        let sector = TAU / sides;
        // one bevel per polygon edge (edges are centred on multiples of the sector); a tilted top
        let k = floor(a / sector + 0.5);
        let facing = k * sector - seed * TAU;
        let side = smoothstep(0.5 - aa, 0.5 + aa, r / edge);
        let tilt = vec2f(renderHash(p.id + 11u), renderHash(p.id + 23u)) - 0.5;
        let n = normalize(vec3f(mix(tilt * 0.6, vec2f(cos(facing), sin(facing)) * 0.9, side), 1.0));
        let toLight = normalize(vec3f(localPoint(TO_LIGHT, i.geom.zw), 0.7));
        let tone = 0.85 + 0.3 * renderHash(p.id + u32(k) * 7u);
        let glint = pow(max(dot(n, normalize(toLight + vec3f(0.0, 0.0, 1.0))), 0.0), 40.0);
        let seams = 1.0 - 0.25 * exp(-pow(fract(a / sector + 0.5) - 0.5, 2.0) * 1600.0) * side;
        facets = ((0.25 + 0.6 * max(dot(n, toLight), 0.0)) * tone * seams + 0.8 * glint) * 1.3; // same mean light as before
      }
      f = body * facets * spriteMean(i.shape) / 0.56;
      cover = body;
      if (p.kind == GLINT) {
        // a crystal: steep facets, one per edge, lit by a light that tumbles slowly so they flash in turn
        let sector = TAU / sides;
        let facing = floor(a / sector + 0.5) * sector - seed * TAU;
        let n = normalize(vec3f(vec2f(cos(facing), sin(facing)) * 1.4 * smoothstep(0.0, 0.25, r), 1.0));
        let turn = view.time * (0.4 + 0.5 * seed) + seed * TAU;
        let lit = pow(max(dot(n, normalize(vec3f(cos(turn), sin(turn), 0.8))), 0.0), 4.0);
        let ridge = exp(-pow(fract(a / sector + 0.5) - 0.5, 2.0) * 900.0);
        let core = exp(-r * r * 6.0);
        // charged mineral glows once its crystal resolves, so it stands out from the grey silt around it
        f = body * (0.45 + 1.6 * lit + 0.4 * ridge + 0.35 * core) * spriteMean(i.shape) / 0.56 * 1.8;
        let seam = exp(-pow((v.y - v.x * 0.45) / (0.018 + aa), 2.0));
        let spark = pow(max(0.0, sin(view.time * 2.0 + seed * 71.0)), 18.0);
        f += body * (seam * 0.09 + spark * exp(-dot(v - vec2f(0.22, -0.18), v - vec2f(0.22, -0.18)) * 180.0) * 0.4);
      }
      if (p.kind == STONE) {
        let seams = exp(-pow(sin(v.x * 5.0 + seed * 13.0) + 0.5 * sin(v.y * 7.0), 2.0) * 150.0);
        f *= 1.0 - 0.32 * seams;
      }
    }
  }
  return vec4f(i.col * mix(far, max(0.0, f), lod), lod * cover);
}

struct LO { @builtin(position) pos: vec4f, @location(0) col: vec3f };

@vertex fn vsLine(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> LO {
  var o: LO;
  o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
  o.col = vec3f(0.0);
  let i = livingList[ii];
  if (i == 0xffffffffu) { return o; }
  let it = intent[i];
  let n = select(it.z, it.w, (vi >> 1u) == 1u);
  if (n == 0xffffffffu) { return o; }
  let p = parts[i];
  let base = wrapd(p.pos - view.cam);
  let bp = base * view.ppu;
  if (abs(bp.x) > view.res.x * 0.5 + 60.0 || abs(bp.y) > view.res.y * 0.5 + 60.0) { return o; }
  let q = parts[n];
  if (p.kind < FIRST_LIFE || q.kind < FIRST_LIFE) { return o; }
  let dq = wrapd(q.pos - p.pos);
  let t = clamp(1.0 - length(dq) / view.linkR, 0.0, 1.0);
  let isEnd = (vi & 1u) == 1u;
  o.pos = toClip((base + select(vec2f(0.0), dq, isEnd)) * view.ppu);
  let fade = select(view.mute, 1.0, focusPass(p));
  o.col = unpack4x8unorm(select(p.col, q.col, isEnd)).rgb * ((0.35 + 0.65 * t) * view.lineGain * fade);
  if (view.pointSize > 6.0) { o.col *= 1.0 - bondLOD(view.pointSize); }
  return o;
}

@fragment fn fsLine(i: LO) -> @location(0) vec4f { return vec4f(i.col, 0.0); }

// One strip per partner, joined by two degenerate vertices: six segments per bridge.
// The native line entry points above remain the cheap, identical distant path.
struct BO {
  @builtin(position) pos: vec4f,
  @location(0) col: vec3f,
  @location(1) side: f32,
  @location(2) cover: f32,
  @location(3) across: vec2f, // the neck's sideways direction on screen
  @location(4) along: vec2f, // fraction of the way from p to q, and world distance from p
};
fn bodyTangent(index: u32, exclude: u32, chord: vec2f, outgoing: bool) -> vec2f {
  let len = length(chord);
  let reach = min(len, view.linkR * 0.55) / 3.0;
  let straight = chord * (reach / len);
  let it = intent[index];
  let other = select(it.z, it.w, it.z == exclude || it.z == NONE);
  if (other == NONE || other == exclude) { return straight; }
  let p = parts[index];
  if (parts[other].kind != p.kind) { return straight; }
  let offset = wrapd(parts[other].pos - p.pos) * select(1.0, -1.0, outgoing);
  let tangent = chord + offset;
  // Sharp turnbacks stay straight; all other controls remain within the rest length.
  if (dot(offset, chord) < -0.5 * length(offset) * len || length(tangent) < 0.001) { return straight; }
  return normalize(tangent) * reach;
}
@vertex fn vsBridge(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BO {
  var o: BO;
  o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
  let index = livingList[ii];
  if (index == NONE) { return o; }
  let it = intent[index];
  let second = vi >= 15u;
  let n = select(it.z, it.w, second);
  if (n == NONE) { return o; }
  let p = parts[index];
  let q = parts[n];
  if (p.kind < FIRST_LIFE || q.kind < FIRST_LIFE) { return o; }
  let base = wrapd(p.pos - view.cam);
  let dq = wrapd(q.pos - p.pos);
  let len = length(dq);
  if (len < 0.00001) { return o; }
  let margin = view.res * 0.5 + vec2f((len + 0.1) * view.ppu);
  if (any(abs(base * view.ppu) > margin)) { return o; }
  // vi 14 repeats A's last vertex; vi 15 repeats B's first vertex.
  let v = select(min(vi, 13u), select(vi - 16u, 0u, vi == 15u), second);
  let t = f32(v / 2u) / 6.0;
  let side = f32(v & 1u) * 2.0 - 1.0;
  let lod = bondLOD(view.pointSize);
  let rest = view.linkR * 0.55;
  let straight = dq * (min(len, rest) / (len * 3.0));
  let t0 = mix(straight, bodyTangent(index, n, dq, true), lod);
  let t1 = mix(straight, bodyTangent(n, index, dq, false), lod);
  let c1 = t0;
  let c2 = dq - t1;
  let u = 1.0 - t;
  let centre = 3.0 * u * u * t * c1 + 3.0 * u * t * t * c2 + t * t * t * dq;
  let tangent = 3.0 * u * u * c1 + 6.0 * u * t * (c2 - c1) + 3.0 * t * t * (dq - c2);
  let normal = vec2f(-tangent.y, tangent.x) / max(length(tangent), 0.00001);
  let adhesion = min(genomes[p.kind].adhesion, genomes[q.kind].adhesion);
  let taper = 0.55 + 0.45 * pow(2.0 * t - 1.0, 2.0);
  let tension = pow(min(1.0, rest / len), 3.0);
  // a neck is never wider than the cells it joins (cells shrink to fit dense bodies)
  let ends = min(cellRadius(p, genomes[p.kind], index), cellRadius(q, genomes[q.kind], n));
  let neck = min(view.ppu * (0.012 + adhesion * 0.025), 0.3 * ends);
  // up close a bond between neighbouring cells reads as a neck; one reaching across a crowd past
  // several cell widths stays the thin thread it is from afar, so zooming never hides a bond
  let neckness = lod * (1.0 - smoothstep(3.5, 5.0, len * view.ppu / ends));
  let halfWidth = mix(0.5, max(0.5, neck * taper * tension), neckness);
  o.pos = toClip((base + centre) * view.ppu + normal * side * halfWidth);
  let strength = clamp(1.0 - len / view.linkR, 0.0, 1.0);
  let fade = select(view.mute, 1.0, focusPass(p));
  // Thin bridges carry the old line's light (soft-edge integral 0.8); resolved ones are shaded as
  // membrane, a little dimmer than cytoplasm, so a wide neck between bonded cells stays visible.
  let line = (0.35 + 0.65 * strength) * view.lineGain / (halfWidth * 1.6);
  let membrane = 0.18 * view.pointGain * (0.6 + 0.4 * strength);
  o.col = mix(unpack4x8unorm(p.col).rgb, unpack4x8unorm(q.col).rgb, t)
    * (fade * lod * mix(1.0, tension * tension, neckness) * mix(line, membrane, neckness));
  o.cover = lod * neckness;
  o.side = side;
  o.across = normal;
  o.along = vec2f(t, t * len);
  return o;
}
@fragment fn fsBridge(i: BO) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.6, 1.0, abs(i.side));
  // a resolved neck is a tube of membrane: lit along the side toward the light
  let n = normalize(vec3f(i.across * i.side, sqrt(max(1.0 - i.side * i.side, 0.05))));
  let tube = 0.45 + 0.75 * max(dot(n, normalize(vec3f(TO_LIGHT, 0.7))), 0.0);
  let resolved = clamp(i.cover * 3.0, 0.0, 1.0);
  // up close it dissolves into the cells it joins rather than ending in a cut, and granular
  // cytoplasm streams along it
  let ends = mix(1.0, smoothstep(0.0, 0.25, i.along.x) * smoothstep(1.0, 0.75, i.along.x), resolved);
  let stream = 1.0 + 0.3 * resolved * cellGrain(vec2f(i.along.y * 50.0 / view.linkR - view.time * 1.2, i.side * 1.5), 7u);
  return vec4f(i.col * edge * ends * stream * mix(1.0, tube, resolved), i.cover * edge * ends);
}

// Reef stone and bedrock. Each grain is a cobble, an irregular dome; where cobbles overlap the higher
// lies over its neighbours, so a seam runs exactly where grains meet and a rock is the union of its
// cobbles. The cobble on top writes its colour and its own (analytic) slope; the composite (boulder)
// lights it.
const STONE_R = 0.2; // quad radius in world units; cobbles span ~0.12-0.17
struct SO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) col: vec3f,
  @location(2) @interpolate(flat) seed: vec2f,
  @location(3) @interpolate(flat) flags: u32, // 1: reef (built by calcifiers), 2: the selected grain, 4: a framboid; bits 3-5 the kind of grain
  @location(4) @interpolate(flat) px: f32, // quad radius in pixels
  @location(5) @interpolate(flat) fuel: f32, // a framboid's fuel left, 0..1
};
@vertex fn vsStone(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> SO {
  var o: SO;
  o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
  let p = parts[stoneList[ii]];
  if (p.kind != STONE && p.kind != FRAMBOID) { return o; }
  let d = wrapd(p.pos - view.cam) * view.ppu;
  let framboid = p.kind == FRAMBOID;
  // a framboid is smaller than a cobble: a few microns of crystals
  let r = max(STONE_R * view.ppu * select(0.8 + 0.4 * renderHash(p.id + 77u), 0.5, framboid), 1.5);
  if (any(abs(d) > view.res * 0.5 + vec2f(r))) { return o; }
  o.seed = vec2f(f32(pcgR(p.id) & 0xffffu), f32(pcgR(p.id) >> 16u)) / 65536.0;
  // sediment seen under a microscope: each grain is one of a few kinds (its own outline, detail and
  // material, mineralSurf and boulder), coloured as that kind is. Bedrock is mostly mineral grains;
  // reef stone, laid down by calcifiers, mostly the skeletons of small organisms, and keeps a little
  // of its builder's tint. A framboid is brassy pyrite.
  var base = unpack4x8unorm(p.col).rgb;
  let reef = (p.info & 15u) != 0u && !framboid;
  var ty = 0u;
  if (!framboid) {
    let h = renderHash(p.id ^ 0x9e3779b9u);
    let h2 = renderHash(p.id ^ 0x85ebca6bu);
    if (reef) {
      ty = select(select(select(select(7u, 5u, h < 0.88), 3u, h < 0.75), 6u, h < 0.55), 4u, h < 0.3);
    } else {
      ty = select(select(select(select(select(select(select(7u, 6u, h < 0.97), 5u, h < 0.93), 4u, h < 0.88), 3u, h < 0.82), 2u, h < 0.67), 1u, h < 0.55), 0u, h < 0.35);
    }
    var mc = vec3f(0.84, 0.87, 0.87); // a sponge spicule: clear silica
    switch ty {
      case 0u: { mc = select(select(vec3f(0.74, 0.75, 0.73), vec3f(0.56, 0.48, 0.41), h2 > 0.6), vec3f(0.82, 0.62, 0.64), h2 > 0.9); } // quartz: clear, smoky or rose
      case 1u: { mc = select(vec3f(0.95, 0.55, 0.42), vec3f(0.95, 0.85, 0.64), h2 > 0.6); } // feldspar: pink or cream
      case 2u: { mc = select(select(vec3f(0.16, 0.18, 0.17), vec3f(0.18, 0.26, 0.15), h2 > 0.5), vec3f(0.28, 0.15, 0.12), h2 > 0.85); } // mafic: black, green-black or red-black
      case 3u: { mc = select(select(vec3f(0.92, 0.78, 0.55), vec3f(0.76, 0.75, 0.72), h2 > 0.55), vec3f(0.9, 0.56, 0.32), h2 > 0.85); } // worn sand: tan, grey or iron-stained
      case 4u: { mc = select(vec3f(1.0, 0.95, 0.85), vec3f(1.0, 0.8, 0.74), h2 > 0.7); } // a foraminifer's chalk test
      case 5u: { mc = select(vec3f(0.74, 0.9, 0.84), vec3f(0.9, 0.85, 0.55), h2 > 0.6); } // a diatom's glass
      case 6u: { mc = select(vec3f(0.98, 0.9, 0.78), vec3f(0.9, 0.7, 0.54), h2 > 0.6); } // a shell fragment
      default: {}
    }
    base = mix(mc, base, select(0.0, 0.3, reef));
  }
  var col = base * view.matterGain * 1.1;
  if (!framboid) { col = max(mix(vec3f(dot(col, vec3f(0.3, 0.5, 0.2))), col, 1.5), vec3f(0.0)); }
  col *= select(0.75 + 0.5 * o.seed.x, 0.85 + 0.3 * o.seed.x, !framboid);
  if (!focusPass(p)) { col = vec3f(dot(col, vec3f(0.3, 0.5, 0.2))) * view.mute; }
  o.flags = select(0u, 1u, reef) | select(0u, 2u, p.id == view.selId) | select(0u, 4u, framboid) | (ty << 3u);
  o.fuel = select(0.0, clamp(p.energy / ${f(DEFAULT_K.framboidLife)}, 0.0, 1.0), framboid);
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  o.pos = toClip(d + corner * r);
  // the cobble's peak height orders it: the higher lies over its neighbours, and depth is per cobble,
  // not per pixel, so the GPU can reject hidden cobbles before shading them
  o.pos.z = select(select((0.45 + 0.55 * o.seed.x) * (0.62 + 0.18 * o.seed.y) * 0.95, 0.97, framboid), 0.99, p.id == view.selId); // a selected grain sits on top
  o.uv = corner;
  o.col = col;
  o.px = r;
  return o;
}
struct StoneOut { @location(0) col: vec4f, @location(1) surf: vec4f };
fn grainHash(seed: vec2f, k: f32) -> f32 { return fract(sin(dot(seed * 91.7 + k * 1.618, vec2f(12.9898, 78.233))) * 43758.5453); }

// A pyrite framboid: a cluster of tiny crystals packed on a rough sphere, seen from above. The
// cluster is a little squashed and lumpy; the crystals are laid on it (the lattice taken in arc
// length), so they crowd toward its limb; each sits a little off the lattice, has its own size and
// is partly faceted (a cube or octahedron seen at its own angle), the odd one is missing, those on the
// rim break the outline, and the gaps between them are dark. Its fuel rides in the surface's flags.
fn framboidSurf(i: SO) -> StoneOut {
  let rot = i.seed.x * TAU;
  let ax = vec2f(cos(rot), sin(rot));
  let squash = 1.0 + 0.22 * grainHash(i.seed, 1.0);
  let u0 = i.uv / 0.85;
  let u = vec2f(dot(u0, ax) * squash, dot(u0, vec2f(-ax.y, ax.x)));
  let ang = atan2(u.y, u.x);
  let lumps = 1.0 + 0.04 * sin(ang * 3.0 + i.seed.y * 20.0) + 0.04 * sin(ang * 5.0 + i.seed.x * 31.0) + 0.025 * sin(ang * 7.0 + i.seed.y * 9.0);
  let env = length(u) * lumps;
  if (env >= 1.12) { discard; }
  let e = min(env, 0.999);
  let dome = sqrt(1.0 - e * e);
  let g = u * (asin(e) / max(length(u), 1e-3)) * 4.2 + i.seed * 9.0;
  let cell = vec2f(1.0, 1.7320508);
  let a = g - cell * floor(g / cell) - cell * 0.5;
  let b = (g - cell * 0.5) - cell * floor((g - cell * 0.5) / cell) - cell * 0.5;
  let nb = select(b, a, dot(a, a) < dot(b, b));
  let id = g - nb;
  let h = fract(sin(vec3f(dot(id, vec2f(127.1, 311.7)), dot(id, vec2f(269.5, 183.3)), dot(id, vec2f(419.2, 371.9)))) * 43758.5453);
  let off = nb - (h.xy - 0.5) * 0.2;
  let cr = vec2f(cos(h.z * TAU), sin(h.z * TAU));
  let lo = vec2f(dot(off, cr), dot(off, vec2f(-cr.y, cr.x)));
  // round to faceted: a cube's square, or an octahedron's diamond, blended with a sphere
  let facet = select(abs(lo.x) + abs(lo.y), max(abs(lo.x), abs(lo.y)) * 1.15, h.x > 0.5);
  let rr = mix(length(off), facet, 0.45 + 0.4 * h.y) / (0.45 + 0.27 * h.y) + select(0.0, 2.0, h.x > 0.94);
  let sph = sqrt(max(1.0 - rr * rr, 0.0));
  if (env - 0.09 * sph >= 1.0) { discard; }
  var o: StoneOut;
  let sl = -1.1 * u / max(dome, 0.2) - 1.6 * off / max(sph, 0.3) * (0.4 + 0.6 * dome);
  let slope = (sl.x / squash) * ax + sl.y * vec2f(-ax.y, ax.x);
  let gap = smoothstep(0.85, 1.0, rr);
  o.col = vec4f(i.col * (1.0 - 0.6 * gap) * (0.75 + 0.5 * h.y), 1.0 - smoothstep(0.92, 1.0, env - 0.09 * sph));
  o.surf = vec4f(slope, gap, f32(i.flags) + i.fuel * 0.45);
  return o;
}

// The kinds of sediment grain (vsStone picks one per grain; boulder lights each as its material):
// 0 quartz, glassy, angular, with curved fracture ripples, a hairline crack and specks of inclusions;
// 1 feldspar, blocky, stepped along its cleavage and faintly banded; 2 a mafic prism, long, dark and
// glossy, striated along its length; 3 worn sand, a rounded frosted pebble; 4 a foraminifer's test,
// chambers coiled in a growing spiral, sutured and pored; 5 a diatom, a glass disc with a raised rim
// and rows of pores (or a slim boat with cross ribs and a central slit); 6 a shell fragment, a broken
// shard with growth lines and ribs; 7 a sponge spicule, a slim glass needle with its axial canal.
// Fine detail fades in as the grain grows on screen. Height and slope in uv units (uv is world over
// the quad's radius).
struct Poly { sd: f32, sd2: f32, nrm: vec2f, face: f32 };
// An irregular convex polygon of n facets at uneven angles (jit) and distances (spread), sometimes
// with a wedge chipped out of its edge.
fn grainPoly(w: vec2f, seed: vec2f, n: u32, r0: f32, jit: f32, spread: f32, chip: bool) -> Poly {
  var p: Poly;
  p.sd = -1e9; p.sd2 = -1e9; p.nrm = vec2f(1.0, 0.0); p.face = 0.0;
  for (var k = 0u; k < n; k++) {
    let at = (f32(k) + jit * (grainHash(seed, f32(k) + 2.0) - 0.5)) * TAU / f32(n);
    let dir = vec2f(cos(at), sin(at));
    let dk = dot(w, dir) - r0 * (1.0 - 0.5 * spread + spread * grainHash(seed, f32(k) + 11.0));
    if (dk > p.sd) { p.sd2 = p.sd; p.sd = dk; p.nrm = dir; p.face = f32(k); } else if (dk > p.sd2) { p.sd2 = dk; }
  }
  if (chip && grainHash(seed, 19.0) > 0.5) {
    let ca = grainHash(seed, 23.0) * TAU;
    let c = vec2f(cos(ca), sin(ca)) * r0 * (0.55 + 0.2 * grainHash(seed, 29.0));
    let sp = 0.5 + 0.5 * grainHash(seed, 31.0);
    let n1 = vec2f(cos(ca + 1.5708 + sp), sin(ca + 1.5708 + sp));
    let n2 = vec2f(cos(ca - 1.5708 - sp * 0.7), sin(ca - 1.5708 - sp * 0.7));
    let d1 = dot(w - c, n1);
    let d2 = dot(w - c, n2);
    let cut = -max(d1, d2);
    if (cut > p.sd) { p.sd2 = p.sd; p.sd = cut; p.nrm = select(-n2, -n1, d1 > d2); p.face = 9.0; }
  }
  return p;
}
// Scattered round dots on a jittered grid: 1 inside a dot. dens is the share of cells with one.
fn grainDots(q: vec2f, size: f32, dens: f32) -> f32 {
  let c = floor(q);
  let h = fract(sin(vec2f(dot(c, vec2f(127.1, 311.7)), dot(c, vec2f(269.5, 183.3)))) * 43758.5453);
  let d = length(fract(q) - 0.25 - 0.5 * h);
  return select(0.0, 1.0 - smoothstep(size * 0.6, size, d), fract(h.x * 7.13 + h.y * 3.1) < dens);
}

fn mineralSurf(i: SO) -> StoneOut {
  let ty = (i.flags >> 3u) & 7u;
  let rot = i.seed.x * TAU;
  let ax = vec2f(cos(rot), sin(rot));
  let ay = vec2f(-ax.y, ax.x);
  let u = vec2f(dot(i.uv, ax), dot(i.uv, ay));
  let aa = 1.5 / max(i.px, 1.0);
  let det = smoothstep(18.0, 70.0, i.px);
  let det2 = smoothstep(70.0, 260.0, i.px); // the finest detail, only right up close
  let H = i.seed;
  var stretch = 1.0;
  var sd = 0.0;
  var ls = vec2f(0.0);
  var alb = 1.0;
  var edge = 0.0;
  if (ty <= 2u || ty == 6u) {
    // crystals and shell shards: a table with bevelled sides, each bevel lit as its own facet, a crisp
    // ridge where two meet, and a top tilted a little its own way
    let shell = ty == 6u;
    var n = 6u + u32(grainHash(H, 3.0) * 4.99);
    var r0 = 0.48 + 0.2 * H.y;
    var jit = 0.8;
    var spread = 0.55;
    stretch = 1.0 + 0.5 * grainHash(H, 1.0);
    if (ty == 1u) { n = select(4u, 5u, grainHash(H, 3.0) > 0.6); jit = 0.2; spread = 0.35; stretch = 1.2 + 0.5 * grainHash(H, 1.0); r0 = 0.42 + 0.14 * H.y; }
    if (ty == 2u) { n = 6u; jit = 0.25; spread = 0.2; stretch = 1.8 + 0.6 * grainHash(H, 1.0); r0 = 0.3 + 0.08 * H.y; }
    if (shell) { n = 4u + u32(grainHash(H, 3.0) * 2.99); jit = 1.0; spread = 0.5; stretch = 1.1 + 0.4 * grainHash(H, 1.0); }
    let w = vec2f(u.x / stretch, u.y);
    let P = grainPoly(w, H, n, r0, jit, spread, ty != 2u);
    sd = P.sd;
    let steep = select(1.3 + 1.6 * grainHash(H, 7.0), 2.2, shell);
    let bevel = r0 * select(select(0.28 + 0.25 * grainHash(H, 5.0), 0.12 + 0.08 * grainHash(H, 5.0), ty == 1u || ty == 2u), 0.07, shell);
    let t = smoothstep(0.0, bevel, -sd);
    let faceted = ty == 0u || ty == 2u;
    var form = vec2f(0.0); // the grain's own slope; its markings add to tilt below
    var tilt = vec2f(0.0);
    if (faceted) {
      // a faceted crystal: its surface is the lowest of a set of planes, the steep outer facets (one
      // per edge of its outline, meeting the floor there), a ring of gentler crown facets turned
      // between them, and a top face (on a prism, two long faces meeting in a ridge instead); each
      // facet reflects a little differently, with a crisp line where two meet
      var h1 = 1e9;
      var h2 = 1e9;
      var fid = 0.0;
      for (var k = 0u; k < n; k++) {
        let at = (f32(k) + jit * (grainHash(H, f32(k) + 2.0) - 0.5)) * TAU / f32(n);
        let dir = vec2f(cos(at), sin(at));
        let sk = steep * (0.8 + 0.6 * grainHash(H, f32(k) + 81.0));
        let hk = -sk * (dot(w, dir) - r0 * (1.0 - 0.5 * spread + spread * grainHash(H, f32(k) + 11.0)));
        if (hk < h1) { h2 = h1; h1 = hk; form = -sk * dir; fid = f32(k); } else if (hk < h2) { h2 = hk; }
      }
      let ns = select(3u + u32(grainHash(H, 90.0) * 3.99), 2u, ty == 2u);
      for (var k = 0u; k < ns; k++) {
        let at = select((f32(k) + grainHash(H, f32(k) + 91.0) - 0.5) * TAU / f32(ns) + H.y * TAU, (f32(k) + 0.25) * TAU / 2.0 + 0.1 * (grainHash(H, 92.0) - 0.5), ty == 2u);
        let dir = vec2f(cos(at), sin(at));
        let sk = select(0.35, 0.9, ty == 2u) + 0.5 * grainHash(H, f32(k) + 93.0);
        let hk = r0 * (0.45 + 0.4 * grainHash(H, f32(k) + 95.0)) + sk * (r0 * select(0.2 + 0.4 * grainHash(H, f32(k) + 96.0), 0.0, ty == 2u) - dot(w, dir));
        if (hk < h1) { h2 = h1; h1 = hk; form = -sk * dir; fid = f32(k) + 20.0; } else if (hk < h2) { h2 = hk; }
      }
      let tv = (vec2f(grainHash(H, 13.0), grainHash(H, 17.0)) - 0.5) * 0.5;
      let htop = select(r0 * (0.75 + 0.2 * grainHash(H, 97.0)) + dot(w, tv), 1e9, ty == 2u);
      if (htop < h1) { h2 = h1; h1 = htop; form = tv; fid = 40.0; } else if (htop < h2) { h2 = htop; }
      let fline = 1.0 - smoothstep(0.0, 0.012, h2 - h1);
      // milky clouds inside the glass
      let milk = grainDots(w * 5.0 + H * 13.0, 0.9, 0.7) * grainDots(w * 7.0 + H * 3.0, 0.9, 0.7);
      // higher on the grain is brighter, so each facet shades across its width
      alb = (0.82 + 0.36 * grainHash(H, fid + 41.0)) * (1.0 - 0.2 * fline) * (0.72 + 0.3 * clamp(h1 / (r0 * 0.8), 0.0, 1.0)) * (1.0 - 0.22 * milk * det);
      edge = max(1.0 - smoothstep(0.0, 0.06, -sd), 0.35 * fline);
    } else {
      // a table with bevelled sides, each bevel lit as its own facet, a crisp ridge where two meet, and
      // a top tilted a little its own way and gently domed
      let top = (vec2f(grainHash(H, 13.0), grainHash(H, 17.0)) - 0.5) * 0.9 - w / r0 * select(0.8, 1.6, shell);
      let ridge = 1.0 - smoothstep(0.0, 0.025, P.sd - P.sd2);
      alb = mix(0.82 + 0.36 * grainHash(H, P.face + 41.0), 1.0, t) * (1.0 - 0.25 * ridge * (1.0 - t));
      edge = max(1.0 - smoothstep(0.0, bevel * 1.3, -sd), 0.5 * ridge * (1.0 - t));
      form = -P.nrm * (steep * (1.0 - t)) + top * t;
    }
    if (ty == 0u) {
      // conchoidal fracture: curved ripples spreading from a point where it broke
      let fa = grainHash(H, 47.0) * TAU;
      let fc = vec2f(cos(fa), sin(fa)) * r0 * 0.95;
      let fv = w - fc;
      let fd = length(fv);
      let conch = smoothstep(r0 * 0.9, r0 * 0.2, fd) * step(0.65, grainHash(H, 49.0));
      tilt += fv / max(fd, 1e-3) * 0.1 * sin(fd * (34.0 + 20.0 * grainHash(H, 50.0)) + 1.5 * sin(atan2(fv.y, fv.x) * 3.0)) * conch * conch * det;
      // a hairline crack that catches the light
      let cn = vec2f(cos(grainHash(H, 51.0) * TAU), sin(grainHash(H, 51.0) * TAU));
      let cdist = dot(w, cn) - (grainHash(H, 52.0) - 0.5) * r0;
      let crack = (1.0 - smoothstep(0.0, 0.008, abs(cdist + 0.04 * sin(dot(w, vec2f(-cn.y, cn.x)) * 17.0)))) * step(0.4, grainHash(H, 53.0)) * det * t;
      alb *= 1.0 - 0.25 * crack;
      tilt += cn * sign(cdist) * crack * 0.5;
      // a healed fracture: a trail of tiny fluid inclusions across it
      let ia = grainHash(H, 57.0) * TAU;
      let iq = mat2x2f(cos(ia), sin(ia), -sin(ia), cos(ia)) * w;
      let iy = iq.y - (grainHash(H, 58.0) - 0.5) * r0 + 0.03 * sin(iq.x * 9.0);
      alb *= 1.0 - 0.45 * grainDots(vec2f(iq.x, iy) * 70.0 + vec2f(0.0, 0.5), 0.25, 0.75) * (1.0 - smoothstep(0.004, 0.012, abs(iy))) * det2;
      // specks of other minerals and fluid trapped as it grew
      alb *= 1.0 - 0.35 * grainDots(w * 13.0 + H * 9.0, 0.1 + 0.12 * grainHash(H, 55.0), 0.12) * det - 0.25 * grainDots(w * 37.0 + H * 4.0, 0.12, 0.08) * det;
    }
    if (ty == 1u) {
      // perthite: fine wavy streaks of a second feldspar grown through it
      alb *= 1.0 + 0.1 * det2 * smoothstep(0.55, 0.9, sin(w.x * 140.0 + 5.0 * sin(w.y * 17.0 + H.x * 20.0) + 3.0 * sin(w.x * 11.0)));
      // cleavage: the top steps down in terraces across its length, each riser a thin lit line
      let cy = w.y * (5.0 + 4.0 * grainHash(H, 61.0)) + grainHash(H, 63.0) * 9.0;
      let cv = fract(cy + 0.35 * sin(floor(cy) * 12.9898));
      let riser = smoothstep(0.86, 0.95, cv) * (1.0 - smoothstep(0.95, 1.0, cv)) * step(0.35, fract(sin(floor(cy) * 78.233) * 437.585));
      tilt += vec2f(0.0, 1.8) * riser * det * t;
      alb *= 1.0 - 0.15 * riser * det * t;
      // faint bands of twinned crystal along it, and cloudy alteration
      alb *= 1.0 + 0.1 * det * (smoothstep(-0.25, 0.25, sin(w.x * (10.0 + 8.0 * grainHash(H, 65.0)) + 2.0 * sin(w.y * 3.0))) * 2.0 - 1.0);
    }
    if (ty == 2u) {
      // striations along the prism's length
      let st = sin(w.y * (150.0 + 60.0 * grainHash(H, 67.0)) + 2.5 * sin(w.x * 5.0 + H.y * 9.0)) * (0.5 + 0.5 * sin(w.y * 23.0 + H.x * 7.0));
      tilt.y += 0.08 * st * det;
      // two cleavages crossing at an angle, as fine cracks
      let c1 = abs(fract(dot(w, vec2f(0.83, 0.56)) * 18.0 + H.x * 5.0) - 0.5);
      let c2 = abs(fract(dot(w, vec2f(0.83, -0.56)) * 15.0 + H.y * 5.0) - 0.5);
      alb *= 1.0 + 0.5 * det2 * (1.0 - smoothstep(0.0, 0.04, min(c1, c2))) * step(0.5, fract(sin(dot(floor(w * 9.0), vec2f(12.9, 78.2))) * 437.5));
      alb *= 1.0 + 0.06 * st * det;
    }
    if (shell) {
      // growth lines curving about the hinge (beyond the shard), radial ribs, and broad colour bands
      let ha = grainHash(H, 71.0) * TAU;
      let hc = vec2f(cos(ha), sin(ha)) * r0 * (1.5 + grainHash(H, 72.0));
      let hv = w - hc;
      let hd = length(hv);
      let hr = hv / hd;
      let hp = vec2f(-hr.y, hr.x);
      let gk = hd * (26.0 + 16.0 * grainHash(H, 73.0));
      tilt += hr * 0.5 * pow(abs(cos(gk + 1.7 * sin(gk * 0.37))), 6.0) * sign(cos(gk + 1.7 * sin(gk * 0.37))) * det;
      let rib = dot(hr, vec2f(-hc.y, hc.x) / length(hc));
      tilt += hp * 0.35 * cos(rib * (30.0 + 20.0 * grainHash(H, 74.0))) * det * step(0.4, grainHash(H, 75.0));
      alb *= 1.0 + 0.14 * sin(hd * (8.0 + 6.0 * grainHash(H, 76.0)) + H.x * 20.0) + 0.08 * det2 * sin(hd * 160.0 + 2.0 * sin(hd * 31.0));
    }
    ls = form + tilt * select(t, 1.0, faceted);
  } else if (ty == 3u) {
    // worn sand: a rounded pebble, its outline gently wobbling, its surface frosted by pits
    stretch = 1.0 + 0.45 * grainHash(H, 1.0);
    let w = vec2f(u.x / stretch, u.y);
    let rho = length(w);
    let c = w / max(rho, 1e-4);
    let wob = 1.0 + 0.06 * (c.x * c.x - c.y * c.y) * sin(H.x * 30.0) + 0.05 * dot(c, vec2f(cos(H.y * 40.0), sin(H.y * 40.0))) * (4.0 * c.x * c.x * c.x - 3.0 * c.x) + 0.04 * c.y * (3.0 * c.x * c.x - c.y * c.y);
    let r0 = (0.55 + 0.15 * H.y) * wob;
    sd = rho - r0;
    let q = min(rho / r0, 0.995);
    let hgt = sqrt(1.0 - q * q);
    ls = -2.2 * w / (r0 * max(hgt, 0.22));
    alb = 1.0 - 0.18 * grainDots(w * 26.0 + H * 5.0, 0.3, 0.6) * det - 0.15 * grainDots(w * 75.0 + H * 2.0, 0.35, 0.5) * det2 + 0.12 * (grainDots(w * 9.0 + H * 3.0, 0.45, 0.5) - 0.3) * det;
    edge = 1.0 - smoothstep(0.0, 0.15 * r0, -sd);
  } else if (ty == 4u) {
    // a foraminifer: chambers, each larger than the last, coiled in a log spiral; the newest lies
    // over the older; sutures sink where two meet, and the chalk is finely pored
    let N = 7u + u32(grainHash(H, 3.0) * 4.99);
    let gr = 0.22 + 0.1 * grainHash(H, 1.0);
    let dth = (0.8 + 0.3 * grainHash(H, 5.0)) * select(-1.0, 1.0, grainHash(H, 7.0) > 0.5);
    let rN = exp(gr * f32(N - 1u));
    let sc = 0.7 / (1.55 * rN);
    let w = u + vec2f(rN * sc * 0.25, 0.0);
    var h1 = -1.0;
    var h2 = -1.0;
    var sdm = 1e9;
    var top = vec2f(0.0);
    for (var k = 0u; k < N; k++) {
      let rk = exp(gr * f32(k)) * sc;
      let th = f32(k) * dth;
      let rad = rk * 0.6;
      let dv = w - vec2f(cos(th), sin(th)) * rk;
      let dd = length(dv);
      sdm = min(sdm, dd - rad);
      let hk = sqrt(max(rad * rad - dd * dd, 0.0)) * select(0.0, 1.0, dd < rad) + f32(k) * 1e-4;
      if (hk > h1) { h2 = h1; h1 = hk; top = -dv / max(hk, rad * 0.3); } else if (hk > h2) { h2 = hk; }
    }
    sd = sdm;
    ls = top * 1.4;
    let suture = (1.0 - smoothstep(0.0, 0.035, h1 - h2)) * step(1e-3, h2);
    alb = (1.0 - 0.4 * suture) * (1.0 - 0.3 * grainDots(w * 50.0 + H * 7.0, 0.3, 0.7) * det);
    edge = max(1.0 - smoothstep(0.0, 0.035, -sd), 0.5 * suture);
  } else if (ty == 5u) {
    if (grainHash(H, 9.0) < 0.6) {
      // a centric diatom: a flat glass valve with a raised rim, pores in rows radiating out
      let r0 = 0.52 + 0.15 * H.y;
      let rho = length(u);
      sd = rho - r0;
      let q = rho / r0;
      let dr = -0.2 * q - 4.4 * (q - 0.9) * exp(-pow((q - 0.9) / 0.06, 2.0));
      ls = u / max(rho, 1e-4) * dr * 2.5;
      let rows = f32(18u + u32(grainHash(H, 11.0) * 18.0));
      let ac = vec2f(fract(atan2(u.y, u.x) / TAU * rows) - 0.5, fract(q * (8.0 + 5.0 * grainHash(H, 13.0))) - 0.5);
      let pore = (1.0 - smoothstep(0.18, 0.32, length(ac))) * smoothstep(0.15, 0.25, q) * (1.0 - smoothstep(0.82, 0.86, q));
      alb = 1.0 - 0.45 * pore * det;
      edge = 1.0 - smoothstep(0.0, 0.1, -sd);
    } else {
      // a pennate diatom: a slim boat, ribbed across, a slit (the raphe) down its middle
      let L = 0.75;
      let Wd = 0.17 + 0.06 * H.y;
      let e = u / vec2f(L, Wd);
      let rho = length(e);
      sd = (rho - 1.0) * Wd;
      let hgt = sqrt(max(1.0 - rho * rho, 0.04));
      ls = -0.8 * vec2f(e.x / L, e.y / Wd) / hgt;
      let rib = 1.0 - smoothstep(0.12, 0.3, abs(fract(u.x * (26.0 + 10.0 * grainHash(H, 11.0))) - 0.5));
      let raphe = (1.0 - smoothstep(0.0, 0.012, abs(u.y))) * smoothstep(0.05, 0.08, abs(u.x)) * (1.0 - smoothstep(0.8, 0.9, abs(e.x)));
      alb = (1.0 - 0.3 * rib * det * smoothstep(0.25, 0.4, abs(e.y))) * (1.0 - 0.5 * raphe * det);
      edge = 1.0 - smoothstep(0.0, 0.06, -sd);
    }
  } else {
    // a sponge spicule: a slim glass needle, tapered at both ends, a little bent, its canal inside
    let L = 0.68 + 0.15 * H.y;
    let rr = 0.08 + 0.05 * grainHash(H, 3.0);
    let w = vec2f(u.x, u.y - (grainHash(H, 5.0) - 0.5) * 0.5 * u.x * u.x);
    let cx = clamp(w.x, -L, L);
    let rad = rr * (1.0 - 0.7 * pow(abs(cx) / L, 3.0));
    let dv = vec2f(w.x - cx, w.y);
    let dd = length(dv);
    sd = dd - rad;
    let q = min(dd / rad, 0.995);
    ls = -1.5 * dv / max(dd, 1e-4) * q / max(sqrt(1.0 - q * q), 0.2);
    alb = 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.2 * rad, abs(w.y))) * step(abs(w.x), L * 0.85) * det;
    edge = 1.0 - smoothstep(0.0, 0.5 * rad, -sd);
  }
  // silt and clay stuck to it: dark and pale specks
  alb *= 1.0 - 0.3 * grainDots(u * 55.0 + H * 17.0, 0.35, 0.16) * det2 + 0.25 * grainDots(u * 85.0 + H * 23.0, 0.3, 0.1) * det2;
  if (sd >= aa) { discard; }
  var o: StoneOut;
  let slope = (ls.x / stretch) * ax + ls.y * ay;
  o.col = vec4f(i.col * alb, 1.0 - smoothstep(-aa, aa, sd));
  // .z: how near its own edge (where it meets its neighbours) the pixel lies
  o.surf = vec4f(slope, edge, f32(i.flags));
  return o;
}

@fragment fn fsStone(i: SO) -> StoneOut {
  if ((i.flags & 4u) != 0u) { return framboidSurf(i); }
  return mineralSurf(i);
}

@vertex fn vsFade(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fsFade() -> @location(0) vec4f { return vec4f(0.0); }
`;

// The uniforms POST_WGSL and MICRO_WGSL share (engine _render fills them).
const POST_STRUCT = /* wgsl */ `
struct Post {
  res: vec2f, bloom: f32, exposure: f32,
  time: f32, season: f32, tideVis: f32, ppu: f32,
  cam: vec2f, world: vec2f,
  simTime: f32, ambient: f32, optics: f32,
  // -1: no heat field; 0: heat map off; 1: shimmer; 2: thermal camera
  heatVis: f32,
  tide: array<vec4f, 4>,
  tidePh: vec4f,
  waves: array<vec4f, 4>,
  // the background water temperature, then the heat map's span
  heat: vec4f,
};
`;

// The pond's micro-suspension: flow, hashes and the bodies themselves, shared by the per-pixel
// path (loupe, specimen) and the speck pass (MICRO_WGSL).
const MICRO_FNS = /* wgsl */ `
// Same four divergence-free waves as matter's flowAt, including phase/time.
fn postFlowAt(p: vec2f, time: f32) -> vec2f {
  var v = vec2f(0.0);
  for (var k = 0u; k < 4u; k++) {
    let w = post.waves[k];
    let ph = dot(w.xy, p) + w.z * time + f32(k) * 1.7;
    v += vec2f(w.y, -w.x) * (cos(ph) * w.w / max(length(w.xy), 1e-4));
  }
  return v;
}

// Four decorrelated hash channels in one inexpensive vector hash.
fn microHash(p: vec2f) -> vec4f {
  var h = fract(vec4f(p.xy, p.xy + vec2f(19.19, 73.73)) * vec4f(0.1031, 0.1030, 0.0973, 0.1099));
  h += dot(h, h.wzxy + 33.33);
  return fract((h.xxyz + h.yzzw) * h.zywx);
}

fn microNoise(p: vec2f, period: vec2f) -> vec3f {
  let cell = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = cell - period * floor(cell / period);
  let b = (cell + 1.0) - period * floor((cell + 1.0) / period);
  return mix(mix(microHash(a).xyz, microHash(vec2f(b.x, a.y)).xyz, u.x),
    mix(microHash(vec2f(a.x, b.y)).xyz, microHash(b).xyz, u.x), u.y);
}

// Each body family's stroke width relative to its r (microBody's per-family width), as a select
// chain: a dynamically indexed local array lands in stack memory on some GPUs.
fn microWidth(family: u32) -> f32 {
  return select(select(select(0.42, 0.36, family == 1u), select(0.22, 0.7, family == 3u), family >= 2u),
    select(select(0.2, 1.0, family == 5u), select(1.0, 0.4, family == 7u), family >= 6u), family >= 4u);
}

fn microBody(local: vec2f, h: vec4f, spacing: f32, ppu: f32, depth: f32, abundance: f32) -> vec4f {
  let t = post.simTime;
  let size = mix(0.55, 1.55, h.w);
  var q = local / size;
  let resolved = smoothstep(0.6, 1.6, spacing * size * 0.075 * ppu);
  if (resolved <= 0.0) { return vec4f(0.0); }
  let aa = 0.65 / (spacing * size * ppu);
  let tint = vec3f(0.018, 0.023, 0.025) * mix(0.7, 1.15, h.w);
  if (depth < 1.0) {
    // A separate soft plane: large discs and elongated smudges, with broad
    // focus falloff. It pans and follows the water at 72% of the in-focus plane.
    let stretch = mix(1.0, 1.6, h.z);
    let d = length(q * vec2f(stretch, 1.0));
    let soft = 1.0 - smoothstep(0.02, 0.21 + min(aa, 0.025), d);
    let halo = smoothstep(0.01, 0.08, d) * (1.0 - smoothstep(0.08, 0.23, d));
    let glow = (soft * soft * 0.28 + halo * 0.23) * abundance * resolved;
    return vec4f(tint * glow, soft * soft * 0.1 * abundance * resolved);
  }
  let family = u32(h.z * 8.0);
  let r = 0.05 + h.y * 0.025;
  // Avoid shape/trigonometric work for individual unresolved objects, even
  // when a larger sibling in this octave can already be seen.
  if (r * microWidth(family) * spacing * size * ppu <= 0.45) { return vec4f(0.0); }
  let tumble = 0.9 * smoothstep(0.78, 0.98, sin(t * 0.17 + h.x * TAU));
  let angle = h.x * TAU + t * (h.y - 0.5) * 0.08 + tumble;
  let axis = vec2f(cos(angle), sin(angle));
  q = vec2f(dot(q, axis), dot(q, vec2f(-axis.y, axis.x)));
  var sdf = 0.0;
  var width = r;
  var haloWidth = r * 0.45;
  var body = 0.13;
  if (family == 0u) {
    // Rods: a translucent body inside a phase-contrast halo.
    sdf = length(vec2f(max(abs(q.x) - 0.075, 0.0), q.y)) - r * 0.42;
    width = r * 0.42;
  } else if (family == 1u) {
    // Pairs and chains of 3–6 cocci. Closest bead analytically, no bead loop.
    let count = select(3.0 + floor(h.y * 4.0), 2.0, h.x < 0.25);
    let mid = (count - 1.0) * 0.5;
    let bead = clamp(round(q.x / 0.058 + mid), 0.0, count - 1.0);
    let beadY = 0.012 * sin(bead * 1.4 + h.y * TAU);
    sdf = length(q - vec2f((bead - mid) * 0.058, beadY)) - r * 0.36;
    width = r * 0.36;
  } else if (family == 2u) {
    // Spirillum: a short, gently flexing helix stroke.
    let bend = 0.035 * sin(q.x * 42.0 + t * 0.6 + h.x * TAU);
    sdf = max(abs(q.y - bend) - r * 0.22, abs(q.x) - 0.16);
    width = r * 0.22;
  } else if (family == 3u) {
    // Tiny flagellate and its wiggling hair; the head determines its LOD.
    let head = length(q - vec2f(-0.07, 0.0)) - r * 0.7;
    let bend = 0.025 * sin((q.x + 0.07) * 33.0 - t * 2.0) * smoothstep(-0.07, 0.02, q.x);
    let hair = max(abs(q.y - bend) - r * 0.12, abs(q.x - 0.045) - 0.115);
    sdf = min(head, hair);
    width = r * 0.7;
  } else if (family == 4u) {
    // Long, bent mucilage / fibre with uneven thickness.
    let bend = 0.032 * sin(q.x * 21.0 + h.x * TAU) + 0.01 * sin(q.x * 53.0 + t * 0.2);
    sdf = max(abs(q.y - bend) - r * (0.18 + 0.05 * cos(q.x * 37.0)), abs(q.x) - 0.20);
    width = r * 0.2;
    body = 0.22;
  } else if (family == 5u) {
    sdf = max(abs(q.x) * 0.8 + abs(q.y) * 0.65, abs(q.y - q.x * 0.4)) - r;
    body = 0.18;
  } else if (family == 6u) {
    // Flocculent fleck: three overlapping, irregular lobes.
    sdf = min(length(q - vec2f(-0.027, -0.012)) - r * 0.8,
      min(length(q - vec2f(0.032, 0.005)) - r * 0.7, length(q - vec2f(0.0, 0.04)) - r * 0.65));
    body = 0.23;
  } else {
    // Bubble: a thin bright rim around a nearly clear, slightly darker core.
    sdf = length(q) - r * 1.25;
    width = r * 0.4;
    haloWidth = r * 0.14;
    body = 0.015;
  }
  let visible = resolved * smoothstep(0.45, 1.3, width * spacing * size * ppu) * abundance;
  let core = 1.0 - smoothstep(-aa, aa, sdf);
  let rim = 1.0 - smoothstep(aa * 0.5, aa + haloWidth, abs(sdf));
  return vec4f(tint * (core * body + rim * 0.85), core * 0.24) * visible;
}

// One octave's slot lattice. Integer torus winding vectors keep the irrational-angle lattice
// seamless across world wraps; inverse maps a slot back to its canonical hash address.
struct MicroLattice { lattice: mat2x2f, inverse: mat2x2f, world: vec2f, patchCells: vec2f, offset: vec2f };
fn microLattice(spacing: f32, octave: f32, depth: f32) -> MicroLattice {
  let world = post.world * depth;
  let theta = 0.618033989 + octave * 2.39996323;
  let axis = vec2f(cos(theta), sin(theta));
  let row0 = round(axis * world / spacing);
  let row1 = round((vec2f(-axis.y, axis.x) + axis * 0.37) * world / spacing);
  var L: MicroLattice;
  L.lattice = mat2x2f(vec2f(row0.x, row1.x), vec2f(row0.y, row1.y));
  let det = row0.x * row1.y - row0.y * row1.x;
  L.inverse = mat2x2f(vec2f(row1.y, -row1.x) / det, vec2f(-row0.y, row0.x) / det);
  L.world = world;
  L.patchCells = max(vec2f(1.0), round(world / vec2f(0.21, 0.38)));
  L.offset = vec2f(octave * 17.3, octave * 9.7);
  return L;
}
`;

export const POST_WGSL = 'diagnostic(off, derivative_uniformity);\n' + COMMON + /* wgsl */ `
override MICRO_SUSPENSION: bool = true;
const LOUPE_FIELD = ${LOUPE_FIELD};
${POST_STRUCT}struct Loupe { center: vec2f, radius: f32, strength: f32, res: vec2f, ppu: f32, p1: f32 };
// Prefix of DRAW's View: reuse the inspection cameras, without another buffer.
struct MicroView { cam: vec2f, world: vec2f, res: vec2f, ppu: f32, pointSize: f32 };
struct Reproj { scale: vec2f, shift: vec2f, k: f32, p0: f32, p1: f32, p2: f32 };
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var<uniform> post: Post;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> loupe: Loupe;
@group(0) @binding(5) var<uniform> rp: Reproj;
@group(0) @binding(6) var<uniform> microView: MicroView;
@group(0) @binding(7) var stoneTex: texture_2d<f32>;
@group(0) @binding(8) var stoneTop: texture_2d<f32>;
@group(0) @binding(9) var murkTex: texture_2d<f32>;
@group(0) @binding(10) var microTex: texture_2d<f32>;
@group(0) @binding(11) var<storage, read> heatField: array<f32>;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vsFull(@builtin(vertex_index) vi: u32) -> VO {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: VO;
  o.pos = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(uv.x, 1.0 - uv.y);
  return o;
}

// The scene's alpha is the coverage of resolved cells: where several overlap their light is
// averaged rather than summed. Bloom levels and empty space carry alpha 0, which leaves them as is.
fn scene(uv: vec2f) -> vec3f {
  let t = textureSampleLevel(src, samp, uv, 0.0);
  return t.rgb / max(1.0, t.a);
}
fn tap(uv: vec2f) -> vec3f { return scene(uv); }

fn vnoise(p: vec2f) -> f32 {
  let c = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(c), hash12(c + vec2f(1.0, 0.0)), w.x), mix(hash12(c + vec2f(0.0, 1.0)), hash12(c + vec2f(1.0, 1.0)), w.x), w.y);
}
// Cellular noise: distances to the nearest and second-nearest jittered feature point, and the
// offset to the nearest, in units of p.
fn worley(p: vec2f) -> vec4f {
  let c = floor(p);
  var f1 = 9.0; var f2 = 9.0; var off = vec2f(0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = c + vec2f(f32(x), f32(y));
      let q = g + vec2f(hash12(g), hash12(g + 17.3)) * 0.85 + 0.075 - p;
      let d = length(q);
      if (d < f1) { f2 = f1; f1 = d; off = q; } else if (d < f2) { f2 = d; }
    }
  }
  return vec4f(f1, f2, off);
}
// Rock from the stone targets (DRAW_WGSL vsStone): the cobble on top at each pixel, lit from its own
// slope, darkening toward its edge where it tucks under its neighbours. Bedrock is speckled like
// granite; reef stone, laid down by calcifiers, is pitted like limestone. The selected grain glows.
fn boulder(uv: vec2f, wp: vec2f, ppu: f32) -> vec3f {
  let c = textureSampleLevel(stoneTex, samp, uv, 0.0);
  if (c.a <= 0.0) { return vec3f(0.0); }
  let s = textureSampleLevel(stoneTop, samp, uv, 0.0);
  // flags (with the kind of grain), and a framboid's fuel in the fraction (fsStone): read from the nearest
  // pixel, since blending two grains' flags at their seam would decode as some other material
  let st = vec2f(textureDimensions(stoneTop));
  let sw = textureLoad(stoneTop, vec2i(clamp(uv * st, vec2f(0.0), st - 1.0)), 0).w;
  let flags = u32(floor(sw + 0.01));
  let fine = smoothstep(120.0, 400.0, ppu);
  if ((flags & 4u) != 0u) {
    // pyrite: metallic, so mostly a brassy glint off each crystal; and while it oxidises a dull warm
    // glow from within, brightest in the gaps between crystals, fading as it is spent
    let fuel = (sw - f32(flags)) / 0.45;
    let n = normalize(vec3f(-s.xy, 1.0));
    let light = normalize(vec3f(-0.45, -0.55, 0.7));
    let spec = pow(max(dot(n, normalize(light + vec3f(0.0, 0.0, 1.0))), 0.0), 18.0);
    var lit = c.rgb * (0.25 + 0.65 * max(dot(n, light), 0.0)) + mix(c.rgb, vec3f(1.0, 0.95, 0.8), 0.3) * spec * 1.8;
    let flick = 0.85 + 0.15 * vnoise(wp * 30.0 + vec2f(post.simTime * 0.7, 0.0));
    lit += vec3f(1.0, 0.38, 0.08) * (0.01 + 0.32 * s.z) * fuel * flick;
    if ((flags & 2u) != 0u) { lit = lit * 1.4 + vec3f(0.05, 0.04, 0.02); }
    return lit * c.a * 1.3;
  }
  // each kind of grain is its own material (mineralSurf): glass (quartz, diatoms, spicules) is crisp
  // and bright where light leaves it, a mafic prism glossy, chalk and shell matte, worn sand frosted
  let mat = (flags >> 3u) & 7u;
  let glass = mat == 0u || mat == 5u || mat == 7u;
  let bio = mat >= 4u;
  // a little surface relief up close, least on glass and on skeletons, which carry their own
  let relief = fine * select(select(1.0, 0.3, bio), 0.0, glass || mat == 2u) * (0.35 * vec2f(vnoise(wp * 40.0) - 0.5, vnoise(wp * 40.0 + 7.3) - 0.5)
    + 0.25 * vec2f(vnoise(wp * 140.0) - 0.5, vnoise(wp * 140.0 + 3.1) - 0.5));
  let n = normalize(vec3f(-s.xy + relief, 1.0));
  // a low, raking light, so each grain's form shows
  let light = normalize(vec3f(-0.55, -0.65, 0.5));
  let diffuse = max(dot(n, light), 0.0);
  let hv = max(dot(n, normalize(light + vec3f(0.0, 0.0, 1.0))), 0.0);
  let tuck = 1.0 - 0.55 * s.z * s.z;
  // mineral grains are mottled and veined well before their fine relief resolves
  let mid = smoothstep(25.0, 90.0, ppu) * select(1.0, 0.4, glass || bio);
  var col = c.rgb * (1.0 + 0.12 * (vnoise(wp * 6.0) - 0.5) * select(1.0, 0.4, glass || bio) + (0.12 * mid + 0.18 * fine * select(1.0, 0.4, glass || bio)) * (vnoise(wp * 18.0) - 0.5)
    + 0.16 * mid * (vnoise(wp * 47.0 + 3.7) - 0.5));
  if (fine > 0.0 && mat == 3u) {
    if ((flags & 1u) != 0u) {
      // reef chalk: pits of varied size gathered in patches, shadowed on the lit side, a lit rim opposite
      let pores = worley(wp * 55.0);
      let size = 0.04 + 0.14 * hash12(floor(wp * 55.0 + pores.zw)) * hash12(floor(wp * 55.0 + pores.zw) + 3.3);
      let pit = (1.0 - smoothstep(size * 0.7, size, pores.x)) * fine * smoothstep(0.3, 0.65, vnoise(wp * 5.0));
      let side = dot(normalize(pores.zw + vec2f(1e-5)), normalize(light.xy));
      col *= 1.0 + pit * (0.35 * side - 0.3);
    } else {
      // frosted: the odd pit catches the light
      let gl = worley(wp * 120.0);
      col += col * 0.7 * fine * (1.0 - smoothstep(0.0, 0.12, gl.x)) * step(0.88, hash12(floor(wp * 120.0 + gl.zw)));
    }
  }
  var lit: vec3f;
  if (glass) {
    // glass: dim where it faces you, bright toward its rim, where light that went in comes out on
    // the side away from the lamp, and a sharp white highlight
    let fres = 1.0 - n.z;
    let exitL = max(dot(normalize(n.xy + vec2f(1e-5)), -normalize(light.xy)), 0.0) * fres;
    lit = col * (0.25 + 0.75 * diffuse / (0.35 + diffuse) + 0.3 * exitL + 0.25 * fres) * tuck + vec3f(0.95, 0.97, 1.0) * pow(hv, 80.0) * 0.08 * (0.4 + 0.6 * vnoise(wp * 30.0));
  } else if (mat == 2u) {
    lit = col * (0.2 + 0.85 * diffuse) * tuck + vec3f(0.22) * pow(hv, 40.0);
  } else {
    let chalk = mat == 1u || mat == 4u || mat == 6u;
    lit = col * (select(0.15 + 1.0 * diffuse, 0.4 + 1.15 * diffuse, chalk)) * tuck + vec3f(select(0.25, 0.08, chalk || (flags & 1u) != 0u)) * pow(hv, 28.0) * dot(col, vec3f(0.33));
  }
  if ((flags & 2u) != 0u) { lit = lit * 1.5 + vec3f(0.05, 0.04, 0.02) + vec3f(0.35, 0.3, 0.2) * smoothstep(0.7, 1.0, s.z); }
  return lit * c.a * 1.3;
}

@fragment fn fsDown(i: VO) -> @location(0) vec4f {
  let h = 1.0 / vec2f(textureDimensions(src));
  var c = tap(i.uv) * 4.0;
  c += tap(i.uv - h);
  c += tap(i.uv + h);
  c += tap(i.uv + vec2f(h.x, -h.y));
  c += tap(i.uv - vec2f(h.x, -h.y));
  return vec4f(c / 8.0, 0.0);
}

@fragment fn fsUp(i: VO) -> @location(0) vec4f {
  let h = 0.5 / vec2f(textureDimensions(src));
  var c = tap(i.uv + vec2f(-2.0 * h.x, 0.0));
  c += tap(i.uv + vec2f(-h.x, h.y)) * 2.0;
  c += tap(i.uv + vec2f(0.0, 2.0 * h.y));
  c += tap(i.uv + vec2f(h.x, h.y)) * 2.0;
  c += tap(i.uv + vec2f(2.0 * h.x, 0.0));
  c += tap(i.uv + vec2f(h.x, -h.y)) * 2.0;
  c += tap(i.uv + vec2f(0.0, -2.0 * h.y));
  c += tap(i.uv + vec2f(-h.x, -h.y)) * 2.0;
  return vec4f(c / 12.0, 0.0);
}

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

${MICRO_FNS}
// Random 0–3 objects per slot, full-extent centres and a 2x2 nearest-slot
// lookup. Rotation, shear, continuous sizes and clumpy domain warping erase
// the grid. Integer torus winding vectors preserve the irrational-angle
// lattice across world wraps; inverse mapping canonicalises hash addresses.
fn microGrain(wp: vec2f, spacing: f32, ppu: f32, octave: f32, depth: f32, cycle: f32) -> vec4f {
  if (spacing * 1.55 * 0.075 * ppu <= 0.6) { return vec4f(0.0); }
  let L = microLattice(spacing, octave, depth);
  let world = L.world;
  let lattice = L.lattice;
  let inverse = L.inverse;
  let noise = microNoise(wp / world * L.patchCells, L.patchCells);
  let density = smoothstep(0.18, 0.82, noise.z);
  let abundance = mix(0.45, 1.0, density);
  let p = lattice * (wp / world) + (noise.xy - 0.5) * 1.3 + L.offset;
  let base = floor(p - 0.5);
  var grains = vec4f(0.0);
  for (var y = 0; y < 2; y++) {
    for (var x = 0; x < 2; x++) {
      let slot = base + vec2f(f32(x), f32(y));
      let canonical = round(slot - lattice * floor(inverse * slot + 0.000001));
      let seed = canonical + vec2f(octave * 71.0 + cycle * 37.1, cycle * 91.7);
      let count = u32(microHash(seed).w * 3.999);
      for (var object = 0u; object < count; object++) {
        let h = microHash(seed + f32(object) * vec2f(123.3, 217.7) + 13.7);
        // Smooth probabilistic occupancy avoids clipping a body where the
        // coarse density field crosses a threshold.
        let occupied = smoothstep(h.w - 0.12, h.w + 0.12, density) * density;
        if (occupied <= 0.0) { continue; }
        var q = p - slot - h.xy;
        if (dot(q, q) > 0.25) { continue; }
        q -= 0.012 * sin(vec2f(post.simTime * 0.53, post.simTime * 0.41) + h.yz * TAU);
        grains += microBody(q, h, spacing, ppu, depth, abundance * occupied);
      }
    }
  }
  return grains;
}

// mud: the murk lying between the focal plane and the soft plane, which it veils
fn pondMicro(c: vec3f, hdr: vec3f, cam: vec2f, offset: vec2f, renderPPU: f32, ppu: f32, mud: f32) -> vec3f {
  // The main view specialises this away below the reveal threshold, avoiding
  // register/stack overhead from the deep-zoom shader even on software GPUs.
  if (!MICRO_SUSPENSION) { return c; }
  // Uniform early-out: no hashes, shapes or time work at ordinary zoom. The
  // fit threshold also keeps the default view unchanged on very small worlds.
  let start = max(80.0, 2.0 * max(post.res.x / post.world.x, post.res.y / post.world.y));
  if (ppu <= start) { return c; }
  let delta = offset / renderPPU;
  let wp = cam + delta;
  let velocity = postFlowAt(wp, post.simTime);
  let reveal = smoothstep(start, start * 2.0, ppu);
  var grains = vec4f(0.0);
  // Complementary triangle windows sum to one; each field is invisible at
  // its reset. New cycle seeds read as suspension entering the focal plane.
  for (var phase = 0u; phase < 2u; phase++) {
    let clock = post.simTime / 4.0 + f32(phase) * 0.5;
    let age = fract(clock);
    let weight = 1.0 - abs(2.0 * age - 1.0);
    if (weight <= 0.001) { continue; }
    let tau = age * 4.0;
    // Midpoint backtrace also follows changing waves and curved streamlines.
    // A current-time Euler projection adds tau * dv/dt to apparent velocity,
    // which can move dust sideways relative to matter near a slow-flow node.
    let back = postFlowAt(wp - velocity * (tau * 0.5), post.simTime - tau * 0.5) * tau;
    let cycle = floor(clock) + f32(phase) * 131.0;
    var field = microGrain(cam * 0.72 + delta - back * 0.72, 0.055, ppu, 0.0, 0.72, cycle) * (1.0 - 0.6 * mud);
    field += microGrain(wp - back, 0.035, ppu, 1.0, 1.0, cycle);
    field += microGrain(wp - back, 0.008, ppu, 2.0, 1.0, cycle);
    grains += field * weight;
  }
  let behind = reveal / (1.0 + 24.0 * max(hdr.r, max(hdr.g, hdr.b)));
  // relief: in-focus specks have sharp edges, lit on the side toward the light; soft defocus has none
  let emboss = -dot(vec2f(dpdx(grains.a), dpdy(grains.a)), TO_LIGHT);
  return max(vec3f(0.0), c * (1.0 - grains.a * behind) + (grains.rgb + vec3f(0.006, 0.0065, 0.007) * emboss) * behind);
}

// One channel of microNoise's periodic value noise, for a quarter of the hashing.
fn valueNoise(p: vec2f, period: vec2f) -> f32 {
  let cell = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = cell - period * floor(cell / period);
  let b = (cell + 1.0) - period * floor((cell + 1.0) / period);
  return mix(mix(hash12(a), hash12(vec2f(b.x, a.y)), u.x), mix(hash12(vec2f(a.x, b.y)), hash12(b), u.x), u.y);
}

// ------------------------------------------------------------ optics
// What a camera on a microscope adds to the specimen. Except for the murk in the water these are
// fixed to the screen, so they stay put as the view pans. post.optics scales them all; 0 is bare.

// The objective's image at uv; q is the offset from the optical axis in half-heights, wp the world
// point. Lateral chromatic aberration pulls red and blue apart toward the edge of the field. Near the
// rim the image softens (field curvature) and, at high magnification, the shallow focus loses
// whatever lies above or below the focal plane there: cells come in and out of focus as they move.
fn lensScene(uv: vec2f, q: vec2f, wp: vec2f, pos: vec2f, k: f32) -> vec3f {
  let r2 = dot(q, q);
  let px = k * post.res.y / 1000.0 / post.res;
  let ca = q * r2 * 0.2 * px;
  var c = vec3f(scene(uv + ca).r, scene(uv).g, scene(uv - ca).b);
  let rim = smoothstep(1.0, 4.2, r2);
  var blur = rim * 1.5;
  let start = max(80.0, 2.0 * max(post.res.x / post.world.x, post.res.y / post.world.y));
  if (rim > 0.0 && post.ppu > start) {
    let cells = max(vec2f(1.0), round(post.world / 2.5));
    let drift = vec2f(0.0, post.simTime * 0.004);
    // focused on the middle of the view, as a microscopist keeps what they watch sharp
    let depth = valueNoise(wp / post.world * cells + drift, cells) - valueNoise(post.cam / post.world * cells + drift, cells);
    blur += rim * smoothstep(0.08, 0.35, abs(depth)) * smoothstep(start, start * 4.0, post.ppu) * 4.5;
  }
  if (blur * k > 0.3) {
    // eight taps on a disc, turned at random per pixel; the sensor's grain hides the pattern
    let turn = hash12(pos) * TAU;
    var b = vec3f(0.0);
    for (var t = 0; t < 8; t++) {
      let a = turn + f32(t) * 2.39996;
      b += scene(uv + vec2f(cos(a), sin(a)) * sqrt((f32(t) + 0.5) / 8.0) * blur * px);
    }
    c = mix(c, b / 8.0, smoothstep(0.3, 1.5, blur * k));
  }
  return c;
}

// Dust on the optics, far out of focus: soft discs, each with a brighter diffraction rim.
fn opticDust(q: vec2f) -> f32 {
  // only out toward the edge of the field, where the eyepiece's dust is in the light path
  let edge = smoothstep(1.1, 1.9, length(q));
  if (edge <= 0.0) { return 0.0; }
  let g = q * 2.2;
  let base = floor(g);
  var dust = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let cell = base + vec2f(f32(x), f32(y));
      let h = microHash(cell + 41.0);
      if (h.w < 0.55) { continue; }
      let d = length(g - cell - h.xy) / mix(0.15, 0.5, h.z);
      dust += (1.0 - smoothstep(0.75, 1.0, d)) * (0.4 + 0.6 * smoothstep(0.4, 0.92, d)) * mix(0.4, 1.0, h.y);
    }
  }
  return dust * edge;
}

// Clouds of fine mud suspended in the water, in flocs of every size, a little below the cells and
// above pondMicro's soft plane: they pan at MUD_DEPTH of the focal plane's speed. The currents carry
// and shear them; each generation gathers out of a blur, sharpens and dissolves again while the next
// gathers elsewhere (two crossfaded generations, as in pondMicro). delta is the world offset from
// the view's centre.
const MUD_DEPTH = 0.85;
fn murk(cam: vec2f, delta: vec2f) -> f32 {
  let world = post.world * MUD_DEPTH;
  let cells = max(vec2f(1.0), round(world / 4.0));
  let velocity = postFlowAt(cam + delta, post.simTime);
  var sum = 0.0;
  for (var phase = 0u; phase < 2u; phase++) {
    let clock = post.simTime / 24.0 + f32(phase) * 0.5;
    let age = fract(clock);
    let weight = 1.0 - abs(2.0 * age - 1.0);
    let tau = age * 24.0;
    let back = postFlowAt(cam + delta - velocity * (tau * 0.5), post.simTime - tau * 0.5) * tau;
    let gen = floor(clock) * 2.0 + f32(phase);
    let u = (cam * MUD_DEPTH + delta - back * MUD_DEPTH) / world * cells + vec2f(gen * 7.31, gen * 3.17);
    let density = valueNoise(u, cells) * 0.35 + valueNoise(u * 4.0, cells * 4.0) * 0.3
      + valueNoise(u * 16.0, cells * 16.0) * 0.2 + valueNoise(u * 64.0, cells * 64.0) * 0.15;
    let width = mix(0.2, 0.08, weight);
    sum += smoothstep(0.58 - width, 0.58 + width, density) * weight;
  }
  return sum;
}

// The main view's murk, at a quarter of its resolution: it is soft, and costly per pixel.
@fragment fn fsMurk(i: VO) -> @location(0) vec4f {
  return vec4f(murk(post.cam, (i.uv - 0.5) * post.res / post.ppu), 0.0, 0.0, 1.0);
}

// The camera's sensor: read noise in the dark, shot noise growing with light, a little of it in
// colour. Display space, after the gamma curve.
fn sensor(c: vec3f, pos: vec2f, k: f32) -> vec3f {
  let t = fract(post.time) * 91.7;
  let n = vec3f(hash12(pos + t), hash12(pos.yx + t * 1.37 + 11.3), hash12(pos + t * 0.71 + 27.1)) - 0.5;
  let lum = dot(c, vec3f(0.299, 0.587, 0.114));
  return c + (n.g + (n - n.g) * 0.35) * (0.016 + 0.03 * sqrt(max(lum, 0.0))) * k;
}

fn tonemap(hdrIn: vec3f) -> vec3f {
  let l = dot(hdrIn, vec3f(0.2126, 0.7152, 0.0722));
  let tl = l * (1.0 + l / 6.0) / (1.0 + l);
  var c = hdrIn * (tl / max(l, 1e-5));
  let m = max(c.r, max(c.g, c.b));
  if (m > 1.0) { c = mix(c / m, vec3f(1.0), clamp((m - 1.0) * 0.35, 0.0, 1.0)); }
  return c;
}

// The main view's micro-suspension, drawn speck by speck into microTex (MICRO_WGSL) and laid over
// the image here as pondMicro does: behind what is lit, embossed toward the light.
fn pondSpecks(c: vec3f, hdr: vec3f, pos: vec2f) -> vec3f {
  if (!MICRO_SUSPENSION) { return c; }
  let start = max(80.0, 2.0 * max(post.res.x / post.world.x, post.res.y / post.world.y));
  if (post.ppu <= start) { return c; }
  let reveal = smoothstep(start, start * 2.0, post.ppu);
  let last = vec2i(textureDimensions(microTex)) - 1;
  let ip = min(vec2i(pos), last);
  let grains = textureLoad(microTex, ip, 0);
  let ax = textureLoad(microTex, min(ip + vec2i(1, 0), last), 0).a;
  let ay = textureLoad(microTex, min(ip + vec2i(0, 1), last), 0).a;
  let behind = reveal / (1.0 + 24.0 * max(hdr.r, max(hdr.g, hdr.b)));
  let emboss = -dot(vec2f(ax - grains.a, ay - grains.a), TO_LIGHT);
  return max(vec3f(0.0), c * (1.0 - grains.a * behind) + (grains.rgb + vec3f(0.006, 0.0065, 0.007) * emboss) * behind);
}

// Smooth noise carried by the currents (two generations crossfading, as the murk), so haze drifts
// with the water instead of sliding over it. Two channels, -0.5..0.5, at about scale per world unit.
fn flowNoise(wp: vec2f, scale: f32) -> vec2f {
  var n = vec2f(0.0);
  for (var phase = 0u; phase < 2u; phase++) {
    let clock = post.simTime / 2.5 + f32(phase) * 0.5;
    let age = fract(clock);
    let back = postFlowAt(wp, post.simTime) * (age * 2.5);
    let q = (wp - back) * scale + vec2f(fract(floor(clock) * 0.618034 + f32(phase) * 0.37) * 61.0, 3.7);
    n += (vec2f(vnoise(q), vnoise(q + 9.7)) - 0.5) * (1.0 - abs(2.0 * age - 1.0));
  }
  return n;
}

// The water's temperature at world point p, bilinear between cell centres, and its gradient.
fn waterCell(x: i32, y: i32) -> f32 {
  let g = vec2i(post.world);
  return heatField[${MAX_CELLS}u + u32(((y % g.y) + g.y) % g.y) * u32(g.x) + u32(((x % g.x) + g.x) % g.x)];
}
fn waterAt(p: vec2f) -> vec3f {
  let u = p - 0.5;
  let i = vec2i(floor(u));
  let t = u - floor(u);
  let a = waterCell(i.x, i.y);
  let b = waterCell(i.x + 1, i.y);
  let c = waterCell(i.x, i.y + 1);
  let d = waterCell(i.x + 1, i.y + 1);
  return vec3f(mix(mix(a, b, t.x), mix(c, d, t.x), t.y), mix(b - a, d - c, t.y), mix(c - a, d - b, t.x));
}
// A thermal camera's false colour: deep blue, teal, amber, white.
fn heatRamp(u: f32) -> vec3f {
  let a = mix(vec3f(0.02, 0.04, 0.18), vec3f(0.0, 0.42, 0.48), smoothstep(0.0, 0.35, u));
  let b = mix(a, vec3f(1.0, 0.52, 0.12), smoothstep(0.35, 0.7, u));
  return mix(b, vec3f(1.0, 0.95, 0.82), smoothstep(0.75, 1.0, u));
}

@fragment fn fsComposite(i: VO) -> @location(0) vec4f {
  let k = post.optics;
  let q = (i.pos.xy - post.res * 0.5) / (post.res.y * 0.5);
  let wp = post.cam + (i.pos.xy - post.res * 0.5) / post.ppu;
  var water = vec3f(post.heat.x, 0.0, 0.0);
  var uv = i.uv;
  if (post.heatVis >= 0.0) {
    water = waterAt(wp - post.world * floor(wp / post.world));
    // schlieren: with the heat map on Shimmer, warm water bends the light passing through it like the
    // air over a hot road, faintly, wherever warmth changes (around colonies and framboids, at
    // fronts), the ripples carried by the current
    if (post.heatVis > 0.5 && post.heatVis < 1.5) {
      let shift = water.yz * flowNoise(wp, 7.0) * 2.0;
      uv += shift * min(1.0, 3.0 / max(length(shift), 1e-4)) / post.res;
    }
  }
  var hdr = boulder(uv, wp, post.ppu);
  if (k > 0.0) { hdr += lensScene(uv, q, wp, i.pos.xy, k); } else { hdr += scene(uv); }
  let bl = textureSampleLevel(bloomTex, samp, uv, 0.0).rgb;
  hdr = (hdr + bl * post.bloom) * post.exposure;
  var T = 0.0;
  if (post.tideVis > 0.0) {
    T = tideAt(wp, post.world, post.simTime, post.tide, post.tidePh) * post.season;
    if (post.tideVis < 1.5) { hdr += vec3f(0.003, 0.010, 0.014) * T; }
  }
  var c = tonemap(hdr);
  if (post.tideVis > 1.5) {
    let L = post.ambient + (1.0 - post.ambient) * T;
    let ramp = mix(mix(vec3f(0.03, 0.04, 0.16), vec3f(0.0, 0.42, 0.5), smoothstep(0.0, 0.5, L)), vec3f(1.0, 0.86, 0.32), smoothstep(0.45, 1.0, L));
    c = mix(c, ramp, 0.42);
    let band = L * 10.0;
    let w = fwidth(band);
    let contour = 1.0 - smoothstep(0.0, w * 1.2, min(fract(band), 1.0 - fract(band)));
    c += vec3f(0.22) * contour;
  }
  if (post.heatVis > 1.5) {
    // the thermal camera: false colour over the map's span (drawn as isotherms alone over a full
    // light map), with an isotherm every 2°
    if (post.tideVis < 1.5) { c = mix(c, heatRamp(clamp((water.x - post.heat.y) / (post.heat.z - post.heat.y), 0.0, 1.0)), 0.4); }
    let band = water.x * 0.5;
    let w = fwidth(band);
    let iso = 1.0 - smoothstep(0.0, w * 1.2, min(fract(band), 1.0 - fract(band)));
    c += vec3f(1.0, 0.7, 0.4) * 0.16 * iso;
  }
  let uq = i.uv - 0.5;
  let v = clamp(1.0 - dot(uq, uq) * 1.1, 0.0, 1.0);
  var bg = mix(vec3f(0.0015, 0.0012, 0.0035), vec3f(0.0055, 0.0045, 0.011), v);
  // the lamp is never quite centred: brighter and warmer toward a hotspot off the axis
  let hs = q - vec2f(0.35, -0.2);
  let lamp = exp(-dot(hs, hs) * 0.3);
  let m = textureSampleLevel(murkTex, samp, i.uv, 0.0).r * k;
  // the mud lies behind the cells: what is lit in the focal plane hides it
  let behind = 1.0 / (1.0 + 24.0 * max(hdr.r, max(hdr.g, hdr.b)));
  bg = mix(bg, bg * mix(vec3f(0.85, 0.88, 0.94), vec3f(1.12, 1.06, 1.0), lamp), k) + vec3f(0.0045, 0.004, 0.0015) * m * behind;
  c = c * mix(0.72, 1.0, v) * mix(1.0, mix(0.88, 1.05, lamp), k) + bg;
  c = pondSpecks(c, hdr, i.pos.xy);
  // the round field stop of the eyepiece clips the corners of the camera's frame
  let corner = length(vec2f(post.res.x / post.res.y, 1.0));
  c *= mix(1.0, 1.0 - 0.85 * smoothstep(corner * 0.78, corner * 1.02, length(q)), k);
  var dust = 0.0;
  if (k > 0.0) { dust = opticDust(q) * k; }
  c = c * (1.0 - 0.12 * dust) + vec3f(0.003, 0.0031, 0.0036) * dust;
  c = pow(c, vec3f(1.0 / 2.2));
  c += (hash12(i.pos.xy + fract(post.time) * 91.7) - 0.5) / 255.0 * 2.0;
  return vec4f(sensor(c, i.pos.xy, k), 1.0);
}

// loupe: a circular lens composited over the main view
struct LV { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vsLoupe(@builtin(vertex_index) vi: u32) -> LV {
  let corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let rr = loupe.radius * 1.2 + 4.0;
  let px = loupe.center + c * rr;
  var o: LV;
  o.pos = vec4f(px.x / loupe.res.x * 2.0 - 1.0, 1.0 - px.y / loupe.res.y * 2.0, 0.0, 1.0);
  o.uv = c * rr / loupe.radius;
  return o;
}

// The loupe's view through its lens, at r in its texture's half-widths.
fn loupeScene(r: vec2f) -> vec3f {
  let tuv = r * 0.5 + 0.5;
  return scene(tuv) + boulder(tuv, microView.cam + r * microView.res * 0.5 / microView.ppu, microView.ppu);
}

@fragment fn fsLoupe(i: LV) -> @location(0) vec4f {
  let k = post.optics;
  let d = length(i.uv);
  if (d > 1.035) {
    // the lens casts a soft shadow, away from the light
    if (k <= 0.0) { discard; }
    let ds = length(i.uv + TO_LIGHT * 0.06);
    return vec4f(0.0, 0.0, 0.0, 0.45 * k * (1.0 - smoothstep(0.98, 1.2, ds)) * loupe.strength);
  }
  // a magnifier's barrel distortion: true scale at the centre, the field squeezed toward the rim,
  // where red and blue bend apart and the image softens
  let d2 = d * d;
  let r = i.uv * (1.0 + k * (LOUPE_FIELD - 1.0) * d2) / LOUPE_FIELD;
  let ca = r * d2 * d2 * 0.015 * k;
  var hdr = vec3f(loupeScene(r + ca).r, loupeScene(r).g, loupeScene(r - ca).b);
  let soft = d2 * d2 * k;
  if (soft > 0.05) {
    let o = vec2f(2.0 * soft / microView.res.x);
    let b = loupeScene(r + o) + loupeScene(r - o) + loupeScene(r + vec2f(o.x, -o.y)) + loupeScene(r - vec2f(o.x, -o.y));
    hdr = mix(hdr, b * 0.25, 0.6 * soft);
  }
  hdr *= post.exposure;
  var m = 0.0;
  if (k > 0.0) { m = murk(microView.cam, r * microView.res * 0.5 / microView.ppu) * k; }
  let behind = 1.0 / (1.0 + 24.0 * max(hdr.r, max(hdr.g, hdr.b)));
  var c = tonemap(hdr) + vec3f(0.006, 0.006, 0.012) + vec3f(0.0045, 0.004, 0.0015) * m * behind;
  c = pondMicro(c, hdr, microView.cam, r * microView.res * 0.5, microView.ppu, loupe.ppu, m);
  c = pow(c, vec3f(1.0 / 2.2));
  let vign = smoothstep(1.0, 0.75, d);
  c *= mix(mix(0.55, 0.75, k), 1.0, vign);
  if (k > 0.0) {
    // glass: a soft glint toward the light, and a rim lit on its near side, shadowed on its far side
    let toward = dot(i.uv / max(d, 1e-4), TO_LIGHT);
    let g = i.uv - TO_LIGHT * 0.55;
    let glint = exp(-dot(g, g) * 9.0) * 0.05 + exp(-pow((d - 0.9) * 22.0, 2.0)) * smoothstep(0.55, 0.95, toward) * 0.12;
    c += vec3f(0.95, 0.97, 1.0) * glint * k;
    c = sensor(c, i.pos.xy, k);
  }
  let rimCol = mix(vec3f(0.93, 0.9, 0.97), mix(vec3f(0.2, 0.2, 0.24), vec3f(0.97, 0.95, 1.0), 0.5 + 0.5 * dot(i.uv / max(d, 1e-4), TO_LIGHT)), k);
  let ring = smoothstep(0.012 + 0.012 * k, 0.0, abs(d - 1.0)) * 0.85;
  c = mix(c, rimCol, ring);
  let a = select(1.0, smoothstep(1.035, 1.0, d), d > 1.0);
  return vec4f(c, a * loupe.strength);
}

// trails: carry last frame's image along with the camera, then fade it
@fragment fn fsReproj(i: VO) -> @location(0) vec4f {
  let u = (i.uv - 0.5) * rp.scale + 0.5 + rp.shift;
  if (u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0) { return vec4f(0.0); }
  // trails fade coverage with light, so faded overlaps stay averaged
  return textureSampleLevel(src, samp, u, 0.0) * rp.k;
}

@fragment fn fsPlain(i: VO) -> @location(0) vec4f {
  let wp = microView.cam + (i.uv - 0.5) * microView.res / microView.ppu;
  let hdr = (scene(i.uv) + boulder(i.uv, wp, microView.ppu)) * post.exposure;
  var c = tonemap(hdr) + vec3f(0.006, 0.005, 0.012);
  c = pondMicro(c, hdr, microView.cam, i.pos.xy - microView.res * 0.5, microView.ppu, microView.ppu, 0.0);
  return vec4f(pow(c, vec3f(1.0 / 2.2)), 1.0);
}
`;

// The main view's micro-suspension, speck by speck. pondMicro searches every pixel's neighbouring
// lattice slots in each octave and phase; here a compute pass visits each slot near the view once,
// keeps the objects pondMicro would draw and places each on screen, and every speck is then one
// tight quad whose fragments run only microBody, additively into microTex. The same bodies, in the
// same clumps, drifting with the same currents, though not at pondMicro's exact positions.
export const MICRO_SPECKS = 262144;
export const MICRO_WGSL = COMMON + POST_STRUCT + /* wgsl */ `
struct MicroU {
  lists: array<vec4i, 6>, // first slot x, y; slots across, down
  phases: array<vec4f, 6>, // phase weight, tau, cycle, octave
  start: array<vec4u, 2>, // first thread of each list
  total: u32, nLists: u32, ppu: f32, cap: u32,
  res: vec2f, cam: vec2f,
};
// center and quad axes in pixels; extent: the quad's half-size in slot units; gain: weight × abundance × occupancy
struct Speck { center: vec2f, ax: vec2f, ay: vec2f, extent: f32, gain: f32, h: vec4f, spacing: f32, depth: f32, p0: f32, p1: f32 };
@group(0) @binding(0) var<uniform> post: Post;
@group(0) @binding(1) var<uniform> mu: MicroU;
@group(0) @binding(2) var<storage, read_write> specks: array<Speck>;
@group(0) @binding(3) var<storage, read_write> args: array<atomic<u32>, 4>;
@group(0) @binding(4) var<storage, read> specksR: array<Speck>;
@group(0) @binding(5) var samp: sampler;
@group(0) @binding(6) var murkTex: texture_2d<f32>;
${MICRO_FNS}
// how far the current carries a speck over tau seconds (pondMicro's backtrace)
fn backtrace(wp: vec2f, tau: f32) -> vec2f {
  let velocity = postFlowAt(wp, post.simTime);
  return postFlowAt(wp - velocity * (tau * 0.5), post.simTime - tau * 0.5) * tau;
}

@compute @workgroup_size(64) fn microSpecks(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let id = gid.x + gid.y * nw.x * 64u;
  if (id >= mu.total) { return; }
  var k = 0u;
  for (var j = 1u; j < mu.nLists; j++) { if (id >= mu.start[j / 4u][j % 4u]) { k = j; } }
  let list = mu.lists[k];
  let ph = mu.phases[k];
  let local = id - mu.start[k / 4u][k % 4u];
  let slot = vec2f(f32(list.x + i32(local % u32(list.z))), f32(list.y + i32(local / u32(list.z))));
  let octave = ph.w;
  let tau = ph.y;
  let cycle = ph.z;
  let spacing = select(select(0.008, 0.035, octave < 1.5), 0.055, octave < 0.5);
  let depth = select(1.0, 0.72, octave < 0.5);
  let ppu = mu.ppu;
  let L = microLattice(spacing, octave, depth);
  let canonical = round(slot - L.lattice * floor(L.inverse * slot + 0.000001));
  let seed = canonical + vec2f(octave * 71.0 + cycle * 37.1, cycle * 91.7);
  let count = u32(microHash(seed).w * 3.999);
  for (var object = 0u; object < count; object++) {
    let h = microHash(seed + f32(object) * vec2f(123.3, 217.7) + 13.7);
    // microBody's own culls, which depend only on the object and the zoom
    let size = mix(0.55, 1.55, h.w);
    if (smoothstep(0.6, 1.6, spacing * size * 0.075 * ppu) <= 0.0) { continue; }
    if (depth >= 1.0 && (0.05 + h.y * 0.025) * microWidth(u32(h.z * 8.0)) * spacing * size * ppu <= 0.45) { continue; }
    // Where the body floats: its lattice point, displaced by the domain warp and then carried by the
    // current. Each term is smooth in time, so a speck glides; generations fade in and out (weight).
    let jitter = 0.012 * sin(vec2f(post.simTime * 0.53, post.simTime * 0.41) + h.yz * TAU);
    let home = L.world * (L.inverse * (slot + h.xy + jitter - L.offset));
    let n = microNoise(home / L.world * L.patchCells, L.patchCells);
    let density = smoothstep(0.18, 0.82, n.z);
    let occupied = smoothstep(h.w - 0.12, h.w + 0.12, density) * density;
    if (occupied <= 0.0) { continue; }
    let xin = home - L.world * (L.inverse * ((n.xy - 0.5) * 1.3));
    let wp = xin + mu.cam * (1.0 - depth) + backtrace(xin, tau) * depth;
    let Ji = mat2x2f(L.inverse[0] * L.world, L.inverse[1] * L.world);
    // the body reaches about 0.25 of its size in q, plus its antialiasing; pondMicro skips slots beyond 0.5
    let aa = 0.65 / (spacing * size * ppu);
    let extent = min((0.26 + 1.2 * aa) * size, 0.52);
    var sp: Speck;
    sp.center = (wp - mu.cam) * ppu + mu.res * 0.5;
    sp.ax = Ji[0] * (extent * ppu);
    sp.ay = Ji[1] * (extent * ppu);
    let reach = abs(sp.ax) + abs(sp.ay);
    if (any(sp.center + reach < vec2f(0.0)) || any(sp.center - reach > mu.res)) { continue; }
    sp.extent = extent;
    sp.gain = mix(0.45, 1.0, density) * occupied * ph.x;
    sp.h = h;
    sp.spacing = spacing;
    sp.depth = depth;
    let at = atomicAdd(&args[1], 1u);
    if (at < mu.cap) { specks[at] = sp; }
  }
}

struct SV {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,
  @location(1) @interpolate(flat) h: vec4f,
  @location(2) @interpolate(flat) misc: vec3f, // spacing, depth, gain
};
@vertex fn vsSpeck(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> SV {
  var o: SV;
  o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
  if (ii >= mu.cap) { return o; }
  let s = specksR[ii];
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  let px = s.center + s.ax * corner.x + s.ay * corner.y;
  o.pos = vec4f(px.x / mu.res.x * 2.0 - 1.0, 1.0 - px.y / mu.res.y * 2.0, 0.0, 1.0);
  o.q = corner * s.extent;
  o.h = s.h;
  o.misc = vec3f(s.spacing, s.depth, s.gain);
  return o;
}
@fragment fn fsSpeck(i: SV) -> @location(0) vec4f {
  let j = 0.012 * sin(vec2f(post.simTime * 0.53, post.simTime * 0.41) + i.h.yz * TAU);
  let qp = i.q + j;
  if (dot(qp, qp) > 0.25) { return vec4f(0.0); }
  var g = microBody(i.q, i.h, i.misc.x, mu.ppu, i.misc.y, i.misc.z);
  // the soft plane lies below the mud, which veils it
  if (i.misc.y < 1.0) { g *= 1.0 - 0.6 * textureSampleLevel(murkTex, samp, i.pos.xy / mu.res, 0.0).r * post.optics; }
  return g;
}
`;
