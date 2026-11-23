// What a world gives to achievements (src/achievements.js): the built page run headless to a simulated time, recording
// every story the chronicler weighed and told, the page's own unlocks and, about once a simulated minute, the world's
// numbers as the achievements see them (worldFacts). The
// chronicler's real-time gap and the achievements' real-time pacing are off (__chronTune, __achPace), so what it tells
// and unlocks at Max is what a viewer at real time would read and earn.
// `node tools/achievelab-report.mjs runs/ach/NAME/*.json` sums many worlds: when each achievement comes, in how many.
//
// usage: node tools/achievelab.mjs --out runs/ach/NAME/w1.json [--n 131072] [--minutes 480] [--html FILE] [--k '{...}']
// On Linux without a display set TIDEMOTE_VK=1; under WSL run it with tools/gpu-node.sh (Windows Chrome, headless).
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { retryAdapter, vkOn } from './vk.mjs';
import { launchOptions, UNTHROTTLED } from './lib/browser.mjs';
import { viewPrefs } from './lib/prefs.mjs';
import { arg } from './lib/args.mjs';

const html = path.resolve(arg('html', fileURLToPath(new URL('../dist/tidemote.html', import.meta.url))));
const n = +arg('n', 131072), minutes = +arg('minutes', 480), out = arg('out');
if (!out) { console.log('usage: node tools/achievelab.mjs --out FILE.json [--n 131072] [--minutes 480] [--html FILE]'); process.exit(1); }
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(html).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const args = ['--enable-unsafe-webgpu', ...UNTHROTTLED];
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tidemote-ach-')),
  { viewport: { width: 1280, height: 800 }, ...launchOptions({ browser: 'chrome', args, headless: true, vk: vkOn }) });
const page = ctx.pages()[0] || await ctx.newPage();
page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.log(`[console] ${m.text().slice(0, 400)}`); });
await page.addInitScript(retryAdapter);
await page.addInitScript((view) => {
  globalThis.__chronTune = { gapReal: 0 };
  globalThis.__achPace = { real: 0 };
  if (sessionStorage.getItem('tm-init')) return;
  sessionStorage.setItem('tm-init', '1');
  localStorage.setItem('tidemote.view', JSON.stringify(view));
  localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
}, viewPrefs({ particles: n, auto: false, labOpen: false }));
await page.goto(`http://127.0.0.1:${server.address().port}/${arg('k') ? `#k=${encodeURIComponent(arg('k'))}` : ''}`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
await page.keyboard.press('Shift'); // without a gesture the page holds the world on its intro
await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
const t0 = Date.now();
await page.evaluate(() => { const T = globalThis.__tidemote; T.chronDebug = []; T.chronTold = []; T.achLog = []; T.setSpeed(Infinity); });

// candidates come every simulated 10 s while they hold: each distinct one is kept at its first sighting
const cands = new Map();
const told = [], stats = [], ach = [];
let lastPrint = 0, lastT = -1e9;
const save = () => fs.writeFileSync(out, JSON.stringify({ n, minutes, told, ach, cands: [...cands.values()], stats }));
for (;;) {
  const r = await page.evaluate(() => {
    const T = globalThis.__tidemote;
    return { t: T.eng.simTime, facts: T.achFacts, debug: T.chronDebug.splice(0), told: T.chronTold.splice(0), ach: T.achLog.splice(0) };
  });
  for (const d of r.debug) for (const [kind, , , key, moment, low, span] of d.all) {
    const id = `${kind}|${key}|${moment}|${low}|${span}`;
    if (!cands.has(id)) cands.set(id, { kind, key, moment, low, span, first: d.t });
  }
  told.push(...r.told); ach.push(...r.ach);
  if (r.facts && r.t - lastT >= 60) { stats.push({ t: r.t, facts: r.facts }); lastT = r.t; }
  if (Date.now() - lastPrint > 60000) {
    lastPrint = Date.now(); save();
    console.log(`${(r.t / 60).toFixed(1)} min  told ${told.length}  unlocked ${ach.map((a) => a.id).join(' ')}  ${((Date.now() - t0) / 1000).toFixed(0)} s real`);
  }
  if (r.t >= minutes * 60) break;
  await page.waitForTimeout(300);
}
save();
console.log(`${told.length} stories in ${minutes} simulated minutes; ${((Date.now() - t0) / 1000).toFixed(0)} s real → ${out}`);
await ctx.close(); server.close();
