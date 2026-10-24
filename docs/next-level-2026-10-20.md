# What would take Tidemote to the next level, 2026-10-20

A long look at the project as it stands, a diagnosis of where its ceiling sits, a field of options, and
the six avenues judged strongest, each with a rule sketch, what it would need from the code, what to
watch for and what could go wrong. Written in the spirit of docs/ecology-ideas-2026-10-02.md and
docs/thermal-energy-2026-10-07.md: a brainstorm to be screened, not a plan already decided.

**The goal, restated.** A wild, teeming scene of life ebbing and flowing and evolving into webs of
interdependent species; fascinating to watch, surprising now and then; and beyond that, something that
says what life is and where we stand in relation to it. Coexistence metrics (the gate) remain a floor the
work must not break, not the objective (the same stance as the heat design).

---

## 1. What Tidemote is

A sealed torus of up to a few million particles. Matter is conserved exactly: every particle is silt,
a cell, a husk, stone or a framboid, and only changes form. Energy enters only as light (and a little
as framboid heat) and leaves as heat. A genome of 52 words sets three cell types, each with an
8-dimensional surface and receptor signature (particle-life forces), a developmental Markov chain
between the types, radius and personal space, thrust, drag, lifespan, division threshold and child's
share, a three-way diet, photosynthesis, swimming, schooling, current pull, adhesion, calcification,
a thermal optimum and tolerance, heat-making, a six-gene growth plan and a four-gene beat. Every
mutant founds a species; mutation is a Gaussian nudge of every gene with rare structural rewrites (a
cell type reinvented or copied, a growth gene redrawn, adhesion or calcification switched on or off).

Around that core, the rules that make the ecology hold and move, each found by ensemble screening and
recorded with what failed:

- honest energy (bodies cost what they hold, kills pass on no more than the prey had, dung for what is
  not digested), light as a flux per area, bites big enough to clear a meadow, an Allee effect, so
  patches boom, crash and change hands;
- a food web of specialists held apart by steep trade-offs, with search images, recognition
  (coevolution between receptors and surfaces), plant and stone refuges, satiety, interference and
  cysts as the seed bank;
- bodies as tissue or as trees grown from the tips, bonds that pull both ways and share energy, beating
  trees that swim;
- stone: bedrock outcrops and reefs that accrete by short-range help and long-range wear;
- heat as a medium life writes (its spent energy, heat-makers, rot, framboids) and reads (optimum,
  tolerance, thermotaxis, torpor, scalding), with a climate whose temperature walks from era to era;
- abiogenesis from silt, and a founding that copies a recovery from collapse so worlds open as mosaics.

And the observational layer, all of it read-only on the ecology: names and genera, the lineage view,
the chronicle, the specimen panel with a replay of one cell's decision, animated births, deaths, bites
and cysts, microscope optics, the auto camera with captions, saved worlds, and a soundtrack in which
every species sings its genome and every world has its own music.

The craft is the asset. Every rule is local; nothing census-driven steers the ecology; every ecology
change is gated on 32-seed ensembles; the docs say what did not work and why. Everything below assumes
that discipline stays.

---

## 2. Where the ceiling sits

Read as a critic:

**Evolution can tune but cannot invent.** The genome is a fixed vector. Lineages drift through diet,
speed, size, shape and temperature, but no lineage can acquire a capability that was not designed in.
There is one major transition (bonding into bodies) and half of a second: the three cell types differ
only in signatures, colour and drawn size. Diet, photosynthesis, swimming, calcification and the
right to divide are per species, so a body is a clone whose cells all do the same thing. Nothing a body
does is beyond a single cell except being armoured and cheaper to run. Twelve shape families, three
types, five branching patterns: the space of forms is enumerable in advance.

**Interactions come in few kinds.** Eat, be eaten, bond with kin, shade, push, warm. Absent: parasitism,
mutualism, symbiosis, disease, gene flow between lineages, toxins, mimicry. Allelopathy, plague and
scent were screened as rate rules and dropped (docs/ecosystem.md). The lesson taken here: relationships
need to be *evolving entities with genomes of their own*, not multipliers, or they add noise and no
story.

**Cells are reflexes without memory or distant senses.** The one memory is the search image (ten info
bits). A cell senses nothing beyond six cell widths and nothing about the light field's shape: producers
cannot follow the bands they bloom under. There is no signalling and no internal state, so nothing can
look clever, patient or deceptive.

