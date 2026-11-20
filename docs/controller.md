# Controllers

Playing Tidemote with a gamepad (planned and begun 2026-11-19): on the Steam Deck in Game Mode first, then the desktop
app and the browser with any Xbox, PlayStation or Switch pad. Mockups (the Deck with the tool rose open; the Controls
dialog in both columns) are drafted for a "Controllers" row in
[Tidemote Bench Mockups](https://claude.ai/artifact/B3SQejEmXVw8kA25seo12v), not yet published there.

## Status

Built (src/input/, src/rose.js; tools/keys-check.mjs, tools/pad-check.mjs, test/actions.test.js, test/pad.test.js):

- One action table drives the keyboard, the pad, the hints and the Controls dialog; the keydown chain is gone.
- The keyboard gained camera keys: W A S D and the arrows pan (they steer only while riding, and no longer start a
  ride; Enter does), − and = zoom while held. The volume keys went (Settings' slider and the system's keys remain).
- The pad in the world, riding, the two roses, a tool applied at the reticle, panels entered and walked by focus,
  tabs on the bumpers, the intro begun by A, hints and the Controls dialog in the pad's glyphs, Settings → Display →
  Button prompts.
- Keyboard accessibility the pad needed too: the arrows move focus within a panel, a dialog opened from the keyboard
  takes focus and gives it back when it closes, the card keeps Tab within itself, Begin answers a plain click.
- The desktop app: whether it runs on a Deck (the Deck's glyphs for Steam's virtual pad), and Steam's floating
  keyboard when A is pressed on a text field.

Second round (from a first try on a desktop with a controller): glyph labels centered (an invalid `font` shorthand,
and the label trimmed to its capitals), the mouse pointer hidden while the pad points, focus rings drawn inside
controls (none cut by a scrolling panel or a tab row), Settings → Display → Controller in two columns and the foot's
Controls on one line, the reticle keeping its place as panels open, View only the Lab, A showing a term's hint,
sliders taken hold of by A and stepped by a twentieth, the pipette's X switching loading and dispensing (and the
legend saying which), the instruments in focus while A holds them, the legend naming taps and holds, the dock's
readout fitting at 1280, and the pipette's strip redrawn at most eight times a second (its hitches).
Third round: the legend's glyphs centered too (a `.padbar span` rule made every span in it a flex box, the labels
pushed left; pad-look now measures glyphs where they are shown, not only on a sheet), focus kept on the same
control when a panel is drawn anew (`setHTML`), the +n tags chip handing focus to the first tag it shows, a side
panel the pad entered holding its presses until B, Y, its closing or a click elsewhere (RB/LB spammed never reach
the world), and the d-pad reaching controls below a panel's fold. Then: the legend over the bench's drawer while it is open and hidden while the auto
camera films, Settings → Display → Full screen (a controller cannot reach F), and the d-pad crossing panels at their
edges: up from the dock to the bench (open) or the rail, up from a side panel to the rail, down from the rail to the
dock (the dock's legend says Top bar). In a browser a gamepad press may not count as the user's gesture that full
screen needs; the desktop app's is the window's and always works. `pad-look.mjs`
checks all of it by eye and by pixel.

Still to do: the Steamworks Steam Input setting (decision 3) and Touch API Pass-through (Touch on the Deck), the Deck walkthrough and its run, measuring the Steam
overlay's cost before deciding on it, haptics, keys in the guide's prose by argument, and the first-time player test.

The plan rests on three pieces of work: an inventory of every input the page handles today (below, *What there is*),
the W3C Gamepad spec and browser bugs, and Valve's Steam Deck and Steam Input documentation (sources at the end).

## Goals

- A visitor with only a controller can do everything a new viewer does in their first ten minutes: look around,
  find something alive, read about it, follow and ride it, change the speed, pick up the tools, open the Lab and
  Settings, and leave every one of those again.
- The hints and the Controls dialog show whichever input the visitor is using: keyboard keys after a key press,
  the pad's own buttons (Xbox, PlayStation, Switch or Deck) after a button press. Moving the mouse never flips them.
  The dialog lists both.
- Steam Deck Verified: every criterion in *Deck Verified, item by item* passes with Steam's default configuration.
- Bindings are fixed for now. One table defines them, so making them editable later only means letting the viewer
  change that table.

Non-goals for now: rebinding, gyro, the Deck's back grips (Steam Input can map them to anything for a player who
wants them), and couch multiplayer.

## What there was (before this work)

