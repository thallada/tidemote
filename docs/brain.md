# The brain (experiment)

`K.brain = 1` (page: `#k={"brain":1}`) gives every species a small neural network that steers its
swimmers. Nothing is trained: the weights are genes, founders start with reflexes and a temperament,
mutation jitters them and selection keeps the brains that work. Off (the default), the ecology is
unchanged.

Inspired by Fraser Price's evolved-brain creatures, Pixling World (1M WebGL agents, a dense net per
agent), ALIEN (an int8 network per cell, latched memory, signals) and biosim4 (evolved wiring per agent).

## One brain per species, run per cell

The weights live in the species' genome (`Genome.brain`, 68 words after the 48 of traits), so a
species shares one instinct and every cell runs it on its own senses, memories and the signals it hears:
two cells of one species in different places decide differently. A mutated child is a new species, so
brains vary between lineages, not within one. Sharing keeps the cost small: at most 1019 weight tables,
which stay in cache, and neighbouring threads usually read the same one.

## Thinking: a pass of its own

`thinkMain` runs before `lifeMain`. Each step a share of the living cells think (every fourth at 1/60 s
steps, every cell in 4-tick steps: `thinkEvery`): each scans its neighbourhood on a budget of its own
(`K.thinkScan`, 96 samples), runs its species' network, and writes the stroke it chose (`Particle.spare`,
2×f16) and its new state (`Particle.mem`: two memories and its signal, 4×8 snorm). `lifeMain` swims by
the stored stroke until the cell thinks again (about 67 ms), reading it after its scan.

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

`brainNet` in `src/shaders.js`, laid out as `src/genome.js` describes (`hidByte`, `outByte`).

- 20 senses (`BRAIN_SENSES`): energy (of reproE), age (of lifespan), food in reach and danger in reach
  (squashed sums), its own kind and crowding nearby, temperature error (tolerances), light, silt, bonds,
  speed, how its heading lines up with the food and with the danger, the current, a clock (a sine at
  the species' own rate, per-cell phase), a constant 1, its two memories, and the signals it hears from
  its own kind and from other species (nearer counting more).
- 20 -> 8 tanh -> 12 tanh, weights 8-bit snorm times `BRAIN_SCALE` (3), 272 bytes.
- Outputs 0..7 are gains on directions the cell senses (`BRAIN_DIRS`): food, danger, its kind's centre,
  warmth (up the gradient), the current, its own heading, a smooth per-cell wander, and its kind's
  heading. Their sum, capped at length 1, times `swim × brainThrust`, is the stroke.
- Outputs 8..11 (`BRAIN_STATE`): two memory candidates, the signal it gives off, and `remember`: it keeps
  (remember + 1) / 2 of the candidates, so a memory can latch and hold.

Steering by gains on sensed directions keeps the brain blind to the world's axes (no heading state, no
left or right), as the neighbour scan is.

Danger needs to know who eats whom: with the brain on, scatter marks each living particle's `Lite.kr`
with bit 13 (a flesh-eater) and 14 (a cropper of plants), from its genome, and copies its state into
`Lite.pad`, which is how its neighbours hear its signal.

## What it replaces

With the brain on, thermotaxis and swimming straight on along the velocity are off; the brain's stroke
takes their place. Signature forces, personal space, bonds, stone, schooling (`align`), the currents and
the hunger pulls (`K.hunt`, `K.forage` in the pair force, scaled by `K.brainPulls`) are unchanged: the body
and its chemistry stay, the intent is the brain's. Plants and other non-swimmers do not think.

Taking the hunger pulls away too (`brainPulls: 0`) starved the predators: over 16 seeds × 30 min at 32k
their late share fell from 0.13 to 0.06 (0.01 at 4-tick steps) and scavengers' from 0.14 to 0.04, since a
brain steers toward the centre of the food it senses while the pull draws a hunter to each prey in reach.
With the pulls kept: living 0.56 (0.56 without the brain), mean effective species 62 (50), predators 0.04
and 0.09 at 4-tick steps, scavengers 0.11; predators' share swings from 0 to 0.6 between seeds either way.

Swimming costs by the stroke: `K.thrustShare` (half) of a swimmer's swimming upkeep (`swimCost × swim`) is
charged per unit of stroke instead of always, so a brain that rests saves it and one that sprints pays.

## Evolution

- Founders (`archetypeGenome`): reflexes like the brainless rules (hunger to food, out of its warmth back
  toward it, on along its heading) and a mild flight from danger, each at its own strength (0.4 to 1.6×),
  plus a temperament: the five spare hidden neurons wired at random to every sense and output (so founders
  start with quirks of memory and signalling too) and random leanings toward the current, schooling,
  wandering, its kind, remembering and signalling. Their own random stream, seeded from the founder's hue,
  so seeded worlds keep their founders.
- Sparks of life (`randomInto`): random brains.
- Mutation (`mutateBrain`, CPU twin in `mutateLike`): every weight is drawn toward zero by `brainShrink × m`
  and gets the mutation's noise times `brainMut`, and with chance `m/4` one row of weights is redrawn.
  Without the shrink, neutral drift walks every weight out to its limit within ten generations and brains
  saturate (gains stuck at ±1, the clock flipping them); with it, a weight stays large only while
  selection holds it.

## Observing it

- The specimen panel's Behaviour section shows a Brain block for swimmers: each direction's gain, its
  memories, the signal it gives off and what it hears. `mindMain` replays its thought now (mind words
  58..90), which may differ a little from the one it is swimming by.
- `node tools/sim.mjs --k '{"brain":1}' --species --out run.json` keeps the final species, and
  `node tools/brain-probe.mjs run.json` runs each swimming species' brain on staged situations (hungry,
  sated, danger, hot, cold, crowded, clock, signals, memory) against the plain founder reflexes: drift,
  hunger to food, flight, thermotaxis, rhythm, alarm calls, heeding signals, memory use.
