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

## Left out

- Other presets: a cool, desaturated "instrument" look after the interface (it cost a quarter of the species' color
  spread), a 16 mm "film reel" (slide-film LUT, warm halation, heavy grain, a wandering focus) and Rheinberg's
  colored illumination (a blue field and gold insides: at full, every edge rainbow and the whole world gold from
  afar). Only Rheinberg's edge colors stayed, as the rainbow rims.
- 3D LUTs (and `.cube` files), split toning, white balance and focus drift: they reached Darkfield at zero.
- Monochrome LUTs and fluorescence (hues snapped to four dyes): striking, but they erase or remap the species'
  colors, the one thing the colors are for. AgX alone, at full: bright cells run to pastel; it is mixed in at a quarter.
- Texture inside cells laid in world space: it would slide across moving cells (the shower-door effect).
- Hot pixels, fixed-pattern noise, rolling shutter, interlacing, compression, mains flicker, auto-exposure
  hunting: a real camera's faults, but they read as faults of the viewer's screen or as a broken page.