All global keys go through one inline `if/else` chain in a `keydown` listener (`src/main.js:3853-3935`, quasimode and
ride release in `keyup` at 3938). Canvas gestures are in `main.js:3731-3851`. The pointer lands on named functions
(`togglePause`, `stepSpeed`, `pickTool`, `setReach`, `toggleRide`, `hopRide`, `selectAt`, `deselect`, `playAuto`,
`nextScene`, `filmAct`, `toggleSound`, `setInterface`, `toggleHelp`, `bench.toggle`, `view.toggle`, `lab.toggle`,
`zoomAt`, `hand.down/move/up`), but several actions live only inside the chain: trails, bloom, the microscope look,
currents, the loupe's magnification, the readouts, zoom reset, the Shift+R confirm, the tool quasimode, and the whole
Escape walk-back (thirteen steps, `main.js:3907-3922`).

What helps:

- Riding already steers by a vector. `steerRide` takes `ride.at` (a point) or `keyWay(ride.keys)`, so a stick is one
  more source (`main.js:1690-1711`).
- Touch already swaps some hints: `bench.js` picks `t.touch` over `t.hint` on `(pointer: coarse)`, decided once at
  load.

What is missing:

- **No keyboard-shortcut tests.** `ui-check`, `ride-check`, `menu-check` and `lineage/nav-check` press keys on the way
  to other checks; nothing walks the shortcut map.
- **Key names are baked into message text.** `data-hint="Pause · Space"`, where `tip.js` splits on the last ` · ` and
  shows the part after it as a `<kbd>`. That covers about 20 hints in `page.html` and about 25 `tr()` messages, plus
  the Settings rows' raw key strings (`main.js:2621-2625`).
- **The Controls dialog is hand-written** (`page.html:285-311`). Half its key labels aren't messages, and it leaves
  out `?`, right-drag, the tool hold and `Backspace`. The only way to open it is `?`.
- **No camera keys.** You can't pan or zoom from the keyboard; `Z` only resets the zoom.
- **No focus model** beyond the DOM's own tab order. No gamepad, Steam Input or on-screen keyboard code anywhere
  (`desktop/` uses `steamworks.js` 0.4.0 for Cloud, achievements and the Workshop only).
- **Text fields** a controller user would meet: the card's name, the world's name in Settings, the Lab's species and
  log searches, and the file pickers.

## What a new viewer reaches for first

The first ten minutes, in the order the opening, the guide and the dock lead a viewer through them:

1. Begin a world (the opening menu).
2. Watch: the auto camera, or look around by panning and zooming.
3. Find something alive and select it; read the specimen panel.
4. Follow it and ride it; hop to its kin when it dies.
5. Change the speed: pause, faster, back to real time.
6. Pick up a tool and use it (the lamp, warm and cold, the needle, the pipette).
7. Open the Field Lab: the census, a species, its lineage.
8. Settings: sound, look, performance; save the world.
9. Back out of anything.

There's no telemetry to rank these by. The order follows how the page itself introduces them, and the check is the
first-time-player test in *How we'll know it works*. The tiers below follow it.

