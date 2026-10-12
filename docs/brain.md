# The brain (experiment, shelved)

`K.brain = 1` (page: `#k={"brain":1}`) gives every species a small neural network that steers its
swimmers and makes a few of its choices. Nothing is trained: the weights are genes, founders start with
reflexes and a temperament, mutation jitters them and selection keeps the brains that work. Off (the
default), the ecology is unchanged.

Inspired by Fraser Price's evolved-brain creatures, Pixling World (1M WebGL agents, a dense net per
agent), ALIEN (an int8 network per cell, latched memory, signals) and biosim4 (evolved wiring per agent).

**Status (2026-10-12): it works and costs +13% per step, but it does not make worlds richer.**
Inherited brains do no better than a control whose brains are not inherited, and how a cell steers
carries no fitness: the rules (signature forces, hunger pulls, contact feeding) already decide what a
cell eats and what eats it. See [Results](#results) and [Where we left it](#where-we-left-it).

## One brain per species, run per cell

The weights live in the species' genome (`Genome.brain`, 72 words after the 48 of traits; `G_WORDS`
120), so a species shares one instinct and every cell runs it on its own senses, memories and the
signals it hears: two cells of one species in different places decide differently. A mutated child is
a new species, so brains vary between lineages, not within one. Sharing keeps the cost small: at most
1019 weight tables, which stay in cache, and neighbouring threads usually read the same one.

## Thinking: a pass of its own

`thinkMain` runs before `lifeMain`. Each step a share of the living cells think (every fourth at 1/60 s
steps, every cell in 4-tick steps: `thinkEvery`): each scans its neighbourhood on a budget of its own
(`K.thinkScan`, 96 samples), runs its species' network, and writes what it chose (`Particle.spare`,
`packAct`: its stroke, appetite and how early it divides) and its new state (`Particle.mem`: two
memories and its signal, 4×8 snorm). The particle grew from 40 to 48 bytes (`P_WORDS` 12). `lifeMain`
acts on the stored choice until the cell thinks again (about 67 ms).

Why a separate pass: `lifeMain` is limited by registers, and every sum it carries through its neighbour
loop costs occupancy. Sensing inside it (food and danger only) cost +20% of `lifeMain`; adding the centre
of its own kind took that to +68%, and adding heard signals did the same. In its own pass the sensing has
its own register budget and runs on a quarter of the cells. At 1M particles (590k living, Dawn/D3D12):

| | lifeMain | thinkMain | step (ns per living cell) |
| --- | --- | --- | --- |
| main | 3.40 | | 4.87 |
| brain off | 3.32 | | 4.91 |
| brain on | 3.29 | 0.70 | 5.56 (+13%) |

The thinking cells are every `thinkEvery`-th entry of the living list from a phase that turns each step;
the list is padded with NONE to a multiple of 512 so the pass needs no count.

## Senses, network, outputs

`brainNet` in `src/shaders.js`, laid out as `src/genome.js` describes (`hidByte`, `outByte`, `BIAS_BYTE`,
`CLOCK_BYTE`).

- 20 senses (`BRAIN_SENSES`): energy (of reproE), age (of lifespan), food in reach and danger in reach
  (squashed sums), its own kind and crowding nearby, temperature error (tolerances), light, silt, bonds,
  speed, how its heading lines up with the food and with the danger, the current, a clock (a sine at
  the species' own rate, per-cell phase), a constant 1, its two memories, and the signals it hears from
  its own kind and from other species (nearer counting more).
- 20 -> 8 tanh -> 14 tanh, weights 8-bit snorm times `BRAIN_SCALE` (3), 288 bytes.
- Outputs 0..7 are gains on directions the cell senses (`BRAIN_DIRS`): food, danger, its kind's centre,
  warmth (up the gradient), the current, its own heading, a smooth per-cell wander, and its kind's
  heading. Their sum, capped at length 1, times `swim × brainThrust`, is the stroke.
- Outputs 8..11 (`BRAIN_STATE`): two memory candidates, the signal it gives off, and `remember`: it keeps
  (remember + 1) / 2 of the candidates, so a memory can latch and hold.
- Outputs 12..13 (`BRAIN_ACTS`): appetite (0 to 2× the hunger pulls toward food) and dividing early (at
  down to 0.7 of reproE).

Steering by gains on sensed directions keeps the brain blind to the world's axes (no heading state, no
left or right), as the neighbour scan is.

