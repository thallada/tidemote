# Species names

A species' name is read from its genome alone (`speciesName` in `src/names.js`). The same genome gets the same
name in every world, on every device, in every version that keeps the genome's layout and these rules. Two
worlds that independently reach the same genome by mutation give it the same name, and a body plan has the same
genus everywhere.

## How a name is made

- **The genes.** The genome is written to its GPU words (`writeGenome`), so floats are f32 and signatures and
  growth genes are 8-bit, exactly as the GPU holds them. Every word that is a gene is hashed (two murmur3 lanes,
  64 bits). Left out: `metab` (worked out from other genes), the colour (from hue, sat and lum), parent, serial,
  birth time, depth and padding. A float -0 counts as 0.
- **The genus is the body plan:** diet guild (`dietGuild`), movement (`mobilityGuild`), body form (single cell,
  packed, tailed, filament, branching tree: `growPlan`/`hasTails`), the number of cell types (`roleShares` > 0.1)
  and the cell-shape gene. That makes 4 × 4 × 5 × 3 × 12 = 2,880 plans. Each plan's name is drawn from its own
  seed, and the table is built once in plan order with no name used twice, so no two plans share a genus name.
  Thresholds are pinned in `names.js` (`PLAN_K`), not read from the run's tunables, so a `#k=` world names its
  species like every other world.
- **The epithet** comes from the genes' hash: 1 to 3 syllables (10/75/15%) and a suffix, in the old syllable
  grammar. Any mutation changes it.

The decoding into a plan runs on doubles in JS (exact by the language's rules), from the f32 words, so every
engine and device agrees.

## In a world

`register` (`src/main.js`) names each new species with `nameOf`. Two different genomes whose names meet in one
world (same plan, same epithet, different hash) are rare. Then the later one gets a Roman numeral ("Vela nyx II"),
so a name on record is never shared by two species. That is the only place a world's history touches a name. A
viewer's own name (`sp.given`) and a carried species' name stay as they were.

`life.genera` keeps a record for each body plan this world has seen: its first species (`founder`), when, and
the genus that species came from (`from`). The log announces a new genus when an established species is the first
of a plan to arise from another genus ("New genus X arises from Y"). A genus is no longer a lineage. Species of
unrelated lines that converge on one plan share it, and a lineage that changes its plan moves to another genus.
The chronicler's radiation story therefore follows a line (the descendants of one established species), not a
genus. Its trends (following the water, size, swimming) stay with genera.

Saves keep each species' name, so worlds saved before this change keep their old names. Their new species get
genome names.

## Measured

On 6 worlds × 60 simulated minutes at 32k (`tools/names/dump.mjs`, then `node tools/names/study.mjs
runs/names/w*.json`), old naming against new:

| | old (serial, lineage genera) | new (genome) |
|---|---|---|
| genera on record a world-hour | 243–628 | 113–237 |
| entropy of established species' genera | 6.4–7.1 bits | 4.6–6.1 bits |
| children whose genus differs from their parent's | 26–42% | 26–47% |
| established genera two worlds share (mean Jaccard) | ~0 | 0.14 |
| names two genomes share, all 7,729 species as one registry | 0 | 1 (a chance clash in the most crowded plan) |
| cost | — | ~20 µs a species, on the CPU, as it registers |

Fewer genera is the point: a genus now says what kind of organism it is, and the same kinds recur from world to
world. Children change genus about as often as before. The flips come from body form (28%), cell types (30%),
cell shape (24%), movement (14%) and diet (4%). Epithets have about 1.2 million effective values (they had about
94,000 when half were one syllable), so two genomes of one plan meet in about one pair in a million.

`test/names.test.js` pins three names (change them only on purpose: every species in every world is renamed). It
checks that a name ignores serial, parent, birth, depth, colour and metabolism, survives the GPU's round trip,
changes with any gene (one ulp of one float), and that no two plans share a genus.
