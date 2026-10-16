// Ecology statistics for headless runs and ensembles: pure functions, no GPU.
import { dietGuild, mobilityGuild } from './genome.js';

export const DIETS = ['producer', 'grazer', 'predator', 'scavenger'];
export const MOVES = ['sessile', 'crawler', 'swimmer', 'drifter'];
// Traits averaged over living cells, each scaled to [0, 1] by the range mutation allows.
export const TRAITS = {
  photo: [0, 1], dGlint: [0, 1], dHusk: [0, 1], dFlesh: [0, 1], swim: [0, 3], advect: [0, 1],
  adhesion: [0, 1], size: [0.45, 2.6], lifespan: [20, 500], reproE: [0.6, 4],
};
const SHARE_NOTABLE = 0.05;
// raw genome traits averaged within each guild (guildTraits): how each guild evolves
export const GUILD_TRAITS = ['swim', 'size', 'adhesion', 'advect', 'lifespan', 'reproE', 'share', 'drag', 'force', 'radius', 'photo', 'dGlint', 'dHusk', 'dFlesh', 'calcify', 'mutRate'];

/** One census of the community. species: [{ pop, genome }] for every living slot. */
export function communitySample(species, adhMin) {
  let living = 0, entropy = 0, simpson = 0, bodies = 0;
  const diet = Object.fromEntries(DIETS.map((k) => [k, 0]));
  const movement = Object.fromEntries(MOVES.map((k) => [k, 0]));
  const traits = Object.fromEntries(Object.keys(TRAITS).map((k) => [k, 0]));
  for (const { pop } of species) living += pop;
  const top = [];
  // each guild's leading species, by share of that guild (who leads the grazers, the predators...)
  const byGuild = Object.fromEntries(DIETS.map((k) => [k, []]));
  const gt = Object.fromEntries(DIETS.map((k) => [k, { n: 0, ...Object.fromEntries(GUILD_TRAITS.map((t) => [t, 0])) }]));
  for (const { pop, genome: g } of species) {
    const p = pop / living;
    entropy -= p * Math.log(p);
    simpson += p * p;
    const d = dietGuild(g), m = mobilityGuild(g);
    diet[d] += p; movement[m] += p;
    if ((g.adhesion || 0) > adhMin) bodies += p;
    for (const [k, [lo, hi]] of Object.entries(TRAITS)) traits[k] += p * (g[k] - lo) / (hi - lo);
    if (p >= SHARE_NOTABLE) top.push({ serial: g.serial, share: p, diet: d, move: m, depth: g.depth });
    byGuild[d].push({ serial: g.serial, pop });
    gt[d].n += pop;
    for (const t of GUILD_TRAITS) gt[d][t] += pop * (g[t] ?? 0);
  }
  top.sort((a, b) => b.share - a.share);
  const guildTop = Object.fromEntries(DIETS.map((k) => {
    const all = byGuild[k], n = all.reduce((a, x) => a + x.pop, 0);
    return [k, all.sort((a, b) => b.pop - a.pop).slice(0, 3).map((x) => ({ serial: x.serial, share: n ? x.pop / n : 0 }))];
  }));
  const guildTraits = Object.fromEntries(DIETS.filter((k) => gt[k].n > 0).map((k) => [k, Object.fromEntries(GUILD_TRAITS.map((t) => [t, gt[k][t] / gt[k].n]))]));
  return {
    living, species: species.length,
    effSpecies: living ? Math.exp(entropy) : 0, // Hill number of order 1
    hill2: living ? 1 / simpson : 0, // order 2: weighted towards the commonest species
    maxShare: top[0]?.share ?? (living ? Math.max(...species.map((s) => s.pop)) / living : 0),
    diet, movement, bodies, traits, top: top.slice(0, 8), guildTop, guildTraits,
  };
}

/**
 * How tightly living cells sit, by their drawn size (0.085 world units per unit of size): the share deep
 * inside at least five others (closer than half their radii summed), deep overlaps per cell, the share
 * touching two or more (within 1.2 radii summed), and the most living in one grid cell.
 * parts: { u32, f32 } of P_BYTES-sized particles; sizeOf(kind) a species' drawn size (role aside).
 */
