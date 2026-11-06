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
3. A fix on main's last commit: saves made since the ice-as-drawn change (b66a121) could not be loaded.

## Log

- Toxins, first version (flat upkeep): toxins swept the food chain in 40 minutes; grazers evolved the toxin to be
  resistant to their food, and hunters were poisoned out of most worlds (docs/signals.md, What happened). Fixed in
  spirit with a growth–defense tax on everything a toxic cell takes in (`toxTax`).
