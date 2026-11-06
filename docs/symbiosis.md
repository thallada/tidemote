# Grafts: symbiosis and parasitism from one rule (2026-11-05)

docs/next-level-2026-10-20.md §4.1 built, more simply: a bond between two species. Until now every relationship
between species was a meal or a shove; a bond joined only cells of one species. A graft is a bond one cell keeps to
a cell of *another* species, and energy runs along it. Out of that one rule come parasites (a grafter draining a
richer host), passengers (a grafter that pools its fortunes with its host's, as a body's cells do), lichen-like
crusts of two colors moving as one, and hosts that escape by evolving surfaces their grafters no longer fit.

## The gene

`graft` is the genome's last float (`tail.w`, word 55; it was spare and always written 0, so every older save and
card loads as a world without grafts: no format change). 0..1:

- past `K.graftMin` (0.15) the species grafts;
- its strength is also how hard the grafter draws on its host (below);
- it costs upkeep, `K.graftCost` (0.004/s at a full gene, as adhesion's 0.004).

A spark of life grafts one time in `K.graftFound` (12%, drawn last so every other gene's draw is as before;
`randomGenome` mirrors `randomInto`). Mutation drifts the gene where it is had (`gauss · m · 0.15`) and gains or
loses the habit now and then (`m · 0.06`: about one mutant in 70), as tails and phototaxis do (`mutateLike`
mirrors it). Designed founders never graft.

## The rule (`src/shaders.js`)

- **Formation.** In its scan a grafter (`graftOn`) holding no graft notes the nearest cell of another living, waking
  species within bond reach (`linkR`) whose surface its receptors fit past `K.graftFit` (0.2: the same affinity, `a`,
  that its particle-life pull on that cell uses). After the scan it takes that cell into a free bond slot, if the
  cell holds no other graft (`guarded`) and keeps more than `graftRoom` (2) of its bonds back free for its own kind
(a host's body is not torn apart by its grafters). Adhesion is not needed (a single-celled grafter grafts);
  a tree's cells bond only by plan and never graft. A cell holds at most one graft (`grafted`).
- **Holding.** `keepBond` keeps a bond to another species while either end grafts and fits the other
  (`graftHolds`: grafter's receptors against the other's surface, as above). Since fit depends only on the two
  species (and roles), a graft once made holds until the cells part too far, one dies or goes dormant (a cyst
  lets go), or the needle cuts it. A host lineage escapes its grafters as prey escape hunters: its descendants are
  new species, and those whose surfaces drift out of fit can no longer be grafted.
- **Both ways.** `bondBackMain` counts a graft back on its host as it counts a body's bonds, so the host holds the
  grafter back: the bond pulls both ends, the host's tissue blend takes in the grafter's motion, and any cell (not
  only an adhesive one: `nBack` is read for every cell) can be a host.
- **Energy.** Along a graft, once both ends hold it (`m1`, `m2`, and every back bond), energy moves to cell p from its
  partner q at `bodyShare` × `graftFlow(p, q)` a second:

  `graftPool · (E_q − E_p) + graftTake · (t_p · E_q⁺ − t_q · E_p⁺)`

  where t is each end's graft gene (0 for a non-grafter). The first term pools, toward the poorer cell, half
  (`graftPool`, 0.05: a twentieth) as readily as a body's bond; the second is the grafter's pull on its host's energy
  (`graftTake`, 0.02/s at a full gene). Both are on the scale of a cell's upkeep (about 0.03/s). The expression is antisymmetric, so each end reckons the same amount with
  opposite signs and energy is conserved exactly, however the bond is kept (one way, or both). It is added after a
  tree's feeding replaces the body's sharing, so a tree can host too. So a grafter on a rich host drinks from it
  (a parasite); one on a poor host feeds it; one on an equal pools with it.
- **Symbiogenesis.** A grafter holding a producer (photosynthesis past 0.4), dividing, takes it in at `engulf`
  (0.002 a division): its daughter founds a species, a mutant of it (`engulfInto`), with the producer's photosynthesis
  (`engulfKeep`, 70% of it, where more than its own), the producer's first cell type as its third, its hue drawn half
  way to the producer's, and no graft of its own. The producer's serial goes to the species ledger (the fifth graft
  word), so the chronicler and the registry know the line's second parent.
- **Guarding** (`graftArmor`, 0 by default, screened at 1): a cell held by a grafter resists being eaten as a body's
  adhesion would, the host's side of a mutualism.
- **What it is not.** By default a graft gives no armor (armor is the prey species' adhesion), and a grafter may still eat its
  host, or be eaten by it: nothing in the meal rules knows about grafts.

## Watching it

- **Drawn**: a graft shows as the bond line between two colors and, close up, a narrow neck (0.05 against a body's
  0.12): a grafter clings, it does not fuse (`vsPoint`; `inbondGather` gathers grafts as it gathers bonds).
- **The mind view** names it: *Living off {host}* (energy runs to it), *Feeding {host}*, *Clinging to {host}*, or for a
  host *Carrying N grafters*; a lamp, *Grafted* / *Host*, with the flow (`mindMain` words 68–71: the stranger held,
  the energy its grafts move to it a second, how many grafters hold it, the species of one).
- **The genome tab and the card**: *Grafting* and its share; *grafter* among the card's tags.
- **The chronicler** (`detectGrafts`): a species of weight (≥ 0.4% of the living, 30+ cells) with 30% or more of its
  cells grafted over six minutes, mostly to one host of another genus, is told as a parasite (energy per grafted
  cell running to it past a quarter of its upkeep), a giver (the reverse) or a partner ("X and Y now live as one");
  the first such in a world as a first. It reads the species ledger's graft words (`SPL_GRAFT`, four per slot:
  cells sampled holding a graft, the last host's kind, the energy moved to them in thousandths, cells sampled
  holding up a grafter; zeroed when a slot is claimed).
- **Annotations** (`_grafts` in `src/notes.js`): up close, the pair of species with the most grafts in view, by one
  grafter nearest the middle: its lock, a GRAFT link to its host, which of the two is richer.
- **The Grafts stain** (`src/stain.js`): grafting species magenta, the species holding them up cyan, the rest dimmed.
- **Headless**: each run sample carries `grafts` (shares of the living sampled: of grafting species, holding a graft,
  holding up a grafter; `META_DEATH + 25…27`).

## How it went (2026-11-05, screening at 32k, 15 simulated minutes, Dawn, one run at a time)

`off` is the same code with grafting disabled (`graftMin` 2), so founding is the same. Late-window means
(`tools/night/table.mjs`):

| config | seeds | eff. species | Hill 2 | cells grafted | of grafting species |
| --- | --- | --- | --- | --- | --- |
| off | 8 | 151.5 | 52.1 | 0 | 0 |
| pool 0.5, take 0.15 (first try) | 6 | 102.8 | 32.1 | 17% | 22% |
| pool 0.2, take 0.03 | 4 | 98.4 | 27.3 | 11% | 15% |
| pool 0.1, take 0.01 | 8 | 131.3 | 42.2 | 10% | 14% |
| pool 0.1, take 0 | 4 | 128.2 | 38.6 | 8% | 10% |
| pool 0.05, take 0.02 | 4 | 135.3 | 43.9 | 5% | 6% |
| pool 0.02, take 0.01 (and with graftFound 0.05; graftArmor 1) | 4 each | 126.7 (124.9; 130.8) | 40.4 (40.5; 43.4) | 9% (6%; 8%) | 12% (7%; 10%) |

Grafting at first was a dominant strategy: the energy a graft moves dwarfed what cells earn. Even pooling at 0.1/s of
the difference moves about 0.15 energy a second from a rich producer to a poor grafter, five times a cell's upkeep.
Below that the differences between settings are within the noise of four seeds (the `off` seeds alone span 103 to
183 effective species). Two structural changes came out of it: one graft per host, and only where the host keeps
`graftRoom` (2) of its six back slots for its own kind, since a body's cell lets go of a partner that cannot hold it
back, so grafters crowding a host tore its body apart. The defaults (pool 0.05, take 0.02, `engulf` 0.002) went to the
32-seed gate; see docs/night-2026-11-05.md for its verdict.
