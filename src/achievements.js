// Steam achievements, earned as the chronicler tells of something (docs/desktop.md). A story told
// (chronicler.js: { kind, key, moment }) earns the achievements whose story it is; a few come from the
// viewer's own doing. Their ids are the API names set up in Steamworks, which shows the names and
// descriptions given here (Steamworks keeps its own copies, in each language it offers, for the Steam overlay; the
// page does not show these). Pure: the page asks the desktop shell to unlock what this returns.

import { tr } from './i18n.js';

export const ACHIEVEMENTS = [
  // the chronicler's firsts (detectFirsts: told at most once a world, after its first minutes)
  { id: 'FIRST_MULTI', name: tr('ach.first-multi.name', 'Many Hands'), desc: tr('ach.first-multi.desc', 'Witness the first many-celled organism in a world.'), story: (s) => s.key === 'first:multi' },
  { id: 'FIRST_TREE', name: tr('ach.first-tree.name', 'Branching Out'), desc: tr('ach.first-tree.desc', 'Witness the first species to grow as a branching tree.'), story: (s) => s.key === 'first:tree' },
  { id: 'FIRST_SWIMMER', name: tr('ach.first-swimmer.name', 'Open Water'), desc: tr('ach.first-swimmer.desc', 'Witness the first many-celled body that swims.'), story: (s) => s.key === 'first:swimbody' },
  { id: 'FIRST_HUNTER', name: tr('ach.first-hunter.name', 'Tooth and Claw'), desc: tr('ach.first-hunter.desc', 'Witness the first species to hunt living prey.'), story: (s) => s.key === 'first:guild:predator' },
  { id: 'FIRST_THREE_TYPES', name: tr('ach.first-three-types.name', 'Division of Labor'), desc: tr('ach.first-three-types.desc', 'Witness the first species to grow three kinds of cell.'), story: (s) => s.key === 'first:types3' },
  { id: 'FIRST_THERMOPHILE', name: tr('ach.first-thermophile.name', 'Hot Springs'), desc: tr('ach.first-thermophile.desc', 'Witness the first thermophile, at home in water above 38°.'), story: (s) => s.key === 'first:thermophile' },
  { id: 'FIRST_COLD', name: tr('ach.first-cold.name', 'Cold Blood'), desc: tr('ach.first-cold.desc', 'Witness the first cold-lover, at home in water below 10°.'), story: (s) => s.key === 'first:cold' },
  { id: 'REEF', name: tr('ach.reef.name', 'Reef Builders'), desc: tr('ach.reef.desc', 'Witness the first reef stone laid, or a reef rising.'), story: (s) => s.key === 'first:calcify' || s.kind === 'reef' },
  // the pool's dramas
  { id: 'ARMS_RACE', name: tr('ach.arms-race.name', 'Red Queen'), desc: tr('ach.arms-race.desc', 'Witness an arms race between hunter and prey.'), story: (s) => s.kind === 'arms' },
  { id: 'CYCLE', name: tr('ach.cycle.name', 'Boom and Bust'), desc: tr('ach.cycle.desc', 'Witness hunter and hunted rise and fall in turn.'), story: (s) => s.kind === 'cycle' },
  { id: 'RADIATION', name: tr('ach.radiation.name', 'Adaptive Radiation'), desc: tr('ach.radiation.desc', 'Witness a genus burst into many species.'), story: (s) => s.kind === 'radiation' },
  { id: 'REIGN', name: tr('ach.reign.name', 'Long Live the King'), desc: tr('ach.reign.desc', 'Witness a reign end, or one long held.'), story: (s) => s.kind === 'reign' },
  { id: 'COMEBACK', name: tr('ach.comeback.name', 'Lazarus'), desc: tr('ach.comeback.desc', 'Witness a species come back from the brink.'), story: (s) => s.kind === 'comeback' },
  { id: 'SPARK', name: tr('ach.spark.name', 'From the Silt'), desc: tr('ach.spark.desc', 'Witness life sparked from silt take a tenth of the pool.'), story: (s) => s.kind === 'spark' },
  { id: 'ELDER', name: tr('ach.elder.name', 'Old Growth'), desc: tr('ach.elder.desc', 'Witness a species hold on for hours.'), story: (s) => s.kind === 'elder' },
  { id: 'MASS_EXTINCTION', name: tr('ach.mass-extinction.name', 'The Great Dying'), desc: tr('ach.mass-extinction.desc', 'Witness a mass extinction.'), story: (s) => s.kind === 'mass' },
  { id: 'GUILD_LOST', name: tr('ach.guild-lost.name', 'The Last of Its Kind'), desc: tr('ach.guild-lost.desc', 'Witness the last of a guild perish.'), story: (s) => s.kind === 'guild' && s.moment !== 'back' },
  { id: 'COLLAPSE', name: tr('ach.collapse.name', 'Near Silence'), desc: tr('ach.collapse.desc', 'Witness life all but fail.'), story: (s) => s.kind === 'collapse' && s.moment !== 'back' },
  { id: 'RETURN', name: tr('ach.return.name', 'Life Finds a Way'), desc: tr('ach.return.desc', 'Witness life return after it all but failed.'), story: (s) => s.kind === 'collapse' && s.moment === 'back' },
  { id: 'AFTERMATH', name: tr('ach.aftermath.name', 'Weathered'), desc: tr('ach.aftermath.desc', 'Witness the aftermath of one of the pool’s events.'), story: (s) => s.kind === 'aftermath' },
  { id: 'ERA', name: tr('ach.era.name', 'Turning of the Ages'), desc: tr('ach.era.desc', 'Witness the chronicler tell what an era did.'), story: (s) => s.kind === 'era' },
  // the viewer's own
  { id: 'STORIES_50', name: tr('ach.stories-50.name', 'Natural Historian'), desc: tr('ach.stories-50.desc', 'Read fifty of the chronicler’s stories.'), stories: 50 },
  { id: 'NAMED', name: tr('ach.named.name', 'Taxonomist'), desc: tr('ach.named.desc', 'Give a species a name of your own.') },
  { id: 'SHARED', name: tr('ach.shared.name', 'Show and Tell'), desc: tr('ach.shared.desc', 'Share a world on the Steam Workshop.') },
];

/** The ids a told story earns; told is how many stories the viewer has read in all, this one included. */
export function earned(story, told = 0) {
  return ACHIEVEMENTS.filter((a) => (a.story ? a.story(story) : a.stories ? told >= a.stories : false)).map((a) => a.id);
}
