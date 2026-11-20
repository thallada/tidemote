// The heat haze lab (docs/look.md, Heat haze): grow a world in the built page, hold it still, and photograph the same
// moment with the haze on, off and off again (a control: cells' drawing animates even with the world held) at the
// world's warmest water and at warm water staged in the heat field, at each zoom; then record clips by the browser's
// screencast: held with the haze on and off, running with it on, and held over stone with a hot patch staged there
// (stone is drawn from a cache: whatever moves there, the haze moved). The sea and the grain are off throughout.
// `python3 tools/heatlook.py DIR` measures the pairs and the clips.
//   tools/gpu-node.sh tools/heatlook.mjs --out runs/heatlook/NAME [--html dist/tidemote.html] [--n 65536]
//     [--mature 240] [--zooms fit,40,120,300] [--clip 4]
// Clips are frames (DIR/clip-NAME/f0000.jpg..., their rate in fps.txt), and an MP4 beside them where this Node finds
// ffmpeg (under WSL, Windows Node does not: tools/heatlook.py --encode DIR makes them).
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { cliArgs, openPage, aim } from './pagelab.mjs';

const v = { out: 'runs/heatlook/x', html: 'dist/tidemote.html', k: '{}', n: 65536, mature: 240, zooms: 'fit,40,120,300', clip: 4, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const zooms = String(v.zooms).split(',').map((z) => (z === 'fit' ? 'fit' : +z));
const near = zooms.filter((z) => z !== 'fit');
const zname = (z) => (z === 'fit' ? 'fit' : `z${z}`);
const { page, setSpeed, close } = await openPage({ html: v.html, k: v.k, n: +v.n, mature: +v.mature, tmp: 'heat-', prefs: { water: 0, grain: 0 } });
// full resolution and every effect on (the tuner never turns the haze off)
await page.evaluate(() => { const T = globalThis.__tidemote; T.setScale(1); T.setEffects('high'); });

const haze = (on) => page.evaluate((on) => { globalThis.__tidemote.eng.settings.heat = on ? 1 : 0; }, on);
const writeHeat = (t) => page.evaluate((t) => { const e = globalThis.__tidemote.eng; e.device.queue.writeBuffer(e.b.thermal, 0, new Float32Array(t)); }, Array.from(t));
const look = async (at, z) => { await aim(page, at, z); await page.waitForTimeout(1500); };
const shoot = async (name, at, z) => {
  await look(at, z);
  for (const [on, tag] of [[true, 'on'], [false, 'off'], [false, 'off2']]) {
    await haze(on);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(v.out, `${name}-${zname(z)}-${tag}.png`) });
  }
};
const record = async (name, secs = +v.clip) => {
  const dir = path.join(v.out, `clip-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  let k = 0;
  cdp.on('Page.screencastFrame', (f) => {
    fs.writeFileSync(path.join(dir, `f${String(k++).padStart(4, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92 });
  await page.waitForTimeout(secs * 1000);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  const fps = Math.max(1, Math.round(k / secs));
  fs.writeFileSync(path.join(dir, 'fps.txt'), String(fps));
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.jpg'), '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', `${dir}.mp4`]);
  } catch { /* no ffmpeg here */ }
  console.log(`clip-${name}: ${k} frames, ${fps} fps`);
};

const { W, H, tbg, temp } = await page.evaluate(async () => {
  const e = globalThis.__tidemote.eng, [W, H] = e.grid, { temp } = await e.readThermal();
  return { W, H, tbg: e.tbg, temp: Array.from(temp) };
});
// a heat field of the background plus f(distance from (cx, cy)), as staged
const staged = (cx, cy, f) => temp.map((_, i) => tbg + f(Math.hypot((i % W) + 0.5 - cx, ((i / W) | 0) + 0.5 - cy)));

// the world's warmest water: its two warmest spots at least 12 cells apart
const spots = [];
for (const i of [...temp.keys()].sort((a, b) => temp[b] - temp[a])) {
  const x = (i % W) + 0.5, y = ((i / W) | 0) + 0.5;
  if (spots.every((s) => Math.hypot(s[0] - x, s[1] - y) >= 12)) spots.push([x, y]);
  if (spots.length === 2) break;
}
console.log(`background ${tbg.toFixed(1)}°; warmest`, spots.map(([x, y]) => `${temp[(y - 0.5) * W + x - 0.5].toFixed(1)}° at ${x},${y}`).join(', '));
for (const [k, s] of spots.entries()) for (const z of zooms) await shoot(`warm${k}`, s, z);

// staged at the world's middle: a warm plume (+12°, a heat-maker colony's halo), a broad hot patch (+35°, bubbling,
// flat inside) and water near a boil
const patch = (dT, r) => (d) => dT / (1 + Math.exp((d - r) / 1.5));
for (const [name, f] of [['plume', (d) => 12 * Math.exp(-d * d / 18)], ['patch', patch(35, 10)], ['boil', patch(95 - tbg, 6)]]) {
  await writeHeat(staged(W / 2, H / 2, f));
  for (const z of zooms) await shoot(name, [W / 2, H / 2], z);
}
await writeHeat(temp);

if (+v.clip > 0) {
  for (const z of near) {
    await look(spots[0], z);
    await haze(true); await record(`held-on-${zname(z)}`);
    await haze(false); await record(`held-off-${zname(z)}`);
    await haze(true); await setSpeed(1); await record(`run-${zname(z)}`); await setSpeed(0);
  }
  // the 7x7 stretch with the most stone (kind 3) over the living (from FIRST_LIFE, 5), a hot patch staged on it
  const stone = await page.evaluate(async ([W, H]) => {
    const e = globalThis.__tidemote.eng, { u32, f32 } = await e.readParticles(), score = new Float32Array(W * H);
    for (let i = 0; i < e.count; i++) {
      const k = u32[i * 10 + 4], x = Math.floor(f32[i * 10]), y = Math.floor(f32[i * 10 + 1]);
      if (x >= 0 && y >= 0 && x < W && y < H) score[y * W + x] += k === 3 ? 1 : k >= 5 ? -3 : 0;
    }
    let best = -Infinity, at = [W / 2, H / 2];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sc = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) sc += score[((y + dy + H) % H) * W + ((x + dx + W) % W)];
      if (sc > best) { best = sc; at = [x + 0.5, y + 0.5]; }
    }
    return at;
  }, [W, H]);
  console.log(`stone at ${stone}`);
  await writeHeat(staged(...stone, patch(30, 8)));
  for (const z of near) {
    await shoot('stone', stone, z);
    await haze(true); await record(`stone-on-${zname(z)}`, 3);
    await haze(false); await record(`stone-off-${zname(z)}`, 3);
  }
  await writeHeat(temp);
}
await close();
