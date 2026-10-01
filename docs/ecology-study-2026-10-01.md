# Ecology balance study, 2026-10-01

A record of the first headless study of Tidemote's ecology, the decisions it drove, and what the next
person should do. It is written for an agent picking the work up on a different machine, ideally one
with a real GPU.

## 1. Context

Tidemote is a particle-life biosphere on WebGPU (`README.md` explains the model). Until this study the
ecology was kept diverse by four global regulators driven from the CPU-side census every 20 frames:

| regulator | mechanism | where it lived |
| --- | --- | --- |
| species blight | upkeep x (1 + 6 x max(0, share of all life - 0.12)) per cell | WGSL `lifeMain` |
| guild blight | upkeep multiplier per diet guild and per way of moving, rising past a 36% share | census -> `dietCost`/`mobCost` uniforms |
| plant-cover turbidity | light x 1 / (1 + 20 x max(0, plant fraction of all particles - 0.1)) | census -> `turbid` uniform |
| immigration | every ~50 s, if a guild was below a target share, drop a founding colony of that archetype | engine `_immigrationTick` |

Plus two abiogenesis boosts: x90 for 25 s after each climate era and x90 while life was below 2% of
particles ("crisis").

The owner's goal is a few simple, understandable, local rules whose combination produces complex
emergent behaviour, and no global "crutches". The questions were: which regulators actually matter, and
what happens without them.

## 2. Tools built for this (all in the repo)

- `src/climate.js`: seasons, climate eras and the abiogenesis rate, shared by the page and headless runs,
  so a headless world is the page world minus rendering.
- `src/headless.js`: the headless frame loop and metrics (`runHeadless(device, config, hooks)`), browser
  compatible so it can run inside Chromium as well as under Dawn.
- `tools/sim.mjs`: CLI. Writes JSON with a sample every 5 simulated seconds (living, matter counts, species
  count, effective species = exp(Shannon entropy), diet and movement shares, bodies share, ledger rates per
  simulated minute: births, mutants, starved, old age, kills, extinctions, grazes, scavenges, bites) and a
  summary (final and minimum living fraction, mean effective species after 60 s, collapses, guild losses,
  eras seen, ms/frame).
- `tools/compare.mjs`: runs several configurations x several seeds as parallel child processes and prints
  mean +- sd per metric. Configs are JSON: `{"k": {<DEFAULT_K overrides>}, "eras": bool}`.
- `npm test`: unit tests plus a short headless smoke run.

Backends:

- **Dawn** (`webgpu` npm package, default): the fast path on a machine with a GPU. On this GPU-less VM it
  can only use Mesa lavapipe (`--cpu`), and that combination aborts nondeterministically after a few
  thousand frames whenever async readbacks are used (futex/mutex assertions, SIGSEGV). It was traced to
  the Dawn-node/lavapipe stack, not to the simulation; a submit-only loop survives, any `mapAsync` or
  `onSubmittedWorkDone` use eventually crashes, with every package version from 0.3.10 to 0.6.1 and with
  Mesa 25.2.8. Do not spend time on it again; use a GPU.
- **Chromium** (`--chrome`, Playwright Chromium + SwiftShader): stable but slow. On this 4-core VM:
  about 24 ms/frame at 1k particles, 76 ms/frame at 4k, so a 5-minute simulation at 4k is ~25 minutes of
  wall time. Three runs in parallel share the 4 cores.

For reference, after the prefix-scan fix (see section 6) lavapipe ran 4k particles at ~4 ms/frame and
16k at ~13 ms/frame before crashing; a modest GPU should do far better than that at 16k+.

## 3. Method

All runs: 4096 particles (world about 26 x 14 units, ~190 grid cells), 5 simulated minutes (18000
frames at 1/60 s), climate eras on (none occur before 10 minutes, so eras played no role), Chromium
backend, seeds 1 and 2. Each configuration was run once per seed; this is a screening study, not a
powered one. The seed-to-seed spread in the baseline is the yardstick for "no effect".

Study A (ablation, code as of the morning of 2026-10-01, with the scan fix):

