// The live annotations drawn (docs/annotations.md): src/notes.js says what to mark, this draws it on the page's
// overlay canvas, over the world, in the manner of a drone's HUD: two hues (a pale cyan-white for structure and the
// second party, a red-orange for the subject, danger and a kill), hairline rules with end ticks, thin hero numerals,
// tracked micro-labels, 45° leaders onto level shelves, stepped hatched zones, reticles, and text that types itself
// on. State is told by form: a filled tag, hatching, a hollow or dashed mark. Every mark rides on a cell the GPU
// found (by id, carried on to the moment shown), so it sits where its cell shows.
//
// Steadiness: the marks ride the scene as what they mark does. A cell's mark follows it by id, a new sample's
// correction eased out, and fades in and out rather than popping. A stretch of the world (water too warm, ice, light,
// stone, a crowd, a range) is an organic shape: smooth loops where a field crosses a level (src/contour.js), fixed in
// the world, its hatching fixed to it too, a crowd's eased from look to look. A label is placed once, about the one
// cell it hangs on, and holds still on the screen (its leader reaches to the cell); it stays at least 3 s once read and
// never blinks back once gone. No two pieces of text overlap: a label with no room waits hidden, its marks with it.
import { NOTE_TG } from './shaders.js';
import { createAudit } from './noteaudit.js';
import { fmtLen, UM_PER_UNIT } from './fmt.js';
import { contours, smooth } from './contour.js';
import { squareOf } from './notes.js';
import { tr } from './i18n.js';

const FONT = 'Saira, Bahnschrift, "DIN Alternate", "Segoe UI", system-ui, sans-serif'; // i18n-ignore: a font
const INK = '226,241,240', INK2 = '163,189,190', INK3 = '111,138,140', LINE = '150,222,230', HOT = '255,95,58', CYAN = '127,214,223', SUN = '255,204,92';
// (dry land's sand, duckweed's moss)
const SAND = '214,178,124', MOSS = '142,196,110';
const SHADE = 'rgba(4,7,8,0.85)', HALO = 'rgba(0,0,0,0.55)', PLATE = 'rgba(4,7,8,0.8)';
const rgba = (c, a) => `rgba(${c},${a})`;
const SCRAMBLE = '0123456789ABCDEFHKLMNPRSTVXZ/·-';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const NONE = 0xffffffff;
const hashU = (id) => (Math.imul(id, 2654435761) >>> 0) / 4294967296;

// the type, as the page's own labels: [weight, size, tracking (em), stretch]
const TYPE = {
  tag: [600, 11, 0.2, 'semi-expanded'],
  eye: [500, 11, 0.24, 'semi-expanded'],
  main: [400, 12.5, 0.14, 'semi-expanded'],
  num: [200, 24, 0.04, 'semi-expanded'],
  data: [400, 11, 0.1, 'normal'],
  micro: [500, 11, 0.14, 'normal'],
  head: [500, 11, 0.2, 'semi-expanded'],
  dial: [300, 15, 0.04, 'normal'],
};

// how steadily (seconds, but for the placement's score and px)
const STEADY = {
  settle: 0.12,    // a cell's mark eases out a new sample's correction
  fade: 0.25,      // a cell's mark fades in or out
  follow: 0.3,     // a label follows its cell's own motion (a swimmer's beat) this smoothly, the camera's exactly
  roster: 0.6,     // the roster's numbers change this often; a species passes another only with 15% more
  minShow: 3,      // a label once shown stays at least this long (as its note does: notes.js TUNE.minLife)
  glide: 1.5,      // a label held on the screen glides after a cell gone far from it this slowly
  frozen: 1.2,     // a note whose cell is lost from view fades out where it was last seen over this long
};

