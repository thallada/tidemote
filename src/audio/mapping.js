// Genome → voice. Everything a species sounds like is read from its genome, so a mutant
// plays a variation of its parent: the melody is a walk whose steps are the α surface
// signature, so a nudged gene shifts a step and the rest of the motif follows.

import { dietGuild, mobilityGuild } from '../genome.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fract = (x) => x - Math.floor(x);
const pick = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(clamp(u, 0, 0.9999) * arr.length))];

// archetype → instruments and register (from the SuperCollider soundtrack)
export const ARCH = {
  reef:      { mats: ['glass', 'glass', 'swell'], oct: 1 },
  plankton:  { mats: ['swell', 'swell', 'glass'], oct: 2 },
  filament:  { mats: ['breath'], oct: 1 },
  grazer:    { mats: ['cplx', 'cplx', 'tine'], oct: 1 },
  crawler:   { mats: ['tine', 'cplx'], oct: 1 },
  hunter:    { mats: ['bite', 'wood', 'wood'], oct: 0 },
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

// A melodic walk in scale degrees from a signature: start from rec, step by surf.
export function walk(surf, rec, len) {
  let d = clamp(Math.round((rec[0] + 1) * 2.5), 0, 5);
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(d);
    const s = surf[i % 8];
    d = clamp(d + Math.round(s * 2.4) + (Math.abs(s) > 0.92 ? Math.sign(s) * 2 : 0), -3, 10);
  }
  return out;
}

const CHORDS = [[0, 2, 4], [0, 4, 7], [0, 2, 7], [0, 4, 9]];

export function voiceOf(g) {
  const arch = archOf(g);
  const A = ARCH[arch];
  const a = g.roles[0], b = g.roles[1];
  const len = 3 + Math.round(((a.rec[1] + 1) / 2) * 5);
  const span = clamp((g.lifespan - 60) / 400, 0, 1);
  let rate;
  switch (arch) {
    case 'grazer': rate = g.swim >= 1.1 ? 1 : g.swim >= 0.8 ? 1.5 : 2; break;
    case 'crawler': rate = g.swim >= 0.8 ? 1.5 : g.swim >= 0.5 ? 2 : 3; break;
    case 'hunter': rate = g.force > 11 ? 3 : g.force > 9.5 ? 4 : 6; break;
    case 'reef': rate = g.lifespan > 360 ? 12 : 8; break;
    case 'plankton': rate = g.swim > 0.1 ? 4 : 6; break;
    case 'filament': rate = (g.adhesion || 0) > 0.5 ? 8 : 6; break;
    default: rate = 1;
  }
  return {
    arch,
    seq: arch === 'reef' ? pick(CHORDS, (a.rec[2] + 1) / 2) : walk(a.surf, a.rec, len),
    seq2: walk(b.surf, b.rec, len), // the β cell type's line (crawlers alternate the two)
    rate,
    oct: A.oct + (arch === 'grazer' && g.size < 0.85 ? 1 : 0),
    mat: pick(A.mats, g.hue),
    ratio: pick([1, 1.5, 2, 2, 3], fract(g.hue * 7.3)),
    index: 0.4 + 1.6 * clamp((g.sat - 0.6) / 0.4, 0, 1),
    fold: 0.9 + 1.7 * clamp((g.lum - 0.52) / 0.2, 0, 1),
    dec: 0.8 + 0.5 * span,
    bright: 0.3 + 0.6 * clamp((g.sat - 0.6) / 0.4, 0, 1),
  };
}
