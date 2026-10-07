// Genome → voice. Everything a species sounds like is read from its genome, so a mutant
// plays a variation of its parent: the archetype picks the instrument family and register, the
// colour the instrument and its timbre, and motif.js the song itself.

import { dietGuild, mobilityGuild } from '../genome.js';
import { motifOf } from './motif.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fract = (x) => x - Math.floor(x);
const pick = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(clamp(u, 0, 0.9999) * arr.length))];

// archetype → instruments and register (from the SuperCollider soundtrack)
export const ARCH = {
  reef:      { mats: ['glass', 'glass', 'swell'], oct: 1 },
  plankton:  { mats: ['swell', 'swell', 'glass'], oct: 2 },
  filament:  { mats: ['breath'], oct: 1 },
  grazer:    { mats: ['cplx', 'cplx', 'tine', 'pluck'], oct: 1 },
  crawler:   { mats: ['tine', 'cplx', 'pluck'], oct: 1 },
  hunter:    { mats: ['bite', 'wood', 'pluck', 'pluck'], oct: 0 },
  scavenger: { mats: ['drop', 'drop', 'tick'], oct: 2 },
};

// Which of the seven musical archetypes a genome plays as.
export function archOf(g) {
  const bonded = (g.adhesion || 0) > 0.15;
  let guild = dietGuild(g);
  // musically, how a cell lives matters more than its strict diet: a cell that photosynthesises
  // substantially and does not actively swim plays as a producer (mixotrophs included)
  if (guild !== 'producer' && g.photo > 0.4 && mobilityGuild(g) !== 'swimmer') guild = 'producer';
  if (guild === 'omnivore') {
    const m = Math.max(g.dGlint, g.dHusk, g.dFlesh);
    guild = m === g.dFlesh ? 'predator' : m === g.dHusk ? 'scavenger' : 'grazer';
  }
  if (guild === 'producer') {
    if (!bonded) return 'plankton';
    return g.advect < 0.5 && mobilityGuild(g) === 'sessile' ? 'reef' : 'filament';
  }
  if (guild === 'predator') return bonded ? 'crawler' : 'hunter';
  if (guild === 'scavenger') return 'scavenger';
  return 'grazer';
}

export function voiceOf(g) {
  const arch = archOf(g);
  const A = ARCH[arch];
  const span = clamp((g.lifespan - 60) / 400, 0, 1);
  const motif = motifOf(g, arch);
  return {
    arch, motif,
    seq: motif.seq, // the line's degrees (the score develops these)
    rate: motif.rate, // steps a note lasts on average
    oct: A.oct + (arch === 'grazer' && g.size < 0.85 ? 1 : 0),
    mat: pick(A.mats, g.hue),
    ratio: pick([1, 1.5, 2, 2, 3], fract(g.hue * 7.3)),
    index: 0.4 + 1.6 * clamp((g.sat - 0.6) / 0.4, 0, 1),
    fold: 0.9 + 1.7 * clamp((g.lum - 0.52) / 0.2, 0, 1),
    dec: 0.8 + 0.5 * span,
    bright: 0.3 + 0.6 * clamp((g.sat - 0.6) / 0.4, 0, 1),
  };
}
