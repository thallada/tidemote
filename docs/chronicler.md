# The chronicler, species cards and film (2026-10-23)

docs/next-level-2026-10-20.md §4.5 built: natural history written from what the simulation keeps, a card per
species to save and share, and a recording of the view. All of it is observational: nothing here changes what
any cell does.

## What the chronicler reads

The census (every species' population and genome, the guild ledgers) already came back to the page a few times
a real second. The chronicler needed three things more, per species, so the GPU now keeps a **species ledger**
(`SPL_*` in `src/shaders.js`) in `SPL_WORDS` extra words at the end of the ledger buffer, after the claims:

| words | what | written by |
| --- | --- | --- |
| `0`, `SPL_MAP + slot` | the watch map's version, then each slot's watched index + 1 (0: not watched) | the page (`eng.setWatch`) |
| `SPL_CAUSE + slot × 8 + c` | per slot, cumulative: born, starved, died old, eaten, scalded, stranded (dried on the mud or frozen in the ice), encysted, woke | `resolveCount` (born, eaten), `lifeMain` and `cystStep` (the rest); zeroed by `allocSlot` when a mutant or a spark claims the slot |
| `SPL_PAIR + (h × 64 + q) × 2` | for each pair of watched species, eater h and eaten q: tries (every meal opportunity that reached `mealMissed`) and meals (won: a kill or a bite) | `lifeMain` (fine and coarse paths) |
| `SPL_RANGE + slot × 5` | where each species is: sums of (cos + 1) × 127 and (sin + 1) × 127 of x and y around the torus, and a count | `rangeMain`, a sampled pass (at most `SPL_RANGE_SAMPLES` particles, every stride-th from a rotating start) run just before the census that reads it |

Every third census (`SPL_EVERY` in `src/engine.js`) carries the species ledger as `c.spl`. The watch list (64 species:
the established, by numbers, consumers weighted ×3 since they are fewer and make the stories; each keeps its index
while it lives) is the chronicler's, sent to the GPU when it changes. Pair counts are only read across an interval in
which both indices kept their species (the map's version comes back with each copy), and a slot's cause counts only
while its serial is the same at both ends of an interval (a new species' start at zero). The species ledger is never
saved: a loaded world starts it afresh, and `snapshot`/`readState` copy only the ledger's head, so save sizes are
unchanged. Checked against the global ledger (births, starvation, old age, being eaten, scalding all agree to within
the counts of slots reused by new species between reads).

The climate's news comes in as notes: an era begins (`note('era')`), one of the pool's events begins, turns and ends
(`note('event')`), a heat wave or cold snap begins (`note('excursion')`).

## What it tells

Each detector proposes stories with a score (0..1: how notable). Everything is judged against the world's own scale
(shares of the living, the pace of the hour before), because a 131k world logs about a thousand new species and five
hundred extinctions an hour: the counts that look dramatic are its ordinary churn.

| kind | when | score |
| --- | --- | --- |
| collapse | living below 3% of the most ever (≥ 2,000); and life back to a quarter of it | 1.0, 0.8 (forced) |
| guild | the last producer, grazer, scavenger or hunter gone (a guild that had ≥ 0.5% of the living); one back after ≥ 5 min | 0.95 (forced), 0.75 |
| obit | an established species gone that mattered: ≥ 2% of the living at its height and lived ≥ 20 min, or ≥ 8% and ≥ 12 min, or reigned ≥ 5 min, or the viewer named it, or it was the last of a genus of ≥ 4 species over ≥ 30 min. Says what killed it (`whyDeclined`, below), a hunter it outlived, the end of its genus or the line it leaves | 0.5–1.0, less 0.25 when its crash was just told |
| mass | species of weight (≥ 2% at their height) lost in ten minutes: ≥ 5, ≥ 30% of them and ≥ 3× the hour before's pace; named for the event under way | 0.9 (forced) |
| reign | the most numerous species replaced after ≥ 20 min (with why it fell); 2, 4 and 8 hours of one reign | 0.55–0.85; 0.4–0.5 |
| crash | down to a quarter of a peak (≥ 2% of the living, near the highest it has known this hour) within ten minutes, with why | 0.4–0.7 (producers a little less: meadows boom and bust as grazers find them) |
| boom | five times its numbers of ten minutes ago, to a new height and ≥ 5% of the living, and what it is eating | 0.45–0.65 |
| comeback | fell below 5% of a peak (≥ 1.5% of the living) and is back above half of it; whether cysts carried it | 0.65 |
| first | a first for the world, against everything established by its third minute: a guild, bodies, trees, swimming bodies, reef builders, heat-makers, thermophiles, cold-lovers, three cell types | 0.65–0.75 |
| arms | a hunting genus and a prey genus (≥ 150 tries in each window): the catch rate now (the last 6 min) under 0.55× that of 10–20 min ago while the tries-weighted fit of the hunters' receptors to the prey's surfaces (`fitOf`, as `mealMissed` weighs recognition) fell by 0.15; or the reverse, the hunters gaining | 0.7 |
| diet | a consumer of weight (≥ 1% of the living) eating one species for ≥ 75% of its meals (once); that food fallen below 40% of its peak: "X may follow" | 0.4; 0.55–0.65 |
| cycle | a hunter and the species that is ≥ 40% of its meals: three or more prey peaks each followed by a hunter peak within 15 min (zigzag turning points of ≥ 35% on the one-minute series) | 0.7 |
| range | a species of weight (≥ 3%) whose cells gather (circular concentration ≥ 0.45) and moved ≥ a fifth of the world in ten minutes, following its food if that moved alike; broken out of a pocket across the pool; pushed back into one | 0.45–0.6 |
| radiation | a genus with ≥ 6 species newly established in 15 min, ≥ 4 alive, spread over ≥ 3 ways of living (diet, movement, body) | 0.6–0.75 |
| trend | a genus of weight, over 30–50 min: its cells' optimum followed the water by ≥ 5° (the water moving ≥ 4° the same way); its size ×1.3 or ÷1.3; swimming much harder; turned to living in bodies | 0.5–0.6 |
| era | as an era ends: who rose, who fell, the genera of note lost, and its character (a guild's era when that guild's share rose ≥ 0.1; of losses, of new species, flourishing, lean); at most one in 30 min | 0.2–0.75 |
| aftermath | as an event ends: who slept through it as cysts, who flourished, who lost most of its cells, the species of weight it took | 0.55–0.85 (forced) |
| heat | as a heat wave ends: the cells it scalded (≥ 3% of the living) and the species worst hit; a cold snap's cysts | 0.45–0.7 |
| elder, record, reef, spark, succession | the oldest species at 2, 4, 8 hours; the most thriving species ever (≥ 1.15× the record, after 20 min); reef stone half again in 15 min, and its builder; a spark from the silt holding a tenth of the pool; a species overtaking the one it descends from | 0.4–0.6 |

`whyDeclined` reads the deaths over the decline: eaten (and by whom, from the pair ledger: "hunted down by", "grazed
down by"), stranded (dried on the mud as the pool fell, frozen into the ice), scalded (in the heat wave, or by water
past its optimum), starved (a producer in the duckweed's shade, under the storm's sky, in dim light, or crowded out of
it; a consumer after its food died out or dwindled), or old age with births collapsing ("outbred, it seems, by" the
rival of its guild that rose most).

## Its voice

The chronicler speaks as a narrator who has watched many worlds rise and fall, in the spirit of a nineteenth-century
novelist (Dumas was the touchstone): unhurried, grave, now and then given to a reflection at a turn of fortune ("How
swiftly fortune turns", "what is lost is seldom lost for ever"). It never quotes anyone, and its terms stay the
simulation's own: genus, species, cells, hunters, grazers, producers, receptors and surfaces, food. It is always exact
about the facts it tells (names, numbers, durations, causes). Stories of the same kind take their opening turns of
phrase in rotation (`vary`), so a long world does not hear one phrase over and over. A story's first sentence must
stand alone: the auto camera's caption shows only that.

## How rarely

A story is told only if its score clears the bar and the budget allows (`TUNE` in `src/chronicler.js`):

- a budget refilled in simulated time: one story per `storyEvery` (10 min), at most `storyCap` (2) in hand; a story
  needs a score of `need` (0.6) while one is in hand, and only one of `borrow` (0.85) may borrow against the next;
- at least `gapReal` (30 s) of real time and `gapSim` (90 s) of simulated time between stories, so a world at ×64
  does not flood the log (at Max a real hour still holds at most 120 entries, and in practice far fewer);
- the same kind at most every 8 min, the same species at most every 15 (5 for a weightier story or a death), and each
  story's own key (this species' crash, this pair's cycle) far less often;
- nothing in a new world's first 8 minutes but a collapse;
- a story that loses its turn to the gap waits up to 5 min if it scored ≥ 0.6;
- a species the viewer named, or is looking at, counts a little more.

Measured on the GPU page (131k particles, `tools/chronicle.mjs`): 4.7 stories in a simulated hour at ×16 (7 in 90
minutes, among 2,303 other log entries: a crash, three era summaries, the last scavenger's end, two obituaries), 2.7 at
Max (where the real-time gap holds it); era summaries then got stricter (a character and a rise and a fall, at most
one in 30 minutes). The first tuning (one per 6 min,
need 0.55) told 11 an hour at ×8, among them an 8-minute-old species' obituary right after its crash, a food warning
about a species of 344 cells, and "28 genera died out" in an era summary, which is ordinary churn at this size: hence
the weight thresholds above.

The auto camera spotlights a living subject of each story (as it does a new species), with the story's first sentence
as its caption ("From the chronicle").

## Cards

`src/card.js`: `cardData` (pure, the words and numbers) and `drawCard`. A card is shaped like a playing card (660 × 1050, about a
bridge card's proportions, drawn and saved at 2×) and laid out like a baseball card: the name and its way of life in a line; a portrait; a
strip of four numbers (population, share of life, peak, age; or for the extinct, when it died, how long it lived, its
peak); its numbers over its life (a sparkline from the census history, ending at its count now); then two columns, *How
it lives* (diet, body, movement, growth, what it eats most and what eats it most from the chronicler's meal counts, its
thermal niche, swimming) and *Its record* (when and how it arose, genus, mutations from its founder, offspring species,
cell size, lifespan, what it divides at): the specimen panel's Species section and the genome's essentials; then its
song, its line of descent and the chronicler's latest word on it. The portrait takes whatever height that leaves (220 to
380).

The portrait is one frame of the specimen viewer's renderer pointed at the species' largest body or densest patch
(`bestMember` in `src/main.js`, as Find one picks), drawn into an offscreen 1024 × 1024 texture in place of the close-up
for that frame with the page's highlight set to the species alone (its cells lit, the rest dimmed; the viewer's own
highlight comes back the next frame), and read back; the world holds still between finding the subject and drawing it,
and the subject is bracketed. An extinct species keeps the last portrait taken this session, or shows its sigil. The song
clip (`songClip` in `src/audio/sound.js`) is the soundtrack's own worklet in an OfflineAudioContext: the world's key and
era (`reset`), its motif auditioned three or four times over nine seconds (the worklet's `processorOptions.script` plays
messages at set times), normalised to −3 dBFS, as a 16-bit WAV.

A name given on the card replaces the species' name everywhere (`sp.name`, its binomial kept in `sp.binomial`,
`sp.given` set); older log entries follow it (`relabel`), and saves keep it. Clearing the field restores the binomial.

## Film

`src/film.js`: each frame, right after the world's canvas is drawn (its texture still current), the canvas and the
overlay are copied scaled to at most 1080p onto the film's own canvas, the caption (eyebrow, main line, sub) burned in
with its fade and a title (clock and era) in a corner; `captureStream(30)` of that canvas, with the soundtrack's output
when it plays (`sound.stream()`, a MediaStreamDestination on the volume's gain), goes to a MediaRecorder (VP9/VP8 WebM,
or MP4 where only that is offered) at about 0.12 bits a pixel. Thirty seconds, then the browser downloads it. With the
auto camera on, Film arms and starts with the camera's next shot. Hidden on phones (the dock is full), where Settings →
Display carries it.

## Cost

Measured on this repo's Linux box (RTX 2080 SUPER, headless Chromium on Vulkan):

- **GPU.** A handful of atomics where a cell is born, dies, encysts, wakes or tries a meal (the meal's two loads of the
  watch map and one or two adds, only for watched pairs), and `rangeMain` (at most 32k threads, five atomics each)
  before every third census. `tools/sim.mjs --chrome --n 262144 --minutes 8` against main, same seeds: 3.98 and 2.42
  ms a frame before, 4.03 and 2.30 after (within run-to-run noise; the worlds followed the same trajectories). The
  balance gate (32 seeds × 30 min at 32k, Linux Vulkan) against `balance/baseline-32k-30m.json`: every metric "same"
  (lateEffSpecies 112 → 109, p = 0.36; foodWeb 0.97 → 0.91, p = 0.30): the species ledger only counts.
- **CPU.** The chronicler reads the species ledger as it arrives (about 1.7 times a real second) and samples species
  and runs its detectors once per 10 simulated seconds; its seven minute-scale detectors take turns, one a tick, so no
  census pays for them all. At real time, in a 262k world 40 minutes old (some 1,300 species on record): 155 ms of
  main-thread time in 90 s (0.2%), most calls under 0.1 ms, frames steady at 16.7 ms (p99 16.8). At Max, where every
  census is a tick: 1.2 s in a simulated hour (about 1% of the main thread), median 0.8 ms a call, p95 6 ms.
  `createChronicler().tune.prof = {}` times each detector (tools set it through `__tidemote.chron`).
- **Cards and film** cost nothing until asked: a card's portrait is one extra close-up frame (the world held still for
  the two or three frames between finding its subject and drawing it), its song an offline render of nine seconds;
  a film one scaled canvas copy a frame and the browser's encoder.

## Tools

- `node tools/chronicle.mjs --n 131072 --minutes 60 --speed 16` (with `TIDEMOTE_VK_LAYER` on Linux): the built page run
  to a simulated time, its stories, how many an hour, and every candidate it weighed by kind with its best score.
- `tools/ui-audit.mjs` screenshots the card and the Chronicler log filter; `tools/ui-check.mjs` opens a card from the
  specimen panel, names the species with Enter, closes it with Esc, and films with R. Both run headless on Linux with
  `TIDEMOTE_VK_LAYER`.
