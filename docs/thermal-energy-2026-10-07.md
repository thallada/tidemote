# Heat: thermal energy in the biosphere, proposals and a plan, 2026-10-07

Tidemote has two energy inputs today: light (the tide's pattern times the season, over the era's ambient
floor) and glint (silt that the tide charges). Energy leaves through upkeep, through glint leaking back to
silt, and through husks decaying. Nothing records where spent energy goes. The water has no temperature,
a crowd leaves no warmth behind it, and an era can only change the light, the glint charge and the
currents.

This document looks at what heat could add: where it would come from, how it would move and leave, and
what it could do to matter, cells, evolution and the climate. Section 3 sets out the proposals. Section 4
explains what makes a heat design produce emergent complexity rather than just new parameters. Section 5
describes the recommended design. Sections 6-12 cover the rules in detail, every system and UI surface
it touches, the soundtrack, cost, how to judge it, and the build order.

**Goal.** Worlds that are more fascinating to watch and investigate: more spatial structure, more
behaviour, more interactions between species, more stories. Coexistence metrics (the gate) are a floor
the design must not break, not the objective.

**Recommendation in one paragraph.** Make heat a **medium that life writes into and reads from**.
- **The field.** A heat field on the binning grid spreads, rides the currents and relaxes toward the
  climate's background temperature.
- **Who writes it.** Every cell's upkeep becomes waste heat, so crowds, bodies and reefs warm their own
  water. A new trait lets **heat-makers** burn extra energy to warm themselves and their surroundings.
- **Who reads it.** Each species prefers a temperature, set by an optimum gene and a tolerance gene.
  **Narrow tolerance pays off at the optimum**, so small differences in temperature matter. Swimmers
  steer toward water that suits them, cold sends cells into **torpor**, and too much heat **scalds**.
- **What follows.** Species sort themselves into thermal territories that they create. Heat-makers
  become nurse species for warmth-lovers and push cold-lovers out. Their colonies are lifeboats through
  cold snaps and overheat in warm eras.
- **Seeds and screens.** A few **hydrothermal vents** add fixed landmarks and seed thermophile lineages.
  Warmth also makes glint and husks fade faster, so eras favour different guilds. One experimental
  coupling, **heat-driven surface flow**, sweeps matter from warm patches toward cold seams and could form
  convection-like patterns; it is screened behind a knob.
- **Locality.** Every rule is local, and no census value steers anything.

---

## Revision note (same day)

The first version recommended "thermal niches + vents": a heat field plus multipliers on upkeep, glint
leak, husk decay, drag and mutation rate. Reviewed against the goal above, it was the safest way to make
eras matter, but not the best bet for emergent complexity:

- **Most of its effects only changed rates.** They would shift which guild wins in which era (visible in
  census shares) but little that can be seen on screen. This repo's own history warns about that kind of
  change: most rules screened in `docs/balance-strategy-2026-10-01.md` and
  `docs/ecology-ideas-2026-10-02.md` landed "within noise", and conserving energy made worlds duller.
- **The water barely varied across space** (±5° away from vents) against tolerances of 5-10°. Niches
  would bite only in time, at era changes, and every lineage would likely drift to match the background
  together.
- **Life's own heat was capped low** (+3-5°), and upkeep scaled with absolute temperature, so warmth was
  mostly a tax.

What has made this simulation interesting so far is **structure built by life and feedback between
organisms**: bodies, reefs that grow by short-range help and long-range wear, and hunters whose search
images make them chase whatever is booming. This revision leads with heat as a medium organisms write and
read. It keeps the rate effects that make eras bite (glint and husks) and moves the others to optional
screens. It also replaces "warm blood" (these cells have no blood) with **heat-makers**, which are
thermogenic. The design is also cheaper: body warmth is computed each frame instead of stored, and the
heat-maker trait fits in a spare genome word.

---

## 1. Where heat would come from and where it would go

The world is a torus of `grid[0] × grid[1]` world units, binned one particle cell per unit (`cellOf` in
`src/shaders.js`, about 22 particles per cell, `DEFAULT_K.density`). Heat belongs to the water, so it lives
on that grid.

### 1.1 Sources

| Source | Physical reading | In the simulation | Role in the design |
| --- | --- | --- | --- |
| **Metabolism** | Respiration is almost all waste heat | Every unit of `upkeep` a cell pays is deposited as `metabHeat` degrees per unit of energy into its grid cell | **The main source.** Crowds, bodies and reefs warm their own water, so life shapes its own climate (niche construction) |
| **Thermogenesis** | Thermogenic plants and microbes burn reserves to stay warm | A heat-maker (gene `thermo`) pays extra upkeep, all of which becomes heat | **The engine of the design.** Section 5.2 |
| **Sunlight** | Light absorbed by water warms it | `light(x)` × `sunHeat` | A broad, slow pattern that follows the tide's bright patches with a lag: warm water trails the light, as afternoon heat trails noon |
| **Vents** | Hydrothermal springs in bedrock | A few pulsing point sources on bedrock outcrops | Fixed landmarks, cradles of thermophile lineages, and food in the dark |
| **Decay** | Compost heaps steam | The energy a husk loses (`decay`) × `rotHeat` | Carcass fields from a hunt or a die-off warm briefly |

### 1.2 Transport and sinks

- **Diffusion** (`heatD`, cells²/s) spreads every hot spot.
- **Advection by the currents.** The analytic `flowAt` currents carry heat in a semi-Lagrangian step. A
  vent leaves a comet-tail plume, and a bloom's warmth drifts downstream ahead of it.
- **Relaxation to the background** (`heatLoss`, per second) stands in for exchange with deep water and
  air. Every cell relaxes toward `Tbg`, which the climate sets from the era, the season and any
  excursion. This sink bounds every source: a constant source `S` raises a cell by at most `S / (C·λ)`, so
  no feedback can run away.
- **Thermal mass in stone.** A grid cell's heat capacity is `C = 1 + stoneMass × stone grains`, so reefs
  and bedrock warm and cool slowly. They are thermal refuges as well as predation refuges.
- **(Screened) surface flow.** Warm water has lower surface tension, so the surface flows from warm to
  cold (the Marangoni effect). This moves matter, not heat. Section 5.4.

With `heatD = 1` and `heatLoss = 1/90 s⁻¹`, a hot spot spreads over `L = √(D/λ) ≈ 9.5` cells. That is
about the scale of a bedrock outcrop or a large body's neighbourhood, and smaller than the current cells
(14-34 cells). Currents run at about 0.1-0.4 cells/s, so the Péclet number `uL/D` is 1-4: plumes and
warm patches are visibly bent and carried by the flow without being torn apart.

### 1.3 Magnitudes (starting values)

The units are notional degrees, shown as `°`. The background spans about 4-28°.

| Term | Rate | Excess at equilibrium (λ = 1/90 s) |
| --- | --- | --- |
| Metabolism (`metabHeat` 0.12 °/energy) | A busy grid cell (about 12 living cells) spends about 0.5 energy/s | About +5° over a large crowd, +8-9° over a dense one. A patch smaller than `L` stays cooler, so a crowd must be broad to warm itself |
| Heat-makers (`thermoCost` 0.06 energy/s at `thermo` 1) | A colony at `thermo` 0.7 spends about twice a normal cell's upkeep | About +10-11° over the colony, a few degrees in a halo about `L` wide |
| Sun (`sunHeat` 0.04 °/s at full light) | 0.04 °/s, about 0.008 at the ambient floor | +3.5° under bright tide patches, about +0.7° in the dark |
| Vent (`ventHeat` 60 °·cell²/s) | Gaussian, σ about 1.5 cells | The 2-D point-source solution `Q/(2πD)·K₀(r/L)` gives +19° at 1.5 cells, +8° at 5 and +4° at 10 |
| Decay (`rotHeat` 0.3 °/energy) | 0.011 energy/s per husk | About +3° over a carcass pile |

**The deliberate shift from the first version:** life, not sunlight, makes most of the spatial contrast.
Sunlight is now weaker than metabolism.

---

## 2. What heat could do (the full menu)

