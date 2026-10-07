# Tidemote

GPU biosphere simulation (WebGPU, WGSL) with a browser page and headless tools. See README.md for the design.

## Commands

- `npm run build` bundles `src/` with esbuild into the single-file `dist/tidemote.html`.
- `npm test` runs unit tests (`test/*.test.js`) and a short headless smoke sim.
- `node tools/sim.mjs --chrome --n 4096 --minutes 5 --out run.json` runs the page's ecology headlessly and writes JSON metrics.
- `node tools/compare.mjs --chrome --seeds 3 --minutes 5 --n 4096 --jobs 3 --out runs base '{}' variant '{"k":{"shade":0.1}}'` compares configurations across seeds.
- `npm run gate -- --out runs/NAME --k '{...}'` (32 seeds × 30 min at 32k against `balance/baseline-32k-30m.json`, ~16 min) is the balance regression gate (see docs/headless-gpu.md). Run it before and after any ecology change.

## Layout

- `src/shaders.js` all WGSL and `DEFAULT_K` (every tunable).
- `src/engine.js` the WebGPU engine (buffers, passes, readbacks). The census only feeds naming and lineage tracking; nothing steers the ecology globally.
- `src/genome.js` CPU genome packing, archetypes, guild classification (`dietGuild`, `mobilityGuild`).
- `src/climate.js` seasons, climate eras, abiogenesis rate: shared by the page and headless runs.
- `src/headless.js` the headless frame loop, run under Dawn or inside Chromium; `src/ecostats.js` run and ensemble metrics and the statistical comparison.
- `src/audio/` the soundtrack: a sample-level JS port of SuperCollider UGens and voices (`ugens.js`, `voices.js`) driven by `conductor.js` in an AudioWorklet; `sound.js` is the main-thread controller; `field.js` turns the GPU listening scan (`LISTEN_WGSL`, observational) into notes. Tune it offline with `tools/listen-capture.mjs` + `tools/listen-render.mjs`. Check changes to `ugens.js`/`voices.js` against SuperCollider with `tools/audio-parity/` (sclang as root needs `QTWEBENGINE_DISABLE_SANDBOX=1`).
- `src/audio/motif.js` each species' song from its genome (pure, tested in `test/motif.test.js`); `src/song.js` draws it (piano roll; sigil, the song drawn as its organism). `tools/sigil-gallery.mjs` shows sigils beside species portraits from `tools/species-portraits.mjs` (a headless trial world drawn to an offscreen texture). Compare generators by ear and by numbers with `node tools/motif-gallery.mjs --out gallery --legacy`. `mutateLike` in `genome.js` mirrors the GPU's `mutateInto` for tools and tests only.
- `src/mind.js` names what the selected cell is doing (hunting, fleeing, grazing...) from `mindMain`, an observational replay of its last `lifeMain` step; `src/mindview.js` draws it in the specimen panel (built once per cell, updated in place, compass eased per frame). Both kernels share `cellWGSL` in `src/shaders.js`; its recording hooks must expand to nothing in `lifeMain` (`test/mind.test.js` checks).
- `src/director.js` the auto camera: shot planning over the observational survey (`SURVEY_WGSL`), smooth zoom-and-pan paths; pure, tested in `test/director.test.js`.
- `src/main.js` the page; `names.js`, `facets.js`, `trace.js`, `flow.js` are its pure helpers; `specimen.js` the specimen panel, `lab.js` the Field Lab, `tip.js` the hints. Styles live in `src/page.css`. UI text and glossary terms carry `data-tip`/`data-hint`, never `title` (it fights the hints). Panels update in place (never re-render a control under the pointer) and a pointer click hands focus back so shortcuts keep working.

## Headless caveats

- Under WSL, prefix headless tools with `tools/gpu-node.sh` (Windows Node, Dawn on D3D12, the real GPU). Plain `node` in WSL only finds llvmpipe and `sim.mjs` refuses it unless `--cpu` is passed.
- GPU runs are not bit-reproducible per seed; compare ensembles, never single runs.
- On machines without a GPU use `--chrome` (Playwright Chromium with SwiftShader). It is slow (about 76 ms/frame at 4k particles) but stable.
- The Dawn path (`webgpu` npm, `--cpu` for lavapipe) is for real GPUs. On Mesa lavapipe it aborts after a few thousand frames whenever async readbacks are used; do not try to work around it with pacing tricks.
- Every ecological rule is local (see README "How the simulation works"); do not add census-driven regulators back.
