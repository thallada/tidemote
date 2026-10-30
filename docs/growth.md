# Growth plans: bodies that grow as trees

Bonded species used to grow as packed bodies, closing triangles wherever their cells met. A growth plan
lets a species grow instead the way filamentous algae, branched cyanobacteria and colonial
protists do: cell by cell from its tips, each new cell at an angle set by its genes. The plan is
inherited and mutates like every other gene, so worlds grow filaments, fronds, forks, zigzags and the
odd ring, and lineages drift between them.

The on/off switches named below (and the alternatives they chose between) were removed when this work
merged to main: these rules are now always on, and only their strengths remain tunable.

## Biology

Branching from the tips at a set interval and angle is how most branched microscopic algae build
themselves: *Cladophora* (alternate and one-sided side branches), *Stigeoclonium* and *Draparnaldia*
(whorls and tufts), the forking (dichotomous) *Dictyota* and coralline algae. Cyanobacteria grow chains
(*Anabaena*, *Nostoc*), coils (*Spirulina*) and true branches (*Stigonema*); colonial diatoms grow stars
(*Asterionella*) and zigzags (*Tabellaria*); colonial ciliates (*Zoothamnium*, *Carchesium*) and
choanoflagellates grow branched stalks, chains and rosettes. A grazer cropping a filament breaks it into
pieces that grow on, which is how many of these algae spread. Sugars flow toward a plant's growing tips,
and a filament reaches more water and light per cell than a ball does.

## The rules

- **The plan.** Six genes in the developmental matrix's spare bytes (`growOf` in `src/shaders.js`;
  `growPlan` in `src/genome.js` reads them on the CPU): whether the species grows as a tree; the angle its
  branches leave at (14-120°); every how many cells along an axis it branches (0: a plain filament); its
  curl (a turn every cell, mostly small: spirals, arcs, rarely a closed ring); the pattern (alternate,
  one-sided, opposite, forking, or alternate with the curl changing side cell by cell: a zigzag); and how
  many orders of branches branch again (0-3). Only bonded species (adhesion above `adhMin`) use it.
- **Bonds.** A tree's cell keeps one bond, to its mother (set at birth). It never takes up strangers or
  closes triangles, so its body is its family tree. A cell that dies splits the tree; each piece grows on.
- **Where a daughter grows.** Each cell knows the turn it grew at (straight, left, right) and its branch
  order, in the info word's top four bits (the generation keeps twelve). A cell lacking a daughter its plan
  wants buds her at that turn from its own heading (from its mother to it; a root's from its first
  daughter), touching it. Its own kind in the way stops it; other species are shoved aside.
