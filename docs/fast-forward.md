# Fast-forward: coarse steps that keep the ecology

Fast speeds run the simulation faster than the GPU manages in 1/60 s steps by taking coarse steps, each
covering up to four ticks of 1/60 s. This note says how a coarse step works, why, how well it matches
normal steps, how to measure that, and what did not work, for whoever takes it further.

## How the page runs a speed

`updateTicks` (src/main.js) re-judges each second, cheapest first:

1. 1/60 s steps with the world drawn every display frame;
2. 1/60 s steps with the world drawn about every `MAX_FRAME_MS` (30 ms): the camera, overlay and HUD keep
   the display's rate, carrying the last drawn image with the camera (engine `frame({ hold })`, `pHold`);
3. coarse steps of 2..`MAX_TICKS` (4) ticks, also drawn about every 30 ms.

Max always takes `MAX_TICKS`. The speeds on offer are those the GPU fits within `GPU_BUDGET` in the
coarsest steps. A coarse step costs about what a 1/60 s step does (one scan of the neighbours), so 4 ticks
are about 4x faster. The census runs at most about five times a real second. Settings, Performance shows
Step ms, Draw ms, Stride (ticks a step) and Now (the speed reached).

## How a coarse step works (src/shaders.js)

`sim.ticks` is the ticks a step covers and `sim.tick` the ticks simulated so far. Every coarse rule is
guarded by `sim.ticks > 1`, so 1/60 s steps are unchanged.

