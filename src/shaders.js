// WGSL for the Tidemote biosphere.
// Kinds: 0 silt, 1 glint, 2 husk, 3 unused, 4..511 living genomes.
// Each living genome has up to three cell roles with their own signatures.

export const MAXK = 512;
export const FIRST_LIFE = 4;
export const MAX_CELLS = 1 << 18;
export const META_SLOT = 16;
export const META_POP = 16 + 512;
export const META_DEATH = 16 + 1024;
export const META_CLAIM = 16 + 1024 + 32;
export const P_BYTES = 40;
export const G_BYTES = 192;
export const G_WORDS = 48;
export const LITE_BYTES = 24;

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
  buildCost: 0.06,
  gain: 1.5,
  sated: 1.0,       // cells stop feeding above this × the energy needed to divide
  carcass: 0.45,    // energy left in the husk of a cell that was killed
  killEvery: 8,     // handling time: kills only on every Nth meal opportunity
  biteEvery: 6,     // ...and bites of plant cells on every Nth
  plantPref: 0.35,
  grazePref: 0.6,   // how much a grazer values a plant cell relative to glint
  forage: 0.35,     // pull of glint and husks on a hungry forager, relative to signature forces
  hunt: 0.12,       // pull of living prey on a hungry forager  // how much a flesh-eater values plant cells relative to a grazer
  kinCrowd: 0.06,   // upkeep added per crowding same-species neighbour (free-living species)
  kinFree: 4,       // same-species neighbours tolerated before crowding costs
  anchorCost: 0.003, // upkeep for resisting the currents
  flowFeed: 0.8,    // anchored photosynthesisers gain this much per 0.2 cells/s of current flowing past
  bodyThrift: 0.3,  // upkeep saved by a cell with two bonds: bodies share the cost of living
  kinShade: 0.25,   // how much a bonded body shades itself, relative to strangers
  armor: 2.5,       // bonded bodies resist being killed or bitten
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
};

const f = (x) => {
  const s = String(x);
  return /[.eE]/.test(s) ? s : s + '.0';
};