| name | change |
| --- | --- |
| base | everything on |
| noimm | immigration off |
| noblight | `blight: 0` |
| noguild | `guildBlight: 0` |
| noturbid | `turbid: 0` |
| bare | immigration off, `blight: 0`, `guildBlight: 0`, `turbid: 0` |

Study B (after removing the regulators and abiogenesis boosts from the code):

| name | change |
| --- | --- |
| new | the committed code (constant abiogenesis, no regulators) |
| spec | `dietMin: 0.25` (a cell only eats a food its diet devotes at least 25% to; was 2%) |
| spechunt | `dietMin: 0.25` and `hunt: 0.3` (pull of prey on hungry hunters; was 0.12) |

Metrics below are means over samples after t = 60 s unless named "final". "eff" is effective species.
Rates are per simulated minute, world-wide.

## 4. Results

Study A:

```
run             livingF minLiv  eff  sp  prod graz pred scav bodies lost imm | births kills starved old  mut  ext
base-seed1       0.18   0.13   15.1 28  0.29 0.42 0.18 0.11 0.65    0   2   |  2625  1337  1281   32  43.2 49.8
base-seed2       0.20   0.13   10.5 17  0.36 0.46 0.14 0.04 0.55    0   6   |  2331   687  1645    8  23.8 29.9
noblight-seed1   0.14   0.13    9.2 16  0.31 0.42 0.22 0.05 0.61    0   6   |  2090   972  1271   13  36.3 44.6
noblight-seed2   0.22   0.19   11.2 24  0.38 0.41 0.16 0.04 0.61    0   4   |  2492  1255  1205   14  30.7 34.6
noguild-seed1    0.22   0.18   12.3 32  0.20 0.58 0.18 0.04 0.68    0   6   |  2811  1819   918   24  59.1 65.0
noguild-seed2    0.32   0.24   14.1 31  0.25 0.57 0.13 0.05 0.58    0   4   |  2333   992  1133   37  31.7 33.4
noturbid-seed1   0.15   0.13   13.1 28  0.32 0.46 0.15 0.07 0.59    0   4   |  2789  1266  1482   22  52.2 57.7
noturbid-seed2   0.19   0.12   12.1 21  0.31 0.41 0.14 0.15 0.62    0   1   |  2551   976  1509   16  28.7 33.4
noimm-seed1      0.09   0.06   10.2 18  0.28 0.56 0.16 0.01 0.47    1   0   |  2814   903  1984   10  60.3 68.2
noimm-seed2      0.19   0.14   11.5 24  0.33 0.50 0.12 0.05 0.52    0   0   |  2666   900  1686   11  31.7 33.8
bare-seed1       0.32   0.24    8.4 22  0.42 0.46 0.12 0.00 0.58    1   0   |  2380  1112  1146   18  36.8 42.9
bare-seed2       0.27   0.22    5.3 21  0.02 0.85 0.12 0.00 0.42    1   0   |  2299   905  1229   58  23.6 26.5
```

(`livingF` final living fraction of all particles; `minLiv` its minimum after 60 s; `sp` species alive at
the end; `lost` diet guilds that reached 0% after exceeding 5%; `imm` immigrant colonies received.)

Study B:

```
run             livingF minLiv  eff  sp  prod graz pred scav bodies lost | births kills starved old  mut  ext
new-seed1        0.23   0.20    9.8 22  0.33 0.49 0.09 0.03 0.53    0   |  1758   942   628  119  26.3 30.1
spec-seed1       0.29   0.25    7.9 27  0.15 0.61 0.23 0.00 0.76    1   |  1941   951   765   68  30.7 35.8
spec-seed2       0.31   0.25    8.6 20  0.17 0.59 0.16 0.00 0.77    1   |  2028  1092   631   40  21.3 25.0
spechunt-seed1   0.27   0.24    5.2 20  0.25 0.60 0.12 0.03 1.00    1   |  1233   506   645   79  25.0 30.9
spechunt-seed2   0.44   0.32    5.3 20  0.11 0.73 0.09 0.04 0.84    1   |  1905   821   644   69  23.3 28.2
```

