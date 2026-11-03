// Film (docs/film.md): what the view shows, for as long as the viewer films, as a video. Each frame the
// world's canvas (and the overlay of marks drawn over it) is copied, scaled to at most 1080p, onto a
// canvas of the film's own, the auto camera's caption burned in at the bottom and a small title in a
// corner; that canvas is recorded with MediaRecorder, with the soundtrack when it plays. Armed while the
// auto camera is on, it waits for the camera's next shot and films from its start.
//
// Where the film goes as it is made (a sink), the first that works:
// - the desktop app: straight into Videos/Tidemote (window.tidemoteDesktop.film), the free disk its limit;
// - the browser's own private files (OPFS, createWritable): on disk, never in memory, its quota the
//   limit; downloaded when it ends (the copy stays until the next film or a few minutes);
// - memory: the recorder's chunks kept as Blobs (Chrome holds 2 GiB of them before paging to disk,
//   in a private window none; others hold all of them), so its limit is low.
// WebM is mended as it is written (src/webm.js): a duration, and an index to seek by.
// A film stops by itself a little before its sink's limit (`limit()`); the page warns as it nears.
//
// Cost: nothing until asked; while filming, 30 scaled copies of the canvas a second (on the GPU in
// Chromium), the browser's video encoder, and a write of one or two megabytes a second.
//
// For tools only: __FILM_OPTS ({ mime, bps, kfi, cap }: another format, bitrate, keyframe interval or a
// lower limit; tools/film-check.mjs, tools/film-quality.mjs) and __FILM_PROBE (film-quality's barcode
// and lossless frames).
import { createWebmFix } from './webm.js';

