// The release workflow's check of a packaged build on the OS it was built for (docs/release.md): the app
// starts, serves the page from its own origin, the page reaches the shell, and steamworks.js's native
// addon loads (Steam itself is not running on a build machine, so Steam stays off). CI machines have no
// GPU, so WebGPU is reported, not required, unless --need-gpu. smoke.mjs is the fuller check on a real
// GPU and with Steam.
//   node desktop/scripts/launch-check.mjs --exe out/Tidemote-linux-x64/Tidemote [--out DIR] [--need-gpu]
// On Linux it runs with Ozone's headless platform (no display needed) and without Chromium's sandbox
// (an unpacked build's chrome-sandbox is not setuid root).
import { _electron } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const exe = arg('exe');
const out = arg('out', 'runs/desktop/launch');
const needGpu = process.argv.includes('--need-gpu');
if (!exe) throw new Error('--exe PATH to a packaged Tidemote executable');

await mkdir(out, { recursive: true });
const args = process.platform === 'linux' ? ['--ozone-platform=headless', '--no-sandbox'] : [];
const app = await _electron.launch({ executablePath: exe, args, timeout: 60000 });
const problems = [];
let report = {};
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // the world running, or the page's error screen (no adapter on a machine without a GPU)
  await page.waitForFunction(() => globalThis.__tidemote?.eng || !document.getElementById('nogpu')?.hidden, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  report = await page.evaluate(async () => {
    const t = globalThis.__tidemote;
    const a = t?.eng?.device?.adapterInfo || {};
    return {
      origin: location.origin, ua: navigator.userAgent,
      bridge: typeof globalThis.tidemoteDesktop?.worlds?.list === 'function',
      steam: await globalThis.tidemoteDesktop?.steam?.(),
      running: !!t?.eng,
      gpu: [a.vendor, a.architecture, a.description].filter(Boolean).join(' / '),
      particles: t?.eng?.count ?? 0,
      failed: document.getElementById('nogpu')?.hidden === false ? document.getElementById('nogpu-title')?.textContent : null,
    };
  });
  report.version = await app.evaluate(({ app: a }) => a.getVersion());
  report.errors = errors;
  await page.screenshot({ path: join(out, 'window.png') });
} finally {
  await app.close().catch(() => {});
}

if (report.origin !== 'app://tidemote') problems.push(`page origin ${report.origin}`);
if (!report.bridge) problems.push('the page has no tidemoteDesktop bridge');
if (!report.steam?.loaded && !report.steam?.on) problems.push(`steamworks.js did not load: ${report.steam?.why}`);
if (needGpu && !report.running) problems.push(`no world running: ${report.failed}`);
if (report.running && report.errors.length) problems.push(`page errors: ${report.errors.join(' | ')}`);
report.problems = problems;
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (problems.length) { console.error(`launch check failed:\n  ${problems.join('\n  ')}`); process.exit(1); }
