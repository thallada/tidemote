// Film (docs/next-level-2026-10-20.md §4.5): thirty seconds of what the view shows, as a video the
// browser downloads. Each frame the world's canvas (and the overlay of marks drawn over it) is copied,
// scaled to at most 1080p, onto a canvas of the film's own, the auto camera's caption burned in at
// the bottom and a small title in a corner; that canvas is recorded with MediaRecorder, with the
// soundtrack when it plays. Armed while the auto camera is on, it waits for the camera's next shot
// and films from its start.
//
// Cost: nothing until asked; while filming, one scaled copy of the canvas a frame (on the GPU in
// Chromium) and the browser's video encoder.

const TYPES = [['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'], ['video/mp4;codecs=avc1,mp4a', 'mp4'], ['video/mp4', 'mp4']];

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

/**
 * createFilm({ canvas, overlay, caption (the caption element), audio () -> MediaStream|null,
 *   title () -> string (the corner's words), name () -> file name stem, onChange (state), onSaved (blob, name) })
 * Returns { supported, state, start(seconds), arm(), stop(), frame(), left() }.
 */
export function createFilm({ canvas, overlay = null, caption = null, audio = () => null, title = () => '', name = () => 'tidemote', onChange = () => {}, onSaved = null }) {
  const fmt = filmFormat();
  const st = { state: 'idle', rec: null, chunks: [], until: 0, cv: null, ctx: null, capA: 0 };
  const set = (s) => { st.state = s; onChange(s); };

  function start(seconds = 30) {
    if (!fmt || st.state === 'recording') return false;
    const [w, h] = filmSize(canvas.width, canvas.height);
    st.cv = st.cv || document.createElement('canvas');
    st.cv.width = w; st.cv.height = h;
    st.ctx = st.cv.getContext('2d', { alpha: false });
    st.ctx.fillStyle = '#000'; st.ctx.fillRect(0, 0, w, h);
    const stream = st.cv.captureStream(30);
    const snd = audio();
    if (snd) for (const tr of snd.getAudioTracks()) stream.addTrack(tr);
    st.chunks = [];
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: fmt[0], videoBitsPerSecond: Math.round(Math.min(12e6, w * h * 30 * 0.12)), audioBitsPerSecond: 128000 }); }
    catch { try { rec = new MediaRecorder(stream); } catch { return false; } }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) st.chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(st.chunks, { type: rec.mimeType || fmt[0] });
      st.chunks = [];
      for (const tr of stream.getVideoTracks()) tr.stop();
      st.rec = null;
      set('idle');
      if (blob.size) onSaved?.(blob, `${name()}.${fmt[1]}`);
    };
    rec.start(1000);
    st.rec = rec;
    st.until = performance.now() + seconds * 1000;
    set('recording');
    frame();
    return true;
  }
  function stop() {
    if (st.state === 'armed') { set('idle'); return; }
    if (st.rec && st.rec.state !== 'inactive') st.rec.stop();
  }
  const arm = () => { if (fmt && st.state === 'idle') set('armed'); };

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
    if (performance.now() >= st.until) stop();
  }
  return {
    supported: !!fmt, start, stop, arm, frame,
    get state() { return st.state; },
    /** Seconds left of the take (recording), else 0. */
    left: () => (st.state === 'recording' ? Math.max(0, (st.until - performance.now()) / 1000) : 0),
  };
}
