# Why diet guilds swing, and rules that would keep them, 2026-10-02

Prompted by watching the page at 2M+ particles: predators, scavengers and omnivores crash in the first
minutes, sessile reefs are rare, and half an hour later the world can flip to almost nothing but
predators and scavengers, with producers not recovering even when an era raises the light.

Data: the 16 runs of `runs/long-final` (131k particles, 60 minutes) and one run at 524k particles,
30 minutes (seed 1, not committed), all on the rules of f770005. Read with the per-guild demography and
who-eats-whom ledgers (`docs/headless-gpu.md`).

## 1. What the runs show

**Life holds almost all the matter.** Late in a run, living cells are 85-92% of all particles; silt is
7-14% and glint about 1%. Every cell is one grain of matter, so this is a nutrient famine for
everything that needs silt: photosynthesis runs at `nutr / (nutr + 8)` of silt within reach, division
needs a grain, and the tide can only charge silt that exists, so the glint economy (grazers) collapses
too. Grazers are 1-8% of life late in most runs.

**Producers die of starvation, not predation.** In the consumer-dominated phases, producers starve at
5-10 times the rate they are eaten (e.g. seed 2 at 57 minutes: 34k starved, 5k eaten per minute,
4k births). With silt at 7% of matter, a photosynthesiser gets about 0.4 of its silt factor at the
start, and dense neighbours shade it to about half again. A brighter era raises the *ambient* floor
(10-34%) but light is not what limits producers then; nutrients and shade are. That is why the
producers did not come back when the light rose.

**Consumer-only worlds run on a predator-scavenger loop.** At those times the meals matrix is almost
all predators eating scavengers and each other, and scavengers eating predators' kills and each other
(seed 2 at 57 min: predators ate 263k scavengers and 104k predators per minute; producers 23k).

The 524k run shows the flip within five minutes: at 5:00, predators and scavengers are 95% of life,
life holds 74% of all matter, producers are 5% of life and starve faster than they are eaten (22k
against 17k per minute). Life then crashes to 27% of matter, silt returns to 54-60%, and producers climb
back over the next 20 minutes (12% → 50% of life) as silt frees up. At 30 minutes predators still eat
392k scavengers per minute against 60k producers.

**That loop creates energy.** A kill pays the hunter `(preyBase 0.35 + preyFrac 0.7 × prey energy) ×
spec × gain 1.5`, and leaves a husk worth `carcass 0.45`, which a scavenger eats at `× spec × 1.5`. A
starved cell leaves a `huskBase 0.35` husk however empty it was. For a specialist predator and
scavenger, killing a cell holding energy E hands out about `1.4 + 0.9 E`: every death injects roughly
one unit of energy that no producer captured. A kill opportunity every second or two is worth more
than a photosynthesiser earns in that time. So consumers do not need producers: they can live on each
other, and they keep the world's matter locked in their bodies while they do. This is the deepest
reason the guilds swing the way they do.

**Omnivores never establish.** `spec(d) = d × (0.4 + 0.6 d)` makes a 50/50 diet worth 0.35 per food
against 1.0 for a specialist. Diet breadth never pays.

**The opening crash is the founding mix.** Founders are drawn by archetype, so consumers start as
roughly 60% of initial life (predators alone about 27%) with energy 0.4-1.0, while hunters need 1.8-2.8
to divide and pay the highest upkeep. A top-heavy pyramid starves within minutes (predators 27% → 8-10%
at 4 minutes, scavengers 8% → 1%) and then rebounds once prey has grown (predators 19-44% at 8 minutes).

**Reefs are punished for being reefs.** A reef is a dense, single-species, motionless patch: exactly
what kin crowding (Janzen-Connell) and shade are built to tax. Sessile producers still win many
131k-particle worlds (60-80% of life) because they out-hold everything else, but a reef cannot be
static scenery that other species move around: it either takes the world or erodes.

## 2. Rules that would fix the causes

Ranked by how much of the above each addresses. All are local; none injects organisms or culls winners.

### 2.1 Conserve energy along food chains (the root fix)

Give every cell a *body* worth what it cost to build, and make every transfer lose energy:

- Division already charges `buildCost`; raise it to something meaningful (e.g. 0.3) and carry it as
  the cell's body energy (no new storage: the child's energy share and body cost are both known from the
  genome).
- A kill gives the hunter `efficiency × (prey energy + body)` with efficiency around 0.5-0.7, and no
  `preyBase`. Whatever the hunter does not take is left in the carcass.
- A husk holds the dead cell's body plus what energy it had left (`huskBase` and `carcass` go away).
  A starved cell leaves a husk worth its body only.
- Glint stays the one external input besides light (the tide is the "sun" for grazers), with a gain
  below 1 as well.

