// Film cells up close where things happen (births, deaths, kills, cysts), from one saved world, so a
// build before and after a change can be compared on the same moment.
//   tools/gpu-node.sh tools/anim/film.mjs --world w1 [--n 262144 --mature 90] --out runs/anim/out/NAME
//     [--zoom 450] [--secs 6] [--speed 1] [--spots 3] [--target events|births|deaths|kills|cysts] [--k '{}'] [--pre 2]
//     [--target plantbirths|grazed] [--hunt births|deaths|kills|grazed|cysts|wakes|eaten|novel --hold 3 --photo 1]
// The world is grown at Max the first time and kept as runs/anim/worlds/NAME.bin. Each spot's frames go to
// OUT/spotN with times.json and events.json (what changed in view, where on screen and when: births,
// deaths, cysts, wakes, eaten husks, bites and gulps); tools/anim/crop.mjs cuts strips around them.
// --hunt instead jumps the camera to each fresh event as it happens and follows the cell (OUT/hunt,
// jumps.json; tools/anim/hcrop.mjs): a cell first seen at the jump has no record of its life before, so
// deaths and kills are better filmed in place. tools/anim/sheet.sh tiles frames into a contact sheet.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));
const v = { world: 'w1', n: 262144, mature: 90, out: 'runs/anim/out/x', zoom: 450, secs: 6, speed: 1, spots: 3, target: 'events', k: '{}', pre: 2, w: 1200, h: 800, html: 'dist/tidemote.html', ...args };
const root = path.resolve('.');
const worldDir = path.join(root, 'runs/anim/worlds');
fs.mkdirSync(worldDir, { recursive: true });
fs.mkdirSync(v.out, { recursive: true });
const html = path.resolve(v.html);
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'PUT') { const f = fs.createWriteStream(path.join(worldDir, path.basename(url))); req.pipe(f); f.on('finish', () => { res.writeHead(200); res.end(); }); return; }
  const file = url.startsWith('/worlds/') ? path.join(worldDir, path.basename(url)) : html;
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'anim-')), {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, viewport: null,
  args: [`--window-size=${v.w},${v.h}`, '--window-position=0,0', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0];
page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || /WGSL|shader/i.test(m.text())) console.log(`[console ${m.type()}] ${m.text().slice(0, 600)}`); });
await page.addInitScript((n) => {
  if (sessionStorage.getItem('tm-init')) return;
  sessionStorage.setItem('tm-init', '1');
  localStorage.setItem('tidemote.view', JSON.stringify({ v: 2, particles: n, auto: false, labOpen: false, trails: 0 }));
  localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
}, +v.n);
await page.goto(`${base}/#k=${encodeURIComponent(v.k)}`);
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
await page.keyboard.press('Shift');
await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
await page.mouse.move(v.w / 2, v.h / 2); await page.mouse.wheel(0, 100); // the camera is ours, not the director's
await page.addStyleTag({ content: '#dock,#floats,#hud,#flash,#caption,#feed,#lab,.rail{display:none!important}' }); await page.mouse.move(v.w - 2, 2); // no UI, pointer out of the way

const file = `${v.world}.bin`;
if (fs.existsSync(path.join(worldDir, file))) {
  await page.evaluate(async (url) => {
    const T = globalThis.__tidemote;
    const buf = await (await fetch(url)).arrayBuffer();
    const head = new Uint32Array(buf, 0, 1)[0];
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, head)));
    const gpu = {};
    let at = 4 + head;
    for (const [k, size] of meta.sizes) { gpu[k] = buf.slice(at, at + size); at += size; }
    T.loadWorld({ cpu: meta.cpu, gpu });
  }, `${base}/worlds/${file}`);
  console.log(`opened ${file}`);
} else {
  console.log(`growing ${v.n} particles at Max for ${v.mature} s`);
  await page.evaluate(() => globalThis.__tidemote.setSpeed(Infinity));
  await page.waitForTimeout(+v.mature * 1000);
  const info = await page.evaluate(async (url) => {
    const T = globalThis.__tidemote;
    T.setSpeed(1);
    const s = await T.eng.readState();
    const cpu = Object.fromEntries(Object.entries(s.cpu).map(([k, x]) => [k, ArrayBuffer.isView(x) ? Array.from(x) : x]));
    const sizes = Object.entries(s.gpu).map(([k, b]) => [k, b.byteLength]);
    const head = new TextEncoder().encode(JSON.stringify({ cpu, sizes }));
    await fetch(url, { method: 'PUT', body: new Blob([new Uint32Array([head.length]), head, ...Object.values(s.gpu)]) });
    return { simTime: T.eng.simTime };
  }, `${base}/worlds/${file}`);
  console.log(`saved ${file} at ${info.simTime.toFixed(0)} sim s`);
}
await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
await page.waitForTimeout(+v.pre * 1000);

