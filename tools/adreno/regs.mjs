// What a compute kernel of the page's WGSL holds on an Adreno 630, by Mesa's compiler for it (turnip, on a pretended
// a630): run through tools/adreno/regs.sh, which sets Mesa up and sums what it prints. docs/performance.md, Tools.
//   tools/adreno/regs.sh sim senseMain lifeMain senseMain:COARSE=1     (MODULE ENTRY[:OVERRIDE=VALUE]...)
// MODULE: sim (simWGSL of DEFAULT_K) or an exported WGSL string of src/shaders.js (INBOND_WGSL, DRAW_WGSL, ...).
// SHADERS=path/to/another/shaders.js compiles that source tree's (an older commit's worktree); PATCH='[[from, to], ...]'
// replaces text in the WGSL first ([from, to, with]: from `from` through `to`), for trying a change without an edit.
import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);
const [mod, ...eps] = process.argv.slice(2);
const S = await import(process.env.SHADERS || '../../src/shaders.js');
const gpu = create([]);
const adapter = await gpu.requestAdapter();
if (!adapter || !/turnip/.test(adapter.info.device + adapter.info.description)) { console.error(`regs: Dawn did not find turnip (found ${adapter ? adapter.info.description : 'no adapter'}): see tools/adreno/README.md`); process.exit(2); }
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: Math.min(16, adapter.limits.maxStorageBuffersPerShaderStage) } });
device.addEventListener('uncapturederror', (e) => console.error('ERR', e.error.message.slice(0, 400)));
let code = mod === 'sim' ? S.simWGSL(S.DEFAULT_K, { dp4a: true, ...JSON.parse(process.env.SIMOPTS || '{}') }) : S[mod];
if (typeof code !== 'string') { console.error(`regs: no module ${mod}`); process.exit(2); }
for (const [a, b, c] of JSON.parse(process.env.PATCH || '[]')) {
  if (c !== undefined) { const i0 = code.indexOf(a), i1 = code.indexOf(b, i0); if (i0 < 0 || i1 < 0) console.error(`ERR patch: no ${a.slice(0, 60)}`); else code = code.slice(0, i0) + c + code.slice(i1 + b.length); continue; }
  if (!code.includes(a)) console.error(`ERR patch: no ${a.slice(0, 60)}`);
  code = code.split(a).join(b);
}
const module = device.createShaderModule({ code });
for (const spec of eps) {
  const [entryPoint, ...cs] = spec.split(':');
  const constants = Object.fromEntries(cs.map((c) => c.split('=')).map(([k, v]) => [k, +v]));
  console.error(`=== ${mod} ${spec}`);
  try { await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint, constants } }); } catch (e) { console.error('ERR', String(e.message).slice(0, 600)); }
}
process.exit(0);