**The world is geographically flat.** No up and down, no shore, no basins, no barriers that open and
close. docs/founding.md found that isolation is what makes the richest worlds (priority effects in
pockets), and then the world mixes freely for the rest of its life. Bedrock covers a few percent and
never moves.

**The drama is real but silent.** The ledgers count who ate whom by guild, every cause of death, every
guild's energy books; the registry keeps every lineage; the survey knows where births, kills and
mutations happen. The chronicle logs eight kinds of event (era, excursion, species established, new
genus, extinction, fallen silent, most numerous, and the five-tone joke). Nobody narrates causes, arcs
or losses. A lay viewer sees colour and motion, not a history, and emergence that goes unnoticed
cannot surprise.

**Nothing persists or is shared.** Each viewer has a private world that dies with the tab. The only
unit of sharing is a `.tidemote` file, and GPU runs are not reproducible per seed, so a seed is not a
world. Two people cannot talk about the same species.

---

## 3. The field of options

Each in a line or two. "Strong" marks the ones developed in section 4.

| | Option | Note |
| --- | --- | --- |
| **Evolution and the organism** | | |
| 1 | Division of labour inside bodies: per-type expression of diet, photosynthesis, swimming, calcification, and which types divide | **strong** (4.2) |
| 2 | Cross-species bonds with an evolvable direction of energy flow: parasites, mutualists, holobionts from one rule | **strong** (4.1) |
| 3 | Endosymbiosis: an eater that keeps a producer it failed to digest becomes a mixotroph carrying the symbiont's colour | second stage of 4.1 |
| 4 | Horizontal gene transfer by contact: tricks jump between lineages, the tree of life becomes a web | interesting; hard on the registry and the lineage view |
| 5 | A small evolvable nerve net per type (senses to actions) with one or two state floats as hormones | powerful, a large kernel change; see 4.7 |
| 6 | Toxins and mimicry on the existing recognition machinery: a costly toxin, an aversion image in the eater, mimics that copy the surface without the cost | cheap and emergent; 4.7 |
| 7 | Size-structured predation: catch chance falls with the prey's size relative to the hunter's | small change, large meaning; folded into 4.2 |
| 8 | Life cycles: a cell type chosen by age, so a swimming larva settles into a sessile adult | solves sessile dispersal (sessile life is near 2%) |
| **Senses and behaviour** | | |
| 9 | Phototaxis, a light-seeking gene mirroring thermotaxis | **strong**, nearly free (4.3) |
| 10 | An evolvable chemical channel on the heat grid: emitted signals whose "colour" is a gene, receptors that respond; alarm calls, lures, deception | 4.7 |
| 11 | Rhythms: oscillator genes phased to the tide; migrations, synchronised spawning | later |
| **World and geography** | | |
| 12 | A water column: light from above falling with depth, sinking husks, a floor | **strong** (4.3) |
| 13 | Dynamic geography: a sea level that walks with the eras, ridges that split the world into basins and reconnect them | **strong** (4.4) |
| 14 | Rare, foreshadowed catastrophes: a dark age, a snowball, a hot spike | **strong** (4.4) |
| 15 | Oxygen: a second field producers write and animals breathe; an aerobic gene; each world replays its own Great Oxygenation | profound, expensive to balance (section 5) |
| 16 | Two nutrients with stoichiometry: producers need what decomposers release | medium; docs/ecosystem.md idea 5 |
| 17 | Life that moves the water: bodies and swimmers entraining currents | nice to have |
| **Watching, telling and sharing** | | |
| 18 | The chronicler: narrated causality from the ledgers | **strong** (4.5) |
| 19 | Species cards: sigil, song, portrait, lineage and a sentence of natural history, exported as an image and a sound clip | **strong**, cheap (4.5) |
| 20 | Replay the tape: fork the running world into two and watch them diverge side by side | **strong** (4.6) |
| 21 | World of the day: one published save everyone continues from the same moment, outcomes aggregated across viewers | the internet-scale form of 20 (4.6) |
| 22 | Film export: thirty seconds of what the director is showing, from the canvas | cheap (4.5) |
| 23 | Intervention tools: a pipette, a lamp, a shade, a dropped founder | engaging; breaks the sealed-world stance, so a decision, not a recommendation |
| 24 | A screensaver build and an embeddable mode | distribution, not a feature |

