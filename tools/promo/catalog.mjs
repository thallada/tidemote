// The library's catalogue: every shot filmed into ROOT/lib2/<world>/<name>.mp4 + .json (olab.mjs), each with an edit
// proxy (960x540 60 fps H.264, a keyframe every quarter second so the editor seeks fast), a poster, a filmstrip, and QC:
// even sim steps and one frame a step (from the shot's own log), distinct frames (mpdecimate on the proxy), brightness,
// colour and motion. Incremental: a shot already catalogued (same size and mtime) is kept as it was. Worlds whose names
// begin with _ are left out (tests).
//   node tools/promo/catalog.mjs [--only w03] [--jobs 3]
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
import { ROOT, LIB, cliArgs } from './paths.mjs';

const PX = LIB + '/_proxy', OUT = LIB + '/catalog.json', { only: ONLY = null, jobs = 3 } = cliArgs(), JOBS = +jobs;
const QCV = 5; // the QC's version: a new one redoes every shot's QC
const run = (cmd, args) => new Promise((res) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); p.on('close', (code) => res({ code, out, err }));
});
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { clips: [] };
const byId = new Map(old.clips.map((c) => [c.id, c]));

const todo = [];
for (const w of fs.readdirSync(LIB).filter((d) => !d.startsWith('_') && fs.statSync(path.join(LIB, d)).isDirectory()).sort()) {
  if (ONLY && w !== ONLY) continue;
  const wj = path.join(LIB, w, 'world.json'), world = fs.existsSync(wj) ? JSON.parse(fs.readFileSync(wj, 'utf8')) : {};
  for (const f of fs.readdirSync(path.join(LIB, w)).filter((f) => f.endsWith('.mp4') && !f.includes('.vcam.')).sort()) {
    const name = f.slice(0, -4), js = path.join(LIB, w, name + '.json');
    if (fs.existsSync(js)) todo.push({ id: `lib2/${w}/${name}`, world: w, name, worldInfo: world });
  }
}
const qcLog = (d) => {
  // from frame 11 on: the master never cuts in before 0.2 s (edlcore inPoint), so faults before it are never seen
  const SKIP = 11, cam = (d.cam || []).slice(SKIP); if (cam.length < 10) return {};
  const sims = cam.map((c) => c[3]), ds = sims.slice(1).map((s, i) => s - sims[i]).sort((a, b) => a - b), med = ds[ds.length >> 1] || 1e-9;
  const simBad = Math.max(...ds.map((x) => Math.abs(x - med))) / med;
  // the world wraps (a torus): a step across its edge reads as a jump of nearly the world's width, so a step of more
  // than 40 units on an axis (no camera moves that far in 1/60 s) is taken as the step before it
  const dx = [], dy = [], wrap = (d, a) => (Math.abs(d) > 40 ? a.at(-1) ?? 0 : d);
  cam.slice(1).forEach((b, i) => { dx.push(wrap(b[0] - cam[i][0], dx)); dy.push(wrap(b[1] - cam[i][1], dy)); });
  const pan = cam.slice(1).map((b, i) => Math.hypot(dx[i], dy[i]) * b[2]), zr = cam.slice(1).map((b, i) => Math.log(b[2] / cam[i][2]));
  const jp = Math.max(0, ...pan.slice(1).map((p, i) => Math.abs(p - pan[i]))), jz = Math.max(0, ...zr.slice(1).map((z, i) => Math.abs(z - zr[i])));
  const one = cam.every((c) => c.length < 5 || c[4] === 1);
  // where the first fault is (s into the shot): a clip that fails is still clean up to there
  let first = one ? cam.length : 0;
  sims.slice(1).forEach((x, i) => { if (Math.abs(x - sims[i] - med) / med >= 0.02) first = Math.min(first, i); });
  pan.slice(1).forEach((p, i) => { if (Math.abs(p - pan[i]) >= 0.5) first = Math.min(first, i); });
  zr.slice(1).forEach((z, i) => { if (Math.abs(z - zr[i]) >= 0.002) first = Math.min(first, i); });
  const smooth = simBad < 0.02 && jp < 0.5 && jz < 0.002 && one;
  return { simEven: +simBad.toFixed(4), panJerk: +jp.toFixed(4), zoomJerk: +jz.toFixed(5), oneFrameAStep: one, smooth, ...(smooth ? {} : { cleanTo: +((first + SKIP) / 60).toFixed(3) }) };
};
async function one(t) {
  const mp4 = path.join(ROOT, t.id + '.mp4'), js = path.join(ROOT, t.id + '.json'), st = fs.statSync(mp4);
  const prev = byId.get(t.id);
  if (prev && prev.qcv === QCV && prev.size === st.size && prev.mtime === +st.mtimeMs && fs.existsSync(path.join(LIB, prev.proxy))) return prev;
  const d = JSON.parse(fs.readFileSync(js, 'utf8'));
  const beatF = path.join(ROOT, t.id + '.beat.json'), beat = fs.existsSync(beatF) ? JSON.parse(fs.readFileSync(beatF, 'utf8')) : null;
  const px = path.join(PX, t.id.replace(/\//g, '__'));
  fs.mkdirSync(PX, { recursive: true });
  // the proxy: decoded and scaled on the GPU; HEVC/8K UI masters too
  const have = fs.existsSync(px + '.mp4') && fs.statSync(px + '.mp4').mtimeMs > st.mtimeMs;
  let r = have ? { code: 0 } : await run('nice', ['-n', '10', 'ffmpeg', '-loglevel', 'error', '-y', '-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda', '-i', mp4, '-vf', 'scale_cuda=960:540', '-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'constqp', '-qp', '26', '-g', '15', '-bf', '0', '-an', '-movflags', '+faststart', px + '.mp4']);
  if (r.code) r = await run('nice', ['-n', '10', 'ffmpeg', '-loglevel', 'error', '-y', '-i', mp4, '-vf', 'scale=960:540', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-g', '15', '-bf', '0', '-an', '-movflags', '+faststart', px + '.mp4']);
  if (r.code) { console.log('proxy failed', t.id, r.err.slice(0, 300)); return null; }
  const frames = d.frames, dur = frames / 60;
  // poster (a third in) and a filmstrip of 8 frames
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-ss', (dur / 3).toFixed(2), '-i', px + '.mp4', '-frames:v', '1', '-q:v', '4', px + '.jpg']);
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', px + '.mp4', '-vf', `fps=${(8 / dur).toFixed(4)},scale=192:108,tile=8x1`, '-frames:v', '1', '-q:v', '5', px + '.strip.jpg']);
  // distinct frames; brightness and saturation; motion (mean difference of consecutive frames, small)
  const md = await run('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-i', px + '.mp4', '-vf', 'mpdecimate=hi=64*4:lo=64*2:frac=0.33,showinfo', '-f', 'null', '-']);
  const distinct = (md.err.match(/n:\s*\d+/g) || []).length;
  const ss = await run('ffmpeg', ['-loglevel', 'error', '-i', px + '.mp4', '-vf', 'scale=240:136,signalstats,metadata=print:file=-', '-f', 'null', '-']);
  const vals = (k) => [...ss.out.matchAll(new RegExp(`lavfi\\.signalstats\\.${k}=([\\d.]+)`, 'g'))].map((m) => +m[1]);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const mo = await run('ffmpeg', ['-loglevel', 'error', '-i', px + '.mp4', '-vf', 'scale=240:136,tblend=all_mode=difference,signalstats,metadata=print:file=-', '-f', 'null', '-']);
  const motion = mean([...mo.out.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => +m[1]));
  const meta = d.meta || {};
  return {
    id: t.id, qcv: QCV, world: t.world, name: t.name, cat: meta.cat, meta, worldInfo: { ...t.worldInfo, ...(d.world || {}) },
    frames, dur: +dur.toFixed(3), vw: d.vw, vh: d.vh, scale: d.scale, sim0: d.sim0, sim1: d.sim1, count: d.stats?.[1]?.count,
    beat, ui: !!(d.cam?.[0]?.[5] && Object.keys(d.cam[0][5]).length), size: st.size, mtime: +st.mtimeMs,
    proxy: path.relative(LIB, px + '.mp4'), poster: path.relative(LIB, px + '.jpg'), strip: path.relative(LIB, px + '.strip.jpg'),
    qc: { ...qcLog(d), distinct, distinctShare: +(distinct / frames).toFixed(3), luma: +mean(vals('YAVG')).toFixed(1), sat: +mean(vals('SATAVG')).toFixed(1), motion: +motion.toFixed(2) },
  };
}
const out = [];
let next = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (next < todo.length) {
    const t = todo[next++];
    try { const c = await one(t); if (c) { out.push(c); if (!byId.has(t.id) || byId.get(t.id) !== c) process.stdout.write(`${c.id} ${c.qc.smooth === false ? 'JERKY ' : ''}d${c.qc.distinctShare} L${c.qc.luma} S${c.qc.sat} M${c.qc.motion}\n`); } }
    catch (e) { console.log('failed', t.id, e.message); }
  }
}));
// shots catalogued before but not in this pass (another --only) are kept
for (const c of old.clips) if (!out.some((o) => o.id === c.id) && fs.existsSync(path.join(ROOT, c.id + '.mp4')) && ONLY) out.push(c);
out.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(OUT, JSON.stringify({ made: new Date().toISOString(), clips: out }));
console.log(`catalogue: ${out.length} shots`);
