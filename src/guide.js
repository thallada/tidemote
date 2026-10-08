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
  abiogenesis: 'Life sparking from glint: a completely random new species, about once every 30 simulated seconds on average.',
  flesh: 'Eating other living cells. A cell can only eat species whose surface signature looks unlike its own. Caught animal prey is killed outright and leaves a husk; this takes time, so a hunter manages at most one kill every few seconds. Plant cells are cropped a 0.06-energy bite at a time. Bonded bodies are armoured and shrug off some attacks.',
  diet: 'The share of energy a species takes from each food. Food is worth its energy × share × 1.5, less for partly photosynthetic species.',
  photosynth: 'Takes energy directly from light: 0.4 × photosynthesis × local light per second. It is reduced by shade from neighbouring cells (a bonded body barely shades itself), needs minerals (silt nearby), and runs faster for anchored cells with current flowing past them. Photosynthesis makes a cell heavy: less thrust, no swimming, worse at eating.',
  grazer: 'Mostly eats glint, and crops photosynthesising cells: the herbivores of this world.',
  scavenger: 'Mostly eats husks.',
  predator: 'Mostly eats flesh: hunts animal cells, and crops plants only reluctantly.',
  celltype: 'α, β and γ cells of one species share a genome but each has its own surface and receptor signature, so each type is pulled toward and away from things differently. Types also differ in colour tint, size and shape.',
  bodyplan: 'The long-run mix of cell types a species produces. Each child’s type is chosen by a developmental rule from its parent’s type; this is where that rule settles.',
  stone: 'Bedrock, and the skeletons of calcifying cells. Stone never drifts and the living cannot pass through it. Attacks made from among stone sometimes miss, so prey shelters in reefs, and calcifying cells settle on their own reef while everything else must go around it. Bedrock lasts nearly an hour. A loose grain of reef stone crumbles within minutes, a grain packed into a reef lasts far longer, and a neighbourhood that is mostly reef wears fast, so reefs grow as separate patches and persist only while they are being built.',
  calcify: 'How much of a skeleton a cell lays down. Calcifying costs upkeep. When a settled calcifying cell dies of hunger or old age it may leave stone instead of a husk, far more often beside stone already there, so reefs grow outward from rock and from the rare place one starts. Drifting cells seldom leave stone. Calcifiers can settle on stone; to everything else it is solid.',
  adhesion: 'How strongly cells of one species bond. Above 15%, each cell keeps up to two same-species partners with springs. Empty slots find the nearest neighbours within bond range; children start bonded to their parent if they are the same species. Bonds last until a partner dies, changes kind or stretches too far away. Bonds are the links you see and they hold bodies together. Bonded cells share the cost of living (up to 15% less upkeep), shade each other less and are armoured against attack. They still pay crowding beyond their bond partners, disperse poorly and their inner cells struggle to reach silt to divide. Species without adhesion are free-living.',
  bond: 'A persistent spring between two cells of the same species. Drawn as a link. It breaks if a partner dies, changes kind or stretches beyond 1.25 times the range at which bonds form. A connected web of bonds is one organism.',
  organism: 'A body: all same-species cells connected through bonds. A species only forms bodies if its adhesion is above 15%; otherwise every cell is its own organism, even when the species has several cell types (morphs) or gathers into swarms. Selecting a cell of a body follows the whole body: if the watched cell dies the watch passes to another of its cells, and if the body splits it follows the larger part.',
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
  size: 'Drawn size has a small upkeep cost; physics uses reach and personal space. Shape is cosmetic: twelve families with species-specific proportions and irregular, slowly deforming outlines.',
  share: 'This species’ fraction of all living cells.',
  genus: 'A family of species within a set genetic distance of the genus founder. A lineage that drifts far enough founds a new genus.',
  species: 'Every mutant founds a new species. Most die out unseen; a species counts as thriving once it reaches a population threshold.',
  thriving: 'Species that have reached the population threshold (scaled to world size) and are still alive.',
  alive: 'Every species with at least one living cell, including brand-new mutants.',
  ever: 'Total number of species that have ever existed in this epoch.',
  stepms: 'GPU time one simulation step takes.',
  drawms: 'GPU time drawing the world once takes: cells, stone, bloom and the final image. At high speeds it is drawn about thirty times a second.',
  stride: 'How much time each simulation step covers, in sixtieths of a second. At 1 the world runs exactly; a speed the GPU cannot reach that way takes longer steps (up to 4/60 s), which keep the same rates of life and death and, over long runs, the same diversity.',
  simrate: 'How fast the world is running right now, as a multiple of real time.',
  deepest: 'The most speciation steps between any living species and its founder.',
  generation: 'How many divisions separate this cell from the beginning of the world.',
  serial: 'Species number (SP): every species is numbered in the order it arose.',
  pid: 'Particle number (ID): every particle keeps its number through every form it takes.',
  depth: 'Δ: how many speciation events separate this species from its founder.',
  touching: 'Other species whose cells sit within bond range of this organism.',
  energy: 'Stored energy. Gained from food or light, spent on upkeep and on building children. A cell starves at zero.',
  origin: 'How this particle came to be what it is now.',
  lighthere: 'Light at this cell’s position right now: baseline plus tide, scaled by the season.',
  mind: 'What this cell is doing, read from a replay of its latest decision. A cell has no brain: every frame it adds up the pulls and pushes of everything within reach (its receptors against their surface signatures, appetite for the foods its diet favours, schooling, bonds, stone), moves, then eats, divides or neither. The mode names which pull wins; hover it for the reasoning. The compass draws each pull as an arrow, its length the pull’s strength, with the cell’s heading dashed and its target as a diamond on the rim. The lamps light for conditions that shape what it does. Fleeing is an evolved aversion: no cell knows what a predator is, but lineages whose receptors happened to push them away from their hunters survived.',
  'mind-food': 'Appetite: a hungry cell is drawn toward the foods its diet favours. Flesh-eaters are drawn to animal cells, grazers (and, reluctantly, flesh-eaters) to plant cells, and glint- and husk-eaters to glint and husks. It lets living food inside its personal space so it can reach it. A sated cell feels no appetite.',
  'mind-other': 'The pull or push of other species’ cells on this one: its receptors against their surface signatures. Evolved, not chosen: it is how prey comes to avoid hunters and how species come to live side by side.',
  'mind-kin': 'The pull or push of its own species’ cells (beyond personal space and bonds). Attraction gathers swarms and packs bodies; repulsion spreads them out.',
  'mind-matter': 'The pull or push of silt, glint, husks and stone on its receptors (apart from appetite), plus stone’s solid push on any cell but a calcifier.',
  'mind-net': 'Light minus upkeep, per second. Below zero the cell is living on its reserves until it eats.',
  'mind-near': 'Every species with cells within this cell’s reach, its own kind first; a species keeps its row while it stays. Cells: how many are in reach. Role: predator, a species built to catch this one; prey, one this cell is built to eat. The last column is how they pull on this cell: right, drawn toward them; left, pushed away.',
  colonial: 'On average its cells attract each other. In a bonded species this packs the body tight; in a free-living species the cells gather into swarms without ever joining.',
  solitary: 'On average its cells repel each other, so they spread out (or, if bonded, stretch into strands).',
  looseknit: 'Its cells barely attract or repel each other.',
  morphs: 'A free-living species whose genome makes more than one cell type. The types never bond into a body: they are separate individuals of one species with different shapes and behaviours, like castes or life stages. Their children can be any type the developmental rule allows.',
  sessile: 'Barely moves and resists currents: a reef or mat.',
  drifting: 'Carried by the currents.',
  focus: 'A highlight: everything outside the chosen filter is dimmed in the simulation.',
  links: 'Bonds between cells of one multicellular body. Single-celled species never show links.',
  autoidle: 'Left alone for a minute (three with a panel open), the camera starts filming the world on its own. Drag, scroll or tap to take it back.',
  renderscale: 'The share of the screen’s resolution the world is drawn at. Auto lowers it while frames run late and raises it again when there is room; a fixed value never changes.',
  autofloor: 'The lowest render scale Auto may drop to.',
  density: 'The most device pixels drawn per CSS pixel. High-density (Retina) screens look sharper at 2× but cost up to four times the pixels of 1×. Readouts and outlines stay sharp either way.',
  targetfps: 'Frames per second aimed for. 30 halves the GPU’s work and saves battery; Display follows the screen’s refresh rate (120 on many phones and Macs). Simulated time keeps pace with real time at any rate.',
  bloom: 'A soft glow around bright cells. Several extra full-screen passes.',
  optics: 'Microscope optics: depth haze and a vignette over the world. One extra full-screen pass.',
  lod: 'Zoomed in, cells resolve into membranes, organelles and fused bodies, and bonds into soft strands. Off, every cell stays the glowing point it is from afar, at any zoom: far cheaper, so the page can run more particles. The loupe and the live close-up still show the detail.',
  specks: 'The fine suspension that drifts between cells when zoomed far in. Drawn speck by speck; off saves a compute pass and a full-screen pass.',
  closeup: 'The live close-up in the specimen panel: a second, small view of the world drawn every frame.',
  particles: 'Every grain, husk and cell is one particle; their number is fixed for a world’s whole life. Auto measures the GPU and picks the most it can run smoothly. Changing it starts a new world.',
  loupe: 'A magnifier that follows the mouse when zoomed out. Clicks inside it select what is under the crosshair.',
  speed: 'Current speed, in grid cells per second.',
  song: 'Every species has its own song, read from its genome. Its surface signature picks the notes, how it lives sets the rhythm, tempo and range (hunters leap in quick clipped figures, drifting algae sway through long ones), and its colour picks the instrument. A mutant sings a variation: a few notes moved, or the tune turned upside down, reversed or answered. Its cells sing it as they go, in step if the species schools; a bonded colony adds a second voice.',
  sigil: 'The species’ song drawn as the organism that sings it: one cell per note, in the shape and colour of the cell type that sings it, as large as the note is long and turned by its pitch, packed in the order they sing as a colony grows. Cells are bonded only if the species bonds.',
  instrument: 'The instrument a species sings with: its family follows how it lives, its exact voice and timbre its colour.',
  register: 'How high the species sings. Plankton and scavengers sing high, hunters low.',
  tempo: 'How quickly its song moves, from how fast and how hungrily it lives.',
  audioload: 'How much of its time the soundtrack’s audio thread spends rendering. Near 100% it would crackle, so above about 50% fewer notes may sound at once and the oldest fade out early.',
  songmarks: 'A faint ring spreads from a cell each time it sings its species’ note: for the picked species only, or for every species. Needs sound on.',
  diversity: 'Effective number of species: exp of the Shannon entropy of species populations. A world of 10 equally common species scores 10.',
};