---

## 4. The strongest avenues

Ranked by visible complexity added, fit with local honest rules, stories generated, what it says, and
cost in this codebase.

### 4.1 One rule for symbiosis and parasitism

**Why.** Cooperation between unlike things is the origin of complex life: the eukaryotic cell, lichens,
corals and their algae, gut floras, and on the other side parasites, which are the most numerous
organisms on Earth and the engine of the Red Queen. The simulation has every part: bonds with a rest
length, energy flowing along bonds toward the poorer cell (`bodyShare`), armour, surface and receptor
signatures, recognition. It only forbids the bond across species.

**The rule.**

- A new gene `graft` (0..1). A cell with `graft > graftMin` may fill one bond slot with a cell of
  *another* species when its receptors fit that cell's surface (the same `sdot` fit `mealMissed` uses
  for recognition) above `graftFit`, and the other cell is within bond range. The grafted-to cell gains
  no slot; the bond is kept by the grafter and pulls both ways as every bond does, so the pair move
  together.
- A second gene `graftFlow` (−1..1) biases the energy flow on a graft: at −1 the grafter takes (energy
  flows to it whatever the host's state, at `bodyShare` × the host's excess over hunger), at +1 it
  gives, at 0 the flow is the ordinary equalising one. Evolution decides which it is.
- The host can resist. A graft breaks when the host's surface drifts out of fit (which mutation does
  anyway) or when the host's `reject` gene (a small upkeep cost, like calcification) passes a check
  each second against the grafter's fit. Hosts therefore evolve away from their parasites exactly as
  prey evolve away from hunters, and parasites follow.
- A grafted cell counts toward the host's armour as any bond partner does (it is in the way), and a
  grafter on a producer is shaded by it as kin would be. So a parasite costs its host and a mutualist
  protects it: the two outcomes come from one gene's sign.
- Eating a grafter attached to a body uses the ordinary meal rules: cleaners that eat parasites need
  only a flesh diet and a search image for them.

**What could emerge.** Parasites on reefs and large bodies (a small cell riding a frond, draining it),
cleaner lineages that live on them, animals carrying their own producers (a hunter with a green
passenger that pays its upkeep in dim water: a mobile coral), producer-and-consumer crusts on stone
(a lichen), chains of grafts. The deeper step, endosymbiosis proper (option 3), is the same machinery
one level down: a cell whose graft to a producer has lasted a lifetime passes to its children a
`symbiont` word carrying the producer's photosynthesis at half strength and its hue, so the lineage
becomes a mixotroph without the trade-off that `photoPow` enforces on a single genome.

**Storage.** The genome's 52 words are full; growing it to 56 bumps `FORMAT` and old saves refuse,
which is acceptable once. A graft needs no new particle state: the bond slot holds it, and the
grafted-to cell's kind differs from the grafter's, which is how every pass can tell a graft from a kin
bond (`keepBond`, the bond-back pass, drawing).

**Tunables.** `graftMin`, `graftFit`, `graftTake` (the rate a taking graft drains at), `rejectCost`,
`graftArmor`. Founders: a few percent of random sparks with `graft` on; designed founders none.

**Watch for.** Mixed-colour bodies; the Lab's body breakdown gaining "with passengers"; the chronicle
saying "X has become a parasite of Y" (a graft lineage whose flow is negative on a host guild) or "Y
and Z now live as one" (positive flow both ways over minutes). The mind view already lists every
species in reach with its role; "host" and "passenger" are two more.

**Risk.** Parasites that drain reefs faster than light refills them; hunters' satiety and armour
calculus shifting; grafts fusing strangers' bodies into one blob (the bond-back pass must still refuse
to close triangles across species). Gate it as a set, and measure parasite load per guild as the thermal
block measures torpor.

### 4.2 Division of labour inside bodies

**Why.** Multicellularity mattered on Earth because cells specialised: a germ line and a soma,
photosynthetic fronds and anchoring holdfasts, mouths and tails. Here every cell of a body does what
every other does, so the only reasons to pay for a body are armour, thrift and shade. With specialised
types, a body becomes an organism whose parts need each other, which is the project's own theme
(docs/ecosystem.md: "every guild fills a niche the others need") brought inside the skin.

