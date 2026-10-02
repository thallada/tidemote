// Ecology statistics for headless runs and ensembles: pure functions, no GPU.
import { dietGuild, mobilityGuild } from './genome.js';

export const DIETS = ['producer', 'grazer', 'predator', 'scavenger', 'omnivore'];
export const MOVES = ['sessile', 'crawler', 'swimmer', 'drifter'];
// Traits averaged over living cells, each scaled to [0, 1] by the range mutation allows.
export const TRAITS = {
  photo: [0, 1], dGlint: [0, 1], dHusk: [0, 1], dFlesh: [0, 1], swim: [0, 3], advect: [0, 1],
  adhesion: [0, 1], size: [0.45, 2.6], lifespan: [20, 500], reproE: [0.6, 4],
};
const SHARE_NOTABLE = 0.05;

/** One census of the community. species: [{ pop, genome }] for every living slot. */
export function communitySample(species, adhMin) {
  let living = 0, entropy = 0, simpson = 0, bodies = 0;
  const diet = Object.fromEntries(DIETS.map((k) => [k, 0]));
  const movement = Object.fromEntries(MOVES.map((k) => [k, 0]));
  const traits = Object.fromEntries(Object.keys(TRAITS).map((k) => [k, 0]));
  for (const { pop } of species) living += pop;
  const top = [];
  for (const { pop, genome: g } of species) {
    const p = pop / living;
    entropy -= p * Math.log(p);
    simpson += p * p;
    const d = dietGuild(g), m = mobilityGuild(g);
    diet[d] += p; movement[m] += p;
    if ((g.adhesion || 0) > adhMin) bodies += p;
    for (const [k, [lo, hi]] of Object.entries(TRAITS)) traits[k] += p * (g[k] - lo) / (hi - lo);
    if (p >= SHARE_NOTABLE) top.push({ serial: g.serial, share: p, diet: d, move: m, depth: g.depth });
  }
  top.sort((a, b) => b.share - a.share);
  return {
    living, species: species.length,
    effSpecies: living ? Math.exp(entropy) : 0, // Hill number of order 1
    hill2: living ? 1 / simpson : 0, // order 2: weighted towards the commonest species
    maxShare: top[0]?.share ?? (living ? Math.max(...species.map((s) => s.pop)) / living : 0),
    diet, movement, bodies, traits, top: top.slice(0, 8),
  };
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
  const lost = DIETS.filter((k) => k !== 'omnivore' && mature.some((s) => s.diet[k] >= guildAt) && finalDiet[k] === 0);
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
