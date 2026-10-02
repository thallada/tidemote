# Balancing Tidemote without regulators: strategy, 2026-10-01

Follows `ecology-study-2026-10-01.md`. Written after moving the headless runs onto a GPU (RTX 4070 Ti,
see `headless-gpu.md`), where a 30-minute run at 32k particles takes about 2 minutes of wall time with
four in parallel.

## 1. What "balanced" should mean

Not a fixed point. A world that is fascinating to watch keeps changing, so the goal is the property
ecologists call *permanence*: every trophic level stays bounded away from extinction, no one species
holds the world for long, and the identity of the leaders keeps turning over. Across runs, the goal
is that worlds differ: the same rules should land in different places from different seeds.

Operationally these are the metrics in `src/ecostats.js` (life persists; a food web of producers plus
at least two other guilds; no species above half of life; effective species; leader changes; spread
of run fingerprints; how often the commonest outcome occurs). `balance/targets.json` puts numbers on
them.

## 2. Can stability be proved?

**Not for the simulation itself, with Lean or anything else.** The claim wanted is probabilistic ("in
at least X% of runs, for an hour") about a stochastic system with 10^4 to 10^6 interacting particles and
open-ended genomes. There is no mathematics that proves persistence for even much simpler spatial,
evolving predator-prey models; it is an open research area. The program is also float32 on a GPU with
racing atomics, so a proof would be about an idealised model rather than the code, and it would have to
be redone at every new feature, which is exactly when it is wanted.

**For a coarse model, yes, but the useful part is not the proof.** A mean-field model of guild
biomass (producers, grazers, predators, scavengers, glint, husks, silt) is a Lotka-Volterra-like ODE.
For those there are known, checkable conditions: an interior equilibrium is globally stable if the
interaction matrix is diagonally stable (a Lyapunov function exists; Goh 1977), and the system is
*permanent* if an average Lyapunov function exists (Hofbauer and Sigmund), which reduces to a linear
program. These can be checked numerically in milliseconds. Formalising them in Lean would certify
textbook mathematics and say nothing about how well the model matches the simulation, which is the
real risk. If a proof assistant is ever worth it here, it is for small engine invariants (particle
count is conserved; energy enters only through the tide and light), and property tests cover those
more cheaply.

**What gives a real guarantee about the actual program is statistics.** "P(the world persists with a
food web for 30 minutes) is at least 0.9" is a statement that sampling can certify with a stated
confidence, about the real code on the real GPU. This is statistical model checking. With n runs:

| claim (95% confidence) | runs needed if all pass | with a few failures |
| --- | --- | --- |
| P(pass) ≥ 0.90 | 29 | 46 runs with 1 failure, 61 with 2 |
| P(pass) ≥ 0.95 | 59 | 93 with 1 failure |
| P(pass) ≥ 0.80 | 14 | 22 with 1, 30 with 2 |

