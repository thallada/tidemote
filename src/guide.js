// Field guide text and the glossary that powers hover hints.

export const GLOSSARY = {
  silt: 'Inert grit, most of the world’s matter. It drifts on currents, is charged into glint by the Tide, and every newborn cell is built out of one grain of it.',
  glint: 'Charged silt: free-floating food holding 1.0 energy. It forms mostly inside tide bands, leaks charge, and fades back to silt after about 27 s if nothing eats it.',
  husk: 'A dead cell’s remains. Starved, elderly and killed cells all leave one. Holds leftover energy for scavengers and crumbles back into silt after about half a minute.',
  living: 'Cells: particles with a genome. They feed, pay upkeep, divide by building a child out of silt, and die into husks.',
  tide: 'Four slow waves summed across the wrap-around world. Where they add up, bright bands form and drift. The Tide charges silt into glint and adds to the light.',
  light: 'What photosynthesising cells feed on: a dim baseline everywhere (set by the era) plus the Tide on top, scaled by the season.',
  season: 'A 5-minute cycle that swings tide strength between 10% and 100%. Glint production and peak light follow it, which drives booms and busts.',
  era: 'Every 10–18 minutes the climate turns: the baseline light and glint production change, one tide wave is replaced, and the currents shift. The names are random labels.',
  epoch: 'Simulated time since this universe began.',
  simrate: 'Simulated seconds per real second actually achieved. Shown when running at Max, or when the GPU cannot keep up with the chosen speed. Above ×1 the page runs more simulation steps between drawn frames, so the ecology is exactly the one at ×1, only sooner.',
  abiogenesis: 'Life sparking from glint: a completely random new species, about once every 30 simulated seconds on average.',
  flesh: 'Eating other living cells. A cell can only eat species whose surface signature looks unlike its own. Caught animal prey is killed outright and leaves a husk; this takes time, so a hunter manages at most one kill every few seconds. Plant cells are cropped a 0.06-energy bite at a time. Bonded bodies are armoured and shrug off some attacks.',
  diet: 'The share of energy a species takes from each food. Food is worth its energy × share × 1.5, less for partly photosynthetic species.',
  photosynth: 'Takes energy directly from light: 0.4 × photosynthesis × local light per second. It is reduced by shade from neighbouring cells (a bonded body barely shades itself), needs minerals (silt nearby), and runs faster for anchored cells with current flowing past them. Photosynthesis makes a cell heavy: less thrust, no swimming, worse at eating.',
  grazer: 'Mostly eats glint, and crops photosynthesising cells: the herbivores of this world.',
  scavenger: 'Mostly eats husks.',
  predator: 'Mostly eats flesh: hunts animal cells, and crops plants only reluctantly.',
  celltype: 'α, β and γ cells of one species share a genome but each has its own surface and receptor signature, so each type is pulled toward and away from things differently. Types also differ in colour tint, size and shape.',
  bodyplan: 'The long-run mix of cell types a species produces. Each child’s type is chosen by a developmental rule from its parent’s type; this is where that rule settles.',
  stone: 'Bedrock, and the skeletons of calcifying cells. Stone never drifts and the living cannot pass through it. Attacks made from among stone often miss, so prey shelters in reefs; adhesive cells grip nearby stone against the currents. Bedrock lasts nearly an hour, a reef grain a few minutes, so a reef persists only while it is being built.',
  calcify: 'How much of a skeleton a cell lays down. Calcifying costs upkeep. When a settled calcifying cell dies of hunger or old age it may leave stone instead of a husk, far more often beside stone already there, so reefs grow outward from rock and from the rare place one starts. Drifting cells seldom leave stone.',
  adhesion: 'How strongly cells of one species bond. Above 15%, each cell bonds to its two nearest same-species neighbours with a spring. Bonds are the links you see and they hold bodies together. Bonded cells share the cost of living (up to 15% less upkeep), shade each other less and are armoured against attack. They still pay crowding beyond their bond partners, disperse poorly and their inner cells struggle to reach silt to divide. Species without adhesion are free-living.',
  bond: 'A spring between two cells of the same species. Drawn as a link. A connected web of bonds is one organism.',
  organism: 'A body: all same-species cells connected through bonds. A species only forms bodies if its adhesion is above 15%; otherwise every cell is its own organism, even when the species has several cell types (morphs) or gathers into swarms.',
  swimming: 'Self-propulsion: a steady push in the direction the cell is already moving. Reduced by photosynthesis.',
  schooling: 'Steering toward the average velocity of nearby cells of the same species. Makes schools and coherent bodies move together.',
  reach: 'How far a cell’s attraction and repulsion forces extend, in grid cells (at most 1).',
  personalspace: 'The inner part of the reach where any living cell is pushed away. Sets how tightly packed bodies are.',
  thrust: 'How strongly a cell responds to attractions and repulsions.',
  glide: 'How long momentum lasts (the half-life of velocity). Short glide stops quickly; long glide coasts.',
  currentpull: 'How much the ocean currents carry the cell. Low values are anchored: they pay a little upkeep to hold on, but anchored photosynthesisers are fed by the water flowing past. High values drift for free.',
  lifespan: 'Age at which a cell dies of old age.',
  dividesat: 'Energy a cell needs before it can divide. It also needs a grain of silt within reach to build the child from.',
  childshare: 'Fraction of the parent’s energy handed to each child.',
  upkeep: 'Energy burned per second. Grows with thrust, reach, swimming, schooling, adhesion, lifespan, size and anchoring. Starving cells burn slower. Crowding raises it: a cell packed among more than four of its own kind (not counting its bond partners) pays extra.',
  mutation: 'Chance per division that the child founds a new species with a nudged genome. Rarely, a whole cell type is reinvented or copied.',
  size: 'Drawn size and shape. Purely visual apart from a small upkeep cost; physics uses reach and personal space.',
  share: 'This species’ fraction of all living cells.',
  genus: 'A family of species within a set genetic distance of the genus founder. A lineage that drifts far enough founds a new genus.',
  species: 'Every mutant founds a new species. Most die out unseen; a species counts as thriving once it reaches a population threshold.',
  thriving: 'Species that have reached the population threshold (scaled to world size) and are still alive.',
  alive: 'Every species with at least one living cell, including brand-new mutants.',
  ever: 'Total number of species that have ever existed in this epoch.',
  deepest: 'The most speciation steps between any living species and its founder.',
  generation: 'How many divisions separate this cell from the beginning of the world.',
  depth: 'How many speciation events separate this species from its founder.',
  touching: 'Other species whose cells sit within bond range of this organism.',
  energy: 'Stored energy. Gained from food or light, spent on upkeep and on building children. A cell starves at zero.',
  origin: 'How this particle came to be what it is now.',
  lighthere: 'Light at this cell’s position right now: baseline plus tide, scaled by the season.',
  colonial: 'On average its cells attract each other. In a bonded species this packs the body tight; in a free-living species the cells gather into swarms without ever joining.',
  solitary: 'On average its cells repel each other, so they spread out (or, if bonded, stretch into strands).',
  looseknit: 'Its cells barely attract or repel each other.',
  morphs: 'A free-living species whose genome makes more than one cell type. The types never bond into a body: they are separate individuals of one species with different shapes and behaviours, like castes or life stages. Their children can be any type the developmental rule allows.',
  sessile: 'Barely moves and resists currents: a reef or mat.',
  drifting: 'Carried by the currents.',
  focus: 'A highlight: everything outside the chosen filter is dimmed in the simulation.',
  links: 'Bonds between cells of one multicellular body. Single-celled species never show links.',
  loupe: 'A magnifier that follows the mouse when zoomed out. Clicks inside it select what is under the crosshair.',
  speed: 'Current speed, in grid cells per second.',
  diversity: 'Effective number of species: exp of the Shannon entropy of species populations. A world of 10 equally common species scores 10.',
};

