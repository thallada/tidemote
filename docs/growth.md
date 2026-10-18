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
- **Holding the shape.** Each cell is drawn toward where its turn puts it beside its mother
  (`growStiff`, relative to the bond's pull), carried on her motion. Kin signature forces are off between a
  tree's cells: the shape is its bonds'.
- **Feeding the tips.** A tree's cells do not even out their energy (`bodyShare`). A cell whose daughters
  are all grown passes its surplus over half its division energy on to them (`growFeed`); mother and
  daughter reckon the flow alike from the step's start, so no energy is made or lost.
- **Tips wait less.** A tip is always its tree's youngest cell, so `mature` (a cell divides only past a
  share of its lifespan) would stall every tree; a tip buds again after `growTip` seconds instead.
- **Drawing.** A tree's cells face along their branch, away from their mother (`bodyDirection`), so a
  filament reads as one strand.

## Measurements

(in progress)
