# Takes: replaying the tape

*2026-11-05, branch `claude-play`.* "Replay the tape of life," Stephen Jay Gould wrote, "and the outcome would be
different." docs/next-level-2026-10-20.md (4.6) proposed letting a viewer ask it of their own world. This is the
smallest form of that: one world, one mark, as many replays as wanted, compared lineage by lineage.

## In the page

- **Mark this moment** (J, or the Lab's Takes pane): the world as it is now is kept in memory, as a save would keep
  it (`encodeCurrent` in `main.js`: the GPU's state and the page's record, gzipped; about 28 MB at 3.4M particles).
  The world goes on: that is take 1. Marking again (Shift+J) forgets the takes of the last mark.
- **Replay from the mark**: the take running is set aside and the world is put back as it was (`openWorld`,
  `loadWorld` quietly), at the speed it was running: take 2, then 3...
- **The same weather, fresh chance.** The page's climate now draws its eras and events from a stream it keeps in its
  state (`climate.rs`, mulberry32, `climate.js`), saved with the world, so a replay meets the same eras, heat
  waves and pool events at the same moments (the raindrops, drawn as frames fall, still take `Math.random`). The
  GPU's dice are salted per take (`eng.chance`, mixed into `sim.seed`): without it a world put back at the same frame
  count would roll the first take's dice again (it diverges anyway, through the atomics' races, but slowly and
  unevenly). Headless runs pass their own stream and are unchanged.

## Comparing takes

New species arise in every take with serials the others also hand out (the counter comes back with the world), so
takes are compared by **stock**: every species is counted under the species alive at the mark that it descends from
(`stockOf` in `takes.js`, through the registry's parents and established ancestors; a line with no way back, such as
a spark of life, counts as other). Sampled every 10 simulated seconds per take:

- **Who inherits the water**: per take, a river of the shares of the living held by the nine stocks that were ever
  largest in any take (the same order and colors in every take, the rest gray), on one clock from the mark. Pointing
  at a band names its line.
- **How alike**: per later take, 1 − Bray–Curtis between its stocks' shares and take 1's at the same moment.
- Per take: the leading line and what the chronicler told since the mark (an earlier take's entries as plain text,
  since its new species' serials now name others).

## Notes

- A take records only what happens after the mark; the world before it is shared.
- A world loaded from Settings → Worlds, or a new world, forgets the tape. The tape is not saved with a world.
- First look (262k particles, marked at 5:00, each take run to 11:40): the two takes stayed about 95% alike, the
  big founding lines holding their ground. Marked earlier, or watched longer, the takes should part further: the
  question the feature asks is exactly how much.