export function packing(parts, count, grid, sizeOf, firstLife = 5) {
  const [gw, gh] = grid, { u32: u, f32: f } = parts, W = 10;
  const cells = new Map(), living = [];
  for (let i = 0; i < count; i++) {
    if (u[i * W + 4] < firstLife) continue;
    living.push(i);
    const c = Math.floor(f[i * W + 1]) * gw + Math.floor(f[i * W]);
    (cells.get(c) || cells.set(c, []).get(c)).push(i);
  }
  const drawn = (i) => 0.085 * sizeOf(u[i * W + 4]) * (1 - 0.12 * ((u[i * W + 9] >>> 4) & 3));
  let packed = 0, deep = 0, touching = 0;
  for (const i of living) {
    const x = f[i * W], y = f[i * W + 1], cx = Math.floor(x), cy = Math.floor(y), ri = drawn(i);
    let d = 0, t = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of cells.get(((cy + dy + gh) % gh) * gw + ((cx + dx + gw) % gw)) || []) {
        if (j === i) continue;
        let ex = f[j * W] - x, ey = f[j * W + 1] - y;
        ex -= gw * Math.round(ex / gw); ey -= gh * Math.round(ey / gh);
        const r = Math.hypot(ex, ey), sum = ri + drawn(j);
        if (r < 0.5 * sum) d++;
        if (r < 1.2 * sum) t++;
      }
    }
    if (d >= 5) packed++;
    if (t >= 2) touching++;
    deep += d;
  }
  const n = living.length || 1;
  let maxPile = 0; for (const l of cells.values()) maxPile = Math.max(maxPile, l.length);
  return { packed: packed / n, deep: deep / n, touching: touching / n, maxPile };
}

/**
 * How the living are arranged and how they move, per guild (awake cells; a cyst, cause 14, is skipped):
 * kin, the share of neighbours within one grid unit that are its own species; amongP, the share that are
 * producers; and roam, the median distance a cell moved since `prev` (the last call's positions by id),
 * per minute. Returns { stat, pos } (pos to pass back next time).
 */
export function spatial(parts, count, grid, guildOf, firstLife = 5, prev = null, dtMin = 1) {
  const [gw, gh] = grid, { u32: u, f32: f } = parts, W = 10;
  const cells = new Map(), awake = [], pos = new Map();
  for (let i = 0; i < count; i++) {
    const k = u[i * W + 4];
    if (k < firstLife || (u[i * W + 9] & 15) === 14) continue;
    awake.push(i);
    const c = Math.floor(f[i * W + 1]) * gw + Math.floor(f[i * W]);
    (cells.get(c) || cells.set(c, []).get(c)).push(i);
  }
  const acc = {};
  for (const i of awake) {
    const k = u[i * W + 4], g = guildOf(k), x = f[i * W], y = f[i * W + 1], id = u[i * W + 7];
    const a = (acc[g] ??= { n: 0, nb: 0, kin: 0, plant: 0, moves: [] });
    pos.set(id, [x, y, k]);
    let nb = 0, kin = 0, plant = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of cells.get(((Math.floor(y) + dy + gh) % gh) * gw + ((Math.floor(x) + dx + gw) % gw)) || []) {
        if (j === i) continue;
        let ex = f[j * W] - x, ey = f[j * W + 1] - y;
        ex -= gw * Math.round(ex / gw); ey -= gh * Math.round(ey / gh);
        if (ex * ex + ey * ey > 1) continue;
        const kj = u[j * W + 4];
        nb++; if (kj === k) kin++; if (guildOf(kj) === 'producer') plant++;
      }
    }
    a.n++;
    if (nb) { a.nb++; a.kin += kin / nb; a.plant += plant / nb; }
    const q = prev && prev.get(id);
    if (q && q[2] === k) {
      let ex = x - q[0], ey = y - q[1];
      ex -= gw * Math.round(ex / gw); ey -= gh * Math.round(ey / gh);
      a.moves.push(Math.hypot(ex, ey) / dtMin);
    }
  }
  const stat = {};
  for (const [g, a] of Object.entries(acc)) {
    a.moves.sort((p, q) => p - q);
    stat[g] = { n: a.n, kin: a.nb ? a.kin / a.nb : null, amongP: a.nb ? a.plant / a.nb : null, alone: 1 - a.nb / a.n,
      roam: a.moves.length ? a.moves[a.moves.length >> 1] : null, roamP90: a.moves.length ? a.moves[Math.floor(a.moves.length * 0.9)] : null };
  }
  return { stat, pos };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Fixed-scale vector describing what kind of world a run became, for comparing runs with each other. */
