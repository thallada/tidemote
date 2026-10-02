# Headless runs on a GPU, and the balance regression gate

## Reaching the GPU

`tools/sim.mjs` uses Dawn through the `webgpu` npm package. It records the adapter in every run's
`config.adapter` and refuses to fall back silently to a software adapter (pass `--cpu` to allow lavapipe).

Under WSL2, Linux Dawn sees only llvmpipe: Mesa's `dzn` (Vulkan over D3D12) is the only GPU path inside
WSL and Dawn rejects it for lacking `fullDrawIndexUint32`. The Windows build of Node can use Dawn's D3D12
backend on the real GPU, and the `webgpu` package already ships `win32-x64/dawn.node`, so the repo's
`node_modules` work unchanged from the WSL path. `tools/gpu-node.sh` runs the Windows Node (fetching a
portable copy into `%LOCALAPPDATA%\tidemote-node` on first use) and is plain `node` outside WSL:

```sh
tools/gpu-node.sh tools/sim.mjs --n 32768 --minutes 30 --out run.json
```

Child processes started by `compare.mjs` and `ensemble.mjs` use the same Node as their parent.

## Throughput (RTX 4070 Ti, D3D12, 2026-10-01)

Wall time per simulated frame (1/60 s). A 30-minute run is 108,000 frames.

| particles | one process | 4 processes, aggregate | 30 sim-minutes |
| --- | --- | --- | --- |
| 4,096 | 0.30 ms | | |
| 32,768 | 0.30 ms | 0.27 ms | ~32 s single, ~2 min each with 4 in parallel |
| 65,536 | | 0.34 ms | |
| 131,072 | 0.46 ms | no gain | ~50 s |
| 524,288 | 1.6 ms | | ~3 min |

Below ~100k particles the cost is a fixed floor of small dispatches and per-frame submits, so world
size is nearly free and parallel processes gain little. The headless loop pipelines census readbacks
(it waits only when both staging buffers are busy) rather than stalling on each one; that took 32k
from 0.50 to 0.30 ms/frame. Seeds are not bit-reproducible on a GPU (atomic claim races), so every
comparison is statistical.

## Run metrics (`src/ecostats.js`)

Each census is summarised by `communitySample`: effective species (Hill order 1, exp Shannon), Hill
order 2 (inverse Simpson, dominated by the commonest species), the largest species' share, diet and
movement guild shares, bodies share, population-weighted trait means scaled to [0, 1], and every
species above 5% of life. `summarizeRun` reduces a run to an `outcome` over its late window (the last
third, never before 60 s):

| field | meaning |
| --- | --- |
| `persisted` | life never fell below 2% of particles after 60 s |
| `lateGuilds` | diet guilds averaging at least 5% of life |
| `producersPersist`, `foodWeb` | producers ≥ 5%; producers plus at least two other guilds |
| `monoculture` | one species averages more than half of life |
| `lateEffSpecies`, `lateHill2`, `lateMaxShare` | diversity and dominance |
| `notableSpecies`, `leaderChanges` | species that ever reached 5%; changes of the leading species (≥ 10%, held two samples) |
| `guildsLost` | guilds that reached 5% and then vanished |
| `lateLivingFrac`, `lateLivingCV` | standing life and how much it swings |
| `outcome` | a label: `collapsed`, `mono:<guild>`, or the guilds above 20% (e.g. `producer+grazer`) |
| `fingerprint` | guild shares, movement shares, bodies and trait means: what kind of world it became |

Each sample also holds per-guild demography (`demography`: births, starved, old age and eaten per
simulated minute, per diet guild) and a who-eats-whom count (`meals`: meals on living cells per minute,
by eater guild and victim guild), from cumulative counters in the ledger. They explain *why* a guild
declines, which the outcome metrics cannot.

`summarizeEnsemble` adds whole-ensemble statistics: `spread`, the mean distance between run
fingerprints (low when every run turns into the same world); `outcomes`, the effective number of
distinct outcome labels; and `modalOutcome`, how often the commonest one happens.

## Ensembles and the regression gate (`tools/ensemble.mjs`)

```sh
# Run 32 seeds and save a report (runs/NAME/seedN.json + report.json)
tools/gpu-node.sh tools/ensemble.mjs --runs 32 --minutes 30 --n 32768 --jobs 4 --out runs/NAME
# A candidate against the committed baseline: exits 1 if a gated metric regressed
tools/gpu-node.sh tools/ensemble.mjs --runs 32 --minutes 30 --n 32768 --k '{"hunt":0.2}' --out runs/hunt02 \
  --baseline balance/baseline-32k-30m.json --targets balance/targets.json
# Re-analyse runs already on disk
tools/gpu-node.sh tools/ensemble.mjs --from runs/hunt02 --baseline balance/baseline-32k-30m.json
```

The comparison takes each metric's difference in means (rates for yes/no metrics), oriented so negative
is worse, with a bootstrap 95% interval, and a one-sided permutation p-value for "the candidate is
worse". Holm's correction runs over the gated metrics (`persisted`, `foodWeb`, `notMonoculture`,
`lateGuilds`, `lateEffSpecies`, `spread`, `modalOutcome`). A gated metric with a corrected p below 0.05
is a regression. The informational verdicts (`worse?`, `improved`) are Holm-corrected across all
metrics. Calibration on the 64 default-rule runs of 2026-10-01 (200 random splits into two halves of
32): a gated regression fired in 3.0% of splits and any informational verdict in 1.5%, both under the
nominal 5%. The baseline's run outcomes are stored in full, so any later statistic can be recomputed
from them.

The outcome-label statistics (`outcomes`, `modalOutcome`) only mean something next to
`notMonoculture`: `mono:producer` and `mono:grazer` count as different outcomes, so a world of
monocultures can still look varied by labels.

`balance/targets.json` holds what the ecology should achieve, separately from what it achieves today.
`--targets` reports each bound and exits 1 if one fails.

Run long queues from a separate git worktree pinned to a commit (`git worktree add --detach
../tidemote-wt/run <commit>`, then copy `node_modules` into it: Windows Node cannot follow a WSL
symlink). Every seed starts a fresh `sim.mjs` that reads `src/` from disk, so editing the tree a queue
runs from changes the remaining seeds mid-ensemble.

Use the same `--n`, `--minutes` and eras setting as the baseline; the tool warns when they differ.
Candidate seeds can be the same as the baseline's (they share initial worlds, not trajectories).
