// Profile the page in a real browser on the real GPU: Windows Chrome driven by playwright-core,
// serving dist/ from here. Under WSL run it with tools/gpu-node.sh (Windows Node).
//
//   tools/gpu-node.sh tools/perf/bench.mjs --plan tools/perf/plans/zoom.json --out runs/perf/zoom.json
//
// A plan is { worlds: [{ name, n, mature }], scenarios: [{ name, world, zoom, ... }] }. A world of
// n particles is grown once at Max for `mature` real seconds, saved to runs/perf/worlds/NAME.bin and
// loaded again for every scenario on it (and on later runs: delete the file to grow a new one), so
// every scenario starts from the same moment of the same world. A scenario sets:
//   zoom   css px per world unit (cells resolve from about 35, interiors 150, fine detail 400), or 'fit'
//   speed  1 (default), 4, 'max' ...   fps: the target frame rate (0: the display's)
//   scale  'auto' (default) or a fixed render scale   select: pick a cell of the commonest species
//   sound  false (default)   seconds: how long to measure (default 8)   settle: seconds before (3)
//   prefs  more settings (eng.settings keys: bloom, optics, specks, lod, links, nodes, trails)
// Every frame's passes are timed on the GPU (eng.passProfile); the report has frame intervals,
// GPU time per frame and per pass, the page's own CPU time per frame and the render scale.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const { values: v } = parseArgs({ options: {
  plan: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' },
  width: { type: 'string', default: '2560' }, height: { type: 'string', default: '1440' },
  chrome: { type: 'string', default: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  dist: { type: 'string', default: 'dist' }, keep: { type: 'boolean' },
} });
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const plan = JSON.parse(fs.readFileSync(v.plan, 'utf8'));
const worldDir = path.join(root, 'runs/perf/worlds');
fs.mkdirSync(worldDir, { recursive: true });
const dist = path.resolve(root, v.dist);

// ---- a static server for the page and the saved worlds (PUT saves one)
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'PUT' && url.startsWith('/worlds/')) {
    const file = path.join(worldDir, path.basename(url));
    const out = fs.createWriteStream(file);
    req.pipe(out);
    out.on('finish', () => { res.writeHead(200); res.end('ok'); });
    return;
  }
  const file = url.startsWith('/worlds/') ? path.join(worldDir, path.basename(url))
    : url.startsWith('/pages/') ? path.join(root, 'runs/perf/pages', path.basename(url)) : path.join(dist, url === '/' ? 'tidemote.html' : url);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const W = +v.width, H = +v.height;
const userDir = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'tidemote-perf-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  executablePath: v.chrome, headless: false, viewport: null,
  args: [`--window-size=${W},${H}`, '--window-position=0,0', '--enable-webgpu-developer-features', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check'],
});
const report = { when: new Date().toISOString(), window: [W, H], worlds: {}, scenarios: [] };

