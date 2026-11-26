// Film one saved world from afar under several builds of the page, the same spot and moment in each, and lay the clips
// side by side: for changes to how distant cells look (spriteOf's flashes and glows, the sprites, the splat), which only
// show as the world runs. Each build is loaded with the world, run at --speed from the saved moment and filmed for
// --secs (CDP screencast, the page's chrome hidden). The spot is the 8-unit patch with the most newborns, or --at x,y,
// chosen once and kept in OUT/spot.json, so a later run (other builds, --hdr) films the same place.
//   tools/gpu-node.sh tools/anim/farfilm.mjs --out runs/anim/far/NAME --html 'a=OLD.html,b=dist/tidemote.html'
//     [--world runs/bonds/world.bin --n 131072] [--zoom 20] [--secs 8] [--speed 1] [--w 1000 --h 700] [--at x,y]
//     [--hdr 4] [--crop x,y,w,h,scale] [--k '{...}']
//   then, under WSL (Windows' node has no ffmpeg), the clips: node tools/anim/farfilm.mjs --encode 1 with the same
//   --out --html [--crop]
// --hdr P takes the screen for an HDR one of headroom P (T.display.set) and films the HDR image scaled by 1/P (each
// build's displayOut patched in a copy beside OUT), the panel's brightest as white and SDR white as grey, so the
// screencast keeps how bright highlights are against the rest. --zoom is pixels a world unit (20: cells a few pixels
// across, as from afar). Writes OUT/NAME/fNNNN.jpg and times.json per build, OUT/NAME.mp4 (30 fps) and OUT/side.mp4
// (the builds in a grid, two columns from four, labeled); --crop takes the rectangle x,y,w,h of each frame (pixels),
// enlarged `scale` times pixel for pixel, for sprites a pixel or two across.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { openPage, aim, cliArgs } from '../pagelab.mjs';
import { loadBinWorld } from '../lib/world.mjs';

