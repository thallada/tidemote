// Grow a fresh page world SIM seconds, then replay the mind of N random living cells and tally what
// mind.js says they are doing, by guild.
//   tools/gpu-node.sh runs/crowd/minds.mjs SIM N OUT.json
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { parseMind, interpretMind } from '../../src/mind.js';
import { readGenome, dietGuild } from '../../src/genome.js';
import { DEFAULT_K as K } from '../../src/shaders.js';
const [simArg = '600', nArg = '400', out = 'runs/crowd/minds.json'] = process.argv.slice(2);
const server = http.createServer((req, res) => { const url = decodeURIComponent(req.url.split('?')[0]); const file = path.join(path.resolve('dist'), url === '/' ? 'tidemote.html' : url); if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; } res.writeHead(200); fs.createReadStream(file).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'minds-')), { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, viewport: null, args: ['--window-size=1200,800', '--no-first-run'] });
const page = ctx.pages()[0]; page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.addInitScript(() => { localStorage.setItem('tidemote.view', JSON.stringify({ auto: false, labOpen: false })); });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running' && document.body.classList.contains('live'), null, { polling: 250 });
await page.evaluate(() => globalThis.__tidemote.setSpeed(Infinity));
await page.waitForFunction((end) => globalThis.__tidemote.eng.simTime >= end, +simArg, { polling: 1000 });
await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
const res = await page.evaluate(async (n) => {
  const { eng } = globalThis.__tidemote, st = await eng.readState(), N = st.cpu.count;
  const u = new Uint32Array(st.gpu.parts, 0, N * 10), f = new Float32Array(st.gpu.parts, 0, N * 10);
  const ids = [];
  for (let i = 0; i < N; i++) if (u[i * 10 + 4] >= 5) ids.push([u[i * 10 + 7], u[i * 10 + 4], f[i * 10 + 6]]);
  const pick = [];
  for (let k = 0; k < n; k++) pick.push(ids[Math.floor(Math.random() * ids.length)]);
  const minds = [];
  const keep = eng.onMind;
  // the page sets mindId from its selection every frame: hold it to ours
  let cur = 0xffffffff;
  Object.defineProperty(eng, 'mindId', { get: () => cur, set: () => {}, configurable: true });
  for (const [id, kind, age] of pick) {
    const got = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 3000);
      eng.onMind = (r) => { if (r.id === id) { clearTimeout(t); resolve([...r.u32]); } };
      cur = id;
    });
    if (got) minds.push({ id, kind, age, u: got });
  }
  eng.onMind = keep; cur = 0xffffffff;
  return { minds, genomes: [...new Uint32Array(st.gpu.genomes)], simTime: eng.simTime };
}, +nArg);
await ctx.close(); server.close();
const gu = new Uint32Array(res.genomes), gf = new Float32Array(gu.buffer);
const tally = {};
const rows = [];
for (const r of res.minds) {
  const u32 = new Uint32Array(r.u), f32 = new Float32Array(u32.buffer);
  const m = parseMind(u32, f32); if (!m) continue;
  const g = readGenome(gu, gf, r.kind);
  const it = interpretMind(m, g, r.kind, { K, genomeOf: (k) => readGenome(gu, gf, k) });
  const gd = dietGuild(g);
  (tally[gd] ||= {})[it.key] = (tally[gd][it.key] || 0) + 1;
  rows.push({ guild: gd, key: it.key, E: +m.energy.toFixed(2), divE: +m.divE.toFixed(2), reproE: +g.reproE.toFixed(2), hungry: m.hungry, why: it.why });
}
fs.writeFileSync(out, JSON.stringify({ simTime: res.simTime, tally, rows }, null, 1));
console.log('sim', Math.round(res.simTime), 's; cells', rows.length);
for (const [gd, t] of Object.entries(tally)) { const n = Object.values(t).reduce((a, b) => a + b, 0); console.log(gd.padEnd(10), n, Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(100 * v / n)}%`).join('  ')); }
process.exit(0);
