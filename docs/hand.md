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
| Loupe | 1 (M) | The lens: it follows the mouse; on a touch screen a tap examines a cell and sets the lens over it there in the world (it goes with the world as the view pans, off the screen and back), a drag on the lens moves it and a drag outside it pans. Reach sizes it, `[` `]` magnify | none |
| Touch | 2 | A glass rod, coming down from near the top of the field: pressed, it dips into the water over a third of a second, its end (a disc widening to the reach as it goes deeper) pushing every cell and grain under it out to its rim; dragged, it plows what it passes ahead of it. Moving, it stirs the water: every 0.1 s it leaves an eddy carrying the water about it at 0.6 of its velocity, fading over 1.2 s (`WAKE`), so a stroke leaves a current, a circling one a vortex that dies away (stirred for 4 s, the water about it turned at 1.7 units a second, 0.4 two seconds later, none after five), and a stroke turned back on itself sends out a ring wave. A tap rings the water from a raindrop slot | `rodPush` in `handPush` (`cellWGSL`, `matterMain`, `cystStep`); `wakeFlow` in `openFlow` (cells, grains, heat) |
| Lamp, Shade | 3, 4 | Over the world a quarter of it follows the pointer; pressed, all of it: light added (up to 0.6, the noon sun is about 1) or taken (up to 90%) over the reticle's disc. It goes where the pointer goes and off the world with it: nothing is left behind | `lampLight` in `lightAt` (photosynthesis, sparks, the sun's heat), the phototaxis slope |
| Warm, Cold | 5, 6 | The same quarter and all: the water under the disc drawn, 80% of the way a second (`STAGE.rate`), toward a temperature that share of the way from the open water's to the stage's 115° (`STAGE.hot`) or the probe's −20° (`STAGE.cold`). Water boils at 100° (`BOIL`) and is never hotter (`heatMain`'s last `min`, an identity below it). The water it leaves keeps its heat and gives it up as any water does. From about 45° the air dissolved in it comes out as small bubbles pinned to the glass, swelling as it warms; near a boil vapor bubbles swell and collapse over the hot glass and the view roils. Below 0°, far colder than the water around, it freezes as the frost's ice does, and holds what it freezes as the frost's does (`pondWith`: the water below 0° is ice, its edge the 0° line, while the probe has been at work in the last two minutes, `wake.y`; drawn by `iceLook`), crystals growing ahead of it | `heatMain`; `extremes`, `shimmer` in the composite |
| Needle | 7 | Pressed, the needle is let down into the water from the lower right, steeply, so only its last 1.2 units are in it (`NEEDLE.wet`; the rest of it, over the water, rises out of focus and touches nothing): its point (within 0.12, `NEEDLE.kill`) pricks every cell it touches, as a hunter's kill does, its carcass left; its shaft, tapering over 3 units to 0.45 (`NEEDLE`), pushes the other cells and grains out of its way; a drag cuts every bond within 0.32 of the point's stroke. A tap also pricks the cell nearest it (within 36 px on a touch screen) | `resolveCount`; `cutAt` in `keepBond`; `needlePush` in `handPush` |
| Pipette | 8 | Draws up and sets down (below) | `suckFlow` in `cellWGSL`; the take in `resolveCount`; `inject*` |

The needle and the rod sweep: each step they push aside what lies in them and what they passed over since the
world last stepped (`hand.stepped()`, after a frame with steps: frames the world does not step in, at 120 Hz or at
Max, add to the stroke rather than losing it), so however fast the stroke they carry what they meet along rather
than leaping over it. The lamp, shade, stage and probe act on a disc that fades only over the outer 6% of the reach (`disc`), so what
they do fills the reticle's ring.

