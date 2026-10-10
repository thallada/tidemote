# Performance: how the page keeps its frame rate, and how to measure it

Measured on an RTX 4070 Ti (Chrome 154, D3D12, 2560×1440 at 143 Hz) with `tools/perf/` (below),
on saved worlds grown at Max: `w1m` (1M particles, about 540k living) and `w4m` (4M, about 1.8M living).

## Where the GPU time goes

The simulation step dominates. In a mature world `lifeMain` (every living cell's neighbour scan,
forces and budget) is about 80% of a step, and a step costs 5 to 6 ns per living cell:

| world | step | lifeMain | scatter | resolveCount | matter |
| --- | --- | --- | --- | --- | --- |
| 1M, 540k living | 2.9 ms | 2.2 ms | 0.31 | 0.18 | 0.19 |
| 4M, 1.8M living | 12.8 ms | 9.5 ms | 1.3 | 1.0 | 0.82 |

Life fills a world within a couple of simulated minutes (30 to 70% of particles living after that),
so the cost the page calibrates against at start is close to the mature one; it then swings with
the climate by ±30%.

`lifeMain` is limited by registers (occupancy), not arithmetic: cutting state it carries through the
neighbour loop is what pays. The neighbour loop is about 93% of it; its cost scales with the sample
budget `maxScan`: 192 since 2026-10-09 (288 before), which took about 25% off `lifeMain` (1M world
2.30 → 1.67 ms, 4M 9.9 → 7.8 ms). It passed the 32-seed gate against 288 and against heat-framboids,
and 128 seeds at 4-tick steps matched 288 or bettered it (effective species 79.5 ± 4.4 against
72.0 ± 3.9; reports in `balance/maxscan/`). It is a uniform (`sim.maxScan`), so Settings → Performance →
Neighbours changes it live (144, 192, 288; no measurable cost against a compiled constant).

144 against 192 (2026-10-10, after the hot-springs change): the step is 8% faster in the 1M world and
14% in the 4M one (`lifeMain` 11% and 15%; 288 is 20% slower). Ecology is unchanged: the gate passes
against the baseline and against 192, and over 384 seeds at 4-tick steps collapses (living under 2%)
were 5 at 144, 8 at 192 and 5 at 288. The 12 traced were sudden cold (a cold snap on a seasonal low,
cells adapted to warm water torpid) or predator boom-busts, none budget-related. What fewer samples do
change is the noise of a crowded cell's forces: in matched-start forks (16 worlds) 144 raises the mean
force on a crowded cell by about 20% over 192 and its speed by 7–8% (288 lowers them as much), and a
hungry cell finds food in reach 2–3% less often. That evens out over a run but colonies jostle more.

Drawing: zoomed out, the cost is the points' vertex work (4M particles: 4.6 ms, the same at half the
render scale); zoomed in it is the resolved cells' fragment work, which the render scale reduces
faster than linearly (the level of detail is set in framebuffer pixels).

## What keeps the frame rate (main.js `adaptQuality`)

- **Frame pacing.** The frame rate aimed for (60 by default) is a whole number of display frames,
  so frames stay evenly spaced: 72 fps on a 144 Hz display, 58 on 175 Hz. Display rate means one
  simulation step per refresh, 2.4 times the work of 60 at 143 Hz.
- **Adaptive quality,** every two seconds at real time or slower. Behind (frames late, the GPU busy
  for more than 92% of the frame with timestamps or 100% of it by submit-to-done time without, or
  Compute Pressure reporting `serious`): the render scale steps down a fixed ladder (1, 0.85, 0.7,
  0.6, 0.5 …) to its floor, then the frame rate drops (half, a third, a quarter: 30, 20, 15 fps), or
  the frame rate first when the simulation is more than twice the drawing. With room again for
  three windows: the frame rate back first, then the scale; a level that just proved too slow is
  not retried for 30 s. Settings → Performance shows the rate aimed for and why.
- **Coarse steps at low frame rates.** At real time a step covers up to a frame's worth of whole
  ticks, so below about 45 fps the world takes coarse steps (docs/fast-forward.md). A 2-tick step
  costs about 1.45 times a 1/60 s one (one neighbour scan, more motion substeps), so 30 fps still cuts
  the simulation's cost by a quarter and the drawing's by half, and a slow device keeps real time:
  the mature 4M world ran at 0.67× and now runs at 1× at 32 to 36 fps.
- **Bounded GPU work per submit.** At most two frames in flight, and fast speeds carry only the
  fraction of a step their budget leaves (they once saved credit up to 512 steps, which came due on
  a switch to Max: 2 s of GPU in one submit). A phone's compositor shares its GPU, so a long or deep
  queue of GPU work freezes the whole screen; this is the likeliest cause of the reported lockups.
- **Hidden page:** requestAnimationFrame stops, so the GPU rests; the soundtrack fades out and its
  audio thread is suspended.

## Culling and per-particle work

- Particles are sorted by grid cell, so a view that sees under half the world draws only the grid
  rows it covers (`CULL_WGSL`): the main view zoomed in, the loupe and the specimen close-up. A 4M
  world at 150 px per unit: scene pass 6.1 → 0.15 ms; with a cell picked the frame fell 29 → 19 ms.
- Tried and dropped: working out each distant sprite once in a compute pass instead of at each of
  its four corners (the 4M far view's points cost the same: the vertices themselves, not their
  arithmetic), and limiting `contactGather` to the grid cells a contact can reach (within noise).
- Seeing most of the world with particles a pixel or so across, and at least a quarter as many
  particles as pixels, the main view splats sprites of up to 1.6 px (`splatMain`): each adds its
  sprite's light to the four nearest pixels of a buffer (atomic adds), `fsSplat` adds the buffer into
  the scene, and only the particles too large to splat are drawn as quads. Drawing from afar: 1M
  world 1.97 → 1.64 ms, 4M 5.97 → 3.42 ms. The light is the same (the scene's total within 0.03%,
  `tools/perf/lightsum.mjs`); dense views look about 5% brighter after tone mapping, the light spread
  over a 2×2 footprint rather than a soft disc.

## Tools (`tools/perf/`)

All run Windows Chrome or Dawn on the real GPU through `tools/gpu-node.sh`. Keep benchmarks serial,
and never during a balance gate.

- `bench.mjs --plan PLAN --out OUT.json` drives the built page. A plan names worlds (grown at Max
  once and saved to `runs/perf/worlds/`, so every scenario starts from the same moment) and
  scenarios: zoom (css px per world unit), speed, fps, render scale, a picked cell, sound, effects.
  Every pass of every frame is timed on the GPU (`engine.passProfile`), and each simulation dispatch
  (`profileStep`). `kind: 'step'` times only the step, repeated from one saved moment (about ±4%,
  but ±8% between page loads: compare variants in one run, alternating). `kind: 'growth'` follows a
  fresh world's step cost as life grows. A world's `page` loads a variant build from
  `runs/perf/pages/`, `init` runs a script first, `k` overrides tunables.
- `stepbench.mjs` times a saved world's step under Dawn. Dawn's npm build compiles with FXC, not
  DXC as Chrome does, so its kernel timings differ from the browser's.
- `shots.mjs` screenshots a saved world at several zooms (for pixel comparisons of render variants);
  `flash.mjs` measures every composited frame's brightness around render-scale changes.
- In the page, Settings → Performance → **Copy profile** (where the GPU gives timestamps) times three
  seconds of frames pass by pass and a step dispatch by dispatch on that device, and copies it as
  JSON: the way to see how a phone spends its time.
