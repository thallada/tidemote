// The release workflow's check of a packaged build on the OS it was built for (docs/release.md): the app
// starts, serves the page from its own origin, the page reaches the shell, and the Steam helper process starts and
// loads steamworks.js's native addon (Steam itself is not running on a build machine, so Steam stays off; steam.js,
// steam-helper/), and with --need-gpu
// that WebGPU starts and the world steps. CI machines without a GPU get Chromium's software adapter
// (SwiftShader, allowed by --enable-unsafe-swiftshader; Windows' runner is offered none at all, by any
// switch tried: SwiftShader, its Vulkan, ANGLE's WARP) and a small world (4096 particles, as a count
// chosen and kept, at PREFS_V in src/main.js) so it compiles every pipeline and steps in seconds. smoke.mjs is the fuller check
// on a real GPU and with Steam. Then (once a world steps) the menu's Quit: a world begun, Quit → Save and quit, and the
// app must exit by itself, its world kept as the last session (userData/worlds/w-last.*), in a userData of its own.
//   node desktop/scripts/launch-check.mjs --exe out/Tidemote-linux-x64/Tidemote [--out DIR] [--need-gpu]
//     [--summary FILE]  appends a Markdown line for the run's summary ($GITHUB_STEP_SUMMARY)
// On Linux it runs on the X server in DISPLAY (the workflow's xvfb-run) and without Chromium's sandbox (an unpacked
// build's chrome-sandbox is not setuid root). Ozone's headless platform, used when there is no DISPLAY, has no shared
// images for a WebGPU canvas: its first frame drops the page's GPU instance. A world that steps must also still
// answer a GPU readback (gpuAlive), since a lost device leaves its clock running.
import { _electron } from 'playwright-core';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
// (Windows' runner: Chromium blocklists its Microsoft Basic Render Driver, leaving WebGPU unavailable; past the
// blocklist WebGPU would take D3D12's WARP, which hangs the GPU process on the world's shaders, so SwiftShader, as
// Linux's runner has)
const base = ['--windowed', '--enable-unsafe-swiftshader',
  ...(process.platform === 'linux' ? [`--ozone-platform=${process.env.DISPLAY ? 'x11' : 'headless'}`, '--no-sandbox'] : []),
  ...(process.platform === 'win32' ? ['--ignore-gpu-blocklist', '--use-webgpu-adapter=swiftshader'] : [])];
