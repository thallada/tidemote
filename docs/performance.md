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
  Compute Pressure reporting `serious`): with Auto render scale, a scene drawn at more than one device
  pixel per CSS pixel (Pixel density 1.5× or 2× on a high-density screen) drops to 1× first, the
  cheapest sharpness to give up (1.5× is 2.25 times the pixels); then the render scale steps down a fixed ladder (1, 0.85, 0.7,
  0.6, 0.5 …) to its floor, then the frame rate drops (half, a third, a quarter: 30, 20, 15 fps), or
  the frame rate first when the simulation is more than twice the drawing. With room again for
  three windows: the frame rate back first, then the scale, then the pixel density; a level that just proved too slow is
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

- **Sizing a new world (calibrate).** Auto measures a frame of a fresh world and sizes it to 10 ms of
  GPU (9 by submit-to-done time without timestamps), down to 16k particles. A phone or tablet aims at
  55% of that: it is measured cool, and its GPU slows by a third or more once it runs hot, besides
  sharing the GPU with the compositor. A count of 64k or fewer marks a low-end GPU, which samples 144
  neighbours rather than 192 (see above) unless Settings chose a budget. 16k against 32k (32 seeds ×
  30 min each, 2026-10-11, `runs/lowend/`): no gated metric differs (persistence, food webs, guilds,
  monocultures); effective species fall from 83 to 59, as a world half the size holds fewer niches.

## A phone (2026-10-11)

Copy profile from a Pixel 11 Pro (Chrome 155) before the changes above: 32k particles (the floor then),
10.5k living, 753×1350 (1.5× density), held at 30 fps with 2-tick steps and still late, 20.8 ms a frame:
step 11.4 ms (lifeMain 5.4, scatterMain 1.5, resolveCount 0.5), scene 4.8, composite 2.1, stone 0.55,
bloom 0.43. Its timestamps come in steps of about 0.066 ms. lifeMain costs about 500 ns per living cell
there against 5 to 6 ns on the RTX cards, far more than the difference in raw throughput, while
matterMain (no neighbours, no scattered writes) costs about as much per particle as on a desktop.
`#k={"probe":N}` builds lifeMain variants that show where its time goes on such a device (the world
goes wrong while one is set): 1 without mutation (the rarely taken code that copies a genome), 2 with
the neighbour loop only loading its neighbours, 3 without the neighbour loop; 4 and 5 are exact (the
same world) and may suit such a GPU better: 4 reads only the grid cells within a cell's reach (desktop:
+4 to 9% a step), 5 keeps the neighbourhood's index ranges out of an array (desktop: +5% at 128k, -3%
at 512k; the gate passes against HEAD). On the RTX 2080 the neighbour loop is about two thirds of
lifeMain and costs the same when it only loads its neighbours: memory latency, not arithmetic, so half
floats would buy little there.

The matter-heap fix below does not touch this profile: at the phone's zoom outlines have not resolved,
so `contactGather` never ran (no inbond pass in it). At the phone's viewport on the RTX, a 32k world
(speed 8, two alternating runs each) steps the same before and after; zoomed in, the inbond pass goes
0.14–0.28 → 0.09–0.15 ms, about 3% of the frame.

## Culling and per-particle work

- Particles are sorted by grid cell, so a view that sees under half the world draws only the grid
  rows it covers (`CULL_WGSL`): the main view zoomed in, the loupe and the specimen close-up. A 4M
  world at 150 px per unit: scene pass 6.1 → 0.15 ms; with a cell picked the frame fell 29 → 19 ms.
- Matter heaps (2026-10-12). Silt and glint can pile into a few grid cells: a 2.4M world (save in
  `runs/perf/worlds/slow.tidemote`, plan `tools/perf/plans/heaps.json`) had about a hundred grid cells
  over 3000 particles and one of 14,410, nearly all grains, with a few hundred cells among them.
  `contactGather` (each resolved cell's six nearest contacts, for drawing) scanned every particle in
  the 3×3 grid cells around each living cell, so a heap in view cost 190–690 ms of GPU per frame: the
  loupe swept over the world or the auto camera closing in dropped the page to 15–20 fps, and the
  adaptive quality then held it there. Now each grid cell's workgroup (256 threads) first gathers the
  living cells within reach (its own, then those within 0.6 units in the eight around) into workgroup
  memory, at most 1024, and each cell searches only those: 2–5 ms at the worst heap, 0.1–0.5 ms
  elsewhere, and the same contacts (98–99.8% of cells identical, the rest ties in order or the sixth
  place). The loupe over that world: 17–20 fps → 58 fps (GPU p95 124–197 ms → 13.5 ms). The step is
  unaffected (it samples `maxScan` neighbours), though the heaps make `matterMain` and `resolveCount`
  2–3 times their usual cost per particle.
- Tried and dropped: working out each distant sprite once in a compute pass instead of at each of
  its four corners (the 4M far view's points cost the same: the vertices themselves, not their
  arithmetic), and limiting `contactGather` to the grid cells a contact can reach (within noise).
  Also giving each `INBOND_WGSL` workgroup a run of four grid cells instead of one (a cell holds about
  22 particles, so most of a 64-thread workgroup idles): 30–50% slower on NVIDIA, where the idle half
  is a whole warp that exits at once and the shared 3×3 neighbourhood stays in cache.
- Linux without a display: `bench.mjs --linux --dpr 2 --width 412 --height 915` runs Playwright's
  Chromium headless on the GPU through Vulkan (a phone-shaped viewport here). NVIDIA lacks
  `VK_EXT_headless_surface`: set `TIDEMOTE_VK_LAYER` to a directory with a pass-through layer whose
  manifest advertises it. The GPU clocks down under light load (a 1× frame runs at about a third of
  full clock), so compare variants alternately, or at a fast speed that keeps it busy.
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
  `runs/perf/pages/`, `init` runs a script first, `k` overrides tunables. A world's `file` may name a
  `.tidemote` save (Settings → Worlds) instead; `zoom: 'saved'` keeps its camera, `at` centres the
  view on a fixed spot, `mouse: 'sweep'` moves the pointer (the loupe) while measuring, and `adapt: 'keep'`
  leaves the adaptive quality to run as it would. Every report has the adaptation second by second
  and the passes of each frame over 40 ms (`spikes`).
- `stepbench.mjs` times a saved world's step under Dawn. Dawn's npm build compiles with FXC, not
  DXC as Chrome does, so its kernel timings differ from the browser's.
- `shots.mjs` screenshots a saved world at several zooms (for pixel comparisons of render variants);
  `flash.mjs` measures every composited frame's brightness around render-scale changes.
- In the page, Settings → Performance → **Copy profile** (where the GPU gives timestamps) times three
  seconds of frames pass by pass and a step dispatch by dispatch on that device, and copies it as
  JSON: the way to see how a phone spends its time.
