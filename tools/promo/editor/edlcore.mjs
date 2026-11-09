// The EDL's arithmetic, shared by the editor page and the renders (preview.mjs, draft.mjs, master.mjs): where a cut's
// "bar:step" falls on the track's grid, each cut's span (until the next cut, on whole frames), the in-point a cut uses
// (at least 0.2 s in, a dancer's first stroke on the cut, never past the shot's end) and its virtual camera, so what the
// editor shows is what the renders make.
// An EDL: { cuts: [{ at: "bar:step", clip: "lib2/w01/close_0_z300", in: s, dance: 1, vcam: [keyframes], maxzoom: 2,
//   fade: "in"|"out", fadeLen: s, flash: 1, cat: slot kind }], titles: [{ png, from, to, fadeIn, fadeOut }], end: "bar:step",
//   grade: "eq=..." (an ffmpeg filter) }
export const FPS = 60;
export function makeWhen(times) {
  const steps = times.steps, L = steps.length, dt = steps[L - 1] - steps[L - 2];
  return (a) => {
    if (typeof a === 'number' && a === 0) return 0;
    const [b, s = 0] = String(a).split(':').map(Number), n = b * 16 + s, i = Math.floor(n), f = n - i;
    if (i >= L) return Math.min(times.total, steps[L - 1] + (i - L + 1 + f) * dt);
    const t0 = steps[i], t1 = i + 1 < L ? steps[i + 1] : t0 + dt;
    return t0 + (t1 - t0) * f;
  };
}
/** The grid position (fractional steps from bar 0) nearest a time, and back to "bar:step". */
export function stepAt(times, t) {
  const s = times.steps;
  if (t <= s[0]) return 0;
  for (let i = 0; i + 1 < s.length; i++) if (t < s[i + 1]) return i + (t - s[i]) / (s[i + 1] - s[i]);
  const dt = s[s.length - 1] - s[s.length - 2];
  return s.length - 1 + (t - s[s.length - 1]) / dt;
}
export const atOf = (n) => { const b = Math.floor(n / 16 + 1e-9), st = +(n - b * 16).toFixed(3); return st ? `${b}:${st}` : `${b}:0`; };
export const stepsOf = (at) => { if (typeof at === 'number') return at * 16; const [b, s = 0] = String(at).split(':').map(Number); return b * 16 + s; };
/** Each cut with i, t0, t1 (seconds, on whole frames) and dur. */
export function spans(edl, times) {
  const when = makeWhen(times), end = edl.end != null ? when(edl.end) : times.total;
  const cs = edl.cuts.map((c) => ({ ...c, t: when(c.at) }));
  return cs.map((c, i) => {
    const t0 = Math.round(c.t * FPS) / FPS, t1 = Math.round((i + 1 < cs.length ? cs[i + 1].t : end) * FPS) / FPS;
    return { ...c, i, t0, t1, dur: t1 - t0 };
  });
}
/** The in-point for a cut of `dur` seconds of `clip` (catalogue entry: frames, sim0, beat). A dancer (cut.dance, a
 * shot filmed at the speed that puts its strokes on the tempo) starts on a stroke: the first whole beat of its genes
 * after the asked in-point, earlier by whole strokes if the cut would run past the shot. */
export function inPoint(cut, dur, clip) {
  const len = clip.frames / FPS - 0.05;
  let cin = Math.max(0.2, cut.in ?? 0);
  if (cut.dance && clip.beat) {
    const f = clip.beat.beat[1], sp = clip.beat.speed || 1;
    const sim0 = clip.sim0 + sp / FPS, k = Math.ceil(f * (sim0 + sp * cin) - 1e-6);
    cin = (k / f - sim0) / sp;
    const stroke = 1 / f / sp;
    while (cin + dur > len && cin - stroke >= 0.2) cin -= stroke;
  }
  if (cin + dur > len) cin = Math.max(0, len - dur);
  return cin;
}
/** One keyframe's box (css px of the shot's page) at a frame of the shot: [x, y, w, h], "full", or a tracked selector
 * (resolved by `rectAt(sel, frame)`; null while unknown; "#__ptr" is the pointer, framed `size` px around it), padded
 * by `pad` (0.08 unless given), widened to 16:9, no tighter than maxzoom, inside the frame. */
