// Names for species and genera, read from the genome alone (docs/naming.md): the same genome is given the same
// name in every world, on every device. A genus is a body plan (diet, movement, body form, cell types, cell
// shape), so species alike in body share a genus wherever they arise; a species' epithet is a hash of every gene
// it carries, exactly, so it changes with any mutation. Nothing here reads a serial, a parent, the clock, the
// tunables or the world: only the genome's packed words, as the GPU holds them.
import { G_WORDS } from './shaders.js';
import { writeGenome, readGenome, dietGuild, mobilityGuild, roleShares, growPlan, hasTails } from './genome.js';

export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ONSET = ['v', 'th', 'k', 'z', 'qu', 'r', 'm', 's', 'n', 'x', 'ph', 'dr', 'gh', 'l', 'y', 'sk', 'tr', 'h', 'b', 'c', 'vr', 'ch'];
const NUC = ['a', 'o', 'e', 'i', 'u', 'ae', 'ou', 'y', 'ia', 'eo', 'a', 'o'];
const CODA = ['', '', 'n', 'r', 'th', 'x', 's', 'l', 'm', 'k', 'sh', 'rn'];
const SUFFIX = ['a', 'is', 'ae', 'um', 'ex', 'ine', 'oth', 'ula', 'ix', 'ora', 'yx', 'ens'];
const pick = (r, a) => a[Math.floor(r() * a.length)];
export function word(r, n) {
  let w = '';
  for (let i = 0; i < n; i++) {
    w += pick(r, ONSET) + pick(r, NUC) + (i === n - 1 ? pick(r, CODA) : '');
  }
  return w;
}
export const cap = (s) => s[0].toUpperCase() + s.slice(1);

// The genome's words that are genes (writeGenome's layout): the packed signatures, development and growth (0-15),
// the traits (16-38) but metab (20, worked out from the others), and adhesion to phototaxis (44-54). Left out:
// metab, the colour (39, from hue, sat and lum), parent, serial, birth time and depth (40-43), padding (55).
const PACKED = 16;
const GENES = [];
for (let i = 0; i < 55; i++) if (i !== 20 && (i < 39 || i > 43)) GENES.push(i);
const scratch = new ArrayBuffer(G_WORDS * 4), U = new Uint32Array(scratch), F = new Float32Array(scratch);

/** g as the GPU holds it: written to its words (floats to f32, signatures and growth genes to 8 bits) and read back. */
function canon(g) {
  U.fill(0);
  writeGenome(U, F, 0, g);
  for (const i of GENES) if (i >= PACKED && U[i] === 0x80000000) U[i] = 0; // -0 is 0
  return readGenome(U, F, 0);
}

const mix32 = (h) => {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
/** Two independent 32-bit hashes of the genes in U (murmur3's mixing, two lanes). */
function geneHash() {
  let a = 0x2545f491, b = 0x9e3779b9;
  for (const i of GENES) {
    let k = Math.imul(U[i], 0xcc9e2d51);
    k = Math.imul((k << 15) | (k >>> 17), 0x1b873593);
    a ^= k; a = (Math.imul((a << 13) | (a >>> 19), 5) + 0xe6546b64) | 0;
    b ^= Math.imul(k, 0x27d4eb2f); b = (Math.imul((b << 17) | (b >>> 15), 9) + 0x165667b1) | 0;
  }
  return [mix32(a ^ GENES.length), mix32(b ^ (GENES.length * 3))];
}

// The body plan's thresholds, pinned here rather than read from the run's tunables, so a world played with
// other #k settings names its species as every other world does (adhMin as DEFAULT_K's in Nov 2026).
const PLAN_K = Object.freeze({ adhMin: 0.15 });
export const DIETS = ['producer', 'grazer', 'scavenger', 'predator'];
export const MOBILITIES = ['sessile', 'crawler', 'swimmer', 'drifter'];
export const FORMS = ['single', 'packed', 'tailed', 'filament', 'branching'];
const SHAPES = 12;
export const PLANS = DIETS.length * MOBILITIES.length * FORMS.length * 3 * SHAPES;

/** The body plan of a canonical genome c: diet, movement, body form, cell types (1-3), cell shape gene, and a key. */
function planOf(c) {
  const diet = DIETS.indexOf(dietGuild(c)), mobility = MOBILITIES.indexOf(mobilityGuild(c));
  let form = 0;
  if (c.adhesion > PLAN_K.adhMin) {
    const tree = growPlan(c, PLAN_K);
    form = tree ? (tree.every && tree.depth ? 4 : 3) : hasTails(c, PLAN_K) ? 2 : 1;
  }
  const types = Math.max(1, roleShares(c).filter((v) => v > 0.1).length);
  const shape = Math.min(SHAPES - 1, Math.max(0, Math.floor(c.shape) || 0));
  const key = (((diet * MOBILITIES.length + mobility) * FORMS.length + form) * 3 + types - 1) * SHAPES + shape;
  return { diet: DIETS[diet], mobility: MOBILITIES[mobility], form: FORMS[form], types, shape, key };
}
/** The body plan of genome g (planOf on its canonical form). */
export const bodyPlan = (g) => planOf(canon(g));

// Every body plan's genus name, made once: plan k draws names from its own seed until one no lower plan holds,
// so no two plans share a name and the table is the same everywhere.
let GENERA = null;
export function genusOfPlan(key) {
  if (!GENERA) {
    GENERA = new Array(PLANS);
    const used = new Set();
    for (let k = 0; k < PLANS; k++) {
      const r = prng(mix32(Math.imul(k + 1, 2654435761) ^ 0x51ed));
      let name;
      do name = cap(word(r, r() < 0.6 ? 2 : 3)); while (used.has(name));
      used.add(name);
      GENERA[k] = name;
    }
  }
  return GENERA[key];
}

/**
 * The name genome g is given, the same in every world: { genus, epithet, plan, hash } (hash: the genes' 64-bit
 * hash as 16 hex digits, which tells apart two genomes whose names happen to meet).
 */
export function speciesName(g) {
  const c = canon(g);
  const plan = planOf(c);
  const [h1, h2] = geneHash();
  const r = prng(h1);
  // mostly two syllables: half of them one, as once, gave too few epithets (two genomes of a genus met on one
  // in about 90,000 pairs, so a long world kept a clash or two; this way one in about a million)
  const x = r();
  const epithet = word(r, x < 0.1 ? 1 : x < 0.85 ? 2 : 3) + pick(r, SUFFIX);
  const hash = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  return { genus: genusOfPlan(plan.key), epithet, plan, hash };
}

/** n in Roman numerals (two genomes whose names meet in one world: the later one is "Vela nyx II"). */
export function roman(n) {
  let s = '';
  for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += r; n -= v; }
  return s;
}
