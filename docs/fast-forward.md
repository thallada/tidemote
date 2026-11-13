# Fast-forward: coarse steps that keep the ecology

Fast speeds run the simulation faster than the GPU manages in 1/60 s steps by taking coarse steps, each
covering up to six ticks of 1/60 s. This note says how a coarse step works, why, how well it matches
normal steps, how to measure that, and what did not work, for whoever takes it further.

## How the page runs a speed

`updateTicks` (src/main.js) re-judges each second, in this order, the first that fits `GPU_BUDGET`
(a way earlier in the list is taken back only with a fifth of the budget to spare, and a way that no longer
fits is left at once):

1. 1/60 s steps with the world drawn every display frame;
2. coarse steps of 2..`MAX_TICKS` (6) ticks with the world drawn every display frame, in between steps
   (below);
3. 1/60 s steps with the world drawn about every `MAX_FRAME_MS` (30 ms): the camera, overlay and HUD keep
   the display's rate, carrying the last drawn image with the camera (engine `frame({ hold })`, `pHold`);
4. coarse steps of 2..`MAX_TICKS` ticks, also drawn about every 30 ms.

Past the speeds on offer (×512 at most) are two ways to run as fast as the GPU goes, both in `MAX_TICKS`
steps: Fast draws the world every display frame, in between steps, and Max about every 30 ms, which leaves
the steps more of the GPU (no slower on a 1M world in a 1280x800 window, 16% faster on a 4M one; more on
bigger screens). The speeds on offer are those Max reaches. A coarse step costs about what a 1/60 s step does (one scan of the neighbors), so 4 ticks
are about 4x faster. The census runs at most about five times a real second. Settings, Performance shows
Step ms, Draw ms, Stride (ticks a step) and Now (the speed reached).

At real time a step covers up to a frame of the rate aimed for, so a frame rate Auto lowers to 30, 20 or 15 fps
would take steps of 2, 3 or 4 ticks. It takes them only when the frame has no room for the 1/60 s steps they stand
for (`fineTicks`, src/main.js: by the GPU's timestamps, the drawing and that many 1/60 s steps within three quarters
of the frame, given up past 85%, judged each second). Coarse steps settle a crowd's pushes once for all their ticks,
and crowds drawn at 30 fps in 2-tick steps rattled (2026-11-12, seen on an M1 whose 32k world fell to 30 fps).
`tools/jitterlab.mjs` runs one world on from the same moment in 1- and 2-tick steps and samples every living cell
every 2 ticks, as a 30 Hz screen shows it; a cell's jitter is the RMS of its path's departure from a centered
5-sample moving average. Three 32k worlds grown 4 minutes, 4 s each (`runs/jitter/w32k-*.log`, local); 1/60 s steps'
jitter (1e-3 units; a cell's radius is about 85) and 2-tick steps' as a multiple of it, in each world:

| neighbors within 0.2 | position, 1 tick | 2 ticks | velocity, 1 tick | 2 ticks |
|---|---|---|---|---|
| 0-2 | 1.0-1.8 | 1.1-1.6x | 26-50 | 1.3-1.9x |
| 3-7 | 1.1-1.7 | 1.4-1.8x | 43-71 | 1.7-2.1x |
| 8-15 | 0.9-2.3 | 1.9-2.3x | 47-122 | 1.6-2.2x |

The crowded cells rattle about twice as much in 2-tick steps, in position and in the velocity the drawn heading
and squash follow. These paths are what the page draws at 30 fps: a coarse step drawn in between (below) is drawn
one step behind, and at a steady 30 fps barely part way along it, so each frame shows a step's start. At a target of 30
fps on the RTX 4070 Ti, in a 32k world grown at Max, it now takes two 1/60 s steps a frame where it took one of 2
ticks: 0.38 ms each against 0.41, the frame's GPU time 1.8 → 2.0 ms. The cost is about one more 1/60 s step a frame:
on an M1, whose 78k world's step took 3.9 ms (docs/performance.md), a 32k world's should take less, and only a frame
with a quarter of its time to spare takes it (judged by the step measured, which from coarse steps overstates a 1/60 s
one: a 2-tick step costs 1.1 to 1.45 times one, so a switch holds once the 1/60 s steps are measured). A frame
without that room keeps the coarse step, and its crowds rattle as before.

## Drawn in between

A coarse step moves the world 4-6 ticks at once. Drawn as it stands after each step, at real time (where
coarse steps come when Auto lowers the frame rate) it moved 10-15 times a second, and at fast speeds the world
drawn 30 times a second jumped. So where every display frame draws the world (real time, the second way above,
and Fast) it is drawn one step behind, part way along the last step: `LERP_WGSL` (`lerpApply` before the
frame's picks and drawing, `lerpRestore` before anything else runs or reads the world). A step leaves each
particle's start in `sortedFull[i]` and its end in `parts[i]` (lifeMain writes one from the other slot for
slot), so the blend needs only the ends kept aside (`lerpEnd`, 8 bytes a particle); a particle whose id
differs (born in the step) or that jumped half a unit is drawn where it is. How far along: the share of the
next step the clock already owes (`clock.owed`), at Fast the share of the next step the frame's budget has
earned (`perf.stepCredit`).

What the viewer sees is up to one step behind (67-100 ms at real time), so everything that marks or finds a
cell works on what is drawn: picks, tracking and the watched cells run after `lerpApply` and are stamped
with the moment drawn (`shownTime`), and the page's `viewSimTime` is that moment. Saves and other reads of
the world put the true positions back first (`_lerpBack`).

The selection's marker and the song marks are carried from their last sample on the cell's velocity and
eased onto each new one. Until 2026-10-29 the correction was measured from where the marker was drawn a
frame earlier, which took the cell's own motion over the frame for an error and kept the marker trailing it
(7-11 px at real time, 30-70 px at 16x), and a sample was carried at most 0.25 s of simulated time, which at
fast speeds is less than its age. Now the correction is measured from where the sample last drawn from puts
it now, and a sample is carried up to a quarter of a real second's simulated time (`carryMax`): about 1 px
at real time, about 11 px at 8-16x (more for a moment when the cell turns, as the sample is then 0.3-0.5 s
of simulated time old).

## How a coarse step works (src/shaders.js)

`sim.ticks` is the ticks a step covers and `sim.tick` the ticks simulated so far. Every coarse rule is
guarded by `sim.ticks > 1`, so 1/60 s steps are unchanged.

- **Rates.** The meal cadence counts ticks (an opportunity every `eatEvery` ticks in each cell's phase).
  Abiogenesis scales with the step (engine) and silt charges with the exact chance of at least one event
  in the step.
- **Motion** integrates in 1/60 s substeps under the forces gathered at the step's start (`cellWGSL`).
  A still body's bonds (and a still tree's bend) are held too, their stiffness in the correction below, and
  its tissue blends its cells' velocities as two bodies sharing momentum (Bodies below). A beating tree (a
  tail too) moves a tick at a time with its partners instead (`bodyTick`, one dispatch a tick): Beating
  bodies below.
