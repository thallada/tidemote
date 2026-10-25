# Cell events, animated

Up close, the moments that change a cell used to happen in a single frame: a newborn appeared at full
size beside its mother with a bright flash, a dying cell swapped for its husk, a cyst switched to gray,
an eaten husk vanished. They are now drawn as short animations. All of it is observational: the
ecology is untouched (nothing here is read by `lifeMain` or `resolveCount`).

## How it works

`contactGather` (INBOND_WGSL) already kept a record per living cell in view, by ID (`Sway`: its sway,
squash and packing). The record now also says what the cell is and what has just happened to it,
read from how it changed since it was last seen, in sim time (so the animations hold when paused and
hurry at fast speeds):

- `look`: its kind and role, whether it was seen born, whether it was born a new species, and the
  angle of the last bite out of it.
- `fed`: its fullness, eased (so giving birth or being bitten dims it smoothly), and its raw energy,
  to see the next jump.
- `shift`: a newborn's offset toward its mother.
- `ev`: sim seconds since it was bitten and since it ate.
- `sleep`: how far it has curled up into a cyst, and the bite's size.

`ANIM_WGSL` holds the record and the durations; `animOf` and `ghostOf` (DRAW_WGSL) read it for the
draw. The buffer has `min(n, 2^20)` slots of `SWAY_BYTES`: only cells in view need one.

| Event | How it is seen | Drawn by |
| --- | --- | --- |
| Birth | The daughter buds out of her mother: she starts at 0.3 of her size just inside the mother's rim, joined by a wide neck that pinches off as she grows to full size, overshooting a little (`BIRTH_T`). The far-off birth flash stays for sprites; up close a newborn only glows softly. | `budGrowth`, `drawnPos`, the neck partners in `vsPoint` |
| New species | A mutant daughter (first seen beside her mother's species and none of her own) and life sparked from silt sparkle: fine glints of light twinkle about the rim one after another, drifting out as they fade, and the membrane is a little brighter (`NOVEL_T`). | `pointColor` |
| Death (starved, old, scalded) | The cell is drawn as its ghost: it stops flowing, its color drains, it darkens, shrinks and its membrane wrinkles, then it fades into its husk (`WITHER_T`). | `ghostOf`, `ghostColor` |
| Kill | It flares and swells, then tears open from the rim inward in shreds while its contents spill in droplets that drift out and dissolve, leaving the carcass (`BURST_T`). | `ghostColor` |
| Grazed to death | Withers fast and shrinks more. | `ghostOf` |
| Bite (a producer) | A notch is taken out of its side toward the biter and heals; it flinches (`BITE_T`). | `cellColor` |
| Meal (an animal) | It lunges and swells a little; a food vacuole forms at its front and drifts inward as it is digested (`GULP_T`, `DIGEST_T`). | `animScale`, `cellColor` |
| Mother giving birth | Drawn out toward her daughter for a moment. | the squash spring |
| Cyst / waking | It curls up by degrees: its outline rounds into a disc of the same area and stops flowing, its wall thickens, it grays; waking reverses it (`SLEEP_T`). A cell woken in view does not flash as a birth. | `cellOutline` (`rest`), `spriteOf` |
| Husk eaten or rotted away | It shrinks and fades into the grain of silt it leaves (`EATEN_T`). | `spriteOf` |
| Husk with no death seen (dung, or out of view) | It swells into view. | `spriteOf` |

A ghost needs the record from when the cell was alive, so a cell that died before it came into view
just shows its husk swelling in.

## Filming

`tools/anim/film.mjs` (with `tools/gpu-node.sh`) films the page up close in Windows Chrome from a saved
world, logging the events in view so `tools/anim/crop.mjs` can cut a strip of frames around each one;
`--hunt` jumps the camera to each fresh event and follows it (`tools/anim/hcrop.mjs`). Young worlds
(`--mature 1`, about 90 sim seconds) are full of births; a mature one has more deaths and kills. Film
at `--speed 0.25` or `0.5` to see the steps.