const gha = !!process.env.GITHUB_ACTIONS;
// Chromium's child processes that die while the app runs (the GPU's above all), into list
async function watchGone(app, list) {
  await app.evaluate(({ app: a }) => { a.on('child-process-gone', (e, d) => console.log(`tidemote-gone ${JSON.stringify(d)}`)); });
  app.process().stdout.on('data', (d) => { for (const m of String(d).matchAll(/tidemote-gone (\{.*\})/g)) list.push(JSON.parse(m[1])); });
}
const esc = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
// a promise given up on after ms (a hung GPU process leaves a readback, and Chromium's close, waiting forever)
const within = (ms, p, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms / 1000} s`)), ms).unref())]);
// the app closed, or its process killed when it will not close
async function shut(app) {
  if (!app) return;
  await within(20000, app.close(), 'close').catch(() => { try { app.process().kill('SIGKILL'); } catch {} });
}

async function attempt(extra) {
  const r = { args: [...base, ...extra] };
  let app;
  // (a userData of its own, as a fresh install has: the machine's settings and saves untouched)
  const data = await mkdtemp(join(tmpdir(), 'tidemote-launch-'));
  try {
    app = await _electron.launch({ executablePath: exe, args: [...r.args, `--user-data-dir=${data}`], timeout: 60000 });
    r.gone = [];
    await watchGone(app, r.gone);
    const page = await app.firstWindow();
    await page.waitForLoadState();
    await page.evaluate(() => localStorage.setItem('tidemote.view', JSON.stringify({ particles: 4096, v: 6 })));
    await page.reload();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // the world running, or the page's error screen (no adapter on a machine without a GPU)
    await page.waitForFunction(() => globalThis.__tidemote?.eng || !document.getElementById('nogpu')?.hidden, null, { timeout: 90000 });
    // the first steps (the world then waits on the opening menu)
    await page.waitForFunction(() => globalThis.__tidemote?.eng?.simTime > 0 || !document.getElementById('nogpu')?.hidden, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    Object.assign(r, await within(120000, page.evaluate(async () => {
      const t = globalThis.__tidemote;
      const a = t?.eng?.device?.adapterInfo || {};
      const shown = document.getElementById('nogpu')?.hidden === false;
      // what Chromium offers when asked for its fallback (software) adapter, for the record
      let fallback = null;
      try { const f = await navigator.gpu?.requestAdapter({ forceFallbackAdapter: true }); fallback = f ? [f.info?.vendor, f.info?.architecture, f.info?.description].filter(Boolean).join(' / ') || 'unnamed' : 'none'; } catch (e) { fallback = `error: ${e.message}`; }
      // the GPU still answering once frames have been presented: a readback, as saving a world makes
      let gpuAlive = null;
      const d = t?.eng?.device;
      if (d) {
        try { const b = d.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ }); await Promise.race([b.mapAsync(GPUMapMode.READ), new Promise((_, no) => setTimeout(() => no(new Error('readback: no answer in 60 s')), 60000))]); b.destroy(); gpuAlive = true; } catch (e) { gpuAlive = String(e.message || e); }
      }
      return {
        origin: location.origin, ua: navigator.userAgent, gpuAlive,
        bridge: typeof globalThis.tidemoteDesktop?.worlds?.list === 'function',
        steam: await globalThis.tidemoteDesktop?.steam?.(),
        running: !!t?.eng, stepped: (t?.eng?.simTime ?? 0) > 0,
        gpu: [a.vendor, a.architecture, a.description].filter(Boolean).join(' / '),
        particles: t?.eng?.count ?? 0,
        failed: shown ? document.getElementById('nogpu-title')?.textContent : null,
        detail: shown ? document.getElementById('nogpu-detail')?.textContent : null,
        fallback,
      };
    }), 'page'));
    r.version = await app.evaluate(({ app: a }) => a.getVersion());
    // the Steam API must load only in the helper's process, never in the app's (Linux can tell: /proc/self/maps)
    r.steamInMain = await app.evaluate(() => {
      try { return /steam_api|steamworksjs/.test(process.getBuiltinModule('node:fs').readFileSync('/proc/self/maps', 'utf8')); } catch { return null; }
    });
    r.errors = errors;
    // best effort: a software adapter can leave the window without a frame to capture
    await page.screenshot({ path: join(out, 'window.png'), timeout: 10000 }).catch(() => {});
  } catch (e) {
    r.exception = String(e?.message || e).split('\n')[0];
  } finally {
    await shut(app);
    await rm(data, { recursive: true, force: true }).catch(() => {});
  }
  const line = `${r.args.join(' ')} → ${r.exception ?? (r.stepped ? `stepped on ${r.gpu || 'an adapter'}` : `${r.failed ?? 'never stepped'}: ${r.detail ?? ''}`)}; fallback adapter: ${r.fallback}`;
  console.log(gha ? `::notice title=launch check (${process.platform})::${esc(line)}` : line);
  return r;
}

// The menu's Quit, as a player quits: whether the app exited (its code), and the last session it kept
async function quitCheck() {
  const r = {};
  let app;
  // (a userData of its own: the machine's saves and settings untouched)
  const data = await mkdtemp(join(tmpdir(), 'tidemote-quit-')), worlds = join(data, 'worlds');
  // (the window's close waits on the page keeping its world longer than a player's 30 s: on a software GPU that takes
  // about 40 s)
  const launch = () => _electron.launch({ executablePath: exe, args: [...base, `--user-data-dir=${data}`], env: { ...process.env, TIDEMOTE_CLOSE_WAIT_MS: '300000' }, timeout: 60000 });
  // a world begun (the opening menu waits on Begin, or under automation goes by itself) and run long enough that
  // quitting asks: simulated time more than a second past its start (from: a continued world's saved time). Slowly
  // where the GPU is software: a frame takes about a second there and steps 1/60 s of the world.
  const begin = async (page, from = 0) => {
    await page.waitForFunction(() => document.getElementById('intro')?.classList.contains('ask') || document.body.classList.contains('live'), null, { timeout: 180000 });
    if (await page.evaluate(() => !document.body.classList.contains('live'))) await page.click('#begin');
    await page.waitForFunction((t) => document.body.classList.contains('live') && globalThis.__tidemote.eng.simTime > t, from + 1.25, { timeout: 600000 });
  };
  try {
    app = await launch();
    const proc = app.process();
    // why a quit did not happen: Chromium's child processes that died (the GPU's) and the page's errors
    r.gone = []; r.errors = [];
    await watchGone(app, r.gone);
    const page = await app.firstWindow();
    page.on('console', (m) => { if (m.type() === 'error' && r.errors.length < 10) r.errors.push(m.text().split('\n')[0].slice(0, 300)); });
    await page.waitForLoadState();
    await page.evaluate(() => localStorage.setItem('tidemote.view', JSON.stringify({ particles: 4096, v: 6 })));
    await page.reload();
    await begin(page);
    await page.evaluate(() => globalThis.__tidemote.input.act('menu'));
    const closed = app.waitForEvent('close', { timeout: 360000 }).then(() => true, () => false);
    await page.click('#gmenu [data-g="quit"]');
    r.asked = await page.locator('#gmenu [data-g="quit-save"]').count() > 0;
    const t0 = Date.now();
    if (r.asked) await page.click('#gmenu [data-g="quit-save"]');
    r.exited = await closed;
    r.quitMs = Date.now() - t0;
    r.code = proc.exitCode;
    const meta = existsSync(join(worlds, 'w-last.json')) ? JSON.parse(await readFile(join(worlds, 'w-last.json'), 'utf8')) : null;
    r.last = meta && { last: meta.last, name: meta.name, simTime: meta.simTime, bytes: meta.bytes, file: existsSync(join(worlds, 'w-last.tidemote')) };
    // opened again: the opening menu offers to continue it; then the window closed (its ✕, Alt+F4) once the world has
    // run keeps the last session again, without asking
    if (meta) {
      app = await launch();
      const page2 = await app.firstWindow();
      // (the page's errors and its own log lines as it closes: why closing kept nothing)
      r.log2 = [];
      page2.on('console', (m) => { if ((m.type() === 'error' || m.text().includes('[tidemote]')) && r.log2.length < 10) r.log2.push(m.text().split('\n')[0].slice(0, 300)); });
      await page2.waitForFunction(() => !document.getElementById('menu-c')?.hidden || document.body.classList.contains('live'), null, { timeout: 180000 });
      r.continue = await page2.evaluate(() => !document.getElementById('menu-c').hidden && document.getElementById('menu-c-v').textContent);
      await begin(page2, meta.simTime ?? 0);
      r.sim2 = await page2.evaluate(() => globalThis.__tidemote.eng.simTime);
      const closed2 = app.waitForEvent('close', { timeout: 360000 }).then(() => true, () => false);
      const t1 = Date.now();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      r.closeExited = await closed2;
      r.closeMs = Date.now() - t1;
      const again = JSON.parse(await readFile(join(worlds, 'w-last.json'), 'utf8'));
      r.closeKept = again.savedAt > meta.savedAt;
      r.again = { name: again.name, simTime: again.simTime };
    }
  } catch (e) {
    r.exception = String(e?.message || e).split('\n')[0];
    await shut(app);
  } finally {
    await rm(data, { recursive: true, force: true }).catch(() => {});
  }
  console.log(`quit check → ${r.exception ?? `${r.exited ? `exited (${r.code})` : 'still running'}, ${r.last ? `kept the last session (${r.last.name}, ${r.last.bytes} bytes)` : 'kept no last session'}; opened again, ${r.continue ? `Continue (${r.continue})` : 'no Continue'}; the window closed: ${r.closeExited ? 'exited' : 'still running'}, ${r.closeKept ? 'kept it again' : 'kept nothing new'}`}`);
  return r;
}

const report = await attempt([]);
if (report.stepped && report.gpuAlive === true) report.quit = await quitCheck();
const problems = [];
if (report.exception) problems.push(`the app did not start: ${report.exception}`);
if (report.origin !== 'app://tidemote') problems.push(`page origin ${report.origin}`);
if (!report.bridge) problems.push('the page has no tidemoteDesktop bridge');
if (!report.steam?.loaded && !report.steam?.on) problems.push(`the Steam helper did not load steamworks.js: ${report.steam?.why}`);
if (report.steamInMain) problems.push('the Steam API loaded in the app\'s own process, not only in the helper');
if (needGpu && !report.stepped) problems.push(`no world stepped: ${report.failed ?? 'started but never stepped'}`);
if (report.stepped && report.gpuAlive !== true) problems.push(`the world's clock ran but the GPU stopped answering: ${report.gpuAlive}; processes gone: ${JSON.stringify(report.gone)}`);
if (report.running && report.errors?.length) problems.push(`page errors: ${report.errors.join(' | ')}`);
const q = report.quit;
if (q && (q.exception || !q.exited || !q.asked || !q.last?.last || !q.last?.file || !q.continue || !q.closeExited || !q.closeKept)) problems.push(`Quit → Save and quit: ${q.exception ?? JSON.stringify(q)}`);
report.problems = problems;
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
if (summary) {
  const gpu = report.stepped ? `WebGPU on ${report.gpu || 'an unnamed adapter'}, ${report.particles} particles stepped` : `no world (${report.failed ?? 'never stepped'})`;
  await appendFile(summary, `- ${process.platform}: ${problems.length ? `❌ ${problems.join('; ')}` : '✅'} v${report.version}; ${gpu}; Steam helper ${report.steam?.loaded || report.steam?.on ? 'loaded steamworks.js' : 'failed'}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (problems.length && gha) for (const p of problems) console.log(`::error title=launch check (${process.platform})::${esc(p)}`);
if (problems.length) { console.error(`launch check failed:\n  ${problems.join('\n  ')}`); process.exit(1); }