Consequences: a trophic pyramid follows from the arithmetic (each level gets at most ~10-50% of the one
below), predators and scavengers can no longer outlive producers on each other, consumer biomass is
bounded by primary production, so less matter is locked in consumers and producers keep their
nutrients. Boom-bust cycles remain (they come from delays), but they are tied to producers. Expect to
retune `gain`, `eatEvery`, `killEvery` and upkeep after this change, since today's balance leans on the
subsidy; gate it as a set.

### 2.2 Found worlds as a pyramid

Seed founders in proportion to their trophic level: producers hold most of the opening biomass,
grazers and scavengers less, predators least (say 60/20/10/10 by cells rather than by species count),
and give founders energy near half their division threshold. Keep the per-world random archetype
weights for variety. This removes the opening starvation crash that is an artefact of the start, not of
the rules.

### 2.3 Calcified reefs: a fourth kind of matter

Kind 3 is unused. Let a sessile cell that dies of old age (or any anchored cell, in proportion to a new
`calcify` trait that costs upkeep) leave **stone** instead of a husk:

- Stone never drifts, slowly erodes back to silt (minutes), and repels moving particles like a wall, so
  swimmers and crawlers flow around and over it.
- Anchored cells next to stone pay no anchoring cost (they have a holdfast).
- Living cells inside stone-rich neighbourhoods are harder to catch (a refuge: predators miss in
  crevices). Refuges are the classic stabiliser of predator-prey systems: prey that can hide is never
  driven extinct, so predators keep a food source.
- Stone holds matter out of circulation, so reef building competes with everything else for silt, and
  erosion returns it: a slow, self-limiting cycle.

This is what makes reefs scenery instead of a monoculture: the structure persists while the living
layer on it turns over and changes species, and it does not pay kin crowding because stone is nobody's
kin.

### 2.4 Let diet breadth pay sometimes

Soften the specialist bonus (e.g. `spec(d) = d × (0.7 + 0.3 d)`), or let digestion efficiency follow
the last meal as the search image does for catching (a cell digests best what it ate last). Omnivores
then win exactly when a specialist's food crashes, which is a natural buffer against guild extinctions.

### 2.5 Smaller ones

- **Nutrient release by the living.** Let cells shed a grain of silt when they divide below a size or
  when old, so matter does not stay locked in standing biomass. (Probably unnecessary after 2.1.)
- **Mobile producers that follow light.** Swimming producers drift up the light gradient (a local
  sense: compare light at two points along the heading). Light patches then carry their own plankton,
  and dark eras hit sessile and mobile producers differently.
- **Eras that bite harder** (open issue in the balance study): darker darks and nutrient pulses give
  the different guilds different good times.

## 3. Already fixed in this round

- **Grid-aligned bands** (species with Reach 1.00 in dense bodies settling into horizontal and vertical
  stripes). The neighbour scan read at most 288 particles from the 3×3 cells in a fixed order, top row
  first, and stopped. In dense places every cell in a grid square lost the same bottom-row neighbours,
  so forces, crowding and shade were biased along grid lines; large radii felt it most. Crowded
  neighbourhoods are now sampled evenly from a random offset, each sample weighted by the stride.
- **The same light map in every world.** The tide table was reset to fixed constants and fixed phases
  on every seed. Each world now draws its tide waves (directions, wave numbers, drift, phases), and a new
  era's wave gets its own phase.
- **Speed-up biased the ecology.** Faster time used to lengthen each step (up to ×1.6), but eating,
  biting and killing are counted in frames, so at ×1.6 consumers got only 62% of their meals per
  simulated second. Above ×1 the page now runs whole 1/60 s steps, like the headless runs.

## 4. How to test the ideas

Each idea goes through the gate (`npm run gate`), but the gate's 32k worlds are small. Two extra checks
matter here: the 131k × 60 min ensemble (closest to the page the gate can afford), and the per-guild
demography, which says *why* a guild declines. For 2.1 the expected signature is: producers' deaths
shift from starvation to being eaten, life's share of matter falls, silt rises, and consumer-only phases
disappear.

## 5. What came of it (2026-10-03)

**Energy conservation (2.1) was tried and not adopted.** Ten screening rounds, about 40 configurations
at 32k and a 131k check, are on branch `exp/energy` (its copy of this document, section 5, has every
table). Conserving energy made worlds less interesting: predators survived late in 1-3 of 16 runs
(53% of runs today) and scavengers almost vanished, because husks then hold only a body's worth of energy.
The deepest reason: today the free energy in a kill makes partial carnivory pay, so predators *re-evolve*
after crashes (at 131k they climb from 0-3% to 15-41% of life). Under conservation partial carnivory pays
nothing, and every predator crash is permanent. Softening the specialist curve and a small kill bonus did
not reopen that path.

