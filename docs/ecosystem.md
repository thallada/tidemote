# An ecosystem of mutual dependence

Goal: every guild fills a niche the others need, so losing one unravels the rest, and because of that
the world balances itself and a whole guild rarely dies out. Everything stays local and honest
(docs/energy.md): no census-driven regulators, and energy only enters as light (and the tide).

## Where the world stands

Nothing needs anyone below the predators. Producers live on light and silt, which is everywhere.
Grazers live on glint, which the tide charges out of silt whether or not producers exist; they bite
producers on the side. Predators need grazers, scavengers need deaths, and nobody needs predators or
scavengers. So more light only feeds producer monocultures (photo 0.6: producers alone in 23 of 32
worlds), and losing a guild costs the others nothing.

## Ideas

### Matter cycles (dependence through what bodies are made of)

1. **Nutrient loop.** Silt is the nutrient: bodies are built from grains and the particle count is
   fixed, so matter is conserved exactly. Make free silt scarce and husks slow to rot, so the matter
   locked in the dead only returns when something eats it. Producers then need the recyclers.
2. **Split detritus.** A dead producer leaves plant litter that only grazers can break down, a dead
   animal a carcass that only scavengers can: each recycler guild frees a different pool, so each is
   needed for the nutrient loop to close.
3. **Producers feed grazers by exudation.** Glint comes from producers (photosynthesis leaks a share as
   dissolved food, charging silt nearby), not from the tide, so grazers need producers. The tide stays
   as a small outside source or none.
4. **Excretion and fertilising.** Animals return part of every meal as a silt grain where they are, so
   grazers moving through a meadow fertilise it and moderate grazing helps producers.
5. **Two nutrients (stoichiometry).** Producers need a mineral only decomposers release; animals need
   one only producers concentrate. Each side is limited by the other.

### Interactions that make guilds need each other directly

6. **Dispersal mutualism.** Sessile producers' daughters can only settle where an animal has carried
   them (a seed rides an animal that eats near it): producers need mobile grazers to spread.
7. **Cleaning symbiosis.** Litter and husks shade or poison producers near them; scavengers keep the
   meadow clean.
8. **Predators as keystone.** Unchecked grazers strip producers bare and starve (classic cascade); this
   follows from 3 once grazers depend on producers.
9. **Hosts and parasites, kill-the-winner.** Dense single-species patches pick up infection (a local
   death rate rising with kin density), so the commonest species is always the most hit and no guild
   or species can monopolise.

### Stabilisers (keeping the dependence from swinging into collapse)

10. **Prey refuges** in tissue, reefs and stone (partly exists), so prey never runs out entirely.
11. **Predator satiation and switching** (search images exist): hunters turn to the common prey.
12. **Ratio dependence** (`interfere` exists): crowded hunters catch less.
13. **Scent** (`scent` exists): rare predators can still find prey.
14. **Spatial structure**: the world is big enough for patches to be out of phase, so a guild lost in
    one place re-seeds from another.

### Rebuilding the guilds

15. **Trade-offs per niche.** Each guild has a resource only it uses well (spec(), catchSkill):
    generalists exist but never beat a specialist on its own ground.
16. **Life-history niches.** r and K strategies through body cost by size (`bodySize` exists): small
    fast-breeding cells and big long-lived ones coexist.

## The approach taken first: a closed nutrient loop (ideas 1, 2, 3, with 8 following)

Light → producers → (exudate glint, bites, litter) → grazers → predators → carcasses → scavengers →
silt → producers. Each link is needed:

