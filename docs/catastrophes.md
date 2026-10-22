# The pool: geography and catastrophes (2026-10-22)

docs/next-level-2026-10-20.md §4.4 as a shallow pool under a microscope. The world is a puddle seen through
darkfield optics, so its catastrophes are a puddle's: it dries out and parts into pools, rain refills it, a storm
rings and stirs its surface, a leaf falls on it and shades what lies beneath. Each is a local rule acting on cells
(no census steers anything), rare, and announced.

## The floor and the water level

Each world has a floor (`src/geography.js`, `makeRelief`): a smooth torus-periodic height field on the binning
grid, a red sum of waves with wavelengths from about 10 to 70 world units, its coordinates warped so basins and
ridges are organic, stored as each grid cell's **quantile** (0 the deepest, 1 the highest). The climate sets a
water level `L` (Sim `pond.x`); the floor above it is dry, so the share `1 - L` of it is dry whatever the world's
size. The GPU reads the relief bilinearly from thermal block 3 (`pondAt`: depth `L - relief` and the slope);
the page draws it bicubically (`pondPost`), so the drawn edge is smooth and the simulated one lies within a
fraction of a unit of it.

What the water does where it is shallow or gone (all in `src/shaders.js`, tunables in `DEFAULT_K` from `pond`):

- **Currents** die away within `shoreCalm` of the edge and never cross it (`flowAt`): the edge is a wall to the
  water, and dry ground has none.
- **Stranded cells** (on dry ground) cannot swim, their motion dies at `dryDrag`, and the film of water pulls them
  back toward the edge (`meniscus`, fading over `filmR` units). A receding edge therefore sweeps cells along and
  piles them at the waterline. Beyond the film a stranded cell rests as a cyst (`dryCyst`, any guild: producers
  as spores) or dries out (`dryCost` a second). Cysts on dry ground lie still and do not wake.
- **Rain** (`pond.y`) wakes cysts in water `rainWake` times as fast: the resting bank hatches as the pool refills.
- **Grains and husks** on dry ground lie where they are; husks rot at `dryRot` of the rate. Near a receding edge
  the outflow that replaces evaporating water carries matter to the edge (`ringPull`), stranding grains in lines:
  the coffee-ring effect, which leaves tide lines on the mud.
- No light reaches a stranded cell; no life sparks from dry silt.

## Events (src/climate.js)

The climate draws an event about every `eventEvery` minutes (60; the first no sooner than `eventFirst`, 25),
drought, storm or leaf by `eventMix`; `eventPlan` ("drought@900,leaf@2400") forces events for tests, and the page
console's `__tidemote.climate().force('drought')` starts one. Climate eras also set the water's resting level:
`lowEras` of them (35%) stand low (88-98%), showing sandbars and islands (moving geography).

- **Drought**: the water falls over `droughtFall` (5-8 min, warm and bright: +3°) until `droughtLow` (35-60%) of the
  floor is wet, the pool parting into separate pools; holds `droughtHold` (2.5-5 min), still sinking a little; then
  **rain** refills it over `droughtRefill` (1.5-2.5 min): clouds (light × 0.45), cold (−3°), rough water (currents
  × 2.2), raindrops, cysts hatching.
- **Storm** (`stormDur`, 4-7 min): clouds (light × 0.4), cold rain (−4°), rough water (currents × 2.6), raindrops,
  the water a little higher.
- **Leaf** (`leafDur`, 7-12 min): a leaf `leafLen` (18-32% of the world's side) floats onto the pool, drifting and
  turning slowly, and shades the water under it (light × 1 − `leafDark`, 75-92%).
- **Raindrops**: about one a second in full rain, each a ring wave (`dropSpeed` 7 units/s, `dropWidth`, `dropLife`)
  shoving the water outward as it passes (`flowAt`).

Sim uniforms grew to 384 bytes (`pond`, `weather`, `leaf`, `leafB`, `drops`), the post uniforms likewise; thermal
grew a fourth block (the relief). Saves from before do not load.

## How it looks

Darkfield: the lamp's light reaches the objective only where something scatters it.

- **Dry ground** (`dryGround`): the skin of mud the water left glows faintly, warm grey and grained; just out of the
  water it is still damp and dark; where it has dried longest it has shrunk into plates whose cracks catch the
  light, and salt crystals glint.
- **The water's edge**: a thin, uneven, bright contact line (the meniscus pins and slips on grains), the curved
  surface rising to it scattering a narrowing glow on the water's side, a faint sheen of thinning film beyond.
- **Raindrops**: each ring bends the view as it passes (the surface's slope refracts it) and its crest catches a
  little light.
- **A leaf**: far above the focal plane, so out of focus: it keeps the lamp from what lies under it (dimmed by 88%
  at its heart, a soft edge), and scatters a faint green-brown haze in which its veins are blurred shadows.

The page announces each event and its turns (the chronicle's "The pool" filter in the Field Lab), counts the pools a
drought leaves (`countPools`), and tallies life and species lost once it has passed. The auto camera gives most of
its shots to an event while it lasts (`eventShot`): a stretch of shore, the leaf, the last raindrop.

`tools/shot.mjs` photographs the built page through an event (`--eval 'T.climate().force("drought")' --at shore`);
`tools/events.mjs` aligns runs on their first event and reports diversity, life and guilds at minutes from it.

## Results

(to come)
