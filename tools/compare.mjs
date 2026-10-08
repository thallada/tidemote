// Compare ecology configurations across the same seeds with bounded concurrency.
import fs from 'node:fs';
import path from 'node:path';
import { availableParallelism } from 'node:os';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  seeds: { type: 'string', default: '4' }, minutes: { type: 'string', default: '10' },
  n: { type: 'string', default: '8192' }, jobs: { type: 'string', default: '2' },
  cpu: { type: 'boolean' }, chrome: { type: 'boolean' }, out: { type: 'string', default: 'runs' },
} });
const seeds = +v.seeds, jobs = +v.jobs;
if (![seeds, jobs].every((n) => Number.isInteger(n) && n > 0)) throw new Error('--seeds and --jobs must be positive integers');
if (!positionals.length || positionals.length % 2) throw new Error('Supply pairs: name \'{"k":{},"eras":true}\'');
const configs = [];
for (let i = 0; i < positionals.length; i += 2) {
  const name = positionals[i], config = JSON.parse(positionals[i + 1]);
  if (!/^[\w-]+$/.test(name) || configs.some((c) => c.name === name)) throw new Error('Config names must be unique and contain only letters, numbers, underscores or hyphens');
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Config must be an object');
  for (const key of Object.keys(config)) if (!['k', 'eras', 'step'].includes(key)) throw new Error(`Unknown config key: ${key}`);
  if ('eras' in config && typeof config.eras !== 'boolean') throw new Error('eras must be boolean');
  configs.push({ name, config, runs: [], failed: [] });
}
fs.mkdirSync(v.out, { recursive: true });
const tasks = configs.flatMap((c) => Array.from({ length: seeds }, (_, i) => ({ c, seed: i + 1 })));
const sim = fileURLToPath(new URL('./sim.mjs', import.meta.url));
const threads = String(Math.max(1, Math.floor(availableParallelism() / jobs)));
let next = 0;
async function worker() {
  while (next < tasks.length) {
    const { c, seed } = tasks[next++];
    const out = path.join(v.out, `${c.name}-seed${seed}.json`);
    const args = [sim, '--n', v.n, '--minutes', v.minutes, '--seed', String(seed), '--out', out, '--k', JSON.stringify(c.config.k ?? {})];
    if (v.chrome) args.push('--chrome');
    else if (v.cpu) args.push('--cpu');
    if (c.config.eras === false) args.push('--no-eras');
    if (c.config.step) args.push('--step', String(c.config.step));
    // The software Vulkan driver occasionally aborts a process; retry once, then record the failure and carry on.
    let failure = await runSim(args);
    if (failure) failure = await runSim(args);
    if (failure) { console.error(`${c.name} seed ${seed} failed:\n${failure}`); c.failed.push(seed); continue; }
    c.runs.push({ seed, summary: JSON.parse(fs.readFileSync(out, 'utf8')).summary });
  }
}
/** Resolves to null on success, or the tail of the child's output on failure. */
function runSim(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env: v.chrome ? process.env : { ...process.env, LP_NUM_THREADS: threads } });
    let tail = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (b) => { tail = (tail + b).slice(-2000); });
    child.on('error', (e) => resolve(String(e)));
    child.on('close', (code) => resolve(code === 0 ? null : `exit ${code}\n${tail}`));
  });
}
await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, worker));
const done = configs.find((c) => c.runs.length);
if (!done) throw new Error('every run failed');
const metrics = Object.keys(done.runs[0].summary);
const fmt = (n) => n == null ? 'n/a' : Number.isInteger(n) ? String(n) : n.toFixed(3);
const aggregate = (runs, key) => {
  const xs = runs.map((r) => r.summary[key]).filter((n) => n != null);
  if (!xs.length) return 'n/a';
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
  return `${fmt(mean)} ± ${fmt(sd)}`;
};
console.log(`metric\t${configs.map((c) => c.name).join('\t')}`);
for (const key of metrics) console.log(`${key}\t${configs.map((c) => aggregate(c.runs, key)).join('\t')}`);
for (const c of configs) if (c.failed.length) console.log(`${c.name}: failed seeds ${c.failed.join(', ')}`);
for (const c of configs) for (const r of c.runs.sort((a, b) => a.seed - b.seed)) {
  console.log(`${c.name} seed${r.seed}: ${metrics.map((key) => `${key}=${fmt(r.summary[key])}`).join(' ')}`);
}