const COMMON = /* wgsl */ `
const MAXK = 512u;
const FIRST_LIFE = 4u;
const SILT = 0u;
const GLINT = 1u;
const HUSK = 2u;
const NONE = 0xffffffffu;
const MAX_CELLS = 262144u;
const META_SLOT = 16u;
const META_POP = 528u;
const META_DEATH = 16u + 1024u;
const META_CLAIM = 16u + 1024u + 32u;
const TAU = 6.28318530718;

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
  adhesion: f32, gp0: f32, gp1: f32, gp2: f32,
};

fn roleOf(info: u32) -> u32 { return (info >> 4u) & 3u; }
fn genOf(info: u32) -> u32 { return info >> 6u; }

fn tideAt(p: vec2f, world: vec2f, t: f32, w: array<vec4f, 4>) -> f32 {
  let u = p / world * TAU;
  var s = 0.0;
  var n = 0.0;
  for (var k = 0u; k < 4u; k++) {
    s += w[k].w * sin(w[k].x * u.x + w[k].y * u.y + w[k].z * t + f32(k) * 1.7);
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
  ambient: f32, chargeMul: f32,
  waves: array<vec4f, 4>,
  tide: array<vec4f, 4>,
};
struct Lite { pos: vec2f, kr: u32, col: u32, vel: u32, pad: u32 };

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
// 12..13 child role, 14..31 child generation; y child energy, z/w bond neighbours.
@group(0) @binding(9) var<storage, read_write> intent: array<vec4u>;
@group(0) @binding(10) var<storage, read_write> genomes: array<Genome>;
@group(0) @binding(11) var<storage, read_write> ledger: array<atomic<u32>>;
@group(0) @binding(12) var<storage, read_write> livingList: array<u32>;
@group(0) @binding(13) var<storage, read_write> frameCtr: array<atomic<u32>, 8>;

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

fn deriveMetab(g: Genome) -> f32 {
  return (0.012 + 0.0032 * g.force + 0.012 * g.radius + 0.00012 * g.lifespan
        + ${f(K.anchorCost)} * (1.0 - g.advect) + 0.004 * g.size + ${f(K.swimCost)} * g.swim * (1.0 - g.photo) + 0.006 * g.align + 0.004 * g.adhesion) * ${f(K.metab)};
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
  if (rnd(s) < m * 0.6) { g.shape = floor(rnd(s) * 5.0); }
  g.pulse = clamp(g.pulse + gauss(s) * m * 0.2, 0.0, 1.0);
  g.roleHue = clamp(g.roleHue + gauss(s) * m * 0.1, -0.35, 0.35);
  g.advect = clamp(g.advect + gauss(s) * m * 0.15, 0.03, 1.0);
  g.swim = clamp(g.swim + gauss(s) * m * 0.5, 0.0, 3.0);
  g.align = clamp(g.align + gauss(s) * m * 0.3, 0.0, 1.0);
  g.photo = clamp(g.photo + gauss(s) * m * 0.25, 0.0, 1.0);
  g.adhesion = clamp(g.adhesion + gauss(s) * m * 0.25, 0.0, 1.0);
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
  g.shape = floor(rnd(s) * 5.0);
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
  g.parent = 0u;
  g.serial = atomicAdd(&ledger[1], 1u) + 1u;
  g.born = sim.time;
  g.depth = 0u;
  finalize(&g);
  genomes[slot] = g;
}

// ---------------------------------------------------------------- seeding
@compute @workgroup_size(256)
fn seedMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= sim.count) { return; }
  var s = pcg(i ^ pcg(sim.seed));
  let pos = vec2f(rnd(&s), rnd(&s)) * sim.world;
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
    let g = genomes[kind];
    e = 0.4 + 0.6 * rnd(&s);
    let r = sampleRole(g, sampleRole(g, 0u, &s), &s);
    col = pack4x8unorm(vec4f(roleColor(g, r), 1.0));
    age = rnd(&s) * g.lifespan * 0.6;
    info = r << 4u;
  }
  parts[i] = Particle(pos, vec2f(0.0), kind, e, age, i, col, info);
}

// ------------------------------------------------- resolve claims + count
var<workgroup> hist: array<atomic<u32>, 512>;
var<workgroup> roleHist: array<atomic<u32>, 3>;

@compute @workgroup_size(256)
fn resolveCount(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) l: u32) {
  for (var k = l; k < MAXK; k += 256u) { atomicStore(&hist[k], 0u); }
  if (l < 3u) { atomicStore(&roleHist[l], 0u); }
  workgroupBarrier();
  let i = gid.x;
  if (i < sim.count) {
    var p = parts[i];
    let c = atomicLoad(&ledger[META_CLAIM + i]);
    if (c != 0u) {
      atomicStore(&ledger[META_CLAIM + i], 0u);
      let it = intent[c - 1u];
      let act = it.x & 3u;
      let ck = (it.x >> 2u) & 1023u;
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
        let cr = (it.x >> 12u) & 3u;
        let gen = it.x >> 14u;
        p.kind = ck;
        p.energy = bitcast<f32>(it.y);
        p.age = 0.0;
        p.vel = vec2f(0.0);
        p.id = atomicAdd(&ledger[0], 1u);
        p.col = pack4x8unorm(vec4f(roleColor(genomes[ck], cr), 1.0));
        p.info = (gen << 6u) | (cr << 4u) | 9u;
        atomicAdd(&ledger[2], 1u);
        atomicAdd(&ledger[META_DEATH + 4u * dietGuild(genomes[ck])], 1u);
      }
      parts[i] = p;
    }
    let cell = cellOf(p.pos);
    let r = atomicAdd(&countsA[cell], 1u);
    aux[i] = vec2u(cell, r);
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
    sortedLite[dst] = Lite(p.pos, p.kind | (roleOf(p.info) << 10u), p.col, pack2x16float(p.vel), 0u);
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
  var s = pcg((p.id * 1664525u) ^ pcg(sim.frame * 2654435761u + sim.seed));
  let jit = vec2f(rnd(&s) - 0.5, rnd(&s) - 0.5) * ${f(K.jitter)};
  var vel = flowAt(p.pos) + jit;
  let pos = wrapPos(p.pos + vel * sim.dt);
  p.age += sim.dt;
  if (p.kind == SILT) {
    let T = tideAt(pos, sim.world, sim.time, sim.tide) * sim.season + 0.2 * sim.ambient;
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
var<workgroup> surf: array<vec2u, 1536>;
var<workgroup> kphoto: array<f32, 512>;

@compute @workgroup_size(128)
fn lifeMain(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) l: u32) {
  // Other workgroups may write newly allocated genomes, but those slots have no living
  // cells in this frame's snapshot, so their staged values are never used this frame.
  for (var k = l; k < MAXK * 3u; k += 128u) { surf[k] = genomes[k / 3u].sig[k % 3u].xy; }
  for (var k = l; k < MAXK; k += 128u) { kphoto[k] = select(genomes[k].photo, 0.0, k < FIRST_LIFE); }
  workgroupBarrier();
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
  var food = NONE; var foodScore = -1e9;
  var silt = NONE; var siltD = 1e9;
  var budget = MAX_SCAN;

  for (var dy = -1; dy <= 1; dy++) {
    let y = (cc.y + dy + gh) % gh;
    let rowBase = y * gw;
    var rs: array<u32, 3>;
    var re: array<u32, 3>;
    var nr = 0u;
    if (cc.x > 0 && cc.x < gw - 1) {
      rs[0] = cellStart[u32(rowBase + cc.x - 1)];
      re[0] = cellStart[u32(rowBase + cc.x + 2)];
      nr = 1u;
    } else {
      for (var dx = -1; dx <= 1; dx++) {
        let x = (cc.x + dx + gw) % gw;
        let c = u32(rowBase + x);
        rs[nr] = cellStart[c];
        re[nr] = cellStart[c + 1u];
        nr++;
      }
    }
    for (var k = 0u; k < nr; k++) {
      let e = min(re[k], rs[k] + budget);
      budget -= e - rs[k];
      for (var j = rs[k]; j < e; j++) {
        let q = sortedLite[j];
        var d = q.pos - p.pos;
        d -= world * round(d * invWorld);
        let r2 = dot(d, d);
        if (r2 >= R2 || r2 < 1e-12) { continue; }
        let r = sqrt(r2);
        let x = r * invR;
        let qk = q.kr & 1023u;
        let sq = surf[qk * 3u + ((q.kr >> 10u) & 3u)];
        let s0 = unpack4x8snorm(sq.x);
        let s1 = unpack4x8snorm(sq.y);
        let a = clamp((dot(rec0, s0) + dot(rec1, s1)) * ${f(K.affScale)}, -1.0, 1.0);
        let shape = 1.0 - abs(2.0 * x - 1.0 - beta) * invOM;
        var fr: f32;
        if (qk >= FIRST_LIFE) {
          // a hungry forager lets other species inside its personal space so it can reach them
          if (x < beta) { fr = (x * invBeta - 1.0) * select(1.0, 0.15, canHunt && qk != p.kind); } else { fr = a * shape; }
          // hungry foragers are drawn toward the cells their diet favours
          if (canHunt && qk != p.kind && x >= beta) {
            fr += select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, kphoto[qk] > 0.4) * eatEff * ${f(K.hunt)} * shape;
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
            if (bonding && qk == p.kind) {
              if (r < d1) { d2 = d1; n2 = n1; dn2 = dn1; d1 = r; n1 = j; dn1 = d; }
              else if (r < d2) { d2 = r; n2 = j; dn2 = d; }
            }
          }
          if (canHunt && r < EAT_R && qk != p.kind) {
            let da = s0 - my0;
            let db = s1 - my1;
            if (dot(da, da) + dot(db, db) > ${f(K.kin)}) {
              // grazers crop plant cells; flesh-eaters hunt animals (and crop plants reluctantly)
              let plant = kphoto[qk] > 0.4;
              let pref = select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, plant);
              let sc = pref - r;
              if (pref > DIET_MIN && sc > foodScore) { foodScore = sc; food = j; }
            }
          }
        } else {
          fr = select(0.0, a * shape * ${f(K.matterPull)}, x >= beta);
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
        force += d * (fr / r);
      }
    }
  }

  var s = pcg(p.id ^ pcg(sim.frame * 747796405u + sim.seed));
  let heavy = 1.0 - 0.7 * g.photo;
  let fr0 = pow(0.5, sim.dt / g.drag);
  var vel = p.vel * fr0 + force * (g.force * heavy * sim.dt);
  if (kinN > 0.0 && g.align > 0.0) {
    vel = mix(vel, kinVel / kinN, clamp(g.align * ${f(K.align)} * sim.dt, 0.0, 1.0));
  }
  // bonds: springs to the two nearest cells of the same species hold a body together
  var bondF = vec2f(0.0);
  if (n1 != NONE) { bondF += dn1 * ((d1 - LINK_R * 0.55) / max(d1, 1e-4)); }
  if (n2 != NONE) { bondF += dn2 * ((d2 - LINK_R * 0.55) / max(d2, 1e-4)); }
  vel += bondF * (g.adhesion * ${f(K.bond)} * sim.dt);
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

  let light = sim.ambient + (1.0 - sim.ambient) * tideAt(p.pos, world, sim.time, sim.tide) * sim.season;
  // photosynthesis needs minerals: silt within reach. Drifters ride along with their own (depleting)
  // water; anchored cells have fresh silt carried past them by the currents.
  let photoGain = g.photo * light * ${f(K.photo)} / (1.0 + crowd * ${f(K.shade)}) * (nutr / (nutr + ${f(K.nutrHalf)})) * (1.0 + ${f(K.nutrHalf)} / 20.0)
    * (1.0 + ${f(K.flowFeed)} * (1.0 - g.advect) * min(length(flowAt(p.pos)) / 0.2, 2.0));
  // free-living cells packed among their own kind sicken (species-specific disease, Janzen-Connell)
  let kinCost = select(1.0 + ${f(K.kinCrowd)} * max(0.0, kinN - ${f(K.kinFree)}), 1.0, bonding);
  let bonds = select(0.0, 1.0, n1 != NONE) + select(0.0, 1.0, n2 != NONE);
  let thrift = 1.0 - ${f(K.bodyThrift)} * 0.5 * bonds;
  let upkeep = g.metab * kinCost * thrift * (0.55 + 0.45 * clamp(p.energy / g.reproE, 0.0, 1.0));
  var E = p.energy + (photoGain - upkeep) * sim.dt;
  var age = p.age + sim.dt;
  var act = 0u;
  var ck = 0u;
  var cr = 0u;
  var ce = 0.0;
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
      act = 2u;
    }
  } else if (food != NONE && ((sim.frame + p.id) % ${K.eatEvery | 0}u) == 0u
             && (sortedFull[food].kind < FIRST_LIFE
                 || ((sim.frame + p.id) / ${K.eatEvery | 0}u) % select(${K.killEvery | 0}u, ${K.biteEvery | 0}u, genomes[sortedFull[food].kind].photo > 0.4) == 0u)) {
    let fk = sortedFull[food].kind;
    let armored = fk >= FIRST_LIFE && rnd(&s) * (1.0 + ${f(K.armor)} * max(0.0, genomes[fk].adhesion - ${f(K.adhMin)})) > 1.0;
    if (!armored && atomicCompareExchangeWeak(&ledger[META_CLAIM + food], 0u, i + 1u).exchanged) {
      let fp = sortedFull[food];
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
      E += gain * ${f(K.gain)} * eatEff;
    }
  }

  var kind = p.kind;
  var info = p.info;
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
  let childGen = ((genOf(p.info) + 1u) & 0x3ffffu) << 14u;
  intent[i] = vec4u(act | (ck << 2u) | (cr << 12u) | childGen, bitcast<u32>(ce), n1, n2);
  parts[i] = Particle(pos, vel, kind, E, age, p.id, pack4x8unorm(vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0)), info);
}
`;
}