const v = { world: 'runs/bonds/world.bin', n: 131072, out: 'runs/anim/far/x', html: 'now=dist/tidemote.html', zoom: 20, secs: 8, speed: 1, w: 1000, h: 700, hdr: 0,
  // (no climate event and no low era: the same weather in every build's run)
  k: '{"lowEras":0,"eventPlan":"none@1000000000"}', ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const builds = String(v.html).split(',').map((s) => { const i = s.indexOf('='); return { name: s.slice(0, i), file: s.slice(i + 1) }; });
const spotFile = path.join(v.out, 'spot.json');
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

// the HDR image scaled by 1/peak into SDR (displayOut's linear light, as the browser would show it, over the peak)
const HDR_HEAD = 'fn displayOut(v: vec3f) -> vec3f {';
const HDR_SCALED = `${HDR_HEAD}\n  if (post.display.x > 1.0) { let l0 = select(srgbDecode(v), pow(max(v, vec3f(1.0)), vec3f(2.2)), v > vec3f(1.0)); return srgbEncode(min(l0 / post.display.x, vec3f(1.0))); }`;
function pageFile(b) {
  if (!(+v.hdr > 1)) return b.file;
  const src = fs.readFileSync(b.file, 'utf8');
  if (!src.includes(HDR_HEAD)) throw new Error(`${b.file}: no displayOut to scale`);
  const out = path.join(v.out, `${b.name}.hdr.html`);
  fs.writeFileSync(out, src.replace(HDR_HEAD, HDR_SCALED));
  return out;
}

async function film(b, worldUrl) {
  const { page, close } = await openPage({ html: pageFile(b), n: +v.n, w: +v.w, h: +v.h, mature: 1, k: v.k, tmp: 'far-' });
  await loadBinWorld(page, worldUrl);
  await page.evaluate(() => globalThis.__tidemote.setSpeed(0));
  if (+v.hdr > 1) {
    await page.evaluate((peak) => globalThis.__tidemote.display.set({ caps: { hdrScreen: true }, prefs: { hdr: true, peak, wide: 0 } }), +v.hdr);
    await page.waitForFunction(() => globalThis.__tidemote.display.state().format === 'rgba16float', null, { polling: 250, timeout: 120000 });
  }
  let spot;
  if (fs.existsSync(spotFile)) spot = JSON.parse(fs.readFileSync(spotFile, 'utf8'));
  else if (v.at) { const [x, y] = String(v.at).split(',').map(Number); spot = { x, y }; }
  else {
    spot = await page.evaluate(async () => {
      const eng = globalThis.__tidemote.eng, [W, H] = eng.grid;
      const res = await eng.requestPick([W / 2, H / 2], Math.hypot(W, H), 0xffffffff, { maxOut: eng.count, raw: true });
      const { u32, f32, count } = res.raw, PW = 12, cell = 8, score = new Map();
      for (let i = 0; i < count; i++) {
        const kind = u32[i * PW + 4], age = f32[i * PW + 6], cause = u32[i * PW + 9] & 15;
        if (kind < 5 || cause !== 9 || age > 3) continue;
        const key = `${Math.floor(f32[i * PW] / cell)},${Math.floor(f32[i * PW + 1] / cell)}`;
        score.set(key, (score.get(key) || 0) + 1);
      }
      const [key, births] = [...score].sort((a, c) => c[1] - a[1])[0];
      const [x, y] = key.split(',').map((q) => (+q + 0.5) * cell);
      return { x, y, births };
    });
  }
  fs.writeFileSync(spotFile, JSON.stringify(spot));
  await aim(page, [spot.x, spot.y], +v.zoom);
  await page.evaluate((s) => globalThis.__tidemote.setSpeed(s), +v.speed);
  await page.waitForTimeout(1500);
  const dir = path.join(v.out, b.name);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const times = [];
  cdp.on('Page.screencastFrame', (e) => {
    times.push(e.metadata.timestamp);
    fs.writeFileSync(path.join(dir, `f${String(times.length).padStart(4, '0')}.jpg`), Buffer.from(e.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: +v.w, maxHeight: +v.h, everyNthFrame: 1 });
  await page.waitForTimeout(+v.secs * 1000);
  await cdp.send('Page.stopScreencast');
  fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify(times));
  console.log(`${b.name}: ${times.length} frames at ${JSON.stringify(spot)}`);
  await close();
}

if (!v.encode) {
  const worldUrl = `data:application/octet-stream;base64,${fs.readFileSync(v.world).toString('base64')}`;
  for (const b of builds) await film(b, worldUrl);
  if (process.platform === 'win32') {
    console.log(`filmed; now: node tools/anim/farfilm.mjs --encode 1 --out ${v.out} --html '${v.html}'${v.crop ? ` --crop ${v.crop}` : ''}`);
    process.exit(0);
  }
}

// each build's frames at their own times into a 30 fps clip (cropped and enlarged with --crop; even sizes, as yuv420p
// needs), then the clips in a grid, labeled
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const [cx, cy, cw, ch, cs] = v.crop ? String(v.crop).split(',').map(Number) : [];
const fit = v.crop ? `crop=${cw & ~1}:${ch & ~1}:${cx}:${cy},scale=iw*${cs || 1}:ih*${cs || 1}:flags=neighbor` : 'crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0';
for (const b of builds) {
  const dir = path.join(v.out, b.name), times = JSON.parse(fs.readFileSync(path.join(dir, 'times.json'), 'utf8'));
  const frame = (i) => `file 'f${String(i + 1).padStart(4, '0')}.jpg'`;
  const list = times.map((t, i) => `${frame(i)}\nduration ${((times[i + 1] ?? t + 1 / 30) - t).toFixed(4)}`).join('\n') + `\n${frame(times.length - 1)}\n`;
  fs.writeFileSync(path.join(dir, 'list.txt'), list);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', `fps=30,${fit}`, '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', path.join(v.out, `${b.name}.mp4`)]);
}
const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(v.out, `${builds[0].name}.mp4`)]).toString().trim().split(',').map(Number);
const n = builds.length, cols = n === 4 ? 2 : n;
const at = (i) => [(i % cols) * w, Math.floor(i / cols) * h];
const esc = (s) => s.replace(/[\\':,]/g, ' ');
// (the labels drawn once on the grid: drawtext in each input's chain crashes this ffmpeg)
const labels = fs.existsSync(font) ? builds.map((b, i) => `,drawtext=fontfile=${font}:text='${esc(b.name)}':x=${at(i)[0] + 12}:y=${at(i)[1] + 10}:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=6`).join('') : '';
const grid = n > 1 ? `xstack=inputs=${n}:layout=${builds.map((_, i) => at(i).join('_')).join('|')}:shortest=1` : 'null';
ffmpeg([...builds.flatMap((b) => ['-i', path.join(v.out, `${b.name}.mp4`)]), '-filter_complex', `${builds.map((_, i) => `[${i}:v]`).join('')}${grid}${labels}[v]`,
  '-map', '[v]', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(v.out, 'side.mp4')]);
console.log('done', path.join(v.out, 'side.mp4'));
process.exit(0);