Selected time series (diet shares of living cells; glint and husk are particle counts):

```
bare-seed2   t=60  living=1774 eff=10.5 prod=0.16 graz=0.52 pred=0.29 scav=0.03  glint=68  husk=23
             t=120 living=1497 eff= 5.2 prod=0.02 graz=0.86 pred=0.12 scav=0.00  glint=8   husk=60
             t=300 living=1105 eff= 4.7 prod=0.00 graz=0.85 pred=0.15 scav=0.00  glint=38  husk=32
spec-seed1   t=60  living=1528 eff=16.6 prod=0.29 graz=0.41 pred=0.27 scav=0.02  glint=116 husk=855
             t=300 living=1190 eff= 9.3 prod=0.09 graz=0.68 pred=0.22 scav=0.00  glint=67  husk=515
spechunt-s1  t=60  living=2289 eff= 7.3 prod=0.09 graz=0.24 pred=0.52 scav=0.15  glint=277 husk=307
             t=300 living=1092 eff= 5.4 prod=0.31 graz=0.68 pred=0.00 scav=0.00  glint=441 husk=39
```

## 5. Interpretation

1. **Species blight, guild blight and turbidity did nothing measurable.** With each one off, living
   fraction, effective species and the diet mix stay inside the baseline's seed spread. Guild blight was
   taxing grazers at 1.7x to 3.7x upkeep in the baselines without moving their share; turbidity never
   activated because plants never reached 10% of particles (producers are ~30% of the 15-20% that is
   alive). The diet mix settles to roughly producers 30%, grazers 45%, predators 15%, scavengers 5% with
   or without them: a plausible trophic pyramid, not a pathology.
2. **Immigration was the only regulator with an effect, and it worked by re-seeding losers.** Without it
   scavengers went extinct in one seed and the bodies share fell from ~0.6 to ~0.5. Baselines received 2
   to 6 immigrant colonies in 5 minutes.
3. **Without any regulator the world is fuller but poorer.** Living fraction rises to 27-32% (the
   regulators were suppressing life), but effective species falls to 5-9, scavengers die out in every
   run, producers died out in one seed (bare-seed2: grazers at 85%, glint driven to single digits), and
   predators dwindle through the run.
4. **Mechanisms behind the collapse, from the time series and code reading:**
   - Grazers are the most direct conversion of the energy input (tide -> glint) into biomass. They
     exhaust glint (190 -> 8-40 standing) and then crop plants (`grazePref 0.6 x dGlint` makes a grazer
     value a plant cell at 0.45, above the eating threshold). Free-living plankton have no armour; only
     bonded bodies resist bites.
   - Predators barely catch anything: strikes need prey within `eatR = 0.3` units (cells are ~0.8-1.0
     radius), the pull toward prey is `hunt = 0.12` against signature forces of order 1, and a kill is
     allowed only every `killEvery x eatEvery = 48` frames. Kills world-wide run at 900-1300 per minute
     against 2300-2800 births per minute, so predation never checks grazers.
   - Husks are consumed by everyone: a grazer with `dHusk = 0.1` eats a husk for about 0.02 energy
     (`spec(0.1)` is tiny) but still destroys it. Standing husks are 30-60 instead of the ~900 that the
     death rate and 25 s husk lifetime would otherwise sustain.
5. **Tested fixes (study B) did not rescue the web.**
   - `dietMin 0.25` (eat only what your diet is a quarter devoted to) did exactly what the mechanism
     predicted for husks (standing husks 300-850) and lifted predators to 16-23%, but scavengers still
     went extinct. So their failure is not food supply; suspects are predation (scavengers are slow
     drifters with `adhesion 0.25`, so almost no armour) or an upkeep that the husk diet cannot cover.
   - `hunt 0.3` on top produced a classic overshoot: predators boomed to ~50% of life by t = 60 s, ate
     out the prey, and crashed to 0-2%, leaving the lowest diversity of all runs (eff 5).
