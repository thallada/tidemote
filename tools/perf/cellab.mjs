// The cell lab's bench: what shading resolved cells costs (fsPointLive → pointColor/cellColor in DRAW_WGSL), two built
// pages compared on the GPU closely enough to see a few percent. Both draw the same saved world, paused, from the same
// camera spots (the densest living, and the densest unbonded, at each zoom), uncapped (no vsync, no frame-rate limit:
// the GPU never idles, its clock steady), at a fixed render scale with the tuner's dressing fixed and adaptation off.
// Pages are loaded in ABBA order (A B B A A B B A ...), one page at a time in one headless Chromium, every scene
// measured in every load, so drift and the GPU's clock cancel and the load-to-load spread (buffer placement, ±1-2%)
// is in the interval. Per scene: the median GPU ms of the main view's scene pass (where fsPointLive draws, beside the
// splat, bridges and small sprites) and of the whole frame, for A and B, and B against A in percent with a 95%
// interval (t over the ABBA pairs' log ratios) and a verdict.
//   flock ~/.cache/tidemote-heavy.lock env TIDEMOTE_VK=1 ~/.local/bin/capped node tools/perf/cellab.mjs \
//     --a runs/cells/builds/base.html --b dist/tidemote.html [--out runs/perf/cellab/NAME.json] [--blocks 12]
//     [--seconds 3] [--settle 1] [--zooms 80,150,300,600] [--free 300] [--width 1920] [--height 1080] [--scale 2]
//     [--look off] [--world runs/perf/worlds/cells128k.bin] [--n 131072] [--margin 1] [--k '{...}']
// --margin: the percent under which a difference counts as none (the verdict: B slower / faster / indistinguishable).
// The spots are chosen from the world once and kept beside it (WORLD.cellab.json; --spots: only that, no browser). Linux headless on the GPU only
// (TIDEMOTE_VK=1); about 35 s a block at the defaults (12 blocks: about 7 minutes).
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { cliArgs } from '../lib/args.mjs';
import { launchOptions } from '../lib/browser.mjs';
import { viewPrefs } from '../lib/prefs.mjs';
import { retryAdapter } from '../vk.mjs';
import { unpackWorld, loadBinWorld } from '../lib/world.mjs';
import { aim } from '../pagelab.mjs';

const v = { a: 'runs/cells/builds/base.html', b: 'dist/tidemote.html', world: 'runs/perf/worlds/cells128k.bin', n: 131072, blocks: 12, seconds: 3, settle: 1,
  zooms: '80,150,300,600', free: '300', width: 1920, height: 1080, scale: 2, look: 'off', margin: 1, out: null, k: '{"lowEras":0,"eventPlan":"none@1000000000"}', ...cliArgs() };
if (!process.env.TIDEMOTE_VK && !v.spots) { console.error('cellab: Linux headless on the GPU only (TIDEMOTE_VK=1)'); process.exit(2); }
const W = +v.width, H = +v.height;
for (const f of [v.a, v.b, v.world]) if (!fs.existsSync(f)) { console.error(`cellab: no ${f}`); process.exit(2); }

