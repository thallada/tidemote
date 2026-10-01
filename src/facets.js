import { roleShares, affinity, dietGuild, mobilityGuild } from './genome.js';

export const DIET_COL = { photosynth: '#d9f27a', grazer: '#b9e6ff', scavenger: '#a87b5c', predator: '#ff5e7a', omnivore: '#c9b8ff' };
export const MOB_COL = { sessile: '#7fe0b0', crawler: '#ffb45e', swimmer: '#6e96ff', drifter: '#9aa3b8' };

// Species classification; keep diet/mobility thresholds aligned with engine and sim.
export function facets(g, K) {
  const swim = g.swim * (1 - g.photo);
  const guild = dietGuild(g), diet = guild === 'producer' ? 'photosynth' : guild;
  const mobility = mobilityGuild(g);
  const multi = (g.adhesion || 0) > K.adhMin;
  const types = roleShares(g).filter((v) => v > 0.1).length;
  return { diet, mobility, body: multi ? 'multicellular' : 'single-celled', types, schooling: g.align > 0.5 && swim > 0.3 };
}

export function describe(g, K) {
  const f = facets(g, K);
  const parts = [f.diet];
  parts.push(f.body === 'multicellular' ? `${f.types > 1 ? `${f.types}-type ` : ''}bodies` : `free cells${f.types > 1 ? ` in ${f.types} morphs` : ''}`);
  parts.push(f.schooling ? `schooling ${f.mobility}` : f.mobility);
  return parts.join(' · ');
}

export function tagsOf(g, K) {
  const f = facets(g, K);
  const tags = [[f.diet, f.diet === 'omnivore' ? 'diet' : f.diet]];
  const multi = f.body === 'multicellular';
  tags.push([multi ? 'multicellular' : 'free-living cells', multi ? 'adhesion' : 'organism']);
  if (f.types > 1) tags.push(multi ? [`${f.types} cell types`, 'bodyplan'] : [`${f.types} morphs`, 'morphs']);
  const sh = roleShares(g);
  let self = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) self += sh[a] * sh[b] * affinity(g, a, g, b, K);
  if (multi) tags.push(self > 0.3 ? ['compact body', 'colonial'] : self < -0.1 ? ['strung-out body', 'solitary'] : ['loose body', 'looseknit']);
  else tags.push(self > 0.3 ? ['swarming', 'colonial'] : self < -0.1 ? ['solitary', 'solitary'] : ['loosely social', 'looseknit']);
  tags.push([f.mobility, { sessile: 'sessile', drifter: 'drifting', swimmer: 'swimming', crawler: 'thrust' }[f.mobility]]);
  if (f.schooling) tags.push(['schooling', 'schooling']);
  if (g.photo > 0.25 && g.photo <= 0.55) tags.push(['part photosynth', 'photosynth']);
  if (g.lifespan > 300) tags.push(['long-lived', 'lifespan']);
  if (g.mutRate > 0.035) tags.push(['volatile genome', 'mutation']);
  return tags;
}
