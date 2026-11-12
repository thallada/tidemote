// The release workflow's check of a packaged build on the OS it was built for (docs/release.md): the app
// starts, serves the page from its own origin, the page reaches the shell, and steamworks.js's native
// addon loads (Steam itself is not running on a build machine, so Steam stays off), and with --need-gpu
// that WebGPU starts and the world steps. CI machines without a GPU get Chromium's software adapter
// (SwiftShader, allowed by --enable-unsafe-swiftshader) and a small world (4096 particles, as a count
// chosen in Settings) so it compiles every pipeline and steps in seconds. smoke.mjs is the fuller check
// on a real GPU and with Steam.
//   node desktop/scripts/launch-check.mjs --exe out/Tidemote-linux-x64/Tidemote [--out DIR] [--need-gpu]
//     [--summary FILE]  appends a Markdown line for the run's summary ($GITHUB_STEP_SUMMARY)
// On Linux it runs with Ozone's headless platform (no display needed) and without Chromium's sandbox
// (an unpacked build's chrome-sandbox is not setuid root).
import { _electron } from 'playwright-core';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const exe = arg('exe');
const out = arg('out', 'runs/desktop/launch');
const needGpu = process.argv.includes('--need-gpu');
const summary = arg('summary');
if (!exe) throw new Error('--exe PATH to a packaged Tidemote executable');

await mkdir(out, { recursive: true });
const base = ['--enable-unsafe-swiftshader', ...(process.platform === 'linux' ? ['--ozone-platform=headless', '--no-sandbox'] : [])];
// further ways to a software adapter, tried in turn while no world steps (Windows' runner has no GPU)
const fallbacks = process.platform === 'win32'
  ? [['--use-webgpu-adapter=swiftshader'], ['--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'], ['--use-angle=warp']]
  : [];
const gha = !!process.env.GITHUB_ACTIONS;
const esc = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

async function attempt(extra) {
  const r = { args: [...base, ...extra] };
  let app;
  try {
    app = await _electron.launch({ executablePath: exe, args: r.args, timeout: 60000 });
    const page = await app.firstWindow();
    await page.waitForLoadState();
    await page.evaluate(() => localStorage.setItem('tidemote.view', JSON.stringify({ particles: 4096, v: 4 })));
    await page.reload();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // the world running, or the page's error screen (no adapter on a machine without a GPU)
    await page.waitForFunction(() => globalThis.__tidemote?.eng || !document.getElementById('nogpu')?.hidden, null, { timeout: 90000 });
    // the first steps (the world then waits on the opening menu)
    await page.waitForFunction(() => globalThis.__tidemote?.eng?.simTime > 0 || !document.getElementById('nogpu')?.hidden, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    Object.assign(r, await page.evaluate(async () => {
      const t = globalThis.__tidemote;
      const a = t?.eng?.device?.adapterInfo || {};
      const shown = document.getElementById('nogpu')?.hidden === false;
      return {
        origin: location.origin, ua: navigator.userAgent,
        bridge: typeof globalThis.tidemoteDesktop?.worlds?.list === 'function',
        steam: await globalThis.tidemoteDesktop?.steam?.(),
        running: !!t?.eng, stepped: (t?.eng?.simTime ?? 0) > 0,
        gpu: [a.vendor, a.architecture, a.description].filter(Boolean).join(' / '),
        particles: t?.eng?.count ?? 0,
        failed: shown ? document.getElementById('nogpu-title')?.textContent : null,
        detail: shown ? document.getElementById('nogpu-detail')?.textContent : null,
      };
    }));
    r.version = await app.evaluate(({ app: a }) => a.getVersion());
    r.errors = errors;
    // best effort: a software adapter can leave the window without a frame to capture
    await page.screenshot({ path: join(out, 'window.png'), timeout: 10000 }).catch(() => {});
  } catch (e) {
    r.exception = String(e?.message || e).split('\n')[0];
  } finally {
    await app?.close().catch(() => {});
  }
  const line = `${r.args.join(' ')} → ${r.exception ?? (r.stepped ? `stepped on ${r.gpu || 'an adapter'}` : `${r.failed ?? 'never stepped'}: ${r.detail ?? ''}`)}`;
  console.log(gha ? `::notice title=launch check (${process.platform})::${esc(line)}` : line);
  return r;
}

let report = await attempt([]);
for (const extra of fallbacks) {
  if (!needGpu || report.stepped || report.exception) break;
  const next = await attempt(extra);
  if (next.stepped) report = next;
}
const problems = [];
if (report.exception) problems.push(`the app did not start: ${report.exception}`);
if (report.origin !== 'app://tidemote') problems.push(`page origin ${report.origin}`);
if (!report.bridge) problems.push('the page has no tidemoteDesktop bridge');
if (!report.steam?.loaded && !report.steam?.on) problems.push(`steamworks.js did not load: ${report.steam?.why}`);
if (needGpu && !report.stepped) problems.push(`no world stepped: ${report.failed ?? 'started but never stepped'}`);
if (report.running && report.errors?.length) problems.push(`page errors: ${report.errors.join(' | ')}`);
report.problems = problems;
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
if (summary) {
  const gpu = report.stepped ? `WebGPU on ${report.gpu || 'an unnamed adapter'}, ${report.particles} particles stepped` : `no world (${report.failed ?? 'never stepped'})`;
  await appendFile(summary, `- ${process.platform}: ${problems.length ? `❌ ${problems.join('; ')}` : '✅'} v${report.version}; ${gpu}; steamworks.js ${report.steam?.loaded ? 'loaded' : 'missing'}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (problems.length && gha) for (const p of problems) console.log(`::error title=launch check (${process.platform})::${esc(p)}`);
if (problems.length) { console.error(`launch check failed:\n  ${problems.join('\n  ')}`); process.exit(1); }
