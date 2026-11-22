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
// On Linux it runs with Ozone's headless platform (no display needed) and without Chromium's sandbox
// (an unpacked build's chrome-sandbox is not setuid root).
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
const base = ['--windowed', '--enable-unsafe-swiftshader', ...(process.platform === 'linux' ? ['--ozone-platform=headless', '--no-sandbox'] : [])];
const gha = !!process.env.GITHUB_ACTIONS;
const esc = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

async function attempt(extra) {
  const r = { args: [...base, ...extra] };
  let app;
  // (a userData of its own, as a fresh install has: the machine's settings and saves untouched)
  const data = await mkdtemp(join(tmpdir(), 'tidemote-launch-'));
  try {
    app = await _electron.launch({ executablePath: exe, args: [...r.args, `--user-data-dir=${data}`], timeout: 60000 });
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
    Object.assign(r, await page.evaluate(async () => {
      const t = globalThis.__tidemote;
      const a = t?.eng?.device?.adapterInfo || {};
      const shown = document.getElementById('nogpu')?.hidden === false;
      // what Chromium offers when asked for its fallback (software) adapter, for the record
      let fallback = null;
      try { const f = await navigator.gpu?.requestAdapter({ forceFallbackAdapter: true }); fallback = f ? [f.info?.vendor, f.info?.architecture, f.info?.description].filter(Boolean).join(' / ') || 'unnamed' : 'none'; } catch (e) { fallback = `error: ${e.message}`; }
      return {
        origin: location.origin, ua: navigator.userAgent,
        bridge: typeof globalThis.tidemoteDesktop?.worlds?.list === 'function',
        steam: await globalThis.tidemoteDesktop?.steam?.(),
        running: !!t?.eng, stepped: (t?.eng?.simTime ?? 0) > 0,
        gpu: [a.vendor, a.architecture, a.description].filter(Boolean).join(' / '),
        particles: t?.eng?.count ?? 0,
        failed: shown ? document.getElementById('nogpu-title')?.textContent : null,
        detail: shown ? document.getElementById('nogpu-detail')?.textContent : null,
        fallback,
      };
    }));
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
    await app?.close().catch(() => {});
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
  const launch = () => _electron.launch({ executablePath: exe, args: [...base, `--user-data-dir=${data}`], timeout: 60000 });
  // a world begun (the opening menu waits on Begin, or under automation goes by itself) and run long enough that
  // quitting asks: simulated time past a second
  const begin = async (page) => {
    await page.waitForFunction(() => document.getElementById('intro')?.classList.contains('ask') || document.body.classList.contains('live'), null, { timeout: 180000 });
    if (await page.evaluate(() => !document.body.classList.contains('live'))) await page.click('#begin');
    await page.waitForFunction(() => document.body.classList.contains('live') && globalThis.__tidemote.eng.simTime > 2, null, { timeout: 120000 });
  };
  try {
    app = await launch();
    const proc = app.process();
    const page = await app.firstWindow();
    await page.waitForLoadState();
    await page.evaluate(() => localStorage.setItem('tidemote.view', JSON.stringify({ particles: 4096, v: 6 })));
    await page.reload();
    await begin(page);
    await page.evaluate(() => globalThis.__tidemote.input.act('menu'));
    const closed = app.waitForEvent('close', { timeout: 120000 }).then(() => true, () => false);
    await page.click('#gmenu [data-g="quit"]');
    r.asked = await page.locator('#gmenu [data-g="quit-save"]').count() > 0;
    if (r.asked) await page.click('#gmenu [data-g="quit-save"]');
    r.exited = await closed;
    r.code = proc.exitCode;
    const meta = existsSync(join(worlds, 'w-last.json')) ? JSON.parse(await readFile(join(worlds, 'w-last.json'), 'utf8')) : null;
    r.last = meta && { last: meta.last, name: meta.name, simTime: meta.simTime, bytes: meta.bytes, file: existsSync(join(worlds, 'w-last.tidemote')) };
    // opened again: the opening menu offers to continue it; then the window closed (its ✕, Alt+F4) once the world has
    // run keeps the last session again, without asking
    if (meta) {
      app = await launch();
      const page2 = await app.firstWindow();
      await page2.waitForFunction(() => !document.getElementById('menu-c')?.hidden || document.body.classList.contains('live'), null, { timeout: 180000 });
      r.continue = await page2.evaluate(() => !document.getElementById('menu-c').hidden && document.getElementById('menu-c-v').textContent);
      await begin(page2);
      const closed2 = app.waitForEvent('close', { timeout: 120000 }).then(() => true, () => false);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      r.closeExited = await closed2;
      const again = JSON.parse(await readFile(join(worlds, 'w-last.json'), 'utf8'));
      r.closeKept = again.savedAt > meta.savedAt;
    }
  } catch (e) {
    r.exception = String(e?.message || e).split('\n')[0];
    await app?.close().catch(() => {});
  } finally {
    await rm(data, { recursive: true, force: true }).catch(() => {});
  }
  console.log(`quit check → ${r.exception ?? `${r.exited ? `exited (${r.code})` : 'still running'}, ${r.last ? `kept the last session (${r.last.name}, ${r.last.bytes} bytes)` : 'kept no last session'}; opened again, ${r.continue ? `Continue (${r.continue})` : 'no Continue'}; the window closed: ${r.closeExited ? 'exited' : 'still running'}, ${r.closeKept ? 'kept it again' : 'kept nothing new'}`}`);
  return r;
}

const report = await attempt([]);
if (report.stepped) report.quit = await quitCheck();
const problems = [];
if (report.exception) problems.push(`the app did not start: ${report.exception}`);
if (report.origin !== 'app://tidemote') problems.push(`page origin ${report.origin}`);
if (!report.bridge) problems.push('the page has no tidemoteDesktop bridge');
if (!report.steam?.loaded && !report.steam?.on) problems.push(`the Steam helper did not load steamworks.js: ${report.steam?.why}`);
if (report.steamInMain) problems.push('the Steam API loaded in the app\'s own process, not only in the helper');
if (needGpu && !report.stepped) problems.push(`no world stepped: ${report.failed ?? 'started but never stepped'}`);
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
