import { roleShares, affinity, dietGuild, mobilityGuild, thermalGuild } from './genome.js';
import { tr } from './i18n.js';

export const DIET_COL = { photosynth: '#d9f27a', grazer: '#b9e6ff', scavenger: '#a87b5c', predator: '#ff5e7a' };
export const MOB_COL = { anchored: '#7fe0b0', crawler: '#ffb45e', swimmer: '#6e96ff', drifter: '#9aa3b8' };

// Species classification; keep diet/mobility thresholds aligned with engine and sim.
// These are the page's words for every species everywhere (tags, filters, census, log, captions):
// diet photosynth · grazer · scavenger · predator; body multicellular · single-cell;
// movement anchored · crawler · swimmer · drifter (the headless metrics keep the guild's 'sessile').
// i18n: a species' facets as the page names them, lower case: its diet, movement, body and preferred temperature
// (the Lab's species list and census, the specimen panel's tags, the log's lines)
export const FACET_NAME = {
  photosynth: tr('facet.photosynth', 'photosynth'), grazer: tr('facet.grazer', 'grazer'), scavenger: tr('facet.scavenger', 'scavenger'), predator: tr('facet.predator', 'predator'),
  anchored: tr('facet.anchored', 'anchored'), crawler: tr('facet.crawler', 'crawler'), swimmer: tr('facet.swimmer', 'swimmer'), drifter: tr('facet.drifter', 'drifter'),
  multicellular: tr('facet.multicellular', 'multicellular'), 'single-cell': tr('facet.single-cell', 'single-cell'),
  'cold-loving': tr('facet.cold-loving', 'cold-loving'), temperate: tr('facet.temperate', 'temperate'), 'warmth-loving': tr('facet.warmth-loving', 'warmth-loving'), thermophile: tr('facet.thermophile', 'thermophile'),
};

export function facets(g, K) {
  const swim = g.swim * (1 - g.photo);
  const guild = dietGuild(g), diet = guild === 'producer' ? 'photosynth' : guild;
  const mob = mobilityGuild(g), mobility = mob === 'sessile' ? 'anchored' : mob;
  const multi = (g.adhesion || 0) > K.adhMin;
  const types = roleShares(g).filter((v) => v > 0.1).length;
  return { diet, mobility, body: multi ? 'multicellular' : 'single-cell', types, schooling: g.align > 0.5 && swim > 0.3 };
}

/** What it lives on, as shares that sum to one: [[diet, share]] for each of photosynth (the light), grazer (glint),
 * scavenger (husks) and predator (flesh), the eating part split by its tastes. */
export function dietMix(g) {
  const eat = 1 - g.photo, dw = (g.dGlint || 0) + (g.dHusk || 0) + (g.dFlesh || 0) || 1;
  return [['photosynth', g.photo], ['grazer', (eat * (g.dGlint || 0)) / dw], ['scavenger', (eat * (g.dHusk || 0)) / dw], ['predator', (eat * (g.dFlesh || 0)) / dw]];
}

export function describe(g, K) {
  const f = facets(g, K), N = FACET_NAME;
  // i18n: a species in brief (the log's lines on a new species or genus): its diet ({diet}: predator), its body
  // ({body}: multicellular, with {types} cell types when it has more than one) and how it moves ({mobility}: swimmer)
  return tr('facet.describe', '{diet} · {body}{types, plural, =0 {} =1 {} other {, # cell types}} · {schooling, select, yes {schooling {mobility}} other {{mobility}}}',
    { diet: N[f.diet], body: N[f.body], types: f.types, schooling: f.schooling ? 'yes' : 'no', mobility: N[f.mobility] });
}

export function tagsOf(g, K) {
  const f = facets(g, K);
  const N = FACET_NAME;
  // i18n: the specimen panel's tags for a species: short words, lower case, each showing a glossary hint
  const tags = [[N[f.diet], f.diet]];
  const multi = f.body === 'multicellular';
  tags.push([N[f.body], multi ? 'adhesion' : 'singlecelled']);
  if (f.types > 1) tags.push([tr('facet.tag.types', '{n, plural, one {# cell type} other {# cell types}}', { n: f.types }), multi ? 'bodyplan' : 'morphs']);
  const sh = roleShares(g);
  let self = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) self += sh[a] * sh[b] * affinity(g, a, g, b, K);
  if (multi) tags.push(self > 0.3 ? [tr('facet.tag.compact', 'compact body'), 'colonial'] : self < -0.1 ? [tr('facet.tag.stringy', 'stringy body'), 'solitary'] : [tr('facet.tag.loose-body', 'loose body'), 'looseknit']);
  else tags.push(self > 0.3 ? [tr('facet.tag.swarming', 'swarming'), 'colonial'] : self < -0.1 ? [tr('facet.tag.solitary', 'solitary'), 'solitary'] : [tr('facet.tag.loose-knit', 'loose-knit'), 'looseknit']);
  tags.push([N[f.mobility], { anchored: 'anchored', drifter: 'drifting', swimmer: 'swimming', crawler: 'crawler' }[f.mobility]]);
  if (f.schooling) tags.push([tr('facet.tag.schooling', 'schooling'), 'schooling']);
  if (g.photo > 0.25 && g.photo <= 0.55) tags.push([tr('facet.tag.part-photosynth', 'part photosynth'), 'photosynth']);
  if (g.lifespan > 300) tags.push([tr('facet.tag.long-lived', 'long-lived'), 'lifespan']);
  if (g.mutRate > 0.035) tags.push([tr('facet.tag.fast-mutating', 'fast-mutating'), 'mutation']);
  if (K.heat && g.topt != null) {
    const t = thermalGuild(g);
    if (t.pref !== 'temperate') tags.push([N[t.pref], 'optimum']);
    if (t.breadth === 'specialist') tags.push([tr('facet.tag.specialist', 'thermal specialist'), 'tolerance']);
    if (t.maker) tags.push([tr('facet.tag.heat-maker', 'heat-maker'), 'heatmaker']);
  }
  return tags;
}
