# Stains (2026-11-05)

A microscopist stains a slide to see what the eye alone cannot: a Gram stain sorts bacteria by their walls, a vital
stain picks out the living. Seen from afar, Tidemote's world is a confetti of species colors (each species' hue is
its own, drawn from its genome, so a world of two hundred species is two hundred hues), and its structure (where the
meadows are, which lineages hold which water, where the new species come from) does not show. A stain colors every
living cell by one thing its species is, so that structure shows at a glance.

**Settings → Overlays → Stain**, or **J** to step through them; the map bar names the stain and shows its key, and
its close button (or Esc) takes it off.

| stain | what it colors by |
| --- | --- |
| Diet | light (green), grazing (gold), the dead (violet), flesh (red), mixed in proportion: the food web laid out in space |
| Lineage | a color per genus (a hash of its name): relatives share one, so the mosaic of lineages across the pool shows |
| Grafts | grafting species (magenta) and the species whose cells held up a grafter since the last species ledger (cyan); everything else dimmed (docs/symbiosis.md) |
| Warmth | each species' thermal optimum, 0° blue through 20° green to 40° red |
| Motion | swimmers (cyan, brighter the harder), drifters (pale), anchored and sessile life (amber) |
| Novelty | how long ago the species arose: white and gold for the last minutes, through rose to deep blue past an hour |

## How

Observational: nothing in the world changes. `src/stain.js` (pure, `test/stain.test.js`) turns the living species
(from the census and the registry) into a color per genome slot, packed rgba8, where alpha is how strongly the stain
takes (0: unstained, drawn a dim gray at its own brightness). The page sends the table with every census while a stain
is on (`applyStain` in `src/main.js`; the grafts stain's hosts come from the species ledger's graft words), and
`Engine.setStain` writes it to the end of the focus buffer (`MAXK` words after the focus mask and members), which every
pass that draws the living already binds. `spriteOf` (DRAW_WGSL) takes the stain's color in place of the cell's own
before everything else that colors a cell (dormancy, the mud, the ice, torpor, heat stress, a heat-maker's glow, its
pulse and fullness), so a stained cell still shows its state; the resolved cell (`cellColor`) and the splat draw from
the same color. A stain is never kept between visits.