- **Holding the shape.** A tree bends like a stem (`bendOn`): at each cell the angle from its arm (its
  mother, or a root's first daughter) to each other daughter is held at the plan's, with pushes on all
  three cells that sum to nothing and turn nothing (`growStiff`, relative to the bonds' pull). Pulling only
  the daughter toward her angle, as the first version did, let long trees drive themselves into thrashing.
  Kin signature forces are off between a tree's cells: the shape is its bonds'.
- **Feeding the tips.** A tree's cells (plant or animal colony) do not even out their energy (`bodyShare`). A cell whose daughters
  are all grown passes its surplus over half its division energy on to them (`growFeed`); mother and
  daughter reckon the flow alike from the step's start, so no energy is made or lost. Only a daughter
  short of twice a division's energy is fed: without that cap a tip hoarded a hundred times what it
  needed while the cells below it starved and were grazed through, and trees broke at the base.
- **Grown cells age slowly.** A tree's cell that has grown its daughter ages at `treeAge` (0.25) the
  rate of a free cell, as the old cells of a real filament live on in it. At the normal rate, old age
  cut every tree down near ten cells.
- **Tips grow up like any cell.** A tree's tip is always its youngest cell, and it waits to grow up
  (`mature`) before budding, as every cell does before dividing. An early version let a plant's tip bud
  every 3 s instead: trees then outgrew single cells five- to twentyfold and took 87-91% of producers.
  With the same wait they settle near a third, a feature among mostly single cells, as in real water.
- **Trees break where they are bitten.** They break where grazers bite through them or a bond stretches
  past `bondBreak`. A random snap (each cell letting go of its mother at a set rate, scaled by a
  toughness gene, as cyanobacteria shed hormogonia) cut every tree to 2-8 cells at .003 and was removed.
- **Mats remain.** Whether a species grows as a tree is a gene like the rest (at the start: most filaments,
  over half of reef plants, a third or so of animals); the others grow packed bodies as before, and a
  lineage can switch either way by mutation.
- **Drawing.** A tree's cells face along their branch, away from their mother (`bodyDirection`), so a
  filament reads as one strand.

## Swimming

A thin body slips along its length more easily than sideways (about twice, for real microorganisms:
resistive force theory). A tree's cells feel `sideDrag` (5) times as much drag across their branch as along
it, so a wave run down a tree pushes it through the water, head first, opposite to the wave. Three beat
genes (amplitude, frequency, wavelength as phase per cell) set the wave; beating costs upkeep
(`beatCost` x amplitude x frequency). A fourth gene lets an animal colony grow from its tips without
growing up first (`growTipA` seconds), so it can grow long enough to swim. A tree's cells skip kin
alignment, which damped the wave.

### Why tadpoles wiggled in place (2026-10-20)

The first version drove the wave as a push on each bend (`beatDrive`). Three things held tadpoles in place:

- **Long waves never formed.** A bend's push moves its three cells, which bends the bends beside it the
  other way, so a wave is resisted in the fourth power of its length. Measured alone in still water
  (`tools/swimlab.mjs`), a 12-cell filament with a long wave (0.6 rad of phase per cell, amplitude 0.1-0.4,
  1.5 Hz) flapped its two ends in step and barely bent in the middle (bend swing 0.07 rad at the ends, 0.01
  in the middle, no phase lag cell to cell): 0.004-0.065 units/s. Stiffer bends would carry it, but past
  `growStiff` ~20 a 1/60 s step goes unstable (bending's zigzag mode is ~130 times stiffer than such a
  wave). Short waves (1 rad per cell and up) did travel, and swam about as fast as the muscles below do.
- **Hard beats tore bodies apart.** The push folded bends past a radian and stretched the soft bonds; in
  coarse steps (every world's first two minutes at Max, and every fast-forward) 6-7 of the 16 strong
  beats (amplitude 0.35-0.5) in the grid below broke the body, and on the page a 1.5 Hz filament broke into pairs within
  seconds even at real time (`runs/swimlab/before-after.mp4`).
- **So in worlds, beating colonies were stubs.** In four 16k worlds (15 min, from 5 min on), cells in
  beating bodies of 2-3 cells were as common as those in bodies of 4-5; a two- or three-cell body is one
  hinge and swims not at all (head-first speed ~0 in `runs/crowd/swim.mjs`).

In the same four worlds with the muscles below, beating bodies kept together (the longest averaged 14
cells against 11) but were rarer: 0.9% of the living against 2.5% (four worlds are few; GPU runs diverge).

### Muscles on the bonds

The beat is now carried bond by bond (`beatPull` in `src/shaders.js`). Each cell's lateral speed across its
branch is a travelling cosine (amplitude: a heading swing of `beatGain` x the amplitude gene, at most
`beatTop` units/s per unit of size); each bond's two cells are brought a share `beatMix` a step toward the
relative velocity their two speeds ask across the bond, and otherwise toward each other's motion, in
equal and opposite halves. The body cannot push itself: only the anisotropic drag turns the wave into
thrust. A long wave now travels as readily as a short one (a velocity relaxed between neighbors is a
second-order problem, not bending's fourth), the commanded phase per cell shows up exactly in the bends,
and a beating tree's bonds pull `treeBond` (3) times as hard, since a fast beat swings the tip cells hard
enough to stretch soft bonds. Non-beating trees are untouched (bends, tissue mixing and bonds as before).

`tools/swimlab.mjs` builds one body cell by cell in an emptied world (silt heaped far off, no currents,
tides or other life, upkeep off), runs it, and compares its speed with what resistive force theory
predicts from the same motion (the rigid velocity that leaves zero net drag force and torque on its
cells): a body that waves well but moves less than that loses thrust somewhere other than the water.

The same genes run on both versions (filaments of 6 and 12 cells; amplitude 0.2, 0.35, 0.5; 1 and 2 Hz;
0.4-1.3 rad per cell; `runs/swimlab/grid`) swim about as fast on average, the old faster at 1 Hz with
short waves and the new at 2 Hz and long waves, and the new holds every body in coarse steps:

| mean speed (units/s), 24 genes each | old | new | bodies broken, old / new |
|---|---|---|---|
| 6 cells, 1/60 s steps | 0.075 | 0.073 | 0 / 0 |
| 6 cells, 4 ticks | 0.081 | 0.065 | 6 / 0 |
| 12 cells, 1/60 s steps | 0.086 | 0.080 | 0 / 0 |
| 12 cells, 4 ticks | 0.074 | 0.065 | 7 / 0 |

A 12-cell filament at amplitude 0.5, 1.5 Hz, 1 rad per cell makes 0.19 units/s (0.077 body lengths a
beat), 79% of what resistive force theory predicts from its own motion, the wave lagging 1.0 rad a cell
as asked (at `beatGain` 3 and `sideDrag` 3, the first settings).

**Faster (2026-10-21).** How fast swimming goes is set by `beatGain` and `sideDrag`, now 6 and 5: a
heading swing of 6 x the amplitude gene (capped by `beatTop`), and a water five times as stiff across a
branch as along it (real microorganisms: about 2; a thicker, more snake-like water here so a beat pays).
An 8-cell filament then makes 0.11-0.42 units/s (6- and 12-cell ones made 0.05-0.19 at 3 and 3), none broken at 1/60 s
steps or 4 ticks; coarse steps keep 60-85% of it, the fastest beats (3 Hz) less. Gates, 64 worlds x 30 min
at 32k on two machines (`tools/farm.mjs`), each against the old settings on the same seeds:

| vs `beatGain` 3, `sideDrag` 3 | late guilds | late eff. species | food web | spread |
|---|---|---|---|---|
| 1/60 s steps: control | 3.39 | 102 | 0.94 | 0.66 |
| `beatGain` 4, `sideDrag` 4 | 3.45 | 109 | 0.92 | 0.68 |
| `beatGain` 5, `sideDrag` 5 | 3.48 | 115 | 0.94 | 0.65 |
| `beatGain` 6, `sideDrag` 5 (default) | 3.61 | 113 | 0.92 | 0.60 |
| 4 ticks: control | 3.38 | 110 | 0.92 | 0.65 |
| `beatGain` 5, `sideDrag` 5 | 3.34 | 108 | 0.95 | 0.66 |
| `beatGain` 6, `sideDrag` 5 (default) | 3.38 | 105 | 0.92 | 0.64 |

Every gated metric came out the same (Holm-corrected p >= 0.49); the swimmers' shares barely moved (cells
in beating or tailed bodies 3.8% of the living vs 3.7%; tadpoles 8.4% of predators either way).

A branched tree beats along every branch and swims a third as fast as a filament of as many cells (its
side branches push sideways and drag). Single swimmers make 0.1-0.35 units/s.

### Coarse steps

A coarse step holds its partners' velocities for its ticks, so one 1/60 s step's muscle share applied
over four ticks would overshoot the bonds' stiffest (zigzag) mode, and a bend's push held for the step
goes unstable once the beat drives the bends. So a coarse step pulls a smaller share (`beatMixC`), asks
for a larger swing (by how much less of the wave its ticks' drag leaves standing, fitted with the swim
lab), bends a beating tree afresh each tick from where its partners are going, more softly
(`beatBendC`), and lets a joint's muscle go slack once the joint is stretched past 1.3 times its rest.
Measured at 4 ticks against 1/60 s steps (same genes): 0.17 vs 0.19, 0.08 vs 0.10, 0.10 vs 0.11 units/s;
the fastest beaters (2.5-3 Hz, large swings) make about half their 1/60 s speed, held back so they stay
whole.

## Tails

A packed body (a mat or a clump, not a tree) can grow tails, as a colonial protist grows flagella or a
mat of cells puts out a beating filament. Two genes (`tail` in the genome): how readily a bud at the
body's edge starts a tail, and how long one grows (3 to `tailMax` cells). A cell of a body bearing tails
that buds with a partner held, nothing of its kind in the way ahead and no tail of its kind within
`tailSpace`, starts one with chance `tailOdds` x the gene: the daughter is a tail's base, a tree cell of
branch order 2 (generation 0), budded straight out. A tail grows from its tip, straight, as an animal
colony's tips do (`growTipA`), to its length, and beats with the species' beat genes; a tailed founder
always has a beat.

The tail's base is held to the body by an ordinary bond and bend that the body's cell reckons from its
side exactly as the base does (`tailBases`), and the body and its tails neither pull on each other by
their signatures nor share motion as tissue, so a body cannot push itself through its tail: only the
tail's beat in the water moves it. Thrust grows with the tail's length and beat and is spent on the
whole body's drag, so a small body with a long fast tail travels and a large one with a stub barely
moves. A tail beats `tailGain` (1.3) times as hard as a tree would, since it drives its whole body
(docs/fast-forward.md). Measured in the swim lab before that, and before bonds pulled only both ways (1.5 Hz, amplitude 0.5, 1/60 s steps; mats laid out as hexagonal
patches with the tail at the edge):

| body | tail | units/s |
|---|---|---|
| 7 cells | 8 cells | 0.085 |
| 19 cells | 4 | 0.032 |
| 19 cells | 8 | 0.049 |
| 19 cells | 12 | 0.080 |
| 19 cells | 16 | 0.095 |
| 37 cells | 8 | 0.025 |
| 37 cells | 16 | 0.059 |
| 19 cells | two of 8, on opposite sides | 0.005 |

At 2.5 Hz the same bodies are 20-60% faster. In one 16k world, bodies with tails held 7-8% of the living
after 15 minutes, still rising; the census counts them (`tailed` in `src/bodies.js`, `tailed` among the
guild traits in `src/ecostats.js`).

## Measurements

Body types are scored by `tools/mix.mjs` against target bands for a pond-like mix (`src/bodies.js`
classes every living cell's body; headless runs sample it each minute, `tools/bodies.mjs` reads a
saved world): single cells 60-85%, packed bodies 5-20%, trees 5-20%, trees of 6+ cells (visible)
2-12%, and a tree of 20+ cells in at least 30% of worlds. 24 worlds × 30 min at 32k:

| | snap .003 | + feed cap | + treeAge .25 | + no snap (default) |
|---|---|---|---|---|
| single cells | 76% | 75% | 74% | 75% |
| visible trees | 0.3% | 0.8% | 1.3% | 3.1% |
| worlds with a 20+ cell tree | 0% | 4% | 25% | 75% |
| largest tree (median) | 10 | 11 | 17 | 34 |
| trees among producers | | 29% | 35% | 17% |
| all four guilds at 30 min | 83% | 63% | 83% | 79% |
| thriving | 54% | 42% | 54% | 50% |
| worlds in every band | 0 | 0 | 1 | 7 |

With normal aging and snap 0, plant tips budding at a quarter of the wait also hit the
tree bands but grew 52-cell median giants; with snap .001 as well, trees took 43% of producers.

Before the feed cap (plant tips grow up first, trees snap, swimming), against growth off:

| | growth off | now |
|---|---|---|
| trees among producers | 0 | 32% |
| living fraction late | .30 | .32 |
| all four guilds at 30 min | 81% | 79% |
| thriving (all four guilds at 5%+) | 47% | 54% |
| leader changes per run (grazers, hunters) | 7.8, 7.7 | 9.4, 8.6 |
| modal outcome (gate ≤ .5) | .31 | .33 |
| tadpoles among hunters | 0 | 8% |

The rest of this section is from the first version, whose plant tips budded every 3 s:


32 worlds × 30 min at 32k unless noted, against the same seeds without growth (`grow: 0`).
Producer swing and takeovers come from the regional dynamics scorer (per region-hour).

| | without | with |
|---|---|---|
| all four guilds at 30 min (64 worlds, animal colonies sharing evenly) | 82% | 88% |
| all four guilds at 30 min (animal colonies fed at their tips: the default) | 81% | 91% |
| thriving (all four guilds at 5%+) | 47% | 53% |
| living fraction late | .30 | .52 |
| worlds dipping below 5% living after 5 min | 11% | 6% |
| booms and crashes per region-hour | 17 / 17 | 17 / 17 |
| producer swing | 1.14 | .82 |
| all four at 60 min (60-min runs) | 63% | 72% |
| 4-tick steps (16 worlds): food web, effective species | 81%, 91 | 94%, 104 |

Growth keeps the boom-and-bust (booms, crashes and turnover per region about the same) while fewer
worlds lose a guild or crash to near empty. With the first, one-sided angle spring, `growStiff` 1 let shapes sag into blobs and 12 held them but
made long trees thrash; the bending form at 2 holds them with about a quarter of the internal motion
(`runs/crowd/thrash.mjs`: rms speed of cells relative to their body, 10-24-cell plant trees .17 → .04). Trees for every species with fed animal colonies at stiffness 12 but without plants'
tips waiting less made hunters dominate (27%) and calmed producers too much (swing .67). A tree costs about 4% more per living cell in `lifeMain`; step time
is unchanged.
