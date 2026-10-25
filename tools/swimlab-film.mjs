// Film the swim lab's test bodies as the page draws them: the page is opened (Windows Chrome, the GPU), its
// world cleared to silt heaped far off with the water stilled, the bodies laid out side by side heading
// left, and a fixed camera films them swimming across the frame at real time.
//   tools/gpu-node.sh tools/swimlab-film.mjs --bodies '["filament:12","mat:7:8:1"]' --genome '{"beat":[0.5,1.5,1,1]}' --out runs/x
//   --dist DIR serves another build (e.g. an older commit's worktree dist), --words 52 for its genome size.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { writeGenome, divEnergy } from '../src/genome.js';
import { DEFAULT_K, G_WORDS, P_BYTES } from '../src/shaders.js';
import { testGenome, layout, placeBody } from './swimlab-bodies.mjs';

const { values: v } = parseArgs({ options: {
  bodies: { type: 'string', default: '["filament:12"]' }, genome: { type: 'string', default: '{}' }, genomes: { type: 'string' },
  out: { type: 'string', default: 'runs/swimlab/film' }, dist: { type: 'string', default: 'dist' }, words: { type: 'string', default: String(G_WORDS) },
  frames: { type: 'string', default: '200' }, every: { type: 'string', default: '100' }, width: { type: 'string', default: '9' }, gap: { type: 'string', default: '1.6' },
} });
fs.mkdirSync(v.out, { recursive: true });
const bodies = JSON.parse(v.bodies), words = +v.words;
// one species per body (FIRST_LIFE + k), so each can carry its own genome
const over = v.genomes ? JSON.parse(v.genomes) : bodies.map(() => JSON.parse(v.genome));
const genomes = bodies.map((b, k) => {
  const g = testGenome({ lifespan: 500, ...over[k] }, DEFAULT_K);
  const u = new Uint32Array(G_WORDS), f = new Float32Array(u.buffer);
  writeGenome(u, f, 0, g);
  return { words: [...u.slice(0, words)], E: 0.95 * divEnergy(g, DEFAULT_K), size: g.size, col: g.col, g };
});
const plans = bodies.map((b, k) => { const cells = layout(b); return { cells, ...placeBody(cells, genomes[k].g, 0, 0) }; });