| Tier | Where it goes | Actions |
|---|---|---|
| 1 | Sticks, triggers, face buttons, d-pad: always one press | Pan, zoom, select, back, ride / get off / hop, pause, slower, faster, auto camera, next scene, Settings, Lab |
| 2 | Held bumpers: the two roses | The eight tools, put down; the maps, currents, trails, glow, microscope, film, sound, hide the interface |
| 2 | Contextual: while a tool is in hand | Apply, its other way (the pipette's dispense), reach |
| 3 | Inside panels, by focus | Lab tabs, Lineage, species pages, cards, the cabinet, Settings, saves, Workshop |
| — | Left to Settings or the hardware | Volume (Settings, or the Deck's own keys), fullscreen (the Deck always is), the readouts, Shift+R (Settings → Worlds) |

## The bindings

Buttons are named by position (South, East, West, North, the "A B X Y" of an Xbox pad) and drawn with the pad's own
glyphs. The Standard Gamepad indices are fixed by position, so a Switch pad's "B" is South and acts as confirm.
Nintendo players are used to confirm on the right, but Steam Input and Chrome both follow position. We do too, and
the glyphs say what to press.

### In the world (no panel holds focus)

| Input | Action | Same as |
|---|---|---|
| Left stick | Pan (speed scales with zoom; radial deadzone) | drag |
| LT / RT | Zoom out / in, analog, about the reticle | wheel |
| Right stick | Scroll the open side panel (specimen, Lab); with a tool in hand, ↕ changes its reach | wheel on a panel; `[` `]` |
| South (A) | Select what is under the reticle; with a tool in hand, apply it (held: keep applying) | click |
| East (B) | Back: the Escape walk-back, step for step | Esc |
| West (X) | Ride the selected cell / get off; with the pipette in hand, switch between loading and dispensing | Enter; ⇧ held |
| North (Y) | Move focus into the open side panel (East brings it back) | Tab |
| D-pad ← / → | Slower / faster | `,` `.` |
| D-pad ↓ | Pause / resume | Space |
| D-pad ↑ | Auto camera; pressed again while it runs, the next scene | P, X |
| LB, held | The tool rose; tapped: the last tool / put down (a hold is a quarter second) | 1–8, 0 |
| RB, held | The view rose; tapped: the Bench drawer | G E H C T Y O R M U, B |
| L3 | Follow the selected cell | Follow |
| R3 | Reset the zoom | Z |
| Menu (≡) | Settings | V |
| View (⧉) | Field Lab, open or closed (only that: a hold that opened the Controls turned slow presses into the wrong dialog; the Controls are at Settings' foot) | K |

A reticle sits at the middle of the open view when the pad is first used, and then keeps its place on the screen as
panels open and close (clamped inside what they leave open; following a cell, it eases to the middle with the
camera), so the loupe at it stays on what it was over when a selection opens the specimen panel. Selecting picks the nearest living cell
within about 40 px of it (the `selectAt` pick, with a wider radius), so the stick never has to land on a 3 px cell.
A tool applies at the reticle, so holding South while panning sweeps it through the water (`hand.move` per frame as
the camera moves). The reticle is drawn as part of the instrument (the composite's `instrument`) so films keep it out,
like the cursor.

### Riding

| Input | Action |
|---|---|
| Left stick | Steer: the stick's vector feeds `steerRide` like `keyWay`, with its length as the will's strength |
| South (A) | Hop to the newest or nearest kin (Tab) |
| West (X) / East (B) | Get off |
| LT / RT | Zoom |

### In panels (focus inside the specimen panel, Lab, Settings, Bench, a card or the opening menu)

| Input | Action |
|---|---|
| D-pad / left stick | Move focus spatially (repeat after 400 ms, then every 90 ms), past sliders and lists too |
| South (A) | Activate: press, toggle, open. On a slider or a list: take hold of it (ring turns cyan); the d-pad then steps it a twentieth of its span, the stick sweeps it (the whole span in 1.5 s), and A or B lets go. On a glossary term: show its hint; again, hide it |
| East (B) | Back: let go of a slider, then one layer (card, then Settings, then the panel), then to the world |
| LB / RB | Previous / next tab (Settings, Lab, specimen sections) |
| Right stick | Scroll |

The legend over the dock says which of these applies to what has focus (Choose, Adjust, Explain, Done). It shows for
four seconds and fades (0.22 s in, 0.3 s out): after any bound button, when what the buttons do changes (a tool, a
panel, a ride), and when the pad is first taken up; panning and zooming with the sticks and triggers leave it faded,
and the auto camera hides it. RB in the bench (which has no tabs) closes it, as RB opened it.

The opening menu is a panel: any button reveals the pad (the spec's gesture gate), focus lands on Begin, the d-pad
walks the count chips and saved worlds, and South begins.

### The roses

Both roses follow the ring mock (C-ring), which was turned down for the mouse and the phone: it was a hidden gesture,
it had small targets and it covered the spot you meant to touch. Held on a bumper with the glyph in the hint, aimed
by angle, those problems go away. It's the pattern players know from weapon wheels and Frostpunk's two radials.

- **Tool rose (LB):** eight octants for the loupe, touch, lamp, shade, warm, cold, needle and pipette, in the dock's
  order clockwise from the top. The centre cancels; LB tapped puts the tool down, and tapped again takes it back up.
- **View rose (RB):** light map, heat map, tide map, currents, trails, glow and microscope, plus an eighth slot for
  film. Sound and hiding the interface stay in Settings, and the Deck has volume keys.
- It opens 180 ms into the hold, so a tap stays a tap. Release confirms the highlighted octant, and a stick at rest
  cancels. Neighbouring octants have a 10° hysteresis band so selection doesn't jitter. The last octant is kept for
  120 ms after the stick springs back, so letting go of the stick a moment before the button still picks it. This is
  the mis-select players report most in radial menus.
- The world keeps running while a rose is open (a decision below).

## Architecture

```
src/input/actions.js   the table (pure): every action, its keys, its pad inputs, its contexts, its help group
src/input/pad.js       the poller: snapshot -> events (pure core padStep) + the per-frame read of navigator.getGamepads()
src/input/mode.js      which device is active, with hysteresis (pure)
src/input/glyphs.js    the four glyph families (inline SVG, our own drawing, no brand logos) and family detection
src/input/focus.js     spatial navigation over rects (pure core) + layers and remembered focus per group
src/rose.js            the rose: sector math (pure) and its DOM
```

**One table.** Each action has an `id`, a label message, `keys` (`{key, code, shift}`), `pad` (`{btn, hold|tap}` or
an axis), the contexts it applies in (`world`, `tool`, `ride`, `panel`, `card`, `menu`, `rose`), and its group and
order in the help. The `keydown` chain becomes `matchKey(e, ctx) → id`, then `act(id)`. The pad poller produces ids
the same way. `act` calls the named functions, and the actions that now live only inside the chain become functions
first (`back()` for the Escape walk, `cycleTrails`, `toggleBloom`, `toggleLook`, `resetZoom`, ...). The Controls
dialog, every hint and the Settings rows' key labels are generated from the table.

**Hints.** A hint's message keeps only its words (`dock.t-play.hint` becomes "Pause"), and the element gains
`data-act="pause"`. `tip.js` draws the binding for the active family: a `<kbd>` for keys, an SVG glyph for pads.
Message ids keep their ids per docs/i18n.md, and `extract.mjs` plus `en.json` move with the change. Prose that names
keys (the guide's glossary: "The O key", "W A S D ... Tab ... Enter") takes `{key}` arguments filled from the table.
Phase 6 does that, so the first phases needn't touch every guide message.

**The active device.** Two separate things:

- *Glyph family*: keyboard or pad. It changes only on a key press (not a lone modifier) or a pad button, or a stick
  pushed past 0.5. Mouse and touch never change it. That way the Deck's trackpad, which Steam turns into a mouse,
  can't flicker the hints, and Valve's rule holds that Deck inputs never show keyboard glyphs.
- *Pointer presence*: mouse, touch or none. It decides whether the reticle shows and whether focus rings are drawn.
  A click or a touch hides the reticle; a stick shows it again.

`document.body.dataset.input` carries both, and CSS (`body[data-input~=pad] :focus-visible`) shows the ring.

**The poller.** It runs from `frame()` (`main.js:6061`), once per rAF, before the step:

- It reads the pads fresh each frame and keeps no Gamepad object between frames (Chrome returns a fixed array with
  holes, and a reconnected pad can take an old index).
- Deadzones are radial and scaled, `(|v| − 0.18) / (1 − 0.18)` along the vector, since sticks rest a little off zero.
- Button edges, tap against hold, and d-pad repeat all come from `timestamp` and `now`.
- Triggers are read from `buttons[6/7].value`, with axes as the fallback when `mapping !== "standard"`.
- A pad with no standard mapping still works for buttons 0–3 and the left stick, with a one-time note in Settings.
- When both "Steam Virtual Gamepad" (vendor 28de) and the raw device appear, the 28de one wins while Steam runs.
- On `blur`, `visibilitychange` or disconnect, every held action is released (a pan or an applied tool must not stick).
- It calls `poke()` (the auto camera's idle timer; otherwise the auto camera takes over while someone plays with the
  pad) and `hideIntro()` like a key does.

**Glyph families.** Detection order:

1. The desktop app: Steam's controller type over IPC (`steamworks.js` `input.getControllers()[i].getType()`). It
   reports a Steam Deck controller even though the game sees an Xbox pad.
2. The `id`'s vendor: `054c` PlayStation, `057e` Switch, `28de` Steam, `045e` or `XInput` Xbox.
3. Otherwise Xbox-shaped generic glyphs.

Settings → Controls offers "Button prompts: Auto / Xbox / PlayStation / Switch / Steam Deck", because detection
fails often enough: Windows' XInput ids carry no vendor, and neither do Proton builds. That's a display choice, not
rebinding.

**Focus.** There's no maintained vanilla-JS spatial-navigation library (Norigin's is React, and the WICG polyfill was
archived in March 2026), so we write about 200 lines:

- Candidates come from `data-nav-group` containers.
- Scoring is distance along the direction plus twice the perpendicular offset, within a 45° cone.
- Each group remembers its last focused child (naive nearest-rect jumps were the main failure in the one Electron
  Deck port write-up).
- A layer stack (card > Settings > Lab, specimen, Bench > dock) keeps focus inside the top layer, and East pops it.

The pure core takes rects and is tested without a DOM. Panels already "update in place"; focus has to survive that,
which is the same rule as never re-rendering a control under the pointer.

**Text entry.**

- Desktop on Steam: when a text field gets focus while the glyph family is pad, call
  `utils.showFloatingGamepadTextInput` (single-line, the field's rect). It types into the field as OS keys.
- `showGamepadTextInput` (the full-screen one) is the fallback.
- Both only work through Big Picture or Game Mode. Desktop mode needs Steam+X, which the hint says.
- The browser has no system keyboard to call (a decision below).

**Electron and Steam.**

- `electronEnableSteamOverlay()` forces `in-process-gpu` and redraws about 60 times a second. Measure what it does
  to WebGPU before enabling it, and enable it only if the floating keyboard needs it (to be found on the Deck).
- Ship the native Linux build to the Deck rather than Windows under Proton, so the pad's id keeps its vendor.
- The Steamworks setting: Steam Input template "Gamepad", "Any Future Devices", and a recommended configuration for
  every controller type, so nobody is asked to choose. The alternative is a decision below.

## Touch on the Deck

Found on a Deck in Game Mode (2026-11-20, debugged live over SSH and Chrome's remote debugging): by default gamescope
does not pass the touchscreen through. A tap reaches an X11 game as an emulated mouse click (or, depending on what
else is set, as a pen whose release never comes), single-touch only: buttons answer, but nothing that drags, pinches
or presses the world does. Steam passes real touch through only when the game asks for it:

- **The release setting:** Steamworks → the app → Steam Deck Touchscreen → **Touch API Pass-through**
  ([Steamworks Steam Deck FAQ](https://partner.steamgames.com/doc/steamhardware/steamdeck/faq)). Without it Steam
  emulates a single touch with a mouse pointer.
- **Before there is an app id (a non-Steam game):** the controller layout's Default action set → gear → Add
  Always-On Command → System → **Touchscreen Native Support**. (`gamescopectl touch_click_mode 4` does it by hand
  for a running game.)
- Touch then reaches Xwayland as an XInput2 direct-touch device (`xwayland-touch`), which Chromium does not take for
  a touchscreen (`navigator.maxTouchPoints` stays 0). The desktop app turns on `--touch-events=enabled` under
  gamescope (`desktop/main.js`), and the page gets proper touch pointers, every finger its own: taps, drags, pinches,
  the loupe placed and dragged, as on a phone.
- Running the app as a native Wayland client (`--ozone-platform=wayland` on `gamescope-0`) gets real touch too, but
  Steam's gamescope session shows only X11 windows (it is not started with `--expose-wayland`): the game runs
  unseen behind the spinner.
- Rebuilding touch from the emulated mouse and pen was tried and dropped: single-touch only, and a lost release left
  a pointer pressed forever.

## Pitfalls and how each is met

| Pitfall | Answer |
|---|---|
| `getGamepads()` is empty until a button is pressed (fingerprinting gate) | Never treat "no pad" as final; the first button press is the gesture. The opening menu says "Press any button" once a pad is plugged in but hidden (where the browser fires connect) |
| A pad press isn't a user activation in browsers: audio can't unlock and fullscreen can't be requested from a button | [verify in Chrome] The page's sound unlock waits on a click or key today; in the browser, the first pad press shows a "Click or press a key for sound" chip; Electron sets `autoplayPolicy: 'no-user-gesture-required'` and does fullscreen over IPC already |
| Polling stops in background tabs; Safari sends input only to the frontmost tab | Release all held actions on `blur`/`visibilitychange`; nothing depends on input arriving while hidden |
| Stick drift | Radial scaled deadzone 0.18; the rose's centre zone 0.35 |
| Hints flicker (the Deck's trackpad is a mouse) | Glyph family changes on keys and buttons only (above) |
| Triggers as buttons in one browser and axes in another (older Firefox on Linux, unmapped pads) | `buttons[6/7].value`, axis fallback, threshold on value, never `pressed` |
| Duplicate pads (Steam's virtual pad and the raw one) | Prefer vendor 28de while Steam runs; else the last one pressed drives |
| No vendor in Windows XInput and Proton ids | Steam's type over IPC; the Button prompts setting |
| Nintendo layout | Positional mapping, positional glyphs: the Switch glyph family draws B at South |
| A pad unplugged mid-hold | Disconnect releases everything; a toast names it |
| Auto camera takes over while playing with the pad | `poke()` on any pad input |
| The intro dismisses itself under webdriver | `pad-check` covers the menu with menu-check's way of keeping it |
| Focus lost when a panel updates in place | Remember by `data-nav-id`, restore after updates; test it |
| Rose mis-select on release | 120 ms grace on the last octant; centre cancels |
| Firefox needs flags? | No for input; rumble is unshipped there, so haptics are optional everywhere |

## Tests

Keyboard first, since there are none:

- **`tools/keys-check.mjs` (phase 0, before any refactor).** In the built page it presses every key in the current
  map and checks the observable result through `__tidemote` and the DOM: trails cycle, maps on, tool in hand, ride
  on, Escape's thirteen steps in order, the tool quasimode, Shift+R's confirm, and that keys don't act while the card
  is open or a text field has focus. It pins down today's behaviour so the action table can't change it unnoticed.
  `TIDEMOTE_VK=1` on Linux, `gpu-node.sh` under WSL.
- **`test/actions.test.js`.**
  - Every action has a key, a pad input or a stated reason.
  - No two actions share an input within a context.
  - Every label is a message in `en.json`.
  - The help rows come out with both columns, and every family has a glyph for every pad input.
  - `matchKey` maps each key of the old chain to its action, as a table: a unit-level copy of keys-check.
- **`test/pad.test.js`.** `padStep` on recorded snapshots:
  - deadzone and scaling, edges, tap against hold at the threshold, d-pad repeat
  - triggers by value and by axis
  - release-all on disconnect, blur and visibility
  - picking one of two pads (28de over the raw one)
  - a non-standard pad
- **`test/mode.test.js`.** Sequences of events:
  - mouse moves after a button keep pad glyphs
  - a key flips to the keyboard
  - a click hides the reticle but keeps the family
  - a lone Shift doesn't flip
- **`test/rose.test.js`.** Sectors, hysteresis at the borders, the grace window, centre cancel.
- **`test/focus.test.js`.** Spatial scoring on synthetic rects, the remembered child, the layer stack.
- **`tools/pad-look.mjs`.** What the eye sees, at 1280×800 in device pixels ×2 (screenshots into `runs/ui/pad-look`
  to look at, and checks):
  - every control of every panel (each Settings and Lab tab, the bench, the specimen, the dock, the Controls)
    focused in turn: its ring never cut by an ancestor that clips (words in a line take a tint and a thick
    underline instead of a ring);
  - no label running into its control, no chip wrapping or overflowing, Settings' foot on one line;
  - each family's glyphs photographed and each label's ink measured centered in its outline (pngjs);
  - sliders taken hold of and stepped, a term's hint by A, View never opening the Controls however slow the press,
    the loupe staying on a cell as the panel opens, each instrument in focus while A holds it, the pipette's X and
    its legend, the mouse pointer hidden while the pad points;
  - touch (a Deck's screen): a pinch zooms, a tap sets the loupe's lens and a drag moves it.
  It was written after a first round of controller work passed every functional check and still showed clipped
  rings, a broken Settings row, off-center glyphs and a jumping loupe: run it after any change to panels, styles,
  hints or the legend.
- **`tools/pad-check.mjs`.** It drives the built page with a fake pad. An init script replaces
  `navigator.getGamepads` with a scripted object and fires `gamepadconnected`. It runs at laptop size and at
  1280×800:
  1. Pressing a button reveals the pad; South on Begin starts the world.
  2. The left stick pans (`cam.x` moves) and RT zooms.
  3. South selects (the specimen opens) and X rides; the stick steers (`ride.at` or way set); South hops.
  4. East walks back the same thirteen steps as Escape.
  5. LB rose picks the lamp; RB rose turns on the light map; the centre cancels.
  6. Menu opens Settings; the d-pad moves focus; South toggles an option; LB/RB change tabs; East closes.
  7. View opens the Lab, and held still only the Lab; Settings' Controls opens the Controls dialog with both columns.
  8. The hints show pad glyphs, then keys after a key press, and a mouse move doesn't change them.
  9. Unplugging mid-pan stops the pan.
- **Unchanged and run after each phase:** `ui-check`, `ride-check`, `menu-check`, `lineage/nav-check`,
  `test/i18n.test.js` and `ui-audit`. The `ui-audit` run adds a 1280×800 size and a pad-mode pass: focus rings
  visible, nothing under Valve's 9 px at 1280×800 (our 11 px rule is stricter).

## Deck Verified, item by item

From Valve's compatibility page:

| Criterion | How we meet it | Checked by |
|---|---|---|
| Supports the Deck's physical controls | The pad layer | pad-check; the Deck walkthrough |
| The default controller configuration reaches all content | Tiers 1–3 cover every panel by focus; what isn't bound (volume, fullscreen, readouts) is in Settings | Deck walkthrough: every Settings tab, Lab tab, card, save, Workshop |
| No in-game setting needed to enable the controller | Always on; the glyph family follows input | pad-check from a fresh profile |
| Glyphs match the input; no keyboard glyphs from Deck inputs | Glyph family rules; Steam type → Deck glyphs | pad-check (mouse moves don't flip); Deck |
| Text entry by the on-screen keyboard | `showFloatingGamepadTextInput` on focus | Deck: name a species, name a save |
| Launchers navigable by controller | The opening menu is a panel | pad-check step 1 |
| Default resolution supported; text ≥ 9 px at 1280×800 | 1280×800 at dpr 1; our 11 px floor | ui-audit at 1280×800 |
| Playable default performance | Auto count and the speed adaptation | `tools/perf/bench.mjs` plan on the Deck (Linux build) |
| No compatibility warnings | None shown today | Deck walkthrough |

## How we'll know it works

- The tests above pass, and the old browser checks pass unchanged.
- **The Deck walkthrough.** A written script in this doc's appendix, to write in phase 5, run on a real Deck in Game
  Mode without touching the trackpads or the screen. It covers every row of the Deck table plus the first-ten-minutes
  list.
- **The first-time player.** Someone who has never seen Tidemote gets only a controller and the nine tasks above, with
  no help. We note where they stall, how long each task takes and what they try first. Wherever they reach for a
  binding we didn't choose, that's evidence to change it.
- Valve's review, when the app is submitted.

## Phases

Each phase ends with its checks passing.

0. **Pin the keyboard.** `tools/keys-check.mjs` against today's build. No code changes.
1. **The action layer.** `actions.js`, `act()`, `back()` and the extracted functions; the `keydown` chain becomes
   `matchKey`. The Controls dialog is generated from the table (keyboard column only so far, now listing `?`,
   right-drag, the hold and Backspace). Hints take `data-act`, and `tip.js` draws the keys. A Controls button goes in
   the dock's Settings → About and next to `?`. Checks: keys-check identical, i18n, ui-check, ride-check, menu-check.
2. **The pad in the world.** `pad.js`, `mode.js`, `glyphs.js`, the reticle, the world and ride bindings, the d-pad's
   speed, the Controls dialog with both columns, hint swapping, Settings → Controls (Button prompts). Checks:
   pad-check steps 1–3, 7–9 and the unit tests.
3. **Panels.** `focus.js`, the layers, tabs on the bumpers, sliders, the opening menu, the card, the Bench drawer,
   picking up mini-cards. Check: pad-check steps 4 and 6, focus surviving panel updates.
4. **The roses.** `rose.js` and its two rings, adapted from the C-ring mock to pad glyphs. Check: pad-check step 5.
5. **The Deck.** Steam type over IPC, the floating keyboard, the overlay decision measured, the Steamworks Steam Input
   configuration, the Linux build on the Deck, the walkthrough script and its run, the Deck table checked off, a perf
   plan on the Deck.
6. **Finish.** Keys in the guide's prose by argument, haptics where they mean something (a needle's prick, a cell
   pulled into the pipette; optional and off in Firefox), and the first-time player test with changes from it.

## Decisions (2026-11-19)

1. **The world keeps running while a rose is open.** Frostpunk pauses, because its time costs the player; here
   nothing is at stake and watching is the point.
2. **No built-in on-screen keyboard in the browser.** Names stay as generated; the desktop uses Steam's keyboard.
3. **Steam Input's default template: "Gamepad with Mouse Trackpad"**, tested against "Gamepad" on the Deck. The glyph
   rules make the trackpad's mouse safe. Set in Steamworks, not in code.
4. **The keyboard gains camera keys.** W A S D and the arrows pan (steering a ride while riding), − and = zoom while
   held, as maps and image viewers do. The volume keys they replace were the least used: Settings' slider and the
   system's own keys remain.
5. **Glyph art.** The recommendation was Kenney's CC0 input prompts, restyled. For now glyphs.js draws its own (letters
   and simple shapes in the page's line style, no logos): one file to swap for Kenney's art.

## Sources

- W3C Gamepad: https://w3c.github.io/gamepad/ (gesture gate, standard mapping, `timestamp`, haptics,
  permissions policy); MDN, Using the Gamepad API:
  https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
- Chromium id formats: https://lists.w3.org/Archives/Public/public-webapps-github/2020Jun/0361.html; XInput ids
  without vendor:
  https://chromium.googlesource.com/chromium/src/+/00b1750b7cc977e46ff486e2543f45dc706040a6/device/gamepad/xinput_data_fetcher_win.cc
- Firefox on Linux, evdev and trigger bugs: https://bugzilla.mozilla.org/show_bug.cgi?id=1680982,
  https://bugzilla.mozilla.org/show_bug.cgi?id=1903371, https://bugzilla.mozilla.org/show_bug.cgi?id=1434408;
  rumble unshipped: https://bugzilla.mozilla.org/show_bug.cgi?id=680289
- Steam Deck compatibility criteria: https://partner.steamgames.com/doc/steamdeck/compat; recommendations (mixed
  input, flipping prompts): https://partner.steamgames.com/doc/steamdeck/recommendations
- Steam Input for developers (virtual Xbox pad, default configuration):
  https://partner.steamgames.com/doc/features/steam_controller/getting_started_for_devs; templates:
  https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices; radial
  menus: https://partner.steamgames.com/doc/features/steam_controller/radial_menus
- ISteamUtils (floating keyboard): https://partner.steamgames.com/doc/api/ISteamUtils; ISteamInput (types,
  glyphs): https://partner.steamgames.com/doc/api/ISteamInput; steamworks.js API:
  https://github.com/ceifa/steamworks.js (client.d.ts)
- Steam virtual pad ids: https://blogs.gnome.org/alicem/?p=7853; duplicate pads:
  https://github.com/ValveSoftware/steam-for-linux/issues/11215
- Chrome on Deck and templates:
  https://www.gamingonlinux.com/2022/03/chrome-on-steam-deck-now-supports-the-deck-controller-with-geforce-now-working/
- An Electron Deck port (focus groups, layers):
  https://brainhub.eu/library/making-electron-apps-steam-deck-compatible
- Deadzones: https://www.gamedeveloper.com/disciplines/doing-thumbstick-dead-zones-right
- Frostpunk 2's radials and time on the d-pad:
  https://news.xbox.com/en-us/2025/09/18/adapting-frostpunk-2s-depth-to-a-gamepad/; Factorio's controller support:
  https://factorio.com/blog/post/fff-368
- Spatial navigation: https://www.w3.org/TR/css-nav-1/, https://github.com/WICG/spatial-navigation (archived),
  https://github.com/NoriginMedia/Norigin-Spatial-Navigation

## Appendix: the Deck walkthrough

Run it on a Deck in Game Mode, with the desktop build installed through Steam (or added as a non-Steam game while
there is no app id), Steam Input on "Gamepad with Mouse Trackpad". Use the controls only at first: no trackpads, no
touchscreen (step 15 tries those). Note each step that fails, and where you reached for something else.

1. Launch. The intro waits on Begin; A begins. The legend over the dock shows Deck buttons (A, B, L1, R1, ⧉, ≡),
   never keys, and fades a few seconds after the last button; a button brings it back, the sticks and triggers do not.
2. The left stick pans; L2 and R2 zoom; R3 resets the zoom. D-pad ↑ starts the auto camera (the legend hides), ↑ again
   moves on, the stick takes the camera back.
3. Put the reticle on a cell and press A: the specimen panel opens, and the loupe stays on the cell. The right stick
   scrolls the panel. Y goes into it; the d-pad walks its fields, past the fold; R1 and L1 change its tabs, pressed
   fast too, never reaching the world; A on +n shows every tag; A on an underlined term shows its hint; B comes out.
4. X rides; the stick steers; A hops to kin; B gets off.
5. D-pad ↓ pauses and resumes, ← and → change the speed.
6. Hold L1: the tool rose. Point at the lamp, let go: the lamp is in hand. A held lights; the stick sweeps it. The right
   stick changes its reach. L1 tapped puts it down, tapped again takes it back. The needle and the cold probe come
   into focus in the water while A is held. The pipette: A loads, X switches to dispensing (the legend says which).
7. Hold R1: the view rose. Turn on the light map, then the currents; B clears the map.
8. R1 tapped: the bench, focus in it, the legend above its drawer. R1 again closes it.
9. ≡: Settings. R1 and L1 change tabs, the d-pad walks the rows (and the option grids: Controller's Steam Deck is
   reached from above and from the left), A chooses and focus stays on what was chosen. A slider: the d-pad passes
   it until A takes hold (cyan), then the d-pad steps it and the stick sweeps it; A or B lets go. Display → Full
   screen. Worlds: save the world; A on its name field opens Steam's keyboard. B closes Settings.
10. ⧉: the Field Lab, focus in it. Tabs by the bumpers, a species opened, its card: A on Card, then its name field
    (Steam's keyboard), then B closes the card and the Lab gives focus back. ⧉ held long: still only the Lab.
11. From the dock (Y with no side panel open), d-pad ↑: the rail at the top; A on a gauge explains it; ↓ comes back.
12. Settings' foot → Controls: the Deck's buttons beside the keys. B closes them.
13. Settings → Display → Controller: Xbox, then back to Auto. Settings → Worlds: open the saved world.
14. Suspend the Deck mid-pan and wake it: nothing is still held.
15. Touch and trackpads: a pinch zooms, a tap with the loupe sets its lens and a drag moves it; the right trackpad
    moves the mouse (the pointer shows; the legend keeps the Deck's buttons) and the pad hides it again.
16. Read every text on the screen at arm's length: nothing too small (ui-audit checks 11 px at 1280×800). Note the
    frame rate the page settles on (Settings → Perf).