**The rule.**

- Each of the three cell types carries an *expression mask*: four unorm bytes in one word per type,
  scaling its photosynthesis, its eating skill, its swimming and its calcification (0..2 of the
  species' value, 1 at the middle). A fifth bit per type says whether the type divides at all.
  Mutation nudges the mask like the developmental matrix; a rare rewrite sets a byte to an extreme.
- The life kernel reads `g.photo`, `eatEff`, `g.swim` and `g.calcify` through the mask of the cell's
  role. Upkeep follows the expressed values, so a frond pays for its light-gathering and a tail for its
  thrust, and the body's energy flows along bonds as it does now. A non-dividing type is a terminal of
  the developmental chain: its row still chooses what it *would* make, and division simply never
  fires, which keeps `sampleRole` and `roleShares` as they are.
- Drawing already differs by role; the organelle layer (chloroplasts for producers, vacuoles for
  eaters, cilia for swimmers) should follow the expressed values, so a body's parts look like what
  they do.

**Pair it with size-structured predation (option 7).** One term in `mealMissed`: an attack on living
prey misses with probability rising as the prey's drawn size over the hunter's passes `gapeRatio`, and
a bonded body counts its partners' sizes toward its own up to a cap. Then being big and being bonded
are *escapes*, size becomes an arms race with a cost (`bodyE` by size already makes big cells expensive
and rich prey), and the chronicle can report escalation: "hunters of the Vorath line have grown a third
larger since the Bitter Hush."

**What could emerge.** Fronds with calcifying bases and photosynthetic tips; swimming colonies with a
propulsive tail of non-dividing cells behind a dividing head (a germ line); grazing bodies with mouths
at the tips and a storage trunk; reefs whose outer layer feeds and whose core calcifies. Trees already
set where each type sits (the developmental chain chooses a daughter's type), so the growth plan and
the mask together are a morphology with function.

**Storage.** Three words (one per type); with 4.1's genes the genome grows to 56 words in one format
bump.

**Risk.** Registers in `lifeMain` (the mask is four multiplies, but the kernel is already at its limit on
some drivers: keep the mask in the `Lite` struct the scan reads, not in the inner loop). Bodies that
specialise into a producer and a predator half, farming their own prey: that is a feature, and 4.1 covers
the cross-species form of it. The gate: expect the body share to rise; set a target.

### 4.3 Phototaxis now, the water column later

**The cheap half.** A gene `phototaxis` (0..1), mirroring `thermotaxis`: a swimmer compares the light
at two points along its heading (the light field is analytic, `tideAt`, so the gradient costs two
evaluations) and steers up it in proportion to its photosynthesis and down it in proportion to its
flesh diet if hunters are near (hiding in the dark). Drifters cannot steer. Then producers drift into
the bands and the whole chain follows the tide in caravans: meadows chasing the light, grazers chasing
meadows, hunters chasing grazers. A day's work, and a visible gain at every zoom. (The ecology ideas
doc listed "mobile producers that follow light" under smaller ones; it was never built.)

*Built (2026-10-23, docs/phototaxis.md), differently:* the gene runs -1..1 and nothing ties its sign to the
diet, so evolution chooses who seeks and who shuns the light. It is a push of its own, not a share of
swimming (producers barely swim), so drifting producers can steer too, and it costs upkeep. The slope
is analytic (the tide waves' gradient, four cosines). Producers sort into the bands at 32k but only
weakly in page-sized worlds, where the bands are wider and faster than they can swim; the animals sort
there, and the tide shows as a wave passing through the mix rather than as caravans.

**The ambitious half.** Give the world an up and a down. The torus becomes a cylinder: wrapping in x,
a surface at the top and a floor at the bottom.

- Light enters at the surface and falls with depth (`photicDepth`, so the lower third is dim), with the
  tide's bands as patches on the surface that light the water beneath them.
- Husks, dung, stone and spent framboids sink at `sinkRate` × a per-kind factor; silt sinks slowly;
  living cells sink according to `1 − advect` unless they swim. So the dead rain down (marine snow),
  the floor is a detritus layer where scavengers and reefs live, the surface is where plankton bloom,
  and benthic life waits for what falls.
- Currents become a circulation: the divergence-free field gains a wall condition at top and bottom
  (stream function zero on both), with one or two upwelling cells per world that carry silt back up
  from the floor. Without upwelling the surface starves of nutrient and the floor drowns in it, which
  is the real ocean's problem and the reason the pattern is legible.
- The heat field gains a surface warmed by the sun and a cold floor; stratification follows and so do
  thermal territories by depth.
- Daily migration emerges on its own from phototaxis plus predation: producers up by the bright tide,
  grazers following, hunters below the meadow's shadow.

**Why it ranks.** It is the one change that makes the picture legible to anyone at a glance, because it
is the ocean everyone already imagines, and it carries a quiet truth: the deep lives on what falls from
the light. It also gives sessile life its niche (the floor) and stone a reason to be where it is.

**Cost.** High. The torus assumption runs through `wrapPos`, the binning, `flowAt`, `tideAt`, the stone
generator, the survey tiles, the director's unwrapped coordinates, the song's panning, and the save
format. Build it as a second *world kind* chosen at creation (`world: 'pond' | 'column'`) rather than a
replacement, with its own baseline and gate; the headless tools already take `--k`.

### 4.4 Catastrophes and moving geography

**Why.** The most important finding in the repo is in docs/founding.md: the richest world measured was
one that had collapsed to 2% and regrown from isolated pockets, and the start now copies that once, at
birth. Earth's diversity was made the same way, repeatedly: five mass extinctions, each followed by a
radiation; continents parting and rejoining; seas rising to make islands and falling to make bridges.
Isolation breeds endemic faunas, reconnection brings invasions and replacements, catastrophe culls the
dominant and reopens the mosaic.

**The rules.**

- *Catastrophes.* The climate draws, about once per `catastropheEvery` (60–120 min), an event with a
  foreshadowing: a dark age (light to 2% for 3–6 minutes, the tide dimming over a minute first), a
  snowball (the water to 0° with a cold snap's easing, torpor everywhere but heat-maker colonies), a
  hot spike (to 40°, scalding the narrow specialists), or a silt storm (a burst of turbulence that scatters
  bodies and buries stone). Each is named in the chronicle as an *extinction event* with a tally after
  it ends: genera lost, the reigning species before and after, the share of life that survived. The
  lineage view already shows a die-off as a stack falling; mark the event as a line across it.
- *Sea level.* Each world keeps a stone *relief* field: the bedrock generator's chains become ridges with
  heights, and the era's `seaLevel` (a random walk like temperature) decides which ridge cells are stone
  this era. Rising ridges are emplaced as stone particles over a minute (grains of silt at the ridge
  turn to bedrock with the usual packing), falling ones wear away at `rockLife` / 10. At low sea level
  the world is two to four basins joined by straits; at high it is open water with islands.
- The straits are where the stories happen: when a basin opens, its endemics meet the others' (the
  chronicle: "the Hollow Gyre opened the eastern strait: Thax kaelum crossed into the west and took the
  grazers' meadows within four minutes").

**What it says.** Deep time, the five extinctions, the tape. Viewers will lose species they named, and
that is the point: the page should let that be felt (a memorial line, the lineage view's stack falling,
the soundtrack thinning to the heat-makers' lifeboats).

**Cost.** Low. `climate.js` for the events and the sea level; the bedrock generator (`inRock`) made
era-dependent and run as a matter pass that converts grains; a `relief` array in the save. The gate
needs a longer horizon to see a catastrophe (60 min ensembles exist) and a metric for *recovery*
(effective species 10 minutes after against before; docs/founding.md's spatial turnover).

**Risk.** A catastrophe that kills every producer in a small gated world, with abiogenesis the only way
back (it is, by design: "a world whose life has died begins again"). Tune the foreshadowing so cysts and
heat-makers carry lineages through, and keep catastrophes rarer at 32k than at page scale if the small
worlds cannot take them.

### 4.5 The chronicler, species cards and film

**Why.** Emergence is only impressive if noticed. Everything below reads data the simulation already
keeps and touches nothing in it.

**Narrated causality.** A CPU module (`src/chronicler.js`, pure, tested like `director.js`) that watches
the census, the ledgers and the registry and writes natural history:

- *Arms races.* The ledger's who-eats-whom by guild, refined to the reigning species of each guild (a
  per-species kill ledger for the top 64 slots is 64 × 64 atomics, cheap): when a hunter's catch rate on
  one prey falls over minutes while that prey's surface drifts from the hunter's receptors (both genomes
  are on the CPU), say so: "Vorath skelis is losing its grip on Thax kaelum: one catch in five now, two
  in five an era ago, as Thax's surface drifts away from Vorath's receptors."
- *Post-mortems.* On an extinction of an established species: its last five minutes of demography (the
  death causes are counted per guild; per species for the top slots is the same 64-slot trick), its
  food's trajectory, and the era: "Thax kaelum starved out of the Bitter Hush after the meadows it grazed
  froze; it had been hunted by Vorath for forty minutes and outlived it."
- *Succession and range shifts.* Survey tiles say where each guild lives; the heat field says how warm;
  a species whose centroid moves with an isotherm gets "followed the warmth north" (the torus has no
  north; "east" and "west" do exist with x).
- *Invasions* (with 4.4) and *partnerships* (with 4.1).
- *Era summaries.* When an era ends: what it changed, who rose, who fell, the genera lost, one sentence
  of character ("a hunters' era"). The director's captions can draw on the same sentences.

**Species cards.** The unit of sharing. One click on a species: a card with its sigil, portrait
(`tools/species-portraits.mjs` already draws one headlessly; the page can draw it to an offscreen
texture the same way), a bar of its song, its lineage back to the founder or spark, its guild, body
plan and thermal niche in words (`describe`, `describeGrowth`, `thermalGuild` exist), and the
chronicler's latest sentence about it. Exported as a PNG and a short clip of its song (the worklet can
render offline; `tools/listen-render.mjs` shows how). A viewer who names a species (a rename field in
the panel, kept in the save) will share its card.

**Film.** A button that records thirty seconds of the canvas with `MediaRecorder` (the director's
captions burned in), at the current speed, to a WebM the browser downloads. The director already knows
when something is worth watching; a "film the next scene" mode records from the start of its next shot.

**Cost.** CPU only. The per-species ledgers are the only GPU change and are observational.

### 4.6 Replaying the tape

**Why.** Would the same world, run again from this moment, come out the same? Contingency against
convergence is the deepest question in evolution, and this simulation can pose it visually in a way no
book can. `tools/fork.mjs` proves the engine can set a world aside and run the same moment forward
under several variants.

**In the page.** *Fork* splits the running world into two engines from one state (the second takes the
GPU budget the page would have used for speed; at Max both run at half pace, which the auto sizing
already handles). The view shows them side by side or as a wipe, with one camera driving both and two
chronicles. Captions note the first divergence ("in the left world Thax took the eastern meadow; in the
right it was eaten out") and, after ten minutes, the chronicler's comparison: the same guilds, different
species? the same reigning lineage? Then *Keep left* or *Keep right*.

**Across viewers.** A *world of the day*: one `.tidemote` save published each day (a Cloudflare Worker
and R2 hold it; the tooling is already there for the site). Everyone who opens it continues from the
same moment. The page reports, with consent, a summary at 10, 30 and 60 minutes (guild shares, the
reigning species' serials, extinctions of named species) to a Worker, which aggregates. The page then
says what happened in other people's worlds: "the reef of Vorath collapsed within the hour in 62% of
worlds; in yours it holds." That is Gould's experiment at internet scale, and a reason to come back
tomorrow. Species named by many viewers become shared characters.

**Cost.** Two engines in one page (the engine is a class; buffers double; the census and the registry
need a world index); the summary endpoint; the daily publish. The fork tool's lessons apply: warm-ups
are not reproducible, so a fork compares two futures of one past, never a replay.

### 4.7 Three smaller pieces worth carrying along

- **Toxins and mimicry** (option 6). A gene `toxin` (upkeep like calcification); an eater that takes a
  toxic cell loses `toxinCost` × its meal and writes the victim's surface into an *aversion image*
  (the search image's ten bits already record the last catch; a second ten bits in the info word are
  free). It then misses prey whose surface fits that image, as it misses the unfamiliar today. Mimics
  follow by selection on the surface alone. The signature *is* the appearance, so mimicry needs no new
  sense; the specimen panel can say "resembles Thax kaelum, which is toxic".
- **A chemical channel** (option 10). The heat pass is a template: a second grid field with two or
  four channels, written by cells with an `emit` gene (which channel, when: fed, hungry, attacked) and
  read by a receptor gene per type that turns a channel's gradient into a pull or a push. The `scent`
  branch did food trails and cost hunters; the difference here is that the meaning of a channel is not
  designed, so alarm, aggregation, lures (a hunter emitting what its prey gathers to) and deception can
  evolve. Screen with a knob at 0.
- **A nerve** (option 5). A per-type matrix of about 8 senses (light, its gradient, warmth, hunger,
  kin density, prey density, hunter density, flow) to 4 gains (swim, turn, align, appetite), plus one
  state float with a decay as a hormone. It is the only option here that makes behaviour open-ended,
  and the mind view is already built to display exactly such a decomposition. It is also the largest
  change to the kernel and the hardest to balance; prototype on the `scent` branch's lessons.

---

## 5. Oxygen: life that changes the world it lives in

The most profound single idea on the list, ranked below the six above only because it rewrites the
economy the gate is built on and needs an hour to pay off.

- A second field, `oxygen`, on the grid: producers write it in proportion to photosynthesis, every
  cell's upkeep and every rotting husk consume it, it diffuses and rides the currents like heat, and it
  relaxes slowly toward an *atmosphere* value that itself integrates the world's net production (the
  one global quantity, but a physical one: a reservoir, not a regulator).
- A gene `aerobic` (0..1). Aerobic cells assimilate at up to `aerobicGain` (1.5–2×: respiration is ~18×
  more efficient than fermentation in life, but the simulation's economy cannot take that) and swim
  faster, in proportion to the oxygen where they are; below `o2Min` they go torpid. Anaerobic cells
  are unaffected by oxygen below `o2Toxic` and scald above it.
- Sparks of life draw `aerobic` from the local oxygen, as they draw `topt` from the local water.

Each world would then replay its own version of the event that made animals possible: anaerobes
dominant at first, producers slowly poisoning the water, a retreat into the anoxic mud (low flow,
rot-rich, under reefs), a tipping point when aerobic lineages take over and predators grow large and
fast on the new energy, and anoxic refuges where the old world survives. The chronicle names the
tipping point. It is heat again, with a one-way history, and the field machinery from 4.7's chemical
channel would carry it. Build it after that channel exists.

---

## 6. How they combine, and an order

- **Deep time** (4.4 catastrophes and geography, 4.5 the chronicler, cards and film): cheapest, most
  story-rich, no new kernel state. Start here. The chronicler should land first, because every later
  mechanism is judged by whether it tells.
- **The organism** (4.1 grafts, 4.2 division of labour with size-limited predation): one genome format
  bump for both, one gate as a set, one release.
- **The light** (4.3): phototaxis at once; the water column as a second world kind when there is a
  month to spend on it.
- **The tape** (4.6): a release of its own and the clearest claim to being something nobody has seen.
- **The medium** (4.7's channel, then section 5's oxygen): the heat field's successors.

Option 23 (intervention) is a decision for the owner: a sealed world watched is one thing, a world
prodded another. If it is wanted, keep it to initial and boundary conditions (a dropped founder, a lamp,
a wall) and never a regulator, and the philosophy survives.

---

## 7. How to judge any of it

The gate is the floor. The objective needs its own instruments, most of which exist:

- *Stories per hour*: how many chronicler sentences of each kind a world produces (arms races,
  post-mortems, partnerships, invasions, extinction events), as `story.mjs` reports guild losses now.
- *Structure*: spatial turnover and distinct regional leaders (docs/founding.md), reef patches, thermal
  territories, and with 4.3 vertical zonation.
- *Novelty*: effective species, the depth of lineages, and with 4.1 and 4.2 the share of bodies with
  passengers or with more than one expressed function.
- *Recovery*: effective species and turnover ten minutes after a catastrophe against before.
- *The look*: the ui-audit screenshots and the director's film, watched. "The metrics cannot tell
  whether it is beautiful" (docs/balance-strategy-2026-10-01.md) is still true.

The thesis that joins all of this is the one the project already lives by: life is what happens when
local rules make their own conditions. Symbiosis, labour, geography, catastrophe and the tape each add
a way for life to make, lose and remake its own world; the chronicler is how a viewer gets to witness
it, and the fork is how they get to ask whether it had to happen that way.
