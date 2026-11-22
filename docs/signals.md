# Signals in the water (2026-11-22)

Sound and light as a medium inside the simulation rather than a readout of it: cells spend energy to call, the call
spreads through the water, and other cells steer by it. What a call means is not designed. Which band a species calls
in, when, and how every other species answers each band are genes. This is docs/next-level-2026-10-20.md §4.7's
channel, built on the heat field's machinery.

## The field

- Four bands on the binning grid, beside the heat field in `b.thermal` (band `b` of grid cell `c` at
  `SIGNAL_AT + SIGNAL_BANDS * c + b`), stepped in the heat pass (`signalStep`, `src/shaders.js`). Never saved: a
  loaded world starts silent.
- Each band spreads and dies away (`signalReach`, `signalLife`): rumble (8 grid cells, 4 s, carried by the currents),
  song (4, 1.5 s), click (2, 0.4 s), flash (light: 3, 0.15 s). Stone absorbs them (`signalStone`), so reefs cast
  shadows.
- Diffusion with decay, not a wave equation: steps are 1 to 6 ticks long, and the spread (a Gaussian of the step's
  variance over 7 × 7 grid cells) is stable at any of them. Singers call in pulses, so damped rings still travel out.
- Deposits are scaled per band so a lone full caller stands at `signalGain` (0.1) where it calls.
- `K.signal: 0` (or no heat) compiles all of it out and zeroes the genes: the old ecology.

## The genes

- `call = (song, songBand, alarm, alarmBand)`: how loudly a species sings and calls the alarm (0..1), and in which
  band (`min(u32(x * 4), 3)`).
- `ear`, one per band, -1..1: the cell pushes itself up that band's slope (positive) or down it, a motility of its own
  like phototaxis (`signalTaxis`), costing upkeep (`signalEarCost` per unit of ear).
- Mutation drifts carried genes and now and then gains or loses one or moves a band (`mutSignal`; a gene at none stays
  at none until gained). About a third of founders and sparks sing, a third of those that flee hunters call an alarm,
  a third hear. Their draws come last, so every other gene is drawn as before.

## In the step

- **Song**: a fed cell (energy over half its division energy) sings for `signalDuty` of each beat of its species'
  cadence (the `pulse` gene's frequency, a phase from the species' serial: a species sings together).
- **Hush**: a singer falls silent as it hears what it shuns (`signalHush` × the level of the bands its ear is negative
  to). No gene of its own.
- **Alarm**: called at `alarm × saturate(threat + shunned × signalRelay)`: hunters near (as flight weighs them), or
  what it shuns heard, so an alarm passes from cell to cell.
- **Cost**: `signalCost` energy a second at full amplitude, part of upkeep, so it warms the water like the rest; booked
  in the energy ledger's `call` slot. A cell that cannot pay calls as loud as it can.
- Each cell's call this step is left in `intent.y`'s low bits for the observational passes (`voiceShown`).

## Seen, heard, touched, told

- **Signal lens** (**L**, Settings → Display → Map → Signals): each band's level as rings in its hue. Cells brighten as
  they call, and flash for a call in the flash band.
- **Mind view**: a Hearing pull; Singing, Hushed, Calling the alarm, Following a call, Fleeing a call. The specimen
  panel's genome shows the song, the alarm and the four ears.
- **Soundtrack**: the songs heard are the cells really singing, when they sing (`cellRate` in `src/audio/field.js`;
  species with no song keep a quarter of the old presence); an alarm is a dry double tick from where the cell is; a
  song's band sets its register (`BAND_VOICE`).
- **The Call tool** (**9**, docs/hand.md): the viewer calls into a band from a point, as loud as a small chorus.
- **The chronicler** (docs/chronicler.md): the first chorus, the great quiet, one voice left, a band first sung in or
  fallen silent, hunters that find prey by ear, prey that shun their hunters' band, two singers parting bands.

## What it does

32k particles, 32 seeds × 30 min, against the balance baseline (`runs/bioacoustics/gate-on`): every gated metric
"same" (persisted 94% vs 100%, p = 0.25; food web 91% both; effective species 100 vs 105). Calling costs each guild
about 1% of its upkeep.

The same gate at 6-tick steps (`gate-on6`) and with `signal: 0` (`gate-off`), each against the same baseline:

| | persisted | food web | not monoculture | effective species |
| --- | --- | --- | --- | --- |
| baseline | 100% | 91% | 100% | 105 |
| signals, 1 tick | 94% | 91% | 100% | 100 |
| signals, 6 ticks | 91% | 91% | 97% | 106 |
| signals off | 100% | 94% | 100% | 105 |

Every gated metric is "same" in all three (persisted at 6 ticks: p = 0.11). Signals off is the old ecology. With
signals on, 2 of 32 worlds collapsed at 1 tick and 3 at 6, against none in the baseline or with signals off: within
the gate's noise each time, but the same direction twice. The 6-tick run is measured against a 1-tick baseline (there
is no 6-tick run with signals off to set beside it). All three ran the step as first committed (22becb1); what came
after it is observational or the hand, which is idle headless.

What evolved, as the mean over worlds of `ear · (who sings in each band)` (zero at minute 1 in every pair):

| ear of | song of | minute 20 | worlds + / - |
| --- | --- | --- | --- |
| producers | grazers | -0.031 ± 0.011 | 0 / 10 |
| producers | producers | -0.065 ± 0.026 | 1 / 9 |
| grazers | grazers | -0.005 ± 0.003 | 2 / 7 |
| predators | grazers | -0.002 ± 0.009 | 5 / 5 |

Producers come to shun the bands grazers sing in, and their own crowd's. Hunters following prey song did not appear
in 30 minutes, and the share of cells that sing or call an alarm stays near the founders' third: much of it is still
drift.

## Open

- Collapses: 5 of 64 worlds with signals on against 0 of 64 without. Not significant in either gate alone, borderline pooled (Fisher, p = 0.06); run
  signals on and off side by side at 6 ticks (128 worlds) before release, and look at what the collapsed worlds'
  singers and ears were doing.
- The rumble band stands near 1.7 everywhere (17 × a lone caller: long reach, long life), so it gives little direction
  and saturates hush and relay for whatever shuns it. Screen shorter reaches and lives, or scale each band to its
  standing level in a crowd rather than a lone caller's.
- A coarse step's fresh calls are added after the spread, so the level right at a caller is up to six times higher at
  6 ticks than at 1 (slopes are not affected; hush and relay read the level).
- The kernels' registers on an Adreno (`tools/adreno/regs.sh`) and lean against full bit for bit (`tools/leancheck.mjs
  --cpu`) were not measured: neither runs on the machine this was built on.
- The field's buffers are sized to `MAX_CELLS` whatever the world: about 24 MB more GPU memory.
