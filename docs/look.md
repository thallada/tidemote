# The look

What darkfield illumination and the microscope's camera make of the specimen: a layer of the composite pass
(`fsComposite`, the loupe's `fsLoupe`, and the close-up's `fsPlain`: the specimen viewer and every card's portrait,
mini-cards' too) between the drawn scene and the screen. `src/look.js` holds its tunables and `DARKFIELD`, their
values; `Post.look` (4 vec4s) carries them to the GPU. Settings → Display → Look scales the whole look (Microscope:
Off, Subtle, Normal, Strong, at 0, 0.6, 1 and 1.35 of `DARKFIELD`; the eyepiece's optics are on with any of it, off
with it, and O turns it off and back to its level) and sets its grain (Grain: Off, Fine, Heavy, at 0, 0.25 and 0.5)
and its shallow focus (Focus blur: Off, Subtle, Normal, Strong, `FOCUS`: `dof` 0, 0.7, 0.9, 1 and `waves` 0, 0.4,
0.6, 0.8; `dof` 0 turns all of `lensScene`'s softening off, the rim's too);
`applyLook` in `src/main.js`. Glow (Y) is the bloom, and so also the halation and veiling flare drawn from its blur.
Tools set the look with `T.look.set(p, strength)` (tunables over Darkfield's) and `T.look.off()`, and a perf plan's
scenario with `look: "on"` or `"off"`. The tuner may fade the microscope out where frames run late (Settings → Performance →
Adaptation; docs/performance.md), in every live view: the loupe and the live close-up read the main view's post
uniforms, so the look, Glow, Suspension and the tuner's knobs ease in all three at once. A card's portrait (the
close-up not live) reads its own copy (`b.postPlain`) with the look whole and the suspension shown, so it never keeps a
faded look.
On an HDR or wide-gamut display the tone curve's highlights go past white and the composite's last step makes the view
for the canvas's color space (docs/hdr.md).

The loupe and the live close-up are the main view's finish at another view: each draws its cells (with a new
species' sparkle where insides are left out: `_drawScene`'s split), stone, its own bloom (`_bloomChain`, the main
view's chain at its size, from its own scene: in pixels, as the main view's, so the loupe at 90 × 6 glows as the main
view at 540 does) and its own light (`sceneLit`, `litShow` with the living's share from its own living layer,
`sunShadow` at its own scale). What they still leave out: the main view's trails; in the close-up, the eyepiece (the
lens's focus, fringes and field stop, the murk seen through it), the water over it (the sea's bend and focus, the heat
haze, bubbles, ice, the dry floor, duckweed) and the maps, so a specimen reads clearly.

## Where each part lives