async function openPage(n, extra = {}, k = null, init = null, html = null) {
  const page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(0);
  if (init) await page.addInitScript(init);
  await page.addInitScript(({ n, extra }) => {
    if (sessionStorage.getItem('tm-init')) return;
    sessionStorage.setItem('tm-init', '1');
    localStorage.setItem('tidemote.view', JSON.stringify({ particles: n ?? null, auto: false, labOpen: false, ...extra }));
    localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0.5 }));
  }, { n, extra });
  page.on('console', (m) => { if (m.type() === 'error' || /tidemote|perf/.test(m.text())) console.log(`  [page] ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
  await page.goto(`${base}/${html ? `pages/${html}.html` : 'tidemote.html'}${k ? `#k=${encodeURIComponent(JSON.stringify(k))}` : ''}`);
  await page.waitForFunction(() => globalThis.__tidemote && globalThis.__tidemote.state.phase === 'running', null, { polling: 250 });
  report.browser ??= await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    return { ua: navigator.userAgent, adapter: a.info && [a.info.vendor, a.info.architecture, a.info.description].join(' / '), wgsl: [...navigator.gpu.wgslLanguageFeatures], dpr: devicePixelRatio };
  });
  return page;
}

// grow a world at Max, or load the saved one
async function world(page, w) {
  const file = path.join(worldDir, `${w.file || w.name}.bin`);
  if (fs.existsSync(file)) {
    const t0 = Date.now();
    await page.evaluate(async (url) => {
      const T = globalThis.__tidemote;
      const buf = await (await fetch(url)).arrayBuffer();
      const head = new Uint32Array(buf, 0, 1)[0];
      const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, head)));
      const gpu = {};
      let at = 4 + head;
      for (const [k, size] of meta.sizes) { gpu[k] = buf.slice(at, at + size); at += size; }
      T.loadWorld({ cpu: meta.cpu, gpu });
    }, `${base}/worlds/${w.file || w.name}.bin`);
    console.log(`world ${w.name}: loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return;
  }
  console.log(`world ${w.name}: growing ${w.n} particles at Max for ${w.mature} s`);
  await page.evaluate(() => { const T = globalThis.__tidemote; T.state.paused = false; T.setSpeed(Infinity); });
  await page.waitForTimeout(w.mature * 1000);
  const info = await page.evaluate(async (url) => {
    const T = globalThis.__tidemote;
    T.setSpeed(1);
    const s = await T.eng.readState();
    const cpu = Object.fromEntries(Object.entries(s.cpu).map(([k, x]) => [k, ArrayBuffer.isView(x) ? Array.from(x) : x]));
    const sizes = Object.entries(s.gpu).map(([k, b]) => [k, b.byteLength]);
    const head = new TextEncoder().encode(JSON.stringify({ cpu, sizes }));
    const blob = new Blob([new Uint32Array([head.length]), head, ...Object.values(s.gpu)]);
    await fetch(url, { method: 'PUT', body: blob });
    const L = T.life();
    return { simTime: T.eng.simTime, living: L.counts[3], species: L.alive };
  }, `${base}/worlds/${w.name}.bin`);
  console.log(`world ${w.name}: saved at ${info.simTime.toFixed(0)} sim s, ${info.living} living, ${info.species} species`);
  report.worlds[w.name] = info;
}

// a step-only scenario: the simulation step dispatch by dispatch, every repetition from the same moment
async function stepBench(page, sc) {
  return page.evaluate(async (sc) => {
    const T = globalThis.__tidemote, { state, eng } = T;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    state.paused = true;
    await sleep(200);
    const keep = eng.snapshot(), per = {}, dt = (sc.ticks || 1) / 60;
    for (let i = 0; i < 3; i++) await eng.profileStep(dt);
    for (let r = 0; r < (sc.reps || 30); r++) {
      eng.restore(keep);
      for (const [k, ms] of await eng.profileStep(dt)) (per[k] ||= []).push(ms);
    }
    eng.restore(keep);
    for (const b of Object.values(keep.gpu)) b.destroy();
    state.paused = false;
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return +s[s.length >> 1].toFixed(4); };
    const dispatch = Object.fromEntries(Object.entries(per).map(([k, a]) => [k, med(a)]));
    return { name: sc.name, count: eng.count, living: T.life().counts[3], total: +Object.values(dispatch).reduce((a, b) => a + b, 0).toFixed(3), dispatch };
  }, sc);
}

// growth: a fresh world run at a speed, its step timed every `every` real seconds against its life
async function growth(page, sc) {
  return page.evaluate(async (sc) => {
    const T = globalThis.__tidemote, { state, eng } = T;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    T.setSpeed(sc.speed === 'max' ? Infinity : sc.speed ?? 1);
    const out = [], t0 = performance.now();
    while (performance.now() - t0 < sc.seconds * 1000) {
      await sleep((sc.every || 10) * 1000);
      state.paused = true; await sleep(100);
      const d = {};
      for (let i = 0; i < 3; i++) for (const [k, ms] of await eng.profileStep(1 / 60)) d[k] = (d[k] || 0) + ms / 3;
      state.paused = false;
      const L = T.life();
      out.push({ wall: Math.round((performance.now() - t0) / 1000), sim: Math.round(eng.simTime), living: L.counts[3], species: L.alive,
        step: +Object.values(d).reduce((a, b) => a + b, 0).toFixed(3), life: +d.lifeMain.toFixed(3) });
      console.log(`perf growth ${JSON.stringify(out.at(-1))}`);
    }
    return { name: sc.name, count: eng.count, growth: out };
  }, sc);
}

