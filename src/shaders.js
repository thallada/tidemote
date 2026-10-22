// WGSL for the Tidemote biosphere.
// Kinds: 0 silt, 1 (unused: once glint), 2 husk, 3 stone, 4 framboid, 5..1023 living genomes.
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
// Energy ledger per diet guild, in thousandths: light, (glint: unused), plant bites, husks, kills, upkeep,
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
export const G_BYTES = 224;
export const G_WORDS = 56;
export const LITE_BYTES = 32;
// a cell's drawn motion and events (ANIM_WGSL's Sway)
export const SWAY_BYTES = 56;
// The selected cell's mind (mindMain): a header of MIND_HEAD words, then MIND_NBR living neighbours
// of MIND_NBR_WORDS words each. See parseMind in mind.js for the layout.
export const MIND_HEAD = 64;
export const MIND_NBR = 48;
export const MIND_NBR_WORDS = 8;
export const MIND_BYTES = (MIND_HEAD + MIND_NBR * MIND_NBR_WORDS) * 4;

export const DEFAULT_K = {
  density: 22,
  decay: 0.011,
  huskMin: 0.08,
  huskFrac: 0.5,
  eatR: 0.3,
  linkR: 0.42,
  bondBreak: 1.25,  // persistent bonds break beyond 1.25 × their formation range (linkR)
  gain: 1.5,
  sated: 1.0,       // cells stop feeding above this × the energy needed to divide
  killEvery: 4,     // handling time: kills only on every Nth meal opportunity
  biteEvery: 1,     // ...and bites of plant cells on every Nth
  plantPref: 0.1,   // how much a flesh-eater values plant cells relative to a grazer
  grazePref: 1,   // how much a grazer values a plant cell
  forage: 0.35,     // pull of husks on a hungry forager, relative to signature forces
  hunt: 0.12,       // pull of living prey on a hungry forager
  kinCrowd: 0.06,   // upkeep added per crowding same-species neighbour, excluding bond partners
  kinFree: 4,       // same-species neighbours tolerated before crowding costs
  anchorCost: 0.003, // upkeep for resisting the currents
  flowFeed: 0.8,    // anchored photosynthesisers gain this much per 0.2 cells/s of current flowing past
  bodyThrift: 0.15, // upkeep saved by a cell with two bonds: bodies share the cost of living
  kinShade: 0.25,   // how much a bonded body shades itself, relative to strangers
  armor: 1,         // bonded bodies resist being killed or bitten
  searchImage: 0.7, // chance a hunter or grazer misses living prey unlike its last catch
  specPow: 2,       // >0: a diet's share d earns d^specPow of a specialist's take (0: d(0.4 + 0.6d)); steep: mixing pays little
  photoPow: 3,      // light earned grows as photo^photoPow: steep, and an animal with a little photosynthesis gets nearly none
  mutScale: 3,      // scale on every species' chance that a birth is a mutant (a new species)
  plantRefuge: 0.25,   // an attack on an animal fails with this × the producers close around (up to refugeMax): prey hide in meadows
  flee: 0.5,          // an animal that does not hunt is pushed away from hunters within reach at this × its swimming
  recognize: 0.4,     // living prey (and plants) escape an eater whose receptors do not match their surface: up to this
                    // share of attempts on a perfectly mismatched one (coevolution, frequency-dependent predation)
  matterSkill: 1.0,   // eating a husk succeeds with (eatEff × that diet) / this, certain past it (0: always)
  catchSkill: 0.6,  // catch chance scales with eating skill (eatEff × preference), reaching certainty here
  nutrHalf: 8.0,    // silt grains nearby at which photosynthesis runs at half speed
  allee: 0.65,      // producers grow at (1 - allee) of their rate alone, rising to full among 3 of their own species
  swimCost: 0.018,
  kin: 0.8,
  socialN: 24,      // pair forces are averaged past this many particles within reach
  tissueSig: 0.2,   // how much of their signature forces the tightest species' kin keep (contact shapes them)
  tightFrom: 0.5,   // the adhesion where bodies start to close into tissue...
  tightSpan: 0.4,   // ...and how much more until they are tissue through and through
  // a bonded species whose growth plan says so grows as a tree, bonded mother to daughter only, from its
  // tips at the angles its plan sets (growOf), so it branches, curls, forks and zigzags
  growStiff: 2,     // how firmly a tree holds its angles (bendOn), relative to its bonds' pull
  treeAge: 0.25,    // how fast a tree's cell ages once it has grown a daughter (1: as any cell)
  growTipA: 10,     // seconds an animal colony's tip waits before budding again if it grows from its tips (beat.w;
                    // others grow up first, mature, as every cell does: a plant tree's tips too, or trees outgrow single cells)
  growFeed: 1,      // with bodyShare, rate (per second) at which a tree's grown cells pass their surplus on to their daughters
  // swimming trees: a thin body slips along its length more easily than sideways (resistive force theory),
  // so a wave run down a tree by its beat genes (amplitude, frequency, wavelength) drives it through the water
  sideDrag: 5,      // a tree's cell's drag across its branch, relative to along it (1: the same every way)
  // a beating tree's muscles (beatPull): each bond's two cells are brought a share beatMix a step toward the
  // relative velocity the beat asks across it, a wave of heading swing beatGain x the amplitude gene, its
  // cells' lateral speed at most beatTop (world units/s per unit of size)
  beatMix: 0.25,
  beatGain: 6,
  beatTop: 4,
  beatMixC: 0.15,   // a coarse step's share (a 1/60 s step's would overshoot over its ticks), and how firmly a beating
  beatBendC: 0.25,  // tree holds its angles then, relative to growStiff (bent afresh each tick from where its partners go)
  treeBond: 3,      // a beating tree's bonds' pull, relative to a body's (bond): its beat swings its cells hard
  tailOdds: 1,      // a packed body's tails: the chance a bud at its edge starts one, times the tail gene, when no
  tailSpace: 0.6,   // tail of its kind is within this (world units); a tail grows 3 to tailMax cells by its length gene
  tailMax: 16,
  beatCost: 0.005,   // upkeep per unit of beat amplitude (radians) times frequency (Hz)
  bodyHold: 0.3,    // with bodyPush, the share of overlap undone each tick by velocity (contact as a constraint)
  bodyGive: 0.85,   // with bodyPush, how far cells may squash against each other first (share of touching; bonds rest at bondTouch)
  bodyPush: 30,     // contactMain: how hard overlapping cells' bodies push apart (units/s² per unit of overlap, summed; 0: off)
  crowdVisc: 20,    // contactMain: rate (per second) at which a cell crowded by four or more takes on the motion of those it touches
  tissue: 12,       // bodies as tissue: bonds pull both ways, a body's cells take on their partners' motion
                    // at this rate (per second), and a free bond slot only closes a triangle within the body
  huntCore: 0.15,   // how much of other species' personal space a hungry forager respects
  liveScan: 64,     // each grid cell's living are sorted first, and a cell weighs its living neighbours exactly up to this many (sampled evenly past it), sampling only the matter
  contactReach: 0.14, // contactMain: the largest radius a neighbour is taken to have (grid cells within touching are walked)...
  contactCap: 128,  // ...every living one up to this many in them, every so many past it
  maxScan: 112,     // neighbours a cell weighs per step in a crowd, sampled evenly (each counts for those skipped)
  diag: 0,          // 1: count K.diag's diagnostics into the ledger (DIAG_SLOTS; headless forks record them)
  affScale: 0.42,
  matterPull: 0.6,
  metab: 0.75,
  jitter: 0.5,
  colorMix: 0.02,
  baseMix: 0.04,
  maxSpeed: 7.0,
  photo: 5.3,       // energy per second for a pure photosynth in full light
  shadeP: 1.4,      // light per area: only photosynthesisers shade, this much per neighbour (a patch's light
                    // saturates, so a grazed meadow regrows: docs/ecosystem.md)
  align: 3.0,
  bond: 60,         // spring strength of bonds between cells of one body
  adhMin: 0.15,     // adhesion needed before a species forms bonds
  bite: 0.5,        // energy taken per bite from a photosynthesising cell (big enough to outpace a patch's regrowth: booms and crashes)
  eatEvery: 6,      // frames between meals
  dietMin: 0.15,    // share of the diet a food must have before a cell bothers to eat it
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
  refugeMax: 0.6,   // ...up to this (a leaky refuge: hunters at reefs still make a living)
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
  tRef: 16,         // the temperature at which husks wear at their base rates
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
  rotQ10: 2.5,      // husks rot this much faster per 10° above tRef
  abioHeat: 3,      // extra weight of sparks of life in hot water
  marangoni: 0,     // matter drifts from warm water toward cold at this many cells/s per °/cell
  bodyE: 1.3,       // energy a cell's body holds, by size: a child's body costs this, a death leaves it as the husk, and a kill
                    // passes on at most the prey's energy and body, so energy only enters as light
  assimilate: 1.5,  // an eater keeps this × its skill (specialisation × eatEff × warmth) of the energy in
  assimCap: 0.8,    // flesh, plants and husks, at most this share
  carcassKeep: 0.3, // the share of a killed cell's body left in its carcass (the killer gets the rest)
  provision: 60,     // a cell divides only once its child's share would cover this many seconds of its upkeep (feeding
                    // until then; 0: at divE): hunters, whose meals are far apart, raise viable young
  dungE: 0.6,       // what an eater cannot assimilate (of bites and kills) fills its gut and is dropped as a husk once it holds this much
  satiety: 1,       // a fed hunter rests: attacks on animals fall off as it nears the energy to divide (1: in proportion)
  satietyAt: 1.2,     // ...counting a hunter full at this × the energy to divide (above 1: it still hunts its way to dividing)
  holdfast: 0.1,      // scale on an anchored cell's velocity half-life (low advect): 0.1 and pushes barely move it
  mature: 0.2,        // a cell divides only once older than this share of its lifespan (it grows up first; 0: at once)
  bodyShare: 2,     // rate (per second) at which energy flows along a body's bonds toward the poorer cell
  tideSpeed: 3,     // scale on how fast the tide's bands of light travel
  cystAt: 0.3,      // a seed bank: an animal short of energy with no food in reach may go dormant (a cyst) below this share of its division energy...
  cystRate: 0.2,    // ...at this chance per second
  cystLeak: 0.002,  // energy a cyst loses per second (it dies as a husk at none)
  cystWake: 0.022,  // chance per second a cyst wakes (about every 90 s)
  foundHunt: 0.125, // the largest share of a new world's founding species that eat flesh (hunters, crawlers)
  foundEach: 2,     // every new world founds at least this many species of each core niche (producer, grazer, hunter, scavenger)
  // A new world starts as one recovering from a collapse (docs/founding.md): a little life in small
  // colonies in empty water, each colony a different community, so patches grow into a mosaic
  foundKinds: 96,   // founding species
  foundLife: 0.02,  // the share of a new world's particles alive at the start
  foundColonies: 48, // founding colonies...
  foundMixed: 6,    // ...each a community of about this many founding species...
  foundPatch: 3,    // ...about this many grid units across (the spread of a gaussian)
  foundHuntSleep: 300, // flesh-eating founders start as cysts that wake over about this many seconds, after their prey
  interfere: 0.6,     // a hunter misses living prey more among its own kind: catch chance / (1 + this × kin
                    // within reach, its bond partners aside)
  // The pool (docs/catastrophes.md): its floor's relief (src/geography.js) and the water level the climate sets
  // decide where it is dry. The water's edge drags stranded cells back with it; cells left on dry ground dry out
  // or rest as cysts until rain wets them again; grains and husks lie where the water left them.
  pond: 1,          // 0: the floor is never dry (no relief)
  filmR: 1.2,       // world units from the water's edge over which the film of water pulls stranded cells back
  meniscus: 2.5,    // how hard (units/s² at the edge, fading over filmR) the edge pulls a stranded cell toward the water
  dryDrag: 6,       // rate (per second) a stranded cell's motion dies away (it is stuck in the drying film)
  dryCyst: 0.25,    // chance per second a stranded cell rests as a cyst (any guild; a producer as a spore)
  dryCost: 0.08,    // energy per second a stranded cell that has not encysted loses as it dries
  dryRot: 0.15,     // how fast husks rot on dry ground, relative to in water
  rainWake: 12,     // cysts wake this much faster (× the rain) while rain falls: rain hatches the resting bank
  ringPull: 1.2,    // units/s at which matter near a receding edge is carried to it (× how fast it recedes):
                    // a drying edge strands grains in lines, as a coffee ring
  shoreCalm: 1.0,   // world units from the edge over which the currents die away
  edgeSway: 0.5,    // how far (units per unit/s of current toward or away from it) the water's edge creeps out or draws
                    // back as the currents push it, a meniscus on a film; raindrops' rings surge it too
  edgeWobble: 0.12, // and how far it wavers on its own, pinning and slipping on the grains (units)
  dropSpeed: 7,     // a raindrop's ring wave: speed (units/s), width (units) and how long it lasts (s)
  dropWidth: 2.5,
  dropLife: 5,
  // the climate's events (src/climate.js): the first no sooner than eventFirst minutes, then one about every
  // eventEvery minutes (0: none), drawn drought, storm, leaf, frost by eventMix; eventPlan forces some ("drought@900");
  // lowEras is the share of climate eras whose water stands low enough to show sandbars and islands
  eventEvery: 60,
  eventFirst: 25,
  eventMix: [0.35, 0.2, 0.2, 0.25],
  eventPlan: '',
  lowEras: 0.35,
  floorDrift: 0.3,  // the share of the floor's relief redrawn at each new era (moving geography: sediment shifts)
  // each event's draw (ranges): a drought's fall, hold and refill (s) and how low the water falls (the share of the
  // floor left wet); a storm's length (s); a leaf's length (share of the world's side), darkness and stay (s)
  droughtFall: [300, 480],
  droughtHold: [150, 300],
  droughtRefill: [90, 150],
  droughtLow: [0.35, 0.6],
  stormDur: [240, 420],
  // rain's weather (a storm's and a drought's refill), as shares of the full weather: cold (−4°), clouds (light
  // × 0.4 at full; at 0.35, × 0.79: full cloud starved the producers and crashed the pool, docs/catastrophes.md),
  // rough water (currents × 2.6), raindrops (about one a second)
  rainCold: 1,
  rainDark: 0.35,
  rainTurb: 1,
  rainDrops: 1,
  frostCold: 1,     // a frost's night, as shares of the full: cold (−10°) and dark (light × 0.4 at full)
  frostDark: 0.35,
  leafLen: [0.18, 0.32],
  leafDark: [0.75, 0.92],
  leafDur: [420, 720],
  // a frost's growth, hold and thaw (s), and the share of the pool it freezes
  frostGrow: [150, 270],
  frostHold: [120, 240],
  frostThaw: [100, 160],
  frostMax: [0.6, 0.85],
};

// WGSL for the energy in a body of genome expression G (K.bodyE by size), and a dying cell's litter flag
const litterOf = (G) => ` | select(0u, LITTER, ${G}.photo > 0.4)`;
const bodyOf = (K, G) => `${f(K.bodyE)} * ${G}.size`;

const packCol = (r, g, b) => (Math.round(r * 255) | (Math.round(g * 255) << 8) | (Math.round(b * 255) << 16) | (255 << 24)) >>> 0;
const f = (x) => {
  const s = String(x);
  return /[.eE]/.test(s) ? s : s + '.0';
};

// The kinds of sediment grain, shared by the stone pass (vsStone, mineralSurf) and the specimen panel:
// each kind's colour variants (a name and colour, from a share of grains on), and how bedrock and reef
// stone (laid down by calcifiers) mix them, as [kind, cumulative share].
export const STONE_KINDS = [
  [{ name: 'Quartz', col: [0.74, 0.75, 0.73] }, { from: 0.6, name: 'Smoky quartz', col: [0.56, 0.48, 0.41] }, { from: 0.9, name: 'Rose quartz', col: [0.82, 0.62, 0.64] }],
  [{ name: 'Pink feldspar', col: [0.95, 0.55, 0.42] }, { from: 0.6, name: 'Cream feldspar', col: [0.95, 0.85, 0.64] }],
  [{ name: 'Hornblende', col: [0.16, 0.18, 0.17] }, { from: 0.5, name: 'Hornblende', col: [0.18, 0.26, 0.15] }, { from: 0.85, name: 'Hornblende', col: [0.28, 0.15, 0.12] }],
  [{ name: 'Sand grain', col: [0.92, 0.78, 0.55] }, { from: 0.55, name: 'Sand grain', col: [0.76, 0.75, 0.72] }, { from: 0.85, name: 'Iron-stained sand grain', col: [0.9, 0.56, 0.32] }],
  [{ name: 'Foraminifer shell', col: [1.0, 0.95, 0.85] }, { from: 0.7, name: 'Foraminifer shell', col: [1.0, 0.8, 0.74] }],
  [{ name: 'Diatom', col: [0.74, 0.9, 0.84] }, { from: 0.6, name: 'Diatom', col: [0.9, 0.85, 0.55] }],
  [{ name: 'Shell fragment', col: [0.98, 0.9, 0.78] }, { from: 0.6, name: 'Shell fragment', col: [0.9, 0.7, 0.54] }],
  [{ name: 'Sponge spicule', col: [0.84, 0.87, 0.87] }],
];
const BEDROCK_MIX = [[0, 0.35], [1, 0.55], [2, 0.67], [3, 0.82], [4, 0.88], [5, 0.93], [6, 0.97], [7, 1]];
const REEF_MIX = [[4, 0.3], [6, 0.55], [3, 0.75], [5, 0.88], [7, 1]];
// renderHash (WGSL, below) on the CPU
const hashU = (id) => {
  let h = (Math.imul(id >>> 0, 747796405) + 2891336453) >>> 0;
  h = Math.imul(((h >>> ((h >>> 28) + 4)) ^ h) >>> 0, 277803737) >>> 0;
  return (((h >>> 22) ^ h) >>> 0) / 4294967296;
};
/** The kind of sediment a stone grain is drawn as (vsStone): { kind, name, col } from its id and info. */
export function stoneGrain(id, info) {
  const h = hashU(id ^ 0x9e3779b9), h2 = hashU(id ^ 0x85ebca6b);
  const kind = ((info & 15) !== 0 ? REEF_MIX : BEDROCK_MIX).find(([, upTo]) => h < upTo)?.[0] ?? 7;
  const v = STONE_KINDS[kind].filter((x) => !x.from || h2 > x.from).at(-1);
  return { kind, name: v.name, col: v.col };
}
// The same choices in WGSL: a nested select over the mix, and each kind's colour over its variants.
const v3 = (c) => `vec3f(${c.map(f).join(', ')})`;
const mixWGSL = (mix) => mix.slice(0, -1).reduceRight((e, [k, upTo]) => `select(${e}, ${k}u, h < ${f(upTo)})`, `${mix.at(-1)[0]}u`);
const STONE_COL_WGSL = STONE_KINDS.map((vs, k) => `      case ${k}u: { mc = ${vs.slice(1).reduce((e, x) => `select(${e}, ${v3(x.col)}, h2 > ${f(x.from)})`, v3(vs[0].col))}; }`).join('\n');

