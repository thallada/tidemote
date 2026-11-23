// Steam achievements (docs/desktop.md, Achievements). Their ids are the API names set up in Steamworks, which shows the
// names and descriptions given here (Steamworks keeps its own copies, in each language it offers, for the Steam overlay;
// the page does not show these). Pure: the page asks the desktop shell to unlock what this returns.
//
// Three tiers, set by what worlds do (measured with tools/achievelab.mjs over many worlds):
// - core: what most viewers meet by watching one world for a few hours, spread out so that none comes in a world's first
//   minutes but the chronicler's first story and the rest arrive one at a time over hours;
// - rare: what few worlds come to, or only a world left running for a day: most about one in a hundred, though life all
//   but failing (and returning) comes to a quarter or more of worlds within eight hours;
// - viewer: the viewer's own doing (a name, a card, a film, a ride, a stranger carried, a world shared).
//
// An achievement comes from a story the chronicler tells (`story`, given the story: { kind, key, moment, and where its
// kind has them low, span }), or from the world's numbers as the page sees them each census (`world`, given
// worldFacts below). A story that would earn an achievement not yet earned is told soon after what it tells of
// (chronicler.js, T.worthy), so the achievement and its story come together.

import { tr } from './i18n.js';

const H = 3600;

export const ACHIEVEMENTS = [
  // ---- core
  { id: 'FIRST_STORY', tier: 'core', name: tr('ach.first-story.name', 'Once Upon a Tide'), desc: tr('ach.first-story.desc', 'Read the chronicler’s first story of a world.'), story: () => true },
  { id: 'CYCLE', tier: 'core', name: tr('ach.cycle.name', 'Boom and Bust'), desc: tr('ach.cycle.desc', 'Witness hunter and hunted rise and fall in turn.'), story: (s) => s.kind === 'cycle' },
  { id: 'DROUGHT', tier: 'core', name: tr('ach.drought.name', 'Dry Spell'), desc: tr('ach.drought.desc', 'See a world through a drought.'), world: (w) => w.weathered.drought > 0 },
  { id: 'STORM', tier: 'core', name: tr('ach.storm.name', 'Weathered the Storm'), desc: tr('ach.storm.desc', 'See a world through a storm.'), world: (w) => w.weathered.storm > 0 },
  { id: 'FROST', tier: 'core', name: tr('ach.frost.name', 'The Thaw'), desc: tr('ach.frost.desc', 'See a world through a frost.'), world: (w) => w.weathered.frost > 0 },
  { id: 'DUCKWEED', tier: 'core', name: tr('ach.duckweed.name', 'Green Ceiling'), desc: tr('ach.duckweed.desc', 'See a world through a duckweed bloom.'), world: (w) => w.weathered.duckweed > 0 },
  { id: 'RADIATION', tier: 'core', name: tr('ach.radiation.name', 'Adaptive Radiation'), desc: tr('ach.radiation.desc', 'Witness a genus burst into many species.'), story: (s) => s.kind === 'radiation' },
  { id: 'COMEBACK', tier: 'core', name: tr('ach.comeback.name', 'Lazarus'), desc: tr('ach.comeback.desc', 'Witness a species come back after falling to ten cells or fewer.'), story: (s) => s.kind === 'comeback' && s.low <= 10 },
  { id: 'ARMS_RACE', tier: 'core', name: tr('ach.arms-race.name', 'Red Queen'), desc: tr('ach.arms-race.desc', 'Witness an arms race between hunter and prey.'), story: (s) => s.kind === 'arms' },
  { id: 'MASS_EXTINCTION', tier: 'core', name: tr('ach.mass-extinction.name', 'Extinction Event'), desc: tr('ach.mass-extinction.desc', 'Witness a wave of extinctions.'), story: (s) => s.kind === 'mass' },
  { id: 'REIGN', tier: 'core', name: tr('ach.reign.name', 'Long Live the King'), desc: tr('ach.reign.desc', 'Witness the end of a reign that lasted half an hour or more.'), story: (s) => s.kind === 'reign' && s.span >= H / 2 },
  { id: 'GUILD_LOST', tier: 'core', name: tr('ach.guild-lost.name', 'The Last of Its Kind'), desc: tr('ach.guild-lost.desc', 'Witness the last of a guild perish.'), story: (s) => s.kind === 'guild' && s.moment !== 'back' },
  { id: 'STORIES_50', tier: 'core', name: tr('ach.stories-50.name', 'Natural Historian'), desc: tr('ach.stories-50.desc', 'Read fifty of the chronicler’s stories.'), stories: 50 },
  { id: 'DAY', tier: 'core', name: tr('ach.day.name', 'A Day in the Life'), desc: tr('ach.day.desc', 'Keep one world going for a simulated day.'), world: (w) => w.t >= 24 * H },

  // ---- rare
  { id: 'COLLAPSE', tier: 'rare', name: tr('ach.collapse.name', 'Near Silence'), desc: tr('ach.collapse.desc', 'Witness life all but fail.'), story: (s) => s.kind === 'collapse' && s.moment !== 'back' },
  { id: 'RETURN', tier: 'rare', name: tr('ach.return.name', 'Life Finds a Way'), desc: tr('ach.return.desc', 'Witness life return after it all but failed.'), story: (s) => s.kind === 'collapse' && s.moment === 'back' },
  { id: 'LAST_FEW', tier: 'rare', name: tr('ach.last-few.name', 'The Last Few'), desc: tr('ach.last-few.desc', 'Witness life dwindle to a last few cells, one in five thousand of its height.'), world: (w) => w.lowest <= 1 / 5000 },
  { id: 'SIGNAL', tier: 'rare', name: tr('ach.signal.name', 'First Contact'), desc: tr('ach.signal.desc', 'Witness a species that seems to be trying to communicate take hold in the pool.'), world: (w) => w.signal > 0 },
  { id: 'MONOCULTURE', tier: 'rare', name: tr('ach.monoculture.name', 'Monoculture'), desc: tr('ach.monoculture.desc', 'See one species make up nine tenths of all life in a world.'), world: (w) => w.topShare >= 0.9 },
  { id: 'DYNASTY', tier: 'rare', name: tr('ach.dynasty.name', 'Dynasty'), desc: tr('ach.dynasty.desc', 'See one species stay the most numerous for six hours straight.'), world: (w) => w.reign >= 6 * H },
  { id: 'APEX', tier: 'rare', name: tr('ach.apex.name', 'Apex'), desc: tr('ach.apex.desc', 'See a hunter stay the most numerous species in a world for an hour.'), world: (w) => w.topGuild === 'predator' && w.reign >= H },
  { id: 'SURVIVOR', tier: 'rare', name: tr('ach.survivor.name', 'Survivor'), desc: tr('ach.survivor.desc', 'See one species live through a drought, a storm, a frost and a duckweed bloom.'), world: (w) => w.endured >= 4 },
  { id: 'SPARK', tier: 'rare', name: tr('ach.spark.name', 'From the Silt'), desc: tr('ach.spark.desc', 'See life sparked from the silt grow to three quarters of the pool.'), world: (w) => w.sparkShare >= 0.75 },
  { id: 'LIVING_FOSSIL', tier: 'rare', name: tr('ach.living-fossil.name', 'Living Fossil'), desc: tr('ach.living-fossil.desc', 'See one species live for a simulated day.'), world: (w) => w.oldest >= 24 * H },

  // ---- the viewer's own
  { id: 'NAMED', tier: 'viewer', name: tr('ach.named.name', 'Taxonomist'), desc: tr('ach.named.desc', 'Give a species a name of your own.') },
  { id: 'CARD', tier: 'viewer', name: tr('ach.card.name', 'Collector'), desc: tr('ach.card.desc', 'Save a species’ card to your cabinet.') },
  { id: 'FILM', tier: 'viewer', name: tr('ach.film.name', 'Documentarian'), desc: tr('ach.film.desc', 'Film a minute of the pool.') },
  { id: 'RIDE', tier: 'viewer', name: tr('ach.ride.name', 'Along for the Ride'), desc: tr('ach.ride.desc', 'Ride a cell and steer it through the water.') },
  { id: 'STRANGER', tier: 'viewer', name: tr('ach.stranger.name', 'Stowaway'), desc: tr('ach.stranger.desc', 'Carry a species from one world into another.') },
  { id: 'SHARED', tier: 'viewer', name: tr('ach.shared.name', 'Show and Tell'), desc: tr('ach.shared.desc', 'Share a world on the Steam Workshop.') },
];

