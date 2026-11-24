// Film beating bodies before and after the will to beat (docs/growth.md, A beat at will): one saved world, opened once
// per mode (--modes, each a name and its #k tunables) and filmed at the same spots, where beating bodies crowd, for the
// same moments, the camera following the same beating bodies (by a cell's id: the bodies of the world as saved, some
// resting and some beating there, apart); tools/anim/willfilm.sh puts each body's films side by side.
//   tools/gpu-node.sh tools/anim/willfilm.mjs --world will1 [--n 131072 --mature 1800] --out runs/anim/will/NAME
//     [--zoom 200] [--secs 12] [--spots 4] [--speed 1] [--photo 1: producers' bodies only] [--modes '[["will",{}],["always",{"beatWill":0}]]']
// The world is grown at Max (with the default tunables) to --mature simulated seconds the first time and kept as
// runs/anim/worlds/NAME.bin. Each body's frames go to OUT/MODE/spotN with times.json and will.json (the followed body's
// beating cells each half second: how many rest, beat in part or in full by their will's bits, which only the will's mode
// sets, and its speed).
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
import { chromium } from 'playwright-core';
import { launchOptions, windowFlags } from '../lib/browser.mjs';
import { viewPrefs } from '../lib/prefs.mjs';
import { loadBinWorld, saveBinWorld } from '../lib/world.mjs';
import { cliArgs } from '../lib/args.mjs';

const args = cliArgs();
const v = { world: 'will1', n: 131072, mature: 1800, out: 'runs/anim/will/x', zoom: 200, secs: 12, spots: 4, pre: 3, speed: 1, photo: 0, w: 960, h: 720,
  html: 'dist/tidemote.html', modes: '[["will",{}],["always",{"beatWill":0}]]', ...args };
const modes = JSON.parse(v.modes);
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
const file = `${v.world}.bin`;
let spots = null;

