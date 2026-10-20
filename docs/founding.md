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
grid units, each a community of about `foundMixed` 6 of the `foundKinds` 96 founders; `foundRandom` 0.5 of
the founders are random sparks (`randomGenome`, the CPU mirror of `randomInto`), the rest designed body
plans; `foundHunt` and `foundEach` still shape the founding plan.

Against the old start (524k, 6 seeds each):

| | old, 2-15 min | new, 2-15 min | old, 15-30 min | new, 15-30 min |
| --- | --- | --- | --- | --- |
| Hill 1 | 20.5 | 49.5 | 58 | 59 |
| largest species | 24% | 12.5% | 19% | 17% |
| spatial turnover | 1.8 | 7.1 | 3.7 | 5.3 |
| distinct regional leaders | 2.3 | 15.5 | 4.8 | 11.4 |
| predators | 9% | 4% | 12% | 13% |

The first minute looks sparse: colonies in empty water that spread outward, as a recovery does.

Tried and dropped: dormant animal founders (`foundDormant`, starting as cysts so animals arrive after the
producers) did not keep more predators; designed founders only (sparse) lost predators.
