// The editor's rendered preview, as an editing suite renders its timeline: every cut a 960x540 60 fps segment (its
// in-point, its virtual camera, fades, flash, the grade), kept by what is in it (edlcore segKey), so an edit renders again
// only the cuts it changed. Segments are fragmented MP4 the viewer appends to one video element (Media Source Extensions)
// at their places on the timeline: it plays straight through, and over a slow link an edit costs only the changed cuts'
// bytes, the rest kept by the browser.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawn } from 'node:child_process';
import { spans, inPoint, segKey, FPS } from './edlcore.mjs';
import { ffmpeg, cutFilters, vcam } from '../render.mjs';
import { ROOT, LIB, catalog, times } from '../paths.mjs';

// at most VCAM_JOBS reframes at once: each decodes its master on the GPU, and the UI shots' masters are 8K HEVC (eight
// at once filled 12 GB and every decoder stalled)
const W = 960, H = 540, JOBS = 8, VCAM_JOBS = 2, SEG = LIB + '/_preview/seg';
// every segment encoded alike (one SourceBuffer takes them all: avc1.640020), short GOPs for scrubbing, colour tagged,
// fragmented for MSE; from the 4K masters (re-encoding a proxy's compressed grain costs 3-4x the bits for the same
// picture), crf 27 under a 5 Mbit/s cap, so no stretch outruns a home upload for long
export const CODEC = 'video/mp4; codecs="avc1.640020"';
const ENC = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-maxrate', '5M', '-bufsize', '10M', '-profile:v', 'high', '-level:v', '3.2', '-g', '60', '-bf', '0', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4'];
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

// a segment is kept only with every frame in it (counted from its packets): eight 8K decodes at once once gave a segment
// with no frames at all, and ffmpeg called it a success
const whole = (file, n) => new Promise((ok, bad) => {
  const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]); let o = '';
  p.stdout.on('data', (d) => (o += d)); p.on('close', () => { const got = parseInt(o, 10) || 0; if (got === n) ok(); else { fs.rmSync(file, { force: true }); bad(new Error(`made ${got} of ${n} frames`)); } });
});

/** The EDL as segments: [{ hash, file, f0 (first frame), n, black, cut, clip, cin, grade }], a black lead-in when the first
 * cut starts late. */
export function plan(edl, byId = catalog()) {
  const segs = []; let f = 0;
  for (const c of spans(edl, times())) {
    if (c.dur <= 0) continue;
    const f0 = Math.round(c.t0 * FPS), n = Math.round(c.t1 * FPS) - f0;
    if (f0 > f) segs.push({ key: JSON.stringify({ black: 1, n: f0 - f }), n: f0 - f, f0: f, black: true });
    const clip = byId.get(c.clip) || null;
    segs.push({ key: segKey(c, clip, edl.grade), n, f0, black: !clip, cut: c, clip, cin: clip ? inPoint(c, c.dur, clip) : 0, grade: edl.grade || '' });
    f = f0 + n;
  }
  for (const s of segs) { s.hash = sha(s.key); s.file = `${SEG}/${s.hash}.mp4`; }
  return segs;
}

async function renderSeg(s) {
  const tmp = s.file + '.tmp.mp4';
  if (s.black) { await ffmpeg(['-f', 'lavfi', '-i', `color=black:s=${W}x${H}:r=${FPS}`, '-frames:v', String(s.n), ...ENC, tmp]); await whole(tmp, s.n); return fs.renameSync(tmp, s.file); }
  const c = s.cut, dur = s.n / FPS;
  // the master (decoded on the CPU: no GPU memory held), the interface's 8K masters from their proxies; a reframe from
  // the master decoded at 1080p (sharp to a 2x reframe)
  let src = (s.clip.vw || 1920) * (s.clip.scale || 2) <= 3840 ? path.join(ROOT, s.clip.id + '.mp4') : path.join(LIB, s.clip.proxy), at = s.cin, vtmp = null;
  if (c.vcam) { vtmp = s.file + '.vcam.mp4'; await vcam(c, s.clip, s.cin, s.n + 6, vtmp, { size: `${W}x${H}`, decode: '1920x1080', x264: true }); src = vtmp; at = 0; }
  // a shot a frame short holds its last frame rather than shortening the program
  const vf = cutFilters(c, dur, W, H) + (s.grade ? ',' + s.grade : '') + ',tpad=stop_mode=clone:stop_duration=2';
  try {
    await ffmpeg([...(at > 0 ? ['-ss', at.toFixed(4)] : []), '-t', (dur + 0.25).toFixed(4), '-i', src, '-vf', vf, '-frames:v', String(s.n), ...ENC, tmp], { secs: 120 + 30 * dur });
    await whole(tmp, s.n);
    fs.renameSync(tmp, s.file);
  } finally { if (vtmp) fs.rmSync(vtmp, { force: true }); }
}