- **Stiffness correction.** Holding forces across the step makes a dense clump numerically unstable (see
  below), so the pair and stone forces carry an implicit correction. The cell and its neighborhood are
  taken as two bodies sharing momentum: the reaction to its forces is spread over Mn neighbors (the
  participation number of the stiffness weights), their center `(v + Mn vNear) / (1 + Mn)` keeps its
  velocity under drag, and only the relative velocity `v - vNear` meets the restoring stiffness
  `D (1 + 1/Mn)`, backward Euler in its end value. `D` comes from the gradient of the pair and stone
  forces gathered in the scan (`jF`, `jS`, eigenvalues clamped to the restoring side) and of a still
  body's bonds (`jB`, `bondStiff`: 1 along a bond, 1 - r/l across it, and for a tree's bend `coarseBend`
  growStiff over the arm's length more across it), the bond partners weighted in `vNear` by the bonds'
  strength.
- **Events walk the ticks** (`lifeMain`): energy and upkeep per tick; division at the tick the energy
  crosses the mark (one birth a step), into a grain that came within reach at any tick of the step (the
  closest approach of their paths); a meal at each of its opportunities while hungry then, from the four
  best targets gathered at the step's start (food is gathered whatever the starting hunger), the next one
  after a meal or a claim lost to another eater; death at the tick it starves or ages out.
- **Claims.** A walk's meal claim names its target class itself (`MEAL_CLAIM`). Bites of a
  photosynthesizer are counted rather than exclusive, and `resolveCount` applies at most one a tick.

### Why the correction

A dense core is a stiff spring network. A predator with ~90 neighbors inside its core, each of stiffness
about `force / (beta R)` ~ 36/s², has omega ~ 40 rad/s: omega dt ~ 0.65 at 1/60 s, but ~2.6 with forces held
over 4 ticks, past the explicit limit of 2. Without the correction the clump heats and loosens until enough
neighbors leave the core: at 4 ticks predators moved 2.8x faster than at 1/60 s, grazers +38%, and core
overlap fell 10-33%, which also hid a deficit in kills (hot predators find prey more easily).