**Side rules, screened on today's energy rules and not adopted** (16 seeds × 30 min, 32k, cumulative):

| rules | food web | runs with predators > 5% late | runs with scavengers > 5% late |
| --- | --- | --- | --- |
| today's rules (64 runs) | 56% | 53% | 61% |
| + search images per class of food | 31% | 38% | 50% |
| + food value graded by the prey's photosynthesis | 25% | 25% | 38% |
| + cost of moving paid by pace, well-fed cells ease off | 25% | 25% | 63% |
| + pyramid founders | 25% | 31% | 56% |

None improved worlds on average. A predator's search image being reset by its occasional plant bite looks
like a bug but acts as a brake that keeps hunters from overshooting one prey; pace-based upkeep favoured
producers (74% of life) and halved leader changes. The code is on `exp/energy`.

**Kept:** an energy ledger per diet guild (light, glint, plant bites, husks and kills in; upkeep and
children out), reported by headless runs as `energy` (see `docs/headless-gpu.md`). It changes nothing in
the simulation; it is what showed where each guild's energy comes from and goes.

Still open from section 2: calcified reefs (2.3), which would give the persistent structures and refuges
this all started from, and do not depend on the energy rules.

## 6. Stone: bedrock and reefs (branch `exp/reefs`, 2026-10-03)

Kind 3 became **stone**: immobile, solid to the living (it pushes cells out, however hard they swim), and
slowly wearing back to silt. Each world draws its own bedrock outcrops (wandering chains of discs; `rocks`
scales the area, up to about 4%), lasting about 50 minutes per grain. A new evolving trait, `calcify`,
costs upkeep; a settled calcifying cell that dies of hunger or old age leaves stone instead of a husk,
mostly beside stone already there (`nucleate` 0.03 elsewhere), so reefs accrete from rock and the rare
spontaneous start, and each reef grain lasts about 5 minutes. Attacks made from among stone often miss (a
refuge). Stone keeps its builder's colour and is drawn with a real size in the world.

Screened (16-32 seeds × 30 min at 32k unless noted, against the 64-run baseline): none of about 20
configurations was a gated regression; all were within noise of today's rules. Holdfast (stone sheltering
adhesive cells from currents) made no difference and was removed. Films that grow on lit stone for
grazers to scrape shifted worlds to grazers and cost producers (producers persisted in 59% of worlds
against 86%, p = 0.004) and were removed. Cheaper calcification let producers sprawl.

| | food web | late guilds | effective species | outcomes | predators > 5% late |
| --- | --- | --- | --- | --- | --- |
| 32k, today (64) | 56% | 2.66 | 75 | 7.7 | 53% of runs |
| 32k, full stone (32) | 44% | 2.38 | 73 | 5.2 | 34% |
| 32k, bedrock only (32) | 56% | 2.72 | 71 | 4.6 | 53% |
| 131k, today (16) | 75% | 3.25 | 74 | 4.7 | 81% |
| 131k, full stone (16) | 56% | 2.75 | 93 | 6.4 | 75% |
| 131k, bedrock only (16) | 50% | 2.69 | 71 | 4.2 | 44% |

Full stone at page scale raises diversity (effective species +25%) and run-to-run variety, and lowers
food-web completeness a little; stone holds 12-14% of matter. Bedrock alone helps at 32k and is the
weakest at 131k: at these sample sizes most differences are noise.

### Why stone cost food webs, and the fix

At 131k with 32 runs each, today's rules keep a food web in 66% of worlds (the earlier 75% from 16 runs
was partly luck) and full stone in 56%. The missing guild is almost always predators (above 5% of life late
in 56% of stone worlds against 72%). Their budgets show why: early on, predators near reefs eat as well as
anywhere, but late in the run they starve more (4.1 starvations per predator per minute against 2.4),
because attacks made from among stone missed up to 60% of the time. It was not the matter that stone
locks up: halving how often calcifiers turn to stone (`reefs` 0.5) made food webs worse, not better.
Capping the refuge at 30% (`refugeMax` 0.3) closes the gap:

| 131k × 30 min, 32 runs each | food web | late guilds | predators > 5% late | outcomes |
| --- | --- | --- | --- | --- |
| today's rules | 66% | 3.03 | 72% | 5.8 |
| stone, refuge up to 60% | 56% | 2.75 | 56% | 6.7 |
| stone, refuge up to 30% (adopted) | 63% | 2.88 | 66% | 7.3 |

The 32k gate passes with the adopted rules (no gated metric regressed). Stone holds about 17% of matter
at 30 minutes, so the living share falls from 64% to 51%.