export function fingerprint(samples) {
  if (!samples.length) return null;
  const v = [];
  for (const k of DIETS) v.push(mean(samples.map((s) => s.diet[k])));
  for (const k of MOVES) v.push(mean(samples.map((s) => s.movement[k])));
  v.push(mean(samples.map((s) => s.bodies)));
  for (const k of Object.keys(TRAITS)) v.push(mean(samples.map((s) => s.traits[k])));
  return v;
}

/**
 * Per-run outcome over the late window (the last third of the run, never before 60 s).
 * collapseAt: living fraction below which life counts as collapsed.
 */
export function summarizeRun(samples, { count, collapseAt = 0.02, monoAt = 0.5, guildAt = 0.05 } = {}) {
  const mature = samples.filter((s) => s.t > 60);
  const end = samples.at(-1)?.t ?? 0;
  const late = mature.filter((s) => s.t >= end * 2 / 3);
  if (!late.length) return null;
  const lm = (f) => mean(late.map(f));
  const living = late.map((s) => s.living);
  const livingMean = mean(living);
  const livingSd = Math.sqrt(mean(living.map((x) => (x - livingMean) ** 2)));
  const lateDiet = Object.fromEntries(DIETS.map((k) => [k, lm((s) => s.diet[k])]));
  const guilds = DIETS.filter((k) => lateDiet[k] >= guildAt);
  // Dominant species changes, counting a new leader only once it has led two samples running.
  let leader = null, candidate = null, changes = 0;
  const notable = new Set();
  for (const s of mature) {
    for (const t of s.top) notable.add(t.serial);
    const lead = s.top[0]?.share >= 0.1 ? s.top[0].serial : null;
    if (lead === leader) { candidate = null; continue; }
    if (lead !== null && lead === candidate) {
      if (leader !== null) changes++;
      leader = lead; candidate = null;
    } else candidate = lead;
  }
  const collapsed = mature.some((s) => s.living / count < collapseAt);
  const maxShare = lm((s) => s.maxShare);
  const finalDiet = samples.at(-1).diet;
  const lost = DIETS.filter((k) => mature.some((s) => s.diet[k] >= guildAt) && finalDiet[k] === 0);
  return {
    persisted: !collapsed && samples.at(-1).living > 0,
    lateLivingFrac: livingMean / count,
    lateLivingCV: livingMean ? livingSd / livingMean : null,
    lateEffSpecies: lm((s) => s.effSpecies),
    lateHill2: lm((s) => s.hill2),
    lateMaxShare: maxShare,
    lateSpecies: lm((s) => s.species),
    lateGuilds: guilds.length,
    producersPersist: lateDiet.producer >= guildAt,
    foodWeb: lateDiet.producer >= guildAt && guilds.length >= 3,
    monoculture: maxShare > monoAt,
    guildsLost: lost.length,
    notableSpecies: notable.size,
    leaderChanges: changes,
    lateDiet,
    outcome: collapsed ? 'collapsed' : maxShare > monoAt ? `mono:${late.at(-1).top[0]?.diet ?? '?'}`
      : DIETS.filter((k) => lateDiet[k] >= 0.2).join('+') || 'mixed',
    fingerprint: fingerprint(late),
    ...(late[0].thermal ? { thermal: thermalSummary(mature, late) } : {}),
    ...(late.some((s) => s.packing) ? { packing: Object.fromEntries(['packed', 'deep', 'touching', 'maxPile'].map((k) => [k, mean(late.filter((s) => s.packing).map((s) => s.packing[k]))])) } : {}),
  };
}

