// Steam achievements, earned as the chronicler tells of something (docs/desktop.md). A story told
// (chronicler.js: { kind, key, moment }) earns the achievements whose story it is; a few come from the
// viewer's own doing. Their ids are the API names set up in Steamworks, which shows the names and
// descriptions given here. Pure: the page asks the desktop shell to unlock what this returns.

export const ACHIEVEMENTS = [
  // the chronicler's firsts (detectFirsts: told at most once a world, after its first minutes)
  { id: 'FIRST_MULTI', name: 'Many Hands', desc: 'Witness the first many-celled organism in a world.', story: (s) => s.key === 'first:multi' },
  { id: 'FIRST_TREE', name: 'Branching Out', desc: 'Witness the first species to grow as a branching tree.', story: (s) => s.key === 'first:tree' },
  { id: 'FIRST_SWIMMER', name: 'Open Water', desc: 'Witness the first many-celled body that swims.', story: (s) => s.key === 'first:swimbody' },
  { id: 'FIRST_HUNTER', name: 'Tooth and Claw', desc: 'Witness the first species to hunt living prey.', story: (s) => s.key === 'first:guild:predator' },
  { id: 'FIRST_THREE_TYPES', name: 'Division of Labor', desc: 'Witness the first species to grow three kinds of cell.', story: (s) => s.key === 'first:types3' },
  { id: 'FIRST_THERMOPHILE', name: 'Hot Springs', desc: 'Witness the first thermophile, at home in water above 38°.', story: (s) => s.key === 'first:thermophile' },
  { id: 'FIRST_COLD', name: 'Cold Blood', desc: 'Witness the first cold-lover, at home in water below 10°.', story: (s) => s.key === 'first:cold' },
  { id: 'REEF', name: 'Reef Builders', desc: 'Witness the first reef stone laid, or a reef rising.', story: (s) => s.key === 'first:calcify' || s.kind === 'reef' },
  // the pool's dramas
  { id: 'ARMS_RACE', name: 'Red Queen', desc: 'Witness an arms race between hunter and prey.', story: (s) => s.kind === 'arms' },
  { id: 'CYCLE', name: 'Boom and Bust', desc: 'Witness hunter and hunted rise and fall in turn.', story: (s) => s.kind === 'cycle' },
  { id: 'RADIATION', name: 'Adaptive Radiation', desc: 'Witness a genus burst into many species.', story: (s) => s.kind === 'radiation' },
  { id: 'REIGN', name: 'Long Live the King', desc: 'Witness a reign end, or one long held.', story: (s) => s.kind === 'reign' },
  { id: 'COMEBACK', name: 'Lazarus', desc: 'Witness a species come back from the brink.', story: (s) => s.kind === 'comeback' },
  { id: 'SPARK', name: 'From the Silt', desc: 'Witness life sparked from silt take a tenth of the pool.', story: (s) => s.kind === 'spark' },
  { id: 'ELDER', name: 'Old Growth', desc: 'Witness a species hold on for hours.', story: (s) => s.kind === 'elder' },
  { id: 'MASS_EXTINCTION', name: 'The Great Dying', desc: 'Witness a mass extinction.', story: (s) => s.kind === 'mass' },
  { id: 'GUILD_LOST', name: 'The Last of Its Kind', desc: 'Witness the last of a guild perish.', story: (s) => s.kind === 'guild' && s.moment !== 'back' },
  { id: 'COLLAPSE', name: 'Near Silence', desc: 'Witness life all but fail.', story: (s) => s.kind === 'collapse' && s.moment !== 'back' },
  { id: 'RETURN', name: 'Life Finds a Way', desc: 'Witness life return after it all but failed.', story: (s) => s.kind === 'collapse' && s.moment === 'back' },
  { id: 'AFTERMATH', name: 'Weathered', desc: 'Witness the aftermath of one of the pool’s events.', story: (s) => s.kind === 'aftermath' },
  { id: 'ERA', name: 'Turning of the Ages', desc: 'Witness the chronicler tell what an era did.', story: (s) => s.kind === 'era' },
  // the viewer's own
  { id: 'STORIES_50', name: 'Natural Historian', desc: 'Read fifty of the chronicler’s stories.', stories: 50 },
  { id: 'NAMED', name: 'Taxonomist', desc: 'Give a species a name of your own.' },
  { id: 'SHARED', name: 'Show and Tell', desc: 'Share a world on the Steam Workshop.' },
];

/** The ids a told story earns; told is how many stories the viewer has read in all, this one included. */
export function earned(story, told = 0) {
  return ACHIEVEMENTS.filter((a) => (a.story ? a.story(story) : a.stories ? told >= a.stories : false)).map((a) => a.id);
}
