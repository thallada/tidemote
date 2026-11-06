# Warning colors: toxins, aversion and mimicry

*2026-11-05, branch `claude-play`.* Color was cosmetic: a species' hue gene drifts by mutation and is what the
viewer sees, but nothing in the world could see it. This makes it the thing eaters learn, so the colors in the
water come to mean something, and a viewer can watch a mimic put on a model's colors.

## The rule

- **A toxin gene**, `chem.x` in the genome (a fourth vec4 of chemistry, 0..1). It drifts by mutation and is now
  and then gained or lost (`mutateInto`), like calcification. 15% of sparks of life and 15% of founders (hunters
  aside) carry one.
- **It costs.** A flat upkeep (`toxCost` × metab) and, mostly, a tax on everything the cell takes in (`toxTax`, 0.6:
  light and meals): the plant growth–defense trade-off, which makes a producer pay in proportion to how well it
  lives. Without the tax (upkeep only) toxins swept the food chain (below).
- **Eating it hurts.** An eater that bites or kills a toxic cell throws up `toxHarm` × the toxin of the meal (into
  its gut: the dung scavengers eat) and is sick, losing `toxSick` × the toxin of its energy as heat. What counts is
  the prey's toxin beyond the eater's **resistance** (`toxicFor`).
- **Resistance is a gene of its own**, `chem.y` (10% of sparks and founders carry some): a meal's toxin harms an
  eater only beyond it. It costs an upkeep (`resCost`) and a share of every meal of living prey (`resTax`, 0.3), so
  it pays only where toxic prey is common. An eater's own toxin is no defense (`toxResist` 0). In the first version
  it was the only one, so grazers turned toxic to eat toxic plants and then poisoned the hunters that ate them
  (below); apart, a grazer can eat toxic plants without becoming toxic itself.
- **It remembers the look.** An eater poisoned by a meal carrying more than `toxLearn` (0.2) of toxin beyond its
  resistance keeps the toxic species as its search image, *sick of it* (`sickOf`). While sick it has no search image
  (it no longer misses the unfamiliar), and it passes up living prey whose hue is close to the one that poisoned it
  (`aversion`, fading over `toxHue` of the color wheel; `lookAlike`). A harmless meal makes it forget only now and
  then (`toxForget`); a toxic one replaces the memory at once (`remember`). A trace of toxin (which drifts into many
  species by mutation) costs an eater a little but teaches nothing: before `toxLearn`, over a quarter of eaters could
  be sick at once, each without the search image that keeps predation frequency-dependent.

So a toxic species is protected by its look: a cell of it dies teaching the lesson, and its kin, which share its
color, are spared. Anything that looks like it is spared too: a harmless species near a toxic one's hue is a
**Batesian mimic**, and two toxic species sharing a hue share their eaters' lesson (**Müllerian**). Mimics weaken a
model's signal (an eater that eats a harmless mimic forgets now and then), so a model gains by drifting away from its
mimics and the mimics by following: a chase around the color wheel.

Eaters cannot see the toxin, only the color; the viewer can. Toxic cells keep dark granules in their cytoplasm when
drawn close (`cellColor`, zero-mean like the mottling) and flash blue-green as they are bitten or killed, brightest
in dim water. A sick eater sours toward olive while it stays sick and retches, pale and shrunken, just after a meal
(`spriteOf`); selected, its mind says *Wary of* the prey it passes up (`mind.js`).

## What the page shows

- The specimen panel: **Toxic** and **Resistant** gauges, and **Resembles**: the toxic species of most weight whose color it
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

At 6-tick coarse steps (`runs/play/gate-step6`, 32 runs) the ecology matches this rule's normal-step gate on every
metric (effective species 89 → 84, p 0.29), so fast speeds keep it.

