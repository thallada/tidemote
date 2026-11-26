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

The six cells each cell presses on (`touch`) are kept beside its record, row for row with the sway table.
Only half the grid cells in view search for them each frame (a quarter when the tuner asks, `contacts`); the rest take
back theirs, carried through each step's sort by `touchCarry`. A grid cell with a cell that has no contacts from
the last gathering (a newborn first seen) searches anyway, and a bite's or a birth's drop in energy seen on a frame
that did not search is judged on the cell's next frame, which does: no event is missed, at most a frame or three
late (docs/performance.md, Doing less work; `tools/touchcheck.mjs` checks the contacts against a search on the CPU).

`ANIM_WGSL` holds the record and the durations; `animOf` and `ghostOf` (DRAW_WGSL) read it for the
draw. The buffer has `min(n, 2^20)` slots of `SWAY_BYTES`: only cells in view need one.

| Event | How it is seen | Drawn by |
| --- | --- | --- |
| Birth | The daughter buds out of her mother: she starts at 0.3 of her size just inside the mother's rim, joined by a wide neck that pinches off as she grows to full size, overshooting a little (`BIRTH_T`). The far-off birth flash stays for sprites (`BIRTH_FLASH`, 1.2: at 2.5 buds in a mat flared toward an HDR display's peak; `tools/anim/farfilm.mjs` films builds side by side); up close a newborn only glows softly. | `budGrowth`, `drawnPos`, the neck partners in `vsPoint` |
| New species | A mutant daughter (first seen beside her mother's species and none of her own) and life sparked from silt sparkle: fine glints of light twinkle about the rim one after another, drifting out as they fade, and the membrane is a little brighter (`NOVEL_T`). | `pointColor` |
| Death (starved, old, scalded) | The cell is drawn as its ghost: it stops flowing, its color drains, it darkens, shrinks and its membrane wrinkles, then it fades into its husk (`WITHER_T`). | `ghostOf`, `ghostColor` |
| Kill | It flares and swells, then tears open from the rim inward in shreds while its contents spill in droplets that drift out and dissolve, leaving the carcass (`BURST_T`). | `ghostColor` |
| Grazed to death | Withers fast and shrinks more. | `ghostOf` |
| Bite (a producer) | A notch is taken out of its side toward the biter and heals; it flinches (`BITE_T`). | `cellColor` |
| Meal (an animal) | It lunges and swells a little; a food vacuole forms at its front and drifts inward as it is digested (`GULP_T`, `DIGEST_T`). | `animScale`, `cellColor` |
| Mother giving birth | Drawn out toward her daughter for a moment. | the squash spring |
| Cyst / waking | It curls up by degrees: its outline rounds into a disc of the same area and stops flowing, its wall doubles and its granules hold still, it grays; waking reverses it (`SLEEP_T`). A cell woken in view does not flash as a birth. | `cellOutline` (`rest`), `spriteOf` |
| Husk eaten or rotted away | It shrinks and fades into the grain of silt it leaves (`EATEN_T`). | `spriteOf` |
| Husk with no death seen (dung, or out of view) | It swells into view. | `spriteOf` |
| Stone worn away (or a spent framboid) | It cracks into a handful of shards (cells about points spread over its outline) that slump apart, tip and turn, then crumble raggedly from their rims into dust that settles and fades, the middle shard shrinking into the chip of silt it leaves (`CRUMBLE_T`). Seen from afar, the grain shrinks into silt. | `crumbleColor` |

A ghost needs the record from when the cell was alive, so a cell that died before it came into view
just shows its husk swelling in.

Stone needs no record: a grain worn away becomes silt in place, which keeps the grain's color and id (so its kind,
size and turn), the cause (7, or 13 for a framboid), whether it was reef (`CRUMB_REEF`, the role's bit, which silt has
no use for; set in `matterMain`) and its age since. The shards are drawn on that silt in the point pass. The main view
serves stone from a cache lit every half second while the world runs (docs/look.md, Stone), so a grain stays whole
there for a moment after it is gone: the engine passes the cache's last eight lightings (`View.crumble`, when each was
drawn and lit), and `crumbleAt` hides the shards while the cache still shows the grain and starts them when the cache
that let it go was lit. Grain and shards are never both drawn, nor neither. The loupe and the close-up draw stone each
frame and start at once. A grain lying under others crumbles over them (the points are drawn over all stone).

## Filming

`tools/anim/film.mjs` (with `tools/gpu-node.sh`) films the page up close in Windows Chrome from a saved
world, logging the events in view so `tools/anim/crop.mjs` can cut a strip of frames around each one;
`--hunt` jumps the camera to each fresh event and follows it (`tools/anim/hcrop.mjs`). Young worlds
(`--mature 1`, about 90 sim seconds) are full of births; a mature one has more deaths and kills. Film
at `--speed 0.25` or `0.5` to see the steps.
