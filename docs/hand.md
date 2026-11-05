# The hand

How a viewer acts on the world: the bench's tools, riding a cell, the pipette, and the cabinet that carries species
between worlds. The plan, its options and its reasons are in docs/interactivity-2026-10-27.md; this is what was
built, and where it differs.

**The rule.** The hand does nothing the world cannot do by itself. Every tool is a local cause (a lamp is more sun
on one place, the rod a grain rolling through, the needle a hunter, the pipette a current that carries cells off), as slow as the
world, and bounded by physics rather than by limits on what it may do. Nothing in it reads the census.

## The hand's words

`src/hand.js` keeps the tool in hand and eases what it does into the engine's hand words (`eng.hand`, the `Hand`
struct after the raindrops in `simWGSL`'s `Sim`). In every headless run they are zero and their ids `NONE`: each
term they add to the step is an added zero or a branch never taken, so the gate's world is the page's without a
hand.

| Tool | Key | What it does | In the step |
| --- | --- | --- | --- |
| Pan | 0 | Nothing in hand: a drag pans, a click examines | none |
| Loupe | 1 | The lens: it follows the mouse; on a touch screen a tap examines a cell and sets the lens over it there in the world (it goes with the world as the view pans, off the screen and back), a drag on the lens moves it and a drag outside it pans. Reach sizes it, `[` `]` magnify | none |
| Touch | 2 | A glass rod, coming down from near the top of the field: pressed, it dips into the water over a third of a second, its end (a disc widening to the reach as it goes deeper) pushing every cell and grain under it out to its rim; dragged, it pushes what it passes aside, out of its path to the side it was on, as the water parts round it. Moving, it stirs the water: every 0.1 s it leaves an eddy carrying the water about it at 0.6 of its velocity, fading over 1.2 s (`WAKE`), so a stroke leaves a current, a circling one a vortex that dies away (stirred for 4 s, the water about it turned at 1.7 units a second, 0.4 two seconds later, none after five), and a stroke turned back on itself sends out a ring wave. A tap rings the water from a raindrop slot | `rodPush` in `handPush` (`cellWGSL`, `matterMain`, `cystStep`); `wakeFlow` in `openFlow` (cells, grains, heat) |
| Lamp, Shade | 3, 4 | Over the world a quarter of it follows the pointer; pressed, all of it: light added (up to 0.6, the noon sun is about 1) or taken (up to 90%) over the reticle's disc. It goes where the pointer goes and off the world with it: nothing is left behind | `lampLight` in `lightAt` (photosynthesis, sparks, the sun's heat), the phototaxis slope |
| Warm, Cold | 5, 6 | The same quarter and all: the water under the disc drawn, 80% of the way a second (`STAGE.rate`), toward a temperature that share of the way from the open water's to the stage's 115° (`STAGE.hot`) or the probe's −20° (`STAGE.cold`). Water boils at 100° (`BOIL`) and is never hotter (`heatMain`'s last `min`, an identity below it). The water it leaves keeps its heat and gives it up as any water does. From about 45° the air dissolved in it comes out as small bubbles, swelling as it warms; near a boil vapor bubbles swell, wobble and collapse over the hot glass, each collapse sending out a faint ring and leaving specks of air, and the view roils. Each bubble is drawn as a microscope shows one (`bubLook`): a bright line where light glances off its edge, a crescent toward the lamp, red parted from blue, a dark band of total reflection inside it, the lamp gathered to a spot off its center, what lies beyond it shown smaller through it (`bubblesAt`), its outline an oval or lobed, specks clinging to it; most small and a few large, some up by the coverslip far out of focus (spread, dim, ringing), some in twos and threes sharing a flat wall. They drift with the current as the cells and silt around them do and sway with the water's surface: each lives a few seconds, carried whole from where it began (`bubGen`, `bubSet`), growing in and dissolving away as the next ones come. Ice is the water's own phase (`heatMain`'s ice block, docs/catastrophes.md): water below 0° freezes, giving up its latent heat (`iceLatent`) first, and ice above 0° melts, taking it in. So the probe freezes the water under it as the frost's night does, and the stage melts any ice, the frost's too (a frost's night freezes the hole again after); the ice it leaves thaws as the water about it warms it. Its edge holds back the water as the frost's does (`pondWith`), crystals growing ahead of it (drawn by `iceLook`, `frazil`); past the edge's film what lies in it (cells, cysts, husks, grains) is frozen solid, carried by no current and moved by nothing (`inIce`) | `heatMain`; `poolOver`, `extremes`, `shimmer` in the composite |
| Needle | 7 | Pressed, the needle is let down into the water from the lower right, steeply, so only its last 1.2 units are in it (`NEEDLE.wet`; the rest of it, over the water, rises out of focus and touches nothing): its point (within 0.12, `NEEDLE.kill`) pricks every cell it touches, as a hunter's kill does, its carcass left; its shaft, tapering over 3 units to 0.45 (`NEEDLE`), pushes the other cells and grains out of its way; a drag cuts every bond within 0.32 of the point's stroke. A tap also pricks the cell nearest it (within 36 px on a touch screen) | `resolveCount`; `cutAt` in `keepBond`; `needlePush` in `handPush` |
| Pipette | 8 | Draws up and sets down (below) | `suckFlow` in `cellWGSL`; the take in `resolveCount`; `inject*` |

