import { roleShares, affinity, dietGuild, mobilityGuild, thermalGuild } from './genome.js';

export const DIET_COL = { photosynth: '#d9f27a', grazer: '#b9e6ff', scavenger: '#a87b5c', predator: '#ff5e7a', omnivore: '#c9b8ff' };
export const MOB_COL = { anchored: '#7fe0b0', crawler: '#ffb45e', swimmer: '#6e96ff', drifter: '#9aa3b8' };

// Species classification; keep diet/mobility thresholds aligned with engine and sim.
// These are the page's words for every species everywhere (tags, filters, census, log, captions):
// diet photosynth · grazer · scavenger · predator · omnivore; body multicellular · single-cell;
// movement anchored · crawler · swimmer · drifter (the headless metrics keep the guild's 'sessile').
export function facets(g, K) {
  const swim = g.swim * (1 - g.photo);
  const guild = dietGuild(g), diet = guild === 'producer' ? 'photosynth' : guild;
  const mob = mobilityGuild(g), mobility = mob === 'sessile' ? 'anchored' : mob;
  const multi = (g.adhesion || 0) > K.adhMin;
  const types = roleShares(g).filter((v) => v > 0.1).length;
  return { diet, mobility, body: multi ? 'multicellular' : 'single-cell', types, schooling: g.align > 0.5 && swim > 0.3 };
}

export function describe(g, K) {
  const f = facets(g, K);
  const parts = [f.diet];
  parts.push(`${f.body}${f.types > 1 ? `, ${f.types} cell types` : ''}`);
  parts.push(f.schooling ? `schooling ${f.mobility}` : f.mobility);
  return parts.join(' · ');
}

export function tagsOf(g, K) {
  const f = facets(g, K);
  const tags = [[f.diet, f.diet === 'omnivore' ? 'diet' : f.diet]];
  const multi = f.body === 'multicellular';
  tags.push([f.body, multi ? 'adhesion' : 'singlecelled']);
  if (f.types > 1) tags.push([`${f.types} cell types`, multi ? 'bodyplan' : 'morphs']);
  const sh = roleShares(g);
  let self = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) self += sh[a] * sh[b] * affinity(g, a, g, b, K);
  if (multi) tags.push(self > 0.3 ? ['compact body', 'colonial'] : self < -0.1 ? ['stringy body', 'solitary'] : ['loose body', 'looseknit']);
  else tags.push(self > 0.3 ? ['swarming', 'colonial'] : self < -0.1 ? ['solitary', 'solitary'] : ['loose-knit', 'looseknit']);
  tags.push([f.mobility, { anchored: 'anchored', drifter: 'drifting', swimmer: 'swimming', crawler: 'thrust' }[f.mobility]]);
  if (f.schooling) tags.push(['schooling', 'schooling']);
  if (g.photo > 0.25 && g.photo <= 0.55) tags.push(['part photosynth', 'photosynth']);
  if (g.lifespan > 300) tags.push(['long-lived', 'lifespan']);
  if (g.mutRate > 0.035) tags.push(['fast-mutating', 'mutation']);
  if (K.heat && g.topt != null) {
    const t = thermalGuild(g);
    if (t.pref !== 'temperate') tags.push([t.pref, 'optimum']);
    if (t.breadth === 'specialist') tags.push(['thermal specialist', 'tolerance']);
    if (t.maker) tags.push(['heat-maker', 'heatmaker']);
  }
  return tags;
}