| Stage | Function | Tunables |
| --- | --- | --- |
| The world's light, after the tone curve | `sceneLit`, `litGain`, `litShow`, `sunShadow`, `floorLit`, `seaFocus`; silt's `sparkle` (DRAW_WGSL) (Light, below) | none: `LIT_*`, `SHADOW_*`, `FOCUS_*`, `SUN_*` in POST_WGSL, `SPARK*` in DRAW_WGSL |
| The mud in the water | `murk`, `murkLayers`, `murkColor`, `Engine._murkCam` (Murk, below) | none: `MUD_*` in MICRO_FNS |
| Scene light, before the tone curve | `lookScene` | relief (DIC), rims (darkfield), rainbow rims (`prism`: each edge colored by the side it faces), color fringes; halation and veiling flare (from the bloom's blur) |
| Objective | `lensScene`, the field stop in `fsComposite` | shallow focus (`dof`: the optics' depth blur toward the rim and down a pile; `waves`: the blur the passing waves add; Shallow focus, below), the field iris |
| Tone curve | `lookTone` | film: AgX's curve mixed in for `tonemap`'s |
| Display, after the gamma curve | `lookGrade` (`lookDisplay` over the water's view) | contrast, black (the darks pressed down), saturation, dye density, grain |

The edge effects read the scene four times a pixel or more apart, so they fade in from 25 to 70 pixels per world
unit (cells several pixels across) and their reach grows with zoom to 1.5 px; where the optics blur the image they fade
by how far it is spread (Stone, below: the look's edges). Under a full light or heat map the grade
is mostly held back so the map reads true (`lookDisplay`); the close-up has no maps or field stop, so it takes
the scene light, the tone curve and the whole grade. The shallow focus and the iris need the optics (the Microscope on).

The composite's fields (2026-11-13): what the main view's composite needs at each pixel that changes slowly across the
view is worked out first, at half its resolution each way (`FIELD_STEP` in src/engine.js), by `fsField` into three
`rgba16float` targets, and read back between their pixels at the composite's own (undisplaced) position: A the water's
surface's shift and the heat haze's (`shimmer`), B the light there before its tint (`lightPost`) and the lamp's own,
the surface's focusing and height, C the surface's slope (the crests' sheen), the water's temperature and the length of
its slope (all `bubblesNear` asks). The surface is the block that was at the composite's head (`surfaceNear` over the
sea's field from close up, `surfaceAt` otherwise); the light reaches the composite through `litFrom`, the arithmetic
of `sceneLit`, which the loupe and the close-up still call, working everything out inline. The bubbles, the pool's
edge and the maps stay at full resolution, fed the water from field C (the ice has a pass of its own, below). On a
phone's GPU a shader's cost follows what it holds, run or not (docs/performance.md, The step in two kernels):
emulated on a Pixel 3, these out of the composite took it from 4.9 to 2.7 ms.

The ice's look (`iceOver`: `iceLook` and `frazil`, docs/catastrophes.md) has a pass of its own (2026-11-13): `fsIce`
draws it over the main view into an `rgba16float` target before the composite, wherever a composite that adds it draws
(compPick), and the composite adds that texel (`pool.ice` in `poolOver`, under the same weight for what the cells
hide); the loupe works its own out inline and hands it to `poolOver` the same way. At full resolution it is the same
picture (frozen frames: SSIM 0.99998 or more). Where the frame runs late with ice in view the tuner draws it at half
the view's resolution each way (`Engine.fx.iceScale`, the `ice` knob): its lines then spread to a pixel of that
target and dim (`iceRes`), softer rather than broken into dashes, and the grains' edges a little stepped (SSIM
0.97-0.99 at 80 pixels a unit, about 0.88 at fit). docs/performance.md, The ice on a phone.

Shallow focus (`lensScene`, close up: from `start`, about 80 pixels a unit, full from four times that) blurs what
lies off the focal plane, and the sea's waves set how far off that is: the water over a point is deeper under a
crest and shallower under a trough, which moves the plane seen sharp there. The microscopist keeps the selection in
focus while it is in view, else the view's middle (`Engine.focusAt`, `Post.focus`, eased there by the page over about
0.2 s), so a point blurs by how much higher or lower the waves lift the water over it than over that point
(`Surface.height`, the sea's height from its FFT, `seaHeight`, in a storm's rms heights, `seaHeightRms`, as high as
the sea is now: `Post.seaDepth`; read from the sea's field, `seaFieldMain`), plus field curvature toward the rim
(`DOF_CURVE` times the square of the way out to the rim of the eyepiece's round field, the field stop the frame's
corners touch), so the edges are soft more often than the middle. Measured against that field, every screen softens
alike toward its corners: a wide screen's sides lie far out, a phone's near the axis (measured in half-heights, as
until 2026-11, a 16:9 screen's sides were wholly soft and a phone's or a near-square window's barely touched). The tolerance
(`DOF_SHARP`..`DOF_SOFT` at `DOF_PPU`) shrinks as the view is magnified, as fast as the waves' rise across the view
does, so about as much of the view is soft at every zoom: calm water a gentle tilt to the plane that drifts as the
ripples pass, a storm a narrow band in focus sweeping over the view. With no sea (Water → Surface off), only the
curvature. Dry ground has no water over it to focus through: the difference is taken times how wet a point is
(`fsField`, field B's w), so dry ground never blurs with the waves (fading out only the height there left it blurring
by the middle's waves). The look's `dof` scales the blur the curvature alone gives (the edges) and `waves` what the
waves add to it, so their passing can be gentler than the edges (one `dof` scaled both until 2026-11: Strong).
Until 2026-11 the depth was a value noise fixed in the world, unrelated to anything seen: cells blurred
in patches, sharp ones right at the edge beside soft ones in the middle.

Silt and husks take exactly the blur a cell at the same place takes: the waves' and the rim's (a permanent blur of
the floor's matter, tried in 2026-11, kept them soft whatever the waves did and went). Lying on a grain deep in a pile,
they take its blur with it (Stone, below).

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

## Cells

A resolved cell is drawn as darkfield shows a live one (`cellColor` in DRAW_WGSL, 2026-11): only what scatters light.
Measured against 35 darkfield micrographs, real cells have a hairline outline that drops straight to black, a dim,
translucent inside full of sparkles (a few points near white among many faint ones), big smooth organelles dark and
small ones ringed, and pigment in bodies set in from the wall; the cells as they were drawn were opaque, evenly
filled, embossed (a dome lit from the upper left, the nucleus and organelles as bumps and hollows) and outlined by a
thick soft glow, which read as clay or plastic. So (the membrane and the dark body from where a cell first has a shape,
2.8 pixels a radius, the nucleus from 7, the insides' first points from 9, the rest from about 12, `interiorLOD`):

- The membrane is a thin bright line just inside the outline (1.2% of the radius, never under a pixel), mostly a
  pale, cool white with some of the species' color. It is bright on the flank toward `TO_LIGHT` and fades to almost
  nothing on the far one (the square of the flank, every cell lit from the same side), brighter and dimmer in stretches
  along it (a triangle wave of the cell's own frame), and close up wider where it is brighter (0.7 to 1.3 of itself);
  a cyst's or a calcified cell's wall doubled (a second, fainter line inset), a new species' brighter. Where a cell is
  pressed flat against a neighbor the line lies on the outline itself and each cell draws the half on its side, so a
  shared wall in tissue is one line (two parallel lines with a seam between read as stacked stickers). It is drawn
  from 2.8 pixels a radius, where the sprite gives way to the cell's shape, in the lean pipeline too.
- What the line gives, the haze pays for over the whole cell, by the plan's outline against its area (`bodyEdge`, a
  table per plan at 8 and 18 pixels, calibrated by the render test; vsPoint packs it above the area it hands the
  fragment, `geom.y`, so no fragment switches on the plan). The light holds as cells resolve: within 15% of the distant
  sprite for every plan up to 18 px.
- A small cell is a bright ring round a dark middle. From 2.8 px a radius to 7 the line takes the body's light until
  the body is down to its floor (0.2 of the even fill unpigmented, 0.3 pigmented), its share of the whole by the plan's
  outline again (`bodyEdge`, recalibrated for it by the render test's ratios at 8 and 18 px), so the light holds
  exactly while the body darkens. While the cell is small the line is mostly the species' own color (85%), turning to
  the pale cool white (45%) as its insides resolve, and the dark body keeps its tint, so species still part by color
  at mid zoom. From 9 px a radius the ring hands a share of it (`SMALL_POINTS`, 0.25 of the body's light above its
  floor, by 18 px) to the first granules (below), and as the granules show (from 22 px a radius to 40) the rest, the
  body staying at its floor through the hand-over (its floor eased from the small cell's to the granules':
  `bodyFloor`). (The share was 0.45 from 5.6 px while small cells' points were a lattice of their own; with the
  granules carried on from level to level, below, a cell of 18 px holds a dozen points, and more of its light in them
  strayed past the render test's 15%.)
- The inside's light, close up, is its granules. They carry all of the cytoplasm's light but a faint floor: 0.12 of
  the fill in an unpigmented cell, whose floor turns a dim cool grey so the species' color is in its granules and its
  line; 0.25 in a pigmented one, whose floor keeps its color (a try raised these to 0.3 and 0.5 and the close-up turned to
  opaque pastel plates; the dark see-through body read better). The floor thins to 0.6 of itself in a large
  cell (26 to 130 px). The granules lie on a hashed lattice in the cell's own frame (`q`, its stretch along its length
  undone so they are round: stretched, the plastids of the pale producers at the `3-husks` spot, which are living cells
  and not husks, read as glossy streaks; they ride with the cell and never slide across it; `granules`, one hash a
  lattice cell), its rows bent by a slow triangle wave, two lattice cells in three holding a granule of one of three
  kinds: specks (half), soft round dots whose brightness is a steep draw (u⁸: most near invisible, a few bright, the
  brighter the smaller, the very brightest near white); vesicles (3 in 100), rings with dark middles from 0.22 to 0.44
  of a lattice cell; blobs out of focus (15 in 100), broad, soft and dim, kept inside their lattice cell (cut off by
  its sides, they showed straight edges). Most take the body's color; one in twelve is warm (golden) and one in twelve
  cool. They crowd in clusters and bands (two triangle waves across the cell at odd angles) that mottle the floor too,
  and leave a clearer margin inside the wall, its light the floor's (what the margin leaves out, the line's share above
  gives back, by the plan's outline again). Zooming in reveals finer granules between those already shown, which stay
  where they are, and zooming out the newest go first; nothing is replaced at any zoom (`grainSlot`; the same in the
  plain pipeline under `PLAIN_UNTIL` as in the insides', so crossing it changes nothing but the kinds, which ease in
  from it to 48 px). The lattice has levels, 2, 4, 8 ... 64 cells a radius, each showing while its cells are 4.5 to 9
  px across, and a pixel works out one lattice cell of one level. In every lattice cell one of its four children is
  reserved (a cheap hash of the cell): a speck born in a cell sits in the middle part of that child, so when the next
  level takes over the reserved child carries it on, the same speck in the same place at the same size and brightness
  on screen, while the other three children hold new granules. A speck so lives two octaves of zoom: tiny and faint in
  its own cell, it brightens as the cell grows (a smoothstep over the octave), is at its brightest as the next level
  takes over, then in its child grows on and dims as the new specks about it brighten, and is gone as the level after
  takes over. Its size is fixed in the cell's frame (0.16 of its own lattice cell, 0.12 the brightest), so it grows
  with the cell. The new specks rise exactly as the carried ones dim, so what the granules hold of the light stays the
  same; vesicles and blobs, too broad to be carried on, rise and fade within their octave (up by its middle, gone by
  nine tenths), taking a little of the carried specks' share meanwhile. The coarsest two levels draw a speck in every
  cell, its brightness an even draw cubed; from the fourth one cell in two holds a speck drawn steeply. Where a level's
  granules hold less than all of the light (the first, easing in from nothing) the rest is an even haze; where more
  (the first three, whose cells are all specks) they are scaled down; and they are given 1.12 of their share against
  the haze, what the wall's margin and the nucleus cut from a few points against an even haze (calibrated by the
  render test). Past 576 px a radius (the lattice of 64) they hold and only magnify. Until 2026-11-25 each octave was
  a lattice of its own (8 a radius, 16, 32, 64, and 2 and 4 for small cells in the plain pipeline with a gentler
  draw), each handing over to the next while its cells grew from 9 to 12 px, so within a small zoom the whole pattern
  was replaced by an unrelated one (at 11-16, 32-36, 72-96 and 144-192 px a radius), and the points changed character
  at 32 px. Granules in classes drawn together, each class living three octaves, looked as right and were as smooth,
  but cost 15% of the scene pass (three lattice cells a pixel; docs/performance.md). Specks no longer jiggle: two
  triangle waves on the real clock for each cost 9% of the scene pass. In a pigmented cell the specks are its
  plastids, 0.17 of a cell and evener, in its pigment, so producers glow with their color while eaters read darker
  and cooler.
- The nucleus is a dim hollow, from 7 px a radius (its outline from 12), visible mostly because the granules stop at it: its haze halved, a faint dust of
  granules through it, its edge soft and wavering by the cell's seed, a faint outline; pinched in two only while a bud
  is still joined to the cell. Vacuoles and pyrenoids are rings with dark middles, an eater's first vacuole
  contractile (swelling over 8 s, snapping shut); a meal's food vacuole a ring (from 32 px). Hairs and a tail glow
  faintly, pale.

Only optics blur a cell: the lens's soft rim and the shallow focus (Shallow focus, above). (For a while one cell in
four, picked by its seed, was drawn a little out of focus, a softer edge and fewer granules; with no cause in the
optics it read as arbitrary, and went.)

From mid zoom, before 2026-11-24, cells under 22 px a radius were an even, flat fill in their color with a line, and
the close-up's dim body and points came in abruptly as they grew: flat and pastel beside the close-up. A first answer
put a few points in small cells (three triangle waves peaking together) and lifted the close-up's floor to meet
them: the mid zoom read as polka-dotted pastel fills and the close-up went milky, for 4-6% of the scene pass. Now the
ring carries a small cell's light, as darkfield shows one, and the close-up keeps its dark body. Then the ring
shares it with the first granules from 9 px.

The look's relief (DIC) embossed the voids and granules on top of it and was turned from 0.4 to 0.12, and its rims
from 0.45 to 0.3, so the post rim and the cell's own line do not add up to a thick glow (this softens stone's edge
light in the composite a little too). Its four-tap edges (`lookScene`) gave every point of light a cross of colored
fringes, a game's sparkle or holographic foil. They are read at most 1.5 px apart (3 until 2026-11-24: a granule a
few pixels across got its cross well clear of it), and a point of light (brighter than all four taps, with little
gradient) takes neither the rims nor the fringes (they lit every faint granule into a busy glitter and ringed each in
color); Darkfield's rainbow rims went from 0.4 to 0.3 and its fringes from 0.2 to 0.1. (Taking the diagonals on every
other pixel, a checkerboard, gave points a ring instead of a cross but every edge a pixel-scale salt.)
`tools/celllab.mjs` photographs the same cells before and after; `~/.cache/tidemote-refs` holds the micrographs and
`stats.py`, which measures both.

## Bonds

Bonds (each cell's two kept partners, `intent.z`/`.w`) were drawn as tubes in the cells' own color, a neck with
membrane shading and granules streaming, which read as unreal beside darkfield cells. Real colonies are held together
by a handful of things, and in darkfield whatever joins two cells is either flush with them (a shared wall) or far
fainter than they are and colorless (silica and chitin glow a cool blue-white); only a streaming pseudopodial net glows
in the cells' color. So each species' bonds are drawn as one of eight kinds (`BOND_*` in DRAW_WGSL; the micrographs
and what to aim for in each: `~/.cache/tidemote-refs/bonds/README.md`). A visual choice alone: bond physics, sharing
and breaking are the same whatever a bond is drawn as.

`bondKind` picks the kind from both cells' genomes by `tight`, how far the lesser adhesion has closed the body toward
tissue (0 at `tightFrom`, 1 at `tightFrom + tightSpan`):

| Kind | Who | Drawn as |
| --- | --- | --- |
| 0 wall | tissue, `tight` past 0.9 (`BOND_WALL_FROM`) | nothing between the cells (as before); their flattened membranes are the bond (Walls, below) |
| 1 bridge | a body whose cells sit close, `tight` past 0.25 | a faint pale strand a pixel wide; a fine flared neck only across a gap under a cell width (Bridges, below) |
| 2 thread | a loose calcifier (`calcify` > 0.3, `tight` to 0.5) | a faint cool-white glass hair of one width from each cell's pole; no fused neck (Threads, below) |
| 3 pad | long cells (desmid, spindle, slipper: `choosePlan(g, 0)`) | a small blob of clear gel on each cell's end, next to nothing between (Pads, below) |
| 4 hypha | a tree that does not beat (mother to daughter), or a tail that does not | an even pale strand from the mother to the daughter's back pole, a living hypha faintly tinted, a producer's wall strand clear and its daughter in a faint clear cup; no neck (Hypha and stalk, below) |
| 5 stalk | a tree that beats, or a beating tail | a glassy hair far fainter than the bells, a sheath round a darker core up close, kinking (zig-zag or coil) as the beat contracts it; no neck (Hypha and stalk, below) |
| 6 net | a loose eater (grazer, hunter or scavenger) | whitened strands of uneven width leaving as pseudopods, granules streaming both ways in bursts (Nets, below) |
| 7 jelly | a producer (`photo` > 0.55) with the jelly gene (`sheathOf`: then always jelly, and the simulation's wall; docs/ecosystem.md, Jelly) | no line or strip; one hull round the whole body from 20 px a unit: a faint pale cloud from afar, a cool hairline rim close up (Jelly, below) |

Walls and trees come first, then jelly for a producer with the jelly gene; any other body takes one of the kinds its
species qualifies for (a loose producer without jelly that qualifies for none is a bridge), picked by a hash of its
serial so a world shows a mix (a loose calcifying eater with long cells may be a thread, a pad or a net). Until
2026-11-25 no tube was drawn past `tight` 0.5; the bodies between 0.5 and 0.9, mostly producers, are now bridges or
jelly, so bridges show where none did. In grown worlds producers are mostly tissue (adhesion about 0.9) or jelly, and
loose eaters' bodies are mostly trees: worlds differ widely in which kinds they hold (one of 65k particles at an hour
held only walls, threads and pads), and nets and threads stay rare. `bondKindLike` (src/genome.js) mirrors
`bondKind` for tools; change the two together.

Each kind keeps its own functions, dispatched by kind from the shared code (the partner, culling, the cubic
centerline): `bondFarX` the far line's color (`vsLine`, a native line below 30 px cells, crossfading into the strip
from 6), `bondAnchor` where it leaves each cell (offsets from the centers; a bridge's are its centers), `bondVtxX` a strip vertex's
width, light, coverage, shift and payload (`BondSeg` in, `BondLook` out), `bondFragX` its shading (`fsBridge`, the
kind passed flat). Walls and jelly draw no strip at all: their vertices fall outside the view before any shading.
`K.bondLook` (view only, `view.bond`) forces every bond to one kind (0..7; below 0 each species' own).
`tools/bondlab.mjs` photographs the same bodies of a saved world (`runs/bonds/world.bin`, 131k particles grown
90 minutes, which holds every kind) as assigned and forced to each kind, at 50, 150, 300, 800 and 1500 pixels a unit
(the line alone, the crossfade, the strip alone), and lays two builds' side by side (`--compare`);
`tools/perf/cellab.mjs --bond 50,150,300,800` times two builds' scene pass where bonds crowd the view (the kinds'
dispatch cost nothing measurable there on an RTX 4070 Ti: within 1% of the tubes it replaced at every zoom). A bond
within a species, nearly every bond, reads its kind from one word a species (`bondSp`, in the focus buffer from
`BOND_SP_AT`, a binding of its own would take vsPoint past ten storage buffers a stage), which `shapeDirty` reckons
(`bondKinds`) whenever a slot's genome changes, as it bakes its shape again, and for every slot when the tight tunables
change: vsBridge runs bondKind at each of a strip's 30 vertices and vsPoint for each cell's necks, and the genes and
two hashes it took cost the scene pass about 1% (2026-11-25, RTX 2080 SUPER). A bond between two species, or the studio
(whose genomes are its own), reckons it from the genomes (`bondKindOf`).

Necks. Apart from the strip, vsPoint fuses a cell's outline with its bonded kin's where they nearly touch (a smooth
union, fsPoint's partner loop). Which kinds keep it is one table, `NECK_KINDS` (a bit per `BOND_*`, read through
`neckKind` from the kind of the cell's own bonds, `bondKind(p, p)`, worked out once per vertex, a tail's bonds
apart): walls (tissue's cells not yet pressed flat; pressed, a tile meets its kin at a shared wall), bridges and nets
(a pseudopod's base), and not threads (glass holds its cells apart), pads (a union fuses long cells side to side; the
pad is drawn at their ends), trees' strands (Hypha and stalk, below) or jelly. The card portraits (`vsStudio`) follow the same table.

### Walls

Tissue's bond is the wall its cells share, drawn by the cells themselves (Cells, above: where cells press flat the
membrane's line lies on the outline and each draws its half, so a seam is one thin line, as bright as the lit
membrane and brighter than either cell's dim middle, as the darkfield filaments show their cross-walls). Nothing
changed there. From afar the far line between tissue's cells is the bridge's faint one (`bondFarBridge`), so a
filament or sheet reads as a row of bright dots joined faintly, a beaded string, until its cells take shape and the
line goes (`detailLOD`).

### Bridges

Volvox's cytoplasmic bridges are real but short, and at the power a world is viewed at finer than the microscope
resolves: a bridged sheet is evenly spaced bright cells and a faint web (`bondFarBridge`, `bondVtxBridge`,
`bondFragBridge`):

- The far line and the strand it becomes are 0.3 of the old line's light (`BRIDGE_FAR`), keeping 60% of the cells'
  color (`BRIDGE_TINT`, the rest their grey), so from afar a body is its cells and a fine web between them. Up close
  the strand stays a pixel wide (its profile drawn per pixel across a strip two pixels wide) and ends at the
  membranes once the cells resolve, so it never runs through a cell's body.
- Only where the cells nearly touch (centers within 2.8 of the smaller radius, fading out by 3.6: a gap of up to
  about a radius, gone well before a cell width) a neck: flared to 0.2 of the radius where it leaves each membrane (reckoned at 0.7
  of the radius, the flare running on 0.4 of it into the cell, so it meets a lobed or armed outline too), pinched to 0.022 (never under half a
  pixel) between, narrowing with an e-folding of 0.2 of the radius, so a short bridge is a waist and a longer one
  a fine thread of cytoplasm with flared feet. Living, it is never even: each side flares its own width by the pair's
  hash, its edge flows slowly along it (up to `BRIDGE_SPREAD`, 1.6, of the even flare), and the whole neck sways in a
  slow wave pinned at its cells (`BRIDGE_WAVE`, 0.03 of its length; `netWave`). It is translucent: edges a soft glow
  (`BRIDGE_RIM` 0.32 of the cells' light, brighter on the flank toward the light), its inside dim (`BRIDGE_BODY`
  0.045) with granules streaming along it, and it hides only 22% of what lies behind it. (At 0.24/0.06/0.3, lit at
  0.6 and covering 60%, a neck up close was a thick dark band of the cells' color, stiff as a ribbon.) As the cells
  part it narrows into the strand rather than fading to a ghost.
- The outline is drawn per pixel from the bond's length and the smaller radius (aux), so the strip is only as wide
  as the flare; in the saved world most bridges are long, and draw as the strand.

### Pads

Tabellaria and Asterionella are glued at their ends by a small pad of mucilage: a joint, not a line, and the cells do
the drawing. `bondAnchorPad` puts each end of the bond on the cell's tip toward its partner: for a long plan
(desmid, spindle, slipper, bead chain, lattice: `padPoleOf`, the outline's reach along the heading, stretched by
`bodyAspect`) the pole on that side, for any other the edge facing it. `bondVtxPad` runs the strip from tip to tip,
pushed out past each by a blob's radius (`shift`), and `bondFragPad` draws a soft disc of gel on each tip (0.13 of the
smaller radius, never under a pixel; 0.22 of the cells' light), colorless (the cells' brightness in a faint warm
grey: mucilage is clear, nothing glows in the cells' color). Where the ends meet the two discs are one; held apart,
a barely visible strand (0.08 of a line) joins them, and from afar the far line is that faint too, so a pad body
reads as its cells' angles.

### Hypha and stalk

A tree's bonds run mother to daughter only (a tree's cell keeps one, to its mother at `intent.z`; a tail's base keeps
the body's cell it grew from), and a tree's cell faces away from its mother (`bodyDirection`), so both kinds leave
the daughter at her back pole, the one she keeps for her mother, and the mother where the chord leaves her, turned
partway (0.4 of the turn, at most `TREE_TWIG`, 0.5 rad) toward her front pole for a daughter grown at a turn
(`turnOf`), so a mother's daughters leave her from points near one another, like twigs (`treeWays`, `treeAt`). Each
end lies where the cell's outline does along its way (`bondReach`, the threads' and nets' search, one copy of
`bodySD` in vsBridge for all of them), `TREE_INSET` (0.08 of the radius) inside it, so a strand always grows from its
cell. (At a fixed 0.82 of the drawn radius, a strand leaving a long cell across its narrow side ended in the water
short of it.) Anchoring on the mother's heading alone pulled strands across her as a beating body bent. Where the
cells are pressed closer than their outlines, as a tree's mostly are (its bonds rest where its cells
touch: the median tree bond in the bond lab's world spans 0.9 of its two radii), the anchors meet and the strand is
nothing. Neither kind fuses vsPoint's neck (`NECK_KINDS`): fused, a tree read as one lumpy tube; Dictyosphaerium's,
Dinobryon's and Zoothamnium's cells are each a cell of their own (a budding daughter still pinches off her mother).
Nor does a tree's cell hanging from its mother (or a tail's) trail a flagellum: a swimmer's is drawn behind its
heading, which for a tree's cell points down the strand, so a bright line ran beside the faint stalk and defeated it;
its cilia stay, as Vorticella's are at its free end (vsPoint says so by a negative `jelly.y`, the pace, which every
other use takes as 0, so a hanging cell does not stretch as a swimmer does; free swimmers and a tree's root keep their
flagella). Kept to one `select` on the tail's weight: reading the flag into the shader's early-outs as well cost the
cell pass 2-4% under D3D12.

- **Hypha** (`bondVtxHypha`, `bondFragHypha`): a strand `HYPHA_WIDTH` (0.09) of the smaller radius each side,
  35% wider where it leaves the mother, rounded at both ends (`strandCapsule`: one shorter than it is wide is a small
  bead, never a square block), a living one tapering a little toward the daughter, its width wandering gently along
  it and its edge soft (`strandShape`), resolved one soft pale strand whose flanks are only a little brighter than
  its core (`hyphaAcross`: drawn as two bright edge lines about a dark middle, as a thin clear cylinder scatters in
  darkfield, it read as a pipe or a pair of rails), nothing streaming; a living hypha (an eater's: Hyphomicrobium's) keeps a quarter of the cells' tint, a
  producer's wall strand is clear glass. From afar 0.4 of a line's light (as faint as a bridge's web, so a loose tree reads as its cells, not a diagram), a fifth of the cells' tint. A producer's
  daughter also sits in a clear cup, Dinobryon's lorica (`bondFragCup`): the strip runs on past her to the cup's mouth
  (`CUP_AHEAD`, 0.45 of her radius past her middle), and the cup, closed at its foot in a blunt point where the strand
  ends (`cupHalf`), widens from her back to `CUP_R` (0.8) of her radius by her middle, drawn as its rim alone, faint (`CUP_LIGHT`), from 10-22 px cells. In a chain the cells read as set
  each in a vase at the tip of the strand below; in a packed bush the rims overlap, as Dinobryon's do.
- **Stalk** (`bondVtxStalk`, `bondFragStalk`): a hair `STALK_WIDTH` (0.035) of the smaller radius each side, glassy and
  far fainter than the bell at its end (0.45 of a line from afar, as darkfield Vorticella's stalk is barely brighter
  than the field); resolved, a clear sheath lit at its edges round a darker core, the spasmoneme. It contracts with
  the beat the simulation drives (`bondAnchorStalk`): each cell's lateral speed is a cosine of the beat's clock less
  `beat.z` a generation (`beatSpeed`), and a bond's muscle pulls hardest as that wave passes between its cells, so the
  stalk fires there, quickly (a twelfth of a beat), lets go over the next third and rests straight the other half,
  as hard as its cells' mean will to beat (`willOf`) times the species' amplitude (full at `beat.x` 0.4): a resting
  body's stalks hang straight, and the folds run down a beating body with its wave. (The beat's clock is
  `view.sun.w`, the simulation's as the GPU has it, folded across its wraps of `SIM_CLOCK` as `beatFold` folds the
  simulation's: `stalkFold`, the wraps counted in `view.wraps`.) Contracting, it thickens 30% and kinks: a zig-zag fold for a branching tree's shared stalk (Zoothamnium), a
  coil seen side on (a sinusoid that tightens, its folds to 0.7 their length) for an unbranched one or a tail
  (Vorticella, Carchesium), `STALK_KINK` (0.18) of the radius wide at full contraction, folds `STALK_FOLD` (0.3) of
  it long (never under 4 pixels), pinned at both ends. The kink is drawn in the fragment shader inside a strip widened to hold it, its
  distance taken square to the fold's slope: six segments a bond are too few for a fold (`BondLook.shift` would draw
  it coarse).

Check either with `tools/bondlab.mjs` (the hypha and stalk bodies, `F-tree`, `F-beating`) and, for the stalk's
motion, consecutive frames of a beating body at a tenth of real time (it kinks only while the world runs).

### Jelly

A loose producer's colony lives in a shared clear jelly (Eudorina, Gloeocapsa, Nostoc), and in darkfield the jelly
shows only faintly: from afar as a pale cloud about the cells, close up as a thin, faint, colorless rim round the ball
(Volvox's boundary, Eudorina's envelope), the cells evenly spaced inside it. So a jelly body draws nothing between its
cells and one hull round it all.

The draw shaders know no bodies, so the hull is the level line of a field built from the bonds: every cell of a jelly
body (one keeping or kept by a partner whose bond `bondKind` makes jelly) adds a kernel (1 - d²/ρ²)², d its distance
to the triangle it makes with its two kept partners (a segment with one; a cell that keeps none takes the two of lowest
index among those keeping it, `jellyPartners`: the keepers are listed by atomics in a different order every frame, even
paused, and taking the first listed made such a cell's hull jump between two shapes, a flickering double edge;
ρ the cell's drawn radius and `sheathGap` over `JELLY_FRAC` 0.78, so the line lies about that far past its cells' edges
where two kernels overlap, hugging small cells and large alike, as the wall holds strangers off it (docs/ecosystem.md,
Jelly; a fixed 0.45 `linkR` left small cells in a wide moat)), and its gradient into an
`rgba16float` target a quarter of the view's size each way, an eighth past 400 px a unit
(`vsJellyField`/`fsJellyField`, additive; one quad a cell over its triangle, drawn over the living in view like the
far line; `Engine._jellyField`, a pass of its own ahead of each view's scene pass). A body's triangles fan over all of
it, so its hull is whole and filled however long its bonds, and lies 0.67-0.9 ρ beyond them (one kernel to many); a neighbor sharing no
bond adds only its own falloff between them, so bodies a little apart keep hulls of their own. Where two falloffs
barely meet the field is flat, and there the level is raised (`JELLY_NECK`), so the thin necks between neighbors open.
Tried first: a disc about each cell (radius 0.8 `linkR`, then 0.85 of its longest kept bond): bodies' cells sit as far
from their neighbors' as from their own, so discs large enough to bridge a body's bonds fused neighboring bodies into
continents with deep inlets, outlined like countries on a map.

The scene pass then draws the hull over the view (`fsJellyRim` in `_drawScene` after the bonds, over tiles, below;
into the scene with the trails' weight, not the living layer, as bonds), from the distance to the level line in pixels
(the field over its gradient, read between texels). From afar it is a cloud: a soft edge a few pixels wide, a fill
barely lighter than the water and a limb brightening toward the edge (fading with the field's rise above the level,
not the distance, which saddles leave undefined), lighter on the side toward `TO_LIGHT`. From 150 px a unit to 350 the
cloud gives way to the rim: a hairline (0.75 to 2.2 px), cool white, lit on its flank toward the light as the cells'
membranes are, a faint glow just inside it and nothing further in. All of it fades in from `JELLY_FROM` (20 px a unit)
to 40. Since it is scene light, the trails, the look's rims, the bloom and the composite take it as they take the
bonds; the loupe and the live close-up draw their own field; a studio portrait has none (no bonds there either). The
rim is drawn only where the field reaches: each fragment of the field stamps its tile of `JELLY_TILE` (8) texels a
side with the frame's stamp (`jellyTiles`; `View.jellyStamp`, never 0, and `jellyCols` written by `_jellyField`), and
the rim draws a quad over each tile it or a neighbor stamped (`vsJellyTile`; the rim reads the two texels about each
pixel, so a pixel reads at most a texel past its tile), so it shades the same pixels a full-view triangle would but
none of the empty water: with no jelly in view it draws nothing.
Below `JELLY_FROM`, with bonds hidden or with cells kept as sprites (detail off) neither pass runs.
A hungry eater able to pierce jelly (`pierceOf`; bit 12 of its species' word in the focus buffer, `JELLY_SP_PIERCE`)
adds a negative kernel to the field where it is (`jellyHole`: `JELLY_HOLE` 3 times its radius, weight `JELLY_HOLE_W`
2), so a hull it presses on tears open round it, and once it is in, a cavity of clear water with a rim of its own
travels with it through the jelly (docs/ecosystem.md, Jelly: the simulation lets it through the wall while it is
hungry). In open water the field is under the level already, so nothing shows; the hole stamps no tile.

### Threads

Glass a cell secretes (Thalassiosira's chitin thread, Skeletonema's silica rods, Chaetoceros' spines), so nothing of
the cells' own: `bondGlass`'s cool blue-white at `THREAD_GAIN` of the line's light, far fainter than the cells, and a
hair of one width all along (`THREAD_W`, 0.0009 world units: about a pixel and a third at 1500 px a unit), no taper,
neck or streaming. Under a pixel it is drawn a pixel and a half wide and faded by the share of each pixel its width
covers (`bondFragThread`: a box of its width seen through a pixel's), floored at `THREAD_MIN_PX`; from afar the far
line carries that floor's light whatever the bond's pull, so a body of threads reads as beads with faint gaps. It runs
straight: vsBridge's centerline does not bend along the body for a thread (`bend`, the one kind-specific line there),
and only bows a little to one side when slack. It leaves each cell from the middle of a valve face: the pole of the
cell's long axis (its heading, along which `cellOutline` lays it) on the side toward its partner, at the membrane, not
aimed through the center, several threads from one cell spread over a small arc round the pole (`THREAD_ARC`, 0.45 rad
either side, by a hash of the pair and the end), with a tiny bright point where each meets the cell (`THREAD_DOT`).
Glass adds light and writes no coverage. Threads are left out of `NECK_KINDS`, so their cells get no fused neck in
vsPoint: they hang apart, never joined by cytoplasm (budding necks stay).

The anchors (shared with the net and trees' strands, `bondReach`) find the membrane from inside on the ray out of the cell by
two Newton steps on `bodySD` of its plan, drawn out by its aspect and pace as `cellOutline` does (its small shears, a
squash and a turn's bend left out, so the end can sit a little in or out; the bright point covers that), eased in with
the strip so it starts on the center-to-center far line.

### Nets

Reticulomyxa's and the foraminifera's reticulopodia, the one living, glowing kind: the cells' color, whitened toward
their luminance (`netWhite`, 30% of the tint kept, since in darkfield the web's many fine edges scatter white). Its
strip takes over from the far line sooner than other kinds' (`netLOD`: from 6 px cells to 14, not 30; `bondFarNet`
divides out the shared fade), and the far line is faint (`NET_FAR`), so from mid zooms a body's web is a fine haze of
slightly bowed hairs (`NET_BOW`, by the pair's hash) rather than a ruled graph of straight center-to-center lines.
Each strand's width is set by a hash of its pair (the same either way round), cubed, so most are hair-thin (a fifth of
`NET_W`, faded by coverage under a pixel) and a few are trunks. It leaves each cell as a pseudopod toward its partner,
growing out from a little inside the membrane (`NET_INSET`, faded in), wide there (`NET_FOOT` of the smaller cell's
radius) and thinning fast (over `NET_FALL` of it), a small webbed sheet dimmer inside than at its edges. Fine specks
stream along every strand both ways, saltatory: four trains (two each way), each moving a step (`NET_STEP`) in a burst
on its own clock and resting between, their specks closely and irregularly spaced (`NET_SPACING`), of random size
(about a pixel at 1500 px a unit, `NET_GRAIN`) and faint, so up close they read as the strand's grain sliding both
ways, starting and stopping, and from 800 px a unit down they sink into its texture (on the real-time clock, as the
cells' outlines flow).

Cost (`tools/perf/cellab.mjs --bond 50,150,300,800`, 131k particles, RTX 4070 Ti): as assigned, against main, the scene
pass within noise at every zoom (-1.7% to +0.8% where resolved) and the frame within 1%; every bond forced to a net
(`--k '{"bondLook":6}'`, against the old neck) +1 to 2% of the scene pass from 150 to 800 (the frame +0.4 to
0.8%), forced to threads 1.6 to 2.6% faster. The anchors' `bodySD` runs only for threads', nets' and trees' vertices.
With the jelly envelope, the frame against main +0.3 to 1.7% (2026-11-25, RTX 2080 SUPER), nearly all of it the
field and the rim.

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
  cover so `scene()` still divides it out), and the composite, the bloom, the loupe and the close-up read that. Only
  the living hide it (their share of the pixel's light, `cellShare`, of the scene's cover: `underCells`); silt and
  husks lying on a grain add their light over it. In darkfield a chip on the bed is lit as the grain under it is and
  scatters a little more at its edges, so it does not black out what lies beneath; laid opaque, as it was until
  2026-11, a silt chip (dim: `siltCol` by `matterGain`, about 26 levels against open water's 16 and a pale foraminifer's
  49) cut a straight-sided hole in a pale grain (a foraminifer's chambers seen outlined but filled only in part), and a
  husk's film dimmed the grain to its own brown. Now a chip on a pale grain barely shows (a faint pale
  patch, its facets), on a darker one it reads as a faint translucent chip, and a husk as its faint ring; over open
  water both are as they were, and so are the living over stone. The trails a moving cell leaves over stone, which
  the living's layer does not hold, are matter to it too: added over the grain rather than covering it. So
  the lens's color fringes and soft rim, the look's darkfield rims, relief, rainbow edges and halation fall on stone as on
  cells (the stone's own scattering rim no longer grows with the look's rims, which now add theirs). The loupe lights
  stone once a pixel instead of once per tap of its fringes and softening.
- Shallow focus over a pile (`lensScene`): bare stone is blurred by how deep it lies, mostly its cobble's place in
  the pile (the stone color target's alpha past 1) and a little its own height there, up to 9.6 times the look's `dof`
  (about 7 px at 800 px tall, at Darkfield's 0.9; 24 times when Darkfield's `dof` was 0.4, set so piles kept their
  blur when it rose, chosen by eye with it at 0.9 too), full from 2.5 times the focus's start (200 px per unit on most screens):
  the grains on top sharp and those under them soft. A wide blur takes twelve taps, none from a grain lying higher
  or from the living (both in focus, in front), and only the share of a pixel the living leave bare takes it: the
  taps once gathered cells too, which spread each cell's light over the pile round it as a wide speckled fringe in
  its color (seen on an M1 and on Windows alike, there since the pile blur came in), where over water a cell keeps
  its thin rim and its bloom. A tap is left out wherever the living are drawn at all (the scene's alpha by their share
  of its light, which `fsStoneLit` leaves beside each pixel's place in the pile): weighed by what the
  living leave bare (until 2026-11), a cell's antialiased edge, where its bright hairline lies, still gave up to a
  quarter of the line's light, scattered over the stone about small crisp cells at mid zoom as speckles in their
  color. Silt and husks, which the grain shows through, take its blur with it and are gathered by the taps (kept out,
  the stone seen through a chip was sharp in the chip's shape on a soft grain), and so do the trails a moving cell
  leaves over it, which the living's own layer does not hold. The living's share comes from their own layer (`liveTex`, `coverAt`), not the scene's
  alpha, which holds the matter drawn as points too (husks, silt, sprites; bonds): read from the scene's alpha, a
  husk's faint outline over a blurred grain stayed sharp by its share and left the taps, a crisp dashed ring round
  nothing in particular. Taken first from height alone and at a quarter of the strength, it did not show (a
  grain's own dome outweighs its place in the pile, so every grain softened alike, slightly); `tools/stonelab.mjs
  --looks nofocus` photographs the same frames with `dof` at 0 to compare.
- The look's edges (relief, rims, fringe, rainbow rims) are read from the sharp scene, a pixel or a few apart, and laid
  over what `lensScene` has blurred: on cells and grains out of focus, deep in a pile or toward the rim they drew crisp
  outlines, and the view looked about as sharp as with `dof` at 0. `lensScene` now also gives how far it spread the
  image there, in pixels, and `lookScene` scales the edges by `rp² / (rp² + (2 spread)²)` (rp: how far apart it reads
  them), about as a high-pass of a blurred edge falls (at first `rp / (rp + 2 spread)`, which left a third of a crisp outline
  on a cell blurred two pixels: on a crest the sea focuses the lamp onto, stacked bright outlines round a soft cell); the loupe's softened rim does the same. Where nothing is spread (in focus,
  Optics off, below the focus's start) nothing changes.
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
was; it is panned and scaled to the view until the view leaves it (or reaches farther than half the world from where it
was drawn: each grain is drawn once, nearest that point, so zoomed out until the view spans the world the cache holds
nothing past the wrap, and it is drawn again with each step of a pan there) or zooms more than 6 % from it (`STONE_ZOOM`), and
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

## Light

The light producers feed on lights the scene, so the Tide's bands and the hand's lamp show on what they fall on rather
than as a tint over the water. `sceneLit` (POST_WGSL) mirrors `lightAt`: the bands by the season over the era's
baseline, under the sky (`pond.z`, darkness) and any duckweed, and the lamp (added) or shade (taken), as `r`: how
bright, in log, from the open water's light (0) to a summer band's (1, `LIT_SPAN` 4.4 times it). A winter's bands
reach only about a quarter of that, so they barely show, as they should; the lamp goes past 1, the shade below 0. The
light multiplies the toned view (`litShow`, after the tone curve so it is not squeezed, rolling off above `LIT_KNEE` by its
brightest channel, so a bright cell keeps its hue; rolled off channel by channel it turned white) by `litGain`: more on what lies on the floor, stone and silt (`LIT_GROUND`, 0.89x out of the light to
1.225x in a band), less on the living (`LIT_CELL`, 0.94x to 1.21x, their colors a little richer in the sun, `LIT_RICH`), who keep
their colors. The living are told from the
matter by their share of each pixel's light: the living's layer (`liveTex`), which the splat (sprites of a pixel or so,
`splatMain`/`fsSplat`) fills too, with the living's own light kept in a fifth channel and laid there uncovered. The empty
water shows it by the sea's focusing (`surf.light`, the FFT surface's own caustics, always there in calm water as soft
pools of light drifting with its swell: the surface lies far above the focal plane, so they are out of focus, as they
would be under a microscope). In a darkfield only what scatters shows the light, so in the sun the pools show on the
grains on the floor: silt and stone brighter where the sea focuses it and dimmer between (`FOCUS_MATTER`), their
glints and sparkles most (`FOCUS_GLINT`, on a pixel's brightest light), so the grains glitter as a pool passes over
them. Drawn as a glow on the dark water itself they read as nothing, or as fog (`floorLit` takes only a little of
them). What lies beneath takes them a little more in the sun than in the shade (`seaFocus`). Silt in the light sparkles, as fine mineral grains do in a darkfield: jostled in the water,
a grain's facets now and then turn to the light and flash (`sparkle` and `matterColor` in DRAW_WGSL, by `sunAt`, the
same light from the view's uniforms: `SPARK_SHARE` of the grains, each every few seconds on the real clock, as bright
as `SPARK` times the light; a grain seen as a point flashes whole, one seen as a chip from a rocking facet). The microscope's look takes the light too (`sunLook`, `sunGrade`): a brighter lamp makes more of everything that
spreads light about a bright thing, so in the light the bloom reaches further (`SUN_BLOOM`), the halation grows and
turns golden (`SUN_HALO`), the veiling flare grows and warms (`SUN_VEIL`) (darkfield's rims brightened more again,
`SUN_RIM`, and drew thick white outlines in the sun; they take the light as the cells do), and the view is graded a little golden, its pale highlights most so
colored cells keep their hue (`SUN_GOLD`); richer rainbow rims were tried and left off (color, not light). Lit cells glow
rather than outshine: with `LIT_CELL` 0.92x to 1.28x (now 0.94x to 1.21x, and `LIT_GROUND`, `SUN_BLOOM`, `SUN_HALO`,
`SUN_VEIL` and `seaFocus`'s strength each a quarter nearer none: in full light, and more on a crest, cells were turning
nearly white) they read 1.13-1.14x on screen against the same cells out of it (the display's gamma
halves a gain in log, the shoulder takes a little more; 0.9x to 1.12x read 1.09x). In the
sun the living shade the ground a little way from them (`sunShadow`: their layer looked up `SHADOW_H` units toward
the light, softened; it lies that far off them at every zoom), which there has the open water's light. The murk glows faintly golden in the sun
(`floorLit`; amber under the lamp; with the optics on). The pool's bared floor takes the light as the floor seen through
the water does (`landLit`, poolOver's dry mud): the ground's gain and the light's color, a golden glow in the sun
(`LAND_SUN`) and an amber one under the lamp (`LAND_LAMP`), none where the living shade it, so a Tide's band or the
lamp passing over an island lights its mud (painted over the scene unlit before, the mud showed no light at all). Before the tone curve the scene only takes the
light's color: cool in the shade, warm in the sun, amber by the lamp's share. The sea's caustics focus it (`seaFocus`:
stronger in the sun), the crests' sheen and the suspension's specks take the ground's gain. The loupe and the live
close-up light their scene as the composite does, the living's share and their shadows from their own layer of the
living (until 2026-11-12 the loupe lit all of it as the living, without shadows, and the close-up was unlit); a card's
portrait (the close-up not live, `MicroView.lit` 0) stays unlit, so a species looks the same wherever it was caught. Stone's cache is lit once, so
the light is applied after it, in the composite, every frame. The light map (Map → Light, G) still draws the light
itself as a ramp; the faint teal tint it once had in place of all this is gone.

Chosen (2026-11-02) by photographing one frozen world through `tools/looklab.mjs` with candidate composites swapped
in (plain exposure; two illuminants; procedural caustics; cells' shadows on the floor; highlights taking the light
most; suspended motes; a lit floor) against a render of the light itself, and measuring how well a blurred frame
follows the light field: exposure with the two illuminants' color and the lit floor read best (0.81 and 0.74 at a band's
edge and over a busy colony against the tint's 0.71 and 0.56; content 2.4x brighter in a band than outside, the
tint's 1.04x) at no cost (fsComposite timed the same: the tint already read the Tide). Motes read as noise and
procedural caustics as stray hairs; shadows showed only over stone.

Filmed at 4K over a whole season, that first version (all of the light before the tone curve) was hard to see: the tone
curve squeezed a band's 3.7x over the open water to 1.65x on screen at summer's peak, and in winter, half of every
five-minute season, the bands rose only 1.4x and showed as nothing (`runs/light/film*.mjs`, one-offs kept outside
the repo like the other `runs/light` scripts below, film one frozen world frame by frame, the Tide swept across it,
every version swapped in; in the repo `tools/looklab.mjs` holds a grown world still and photographs it as each new
composite is swapped in). A second round exposed the view for the season
(winter's bands stretched to 2.6x), moved most of the light after the tone curve and grayed the shade: plain, but it
dimmed and grayed the cells out of the light, and the worlds lost their color. So the third (`runs/light/v2.mjs`,
`metric3.py`: per pixel against the same world unlit, the living, the matter and the empty water apart, at summer's
peak and in deep winter) leaves the living nearly alone and lets stone, silt and the floor carry the light: in a summer
band against outside it, stone and silt 1.7-2.6x against 0.95x, the floor twice as bright, the living 1.1x against 1.0x;
in winter a trace (stone and silt 1.1x against 0.92x). That was heavy-handed (the floor's glow a fog over the
water, stone lit like a stage): the fourth halved it, in log (stone and silt 0.85x to 1.3x, the living 0.96x to 1.05x, the
floor about one and a half times the first round's glow), so in a summer band stone and silt read 1.3-1.7x against 1.0x,
the floor 13-15 against 8 (of 255), the living 1.07x: a subtle light, there when looked for. But then the mud alone
showed the light, and lit it slid against the bands as the view zoomed (Murk, below), so the fifth cut the murk's glow
to a third, gave the living back a little (0.9x to 1.12x, richer in the sun), and showed the light by what light does
rather than by brightening: caustics and the living's shadows (round 1 had tried both as stray hairs and as shadows
seen only over stone; drawn on the floor and moving, they read). Its caustics were a net of their own (a wandering
Voronoi tiling's edges), which read as an effect laid over the water and had nothing to do with its surface; the sixth
takes them from the sea's own focusing instead (first as a glow on the floor, 1-2 levels of 255 and unseen; then, as
the user proposed, on the grains: silt and stone catch it, their sparkles most), softens the near murk and adds silt's
sparkle (about 130 pixels a frame
flashing 12-40 levels over a 1080p view at fit, against the same world without it). `runs/light/film5.mjs` films the
user's own world under each version, the real clock stepped with the frames.

## Murk

The mud suspended in the water below the cells (`murk`, drawn into `murkTex` at a quarter of the view's resolution by
`fsMurk`; the loupe draws it per pixel) lies in three layers, each deeper and further out of focus (`MUD_*` in
`MICRO_FNS`): near, a faint dispersed veil of fine flocs; middle, clouds of flocs of every size; far, a broad dim haze,
cooler through more water (`murkColor`). Each pans at its `MUD_DEPTH` of the cells' speed, so as the view pans they
slide over one another. A zoom moves none of them: `Engine._murkCam` splits each move of the view into what a zoom
about a point on the screen explains (that moves the layers with the world) and the rest (a pan), and keeps each
layer's camera as an offset modulo the world. (Before, the layer was drawn from the camera itself at 0.85x, and a zoom
toward the cursor, which moves the camera, slid the mud 20-30 pixels a step against the cells.) Flocs finer than a
layer's blur or than a few samples fade to their mean, and the rest is scaled back up to the full spread, so a layer
covers as much at every zoom and nothing aliases (finer octaves once shimmered as the view zoomed). The near layer's
two generations are kept as densities and turned into flocs in the composite (`murkLayers`), so their edges are drawn
at the full resolution rather than stretched from a quarter of it.

## Heat haze

With Display → Heat haze on, warm water bends the view as hot air over a road does (`shimmer` in POST_WGSL, worked
out in `fsField`; the loupe inline). How strongly it wavers (0 to 1) is the most of three measures of the heat field:
how steep the temperature's slope (`HAZE_SLOPE`, °C a cell), how much warmer the water is than the water `HAZE_R` cells
about it (`HAZE_WARM`), and how hot it is in itself (`HAZE_HOT`, so a heat wave's warmest water wavers a little). The
water a few cells about, not the era's background, is the measure of a warm spot, since life warms the whole pool a
few degrees past the era's water.

The view is bent along the slope of one field (`hazeSlope`: gradient noise and its derivative, worked out together for
the cost of one value noise), as schlieren bend it along the slope of the water's refractive index: such a bend never
swirls, so what it bends wavers in place. Its ripples (`hazeRipples`) are two octaves fixed in the world, weighed so a
ripple is about `HAZE_SPAN` pixels across at any zoom (half to twice it, crossfading as the view zooms, never
sliding), finer than a cell close up, and each octave is two layers scrolling past each other on the viewer's clock
(`HAZE_RUN`), so it flickers alike at any speed of the world. At full strength the view moves up to `HAZE_AMP` of a
ripple's size: over a staged +30° patch at 120 pixels a unit the median 16 px block moves 0.8 px (2.6 at the 95th
percentile), 0.25 px a frame. Viewed from farther than `HAZE_NEAR` pixels a unit the bend (and the roil's) is fixed
in the world rather than on the screen, shrinking with the view: from afar, cells a pixel or two across, a bend of a few
pixels threw whole crowds of them about. Boiling water's roil (`boilAt`) shows with the haze off too.

Until 2026-11-20 it was the slope alone, times the noise, in screen pixels: under half a pixel nearly everywhere, at
any zoom, and nothing inside a warm patch, where the temperature is flat; `tools/heatlook.mjs` showed haze-on and
haze-off frames alike. A first rework (warmth, a size growing with the zoom) used two noises for the two axes at four
ripples a unit, bigger than cells close up: whole cells moved and turned together, a wave through a crowd, not a haze.

`tools/gpu-node.sh tools/heatlook.mjs --out runs/heatlook/NAME` grows a world and photographs its warmest water and
staged warm water (a plume, a broad hot patch, near a boil) with the haze on, off and off again (cells' drawing
animates even with the world held) at several zooms, and records clips: held with the haze on and off, running, and
held over stone with a hot patch staged there (stone is cached: whatever moves there, the haze moved). `python3
tools/heatlook.py DIR` measures the pairs against their controls and how far and fast the clips move, to a fraction of
a pixel.

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
- Texture inside cells laid in world space: it would slide across moving cells (the shower-door effect). Cells' granules
  are laid in each cell's own frame instead (Cells, above).
- Hot pixels, fixed-pattern noise, rolling shutter, interlacing, compression, mains flicker, auto-exposure
  hunting: a real camera's faults, but they read as faults of the viewer's screen or as a broken page.

## Trails

Settings → Display → Trails keeps a fading share of the last frames (`settings.trails`: Short 0.45 a 60 Hz frame, the
default; Long 0.7; Exposure 0.88), carried with the camera (`fsReproj`). With the cells' light in a hairline and specks,
each frame's copy of a moving cell stayed sharp in the history, and its wake was a comb of outlines and a trail of dots
at each frame's place. So with trails on the scene a cell resolved whole (from 6 px a radius) writes is its even fill
(fsPointLive), where it covers a pixel in part too, and its line and insides go only to the living alone, which the
composite lays over the scene wherever they cover it (overCells): a cell in place shows exactly what it shows without
trails, and a moving one leaves a smooth smear of its light, as a long exposure does. That fill's coverage is weighted
by a frame's share of the history (1 - trails, the high half of the view's flags), so where a cell has stayed the
history holds it once, and where it has moved on the composite, which divides light by coverage, no longer divides its
fading light back up: each pixel of the wake is as bright as the time the cell lay over it, never brighter than the
cell's mean, falling off smoothly behind it. Until 2026-11-25 the coverage counted in full, so the wake read at the
cell's whole mean light until it had faded to a seventh (at Exposure), a flat pale slab brighter than the dim cell
itself, and the pixels the cell covered only in part kept its hairline, a comb along the slab's edges (only pixels
covered whole took the fill); a still scene's cells' edges were also brighter with trails than without (by about a tenth
of the view's light at 300 to 1500 px a unit), and are now as they are without. A swimmer's hairs and tail lie outside
its body, where it covers nothing and the composite shows the scene alone, so their own light goes into the scene at the
same weight as the fill: as bright as without trails where they stay, a faint smear of their own where they beat. (For
a day, 2026-11-25, the scene took the fill alone, and hairs and tails showed only where they crossed another cell.)
Before the fill's weighting the scene took them at full weight, and trails brightened them (nearly twice as bright at
Short). For a while (2026-11) the history was spread instead, four diagonal taps 1.5 px out every frame: the wake was
smooth, but everything still was low-passed again every frame, and far out, where cells are dots and splats, the whole
view turned blurrier and up to twice as bright about a second after it came to rest (the composite divides light by
coverage, and spread coverage divides less).
The history is carried unspread again, one tap.