| | Effect | Rule sketch | In the recommendation? |
| --- | --- | --- | --- |
| Cells | **Thermal preference** | genes `topt` (optimum) and `tol` (tolerance) give a performance curve `perf(T)` scaling photosynthesis, digestion and swimming | **core** |
| | **Narrow tolerance pays off at the optimum** | peak performance `1 + specBonus·(1 − (tol−2)/13)` | **core** (it is what makes small contrasts matter) |
| | **Thermotaxis** | swimmers steer along `∇T` toward their optimum | **core** |
| | **Heat-makers** | gene `thermo`: extra upkeep becomes heat; the cell runs warmer than the water, more so in a body | **core** |
| | **Torpor** | far below the optimum: no swimming, feeding or dividing, and a quarter of the upkeep | **core** (thaw blooms, lifeboats) |
| | **Scalding** | far above the optimum: a death chance per second; husk with a new cause code | **core** |
| | Stress costs upkeep | `× (1 + stressCost·stress)`, relative to the cell's own optimum | **core** |
| | Absolute Q10 on upkeep | `× q10^((T−tRef)/10)` | screen (default off: it taxes warmth) |
| | Viscosity | drag half-life `× exp(viscK·(T−tRef))` | screen |
| | Heat-stress mutagenesis | `mutRate × (1 + heatMut·stress)` | screen (watch genome slots) |
| | Bodies come apart in heat | bond break distance shrinks with stress | screen |
| Matter | **Glint discharges faster when warm** | `leak × glintQ10^((T−tRef)/10)` | **core** (eras bite: grazers do better in the cold) |
| | **Husks rot faster when warm** | `decay × rotQ10^((T−tRef)/10)` | **core** (cold feeds scavengers, warm recycles silt) |
| | **Hot springs charge silt** | extra charge at `T − Tbg > +8°` | **core** (vents) |
| | **Surface flow** | matter drifts down `∇T` | **screened early** (section 5.4) |
| | Brownian motion grows with temperature | `jitter × √(T+10)/√(tRef+10)` | yes, cosmetic in scale |
| | Stone thermal mass | heat capacity as in 1.2 | **core** |
| | Thermal fatigue of stone | wear grows where temperature swings | later |
| Origins | Sparks favour hot water and found thermophiles | `randomInto` draws `topt` from the local water | **core** |
| Climate | Background temperature per era (a random walk), seasons, heat waves and cold snaps | section 6.6 | **core** |
| Energy | Thermosynthesis at fronts | gain ∝ `|∇T|` (a heat engine needs a gradient) | later, only if fronts prove under-used |

---

## 3. Proposals

### A. Embers: heat as a tracer

A heat field fed by metabolism, decay and sunlight, drawn and heard, **with no ecological effect**. It
costs one grid pass and carries no risk: the gate cannot move. It shows energy flows but adds no
behaviour. **Phase 0 of the plan**, and its first use is to **look** before coupling anything (section 11).

### B. Thermal tolerance with rate effects

The first version's core: optimum and tolerance genes, a performance curve, Q10 multipliers on upkeep,
drag and matter rates, torpor and scalding, all driven mainly by the climate. Its main effect would be
which guild wins in which era. That is useful, but the climate imposes the pattern; life does not create
it. **Partly kept**: the matter rate effects, torpor and scalding.

### C. Heat as a medium life writes and reads (recommended)

Life makes the spatial temperature pattern (metabolic heat and heat-makers), species prefer warmth or cold
and narrow tolerance pays off at the optimum, swimmers steer, and torpor and scalding give heat its
stakes. Heat links species that never touch: a heat-maker colony helps warmth-lovers nearby and pushes
cold-lovers away. **Section 5.**

### D. Vents and the dark food web

Hydrothermal vents on bedrock that pulse heat, charge silt into glint with no light, and seed thermophile
lineages. **Folded into C** as structure seeds and landmarks.

### E. Surface flow (Marangoni convection)

Matter, and drifters in proportion to `advect`, drift from warm water toward cold. This is the only
proposal that forms patterns directly. Any warm crowd pushes its own silt and food away and cold seams
collect them: short-range activation and long-range inhibition, the same recipe that gave reefs separate
patches. It also breaks the "currents are divergence-free" property `flowAt` guarantees. **Screened
early, behind a knob** (section 5.4).

### F. Thermosynthesis at fronts

Producers that harvest energy from temperature gradients would live where vent plumes meet cold water
and on the edges of warm colonies. Speculative. **Later**, if fronts turn out to be empty.

### Comparison against the goal

| | A | B | **C** | D | E | F |
| --- | --- | --- | --- | --- | --- | --- |
| Spatial structure made by life | glow only | little | **thermal territories, fronts, halos** | vent rings | **convection nets, patch spacing** | front-dwellers |
| Behaviour to watch | none | torpor, steering | **steering, huddled colonies, torpor, bleaching** | vent rings | indirect | none |
| Interactions between species | none | none (each responds to the climate) | **facilitation and interference through heat** | via glint | via matter | none |
| Stories | none | era turnover | **lifeboats, overheating collapses, thaw blooms, moving warm patches** | oases in dim eras | patterns forming and coarsening | — |
| Makes eras bite | no | yes | yes (kept matter rates) | partly | no | no |
| GPU cost | about 2% | about 3-5% | about 4-6% | under 1% extra | about 1-2% | about 1% |
| Balance risk | none | medium | medium | low to medium | high | medium |

---

## 4. What makes a heat design produce emergent complexity

Three working principles came out of the review. Each one constrains a rule in section 5.

1. **Life must make the pattern, not just respond to it.** If the climate sets temperature and every
   species reacts to it, the result is a lookup table: warm era, warm winners. If cells make the
   temperature, their responses feed back into what they make, and patterns, territories and histories
   can arise that nobody set. The design therefore makes metabolism the main source of heat, adds a trait
   whose only purpose is to make heat, and weakens sunlight.
2. **Small differences must matter.** Tolerances of 5-10° in water that varies by ±5° mean nobody is
   ever out of place. A peak bonus for narrow tolerance (the thermal counterpart of `spec()` for diet)
   makes specialists win where conditions suit them and lose a few cells away. Thermotaxis turns those
   differences into movement.
3. **Interactions must be indirect and two-sided.** The most interesting rules in this simulation set
   species against or alongside each other: search images, kin crowding, refuges. Heat adds a channel
   where one species' activity changes another's conditions at a distance, helping some and hurting
   others. That kind of indirect effect is what makes community structure in ecology rich: facilitation,
   nurse plants, ecosystem engineers.

---

## 5. The recommended design

### 5.1 Thermal preference

Every species carries two genes in the spare genome words: `topt` (optimum, 0-45°) in `gp1` (word 46) and
`tol` (tolerance, 2-15°) in `gp2` (word 47). Both words are never written today. All of the following is
in `cellWGSL`, so `mindMain` replays it exactly:

```
Tc     = T(water at p) + thermoWarmth (5.2)
x      = (Tc − g.topt) / g.tol
peak   = 1 + specBonus · (1 − (g.tol − 2) / 13)            // 1.4 for a 2° specialist, 1.0 for a 15° generalist
perf   = peak · (x ≤ 0 ? exp(−x²) : exp(−(x / 0.45)²))     // the warm side falls about twice as steeply
stress = smoothstep(0.3, 0.9, abs(x))
torpid = x < −torporAt                                     // default 1.5
```

| Term today | With heat |
| --- | --- |
| `photoGain = g.photo · light · …` | `· perf`, or 0 when torpid |
| `swim = g.swim · (1 − photo)` | `· min(perf, 1)`, or 0 when torpid |
| meal gain `gain · K.gain · eatEff` | `· perf` (digestion) |
| `upkeep = g.metab · kinCost · thrift · (…)` | `· (1 + stressCost · stress)`, then `· torporCost` when torpid |
| `hungry` | false when torpid: no hunting, grazing or division |
| new: thermotaxis | `vel += normalize(∇T) · sign(topt − Tc) · min(1, abs(x)) · swim · thermotaxis · dt`. Sessile cells and drifters cannot steer, but drifters ride the currents and are sorted by survival instead |
| new: scalding | `rnd < scald · smoothstep(0.8, 1.4, x) · dt` gives a husk with cause code 10 (unused today) and `E = huskBase` |

**Why the asymmetric curve.** Real thermal performance curves rise slowly to the optimum and collapse a
few degrees above it. Heat therefore kills and cold stills: a heat wave and a cold snap have opposite
characters, and torpor gives cold-stressed populations a way to wait out bad times.

**Why the cost is relative.** Stress is measured against the cell's own optimum, so warmth-lovers are not
taxed for living warm. An absolute Q10 on upkeep, as metabolic theory suggests, remains a screen (`q10`,
default 1, i.e. off).

### 5.2 Heat-makers

A third gene, `thermo` (0-1), is packed into `dev.w` (word 15, unused: `mutateInto` mutates only
`dev[0..2]`) as an 8-bit unorm, so the genome does not grow. It does three things:

