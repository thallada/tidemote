// Matched-start forks (src/headless.js runForks): one world grown in 1/60 s steps, then the same moment run
// forward under several step lengths and tunables, pair by pair. See docs/fast-forward.md.
//   tools/gpu-node.sh tools/fork.mjs --n 32768 --warm 600 --horizon 30 --reps 16 --k '{"diag":1}' --variants '[{"name":"m1","step":1},{"name":"m4","step":4}]'
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { runForks } from '../src/headless.js';

const { values: v } = parseArgs({ options: {
  n: { type: 'string', default: '32768' }, warm: { type: 'string', default: '600' }, horizon: { type: 'string', default: '30' },
  reps: { type: 'string', default: '16' }, seed: { type: 'string', default: '1' }, k: { type: 'string', default: '{}' },
  variants: { type: 'string', default: '[{"name":"m1","step":1},{"name":"m4","step":4}]' }, eras: { type: 'boolean' },
  out: { type: 'string' },
} });
const config = { n: +v.n, warm: +v.warm, horizon: +v.horizon, reps: +v.reps, seed: +v.seed, k: JSON.parse(v.k), variants: JSON.parse(v.variants), eras: !!v.eras };
const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } });
const res = await runForks(device, config, { print: (s) => console.error(s) });
if (v.out) fs.writeFileSync(v.out, JSON.stringify(res, null, 2) + '\n');
// paired relative differences of each variant from the first, per rate
const base = config.variants[0].name;
const keys = Object.keys(res.forks[0].rates).filter((k) => res.forks.filter((f) => f.variant === base).reduce((a, f) => a + f.rates[k], 0) > 0);
console.log(`start: ${JSON.stringify(Object.fromEntries(Object.entries(res.start).map(([k, x]) => [k, Math.round(x)])))}`);
console.log('rate'.padEnd(24) + base.padStart(10) + config.variants.slice(1).map((x) => x.name.padStart(16)).join(''));
for (const k of keys) {
  const b = res.forks.filter((f) => f.variant === base);
  const bm = b.reduce((a, f) => a + f.rates[k], 0) / b.length;
  console.log(k.padEnd(24) + bm.toFixed(0).padStart(10) + config.variants.slice(1).map((x) => {
    const ds = b.map((f) => { const o = res.forks.find((g) => g.rep === f.rep && g.variant === x.name); return (o.rates[k] - f.rates[k]) / bm; });
    const mu = ds.reduce((a, c) => a + c, 0) / ds.length, sd = Math.sqrt(ds.reduce((a, c) => a + (c - mu) ** 2, 0) / Math.max(1, ds.length - 1)), h = 2.1 * sd / Math.sqrt(ds.length);
    return `${mu >= 0 ? '+' : ''}${(mu * 100).toFixed(1)}±${(h * 100).toFixed(1)}${Math.abs(mu) > h ? '*' : ' '}`.padStart(16);
  }).join(''));
}
process.exit(0);
