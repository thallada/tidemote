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

(screening in progress)