// Heat over a run (src/headless.js samples): the late phase's water, what the living felt and how far
// their preferred temperatures sit from the water, torpor, scalding and framboids; and the whole run's
// range of temperatures and its scalding.
function thermalSummary(mature, late) {
  const lm = (f) => { const xs = late.map(f).filter((x) => x != null && Number.isFinite(x)); return xs.length ? mean(xs) : null; };
  const th = (s) => s.thermal;
  const scald = (s) => Object.values(th(s).scalded || {}).reduce((a, b) => a + b, 0);
  const tb = mature.map((s) => th(s).tbg);
  let scaldTotal = 0;
  for (let i = 1; i < mature.length; i++) scaldTotal += scald(mature[i]) * (mature[i].t - mature[i - 1].t) / 60;
  return {
    tbg: lm((s) => th(s).tbg), felt: lm((s) => th(s).felt?.p50), feltSpread: lm((s) => th(s).felt && th(s).felt.p90 - th(s).felt.p10),
    toptMean: lm((s) => th(s).toptMean), toptSD: lm((s) => th(s).toptSD), tolMean: lm((s) => th(s).tolMean),
    lag: lm((s) => th(s).toptMean == null ? null : th(s).toptMean - th(s).tbg),
    torpid: lm((s) => th(s).torpidFrac), makers: lm((s) => th(s).makerFrac), scalded: lm(scald),
    framboids: lm((s) => th(s).framboids), framboidsMade: lm((s) => th(s).framboidsMade),
    hotFrac: lm((s) => th(s).field?.hotFrac), fieldP99: lm((s) => th(s).field?.p99),
    tbgMin: tb.length ? Math.min(...tb) : null, tbgMax: tb.length ? Math.max(...tb) : null, scaldTotal,
    torpidPeak: Math.max(0, ...mature.map((s) => th(s).torpidFrac || 0)),
  };
}

// ------------------------------------------------------------------ ensembles

export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z / d) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i);
  return s.length ? s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo) : null;
}

const dist = (a, b) => Math.sqrt(a.reduce((sum, x, i) => sum + (x - b[i]) ** 2, 0));

/** Mean distance between the fingerprints of every pair of runs: low when every run turns out alike. */
export function spread(prints) {
  let sum = 0, n = 0;
  for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++) { sum += dist(prints[i], prints[j]); n++; }
  return n ? sum / n : null;
}

/** Ensemble-level metrics; every one is oriented so that larger is better unless listed in LOWER_BETTER. */
export const ENSEMBLE_METRICS = {
  persisted: (r) => r.persisted,
  foodWeb: (r) => r.foodWeb,
  producersPersist: (r) => r.producersPersist,
  notMonoculture: (r) => !r.monoculture,
  lateGuilds: (r) => r.lateGuilds,
  lateEffSpecies: (r) => r.lateEffSpecies,
  lateHill2: (r) => r.lateHill2,
  lateLivingFrac: (r) => r.lateLivingFrac,
  notableSpecies: (r) => r.notableSpecies,
  leaderChanges: (r) => r.leaderChanges,
  guildsLost: (r) => r.guildsLost,
  lateLivingCV: (r) => r.lateLivingCV,
};
export const LOWER_BETTER = new Set(['guildsLost', 'lateLivingCV']);
const RNG_SEED = 0x9e3779b9;

