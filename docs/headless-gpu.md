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

Each census is summarized by `communitySample`: effective species (Hill order 1, exp Shannon), Hill
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

Each sample also has an energy budget per diet guild (`energy`: energy per simulated minute taken from
light, glint, plant bites, husks and kills, and spent on upkeep and on children; light and upkeep are
sampled once a simulated second per cell). Divide by the guild's population for a per-cell budget: a
guild that eats less than its upkeep is starving, whatever its birth rate.

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
# Re-analyze runs already on disk
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

## Farming seeds out to several machines (`tools/farm.mjs`)

`tools/farm.mjs` runs one ensemble's seeds on every GPU machine in a host list, then analyses and gates
them with `ensemble.mjs --from`. The report and exit code are the same as a local gate. The host list
lives outside the repo, at `~/.config/tidemote/farm.json` (or `--hosts FILE`, or `$TIDEMOTE_FARM`), so
nothing about the machines is committed.

```sh
npm run gate:farm -- --out runs/NAME --k '{...}'     # 32 seeds × 30 min at 32k against the baseline
node tools/farm.mjs --out runs/NAME --runs 8 --minutes 5 --n 4096 --only LABEL
node tools/farm.mjs --out runs/NAME --dirty ...      # HEAD plus uncommitted changes to tracked files
node tools/farm.mjs --clean                          # drop the farm's worktrees on every host
```

```json
{ "hosts": {
  "linux-box": { "hostname": "linux-box", "ssh": "user@linux-box", "repo": "~/src/tidemote", "slots": 4,
                 "node": "node", "args": ["--chrome"], "env": { "TIDEMOTE_VK": "1" } },
  "wsl-box":   { "hostname": "wsl-box", "ssh": "user@wsl-box", "repo": "~/src/tidemote", "slots": 4,
                 "node": "tools/gpu-node.sh", "path": ["/mnt/c/Windows/System32"] } } }
```

Each key is a label. `hostname` is what `hostname` prints on that machine, `ssh` is how to reach it, and
`repo` is a clone there. `slots` is how many seeds it runs at once. `node`, `args`, `env` and `path` are
how `tools/sim.mjs` is launched there, with `~/` meaning that machine's home. List as many hosts as you
like.

- **Which commit runs.** The farm runs one commit everywhere: HEAD by default, refused if tracked files
  have changes unless `--dirty` is passed. It pushes the commit to each host's `repo` as
  `refs/farm/SHA` and checks it out there as a detached worktree in `~/.cache/tidemote-farm/worktrees/SHA`.
  The branch checked out on each machine is never touched. `node_modules` is installed once per
  `package-lock.json` hash and hard-linked into the worktree, because Windows Node cannot follow WSL
  symlinks.
- **Local and remote hosts.** The host whose `hostname` matches the machine the farm runs on is used
  without ssh, so one host list works from any of them. Every other host runs over ssh with
  `BatchMode`.
- **How seeds are handed out.** Every host gets `slots` workers, and each worker takes the next seed
  from one shared queue as soon as it is free, so a faster or idler GPU simply finishes more seeds. A
  failed seed is retried on any host. A failed run takes a slot away from its host (it is likely short of
  memory or GPU, for instance while something else runs there), down to one; after `--restore` minutes
  (10) without a failure the host gets a slot back, up to its `slots`. A host failing three times in a
  row with one slot rests `--cooldown` minutes (10) and then tries again; meanwhile its seeds go to the
  others. Only failures with a single slot count against a seed's `--attempts`. The limit lives on the host (`~/.cache/tidemote-farm/limit`), so
  every farm sharing it obeys it. Seeds already in `--out` are kept, so rerunning the same
  command resumes, with the commit recorded in `--out/farm.json`.
- **Sharing a machine's GPU.** Each running seed holds an flock on `~/.cache/tidemote-farm/slots/N` on
  its host, so farms started from several places share a machine's slots instead of overloading its
  GPU. A plain `npm run gate` takes no slots.
- **Stopping.** Ctrl-C kills this farm's sims on every host.
- **Host-specific settings.** Under WSL, ssh sessions lack the Windows PATH that `gpu-node.sh` relies
  on: add `/mnt/c/Windows/System32` with `path`. A host that sets a `TIDEMOTE_*` variable in `env`
  refuses commits whose `sim.mjs` (or `tools/vk.mjs`) does not read it. For example, a Chrome host without
  `TIDEMOTE_VK` would run silently on SwiftShader.

Each farmed seed records its host label, adapter and commit, and the report counts every host and
adapter it saw. Different GPUs and drivers could shift the distribution of outcomes slightly, so gate a
new kind of machine on its own against the baseline once (`--only LABEL`) before mixing it in. When
comparing two configurations, run each across the same mix of hosts rather than one per machine.
