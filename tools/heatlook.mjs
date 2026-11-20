// The heat haze lab: grow a world in the built page, hold it still, and photograph the same moment with the heat haze
// on and off (the haze's shimmer, schlieren over warm water; `shimmer` in POST_WGSL) at the world's warmest water and at
// staged patches of warm water written into the heat field, at several zooms; then, the world running, short clips of
// the haze on (frames as PNGs, and an MP4 where ffmpeg is). `python3 tools/heatlook.py DIR` measures how far each
// pair differs.
//   tools/gpu-node.sh tools/heatlook.mjs --out runs/heatlook/NAME [--html dist/tidemote.html] [--n 65536] [--mature 240]
//     [--zooms fit,40,120,300] [--clip 4] [--stage 1] [--still 1] [--stone 1]
// --stone 1 (the default) also stages a warm patch over the stoniest stretch with the fewest living (stone is drawn from
// a cache and moves on its own no more than the floor does, where cells' drawing animates even with the world held)
// and records held clips of it with the haze on and off: whatever moves there, the haze moved.
// --still 1 (the default) holds what moves on its own while the world is still (the sea's waves, the look's grain) so
// a pair differs by the haze alone; each scene also has a control pair (NAME-off2.png, the haze off twice).
// Under Linux without a display: TIDEMOTE_VK=1 tools/capped.sh node tools/heatlook.mjs ...
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { cliArgs, openPage, aim } from './pagelab.mjs';

