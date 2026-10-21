# Grafts: symbiosis and parasitism from one rule (2026-10-21)

The rule sketched in docs/next-level-2026-10-20.md §4.1, as built: a cell may bond to a cell of another species,
and the direction energy flows along that bond is a gene, so parasites, holobionts and mutualists all come
from one mechanism and evolution decides which a lineage is.

## The rule

Four genes in `Genome.sym` (the genome grew from 56 to 60 words; old saves refuse to load):

- `sym.x`, **graft**: how avidly a cell grafts onto other species. Below `graftMin` it never does. A cell
  free of a host looks, among the living of other species within bond range (`linkR`), for the one its
  receptors fit best (the `sdot` fit that recognition uses), and above `graftFit` takes it up at a chance per
  second of `graft × graftRate`. The grafter holds its host in its second bond slot (a bonding grafter keeps
  only one kin bond in its own slots; kin may still hold it), so the graft survives the sort as every bond does.
  It slips free when the host dies, sleeps (a cyst), drifts out of range, or its surface drifts out of fit
  (below half of `graftFit`). Upkeep `graftCost × graft`.
- `sym.y`, **flow** (−1..1): the energy along the graft each step is
  `(1 − |flow|) × (E_host − E_self) × bodyShare·dt + max(−flow, 0) × graftTake·dt × E_host − max(flow, 0) × graftTake·dt × E_self`.
  At −1 the grafter drains its host, at +1 it gives its own energy away, at 0 the two even out as a body's
  cells do. The host's side is settled exactly: the grafter adds its share (fixed point) to a per-particle
  word after the ledger's claims (`graftAt`), and the next step's `resolveCount` takes it from the host (or a
  husk it has become). No energy is made or lost.
- `sym.z`, **reject**: a host's chance per second of breaking each graft on it is `reject × sym.z × (1 − fit)`
  (the worse the grafter fits it, the readier it is to throw it off). Upkeep `rejectCost × sym.z`. Hosts
  evolve away from their parasites as prey evolve away from hunters, and parasites follow.
- `sym.w`, a captured **symbiont** (with `capture`, see below).

Grafted cells are harder to catch (`graftArmor`: an attack on a cell holding a host misses half the time),
ride with their host (its velocity counts among the partners a cell takes on the motion of), and a grafter
and its host press membrane to membrane as a body's cells do (Lite bit 16 marks grafters for the host's
side of the scan). Founders have no grafts; `graftSpark` of abiogenesis sparks are born grafting (and as
many rejecting), and mutation gains or loses each now and then, as it does adhesion and calcification.

Census: `META_SYM` counts grafted cells by their own guild and their host's, takers and givers (each step),
and grafts made, rejected and otherwise lost (cumulative). Headless samples carry `grafts` and `genes`;
the energy ledger's slot 1 (once glint) is the energy each guild takes through grafts.
`node tools/dynamics.mjs runs/A runs/B` scores groups of runs on regional and species booms, crashes and
takeovers, and on graft load. `tools/gpu-node.sh tools/graftshot.mjs` photographs the hosts with the most
grafters on the built page.

## What it looks like

Rosettes: a host ringed by a dozen grafters of other species on short tethers, like stalked ciliates on a
crustacean; trains of mixed colour; producers studded with grazer-coloured passengers.

## Results

