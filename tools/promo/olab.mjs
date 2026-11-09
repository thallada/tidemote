// Offline, frame-exact filming of the page for the promo library: the page on a fake clock (Playwright page.clock)
// that moves exactly 1/60 s a frame; each frame the GPU is waited on and the composited page is screenshot at device
// scale `scale` and piped to ffmpeg in WSL (near-lossless x264, or HEVC on the GPU for 8K). The soundtrack's messages are
// logged on the same clock, so they line up with the frames (master.mjs places them under the track). Run the filming
// scripts (shoot, ui, notes, hand, pick) under tools/gpu-node.sh from WSL: Windows Chrome on the GPU.
// Each shot: NAME.mp4 and NAME.json (meta, the world, every frame's camera and sim time and the tracked panels' rects,
// the sound); each world: world.json (its climate, count, and the build filmed: its commit, and whether main has it).
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { LIB } from './paths.mjs';
export { aim } from '../pagelab.mjs';
export { cliArgs } from './paths.mjs';
// WSL paths for the ffmpeg run in WSL, Windows paths for this (Windows) Node
export const winPath = (p) => (process.platform === 'win32' ? String(p).replace(/^\/mnt\/([a-z])\//, (_, d) => `${d.toUpperCase()}:/`) : p);
export const MEDIA = LIB;
export const S = (s) => Math.round(s * 60);
export const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** A shot's actions by frame ([[f, fn]...]) as its `each`. */
export const timeline = (acts) => { const at = new Map(); for (const [f, a] of acts) at.set(f, [...(at.get(f) || []), a]); return async (f) => { for (const a of at.get(f) || []) await a(); }; };

// the build a page file is: its commit, and whether main has it (the library's shots come from main)
function buildOf(html) {
  const dir = path.dirname(path.resolve(html)), win = process.platform === 'win32';
  const r = spawnSync(win ? 'wsl.exe' : 'sh', [...(win ? ['-e', 'sh'] : []), '-c', 'd=$(wslpath -u "$1" 2>/dev/null || echo "$1"); git -C "$d" log -1 --format=%h; git -C "$d" merge-base --is-ancestor HEAD main && echo main', 'sh', dir], { encoding: 'utf8' });
  const [sha, main] = r.stdout.trim().split('\n');
  return main === 'main' ? `main ${sha}` : `unmerged ${sha || '?'}`;
}

export async function openOffline({ html = 'dist/tidemote.html', notes = 0, k = '{}', n = 0, mature = 300, out = MEDIA + '/o1', ui = false, scale = 2, crf = 10, vw = 1920, vh = 1080, track = [], hevc = false, world = {} }) {
  fs.mkdirSync(winPath(out), { recursive: true });
  const file = path.resolve(html);
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(file).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'off-')), {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true,
    viewport: { width: +vw, height: +vh }, deviceScaleFactor: +scale, args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required'] });
  const page = ctx.pages()[0];
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[console] ${m.text().slice(0, 300)}`); });
  await page.clock.install();
  await page.addInitScript(() => {
    // requestAnimationFrame owned (after the fake clock's): passed through in natural time; while frames are
    // stepped, queued and run once a step with an exact timestamp (the fake clock keeps whole milliseconds)
    const orig = window.requestAnimationFrame.bind(window), q = [];
    window.__own = false;
    // once the world is grown (window.__fast), every frame, stepped or natural, runs as if the GPU kept up: else between
    // shots the page re-measures the real 4K cost and caps the speed, turning a chosen speed into Max
    const hold = () => {
      const T = globalThis.__tidemote; if (!window.__fast || !T) return;
      const p = T.perf;
      p.slow = 1; p.lastAdjust = performance.now(); p.frameDt.length = 0; p.stepCredit = 1e9; p.worldAt = -1e9;
      p.rafMs = 1000 / 60; p.rafLonger = 0; p.simS = 0.001; p.stepMs = 0.001; p.renderR = 0.01; p.presentR = 0.01; p.ticksAt = -1e9;
      if (window.__speed != null && T.state.speed !== window.__speed) T.setSpeed(window.__speed);
    };
    window.__hold = hold;
    window.requestAnimationFrame = (cb) => { if (window.__own) { q.push(cb); return 1e6 + q.length; } return orig((ts) => { hold(); cb(ts); }); };
    // CSS transitions and animations (panels sliding, the pointer's click rings) kept on the same stepped clock:
    // each is paused and set to its time on this clock, so they move a frame's worth a frame however slow the render
    window.__frame = (t) => {
      const cbs = q.splice(0); for (const cb of cbs) cb(t);
      for (const a of document.getAnimations()) {
        if (a.__vt0 == null) { a.__vt0 = t - (a.currentTime || 0); a.pause(); }
        a.currentTime = t - a.__vt0;
        // a paused animation never finishes on its own (its onfinish never fires): finish it at its end
        const end = a.effect?.getComputedTiming().endTime;
        if (Number.isFinite(end) && a.currentTime >= end) a.finish();
      }
      return cbs.length;
    };
    window.__release = () => { window.__own = false; for (const cb of q.splice(0)) orig(cb); for (const a of document.getAnimations()) if (a.__vt0 != null) { a.__vt0 = null; a.play(); } };
  });
  await page.addInitScript(({ n, notes }) => {
    if (!sessionStorage.getItem('tm-init')) {
      sessionStorage.setItem('tm-init', '1');
      localStorage.setItem('tidemote.view', JSON.stringify({ v: 5, particles: n || null, auto: false, labOpen: false, trails: 1, density: 2, scale: 1, notes, ui: true }));
      localStorage.setItem('tidemote.sound', JSON.stringify({ on: true, volume: 0 }));
    }
    globalThis.__snd = [];
    const post = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (m, tr) {
      if (m && (m.type === 'listen' || m.type === 'slots' || m.type === 'world')) {
        const c = { ...m }; if (c.ev) c.ev = Array.from(c.ev, (x) => Math.round(x * 1e4) / 1e4);
        if (c.slots) c.slots = c.slots.map((s) => ({ ...s }));
        globalThis.__snd.push({ wall: performance.now(), sim: globalThis.__tidemote?.eng.simTime ?? 0, msg: c });
        if (globalThis.__snd.length > 20000) globalThis.__snd.splice(0, 10000);
      }
      return post.call(this, m, tr);
    };
  }, { n: +n, notes: +notes });
  if (ui) await page.addInitScript(() => {
    // a pointer drawn into the page (headless screenshots have none), with a ring on each press
    addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '#__ptr{position:fixed;left:0;top:0;width:26px;height:26px;pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))}'
        + '.__ring{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border:2px solid #7fd6df;border-radius:50%;pointer-events:none;z-index:2147483646;box-shadow:0 0 14px #7fd6df}';
      document.head.append(st);
      const p = document.createElement('div'); p.id = '__ptr';
      p.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26"><path d="M3 2 L3 21 L8.2 16.3 L11.6 24 L15 22.5 L11.7 15 L19 15 Z" fill="#f4fbfa" stroke="#06090b" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      document.body.append(p);
      addEventListener('pointermove', (e) => { p.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
      addEventListener('pointerdown', (e) => {
        const r = document.createElement('div'); r.className = '__ring'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.append(r);
        r.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => r.remove();
      }, true);
    });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#k=${encodeURIComponent(k)}`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
  await page.mouse.move(vw / 2, vh / 2); await page.mouse.wheel(0, 100); await page.mouse.move(vw - 1, 1);
  // clean shots: nothing but the world
  if (!ui) await page.addStyleTag({ content: 'body > *:not(#stage){display:none!important}' });
  await page.evaluate((ui) => { const T = globalThis.__tidemote; T.setScale(1); T.setEffects('high'); T.hand.set('none'); if (!ui) { T.state.hud = false; T.state.loupe = false; } T.eng.survey = { every: 45 }; }, ui);
  const T = (f, a) => page.evaluate(f, a);
  const simTime = () => T(() => globalThis.__tidemote.eng.simTime);
  const setSpeed = (s) => T((s) => { window.__speed = s === Infinity ? null : s; globalThis.__tidemote.setSpeed(s); }, s);
  const evalCode = (code) => T((code) => { const T = globalThis.__tidemote; return eval(code); }, code);
  // natural time (between shots): the clock runs on its own
  let paused = false, ms = 0;
  let tBase = 0;
  const natural = async () => { if (paused) { await T(() => window.__release()); await page.clock.resume(); paused = false; } };
  const freeze = async () => {
    if (paused) return;
    // pause a little ahead of the page's clock (retrying further ahead if the clock has already passed that point)
    for (let ahead = 50; ; ahead *= 4) { const t = await T(() => Date.now()); try { await page.clock.pauseAt(t + ahead); break; } catch (e) { if (ahead > 5000) throw e; } }
    paused = true; ms = 0;
    tBase = await T(() => { window.__own = true; return performance.now(); }); fn0 = fn;
  };
  const wait = async (s) => { await natural(); await page.waitForTimeout(s * 1000); };
  // one frame of exactly 1/60 s (the clock frozen), the GPU done before it returns
  let fn = 0; const camLog = [];
  // every await bounded: a stage that hangs is named, and the frame goes on without it
  const within = (p, s, what) => { let tm; const at = fn; return Promise.race([p, new Promise((r) => { tm = setTimeout(() => { console.log(`[watchdog] ${what} took over ${s} s (frame ${at})`); r('timeout'); }, s * 1000); })]).finally(() => clearTimeout(tm)); };
  let fn0 = 0;
  const step = async () => {
    fn++; const k = fn - fn0, exact = tBase + (k * 1000) / 60, d = Math.round(exact) - Math.round(tBase + ((k - 1) * 1000) / 60);
    // timers move on with the (whole millisecond) clock; then exactly one frame, at the exact time
    await within(page.clock.runFor(d), 20, 'clock');
    // offline every frame is drawn in full, as if the GPU kept up: the page's real-time adaptation (perf.slow: every
    // 2nd-4th frame at 4K), fast speeds' step budget (from measured GPU time) and their drawing the world only every
    // few frames are held off
    const cam = await T(([exact, track]) => {
      const T = globalThis.__tidemote;
      // a 60 Hz display, and a GPU that keeps up (tiny step and draw costs): every speed runs in 1/60 s ticks, all
      // of them each frame, the world drawn every frame
      window.__hold();
      const c = [T.cam.x, T.cam.y, T.cam.zoom, T.eng.simTime];
      const ran = window.__frame(exact);
      // where the tracked parts of the page are (css px), for the edit's virtual camera
      const rects = {};
      for (const sel of track) { const el = document.querySelector(sel); if (!el) continue; const r = el.getBoundingClientRect(); if (r.width && r.height && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none') rects[sel] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); }
      return [...c, ran, rects];
    }, [exact, track]);
    camLog.push(cam);
    await within(T(() => Promise.race([globalThis.__tidemote.eng.device.queue.onSubmittedWorkDone(), new Promise((r) => setTimeout(r, 5000))])), 20, 'gpu');
  };
  const cdp = await ctx.newCDPSession(page);
  const stats = () => T(() => { const T = globalThis.__tidemote; return { count: T.eng.count, scale: T.renderScale(), sim: +T.eng.simTime.toFixed(2) }; });
  await setSpeed(Infinity);
  while (await simTime() < +mature) await page.waitForTimeout(500);
  await setSpeed(1);
  await T(() => { window.__fast = true; });
  await page.waitForTimeout(2000);
  fs.writeFileSync(winPath(`${out}/world.json`), JSON.stringify({ climate: await T(() => globalThis.__tidemote.climate().name), count: await T(() => globalThis.__tidemote.eng.count), mature: +mature, ui, build: buildOf(html), ...world }));
  /**
   * Render a shot: `pre` frames stepped unrecorded (trails building, the camera settling), then `frames` recorded;
   * `each(f)` runs before every frame (camera moves, speed ramps, UI actions). Writes NAME.mp4 and NAME.json
   * (frame times on the fake clock, sound messages, stats) into out.
   */
  const shot = async (name, frames, { pre = 0, each = null, setup = null, meta = {} } = {}) => {
    pre = Math.max(pre, 12); // the switch to stepped frames settles over a few frames
    if (setup) await setup();
    await freeze();
    await T(() => { const T = globalThis.__tidemote; T.sound.reset(T.climate().music); });
    for (let f = 0; f < pre; f++) { if (each) await each(f - pre); await step(); }
    await T(() => { globalThis.__snd.length = 0; });
    camLog.length = 0;
    const t0 = await T(() => performance.now()), sim0 = await simTime(), s0 = await stats(), wallStart = Date.now();
    const enc = spawn('wsl.exe', ['-e', 'ffmpeg', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '60', '-i', '-', ...(hevc ? ['-c:v', 'hevc_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'constqp', '-qp', '12'] : ['-c:v', 'libx264', '-preset', 'fast', '-crf', String(crf)]),
      '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', `${out}/${name}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = 0; f < frames; f++) {
      if (each) await each(f);
      await step();
      const s = await within(cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 96, optimizeForSpeed: true, clip: { x: 0, y: 0, width: +vw, height: +vh, scale: +scale } }), 30, 'screenshot');
      if (s === 'timeout') { console.log('[watchdog] screenshot lost; shot ends'); break; }
      if (!enc.stdin.write(Buffer.from(s.data, 'base64'))) await new Promise((r) => enc.stdin.once('drain', r));
    }
    enc.stdin.end();
    const done = new Promise((r) => enc.on('close', r));
    const snd = await T(() => globalThis.__snd.splice(0));
    const t1 = await T(() => performance.now()), s1 = await stats();
    await done;
    const world = await T(() => { const T = globalThis.__tidemote, c = T.climate(); return { climate: c.name, era: c.history?.at(-1)?.name, event: c.event ? { type: c.event.type, age: +(T.eng.simTime - (c.event.t0 ?? c.event.at ?? T.eng.simTime)).toFixed(1) } : null, season: T.eng.season, species: T.life().reg?.size }; }).catch(() => ({}));
    fs.writeFileSync(winPath(`${out}/${name}.json`), JSON.stringify({ meta, world, t0, t1, fps: 60, frames, vw: +vw, vh: +vh, scale: +scale, sim0, sim1: await simTime(), stats: [s0, s1], cam: camLog.slice(-frames), snd }));
    await natural(); // time flows between shots (picks and readbacks happen in frames)
    console.log(`[shot] ${name} ${frames} frames (+${pre}) in ${((Date.now() - wallStart) / 1000).toFixed(0)} s, sim ${sim0.toFixed(1)}→${s1.sim}, n ${s1.count}`);
  };

  // ── what the filming scripts share ──
  /** n spots (world units) at the director's most interesting tiles for `key` (kills, births, bodies, diverse, dense,
   * swift, total), a few tiles apart, each a little off the tile's centre; random ones if there are too few. */
  const spots = (n, key = 'total') => T(([n, key]) => {
    const T = globalThis.__tidemote, I = T.director.interest, g = T.eng.grid;
    if (!I.n) return Array.from({ length: n }, () => [Math.random() * g[0], Math.random() * g[1]]);
    const p = I.parts(), sc = p[key] || p.total, idx = [...sc.keys()].sort((a, b) => sc[b] - sc[a]), out = [];
    for (const i of idx) {
      const c = I.center(i);
      if (out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) > I.tile * 3)) out.push([c[0] + (Math.random() - 0.5) * I.tile * 0.5, c[1] + (Math.random() - 0.5) * I.tile * 0.5]);
      if (out.length >= n) break;
    }
    while (out.length < n) out.push([Math.random() * g[0], Math.random() * g[1]]);
    return out;
  }, [n, key]);
  /** How good a view at spot s and zoom z will look: the share of a 10x6 grid holding life (its middle counting
   * double), with at least `cells` living cells and eight species for full marks. */
  const rate = (s, z, cells = 80) => T(async ([s, z, cells]) => {
    const T = globalThis.__tidemote, hw = innerWidth / 2 / z, hh = innerHeight / 2 / z;
    const res = await T.eng.requestPick(s, Math.hypot(hw, hh), 0xffffffff, { maxOut: 1e6 });
    if (!res) return 0;
    const W = T.eng.grid[0], H = T.eng.grid[1], wrap = (d, L) => d - L * Math.round(d / L);
    const occ = new Set(), kinds = new Set(); let n = 0;
    for (const e of res.entries) {
      if (e.kind < 5) continue;
      const dx = wrap(e.x - s[0], W), dy = wrap(e.y - s[1], H);
      if (Math.abs(dx) > hw || Math.abs(dy) > hh) continue;
      n++; kinds.add(e.kind); occ.add(Math.min(9, Math.floor((dx + hw) / (2 * hw) * 10)) + 10 * Math.min(5, Math.floor((dy + hh) / (2 * hh) * 6)));
    }
    let got = 0, all = 0;
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 10; gx++) { const w = gx >= 3 && gx <= 6 && gy >= 2 && gy <= 3 ? 2 : 1; all += w; if (occ.has(gx + 10 * gy)) got += w; }
    return (got / all) * Math.min(1, n / cells) * (0.5 + 0.5 * Math.min(1, kinds.size / 8));
  }, [s, z, cells]);
  /** The best n spots for `keys` at zoom z, by rate, a screen apart and away from `avoid` (spots already used); each
   * carries its rating as .r. */
  const bestSpots = async (n, z, keys = ['total', 'kills', 'births', 'bodies', 'diverse', 'dense'], { avoid = [], cells = 80 } = {}) => {
    const scored = [];
    for (const key of keys) for (const c of await spots(6, key)) if (avoid.every((a) => Math.hypot(a[0] - c[0], a[1] - c[1]) > 30)) scored.push({ c, r: await rate(c, z, cells) });
    scored.sort((a, b) => b.r - a.r);
    const best = [];
    for (const o of scored) { if (best.every((p) => Math.hypot(p.c[0] - o.c[0], p.c[1] - o.c[1]) > 1600 / z)) best.push(o); if (best.length >= n) break; }
    return best.map((o) => Object.assign(o.c, { r: o.r }));
  };
  /** The living cells in view, in css px: id, kind, x, y, speed. */
  const cellsInView = () => T(async () => {
    const T = globalThis.__tidemote, c = [T.cam.x, T.cam.y], fit = Math.max(innerWidth / T.eng.grid[0], innerHeight / T.eng.grid[1]), z = T.cam.zoom * fit;
    const res = await T.eng.requestPick(c, Math.hypot(innerWidth, innerHeight) / 2 / z, 0xffffffff, { maxOut: 1e6 });
    if (!res) return [];
    return res.entries.filter((e) => e.kind >= 5).map((e) => ({ id: e.id, x: innerWidth / 2 + (e.x - c[0]) * z, y: innerHeight / 2 + (e.y - c[1]) * z, kind: e.kind, sp: Math.hypot(e.vx, e.vy) }))
      .filter((e) => e.x > 40 && e.y > 40 && e.x < innerWidth - 40 && e.y < innerHeight - 40);
  });
  const esc = async (n = 3) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await wait(0.15); } };
  /** The Field Lab open or shut. */
  const lab = async (on) => { if ((await page.evaluate(() => document.body.classList.contains('lab-open'))) !== on) { await page.keyboard.press('k'); await wait(1); } };
  /** Nothing open, nothing in hand, no auto camera, no notes: the page as a still subject. */
  const calm = async () => {
    await esc(); await lab(false);
    await T(() => { const t = globalThis.__tidemote; t.state.loupe = false; t.hand.set('none'); t.state.auto = false; if (t.director.active) t.director.stop?.(); t.state.notes = 0; });
  };
  /** The pointer moved eased from `from` to `to` over frames f0 to f0 + n (a shot's actions), or along points `pts`. */
  const glide = (f0, n, from, to) => Array.from({ length: n }, (_, i) => { const e = ease((i + 1) / n); return [f0 + i, () => page.mouse.move(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e)]; });
  const stroke = (f0, n, pts) => { const seg = n / (pts.length - 1), out = []; for (let k = 0; k + 1 < pts.length; k++) out.push(...glide(Math.round(f0 + k * seg), Math.round(seg), pts[k], pts[k + 1])); return out; };
  return { ctx, page, T, simTime, setSpeed, evalCode, wait, natural, freeze, step, shot, spots, rate, bestSpots, cellsInView, esc, lab, calm, glide, stroke, close: async () => { await ctx.close(); server.close(); } };
}