// Places where events happen: newborns, fresh husks (by cause), cysts, scored per patch of the world.
const spots = await page.evaluate(async ([target, want]) => {
  const T = globalThis.__tidemote, eng = T.eng;
  const [W, H] = eng.grid;
  const res = await eng.requestPick([W / 2, H / 2], Math.hypot(W, H), 0xffffffff, { maxOut: eng.count, raw: true });
  const { u32, f32, count } = res.raw, PW = 12;
  const photo = new Map();
  for (const sp of T.life().reg.values()) if (sp.alive) photo.set(sp.slot, sp.genome.photo);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const kind = u32[i * PW + 4], age = f32[i * PW + 6], info = u32[i * PW + 9], cause = info & 15;
    const x = f32[i * PW], y = f32[i * PW + 1];
    let w = 0;
    const birth = kind >= 5 && cause === 9 && age < 3, cyst = kind >= 5 && cause === 14, dead = kind === 2 && age < 3 && cause !== 11;
    const kill = kind === 2 && age < 3 && cause === 3 && !(info & 0x8000);
    if (target === 'births') w = birth ? 1 : 0;
    else if (target === 'plantbirths') w = birth && photo.get(kind) > 0.4 ? 1 : 0;
    else if (target === 'deaths') w = dead ? 1 : 0;
    else if (target === 'kills') w = kill ? 1 : 0;
    else if (target === 'cysts') w = cyst ? 1 : 0;
    else if (target === 'grazed') w = kind === 2 && age < 3 && cause === 3 && (info & 0x8000) ? 1 : 0;
    else w = (birth ? 1 : 0) + (dead ? 2 : 0) + (cyst ? 0.5 : 0) + (kill ? 3 : 0);
    if (w) pts.push([x, y, w]);
  }
  const cell = +(globalThis.__cell || 1.0), score = new Map();
  for (const [x, y, w] of pts) { const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`; score.set(key, (score.get(key) || 0) + w); }
  const best = [...score].sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [key, s] of best) {
    const [cx, cy] = key.split(',').map((q) => (+q + 0.5) * cell);
    if (out.every((o) => Math.hypot(o.x - cx, o.y - cy) > 5)) out.push({ x: cx, y: cy, score: s });
    if (out.length >= want) break;
  }
  return out;
}, [v.target, +v.spots]);
console.log('spots', JSON.stringify(spots));

const cdp = await ctx.newCDPSession(page);
if (v.hunt) {
  // Hunt: from the first spot, jump the camera to each fresh event of this kind as it happens (births,
  // deaths, kills, cysts, wakes), hold it there for --hold real seconds, and log each jump.
  const s0 = spots[0];
  await page.evaluate(([x, y, ppu, sp]) => { const T = globalThis.__tidemote, fit = Math.max(innerWidth / T.eng.grid[0], innerHeight / T.eng.grid[1]); T.cam.x = x; T.cam.y = y; T.cam.anchor = null; T.cam.zoom = T.cam.zoomTarget = ppu / fit; T.setSpeed(sp); }, [s0.x, s0.y, +v.zoom, +v.speed]);
  await page.waitForTimeout(800);
  const dir = path.join(v.out, 'hunt'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const times = [];
  const onFrame = (e) => { times.push(e.metadata.timestamp); fs.writeFileSync(path.join(dir, `f${String(times.length).padStart(4, '0')}.jpg`), Buffer.from(e.data, 'base64')); cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); };
  cdp.on('Page.screencastFrame', onFrame);
  await page.evaluate(([hunt, hold, photoOnly]) => {
    const T = globalThis.__tidemote, eng = T.eng;
    const photo = new Map();
    for (const sp of T.life().reg.values()) if (sp.alive) photo.set(sp.slot, sp.genome.photo);
    T._jumps = []; T._huntOn = true; T._seenH = new Map();
    let until = 0, home = [T.cam.x, T.cam.y];
    const poll = async () => {
      if (!T._huntOn) return;
      const res = await eng.requestPick(home, 8, 0xffffffff, { maxOut: 60000, raw: true });
      const now = Date.now() / 1000;
      if (res && res.raw && now > until) {
        const { u32, f32, count } = res.raw, PW = 12;
        let best = null;
        const kinds = new Map();
        for (let i = 0; i < count; i++) { const k = u32[i * PW + 4]; kinds.set(k, (kinds.get(k) || 0) + 1); }
        for (let i = 0; i < count; i++) {
          const kind = u32[i * PW + 4], age = f32[i * PW + 6], id = u32[i * PW + 7], info = u32[i * PW + 9], cause = info & 15;
          const st = kind >= 5 ? (cause === 14 ? 'cyst' : 'live') : kind === 2 ? 'husk' : kind === 0 ? 'silt' : 'o';
          const was = T._seenH.get(id); T._seenH.set(id, st);
          if (age > 0.06 || was === st) continue;
          const ok = hunt === 'births' ? st === 'live' && cause === 9 && was === undefined && (!photoOnly || photo.get(kind) > 0.4)
            : hunt === 'wakes' ? st === 'live' && was === 'cyst'
            : hunt === 'cysts' ? st === 'cyst' && was === 'live'
            : hunt === 'deaths' ? st === 'husk' && was === 'live' && cause !== 3
            : hunt === 'kills' ? st === 'husk' && was === 'live' && cause === 3 && !(info & 0x8000)
            : hunt === 'grazed' ? st === 'husk' && was === 'live' && cause === 3 && !!(info & 0x8000)
            : hunt === 'eaten' ? st === 'silt' && was === 'husk'
            : hunt === 'novel' ? st === 'live' && was === undefined && (cause === 8 || (cause === 9 && kinds.get(kind) === 1)) : false;
          if (ok) { best = { x: f32[i * PW], y: f32[i * PW + 1], id, kind, cause }; break; }
        }
        if (best) { T.cam.x = best.x; T.cam.y = best.y; T._jumps.push({ t: now, ...best }); until = now + hold; T._follow = best.id; }
      } else if (res && res.raw && T._follow != null) {
        // follow it while holding
        const { u32, f32, count } = res.raw, PW = 12;
        for (let i = 0; i < count; i++) if (u32[i * PW + 7] === T._follow) { T.cam.x += (f32[i * PW] - T.cam.x) * 0.5; T.cam.y += (f32[i * PW + 1] - T.cam.y) * 0.5; break; }
      }
      setTimeout(poll, 50);
    };
    poll();
  }, [v.hunt, +v.hold || 2.5, !!v.photo]);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: v.w, maxHeight: v.h, everyNthFrame: 1 });
  await page.waitForTimeout(+v.secs * 1000);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  const jumps = await page.evaluate(() => { const T = globalThis.__tidemote; T._huntOn = false; return T._jumps; });
  fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify(times));
  fs.writeFileSync(path.join(dir, 'jumps.json'), JSON.stringify(jumps));
  console.log(`hunt: ${jumps.length} ${v.hunt}, ${times.length} frames`);
  await ctx.close(); server.close(); process.exit(0);
}
for (const [n, s] of spots.entries()) {
  await page.evaluate(([x, y, ppu]) => { const T = globalThis.__tidemote, fit = Math.max(innerWidth / T.eng.grid[0], innerHeight / T.eng.grid[1]); T.cam.x = x; T.cam.y = y; T.cam.anchor = null; T.cam.zoom = T.cam.zoomTarget = ppu / fit; }, [s.x, s.y, +v.zoom]);
  await page.evaluate((sp) => globalThis.__tidemote.setSpeed(sp), +v.speed);
  await page.waitForTimeout(1200);
  const dir = path.join(v.out, `spot${n}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const times = [];
  const onFrame = (e) => { times.push(e.metadata.timestamp); fs.writeFileSync(path.join(dir, `f${String(times.length).padStart(4, '0')}.jpg`), Buffer.from(e.data, 'base64')); cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); };
  cdp.on('Page.screencastFrame', onFrame);
  // log what happens in view: each particle's first sighting in a fresh state (newborn or woken,
  // just dead, just encysted, just eaten), with where it is on screen and when (wall clock, as frames)
  await page.evaluate(() => {
    const T = globalThis.__tidemote, eng = T.eng;
    T._ev = []; T._seen = new Map(); T._evOn = true; T._en = new Map();
    const photo = new Map();
    for (const sp of T.life().reg.values()) if (sp.alive) photo.set(sp.slot, sp.genome.photo);
    const poll = async () => {
      if (!T._evOn) return;
      const fit = Math.max(innerWidth / eng.grid[0], innerHeight / eng.grid[1]), ppu = fit * T.cam.zoom;
      const r = Math.hypot(innerWidth, innerHeight) / 2 / ppu;
      const res = await eng.requestPick([T.cam.x, T.cam.y], r, 0xffffffff, { maxOut: 20000, raw: true });
      const now = Date.now() / 1000;
      if (res && res.raw) {
        const { u32, f32, count } = res.raw, PW = 12, [W, H] = eng.grid;
        for (let i = 0; i < count; i++) {
          const kind = u32[i * PW + 4], age = f32[i * PW + 6], id = u32[i * PW + 7], info = u32[i * PW + 9], cause = info & 15;
          const state = kind >= 5 ? (cause === 14 ? 'cyst' : 'live') : kind === 2 ? 'husk' : kind === 0 ? 'silt' : 'other';
          const key = `${state}`;
          const was = T._seen.get(id);
          T._seen.set(id, key);
          if (state === 'live') {
            const e0 = T._en.get(id), e = f32[i * PW + 5];
            T._en.set(id, e);
            const ph = photo.get(kind) ?? 0;
            const ev = e0 == null ? null : ph > 0.4 && e0 - e > 0.3 ? 'bite' : ph <= 0.4 && e - e0 > 0.2 ? 'gulp' : null;
            if (ev) {
              const dx = ((f32[i * PW] - T.cam.x) % W + 1.5 * W) % W - W / 2, dy = ((f32[i * PW + 1] - T.cam.y) % H + 1.5 * H) % H - H / 2;
              T._ev.push({ t: now, id, state: ev, kind, sx: innerWidth / 2 + dx * ppu, sy: innerHeight / 2 + dy * ppu, ppu });
            }
          }
          if (was === key || age > 0.5 || state === 'other') continue;
          if (state === 'silt' && was !== 'husk') continue;
          const dx = ((f32[i * PW] - T.cam.x) % W + 1.5 * W) % W - W / 2, dy = ((f32[i * PW + 1] - T.cam.y) % H + 1.5 * H) % H - H / 2;
          T._ev.push({ t: now - age / Math.max(T.state.speed, 1e-3), id, state, was: was || null, cause, litter: !!(info & 0x8000), kind, sx: innerWidth / 2 + dx * ppu, sy: innerHeight / 2 + dy * ppu, ppu });
        }
      }
      setTimeout(poll, 100);
    };
    poll();
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: v.w, maxHeight: v.h, everyNthFrame: 1 });
  await page.waitForTimeout(+v.secs * 1000);
  await cdp.send('Page.stopScreencast');
  const events = await page.evaluate(() => { const T = globalThis.__tidemote; T._evOn = false; return T._ev; });
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));
  cdp.off('Page.screencastFrame', onFrame);
  const fps = (times.length - 1) / (times.at(-1) - times[0]);
  fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify(times));
  console.log(`spot${n}: ${times.length} frames at ${fps.toFixed(1)} fps`);
}
await ctx.close(); server.close();