Color, 8 seeds × 2 at 32k × 30 min, the rule against `aversion`, `toxHarm`, `toxSick` 0 (`runs/play/hues`, each
sample's `toxins.hues`), means over the last 10 minutes: effective colors (exp of the entropy of the living's hues in
36 bins) 16.0 ± 3.8 against 16.7 ± 3.0; bins holding 1% of the living 18.2 against 19.8; the fullest bin 24% against
23%; the mean hue vector's length 0.34 against 0.46. Worlds stay as colorful, and each keeps a palette of its own (no
hue is a warning color across worlds). Mimicry did not replicate: 0.97 against 1.48 (the off arm's few toxic species
make its ratio noise). Grazers were half or more toxic in 5 worlds of 8; in 3, toxins had all but gone.

Resistance as a gene of its own (`runs/play/gate-chem`, before `toxLearn`): the gate passes against the October
baseline, effective species 88 (as with the toxin as resistance, 89), the living steadier (CV 0.17), outcomes 4.3
(3.5 before), hunters in 5 worlds of 32 (3 before). In a 65k world at 15 minutes, producers were 29% toxic and
eaters 29% resistant but only 2.6% toxic: grazers no longer turn toxic to eat. But the October baseline is not
main as it stands: main's own recent gates (`runs/ice-gate`, `runs/swimfix/gate-tg`) keep hunters in 11–12 worlds of
32 at effective species 100–112 and CV 0.25–0.28, so the comparison that matters is against a gate of main itself
(`runs/play/gate-main`).

Against main itself (`runs/play/gate-main`, b66a121, then `runs/play/gate-learn`, this rule with `toxLearn` and
the resistance gene, gated against it): **passes**, every gated metric the same. Effective species 103 → 91 (p 0.10,
holm 0.72; every gate of the rule has landed near 90, so the drop is likely real though small), Hill 2 32 → 29, CV
0.25 → 0.22, guilds 3.4 → 3.6, outcomes 5.6 → 4.1. Hunters are not lost but capped: their late share is 13% on
main and 11% here (P(branch > main) 0.46), present (≥ 10%) in 19 worlds against 16, but at ≥ 20% (the outcome
label's "predator") in 9 against 2: no world turns hunter-heavy. Grazers fall (44% → 36% of the living), producers
and scavengers rise (33 → 38%, 10 → 14%: the vomit goes to the gut, which scavengers eat). That is the cascade a
plant defense should cause: resistance taxes grazers, and fewer grazers feed fewer hunters. At 30 minutes the
arms race is still running (toxic producers 21% at 10 minutes, 40% at 30; resistant grazers 10% → 48%).

Two hours, 8 seeds each at 32k (`runs/play/long-learn`, `runs/play/long-main`): the two match (effective species
107 here against 119 on main, p 0.77; Hill 2 30 against 36; leader changes 28 against 26; hunters at ≥ 20% in 4
worlds of 8 against 6), and outcomes vary more (6.7 against 4.0). The arms race does not saturate; it **cycles**.
Toxic producers rise, grazers evolve resistance, the toxin stops paying and falls, then the resistance, which now
buys nothing, is lost too, and the toxin can rise again. In seed 3, toxic producers were 61% → 76% → 3% → 0 → 18%
at 15, 30, 60, 90 and 120 minutes, and resistant grazers 65% → 99% → 93% → 10% → 11%. Seeds 1 and 2 had their
first wave late (72–93% toxic producers at 60–90 minutes, grazers 81–100% resistant by 120). One world (seed 4)
counted as collapsed: in a dark, cold era (light 0.11, water 5–10°) grazers ate down the producers and the living
dipped to 1.8% for a few minutes, then recovered to 14.5k; its producers were 1% toxic then, so that was the
weather, not the toxin (main's own gates lose a world in 16 or so the same way). Colors stayed at 9–27 effective
hues throughout.

At 6-tick steps (`runs/play/step6-learn`, 32 × 30 min against `gate-learn`): every metric the same (effective
species 91 → 93, food web 0.97 → 0.97).