const t = (term, label) => `<span class="term" data-tip="${term}">${label}</span>`;

export const GUIDE = [
  {
    id: 'overview', title: 'What you are looking at',
    html: `<p>Tidemote is a sealed world on the surface of a torus: what leaves one edge enters the opposite one. Every point is one particle, and the total number never changes. Particles only change form: inert ${t('silt', 'silt')}, charged ${t('glint', 'glint')}, living cells, dead ${t('husk', 'husks')}, and ${t('stone', 'stone')}: the world's bedrock and the reefs that calcifying cells leave behind.</p>
<p>Energy is the only thing that enters and leaves. It arrives as ${t('light', 'light')} and as glint charged by the ${t('tide', 'Tide')}, and it is lost as cells pay ${t('upkeep', 'upkeep')}, as glint fades and as husks decay. Everything you see grows out of a handful of local rules applied to every particle 60 times a second.</p>`,
  },
  {
    id: 'cycle', title: 'The matter cycle',
    html: `<ol class="steps">
<li><b>Silt → glint.</b> Each second a grain of silt has a chance to become glint, mostly inside tide bands. Glint holds 1.0 energy, leaks 0.03 per second and turns back into silt below 0.2.</li>
<li><b>Feeding.</b> Cells eat glint, husks, or other cells (${t('flesh', 'flesh')}), according to their ${t('diet', 'diet')}. Eaten glint and husks turn into silt; a killed cell becomes a husk. Photosynthetic cells drink ${t('light', 'light')} instead, and are only cropped a bite at a time. Cells stop feeding once they have enough energy to divide.</li>
<li><b>Division.</b> Once its energy passes its ${t('dividesat', 'division threshold')} and a grain of silt lies within 0.25 cells, a cell turns that grain into its child and hands over a ${t('childshare', 'share')} of its energy. Every child is built out of silt.</li>
<li><b>Mutation.</b> Each division has a small chance of founding a new species with a nudged genome.</li>
<li><b>Death.</b> At zero energy (starvation) or at its ${t('lifespan', 'lifespan')} a cell becomes a husk carrying leftover energy. Husks decay and crumble into silt. A settled ${t('calcify', 'calcifying')} cell may leave ${t('stone', 'stone')} instead, mostly beside stone already there; stone wears back into silt over minutes.</li>
<li><b>Sparks.</b> Occasionally glint sparks into a completely random new species (${t('abiogenesis', 'abiogenesis')}), so life can always restart.</li>
</ol>`,
  },
  {
    id: 'climate', title: 'Tides, light, seasons and eras',
    html: `<p>The ${t('tide', 'Tide')} is four slow waves summed over the torus; where they add up, bright bands form and drift. ${t('light', 'Light')} is a dim baseline everywhere plus the Tide on top. So tide bands are rich in both glint and light, while baseline light lets plants live anywhere.</p>
<p>The ${t('season', 'season')} is a 5-minute cycle that swings tide strength between 10% and 100%; it drives the regular booms and busts. Every 10–18 minutes an ${t('era', 'era')} begins: the baseline light and glint production change, one tide wave is replaced so the bright zones form and move differently, and two current patterns are swapped. Era names are random labels; the event log says what actually changed.</p>
<p>Use <b>Lab → Environment</b> to show a light map with contour lines and the current field.</p>`,
  },
  {
    id: 'cells', title: 'Cells, cell types and bodies',
    html: `<p>Each species has one genome. A genome describes up to three ${t('celltype', 'cell types')}, α, β and γ. Each type carries two 8-number signatures: a <b>surface</b> (how it appears to others) and a <b>receptor</b> (how it reacts). The pull of cell A on cell B is A’s receptor combined with B’s surface: above zero means attraction, below zero means repulsion. Silt, glint and husks have surfaces too, so a cell type can be drawn toward glint or repelled by husks.</p>
<p>When a cell divides, a developmental rule picks the child’s type from the parent’s type. Where that rule settles is the ${t('bodyplan', 'body plan')}, for example α 60 · β 40.</p>
<p>Species with ${t('adhesion', 'adhesion')} form ${t('bond', 'bonds')}: each cell ties itself with a spring to its two nearest cells of the same species. Bonds are what the links show, so a web of links is one ${t('organism', 'organism')}. Species without adhesion are single-celled and never show links, however closely they crowd.</p>`,
  },
  {
    id: 'movement', title: 'How things move',
    html: `<p>Every frame each living cell adds up:</p>
<ul>
<li><b>Pairwise forces</b> from everything within its ${t('reach', 'reach')}: any living cell inside its ${t('personalspace', 'personal space')} is pushed away; further out, the attraction value applies, strongest at mid-range. Scaled by ${t('thrust', 'thrust')}.</li>
<li><b>Bond springs</b> toward its two bonded neighbours.</li>
<li><b>${t('swimming', 'Swimming')}</b>: a steady push in the direction it is already moving.</li>
<li><b>${t('schooling', 'Schooling')}</b>: steering toward the average velocity of its own kind.</li>
<li><b>${t('glide', 'Glide')}</b>: how long momentum lasts.</li>
<li><b>Currents</b>, scaled by ${t('currentpull', 'current pull')}.</li>
</ul>
<p>There is no pathfinding and no sense beyond about one grid cell. Roamers are swimmers that travel until forces bend their path. Self-propelled bodies come from chases between cell types: if β is drawn to α while α pushes β away, β chases α forever and the body drives itself forward. Evolution keeps whichever pulls lead to food.</p>`,
  },
  {
    id: 'ecology', title: 'Ecology',
    html: `<p>Producers are photosynthesising reefs, mats and plankton, plus glint grazers. Consumers are grazers of plants, scavengers of husks, and predators. Several pressures shape which forms thrive:</p>
<ul>
<li>Crowding: cells packed among their own kind sicken (a body’s bond partners do not count), so clonal blobs and sprawling bodies break up and species mix.</li>
<li>Grazers crop the plants, predators thin out the grazers, and scavengers live off the husks both leave behind.</li>
<li>Catching takes skill: cells catch living prey in proportion to how well they are built to eat it, so photosynthesisers and husk eaters rarely kill.</li>
<li>Hunters and grazers get good at catching what they caught last and often miss unfamiliar prey, so booming species feed their predators and rare ones are spared.</li>
<li>Anchored plants thrive where currents run strong; drifting plankton where they are calm. Bonded bodies live cheaply and resist attack but disperse poorly.</li>
<li>The climate keeps changing which strategy pays.</li>
</ul>
<p>Mass is conserved, so every birth needs silt freed by some earlier death or meal. Life is limited by matter as well as energy.</p>`,
  },
  {
    id: 'evolution', title: 'Evolution and naming',
    html: `<p>Every mutant founds a new ${t('species', 'species')}. Mutations nudge every gene: signatures, diet, swimming, adhesion, colour and more. Occasionally a whole cell type is reinvented or copied over another. Most mutants vanish within seconds; those that reach the population threshold become ${t('thriving', 'thriving')} and are named.</p>
<p>Names are a ${t('genus', 'genus')} plus an epithet. A lineage that drifts far enough from its genus founder starts a new genus, which gets its own new name. Colours are inherited with drift, so related species look related.</p>`,
  },
  {
    id: 'reading', title: 'Reading the screen',
    html: `<ul>
<li><b>Colour</b>: the species, tinted per cell type. Related species share hues. Brightness shows stored energy; newborns flash; some lineages pulse.</li>
<li><b>Shape</b>: disc, ring, star, nucleus or diamond, a lineage marker per cell type. Husks are dim brown rings, glint is a pale sparkle, silt is faint slate.</li>
<li><b>Links</b>: ${t('bond', 'bonds')} within one multicellular body.</li>
<li><b>Census chart</b>: every particle over time, stacked. Silt, husks and glint sit at the bottom; above them each thriving species appears in its colour; the pale top band is life in species too small to list.</li>
</ul>`,
  },
  {
    id: 'tools', title: 'Research tools',
    html: `<ul>
<li><b>Inspector</b> (click a particle): its life story, its whole organism (traced through bonds and highlighted), its species and full genome, and a live specimen view. Species names everywhere are links.</li>
<li><b>Lab → Species</b>: every species ranked and filterable by diet, mobility, body, status and more. <b>Highlight</b> dims everything outside the filter.</li>
<li><b>Lab → Composition</b>: the world broken down by matter, cell type, diet, mobility and body type. Click any bar to highlight it.</li>
<li><b>Lab → Dynamics</b>: population, diversity, births, deaths and feeding over time.</li>
<li><b>Lab → Lineage</b>: the family tree of every thriving species.</li>
<li><b>Lab → Chronicle</b>: the full event history.</li>
<li><b>Lab → Environment</b>: light map, current field, the climate and its eras.</li>
</ul>`,
  },
];
