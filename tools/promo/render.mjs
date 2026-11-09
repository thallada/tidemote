// The pieces the renders share (preview.mjs, draft.mjs, master.mjs): running ffmpeg and its kin, a cut's filters (its
// size, fades and flash), its virtual camera through vcam.py, and titles laid over a whole cut.
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
import { vcamPath, makeWhen, FPS } from './editor/edlcore.mjs';
import { ROOT, TITLES, HERE, PY, readJson } from './paths.mjs';

// a command in a process group of its own, killed whole (vcam.py's decoder and encoder too) if it outlives `secs`: a
// decoder that stalls (the GPU's memory full) must not hold a render for good
export const run = (cmd, args, { secs = 3600, ...opts } = {}) => new Promise((ok, bad) => {
  const p = spawn(cmd, args, { ...opts, detached: true }); let err = '', late = false;
  const timer = setTimeout(() => { late = true; try { process.kill(-p.pid, 'SIGKILL'); } catch {} }, secs * 1000);
  p.stderr.on('data', (d) => (err = (err + d).slice(-4000))); p.stdout?.resume();
  p.on('close', (c, sig) => { clearTimeout(timer); c || sig ? bad(new Error(late ? `${path.basename(cmd)} stopped after ${secs} s` : `${path.basename(cmd)} ${c ?? sig}: ${err.trim().split('\n').slice(-3).join(' | ')}`)) : ok(); });
});
export const ffmpeg = (args, opts) => run('ffmpeg', ['-loglevel', 'error', '-y', ...args], opts);

/** A cut's picture filters: 60 fps at W x H, its fade in or out, its white flash on the cut. */
export function cutFilters(c, dur, W, H) {
  let vf = `fps=${FPS},scale=${W}:${H}:flags=lanczos,setsar=1`;
  const len = c.fadeLen ?? 1.5;
  if (c.fade === 'in') vf += `,fade=t=in:st=0:d=${Math.min(len, dur / 2).toFixed(3)}`;
  if (c.fade === 'out') vf += `,fade=t=out:st=${Math.max(0, dur - len).toFixed(3)}:d=${Math.min(len, dur).toFixed(3)}`;
  if (c.flash) vf += ',fade=t=in:st=0:d=0.12:color=white';
  return vf;
}

/** A cut's stretch of a shot reframed by its virtual camera (edlcore vcamPath, as the editor shows it) into `out`: vcam.py
 * crops each frame of the master, decoded at `decode` (WxH; the master's own size unless given), to `size`. */
export async function vcam(c, clip, cin, n, out, { size = '3840x2160', decode = null, x264 = false } = {}) {
  const shot = readJson(path.join(ROOT, clip.id + '.json')), rs = (shot.cam || []).map((k) => k[5] || null);
  const rectAt = (sel, f) => rs[Math.min(rs.length - 1, Math.max(0, f))]?.[sel] || null;
  const vw = clip.vw || 1920, vh = clip.vh || 1080, k = decode ? +decode.split('x')[0] / vw : clip.scale || 3840 / vw;
  const boxes = vcamPath(c.vcam, Math.round(cin * FPS), n, vw, vh, rectAt, c.maxzoom ?? 2).map((b) => b.map((v) => +(v * k).toFixed(2)));
  const pathFile = out + '.path.json'; fs.writeFileSync(pathFile, JSON.stringify(boxes));
  try {
    await run(PY, [path.join(HERE, 'vcam.py'), path.join(ROOT, clip.id + '.mp4'), out, '--start', cin.toFixed(4), '--path', pathFile, '--size', size, ...(decode ? ['--decode', decode] : []), ...(x264 ? ['--x264'] : [])], { secs: 120 + n / 2 });
  } finally { fs.rmSync(pathFile, { force: true }); }
}

/** ffmpeg inputs (after input 0, a whole cut at W x H) and the filter graph laying an EDL's titles over it (and, unless
 * grade is false, its grade): { inputs, map (the -filter_complex and -map arguments), end (s) }. */
export function overlays(edl, times, W, H, { grade = true } = {}) {
  const when = makeWhen(times), end = edl.end != null ? when(edl.end) : times.total, inputs = [], fc = [];
  let last = '[0:v]';
  if (grade && edl.grade) { fc.push(`${last}${edl.grade}[g]`); last = '[g]'; }
  (edl.titles || []).forEach((tt, k) => {
    const a = when(tt.from), b = when(tt.to), fi = tt.fadeIn ?? 0.8, fo = tt.fadeOut ?? 0.8;
    inputs.push('-loop', '1', '-t', String(end + 1), '-i', path.join(TITLES, tt.png));
    fc.push(`[${k + 1}:v]scale=${W}:${H},format=rgba,fade=t=in:st=${a.toFixed(3)}:d=${fi}:alpha=1,fade=t=out:st=${(b - fo).toFixed(3)}:d=${fo}:alpha=1[t${k}]`);
    fc.push(`${last}[t${k}]overlay=0:0:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'[o${k}]`); last = `[o${k}]`;
  });
  return { inputs, end, map: fc.length ? ['-filter_complex', fc.join(';'), '-map', last] : ['-map', '0:v'] };
}
