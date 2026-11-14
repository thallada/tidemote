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
  compared lean against full, with and without ice), 16.8 → 14.0 ms a frame. (Since 2026-11-13 it also draws the lean
  one with the ice or the bubbles back where only that one is in view: The composite as a phone draws it.)
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
  2.72 ms, coarse 4.23 → 3.99). Then only on Apple's GPUs (`genomePtr`, simWGSL; everywhere since the step's two kernels, 2026-11-13, below): on an RTX 4070 Ti in Chrome on D3D12
  the pointer made `lifeMain` 15-20% slower (step scenarios, a 1M world: 1.94 → 2.33 ms; 4M: 6.10 → 6.58; 6-tick
  coarse steps the same), so other GPUs kept the copy. The neighbor scan is three quarters of the kernel (2.4 of 3 ms
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
  the live close-up, which draw the world as the main view does, a new species' sparkle still drawn full (the cost
  learned from the main view's pass alone);
  the neighbors 112, 88 or 64 (no ecological difference at 64 in 8k worlds, at 88 in 16k ones, `runs/lowend`). The
  haze's and the microscope's, the insides' and the neighbors' costs sit inside passes shared with others (the
  composite, the cells' pass, the step), so each is learned from that pass at each of its levels. `test/tuner.test.js` runs the tuner window after window
  against a Pixel 3, a Pixel 11 Pro and an RTX 4070 Ti modeled from these measurements: each settles within its frame
  (the Pixel 3 at 30 fps, half scale, without the haze or the microscope, 88 neighbors, the sea at half rate; the
  Pixel 11 at 85% scale, the sea at a quarter; the RTX at its best).
  Behind, work done less often first (since 2026-11-13: the sea at half or a quarter rate, the contacts searched a
  quarter of the grid cells a frame, the stone relit less often; Doing less work, below), then the step that saves
  the most GPU time for the least lost to the eye; with room (the frame under 85% busy), the
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

The loupe and the live close-up follow Glow, Suspension and the tuner as the main view does (docs/look.md, The look),
each with its own bloom chain (`_bloomChain`: six levels down and five up at its size, eleven small passes) and its own
light. Measured on a 131k world at 2544×1289 (loupe swept at 90 px a unit, ×6; a cell selected at 150, close-up
323×134), two runs each: the loupe's or the close-up's bloom +0.017 ms a frame (`fsDown`/`fsUp` 0.064 → 0.081), the
close-up's lit `fsPlain` +0.003, the loupe's light, shadows and share no change within the noise (`fsLoupe` 0.47-0.49
either way); with insides left out, drawing their cells twice (the full pipeline for a new species' sparkle alone)
+0.001 on their cells' pass. In all about +0.02 ms a frame on the RTX per view open, about +0.15 ms on an M1.

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

## Zoomed in on the M1: the cells' shading (2026-11-13)

On the M1 (MacBook Pro 13", 1440×757 canvas, `w32k`) a frame at 60 fps fell to 41-45 fps as soon as the view zoomed past
fit, and stayed there at every zoom: the resolved cells (`fsPointLive` → `pointColor`/`cellColor`) took about 15 ms of a
21.6 ms GPU frame at 40, 80 and 150 pixels a unit alike (the world paused, uncapped: Chrome with
`--disable-gpu-vsync --disable-frame-rate-limit`, so the submit rate is the GPU's throughput). Fewer cells drawn larger
cover the same pixels: the cost is the screen's pixels times the shader, from the zoom where cells pass 2.8 px (at fit
they are sprites, which is also why the auto particle count, measured at fit, never sees it).

How it was found (the bench's per-pass times overlap on a tiled GPU, `fsDown 27 ms` and the like mean nothing there):
- Metal System Trace with Dawn's labels (`--enable-dawn-features=use_user_defined_labels_in_backend`, every pass
  labelled) put 9.4 ms of fragment work a frame in the scene pass at 80 px a unit.
- Whole-frame A/B on builds with one thing removed: vertex, raster and blending are about 1 ms (the cells drawn with a
  constant color); half the pixels cost 5× less (fragment-bound); an ideal ellipse around each cell saves only 3 ms and
  clips horns (not the quads' overdraw); neither the genome and particle loads, dynamic indexing of the flat varyings,
  loop unrolling, nor a cheaper hash or fewer transcendentals moved it.
- `xctrace --instrument 'Metal GPU Counters'` over the scene pass: **fragment occupancy 12.6%**, ALU 45% busy, F32 15%,
  nothing else limiting. Register-bound: every part removed freed registers for every pixel (partners 4.3 ms, contact
  planes 3.6, the plan's outline 3.0, insides 2.7, tissue fill 1.7), and the partners' code most (occupancy 17.4%),
  though it runs only for pixels near a neck and tissue (fill over a half) never runs it at all.

The fix: the necks' code only where a neck can show (`NECKS` in DRAW_WGSL; listMain's three lists, `pointAt`):
- **plain** (`INTERIOR` and `NECKS` false): resolved cells under 12 px, not budding or sparkling. A bond's neck changes
  the outline by at most a quarter of its blend (0.03 of the radius: a third of a pixel); the seam's wander now fades in
  from 12 to 24 px instead of starting at once. A bud's neck is drawn whole from the newborn's side (the full list).
- **bare** (`NECKS` false): tissue's cells with insides (12 px and up), whose fill already breaks the partner loop:
  the same pixels.
- **full** as before for the rest; with insides left out the lean pipeline draws the full list and listMain gives the
  plain one what bare would draw. The quad list grows to `QUAD_HEAD + 2n` words.

Paused, uncapped (GPU ms a frame): fit 10.3 → 8.7, 40 px a unit 21.0 → 15.2, 80 21.6 → 16.4, 150 21.1 → 16.9,
300 26.4 → 21.3. Running at 1× and 60 fps: 80 px a unit 23.2 → 19.1 ms (42.5 → 50 fps), 40 23.6 → 18.9, 300 27.7 →
23.5. Screenshots at 40-300 px a unit of `w32k` (tissue) and `slow-mac-world` (bonded pairs) show no difference.

Then the insides, redrawn as a cheap cosmetic layer (asked for: they are light over the cell, nothing the
simulation reads). They cost 3.5 / 3.9 / 6.7 ms at 80 / 150 / 300 px a unit over the same view drawn without any (the
tissue given the plain pipeline); now 1.8 / 2.8 / 3.3, no one part over 0.3 ms. Kept: the wall and the cortex inside
it, the nucleus (pinching in two before division), mottling and a warm stain (sines of the cell's seed in place of
three value-noise fields, twelve PCG hashes a pixel), a calcified cell's plates, the food vacuole after a meal, and
close up four organelles in the species' own scatter (organDirs: chloroplasts as it photosynthesizes, vacuoles as it
eats) in place of twelve; soft polynomial bumps (`insideBump`) for the gaussians. Gone: the fine grain, the plans'
own markings (girdle, whorl, lattice...), the wall's wobble. A cheaper hash alone gained nothing; dropping the
transcendentals' unused branches nothing either.

And `contactGather` (2.4-2.9 ms at 40-80 px a unit, measured by running it twice; its own workgroup size changes
nothing): most of it was gathering and sorting a grid cell's neighbors for the search, the animation records cheap.
Half the grid cells now search each frame, by an alternating checkerboard, the rest reading last frame's contacts
(vsPoint places each where it is now); every one searches the first frame the cells gathered change. 40 px a unit
−1.5 ms, 80 −0.7, 150 −1.1. (Those contacts read back by sorted index were mostly someone else's after each step's
sort; since 2026-11-13 they are kept by id and carried through the sort: below, Doing less work.)

Then the outline and its flattening, keeping every shape:
- **The shape atlas** (`shapeDirty`, `shapeBake`, `shapeAt` in DRAW_WGSL; `Engine._shapes`): each species slot's bodies
  (bodySD of its plan for each of the four roles) baked once into a 64² tile of a distance field (rgba8snorm, one role a
  channel, ±1.25 radii; 2048² for 1024 slots, 16 MB), re-baked when a slot's serial changes (16 a frame, all of them for
  a new world), and read with one filtered sample in place of bodySD's twelve plans, whose branches every cell beside
  a cell of another plan ran too. A lobose cell's creeping pseudopods turn the lookup. The studio's and the bore's
  cells, of genomes of their own, keep bodySD (`SHAPE_ATLAS` false). The render test's light against the distant
  profile holds for every plan at 3-60 px. 40 / 80 / 150 / 300 px a unit: −1.3 / −1.9 / −2.1 / −2.9 ms.
- **The contacts read once**: the fill, the deep-inside test and the planes each unpacked all six; now one loop finds
  the nearest plane (and the fill), and only it creases the outline (where two planes meet, the corner is the nearer's
  alone). −0.8 / −1.2 / −1.5 / −0.7 ms.

Running at 1× and 60 fps after all of it: 59.1-59.7 fps at 40, 80, 150 and 300 px a unit, no frame late (GPU 12.0-14.4
ms; the step back to 2.5 ms, no longer sharing the GPU with a backlog of fragments), against 35.6-43 fps (23-28 ms)
before. Measure on the Mac on a 61 W charger: on an 8 W one the battery ran down under load and at 7% macOS slowed
the GPU about tenfold (a 21 ms frame read 90-100 ms, headless too).

## The step in two kernels: a Pixel 3's registers (2026-11-13)

On a Pixel 3 (Adreno 630) a grown 8k world (`p8`: 6360 of 8192 living) stepped in 46.6 ms, `lifeMain` 44.4 of it:
7 µs a living cell, some 1250 times an RTX 4070 Ti's, where `contactMain` and `matterMain` are about 50 times
slower. How it was found (`bench.mjs --android`, `kind: step`, the sim module patched from an init script):

- **Not the work.** With the neighbor scan's loop never entered the kernel still took 38 ms, and with its body
  skipped 34. Removing code that seldom or never runs changed it most: the light's slope for phototaxis (a few
  cosines) 44 → 28 ms, `joinable` (asked in the scan) 44 → 25, the genome read through a pointer 44 → 35; savings
  did not add up, and a kernel cut short after its scan was no faster than the whole.
- **The register file.** `contactMain` given more accumulators to carry through its loop (the same arithmetic into
  one accumulator as the control) took 0.85 ms with none, 1.4 with 8 vec4, 1.8 with 16, 3.6 with 24, 4.3 with 32 and
  16.4 with 40: a slope as fewer cells fit the GPU at once, then a cliff where its registers (about 190 values)
  run out. `lifeMain` sat past the cliff. A kernel's widest moment sets it, whatever runs: so does code never run.
- **Two kernels** (`cellWGSL`'s parts): `senseMain` keeps a cell's bonds and scans its neighborhood, leaving what
  it finds in `sense[]` (`senseWords`: 34 words a particle, 136 bytes); `lifeMain` does the rest from there. The
  genome is read through a pointer everywhere, the six traits the scan reads for every neighbor held in registers;
  `joinable` is asked at the pair's end, where less is held; the currents and the pond are read only where used;
  a coarse step's four best foods are kept in vectors, not arrays (`pushedU`, `pushedF`: `senseMainCoarse` 10.9 →
  5.9 ms); the two loops over the partners that keep a cell are one. The rolls after the scan are a stream of
  their own (`s0`), the same in `mindMain`, which still runs both parts as one kernel for its one cell.
- **Results** (ms; the Pixel 3 cool, thermal state 0-1):

| | before | after |
|---|---|---|
| Pixel 3, `p8`, a 1/60 s step | 46.6 (`lifeMain` 44.4) | 9.3-9.5 (`senseMain` 4.2, `lifeMain` 3.2) |
| Pixel 3, `p8`, a 2-tick step | - | 13.1 (`senseMainCoarse` 5.9, `lifeMainCoarse` 3.8, `bodyTick` 1.3) |
| RTX 4070 Ti, 32k (25k living) | 0.276 (0.145) | 0.24 (0.081 + 0.030) |
| RTX 4070 Ti, 262k (197k living) | 1.139 (0.695) | 0.953 (0.376 + 0.156) |

  The page on the Pixel 3, adapting (`runs/night/r2`, a one-off): 29-32 fps at 80 and 150 pixels a unit at half
  scale with cells' insides and the suspension kept (the sea too at 150), against 13.6 fps at a quarter scale with
  everything eased before. The step is still most of its frame (12-14 ms of 24), then `contactGather` (3.8 at 80),
  the composite (3.3 at half scale) and the sea (2.2-3.7).
- **The sense kernel sat on a second edge**: the same build ran it in 4.6 or 8.2 ms from one page load to the next
  (the same within a load, however often the world or the pipeline was made again), until the currents and the
  pond (read for a coarse step's grains only) left its head: then 4.2-4.7 every load. With the matter's branch,
  bonds, joining, hunting, budding and warmth all cut it still takes 3.7: it is now at what its visits cost
  (about 15 ns a neighbor read, `contactMain`'s rate).
- **`shapeBake`** ran its 65,536 invocations every frame to find nothing listed (0.6 ms on the Pixel 3): it is
  dispatched indirectly now, by as many slots as `shapeDirty` listed (`shapeArgs`).
- **Ecology.** The 32-seed gate reads "same" on every measure on the commit too (`runs/night/gate-final`).
- **Where the Pixel 3's frame goes after it** (8k, 6360 living, every effect on, half scale: 196 × 351 pixels,
  30 fps aimed for; ms): the step 13.3 (2 ticks), `fsComposite` 4.9-6.2, the cells' pass 3.5-5.7, the sea 3.6,
  `contactGather` 3.5 (2.1 at 150 pixels a unit): 31-35 in all, 22-26 fps. A fresh world (370 living) starts at 22
  fps with everything on at full scale (42 ms) and the tuner settles it at 60 fps, 0.6-0.7 scale, without the haze
  and the microscope: the composite is what it cannot pay for there.
- **Tried after, no gain** (each on the phone, several page loads):
  - `senseMain` skipping grid cells wholly out of the cell's reach (as `contactMain` does): 4.6 ms either way. With
    its loop never entered it still takes 3.9 of 4.3, with the loop's body dead 2.4: what it holds, again, not its
    visits.
  - Helpers given the genome's fields in place of the genome by value (`growAt`, `tailCell`, `cellThermal`,
    `treeCellAt`): 4.7 either way (the driver takes the copies apart itself).
  - The composite (the lean one, as every composite time here: The composite as a phone draws it): no one part is its cost. Without the lens, the look, the shadows, the sensor and the grade 2.8 of
    4.9 ms; without the overlays (pool, extremes, shade, instrument, maps, specks) 6.4 (slower), without those and
    the haze 2.9, without all of them 1.3. Cut after the look (a first pass of two) 4.1, the rest alone 1.4: two
    passes would not pay. The scene's sample at the pixel read once for the lens, the look and the composite (two
    reads fewer) and the lens's fringes left out under a quarter pixel (two more): 5.4 against 4.9, slower: on
    this GPU a value held costs more than a texture read again.
  - `contactGather`: its search about 1.9 of 3.8 ms, its animation records 0.6; no cliff found.
  - `senseMain`'s scan in kernels of its own: a kernel of the living's ranges alone (the matter's branch cut out)
    takes 4.7 ms, the whole kernel's time, and one of the matter's alone 1.6: two would be slower than one.
  - The cells' pass (`fsPointLive`): 4.6 ms at 150 pixels a unit, 1.0 with every cell a flat disc; by the pixels
    (1.6 / 6.1 / 15.1 ms at a quarter, half and 0.85 scale), and the same with insides left out. Cut from
    `cellColor`: the partners' loop 1.8 (0 when only kept from running: its code's presence, as in the kernels), the
    contact planes' loop 1.3 (1.1 kept from running: its work), the seam 1.0 (0.2), the insides and the hairs 0.
    Cells with no partner listed for the pipeline without necks (`listMain` after the gathering, reading
    `bondsIn`): no change on this world. The cell's own outline taken out of the partners' loop: 4.4 → 3.6 at 150
    pixels a unit and 5.1 → 6.4 at 80, where the plain pipeline draws: left as it was.
  - `lifeMain`'s bends (`bendOn`, `tailBases`: 0.9 of its 3.3 ms kept from running): `bendAt` told whether its arm is
    the mother, in place of `treeMom`'s reads again for every bend: 3.28 → 3.1. Left out.
- **A lighter microscope: not worth a tier.** At 80 pixels a unit the composite takes 4.93 ms with everything, 4.13
  with the microscope off (the tuner's knob), 4.29 with the haze off, 3.10 with both. Kept from running one part at a
  time: the lens 5.4 (slower), the look's edges 4.4, the shadows 5.0, the fringes 5.6. What "off" saves is small beside
  what the code's presence costs (1.3 ms with all of it compiled out).
- **The composite's smooth fields from a small pass** (`fsField`, docs/look.md): the water's surface, the haze's
  shift, the scene's light and the water's heat, at half the resolution into three targets the composite reads where
  it uses them. Emulated first (the composite reading a texture in their place: the heat and the haze 4.9 → 3.6 ms,
  with the light 4.05, with the surface 2.7); built, on the Pixel 3 at 80 and 150 pixels a unit: `fsComposite`
  4.85 → 2.4 ms, `fsField` 0.65, every effect kept (SSIM against the composite of before 0.995-1.0; the haze over
  boiling water a little smoother seen whole). On the RTX 0.23-0.26 → 0.16-0.21 + 0.02.
- **Why the cliff** (Mesa's open driver for the same GPU, `src/freedreno/ir3`: `ir3_ra.h`, `ir3.c`,
  `freedreno_devices.py`): an a6xx thread has at most 48 vec4 registers (192 values), past which values spill to
  private memory (`stp`/`ldp`); and an a630 keeps floor(96 / a shader's vec4 registers) × 2 waves of 64 threads
  resident, so about 16 waves at 12 registers or fewer, 10 at 18, 6 at 26-32, 4 at 33-48: the slope before the
  cliff. 16-bit values take half a register from the same file; the Pixel 3 has no `shader-f16`, so WGSL cannot
  ask for them there. Uniforms live in a file of their own.
- **Seeing it without the phone** (`tools/adreno/regs.sh`, its README): Mesa's Vulkan driver for Adreno (turnip)
  on this desktop against a pretended a630 (`drm-shim`), the `webgpu` package's Dawn pointed at it, so the page's
  own WGSL goes through Tint as in Chrome; one line a kernel, in seconds. Another compiler than Qualcomm's: a proxy
  for which side of a line a shader is on and roughly how far. It agrees with the phone where the phone was
  measured (vec4 registers wanted at the widest moment, of 48; waves of threads resident):

  | kernel | widest | waves | on the Pixel 3 (ms) |
  |---|---|---|---|
  | `lifeMain` before the split | 61.5 (366 spills) | 4 | 44 |
  | `contactMain` | 14.4 | 12 | 0.8 |
  | `matterMain` | 23.2 | 8 | 0.8 |
  | `senseMain` | 29.2 | 6 | 4.2 |
  | `lifeMain` | 43.9 (46.6 before the next entry) | 4 | 3.2 |
  | `senseMain`, coarse | 35.8 | 4 | 5.9 |
  | `lifeMain`, coarse | 43.6 (51.8 before) | 4 | 3.6 (3.9 before) |
  | `contactGather` (23.5 since the contacts are kept by id: Doing less work) | 21.1 | 8 | 3.5 |
  | `fsComposite` before the field pass (no spills: 61.0 and 36 spills were its unused safe variant's, The composite as a phone draws it) | 32.2 | 4 | |
  | `fsComposite`, `LEAN`, before the field pass | 16.0 | 12 | 4.9 |
  | `fsPointLive` | 30.8 | 6 | 4.6 at 150 px |
  | `fsPointLive`, no insides or necks | 22.5 | 8 | |

  No one part of `lifeMain` held its widest moment (cut out: the trees' forces and the pond 42.6 each, everything
  else 45-46.6; its motion alone 41.6, its energy and events alone 36). The phone's own SPIR-V comes from Chrome's
  `--enable-dawn-features=dump_shaders` (to the page's console). Qualcomm's compiled shaders themselves:
  freedreno's `libwrap` around a native Vulkan runner, read with `cffdump` (a day or two; not done).
- **Under the cap, fewer registers bought nothing on the phone (2026-11-13).** Seven exact rewrites (the same
  arithmetic, draws and order; branch tag `diet-full`) took Mesa's widest moments to 26.4 (`senseMain`), 30.4
  (`lifeMain`), 31.4 and 31.9 (their coarse forms): every kernel at 6 waves, where three had 4. The Pixel 3, a
  page a commit, two loads each (ms, `senseMain` / `lifeMain` at 1 tick, then coarse at 2):

  | kept through | Mesa's widest (sense, life, coarse sense, coarse life) | 1 tick | 2 ticks |
  |---|---|---|---|
  | before | 29.2, 46.6, 35.8, 51.8 | 4.2 / 3.2 | 5.9 / 3.9 |
  | `mutateInto` field by field from the parent's in storage (it copied the genome, sixty values, into a local in the coarse tick loop); `lifeMain` reads `sense[]` where used (`SENSE`) | 29.2, 43.9, 35.8, 43.6 | 4.2 / 3.2 | 5.9 / 3.6 |
  | the grid's reads (pond, ice, bends) at `lifeMain`'s head, the record through a pointer | , 31.2 | 4.2-4.7 / 3.5 | 5.9 / 3.7 |
  | `beatPull` and the light's slope early | | 4.2 / 3.4 | 5.8 / 3.7 |
  | the scan as two loops (living ranges, then matter's) | coarse sense 31.9 | 4.6 / 3.4 | 7.0-7.5 / 3.7 |
  | the warmth at the head, `budR` | | 4.6 / 3.5 | 6.9 / 3.7 |
  | the coarse energy loop holding less | coarse life 31.9 | 4.6 / 3.5 | 7.1 / 4.1 |
  | range cells by selects, not a signed division | 26.4, 30.4, 31.4, 31.9 | 7.9 / 3.5 | 8.4 / 4.1 |

  Only the first is kept (the coarse `lifeMain` off the cap, 0.3 ms). `lifeMain` from 46.6 to 30.4 registers ran
  no faster, and the scan with fewer registers and more work (eighteen range lookups for nine; selects for a
  division) ran up to twice slower. So: Mesa's count finds the cliff (spills past 48, the single kernel's 30×),
  and the phone follows it there; under the cap Qualcomm's compiler is its own, the waves' slope is not seen in
  these kernels, and what runs is what costs again. Do not chase Mesa's widest moment under 48; measure a
  rewrite on the phone. (On the RTX all seven together were no slower: `senseMain` 0.066 against 0.078 ms at 8k,
  2k living.)
- Tools: `regs.sh` takes fragment shaders (`fsComposite@vsComp`, `fsPointLive@vsPoint/2`; the variant that draws,
  the safe one's at the line's end) and counts spills Mesa prints typed; with `tools/adreno/ir3-peak.patch` applied to Mesa, `IR3_PEAK` prints each block's pressure
  and the values live at the widest moment (tools/adreno/README.md).
- **Next on a phone**: what the step's two kernels run, not what they hold (the scan's pairs: 4.2 ms for 6.4k
  cells); the cells' fragment shader. Heat: a few minutes of benchmarks took the phone to thermal state 2-3
  without a fan, where every pass ran about 1.5 times slower.

## The composite as a phone draws it (2026-11-13)

The composite was thought to be the one shader past a Pixel 3's register cap (`regs.sh`: 59.2 vec4, 25 spills). Two
things were off, and the phone's own numbers say where its composite's time goes.

- **Mesa's line was the wrong variant.** A fragment shader whose constants (uniforms, and the immediates its
  instructions cannot encode) pass 100 vec4 is compiled twice by turnip: as it is, and a "safe" variant held to 100
  constants whose other immediates become `mov`s into registers held from first use to last; the pipeline keeps the
  safe one only when its stages' constants together pass 512 (`ir3_trim_constlen`). The composite's are 340 + 8 (its
  vertex stage), so it draws with the first; `regs.sh` printed the last. Its 59.2 and 25 spills (61.0 and 36 before
  the field pass, `LEAN` 17.5) were the safe variant's. The tool now prints the first and the safe one's at the line's
  end (tools/adreno/README.md). As drawn, with every effect on (vec4 registers wanted at the widest moment, used, waves):

  | | widest | used | waves | instructions |
  |---|---|---|---|---|
  | `fsComposite` (micro / clear, `MICRO_SUSPENSION` 0) | 31.8 / 32.2 | 32 / 48 | 6 / 4 | 30480 |
  | before the field pass (micro / clear) | 32.2 / 32.8 | 48 / 48 | 4 / 4 | 35081 |
  | `LEAN` | 15.0 | 16 | 12 | 1935 |
  | `LEAN` with the ice (`ICE`, below) / with the bubbles (`HOT`) | 30.0 / 24.5 | 32 / 32 | 6 / 6 | 14238 / 4458 |
  | now, with the ice in its own pass (The ice on a phone): `fsComposite` (micro / clear) | 26.0 / 26.5 | 32 / 32 | 6 / 6 | 16034 |
  | now: `LEAN`, `ICE`, `HOT` | 15.0, 15.0, 24.5 | 16, 16, 32 | 12, 12, 6 | 1935, 1946, 3829 |

  No fragment shader the page draws spills as drawn. The loupe's did (`fsLoupe`: 67.5, 150 spills, constants 448 + 12,
  so this is what draws; desktops only, a phone never opens it) until its ice was worked out before `poolOver` rather
  than inside it: 30.8, none. The rest (`regs.sh POST_WGSL ...`, `DRAW_WGSL ...`):
  `fsField` 20.1, `fsPlain` 20.0, `fsStoneCache` 15.2, `fsMurk` 9.0, `fsStoneLit` 4.2, `fsDown`/`fsUp` 5.0/8.0,
  `fsReproj` 1.0; `fsPointLive` 30.8 (22.5-28.8 without insides or necks), `fsTubeLive` 27.8, `fsStone` 15.6,
  `fsSpeck` 9.8, `fsSplat`, `fsPointSmall`, `fsLine`, `fsBridge`, `fsGlass` under 5.
- **The phone had been timing the lean composite.** The page compiles the full composite in its second wave; on the
  Pixel 3 it lands about 45 s after the page starts (`full=true` in an engine log, every load), past every render
  scenario's window (a world loads at about 25 s, two scenarios run to about 40). Until it lands the lean one draws
  alone, and after it, compPick picks the lean one wherever none of the rare things is in view. So the composite's
  numbers above (4.9 → 2.4 for the field pass, the knock-outs, the lighter microscope) were the lean composite's, which
  is what a phone draws nearly always. Measured after it lands (a first scenario settling 45 s), `p8`, every effect on,
  half scale, 80 and 150 pixels a unit, thermal state 0, ms (`runs/night/d1`, `g1`, `o1`, two loads each):

  | the composite drawn | ms |
  |---|---|
  | as main draws it, nothing rare in view (compPick: the lean one) | 2.55-2.6 |
  | the lean one alone (no compPick) | 2.0-2.1 |
  | the full one, forced | 7.0-7.5 |
  | the full one without the ice's code / the pool's edge / duckweed / maps / the instrument / the bubbles | 5.7-5.95 / 5.9-6.1 / 5.75-6.0 / 5.25-5.55 / 4.9-5.4 / 4.8-5.4 |
  | the full one with only the ice's code / only the bubbles' / none of them | 3.9-4.2 / 3.25-3.4 / 1.9-2.1 |

  Every part never run costs 1.3-2.2 ms, and the parts' costs add to twice the whole: a cliff, as the step's single
  kernel had, in Qualcomm's compiler (Mesa's first variant shows none; its safe variant, holding the immediates in
  registers, behaves more like the phone: without the ice 44.0 and no spills). The 0.5 ms the composite pass shows
  over the lean one alone is compPick's dispatch counted into it: the frames' GPU time outside the step is the same
  (8.2-10.3 ms either way).
- **Kept: the lean composite with the ice or the bubbles back** (`ICE`, `HOT` in POST_WGSL). compPick told the full
  composite from the lean one by the tiles of ice and of warm water in view (`heatTiles`); it now tells which of the two
  is there and picks the lean one with that one back, the full one only for both, or where the engine's uniforms show
  anything else rare (the pool's edge, duckweed, the instrument, a map). The same arithmetic as the full one wherever
  it draws (whatever it leaves out is not in view; a frozen frame drawn either way looks the same). They compile in
  the page's second wave after the full one, which draws in their place until they land; headless runs compile them
  after the lean one. On the Pixel 3 with a frost in view (`frostMax` 0.85, `runs/night/h1`, two loads each): the
  composite 51-54 ms → 45.6-52.7. With nothing rare in view, 2.55-2.6 both (the two more pipelines bound with no draw
  cost nothing).
- **The ice is the composite's cost during a frost**: 46-53 ms of it with the ice drawn, 4.5-4.9 with the dendrites'
  and the frazil's look left out (`iceLook`, `frazil`; the front itself, `iceSeen`, still worked out; `runs/night/h2`),
  and `fsField` 1.4-2.5 against 0.65 (its own `iceSeen`, for `waterRoom`). The Pixel 3 drew a frost at 14-15 fps:
  The ice on a phone, below.

## The ice on a phone (2026-11-13)

Not a cliff: arithmetic, and most of it integer division. A Pixel 3's ice was its instructions' cost; what made them
many was `%`.

- **Knock-outs** (each a page, `p8` with `frostMax` 0.85 grown at Max through a 70 s settle that also lands the second
  wave, then the ice in view at 80 and 150 pixels a unit, half scale; `runs/night/ice-k1`, `ice-k2`, one load each
  interleaved with main's; the composite's ms):

  | the lean composite with the ice (`ICE`) | ms (80 / 150) |
  |---|---|
  | as main draws it | 45.2-46.5 / 50.5-52.1 |
  | the 3 × 3 grains' loop down to the grain a point lies in | 37.9 / 37.1 |
  | no grain mosaic (`vborderT`) | 33.5 / 31.6 |
  | no trapped bubbles | 30.9 / 32.9 |
  | the grains' axes without the ice field (`gridPost` in `iceGrain`) | 40.5 / 39.6 |
  | no frazil (none grows during the hold measured) | 46.5 / 49.3 |
  | the ice alone in the composite (nothing else drawn) | 35.5 / 41.3 |
  | its loops kept loops (a trip count the compiler cannot know) | 45.0 / 49.7 |

  Every part costs about what its share of the instructions says; nothing is a cliff (not unrolling either: loops
  the compiler could not unroll changed nothing). The ice is simply 12,000 instructions a pixel on Mesa's count
  (`regs.sh`: the `ICE` variant 14,238, lean 1,935) over most of the view. And a third of them were `gridPost`'s and
  `waterCell`'s `((x % n) + n) % n`: an a6xx has no integer divide, so each `%` is a long sequence, four a cell read
  and some 60 reads a pixel (`iceSeen`'s B-spline 20, each of the nine grains' axis 4).
- **Kept: one step's wrap** (`cellIndex`: every caller reads within a period of the world, points wrapped first and
  a few cells about them, so a select either way is the same cell). Exact (frozen frames against main: identical).
  `ICE` 14,238 → 9,402 instructions on Mesa's count for `gridPost`'s alone, `fsField` 9,647 → 5,603. On the Pixel 3
  (`runs/night/ice-k3`, the page with its loops kept loops too, which alone changed nothing; two loads each,
  interleaved with main's): the composite with a frost in view 46.5-51.7 → 24.1-25.0 ms, `fsField` with ice
  1.36-1.46 → 0.34-0.42, and without 0.64-0.68 → 0.49-0.52; the lean composite with nothing rare 2.6-2.8 → 2.5-2.6.
- **Kept: a grain passed over that cannot win** (`iceLook`): a grain's lead is at most `ICE_LEAD + ICE_OWN` less its
  fall with distance; one whose bound does not beat the best so far is not worked out. The same winner, exact.
- **Kept: the ice in a pass of its own, `fsIce`**, drawn before the composite into an `rgba16float` target where a
  composite that adds it draws (compPick's fifth draw: the full one, or `ICE`), which the composite adds (`pool.ice`;
  the loupe still works it out inline). `ICE` is now the lean composite and a texel (1,946 instructions), and the
  pass can be drawn at a lower resolution: `Engine.fx.iceScale`, the tuner's `ice` knob (`src/tuner.js`, 1 or 0.5),
  which takes it to half each way when frames run late with ice in view. At half its lines spread to a pixel of the
  target and dim (`iceRes` in `iceLook`/`frazilStar`), so it is softer, not broken up (drawn as at full, the
  dendrites came apart into dashes). On the Pixel 3 (`runs/night/ice-k6`, two loads each, interleaved with main's):

  | a frost in view, 80 pixels a unit | composite | `fsIce` | `fsField` | GPU a frame | fps (30 aimed) |
  |---|---|---|---|---|---|
  | main | 45.5-45.7 | | 1.40-1.44 | 55.6 | 15.7-16 |
  | `fsIce` at full resolution | 3.2-3.5 | 7.7-8.3 | 0.50-0.57 | 20.2-21.8 | 29.7-30 |
  | `fsIce` at half | 4.0-4.6 | 3.0-4.0 | 0.62-0.69 | 18.7-20.5 | 29.9-30.2 |

  The build as kept, the knob pinned (`runs/night/ice-k7`, one load): at 80 pixels a unit the composite 3.2 and
  `fsIce` 7.3 at full, 3.7 and 2.7 at half; at 150, 3.6 and 7.9, 4.5 and 2.5. Left to adapt (`adapt: 'keep'`,
  `effects: 'auto'`, 30 fps aimed) its frames were on time at full, and the tuner kept it there. (The composite reads
  the half target 0.5-0.9 ms slower than the full one, every load: its texels magnified.)

  (Half is a quarter of the pixels but not a quarter of the time: each pixel's `iceSeen` and the waves' coherence
  stay. The composite with nothing rare in view is 2.5-2.6, so with the ice it is now 1.3x that and the ice's pass 3-8
  ms more: the whole ice 4.5x the lean composite at full resolution, 3x at half, where it was 18x.)
  On an RTX 4070 Ti (full scale, a frost in view, `runs/night/ice-d1`): the composite and `fsField` 1.45-1.48 ms →
  1.22 with `fsIce` 0.83 of it at full, 0.60 at half (`fsIce` 0.22). Against main on frozen frames (`tools/icelook.mjs`,
  fit, 80, 150, 300 pixels a unit, at the front and deep in the ice, freezing, held and thawing; `runs/ice/cheap/final`):
  SSIM 0.99998-1.0, a mean difference of 0.004 of 255, two or three pixels a frame off by more than 8 (the target's
  half floats). At half resolution (`final-half`, `half2`): SSIM 0.97-0.99 at 80, 0.98-0.995 at 150, 0.99-0.997 at 300,
  0.88-0.9 at fit (where the dendrites are finer than a pixel at full): the seams softer, the grains' edges a little
  stepped.
- **Costs left**: the target is the view's size in half floats whether or not there is ice (26 MB at 2544 × 1289,
  66 MB at 4K); where the full composite draws for something else (a map, duckweed, the instrument) the pass draws
  every frame, ending at once where no ice is shown anywhere.
- **Tried**: the Voronoi's second pass over 3 × 3 cells rather than 5 × 5 (no pixel differed in the frozen frames;
  left out, as its gain was not measured on the phone); a composite swapped in on the phone (`Engine.hotComposite`, from
  a bench scenario since removed) compiles synchronously there and held the page 16 s a frame: time variants as pages.

## Doing less work: the sea and the contacts (2026-11-13)

The Pixel 3 runs each shader at about its hardware's honest speed (above), so the lever left is less work per frame.
Two passes never feed the simulation: the sea (`SEA_WGSL`, 3.6 ms) and `contactGather` (3.4 ms at 80 pixels a unit,
1.75 at 150). The Pixel 3, `p8` (8k, 6360 living), every effect on, half scale, 30 fps aimed for, `adapt: 'off'`; ms,
two page loads each, thermal state 0-1 (`runs/night/cad0`-`cad3`):

| | before | after |
|---|---|---|
| the sea, turned every frame | 3.61 (spectrum 0.51, rows' FFT 1.48, columns' 1.49, mipmaps 0.15) | 1.22 (0.03, 0.09, 0.99, 0.11) |
| the sea every 2nd frame (the tuner's half rate) | 1.77 | 0.60 |
| the sea every 4th | 0.90 | 0.3 (by the rate) |
| `contactGather`, half the grid cells searching a frame (80 / 150 px a unit) | 3.39-3.47 / 1.74-1.77, its contacts wrong (below) | 3.55-3.92 / 1.76-1.86, and `touchCarry` 0.10 / 0.03-0.06 |
| every grid cell searching every frame | 4.9 / 2.67 | 4.50 / 2.42-2.48 |
| a quarter of them a frame (the tuner's new step) | | 2.78-2.88 / 1.29-1.32 |
| the cells' pass (`fsReproj+…+fsPointLive`), the same scenes (a noisy pass) | 5.1-5.2 / 7.3 | 4.5-4.7 / 5.4-6.4 |

- **The sea turns only the waves it holds** (`seaBands`, src/sea.js). Its waves are damped past `lmin` (4 units), and
  nothing past three times the damping wavenumber is worth a thousandth of the slope, so a cascade whose band starts
  past 2.5 times it holds nothing (the composite already skipped it) and in the rest only |f| up to that matters. A
  phone's 8k world is 27 × 14 units: its second cascade holds nothing and its first only |f| ≤ 21 across and 11 down,
  of 128. The spectrum is now worked out over the band's rows only (the rest of each row zeroed), the rows' FFT runs
  over those rows only, a cascade that holds nothing is not turned at all; the columns' FFT still runs whole (its
  output is every texel), and is most of what is left. The texture is the same within half precision's rounding (a
  1M world's first cascade bit for bit; at most 1.2e-4 against slopes of 0.1-0.3 elsewhere, on lavapipe), on every
  device: a desktop's worlds keep up to half their rows too.
- **Turned less often, the sea is read carried along its drift** (`seaDrift`, `post.seaDepth.yz`). A sea held 1/30 s
  of a storm's clock between turns is off by 14% of its slope's rms (28% at 1/15 s, 41% at 1/10), a step every turn;
  its waves run at their own speeds (w ∝ k^0.5), but one velocity, the least-squares fit over the slope's spectrum
  (5.6 units a clock-second along the wind, against 5.3 fitted to the texture directly), carries it to within 4.8%
  (9.7, 14.5%): what is left is the waves changing shape, not moving. A calm sea's clock runs at 0.45 of a storm's.
  As the composite shows it (`tools/seacarry.mjs` + `.py`: an 8k world held at 150 pixels a unit, the sea shown a
  moment after a turn, against it turned afresh; 1 - SSIM): its light alone in a storm, 1/30 s on 0.0021 carried
  against 0.0037 held, 1/10 s on 0.0046 against 0.0171; in calm water 0.001 either way. The whole view's frames differ
  by 0.098 from one shot to the next with nothing changed (the look's grain), over which a storm 1/10 s on adds 0.014
  carried and 0.026 held, 1/30 s on 0.003 and 0.011. The steps a held sea takes show only in motion; carried, it moves
  on between turns.
- **The contacts read back were someone else's.** The checkerboard (the M1's half-rate contacts, above) had the
  grid cells not searching read back last frame's contacts by sorted index, but every step sorts the world again
  (`resolveCount` ranks by atomics, and any cell gained or lost shifts every index after it): a cell read the row of
  whoever now sat at its index, naming whoever sat at those. `tools/touchcheck.mjs` compares each cell's contacts as
  drawn with a search on the CPU over the same positions (a 32k world on the RTX, 60 frames at 60 pixels a unit, about
  1,500 cells a frame): before, a cell's contacts were exactly right on the frames its grid cell searched 99% of the
  time and on the others 22% (at 150 pixels a unit 24-55%, a wrong and a missing contact a cell), so walls flattened
  and fused against the wrong neighbors every other frame; and of the newborns in view only 58% were drawn budding from
  their mother (their first sight's contacts someone else's). After: 98.8% and 99.4%, newborns budding 98%; a quarter
  of the grid cells searching a frame 97-100% (at 150). (Main meanwhile had every cell search on any frame the world
  stepped, 3916aa0: correct, at the full search's cost, 4.9 / 2.67 ms on the Pixel 3; the 3.4 / 1.75 measured before
  were the half-rate search's, wrong contacts and all.) Now the contacts are kept beside the cell's record (row for
  row with the sway table, by id), and after each step `touchCarry` carries the rows of the cells gathered through its sort (`aux`, as
  `scatterMain` carries bonds; 0.03-0.1 ms a step on the Pixel 3); a grid cell holding a cell with no contacts from
  the last gathering (a newborn, one come into view) searches anyway; and a cell that lost a bite's or a birth's worth
  of energy on a frame its grid cell did not search is judged on its next, which does (its energy as last seen kept):
  a mother's newborn is never among the frame before's contacts, and was taken for a bite. Nothing is lost; a
  contact is at most a few frames old and such an event at most a few frames late. Holding the record's whole slot
  through the search (as first written) made the kernel a third slower on the Pixel 3 (6.6 ms at 80 with every cell
  searching): the slot is found before the search and the record read after it.
- **The tuner** (src/tuner.js): a knob `contacts` (a grid cell's search every 2 frames, its default, or every 4: the
  search about two thirds of the pass), and a rule: behind, a cadence's step (`cadence`: the sea to half or a quarter
  rate, the contacts to a quarter, the stone relit less often) is taken before any other, so nothing is turned off
  while something can be done less often; with room, they are won back last. The sea's steps weigh half what they did
  (0.3, 0.15) now that it keeps moving between turns. The contacts' cost is guessed as 0.15 of the drawing until
  measured (with none, the Pixel 3 turned the sea off before it knew the contacts' step would pay).
  On the Pixel 3 (`runs/night/cad4`, `cad5`: four page loads a build, `adapt: 'keep'`, 30 s at 80 then 150 pixels a
  unit, the dressing back at its best for each), main took the haze, the sea to half rate, the specks and the
  microscope before anything else; this build the sea to half rate, the contacts to a quarter, the sea to a quarter
  and the stone to every 2 s, then the haze, the specks and the microscope. At 80 pixels a unit both end with all the
  dressing off but the insides, half scale and 64 neighbors, at 20-34 fps (main 26-33, this 25-34): the step (11-14 ms)
  and the cells (6-7 ms) are most of the frame there, and the dressing cannot pay for them. At 150 main held 54 fps in
  one load of four (with the sea and the insides off) and 30 fps in three; this build 52-57 fps in three and 26 in
  one, the sea and the insides kept in all four (the sea at a quarter rate in two), the haze and the microscope off
  in both. Few loads, and the phone warmed to thermal state 1: a lean, not a measured difference.
- **Not done, or no help**: the sea skipped while calm (a calm sea is 0.3 of a storm's height, its light plain to see);
  a smaller FFT for small worlds (the columns' 1.0 ms would fall about four times at 128, but the cascades' layout and
  the sea's own random draws follow `SEA_N`, so it would be another sea; left for later); blending two turns of the
  sea (a second texture, twice the composite's reads, and a crossfade rather than motion).

## A step over two frames: 60 fps at real time on a Pixel 3 (2026-11-13)

A 1/60 s step of the Pixel 3's 8k world takes 9.4 ms, so a frame at 60 fps had 7 ms for its drawing, and Auto took
the view to 30 fps in 2-tick steps (13.1 ms, all on one frame) wherever the drawing cost more. Now, where a frame is a
tick long and a 1/60 s step does not fit beside the drawing, the page takes 2-tick steps and spreads each over two
frames: up to `senseMainCoarse` after one frame's drawing (8.1 ms), the rest before the next frame's (5.3 ms). The
step is the same (its passes, order and uniforms; bit for bit on lavapipe), each frame holds 0.87 of a 1/60 s step at
most and 0.7 on average, and the world drawn advances a tick a frame. docs/fast-forward.md, Split steps, has how and
what it guards against; the numbers (`runs/night/hs1`, `hs4`, main against it, interleaved): at 150 pixels a unit
under Auto 59.2-59.7 fps with every effect at its best, where main held 55.6-57.6 having given up the sea, the haze,
the microscope and the insides (p95 frame interval 17.3 against 26-33 ms); held cheapest at 80 pixels a unit
59.9-60.5 fps against 46-47; under Auto at 80, 30 fps either way (the tuner gives up the frame rate before the insides).

- **Not split**: 1/60 s steps (two halves of 9.4 ms over two frames would simulate at half speed); 3-tick steps (20
  fps; the first half alone is 60% of a step, so no three frames hold a third each); frames shorter than a tick (a
  144 Hz display at its own rate: a 2-tick step every four frames drew the world still for three of them); an RTX
  4070 Ti's 4M world, whose first half (8.8 of 10.5 ms) is more than a 1/60 s step (the page measures the dearer
  half's share, `perf.halfShare`, and takes no split where a frame would hold 0.95 of a 1/60 s step or more).
- **What a human should look at on the phone**: the motion at 150 pixels a unit (each frame a tick on: even, no
  pulse at 30 Hz), the selection's marker and the notes riding their cells, and a save or the pipette's set-down
  while it runs.

## Lean step kernels: what the whole world leaves idle, compiled out (2026-11-13)

On a Pixel 3 code that never runs still costs (the composite above: 7.0-7.5 ms full, 1.9-2.1 with its rare parts
compiled out), and `lifeMain` carries code for things idle in most worlds most of the time. The engine now picks, step
by step, `lifeMain` compiled without them where this step's uniforms show them idle: the same world whenever it is
picked, `lifeMain` 3.3 → 2.85 ms at 1 tick and 3.6 → 2.2 at 2 on the Pixel 3 (a 2-tick step 12.9-13.3 → 11.4-11.7 ms).

- **What it leaves out** (WGSL `override`s, `IDLE_*` in simWGSL, folded as constants where a pipeline sets them): the
  viewer's hand (the lamp's light and slope, the rod's push and wake, the needle's cut and shaft, the ridden cell's
  will, the pipette's draw: `IDLE_HAND`), dry ground (the floor's relief, the edge's sway, stranding: `IDLE_DRY`; the
  ice keeps its own run-time test, `iceOn`), raindrops' rings (`IDLE_RAIN`) and duckweed's shade (`IDLE_DUCK`). Each
  is code its own test already skips when idle; the override only takes the test's answer as known.
- **What picks it** (`Engine._stepLean`, `leanRan`): the uniforms the step was just given (`simData`), tested as the
  WGSL tests them: the hand's words at rest, `sim.pond.x` at 1 or above, no raindrop alive (with 0.05 s of margin about
  its life for the clock's rounding), `sim.duck.w` 0. A split step's second half keeps the first's choice (its uniforms
  are the first half's). Headless runs (no hand) take it wherever no low water, rain or duckweed is about. The
  pipelines (`lifeMainLean`, `lifeMainCoarseLean`) compile in the page's second wave right after the coarse ones, the
  full ones running until they land; headless runs compile them with the rest. Copy profile's `world.lean` says
  whether the last step took it; a profile names it `lifeMain` either way.
- **The phone, knock-outs first** (`p8`, 8192 particles, 6361 living, `kind: step`; the overrides set on the page's own
  pipelines through an init script, every variant on one page build; ms, two page loads each, A/B interleaved, thermal
  state 0-1; `runs/night/lk1`-`lk3`, plans made by a one-off kept outside the repo):

  | `lifeMain` built with | 1 tick | 2 ticks (coarse) |
  |---|---|---|
  | everything (as main) | 3.15-3.41 | 3.54-3.74 |
  | the hand, notes, dry ground, ice, rain and duckweed compiled out (the bound) | 2.56-2.75 | 2.03-2.16 |
  | the same less the ice (picked by the engine itself, the overrides as first built) | 2.82-2.88 | 2.16-2.23 |
  | the same less the ice and the notes (as kept) | 2.82 | 2.16-2.23 |
  | the hand alone / the ice alone | 3.15-3.21 / 3.15 | 2.29-2.36 / 2.42 |
  | the notes alone / dry ground alone | 3.21-3.41 / 3.28-3.34 | 3.47-3.67 / 3.74 |

  The parts do not add: in the coarse kernel the hand alone or the ice alone takes most of it (a cliff, as the
  composite's), all of them a little more. Mesa's count (`regs.sh`) has the coarse `lifeMain` at 43.6 → 38.1 vec4
  registers, 65k → 58k instructions, no spills; the fine one 43.9 → 38.2.
- **Left out of it.** The annotations' event records (`note`; on with the auto camera, Settings → Annotations): with
  them kept the lean kernel is as fast (the row above), so it serves while they show. `senseMain` lean (the hand's
  cut, a coarse grain's currents and shore) ran slower, 4.26 → 4.52 ms at 1 tick and 5.96 → 6.03-6.16 at 2, in every
  load. The ice's test: compiled out it saves 0.13 ms more, but the CPU cannot know exactly that a world holds no ice
  (its count, `ICE_N`, is the GPU's, from the step before; the frost's and the cold probe's state does not say when the
  last ice has thawed), so the pick would have to be made on the GPU (two dispatches, one of them empty).
  `bodyTick` (a coarse step's beating bodies) with the hand, or the hand and the ice, compiled out: 1.31-1.38 ms
  either way (`runs/night/lk4`).
- **What rare events' code costs** (each knocked out of the full `lifeMain`, so the world runs wrong; timing only, the
  same runs): a birth (the claim of a grain, `mutateInto`, a new species' slot) 0.15-0.25 ms at 1 tick, 0.2-0.3 at 2;
  a death (starving, age, scalding, a cyst, the gut's dung, a reef's stone) 0.1 at 1 tick, nothing at 2; a meal 0.25 at
  1 tick and **1.4 at 2** (3.54-3.67 → 2.16: the coarse kernel's walk over its four best foods, `mealMissed`, the
  claims, as much as everything world-idle together). Meals are not rare (every hungry cell with food in reach, each
  `eatEvery` ticks), and a coarse step's meals are woven into its tick-by-tick energy (a birth or a death ends the
  walk), so moving them to a kernel of their own over the cells that have a meal due would need that walk split in
  two; not tried. The likeliest next gain in the coarse step.
- **The same world** (`tools/leancheck.mjs`: one world, the same moment run on with the full kernel twice and with the
  lean one, the buffers a save keeps compared word for word, particles by id): on lavapipe single-threaded, 4096
  particles (1240-1450 living), 40 steps, every word the same at 1, 2 and 6 ticks (lean in every step); with the lamp
  lit or the water low, the engine takes the full kernel (lean in no step), and forced to take the lean one all the
  same, a third of the particles' words differ: the check sees what it should.
- **The RTX 4070 Ti** (Windows Chrome, `runs/night/lk-desk`, two loads each): `lifeMain` 0.033 → 0.030 ms at 32k, 0.17
  → 0.158 at 262k (fine), the coarse ones 0.028 → 0.026, 0.193 → 0.179; the step no slower at 1, 2 and 6 ticks.

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
   arithmetic changes, and 6-tick runs (CLAUDE.md). (Since 2026-11-13 the scan is a kernel of its own, `senseMain`,
   for a phone's registers: The step in two kernels.)
2. **Cells' shading close up** (3.1 ms at 71 px a unit). Most of it is the cell's own outline (`cellOutline`, six
   sines, `atan2`, `bodySD`'s twelve plans) at every pixel of its quad; quads reach 1.35+ radii for hairs, tails and
   necks. Drawing tighter quads for cells that show none of those (fine LOD 0, no buds) would cut pixels: an earlier
   probe that skipped pixels past 1.2 radii saved 0.45 ms of 4.9. It needs a sure bound on each body plan's reach
   (`bodySD` with `bodyAspect`, pace, bend, squash, swell) before it is exact. The contact planes' seams cost ~0.44 ms
   (their wandering seam's `cellGrain` noise). `vsPoint` still works out each large sprite at all four corners (1.1 ms
   at that zoom; the partner/contact gathering about half of it): a per-sprite record pass would save ~0.35 ms but
   needs a record buffer per large sprite (judged not worth it). (Since 2026-11-13 the outline is read from the shape
   atlas, not `bodySD`'s plans, and the necks' code runs only where a neck can show: Zoomed in on the M1.)
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
   small for contacts (vsPoint gathers none under 6 px) is untried. (Since 2026-11-13 half the grid cells search a
   frame, a quarter when the tuner asks: Doing less work.)
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
  `heatMain` marks the tiles (32 × 32) that hold them and `compPick` asks only of those the view covers. (Since
  2026-11-13 the lean one with that one back where only the ice or only the bubbles are in view: The composite as a
  phone draws it.)
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
  `m32k-mac.json` are the 32k plans of 2026-11-12. A `.bin` world's living are waited for up to 20 s (a phone still
  compiling counts them late).
- `tools/icelook.mjs --a A.wgsl --b B.wgsl --out DIR` grows a frost, stops it as it freezes, holds and thaws, and
  photographs each moment at fit, 80, 150 and 300 pixels a unit at its front and deep in the ice with each composite
  swapped in, the draws' time frozen; SSIM and pixel differences per pair (`--tuneb '{"ice":0}'`: b at half
  resolution). A composite older than `fsIce` needs `@binding(29) var iceTex` declared and read (times 0) to bind.
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
