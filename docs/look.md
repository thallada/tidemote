# The look

What darkfield illumination and the microscope's camera make of the specimen: a layer of the composite pass
(`fsComposite`, the loupe's `fsLoupe`, and the close-up's `fsPlain`: the specimen viewer and every card's portrait,
mini-cards' too) between the drawn scene and the screen. `src/look.js` holds its tunables and `DARKFIELD`, their
values; `Post.look` (4 vec4s) carries them to the GPU. Settings → Display scales the whole look (Microscope: Off,
Subtle, Normal, Strong, at 0, 0.6, 1 and 1.35 of `DARKFIELD`) and sets its grain (Film grain: Off, Fine, Heavy, at 0,
0.25 and 0.5); `applyLook` in `src/main.js`. Tools set it with `T.look.set(p, strength)` (tunables over Darkfield's)
and `T.look.off()`, and a perf plan's scenario with `look: "on"` or `"off"`.

## Where each part lives

| Stage | Function | Tunables |
| --- | --- | --- |
| Scene light, before the tone curve | `lookScene` | relief (DIC), rims (darkfield), rainbow rims (`prism`: each edge colored by the side it faces), color fringes; halation and veiling flare (from the bloom's blur) |
| Objective | `lensScene`, the field stop in `fsComposite` | shallow focus (`dof`: the optics' depth blur anywhere, not only toward the rim), the field iris |
| Tone curve | `lookTone` | film: AgX's curve mixed in for `tonemap`'s |
| Display, after the gamma curve | `lookGrade` (`lookDisplay` over the water's view) | contrast, black (the darks pressed down), saturation, dye density, grain |

The edge effects read the scene four times a pixel or more apart, so they fade in from 25 to 70 pixels per world
unit (cells several pixels across) and their reach grows with zoom to 3 px. Under a full light or heat map the grade
is mostly held back so the map reads true (`lookDisplay`); the close-up has no maps, bloom or field stop, so it takes
the scene light, the tone curve and the whole grade. The shallow focus and the iris need Optics on.

## How it was chosen

Real micrographs were the reference (Wikimedia Commons: darkfield Spirogyra and Volvox, a darkfield water flea,
Rheinberg and DIC diatoms, DIC ciliates). Measured in Oklab, darkfield photographs have black water (L 0 to 0.085),
cells of L 0.33 to 0.53 and median chroma 0.035 to 0.064; the bare view had water at L 0.23 to 0.26, cells at 0.56
to 0.67 and chroma up to 0.09: gray water and bright, flat, saturated shapes, which is much of what reads as a game.
Membranes in darkfield are lit, near white, while flat insides pass the light; edges in DIC are lit on one side and
shaded on the other; an achromatic objective fringes bright edges purple outside and yellow-green inside.

A temporary bench (a Settings tab with every tunable, presets and 3D LUTs) photographed each candidate across a 256k
world calm and in each pool event and a 512k world, from the whole world to 400 px per unit (`tools/looklab.mjs`, which
runs headless on Linux with `TIDEMOTE_VK=1`), measured per image (cells' chroma spread against the bare view, contrast
of cells over water, levels) and by CLIP's zero-shot score for "darkfield micrograph" over "video game / CG": the bare
view 0.82 to 0.91, darkfield 0.86 to 0.92 (real micrographs 0.995 and over). Darkfield kept 92 % of the species'
color spread and took the water from L 0.23 to 0.17. Its values were then set by eye on the bench.

Switched off or doubled one at a time, each of Darkfield's parts changes the picture far less than the whole look:
the rainbow rims most up close (and not at all from afar), the glow only about bright crowds, color (muted to vivid)
by ±35 % chroma; so they move together under Microscope, with grain alone set apart.

What it costs (RTX 2080 SUPER, 2560×1440 at scale 1, a 256k world; `tools/perf/plans/look.json`): the composite pass
takes 0.1 to 0.3 ms more (2 to 5 % of a GPU frame of about 6.1 ms), most at 150 px per unit; off, nothing measurable.

## Stone

Stone is lit in a pass of its own (`boulder`, from the stone targets `fsStone` leaves: the main view's once into a cache,
`fsStoneCache`; the loupe's and the close-up's each frame, `fsStoneLitMicro`) beneath the cells, into the scene everything
after reads, and once had to come up to the
cells: every grain was ringed by a dark line of even width, which read as a cartoon's ink. It was no shading term but
the antialiasing: a grain's partly covered edge pixels were written alone, over nothing, hiding the grain beneath, and
`boulder` scaled them by that coverage. Switched off term by term (`tools/stonelab.mjs`: one saved world, the same
grains at 25 to 400 pixels per unit, each look), the edge darkening (`tuck`) barely changed the line and hard edges
removed it. What replaced them, after micrographs of sand and diatomaceous earth (Wikimedia Commons: grains in
darkfield glow at their edges; in reflected light they meet in soft shadows that deepen in crevices and vanish where two
lie flush):

- Two passes (engine `pStone`, `pStoneEdge`): each grain where it covers a pixel whole, writing depth, then its edge a
  pixel and a half outside it, blended over the grain or water beneath and behind any higher grain. The color target's
  alpha is the coverage, and past 1 the cobble's order (how high it lies); the surface target blends slope and height by
  coverage and keeps the flags beneath (`boulder` takes an edge pixel's flags and lighting from the grain beside it).
- Each grain's height in pixels (`surf.z`: its cobble's base and its own form, per kind in `mineralSurf`) and
  `stoneShade`: a soft shadow where a cobble lying over this one rises above the line toward the lamp (as from a 45°
  lamp, shorter than the shading's raking light), and ambient occlusion where such cobbles rise all round. A cobble
  under another never shades it, whatever its height.
- A scattering rim (`edge` in the flags' fraction): glass most, chalk and opaque grains a little, more with the look's
  rims.
- Facet lines, ridges, cracks and sutures at least a pixel or two wide, and a facet's slope eased into the next across
  them, so crystals no longer alias into stippled edges up close.
- Each grain's quad sized to its own shape and turned with it (`grainReach`), so the second pass costs nothing net:
  on the RTX 2080 SUPER at 2560×1440 over a dense pile, the stone passes take 1.75 ms at 400 px per unit (1.83 before),
  1.15 at 150 (1.14), 1.27 at 70 (1.07) and 0.55 seen whole (0.34); the composite 0.02 to 0.17 ms more.

Measured on the same frames (Oklab L, a 5-pixel black top-hat), the share of thin dark-line pixels fell by a third
to a half at 70 to 400 px per unit. CLIP (RN50, zero-shot or by image similarity to the photographs) could not tell the photographs from
the renders, before or after, so it judged nothing here.

Seen from afar (the whole world is about 19 px per unit: grains 6 to 9 pixels across), that first version made piles
shimmer as the view moved and stand out over the water. The lines and rims held at a pixel or two covered most of a
grain there, each facet was its own shade a pixel or two wide, and highlights were sharper than a pixel; and with the
seams gone nothing stood for the crevices too fine to resolve, so a pile read as one bright mat. What changed is that
detail finer than a pixel now averages into the grain rather than growing to fill it or flickering in and out:

- `grainLine`: a line drawn wider than its own width keeps full strength up to four times that, then fades as it widens
  (the look up close is unchanged). `grainRim`: the scattering rim widened to a pixel at least and dimmed to keep the light
  it adds.
- Below a dozen pixels across, a grain's facets stop being each its own shade (`facets`) and its form eases toward a
  rounded grain's; `glint` blurs and dims highlights alike on grains under 20 pixels in radius.
- `stoneShade` fades out from 4 pixels of reach to 1.5 instead of stopping at 1.5, and in its place the crevices' shade
  as it would average over a grain: the lower a grain lies in the pile, the darker (`tuck`, from its cobble's order).

`tools/stonelab.mjs --shift 1` photographs each spot with the camera moved by eighths of a pixel and
`tools/stonelab-shimmer.py` measures what still differs between the frames once each is moved back (detail finer than a
pixel, flickering; what changes with the camera still is taken off). Over the densest bedrock with the look on, RMS
levels: the old seams 4.6, 3.8, 3.3 and 2.4 at 19, 25, 35 and 70 px per unit; the first version 5.8, 5.0, 4.4 and 2.8;
now 4.9, 3.9, 3.3 and 2.7, and the pile's mean level 30 where the old seams left 27 and the first version 35.

Sharp and clean, the grains still looked rendered beside the cells: the cells come through the microscope's optics
and the look, and stone was added after them, so it took neither. Now:

- Stone is lit once a frame into the scene under the cells (engine `pStoneLit`, `sceneTex`; scaled by the cells'
  cover so `scene()` still divides it out), and the composite, the bloom, the loupe and the close-up read that. So
  the lens's color fringes and soft rim, the look's darkfield rims, relief, rainbow edges and halation fall on stone as on
  cells (the stone's own scattering rim no longer grows with the look's rims, which now add theirs). The loupe lights
  stone once a pixel instead of once per tap of its fringes and softening.
- Shallow focus over a pile (`lensScene`): bare stone is blurred by how deep it lies, mostly its cobble's place in
  the pile (the stone color target's alpha past 1) and a little its own height there, up to 24 times the look's `dof`
  (about 8 px at 800 px tall, at Darkfield's), full from 2.5 times the focus's start (200 px per unit on most screens):
  the grains on top sharp and those under them soft. A wide blur takes twelve taps, none from a grain lying higher
  (it is in focus, in front). Taken first from height alone and at a quarter of the strength, it did not show (a
  grain's own dome outweighs its place in the pile, so every grain softened alike, slightly); `tools/stonelab.mjs
  --looks nofocus` photographs the same frames with `dof` at 0 to compare.
- Rough outlines (`grainRough`): each mineral grain's outline pushed in by up to 3 % of its radius of noise in its own
  uv (shell 2 %, worn sand and forams about 1 %), each finer octave only where it is wider than a pixel, and on
  some grains a chip broken from one side.
- Grime: a film of slime and mud (olive-brown on bedrock, greener on reef, thinner on diatoms and spicules), most
  on some grains and none on others, thickest toward the outline and in patches; flecks of detritus and a dusting of
  pale silt from about 20 pixels in grain radius. A grain too small for its patches takes their mean.
- Through the look, what was faint and straight-edged on a grain showed as blocks: each crystal face had its own
  shade (now ±5 %; faces differ by how they take the light), quartz's milky clouds and the larger specks were dots cut
  off by their cells' sides (`grainDots` keeps each whole; the clouds are noise), and the surface noise in `boulder`
  and the grime were value noise on a square grid (`stoneNoise`, `grainNoise`: gradient noise on a turned lattice).
- Framboids (`framboidSurf`) take the same: the optics through the lit pass (in focus, as they lie on top: their
  surface keeps the gaps between crystals, not a height), a dull tarnish in patches and a fleck caught between the
  crystals; each crystal's detail sized to its own size on screen (`cpx`, smaller toward the limb, where the lattice
crowds): under several pixels the crystals are drawn as their average, a rounded cluster, the gaps between them never
sharper than a couple of pixels and the glint blurred by a crystal's size (finer, the pattern swam as the view panned
or zoomed).

The grains are drawn a band of depth at a time from the top of the pile down (`stoneBand`, four bands of cobbleZ,
framboids and the selected grain in the first; engine `_drawStone`): what lies under a grain already drawn fails its
depth test before it is shaded. It took the stone passes at 400 px per unit from 2.73 to 2.38 ms, at 150 from 1.50 to
1.37. Feldspar's cleavage risers are `grainLine`s too (finer than a pixel, they came and went as the view zoomed).

Stone lies still, so the main view's is drawn and lit once into a cache and served from it (engine `_stoneStale`,
`fsStoneCache`, then `fsStoneLit` each frame, which puts it under the cells and leaves each pixel's place in the pile
for the composite's focus). The cache is 1.2 times the view on each axis (`STONE_MARGIN`), drawn from where the view
was; it is panned and scaled to the view until the view leaves it or zooms more than 6 % from it (`STONE_ZOOM`), and
drawn again on a new world, a new selection or focus, an exposure or detail setting, and, while the world runs, at most
every half second (`STONE_EVERY`), as grains wear, settle and grow. The loupe and the close-up still draw theirs each
frame (they are small, and move with the pointer). Nothing in it may change with time alone: a framboid's glow no
longer flickers. With it the stone passes average 0.25 to 0.4 ms at any zoom, where they took 0.9 to 3 ms; a frame
that draws the cache again costs the old stone passes on 1.44 times the area (the slowest frames at 400 px per unit
went from 7.6 to 11.7 ms). The GPU lowers its clock when it has less to do, so every other pass reads about 40 %
slower in those runs: compare passes, or whole frames with the clock in mind.

All of it together, against the build before any of this stone work (RTX 2080 SUPER, 2560×1440, the lab's world over
its densest bedrock, `tools/perf/plans/stone.json`, the world running): a GPU frame of 6.06 ms seen whole (6.01 before),
5.97 at 70 px per unit (6.07), 6.01 at 150 (6.14), 5.89 at 400 (6.27), at the lower clock the lighter frames run at;
before the cache they were 6.15, 6.25, 6.23 and 7.05.

## Left out

- Other presets: a cool, desaturated "instrument" look after the interface (it cost a quarter of the species' color
  spread), a 16 mm "film reel" (slide-film LUT, warm halation, heavy grain, a wandering focus) and Rheinberg's
  colored illumination (a blue field and gold insides: at full, every edge rainbow and the whole world gold from
  afar). Only Rheinberg's edge colors stayed, as the rainbow rims.
- 3D LUTs (and `.cube` files), split toning, white balance and focus drift: they reached Darkfield at zero.
- Monochrome LUTs and fluorescence (hues snapped to four dyes): striking, but they erase or remap the species'
  colors, the one thing the colors are for. AgX alone, at full: bright cells run to pastel; it is mixed in at a quarter.
- A skirt of biofilm beyond a grain's outline, softening it over the water (the edge pass and every quad would have
  to reach further), and glass grains seen through to what lies beneath (the stone targets hold the top grain alone).
- Texture inside cells laid in world space: it would slide across moving cells (the shower-door effect).
- Hot pixels, fixed-pattern noise, rolling shutter, interlacing, compression, mains flicker, auto-exposure
  hunting: a real camera's faults, but they read as faults of the viewer's screen or as a broken page.