// ---- the spots: windows of the view's size (at each zoom) holding the most living cells, or the most unbonded ones
const spotFile = v.world.replace(/\.bin$/, '') + '.cellab.json';
const want = [...v.zooms.split(',').map((z) => ['dense', +z]), ...(v.free ? v.free.split(',').map((z) => ['free', +z]) : [])];
let spots = fs.existsSync(spotFile) ? JSON.parse(fs.readFileSync(spotFile, 'utf8')) : {};
const key = ([kind, z]) => `${kind}${z}@${W}x${H}`;
if (want.some((w) => !spots[key(w)])) {
  const { P_BYTES, FIRST_LIFE } = await import('../../src/shaders.js');
  const world = unpackWorld(fs.readFileSync(v.world));
  const [gw, gh] = world.cpu.grid, cnt = world.cpu.count, PW = P_BYTES / 4, NONE = 0xffffffff;
  const pu = new Uint32Array(world.gpu.parts), pf = new Float32Array(world.gpu.parts), it = new Uint32Array(world.gpu.intent);
  const R = 4, cw = gw * R, ch = gh * R; // a quarter unit's bins
  const bins = { dense: new Float64Array(cw * ch), free: new Float64Array(cw * ch) };
  for (let i = 0; i < cnt; i++) {
    const o = i * PW;
    if (pu[o + 4] < FIRST_LIFE) continue;
    const bx = ((Math.floor(pf[o] * R) % cw) + cw) % cw, by = ((Math.floor(pf[o + 1] * R) % ch) + ch) % ch;
    bins.dense[by * cw + bx]++;
    if (it[i * 4 + 2] === NONE && it[i * 4 + 3] === NONE) bins.free[by * cw + bx]++;
  }
  // (the world's fit: the page never zooms out past it, nor does aim)
  const fit = Math.max(W / gw, H / gh);
  for (const w of want) {
    if (spots[key(w)]) continue;
    const [kind, z] = w, zz = Math.max(z, fit), b = bins[kind];
    const bw = Math.min(cw, Math.round((W / zz) * R)), bh = Math.min(ch, Math.round((H / zz) * R));
    // a summed-area table over the world tiled twice, for windows that wrap
    const S = new Float64Array((2 * cw + 1) * (2 * ch + 1)), sw = 2 * cw + 1;
    for (let y = 0; y < 2 * ch; y++) for (let x = 0; x < 2 * cw; x++)
      S[(y + 1) * sw + x + 1] = b[(y % ch) * cw + (x % cw)] + S[y * sw + x + 1] + S[(y + 1) * sw + x] - S[y * sw + x];
    let best = -1, at = null;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const s = S[(y + bh) * sw + x + bw] - S[y * sw + x + bw] - S[(y + bh) * sw + x] + S[y * sw + x];
      if (s > best) { best = s; at = [(x + bw / 2) / R, (y + bh / 2) / R]; }
    }
    spots[key(w)] = { kind, zoom: z, at: at.map((c) => +c.toFixed(2)), cells: best };
    console.log(`spot ${key(w)}: ${best} ${kind === 'free' ? 'unbonded ' : ''}living cells about (${at.map((c) => c.toFixed(1))})`);
  }
  fs.writeFileSync(spotFile, JSON.stringify(spots, null, 1));
}
if (v.spots) process.exit(0);
const scenes = want.map((w) => ({ name: `${w[0]}${w[1]}`, ...spots[key(w)] }));

// ---- the pages and the world, served
const files = { '/a.html': path.resolve(v.a), '/b.html': path.resolve(v.b), '/world.bin': path.resolve(v.world) };
const server = http.createServer((req, res) => {
  const f = files[req.url.split(/[?#]/)[0]];
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.homedir(), '.cache', 'cellab-'));
const ctx = await chromium.launchPersistentContext(profile, {
  ...launchOptions({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-webgpu-developer-features', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--no-first-run'] }),
  viewport: { width: W, height: H }, deviceScaleFactor: 1 });

// one block: a fresh page of `side`, the world loaded and held, every scene measured
async function block(side) {
  const t0 = Date.now();
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [page] ${m.text().slice(0, 300)}`); });
  await page.addInitScript(retryAdapter);
  await page.addInitScript((view) => {
    if (sessionStorage.getItem('tm-init')) return;
    sessionStorage.setItem('tm-init', '1');
    localStorage.setItem('tidemote.view', JSON.stringify(view));
    localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
  }, viewPrefs({ particles: +v.n, auto: false, labOpen: false, trails: 0, notes: false }));
  // (no climate event and no low era in the page's own world, whose climate drives the loaded one: a storm's sea or a
  // frost in one load and not the next costs milliseconds)
  await page.goto(`${base}/${side}.html#k=${encodeURIComponent(v.k)}`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
  await page.mouse.move(W - 2, 2);
  await page.addStyleTag({ content: '#dock,#floats,#hud,#flash,#caption,#feed,#lab,.rail{display:none!important}' });
  await page.evaluate(() => globalThis.__tidemote.setSpeed(0));
  await loadBinWorld(page, `${base}/world.bin`);
  // held at the saved moment itself (never stepped: steps are not bit-reproducible, and cells moved differently in each
  // load would change the pixels shaded); dressing fixed, nothing adapting
  await page.evaluate(async ({ scale, look }) => {
    const T = globalThis.__tidemote, { state, perf } = T;
    T.setSpeed(0);
    T.deselect?.();
    if (T.setEffects) T.setEffects('high');
    state.perf.fps = 0; T.setScale(scale);
    perf.slow = 1; perf.lastAdjust = Infinity;
    if (look === 'off') T.look.off(); else T.look.set({ grain: 0 }, 1);
  }, { scale: +v.scale, look: v.look });
  const load = (Date.now() - t0) / 1000;
  const out = {};
  for (const sc of scenes) {
    await aim(page, sc.at, sc.zoom);
    out[sc.name] = await page.evaluate(async ({ settle, seconds }) => {
      const T = globalThis.__tidemote, { eng, perf } = T;
      perf.slow = 1; perf.lastAdjust = Infinity;
      await new Promise((r) => setTimeout(r, settle * 1000));
      const scene = [], frame = [], names = new Set(), passes = {};
      eng.passProfile = true;
      // the main view's scene pass: the one drawing the living (its name is its first three pipelines)
      eng.onPassTimes = (times, f) => {
        if (!(f.ms > 0 && f.ms < 1000)) return;
        let s = 0, hit = false;
        for (const [name, ms] of times) passes[name] = (passes[name] ?? 0) + ms;
        for (const [name, ms] of times) if (/fsPointLive|fsSplat|fsBridge|fsPointSmall|fsReproj|fsLine/.test(name) && !/fsStone|fsLoupe/.test(name)) { s += ms; hit = true; names.add(name); }
        if (hit) { scene.push(s); frame.push(f.ms); }
      };
      const r0 = performance.now();
      let rafs = 0, on = true;
      const tick = () => { if (on) { rafs++; requestAnimationFrame(tick); } };
      requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      on = false; eng.passProfile = false; eng.onPassTimes = null;
      for (const k in passes) passes[k] = +(passes[k] / Math.max(1, frame.length)).toFixed(4);
      return { scene, frame, passes, fps: (rafs * 1000) / (performance.now() - r0), scale: T.renderScale(), names: [...names], ppu: eng.lastCam?.ppu };
    }, { settle: +v.settle, seconds: +v.seconds });
  }
  await page.close();
  return { side, load, scenes: out };
}

// ---- ABBA
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const order = Array.from({ length: +v.blocks }, (_, i) => (['a', 'b', 'b', 'a'][i % 4]));
const blocks = [];
const T0 = Date.now();
for (const [i, side] of order.entries()) {
  const b = await block(side);
  blocks.push(b);
  console.log(`block ${i + 1}/${order.length} ${side.toUpperCase()} (load ${b.load.toFixed(0)} s): ${scenes.map((sc) => { const r = b.scenes[sc.name]; return `${sc.name} ${med(r.scene).toFixed(3)}/${med(r.frame).toFixed(2)} ms ${r.fps.toFixed(0)} fps`; }).join('  ')}`);
}
await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });

// ---- per scene: block medians, B against A as the mean of the pairs' log ratios (pairs: blocks 1-2, 3-4, ...: each AB or BA)
// t's 97.5% quantile for df 1..30
const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const compare = (get) => {
  const A = blocks.filter((b) => b.side === 'a').map(get), B = blocks.filter((b) => b.side === 'b').map(get);
  const d = [];
  for (let i = 0; i + 1 < blocks.length; i += 2) {
    const [x, y] = [blocks[i], blocks[i + 1]], a = x.side === 'a' ? x : y, b = x.side === 'a' ? y : x;
    d.push(Math.log(get(b) / get(a)));
  }
  const n = d.length, m = d.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1));
  const h = n > 1 ? T975[Math.min(n - 2, 29)] * sd / Math.sqrt(n) : Infinity;
  const pct = (x) => 100 * (Math.exp(x) - 1);
  return { a: med(A), b: med(B), pct: pct(m), lo: pct(m - h), hi: pct(m + h), aBlocks: A, bBlocks: B };
};
const verdict = (c) => (c.lo > 0 && c.pct > +v.margin ? 'B SLOWER' : c.hi < 0 && c.pct < -v.margin ? 'B faster'
  : c.lo > -v.margin && c.hi < +v.margin ? `indistinguishable (within ±${v.margin}%)` : c.lo > 0 ? 'B slower, under the margin' : c.hi < 0 ? 'B faster, under the margin' : 'unresolved (interval wider than the margin)');
const fmt = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
console.log(`\nA ${v.a}\nB ${v.b}\n${blocks.length} blocks (ABBA), ${v.seconds} s a scene, ${W}x${H} at scale ${v.scale}, look ${v.look}, ${((Date.now() - T0) / 60000).toFixed(1)} min`);
const result = { when: new Date().toISOString(), args: v, scenes: {}, blocks };
for (const sc of scenes) {
  const s = compare((b) => med(b.scenes[sc.name].scene)), f = compare((b) => med(b.scenes[sc.name].frame));
  result.scenes[sc.name] = { spot: sc, scene: s, frame: f, verdict: verdict(s) };
  console.log(`${sc.name.padEnd(9)} scene A ${s.a.toFixed(3)} B ${s.b.toFixed(3)} ms  B-A ${fmt(s.pct)} [${fmt(s.lo)}, ${fmt(s.hi)}]  ${verdict(s).padEnd(28)} | frame A ${f.a.toFixed(2)} B ${f.b.toFixed(2)} ms  ${fmt(f.pct)} [${fmt(f.lo)}, ${fmt(f.hi)}]`);
}
console.log(`scene passes: ${[...new Set(blocks.flatMap((b) => Object.values(b.scenes).flatMap((r) => r.names)))].join('; ')}`);
if (v.out) { fs.mkdirSync(path.dirname(v.out), { recursive: true }); fs.writeFileSync(v.out, JSON.stringify(result, null, 1)); console.log(`wrote ${v.out}`); }
