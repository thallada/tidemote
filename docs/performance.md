# Performance: how the page keeps its frame rate, and how to measure it

Measured on an RTX 4070 Ti (Chrome 155, D3D12, 2560×1440 at 175 Hz) with `tools/perf/` (below),
on saved worlds grown at Max: `w1m` (1M particles, about 540k living) and `w4m` (4M, about 1.6M living),
regrown 2026-10-26 (the 2026-10-09 worlds had loaded lifeless since the layouts changed; `bench.mjs`
now refuses a world that loads with nothing living). A `.bin` world carries no climate, so pin it
(`k: {lowEras: 0, eventPlan: 'none@1000000000'}` for full water) or each load draws its own era.

## Where the GPU time goes

The simulation step dominates. Per pass, `kind: 'step'` (2026-10-26, full water):

| world | step | lifeMain | scatter | contact | resolveCount | matter | bondBack |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1M, 540k living | 3.3 ms | 1.9 ms | 0.35 | 0.47 | 0.19 | 0.19 | 0.10 |
| 4M, 1.6M living | 10.3 ms | 5.1 ms | 1.65 | 1.5 | 0.77 | 0.66 | 0.43 |

About 3.2 ns of `lifeMain` per living cell (4.3 on 2026-10-09). Its neighbor walk is now the smaller
part: a build whose walk visits nothing takes 1.1 ms off its 5 ms at 4M, and one that reads every
neighbor but does nothing with them costs the same as no walk, so the walk's reads are cheap and the
rest of the kernel (each cell's own rules) is the bulk. `contactMain` is mostly its walk: `contactCap`
32 instead of 128 takes 0.7 ms off it at 4M, 8 takes 1.0. Settings → Neighbors scales it with `maxScan`
(`contactCap` at the default, 88 → about 100), so the one setting trades both walks for speed. `scatterMain`
moves about 140 bytes a particle, near the card's bandwidth (1.2 ms of its 1.65 at 4M).

**Low water and atomics (2026-10-26).** A step at 4M had grown to 12 ms at full water and 19 ms in a
low era (any level below 1, or frost, runs the shore's work for every particle). The cost was reads of
the heat field, the pond's floor and stone through `atomicLoad`, which Dawn's D3D12 backend compiles to
an interlocked read-modify-write: thousands of threads reading the same grid cells serialize. Read-only
bindings of those buffers (`thermal` read-only with the heat accumulators moved to the ledger's end,
`stoneCells` an alias of `stoneGrid`) and the pond and flow sampled once per particle brought `matterMain`
at low water from 6.9 to 1.4 ms and the step to 10.6 ms either way. Never `atomicLoad` a field many
threads read: bind it read-only. And the level now settles exactly at 1 after a low era (it crept
toward it for minutes before, keeping the shore's work on). Reef wear walks its 9×9 neighborhood every
eighth frame by runs of 64 particles (whole warps skip it together), eight frames' worth: `matterMain`
1.15 → 0.66 ms at 4M.

Life fills a world within a couple of simulated minutes (30 to 70% of particles living after that),
so the cost the page calibrates against at start is close to the mature one; it then swings with
the climate by ±30%.

`lifeMain` is limited by registers (occupancy), not arithmetic: cutting state it carries through the
neighbor loop is what pays. On 2026-10-09 the neighbor loop was about 93% of it; its cost scales with the sample
budget `maxScan`: 192 since 2026-10-09 (288 before), which took about 25% off `lifeMain` (1M world
2.30 → 1.67 ms, 4M 9.9 → 7.8 ms). It passed the 32-seed gate against 288 and against heat-framboids,
and 128 seeds at 4-tick steps matched 288 or bettered it (effective species 79.5 ± 4.4 against
72.0 ± 3.9; its reports were in `balance/maxscan/`, in the history up to 619e639). It is a uniform (`sim.maxScan`), so Settings → Perf →
Neighbors changes it live (no measurable cost against a compiled constant); since 2026-10-25 it offers about
¾, 1, 1½ and 2 times the default `maxScan` (now 112: 88, 112, 168, 224), the default marked.

144 against 192 (2026-10-10, after the hot-springs change): the step is 8% faster in the 1M world and
14% in the 4M one (`lifeMain` 11% and 15%; 288 is 20% slower). Ecology is unchanged: the gate passes
against the baseline and against 192, and over 384 seeds at 4-tick steps collapses (living under 2%)
were 5 at 144, 8 at 192 and 5 at 288. The 12 traced were sudden cold (a cold snap on a seasonal low,
cells adapted to warm water torpid) or predator boom-busts, none budget-related. What fewer samples do
change is the noise of a crowded cell's forces: in matched-start forks (16 worlds) 144 raises the mean
force on a crowded cell by about 20% over 192 and its speed by 7–8% (288 lowers them as much), and a
hungry cell finds food in reach 2–3% less often. That evens out over a run but colonies jostle more.

Drawing (2026-10-26, a frame's GPU time less the step's): the 4M world seen whole costs about 5 ms
(`splatMain` 2.0, adding the splats into the scene 1.3, `fsStone` 1.05), zoomed in about 1.8 ms; the 1M
world seen whole about 2.9 ms. Zoomed in, the cost is the resolved cells' fragment work, which the render
scale reduces faster than linearly (the level of detail is set in framebuffer pixels).

## Apple GPUs (an M1 MacBook, 2026-11-04)

Measured in Chrome 156 on Metal (`bench.mjs --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
under plain node), on a 78k world (`slow-mac-world.tidemote`, 32k living) in a 1440×900 window at 1.5×.

- **Per-pass timestamps mislead here.** A tiled GPU overlaps render passes, so each pass's span takes in others'
  (the composite's read 35 ms of a 43 ms frame, the bloom's 33). Trust the frame's total and compare builds: a
  plan's world takes `page`, a variant build in `runs/perf/pages/`, and early returns in a shader show what its
  parts cost.
- **The bubbles' search** (`bubbleBend`, `extremes`) ran wherever the water was 30° or more, though air comes out
  only from 42° (`GAS_FROM`) and vapor near a boil: 18 sets of hashes and heat reads a pixel, finding nothing. The
  world's colonies had warmed half its water past 30° (to 40°), and the search cost 20 ms of the frame. `bubblesNear`
  now looks only where water hot enough lies within reach (the slope carried 2.5 spacings, 3° to spare): 43 → 23 ms.
- **The step:** `lifeMain` costs about 110 ns a living cell (3.2 on the RTX 4070 Ti, which has about 15 times the
  compute). In workgroups of 256 instead of 128 it is a quarter faster (3.8 → 2.8 ms; coarse 4-tick steps
  5.6 → 4.3; 64 and 32 between), so Apple's adapters build the living-list passes at 256 (`lifeWG`, simWGSL).
  The kernel is register-bound, which Apple's GPUs feel more: the place to look next.
- **Where the frame goes** (Instruments: `xcrun xctrace record --template 'Metal System Trace' --instrument 'Metal GPU
  Counters' --attach PID` on Chrome's GPU process, exported with `xctrace export`; per-encoder times are exact, and
  the shader profiler's samples fall in each shader's code range, though not to lines). A mature 139k world at 1×,
  1440×757: the composite 7 ms of an 18 ms frame (42% of the shader samples), the step 3.1, the scene about 2.5. No
  unit is the limit: the composite ran at 18% fragment occupancy with the ALU 48% busy and textures 9%, the step at 22%
  compute occupancy: too many registers to keep enough threads in flight.
- **The lean composite.** The composite's rare features (dry floor, ice, duckweed, an instrument in the water, the
  maps) sit behind uniform branches, but their registers count against every pixel. `LEAN` (POST_WGSL) builds it
  without them, compiled after start; `compPick` writes both composites' draws each frame, the lean one where the
  engine's uniforms allow it and no water is frozen (ICE_N, which only the GPU knows). The same pixels (a frozen frame
  compared lean against full, with and without ice), 16.8 → 14.0 ms a frame.
- **Timing a pass exactly.** Run a build in `bench.mjs` for a while and attach Instruments for two seconds; the
  `metal-gpu-intervals` table holds every encoder's duration and process (Chrome's GPU process, WindowServer, any
  terminal redrawing, all on one GPU: keep only Chrome's). WebGPU's labels do not reach Metal, so passes are told
  apart by their order in the frame (step, `listMain`, the scene's vertex and fragment stages, `fsStoneLit`, the bloom,
  the murk, the composite last) and by removing one in a variant build. At 60 fps the GPU idles between frames and
  its clock drops run to run (one build's composite read 3.8 and 4.9 ms on successive runs): compare builds at
  `speed: "max"`, which keeps it busy.
- **Sprites drawn small** (a pixel or two across, most of a world seen whole) went through all of `vsPoint`, its
  `spriteOf` (the cell's genome, motion record and water) at each of the quad's four corners: 2.1 ms at fit, the scene's
  vertex stage on the critical path. `listMain` sizes each sprite once and writes those drawn small as 8-word records
  for a slim pipeline (`vsPointSmall`, `fsPointSmall`), listing the rest for `vsPoint`: vertex 2.1 → 0.7 ms, the scene's
  fragments 1.2 → 0.5, `listMain` 0.25; zoomed in (culled), vertex 1.5 → 0.8.
- **Work multiplied by 0.** `shimmer` drew boiling water's roil noise (`flowNoise`: the currents twice, four value
  noises) at every pixel and multiplied it by `boilAt`, 0 away from a boil: 1.2 ms of the composite. The sea at the
  view's center (`seaAt(post.cam)`), a frame constant, was taken at every pixel: now once in `vsComp` (0.35 ms).
  `fsStoneLit` wrote and stored a view-sized target (the pile's order) that the composite reads only zoomed past 80
  pixels a unit (0.3 ms).
- **The page's own layers.** Chrome composites the page onto the screen after Tidemote's frame: 0.16 ms bare, 1.7 ms
  with the docked panel open, nearly all of it the panels' `backdrop-filter: blur(6px)` (`.panel`), which re-blurs
  the live view under the panel every frame at the screen's resolution. The engine now draws that glass itself
  (`src/glass.js` follows the translucent panels; `Engine.setGlass`, `GLASS_WGSL`: each panel's strip of the view
  copied out after the frame, blurred across and down, drawn back under it), within Chrome's remaining 0.17 ms.
- **Cells too small for their insides** (under `interiorLOD`'s 12 pixels) and not sparkling as a new species take a
  lean point pipeline (`INTERIOR` false, listed by `listMain` from the quad list's end): the interior detail's
  registers cost every resolved cell's pixels (`slow-mac-world` at 71 pixels a unit: the scene's fragments 4.9 → 4.3
  ms). There the cost is the outlines: the fused partners' (`cellOutline` again for each, 1.2 ms) and the contact
  planes' seams (1.0 ms).
- **`lifeMain` reads its genome through a pointer** (`let g = &genomes[p.kind]`): `genomes` is read_write in the
  sim, so a copy had every field the kernel uses loaded at its start and held; read where used, 5% faster (2.86 →
  2.72 ms, coarse 4.23 → 3.99). Only on Apple's GPUs (`genomePtr`, simWGSL): on an RTX 4070 Ti in Chrome on D3D12
  the pointer made `lifeMain` 15-20% slower (step scenarios, a 1M world: 1.94 → 2.33 ms; 4M: 6.10 → 6.58; 6-tick
  coarse steps the same), so other GPUs keep the copy. The neighbor scan is three quarters of the kernel (2.4 of 3 ms
  skipped at run time); the mutation path and the hand's and stranding's paths are not where its registers peak.
- **Close up (slow-mac-world at 71 pixels a unit), the next round.** The composite read the sea from a field from
  about 32 pixels a unit (`seaFieldMain`, 4.0 → 3.3 ms) and the eyepiece's iris and dust from a texture worked out only
  when they change (`opticsMain`; the rainbow rims' sectors without `atan2`; 3.37 → 2.98 ms); it is ALU-bound now (the
  ALU limiter 82%). The stone cache was lit every half second with 2-5 ms of vertex work spent coloring grains of other
  depth bands (`vsStone` tests its band first now), and its relighting is spread over three frames. A cell drawn without
  its interior skips its partners' outlines and its seams where it is covered whatever they do (3.43 → 3.12 ms). The save
  holds 58-60 fps at 1× (from 41) and Max runs at 9.4× (from 6.7×). At 1× a frame over budget makes the next one take
  two steps to keep time, so a world just over the budget sinks to about 54 fps.
- **Tried and dropped, `lifeMain`'s scan** (exact restructurings, none faster): reading neighbors through a pointer;
  the scan as a kernel of its own (its cost and the rest's only add up); gathering the neighbors in reach 4, 8 or 16 at
  a time before weighing them (40-55% slower); fetching the next neighbor ahead (3% slower); a grid cell to a
  workgroup, its neighborhood's positions in workgroup memory (4× slower: a grid cell holds about 5 living cells, so
  its workgroup sat mostly idle). The counters show `lifeMain` at 9.5% compute occupancy: its registers, not memory or
  ALU, are its limit. Also dropped: a checksum of the stone to skip unchanged relightings (stone wears and grows a few
  grains a second in a living world), and halving the gather arrays of `contactGather` (0.66 → 0.55 ms, but crowded
  cells would flatten against fewer neighbors).
- **After all this,** the 139k world at fit draws its frame in 10.6 ms (from 16.5), at 40 pixels a unit in 12.8. Still
  heavy: `lifeMain` (1.9 ms of a 3.3 ms step at fit; its rare paths, the hand and stranding, cost nothing measurable
  when left out: its core is the neighbor scan), the composite (3.6 ms: the water's surface about 0.8, the scene's
  reads and the lens 0.6), and up close `cellColor` (at 71 pixels a unit, `slow-mac-world`: 3.9 of the scene's 4.9 ms,
  nearly all inside the cells, not the quads' margins).
- **Sizing.** Auto's measure is a frame of a world with nothing living yet (the step without `lifeMain`'s cost)
  and a fresh world's heavier drawing: 262k measured 3.3 ms of step and 16–22 ms of drawing, which sized the world
  at 139k, where a mature world (21k living) takes 3.7 and 13 ms at 1×. On the RTX 4070 Ti the two errors about cancel;
  here the drawing alone fills more than the 10 ms aimed for, and the view must lower its scale at any count.
  Timing the step alone was tried and dropped: it sized the world at 442k, 30 fps at half scale once life filled it.
  With the drawing cheaper (the changes below) the error grew: a new world measured at 258k ran at 30 fps and half
  scale two minutes in. `calibrate` now adds what the measure leaves out, the living cells' passes for the life still to
  come: `livingMs` times the step dispatch by dispatch (`profileStep`, no frame beside it) over the new world's
  founders (`K.foundLife`, 2%), and the frame is projected to `MATURE_LIVING` (0.5: a 143k world bloomed to 50% living
  in five minutes). On the M1 Auto now sizes a world at 106k, which holds 10–11 ms a frame at full scale through its
  bloom. On a large GPU the founders of the first measure are too few to fill it: on the RTX 4070 Ti 262k particles'
  5k founders took 0.18 ms, 35 ns each against about 5 in a grown world, which sized its worlds at 700k (half what
  it had) that then drew in 3 ms a frame. A GPU with room for more than 1.2 times the first count (the measure alone,
  before the projection) is measured again nearer it, and its cost a cell is the difference between the two worlds'
  (about 2.6 ns there): it sizes 1.76-2.09M (five fresh worlds), and a 1.8M one four minutes in (640k living) draws in
  5.3-8 ms at every zoom. A GPU without that room (the M1) takes one measure, as before.

## Phones (a Pixel 11 Pro, 2026-11-04)

Measured on a Pixel 11 Pro (Tensor G6, PowerVR C-Series CXTP-48-1536, Android 17, Chrome 156, 120 Hz, 502×984 CSS
pixels at 2.55 device pixels each) with `bench.mjs --android` (Tools, below) on a 16k world grown at Max for two minutes
(`phone16k`, about 7.2k living). Its timestamps come in steps of 0.066 ms, so the smallest passes read as one step.
Chrome reports its adapter's vendor (`img-tec`) but neither architecture nor description.

- **Where the frame goes.** The step, 8 ms of a 60 fps frame once life fills the world (a fresh world's founders cost
  2.6 ms; it blooms from 2% to 40% living in about two and a half minutes): `lifeMain` 5.1-5.4 ms (about 720 ns a living
  cell, against 85 on an M1 and 3 on an RTX 4070 Ti), `contactMain` 1.8, `resolveCount` 1.3-1.8. Seen whole, drawing
  8.6 ms: the sea's spectrum and inverse FFT 2.6, the composite 2.5, cells 1.2, bloom 0.3. Up close (80 pixels a unit)
  14.4 ms: cells 4.2-5.5, `contactGather` 3.3, the sea 2.3, the composite 2.2. 43 fps at full scale there before.
- **The tuner** (`src/tuner.js`, Settings → Perf → Adaptation, on by default; the neighbors are Settings →
  Neighbors', Auto while left at the default): render scale and eight knobs (the sea's turns, bloom, the specks, the
  stone's relighting, the heat haze, the microscope, cells' insides, the neighbors), moved one step at a time every two
  seconds by what each step costs this device and what it shows. Every effect has one control, in Display, saying what
  the viewer wants; the tuner only ever eases an effect whose Display row is on Auto (`tuneAuto` in `src/main.js`: a
  knob whose effect is off, or set to a value of the viewer's, sits at its best and is never counted as saving
  anything), and Adaptation off leaves every knob at its best. What it holds back right now (`heldBack`, pure and
  tested) is listed under Adaptation, and each Display row on Auto underlines the value it holds now (Off while eased). Tools still pin knobs (`T.setTune`, `T.setEffects`, a bench plan's `tune` and
  `effects`), never saved. The heat haze (barely seen: 1 - SSIM 0.001-0.006) and the microscope (the optics, their murk
  and the look: 0.10-0.13, the composite about halved) were once one Finish ladder; as two knobs they keep its steps'
  losses (0.05 and 1.2), so the haze still goes long before the microscope and the microscope comes back first, and
  their cost is the composite's per pixel in each of the four states of the two (`COMP_GUESS` until learned). Cell
  insides: every cell in the main view drawn by the lean point pipeline (0.007-0.012 up close), and in the loupe and
  the live close-up, which draw the world as the main view does (the cost learned from the main view's pass alone);
  the neighbors 112, 88 or 64 (no ecological difference at 64 in 8k worlds, at 88 in 16k ones, `runs/lowend`). The
  haze's and the microscope's, the insides' and the neighbors' costs sit inside passes shared with others (the
  composite, the cells' pass, the step), so each is learned from that pass at each of its levels. `test/tuner.test.js` runs the tuner window after window
  against a Pixel 3, a Pixel 11 Pro and an RTX 4070 Ti modeled from these measurements: each settles within its frame
  (the Pixel 3 at 30 fps, half scale, without the haze or the microscope, 88 neighbors, the sea at half rate; the
  Pixel 11 at 85% scale, the sea at a quarter; the RTX at its best).
  Behind, the step that saves the most GPU time for the least lost to the eye; with room (the frame under 85% busy), the
  one that brings back the most for its time; with no room, a rebalance (a cheap step given up to pay for one worth half
  as much again for its time; only the dressing pays, the resolution falls only when frames are late). A knob's cost is
  measured every 10 s, 20 frames pass by pass (`tuneProfile`), and guessed as a share of the drawing until then; the
  neighbors' is the step itself, learned at each of their levels (`tuneSteps`). Their eye's weights were judged, then
  the dressing's ordered by frozen frames scored against full quality (1 - SSIM, `runs/phone/ssim.py`, a one-off kept outside the repo): the sea gone
  0.16-0.36, bloom 0.03-0.09, the specks 0.002-0.004. The sea turns every 1, 2 or 4 frames or not at all (2.6 → 1.3 →
  0.7 ms on the Pixel 11), bloom and the sea fade over a second as they turn (`Engine._fadeFx`), the stone relights every
  0.5, 1 or 2 s. On the Pixel 11 the sea goes to half and quarter rate before the resolution falls; on an RTX 4070 Ti,
  where the dressing costs next to nothing, only the resolution would. A climb that is late again within 6 s is held
  (`perf.hold`). An emergency (`overload`: three frames over max(50 ms, 3 frames)) takes every free knob to its floor
  and the scale down at once, held for a minute, but never at fast speeds (their steps are planned to a budget,
  `fastCost`) or in a world's first 2 s (its loading). The sea is no longer turned while paused, on any device. Leaving
  out `contactGather` up close (3.3 ms) was tried and dropped: crowded cells lost the walls their tissue fills out to
  and showed their bare body plans.
- **`resolveCount`'s matter.** Nearly every particle is matter, silt most, and each thread added its kind into one
  workgroup word, which a workgroup's threads queued for: spread over 32 copies by thread and summed once (exact: every
  census sums to the count), 1.77 → 1.29 ms a step (three rounds each; a probe without the matter's counts at all, 1.46).
- **Tried, no difference:** workgroups of 64, 128 or 256 for the living passes (`lifeWG`; `lifeMain` 5.1-5.5 ms in each),
  and the genome read through a pointer (5.4). PowerVR keeps the defaults.
- **The phone's freezes** (a frozen screen that needs the power key held; seen Oct 29 and 31 by the boot reasons, no
  record left of what ran): not reproduced in an hour of runs, Max included (16k at Max: frames up to 31 ms, no stall;
  a tab closed during a 65k world's run with no GPU process lost). The one restart in this session was Android's own
  (`system_server`'s watchdog: its adb pairing thread deadlocked while pairing over Tailscale). Pair over the LAN.

## A 32k world on an M1, worked out on the RTX 4070 Ti (2026-11-12)

An M1 MacBook at 32k particles holds "(mostly) 60 fps" with Adaptation off: a frame near its 16.7 ms, not far over.
Measured here on the RTX 4070 Ti (Chrome 157, D3D12, 175 Hz, so 58 fps aimed for) with `tools/perf/plans/m32k.json`
(`w32k`: 32,768 particles grown 90 s at Max, 17.7k living, about 1000 species, full water and no events) at 2560×1440
(canvas 2544×1289), and `m32k-mac.json`, the same world in a 1440×900 window at 1.5 device pixels (`--dpr 1.5`;
canvas 1426×750, the Mac's 1440×757 of 2026-11-04), the dressing held at its best (`effects: 'high'`), scale 1.
New for this: a scenario's `trace` (a Chrome trace and a JS profile; `tools/perf/trace.mjs` sums them: the main thread
frame by frame, its longest tasks and what ran in them, GC, Chrome's dropped frames, JS self time), `auto` (the auto
camera), `look` as tunables (`{ "dof": 0 }`), `--dpr` on Windows, and every report's `rafInterval`, `worstGaps`.
Runs in `runs/perf/m32k-*.json`, `mac-*.json`, `notesp.json` (not in the repo).

**The GPU.** Per pass, ms a frame at 1× (means over 15-20 s; repeated scenarios agree within ±0.03 ms, the frame's
GPU p95 is 1.1-1.4 times its mean):

| pass | 2544×1289 fit (47 px a unit) | 1426×750 fit (27) | 1426×750 at 150 | 2544×1289 at 150, a cell selected | auto camera (67-92) |
| --- | --- | --- | --- | --- | --- |
| step (`lifeMain` 0.096, `contactMain` 0.06, `matterMain` 0.03) | 0.22-0.25 | 0.22 | 0.24 | 0.25 | 0.24-0.25 |
| `contactGather` (+ inbond) | 0.21-0.32 | – (under 2.8 px detail) | 0.04 | 0.04 | 0.22 |
| scene (`fsReproj` … the cells) | 0.12-0.17 | 0.05 | 0.18 | 0.28 + 0.04 close-up | 0.18-0.22 |
| `fsStoneLit(Scene)` | 0.07 | 0.02 | 0.03 | 0.10 | 0.08 |
| bloom (`fsDown`, `fsUp`) | 0.06 | 0.04 | 0.03 | 0.06 | 0.07 |
| `fsMurk` | 0.065 | 0.03 | 0.025 | 0.065 | 0.07 |
| sea (spectrum, FFT, field, shift map) | 0.16 | 0.05 | 0.06 | 0.07 | 0.14 |
| `fsComposite` | 0.48 | 0.20 | 0.18 | 0.71 | 0.57-0.61 |
| frame (GPU mean) | 1.59 | 0.79 | 0.94 | 1.96 | 1.79-1.94 |

At ×4 the step is 1.09 ms a frame (four steps; 0.27 each), the frame 2.3. A 6-tick coarse step is 0.38 ms (`lifeMainCoarse`
0.12, `bodyTick` 0.13). At the Mac's size, a quarter of the pixels (`scale: 0.5`) takes 0.79 → 0.60 ms, all dressing off
(`effects: 'low'`) 0.59, the look off 0.77; the shallow focus (Darkfield's `dof` 0.9, since 2026-11-12) costs 0.01 ms of the
composite at 150 px a unit (`dof: 0`: 0.18 → 0.17).

**The main thread.** From the traces (10 s each; a Ryzen 9 3900X, which an M1's cores match or beat at JS). The page's
rAF callback (`frameWork` with `eng.frame`'s encoding) and everything else on the main thread:

| view | main thread busy | rAF callback p50 / p95 / p99 / max | GC | what ran in the longest |
| --- | --- | --- | --- | --- |
| fit | 135 ms/s | 0.31 / 1.25 / 1.85 / 2.6 ms | 25 a second, 5 ms/s; one major GC of 26 ms | `GCFinalizeMCReduceMemory` (V8's memory reducer) |
| at 150, a cell selected | 244 ms/s | 0.46 / 3.7 / 5.1 / 46 ms | 1.8 ms/s | `renderSpecimen` → `plainGlyph` → `glyphURL`'s `toDataURL`, 29 ms |
| auto camera (live annotations) | 404-413 ms/s | 0.35 / 6.4-6.8 / 8.5-9.0 / 14.5-16 ms | 6 ms/s | the notes (`drawNotes` 207-218 ms/s) |

The frame's own work is small: `frameWork` 21 ms/s at fit, `eng.frame` 12. The census 3 ms/s, the HUD and panels under 1.
What grows is the live annotations, on by default with the auto camera, which a visitor's idle page starts after a
minute: `drawNotes` (the notes' model and `noteview.js`) took 207-218 ms/s of the main thread, 96 of them in `noteSp`
(main.js), the species of a slot worked out afresh, an object and a CSS color each time, for every call `noteview.js`
makes per frame (the roster twice a row, guild tests in loops over the view's cells); `Notes.sp` caches it for 2 s but
the view was handed the uncached function. Handing it `(k) => notes.sp(k)` (a variant page, same world, two runs of 30 s):
the main thread 404 → 338 ms/s, `drawNotes` 207 → 139, the rAF callback's p95 6.4 → 5.2 ms, Chrome's dropped frames
185 → 122 of about 830 drawn. The rest of the notes' cost is spread thin (`detect`'s stepped look 22 ms/s, `readView` 27,
the roster, `_stats`, text). With them, a 60 Hz frame's main thread is 4-9 ms in one frame of twenty, against under 2 at fit.

**Chrome's GPU process.** Its main thread runs WebGPU's commands (121 ms/s of `WebGPU` tasks under the auto camera) and
also rasterizes the page's 2D content, the overlay canvas and the DOM (`RasterDecoderImpl::DoEndRasterCHROMIUM`): 8 ms/s at
fit, 43-87 ms/s with a selection or the annotations, with single flushes of 24-36 ms (two to five in each 10 s trace),
and the glyph's `toDataURL` as a 22 ms `DoReadbackARGBImagePixels`. While one runs, the frame's WebGPU work waits behind
it. The auto camera hits the glyph too: its subject fills the specimen record, and a subject of matter or not yet
sequenced draws a glyph of a color not drawn before (25 ms on the main thread, 22 in the GPU process, in the Mac-sized
run). The same world under the auto camera at the Mac's size, with the annotations and without (`auto`, `auto-quiet`,
45 s each): submit intervals p99 32 against 22.9 ms, the worst 40-45 ms (five past 40) against 23.2, the GPU 1.05 against
0.80 ms a frame.

**Frame pacing here.** Submit intervals at fit: p50 17.2 ms (three 175 Hz vsyncs), p95 22.9 (four), max 23-40; the auto
camera p95 22-26, p99 24-32, and gaps of 29-58 ms every few seconds (three runs of 30-60 s; the GPU's frames never over
3 ms, so the main thread or Chrome). Chrome's pipeline marks 8% of frames with new content dropped at fit, 22-26% with
the annotations. The trace's own start shows as a 120-200 ms task (`CpuProfiler::StartProfiling`) in every traced run:
not the page's.

**Where an M1 loses its frame (known from 2026-11-04, the rest inferred).** Known: `lifeMain` costs about 110 ns a living
cell (20 times the RTX's 5.4 ns at this count: 32k cannot fill the RTX), the composite about 3 ms a megapixel (15-18 times
the RTX's 0.19), cells' shading close up 3-4 ms at 70 px a unit, WindowServer about 2 ms of the same GPU, Chrome's own
compositing 0.2; m139 at fit drew in 10.6 ms, slow-mac-world at 71 px a unit in about 13.4 (58-60 fps). Projected for 32k
at 1440×757 by those ratios:

| | fit (27 px a unit) | 80-150 px a unit, a cell selected |
| --- | --- | --- |
| step (`lifeMain` 1.9 of it) | 2.6-3.2 | 2.6-3.2 |
| `contactGather` | – | 0.4-0.7 |
| scene | ~1 | 3-4 (+0.5 the close-up) |
| stone lit, bloom, murk, sea | ~1.5 | ~1.5 |
| composite | ~3.2 | ~3.0 |
| WindowServer, Chrome | ~2.2 | ~2.2 |
| frame | ~10.5-11 | ~13.3-15 |

So the whole world at a laptop's size has room; up close with a cell selected (or the loupe, about 1.5 ms more) it sits
at the budget, where any extra (the stone relit every half second, 1.2 ms in its first frame; a director's move that
leaves the stone cache, all of its relighting in one frame; the overlay; the GPU's clock dropping between 60 fps frames)
tips a frame into the next vsync. Three things the RTX cannot show and that point at the Mac:
- **Pixels set the drawing, and the window sets the pixels.** Auto density draws one pixel a CSS pixel, so a full-screen
  Chrome on a 1440×900 Air is 1.3 Mpx, but a 1728×1117 14-inch or an external display at 2560×1440 (3.7 Mpx) triples
  the composite, the stone, the bloom and the murk: the per-pixel part of the frame alone would be 10-15 ms there. Which
  display and window size the Mac ran is the first thing to settle.
- **A small world's whole view is a close view.** 32k fills a 1440-px window at 27 px a unit (47 at 2560 here), so the
  cells are drawn resolved at fit, and from about 30 px a unit (a window past about 1600 CSS px) `contactGather` gathers
  every living cell's contacts every frame (0.21-0.32 ms here at 47 px, more than `lifeMain`); a 139k world at fit draws
  specks. Fewer particles do not make a frame cheap in proportion: under about 50k the drawing, not the step, sets an
  M1's frame.
- **The main thread, the GPU process and the overlay.** At 60 Hz a 4-9 ms rAF callback (the annotations) sits beside a
  GPU frame near the budget, and a 25-46 ms one (the specimen's glyph) or a 26 ms GC misses a vsync whatever the GPU does;
  the GPU process's 24-36 ms raster flushes hold up the WebGPU frame queued behind them. The overlay canvas, at the
  screen's 2 device pixels and redrawn every frame while anything is marked (a selection, the notes, the auto camera's
  subject), is 5.2 Mpx Skia draws and composites on the M1's GPU (a ~4 ms compute pass beside the scene on 2026-11-04,
  avenue 9 below). This is where the auto camera, which an idle page starts after a minute, differs from a still view.

**Candidates, by what they would win on the M1 for their risk.** None touches the ecology.
1. Notes' species from the cache (`species: (k) => notes.sp(k)` for `noteView.draw` in main.js). Measured: 65-80 ms/s of
   main thread, p95 callback −1.2 ms, a third fewer dropped frames here. One line; nothing visible changes (a name changed
   in the last 2 s shows a moment late).
2. The specimen's glyph without a GPU readback: `glyphURL` (glyphs.js) draws on a GPU-backed 2D canvas and reads it with
   `toDataURL`, a readback that holds the main thread 25-29 ms and the GPU process's 22 (measured, selected and under the
   auto camera). `scratch.getContext('2d', { willReadFrequently: true })` keeps that canvas on the CPU. One line; the
   same pixels.
3. The overlay's raster (measured here in the GPU process, its GPU cost on the Mac still to measure: `auto` against
   `auto-quiet`). 43-87 ms/s of rasterizing on the thread WebGPU shares, flushes up to 36 ms. Draw it only when what it
   shows changes (its key holds `cam.x`, so any camera motion redraws it whole), clear and redraw only last frame's
   rectangles, or draw it at `min(dpr, 1.5)`; then trace again for the long flushes' source (text new to Skia's glyph
   cache is a suspect: the notes' labels change size and words).
4. The stone's full relight on a camera move (`_stoneStale` 2, past 6% of zoom or the cache's margin: all its parts in
   one frame, about 1.8 ms on an M1). Under the auto camera at the Mac's size (40 s, every frame's passes kept) it came
   15 times, beside 69 half-second relights spread over three frames each: small. Spreading it too would show a few
   frames of stone from the old cache at the view's edge.
5. `opticsTex` as `rgba16float` (or `rgba8unorm`): three values in 0-1 read at every pixel each frame from an
   `rgba32float` (16 bytes a pixel; 17 MB a frame at the Mac's size, about 1 GB/s at 60 fps of the M1's 68). Exact to the
   eye; a format and the WGSL storage type.
6. `stepCap` at 1× budgets against the whole frame target, but WindowServer's ~2 ms on the same GPU is not in `renderR`:
   with drawing about 10.5 ms and a step 3 (16.5 for two), the cap allows the second step a late frame asks for, and that
   frame is late too. Budget against about 85% of the target (`stepCap(0.85 * frameTarget())` in `plan`). One line; the
   clock runs a little slow after a late frame instead of dropping a second one.
7. `contactGather` for cells that show no contact: it runs for the whole view from about 30 px a unit, where cells are
   11-15 px across; a higher floor (as `vsPoint` uses none under 6 px) needs judging by eye. 0.4-0.7 ms on an M1 where
   it runs (inferred from 0.66 at 71 px on 2026-11-04); nothing at the Mac's fit.
8. Known and larger: `lifeMain`'s registers (avenue 1), the cells' shading up close (2), the composite (3).
And for the user now: Settings → Display → Microscope off halves the composite (about 1.5 ms on an M1), Annotations off
takes the notes off the main thread, and a smaller window or Render scale 0.85 takes the per-pixel part down by a third.

**For the Mac (one session).** `npm run build`, then with the system Chrome (Instruments as in How to measure):
1. `node tools/perf/bench.mjs --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --plan
   tools/perf/plans/m32k-mac.json --width 1440 --height 900 --out runs/perf/mac-m1.json` (grows `w32k` 90 s at Max
   first; about 6 minutes): the frame (GPU, intervals, `worstGaps`) at fit, ×Max, without the dressing, at half scale,
   without the look, at 80 and 150, without the shallow focus, selected, under the auto camera with notes and without
   (`auto-quiet`). Per-pass times overlap on a tiled GPU: read the frame's total and the differences between scenarios.
   The `auto` scenario writes a trace; `node tools/perf/trace.mjs runs/perf/mac-m1-w32k-auto.trace.json`.
2. During `auto`, `xcrun xctrace record --template 'Metal System Trace' --attach <Chrome's GPU process> --time-limit 2s`:
   whether Skia's overlay pass and WindowServer sit on the critical path.
3. The same plan with `--width` and `--height` of the user's own window (and once full screen, `--width 1440 --height 900`
   on the Air's own display against the external one if there is one): how the frame follows the pixels.
4. On the page as the user runs it (Adaptation off, 32k, their window): Settings → Performance → Copy profile at fit, at
   their usual zoom with a cell selected, and with the auto camera running; then again with Annotations off, then
   Microscope off. Note the display (built-in or external), its scaling and the window's size.

## Where to look next (left off 2026-11-04, branch mac-perf merged; 2026-11-12 above)

Where an M1's frame stood when this work paused, at 1×, the GPU about 96% busy (Instruments' encoder table; the
step's share from `bench.mjs` step scenarios with `dispatch: true`):

| | slow-mac-world, 71 px a unit (78k, 34k living) | m139, fit (139k, 21k living) |
|---|---|---|
| step | ~3.9 ms (`lifeMain` 2.7, `contactMain` 0.4, scatter/matter/resolve ~0.7) | ~3.4 ms (`lifeMain` 1.9) |
| `contactGather` (animation records, detail views only) | 0.66 | – |
| scene: `listMain` / vertex / fragment | 0.07 / 1.1 / 3.1 (cells' shading) | 0.25 / 0.7 / 0.5 |
| stone lit into the scene, bloom, murk, small passes | ~1.5 | ~1.5 |
| composite | 3.0 | ~3.5 |
| Chrome's own compositing (glass included) | 0.2 | 0.2 |
| macOS WindowServer, on the same GPU | ~2 | ~2 |

The save holds 58-60 fps and m139 60; both sit near the 16.7 ms budget, and at 1× a frame over it makes the next one
take two steps to keep time (main.js's clock), so a world just past the budget sinks to about 54 fps rather than 58.

### How to measure (what worked)

- **Instruments, per encoder.** Run a build long enough (`bench.mjs` with a long `seconds`, `--chrome` the system
  Chrome), find Chrome's GPU process (`ps ax -o pid,command | grep "Google Chrome Helper (GPU)"`, the newest), then
  `xcrun xctrace record --template 'Metal System Trace' --attach PID --time-limit 2s --output t.trace` (add
  `--instrument 'Metal GPU Counters'` for limiters and occupancy) and `xcrun xctrace export --input t.trace --xpath
  '/trace-toc/run[@number="1"]/data/table[@schema="metal-gpu-intervals"]'` (also `metal-shader-profiler-shader-list`,
  `gpu-shader-profiler-sample`, `gpu-counter-info`, `gpu-counter-value`). Each row: start, duration, channel (Vertex,
  Fragment, Compute), process. Keep Chrome's rows only (WindowServer and any terminal share the GPU). WebGPU's labels
  do not reach Metal (`use_user_defined_labels_in_backend` did not help), so tell passes apart by their order in a
  frame (step; `listMain`; scene vertex then fragment; `fsStoneLit`; bloom; murk; the composite last; Chrome's
  compositing after it) and by removing one in a variant build. Shaders in the sample table are unnamed; their type,
  code size and share identify them (cells' shading, the composite and `lifeMain` are the three largest).
- **Variant builds.** Copy `src/` edits into `runs/perf/pages/NAME.html` builds (string replacements, rebuild, put
  `dist/` back) and give a plan's world `page: NAME`. Keep `dist/` the last commit's: the page people open is `dist/`.
- **Hold the GPU's clock.** At 60 fps the GPU idles between frames and its clock varies run to run (one build's
  composite read 3.8 and 4.9 ms): compare builds at `speed: "max"`. The first scenario of a bench run reads slow (a
  warm-up): put a throwaway one first.
- **Per-dispatch timestamps lie while frames run** (a tiled GPU overlaps passes: `scatterMain` read 1.4 ms live, 0.26
  in a step scenario). Use step scenarios for the step, Instruments for drawing.
- **Exactness.** A change meant to keep the image is checked on one page against itself: freeze the frame
  (`eng.frame` wrapped with a fixed `time`, the world paused, `T.setScale(1)`), screenshot, flip the change in place
  (an engine flag, or `eng.hotComposite(code)` for the composite), screenshot again, and compare with a control (a
  deliberate small change) to show the test can see a difference. Builds compared across runs differ by the world's
  own motion. `lifeMain` changes: an ensemble against the last (`ensemble.mjs --runs 16 --minutes 10 --n 32768`, then
  `--from DIR --baseline OTHER/report.json`); ecology changes: the gate.
- **Counters** read per pass (average of `gpu-counter-value` samples within each encoder's interval): the step ran at
  9.5% compute occupancy (ALU 37%, buffer reads 7%); the composite at ALU limiter 82%; the cells' fragments at ALU 43%,
  occupancy 15%; the cells' vertex stage at 4% occupancy.

### Avenues, most promising first

0. **The main thread and the window's pixels (2026-11-12, A 32k world on an M1).** First the cheap ones: the notes'
   species from their cache and the specimen's glyph off the GPU (candidates 1-2 there), then the Mac session there,
   which settles the display's size, the overlay's Skia pass and WindowServer's share before any shader work.
1. **`lifeMain`'s registers** (1.9-2.7 ms; 3-4 ms in a 6-tick coarse step). It is latency-bound at 9.5% occupancy:
   too many values live per thread to keep enough threads in flight. The neighbor scan is three quarters of it, and its
   loop carries some forty sums plus the cell's invariants. Exact restructurings that did not help: pointer reads of
   neighbors, a separate scan kernel, gather-then-weigh, prefetching, a workgroup per grid cell (see Apple GPUs). What
   is left needs a look at the compiled shader: an Xcode GPU capture of Chrome (`MTL_CAPTURE_ENABLED=1` in Chrome's
   environment, then Debug → Capture GPU Workload on the GPU process) shows each pipeline's register count and
   occupancy limit and per-line costs; untried. Then: fewer loop-carried values (pack the flags and counts kept as
   f32s into fewer registers where exact; carry indices instead of vectors, e.g. `dn1`/`dn2` recomputed from `n1`/`n2`
   after the scan; drop sums only DIAG reads from the non-DIAG build if any survive), or splitting the scan's sums
   between two passes that each walk the neighbors (only if each runs much faster than the whole: probe first with a
   kernel that keeps half the sums). Any of these touches `lifeMain`: ensemble before and after, the gate if
   arithmetic changes, and 6-tick runs (CLAUDE.md).
2. **Cells' shading close up** (3.1 ms at 71 px a unit). Most of it is the cell's own outline (`cellOutline`, six
   sines, `atan2`, `bodySD`'s twelve plans) at every pixel of its quad; quads reach 1.35+ radii for hairs, tails and
   necks. Drawing tighter quads for cells that show none of those (fine LOD 0, no buds) would cut pixels: an earlier
   probe that skipped pixels past 1.2 radii saved 0.45 ms of 4.9. It needs a sure bound on each body plan's reach
   (`bodySD` with `bodyAspect`, pace, bend, squash, swell) before it is exact. The contact planes' seams cost ~0.44 ms
   (their wandering seam's `cellGrain` noise). `vsPoint` still works out each large sprite at all four corners (1.1 ms
   at that zoom; the partner/contact gathering about half of it): a per-sprite record pass would save ~0.35 ms but
   needs a record buffer per large sprite (judged not worth it).
3. **The composite** (3.0 ms close up; ALU-bound). Stage costs at 71 px a unit (early returns, GPU busy): the water's
   surface, heat and pass base 1.0; scene reads and lens 0.4; `lookScene` 0.5 (four more scene taps, relief, rims,
   fringes, rainbow); shadows, tone and grade 0.5 (with the look's film above 0, `lookTone` runs both `tonemap` and
   `agx`); murk, pool and extremes 0.3; display grade, sensor noise and dither 0.3. Untried: splitting the composite
   into two passes (an earlier split measured nothing, before the lean build); `lookScene`'s taps shared with the
   lens's; `ripples` only when a drop is live (0.2 ms in rain).
4. **The catch-up at 1×.** When the GPU is the limit, keeping simulated time real costs the frames it is short of:
   an over-budget frame steps twice next. Letting the simulation run slightly slow when the GPU is busy (as Max and
   the adaptive frame rate already do) instead of catching up would hold the frame rate; a design choice, not an
   optimization. (Since then `stepCap` allows a second step only where the GPU's measured frame leaves room for it; it
   does not count WindowServer's ~2 ms, candidate 6 of 2026-11-12.)
5. **macOS's compositing** (~2 ms of GPU a frame for a windowed Retina Chrome). Untested: true fullscreen, where
   macOS can skip composing the window.
6. **`contactGather`** (0.66 ms close up, 1.1 at 40 px a unit): its workgroup arrays (NEAR_N 1024, ~16 KB) limit
   how many run at once; a quarter of them read 0.55 ms but changes contacts in crowded cells. Skipping cells too
   small for contacts (vsPoint gathers none under 6 px) is untried.
7. **The stone cache's relighting** (1.2 ms in its first frame every half second): `fsStone`'s grain shading, most
   of it in the top bands. Smaller than it was; shading grains cheaper or relighting only the part of the cache whose
   grains changed would remove the rest.
8. **Auto on other GPUs.** `calibrate` adds the living cells' projected cost (`livingMs`, `MATURE_LIVING` 0.5),
   from two measures' difference where it measures twice (see Sizing: checked on the RTX 4070 Ti, 2026-11-04). A
   mid-range GPU that measures once with its founders leaving it idle would still be undersized: check one.
9. **The page's overlay canvas.** With the live annotations drawing, Chrome ran a ~4 ms compute pass alongside the
   scene each frame on the M1 (Skia drawing the 2D overlay); it overlapped there without costing frames, but may not
   elsewhere. On the main thread the notes cost 200-290 ms/s (2026-11-12); the GPU side is the Mac session's `auto`
   against `auto-quiet`.

## Starting up (compiling the shaders)

"Starting the GPU" is the shaders' compile: 49 pipelines, from which `lifeMain` and `mindMain` (each
also built for coarse steps) and the scene's point and composite shaders take most of the time. The
browser keeps compiled shaders on disk, so a reload of the same build starts in about 0.4 s; any change
to the shader text (a new build, a `#k=` override) compiles afresh. Measured 2026-10-23 on an RTX 4070
Ti (Chrome, D3D12): created one by one, the pipelines compiled in turn,
27 s from an empty cache (about 20 s with the driver's own cache warm). Created async (`createEngine`
waits on `create*PipelineAsync`) they compile in parallel: 10 s. The three a new world can do without
(`LATE` in engine.js: coarse steps and the watched cell's replay) compile on after it starts: 5.8 s,
those three ready about 2.5 s later, while coarse steps asked for meanwhile run as fine ones and the
mind view waits. The compile fills the first half of the loading bar, weighted by each pipeline's
rough cost (`COMPILE_COST`). Headless runs wait for every pipeline.

**Two waves (2026-11-04).** By then 80 pipelines, started together: cold, a Pixel 11 Pro's page waited 21 s, the
last on the loupe's (20.6 s), which a phone never uses, and a Pixel 3's GPU process grew from 63 to 488 MB compiling
them (its phone killing other apps for the memory; Tidemote's own buffers and textures about 50 MB). The page now
compiles what a first frame needs first, and the rest in a second wave once that is ready, two at a time while the
world runs (`Engine._later`, `_compileLate`): `LATE` first, then the loupe, the close-up and the card studio, the
pipette's bore, cells' insides (the main view draws them with the lean point pipeline until theirs lands), bridges,
the specks and the full composite (the lean one compiles in the first wave and draws alone until the full one lands:
no ice, bubbles or maps for those seconds). Each lands in place with its bind groups (`_rebindLate`), and what uses
one waits for it: portraits wait for the close-up (`closeupReady`), the loupe and the close-up draw once theirs are
there. Cold, the Pixel 11 Pro's page runs at 7.6 s; a Pixel 3's at 16-26 s (from 34-40, its cache warm). It was measured
with `runs/phone/compile-times.mjs`, a one-off kept outside the repo (each pipeline's start and finish, from inside
the page: an init script wraps `create*PipelineAsync`).

## Firefox

Measured 2026-10-28 on the RTX 4070 Ti, Firefox 159 stable against Chrome 156, 2M particles. Firefox
launched plainly (`runs/perf/ff/plain.mjs`, a one-off kept outside the repo: no automation attached, the page posting its own numbers;
under Puppeteer Firefox's frames came unevenly from the start) and a portable Firefox from
`@puppeteer/browsers`. What each browser does differently, and what the page does about it:

- GPU work costs the same: a step 1.8–2.1 ms in both (timestamp queries).
- Starting: about 30 s on every load. Firefox compiles pipelines one at a time on its single WebGPU
  thread (`create*PipelineAsync` included; bug 1968568) and keeps none between loads (wgpu has no D3D12
  pipeline cache). The same DXC work Chrome does in parallel and caches. One at a time (seconds):
  lifeMainCoarse 4.8, fsLoupe 4.5, lifeMain 3.1, fsComposite 2.6 twice (with and without the micro
  specks), mindMainCoarse 2.5, fsPoint 1.7, mindMain 1.7, contactGather 1.6; 29.6 in all.
- Work done is noticed only when the page submits again or on a 100 ms timer (bug 1870699): with two
  frames in flight, frames done in 4 ms were seen done after 19 (p90 32; at Max p90 87, p99 113), which
  held real time at 51 fps and Max at 30 fps and 7–10×. `nudge` in main.js submits nothing every few
  ms while frames are in flight (Firefox only): 7 ms, 61 fps, and Max as fast as Chrome's.
- Firefox's vsync thread (parent process, `WaitForVBlank` on the primary display, then a software
  step) fell from every 16 ms to every 31 ms after 2–50 s, for minutes, on an empty WebGPU page too
  (there it recovered after about 10 s). The profiler showed it (`MOZ_PROFILER_STARTUP` with
  `nostacksampling`; with stack sampling it never happened). `gfx.vsync.force-disable-waitforvblank`
  made it 4 fps. The displays were probably asleep: check this on a machine in use. The page now copes:
  a fast-speed frame that comes over 1.5 intervals late, the GPU not the cause, is given the time that
  passed (`perf.budget`), so Max reached 12.35× at 34 fps (Chrome 12.95×); and while the browser hands
  out frames at most every second vblank and the page's work fills under 30% of that ("browser pace"),
  only the frame rate is lowered, not the resolution (it fell to 50% before).
- It sometimes runs two callbacks 0.02 ms apart; taken for the display's interval they had the frame
  rate cut to 10 fps, so intervals under 2 ms are ignored.

## A Pixel 3 (Adreno 630, 2026-11-05)

The weakest GPU at hand (Android 12, Chrome, 393×786 CSS pixels at 2.75). Chrome reports `qualcomm` / `adreno-6xx`.

- **Its clears skipped ranges, and every world collapsed.** It leaves untouched any `clearBuffer` whose offset is a
  non-zero multiple of 64 KiB and whose size is under 64 KiB (`runs/phone/cleartest.mjs`, a one-off kept outside the repo: offsets of 64 KiB, 1, 2, 3
  and 6 MiB not cleared; 4 bytes off either side, or 64 KiB of size and more, cleared; an RTX clears every one). The
  living half of the per-cell counts sits at 2 MiB: never cleared, each step's counts grew, the scan left gaps in the
  sorted particles that kept the last step's, and within 60 ticks 8188 of 8192 particles were copies of a few hundred,
  piled in the bottom row. Every Pixel 3 world had collapsed so, in builds back to October, and every slow pass
  measured on it before (cells 59-282 ms up close, `contactGather` 38, steps of 50 ms) was that pile. `Engine._clear`
  copies such ranges from a buffer of zeros instead, and every offset clear goes through it: a fresh world now grows
  as on a desktop (57 s: 1856 living, 167 species, at most 110 particles in a grid cell). Rewrites aimed at the pile's
  slowness (`contactGather`'s contacts and `vsPoint`'s outputs in registers, the genome read by fixed indices, a
  composite compiled without the plain finish's parts) were measured on no healthy world and left out.
- **It crashes rather than stalls.** Frames of 80 ms or more held for seconds end in a KGSL "Protocol error" and a lost
  device; Chrome then withholds WebGPU ("no adapter") until it is restarted (`am force-stop com.android.chrome`). So
  late pipelines compile after the first frames, the emergency step-down (`overload`) acts within three frames, and
  Max takes the coarsest step that fits 40 ms of GPU (`MAX_STEP_MS`).
- **The tuner on a healthy 8k world** (from a cold start, `runs/phone/tuner-fixed.out.json`). Seen whole (683 living,
  a young world): 58.6 fps at 60-70% scale, GPU 14 ms a frame (composite 7.7, step 4.1). Up close at 80 pixels a unit
  as it blooms (2553 living): 34 fps falling to 14 over 40 s, GPU 16 → 53 ms. At 150 (3880 living): 9 fps, GPU 99
  ms, a 4-tick step 52.6 and cells 34.6. The tuner took the finish to plain, the sea and bloom off, the neighbors to
  64, the scale to its floor, then the frame rate down, as designed; no device lost. What limits it now is the step,
  which grows with life (4 ms a tick at 700 living, about 22 at 3900, 64 neighbors), and heat: the phone went from
  thermal state 0 to 3 within two minutes of load, and everything slows hot. More frames there would take a simpler
  simulation, not cheaper dressing.
- **The emergency's last rung.** With every Auto knob at its floor, a further emergency takes the render scale a step
  below its floor, to a quarter at most: a soft view rather than a lost device. Cells drawn as their distant sprites
  past that were tried and dropped: a sprite keeps its world size, so up close it fills as much as the cell.
- **The frame target flipped on a 150 Hz display.** The aim (60) is rounded to whole display frames, and a display near
  150 Hz sits on the edge between every second frame and every third (2.5): the interval measured there, 6.6 to 7 ms
  with the load, flipped the target between 75 fps and 50, and the adaptation, judging frames against a target that
  had just halved, found them late and halved the frame rate itself (an RTX 4070 Ti on Auto, 2.2M particles, 36 fps
  up close with its GPU busy 3-4 ms a frame; main 18-34 fps at 0.7 scale). The rounding now leans 0.15 of a frame
  toward the faster rate where that stays within 1.3 times the aim: 72-73 fps at every zoom; 60, 90 (45 fps), 120,
  144, 165, 175 and 240 Hz keep their rates.
- **The full composite only where ice or bubbles are in view.** Any hot or frozen cell anywhere had drawn it in every
  pixel: a warm world with a few hot cells off screen paid 29 ms at half scale against the lean one's 6.
  `heatMain` marks the tiles (32 × 32) that hold them and `compPick` asks only of those the view covers.
- **The composite** (lean, half scale, seen whole) about 8.5 ms against a Pixel 11's 1.2. Cut at stages: the water's
  surface and the scene's reads take most of it, the look and grade little more. The heat map's shimmer noise is about
  1 ms of it (0.17 of a Pixel 11's); leaving it out where the water's slope moves it under a twentieth of a pixel saved
  nothing in a grown world, whose slope is that steep nearly everywhere. Contact gathering's workgroup: 256 is best on
  both phones.

## What keeps the frame rate (main.js `adaptQuality`)

- **Frame pacing.** The frame rate aimed for (60 by default) is a whole number of display frames,
  so frames stay evenly spaced: 72 fps on a 144 Hz display, 75 on 150 Hz, 58 on 175 Hz (rounded with a lean toward
  the faster rate, so a display near an edge doesn't flip between two: `displayFrames`). Display rate means one
  simulation step per refresh, 2.4 times the work of 60 at 143 Hz.
- **Adaptive quality,** every two seconds at real time or slower, judged by the frames (`judge` in `src/tuner.js`):
  behind when the mean interval between submitted frames runs an eighth over the frame aimed for, or 3% over while
  more than 3% of the frames waited on the GPU (two frames still in flight when one was due), two windows in a row. A
  hitch counts as one frame of at most 50 ms, so a few hitches, or one bad window (a tab come back, a panel opened),
  ease nothing. Not by the GPU's measured time: until 2026-11-12 a GPU busy for more than 92% of the frame counted as
  behind with its frames on time, and a GPU that slows its clock to its work (Apple's at 60 fps; docs above: "the GPU
  idles between frames and its clock drops") measures busy for most of the frame whatever it has to spare. An M1 in a
  32k world eased its render scale, microscope, glow and insides at a steady 60 fps, and never won them back, since a
  step up had to fit in 85% of the frame (`ROOM`) beside that same inflated time. Compute Pressure at `serious` now
  only keeps anything from coming back. With three windows on time a step up is taken where the GPU's time says it
  fits; where it does not, and no frame has been late for the hold (30 s, twice as long after each climb that failed,
  up to 4 min), the best step up is tried anyway (`probe`), and one that frames slip after (over 3% late in the next
  windows) is taken back at once and held. The emergency step-down (`overload`: three drawn frames over max(50 ms,
  three intervals)) acts only while frames come at under half the rate aimed for. The last 40 moves are in Copy
  profile (`adapt`) and a bench report (`adaptLog`): [s, the window's mean frame and the GPU's time as shares of the
  frame aimed for, what moved, to what, how]. Behind: with Auto pixel density, a film's scene drawn at more than
  one device pixel per CSS pixel drops to 1× first; then the render scale steps down a fixed ladder (1, 0.85, 0.7,
  0.6, 0.5 …) to its floor, then the frame rate drops (half, a third, a quarter: 30, 20, 15 fps), or
  the frame rate first when the simulation is more than twice the drawing. With room again for
  three windows: the frame rate back first, then the scale. Auto pixel density stays at 1× (until
  2026-11 it rose to 1.5× with room to spare: at 1.5× an M1 MacBook spent 18 ms a frame drawing, 2.25 times
  the pixels for little visible gain), except while a film rolls, whose frames are the screen's size; a level that just proved too slow is
  not retried for 30 s. Settings → Perf shows the rate aimed for and why, and each Auto choice
  (render scale, pixel density, particles) shows what it is using now, with the matching fixed choice
  underlined. The Display rows the tuner eases (Microscope, Glow, Water surface, Heat haze, Suspension, Cell insides)
  offer Auto the same way, their default: Auto draws the effect at Normal (or on) and lets Adaptation ease it, the
  value it holds now underlined (Off while eased); any other value is the viewer's and is never eased. With
  Adaptation off, Auto holds every one at its best. Prefs saved before then read a value other than Auto's as chosen
  (an effect turned off stays off), the rest as Auto. A fixed pixel density never changes; prefs saved before v3 holding the old default 1.5
  open as Auto.
- **Coarse steps at low frame rates.** At real time a step covers up to a frame's worth of whole
  ticks, so below about 45 fps the world takes coarse steps (docs/fast-forward.md). A 2-tick step
  costs about 1.45 times a 1/60 s one (one neighbor scan, more motion substeps), so 30 fps still cuts
  the simulation's cost by a quarter and the drawing's by half, and a slow device keeps real time:
  the mature 4M world ran at 0.67× and now runs at 1× at 32 to 36 fps. Since 2026-11-12 only a frame without room
  for its ticks as 1/60 s steps takes them coarse (`fineTicks`: the drawing and the 1/60 s steps under three
  quarters of the frame, by the timestamps), as a coarse step's crowds rattle about twice as much
  (docs/fast-forward.md, How the page runs a speed); a frame rate cut to save the drawing keeps 1/60 s steps. In a
  small world the 1.45 is nearer 1.1 (32k on the RTX 4070 Ti: 0.41 ms a 2-tick step, 0.38 a 1/60 s one).
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
  GPU (9 by submit-to-done time without timestamps), down to 8k particles (`MIN_PARTICLES`). A phone or tablet aims at 55% of that: it is
  measured cool, and its GPU slows by a third or more once it runs hot, besides sharing the GPU with
  the compositor (a Pixel 11 Pro, 2026-10-11, held at 30 fps and was still late in a 32k world at 1.5×
  density: step 11.4 ms, scene and composite about 7 ms). 16k against 32k (32 seeds × 30 min each,
  2026-10-23, `runs/lowend/`): no other gated metric differs (persistence, food webs, guilds,
  monocultures); effective species fall from 111 to 81, as a world half the size holds fewer niches,
  and the living swing a little more (CV 0.24 → 0.31). Sampling 144 neighbors instead of 192 in such
  a world was tried and left out: on an RTX 4070 Ti it saves about 4% of a 16k step (`lifeMain` −10%),
  and its 32 seeds leaned worse (3 collapses against none, effective species 81 → 68, Hill-2 31 → 25;
  none significant alone). 8k against 16k (2026-11-05, same runs, `runs/lowend/main-n8k`): no gated metric differs;
  effective species lean lower (68 → 52, p 0.04 alone, not after Holm). 4k against 8k fails the gate: 9 of 32 worlds
  collapse, food webs 97% → 72%, guilds 3.4 → 2.9, effective species halved; so 8k is the floor. 88 neighbors (and the
  contact cap scaled with them, 100.57) against 112 in an 8k world: no metric differs (3 collapses against 2), so the
  tuner may give them up where they pay (a Pixel 11's step 2% less). 64 (cap 73.14) against
  112 in 8k worlds: no metric differs, nor under 6-tick steps (64 against 112, both at `--step 6`); 88 against 112 in
  16k worlds: none either. 48 leans worse (food webs 97% → 84%, guilds 3.4 → 3.1, p 0.09-0.1): 64 is the floor. Seen
  on the way: 8k worlds under 6-tick steps lean worse than at 1 tick whatever the neighbors (6 of 32 collapse against
  2, guilds 3.4 → 3.0, p 0.01 alone, 0.07 after Holm), which Max on a small device takes (its steps capped to 40 ms of
  GPU, MAX_STEP_MS, often fewer ticks on a phone).

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
  unaffected (it samples `maxScan` neighbors), though the heaps make `matterMain` and `resolveCount`
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
  `.tidemote` save (Settings → Worlds) instead; `zoom: 'saved'` keeps its camera, `at` centers the
  view on a fixed spot, `mouse: 'sweep'` moves the pointer (the loupe) while measuring, and `adapt: 'keep'`
  leaves the adaptive quality to run as it would. Every report has the adaptation second by second
  and the passes of each frame over 40 ms (`spikes`), the submit and rAF intervals' percentiles and the longest gaps
  (`worstGaps`, with when they ended). `auto: true` runs the auto camera; `trace: SECONDS` takes a Chrome trace and a JS
  profile from the measurement's start (`OUT-WORLD-SCENARIO.trace.json`, `.cpuprofile`), which `trace.mjs` sums: the
  main thread per frame and per 16.7 ms, task kinds, GC, the longest tasks and what ran in them, the GPU process,
  Chrome's frames presented and dropped, JS self time (the trace's start costs the page one 100-200 ms task). `--dpr N`
  on a shown Chrome forces that many device pixels a CSS pixel (window sizes are then CSS pixels). `m32k.json` and
  `m32k-mac.json` are the 32k plans of 2026-11-12.
- `bench.mjs --android` runs the same plans in Chrome on a phone adb is connected to (`tools/android.mjs`): over a USB
  cable under WSL through Windows' adb (run it with `tools/gpu-node.sh`; Windows' `platform-tools` in
  `%LOCALAPPDATA%\Android\Sdk`), or over Wi-Fi (Developer options → Wireless debugging, `adb pair`, `adb connect`; pair
  over the LAN, not Tailscale). It drives a tab of its own over the DevTools protocol (Playwright's connectOverCDP stalls
  on tabs Android has frozen), marks it automated as Playwright's are (the opening menu goes by itself), serves the page
  to the phone as localhost (`adb reverse`), and records the phone's thermal state and battery beside each scenario.
  Keep the phone on a charger with the screen awake (`adb shell svc power stayon usb`; `false` after), and record
  `adb logcat` beside long runs. A scenario's `effects` fixes the tuner's dressing ('low', 'high') or leaves it Auto.
- `stepbench.mjs` times a saved world's step under Dawn. Dawn's npm build compiles with FXC, not
  DXC as Chrome does, so its kernel timings differ from the browser's.
- `shots.mjs` screenshots a saved world at several zooms (for pixel comparisons of render variants);
  `flash.mjs` measures every composited frame's brightness around render-scale changes.
- In the page, Settings → Perf → **Copy profile** (where the GPU gives timestamps) times three
  seconds of frames pass by pass and a step dispatch by dispatch on that device, and copies it as
  JSON: the way to see how a phone spends its time. Its `world` records what picks a step's work (the
  water's level and the era's, frost, an event and its phase, coarse ticks), so a slow profile says
  whether the shore's work was on.
