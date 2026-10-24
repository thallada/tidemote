// Field guide text and the glossary that powers hover hints.

export const GLOSSARY = {
  silt: 'Inert grit, most of the world’s matter. It drifts on currents, every newborn cell is built out of one grain of it, and now and then life sparks from it in the light.',
  husk: 'A dead cell’s remains. Starved, elderly, killed and scalded cells all leave one, and eaters drop dung (smaller olive pellets). Holds leftover energy for scavengers and crumbles back into silt after about half a minute: cold water keeps carcasses for the scavengers, warm water rots them fast, and a rotting pile warms its water a little.',
  living: 'Cells: particles with a genome. They feed, pay upkeep, divide by building a child out of silt, and die into husks.',
  tide: 'Four slow waves summed across the wrap-around world. Where they add up, bright bands form and drift. Inside them the light is brighter, so producers bloom where the bands pass.',
  light: 'What plants feed on. It is dim everywhere (how dim depends on the era) and brighter inside tide bands, most of all at the height of the season.',
  season: 'A 5-minute cycle that swings tide strength between 10% and 100%. This is the Tide percentage in the gauge and graphs: the bands keep their shape and only brighten or fade. Light in the bands follows it, which drives booms and busts.',
  era: 'Every 10–18 minutes the climate turns: the baseline light and the water’s temperature change, one tide wave is replaced, and the currents shift. An era that warms the water by 5° or more is named Warm or Rising, one that cools it Bitter or Pale; otherwise the names are random labels.',
  water: 'The water’s background temperature, set by the climate: it walks from era to era between 4° and 28°, swings ±2.5° with the season, and now and then a heat wave or cold snap passes. Life warms its own water above this: every cell’s spent energy becomes heat, so crowds, bodies and reefs sit in warm patches.',
  tidemap: 'The light the Tide brings, right now: dark where it is dim, through violet to pale blue where the bands are brightest. Thin lines trace the bands’ shape at every season, so they still show at low tide, and a dashed line shows where the bands will be in 20 seconds, so you can see where the producers’ light is heading. Tap the Tide gauge (on phones, the era name) to open it.',
  heatmap: 'How heat is drawn. Shimmer: warm water bends light like the air over a hot road, so plumes, colony halos and fronts waver. Full: a thermal camera, deep blue to teal to amber to white over a span from 2° below the background water to 10° above it, with a line every 2°.',
  thermal: 'How well a cell works at its temperature: a rate that scales its photosynthesis, digestion and swimming. It is at its best within half a tolerance of the species’ optimum (higher the narrower its tolerance), then falls slowly on the cold side and steeply on the warm side. Away from its optimum a cell also pays extra upkeep for the stress.',
  optimum: 'The temperature a species works best at (a gene, 0–45°). It drifts by mutation, so lineages can follow the climate or find a warm or cold refuge. A spark of life founds a species suited to the water it sparked in.',
  tolerance: 'How far from its optimum a species still works (a gene, ±2–15°). Narrow specialists work up to 25% better at their optimum than broad generalists, but a few degrees away they falter.',
  heatmaker: 'A species that burns extra energy (up to 0.03 per second) as heat. Its cells run warmer than the water, more so in a body, and its colonies warm the water around them: lifeboats for itself and for warmth-lovers in a cold snap, overheating traps in a heat wave.',
  torpor: 'Far below its optimum (more than 1.25 tolerances) a cell goes torpid: it neither feeds, swims nor divides, pays a quarter of its upkeep, dims, its pulse stops and it falls silent, until the water warms.',
  scalding: 'Far above its optimum a cell begins to die of the heat: a chance each second, rising steeply. A scalded cell leaves a husk. Heat-stressed cells bleach toward pale bone first.',
  phototaxis: 'Some species sense which way the light grows and push themselves toward it, or, shunning it, away into the dim water. It is a motility of its own, paid for in upkeep, so even a drifting producer can follow the bands of light as they travel; grazers and hunters that follow the light find the meadows there.',
  thermotaxis: 'Swimmers away from their optimum steer up or down the warmth of the water toward it, harder the further off they are. Drifters and anchored cells cannot steer; heat sorts them by who survives where.',
  framboid: 'A pyrite framboid: a sphere of tiny iron sulfide crystals, a few microns across like the cells. Framboids grow where a pile of husks rots in cool water (the rot releases the sulfide), and a few lie in the mud from the start. As one oxidises it warms its water, burning faster the warmer that water is, so a crowded, hot cluster burns itself out; spent, it crumbles to silt. Sparks of life favour their warmth, and heat-loving species gather round them. Framboids are solid like stone.',
  poolevents: 'Now and then (about once an hour of world time) the pool suffers an event: a drought, a storm, duckweed or a frost. Each lasts a few minutes, is announced in the log, and is survived by life resting as cysts. Turn them all off here, or each kind on its own.',
  evdrought: 'A drought: the water falls over several minutes until a third to two thirds of the floor lies dry, parting the pool into separate pools. Cells stranded on the mud shrivel; most rest as cysts. Then rain refills it, cold and dim, and the cysts wake.',
  evstorm: 'A storm: cold rain for a few minutes. Raindrops ring the surface and shove the water outward, currents run rough and the light dims under the cloud.',
  evduckweed: 'Duckweed (Lemna, among the smallest flowering plants): a few fronds, each 1 to 5 mm long, drift onto the pool for several minutes, turning slowly. Their shade starves the producers under them; each frond hangs a single root down into the water, sharp where it reaches the focal plane.',
  evfrost: 'A frost: a cold night chills the water to near 0° and ice grows over most of the pool from the shallows, pushing cells into the veins of water between its crystals. Cells caught in the ice freeze as cysts or die. Then it thaws.',
  evstart: 'Start an event of that kind now, to watch it. Only the kinds turned on above.',
  cystdry: 'A cell stranded on the mud or caught in the ice cannot move or feed. It shows dried (shrivelled, dull brown) or frozen (pale, frosted); most rest as cysts, losing energy very slowly until the water returns, and the rest starve.',
  heatwave: 'An excursion of the climate: for a few minutes the water rises (a heat wave) or falls (a cold snap) by 5–8°. Heat waves scald and bleach; cold snaps still the world except where heat-makers keep colonies warm.',
  epoch: 'Simulated time since this universe began.',
  abiogenesis: 'Life sparking from silt: a completely random new species suited to the water it sparks in, about once every 30 simulated seconds, mostly in the light and more in hot water. A world whose life has died begins again this way.',
  flesh: 'Eating other living cells. A cell can only eat species whose surface signature looks unlike its own. Caught animal prey is killed outright and leaves a husk; this takes time, so a hunter manages at most one kill every few seconds. Plant cells are cropped a 0.25-energy bite at a time. Bonded bodies are armoured and shrug off some attacks, and an animal hiding among dense producers often escapes.',
  diet: 'The share of energy a species takes from each food. Food is worth its energy × share × 1.5, less for partly photosynthetic species.',
  photosynth: 'Takes energy directly from light. Light is shared: each photosynthesising neighbour shades a cell, so a crowded meadow divides its patch of light among many and a thinned one regrows fast (a bonded body barely shades itself). It needs minerals (silt nearby), and runs faster for anchored cells with current flowing past them. Photosynthesis makes a cell heavy: less thrust, no swimming, worse at eating.',
  grazer: 'Crops photosynthesising cells a bite at a time: the herbivores of this world.',
  scavenger: 'Mostly eats husks: carcasses, dead producers and the dung of eaters.',
  predator: 'Mostly eats flesh: hunts animal cells, and crops plants only reluctantly. A well-fed hunter rests rather than kill (satiety).',
  dung: 'What an eater cannot digest of a meal fills its gut and is dropped as a small olive pellet, a husk the scavengers live on: grazers feed the scavengers this way.',
  cyst: 'A dormant cell. An animal running out of energy with nothing to eat in reach may go dormant: it leaves its body, stops swimming and pulsing, greys and holds still unless jostled, leaking a little energy, and wakes at random, after about 45 seconds on average. Nothing can eat a cyst. Cysts are the seed bank that carries a lineage through hard times.',
  flee: 'Animals that are not hunters swim away from hunters close by, harder the closer they are, if they can swim at all.',
  satiety: 'A hunter attacks animals less the fuller it is, until it holds a little more than it needs to divide: fed hunters rest instead of killing, which keeps them from eating each other out.',
  celltype: 'α, β and γ cells of one species share a genome but each has its own surface and receptor signature, so each type is pulled toward and away from things differently. Types also differ in colour tint, size and shape.',
  bodyplan: 'The long-run mix of cell types a species produces. Each child’s type is chosen by a developmental rule from its parent’s type; this is where that rule settles.',
  stone: 'Bedrock, and the skeletons of calcifying cells. Stone never drifts and the living cannot pass through it. Attacks made from among stone sometimes miss, so prey shelters in reefs, and calcifying cells settle on their own reef while everything else must go around it. Bedrock lasts nearly an hour. A loose grain of reef stone crumbles within minutes, a grain packed into a reef lasts far longer, and a neighbourhood that is mostly reef wears fast, so reefs grow as separate patches and persist only while they are being built.',
  calcify: 'How much of a skeleton a cell lays down. Calcifying costs upkeep. When a settled calcifying cell dies of hunger or old age it may leave stone instead of a husk, far more often beside stone already there, so reefs grow outward from rock and from the rare place one starts. Drifting cells seldom leave stone. Calcifiers can settle on stone; to everything else it is solid.',
  adhesion: 'How strongly cells of one species bond. Above 15%, each cell keeps up to two same-species partners with springs. Empty slots find the nearest neighbours within bond range; children start bonded to their parent if they are the same species. Bonds last until a partner dies, changes kind or stretches too far away. Bonds are the links you see and they hold bodies together. Bonded cells share the cost of living (up to 15% less upkeep), shade each other less and are armoured against attack. They still pay crowding beyond their bond partners, disperse poorly and their inner cells struggle to reach silt to divide. Species without adhesion are single-celled.',
  bond: 'A persistent spring between two cells of the same species. Drawn as a link. It breaks if a partner dies, changes kind or stretches beyond 1.25 times the range at which bonds form. A connected web of bonds is one organism.',
  growth: 'How a bonded species builds its body, inherited and mutated like every other gene. Some grow as trees: each new cell buds from a tip at the angle the plan sets, branching every few cells (alternate, one-sided, opposite or forking), a set number of orders deep, curling or zigzagging as they go, the way filamentous algae, branched cyanobacteria and colonial ciliates grow. The tips are fed by the cells behind them. Others pack into a body as their cells meet.',
  organism: 'A body: all same-species cells connected through bonds. A species only forms bodies if its adhesion is above 15%; otherwise every cell is its own organism, even when the species has several cell types or gathers into swarms. Selecting a cell of a body follows the whole body: if the watched cell dies the watch passes to another of its cells, and if the body splits it follows the larger part.',
  swimming: 'Self-propulsion: a steady push in the direction the cell is already moving. Reduced by photosynthesis.',
  schooling: 'Steering toward the average velocity of nearby cells of the same species. Makes schools and coherent bodies move together.',
  reach: 'How far a cell’s attraction and repulsion forces extend, in micrometres (at most about 60 µm, six cell widths).',
  personalspace: 'The inner part of the reach where any living cell is pushed away. Sets how tightly packed bodies are.',
  thrust: 'How strongly a cell responds to attractions and repulsions.',
  glide: 'How long momentum lasts (the half-life of velocity). Short glide stops quickly; long glide coasts.',
  currentpull: 'How much the ocean currents carry the cell. Low values are anchored: they pay a little upkeep to hold on, but anchored photosynthesisers are fed by the water flowing past. High values drift for free.',
  lifespan: 'Age at which a cell dies of old age.',
  dividesat: 'Energy a cell needs before it can divide: its own threshold plus the energy in its child’s body, and enough to keep the child going for its first minute. It also needs a grain of silt within reach to build the child from, and to be past its youth (a fifth of its lifespan).',
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
  saves: 'A save keeps the whole world: every particle, each species with its name and lineage, the chronicle, the history and the climate’s eras. Saves live in this browser’s storage, which clearing site data erases; download one to keep it safe or to open it on another device.',
  profile: 'Times three seconds of frames on the GPU, pass by pass, and one simulation step, and copies the result with this device’s details: a report of how the page runs here.',
  aimfps: 'The frame rate the page aims for now, and why when it is lower than Target fps: frames running late, the GPU busy for nearly the whole frame, or the device under pressure (hot or busy, where the browser reports it). It first lowers the render scale; below 45 fps each step covers more simulated time, so the world keeps real time. It climbs back after a stretch with room to spare.',
  renderres: 'The share of the screen’s resolution the world is drawn at right now (Scene px). With Render scale on Auto it drops when frames run late and climbs back when there is room.',
  drawms: 'GPU time drawing the world once takes: cells, stone, bloom and the final image. At high speeds it is drawn about thirty times a second.',
  stride: 'How much simulated time each step moves the world forward. Normally a step is 1/60 s, the most exact. When you ask for a speed the GPU can’t reach in steps that small, it takes bigger ones instead, up to 4/60 s. Bigger steps are a little coarser, but births, deaths and the variety of species stay the same over long runs.',
  simrate: 'How fast the world is running right now, as a multiple of real time.',
  deepest: 'The most speciation steps between any living species and its founder.',
  generation: 'How many divisions separate this cell from the beginning of the world.',
  serial: 'Species number (SP): every species is numbered in the order it arose.',
  pid: 'Particle number (ID): every particle keeps its number through every form it takes.',
  depth: 'Δ: how many speciation events separate this species from its founder.',
  touching: 'Other species whose cells sit within bond range of this organism.',
  energy: 'Stored energy. Gained from food or light, spent on upkeep and on building children. A cell starves at zero.',
  origin: 'How this particle came to be what it is now.',
  crowding: 'Packed among more than four of its own kind (bond partners aside), a cell pays extra upkeep: the more crowded, the more.',
  bondthrift: 'Bonded cells share the cost of living: each bond partner takes a little off a cell’s upkeep, up to 15%.',
  lean: 'A cell low on energy slows its metabolism and burns only part of its full upkeep, so it lasts longer between meals.',
  affinity: 'How strongly each of the species’ cell types is drawn toward (warm, +) or pushed away from (cool, −) what it meets within reach: its own cell types, other species and matter. It is read from the cell type’s receptors against the other’s surface signature; −1 to +1. A picked cell’s own type is marked. Diet adds its own pull toward food on top of this.',
  lighthere: 'Light at this cell’s position right now: baseline plus tide, scaled by the season.',
  mind: 'What this cell is doing, read from a replay of its latest decision. A cell has no brain: every frame it adds up the pulls and pushes of everything within reach (its receptors against their surface signatures, appetite for the foods its diet favours, schooling, bonds, stone), moves, then eats, divides or neither. The mode names which pull wins; hover it for the reasoning. The compass draws each pull as an arrow, its length the pull’s strength, with the cell’s heading dashed and its target as a diamond on the rim. The lamps light for conditions that shape what it does. Fleeing is an evolved aversion: no cell knows what a predator is, but lineages whose receptors happened to push them away from their hunters survived.',
  'mind-food': 'Appetite: a hungry cell is drawn toward the foods its diet favours. Flesh-eaters are drawn to animal cells, grazers (and, reluctantly, flesh-eaters) to plant cells, and husk-eaters to husks. It lets living food inside its personal space so it can reach it. A sated cell feels no appetite.',
  'mind-other': 'The pull or push of other species’ cells on this one: its receptors against their surface signatures. Evolved, not chosen: it is how prey comes to avoid hunters and how species come to live side by side.',
  'mind-kin': 'The pull or push of its own species’ cells (beyond personal space and bonds). Attraction gathers swarms and packs bodies; repulsion spreads them out.',
  'mind-matter': 'The pull or push of silt, husks and stone on its receptors (apart from appetite), plus stone’s solid push on any cell but a calcifier.',
  'mind-flee': 'Flight: an animal that is not a hunter swims away from hunters near it, the harder the closer they come and the better a swimmer it is.',
  'mind-gut': 'What it ate but could not digest. When its gut is full it drops it beside a grain of silt as dung: a husk for scavengers.',
  'mind-net': 'Light minus upkeep, per second. Below zero the cell is living on its reserves until it eats.',
  'mind-near': 'Every species with cells within this cell’s reach, its own kind first; a species keeps its row while it stays. Cells: how many are in reach. Role: predator, a species built to catch this one; prey, one this cell is built to eat. The last column is how they pull on this cell: right, drawn toward them; left, pushed away.',
  colonial: 'On average its cells attract each other. In a bonded species this packs the body tight; in a single-celled species the cells gather into swarms without ever joining.',
  solitary: 'On average its cells repel each other, so they spread out (or, if bonded, stretch into strands).',
  looseknit: 'Its cells barely attract or repel each other.',
  morphs: 'A single-celled species whose genome makes more than one cell type. The types never bond into a body: they are separate individuals of one species with different shapes and behaviours, like castes or life stages. Their children can be any type the developmental rule allows.',
  singlecelled: 'Its cells never bond: each one is a whole organism, however closely they crowd. A species bonds into multicellular bodies only once its adhesion passes 15%.',
  anchored: 'Barely moves and holds against the currents: a reef or a mat.',
  drifting: 'Carried by the currents.',
  focus: 'A highlight: everything outside the chosen filter is dimmed in the simulation.',
  links: 'Bonds between cells of one multicellular body. Single-celled species never show links.',
  chronicler: 'The chronicler reads the census and a ledger of who ate whom, how each species died and where it lives, and now and then writes what happened in the log: a death worth remembering and its cause, an arms race, hunters and hunted cycling, a lineage following the water, the last of a guild, what an era or an event did. It speaks only when something notable has happened, a few times an hour at most. Lab → Log → Chronicler shows its entries alone.',
  card: 'A species card: its portrait, sigil, song, lineage and natural history on one image, with the chronicler’s latest line about it. Save it as a PNG, and its song as a short clip. You can give the species a name of your own there.',
  film: 'Records thirty seconds of the view, with the auto camera’s captions and the soundtrack, and downloads it as a video. With the auto camera on it waits for the camera’s next scene and films from its start.',
  autoidle: 'Left alone for a minute (three with a panel open), the camera starts filming the world on its own. Drag, scroll or tap to take it back.',
  renderscale: 'The share of the screen’s resolution the world is drawn at. Auto lowers it while frames run late and raises it again when there is room; a fixed value never changes.',
  autofloor: 'The lowest render scale Auto may drop to.',
  density: 'The most device pixels drawn per CSS pixel. High-density (Retina) screens look sharper at 2× but cost up to four times the pixels of 1×. Readouts and outlines stay sharp either way. While frames run late, Auto render scale drops to 1× first, before the scale or the frame rate.',
  targetfps: 'Frames per second aimed for, as a whole number of the screen’s refreshes so frames stay evenly spaced (60 on a 144 Hz screen is every second refresh, 72 fps). 30 halves the GPU’s work and saves battery; Display follows the screen’s refresh rate (120 on many phones and Macs), which costs the most. Simulated time keeps pace with real time at any rate; when the device can’t keep up the page lowers the rate itself (Aiming for).',
  bloom: 'A soft glow around bright cells. Several extra full-screen passes.',
  optics: 'Microscope optics: depth haze and a vignette over the world. One extra full-screen pass.',
  lod: 'Zoomed in, cells resolve into membranes, organelles and fused bodies, and bonds into soft strands. Off, every cell stays the glowing point it is from afar, at any zoom: far cheaper, so the page can run more particles. The loupe and the live close-up still show the detail.',
  specks: 'The fine suspension that drifts between cells when zoomed far in. Drawn speck by speck; off saves a compute pass and a full-screen pass.',
  closeup: 'The live close-up in the specimen panel: a second, small view of the world drawn every frame.',
  particles: 'Every grain, husk and cell is one particle; their number is fixed for a world’s whole life. Auto measures the GPU and picks the most it can run smoothly. Changing it starts a new world.',
  neighbours: 'In a crowd, the most nearby particles a cell weighs each step. It samples them evenly and counts each for the ones it skips, so crowding and pushes stay right on average; it only picks food and bond partners from those it saw. Fewer runs faster in dense colonies and makes no difference in open water. Takes effect at once.',
  loupe: 'A magnifier that follows the mouse when zoomed out. Clicks inside it select what is under the crosshair.',
  speed: 'Current speed, in micrometres (µm) per second.',
  scale: 'Lengths are in micrometres (µm, a thousandth of a millimetre), taking a cell of ordinary size to be 10 µm across, about the size of a protist. A cell senses and pulls on others at most about 60 µm away.',
  song: 'Every species has its own song, read from its genome. Its surface signature picks the notes, how it lives sets the rhythm, tempo and range (hunters leap in quick clipped figures, drifting photosynths sway through long ones), and its colour picks the instrument. A mutant sings a variation: a few notes moved, or the tune turned upside down, reversed or answered. Its cells sing it as they go, in step if the species schools; a bonded colony adds a second voice.',
  sigil: 'The species’ song drawn as the organism that sings it: one cell per note, in the shape and colour of the cell type that sings it, as large as the note is long and turned by its pitch, packed in the order they sing as a colony grows. Cells are bonded only if the species bonds.',
  instrument: 'The instrument a species sings with: its family follows how it lives, its exact voice and timbre its colour.',
  register: 'How high the species sings. Free-floating photosynths and scavengers sing high, hunters low.',
  tempo: 'How quickly its song moves, from how fast and how hungrily it lives.',
  audioload: 'How much of its time the soundtrack’s audio thread spends rendering. Near 100% it would crackle, so above about 50% fewer notes may sound at once and the oldest fade out early.',
  songmarks: 'A faint ring spreads from a cell each time it sings its species’ note: for the picked species only, or for every species. Needs sound on.',
  diversity: 'Effective number of species: exp of the Shannon entropy of species populations. A world of 10 equally common species scores 10.',
};