function kfBox(kf, frame, vw, vh, rectAt, maxzoom) {
  let b = kf.box;
  if (b === 'full' || b == null) return [0, 0, vw, vh];
  if (typeof b === 'string') { const r = rectAt && rectAt(b, frame); if (!r) return null; b = r; if (kf.box === '#__ptr') { const s = kf.size || 220; b = [b[0] + 3 - s / 2, b[1] + 2 - s * 0.28, s, s * 0.56]; } }
  let [x, y, w, h] = b; const pad = kf.pad ?? 0.08;
  x -= w * pad; y -= h * pad; w *= 1 + 2 * pad; h *= 1 + 2 * pad;
  if (w / h < vw / vh) { const w2 = h * vw / vh; x -= (w2 - w) / 2; w = w2; } else { const h2 = w * vh / vw; y -= (h2 - h) / 2; h = h2; }
  if (w < vw / maxzoom) { x -= (vw / maxzoom - w) / 2; y -= (vh / maxzoom - h) / 2; w = vw / maxzoom; h = vh / maxzoom; }
  if (w > vw) return [0, 0, vw, vh];
  return [Math.min(Math.max(0, x), vw - w), Math.min(Math.max(0, y), vh - h), w, h];
}
const smooth = (x) => x * x * (3 - 2 * x);
/** The plan's box at time t into the cut: the keyframe's, eased into the next over that one's `ease` seconds (a target
 * that can't be resolved holds `last`). */
function planBox(plan, t, frame, vw, vh, rectAt, maxzoom, last) {
  let j = 0; for (let q = 0; q < plan.length; q++) if (plan[q].t <= t) j = q;
  const r0 = kfBox(plan[j], frame, vw, vh, rectAt, maxzoom) || last, nx = plan[j + 1], e = nx?.ease ?? 0.9;
  if (!nx || e <= 0 || t <= nx.t - e) return r0;
  const r1 = kfBox(nx, frame, vw, vh, rectAt, maxzoom) || r0, s = smooth(Math.min(1, (t - (nx.t - e)) / e));
  return r0.map((v, k) => v + (r1[k] - v) * s);
}
/** The plan's box at time t (no spring): for setting boxes in the editor. */
export const boxAt = (plan, t, frame, vw, vh, rectAt, maxzoom = 2) => (plan?.length ? planBox(plan, t, frame, vw, vh, rectAt, maxzoom, [0, 0, vw, vh]) : [0, 0, vw, vh]);
/** The virtual camera, frame by frame: n frames of a cut from frame f0 of the shot, each the plan's box followed by a
 * critically damped spring (`spring` rad/s) on the centre and the log of the width, so it arrives gently and lags a quick
 * move. What the editor shows and what vcam.py crops. */
export function vcamPath(plan, f0, n, vw, vh, rectAt, maxzoom = 2, spring = 5) {
  const want = []; let last = [0, 0, vw, vh];
  for (let i = 0; i < n; i++) want.push((last = planBox(plan, i / FPS, f0 + i, vw, vh, rectAt, maxzoom, last)));
  const dt = 1 / FPS, w0 = spring, step = (p, v, tg) => { v += (w0 * w0 * (tg - p) - 2 * w0 * v) * dt; return [p + v * dt, v]; };
  let cx = want[0][0] + want[0][2] / 2, cy = want[0][1] + want[0][3] / 2, lw = Math.log(want[0][2]), vx = 0, vy = 0, vl = 0;
  return want.map(([x, y, w, h]) => {
    [cx, vx] = step(cx, vx, x + w / 2); [cy, vy] = step(cy, vy, y + h / 2); [lw, vl] = step(lw, vl, Math.log(w));
    const W = Math.exp(lw), H = W * vh / vw;
    return [Math.min(Math.max(0, cx - W / 2), vw - W), Math.min(Math.max(0, cy - H / 2), vh - H), W, H];
  });
}
/** How hard the song hits at each 16th step (accent.json, beats/accent.py: from the audio's attacks) and where the score's
 * kicks are (events.json). What the editor's ticks and marks, its "strong hits" snap and beats/retime.mjs go by. */
