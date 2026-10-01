# Tidemote

GPU biosphere simulation (WebGPU, WGSL) with a browser page and headless tools. See README.md for the design.

## Commands

- `npm run build` bundles `src/` with esbuild into the single-file `dist/tidemote.html`.
- `npm test` runs unit tests (`test/*.test.js`) and a short headless smoke sim.
- `node tools/sim.mjs --chrome --n 4096 --minutes 5 --out run.json` runs the page's ecology headlessly and writes JSON metrics.
- `node tools/compare.mjs --chrome --seeds 3 --minutes 5 --n 4096 --jobs 3 --out runs base '{}' variant '{"k":{"shade":0.1}}'` compares configurations across seeds.

## Layout

- `src/shaders.js` all WGSL and `DEFAULT_K` (every tunable).
- `src/engine.js` the WebGPU engine (buffers, passes, readbacks). The census only feeds naming and lineage tracking; nothing steers the ecology globally.
- `src/genome.js` CPU genome packing, archetypes, guild classification (`dietGuild`, `mobilityGuild`).
- `src/climate.js` seasons, climate eras, abiogenesis rate: shared by the page and headless runs.
- `src/headless.js` the headless frame loop and metrics, run under Dawn or inside Chromium.
- `src/main.js` the page; `names.js`, `facets.js`, `trace.js`, `flow.js` are its pure helpers; `lab.js` the Field Lab.

## Headless caveats

- On machines without a GPU use `--chrome` (Playwright Chromium with SwiftShader). It is slow (about 76 ms/frame at 4k particles) but stable.
- The Dawn path (`webgpu` npm, `--cpu` for lavapipe) is for real GPUs. On Mesa lavapipe it aborts after a few thousand frames whenever async readbacks are used; do not try to work around it with pacing tricks.
- Every ecological rule is local (see README "How the simulation works"); do not add census-driven regulators back.
