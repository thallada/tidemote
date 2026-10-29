# Tidemote

A sealed biosphere of up to millions of particles, and all of them live, eat, breed, and die in your browser, simulated on the GPU with WebGPU. Some cells drink the moving light of the tide. Others graze on the photosynthesizers, and others hunt the grazers. Scavengers break down the dead and return them to the water as silt, and from that silt the next generation builds its children. Children mutate into new species. Species that bond grow into bodies: filaments, branched fronds, spirals, packed tissues. Some of these bodies grow beating tails and swim. Every 10 to 18 minutes the climate turns, and the world has to begin again in its own way. It makes its own music, too: each cell sings its species' song, over a chorus of the births, kills, and deaths in view. Leave the simulation running and it keeps changing for hours.

No hand steers any of this: every ecological rule is local. The complex interacting colonies emerge from simple rules acting on the mutating genome each cell carries.

## Running it

Open `dist/tidemote.html` in a browser with WebGPU: a current Chrome or Edge, a recent Safari, or Firefox on Windows. It is a single self-contained file with no build step needed to view it. Some browsers block WebGPU on `file://` pages; if so, serve the folder:

```sh
python3 -m http.server -d dist 8000   # then open http://localhost:8000/tidemote.html
```

The public copy lives at [tidemote.com](https://tidemote.com): Cloudflare Workers Builds runs `npm run build:site` (the page copied to `site/index.html` beside `site/_headers` and `site/_redirects`) and `npx wrangler deploy` (`wrangler.jsonc`) on every push to `main`. `site/` also holds `fresh-shaders.txt` (fetched once after a shader change for its `Clear-Site-Data` header, a workaround for Chrome's shader cache; docs/desktop.md "Shader cache"), `robots.txt`, `sitemap.xml`, the touch icon and the link-preview image `og.jpg` (redraw it with `node tools/og-image.mjs`); the page's search and social tags are in `src/page.html`, and a browser without WebGPU (crawlers included) gets a description of the world in place of it.

On start it sizes the universe to your GPU: it times a few frames and fixes the particle count so a frame takes about 10 ms of GPU time (7.5 on phones). It aims for 60 fps (as a whole number of the display's refreshes, so frames stay evenly spaced). If frames later run late, it lowers the render resolution, then the frame rate, taking coarser steps so simulated time keeps pace with real time; it never changes the particle count. See [docs/performance.md](docs/performance.md).

Deep zoom reveals organic detail in cells, minerals and bonds, with a faint, patchy suspension of cosmetic microbial fragments, fibers and grit that follows the water's currents and also appears in the loupe and specimen view.

The view is seen through a microscope (**O** turns this off): clouds of mud drift on the currents and fade in and out of the focal plane, the edge of the field softens and splits color a little, the lamp is slightly off-center, dust sits on the eyepiece and the camera adds grain. The loupe is a glass lens with mild barrel distortion. All of it is cosmetic and costs a few tenths of a millisecond at 4K.

The time control in the dock pauses, steps the speed along ×¼ … ×1, ×1.25, ×1.5, ×2, ×4 … (`,` and `.`), returns to real time (`/`) or runs as fast as the GPU allows (**Max**, `>`, which shows the speed it reaches). Simulated time is paced by real time, after Glenn Fiedler's "Fix Your Timestep!": the vsync-aligned frame timestamps, times the speed, are owed to the simulation, and each drawn frame pays all of it in equal steps of at most about 1/60 s. So ×1 is real time at any refresh or frame rate, and motion stays smooth through dropped frames. At 60 fps and whole-number speeds every step is the headless runs' 1/60 s; otherwise steps are a little shorter. Speeds above ×1 are offered only while the GPU can sustain them (judged from the measured cost of a simulation step and of drawing a frame); a chosen speed that stops fitting becomes Max. A speed the GPU can't reach in 1/60 s steps takes coarse steps of up to 6/60 s, which keep the ecology of normal steps (docs/fast-forward.md), and fast speeds that can't afford to draw every display frame, and Max, draw the world about 30 times a second while the camera keeps the display's rate.

Every world draws its own tide pattern (wave directions, drift and phases), opening light and founding community (96 species, every core niche founded at least twice, and its own share of them random sparks as abiogenesis makes rather than designed body plans). A world starts the way one recovers from a collapse: a little life (2% of the particles) in 48 small colonies in empty water, each colony a different handful of founders, with the predators waking from cysts over the first five minutes once there is prey, so the patches spread into a mosaic of communities rather than one well-mixed contest that a single best competitor wins everywhere (docs/founding.md). Since that leaves the first minute bare, the page runs a new world's first two minutes at Max (about 6 s), with a notice saying why, then returns to real time; choosing a speed ends the warm-up early.

**Settings → Worlds** saves the world to come back to later: every particle and genome on the GPU, with the species' names and lineages, the chronicle, the history and the climate's eras. Saves are kept in the browser (IndexedDB); loading one asks first, since it discards the world running (or saves it first), and each can be downloaded as a `.tidemote` file to open on another device.

Left alone for a minute (three with the specimen panel or one of the Lab's records open), an auto camera takes over and films the world: slow establishing shots of the whole torus, scenes where a survey of the world finds life dense, diverse and busy, long takes following a single organism, and visits to newly established species. Between shots it rises, crosses and descends along a smooth zoom-and-pan path, then drifts and creeps in or out, all trailed through a damped spring so nothing is sudden. When it follows an organism the subject is marked and its body highlighted as if it had been clicked, without opening the panel. A caption at the bottom says what it is doing and why: where it is heading (a hunting ground, a crowd of births, where new variants are being born, a new species) and, once there, the species in view, the organism it follows, or how that one died. Dragging or scrolling the view takes it back where it is (clicking a cell or a species name only opens the specimen panel, and the Lab, folded to its tab while filming, can be opened without stopping it); **A** (or the Auto button) starts the camera moving at once or stops it, the loupe still follows the mouse and hides with the pointer when it rests, and **Settings → Auto when idle** turns the takeover off or on. The survey is an observational GPU pass, like the soundtrack's listening scan.

Now and then a **chronicler** writes what happened into the log, in the voice of an old narrator who has seen many worlds rise and fall and in a warmer color (Lab → Log → Chronicler shows its entries alone): a post-mortem for a species that mattered (what killed it, a hunter it outlived, the line it leaves), a crash or a boom and why, an arms race between a hunting genus and its prey as their signatures drift, a hunter and its prey locked in a cycle of boom and bust, a lineage following the water as it warms, a reign's end, the last of a guild, what an era or one of the pool's events did and to whom. It reads the census and a per-species ledger the GPU keeps for it (births and deaths by cause, who tried to eat whom and how often they ate, where each species' cells gather), speaks only when something notable has happened (a few times an hour at most, and never more than once in 30 real seconds however fast the world runs), and the auto camera goes to look at what it wrote about (docs/chronicler.md). A species' **Card** (in the specimen panel) is a baseball card for it: a portrait of a living member with its kind lit, its numbers and their history, how it lives (diet, body, movement, growth, what it eats and what eats it, its water), its record (origin, genus, mutations, offspring, size, lifespan), its sigil, song, line of descent and the chronicler's latest line about it, on one image shaped like a playing card, to save as a PNG, with its song as a short clip; you can give it a name of your own there, which the world and its saves keep. **Film** (**R**) records thirty seconds of the view, captions and soundtrack included, as a video; with the auto camera on it films the camera's next scene from its start.

The page is laid out as an instrument bench around the world: a status rail along the top (epoch, era, light, tide), the Field Lab column on the left, the specimen panel on the right when something is picked, and a dock of controls along the bottom (time, Auto, Sound, Settings). The Lab opens on its census (what the world is made of, living cells by species, what life eats, how it moves and what its bodies are made of, and the log at the bottom); its other sections (species, lineage, charts, the full log and a field guide) widen the column, and its header folds it to a tab on the left edge (the auto camera folds it too, and runs on when it is opened again). Lengths and speeds are shown in micrometers, taking an ordinary cell to be 10 µm across. Point at the census chart to name a species, click to open it. The specimen panel is one scroll of sections (behavior, body, species, genome) under a bar that jumps between them; its rows keep fixed heights, so live figures change in place without moving what is below them. Panels are built from the shared components in `src/ui.js` (section and block headings, blocks, labeled rows, disclosures) on one spacing scale in `page.css`. On a phone the Lab opens from the dock over the world, and the specimen panel is a sheet that peeks above the dock: drag it up, tap its header or Full record to open it, and drag or tap it back down. The fullscreen button sits at the right end of the status rail where the browser allows it. Press **?** for every shortcut, **V** for settings (display options, and the performance ones: render scale and its auto floor, pixel density, target frame rate, particle count, zoom detail, and the costly effects, with a live readout of fps, GPU time and the resolution drawn) and **K** to fold or open the Field Lab. Click any cell to examine it.

Zooming in reveals twelve families of cell outlines: lobose and filose amoebae, bent radiates,
incised desmids, horned armour, twisted spindles, slippers, chambered whorls, vacuolate crescents,
stalked bells, bead chains and lattice frustules. A cosmetic shape gene chooses the family;
a minority favor forms suited to their mineral, feeding, swimming or bonding traits.
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
| `src/genome.js` | CPU genome helpers: founding archetypes, packing and decoding, colors, affinities, role shares, and diet/mobility guilds. |
| `src/climate.js` | Shared seasons, climate eras and abiogenesis rules. |
| `src/main.js` | The page: calibration, camera, organism tracing, species registry and naming, the census column, settings (display and performance), input. |
| `src/specimen.js` | The specimen panel (a picked cell or grain, or a species opened by name). |
| `src/lab.js` | The Field Lab: species, lineage, census, charts, log and guide. |
| `src/tip.js`, `src/charts.js`, `src/glyphs.js`, `src/fmt.js` | Hints (glossary terms and control hints), census-history charts, species emblems, shared formatting. |
| `src/guide.js` | Glossary (hints) and field-guide text. |
| `src/page.html`, `src/page.css` | Markup and styles. The bundled script is inserted at `/*__SCRIPT__*/`, the styles at `/*__STYLE__*/`. |
| `src/audio/` | The soundtrack: `ugens.js` and `voices.js` (a sample-level port of SuperCollider voices, effects and mastering), `mapping.js` (genome → voice), `motif.js` (genome → song, its description and comparison), `listen.js` (decoding the GPU listening scan), `field.js` (scan → notes and the far swarm), `conductor.js` (pulse, harmony, sea, waves and drone), `score.js` (the long form: each era's ensemble, interludes, the modulation between eras), `worklet.js` (the AudioWorklet), `sound.js` (main-thread controller). |
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
place, and it samples the living cells in view. Each living cell sings: now and then it comes in on
its species' song, more often when it moves. Events are accents: a birth rings, a kill bites,
grazing drips, a dying cell falls, the tide's charge shimmers, and movement rustles.

### Species songs

Every species has its own song, a motif read from its genome (`src/audio/motif.js`), and different
parts of the genome shape different parts of it:

- **Identity.** The α cell type's surface signature (the genes that decide who sticks to and eats
  whom) picks each interval of the line, so relatives sound related.
- **Character.** How the species lives sets the rhythm, tempo, range, intervals, articulation and
  cadence. A fast hunter pounces: a held note, then a quick clipped run of leaps, ending in the
  air, sometimes slipping in a chromatic approach note. A drifting alga sways through long tied
  notes, the thirds of a broken chord, and comes home. Grazers gallop on repeated notes,
  scavengers skitter downward between rests. The rhythm comes from a library of figures, chosen by
  the species' character in coarse steps (so a lineage keeps its rhythm while it drifts) and among
  the closest by its shape gene.
- **Development.** Receptor genes switch transformations of the theme on and off, as a composer
  develops one: inversion, retrograde, displacement, an answering phrase (a step away, upside down,
  echoed an octave up, or held), a grace note. A mutation that crosses one is heard as the parent's
  tune turned upside down, reversed or answered; most mutations move a note or two.
- **Voice.** The archetype picks the instrument family and register, the color the instrument
  (among them a plucked string, a port of SuperCollider's `Pluck`). A bonded colony's β cells sing a
  second voice under the first: a third, fifth, sixth or octave below.

Degrees follow SuperCollider's `degreeToKey`, so `2.9` is the third degree lowered a semitone.

The crowd sings it in time: a cell that sings comes in on the motif's next note, in its rhythm, so
the cells in view assemble the phrase between them. A schooling species keeps one clock and sings in
unison; the others each keep their own and the phrase goes round in canon. Where only a few cells are
heard each sings a longer stretch, so a handful still carries the whole song, and cells coming in on
the same note sing it as one louder note.

The specimen panel shows the song: a piano roll whose notes light as the species sings them (in the
world or from **Play**, which plays it alone while everything else steps back), a description, and
how it differs from its nearest thriving ancestor's song, drawn faintly behind. Each song also has a
sigil, drawn as the organism that sings it: one cell per note in the shape and color of the cell type
that sings it, sized by the note's length and turned by its pitch, packed in the order they sing as a
colony grows and bonded only if the species bonds (the species' emblem in the Lab's species list and the specimen panel;
`tools/sigil-gallery.mjs` shows them beside each species as the sim draws it). **Settings → Song marks** spreads
a faint ring from each cell as it sings: for the picked species (the default), every species, or none.
Like the followed cell's brackets, each mark sits on its cell: the cells about to sing are found by id
on the GPU every frame (`WATCH_WGSL`, observational).

Picking a species (a cell of it, or the species itself) greets it: its song plays once, close and
clear, while the rest of the field steps back, then its cells ease back into the mix over a few
seconds, as do a Lab highlight's. After that the soundtrack is what it would be without the pick: the
listening scan samples the picked species' cells in full (for the song marks and the panel), and the
field weights them back to their real share.

The audio thread watches its own load. Where the device can't keep up (a phone, or any machine once
it heats up and slows down) fewer notes may sound at once and the oldest fade out over a few
milliseconds, so the soundtrack thins instead of crackling. **Settings → Performance** shows the load.

`tools/motif-gallery.mjs --out gallery --legacy` renders a page of songs side by side (founders of
every archetype, lineages of mutants drawn over their parents, sweeps of one trait at a time, each
with a recording and, with `--legacy`, the old generator's line) and prints how alike they are.

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
a Lab highlight pushes the others back. Songs and accents keep a pulse that follows the simulation's speed:
slower when time is slowed, faster (up to 4×) when it runs fast; the score quickens by only the square
root of that, so sped-up time is heard without the score turning into a blur. Life sparking from silt
rings as a short shower of chord tones, a different figure each time and only a few a second; between
showers a spark is a single soft grain.

Around the cells plays a slower score. Each climate era brings its own ensemble, two of nine layers
the previous era did not play: notes on loops of incommensurate lengths that drift a step now and then,
interlocking vibraphone figures built from the reigning species' motif that mutate a note at a time, a
felt piano breaking chords, dub chords dissolving into echoes, string chords swelling, a far sonar ping
going round a few calls, an echoing synth arpeggio that climbs as the tide rises, a muffled heartbeat
under a reed haze, or a slow chorale of bowed voices each moving to the nearest note. The
season's tide shapes them: as it strengthens they gain voices and brightness, as it slackens they
thin out. Waves wash in more often at high tide and are heard best from afar. A new era is a
modulation: a low piano chord sinks into a long reverb while strings swell on a chord the old and
new keys share, then resolve into the new key, and a piano interlude develops the reigning
species' motif in its own rhythm. Interludes also mark a new reigning species and the height of a season. Nothing
glides: the sea and the drone change pitch by fading a new voice in over the old.

Every world has its own music. A seed drawn with the world (and kept when it is saved) picks the key
and mode it opens in, its first ensemble, the figure it opens on, and one of six overtures: a low
chord and a string swell, long tones entering one by one, a mallet figure gathering speed, an
arpeggio climbing into a held chord, a felt piano alone, or chord stabs dissolving into the echoes.
With each era's name it also picks that era's key, ensemble, progression, loops and calls, so an era
keeps its name's mode but not the same arrangement in every world. The overture plays over the
warm-up's sped-up first minutes and lands, once real time begins, on the reigning species' motif.

It runs in an AudioWorklet as a sample-level port of SuperCollider voices (see
`tools/audio-parity/`). `tools/listen-capture.mjs` records what the soundtrack hears from a headless
run at several zoom levels, and `tools/listen-render.mjs` renders such a capture offline and reports
loudness and density per view, for tuning without a browser (`--repeat`, `--season` and `--era`
stretch a capture into a long piece with seasons and era changes). `tools/listen-score.mjs` renders a
capture as a new world opening at a given speed (`--warm` ends a warm-up) for several world seeds and
reports how repetitive it is note by note and how different the worlds' openings are.

## How the simulation works

Each frame runs entirely on the GPU:

1. **Resolve** last frame's claims (meals, births, bites) and count each species.
2. **Bin** every particle into a grid with a counting sort and prefix scan, so neighbors can be found in the surrounding 3×3 cells. Each grid cell's living sort ahead of its matter. A cell weighs up to 64 living neighbors exactly and samples the matter (112 neighbors in all) evenly from a random offset, weighting each sample accordingly; strides follow the crowd smoothly between grid-cell centers, so no direction or grid line is favored.
3. **Matter**: silt and husks drift on divergence-free currents, husks decay, and now and then life sparks from silt in the light.
4. **Contact**: each living cell walks every living cell it could touch. Overlapping cells part by velocity and push apart, and cells that touch take on each other's motion, so crowds cannot stack and bodies stay calm.
5. **Life**: only the living are dispatched, indirectly. Each cell weighs particle-life forces from 8-dimensional surface/receptor signatures (summed up to 24 particles within reach and averaged past that, so a crowd drives a cell no harder than a neighborhood), keeps up to two same-species bonds if it is adhesive, photosynthesizes (slowly alone, fully among its own species), pays upkeep, and claims food or a silt grain to divide into.
6. **Heat**: one thread per grid cell carries the water's temperature on the currents, spreads it, adds the heat deposited this step (all upkeep, rotting husks, framboids) and sunlight, and relaxes it toward the climate's background temperature.

Every 20 frames a census is read back: per-species counts and genomes. The CPU uses it to name species and track lineages; it does not steer the ecology. The ecology is shaped only by local rules:

- **Local crowding and shade**: nearby same-species cells raise upkeep (a body's bond partners excepted); living neighbors shade photosynthesis.
- **Local minerals and food**: photosynthesis needs nearby silt, feeding needs nearby prey or husks, and division needs a nearby silt grain.
- **A food web of niches** (docs/ecosystem.md): light enters only through producers; grazers live by biting them; predators hunt animals; scavengers break down every husk (plant litter and carcasses alike), which returns its matter to the water as silt. Steep trade-offs make a mixed diet earn little and photosynthesis pay only those committed to it, cells ignore foods that are a small part of their diet, and eating matter or prey takes being built for it. Light is a flux per area: only photosynthesizers shade, strongly (`shadeP`), so a crowded meadow burns its light in its own upkeep and a grazed one regrows; what an eater cannot assimilate is dropped as dung for the scavengers. Prey flee hunters (`flee`) and hide among dense producers (`plantRefuge`); a fed hunter rests rather than kill (`satiety`, `satietyAt`). Glint, the tide-charged food of earlier versions, is gone: it was free energy that let grazers live without producers.
- **Breeding and dormancy**: cells grow up before they divide (`mature`) and divide only once their young can live a while (`provision`); crowded hunters and grazers get in each other's way (`interfere`); an animal short of food with none in reach may go dormant as a cyst (drawn grayed and still) and wake later (`cyst`), so a guild that crashes with its food returns with it.
- **Honest energy**: energy enters only as light. A body holds energy in proportion to its size: building a child costs it, a death leaves it as the husk, and a kill passes on the prey's body (most to the killer, some left as a carcass) and part of its stored energy, never more. Bonded cells share energy along their bonds, so a body feeds its interior. See [docs/energy.md](docs/energy.md).
- **Catching takes skill**: a cell catches living prey in proportion to how well it is built to eat it (certain only for specialists), so photosynthesizers, grazers and husk eaters rarely kill.
- **Search images**: hunters and grazers catch the species they caught last more readily and often miss unfamiliar prey, so booming species feed their predators while rare ones are spared.
- **Bonds**: adhesive cells keep their partners until they die, change kind or stretch beyond `bondBreak × linkR` (by default 1.25×). Bonds pull both ways and a body's cells take on their partners' motion, so a body moves as one. Empty slots only close a triangle with a partner's partner, so strangers' bodies never fuse; newborns appear beside their mother and start bonded to her if they are the same species. Adhesive species close into tissue whose cells touch and fill out toward the walls they share; less adhesive ones keep open, strung-out bodies (see [docs/tissue.md](docs/tissue.md)). A species whose growth plan says so grows instead as a tree, from its tips, bonded mother to daughter only, at the angles, branching interval, pattern and curl its genes set, so worlds grow filaments, branched fronds, forks, zigzags and spirals beside the packed mats (see [docs/growth.md](docs/growth.md)). Trees with beat genes swim: muscles on each bond run a wave down the body and the water, holding a thin body harder across than along, turns it into thrust; packed bodies can bud beating tails that push the whole body, as fast as the tail is long and quick for the body's size. Bodies grow by division, share upkeep, shade each other less, and resist attack through armor.
- **Heat**: every cell's spent energy warms its own water, so life makes most of the temperature pattern. Each species has a preferred temperature and a tolerance (narrow specialists work best at their optimum); performance scales photosynthesis, digestion and swimming, swimmers steer toward water that suits them, far too cold is torpor and far too hot scalds. Heat-makers burn extra energy to warm themselves and their neighborhood. Pyrite framboids crystallize in cool piles of rotting husks and warm their water until they burn out, warm water rots husks faster, and the climate's temperature walks from era to era with heat waves and cold snaps. See [docs/thermal-energy-2026-10-07.md](docs/thermal-energy-2026-10-07.md).
- **Phototaxis**: a gene lets a cell push itself up the light's slope, or down it into the dim water, a motility of its own paid for in upkeep, so even drifting producers follow the travelling bands of light and grazers and hunters follow them; some producers evolve to shun the light and the grazers gathered there. See [docs/phototaxis.md](docs/phototaxis.md).
- **Stone**: each world has its own bedrock outcrops, and settled calcifying cells may leave their skeleton as stone, mostly beside stone already there, so reefs grow from rock. Stone never drifts and only calcifiers can settle on it; attacks made from among it sometimes miss. Loose stone wears away fast and packed stone slowly, while a neighborhood that is mostly reef wears fast, so reefs grow as separate patches and the world never turns to stone.

Silt in the light sparks into a random new lineage about once every 30 simulated seconds on average, independent of climate eras and population, so a world whose life has died begins again.

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

`--no-eras` disables climate eras; `--sample` and `--print` set simulated-second intervals. JSON contains config, samples (composition, diversity, ledger rates per simulated minute and climate), eras and summary metrics. Metrics requiring observations after 60 seconds are `null` in shorter runs. Shares are fractions of living cells. `--png` renders the final frame with Dawn only; optional `ZOOM=1,4` writes separate zoom images, and `HEAT=0,1,2` the heat map off, as shimmer and as a thermal camera, and `FRAMBOID=1` centers on the densest cluster of framboids. Each sample has a `thermal` block: the background water, the warmth the living feel (p10/p50/p90), their preferred temperatures (mean and spread), the torpid and heat-maker shares and heat deaths per guild. `photoTaxis` gives each guild's mean phototaxis gene and the share carrying it, and `spatial` (once a simulated minute) each guild's `lit`, the mean light where its cells are, beside the world's `litWorld`. `--k '{"heat":0}'` turns heat off. `--help` lists the CLI options.

Add `--aim` to center PNGs on the living cell with the most incoming bonds (a body’s hub),
falling back to the world center if no living cells remain. `--render-bench`
uses GPU timestamps for 180 paused render frames per zoom after warmup, and saves a
`-timing.json` beside the PNGs (requires a timestamp-capable Dawn adapter). Under WSL,
include `ZOOM:W:H` in `WSLENV` when using those variables through `tools/gpu-node.sh`.

Comparison configs accept `k` overrides and an `eras` boolean. Runs use seeds 1 through `--seeds`, run up to `--jobs` children, save each JSON, and print means ± sample standard deviations plus per-seed results. Dawn runs limit lavapipe threads per child; Chromium's SwiftShader manages its own threads. Run the smoke test and unit tests with `npm test`; the smoke test uses Chromium when an executable is available and falls back to Dawn with `--cpu` if it is missing or cannot launch.

## Inspiration

- [Particle Life • Sandbox Science](https://sandbox-science.com/particle-life)
- [Falling-sand game - Wikipedia](https://en.wikipedia.org/wiki/Falling-sand_game)
- [Mote: An Interactive Ecosystem Simulation — Peter Whidden - YouTube](https://www.youtube.com/watch?v=Hju0H3NHxVI)
- [Proximity Structures: Playing around with PixiJS](https://www.hallada.net/2017/08/07/proximity-structures.html)
- [Oblivion GFX — GMUNK](https://gmunk.com/Oblivion-GFX)

## License

Tidemote is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is distributed WITHOUT ANY WARRANTY; see [LICENSE](LICENSE).

The soundtrack's unit generators (`src/audio/ugens.js`, and the band-limited saw in `src/audio/voices.js`) are translated from [SuperCollider](https://github.com/supercollider/supercollider) 3.13.0's server plugins, Copyright (c) 2002 James McCartney and the SuperCollider contributors (MoogFF ported to C++ by Dan Stowell from Java code by Federico Fontana), licensed under the GNU GPL, version 2 or any later version. The voices themselves are translations of tidemote's own SuperCollider score.