export function hitMap(times, events, accent) {
  const st = times.steps, hit = Float32Array.from(accent), kick = new Uint8Array(st.length);
  for (const [t, layer] of events) {
    if (layer !== 'kick') continue;
    let lo = 0, hi = st.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (st[m] < t - 0.004) lo = m + 1; else hi = m; }
    if (Math.abs(st[lo] - t) < 0.006) kick[lo] = 1;
  }
  return { hit, kick };
}
/** A cut at step n is on the beat when nothing within two steps hits harder (80%: the attacks' own scatter): a cut just
 * beside a bigger hit is the one that feels early or late. */
export const onHit = (hit, n) => { let m = 0; for (let k = Math.max(0, n - 2); k <= Math.min(hit.length - 1, n + 2); k++) m = Math.max(m, hit[k]); return hit[n] >= 0.15 && hit[n] >= 0.8 * m; };
/** The slot kind of a catalogue clip: its category, a swimmer by the tempo it was filmed for, a time-lapse by its speed. */
export function slotCat(c) {
  if (c.cat === 'swim') return c.name.endsWith('_116') ? 'dance116' : 'dance112';
  if (c.cat === 'lapse') return c.meta.speed >= 16 ? 'lapse16' : 'lapse4';
  return c.cat;
}
// Which library kinds may fill a slot of a kind (the first preferred).
export const FAMILY = { close: ['close', 'deep'], deep: ['deep', 'close'], dive: ['dive', 'drift'], wide: ['wide', 'pan', 'drift'], pan: ['pan', 'wide'], drift: ['drift', 'pan', 'dive'],
  dance112: ['dance112', 'dance116'], dance116: ['dance116', 'dance112'], lapse4: ['lapse4'], lapse16: ['lapse16', 'lapse4'], event: ['event'], trails: ['trails'],
  outro: ['outro'], macro: ['macro'], ui: ['ui', 'notes'], notes: ['notes', 'auto'], auto: ['auto', 'notes'] };
export const slotFamily = (k) => FAMILY[k] || [k];
/** A good in-point for a shot put in a cut of dur seconds: moving shots from near their start, others their middle. */
export function autoIn(clip, dur) {
  const len = clip.frames / FPS - 0.05, room = Math.max(0, len - dur - 0.2);
  if (['pan', 'drift', 'macro', 'dive', 'outro'].includes(clip.cat) || clip.meta?.move) return +(0.2 + Math.min(room, 0.3)).toFixed(3);
  return +(0.2 + room * 0.45).toFixed(3);
}
/** The rendered preview (preview.mjs): each cut a 540p segment named by everything that shows in it, so an edit renders
 * again only the cuts it changed, and the viewer fetches (and its browser keeps) only those. The grade is in the segment;
 * titles stay the viewer's own overlay. */
export const PREVIEW_V = 5;
export function segKey(cut, clip, grade) {
  const n = Math.round(cut.t1 * FPS) - Math.round(cut.t0 * FPS);
  if (!clip) return JSON.stringify({ v: PREVIEW_V, black: 1, n });
  return JSON.stringify({ v: PREVIEW_V, clip: clip.id, m: Math.round(clip.mtime || 0), cin: +inPoint(cut, cut.dur, clip).toFixed(5), n, vcam: cut.vcam || null, mz: cut.maxzoom ?? 2,
    fade: cut.fade || null, fl: cut.fadeLen ?? 1.5, flash: cut.flash ? 1 : 0, grade: grade || '' });
}
