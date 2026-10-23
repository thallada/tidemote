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

## Starting up (compiling the shaders)

"Starting the GPU" is the shaders' compile: 49 pipelines, from which `lifeMain` and `mindMain` (each
also built for coarse steps) and the scene's point and composite shaders take most of the time. The
browser keeps compiled shaders on disk, so a reload of the same build starts in about 0.4 s; any change
to the shader text (a new build, a `#k=` override) compiles afresh. Measured 2026-10-23 on an RTX 4070
Ti (Chrome, D3D12, `runs/boot/boot-time.mjs`): created one by one, the pipelines compiled in turn,
27 s from an empty cache (about 20 s with the driver's own cache warm). Created async (`createEngine`
waits on `create*PipelineAsync`) they compile in parallel: 10 s. The three a new world can do without
(`LATE` in engine.js: coarse steps and the watched cell's replay) compile on after it starts: 5.8 s,
those three ready about 2.5 s later, while coarse steps asked for meanwhile run as fine ones and the
mind view waits. The compile fills the first half of the loading bar, weighted by each pipeline's
rough cost (`COMPILE_COST`). Headless runs wait for every pipeline.

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
- **Following a cell (2026-10-12).** Following a predator in the 2.4M heaps world (plan
  `tools/perf/plans/follow.json`) fell from 58 to 15–30 fps on an RTX 4070 Ti at 175 Hz, through
  faults in the pacing, none in the GPU's work (following itself costs about 0.3 ms: `pickMain`,
  `mindMain`, the cell drawn up close). (1) At real time the time owed was split evenly into steps:
  a frame a vsync late (22.9 ms, 1.37 ticks) ran two steps of 0.69 ticks, 13 ms of GPU for one
  frame's time, which made the next late too. 36–45% of frames took two steps, selected or not (80
  steps a second at 57 fps, so the tick-counted rules ran a third fast against the headless runs).
  Steps are now whole, stretched by up to a tenth to keep the motion with the clock, and the
  remainder carries: one step a frame, GPU 9.0–9.7 → 6.9–7.4 ms mean and 13–14.5 → 7.1–7.9 ms p95.
  (2) A frame's steps were capped by `MAX_FRAME_MS`, not its own interval, so a late frame could
  take three. (3) The display interval was the median of rAF intervals; while the GPU lags, rAF
  fires every other vsync for seconds, so 175 Hz read as 88 Hz and 60 fps frames looked late. It is
  now the median of the intervals near the shortest, and rises only once a longer one has held for
  five windows. (4) A frame rate halved was judged able to return by its own frame's GPU time, but
  its 2-tick step costs 1.45 times a 1/60 s one, so it never looked able to; the estimate now
  scales the step. Bench scenarios take `species` (follow one), `adapt: 'off'` and `series`.
  (5) A selected cell still dropped some runs to 40–50 fps with the GPU idle: rAF itself fell from
  175 to 80–130 Hz. The mind view changes every frame (the compass's arrows alone 400 attribute
  writes a second), and inside the specimen panel's scrolling record (3600 px tall) each change
  repainted all of it; the overlay canvas, drawn every frame, repainted the whole page with it.
  Paint, layerizing, layout and style took about 300 ms a second of the main thread, past what a
  175 Hz vsync leaves. With the overlay and the mind view's live parts on layers of their own
  (`will-change` in `page.css`), about 20: selected or followed, 58 fps in every run. (6) The
  followed cell and the cells marked singing were found by id in a scan of every particle each
  frame (0.3 ms each at 2.4M). Each is now looked for first in the 5×5 grid cells around where it
  is expected (where last found, carried on at its velocity), and the full scan runs, sized on
  the GPU through an indirect dispatch, only when that misses: 0.3 → 0.01 ms and 0.23 → 0.04 ms.
  A cell a full scan didn't find has died and isn't looked for again.
- **Bounded GPU work per submit.** At most two frames in flight, and fast speeds carry only the
  fraction of a step their budget leaves (they once saved credit up to 512 steps, which came due on
  a switch to Max: 2 s of GPU in one submit). A phone's compositor shares its GPU, so a long or deep
  queue of GPU work freezes the whole screen; this is the likeliest cause of the reported lockups.
- **Hidden page:** requestAnimationFrame stops, so the GPU rests; the soundtrack fades out and its
  audio thread is suspended.
- **Sizing a new world (calibrate).** Auto measures a frame of a fresh world and sizes it to 10 ms of
  GPU (9 by submit-to-done time without timestamps), down to 16k particles. A phone or tablet aims at 55% of that: it is
  measured cool, and its GPU slows by a third or more once it runs hot, besides sharing the GPU with
  the compositor (a Pixel 11 Pro, 2026-10-11, held at 30 fps and was still late in a 32k world at 1.5×
  density: step 11.4 ms, scene and composite about 7 ms). 16k against 32k (32 seeds × 30 min each,
  2026-10-23, `runs/lowend/`): no other gated metric differs (persistence, food webs, guilds,
  monocultures); effective species fall from 111 to 81, as a world half the size holds fewer niches,
  and the living swing a little more (CV 0.24 → 0.31). Sampling 144 neighbours instead of 192 in such
  a world was tried and left out: on an RTX 4070 Ti it saves about 4% of a 16k step (`lifeMain` −10%),
  and its 32 seeds leaned worse (3 collapses against none, effective species 81 → 68, Hill-2 31 → 25;
  none significant alone).

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
  A survey of the 40 densest spots at zoom 40 and 150 (every pass timed) found `contactGather` still
  the only cost that moved with the view, 0.03–7.3 ms, against a steady step and drawing; with
  sound on and the adaptation running, a heap in view held the page at 29–52 fps. Timed alone in
  Chrome over the save's particles (both kernels on the same data, the contacts compared), three
  things: (1) each thread took a particle of its grid cell, and a heap's few hundred cells among ten
  thousand grains left one thread in 32 searching while the rest waited, round after round; threads
  now take the cell's own living cells, listed first in the gather (and in `ownMore` past 1024, as a
  colony can crowd 1500 into one grid cell). (2) Each cell compared itself with every one gathered;
  past 64 they are now sorted into bins of 0.125 units and each cell searches outward from its own,
  skipping any bin farther than its sixth contact so far (brute force stays faster below 64). (3)
  Index and size share a word, so the order fits the 16 KB of workgroup memory. A heap's view
  3.3 → 0.35 ms, the densest colony's 4.2 → 0.83 ms, the whole world 18 → 6 ms; 99% of contacts
  identical (in a grid cell past 1024 the gathered set varies run to run, as before). Every spot and
  zoom (fit to 600 px per unit) now runs at 8–12 ms of GPU, and the heaps plan at 58 fps throughout.
  Dawn's npm build compiles with FXC, which fails on `INBOND_WGSL`, so time such kernels in Chrome.
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