for (const [mode, k] of modes) {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'will-')), {
    ...launchOptions({ args: windowFlags(v.w, v.h), vk: false }), viewport: null });
  const page = ctx.pages()[0];
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log(`[${mode} page error] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || /WGSL|shader/i.test(m.text())) console.log(`[${mode} console ${m.type()}] ${m.text().slice(0, 600)}`); });
  await page.addInitScript((view) => {
    if (sessionStorage.getItem('tm-init')) return;
    sessionStorage.setItem('tm-init', '1');
    localStorage.setItem('tidemote.view', JSON.stringify(view));
    localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0 }));
  }, viewPrefs({ particles: +v.n, auto: false, labOpen: false, trails: 0 }));
  await page.goto(`${base}/#k=${encodeURIComponent(JSON.stringify(k))}`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250 });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250 });
  await page.mouse.move(v.w / 2, v.h / 2); await page.mouse.wheel(0, 100); // the camera is ours, not the director's
  await page.addStyleTag({ content: '#dock,#floats,#hud,#flash,#caption,#feed,#lab,.rail{display:none!important}' }); await page.mouse.move(v.w - 2, 2);
  if (fs.existsSync(path.join(worldDir, file))) {
    await loadBinWorld(page, `${base}/worlds/${file}`);
    console.log(`[${mode}] opened ${file}`);
  } else {
    if (Object.keys(k).length) throw new Error('grow the world in a mode with the default tunables (list it first)');
    console.log(`[${mode}] growing ${v.n} particles at Max to ${v.mature} simulated s`);
    await page.evaluate(() => globalThis.__tidemote.setSpeed(Infinity));
    await page.waitForFunction((t) => globalThis.__tidemote.eng.simTime >= t, +v.mature, { polling: 200 });
    const info = await saveBinWorld(page, `${base}/worlds/${file}`, { speed: 1 });
    console.log(`[${mode}] saved ${file} at ${info.simTime.toFixed(0)} sim s, ${info.living} living, ${info.species} species`);
    await loadBinWorld(page, `${base}/worlds/${file}`); // every mode starts from the saved moment
  }
  await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
  // The beating cells in a circle (the page's own reading: species that beat and bond), with their will.
  await page.evaluate((photo) => {
    globalThis.__beaters = async (at, r) => {
      const T = globalThis.__tidemote, eng = T.eng, beats = new Set();
      for (const sp of T.life().reg.values()) if (sp.alive && (sp.genome.beat?.[0] ?? 0) > 0.05 && (sp.genome.adhesion || 0) > eng.K.adhMin && (!photo || sp.genome.photo > 0.4)) beats.add(sp.slot);
      const res = await eng.requestPick(at, r, 0xffffffff, { maxOut: eng.count, raw: true });
      if (!res?.raw) return null; // a pick refused (another in flight)
      const { u32, f32, count } = res.raw, PW = 12, out = [];
      for (let i = 0; i < count; i++) {
        const kind = u32[i * PW + 4], info = u32[i * PW + 9];
        if (!beats.has(kind) || (info & 15) === 14) continue;
        out.push([f32[i * PW], f32[i * PW + 1], ((info >>> 24) & 15) / 15, u32[i * PW + 7], kind, f32[i * PW + 2], f32[i * PW + 3]]);
      }
      return out;
    };
  }, +v.photo);
  if (!spots) {
    // Spots where beating cells crowd, apart from one another; the same ones for every mode.
    await page.waitForTimeout(+v.pre * 1000);
    spots = await page.evaluate(async (want) => {
      // a body: beating cells of one species within reach of one another; one cell of each of the largest, apart,
      // half of them resting and half beating where the world has both (in the will's mode they differ)
      const [W, H] = globalThis.__tidemote.eng.grid;
      let pts; while (!(pts = await globalThis.__beaters([W / 2, H / 2], Math.hypot(W, H)))) await new Promise((r) => setTimeout(r, 50));
      const d = (a, b) => Math.hypot(((a[0] - b[0]) % W + 1.5 * W) % W - W / 2, ((a[1] - b[1]) % H + 1.5 * H) % H - H / 2);
      const seen = new Set(), bodies = [];
      for (let i = 0; i < pts.length; i++) {
        if (seen.has(i)) continue;
        const body = [i]; seen.add(i);
        for (let q = 0; q < body.length; q++) for (let j = 0; j < pts.length; j++)
          if (!seen.has(j) && pts[j][4] === pts[body[q]][4] && d(pts[j], pts[body[q]]) < 0.5) { seen.add(j); body.push(j); }
        const will = body.reduce((a, j) => a + pts[j][2], 0) / body.length;
        bodies.push({ id: pts[body[0]][3], kind: pts[i][4], x: pts[body[0]][0], y: pts[body[0]][1], cells: body.length, will: +will.toFixed(2) });
      }
      const big = bodies.filter((b) => b.cells >= 4).sort((a, b) => b.cells - a.cells);
      const out = [], pick = (pred) => { for (const b of big) if (pred(b) && out.every((o) => d([o.x, o.y], [b.x, b.y]) > 8)) return out.push(b); };
      for (let n = 0; n < want; n++) pick(n % 2 ? (b) => b.will < 0.2 : (b) => b.will >= 0.5) || pick(() => true);
      return { all: pts.length, bodies: bodies.length, big: big.length, out };
    }, +v.spots);
    console.log(`${spots.all} beating cells in ${spots.bodies} bodies (${spots.big} of 4 cells or more); following ${JSON.stringify(spots.out)}`);
    spots = spots.out;
    fs.writeFileSync(path.join(v.out, 'spots.json'), JSON.stringify(spots));
    // the other modes open the world again and start after the same wait
  } else await page.waitForTimeout(+v.pre * 1000);
  const cdp = await ctx.newCDPSession(page);
  const startT = await page.evaluate(() => globalThis.__tidemote.eng.simTime);
  for (const [n, s] of spots.entries()) {
    await page.evaluate(([x, y, ppu]) => { const T = globalThis.__tidemote, fit = Math.max(innerWidth / T.eng.grid[0], innerHeight / T.eng.grid[1]); T.cam.x = x; T.cam.y = y; T.cam.anchor = null; T.cam.zoom = T.cam.zoomTarget = ppu / fit; }, [s.x, s.y, +v.zoom]);
    await page.evaluate(([id, kind]) => {
      // follow the body: its cell by id while it lives, then its kind's nearest beating cell
      const T = globalThis.__tidemote, [W, H] = T.eng.grid; T._follow = { id, kind, on: true, will: [] };
      const step = async () => {
        const F = T._follow; if (!F.on) return;
        const pts = await globalThis.__beaters([T.cam.x, T.cam.y], 4);
        if (!pts) { setTimeout(step, 30); return; }
        const wrap = (q, L) => ((q % L) + 1.5 * L) % L - L / 2;
        let me = pts.find((p) => p[3] === F.id);
        if (!me) { me = pts.filter((p) => p[4] === F.kind).sort((a, b) => Math.hypot(wrap(a[0] - T.cam.x, W), wrap(a[1] - T.cam.y, H)) - Math.hypot(wrap(b[0] - T.cam.x, W), wrap(b[1] - T.cam.y, H)))[0]; if (me) F.id = me[3]; }
        if (me) {
          T.cam.x += wrap(me[0] - T.cam.x, W) * 0.25; T.cam.y += wrap(me[1] - T.cam.y, H) * 0.25;
          const body = pts.filter((p) => p[4] === me[4] && Math.hypot(wrap(p[0] - me[0], W), wrap(p[1] - me[1], H)) < 1.5);
          F.last = { t: +T.eng.simTime.toFixed(2), n: body.length, rest: body.filter((p) => p[2] < 0.1).length, full: body.filter((p) => p[2] >= 0.7).length,
            will: +(body.reduce((a, p) => a + p[2], 0) / Math.max(body.length, 1)).toFixed(2), speed: +Math.hypot(me[5], me[6]).toFixed(3) };
        }
        setTimeout(step, 60);
      };
      step();
    }, [s.id, s.kind]);
    await page.evaluate((sp) => globalThis.__tidemote.setSpeed(sp), +v.speed);
    await page.waitForTimeout(1200);
    const dir = path.join(v.out, mode, `spot${n}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const times = [], will = [];
    const onFrame = (e) => { times.push(e.metadata.timestamp); fs.writeFileSync(path.join(dir, `f${String(times.length).padStart(4, '0')}.jpg`), Buffer.from(e.data, 'base64')); cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); };
    cdp.on('Page.screencastFrame', onFrame);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: v.w, maxHeight: v.h, everyNthFrame: 1 });
    const t0 = Date.now();
    while (Date.now() - t0 < +v.secs * 1000) {
      const b = await page.evaluate(() => globalThis.__tidemote._follow.last ?? null);
      will.push(b);
      await page.waitForTimeout(500);
    }
    await cdp.send('Page.stopScreencast');
    await page.evaluate(() => { globalThis.__tidemote._follow.on = false; });
    cdp.off('Page.screencastFrame', onFrame);
    fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify(times));
    fs.writeFileSync(path.join(dir, 'will.json'), JSON.stringify(will));
    const ws = will.filter(Boolean), mean = (k) => (ws.length ? ws.reduce((a, c) => a + c[k], 0) / ws.length : 0);
    const fps = (times.length - 1) / (times.at(-1) - times[0]);
    console.log(`[${mode}] spot${n} (body ${s.id}, ${s.cells} cells, will ${s.will} as saved): ${times.length} frames at ${fps.toFixed(1)} fps;`
      + ` body's cells in view ${mean('n').toFixed(1)}, will ${mean('will').toFixed(2)} (${ws.map((c) => c.will).filter((_, i) => i % 4 === 0).join(' ')}), speed ${mean('speed').toFixed(3)}`);
  }
  console.log(`[${mode}] filmed from sim ${startT.toFixed(0)} s`);
  await ctx.close();
}
server.close();
process.exit(0);