Danger needs to know who eats whom: with the brain on, scatter marks each living particle's `Lite.kr`
with bit 13 (a flesh-eater) and 14 (a cropper of plants), from its genome, and copies its state into
`Lite.pad`, which is how its neighbours hear its signal.

`K.smell` (0 by default, up to 2) lets a thought sense farther than its reach: out to that many world
units, over the 5×5 bins around it instead of 3×3, with the same accumulators (nearer still counts more).

## What it replaces

With the brain on, thermotaxis and swimming straight on along the velocity are off; the brain's stroke
takes their place. Signature forces, personal space, bonds, stone, schooling (`align`), the currents and
the hunger pulls (`K.hunt`, `K.forage` in the pair force, scaled by `K.brainPulls` and the appetite) are
unchanged: the body and its chemistry stay, the intent is the brain's. Plants and other non-swimmers do
not think.

Swimming costs by the stroke: `K.thrustShare` (half) of a swimmer's swimming upkeep (`swimCost × swim`) is
charged per unit of stroke instead of always, so a brain that rests saves it and one that sprints pays.

## Evolution

- Founders (`archetypeGenome`): reflexes like the brainless rules (hunger to food, out of its warmth back
  toward it, on along its heading) and a mild flight from danger, each at its own strength (0.4 to 1.6×),
  plus a temperament: the spare hidden neurons wired at random to every sense and output, and random
  leanings toward the current, schooling, wandering, its kind, remembering and signalling. Their own
  random stream, seeded from the founder's hue, so seeded worlds keep their founders.
  `K.brainFounders: 0` gives founders random brains instead (`randomBrain`), for selection tests.
- Sparks of life (`randomInto`): random brains.
- Mutation (`mutateBrain`, CPU twin in `mutateLike`): every weight is drawn toward zero by `brainShrink × m`
  and gets the mutation's noise times `brainMut`, and with chance `m/4` one row of weights is redrawn.
  Without the shrink, neutral drift walks every weight out to its limit within ten generations and brains
  saturate (gains stuck at ±1, the clock flipping them); with it, a weight stays large only while
  selection holds it.
- `K.brainOnly`: the share of mutants that keep their parent's body exactly (a shade of hue apart) and
  differ only in their brain, so brains compete on equal terms.
- Controls for selection, `K.brainControl`: 1, every mutant gets a fresh random brain; 2, a random living
  stranger species' brain, mutated as usual. 2 is the fair one: weights keep an inherited brain's sizes
  and only the inheritance is gone (1 is confounded by the shrink: fresh brains are louder).

## Tools

- `node tools/sim.mjs --k '{"brain":1}' --species --out run.json` keeps the final species, and
  `node tools/brain-probe.mjs run*.json` runs each swimming species' brain on staged situations (hungry,
  sated, danger, hot, cold, crowded, clock, signals, memory) and summarises across runs: drift, hunger to
  food, flight, thermotaxis, rhythm, alarm calls, heeding signals, memory use, appetite, dividing early.
- `tools/brain/selection.sh`: inherited brains against the stranger-brain control, 8 seeds × 120 min.
- `tools/fork.mjs` variants take `"transplant"`: `random`, `shuffle` (species trade brains),
  `shuffle-steer`, `shuffle-acts`, `shuffle-state` (they trade only those outputs).
  `tools/brain/transplant.sh` runs them, `tools/brain/knockout.sh` runs worlds on with the stroke off,
  doubled or the brain off; `node tools/brain/fork-ends.cjs out*.json` gives the end populations per
  guild against the first variant.
- `tools/gpu-node.sh tools/brain/watch.mjs OUTDIR K_JSON [growSeconds]` films the built page in Windows
  Chrome following a swimmer, with the Brain block open.
- The specimen panel's Behaviour section shows a Brain block for swimmers (`src/mindview.js`): each
  direction's gain, appetite, dividing early, its memories, the signal it gives off and what it hears.
  `mindMain` replays its thought (mind words 58..92).

## Results

All at 32k particles on the GPU (Dawn/D3D12); ± is the spread between seeds.

**Health, 16 seeds × 30 min** (`brainPulls` 1 unless said): living share 0.44 without the brain, 0.60
with it; mean effective species 58 against 77; predators' late share 0.10 against 0.23, and 6 of 16
brain worlds tipped to 55–80% predators. Removing the hunger pulls (`brainPulls: 0`) starved predators
(0.13 → 0.06) and scavengers (0.14 → 0.04): a brain steers toward the centre of the food it senses, while
the pull draws a hunter to each prey in reach. 4-tick runs track 1-tick ones.

