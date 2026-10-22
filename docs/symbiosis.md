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

### Rounds 6 and 7: specialists and imprinting (12 seeds × 30 min, from minute 10)

Generalist parasites were the suspected cause of the lost diversity, so these rounds make parasites specialise:
`graftSpec` scales what a graft draws by how well the grafter fits its host (its fit above half `graftFit`, scaled to
0..1, to this power); `graftImprint` 1 gives a species born of a grafted cell its host's species as its only host
(`tail.z`), and 2 also fixes a species on the species of its first host. Ref is `graftMax` 1 with `graftHop`, which
every variant below builds on unless it says "free" (no cap) or "plain" (neither). Leader load is the share of grafts
on species holding 5% of the living or more over their share of the living (above 1: parasites gather on the common;
round 7 only).

| variant | species booms/h | crashes/h | regional takeovers/h | effective species | grafted | leader load |
|---|---|---|---|---|---|---|
| r6-off | 43.8 | 50.5 | 29.2 | 101 | 0% | - |
| r6-ref | 50.5 | 50.0 | 23.5 | 87 | 24% | - |
| r6-spec1 | 46.0 | 47.0 | 23.2 | 88 | 26% | - |
| r6-spec2 | 53.5 | 55.8 | 24.1 | 83 | 25% | - |
| r6-spec4 | 47.5 | 51.0 | 24.7 | 97 | 19% | - |
| r6-fit5 (`graftFit` 0.5) | 45.5 | 48.3 | 26.5 | 95 | 18% | - |
| r6-specTrade (spec 2, trade 0.5) | 50.3 | 53.5 | 26.9 | 86 | 16% | - |
| r6-imp (imprint 1) | 55.8 | 50.8 | 20.3 | 55 | 22% | - |
| r6-impFree | 50.0 | 50.0 | 21.4 | 56 | 26% | - |
| r6-impPlain | 55.5 | 56.8 | 24.1 | 63 | 18% | - |
| r6-impSpec2 | 48.8 | 47.5 | 22.3 | 58 | 13% | - |
| r6-impTrade | 48.8 | 48.5 | 23.3 | 57 | 14% | - |
| r7-off | 45.0 | 48.0 | 30.0 | 107 | 0% | - |
| r7-ref | 47.3 | 47.8 | 23.2 | 87 | 25% | 0.82 |
| r7-imp2 (imprint 2) | 50.3 | 55.3 | 29.0 | 95 | 0.4% | 1.26 |
| r7-imp2Free | 45.8 | 50.8 | 27.0 | 100 | 1% | 1.64 |
| r7-imp2Plain | 46.3 | 48.0 | 28.3 | 100 | 1% | 1.09 |
| r7-imp2Spec2 | 43.8 | 46.8 | 27.8 | 99 | 1% | 1.40 |
| r7-imp2Common (`graftSpark` 0.4) | 49.8 | 53.8 | 29.0 | 93 | 1% | 1.27 |
| r7-imp2Fast (`graftTake` 1) | 41.3 | 47.8 | 28.3 | 100 | 0.4% | 1.40 |

- **Specialising by fit gives diversity back.** With `graftSpec` 4 or `graftFit` 0.5 a fifth of the living is still
  grafted, yet effective species are within noise of off (95-97 against 101), where generalist grafting (ref) costs
  14. Their species turnover is back near off's too: the extra booms and crashes came with the lost diversity.
- **Generalist parasites gather on the rare** (ref's leader load 0.82); **specialists gather on the common** (1.1-1.6
  under imprint 2), the density dependence that lets parasites hold a dominant species back.
- **Fixing a species on its first host's species (imprint 2) all but ends grafting** (under 1% grafted): the first
  host is often a passing species, and once it is gone the parasite has nothing it may take.
- **Imprint 1 is the worst for diversity** (55-63 effective species) with the most turnover. Imprinted lineages are
  born on their host and stay on it; why that concentrates the living into fewer species is not yet known.

### Round 8: an hour (24 seeds × 60 min, from minute 10)

| variant | species booms/h | effective species | grafted | living in grafting species | leader load |
|---|---|---|---|---|---|
| r8-off | 38.7 | 121 ± 7 | 0% | - | - |
| r8-ref | 46.0 | 94 ± 4 | 28% | 82% | 0.83 |
| r8-spec4 | 45.3 | 94 ± 6 | 26% | 65% | 0.83 |
| r8-fit5 | 42.9 | 103 ± 4 | 21% | 73% | 0.84 |
| r8-fit5spec4 | 44.4 | 98 ± 5 | 19% | 57% | 0.85 |