At 2 minutes per 30-minute run in parallel batches of four, 60 runs is about 30 minutes of wall time.
A sequential test (Wald's SPRT) can stop early: a clearly broken change is rejected after about ten
runs.

## 3. Theory to design the rules with

Modern coexistence theory (Chesson 2000) gives a test that is both rigorous and measurable: a set of
species or guilds coexists robustly when **each can invade when rare**, with a positive per-capita
growth rate when it is scarce and the others are at their usual abundance. Coexistence needs
*stabilising* mechanisms, ones that make a species' growth fall with its own abundance faster than
with its competitors'. Fitness differences without stabilisation give competitive exclusion: one
winner.

That translates into local rules of a few known kinds:

1. **Frequency-dependent predation ("kill the winner").** A predator that preferentially catches the
   prey it has recently met (a search image, a type III functional response) hits whatever is booming
   and spares what is rare. This is the leading explanation of microbial diversity, needs one word of
   per-cell memory, and also produces turnover: every boom feeds its own predators.
2. **Density costs that cannot be escaped.** Janzen-Connell disease (`kinCrowd`) is the main thing that
   keeps rain forests diverse. Here it is keyed on exact genome slot and waived for bonded species,
   which defeats it twice (section 4).
3. **Trade-offs with no free trait.** Every trait that helps must cost something somewhere, so there is
   no single best design. Cyclic, rock-paper-scissors trade-offs (armour beats hunters, hunters beat
   fast swimmers, fast swimmers out-breed armour) maintain diversity in spatial worlds and never
   settle, which is the "novel and unexpected" property.
4. **Refuges and non-lethal herbivory.** Grazers that crop rather than kill (plants below some energy
   are unpalatable) cannot drive their food to extinction.
5. **A saturating, not linear, appetite.** Handling time scaled with prey energy prevents the predator
   overshoot seen with `hunt 0.3` (the paradox of enrichment).
6. **Space.** Local interactions plus dispersal limits create refugia. The 32k world is far more
   diverse at 3 minutes than the 4k one (effective species about 21 against 5-9), but section 4 shows
   size alone does not prevent the late collapse.

The invasion criterion can be run as an experiment in the simulation: establish a world without guild
X, introduce a small founding colony of X, measure its early growth rate. A positive rate for every
guild, across seeds, is the empirical counterpart of a permanence proof, and it says *which* guild
fails and why, which outcome metrics cannot.

## 4. Baseline: the default rules over 30 minutes

32 seeds × 30 simulated minutes at 32,768 particles, eras on (one era change per run), current
defaults. Report: `balance/baseline-32k-30m.json`.

| metric | value |
| --- | --- |
| life persisted | 100% |
| food web at the end (producers + 2 more guilds) | 19% [9–35%] |
| monoculture (one species > 50% of life) | 84% [68–93%] |
| effective species, late window | mean 4.4, median 2.3 |
| guilds at ≥ 5%, late | mean 1.8 |
| living fraction of all particles, late | 0.73 |
| outcomes | mono:producer ×18, mono:grazer ×6, producer+grazer ×3, mono:omnivore ×2, 3 others |

The early world (first 3-5 minutes) looks healthy at this size; the collapse comes later. A typical
run: scavengers gone by 2 minutes, predators by 8, then a producer/grazer seesaw, then one species.

**The dominant species is a bonded body in essentially every run** (bodies are 87-100% of life at the
end of 30 of 32 runs). Bonding has a token cost (0.004 metabolism × adhesion) and four benefits:
exemption from kin crowding, 30% cheaper upkeep with two bonds (`bodyThrift`), less self-shading
(`kinShade`), and armour that makes about two thirds of attacks fail at adhesion 0.9 (`armor`).
Adhesion is a dominant trait in the evolutionary sense; whichever bonded lineage gets big first takes
the world, and with nothing eating it, life fills 70-90% of all matter.

Two smaller observations:

- Species counts reach 300-400 of the 508 genome slots while effective species is 2-5. Most are
  near-identical mutants. Because crowding is keyed on the exact slot, a mutant escapes its parent's
  disease load for free, so speciation is cheap to the dominant lineage. Keying kin on signature
  similarity (as eating already does with `kin`) would close that. Slot exhaustion also caps mutation
  globally once all slots are used, a hidden regulator to keep in mind.
- "Grazer" and "omnivore" monocultures are mostly mixotrophs at `photo` ≈ 0.5, just under the producer
  threshold of 0.55: bonded bodies that photosynthesise and eat.

## 5. Plan

1. **Keep the gate honest.** An A/A test (same configuration, different seeds) checks the false-alarm
   rate of `tools/ensemble.mjs --baseline`. (Result in section 6.)
2. **Fix the dominant trait first,** one local rule at a time, each gated against the baseline:
   bonded cells pay crowding too (within a body it should count strangers-of-kind, not body mates;
   or count kin beyond the two bonded neighbours); armour costs reproduction (bigger `buildCost` or
   lower `share` with adhesion); key crowding on signature similarity so mutants do not escape it.
3. **Then add stabilisation:** predator search images (kill the winner), non-lethal herbivory.
4. **Add the invasion test** as a tool (`--invade guild`), and per-guild death causes in the ledger
   (starved / eaten / old age), recommended by the previous study.
5. **Tune with search, not by hand, once the rules are right.** A Morris screening of `DEFAULT_K`
   (which knobs matter) costs a few thousand 10-minute runs: an overnight job. Robust optimisation
   (CMA-ES or Bayesian optimisation) of a lower quantile of a per-run health score across seeds, on
   held-out seeds, avoids tuning to luck. Keep looking at the worlds: metrics can be gamed.
6. **For every future feature:** run the gate before merging. Tiers: a quick screen (16 runs × 10
   min, about 3 minutes), the gate (32 × 30 min, about 16 minutes), and occasional long checks (1 hour,
   131k particles, closer to what the page runs).

## 6. First checks of the gate

**A/A.** A second ensemble of the default rules on seeds 1001-1032 (`runs/baseline-b`) matched the
baseline on every metric (monocultures 81%, food webs 22%) and nothing was flagged. Re-splitting all
64 runs into random halves 200 times: a gated regression fired in 3.0% of splits and an informational
verdict in 1.5%, under the nominal 5%.

**Weaker body perks** (`armor` 2.5 → 0.5, `bodyThrift` 0.3 → 0.1, `kinShade` 0.25 → 0.6; knobs only,
32 seeds × 30 min):

| metric | default | weaker perks |
| --- | --- | --- |
| monoculture | 84% | 38% (improved) |
| effective species, late | 4.4 | 26.3 (improved) |
| guilds at ≥ 5%, late | 1.8 | 1.3 (**regressed**, Holm p = 0.009) |
| food web | 19% | 6% |
| living fraction, late | 0.73 | 0.54 |
| commonest outcome | mono:producer (56%) | producer, many species (41%) |

Taking the free lunch away from bodies breaks the monocultures, and diversity within the producers
explodes, but consumers still do not hold on: the commonest world is a lush, varied plant community
with nothing eating it. The gate flags it, rightly: by species counts it looks like a big win, by
trophic structure it is worse. It supports the plan's order. The dominant trait was real, but the
consumer side needs stabilising mechanisms of its own (prey switching, non-lethal herbivory,
handling time) before the food web can persist.

## 7. First round of rule changes, 2026-10-02

Four local mechanisms were added behind knobs that defaulted to the old behaviour, then tested alone
and in combinations, each 32 seeds × 30 min at 32k. Per-guild births and deaths (starved, old age,
eaten) are now recorded in every sample (`sample.demography`), which answered the previous study's
open question: consumers die mostly by **being eaten**, not by starving (scavengers: eaten 5.2, starved
1.5 per cell per minute with crowding for bodies).

| ensemble | food web | mono | guilds | eff. species | leader changes | spread | outcomes | modal | guilds lost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| original rules | 19% | 84% | 1.8 | 4.4 | 5.1 | 1.36 | 3.9 | 56% | 1.03 |
| bodies pay crowding (`bodyCrowd`) | 31% | 16% | 2.1 | 19.2 | 7.5 | 1.27 | 4.9 | 44% | 0.84 |
| look-alike crowding (`crowdSig`) | 9% | 84% | 1.6 | 2.8 | 5.8 | 1.50 | 4.4 | 50% | 1.09 |
| non-lethal grazing (`biteFloor` 0.3) | 31% | 66% | 2.2 | 4.3 | 5.0 | 1.20 | 4.1 | 56% | 0.59 |
| search image (`searchImage` 0.7) | 25% | 72% | 2.0 | 4.6 | 5.2 | 1.34 | 3.8 | 63% | 1.13 |
| **crowding + search image (adopted)** | 28% | 13% | 2.1 | **28.8** | 7.4 | 1.28 | **6.0** | **31%** | 1.00 |
| crowding + look-alike crowding | 28% | 44% | 2.1 | 7.5 | 5.8 | 1.31 | 5.9 | 31% | 0.78 |
| crowding + grazing floor | 50% | 13% | 2.5 | 22.3 | 5.0 | 1.10 | 3.9 | 59% | 0.38 |
| crowding + floor + search image | 66% | 3% | 2.7 | 29.4 | 5.1 | **0.87** | 3.1 | 56% | 0.63 |
| crowding + weaker body perks | 13% | 13% | 1.6 | 25.1 | 5.8 | 1.42 | 4.9 | 50% | 1.09 |
| crowding + weaker perks + floor | 47% | 0% | 2.5 | 33.3 | 4.9 | 1.14 | 3.7 | 50% | 0.34 |
| crowding + weaker perks + search image | 6% | 16% | 1.6 | 37.2 | 5.1 | 1.41 | 4.1 | 56% | 1.19 |
| ... + grazing floor 0.15 | 50% | 0% | 2.4 | 42.2 | 5.7 | 1.13 | 3.0 | 63% | 0.59 |

("Weaker body perks": `armor` 2.5 → 1, `bodyThrift` 0.3 → 0.15. The rows below the adopted one were
compared with "bodies pay crowding".)

What it shows:

- **Crowding for bodies** was the big lever: it ended the monocultures (84% → 16%) and quadrupled
  diversity. Adopted as the plain rule: every cell pays kin crowding, a body's two bond partners
  excepted. No knob remains; free-living cells were already covered by the same formula.
- **Search images** (a hunter or grazer that fails 70% of attempts on prey unlike its last catch) do
  nothing while bodies dominate, but on top of crowding they add diversity (19 → 29 effective species)
  and the most varied set of outcomes seen (6.0 distinct, the commonest only 31%), with no loss on any
  metric. Adopted at 0.7.
- **Look-alike crowding** made things worse and was deleted.
- **A grazing floor** is the strongest stabiliser of the food web (up to 66%) but every variant that
  includes it makes runs converge (lower spread, fewer distinct outcomes, fewer leader changes): the
  stability-versus-uniqueness tension, measured. Rejected for now and deleted; it is in git history
  (commit fc048b5) should a later change need it.
- **Weaker body perks** bring free-living cells back (bodies below 80% of life in a third of runs) but
  cost the food web. Not adopted.
- Crowding for bodies and search images cost nothing in frame time (131k particles: 0.39 ms/frame
  against 0.43 before, with fewer living cells).

Still unsolved: **consumers**. Food webs persist in about 30% of runs; the commonest late world is a
diverse producer community with grazers. Consumers are eaten faster than they starve, and predators
fall from present in 31/32 runs at minute 1 to 7-9/32 after minute 10. Genome slots (508) also fill in
some runs now (up to 483 in use), which starts to cap mutation.

**Long check at page scale.** 16 seeds × 60 simulated minutes at 131,072 particles (several climate
eras per run), old rules against adopted rules (`runs/long-old`, `runs/long-new`, about 4.5 minutes of
wall time per run):

| metric | old rules | adopted rules |
| --- | --- | --- |
| monoculture | 75% | 0% |
| effective species, late | 3.3 | 38.6 |
| notable species per run | 20.5 | 29.8 |
| leader changes | 6.1 | 8.8 |
| food web | 13% | 25% |
| commonest outcome | mono:producer (56%) | producer (44%) |

The improvement holds, and is larger, in bigger, longer worlds. Nothing regressed.

`balance/baseline-32k-30m.json` now holds the adopted rules (the "crowding + search image" ensemble).

## 8. Round two: who may eat what (`dietMin`)

With crowding and search images in place, the demography showed consumers dying mostly by being eaten.
Every cell whose diet held even 2% flesh hunted animals (`dietMin` 0.02), so the abundant grazers
(about 20% flesh) preyed on scavengers and predators. Raising `dietMin` makes cells eat only the
foods their diet is substantially devoted to. Knob only, no code. Against crowding + search image:

| `dietMin` | food web | mono | producers persist | guilds | eff. species | leader changes | outcomes | modal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.02 (previous) | 28% | 13% | 88% | 2.1 | 28.8 | 7.4 | 6.0 | 31% |
| 0.10 | 53% | 6% | 91% | 2.5 | 28.1 | 6.1 | 7.2 | 34% |
| 0.15 | 59% | 6% | 84% | 2.8 | 34.1 | 6.8 | 7.1 | 31% |
| 0.15, seeds 1001-1032 | 38% | 3% | 75% | 2.5 | 37.1 | 7.9 | 7.2 | 25% |
| 0.20 | 41% | 0% | 63% | 2.5 | 38.7 | 8.8 | 6.4 | 38% |
| 0.25 | 28% | 0% | 50% | 2.6 | 39.9 | 8.2 | 6.3 | 34% |

The replication matters: 0.15 gave a 59% food web on seeds 1-32 and 38% on fresh seeds. Pooled (64
runs) against the previous rules: guilds 2.1 → 2.6 (significant after Holm correction across all 15
metrics), food web 28% → 48%, monoculture 13% → 5%, effective species 29 → 36, no regression. Every
value from 0.10 to 0.20 improved the web; above that producers start to vanish (worlds of glint
grazers, predators and scavengers). **Adopted: `dietMin` 0.15**, the middle of the range that helps.
The baseline now holds those 64 runs.
