# How a world starts (2026-10-19)

New worlds used to open crowded and well mixed: about a third of the particles alive at once, 24 designed
founders scattered over the whole world (some in a few loose colonies). Worlds that had collapsed (a long
warm spell, then light down to 10%) and grown back from almost nothing looked far better: many species,
none dominant, a patchwork of communities. This note is why, and the start that now copies a recovery.

## What differs

Measured from two saved page worlds (1.7M and 2.3M particles): a fresh start at 11.5 min, and a world 45
min old that had fallen to 2% life and recovered.

| | fresh start, 11.5 min | after a collapse |
| --- | --- | --- |
| effective species (Hill 1) | 5.1 | 68 |
| largest species | 52% (one calcifying reef) | 14% |
| spatial turnover (whole-world Hill 1 / per-region Hill 1) | 1.4 | 13.4 |
| effective species within a region | 3.5 | 5.0 |
| stone | 12.5% of particles | 0.9% |
| life descended from sparks of abiogenesis | 3% | 36% |

Each region of the recovered world holds about as many species as a region of the fresh one; the
difference is that every region holds *different* ones. Drawn by commonest species, the fresh world is
one carpet, the recovered one a mosaic of single-species patches with open water between them.

In a fresh start every founder competes with every other everywhere from the first second, so the best
competitor of each guild takes the whole world (competitive exclusion, in about 2-10 minutes). The founding
lottery made it worse in that world: 15 of its 24 founders were producers. Every fresh control run showed
the same trough (Hill 1 of 7-16 at 2-8 min); diversity came back only slowly, from mutants and climate eras.

After a collapse the world refills from a few isolated pockets and from sparks, each in its own place. Each
patch is won by whoever arrived there first (priority effects), and patches grow before they meet.

## What causes it (tools/startlab.mjs)

- The recovered world keeps its diversity run on another 20 minutes (Hill 1 68 → 48, turnover 13 → 7).
- Culling the monoculture world to a few percent does **not** by itself reproduce it. A random 98% die-off
  leaves survivors in proportion to abundance, mostly the dominant reef, which regrows (Hill 1 34 at 15-20
  min against 26 uncut, 3 runs). Survivors only in 40 small refuges (one run) gave Hill 1 62, turnover 7.0,
  largest species 13%: like the real recovery. Isolation of the survivors matters, not the die-off.
- Fresh 524k worlds, 2 × 2 × 2 factorial (sparse colonies, random founders, 96 founders; 2-6 seeds per
  arm, 30 min): sparse colonies make the mosaic (turnover ~6 against ~2-4); more and more varied founders
  make the richness; sparse starts with designed founders lose their predators (hunters starve before
  grazers multiply, as in the real recovery, which had none). Mixed colonies (each a small community) with
  half the founders random kept them.

## The start now (DEFAULT_K)

`foundLife` 0.02 of the particles start alive, in `foundColonies` 48 colonies of spread `foundPatch` 3
grid units, each a community of about `foundMixed` 6 of the `foundKinds` 96 founders. Each world draws the
share of its founders that are random sparks (`randomGenome`, the CPU mirror of `randomInto`) uniformly
from none to all; the rest are designed body plans, shaped as before by `foundHunt` and `foundEach`.
Flesh-eating founders start as cysts that cannot wake before a time drawn over the first `foundHuntSleep`
300 s (a negative age; they hold the energy to last it), so they arrive once grazers have multiplied.

Against the old start (524k, 6 seeds each, with half the founders random, mixed colonies and no sleeping
predators):

| | old, 2-15 min | new, 2-15 min | old, 15-30 min | new, 15-30 min |
| --- | --- | --- | --- | --- |
| Hill 1 | 20.5 | 49.5 | 58 | 59 |
| largest species | 24% | 12.5% | 19% | 17% |
| spatial turnover | 1.8 | 7.1 | 3.7 | 5.3 |
| distinct regional leaders | 2.3 | 15.5 | 4.8 | 11.4 |
| predators | 9% | 4% | 12% | 13% |