- **Cost.** Extra upkeep of `thermoCost · thermo` per second (up to 0.06 energy/s, about 1.5× a typical
  cell's whole upkeep), deposited as heat like all upkeep.
- **Body warmth.** The cell runs warmer than the water: `thermoWarmth = selfWarm · thermo · (1 + 0.5 ·
  bonds)`, with `selfWarm` 4°. A free cell at `thermo` 0.7 runs about 3° above the water and a cell with
  two bonds about 6°. Being part of a body is insulation, so bodies keep their warmth better than free
  cells. This is computed each frame from things the cell already knows, with nothing stored.
- **Neighbourhood warmth.** A colony of heat-makers raises its water by about +10°, with a halo a few
  degrees warm that reaches about `L` ≈ 10 cells.

What this sets up:

| In a cold era or cold snap | In a warm era or heat wave |
| --- | --- |
| Heat-makers stay active while cold-stressed neighbours go torpid. **Colonies become lifeboats**, and warmth-lovers huddle in their halo | Their extra warmth tips them, and warmth-lovers around them, past the optimum. **Colonies overheat**, scald, and bleach from the core outward |
| Warm halos become nurse grounds: the heat-maker pays, others benefit (facilitation) | Cold-lovers and cheap non-heat-makers take over the space they free |

This is a **trade-off that flips with the climate**, the cyclic kind the balance strategy (§3, point 3)
says keeps spatial worlds diverse and never settled. It is also a trade-off between species: a heat-maker
helps warmth-loving neighbours of other species and harms cold-loving ones. That gives the community a
structure of nurse species, followers and the excluded.

**Evolution.** Mutation moves `thermo` a little, and rarely switches it on or off (like `adhesion` and
`calcify` in `mutateInto`). `thermo` starts at 0 for most founders, 0.3-0.7 for a minority of crawler,
grazer and filament founders, and 0 for reefs (whose metabolic heat is their own warmth).

### 5.3 Matter and the climate

- **Glint** leak `× glintQ10^((T−tRef)/10)`, with `glintQ10` 2: glint lasts in cold water.
- **Husks** decay `× rotQ10^((T−tRef)/10)`, with `rotQ10` 2.5: cold keeps carcasses for scavengers; warm
  recycles silt to producers. These two make eras bite: cold eras favour grazers and scavengers, warm
  eras recycle nutrients.
- **Thermal motion**: `jitter × √(max(T,0) + 10) / √(tRef + 10)`. Grains shiver visibly more in warm
  water at deep zoom.
- **Hot springs**: silt where `T − Tbg > +8°` gains a charge chance of `ventCharge · smoothstep(8, 22, T −
  Tbg)`. The threshold is measured against the background, so a heat wave does not turn the whole sea into
  glint. But it can be reached by heat-maker colonies at `thermo` near 1. That is a deliberate,
  self-limiting loop (a colony that spends heavily makes some glint near itself), screened via
  `ventCharge` and the threshold.
- **Climate** (`src/climate.js`, section 6.6): each era's background temperature is a bounded random walk,
  with seasons of ±2.5°, an excursion (heat wave or cold snap) in about a third of eras, and era names
  that follow the temperature.

### 5.4 Surface flow (screened in phase 2)

`flowAt` gains a term for matter and drifters: `u_m = −marangoni · ∇T`, scaled by `advect` for living
cells. The flow converges on cool water (`∇·u < 0` at temperature minima), so:

- A warm crowd pushes its own silt and food outward, which slows its photosynthesis and division and
  thins and cools it. This is a negative feedback on clumping with a range of about `L`.
- Cool seams between warm patches collect silt, glint and husks, so grazers and scavengers concentrate
  there.
- Several warm patches should space themselves out, and matter should gather into a net between them, as
  in Bénard convection. Over time the pattern may coarsen or keep reorganising as patches move with the
  currents.

At `marangoni` 0.05 and a gradient of about 1°/cell at a colony's edge, the drift is 0.05 cells/s:
noticeable against currents of 0.1-0.4, but not dominant. This is the highest-risk, highest-reward rule:
it could produce the most striking patterns in the simulation or a mess. Only a screen with eyes on the
result can tell (section 10).

### 5.5 Vents

- **Number**: `seed()` draws `rock.z ∈ {0, 0, 1, 1, 2, 3}` vents, capped by the number of outcrops. The
  first `rock.z` outcrops of `inRock` host one at their first disc's centre.
- **Pulse**: `pulse_v(t) = 0.55 + 0.45·sin(2πt/P_v + φ_v)`, with `P_v` 90-240 s. A surge (×3 for about 20
  s) happens with probability 0.05 per 30-second window, hashed from `floor(t/30)` and the vent index, so
  no state is stored.
- **Era**: `ventMul` 0.4-1.6 per era.
- **What they do**: heat, hot-spring charge, and more sparks (`sim.abio · (1 + abioHeat · smoothstep(4,
  20, T − Tbg))`). `randomInto` takes the local temperature, `topt = T + gauss·3`, so a spark in a plume
  founds a thermophile.
- **Expected picture**: a lethal core, a ring of thermophiles at the distance they can stand, and
  mesophiles grazing the hot-spring glint downstream in the plume's tail.

### 5.6 What we hope to see

These are hypotheses for the screens to confirm or refute, not promises.

| Phenomenon | Mechanism | How it would show |
| --- | --- | --- |
| **Thermal territories** | Specialist bonus + thermotaxis + life's own heat | Species sort into warm and cool patches whose edges are thermal fronts, visible on the heat map as isotherms hugging the boundaries of species |
| **Nurse colonies** | Heat-maker halos | Warmth-loving species clustered around heat-maker bodies; cold-lovers absent within about 10 cells |
| **Lifeboats** | Heat-makers avoid torpor | In a cold snap the world goes still and dim except warm islands where life keeps moving and singing. After the thaw, life spreads back out from them |
| **Overheating collapse** | Heat-makers tipped past their optimum | In a heat wave, bodies bleach from the core and fall to scavengers. A carcass ring and a burst of scalding |
| **Moving warm patches** | A bloom's heat drifts downstream; warmth-lovers follow it | A patch that travels with the current, chasing its own warmth |
| **Thaw blooms** | Torpor ends together | A wave of births after a cold snap, heard as songs returning |
| **Vent rings** | Lethal core, thermophile ring, plume grazers | Concentric zones of species around each vent |
| **Convection nets** (if surface flow is adopted) | Warm patches push matter to cool seams | Silt and grazers in a cellular net between warm colonies |
| **Era turnover** | Matter rates + preferences + random-walk climate | The leading species changes near era boundaries; each world's thermal history leaves its own fauna |

### 5.7 What could go wrong, and the guards

| Risk | Guard |
| --- | --- |
| Heat-makers win everything (warmth everywhere) | Their cost (about 1.5× upkeep at `thermo` 1), overheating in warm eras, surface flow pushing away their silt, and kin crowding. Screen `thermoCost` |
| Nobody evolves heat-making | Founders include some. If it still dies out, lower the cost or raise `selfWarm` |
| Everything converges on `topt ≈ Tbg` | The specialist bonus and life-made contrast work against it; measure `toptSpread` |
| Collapses in heat waves (`persisted` regresses) | Torpor, stone refuges, steps capped at ±10° and eased over 3 minutes, and a gentle `scald`; gated |
| A crowd heats itself into a runaway | Bounded by `heatLoss`. A crowd smaller than `L` cannot reach full excess |
| Thermotaxis overrides hunting and fleeing | It scales with `min(1, abs(x))`, so a cell near its optimum does not steer |
| Surface flow strips worlds of structure | It is a knob, default 0, adopted only on evidence |

---

## 6. Rules and state in detail

### 6.1 Storage

| What | Where | Notes |
| --- | --- | --- |
| Heat field | One new storage buffer `thermal: array<atomic<u32>>` with three sections of `MAX_CELLS` words: `[0, M)` deposits (fixed point, 2²⁰ per degree), then temperature A and B (`f32` bits read through `bitcast<f32>(atomicLoad(...))`). The current temperature section alternates with frame parity | One binding, not three: `lifeMain` already binds 9 storage buffers, and the page requests `maxStorageBuffersPerShaderStage` 10 (`src/main.js:53`, `tools/sim.mjs:72`). 3 MB at most |
| Stone heat capacity | `stoneGrid` counts reef grains (`resolveCount`); bedrock goes into its high 16 bits, and `matterMain` masks the low 16 | No new buffer |
| Sim uniform | `simData` is 240 bytes and `SIM_STRIDE` 256, so exactly one more `vec4f` fits: `heat: vec4f(Tbg, ventMul, heatOn, tRef)` | `simRing` staging is unchanged |
| Genes | `topt` in word 46 (`gp1`), `tol` in word 47 (`gp2`), `thermo` in word 15 (`dev.w`, unorm8) | `writeGenome`, `readGenome`, `mutateLike`, `archetypeGenome`, WGSL `mutateInto`, `randomInto`, `finalize`. `G_BYTES` stays 192 |
| Death cause | `info & 15` code 10 is scalded, 11 frozen (only below 0° and far below the optimum) | Codes 10-15 are unused |
| Ledger | Heat deaths per guild go in `META_DEATH` words 20-24 (free), and thermogenesis spending in energy slot 7 (free) per guild. A living-weighted 16-bin temperature histogram plus torpid and heat-maker counts go in `META_ENERGY` words 40-63 (free), sampled once a second per cell like the energy ledger. A 16-word `META_HEAT` block before `META_CLAIM` holds the world heat budget (metabolism, thermogenesis, sun, vents, decay, loss) | `LEDGER_HEAD` moves by 64 bytes |

### 6.2 The heat step

`heatMain` is a new compute entry with one thread per grid cell, run after `lifeMain` in `_step`:

```
c      = this cell's centre
T*     = bilinear(Tᵢ, c − flowAt(c)·dt)                 // carried with the water
lap    = Tᵢ[E] + Tᵢ[W] + Tᵢ[N] + Tᵢ[S] − 4·Tᵢ[c]
C      = 1 + stoneMass · stones(c)
Q      = atomicExchange(deposits[c], 0) / 2²⁰            // metabolism, thermogenesis, decay this step
       + sunHeat · light(c) · dt
       + Σ_vents ventHeat · ventMul · pulse_v(t) · gauss(|c − v|, 1.5) · dt
Tₒ[c]  = T* + heatD·lap·dt + Q / C − heatLoss·(T* − Tbg)·dt / C
```

- **Stability.** Explicit diffusion needs `heatD·dt < 0.25`, which allows up to 15 at `dt = 1/60`.
  Bilinear advection adds about 0.2 cells²/s of numerical diffusion, small next to `heatD = 1`.
- **Start.** The field starts at `Tbg` everywhere. Vents and colonies warm their surroundings over the
  first minute.
- **Reduction.** Each workgroup adds its sums to `META_HEAT`, so the census has mean water temperature
  and the heat budget without reading back the field.
- **Deposits.** `lifeMain` deposits `upkeep · metabHeat` (thermogenesis included) on every eighth frame
  per cell, staggered by `p.id`, eight frames' worth at a time. That is about N/8 atomics per frame.
  `matterMain` deposits husk decay the same way.
- **Reading.** `cellWGSL` samples `T` bilinearly at `p.pos` and takes `∇T` from the same four corners.
  `matterMain` reads the nearest cell; surface flow (5.4) needs a gradient there too, so it uses four
  corners when `marangoni > 0`.

### 6.3 Genes and evolution

| Gene | Range | Mutation (`mutateInto`, mirrored by `mutateLike`) | Founders (`archetypeGenome`) | Sparks (`randomInto`) |
| --- | --- | --- | --- | --- |
| `topt` | 0-45° | `+ gauss·m·3` | `T₀ + gauss·3` (T₀ the world's start) | local `T + gauss·3` |
| `tol` | 2-15° | `× exp(gauss·m·0.3)` | `mix(5, 10)`; reefs `mix(3, 6)` | `mix(3, 10)` |
| `thermo` | 0-1 | `+ gauss·m·0.15`; switches on (0.3-0.7) or off with probability `m · 0.1` | 0 for most; 0.3-0.7 for about 25% of crawler, grazer and filament founders | 0 |

- **`deriveMetab`** is unchanged. Thermogenesis is paid as an explicit upkeep term so the ledger can show
  it separately (slot 7), and the specialist bonus is its own trade-off.
- **ecostats `TRAITS`**: do **not** add the new genes to the fingerprint until a new baseline is recorded.
  The fingerprint's length feeds `spread`, which is gated against the stored baseline. Report the genes in
  a separate `thermal` block instead (section 10).

### 6.4 Matter

`matterMain`, using the nearest cell's `T` (four corners when surface flow is on):

```
glint:  p.energy −= leak · pow(glintQ10, (T − tRef)/10) · dt
husk:   p.energy −= decay · pow(rotQ10, (T − tRef)/10) · dt; deposit the lost energy · rotHeat
silt:   charge chance += ventCharge · smoothstep(8, 22, T − Tbg) · dt
all:    kick · sqrt(max(T, 0) + 10) / sqrt(tRef + 10)
        vel += −marangoni · ∇T                                  // only when the knob is on
```

### 6.5 Vents

As in 5.5. They are hashed from `sim.seed` and the outcrop index like the outcrops themselves, so nothing
is stored per vent.

### 6.6 Climate (`src/climate.js`)

```
startEra():  climate.tempTo = clamp(prevTemp + mix(−10, 10, r()), 4, 28)   // a random walk
             adjective: Δ ≥ +5 → pick(['Warm','Rising']); Δ ≤ −5 → pick(['Bitter','Pale']); else as today
             with probability 0.35: schedule one excursion (±5-8°, 2-4 min) in the era
             climate.ventMul = mix(0.4, 1.6, r())
tick(dt):    eng.temp += (climate.tempTo − eng.temp) · min(1, dt / 180)
             Tbg = eng.temp + 2.5 · (season − 0.55) / 0.45 + excursion(t)
```

- **The First Tides** starts at a world-drawn `mix(10, 22)`.
- **History.** `climate.history` entries gain `temp`. Excursions push `{t, kind, dT, dur}` and fire
  `climate.onExcursion`.
- **Random walk, not independent draws.** Lineages can track the climate, and a world's thermal history
  becomes part of its character. All of it runs on the climate's own RNG and clock, like light, never from
  the census.

### 6.7 Knobs (`DEFAULT_K`)

Starting points; adopted values come from the screens and the gate. With `heat: 0` the field is not even
computed.

| Knob | Start | Meaning |
| --- | --- | --- |
| `heat` | 0 → 1 | Master switch |
| `heatD` | 1.0 | Diffusion, cells²/s |
| `heatLoss` | 0.011 | Relaxation to `Tbg` per second (about 90 s) |
| `metabHeat` | 0.12 | ° per unit of upkeep energy |
| `sunHeat` | 0.04 | °/s at full light |
| `rotHeat` | 0.3 | ° per unit of husk energy lost |
| `ventHeat` | 60 | °·cell²/s per vent at `ventMul` 1 |
| `stoneMass` | 0.15 | Heat capacity per stone grain in a cell |
| `tRef` | 16 | Where every Q10 factor is 1 |
| `specBonus` | 0.4 | Peak performance gain of the narrowest tolerance |
| `stressCost` | 0.5 | Extra upkeep at full stress |
| `torporAt` | 1.5 | Tolerances below the optimum where torpor starts |
| `torporCost` | 0.25 | Upkeep multiplier in torpor |
| `scald` | 0.08 | Death chance per second at full heat stress |
| `thermotaxis` | 0.6 | Steering strength relative to swim |
| `thermoCost` | 0.06 | Energy/s at `thermo` 1 |
| `selfWarm` | 4 | Body warmth (°) at `thermo` 1, ×1.5 with two bonds |
| `glintQ10` | 2.0 | Glint leak |
| `rotQ10` | 2.5 | Husk decay |
| `ventCharge` | 0.6 | Extra silt charge per second at a vent's core |
| `abioHeat` | 3 | Extra spark weight in hot water |
| `marangoni` | 0 | Surface flow (screened in phase 2) |
| `q10` | 1 | Absolute upkeep Q10 (screen) |
| `viscK` | 0 | Viscosity (screen) |
| `heatMut` | 0 | Heat-stress mutagenesis (screen) |
| `bondMelt` | 0 | Heat-stressed bonds break sooner (screen) |

---

## 7. Systems touched, file by file

### `src/shaders.js`

- **`COMMON`**: `Genome.gp1`/`gp2` renamed `topt`/`tol`. Add `fn thermalPerf(g, T)` and `fn thermoOf(g)`
  (unpacks `dev.w`), shared by simulation, rendering, listening and the mind.
- **`simWGSL`**: `Sim.heat`, binding 18 `thermal`, and `heatAt(p)` / `heatGrad(p)`.
- **`cellWGSL`**: sections 5.1-5.2, with mind hooks for `Tc`, `perf`, `torpid`, `stress`, `∇T`, the
  thermotaxis vector and the thermogenesis cost. As `test/mind.test.js` requires, the hooks expand to
  nothing in `lifeMain`.
- **`resolveCount`**: count bedrock into `stoneGrid`'s high half.
- **`matterMain`**: section 6.4.
- **`lifeMain`**: deposits, scalding, the heat-death ledger, and `addEnergy(dg, 7u, thermogenesis)`.
- **`heatMain`** (new): section 6.2.
- **`mutateInto`, `randomInto`, `finalize`**: section 6.3.
- **`mindMain`**: `MIND_HEAD` 50 → 58 (word 21, free today, takes `Tc`).
- **`LISTEN_WGSL`** binds `thermal`:
  - A new event type `scalded` (husks with code 10).
  - Torpid cells are not `alive` candidates, so sleeping cells do not sing.
  - Header scalars: mean T in view, mean stress, torpid share, heat-maker share, and the strongest vent
    in view.
  - The header layout moves (in-view counts `[0, 12)`, out-of-view `[12, 24)`, scalars from 24,
    `LISTEN_HEAD` 32 → 40). `LISTEN_TYPES`, `LISTEN.types` and the tests change together, since
    `test/audio.test.js` deep-equals them.
- **`SURVEY_WGSL`**: `SURVEY_WORDS` 10 → 15: Σ T × 10, Σ `topt` × 10 of the living, heat-makers, torpid,
  scalded. The director and the new spatial metrics both use them.
- **`DRAW_WGSL`**: `vsPoint` binds `thermal` read-only (vertex-stage storage buffers 8 → 9; check the
  vertex limit on target devices) for bleaching, torpor and pulse rate. `fsStone` draws vent orifices.
- **`POST_WGSL`**: `fsComposite` binds `thermal` for the heat map and shimmer. `post.p2` (slot 15, the
  only spare) becomes `heatVis`. `postData` grows by one `vec4f` (Tbg, map range, shimmer).

### `src/engine.js`

- **Buffers and passes**: allocate `b.thermal`; binding 18 in `cpDefs` for `lifeMain`, `matterMain`,
  `heatMain` and `mindMain`; dispatch `heatMain` after `lifeMain`.
- **`seed()`**: vents, the starting background, and clearing the deposits and both temperature sections
  to `Tbg`.
- **`_fillSim`**: floats 60-63. **`onCensus`**: `heatBudget`, `heatHist`, `heatDeaths`.
- **`requestHeat(rect)`**: an on-demand patch readback for the specimen panel and hints ("Water 18°
  here"), like `requestPick`.

### `src/climate.js`, `src/genome.js`

- **Climate**: section 6.6.
- **Genome**: words 15, 46 and 47 in `writeGenome`/`readGenome`. The new genes in `archetypeGenome`
  (with a `T0` argument) and `mutateLike`.
- **Helpers**: a CPU `thermalPerf(g, T)` mirroring WGSL, and `thermalGuild(g)`: **cold-loving**
  (`topt < 10`), **temperate**, **warmth-loving** (`topt > 28`; above 38 a **thermophile**), crossed with
  **specialist** / **generalist** by `tol` (below 4 / above 10), and **heat-maker** at `thermo > 0.2`.

### `src/headless.js`, `src/ecostats.js`, `tools/`

- **Samples** gain a `thermal` block:
  - water mean and p10/p90 (from the histogram), and Tbg;
  - heat budget terms per minute;
  - heat deaths per guild, and the torpid and heat-maker shares;
  - `topt` mean and spread (population-weighted), and thermal guild shares;
  - the excursion in progress.
- **Spatial sampling**: headless runs turn on `eng.survey` and keep the tile data at each sample, for the
  spatial metrics of section 10.
- **`tools/sim.mjs`**: `--no-heat`; `--png` with `HEAT=1` for a thermal frame; and **`--png-every S`**,
  which writes a frame every S simulated seconds for time-lapses (Dawn only, like `--png`). The look of a
  variant has to be judged by eye.
- **Page**: a URL hash `#k={…}` to open the page with `DEFAULT_K` overrides, so variants can be watched
  live side by side.

### Observational passes stay observational

`mindMain`, `LISTEN_WGSL`, `SURVEY_WGSL`, picking and watching only **read** `thermal`. The census still
only names and tracks lineages.

---

## 8. The page

### 8.1 Status rail

- **Water gauge** (`#g-heat`, `data-tip="water"`) between Light and Tide:
  - a 10-segment thermometer (`#heat-seg`), blue to amber;
  - `#heat-v` = `18°` with a trend arrow;
  - during an excursion it pulses, and the aria-label reads "heat wave, 26° and rising".
- On phones it becomes a 🌡 glyph, like the light gauge's ☀ (page.css:636-640).
- Era names now carry meaning (6.6).

### 8.2 Census column

- Under `#mix`, a **thermal bar**: cold-loving, temperate and warmth-loving, with a heat-maker tick.
  Its rows focus on `thermal:*` facets.
- `life.history` gains `temp`, `tLo`, `tHi`, `scald`, `torpid` and `makers`.
- `#feed` takes excursion, vent and lifeboat entries (8.7).

### 8.3 Settings and keys

- **Display → Heat map**: key **E** (free), `data-tip="heatmap"`, **Off / Shimmer / Full**, persisted as
  `settings.heat`. Help line: `<dt>G · E · W</dt><dd>Light map · heat map · currents</dd>`.
  - **Shimmer** (default): a schlieren-style haze. `fsComposite` offsets the scene's UV by `∇T ×
    noise(time, position)`, so plumes, colony halos and fronts waver like hot air above a road. It reads
    as microscope optics, since a density gradient bends light. It follows **Optics**.
  - **Full**: a false-colour thermal camera at 40% opacity (deep blue → teal → amber → white over the
    world's p2-p98 range) with isotherms every 2°. The `.ramp` legend shows the numbers. Make the CSS
    gradient match the shader ramp; the light legend's does not today.
  - With both the light map and the heat map at Full, the heat map draws isotherms only.

### 8.4 The world itself (cosmetic)

| Cue | Where | Rule |
| --- | --- | --- |
| **Bleaching** | `vsPoint` | colour mixed toward pale grey-white with heat stress, up to 60% |
| **Torpor** | `vsPoint`, `fsPoint` | brightness × 0.6, pulse frozen, a faint frosted rim at resolved zoom |
| **Heat-makers glow** | `vsPoint`, `fsPoint` | a faint warm rim and inner glow, scaled by `thermo` and body warmth; at resolved zoom, organelles cluster toward the centre |
| **Pulse follows performance** | `vsPoint` | the existing pulse rate × `(0.6 + 0.8·perf)`: heart rate follows performance |
| **Vent orifices** | `fsStone` | an emissive amber core flickering with `pulse_v` |
| **Thermal motion** | `matterMain` (6.4) | grains shiver more in warm water |
| **Warm murk** | `fsMurk` | flocs tinted 3% warmer and drifting 10% faster in warm water |

### 8.5 Specimen panel (`src/specimen.js`)

- **Vitals**: a third row, **Warmth**: `vital('Warmth', perf, 'heat', '23° in 21° water', 'thermal')`.
  - For a heat-maker the text shows its body warmth: "runs 4° warm".
  - Torpid: "Torpid · 4° below its range".
- **`cellBlock`**:
  - **Water here** (`requestHeat`, or the mind's `T` word).
  - **Upkeep** gains `stress +12%` and `heat-making +0.03/s`; **Net** includes both.
- **Genome tab**, a new group **Temperature**:
  - `trait('Optimum', topt, 0, 45, '24°', 'optimum')`, `trait('Tolerance', tol, 2, 15, '±7°', 'tolerance')`
    and `trait('Heat output', thermo, 0, 1, …, 'heatmaker')`.
  - A small **niche curve**: an SVG of `thermalPerf` from 0 to 45° with the specialist peak, a marker at
    the water's temperature and the world's p10-p90 band behind. It is built once, and the marker moves in
    place.
- **Species tab**:
  - **Thermal niche**, e.g. "warmth-loving specialist, heat-maker, 31° ± 3°".
  - The water the species has lived in over time, under the population sparkline.
- **Matter**:
  - Glint: "fades in …", aware of temperature.
  - Husks: "rotting fast in warm water".
  - Silt near a vent: "Hot spring: charges in about N s".
  - Vent stone: **Vent**, with strength and pulse.
- **`tagsOf`** (`facets.js`): `warmth-loving`, `cold-loving`, `specialist`, `heat-maker` chips.
- **Viewer overlay** (`drawViewerUI`): the local water temperature.

### 8.6 Mind view (`src/mind.js`, `src/mindview.js`)

- **`GROUPS`**: **Warmth** (`mind-heat`, amber), the thermotaxis arrow on the compass.
- **`MODES`** in the `interpretMind` chain:

  | Mode | Rule | Placed |
  | --- | --- | --- |
  | `torpid` "Torpid in the cold" | `torpid` | first |
  | `scalding` "Scalding" | `x > 0.8` | before `starve` |
  | `seekwarm` "Seeking warmth" / `seekcool` "Seeking cooler water" | thermotaxis ≥ 25% of the drives | after `forage`, before `avoid` |
  | `huddle` "Keeping warm" | a heat-maker in a body with `x < 0` | before `body` |
  | `bask` keeps its name; its hint adds "in warm, bright water" at peak `perf` | | |

- **Lamps**: add `cold`, `hot` and `warm body` (heat-makers) to the fixed list and to `flags`.
- **`budget`**: gains `stress` and `heatmaking`.

### 8.7 Field Lab (`src/lab.js`, `src/charts.js`)

- **Charts**:
  - **Climate**: gains `temp` "water" with a p10-p90 band.
  - **Heat** (new): heat in by source (life, heat-makers, sun, vents, decay) against heat lost, plus
    scalded and torpid counts.
  - **Thermal niches** (new): species as dots at `topt` (x) against population (y, log). Dot size shows
    tolerance and a ring marks heat-makers, drawn over a histogram of the water. It shows whether life is
    tracking the climate, sorting into territories or hiding in refuges.
- **Eras list**: `· water N°`, plus excursions.
- **Species list**: a **Niche** filter (cold-loving, temperate, warmth-loving, heat-maker) and a
  **warmest** sort.
- **Census**: a **Niche** section, and Condition chips `state:4` "Heat-stressed" and `state:5` "Torpid"
  (new `stateMode` branches in `focusPass`).
- **Lineage**: an optional tint of the background temperature behind the bars.
- **Log** (`TYPES` gains `heat`):
  - "A heat wave: the water rises 7° for 3 minutes" / "A cold snap"
  - "A vent surges"
  - "Mass bleaching: N cells scalded in a minute"
  - "First thermophile: *Genus species* at 34°"
  - "*Genus species* is keeping N cells warm through the cold" (a heat-maker species whose colonies hold
    most of the active life during a cold snap: computed from the census, used for the log only)

### 8.8 Glossary and field guide (`src/guide.js`)

- **GLOSSARY**: `water`, `heatmap`, `thermal`, `optimum`, `tolerance`, `specialist`, `heatmaker`,
  `torpor`, `scalding`, `thermotaxis`, `vent`, `bleaching`, `thermalmass`, `thermophile`, `heatwave`,
  `surfaceflow`, `mind-heat`.
- **GUIDE**:
  - Rewrite the overview's energy paragraph ("Energy is the only thing that enters and leaves…") to
    follow energy into heat and out to deep water.
  - Extend **Tides, light, seasons and eras**.
  - A new section, **Heat**: where heat comes from (mostly life), how it spreads and leaves, preferences
    and tolerance, heat-makers, torpor and scalding, vents, and reading the heat map.
  - Extend **Ecology** with how heat links species and with the thermal side of eras.

### 8.9 Auto camera (`src/director.js`) and captions

- **`PARTS`** gains `vent`, `front` (strong `|∇T|` with different `topt` on each side, from the survey's Σ
  `topt`), `lifeboat` (active heat-makers in a torpid neighbourhood) and `bleach`.
- **Shots**:
  - a slow push-in on a vent ring;
  - a follow along a thermal front;
  - in a cold snap, a wide shot, then a lifeboat;
  - after the thaw, "Waking".
- **`REASON`**:
  - vent: ["heading to a hot spring", "a vent warms the water here"]
  - front: ["heading to where warm water meets cold", "a thermal front"]
  - lifeboat: ["heading to a warm island in the cold", "heat-makers are keeping this colony awake"]
  - bleach: ["heading to where the heat is killing", "cells are scalding here"]
  - waking: ["heading to where life is waking", "the cold is lifting"]
- **Wide-shot sub** gains `· water N°`.

---

## 9. The soundtrack

The soundtrack is the sound of what is in view, so heat is heard **where the camera looks**, from the
listening scan, blended toward the world mean as the view widens (the `z`/`far` model in `listen.js`).

### 9.1 Data path

- **`world`** (`main.js` `feedSound`, `listen-capture.mjs`, `listen-render.mjs`): `temp` and `tbg`. The
  `Conductor` merges it with `Object.assign`.
- **`listen`** (`digest`): `heat`, `stress`, `torpid`, `makers` (heat-maker share in view), `vent`
  ({x, y, strength} or null), and `scalded` in `inView`, `outView` and `ev`.
- **`warm`**, in `Field`: `warm = clamp((mix(temp, heat, z) − 16)/12, −1, 1)`, smoothed over about four
  bars. `listen-render --heat` sweeps this one number.

### 9.2 Cold and warm

**Cold is clear, glassy, thin and long-ringing; warm is soft, humid, shimmering and quick.**

| Lever (existing identifiers) | Cold (→ −1) | Warm (→ +1) |
| --- | --- | --- |
| Pulse (`Conductor.setTempo`) | ×0.94 | ×1.06, on top of `tempoFor(speed)`, which stays unchanged (its values are tested) |
| Reverb (`eng.set('fdn', {damp, decay})`) | damp 7000 Hz, decay 11 s: icy halls | damp 3500 Hz, decay 8 s: close, humid air (the bridge's `decay 18` still wins in modulations) |
| `pluck` `coef` | −0.08: longer and brighter | +0.06: duller |
| `glass`, `tine` `dec` | ×1.4 | ×0.9 |
| Shimmer: `strings` vibrato depth, `vibe` `depth`, `glass` wobble, and the `cplx`/`swell` stereo detune constants (×1.0023 / ×1.003 become a `det` parameter) | ×0.5, still | ×2: heat haze. Pitch centres never move, so the "never glide" rule holds |
| Swarm (`swarm` Formlet detune, `ring`, `cut`) | narrow detune, ring ×1.3, cut +1500 | detune ×2.5 (a hazy murmur), ring ×0.8 |
| `sea` | thinner, slower swell | fuller and lower |
| `drone` FM index | −0.15 | +0.25 |
| `palette` | favours `sonar`, `circles`, `loops` on `glass` | favours `dub`, `piano`, `pad`, `loops` on `breath` |

**Modes need no audio change.** Climate-chosen adjectives (6.6) already map to modes in `ADJ`
(`conductor.js`): Warm is ionian, Rising lydian, Bitter phrygian, Pale lyddom. Warming eras modulate
brighter and cooling eras darker through the existing bridge.

### 9.3 New sounds

Each gets a SuperCollider twin in `tools/audio-parity/`.

- **`simmer`** (persistent): a vent in view.
  - `Dust(boil)` into a `Formlet` wandering by `LFNoise2` around 400-1200 Hz (bubbling), plus
    `BrownNoise` through a low `LPF` (rumble), panned to the vent.
  - Gains and densities only, never `f1`/`note`, so the era test's ban on retuning holds.
  - A surge is the kettle coming to the boil.
- **`frost`** (persistent): sparse high `Ringz` at 3-7 kHz excited by slow `Dust`, with long decay, like
  ice crystals ticking. It fades in with `max(0, −warm)` and the torpid share.
- **Heat-makers hum**: in `Field`, `alive` notes of heat-maker species get a soft low partial: a `breath`
  layer an octave down at 15% gain, so warm colonies are heard as a warm hum under their songs. It comes
  from the species' voice (`mapping.js` reads the genome), with no per-cell data.
- **`scalded` event**: a short, soft sizzle (`rustle`, `f0` 5000→1400, `rq` 0.3) and a faint high
  `glass` ping. `AMP` 0.08, in `MINOR`. It must stay gentle: single-sample crackle was removed once
  already (commit bbb4e0f).

### 9.4 Silence, lifeboats and thaws

**Torpid cells do not sing.** In a cold snap the field empties of song except where heat-makers keep a
colony awake. The view goes quiet, and a lifeboat is heard as a small warm chorus with a hum under it in
the frost. When the water warms, songs return cell by cell, a crescendo nobody wrote. Heat waves are
heard as hazier, quicker music, sizzles at the core of overheating colonies, and a bloom of scavengers'
skittering afterwards.

### 9.5 Score and interludes (`src/audio/score.js`)

- **`palette(name, prev, warmClass)`** stays deterministic. The `era` message carries `tempTo`.
- **Intensity `I`** stays driven by the tide. Heat moves timbre, not density.
- **Interludes** gain triggers at the start of an excursion (at most one each, respecting `duckUntil`):
  - **Heat wave**: the reigning motif on `strings` with doubled vibrato over a rising `pad`.
  - **Cold snap**: on `vibe` and `glass`, high and sparse.

### 9.6 Species songs

`voiceOf` may lift `bright` by `(topt − 16)/60`, and adds the heat-maker hum (9.3). `motif.js`
`character()` stays untouched (its statistics are tested): the song is the species' identity, not its
thermostat.

### 9.7 Tools and tests

- **Tools**: `listen-capture.mjs` records the new fields. `listen-render.mjs` gains `--heat period` and
  `--warm v`.
- **Neutrality test**: with `warm = 0`, no vent, no heat-makers and no `scalded`, output matches today's
  exactly.
- **`test/audio.test.js`**:
  - the moved header and the new type;
  - `simmer` and `frost` never receive `f1`/`note`;
  - the palette stays deterministic;
  - torpid records are absent.
- **Parity**: SuperCollider renders of `simmer`, `frost` and the detune/vibrato parameters.

---

## 10. How to judge it

The gate measures coexistence, and coexistence is a floor here, not the objective. The balance strategy
says so itself ("Nobody has looked at the page yet… The metrics cannot tell whether it is beautiful").
Each phase is judged three ways.

### 10.1 Watch it

- For each variant, run the page with `#k={…}` on a few seeds, and make time-lapses with `sim.mjs
  --png-every 20 HEAT=1` (heat map and scene side by side).
- Keep a short note per variant answering three questions. Which of the phenomena in 5.6 appeared? How
  long did they last? Would a viewer notice them?
- **This is the deciding criterion between variants that pass the gate.**

### 10.2 New metrics for structure (informational, from survey tiles)

| Metric | Definition | Higher means |
| --- | --- | --- |
| `patchiness` | Population-weighted Moran's I of each common species' tile counts at lag 1 | species form patches |
| `segregation` | Bray-Curtis dissimilarity of neighbouring tiles' composition over that of random tile pairs | a mosaic of distinct communities |
| `thermalSorting` | Correlation of tile water temperature with the tile's mean `topt` | life is in thermal territories |
| `fronts` | Share of living tiles on a strong gradient with different mean `topt` on each side | more thermal frontiers |
| `facilitation` | Co-occurrence of warmth-loving non-heat-makers with heat-makers over chance | nurse colonies exist |
| `repertoire` | Entropy of the state mix (torpid, steering, scalding, feeding, dividing, idle) | more kinds of behaviour at once |
| `eraGuildShift` | Mean L1 distance between guild shares of consecutive eras' late windows | eras bite |
| `toptSpread` | Population-weighted standard deviation of `topt` | thermal diversity holds |
| `structureTurnover` | How fast the `patchiness` map decorrelates (time to half) | patterns keep changing rather than freezing |

The same metrics should be computed for today's rules first. These are the first measures this project
has of spatial structure, and they are useful well beyond heat.

### 10.3 The gate as a floor

`npm run gate` before and after every ecological phase, as `CLAUDE.md` requires, plus the 131k × 60 min
check for anything adopted. Kill or retune a phase if:

- `persisted` or `foodWeb` regresses (Holm-corrected);
- frame time grows by more than 5%;
- or the structure metrics stay flat and nothing in 5.6 is visible.

**Rebaselining**: once the genes are adopted, record a new baseline with them in `TRAITS`, and keep the
old one.

---

## 11. Build order

1. **Phase 0: the field, observational.**
   - **Contents**: `thermal`, `heatMain`, metabolic, decay and sun deposits; the climate's temperature,
     era names and excursions; ledger and census fields; the rail gauge; heat map and shimmer; Lab climate
     series and Heat chart; the `world.temp` audio input and timbre mapping; `listen-render --heat`; the
     spatial metrics and `--png-every`.
   - **Then look.** If life's own heat already makes interesting shapes on the heat map (warm bodies,
     plumes downstream of blooms, cool gaps), coupling to it is promising. If it is a featureless haze,
     retune `metabHeat`, `heatD` and `heatLoss` before going on.
2. **Phase 1: preferences.**
   - **Contents**: `topt`/`tol`, the specialist bonus, thermotaxis, torpor, scalding, relative stress,
     glint and husk Q10, stone mass; vents and hot springs (they seed heterogeneity that preferences need
     early); the mind modes, specimen Warmth row and niche curve, Lab niches chart; torpor silence,
     `scalded`, `simmer` and `frost`; bleaching and torpor rendering.
   - **Judge** by 10.1-10.3.
3. **Phase 2: heat-makers, then surface flow.**
   - **Heat-makers**: `thermo` and its cost, body warmth, the lifeboat and huddle UI, the hum. Judge.
   - **Surface flow**: screen `marangoni` at 0.02, 0.05 and 0.1 on top. Watch first, adopt only on
     evidence.
4. **Phase 3: the remaining screens.**
   - Absolute `q10`, `viscK`, `heatMut`, `bondMelt`: one at a time, kept only if they add something
     visible or measurable.
   - Thermosynthesis at fronts (F) if `fronts` is high but the fronts are empty.
5. **Field guide and glossary**, written against what was adopted.

Each phase is one branch and appends an entry to this document with what was tried and kept, as
`ecology-ideas-2026-10-02.md` does from its section 5 on.

---

## 12. Open questions

- **How strong should life's heat be?** It is the central uncertainty. It should be strong enough that
  bodies and colonies make visible thermal territories, but not so strong that every crowd overheats.
  Phase 0's look decides the starting value.
- **Should thermotaxis also pull toward other cells' warmth directly**, a social cue rather than the
  field? It would make huddling faster, but heat already does this through the field, which is more
  honest. Try the field first.
- **Should heat-makers' body warmth fall with size?** Large cells hold heat better (surface to volume),
  which would tie `thermo` to `size` and give big heat-makers an edge. It is a small addition to
  `thermoWarmth`.
- **Light and temperature across eras: correlated or independent?** Independent draws give "Pale Glare"
  (bright, cold) and "Warm Murk" (dim, warm), which are more varied. Start independent.
- **Vents in open water** as seeps, so worlds without rock have them too?
- **Heat map range**: the moving p2-p98 range shows structure in every era, and a fixed range shows the
  drift across eras. Perhaps Full uses the moving range and labels it.
- **Does waking from torpor need an event** (restarting `age` with info code 12), so the listening scan
  and the camera can catch it? The returning songs may be enough.

---

## 13. Build log (2026-10-07): phases 0-2 in one pass

Built: the heat field (`heatMain`, deposits from all upkeep and rotting husks, sun, vents, stone thermal
mass, advection, diffusion, relaxation), the climate's temperature walk with seasons and excursions and
era words that follow it, the three genes (`topt`, `tol`, `thermo`), performance, thermotaxis, torpor,
scalding, relative stress cost, heat-making, glint and husk Q10, hot springs, sparks suited to their water,
thermal motion, and `marangoni` as a knob (default 0, not yet screened). Page: the Water gauge, the heat
map (E: Off / Shimmer / thermal camera), bleaching, torpor and heat-maker tints, vent and colony embers,
the specimen's Warmth vital, Water here, upkeep modifiers, a Temperature genome block with the niche curve,
the thermal niche of a species and its tags; mind modes (torpid, scalding, seeking warmth or cooler water,
keeping warm), a Warmth pull and Cold / Hot / Makes heat lamps; Lab charts (water, heat deaths, torpid
share, a thermal-niche scatter), eras with water and excursions, a Heat log filter; glossary and a Heat
section in the field guide; the soundtrack's `warm` (tempo ±6%, reverb damp and decay, pluck, tine and glass
ring), neutral at 0; `sim.mjs` `HEAT=` and `VENT=1` for PNGs, a `thermal` block in every sample, `#k={...}`
for the page.

### Departures from the plan, and why

| Plan | Built | Why |
| --- | --- | --- |
| `heatD` 1, `heatLoss` 1/90 (spread ≈ 9.5 cells) | 0.25, 0.033 (≈ 2.8 cells) | At 9.5 cells the field was a featureless haze on a 32k world (phase 0's look). At 2.8 cells isotherms ring single colonies and bodies, vents make distinct columns and fronts are sharp |
| `metabHeat` 0.12 | 0.18 | Same excess per unit of upkeep as the plan would need at the faster loss was 0.36; that drove a runaway (crowds warm their water ~10°, optima evolve up to match, a warm crowd overheats and scalds: one seed fell to 8% life). 0.18 keeps visible warm patches without it |
| Asymmetric curve peaking at the optimum, warm side ×0.45 | Flat top ±0.5 tolerance (`thermalFlat`), warm side 0.6 (`thermalWarm`) | Temperature is one selection axis every species shares; with a sharp peak the best-matched lineage sweeps whenever the climate moves. Gate 1: late effective species 89 → 48 (regressed), food webs 0.56 → 0.25. A flat top restored diversity (8-seed screen: 93 vs 67 with heat off) |
| `specBonus` 0.4, `scald` 0.08, `torporAt` 1.5, `thermoCost` 0.06 | 0.25, 0.03, 1.25, 0.03 | Specialists did not win anyway (tolerances widen to ~9°); scalding bursts at seasonal peaks; torpor never happened; heat-makers died out at ~1× a cell's upkeep |
| `ventHeat` 60, heat capacity divides every source | 45; a vent's spring is not slowed by stone | Vents sit on bedrock, whose thermal mass diluted their core into a broad warm smear |
| Vents only on outcrops | On outcrops while there are any, then in open water; more in larger worlds | Many small worlds have no outcrops |
| Three-section field in one buffer | Deposits + temperatures in `thermal`, next temperatures in `heatNext` | WebGPU forbids copying within one buffer |
| `scalded` listening event, `simmer`, `frost`, heat-maker hum, director shots, survey words, spatial metrics, `requestHeat`, `--png-every` | Not built | YAGNI for now: a scalded cell sounds as a starved one, the rest waits on the look of the adopted world. Q10 on upkeep, viscosity, heat mutagenesis and bond melting (phase 3) not built |
| Observational passes use the sim's tunables | `DRAW`/`LISTEN`/`POST` use `DEFAULT_K` (`shownThermal`) | They are constants shared with tests; a `#k=` override of the curve shows slightly off |

### Gate (32 seeds × 30 min at 32k, RTX 2080, Dawn via webgpu 0.4.0)

Before (this machine, current rules): every metric "same" as `balance/baseline-32k-30m.json`.

After (adopted defaults): passes. persisted 1 → 0.97, foodWeb 0.56 → 0.53, lateGuilds 2.56 → 2.75,
lateEffSpecies 89 → 75 (p 0.09, Holm 0.66: same), lateLivingFrac 0.54 → 0.52; notableSpecies 26 → 33,
leaderChanges 5.9 → 10.0 (improved), distinct outcomes 6.2 → 7.7. In the 32 worlds: torpor above 5% of
life at some point in 11, heat-makers above 20% of life in 18, late optimum spread 2.2°, scalding under 1%
of deaths (in bursts at heat peaks).

### Watched

Thermal camera at 131k, 14 min: white-hot colony cores with stacked isotherms, amber warm networks, teal
cool gaps. At a vent: a warm column, a ring isotherm at the core, one bonded species filling the warm water
and a front where cooler-water species take over (§5.6 "thermal territories", "vent rings" in part).
Not yet seen on screen: lifeboats through a cold snap, thaw blooms, moving warm patches; they need a page
session or a time-lapse. Next: watch excursions live, then screen `marangoni` 0.02 / 0.05 / 0.1, and record
a new baseline with the thermal genes in `TRAITS` once adopted.

---

## 14. Vents replaced by pyrite framboids (2026-10-08)

The vents (a landscape-scale feature: a mouth in the seabed, a gas column) never sat right in a world
where a cobble is a few microns; that work is kept on the `heat-vents` branch. Heat in water at this
scale spreads over a field of view in a fraction of a second, so warm spots need small, steady,
short-lived sources. Framboids are those: raspberry spheres of iron sulfide crystals, about cell-sized,
common in tidal mud, that oxidise exothermically. (The heat is exaggerated; the chemistry is real.)

- **A framboid is a grain of stone** with its own cause code (`FRAMBOID`): immobile and solid like stone,
  its energy the fuel it has left. It warms its grid cell by `framboidHeat` while it lasts and burns twice
  as fast per 10° warmer, so a crowded, hot cluster burns itself out; spent, it crumbles to silt.
- **It forms where carcasses rot**: a husk rotting out in a grid cell holding three to `framboidPile`
  husks may leave a framboid instead of silt (`framboidForm`), but only in water no warmer than the
  background (pyrite crystallises in cool mud; this also breaks the loop heat → deaths → husks →
  framboids → heat, which ran away to 1,000+ framboids and 46° water at first). Husks are counted per
  grid cell while binning (a third section of `b.thermal`). A few framboids lie in the world's mud
  patches from the start, part burnt.
- **What follows**: framboids wax in cool seasons (piles form them) and wane in warm ones (they burn
  fast); a die-off leaves a warm, glint-rich oasis for a few minutes (warm water charges silt, `hotCharge`).
  In a 32k world there are usually a few dozen.
- **Drawn** in the stone pass at about half a cobble: a sphere of brassy crystals laid on the sphere (they
  crowd toward its limb), jittered, with dark seams, a metallic glint per crystal and a faint warm glow in
  the seams that dims with its fuel. The specimen panel names it and shows its fuel.
- **Removed**: vents (CPU placement and pulse, `ventHeat`, the era's vent strength, their uniforms, heat
  source and rendering, `VENT=` in `sim.mjs`); `ventCharge` is now `hotCharge`. `FRAMBOID=1` centres a PNG
  on the densest cluster. Each sample's `thermal` block counts framboids.

**Gate** (32 × 30 min at 32k): passes; every gated metric "same". foodWeb 0.56 → 0.25 (p 0.009, Holm
0.06) and producersPersist 0.81 → 0.50 looked worrying, so a paired screen on 12 seeds with framboids off
and on (everything else equal) followed: with framboids, foodWeb 0.67 vs 0.42, effective species 75 vs 64,
guilds 3.0 vs 2.7. The dip is the heat system's variance across these seeds' worlds (removing the vents
changed every world's random draws), not the framboids. notableSpecies 26 → 35 and leaderChanges 5.9 →
10.2 improved, as with vents.

---

## 15. Rebased onto the coarse steps and the polished panels (2026-10-09)

- **Coarse steps** (main's fast speeds): thermal upkeep (stress, torpor, heat-making) is paid in the tick
  walk, torpid cells skip its divisions and meals, digestion scales by performance there too,
  thermotaxis runs in the 1/60 s motion substeps, hot springs use the exact coarse charging chance, and
  headless forks snapshot the heat field and the climate's temperature. The background temperature
  rides in the uniform's spare word (`sim.tbg`).
- **Framboids are their own particle kind** (4; living genomes start at 5). They stay solid like stone in
  the simulation and are drawn in the stone pass, but are counted, named and highlighted as Framboids:
  a census row, their own glyph and specimen entry. A spent one crumbles to silt with its own cause.
- **Panels**: the rail's gauge is "Temp", a thermometer whose tube fills with bars lit in their own
  temperature's colour (a dial with a needle was mocked and set aside: less legible at rail size, and a
  third kind of instrument beside the light bars and tide wave); phones show a small upright thermometer.
  The Census tab gains a Temperature facet group and Heat-stressed and Torpid condition chips; Species
  gains a Temp filter and a Warmest sort; the specimen's energy budget has Water here, Heat stress and
  Heat-making rows; the behaviour panel's heading/target key sits above the compass, and one lamp
  (Too cold / Too hot) replaces two. Charts: "Temperature".
- **Minerals**: stone grains are drawn as irregular faceted fragments (five to eight facets, a chip broken
  off some, each face its own lightness, bedrock in mixed mineral tints) instead of round cobbles;
  framboids are squashed, lumpy clusters of partly faceted crystals of varied size.

**Gate** after the rebase and these changes (32 × 30 min at 32k): passes, every gated metric "same";
notableSpecies 26 → 35 and leaderChanges 5.9 → 8.9 improved; foodWeb 0.56 → 0.34 (p 0.08, Holm 0.53).

## 16. Sediment under the microscope, panel polish and a rot fix

- **Stone grains are kinds of sediment** (`vsStone` picks one per grain; `mineralSurf` draws it; `boulder`
  lights it as its material): angular quartz (faceted glass: the surface is the lowest of a set of
  planes, with curved fracture ripples, a hairline crack, inclusion specks and trails), blocky pink or
  cream feldspar (stepped cleavage, twinning bands, perthite streaks), long dark mafic prisms (two faces
  meeting in a ridge, striations, crossing cleavage cracks), rounded frosted sand, coiled foraminifer
  tests (chambers on a log spiral, sutured and pored), diatoms (pored glass discs with a raised rim, or
  ribbed boats with a raphe), shell shards (growth lines and ribs) and sponge spicules. Bedrock is mostly
  mineral grains, reef stone (laid down by calcifiers) mostly skeletons and keeps a little of its
  builder's tint. Fine detail fades in with size on screen, the finest (clinging silt, inclusion trails)
  only right up close. The stones are lit by a lower, raking light so each grain's form shows, and the
  old table shading's slope sign (which lit bevels and domes as if sunken) is fixed. Render-only; about
  +0.6 ms per 1600×1000 frame when stones fill the screen.
- **Panels**: the rail's gauge graphics centre on their labels' ink; on phones the Tide gauge gives way to
  a season track under the era name (it also stays at 360 px, where the gauge was hidden); the census
  condition chips sit under their own heading as one block (life cycle in a row of three, temperature
  in a row of two); the behaviour compass's key keeps the drives' row pitch and is centred over the
  compass, with room before the lamps.
- **Husk rot is capped by what a husk holds.** Rot speeds up in warm water (`rotQ10`), but its heat was
  the uncapped amount: in water ~100° over the background a husk gave off thousands of times its energy,
  scald deaths made more husks, and one dense 1/60 s world ran to 3,766° over the background. A husk now
  rots no more than it holds. The gate passes after it (all gated metrics "same").