`tools/fastforward/stiff-modes.py` checks a scheme mode by mode on a lattice (mode eigenvalue lam in
[0, 2D], D a cell's own stiffness) against 4 explicit 1/60 s ticks. What it showed:

- each cell integrating its own linearized motion against neighbors held still amplifies a pair's
  relative mode by up to 3x a step once omega dt > pi/2;
- backward Euler in the predicted displacement against neighbors drifting at `vNear` goes unstable on
  the top modes past D ~ 400-800 /s², exactly where dense soups live;
- dropping the neighbors' drift is stable but drags clumps that drift together; neighbors keeping the
  mode's shape is stable but stops a cell that hits a resting neighbor (momentum lost, every guild slow);
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

### With heat

Tested after heat (docs/thermal-energy-2026-10-07.md), on the pinned code, data in `runs/thermal-ff/`
(local; summarized in `NOTES.md` there).

- **Heat itself matches at 4 ticks.** Over 128 long runs, felt temperature, preferred temperatures, torpor,
  heat-makers, scalding, framboids and the water's field agree within error; in forks each guild's thermal
  performance agrees within 0.004, and worlds held at 6° and 26° match as closely (births +0.2%, −1.5%).
- **Rates in forks** over ~130 worlds (10 and 25 min old, held cold and hot) match within ~2% on average;
  a few dense predator-rich worlds drift 10–47%. Worlds grown and forked with heat off show the same
  outliers as often, so they are the dense-core limit above. Heat packs worlds about twice as densely
  (huddling) without making them less faithful.
- **A 2x2 at 30 min** (heat on/off × 1/60 s, 4 ticks, 128 seeds each): the step's effect is within batch
  noise (its sign flips between heat on and off); heat's effect is the same at both steps.
- **Over 90 minutes** heat drives a strong succession (a grazer era giving way to scavengers and
  producers), and 4 ticks plays it out more slowly (late effective species 90 vs 119, 32 seeds); with heat
  off 4 ticks keeps pace (100 vs 108). A coarse step's limit worth knowing for long fast-forwards.


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
  kill funnel (prey in reach, tried, missed, lost, won); contact density (animals within reach); torn
  bonds and deep overlaps between species. lifeMain's speed sample is taken before contact and inflated at
  coarse steps, so forks also record each cell's displacement over the first second. `K.diag` 2 counts the
  per-guild ledgers by a producer's form; `tools/fastforward/forms.py` compares forms' growth, demography,
  energy and the counts.
- **Decomposition:** `eventTicks`-style batching (meals and division every Nth tick with 1/60 s motion)
  separated event timing from motion; worth rebuilding as a tunable if a question needs it again.
- `sim.mjs --step N --profile` times each pass.
- **Heat:** every sample carries a `thermal` block (the water, what the living felt, preferred temperatures,
  torpor, heat-makers, scalding, framboids, and the water's field against the background), and run outcomes
  summarize it; forks record the same per fork, and `K.diag` adds each guild's thermal performance and its
  offset from the optimum. `--temp T` (sim, ensemble, fork) holds the water at T degrees.
  `fork-heat.cjs` compares heat between variants, `fork-worlds.cjs` lists each fork world's mix, crowding,
  heat and deviations, `heat-pool.mjs` sets ensembles side by side with paired differences, `history.mjs`
  counts busts, extinction pulses and guild crashes and recoveries over each run, `trajectory.mjs` bins runs
  by time, and `guild-flows.mjs` gives per-capita demography and energy. `ensemble.mjs --resume` skips seeds
  already done or claimed, so two ensembles can share one directory.

### Contact (2026-10-28)

Contact (`contactMain`, the push of overlapping bodies, their hold and the crowd's viscosity) came after
the correction above and is not in it. By 10-28 its explicit push, held for the step's ticks, had eroded
4-tick fidelity the correction had won (at the 10-08 merge 4 ticks matched within ~2%): in matched forks
at 4 ticks packing fell 8-22%, cells moved 50-140% faster and producers bred 31% more (most at 12 ticks:
packing -50%, producer births +380%). Bisecting found no single commit; contact ablations found the push
(push off: +30% packing at 4 ticks; all contact off: within 2%). Summed over a crowded cell's overlaps the
push is stiff (20-35 rad/s), past the explicit limit when held over 4+ ticks.

So on coarse steps both are two-body, like the correction: the viscosity decays only the relative velocity
(at one tick exactly the 1/60 s rule), and the push meets its own stiffness `bodyPush · Σ cs/touch ·
(1 + 1/n)` implicitly, damped by `pushTheta` of backward Euler's `1 + k dt²`. Full backward Euler (1)
overpacks (+9-11% at 4 ticks, +25-37% at 8-12); 0.25 keeps packing within about 6% at 4 and 8 ticks.

Ensembles of 64 seeds × 30 min at 32k (eras on; runs/stride, pooled by its `compare.py`, a one-off kept outside the repo; `tools/fastforward/pool.mjs`
does the same for long runs), mean ± 95%:

| step | eff. species | Hill2 | living | top share | diet P/G/Pr/S |
|---|---|---|---|---|---|
| 1 | 113.5±5.5 | 37.1±2.2 | 0.33 | 0.14 | .30/.45/.15/.10 |
| 4, explicit push | 106.2±5.8 | 34.1±2.0 | 0.33 | 0.14 | .29/.46/.15/.11 |
| 6, explicit | 94.2±4.3 | 27.2±1.6 | 0.41 | 0.17 | .28/.45/.19/.09 |
| 8, explicit | 84.7±3.8 | 21.2±1.3 | 0.51 | 0.22 | .28/.38/.26/.08 |
| 12, explicit | 74.4±3.9 | 18.7±1.2 | 0.47 | 0.26 | |
| 4 | 110.9±5.5 | 35.7±2.1 | 0.32 | 0.13 | .26/.48/.16/.10 |
| 6 | 107.5±5.3 | 33.0±1.9 | 0.34 | 0.15 | .23/.52/.17/.08 |
| 8 | 97.3±5.3 | 29.3±1.8 | 0.37 | 0.16 | .26/.48/.17/.09 |

Swimming (swimlab, 12 beat genotypes: amplitude 0.25/0.5, 0.6-3 Hz, wave 0.3/0.8 rad a cell): a beat
pulls once a step, so at 8 ticks (7.5 pulls a second) a 3 Hz beat is barely sampled and beating
filaments tear (75-100% of samples past bond breaking), at 12 all of them. Up to 6 they hold. The pull's
gain grows three tenths a tick past the first (refit 2026-10-29; it was a fifth, fitted at 4 ticks on a
few genes), and beating bodies keep this much of their 1/60 s speed (median over the genotypes):

| ticks | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|
| filament (12 cells) | 0.94 | 0.93 | 0.89 | 0.81 | 0.73 |
| mat of 19 with a tail of 8 | 1.02 | 1.03 | 0.93 | 0.79 | 0.66 |
| filament, gain a fifth a tick | 0.91 | 0.74 | 0.60 | 0.52 | 0.45 |

The fastest genotypes (long waves at 1.5-3 Hz) lose the most, about half their speed at 6 ticks: more
gain overdrives them (a steeper gain held the median at 1.0 but cut those to a fifth), a higher cap on
the swing tears them, and a beat reckoned tick by tick inside the step, its partners predicted, stalled
the wave (the partners' motion is not knowable from one cell). Mats hold together at 6 ticks: a still
24-cell mat keeps its lattice and spacing (mean nearest neighbor 0.136 against 0.132 at 1/60 s).

Earlier swimlab "mats" were not: the test genome grew every cell as a tree's, and `mat:N:0:0` built a
6-cell chain (a zero tail count read as the default), so a mat said to swim 150-190% at 6 ticks was a
tree. Measuring real ones found a leak at 1/60 s: a cell pulled on a partner that did not pull back (a
bond taken up in this step's scan, or one past the three keepers a cell reads), and bodies pushed
themselves along, a still 19-cell mat at 0.040 units/s. Bonds now pull only when both ends hold them
(still mat 0.002 units/s; tailed mats swim as resistive force theory predicts from their own motion).

A cell packed in tissue has six neighbors, and with three keepers read back 14-22% of kept bonds on busy
worlds stayed one-sided, so hub cells let go and mats fell into clumps. The bond table now holds six
(`BACK`; nine words a cell: the two kept, the count, six keepers, filled by `bondBackMain`), every bond
pulls both ways and bodies keep main's shapes. Two tunables then put back what the leak had given:
mats that no longer drift fed their cells too well and took over, so bodies share energy at
`bodyShare` 1 (was 2); and mats lost their free drift, so a tail beats `tailGain` 1.3 times as hard as a
tree's (it carries its whole body; one-tailed mats are back to main's speed at 1/60 s; at 1.6 the
fastest slow down, at 2 bodies tear). Extra tails do not help: tails spread round the edge and cancel
(one tail 0.028 units/s, two 0.004, three 0.003). The six-keeper table costs about 0.03 ms of a 1M
world's step (`scatterMain` 0.35 → 0.38 ms, `lifeMain` unchanged).

Ensembles of 64 seeds × 30 min at 32k (farm, runs/swimfix), mean ± 95%:

| | eff. species | Hill2 | late guilds | food webs |
|---|---|---|---|---|
| 1 tick, before (the leak) | 113.5±5.5 | 37.1 | 3.48 | 0.94 |
| 1 tick, three keepers (348b060) | 109.0±5.7 | 35.0 | 3.27 | |
| 1 tick, six keepers | 102.6 | 32.7 | 3.30 | 0.95 |
| + `bodyShare` 1 | 105.9 | 33.6 | 3.53 | 0.95 |
| + `tailGain` 1.3 (the default) | 110.6±5.7 | 35.9 | 3.33 | 0.89 |
| 6 ticks, before | 107.5±5.3 | 33.0 | 3.31 | 0.88 |
| 6 ticks, the default | 106.2±5.4 | 32.6 | 3.33 | 0.89 |

Late guilds swing about 0.2 between ensembles of nearly the same rules, so the default is within noise of
main at both step lengths. The gate (32 seeds) passes with every metric the same: effective species 112
(112), late guilds 3.53 (3.50), food webs 100% (97%).

So `MAX_TICKS` is 6: fast speeds take the shortest step that fits, Max always 6. At 8 beating bodies tear,
diversity is still 14-21% down, and 8 ticks would be only about 24% faster than 6.

Cost (RTX 4070 Ti, a 4M world, one step): 9.5 ms at 1 tick, 12.2 at 4, 12.4 at 6, 13.4 at 8, so 6 ticks
run the world 4.6x faster than 1/60 s steps and 8 ticks 5.7x.

### Bodies (2026-10-31)

At 6 ticks the mix of body types drifted over a long run, though diversity held: mats fell to less than
half their share at 1/60 s, chains of 2-5 cells grew 4-5x, and producers turned to growing as trees (58% of
producer cells against 17%). It predated the bond and tail work (348b060 did the same), and 2-3 ticks kept
the mix. Ensemble outcomes are many steps away from a cause, and none of the contact fixes tried first
moved them, so the step was measured where selection acts instead: matched forks with the per-guild
ledgers counting producers by body form (`K.diag` 2) and K.diag's counts of torn bonds, compared by
`tools/fastforward/forms.py` (counts of division and buds, since dropped, showed what follows). A 60 s fork from a 10-minute world shows the
drift (8 worlds x 4 reps): at 6 ticks tree producers grew 21.6 %/min faster than at 1/60 s (+-5.6), with
114% more births, and packed producers 9.5 %/min slower; it takes minutes, not ensembles of hours.

What it found:

- **Trees tore and regrew.** A tree's bonds broke 100-400 times as often at 6 ticks (none at 2, 18x at
  4). A tree's cell has a free bud only when a daughter is missing, so a torn daughter frees it and the
  tree buds again: births doubled. The cause is the bend: growStiff x bond x adhesion over the spacing,
  ~30 rad/s, held explicitly over 6 ticks (past omega dt = 2 at about 4.3 ticks), flinging cells off. The
  tears are stretches just past the break (1.17x), not jumps, no newborns among them.
- **Bonds against stale partners.** Reckoned afresh each tick toward partners carried on their start
  velocities, a stiff bond rings: in `tools/fastforward/chain.py` (a chain of cells under this scheme)
  bond stiffness past ~120/s^2 grows each step at 6 ticks, and every explicit variant (recomputing the bend
  each tick, mirroring the partner's reaction, implicit substeps) still blows up for a stiff bend; only the
  stiffness correction's two-body backward Euler holds every mode (0.83 a 0.1 s step against 0.84 at 1/60 s).
- **Tissue swung pairs past each other.** The tissue blend (12/s) toward the partners' velocities held
  from the step's start leaves -0.5 of a pair's relative velocity after 6 ticks (1/60 s steps: 0.05).
- **Anchored cells barely parted.** contactMain's hold sets one separating speed for the whole step, and
  an anchored cell (holdfast 0.1: half its speed lost in ~0.02 s) loses it within two ticks: it undid 18%
  of an overlap where 1/60 s steps undo 67%, so mats packed 12-25% tighter and were eaten 15-30% more.

So on coarse steps a still body's bonds and a still tree's bend are held from the step's start and taken
into the stiffness correction (their exact stiffness for bonds, `coarseBend` 0.5 across each arm for the
bend: 1 overdamped bonds along the arm, 0 left trees +65% births), tissue blends as two bodies sharing
momentum, and an anchored cell's hold asks the speed that moves it through its drag as far as 1/60 s steps
would (a drifting cell's is left as it was: asked more, beating bodies part and swim 1.6x too fast).
1/60 s steps are unchanged.

Forks (60 s, 4-minute and 10-minute worlds, 6 ticks against 1/60 s): tree producers' births +4-19% (were
+95-220%), their growth within noise of 1/60 s, packed producers' overlap and packing within 1-3% (were
+15-47%), torn tree bonds 10-40x 1/60 s's (were 100-400x). Long runs, 30 min at 32k, share of the living
at 20-30 min:

| | mats | chains 2-5 | swimmers 2-5 | filaments | branched | tailed (worlds with) | producers as trees | eff. species |
|---|---|---|---|---|---|---|---|---|
| 1 tick (64, 9a2ff06) | 13.2% | 3.7% | 2.2% | 1.77% | 1.24% | 1.36% (75%) | 17% | 111 |
| 6 ticks, before (64) | 5.8% | 17.0% | 4.8% | 0.67% | 0.51% | 0.83% (44%) | 58% | 106 |
| 6 ticks (64) | 8.5% | 9.3% | 6.6% | 1.66% | 0.98% | 0.79% (59%) | 37% | 110 |

(Means over 64 worlds have about +-2.4 points on mats and chains, +-11 on effective species: the
diversity is 1/60 s's, the body mix half way back.) Swimming (swimlab, 12 genotypes) is as before: filaments 0.89 of their 1/60 s speed with 1.59x the bend,
tailed mats 1.01 with 2x. A coarse step costs 2% more (1M world: 5.07 -> 5.18 ms, `lifeMainCoarse` 3.59 ->
3.75). The gate (32 seeds, 1/60 s) passes with every metric the same (effective species 108 against 112,
food webs 94% against 97%).

What was left: beating bodies kept the old scheme (their bonds pulled each tick toward predicted partners;
holding them too halved animal trees' excess in forks but sped tailed mats up 1.2x and left more small
swimmers in long runs; holding their bend stops the wave), and small beating swimmers were 3x their 1/60 s
share (Beating bodies, below, ends that); and deep overlaps between
species (closer than half their radii summed) grow with the step at any length (per cell: 0.003 at
1/60 s, 0.014 at 2 ticks, 0.085 at 6), across every pair of guilds, not from cysts or newborns, and not
from a hungry forager's appetite or core (off at coarse steps: 0.085 -> 0.042) - they did not shift the
body mix at 2 ticks.

### Beating bodies (2026-11-01)

The excess of small swimmers at 6 ticks was beating producers: 5% of producer cells at 1/60 s, 23-25% at 6
ticks. In matched forks (`K.diag`'s torn bonds, 6 worlds) 6-tick steps tore beating trees' bonds a third
more often, and the fragments, 2-3 cell beaters, grew 12.5 %/min faster while long swimmers shrank; bonds
that could not tear took the excess away. A tail's bonds tore most: 15% of torn bonds at 6 ticks, 1% at
1/60 s.

The coarse beat could not be fitted right because one cell cannot know its partners' motion. Each cell
reckoned its 6 ticks alone, its partners carried on their velocities from the step's start; a beating
body's cells swing against each other within a tick or two (the drag across a branch halves a cell's
sideways speed every tick, the muscles mix a quarter of each bond's relative velocity a tick), so those
partners were wrong within the step. `tools/steplab.mjs` runs one coarse step and its six 1/60 s steps
from the same moments across the beat and compares where each cell ends: on a 5-cell filament (amplitude
0.5, 1.5 Hz, wave 0.8 a cell) every per-cell scheme tried left about a third of the motion wrong. RMS over
16 moments, 1e-3 units (sideways displacement 61 a step) and 1e-2 units/s (end velocities 64 across, 39
along):

| scheme | sideways | along | end velocity across | along |
|---|---|---|---|---|
| main (beat once a step, fitted gain) | 17.7 | 11.8 | 33.1 | 26.8 |
| bonds held in the stiffness correction | 18.5 | 13.4 | 32.8 | 32.6 |
| the crowd's viscosity a tick at a time | 19.6 | 10.8 | 35.5 | 19.3 |
| the beat a tick at a time, partners' swing predicted (1/60 s's steady wave) | 14.4 | 12.7 | 20.4 | 23.3 |
| substeps (`bodyTick`) | 1.9 | 1.8 | 2.3 | 2.7 |

So a coarse step now moves a beating tree (a tail too) a tick at a time with its partners. `lifeMain`
gathers everything else as it does for any cell (forces and their stiffness correction, stone, taxis,
swimming, a ridden body's will, the stranded film) and hands it over in the bond table's second region
(`handOver`, SW words a cell after the BW bond words: `lifeMain` is at its ten storage buffers), marked
with the step (the engine clears the marks when a world is put back to an earlier step), and leaves the
cell where it was. `bodyTick` then runs once a tick: each such cell moves as a 1/60 s step moves it, through
drag (across its arm sideDrag times as hard), the push it was handed, its bonds and bend (`bendOn`), its
muscles (`beatPull`), the water's flow and the viewer's hand, reading itself and its partners where the
last tick left them
(`treePos` and `treeVel` read the tick's state in `bodyTick`'s pipeline, `SUBSTEP`, so the bend and the
muscles are the functions 1/60 s steps run; the tree itself is the step's, as its bonds are). The first
tick lists the cells it moves; the rest run over that list. The coarse beat's tunables (`beatMixC`,
`beatBendC`, `beatSlopeC`, `beatCurveC`), the predicted partners and the per-tick bond pull are gone.
Bodies bearing tails were moved by substeps too at first (their tissue, their share of the tails' bend):
in a world grown under the substeps their cells were 15% of the living (most of them tail-less mats of a
species with the gene) and cost more than all else the substeps did, for a slightly firmer tail base in
the swim lab; they keep the still body's step. The crowd's viscosity among a tree's partners, taken a tick
at a time in `bodyTick` too at first (with `contactMain` leaving the partners out), stays `contactMain`'s,
once a step as two bodies sharing momentum: the step lab's error was smaller without it (1.9 against 2.5
sideways on the 5-cell filament, its travel exact) and the partner test cost `contactMain` 3-35%.

Swimming (swim lab, 12 genotypes, mean |speed - 1/60 s speed|, units/s):

| | 3 cells | 5 cells | 12 cells | tailed mat 12+5 | tailed mat 19+2x6 |
|---|---|---|---|---|---|
| main at 6 ticks | 0.036 | 0.047 | 0.039 | 0.010 | 0.003 |
| substeps at 6 ticks | 0.003 | 0.004 | 0.002 | 0.009 | 0.002 |

Bend amplitude and the longest bond follow 1/60 s too (5-cell fast beat: speed 0.347 against 0.337,
bend 0.43 against 0.42, longest bond 0.217 against 0.217; main 0.077, 0.55, 0.331). A tailed mat's tail
follows less well: a long wave bends as at 1/60 s (0.23 rad against 0.21, main 0.48), but a fast one
overbends (0.57-0.76 against 0.41-0.50), and on a 19-cell mat with two tails their bases stretch to 0.36
against 0.28 (main 0.30): the mat it pulls on moves by the still body's step (substepping the mat as
well held its bases to 0.28).

Long runs, 64 worlds x 30 min at 32k, share of the living at 20-30 min (+- standard error; 1 tick and
the old 6 ticks at 9a2ff06, main at 6 ticks 32 worlds at ae5d2e4, substeps 64 worlds at this commit):

| | mats | chains 2-5 | swimmers 2-3 | 4-5 | 10+ | filaments | tailed | producers as trees | beaters of producers | eff. species (late) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 tick | 13.2+-1.2 | 3.7+-0.5 | 1.55+-0.32 | 0.69 | 0.93 | 1.77 | 1.36 | 17+-3 | 5.0+-1.9 | 111 |
| 6 ticks, before the body fix | 5.8 | 17.0 | 3.45 | 1.35 | 0.32 | 0.67 | 0.83 | 59 | 15.1 | 106 |
| 6 ticks, main | 7.8+-1.6 | 9.9+-1.9 | 5.61+-1.57 | 1.83 | 0.35 | 1.85 | 0.59 | 37+-6 | 22.6+-5.8 | 103 |
| 6 ticks, substeps | 10.6+-1.1 | 4.6+-0.5 | 1.03+-0.15 | 0.53 | 0.73 | 1.78 | 1.05 | 23+-3 | 3.6+-1.1 | 106 |

The small swimmers' excess is gone (a few fewer than at 1/60 s now, within two standard errors), mats and
long swimmers are back, and diversity rose with them (late Hill2 34.3 against main's 32.1 and 1/60 s's
35.9; food webs 91%, late guilds 3.41; no metric of `ensemble.mjs` differs from 1/60 s's). Producers still
grow as trees a little more often than at 1/60 s (still trees, the bend held in the correction above), and
4 of the 64 worlds collapsed (none at 1/60 s; 3 of 64 before the body fix, 1 of 32 on main): coarse steps
collapsed as often before. The 1/60 s gate passes (and against main's own gate every metric is the same).

Cost (RTX 4070 Ti, 1M worlds, `bench.mjs` step, main against substeps in turn, three page loads each):
on a world grown 20 minutes at Max under the substeps (591k living, beating trees 0.8% of them) a 6-tick
step takes 4.21 ms against main's 4.16 (`bodyTick` 0.16 ms, `lifeMainCoarse` 0.2 ms less: its beating
cells' loop is gone); on the older perf world, grown under the old beat with beating trees 18% of the
living, 4.06 against 4.34. 1/60 s steps are unchanged (3.49 against 3.47, 3.25 against 3.21). The
substeps keep their words in the bond table's second region (18 a cell and a mark: 112 bytes a cell in
all, 36 before). Getting there: with tailed bodies substepped and the handover at `lifeMain`'s end,
`lifeMainCoarse` cost 0.65 ms more than main's on that world (both undone at once, the handover now
before the motion loop); marks kept with each cell's words cost the first tick's pass over every living
cell 0.1 ms; caching each moving cell's tree for the later ticks was slower than reckoning it again; the
substep state is read only in `bodyTick`'s pipeline (`SUBSTEP`), so 1/60 s steps compile as before.

## What did not work

- A force-gradient model (forces following the predicted displacement, explicit or implicit per cell),
  restoring-only versions, and thermostats (an extra drag, on all or on the fluctuation): each fixed some
  worlds and not others; the mode analysis above says why.
- Substep passes over neighbor lists: ~37% of a scan each, lists too small for dense cores (48 of ~90
  neighbors) and too big for 2M particles.
- Sampling fewer neighbors at coarse steps (1.5x faster but biased: silt and food in reach are seen
  only when sampled, and light is convex in noisy crowding); a tiled scan in workgroup memory (no faster
  than the cache).
- On the event side, none of these mattered beyond ~1%: judging hunger at the meal's tick, denying meals
  to cells already out of energy within the step, retrying a lost claim through all four targets, placing
  a child relative to its moving parent, one bite a step.
- For the body mix (2026-10-31): contact's push softer or explicit (`pushTheta` 0, 0.1), speculative
  contact, a stronger hold for every cell (x2, x4), the stiffness correction off or halved, the grain's
  closest approach in reach (off: the same), coarse bites of a plant limited to its ticks (none were
  over), the coarse aim at the mother's path, the contact push reckoned in lifeMain's scan and held in the
  correction (mats packed 80-100% tighter), the correction's drag split along and across a branch (little),
  a bend taken as the same stiffness every way (bonds stayed stretched and tore).
- Raising the stiffness correction's damping for predators, or adding the anti-restoring (attraction)
  stiffness: hotter or over-damped. Halving the stiffness where the step resolves a clump looked ideal in
  the mode model but overheated the simulation.
- For beating bodies (2026-11-01), each cell reckoning its step alone: the beat a tick at a time with the
  partners mirroring this cell (no thrust), keeping their full swing (overdriven: a long wave 6-10x its
  1/60 s speed, and with the bend held firmly bodies folded into zigzags) or the steady swing 1/60 s steps
  give a long chain (overbent 2-9x in long runs); bonds held into the stiffness correction; the crowd's
  viscosity a tick at a time (its map clean, but crowded bodies lost their damping and tore more); no
  extra gain at 6 ticks (tails tore as at 1/60 s, swimming still slow). One-step errors in Beating bodies.

## Past 4 ticks (before 2026-10-28)

What follows was written with the push explicit (see Contact above, which moved the limit to 6).


At 6 ticks motion is stable in the mode model and the 30 s rates nearly match with the walk, but packing
does not: predator overlap -10 to -18%, grazer -9%, predators' prey within reach -10 to -16%, and predator
speed swings from -26% to +51% between worlds. Batching events alone (with 1/60 s motion) costs half of the
prey-within-reach loss. Stronger damping, switching off alignment, bonds or the hunt and forage pulls, and
birth placement change nothing; backward Euler at 1/60 s leaves packing unchanged, so 1/60 s packing is not
an integration artifact. The likely limit: a fast predator moves 0.1-0.2 a 6-tick step, about a core radius,
so neighbors enter and leave cores within the step, beyond any linearization about its start. More force
evaluations a step would cost about what the longer step saves, so 4 ticks is the page's limit. A cheaper
full-quality scan would be the remaining speed lever.
