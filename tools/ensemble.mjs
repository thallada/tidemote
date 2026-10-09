// Run one configuration across many seeds, summarize the ensemble, and optionally check it against a
// baseline ensemble (statistical regression test) and against target bounds.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { summarizeEnsemble, compareEnsembles, checkTargets } from '../src/ecostats.js';

const { values: v } = parseArgs({ options: {
  runs: { type: 'string', default: '24' }, 'first-seed': { type: 'string', default: '1' },
  minutes: { type: 'string', default: '30' }, n: { type: 'string', default: '32768' },
  jobs: { type: 'string', default: '4' }, k: { type: 'string', default: '{}' }, 'no-eras': { type: 'boolean' },
  step: { type: 'string', default: '1' }, temp: { type: 'string' }, sample: { type: 'string', default: '5' }, resume: { type: 'boolean' },
  out: { type: 'string' }, from: { type: 'string' }, name: { type: 'string' },
  baseline: { type: 'string' }, targets: { type: 'string' }, 'save-baseline': { type: 'string' },
  alpha: { type: 'string', default: '0.05' }, help: { type: 'boolean' },
} });
if (v.help || (!v.out && !v.from)) {
  console.log(`Usage: tools/gpu-node.sh tools/ensemble.mjs --out runs/NAME [options]
  --runs 24 --first-seed 1 --minutes 30 --n 32768 --jobs 4 --k '{}' --no-eras
  --step 1                Each step covers step/60 s (coarse steps; the page takes up to 4)
  --temp T                Hold the water at T degrees
  --sample 5              Seconds between samples
  --resume                Skip seeds already in --out (or claimed by another ensemble running into it)
  --from DIR              Analyse the run JSONs already in DIR instead of running
  --baseline FILE         Compare with a saved report; exit 1 if a gated metric regressed
  --targets FILE          Check target bounds (balance/targets.json); exit 1 if any fails
  --save-baseline FILE    Write this ensemble's report as a baseline
  --alpha 0.05            Significance level for regressions (Holm-corrected over gated metrics)
Run JSONs and report.json are written to --out.`);
  process.exit(0);
}
const fmt = (x) => x == null ? 'n/a' : typeof x === 'number' ? (Math.abs(x) >= 100 || Number.isInteger(x) ? String(Math.round(x)) : x.toFixed(3)) : String(x);
const dir = v.from ?? v.out;
fs.mkdirSync(dir, { recursive: true });
const config = { n: +v.n, minutes: +v.minutes, k: JSON.parse(v.k), eras: !v['no-eras'], step: +v.step, temp: v.temp };
const runs = +v.runs, first = +v['first-seed'], jobs = +v.jobs;
if (![runs, first, jobs, config.n].every(Number.isInteger) || runs < 1 || jobs < 1) throw new Error('--runs, --first-seed, --jobs and --n must be integers');

if (!v.from) await runAll();
const results = fs.readdirSync(dir).filter((f) => /^seed\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
if (!results.length) throw new Error(`no seedN.json runs in ${dir}`);
const outcomes = results.map((r) => ({ seed: r.config.seed, ...r.outcome }));
const ran = results[0].config;
const report = {
  name: v.name ?? path.basename(path.resolve(dir)),
  config: { n: ran.n, minutes: ran.minutes, k: ran.k, eras: ran.eras, step: ran.step ?? 1, temp: ran.temp, adapter: ran.adapter },
  created: new Date().toISOString(),
  wallSecondsPerRun: results.reduce((a, r) => a + r.summary.wallSeconds, 0) / results.length,
  summary: summarizeEnsemble(outcomes),
  runs: outcomes,
};
fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (v['save-baseline']) {
  fs.mkdirSync(path.dirname(v['save-baseline']), { recursive: true });
  fs.writeFileSync(v['save-baseline'], JSON.stringify(report, null, 2) + '\n');
}
printSummary(report);
let failed = false;
if (v.baseline) failed = compare(JSON.parse(fs.readFileSync(v.baseline, 'utf8')), report) || failed;
if (v.targets) failed = targets(JSON.parse(fs.readFileSync(v.targets, 'utf8')), report) || failed;
process.exit(failed ? 1 : 0);

async function runAll() {
  const sim = fileURLToPath(new URL('./sim.mjs', import.meta.url));
  const seeds = Array.from({ length: runs }, (_, i) => first + i);
  let next = 0, done = 0;
  const t0 = Date.now();
  const worker = async () => {
    while (next < seeds.length) {
      const seed = seeds[next++];
      const out = path.join(dir, `seed${seed}.json`);
      // --resume: skip finished seeds, and seeds another ensemble into this directory has claimed
      const claim = `${out}.claim`;
      if (v.resume) {
        if (fs.existsSync(out)) { done++; continue; }
        try { fs.writeFileSync(claim, String(process.pid), { flag: 'wx' }); } catch { done++; continue; }
      }
      const args = [sim, '--n', String(config.n), '--minutes', String(config.minutes), '--seed', String(seed),
        '--k', JSON.stringify(config.k), '--print', '1e9', '--sample', v.sample, '--out', out];
      if (!config.eras) args.push('--no-eras');
      if (config.step !== 1) args.push('--step', String(config.step));
      if (config.temp != null) args.push('--temp', config.temp);
      let failure = await child(args);
      if (failure) failure = await child(args);
      if (v.resume) fs.rmSync(claim, { force: true });
      done++;
      const eta = (Date.now() - t0) / done * (seeds.length - done) / 1000;
      if (failure) { console.error(`seed ${seed} failed:\n${failure}`); continue; }
      const o = JSON.parse(fs.readFileSync(out, 'utf8')).outcome;
      console.log(`[${done}/${seeds.length}] seed ${seed}: ${o?.outcome ?? 'too short'}` +
        (o ? ` eff=${o.lateEffSpecies.toFixed(1)} guilds=${o.lateGuilds} max=${o.lateMaxShare.toFixed(2)}` : '') +
        ` · eta ${Math.round(eta)}s`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, seeds.length) }, worker));
}

