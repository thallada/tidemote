# A night of play, 2026-11-05

Branch `claude-play`. Given the desktop and its GPU for a night and asked to do whatever I liked with Tidemote, I
read the design docs (above all docs/next-level-2026-10-20.md), watched the world, and chose things I would want to
play with myself: color that means something, and a way to ask whether a world had to turn out as it did.

## What I built

1. **Warning colors** (docs/signals.md): a toxin gene; eaters it sickens learn the color of what poisoned them and
   pass up anything that looks like it. Color, which was cosmetic, is now what eaters see, so mimics and models can
   chase each other around the color wheel. The Lab's Charts gain a color wheel of the species; the specimen panel
   says Toxic and whom a species resembles; toxic cells keep dark granules up close; the chronicler tells of mimics.
2. **Takes** (docs/takes.md): mark a moment (J), let the world go on, then replay it from the mark under the same
   weather with fresh chance, as often as you like. The Lab's Takes pane draws, per take, a river of who inherits
   the water (the lines of descent alive at the mark) and how alike the takes stay.
3. **Bioluminescence**: toxic cells flash blue-green in dim water as they are bitten or killed (observational).
4. Two bug fixes that matter on main too:
   - saves made since the ice-as-drawn change (b66a121) could not be loaded ("does not match its version"): the
     snapshot kept the whole heat buffer, past `THERMAL_WORDS`;
   - the chronicler never told a story kept to once a world (`keyGap: Infinity`): the world's firsts ("Never before
     in this world…"), life sparked from silt taking a tenth of the pool, a descendant overtaking its ancestor, a
     diet bound to one species, the elders. `toldAt` defaulted to -1e9 and `t + 1e9 >= Infinity` is false.
     A 60-minute chronicle run after the fix still told 2 stories an hour.

## Log

- Toxins, first version (flat upkeep): toxins swept the food chain in 40 minutes; grazers evolved the toxin to be
  resistant to their food, and hunters were poisoned out of most worlds (docs/signals.md, What happened). Fixed in
  spirit with a growth–defense tax on everything a toxic cell takes in (`toxTax`).
- Takes, first looks (262k particles): marked at 5:00 and run 7 minutes, take 2 stayed ~95% alike to take 1;
  marked at 2:10 and run to 15:40, three takes stayed ~90% alike, differing at the margins (one green line
  thriving in one take and not another). At the scale of lines of descent in a large world, ecology outweighs
  chance over a quarter of an hour. Same era boundary in every take, as designed.
- UI audit (l1366, p390) with a Takes state added to tools/ui-audit.mjs: no text under 11 px, no target under
  24 px, no overflow on the Takes pane.
- Bioluminescence: implemented, but I did not catch a flash on film (with the tax, toxic producers were scarce
  where I looked). Unverified visually.
- Gate with the tax (`runs/play/gate-tax`): effective species regressed (112 → 83, p = 0.002) though persistence,
  living share and steadiness improved and no guild was lost; grazers end 82% toxic (resistance to their food),
  which also shields them from hunters (one world in 32 kept hunters, against six in the baseline).
- `toxResist` 0 (an eater's own toxin no defense; stopped after 12 runs): grazers starved on toxic producers in 11
  of 12 worlds (7 producer+scavenger, 3 producers alone, 1 monoculture). Resistance is necessary.
- `toxResist` 0.5 (stopped after 12 runs): grazers lost in 6 of 12 worlds, worse than full resistance. Full
  resistance stays; next, a costlier toxin (`toxTax` 0.6), aimed at the grazers' resistance that shields them.
- `toxTax` 0.6 (`runs/play/gate-tax06`): **passes the gate**, borderline: effective species 112 → 89 (holm 0.051),
  Hill 2 and outcome variety lower, populations steadier; persistence and food web 100%, more leader changes, hunters
  in 3 worlds of 32. Grazers 43% toxic, producers 17%. Made the default.
- Two hours, aversion on against off (6 seeds each): mimicry ratio 1.22 against 1.05 in the second hour (a hint,
  not significant); without aversion toxins vanish from some worlds, so aversion is what makes them pay.
- 6-tick coarse steps (`runs/play/gate-step6`, 32 × 30 min, `--step 6`) against this branch's own normal-step gate
  (`gate-tax06`): every metric the same (effective species 89 → 84, p 0.29; food web 1 → 0.94, p 0.25). The toxin
  rules keep the ecology of normal steps at fast speeds. (32 runs, not the 128 CLAUDE.md suggests.)
- Against a gate of main itself (`gate-main` b66a121, then `gate-learn`, the resistance gene and `toxLearn`):
  passes, every gated metric the same; effective species 103 → 91 (p 0.10); hunters as common (late share 13% →
  11%) but never dominant (≥ 20% in 9 worlds against 2). Two hours (8 seeds each): the same as main, and the arms
  race cycles rather than saturating. 6-tick steps: the same as normal ones. UI audit: nothing new.
- The two bug fixes are on their own branch, `play-fixes` (one commit on main, with a test of the once-a-world
  stories).