// H.264 in MP4 first: browsers encode it on the GPU where they can (Chrome on Windows and macOS), so a film
// keeps its 30 frames a second and the page its pace, and it plays everywhere; AAC where the browser has
// it (Chrome on Windows and macOS, Safari), else Opus. Then VP9 (Firefox), encoded on the CPU: at 1080p on
// four cores it kept 18 of 30 frames a second, the page 17 fps (docs/film.md, Quality).
const TYPES = [['video/mp4;codecs=avc1.64002a,mp4a.40.2', 'mp4'], ['video/mp4;codecs=avc1.64002a,opus', 'mp4'],
  ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'], ['video/mp4', 'mp4']];
const GB = 1e9;
/** The most a film may grow to, by sink: on disk, half what is free (the download copies it) up to 8 GB
 *  (an hour at 1080p from an encoder that meets its 18.7 Mb/s, two from one that writes half, as the
 *  software H.264 here does); in memory 1 GB, or 300 MB on a phone or a small machine (docs/film.md). */
const FILM_CAP = { disk: 8 * GB, memory: 1 * GB, memorySmall: 0.3 * GB };
const OPFS_PREFIX = 'tidemote-film-';

/** The recording format this browser offers: [mimeType, extension], or null. */
function filmFormat() {
  const MR = globalThis.MediaRecorder;
  if (!MR || !globalThis.HTMLCanvasElement?.prototype.captureStream) return null;
  return TYPES.find(([t]) => MR.isTypeSupported?.(t)) || null;
}

/** The film's size: the source's aspect, at most maxW × maxH, even (encoders want even sizes). */
function filmSize(w, h, maxW = 1920, maxH = 1080) {
  const k = Math.min(1, maxW / w, maxH / h);
  return [Math.max(2, Math.round((w * k) / 2) * 2), Math.max(2, Math.round((h * k) / 2) * 2)];
}

/** The bitrate asked of the encoder: 0.3 bits a pixel a frame at 30 fps (1080p: 18.7 Mb/s), at most 24 Mb/s.
 *  The world is fine detail and grain, which a real-time encoder smears at less (docs/film.md, Quality). */
const filmBitrate = (w, h) => Math.round(Math.min(24e6, w * h * 30 * 0.3));

/** A film's byte limit on a sink that has `free` bytes (Infinity unknown); `small`: a phone or small machine. */
function filmLimit(kind, free = Infinity, small = false) {
  if (kind === 'memory') return small ? FILM_CAP.memorySmall : FILM_CAP.memory;
  return Math.max(0, Math.min(FILM_CAP.disk, free / 2));
}

/** Whether this is a phone or a machine with little memory (navigator.deviceMemory, where told). */
const smallDevice = () => (navigator.deviceMemory != null && navigator.deviceMemory <= 4) || !!globalThis.matchMedia?.('(pointer: coarse)').matches;

// ---------------------------------------------------------------- sinks
// open(name) -> { kind, cap, write(bytes, blob?), patch(at, bytes), finish() -> { blob?, path? }, abort() }

async function desktopSink(desk, name) {
  const f = await desk.open(name);
  return {
    kind: 'desktop', cap: filmLimit('disk', f.free ?? Infinity),
    write: (b) => desk.write(f.id, b), patch: (at, b) => desk.patch(f.id, at, b),
    finish: async () => ({ path: await desk.close(f.id) }),
    abort: () => desk.abort(f.id),
  };
}

/** The browser's private files: whether this browser can write them as a stream. */
const opfsOk = () => !!(navigator.storage?.getDirectory && globalThis.FileSystemFileHandle?.prototype.createWritable);
/** Films left in the private files (one being downloaded, or one cut off by a closed tab): removed. */
export async function clearFilms() {
  if (!opfsOk()) return;
  try {
    const dir = await navigator.storage.getDirectory();
    for await (const n of dir.keys()) if (n.startsWith(OPFS_PREFIX)) await dir.removeEntry(n).catch(() => {});
  } catch { /* nothing kept */ }
}
async function opfsSink(name) {
  if (!opfsOk()) throw new Error('no private files');
  const file = OPFS_PREFIX + name;
  await clearFilms();
  const dir = await navigator.storage.getDirectory();
  const h = await dir.getFileHandle(file, { create: true });
  const w = await h.createWritable();
  const est = await navigator.storage.estimate?.().catch(() => null);
  const free = est && est.quota ? est.quota - (est.usage || 0) : Infinity;
  return {
    kind: 'disk', cap: filmLimit('disk', free),
    write: (b) => w.write(b),
    patch: (at, b) => w.write({ type: 'write', position: at, data: b }),
    finish: async () => {
      await w.close();
      const blob = await h.getFile();
      // the download reads it from here: removed once that is surely done (or at the next film)
      setTimeout(() => clearFilms(), 10 * 60 * 1000);
      return { blob };
    },
    abort: async () => { try { await w.abort(); } catch { /* closed */ } clearFilms(); },
  };
}
function memorySink(type) {
  const parts = []; // Blobs as the recorder gave them; Uint8Arrays for what was rewritten (the head)
  return {
    kind: 'memory', cap: filmLimit('memory', Infinity, smallDevice()),
    write: (b, blob) => { parts.push(blob || b); },
    patch: (at, b) => {
      // the patches fall in the head, the first parts (always bytes, never Blobs)
      let o = 0;
      for (const p of parts) {
        if (!(p instanceof Uint8Array)) break;
        if (at >= o && at + b.length <= o + p.length) { p.set(b, at - o); return; }
        o += p.length;
      }
    },
    finish: async () => ({ blob: new Blob(parts, { type }) }),
    abort: () => { parts.length = 0; },
  };
}

/**
 * createFilm({ canvas, source () -> [w, h] the view's full size in device pixels, overlay, caption (the caption element), audio () -> MediaStream|null,
 *   title () -> string (the corner's words), name () -> file name stem, desktop (window.tidemoteDesktop.film, or null),
 *   onChange (state), onSaved ({ blob?, path?, name, bytes, why }), onError (message) })
 * Returns { supported, state, start(), arm(), stop(), frame(), elapsed(), bytes(), limit(), left(), size(), sink() }.
 * state: idle | armed | recording | saving.
 */
export function createFilm({ canvas, source = null, overlay = null, caption = null, audio = () => null, title = () => '', name = () => 'tidemote', desktop = null, onChange = () => {}, onSaved = null, onError = () => {} }) {
  const fmt = filmFormat();
  const st = { state: 'idle', rec: null, cv: null, ctx: null, capA: 0, t0: 0, tEnd: 0, bytes: 0, rate: [], sink: null, cap: Infinity, why: '' };
  const set = (s) => { st.state = s; onChange(s); };

  function start() {
    if (!fmt || st.state === 'recording' || st.state === 'saving') return false;
    // its size from what the view could show (source(), device pixels), not from the canvas, which the
    // page's render scale may have shrunk for the moment
    const [w, h] = filmSize(...(source ? source() : [canvas.width, canvas.height]));
    st.cv = st.cv || document.createElement('canvas');
    st.cv.width = w; st.cv.height = h;
    st.ctx = st.cv.getContext('2d', { alpha: false });
    st.ctx.fillStyle = '#000'; st.ctx.fillRect(0, 0, w, h);
    // frames handed over by hand, 30 a second at most (frame()): none copied that the stream would drop
    const manual = !!globalThis.CanvasCaptureMediaStreamTrack?.prototype.requestFrame;
    const stream = st.cv.captureStream(manual ? 0 : 30);
    st.track = stream.getVideoTracks()[0];
    st.last = -Infinity;
    const snd = audio();
    if (snd) for (const tr of snd.getAudioTracks()) stream.addTrack(tr);
    let rec;
    // A keyframe a second: Chrome's MP4 comes a fragment per keyframe, every 3.4 s by itself, so the size
    // shown would step every 3.4 s; a second's keyframes cost nothing measurable (docs/film.md, Quality)
    // and a seek lands within a second.
    const ask = globalThis.__FILM_OPTS || {};
    const mime = ask.mime && MediaRecorder.isTypeSupported(ask.mime) ? ask.mime : fmt[0];
    st.n = 0;
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: ask.bps || filmBitrate(w, h), audioBitsPerSecond: 128000, videoKeyFrameIntervalDuration: ask.kfi ?? 1000 }); }
    catch { try { rec = new MediaRecorder(stream); } catch { return false; } }
    const type = rec.mimeType || fmt[0];
    const file = `${name()}.${/mp4/.test(type) ? 'mp4' : 'webm'}`;
    const fix = /webm/.test(type) ? createWebmFix() : null;
    st.bytes = 0; st.rate = []; st.why = ''; st.cap = Infinity; st.sink = null;
    // the sink opens while the recorder starts; its writes wait for it, in order
    const sinkP = (desktop ? desktopSink(desktop, file) : Promise.reject(new Error('no desktop')))
      .catch(() => opfsSink(file)).catch(() => memorySink(type))
      .then((s) => { st.sink = s; st.cap = Math.min(s.cap, ask.cap || Infinity); return s; });
    let chain = sinkP;
    let failed = false;
    const fail = (e) => {
      if (failed) return; failed = true;
      onError(`The film could not be written: ${e?.message || e}`);
      if (rec.state !== 'inactive') rec.stop();
    };
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const blob = e.data;
      chain = chain.then(async (s) => {
        if (failed) return s;
        const u8 = new Uint8Array(await blob.arrayBuffer());
        for (const b of fix ? fix.push(u8) : [u8]) { await s.write(b, b === u8 ? blob : null); st.bytes += b.length; }
        const now = performance.now();
        st.rate.push([now, st.bytes]);
        while (st.rate.length > 2 && now - st.rate[0][0] > 30000) st.rate.shift();
        // a little before the limit (two seconds' worth to spare), it stops itself
        if (st.state === 'recording' && st.bytes + 2 * rateNow() >= st.cap) { st.why = 'limit'; stop(); }
        return s;
      }).catch((err) => { fail(err); return st.sink; });
    };
    rec.onstop = () => {
      for (const tr of stream.getVideoTracks()) tr.stop();
      st.rec = null;
      st.tEnd = performance.now();
      set('saving');
      chain.then(async (s) => {
        if (failed) { await s?.abort?.(); return null; }
        const e = fix && fix.end();
        if (e) {
          if (e.tail.length) { await s.write(e.tail); st.bytes += e.tail.length; }
          for (const p of e.patches) await s.patch(p.at, p.bytes);
        }
        return s.finish();
      }).then((out) => {
        set('idle');
        if (out && (out.path || (out.blob && out.blob.size))) onSaved?.({ ...out, name: file, bytes: st.bytes, why: st.why });
      }).catch((err) => { set('idle'); onError(`The film could not be saved: ${err?.message || err}`); });
    };
    rec.start(1000);
    st.rec = rec;
    st.t0 = performance.now();
    set('recording');
    frame();
    return true;
  }
  function stop() {
    if (st.state === 'armed') { set('idle'); return; }
    if (st.rec && st.rec.state !== 'inactive') st.rec.stop();
  }
  const arm = () => { if (fmt && st.state === 'idle') set('armed'); };
  /** Bytes a second, over the last half minute (0 until two chunks are in). */
  function rateNow() {
    const r = st.rate;
    if (r.length < 2) return 0;
    const a = r[0], b = r[r.length - 1];
    return b[0] > a[0] ? ((b[1] - a[1]) * 1000) / (b[0] - a[0]) : 0;
  }

  // the caption, as the page shows it: its three lines, faded in and out with it
  function drawCaption(ctx, w, h) {
    if (!caption) return;
    st.capA += ((caption.classList.contains('on') ? 1 : 0) - st.capA) * 0.08;
    const part = (cls) => caption.querySelector(`.${cls}`)?.textContent || '';
    const eye = part('cap-eye'), main = part('cap-main'), sub = part('cap-sub');
    if (st.capA < 0.02 || !main) return;
    const s = h / 1080, F = 'Saira, Bahnschrift, "Segoe UI", system-ui, sans-serif';
    ctx.save();
    ctx.globalAlpha = st.capA;
    ctx.textAlign = 'center';
    const y = h - 96 * s;
    const g = ctx.createLinearGradient(0, y - 90 * s, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 90 * s, w, h - y + 90 * s);
    ctx.fillStyle = '#7fd6df'; ctx.font = `500 ${Math.round(18 * s)}px ${F}`;
    ctx.fillText(eye.toUpperCase(), w / 2, y - 44 * s);
    ctx.fillStyle = 'rgba(150,222,230,0.55)'; ctx.fillRect(w / 2 - 24 * s, y - 34 * s, 48 * s, Math.max(1, s));
    ctx.fillStyle = '#e2f1f0'; ctx.font = `400 ${Math.round(32 * s)}px ${F}`;
    ctx.fillText(main, w / 2, y);
    if (sub) { ctx.fillStyle = '#a3bdbe'; ctx.font = `400 ${Math.round(20 * s)}px ${F}`; ctx.fillText(sub, w / 2, y + 32 * s); }
    ctx.restore();
  }
  /** Call right after the world's canvas was drawn this frame (its texture is still current). */
  function frame() {
    if (st.state !== 'recording' || !st.ctx) return;
    const now = performance.now();
    if (now - st.last < 1000 / 30 - 4) return;
    st.last = Math.max(now - 1000 / 30, st.last + 1000 / 30); // (on the 30 fps beat, without drifting behind)
    const ctx = st.ctx, { width: w, height: h } = st.cv;
    ctx.drawImage(canvas, 0, 0, w, h);
    if (overlay && overlay.width) ctx.drawImage(overlay, 0, 0, w, h);
    drawCaption(ctx, w, h);
    const s = h / 1080;
    ctx.save();
    ctx.font = `500 ${Math.round(15 * s)}px Saira, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(226,241,240,0.6)';
    ctx.fillText(title(), w - 24 * s, 34 * s);
    ctx.restore();
    const probe = globalThis.__FILM_PROBE;
    if (probe) {
      // (tools/film-quality.mjs: each frame's number as a barcode in the bottom left corner, 16 blocks of
      // 12 px, and every 30th frame kept losslessly to compare with what was encoded)
      const n = st.n++;
      ctx.fillStyle = '#000'; ctx.fillRect(0, h - 24, 16 * 12 + 12, 24);
      ctx.fillStyle = '#fff';
      for (let k = 0; k < 16; k++) if ((n >> k) & 1) ctx.fillRect(6 + k * 12, h - 18, 12, 12);
      if (n % 30 === 15) st.cv.toBlob((b) => probe.refs.push([n, b]), 'image/png');
    }
    st.track?.requestFrame?.();
  }
  return {
    supported: !!fmt, start, stop, arm, frame,
    get state() { return st.state; },
    /** Seconds filmed (recording or saving), else 0. */
    elapsed: () => (st.state === 'recording' ? (performance.now() - st.t0) / 1000 : st.state === 'saving' ? (st.tEnd - st.t0) / 1000 : 0),
    /** Bytes of the film written so far: its size, exactly, once it is saved. */
    bytes: () => st.bytes,
    /** The byte limit of this film's sink (Infinity until it is open). */
    limit: () => st.cap,
    /** Seconds until the limit at the present rate (Infinity while unknown). */
    left: () => { const r = rateNow(); return st.state === 'recording' && r > 0 && Number.isFinite(st.cap) ? Math.max(0, (st.cap - st.bytes) / r) : Infinity; },
    /** The film's frame size, [w, h] (while filming). */
    size: () => (st.cv ? [st.cv.width, st.cv.height] : null),
    /** Where it goes: desktop | disk | memory (null until known). */
    sink: () => st.sink?.kind || null,
  };
}
