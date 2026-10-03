# Tidemote

A sealed biosphere of hundreds of thousands to millions of particles, simulated on the GPU with WebGPU. Inert silt is charged into glint by the tide. Cells photosynthesise, graze, hunt and scavenge, and build their children out of silt. Children mutate into new species, bonded species grow into multicellular bodies, and the climate turns every 10–18 minutes. Leave it running and it keeps changing for hours.

It grew out of [proximity-structures](https://github.com/thallada/proximity-structures): simple elements that only react to what is near them, scaled up until complex structure appears.

## Running it

Open `dist/tidemote.html` in a browser with WebGPU: a current Chrome or Edge, a recent Safari, or Firefox on Windows. It is a single self-contained file with no build step needed to view it. Some browsers block WebGPU on `file://` pages; if so, serve the folder:

```sh
python3 -m http.server -d dist 8000   # then open http://localhost:8000/tidemote.html
```

On start it sizes the universe to your GPU: it times a few frames and fixes the particle count so the simulation fits in about 7.5 ms a frame. If the frame rate later drops, it lowers the render resolution instead of the particle count.

The time control under the epoch clock pauses, steps the speed along ×¼ … ×1, ×1.25, ×1.5, ×2, ×4 … ×64 (`,` and `.`), returns to real time (`/`) or runs as fast as the GPU allows (**Max**, `>`). Above ×1 the page runs several whole simulation steps per drawn frame, as the headless runs do, so the ecology is the same at every speed; it keeps a frame under about 30 ms of GPU time and shows the speed actually reached when that is less than asked. Below ×1 the steps are shortened instead.

Every world draws its own tide pattern (wave directions, drift and phases), opening light and glint charge, matter mix, founding community, and how clumped the founders start.

Press **H** in the page for controls and **K** for the Field Lab (species list, composition, population charts, lineage tree, chronicle, environment overlays and a field guide). Click any cell to follow it.

## Building

The source is a handful of ES modules in `src/`. `build.mjs` uses esbuild to bundle `src/main.js` into a readable IIFE, inserts it into `src/page.html`, and writes `dist/tidemote.html`:

```sh
npm install
npm run build
```

esbuild preserves module scope, so top-level names can be reused across files.

## Layout

| Path | What it holds |
| --- | --- |
| `src/shaders.js` | All WGSL: the simulation passes (binning, counting sort, matter, life), picking, point and bond rendering, post-processing. `DEFAULT_K` holds every tunable constant. |
| `src/engine.js` | The WebGPU engine: buffers, pipelines, the per-frame pass sequence, census and pick readbacks, and the focus/highlight filter. |
| `src/genome.js` | CPU genome helpers: founding archetypes, packing and decoding, colours, affinities, role shares, and diet/mobility guilds. |
| `src/climate.js` | Shared seasons, climate eras and abiogenesis rules. |
| `src/main.js` | The page: calibration, camera, inspector, organism tracing, species registry and naming, census panel, input. |
| `src/lab.js` | The Field Lab drawer. |
| `src/guide.js` | Glossary (hover hints) and field-guide text. |
| `src/page.html` | Markup and styles. The bundled script is inserted at `/*__SCRIPT__*/`. |
| `src/audio/` | The soundtrack: `ugens.js` and `voices.js` (a sample-level port of SuperCollider voices, effects and mastering), `mapping.js` (genome → voice), `conductor.js` (the generative score), `worklet.js` (the AudioWorklet), `sound.js` (main-thread controller and the spatial mix). |
| `tools/audio-parity/` | Renders the same events in SuperCollider and in the JS engine and compares them. |
| `tools/sim.mjs`, `tools/compare.mjs` | Headless ecology runs and comparisons across seeds (see below). |

## Soundtrack

Press **S** (or the Sound button) for a generative soundtrack that follows the simulation. Every
living species is a voice: its instrument, register and rhythm come from its diet and body plan,
and its melody is read from its cell-type signature, so a mutant plays a variation of its parent's
motif. Each species is as loud as it is numerous, climate eras change the mode and colour, and
abiogenesis is heard as a spark.

The mix is spatial. Zoomed out you hear the whole sea. Zoom in and the species on screen come
forward, panned to where they are, while everything outside the view recedes: quieter, darker and
deeper in the reverb. Selecting a cell brings its species to the front, and a Lab highlight pushes
the unhighlighted species back. A small GPU pass counts each species inside the camera rectangle on
census frames; like the rest of the census, it only observes.

The synthesis runs in an AudioWorklet as a sample-level port of a SuperCollider score (see
`tools/audio-parity/`), so it sounds the same as the offline SuperCollider render. `-` and `=` (or the
slider) set the volume; the choice is remembered.

## How the simulation works

Each frame runs entirely on the GPU:

1. **Resolve** last frame's claims (meals, births, bites) and count each species.
2. **Bin** every particle into a grid with a counting sort and prefix scan, so neighbours can be found in the surrounding 3×3 cells. A cell reads at most 288 neighbours; in denser places it samples them evenly from a random offset and weights each sample accordingly, so no direction or grid line is favoured.
3. **Matter**: silt, glint and husks drift on divergence-free currents. The tide charges silt into glint, glint fades, and husks decay.
4. **Life**: only the living are dispatched, indirectly. Each cell sums particle-life forces from 8-dimensional surface/receptor signatures, bonds to its two nearest same-species neighbours if it is adhesive, photosynthesises, pays upkeep, and claims food or a silt grain to divide into.

Every 20 frames a census is read back: per-species counts and genomes. The CPU uses it to name species and track lineages; it does not steer the ecology. The ecology is shaped only by local rules:

- **Local crowding and shade**: nearby same-species cells raise upkeep (a body's bond partners excepted); living neighbours shade photosynthesis.
- **Local minerals and food**: photosynthesis needs nearby silt, feeding needs nearby prey, glint or husks, and division needs a nearby silt grain.
- **Catching takes skill**: a cell catches living prey in proportion to how well it is built to eat it, so photosynthesisers and husk eaters rarely kill.
- **Search images**: hunters and grazers catch the species they caught last more readily and often miss unfamiliar prey, so booming species feed their predators while rare ones are spared.
- **Bonds**: bodies share upkeep, shade each other less, and resist attack through armor.

Glint sparks into a random new lineage about once every 30 simulated seconds on average, independent of climate eras and population.

The field guide inside the page explains the ecology in full.

## Tuning the ecology headlessly

Install dependencies at the repo root with `npm install`. `tools/sim.mjs` runs the page's ecology, including climate eras and steady abiogenesis, without rendering or real-time pacing. Defaults: 8192 particles, 10 simulated minutes, samples every 5 simulated seconds and stdout every 30 seconds.

Use `--chrome` on machines without a GPU: headless Chromium runs WebGPU through SwiftShader, with `PLAYWRIGHT_CHROMIUM` available to override the executable (the cached Chromium build is tried before Playwright's default). On real GPUs, omit `--chrome` to use Dawn (`webgpu`); `--cpu` selects Mesa lavapipe for Dawn, whose async readbacks can corrupt memory and abort longer runs on GPU-less machines.

```sh
node tools/sim.mjs --chrome --n 4096 --minutes 10 --seed 11 --out run.json
node tools/sim.mjs --k '{"bite":0.08}' --out run.json      # unknown keys are rejected; see DEFAULT_K
node tools/sim.mjs --minutes 1 --png world.png
node tools/compare.mjs --chrome --seeds 4 --minutes 10 --n 8192 --jobs 2 --out runs/ base '{}' steady '{"eras":false}'
```

On a GPU, `tools/ensemble.mjs` runs one configuration across many seeds and checks it statistically against a saved baseline; it is the regression gate for ecology changes. Under WSL, prefix headless tools with `tools/gpu-node.sh` to reach the GPU through Windows. See [docs/headless-gpu.md](docs/headless-gpu.md):

```sh
tools/gpu-node.sh tools/ensemble.mjs --runs 32 --minutes 30 --n 32768 --k '{"armor":0.5}' --out runs/armor05 \
  --baseline balance/baseline-32k-30m.json --targets balance/targets.json
```

`--no-eras` disables climate eras; `--sample` and `--print` set simulated-second intervals. JSON contains config, samples (composition, diversity, ledger rates per simulated minute and climate), eras and summary metrics. Metrics requiring observations after 60 seconds are `null` in shorter runs. Shares are fractions of living cells. `--png` renders the final frame with Dawn only; optional `ZOOM=1,4` writes separate zoom images. `--help` lists the CLI options.

Comparison configs accept `k` overrides and an `eras` boolean. Runs use seeds 1 through `--seeds`, run up to `--jobs` children, save each JSON, and print means ± sample standard deviations plus per-seed results. Dawn runs limit lavapipe threads per child; Chromium's SwiftShader manages its own threads. Run the smoke test and unit tests with `npm test`; the smoke test uses Chromium when an executable is available and falls back to Dawn with `--cpu` if it is missing or cannot launch.
