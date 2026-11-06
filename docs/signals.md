# Warning colors: toxins, aversion and mimicry

*2026-11-05, branch `claude-play`.* Color was cosmetic: a species' hue gene drifts by mutation and is what the
viewer sees, but nothing in the world could see it. This makes it the thing eaters learn, so the colors in the
water come to mean something, and a viewer can watch a mimic put on a model's colors.

## The rule

- **A toxin gene**, `tail.w` in the genome (the word was spare, so saves keep their layout; 0 in older saves),
  0..1. It drifts by mutation and is now and then gained or lost (`mutateInto`), like calcification. 15% of sparks
  of life and 15% of founders (hunters aside) carry one.
- **It costs.** A flat upkeep (`toxCost` × metab) and, mostly, a tax on everything the cell takes in (`toxTax`, 0.6:
  light and meals): the plant growth–defense trade-off, which makes a producer pay in proportion to how well it
  lives. Without the tax (upkeep only) toxins swept the food chain (below).
- **Eating it hurts.** An eater that bites or kills a toxic cell throws up `toxHarm` × the toxin of the meal (into
  its gut: the dung scavengers eat) and is sick, losing `toxSick` × the toxin of its energy as heat. What counts is
  the prey's toxin beyond the eater's own: an eater as toxic is resistant (`toxicFor`).
- **It remembers the look.** A poisoned eater keeps the toxic species as its search image, *sick of it* (`sickOf`:
  its image is a species more toxic than itself). While sick it has no search image (it no longer misses the
  unfamiliar), and it passes up living prey whose hue is close to the one that poisoned it (`aversion`, fading over
  `toxHue` of the color wheel; `lookAlike`). A harmless meal makes it forget only now and then (`toxForget`); a
  toxic one replaces the memory at once (`remember`).

So a toxic species is protected by its look: a cell of it dies teaching the lesson, and its kin, which share its
color, are spared. Anything that looks like it is spared too: a harmless species near a toxic one's hue is a
**Batesian mimic**, and two toxic species sharing a hue share their eaters' lesson (**Müllerian**). Mimics weaken a
model's signal (an eater that eats a harmless mimic forgets now and then), so a model gains by drifting away from its
mimics and the mimics by following: a chase around the color wheel.

Eaters cannot see the toxin, only the color; the viewer can: toxic cells keep dark granules in their cytoplasm
when drawn close (`cellColor`, zero-mean like the mottling).

## What the page shows

- The specimen panel: a **Toxic** tag and gauge, and **Resembles**: the toxic species of most weight whose color it
  wears (`mimicModel` in `genome.js`).
- The Lab's Charts: **Warning colors**, every established species on the color wheel at its hue, further out the
  more cells it has; toxic species ringed, with a faint wedge where their look protects. Harmless dots inside a
  wedge are mimics.
- The chronicler (`detectWarnings`): a harmless species whose lineage came to wear a toxic one's colors ("has put on
  the amber of …, though it carries no poison of its own"), two toxic genera sharing one warning, and the world's
  first poisonous species and first poisonous hunter.
- Headless runs: each sample's `toxins` block (`toxinSample` in `ecostats.js`): each guild's mean toxin and toxic
  share, and `mimicShare` against `cover` (the share of harmless cells within half of `toxHue` of a toxic species'
  hue, against the share of the wheel that close): `mimicry`, their ratio. Descent alone puts relatives near each
  other in hue, so compare against `aversion: 0`.

## What happened

First version (upkeep only, `toxCost` 0.016, no tax), 32k × 40 min, 4 seeds: toxic species rose from 4 to 22 in
10 minutes (against 4 with aversion off), then swept the food chain. By 40 minutes producers were 65–100% toxic and
grazers 100% toxic, because an eater as toxic is resistant and grazers evolved the toxin to eat; the hunters, poisoned
by grazers that carried their food's toxin (sequestration, as monarch butterflies do), were gone in three seeds of
four, and grazers held 43–72% of the living. A striking escalation, and an ecological collapse: a producer's upkeep is
small beside its income, so a flat cost let the toxin be nearly free. Hence the tax.

With the tax (`toxTax` 0.3), the gate (32 × 30 min at 32k, `runs/play/gate-tax`): persisted 100%, food web 97%,
no guild lost, the living's share up (0.32 → 0.44) and steadier (CV 0.31 → 0.19), the eight grazer-only worlds of
the baseline gone; but effective species fell 112 → 83 (p = 0.002, **regressed**) and outcomes narrowed (5.8 →
3.0: 15 producer+grazer, 13 producer+grazer+scavenger, one world with hunters against six). Toxins at 30 minutes:
producers 33% toxic, grazers 82%, scavengers and hunters 2%. The grazers carry the toxin as resistance to their
food, which also shields them from hunters. `toxResist` (how much of an eater's own toxin counts against a meal's)
was added to test decoupling the two. Without resistance (0) grazers starved on toxic producers in 11 of 12 worlds;
at 0.5, in 6 of 12: resistance is needed, and stays at 1.

The default is `toxTax` 0.6 (`runs/play/gate-tax06`): the gate passes (no gated metric regressed; persisted and food
web 100%, three worlds in 32 with hunters, leader changes 6.4 → 7.4), but diversity is lower than the baseline's
(effective species 112 → 89, p = 0.007, holm 0.051; Hill 2 38 → 27), the living steadier (CV 0.31 → 0.17) and
the outcomes fewer (5.8 → 3.5, producer+grazer in 18 worlds). At 30 minutes producers are 17% toxic, grazers 43%.
Two hours, 6 seeds × 2 at 32k, aversion on against off (`runs/play/mimic2h`): in the second hour the `mimicry` ratio
averaged 1.22 with aversion (two worlds near 1.9) against 1.05 without: a hint of mimicry, not yet a result (six
seeds, noisy). Without aversion toxins do not pay: in two worlds of six no toxic species was left. With it, mean
effective species over the two hours was lower (71 against 91). To make mimicry stronger and plainer, next ideas:
count how many eaters are sick at a time (a diag slot), narrow the hue's mutation step relative to `toxHue`, and
measure mimicry within a guild (grazers wearing toxic grazers' colors) rather than over all harmless cells.
