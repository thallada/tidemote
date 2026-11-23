// What a packaged build's WebGPU is offered under each of several sets of switches, for finding one that gives
// a CI runner without a GPU an adapter (Windows' runner: docs/release.md). For each set: Chromium's feature
// status (webgpu, compositing...), its GPU devices, the adapter the page gets (default, and asked for the
// fallback), and any child process that died. A ::notice line per set; the whole report in --out.
//   node desktop/scripts/gpu-probe.mjs --exe out/Tidemote-win32-x64/Tidemote.exe [--out DIR]
import { _electron } from 'playwright-core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const exe = arg('exe');
const out = arg('out', 'runs/desktop/gpu-probe');
if (!exe) throw new Error('--exe PATH to a packaged Tidemote executable');
await mkdir(out, { recursive: true });
const gha = !!process.env.GITHUB_ACTIONS;
const esc = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const base = ['--windowed', '--enable-unsafe-swiftshader'];
const BL = '--ignore-gpu-blocklist';
const sets = JSON.parse(process.env.PROBE_SETS || 'null') ?? [
  [],
  [BL],
  [BL, '--use-webgpu-adapter=swiftshader'],
  [BL, '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'],
  [BL, '--disable-gpu-sandbox'],
  [BL, '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-dawn-features=allow_unsafe_apis'],
  [BL, '--use-webgpu-adapter=d3d11'],
];

async function probe(extra) {
  const r = { args: [...base, ...extra], gone: [] };
  const data = await mkdtemp(join(tmpdir(), 'tidemote-probe-'));
  let app;
  try {
    app = await _electron.launch({ executablePath: exe, args: [...r.args, `--user-data-dir=${data}`], timeout: 60000 });
    await app.evaluate(({ app: a }) => { a.on('child-process-gone', (e, d) => console.log(`tidemote-gone ${JSON.stringify(d)}`)); });
    app.process().stdout.on('data', (d) => { for (const m of String(d).matchAll(/tidemote-gone (\{.*\})/g)) r.gone.push(JSON.parse(m[1])); });
    const page = await app.firstWindow();
    await page.waitForLoadState();
    await page.waitForTimeout(8000);
    Object.assign(r, await app.evaluate(async ({ app: a }) => {
      const info = await a.getGPUInfo('complete').catch((e) => ({ error: String(e) }));
      return { status: a.getGPUFeatureStatus(), info };
    }));
    r.page = await page.evaluate(async () => {
      const desc = (ad) => ad && { ...Object.fromEntries(['vendor', 'architecture', 'device', 'description', 'type', 'backend', 'isFallbackAdapter'].map((k) => [k, ad.info?.[k]])), features: [...ad.features].length };
      const one = async (opts) => { try { return desc(await navigator.gpu?.requestAdapter(opts)) ?? 'none'; } catch (e) { return `error: ${e.message}`; } };
      return {
        gpu: !!navigator.gpu,
        adapter: await one({ powerPreference: 'high-performance' }),
        fallback: await one({ forceFallbackAdapter: true }),
        nogpu: document.getElementById('nogpu')?.hidden === false ? document.getElementById('nogpu-title')?.textContent : null,
        stepped: (globalThis.__tidemote?.eng?.simTime ?? 0) > 0,
      };
    });
  } catch (e) {
    r.exception = String(e?.message || e).split('\n')[0];
  } finally {
    await app?.close().catch(() => {});
    await rm(data, { recursive: true, force: true }).catch(() => {});
  }
  const dev = r.info?.gpuDevice?.map((d) => `${d.vendorString || d.vendorId}/${d.deviceString || d.deviceId}${d.active ? '*' : ''} ${d.driverVersion ?? ''}`).join(', ');
  const st = r.status && ['webgpu', 'gpu_compositing', 'webgl2', 'rasterization'].map((k) => `${k}=${r.status[k]}`).join(' ');
  const ad = (a) => (typeof a === 'object' ? [a.vendor, a.architecture, a.description, a.type, a.backend].filter(Boolean).join(' / ') || 'unnamed' : a);
  const line = `${extra.join(' ') || '(base)'} → ${r.exception ?? `${st}; devices ${dev ?? r.info?.error}; adapter ${ad(r.page?.adapter)}; fallback ${ad(r.page?.fallback)}; world ${r.page?.stepped ? 'stepped' : r.page?.nogpu ?? 'not stepped'}${r.gone.length ? `; gone ${JSON.stringify(r.gone)}` : ''}`}`;
  console.log(gha ? `::notice title=gpu probe (${process.platform})::${esc(line)}` : line);
  return r;
}

const report = [];
for (const s of sets) report.push(await probe(s));
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
// the first set's GPU info in brief (what Chromium found and why it may refuse), for the log
const aux = report[0]?.info?.auxAttributes;
if (aux) {
  const info = report[0].info;
  const brief = JSON.stringify({ keys: Object.keys(info), status: report[0].status, dawn: JSON.stringify(info.dawnInfoList ?? info.dawnInfo ?? null)?.slice(0, 1500), aux: Object.fromEntries(Object.entries(aux).filter(([k]) => /angle|gl|vulkan|dx|d3d|warp|sandbox|software|direct|dawn|skia/i.test(k))), workarounds: info.driverBugWorkarounds?.slice?.(0, 20), problems: info.problems ?? info.featureStatus?.problems });
  console.log(gha ? `::notice title=gpu info (${process.platform})::${esc(brief.slice(0, 6000))}` : brief);
}