- no producers: no energy enters (the tide's glint can be turned down or off);
- no grazers: plant litter piles up and locks the silt producers need, and glint goes uneaten;
- no predators: grazers boom, strip glint and bite producers to death, then starve;
- no scavengers: carcasses lock silt;
- each link is self-limiting: producers by free silt and shade, grazers by exudate, predators by prey,
  recyclers by the dead.

All of it reuses what the world already has: particles are matter (a child is a grain made alive, an
eaten husk becomes silt again), husks rot, glint carries energy. Tunables (`cycle` and its own): see
`DEFAULT_K`.

## Measurements

32 seeds × 30 min at 32k each, farmed over two machines (`tools/farm.mjs`), read with `tools/story.mjs`.
"All four": producers, grazers, predators and scavengers all alive (≥1%) at the end. Lost at: the
median minute a guild that had been there (≥3%) was last seen.

| set | all four | producer | grazer | predator | scavenger | omnivore | lost at (P G H S O) |
|---|---|---|---|---|---|---|---|
| main (gate-ff-defaults) | 13% | 88% | 94% | 34% | 50% | 31% | 7 27 17 12 22 |
| honest default (cyF0) | 13% | 91% | 84% | 41% | 25% | 47% | 20 12 2 10 26 |
| cycle, litter to grazers (C1) | 0% | 91% | 94% | 22% | 0% | 28% | 18 28 9 2 25 |
| + exude 0.5 (C2) | 0% | 59% | 100% | 34% | 0% | 44% | 18 - 23 2 25 |
| cycle, litter to scavengers (V1) | 6% | 91% | 94% | 22% | 25% | 34% | 19 30 18 5 22 |
| + glint fades 5× slower (V2) | 0% | 84% | 91% | 31% | 13% | 50% | 20 14 12 4 28 |
| matterSkill 0.5, no cycle (M0) | 0% | 97% | 94% | 38% | 38% | 41% | 20 26 19 3 22 |
| V1 + matterSkill 0.5 (M1) | 13% | 88% | 100% | 50% | 28% | 69% | 24 - 23 4 26 |
| V2 + matterSkill 0.5 (M2) | 6% | 88% | 100% | 41% | 19% | 44% | 18 - 21 10 25 |

The same configuration farmed twice differs by up to 25 points in food webs (honest default: 28% on
one machine, 53% farmed): one 32-seed share carries about ±9 points. Decide on 64 seeds or more.

What the stories show:

- Splitting the dead between guilds starves the specialist that loses its share: with litter for
  grazers, scavengers died within 2 minutes in every world (C1, C2).
- Generalists eat the specialists' food: grazers and predators with a tenth of their diet in husks
  ate litter and carcasses as fast as they were made while scavengers starved. `matterSkill`
  (eating matter takes being built for it, as `catchSkill` for prey) fixes that half.
- Scavengers that survive the start are then mostly eaten, not starved (eaten 260-980 a minute while
  husks lie uneaten): slow and defenceless.
- A guild lost is lost for good. Abiogenesis makes one random species every 30 s world-wide, and
  evolution rarely rebuilds a specialist once its niche is empty, so whether all four guilds survive
  is decided in the first minutes. Mutual dependence cannot balance a world that cannot recolonise.

## Where the energy goes (20-30 min, main and the honest default alike)

| | main | honest default |
|---|---|---|
| light, share of all income | 57% | 61% |
| glint (the tide's charge), share of all income | 21% | 26% |
| glint taken by grazers | 95% | 90% |
| grazers' income from glint | 70% | 79% |
| plants bitten, share of all income | 2% | 2% |
| flesh taken by grazers | 6% | 21% |
| husks taken by grazers | 2% | 8% |
| grazers' income from light | 21% | 9% |
| predators' income from light and glint | 21% | 29% |
| producers + grazers, share of cells | 86% | 88% |

- **Glint makes grazers a second producer guild.** The tide's charge is a quarter of all energy coming
  in, and grazers take nearly all of it: they need neither producers nor anyone else. Producers fix most
  of the light and almost none of it moves up (bitten plants are 2% of income): they are an energetic
  dead end. The two biggest guilds are independent of each other, so nothing ties the web together.
- **Every guild eats from two or three streams.** Grazers kill (21% of all flesh) and scavenge, and
  photosynthesise; predators photosynthesise and eat glint. A 50/50 diet earns 70% of a specialist's
  take from each of two streams (`spec`), and light pays in proportion to `photo`: mixing wins, and a
  specialist meets generalists that also have the tide's income.
- **Herbivory is built as a side dish.** Grazers value plants at 0.6 × their glint gene (`grazePref`),
  bite on one meal opportunity in six (`biteEvery`) and bodies of producers are armoured (adhesion
  0.85-0.9). With the tide off (trT1) grazers had plants in reach in 55% of samples and still died out
  in 31 of 32 worlds, the survivors living on light.

The direction: energy enters only as light, through producers; herbivory is grazers' real income;
steep trade-offs keep each guild on its own stream (`specPow`, `photoPow`); decomposers return the dead
(`cycle`, `litterTo` 1, `matterSkill`).

## Next: a seed bank (dormancy)

Species leave dormant cysts (a body holding its energy, unable to act, slowly decaying) and cysts wake
when conditions suit them: food for their diet nearby, their kind scarce around them. A guild wiped
out in one place returns from its cysts when its niche reopens, as plankton and microbes do. It is
local and honest (a cyst is a body; waking spends its energy), and it gives dependence time to work:
a guild that collapses with its food comes back with it.
