# Honest energy: bodies that hold what they cost

main's food webs ran on energy made from nothing. This note says where it came from, why the tissue rules
turned it into perpetual-motion worlds, the rules that make energy enter only as light (all tunables in
`DEFAULT_K`), and what was measured on the way. How energy then flows through the food
web, and why animals were scarce until light became a flux per area, is in docs/ecosystem.md.

The on/off switches named below (and the alternatives they chose between) were removed when this work
merged to main: these rules are now always on, and only their strengths remain tunable.

## The leak

- A child's body cost `buildCost` (0.06), but a kill paid `(preyBase 0.35 + preyFrac 0.7 × the prey's
  energy) × gain 1.5 × skill`, left a carcass of 0.45, and every other death a husk of 0.35; husks were
  eaten at × 1.5 as well. A body made from free silt was worth about 16 times its cost, and stored energy
  grew by 5% at each link of a carnivore chain.
- In main this is predators' and scavengers' safety net. Under the tissue rules predators catch more
  (10 kills a predator a minute against 7.7) of fatter prey (1.16 a kill against 0.66), and a third of
  worlds settle into predators and scavengers eating each other with no producers: they burn 4-50 times
  the light and glint they take in (`runs/gateC`, 32 seeds).

## The rules

- `bodyE`: a body holds energy. A child's body costs it (`bodySize`: bodyE × the cell's size, so small
  cells are cheap to build and big ones rich prey), a death leaves it as the husk, a kill passes on the
  prey's body and stored energy and no more (`carcassKeep` of the body stays in the carcass).
- `bodyWhole`: a body is material, not fuel: it passes to its eater whole (the stuff of its next child),
  while stored energy is digested at `assimilate` × the eater's skill, at most `assimCap`.
- Light is the only income. It is a flux per area (`shadeP`): photosynthesisers share a patch's light, so a
  crowded meadow burns it in its own upkeep and a grazed one regrows. (Glint, silt charged by the tide,
  was a second income at `gain`; it let grazers live without producers and has been removed.)
- `dung`: what an eater cannot assimilate fills its gut and is dropped as a husk, so the undigested share
  feeds scavengers rather than vanishing as heat.
- `catchSkill` (0.6): catching living prey takes being built for it. At 0.3 any cell with a little flesh
  in its diet caught as surely as a predator; grazers made most of the kills and outcompeted specialists.
- A cell divides once it holds `reproE` beyond its child's body (`bodyReserve`), and feeds until then.
- `bodyShare`: energy flows along a body's bonds toward the poorer cell, the same amount either way. In a
  tight tissue only the edge cells reach prey; without it the interior starved.
- More light (`photo` 0.4 → 0.5): bodies now cost what they hold, so the world needs more income.
- Founding (initial conditions only): `foundHunt` keeps at most 3 of a world's 24 founding species
  flesh-eaters (worlds opened with up to 81% predators and crashed), and `leanHunters` builds founding
  hunters and crawlers for costly bodies (smaller, dividing sooner, loose bodies).

No loop can make energy: an eater gets back at most what its prey held, and every link loses the
undigested share and the upkeep spent on the way.

## Measurements (16 seeds × 30 min at 32k unless said; gate: 32 seeds against main's baseline)

| | food webs | producers persist | late guilds | eff. species | living |
|---|---|---|---|---|---|
| main's rules, today's code (10 seeds) | 70% | 100% | 2.80 | 66 | |
| main baseline (32) | 56% | 81% | 2.56 | 89 | 0.54 |
| tissue, main's energy (32) | 16% | 63% | 2.16 | 147 | 0.56 |
| bodyE 0.35 | 6% | 50% | 1.44 | 78 | 0.40 |
| + bodyWhole, carcassKeep 0, catchSkill 0.6 | 25% | 88% | 2.38 | 112 | 0.52 |
| + carcassKeep 0.3 | 38% | 88% | 2.44 | 93 | 0.48 |
| bodyE 1.0 (before the division fix) | 56% | 81% | 2.69 | 64 | 0.32 |
| bodyE 1.3 × size | 56% | 88% | 2.63 | 61 | 0.39 |
| bodyE 1.3 × size, photo 0.5 | 56% | 100% | 2.69 | 69 | 0.47 |
| the same, gate (32) | 28% | 94% | 2.22 | 67 | 0.45 |
| + foundHunt, bodyShare 2, gate (32) | 38% | 88% | 2.31 | 62 | 0.40 |
| + leanHunters: the default, gate (32) | 28% | 88% | 2.19 | 72 | 0.46 |

The default passes the gate (every gated metric "same"; guilds lost 0.16 against main's 0.53, every world
persisted) and no world burns more than 0.83 of what it takes in. 4-tick runs match 1/60 s runs on the
same seeds (food webs 38% both, guilds 2.50 both).

## Since

The open problem here (food webs rarer than in main, predators dying early) turned out to be structural:
light earned per cell and grazers capped by the bite held animals near a quarter of the producers whatever
the hunting rules (docs/ecosystem.md, tools/ecomodel). With light per area, bigger bites, dung, fleeing
prey and satiated hunters, all four core guilds are awake at an hour in about three worlds in four.

16-seed ensembles differ by about ±11 points in food webs from noise alone; read single rows with care.

## What did not work

- Conservation with skill multiplying the meal (`assimilate` × spec × eatEff): predators kept ~40% of
  their prey and died out everywhere; main's gain of 1.5 had hidden that tax.
- Shorter handling time (`killEvery` 4): kills a predator a minute did not change (7.2 → 7.4).
- Interference among a hunter's kin (`interfere`): steadies producers and grazers, does not save
  predators.
- Kin recognition wider (`kin` 2, 4) and prey fighting back (`fightBack`): predators are eaten by
  unrelated predator species, and fighting back blunted their hunting of grazers too.
- The cheap fixes in main's energy (`hunt` 0.08: food webs 16% over 32 seeds).