A tool's key, or its tile, again puts it down (Pan, nothing in hand). Reach (`[` `]`, ⇧ wheel, the slider) is a world distance
shared by every tool but the needle, 35 µm to 470 µm; with the loupe it is the lens's size. The composite shows the
lamp (the lit water brighter and amber) and the shade, Warm and Cold a thermal lens inside their reach (`lensAt`:
the thermal camera from `STAGE.cold` to `BOIL`, isotherms every 5°), and the instruments that go into the water
(`instrument`, from the page's `eng.tool`): the needle's steel, the pipette's glass (bending the view through it),
the cold probe's frosting steel, each from its side of the field, and Touch's glass rod from near the top, faintly glowing, its end
the disc it pushes with; the needle and the rod rise out of focus along their length past the water; out of focus over the water as the pointer
moves and sharp in it while pressed. They are drawn in the view's own coordinates, once, never round the world's
edge.

## Riding

Enter, or the specimen panel's Ride, rides the specimen: the camera follows it, and a held click or finger, or the
arrow keys, steer it. The will is one more drive in `cellWGSL`, toward the target, `K.will` times its swimming (a
reef, or a producer adrift, cannot be steered), its upkeep `K.willCost` times its metabolism at full strength.
Hunger, fear and bonds still pull; the specimen's Behavior shows a Will row among its drives (mind word 66) and
often it loses. Above ×2 the ride is a follow. Tab goes on to the newest kin near it (a child just budded) or, after
it dies, to the nearest of its kind.

## The pipette

Drawing up: a press (a click is a quarter-second pulse) draws every living cell within the reach toward the tip, as
a current would, at 4 units a second and up to 16 as it is held for a second and a half (`hand.suck`: the tip, the
reach, the speed; `suckFlow` moves a cell after its speed is capped, so the draw is not bounded by its swimming).
Within 0.3 of the tip a cell is taken (`resolveCount` copies it out, its partners by ID, and returns the grain it was
built of to the world's silt, somewhere at random). Let go, it stops, but for the cells bonded to one already taken: their IDs go to
the engine (`setDrawn`), and they follow the tip in at 6 units a second while it stays within 2 units of its reach
(pulled away faster, it lets them go). A bond stretched past `bondBreak` breaks as any bond does, so a loose body
tears and a tight one comes whole. What came in is kept once nothing more is coming: each species' cells, as bodies
(`bodiesOf`: the bonds among them), each in the order it will leave, every cell after one it touches.

Setting down: with Dispense on (beside the pipette's strip, and on a phone's held strip; Load, the default, draws up),
or ⇧ and a press, squeezes the tip species out a cell or two at a time,
pushed on their way, then more at once and more often as it is held: at full pressure by the dozen every 16 ms,
organism after organism in one set-down (`mergeJobs`), as fast as it draws up. A click sets down one
body, or a card's colonies, whole; held, one after another. Each cell keeps the bonds it kept: to cells leaving with
it, and to cells already out by the IDs they were given (`setDownJob`: up to `PIPE_IDS` earlier cells, found by
`injectCells`; `injectBonds` restores each keeper's slot), so a tree comes out a tree. The particles are a fixed number, each
something (silt, a husk, a cell), so the pipette borrows: a cell it takes becomes a grain of silt somewhere at
random in the world, and a cell it sets down is made of a grain of silt from anywhere (`injectCells`: each grain
takes part with the chance the page gives, about half again as many as are needed; `injectSlots`: the species
takes back its own slot if it still holds it, or a free one). What it moves arrives as it left, whatever lies at
the tip, and the world's silt is as it was; a card's colony is made of the world's silt as it leaves. With no silt
left in the world at all, it says so by the tip.

The contents are the world's (`life.pipette`, kept in saves): each species once, in the strip's order (the first at
the tip). A tap opens its card, a drag along the strip moves it (the others make way), onto the world sets all of it
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
Cabinet tab shows every card ever kept as mini-cards, filtered by where it is from (this world, other waters, bred),
diet and body. A card of this world opens its live card (to rename it, load the pipette); another world's opens as it
was drawn. Dragging one onto the bench, or Load the pipette, puts a colony of it (the founding's colony size) in the
pipette, its cells made as newborns when set down: a stranger takes a serial of this world and founds a lineage, as a
spark does, keeping its card's name and home water (`life.carried` until the census meets it), and its later
colonies join that lineage. A card's PNG dropped on the page, or its link opened, puts it in the cabinet.

## The record

A touched world says so: its acts (`life.hand`, one per tool held, or per run of taps, pricks, pulls, set-downs and
steering in one place) are kept in its saves, the rail shows a Hand chip, a save's meta keeps `touched`, and so does
its cards' payload (the card itself does not say it). The chronicler tells an act as weather a few minutes after it ends, from the species counted in
its reach as it began and after (the pick pass), in its own voice (never "you"): "A light fell on the western waters
for 3 minutes; Thax kaelum bloomed under it, from 4 to 60 cells." An act that changed nothing goes untold (but for a
needle's or pipette's work), and at most once an hour, never twice running, a wry word: "Someone has been at the lamp
again."

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
up or down moves along it, a speed a rung, taken when let go; open, a drag or the wheel on it does the same. On a
phone Slower and Faster flank the chip. Bloom moved from B to Y, reset zoom from 0 to Z; H is gone (? shows the
keys).

**Where it differs from the plan.** The thermal lens is new: warming was invisible without it. The pipette tears
bodies by its own draw against their bonds rather than by a walk of the bond graph, so what comes whole and what
tears follow from the body's tissue; set-downs are made of silt from anywhere, taken as they are made, rather than of
grains picked ahead, so a grain eaten meanwhile can never be overwritten. A card's colony that does not fit is refused rather than pushing
the oldest cells out. The ring, the dish, the witness, the controls and mud and stone are not built.

**The species card** is a trading card: its name and where it comes from, its sigil as the emblem in the corner,
its portrait large, three words for what it is, its peak, age and when it arose in big figures over its numbers
through its life, its body and diet as segmented gauges, its water on a thermometer from ice to 45°, and at its
foot whom it eats and who eats it, the chronicler's latest word, its home water and its QR code. Every word is at
least 17 of the card's 660 units, so it reads on a phone; the dialog shows it as tall as the window allows.