6. **Caveats.** The world is 50-250x smaller than the browser's, so there are few spatial refugia and
   extinctions are far likelier than at 200k-1M particles; two seeds per configuration give only a
   coarse read; and 5 minutes sees no climate era, which is the mechanism meant to reshuffle dominance
   in the long run.

## 6. What was changed in the code because of this

- Removed: species blight, guild blight, turbidity, immigration, and the crisis/era abiogenesis boosts
  (abiogenesis is now a constant: about one new lineage per 30 simulated seconds). The census no longer
  steers the ecology; it only names species and tracks lineages. `DEFAULT_K` lost `blight`, `blightAt`,
  `guildCap`, `guildBlight`, `turbid`, `turbidAt`, `immigEvery`.
- Added `dietMin` (default 0.02, the previous hidden constant) so the specialisation threshold can be
  tested without editing WGSL. Not changed by default because study B did not show a clear win.
- Unrelated but found on the way: the prefix scan dispatched over all 262144 possible grid cells every
  frame regardless of world size (two 1024-workgroup dispatches). It now scans only the cells in use.
  On lavapipe this took 16k particles from 46 ms to 13 ms per frame.
- Engine correctness: claims resolving against a particle whose kind changed mid-frame are ignored;
  `seed()` resets regulator/census state and tags readbacks with a world generation so a census from a
  previous world cannot act on the new one; allocation error scopes include bind-group creation;
  founders are built with the engine's K; unknown `--k` keys are rejected.
- Unknown keys matter: before this, `--k '{"blight":0}'` on the new code would have silently run the
  baseline.

## 7. Recommended next steps (on a GPU machine)

1. **Instrument before tuning.** Add per-guild death causes to the census (starved vs eaten vs old age
   per species slot; 3 x 512 atomics in the ledger is cheap) and record them in `headless.js` samples.
   The central unanswered question is why scavengers starve or die when husks are plentiful, and
   whether predators starve or are out-bred.
2. **Re-run study A's `bare` and `base` at 32k-64k particles for 20 minutes, 4 seeds**, so at least one
   climate era occurs and spatial refugia exist. If scavengers and producers persist at that scale, the
   small-world extinctions were an artefact and the current rules may be fine as they are.
3. **Candidate local rules, in order of plausibility** (test one at a time, 4 seeds, against `new`):
   - Herbivory that does not kill: cap how much a bite can take relative to the plant's energy, or let
     a plant below some energy be unpalatable, so grazers cannot crop producers to extinction.
   - Handling time scaled with prey energy, or a weaker `hunt` than 0.3 (try 0.18-0.2) with `eatR` for
     flesh raised to ~0.45, aiming for predators that catch prey without overshooting.
   - Scavenger defence: armour or a predator aversion for husk specialists, or a cheaper metabolism for
     slow drifters, if the per-guild death data shows they are eaten rather than starved.
   - Keep `dietMin` at 0.25 if the death data confirms it helps husks reach scavengers.
4. **Decide about immigration.** It was the one regulator doing real work. If the owner would rather
   keep a tiny safety valve than accept guild extinctions in small worlds, the removed code is in git
   history (commit "Remove the global ecology regulators"). The study suggests a far smaller rule would
   do: new random lineages already spark from glint; raising that rate when species count is low is the
   same crutch in another coat, so prefer fixing the local rules.

## 8. Reproducing

```sh
npm install
npm test
# GPU machine, Dawn backend:
node tools/compare.mjs --seeds 4 --minutes 20 --n 32768 --jobs 2 --out runs \
  new '{}' spec '{"k":{"dietMin":0.25}}'
# No GPU: add --chrome (slow) and keep --n at 2048-4096.
```

Each run's JSON holds `config`, `samples`, `eras` and `summary`. The raw JSON from this study is not
in the repo (1.4 MB of run data); the tables above are the complete summaries. Study A ran on the code
as of the morning of 2026-10-01 plus the scan fix; its `bare` configuration is equivalent to the current
default rules apart from the abiogenesis boosts.
