# Tidemote

A sealed biosphere of hundreds of thousands to millions of particles, simulated on the GPU with WebGPU. Inert silt is charged into glint by the tide. Cells photosynthesise, graze, hunt and scavenge, and build their children out of silt. Children mutate into new species, bonded species grow into multicellular bodies, and the climate turns every 10–18 minutes. Leave it running and it keeps changing for hours.

It grew out of [proximity-structures](https://github.com/thallada/proximity-structures): simple elements that only react to what is near them, scaled up until complex structure appears.

## Running it

Open `dist/tidemote.html` in a browser with WebGPU: a current Chrome or Edge, a recent Safari, or Firefox on Windows. It is a single self-contained file with no build step needed to view it. Some browsers block WebGPU on `file://` pages; if so, serve the folder:

```sh
python3 -m http.server -d dist 8000   # then open http://localhost:8000/tidemote.html
```

On start it sizes the universe to your GPU: it times a few frames and fixes the particle count so the simulation fits in about 7.5 ms a frame. If the frame rate later drops, it lowers the render resolution instead of the particle count.

Press **H** in the page for controls and **K** for the Field Lab (species list, composition, population charts, lineage tree, chronicle, environment overlays and a field guide). Click any cell to follow it.

## Building

The source is a handful of ES modules in `src/`. `build.py` concatenates them into `src/page.html` and writes `dist/tidemote.html`:

```sh
python3 build.py
```

The modules end up sharing one top-level scope, so top-level names must be unique across files. That's why `engine.js` uses `eclamp` and `emix` rather than `clamp` and `mix`.

## Layout

| Path | What it holds |
| --- | --- |
| `src/shaders.js` | All WGSL: the simulation passes (binning, counting sort, matter, life), picking, point and bond rendering, post-processing. `DEFAULT_K` holds every tunable constant. |
| `src/engine.js` | The WebGPU engine: buffers, pipelines, the per-frame pass sequence, census and pick readbacks, the focus/highlight filter, and the CPU-side regulators (plant-cover turbidity, guild blight, immigration). Also the founding archetypes. |
| `src/main.js` | The page: calibration, camera, inspector, organism tracing, climate eras, species registry and naming, census panel, input. |
| `src/lab.js` | The Field Lab drawer. |
| `src/guide.js` | Glossary (hover hints) and field-guide text. |
| `src/page.html` | Markup and styles. The bundled script is inserted at `/*__SCRIPT__*/`. |
| `tools/ecology.mjs` | Headless ecology runs for tuning (see below). |

## How the simulation works

Each frame runs entirely on the GPU:

1. **Resolve** last frame's claims (meals, births, bites) and count each species.
2. **Bin** every particle into a grid with a counting sort and prefix scan, so neighbours can be found in the surrounding 3×3 cells.
3. **Matter**: silt, glint and husks drift on divergence-free currents. The tide charges silt into glint, glint fades, and husks decay.
4. **Life**: only the living are dispatched, indirectly. Each cell sums particle-life forces from 8-dimensional surface/receptor signatures, bonds to its two nearest same-species neighbours if it is adhesive, photosynthesises, pays upkeep, and claims food or a silt grain to divide into.

Every 20 frames a census is read back: per-species counts and genomes. The CPU uses it to name species, track lineages, and nudge the few global regulators that keep the ecosystem diverse:

- species blight
- guild blight
- plant-cover turbidity
- immigration of rare ways of life

The field guide inside the page explains the ecology in full.

## Tuning the ecology headlessly

`tools/ecology.mjs` runs the simulation through Dawn (the `webgpu` npm package) and prints the composition of the biosphere every 30 simulated seconds:

```sh
cd tools && npm install
node ecology.mjs                                  # 16k particles, 10 simulated minutes
N=32768 MINUTES=5 SEED=11 node ecology.mjs
K='{"guildCap":0.4,"bite":0.08}' node ecology.mjs  # override constants from DEFAULT_K
OUT=world.png ZOOM=1,4 node ecology.mjs            # also render the last frame
```

Without a hardware GPU, Mesa's software Vulkan driver works, several times slower than real time:

```sh
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json node ecology.mjs
```