const server = http.createServer((req, res) => { const url = decodeURIComponent(req.url.split('?')[0]); const file = path.join(path.resolve(v.dist), url === '/' ? 'tidemote.html' : url); if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(file).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'film-')), { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, viewport: { width: 1000, height: 640 }, args: ['--window-size=1000,640', '--no-first-run'] });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('tidemote.autoCamera', 'off'); } catch {} });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { timeout: 60000 });
await page.mouse.move(500, 320); await page.mouse.wheel(0, 100);
await page.keyboard.press('i'); await page.mouse.move(999, 1);
await page.evaluate(() => __tidemote.setSpeed(1));
await page.waitForTimeout(500);
const info = await page.evaluate(async ({ genomes, plans, words, PW, width, gap }) => {
  const T = __tidemote, eng = T.eng;
  const st = await eng.readState();
  const [W, H] = st.cpu.grid, N = st.cpu.count;
  const pu = new Uint32Array(st.gpu.parts), pf = new Float32Array(st.gpu.parts), iu = new Uint32Array(st.gpu.intent);
  let s = 7; const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  // everything else: silt heaped in a corner far off, at rest
  for (let i = 0; i < N; i++) {
    const o = i * PW;
    pf[o] = 0.5 + rng() * W * 0.15; pf[o + 1] = 0.5 + rng() * H * 0.15; pf[o + 2] = 0; pf[o + 3] = 0;
    pu[o + 4] = 0; pf[o + 5] = 0; pf[o + 6] = 0; pu[o + 8] = 0; pu[o + 9] = 0;
    iu.set([0, 0, 0xffffffff, 0xffffffff], i * 4);
  }
  const gu = new Uint32Array(st.gpu.genomes);
  // the bodies stacked down the middle of the frame, their roots at its right third, heading left
  const cx = W / 2, cy = H / 2, x0 = cx + width * 0.2;
  let next = N - 1;
  plans.forEach((pl, k) => {
    const slot = 5 + k;
    gu.fill(0, slot * words, (slot + 1) * words); gu.set(genomes[k].words, slot * words);
    // suited to this water (a body far from its optimum goes torpid or scalds)
    const gf = new Float32Array(st.gpu.genomes); gf[slot * words + 46] = eng.tbg; gf[slot * words + 47] = 15;
    const y = cy + (k - (plans.length - 1) / 2) * gap;
    const idx = pl.cells.map(() => next--);
    pl.cells.forEach((c, i) => {
      const o = idx[i] * PW;
      pf[o] = x0 + pl.pos[i][0]; pf[o + 1] = y + pl.pos[i][1]; pf[o + 2] = 0; pf[o + 3] = 0;
      pu[o + 4] = slot; pf[o + 5] = genomes[k].E; pf[o + 6] = 0; pu[o + 7] = 2000000 + k * 1000 + i; pu[o + 8] = genomes[k].col;
      pu[o + 9] = ((pl.gen[i] << 16) | (c.turn << 28) | (c.tail ? 2 << 30 : 0) | 9) >>> 0;
      iu.set([0, 0, c.mom < 0 ? 0xffffffff : idx[c.mom], c.mom2 >= 0 ? idx[c.mom2] : 0xffffffff], idx[i] * 4);
    });
  });
  // as a saved world loads (no warm-up at Max, the record afresh)
  T.loadWorld(st);
  // still water, held so right before every step (the climate's currents are rewritten each frame)
  const frame = eng.frame.bind(eng);
  eng.frame = (o) => { eng.waves.fill(0); eng.abio = 0; return frame(o); };
  const canvas = document.querySelector('canvas');
  const fit = Math.max(canvas.width / W, canvas.height / H);
  T.cam.x = cx; T.cam.y = cy; T.cam.anchor = null;
  T.cam.zoom = T.cam.zoomTarget = Math.min(T.maxZoom(), canvas.width / (fit * width));
  return { W, H, N, zoom: T.cam.zoom };
}, { genomes, plans: plans.map((p) => ({ cells: p.cells, pos: p.pos, gen: p.gen })), words, PW: P_BYTES / 4, width: +v.width, gap: +v.gap });
console.log(JSON.stringify(info));
await page.waitForTimeout(800);
// each frame's simulated time, and each body's center (its cells' mean, by id)
const log = [];
for (let f = 0; f < +v.frames; f++) {
  const t0 = Date.now();
  await page.screenshot({ path: path.join(v.out, `f${String(f).padStart(3, '0')}.png`) });
  log.push(await page.evaluate(async (n) => {
    const eng = __tidemote.eng, [W, H] = eng.grid;
    const r = await eng.requestPick([W / 2, H / 2], 30, 0xffffffff, { maxOut: 4096, raw: true });
    const c = Array.from({ length: n }, () => [0, 0, 0]);
    for (let i = 0; i < r.raw.count; i++) { const k = r.raw.u32[i * 12 + 4] - 5; if (k >= 0 && k < n) { c[k][0] += r.raw.f32[i * 12]; c[k][1] += r.raw.f32[i * 12 + 1]; c[k][2]++; } }
    return { t: eng.simTime, ticks: __tidemote.perf.ticks, at: c.map(([x, y, m]) => (m ? [x / m, y / m, m] : null)) };
  }, bodies.length));
  await page.waitForTimeout(Math.max(0, +v.every - (Date.now() - t0)));
}
fs.writeFileSync(path.join(v.out, 'log.json'), JSON.stringify(log));
const a = log[0], b = log.at(-1);
console.log('ticks a step', [...new Set(log.map((l) => l.ticks))].join(','));
bodies.forEach((name, k) => { if (a.at[k] && b.at[k]) console.log(name, 'speed', (Math.hypot(b.at[k][0] - a.at[k][0], b.at[k][1] - a.at[k][1]) / (b.t - a.t)).toFixed(3), 'units/s over', (b.t - a.t).toFixed(1), 's'); });
await ctx.close(); server.close();
process.exit(0);