const v = { out: 'runs/heatlook/x', html: 'dist/tidemote.html', k: '{}', n: 65536, mature: 240, zooms: 'fit,40,120,300', clip: 4, stage: 1, still: 1, stone: 1, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const zooms = String(v.zooms).split(',').map((z) => (z === 'fit' ? 'fit' : +z));
const { page, setSpeed, close } = await openPage({ html: v.html, k: v.k, n: +v.n, mature: +v.mature, tmp: 'heat-', prefs: +v.still ? { water: 0, grain: 0 } : {} });
// full resolution, every effect on (the tuner never turns the haze off), and the haze on
await page.evaluate(() => { const T = globalThis.__tidemote; T.setScale(1); T.setEffects('high'); T.eng.settings.heat = 1; });

const haze = (on) => page.evaluate((on) => { globalThis.__tidemote.eng.settings.heat = on ? 1 : 0; }, on);
// the heat field now, and the warmest spots (cells apart), with the temperature's slope there (°C a cell)
const field = () => page.evaluate(async () => {
  const e = globalThis.__tidemote.eng, [W, H] = e.grid, { temp } = await e.readThermal();
  return { W, H, tbg: e.tbg, temp: Array.from(temp) };
});
const warmest = ({ W, H, temp }, count = 2) => {
  const at = (x, y) => temp[((y + H) % H) * W + ((x + W) % W)];
  const idx = [...temp.keys()].sort((a, b) => temp[b] - temp[a]), spots = [];
  for (const i of idx) {
    const x = i % W, y = (i / W) | 0;
    if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < 12)) continue;
    let g = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) g = Math.max(g, Math.hypot(at(x + dx + 1, y + dy) - at(x + dx, y + dy), at(x + dx, y + dy + 1) - at(x + dx, y + dy)));
    spots.push({ x: x + 0.5, y: y + 0.5, t: temp[i], grad: g });
    if (spots.length >= count) break;
  }
  return spots;
};
const shoot = async (name, at, zoom) => {
  await aim(page, at, zoom);
  await page.waitForTimeout(1500);
  const files = [];
  for (const [on, tag] of [[false, 'off'], [false, 'off2'], [true, 'on']]) {
    await haze(on);
    await page.waitForTimeout(500);
    const f = path.join(v.out, `${name}-${tag}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  return files;
};
const zname = (z) => (z === 'fit' ? 'fit' : `z${z}`);
const report = { html: v.html, n: +v.n, mature: +v.mature, scenes: [] };

// the world's own warmest water, held still
const f0 = await field();
const spots = warmest(f0);
const sd = Math.sqrt(f0.temp.reduce((a, t) => a + (t - f0.tbg) ** 2, 0) / f0.temp.length);
console.log(`tbg ${f0.tbg.toFixed(1)}, rms above it ${sd.toFixed(2)}; warmest`, spots.map((s) => `${s.t.toFixed(1)}° (slope ${s.grad.toFixed(2)}/cell) at ${s.x},${s.y}`).join('; '));
// how the haze's measures spread over the world: the temperature's slope (°C a cell) and how much warmer each cell is
// than the water R cells about it (the mean of eight points), as percentiles
{
  const { W, H, temp } = f0, at = (x, y) => temp[((y + H) % H) * W + ((x + W) % W)], R = 5;
  const g = [], ex = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    g.push(Math.hypot(at(x + 1, y) - at(x, y), at(x, y + 1) - at(x, y)));
    let m = 0;
    for (let a = 0; a < 8; a++) m += at(x + Math.round(R * Math.cos(a * Math.PI / 4)), y + Math.round(R * Math.sin(a * Math.PI / 4)));
    ex.push(at(x, y) - m / 8);
  }
  const pct = (a) => { const s = a.sort((p, q) => p - q); return [50, 90, 99, 99.9].map((p) => s[Math.floor(p / 100 * (s.length - 1))].toFixed(2)).join(' / '); };
  console.log(`slope p50/p90/p99/p99.9 ${pct(g)}; warmer than about p50/p90/p99/p99.9 ${pct(ex)}; temp max ${Math.max(...temp).toFixed(1)}`);
}
report.field = { tbg: f0.tbg, rms: sd, spots };
for (const [k, s] of spots.entries()) for (const z of zooms) { await shoot(`warm${k}-${zname(z)}`, [s.x, s.y], z); report.scenes.push({ name: `warm${k}-${zname(z)}`, ...s }); }

// staged warm water written into the heat field (held still, nothing steps it): a warm plume (+12° at its middle,
// about as warm as a heat-maker colony's halo), a broad hot patch (+35°, past where bubbles come out, flat inside), and
// water near a boil
if (+v.stage) {
  const { W, H, tbg, temp } = f0;
  const cx = W / 2, cy = H / 2;
  const stages = [
    { name: 'plume', f: (r) => 12 * Math.exp(-(r * r) / (2 * 3 * 3)) },
    { name: 'patch', f: (r) => 35 / (1 + Math.exp((r - 10) / 1.5)) },
    { name: 'boil', f: (r) => (95 - tbg) / (1 + Math.exp((r - 6) / 1.5)) },
  ];
  for (const st of stages) {
    const t = Float32Array.from(temp, (_, i) => { const x = (i % W) + 0.5 - cx, y = ((i / W) | 0) + 0.5 - cy; return tbg + st.f(Math.hypot(x, y)); });
    await page.evaluate((t) => { const e = globalThis.__tidemote.eng; e.device.queue.writeBuffer(e.b.thermal, 0, new Float32Array(t)); }, Array.from(t));
    for (const z of zooms) { await shoot(`${st.name}-${zname(z)}`, [cx, cy], z); report.scenes.push({ name: `${st.name}-${zname(z)}`, staged: true }); }
  }
  await page.evaluate((t) => { const e = globalThis.__tidemote.eng; e.device.queue.writeBuffer(e.b.thermal, 0, new Float32Array(t)); }, temp);
}

// clips at the warmest spot at each zoom past fit, by the browser's screencast (screenshots come a few a second): the
// world held with the haze on and off (the haze flickers on the viewer's clock, so it moves while nothing else does),
// then running at speed 1 with it on. Each clip's frames go in DIR/clip-NAME/, and an MP4 beside them where ffmpeg is
// (else encode them under WSL: ffmpeg -framerate FPS -i f%04d.jpg ...).
const record = async (dir, secs) => {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  let k = 0;
  cdp.on('Page.screencastFrame', (f) => {
    fs.writeFileSync(path.join(dir, `f${String(k++).padStart(4, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  await page.waitForTimeout(secs * 1000);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  const fps = Math.max(1, Math.round(k / secs));
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.jpg'), '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', `${dir}.mp4`]);
  } catch { /* encoded under WSL */ }
  fs.writeFileSync(path.join(dir, 'fps.txt'), String(fps));
  console.log(`${path.basename(dir)}: ${k} frames, ${fps} fps`);
};
if (+v.clip > 0 && spots.length) {
  for (const z of zooms.filter((z) => z !== 'fit')) {
    await aim(page, [spots[0].x, spots[0].y], z);
    await page.waitForTimeout(1500);
    for (const on of [true, false]) { await haze(on); await record(path.join(v.out, `clip-held-${on ? 'on' : 'off'}-${zname(z)}`), +v.clip); }
    await haze(true);
    await setSpeed(1);
    await record(path.join(v.out, `clip-run-${zname(z)}`), +v.clip);
    await setSpeed(0);
  }
}
if (+v.stone && +v.clip > 0) {
  const { W, H, tbg, temp } = f0;
  // stone (kind 3) and the living per grid cell, then the 7x7 stretch with the most stone over the living
  const at = await page.evaluate(async ([W, H]) => {
    const e = globalThis.__tidemote.eng, { u32, f32 } = await e.readParticles(), stone = new Float32Array(W * H), life = new Float32Array(W * H);
    for (let i = 0; i < e.count; i++) {
      const k = u32[i * 10 + 4], x = Math.floor(f32[i * 10]), y = Math.floor(f32[i * 10 + 1]);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (k === 3) stone[y * W + x]++; else if (k >= 5) life[y * W + x]++;
    }
    let best = -1e9, bx = W / 2, by = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sc = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = ((y + dy + H) % H) * W + ((x + dx + W) % W); sc += stone[j] - 3 * life[j]; }
      if (sc > best) { best = sc; bx = x + 0.5; by = y + 0.5; }
    }
    return [bx, by, best];
  }, [W, H]);
  console.log(`stone stretch at ${at[0]},${at[1]} (score ${at[2]})`);
  const t = Float32Array.from(temp, (_, i) => { const x = (i % W) + 0.5 - at[0], y = ((i / W) | 0) + 0.5 - at[1]; return tbg + 30 / (1 + Math.exp((Math.hypot(x, y) - 8) / 1.5)); });
  await page.evaluate((t) => { const e = globalThis.__tidemote.eng; e.device.queue.writeBuffer(e.b.thermal, 0, new Float32Array(t)); }, Array.from(t));
  for (const z of zooms.filter((z) => z !== 'fit')) {
    await shoot(`stone-${zname(z)}`, [at[0], at[1]], z);
    for (const on of [true, false]) { await haze(on); await record(path.join(v.out, `clip-stone-${on ? 'on' : 'off'}-${zname(z)}`), Math.min(+v.clip, 3)); }
  }
  await page.evaluate((t) => { const e = globalThis.__tidemote.eng; e.device.queue.writeBuffer(e.b.thermal, 0, new Float32Array(t)); }, temp);
}
fs.writeFileSync(path.join(v.out, 'report.json'), JSON.stringify(report, null, 1));
await close();
