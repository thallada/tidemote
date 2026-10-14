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

(to come: farmed ensembles, `tools/farm.mjs`; per-run stories with `tools/story.mjs`)
