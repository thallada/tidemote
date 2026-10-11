# The brain (experiment)

`K.brain = 1` (page: `#k={"brain":1}`) gives every species a small neural network that steers its
swimmers. Nothing is trained: the weights are genes, founders start with reflexes, mutation jitters them
and selection keeps the brains that work. Off (the default), the simulation is unchanged.

Inspired by Fraser Price's evolved-brain creatures, Pixling World (1M WebGL agents, a dense net per
agent), ALIEN (an int8 network per cell) and biosim4 (an evolved wiring per agent).

## One brain per species, run per cell

The weights live in the species' genome (`Genome.brain`, 52 words after the 48 of traits), so a
species shares one instinct and every cell runs it on its own senses, every step: two cells of one
species in different places decide differently. A mutated child is a new species, so brains vary
between lineages, not within one. Sharing keeps the cost small: at most 1019 weight tables, which stay
in cache, and neighbouring threads usually read the same one.

## Senses, network, steering

`brainNet` in `src/shaders.js`, laid out as `founderBrain` in `src/genome.js` describes.

- 16 senses (`BRAIN_SENSES`): energy (of reproE), age (of lifespan), food in reach and danger in reach
  (squashed sums), its own kind and crowding nearby, temperature error (tolerances), light, silt, bonds,
  speed, how its heading lines up with the food and with the danger, the current, a clock (a sine at
  the species' own rate, per-cell phase), and a constant 1.
- 16 -> 8 tanh -> 8 tanh, weights 8-bit snorm times `BRAIN_SCALE` (3), 208 bytes.
- The 8 outputs are gains on directions the cell senses (`BRAIN_DIRS`): food, danger, the jostle (the
  net push and pull of its neighbours' signatures, already summed for its motion), warmth (up the gradient), the current, its own heading, a smooth per-cell wander, and its
  kind's heading. Their sum, capped at length 1, times `swim × brainThrust`, is the stroke, held
  through the step (coarse steps too).

Steering by gains on sensed directions keeps the brain blind to the world's axes (no heading state, no
left or right), as the neighbour scan is.

Danger needs to know who eats whom: with the brain on, scatter marks each living particle's `Lite.kr`
with bit 13 (a flesh-eater) and 14 (a cropper of plants), from its genome.

## What it replaces

With the brain on, the hunger pulls (`K.hunt`, `K.forage` in the pair force), thermotaxis and swimming
straight on along the velocity are off; the brain's stroke takes their place. Signature forces, personal
space, bonds, stone, schooling (`align`) and the currents are unchanged: the body and its chemistry stay,
the intent moves to the brain. Plants and other non-swimmers are unaffected.

Swimming costs by the stroke: `K.thrustShare` (half) of a swimmer's swimming upkeep (`swimCost × swim`) is
charged per unit of stroke instead of always, so a brain that rests saves it and one that sprints pays.

## Evolution

- Founders (`archetypeGenome`): reflexes like the brainless rules (hunger to food, out of its warmth back
  toward it, on along its heading), a mild flight from danger, a little wander, faint noise. Their own
  random stream, seeded from the founder's hue, so seeded worlds keep their founders.
- Sparks of life (`randomInto`): random brains.
- Mutation (`mutateBrain`, CPU twin in `mutateLike`): every weight is drawn toward zero by `brainShrink × m`
  and gets the mutation's noise times `brainMut`, and with chance `m/4` one neuron's row is redrawn. Without
  the shrink, neutral drift walks every weight out to its limit within ten generations and brains saturate
  (gains stuck at ±1, the clock flipping them); with it, a weight stays large only while selection holds it.

## Observing it

The specimen panel's Behaviour section shows a Brain block for swimmers: each direction's gain in the
last decision, away (left) or toward (right). `mindMain` records the gains and the senses (mind words
58..82).