function lcg(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

/** Statistic over run summaries that is computed for the whole ensemble rather than per run. */
const GROUP_STATS = {
  // How different the runs are from one another (beta diversity across runs).
  spread: (runs) => spread(runs.map((r) => r.fingerprint)),
  // Effective number of distinct outcomes, and how often the commonest one happens.
  outcomes: (runs) => Math.exp(entropy(runs.map((r) => r.outcome))),
  modalOutcome: (runs) => modal(runs.map((r) => r.outcome))[1] / runs.length,
};
export const GROUP_LOWER_BETTER = new Set(['modalOutcome']);

function entropy(labels) {
  const c = counts(labels);
  let h = 0;
  for (const n of c.values()) { const p = n / labels.length; h -= p * Math.log(p); }
  return h;
}
function counts(labels) {
  const c = new Map();
  for (const l of labels) c.set(l, (c.get(l) || 0) + 1);
  return c;
}
function modal(labels) {
  return [...counts(labels)].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
}

export function summarizeEnsemble(runs) {
  const out = { runs: runs.length, metrics: {}, group: {}, outcomes: Object.fromEntries(counts(runs.map((r) => r.outcome))) };
  for (const [key, f] of Object.entries(ENSEMBLE_METRICS)) {
    const xs = runs.map(f).filter((x) => x != null);
    if (typeof xs[0] === 'boolean') {
      const k = xs.filter(Boolean).length;
      out.metrics[key] = { rate: k / xs.length, ci: wilson(k, xs.length), n: xs.length };
    } else if (xs.length) {
      out.metrics[key] = { mean: mean(xs), median: quantile(xs, 0.5), q10: quantile(xs, 0.1), q90: quantile(xs, 0.9), n: xs.length };
    }
  }
  for (const [key, f] of Object.entries(GROUP_STATS)) out.group[key] = runs.length ? f(runs) : null;
  return out;
}

/** Metrics a regression check gates on by default; the rest are reported only. */
export const GATED = ['persisted', 'foodWeb', 'notMonoculture', 'lateGuilds', 'lateEffSpecies', 'spread', 'modalOutcome'];

/**
 * Compare a candidate ensemble of run summaries with a baseline. For each metric: the difference in
 * means (or rates, or the group statistic), oriented so negative is worse; a bootstrap 95% interval
 * for per-run metrics; and one-sided permutation p-values for "candidate is worse" and "is better".
 * A gated metric regresses when its p for worse, Holm-corrected across the gated metrics, is below alpha
 * and the worsening exceeds its practical margin. The informational verdicts ("worse?", "improved")
 * use Holm's correction across every metric, so they too rarely fire by chance.
 */
export function compareEnsembles(base, cand, { alpha = 0.05, iters = 4000, margins = {}, gate = GATED } = {}) {
  const rng = lcg(RNG_SEED);
  const resample = (xs) => Array.from(xs, () => xs[Math.floor(rng() * xs.length)]);
  const pooled = [...base, ...cand];
  const permute = () => {
    const xs = [...pooled];
    for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
    return [xs.slice(0, base.length), xs.slice(base.length)];
  };
  const rows = [];
  const stat = (key, f, perRun) => {
    const sign = LOWER_BETTER.has(key) || GROUP_LOWER_BETTER.has(key) ? -1 : 1;
    const diff = (b, c) => sign * (f(c) - f(b));
    const d0 = diff(base, cand);
    if (!Number.isFinite(d0)) return;
    let worse = 0, better = 0, total = 0;
    for (let i = 0; i < iters; i++) {
      const d = diff(...permute());
      if (Number.isFinite(d)) { total++; if (d <= d0) worse++; if (d >= d0) better++; }
    }
    let ci = null;
    if (perRun) {
      const ds = [];
      for (let i = 0; i < iters; i++) ds.push(diff(resample(base), resample(cand)));
      ci = [quantile(ds, 0.025), quantile(ds, 0.975)];
    }
    rows.push({ key, base: f(base), cand: f(cand), diff: d0, ci, pWorse: (worse + 1) / (total + 1),
      pBetter: (better + 1) / (total + 1), margin: margins[key] ?? 0, gated: gate.includes(key) });
  };
  for (const [key, f] of Object.entries(ENSEMBLE_METRICS)) {
    const m = (runs) => mean(runs.map(f).filter((x) => x != null).map(Number));
    if (base.some((r) => f(r) != null)) stat(key, m, true);
  }
  for (const [key, f] of Object.entries(GROUP_STATS)) stat(key, f, false);
  holm(rows.filter((r) => r.gated), 'pWorse', 'pHolm');
  holm(rows, 'pWorse', 'pHolmAll');
  holm(rows, 'pBetter', 'pHolmBetter');
  for (const r of rows) {
    const worse = r.diff < -r.margin;
    r.verdict = r.gated && r.pHolm < alpha && worse ? 'regressed'
      : worse && r.pHolmAll < alpha ? 'worse?'
      : r.diff > r.margin && r.pHolmBetter < alpha ? 'improved' : 'same';
  }
  return rows;
}

/** Holm step-down adjustment of rows[key], written to rows[out]. */
function holm(rows, key, out) {
  const sorted = [...rows].sort((a, b) => a[key] - b[key]);
  let running = 0;
  sorted.forEach((r, rank) => { running = Math.max(running, Math.min(1, r[key] * (sorted.length - rank))); r[out] = running; });
}

/** Check an ensemble against target bounds: { metric: { min | max } } on rates, means or group stats. */
export function checkTargets(summary, targets) {
  return Object.entries(targets).map(([key, bound]) => {
    const m = summary.metrics[key];
    const value = m ? (m.rate ?? m.mean) : summary.group[key];
    const ok = value != null && (bound.min == null || value >= bound.min) && (bound.max == null || value <= bound.max);
    return { key, value, ...bound, ok };
  });
}