// one scenario: set it up, settle, measure
async function measure(page, sc) {
  if (sc.kind === 'step') return stepBench(page, sc);
  if (sc.kind === 'growth') return growth(page, sc);
  return page.evaluate(async (sc) => {
    const T = globalThis.__tidemote, { state, cam, perf, eng } = T;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    Object.assign(eng.settings, sc.prefs || {});
    state.perf.fps = sc.fps ?? 0;
    T.setScale(sc.scale ?? 'auto');
    // aim at the commonest species' densest patch (findMember follows it; unfollow unless selecting)
    const L = T.life();
    let top = null;
    for (const sp of L.reg.values()) if (sp.alive && (!top || sp.pop > top.pop)) top = sp;
    if (top) await T.findMember(top.serial);
    await sleep(300);
    if (!sc.select) { const c = { x: cam.x, y: cam.y }; T.deselect(); Object.assign(cam, c); }
    state.follow = !!sc.select;
    // zoom 1 fits the world to the window; sc.zoom is css px per world unit
    const ppuFit = Math.max(innerWidth / eng.grid[0], innerHeight / eng.grid[1]);
    const z = sc.zoom === 'fit' || sc.zoom == null ? 1 : Math.min(T.maxZoom(), Math.max(1, sc.zoom / ppuFit));
    cam.zoom = cam.zoomTarget = z; cam.anchor = null;
    if (sc.sound) { if (!T.sound.on) await T.sound.setOn(true); } else if (T.sound.on) await T.sound.setOn(false);
    T.setSpeed(sc.speed === 'max' ? Infinity : sc.speed ?? 1);
    await sleep((sc.settle ?? 3) * 1000);
    // ---- record
    const rec = { slow: [], raf: [], submits: [], encode: [], gpu: [], sim: [], steps: 0, passes: {}, passFrames: 0, scale: [], long: 0, longMs: 0 };
    const origFrame = eng.frame.bind(eng);
    rec.dts = [];
    eng.frame = (o) => { const t = performance.now(); if (rec.dts.length < 40) rec.dts.push([+o.simDt.toFixed(4), o.steps, o.paused ? 1 : 0]); origFrame(o); rec.encode.push(performance.now() - t); rec.submits.push(t); };
    eng.passProfile = true;
    rec.series = [];
    let t0 = performance.now();
    eng.onPassTimes = (times, f) => {
      if (rec.series.length < 90) rec.series.push([+(performance.now() - t0).toFixed(1), f.nSteps, +f.ms.toFixed(2)]);
      if (!(f.ms > 0 && f.ms < 1000)) return;
      rec.gpu.push(f.ms); rec.sim.push(f.simMs); rec.steps += f.nSteps; rec.passFrames++;
      for (const [name, ms] of times) rec.passes[name] = (rec.passes[name] || 0) + ms;
    };
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { rec.long++; rec.longMs += e.duration; } });
    try { po.observe({ type: 'longtask', buffered: false }); } catch { /* unsupported */ }
    let on = true;
    const tick = (t) => { if (!on) return; rec.raf.push(t); rec.scale.push(T.renderScale()); rec.slow.push(perf.slow || 1); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const sim0 = eng.simTime;
    t0 = performance.now();
    // a change made as recording starts (series: each frame's [ms since, steps, GPU ms])
    if (sc.then && sc.then.speed) T.setSpeed(sc.then.speed === 'max' ? Infinity : sc.then.speed);
    await sleep((sc.seconds ?? 8) * 1000);
    on = false;
    const wall = (performance.now() - t0) / 1000, simRate = (eng.simTime - sim0) / wall;
    eng.frame = origFrame; eng.passProfile = false; eng.onPassTimes = null; po.disconnect();
    // the simulation step dispatch by dispatch (paused around it, so frames don't interleave)
    const dispatch = {};
    if (sc.dispatch !== false) {
      const was = state.paused; state.paused = true; await sleep(100);
      for (let i = 0; i < 5; i++) for (const [k, ms] of await eng.profileStep(1 / 60)) dispatch[k] = (dispatch[k] || 0) + ms / 5;
      state.paused = was;
      for (const k in dispatch) dispatch[k] = +dispatch[k].toFixed(3);
    }
    // ---- summarise
    const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3); };
    const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null);
    const gaps = (a) => a.slice(1).map((x, i) => x - a[i]);
    const sub = gaps(rec.submits), raf = gaps(rec.raf);
    const passes = Object.fromEntries(Object.entries(rec.passes).sort((a, b) => b[1] - a[1]).map(([k, x]) => [k, +(x / Math.max(1, rec.passFrames)).toFixed(3)]));
    return {
      name: sc.name, zoom: sc.zoom ?? 'fit', ppu: +(eng.lastCam ? eng.lastCam.ppu : 0).toFixed(1), canvas: [eng.size[0], eng.size[1]],
      count: eng.count, living: T.life().counts[3], wall: +wall.toFixed(2), simRate: +simRate.toFixed(2),
      fps: +(sub.length / wall).toFixed(1), rafFps: +(raf.length / wall).toFixed(1),
      interval: { p50: q(sub, 0.5), p95: q(sub, 0.95), p99: q(sub, 0.99), max: q(sub, 1) },
      gpu: { mean: mean(rec.gpu), p50: q(rec.gpu, 0.5), p95: q(rec.gpu, 0.95), max: q(rec.gpu, 1) },
      sim: { mean: mean(rec.sim), stepsPerFrame: +(rec.steps / Math.max(1, rec.passFrames)).toFixed(2) },
      encodeMs: { mean: mean(rec.encode), p95: q(rec.encode, 0.95) },
      scale: { min: Math.min(...rec.scale), mean: mean(rec.scale), end: rec.scale.at(-1) }, slow: { mean: mean(rec.slow), end: rec.slow.at(-1), why: perf.why },
      longTasks: rec.long, longMs: Math.round(rec.longMs), passes, dispatch, series: sc.then ? rec.series : undefined, dts: rec.dts,
    };
  }, sc);
}