export function createNoteView(g) {
  const widths = new Map();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hatch = {};
  // per note (by id): its marks' state (cells by id, its shapes, its anchors); per label: its place; per cell id: its mark
  const notesAt = new Map();
  const lay = new Map();
  const marks = new Map();
  const rosterSt = { at: -1e9, rows: [] }, modeSt = {};
  let A = null, owner = '', ref = null, stats = null;
  // the labels' boxes last frame (a link's verb gives way to a label already there)
  let lastLabels = [], nextLabels = [];
  // (widths measured before the page's face arrived are the fallback's: measured again once it has)
  if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => widths.clear());

  // (the canvas parses a font each time it is set: set only when it changes, forgotten whenever anyone else sets one)
  let cur = null;
  function setType(k) {
    if (cur === k) return;
    cur = k;
    const [w, px, tr, st] = TYPE[k];
    g.font = `${w} ${px}px ${FONT}`;
    g.fontStretch = st;
    g.letterSpacing = `${tr * px}px`;
  }
  function width(k, s) {
    const key = `${k}|${s}`;
    let w = widths.get(key);
    if (w == null) { setType(k); w = g.measureText(s).width; widths.set(key, w); if (widths.size > 4000) widths.clear(); }
    return w;
  }
  // text that types itself on: the settled part, then a few scrambled characters running ahead
  function decoded(s, t, dur = 0.45) {
    if (reduced || t >= dur) return s;
    if (t <= 0) return '';
    const n = Math.floor((t / dur) * s.length);
    let tail = '';
    // (a digit scrambles as a digit, so a numeral keeps its width while it settles)
    for (let i = n; i < Math.min(s.length, n + 4); i++) tail += s[i] === ' ' ? ' ' : s[i] >= '0' && s[i] <= '9' ? String((Math.random() * 10) | 0) : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
    return s.slice(0, n) + tail;
  }
  // (full: the text once typed on, which the audit measures)
  function text(k, s, x, y, col, align = 'left', full = s) {
    if (!s) return;
    setType(k);
    g.textAlign = align;
    g.lineJoin = 'round';
    g.lineWidth = 3;
    g.strokeStyle = SHADE;
    g.strokeText(s, x, y);
    g.fillStyle = col;
    g.fillText(s, x, y);
    if (A) { const w = width(k, full), px = TYPE[k][1], l = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; A.box(owner, full, l, y - px * 0.72, l + w, y + px * 0.2); }
  }
  function stroke(path, col, w = 1, halo = true, dash = null) {
    if (halo) { g.setLineDash(dash || []); g.lineWidth = w + 2.2; g.strokeStyle = HALO; path(); g.stroke(); }
    g.setLineDash(dash || []);
    g.lineWidth = w; g.strokeStyle = col; path(); g.stroke();
    g.setLineDash([]);
  }
  function hatchOf(tone) {
    if (hatch[tone]) return hatch[tone];
    const c = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(6, 6) : Object.assign(document.createElement('canvas'), { width: 6, height: 6 })).getContext('2d');
    c.strokeStyle = rgba(tone, 0.55); c.lineWidth = 1;
    c.beginPath(); c.moveTo(-1, 7); c.lineTo(7, -1); c.moveTo(-1, 1); c.lineTo(1, -1); c.moveTo(5, 7); c.lineTo(7, 5); c.stroke();
    return (hatch[tone] = g.createPattern(c.canvas, 'repeat'));
  }
  // the hatching fixed to the world: its lines `px` apart on screen, through screen point (x, y)
  function hatchAt(tone, x, y, px) {
    const p = hatchOf(tone);
    if (p.setTransform && typeof DOMMatrix !== 'undefined') { const k = px / 6; p.setTransform(new DOMMatrix([k, 0, 0, k, x, y])); }
    return p;
  }

  // Into the loupe: while LM is set (its middle on the screen x, y; the main view's point under that middle c; its
  // magnification k), the marks' places are mapped into its magnified view and cell-sized marks grow with it, so the
  // same marks drawn again, clipped to its circle, show there on what it magnifies.
  let LM = null;
  const mp = (p) => (LM ? [LM.x + (p[0] - LM.c[0]) * LM.k, LM.y + (p[1] - LM.c[1]) * LM.k] : p);
  // (a mark that draws another (a lock's brackets) maps once: the inner one draws with LM unset)
  const unmapped = (fn) => { const lm = LM; LM = null; try { fn(); } finally { LM = lm; } };

  // ------------------------------------------------------------------ primitives (screen px, t: seconds since start)
  // corner brackets closing in on a box
  function brackets(l, t0, r, b, col, t) {
    if (LM) { [l, t0] = mp([l, t0]); [r, b] = mp([r, b]); }
    const k = reduced ? 1 : 1 + 1.2 * (1 - ease(t / 0.35));
    const cx = (l + r) / 2, cy = (t0 + b) / 2, hw = ((r - l) / 2) * k, hh = ((b - t0) / 2) * k;
    const L = cx - hw, R = cx + hw, T = cy - hh, B = cy + hh, m = Math.min(R - L, B - T), c = clamp(m * 0.22, 4, 22);
    stroke(() => {
      g.beginPath();
      for (const [x, y, dx, dy] of [[L, T, 1, 1], [R, T, -1, 1], [L, B, 1, -1], [R, B, -1, -1]]) { g.moveTo(x, y + dy * c); g.lineTo(x, y); g.lineTo(x + dx * c, y); }
    }, col, 1.4);
  }
  // how far a lock's ring reaches from its cell's centre
  const lockR = (r) => Math.max(r, 7) * 1.45 + 6;
  // LOCK: brackets close in on one cell; a faint ring ticked at 90° spins in; a centre point
  function lock(x, y, r, tone, t) {
    if (LM) { [x, y] = mp([x, y]); r *= LM.k; return unmapped(() => lock(x, y, r, tone, t)); }
    r = Math.max(r, 7);
    const a = g.globalAlpha, R = lockR(r), u = reduced ? 1 : ease(t / 1.1);
    g.globalAlpha = a * (reduced ? 0.35 : 0.9 - 0.55 * u);
    const rot = (1 - u) * -Math.PI / 2, s = 1 + 0.6 * (1 - u);
    g.lineWidth = 1; g.strokeStyle = rgba(tone, 0.8);
    g.beginPath(); g.arc(x, y, R * s, 0, TAU); g.stroke();
    g.beginPath();
    for (let q = 0; q < 4; q++) { const an = rot + (q * Math.PI) / 2, c = Math.cos(an), si = Math.sin(an); g.moveTo(x + c * (R * s - 3), y + si * (R * s - 3)); g.lineTo(x + c * (R * s + 4), y + si * (R * s + 4)); }
    g.stroke();
    g.globalAlpha = a;
    g.fillStyle = rgba(tone, 0.95); g.fillRect(x - 1, y - 1, 2, 2);
    brackets(x - r, y - r, x + r, y + r, rgba(tone, 0.95), t);
  }
  // a small filled tag; outlined when the cause is inferred
  function tag(s, x, y, tone, t, align = 'left', hollow = false) {
    const w = width('tag', s) + 10;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, a = g.globalAlpha;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.25, 0, 1));
    if (hollow) { g.fillStyle = SHADE; g.fillRect(x0, y - 10, w, 14); g.strokeStyle = rgba(tone, 0.95); g.lineWidth = 1; g.setLineDash([2, 2]); g.strokeRect(x0 + 0.5, y - 9.5, w - 1, 13); g.setLineDash([]); }
    else { g.fillStyle = rgba(tone, 0.95); g.fillRect(x0, y - 10, w, 14); }
    setType('tag');
    g.textAlign = 'left';
    g.fillStyle = hollow ? rgba(tone, 1) : 'rgba(6,9,10,0.95)';
    g.fillText(decoded(s, t), x0 + 5, y + 1);
    if (A && g.globalAlpha >= 0.5) A.box(owner, s, x0, y - 10, x0 + w, y + 4);
    g.globalAlpha = a;
    return w;
  }
  // LINK: who acts on whom: a bowed line drawn out from the doer, marks running along it toward the other, a cross
  // tick at the far end, and its verb in a tag (where: linkTag, so the labels keep off it)
  function linkCurve(a, b, bend, gap) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 2 * gap + 4) return null;
    const ux = dx / L, uy = dy / L;
    const p0 = [a[0] + ux * gap, a[1] + uy * gap], p1 = [b[0] - ux * gap, b[1] - uy * gap];
    const m = [(p0[0] + p1[0]) / 2 - uy * L * bend, (p0[1] + p1[1]) / 2 + ux * L * bend];
    const at = (s) => [(1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * m[0] + s * s * p1[0], (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * m[1] + s * s * p1[1]];
    return { L, ux, uy, p1, at };
  }
  // the verb's tag: at the bow's middle, or for a short link stood off it on a leader, so it never covers the pair
  function linkTag(C, verb, bend) {
    const [qx, qy] = C.at(0.5), w = width('tag', verb) + 10;
    if (C.L >= 140) return { x: qx, y: qy + 3, box: { l: qx - w / 2 - 3, t: qy - 10, r: qx + w / 2 + 3, b: qy + 10 } };
    const s = bend < 0 ? -1 : 1, ox = qx - C.uy * 34 * s, oy = qy + C.ux * 34 * s;
    return { qx, qy, ox, oy, x: ox, y: oy + 7, box: { l: ox - w / 2 - 3, t: oy - 6, r: ox + w / 2 + 3, b: oy + 14 } };
  }
  function link(a, b, verb, tone, t, now, bend = 0.18, gap = 9, hollow = false, verbA = 1) {
    a = mp(a); b = mp(b);
    const C = linkCurve(a, b, bend, gap);
    if (!C) return;
    const { at, p1, L } = C;
    const u = reduced ? 1 : ease(t / 0.5);
    const path = (s0, s1) => () => { g.beginPath(); const q = at(s0); g.moveTo(q[0], q[1]); for (let k = 1; k <= 24; k++) { const r = at(s0 + ((s1 - s0) * k) / 24); g.lineTo(r[0], r[1]); } };
    stroke(path(0, u), rgba(tone, 0.8), 1, true, hollow ? [3, 3] : null);
    if (u >= 1) {
      // chevrons flowing toward the target
      const n = Math.max(2, Math.floor(L / 26));
      g.fillStyle = rgba(tone, 0.9);
      for (let k = 0; k < n; k++) {
        const s = (k + ((now * 0.6) % 1)) / n;
        if (s < 0.08 || s > 0.92) continue;
        const q = at(s), r = at(s + 0.01), an = Math.atan2(r[1] - q[1], r[0] - q[0]);
        g.save(); g.translate(q[0], q[1]); g.rotate(an);
        g.beginPath(); g.moveTo(2.5, 0); g.lineTo(-2, -2.6); g.lineTo(-0.6, 0); g.lineTo(-2, 2.6); g.closePath(); g.fill();
        g.restore();
      }
      const r0 = at(0.97), an = Math.atan2(p1[1] - r0[1], p1[0] - r0[0]);
      stroke(() => { g.beginPath(); g.moveTo(p1[0] - Math.sin(an) * 5, p1[1] + Math.cos(an) * 5); g.lineTo(p1[0] + Math.sin(an) * 5, p1[1] - Math.cos(an) * 5); }, rgba(tone, 0.95), 1.4);
    }
    if (verb && t > 0.4 && verbA > 0) {
      const T = linkTag(C, verb, bend), a0 = g.globalAlpha;
      g.globalAlpha = a0 * verbA;
      if (T.ox != null) stroke(() => { g.beginPath(); g.moveTo(T.qx, T.qy); g.lineTo(T.ox, T.oy); }, rgba(tone, 0.7), 1);
      tag(verb, T.x, T.y, tone, t - 0.4, 'center', hollow);
      g.globalAlpha = a0;
    }
  }
  // CENSUS: a glyph on each cell of a kind in view ([x, y, id, alpha]), ticked on in a sweep out from where the note
  // points; one joining or leaving later fades. plus: a member; ring: dormant or torpid (dashed); square: too warm;
  // cross: dead
  function census(pts, glyph, tone, t, from, size = 4) {
    if (!pts.length) return;
    if (LM) { pts = pts.map((p) => { const q = mp(p); return [q[0], q[1], p[2], p[3]]; }); from = mp(from); size *= Math.min(LM.k, 2); }
    let far = 1;
    for (const p of pts) far = Math.max(far, Math.hypot(p[0] - from[0], p[1] - from[1]));
    // the settled ones in one path, stroked twice (its dark halo, then the glyph); those fading, each at its own alpha
    const P = new Path2D(), a0 = g.globalAlpha, fading = [];
    const add = (Pt, x, y, Q) => {
      if (glyph === 'plus') { Pt.moveTo(x - Q, y); Pt.lineTo(x + Q, y); Pt.moveTo(x, y - Q); Pt.lineTo(x, y + Q); }
      else if (glyph === 'ring') { Pt.moveTo(x + Q * 1.3, y); Pt.arc(x, y, Q * 1.3, 0, TAU); }
      else if (glyph === 'square') Pt.rect(x - Q * 0.8, y - Q * 0.8, Q * 1.6, Q * 1.6);
      else { Pt.moveTo(x - Q * 0.8, y - Q * 0.8); Pt.lineTo(x + Q * 0.8, y + Q * 0.8); Pt.moveTo(x + Q * 0.8, y - Q * 0.8); Pt.lineTo(x - Q * 0.8, y + Q * 0.8); }
    };
    for (const p of pts) {
      const [x, y] = p, d = t - (0.9 * Math.hypot(x - from[0], y - from[1])) / far;
      if (d < 0 && !reduced) continue;
      const Q = size * (reduced ? 1 : 1 + 0.8 * Math.max(0, 1 - d / 0.25));
      if (p[3] < 0.99) fading.push([x, y, Q, p[3]]);
      else add(P, x, y, Q);
      if (A && hashU(p[2]) < 0.125) A.point(p[3] < 0.99 ? 'fading' : 'glyph', `${owner}:${p[2]}`, x, y);
    }
    const draw = (Pt) => {
      g.setLineDash([]); g.lineWidth = 3.2; g.strokeStyle = HALO; g.stroke(Pt);
      g.lineWidth = 1.3; g.strokeStyle = rgba(tone, 0.95);
      if (glyph === 'ring') g.setLineDash([2, 2]);
      g.stroke(Pt);
      g.setLineDash([]);
    };
    draw(P);
    // (those fading in four bands of alpha: a few strokes in all)
    if (fading.length) {
      const bands = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      for (const [x, y, Q, a] of fading) add(bands[Math.min(3, Math.floor(a * 4))], x, y, Q);
      bands.forEach((Pt, b) => { g.globalAlpha = a0 * (b + 0.5) / 4; draw(Pt); });
    }
    g.globalAlpha = a0;
    if (stats) stats.glyphs = (stats.glyphs || 0) + pts.length;
  }
  // PIP: a moment at a point: a cross that blinks, then rests half-lit, fading as it grows old (fade 1..0)
  function pip(x, y, tone, t, fade = 1) {
    [x, y] = mp([x, y]);
    const on = reduced || t > 0.9 || Math.floor(t / 0.15) % 2 === 0;
    const a = g.globalAlpha;
    g.globalAlpha = a * (on ? (t > 0.9 ? 0.75 : 1) : 0.2) * fade;
    const q = 4;
    stroke(() => { g.beginPath(); g.moveTo(x - q, y - q); g.lineTo(x + q, y + q); g.moveTo(x + q, y - q); g.lineTo(x - q, y + q); }, rgba(tone, 0.95), 1.3);
    g.globalAlpha = a;
  }
  // a leader in the HUD's manner: a small ring on the target, one 45° run, then a level shelf to the label
  function leaderPath(sx, sy, ex, ey) {
    const dir = Math.sign(ex - sx) || 1;
    return { dir, mx: sx + dir * Math.min(Math.abs(ey - sy), Math.abs(ex - sx)) };
  }
  function leader(sx, sy, ex, ey, tone, t) {
    const dy = ey - sy, { dir, mx } = leaderPath(sx, sy, ex, ey), r = 3;
    const u = reduced ? 1 : ease(t / 0.4);
    const pts = [[sx + dir * r * 0.7, sy + Math.sign(dy || 1) * r * 0.7], [mx, ey], [ex, ey]];
    const len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) + Math.abs(ex - mx);
    stroke(() => {
      g.beginPath(); g.moveTo(...pts[0]);
      const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), want = u * len;
      if (want <= l1) { const s = want / Math.max(l1, 1e-6); g.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * s, pts[0][1] + (pts[1][1] - pts[0][1]) * s); }
      else { g.lineTo(...pts[1]); g.lineTo(mx + dir * (want - l1), ey); }
    }, rgba(tone, 0.75), 1);
    g.lineWidth = 1; g.strokeStyle = rgba(tone, 0.9);
    g.beginPath(); g.arc(sx, sy, r, 0, TAU); g.stroke();
  }

  // ------------------------------------------------------------------ the label block
  //   [TAG] EYEBROW            a filled status tag and/or a micro-label
  //   ───────────────┤         a hairline rule with an end tick
  //   172  NAME                a thin hero numeral and the name it counts
  //   DATA · TOKENS            label:value tokens, a line or two
  //          23.4°             the reading
  //   ├──[█████]──┤            a range bar: a band of comfort on a scale, the reading as a tick
  //      14    28              the band's ends
  // Each row has its own band of height, so nothing in one reaches into another; the block sits on a faint plate.
  const RANGE_W = 120, SPLIT_W = 170, TABLE_W = 230, TABLE_ROW = 18;
  function labelSize(L) {
    const head = (L.eye ? width('eye', L.eye) : 0) + (L.tag ? width('tag', L.tag) + 10 + (L.eye ? 8 : 0) : 0);
    const row = (L.num ? width('num', L.num) + 8 : 0) + (L.main ? width('main', L.main) : 0) + (L.kind != null ? 14 : 0);
    const data = Math.max(0, ...(L.data || []).map((d, i) => width('data', d) + (L.dataKinds?.[i] != null ? 13 : 0)));
    const table = L.table ? Math.max(TABLE_W, ...(L.why || []).map((w2) => width('data', w2)), L.why ? width('micro', whyHead()) : 0) : 0;
    const w = Math.max(head, row, data, table, L.range ? RANGE_W + 8 : 0, L.split || L.stack || L.wave ? SPLIT_W : 0);
    let h = 0;
    if (L.eye || L.tag) h += 13;
    if (L.num || L.main) h += (L.num ? 24 : 15) + 4;
    h += (L.data || []).length * 14;
    if (L.range) h += 42;
    if (L.split) h += 24;
    if (L.stack) h += 16;
    if (L.table) h += 10 + L.table.length * TABLE_ROW + (L.why ? 20 + L.why.length * 16 : 0) + 4;
    if (L.wave) h += 26;
    return { w, h: h + 4 };
  }
  function label(L, x, y, dir, t) {
    const { w, h } = labelSize(L), tone = L.tone || INK;
    const X = (dx) => (dir > 0 ? x + dx : x - dx);
    const al = dir > 0 ? 'left' : 'right';
    // a plate under it, dark enough that the scene beneath never fights the text, its corners ticked
    // (fading in as its text begins to type on: never a plate with nothing on it)
    const pl = dir > 0 ? x - 6 : x - w - 6, pr = pl + w + 12, pt = y - 14, pb = y + h, a0 = g.globalAlpha;
    if (!reduced && t < 0.2) { if (t <= -0.1) return { w, h }; g.globalAlpha = a0 * clamp((t + 0.1) / 0.3, 0, 1); }
    g.fillStyle = PLATE;
    g.fillRect(pl, pt, pr - pl, pb - pt);
    g.lineWidth = 1; g.strokeStyle = rgba(LINE, 0.4);
    g.beginPath();
    for (const [cx, cy, dx, dy] of [[pl, pt, 1, 1], [pr, pt, -1, 1], [pl, pb, 1, -1], [pr, pb, -1, -1]]) { g.moveTo(cx + 0.5 * dx, cy + 5 * dy); g.lineTo(cx + 0.5 * dx, cy + 0.5 * dy); g.lineTo(cx + 5 * dx, cy + 0.5 * dy); }
    g.stroke();
    g.globalAlpha = a0;
    let yy = y;
    if (L.eye || L.tag) {
      let ox = 0;
      if (L.tag) ox = tag(L.tag, dir > 0 ? x : x - width('tag', L.tag) - 10, yy, tone, t) + 8;
      if (L.eye) text('eye', decoded(L.eye, t), X(ox), yy, rgba(tone, 0.95), al, L.eye);
      yy += 7;
      // the rule draws out from the anchor, its end tick last
      const u = reduced ? 1 : ease((t - 0.05) / 0.45);
      stroke(() => { g.beginPath(); g.moveTo(x, yy); g.lineTo(X(w * u), yy); if (u >= 1) { g.moveTo(X(w), yy - 3); g.lineTo(X(w), yy + 3); } }, rgba(LINE, 0.75), 1);
      yy += 6;
    }
    if (L.num || L.main) {
      yy += L.num ? 22 : 13;
      // the numeral reads first: at the left edge when the label grows right, left of the name when it grows left; the
      // species' glyph just before its name
      const gw = L.kind != null ? 14 : 0, nw = L.num ? width('num', L.num) + 8 : 0, mw = L.main ? width('main', L.main) : 0;
      if (L.num) text('num', decoded(L.num, t - 0.1), dir > 0 ? x : x - mw - 8 - gw, yy, rgba(L.numTone || tone, 0.98), al, L.num);
      if (L.kind != null && t > 0.15) spGlyph(L.kind, (dir > 0 ? x + nw : x - mw) + (dir > 0 ? 5 : -9), yy - 4.5, 4.2);
      if (L.main) text('main', decoded(L.main, t - 0.15), dir > 0 ? x + nw + gw : x, yy, rgba(INK, 0.97), al, L.main);
      yy += 4;
    }
    (L.data || []).forEach((d, i) => {
      yy += 14;
      const k = L.dataKinds?.[i], gw = k != null ? 13 : 0, dw = width('data', d);
      if (k != null && t > 0.2) spGlyph(k, dir > 0 ? x + 4 : x - dw - 9, yy - 4, 3.6);
      text('data', decoded(d, t - 0.2), dir > 0 ? x + gw : x, yy, rgba(INK2, 0.95), al, d);
    });
    if (L.table) {
      // a table of species: each its glyph, its name, its figure right, a bar of its share beneath
      yy += 10;
      const TW = Math.max(TABLE_W, w), x0 = dir > 0 ? x : x - TW, max = Math.max(...L.table.map((r) => r.share || 0), 1e-9);
      L.table.forEach((r, i) => {
        yy += TABLE_ROW;
        if (t > 0.2 + i * 0.05) spGlyph(r.kind, x0 + 4, yy - 4, 3.8);
        const nm2 = fit('data', r.name, TW - 62);
        text('data', nm2, x0 + 14, yy, rgba(INK, 0.96), 'left', nm2);
        text('data', r.value, x0 + TW, yy, rgba(INK, 0.96), 'right', r.value);
        g.fillStyle = curF?.species(r.kind)?.col || rgba(INK2, 0.6);
        const a0 = g.globalAlpha; g.globalAlpha = a0 * 0.55;
        g.fillRect(x0 + 14, yy + 4, (TW - 14) * ((r.share || 0) / max) * (reduced ? 1 : clamp((t - 0.3 - i * 0.05) / 0.4, 0, 1)), 1.5);
        g.globalAlpha = a0;
      });
      if (L.why) {
        yy += 20;
        text('micro', whyHead(), x0, yy, rgba(INK3, 1), 'left');
        for (const w2 of L.why) { yy += 16; text('data', decoded(w2, t - 0.3), x0, yy, rgba(INK2, 0.95), 'left', w2); }
      }
      yy += 4;
    }
    if (L.wave) { yy += 16; wave(L.wave, dir > 0 ? x : x - SPLIT_W, yy, t - 0.25); yy += 10; }
    if (L.range) { yy += 22; range(L.range, dir > 0 ? x : x - RANGE_W, yy, t - 0.25); yy += 20; }
    if (L.split) { yy += 12; split(L.split, dir > 0 ? x : x - SPLIT_W, yy, t - 0.25); yy += 12; }
    if (L.stack) { yy += 10; stack(L.stack, dir > 0 ? x : x - SPLIT_W, yy, t - 0.25); yy += 6; }
    return { w, h: yy - y };
  }
  // where two numbers meant to stand centred at a and b (widths wa, wb) can stand without touching: spread about their
  // middle when they are too close
  function apart(a, b, wa, wb, gap = 6) {
    const need = (wa + wb) / 2 + gap;
    if (b - a >= need) return [a, b];
    const m = (a + b) / 2;
    return [m - need / 2, m + need / 2];
  }
  // a band of comfort on a scale (whole degrees), the reading as a needle; past the band, the excess in hot
  function range(R, x0, y, t) {
    if (t < 0 && !reduced) return;
    const a = g.globalAlpha;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.3, 0, 1));
    const bw = RANGE_W, f = (v) => x0 + bw * clamp((v - R.min) / (R.max - R.min), 0, 1);
    stroke(() => { g.beginPath(); g.moveTo(x0, y + 3); g.lineTo(x0 + bw, y + 3); g.moveTo(x0, y); g.lineTo(x0, y + 6); g.moveTo(x0 + bw, y); g.lineTo(x0 + bw, y + 6); }, rgba(LINE, 0.6), 1, false);
    g.fillStyle = rgba(LINE, 0.6);
    for (let v = Math.ceil(R.min / 5) * 5; v <= R.max; v += 5) g.fillRect(Math.round(f(v)), y + 3, 1, v % 10 ? 2 : 3.5);
    g.fillStyle = rgba(CYAN, 0.6); g.fillRect(f(R.lo), y + 1, f(R.hi) - f(R.lo), 4);
    const out = R.v > R.hi || R.v < R.lo;
    g.fillStyle = rgba(HOT, 0.95);
    if (R.v > R.hi) g.fillRect(f(R.hi), y + 1, f(R.v) - f(R.hi), 4);
    if (R.v < R.lo) g.fillRect(f(R.v), y + 1, f(R.lo) - f(R.v), 4);
    stroke(() => { g.beginPath(); g.moveTo(f(R.v), y - 3); g.lineTo(f(R.v), y + 9); }, rgba(out ? HOT : INK, 0.98), 1.6);
    const sl = `${Math.round(R.lo)}`, sh = `${Math.round(R.hi)}`;
    const [xl, xh] = apart(f(R.lo), f(R.hi), width('micro', sl), width('micro', sh));
    text('micro', sl, xl, y + 18, rgba(INK3, 1), 'center');
    text('micro', sh, xh, y + 18, rgba(INK3, 1), 'center');
    const sv = `${R.v.toFixed(1)}°`, wv = width('micro', sv);
    text('micro', sv, clamp(f(R.v), x0 - 4 + wv / 2, x0 + bw + 4 - wv / 2), y - 7, rgba(out ? HOT : INK, 1), 'center');
    g.globalAlpha = a;
  }
  // SPLIT: a balance, deaths to the left of the zero (by cause, each its own shade) and births to its right, on one
  // scale; its two totals at its ends
  function split(B, x0, y, t) {
    if (t < 0 && !reduced) return;
    // (its totals at its ends, inside its width)
    const a = g.globalAlpha, u = reduced ? 1 : ease(t / 0.5), mid = x0 + SPLIT_W / 2, half = SPLIT_W / 2 - 34;
    const dead = B.deaths.reduce((s2, d) => s2 + d[1], 0), k = (half / Math.max(1, B.born, dead)) * u;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.3, 0, 1));
    g.fillStyle = rgba(CYAN, 0.75); g.fillRect(mid + 1, y - 3, B.born * k, 6);
    let xx = mid - 1;
    B.deaths.forEach(([, c, tone], i) => { const w = c * k; g.fillStyle = rgba(tone, i % 2 ? 0.7 : 0.95); g.fillRect(xx - w, y - 3, Math.max(0, w - 1), 6); xx -= w; });
    g.fillStyle = rgba(INK, 0.9); g.fillRect(mid - 0.5, y - 6, 1, 12);
    text('micro', `−${dead}`, mid - half - 4, y + 4, rgba(HOT, 1), 'right');
    text('micro', `+${B.born}`, mid + half + 4, y + 4, rgba(CYAN, 1), 'left');
    g.globalAlpha = a;
  }
  // WAVE: a beat as an oscillograph, running at the beat's own rate (its genome's beats a second)
  function wave(W2, x0, y, t) {
    if (t < 0 && !reduced) return;
    const a = g.globalAlpha, u = reduced ? 1 : ease(t / 0.6), amp = 7 * clamp(W2.amp / 0.5, 0.3, 1), cyc = 3;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.3, 0, 1));
    stroke(() => { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + SPLIT_W, y); }, rgba(LINE, 0.35), 1, false);
    const ph = reduced ? 0 : (curF?.now || 0) * TAU * (W2.hz || 1);
    stroke(() => {
      g.beginPath();
      for (let i = 0; i <= 60 * u; i++) { const s2 = i / 60, xx = x0 + s2 * SPLIT_W, yv = y - Math.sin(s2 * cyc * TAU - ph) * amp; if (i) g.lineTo(xx, yv); else g.moveTo(xx, yv); }
    }, rgba(HOT, 0.95), 1.3);
    g.globalAlpha = a;
  }
  // STACK: what a whole is made of, as one bar in parts (each its share, in its own color; the rest dim)
  function stack(parts, x0, y, t) {
    if (t < 0 && !reduced) return;
    const a = g.globalAlpha, u = reduced ? 1 : ease(t / 0.6);
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.3, 0, 1));
    g.fillStyle = rgba(INK3, 0.35); g.fillRect(x0, y - 3, SPLIT_W * u, 6);
    let xx = x0;
    for (const [col, sh] of parts) { const w = SPLIT_W * sh * u; g.fillStyle = col; g.fillRect(xx, y - 3, Math.max(0, w - 1), 6); xx += w; }
    g.globalAlpha = a;
  }
  // GAUGE: the water's temperature on an arc, with a species' band of comfort, its ends numbered; past it, hot
  function gauge(x, y, G, t) {
    const R = 32, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, A0 = (v) => a0 + (a1 - a0) * clamp((v - G.min) / (G.max - G.min), 0, 1);
    const a = g.globalAlpha;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.4, 0, 1));
    g.lineWidth = 1; g.strokeStyle = rgba(LINE, 0.55);
    g.beginPath(); g.arc(x, y, R, a0, a1); g.stroke();
    g.beginPath();
    for (let v = Math.ceil(G.min / 2) * 2; v <= G.max; v += 2) { const an = A0(v), r2 = v % 10 === 0 ? R + 4 : R + 2; g.moveTo(x + R * Math.cos(an), y + R * Math.sin(an)); g.lineTo(x + r2 * Math.cos(an), y + r2 * Math.sin(an)); }
    g.stroke();
    g.lineWidth = 3; g.strokeStyle = rgba(CYAN, 0.55);
    g.beginPath(); g.arc(x, y, R - 5, A0(G.lo), A0(G.hi)); g.stroke();
    const over = G.v > G.hi ? [A0(G.hi), A0(G.v)] : G.v < G.lo ? [A0(G.v), A0(G.lo)] : null;
    if (over) { g.strokeStyle = rgba(HOT, 0.95); g.beginPath(); g.arc(x, y, R - 5, over[0], over[1]); g.stroke(); }
    const an = A0(G.v);
    stroke(() => { g.beginPath(); g.moveTo(x + (R - 12) * Math.cos(an), y + (R - 12) * Math.sin(an)); g.lineTo(x + (R + 6) * Math.cos(an), y + (R + 6) * Math.sin(an)); }, rgba(over ? HOT : INK, 0.98), 1.6);
    // the band's ends outside the arc, spread along it when the band is narrow (24 px apart at least)
    const R2 = R + 13, [b0, b1] = apart(A0(G.lo), A0(G.hi), 24 / R2, 24 / R2, 0);
    text('micro', `${Math.round(G.lo)}`, x + R2 * Math.cos(b0), y + R2 * Math.sin(b0) + 4, rgba(INK3, 1), 'center');
    text('micro', `${Math.round(G.hi)}`, x + R2 * Math.cos(b1), y + R2 * Math.sin(b1) + 4, rgba(INK3, 1), 'center');
    const s = `${G.v.toFixed(1)}°`;
    text('dial', decoded(s, t - 0.2), x, y + 5, rgba(INK, 0.98), 'center', s);
    // i18n: Live annotations: under the dial of the water's temperature
    text('eye', tr('notes.gauge.water', 'WATER'), x, y + R + 20, rgba(INK2, 1), 'center');
    if (G.sub) text('data', G.sub, x, y + R + 33, rgba(INK2, 1), 'center');
    g.globalAlpha = a;
  }

  // ------------------------------------------------------------------ the frame's devices
  function corners(o) {
    const c = 12;
    g.lineWidth = 1; g.strokeStyle = rgba(LINE, 0.5);
    g.beginPath();
    for (const [x, y, dx, dy] of [[o.l, o.t, 1, 1], [o.r, o.t, -1, 1], [o.l, o.b, 1, -1], [o.r, o.b, -1, -1]]) { g.moveTo(x, y + dy * c); g.lineTo(x, y); g.lineTo(x + dx * c, y); }
    g.stroke();
  }
  function modeTag(s, x, y) {
    const w = width('head', s) + 14;
    g.fillStyle = 'rgba(6,9,10,0.72)'; g.fillRect(x - w / 2, y - 11, w, 16);
    g.strokeStyle = rgba(LINE, 0.55); g.lineWidth = 1; g.strokeRect(x - w / 2 + 0.5, y - 10.5, w - 1, 15);
    setType('head'); g.textAlign = 'center'; g.fillStyle = rgba(INK, 0.95); g.fillText(s, x, y + 1);
    if (A) A.box(owner, s, x - w / 2, y - 11, x + w / 2, y + 5);
    return { l: x - w / 2, t: y - 11, r: x + w / 2, b: y + 5, hard: true };
  }
  // the species in view, most numerous first, each with its guild's glyph and a bar; those the notes speak of in hot
  const ROSTER_W = 216;
  function roster(rows, x, y, t) {
    const W = ROSTER_W, H = 24 + rows.length * 19 + 4;
    const a = g.globalAlpha;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.4, 0, 1));
    g.fillStyle = 'rgba(6,9,10,0.62)'; g.fillRect(x - W, y, W, H);
    g.strokeStyle = rgba(LINE, 0.28); g.lineWidth = 1; g.strokeRect(x - W + 0.5, y + 0.5, W - 1, H - 1);
    // i18n: Live annotations: the heading of the roster of species in view
    const head = tr('notes.roster.head', 'CELLS IN VIEW'), hw = width('head', head) + 14;
    g.fillStyle = 'rgba(6,9,10,0.9)'; g.fillRect(x - W + 8, y - 7, hw, 15);
    g.strokeStyle = rgba(LINE, 0.55); g.strokeRect(x - W + 8.5, y - 6.5, hw - 1, 14);
    setType('head'); g.textAlign = 'left'; g.fillStyle = rgba(INK, 0.95); g.fillText(head, x - W + 15, y + 4);
    if (A) A.box(owner, head, x - W + 8, y - 7, x - W + 8 + hw, y + 8);
    rows.forEach((r, i) => {
      const yy = y + 26 + i * 19, col = r.hot ? HOT : INK, num = String(r.n);
      text('micro', String(i + 1).padStart(2, '0'), x - W + 10, yy, rgba(INK3, 1));
      spGlyph(r.kind, x - W + 36, yy - 4, 3.8);
      // the name has the row less its number
      const nm = fit('micro', up(r.name), W - 66 - width('micro', num));
      text('micro', nm, x - W + 46, yy, rgba(col, r.hot ? 1 : 0.92));
      text('micro', num, x - 10, yy, rgba(col, 0.95), 'right');
      g.fillStyle = rgba(col, r.hot ? 0.9 : 0.4); g.fillRect(x - W + 46, yy + 4, Math.max(1, (W - 56) * r.bar), 1);
    });
    g.globalAlpha = a;
    return { l: x - W, t: y - 8, r: x, b: y + H, hard: true };
  }
  // A species' glyph: its guild's shape (producer a diamond, grazer a dot, hunter a triangle, scavenger a square) in
  // the species' own color, as its cells show, edged dark; beside its name wherever a name is told.
  let curF = null;
  function spGlyph(kind, x, y, r = 3.6) {
    const sp = curF?.species(kind);
    shape(sp?.guild, x, y, r);
    g.lineWidth = 1.2; g.strokeStyle = HALO; g.stroke();
    g.fillStyle = sp?.col || rgba(INK, 0.95); g.fill();
  }
  function shape(guild, x, y, r) {
    g.beginPath();
    if (guild === 'producer') { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
    else if (guild === 'predator') { g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.85); g.lineTo(x - r, y + r * 0.85); g.closePath(); }
    else if (guild === 'scavenger') g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    else g.arc(x, y, r * 0.75, 0, TAU);
  }
  function fit(k, s, w) {
    if (width(k, s) <= w) return s;
    while (s.length > 3 && width(k, `${s}…`) > w) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  }
  // the key: what each glyph on screen stands for (each line fitted to the key's width)
  const KEY_W = 280;
  function key(items, x, y) {
    let yy = y;
    for (const it of items.slice().reverse()) {
      const col = it.tone;
      g.save();
      g.lineWidth = 1.3; g.strokeStyle = rgba(col, 0.95);
      const q = 4, cx = x + 5, cy = yy - 4;
      g.beginPath();
      if (it.glyph === 'plus') { g.moveTo(cx - q, cy); g.lineTo(cx + q, cy); g.moveTo(cx, cy - q); g.lineTo(cx, cy + q); }
      else if (it.glyph === 'ring') { g.setLineDash([2, 2]); g.arc(cx, cy, q * 1.2, 0, TAU); }
      else if (it.glyph === 'square') g.rect(cx - q * 0.8, cy - q * 0.8, q * 1.6, q * 1.6);
      else { g.moveTo(cx - q * 0.8, cy - q * 0.8); g.lineTo(cx + q * 0.8, cy + q * 0.8); g.moveTo(cx + q * 0.8, cy - q * 0.8); g.lineTo(cx - q * 0.8, cy + q * 0.8); }
      g.stroke();
      g.restore();
      text('micro', fit('micro', it.text, KEY_W - 30), x + 16, yy, rgba(col, 0.95));
      yy -= 17;
    }
    return { l: x, t: yy, r: x + KEY_W, b: y + 4, hard: true };
  }

  // ------------------------------------------------------------------ placement
  const area = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  // where a segment crosses a box (Liang–Barsky)
  function crosses(x0, y0, x1, y1, b) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - b.l], [dx, b.r - x0], [-dy, y0 - b.t], [dy, b.b - y0]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return true;
  }
  const OFFS = [];
  for (const dx of [44, 72, 110, 160, 220]) for (const dy of [-170, -120, -80, -44, 24, 64, 110]) OFFS.push([dx, dy]);
  const boxAt = (x, y, dir, size) => (dir > 0 ? { l: x - 6, t: y - 14, r: x + size.w + 6, b: y + size.h } : { l: x - size.w - 6, t: y - 14, r: x + 6, b: y + size.h });
  // A place for a label off its anchor (dx0 out, dy down, growing toward dir), slid along its shelf to stay inside the
  // open world (on a narrow screen no side has room for it whole), and how bad it is: covering text (hard: a label,
  // a panel, a tag), a mark's reach, a leader or the marks; how far it lies; which way it faces.
  function score(anchor, dir, dx0, dy, size, taken, open, marksAt) {
    const dx = dir * dx0;
    let x = anchor[0] + dx + dir * 4, y = anchor[1] + dy - 7;
    x = dir > 0 ? clamp(x, open.l + 6, open.r - size.w - 6) : clamp(x, open.l + size.w + 6, open.r - 6);
    y = clamp(y, open.t + 14, open.b - size.h);
    const box = boxAt(x, y, dir, size), ey = y + 7, { mx } = leaderPath(anchor[0], anchor[1], x, ey);
    let s = 0, hard = false;
    for (const r of taken) {
      if (r.seg) { if (crosses(r.seg[0], r.seg[1], r.seg[2], r.seg[3], box)) s += 60; continue; }
      const o = area(box, r);
      if (o > 0) { s += (o / (size.w * size.h + 1)) * (r.hard ? 3000 : 400); if (r.hard && o > 4) hard = true; }
      if (r.hard && (crosses(anchor[0], anchor[1], mx, ey, r) || crosses(mx, ey, x, ey, r))) s += 45;
    }
    // (covering a few marks is better than covering a label: in a crowd every place covers some)
    let under = 0;
    for (const p of marksAt) if (p[0] > box.l && p[0] < box.r && p[1] > box.t && p[1] < box.b && ++under >= 8) break;
    s += under * 8;
    s += Math.hypot(dx, dy) * 0.08;
    // outward, toward the nearer edge, reads as the HUD's tidy margins
    if ((anchor[0] < (open.l + open.r) / 2) === (dir > 0)) s += 10;
    return { s, hard, dir, dx0, dy, x, y, box };
  }
  // Where a label goes: chosen once, the best place about its anchor when it first shows, and kept there (riding its
  // anchor) for the rest of its note: it never moves to another. Should something come to cover it, it waits hidden.
  function place(id, anchor, size, taken, open, marksAt) {
    const st = lay.get(id);
    if (st.pick) return score(anchor, st.pick.dir, st.pick.dx0, st.pick.dy, size, taken, open, marksAt);
    let best = null;
    for (const dir of [1, -1]) for (const [dx0, dy] of OFFS) {
      const c = score(anchor, dir, dx0, dy, size, taken, open, marksAt);
      if (!best || c.s < best.s) best = c;
    }
    st.pick = { dir: best.dir, dx0: best.dx0, dy: best.dy };
    return best;
  }

  // ------------------------------------------------------------------ steadiness
  // A cell's screen position, eased: a new sample's correction against the last is faded out, so a mark never jumps
  // (as the page's own brackets do). The old sample is carried to the same moment as the new before they are compared.
  function settle(m, s, kind, project, dt) {
    const p = project(s, kind);
    if (!p) return null;
    if (m.s && m.s !== s && m.s.t !== s.t) {
      const o = project(m.s, m.kind);
      if (o) { m.ex += o[0] - p[0]; m.ey += o[1] - p[1]; if (Math.hypot(m.ex, m.ey) > 80) m.ex = m.ey = 0; }
    }
    m.s = s; m.kind = kind;
    const f = Math.exp(-dt / STEADY.settle);
    m.ex *= f; m.ey *= f;
    return [p[0] + m.ex, p[1] + m.ey];
  }
  function markAt(id, s, kind, project, dt) {
    if (!s) return null;
    let m = marks.get(id);
    if (!m) marks.set(id, (m = { s: null, kind, ex: 0, ey: 0, used: 0 }));
    m.used = 0;
    return settle(m, m.s && m.s.t === s.t ? m.s : { x: s.x, y: s.y, vx: s.vx, vy: s.vy, t: s.t }, kind, project, dt);
  }
  // The cells of a census (rows of the view), each followed by its id: [x, y, id, alpha]. Past `cap`, a steady sample
  // (those whose ids hash under a share changed only by quarter octaves, and only when it must). A cell joining fades
  // in; one leaving (gone from view, from the group, or from the sample) fades out where it was going.
  function steady(st, rows, F) {
    const v = F.model.view, map = (st.cells ||= new Map()), first = !st.frame;
    const want = rows.length > F.cap ? F.cap / rows.length : 1;
    if (want >= 1) st.keep = 1;
    else if (!(st.keep * rows.length <= F.cap * 1.25) || st.keep < want * 0.6) st.keep = 2 ** (Math.floor(Math.log2(want) * 4) / 4);
    const frame = (st.frame = (st.frame || 0) + 1);
    if (st.view !== v || st.rows !== rows) {
      st.view = v; st.rows = rows;
      for (const i of rows) {
        const id = v.id[i];
        if (st.keep < 1 && hashU(id) >= st.keep) continue;
        let c = map.get(id);
        if (!c) map.set(id, (c = { s: null, kind: v.kind[i], ex: 0, ey: 0, a: first ? 1 : 0, f: 0, at: null }));
        if (!c.at || c.at.t !== v.simTime) c.at = { x: v.x[i], y: v.y[i], vx: v.vx[i], vy: v.vy[i], t: v.simTime };
        c.kind = v.kind[i];
        c.f = frame;
      }
    } else for (const c of map.values()) if (c.f === frame - 1) c.f = frame;
    const fade = F.dt / STEADY.fade, out = [];
    for (const [id, c] of map) {
      const live = c.f === frame;
      const p = settle(c, c.at, c.kind, F.project, F.dt);
      c.a = clamp(c.a + (live ? fade : -fade), 0, 1);
      if (!p || (!live && c.a <= 0)) { map.delete(id); continue; }
      out.push([p[0], p[1], id, c.a]);
    }
    return out;
  }
  // The cell a label hangs on: the one it hung on while that still shows (clear of the panels), else the one nearest
  // the group's middle of those that do (or, none doing, of all).
  function anchorOf(st, pts, ok) {
    let kept = null;
    if (st.anchor != null) for (const p of pts) if (p[2] === st.anchor && p[3] > 0.5) { kept = p; break; }
    if (kept && ok(kept)) return kept;
    let good = pts.filter((p) => p[3] > 0.99 && ok(p));
    if (!good.length) { if (kept) return kept; good = pts.filter((p) => p[3] > 0.5); }
    if (!good.length) return null;
    const c = [good.reduce((s, p) => s + p[0], 0) / good.length, good.reduce((s, p) => s + p[1], 0) / good.length];
    let best = null, bd = Infinity;
    for (const p of good) { const d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d < bd) { bd = d; best = p; } }
    if (st.anchor != null && A) A.count('swaps');
    st.anchor = best[2];
    return best;
  }
  // ------------------------------------------------------------------ organic shapes
  // A stretch of the world as smooth closed loops where a field crosses a level (src/contour.js), in world units: drawn
  // each frame where the view shows them, as a shape that follows what it marks rather than a grid's squares.
  // From the view's squares of water (a value at each square's middle; the squares fixed in the world):
  // (valid: the squares to draw from. The water's own fields (its warmth, ice, light, stone, shade) are known across
  // the whole grid, past the view's edge, so they are drawn from all of it but the wrap's repeats (sqOnce): a shape is
  // whole beyond the edge before the view is panned to it, rather than cut along where the view was at the last look.
  // What is read from the view's cells (a range, the barren, the dead) only from the squares in view (sqIn). Squares
  // left out count as outside, a finite way below the level: an edge between them and one inside falls halfway, as
  // any other, never along a row of square middles.)
  function gridLoops(field, grid, level, valid = null) {
    const f = new Float32Array(NOTE_TG * NOTE_TG);
    let span = 0;
    for (let k = 0; k < f.length; k++) span = Math.max(span, Math.abs(field[k] - level));
    for (let k = 0; k < f.length; k++) f[k] = valid && !valid[k] ? level - Math.max(span, 1e-3) : field[k];
    const [ox, oy, s2] = grid;
    return contours(f, NOTE_TG, NOTE_TG, level).map((L) => smooth(L, 3).map(([x, y]) => [ox + (x + 0.5) * s2, oy + (y + 0.5) * s2]));
  }
  // From points (a crowd): each spreads a soft bump of radius R about it on a lattice fixed in the world (a third of R a
  // side); where they sum past half a bump's top is inside. With `st`, the field is carried from look to look and eased
  // (each new look counts for a third), so the shape changes as the crowd does, never at a jump.
  // (rel: inside where the field passes that share of its own peak, for a crowd known only by a sample of it)
  function crowdLoops(pts, R, st = null, rel = 0) {
    const c = R / 3, field = new Map(), K = Math.ceil(R / c);
    for (const [x, y] of pts) {
      const i0 = Math.round(x / c), j0 = Math.round(y / c);
      for (let a = -K; a <= K; a++) for (let b = -K; b <= K; b++) {
        const d2 = ((i0 + a) * c - x) ** 2 + ((j0 + b) * c - y) ** 2;
        if (d2 >= R * R) continue;
        const key = (i0 + a + 1048576) * 2097152 + (j0 + b + 1048576), w = (1 - d2 / (R * R)) ** 2;
        field.set(key, (field.get(key) || 0) + w);
      }
    }
    let f = field;
    if (st) {
      if (st.c !== c) { st.c = c; st.f = new Map(); }
      // (each look counts for a sixth: a shape that grows and shrinks over about a second, never flickering)
      for (const [k, w] of st.f) { const nw = w * 0.83 + (field.get(k) || 0) * 0.17; if (nw < 0.02) st.f.delete(k); else st.f.set(k, nw); }
      for (const [k, w] of field) if (!st.f.has(k)) st.f.set(k, w * 0.17);
      f = st.f;
    }
    if (!f.size) return [];
    let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
    for (const k of f.keys()) { const i = Math.floor(k / 2097152) - 1048576, j = (k % 2097152) - 1048576; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    const nx = i1 - i0 + 1, ny = j1 - j0 + 1;
    if (nx * ny > 250000) return [];
    const arr = new Float32Array(nx * ny);
    for (const [k, w] of f) { const i = Math.floor(k / 2097152) - 1048576, j = (k % 2097152) - 1048576; arr[(j - j0) * nx + (i - i0)] = w; }
    let level = 0.5;
    if (rel) { let peak = 0; for (const w of arr) peak = Math.max(peak, w); level = Math.max(0.05, rel * peak); }
    return contours(arr, nx, ny, level).map((L) => smooth(L, 2).map(([x, y]) => [(x + i0) * c, (y + j0) * c]));
  }
  // A crowd's shape that rides with it, as each cell's mark does. At each look it is built from its cells about an
  // origin carried along with them (by their mean motion, and the current for `kind`, through F.project: the very
  // carrying the marks and the page's own brackets have), and each frame it is drawn about where that origin has been
  // carried to now. So it moves with the scene frame by frame, however fast its cells or the camera, while its shape
  // eases as the crowd changes (crowdLoops' field, kept in that moving frame); `freeze`, drawn once as first found.
  function ride(st, rows, kind, R, { freeze = false, rel = 0 } = {}) {
    const F = curF, v = F.model.view;
    if (st.view !== v && rows.length) {
      st.view = v;
      const pts = rows.map((i) => nearView(F, v.x[i], v.y[i]));
      let mx = 0, my = 0, vx = 0, vy = 0;
      rows.forEach((i, q) => { mx += pts[q][0]; my += pts[q][1]; vx += v.vx[i]; vy += v.vy[i]; });
      const n = rows.length;
      st.o = st.o ? here(st, kind) : [mx / n, my / n];
      st.t = v.simTime; st.vm = [vx / n, vy / n];
      if (!freeze || !st.loops) st.loops = crowdLoops(pts.map(([x, y]) => [x - st.o[0], y - st.o[1]]), R, freeze ? null : (st.crowd ||= {}), rel);
    }
    return st.loops ? { loops: st.loops, at: () => here(st, kind) } : null;
  }
  // where a riding shape's origin is now: carried from its look's moment to the moment shown, as a mark is
  function here(st, kind) {
    const p = curF.project({ x: st.o[0], y: st.o[1], vx: st.vm[0], vy: st.vm[1], t: st.t }, kind);
    return p ? curF.toWorld(p) : st.o;
  }
  // a world point as near the view's middle as the world's wrap allows (so a shape about a crowd is the view's)
  function nearView(F, x, y) {
    const [W, H] = F.world, r = F.model.view.rect, cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
    let dx = x - cx, dy = y - cy;
    dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
    return [cx + dx, cy + dy];
  }
  // the loops drawn: hatched (fixed to the world), filled, outlined solid, dotted or dashed; fading in
  function blob(loops, tone, t, F, o = {}) {
    if (!loops.length) return null;
    const P = new Path2D(), a = g.globalAlpha;
    let top = null, n = 0;
    // (each loop moved, whole, by the world's size to lie on the side of its wrap the view is on: a shape found about
    // one side of the seam shows whole wherever the camera is)
    // (o.at: the loops are about an origin that rides with their cells, where it is now)
    const [W, H] = F.world, c0 = F.toWorld([(F.open.l + F.open.r) / 2, (F.open.t + F.open.b) / 2]), o0 = o.at ? o.at() : [0, 0];
    for (const L of loops) {
      const sx = o0[0] - W * Math.round((L[0][0] + o0[0] - c0[0]) / W), sy = o0[1] - H * Math.round((L[0][1] + o0[1] - c0[1]) / H);
      L.forEach((w, i) => { const p = F.toScreen([w[0] + sx, w[1] + sy]); if (i) P.lineTo(p[0], p[1]); else P.moveTo(p[0], p[1]); if (!top || p[1] < top[1]) top = p; });
      P.closePath();
      n += L.length;
    }
    const fIn = reduced ? 1 : clamp(t / 0.5, 0, 1);
    if (o.fill) { g.globalAlpha = a * fIn * o.fill[1]; g.fillStyle = o.fill[0]; g.fill(P, 'evenodd'); }
    if (o.hatch) {
      // (its lines fixed to the world: a point of the world at the origin, spaced by the view's scale within bounds)
      const o0 = F.toScreen([0, 0]), px = clamp(6 * (F.ppu / (o.ppu0 || F.ppu)), 4.5, 9);
      g.globalAlpha = a * fIn * (o.hatchA ?? 0.7); g.fillStyle = hatchAt(tone, o0[0], o0[1], px); g.fill(P, 'evenodd');
    }
    g.globalAlpha = a * fIn;
    g.lineJoin = 'round';
    g.lineWidth = 3; g.strokeStyle = HALO; g.stroke(P);
    g.lineWidth = o.width || 1.2; g.strokeStyle = o.col || rgba(tone, 0.9);
    if (o.dash) g.setLineDash(o.dash);
    g.stroke(P);
    g.setLineDash([]);
    g.globalAlpha = a;
    if (stats) stats.edge = Math.max(stats.edge || 0, n);
    if (A && top) A.point('zone', owner, top[0], top[1]);
    return top;
  }

  // ------------------------------------------------------------------ one note, planned
  const up = (s) => (s || '').toUpperCase(); // (a species' or genus's name: generated, never a message)
  // i18n: Live annotations: a species' diet (its guild), in capitals
  const guildUp = (g) => tr('notes.guild', '{g, select, producer {PRODUCER} grazer {GRAZER} predator {PREDATOR} scavenger {SCAVENGER} other {}}', { g: g || 'none' });
  // i18n: Live annotations: an organism's form, in capitals
  const formUp = (f) => tr('notes.form', '{f, select, filament {FILAMENT} mat {MAT} colony {COLONY} other {CLUSTER}}', { f });
  // i18n: Live annotations: a heading on the compass (the view's up is north)
  const COMPASS = [tr('notes.compass.e', 'E'), tr('notes.compass.se', 'SE'), tr('notes.compass.s', 'S'), tr('notes.compass.sw', 'SW'), tr('notes.compass.w', 'W'), tr('notes.compass.nw', 'NW'), tr('notes.compass.n', 'N'), tr('notes.compass.ne', 'NE')];
  // i18n: Live annotations: a percentage, {n} percent
  const pctUp = (x) => tr('notes.pct', '{n}%', { n: Math.round(x * 100) });
  // i18n: Live annotations: how a species bears the water: {lo}–{hi} degrees Celsius
  const comfortOf = (lo, hi) => tr('notes.comfort', 'COMFORT {lo}–{hi}°C', { lo: Math.round(lo), hi: Math.round(hi) });
  // i18n: Live annotations: how each died, in capitals, before how many (notes.cause-count)
  const causeUp = (c) => tr('notes.cause', '{c, select, kill {KILLED} grazed {GRAZED} starved {STARVED} old {OLD AGE} scalded {SCALDED} froze {FROZE} other {DRIED}}', { c });
  // i18n: Live annotations: the commonest causes of death, most first: {count} of them (one to three), each ({a}, {b},
  // {c}) a cause and how many died of it (notes.cause-count)
  const causeList = (items) => (items.length ? tr('notes.cause-list', '{count, plural, =1 {{a}} =2 {{a} · {b}} other {{a} · {b} · {c}}}', { count: items.length, a: items[0], b: items[1] ?? '', c: items[2] ?? '' }) : '');
  // i18n: Live annotations: the community's reasons for holding together, under this heading
  const whyHead = () => tr('notes.clump.why-head', 'WHY IT HOLDS TOGETHER');
  // i18n: Live annotations: the water's temperature under the dial: the pool's mean, {t} degrees
  const poolOf = (t) => tr('notes.gauge.pool', 'POOL {t}°', { t: t.toFixed(1) });
  // i18n: Live annotations: in a key, a cell or cyst of a species ({name})
  const cellOf = (name) => tr('notes.key.cell', '{name} CELL', { name });
  // a heading as the compass has it (the view's up is north)
  const compass = (an) => COMPASS[((Math.round(an / (Math.PI / 4)) % 8) + 8) % 8];
  // a species' short name: its genus's initial and its own epithet
  const short = (name) => { const w = up(name).split(' '); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : w[0]; };
  // TARGET BOX: brackets around a group on screen, its size across measured above it on a ruled dimension line
  // (its brackets' box, known before it is drawn: a label is placed once, on its first frame, and must keep off the
  // size readout above it from the first)
  function boxOf(pts) {
    let l = Infinity, tp = Infinity, r = -Infinity, b = -Infinity;
    for (const p0 of pts) { if (!(p0[3] > 0.5)) continue; const p = mp(p0); l = Math.min(l, p[0]); r = Math.max(r, p[0]); tp = Math.min(tp, p[1]); b = Math.max(b, p[1]); }
    return r > l ? { l: l - 12, t: tp - 12, r: r + 12, b: b + 12 } : null;
  }
  function targetBox(pts, tone, t, measure) {
    const B = boxOf(pts);
    if (!B) return null;
    const { l, r, b } = B, tp = B.t;
    unmapped(() => brackets(l, tp, r, b, rgba(tone, 0.9), t));
    if (measure && t > 0.35) {
      const y = tp - 8, u = reduced ? 1 : ease((t - 0.35) / 0.4), m = (l + r) / 2, hw = ((r - l) / 2) * u;
      stroke(() => { g.beginPath(); g.moveTo(m - hw, y); g.lineTo(m + hw, y); g.moveTo(m - hw, y - 3); g.lineTo(m - hw, y + 3); g.moveTo(m + hw, y - 3); g.lineTo(m + hw, y + 3); }, rgba(LINE, 0.7), 1);
      if (u >= 1) text('micro', measure, m, y - 5, rgba(INK, 0.95), 'center');
    }
    return { l, t: tp - (measure ? 22 : 0), r, b };
  }
  // ARROW: a heading, from a point, with a chevron head
  function arrow(x, y, an, len, tone, t) {
    [x, y] = mp([x, y]);
    const u = reduced ? 1 : ease(t / 0.5), ex = x + Math.cos(an) * len * u, ey = y + Math.sin(an) * len * u;
    stroke(() => {
      g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey);
      for (const s2 of [-1, 1]) { g.moveTo(ex, ey); g.lineTo(ex - Math.cos(an + s2 * 0.5) * 8, ey - Math.sin(an + s2 * 0.5) * 8); }
    }, rgba(tone, 0.95), 1.4);
  }
  // TRAIL: where something has been (world points, oldest first), as a dotted line fading into the past
  function trail(ws, tone, F) {
    if (ws.length < 2) return;
    const a = g.globalAlpha;
    for (let i = 1; i < ws.length; i++) {
      const p = F.toScreen(ws[i - 1]), q = F.toScreen(ws[i]);
      g.globalAlpha = a * (0.15 + 0.7 * (i / ws.length));
      g.setLineDash([2, 4]); g.lineWidth = 1.2; g.strokeStyle = rgba(tone, 0.9);
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    g.setLineDash([]);
    g.globalAlpha = a;
  }
  // FOOD WEB: who has eaten whom in view over the last 30 s. The species by trophic level (hunters above, grazers and
  // scavengers between, producers below; three at most a level, those with the most to do with the rest), each a tag:
  // its guild's glyph in the species' own color (as its cells show), its genus over its epithet, and how much it ate
  // and was eaten. An arrow curves up from the eaten to its eater, as thick as its share of all that was eaten (kills
  // in hot). Each level's tags are ordered under their eaters, so the arrows cross as little as they can.
  const WEB_W = 510, WEB_TIER = 78, NODE_W = 126, NODE_H = 46;
  const webH = (W2, F) => 44 + webTiers(W2, F).length * WEB_TIER + 22;
  function webTiers(W2, F) {
    const level = (k) => { const gd = F.species(k)?.guild; return gd === 'predator' ? 0 : gd === 'producer' ? 2 : 1; };
    const vol = new Map(), ate = new Map(), eaten = new Map();
    for (const e of W2.edges) {
      const v = e.bites + e.kills;
      vol.set(e.from, (vol.get(e.from) || 0) + v); vol.set(e.to, (vol.get(e.to) || 0) + v);
      ate.set(e.to, (ate.get(e.to) || 0) + v); eaten.set(e.from, (eaten.get(e.from) || 0) + v);
    }
    const rows = [[], [], []];
    for (const nd of W2.nodes) rows[level(nd.kind)].push({ ...nd, vol: vol.get(nd.kind) || 0, ate: ate.get(nd.kind) || 0, eaten: eaten.get(nd.kind) || 0 });
    return rows.map((r, lv) => ({ lv, row: r.sort((p, q) => q.vol - p.vol).slice(0, 3) })).filter((T) => T.row.length);
  }
  function web(W2, x, y, t, F) {
    const a = g.globalAlpha, tiers = webTiers(W2, F), H = webH(W2, F);
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.4, 0, 1));
    g.fillStyle = PLATE; g.fillRect(x, y, WEB_W, H);
    g.strokeStyle = rgba(LINE, 0.28); g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, WEB_W - 1, H - 1);
    // i18n: Live annotations: the food web's panel: its heading, the meals in it, its levels, what each species ate and was eaten of, and its key
    const head = tr('notes.web.head', 'FOOD WEB · WHO EATS WHOM HERE'), hw = width('head', head) + 14;
    g.fillStyle = 'rgba(6,9,10,0.9)'; g.fillRect(x + 8, y - 7, hw, 15);
    g.strokeStyle = rgba(LINE, 0.55); g.strokeRect(x + 8.5, y - 6.5, hw - 1, 14);
    setType('head'); g.textAlign = 'left'; g.fillStyle = rgba(INK, 0.95); g.fillText(head, x + 15, y + 4);
    if (A) A.box(owner, head, x + 8, y - 7, x + 8 + hw, y + 8);
    const bites = Math.round(W2.edges.reduce((s2, e) => s2 + e.bites, 0)), kills = W2.edges.reduce((s2, e) => s2 + e.kills, 0);
    text('data', tr('notes.web.meals', '{bites} BITES{kills, plural, =0 {} other { · {kills} KILLS}} IN THE LAST 30 S', { bites, kills }), x + 12, y + 24, rgba(INK2, 1));
    // the tags' places, level by level from the top: each level ordered by where its eaters stand
    const at = new Map(), x0 = x + 92, w0 = WEB_W - 100;
    tiers.forEach(({ lv, row }, r) => {
      const cy = y + 44 + r * WEB_TIER + NODE_H / 2;
      const bary = (nd) => { let sx = 0, n2 = 0; for (const e of W2.edges) if (e.from === nd.kind && at.has(e.to)) { sx += at.get(e.to).cx; n2++; } return n2 ? sx / n2 : null; };
      if (r > 0) row.sort((p, q) => (bary(p) ?? 1e9) - (bary(q) ?? 1e9));
      row.forEach((nd, i) => { const cx = x0 + (w0 * (i + 0.5)) / row.length; at.set(nd.kind, { cx, cy, l: cx - NODE_W / 2, r: cx + NODE_W / 2, t: cy - NODE_H / 2, b: cy + NODE_H / 2, nd }); });
      text('micro', [tr('notes.web.hunters', 'HUNTERS'), tr('notes.web.grazers', 'GRAZERS'), tr('notes.web.producers', 'PRODUCERS')][lv], x + 12, cy + 4, rgba(INK3, 1));
    });
    // the arrows, under the tags, spread where several meet one tag
    const u = reduced ? 1 : ease((t - 0.2) / 0.6), ends = new Map(), total = W2.edges.reduce((s2, e) => s2 + e.bites + e.kills, 0) || 1;
    const spread = (k, side, n2) => { const key = `${k}${side}`, i = ends.get(key) || 0; ends.set(key, i + 1); return (i - (n2 - 1) / 2) * 12; };
    const degree = (k, side) => W2.edges.filter((e) => at.has(e.from) && at.has(e.to) && (side === 'out' ? e.from === k : e.to === k)).length;
    for (const e of [...W2.edges].sort((p, q) => (p.kills ? 1 : 0) - (q.kills ? 1 : 0))) {
      const p = at.get(e.from), q = at.get(e.to);
      if (!p || !q || p === q) continue;
      const tone = e.kills ? HOT : INK, w = clamp(1 + 7 * ((e.bites + e.kills) / total), 1, 6);
      const upward = q.cy < p.cy;
      const s0 = [p.cx + spread(e.from, 'o', degree(e.from, 'out')), upward ? p.t : p.b];
      const s1 = [q.cx + spread(e.to, 'i', degree(e.to, 'in')), upward ? q.b : q.t];
      const k = (s1[1] - s0[1]) * 0.45, c0 = [s0[0], s0[1] + k], c1 = [s1[0], s1[1] - k];
      const at2 = (v) => { const m = 1 - v; return [m * m * m * s0[0] + 3 * m * m * v * c0[0] + 3 * m * v * v * c1[0] + v * v * v * s1[0], m * m * m * s0[1] + 3 * m * m * v * c0[1] + 3 * m * v * v * c1[1] + v * v * v * s1[1]]; };
      stroke(() => { g.beginPath(); g.moveTo(...s0); for (let i = 1; i <= 20; i++) g.lineTo(...at2((i / 20) * u)); }, rgba(tone, e.kills ? 0.9 : 0.7), w);
      if (u >= 1) {
        const q2 = at2(0.9), an2 = Math.atan2(s1[1] - q2[1], s1[0] - q2[0]);
        g.fillStyle = rgba(tone, 0.95);
        g.beginPath(); g.moveTo(s1[0], s1[1]); g.lineTo(s1[0] - Math.cos(an2 - 0.45) * 8, s1[1] - Math.sin(an2 - 0.45) * 8); g.lineTo(s1[0] - Math.cos(an2 + 0.45) * 8, s1[1] - Math.sin(an2 + 0.45) * 8); g.closePath(); g.fill();
      }
    }
    // the tags over them
    for (const [k, b2] of at) {
      const sp = F.species(k), hot = isActive(k), words = up(sp?.name).split(' ');
      g.fillStyle = 'rgba(6,9,10,0.96)'; g.fillRect(b2.l, b2.t, NODE_W, NODE_H);
      g.strokeStyle = rgba(hot ? HOT : LINE, hot ? 0.9 : 0.45); g.lineWidth = 1; g.strokeRect(b2.l + 0.5, b2.t + 0.5, NODE_W - 1, NODE_H - 1);
      // its glyph in its own color, as its cells show
      spGlyph(k, b2.l + 10, b2.t + 13, 4.5);
      text('micro', fit('micro', words[0] || '', NODE_W - 26), b2.l + 20, b2.t + 12, rgba(INK2, 1));
      text('data', fit('data', words.slice(1).join(' ') || words[0] || '', NODE_W - 26), b2.l + 20, b2.t + 24, rgba(INK, 0.98));
      // i18n: Live annotations: in the food web, how many of others a species ate ({ate}) and how many of it were eaten ({eaten}), each when there were any
      const nd = b2.nd, flow = tr('notes.web.flow', '{has, select, both {ATE {ate} · EATEN {eaten}} ate {ATE {ate}} eaten {EATEN {eaten}} other {}}', { has: nd.ate && nd.eaten ? 'both' : nd.ate ? 'ate' : nd.eaten ? 'eaten' : 'none', ate: Math.round(nd.ate || 0), eaten: Math.round(nd.eaten || 0) });
      text('data', fit('data', flow, NODE_W - 12), b2.l + 6, b2.t + 41, rgba(INK3, 1));
    }
    // the key: which way the arrows run
    text('micro', tr('notes.web.key', 'ARROWS RUN FROM THE EATEN UP TO THE EATER'), x + 12, y + H - 9, rgba(INK3, 1));
    g.globalAlpha = a;
  }
  let isActive = () => false;
  function noteState(id) {
    let S = notesAt.get(id);
    if (!S) notesAt.set(id, (S = { c: {}, an: [{}, {}], z: {} }));
    return S;
  }
  function plan(n, M, F) {
    const d = n.data, sp = (k) => F.species(k), nm = (k) => (sp(k)?.name ? up(sp(k).name) : tr('notes.unnamed', 'UNNAMED')), S = noteState(n.id);
    const pos = (id) => { const c = M.cell(id); return c ? markAt(id, c, c.kind === -1 ? (d.akind ?? d.kind) : c.kind, F.project, F.dt) : null; };
    // in the open world, out from under the frame's panels (by a margin, for what a label hangs on)
    const shows = (p, m = 0) => p[0] > F.open.l + m && p[0] < F.open.r - m && p[1] > F.open.t + m && p[1] < F.open.b - m
      && !F.block.some((b) => p[0] > b.l - m && p[0] < b.r + m && p[1] > b.t - m && p[1] < b.b + m);
    const group = (key, rows) => steady((S.c[key] ||= {}), rows, F);
    // the rows of a census read from the view's cells: found once a look at the view (M.view is new at each readback),
    // the same array until the next, so steady's cache holds between (dep: what else they are found from)
    const viewRows = (key, dep, scan) => {
      const c = (S.rows ||= {})[key];
      if (c && c.view === M.view && c.dep === dep) return c.rows;
      return (S.rows[key] = { view: M.view, dep, rows: scan(M.view) }).rows;
    };
    // a label's anchor: one cell of the group, chosen once and kept, found every frame by its id (the page looks for it
    // on the GPU: n.pins) wherever the group's sample goes; another only when that cell is gone altogether (its note
    // ends when that cell leaves the view)
    const hang = (k, pts, kind, prefer = null) => {
      const st = S.an[k];
      // (a living cell is looked for every frame; a place where one died, or a husk, is where it is)
      st.pin = kind !== -1;
      if (st.anchor == null && prefer != null) st.anchor = prefer;
      if (st.anchor != null) {
        const c = M.cell(st.anchor);
        const p = c && markAt(st.anchor, c, c.kind === -1 ? kind : c.kind, F.project, F.dt);
        if (p) return [p[0], p[1], st.anchor, 1];
      }
      return anchorOf(st, pts, (p) => shows(p, 24));
    };
    const P = { tone: INK, draws: [], label: null, anchor: null, keys: [], gauge: null, extra: null, pts: [], boxes: [] };
    const recent = (evs, kind, secs) => M.since(M.view.simTime - secs, evs, (e) => kind == null || e.kind === kind);
    const wide = d.band === 'wide';
    // the newest few dozen of some events, as crosses where they happened, fading out over the last 2 s of `secs`
    const pips = (evs, tone, delay = 0, secs = 10) => {
      for (const e of evs.slice(0, 40)) {
        const p = F.project({ x: e.x, y: e.y, vx: 0, vy: 0, t: e.t }, -1), fade = clamp((secs - (M.view.simTime - e.t)) / 2, 0, 1);
        if (p && shows(p)) P.draws.push((t) => pip(p[0], p[1], tone, t - delay, fade));
      }
    };
    // what a lock and a link's verb cover, for the labels to keep off
    const lockBox = (p, r) => { const R = lockR(r); P.boxes.push({ l: p[0] - R, t: p[1] - R, r: p[0] + R, b: p[1] + R }); };
    // (a verb that would lie under the page's own text or a panel fades out until it is clear)
    const verbBox = (a, b, verb, bend) => {
      const C = linkCurve(a, b, bend, 9), box = C && linkTag(C, verb, bend).box;
      const clear = box && ![...F.avoid, ...F.block, ...F.verbs, ...lastLabels].some((r) => area(box, r) > 0);
      S.verbA = clamp((S.verbA ?? 0) + ((clear ? 1 : -1) * F.dt) / 0.08, 0, 1);
      if (box && S.verbA > 0) { P.boxes.push({ ...box, hard: true }); F.verbs.push(box); }
      return S.verbA;
    };
    // up close a glyph and a group's ground grow with the cells they mark
    const glyphOf = (k) => clamp(F.radius(k) * 0.22, 4, 8);
    if (d.type === 'hunt' || d.type === 'scavenge') {
      const a = pos(d.actor);
      const b = d.type === 'hunt' ? pos(d.target) : F.project({ x: d.spot[0], y: d.spot[1], vx: 0, vy: 0, t: M.view.simTime }, -1);
      if (!a || !b) return null;
      // i18n: Live annotations: the verb on the line from a hunter to its kill, or from a scavenger to what it eats
      const r = F.radius(d.akind), verb = d.type === 'hunt' ? tr('notes.hunt.verb', 'KILL') : tr('notes.scavenge.verb', 'EATS REMAINS');
      P.tone = d.type === 'hunt' ? HOT : INK;
      const va = verbBox(a, b, verb, 0.18);
      P.draws.push((t) => link(a, b, verb, P.tone, t - 0.3, F.now, 0.18, 9, false, va));
      P.draws.push((t) => lock(a[0], a[1], r, P.tone, t));
      if (d.type === 'hunt') P.draws.push((t) => pip(b[0], b[1], HOT, t - 0.6));
      lockBox(a, r);
      P.anchor = [a[0], a[1] - r];
      P.pts = [a, b];
      P.label = d.type === 'hunt'
        // i18n: Live annotations: a hunter's label: its kills in view, the species ({name}) it killed
        ? { tone: HOT, eye: tr('notes.hunt.eye', 'HUNTER'), num: String(d.kills), main: nm(d.akind), data: [tr('notes.hunt.killed', 'KILLED {name}', { name: nm(d.kind) }), tr('notes.hunt.count', 'KILLS IN VIEW · LAST 30 S')] }
        : { tone: INK, eye: tr('notes.scavenge.eye', 'SCAVENGER'), num: String(d.meals), main: nm(d.akind), data: [tr('notes.scavenge.data', 'EATS THE REMAINS OF THE DEAD')] };
      if (d.type === 'hunt') P.keys.push({ glyph: 'cross', text: tr('notes.key.killed', 'KILLED'), tone: HOT });
    } else if (d.type === 'graze') {
      const pts = group('g', M.rows(d.census));
      const a = d.actor !== NONE ? pos(d.actor) : null, b = d.target !== NONE ? pos(d.target) : null;
      const c = a || hang(0, pts, d.akind);
      if (!c) return null;
      P.draws.push((t) => census(pts, 'plus', INK, t, c, glyphOf(d.akind)));
      if (a && b) {
        // i18n: Live annotations: the verb on the line from a grazer to the cell it bites
        const verb = tr('notes.graze.verb', 'GRAZES'), va = verbBox(a, b, verb, -0.18);
        P.draws.push((t) => link(a, b, verb, INK, t - 0.2, F.now, -0.18, 9, false, va));
        P.draws.push((t) => lock(a[0], a[1], F.radius(d.akind), INK, t));
        lockBox(a, F.radius(d.akind));
      }
      P.anchor = c;
      P.pts = pts;
      const g2 = sp(d.akind);
      // i18n: Live annotations: a grazer's label (or a hunter's, grazing): its bites on a species ({name}), and how many it grazed to death
      P.label = { tone: INK, eye: g2?.guild === 'predator' ? tr('notes.hunt.eye', 'HUNTER') : tr('notes.graze.eye', 'GRAZER'), num: String(d.bites), main: nm(d.akind),
        data: [tr('notes.graze.bites', 'BITES ON {name} · LAST 30 S', { name: nm(d.kind) }), ...(d.dead ? [tr('notes.graze.dead', '{n} GRAZED TO DEATH', { n: d.dead })] : [])] };
      P.keys.push({ glyph: 'plus', text: cellOf(nm(d.akind)), tone: INK });
      if (d.dead) {
        const deaths = recent(new Set(['grazed']), d.kind, 10).filter((e) => e.akind === d.akind || e.aid === NONE);
        pips(deaths, HOT);
        if (deaths.length) P.keys.push({ glyph: 'cross', text: tr('notes.key.grazed', 'GRAZED TO DEATH'), tone: HOT });
      }
    } else if (d.type === 'newsp' || d.type === 'spark') {
      const c = pos(d.target);
      if (!c) return null;
      const m = d.actor !== NONE ? pos(d.actor) : null;
      P.tone = HOT;
      // i18n: Live annotations: the verb on the line from a parent to the new species it budded
      if (m) { const verb = tr('notes.newsp.verb', 'BUDS'), va = verbBox(m, c, verb, 0.22); P.draws.push((t) => link(m, c, verb, INK, t - 0.2, F.now, 0.22, 9, false, va)); }
      P.draws.push((t) => lock(c[0], c[1], F.radius(d.kind), HOT, t));
      lockBox(c, F.radius(d.kind));
      P.anchor = [c[0], c[1] - F.radius(d.kind)];
      P.pts = m ? [c, m] : [c];
      const g2 = sp(d.kind);
      const comfort = g2 ? comfortOf(g2.topt - g2.tol, g2.topt + g2.tol) : '';
      // i18n: Live annotations: a new species' diet ({guild}, notes.guild) and how it bears the water ({comfort}, notes.comfort; when known)
      const kindLine = tr('notes.newsp.kind', '{guild}{has, select, yes { · {comfort}} other {}}', { guild: guildUp(g2?.guild), has: comfort ? 'yes' : 'no', comfort });
      // i18n: Live annotations: life sparked from silt (a new lineage: its diet), or a new species, a mutant of another ({name})
      P.label = d.type === 'spark'
        ? { tone: HOT, tag: tr('notes.spark.tag', 'LIFE FROM SILT'), main: nm(d.kind), data: [tr('notes.spark.data', 'A NEW LINEAGE · {guild}', { guild: guildUp(g2?.guild) }), comfort].filter(Boolean) }
        : { tone: HOT, tag: tr('notes.newsp.tag', 'NEW SPECIES'), main: nm(d.kind), data: [tr('notes.newsp.data', 'A MUTANT OF {name}', { name: nm(d.akind) }), kindLine] };
    } else if (d.type === 'bloom' || d.type === 'waking' || d.type === 'dormant') {
      const pts = group('c', M.rows(d.kind, d.type === 'dormant' ? 'cyst' : 'all'));
      const an = hang(0, pts, d.kind);
      if (!an) return null;
      const glyph = d.type === 'dormant' ? 'ring' : 'plus';
      P.draws.push((t) => census(pts, glyph, INK, t, an, glyphOf(d.kind)));
      P.anchor = an;
      P.pts = pts;
      const s = M.stats.by.get(d.kind), g2 = sp(d.kind);
      // i18n: Live annotations: a species dividing ({n} of it in view), cysts waking, or cells going dormant
      if (d.type === 'bloom') P.label = { tone: INK, eye: tr('notes.bloom.eye', 'DIVIDING'), num: `+${d.births}`, main: nm(d.kind), data: [tr('notes.bloom.data', 'BORN IN 20 S · {n} IN VIEW', { n: Math.round((s?.n ?? 0) * M.stats.scale) }), guildUp(g2?.guild)] };
      else if (d.type === 'waking') P.label = { tone: INK, eye: tr('notes.waking.eye', 'WAKING'), num: String(d.count), main: nm(d.kind), data: [tr('notes.waking.data', 'CYSTS WAKING IN 20 S'), tr('notes.waking.why', 'TO TRY THEIR LUCK AGAIN')] };
      else P.label = { tone: INK, eye: tr('notes.dormant.eye', 'GOING DORMANT'), num: String(d.count), main: nm(d.kind), data: [tr('notes.dormant.data', 'CURLED INTO CYSTS IN 20 S'), tr('notes.dormant.why', 'NOTHING IN REACH TO EAT')] };
      P.keys.push({ glyph, text: d.type === 'dormant' ? tr('notes.key.cyst', '{name} CYST', { name: nm(d.kind) }) : cellOf(nm(d.kind)), tone: INK });
    } else if (d.type === 'heat') {
      const g2 = sp(d.kind);
      if (!g2) return null;
      const rows = M.rows(d.kind, 'hot'), pts = group('h', rows);
      const an = hang(0, pts, d.kind);
      if (!an) return null;
      P.tone = HOT;
      S.ppu0 ||= F.ppu;
      if (wide) {
        // the water too warm for it: where the water's warmth crosses what it bears (an isotherm), unless that is nearly
        // everywhere in view (then told by the label and the gauge alone)
        let inView = 0;
        for (const b of M.view.sqIn) inView += b;
        if (S.heatView !== M.view) {
          S.heatView = M.view;
          S.loops = d.squares.length <= 0.7 * inView ? gridLoops(M.view.temps, M.view.grid, g2.topt + 0.8 * g2.tol, M.view.sqOnce) : [];
        }
        const loops = S.loops;
        P.draws.push((t) => blob(loops, HOT, t, F, { hatch: true, ppu0: S.ppu0 }));
      } else {
        // its too-warm cells' ground: a shape about them that rides with them, eased from look to look
        const sh = ride((S.ride ||= {}), rows, d.kind, clamp(F.radius(d.kind) * 2.4, 16, 90) / F.ppu);
        if (sh) P.draws.push((t) => blob(sh.loops, HOT, t, F, { hatch: true, ppu0: S.ppu0, at: sh.at }));
        P.draws.push((t) => census(pts, 'square', HOT, t - 0.2, an, glyphOf(d.kind)));
      }
      const deaths = recent('scalded', d.kind, 10);
      pips(deaths, HOT, 0.4);
      P.anchor = an;
      P.pts = pts;
      const lo = g2.topt - g2.tol, hi = g2.topt + g2.tol, w = M.water.hi;
      const scale = { min: Math.floor(Math.min(lo, w) / 5) * 5 - 5, max: Math.ceil(Math.max(hi, w) / 5) * 5 + 5 };
      // i18n: Live annotations: a species scalding in warm water: how it bears the water ({comfort}, notes.comfort), how many died of it
      P.label = { tone: HOT, tag: tr('notes.heat.tag', 'SCALDING'), num: String(d.hot), main: nm(d.kind), data: [tr('notes.heat.data', '{comfort} · {n} DEAD / 30 S', { comfort: comfortOf(lo, hi), n: d.scalds })], range: { lo, hi, v: w, ...scale } };
      P.gauge = { v: w, lo, hi, ...scale, sub: poolOf(F.pool) };
      P.keys.push({ glyph: 'square', text: wide ? tr('notes.key.too-warm-for', 'WATER TOO WARM FOR {name}', { name: nm(d.kind) }) : tr('notes.key.too-warm', 'TOO WARM: SCALDING'), tone: HOT });
      if (deaths.length) P.keys.push({ glyph: 'cross', text: tr('notes.key.scalded', 'SCALDED, LAST 10 S'), tone: HOT });
      // beside it, a species that bears the same water
      if (d.fine) {
        const f2 = sp(d.fine.kind), fpts = group('f', M.rows(d.fine.kind));
        const fa = f2 && hang(1, fpts, d.fine.kind);
        if (fa) {
          const flo = f2.topt - f2.tol, fhi = f2.topt + f2.tol;
          // i18n: Live annotations: beside a species scalding, one that bears the same water
          P.extra = { anchor: fa, pts: fpts, label: { tone: INK, tag: tr('notes.heat.fine', 'NOT SCALDING'), num: String(Math.round(d.fine.n * M.stats.scale)), main: nm(d.fine.kind),
            data: [comfortOf(flo, fhi)], range: { lo: flo, hi: fhi, v: w, min: Math.floor(Math.min(flo, w) / 5) * 5 - 5, max: Math.ceil(Math.max(fhi, w) / 5) * 5 + 5 } } };
          P.draws.push((t) => census(fpts, 'plus', INK, t - 0.6, fa, glyphOf(d.fine.kind)));
          P.keys.push({ glyph: 'plus', text: cellOf(nm(d.fine.kind)), tone: INK });
        }
      }
    } else if (d.type === 'cold') {
      const St = M.stats, rows = [];
      for (const s of St.by.values()) for (const i of s.torpidRows) rows.push(i);
      const pts = group('t', rows);
      const an = hang(0, pts, d.kind);
      if (!an) return null;
      P.tone = CYAN;
      if (wide) {
        // the ice, where it lies
        S.ppu0 ||= F.ppu;
        if (S.iceView !== M.view) { S.iceView = M.view; S.loops = gridLoops(M.view.ice, M.view.grid, 0.3, M.view.sqOnce); }
        const loops = S.loops;
        P.draws.push((t) => blob(loops, CYAN, t, F, { hatch: true, ppu0: S.ppu0 }));
      } else P.draws.push((t) => census(pts, 'ring', CYAN, t, an));
      const froze = recent('froze', null, 10);
      pips(froze, HOT, 0.4);
      P.anchor = an;
      P.pts = pts;
      const W = M.water;
      // i18n: Live annotations: cells stilled by the cold: {n} of the living in view, how many species, the water's temperature ({t} degrees), its ice ({ice} percent, when there is any) and how many froze to death
      P.label = { tone: CYAN, tag: tr('notes.cold.tag', 'TORPID'), num: String(Math.round(St.torpid * St.scale)), main: tr('notes.cold.main', 'OF {n} CELLS STILLED', { n: Math.round(St.living * St.scale) }),
        data: [tr('notes.cold.data', 'TOO COLD TO MOVE · {n} SPECIES', { n: d.species }), tr('notes.cold.water', 'WATER {t}°{iced, select, yes { · {ice}% ICE} other {}} · {n} FROZE / 30 S', { t: W.mean.toFixed(1), iced: W.iced > 0 ? 'yes' : 'no', ice: Math.round(W.iced * 100), n: d.froze })] };
      P.keys.push(wide ? { glyph: 'square', text: tr('notes.key.ice', 'ICE'), tone: CYAN } : { glyph: 'ring', text: tr('notes.key.torpid', 'TORPID: TOO COLD TO MOVE'), tone: CYAN });
      if (froze.length) P.keys.push({ glyph: 'cross', text: tr('notes.key.froze', 'FROZE, LAST 10 S'), tone: HOT });
      const g2 = d.kind >= 0 ? sp(d.kind) : null;
      if (g2) {
        const lo = g2.topt - g2.tol, hi = g2.topt + g2.tol;
        P.gauge = { v: W.mean, lo, hi, min: Math.floor(Math.min(lo, W.mean) / 5) * 5 - 5, max: Math.ceil(Math.max(hi, W.mean) / 5) * 5 + 5, sub: poolOf(F.pool) };
      }
      if (d.warm >= 0) {
        const w2 = sp(d.warm), wpts = group('w', M.rows(d.warm));
        const wa = w2 && hang(1, wpts, d.warm);
        if (wa) {
          // i18n: Live annotations: beside cells stilled by the cold, a species still moving ({name})
          P.extra = { anchor: wa, pts: wpts, label: { tone: INK, tag: tr('notes.cold.warm', 'STILL ACTIVE'), num: String(Math.round((St.by.get(d.warm)?.n ?? 0) * St.scale)), main: nm(d.warm), data: [comfortOf(w2.topt - w2.tol, w2.topt + w2.tol)] } };
          P.draws.push((t) => census(wpts, 'plus', INK, t - 0.6, wa, glyphOf(d.warm)));
          P.keys.push({ glyph: 'plus', text: tr('notes.key.still-active', '{name}: STILL ACTIVE', { name: nm(d.warm) }), tone: INK });
        }
      }
    } else if (d.type === 'body' || d.type === 'swim') {
      // an organism: its cells (by their ids, wherever the view's sample has them), brackets about it with its size,
      // and swimming, its heading and where it has been
      const v = M.view, rows = [];
      for (const id of d.members) { const i = v.at.get(id); if (i !== undefined) rows.push(i); }
      const pts = group('b', rows), an = hang(0, pts, d.kind, d.anchor);
      if (!an) return null;
      const swim = d.type === 'swim', g2 = sp(d.kind), tone = swim ? HOT : INK;
      P.tone = tone;
      const live = pts.filter((p) => p[3] > 0.5);
      const mid = live.length ? [live.reduce((a, p) => a + p[0], 0) / live.length, live.reduce((a, p) => a + p[1], 0) / live.length] : an;
      if (swim) {
        // (its middle in the world, every quarter second, for the last four)
        const tl = (S.trail ||= []), w = F.toWorld(mid);
        if (!tl.length || F.now - tl.at > 0.25) { tl.push(w); tl.at = F.now; if (tl.length > 16) tl.shift(); }
        P.draws.push(() => trail(tl, HOT, F));
        P.draws.push((t) => arrow(mid[0], mid[1], d.heading, clamp(d.lengths * 30, 36, 90), HOT, t - 0.3));
      }
      P.draws.push((t) => census(pts, 'plus', tone, t, an, clamp(F.radius(d.kind) * 0.18, 3, 6)));
      P.draws.push((t) => targetBox(pts, tone, t, fmtLen(d.size)));
      // (its size readout is text: the labels keep off it as off any other)
      const bx = boxOf(pts);
      if (bx) P.boxes.push({ l: bx.l, r: bx.r, t: bx.t - 24, b: bx.t, hard: true }, bx);
      P.anchor = an;
      P.pts = pts;
      const form = formUp(d.form);
      // i18n: Live annotations: a swimming organism ({name} its species, {n} cells, {form} notes.form, {speed} a speed, {heading} notes.compass), or an organism ({size} across)
      P.label = swim
        ? { tone: HOT, eye: tr('notes.swim.eye', 'SWIMMING'), num: d.lengths.toFixed(1), main: tr('notes.swim.main', 'BODY LENGTHS / S'), data: [tr('notes.body.cells', '{name} · {n}-CELL {form}', { name: nm(d.kind), n: d.cells, form }), tr('notes.swim.speed', '{speed} · HEADING {heading}', { speed: fmtLen(d.speed, '/s'), heading: compass(d.heading) })] }
        : { tone: INK, eye: tr('notes.body.eye', 'ORGANISM'), num: String(d.cells), main: tr('notes.body.main', 'CELLS · {name}', { name: nm(d.kind) }), data: [tr('notes.body.data', 'ONE BODY: A {form} {size} ACROSS', { form, size: fmtLen(d.size) }), tr('notes.body.share', '{guild} · BONDED CELLS SHARE WHAT THEY GATHER', { guild: guildUp(g2?.guild) })] };
      P.keys.push({ glyph: 'plus', text: tr('notes.key.body', '{name}: ONE BODY', { name: nm(d.kind) }), tone });
    } else if (d.type === 'stalk') {
      // a hunter closing on its quarry: its lock, a dashed line to the quarry with how far it has to go
      const a = pos(d.actor), b = pos(d.target);
      if (!a || !b) return null;
      const r = F.radius(d.akind), wa = F.toWorld(a), wb = F.toWorld(b), dist = Math.hypot(wb[0] - wa[0], wb[1] - wa[1]) - 0;
      P.tone = HOT;
      const va = verbBox(a, b, fmtLen(dist), 0.12);
      P.draws.push((t) => link(a, b, fmtLen(dist), HOT, t - 0.3, F.now, 0.12, 9, true, va));
      P.draws.push((t) => lock(a[0], a[1], r, HOT, t));
      P.draws.push((t) => brackets(b[0] - F.radius(d.kind) - 4, b[1] - F.radius(d.kind) - 4, b[0] + F.radius(d.kind) + 4, b[1] + F.radius(d.kind) + 4, rgba(INK, 0.8), t - 0.5));
      lockBox(a, r);
      P.anchor = [a[0], a[1] - r];
      P.pts = [a, b];
      // i18n: Live annotations: a hunter closing on its quarry ({name} its species), at {speed}
      P.label = { tone: HOT, eye: tr('notes.stalk.eye', 'HUNTING'), main: nm(d.akind), data: [tr('notes.stalk.data', 'CLOSING ON {name}', { name: nm(d.kind) }), tr('notes.stalk.why', 'ITS LAST MEAL WAS ONE OF THEM · {speed}', { speed: fmtLen(d.speed, '/s') })] };
      P.keys.push({ glyph: 'cross', text: tr('notes.key.quarry', 'QUARRY'), tone: INK });
    } else if (d.type === 'web') {
      // the food web: a panel, its species marked in the view by their guild's glyph
      if (F.phone) return null;
      P.panel = { draw: (x, y, t) => web(d, x, y, t, F) };
      P.anchor = null;
    } else if (d.type === 'balance') {
      const pts = group('c', M.rows(d.kind));
      const an = hang(0, pts, d.kind);
      if (!an) return null;
      P.draws.push((t) => census(pts, 'plus', INK, t, an, glyphOf(d.kind)));
      const died = recent(new Set(['kill', 'grazed', 'starved', 'old', 'scalded', 'froze', 'dried']), d.kind, 10);
      pips(died, HOT, 0.3);
      P.anchor = an;
      P.pts = pts;
      const net = d.born - d.dead, CAUSE = { kill: HOT, grazed: HOT, starved: INK2, old: INK3, scalded: HOT, froze: CYAN, dried: INK3 };
      const deaths = Object.entries(d.died).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([c, k]) => [causeUp(c), k, CAUSE[c]]);
      // i18n: Live annotations: a species' births against its deaths: thriving, declining or turning over; its deaths by cause ({cause} notes.cause, {n} of them)
      P.label = { tone: net >= 0 ? CYAN : HOT, tag: net > d.dead * 0.2 ? tr('notes.balance.thriving', 'THRIVING') : -net > d.born * 0.2 ? tr('notes.balance.declining', 'DECLINING') : tr('notes.balance.turnover', 'TURNOVER'), num: `${net > 0 ? '+' : ''}${net}`, main: nm(d.kind),
        data: [tr('notes.balance.data', 'BORN {born} · DIED {dead} · LAST 30 S', { born: d.born, dead: d.dead }), causeList(deaths.slice(0, 3).map(([c, k]) => tr('notes.cause-count', '{cause} {n}', { cause: c, n: k }))) || tr('notes.balance.none-died', 'NONE DIED')], split: { born: d.born, deaths } };
      P.keys.push({ glyph: 'plus', text: cellOf(nm(d.kind)), tone: INK });
      if (died.length) P.keys.push({ glyph: 'cross', text: tr('notes.key.died', 'DIED, LAST 10 S'), tone: HOT });
    } else if (d.type === 'genus') {
      // sister species: each its own glyph
      const GL = ['plus', 'square', 'ring', 'cross'];
      const F2 = { ...F, cap: Math.round(F.cap / 3) };
      const groups = d.kinds.map((k, i) => ({ k, glyph: GL[i], pts: steady((S.c[`s${i}`] ||= {}), M.rows(k), F2) }));
      const an = hang(0, groups[0].pts, d.kinds[0]);
      if (!an) return null;
      for (const G of groups) P.draws.push((t) => census(G.pts, G.glyph, INK, t, an, glyphOf(G.k)));
      P.anchor = an;
      P.pts = groups.flatMap((G) => G.pts);
      const total = d.kinds.reduce((a, k) => a + (M.stats.by.get(k)?.n || 0), 0) || 1;
      // i18n: Live annotations: sister species of one genus ({name}, its name)
      P.label = { tone: INK, eye: tr('notes.genus.eye', 'SISTER SPECIES'), num: String(d.species), main: tr('notes.genus.main', 'SPECIES OF {name}', { name: up(d.genusName) }),
        data: [tr('notes.genus.data', 'DESCENDED FROM ONE ANCESTOR, SIDE BY SIDE')],
        table: d.kinds.map((k) => { const n2 = M.stats.by.get(k)?.n || 0; return { kind: k, name: up(sp(k)?.name), value: String(Math.round(n2 * M.stats.scale)), share: n2 / total }; }) };
      for (const G of groups) P.keys.push({ glyph: G.glyph, text: nm(G.k), tone: INK });
    } else if (d.type === 'clump') {
      // a community: its outline (a shape about its cells as they were when it was found: it does not shift), the label
      // hung on a cell at its middle; what it holds as a table of its species (glyph, name, share) and a bar in their
      // colors; why it may hold together
      const v = M.view, rows = [];
      for (const id of d.ids || []) { const i = v.at.get(id); if (i !== undefined) rows.push(i); }
      const sh = ride((S.ride ||= {}), rows, d.shares[0]?.kind ?? -2, d.b * 1.4, { freeze: true, rel: 0.2 });
      if (sh) P.draws.push((t) => blob(sh.loops, LINE, t, F, { width: 1.4, fill: ['rgba(150,222,230,1)', 0.05], at: sh.at }));
      const an = hang(0, [], -2, d.anchor);
      if (!an) return null;
      P.anchor = an;
      const pct = pctUp;
      // i18n: Live annotations: why a community may hold together
      const WHY = {
        bodies: (x) => tr('notes.clump.why.bodies', '{pct} OF ITS CELLS BONDED IN MATS', { pct: pct(x) }),
        grazing: (x) => tr('notes.clump.why.grazing', 'GRAZERS ON ITS PRODUCERS · {n} BITES / 30 S', { n: x }),
        hunters: () => tr('notes.clump.why.hunters', 'HUNTERS FOLLOW THE GRAZERS IN'),
        nursery: (x) => tr('notes.clump.why.nursery', 'A NURSERY: {n} BORN HERE IN 30 S', { n: x }),
        current: () => tr('notes.clump.why.current', 'THE CURRENT GATHERS DRIFTERS HERE'),
        still: () => tr('notes.clump.why.still', 'ITS CELLS HOLD STILL AS THE REST DRIFT'),
      };
      const why = d.why.slice(0, 2).map(([k, x]) => WHY[k](x));
      // i18n: Live annotations: a community: {n} cells, {size} across
      P.label = { tone: INK, tag: tr('notes.clump.tag', 'COMMUNITY'), num: String(d.species), main: tr('notes.clump.main', 'SPECIES IN ONE CLUMP'),
        data: [tr('notes.clump.data', '{n} CELLS · {size} ACROSS', { n: d.cells, size: fmtLen(d.size) })],
        stack: d.shares.map((x) => [sp(x.kind)?.col || rgba(INK2, 0.9), x.share, x.kind]),
        table: d.shares.slice(0, 4).map((x) => ({ kind: x.kind, name: up(sp(x.kind)?.name), value: pct(x.share), share: x.share })),
        why: why.length ? why : [tr('notes.clump.why.crowded', 'CROWDED WHERE THE LIVING ARE THICKEST')] };
      P.keys.push({ glyph: 'ring', text: tr('notes.key.community', 'COMMUNITY: DENSER THAN AROUND IT'), tone: LINE });
    } else if (d.type === 'scavenging') {
      // scavengers eating the dead: the scavengers counted, where they ate marked
      const pts = group('c', M.rows(d.kind));
      const an = hang(0, pts, d.kind);
      if (!an) return null;
      P.draws.push((t) => census(pts, 'plus', INK, t, an, glyphOf(d.kind)));
      const meals = recent('scavenge', null, 10).filter((e) => e.akind === d.kind);
      pips(meals, INK2, 0.3);
      P.anchor = an;
      P.pts = pts;
      // i18n: Live annotations: scavengers eating the dead
      P.label = { tone: INK, eye: tr('notes.scavenging.eye', 'SCAVENGERS'), num: String(d.meals), main: nm(d.kind), data: [tr('notes.scavenging.data', 'HUSKS EATEN · LAST 30 S'), tr('notes.scavenging.why', 'THEY LIVE ON THE DEAD: NOTHING IS WASTED')] };
      P.keys.push({ glyph: 'plus', text: cellOf(nm(d.kind)), tone: INK });
      if (meals.length) P.keys.push({ glyph: 'cross', text: tr('notes.key.husk-eaten', 'A HUSK EATEN, LAST 10 S'), tone: INK2 });
    } else if (d.type === 'sprint') {
      // the fastest in view: its lock, its heading, where it has been
      const a = pos(d.actor);
      if (!a) return null;
      const r = F.radius(d.akind);
      P.tone = HOT;
      const tl = (S.trail ||= []), w = F.toWorld(a);
      if (!tl.length || F.now - tl.at > 0.15) { tl.push(w); tl.at = F.now; if (tl.length > 20) tl.shift(); }
      P.draws.push(() => trail(tl, HOT, F));
      P.draws.push((t) => lock(a[0], a[1], r, HOT, t));
      P.draws.push((t) => arrow(a[0], a[1], d.heading, clamp(r * 3, 30, 70), HOT, t - 0.3));
      lockBox(a, r);
      P.anchor = [a[0], a[1] - r];
      P.pts = [a];
      // i18n: Live annotations: the fastest cell in view: its speed's unit ({unit}, as µm) a second, its species ({name}); {n} times as fast as most; its heading (notes.compass)
      P.label = { tone: HOT, eye: tr('notes.sprint.eye', 'FASTEST IN VIEW'), num: fmtLen(d.speed).split(' ')[0], main: tr('notes.sprint.main', '{unit}/s · {name}', { unit: fmtLen(d.speed).split(' ')[1], name: nm(d.kind) }),
        data: [tr('notes.sprint.data', '{n}× AS FAST AS MOST HERE', { n: d.times.toFixed(0) }), tr('notes.heading', 'HEADING {heading}', { heading: compass(d.heading) })] };
    } else if (d.type === 'beat') {
      // a beating body: its cells, brackets, and its beat drawn as an oscillograph at its own rate
      const v = M.view, rows = [];
      for (const id of d.members) { const i = v.at.get(id); if (i !== undefined) rows.push(i); }
      const pts = group('b', rows), an = hang(0, pts, d.kind, d.anchor);
      if (!an) return null;
      P.draws.push((t) => census(pts, 'plus', HOT, t, an, clamp(F.radius(d.kind) * 0.18, 3, 6)));
      P.draws.push((t) => targetBox(pts, HOT, t, fmtLen(d.size)));
      const bx = boxOf(pts);
      if (bx) P.boxes.push({ l: bx.l, r: bx.r, t: bx.t - 24, b: bx.t, hard: true }, bx);
      P.anchor = an;
      P.pts = pts;
      const moving = d.lengths >= 0.2;
      // i18n: Live annotations: a beating body: its species ({name}), {n} cells, its form (notes.form); how it beats; how fast it swims ({n} body lengths a second)
      P.label = { tone: HOT, eye: tr('notes.beat.eye', 'BEATING'), num: d.hz.toFixed(1), main: tr('notes.beat.main', 'BEATS / S'), data: [tr('notes.body.cells', '{name} · {n}-CELL {form}', { name: nm(d.kind), n: d.cells, form: formUp(d.form) }),
        d.tail ? tr('notes.beat.tail', 'ITS TAIL BEATS: A WAVE RUNS DOWN IT') : tr('notes.beat.wave', 'ITS CELLS BEAT IN A WAVE ALONG IT'), moving ? tr('notes.beat.swims', 'IT SWIMS {n} BODY LENGTHS / S', { n: d.lengths.toFixed(1) }) : tr('notes.beat.held', 'BEATING, BUT HELD WHERE IT IS')],
        wave: { hz: d.hz, amp: d.beat } };
      P.keys.push({ glyph: 'plus', text: tr('notes.key.beating', '{name}: ONE BEATING BODY', { name: nm(d.kind) }), tone: HOT });
    } else if (d.type === 'light') {
      // the light: where it falls brightest in view (a shape where it crosses halfway from the view's mean to its
      // brightest), hatched in sunlight's color; the producers there
      S.ppu0 ||= F.ppu;
      if (S.lightOf !== d.light) { S.lightOf = d.light; S.loops = gridLoops(d.light, d.grid, d.level, M.view.sqOnce); }
      const loops = S.loops;
      P.tone = SUN;
      P.draws.push((t) => blob(loops, SUN, t, F, { hatch: true, ppu0: S.ppu0, hatchA: 0.5 }));
      // hung on the brightest square's middle (a place in the world)
      if (!S.at) { let k0 = 0; d.light.forEach((x, k) => { if (M.view.sqIn[k] && x > d.light[k0]) k0 = k; }); S.at = [d.grid[0] + ((k0 % NOTE_TG) + 0.5) * d.grid[2], d.grid[1] + (Math.floor(k0 / NOTE_TG) + 0.5) * d.grid[2]]; }
      P.anchor = F.toScreen(S.at);
      const pct = pctUp;
      // i18n: Live annotations: producers in the brightest water: {pct} of the producers there, in the brightest {pct} of the water, {n} times the view's light; {pct} of those in the dim swimming toward it
      P.label = { tone: SUN, tag: d.seeking >= 0.5 ? tr('notes.light.seeking', 'SEEKING THE LIGHT') : tr('notes.light.basking', 'BASKING'), num: pct(d.share), main: tr('notes.light.main', 'OF THE PRODUCERS'),
        data: [tr('notes.light.area', 'IN THE BRIGHTEST {pct} OF THE WATER', { pct: pct(d.areaShare) }), tr('notes.light.times', "{n}× THE VIEW'S LIGHT THERE", { n: (d.hi / Math.max(d.mean, 1e-3)).toFixed(1) }),
          ...(d.seeking >= 0.3 ? [tr('notes.light.swim', '{pct} OF THOSE IN THE DIM SWIM TOWARD IT', { pct: pct(d.seeking) })] : []), tr('notes.light.why', 'LIGHT IS WHAT PRODUCERS LIVE ON')] };
      P.keys.push({ glyph: 'square', text: tr('notes.key.brightest', 'THE BRIGHTEST WATER IN VIEW'), tone: SUN });
    } else if (d.type === 'shelter') {
      // shelter among stone: the stone's patches, the cells among them
      if (S.stoneOf !== d.stone) { S.stoneOf = d.stone; S.loops = gridLoops(d.stone, d.grid, 6, M.view.sqOnce); }
      const loops = S.loops, W2 = F.world;
      const rows = viewRows('s', d.stone, (v) => {
        const rows = [];
        for (let i = 0; i < v.n; i++) {
          if (!(v.kind[i] >= 5) || F.species(v.kind[i])?.guild === 'predator') continue;
          const k = squareOf(v, v.x[i], v.y[i], W2);
          if (k >= 0 && d.stone[k] >= 6) rows.push(i);
        }
        return rows;
      });
      const pts = group('s', rows), an = hang(0, pts, -2);
      if (!an) return null;
      P.draws.push((t) => blob(loops, INK2, t, F, { dash: [4, 3], width: 1.2 }));
      P.draws.push((t) => census(pts, 'ring', INK, t, an, 3.5));
      P.anchor = an;
      P.pts = pts;
      const pct = pctUp;
      // i18n: Live annotations: cells sheltering among stone: {n} times as crowded; {pct} of {kills} kills here in {area} of the water, or {n} hunters about
      P.label = { tone: INK, tag: tr('notes.shelter.tag', 'SHELTERING'), num: String(d.cells), main: tr('notes.shelter.main', 'CELLS AMONG THE STONE'),
        data: [tr('notes.shelter.dens', '{n}× AS CROWDED AS THE OPEN WATER', { n: d.dens.toFixed(1) }), tr('notes.shelter.why', 'A HUNTER STRIKING AMONG STONE OFTEN MISSES'),
          d.kills ? tr('notes.shelter.kills', '{pct} OF {kills} KILLS HERE IN {area} OF THE WATER', { pct: pct(d.killShare), kills: d.kills, area: pct(d.areaShare) }) : tr('notes.shelter.hunters', '{n} HUNTERS ABOUT', { n: d.hunters })] };
      P.keys.push({ glyph: 'ring', text: tr('notes.key.sheltering', 'SHELTERING AMONG STONE'), tone: INK });
    } else if (d.type === 'range' || d.type === 'front') {
      // who holds the view: a species' range (where it is thickest), in its own color; two, and where they meet
      const parts = d.type === 'range' ? [{ kind: d.kind, share: d.share, field: d.field }] : [d.a, d.b];
      if (S.rangeOf !== d.grid + parts.map((x) => x.kind).join()) {
        S.rangeOf = d.grid + parts.map((x) => x.kind).join();
        S.loops = parts.map((x) => { let peak = 0; for (const f of x.field) peak = Math.max(peak, f); return gridLoops(x.field, d.grid, Math.max(2, 0.3 * peak), M.view.sqIn); });
      }
      parts.forEach((x, i) => {
        const col = sp(x.kind)?.col || rgba(INK, 0.9), loops = S.loops[i];
        P.draws.push((t) => blob(loops, INK, t - i * 0.3, F, { col, width: 1.6, fill: [col, 0.07] }));
      });
      // hung on the range's top
      const top = S.loops[0][0];
      if (!top) return null;
      if (!S.at) S.at = top.reduce((b, p) => (p[1] < b[1] ? p : b), top[0]);
      P.anchor = F.toScreen(S.at);
      const pct = pctUp;
      // i18n: Live annotations: the two most numerous species where they meet, each name short ({a}, {b}: G. EPITHET)
      const meet = d.type === 'range' ? '' : tr('notes.front.main', '{a} · {b}', { a: short(sp(d.a.kind)?.name), b: short(sp(d.b.kind)?.name) });
      // i18n: Live annotations: the species that holds the view ({n} cells), or the two most numerous and where they meet
      P.label = d.type === 'range'
        ? { tone: INK, eye: tr('notes.range.eye', 'DOMINANT'), num: pct(d.share), main: nm(d.kind), kind: d.kind, data: [tr('notes.range.data', 'OF THE LIVING IN VIEW · {n} CELLS', { n: d.cells }), tr('notes.range.how', 'ITS RANGE OUTLINED WHERE IT IS THICKEST')] }
        : { tone: INK, eye: tr('notes.front.eye', 'WHERE TWO MEET'), main: meet,
          table: [d.a, d.b].map((x) => ({ kind: x.kind, name: up(sp(x.kind)?.name), value: pct(x.share), share: x.share })),
          data: [tr('notes.front.data', 'THE TWO MOST NUMEROUS HERE, EACH HOLDING ITS OWN GROUND')] };
      for (const x of parts) P.keys.push({ glyph: 'ring', text: tr('notes.key.range', 'RANGE OF {name}', { name: nm(x.kind) }), tone: INK });
    } else if (d.type === 'barren') {
      // barren water: where no cell lives in view, and what it lacks
      if (S.emptyOf !== d.field) { S.emptyOf = d.field; S.loops = gridLoops(d.field.map((x) => -x), d.grid, -d.level, M.view.sqIn); }
      const loops = S.loops;
      if (!loops.length) return null;
      P.draws.push((t) => blob(loops, INK3, t, F, { dash: [2, 4], width: 1.2 }));
      if (!S.at) { const L = loops.reduce((b, l) => (l.length > b.length ? l : b), loops[0]); S.at = [L.reduce((a, p) => a + p[0], 0) / L.length, L.reduce((a, p) => a + p[1], 0) / L.length]; }
      P.anchor = F.toScreen(S.at);
      // i18n: Live annotations: why water is barren: {pct} percent less light, {t} degrees against {tf} where life is
      const why = d.why === 'ice' ? tr('notes.barren.ice', 'ICE LOCKS IT') : d.why === 'stone' ? tr('notes.barren.stone', 'STONE FILLS IT')
        : d.why === 'dark' ? tr('notes.barren.dark', 'TOO DARK: {pct}% LESS LIGHT THAN WHERE LIFE IS', { pct: Math.round((1 - d.lightE / Math.max(d.lightF, 1e-3)) * 100) })
        : d.why === 'cold' ? tr('notes.barren.cold', 'COLDER: {t}° AGAINST {tf}° WHERE LIFE IS', { t: d.tE.toFixed(0), tf: d.tF.toFixed(0) })
        : d.why === 'warm' ? tr('notes.barren.warm', 'WARMER: {t}° AGAINST {tf}° WHERE LIFE IS', { t: d.tE.toFixed(0), tf: d.tF.toFixed(0) }) : tr('notes.barren.unsettled', 'NOTHING HAS SETTLED IT YET');
      P.label = { tone: INK2, eye: tr('notes.barren.eye', 'BARREN WATER'), num: pctUp(d.share), main: tr('notes.barren.main', 'OF THE VIEW NEARLY EMPTY OF LIFE'), data: [why] };
      P.keys.push({ glyph: 'ring', text: tr('notes.key.no-life', 'NO LIFE HERE'), tone: INK3 });
    } else if (d.type === 'deaths') {
      // a killing ground: where most died lately, and of what
      S.ppu0 ||= F.ppu;
      if (S.deadOf !== d.field) { S.deadOf = d.field; S.loops = gridLoops(d.field, d.grid, d.level, M.view.sqIn); }
      const loops = S.loops;
      if (!loops.length) return null;
      P.tone = HOT;
      P.draws.push((t) => blob(loops, HOT, t, F, { hatch: true, ppu0: S.ppu0, hatchA: 0.4, dash: [3, 3] }));
      if (!S.at) { const L = loops.reduce((b, l) => (l.length > b.length ? l : b), loops[0]); S.at = L.reduce((b, p) => (p[1] < b[1] ? p : b), L[0]); }
      P.anchor = F.toScreen(S.at);
      const top = causeList(Object.entries(d.causes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, k]) => tr('notes.cause-count', '{cause} {n}', { cause: causeUp(c), n: k })));
      // i18n: Live annotations: where most died lately, of what, and {pct} of all the deaths in view
      P.label = { tone: HOT, tag: tr('notes.deaths.tag', 'KILLING GROUND'), num: String(d.died), main: tr('notes.deaths.main', 'DIED HERE IN 30 S'), data: [top, tr('notes.deaths.share', '{pct} OF ALL THE DEATHS IN VIEW', { pct: pctUp(d.died / d.all) })] };
      P.keys.push({ glyph: 'square', text: tr('notes.key.most-died', 'WHERE MOST DIED'), tone: HOT });
    } else if (d.type === 'stranded') {
      // stranded on dry land: the cells there, a shape about them, the cause
      const rows = viewRows('d', null, (v) => { const rows = []; for (let i = 0; i < v.n; i++) if (v.dry[i] && v.kind[i] >= 5) rows.push(i); return rows; });
      const pts = group('d', rows), an = hang(0, pts, -2);
      if (!an) return null;
      const sh = ride((S.ride ||= {}), rows, -2, clamp(F.radius(d.kind) * 3, 18, 100) / F.ppu);
      S.ppu0 ||= F.ppu;
      P.tone = SAND;
      if (sh) P.draws.push((t) => blob(sh.loops, SAND, t, F, { hatch: true, ppu0: S.ppu0, hatchA: 0.45, dash: [4, 3], at: sh.at }));
      P.draws.push((t) => census(pts, 'ring', SAND, t, an, 3.5));
      pips(recent('dried', null, 10), HOT, 0.4);
      P.anchor = an;
      P.pts = pts;
      // i18n: Live annotations: cells stranded on dry land: {n} resting as cysts, {n} dried to death
      P.label = { tone: SAND, tag: tr('notes.stranded.tag', 'STRANDED'), num: String(d.cells), main: tr('notes.stranded.main', 'CELLS ON DRY LAND'),
        data: [tr('notes.stranded.why', 'THE WATER WITHDREW AND LEFT THEM: THEY CANNOT SWIM'), d.cysts ? tr('notes.stranded.cysts', '{n} RESTING AS CYSTS AND SPORES TO WAIT IT OUT', { n: d.cysts }) : tr('notes.stranded.film', 'THE DRYING FILM PULLS THEM BACK TOWARD THE WATER'),
          ...(d.dried ? [tr('notes.stranded.dried', '{n} DRIED TO DEATH IN 30 S', { n: d.dried })] : [])] };
      P.keys.push({ glyph: 'ring', text: tr('notes.key.dry-land', 'ON DRY LAND'), tone: SAND });
    } else if (d.type === 'frozen') {
      // locked in the ice: the ice where it lies, rings on the cells stilled in it
      const v = M.view, W2 = F.world;
      const rows = viewRows('i', null, (v) => {
        const rows = [];
        for (let i = 0; i < v.n; i++) {
          if (!(v.kind[i] >= 5) || !v.torpid[i]) continue;
          const k = squareOf(v, v.x[i], v.y[i], W2);
          if (k >= 0 && v.ice[k] > 0.5) rows.push(i);
        }
        return rows;
      });
      const pts = group('i', rows), an = hang(0, pts, -2);
      if (!an) return null;
      S.ppu0 ||= F.ppu;
      if (S.iceView !== v) { S.iceView = v; S.loops = gridLoops(v.ice, v.grid, 0.5, v.sqOnce); }
      const loops = S.loops;
      P.tone = CYAN;
      P.draws.push((t) => blob(loops, CYAN, t, F, { hatch: true, ppu0: S.ppu0 }));
      P.draws.push((t) => census(pts, 'ring', CYAN, t, an, 3.5));
      pips(recent('froze', null, 10), HOT, 0.4);
      P.anchor = an;
      P.pts = pts;
      // i18n: Live annotations: cells locked in ice: ice over {pct} of the water, {n} froze to death
      P.label = { tone: CYAN, tag: tr('notes.frozen.tag', 'LOCKED IN ICE'), num: String(d.cells), main: tr('notes.frozen.main', 'CELLS FROZEN STILL'),
        data: [tr('notes.frozen.ice', 'ICE OVER {pct} OF THE WATER IN VIEW', { pct: pctUp(d.share) }), tr('notes.frozen.why', 'TORPID: THEY WAIT FOR THE THAW'), ...(d.froze ? [tr('notes.frozen.froze', '{n} FROZE TO DEATH IN 30 S', { n: d.froze })] : [])] };
      P.keys.push({ glyph: 'ring', text: tr('notes.key.stilled-ice', 'STILLED IN THE ICE'), tone: CYAN });
    } else if (d.type === 'shade') {
      // under duckweed: its shade where it falls dark, the producers in it
      if (!F.shade) return null;
      // (the shade where the view's cells were at its look, as its shape below is drawn from it)
      const v = M.view, rows = viewRows('u', null, (v) => {
        const rows = [];
        for (let i = 0; i < v.n; i++) if (v.kind[i] >= 5 && F.species(v.kind[i])?.guild === 'producer' && F.shade(v.x[i], v.y[i]) > 0.4) rows.push(i);
        return rows;
      });
      const pts = group('u', rows), an = hang(0, pts, -2);
      if (!an) return null;
      if (S.shadeView !== v) {
        S.shadeView = v;
        const f = new Float32Array(NOTE_TG * NOTE_TG), [ox, oy, gs] = v.grid;
        for (let k = 0; k < f.length; k++) f[k] = F.shade(ox + ((k % NOTE_TG) + 0.5) * gs, oy + (Math.floor(k / NOTE_TG) + 0.5) * gs);
        S.loops = gridLoops(f, v.grid, 0.4, v.sqOnce);
      }
      const loops = S.loops;
      S.ppu0 ||= F.ppu;
      P.tone = MOSS;
      P.draws.push((t) => blob(loops, MOSS, t, F, { hatch: true, ppu0: S.ppu0, hatchA: 0.6, fill: ['rgba(2,4,3,1)', 0.25] }));
      P.draws.push((t) => census(pts, 'plus', MOSS, t, an, 3.5));
      P.anchor = an;
      P.pts = pts;
      const pct = pctUp;
      // i18n: Live annotations: producers under duckweed's shade: it takes up to {pct} of the light; they are {pct} less fed; {n} starved
      P.label = { tone: MOSS, tag: tr('notes.shade.tag', 'UNDER DUCKWEED'), num: String(d.cells), main: tr('notes.shade.main', 'PRODUCERS IN ITS SHADE'),
        data: [tr('notes.shade.deep', 'THE FRONDS TAKE UP TO {pct} OF THE LIGHT', { pct: pct(d.deep) }), d.fedO != null && d.fedO > 0 ? tr('notes.shade.fed', '{pct} LESS FED THAN THOSE IN THE LIGHT', { pct: pct(1 - d.fedU / d.fedO) }) : tr('notes.shade.no-food', 'NO LIGHT, NO FOOD FOR A PRODUCER'),
          ...(d.starved ? [tr('notes.shade.starved', '{n} STARVED IN VIEW IN 30 S', { n: d.starved })] : [])] };
      P.keys.push({ glyph: 'plus', text: tr('notes.key.shade', 'A PRODUCER IN THE SHADE'), tone: MOSS });
    } else if (d.type === 'rain') {
      // a raindrop: where it fell, its ring wave spreading out from there
      const c = F.project({ x: d.x, y: d.y, vx: 0, vy: 0, t: 0 }, -1), c0 = c;
      if (!c) return null;
      P.tone = CYAN;
      const R0 = d.size * F.ppu;
      P.draws.push((t) => {
        const a = g.globalAlpha, c = mp(c0), R = R0 * (LM ? LM.k : 1);
        for (let q = 0; q < 3; q++) {
          const u = ((t * 0.6 + q / 3) % 1);
          g.globalAlpha = a * (1 - u) * 0.9;
          stroke(() => { g.beginPath(); g.arc(c[0], c[1], 6 + u * R, 0, TAU); }, rgba(CYAN, 0.9), 1.2);
        }
        g.globalAlpha = a;
        stroke(() => { g.beginPath(); g.moveTo(c[0] - 7, c[1]); g.lineTo(c[0] + 7, c[1]); g.moveTo(c[0], c[1] - 7); g.lineTo(c[0], c[1] + 7); }, rgba(INK, 0.95), 1.2);
      });
      P.boxes.push({ l: c[0] - R0, t: c[1] - R0, r: c[0] + R0, b: c[1] + R0 });
      P.anchor = [c[0], c[1] - 8];
      // i18n: Live annotations: a raindrop: {size} across; {n} drops in 30 seconds
      P.label = { tone: CYAN, tag: tr('notes.rain.tag', 'RAINDROP'), main: tr('notes.rain.main', 'A RING WAVE SPREADS'), data: [tr('notes.rain.size', '{size} ACROSS · IT PUSHES THE CELLS OUTWARD', { size: fmtLen(d.size) }), tr('notes.rain.drops', '{n} DROPS IN VIEW AND ABOUT IN 30 S', { n: d.drops })] };
    } else if (d.type === 'old') {
      const evs = recent('old', d.kind, 20), pts = [];
      for (const e of evs.slice(0, 40)) {
        const p = F.project({ x: e.x, y: e.y, vx: 0, vy: 0, t: e.t }, -1);
        if (p && shows(p)) pts.push([p[0], p[1], e.id, 1, clamp((20 - (M.view.simTime - e.t)) / 2, 0, 1)]);
      }
      const an = hang(0, pts, -1);
      if (!an) return null;
      for (const p of pts) P.draws.push((t) => pip(p[0], p[1], INK, t, p[4]));
      P.anchor = an;
      P.pts = pts;
      // i18n: Live annotations: cells of a species dying of old age
      P.label = { tone: INK, eye: tr('notes.old.eye', 'OLD AGE'), num: String(d.count), main: nm(d.kind), data: [tr('notes.old.data', 'DIED OF AGE IN 20 S'), tr('notes.old.why', 'A COHORT REACHING ITS END')] };
      P.keys.push({ glyph: 'cross', text: tr('notes.key.died-of-age', 'DIED OF AGE'), tone: INK });
    } else if (d.type === 'rot') {
      const pts = group('r', M.stats.husks);
      const an = hang(0, pts, -1);
      if (!an) return null;
      P.draws.push((t) => census(pts, 'ring', INK2, t, an, 3));
      P.anchor = an;
      P.pts = pts;
      // i18n: Live annotations: husks rotting: {n} returned to silt, {n} new lives sparked from it
      P.label = { tone: INK, eye: tr('notes.rot.eye', 'DECAY'), num: String(d.husks), main: tr('notes.rot.main', 'HUSKS ROTTING TO SILT'),
        data: [tr('notes.rot.data', '{n} RETURNED TO SILT IN 30 S', { n: d.count }), d.sparks ? tr('notes.rot.sparks', '{n} NEW LIVES SPARKED FROM SILT', { n: d.sparks }) : tr('notes.rot.why', 'THE SILT FEEDS WHAT GROWS NEXT')] };
      P.keys.push({ glyph: 'ring', text: tr('notes.key.husk', 'HUSK: THE REMAINS OF A CELL'), tone: INK2 });
    } else if (d.type === 'current') {
      // the current: lines of flow through the view from seeds fixed in the world, chevrons running along them
      if (!F.flow) return null;
      const r = M.view.rect, step = 2 ** Math.round(Math.log2(Math.max(r[2], r[3]) / 6));
      const i0 = Math.floor(r[0] / step), j0 = Math.floor(r[1] / step), lines = [];
      for (let i = i0; i <= i0 + Math.ceil(r[2] / step); i++) for (let j = j0; j <= j0 + Math.ceil(r[3] / step); j++) {
        // (each seed offset within its square by its own hash, so they do not line up)
        const h = hashU(i * 7919 + j * 104729), x0 = (i + 0.2 + 0.6 * h) * step, y0 = (j + 0.2 + 0.6 * hashU(h * 1e9 + 17)) * step;
        const L2 = [[x0, y0]];
        let x = x0, y = y0;
        for (let k = 0; k < 10; k++) { const f = F.flow(x, y), m = Math.hypot(f[0], f[1]) || 1; x += (f[0] / m) * step * 0.06; y += (f[1] / m) * step * 0.06; L2.push([x, y]); }
        lines.push(L2);
      }
      P.draws.push((t) => {
        const a = g.globalAlpha, u = reduced ? 1 : clamp(t / 0.8, 0, 1);
        g.globalAlpha = a * u;
        g.lineWidth = 1; g.strokeStyle = rgba(LINE, 0.5);
        g.beginPath();
        for (const L2 of lines) { const p0 = F.toScreen(L2[0]); g.moveTo(...p0); for (const w of L2.slice(1)) g.lineTo(...F.toScreen(w)); }
        g.stroke();
        g.fillStyle = rgba(LINE, 0.9);
        for (const L2 of lines) {
          const s2 = (F.now * 0.35 + hashU(L2.length + L2[0][0] * 13)) % 1, k = Math.min(L2.length - 2, Math.floor(s2 * (L2.length - 1)));
          const p = F.toScreen(L2[k]), q = F.toScreen(L2[k + 1]), an2 = Math.atan2(q[1] - p[1], q[0] - p[0]);
          g.save(); g.translate(p[0], p[1]); g.rotate(an2);
          g.beginPath(); g.moveTo(3, 0); g.lineTo(-2.5, -3); g.lineTo(-1, 0); g.lineTo(-2.5, 3); g.closePath(); g.fill();
          g.restore();
        }
        g.globalAlpha = a;
      });
      // hung on the seed nearest the view's middle (a fixed place in the world)
      const c = [r[0] + r[2] / 2, r[1] + r[3] / 2];
      if (S.seed && !shows(F.toScreen(S.seed), 40)) S.seed = null;
      S.seed ||= lines.map((L2) => L2[0]).sort((p, q) => Math.hypot(p[0] - c[0], p[1] - c[1]) - Math.hypot(q[0] - c[0], q[1] - c[1]))[0];
      P.anchor = F.toScreen(S.seed);
      const um = d.speed * UM_PER_UNIT;
      // i18n: Live annotations: the current: its speed in µm a second, toward {heading} (notes.compass)
      P.label = { tone: INK, eye: tr('notes.current.eye', 'CURRENT'), num: um >= 10 ? String(Math.round(um)) : um.toFixed(1), main: tr('notes.current.main', 'µm/s TOWARD {heading}', { heading: compass(d.heading) }),
        data: [tr('notes.current.data', 'THE WATER CARRIES WHAT DOES NOT SWIM'), tr('notes.current.how', 'DRIFTERS RIDE IT · SWIMMERS CROSS IT')] };
    } else if (d.type === 'starving' || d.type === 'drying') {
      const evs = recent(d.type === 'starving' ? 'starved' : 'dried', d.type === 'starving' ? d.kind : null, 20);
      const pts = [];
      for (const e of evs.slice(0, 40)) {
        const p = F.project({ x: e.x, y: e.y, vx: 0, vy: 0, t: e.t }, -1);
        if (p && shows(p)) pts.push([p[0], p[1], e.id, 1, clamp((20 - (M.view.simTime - e.t)) / 2, 0, 1)]);
      }
      const an = hang(0, pts, -1);
      if (!an) return null;
      P.tone = HOT;
      for (const p of pts) P.draws.push((t) => pip(p[0], p[1], HOT, t, p[4]));
      P.anchor = an;
      P.pts = pts;
      P.label = d.type === 'starving'
        // i18n: Live annotations: cells starving, or drying on the mud (mostly of one species, {name})
        ? { tone: HOT, eye: tr('notes.starving.eye', 'STARVING'), num: String(d.count), main: nm(d.kind), data: [tr('notes.starving.data', 'STARVED IN 20 S'), tr('notes.starving.why', 'NOTHING TO EAT IN REACH')] }
        : { tone: HOT, tag: tr('notes.stranded.tag', 'STRANDED'), num: String(d.count), main: tr('notes.drying.main', 'DRYING ON THE MUD'), data: [tr('notes.drying.data', 'MOSTLY {name}', { name: nm(d.kind) }), tr('notes.drying.why', 'THE WATER WITHDREW FROM THEM')] };
      P.keys.push({ glyph: 'cross', text: d.type === 'starving' ? tr('notes.key.starved', 'STARVED, LAST 20 S') : tr('notes.key.dried', 'DRIED OUT, LAST 20 S'), tone: HOT });
    }
    n.pins = S.an.filter((a) => a.anchor != null && a.pin).map((a) => a.anchor);
    // the species' glyph by its name wherever a label tells one
    const kinds = [d.akind, d.kind, d.fine?.kind, d.warm].filter((k) => k != null && k >= 0);
    for (const L of [P.label, P.extra?.label]) {
      if (!L) continue;
      if (L.kind == null) for (const k of kinds) if (L.main === nm(k)) { L.kind = k; break; }
      if (L.data && !L.dataKinds) L.dataKinds = L.data.map((line) => { for (const k of kinds) if (line.includes(nm(k))) return k; return null; });
    }
    return P.anchor || P.panel ? P : null;
  }

  // The roster's rows, steadied: its numbers change every so often, its bars ease, and a species passes the one above
  // it only with 15% more (so two of about the same count do not trade places look after look).
  function steadyRoster(rows, now, dt) {
    const R = rosterSt, by = new Map(rows.map((r) => [r.kind, r]));
    if (now - R.at >= STEADY.roster || !R.rows.length) {
      R.at = now;
      const list = R.rows.filter((r) => by.has(r.kind)).map((r) => ({ ...by.get(r.kind), bar: r.bar }));
      for (const r of rows) if (!list.some((x) => x.kind === r.kind)) list.push({ ...r, bar: null });
      for (let pass = 0, moved = true; moved && pass < list.length; pass++) {
        moved = false;
        for (let i = 0; i + 1 < list.length; i++) if (list[i + 1].n > list[i].n * 1.15) { [list[i], list[i + 1]] = [list[i + 1], list[i]]; moved = true; }
      }
      R.rows = list;
    } else for (const r of R.rows) { const n = by.get(r.kind); if (n) { r.hot = n.hot; r.name = n.name; r.guild = n.guild; } }
    const top = R.rows.slice(0, 6), max = Math.max(1, ...top.map((r) => r.n)), f = 1 - Math.exp(-dt / 0.3);
    for (const r of top) r.bar = r.bar == null ? r.n / max : r.bar + (r.n / max - r.bar) * f;
    return top;
  }

  /**
   * Draws the notes and the devices around them. F: { now (s), dt (s), ppu (CSS px a world unit), world [W, H], notes,
   * model, species(slot), project(sample, kind) -> [sx, sy] | null, radius(kind) css px, open {l, t, r, b} (the world
   * clear of the panels), avoid [rects], mode (the frame's tag), pool (°C), phone, roster (bool), cap (census glyphs a
   * note) }. Returns the rects it took (for the page's own labels).
   */
  function draw(F) {
    cur = null;
    curF = F;
    const M = F.model, plans = [];
    if (!M.view) return [];
    // (what this frame drew, for notes.debug(): the most lattice cells and edge, the glyphs)
    stats = M.ms.drawn ||= {};
    stats.glyphs = 0;
    // the camera this frame: a world point held while it shows, where it shows, and the scale (so a screen place can be
    // taken into the world and back, as the view pans and zooms)
    const r = M.view.rect;
    let c = ref && F.project(ref.p, -1);
    if (!c || c[0] < F.open.l || c[0] > F.open.r || c[1] < F.open.t || c[1] > F.open.b) {
      ref = { p: { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, vx: 0, vy: 0, t: 0 }, n: (ref?.n || 0) + 1 };
      c = F.project(ref.p, -1);
      if (A) A.rebase();
      // (what the labels hang from is in the world as the old point told it: across the world's wrap, afresh)
      for (const st of lay.values()) if (st.w) st.w = null;
    }
    const cam = { o: c, R: [ref.p.x, ref.p.y], k: F.ppu };
    F.toWorld = (p) => [cam.R[0] + (p[0] - cam.o[0]) / cam.k, cam.R[1] + (p[1] - cam.o[1]) / cam.k];
    F.toScreen = (w) => [cam.o[0] + (w[0] - cam.R[0]) * cam.k, cam.o[1] + (w[1] - cam.R[1]) * cam.k];
    if (A) {
      A.begin();
      A.frame(c[0], c[1], ref.p.x, ref.p.y, F.ppu);
      A.point('cam', ref.n, c[0], c[1]);
      for (const b of F.avoid) A.box('page', 'page', b.l + 8, b.t + 8, b.r - 8, b.b - 8);
    }
    const taken = F.avoid.map((r) => ({ ...r, hard: true }));
    g.save();
    // the loupe (F.lens: its middle and radius on the screen, the main view's point under it, its magnification): the
    // marks under it are drawn magnified within it, as it shows what they mark; a new label is set clear of it if it
    // can be, and none is hidden by it
    if (F.lens) { const { x, y, r } = F.lens; taken.push({ l: x - r - 6, t: y - r - 6, r: x + r + 6, b: y + r + 6 }); }
    const active = new Set();
    for (const n of F.notes) for (const k of [n.data.kind, n.data.akind, n.data.census, n.data.fine?.kind]) if (k != null && k >= 0) active.add(k);
    isActive = (k) => active.has(k);
    // the panels of the frame first (where they go), so the marks keep out from under them
    const rosterRows = F.roster && !F.phone && M.stats
      ? steadyRoster(M.roster().map((r) => ({ ...r, name: F.species(r.kind)?.name || '', guild: F.species(r.kind)?.guild, hot: active.has(r.kind) })).filter((r) => r.name), F.now, F.dt) : [];
    let rosterBox = rosterRows.length ? { l: F.open.r - 12 - ROSTER_W, t: F.open.t + 26, r: F.open.r - 12, b: F.open.t + 34 + 28 + rosterRows.length * 19 } : null;
    // (it gives way to the page's own text, the auto camera's nameplate passing under it)
    const under = rosterBox && F.avoid.some((r) => area(rosterBox, r) > 0);
    rosterSt.vis = clamp((rosterSt.vis ?? 1) + ((under ? -1 : 1) * F.dt) / 0.2, 0, 1);
    if (rosterSt.vis <= 0) rosterBox = null;
    const modeAt = F.mode ? [(F.open.l + F.open.r) / 2, F.open.t + 14] : null;
    // (where the panels go, kept clear of the marks' anchors: the roster, the gauge and the key, whichever show)
    const gaugeArea = { l: F.open.r - 130, t: F.open.b - 154, r: F.open.r, b: F.open.b };
    // (a panel note, the food web, top left)
    const webNote = !F.phone && F.notes.find((n) => n.type === 'web');
    const panelArea = { l: F.open.l + 14, t: F.open.t + 34, r: F.open.l + 14 + WEB_W, b: F.open.t + 42 + (webNote ? webH(webNote.data, F) : 200) };
    const panelOn = !!webNote;
    F.block = [...(F.phone ? [] : [rosterBox, gaugeArea, { l: F.open.l, t: F.open.b - 120, r: F.open.l + KEY_W, b: F.open.b }, panelOn ? panelArea : null]),
      // (the mode's tag at the top: a link's verb keeps off it too)
      modeAt ? { l: modeAt[0] - width('head', F.mode) / 2 - 12, t: modeAt[1] - 13, r: modeAt[0] + width('head', F.mode) / 2 + 12, b: modeAt[1] + 7 } : null].filter(Boolean);
    F.verbs = [];
    const T0 = performance.now();
    for (const n of F.notes) {
      const P = plan(n, M, F), S = noteState(n.id);
      if (P) { S.lastP = P; S.lastAt = F.now; plans.push({ n, P, keep: 1 }); continue; }
      // one whose cells are lost from view this moment fades out where it was last seen rather than blinking away
      // (and, cannot be drawn for longer, is as one with no room: the notes end it)
      // (held at full strength while the note is young, so what was read stays its least; then fading)
      const from = Math.max(S.lastAt ?? 0, (n.readAt ?? n.born) + STEADY.minShow), u = S.lastP ? Math.max(0, F.now - from) / STEADY.frozen : 1;
      if (u < 1) plans.push({ n, P: S.lastP, keep: 1 - u, frozen: true });
      else n.hiddenAt ??= F.now;
    }
    const T1 = performance.now();
    const gaugeP = !F.phone && plans.find(({ P }) => P.gauge);
    const keys = [];
    for (const { P } of plans) for (const k of P.keys) if (!keys.some((x) => x.text === k.text)) keys.push(k);
    const keyBox = keys.length && !F.phone ? { l: F.open.l, t: F.open.b - 12 - 17 * Math.min(6, keys.length) - 6, r: F.open.l + KEY_W, b: F.open.b } : null;
    // (holes that overlap merged into one, as an even-odd clip would show their overlap again)
    const panelP = plans.find(({ P }) => P.panel);
    // (only what has a plate of its own: the roster, the food web's panel, the page's caption and nameplate; the gauge
    // and the key stand bare on the scene, the marks showing beneath them)
    const panels = [rosterBox, panelP ? panelArea : null, ...F.avoid].filter(Boolean);
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i], b = panels[j];
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) {
        panels[i] = { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) };
        panels.splice(j, 1); j = i;
      }
    }
    // marks, clipped to the open world less the panels (and the loupe, which shows them magnified); labels and their
    // leaders lie over them
    g.save();
    if (F.lens) { const { x, y, r } = F.lens; g.beginPath(); g.rect(-1e4, -1e4, 2e4, 2e4); g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); g.clip('evenodd'); }
    g.save();
    g.beginPath();
    g.rect(F.open.l, F.open.t, F.open.r - F.open.l, F.open.b - F.open.t);
    for (const b of panels) { g.moveTo(b.l, b.t); g.lineTo(b.l, b.b); g.lineTo(b.r, b.b); g.lineTo(b.r, b.t); g.closePath(); }
    g.clip('evenodd');
    const allPts = [];
    for (const { n, P, keep, frozen } of plans) {
      if (frozen) continue;
      const t = F.now - n.born, out = keep * (n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / (n.fade || 0.6), 0, 1) : 1);
      // (a note's marks show only as its label does: never a mark nothing explains)
      const shown = P.panel ? 1 : lay.get(n.id * 2)?.shown ?? 0;
      g.globalAlpha = out * shown;
      owner = `n${n.id}`;
      if (A && P.anchor) A.point('anchor', n.id, P.anchor[0], P.anchor[1]);
      if (shown > 0.01) for (const d of P.draws) d(t);
      g.globalAlpha = 1;
      for (const p of P.pts.slice(0, 120)) allPts.push(p);
      for (const b of P.boxes) taken.push(b);
    }
    g.restore();
    g.restore();
    // the same marks again within the loupe, magnified as it magnifies the world (the audit counts them once)
    if (F.lens && plans.length) {
      const { x, y, r } = F.lens, toScreen = F.toScreen, a0 = A;
      g.save();
      g.beginPath(); g.arc(x, y, r - 1, 0, TAU); g.clip();
      LM = F.lens; A = null;
      F.toScreen = (w) => mp(toScreen(w));
      try {
        for (const { n, P, frozen } of plans) {
          if (frozen) continue;
          const shown = P.panel ? 1 : lay.get(n.id * 2)?.shown ?? 0, out = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / (n.fade || 0.6), 0, 1) : 1;
          if (shown <= 0.01) continue;
          g.globalAlpha = out * shown;
          for (const d of P.draws) d(F.now - n.born);
        }
      } finally { LM = null; A = a0; F.toScreen = toScreen; g.globalAlpha = 1; g.restore(); }
    }
    const T2 = performance.now();
    // the frame's devices: its corners, its mode, the species in view, the water's gauge, the key
    owner = 'frame';
    corners(F.open);
    // (the mode gives way to the page's own text, as the roster does)
    if (modeAt) {
      const w = width('head', F.mode) + 14, mb = { l: modeAt[0] - w / 2, t: modeAt[1] - 11, r: modeAt[0] + w / 2, b: modeAt[1] + 5 };
      const under = F.avoid.some((r) => area(mb, r) > 0);
      modeSt.vis = clamp((modeSt.vis ?? 1) + ((under ? -1 : 1) * F.dt) / 0.2, 0, 1);
      if (modeSt.vis > 0) {
        const a0 = A;
        if (modeSt.vis < 0.5) A = null;
        g.globalAlpha = modeSt.vis;
        taken.push(modeTag(F.mode, ...modeAt));
        g.globalAlpha = 1;
        A = a0;
      }
    }
    if (rosterBox) {
      g.globalAlpha = rosterSt.vis;
      const a0 = A;
      if (rosterSt.vis < 0.5) A = null;
      const rb = roster(rosterRows, rosterBox.r, rosterBox.t + 8, F.now - (F.since || 0));
      // (as the roster's room for six)
      taken.push({ ...rb, b: Math.max(rb.b, F.open.t + 34 + 28 + 6 * 19) });
      A = a0;
      g.globalAlpha = 1;
    }
    if (gaugeP) {
      const n = gaugeP.n;
      g.globalAlpha = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / (n.fade || 0.6), 0, 1) : 1;
      owner = 'gauge';
      gauge(F.open.r - 64, F.open.b - 104, gaugeP.P.gauge, F.now - n.born);
      g.globalAlpha = 1;
      taken.push({ ...gaugeArea, hard: true });
    }
    owner = 'key';
    // (the labels keep out of all the room the key may grow into, not only what it holds now)
    if (keyBox) { key(keys.slice(0, 6), F.open.l + 14, F.open.b - 12); taken.push({ l: F.open.l, t: F.open.b - 120, r: F.open.l + KEY_W, b: F.open.b, hard: true }); }
    if (panelP) {
      const n = panelP.n;
      g.globalAlpha = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / (n.fade || 0.6), 0, 1) : 1;
      owner = 'panel';
      panelP.P.panel.draw(panelArea.l, panelArea.t + 8, F.now - n.born);
      g.globalAlpha = 1;
      taken.push({ ...panelArea, hard: true });
    }
    const T3 = performance.now();
    // labels, the oldest first (they keep their places)
    for (const { n, P, keep, frozen } of plans) {
      const t = F.now - n.born, out = keep * (n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / (n.fade || 0.6), 0, 1) : 1);
      for (const [k, part] of [[0, P], [1, P.extra]]) {
        if (!part || !part.label) continue;
        const L = part.label, size = labelSize(L), id = n.id * 2 + k;
        let an = part.anchor;
        let st = lay.get(id);
        if (!st) lay.set(id, (st = { pick: null, lookAt: -1e9 }));
        // what the label hangs from: its anchor's place in the world, the anchor's own small motions (a swimmer's
        // beat) smoothed away, then shown where the camera shows it now, so the label rides the view's pans and zooms
        // exactly; a jump (another cell) crossfades
        // (frozen, its cell lost from view: it holds where it was in the world)
        const wa = frozen && st.w ? st.w : F.toWorld(an);
        if (!st.w) st.w = wa;
        else { const f = 1 - Math.exp(-F.dt / STEADY.follow); st.w = [st.w[0] + (wa[0] - st.w[0]) * f, st.w[1] + (wa[1] - st.w[1]) * f]; }
        const base = F.toScreen(st.w);
        const at = place(id, base, size, taken, F.open, allPts);
        // where it stands: put once, where its place about its anchor was when it first showed, and held still on the
        // screen there (as a HUD's callout: its leader reaches to the cell as it moves, so it can be read). Only when the
        // cell has gone far from it (its leader past a third of the view) does it glide after, slowly, to keep in reach;
        // and it always keeps inside the view.
        st.dir = at.dir;
        st.a = 1;
        if (!st.fix) st.fix = [at.x, at.y];
        else {
          const reach = Math.min(F.open.r - F.open.l, F.open.b - F.open.t) / 3, far = Math.hypot(at.x - st.fix[0], at.y - st.fix[1]);
          if (far > reach) { const f = (1 - Math.exp(-F.dt / STEADY.glide)) * (1 - reach / far); st.fix = [st.fix[0] + (at.x - st.fix[0]) * f, st.fix[1] + (at.y - st.fix[1]) * f]; }
          st.fix = [st.dir > 0 ? clamp(st.fix[0], F.open.l + 6, F.open.r - size.w - 6) : clamp(st.fix[0], F.open.l + size.w + 6, F.open.r - 6), clamp(st.fix[1], F.open.t + 14, F.open.b - size.h)];
        }
        const lx = st.fix[0], ly = st.fix[1], box = boxAt(lx, ly, st.dir, size);
        // its leader meets it at whichever end faces its cell (the cell may have gone round to its far side)
        // (a cell under the loupe is reached where the loupe shows it)
        let intoLens = false;
        if (F.lens && Math.hypot(an[0] - F.lens.x, an[1] - F.lens.y) < F.lens.r) {
          LM = F.lens; const m = mp(an); LM = null;
          if (Math.hypot(m[0] - F.lens.x, m[1] - F.lens.y) < F.lens.r - 4) { an = m; intoLens = true; }
        }
        const near = st.dir > 0 ? an[0] <= lx + size.w / 2 : an[0] >= lx - size.w / 2;
        const ex = near ? lx - st.dir * 4 : lx + st.dir * (size.w + 4);
        // never over other text: one with no room from the first waits hidden (its marks with it), so it never shows
        // only to vanish; once shown, it stays at least STEADY.minShow whatever comes near; after that, covered, it
        // hides, and shows again only once clear for a moment
        // (against another label, the newer gives way once it has been read a moment and a half, past a blink)
        const over = taken.filter((r) => r.hard && area(box, r) > 4), blocked = over.length > 0;
        // (covered, it stays a moment and a half once read, past a blink, then gives way)
        const staying = st.seenAt != null && F.now - st.seenAt < 1.6;
        if (st.vis == null) { st.vis = blocked ? 0 : 1; st.hide = blocked; }
        // (a note already ending that was never read is never begun: it would only show to go)
        if (n.exitAt != null && st.seenAt == null) { st.hide = true; st.gone = true; }
        // (and once read and then hidden, it stays hidden: its note ends, rather than blinking back and forth)
        if (blocked && !staying) { st.hide = true; st.clearAt = null; if (st.seenAt != null) st.gone = true; }
        else if (!blocked && !st.gone) { st.clearAt ??= F.now; if (F.now - st.clearAt > 0.3) st.hide = false; }
        st.vis = clamp(st.vis + ((st.hide ? -1 : 1) * F.dt) / 0.15, 0, 1);
        if (blocked && A) A.count('hidden');
        if (k === 0) {
          st.shown = st.a * st.vis;
          // (the notes end one whose label finds no room for a while: n.hiddenAt)
          if (st.vis < 0.05) n.hiddenAt ??= F.now; else n.hiddenAt = null;
        }
        // (once readable, readable a moment and a half at least, whatever has become of its note: never a blink)
        const held = st.readFrom != null && F.now - st.readFrom < 1.6;
        const alpha = held ? Math.max(out * st.a * st.vis, 0.6) : out * st.a * st.vis;
        // (when it first could be read, and for the audit any shown for less than a moment and a half)
        if (alpha >= 0.5) { if (st.seenAt == null) st.seenAt = F.now; st.readFrom ??= F.now; if (k === 0) n.readAt ??= F.now; }
        else if (st.readFrom != null) { if (A && F.now - st.readFrom < 1.5) A.blink(`${n.type}: ${L.main || L.eye || L.tag}`, F.now - st.readFrom); st.readFrom = null; }
        if (alpha > 0.01) {
          // (the audit reads what can be read: a label faded past half is not)
          const a0 = A;
          if (alpha < 0.5) A = null;
          g.globalAlpha = alpha;
          owner = `L${id}`;
          // (a label held on the screen: its steadiness there, not in the world)
          if (A) A.screen('label', id, lx, ly);
          // (a leader to a cell the loupe does not show passes under it: it would point at nothing there)
          if (!frozen) {
            const under = F.lens && !intoLens;
            if (under) { g.save(); g.beginPath(); g.rect(-1e4, -1e4, 2e4, 2e4); g.moveTo(F.lens.x + F.lens.r, F.lens.y); g.arc(F.lens.x, F.lens.y, F.lens.r, 0, TAU); g.clip('evenodd'); }
            leader(an[0], an[1], ex, ly + 7, L.tone || INK, t - 0.15 - k * 0.5);
            if (under) g.restore();
          }
          label(L, lx, ly, st.dir, t - 0.25 - k * 0.5);
          A = a0;
        }
        g.globalAlpha = 1;
        if (blocked && !(staying && alpha > 0.5)) continue;
        taken.push({ ...box, hard: true, label: true });
        nextLabels.push(box);
        // its leader, as segments the next labels keep off
        const ey = ly + 7, { mx } = leaderPath(an[0], an[1], ex, ey);
        taken.push({ seg: [an[0], an[1], mx, ey] }, { seg: [mx, ey, lx, ey] });
      }
    }
    g.restore();
    lastLabels = nextLabels;
    nextLabels = [];
    // (the food web's panel comes only to a corner no label holds: notes.js waits on this)
    const corner = { l: F.open.l + 14, t: F.open.t + 34, r: F.open.l + 14 + WEB_W, b: F.open.t + 42 + 44 + 3 * WEB_TIER + 22 };
    M.panelFree = !lastLabels.some((b) => area(b, corner) > 0);
    g.letterSpacing = '0px'; g.fontStretch = 'normal'; g.textAlign = 'left';
    cur = null;
    const T4 = performance.now(), ms = (M.ms.parts ||= { plan: 0, marks: 0, frame: 0, labels: 0 });
    ms.plan += T1 - T0; ms.marks += T2 - T1; ms.frame += T3 - T2; ms.labels += T4 - T3;
    M.ms.lastParts = { plan: +(T1 - T0).toFixed(1), marks: +(T2 - T1).toFixed(1), frame: +(T3 - T2).toFixed(1), labels: +(T4 - T3).toFixed(1), notes: F.notes.map((n) => n.type).join() };
    if (A) A.end();
    // forget what is no longer drawn
    for (const [id, m] of marks) if (++m.used > 120) marks.delete(id);
    const live = new Set(F.notes.map((n) => n.id));
    for (const id of lay.keys()) if (!live.has(id >> 1)) lay.delete(id);
    for (const id of notesAt.keys()) if (!live.has(id)) notesAt.delete(id);
    return taken;
  }

  // (for the page's own marks, drawn between frames of this: its font is not this one's)
  const textOut = (...a) => { cur = null; owner = 'plate'; text(...a); cur = null; };
  // the audit (src/noteaudit.js): on, off ('reset' afresh), or with no argument its summary
  const audit = (on) => { if (on === undefined) return A ? A.summary() : null; A = on ? A || createAudit() : null; if (A && on === 'reset') A.reset(); return !!A; };
  return { draw, audit, text: textOut, width: (k, s) => { const w = width(k, s); cur = null; return w; } };
}