The needle and the rod sweep: each step they push aside what lies in them and what they passed over since the
world last stepped (`hand.stepped()`, after a frame with steps: frames the world does not step in, at 120 Hz or at
Max, add to the stroke rather than losing it), so however fast the stroke they carry what they meet along rather
than leaping over it. The lamp, shade, stage and probe act on a disc that fades only over the outer 6% of the reach (`disc`), so what
they do fills the reticle's ring.

A tool's key, or its tile, again puts it down (Pan, nothing in hand). Reach (`[` `]`, ⇧ wheel, the slider) is a world distance
shared by every tool but the needle, 35 µm to 470 µm; with the loupe it is the lens's size. The composite shows the
lamp and the shade by the light they leave (`sceneLit`, docs/look.md: what lies under the lamp lit amber, the floor glowing; under the shade, dimmer), Warm and Cold a thermal lens inside their reach (`lensAt`:
the thermal camera from `STAGE.cold` to `BOIL`, isotherms every 5°), and the instruments that go into the water
(`instrument`, from the page's `eng.tool`): the needle's steel, the pipette's glass (bending the view through it),
the cold probe's frosting steel, each from its side of the field, and Touch's glass rod from near the top, faintly glowing, its end
the disc it pushes with; the needle and the rod rise out of focus along their length past the water; out of focus over the water as the pointer
moves and sharp in it while pressed. They are drawn in the view's own coordinates, once, never round the world's
edge.

## Riding

Enter, the specimen panel's Ride, or the first press of W A S D or an arrow key with a living cell selected, rides
the specimen: the view follows it (untouched, a ride is a follow; there is no separate Follow), and W A S D, the
arrows, or a held click or finger steer it. The toasts say Ride On and Ride Off (with why, when it died or was lost). While riding those keys only steer
(the keys they would otherwise be are elsewhere: C currents, H the tide map, P the auto camera, M sound).

How it handles (`src/ride.js`, pure, `test/ride.test.js`): the way held (keys, a unit vector, diagonals no faster;
a held pointer, toward it, slower within `RIDE.reach` of the cell) drives a throttle through a critically damped
spring, `RIDE.up` (0.4 s) toward a way held and `RIDE.down` (0.14 s) back to rest or against its motion: top speed
(90%) after about 1.6 s held, a 0.1 s tap carries a cell 0.07 units and a 0.3 s press 0.26, so taps edge it. The
page sends the will as a velocity, the throttle times `willSpeed(g)` (`K.will` world units a second for a full
swimmer, `K.willDrift` of that for a cell adrift, `K.willAnchored` of it again for one anchored), and its hold
(`hand.ids.z`) as `throttleGrip`, full from half the throttle: let go, the hold is 0 and the cell goes its own way.
In `cellWGSL` the cell takes the will on at `K.willGrip` a second times its hold, whatever else drives it, none on dry
ground; its upkeep is `K.willCost` times its metabolism times the hold and the share of top speed.

A body is steered whole: the cells bonded to the rider, and every cell of the body the page traced (its members,
sent to the steps as sorted IDs in the hand's words, `H_RIDE`, `Engine.setRideBody`), take on the same velocity, so
the pull no longer stretches the rider out of its body. Stone is a wall to it: the part of the will into stone a cell
is pressed against (`stoneF`) is lost, and stone pushes it out again after the will, so a ridden cell or body slides
along stone (a calcifier, which settles on stone, as much less as it calcifies).

The camera dives to it: from a view whose shorter side spans more or less than `RIDE_CAM.keep` times
`RIDE_CAM.short` (3.4 world units, or 1.3 of the body's span across, up to twice 3.4: a big body is framed about the
ridden cell, not whole), it springs (in log of the span) to that within about a second, never faster than
`RIDE_CAM.maxRate` (7% a 60th of a second, so a dive from the whole world takes about 1.5 s), against the auto
camera's 9 to 32 s flights, panning in more gently over the first second; then the view widens with the smoothed speed as a share of its top speed (`willSpeed`), at most
`RIDE_CAM.wide` (22%) at top speed, and closes in again as it slows. A scroll, a pinch or Z leaves the zoom to the viewer for the rest of the ride.

Getting off: Enter or Esc; a quick click (or tap) on another cell selects it and gets off (a click on the ridden body,
or on nothing, does nothing, so a quick steer never gets off by mistake); panning, taking up a tool, or opening a
species. If the ridden cell dies as one cell of a body that lives on, the ride goes on in another cell of it (the body
keeps the will meanwhile); if it was alone, or its whole body died, the ride ends where the view is and the panel
offers Ride a relative (Enter or Tab), the nearest of its kind. Coarse steps cannot be steered: above ×2 the ride is a
follow. A cyst sleeps (`cystStep`) and cannot be steered; the page says so. The specimen's Behavior shows the Will among its drives (mind word 66). Tab goes on to the newest kin near it (a child just budded) or the nearest of its kind.

## The pipette

Drawing up: a press (a click is a 0.15 s pulse) draws the living cells about the tip toward it, as a current would:
from 0.35 units at 1.5 units a second, out to the reach at 16 as it is held for a second and a half (both by the
square of how long it has been held, so a click takes a cell or a few; `hand.suck`: the tip, how far, the speed; `suckFlow` moves a cell after its speed is capped, so the draw is not bounded by its swimming).
Within 0.3 of the tip a cell is taken (`resolveCount` copies it out, its partners by ID, and returns the grain it was
built of to the world's silt, somewhere at random). Let go, it stops, but for the cells bonded to one already taken: their IDs go to
the engine (`setDrawn`), and they follow the tip in at 6 units a second while it stays within 2 units of its reach
(pulled away faster, it lets them go). A bond stretched past `bondBreak` breaks as any bond does, so a loose body
tears and a tight one comes whole. What came in is kept once nothing more is coming: each species' cells, as bodies
(`bodiesOf`: the bonds among them), each in the order it will leave, every cell after one it touches, at the tip.
What it holds is seen in the pipette's bore, a column of cells up the glass in the order they will leave, the next
at the tip, what is coming in nearest it (`drawBore` in `src/main.js`): drawn up, the column rises as cells come in
under it; dispensed, it slides down and out of the tip as they leave, in step with them. The engine draws them as
the cells they are (`setTube`: up to `TUBE_N` records as `struct Particle` and the genomes of up to `TUBE_K`
species, bound in place of the world's; `vsTube`/`fsTubeLive` in the main view's pass, `cellColor` as every cell),
as out of focus as the glass about them: the pipette comes into the water aslant, sharp where it is in the water
and more out of focus the farther up it, and all of it raised over the water before a press (`PIPETTE_DOF`, in the
composite's `toolAt` for the glass and in each record's vel for its cells; each pixel the mean of sixteen samples
over a disc that wide, turned and spread anew at every pixel and frame, so they blend to a fine grain the trails
smooth). Out of focus, the glass's walls spread as wide as the blur and dim as they spread. The readout names the mode in a chip, Load, Dispense or Full (⇧ held, the other, before the
press), a bar under it filling with the pressure.

Setting down: with Dispense on (beside the pipette's strip, and on a phone's held strip; Load, the default, draws up),
or ⇧ and a press, squeezes the tip's run out, then the run before it, pushed on their way, at a rate that rises as
it is held (`SPIT`: 10 cells a second pressed, 600 at full pressure, by the pressure squared). The cells come due
with the time and each frame sets down what is due (`spit.owed`; a frame owes for a quarter second at most, so a
stall never dumps, and a set-down that held fewer than were due carries only a little over), organism after organism
and run after run in one set-down (`mergeJobs`: up to `PIPE_SP` species), so a stack of short runs flows as evenly
as one long one. A set-down none of whose cells were placed (no grains of silt taken) tries again the next frame,
and only after three such a moment later; a species whose slot was taken finds any free one (`injectSlots` tries
every slot in turn after its random few). A click sets down one
body, or a card's colonies, whole; held, one after another. Each cell keeps the bonds it kept: to cells leaving with
it, and to cells already out by the IDs they were given (`setDownJob`: up to `PIPE_IDS` earlier cells, found by
`injectCells`; `injectBonds` restores each keeper's slot), so a tree comes out a tree. The particles are a fixed number, each
something (silt, a husk, a cell), so the pipette borrows: a cell it takes becomes a grain of silt somewhere at
random in the world, and a cell it sets down is made of a grain of silt from anywhere (`injectCells`: each grain
takes part with the chance the page gives, about half again as many as are needed; `injectSlots`: the species
takes back its own slot if it still holds it, or a free one). What it moves arrives as it left, whatever lies at
the tip, and the world's silt is as it was; a card's colony is made of the world's silt as it leaves. With no silt
left in the world at all, it says so by the tip.

The contents are the world's (`life.pipette`, kept in saves): a stack of runs of one species each, the last in at the
tip, shown so in the strip from the left. A species drawn up again after another is a run and a card of its own
(5 of A, then 2 of B, then 3 of A: A ×3 at the tip, B ×2, A ×5); two runs of one species side by side are one, so a
card dragged next to its species' joins it, and Sort makes every species one run, where the one nearest the tip
was. The bore shows the same order. A tap opens its card, a drag along the strip moves it (the others make way), onto the world sets all of it
down there, onto the Lab keeps its card (or, kept already, shows it in the cabinet); on a touch screen a swipe scrolls
the strip and a card held a moment lifts. A mark in its corner says its card is in the cabinet; Save all saves every
card not saved yet, one after another, counting them. It holds 2,048 cells.

## The cabinet

A species card carries its genome: a payload (`TMG1`, the save format's major, `G_WORDS`, its name and home water,
whether its world was touched, the words, a checksum; `src/cabinet.js`) in the PNG's text chunk and in the QR code in
its corner, which holds a link (`https://tidemote.com/#card=…`) that opens Tidemote with the card: a phone's camera
pointed at a laptop's screen carries a species from one world to another with no server. The link shows the card
first, drawn without the GPU (`strangerCard`), to save or go on; the world starts, its shaders compiling, only then,
and the card goes into the cabinet. A card of another format
is refused, as an old save is. The QR encoder is `src/qr.js` (byte mode, level M), checked against a decoder.

The specimen's Save keeps the card (drawn with its portrait, as a PNG) in the cabinet, an IndexedDB store beside the
saved worlds, and the card presents itself and shrinks to the Lab; once kept, the button is Card. The Field Lab's
Cabinet tab shows every card ever kept as mini-cards, filtered by where it is from (this world or other waters),
diet and body. A card of this world opens its live card (to rename it, load the pipette); another world's opens as it
was drawn. Dragging one onto the bench, or Load the pipette, puts a colony of it (the founding's colony size) in the
pipette, its cells made as newborns when set down: a stranger takes a serial of this world and founds a lineage, as a
spark does, keeping its card's name and home water (`life.carried` until the census meets it), and its later
colonies join that lineage. Dragged straight onto the world, a card sets its colony down where it is let go (a run of
its own in the pipette, spat out at once, whatever else the pipette holds). A card's × (on a mouse, when the card is
under it), or Remove from cabinet on its card, takes it out; Undo beside the cabinet's count puts the last back for a
while. A card's dialog also plays its song alone (its roll lit as it sounds, `lightSong` in `src/song.js`) beside its
WAV, and, when its species is in this world (its own here, or the one a carried card founded), Inspect opens it in the
specimen panel. A card's PNG dropped on the page, or its link opened, puts it in the cabinet.

**The mini-card** (`src/minicard.js`), the strip's and the cabinet's unit, is a field-guide plate, so a species is
known by sight before its name is read: its portrait, an edge under it split by what it eats (light, grazing, carrion,
hunting in their shares, `dietMix`, in the diet colors), its diet and motion marked on the portrait, its name in two
set lines (the genus, then the rest, each cut at its end, so every card's rows line up), and below it, in the strip,
its diet and motion in words (a stranger: the water it came from), and in the cabinet how its species does here
(*n alive*, kept current in place; *extinct here*; or *from* another water). The strip's count and Tip sit on the
portrait; a phone's held strip has a flat one-row form.

**Portraits.** A species has one portrait, shown on its mini-card and, more of it, on its card. Its cells are drawn
alone, in a studio (`takeStudio`, `src/studio.js`), as it looks in the water: its largest body there (one readback of
its cells, `bestMember`, as Find one looks for it; `bodyPatch` in `src/trace.js`: up to `STUDIO_N` cells about the
body's middle, where they lie), or, single-celled, a few of its densest crowd as they float; not in the water, the
cells the pipette holds (its largest body, laid out by its bonds, `layOut`; else a few of its single cells; else, none
held, a few newborns of its genome). The cells are set still in the close-up in place of the world (`eng.setStudio`,
`specimen.studio`) and drawn as a body in the water is (`vsStudio`: each fused to its bonded partners, pressed flat
against the cells it touches, a tight species' cells filling out to their walls as tissue, from the studio's own
cells, their partners packed in `id`), framed to fill the middle a mini-card shows (`SHOWN`) of a 1280 px square. So a
mat comes out a mat and a filament a filament, and the frame never misses its subject. The card shows the middle of
the same square (`PORTRAIT_SHOWN` of its width, the portrait box's shape). Portraits from the world (a frame of the
close-up aimed at its best member, the rest dimmed) were tried first and dropped: the subject had moved or been taken
by the time the frame was drawn, at some zooms the close-up drew a body's bonds without its cells, and dimming the
rest for that frame dimmed the whole view.

The frame is drawn into a texture of its own and read back (`mapAsync`); a worker (`src/encode.js`, in memory) turns
the pixels into the mini-card's JPEG (192 px, kept as an object URL by key, `setThumb`), the full JPEG and a bitmap
for the card, so taking one holds no frame. A card's PNG is made there too (on the page's thread it held its frame
for 50 to 100 ms, and anything the GPU's 2D canvas draws or scales held the GPU, and the world's frames, on first
use). Portraits are kept by key: `s` and a serial for this world's species, `c` and a card's id for another world's
(the last eight full ones; a card asked for after its picture went is taken again, its mini-card's with it). A card
kept in the cabinet keeps its portrait (`thumb`, `portrait`), so its species' is the same when the page is opened
again; another world's card shows its `thumb` (one cut from its PNG's portrait as it arrives), else, having come by
its link alone, its species drawn alone from its genome. Portraits are drawn one a frame, and each card takes its
portrait in place when it comes. The strip shows
what is being drawn up as it comes in (the first cells' card within a frame or two of the press, a species joining
the tip's run if of its kind), not when the draw is done; a species drawn up before the census ever counted it (a
newborn mutant taken whole) is registered as the census would, and its run keeps that name.

**The species card** is a trading card: its name and where it comes from, its sigil as the emblem in the corner,
its portrait large, three words for what it is, its peak, age and when it arose in big figures over its numbers
through its life, its body and diet as segmented gauges, its water on a thermometer from ice to 45°, and at its
foot whom it eats and who eats it, the chronicler's latest word, its home water and its QR code. Every word is at
least 17 of the card's 660 units, so it reads on a phone; the dialog shows it as tall as the window allows.

## The record

A touched world says so: its acts (`life.hand`, one per tool held, or per run of taps, pricks, pulls, set-downs and
steering in one place) are kept in its saves, a save's meta keeps `touched`, and so does
its cards' payload (the card itself does not say it). The chronicler tells an act as weather a few minutes after it ends, from the species counted in
its reach as it began and after (the pick pass), in its own voice (never "you"): "A light fell on the western waters
for 3 minutes; Thax kaelum bloomed under it, from 4 to 60 cells." An act that changed nothing goes untold (but for a
needle's or pipette's work), and at most once an hour, never twice running, a wry word: "Someone has been at the lamp
again."

## Heard

The hand echoes in the soundtrack (`src/audio/handsound.js`, in the audio thread), clear over the field but never
over it for long: the page sends its acts as they happen (`sound.hand`: a tool taken up, a tap, the rod dipped in or
lifted out, a ring wave, a prick, bonds cut, cells taken or set down, a press with the pipette full, a lens set down)
and, every frame something changes, the tool's state (its level; how fast the rod or the needle moves on the screen;
the water under the stage or the probe; riding and how hard it is steered; the pointer's side of the screen as pan).
Each is the soundtrack's own voices in the world's key:

- taking up a tool: instruments on a metal tray (glass for the rod, the pipette and the loupe, steel for the needle and
  the probe, a switch for the lamp, shade and stage);
- the rod: a fingertip in a basin (a tap plips, dipped in past halfway it gloops, a stir sloshes louder and brighter
  the faster it goes with a bubble now and then, a ring wave whomps, lifted out it plips);
- the needle: a prick is one muted pluck on the pulse; drawn through the water, a scalpel through paper, a dry high
  tearing as fast as it goes, rougher for a moment where it cuts bonds (the engine counts the bonds its stroke
  crosses, `H_CUTS` in the hand region, read back with the pipette's takings as `onCut`);
- the pipette: glass marbles (one for every cell taken, lower for every one set down, about 40 ms apart, those
  that cannot sound within 0.1 s dropped, so the clicks stop when the cells do; a press with it full, a cork);
- the lamp: wind chimes, a chance of one every 0.18 s, better the brighter it is;
- the shade: a low bowed harmonic as loud as the shade is deep, sliding down a step over its first 3 s;
- the warm stage: a heavy pan warming (a rumble as hot as the water under it is, from 30° to 95°, a few low bubbles,
  and from 92° the boil's);
- the cold probe: the pond freezing over (ice cracking in runs of snaps, each a few milliseconds of noise and no two
  alike, a deep crack now and then, only while the water under it freezes; a groan as ice begins under it and a lower
  one as it fills the reach, each sinking three semitones, out of the chord the sea and the drone hold; the whole mix dimming, its highs rolling off, and stepping back as far as the reach is
  ice);
- riding: the ridden cell's song forward (it is the picked species) and the rest of the field back to 0.55, and
  while it is steered the low rush of the water past it, a bubble now and then;
- the loupe: a camera shutter as the lens is set down, on a touch screen only (with a mouse the lens follows the
  pointer, and nothing is set down).

The water under the stage or the probe is read a few times a second (`eng.tempsAt`: the grid cells at its center and
eight points 0.7 of its reach about it, 36 bytes): its center's temperature, how fast the water near 0° there is
cooling (the ice forming, 8° a second and more at full), and how much of it is below 0° (ice).
While the rod or the pipette is at work, the field (but the picked species) steps back to 0.8 (`HandSound.duck`), with
the ice to 0.7, riding to 0.55. The held sounds (the stir, the scalpel, the shade's note, the rumble, the rush) are
single `\air` and `\glass` voices that swell and fade with what the hand does (never a train of notes restarting),
begun when first heard and ended two seconds after they go quiet. The sounds were picked by ear from prototypes
rendered over a captured world; their levels sit each alone about 5 LU under the world's mix.

## The interface

The tools are the dock's middle on wide screens (numbered from 0, Pan, the one in hand in the sun color, the
pipette with its count); B opens the Bench drawer (tiles, a hint for the tool in hand, Reach, the pipette's strip).
The page opens with the loupe in hand, or with Pan on a touch screen with no mouse. Below 980 px the tools live
in the drawer only (a swipe down, or a tap on its handle, closes it), and on a phone a working tool in hand folds the drawer to a held strip
(its key, − reach +, Load and Dispense with the pipette, × to put it down, and the pipette's cards). With a working
tool in hand the reticle shows: a ticked ring of the reach, a cross, and a readout of the tool and what it is doing.
Esc puts the tool down (Pan) before it closes anything else; a digit held down is the tool for as long as it is
held. Right-drag, the middle button and two fingers pan while a tool is in hand. A row that scrolls (the tiles on a
phone, the strip) fades at an edge only where there is more beyond it.

The speed chip opens a ladder of every speed on offer (a double tap: ×1); held, it opens the ladder at once and a drag
up or down moves along it, a speed a rung, taken when let go; open, a drag or the wheel on it does the same. A
phone's dock is seven equal slots, each an icon over its label (Pause, Speed, the Bench naming the tool in hand, Auto,
Sound, Settings, Lab), what is on lit in its color with a bar at the dock's top edge; it has no Slower or Faster.
Below Max, Fast runs as fast but draws every frame. Bloom is Y, reset zoom Z; ? shows the keys.

**Where it differs from the plan.** The thermal lens is new: warming was invisible without it. The pipette tears
bodies by its own draw against their bonds rather than by a walk of the bond graph, so what comes whole and what
tears follow from the body's tissue; set-downs are made of silt from anywhere, taken as they are made, rather than of
grains picked ahead, so a grain eaten meanwhile can never be overwritten. A card's colony that does not fit is refused rather than pushing
the oldest cells out. The ring, the dish, the witness, the controls and mud and stone are not built.