try {
  const only = v.only ? new RegExp(v.only) : null;
  for (const w of plan.worlds) {
    const scs = plan.scenarios.filter((s) => s.world === w.name && (!only || only.test(s.name)));
    if (!scs.length) continue;
    const page = await openPage(w.n, w.prefs, w.k, w.init, w.page);
    if (!report.shown) { report.shown = true; console.log(JSON.stringify(report.browser)); }
    if (!w.fresh) await world(page, w);
    for (const sc of scs) {
      const r = await measure(page, sc);
      report.scenarios.push({ world: w.name, ...r });
      if (sc.kind === 'growth') continue;
      if (sc.kind === 'step') { console.log(`${w.name}/${r.name}: step ${r.total} ms | ${JSON.stringify(r.dispatch)}`); continue; }
      const top = Object.entries(r.passes).slice(0, 4).map(([k, x]) => `${k} ${x}`).join(', ');
      console.log(`${w.name}/${r.name}: ${r.fps} fps (raf ${r.rafFps}), gpu ${r.gpu.mean} ms (p95 ${r.gpu.p95}), sim ${r.sim.mean} ms x${r.sim.stepsPerFrame}, enc ${r.encodeMs.mean} ms, scale ${r.scale.mean}, slow ${r.slow.end} ${r.slow.why || ''}, ppu ${r.ppu} | ${top}`);
      if (v.out) fs.writeFileSync(v.out, JSON.stringify(report, null, 2));
    }
    if (!v.keep) await page.close();
  }
} finally {
  if (v.out) fs.writeFileSync(v.out, JSON.stringify(report, null, 2));
  await ctx.close();
  server.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}
