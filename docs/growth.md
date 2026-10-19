# Growth plans: bodies that grow as trees

Bonded species used to grow as packed bodies, closing triangles wherever their cells met. A growth plan
(`K.grow`) lets a species grow instead the way filamentous algae, branched cyanobacteria and colonial
protists do: cell by cell from its tips, each new cell at an angle set by its genes. The plan is
inherited and mutates like every other gene, so worlds grow filaments, fronds, forks, zigzags and the
odd ring, and lineages drift between them.

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
- **Trees can snap.** `snap` (off by default) makes each of a tree's cells let go of its mother at that
  rate per second, scaled 5x either way by a toughness gene (form.x), as cyanobacteria shed hormogonia.
  At .003 it cut every tree to 2-8 cells. With it off, trees still break where grazers bite through
  them or bonds stretch past `bondBreak`.
- **Mats remain.** Whether a species grows as a tree is a gene like the rest (at the start: most filaments,
  over half of reef plants, a third or so of animals); the others grow packed bodies as before, and a
  lineage can switch either way by mutation.
- **Drawing.** A tree's cells face along their branch, away from their mother (`bodyDirection`), so a
  filament reads as one strand.

## Swimming

A thin body slips along its length more easily than sideways (about twice, for real microorganisms:
resistive force theory). A tree's cells feel `sideDrag` times as much drag across their branch as along
it, so a wave run down a tree pushes it through the water, head first. Three beat genes (amplitude,
frequency, wavelength) drive the wave as a muscle's push on each bend in turn (`beatDrive`, scaled by the
square root of the cell's drag time; a bend already folded past 1.2 radians is not pushed). Beating costs
upkeep (`beatCost` × amplitude × frequency) and only a tree beats. A fourth gene lets an animal colony grow
from its tips without growing up first (`growTipA` seconds), so it can grow long enough to swim: a
two- or three-cell colony is one hinge and cannot swim at all. A tree's cells skip kin alignment, which
damped the wave.

At these settings a tadpole (tip growth and a beat) swims about as fast as a single swimmer. In 32-world
screens, tadpoles were 30% of hunters without the push (riding on tip growth) and 38% with it, so the
swimming itself pays; with tips budding as fast as a plant's then, tip growers took two thirds of
hunters, and `growTipA` 10 keeps them a minority (tadpoles under a fifth of hunters, dominant in a few
worlds).

## Measurements

Body types are scored by `tools/mix.mjs` against target bands for a pond-like mix (`src/bodies.js`
classes every living cell's body; headless runs sample it each minute, `tools/bodies.mjs` reads a
saved world): single cells 60-85%, packed bodies 5-20%, trees 5-20%, trees of 6+ cells (visible)
2-12%, and a tree of 20+ cells in at least 30% of worlds. 24 worlds × 30 min at 32k:

| | snap .003 | + feed cap | + treeAge .25 | + snap 0 (default) |
|---|---|---|---|---|
| single cells | 76% | 75% | 74% | 75% |
| visible trees | 0.3% | 0.8% | 1.3% | 3.1% |
| worlds with a 20+ cell tree | 0% | 4% | 25% | 75% |
| largest tree (median) | 10 | 11 | 17 | 34 |
| trees among producers | | 29% | 35% | 17% |
| all four guilds at 30 min | 83% | 63% | 83% | 79% |
| thriving | 54% | 42% | 54% | 50% |
| worlds in every band | 0 | 0 | 1 | 7 |

With normal aging and snap 0, tips budding at a quarter of the wait (`growTip` .25) also hit the
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
