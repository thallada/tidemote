// The promo master from an EDL: every cut at 3840x2160 60 fps from its 4K (or 8K) master (its in-point, virtual camera,
// fades and flash; HEVC at QP 14 on the GPU, an intermediate kept by what is in it, so a re-render makes only the cuts
// that changed), joined, graded and titled; the shots' soundtrack messages placed on the edit's timeline (field.json) and
// the track rendered over them on the audio engine it was approved on (track/track.mjs, paths.mjs MUSIC); then the 4K and
// 1080p deliverables.
//   node tools/promo/master.mjs EDL.json OUTDIR
import fs from 'node:fs'; import path from 'node:path';
import { spans, inPoint, FPS } from './editor/edlcore.mjs';
import { ffmpeg, run, cutFilters, vcam, overlays } from './render.mjs';
import { ROOT, HERE, MUSIC, catalog, readJson, times } from './paths.mjs';

const [edlF, OUT] = process.argv.slice(2), W = 3840, H = 2160;
const edl = readJson(edlF), T = times(), byId = catalog();
fs.mkdirSync(path.join(OUT, 'seg'), { recursive: true });
const NV = ['-c:v', 'hevc_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'constqp', '-qp', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
const stamp = (what) => console.log(`== ${what} ${new Date().toTimeString().slice(0, 8)}`);
const field = [], segs = [];
stamp('cut');
for (const c of spans(edl, T)) {
  if (c.dur <= 0) continue;
  const clip = byId.get(c.clip), seg = path.join(OUT, 'seg', `s${String(c.i).padStart(3, '0')}.mp4`), n = Math.round(c.dur * FPS);
  if (!clip) {
    // not in the catalogue (the black tail): black
    await ffmpeg(['-f', 'lavfi', '-i', `color=black:s=${W}x${H}:r=${FPS}`, '-frames:v', String(n), ...NV, seg]);
    segs.push(seg); console.log(`${String(c.i).padStart(3)} ${c.t0.toFixed(2)} black (${c.clip})`); continue;
  }
  const cin = inPoint(c, c.dur, clip), key = JSON.stringify({ clip: clip.id, m: clip.mtime, cin, n, vcam: c.vcam || null, mz: c.maxzoom ?? 2, fade: c.fade, fl: c.fadeLen, flash: c.flash });
  if (!fs.existsSync(seg) || !fs.existsSync(seg + '.key') || fs.readFileSync(seg + '.key', 'utf8') !== key) {
    let src = path.join(ROOT, clip.id + '.mp4'), at = cin;
    if (c.vcam) { const v = seg + '.vcam.mp4'; await vcam(c, clip, cin, n + 6, v); src = v; at = 0; }
    await run('nice', ['-n', '12', 'ffmpeg', '-loglevel', 'error', '-y', '-hwaccel', 'cuda', '-ss', at.toFixed(4), '-t', (c.dur + 0.25).toFixed(4), '-i', src, '-vf', cutFilters(c, c.dur, W, H), '-frames:v', String(n), '-an', ...NV, seg]);
    fs.rmSync(seg + '.vcam.mp4', { force: true });
    fs.writeFileSync(seg + '.key', key);
  }
  segs.push(seg);
  // the shot's sound: its messages from cin to cin + dur, placed at the cut (with the voices it had going in)
  const m = readJson(path.join(ROOT, clip.id + '.json'));
  let lastSlots = null;
  for (const e of m.snd) {
    const ct = (e.wall - m.t0) / 1000;
    if (e.msg.type === 'slots' && ct <= cin) lastSlots = e;
    if (ct >= cin && ct <= cin + c.dur) field.push({ t: c.t0 + ct - cin, msg: e.msg });
  }
  if (lastSlots) field.push({ t: c.t0, msg: lastSlots.msg });
  console.log(`${String(c.i).padStart(3)} ${c.t0.toFixed(2)}–${c.t1.toFixed(2)} ${clip.id} @${cin.toFixed(2)}`);
}
field.sort((a, b) => a.t - b.t);
fs.writeFileSync(path.join(OUT, 'field.json'), JSON.stringify(field));
fs.writeFileSync(path.join(OUT, 'list.txt'), segs.map((s) => `file '${path.resolve(s)}'`).join('\n'));
await ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), '-c', 'copy', path.join(OUT, 'cut.mp4')]);
const o = overlays(edl, T, W, H);
await run('nice', ['-n', '12', 'ffmpeg', '-loglevel', 'error', '-y', '-hwaccel', 'cuda', '-i', path.join(OUT, 'cut.mp4'), ...o.inputs, ...o.map, '-t', o.end.toFixed(3),
  '-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-profile:v', 'high', '-rc', 'constqp', '-qp', '15', '-bf', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', path.join(OUT, 'video.mp4')]);
stamp(`track (${field.length} messages)`);
await run('node', [path.join(HERE, 'track/track.mjs'), '--src', MUSIC, '--out', path.join(OUT, 'track'), '--field', path.join(OUT, 'field.json')]);
stamp('mux');
const k4 = path.join(OUT, 'tidemote-promo-4k.mp4');
await ffmpeg(['-i', path.join(OUT, 'video.mp4'), '-i', path.join(OUT, 'track/track.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', '-shortest', k4]);
await run('nice', ['-n', '12', 'ffmpeg', '-loglevel', 'error', '-y', '-hwaccel', 'cuda', '-i', k4, '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', path.join(OUT, 'tidemote-promo-1080p.mp4')]);
stamp(`done: ${k4}`);
