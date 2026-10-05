# Tidemote

A sealed biosphere of hundreds of thousands to millions of particles, simulated on the GPU with WebGPU. Inert silt is charged into glint by the tide. Cells photosynthesise, graze, hunt and scavenge, and build their children out of silt. Children mutate into new species, bonded species grow into multicellular bodies, and the climate turns every 10–18 minutes. Leave it running and it keeps changing for hours.

It grew out of [proximity-structures](https://github.com/thallada/proximity-structures): simple elements that only react to what is near them, scaled up until complex structure appears.

## Running it

Open `dist/tidemote.html` in a browser with WebGPU: a current Chrome or Edge, a recent Safari, or Firefox on Windows. It is a single self-contained file with no build step needed to view it. Some browsers block WebGPU on `file://` pages; if so, serve the folder:

```sh
python3 -m http.server -d dist 8000   # then open http://localhost:8000/tidemote.html
```

On start it sizes the universe to your GPU: it times a few frames and fixes the particle count so the simulation fits in about 7.5 ms a frame. If the frame rate later drops, it lowers the render resolution instead of the particle count.

Deep zoom reveals organic detail in cells, minerals and bonds, with a faint, patchy suspension of cosmetic microbial fragments, fibres and grit that follows the water's currents and also appears in the loupe and specimen view.

The view is seen through a microscope (**O** turns this off): clouds of mud drift on the currents and fade in and out of the focal plane, the edge of the field softens and splits colour a little, the lamp is slightly off-centre, dust sits on the eyepiece and the camera adds grain. The loupe is a glass lens with mild barrel distortion. All of it is cosmetic and costs a few tenths of a millisecond at 4K.

The time control under the epoch clock pauses, steps the speed along ×¼ … ×1, ×1.25, ×1.5, ×2, ×4 … ×64 (`,` and `.`), returns to real time (`/`) or runs as fast as the GPU allows (**Max**, `>`). Above ×1 the page runs several whole simulation steps per drawn frame, as the headless runs do, so the ecology is the same at every speed; it keeps a frame under about 30 ms of GPU time and shows the speed actually reached when that is less than asked. Below ×1 the steps are shortened instead.

Every world draws its own tide pattern (wave directions, drift and phases), opening light and glint charge, matter mix, founding community, and how clumped the founders start.

Left alone for a minute (three with the specimen panel or the Lab open), an auto camera takes over and films the world: slow establishing shots of the whole torus, scenes where a survey of the world finds life dense, diverse and busy, long takes following a single organism, and visits to newly established species. Between shots it rises, crosses and descends along a smooth zoom-and-pan path, then drifts and creeps in or out, all trailed through a damped spring so nothing is sudden. A caption at the bottom says what it is doing and why: where it is heading (a hunting ground, a crowd of births, where new variants are being born, a new species) and, once there, the species in view, the organism it follows, or how that one died. Dragging or scrolling the view takes it back where it is (clicking a cell or a species name only opens the specimen panel, and the readouts it tucks away while filming come back while a panel is open); **A** (or the Auto button) starts or stops the camera at once, and **View → Auto when idle** turns the takeover off or on. The survey is an observational GPU pass, like the soundtrack's listening scan.

The page is laid out as an instrument bench around the world: a status rail along the top (epoch, era, light, tide), the census column on the left, the specimen panel on the right when something is picked, and a dock of controls along the bottom (time, Auto, Sound, View, Lab). On a phone the census lives in the Lab and the specimen panel is a sheet that peeks above the dock and is pulled up for details. Press **?** for every shortcut, **V** for view options and **K** for the Field Lab (species, lineage, census, charts, log and a field guide). Click any cell to examine it.

Zooming in reveals twelve families of cell outlines: lobose and filose amoebae, bent radiates,
incised desmids, horned armour, twisted spindles, slippers, chambered whorls, vacuolate crescents,
stalked bells, bead chains and lattice frustules. A cosmetic shape gene chooses the family;
a minority favour forms suited to their mineral, feeding, swimming or bonding traits.
Species have different proportions and facets, and individual cells deform slowly. Outlines
appear from about 3 pixels of radius, interiors at 12–26 pixels, and organelles and fine texture
at 30–65 pixels. The unresolved default view stays cheap. Zoom resolves the same world-sized
cell, with approximately conserved integrated light; visual anatomy does not change ecology.

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
| `src/main.js` | The page: calibration, camera, organism tracing, species registry and naming, the census column, view options, input. |
| `src/specimen.js` | The specimen panel (a picked cell or grain, or a species opened by name). |
| `src/lab.js` | The Field Lab: species, lineage, census, charts, log and guide. |
| `src/tip.js`, `src/charts.js`, `src/glyphs.js`, `src/fmt.js` | Hints (glossary terms and control hints), census-history charts, species emblems, shared formatting. |
| `src/guide.js` | Glossary (hints) and field-guide text. |
| `src/page.html`, `src/page.css` | Markup and styles. The bundled script is inserted at `/*__SCRIPT__*/`, the styles at `/*__STYLE__*/`. |
| `src/audio/` | The soundtrack: `ugens.js` and `voices.js` (a sample-level port of SuperCollider voices, effects and mastering), `mapping.js` (genome → voice), `listen.js` (decoding the GPU listening scan), `field.js` (scan → notes and the far swarm), `conductor.js` (pulse, harmony, sea, waves and drone), `score.js` (the long form: each era's ensemble, interludes, the modulation between eras), `worklet.js` (the AudioWorklet), `sound.js` (main-thread controller). |
| `tools/audio-parity/` | Renders the same events in SuperCollider and in the JS engine and compares them. |
| `tools/sim.mjs`, `tools/compare.mjs` | Headless ecology runs and comparisons across seeds (see below). |

## Soundtrack

The soundtrack is on by default and is the sound of what is in view. **S** (or the Sound button)
turns it off and on, `-` and `=` (or the slider) set the volume; both are remembered. Browsers only
play audio after a click or key press, so where autoplay is blocked the new world waits behind the
intro until one.

Every few frames a read-only GPU pass (`LISTEN_WGSL`) looks at the camera's rectangle. A
particle's age restarts at each change of state and its info bits say why, so the pass finds every birth, mutation, spark of abiogenesis, death (starved, old age or
killed), grazing or scavenging bite and tide charge since the last scan, with its exact time and
place, and it samples the living cells in view. Each living cell sings: now and then it plays the
next note of its species' motif, more often when it moves. Events are accents: a birth rings, a kill
bites, grazing drips, a dying cell falls, the tide's charge shimmers, and movement rustles.

Loudness follows distance, as if the camera were a listener at a height proportional to the view.
Each sound is as loud as `dRef / d`, and a view `d` times wider holds `d²` times as many cells, so a
region's loudness depends on how much is happening there, not on the zoom. Zoomed in on a dozen
cells you hear each one, panned to where it is. Zoomed out, the single voices give way to a swarm:
every cell sound in view becomes one grain, a soft note of its species' motif rung by random
impulses (SuperCollider's `Dust` into `Formlet`), and thousands blur into a murmur. Distance is
heard as it is in water or air: far grains swell in slowly, ring long and lose their highs, and
diving in sharpens and opens them until single voices step out. Close up the voices are held
back a little, so diving in is not a jump in level.
Up close only a fair sample is played and each played note carries the power of the ones it stands
for, so the audio thread never plays more than a few dozen voices. Selecting a cell brings its species forward;
a Lab highlight pushes the others back. Notes snap to a pulse that follows the simulation's speed:
slower when time is slowed, faster (up to 4×) when it runs fast.

Around the cells plays a slower score. Each climate era brings its own ensemble, two of six layers
the previous era did not play: notes on loops of incommensurate lengths, interlocking vibraphone
figures built from the reigning species' motif that mutate a note at a time, a felt piano breaking
chords, dub chords dissolving into echoes, string chords swelling, or a far sonar ping. The
season's tide shapes them: as it strengthens they gain voices and brightness, as it slackens they
thin out. Waves wash in more often at high tide and are heard best from afar. A new era is a
modulation: a low piano chord sinks into a long reverb while strings swell on a chord the old and
new keys share, then resolve into the new key, and a piano interlude develops the reigning
species' motif. Interludes also mark a new reigning species and the height of a season. Nothing
glides: the sea and the drone change pitch by fading a new voice in over the old.

It runs in an AudioWorklet as a sample-level port of SuperCollider voices (see
`tools/audio-parity/`). `tools/listen-capture.mjs` records what the soundtrack hears from a headless
run at several zoom levels, and `tools/listen-render.mjs` renders such a capture offline and reports
loudness and density per view, for tuning without a browser (`--repeat`, `--season` and `--era`
stretch a capture into a long piece with seasons and era changes).

## How the simulation works

Each frame runs entirely on the GPU:

1. **Resolve** last frame's claims (meals, births, bites) and count each species.
2. **Bin** every particle into a grid with a counting sort and prefix scan, so neighbours can be found in the surrounding 3×3 cells. A cell reads at most 288 neighbours; in denser places it samples them evenly from a random offset and weights each sample accordingly, so no direction or grid line is favoured.
3. **Matter**: silt, glint and husks drift on divergence-free currents. The tide charges silt into glint, glint fades, and husks decay.
4. **Life**: only the living are dispatched, indirectly. Each cell sums particle-life forces from 8-dimensional surface/receptor signatures, keeps up to two same-species bonds if it is adhesive, photosynthesises, pays upkeep, and claims food or a silt grain to divide into.

Every 20 frames a census is read back: per-species counts and genomes. The CPU uses it to name species and track lineages; it does not steer the ecology. The ecology is shaped only by local rules:

- **Local crowding and shade**: nearby same-species cells raise upkeep (a body's bond partners excepted); living neighbours shade photosynthesis.
- **Local minerals and food**: photosynthesis needs nearby silt, feeding needs nearby prey, glint or husks, and division needs a nearby silt grain.
- **Catching takes skill**: a cell catches living prey in proportion to how well it is built to eat it, so photosynthesisers and husk eaters rarely kill.
- **Search images**: hunters and grazers catch the species they caught last more readily and often miss unfamiliar prey, so booming species feed their predators while rare ones are spared.
- **Bonds**: adhesive cells keep their partners until they die, change kind or stretch beyond `bondBreak × linkR` (by default 1.25×). Empty slots find the nearest same-species cells within `linkR` in the neighbour scan; newborns start with a bond to their parent if they are the same species. Bodies grow by division, share upkeep, shade each other less, and resist attack through armor.
- **Stone**: each world has its own bedrock outcrops, and settled calcifying cells may leave their skeleton as stone, mostly beside stone already there, so reefs grow from rock. Stone never drifts and only calcifiers can settle on it; attacks made from among it sometimes miss. Loose stone wears away fast and packed stone slowly, while a neighbourhood that is mostly reef wears fast, so reefs grow as separate patches and the world never turns to stone.

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

Add `--aim` to centre PNGs on the living cell with the most incoming bonds (a body’s hub),
falling back to the world centre if no living cells remain. `--render-bench`
uses GPU timestamps for 180 paused render frames per zoom after warmup, and saves a
`-timing.json` beside the PNGs (requires a timestamp-capable Dawn adapter). Under WSL,
include `ZOOM:W:H` in `WSLENV` when using those variables through `tools/gpu-node.sh`.

Comparison configs accept `k` overrides and an `eras` boolean. Runs use seeds 1 through `--seeds`, run up to `--jobs` children, save each JSON, and print means ± sample standard deviations plus per-seed results. Dawn runs limit lavapipe threads per child; Chromium's SwiftShader manages its own threads. Run the smoke test and unit tests with `npm test`; the smoke test uses Chromium when an executable is available and falls back to Dawn with `--cpu` if it is missing or cannot launch.
