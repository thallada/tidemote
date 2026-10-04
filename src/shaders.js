// WGSL for the Tidemote biosphere.
// Kinds: 0 silt, 1 glint, 2 husk, 3 stone, 4..1023 living genomes.
// Each living genome has up to three cell roles with their own signatures.

export const MAXK = 1024;
export const FIRST_LIFE = 4;
export const MAX_CELLS = 1 << 18;
export const META_SLOT = 16;
export const META_POP = META_SLOT + MAXK;
export const META_DEATH = META_POP + MAXK;
export const META_ENERGY = META_DEATH + 64;
export const META_CLAIM = META_ENERGY + 64;
// Energy ledger per diet guild, in thousandths: light, glint, plant bites, husks, kills, upkeep, children.
export const ENERGY_SLOTS = ['light', 'glint', 'plant', 'husk', 'flesh', 'upkeep', 'children'];
export const P_BYTES = 40;
export const PICK_WORDS = 12; // Particle's 10 words, then two partner IDs (NONE if absent).
export const G_BYTES = 192;
export const G_WORDS = 48;
export const LITE_BYTES = 32;

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
};

const f = (x) => {
  const s = String(x);
  return /[.eE]/.test(s) ? s : s + '.0';
};

const COMMON = /* wgsl */ `
const MAXK = ${MAXK}u;
const FIRST_LIFE = 4u;
const SILT = 0u;
const GLINT = 1u;
const HUSK = 2u;
const STONE = 3u;
const NONE = 0xffffffffu;
const MAX_CELLS = 262144u;
const META_SLOT = ${META_SLOT}u;
const META_POP = ${META_POP}u;
const META_DEATH = ${META_DEATH}u;
const META_ENERGY = ${META_ENERGY}u;
const META_CLAIM = ${META_CLAIM}u;
const TAU = 6.28318530718;

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
  adhesion: f32, calcify: f32, gp1: f32, gp2: f32,
};

fn roleOf(info: u32) -> u32 { return (info >> 4u) & 3u; }
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
`;

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
@group(0) @binding(13) var<storage, read_write> frameCtr: array<atomic<u32>, 8>;
// Grains of reef stone (not bedrock) in each grid cell, counted while binning.
@group(0) @binding(14) var<storage, read_write> stoneGrid: array<atomic<u32>>;
@group(0) @binding(15) var<storage, read_write> bondsNow: array<vec2u>;

const EAT_R = ${f(K.eatR)};
const LINK_R = ${f(K.linkR)};
const MAX_SCAN = ${K.maxScan | 0}u;
const DIET_MIN = ${f(K.dietMin)};

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
  g.parent = g.serial;
  g.serial = atomicAdd(&ledger[1], 1u) + 1u;
  g.born = sim.time;
  g.depth = g.depth + 1u;
  finalize(&g);
  genomes[slot] = g;
}

fn randomInto(slot: u32, s: ptr<function, u32>) {
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
      // Only x/y are read here; other invocations may reset their own bond slots.
      let action = intent[c - 1u].x;
      let act = action & 3u;
      let ck = (action >> 2u) & 1023u;
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
          p.energy -= ${f(K.bite)};
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
    if (p.kind == STONE && (p.info & 15u) != 0u) { atomicAdd(&stoneGrid[cell], 1u); }
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
  }
}