/** The ids a story earns; told is how many stories the viewer has read in all, this one included. */
export function earned(story, told = 0) {
  return ACHIEVEMENTS.filter((a) => (a.story ? a.story(story) : a.stories ? told >= a.stories : false)).map((a) => a.id);
}

/** The ids a world's numbers have reached (w: worldFacts). */
export function reached(w) {
  return ACHIEVEMENTS.filter((a) => a.world?.(w)).map((a) => a.id);
}

/** Whether a story (told or only weighed) would earn an achievement not in `have` (a Set of ids). */
export const worthy = (story, have) => ACHIEVEMENTS.some((a) => a.story && !have.has(a.id) && a.story(story));

// Core achievements come one at a time: at least this long apart, in simulated time and in real time (a world at Max
// races through its hours). A world's opening is a recovery's boom and bust, rich in radiations, crashes and comebacks;
// without this a viewer met half a dozen in its first quarter hour.
export const PACE = { sim: 20 * 60, real: 180e3 };
const TIER = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a.tier]));

/**
 * The pacing of unlocks. take(ids, have, t, now) -> the ids of `ids` not in `have` to unlock now (t simulated, now real
 * ms): rare and the viewer's at once, core only once PACE has passed since the last unlock, and one at a time (the
 * first of `ids`); a held core id is earned again when its story or number comes again. ready(t, now): whether a core id would
 * be unlocked now. A world begun again (t before the last unlock) starts afresh.
 */
