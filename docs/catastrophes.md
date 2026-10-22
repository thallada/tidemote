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
drought, storm, leaf or frost by `eventMix`; `eventPlan` ("drought@900,leaf@2400") forces events for tests, and the page
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
- **Frost** (`frostGrow`, `frostHold`, `frostThaw`): a cold night (light × 0.4, −10°) on a pool this thin freezes it
  in-plane. Ice grows in the order of a second field (`makeIceOrder`, thermal block 4: grains spreading from the
  shallows and from their centres, meeting last along the zero lines of a random field) until `frostMax` (60-85%)
  of the pool is ice. The ice's front is an edge like the water's (`pondAt` takes whichever is nearer): it pushes
  cells and grains ahead of it, so what lives is packed into the veins of water left between the grains (brine
  channels), and cells caught in the ice rest as cysts or freeze. Then it thaws.
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
- **Ice** (`iceLook`): clear, so what is frozen in it shows through, with a faint cold haze; growth bands where its
  front stood; near the front, feathers: two families of fine arms at sixty degrees to it, as ice dendrites branch,
  curving with the front; the front itself a crisp bright line.
- **A leaf**: far above the focal plane, so out of focus: it keeps the lamp from what lies under it (dimmed by 88%
  at its heart, a soft edge), and scatters a faint green-brown haze in which its veins are blurred shadows.

The page announces each event and its turns (the chronicle's "The pool" filter in the Field Lab), counts the pools a
drought leaves (`countPools`), and tallies life and species lost once it has passed. The auto camera gives most of
its shots to an event while it lasts (`eventShot`): a stretch of shore, the leaf, the last raindrop.

`tools/shot.mjs` photographs the built page through an event (`--eval 'T.climate().force("drought")' --at shore`);
`tools/events.mjs` aligns runs on their first event and reports diversity, life and guilds at minutes from it.

## Results

12 seeds a group at 32k, each event forced at 15 min (`eventPlan`), `tools/events.mjs` aligning runs on it;
controls without events. "Low" is the fewest living after the event over those before it (controls fall to about
0.47 in the same window: the boom-and-bust swings).

**Round 1** (0a0e5c9; the events as first drawn, 60 min):

| group | eff. species at +0 / +13 / +30 / +44 min | low | guilds awake at +10 / +44 |
|---|---|---|---|
| control | 111 / 97 / 98 / 99 | 0.47 | 3.67 / 3.67 |
| drought | 106 / 65 / 124 / 127 | 0.23 | 3.00 / 3.67 |
| drought, severe (20-35% wet) | 113 / 46 / 123 / 146 | 0.25 | 2.92 / 3.83 |
| drought, mild (60-80%) | 113 / 46 / 117 / 124 | 0.27 | 3.17 / 3.67 |
| drought, long hold (8-12 min) | 104 / 92 / 115 / 125 | 0.21 | 3.00 / 3.83 |
| storm | 113 / 78 / 109 / 113 | 0.25 | 3.92 / 3.50 |
| leaf | 112 / 103 / 125 / 134 | 0.49 | 3.33 / 3.67 |
| big leaf (40-55%, 10-15 min) | 116 / 95 / 94 / 109 | 0.50 | 3.58 / 3.83 |
| frost (round 2) | 102 / 37 / 103 / 145 | 0.17 | 3.08 / 3.50 |

Every event leaves the pool more diverse 15-30 min later than the control (the intermediate-disturbance effect:
the bust clears dominant species and the recovery is a scramble of many), and no guild is lost for good on
average. But droughts, storms and frosts halve the living again beyond the control's own busts, and the crash
came at the wrong moment: not while the pool dried (its cells pile at the edges and wait) but when the rain came.

**What kills** (round 3, a storm with one part of its weather turned off at a time; round 4, the frost's cold):

| storm | eff. at +5 / +30 | low |
|---|---|---|
| as drawn | 60 / 88 | 0.29 |
| no clouds (`rainDark` 0) | 107 / 152 | 0.44 |
| not cold (`rainCold` 0) | 36 / 112 | 0.21 |
| calm water (`rainTurb` 0) | 38 / 132 | 0.21 |
| no raindrops (`rainDrops` 0) | 58 / 130 | 0.24 |
| no hatching (`rainWake` 0) | 88 / 129 | 0.35 |

The clouds kill: light × 0.4 for minutes starves the producers and everything above them crashes after.
Cold, rough water and raindrops cost nothing measurable; rain hatching cysts into the dark a little. A frost's
cold (−10°, or a quarter of it) made no difference either (low 0.16 against 0.16), and thinner ice none; its
night's darkness is the same culprit (life is down to 0.6 within three minutes, before the ice has grown).

**Milder darkness** (round 5, 45 min, its own control): clouds and the frost's night at 35% of their darkness
(light × 0.79 rather than × 0.4), now the defaults (`rainDark`, `frostDark`):

| group | eff. at +13 / +30 | low | guilds awake at +10 / +30 |
|---|---|---|---|
| control | 109 / 113 | 0.56 | 3.92 / 3.75 |
| storm, 35% dark | 106 / 140 | 0.38 | 3.75 / 3.75 |
| drought, full dark | 61 / 135 | 0.21 | 3.17 / 3.75 |
| drought, 35% dark | 64 / 109 | 0.33 | 3.50 / 3.92 |
| frost, 35% dark | 62 / 130 | 0.24 | 3.58 / 3.67 |

A storm now barely dents the pool and leaves it more diverse; a drought and a frost still crash it (the
drought's stranding and the frost's ice do the killing now), but less, every guild comes back within minutes and
diversity ends higher than the control's.

**The pool as it comes** (round 6, a87e630, 90 min): the defaults (events about hourly, the first after 25 min;
low-water eras; the floor shifting) against no geography at all, 24 seeds each; and events three times as often,
and geography without events (12 each). Measured from 20 min on, guilds present (≥1%) at the end:

| group | eff. species | living | fewest living | producers/grazers/predators/scavengers |
|---|---|---|---|---|
| none | 117 ± 7 | 11745 | 2951 | 24/24/23/18 of 24 |
| defaults | 123 ± 7 | 12731 | 3837 | 24/24/22/14 of 24 |
| events every 20 min | 114 ± 7 | 11564 | 3160 | 12/12/12/11 of 12 |
| geography, no events | 114 ± 6 | 11589 | 3439 | 12/12/12/7 of 12 |

No measurable cost: diversity and numbers are within noise of the pool without geography (a little higher), and
the guilds survive as often (scavengers, the rarest, come and go in every group: 75%, 58%, 92%, 58%). Round 2's
defaults (full darkness) had lost predators in 4 of 12 runs; with the milder clouds none of that remains.

**Balance gate** (32 seeds × 30 min, the defaults, edc2deb): every gated measure the same as the baseline
(persisted 100%, food web 97%, late guilds 3.5, late effective species 105 against 112, p 0.25).

The look was tuned on the page with `tools/shot.mjs`: raindrops are trains of fine ripples (darkfield shows a
sloping surface as bright lines), each ring fading before it meets its own copy across the world's wrap; the
edge's slope is read smoothly across grid cells (a slope constant within each cell had lined the grains an ice
front pushes up along the grid); ice dendrites grow as stems along the front's normal with side arms.
