# Live annotations (2026-11-03)

Notes over the world on what is happening in view, as it happens: who is hunting or grazing on whom, a species
scalding in water its own crowd has warmed while a neighbour bears it, cells stilled by the cold, a species dividing
fast or curling into cysts, a new species budding off its mother or sparking from silt. They show with the auto
camera by default (Settings → Display → Overlays → Annotations: Auto camera, Always, Off). The design study behind
them (what happens in view and how often, measured from the auto camera; the vocabulary of marks; the checks) is in
`runs/annot/` and its published page.

All of it is observational: nothing in the world reads what is written for it.

## What comes back from the GPU

Two readbacks, both the annotations' own (they never wait on, or cancel, a click's or the director's pick):

- **The ring of events** (`NOTE_*` in `src/shaders.js`), at the ledger's end between the hand's words and the heat
  deposits. The page sets `sim.watch` to the stretch of world it annotates (the view and a margin; size 0 when the
  annotations are off, as in every headless run) and `sim.watchEv` to the events it wants there. Where each event
  happens, the step that makes it writes a record (`note`, `noteSelf`, `noteBy`): what happened, the cell's kind
  and id, the doer's kind and id, both places, and the tick.

  | event | written by | doer |
  | --- | --- | --- |
  | kill, grazed (bitten to death), bite | `resolveCount`, resolving the claim | the claimant (a coarse step's grazing counts bites but names no grazer: none) |
  | scavenge (a husk eaten; `NOTE_LITTER` for litter) | `resolveCount` | the claimant |
  | birth (a mutant when the kinds differ) | `resolveCount` | the mother |
  | starved, froze (starved torpid, in the ice, or stranded at its edge), dried (stranded on the mud), old, scalded, cyst | `lifeMain` | none |
  | starved, froze, dried, woke (a cyst) | `cystStep` | none |
  | spark (life from silt), rot (a husk gone to silt) | the matter pass | none |
  | needle | `resolveCount` | none |

  Every record is the world's own act, by id: nothing is inferred from what disappeared between looks. The code
  each kind of death leaves in a husk's `info` stays as it was (starved, stranded and frozen share 1; a woken cyst
  shares 9 with a birth); the ring tells them apart.

- **The view** (`NOTE_WGSL`, `noteMain`), read every six frames: every living cell and husk in the stretch annotated,
  as drawn now (after the in-between of coarse steps), with its velocity, kind, cause, role, search image, fullness,
  how many tolerances its water lies from its optimum, whether it is torpid, and its two bonded partners; and the
  water's temperature and ice on an 8 × 8 grid across it. Past `cap` cells (16,384 up close, 3,000 for a wide view)
  a steady sample: those whose id hashes under the share that fits, so the same cells come back from look to look.

The cells the notes point at one by one are also found by id every frame (`Engine.watch`, shared with the song
marks), so a lock rides its cell as the followed cell's brackets do.

## What is told (`src/notes.js`)

Each story is found from the events and the view, every 0.35 s at most, as a candidate with a priority:

| story | when | marks |
| --- | --- | --- |
| hunt | a kill in the last 6 s whose hunter and remains both show (up close) | lock on the hunter, a KILL link to the remains, a cross; the hunter's kind's kills in view |
| graze | a grazer species has bitten one producer species 4+ times in 30 s | a census of the grazers, up close a GRAZES link on the last pair; bites, deaths |
| scavenge | a scavenger ate a carcass (up close) | lock, link to where it lay |
| newsp / spark | a mutant daughter or a spark in the last 8 s | lock (and a BUDS link from the mother); the new species' diet and comfort |
| bloom | 5+ births of one species in 20 s | census of the species |
| dormant / waking | 4+ of one species encysted or woke in 20 s | census of its cysts / its cells |
| starving | 3+ of one species starved in 20 s | crosses where they died |
| heat | 3+ of a species scalded in 30 s, or a quarter of its cells past 0.8 tolerances above its optimum | a hatched zone and squares on its too-warm cells, crosses on the scalded, its comfort band against the water's warmth, the gauge; beside it the most numerous species in the same water that bears it |
| cold | 30% of the living in view torpid, or 3+ froze | rings on the torpid, the share stilled, the water and its ice; the species still active |
| drying | 3+ dried on the mud in 20 s | crosses |