Over an hour the 30-minute recovery does not hold: every grafting variant costs 18-27 effective species, and the leader
load is 0.83 in all of them. Specialising by receptor fit slows grafting's spread but does not change whom it falls on;
surfaces are shared widely enough across species that a good fit is not one host species. Only imprinting has aimed
parasites at the common, which led to `graftSwitch`: an imprinted species, while its grafters find none of its host
species in reach, may lose its imprint (at this rate per such grafter per second) and fix on the next species it grafts.

### Round 9: switching hosts (16 seeds × 60 min, from minute 10)

All imprint variants are ref (`graftMax` 1, `graftHop`) with `graftImprint` 2; swN is `graftSwitch` N. Grafting
swing is the sd of ln(cells grafted) over a run (how much grafting rises and falls).

| variant | species booms/h | regional booms/h | effective species | grafted | leader load | outbreaks/h | grafting swing |
|---|---|---|---|---|---|---|---|
| r9-off | 39.5 | 28.1 | 110 ± 8 | 0% | - | - | - |
| r9-ref | 46.4 | 21.1 | 93 ± 5 | 31% | 0.84 | 5.4 | 0.67 |
| r9-imp2 (no switching) | 45.8 | 29.9 | 100 ± 7 | 1% | 1.28 | 8.0 | 1.15 |
| r9-sw0003 | 43.6 | 28.1 | 115 ± 10 | 3% | 1.50 | 8.9 | 1.09 |
| r9-sw001 | 44.6 | 29.1 | 104 ± 6 | 6% | 1.43 | 8.1 | 1.35 |
| r9-sw003 | 41.4 | 26.4 | 95 ± 8 | 9% | 1.19 | 7.7 | 1.10 |
| r9-sw01 | 45.5 | 28.0 | 85 ± 5 | 11% | 1.02 | 7.2 | 0.97 |

- **One dial from specialist to generalist.** The faster a parasite species may switch, the more of the living is
  grafted, the less its load leans on the common, and the more diversity it costs; diversity follows the leader load.
- **Slow switching keeps parasites and diversity both**: at 0.0003-0.001 a few percent of the living is grafted, the
  load falls half again as heavily on the leading species as their numbers, and effective species are within noise of
  off. Grafting there comes and goes most (outbreaks 8-9 an hour, the largest swing).
- **Generalist grafting damps regions**: ref's regional booms are 21 an hour against off's 28 (round 8: 22 against
  30); grafters ride and armour each other through the busts. Specialists leave regional booms as they were.

### Round 10: virulence (16 seeds × 60 min, from minute 10)

Every variant is the branch default (ref, `graftImprint` 2) with `graftSwitch` 0.001 unless named sw0003; take is
`graftTake`, common `graftSpark` 0.4, noMax drops `graftMax`.

| variant | species booms/h | regional booms/h | effective species | grafted | leader load | outbreaks/h |
|---|---|---|---|---|---|---|
| r10-off | 41.4 | 29.8 | 113 ± 8 | 0% | - | - |
| r10-sw001 | 41.6 | 29.2 | 111 ± 9 | 5% | 1.32 | 8.5 |
| r10-sw001take1 | 40.0 | 29.3 | 111 ± 7 | 5% | 1.32 | 8.6 |
| r10-sw001take2 | 40.9 | 25.7 | 102 ± 7 | 6% | 1.29 | 8.3 |
| r10-sw0003take2 | 38.3 | 27.7 | 107 ± 9 | 4% | 1.43 | 8.7 |
| r10-sw001common | 41.2 | 29.0 | 109 ± 8 | 6% | 1.38 | 8.0 |
| r10-sw001noMax | 38.8 | 29.4 | 110 ± 7 | 9% | 1.21 | 8.5 |

Slow-switching specialists leave the world as it was: every measure is within noise of off, whatever their
virulence. Parasites are there, aimed at the common, and come and go, but too few cells are grafted (5-9%) to move
their hosts' numbers. Making them matter needs more of them: a way to spread through a host population faster
than a free cell finds a host (infection), rather than a harder bite.

**Defaults on this branch** (after round 9): `graftMax` 1, `graftHop` 1, `graftImprint` 2, `graftSwitch` 0.001, the
slow-switching specialists. `#k={"graftImprint":0,"graftMax":0,"graftHop":0}` gives the plain rule's generalists back, `#k={"graftMin":2}` no grafting.
