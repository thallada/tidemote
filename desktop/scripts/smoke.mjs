// Launches a packaged desktop build and checks the page runs in it: WebGPU adapter, particle count,
// frame rate after a warm-up, a screenshot. Under WSL run it with Windows Node on a Windows build:
//   tools/gpu-node.sh desktop/scripts/smoke.mjs --exe 'C:\...\Tidemote.exe' --out runs/desktop/smoke
import { _electron } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const exe = arg('exe');
const out = arg('out', 'runs/desktop/smoke');
const seconds = +arg('seconds', 20);
if (!exe) throw new Error('--exe PATH to a packaged Tidemote executable');

await mkdir(out, { recursive: true });
const app = await _electron.launch({ executablePath: exe, args: [] });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForFunction(() => globalThis.__tidemote?.eng, null, { timeout: 60000 });
  await page.waitForTimeout(seconds * 1000);
  const report = await page.evaluate(async () => {
    const { eng, perf, state } = globalThis.__tidemote;
    const a = eng.device?.adapterInfo || {};
    return {
      ua: navigator.userAgent, origin: location.origin,
      gpu: [a.vendor, a.architecture, a.description].filter(Boolean).join(' / '),
      particles: eng.count, speed: state.speed, fps: +perf.fps.toFixed(1), stepMs: +perf.stepMs.toFixed(2), why: perf.why,
      storage: { indexedDB: !!globalThis.indexedDB, persisted: await navigator.storage?.persisted?.() },
    };
  });
  report.errors = errors;
  await page.screenshot({ path: join(out, 'window.png') });
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close();
}