const t = (term, label) => `<span class="term" data-tip="${term}">${label}</span>`;

export const GUIDE = [
  {
    id: 'overview', title: 'What you are looking at', short: 'Overview',
    html: `<p>Tidemote is a sealed world on the surface of a torus: what leaves one edge enters the opposite one. Every point is one particle, and the total number never changes. Particles only change form: inert ${t('silt', 'silt')}, living cells, dead ${t('husk', 'husks')}, and ${t('stone', 'stone')}: the world's bedrock and the reefs that calcifying cells leave behind.</p>
<p>Energy is the only thing that enters and leaves. It arrives as ${t('light', 'light')}, brightest in the bands of the ${t('tide', 'Tide')}, and as the heat of oxidising ${t('framboid', 'framboids')}. The energy cells spend on ${t('upkeep', 'upkeep')} becomes heat that warms their own ${t('water', 'water')}, spreads, drifts on the currents and is lost to the deep; husks rot. Everything you see grows out of a handful of local rules applied to every particle 60 times a second.</p>`,
  },
  {
    id: 'cycle', title: 'The matter cycle', short: 'Matter',
    html: `<ol class="steps">
<li><b>Feeding.</b> Photosynthetic cells drink ${t('light', 'light')}; others eat plants a bite at a time, husks, or other cells (${t('flesh', 'flesh')}), according to their ${t('diet', 'diet')}. Eaten husks turn into silt; a killed cell becomes a husk, and what an eater cannot digest it drops as ${t('dung', 'dung')}, another husk. Cells stop feeding once they have enough energy to divide.</li>
<li><b>Division.</b> Once its energy passes its ${t('dividesat', 'division threshold')} and a grain of silt lies within about 15 µm, a cell turns that grain into its child and hands over a ${t('childshare', 'share')} of its energy. Every child is built out of silt.</li>
<li><b>Mutation.</b> Each division has a small chance of founding a new species with a nudged genome.</li>
<li><b>Death.</b> At zero energy (starvation) or at its ${t('lifespan', 'lifespan')} a cell becomes a husk carrying leftover energy. Husks decay and crumble into silt. A settled ${t('calcify', 'calcifying')} cell may leave ${t('stone', 'stone')} instead, mostly beside stone already there; stone wears back into silt over minutes.</li>
<li><b>Dormancy.</b> An animal running out with no food in reach may go dormant as a ${t('cyst', 'cyst')}, and wake later.</li>
<li><b>Sparks.</b> Occasionally silt in the light sparks into a completely random new species (${t('abiogenesis', 'abiogenesis')}), so life can always restart.</li>
</ol>`,
  },
  {
    id: 'climate', title: 'Tides, light, seasons and eras', short: 'Climate',
    html: `<p>The ${t('tide', 'Tide')} is four slow waves summed over the torus; where they add up, bright bands form and drift. Inside a band it is bright; outside, it is dim but never dark. ${t('light', 'Light')} is what plants feed on: it is dim everywhere and brighter in the bands, and plants crowded together share it, so meadows bloom under a passing band and thin out behind it, and their grazers follow.</p>
<p>The ${t('season', 'season')} is a 5-minute cycle that swings tide strength between 10% and 100%. This is the Tide percentage shown in the gauge and graphs. The bands keep their shape; only their strength changes. At high tide they are bright and the water is a little warmer. At low tide they fade until they are barely brighter than the rest of the world. This drives the regular booms and busts. Every 10–18 minutes an ${t('era', 'era')} begins: the baseline light changes, one tide wave is replaced so the bright zones form and move differently, and two current patterns are swapped. The water’s temperature walks from era to era, so each world has its own thermal history; eras that warm or cool it a lot are named for it, otherwise era names are random labels, and the event log says what actually changed.</p>
<p>Tap a gauge to map what it reads: <b>Light</b> opens the light map, <b>Temp</b> the thermal camera and <b>Tide</b> the ${t('tidemap', 'tide map')} (on phones, tap the era name). The map's name and scale float in a bar under the top rail, beside any highlight; close either one on its own, and Esc clears the highlight first, then the map.</p>
<p><b>Settings → Light map</b> colours every point by the light a photosynthesising cell would receive there, with a contour every 10%; <b>Settings → Currents</b> draws the flow that carries silt and drifting cells. The <b>Tide</b> gauge at the top follows the season: the dot rides the 5-minute wave, and the <b>Temp</b> thermometer beside it shows the background temperature, with an arrow while it changes; it breathes during a heat wave or cold snap.</p>`,
  },
  {
    id: 'heat', title: 'Heat', short: 'Heat',
    html: `<p>The water has a temperature, and most of its warmth comes from life. Every unit of energy a cell spends on ${t('upkeep', 'upkeep')} becomes heat in its water, so crowds, bodies and reefs sit in warm patches of their own making. Heat also comes from sunlight (a little), from rotting carcass piles, and from ${t('framboid', 'framboids')}: grains of pyrite that crystallise in those piles and warm their water as they burn out over a few minutes, so a die-off leaves a warm oasis behind it for a while. Heat spreads a few cells, rides the currents (warm water trails downstream of a bloom) and relaxes toward the climate's ${t('water', 'background')} within about half a minute. Stone holds heat: reefs and bedrock warm and cool slowly.</p>
<p>Each species prefers a temperature (its ${t('optimum', 'optimum')}) and stands only so much either side (its ${t('tolerance', 'tolerance')}). How well it ${t('thermal', 'works')} falls off slowly in the cold and steeply in the heat, and narrow specialists work best of all at their optimum, so small differences in warmth matter. Swimmers steer toward water that suits them (${t('thermotaxis', 'thermotaxis')}). Far too cold, a cell goes ${t('torpor', 'torpid')}; far too hot, it bleaches and may ${t('scalding', 'scald')}.</p>
<p>${t('heatmaker', 'Heat-makers')} burn extra energy to warm themselves and their water. In a cold era their colonies are lifeboats where life keeps moving and singing while the world around it goes still; in a ${t('heatwave', 'heat wave')} they overheat from the core outward. Warm water also rots husks faster, so cold eras favour scavengers and warm ones recycle matter quickly.</p>
<p><b>Settings → Heat map</b> (E): <b>Shimmer</b> makes warm water waver as if seen through rising heat; <b>Full</b> is a thermal camera with an isotherm every 2°. Framboids show as brassy beaded spheres, faintly glowing while they burn.</p>`,
  },
  {
    id: 'pool', title: 'The pool and its events', short: 'Pool',
    html: `<p>The world is a shallow pool under a microscope, a few millimetres to a couple of centimetres across. Its floor has relief: some eras the water stands low and the highest ground shows as islands and sandbars. Now and then, about once an hour of world time, the pool suffers an ${t('poolevents', 'event')}, announced in the log and on screen:</p>
<ul>
<li><b>${t('evdrought', 'Drought')}.</b> The water falls until much of the floor lies dry and the pool parts into separate pools. The receding edge sweeps cells along and piles them at the waterline; the mud pales and cracks into plates as it dries. Then rain falls, staining the mud dark drop by drop until it is wet all over, refills the pool, and the resting cells hatch.</li>
<li><b>${t('evstorm', 'Storm')}.</b> Cold rain under cloud. Raindrops ring the surface, their ripples bending the view of what lies beneath, and shove the water and what floats in it.</li>
<li><b>${t('evduckweed', 'Duckweed')}.</b> A few fronds of duckweed float out of focus far above, a mother and the daughters budding from it, drifting slowly and shading the water under them. Each hangs a root down through the water, blurred near its frond and sharp at its tip.</li>
<li><b>${t('evfrost', 'Frost')}.</b> A cold night chills the water to near 0° and ice grows over the pool as a mass of small crystals, from the shallows and from scattered seeds, pushing cells into the veins of water between them; then it thaws.</li>
</ul>
<p>Cells stranded on dry mud or caught in ice cannot swim or feed. They show ${t('cystdry', 'dried or frozen')}; most rest as ${t('cyst', 'cysts')} and wait, losing energy very slowly, and the rest starve. The water's edge pulls cells near it back in. After each event the log tallies how much life and how many species it cost. Rain wakes cysts fast, so a drought ends in a burst of hatching.</p>
<p><b>Settings → Climate</b> turns the events off, or each kind on its own, and can start one now.</p>`,
  },
  {
    id: 'cells', title: 'Cells, cell types and bodies', short: 'Cells',
    html: `<p>Each species has one genome. A genome describes up to three ${t('celltype', 'cell types')}, α, β and γ. Each type carries two 8-number signatures: a <b>surface</b> (how it appears to others) and a <b>receptor</b> (how it reacts). The pull of cell A on cell B is A’s receptor combined with B’s surface: above zero means attraction, below zero means repulsion. Silt and husks have surfaces too, so a cell type can be drawn toward silt or repelled by husks.</p>
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
<li><b>${t('phototaxis', 'Phototaxis')}</b>: in species that have it, a push up the light's slope (or down it).</li>
<li><b>${t('glide', 'Glide')}</b>: how long momentum lasts.</li>
<li><b>Currents</b>, scaled by ${t('currentpull', 'current pull')}.</li>
</ul>
<p>There is no pathfinding and no sense beyond about 60 µm, six cell widths, except for which way the light and the warmth grow. Roamers are swimmers that travel until forces bend their path. Self-propelled bodies come from chases between cell types: if β is drawn to α while α pushes β away, β chases α forever and the body drives itself forward. Evolution keeps whichever pulls lead to food.</p>`,
  },
  {
    id: 'ecology', title: 'Ecology', short: 'Ecology',
    html: `<p>Producers are photosynths, anchored colonies and free-floating drifters alike. Consumers are grazers that crop them, scavengers of husks and dung, and predators. Every world founds each of these niches at least twice. Several pressures shape which forms thrive:</p>
<ul>
<li>Crowding: cells packed among their own kind sicken (a body’s bond partners do not count), so clonal blobs and sprawling bodies break up and species mix.</li>
<li>Grazers crop the plants, predators thin out the grazers, and scavengers live off the husks and ${t('dung', 'dung')} both leave behind. Plants share the light, so a grazed meadow regrows.</li>
<li>Prey ${t('flee', 'flee')} their hunters and hide among dense producers; well-fed hunters rest (${t('satiety', 'satiety')}), so they do not eat each other out.</li>
<li>Catching takes skill: cells catch living prey in proportion to how well they are built to eat it, so photosynthesisers and husk eaters rarely kill.</li>
<li>Hunters and grazers get good at catching what they caught last and often miss unfamiliar prey, so booming species feed their predators and rare ones are spared.</li>
<li>Anchored photosynths thrive where currents run strong; drifting ones where they are calm. Bonded bodies live cheaply and resist attack but disperse poorly.</li>
<li>Heat links species that never touch: a heat-maker's colony warms its neighbours, helping the warmth-lovers among them and driving the cold-lovers away, so species sort into thermal territories of their own making.</li>
<li>The climate keeps changing which strategy pays, and its temperature walks, so the lineages that track it and those that hide in refuges trade places.</li>
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
<li><b>Colour</b>: the species, tinted per cell type. Related species share hues. Brightness shows stored energy; newborns flash; some lineages pulse. Heat-stressed cells bleach toward pale bone, torpid ones dim to a cold blue and stop pulsing, and heat-makers glow faintly warm.</li>
<li><b>Shape</b>: disc, ring, star, nucleus or diamond, a lineage marker per cell type. Husks are dim brown rings, dung smaller olive pellets, silt is faint slate. A dormant ${t('cyst', 'cyst')} is greyed and still.</li>
<li><b>Links</b>: ${t('bond', 'bonds')} within one multicellular body.</li>
<li><b>Census</b>: the bar splits every particle between living cells, husks, stone and silt. The chart below it stacks living cells by species in their colours (point at a band to name its species, click to open it); the pale top band is life in species too small to list, and dotted lines mark new eras.</li>
<li><b>Scale</b>: the ticks above the controls are round lengths in ${t('scale', 'micrometres')} (millimetres, zoomed out); the bar at the right says how long.</li>
</ul>`,
  },
  {
    id: 'tools', title: 'Research tools', short: 'Tools',
    html: `<ul>
<li><b>Specimen</b> (click or tap a particle): a live close-up, its energy and age, then one scroll of sections (the bar above them jumps between them): its behaviour, its body and record (its organism traced through its bonds, highlighted and followed as a whole, even after the cell you picked dies), its species and its full genome. Species names everywhere are links.</li>
<li><b>Lab → Species</b>: every species, filtered by status, diet, movement and body. <b>Highlight these</b> dims everything outside the filter.</li>
<li><b>Lab → Lineage</b>: the lineages that held the most life, as a plot of their cells over time (each nested inside the lineage it branched from, so a die-off shows as the whole stack falling) over a tree of the same lineages. A lineage follows a population through species after species; every other species counts with its nearest shown ancestor, and its pill says how many species it holds. Drag across the plot to zoom into a stretch of time, or click a pill to follow that lineage: finer lineages appear as you narrow in, down to single species.</li>
<li><b>Lab → Census</b> (the Lab's first section, the column on the left; fold it away from its header or with K): the world broken down by matter, diet, movement, body, cell type and condition, the chart of living cells by species, and the latest log entries. Choose a row to highlight it.</li>
<li><b>Lab → Charts</b>: population, diversity, births, deaths, meals and climate over time, and the eras so far. Point at a chart (or tap it) to read every line at that moment; point at a dot in Thermal niches to name its species, and click it to open it.</li>
<li><b>Lab → Log</b>: every logged event, searchable. The ${t('chronicler', 'chronicler')}’s stories, written now and then when something notable has happened, show in a warmer colour; Chronicler shows them alone.</li>
<li><b>Card</b> (in the specimen panel): a ${t('card', 'species card')} to save and share, where you can also name the species.</li>
<li><b>Film</b> (R): ${t('film', 'thirty seconds')} of the view as a video, captions and soundtrack included.</li>
<li><b>Auto</b>: the camera films the world on its own, with captions saying what it is showing; it also takes over after a minute alone (switch that off in Settings).</li>
</ul>`,
  },
];