const t = (term, label) => `<span class="term" data-tip="${term}">${label}</span>`;

export const GUIDE = [
  {
    id: 'overview', title: 'What you are looking at', short: 'Overview',
    html: `<p>Tidemote is a sealed world on the surface of a torus: what leaves one edge enters the opposite one. Every point is one particle, and the total number never changes. Particles only change form: inert ${t('silt', 'silt')}, charged ${t('glint', 'glint')}, living cells, dead ${t('husk', 'husks')}, and ${t('stone', 'stone')}: the world's bedrock and the reefs that calcifying cells leave behind.</p>
<p>Energy is the only thing that enters and leaves. It arrives as ${t('light', 'light')} and as glint charged by the ${t('tide', 'Tide')}, and it is lost as cells pay ${t('upkeep', 'upkeep')}, as glint fades and as husks decay. Everything you see grows out of a handful of local rules applied to every particle 60 times a second.</p>`,
  },
  {
    id: 'cycle', title: 'The matter cycle', short: 'Matter',
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
    id: 'climate', title: 'Tides, light, seasons and eras', short: 'Climate',
    html: `<p>The ${t('tide', 'Tide')} is four slow waves summed over the torus; where they add up, bright bands form and drift. ${t('light', 'Light')} is a dim baseline everywhere plus the Tide on top. So tide bands are rich in both glint and light, while baseline light lets plants live anywhere.</p>
<p>The ${t('season', 'season')} is a 5-minute cycle that swings tide strength between 10% and 100%; it drives the regular booms and busts. Every 10–18 minutes an ${t('era', 'era')} begins: the baseline light and glint production change, one tide wave is replaced so the bright zones form and move differently, and two current patterns are swapped. Era names are random labels; the event log says what actually changed.</p>
<p><b>Settings → Light map</b> colours every point by the light a photosynthesising cell would receive there, with a contour every 10%; <b>Settings → Currents</b> draws the flow that carries silt, glint and drifting cells. The <b>Tide</b> gauge at the top follows the season: the dot rides the 5-minute wave.</p>`,
  },
  {
    id: 'cells', title: 'Cells, cell types and bodies', short: 'Cells',
    html: `<p>Each species has one genome. A genome describes up to three ${t('celltype', 'cell types')}, α, β and γ. Each type carries two 8-number signatures: a <b>surface</b> (how it appears to others) and a <b>receptor</b> (how it reacts). The pull of cell A on cell B is A’s receptor combined with B’s surface: above zero means attraction, below zero means repulsion. Silt, glint and husks have surfaces too, so a cell type can be drawn toward glint or repelled by husks.</p>
<p>Zoom in to see lobose and filose cells, crooked radiates, incised desmids, horned armour, twisted spindles, slippers, chambered whorls, crescents, stalked bells, bead chains and lattice frustules. Species have their own proportions; individuals have uneven membranes and slowly shifting outlines. A nucleus pinches as division approaches, producers carry chloroplasts, eaters carry vacuoles, and swimmers grow cilia or flagella. These visual forms are cosmetic.</p>
<p>When a cell divides, a developmental rule picks the child’s type from the parent’s type. Where that rule settles is the ${t('bodyplan', 'body plan')}, for example α 60 · β 40.</p>
<p>Species with ${t('adhesion', 'adhesion')} form ${t('bond', 'bonds')}: each cell keeps up to two partners of the same species. New bonds fill empty slots with nearby cells, and children start bonded to their parent, so bodies grow by division. A bond lasts until a partner dies, changes kind or stretches too far away. Bonds are what the links show, so a web of links is one ${t('organism', 'organism')}. Species without adhesion are single-celled and never show links, however closely they crowd.</p>`,
  },
  {
    id: 'movement', title: 'How things move', short: 'Movement',
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
    id: 'ecology', title: 'Ecology', short: 'Ecology',
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
    id: 'evolution', title: 'Evolution and naming', short: 'Evolution',
    html: `<p>Every mutant founds a new ${t('species', 'species')}. Mutations nudge every gene: signatures, diet, swimming, adhesion, colour and more. Occasionally a whole cell type is reinvented or copied over another. Most mutants vanish within seconds; those that reach the population threshold become ${t('thriving', 'thriving')} and are named.</p>
<p>Names are a ${t('genus', 'genus')} plus an epithet. A lineage that drifts far enough from its genus founder starts a new genus, which gets its own new name. Colours are inherited with drift, so related species look related.</p>`,
  },
  {
    id: 'reading', title: 'Reading the screen', short: 'Screen',
    html: `<ul>
<li><b>Colour</b>: the species, tinted per cell type. Related species share hues. Brightness shows stored energy; newborns flash; some lineages pulse.</li>
<li><b>Shape</b>: disc, ring, star, nucleus or diamond, a lineage marker per cell type. Husks are dim brown rings, glint is a pale sparkle, silt is faint slate.</li>
<li><b>Links</b>: ${t('bond', 'bonds')} within one multicellular body.</li>
<li><b>Census</b>: the bar splits every particle between living cells, glint, husks, stone and silt. The chart below it stacks living cells by species in their colours; the pale top band is life in species too small to list, and dotted lines mark new eras.</li>
<li><b>Scale</b>: the ticks above the controls are whole grid cells (or a few, zoomed out); the bar at the right says how many.</li>
</ul>`,
  },
  {
    id: 'tools', title: 'Research tools', short: 'Tools',
    html: `<ul>
<li><b>Specimen</b> (click or tap a particle): a live close-up, its energy and age, its record, its organism (traced through its bonds, highlighted and followed as a whole, even after the cell you picked dies), its species and its full genome. Species names everywhere are links.</li>
<li><b>Lab → Species</b>: every species, filtered by status, diet, movement and body. <b>Highlight these</b> dims everything outside the filter.</li>
<li><b>Lab → Lineage</b>: every established species on a time axis, joined to the ancestor it arose from; each bar thickens with its population.</li>
<li><b>Lab → Census</b>: the world broken down by matter, diet, movement, body and cell type. Choose a row to highlight it.</li>
<li><b>Lab → Charts</b>: population, diversity, births, deaths, meals and climate over time, and the eras so far.</li>
<li><b>Lab → Log</b>: every logged event, searchable.</li>
<li><b>Auto</b>: the camera films the world on its own, with captions saying what it is showing; it also takes over after a minute alone (switch that off in Settings).</li>
</ul>`,
  },
];
