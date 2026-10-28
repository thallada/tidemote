# The hand

How a viewer acts on the world: the bench's tools, riding a cell, the pipette, and the cabinet that carries species
between worlds. The plan, its options and its reasons are in docs/interactivity-2026-10-27.md; this is what was
built, and where it differs.

**The rule.** The hand does nothing the world cannot do by itself. Every tool is a local cause (a lamp is more sun
on one place, a stir a gust, the needle a hunter, the pipette a current that carries cells off), as slow as the
world, and bounded by physics rather than by limits on what it may do. Nothing in it reads the census.

## The hand's words

`src/hand.js` keeps the tool in hand and eases what it does into the engine's hand words (`eng.hand`, the `Hand`
struct after the raindrops in `simWGSL`'s `Sim`). In every headless run they are zero and their ids `NONE`: each
term they add to the step is an added zero or a branch never taken, so the gate's world is the page's without a
hand.

| Tool | Key | What it does | In the step |
| --- | --- | --- | --- |
| Loupe | 1 (M) | Looks; a click examines. Again in hand: the lens on or off | none |
| Touch | 2 | A tap rings the water from a raindrop slot; a drag drags the water within the reach as fast as the finger (up to 12 units a second), in the world's seconds (at ×2 the same stroke is half as fast), and it runs on and slows when let go | `stirFlow` in `openFlow` |
| Lamp, Shade | 3, 4 | Over the world a quarter of it follows the pointer; pressed, all of it: light added (up to 0.6, the noon sun is about 1) or taken (up to 90%) over the reticle's disc. It goes where the pointer goes and off the world with it: nothing is left behind | `lampLight` in `lightAt` (photosynthesis, sparks, the sun's heat), the phototaxis slope |
| Warm, Cold | 5, 6 | The same quarter and all: the water under the disc drawn toward a boil (`STAGE.hot`, 60°) or below ice (`STAGE.cold`, −3°), 80% of the way a second pressed. The water it leaves keeps its heat and gives it up as any water does. Near a boil bubbles rise and the view roils; near ice, far colder than the water around, crystals grow | `heatMain`; `extremes`, `shimmer` in the composite |
| Needle | 7 | A click pricks the cell nearest the tip (it bursts as a hunter's kill does, its carcass left); a drag cuts every bond whose cells lie within 0.32 of the stroke and pushes them out to that distance on either side, so the halves do not bond again at once (a body heals over seconds) | `resolveCount`; `cutAt` in `keepBond`; `scrape` in `cellWGSL` |
| Pipette | 8 | Draws up and sets down (below) | `suckFlow` in `cellWGSL`; the take in `resolveCount`; `inject*` |

Reach (`[` `]`, ⇧ wheel, the slider) is a world distance shared by every tool but the needle, 35 µm to 470 µm. The
composite shows the lamp (the lit water brighter and amber) and the shade, and Warm and Cold a thermal lens inside
their reach (`lensAt`: the thermal camera from `STAGE.cold` to `STAGE.hot`, isotherms every 5°), so warming shows as
it happens.

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
Within 0.3 of the tip a cell is taken (`resolveCount` copies it out, its partners by ID, and leaves the grain it was
built of as silt about the tip). Let go, it stops, but for the cells bonded to one already taken: their IDs go to
the engine (`setDrawn`), and they follow the tip in at 6 units a second while it stays within 2 units of its reach
(pulled away faster, it lets them go). A bond stretched past `bondBreak` breaks as any bond does, so a loose body
tears and a tight one comes whole. What came in is kept once nothing more is coming: each species' cells, as bodies
(`bodiesOf`: the bonds among them), each in the order it will leave, every cell after one it touches.

Setting down: ⇧ and a press (on a phone, Set down and a touch) squeezes the tip species out a cell at a time, now
and then two or three together, pushed on their way; every 110 ms and down to 16 as it is held. A click sets down one
body, or a card's colonies, whole; held, one after another. Each cell keeps the bonds it kept: to cells leaving with
it, and to cells already out by the IDs they were given (`setDownJob`: up to `PIPE_IDS` earlier cells, found by
`injectCells`; `injectBonds` restores each keeper's slot), so a tree comes out a tree. A cell is made of a grain of
silt within reach of the tip (`injectSlots`: the species takes back its own slot if it still holds it, or a free
one), as a spark makes life of silt: the pipette moves and makes nothing, and a card's colony is made, of silt, as it
leaves. Short of silt, it tries again from twice as far, and says so by the tip.

The contents are the world's (`life.pipette`, kept in saves): each species once, in the strip's order (the first at
the tip). A tap opens its card, a drag along the strip moves it (the others make way), onto the world sets all of it
down there, onto the Lab keeps its card (or, kept already, shows it in the cabinet). A mark in its corner says its
card is in the cabinet. It holds 2,048 cells.

## The cabinet

A species card carries its genome: a payload (`TMG1`, the save format's major, `G_WORDS`, its name and home water,
whether its world was touched, the words, a checksum; `src/cabinet.js`) in the PNG's text chunk and in the QR code in
its corner, which holds a link (`https://tidemote.com/#card=…`) that opens Tidemote with the card: a phone's camera
pointed at a laptop's screen carries a species from one world to another with no server. A card of another format
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
steering in one place) are kept in its saves, the rail shows a Hand chip, a save's meta keeps `touched`, and its
cards say "touched". The chronicler tells an act as weather a few minutes after it ends, from the species counted in
its reach as it began and after (the pick pass), in its own voice (never "you"): "A light fell on the western waters
for 3 minutes; Thax kaelum bloomed under it, from 4 to 60 cells." An act that changed nothing goes untold (but for a
needle's or pipette's work), and at most once an hour, never twice running, a wry word: "Someone has been at the lamp
again."

## The interface

The tools are the dock's middle on wide screens (numbered, the one in hand in the sun color, the pipette with its
count); B opens the Bench drawer (tiles, a hint for the tool in hand, Reach, the pipette's strip). Below 980 px the
tools live in the drawer only, and on a phone a tool in hand folds the drawer to a held strip (its key, − reach +,
Pull and Put down, and the pipette's cards). With a tool in hand the loupe's lens gives way to the reticle: a ticked
ring of the reach, a cross, and a readout of the tool and what it is doing. Esc puts the tool down before it closes
anything else; a digit held down is the tool for as long as it is held. Right-drag, the middle button and two fingers
pan while a tool is in hand.

The speed chip opens a ladder of every speed on offer (a double tap: ×1); Slower and Faster left the dock, the keys
stayed. Bloom moved from B to Y; H is gone (? shows the keys).

**Where it differs from the plan.** The thermal lens is new: warming was invisible without it. The pipette tears
bodies by its own draw against their bonds rather than by a walk of the bond graph, so what comes whole and what
tears follow from the body's tissue; set-downs are made of the silt within reach rather than of grains picked ahead,
so a grain eaten meanwhile can never be overwritten. A card's colony that does not fit is refused rather than pushing
the oldest cells out. The ring, the dish, the witness, the controls and mud and stone are not built.

**The species card** is a trading card: its name and where it comes from, its sigil as the emblem in the corner,
its portrait large, three words for what it is, its peak, age and when it arose in big figures over its numbers
through its life, its body and diet as segmented gauges, its water on a thermometer from ice to 45°, and at its
foot whom it eats and who eats it, the chronicler's latest word, its home water and its QR code. Every word is at
least 17 of the card's 660 units, so it reads on a phone; the dialog shows it as tall as the window allows.