export const PICK_WGSL = COMMON + /* wgsl */ `
struct PickU { center: vec2f, radius: f32, selId: u32, maxOut: u32, count: u32, world: vec2f, kindFilter: u32, p0: u32, p1: u32, p2: u32 };
struct PickOut { count: atomic<u32>, found: u32, pad0: u32, pad1: u32, tracked: Particle, entries: array<Particle> };
@group(0) @binding(0) var<uniform> pu: PickU;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read_write> pout: PickOut;

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
    if (k < pu.maxOut) { pout.entries[k] = p; }
  }
}
`;

export const DRAW_WGSL = COMMON + /* wgsl */ `
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

fn kindOn(k: u32) -> bool { return ((focus[(k >> 5u) & 15u] >> (k & 31u)) & 1u) == 1u; }
fn isMember(id: u32) -> bool {
  var lo = 0u;
  var hi = view.memberN;
  for (var it = 0u; it < 20u; it++) {
    if (lo >= hi) { break; }
    let mid = (lo + hi) / 2u;
    let v = focus[16u + mid];
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

struct PO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) @interpolate(flat) shape: u32,
};

@vertex fn vsPoint(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  var o: PO;
  let p = parts[ii];
  let d = wrapd(p.pos - view.cam) * view.ppu;
  let margin = view.res * 0.5 + vec2f(60.0);
  if (abs(d.x) > margin.x || abs(d.y) > margin.y) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
    return o;
  }
  let k = p.kind;
  var size = 1.0;
  var col: vec3f;
  var shape = 0u;
  if (k >= FIRST_LIFE) {
    let g = genomes[k];
    let role = roleOf(p.info);
    size = g.size * (1.0 - 0.12 * f32(role));
    shape = (u32(g.shape) + role * 2u) % 5u;
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
    shape = 5u;
    let tw = 0.6 + 0.4 * sin(view.time * 6.0 + f32(p.id % 977u));
    col = vec3f(0.7, 0.93, 1.0) * (0.4 + p.energy) * tw * view.matterGain * 2.0;
  } else {
    size = 0.62;
    shape = 1u;
    let h = unpack4x8unorm(p.col).rgb;
    col = mix(h * 0.6, vec3f(0.42, 0.28, 0.16), 0.55) * (0.25 + p.energy * 0.6) * view.matterGain * 1.4;
  }
  if (!focusPass(p)) {
    let l = dot(col, vec3f(0.3, 0.5, 0.2));
    col = mix(vec3f(l), col, 0.1) * view.mute;
    size *= 0.7;
  } else if (view.focusOn == 1u) {
    col *= 1.6;
    size *= 1.12;
  }
  if (view.memberN > 0u && k == view.memberKind && isMember(p.id)) {
    col = mix(col, vec3f(1.0, 0.97, 0.9) * max(1.0, dot(col, vec3f(0.33))), 0.35) * (1.25 + 0.2 * sin(view.time * 4.0));
    size *= 1.15;
  }
  if (p.id == view.selId) { col = col * 1.5 + vec3f(0.5); size = max(size, 1.2) * 1.5; }
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  let px = max(view.pointSize * size, 0.9);
  o.pos = toClip(d + corner * px);
  o.uv = corner;
  o.col = col;
  o.shape = shape;
  return o;
}

@fragment fn fsPoint(i: PO) -> @location(0) vec4f {
  let d2 = dot(i.uv, i.uv);
  var f = 0.0;
  if (d2 < 1.0) {
    switch (i.shape) {
      case 1u: {
        let t = (sqrt(d2) - 0.62) / 0.2;
        f = exp(-t * t);
      }
      case 2u: {
        let a = abs(i.uv);
        f = max(0.0, 1.0 - a.x * a.y * 14.0 - d2) * (1.0 - d2);
      }
      case 3u: {
        f = 0.35 * (1.0 - d2) + smoothstep(0.32, 0.0, sqrt(d2));
      }
      case 4u: {
        let a = abs(i.uv);
        let t = max(0.0, 1.0 - (a.x + a.y));
        f = t * t * 1.6;
      }
      case 5u: {
        let a = abs(i.uv);
        let t = max(0.0, 1.0 - a.x * a.y * 40.0 - d2 * 0.7);
        f = t * t * (1.0 - d2);
      }
      default: {
        let t = 1.0 - d2;
        f = t * t;
      }
    }
  }
  return vec4f(i.col * f, 0.0);
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
  return o;
}

@fragment fn fsLine(i: LO) -> @location(0) vec4f { return vec4f(i.col, 0.0); }

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
};
struct Loupe { center: vec2f, radius: f32, strength: f32, res: vec2f, p0: f32, p1: f32 };
struct Reproj { scale: vec2f, shift: vec2f, k: f32, p0: f32, p1: f32, p2: f32 };
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var<uniform> post: Post;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> loupe: Loupe;
@group(0) @binding(5) var<uniform> rp: Reproj;

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
    T = tideAt(wp, post.world, post.simTime, post.tide) * post.season;
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
  var c = tonemap(textureSampleLevel(src, samp, i.uv, 0.0).rgb * post.exposure) + vec3f(0.006, 0.005, 0.012);
  return vec4f(pow(c, vec3f(1.0 / 2.2)), 1.0);
}
`;