// ------------------------------------------------------------------- matter
@compute @workgroup_size(256)
fn matterMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= sim.count) { return; }
  var p = sortedFull[i];
  if (p.kind >= FIRST_LIFE) { return; }
  if (p.kind == STONE) {
    // stone stays put and wears away; its energy is the time it has left. Reef stone (bedrock has cause 0)
    // wears by its surroundings: loose grains fast and grains packed into a reef slowly, so rubble clears
    // and reefs stay solid, but a neighbourhood that is mostly reef wears fast (waves and borers on a reef
    // flat), so reefs grow as separate patches about as wide as that neighbourhood.
    var wear = 1.0;
    if ((p.info & 15u) != 0u) {
      let c = vec2i(clamp(floor(p.pos), vec2f(0.0), vec2f(sim.grid) - 1.0));
      let gw = i32(sim.grid.x);
      let gh = i32(sim.grid.y);
      let here = f32(atomicLoad(&stoneGrid[u32(c.y * gw + c.x)]));
      var region = 0.0;
      if (${f(K.regionWear)} > 0.0) {
        for (var dy = -${K.regionR | 0}; dy <= ${K.regionR | 0}; dy++) {
          for (var dx = -${K.regionR | 0}; dx <= ${K.regionR | 0}; dx++) {
            let x = (c.x + dx + gw) % gw;
            let y = (c.y + dy + gh) % gh;
            region += f32(atomicLoad(&stoneGrid[u32(y * gw + x)]));
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
      p.kind = SILT; p.energy = 0.0; p.age = 0.0;
      p.info = (p.info & 0xffffffc0u) | 7u;
    }
    parts[i] = p;
    return;
  }
  var s = pcg((p.id * 1664525u) ^ pcg(sim.frame * 2654435761u + sim.seed));
  // Brownian drift as a smooth random velocity that persists ~0.5 s (Ornstein-Uhlenbeck), scaled so
  // grains spread as far as independent per-frame kicks would, without visibly shaking up close
  let keep = exp(-sim.dt / 0.5);
  let kick = vec2f(rnd(&s) - 0.5, rnd(&s) - 0.5) * (${f(K.jitter)} * sqrt((1.0 - keep * keep) * sim.dt / (2.0 * 0.5)));
  // a fresh husk still carries its cell's velocity; cap it to the jitter's own scale so it doesn't coast
  let w = p.vel - flowAt(p.pos);
  let jit = w * (keep * min(1.0, 0.05 / max(length(w), 1e-6))) + kick;
  var vel = flowAt(p.pos) + jit;
  let pos = wrapPos(p.pos + vel * sim.dt);
  p.age += sim.dt;
  if (p.kind == SILT) {
    let T = tideAt(pos, sim.world, sim.time, sim.tide, sim.tidePh) * sim.season + 0.2 * sim.ambient;
    if (rnd(&s) < T * ${f(K.charge)} * sim.chargeMul * sim.dt) {
      p.kind = GLINT; p.energy = 1.0; p.age = 0.0;
      p.info = (p.info & 0xffffffc0u) | 5u;
    }
  } else if (p.kind == GLINT) {
    p.energy -= ${f(K.leak)} * sim.dt;
    if (p.energy < ${f(K.glintMin)}) {
      p.kind = SILT; p.energy = 0.0; p.age = 0.0;
      p.info = (p.info & 0xffffffc0u) | 6u;
    } else if (sim.abio > 0.0) {
      if (rnd(&s) < sim.abio) {
        let k = allocSlot(&s);
        if (k != NONE) {
          randomInto(k, &s);
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
    p.energy -= ${f(K.decay)} * sim.dt;
    if (p.energy < ${f(K.huskMin)}) {
      p.kind = SILT; p.energy = 0.0; p.age = 0.0;
      p.info = (p.info & 0xffffffc0u) | 4u;
    }
  }
  p.pos = pos;
  p.vel = vel;
  parts[i] = p;
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

@compute @workgroup_size(128)
fn lifeMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = livingList[gid.x];
  if (i == NONE) { return; }
  let p = sortedFull[i];
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
  let hungry = p.energy < g.reproE * ${f(K.sated)} && eatEff > 0.1;
  let canHunt = (g.dFlesh > DIET_MIN || g.dGlint > DIET_MIN) && hungry;
  let bonding = g.adhesion > ${f(K.adhMin)};
  var dn1 = vec2f(0.0);
  var dn2 = vec2f(0.0);

  var force = vec2f(0.0);
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
  var food = NONE; var foodScore = -1e9;
  var silt = NONE; var siltD = 1e9;
  var stoneF = vec2f(0.0);
  var stoneN = 0.0;
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
      if (qk >= FIRST_LIFE) {
        // a hungry forager lets other species inside its personal space so it can reach them
        if (x < beta) { fr = (x * invBeta - 1.0) * select(1.0, 0.15, canHunt && qk != p.kind); } else { fr = a * shape; }
        // hungry foragers are drawn toward the cells their diet favours
        if (canHunt && qk != p.kind && x >= beta) {
          fr += select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, (q.kr & (1u << 12u)) != 0u) * eatEff * ${f(K.hunt)} * shape;
        }
        crowd += (1.0 - x) * select(1.0, ${f(K.kinShade)}, bonding && qk == p.kind);
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
        if (canHunt && r < EAT_R && qk != p.kind) {
          let da = s0 - my0;
          let db = s1 - my1;
          if (dot(da, da) + dot(db, db) > ${f(K.kin)}) {
            // grazers crop plant cells; flesh-eaters hunt animals (and crop plants reluctantly)
            let plant = (q.kr & (1u << 12u)) != 0u;
            let pref = select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, plant);
            let sc = pref - r;
            if (pref > DIET_MIN && sc > foodScore) { foodScore = sc; food = j; }
          }
        }
      } else {
        fr = select(0.0, a * shape * ${f(K.matterPull)}, x >= beta);
        if (qk == STONE) {
          // stone is solid: it pushes cells out however hard they swim, and shelters those among it
          if (r < ${f(K.stoneR)}) { stoneF += d * ((r - ${f(K.stoneR)}) / (${f(K.stoneR)} * r)); }
          if (r < 0.5) { stoneN += 1.0; }
        } else {
          if (hungry && qk != SILT && x >= beta) {
            fr += select(g.dHusk, g.dGlint, qk == GLINT) * eatEff * ${f(K.forage)} * shape;
          }
          if (qk == SILT) { nutr += 1.0; }
          if (r < EAT_R) {
            if (qk == SILT) {
              if (r < siltD) { siltD = r; silt = j; }
            } else if (hungry) {
              let dv = select(g.dHusk, g.dGlint, qk == GLINT);
              let sc = dv - r;
              if (dv > DIET_MIN && sc > foodScore) { foodScore = sc; food = j; }
            }
          }
        }
      }
      force += d * (fr / r);
    }
    at -= len;
  }
  force *= stride; crowd *= stride; nutr *= stride; kinVel *= stride; kinN *= stride; stoneF *= stride; stoneN *= stride;

  let heavy = 1.0 - 0.7 * g.photo;
  let fr0 = pow(0.5, sim.dt / g.drag);
  var vel = p.vel * fr0 + force * (g.force * heavy * sim.dt);
  if (kinN > 0.0 && g.align > 0.0) {
    vel = mix(vel, kinVel / kinN, clamp(g.align * ${f(K.align)} * sim.dt, 0.0, 1.0));
  }
  // Persistent bonds pull on the partners' current positions, even outside the sampled scan.
  var bondF = vec2f(0.0);
  if (n1 != NONE) { bondF += dn1 * ((d1 - LINK_R * 0.55) / max(d1, 1e-4)); }
  if (n2 != NONE) { bondF += dn2 * ((d2 - LINK_R * 0.55) / max(d2, 1e-4)); }
  vel += bondF * (g.adhesion * ${f(K.bond)} * sim.dt);
  // stone is solid to everything but the calcifiers that build it, which settle on their own reef
  vel += stoneF * (${f(K.stoneWall)} * (1.0 - g.calcify) * sim.dt);
  let swim = g.swim * (1.0 - g.photo);
  if (swim > 0.0) {
    var dir = vel;
    if (dot(dir, dir) < 1e-6) {
      let a = rnd(&s) * TAU;
      dir = vec2f(cos(a), sin(a));
    }
    vel += normalize(dir) * swim * sim.dt;
  }
  let sp = length(vel);
  if (sp > sim.maxSpeed) { vel *= sim.maxSpeed / sp; }
  let pos = wrapPos(p.pos + (vel + flowAt(p.pos) * g.advect) * sim.dt);

  var col = unpack4x8unorm(p.col).rgb;
  if (wsum > 0.0) { col = mix(col, csum / wsum, ${f(K.colorMix)}); }
  col = mix(col, roleColor(g, role), ${f(K.baseMix)});

  let light = sim.ambient + (1.0 - sim.ambient) * tideAt(p.pos, world, sim.time, sim.tide, sim.tidePh) * sim.season;
  // photosynthesis needs minerals: silt within reach. Drifters ride along with their own (depleting)
  // water; anchored cells have fresh silt carried past them by the currents.
  let photoGain = g.photo * light * ${f(K.photo)} / (1.0 + crowd * ${f(K.shade)}) * (nutr / (nutr + ${f(K.nutrHalf)})) * (1.0 + ${f(K.nutrHalf)} / 20.0)
    * (1.0 + ${f(K.flowFeed)} * (1.0 - g.advect) * min(length(flowAt(p.pos)) / 0.2, 2.0));
  let bonds = select(0.0, 1.0, n1 != NONE) + select(0.0, 1.0, n2 != NONE);
  // cells packed among their own kind sicken (species-specific disease, Janzen-Connell); a body's bond partners do not count
  let kinCost = 1.0 + ${f(K.kinCrowd)} * max(0.0, kinN - bonds - ${f(K.kinFree)});
  let thrift = 1.0 - ${f(K.bodyThrift)} * 0.5 * bonds;
  let upkeep = g.metab * kinCost * thrift * (0.55 + 0.45 * clamp(p.energy / g.reproE, 0.0, 1.0));
  var E = p.energy + (photoGain - upkeep) * sim.dt;
  let dg = dietGuild(g);
  // light and upkeep flow every frame; the ledger samples them once a second per cell
  if (((sim.frame + p.id) % 60u) == 0u) {
    addEnergy(dg, 0u, photoGain * sim.dt * 60.0);
    addEnergy(dg, 5u, upkeep * sim.dt * 60.0);
  }
  var age = p.age + sim.dt;
  var act = 0u;
  var ck = 0u;
  var cr = 0u;
  var ce = 0.0;
  var info = p.info;
  if (E > g.reproE && silt != NONE) {
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
  } else if (food != NONE && ((sim.frame + p.id) % ${K.eatEvery | 0}u) == 0u
             && (sortedFull[food].kind < FIRST_LIFE
                 || ((sim.frame + p.id) / ${K.eatEvery | 0}u) % select(${K.killEvery | 0}u, ${K.biteEvery | 0}u, genomes[sortedFull[food].kind].photo > 0.4) == 0u)) {
    let fk = sortedFull[food].kind;
    let armored = fk >= FIRST_LIFE && rnd(&s) * (1.0 + ${f(K.armor)} * max(0.0, genomes[fk].adhesion - ${f(K.adhMin)})) > 1.0;
    let image = (info >> 6u) & 1023u;
    let unfamiliar = ${f(K.searchImage)} > 0.0 && fk >= FIRST_LIFE && image != 0u && image != fk && rnd(&s) < ${f(K.searchImage)};
    let unskilled = ${f(K.catchSkill)} > 0.0 && fk >= FIRST_LIFE && rnd(&s) >= min(1.0, eatEff * select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, genomes[fk].photo > 0.4) / ${f(K.catchSkill)});
    // an attack made from among stone often misses: prey hides in the crevices
    let sheltered = fk >= FIRST_LIFE && rnd(&s) < min(${f(K.refugeMax)}, stoneN * ${f(K.refuge)});
    if (!armored && !unfamiliar && !unskilled && !sheltered && atomicCompareExchangeWeak(&ledger[META_CLAIM + food], 0u, i + 1u).exchanged) {
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
      E += gain * ${f(K.gain)} * eatEff;
      addEnergy(dg, select(select(select(4u, 2u, act == 3u), 3u, fp.kind == HUSK), 1u, fp.kind == GLINT), gain * ${f(K.gain)} * eatEff);
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
  }
  // calcifying cells that settled leave their skeleton as stone, in their own colour, mostly where
  // stone already is, so reefs grow outward from rock and from the rare place one starts
  if (kind == HUSK && g.calcify > 0.0 && rnd(&s) < ${f(K.reefs)} * g.calcify * (1.0 - g.advect) * select(${f(K.nucleate)}, 1.0, stoneN >= 1.0)) {
    kind = STONE; E = ${f(K.stoneLife)} * (0.5 + rnd(&s)); vel = vec2f(0.0);
  }
  let childGen = ((genOf(p.info) + 1u) & 0xffffu) << 14u;
  intent[i] = vec4u(act | (ck << 2u) | (cr << 12u) | childGen, bitcast<u32>(ce), n1, n2);
  parts[i] = Particle(pos, vel, kind, E, age, p.id, pack4x8unorm(vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0)), info);
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
    if (life && inView) { t = 8u; }
    if (p.age < lu.window) {
      let code = p.info & 15u;
      if (life) {
        if (code == 9u) {
          t = 0u;
          let g = genomes[p.kind];
          if (g.depth > 0u && abs(g.born - (lu.now - p.age)) < 0.05) { t = 1u; }
        } else if (code == 8u) { t = 2u; }
      } else if (p.kind == HUSK) {
        if (code == 1u) { t = 3u; } else if (code == 2u) { t = 4u; } else if (code == 3u) { t = 5u; }
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
          let o = ${LISTEN_HEAD}u + r * 4u;
          let uv = clamp(d / lu.half * 0.5 + 0.5, vec2f(0.0), vec2f(1.0));
          atomicStore(&lout[o], t | ((p.kind & 1023u) << 4u) | (((p.info >> 4u) & 3u) << 14u) | ((p.id & 255u) << 16u)
            | (u32(clamp(speed / lu.vscale, 0.0, 1.0) * 255.0) << 24u));
          atomicStore(&lout[o + 1u], pack2x16unorm(uv));
          // events: their age (when they happened); living cells: energy toward their next division
          atomicStore(&lout[o + 2u], bitcast<u32>(select(p.age, clamp(p.energy / genomes[p.kind].reproE, 0.0, 1.5), t == 8u)));
          atomicStore(&lout[o + 3u], p.col);
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

export const DRAW_WGSL = COMMON + /* wgsl */ `
// Specialise this same path for unresolved views so near anatomy has no far-view overhead.
struct View {
  cam: vec2f, world: vec2f, res: vec2f,
  ppu: f32, pointSize: f32, pointGain: f32, lineGain: f32,
  linkR: f32, time: f32, selId: u32, matterGain: f32,
  focusOn: u32, roleMask: u32, stateMode: u32, mute: f32,
  memberKind: u32, memberN: u32,
};
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read> genomes: array<Genome>;
@group(0) @binding(3) var<storage, read> intent: array<vec4u>;
@group(0) @binding(4) var<storage, read> livingList: array<u32>;
@group(0) @binding(5) var<storage, read> focus: array<u32>;

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
  return p.age > 0.8 * g.lifespan;
}

fn wrapd(d: vec2f) -> vec2f { return d - view.world * round(d / view.world); }
fn toClip(px: vec2f) -> vec4f { return vec4f(px.x / (view.res.x * 0.5), -px.y / (view.res.y * 0.5), 0.0, 1.0); }

// Radii are in framebuffer pixels: the same LOD works in the main, loupe and specimen views.
fn detailLOD(radius: f32) -> f32 { return smoothstep(2.8, 6.0, radius); }
fn bondLOD(radius: f32) -> f32 { return smoothstep(6.0, 30.0, radius); }
fn interiorLOD(radius: f32) -> f32 { return smoothstep(12.0, 26.0, radius); }
fn fineLOD(radius: f32) -> f32 { return smoothstep(30.0, 65.0, radius); }
fn renderHash(id: u32) -> f32 {
  var h = id * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return f32((h >> 22u) ^ h) / 4294967296.0;
}
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
  let edge = 0.73 + 0.11 * sin(a * lobes + s.y * TAU) + 0.07 * cos(a * 3.0 + 0.5);
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
    case 9u: { return 0.260; }
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
  @location(5) @interpolate(flat) bonds: vec4f, // partner offsets / radius
  @location(6) @interpolate(flat) morph: vec2f, // species variation
};

@vertex fn vsPoint(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  var o: PO;
  let p = parts[ii];
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
    swim = min(g.swim, 1.0);
    let e = clamp(p.energy / g.reproE, 0.0, 1.4);
    var b = 0.35 + 0.65 * e;
    b *= 1.0 + g.pulse * 0.6 * sin(view.time * (0.8 + g.pulse * 4.0) + f32(p.id % 1024u) * 0.37);
    b *= 1.0 + 2.5 * max(0.0, 1.0 - p.age * 2.5);
    col = unpack4x8unorm(p.col).rgb * b * view.pointGain;
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
  // so they never grow into their neighbours and get clipped by the shared walls
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
  if (px <= 2.8) {
    let footprint = select(1.0, 0.85, k >= FIRST_LIFE);
    o.pos = toClip(d + corner * px * footprint);
    o.uv = corner * footprint;
    o.geom.x = min(px, 2.8);
    return o;
  }
  let fine = fineLOD(px);
  let extent = 1.35 + fine * swim * 0.65;
  if (any(abs(d) > view.res * 0.5 + vec2f(px * extent))) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
    return o;
  }
  o.pos = toClip(d + corner * px * extent);
  o.uv = corner * extent;
  let seed = renderHash(p.id);
  // cells face where they swim; matter keeps its own orientation (its motion is mostly Brownian)
  let a = select(seed * TAU, atan2(p.vel.y, p.vel.x), k >= FIRST_LIFE && dot(p.vel, p.vel) > 0.000001);
  o.geom = vec4f(px, extent, cos(a), sin(a));
  if (k >= FIRST_LIFE) {
    let g = genomes[k];
    shape = choosePlan(g, roleOf(p.info));
    o.shape = shape;
    let species = vec2f(renderHash(g.serial ^ g.sig[0].y), renderHash(g.serial ^ g.sig[1].x ^ 917u));
    o.morph = species;
    o.geom.y = bodyArea(shape, species);
    let it = intent[ii];
    if (it.z != NONE && parts[it.z].kind == k) { o.bonds = vec4f(wrapd(parts[it.z].pos - p.pos) * view.ppu / px, o.bonds.zw); }
    if (it.w != NONE && parts[it.w].kind == k) { o.bonds = vec4f(o.bonds.xy, wrapd(parts[it.w].pos - p.pos) * view.ppu / px); }
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
  if (p.kind >= FIRST_LIFE) {
    let g = genomes[p.kind];
    let s = i.morph;
    let inside = interiorLOD(i.geom.x);
    let fine = fineLOD(i.geom.x);
    let aspect = 0.82 + s.x * 0.38 + min(g.swim, 1.5) * 0.10;
    let motion = v * vec2f(1.0 / aspect, aspect);
    // Shears preserve area. The two low-frequency waves bend every plan, including
    // its facets, arms and internal structures. Cell identity dominates the slow motion.
    let phase = seed * TAU + view.time * (0.18 + g.pulse * 0.15) * (1.0 - g.calcify * 0.7);
    var q = motion;
    q.x += 0.075 * sin(q.y * 4.0 + phase) + (s.y - 0.5) * 0.20 * q.y;
    q.y += 0.065 * sin(q.x * 4.5 + phase * 1.3);
    let a = atan2(q.y, q.x);
    let r = length(q);
    let ripple = 0.018 * sin(a * 5.0 + seed * 23.0) * smoothstep(0.1, 0.4, r);
    let teeth = g.dFlesh * fine * 0.02 * pow(max(0.0, cos(a * 17.0 + seed * 11.0)), 6.0);
    let membraneSD = bodySD(q, i.shape, s) - ripple - teeth;
    var wallSD = -10.0;
    for (var j = 0u; j < 2u; j++) {
      let b = select(i.bonds.xy, i.bonds.zw, j == 1u);
      let len = length(b);
      if (len > 0.001) { wallSD = max(wallSD, dot(i.uv, b) / len - len * 0.5); }
    }
    let sd = max(membraneSD, wallSD);
    let body = 1.0 - smoothstep(-aa, aa, sd);
    // Flat cytoplasm is cheap at silhouette LOD. Detail is a small modulation of
    // that same normalised light, so there is no bright jump when the nucleus appears.
    var tissue = 1.0;
    if (inside > 0.0 && body > 0.0) {
      let age = clamp(p.age / max(g.lifespan, 1.0), 0.0, 1.0);
      let wallWidth = 0.025 + 0.008 * sin(a * 3.0 + seed * 13.0);
      let rim = exp(-pow((sd + 0.025) / (wallWidth + aa), 2.0));
      let innerRim = exp(-pow((sd + 0.10) / (0.07 + aa), 2.0));
      var detail = (0.44 + g.calcify * 0.12) * rim - 0.21 * innerRim;
      let division = smoothstep(0.55, 1.0, p.energy / max(g.reproE, 0.01));
      var centre = vec2f((s.x - 0.5) * 0.22, (seed - 0.5) * 0.26);
      if (i.shape == 8u) { centre = vec2f(-0.43, -0.06); }
      if (i.shape == 3u) { centre = vec2f(-0.35, 0.02); }
      if (i.shape == 9u) { centre = vec2f(0.2, 0.0); }
      let nq = q - centre;
      let nr = length(vec2f(abs(nq.x) - division * 0.17, nq.y + 0.03 * sin(nq.x * 15.0 + seed))
        / vec2f(0.17 + division * 0.04, 0.21 - division * 0.055));
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
        for (var j = 0u; j < 12u; j++) {
          let h = renderHash(p.id + j * 1999u + 71u);
          let th = TAU * renderHash(g.serial + j * 1013u + 103u);
          // Irregular scatter is clipped by the tissue for holes, horns and chain cells.
          var organCentre = vec2f(cos(th), sin(th)) * (0.22 + h * 0.51);
          if (i.shape == 3u) {
            organCentre = vec2f(select(-0.39, 0.39, j % 2u == 0u), 0.0)
              + vec2f(cos(th), sin(th)) * (0.12 + h * 0.18);
          } else if (i.shape == 5u || i.shape == 6u || i.shape == 11u) {
            let x = (h - 0.5) * 1.45;
            organCentre = vec2f(x, sin(th) * (0.30 - abs(x) * 0.22));
          } else if (i.shape == 7u) {
            let t = f32(j % 6u) / 5.0;
            let chamberAngle = t * 5.3 + s.y * 0.7;
            organCentre = vec2f(cos(chamberAngle), sin(chamberAngle)) * (0.12 + t * 0.36)
              + vec2f(cos(th), sin(th)) * h * 0.14;
          } else if (i.shape == 8u) {
            organCentre = vec2f(0.16 + s.x * 0.30, 0.09)
              + vec2f(cos(th), sin(th)) * (0.51 + h * 0.07);
          } else if (i.shape == 9u) {
            organCentre = vec2f(0.2, 0.0) + vec2f(cos(th), sin(th)) * h * 0.39;
          } else if (i.shape == 10u) {
            let x = (f32(j % 4u) - 1.5) * 0.40;
            organCentre = vec2f(x, 0.14 * sin(x * 5.0 + s.y * 5.0))
              + vec2f(cos(th), sin(th)) * h * 0.13;
          }
          let oq = q - organCentre;
          let photo = smoothstep(f32(j), f32(j) + 1.0, clamp(g.photo, 0.0, 1.0) * 12.0);
          let chl = length(oq * vec2f(1.0, 1.5 + h));
          detail += photo * (-0.35 * (1.0 - smoothstep(0.04, 0.07 + aa, chl))
            + 0.12 * exp(-pow((chl - 0.085) / (0.012 + aa), 2.0))) * fine;
          let eat = (1.0 - g.photo * 0.65) * clamp(g.dGlint + g.dHusk + g.dFlesh, 0.0, 1.0);
          let vr = length(oq + vec2f(0.04, 0.05));
          detail += smoothstep(h - 0.05, h + 0.05, eat * 0.7) * fine
            * (0.18 * exp(-pow((vr - 0.06 - h * 0.025) / (0.012 + aa), 2.0))
              - 0.10 * (1.0 - smoothstep(0.03, 0.06 + aa, vr)));
        }
      }
      tissue += inside * detail;
    }
    f = body * tissue * spriteMean(i.shape) / i.geom.y;
    if (fine > 0.0 && g.swim > 0.05) {
      let beat = view.time * 2.5 + seed * TAU;
      // Fade subpixel hairs before widening them with the footprint; no sparkling fringe.
      let resolved = smoothstep(0.7, 1.5, i.geom.x * 0.018) * fine;
      let hairs = exp(-pow((membraneSD - 0.035) / (0.018 + aa), 2.0))
        * pow(max(0.0, cos(a * 23.0 + sin(a * 5.0 + beat))), 8.0);
      let tailY = 0.13 * sin(motion.x * 7.0 + beat) * smoothstep(0.65, 1.6, -motion.x);
      let tail = (1.0 - smoothstep(0.009, 0.018 + aa, abs(motion.y - tailY)))
        * smoothstep(0.60, 0.9, -motion.x) * (1.0 - smoothstep(1.55, 1.9, -motion.x));
      let wallMask = 1.0 - smoothstep(-aa, aa, wallSD);
      f += wallMask * min(g.swim, 1.0) * resolved * (1.0 - body) * (0.05 * hairs + 0.08 * tail);
    }
  } else {
    let a = atan2(v.y, v.x) + seed * TAU;
    var r = length(v);
    let sides = 4.0 + floor(seed * 4.0);
    let edge = polygonRadius(a, sides, 0.08);
    let body = 1.0 - smoothstep(edge - aa, edge + aa, r);
    if (p.kind == HUSK) {
      // A folded membrane, with missing arcs and torn ends, retains the dead particle's colour.
      let fold = length(v * vec2f(0.86, 1.55));
      let wall = 0.64 + 0.10 * sin(a * 3.0 + seed * 21.0) + 0.06 * sin(a * 7.0);
      let breaks = smoothstep(-0.85, -0.55, sin(a * 3.0 + seed * 37.0));
      f = exp(-pow((fold - wall) / (0.07 + aa), 2.0)) * breaks * 1.25;
      f += 0.10 * exp(-pow((fold - 0.42) / (0.09 + aa), 2.0));
      f *= spriteMean(i.shape) / 0.20;
    } else {
      // one lit face and a faint grain, so grains read as solid chips rather than sectors
      let facets = 0.70 + 0.16 * (v.x - v.y) + 0.06 * sin(v.x * 17.0 + v.y * 11.0 + seed * 23.0);
      f = body * facets * spriteMean(i.shape) / 0.56;
      if (p.kind == GLINT) {
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
  return vec4f(i.col * mix(far, max(0.0, f), lod), 0.0);
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
  let halfWidth = mix(0.5, max(0.5, view.ppu * (0.012 + adhesion * 0.025) * taper * tension), lod);
  o.pos = toClip((base + centre) * view.ppu + normal * side * halfWidth);
  let strength = clamp(1.0 - len / view.linkR, 0.0, 1.0);
  let fade = select(view.mute, 1.0, focusPass(p));
  // Soft-edge integral is 0.8: match the old line's light at rest, dim under tension.
  o.col = mix(unpack4x8unorm(p.col).rgb, unpack4x8unorm(q.col).rgb, t)
    * ((0.35 + 0.65 * strength) * view.lineGain * fade * lod * tension * tension / (halfWidth * 1.6));
  o.side = side;
  return o;
}
@fragment fn fsBridge(i: BO) -> @location(0) vec4f {
  return vec4f(i.col * (1.0 - smoothstep(0.6, 1.0, abs(i.side))), 0.0);
}

@vertex fn vsFade(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fsFade() -> @location(0) vec4f { return vec4f(0.0); }
`;

export const POST_WGSL = COMMON + /* wgsl */ `
struct Post {
  res: vec2f, bloom: f32, exposure: f32,
  time: f32, season: f32, tideVis: f32, ppu: f32,
  cam: vec2f, world: vec2f,
  simTime: f32, ambient: f32, p1: f32, p2: f32,
  tide: array<vec4f, 4>,
  tidePh: vec4f,
};
struct Loupe { center: vec2f, radius: f32, strength: f32, res: vec2f, ppu: f32, p1: f32 };
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

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vsFull(@builtin(vertex_index) vi: u32) -> VO {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: VO;
  o.pos = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(uv.x, 1.0 - uv.y);
  return o;
}

fn tap(uv: vec2f) -> vec3f { return textureSampleLevel(src, samp, uv, 0.0).rgb; }

@fragment fn fsDown(i: VO) -> @location(0) vec4f {
  let h = 1.0 / vec2f(textureDimensions(src));
  var c = tap(i.uv) * 4.0;
  c += tap(i.uv - h);
  c += tap(i.uv + h);
  c += tap(i.uv + vec2f(h.x, -h.y));
  c += tap(i.uv - vec2f(h.x, -h.y));
  return vec4f(c / 8.0, 1.0);
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
  return vec4f(c / 12.0, 1.0);
}

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Cosmetic pond suspension. Each octave has one bounded object per grid slot:
// centres, motion and SDF support stay inside the slot, so no neighbour scan is
// needed. The field drifts in world space; camera motion never reseeds it.
fn microGrain(wp: vec2f, spacing: f32, ppu: f32, octave: f32, depth: f32) -> vec4f {
  let resolved = smoothstep(0.6, 1.6, spacing * 0.075 * ppu);
  if (resolved <= 0.0) { return vec4f(0.0); }
  let t = post.simTime;
  let drift = t * vec2f(0.0007, -0.0004) * depth;
  // Each depth plane has its own toroidal world and camera parallax rate.
  let layerWorld = post.world * depth;
  let slots = max(vec2f(1.0), round(layerWorld / spacing));
  let pitch = layerWorld / slots;
  let offset = vec2f(octave * 17.3, octave * 9.7);
  let p = (wp - drift) / pitch + offset;
  let cell = floor(p);
  let slot = cell - slots * floor(cell / slots);
  let seed = slot + octave * 71.0;
  let h = vec4f(hash12(seed), hash12(seed + 13.7), hash12(seed + 39.1), hash12(seed + 91.3));
  // Most slots are occupied. Cleaner patches also lower translucency, rather
  // than relying on black grains disappearing into the water background.
  let phase = (slot + 0.5 - offset) / slots * TAU;
  let patchiness = 0.5 + 0.5 * sin(phase.x * 61.0 + sin(phase.y * 29.0)) * cos(phase.y * 47.0 - phase.x * 17.0);
  let density = mix(0.72, 0.98, patchiness);
  if (h.w > density) { return vec4f(0.0); }
  let abundance = mix(0.35, 1.0, patchiness);
  let centre = vec2f(0.28) + h.xy * 0.44
    + 0.018 * sin(vec2f(t * 0.53, t * 0.41) + h.yz * TAU);
  var q = fract(p) - centre;
  // Motion and full halo/blur support stay within the slot: one lookup only.
  if (dot(q, q) > 0.0625) { return vec4f(0.0); }
  let aa = 0.65 / (spacing * ppu);
  let tint = vec3f(0.018, 0.023, 0.025) * mix(0.7, 1.15, h.w);
  if (depth < 1.0) {
    // A separate soft plane: large discs and elongated smudges, with broad
    // focus falloff. It pans at 72% of the scene and drifts more slowly.
    let stretch = mix(1.0, 1.6, h.z);
    let d = length(q * vec2f(stretch, 1.0));
    let soft = 1.0 - smoothstep(0.02, 0.21 + min(aa, 0.025), d);
    let halo = smoothstep(0.01, 0.08, d) * (1.0 - smoothstep(0.08, 0.23, d));
    let glow = (soft * soft * 0.28 + halo * 0.23) * abundance * resolved;
    return vec4f(tint * glow, soft * soft * 0.1 * abundance * resolved);
  }
  let family = u32(h.z * 8.0);
  let tumble = 0.9 * smoothstep(0.78, 0.98, sin(t * 0.17 + h.x * TAU));
  let angle = h.x * TAU + t * (h.y - 0.5) * 0.08 + tumble;
  let axis = vec2f(cos(angle), sin(angle));
  q = vec2f(dot(q, axis), dot(q, vec2f(-axis.y, axis.x)));
  let r = 0.05 + h.y * 0.025;
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
  let visible = resolved * smoothstep(0.45, 1.3, width * spacing * ppu) * abundance;
  let core = 1.0 - smoothstep(-aa, aa, sdf);
  let rim = 1.0 - smoothstep(aa * 0.5, aa + haloWidth, abs(sdf));
  return vec4f(tint * (core * body + rim * 0.85), core * 0.24) * visible;
}

fn pondMicro(c: vec3f, hdr: vec3f, cam: vec2f, offset: vec2f, renderPPU: f32, ppu: f32) -> vec3f {
  // Uniform early-out: no hashes, shapes or time work at ordinary zoom. The
  // fit threshold also keeps the default view unchanged on very small worlds.
  let start = max(80.0, 2.0 * max(post.res.x / post.world.x, post.res.y / post.world.y));
  if (ppu <= start) { return c; }
  let delta = offset / renderPPU;
  let wp = cam + delta;
  let reveal = smoothstep(start, start * 2.0, ppu);
  var grains = microGrain(cam * 0.72 + delta, 0.055, ppu, 0.0, 0.72);
  grains += microGrain(wp, 0.035, ppu, 1.0, 1.0);
  grains += microGrain(wp, 0.008, ppu, 2.0, 1.0);
  let behind = reveal / (1.0 + 24.0 * max(hdr.r, max(hdr.g, hdr.b)));
  return max(vec3f(0.0), c * (1.0 - grains.a * behind) + grains.rgb * behind);
}

fn tonemap(hdrIn: vec3f) -> vec3f {
  let l = dot(hdrIn, vec3f(0.2126, 0.7152, 0.0722));
  let tl = l * (1.0 + l / 6.0) / (1.0 + l);
  var c = hdrIn * (tl / max(l, 1e-5));
  let m = max(c.r, max(c.g, c.b));
  if (m > 1.0) { c = mix(c / m, vec3f(1.0), clamp((m - 1.0) * 0.35, 0.0, 1.0)); }
  return c;
}

@fragment fn fsComposite(i: VO) -> @location(0) vec4f {
  var hdr = textureSampleLevel(src, samp, i.uv, 0.0).rgb;
  let bl = textureSampleLevel(bloomTex, samp, i.uv, 0.0).rgb;
  hdr = (hdr + bl * post.bloom) * post.exposure;
  var T = 0.0;
  if (post.tideVis > 0.0) {
    let wp = post.cam + (i.pos.xy - post.res * 0.5) / post.ppu;
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
  let q = i.uv - 0.5;
  let v = clamp(1.0 - dot(q, q) * 1.1, 0.0, 1.0);
  let bg = mix(vec3f(0.0015, 0.0012, 0.0035), vec3f(0.0055, 0.0045, 0.011), v);
  c = c * mix(0.72, 1.0, v) + bg;
  c = pondMicro(c, hdr, post.cam, i.pos.xy - post.res * 0.5, post.ppu, post.ppu);
  c = pow(c, vec3f(1.0 / 2.2));
  c += (hash12(i.pos.xy + fract(post.time) * 91.7) - 0.5) / 255.0 * 2.0;
  return vec4f(c, 1.0);
}

// loupe: a circular lens composited over the main view
struct LV { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vsLoupe(@builtin(vertex_index) vi: u32) -> LV {
  let corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let rr = loupe.radius + 4.0;
  let px = loupe.center + c * rr;
  var o: LV;
  o.pos = vec4f(px.x / loupe.res.x * 2.0 - 1.0, 1.0 - px.y / loupe.res.y * 2.0, 0.0, 1.0);
  o.uv = c * rr / loupe.radius;
  return o;
}

@fragment fn fsLoupe(i: LV) -> @location(0) vec4f {
  let d = length(i.uv);
  if (d > 1.035) { discard; }
  let tuv = i.uv * 0.5 + 0.5;
  var hdr = textureSampleLevel(src, samp, vec2f(tuv.x, tuv.y), 0.0).rgb * post.exposure;
  var c = tonemap(hdr) + vec3f(0.006, 0.006, 0.012);
  c = pondMicro(c, hdr, microView.cam, i.uv * microView.res * 0.5, microView.ppu, loupe.ppu);
  c = pow(c, vec3f(1.0 / 2.2));
  let vign = smoothstep(1.0, 0.75, d);
  c *= mix(0.55, 1.0, vign);
  let ring = smoothstep(0.012, 0.0, abs(d - 1.0)) * 0.85;
  c = mix(c, vec3f(0.93, 0.9, 0.97), ring);
  let a = select(1.0, smoothstep(1.035, 1.0, d), d > 1.0);
  return vec4f(c, a * loupe.strength);
}

// trails: carry last frame's image along with the camera, then fade it
@fragment fn fsReproj(i: VO) -> @location(0) vec4f {
  let u = (i.uv - 0.5) * rp.scale + 0.5 + rp.shift;
  if (u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0) { return vec4f(0.0); }
  return vec4f(textureSampleLevel(src, samp, u, 0.0).rgb * rp.k, 0.0);
}

@fragment fn fsPlain(i: VO) -> @location(0) vec4f {
  let hdr = textureSampleLevel(src, samp, i.uv, 0.0).rgb * post.exposure;
  var c = tonemap(hdr) + vec3f(0.006, 0.005, 0.012);
  c = pondMicro(c, hdr, microView.cam, i.pos.xy - microView.res * 0.5, microView.ppu, microView.ppu);
  return vec4f(pow(c, vec3f(1.0 / 2.2)), 1.0);
}
`;