The first minute looks sparse: colonies in empty water that spread outward, as a recovery does.

## Variety between worlds (the gate, 32k, 32 seeds × 30 min)

With half the founders always random, every world turned into much the same mix of guilds: predators
starved in the first minutes (the producers bloom before grazers multiply) and seldom reached 20% of life,
so 19 of 32 worlds ended "producer+grazer" (`modalOutcome` 0.59 against the target 0.5). The founders'
mix varied plenty; what was lost was predator-led worlds. Two changes brought it back:

| 32 seeds | modalOutcome | outcomes | predators ≥ 20% | predators at 30 min | foodWeb | lateEffSpecies |
| --- | --- | --- | --- | --- | --- | --- |
| old start (main, 2026-10-20) | 0.25 | 5.9 | 13 | 21% | 100% | 116 |
| half random, every world | 0.59 | 3.5 | 4 | 14% | 94% | 104 |
| each world its own random share | 0.28 | 6.1 | 7 | 12% | 91% | 114 |
| predators sleep 300 s | 0.44 | 4.4 | 11 | 19% | 94% | 105 |
| both | 0.375 | 5.2 | 12 | 19% | 91% | 114 |
| both, as committed (final gate) | 0.344 | 4.6 | 15 | | 91% | 106 |

The final gate passes every target. Its weakest metric is `lateGuilds` (3.2 against 3.5 in the baseline
and 3.7 for the old start; p 0.044, not significant once corrected over the gated metrics). At 524k (6
seeds, 30 min) the opening keeps everything above: Hill 1 55 at 2-15 min and 76 at 15-30 (old start 20
and 58), turnover 7.5 and 6.5, largest species 13% and 11%; predators there were 9% at 15-30 min (old
start 12%).

Tried and dropped: dormant animal founders of every diet (grazers slept too, so predators were no better
off); flesh-eaters founded with a tenth or a quarter of the cells (no more predators: they still starved);
48 founders instead of 96 (no more variety); designed founders only in sparse colonies (lost predators).

## The warm-up (the page)

A start this sparse looks bare for its first minute, so the page runs a new world's first two minutes
(`WARM_UNTIL` in `src/main.js`) at Fast (as fast as the GPU goes with the world drawn every frame, so the
colonies spreading show smoothly; it was Max, which draws a frame now and then), with a notice saying why, then
returns to ×1. It begins as the intro goes, so it is seen. Choosing a speed with the time controls ends it (Max to
hurry it, as does the notice's Real time button to skip it), a pause only holds it, and a loaded world never warms
up. The timings below are at Max; Fast spends some of each frame drawing, so it takes a little longer.

It is shown rather than hidden behind the loading bar because hiding would hardly save time. A fresh world
reaching 2:00 at Max (`tools/perf/bench.mjs --plan tools/perf/plans/warm.json`, the page in Chrome, 2560×1440):

| GPU | auto size | 524k | 1M | 2M | GPU time stepping (the rest is drawing) |
| --- | --- | --- | --- | --- | --- |
| RTX 4070 Ti | 6 s (2.6M) | 1.5 s | 3 s | 5 s | 93-95% |
| RTX 2080 Super | 5.5 s (1.5M) | 2.5 s | 4.5 s | 7 s | 91-92% |

The page sizes a world to its GPU, so about 6 s should hold on most devices.

Max takes steps of 4 ticks. Reaching 2:00 that way (`tools/startlab.mjs --warm 120`) leaves the opening as it
is in 1/60 s steps (524k, seeds 51-56, paired per seed): living, Hill 1, largest species, turnover and
guild shares all within a few percent and no significant difference at 2-5, 5-10 or 10-15 min, except 4.5%
(± 3.5%) fewer distinct regional leaders at 2-5 min, gone by 5 min.
