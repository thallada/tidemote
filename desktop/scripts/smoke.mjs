// Launches a packaged desktop build and checks the page runs in it: WebGPU adapter, particle count,
// frame rate after a warm-up, a screenshot. Under WSL run it with Windows Node on a Windows build:
//   tools/gpu-node.sh desktop/scripts/smoke.mjs --exe 'C:\...\Tidemote.exe' --out runs/desktop/smoke
// --steam APPID starts Steam as that app (480, Spacewar, before Tidemote has its own) and checks the
// shell: Steam's status, a save through Settings → Worlds (files, a preview), read back and deleted,
// an achievement call, the Workshop's subscribed worlds. Nothing is published.
import { _electron } from 'playwright-core';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const exe = arg('exe');
const out = arg('out', 'runs/desktop/smoke');
const seconds = +arg('seconds', 20);
const appId = arg('steam');
if (!exe) throw new Error('--exe PATH to a packaged Tidemote executable');

await mkdir(out, { recursive: true });
const app = await _electron.launch({ executablePath: exe, args: [], env: { ...process.env, ...(appId ? { TIDEMOTE_STEAM_APPID: appId } : {}) } });
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
  if (appId) report.shell = await checkShell(page);
  report.errors = errors;
  await page.screenshot({ path: join(out, 'window.png') });
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close();
}

async function checkShell(page) {
  const r = { steam: await page.evaluate(() => globalThis.tidemoteDesktop?.steam()) };
  // a save through the page's own controls
  await page.click('#set-open');
  await page.click('[data-tab="worlds"]');
  const before = await page.evaluate(() => globalThis.tidemoteDesktop.worlds.list());
  await page.fill('#w-name', 'smoke check');
  await page.click('[data-o="w-save"]');
  let after = before;
  for (let i = 0; i < 120 && after.length <= before.length; i++) {
    await page.waitForTimeout(500);
    after = await page.evaluate(() => globalThis.tidemoteDesktop.worlds.list());
  }
  const m = after.find((x) => x.name === 'smoke check');
  if (!m) throw new Error(`no save named smoke check: ${JSON.stringify(after)}`);
  r.save = { listed: !!m, preview: m?.preview, bytes: m?.bytes };
  r.save.read = await page.evaluate((id) => globalThis.tidemoteDesktop.worlds.get(id).then((b) => b.byteLength), m.id);
  await page.waitForSelector(`[data-o="w-load"][data-v="${m.id}"]`);
  r.rowShare = await page.locator(`[data-o="w-share"][data-v="${m.id}"]`).count();
  await page.screenshot({ path: join(out, 'worlds.png') });
  if (process.env.APPDATA) await copyFile(join(process.env.APPDATA, 'Tidemote', 'worlds', `${m.id}.jpg`), join(out, 'preview.jpg')).catch(() => {});
  await page.evaluate((id) => globalThis.tidemoteDesktop.worlds.remove(id), m.id);
  r.save.removed = !(await page.evaluate(() => globalThis.tidemoteDesktop.worlds.list())).some((x) => x.id === m.id);
  // an id Spacewar does not have: the call goes through and is refused
  r.achieve = await page.evaluate(() => globalThis.tidemoteDesktop.achieve('FIRST_MULTI'));
  r.workshop = (await page.evaluate(() => globalThis.tidemoteDesktop.worlds.list())).filter((x) => x.from === 'workshop').length;
  return r;
}