export function createPacer(P = PACE) {
  let sim = -Infinity, real = -Infinity;
  const ready = (t, now) => t < sim || (t - sim >= P.sim && now - real >= P.real);
  return {
    ready,
    take(ids, have, t, now) {
      const fresh = ids.filter((id) => !have.has(id));
      const out = fresh.filter((id) => TIER[id] !== 'core');
      const core = fresh.filter((id) => TIER[id] === 'core');
      if (core.length && ready(t, now)) out.push(core[0]);
      if (out.length) { sim = t; real = now; }
      return out;
    },
  };
}

// the four kinds of event, as bits of a species' record of what it has lived through (sp.weathered)
export const EVENT_BITS = { drought: 1, storm: 2, frost: 4, duckweed: 8 };
const bits = (m) => { let n = 0; for (; m; m &= m - 1) n++; return n; };

/**
 * A world's numbers for reached(), from the page's record of it:
 *   t: the world's simulated age; living, count: cells living, particles in all; species: the registry's records
 *   (alive, established, pop, establishedAt, weathered); guildOf(species): its diet guild; events: the pool's events ({ type, end }), those
 *   come and gone; top, topSince: the most numerous species (its serial) and when it became so; peak, low: the most cells ever
 *   living at once and the fewest since (once there were 2,000); signal: species singing the five tones that took hold; founders: the
 *   serials up to the world's founders (a founder after them sprang from the silt).
 * Shares of the living count only while life fills a tenth of the world (a handful left after a collapse is no
 * monoculture).
 */
export function worldFacts({ t, living, count, species, guildOf, events, top, topSince, peak = 0, low = Infinity, signal = 0, founders = Infinity }) {
  const weathered = { drought: 0, storm: 0, frost: 0, duckweed: 0 };
  for (const e of events) if (e.end <= t && e.type in weathered) weathered[e.type]++;
  let oldest = 0, endured = 0, best = null, spark = 0;
  for (const sp of species) {
    if (!sp.alive || !sp.established) continue;
    if (sp.founder && sp.serial > founders) spark = Math.max(spark, sp.pop);
    oldest = Math.max(oldest, t - (sp.establishedAt ?? t));
    endured = Math.max(endured, bits(sp.weathered || 0));
    if (sp.serial === top) best = sp;
  }
  const full = living >= 0.1 * count;
  return { t, weathered, oldest, endured, signal, lowest: peak >= 2000 ? low / peak : 1,
    topShare: full && best ? best.pop / living : 0, topGuild: full && best ? guildOf(best) : null, reign: best ? t - (topSince ?? t) : 0,
    sparkShare: full ? spark / living : 0 };
}
