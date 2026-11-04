// The live annotations drawn (docs/annotations.md): src/notes.js says what to mark, this draws it on the page's
// overlay canvas, over the world, in the manner of a drone's HUD: two hues (a pale cyan-white for structure and the
// second party, a red-orange for the subject, danger and a kill), hairline rules with end ticks, thin hero numerals,
// tracked micro-labels, 45° leaders onto level shelves, stepped hatched zones, reticles, and text that types itself
// on. State is told by form: a filled tag, hatching, a hollow or dashed mark. Every mark rides on a cell the GPU
// found (by id, carried on to the moment shown), so it sits where its cell shows.
//
// Steadiness: the marks ride the scene as what they mark does. A cell's mark follows it by id, a new sample's
// correction eased out, and fades in and out rather than popping. A group's ground and the water's squares are cells
// of a lattice fixed in the world, their hatching fixed to it too; each is held a moment after it empties, so an edge
// does not flicker, and the lattice is drawn afresh (crossfaded) only when a zoom has made it much coarser or finer.
// A label hangs on one cell, kept while it shows, by an offset weighed again only now and then and changed only for a
// clearly better place (by a crossfade, never a slide across the view). No two pieces of text overlap: a label with no
// free place waits, hidden, until one frees.
import { NOTE_TG } from './shaders.js';
import { createAudit } from './noteaudit.js';
import { fmtLen, UM_PER_UNIT } from './fmt.js';

const FONT = 'Saira, Bahnschrift, "DIN Alternate", "Segoe UI", system-ui, sans-serif';
const INK = '226,241,240', INK2 = '163,189,190', INK3 = '111,138,140', LINE = '150,222,230', HOT = '255,95,58', CYAN = '127,214,223';
const SHADE = 'rgba(4,7,8,0.85)', HALO = 'rgba(0,0,0,0.55)', PLATE = 'rgba(4,7,8,0.8)';
const rgba = (c, a) => `rgba(${c},${a})`;
const SCRAMBLE = '0123456789ABCDEFHKLMNPRSTVXZ/·-';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const NONE = 0xffffffff;
const hashU = (id) => (Math.imul(id, 2654435761) >>> 0) / 4294967296;
// a lattice cell's key from its indices (world position over its side), and back
// (±2^20 each way: a 4M world's width over the finest side at full zoom fits many times over)
const cellKey = (i, j) => (i + 1048576) * 2097152 + (j + 1048576);
const cellIJ = (key) => [Math.floor(key / 2097152) - 1048576, (key % 2097152) - 1048576];

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
  hold: 1.2,       // a lattice cell stays a moment after its last member leaves (the water's squares: holdSq)
  holdSq: 1.6,
  join: 0.5,       // and joins the outlined ground only once it has held members this long (its hatching fading in)
  part: 0.4,       // a leaving cell's hatching fades out over the last of its hold, its edge gone first
  relook: 0.7,     // a label's place is weighed again this often (at once when it covers text)
  better: 120,     // and changes only for one this much better (in the placement's score)
  follow: 0.3,     // a label follows its cell's own motion (a swimmer's beat) this smoothly, the camera's exactly
  slide: 0.22,     // a label's offset eases this fast; a jump past `far` px crossfades instead
  far: 90,
  swap: 0.25,
  roster: 0.6,     // the roster's numbers change this often; a species passes another only with 15% more
};