export function makePreview() {
  fs.mkdirSync(SEG, { recursive: true });
  // segments not made again for two weeks are let go (an old edit's cuts; any still wanted are made again in seconds)
  for (const f of fs.readdirSync(SEG)) { const p = `${SEG}/${f}`; if (Date.now() - fs.statSync(p).mtimeMs > 14 * 864e5) fs.rmSync(p, { force: true }); }

  // one job at a time: a new EDL takes over the queue (segments being made finish and are kept), nearest the playhead first
  let job = null, running = 0, vcams = 0;
  const inflight = new Map(), queue = [];
  function pump() {
    while (running < JOBS && queue.length) {
      // the nearest segment that may start (a reframe waits while VCAM_JOBS are running, the others go past it)
      const k = queue.findIndex((q) => !q.cut?.vcam || q.black || vcams < VCAM_JOBS || inflight.has(q.hash) || fs.existsSync(q.file));
      if (k < 0) break;
      const [s] = queue.splice(k, 1); if (fs.existsSync(s.file)) { s.job.done++; finish(s.job); continue; }
      // already being made for an earlier EDL: wait for that one rather than make it twice (into the same file)
      let p = inflight.get(s.hash);
      if (!p) {
        const vc = !!(s.cut?.vcam && !s.black); running++; vcams += vc;
        p = renderSeg(s).finally(() => { running--; vcams -= vc; inflight.delete(s.hash); pump(); });
        inflight.set(s.hash, p);
      }
      p.then(() => { s.job.done++; }, (e) => { s.job.errors.push(`cut ${s.cut ? s.cut.i + 1 : '-'}: ${e.message}`); s.job.failed++; }).finally(() => finish(s.job));
    }
  }
  function finish(j) {
    if (j.state === 'segments' && j.done + j.failed >= j.segs.length) { j.state = j.failed ? 'failed' : 'ready'; j.t1 = Date.now(); }
  }
  // the segments as [first frame, frames, name, made, bytes]: the viewer appends each made one at its frame
  const view = (j) => j && { id: j.id, state: j.state, done: j.done, total: j.segs.length, secs: +(((j.t1 || Date.now()) - j.t0) / 1000).toFixed(1), errors: j.errors.slice(0, 5),
    codec: CODEC, segs: j.segs.map((s) => { const st = fs.statSync(s.file, { throwIfNoEntry: false }); return [s.f0, s.n, s.hash, st ? 1 : 0, st ? st.size : 0]; }) };

  return {
    /** Render what the EDL needs that isn't made yet, nearest `at` (s) first; returns its progress (view). */
    request(edl, at = 0) {
      const segs = plan(edl), id = sha(segs.map((s) => s.hash).join());
      if (job?.id === id && job.state !== 'failed') return view(job);
      const j = { id, segs, done: 0, failed: 0, errors: [], state: 'segments', t0: Date.now() };
      job = j; queue.length = 0;
      const atF = at * FPS, todo = segs.filter((s) => !fs.existsSync(s.file));
      j.done = segs.length - todo.length;
      todo.sort((a, b) => ((a.f0 + a.n < atF ? 1e9 : 0) + Math.abs(a.f0 - atF)) - ((b.f0 + b.n < atF ? 1e9 : 0) + Math.abs(b.f0 - atF)));
      for (const s of todo) queue.push({ ...s, job: j });
      // the same segment twice in one EDL (rare) is made once
      const seen = new Set(); for (let k = queue.length - 1; k >= 0; k--) { if (seen.has(queue[k].hash)) { queue.splice(k, 1); j.done++; } else seen.add(queue[k].hash); }
      pump(); finish(j);
      return view(j);
    },
    status: () => view(job),
  };
}