const COMMON = /* wgsl */ `
// Relief, as in DIC microscopy: one light from the upper left (screen y down) for every resolved shape.
const TO_LIGHT = vec2f(-0.633, -0.774);
const MAXK = ${MAXK}u;
const FIRST_LIFE = ${FIRST_LIFE}u;
const SILT = 0u;
const GLINT = 1u;  // a kind no longer made (glint): kept so the kind numbers hold
const HUSK = 2u;
// a husk left by a producer: plant litter, grazers' to break down; other husks are carcasses
const LITTER = 0x8000u;
// a dormant living cell: its cause code (info & 15)
const CYST = 14u;
// META_DEATH slots counting each guild's cysts, afresh each step (57-59, 61, 62; 60 is the litter)
fn cystSlot(gi: u32) -> u32 { return META_DEATH + select(57u + gi, 58u + gi, gi >= 3u); }
const STONE = 3u;
const FRAMBOID = ${FRAMBOID}u;
const NONE = 0xffffffffu;
// A claim made by a coarse step's walk (lifeMain) says what it is for itself rather than through the
// claimer's intent: bit 31, then a class in bits 29-30 (0 a kill, 1 unused, 2 a husk, each taken by the
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

// Info: 0..3 cause, 4..5 role, 6..15 search image, 16..27 generation, 28..29 a tree cell's turn, 30..31 its branch order
// (a packed body's tail cell: order 2, its generation counted from the tail's base).
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
  beat: vec4f,
  // a packed body's tails: how readily its edge buds one (x), how long one grows (y); zw spare
  tail: vec4f,
};

fn roleOf(info: u32) -> u32 { return (info >> 4u) & 3u; }
fn renderHash(id: u32) -> f32 {
  var h = id * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return f32((h >> 22u) ^ h) / 4294967296.0;
}
fn genOf(info: u32) -> u32 { return (info >> 16u) & 4095u; }
// A tree's cell: the turn it grew at from its mother (0 straight on, 1 left, 2 right) and its
// branch order (0: the main axis)
fn turnOf(info: u32) -> u32 { return (info >> 28u) & 3u; }
fn orderOf(info: u32) -> u32 { return info >> 30u; }
// A bonded species' growth plan, six genes in the developmental matrix's spare bytes: whether it grows as a
// tree; the angle its branches leave at; every how many cells along an axis it branches (0: never); how far
// each cell turns from the one before (curl: spirals and rings); the branching pattern (alternate,
// one-sided, opposite, forking, or alternate with the curl changing side cell by cell: a zigzag); and how
// many orders of branches branch again
struct Grow { tree: bool, angle: f32, every: u32, curl: f32, pattern: u32, depth: u32, beat: vec3f };
fn growOf(g: Genome) -> Grow {
  let w = unpack4x8unorm(g.dev.w);
  let every = g.dev.z >> 29u;
  let curl = w.y * 2.0 - 1.0;
  return Grow(g.dev.x >= 0x80000000u, mix(0.25, 2.1, f32(g.dev.y >> 24u) / 255.0), select(every, 2u, every == 1u),
    curl * curl * curl * 0.7, min(u32(w.z * 5.0), 4u), min(u32(w.w * 4.0), 3u), vec3f(g.beat.x, g.beat.y * TAU, g.beat.z));
}
// A packed body's tail: a cell of a species that is no tree, bonded, of branch order 2 (tailCell) grows as
// a straight filament from its base (a cell of the body), from its tip, and beats with the species' beat.
fn tailCell(g: Genome, info: u32) -> bool {
  return g.dev.x < 0x80000000u && g.adhesion > ${f(DEFAULT_K.adhMin)} && g.tail.x > 0.0 && orderOf(info) == 2u;
}
// A cell's growth plan: its species', or a tail's (straight, never branching)
fn growAt(g: Genome, info: u32) -> Grow {
  var gr = growOf(g);
  if (tailCell(g, info)) { gr.tree = true; gr.every = 0u; gr.curl = 0.0; gr.pattern = 0u; gr.depth = 0u; }
  return gr;
}

// The angle a daughter grows at from her mother's heading, by her turn and generation.
fn turnAngle(gr: Grow, turn: u32, gen: u32) -> f32 {
  let curl = select(gr.curl, -gr.curl, gr.pattern == 4u && (gen & 1u) == 1u);
  let side = select(0.0, 1.0, turn == 1u) - select(0.0, 1.0, turn == 2u);
  return curl + side * gr.angle * select(1.0, 0.5, gr.pattern == 3u);
}
// The daughters (bits by turn) a tree's cell of this generation and order grows.
fn growWants(gr: Grow, gen: u32, order: u32) -> u32 {
  if (gr.every == 0u || order >= gr.depth || gen % gr.every != 0u) { return 1u; }
  switch gr.pattern {
    case 1u: { return 3u; }
    case 2u: { return 7u; }
    case 3u: { return 6u; }
    default: { return select(5u, 3u, (gen / gr.every) % 2u == 0u); }
  }
}
fn rot2(v: vec2f, a: f32) -> vec2f {
  let c = cos(a); let s = sin(a);
  return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
}

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

// A leaf floating on the pool shades the water under it (docs/catastrophes.md): 0..1 at p, for a leaf centred at
// lf.xy, lf.z long from base to tip, its darkness lf.w (0: no leaf), turned lb.x, its outline drawn by seed lb.y
// and lb.z wide (relative to its length). Its edge is soft: it floats far above the focal plane.
fn leafShade(p: vec2f, lf: vec4f, lb: vec4f, world: vec2f) -> f32 {
  if (lf.w <= 0.0) { return 0.0; }
  var d = p - lf.xy;
  d -= world * round(d / world);
  let q = rot2(d, -lb.x) / lf.z;
  // ovate: widest a little toward the base, tapering to a point at the tip, the margin toothed
  let x = clamp(q.x, -1.0, 1.0);
  let hw = lb.z * pow(max(1.0 - x * x, 0.0), 0.7) * (1.0 - 0.25 * x) * (1.0 + 0.03 * sin(q.x * 31.0 + lb.y) + 0.02 * sin(q.x * 67.0 + lb.y * 3.1));
  let out = max(abs(q.y) - hw, abs(q.x) - 1.0) * lf.z;
  return lf.w * (1.0 - smoothstep(-1.5, 1.5, out));
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
// The water's temperature where a cell is, for passes that only show it (rendering, listening):
// bilinear between grid-cell centres, so a cell jostling across a grid line doesn't flick between
// its cells' temperatures (and its heat colour with them).
const shownWater = (world) => /* wgsl */ `
fn waterTempAt(p: vec2f) -> f32 {
  let g = vec2i(${world});
  let u = p - 0.5;
  let i = vec2i(floor(u));
  let t = u - floor(u);
  let x0 = ((i.x % g.x) + g.x) % g.x; let x1 = (x0 + 1) % g.x;
  let y0 = ((i.y % g.y) + g.y) % g.y; let y1 = (y0 + 1) % g.y;
  let row0 = MAX_CELLS + u32(y0 * g.x); let row1 = MAX_CELLS + u32(y1 * g.x);
  return mix(mix(heatField[row0 + u32(x0)], heatField[row0 + u32(x1)], t.x),
             mix(heatField[row1 + u32(x0)], heatField[row1 + u32(x1)], t.x), t.y);
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
  // its surface signature (x, y) and receptors (z, w), kept packed: sdot reads them as they are
  let myNorm = sdot(sg.x, sg.x) + sdot(sg.y, sg.y);
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
  // a coarse step, in lifeMainCoarse (COARSE: a 1/60 s step's pipeline leaves all of it out)
  let coarse = COARSE && sim.ticks > 1u;
  // Coarse steps also gather how the pair and stone forces change as this cell moves
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
  var crowdP = 0.0;
  var nutr = 0.0;
  var d1 = 1e9; var d2 = 1e9;
  var n1 = NONE; var n2 = NONE;
  if (bonding) {
    let kept = bondsOf(i);
    n1 = keepBond(i, kept.x, p);
    n2 = keepBond(i, kept.y, p);
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
  // a tree grows from its tips at the angles of its plan, bonded mother to daughter only
  let gr = growAt(g, p.info);
  let tree = bonding && gr.tree;
  // a tail cell (a packed body's), and a cell of such a body that bears tails (tails: its species' habit)
  let tail = tree && tailCell(g, p.info);
  let tails = bonding && !tree && g.tail.x > 0.0;
  // how tightly its bodies hold: the most adhesive species grow tissue, membrane to membrane; the
  // least keep open, strung-out bodies (a tree's cells touch)
  let tight = select(clamp((g.adhesion - ${f(K.tightFrom)}) / ${f(K.tightSpan)}, 0.0, 1.0), 1.0, tree);

  let bondRest = 0.0;
  // warmth: the water here, plus a heat-maker's own (a body insulates its cells)
  let thermo = thermoOf(g);
  let heat = heatSample(p.pos);
  let Tc = heat.x + ${f(K.selfWarm)} * thermo * (1.0 + 0.5 * (select(0.0, 1.0, keep1) + select(0.0, 1.0, keep2)));
  let th = cellThermal(g, Tc);
  // a torpid cell neither hunts, grazes nor divides
  // a child's body costs bodyCost (K.bodyE, by size); divE: the energy a cell divides at, reproE beyond it
  let bodyCost = ${bodyOf(K, 'g')};
  let divE = g.reproE + bodyCost + max(0.0, bodyCost + ${f(K.provision)} * g.metab / g.share - g.reproE - bodyCost);
  let hungry = p.energy < divE * ${f(K.sated)} && eatEff > 0.1 && !th.torpid;
  let canHunt = (g.dFlesh > DIET_MIN || g.dGlint > DIET_MIN) && hungry;
  // food in reach is gathered by hungry cells; in a coarse step also by any that may grow hungry in it
  let seek = hungry || (coarse && eatEff > 0.1 && !th.torpid);
  let seekHunt = canHunt || (seek && (g.dFlesh > DIET_MIN || g.dGlint > DIET_MIN));
  var food = NONE; var foodScore = -1e9;
  // a coarse step keeps the four best, for its meals and for claims lost to other eaters
  var fc = array<u32, 4>(NONE, NONE, NONE, NONE);
  var fsc = array<f32, 4>(-1e9, -1e9, -1e9, -1e9);
  var silt = NONE; var siltD = 1e9;
  var silt2 = NONE; var siltD2 = 1e9;
  var stoneF = vec2f(0.0);
  var stoneN = 0.0;
  var plantN = 0.0;
  var animN = 0.0;
  var pack = 0.0;
  // (K.diag: neighbours inside this cell's core; animals within reach and twice reach)
  var overlap = 0.0;
  var nIn = 0.0;
  var preyNear = vec2f(0.0);
  var s = pcg(p.id ^ pcg(sim.frame * 747796405u + sim.seed));
  // a tree grows from its tips: the daughter this cell lacks (budTurn; 3: none), where she would grow
  // (budAt, from here) and whether a cell is in the way (budBlocked)
  var budTurn = 3u;
  var budAt = vec2f(0.0);
  var budBlocked = false;
  var hasKid = false;
  // (a tail of its own kind within tailSpace: a body bearing tails buds no other there)
  var tailNear = false;
  let budGap = 0.9 * 0.085 * g.size * (2.0 - 0.24 * f32(role));
  if (tree) {
    var have = 0u;
    for (var k = 0u; k < min(backOf(i, 0u), 3u); k++) {
      let c = backOf(i, 1u + k);
      if (c < sim.count && sortedFull[c].kind == p.kind) { have |= 1u << turnOf(sortedFull[c].info); }
    }
    hasKid = have != 0u;
    // (a tail grows to its length)
    let miss = select(growWants(gr, genOf(p.info), orderOf(p.info)), 0u, tail && genOf(p.info) + 1u >= tailLen(g)) & ~have;
    if (miss != 0u) {
      budTurn = firstTrailingBit(miss);
      let hd = headingOf(i, gr);
      budAt = rot2(hd.dir, turnAngle(gr, budTurn, genOf(p.info) + 1u)) * budGap;
    }
  }
  // a body bearing tails may start one at a bud, straight out from the partner it holds first (budTurn 0
  // here only asks the scan whether a cell is in the way)
  if (tails && n1 != NONE) { budTurn = 0u; budAt = -dn1 / max(d1, 1e-4) * budGap; }

  // The 3x3 neighbourhood as eighteen index ranges: each grid cell's living (first in it), then each
  // one's matter. The living are weighed exactly (sampled evenly past liveScan of them), the matter
  // sampled with what the budget leaves: in a heap of grains a cell still feels every cell it touches.
  // (each range is read from cellStart again as the scan reaches it: kept in arrays they cost registers)
  // How sparsely to sample is set by the crowd as it varies smoothly over the water (the grid cells'
  // counts interpolated between their centres, at this cell), not by the nine cells' totals, which jump
  // as the cell crosses a grid line: those jumps showed as cells gathering in grid-cell middles.
  var totL = 0.0;
  var totM = 0.0;
  // (and never below a third of what the nine cells' totals ask, so beside a heap the scan stays short)
  var allL = 0u;
  var allM = 0u;
  let mid = p.pos - vec2f(cc) - 0.5;
  for (var c9 = 0; c9 < 9; c9++) {
    let c = u32(((cc.y + c9 / 3 - 1 + gh) % gh) * gw + (cc.x + c9 % 3 - 1 + gw) % gw);
    let a0 = cellStart[c];
    let lv = cellStart[LIVE_AT + c];
    let e0 = cellStart[c + 1u];
    let tent = max(vec2f(0.0), 1.0 - abs(vec2f(f32(c9 % 3 - 1), f32(c9 / 3 - 1)) - mid));
    let w = tent.x * tent.y * 9.0;
    totL += f32(lv) * w; totM += f32(e0 - a0 - lv) * w;
    allL += lv; allM += e0 - a0 - lv;
  }
  let strideL = max(1.0, max(totL, f32(allL) / 3.0) / ${f(K.liveScan)});
  let strideM = max(1.0, max(totM, f32(allM) / 3.0) / max(f32(sim.maxScan) - min(totL, ${f(K.liveScan)}), 48.0));
  // sums are scaled by strideM after the scan, the living's by strideL / strideM at the switch below
  let stride = strideM;
  var st = strideL;
  var at = select(0.0, rnd(&s) * strideL, strideL > 1.0);
  for (var k = 0u; k < 18u; k++) {
    if (k == 9u) {
      let toM = strideL / strideM;
      overlap *= toM; preyNear *= toM; force *= toM; crowd *= toM; crowdP *= toM; pack *= toM; kinVel *= toM; kinN *= toM; jF *= toM; nIn *= toM;
      st = strideM;
      at = select(0.0, rnd(&s) * strideM, strideM > 1.0);
    }
    let live = k < 9u;
    let k9 = i32(k % 9u);
    let cell = u32(((cc.y + k9 / 3 - 1 + gh) % gh) * gw + (cc.x + k9 % 3 - 1 + gw) % gw);
    let cs0 = cellStart[cell];
    let lvk = cellStart[LIVE_AT + cell];
    let rs0 = select(cs0 + lvk, cs0, live);
    let len = f32(select(cellStart[cell + 1u] - cs0 - lvk, lvk, live));
    for (; at < len; at += st) {
      let j = rs0 + u32(at);
      let q = sortedLite[j];
      var d = q.pos - p.pos;
      d -= world * round(d * invWorld);
      let r2 = dot(d, d);
      if (r2 >= R2 || r2 < 1e-12) { continue; }
      nIn += 1.0;
      let r = sqrt(r2);
      let x = r * invR;
      let qk = q.kr & 1023u;
      let a = clamp((sdot(sg.z, q.s0) + sdot(sg.w, q.s1)) * ${f(K.affScale)}, -1.0, 1.0);
      // A tight body's kin keep personal space only down to touching (where their two roles' sizes
      // meet), so they press membrane to membrane, and keep less of their signature forces beyond it.
      var bk = beta; var invBk = invBeta; var invOMk = invOM; var sigK = 1.0;
      // (a body and its tails meet as a tail's cells meet: touching, no pull, alike from either side)
      let withTail = qk == p.kind && (tail || (q.kr & (1u << 15u)) != 0u);
      let tightQ = select(tight, 1.0, withTail);
      if (tightQ > 0.0 && qk == p.kind) {
        let tq = 0.085 * g.size * (2.0 - 0.12 * f32(role + ((q.kr >> 10u) & 3u)));
        bk = mix(beta, min(beta, tq * invR), tightQ);
        invBk = 1.0 / bk;
        invOMk = 1.0 / (1.0 - bk);
        sigK = mix(1.0, ${f(K.tissueSig)}, tightQ);
        // a tree's shape is its bonds': its branches neither draw together nor apart
        if (tree || withTail) { sigK = 0.0; }
      }
      let shape = 1.0 - abs(2.0 * x - 1.0 - bk) * invOMk;
      var fr: f32;
      // how fr changes with distance (coarse steps' gradient), and the pull that scales shape
      var dfr = 0.0;
      var pull = 0.0;
      if (qk >= FIRST_LIFE) {
        // its own kind in the way stops it (a tree fills space without overlapping itself); strangers are shoved aside
        if (budTurn < 3u && qk == p.kind && distance(d, budAt) < 0.7 * budGap) { budBlocked = true; }
        // a hungry forager lets other species inside its personal space so it can reach them
        let core = select(1.0, ${f(K.huntCore)}, canHunt && qk != p.kind);
        if (x < bk) { fr = (x * invBk - 1.0) * core; } else { fr = a * shape * sigK; }${W('mFr0 = fr; mFl = 0.0;')}
        // hungry foragers are drawn toward the cells their diet favours
        if ((q.kr & (1u << 12u)) != 0u && r < 0.5) { plantN += 1.0; }
        if ((q.kr & (1u << 12u)) == 0u && qk != p.kind) { animN += 1.0; }
        let appetite = select(0.0, select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, (q.kr & (1u << 12u)) != 0u) * eatEff * ${f(K.hunt)}, canHunt && qk != p.kind);
        if (x >= bk) { fr += appetite * shape; pull = a + appetite; } else { dfr = core * invBk * invR; }
        // an animal that is not a hunter swims away from hunters near it, the harder the closer they are
        if ((q.kr & (1u << 14u)) != 0u && qk != p.kind && g.dFlesh <= 0.5 && g.photo <= 0.4) { fr -= ${f(K.flee)} * min(g.swim, 1.0) * (1.0 - x);${W(`mFl = ${f(K.flee)} * min(g.swim, 1.0) * (1.0 - x);`)} }
        crowd += (1.0 - x) * select(1.0, ${f(K.kinShade)}, bonding && qk == p.kind);
        if ((q.kr & (1u << 12u)) != 0u) { crowdP += (1.0 - x) * select(1.0, ${f(K.kinShade)}, bonding && qk == p.kind); }
        if (DIAG) {
          if (x < beta) { overlap += 1.0; }
          if (qk != p.kind && (q.kr & (1u << 12u)) == 0u && r < 2.0 * EAT_R) { preyNear += vec2f(select(0.0, 1.0, r < EAT_R), 1.0); }
        }
        if (r < LINK_R) { let w = 1.0 - r / LINK_R; pack += w * w; }
        if (qk == p.kind) {
          kinVel += unpack2x16float(q.vel);
          kinN += 1.0;
          if ((q.kr & (1u << 15u)) != 0u && r < ${f(K.tailSpace)}) { tailNear = true; }
        }
        if (r < LINK_R) {
          // colour only blends within a species, so mixed neighbourhoods stay visibly mixed
          if (qk == p.kind) {
            let w = 1.0 - r / LINK_R;
            csum += unpack4x8unorm(q.col).rgb * w;
            wsum += w;
          }
          if (bonding && !tree && qk == p.kind && j != n1 && j != n2 && (q.kr & ((1u << 13u) | (1u << 15u))) == 0u && ((!keep1 && r < d1) || (!keep2 && r < d2)) && joinable(i, j, select(NONE, n1, keep1), select(NONE, n2, keep2))) {
            if (!keep1 && r < d1) {
              if (!keep2) { d2 = d1; n2 = n1; dn2 = dn1; }
              d1 = r; n1 = j; dn1 = d;
            } else if (!keep2 && r < d2) { d2 = r; n2 = j; dn2 = d; }
          }
        }
        if (seekHunt && r < EAT_R && qk != p.kind && (q.kr & (1u << 13u)) == 0u) {
          // how far its signature is from this cell's: |s - my|^2
          let far = sdot(q.s0, q.s0) + sdot(q.s1, q.s1) - 2.0 * (sdot(q.s0, sg.x) + sdot(q.s1, sg.y)) + myNorm;
          if (far > ${f(K.kin)}) {
            // grazers crop plant cells; flesh-eaters hunt animals (and crop plants reluctantly)
            let plant = (q.kr & (1u << 12u)) != 0u;
            let pref = select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, plant);
            let sc = pref - r;
            if (pref > DIET_MIN && sc > foodScore) { foodScore = sc; food = j; }
            if (pref > DIET_MIN && coarse) { pushFood(&fc, &fsc, j, sc); }
          }
        }
      } else {
        fr = select(0.0, a * shape * ${f(K.matterPull)}, x >= beta);${W('mFr0 = fr; mFl = 0.0;')}
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
            fr += g.dHusk * eatEff * ${f(K.forage)} * shape;
            pull += g.dHusk * eatEff * ${f(K.forage)};
          }
          if (qk == SILT) { nutr += 1.0; }
          // a cell ready to divide looks for a grain every tick, so in a coarse step a grain counts if it
          // came within reach at any tick of it: the closest approach of their paths over the step
          var rc = r;
          if (qk == SILT && coarse) {
            let w = unpack2x16float(q.vel) - selfVel;
            let ww = dot(w, w);
            rc = length(d + w * select(0.0, clamp(-dot(d, w) / ww, 0.0, sim.dt), ww > 1e-12));
          }
          if (qk == SILT && rc < EAT_R) {
            if (rc < siltD) { siltD2 = siltD; silt2 = silt; siltD = rc; silt = j; }
            else if (rc < siltD2) { siltD2 = rc; silt2 = j; }
          } else if (qk != SILT && r < EAT_R && seek) {
            let dv = g.dHusk;
            let sc = dv - r;
            if (dv > DIET_MIN && sc > foodScore) { foodScore = sc; food = j; }
            if (dv > DIET_MIN && coarse) { pushFood(&fc, &fsc, j, sc); }
          }
        }
      }
      if (x >= bk) { dfr = select(-2.0, 2.0, 2.0 * x < 1.0 + bk) * invOMk * invR * pull; }
      force += d * (fr / r);${W('mPair(j, q, d, r, x < beta, qk == p.kind, mFr0, fr);')}
      if (coarse) {
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
  force *= stride;
  // a cell answers its neighbours as a whole, not each one in full: past socialN within reach the pair
  // forces are averaged, so a crowd drives a cell no harder than a neighbourhood does
  let social = ${f(K.socialN)} / max(${f(K.socialN)}, nIn * stride);
  force *= social; jF *= social;
  // whether a bud of a body bearing tails, if it buds now, starts a tail (none of its kind near, room ahead)
  let sprout = tails && budTurn == 0u && !budBlocked && !tailNear && rnd(&s) < g.tail.x * ${f(K.tailOdds)};
  crowd *= stride; pack *= stride; nutr *= stride; kinVel *= stride; kinN *= stride; stoneF *= stride; stoneN *= stride; plantN *= stride; animN *= stride;

  let heavy = 1.0 - 0.7 * g.photo;
  // Persistent bonds pull on the partners' current positions, even outside the sampled scan.
  var bondF = vec2f(0.0);
  // the partners that keep this cell (a tissue's bonds pull both ways), read now rather than held
  // through the scan (it is short of registers)
  var nb0 = NONE; var nb1 = NONE; var nb2 = NONE;
  if (bonding) {
    let c = min(backOf(i, 0u), 3u);
    if (c > 0u) { nb0 = keepBond(i, backOf(i, 1u), p); }
    if (c > 1u) { nb1 = keepBond(i, backOf(i, 2u), p); }
    if (c > 2u) { nb2 = keepBond(i, backOf(i, 3u), p); }
    // one the scan took up as a new partner is already held
    if (nb0 == n1 || nb0 == n2) { nb0 = NONE; }
    if (nb1 == n1 || nb1 == n2) { nb1 = NONE; }
    if (nb2 == n1 || nb2 == n2) { nb2 = NONE; }
  }
  // each bond rests where its two cells touch (both agree on it: their roles' sizes summed)
  let rs1 = restTo(n1, g.size, role, tight); let rs2 = restTo(n2, g.size, role, tight);
  let rb0 = restTo(nb0, g.size, role, tight); let rb1 = restTo(nb1, g.size, role, tight); let rb2 = restTo(nb2, g.size, role, tight);
  if (n1 != NONE) { bondF += dn1 * ((d1 - rs1) / max(d1, 1e-4)); }
  if (n2 != NONE) { bondF += dn2 * ((d2 - rs2) / max(d2, 1e-4)); }
  let e0 = bondTo(nb0, p); let e1 = bondTo(nb1, p); let e2 = bondTo(nb2, p);
  if (nb0 != NONE) { bondF += e0 * ((length(e0) - rb0) / max(length(e0), 1e-4)); }
  if (nb1 != NONE) { bondF += e1 * ((length(e1) - rb1) / max(length(e1), 1e-4)); }
  if (nb2 != NONE) { bondF += e2 * ((length(e2) - rb2) / max(length(e2), 1e-4)); }
  // a tree holds its angles (bendOn); coarse steps hold each cell's place beside its mother as they go
  // (a beating tree's cells move against their mother: they bend afresh each tick instead, and more softly)
  let beating = tree && gr.beat.x > 0.0;
  let bendK = ${f(K.growStiff)} * select(1.0, ${f(K.beatBendC)}, coarse && gr.beat.x > 0.0);
  var bendF = vec2f(0.0);
  if (tree) { bendF = bendOn(i, gr) * bendK; bondF += bendF; }
  // a body bearing tails takes its share of the bend at each tail's base (where the base is the middle)
  else if (tails) { bendF = tailBases(i, nb0, nb1, nb2) * bendK; bondF += bendF; }
  // a tail's base is held to its body by an ordinary bond, as the body holds it (not treeBond)
  let baseOn = tail && n1 != NONE && !treeCellAt(n1);
  let baseB = select(vec2f(0.0), dn1 * ((d1 - rs1) / max(d1, 1e-4)), baseOn);
  let aimOn = tree && n1 != NONE && !beating;
  // the water's edge: a cell on dry ground is stranded (it cannot swim, and the film pulls it back toward the water)
  let pond = pondAt(p.pos);
  let shore = shoreDist(pond);
  let stranded = pond.x < 0.0;
  let swim = g.swim * (1.0 - g.photo) * min(th.perf, 1.0) * select(1.0, 0.0, stranded);
  let flow = flowAt(p.pos) * g.advect;
  // a holdfast: a cell the current hardly carries (advect below 0.35, fully below 0.1) is anchored, and
  // pushes barely move it (its velocity decays K.holdfast times as fast)
  let drag = g.drag * mix(1.0, ${f(K.holdfast)}, smoothstep(0.35, 0.1, g.advect));
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
  if (coarse && wN2 > 0.0) {
    let cf = g.force * heavy;
    let cw = ${f(K.stoneWall)} * (1.0 - g.calcify);
    let D = -(restoring(jF * stride) * cf + restoring(jS * stride) * cw);
    let a0 = force * cf + stoneF * cw;
    let vNear = vN / wN;
    let Mn = wN * wN / wN2;
    let frT = pow(0.5, sim.dt / drag);
    let G = (1.0 - frT) * drag / 0.69314718;
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
  let fr0 = pow(0.5, h / drag);
  // a tree's cell is drawn out along its branch: across it the water holds it sideDrag times as hard
  var across = vec2f(0.0);
  var frX = fr0;
  if (tree) {
    let arm = treeArm(i);
    if (arm != NONE) { let a = treeRel(i, arm); across = vec2f(-a.y, a.x) / max(length(a), 1e-6); frX = pow(0.5, h * ${f(K.sideDrag)} / drag); }
  }
  // a tree's muscles and tissue (beatPull), reckoned once a step
  var beatDv = vec2f(0.0);
  if (beating) { beatDv = beatPull(i, gr, g.size, frX); }
  var vB1 = vec2f(0.0);
  var vB2 = vec2f(0.0);
  if (n1 != NONE) { vB1 = sortedFull[n1].vel; }
  if (n2 != NONE) { vB2 = sortedFull[n2].vel; }
  var vb0 = vec2f(0.0); var vb1 = vec2f(0.0); var vb2 = vec2f(0.0);
  if (nb0 != NONE) { vb0 = sortedFull[nb0].vel; }
  if (nb1 != NONE) { vb1 = sortedFull[nb1].vel; }
  if (nb2 != NONE) { vb2 = sortedFull[nb2].vel; }
  // the body's motion around this cell: its partners' mean velocity
  // (a body bearing tails leaves its tails out: they move by their muscles)
  let w0 = select(0.0, 1.0, nb0 != NONE && !(tails && orderOf(sortedFull[nb0].info) == 2u));
  let w1 = select(0.0, 1.0, nb1 != NONE && !(tails && orderOf(sortedFull[nb1].info) == 2u));
  let w2 = select(0.0, 1.0, nb2 != NONE && !(tails && orderOf(sortedFull[nb2].info) == 2u));
  let nP = select(0.0, 1.0, n1 != NONE) + select(0.0, 1.0, n2 != NONE) + w0 + w1 + w2;
  let vP = (vB1 + vB2 + vb0 * w0 + vb1 * w1 + vb2 * w2) / max(nP, 1.0);
  // a body feeds its cells: energy flows along each bond toward the poorer partner, the same amount
  // either way (both read this step's start), so a hunter at the edge keeps the interior alive
  let shareK = min(0.2, ${f(K.bodyShare)} * sim.dt);
  var shareE = 0.0;
  if (n1 != NONE) { shareE += sortedFull[n1].energy - p.energy; }
  if (n2 != NONE) { shareE += sortedFull[n2].energy - p.energy; }
  if (nb0 != NONE) { shareE += sortedFull[nb0].energy - p.energy; }
  if (nb1 != NONE) { shareE += sortedFull[nb1].energy - p.energy; }
  if (nb2 != NONE) { shareE += sortedFull[nb2].energy - p.energy; }
  shareE *= shareK;
  // a tree feeds its tips instead, as a plant's sugars flow to where it grows: a cell whose daughters are
  // all grown passes them its surplus over half its division energy (mother and daughter reckon it alike)
  if (tree) {
    let keep = 0.5 * divE;
    let rate = min(0.5, ${f(K.growFeed)} * sim.dt);
    shareE = -feedOf(i, gr, keep, rate).y;
    // (a tail's base shares with the body's cell it grows from as the body's cells share)
    if (baseOn) { shareE += (sortedFull[n1].energy - p.energy) * shareK; }
    else if (n1 != NONE) { shareE += feedOf(n1, gr, keep, rate).x; }
  }
  var vel = p.vel;
  var pos = p.pos;
  // a beating tree's cells are held end to end more firmly than a body's (treeBond): its beat swings them hard
  let bondK = select(1.0, ${f(K.treeBond)}, beating);
  for (var k = 0u; k < select(1u, sim.ticks, COARSE); k++) {
    var fb = (bondF - bendF - baseB) * bondK + baseB + bendF;
    if (k > 0u) {
      let t = f32(k) * h;
      let moved = pos - p.pos;
      fb = vec2f(0.0);
      var fb1 = vec2f(0.0);
      if (n1 != NONE) { let e = dn1 + vB1 * t - moved; let l = length(e); fb1 = e * ((l - rs1) / max(l, 1e-4)); }
      if (n2 != NONE) { let e = dn2 + vB2 * t - moved; let l = length(e); fb += e * ((l - rs2) / max(l, 1e-4)); }
      if (nb0 != NONE) { let e = e0 + vb0 * t - moved; let l = length(e); fb += e * ((l - rb0) / max(l, 1e-4)); }
      if (nb1 != NONE) { let e = e1 + vb1 * t - moved; let l = length(e); fb += e * ((l - rb1) / max(l, 1e-4)); }
      if (nb2 != NONE) { let e = e2 + vb2 * t - moved; let l = length(e); fb += e * ((l - rb2) / max(l, 1e-4)); }
      fb = (fb + select(fb1, vec2f(0.0), baseOn)) * bondK + select(vec2f(0.0), fb1, baseOn);
      if (tree || tails) {
        if (beating) { predT = t; predSelf = i; predPos = pos; fb += bendOn(i, gr) * bendK; predT = 0.0; }
        else { fb += bendF; }
      }
      if (aimOn) { fb += (vB1 * t - moved) * ${f(K.growStiff)}; }
    }
    vel = vel * fr0 - across * (dot(vel, across) * (fr0 - frX)) + force * (g.force * heavy * h) + stiff * h;${W('if (k == 0u) { mVel = vel; }')}
    // (a tree's cells move together through their bonds: aligning would damp its beat)
    if (kinN > 0.0 && g.align > 0.0 && !tree) {
      vel = mix(vel, kinVel / kinN, clamp(g.align * ${f(K.align)} * h, 0.0, 1.0));${W('if (k == 0u) { mAlign = vel - mVel; }')}
    }
    vel += fb * (g.adhesion * ${f(K.bond)} * h);
    // a body's cells move together: each takes on its partners' motion (a beating tree's, bond by bond, as its muscles beat)
    if (beating) { vel += beatDv * (1.0 / f32(sim.ticks)); }
    else if (nP > 0.0) { vel = mix(vel, vP, clamp(${f(K.tissue)} * h, 0.0, 1.0)); }
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
    if (stranded) {
      vel = vel * exp(-${f(K.dryDrag)} * h) - pond.yz / max(length(pond.yz), 1e-4) * (${f(K.meniscus)} * (1.0 - smoothstep(0.0, ${f(K.filmR)}, -shore)) * h);
    }
    let sp = length(vel);
    if (sp > sim.maxSpeed) { vel *= sim.maxSpeed / sp; }
    pos += (vel + flow) * h;
  }
  pos = wrapPos(pos);

  var col = unpack4x8unorm(p.col).rgb;
  // the gut: what an eater could not assimilate, held in the colour's spare byte (1: empty) until dropped as dung
  var gut = (1.0 - unpack4x8unorm(p.col).a) * ${f(K.dungE)};
  if (wsum > 0.0) { col = mix(col, csum / wsum, ${f(K.colorMix)}); }
  col = mix(col, roleColor(g, role), ${f(K.baseMix)});

  let light = lightAt(p.pos);
  // photosynthesis needs minerals: silt within reach. Drifters ride along with their own (depleting)
  // water; anchored cells have fresh silt carried past them by the currents.
  let photoGain = th.perf * pow(g.photo, ${f(K.photoPow)}) * light * ${f(K.photo)} / (1.0 + crowdP * ${f(K.shadeP)}) * (nutr / (nutr + ${f(K.nutrHalf)})) * (1.0 + ${f(K.nutrHalf)} / 20.0)
    * (1.0 + ${f(K.flowFeed)} * (1.0 - g.advect) * min(length(flowAt(p.pos)) / 0.2, 2.0))
    // Allee effect: a producer thrives among its own kind; a lone one grows slowly, so grazed-bare water stays bare a while
    * (1.0 - ${f(K.allee)} + ${f(K.allee)} * min(kinN / 3.0, 1.0))
    // no light reaches a stranded cell's chloroplasts through a drying film
    * select(1.0, 0.0, stranded);
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

// dp4a: the WGSL language feature packed_4x8_integer_dot_product is available
export function simWGSL(K, { dp4a = false } = {}) {
  // reef stone's neighbourhood: a disc of the square's area (side 2 regionR + 1), in cells, and its reach
  const REGION_DISC = (2 * (K.regionR | 0) + 1) / Math.sqrt(Math.PI);
  const REGION_REACH = Math.ceil(REGION_DISC + 0.5);
  return COMMON + /* wgsl */ `
// Coarse steps (sim.ticks > 1) run lifeMain and mindMain as pipelines of their own (lifeMainCoarse):
// a 1/60 s step's leaves out everything only a coarse step needs, which saves it registers.
override COARSE = false;
struct Sim {
  world: vec2f, grid: vec2u,
  count: u32, frame: u32, dt: f32, time: f32,
  season: f32, abio: f32, seed: u32, maxSpeed: f32,
  seedKinds: u32, pSilt: f32, spare14: f32, pHusk: f32,
  ambient: f32, spare17: f32, spare18: f32, spare19: f32,
  waves: array<vec4f, 4>,
  tide: array<vec4f, 4>,
  tidePh: vec4f,
  rock: vec4f,
  // tick: 1/60 s ticks simulated up to the end of this step; ticks: how many this step covers;
  // tbg: the background water temperature (climate, season, excursion); maxScan: the neighbour budget
  tick: u32, ticks: u32, tbg: f32, maxScan: u32,
  // the pool (docs/catastrophes.md): x the water level (a relief quantile; at 1 or above nothing is dry), y rain
  // (0..1), z the sky (light ×: clouds), w how fast the water is drying (0..1)
  pond: vec4f,
  // x the currents' strength ×; y frost (the share of the pool frozen); z how fast the ice is growing (0..1); w spare
  weather: vec4f,
  // a floating leaf's shadow: centre, radius, darkness (0: none); angle, shape seed, elongation, spare
  leaf: vec4f,
  leafB: vec4f,
  // raindrops' ring waves: centre, the time it fell, strength (0: none)
  drops: array<vec4f, 4>,
};
// kr: 0..9 kind, 10..11 role, 12 plant, 13 cyst, 14 hunter, 15 tail cell.
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
// cellStart[LIVE_AT + c]: how many of grid cell c's particles are living (they come first in it)
const LIVE_AT = MAX_CELLS + 1u;
// aux.y: a particle's rank among its grid cell's living (this bit set) or its matter
const LIVE_BIT = 0x80000000u;
// Intent: x bits 0..1 action (0 none, 1 eat, 2 birth, 3 bite),
// 2..11 child kind (birth) or observed target kind (eat/bite),
// 12..13 child role, 14..30 child generation; y child energy, z/w bond neighbours.
@group(0) @binding(9) var<storage, read_write> intent: array<vec4u>;
@group(0) @binding(10) var<storage, read_write> genomes: array<Genome>;
@group(0) @binding(11) var<storage, read_write> ledger: array<atomic<u32>>;
@group(0) @binding(12) var<storage, read_write> livingList: array<u32>;
// 0 living count, 1..3 life dispatch, 4..7 line draw, 8..11 stone draw (for rendering).
@group(0) @binding(13) var<storage, read_write> frameCtr: array<atomic<u32>, 12>;
// Grains of reef stone in each grid cell (low 16 bits, in REEF_FIX parts, shared with the cells around
// each grain) and of bedrock (high 16), counted while binning.
@group(0) @binding(14) var<storage, read_write> stoneGrid: array<atomic<u32>>;
// Every grain of stone, gathered while matter moves, so rendering draws stone without scanning all.
@group(0) @binding(16) var<storage, read_write> stoneList: array<u32>;
// Each cell's bonds, six words a cell: the two it keeps, then the cells that keep a bond to
// it (bondBackMain): a count and up to three of them
// read plainly (binding 15); bondBackMain appends to it through bondsAt (binding 20, the same buffer)
@group(0) @binding(15) var<storage, read_write> bondsNow: array<u32>;
@group(0) @binding(20) var<storage, read_write> bondsAt: array<atomic<u32>>;
fn bondsOf(i: u32) -> vec2u { return vec2u(bondsNow[i * 6u], bondsNow[i * 6u + 1u]); }
fn backOf(i: u32, k: u32) -> u32 { return bondsNow[i * 6u + 2u + k]; }
// The heat field: [0, MAX_CELLS) deposits this step (HEAT_FIX per degree), then the water's
// temperature per grid cell (f32 bits), then husks per grid cell this step. heatMain writes the next
// temperatures to heatNext.
@group(0) @binding(18) var<storage, read_write> thermal: array<atomic<u32>>;
@group(0) @binding(19) var<storage, read_write> heatNext: array<f32>;

const EAT_R = ${f(K.eatR)};
const DIAG = ${K.diag ? 'true' : 'false'};
const LINK_R = ${f(K.linkR)};
const DIET_MIN = ${f(K.dietMin)};
const HEAT_ON = ${K.heat ? 'true' : 'false'};
const POND = ${K.pond ? 'true' : 'false'};
const TREF = ${f(K.tRef)};
const HEAT_FIX = ${f(HEAT_FIX)};
const FRAMBOID_COL = ${packCol(0.8, 0.7, 0.45)}u;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(s: ptr<function, u32>) -> f32 { *s = pcg(*s); return f32(*s >> 8u) / 16777216.0; }
// The dot product of two signatures packed as 4x8 snorm, exactly (whole numbers over 127^2).
fn sdot(a: u32, b: u32) -> f32 { return ${dp4a ? `f32(dot4I8Packed(a, b)) * ${f(1 / 16129)}` : 'dot(unpack4x8snorm(a), unpack4x8snorm(b))'}; }
fn gauss(s: ptr<function, u32>) -> f32 { return (rnd(s) + rnd(s) + rnd(s) - 1.5) * 2.0; }
fn g4(s: ptr<function, u32>) -> vec4f { return vec4f(gauss(s), gauss(s), gauss(s), gauss(s)); }
fn r4(s: ptr<function, u32>) -> vec4f { return vec4f(rnd(s), rnd(s), rnd(s), rnd(s)) * 2.0 - 1.0; }

fn cellOf(p: vec2f) -> u32 {
  let g = vec2i(sim.grid);
  let c = clamp(vec2i(floor(p)), vec2i(0), g - vec2i(1));
  return u32(c.y) * sim.grid.x + u32(c.x);
}

// The open water's currents at p, as if no shore were near: the four waves and raindrops' rings.
fn openFlow(p: vec2f) -> vec2f {
  var v = vec2f(0.0);
  for (var k = 0u; k < 4u; k++) {
    let w = sim.waves[k];
    let ph = w.x * p.x + w.y * p.y + w.z * sim.time + f32(k) * 1.7;
    v += vec2f(w.y, -w.x) * (cos(ph) * w.w / max(length(w.xy), 1e-4));
  }
  v *= sim.weather.x;
  // raindrops: each sends a ring wave out from where it fell, shoving the water outward as it passes
  for (var k = 0u; k < 4u; k++) {
    let dr = sim.drops[k];
    let age = sim.time - dr.z;
    if (dr.w > 0.0 && age > 0.0 && age < ${f(K.dropLife)}) {
      var d = p - dr.xy;
      d -= sim.world * round(d / sim.world);
      let r = length(d);
      let x = (r - age * ${f(K.dropSpeed)}) / ${f(K.dropWidth)};
      // (the ring dies out before it meets its own copy across the world's wrap)
      let fade = 1.0 - smoothstep(0.3, 0.45, r / min(sim.world.x, sim.world.y));
      v += d / max(r, 1e-3) * (dr.w * exp(-x * x) * (1.0 - age / ${f(K.dropLife)}) * fade);
    }
  }
  return v;
}
// How far the water's edge stands out from where the floor alone would put it (world units): the currents push the
// meniscus out over the floor or draw it back, and it wavers as it pins and slips. n: uphill (toward the dry).
fn edgeSway(p: vec2f, n: vec2f, t: f32, flow: vec2f) -> f32 {
  let push = clamp(dot(flow, n) * ${f(K.edgeSway)}, -0.9, 0.9);
  let wob = sin(dot(p, vec2f(0.83, 0.56)) * 0.9 + t * 0.7) * sin(dot(p, vec2f(-0.42, 0.91)) * 0.6 - t * 0.45)
    + 0.5 * sin(dot(p, vec2f(0.29, -0.96)) * 2.1 + t * 1.3);
  return push + ${f(K.edgeWobble)} * wob;
}
fn flowAt(p: vec2f) -> vec2f {
  var v = openFlow(p);
  // the currents die away toward the water's edge and never cross it; dry ground has none
  if (pondOn()) {
    let pd = pondAt(p);
    let gl = length(pd.yz);
    let dist = pd.x / max(gl, 1e-4);
    let n = pd.yz / max(gl, 1e-4);
    let calm = smoothstep(0.0, ${f(K.shoreCalm)}, dist);
    v -= n * (max(dot(v, n), 0.0) * (1.0 - calm));
    v *= select(0.0, mix(0.3, 1.0, calm), dist > 0.0);
  }
  return v;
}
// The pool's floor at p (thermal block 3, a relief quantile per grid cell, bilinear): the water's depth there (the
// level less the floor; below 0 dry) and the floor's slope (uphill, per world unit).
// With frost (weather.y, the share of the pool frozen) ice grows over the pool in the order of thermal block 4 (a
// quantile per grid cell, 0 first): liquid is where that order lies above the frost. pondAt gives whichever edge,
// the water's or the ice's, lies nearer, in the same terms: a depth (below 0: dry or frozen) and the slope toward it.
fn pondOn() -> bool { return POND && (sim.pond.x < 1.0 || sim.weather.y > 0.0); }
fn blockCell(block: u32, x: i32, y: i32) -> f32 { return bitcast<f32>(atomicLoad(&thermal[block * MAX_CELLS + wrapCell(x, y)])); }
// A thermal block's field at grid cell i + t: its value read bilinearly, and its slope from central differences
// at the four corners read bilinearly too, so the slope's direction turns smoothly across cell edges (a slope
// constant within each cell sent what it pushes into lines along the grid)
fn smoothField(block: u32, i: vec2i, t: vec2f) -> vec3f {
  var v: array<f32, 16>;
  for (var y = 0; y < 4; y++) { for (var x = 0; x < 4; x++) { v[y * 4 + x] = blockCell(block, i.x - 1 + x, i.y - 1 + y); } }
  let val = mix(mix(v[5], v[6], t.x), mix(v[9], v[10], t.x), t.y);
  let gx = mix(mix(v[6] - v[4], v[7] - v[5], t.x), mix(v[10] - v[8], v[11] - v[9], t.x), t.y) * 0.5;
  let gy = mix(mix(v[9] - v[1], v[10] - v[2], t.x), mix(v[13] - v[5], v[14] - v[6], t.x), t.y) * 0.5;
  return vec3f(val, gx, gy);
}
fn pondAt(p: vec2f) -> vec3f {
  var e = vec3f(1.0, 0.0, 0.0);
  if (!pondOn()) { return e; }
  let u = p - 0.5;
  let i = vec2i(floor(u));
  let t = u - floor(u);
  if (sim.pond.x < 1.0) {
    let r = smoothField(3u, i, t);
    e = vec3f(sim.pond.x - r.x, r.yz);
    let gl = length(r.yz);
    if (gl > 1e-5) { e.x += edgeSway(p, r.yz / gl, sim.time, openFlow(p)) * gl; }
  }
  if (sim.weather.y > 0.0) {
    let o = smoothField(4u, i, t);
    let ice = vec3f(o.x - sim.weather.y, -o.yz);
    if (shoreDist(ice) < shoreDist(e)) { e = ice; }
  }
  return e;
}
// How far (world units) p lies from the water's edge, wet side positive, from pondAt's depth and slope.
fn shoreDist(pd: vec3f) -> f32 { return pd.x / max(length(pd.yz), 1e-4); }
// The light at p: the baseline and the tide's bands by the season, under the sky (clouds) and any leaf's shadow.
fn lightAt(p: vec2f) -> f32 {
  return (sim.ambient + (1.0 - sim.ambient) * tideAt(p, sim.world, sim.time, sim.tide, sim.tidePh) * sim.season) * sim.pond.z * (1.0 - leafShade(p, sim.leaf, sim.leafB, sim.world));
}

fn wrapPos(p: vec2f) -> vec2f { return p - sim.world * floor(p / sim.world); }

fn heatCell(x: i32, y: i32) -> f32 {
  let gw = i32(sim.grid.x);
  let gh = i32(sim.grid.y);
  return bitcast<f32>(atomicLoad(&thermal[MAX_CELLS + u32(((y % gh) + gh) % gh) * sim.grid.x + u32(((x % gw) + gw) % gw)]));
}
// Grid cell (x, y), wrapping.
fn wrapCell(x: i32, y: i32) -> u32 {
  let gw = i32(sim.grid.x);
  let gh = i32(sim.grid.y);
  return u32(((y % gh) + gh) % gh) * sim.grid.x + u32(((x % gw) + gw) % gw);
}
// Grains of reef stone in grid cell (x, y): each grain is shared among the four cells around it, in
// REEF_FIX parts (so up to 1023 grains fit the low 16 bits of stoneGrid).
const REEF_FIX = 64.0;
fn reefCell(x: i32, y: i32) -> f32 {
  return f32(atomicLoad(&stoneGrid[wrapCell(x, y)]) & 0xffffu) / REEF_FIX;
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
fn spec(d: f32) -> f32 { let c = min(max(d, 0.0), 1.0); return pow(c, ${f(K.specPow)}); }
// What an eater keeps of a meal holding raw energy: skill (diet specialisation) times eatEff × warmth (fit).
// Food that was alive passes on at most K.assimCap of what it held, the share growing with skill at K.assimilate, so no loop makes energy.
fn take(raw: f32, skill: f32, outside: bool, fit: f32) -> f32 {
  if (!outside) { return raw * min(${f(K.assimCap)}, skill * fit * ${f(K.assimilate)}); }
  return raw * skill * fit * ${f(K.gain)};
}

// Ledger guild order: producer, grazer, predator, scavenger (a fifth slot, once omnivores, is unused).
// A producer photosynthesises past 0.55; anyone else belongs to its strongest diet (genome.js dietGuild).
fn dietGuild(g: Genome) -> u32 {
  if (g.photo > 0.55) { return 0u; }
  let m = max(g.dFlesh, max(g.dHusk, g.dGlint));
  if (g.dFlesh >= m) { return 2u; }
  if (g.dHusk >= m) { return 3u; }
  return 1u;
}

fn addEnergy(guild: u32, slot: u32, e: f32) {
  if (e > 0.0) { atomicAdd(&ledger[META_ENERGY + 8u * guild + slot], u32(e * 1000.0 + 0.5)); }
}

fn deriveMetab(g: Genome) -> f32 {
  return (0.012 + 0.0032 * g.force + 0.012 * g.radius + 0.00012 * g.lifespan
        + ${f(K.anchorCost)} * (1.0 - g.advect) + 0.004 * g.size + ${f(K.swimCost)} * g.swim * (1.0 - g.photo) + 0.006 * g.align + 0.004 * g.adhesion + ${f(K.calcCost)} * g.calcify
        + ${f(K.beatCost)} * g.beat.x * g.beat.y * select(0.0, 1.0, (g.dev.x >= 0x80000000u || g.tail.x > 0.0) && g.adhesion > ${f(K.adhMin)})) * ${f(K.metab)};
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
  // the growth plan's last three genes share a word with thermo: they drift like the rest of the
  // plan, and now and then one of the six is redrawn
  var gw = clamp(unpack4x8unorm(g.dev.w) + g4(s) * m * 0.35, vec4f(0.0), vec4f(1.0));
  gw.x = thermo;
  g.dev.w = pack4x8unorm(gw);
  if (rnd(s) < m * 0.2) {
    let k = min(u32(rnd(s) * 6.0), 5u);
    let v = u32(rnd(s) * 255.0 + 0.5);
    if (k < 3u) { g.dev[k] = (g.dev[k] & 0x00ffffffu) | (v << 24u); }
    else { let sh = 8u * (k - 2u); g.dev.w = (g.dev.w & ~(255u << sh)) | (v << sh); }
  }
  // the beat: amplitude (0 still, up to 0.6), frequency (Hz), wavelength (radians of phase per cell)
  g.beat.x = clamp(g.beat.x + gauss(s) * m * 0.1, 0.0, 0.6);
  if (rnd(s) < m * 0.1) { g.beat.x = select(0.0, mix(0.15, 0.5, rnd(s)), g.beat.x < 0.05); }
  g.beat.y = clamp(g.beat.y * exp(gauss(s) * m * 0.3), 0.3, 3.0);
  g.beat.z = clamp(g.beat.z + gauss(s) * m * 0.2, 0.2, 1.6);
  // an animal colony grows from its tips like a plant (beat.w past 0.5), so it can grow long: now and then it flips
  if (rnd(s) < m * 0.1) { g.beat.w = 1.0 - g.beat.w; }
  // tails (a packed body's): how readily its edge buds one drifts, and now and then the habit is gained or
  // lost; how long they grow drifts
  g.tail.x = clamp(g.tail.x + gauss(s) * m * 0.15, 0.0, 1.0);
  if (rnd(s) < m * 0.1) { g.tail.x = select(0.0, mix(0.3, 1.0, rnd(s)), g.tail.x < 0.05); }
  g.tail.y = clamp(g.tail.y + gauss(s) * m * 0.2, 0.0, 1.0);
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
    g.dev[r] = pack4x8unorm(vec4f(rnd(s), rnd(s), rnd(s), rnd(s)));
  }
  g.dev.w = pack4x8unorm(vec4f(0.0, rnd(s), rnd(s), rnd(s)));
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
  g.beat = vec4f(select(0.0, mix(0.15, 0.5, rnd(s)), rnd(s) < 0.25), mix(0.5, 2.5, rnd(s)), mix(0.3, 1.2, rnd(s)), select(0.0, 1.0, rnd(s) < 0.25));
  g.tail = vec4f(select(0.0, mix(0.3, 1.0, rnd(s)), rnd(s) < 0.2), rnd(s), 0.0, 0.0);
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
  } else if (u < sim.pSilt + sim.pHusk) {
    kind = HUSK; e = 0.2 + 0.3 * rnd(&s); col = pack4x8unorm(vec4f(0.5, 0.35, 0.25, 1.0));
  } else {
    // one of the founding colonies, and one of its community of founders
    let c = min(u32(rnd(&s) * ${f(K.foundColonies)}), ${Math.max(1, Math.round(K.foundColonies)) - 1}u);
    let m = min(u32(rnd(&s) * ${f(K.foundMixed)}), ${Math.max(1, Math.round(K.foundMixed)) - 1}u);
    kind = FIRST_LIFE + pcg(sim.seed ^ pcg(c * 7919u + m * 104729u + 3u)) % sim.seedKinds;
    let h = pcg(sim.seed ^ pcg(c * 977u + 5u));
    pos = wrapPos(vec2f(f32(h & 0xffffu), f32(h >> 16u)) / 65536.0 * sim.world + vec2f(gauss(&s), gauss(&s)) * ${f(K.foundPatch)});
    let g = genomes[kind];
    e = 0.4 + 0.6 * rnd(&s);
    let r = sampleRole(g, sampleRole(g, 0u, &s), &s);
    col = pack4x8unorm(vec4f(roleColor(g, r), 1.0));
    age = rnd(&s) * g.lifespan * 0.6;
    info = r << 4u;
    // flesh-eaters arrive after their prey, as in a recovery: they start as cysts that cannot wake before
    // a time drawn over the first foundHuntSleep seconds (a negative age), with the energy to last it
    if (dietGuild(g) == 2u) {
      let wait = rnd(&s) * ${f(K.foundHuntSleep)};
      info |= CYST; age = -wait; e += ${f(K.cystLeak)} * wait;
    }
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
        ck = select(HUSK, select(NONE, p.kind, p.kind >= FIRST_LIFE), cls == 0u || cls == 3u);
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
          p.kind = HUSK; p.energy = ${bodyOf(K, 'genomes[p.kind]')} * ${f(K.carcassKeep)}; p.age = 0.0; p.vel *= 0.2;
          p.info = (p.info & 0xffff7ff0u) | 3u;
          atomicAdd(&ledger[META_ENERGY + 61u], 1u);
        } else {
          // eaten matter returns to the water as silt (the nutrient): litter by grazers, carcasses by scavengers
          if (p.kind == HUSK) { atomicAdd(&ledger[META_ENERGY + select(63u, 62u, (p.info & LITTER) != 0u)], 1u); }
          p.kind = SILT; p.energy = 0.0; p.vel = vec2f(0.0); p.age = 0.0;
          p.info = (p.info & 0xffffffc0u) | 3u;
        }
      } else if (act == 3u && p.kind == ck) {
        if (p.kind >= FIRST_LIFE) {
          p.energy -= ${f(K.bite)} * bites;
          if (p.energy <= 0.0) {
            atomicAdd(&ledger[META_DEATH + 4u * dietGuild(genomes[p.kind]) + 3u], 1u);
            p.kind = HUSK; p.energy = ${bodyOf(K, 'genomes[p.kind]')}; p.age = 0.0;
            p.info = (p.info & 0xffff7ff0u) | 3u | LITTER;
            atomicAdd(&ledger[META_ENERGY + 60u], 1u);
          }
        }
      } else if (act == 2u && ck == HUSK && p.kind == SILT) {
        // dung: the grain beside an eater becomes a husk of what its gut held
        p.kind = HUSK; p.energy = bitcast<f32>(intent[c - 1u].y); p.age = 0.0; p.vel *= 0.2;
        p.info = (p.info & 0xffff7fc0u) | 11u | LITTER;
        p.col = pack4x8unorm(vec4f(0.36, 0.30, 0.14, 1.0));
      } else if (act == 2u && ck >= FIRST_LIFE && p.kind == SILT) {
        let cr = (action >> 12u) & 3u;
        let gen = (action >> 14u) & 4095u;
        let bud = (action >> 26u) & 15u;
        p.kind = ck;
        p.energy = bitcast<f32>(intent[c - 1u].y);
        p.age = 0.0;
        p.vel = vec2f(0.0);
        // budding: the daughter is built from the grain but grows out of its mother, beside her on the
        // grain's side (not wherever the grain lay, often inside another cell), and moves with her
        {
          let mother = parts[c - 1u];
          var toward = p.pos - mother.pos;
          toward -= sim.world * round(toward / sim.world);
          var dir = select(vec2f(1.0, 0.0), normalize(toward), dot(toward, toward) > 1e-10);
          // a tree's daughter grows at her turn from her mother's heading (from the grandmother; a root
          // buds toward the grain)
          let gr = growOf(genomes[ck]);
          let gm = intent[c - 1u].z;
          // (a tail grows straight on, its base straight out from the partner its body's cell holds first)
          if ((gr.tree || (bud >> 2u) == 2u) && genomes[ck].adhesion > ${f(K.adhMin)} && ck == mother.kind && gm < sim.count && parts[gm].kind == ck) {
            var hd = mother.pos - parts[gm].pos;
            hd -= sim.world * round(hd / sim.world);
            if (dot(hd, hd) > 1e-10) { dir = rot2(normalize(hd), select(0.0, turnAngle(gr, bud & 3u, gen), gr.tree)); }
          }
          let gap = 0.085 * genomes[ck].size * (2.0 - 0.12 * f32(roleOf(mother.info) + cr)) * 0.95;
          p.pos = wrapPos(mother.pos + dir * gap);
          p.vel = mother.vel;
        }
        p.id = atomicAdd(&ledger[0], 1u);
        p.col = pack4x8unorm(vec4f(roleColor(genomes[ck], cr), 1.0));
        p.info = (gen << 16u) | (bud << 28u) | (cr << 4u) | 9u;
        intent[i].z = select(NONE, c - 1u, genomes[ck].adhesion > ${f(K.adhMin)});
        intent[i].w = NONE;
        atomicAdd(&ledger[2], 1u);
        atomicAdd(&ledger[META_DEATH + 4u * dietGuild(genomes[ck])], 1u);
      }
      parts[i] = p;
    }
    let cell = cellOf(p.pos);
    // the living and the matter are ranked apart: the living sort first in their grid cell
    let alive = p.kind >= FIRST_LIFE;
    let r = atomicAdd(&countsA[select(cell, MAX_CELLS + cell, alive)], 1u);
    aux[i] = vec2u(cell, select(r, r | LIVE_BIT, alive));
    if (p.kind == STONE) {
      if ((p.info & 15u) != 0u) {
        // a grain of reef counts in the four cells around it, by distance (REEF_FIX parts in all), so
        // a reef counts the same wherever it sits across the grid
        let u = p.pos - 0.5;
        let i0 = vec2i(floor(u));
        let t = u - floor(u);
        let w00 = u32(round(REEF_FIX * (1.0 - t.x) * (1.0 - t.y)));
        let w10 = u32(round(REEF_FIX * t.x * (1.0 - t.y)));
        let w01 = u32(round(REEF_FIX * (1.0 - t.x) * t.y));
        atomicAdd(&stoneGrid[wrapCell(i0.x, i0.y)], w00);
        atomicAdd(&stoneGrid[wrapCell(i0.x + 1, i0.y)], w10);
        atomicAdd(&stoneGrid[wrapCell(i0.x, i0.y + 1)], w01);
        atomicAdd(&stoneGrid[wrapCell(i0.x + 1, i0.y + 1)], u32(REEF_FIX) - w00 - w10 - w01);
      } else {
        atomicAdd(&stoneGrid[cell], 0x10000u);
      }
    }
    // husks per grid cell: where they pile up and rot, framboids form (matterMain)
    if (p.kind == HUSK && HEAT_ON) { atomicAdd(&thermal[2u * MAX_CELLS + cell], 1u); }
    if (p.kind == HUSK && (p.info & LITTER) != 0u) { atomicAdd(&ledger[META_DEATH + 60u], 1u); }
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
  let v = countsP[g] + countsP[MAX_CELLS + g];
  cellStart[LIVE_AT + g] = countsP[MAX_CELLS + g];
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
// where a particle sorts to: its grid cell's start, then its rank (past the cell's living, for matter)
fn sortedAt(a: vec2u) -> u32 {
  if ((a.y & LIVE_BIT) != 0u) { return cellStart[a.x] + (a.y & ~LIVE_BIT); }
  return cellStart[a.x] + cellStart[LIVE_AT + a.x] + a.y;
}
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
    dst = sortedAt(a);
    let p = parts[i];
    sortedFull[dst] = p;
    // Bonds use last frame's sorted indices; move each endpoint through the same sort.
    var partners = vec2u(NONE);
    if (p.kind >= FIRST_LIFE) {
      for (var k = 0u; k < 2u; k++) {
        let j = intent[i][k + 2u];
        if (j < sim.count && j != i) {
          partners[k] = sortedAt(aux[j]);
        }
      }
    }
    bondsNow[dst * 6u] = partners.x;
    bondsNow[dst * 6u + 1u] = partners.y;
    bondsNow[dst * 6u + 2u] = 0u;
    let role = roleOf(p.info);
    let sig = genomes[p.kind].sig[role].xy;
    let plant = select(0u, 1u << 12u, (p.kind >= FIRST_LIFE && genomes[p.kind].photo > 0.4));
    // pad: with K.bodyPush, the cell's drawn radius (0.085 world units per unit of size, smaller in its later roles)
    let hunter = select(0u, 1u << 14u, p.kind >= FIRST_LIFE && genomes[p.kind].dFlesh > 0.5 && genomes[p.kind].photo <= 0.4);
    let tailBit = select(0u, 1u << 15u, p.kind >= FIRST_LIFE && tailCell(genomes[p.kind], p.info));
    sortedLite[dst] = Lite(p.pos, p.kind | (role << 10u) | plant | hunter | tailBit | select(0u, 1u << 13u, p.kind >= FIRST_LIFE && (p.info & 15u) == CYST), p.col, pack2x16float(p.vel), sig.x, sig.y, bitcast<u32>(0.085 * genomes[p.kind].size * (1.0 - 0.12 * f32(role))));
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
      wear = pow(2.0, (heatSample(p.pos).x - TREF) / 10.0);
    } else if ((p.info & 15u) != 0u) {
      // both read the grid smoothly around the grain itself (bilinear between cell centres, and a round
      // neighbourhood weighted by distance), not by the grid cell it sits in: counted cell by cell, a reef
      // lasted only when it fit inside one cell, and the square neighbourhood spaced reefs on a square
      // lattice along the grid's axes
      let u = p.pos - 0.5;
      let i0 = vec2i(floor(u));
      let t = u - floor(u);
      let here = mix(mix(reefCell(i0.x, i0.y), reefCell(i0.x + 1, i0.y), t.x),
        mix(reefCell(i0.x, i0.y + 1), reefCell(i0.x + 1, i0.y + 1), t.x), t.y);
      var region = 0.0;
      var area = 0.0;
      if (${f(K.regionWear)} > 0.0) {
        // a disc as large as the square of side 2 regionR + 1 it replaces, its rim a cell wide
        let rr = ${f(REGION_DISC)};
        let c = vec2i(floor(p.pos));
        for (var dy = -${REGION_REACH}; dy <= ${REGION_REACH}; dy++) {
          for (var dx = -${REGION_REACH}; dx <= ${REGION_REACH}; dx++) {
            let w = 1.0 - smoothstep(rr - 0.5, rr + 0.5, length(vec2f(c + vec2i(dx, dy)) + 0.5 - p.pos));
            if (w > 0.0) { region += w * reefCell(c.x + dx, c.y + dy); area += w; }
          }
        }
      }
      wear = mix(${f(K.wearLoose)}, ${f(K.wearPacked)}, smoothstep(2.0, ${f(K.packedAt)}, here))
        * (1.0 + ${f(K.regionWear)} * max(0.0, region / max(area, 1.0) / ${f(K.regionCap)} - 1.0));
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
  // the water's warmth here: warm water wears husks faster and shakes grains harder
  // (read smoothly between grid cells: grains shaken harder cell by cell drifted into grid lines)
  let T = heatSample(p.pos).x;
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
  var vel = flowAt(p.pos) + jit;
  // on dry ground grains and husks lie where the water left them; near a receding edge the water flowing out to
  // replace what evaporates there carries them to it, and strands them in a line (a coffee ring)
  let pd = pondAt(p.pos);
  let dryHere = pd.x < 0.0;
  if (pondOn()) {
    let sd = shoreDist(pd);
    // (an advancing ice front pushes grains ahead of it the same way)
    let pull = max(sim.pond.w, sim.weather.z);
    if (dryHere) { vel = vec2f(0.0); }
    else if (pull > 0.0 && sd < ${f(K.filmR)}) { vel += pd.yz / max(length(pd.yz), 1e-4) * (${f(K.ringPull)} * pull * (1.0 - sd / ${f(K.filmR)})); }
  }${K.heat && K.marangoni > 0 ? `
  // surface flow: warm water's surface pulls toward cooler water, carrying matter with it
  vel -= heatSample(p.pos).yz * ${f(K.marangoni)};` : ''}
  let pos = wrapPos(p.pos + vel * sim.dt);
  p.age += sim.dt;
  if (p.kind == SILT) {
    let tide = (tideAt(pos, sim.world, sim.time, sim.tide, sim.tidePh) * sim.season + 0.2 * sim.ambient) * sim.pond.z * (1.0 - leafShade(pos, sim.leaf, sim.leafB, sim.world));
    // life sparks from silt (about one spark per 30 s in the world, sim.abio per grain), in the light, and
    // more in hot water (around framboids); a spark founds a species suited to the water here, so a world
    // whose life died begins again
    if (sim.abio > 0.0 && !dryHere && rnd(&s) < sim.abio * 2.0 * clamp(tide, 0.0, 1.0) * (1.0 + ${f(K.abioHeat)} * smoothstep(4.0, 20.0, hot))) {
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
  } else if (p.kind == HUSK) {
    // rot is faster in warm water, and a carcass pile steams; a husk gives off no more than it holds,
    // or hot water would rot husks into heat from nothing and run away
    let rot = min(${f(K.decay)} * pow(${f(K.rotQ10)}, warm) * select(1.0, ${f(K.dryRot)}, dryHere) * sim.dt, max(p.energy, 0.0));
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
  let mass = 1.0 + ${f(K.stoneMass)} * (f32(stones & 0xffffu) / REEF_FIX + f32(stones >> 16u));
  let light = lightAt(centre);
  let q = f32(atomicExchange(&thermal[c], 0u)) / HEAT_FIX + ${f(K.sunHeat)} * light * sim.dt;
  let t = carried + ${f(K.heatD)} * lap * sim.dt + (q - ${f(K.heatLoss)} * (carried - sim.tbg) * sim.dt) / mass;
  heatNext[c] = t;
}

// --------------------------------------------------------------------- life
fn keepBond(i: u32, j: u32, p: Particle) -> u32 {
  if (j >= sim.count || j == i) { return NONE; }
  let q = sortedFull[j];
  if (q.kind != p.kind) { return NONE; }
  // a cell that goes dormant leaves its body: its partners let go
  if ((q.info & 15u) == CYST) { return NONE; }
  var d = q.pos - p.pos;
  d -= sim.world * round(d / sim.world);
  if (dot(d, d) > LINK_R * LINK_R * ${f(K.bondBreak * K.bondBreak)}) { return NONE; }
  return j;
}


// Whether a cell of this one's species may take up a free bond slot to j: j is bonded to one of its
// partners (mine: those it keeps, then those that keep it), closing a triangle in the tissue, or
// neither has a partner yet (two free cells start a body). Strangers' bodies do not fuse.
fn joinable(i: u32, j: u32, k1: u32, k2: u32) -> bool {
  // this cell's partners: those it keeps, then those that keep it (one of them is no new partner)
  let ci = min(backOf(i, 0u), 3u);
  let b1 = select(NONE, backOf(i, 1u), ci > 0u);
  let b2 = select(NONE, backOf(i, 2u), ci > 1u);
  let b3 = select(NONE, backOf(i, 3u), ci > 2u);
  if (j == b1 || j == b2 || j == b3) { return false; }
  let mine = vec4u(k1, k2, b1, b2);
  let mine4 = b3;
  let o = bondsOf(j);
  let c = min(backOf(j, 0u), 3u);
  let alone = all(mine == vec4u(NONE)) && mine4 == NONE;
  var js = array<u32, 5>(o.x, o.y, NONE, NONE, NONE);
  for (var k = 0u; k < c; k++) { js[2u + k] = backOf(j, 1u + k); }
  var free = true;
  var linked = false;
  for (var k = 0u; k < 5u; k++) {
    let q = js[k];
    if (q < sim.count && q != j) {
      free = false;
      linked = linked || q == mine.x || q == mine.y || q == mine.z || q == mine.w || q == mine4;
    }
  }
  return select(linked, free, alone);
}

// A tissue bond's rest length: open (0.55 linkR) in loose bodies, where the two cells touch in tight ones.
// (a bond to a tail rests where its cells touch, reckoned alike from both ends)
fn restTo(j: u32, size: f32, role: u32, tight: f32) -> f32 {
  if (j == NONE) { return 0.0; }
  let info = sortedFull[j].info;
  return mix(LINK_R * 0.55, 0.9 * 0.085 * size * (2.0 - 0.12 * f32(role + roleOf(info))), select(tight, 1.0, orderOf(info) == 2u));
}


// A tree's cell's heading: from its mother to it; a root's, from where its first daughter (by id) grew,
// turned back by her turn (by: that daughter, who holds no angle to it). ok false: neither.
struct Heading { dir: vec2f, ok: bool, by: u32 };
fn headingOf(m: u32, gr: Grow) -> Heading {
  let pm = sortedFull[m];
  let gm = bondsOf(m).x;
  if (gm < sim.count && gm != m && sortedFull[gm].kind == pm.kind) {
    var d = pm.pos - sortedFull[gm].pos;
    d -= sim.world * round(d / sim.world);
    let l = length(d);
    if (l > 1e-4 && l < LINK_R * ${f(K.bondBreak)}) { return Heading(d / l, true, NONE); }
  }
  var best = NONE; var bestId = NONE;
  for (var k = 0u; k < min(backOf(m, 0u), 3u); k++) {
    let c = backOf(m, 1u + k);
    if (c < sim.count && sortedFull[c].kind == pm.kind && sortedFull[c].id < bestId) { best = c; bestId = sortedFull[c].id; }
  }
  if (best == NONE) { return Heading(vec2f(1.0, 0.0), false, NONE); }
  let q = sortedFull[best];
  var d = q.pos - pm.pos;
  d -= sim.world * round(d / sim.world);
  return Heading(rot2(d / max(length(d), 1e-4), -turnAngle(gr, turnOf(q.info), genOf(q.info))), true, best);
}


// What a tree's cell m passes each daughter this step (x) and in all (y): once the daughters its plan
// wants are all grown, rate of its surplus over keep, split among them (those keepBond would keep).
fn feedOf(m: u32, gr: Grow, keep: f32, rate: f32) -> vec2f {
  let q = sortedFull[m];
  var have = 0u; var n = 0.0;
  for (var k = 0u; k < min(backOf(m, 0u), 3u); k++) {
    let c = backOf(m, 1u + k);
    if (c >= sim.count || c == m) { continue; }
    let o = sortedFull[c];
    var d = o.pos - q.pos;
    d -= sim.world * round(d / sim.world);
    if (o.kind == q.kind && (o.info & 15u) != CYST && dot(d, d) <= LINK_R * LINK_R * ${f(K.bondBreak * K.bondBreak)}) { have |= 1u << turnOf(o.info); if (o.energy < 2.0 * keep) { n += 1.0; } }
  }
  // (only daughters short of a division's energy take any: a tip that cannot bud yet hoards none)
  if (n == 0.0 || (growWants(gr, genOf(q.info), orderOf(q.info)) & ~have) != 0u) { return vec2f(0.0); }
  let all = rate * max(q.energy - keep, 0.0);
  return vec2f(all / n, all);
}


// A tree bends like a stem: at each cell (the bend's middle) the angle from its arm (its mother, or a
// root's first daughter by id) to each other daughter is held at the plan's. Each bend pushes its three
// cells so that the pushes sum to nothing and turn nothing (a held angle's gradient): a tree cannot drive
// itself, where pulling only the daughter toward her angle made long trees thrash. Every cell gathers
// its share of each bend it is in: as the middle, as a daughter, and as the arm.
// whether sorted cell x grows as a tree (a tree species', or a tail's)
fn treeCellAt(x: u32) -> bool {
  let q = sortedFull[x];
  let g = genomes[q.kind];
  return g.adhesion > ${f(K.adhMin)} && (g.dev.x >= 0x80000000u || tailCell(g, q.info));
}
// how many cells a tail grows to
fn tailLen(g: Genome) -> u32 { return 3u + u32(g.tail.y * ${f(K.tailMax - 3)}); }
fn treeMom(x: u32) -> u32 {
  let m = bondsOf(x).x;
  if (m >= sim.count || m == x || sortedFull[m].kind != sortedFull[x].kind) { return NONE; }
  let d = treeRel(x, m);
  if (dot(d, d) > LINK_R * LINK_R * ${f(K.bondBreak * K.bondBreak)}) { return NONE; }
  return m;
}
fn treeKid(x: u32, k: u32) -> u32 {
  if (k >= min(backOf(x, 0u), 3u)) { return NONE; }
  let c = backOf(x, 1u + k);
  if (c >= sim.count || c == x || treeMom(c) != x) { return NONE; }
  return c;
}
// A coarse step bends a beating tree afresh each tick (its bends change too fast to hold one tick's push
// for the step): its partners where their velocities will carry them by predT, the cell itself at predPos.
var<private> predT: f32;
var<private> predSelf: u32;
var<private> predPos: vec2f;
fn treePos(x: u32) -> vec2f {
  if (predT > 0.0) { return select(sortedFull[x].pos + sortedFull[x].vel * predT, predPos, x == predSelf); }
  return sortedFull[x].pos;
}
fn treeRel(a: u32, b: u32) -> vec2f {
  var d = treePos(b) - treePos(a);
  d -= sim.world * round(d / sim.world);
  return d;
}
fn treeArm(x: u32) -> u32 {
  let m = treeMom(x);
  if (m != NONE) { return m; }
  var best = NONE; var bestId = NONE;
  for (var k = 0u; k < 3u; k++) {
    let c = treeKid(x, k);
    if (c != NONE && sortedFull[c].id < bestId) { best = c; bestId = sortedFull[c].id; }
  }
  return best;
}
fn turnOfCell(gr: Grow, x: u32) -> f32 { let q = sortedFull[x]; return turnAngle(gr, turnOf(q.info), genOf(q.info)); }
// The pushes on the arm's end (xy) and the daughter (zw) of the bend at m; m takes minus both.
fn bendAt(gr: Grow, m: u32, a: u32, b: u32) -> vec4f {
  let A = treeRel(m, a); let B = treeRel(m, b);
  let want = select(turnOfCell(gr, b) - turnOfCell(gr, a), 3.14159265 + turnOfCell(gr, b), a == treeMom(m));
  var e = atan2(A.x * B.y - A.y * B.x, dot(A, B)) - want;
  e -= TAU * round(e / TAU);
  let s = e * length(A) * length(B);
  return vec4f(vec2f(-A.y, A.x) * (s / max(dot(A, A), 1e-8)), vec2f(B.y, -B.x) * (s / max(dot(B, B), 1e-8)));
}
fn bendOn(i: u32, gr: Grow) -> vec2f {
  var F = vec2f(0.0);
  let arm = treeArm(i);
  let mom = treeMom(i);
  for (var k = 0u; k < 3u; k++) {
    let c = treeKid(i, k);
    if (c == NONE) { continue; }
    // the middle of my own bends
    if (arm != NONE && c != arm) { let f = bendAt(gr, i, arm, c); F -= f.xy + f.zw; }
    // the arm of my daughters' bends
    for (var k2 = 0u; k2 < 3u; k2++) {
      let cc = treeKid(c, k2);
      if (cc != NONE) { F += bendAt(gr, c, i, cc).xy; }
    }
  }
  // (a tail's base: the body's cell it grows from is no tree and holds no angle of its own)
  if (mom != NONE && treeCellAt(mom)) {
    let am = treeArm(mom);
    // a daughter of my mother's bend, or (a root's first daughter) the arm of my sisters'
    if (am != i) { F += bendAt(gr, mom, am, i).zw; }
    else {
      for (var k = 0u; k < 3u; k++) {
        let s = treeKid(mom, k);
        if (s != NONE && s != i) { F += bendAt(gr, mom, i, s).xy; }
      }
    }
  }
  return F;
}

// A tree's muscles. A beat is a wave run out from the root along every branch: each cell's lateral speed,
// across its branch, is a cosine of the time less its generation's phase (beat.z per cell), as large as a
// swing of beatGain x the amplitude gene in heading. The muscles carry it bond by bond: each bond's two
// cells move toward the relative velocity across it that their two speeds ask (and otherwise toward each
// other's motion, as tissue), a share beatMix of the difference each step. Both reckon it alike and take
// opposite halves, so the body cannot push itself; it swims only as the water holds its cells harder
// across their branches than along them (sideDrag). Pulling bonds one by one, rather than bending the
// stem, carries a long wave down it as fast as a short one: a bend's push reaches the cells beside it only.
fn beatSpeed(gr: Grow, size: f32, gen: u32, t: f32) -> f32 {
  return min(gr.beat.x * ${f(K.beatGain * 0.16)} * gr.beat.y / max(gr.beat.z, 0.05), ${f(K.beatTop)}) * size * cos(gr.beat.y * t - gr.beat.z * f32(gen));
}
// how many tree bonds a cell has (its mother and daughters), at least two: a bond's share is split by the busier end
fn treeDeg(x: u32) -> f32 {
  let m = bondsOf(x).x;
  return max(2.0, f32(min(backOf(x, 0u), 3u)) + select(0.0, 1.0, m < sim.count && m != x));
}
// One pull a step, the beat reckoned at the step's middle. A coarse step pulls a smaller share (beatMixC:
// over its several ticks the stiffest wave, each cell pulled by both its bonds as a zigzag, would
// overshoot), and its ticks' drag leaves less of the beat standing, so the beat asks more: as much as
// it takes for its wave (2 - 2 cos of its phase per cell, as the bonds settle it) to stand as tall as in
// 1/60 s steps, by a 1/60 s step's and a coarse step's settling, and a fifth more a tick past the first
// (fitted with tools/swimlab.mjs; docs/growth.md), but no faster across a bond than three beatTops.
fn beatPull(i: u32, gr: Grow, size: f32, frX: f32) -> vec2f {
  let p = sortedFull[i];
  let tm = sim.time - 0.5 * sim.dt;
  let si = beatSpeed(gr, size, genOf(p.info), tm);
  let di = treeDeg(i);
  var gain = 1.0;
  var mixW = ${f(K.beatMix)};
  if (sim.ticks > 1u) {
    mixW = ${f(K.beatMixC)};
    let wm = 2.0 * mixW * (2.0 - 2.0 * cos(gr.beat.z));
    gain = (wm + 1.0 - pow(frX, f32(sim.ticks))) / (${f(2 * K.beatMix)} * (2.0 - 2.0 * cos(gr.beat.z)) + 1.0 - frX) * (1.0 + 0.2 * f32(sim.ticks - 1u)) * ${f(K.beatMix)} / mixW;
  }
  // (a coarse step asks no faster swing of a bond than it can follow)
  let top = select(1e9, ${f(3 * K.beatTop)} * size, sim.ticks > 1u);
  var dv = vec2f(0.0);
  for (var k = 0u; k < 4u; k++) {
    // the mother, then the daughters
    let j = select(treeKid(i, k - 1u), treeMom(i), k == 0u);
    // (a tail's base is held to its body by the bond alone)
    if (j == NONE || (k == 0u && !treeCellAt(j))) { continue; }
    let q = sortedFull[j];
    // the bond's normal, from mother to daughter
    let a = select(treeRel(i, j), treeRel(j, i), k == 0u);
    let n = vec2f(-a.y, a.x) / max(length(a), 1e-6);
    let sj = beatSpeed(gr, size, genOf(q.info), tm);
    // a joint pulled well past its rest goes slack: its muscle lets go
    let slack = smoothstep(1.6, 1.3, length(a) / (${f(0.153)} * size));
    dv += (q.vel - p.vel + n * (clamp((si - sj) * gain, -top, top) * slack)) * (2.0 / max(di, treeDeg(j)));
  }
  return dv * mixW;
}

// A body bearing tails: its share, as the arm, of the bend at each tail's base that grows from it (the base
// reckons the same bend, bendOn).
fn tailBases(i: u32, nb0: u32, nb1: u32, nb2: u32) -> vec2f {
  var F = vec2f(0.0);
  for (var k = 0u; k < 3u; k++) {
    let c = select(select(nb2, nb1, k == 1u), nb0, k == 0u);
    if (c == NONE || orderOf(sortedFull[c].info) != 2u || treeMom(c) != i) { continue; }
    let gc = growAt(genomes[sortedFull[c].kind], sortedFull[c].info);
    for (var k2 = 0u; k2 < 3u; k2++) {
      let cc = treeKid(c, k2);
      if (cc != NONE) { F += bendAt(gc, c, i, cc).xy; }
    }
  }
  return F;
}

// The bond's other end as seen from p (wrapped), or zero for none.
fn bondTo(j: u32, p: Particle) -> vec2f {
  if (j == NONE) { return vec2f(0.0); }
  var d = sortedFull[j].pos - p.pos;
  d -= sim.world * round(d / sim.world);
  return d;
}

@compute @workgroup_size(128)
fn bondBackMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = livingList[gid.x];
  if (i == NONE) { return; }
  let k = sortedFull[i].kind;
  let b = vec2u(atomicLoad(&bondsAt[i * 6u]), atomicLoad(&bondsAt[i * 6u + 1u]));
  for (var s = 0u; s < 2u; s++) {
    let j = b[s];
    // a bond both keep is counted once, by each as its own
    if (j < sim.count && j != i && sortedFull[j].kind == k && atomicLoad(&bondsAt[j * 6u]) != i && atomicLoad(&bondsAt[j * 6u + 1u]) != i) {
      let c = atomicAdd(&bondsAt[j * 6u + 2u], 1u);
      if (c < 3u) { atomicStore(&bondsAt[j * 6u + 3u + c], i); }
    }
  }
}


// Contact, before lifeMain, in a pass of its own (its loop in lifeMain cost the whole kernel registers):
// each living cell walks every living cell it could touch (in the grid cells within reach of it, up to
// contactCap of them, every so many past that, each standing for those skipped) and changes its own
// velocity. Bodies do not pass into each other, whatever either wants of the other: overlapping ones part
// by velocity, far enough to undo bodyHold of the overlap a tick, averaged over the contacts (so many
// pressing at once cannot overshoot), and are pushed apart by bodyPush besides. And cells that touch drag
// on each other (crowdVisc): a crowd moves as a thick fluid.
@compute @workgroup_size(128)
fn contactMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = livingList[gid.x];
  if (i == NONE) { return; }
  let p = sortedFull[i];
  let myR = bitcast<f32>(sortedLite[i].pad);
  let gw = i32(sim.grid.x);
  let gh = i32(sim.grid.y);
  let world = sim.world;
  let cc = clamp(vec2i(floor(p.pos)), vec2i(0), vec2i(gw - 1, gh - 1));
  let inCell = p.pos - vec2f(cc);
  // as far as this cell can touch another (its radius and a large cell's, with viscosity's margin)
  let reach = ${f(K.crowdVisc > 0 ? 1.25 : 1)} * (myR + ${f(K.contactReach)});
  var mask = 0u;
  // the living crowd here, varying smoothly over the water (the grid cells' counts interpolated between
  // their centres): the walk's step follows it, not the count in the grid cells it walks, which jumps
  // as cells cross grid lines and drew them into grid-cell middles
  var dens = 0.0;
  var total = 0u;
  let mid = p.pos - vec2f(cc) - 0.5;
  for (var c9 = 0; c9 < 9; c9++) {
    let tent = max(vec2f(0.0), 1.0 - abs(vec2f(f32(c9 % 3 - 1), f32(c9 / 3 - 1)) - mid));
    let cd = u32(((cc.y + c9 / 3 - 1 + gh) % gh) * gw + (cc.x + c9 % 3 - 1 + gw) % gw);
    dens += f32(cellStart[LIVE_AT + cd]) * tent.x * tent.y;
    // how far this cell sits outside that grid cell, along each axis
    let o = vec2f(f32(c9 % 3 - 1), f32(c9 / 3 - 1));
    let gap = max(vec2f(0.0), select(vec2f(0.0), select(inCell, 1.0 - inCell, o > vec2f(0.0)), o != vec2f(0.0)));
    if (dot(gap, gap) < reach * reach) {
      let c = u32(((cc.y + c9 / 3 - 1 + gh) % gh) * gw + (cc.x + c9 % 3 - 1 + gw) % gw);
      mask |= 1u << u32(c9);
      total += cellStart[LIVE_AT + c];
    }
  }
  // (about 2.5 grid cells are within reach, on average; and beside a heap, never under a third of the
  // step the walked cells' own count asks)
  let cs = max(1.0, max(dens * 2.5, f32(total) / 3.0) / ${f(K.contactCap)});
  var s = pcg(p.id ^ pcg(sim.frame * 2246822519u + sim.seed));
  var push = vec2f(0.0);
  // (bodyHold is a share per 1/60 s: a step of any length undoes as much as that time would)
  let holdShare = 1.0 - pow(1.0 - ${f(K.bodyHold)}, sim.dt * 60.0);
  var hold = vec2f(0.0);
  var holdN = 0.0;
  var touchV = vec2f(0.0);
  var touchN = 0.0;
  for (var c9 = 0; c9 < 9; c9++) {
    if ((mask & (1u << u32(c9))) == 0u) { continue; }
    let c = u32(((cc.y + c9 / 3 - 1 + gh) % gh) * gw + (cc.x + c9 % 3 - 1 + gw) % gw);
    let start = cellStart[c];
    let lv = f32(cellStart[LIVE_AT + c]);
    for (var e = select(0.0, rnd(&s) * cs, cs > 1.0); e < lv; e += cs) {
      let j = start + u32(e);
      if (j == i) { continue; }
      let q = sortedLite[j];
      let qpos = q.pos;
      let qvel = unpack2x16float(q.vel);
      var d = qpos - p.pos;
      d -= world * round(d / world);
      let r2 = dot(d, d);
      let touchQ = myR + bitcast<f32>(q.pad);
      if (r2 >= ${f(K.crowdVisc > 0 ? 1.5625 : 1)} * touchQ * touchQ || r2 < 1e-12) { continue; }
      let r = sqrt(r2);
      let touch = ${f(K.bodyGive)} * touchQ;
      if (r < touch) {
        let n = d / r;
        push -= n * (cs * (touch - r) / touch);
        // the separating speed that would undo bodyHold of the overlap a tick (over a coarse step, as
        // much as its ticks would), half each
        let apartV = dot(qvel - p.vel, n);
        hold -= n * (0.5 * cs * max(0.0, holdShare * (touch - r) / sim.dt - apartV));
        holdN += cs;
      }
      if (r < 1.25 * touchQ) { touchV += qvel * cs; touchN += cs; }
    }
  }
  var vel = p.vel;
  // (compounded per 1/60 s, so a coarse step blends as far as its ticks would, not past it)
  if (touchN > 0.0) { vel = mix(vel, touchV / touchN, 1.0 - pow(1.0 - clamp(${f(K.crowdVisc / 60)} * min(1.0, touchN / 4.0), 0.0, 1.0), sim.dt * 60.0)); }
  vel += push * (${f(K.bodyPush)} * sim.dt);
  if (holdN > 0.0) { vel += hold / max(1.0, 0.5 * holdN); }
  sortedFull[i].vel = vel;
}

// Handling time: matter is eaten at every meal opportunity, living prey only at every Nth.
fn mealDue(fk: u32, meal: u32) -> bool {
  return fk < FIRST_LIFE || meal % select(${K.killEvery | 0}u, ${K.biteEvery | 0}u, genomes[fk].photo > 0.4) == 0u;
}

// Whether an attack on food of kind fk misses: armour, an unfamiliar quarry, too little skill, or prey
// hiding among stone. Every roll is drawn whatever the outcome, so the random stream stays the same.
fn mealMissed(fk: u32, info: u32, g: Genome, eatEff: f32, stoneN: f32, plantN: f32, animN: f32, rivals: f32, sg: vec4u, full: f32, s: ptr<function, u32>) -> bool {
  let armored = fk >= FIRST_LIFE && rnd(s) * (1.0 + ${f(K.armor)} * max(0.0, genomes[fk].adhesion - ${f(K.adhMin)})) > 1.0;
  let image = (info >> 6u) & 1023u;
  let unfamiliar = ${f(K.searchImage)} > 0.0 && fk >= FIRST_LIFE && image != 0u && image != fk && rnd(s) < ${f(K.searchImage)};
  let unskilled = ${f(K.catchSkill)} > 0.0 && fk >= FIRST_LIFE && rnd(s) >= min(1.0, eatEff * select(g.dFlesh, ${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh, genomes[fk].photo > 0.4) / ${f(K.catchSkill)});
  // an attack made from among stone often misses: prey hides in the crevices
  let sheltered = fk >= FIRST_LIFE && rnd(s) < min(${f(K.refugeMax)}, stoneN * ${f(K.refuge)});
  // an animal among dense producers hides in them (a grazer in its meadow)
  let hidden = ${f(K.plantRefuge)} > 0.0 && fk >= FIRST_LIFE && genomes[fk].photo <= 0.4 && rnd(s) < min(${f(K.refugeMax)}, plantN * ${f(K.plantRefuge)});
  // hunters of one species crowding the same quarry get in each other's way
  // matter too takes being built for it: a husk is often lost to a cell that only dabbles in it
  let fumbled = ${f(K.matterSkill)} > 0.0 && fk == HUSK
    && rnd(s) >= min(1.0, eatEff * g.dHusk / ${f(K.matterSkill)});
  let jostled = ${f(K.interfere)} > 0.0 && fk >= FIRST_LIFE && rnd(s) * (1.0 + ${f(K.interfere)} * rivals) > 1.0;
  // recognition: living prey is caught as well as the eater's receptors match its surface (coevolution: prey
  // evolve away from the receptors hunting them, hunters toward the commonest prey)
  var unrecognised = false;
  if (${f(K.recognize)} > 0.0 && fk >= FIRST_LIFE) {
    let ps = genomes[fk].sig[0];
    let fit = clamp((sdot(sg.z, ps.x) + sdot(sg.w, ps.y)) * ${f(K.affScale)}, -1.0, 1.0);
    unrecognised = rnd(s) < ${f(K.recognize)} * (0.5 - 0.5 * fit);
  }
  // a fed hunter rests: it attacks living animals as often as it is short of the energy to divide
  // (full: E / divE), at every chance only once below 1 - K.satiety of it
  let rested = ${f(K.satiety)} > 0.0 && fk >= FIRST_LIFE && genomes[fk].photo <= 0.4 && rnd(s) >= clamp((1.0 - full) / ${f(K.satiety)}, 0.0, 1.0);
  return armored || unfamiliar || unskilled || sheltered || hidden || jostled || fumbled || unrecognised || rested;
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

// A cyst: a dormant cell. It drifts with the water, cannot eat, divide or be eaten, keeps its energy
// but for a slow leak (dying as a husk when it runs out), and wakes at random to try its luck again.
fn cystStep(i: u32) {
  var p = sortedFull[i];
  let g = genomes[p.kind];
  var s = pcg(p.id ^ pcg(sim.frame * 2654435761u + sim.seed));
  p.energy -= ${f(K.cystLeak)} * sim.dt;
  p.age += sim.dt;
  // asleep, it neither swims nor feels other cells' pull: it moves only as the current carries it and as
  // neighbours jostle it (contactMain's push, already in its velocity), and soon comes to rest
  p.vel *= pow(0.5, sim.dt / 0.15);
  let dry = pondAt(p.pos).x < 0.0;
  if (dry) { p.vel = vec2f(0.0); }
  p.pos = wrapPos(p.pos + (p.vel + flowAt(p.pos) * g.advect) * sim.dt);
  atomicAdd(&ledger[cystSlot(dietGuild(g))], 1u);
  if (p.energy <= 0.0) {
    p.kind = HUSK; p.energy = ${bodyOf(K, 'g')}; p.age = 0.0;
    p.info = (p.info & 0xffff7fc0u) | 1u${litterOf('g')};
    atomicAdd(&ledger[5], 1u);
    atomicAdd(&ledger[META_DEATH + 4u * dietGuild(g) + 1u], 1u);
  } else if (p.age > 0.0 && !dry && rnd(&s) < ${f(K.cystWake)} * (1.0 + ${f(K.rainWake)} * sim.pond.y) * sim.dt) {
    p.info = (p.info & 0xfffffff0u) | 9u; p.age = 0.0;
  }
  intent[i] = vec4u(0u, 0u, NONE, NONE);
  parts[i] = p;
}

@compute @workgroup_size(128)
fn lifeMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = livingList[gid.x];
  if (i == NONE) { return; }
  if ((sortedFull[i].info & 15u) == CYST) { cystStep(i); return; }
${cellWGSL(K, false)}
  var E = p.energy + shareE + (photoGain - upkeep) * sim.dt;
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
  // a tree's cell that has grown a daughter ages treeAge times as fast: a filament's cells live on in it
  // (its tips grow up as any cell does), so trees grow long without growing faster than single cells
  let ageRate = select(1.0, ${f(K.treeAge)}, tree && hasKid);
  var age = p.age + sim.dt * ageRate;
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
  if (!coarse) {
    if (DIAG && canHunt && (sim.tick + p.id) % ${K.eatEvery | 0}u == 0u && ((sim.tick + p.id) / ${K.eatEvery | 0}u) % ${K.killEvery | 0}u == 0u) {
      diagAdd(dg, 13u, 1u);
      if (isAnimal(food)) { diagAdd(dg, 14u, 1u); }
    }
    if (E > divE && silt != NONE && !th.torpid && age > select(${f(K.mature)} * g.lifespan, select(${f(K.growTipA)}, ${f(K.mature)} * g.lifespan, g.photo > 0.4), tree && (g.photo > 0.4 || g.beat.w > 0.5 || tail)) && (!tree || (budTurn < 3u && !budBlocked))) {
      if (atomicCompareExchangeWeak(&ledger[META_CLAIM + silt], 0u, i + 1u).exchanged) {
        ck = p.kind;
        cr = sampleRole(g, role, &s);
        if (rnd(&s) < g.mutRate * ${f(K.mutScale)}) {
          let slot = allocSlot(&s);
          if (slot != NONE) {
            mutateInto(slot, p.kind, &s);
            ck = slot;
            atomicAdd(&ledger[3], 1u);
          }
        }
        ce = max(E - bodyCost, 0.0) * g.share;
        E -= ce + bodyCost;
        addEnergy(dg, 6u, ce + bodyCost);
        act = 2u;
      }
    // a meal opportunity every K.eatEvery ticks, in the cell's own phase
    } else if (food != NONE && (sim.tick + p.id) % ${K.eatEvery | 0}u == 0u && mealDue(sortedFull[food].kind, (sim.tick + p.id) / ${K.eatEvery | 0}u)) {
      let fk = sortedFull[food].kind;
      let missed = mealMissed(fk, info, g, eatEff, stoneN, plantN, animN, max(0.0, kinN - bonds), sg, E / (divE * ${f(K.satietyAt)}), &s);
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
        if (fp.kind == HUSK) {
          gain = fp.energy * min(1.0, spec(g.dHusk) * eatEff * th.perf * ${f(K.assimilate)}); atomicAdd(&ledger[10], 1u);
        } else if (genomes[fp.kind].photo > 0.4) {
          gain = take(min(max(fp.energy, 0.0), ${f(K.bite)}), spec(${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh), false, eatEff * th.perf); gut = min(gut + max(0.0, min(max(fp.energy, 0.0), ${f(K.bite)}) - gain), ${f(K.dungE)}); act = 3u; atomicAdd(&ledger[11], 1u);
        } else {
          gain = (${bodyOf(K, 'genomes[fp.kind]')} * ${f(1 - K.carcassKeep)}) * min(1.0, spec(g.dFlesh) * eatEff * th.perf * ${f(K.assimilate)}) + take(max(fp.energy, 0.0), spec(g.dFlesh), false, eatEff * th.perf); atomicAdd(&ledger[7], 1u); gut = min(gut + max(0.0, (${bodyOf(K, 'genomes[fp.kind]')} * ${f(1 - K.carcassKeep)} + max(fp.energy, 0.0)) - gain), ${f(K.dungE)});
        }
        if (fk >= FIRST_LIFE) { info = (info & 0xffff003fu) | (fk << 6u); }
        E += gain;
        addEnergy(dg, select(select(4u, 2u, act == 3u), 3u, fp.kind == HUSK), gain);
      }
    }
  } else {
    // A coarse step walks its ticks in order, as that many 1/60 s steps would: energy flows tick by tick
    // (upkeep following it), the cell divides once its energy crosses the mark (one birth a step), eats
    // at each of its own meal opportunities while still hungry then (the next-best target after a meal or
    // a target lost to another eater), and stops at the tick it starves or ages out.
    E = p.energy + shareE;
    age = p.age;
    var next = 0u;
    var born = false;
    for (var k = 1u; k <= sim.ticks; k++) {
      E += (photoGain - g.metab * kinCost * thrift * (0.55 + 0.45 * clamp(E / g.reproE, 0.0, 1.0))
        * (1.0 + ${f(K.stressCost)} * th.stress) * select(1.0, ${f(K.torporCost)}, th.torpid) - heatMaking) * h;
      age += h * ageRate;
      let tk = sim.tick - sim.ticks + k;
      if (!born && E > divE && silt != NONE && !th.torpid && age > select(${f(K.mature)} * g.lifespan, select(${f(K.growTipA)}, ${f(K.mature)} * g.lifespan, g.photo > 0.4), tree && (g.photo > 0.4 || g.beat.w > 0.5 || tail)) && (!tree || (budTurn < 3u && !budBlocked))) {
        born = true;
        var won = atomicCompareExchangeWeak(&ledger[META_CLAIM + silt], 0u, i + 1u).exchanged;
        if (!won && silt2 != NONE) { won = atomicCompareExchangeWeak(&ledger[META_CLAIM + silt2], 0u, i + 1u).exchanged; }
        if (won) {
          ck = p.kind;
          cr = sampleRole(g, role, &s);
          if (rnd(&s) < g.mutRate * ${f(K.mutScale)}) {
            let slot = allocSlot(&s);
            if (slot != NONE) {
              mutateInto(slot, p.kind, &s);
              ck = slot;
              atomicAdd(&ledger[3], 1u);
            }
          }
          ce = max(E - bodyCost, 0.0) * g.share;
          E -= ce + bodyCost;
          addEnergy(dg, 6u, ce + bodyCost);
          act = 2u;
          continue;
        }
      } else if ((tk + p.id) % ${K.eatEvery | 0}u == 0u && next < 4u && E < divE * ${f(K.sated)} && eatEff > 0.1 && !th.torpid) {
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
          if (mealMissed(fp.kind, info, g, eatEff, stoneN, plantN, animN, max(0.0, kinN - bonds), sg, E / (divE * ${f(K.satietyAt)}), &s)) { if (hunt && isAnimal(fd)) { diagAdd(dg, 16u, 1u); } break; }
          let plant = fp.kind >= FIRST_LIFE && genomes[fp.kind].photo > 0.4;
          var got = true;
          if (plant) {
            // bites don't exclude each other: in 1/60 s steps several grazers would each have had a turn
            atomicOr(&ledger[META_CLAIM + fd], MEAL_CLAIM | (3u << 29u));
            atomicAdd(&ledger[META_CLAIM + fd], 1u);
          } else {
            let cls = select(2u, 0u, fp.kind >= FIRST_LIFE);
            got = atomicCompareExchangeWeak(&ledger[META_CLAIM + fd], 0u, MEAL_CLAIM | (cls << 29u) | (i + 1u)).exchanged;
          }
          if (hunt && isAnimal(fd)) { diagAdd(dg, select(17u, 18u, got), 1u); }
          next++;
          if (!got) { continue; }
          var gain = 0.0;
          var slot = 4u;
          if (fp.kind == HUSK) {
            gain = fp.energy * min(1.0, spec(g.dHusk) * eatEff * th.perf * ${f(K.assimilate)}); atomicAdd(&ledger[10], 1u); slot = 3u;
          } else if (plant) {
            gain = take(min(max(fp.energy, 0.0), ${f(K.bite)}), spec(${f(K.grazePref)} * g.dGlint + ${f(K.plantPref)} * g.dFlesh), false, eatEff * th.perf); gut = min(gut + max(0.0, min(max(fp.energy, 0.0), ${f(K.bite)}) - gain), ${f(K.dungE)}); atomicAdd(&ledger[11], 1u); slot = 2u;
          } else {
            gain = (${bodyOf(K, 'genomes[fp.kind]')} * ${f(1 - K.carcassKeep)}) * min(1.0, spec(g.dFlesh) * eatEff * th.perf * ${f(K.assimilate)}) + take(max(fp.energy, 0.0), spec(g.dFlesh), false, eatEff * th.perf); atomicAdd(&ledger[7], 1u); gut = min(gut + max(0.0, (${bodyOf(K, 'genomes[fp.kind]')} * ${f(1 - K.carcassKeep)} + max(fp.energy, 0.0)) - gain), ${f(K.dungE)});
          }
          if (fp.kind >= FIRST_LIFE) {
            atomicAdd(&ledger[META_DEATH + 32u + 5u * dietGuild(g) + dietGuild(genomes[fp.kind])], 1u);
            info = (info & 0xffff003fu) | (fp.kind << 6u);
          }
          E += gain;
          addEnergy(dg, slot, gain);
          break;
        }
      }
      if (E <= 0.0 || age > g.lifespan) { break; }
    }
  }

  // a full gut is dropped as dung: the grain beside the eater becomes a husk of what it held
  if (act == 0u && silt != NONE && gut >= ${f(0.98 * K.dungE)}) {
    if (atomicCompareExchangeWeak(&ledger[META_CLAIM + silt], 0u, i + 1u).exchanged) {
      act = 2u; ck = HUSK; ce = gut; gut = 0.0;
    }
  }
  // a cell running out with nothing to eat in reach may go dormant (after a while awake)
  if (act == 0u && E > 0.0 && E < ${f(K.cystAt)} * divE && food == NONE && age > 10.0 && g.photo <= 0.4 && rnd(&s) < ${f(K.cystRate)} * sim.dt) {
    info = (info & 0xffff003fu & 0xfffffff0u) | CYST;
    age = 0.0;
  }
  // stranded on dry ground a cell dries out, unless it rests as a cyst (or a spore) first
  if (stranded && E > 0.0) {
    if (act == 0u && rnd(&s) < ${f(K.dryCyst)} * smoothstep(0.5, 1.0, -shore / ${f(K.filmR)}) * sim.dt) { info = (info & 0xffff003fu & 0xfffffff0u) | CYST; age = 0.0; act = 0u; }
    else { E -= ${f(K.dryCost)} * sim.dt; }
  }
  var kind = p.kind;
  if (E <= 0.0) {
    kind = HUSK; E = bodyCost; age = 0.0; vel *= 0.3;
    info = (info & 0xffff7fc0u) | 1u${litterOf('g')};
    atomicAdd(&ledger[5], 1u);
    atomicAdd(&ledger[META_DEATH + 4u * dietGuild(g) + 1u], 1u);
  } else if (age > g.lifespan) {
    kind = HUSK; E = bodyCost + ${f(K.huskFrac)} * E; age = 0.0; vel *= 0.3;
    info = (info & 0xffff7fc0u) | 2u${litterOf('g')};
    atomicAdd(&ledger[6], 1u);
    atomicAdd(&ledger[META_DEATH + 4u * dietGuild(g) + 2u], 1u);
  } else if (th.x > 0.8 && rnd(&s) < ${f(K.scald)} * smoothstep(0.8, 1.4, th.x) * sim.dt) {
    // scalded: far above its optimum, a cell's proteins come apart
    kind = HUSK; E = bodyCost; age = 0.0; vel *= 0.3;
    info = (info & 0xffff7fc0u) | 10u${litterOf('g')};
    atomicAdd(&ledger[META_DEATH + 20u + dg], 1u);
  }
  if (kind == HUSK) { atomicAdd(&ledger[META_ENERGY + select(61u, 60u, g.photo > 0.4)], 1u); }
  // calcifying cells that settled leave their skeleton as stone, in their own colour, mostly where
  // stone already is, so reefs grow outward from rock and from the rare place one starts
  if (kind == HUSK && g.calcify > 0.0 && rnd(&s) < ${f(K.reefs)} * g.calcify * (1.0 - g.advect) * select(${f(K.nucleate)}, 1.0, stoneN >= 1.0)) {
    kind = STONE; E = ${f(K.stoneLife)} * (0.5 + rnd(&s)); vel = vec2f(0.0);
  }
  // the child's generation, and in a tree her turn and branch order
  var childGen = ((genOf(p.info) + 1u) & 4095u) << 14u;
  if (tree && budTurn < 3u) { childGen |= (budTurn | (min(orderOf(p.info) + select(1u, 0u, budTurn == 0u), 3u) << 2u)) << 26u; }
  // a tail's base: generation 0, branch order 2 (a tail grows on as a tree's straight daughters do, order kept)
  else if (sprout) { childGen = (2u << 2u) << 26u; }
  // y: the child's energy on a birth; otherwise how closely packed this cell is, read only by rendering
  intent[i] = vec4u(act | (ck << 2u) | (cr << 12u) | childGen, bitcast<u32>(select(pack, ce, act == 2u)), n1, n2);
  parts[i] = Particle(pos, vel, kind, E, age, p.id, pack4x8unorm(vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0 - gut / ${f(K.dungE)})), info);
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
var<private> mFlee: vec2f;
var<private> mFl: f32;
var<private> mMatterN: vec4f;
var<private> mN: u32;

fn mPut(o: u32, v: f32) { mind[o] = bitcast<u32>(v); }
fn mPut2(o: u32, v: vec2f) { mind[o] = bitcast<u32>(v.x); mind[o + 1u] = bitcast<u32>(v.y); }

// One sampled neighbour's pull: fr0 its signature (or personal-space) term, fr with the diet's added
// and flight from a hunter (mFl) taken away.
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
  mDiet += u * (fr - fr0 + mFl);
  mFlee -= u * mFl;
  if (mN < MIND_NBR) {
    let o = MIND_HEAD + mN * ${MIND_NBR_WORDS}u;
    mind[o] = qk;
    mind[o + 1u] = select(0u, 1u, inside);
    mPut2(o + 2u, d);
    mPut(o + 4u, fr0);
    mPut(o + 5u, fr - fr0 + mFl);
    mind[o + 6u] = j;
    mPut(o + 7u, -mFl);
  }
  mN++;
}

@compute @workgroup_size(256)
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
    mPut2(56, df);
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
  // the energy it divides at, whether it is dormant (a cyst: lifeMain does not run this decision for
  // it) and old enough to divide, the push away from hunters, its gut's fill, producers around it
  mPut(58, divE);
  mind[59] = select(0u, 1u, (p.info & 15u) == CYST) | select(0u, 2u, p.age + sim.dt > ${f(K.mature)} * g.lifespan);
  mPut2(60, mFlee * acc);
  mPut(62, gut / ${f(K.dungE)});
  mPut(63, plantN);
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

// Tracking a cell by id: first only the 5×5 grid cells around where it is expected (pu.center), each
// workgroup one grid cell's range of the sorted particles; then trackArgs sizes the full pickMain
// scan to nothing if that found it, else to every particle. Particles are sorted by where they were
// before the last step, at most 7 · 4/60 units from where they are, so the 2 units around suffice.
@group(0) @binding(4) var<storage, read> cellStart: array<u32>;
@group(0) @binding(5) var<storage, read_write> fallback: array<u32, 3>;

@compute @workgroup_size(256)
fn trackNear(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) l: u32) {
  let g = vec2i(pu.world);
  let at = (vec2i(floor(pu.center)) + vec2i(i32(wg.x % 5u), i32(wg.x / 5u)) - 2 + g) % g;
  let cell = u32(at.y * g.x + at.x);
  for (var i = cellStart[cell] + l; i < cellStart[cell + 1u]; i += 256u) {
    if (parts[i].id == pu.selId) { pout.tracked = parts[i]; pout.found = 1u; }
  }
}

@compute @workgroup_size(1)
fn trackArgs() {
  fallback = array<u32, 3>(select((pu.count + 255u) / 256u, 0u, pout.found == 1u), 1u, 1u);
}
`;

// Where a few particles are right now, found by id (observational): the page marks the cells
// that sing their species' note exactly where they are, as it does the followed cell.
export const WATCH_MAX = 16;
export const WATCH_WGSL = COMMON + /* wgsl */ `
struct WatchU { count: u32, n: u32, grid: vec2u, ids: array<vec4u, ${WATCH_MAX / 4}>, near: array<vec4f, ${WATCH_MAX}> };
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

// First only near where each is expected (as trackNear: wu.near[k].xy, 5×5 grid cells, a
// workgroup each); watchArgs then sizes the full watchMain scan to nothing if all were found.
@group(0) @binding(3) var<storage, read> cellStart: array<u32>;
@group(0) @binding(4) var<storage, read_write> fallback: array<u32, 3>;

@compute @workgroup_size(256)
fn watchNear(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) l: u32) {
  let k = wg.y;
  let g = vec2i(wu.grid);
  let at = (vec2i(floor(wu.near[k].xy)) + vec2i(i32(wg.x % 5u), i32(wg.x / 5u)) - 2 + g) % g;
  let cell = u32(at.y * g.x + at.x);
  let id = wu.ids[k / 4u][k % 4u];
  for (var i = cellStart[cell] + l; i < cellStart[cell + 1u]; i += 256u) {
    let p = parts[i];
    if (p.id == id && p.kind >= FIRST_LIFE) { wout.at[k] = vec4f(p.pos, p.vel); wout.found[k] = 1u; }
  }
}

@compute @workgroup_size(1)
fn watchArgs() {
  var all = true;
  for (var k = 0u; k < wu.n; k++) { all = all && wout.found[k] == 1u; }
  fallback = array<u32, 3>(select((wu.count + 255u) / 256u, 0u, all), 1u, 1u);
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
${shownWater('lu.world')}// layout: [0,8) in-view events per type, [8,16) out of view, 16 living in view, 17 their summed
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
      let warmth = waterTempAt(p.pos) + ${f(DEFAULT_K.selfWarm)} * thermoOf(g);
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
export const SURVEY = { living: 0, bonded: 1, births: 2, mutations: 3, sparks: 4, deaths: 5, kills: 6, species: 7, speed: 8, glint: 9 }; // glint: no longer counted (always 0)
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
  }
  let t = min(vec2u(c % su.grid.x, c / su.grid.x) / su.tile, su.tiles - 1u);
  let o = (t.y * su.tiles.x + t.x) * ${SURVEY_WORDS}u;
  for (var k = 0u; k < ${SURVEY_WORDS}u; k++) {
    if (k == 7u) { if (mask != 0u) { atomicOr(&sout[o + 7u], mask); } }
    else if (n[k] != 0u) { atomicAdd(&sout[o + k], n[k]); }
  }
}
`;

// A view that sees little of the world draws only the particles in the grid rows it covers. Particles
// are sorted by grid cell, so each row's cells in view are one range of indices (two where the view
// wraps): cullRows lists them as segments (first index, how many come before) with the draws' indirect
// arguments, and the vertex shaders map an instance to its particle (cullIndex).
export const CULL_SEGS = 2048;
export const CULL_WGSL = /* wgsl */ `
// the view's grid cells (first, count; count.x <= grid width) and the grid
struct Cull { first: vec2u, count: vec2u, grid: vec2u, pad: vec2u };
@group(0) @binding(0) var<uniform> cull: Cull;
@group(0) @binding(1) var<storage, read> cellStart: array<u32>;
// [0]: (segments, particles), then (first index, particles before) per segment
@group(0) @binding(2) var<storage, read_write> segs: array<vec2u>;
// points (4 vertices), lines (4), bridges (30), as drawIndirect arguments
@group(0) @binding(3) var<storage, read_write> args: array<u32, 12>;
var<workgroup> sums: array<u32, 256>;

@compute @workgroup_size(256)
fn cullRows(@builtin(local_invocation_index) l: u32) {
  let wraps = cull.first.x + cull.count.x > cull.grid.x;
  let per = select(1u, 2u, wraps);
  let n = min(cull.count.y * per, ${CULL_SEGS - 1}u);
  var at: array<u32, 8>;
  var len: array<u32, 8>;
  var sum = 0u;
  for (var k = 0u; k < 8u; k++) {
    let s = l * 8u + k;
    var a = 0u; var b = 0u;
    if (s < n) {
      let row = ((cull.first.y + s / per) % cull.grid.y) * cull.grid.x;
      var x0 = cull.first.x; var x1 = min(cull.first.x + cull.count.x, cull.grid.x);
      if (wraps && s % per == 1u) { x0 = 0u; x1 = cull.first.x + cull.count.x - cull.grid.x; }
      a = cellStart[row + x0]; b = cellStart[row + x1];
    }
    at[k] = a; len[k] = b - a; sum += b - a;
  }
  sums[l] = sum;
  workgroupBarrier();
  for (var o = 1u; o < 256u; o = o << 1u) {
    var t = 0u;
    if (l >= o) { t = sums[l - o]; }
    workgroupBarrier();
    sums[l] = sums[l] + t;
    workgroupBarrier();
  }
  var before = sums[l] - sum;
  for (var k = 0u; k < 8u; k++) {
    let s = l * 8u + k;
    if (s < n) { segs[1u + s] = vec2u(at[k], before); }
    before += len[k];
  }
  if (l == 255u) {
    let total = sums[255];
    segs[0] = vec2u(n, total);
    args = array<u32, 12>(4u, total, 0u, 0u, 4u, total, 0u, 0u, 30u, total, 0u, 0u);
  }
}
`;

// Rendering only: each living cell's incoming bonds, so a body's cells fuse with every partner,
// not only the (up to two) they keep themselves. Bonds are one-sided in the sim.
// How cells are drawn through the moments that change them (observational: contactGather keeps each
// cell's record, vsPoint and pointColor read it). Durations are in sim seconds: paused they hold, at
// fast speeds they hurry along with the world.
const ANIM_WGSL = /* wgsl */ `
// a newborn buds out of its mother and grows to full size; the neck between them pinches off
const BIRTH_T = 0.9;
// a cell curling up into a cyst, or waking from one
const SLEEP_T = 1.2;
// a bite's wound in a producer heals in this long (and bites again and again keep it open); an eater
// swells with a meal
const BITE_T = 1.4;
// a meal's food vacuole drifts in from the front and is digested
const DIGEST_T = 1.6;
const GULP_T = 0.4;
// a cell that starved, aged or scalded withers into its husk; one killed bursts
const WITHER_T = 1.6;
const BURST_T = 0.9;
// a husk eaten (or rotted) away shrinks into the silt it leaves
const EATEN_T = 0.6;
// sim time is kept modulo this (f32 holds it to a millisecond)
const SIM_WRAP = 4096.0;
// a new species sparkles for a while: a mutant newborn, or life sparked from silt
const NOVEL_T = 2.5;
// look: the living kind (bits 0-9), its role (10-11), whether it was seen born (12), a bite's world angle
// (13-20), whether it was seen born a new species (21)
const LOOK_BORN = 0x1000u;
const LOOK_NOVEL = 0x200000u;
// Each living cell in view bends along the curve of its path, through a soft spring so it lags and
// sways back as it straightens, and a knock (a sudden change of velocity) squashes it along the
// knock through a quicker spring, so it jiggles and settles. Kept by ID (unique serials), so it needs
// nothing from the sort; another ID in the slot starts afresh. Half-float pairs: velocity smoothed
// over about 0.08 s, so jitter neither turns nor knocks it; bend
// and its rate; the squash (a nematic: amount times (cos, sin) of twice its axis) and its rate; and
// how closely packed it is (lifeMain's intent.y, sampled afresh each tick: in a crowd its estimate
// jumps tick to tick), smoothed over about 0.3 s, so a cell in a mat keeps a steady size (packFit).
// Then what it was and what has just happened to it: look; the sim time it was last seen (simT, modulo
// SIM_WRAP); its fullness (energy / reproE) eased, and its energy when last seen; a newborn's offset
// toward its mother (world units); sim seconds since it was bitten and since it ate; how far it has
// curled up into a cyst (0..1) and how deep its wound is (0..1).
struct Sway { id: u32, vel: u32, bend: u32, time: f32, squash: u32, rate: u32, face: u32, pack: f32,
  look: u32, simT: f32, fed: u32, shift: u32, ev: u32, sleep: u32 };
// a newborn and its mother: one species, or a mutant daughter and the species she came from
fn budKin(a: Genome, b: Genome) -> bool { return a.serial == b.serial || a.parent == b.serial || b.parent == a.serial; }
// a newborn's growth, 0 at birth to 1 (overshooting a little, then settling)
fn budGrowth(age: f32) -> f32 { let t = clamp(age / BIRTH_T, 0.0, 1.0) - 1.0; return 1.0 + 2.0 * t * t * t + t * t; }
`;

export const INBOND_WGSL = COMMON + ANIM_WGSL + /* wgsl */ `
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
@group(0) @binding(8) var<storage, read_write> sway: array<Sway>;

fn drawnSize(p: Particle) -> f32 { return genomes[p.kind].size * (1.0 - 0.12 * f32(roleOf(p.info))); }

// The living cells a grid cell's cells could touch, gathered once for the workgroup: its own first,
// then those within reach in the eight around it (the largest cells reach 0.085 · 1.3 · 2 · 2.6 < 0.6).
// Matter heaps pile ten thousand grains into one grid cell, so scanning every particle around each
// cell cost 190–690 ms a frame with a heap in view; here each cell searches only living neighbours, at most
// NEAR_N of them (past that, cells overlap dozens deep and which few it flattens against can't be seen).
// Positions are packed relative to the grid cell's centre (snorm over ±2 units: 6e-5 apart), and
// each one's index (22 bits: at most 4M particles) with its drawn size (10 bits, to 1/256).
// Past NEAR_FEW they are sorted into bins of NEAR_BIN units, and each cell searches outward from its
// own bin, skipping bins farther than its sixth contact so far: compared with every one gathered,
// colonies of a few hundred to a grid cell took 1-7 ms a frame (all within 16 KB of workgroup memory).
const NEAR_N = 1024u;
const NEAR_REACH = 0.6;
const NEAR_BIN = 0.125;
const NEAR_BINS = 18; // per side: ±1.125 units around the grid cell's centre
const NEAR_FEW = 64u; // compared directly, unbinned
var<workgroup> nearPos: array<u32, NEAR_N>;
var<workgroup> nearKey: array<u32, NEAR_N>;
var<workgroup> nearSorted: array<u32, NEAR_N>;
// each bin's start, and one past the last bin's end
const NEAR_EDGES = 325u;
var<workgroup> binAt: array<atomic<u32>, NEAR_EDGES>;
var<workgroup> nearCount: atomic<u32>;
var<workgroup> nearMaxSize: atomic<u32>;
var<workgroup> nearUniform: u32;

// a grid cell's own living cells past NEAR_N (a colony can crowd 1500 into one), so each still has a thread
const OWN_MORE = 512u;
var<workgroup> ownMore: array<u32, OWN_MORE>;

// (returning c to its callers instead, FXC fails to compile the kernel)
fn nearAdd(j: u32, d: vec2f, size: f32, own: bool) {
  let q = u32(round(clamp(size, 0.0, 3.99) * 256.0));
  atomicMax(&nearMaxSize, q);
  let c = atomicAdd(&nearCount, 1u);
  if (c < NEAR_N) { nearPos[c] = pack2x16snorm(d * 0.5); nearKey[c] = (j << 10u) | q; }
  else if (own && c < NEAR_N + OWN_MORE) { ownMore[c - NEAR_N] = j; }
}
fn nearBin(d: vec2f) -> vec2i { return clamp(vec2i(floor((d + 1.125) / NEAR_BIN)), vec2i(0), vec2i(NEAR_BINS - 1)); }
fn nearBinOf(e: u32) -> u32 { let b = nearBin(unpack2x16snorm(nearPos[e]) * 2.0); return u32(b.y * NEAR_BINS + b.x); }

// 256 threads: a crowded grid cell's few hundred cells are worked through in a few rounds
@compute @workgroup_size(256)
fn contactGather(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) l: u32) {
  // no early returns: FXC (Dawn on D3D12) refuses barriers it can't prove every thread reaches, and an
  // empty grid cell's loops simply run no rounds
  let r = cellRange(wg);
  let g = vec2i(views.grid.xy);
  let world = vec2f(g);
  // this grid cell (its particles were sorted into it before this step moved them)
  let at = ((views.first[wg.z].xy + vec2i(wg.xy)) % g + g) % g;
  let centre = vec2f(at) + 0.5;
  if (l == 0u) { atomicStore(&nearCount, 0u); atomicStore(&nearMaxSize, 0u); }
  for (var b = l; b < NEAR_EDGES; b += 256u) { atomicStore(&binAt[b], 0u); }
  workgroupBarrier();
  for (var j = r.x + l; j < r.y; j += 256u) {
    let q = parts[j];
    if (q.kind < FIRST_LIFE) { continue; }
    var d = q.pos - centre;
    d -= world * round(d / world);
    nearAdd(j, d, drawnSize(q), true);
  }
  workgroupBarrier();
  if (l == 0u) { nearUniform = atomicLoad(&nearCount); }
  // no living cell here: nothing to touch, nor to gather
  let own = workgroupUniformLoad(&nearUniform);
  // the eight around, as one loop (FXC fails to compile the nested one)
  for (var k = select(9u, 0u, own > 0u); k < 9u; k++) {
    if (k == 4u) { continue; }
    let c = ((at + vec2i(i32(k % 3u) - 1, i32(k / 3u) - 1)) % g + g) % g;
    let cell = u32(c.y) * views.grid.x + u32(c.x);
    let end = cellStart[cell + 1u];
    for (var j = cellStart[cell] + l; j < end; j += 256u) {
      let q = parts[j];
      var d = q.pos - centre;
      d -= world * round(d / world);
      if (q.kind >= FIRST_LIFE && all(abs(d) <= vec2f(0.5 + NEAR_REACH))) { nearAdd(j, d, drawnSize(q), false); }
    }
  }
  workgroupBarrier();
  if (l == 0u) { nearUniform = min(atomicLoad(&nearCount), NEAR_N); }
  let n = workgroupUniformLoad(&nearUniform);
  // the counting sort: each one's place in its bin, the bins' starts, then the order (a few gathered
  // are compared with each other directly: all in bin 0)
  let binned = n > NEAR_FEW;
  var rank: array<u32, NEAR_N / 256u>;
  for (var t = 0u; t < NEAR_N / 256u; t++) {
    let e = l + t * 256u;
    if (e < n) { rank[t] = atomicAdd(&binAt[select(0u, nearBinOf(e), binned)], 1u); }
  }
  workgroupBarrier();
  if (l == 0u) {
    var at = 0u;
    for (var b = 0u; b < select(2u, NEAR_EDGES, binned); b++) { let c = atomicLoad(&binAt[b]); atomicStore(&binAt[b], at); at += c; }
  }
  workgroupBarrier();
  for (var t = 0u; t < NEAR_N / 256u; t++) {
    let e = l + t * 256u;
    if (e < n) { nearSorted[atomicLoad(&binAt[select(0u, nearBinOf(e), binned)]) + rank[t]] = e; }
  }
  workgroupBarrier();
  let maxSize = f32(atomicLoad(&nearMaxSize)) / 256.0;
  // This grid cell's own living cells, listed first, one a thread. A heap's few hundred are scattered
  // through its ten thousand grains: a thread a particle left one thread in 32 searching while the
  // rest waited, round after round (2.6 ms of one heap's view). Past NEAR_N + OWN_MORE, every particle.
  let listed = own <= NEAR_N + OWN_MORE;
  for (var o = l; o < select(r.y - r.x, own, listed); o += 256u) {
    var i = r.x + o;
    if (listed) { i = select(ownMore[min(o - NEAR_N, OWN_MORE - 1u)], nearKey[min(o, NEAR_N - 1u)] >> 10u, o < NEAR_N); }
    let p = parts[i];
    if (p.kind < FIRST_LIFE) { continue; }
    let si = drawnSize(p);
    var pd = p.pos - centre;
    pd -= world * round(pd / world);
    var best: array<u32, TOUCH_N>;
    var key: array<f32, TOUCH_N>;
    for (var c = 0u; c < TOUCH_N; c++) { best[c] = NONE; key[c] = 1.0; }
    // 0.085 world units per unit of size at full detail (pointSize); beyond 1.3 radii, no contact
    let reach = 0.085 * 1.3 * (si + maxSize);
    let home = select(vec2i(0), nearBin(pd), binned);
    for (var ring = 0; ring < select(1, NEAR_BINS, binned); ring++) {
      // every bin in this ring is at least ring - 1 bins away
      if (f32(ring - 1) * NEAR_BIN >= key[TOUCH_N - 1u] * reach) { break; }
      for (var dy = -ring; dy <= ring; dy++) {
        let y = home.y + dy;
        if (y < 0 || y >= NEAR_BINS) { continue; }
        // the ring's top and bottom rows whole, its sides only at their ends
        let step = select(2 * ring, 1, abs(dy) == ring);
        for (var dx = -ring; dx <= ring; dx += step) {
          let x = home.x + dx;
          if (x < 0 || x >= NEAR_BINS) { continue; }
          // nothing in a bin farther than its sixth contact can replace it
          let lo = vec2f(f32(x), f32(y)) * NEAR_BIN - 1.125;
          if (binned && length(pd - clamp(pd, lo, lo + NEAR_BIN)) >= key[TOUCH_N - 1u] * reach) { continue; }
          let b = u32(y * NEAR_BINS + x);
          for (var s = atomicLoad(&binAt[b]); s < atomicLoad(&binAt[b + 1u]); s++) {
            let e = nearSorted[s];
            let j = nearKey[e] >> 10u;
            if (j == i) { continue; }
            let d = unpack2x16snorm(nearPos[e]) * 2.0 - pd;
            let k = length(d) / (0.085 * 1.3 * (si + f32(nearKey[e] & 1023u) / 256.0));
            if (k >= key[TOUCH_N - 1u]) { continue; }
            var c = TOUCH_N - 1u;
            for (; c > 0u && key[c - 1u] > k; c--) { key[c] = key[c - 1u]; best[c] = best[c - 1u]; }
            key[c] = k;
            best[c] = j;
          }
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
    var face = vel / max(length(vel), 1e-6);
    if (dot(vel, vel) < 1e-12) { let a = renderHash(p.id) * TAU; face = vec2f(cos(a), sin(a)); }
    // (on a birth tick y holds the child's energy instead)
    let it = intent[i];
    let birth = (it.x & 3u) == 2u;
    var pack = select(bitcast<f32>(it.y), 0.0, birth);
    if (was.id == p.id && dt > 0.0 && dt < 0.1) {
      pack = select(mix(was.pack, pack, 1.0 - exp(-dt / 0.3)), was.pack, birth);
      let prev = unpack2x16float(was.vel);
      vel = mix(prev, p.vel, 1.0 - exp(-dt / 0.08));
      bend = unpack2x16float(was.bend);
      squash = unpack2x16float(was.squash);
      rate = unpack2x16float(was.rate);
      // the path's curvature (turn rate / speed) in units of the drawn radius, trusted only once the
      // cell moves a radius or so a second, below which its heading is mostly jitter
      let speed = length(vel);
      let radius = 0.085 * si;
      // the body faces where it travels, turning about a radian per radius it moves (and slowly on the
      // spot), so a cell jostled in a crowd, its velocity flicking every way, holds its heading
      face = unpack2x16float(was.face);
      var swing = atan2(vel.y, vel.x) - atan2(face.y, face.x);
      swing -= TAU * round(swing / TAU);
      let toward = atan2(face.y, face.x) + clamp(swing, -1.0, 1.0) * min(1.0, (speed / radius + 0.3) * dt);
      face = vec2f(cos(toward), sin(toward));
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

    // What has just happened to it, read from how it changed since it was last seen (in sim time).
    let simNow = bitcast<f32>(views.grid.w);
    let g = genomes[p.kind];
    let same = was.id == p.id;
    var sdt = 1e3;
    if (same) { sdt = simNow - was.simT; if (sdt < 0.0) { sdt += SIM_WRAP; } }
    // seen a moment ago (not a record from when it was last in view)
    let recent = same && dt < 0.5;
    let full = p.energy / max(g.reproE, 0.01);
    let cause = p.info & 15u;
    // a newborn is one seen since its birth (a cell woken from a cyst it was seen in is not)
    // (life sparked from silt is born too, of a species new to the world)
    var born = (cause == 9u || cause == 8u) && p.age < BIRTH_T;
    var novel = cause == 8u && p.age < NOVEL_T;
    if (same) { born = born && (was.look & LOOK_BORN) != 0u; novel = (was.look & LOOK_NOVEL) != 0u && p.age < NOVEL_T; }
    var fed = full;
    var sleep = select(0.0, 1.0, cause == CYST);
    var ev = vec2f(99.0);
    var markSize = 0.0;
    var biteAt = 0u;
    var shift = vec2f(0.0);
    let radius = 0.085 * si;
    // the nearest newborn of its kind it touches (perhaps its own daughter), and the nearest stranger
    var young = NONE;
    var stranger = NONE;
    for (var c = 0u; c < TOUCH_N; c++) {
      let j = best[c];
      if (j == NONE) { break; }
      let q = parts[j];
      if (q.kind == p.kind || budKin(g, genomes[q.kind])) { if (young == NONE && (q.info & 15u) == 9u && q.age < 0.25) { young = j; } }
      else if (stranger == NONE) { stranger = j; }
    }
    if (same) {
      let e = unpack2x16float(was.ev);
      ev = min(e + vec2f(sdt), vec2f(99.0));
      let sl = unpack2x16float(was.sleep);
      markSize = sl.y;
      biteAt = (was.look >> 13u) & 255u;
      if (recent) {
        let f0 = unpack2x16float(was.fed);
        fed = mix(f0.x, full, 1.0 - exp(-sdt / 0.4));
        // curling up or waking takes SLEEP_T
        sleep = clamp(sl.x + clamp(sleep - sl.x, -1.0, 1.0) * sdt / SLEEP_T, 0.0, 1.0);
        let dE = p.energy - f0.y;
        // its wound heals steadily
        markSize = max(0.0, markSize - sdt / BITE_T);
        // a producer that lost a bite's worth at once was bitten (not by giving birth): the wound in its
        // side, toward whoever bit it, deepens at once. A grazer biting again and again keeps it open
        // (and turns it toward where it now bites from) rather than starting it afresh, and only a fresh
        // wound makes it flinch.
        if (dE < -${f(0.6 * DEFAULT_K.bite)} && g.photo > 0.4 && young == NONE) {
          let was = f32(biteAt) / 256.0 * TAU;
          var toward = select(renderHash(p.id) * TAU, was, markSize > 0.0);
          if (stranger != NONE) { let d = parts[stranger].pos - p.pos; toward = atan2(d.y, d.x); }
          let bitten = clamp(-dE / ${f(DEFAULT_K.bite)}, 0.5, 1.0);
          let v = vec2f(cos(was), sin(was)) * markSize + vec2f(cos(toward), sin(toward)) * 0.6 * bitten;
          toward = atan2(v.y, v.x);
          biteAt = u32(fract(toward / TAU) * 256.0) & 255u;
          rate += 5.0 * (1.0 - markSize) * vec2f(cos(2.0 * toward), sin(2.0 * toward));
          markSize = min(1.0, markSize + 0.6 * bitten);
          ev.x = 0.0;
        }
        // an animal that gained a meal's worth at once: a gulp, lunging forward
        if (dE > max(0.2, 0.1 * g.reproE) && g.photo <= 0.4) {
          ev.y = 0.0;
          let a = atan2(face.y, face.x);
          rate -= 6.0 * vec2f(cos(2.0 * a), sin(2.0 * a));
        }
        // a mother whose daughter has just budded off is drawn out toward her
        if (dE < -0.2 * g.reproE && young != NONE && !born) {
          let d = parts[young].pos - p.pos;
          let a = atan2(d.y, d.x);
          rate -= 4.0 * vec2f(cos(2.0 * a), sin(2.0 * a));
        }
      }
    }
    // A newborn is drawn budding from its mother (the nearest of its kind it touches; a mutant's, the
    // nearest of the species she came from): it starts small, just within her rim, and moves out to
    // where it is as it grows. A mutant, first seen beside a cell of her mother's species and none of
    // her own, is a new species.
    if (born) {
      var mother = NONE;
      var kinFound = false;
      for (var c = 0u; c < TOUCH_N; c++) {
        let j = best[c];
        if (j == NONE) { break; }
        let m = parts[j];
        if (m.kind < FIRST_LIFE || ((m.info & 15u) == 9u && m.age < p.age)) { continue; }
        if (m.kind == p.kind) { kinFound = true; mother = j; break; }
        if (mother == NONE && genomes[m.kind].serial == g.parent) { mother = j; }
      }
      if (mother != NONE) {
        let m = parts[mother];
        var d = m.pos - p.pos;
        d -= world * round(d / world);
        let dist = length(d);
        let inner = 0.7 * 0.085 * drawnSize(m);
        if (dist > inner && dist < 4.0 * radius + 2.0 * inner) { shift = d / dist * (dist - inner) * (1.0 - budGrowth(p.age)); }
        if (!same && !kinFound && cause == 9u) { novel = true; }
      }
    }
    let look = p.kind | (roleOf(p.info) << 10u) | select(0u, LOOK_BORN, born) | (biteAt << 13u) | select(0u, LOOK_NOVEL, novel);
    sway[slot] = Sway(p.id, pack2x16float(vel), pack2x16float(bend), now,
      pack2x16float(squash), pack2x16float(rate), pack2x16float(face), pack,
      look, simNow, pack2x16float(vec2f(fed, p.energy)), pack2x16float(shift),
      pack2x16float(ev), pack2x16float(vec2f(sleep, markSize)));
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

export const DRAW_WGSL = 'diagnostic(off, derivative_uniformity);\n' + COMMON + ANIM_WGSL + /* wgsl */ `
// Unresolved views use the cheap sprite profile; resolved cells share one outline path.
struct View {
  cam: vec2f, world: vec2f, res: vec2f,
  ppu: f32, pointSize: f32, pointGain: f32, lineGain: f32,
  linkR: f32, time: f32, selId: u32, matterGain: f32,
  focusOn: u32, roleMask: u32, stateMode: u32, mute: f32,
  memberKind: u32, memberN: u32,
  // 0: draw every cell as its distant sprite at any zoom (no resolved anatomy, bonds stay lines)
  detail: u32,
  // 1: the draw covers only the grid rows in view (segs, CULL_WGSL); instances map through cullIndex
  culled: u32,
  // sprites no larger than this radius in pixels are splatted (splatMain), not drawn as quads; 0: none
  splat: f32,
  // the adhesion where bodies start to close into tissue (K.tightFrom)
  tightFrom: f32,
  pad0: u32, pad1: u32, pad2: u32, pad3: u32,
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
@group(0) @binding(9) var<storage, read> sway: array<Sway>;
@group(0) @binding(10) var<storage, read> organDir: array<u32>;
// The water's temperature per grid cell (heatMain), for how heat shows on a cell.
@group(0) @binding(11) var<storage, read> heatField: array<f32>;
${shownWater('view.world')}@group(0) @binding(12) var<storage, read> segs: array<vec2u>;
// the splatted sprites' light and coverage per pixel (r, g, b, SPRITE_COVER a), in 1/SPLAT_FIX units
@group(0) @binding(13) var<storage, read_write> splatW: array<atomic<u32>>;
@group(0) @binding(14) var<storage, read> splatR: array<u32>;
// the particles in view too large to splat, for the points' draw: indirect arguments, then indices
@group(0) @binding(15) var<storage, read_write> quadW: array<atomic<u32>>;
@group(0) @binding(16) var<storage, read> quadR: array<u32>;
const SPLAT_FIX = 4096.0;
// A distant sprite's coverage per unit of its profile, written to alpha like a resolved cell's, so
// where sprites pile up (a packed mat, a small view far out, trails) their light averages instead of
// summing to white. A lone sprite's peak (the compact profile's 1/0.7225) stays just under 1.
const SPRITE_COVER = 0.7;
var<workgroup> quadN: atomic<u32>;
var<workgroup> quadBase: u32;

// The particle a culled draw's instance ii stands for: the last segment that starts at or before it.
fn cullIndex(ii: u32) -> u32 {
  var lo = 1u;
  var hi = segs[0].x + 1u;
  while (hi - lo > 1u) {
    let mid = (lo + hi) / 2u;
    if (segs[mid].y <= ii) { lo = mid; } else { hi = mid; }
  }
  return segs[lo].x + ii - segs[lo].y;
}
// the particle a point's instance draws, and the cell a bond's instance draws (living, unless culled)
fn pointAt(ii: u32) -> u32 {
  if (view.culled == 1u) { return cullIndex(ii); }
  if (view.splat > 0.0) { return quadR[4u + ii]; }
  return ii;
}
fn livingAt(ii: u32) -> u32 { if (view.culled == 1u) { return cullIndex(ii); } return livingList[ii]; }

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
    let warmth = waterTempAt(p.pos) + ${f(DEFAULT_K.selfWarm)} * thermoOf(g);
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
// rest: how still it lies (a cyst, or a dead cell: its outline stops flowing) and how far it has curled
// up into a cyst (rounding into a disc of the same area).
fn cellOutline(uv: vec2f, dir: vec2f, radius: f32, seed: f32,
    shape: u32, traits: vec4f, s: vec2f, pace: f32, bend: f32, rest: vec2f) -> CellOutline {
  let pc = max(pace, 0.0);
  let aspect = bodyAspect(s, traits.x, pc);
  var motion = localPoint(uv, dir) * vec2f(1.0 / aspect, aspect);
  motion.y -= bendShift(motion.x, bend);
  // Dragged through the water a cell is blunt in front and drawn out thin behind, by as much,
  // so its area holds (to second order in pace).
  motion.y *= exp(pc * 0.35 * (smoothstep(0.0, -0.9, motion.x) - smoothstep(0.0, 0.9, motion.x)));
  // Area-preserving shears, with each cell's own phase (held where it lies still).
  let flowing = seed * TAU + view.time * (0.18 + traits.y * 0.15) * (1.0 - traits.z * 0.7);
  let held = seed * TAU;
  var q = motion;
  q.x += 0.075 * mix(sin(q.y * 4.0 + flowing), sin(q.y * 4.0 + held), rest.x) + (s.y - 0.5) * 0.20 * q.y;
  q.y += 0.065 * mix(sin(q.x * 4.5 + flowing * 1.3), sin(q.x * 4.5 + held * 1.3), rest.x);
  // and a moving one ripples, a wave running back along its body and growing toward the rear
  q.y += pc * 0.075 * sin(q.x * 4.0 + seed * 40.0 + view.time * 4.5) * (0.3 + 0.7 * smoothstep(0.5, -0.8, q.x));
  let a = atan2(q.y, q.x);
  let ripple = 0.018 * sin(a * 5.0 + seed * 23.0) * smoothstep(0.1, 0.4, length(q));
  let teeth = traits.w * fineLOD(radius) * 0.02 * pow(max(0.0, cos(a * 17.0 + seed * 11.0)), 6.0);
  var sd = bodySD(q, shape, s);
  if (rest.y > 0.0) { sd = mix(sd, length(q) - sqrt(bodyArea(shape, s)), 0.9 * smoothstep(0.0, 1.0, rest.y)); }
  return CellOutline(sd - ripple - teeth * (1.0 - rest.y), q);
}
// This cell's sway, if contactGather kept it just now (the slot may hold another cell, or this one
// from when it was last in view).
fn swayOf(p: Particle) -> Sway {
  let st = sway[p.id % arrayLength(&sway)];
  if (st.id != p.id || abs(view.time - st.time) > 0.2) { var none: Sway; none.id = ~p.id; return none; }
  return st;
}
// Heading as contactGather keeps it (turning only as the cell travels), so jostling doesn't spin the cell.
fn cellDirection(p: Particle) -> vec2f {
  let st = swayOf(p);
  let v = select(p.vel, unpack2x16float(st.face), st.id == p.id);
  let a = select(renderHash(p.id) * TAU, atan2(v.y, v.x), dot(v, v) > 0.000001);
  return vec2f(cos(a), sin(a));
}
// A tree's cell (or a tail's) faces along its branch, away from its mother; any other faces where it swims.
fn bodyDirection(ii: u32, p: Particle) -> vec2f {
  let g = genomes[p.kind];
  let m = intent[ii].z;
  if ((g.dev.x >= 0x80000000u || tailCell(g, p.info)) && g.adhesion > ${f(DEFAULT_K.adhMin)} && m < arrayLength(&parts) && m != ii && parts[m].kind == p.kind) {
    let d = wrapd(p.pos - parts[m].pos);
    if (dot(d, d) > 1e-10) { return normalize(d); }
  }
  return cellDirection(p);
}
// A resolved cell is drawn no larger than the room its living neighbours leave it, so a dense body
// reads as packed tissue rather than a stack of overlapping cells. The sim records a kernel density
// of living neighbours within LINK_R (sum of (1 - r/L)^2, i.e. pi L^2 rho / 6), smoothed by contactGather
// (Sway.pack); a hexagonal packing of that density has spacing L * sqrt(0.6046 / pack). Distant sprites
// keep their size.
fn packFit(p: Particle, index: u32, size: f32) -> f32 {
  if (detailLOD(view.pointSize * size) <= 0.0) { return 1.0; }
  let it = intent[index];
  let st = swayOf(p);
  if (st.id != p.id && (it.x & 3u) == 2u) { return 1.0; }
  return packRoom(select(bitcast<f32>(it.y), st.pack, st.id == p.id), size);
}
fn packRoom(pack: f32, size: f32) -> f32 {
  let lod = detailLOD(view.pointSize * size);
  if (lod <= 0.0 || !(pack > 0.01)) { return 1.0; }
  let room = 0.75 * view.linkR * sqrt(0.6046 / pack);
  return mix(1.0, min(1.0, room / (0.085 * size)), lod);
}
// What has just happened to a living cell, from its record (contactGather), or as it is with none: how
// far a newborn has grown and its offset toward its mother, how far it has curled up into a cyst, its
// fullness (eased, so giving birth or being bitten dims it smoothly), a bite out of its side (its size
// and world angle) and the swell of a meal.
struct Anim { grow: f32, shift: vec2f, sleep: f32, fed: f32, mark: f32, markAt: f32, gulp: f32, ate: f32, novel: f32, born: bool, seen: bool };
fn animOf(p: Particle, g: Genome) -> Anim {
  var a = Anim(1.0, vec2f(0.0), select(0.0, 1.0, (p.info & 15u) == CYST), p.energy / max(g.reproE, 0.01), 0.0, 0.0, 0.0, 99.0, 0.0, false, false);
  let st = swayOf(p);
  if (st.id != p.id) { return a; }
  a.seen = true;
  a.born = (st.look & LOOK_BORN) != 0u && p.age < BIRTH_T;
  if (a.born) { a.grow = budGrowth(p.age); a.shift = unpack2x16float(st.shift); }
  let sl = unpack2x16float(st.sleep);
  a.sleep = sl.x;
  a.fed = unpack2x16float(st.fed).x;
  let ev = unpack2x16float(st.ev);
  // a bite is taken at once and heals
  // a wound: deepened at once by each bite, healing steadily (contactGather)
  a.mark = sl.y;
  a.markAt = f32((st.look >> 13u) & 255u) / 256.0 * TAU;
  a.gulp = select(0.0, sin(3.14159265 * ev.y / GULP_T), ev.y < GULP_T);
  a.ate = ev.y;
  if ((st.look & LOOK_NOVEL) != 0u) { a.novel = max(0.0, 1.0 - p.age / NOVEL_T); }
  return a;
}
// a newborn starts at 0.3 of its size; a gulp swells a cell a tenth
fn animScale(a: Anim) -> f32 { return mix(0.3, 1.0, a.grow) * (1.0 + 0.1 * a.gulp); }
// where a cell is drawn: a newborn buds from its mother's side
fn drawnPos(p: Particle) -> vec2f {
  if (p.kind >= FIRST_LIFE && (p.info & 15u) == 9u && p.age < BIRTH_T) {
    let st = swayOf(p);
    if (st.id == p.id && (st.look & LOOK_BORN) != 0u) { return p.pos + unpack2x16float(st.shift); }
  }
  return p.pos;
}
// A dead cell's last moments, drawn from its record while its husk is fresh: what it was (kind, role),
// how it died (0 withered: starved, aged or scalded; 1 burst: killed by a hunter; 2 grazed away) and
// how far along it is (0..1). kind 0: none (no record, or its moment has passed).
struct Ghost { kind: u32, role: u32, how: u32, t: f32, face: vec2f, pack: f32, fed: f32 };
fn ghostOf(p: Particle) -> Ghost {
  var gh = Ghost(0u, 0u, 0u, 1.0, vec2f(1.0, 0.0), 0.0, 0.0);
  if (p.kind != HUSK || p.age >= WITHER_T || (p.info & 15u) == 11u) { return gh; }
  let st = sway[p.id % arrayLength(&sway)];
  let k = st.look & 1023u;
  if (st.id != p.id || k < FIRST_LIFE) { return gh; }
  gh.how = select(0u, select(1u, 2u, (p.info & LITTER) != 0u), (p.info & 15u) == 3u);
  gh.t = p.age / select(select(WITHER_T, 0.6 * WITHER_T, gh.how == 2u), BURST_T, gh.how == 1u);
  if (gh.t >= 1.0) { return gh; }
  gh.kind = k;
  gh.role = (st.look >> 10u) & 3u;
  gh.face = unpack2x16float(st.face);
  gh.pack = st.pack;
  gh.fed = unpack2x16float(st.fed).x;
  return gh;
}
// how far a ghost has given way to its husk
fn ghostFade(how: u32, t: f32) -> f32 { return select(smoothstep(0.5, 1.0, t), smoothstep(0.25, 0.85, t), how == 1u); }
// Match vsPoint's living-cell radius, including focus and unresolved highlights.
fn cellRadius(p: Particle, g: Genome, index: u32) -> f32 {
  var size = g.size * (1.0 - 0.12 * f32(roleOf(p.info)));
  size *= packFit(p, index, size) * animScale(animOf(p, g));
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

// A particle as its distant sprite: its colour, profile and radius in pixels (and how much a resolved
// cell swims, which sets its reach). vsPoint uses it, and splatMain for sprites too small for quads.
// A dead cell's ghost (ghostOf) is drawn as the cell it was (kind) fading into its husk; live is its own
// colour before that fade, for the resolved ghost, which fades into its husk pixel by pixel.
struct Sprite { col: vec3f, shape: u32, px: f32, swim: f32, kind: u32, live: vec3f, anim: Anim, ghost: Ghost };
// a husk's colour: its cell's, browned, as bright as the energy it holds
fn huskCol(p: Particle) -> vec3f {
  let h = unpack4x8unorm(p.col).rgb;
  return mix(h * 0.6, vec3f(0.42, 0.28, 0.16), 0.55) * (0.25 + p.energy * 0.6) * view.matterGain * 1.4;
}
fn spriteOf(p: Particle, ii: u32) -> Sprite {
  let k = p.kind;
  var size = 1.0;
  var col: vec3f;
  var live = vec3f(0.0);
  var shape = 0u;
  var swim = 0.0;
  var kind = k;
  var a = Anim(1.0, vec2f(0.0), 0.0, 0.0, 0.0, 0.0, 0.0, 99.0, 0.0, false, false);
  let gh = ghostOf(p);
  let cause = p.info & 15u;
  if (k >= FIRST_LIFE || gh.kind != 0u) {
    let dead = gh.kind != 0u;
    kind = select(k, gh.kind, dead);
    let g = genomes[kind];
    size = g.size * (1.0 - 0.12 * f32(select(roleOf(p.info), gh.role, dead)));
    // what has just happened to it (only cells drawn in detail keep a record)
    let close = detailLOD(view.pointSize * size);
    a.sleep = select(0.0, 1.0, cause == CYST);
    a.fed = p.energy / max(g.reproE, 0.01);
    if (dead) {
      size *= packRoom(gh.pack, size);
      a.fed = gh.fed;
    } else {
      size *= packFit(p, ii, size);
      if (close > 0.0) { a = animOf(p, g); }
      size *= animScale(a);
    }
    // a dormant cell (a cyst) sleeps: no swimming or pulse, dimmed and greyed (curling up and waking by degrees)
    let sleep = a.sleep;
    swim = min(g.swim, 1.0) * (1.0 - sleep);
    let e = clamp(a.fed, 0.0, 1.4);
    var b = mix(0.35 + 0.65 * e, 0.62, sleep);
    let thermo = thermoOf(g);
    let warmth = waterTempAt(p.pos) + ${f(DEFAULT_K.selfWarm)} * thermo;
    let th = ${shownThermal('g', 'warmth')};
    // a torpid cell's pulse stops and it dims, cold blue
    if (!th.torpid) { b *= 1.0 + (1.0 - sleep) * (1.0 - select(0.0, gh.t, dead)) * g.pulse * 0.6 * sin(view.time * (0.8 + g.pulse * 4.0) + f32(p.id % 1024u) * 0.37); }
    // a birth (or a waking) flashes, seen from afar; up close a newborn is seen budding and growing
    // instead, with a soft glow, and a cell waking from a cyst it was seen in does not flash
    if (!dead && cause == 9u) { b *= 1.0 + max(0.0, 1.0 - p.age * 2.5) * mix(2.5, select(0.0, 0.35, a.born), select(0.0, close, a.seen)); }
    // life sparked from silt glows as it grows
    if (!dead && cause == 8u) { b *= 1.0 + 2.0 * max(0.0, 1.0 - p.age / BIRTH_T); }
    col = unpack4x8unorm(p.col).rgb;
    col = mix(col, vec3f(0.62, 0.66, 0.74) * dot(col, vec3f(0.3, 0.5, 0.2)) * 1.6, 0.5 * sleep);
    if (th.torpid) { col = mix(col, vec3f(0.55, 0.7, 0.95) * dot(col, vec3f(0.33)), 0.5); b *= 0.6; }
    // heat stress bleaches a cell toward pale bone; a heat-maker glows faintly warm
    col = mix(col, vec3f(1.0, 0.96, 0.9) * max(0.45, dot(col, vec3f(0.3, 0.5, 0.2))), 0.6 * smoothstep(0.3, 1.0, th.x));
    col = mix(col, col * vec3f(1.25, 0.92, 0.72) + vec3f(0.12, 0.04, 0.0), 0.7 * thermo);
    col *= b * view.pointGain;
    if (dead) {
      let t = gh.t;
      if (gh.how == 1u) {
        // burst: it swells and flares, then spills
        let flare = sin(3.14159265 * min(t / 0.3, 1.0));
        size *= 1.0 + 0.15 * flare;
        col *= 1.0 + 0.9 * flare;
      } else {
        // withered (or grazed away): the colour drains, it darkens and shrinks
        let l = dot(col, vec3f(0.3, 0.5, 0.2));
        col = mix(col, vec3f(l) * vec3f(1.05, 0.92, 0.75), 0.65 * smoothstep(0.0, 0.8, t)) * mix(1.0, 0.55, t);
        size *= mix(1.0, select(0.85, 0.6, gh.how == 2u), smoothstep(0.0, 1.0, t));
      }
      live = col;
      let w = ghostFade(gh.how, t);
      col = mix(col, huskCol(p), w);
      size = mix(size, 0.62, w);
    }
  } else if (k == SILT && (cause == 3u || cause == 4u) && p.age < EATEN_T) {
    // a husk just eaten or rotted away shrinks into the grain of silt it leaves
    let t = p.age / EATEN_T;
    shape = 12u;
    size = mix(0.62, 0.32, t);
    col = mix(huskCol(p), vec3f(0.30, 0.34, 0.46) * view.matterGain, t);
  } else if (k == SILT) {
    size = 0.4;
    col = vec3f(0.30, 0.34, 0.46) * view.matterGain;
  } else if (k == STONE) {
    shape = 14u;
    col = mix(unpack4x8unorm(p.col).rgb, vec3f(0.9, 0.86, 0.78), 0.5) * view.matterGain * 1.1;
  } else {
    // a husk; dung (state 11) is a smaller pellet. One that appears with no cell seen dying there
    // (dung, or a death out of sight a moment ago) swells into view.
    let fresh = smoothstep(0.0, 0.3, p.age);
    size = select(0.62, 0.42, cause == 11u) * mix(0.4, 1.0, fresh);
    shape = 12u;
    col = huskCol(p) * fresh;
  }
  // highlights enlarge only sprites too small to show detail; resolved cells keep their true size,
  // so resolving anatomy preserves the organism's world size
  let grow = 1.0 - detailLOD(view.pointSize * size);
  if (!focusPass(p)) {
    let l = dot(col, vec3f(0.3, 0.5, 0.2));
    col = mix(vec3f(l), col, 0.1) * view.mute;
    live = mix(vec3f(dot(live, vec3f(0.3, 0.5, 0.2))), live, 0.1) * view.mute;
    size *= 0.7;
  } else if (view.focusOn == 1u) {
    col *= 1.6;
    live *= 1.6;
    size *= 1.0 + 0.12 * grow;
  }
  if (view.memberN > 0u && k == view.memberKind && isMember(p.id)) {
    col = mix(col, vec3f(1.0, 0.97, 0.9) * max(1.0, dot(col, vec3f(0.33))), 0.35) * (1.25 + 0.2 * sin(view.time * 4.0));
    size *= 1.0 + 0.15 * grow;
  }
  if (p.id == view.selId) { col = col * 1.5 + vec3f(0.5); live = live * 1.5 + vec3f(0.5); size = mix(size, max(size, 1.2) * 1.5, grow); }
  let px = select(max(view.pointSize * size, 0.9), max(view.ppu * 0.13, 0.9), k == STONE);
  return Sprite(col, shape, px, swim, kind, live, a, gh);
}

// Sprites of a pixel or so (the main view from afar) are added straight into the image, as their light
// spread over the four nearest pixels, rather than drawn as quads: millions of near-pixel quads cost
// the vertex and raster stages far more than a thread each. Each brings the light its quad would
// (pi px^2 times its profile's mean) and the coverage it would write (SPRITE_COVER); fsSplat adds the sums
// into the scene.
// The rest, too large to splat, are listed for the points' draw (quadW: its indirect arguments, then
// the particles), so vsPoint runs only for them.
@compute @workgroup_size(256)
fn splatMain(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) l: u32) {
  if (l == 0u) { atomicStore(&quadN, 0u); }
  workgroupBarrier();
  let i = gid.x;
  var slot = NONE;
  if (i < arrayLength(&parts)) { slot = splatOne(i); }
  workgroupBarrier();
  if (l == 0u) { quadBase = atomicAdd(&quadW[1], atomicLoad(&quadN)); }
  let base = workgroupUniformLoad(&quadBase);
  if (slot != NONE) { atomicStore(&quadW[4u + base + slot], i); }
}
// one particle: splatted, or a slot in this workgroup's share of the quad list (NONE: neither)
fn splatOne(i: u32) -> u32 {
  let p = parts[i];
  if (p.kind == STONE || p.kind == FRAMBOID) { return NONE; }
  let d = wrapd(p.pos - view.cam) * view.ppu;
  // as vsPoint culls an unresolved sprite
  if (view.pointSize <= 6.0 && any(abs(d) > view.res * 0.5 + vec2f(60.0))) { return NONE; }
  let sp = spriteOf(p, i);
  if (sp.px > view.splat) { return atomicAdd(&quadN, 1u); }
  if (any(abs(d) > view.res * 0.5 + vec2f(1.0))) { return NONE; }
  let area = 3.14159265 * sp.px * sp.px * spriteMean(sp.shape) * SPLAT_FIX;
  let light = vec4f(sp.col, SPRITE_COVER) * area;
  let f = view.res * 0.5 + d - 0.5;
  let c = vec2i(floor(f));
  let t = f - floor(f);
  let size = vec2i(view.res);
  for (var k = 0u; k < 4u; k++) {
    let o = vec2i(i32(k & 1u), i32(k >> 1u));
    let at = c + o;
    if (any(at < vec2i(0)) || any(at >= size)) { continue; }
    let w = select(1.0 - t.x, t.x, o.x == 1) * select(1.0 - t.y, t.y, o.y == 1);
    let q = u32(at.y * size.x + at.x) * 4u;
    let e = light * w;
    atomicAdd(&splatW[q], u32(e.r + 0.5));
    atomicAdd(&splatW[q + 1u], u32(e.g + 0.5));
    atomicAdd(&splatW[q + 2u], u32(e.b + 0.5));
    atomicAdd(&splatW[q + 3u], u32(e.a + 0.5));
  }
  return NONE;
}
@fragment fn fsSplat(@builtin(position) at: vec4f) -> @location(0) vec4f {
  let q = (u32(at.y) * u32(view.res.x) + u32(at.x)) * 4u;
  return vec4f(f32(splatR[q]), f32(splatR[q + 1u]), f32(splatR[q + 2u]), f32(splatR[q + 3u])) / SPLAT_FIX;
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
  // how far it is drawn as a tile of tissue, filling out to the walls it shares with its kin (0..1)
  // and sim seconds since it last ate (its food vacuole drifts in from the front and is digested)
  @location(13) @interpolate(flat) tile: vec2f,
  // how wide the neck to each fused partner is (its blend, in units of the smaller radius: a bond's
  // 0.12, wider while a newborn buds off); and the cell's fullness, eased
  @location(14) @interpolate(flat) neck: vec4f,
  // what is happening to it: how far it has curled up into a cyst; dying (0: alive, else 1 + how it
  // died + how far along, as in ghostOf); a bite out of it (size, and angle from its heading)
  @location(15) @interpolate(flat) fx: vec4f,
};

@vertex fn vsPoint(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> PO {
  var o: PO;
  let ii = pointAt(inst);
  o.bondSeeds = vec2u(0u, 0x7fffu);
  o.jelly = vec3f(1.0, 0.0, 0.0);
  let p = parts[ii];
  // stone is drawn as one field of boulders (vsStone), not grain by grain
  if (p.kind == STONE || p.kind == FRAMBOID) { o.pos = vec4f(2.0, 2.0, 0.0, 1.0); return o; }
  // (a newborn is drawn budding from its mother's side)
  let at = drawnPos(p);
  let d = wrapd(at - view.cam) * view.ppu;
  // Avoid genome/partner reads for offscreen distant sprites.
  if (view.pointSize <= 6.0 && any(abs(d) > view.res * 0.5 + vec2f(60.0))) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
    return o;
  }
  let sp = spriteOf(p, ii);
  // the kind drawn: a dead cell's ghost is drawn as the cell it was
  let k = sp.kind;
  let alive = p.kind >= FIRST_LIFE;
  let gh = sp.ghost;
  let ghost = gh.kind != 0u;
  let col = sp.col;
  var shape = sp.shape;
  let swim = sp.swim;
  let px = sp.px;
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
  let an = sp.anim;
  if (alive) {
    // radii per second through the water (vel excludes the flow, smoothed once contactGather keeps it);
    // shells barely give; a cyst holds still
    let st = swayOf(p);
    let radii = length(select(p.vel, unpack2x16float(st.vel), st.id == p.id)) * view.ppu / px;
    let give = 1.0 - 0.75 * min(genomes[k].calcify, 1.0);
    pace = (1.0 - exp(-radii * 0.25)) * give * (1.0 - an.sleep);
    if (st.id == p.id) {
      o.jelly.z = unpack2x16float(st.bend).x * give * (1.0 - an.sleep);
      // the squash's axis, its length the amount
      let q = unpack2x16float(st.squash) * give;
      let axis = 0.5 * atan2(q.y, q.x);
      o.squash = vec2f(cos(axis), sin(axis)) * length(q);
    }
    extent *= (1.0 + 0.3 * pace) * (1.0 + 0.5 * abs(o.jelly.z)) * exp(length(o.squash));
  }
  if (ghost) {
    // room for the husk it becomes, and for what a burst cell spills
    extent = max(extent, 1.35 * max(view.pointSize * 0.62, 0.9) / px);
    if (gh.how == 1u) { extent = max(extent, 2.4); }
    o.fx.y = 1.0 + f32(gh.how) + min(gh.t, 0.999);
  }
  if (any(abs(d) > view.res * 0.5 + vec2f(px * extent))) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
    return o;
  }
  o.pos = toClip(d + corner * px * extent);
  o.uv = corner * extent;
  let seed = renderHash(p.id);
  // cells face where they swim (a ghost as it last did); matter keeps its own orientation (its motion
  // is mostly Brownian)
  var dir = vec2f(cos(seed * TAU), sin(seed * TAU));
  if (alive) { dir = bodyDirection(ii, p); }
  else if (ghost && dot(gh.face, gh.face) > 1e-6) { dir = normalize(gh.face); }
  o.geom = vec4f(px, extent, dir);
  o.neck = vec4f(0.12, 0.12, 0.12, an.fed);
  if (k >= FIRST_LIFE) {
    let g = genomes[k];
    shape = choosePlan(g, select(roleOf(p.info), gh.role, ghost));
    // the plan, and in the bits above it the kind it is drawn as
    o.shape = shape | (k << 8u);
    let species = vec2f(renderHash(g.serial ^ g.sig[0].y), renderHash(g.serial ^ g.sig[1].x ^ 917u));
    o.morph = species;
    o.jelly.y = pace;
    o.geom.y = bodyArea(shape, species);
    // (a new species' sparkle, in place of sleep, which a newborn never is: negative)
    o.fx.x = select(an.sleep, -an.novel, an.novel > 0.0);
    if (an.novel > 0.0) { extent = max(extent, 1.5); }
    o.tile.y = an.ate;
    if (ghost) { o.neck.w = gh.fed; }
    if (an.mark > 0.0) { o.fx.z = an.mark; o.fx.w = an.markAt - atan2(dir.y, dir.x); }
    // All partner storage reads and frame setup happen per vertex, never per pixel.
    var plans = 0x7fffu;
    var seeds = vec3f(0.0);
    if (alive && detailLOD(min(px, view.pointSize)) > 0.0) {
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
        let offset = wrapd(drawnPos(partner) - at) * view.ppu / px;
        let reach = 1.65 * (1.0 + ratio) + 0.12 * min(1.0, ratio);
        if (dot(offset, offset) > reach * reach) { continue; }
        let dir = bodyDirection(index, partner);
        plans = (plans & ~(31u << (5u * used))) | (choosePlan(g, roleOf(partner.info)) << (5u * used));
        o.bondOffset[used] = pack2x16float(offset);
        o.bondFrame[used] = pack2x16float(vec2f(ratio, atan2(dir.y, dir.x)));
        seeds[used] = renderHash(partner.id);
        if (used == 0u) { picked.x = index; } else if (used == 1u) { picked.y = index; }
        used++;
      }
      var buds = vec3u(NONE);
      var budN = 0u;
      // A newborn and the cell it buds from are joined by a wide neck that pinches off as it grows:
      // the newborn to the nearest of its kind it touches, as contactGather placed it, and a cell to any
      // newborn of its kind touching it.
      for (var c = 0u; c < 6u && used < 3u && px >= 6.0; c++) {
        let index = touch[ii * 6u + c];
        if (index == NONE) { break; }
        if (index >= arrayLength(&parts) || index == picked.x || index == picked.y) { continue; }
        let q = parts[index];
        if (q.kind < FIRST_LIFE) { continue; }
        let qg = genomes[q.kind];
        if (!budKin(g, qg)) { continue; }
        let qa = animOf(q, qg);
        // two newborns side by side are sisters, not mother and daughter
        if (an.born == qa.born) { continue; }
        let t = select(q.age, p.age, an.born) / BIRTH_T;
        let neck = 0.55 * (1.0 - smoothstep(0.2, 0.95, t));
        if (neck > 0.01) {
          let ratio = cellRadius(q, qg, index) / px;
          let offset = wrapd(drawnPos(q) - at) * view.ppu / px;
          let dir = bodyDirection(index, q);
          plans = (plans & ~(31u << (5u * used))) | (choosePlan(qg, roleOf(q.info)) << (5u * used));
          o.bondOffset[used] = pack2x16float(offset);
          o.bondFrame[used] = pack2x16float(vec2f(ratio, atan2(dir.y, dir.x)));
          seeds[used] = renderHash(q.id);
          o.neck[used] = 0.12 + neck;
          extent = max(extent, 1.2 + neck);
          used++;
          buds[budN] = index;
          budN++;
        }
        if (an.born) { break; }
      }
      // Pressed cells meet along their radical axis, as in a foam: each is cut flat there, the cut
      // softened in fsPoint, with a hair of gap for the two membranes. The outline reaches about
      // 0.8 of the radius. What the cuts take is given back by swelling, so a squeezed cell bulges
      // out its free sides.
      var lost = 0.0;
      var n = 0u;
      var kinTouch = 0.0;
      for (var c = 0u; c < 6u; c++) {
        let index = touch[ii * 6u + c];
        if (index == NONE) { break; }
        if (index >= arrayLength(&parts)) { continue; }
        let other = parts[index];
        // (a bud and its mother share the neck between them, not a wall)
        if (other.kind < FIRST_LIFE || any(buds == vec3u(index))) { continue; }
        let ratio = cellRadius(other, genomes[other.kind], index) / px;
        let offset = wrapd(drawnPos(other) - at) * view.ppu / px;
        let dist = length(offset);
        if (dist > 1.25 * (1.0 + ratio) || dist < 1e-3) { continue; }
        let r2 = 0.64 * ratio * ratio;
        let kin = other.kind == k;
        kinTouch += select(0.0, 1.0, kin);
        let t = max(select(0.6, 0.35, kin), (dist * dist + 0.64 - r2) / (2.0 * dist) - 0.012);
        let foot = pack2x16float(offset * ((t + select(4.0, 0.0, kin)) / dist));
        if (n < 3u) { o.contact[n] = foot; } else { o.contact2[n - 3u] = foot; }
        n++;
        let x = min(t / 0.8, 1.0);
        lost += (acos(x) - x * sqrt(1.0 - x * x)) * (2.0 / TAU);
      }
      // a tight species' cells among their kin fill out to their shared walls: tissue
      if (g.adhesion > ${f(DEFAULT_K.adhMin)}) {
        o.tile.x = clamp((g.adhesion - view.tightFrom) / ${f(DEFAULT_K.tightSpan)}, 0.0, 1.0) * min(1.0, kinTouch);
      }
      o.jelly.x = 1.0 / sqrt(1.0 - 0.7 * min(lost, 0.45));
      extent *= o.jelly.x;
      o.pos = toClip(d + corner * px * extent);
      o.uv = corner * extent;
    }
    o.bondSeeds = vec2u(pack2x16unorm(seeds.xy), (plans & 0xffffu) | (u32(seeds.z * 65535.0 + 0.5) << 16u));
    // a ghost resolves as the cell it was, then fades into its husk itself (pointColor)
    if (ghost) { o.col = sp.live; }
  }
  return o;
}

@fragment fn fsPoint(i: PO) -> @location(0) vec4f { return pointColor(i); }
// The main view also gathers the living alone (location 1), so the composite lays cells over the matter
// and stone beneath them rather than averaging them in.
struct PointOut { @location(0) all: vec4f, @location(1) live: vec4f };
@fragment fn fsPointLive(i: PO) -> PointOut {
  let c = pointColor(i);
  return PointOut(c, c * liveShare(i));
}
// How much of a point is drawn with the living (over the matter): a ghost passes to the matter's layer
// as it becomes its husk.
fn liveShare(i: PO) -> f32 {
  if (i.geom.x <= 2.8) { return select(0.0, 1.0, parts[i.index].kind >= FIRST_LIFE); }
  if ((i.shape >> 8u) < FIRST_LIFE) { return 0.0; }
  if (i.fx.y <= 0.0) { return 1.0; }
  return 1.0 - ghostFade(u32(i.fx.y - 1.0), fract(i.fx.y));
}
fn pointColor(i: PO) -> vec4f {
  let far = spriteFalloff(i.uv, i.shape & 255u);
  if (i.geom.x <= 2.8) { return vec4f(i.col * far, far * SPRITE_COVER); }
  let p = parts[i.index];
  let kind = i.shape >> 8u;
  if (kind < FIRST_LIFE) { return matterColor(i, p, far); }
  if (i.fx.y <= 0.0) {
    var c = cellColor(i, p, kind, far);
    // a new species: a few fine sparks twinkle about its rim, one after another, drifting out as they fade
    if (i.fx.x < 0.0) {
      let t = 1.0 + i.fx.x;
      let lod = detailLOD(min(i.geom.x, view.pointSize));
      let w = max(0.065, 1.4 / i.geom.x);
      var light = 0.0;
      for (var j = 0u; j < 9u; j++) {
        let h = renderHash(p.id * 9u + j + 311u);
        let h2 = renderHash(p.id * 9u + j + 733u);
        // each spark lives a third of the while, the first at once, the last two thirds in
        let life = (t - 0.6 * (f32(j) + h) / 9.0) / 0.33;
        if (life <= 0.0 || life >= 1.0) { continue; }
        let ang = h2 * TAU + 0.4 * life;
        let at = vec2f(cos(ang), sin(ang)) * (0.65 + 0.2 * h + 0.35 * life);
        let d = i.uv - at;
        // a point of light with four fine rays, twinkling
        let core = exp(-dot(d, d) / (w * w * 0.25));
        let ax = d.x * d.x / (w * w);
        let ay = d.y * d.y / (w * w);
        let rays = exp(-ax * 16.0 - ay * 0.6) + exp(-ay * 16.0 - ax * 0.6);
        let twinkle = 0.65 + 0.35 * sin(view.time * (9.0 + 6.0 * h) + h2 * 40.0);
        light += (core + 0.4 * rays) * sin(3.14159265 * life) * twinkle;
      }
      let glint = min(light, 1.5) * lod;
      c += vec4f((i.col * 0.35 + vec3f(0.65) * view.pointGain) * glint * 1.2, min(glint, 1.0) * 0.4);
    }
    return c;
  }
  return ghostColor(i, p, kind, far);
}
// A dead cell's last moments: the cell it was (cellColor, withering or flaring), what a burst one
// spills, and its husk fading in, in the husk's own frame, as it is drawn once the ghost is gone.
fn ghostColor(i: PO, p: Particle, kind: u32, far: f32) -> vec4f {
  let how = u32(i.fx.y - 1.0);
  let t = fract(i.fx.y);
  let lod = detailLOD(min(i.geom.x, view.pointSize));
  let aa = max(0.003, 0.75 / i.geom.x);
  var c = cellColor(i, p, kind, far);
  if (how == 1u) {
    // burst: it tears open and comes apart from the rim inward, in shreds, as its contents spill out in
    // soft droplets that drift away and dissolve
    let v = localPoint(i.uv, i.geom.zw);
    let torn = smoothstep(0.06, 0.6, t);
    let shred = 0.55 * (cellGrain(v * 4.0, p.id + 5u) * 0.5 + 0.5) + 0.45 * (1.0 - min(length(v), 1.0));
    c *= 1.0 - smoothstep(shred - 0.12, shred + 0.12, torn * 1.15);
    let spread = 1.0 - pow(1.0 - min(t / 0.9, 1.0), 2.5);
    var drop = 0.0;
    for (var j = 0u; j < 16u; j++) {
      let h = renderHash(p.id * 16u + j + 5u);
      let h2 = renderHash(p.id * 16u + j + 977u);
      let ang = (f32(j) + h) / 16.0 * TAU;
      let at = vec2f(cos(ang), sin(ang)) * (0.3 + (0.25 + 0.9 * h2) * spread);
      let r = (0.04 + 0.07 * h) * smoothstep(0.04, 0.2, t) * (1.0 - smoothstep(0.35, 1.0, t)) + aa;
      let x = length(v - at) / r;
      drop += max(0.0, 1.0 - x * x);
    }
    drop = min(drop, 1.0);
    c += vec4f(i.col * drop * 0.6 * lod, drop * lod * 0.6);
  }
  let w = ghostFade(how, t);
  if (w <= 0.0) { return c; }
  let hpx = max(view.pointSize * 0.62, 0.9);
  let huv = i.uv * i.geom.x / hpx;
  let hseed = renderHash(p.id);
  let hdir = vec2f(cos(hseed * TAU), sin(hseed * TAU));
  let hcol = huskCol(p);
  var husk = vec4f(0.0);
  if (hpx <= 2.8) {
    let hfar = spriteFalloff(huv, 12u);
    husk = vec4f(hcol * hfar, hfar * SPRITE_COVER);
  } else {
    let hlod = detailLOD(min(hpx, view.pointSize));
    let hf = huskLight(localPoint(huv, hdir), hseed, max(0.003, 0.75 / hpx), hdir);
    husk = vec4f(hcol * mix(spriteFalloff(huv, 12u), max(0.0, hf.x), hlod), hlod * hf.y);
  }
  return mix(c, husk, w);
}
// A living cell (or a dead one's ghost, fx.y > 0) resolved: its outline fused with its partners and
// pressed flat against its neighbours, its interior and its hairs and tail.
fn cellColor(i: PO, p: Particle, kind: u32, far: f32) -> vec4f {
  let lod = detailLOD(min(i.geom.x, view.pointSize));
  let seed = renderHash(p.id);
  let aa = max(0.003, 0.75 / i.geom.x);
  let myPlan = i.shape & 255u;
  var f = 0.0;
  // coverage of a resolved cell or grain, written to alpha: the composite divides overlapping light
  // by it, so stacked cells and matter average into one translucent layer instead of summing
  var cover = 0.0;
  {
    let g = genomes[kind];
    // curled up into a cyst (0..1); dead and withering (0..1); a bite out of it
    let sleep = max(i.fx.x, 0.0);
    // a new species, just born
    let novel = max(-i.fx.x, 0.0);
    let dying = select(0.0, fract(i.fx.y), i.fx.y > 0.0);
    let burst = i.fx.y >= 2.0 && i.fx.y < 3.0;
    let still = max(sleep, min(1.0, dying * 4.0));
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
    // the widest neck to a partner: the outline reaches no farther past the membrane
    let neckMax = max(0.12, max(i.neck.x, max(i.neck.y, i.neck.z)));
    var own = i.uv / swell;
    let squashed = length(i.squash);
    if (squashed > 0.0) {
      let axis = i.squash / squashed;
      let along = dot(own, axis);
      own = (own - axis * along) * exp(-squashed) + axis * along * exp(squashed);
    }
    // A tissue cell fills out toward the walls it shares with its kin, and only there: facing open water
    // it keeps its own shape. The fill grows as a neighbour presses closer, so nothing pops.
    var fill = 0.0;
    if (i.tile.x > 0.0) {
      let toward = own / max(length(own), 1e-4);
      for (var c = 0u; c < 6u; c++) {
        let foot = unpack2x16float(select(i.contact2[c % 3u], i.contact[c % 3u], c < 3u));
        let t = length(foot);
        if (t <= 0.0) { break; }
        if (t >= 4.0) { continue; }
        let facing = dot(toward, foot / t);
        fill = max(fill, smoothstep(0.15, 0.75, facing) * smoothstep(1.15, 0.8, t));
      }
    }
    for (var j = 0u; j < 4u; j++) {
      var uv = own;
      var dir = i.geom.zw;
      var radius = i.geom.x;
      var cellSeed = seed;
      var plan = myPlan;
      var ratio = 1.0;
      var flags = 0u;
      if (j > 0u) {
        // a tile of tissue meets its partners at a shared wall, not a neck
        if (i.tile.x > 0.5) { break; }
        // The partner draws itself beyond our narrow union band. Owned pixels
        // need no further outlines or interior work.
        // Deep inside, the union only darkens sd further where rim, wall and relief are all spent;
        // below 6 px (vsPoint gathers no partners) the fused neck would be under a pixel wide.
        if (lod <= 0.0 || i.geom.x < 6.0 || membraneSD > neckMax + aa || membraneSD < -0.45) { break; }
        flags = (i.bondSeeds.y >> (5u * (j - 1u))) & 31u;
        if (flags == 31u) { break; }
        let offset = unpack2x16float(i.bondOffset[j - 1u]);
        let shape = unpack2x16float(i.bondFrame[j - 1u]);
        ratio = shape.x;
        let blend = i.neck[j - 1u] * min(1.0, ratio);
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
        vec4f(g.swim, g.pulse, g.calcify, g.dFlesh), s, pace, bend, vec2f(still, sleep));
      if (j == 0u) {
        var osd = outline.sd;
        let a = atan2(outline.q.y, outline.q.x);
        // withering, the membrane loses its turgor and wrinkles
        if (dying > 0.0 && !burst) { osd += smoothstep(0.0, 0.7, dying) * (0.04 * sin(a * 9.0 + seed * 31.0) + 0.025 * sin(a * 19.0 + seed * 7.0)); }
        // a bite out of its side, healing
        if (i.fx.z > 0.0) {
          let at = vec2f(cos(i.fx.w), sin(i.fx.w)) * 0.95;
          let r = 0.28 * i.fx.z;
          osd = -smoothUnion(-osd, length(outline.q - at) - r, 0.08);
        }
        membraneSD = mix(osd, length(own) - 0.97, i.tile.x * fill) * swell;
        sd = membraneSD;
        q = outline.q;
      } else {
        let partnerSD = outline.sd * ratio;
        let blend = i.neck[j - 1u] * min(1.0, ratio);
        sd = smoothUnion(sd, partnerSD, blend);
      }
    }
    let resolved = smoothstep(0.7, 1.5, i.geom.x * 0.018) * fine;
    let swimmer = resolved > 0.0 && g.swim > 0.05 && still < 0.99;
    let hairRange = membraneSD < 0.035 + 4.0 * (0.018 + aa);
    // Well clear of the membrane (contacts only cut the body back, and the partners were skipped out
    // here) and of any hairs or tail, the pixel is empty: leave before the rest. The margin keeps
    // whole 2x2 quads together wherever the outline's derivatives are used.
    if (membraneSD > max(neckMax, 0.035 + 4.0 * (0.018 + aa)) + 3.0 * aa) {
      var tail = false;
      if (swimmer) {
        var motion = localPoint(i.uv / swell, i.geom.zw) * vec2f(1.0 / bodyAspect(s, g.swim, max(pace, 0.0)), bodyAspect(s, g.swim, max(pace, 0.0)));
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
    let aspect = bodyAspect(s, g.swim, max(pace, 0.0));
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
      let wallWidth = 0.025 + 0.008 * sin(a * 3.0 + seed * 13.0) + 0.03 * sleep;
      let rim = exp(-pow((sd + 0.025 + 0.02 * sleep) / (wallWidth + aa), 2.0));
      let innerRim = exp(-pow((sd + 0.10 + 0.04 * sleep) / (0.07 + aa), 2.0));
      var detail = (0.44 + g.calcify * 0.12 + 0.2 * sleep) * rim - 0.21 * innerRim;
      // cytoplasm is never an even fill: it is mottled, thicker in places (the difference of two
      // fields, so a cell's light is unchanged on average), and stained here and there by what the
      // cell has eaten or stored
      detail += 0.12 * (cellGrain(q * 8.0, p.id) - cellGrain(q * 8.0 + 31.7, p.id + 3u));
      hue = mix(vec3f(1.0), vec3f(1.25, 1.0, 0.65), inside * smoothstep(0.1, 0.6, cellGrain(q * 3.0 + 5.0, p.id + 13u)));
      // relief: the dome near the membrane, then each organelle's own bulge or hollow
      // kept to the membrane's own band, clear of the outline's medial axis in narrow arms
      var relief = 0.45 * dot(outward, TO_LIGHT) * (1.0 - smoothstep(0.0, 0.13, -sd));
      let division = smoothstep(0.55, 1.0, i.neck.w);
      var centre = vec2f((s.x - 0.5) * 0.22, (seed - 0.5) * 0.26);
      if (myPlan == 8u) { centre = vec2f(-0.43, -0.06); }
      if (myPlan == 3u) { centre = vec2f(-0.35, 0.02); }
      if (myPlan == 9u) { centre = vec2f(0.2, 0.0); }
      let nq = q - centre;
      let nr = length(vec2f(abs(nq.x) - division * 0.17, nq.y + 0.03 * sin(nq.x * 15.0 + seed))
        / vec2f(0.17 + division * 0.04, 0.21 - division * 0.055));
      relief += 0.3 * exp(-pow((nr - 0.8) / 0.3, 2.0)) * dot(nq / max(length(nq), 1e-4), lightQ);
      detail += -0.34 * (1.0 - smoothstep(0.75, 1.0 + aa * 3.0, nr))
        + 0.22 * exp(-pow((nr - 1.0) / (0.16 + aa), 2.0));
      let plates = sin(q.x * (8.0 + s.x * 6.0) + sin(q.y * 5.0 + s.y * 3.0));
      detail += g.calcify * 0.12 * plates * smoothstep(0.2, 0.6, r);
      if (myPlan == 4u) {
        let girdle = q.y + 0.10 * sin(q.x * 5.0 + s.y);
        detail -= 0.30 * exp(-pow(girdle / (0.035 + aa), 2.0));
      }
      if (myPlan == 5u) {
        detail += 0.13 * sin(q.y * 29.0 + q.x * 10.0 + 1.2 * sin(q.x * 4.0)) * fine;
        detail += 0.40 * exp(-dot(q - vec2f(0.5, -0.12), q - vec2f(0.5, -0.12)) * 350.0);
      }
      if (myPlan == 6u || myPlan == 9u) {
        detail -= 0.25 * exp(-pow((q.y - 0.18 - 0.12 * sin(q.x * 4.0)) / (0.045 + aa), 2.0));
      }
      if (myPlan == 7u) {
        let whorl = sin(atan2(q.y, q.x) * 2.0 - r * 18.0 + s.y);
        detail -= 0.24 * exp(-whorl * whorl * 35.0) * smoothstep(0.1, 0.3, r);
      }
      if (myPlan == 11u) {
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
          if (myPlan == 3u) {
            organCentre = vec2f(select(-0.39, 0.39, j % 2u == 0u), 0.0)
              + dir * (0.12 + h * 0.18);
          } else if (myPlan == 5u || myPlan == 6u || myPlan == 11u) {
            let x = (h - 0.5) * 1.45;
            organCentre = vec2f(x, dir.y * (0.30 - abs(x) * 0.22));
          } else if (myPlan == 7u) {
            let t = f32(j % 6u) / 5.0;
            let chamberAngle = t * 5.3 + s.y * 0.7;
            organCentre = vec2f(cos(chamberAngle), sin(chamberAngle)) * (0.12 + t * 0.36)
              + dir * h * 0.14;
          } else if (myPlan == 8u) {
            organCentre = vec2f(0.16 + s.x * 0.30, 0.09)
              + dir * (0.51 + h * 0.07);
          } else if (myPlan == 9u) {
            organCentre = vec2f(0.2, 0.0) + dir * h * 0.39;
          } else if (myPlan == 10u) {
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
      // a dying cell's insides lose their structure
      // a meal just taken: a food vacuole, pinched in at the front, drifting inward as it is digested
      if (i.tile.y < DIGEST_T) {
        let u = i.tile.y / DIGEST_T;
        let vc = q - mix(vec2f(0.5, 0.0), vec2f(-0.05, 0.12 * (seed - 0.5)), 1.0 - (1.0 - u) * (1.0 - u));
        let vr = length(vc) / (0.15 * (1.0 - 0.45 * u));
        let show = smoothstep(0.0, 0.08, i.tile.y) * (1.0 - smoothstep(0.55, 1.0, u));
        detail += show * (0.3 * exp(-pow((vr - 1.0) / 0.25, 2.0)) - 0.15 * (1.0 - smoothstep(0.6, 1.0, vr)));
        relief -= show * 0.25 * exp(-pow((vr - 0.9) / 0.3, 2.0)) * dot(vc / max(length(vc), 1e-4), lightQ);
        hue = mix(hue, vec3f(1.3, 1.05, 0.7), show * (1.0 - smoothstep(0.5, 1.0, vr)) * 0.6);
      }
      // its membrane fresh and bright
      if (novel > 0.0) { hue *= 1.0 + 0.3 * novel * rim; }
      tissue += inside * (detail + relief) * (1.0 - 0.6 * dying);
    }
    f = body * tissue * spriteMean(myPlan) / i.geom.y;
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
      f += min(g.swim, 1.0) * resolved * (1.0 - body) * (0.05 * hairs + 0.08 * tail) * (1.0 - still);
    }
    cover = body;
    return vec4f(i.col * hue * mix(far, max(0.0, f), lod), lod * cover);
  }
}
// A husk: a folded membrane, with missing arcs and torn ends, that retains the dead particle's colour.
// The torn rim is a tube of membrane, crisp and lit across its section from the upper left; inside it
// the collapsed skin is a faint film whose wrinkles catch the light. Its light and coverage at v (its
// own frame, facing dir).
fn huskLight(v: vec2f, seed: f32, aa: f32, dir: vec2f) -> vec2f {
  let a = atan2(v.y, v.x) + seed * TAU;
  let fold = length(v * vec2f(0.86, 1.55));
  let wall = 0.64 + 0.10 * sin(a * 3.0 + seed * 21.0) + 0.06 * sin(a * 7.0);
  let breaks = smoothstep(-0.85, -0.55, sin(a * 3.0 + seed * 37.0));
  let lightV = localPoint(TO_LIGHT, dir);
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
  return vec2f(max(membrane + film, 0.0) * spriteMean(12u) / 0.30,
    clamp(tube * breaks + 0.6 * (1.0 - smoothstep(wall - 0.14, wall - 0.04, fold)), 0.0, 1.0));
}
// A grain of matter resolved: a silt chip, a husk (or a husk just eaten, shrinking into silt: plan 12),
// a grain of stone.
fn matterColor(i: PO, p: Particle, far: f32) -> vec4f {
  let lod = detailLOD(min(i.geom.x, view.pointSize));
  let seed = renderHash(p.id);
  let v = localPoint(i.uv, i.geom.zw);
  let aa = max(0.003, 0.75 / i.geom.x);
  var f = 0.0;
  var cover = 0.0;
  {
    let a = atan2(v.y, v.x) + seed * TAU;
    var r = length(v);
    let sides = 4.0 + floor(seed * 4.0);
    // a broken grain: silt chips' edges wander, so no two are regular polygons
    let edge = polygonRadius(a, sides, 0.08) * select(1.0, 1.0 + 0.12 * sin(a * 2.0 + seed * 9.0) + 0.06 * sin(a * 5.0 + seed * 17.0), p.kind == SILT);
    let body = 1.0 - smoothstep(edge - aa, edge + aa, r);
    if ((i.shape & 255u) == 12u) {
      let husk = huskLight(v, seed, aa, i.geom.zw);
      f = husk.x;
      cover = husk.y;
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
  // a culled draw covers every particle in view; matter keeps no bonds (NONE below)
  let i = livingAt(ii);
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
  let index = livingAt(ii);
  if (index == NONE) { return o; }
  let it = intent[index];
  let second = vi >= 15u;
  let n = select(it.z, it.w, second);
  if (n == NONE) { return o; }
  let p = parts[index];
  let q = parts[n];
  if (p.kind < FIRST_LIFE || q.kind < FIRST_LIFE) { return o; }
  // (a newborn buds from its mother's side, vsPoint)
  let at = drawnPos(p);
  let base = wrapd(at - view.cam);
  let dq = wrapd(drawnPos(q) - at);
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
  // tissue: its cells share a wall, which is the bond; no tube shows through them
  if ((adhesion - view.tightFrom) / ${f(DEFAULT_K.tightSpan)} > 0.5) { return o; }
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
const STONE_R = 0.2; // a grain's radius in world units (uv 1); cobbles span ~0.12-0.17
const STONE_QUAD = 1.35; // the quad reaches this far in uv, so a stretched or ragged grain is never cut off
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
  if (any(abs(d) > view.res * 0.5 + vec2f(r * STONE_QUAD))) { return o; }
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
    ty = select(${mixWGSL(BEDROCK_MIX)}, ${mixWGSL(REEF_MIX)}, reef);
    var mc = vec3f(0.0);
    switch ty {
${STONE_COL_WGSL}
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
  o.pos = toClip(d + corner * r * STONE_QUAD);
  // the cobble's peak height orders it: the higher lies over its neighbours, and depth is per cobble,
  // not per pixel, so the GPU can reject hidden cobbles before shading them
  o.pos.z = select(select((0.45 + 0.55 * o.seed.x) * (0.62 + 0.18 * o.seed.y) * 0.95, 0.97, framboid), 0.99, p.id == view.selId); // a selected grain sits on top
  o.uv = corner * STONE_QUAD;
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
    if (shell) { n = 6u + u32(grainHash(H, 3.0) * 2.99); jit = 0.7; spread = 0.5; stretch = 1.1 + 0.4 * grainHash(H, 1.0); }
    // keep its farthest corner inside the quad (a polygon's corners lie up to ~1.5 times its faces' reach)
    r0 = min(r0, 0.86 / (stretch * (1.0 + 0.5 * spread)));
    let w = vec2f(u.x / stretch, u.y);
    let P = grainPoly(w, H, n, r0, jit, spread, ty != 2u);
    sd = P.sd;
    if (sd >= aa) { discard; }
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
  // the background water temperature, then the heat map's span; w: the tide map (0 off, 1 on)
  heat: vec4f,
  // the pool (docs/catastrophes.md): water level, rain, sky, drying; currents' strength; a floating leaf; raindrops
  pond: vec4f,
  weather: vec4f,
  leaf: vec4f,
  leafB: vec4f,
  drops: array<vec4f, 4>,
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
@group(0) @binding(12) var liveTex: texture_2d<f32>;

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
fn pondSpecks(c: vec3f, hdr: vec3f, pos: vec2f, cells: f32) -> vec3f {
  if (!MICRO_SUSPENSION) { return c; }
  let start = max(80.0, 2.0 * max(post.res.x / post.world.x, post.res.y / post.world.y));
  if (post.ppu <= start) { return c; }
  let reveal = smoothstep(start, start * 2.0, post.ppu);
  let last = vec2i(textureDimensions(microTex)) - 1;
  let ip = min(vec2i(pos), last);
  let grains = textureLoad(microTex, ip, 0);
  let ax = textureLoad(microTex, min(ip + vec2i(1, 0), last), 0).a;
  let ay = textureLoad(microTex, min(ip + vec2i(0, 1), last), 0).a;
  // and behind the living (cells: their coverage here), which drift in the water among the specks
  // rather than under them
  let behind = reveal * (1.0 - cells) / (1.0 + 24.0 * max(hdr.r, max(hdr.g, hdr.b)));
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
// The pool's floor at world point p (docs/catastrophes.md), as the simulation reads it (pondAt): the water's depth
// (below 0 dry) and the floor's slope uphill.
fn gridPost(base: u32, x: i32, y: i32) -> f32 {
  let g = vec2i(post.world);
  return heatField[base + u32(((y % g.y) + g.y) % g.y) * u32(g.x) + u32(((x % g.x) + g.x) % g.x)];
}
// (bicubic, Catmull-Rom, with its slope: the edge drawn smooth; the simulation's bilinear edge lies within a
// fraction of a unit of it)
fn pondPost(p: vec2f) -> vec3f {
  let f = fieldPost(${3 * MAX_CELLS}u, p);
  var e = vec3f(post.pond.x - f.x, f.yz);
  let gl = length(f.yz);
  if (gl > 1e-5) { e.x += postEdgeSway(p, f.yz / gl) * gl; }
  return e;
}
// the water's edge pushed out or drawn back by the currents, as the simulation has it (edgeSway in simWGSL)
fn postEdgeSway(p: vec2f, n: vec2f) -> f32 {
  var v = postFlowAt(p, post.simTime) * post.weather.x;
  for (var k = 0u; k < 4u; k++) {
    let dr = post.drops[k];
    let age = post.simTime - dr.z;
    if (dr.w > 0.0 && age > 0.0 && age < ${f(DEFAULT_K.dropLife)}) {
      var d = p - dr.xy;
      d -= post.world * round(d / post.world);
      let r = length(d);
      let x = (r - age * ${f(DEFAULT_K.dropSpeed)}) / ${f(DEFAULT_K.dropWidth)};
      let fade = 1.0 - smoothstep(0.3, 0.45, r / min(post.world.x, post.world.y));
      v += d / max(r, 1e-3) * (dr.w * exp(-x * x) * (1.0 - age / ${f(DEFAULT_K.dropLife)}) * fade);
    }
  }
  let t = post.simTime;
  let push = clamp(dot(v, n) * ${f(DEFAULT_K.edgeSway)}, -0.9, 0.9);
  let wob = sin(dot(p, vec2f(0.83, 0.56)) * 0.9 + t * 0.7) * sin(dot(p, vec2f(-0.42, 0.91)) * 0.6 - t * 0.45)
    + 0.5 * sin(dot(p, vec2f(0.29, -0.96)) * 2.1 + t * 1.3);
  return push + ${f(DEFAULT_K.edgeWobble)} * wob;
}
// a field of the thermal buffer from base, bicubic at p, and its slope
fn fieldPost(base: u32, p: vec2f) -> vec3f {
  let u = p - 0.5;
  let i = vec2i(floor(u));
  let t = u - floor(u);
  let tx = t.x; let ty = t.y;
  let wx = vec4f(((-0.5 * tx + 1.0) * tx - 0.5) * tx, (1.5 * tx - 2.5) * tx * tx + 1.0, ((-1.5 * tx + 2.0) * tx + 0.5) * tx, (0.5 * tx - 0.5) * tx * tx);
  let dx = vec4f((-1.5 * tx + 2.0) * tx - 0.5, (4.5 * tx - 5.0) * tx, (-4.5 * tx + 4.0) * tx + 0.5, (1.5 * tx - 1.0) * tx);
  let wy = vec4f(((-0.5 * ty + 1.0) * ty - 0.5) * ty, (1.5 * ty - 2.5) * ty * ty + 1.0, ((-1.5 * ty + 2.0) * ty + 0.5) * ty, (0.5 * ty - 0.5) * ty * ty);
  let dy = vec4f((-1.5 * ty + 2.0) * ty - 0.5, (4.5 * ty - 5.0) * ty, (-4.5 * ty + 4.0) * ty + 0.5, (1.5 * ty - 1.0) * ty);
  var h = 0.0; var gx = 0.0; var gy = 0.0;
  for (var j = 0; j < 4; j++) {
    let row = vec4f(gridPost(base, i.x - 1, i.y + j - 1), gridPost(base, i.x, i.y + j - 1), gridPost(base, i.x + 1, i.y + j - 1), gridPost(base, i.x + 2, i.y + j - 1));
    let rv = dot(row, wx);
    h += wy[j] * rv; gx += wy[j] * dot(row, dx); gy += dy[j] * rv;
  }
  return vec3f(h, gx, gy);
}
// Value noise summed over three octaves, 0..1.
fn fbm3(p: vec2f) -> f32 {
  return (vnoise(p) * 0.5 + vnoise(p * 2.03 + 1.7) * 0.3 + vnoise(p * 4.07 + 3.1) * 0.2);
}
// A Voronoi tiling's cell point near lattice cell g.
fn vjit(g: vec2f) -> vec2f { return vec2f(hash12(g), hash12(g + 17.3)) * 0.8 + 0.1; }
// The distance from x to the nearest border of a Voronoi tiling (exact, so lines drawn by it keep their width), a
// hash naming the cell x lies in, and the offset from x to that cell's point.
fn vborder(x: vec2f) -> vec4f {
  let n = floor(x);
  let f = x - n;
  var mg = vec2f(0.0); var mr = vec2f(0.0); var md = 8.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2f(f32(i), f32(j));
      let r = g + vjit(n + g) - f;
      let d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  md = 8.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let g = mg + vec2f(f32(i), f32(j));
      let r = g + vjit(n + g) - f;
      if (dot(mr - r, mr - r) > 1e-5) { md = min(md, dot(0.5 * (mr + r), normalize(r - mr))); }
    }
  }
  return vec4f(md, hash12(n + mg + 0.37), mr);
}
// Grains on a jittered lattice (s per world unit), present in a share of its cells: each up to rmax lattice cells
// across, irregular; in darkfield a clear grain shows mostly by its rim. xyz: colour, w: coverage.
fn specks(wp: vec2f, s: f32, rmax: f32, ppu: f32, seed: f32, share: f32) -> vec4f {
  let p = wp * s + seed;
  let c = floor(p);
  let h = hash12(c + 3.3);
  if (hash12(c + 12.9) > share) { return vec4f(0.0); }
  let o = vec2f(hash12(c + 9.1), hash12(c + 5.7)) * 0.6 + 0.2;
  let r = rmax * (0.3 + 0.7 * hash12(c + 1.9));
  let aa = s / max(ppu, 1e-3);
  let dv = p - c - o;
  let an = atan2(dv.y, dv.x);
  let d = length(dv) * (1.0 + 0.1 * sin(2.0 * an + h * 40.0) + 0.08 * sin(3.0 * an + h * 17.0) + 0.05 * sin(5.0 * an + h * 7.0));
  let cov = 1.0 - smoothstep(r - aa, r + aa, d);
  let rim = exp(-pow((d - r * 0.85) / max(r * 0.14, aa), 2.0));
  // quartz and feldspar pale, iron-stained grains ochre, organic flecks dark
  let col = select(select(vec3f(1.0, 0.94, 0.84), vec3f(1.0, 0.72, 0.42), h > 0.6), vec3f(0.5, 0.42, 0.33), h > 0.88);
  return vec4f(col * (0.35 + 1.4 * pow(hash12(c + 7.7), 2.5)) * mix(1.0, 0.55 + 0.9 * rim, step(0.12, r) * step(h, 0.6)), cov);
}
// Diatoms' empty shells in the sediment: long boats of glass, their outline and central rib bright, fine ribs across
// them, here and there.
fn frustules(wp: vec2f, ppu: f32) -> f32 {
  let px = 1.0 / max(ppu, 1e-3);
  let sp = 11.0;
  let cell = floor(wp / sp);
  if (hash12(cell + 21.0) > 0.25) { return 0.0; }
  let ctr = (cell + vjit(cell + 23.0)) * sp;
  let L = 0.8 + 1.4 * hash12(cell + 25.0);
  let W = L * (0.13 + 0.09 * hash12(cell + 27.0));
  let q = rot2(wp - ctr, hash12(cell + 29.0) * 3.1416);
  let u = q.x / L; let w = q.y / W;
  // the valve's outline: pointed at both ends
  let half = sqrt(max(1.0 - u * u, 0.0)) * (0.8 + 0.2 * (1.0 - u * u));
  let e = (abs(w) - half) * W;
  let outline = exp(-pow(e / max(0.03, 0.9 * px), 2.0)) * step(abs(u), 1.0);
  let inside = step(abs(w), half) * step(abs(u), 1.0);
  let raphe = exp(-pow(q.y / max(0.02, 0.8 * px), 2.0)) * step(abs(u), 0.85) * step(0.07, abs(u));
  let striae = pow(0.5 + 0.5 * cos(q.x * 6.2832 / 0.12), 4.0) * smoothstep(0.08, 0.02, 0.12 * px * 6.0) * inside;
  return (outline + 0.5 * raphe + 0.2 * striae + 0.03 * inside) * smoothstep(3.0, 10.0, ppu);
}
// A raised line lit from one side, as oblique light shows relief: x its signed distance across the line, w its
// half-width, g the direction x grows in and L the light's. x: the lit flank's brightness, y: the far flank's shadow;
// lines finer than a pixel spread to one and dim as they do.
fn ridge(x: f32, w: f32, px: f32, g: vec2f, L: vec2f) -> vec2f {
  let we = max(w, 0.55 * px);
  let o = 0.6 * we * sign(dot(g, L) + 1e-4);
  let k = w / we;
  return vec2f(exp(-pow((x - o) / we, 2.0)), exp(-pow((x + o) / we, 2.0))) * k;
}
// Ice in darkfield (frost). Ice and water bend light almost alike, so the ice is faint; what shows is where it
// scatters, and the lamp's oblique light shows its relief. The ice is a crowd of small crystals, each its own
// orientation; each grows ahead as dendrites along whichever of its six axes points most nearly into the water, side
// branches leaving each stem at sixty degrees, bent and broken and uneven, longer the longer they have grown, so the
// front is a ragged edge of crystal tips, and that edge, where ice meets water, catches the light as a fine bright
// line. Behind it the spaces between the branches freeze, the filigree fades, and what is left is a mosaic of grains,
// each tilted a little so it catches the light differently, their boundaries grooved, with air the water could not
// hold trapped as bubbles. sd: world units from the ice's front (ice negative); n: the front's normal (toward the
// ice); grow: 1 while the ice grows, less as it stops and thaws.
fn iceLook(wp: vec2f, sd: f32, n: vec2f, ppu: f32, grow: f32) -> vec3f {
  let px = 1.0 / max(ppu, 1e-3);
  let L = normalize(vec2f(-0.55, -0.83));
  // the grain this point lies in, its boundaries ragged
  let gs = 4.2;
  let gq = wp / gs + (vec2f(vnoise(wp * 0.2), vnoise(wp * 0.2 + 4.1)) - 0.5) * 0.5 + (vec2f(vnoise(wp * 1.7), vnoise(wp * 1.7 + 2.3)) - 0.5) * 0.06;
  let vb = vborder(gq);
  let gid = vb.y;
  let edgeD = vb.x * gs;
  // the crystal's axes; the one nearest the growth direction (out of the ice)
  let th = gid * 1.0472;
  let ga = atan2(-n.y, -n.x);
  let kk = round((ga - th) / 1.0472);
  let aa = th + kk * 1.0472;
  let ax = vec2f(cos(aa), sin(aa));
  let pp = vec2f(-ax.y, ax.x);
  let ua = dot(wp, ax);
  let v = dot(wp, pp);
  // stems a unit or two apart, wandering, each reaching its own length ahead of the front (some crowded out)
  let F = 1.1 + 1.0 * hash12(vec2f(gid, 7.0));
  let fq = v / F + hash12(vec2f(gid, 8.0)) + 0.35 * (vnoise(vec2f(ua * 0.5, gid * 9.0)) - 0.5);
  let Fi = floor(fq);
  let fh = hash12(vec2f(Fi, gid * 5.0));
  let Lf = select(0.3 + 1.7 * pow(fh, 1.3), -0.5 - 1.5 * fh, fh < 0.15) * (0.4 + 0.6 * grow);
  let vS = (fract(fq) - 0.5) * F;
  let av = abs(vS);
  let side = select(0.0, 0.5, vS < 0.0);
  let dtS = -sd + Lf;
  // each tip rounded (a paraboloid, as a dendrite's is), its flanks roughened by the side branches' ends
  let prot = max(max(Lf, 0.0) - 3.5 * av * av / F, 0.0) + 0.06 * F * (vnoise(vec2f(ua * 3.0, v * 3.0)) - 0.5);
  let inIce = -sd + prot;
  let rough = 0.45 + 1.1 * vnoise(vec2f(ua * 2.3, Fi * 3.0 + gid));
  let wP = mix(0.01, 0.03, smoothstep(0.0, 2.0, dtS)) * rough;
  let sp = ridge(vS, wP, px, pp, L) * smoothstep(-0.02, 0.08, dtS);
  // secondaries: at sixty degrees, curving a little forward, uneven, some broken off
  let s2 = 0.17 + 0.09 * hash12(vec2f(gid, 5.0));
  let ua0 = ua - 0.577 * av - 0.25 * av * av;
  let bj = round(ua0 / s2);
  let bh = hash12(vec2f(bj, Fi * 7.0 + gid * 31.0 + side));
  let base = dtS + 0.577 * av + (ua0 - bj * s2);
  let blen = min(base * (0.4 + 0.5 * bh), 0.5 * F) * select(0.15 + 0.7 * bh, 1.0, bh > 0.65);
  let t = av * 1.1547;
  let broken = step(0.12, fract(bh * 13.7)) * (1.0 - step(0.55, fract(bh * 7.3)) * step(0.4 * blen, t) * step(t, 0.55 * blen));
  let wB = mix(0.006, 0.016, smoothstep(0.0, 1.5, base)) * (1.0 - 0.5 * t / max(blen, 1e-3)) * rough;
  let gB = (ax - (0.577 + 0.5 * av) * sign(vS) * pp) * 0.866;
  let sb = ridge((ua0 - bj * s2) * 0.866, wB, px, gB, L) * (1.0 - smoothstep(blen - 0.03, blen, t)) * step(0.0, base) * broken * (0.5 + 1.0 * bh);
  let blod = smoothstep(2.0, 5.0, s2 * ppu);
  let reach = (1.0 - smoothstep(0.6 * blen, blen + 0.05, t)) * step(0.0, base);
  let fineB = mix(vec2f(0.03 * reach, 0.0), sb, blod);
  // the dendrites scatter where water still lies between them; as it freezes they fade, and the ice clears
  let fresh = 1.0 - smoothstep(0.2, mix(1.0, 4.0, grow), inIce + 0.8 * (vnoise(wp * 0.5) - 0.5));
  let lit = (sp + fineB) * (0.05 + 0.95 * fresh);
  let tint = vec3f(0.2, 0.225, 0.26) * (0.6 + 0.8 * vnoise(wp * 0.7 + 3.0));
  var c = vec3f(0.0);
  // the ice: faint, but paler than the water; each grain tilted a little, catching more or less of the light
  let haze = smoothstep(-0.2, 0.3, inIce);
  let tilt = vec2f(hash12(vec2f(gid, 11.0)), hash12(vec2f(gid, 12.0))) - 0.5;
  let tone = clamp(1.0 + 3.0 * dot(tilt, L), 0.15, 2.6);
  c += vec3f(0.0045, 0.0053, 0.0068) * haze * (0.7 + 0.6 * fbm3(wp * 0.6)) * mix(tone, 1.4, fresh);
  // grain boundaries, grooved: the groove's wall facing the light bright, the other in shadow, a fine seam between
  let met = smoothstep(0.6, 2.5, -sd);
  let outw = -normalize(vb.zw + 1e-5);
  let face = dot(outw, L);
  let sw = max(0.03, 0.8 * px);
  let seam = exp(-pow(edgeD / sw, 2.0)) * min(1.0, 3.0 * 0.03 / sw + 0.5);
  let wall = exp(-pow(edgeD / max(0.18, 2.5 * px), 2.0));
  c += vec3f(0.06, 0.067, 0.078) * seam * met * (0.4 + 0.6 * vnoise(wp * 0.9));
  c += vec3f(0.03, 0.034, 0.04) * wall * met * max(face, 0.0);
  c *= 1.0 - 0.6 * wall * met * max(-face, 0.0);
  // the dendrites over it, in relief
  c = c * (1.0 - 0.55 * min(lit.y, 1.0)) + tint * lit.x;
  // the edge of the ice against the water, ragged with its tips: a fine bright line, water-dark just outside it
  let ew = max(0.035, 0.9 * px);
  let edge = exp(-pow((inIce - 0.5 * ew) / ew, 2.0));
  c += vec3f(0.1, 0.112, 0.13) * edge * (0.55 + 0.6 * vnoise(wp * 1.1 + 7.0)) * (0.5 + 0.5 * grow);
  // bubbles: air trapped in chains along the way the ice grew; a bright rim (light bent at the air's surface) around
  // a dark heart, and a glint on the side toward the light
  let cu = 0.7;
  let cv = 0.45;
  let bc = floor(vec2f(ua / cu, v / cv));
  let chain = hash12(vec2f(bc.y, gid * 3.0 + 1.0));
  if (chain < 0.25 && hash12(bc + gid) < 0.55 && -sd > 0.6) {
    let br = 0.025 + 0.05 * pow(hash12(bc + 9.0), 2.0);
    let el = 1.0 + 0.8 * hash12(bc + 2.0);
    let mu = 0.5 * cu - br * el - 0.02;
    let mv = 0.5 * cv - br - 0.02;
    let ctr = vec2f((bc.x + 0.5) * cu + (hash12(bc + 4.0) - 0.5) * 2.0 * mu, (bc.y + 0.5) * cv + (hash12(bc + 6.0) - 0.5) * 2.0 * mv);
    let q = vec2f((ua - ctr.x) / el, v - ctr.y);
    let bd = length(q);
    let rw = max(0.012, 0.7 * px);
    let rim = exp(-pow((bd - br * 0.9) / rw, 2.0)) * min(1.0, br / (2.0 * rw));
    let heart = 1.0 - smoothstep(br * 0.4, br, bd);
    let lq = vec2f(dot(L, ax), dot(L, pp));
    let glint = exp(-pow(length(q - lq * br * 0.45) / max(br * 0.25, rw), 2.0));
    c = c * (1.0 - 0.6 * heart) + vec3f(0.09, 0.10, 0.11) * rim * smoothstep(0.6, 2.0, -sd) + vec3f(0.08) * glint * step(0.04, br);
  }
  return c;
}
// Crystals in the cold water ahead of the ice: here and there a nucleus has frozen on its own and grows as a small
// six-armed star, its arms uneven, branched, larger the nearer the front has come. sd: world units ahead of it.
fn frazil(wp: vec2f, sd: f32, ppu: f32) -> vec3f {
  let px = 1.0 / max(ppu, 1e-3);
  let sp = 3.5;
  let cell = floor(wp / sp);
  if (hash12(cell + 0.5) > 0.3) { return vec3f(0.0); }
  let ctr = (cell + vjit(cell + 2.0)) * sp;
  let R = (0.25 + 0.75 * hash12(cell + 4.0)) * smoothstep(8.0, 1.0, sd) * smoothstep(0.0, 0.3, post.weather.z);
  let d = wp - ctr;
  let r = length(d);
  if (r > R + 0.15 || R < 0.05) { return vec3f(0.0); }
  let a = atan2(d.y, d.x) - hash12(cell + 6.0) * 1.0472;
  let k = round(a / 1.0472);
  let ar = (a - k * 1.0472);
  let s = r * cos(ar);
  let p = abs(r * sin(ar));
  let ah = hash12(cell + k + 11.0);
  let len = R * select(0.3 + 0.7 * ah, 0.15, ah < 0.15);
  let w = mix(0.025, 0.01, s / max(len, 1e-3)) + 0.6 * px;
  var arm = exp(-pow(p / w, 2.0)) * (1.0 - smoothstep(len - 0.03, len, s));
  let s0 = s - 0.577 * p;
  let sp2 = 0.15;
  let j = round(s0 / sp2);
  let bl = max(0.0, (len - j * sp2) * 0.4) * (0.2 + 0.8 * hash12(vec2f(j, k + cell.x * 3.0 + cell.y)));
  let br = exp(-pow((s0 - j * sp2) * 0.866 / (0.008 + 0.6 * px), 2.0)) * (1.0 - smoothstep(bl - 0.02, bl, p * 1.1547)) * step(0.2 * R, s0);
  arm = max(arm, br * 0.7);
  let hexd = r * cos(ar) / 0.866;
  let pedge = exp(-pow((hexd - 0.14 * R) / max(0.015, 0.7 * px), 2.0));
  return vec3f(0.035, 0.04, 0.047) * (arm + 0.5 * pedge) * smoothstep(1.0, 3.0, ppu * R);
}
// Dry ground in darkfield: the film of silt and clay the water left. Wet, water fills the spaces between its grains
// and it scatters little, dark and smooth with a gloss; as it dries air takes their place and it pales to a grainy
// buff glow, patchily, as the film drains unevenly. Drying, it shrinks and cracks into plates, first a coarse network
// and then, where it has dried longest, finer cracks parting the plates; the cracks are dark gaps (nothing in them
// scatters), each plate's broken rim bright and curling up from the floor. Where the water's edge paused as it fell it
// left tide lines of the finest matter it carried (a coffee ring), which the cracks cut across. away: world units
// onto dry ground; rel: the floor's height (quantile) and its slope.
fn dryGround(wp: vec2f, away: f32, rel: vec3f, ppu: f32) -> vec3f {
  let px = 1.0 / max(ppu, 1e-3);
  let dryness = smoothstep(0.3, 7.0, away + 4.0 * (fbm3(wp * 0.18) - 0.45));
  // patches richer in clay, in organic matter, in silt
  let mott = fbm3(wp * 0.07 + 3.0);
  let fine = vnoise(wp * 0.9);
  var c = mix(vec3f(0.010, 0.0085, 0.0062), vec3f(0.050, 0.041, 0.030), dryness) * (0.6 + 0.7 * mott) * (0.85 + 0.3 * fine);
  c *= mix(vec3f(1.0), vec3f(0.85, 0.95, 0.9), smoothstep(0.55, 0.8, mott) * (1.0 - dryness));
  // tide lines: the floor's contours where the edge paused, some faint, some strong, uneven along their length
  let tn = 40.0;
  let tl = rel.x * tn + 0.6 * (vnoise(wp * 0.15) - 0.5);
  let tf = fract(tl);
  let tdist = min(tf, 1.0 - tf) / max(tn * length(rel.yz), 1e-4);
  let th = hash12(vec2f(round(tl), 3.0));
  let tw = 0.04 + 0.12 * th;
  let tide = exp(-pow(tdist / max(tw, px), 2.0)) * step(0.8, th) * smoothstep(0.35, 0.7, vnoise(wp * 0.25 + th * 9.0)) * (0.5 + 0.5 * vnoise(wp * 1.5)) * smoothstep(0.5, 2.5, away);
  c += vec3f(0.05, 0.046, 0.039) * tide * (0.5 + dryness);
  // grains: silt and fine sand, each a point of light where it is resolved, a fine glitter where it is not
  let near = smoothstep(8.0, 30.0, ppu);
  let g1 = specks(wp, 2.4, 0.26, ppu, 0.0, 0.8);
  let g2 = specks(wp, 6.0, 0.3, ppu, 17.0, 0.9);
  let g3 = specks(wp, 0.8, 0.22, ppu, 41.0, 0.25);
  let gr = g1.xyz * g1.w * 0.06 + g2.xyz * g2.w * 0.04 * near + g3.xyz * g3.w * 0.09;
  c += gr * mix(0.3, 1.0, dryness);
  c += vec3f(0.07, 0.074, 0.07) * frustules(wp, ppu) * mix(0.4, 1.0, dryness);
  // the cracks: a coarse network, then finer cracks through the driest plates, their lines jagged
  let warp = (vec2f(fbm3(wp * 0.09), fbm3(wp * 0.09 + 5.2)) - 0.5) * 2.4 + (vec2f(vnoise(wp * 1.1), vnoise(wp * 1.1 + 2.7)) - 0.5) * 0.35
    + (vec2f(vnoise(wp * 3.7), vnoise(wp * 3.7 + 6.1)) - 0.5) * 0.1;
  let q = wp + warp;
  let s1 = 7.5;
  let v1 = vborder(q / s1);
  let e1 = v1.x * s1;
  let s2 = 2.8;
  let v2 = vborder((q + 31.7) / s2);
  let e2 = v2.x * s2;
  let open = smoothstep(1.5, 5.0, away + 3.0 * (fbm3(wp * 0.18) - 0.45));
  let w1 = open * (0.1 + 0.08 * vnoise(q * 0.3));
  let sub = smoothstep(0.4, 0.7, hash12(vec2f(v1.y, 4.0)) + 0.35 * dryness) * smoothstep(4.0, 9.0, away);
  let w2 = sub * (0.035 + 0.035 * vnoise(q * 0.6 + 4.0));
  let de = min(e1 - w1, select(1e3, e2 - w2, sub > 0.01));
  let gap = 1.0 - smoothstep(-px * 0.7, px * 0.7, de);
  // each plate curls up at its rim as it dries: brighter toward it, and its broken edge catches the light
  let curl = exp(-max(de, 0.0) / 0.45) * open;
  let lip = exp(-pow(max(de, 0.0) / max(0.035, 0.9 * px), 2.0)) * smoothstep(0.01, 0.05, max(w1, w2)) * open;
  var plate = c * (1.0 + 0.8 * curl) + vec3f(0.11, 0.096, 0.075) * lip * (0.5 + 0.7 * vnoise(wp * 3.0));
  // the plate's middle sags a little, and is a shade darker
  plate *= 1.0 - 0.15 * smoothstep(0.6, 2.5, de) * open;
  // in the gap: the bare floor below, dim, a few grains fallen into it
  let floorc = c * 0.2 + g2.xyz * g2.w * 0.015;
  return mix(plate, floorc, gap * open);
}
// The surface of the water, seen through. It lies above the focal plane, so its waves are never sharp in
// themselves; they show by bending what lies beneath (a slope displaces the view) and, above all, by focusing the
// lamp's light on the floor in caustics, as sunlight on a pool's bottom: where the surface curves like a lens the
// light gathers in bright lines, sharp where they cross the focal plane. A raindrop's impact sends out capillary
// waves, which disperse: the short ones run fastest, so a ring is a packet whose crests crowd toward its leading edge
// and broaden toward its centre, damped where they are shortest; it is uneven around its circle, and the drop's
// splash throws a few droplets which ring too. In rain the whole surface is roughened by drops falling out of view.
struct Surf { slope: vec2f, hess: vec3f };
// one ring: its slope and its curvature (xx, xy, yy)
fn ringWave(d: vec2f, t: f32, amp: f32, seed: f32, s: ptr<function, Surf>) {
  let r = length(d);
  let dir = d / max(r, 1e-4);
  let V = ${f(DEFAULT_K.dropSpeed)};
  let R = V * t;
  // the ring runs unevenly: the film's depth, currents and the splash itself distort it
  let rr = r * (1.0 + 0.07 * (vnoise(dir * 1.5 + seed) - 0.5)) + 0.5 * (vnoise(dir * 4.0 + seed * 1.7) - 0.5) * min(r / 6.0, 1.0)
    + 0.12 * (vnoise(d * 0.8 + seed) - 0.5);
  let psi = rr / max(R, 1e-3);
  if (psi > 1.4) { return; }
  let lf = 1.7;
  let ph = 6.2832 * psi * psi * rr / (3.0 * lf);
  let kk = 6.2832 * psi * psi / lf;
  let env = smoothstep(0.12, 0.6, psi) * exp(-pow(max(psi - 0.92, 0.0) / 0.13, 2.0)) * (0.15 + 1.6 * pow(vnoise(dir * 2.5 + seed + 3.0), 1.5))
    * amp / sqrt(1.0 + r * 0.25) * (1.0 - smoothstep(0.3, 0.45, r / min(post.world.x, post.world.y)));
  let S = 0.06 * env;
  let hr = -S * sin(ph);
  let hrr = -S * kk * cos(ph);
  let ht = hr / max(r, 0.5);
  (*s).slope += dir * hr;
  (*s).hess += vec3f(hrr * dir.x * dir.x + ht * dir.y * dir.y, (hrr - ht) * dir.x * dir.y, hrr * dir.y * dir.y + ht * dir.x * dir.x) * 0.5;
}
// the chop: wavelets from every direction, long and short, the short running faster (capillary waves), each
// adding its slope and curvature
fn chop(p: vec2f, rain: f32, s: ptr<function, Surf>) {
  for (var i = 0; i < 14; i++) {
    let fi = f32(i);
    let a = fi * 2.39996 + 0.4 + 0.5 * hash12(vec2f(fi, 1.0));
    let dir = vec2f(cos(a), sin(a));
    let lam = 2.0 + 4.0 * hash12(vec2f(fi, 2.0));
    let k = 6.2832 / lam;
    let th = k * dot(dir, p) - 3.0 * sqrt(k) * post.simTime + fi * 1.7;
    // in groups: each wavelet stronger here, weaker there, the groups drifting
    let g = vnoise(p * (0.06 + 0.05 * hash12(vec2f(fi, 3.0))) + vec2f(fi * 3.1, 0.0) - dir * post.simTime * 0.6);
    let A = 0.045 * rain / (k * k) * (0.2 + 1.6 * g * g);
    (*s).slope += dir * (A * k * cos(th));
    let hk = -A * k * k * sin(th);
    (*s).hess += vec3f(hk * dir.x * dir.x, hk * dir.x * dir.y, hk * dir.y * dir.y);
  }
}
fn ripples(wp: vec2f) -> Surf {
  var o: Surf;
  o.slope = vec2f(0.0); o.hess = vec3f(0.0);
  for (var k = 0u; k < 4u; k++) {
    let dr = post.drops[k];
    let age = post.simTime - dr.z;
    if (dr.w > 0.0 && age > 0.0 && age < ${f(DEFAULT_K.dropLife)}) {
      let fade = 1.0 - age / ${f(DEFAULT_K.dropLife)};
      for (var s = 0u; s < 3u; s++) {
        let hs = hash12(dr.xy + f32(s) * 7.13);
        var c = dr.xy;
        var t = age;
        var a = dr.w * fade;
        if (s > 0u) {
          let an = hs * 6.2832;
          c += vec2f(cos(an), sin(an)) * (1.5 + 5.0 * hash12(dr.xy + f32(s) * 3.7));
          t -= 0.2 + 0.7 * hs;
          a *= 0.2 + 0.3 * hash12(dr.xy + f32(s) * 1.3);
        }
        if (t > 0.0) {
          var d = wp - c;
          d -= post.world * round(d / post.world);
          ringWave(d, t, a, dr.x * 0.37 + f32(s) * 5.1, &o);
        }
      }
    }
  }
  // the rain falling out of view: a choppy surface everywhere
  if (post.pond.y > 0.0) { chop(wp, post.pond.y, &o); }
  return o;
}
// The light the floor receives under the surface s, as a share of the calm water's: the surface maps each point of
// it to a point of the floor a depth D below, and the light is concentrated by how much that map squeezes area;
// where the map folds over, it gathers in the bright lines of a caustic network.
const CAUSTIC_D = 6.0;
fn caustic(s: Surf) -> f32 {
  let D = CAUSTIC_D;
  let det = (1.0 + D * s.hess.x) * (1.0 + D * s.hess.z) - D * D * s.hess.y * s.hess.y;
  return min(1.0 / sqrt(det * det + 0.0025), 9.0);
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
  // rain: the rings raindrops send across the water bend the view as they pass
  var light = 1.0;
  if (post.pond.y > 0.0) {
    let rip = ripples(wp);
    uv += rip.slope * 1.2 * post.ppu / post.res;
    // the light reaching the floor here came through the surface a little upstream of the slope there
    light = caustic(ripples(wp - CAUSTIC_D * rip.slope));
  }
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
  // Cells lie over what is beneath them: where the living cover a pixel they show alone, not averaged
  // with the grains they sit on, and cells and grains both hide the stone under them.
  let all = textureSampleLevel(src, samp, uv, 0.0);
  let live = textureSampleLevel(liveTex, samp, uv, 0.0);
  var hdr = boulder(uv, wp, post.ppu) * (1.0 - min(1.0, all.a));
  if (k > 0.0) { hdr += lensScene(uv, q, wp, i.pos.xy, k); }
  else { hdr += mix(all.rgb / max(1.0, all.a), live.rgb / max(1.0, live.a), min(1.0, live.a)); }
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
  if (post.heat.w > 0.5) {
    // the tide map: the light here, as lifeMain gives it to producers (the Tide's bands by the season
    // over the baseline light), ink to violet to pale blue; outlines of the bands' shape at quarter
    // steps (at every season, so they still show at low tide); and, dashed, where they will be in
    // 20 s, so the way they drift shows. Over a full light map, the lines alone.
    let S = tideAt(wp, post.world, post.simTime, post.tide, post.tidePh);
    let G = clamp(post.ambient + (1.0 - post.ambient) * S * post.season, 0.0, 1.0);
    if (post.tideVis < 1.5) {
      let ramp = mix(mix(vec3f(0.03, 0.02, 0.10), vec3f(0.36, 0.20, 0.62), smoothstep(0.0, 0.45, G)), vec3f(0.72, 0.90, 1.0), smoothstep(0.4, 1.0, G));
      c = mix(c, ramp, mix(0.25, 0.45, smoothstep(0.0, 0.4, G)));
    }
    let band = S * 4.0;
    let w = fwidth(band);
    let line = 1.0 - smoothstep(0.0, w * 1.2, min(fract(band), 1.0 - fract(band)));
    c += vec3f(0.55, 0.62, 1.0) * (0.12 + 0.12 * post.season) * line * step(0.02, S) * step(S, 0.98);
    let F = tideAt(wp, post.world, post.simTime + 20.0, post.tide, post.tidePh) - 0.5;
    let ghost = 1.0 - smoothstep(0.0, fwidth(F) * 1.5, abs(F));
    let dash = step(0.5, fract(dot(i.pos.xy, vec2f(0.0707, 0.0707))));
    c += vec3f(0.72, 0.90, 1.0) * 0.4 * ghost * dash;
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
  c = pondSpecks(c, hdr, i.pos.xy, min(1.0, live.a));
  // the pool's edge and dry floor (docs/catastrophes.md), behind what lies on them; the water's edge itself, a
  // meniscus, is a bright thin line, and the thinning film just inside it a faint sheen
  if (post.pond.x < 1.0) {
    let pd = pondPost(wp);
    let sd = pd.x / max(length(pd.yz), 1e-4);
    // no water, no waves: the rain's caustics end at the edge
    light = mix(1.0, light, smoothstep(0.0, 0.4, sd));
    let px = 1.0 / post.ppu;
    let dry = 1.0 - smoothstep(-px, px, sd);
    if (dry > 0.0) { c += dryGround(wp, max(-sd, 0.0), vec3f(post.pond.x - pd.x, pd.yz), post.ppu) * dry * behind * mix(1.0, 0.8, k); }
    // the meniscus: a thin bright contact line, uneven along its length (it pins and slips on the grains), and on
    // the water's side the curved surface rising to it, scattering a narrowing glow
    let along = pow(0.25 + 0.75 * vnoise(wp * 0.9) + 0.3 * (vnoise(wp * 5.3 + 2.0) - 0.5), 2.0) * 1.3;
    let rim = exp(-pow(sd / (max(0.9 * px, 0.025) * (0.6 + 1.6 * vnoise(wp * 0.7 + 9.0))), 2.0)) * along
      + 0.15 * exp(-pow((sd - 0.12 - 0.25 * vnoise(wp * 0.5)) / max(0.9 * px, 0.03), 2.0)) * vnoise(wp * 1.9 + 4.0);
    let rise = select(0.0, exp(-sd / 0.22) * (1.0 - exp(-sd / max(1.5 * px, 0.02))), sd > 0.0);
    let sheen = select(0.0, exp(-sd / 0.9), sd > 0.0);
    c += (vec3f(0.16, 0.17, 0.18) * rim + vec3f(0.035, 0.040, 0.046) * rise * along + vec3f(0.006, 0.008, 0.010) * sheen) * (0.35 + 0.65 * behind);
  }
  // ice (frost): over what is frozen in it, its front a crisp bright line
  if (post.weather.y > 0.0) {
    let fi = fieldPost(${4 * MAX_CELLS}u, wp);
    let gl = max(length(fi.yz), 1e-4);
    let sdI = (fi.x - post.weather.y) / gl;
    let px = 1.0 / post.ppu;
    let grow = smoothstep(0.0, 0.3, post.weather.z);
    if (sdI < 2.6) { c += iceLook(wp, sdI, -fi.yz / gl, post.ppu, grow) * (0.35 + 0.65 * behind); }
    if (sdI > 0.0 && sdI < 9.0 && grow > 0.0) { c += frazil(wp, sdI, post.ppu) * (0.35 + 0.65 * behind); }
  }
  // raindrops' ripples: the light the surface gathers on the floor lights what lies there, and the floor itself
  c = c * mix(1.0, light, 0.5) + vec3f(0.005, 0.0056, 0.0064) * max(light - 1.5, 0.0) * (0.6 + 0.8 * vnoise(wp * 0.4));
  // a leaf floating on the pool, far above the focal plane: it keeps the lamp's light from what lies under it, and
  // scatters a little of it as a faint green-brown haze, its veins blurred shadows in it
  if (post.leaf.w > 0.0) {
    let sh = leafShade(wp, post.leaf, post.leafB, post.world);
    if (sh > 0.0) {
      var d = wp - post.leaf.xy;
      d -= post.world * round(d / post.world);
      let q = rot2(d, -post.leafB.x) / post.leaf.z;
      let L = post.leaf.z;
      let midrib = exp(-pow(q.y * L / 0.9, 2.0)) * (1.0 - smoothstep(0.6, 1.0, abs(q.x)));
      let ph = (q.x + abs(q.y) * 1.3 - 0.5 * q.y * q.y) * 7.0 + post.leafB.y + 0.35 * (vnoise(vec2f(q.y * 3.0, post.leafB.y)) - 0.5);
      let lateral = exp(-pow((fract(ph) - 0.5) / 0.12, 2.0)) * smoothstep(0.02, 0.12, abs(q.y)) * (1.0 - smoothstep(0.7, 1.0, abs(q.x)));
      let veins = clamp(midrib + 0.6 * lateral, 0.0, 1.0);
      let blot = 0.75 + 0.5 * vnoise(q * L * 0.35 + post.leafB.y);
      c = c * (1.0 - 0.88 * sh) + vec3f(0.010, 0.012, 0.0055) * sh * blot * (1.0 - 0.55 * veins) * mix(0.6, 1.0, k);
    }
  }
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
