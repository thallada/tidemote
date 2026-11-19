# HDR and wide color

On an HDR display the brightest things in the water (rims scattering the lamp, glints, the sea's focused light, sunlit
cells, the bloom's cores) shine brighter than white while everything else shows as it does in SDR. On a wide-gamut
display (Display P3: recent phones, Macs, HDR monitors) the most saturated cell colors reach past what sRGB can show.
Settings → Display → Color has the controls (shown only on screens that can use them): **HDR** on or off,
**Highlights** (the display's headroom, with a calibration guide) and **Wide color** (Off, Subtle, Normal, Vivid).

Code: `src/hdr.js` (what the screen and browser can show, the plan for the canvas, the slider's scale, the calibration
guide; pure but for those two, `test/hdr.test.js`), `displayOut`/`toneLum`/`hdrLift`/`wideGamut` in `POST_WGSL`
(`src/shaders.js`), `Post.display` (`Engine.display`, `POST_DISPLAY`), `Engine.prepareFormat`, `applyDisplay` in
`src/main.js`.

## How the web does it

- WebGPU canvases take `toneMapping: { mode: 'extended' }` (Chrome 129 on, [What's new in WebGPU
  129](https://developer.chrome.com/blog/new-in-webgpu-129)): values past 1 are shown brighter than SDR white, up to
  what the screen can show, where `'standard'` (the default) clamps to [0, 1]. Only a float canvas (`rgba16float`) can
  hold such values.
- `colorSpace` names how the canvas's values are read. Measured in Chrome 157 (`tools/hdr/probe.mjs`): a float canvas
  in `'srgb'` or `'display-p3'` takes **sRGB-encoded** values, the curve extended past 1 (2.0 shows as 4.95× white,
  linear); `'srgb-linear'` and `'display-p3-linear'` (Chrome 155-156) take linear ones. The page writes encoded
  values: Electron 45's Chromium (156) and older Chromes have the encoded spaces, and every pass after the composite
  (the panels' glass, the notes, the trails' hold) works on encoded values as it always has.
- 1.0 is SDR white, which the system sets (on Windows, Settings → Display → HDR → *SDR content brightness*; on a Mac
  the display's brightness). There is no web API for the display's headroom (a `ScreenDetailed` headroom is still a
  [proposal](https://lists.w3.org/Archives/Public/public-colorweb/2025Jun/0000.html)), so the viewer sets it, as HDR
  games ask for peak brightness, by a calibration guide.
- `(dynamic-range: high)` says the screen is in HDR, `(color-gamut: p3)` that it has a P3 gamut; both change as a
  window moves between screens or the system's HDR is switched (`displayCaps` listens).
- `dynamic-range-limit: no-limit` (CSS, the default) lets the canvas use the full range; `#stage` and `#specimen` say
  it explicitly.

## The plan (`displayPlan`)

| Screen and choices | Canvas | `colorSpace` | `toneMapping` | `Post.display` |
|---|---|---|---|---|
| SDR, sRGB | the preferred 8-bit format | `srgb` | `standard` | peak 1, wide 0, sRGB |
| SDR, P3, Wide color on | the preferred 8-bit format | `display-p3` | `standard` | peak 1, wide, P3 |
| HDR, HDR on | `rgba16float` | `display-p3` (Wide color on) or `srgb` | `extended` | peak = Highlights, wide, P3 |
| HDR, HDR off | the float canvas if one was made | as above | `standard` | peak 1 |
| filming | as it is | as it is | as it is | peak 1, wide 0 |

HDR is on by default except on touch screens (a phone's GPU has least to spare for a float canvas; the viewer can turn
it on). The first time HDR is shown in an 8-bit canvas, every pipeline that draws into the canvas (the composites, the
loupe, the close-up, the hold, the glass, the notes) is compiled for `rgba16float` in the background
(`Engine.prepareFormat`), the view staying SDR meanwhile, then all of it is switched in one task with the canvases
configured anew. Switching HDR off keeps the float canvas (SDR in it) rather than compiling back.

## The curve

The composite's tone curve (`tonemap`, Reinhard's on luminance extended to white at √6, its color run toward white
past the peak) and the light's roll-off (`litShow`) end at `peakWhite()`, 1 in SDR: there the page is exactly as it
was (each change multiplies or divides by 1). On an HDR display (`toneLum`):

- **Below the knee** (display 0.6, scene luminance ≈ 1.05) the curve is SDR's: the water, the murk and the body of the
  cells look the same (measured: the median luminance is the same to 4 digits).
- **SDR's white** is where the look's brightest things land (it was graded so: rims, glints, the sea's focus reach
  it at scene luminance √6). In HDR they show at half the way from the knee to the peak (`HDR_SPEC`), as SDR-graded
  highlights are expanded for HDR ([ITU-R BT.2446](https://www.itu.int/rec/R-REC-BT.2446)'s approach); what SDR
  clipped fills the rest, toward the peak, never reaching it.
- Between, the curves are eased into each other by a smoothstep on scene luminance: they meet at the knee with no
  change of slope, so a glow's gradient shows no ring there.
- AgX (the look's *film*, a share of the curve) is made for SDR; on an HDR display its result is lifted by how much
  brighter the HDR curve shows that luminance (`hdrLift`).
- The grade (contrast, black, saturation, density, grain) works in [0, 1]: an HDR highlight is graded as the SDR color
  of its hue at white, then brought back to its brightness (`lookGrade`), so a highlight keeps its hue and the grade.

Measured (`tools/hdr/check.mjs --tour`, a fresh world at the default zoom, Highlights 4×): SDR's brightest pixel ≈
0.95, HDR's ≈ 2.5× white, 0.2-0.4% of pixels past white; the median unchanged.

## Wide color

The view's colors are made in sRGB. The colorimetric conversion to P3 shows a color as it is on an sRGB screen; the
same numbers read as P3 move each sRGB primary out to P3's, sRGB's gamut stretched onto P3's (nothing leaves it). On
a P3 canvas `wideGamut` mixes the two by how saturated a color is (`smoothstep(0.15, 0.85, 1 - min/max)`) times Wide
color's amount (0.35, 0.65, 1): greys, where the two agree, and pale colors stay as they are; a cell's pure pigment
reaches out toward the edge. The notes' colors (`gpunotes.js`) are converted colorimetrically: the page's own marks keep
their colors.

## What stays SDR

- **Films** are made by copying the canvas into a 2D canvas, which clamps HDR's highlights and P3's colors: while a
  film rolls the view is SDR in sRGB's colors (on whatever canvas it has), so the film shows what an SDR screen does.
- **Portraits** (cards, a save's preview) read the close-up's own uniforms (`postPlain`), set to SDR in sRGB; from a
  float canvas they come back as halves (`halfsToRGBA8`).
- **The panels' glass** is no brighter than SDR white behind a panel, so its words read over an HDR highlight.
- **A card's own page** (`studiorender.js`) has all-zero display words: SDR in sRGB.

## Calibration

The guide above the Highlights slider (above it, so a thumb on the slider does not hide it) is a canvas of its own in
extended range, on black: a grey disc at the headroom chosen inside a thin white ring at 64× white (any display clips
it at its brightest). Below the display's own headroom the disc shows dimmer than its ring; raised until it just
disappears into it, Highlights meets the headroom. On a display with its own tone mapping (an OLED in a "peak 1000"
mode) the disc fades rather than vanishing; the point where it stops changing is the setting. The guide shows only
while Highlights is being set (held, dragged, or keyed while focused, and 2.5 s after): its ring is the panel at its
brightest, which beside the settings' words was blinding, and a ring rather than a field keeps that glare small.

Highlights starts at 2×. No web API tells a display's headroom, nor its brightness, on which it depends (a
`ScreenDetailed` headroom is a proposal, above): an HDR monitor of 400-600 nits with SDR white at 200-300 has about
1.5-3×. Set too high, the brightest highlights clip flat; too low, they are only dimmer.

## Platforms

- **Windows** (Chrome, Edge, the desktop app): with *Use HDR* on in the system's display settings. The page's
  white is the *SDR content brightness* slider's.
- **macOS** (Chrome, the desktop app): EDR; the headroom changes with the display's brightness (more at lower
  brightness), so calibrate at the brightness usually used.
- **Android** Chrome on HDR phones: the same path, HDR off by default (touch screens). Known issue (Chrome 157,
  Pixel 11 Pro, measured 2026-11-18): with the float canvas shown Chrome asks for about 4.9× headroom whatever the
  page uses; Android raises the panel (up to about 4.5×, by the brightness) and dims every other SDR layer, but leaves
  Chrome's page layer (`V0_SCRGB`, white point at the panel's full brightness) undimmed, so the whole page, panels
  too, shows brighter and black reads grey. The page's values reach the compositor unchanged (screen captures are
  identical either way; only an eye sees it), and no web API tells the boost to compensate for, so the page leaves
  it to Chrome. To check a newer Chrome: switch HDR on and off on a dark view and compare the page's black with
  Chrome's address bar (`adb shell dumpsys SurfaceFlinger` shows the page layer's dataspace, white point and
  dimming ratio).
- **Linux** (and the Steam Deck): Chromium's HDR there is experimental; `(dynamic-range: high)` is false and the page
  stays SDR. Wide color follows `(color-gamut: p3)`.
- Safari and Firefox: the page uses HDR only where the browser reports it takes `toneMapping` (`displayCaps` configures
  a canvas and reads `getConfiguration()` back).

## Tools

- `tools/gpu-node.sh tools/hdr/check.mjs [--peak 4] [--out runs/hdr/NAME] [--tour N]`: the built page
  in Windows Chrome on the GPU, told its screen is HDR and P3 (`T.display.set`), whatever the screen is; what the
  composite writes is read from the canvas's texture in the frame (`T.display.onFrame`) and decoded as the browser
  does. Checks SDR never past white, HDR's highlights past it and never past the peak, the mid-tones unchanged, P3's
  colors reaching outside sRGB, a preview and a film staying SDR, HDR off going back, no WebGPU errors; screenshots
  Settings → Color at a laptop's and a phone's size with `--out`. (A canvas drawn into a 2D one would not do: on an
  SDR screen the browser clamps an extended canvas to the screen's range there.)
- `tools/gpu-node.sh tools/hdr/probe.mjs`: what a browser makes of float canvases in each color space
  (`tools/hdr/probe.html`): the media queries, the configurations it takes, encoded or linear, clamped or not.
- How it looks can only be judged on an HDR display, by eye: Settings → Color switches everything live.