Screened 16 seeds × 20 min at 32k per variant over both farm machines (`tools/dynamics.mjs`, from minute 5;
species booms and crashes are a leading species doubling or halving within five minutes; takeovers are a new
leading species in a region of 16 grid units). Rounds s1 and s2 differ in commit (s2 has grafter and host press
together, and sharing at a body's rate), s4 shares at `graftTake`'s rate. Off is `graftMin: 2`.

| variant | n | species booms/h | crashes/h | regional takeovers/h | effective species | all four awake | grafted | in grafting species | mean flow |
|---|---|---|---|---|---|---|---|---|---|
| s1-off | 16 | 40 | 53 | 28.8 | 92 | 75% | 0% | - | - |
| s1-doc (the rule as above) | 16 | 50 | 55 | 25.6 | 79 | 63% | 16% | - | - |
| s1-drain (`rejectDrain`) | 16 | 53 | 62 | 27.4 | 78 | 50% | 14% | - | - |
| s1-inherit (`graftInherit`) | 16 | 52 | 64 | 25.6 | 74 | 69% | 16% | - | - |
| s1-inhDrain | 16 | 49 | 58 | 25.3 | 72 | 69% | 13% | - | - |
| s1-virulent (inherit, `graftTake` 1.5) | 16 | 57 | 63 | 25.3 | 68 | 44% | 16% | - | - |
| s1-common (`graftSpark` 0.4) | 16 | 57 | 64 | 27.6 | 69 | 50% | 20% | - | - |
| s1-noArmor (`graftArmor` 0) | 16 | 48 | 57 | 27.2 | 73 | 56% | 8% | - | - |
| s2-off | 16 | 42 | 52 | 29.4 | 99 | 88% | 0% | 0% | - |
| s2-doc | 16 | 49 | 59 | 26.0 | 73 | 75% | 16% | 32% | -0.42 |
| s2-lossy (`graftEff` 0.5) | 16 | 45 | 56 | 25.9 | 80 | 56% | 5% | 12% | -0.34 |
| s2-slow (`graftTake` 0.15) | 16 | 49 | 57 | 24.8 | 76 | 75% | 17% | 29% | -0.33 |
| s2-lossySlow | 16 | 45 | 57 | 27.0 | 86 | 56% | 5% | 11% | -0.27 |
| s2-ride (`rideFeed`) | 16 | 50 | 58 | 24.1 | 81 | 56% | 22% | 39% | -0.40 |
| s2-capture (`capture`) | 16 | 52 | 59 | 26.8 | 81 | 63% | 13% | 28% | -0.40 |
| s2-capRide | 14 | 47 | 53 | 23.7 | 79 | 79% | 21% | 39% | -0.46 |
| s4-trade05 (`graftTrade` 0.5) | 16 | 48 | 55 | 27.3 | 75 | 63% | 9% | 20% | -0.58 |
| s4-trade1Fit6 (`graftTrade` 1, `graftFit` 0.6) | 16 | 43 | 60 | 27.9 | 89 | 94% | 1% | 4% | -0.34 |
| s4-trade1Hop (`graftTrade` 1, `graftHop`) | 16 | 50 | 58 | 25.8 | 76 | 69% | 14% | 31% | -0.62 |

What the screens say:

- **Grafting spreads in every variant that leaves it free.** From sparks alone a sixth of the living is grafted
  by 20 minutes, and in hour-long runs (8 seeds each, plain rule and `graftFit` 0.6) the species that graft hold
  78-97% of the living by 30-60 minutes, their mean flow near -0.9 (taking), 25-30% of cells grafted at any time,
  and 43% of the living carrying the reject gene. Everyone becomes a parasite of everyone: a universal free
  option, not a way of life. Specialist fits (0.6) slow it but end the same way.
- **Species turnover rises by a fifth to a third** (booms 40 → 48-57 an hour); regional booms and crashes do not
  move, and regional takeovers fall a little (29 → 24-27): grafters are generalists that hold on.
- **Diversity falls** (effective species 92-99 → 68-86), most with the variants that make grafting easier.
- **Sharing ran at a body's rate (`bodyShare`, 2/s)**, four times the drain, so most energy moved by evening out
  with richer hosts and `graftTake` 0.15 changed nothing. Sharing now runs at `graftTake`.
- **Energy along grafts was free.** In s1-doc, after ten minutes, producers took 71k through grafts against
  147k of light, scavengers 38k against 20k of husks, predators 11k against 14k of kills. `graftEff` 0.5 (the
  rest as heat) cuts grafting to 5%.
- **Grafts are short (16-18 s) because hosts die**: lost as the host dies or sleeps ~50/min, pulled apart
  ~2/min, rejected a few. Life here is short and violent, and drained hosts die faster.
- **A trade-off kills grafting outright** (`graftTrade` 2, or 1 without help: under 1% of species within 15
  minutes), because a free-living species that gains the graft gene loses its living before its receptors fit
  anyone. Only hopping to richer hosts (`graftHop`) lets obligate-leaning parasites live: s4-trade1Hop keeps 14%
  grafted, 83% of grafters taking.
- **Endosymbiosis happens**: with `capture`, 8% of the living carry a captured symbiont by 20 minutes (15% with
  `rideFeed`).

### Round 5: capping and trading (12 seeds × 30 min, from minute 10, commit c8dc508)

`graftMax` caps grafters per host (1 or 2), `graftFloor` 0.5 stops a taker draining a host below half its
budding energy, `graftTrade` 1 makes avid grafters feed poorly on their own, `graftHop` lets a grafter move to a
richer host. Standard errors are about ±4 booms/h and ±6-8 effective species, so only differences larger than
that mean anything.

| variant | species booms/h | crashes/h | regional takeovers/h | effective species | grafted | mean flow | grafts made /min/k |
|---|---|---|---|---|---|---|---|
| r5-off | 41.5 | 48.0 | 26.2 | 101 | 0% | - | - |
| r5-base | 54.5 | 55.0 | 22.7 | 75 | 25% | -0.65 | 1666 |
| r5-max1 | 52.5 | 54.3 | 24.0 | 72 | 15% | -0.59 | 857 |
| r5-max2 | 50.3 | 53.3 | 23.8 | 77 | 18% | -0.61 | 1216 |
| r5-max1Floor | 48.0 | 53.5 | 24.0 | 75 | 16% | -0.56 | 956 |
| r5-max1Trade | 59.3 | 61.8 | 25.9 | 76 | 10% | -0.62 | 641 |
| r5-max1FloorTrade | 49.3 | 48.3 | 23.0 | 76 | 12% | -0.56 | 618 |
| r5-floorTrade | 48.8 | 53.3 | 24.4 | 79 | 14% | -0.56 | 943 |
| r5-max1Hop | 48.0 | 50.8 | 24.7 | 87 | 25% | -0.57 | 2086 |
| r5-max1TradeHop | 44.5 | 49.0 | 22.9 | 86 | 23% | -0.64 | 1784 |
| r5-max2TradeHop | 50.3 | 56.0 | 25.4 | 78 | 25% | -0.70 | 2792 |
| r5-tradeHopFloor | 50.0 | 54.8 | 22.2 | 72 | 22% | -0.57 | 1935 |

- Every grafting variant raises species turnover over off (+7 to +18 booms an hour) and costs diversity
  (effective species 101 → 72-87). Regional booms, crashes and takeovers do not move beyond noise.
- The caps and the floor halve the grafted share but change neither turnover nor diversity much: what grafting
  does to the world does not scale with how much of it there is.
- `graftMax` 1 with `graftHop` (with or without the trade) keeps the most diversity (86-87) with grafting as
  common as the plain rule: parasites spread over many hosts instead of piling onto the best ones.
- `graftMax` 1 with `graftTrade` gives the most turnover (59 booms, 62 crashes an hour), with a tenth grafted.
- Outbreaks (the number grafted doubling within five minutes) come 7-10 times an hour in every variant: grafting
  pulses with its hosts, but no variant yet makes host-parasite cycles that move whole regions.
