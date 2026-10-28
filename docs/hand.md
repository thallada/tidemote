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
| Touch | 2 | A tap rings the water from a raindrop slot; a drag drags the water as fast as the finger, in the world's seconds (at ×2 the same stroke is half as fast), and it runs on and slows when let go | `stirFlow` in `openFlow` |
| Lamp, Shade | 3, 4 | Held, light added (up to 0.6, the noon sun is about 1) or taken (up to 90%) in a Gaussian of the reach; it comes up in a second and fades over about ten | `lampLight` in `lightAt` (photosynthesis, sparks, the sun's heat), the phototaxis slope |
| Warm, Cold | 5, 6 | Held, 1° a second added or taken at the center of the reach | `heatMain` |
| Needle | 7 | A click pricks the cell nearest the tip (it bursts as a hunter's kill does, its carcass left); a drag cuts every bond whose cells lie on the stroke | `resolveCount`; `cutAt` in `keepBond` |
| Pipette | 8 | Draws organisms up and sets them down (below) | the draw in `cellWGSL`; the take in `resolveCount`; `inject*` |

Reach (`[` `]`, ⇧ wheel, the slider) is a world distance shared by every tool but the needle, 35 µm to 470 µm. The
composite shows the lamp (the lit water brighter and amber) and the shade, and Warm and Cold a thermal lens inside
their reach (`lensAt`: the thermal camera over a span of 10° below the background to 16° above), so warming shows as
it happens.

## Riding

Enter, or the specimen panel's Ride, rides the specimen: the camera follows it, and a held click or finger, or the
arrow keys, steer it. The will is one more drive in `cellWGSL`, toward the target, `K.will` times its swimming (a
reef, or a producer adrift, cannot be steered), its upkeep `K.willCost` times its metabolism at full strength.
Hunger, fear and bonds still pull; the specimen's Behavior shows a Will row among its drives (mind word 66) and
often it loses. Above ×2 the ride is a follow. Tab goes on to the newest kin near it (a child just budded) or, after
it dies, to the nearest of its kind.

## The pipette

Drawing up: the right button (any, while it is empty; a phone's Pull arms the next touch) finds the living cell
nearest the tip and traces its whole body (the pick pass, `traceBody`). Its cells are drawn toward the tip
(`setDrawn`: their IDs, sorted, in the ledger's hand region; `hand.suck`: the tip, the reach, 10 units/s²) and, within
0.3 of it, taken (`resolveCount` copies each out and leaves the grain it was built of as silt about the tip). A bond
the draw stretches past `bondBreak` breaks as any bond does, so a loose body tears and only the near part comes,
while a tight one comes whole. The organism is kept once all of it is in, or once nothing has come for 1.5 s: each
cell's offset in the body's shape as it was, its energy, age, color and info, and the bonds among the cells that came.

Setting down: the left button sets down the tip species' last organism in, in its shape; held, another, sooner each
time. It is made of the silt within reach of the pointer, as a spark makes life of silt (`injectSlots`: the species
takes back its own slot if it still holds it, or a free one; `injectCells`: each grain within reach becomes the next
cell; `injectBonds`). The disc holds four times the grains needed at the world's mean (silt lies unevenly), and what
too little silt left is tried once more from twice as far; the cells are set in their own shape wherever their grains
came from. What still cannot be made stays in the pipette. So the pipette moves and makes nothing,
but for a card's colony, made when it is set down.

The contents are the world's (`life.pipette`, kept in saves): species in the order their first cells came in, the
strip reading tip first. A tap brings a species to the tip, a double tap opens its card, a drag onto the world sets
all of it down there. It holds 2,048 cells; a body that would not fit is left whole.

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