function child(args) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, args);
    let tail = '';
    for (const s of [c.stdout, c.stderr]) s.on('data', (b) => { tail = (tail + b).slice(-2000); });
    c.on('error', (e) => resolve(String(e)));
    c.on('close', (code) => resolve(code === 0 ? null : `exit ${code}\n${tail}`));
  });
}

function printSummary(r) {
  const s = r.summary;
  console.log(`\n${r.name}: ${s.runs} runs × ${r.config.minutes} min at n=${r.config.n} (${fmt(r.wallSecondsPerRun)} s wall per run)`);
  for (const [key, m] of Object.entries(s.metrics)) {
    console.log(m.rate != null
      ? `  ${key.padEnd(18)} ${(m.rate * 100).toFixed(0).padStart(3)}%  [${(m.ci[0] * 100).toFixed(0)}–${(m.ci[1] * 100).toFixed(0)}%]`
      : `  ${key.padEnd(18)} mean ${fmt(m.mean)}  median ${fmt(m.median)}  10–90% ${fmt(m.q10)}–${fmt(m.q90)}`);
  }
  for (const [key, x] of Object.entries(s.group)) console.log(`  ${key.padEnd(18)} ${fmt(x)}`);
  console.log('  outcomes: ' + Object.entries(s.outcomes).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(', '));
}

function compare(base, cand) {
  const same = ['n', 'minutes', 'eras'].filter((k) => base.config[k] !== cand.config[k]);
  if (same.length) console.log(`\nWARNING: baseline differs in ${same.join(', ')}; the comparison is not like for like.`);
  const rows = compareEnsembles(base.runs, cand.runs, { alpha: +v.alpha });
  console.log(`\nAgainst baseline "${base.name}" (${base.runs.length} runs); diff is oriented so negative is worse:`);
  for (const r of rows) {
    console.log(`  ${(r.gated ? '*' : ' ')}${r.key.padEnd(17)} ${fmt(r.base).padStart(7)} → ${fmt(r.cand).padEnd(7)} diff ${fmt(r.diff).padStart(7)}` +
      (r.ci ? ` [${fmt(r.ci[0])}, ${fmt(r.ci[1])}]` : '') + `  p=${r.pWorse.toFixed(3)}${r.pHolm != null ? ` holm=${r.pHolm.toFixed(3)}` : ''}  ${r.verdict}`);
  }
  console.log('  (* gated)');
  const bad = rows.filter((r) => r.verdict === 'regressed');
  if (bad.length) console.log(`REGRESSION: ${bad.map((r) => r.key).join(', ')}`);
  return bad.length > 0;
}

function targets(t, r) {
  const rows = checkTargets(r.summary, t.targets ?? t);
  console.log('\nTargets:');
  for (const x of rows) console.log(`  ${x.ok ? 'ok  ' : 'FAIL'} ${x.key.padEnd(18)} ${fmt(x.value)} (${x.min != null ? `≥ ${x.min}` : ''}${x.max != null ? `≤ ${x.max}` : ''})`);
  return rows.some((x) => !x.ok);
}