**Transplants** (fork a grown world, swap brains, 12 reps × 60 s): before the appetite and early-division
outputs, random brains changed nothing (<2%). After them, random brains cost grazers 26% and shuffled
ones 45%, while omnivores gained 15–20%: brains mattered. Swapping only parts showed which:

| swap | world 1 | world 2 | world 3 |
| --- | --- | --- | --- |
| steering only | ~0 | ~0 (omnivores +2%) | ~0 |
| appetite, early | predators +24% | omnivores +11% | grazers −5%, scavengers −15% |
| memory, signal | grazers +52% | omnivores +19%, grazers −8% | ~0 |

Steering carries no fitness; appetite, division timing and the memories feeding them do.

**Knockout** (fork, then the stroke off, doubled, or the brain off; 12 reps × 120 s): stopping the
stroke never hurt and in one world helped consumers (grazers +57%, omnivores +32%: the stroke was a
running cost); doubling it changed nothing; going back to the rules was mixed (better for consumers in
one world, worse for producers or scavengers in the others). Living totals moved < 3%.

**Selection: inherited brains against the stranger-brain control**, 8 seeds × 120 min, `brainOnly` 0.5:

| arm | living | effective species | predators |
| --- | --- | --- | --- |
| inherited | 0.62 ± 0.07 | 149 ± 59 | 0.03 |
| control | 0.57 ± 0.08 | 225 ± 107 | 0.04 |
| inherited, no pulls, thrust 2.5 | 0.63 ± 0.16 | 109 ± 68 | 0.02 |
| control, no pulls, thrust 2.5 | 0.65 ± 0.09 | 162 ± 99 | 0.02 |
| inherited, smell 2 | 0.56 ± 0.11 | 157 ± 112 | 0.04 |
| control, smell 2 | 0.65 ± 0.09 | 126 ± 71 | 0.06 |
| inherited, smell 2, no pulls | 0.60 ± 0.10 | 133 ± 53 | 0.10 |
| control, smell 2, no pulls | 0.62 ± 0.08 | 101 ± 44 | 0.03 |

No behaviour converges across worlds: the probes for hunger-to-food, flight, alarm calls and appetite
that rises with hunger average ~0, with about three times the control's spread (each world drifts its own
way). The one consistent strategy appeared with smell and no pulls: swimming straight on (+0.32 against
0.04) and away from its own kind (−0.27): dispersal, not foraging.

## Why it did not pay

1. **The rules already decide.** Signature forces, hunger pulls and contact feeding settle what a cell
   eats and what eats it; the brain duplicated them or fought them. Food is even at every scale a cell
   senses (the tide's light bands that make glint span a third of the world), so a cell that drifts eats
   about as well as one that searches. With nothing riding on behaviour there is no gradient to climb.
2. **Selection is slow and noisy.** Brains are per species, every mutation founds a species, and most
   mutants change their body too: each brain is tested in a small, short-lived population over maybe
   50–150 generations in two hours. There is no learning within a lifetime.
3. **Not the network's size.** biosim4 gets striking behaviour from nets this small; a bigger one only
   helps once there is a payoff.
4. **Hard to see.** Even a good steering bias, on top of pair forces and currents, reads as jostling.

What a network offers over inherited rules is conditions nobody wrote (any mix of senses triggering any
action), internal state (memory, rhythm, signals whose meaning evolves) and surprise. That only pays when
the right action depends on combinations of context and selection can find them; neither holds here, and
everything the brains evolved amounts to a threshold on one sense, which a rule gene does better and
cheaper. (A rule with an evolved trigger, a weighted sum of senses against a threshold, is already a
one-neuron network: the real question is whether hidden layers and memory are needed.)

## Where we left it

The plan agreed on 2026-10-12, not started:

1. Remove the steering brain and `thinkMain` (saving the 13%); this branch and this document keep the
   work.
2. Give cells new abilities the rules do not have yet, as inherited rules, each with an evolved trigger
   (a weighted sum of a few senses against a threshold, all genes): attack or flee, bond into a body or
   break away, go dormant, share energy with kin, sprint, release a toxin or an alarm. Judge them with the
   same control checks: diversity, persistence, and whether the abilities get used.
3. Keep neural networks for a possible creature tier: a few hundred larger multicellular organisms with
   individual genomes, long-range senses and bodies of their own to steer, where control is too
   combinatorial to write as rules and a big brain per organism is affordable. For a brain to be an
   advantage there, the body needs actuators of its own (body-level swimming, a mouth, turning).
