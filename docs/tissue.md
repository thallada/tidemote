# Tissue: bodies that hold together, crowds that do not stack

Bonded species used to be loose nets whose cells came and went, and crowds collapsed into "black holes":
hundreds of cells per grid cell, stacked ten deep and racing about at the speed limit. This note says what
caused that, the rules that replaced it (all tunables in `DEFAULT_K`), how they were measured, and what did
not work, for whoever takes it further.

## What was wrong

- **Forces summed without limit.** A cell added the push and pull of every neighbour, so among a thousand it
  was driven a hundred times harder than in open water and ran at `maxSpeed` (82 radii a second in piles).
- **A soft, capped core.** Personal space pushed at most 1 per pair, so a clump with net attraction (often
  hungry hunters, which lower it to `huntCore`) collapsed with no limit on its members.
- **Bodies were not bodies.** Two bonds a cell, each pulling only the cell that chose it; rest lengths a
  cell-width apart; empty slots took any nearby kin, so bodies fused and rewired constantly.
- **Sampling with jumps at grid lines.** A cell's sampling stride came from the nine grid cells' totals,
  which jump as it crosses a grid line: living cells gathered in grid-cell middles by 3-4%.

## The rules

- `socialN`: past this many particles within reach the pair forces are averaged, not summed: a crowd
  drives a cell no harder than a neighbourhood does.
- `tissue` (rate): bonds pull both ways (`bondBackMain` gathers the cells that keep a bond to each into
  `bondsNow`, six words a cell; only that pass uses atomics, through a second binding), a body cell takes on
  its partners' motion at this rate, and a free bond slot only closes a triangle inside the body
  (`joinable`), so strangers' bodies never fuse.
- Adhesion sets how tight a body is (`tightFrom`, `tightSpan`): tight species' bonds rest where the two
  cells touch (`bondTouch` of the pair's summed radii), their kin keep personal space only down to touching,
  and they keep `tissueSig` of their long-range signature forces, so contact shapes them. Loose species keep
  open, strung-out bodies.
- `liveFirst`: each grid cell's living sort first (`resolveCount` ranks living and matter apart; `LIVE_AT`
  holds the counts), and a cell weighs its living neighbours exactly up to `liveScan`, sampling the matter
  with what `maxScan` leaves. Strides follow the crowd interpolated between grid-cell centres (floored at a
  third of the totals' stride beside a heap), so nothing jumps at a grid line.
- `contactMain`, a pass of its own before `lifeMain` (in `lifeMain` its loop cost the whole kernel registers
  even when idle): each living cell walks every living cell it could touch (grid cells within
  `contactReach`, up to `contactCap`, every so many past that) and changes its own velocity:
  - `bodyHold`: overlapping bodies (past `bodyGive` of touching) part by velocity, far enough to undo this
    share of the overlap per 1/60 s, averaged over the contacts;
  - `bodyPush`: and a push by their overlap besides;
  - `crowdVisc`: cells that touch take on each other's motion, more the more they touch (compounded per
    1/60 s, so coarse steps blend as far as their ticks would).
- `budding`: a daughter appears beside her mother, toward the grain she is built from, not at the grain.
- Grains read the water's warmth between grid cells (they were shaken harder cell by cell).

## Drawing

- A tight species' cells among their kin fill out toward the walls they share (`PO.tile`, per direction:
  only facing a kin contact, growing as it presses closer) and keep their own outline facing open water;
  bonds between them draw no tube (`view.tissue`).
- The main view's scene pass gathers the living alone in a second target (`fsPointLive`, `liveTex`): the
  composite lays cells over the averaged matter, cells and grains hide the stone beneath them, and the
  micro-suspension stays behind the living.

## Measurements (runs/crowd, runs/recur; scripts in runs/crowd are not committed)

On `runs/perf/worlds/slow.tidemote`, 60 simulated s after loading, at equal population:

| | main | tissue set |
|---|---|---|
| step (RTX 4070 Ti, Chrome) | 6.6-6.7 ms | 7.3-7.7 ms (`contactMain` 1.1) |
| wobble, px a tick at 300 px/unit | 4.6 | 0.79 |
| bonds held 5 s (both alive) | 76% | 99.7% |
| grid bias, chi-square of living x / y (19 = uniform) | 315 / 429 | 11 / 38 |

Fresh worlds at 64k particles (`tools/sim.mjs`, packing sampled each record): main stacked 2-31% of its
living (seed 4: 760 living in one grid cell at 18 min); the tissue set at most 0.2-3.4% over 60 minutes,
briefly. Matched forks (`tools/fork.mjs`, 1/60 s against 4-tick steps) move within ~1-4% of each other.

Balance gate (`npm run gate`, 32 seeds x 30 min at 32k, against main's `balance/baseline-32k-30m.json`):
passes, every metric "same" after correction. Leaning worse: full food webs 56% -> 28% of runs (p 0.024
uncorrected), late guilds 2.56 -> 2.16; effective species 89 -> 100, notable species 26 -> 30. The tissue
set is the default; rebaseline once the ecology is rebalanced for it.

Tools: `film.mjs` (real-time screencasts of the densest pile and the largest tight and loose bodies,
motion and bond turnover), `jitter.mjs` (wobble from positions over 10 ticks), `pileinfo.mjs` (what a pile
holds), `gridbias.mjs`, `check.mjs` (the page starts under each tunable set: run it before long runs, as an
unknown tunable stops the page).

## What did not work

- Position correction of overlaps (`contact`) and short-range kin adhesion (`cadherin`), and a stiffer core:
  all made bodies shake (wobble 2.3-2.5 px).
- Summing personal space (`coreSum`) with sampled living: kicks of a sparse sample (wobble 1.3 px); exact
  contact replaced it.
- Contact applied after `lifeMain` on its output: worse (2.3 px). Walking contact every other tick: no gain
  (the cost was registers, not work).