- **Rates.** The meal cadence counts ticks (an opportunity every `eatEvery` ticks in each cell's phase).
  Abiogenesis scales with the step (engine) and silt charges with the exact chance of at least one event
  in the step.
- **Motion** integrates in 1/60 s substeps under the forces gathered at the step's start (`cellWGSL`);
  bonds pull toward where the partners will be, carried on their velocities.
- **Stiffness correction.** Holding forces across the step makes a dense clump numerically unstable (see
  below), so the pair and stone forces carry an implicit correction. The cell and its neighbourhood are
  taken as two bodies sharing momentum: the reaction to its forces is spread over Mn neighbours (the
  participation number of the stiffness weights), their centre `(v + Mn vNear) / (1 + Mn)` keeps its
  velocity under drag, and only the relative velocity `v - vNear` meets the restoring stiffness
  `D (1 + 1/Mn)`, backward Euler in its end value. `D` comes from the gradient of the pair and stone
  forces gathered in the scan (`jF`, `jS`, eigenvalues clamped to the restoring side).
- **Events walk the ticks** (`lifeMain`): energy and upkeep per tick; division at the tick the energy
  crosses the mark (one birth a step), into a grain that came within reach at any tick of the step (the
  closest approach of their paths); a meal at each of its opportunities while hungry then, from the four
  best targets gathered at the step's start (food is gathered whatever the starting hunger), the next one
  after a meal or a claim lost to another eater; death at the tick it starves or ages out.
- **Claims.** A walk's meal claim names its target class itself (`MEAL_CLAIM`). Bites of a
  photosynthesiser are counted rather than exclusive, and `resolveCount` applies at most one a tick.

### Why the correction

A dense core is a stiff spring network. A predator with ~90 neighbours inside its core, each of stiffness
about `force / (beta R)` ~ 36/s², has omega ~ 40 rad/s: omega dt ~ 0.65 at 1/60 s, but ~2.6 with forces held
over 4 ticks, past the explicit limit of 2. Without the correction the clump heats and loosens until enough
neighbours leave the core: at 4 ticks predators moved 2.8x faster than at 1/60 s, grazers +38%, and core
overlap fell 10-33%, which also hid a deficit in kills (hot predators find prey more easily).

`tools/fastforward/stiff-modes.py` checks a scheme mode by mode on a lattice (mode eigenvalue lam in
[0, 2D], D a cell's own stiffness) against 4 explicit 1/60 s ticks. What it showed:

- each cell integrating its own linearized motion against neighbours held still amplifies a pair's
  relative mode by up to 3x a step once omega dt > pi/2;
- backward Euler in the predicted displacement against neighbours drifting at `vNear` goes unstable on
  the top modes past D ~ 400-800 /s², exactly where dense soups live;
- dropping the neighbours' drift is stable but drags clumps that drift together; neighbours keeping the
  mode's shape is stable but stops a cell that hits a resting neighbour (momentum lost, every guild slow);
- the two-body form is stable for every mode up to and past where 1/60 s itself fails (D ~ 2/h² ~ 7200),
  leaves a common drift exact and shares momentum (unresolved collisions become inelastic).

## Fidelity

Long runs: 128 seeds, 30 minutes, 32k particles, eras on, against the pooled normal runs
(`node tools/fastforward/pool.mjs ff-m4`; reports in `balance/fastforward/`).

| | Eff. species | Hill2 | Living | Food web |
|---|---|---|---|---|
| normal (1/60 s) | 79.7 +/- 4.5 | 29.6 +/- 1.7 | 0.507 | 0.55 |
| **4 ticks (page, `ff-m4`)** | **72.1 +/- 3.7** | **27.4 +/- 1.5** | **0.513** | **0.52** |
| 4 ticks, an earlier batch | 81.3 +/- 3.7 | 29.3 +/- 1.5 | 0.533 | 0.52 |
| 4 ticks, before the correction and the walk | ~78.7 | ~28.6 | 0.568 | 0.58 |
| 6 ticks | 71.7 | 26.0 | 0.555 | 0.54 |
| 8 ticks | 66.9 | 24.2 | 0.552 | 0.48 |

At 4 ticks everything is within noise of normal (the two 128-seed batches bracket it), and the living
excess is gone. In 30 s forks
over 16 worlds the rates match within ~2% (births, starvation, kills, scavenging). The 32-seed balance gate
passes, as it must: 1/60 s steps are unchanged.

**Noise.** Two 64-seed batches of one configuration differ by up to ~8 effective species, and one 32-seed
normal ensemble gave food webs 0.41 and 71.8 effective species. Judge diversity on 128 seeds; judge a
mechanism on matched forks over at least 16 worlds, switching seeds between hypotheses. Effects seen on
3-4 worlds repeatedly failed to reproduce.

## Measuring

- **Long runs:** `tools/gpu-node.sh tools/ensemble.mjs --runs 128 --step 4 --out runs/NAME`, then
  `pool.mjs`. Run long queues from a pinned git worktree (each seed reads `src/` from disk).
- **Matched-start forks:** `tools/fork.mjs --warm 600 --horizon 30 --reps 16 --k '{"diag":1}' --variants
  '[{"name":"m1","step":1},{"name":"m4","step":4}]'` grows one world in 1/60 s steps, sets it aside on the
  GPU and runs that moment forward under each variant (tunables compile one engine per set), paired by
  rep, so 30 s and 16 reps resolve +/-1-2%. Warm-ups are not reproducible (GPU nondeterminism): compare
  variants within one run, and worlds with `tools/fastforward/fork-meta.cjs` (rates; `mX:tag` variants
  compare with `m1:tag`, for ablations that change the ecology), `fork-diag.cjs` (per-guild diagnostics)
  and `fork-hist.cjs` (energy distribution).
- **K.diag** counts per guild (`DIAG_SLOTS`): once a second per cell crowding, silt, packing, kin, speed,
  light, hunger, food in reach, pair force, energy and core overlap; at hunters' kill opportunities the
  kill funnel (prey in reach, tried, missed, lost, won); and contact density (animals within reach).
- **Decomposition:** `eventTicks`-style batching (meals and division every Nth tick with 1/60 s motion)
  separated event timing from motion; worth rebuilding as a tunable if a question needs it again.
- `sim.mjs --step N --profile` times each pass.

## What did not work

- A force-gradient model (forces following the predicted displacement, explicit or implicit per cell),
  restoring-only versions, and thermostats (an extra drag, on all or on the fluctuation): each fixed some
  worlds and not others; the mode analysis above says why.
- Substep passes over neighbour lists: ~37% of a scan each, lists too small for dense cores (48 of ~90
  neighbours) and too big for 2M particles.
- Sampling fewer neighbours at coarse steps (1.5x faster but biased: silt and food in reach are seen
  only when sampled, and light is convex in noisy crowding); a tiled scan in workgroup memory (no faster
  than the cache).
- On the event side, none of these mattered beyond ~1%: judging hunger at the meal's tick, denying meals
  to cells already out of energy within the step, retrying a lost claim through all four targets, placing
  a child relative to its moving parent, one bite a step.
- Raising the stiffness correction's damping for predators, or adding the anti-restoring (attraction)
  stiffness: hotter or over-damped. Halving the stiffness where the step resolves a clump looked ideal in
  the mode model but overheated the simulation.

## Past 4 ticks

At 6 ticks motion is stable in the mode model and the 30 s rates nearly match with the walk, but packing
does not: predator overlap -10 to -18%, grazer -9%, predators' prey within reach -10 to -16%, and predator
speed swings from -26% to +51% between worlds. Batching events alone (with 1/60 s motion) costs half of the
prey-within-reach loss. Stronger damping, switching off alignment, bonds or the hunt and forage pulls, and
birth placement change nothing; backward Euler at 1/60 s leaves packing unchanged, so 1/60 s packing is not
an integration artifact. The likely limit: a fast predator moves 0.1-0.2 a 6-tick step, about a core radius,
so neighbours enter and leave cores within the step, beyond any linearization about its start. More force
evaluations a step would cost about what the longer step saves, so 4 ticks is the page's limit. A cheaper
full-quality scan would be the remaining speed lever.