By zoom: from 50 CSS px a world unit, cells are pointed at one by one; below 18 the view is wide and tells only the
water's stories (heat, cold, drying), drawn on the grid's squares, with only those events written to the ring (its
bites and births would crowd it). Past 4× speed a single moment (a kill, a spark) passes too fast to follow and is
not told.

The budget (`TUNE`, real seconds, so a note reads the same at any speed): at most three notes at once (two on a phone,
one in a wide view), one arriving at a time 4.5 s apart, each held at least 6 s and at most 16 (a single moment 9);
the same story not again within 60 s nor the same kind within 18. A much stronger story may take the place of the
weakest that has been read. The design study measured 4.3–8.6 new notes a minute with rules like these.

## How it is drawn (`src/noteview.js`)

On the page's overlay canvas, with the brackets, so a film keeps it. In the manner of a drone's HUD (GMUNK's
Oblivion work): two hues, a pale cyan-white for structure and the second party and a red-orange for the subject,
danger and a kill (a cold cyan for the cold); hairline rules with end ticks; thin hero numerals; tracked
micro-labels in Saira; 45° leaders onto level shelves; stepped, hatched hazard zones; reticles; text that types
itself on. State is told by form: a filled tag, hatching, a hollow or dashed mark.

- **lock**: brackets close in on a cell; a ring ticked at 90° spins in.
- **link**: a bowed line from the doer, chevrons running toward the other, a cross tick, its verb in a filled tag.
- **census**: a glyph on each cell of a species in view, ticked on in a sweep (plus a member, dashed ring dormant or
  torpid, square too warm, cross dead).
- **zone** and **squares**: a group as cells of a coarse screen grid, or the view's water as its 8 × 8 squares;
  hatched for a danger.
- **label**: a tag or eyebrow, a rule, a hero numeral and the name it counts, data lines, a comfort band with the
  reading.
- **gauge**: the water on an arc against a species' comfort band.
- The frame: corner marks, the shot's mode at the top, CELLS IN VIEW (the species in view by numbers, those the notes
  speak of in hot) and a key to the glyphs on screen. With the annotations, the auto camera's subject's nameplate
  carries its diet, body and comfort.

Labels are placed around their anchors away from the panels, each other, their leaders and the marks, and kept
where they were while that holds; they ease after a moving subject. Marks keep out from under the frame's panels.

## Checking

`node --test test/notes.test.js` (the ring's wrap, the view's columns, each story, the budget).
`tools/gpu-node.sh tools/notes-live.mjs --out runs/notes/NAME --warm 60 --secs 180` films the auto camera with
the interface showing and logs what the notes held and what they cost (`__tidemote.notes.debug()`: ms spent reading,
finding and drawing; events the ring overwrote before they were read).

## What it costs

Measured 2026-11-03 on an RTX 4070 Ti (Windows Chrome): the step's passes with the ring's writes in them against the
build before (`tools/perf/plans/step.json`, two runs each): `lifeMain` 1.70–1.96 ms before and 1.92–1.98 after on a
1M world, 5.75 and 5.71–5.75 on 4M; `resolveCount` 0.19 both: within the runs' own spread. Nothing is written while
the annotations are off (`sim.watch` empty). With them on, a 131k world under the auto camera at 1× kept its 73 fps;
the page spends about 0.2 ms a frame reading the readbacks and finding stories, and 0.6–0.8 ms drawing with three notes up (`__tidemote.notes.debug().ms`, by part). Ring overflow (`lost`) stayed at 0 through 1×, 4× and 16× once the bite share settled.
