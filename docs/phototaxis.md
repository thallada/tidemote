# Phototaxis (2026-10-23)

The cheap half of docs/next-level-2026-10-20.md §4.3: a gene that lets a cell follow the light. The water column (an
up and a down) is not part of this.

## The rule

- A gene `phototaxis`, -1..1, in the genome's spare `tail.z` word (`writeGenome` slot 54), so the layout is unchanged
  and old saves load with it at 0. Positive seeks the light, negative shuns it.
- A cell with the gene pushes itself along `lightSlope(p)` (`src/shaders.js`) at `phototaxis × K.phototaxis × perf`,
  added to the motion substeps beside thermotaxis (the same `taxis` vector). The slope is the gradient of the tide's
  raw wave sum, before `tideAt`'s smoothstep cuts the bands off, so it points somewhere even in the dark and across a
  band's saturated middle: four cosines per cell, only for cells with the gene. While duckweed floats, its shade
  (a finite difference of `duckShade`) pushes cells out from under the fronds and the waves' slope fades beneath them.
  Stranded cells cannot steer; cysts do not run this code.
- The push is full strength wherever the waves slope steeply and fades with the slope below `K.photoSoft` (0.3) of the
  steepest the waves can be (the sum of each wave's amplitude times its wave number), so it dies away near a crest.
  See "Lines on the crests" below.
- It is a motility of its own, not a share of swimming. Swimming is scaled by `1 - photo`, so a producer could never
  steer with it; flagellate algae swim to the light, and here a drifting producer can follow the bands.
- It costs upkeep: `K.phototaxisCost × |phototaxis|` in `deriveMetab` (and `finalizeGenome`), either sign.
- Inheritance: mutation drifts it (σ 0.15 m) and now and then gains it (drawn from -0.6..1, mostly toward the light)
  or loses it (`mutateInto`, mirrored in `mutateLike`). Sparks of life carry it 30% of the time (`randomInto`,
  `randomGenome`); designed founders some of the time (`PHOTOTAXIS` in `src/genome.js`: a third of plankton and
  filaments toward the light, a quarter of the animal plans either way; reefs, anchored, never). Its two draws come
  last in each founder, so every other gene's draw is as before.

Nothing decides who should seek or shun the light: evolution does, by what the light brings (photosynthesis for
producers, meadows for grazers, grazers for hunters) and what it costs (the upkeep, and the crowd that gathers there).

## What it does

32k particles, 8 seeds × 15 min each, late samples (t > 2 min). Lift is the mean tide light where a guild's cells
are over the world's mean (headless runs record it once a simulated minute: `spatial[guild].lit / spatial.litWorld`,
and the gene's population-weighted mean and carrying share as `photoTaxis`); seek / none / shun split each guild by
its gene (a one-off analysis during tuning).

| `phototaxis` | eff. species (median) | producer lift | grazer lift | producers: seek / none / shun |
| --- | --- | --- | --- | --- |
| 0 (off, no cost) | 87 | 1.05 | 0.95 | |
| 1 | 97 | 1.07 | 0.98 | |
| 3 | 108 | 1.18 | 1.12 | 1.95 / 1.13 / 1.00 |
| 6 (default) | 121 | 1.16 | 1.11 | 1.63 / 1.05 / 0.66 |

At 1 the push was too weak to matter: a producer's terminal speed (`a × drag / ln 2`) was a few units a minute while
the bands travel tens. At 3 to 6 light-seekers live in the bands (1.6 to 2× the world's mean light), the grazers
follow them there (grazers' lift rises from 0.95 to 1.1, seeking grazers to 1.4 to 1.9), and some producers evolve
to shun the light (0.66× at 6): they give up light to keep away from the grazers that gather in it, the doc's
"hiding in the dark" arrived at by selection rather than written in. Neither sign takes over: about a fifth of
producers and a quarter to a third of animals carry the gene at 15 min, the mean near zero.

The band speed scales with the world (the tide's waves have fixed periods and integer wave numbers across the
torus), so in a page world of a million particles bands travel about five times as many units per second as at
32k and are as many times wider: cells there follow the slope within a band rather than keeping pace with it. At 262k (2 seeds × 12 min each):

| `phototaxis` | eff. species | producers: seek / none | grazers: seek | roam, producers / grazers |
| --- | --- | --- | --- | --- |
| 0 | 79 | | | 1.92 / 2.32 |
| 6 (default) | 84 | 1.04 / 1.13 | 1.25 | 2.39 / 2.95 |
| 12 | 65 | 1.88 / 1.20 | 1.99 | 4.19 / 5.76 |
| 18 | 63 | 1.96 / 1.09 | 2.64 | 5.03 / 7.93 |

Scaling the push with the world would make producers stream with the bands in big worlds too, at a cost in species
a 32k gate cannot see, so it stays 6 everywhere: on the page the animals sort by the light and everything moves about
a quarter more, the tide showing as a wave passing through the mix and stirring the species together.

Coarse steps agree (32k, 8 seeds × 15 min, step 1 / step 4): eff. species 109 / 114, producers seeking at 1.39 / 1.55×
the mean light, grazers seeking at 1.64 / 1.82×, no collapses. The cost is not measurable: the life pass takes
3.6-3.9 µs per thousand living cells against 3.8-4.0 before (262k profile).

## The balance gate

`npm run gate:farm` (32 seeds × 30 min at 32k, `runs/photo-gate`) passes against `balance/baseline-32k-30m.json`:
every metric is the same. Beside main's own last gate without phototaxis (`runs/gate-pool`, the same code
otherwise) nothing differs at p < 0.05: late effective species 102 / 100, Hill-2 32 / 33, leader changes
5.8 / 7.1 (p 0.06, more turnover), the modal outcome's share 0.34 / 0.56 (p 0.06, producer + grazer more often),
food webs 94% / 84%, the living share 0.34 / 0.28. Hunters persisted to the end in 10 runs of 32 before and 4
after: not significant on its own, but worth watching if predators come up again. The short runs' gain in
species (above) does not last to 30 minutes; the species stay as many, and they mix and turn over more.

## Lines on the crests (2026-10-25)

As first written, `lightSlope` normalized the slope to a unit vector right up to the crest. Every seeker was pushed at
full strength until it crossed the crest, then pushed back at full strength. That makes the crest's zero-slope line
an attractor that every seeker in the band collapses onto, whatever its gene's strength, held apart only by packing.
At the peak of the tide the light-seekers stood in ruled lines along the crests, running through the bright patches
and the saddles between them. `K.photoSoft` (0 brings the old rule back) lets the push fade with the slope near a
crest, so seekers settle in a crowd about the crest rather than on it.

262k particles, three worlds grown 10 min under the old rule, each run forward 90 s under each setting from the same
saved state (`runs/photoline`, 5 moments each). These are cells inside a lit band (raw wave sum over 0.35 of its
amplitude), and "on the crest" means the slope is under 8% of its steepest:

| `photoSoft` | seekers on the crest | gene-less on the crest | excess |
| --- | --- | --- | --- |
| 0 (old) | 9.0% | 4.1% | 2.2× |
| 0.15 | 7.4% | 4.1% | 1.8× |
| 0.3 (default) | 6.5% | 4.4% | 1.5× |

Seekers still gather in the bright bands (they should: the crest is the brightest place). They gather in a broader
crowd there rather than a line. The far field is unchanged, so the bands still sweep seekers along and through the mix.

The balance gate (`runs/photosoft-gate`, 32 seeds × 30 min at 32k, photoSoft 0.3) passes, every metric the same:
late effective species 115 (112 baseline), food webs 91%, hunters in the outcome in 8 runs of 32 (4 in the gate
above).

## Where it shows

- The specimen panel's Movement block: Phototaxis, its strength and sign (`specimen.js`).
- The mind replay (`mindMain` slots 64-65, `MIND_HEAD` 68): a Light drive on the compass, and the modes "Following the
  light" and "Seeking shade" when it is a quarter of what moves the cell (`mind.js`).
- The guide: `phototaxis` in the glossary and in How things move.
- The species card's Moves row: "seeks light" or "shuns light" past a fifth of the full gene (`card.js`).