export function createNoteView(g) {
  const widths = new Map();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hatch = {};
  // per note (by id): its marks' state (cells by id, its lattice, its anchors); per label: its place; per cell id: its mark
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

  // ------------------------------------------------------------------ primitives (screen px, t: seconds since start)
  // corner brackets closing in on a box
  function brackets(l, t0, r, b, col, t) {
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
  // LATTICE: a stretch of the world as cells of a lattice fixed in it (a group's ground, the water's squares), stepped
  // and square-cornered as a HUD's hazard map draws them: a dotted edge, hatched when it is a danger. keys: the cells
  // (cellKey) outlined; soft: cells joining or leaving it, hatched only, each at its alpha; V(i, j): a vertex on
  // screen; H: the hatching's phase, spacing and strength. Returns its top corner.
  function lattice(keys, soft, V, tone, alpha, hatched, H) {
    // (in four bands of alpha, so a few fills draw them all: each fill of a pattern is work for the GPU's rasterizer,
    // which the world's own frames wait on)
    if (hatched && H.a > 0 && soft.size) {
      const bands = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], a = g.globalAlpha;
      for (const [key, f] of soft) {
        const [i, j] = cellIJ(key), q = [V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)], P = bands[Math.min(3, Math.floor(f * 4))];
        P.moveTo(q[0][0], q[0][1]); for (let e = 1; e < 4; e++) P.lineTo(q[e][0], q[e][1]); P.closePath();
      }
      g.fillStyle = hatchAt(tone, H.x, H.y, H.px);
      bands.forEach((P, b) => { g.globalAlpha = a * alpha * H.a * (b + 0.5) / 4; g.fill(P); });
      g.globalAlpha = a;
    }
    if (!keys.size) return null;
    const a = g.globalAlpha, fill = new Path2D(), edges = new Path2D();
    let top = null, len = 0;
    // (filled by runs along each row: a few rects rather than a cell each)
    const rows = new Map();
    for (const key of keys) {
      const [i, j] = cellIJ(key);
      const q = [V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)];
      if (hatched) { let r = rows.get(j); if (!r) rows.set(j, (r = [])); r.push(i); }
      // its edges that face a cell not in the set (top, right, bottom, left)
      const out = [!keys.has(cellKey(i, j - 1)), !keys.has(cellKey(i + 1, j)), !keys.has(cellKey(i, j + 1)), !keys.has(cellKey(i - 1, j))];
      for (let e = 0; e < 4; e++) if (out[e]) { edges.moveTo(q[e][0], q[e][1]); edges.lineTo(q[(e + 1) % 4][0], q[(e + 1) % 4][1]); len += Math.abs(q[1][0] - q[0][0]); }
      if (!top || q[1][1] < top[1] || (q[1][1] === top[1] && q[1][0] > top[0])) top = q[1];
    }
    if (hatched && H.a > 0) {
      for (const [j, r] of rows) {
        r.sort((x, y) => x - y);
        for (let s0 = 0; s0 < r.length;) {
          let e = s0;
          while (e + 1 < r.length && r[e + 1] === r[e] + 1) e++;
          const p0 = V(r[s0], j), p1 = V(r[e] + 1, j + 1);
          fill.rect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
          s0 = e + 1;
        }
      }
      g.globalAlpha = a * alpha * H.a; g.fillStyle = hatchAt(tone, H.x, H.y, H.px); g.fill(fill);
    }
    g.globalAlpha = a * alpha;
    g.lineWidth = 3; g.strokeStyle = HALO; g.stroke(edges);
    // dotted, as a hazard map's edge; a long edge (a ground in many pieces) as a faint solid line, its dots too much
    // work for the rasterizer
    if (len < 6000) { g.lineWidth = 1; g.strokeStyle = rgba(tone, 0.88); g.setLineDash([1, 3]); g.lineCap = 'round'; g.stroke(edges); g.setLineDash([]); g.lineCap = 'butt'; }
    else { g.lineWidth = 1; g.strokeStyle = rgba(tone, 0.5); g.stroke(edges); }
    g.globalAlpha = a;
    if (stats) { stats.cells = Math.max(stats.cells || 0, keys.size + soft.size); stats.edge = Math.max(stats.edge || 0, len); }
    return top;
  }
  // PIP: a moment at a point: a cross that blinks, then rests half-lit, fading as it grows old (fade 1..0)
  function pip(x, y, tone, t, fade = 1) {
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
  const norm = (L) => (L.normed ? L : { ...L, eye: L.eye && L.eye.toUpperCase(), tag: L.tag && L.tag.toUpperCase(), normed: true });
  //   [TAG] EYEBROW            a filled status tag and/or a micro-label
  //   ───────────────┤         a hairline rule with an end tick
  //   172  NAME                a thin hero numeral and the name it counts
  //   DATA · TOKENS            label:value tokens, a line or two
  //          23.4°             the reading
  //   ├──[█████]──┤            a range bar: a band of comfort on a scale, the reading as a tick
  //      14    28              the band's ends
  // Each row has its own band of height, so nothing in one reaches into another; the block sits on a faint plate.
  const RANGE_W = 120, SPLIT_W = 170;
  function labelSize(L) {
    L = norm(L);
    const head = (L.eye ? width('eye', L.eye) : 0) + (L.tag ? width('tag', L.tag) + 10 + (L.eye ? 8 : 0) : 0);
    const row = (L.num ? width('num', L.num) + 8 : 0) + (L.main ? width('main', L.main) : 0);
    const data = Math.max(0, ...(L.data || []).map((d) => width('data', d)));
    const w = Math.max(head, row, data, L.range ? RANGE_W + 8 : 0, L.split ? SPLIT_W : 0);
    let h = 0;
    if (L.eye || L.tag) h += 13;
    if (L.num || L.main) h += (L.num ? 24 : 15) + 4;
    h += (L.data || []).length * 14;
    if (L.range) h += 42;
    if (L.split) h += 24;
    return { w, h: h + 4 };
  }
  function label(L, x, y, dir, t) {
    L = norm(L);
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
      // the numeral reads first: at the left edge when the label grows right, left of the name when it grows left
      const nw = L.num ? width('num', L.num) + 8 : 0, mw = L.main ? width('main', L.main) : 0;
      if (L.num) text('num', decoded(L.num, t - 0.1), dir > 0 ? x : x - mw - 8, yy, rgba(L.numTone || tone, 0.98), al, L.num);
      if (L.main) text('main', decoded(L.main, t - 0.15), dir > 0 ? x + nw : x, yy, rgba(INK, 0.97), al, L.main);
      yy += 4;
    }
    for (const d of L.data || []) { yy += 14; text('data', decoded(d, t - 0.2), X(0), yy, rgba(INK2, 0.95), al, d); }
    if (L.range) { yy += 22; range(L.range, dir > 0 ? x : x - RANGE_W, yy, t - 0.25); yy += 20; }
    if (L.split) { yy += 12; split(L.split, dir > 0 ? x : x - SPLIT_W, yy, t - 0.25); yy += 12; }
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
    text('eye', 'WATER', x, y + R + 20, rgba(INK2, 1), 'center');
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
    const head = 'CELLS IN VIEW', hw = width('head', head) + 14;
    g.fillStyle = 'rgba(6,9,10,0.9)'; g.fillRect(x - W + 8, y - 7, hw, 15);
    g.strokeStyle = rgba(LINE, 0.55); g.strokeRect(x - W + 8.5, y - 6.5, hw - 1, 14);
    setType('head'); g.textAlign = 'left'; g.fillStyle = rgba(INK, 0.95); g.fillText(head, x - W + 15, y + 4);
    if (A) A.box(owner, head, x - W + 8, y - 7, x - W + 8 + hw, y + 8);
    rows.forEach((r, i) => {
      const yy = y + 26 + i * 19, col = r.hot ? HOT : INK, num = String(r.n);
      text('micro', String(i + 1).padStart(2, '0'), x - W + 10, yy, rgba(INK3, 1));
      glyph(r.guild, x - W + 36, yy - 4, col);
      // the name has the row less its number
      const nm = fit('micro', r.name.toUpperCase(), W - 66 - width('micro', num));
      text('micro', nm, x - W + 46, yy, rgba(col, r.hot ? 1 : 0.92));
      text('micro', num, x - 10, yy, rgba(col, 0.95), 'right');
      g.fillStyle = rgba(col, r.hot ? 0.9 : 0.4); g.fillRect(x - W + 46, yy + 4, Math.max(1, (W - 56) * r.bar), 1);
    });
    g.globalAlpha = a;
    return { l: x - W, t: y - 8, r: x, b: y + H, hard: true };
  }
  // a guild's glyph: producer a diamond, grazer a dot, hunter a triangle, scavenger a square
  function glyph(guild, x, y, col) {
    g.fillStyle = rgba(col, 0.95);
    g.beginPath();
    if (guild === 'producer') { g.moveTo(x, y - 3.5); g.lineTo(x + 3.5, y); g.lineTo(x, y + 3.5); g.lineTo(x - 3.5, y); }
    else if (guild === 'predator') { g.moveTo(x, y - 3.5); g.lineTo(x + 3.5, y + 3); g.lineTo(x - 3.5, y + 3); }
    else if (guild === 'scavenger') g.rect(x - 3, y - 3, 6, 6);
    else g.arc(x, y, 2.6, 0, TAU);
    g.fill();
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
  // Where a label goes: where it was while that holds (weighed again every so often, at once when it has come to cover
  // text), elsewhere only for a clearly better place.
  function place(id, anchor, size, taken, open, marksAt, now) {
    const st = lay.get(id);
    let cur = st.pick ? score(anchor, st.pick.dir, st.pick.dx0, st.pick.dy, size, taken, open, marksAt) : null;
    if (cur && !cur.hard && now < st.lookAt) return cur;
    st.lookAt = now + STEADY.relook;
    let best = cur;
    for (const dir of [1, -1]) for (const [dx0, dy] of OFFS) {
      const c = score(anchor, dir, dx0, dy, size, taken, open, marksAt);
      if (!best || c.s < best.s) best = c;
    }
    if (!cur || (cur.hard && !best.hard) || best.s < cur.s - STEADY.better) { if (cur && A) A.count('moves'); cur = best; }
    st.pick = { dir: cur.dir, dx0: cur.dx0, dy: cur.dy };
    return cur;
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
  // A stretch of world as lattice cells, steadied: on a fresh read, the cells `base` (cellKey at side s) and, `grow`,
  // their neighbours (gaps of one bridged) are marked seen. A cell seen look after look for `join` seconds is
  // outlined (until then hatched, fading in: a cell that holds members only a moment never moves the edge), and stays
  // so until `hold` seconds after it was last seen (its edge going first, its hatching fading). A new side (a zoom
  // past a step) starts afresh, the old one crossfading out; what the first look finds is outlined at once.
  function steadyLattice(st, s, base, now, grow, hold) {
    if (st.s !== s) {
      if (st.s != null && st.cells.size) st.prev = { s: st.s, ...drawn(st, now, hold), at: now, m: st.m };
      st.first = st.s == null || !st.cells.size;
      st.s = s; st.cells = new Map(); st.m = null;
    }
    if (base) {
      let on = base;
      if (grow) {
        on = new Set();
        for (const key of base) { const [i, j] = cellIJ(key); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) on.add(cellKey(i + a, j + b)); }
        for (const key of [...on]) {
          const [i, j] = cellIJ(key);
          if (on.has(cellKey(i + 2, j))) on.add(cellKey(i + 1, j));
          if (on.has(cellKey(i, j + 2))) on.add(cellKey(i, j + 1));
        }
      }
      // (seen afresh unless it was seen in the last few looks)
      for (const key of on) {
        const c = st.cells.get(key);
        if (!c || now - c.last > 0.3) st.cells.set(key, { since: st.first ? -1e9 : now, last: now });
        else c.last = now;
      }
      st.first = false;
    }
    return drawn(st, now, hold);
  }
  function drawn(st, now, hold) {
    const core = new Set(), soft = new Map(), T = STEADY;
    for (const [key, c] of st.cells) {
      const idle = now - c.last, age = now - c.since;
      if (idle > hold + 5) { st.cells.delete(key); continue; }
      if (idle >= hold) continue;
      if (age >= T.join && idle < hold - T.part) core.add(key);
      else soft.set(key, age < T.join ? clamp(age / T.join, 0, 1) : clamp((hold - idle) / T.part, 0, 1));
    }
    return { core, soft };
  }
  // a lattice's vertices on screen: from where one vertex near the view's middle shows, by the view's scale (fixed to
  // the world, and bent with it there as the water bends the view)
  function vertices(s, F) {
    const r = F.model.view.rect, ix = Math.round((r[0] + r[2] / 2) / s), jy = Math.round((r[1] + r[3] / 2) / s);
    const o = F.project({ x: ix * s, y: jy * s, vx: 0, vy: 0, t: 0 }, -1);
    if (!o) return null;
    const k = s * F.ppu;
    return { V: (i, j) => [o[0] + (i - ix) * k, o[1] + (j - jy) * k], o, k };
  }
  // a steadied lattice drawn (and the one it replaced, fading out), its hatching fixed to the world, m lines a side
  function drawLattice(st, keys, tone, t, hatched, F) {
    const fIn = reduced ? 1 : clamp(t / 0.4, 0, 1), hA = (reduced ? 1 : clamp((t - 0.3) / 0.4, 0, 1)) * 0.75;
    st.m ||= Math.max(1, Math.round((st.s * F.ppu) / 6));
    // a ground over most of the view tells nothing the label and the gauge do not (as the water's squares too warm
    // nearly everywhere), and is much work for the rasterizer: it fades out while it is that big (past 1500 cells, at once)
    const n = keys.core.size + keys.soft.size, k = st.s * F.ppu, open = (F.open.r - F.open.l) * (F.open.b - F.open.t);
    const big = n * k * k > 0.45 * open;
    st.big = n > 1500 ? 1 : clamp((st.big ?? (big ? 1 : 0)) + ((big ? 1 : -1) * F.dt) / 0.4, 0, 1);
    if (st.big >= 1) { st.prev = null; return; }
    const vis = 1 - st.big;
    let top = null;
    const one = (s, ks, alpha, m) => {
      const P = vertices(s, F);
      return P ? lattice(ks.core, ks.soft, P.V, tone, alpha, hatched, { x: P.o[0], y: P.o[1], px: P.k / m, a: hA }) : null;
    };
    let u = 1;
    if (st.prev) {
      u = (F.now - st.prev.at) / 0.4;
      if (u >= 1) { st.prev = null; u = 1; } else one(st.prev.s, st.prev, vis * fIn * (1 - u), st.prev.m || st.m);
    }
    top = one(st.s, keys, vis * fIn * u, st.m);
    if (A && top) A.point('zone', owner, top[0], top[1]);
  }

  // ------------------------------------------------------------------ one note, planned
  const up = (s) => (s || '').toUpperCase();
  // a heading as the compass has it (the view's up is north)
  const compass = (an) => ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][((Math.round(an / (Math.PI / 4)) % 8) + 8) % 8];
  // a species' short name: its genus's initial and its own epithet
  const short = (name) => { const w = up(name).split(' '); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : w[0]; };
  // TARGET BOX: brackets around a group on screen, its size across measured above it on a ruled dimension line
  function targetBox(pts, tone, t, measure) {
    let l = Infinity, tp = Infinity, r = -Infinity, b = -Infinity;
    for (const p of pts) if (p[3] > 0.5) { l = Math.min(l, p[0]); r = Math.max(r, p[0]); tp = Math.min(tp, p[1]); b = Math.max(b, p[1]); }
    if (!(r > l)) return null;
    const pad = 12;
    l -= pad; r += pad; tp -= pad; b += pad;
    brackets(l, tp, r, b, rgba(tone, 0.9), t);
    if (measure && t > 0.35) {
      const y = tp - 8, u = reduced ? 1 : ease((t - 0.35) / 0.4), m = (l + r) / 2, hw = ((r - l) / 2) * u;
      stroke(() => { g.beginPath(); g.moveTo(m - hw, y); g.lineTo(m + hw, y); g.moveTo(m - hw, y - 3); g.lineTo(m - hw, y + 3); g.moveTo(m + hw, y - 3); g.lineTo(m + hw, y + 3); }, rgba(LINE, 0.7), 1);
      if (u >= 1) text('micro', measure, m, y - 5, rgba(INK, 0.95), 'center');
    }
    return { l, t: tp - (measure ? 22 : 0), r, b };
  }
  // ARROW: a heading, from a point, with a chevron head
  function arrow(x, y, an, len, tone, t) {
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
  // FOOD WEB: the species in view that ate or were eaten here lately, by trophic level (hunters above, grazers and
  // scavengers between, producers below), each a tag; each eaten–eater pair an arrow up from the eaten's tag to the
  // eater's (its weight by how much, kills in hot), the totals in its head
  const WEB_W = 370, WEB_H = 200;
  function web(W2, x, y, t, F) {
    const a = g.globalAlpha;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.4, 0, 1));
    g.fillStyle = PLATE; g.fillRect(x, y, WEB_W, WEB_H);
    g.strokeStyle = rgba(LINE, 0.28); g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, WEB_W - 1, WEB_H - 1);
    const bites = Math.round(W2.edges.reduce((s2, e) => s2 + e.bites, 0)), kills = W2.edges.reduce((s2, e) => s2 + e.kills, 0);
    const head = 'FOOD WEB IN VIEW', hw = width('head', head) + 14;
    g.fillStyle = 'rgba(6,9,10,0.9)'; g.fillRect(x + 8, y - 7, hw, 15);
    g.strokeStyle = rgba(LINE, 0.55); g.strokeRect(x + 8.5, y - 6.5, hw - 1, 14);
    setType('head'); g.textAlign = 'left'; g.fillStyle = rgba(INK, 0.95); g.fillText(head, x + 15, y + 4);
    if (A) A.box(owner, head, x + 8, y - 7, x + 8 + hw, y + 8);
    const tail = ` · ${kills} KILLS · 30 S`;
    text('micro', `${bites} BITES`, x + WEB_W - 10 - width('micro', tail), y + 22, rgba(INK2, 1), 'right');
    text('micro', tail, x + WEB_W - 10, y + 22, rgba(kills ? HOT : INK2, 1), 'right');
    const level = (k) => { const gd = F.species(k)?.guild; return gd === 'predator' ? 0 : gd === 'producer' ? 2 : 1; };
    const rows = [[], [], []];
    for (const nd of W2.nodes) rows[level(nd.kind)].push(nd);
    // each species a tag in its level's row (three at most a row, the most numerous), its name fitted; the levels
    // with none left out, the rest spread down the panel
    const box = new Map(), x0 = x + 82, w0 = WEB_W - 90, tw = w0 / 3 - 8;
    const present = [0, 1, 2].filter((r) => rows[r].length), gap = Math.min(60, 112 / Math.max(1, present.length - 1));
    present.forEach((r, ri) => {
      const row = rows[r];
      row.sort((p, q) => q.n - p.n).splice(3);
      const ry = y + 52 + ri * gap + (present.length === 1 ? 56 : present.length === 2 ? 24 : 0);
      text('micro', ['HUNTERS', 'GRAZERS', 'PRODUCERS'][r], x + 10, ry + 4, rgba(INK3, 1));
      row.forEach((nd, i) => { const cx = x0 + (w0 * (i + 0.5)) / row.length; box.set(nd.kind, { l: cx - tw / 2, r: cx + tw / 2, t: ry - 9, b: ry + 9, cx }); });
    });
    // the arrows first, from the eaten's tag's top to the eater's tag's bottom, spread where several meet one tag
    const u = reduced ? 1 : ease((t - 0.2) / 0.6), ends = new Map();
    const spread = (k, side) => { const key = `${k}${side}`, n2 = ends.get(key) || 0; ends.set(key, n2 + 1); return ((n2 % 3) - 1) * 9; };
    const sum = W2.edges.reduce((s2, e) => s2 + e.bites + 4 * e.kills, 0) || 1;
    for (const e of W2.edges) {
      const p = box.get(e.from), q = box.get(e.to);
      if (!p || !q || p === q) continue;
      const tone = e.kills ? HOT : INK, w = clamp(0.8 + 6 * ((e.bites + 4 * e.kills) / sum), 0.8, 3.5);
      const upward = q.b <= p.t;
      const s0 = upward ? [p.cx + spread(e.from, 't'), p.t] : [p.cx + spread(e.from, 'b'), p.b];
      const s1 = upward ? [q.cx + spread(e.to, 'b'), q.b] : [q.cx + spread(e.to, 't'), q.t];
      const m = [s0[0] + (s1[0] - s0[0]) * u, s0[1] + (s1[1] - s0[1]) * u];
      stroke(() => { g.beginPath(); g.moveTo(...s0); g.lineTo(...m); }, rgba(tone, 0.85), w);
      if (u >= 1) {
        const an2 = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
        stroke(() => { g.beginPath(); for (const sg of [-1, 1]) { g.moveTo(...s1); g.lineTo(s1[0] - Math.cos(an2 + sg * 0.5) * 6, s1[1] - Math.sin(an2 + sg * 0.5) * 6); } }, rgba(tone, 0.95), 1.3);
      }
    }
    for (const [k, b2] of box) {
      const sp = F.species(k), hot = isActive(k);
      g.fillStyle = 'rgba(6,9,10,0.95)'; g.fillRect(b2.l, b2.t, b2.r - b2.l, b2.b - b2.t);
      g.strokeStyle = rgba(hot ? HOT : LINE, hot ? 0.9 : 0.5); g.lineWidth = 1; g.strokeRect(b2.l + 0.5, b2.t + 0.5, b2.r - b2.l - 1, b2.b - b2.t - 1);
      glyph(sp?.guild, b2.l + 8, b2.t + 9, hot ? HOT : INK);
      text('data', fit('data', short(sp?.name), b2.r - b2.l - 18), b2.l + 14, b2.t + 13, rgba(INK, 0.95));
    }
    text('micro', 'ARROW: FROM THE EATEN TO THE EATER', x + 10, y + WEB_H - 9, rgba(INK3, 1));
    g.globalAlpha = a;
  }
  let isActive = () => false;
  function noteState(id) {
    let S = notesAt.get(id);
    if (!S) notesAt.set(id, (S = { c: {}, an: [{}, {}], z: {} }));
    return S;
  }
  function plan(n, M, F) {
    const d = n.data, sp = (k) => F.species(k), nm = (k) => up(sp(k)?.name || 'unnamed'), S = noteState(n.id);
    const pos = (id) => { const c = M.cell(id); return c ? markAt(id, c, c.kind === -1 ? (d.akind ?? d.kind) : c.kind, F.project, F.dt) : null; };
    // in the open world, out from under the frame's panels (by a margin, for what a label hangs on)
    const shows = (p, m = 0) => p[0] > F.open.l + m && p[0] < F.open.r - m && p[1] > F.open.t + m && p[1] < F.open.b - m
      && !F.block.some((b) => p[0] > b.l - m && p[0] < b.r + m && p[1] > b.t - m && p[1] < b.b + m);
    const group = (key, rows) => steady((S.c[key] ||= {}), rows, F);
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
    // a group's ground: lattice cells about as big as its cells, a power of two world units on a side (another only
    // when a zoom has taken them past 1.5× too big or small), read afresh with each look at the view
    const ground = (k, rows) => {
      const Z = S.z, v = M.view, want = Math.log2(clamp(F.radius(k) * 1.6, 14, 64) / F.ppu);
      if (Z.L == null || Math.abs(Z.L - want) > 0.6) Z.L = Math.round(want);
      const s = 2 ** Z.L;
      let base = null;
      if (Z.view !== v || Z.s !== s) {
        Z.view = v;
        // (each member as near the view's middle as the world's wrap allows, so the lattice is the view's)
        const [W, H] = F.world, cx = v.rect[0] + v.rect[2] / 2, cy = v.rect[1] + v.rect[3] / 2;
        const n = new Map();
        for (const i of rows) {
          const x = cx + (v.x[i] - cx) - W * Math.round((v.x[i] - cx) / W), y = cy + (v.y[i] - cy) - H * Math.round((v.y[i] - cy) / H);
          const key = cellKey(Math.floor(x / s), Math.floor(y / s));
          n.set(key, (n.get(key) || 0) + 1);
        }
        // ground only where its members keep company (two or more about a lattice cell): one alone is marked by its
        // own glyph, and a sprinkling over the view would make a hazard map of confetti
        base = new Set();
        for (const key of n.keys()) {
          const [i, j] = cellIJ(key);
          let c = 0;
          for (let a = -1; a <= 1 && c < 2; a++) for (let b = -1; b <= 1; b++) c += n.get(cellKey(i + a, j + b)) || 0;
          if (c >= 2) base.add(key);
        }
      }
      return steadyLattice(Z, s, base, F.now, true, STEADY.hold);
    };
    // the view's squares of water (ks: their indices in this read), steadied
    const water = (ks) => {
      const Z = S.z, v = M.view, [ox, oy, s] = v.grid;
      let base = null;
      if (Z.view !== v || Z.ks !== ks || Z.s !== s) {
        Z.view = v; Z.ks = ks;
        const i0 = Math.round(ox / s), j0 = Math.round(oy / s);
        base = new Set(ks.map((k) => cellKey(i0 + (k % NOTE_TG), j0 + Math.floor(k / NOTE_TG))));
      }
      return steadyLattice(Z, s, base, F.now, false, STEADY.holdSq);
    };
    if (d.type === 'hunt' || d.type === 'scavenge') {
      const a = pos(d.actor);
      const b = d.type === 'hunt' ? pos(d.target) : F.project({ x: d.spot[0], y: d.spot[1], vx: 0, vy: 0, t: M.view.simTime }, -1);
      if (!a || !b) return null;
      const r = F.radius(d.akind), verb = d.type === 'hunt' ? 'KILL' : 'EATS REMAINS';
      P.tone = d.type === 'hunt' ? HOT : INK;
      const va = verbBox(a, b, verb, 0.18);
      P.draws.push((t) => link(a, b, verb, P.tone, t - 0.3, F.now, 0.18, 9, false, va));
      P.draws.push((t) => lock(a[0], a[1], r, P.tone, t));
      if (d.type === 'hunt') P.draws.push((t) => pip(b[0], b[1], HOT, t - 0.6));
      lockBox(a, r);
      P.anchor = [a[0], a[1] - r];
      P.pts = [a, b];
      P.label = d.type === 'hunt'
        ? { tone: HOT, eye: 'Hunter', num: String(d.kills), main: nm(d.akind), data: [`KILLED ${nm(d.kind)}`, `KILLS IN VIEW · LAST 30 S`] }
        : { tone: INK, eye: 'Scavenger', num: String(d.meals), main: nm(d.akind), data: ['EATS THE REMAINS OF THE DEAD'] };
      if (d.type === 'hunt') P.keys.push({ glyph: 'cross', text: 'KILLED', tone: HOT });
    } else if (d.type === 'graze') {
      const pts = group('g', M.rows(d.census));
      const a = d.actor !== NONE ? pos(d.actor) : null, b = d.target !== NONE ? pos(d.target) : null;
      const c = a || hang(0, pts, d.akind);
      if (!c) return null;
      P.draws.push((t) => census(pts, 'plus', INK, t, c, glyphOf(d.akind)));
      if (a && b) {
        const va = verbBox(a, b, 'GRAZES', -0.18);
        P.draws.push((t) => link(a, b, 'GRAZES', INK, t - 0.2, F.now, -0.18, 9, false, va));
        P.draws.push((t) => lock(a[0], a[1], F.radius(d.akind), INK, t));
        lockBox(a, F.radius(d.akind));
      }
      P.anchor = c;
      P.pts = pts;
      const g2 = sp(d.akind);
      P.label = { tone: INK, eye: `${g2?.guild === 'predator' ? 'Hunter' : 'Grazer'}`, num: String(d.bites), main: nm(d.akind),
        data: [`BITES ON ${nm(d.kind)} · LAST 30 S`, ...(d.dead ? [`${d.dead} GRAZED TO DEATH`] : [])] };
      P.keys.push({ glyph: 'plus', text: `${nm(d.akind)} CELL`, tone: INK });
      if (d.dead) {
        const deaths = recent(new Set(['grazed']), d.kind, 10).filter((e) => e.akind === d.akind || e.aid === NONE);
        pips(deaths, HOT);
        if (deaths.length) P.keys.push({ glyph: 'cross', text: 'GRAZED TO DEATH', tone: HOT });
      }
    } else if (d.type === 'newsp' || d.type === 'spark') {
      const c = pos(d.target);
      if (!c) return null;
      const m = d.actor !== NONE ? pos(d.actor) : null;
      P.tone = HOT;
      if (m) { const va = verbBox(m, c, 'BUDS', 0.22); P.draws.push((t) => link(m, c, 'BUDS', INK, t - 0.2, F.now, 0.22, 9, false, va)); }
      P.draws.push((t) => lock(c[0], c[1], F.radius(d.kind), HOT, t));
      lockBox(c, F.radius(d.kind));
      P.anchor = [c[0], c[1] - F.radius(d.kind)];
      P.pts = m ? [c, m] : [c];
      const g2 = sp(d.kind);
      const comfort = g2 ? `COMFORT ${Math.round(g2.topt - g2.tol)}–${Math.round(g2.topt + g2.tol)}°C` : '';
      P.label = d.type === 'spark'
        ? { tone: HOT, tag: 'Life from silt', main: nm(d.kind), data: [`A NEW LINEAGE · ${up(g2?.guild || '')}`, comfort].filter(Boolean) }
        : { tone: HOT, tag: 'New species', main: nm(d.kind), data: [`A MUTANT OF ${nm(d.akind)}`, `${up(g2?.guild || '')}${comfort ? ' · ' + comfort : ''}`] };
    } else if (d.type === 'bloom' || d.type === 'waking' || d.type === 'dormant') {
      const pts = group('c', M.rows(d.kind, d.type === 'dormant' ? 'cyst' : 'all'));
      const an = hang(0, pts, d.kind);
      if (!an) return null;
      const glyph = d.type === 'dormant' ? 'ring' : 'plus';
      P.draws.push((t) => census(pts, glyph, INK, t, an, glyphOf(d.kind)));
      P.anchor = an;
      P.pts = pts;
      const s = M.stats.by.get(d.kind), g2 = sp(d.kind);
      if (d.type === 'bloom') P.label = { tone: INK, eye: 'Dividing', num: `+${d.births}`, main: nm(d.kind), data: [`BORN IN 20 S · ${Math.round((s?.n ?? 0) * M.stats.scale)} IN VIEW`, up(g2?.guild || '')] };
      else if (d.type === 'waking') P.label = { tone: INK, eye: 'Waking', num: String(d.count), main: nm(d.kind), data: ['CYSTS WAKING IN 20 S', 'TO TRY THEIR LUCK AGAIN'] };
      else P.label = { tone: INK, eye: 'Going dormant', num: String(d.count), main: nm(d.kind), data: ['CURLED INTO CYSTS IN 20 S', 'NOTHING IN REACH TO EAT'] };
      P.keys.push({ glyph, text: d.type === 'dormant' ? `${nm(d.kind)} CYST` : `${nm(d.kind)} CELL`, tone: INK });
    } else if (d.type === 'heat') {
      const g2 = sp(d.kind);
      if (!g2) return null;
      const rows = M.rows(d.kind, 'hot'), pts = group('h', rows);
      const an = hang(0, pts, d.kind);
      if (!an) return null;
      P.tone = HOT;
      if (wide) {
        // (water too warm nearly everywhere in view is told by the label and the gauge alone)
        let inView = 0;
        for (const b of M.view.sqIn) inView += b;
        const keys = water(d.squares.length <= 0.7 * inView ? d.squares : []);
        P.draws.push((t) => drawLattice(S.z, keys, HOT, t, true, F));
      } else {
        const keys = ground(d.kind, rows);
        P.draws.push((t) => drawLattice(S.z, keys, HOT, t, true, F));
        P.draws.push((t) => census(pts, 'square', HOT, t - 0.2, an, glyphOf(d.kind)));
      }
      const deaths = recent('scalded', d.kind, 10);
      pips(deaths, HOT, 0.4);
      P.anchor = an;
      P.pts = pts;
      const lo = g2.topt - g2.tol, hi = g2.topt + g2.tol, w = M.water.hi;
      const scale = { min: Math.floor(Math.min(lo, w) / 5) * 5 - 5, max: Math.ceil(Math.max(hi, w) / 5) * 5 + 5 };
      P.label = { tone: HOT, tag: 'Scalding', num: String(d.hot), main: nm(d.kind), data: [`COMFORT ${Math.round(lo)}–${Math.round(hi)}°C · ${d.scalds} DEAD / 30 S`], range: { lo, hi, v: w, ...scale } };
      P.gauge = { v: w, lo, hi, ...scale, sub: `POOL ${F.pool.toFixed(1)}°` };
      P.keys.push({ glyph: 'square', text: wide ? `WATER TOO WARM FOR ${nm(d.kind)}` : 'TOO WARM: SCALDING', tone: HOT });
      if (deaths.length) P.keys.push({ glyph: 'cross', text: 'SCALDED, LAST 10 S', tone: HOT });
      // beside it, a species that bears the same water
      if (d.fine) {
        const f2 = sp(d.fine.kind), fpts = group('f', M.rows(d.fine.kind));
        const fa = f2 && hang(1, fpts, d.fine.kind);
        if (fa) {
          const flo = f2.topt - f2.tol, fhi = f2.topt + f2.tol;
          P.extra = { anchor: fa, pts: fpts, label: { tone: INK, tag: 'Not scalding', num: String(Math.round(d.fine.n * M.stats.scale)), main: nm(d.fine.kind),
            data: [`COMFORT ${Math.round(flo)}–${Math.round(fhi)}°C`], range: { lo: flo, hi: fhi, v: w, min: Math.floor(Math.min(flo, w) / 5) * 5 - 5, max: Math.ceil(Math.max(fhi, w) / 5) * 5 + 5 } } };
          P.draws.push((t) => census(fpts, 'plus', INK, t - 0.6, fa, glyphOf(d.fine.kind)));
          P.keys.push({ glyph: 'plus', text: `${nm(d.fine.kind)} CELL`, tone: INK });
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
        const ks = [];
        M.view.ice.forEach((v, k) => { if (v > 0.3 && M.view.sqIn[k]) ks.push(k); });
        // (the same squares as last time keep their array, so they are not read afresh each frame)
        const keys = water(S.ice && S.ice.join() === ks.join() ? S.ice : (S.ice = ks));
        P.draws.push((t) => drawLattice(S.z, keys, CYAN, t, true, F));
      } else P.draws.push((t) => census(pts, 'ring', CYAN, t, an));
      const froze = recent('froze', null, 10);
      pips(froze, HOT, 0.4);
      P.anchor = an;
      P.pts = pts;
      const W = M.water;
      P.label = { tone: CYAN, tag: 'Torpid', num: String(Math.round(St.torpid * St.scale)), main: `OF ${Math.round(St.living * St.scale)} CELLS STILLED`,
        data: [`TOO COLD TO MOVE · ${d.species} SPECIES`, `WATER ${W.mean.toFixed(1)}°${W.iced > 0 ? ` · ${Math.round(W.iced * 100)}% ICE` : ''} · ${d.froze} FROZE / 30 S`] };
      P.keys.push(wide ? { glyph: 'square', text: 'ICE', tone: CYAN } : { glyph: 'ring', text: 'TORPID: TOO COLD TO MOVE', tone: CYAN });
      if (froze.length) P.keys.push({ glyph: 'cross', text: 'FROZE, LAST 10 S', tone: HOT });
      const g2 = d.kind >= 0 ? sp(d.kind) : null;
      if (g2) {
        const lo = g2.topt - g2.tol, hi = g2.topt + g2.tol;
        P.gauge = { v: W.mean, lo, hi, min: Math.floor(Math.min(lo, W.mean) / 5) * 5 - 5, max: Math.ceil(Math.max(hi, W.mean) / 5) * 5 + 5, sub: `POOL ${F.pool.toFixed(1)}°` };
      }
      if (d.warm >= 0) {
        const w2 = sp(d.warm), wpts = group('w', M.rows(d.warm));
        const wa = w2 && hang(1, wpts, d.warm);
        if (wa) {
          P.extra = { anchor: wa, pts: wpts, label: { tone: INK, tag: 'Still active', num: String(Math.round((St.by.get(d.warm)?.n ?? 0) * St.scale)), main: nm(d.warm), data: [`COMFORT ${Math.round(w2.topt - w2.tol)}–${Math.round(w2.topt + w2.tol)}°C`] } };
          P.draws.push((t) => census(wpts, 'plus', INK, t - 0.6, wa, glyphOf(d.warm)));
          P.keys.push({ glyph: 'plus', text: `${nm(d.warm)}: STILL ACTIVE`, tone: INK });
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
        const tr = (S.trail ||= []), w = F.toWorld(mid);
        if (!tr.length || F.now - tr.at > 0.25) { tr.push(w); tr.at = F.now; if (tr.length > 16) tr.shift(); }
        P.draws.push(() => trail(tr, HOT, F));
        P.draws.push((t) => arrow(mid[0], mid[1], d.heading, clamp(d.lengths * 30, 36, 90), HOT, t - 0.3));
      }
      P.draws.push((t) => census(pts, 'plus', tone, t, an, clamp(F.radius(d.kind) * 0.18, 3, 6)));
      P.draws.push((t) => { const b = targetBox(pts, tone, t, fmtLen(d.size)); if (b) S.box = b; });
      // (its size readout is text: the labels keep off it as off any other)
      if (S.box) P.boxes.push({ ...S.box, t: S.box.t, b: S.box.t + 24, hard: true }, { ...S.box });
      P.anchor = an;
      P.pts = pts;
      const form = up(d.form);
      P.label = swim
        ? { tone: HOT, eye: 'Swimming', num: d.lengths.toFixed(1), main: 'BODY LENGTHS / S', data: [`${nm(d.kind)} · ${d.cells}-CELL ${form}`, `${fmtLen(d.speed, '/s')} · HEADING ${compass(d.heading)}`] }
        : { tone: INK, eye: 'Organism', num: String(d.cells), main: `CELLS · ${nm(d.kind)}`, data: [`ONE BODY: A ${form} ${fmtLen(d.size)} ACROSS`, `${up(g2?.guild || '')} · BONDED CELLS SHARE WHAT THEY GATHER`] };
      P.keys.push({ glyph: 'plus', text: `${nm(d.kind)}: ONE BODY`, tone });
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
      P.label = { tone: HOT, eye: 'Hunting', main: nm(d.akind), data: [`CLOSING ON ${nm(d.kind)}`, `ITS LAST MEAL WAS ONE OF THEM · ${fmtLen(d.speed, '/s')}`] };
      P.keys.push({ glyph: 'cross', text: 'QUARRY', tone: INK });
    } else if (d.type === 'web') {
      // the food web: a panel, its species marked in the view by their guild's glyph
      if (F.phone) return null;
      P.panel = { w: WEB_W, h: WEB_H, draw: (x, y, t) => web(d, x, y, t, F) };
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
      const net = d.born - d.dead, CAUSE = { kill: ['KILLED', HOT], grazed: ['GRAZED', HOT], starved: ['STARVED', INK2], old: ['OLD AGE', INK3], scalded: ['SCALDED', HOT], froze: ['FROZE', CYAN], dried: ['DRIED', INK3] };
      const deaths = Object.entries(d.died).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([c, k]) => [CAUSE[c][0], k, CAUSE[c][1]]);
      P.label = { tone: net >= 0 ? CYAN : HOT, tag: net > d.dead * 0.2 ? 'Thriving' : -net > d.born * 0.2 ? 'Declining' : 'Turnover', num: `${net > 0 ? '+' : ''}${net}`, main: nm(d.kind),
        data: [`BORN ${d.born} · DIED ${d.dead} · LAST 30 S`, deaths.slice(0, 3).map(([c, k]) => `${c} ${k}`).join(' · ') || 'NONE DIED'], split: { born: d.born, deaths } };
      P.keys.push({ glyph: 'plus', text: `${nm(d.kind)} CELL`, tone: INK });
      if (died.length) P.keys.push({ glyph: 'cross', text: 'DIED, LAST 10 S', tone: HOT });
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
      P.label = { tone: INK, eye: 'Sister species', num: String(d.species), main: `SPECIES OF ${up(d.genusName)}`,
        data: [d.kinds.map((k) => short(sp(k)?.name)).join(' · '), 'DESCENDED FROM ONE ANCESTOR, SIDE BY SIDE'] };
      for (const G of groups) P.keys.push({ glyph: G.glyph, text: nm(G.k), tone: INK });
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
      P.label = { tone: INK, eye: 'Old age', num: String(d.count), main: nm(d.kind), data: ['DIED OF AGE IN 20 S', 'A COHORT REACHING ITS END'] };
      P.keys.push({ glyph: 'cross', text: 'DIED OF AGE', tone: INK });
    } else if (d.type === 'rot') {
      const pts = group('r', M.stats.husks);
      const an = hang(0, pts, -1);
      if (!an) return null;
      P.draws.push((t) => census(pts, 'ring', INK2, t, an, 3));
      P.anchor = an;
      P.pts = pts;
      P.label = { tone: INK, eye: 'Decay', num: String(d.husks), main: 'HUSKS ROTTING TO SILT',
        data: [`${d.count} RETURNED TO SILT IN 30 S`, d.sparks ? `${d.sparks} NEW LIVES SPARKED FROM SILT` : 'THE SILT FEEDS WHAT GROWS NEXT'] };
      P.keys.push({ glyph: 'ring', text: 'HUSK: THE REMAINS OF A CELL', tone: INK2 });
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
      P.label = { tone: INK, eye: 'Current', num: um >= 10 ? String(Math.round(um)) : um.toFixed(1), main: `µm/s TOWARD ${compass(d.heading)}`,
        data: ['THE WATER CARRIES WHAT DOES NOT SWIM', 'DRIFTERS RIDE IT · SWIMMERS CROSS IT'] };
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
        ? { tone: HOT, eye: 'Starving', num: String(d.count), main: nm(d.kind), data: ['STARVED IN 20 S', 'NOTHING TO EAT IN REACH'] }
        : { tone: HOT, tag: 'Stranded', num: String(d.count), main: 'DRYING ON THE MUD', data: [`MOSTLY ${nm(d.kind)}`, 'THE WATER WITHDREW FROM THEM'] };
      P.keys.push({ glyph: 'cross', text: d.type === 'starving' ? 'STARVED, LAST 20 S' : 'DRIED OUT, LAST 20 S', tone: HOT });
    }
    n.pins = S.an.filter((a) => a.anchor != null && a.pin).map((a) => a.anchor);
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
    const panelArea = { l: F.open.l + 14, t: F.open.t + 34, r: F.open.l + 14 + WEB_W, b: F.open.t + 34 + WEB_H };
    const panelOn = !F.phone && F.notes.some((n) => n.type === 'web');
    F.block = F.phone ? [] : [rosterBox, gaugeArea, { l: F.open.l, t: F.open.b - 120, r: F.open.l + KEY_W, b: F.open.b }, panelOn ? panelArea : null].filter(Boolean);
    F.verbs = [];
    const T0 = performance.now();
    for (const n of F.notes) {
      const P = plan(n, M, F);
      // (one that cannot be drawn is as one with no room: the notes end it)
      if (P) plans.push({ n, P }); else n.hiddenAt ??= F.now;
    }
    const T1 = performance.now();
    const gaugeP = !F.phone && plans.find(({ P }) => P.gauge);
    const keys = [];
    for (const { P } of plans) for (const k of P.keys) if (!keys.some((x) => x.text === k.text)) keys.push(k);
    const keyBox = keys.length && !F.phone ? { l: F.open.l, t: F.open.b - 12 - 17 * Math.min(6, keys.length) - 6, r: F.open.l + KEY_W, b: F.open.b } : null;
    // (and the page's own text: the auto camera's caption, its subject's nameplate)
    // (holes that overlap merged into one, as an even-odd clip would show their overlap again)
    const panelP = plans.find(({ P }) => P.panel);
    const panels = [rosterBox, gaugeP ? gaugeArea : null, keyBox, panelP ? panelArea : null, ...F.avoid].filter(Boolean);
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i], b = panels[j];
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) {
        panels[i] = { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) };
        panels.splice(j, 1); j = i;
      }
    }
    // marks, clipped to the open world less the panels; labels and their leaders lie over them
    g.save();
    g.beginPath();
    g.rect(F.open.l, F.open.t, F.open.r - F.open.l, F.open.b - F.open.t);
    for (const b of panels) { g.moveTo(b.l, b.t); g.lineTo(b.l, b.b); g.lineTo(b.r, b.b); g.lineTo(b.r, b.t); g.closePath(); }
    g.clip('evenodd');
    const allPts = [];
    for (const { n, P } of plans) {
      const t = F.now - n.born, out = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / 0.6, 0, 1) : 1;
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
      taken.push(roster(rosterRows, rosterBox.r, rosterBox.t + 8, F.now - (F.since || 0)));
      A = a0;
      g.globalAlpha = 1;
    }
    if (gaugeP) {
      const n = gaugeP.n;
      g.globalAlpha = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / 0.6, 0, 1) : 1;
      owner = 'gauge';
      gauge(F.open.r - 64, F.open.b - 104, gaugeP.P.gauge, F.now - n.born);
      g.globalAlpha = 1;
      taken.push({ ...gaugeArea, hard: true });
    }
    owner = 'key';
    if (keyBox) taken.push(key(keys.slice(0, 6), F.open.l + 14, F.open.b - 12));
    if (panelP) {
      const n = panelP.n;
      g.globalAlpha = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / 0.6, 0, 1) : 1;
      owner = 'panel';
      panelP.P.panel.draw(panelArea.l, panelArea.t + 8, F.now - n.born);
      g.globalAlpha = 1;
      taken.push({ ...panelArea, hard: true });
    }
    const T3 = performance.now();
    // labels, the oldest first (they keep their places)
    for (const { n, P } of plans) {
      const t = F.now - n.born, out = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / 0.6, 0, 1) : 1;
      for (const [k, part] of [[0, P], [1, P.extra]]) {
        if (!part || !part.label) continue;
        const L = norm(part.label), size = labelSize(L), id = n.id * 2 + k, an = part.anchor;
        let st = lay.get(id);
        if (!st) lay.set(id, (st = { pick: null, lookAt: -1e9 }));
        // what the label hangs from: its anchor's place in the world, the anchor's own small motions (a swimmer's
        // beat) smoothed away, then shown where the camera shows it now, so the label rides the view's pans and zooms
        // exactly; a jump (another cell) crossfades
        const wa = F.toWorld(an);
        if (st.w && Math.hypot(wa[0] - st.w[0], wa[1] - st.w[1]) * F.ppu > 150) {
          if (st.off) st.ghost = { w: st.w, off: st.off, dir: st.dir, a: st.a * st.vis };
          st.w = null; st.off = null;
        }
        if (!st.w) st.w = wa;
        else { const f = 1 - Math.exp(-F.dt / STEADY.follow); st.w = [st.w[0] + (wa[0] - st.w[0]) * f, st.w[1] + (wa[1] - st.w[1]) * f]; }
        const base = F.toScreen(st.w);
        const at = place(id, base, size, taken, F.open, allPts, F.now);
        // set off it by an offset that eases to a near new place and crossfades to a far one (or the other side)
        const want = [at.x - base[0], at.y - base[1]];
        // (one with no room from its first frame starts hidden, its marks with it: it never shows only to vanish)
        if (!st.off) { st.off = want; st.dir = at.dir; st.a = st.ghost ? 0 : 1; st.vis ??= at.hard ? 0 : 1; st.hide ??= at.hard; }
        else if (st.dir !== at.dir || Math.hypot(want[0] - st.off[0], want[1] - st.off[1]) > STEADY.far) {
          if (A) A.count('flips');
          st.ghost = { w: st.w, off: st.off, dir: st.dir, a: st.a * st.vis };
          st.off = want; st.dir = at.dir; st.a = 0;
        } else {
          const f = 1 - Math.exp(-F.dt / STEADY.slide), next = [st.off[0] + (want[0] - st.off[0]) * f, st.off[1] + (want[1] - st.off[1]) * f];
          // (a slide that would pass over other text crossfades instead)
          const over = (o) => taken.some((r) => r.hard && area(boxAt(base[0] + o[0], base[1] + o[1], at.dir, size), r) > 4);
          if (over(next) && !over(want)) {
            if (A) A.count('flips');
            st.ghost = { w: st.w, off: st.off, dir: st.dir, a: st.a * st.vis };
            st.off = want; st.a = 0;
          } else st.off = next;
        }
        st.a = Math.min(1, st.a + F.dt / STEADY.swap);
        // never over other text: with no free place it waits, hidden, until one frees
        const lx = base[0] + st.off[0], ly = base[1] + st.off[1], box = boxAt(lx, ly, st.dir, size);
        // (hidden at once when it would cover text; shown again only once clear for a moment, so it never flickers)
        const blocked = taken.some((r) => r.hard && area(box, r) > 4);
        if (blocked) { st.hide = true; st.clearAt = null; } else { st.clearAt ??= F.now; if (F.now - st.clearAt > 0.3) st.hide = false; }
        st.vis = clamp(st.vis + ((st.hide ? -1 : 1) * F.dt) / 0.15, 0, 1);
        if (blocked && A) A.count('hidden');
        if (k === 0) {
          st.shown = st.a * st.vis;
          // (the notes end one whose label finds no room for a while: n.hiddenAt)
          if (st.vis < 0.05) n.hiddenAt ??= F.now; else n.hiddenAt = null;
        }
        if (st.ghost) {
          st.ghost.a -= F.dt / (STEADY.swap * 0.8);
          if (st.ghost.a <= 0) st.ghost = null;
          else {
            const gb = F.toScreen(st.ghost.w), gx = gb[0] + st.ghost.off[0], gy = gb[1] + st.ghost.off[1], a0 = A;
            g.globalAlpha = out * st.ghost.a;
            A = null;
            label(L, gx, gy, st.ghost.dir, 9);
            A = a0;
          }
        }
        const alpha = out * st.a * st.vis;
        if (alpha > 0.01) {
          // (the audit reads what can be read: a label faded past half is not)
          const a0 = A;
          if (alpha < 0.5) A = null;
          g.globalAlpha = alpha;
          owner = `L${id}`;
          if (A) A.point('label', id, lx, ly);
          leader(an[0], an[1], lx - st.dir * 4, ly + 7, L.tone || INK, t - 0.15 - k * 0.5);
          label(L, lx, ly, st.dir, t - 0.25 - k * 0.5);
          A = a0;
        }
        g.globalAlpha = 1;
        if (blocked) continue;
        taken.push({ ...box, hard: true });
        nextLabels.push(box);
        // its leader, as segments the next labels keep off
        const ey = ly + 7, { mx } = leaderPath(an[0], an[1], lx, ey);
        taken.push({ seg: [an[0], an[1], mx, ey] }, { seg: [mx, ey, lx, ey] });
      }
    }
    g.restore();
    lastLabels = nextLabels;
    nextLabels = [];
    g.letterSpacing = '0px'; g.fontStretch = 'normal'; g.textAlign = 'left';
    cur = null;
    const T4 = performance.now(), ms = (M.ms.parts ||= { plan: 0, marks: 0, frame: 0, labels: 0 });
    ms.plan += T1 - T0; ms.marks += T2 - T1; ms.frame += T3 - T2; ms.labels += T4 - T3;
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
  return { draw, audit, text: textOut, label, labelSize, width: (k, s) => { const w = width(k, s); cur = null; return w; } };
}
