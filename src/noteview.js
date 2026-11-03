// The live annotations drawn (docs/annotations.md): src/notes.js says what to mark, this draws it on the page's
// overlay canvas, over the world, in the manner of a drone's HUD: two hues (a pale cyan-white for structure and the
// second party, a red-orange for the subject, danger and a kill), hairline rules with end ticks, thin hero numerals,
// tracked micro-labels, 45° leaders onto level shelves, stepped hatched zones, reticles, and text that types itself
// on. State is told by form: a filled tag, hatching, a hollow or dashed mark. Every mark rides on a cell the GPU
// found (by id, carried on to the moment shown), so it sits where its cell shows.
import { NOTE_TG } from './shaders.js';

const FONT = 'Saira, Bahnschrift, "DIN Alternate", "Segoe UI", system-ui, sans-serif';
const INK = '226,241,240', INK2 = '163,189,190', INK3 = '111,138,140', LINE = '150,222,230', HOT = '255,95,58', CYAN = '127,214,223';
const SHADE = 'rgba(4,7,8,0.85)', HALO = 'rgba(0,0,0,0.55)';
const rgba = (c, a) => `rgba(${c},${a})`;
const SCRAMBLE = '0123456789ABCDEFHKLMNPRSTVXZ/·-';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const NONE = 0xffffffff;

// the type, as the page's own labels: [weight, size, tracking (em), stretch]
const TYPE = {
  tag: [600, 11, 0.2, 'semi-expanded'],
  eye: [500, 11, 0.24, 'semi-expanded'],
  main: [400, 12.5, 0.14, 'semi-expanded'],
  num: [200, 24, 0.04, 'semi-expanded'],
  data: [400, 11, 0.1, 'normal'],
  micro: [500, 11, 0.14, 'normal'],
  head: [500, 11, 0.2, 'semi-expanded'],
};

export function createNoteView(g) {
  const widths = new Map();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hatch = {};
  // per note: where its label sits (eased) and its last chosen offset; per cell id: where its mark was drawn
  const lay = new Map();
  const marks = new Map();

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
    for (let i = n; i < Math.min(s.length, n + 4); i++) tail += s[i] === ' ' ? ' ' : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
    return s.slice(0, n) + tail;
  }
  function text(k, s, x, y, col, align = 'left') {
    if (!s) return;
    setType(k);
    g.textAlign = align;
    g.lineJoin = 'round';
    g.lineWidth = 3;
    g.strokeStyle = SHADE;
    g.strokeText(s, x, y);
    g.fillStyle = col;
    g.fillText(s, x, y);
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
  // LOCK: brackets close in on one cell; a faint ring ticked at 90° spins in; a centre point
  function lock(x, y, r, tone, t) {
    r = Math.max(r, 7);
    const a = g.globalAlpha, R = r * 1.45 + 6, u = reduced ? 1 : ease(t / 1.1);
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
    g.globalAlpha = a;
    return w;
  }
  // LINK: who acts on whom: a bowed line drawn out from the doer, marks running along it toward the other, a cross
  // tick at the far end, and its verb in a tag
  function link(a, b, verb, tone, t, now, bend = 0.18, gap = 9, hollow = false) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 2 * gap + 4) return;
    const ux = dx / L, uy = dy / L;
    const p0 = [a[0] + ux * gap, a[1] + uy * gap], p1 = [b[0] - ux * gap, b[1] - uy * gap];
    const m = [(p0[0] + p1[0]) / 2 - uy * L * bend, (p0[1] + p1[1]) / 2 + ux * L * bend];
    const u = reduced ? 1 : ease(t / 0.5);
    const at = (s) => [(1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * m[0] + s * s * p1[0], (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * m[1] + s * s * p1[1]];
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
    if (verb && t > 0.4) {
      let [qx, qy] = at(0.5);
      // a short link's verb stands off it, on a leader, so the tag never covers the pair
      if (L < 140) {
        const s = bend < 0 ? -1 : 1, ox = qx - uy * 34 * s, oy = qy + ux * 34 * s;
        stroke(() => { g.beginPath(); g.moveTo(qx, qy); g.lineTo(ox, oy); }, rgba(tone, 0.7), 1);
        qx = ox; qy = oy + 4;
      }
      tag(verb, qx, qy + 3, tone, t - 0.4, 'center', hollow);
    }
  }
  // CENSUS: a glyph on each cell of a kind in view, ticked on in a sweep out from where the note points.
  // plus: a member; ring: dormant or torpid (dashed); square: too warm; cross: dead
  function census(pts, glyph, tone, t, from, size = 4) {
    if (!pts.length) return;
    let far = 1;
    for (const p of pts) far = Math.max(far, Math.hypot(p[0] - from[0], p[1] - from[1]));
    // one path for them all (each glyph swells as it pops on), stroked twice: its dark halo, then the glyph
    const P = new Path2D();
    for (const [x, y] of pts) {
      const d = t - (0.9 * Math.hypot(x - from[0], y - from[1])) / far;
      if (d < 0 && !reduced) continue;
      const Q = size * (reduced ? 1 : 1 + 0.8 * Math.max(0, 1 - d / 0.25));
      if (glyph === 'plus') { P.moveTo(x - Q, y); P.lineTo(x + Q, y); P.moveTo(x, y - Q); P.lineTo(x, y + Q); }
      else if (glyph === 'ring') { P.moveTo(x + Q * 1.3, y); P.arc(x, y, Q * 1.3, 0, TAU); }
      else if (glyph === 'square') P.rect(x - Q * 0.8, y - Q * 0.8, Q * 1.6, Q * 1.6);
      else { P.moveTo(x - Q * 0.8, y - Q * 0.8); P.lineTo(x + Q * 0.8, y + Q * 0.8); P.moveTo(x + Q * 0.8, y - Q * 0.8); P.lineTo(x - Q * 0.8, y + Q * 0.8); }
    }
    g.setLineDash([]); g.lineWidth = 3.2; g.strokeStyle = HALO; g.stroke(P);
    g.lineWidth = 1.3; g.strokeStyle = rgba(tone, 0.95);
    if (glyph === 'ring') g.setLineDash([2, 2]);
    g.stroke(P);
    g.setLineDash([]);
  }

  // ZONE: a group, as the cells of a coarse screen grid around its members (stepped and square-cornered, as a HUD's
  // hazard map draws them): a dotted edge, hatched when it is a danger. Returns its corners for a leader.
  function zone(pts, tone, t, hatched, cell = 14) {
    if (pts.length < 2) return null;
    const on = new Set();
    for (const [x, y] of pts) { const i = Math.floor(x / cell), j = Math.floor(y / cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) on.add(`${i + a},${j + b}`); }
    for (const key of [...on]) { const [i, j] = key.split(',').map(Number); if (on.has(`${i + 2},${j}`)) on.add(`${i + 1},${j}`); if (on.has(`${i},${j + 2}`)) on.add(`${i},${j + 1}`); }
    const a = g.globalAlpha;
    let top = null, left = null, right = null;
    g.beginPath();
    const edges = new Path2D();
    for (const key of on) {
      const [i, j] = key.split(',').map(Number), x = i * cell, y = j * cell;
      if (hatched) g.rect(x, y, cell, cell);
      if (!on.has(`${i},${j - 1}`)) { edges.moveTo(x, y); edges.lineTo(x + cell, y); }
      if (!on.has(`${i},${j + 1}`)) { edges.moveTo(x, y + cell); edges.lineTo(x + cell, y + cell); }
      if (!on.has(`${i - 1},${j}`)) { edges.moveTo(x, y); edges.lineTo(x, y + cell); }
      if (!on.has(`${i + 1},${j}`)) { edges.moveTo(x + cell, y); edges.lineTo(x + cell, y + cell); }
      if (!top || y < top[1] || (y === top[1] && x + cell > top[0])) top = [x + cell, y];
      if (!left || x < left[0]) left = [x, y + cell / 2];
      if (!right || x + cell > right[0]) right = [x + cell, y + cell / 2];
    }
    const f = reduced ? 1 : clamp(t / 0.4, 0, 1);
    if (hatched) { g.globalAlpha = a * f * clamp((t - 0.3) / 0.4, 0, 1); g.fillStyle = hatchOf(tone); g.fill(); }
    g.globalAlpha = a * f;
    g.lineWidth = 3; g.strokeStyle = HALO; g.stroke(edges);
    g.lineWidth = 1; g.strokeStyle = rgba(tone, 0.9); g.setLineDash([1, 3]); g.lineCap = 'round'; g.stroke(edges); g.setLineDash([]); g.lineCap = 'butt';
    g.globalAlpha = a;
    return { top, left, right };
  }
  // SQUARES: stretches of the view's water (the scan's NOTE_TG × NOTE_TG squares), stepped as a hazard map draws them
  // (quads: [k, corners] by square index; only the union's outline is drawn)
  function squares(quads, tone, t, hatched) {
    if (!quads.length) return;
    const a = g.globalAlpha, f = reduced ? 1 : clamp(t / 0.5, 0, 1);
    const fill = new Path2D(), P = new Path2D(), has = new Set(quads.map(([k]) => k));
    for (const [k, q] of quads) {
      fill.moveTo(q[0][0], q[0][1]); for (let e = 1; e < 4; e++) fill.lineTo(q[e][0], q[e][1]); fill.closePath();
      const i = k % NOTE_TG, j = Math.floor(k / NOTE_TG);
      // its edges that face a square not in the set (top, right, bottom, left)
      const out = [j === 0 || !has.has(k - NOTE_TG), i === NOTE_TG - 1 || !has.has(k + 1), j === NOTE_TG - 1 || !has.has(k + NOTE_TG), i === 0 || !has.has(k - 1)];
      for (let e = 0; e < 4; e++) if (out[e]) { P.moveTo(q[e][0], q[e][1]); P.lineTo(q[(e + 1) % 4][0], q[(e + 1) % 4][1]); }
    }
    if (hatched) { g.globalAlpha = a * f * clamp((t - 0.3) / 0.5, 0, 1) * 0.7; g.fillStyle = hatchOf(tone); g.fill(fill); }
    g.globalAlpha = a * f;
    g.lineWidth = 3; g.strokeStyle = HALO; g.stroke(P);
    g.lineWidth = 1; g.strokeStyle = rgba(tone, 0.85); g.setLineDash([1, 3]); g.lineCap = 'round'; g.stroke(P); g.setLineDash([]); g.lineCap = 'butt';
    g.globalAlpha = a;
  }
  // PIP: a moment at a point: a cross that blinks, then rests half-lit
  function pip(x, y, tone, t) {
    const on = reduced || t > 0.9 || Math.floor(t / 0.15) % 2 === 0;
    const a = g.globalAlpha;
    g.globalAlpha = a * (on ? (t > 0.9 ? 0.75 : 1) : 0.2);
    const q = 4;
    stroke(() => { g.beginPath(); g.moveTo(x - q, y - q); g.lineTo(x + q, y + q); g.moveTo(x + q, y - q); g.lineTo(x - q, y + q); }, rgba(tone, 0.95), 1.3);
    g.globalAlpha = a;
  }
  // a leader in the HUD's manner: a small ring on the target, one 45° run, then a level shelf to the label
  function leader(sx, sy, ex, ey, tone, t) {
    const dy = ey - sy, dir = Math.sign(ex - sx) || 1, r = 3;
    const mx = sx + dir * Math.min(Math.abs(dy), Math.abs(ex - sx));
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
  //   ├──[█████]──┤            a range bar: a band of comfort on a scale, the reading as a tick
  function labelSize(L) {
    L = norm(L);
    const head = (L.eye ? width('eye', L.eye) : 0) + (L.tag ? width('tag', L.tag) + 10 + (L.eye ? 8 : 0) : 0);
    const row = (L.num ? width('num', L.num) + 8 : 0) + (L.main ? width('main', L.main) : 0);
    const data = Math.max(0, ...(L.data || []).map((d) => width('data', d)));
    const w = Math.max(head, row, data, L.range ? 120 : 0);
    let h = 0;
    if (L.eye || L.tag) h += 13;
    if (L.num || L.main) h += (L.num ? 24 : 15) + 4;
    h += (L.data || []).length * 14;
    if (L.range) h += 36;
    return { w, h: h + 4 };
  }
  function label(L, x, y, dir, t) {
    L = norm(L);
    const { w } = labelSize(L), tone = L.tone || INK;
    const X = (dx) => (dir > 0 ? x + dx : x - dx);
    const al = dir > 0 ? 'left' : 'right';
    let yy = y;
    if (L.eye || L.tag) {
      let ox = 0;
      if (L.tag) ox = tag(L.tag, dir > 0 ? x : x - width('tag', L.tag) - 10, yy, tone, t) + 8;
      if (L.eye) text('eye', decoded(L.eye, t), X(ox), yy, rgba(tone, 0.95), al);
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
      if (L.num) text('num', decoded(L.num, t - 0.1), dir > 0 ? x : x - mw - 8, yy, rgba(L.numTone || tone, 0.98), al === 'left' ? 'left' : 'right');
      if (L.main) text('main', decoded(L.main, t - 0.15), dir > 0 ? x + nw : x, yy, rgba(INK, 0.97), al);
      yy += 4;
    }
    for (const d of L.data || []) { yy += 14; text('data', decoded(d, t - 0.2), X(0), yy, rgba(INK2, 0.95), al); }
    if (L.range) { yy += 16; range(L.range, dir > 0 ? x : x - 120, yy, t - 0.25); yy += 20; }
    return { w, h: yy - y };
  }
  // a band of comfort on a scale (whole degrees), the reading as a needle; past the band, the excess in hot
  function range(R, x0, y, t) {
    if (t < 0 && !reduced) return;
    const a = g.globalAlpha;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.3, 0, 1));
    const bw = 120, f = (v) => x0 + bw * clamp((v - R.min) / (R.max - R.min), 0, 1);
    stroke(() => { g.beginPath(); g.moveTo(x0, y + 3); g.lineTo(x0 + bw, y + 3); g.moveTo(x0, y); g.lineTo(x0, y + 6); g.moveTo(x0 + bw, y); g.lineTo(x0 + bw, y + 6); }, rgba(LINE, 0.6), 1, false);
    g.fillStyle = rgba(LINE, 0.6);
    for (let v = Math.ceil(R.min / 5) * 5; v <= R.max; v += 5) g.fillRect(Math.round(f(v)), y + 3, 1, v % 10 ? 2 : 3.5);
    g.fillStyle = rgba(CYAN, 0.6); g.fillRect(f(R.lo), y + 1, f(R.hi) - f(R.lo), 4);
    const out = R.v > R.hi || R.v < R.lo;
    g.fillStyle = rgba(HOT, 0.95);
    if (R.v > R.hi) g.fillRect(f(R.hi), y + 1, f(R.v) - f(R.hi), 4);
    if (R.v < R.lo) g.fillRect(f(R.v), y + 1, f(R.lo) - f(R.v), 4);
    stroke(() => { g.beginPath(); g.moveTo(f(R.v), y - 3); g.lineTo(f(R.v), y + 9); }, rgba(out ? HOT : INK, 0.98), 1.6);
    text('micro', `${Math.round(R.lo)}`, f(R.lo), y + 18, rgba(INK3, 1), 'center');
    text('micro', `${Math.round(R.hi)}`, f(R.hi), y + 18, rgba(INK3, 1), 'center');
    text('micro', `${R.v.toFixed(1)}°`, f(R.v), y - 6, rgba(out ? HOT : INK, 1), 'center');
    g.globalAlpha = a;
  }
  // GAUGE: the water's temperature on an arc, with a species' band of comfort, its ends numbered; past it, hot
  function gauge(x, y, G, t) {
    const R = 32, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, A = (v) => a0 + (a1 - a0) * clamp((v - G.min) / (G.max - G.min), 0, 1);
    const a = g.globalAlpha;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.4, 0, 1));
    g.lineWidth = 1; g.strokeStyle = rgba(LINE, 0.55);
    g.beginPath(); g.arc(x, y, R, a0, a1); g.stroke();
    g.beginPath();
    for (let v = Math.ceil(G.min / 2) * 2; v <= G.max; v += 2) { const an = A(v), r2 = v % 10 === 0 ? R + 4 : R + 2; g.moveTo(x + R * Math.cos(an), y + R * Math.sin(an)); g.lineTo(x + r2 * Math.cos(an), y + r2 * Math.sin(an)); }
    g.stroke();
    g.lineWidth = 3; g.strokeStyle = rgba(CYAN, 0.55);
    g.beginPath(); g.arc(x, y, R - 5, A(G.lo), A(G.hi)); g.stroke();
    const over = G.v > G.hi ? [A(G.hi), A(G.v)] : G.v < G.lo ? [A(G.v), A(G.lo)] : null;
    if (over) { g.strokeStyle = rgba(HOT, 0.95); g.beginPath(); g.arc(x, y, R - 5, over[0], over[1]); g.stroke(); }
    const an = A(G.v);
    stroke(() => { g.beginPath(); g.moveTo(x + (R - 12) * Math.cos(an), y + (R - 12) * Math.sin(an)); g.lineTo(x + (R + 6) * Math.cos(an), y + (R + 6) * Math.sin(an)); }, rgba(over ? HOT : INK, 0.98), 1.6);
    for (const v of [G.lo, G.hi]) { const b = A(v); text('micro', `${Math.round(v)}`, x + (R + 13) * Math.cos(b), y + (R + 13) * Math.sin(b) + 4, rgba(INK3, 1), 'center'); }
    g.font = `300 15px ${FONT}`; g.fontStretch = 'normal'; g.letterSpacing = '0.6px'; g.textAlign = 'center'; cur = null;
    g.lineWidth = 3; g.strokeStyle = SHADE; const s = decoded(`${G.v.toFixed(1)}°`, t - 0.2); g.strokeText(s, x, y + 5); g.fillStyle = rgba(INK, 0.98); g.fillText(s, x, y + 5);
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
    return { l: x - w / 2, t: y - 11, r: x + w / 2, b: y + 5 };
  }
  // the species in view, most numerous first, each with its guild's glyph and a bar; those the notes speak of in hot
  function roster(rows, x, y, now, t) {
    const W = 216, H = 24 + rows.length * 19 + 4;
    const a = g.globalAlpha;
    g.globalAlpha = a * (reduced ? 1 : clamp(t / 0.4, 0, 1));
    g.fillStyle = 'rgba(6,9,10,0.62)'; g.fillRect(x - W, y, W, H);
    g.strokeStyle = rgba(LINE, 0.28); g.lineWidth = 1; g.strokeRect(x - W + 0.5, y + 0.5, W - 1, H - 1);
    const head = 'CELLS IN VIEW', hw = width('head', head) + 14;
    g.fillStyle = 'rgba(6,9,10,0.9)'; g.fillRect(x - W + 8, y - 7, hw, 15);
    g.strokeStyle = rgba(LINE, 0.55); g.strokeRect(x - W + 8.5, y - 6.5, hw - 1, 14);
    setType('head'); g.textAlign = 'left'; g.fillStyle = rgba(INK, 0.95); g.fillText(head, x - W + 15, y + 4);
    const max = Math.max(1, ...rows.map((r) => r.n));
    rows.forEach((r, i) => {
      const yy = y + 26 + i * 19, col = r.hot ? HOT : INK;
      text('micro', String(i + 1).padStart(2, '0'), x - W + 10, yy, rgba(INK3, 1));
      glyph(r.guild, x - W + 36, yy - 4, col);
      const nm = fit('micro', r.name.toUpperCase(), W - 100);
      text('micro', nm, x - W + 46, yy, rgba(col, r.hot ? 1 : 0.92));
      text('micro', String(r.n), x - 10, yy, rgba(col, 0.95), 'right');
      g.fillStyle = rgba(col, r.hot ? 0.9 : 0.4); g.fillRect(x - W + 46, yy + 4, Math.max(1, (W - 56) * (r.n / max)), 1);
    });
    g.globalAlpha = a;
    return { l: x - W, t: y - 8, r: x, b: y + H };
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
  // the key: what each glyph on screen stands for
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
      text('micro', it.text, x + 16, yy, rgba(col, 0.95));
      yy -= 17;
    }
    return { l: x, t: yy, r: x + 260, b: y + 4 };
  }

  // ------------------------------------------------------------------ placement
  const area = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  // where a label goes around its anchor: away from the panels, the other labels and the marks, and off the edges;
  // where it was last, unless that has come to be crowded
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
  function place(id, anchor, size, taken, open, marksAt) {
    const st = lay.get(id) || { off: null, at: null, dir: 1 };
    lay.set(id, st);
    // (weighed afresh every few frames, or when its anchor jumps; between, the last choice rides with its anchor)
    if (st.best && --st.fresh > 0 && Math.hypot(anchor[0] - st.best.ax, anchor[1] - st.best.ay) < 24) {
      const b = st.best, x = b.x + anchor[0] - b.ax, y = b.y + anchor[1] - b.ay;
      return { ...b, x: b.dir > 0 ? clamp(x, open.l + 6, open.r - size.w - 6) : clamp(x, open.l + size.w + 6, open.r - 6), y: clamp(y, open.t + 14, open.b - size.h) };
    }
    const cx = (open.l + open.r) / 2;
    let best = null;
    for (const dir of [1, -1]) for (const [dx0, dy] of OFFS) {
      const dx = dir * dx0;
      // (slid along its shelf to stay inside the open world: on a narrow screen no side has room for it whole)
      let x = anchor[0] + dx + dir * 4, y = anchor[1] + dy - 7;
      x = dir > 0 ? clamp(x, open.l + 6, open.r - size.w - 6) : clamp(x, open.l + size.w + 6, open.r - 6);
      y = clamp(y, open.t + 14, open.b - size.h);
      const box = dir > 0 ? { l: x - 6, t: y - 14, r: x + size.w + 6, b: y + size.h } : { l: x - size.w - 6, t: y - 14, r: x + 6, b: y + size.h };
      // the leader: a 45° run from the anchor, then the shelf
      const ey = y + 7, mx = anchor[0] + dir * Math.min(Math.abs(ey - anchor[1]), Math.abs(x - anchor[0]));
      let s = 0;
      for (const r of taken) {
        if (r.seg) { if (crosses(r.seg[0], r.seg[1], r.seg[2], r.seg[3], box)) s += 60; continue; }
        s += (area(box, r) / (size.w * size.h + 1)) * 3000;
        if (crosses(anchor[0], anchor[1], mx, ey, r) || crosses(mx, ey, x, ey, r)) s += 45;
      }
      // (covering a few marks is better than covering a label: in a crowd every place covers some)
      let under = 0;
      for (const p of marksAt) if (p[0] > box.l && p[0] < box.r && p[1] > box.t && p[1] < box.b && ++under >= 8) break;
      s += under * 8;
      s += (Math.max(0, open.l - box.l) + Math.max(0, box.r - open.r) + Math.max(0, open.t - box.t) + Math.max(0, box.b - open.b)) * 30;
      s += Math.hypot(dx, dy) * 0.08;
      // outward, toward the nearer edge, reads as the HUD's tidy margins
      if ((anchor[0] < cx) === (dir > 0)) s += 10;
      if (st.off && st.off.dx === dx && st.off.dy === dy) s -= 35;
      if (!best || s < best.s) best = { s, dx, dy, dir, box, x, y };
    }
    st.off = { dx: best.dx, dy: best.dy };
    st.best = { ...best, ax: anchor[0], ay: anchor[1] };
    st.fresh = 8;
    return best;
  }

  // A cell's screen position, eased: a new sample's correction against the last is faded out over ~0.1 s, so a mark
  // never jumps (as the page's own brackets do).
  function markAt(id, s, kind, project, dt) {
    if (!s) return null;
    const p = project(s, kind);
    if (!p) return null;
    let m = marks.get(id);
    if (!m) { m = { err: [0, 0], last: null, t: s.t, used: 0 }; marks.set(id, m); }
    if (m.last && m.t !== s.t) { m.err[0] += m.last[0] - p[0]; m.err[1] += m.last[1] - p[1]; if (Math.hypot(...m.err) > 80) m.err = [0, 0]; }
    m.t = s.t;
    const f = Math.exp(-dt / 0.06);
    m.err[0] *= f; m.err[1] *= f;
    const q = [p[0] + m.err[0], p[1] + m.err[1]];
    m.last = p;
    m.used = 0;
    return q;
  }

  // ------------------------------------------------------------------ one note, planned
  const up = (s) => (s || '').toUpperCase();
  function plan(n, M, F) {
    const d = n.data, sp = (k) => F.species(k), nm = (k) => up(sp(k)?.name || 'unnamed');
    const pos = (id) => { const c = M.cell(id); return c ? markAt(id, c, c.kind === -1 ? (d.akind ?? d.kind) : c.kind, F.project, F.dt) : null; };
    // (a steady sample past `cap`: the same cells from one look to the next, by their ids)
    const rowPts = (rows, cap = F.cap) => {
      const v = M.view, out = [], keep = rows.length > cap ? cap / rows.length : 1;
      for (const i of rows) {
        if (keep < 1 && ((Math.imul(v.id[i], 2654435761) >>> 0) / 4294967296) >= keep) continue;
        const p = F.project({ x: v.x[i], y: v.y[i], vx: v.vx[i], vy: v.vy[i], t: v.simTime }, v.kind[i]);
        if (p && shows(p)) out.push(p);
      }
      return out;
    };
    // in the open world, out from under the frame's panels
    const shows = (p) => p[0] > F.open.l && p[0] < F.open.r && p[1] > F.open.t && p[1] < F.open.b && !F.block.some((b) => p[0] > b.l && p[0] < b.r && p[1] > b.t && p[1] < b.b);
    const centroid = (pts) => pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : null;
    const nearest = (pts, to) => pts.reduce((b, p) => (!b || Math.hypot(p[0] - to[0], p[1] - to[1]) < Math.hypot(b[0] - to[0], b[1] - to[1]) ? p : b), null);
    const P = { tone: INK, draws: [], label: null, anchor: null, keys: [], gauge: null, extra: null, pts: [] };
    const recent = (evs, kind, secs) => M.since(M.view.simTime - secs, evs, (e) => kind == null || e.kind === kind);
    // the view's squares of water (k: their indices) as screen quads
    const quadsOf = (ks) => {
      const r = M.view.rect, out = [];
      for (const k of ks) {
        const i = k % NOTE_TG, j = Math.floor(k / NOTE_TG), w = r[2] / NOTE_TG, h = r[3] / NOTE_TG, x0 = r[0] + i * w, y0 = r[1] + j * h;
        const q = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) => F.project({ x, y, vx: 0, vy: 0, t: M.view.simTime }, -1));
        if (q.every(Boolean)) out.push([k, q]);
      }
      return out;
    };
    const wide = d.band === 'wide';
    // the newest few dozen of some events, as crosses where they happened
    const crosses = (evs, tone, delay = 0) => {
      for (const e of evs.slice(0, 40)) { const p = F.project({ x: e.x, y: e.y, vx: 0, vy: 0, t: e.t }, -1); if (p && shows(p)) P.draws.push((t) => pip(p[0], p[1], tone, t - delay)); }
    };
    // up close a glyph and a zone's grid grow with the cells they mark
    const glyphOf = (k) => clamp(F.radius(k) * 0.22, 4, 8), gridOf = (k) => clamp(F.radius(k) * 1.6, 14, 64);
    if (d.type === 'hunt' || d.type === 'scavenge') {
      const a = pos(d.actor);
      const b = d.type === 'hunt' ? pos(d.target) : F.project({ x: d.spot[0], y: d.spot[1], vx: 0, vy: 0, t: M.view.simTime }, -1);
      if (!a || !b) return null;
      const r = F.radius(d.akind);
      P.tone = d.type === 'hunt' ? HOT : INK;
      P.draws.push((t) => link(a, b, d.type === 'hunt' ? 'KILL' : 'EATS REMAINS', P.tone, t - 0.3, F.now));
      P.draws.push((t) => lock(a[0], a[1], r, P.tone, t));
      if (d.type === 'hunt') P.draws.push((t) => pip(b[0], b[1], HOT, t - 0.6));
      P.anchor = [a[0], a[1] - r];
      P.pts = [a, b];
      P.label = d.type === 'hunt'
        ? { tone: HOT, eye: 'Hunter', num: String(d.kills), main: nm(d.akind), data: [`KILLED ${nm(d.kind)}`, `KILLS IN VIEW · LAST 30 S`] }
        : { tone: INK, eye: 'Scavenger', num: String(d.meals), main: nm(d.akind), data: ['EATS THE REMAINS OF THE DEAD'] };
      if (d.type === 'hunt') P.keys.push({ glyph: 'cross', text: 'KILLED', tone: HOT });
    } else if (d.type === 'graze') {
      const rows = M.rows(d.census), pts = rowPts(rows);
      const a = d.actor !== NONE ? pos(d.actor) : null, b = d.target !== NONE ? pos(d.target) : null;
      P.draws.push((t) => census(pts, 'plus', INK, t, a || centroid(pts) || [0, 0], glyphOf(d.akind)));
      if (a && b) {
        P.draws.push((t) => link(a, b, 'GRAZES', INK, t - 0.2, F.now, -0.18));
        P.draws.push((t) => lock(a[0], a[1], F.radius(d.akind), INK, t));
      }
      const c = a || nearest(pts, centroid(pts) || [0, 0]);
      if (!c) return null;
      P.anchor = c;
      P.pts = pts;
      const g2 = sp(d.akind);
      P.label = { tone: INK, eye: `${g2?.guild === 'predator' ? 'Hunter' : 'Grazer'}`, num: String(d.bites), main: nm(d.akind),
        data: [`BITES ON ${nm(d.kind)} · LAST 30 S`, ...(d.dead ? [`${d.dead} GRAZED TO DEATH`] : [])] };
      P.keys.push({ glyph: 'plus', text: `${nm(d.akind)} CELL`, tone: INK });
      if (d.dead) {
        const deaths = recent(new Set(['grazed']), d.kind, 10).filter((e) => e.akind === d.akind || e.aid === NONE);
        crosses(deaths, HOT);
        if (deaths.length) P.keys.push({ glyph: 'cross', text: 'GRAZED TO DEATH', tone: HOT });
      }
    } else if (d.type === 'newsp' || d.type === 'spark') {
      const c = pos(d.target);
      if (!c) return null;
      const m = d.actor !== NONE ? pos(d.actor) : null;
      P.tone = HOT;
      if (m) P.draws.push((t) => link(m, c, 'BUDS', INK, t - 0.2, F.now, 0.22));
      P.draws.push((t) => lock(c[0], c[1], F.radius(d.kind), HOT, t));
      P.anchor = [c[0], c[1] - F.radius(d.kind)];
      P.pts = m ? [c, m] : [c];
      const g2 = sp(d.kind);
      const comfort = g2 ? `COMFORT ${Math.round(g2.topt - g2.tol)}–${Math.round(g2.topt + g2.tol)}°C` : '';
      P.label = d.type === 'spark'
        ? { tone: HOT, tag: 'Life from silt', main: nm(d.kind), data: [`A NEW LINEAGE · ${up(g2?.guild || '')}`, comfort].filter(Boolean) }
        : { tone: HOT, tag: 'New species', main: nm(d.kind), data: [`A MUTANT OF ${nm(d.akind)}`, `${up(g2?.guild || '')}${comfort ? ' · ' + comfort : ''}`] };
    } else if (d.type === 'bloom' || d.type === 'waking' || d.type === 'dormant') {
      const which = d.type === 'dormant' ? 'cyst' : 'all';
      const pts = rowPts(M.rows(d.kind, which));
      if (!pts.length) return null;
      const c = centroid(pts);
      const glyph = d.type === 'dormant' ? 'ring' : 'plus';
      P.draws.push((t) => census(pts, glyph, INK, t, nearest(pts, c), glyphOf(d.kind)));
      P.anchor = nearest(pts, c);
      P.pts = pts;
      const s = M.stats.by.get(d.kind), g2 = sp(d.kind);
      if (d.type === 'bloom') P.label = { tone: INK, eye: 'Dividing', num: `+${d.births}`, main: nm(d.kind), data: [`BORN IN 20 S · ${Math.round(s.n * M.stats.scale)} IN VIEW`, up(g2?.guild || '')] };
      else if (d.type === 'waking') P.label = { tone: INK, eye: 'Waking', num: String(d.count), main: nm(d.kind), data: ['CYSTS WAKING IN 20 S', 'TO TRY THEIR LUCK AGAIN'] };
      else P.label = { tone: INK, eye: 'Going dormant', num: String(d.count), main: nm(d.kind), data: ['CURLED INTO CYSTS IN 20 S', 'NOTHING IN REACH TO EAT'] };
      P.keys.push({ glyph, text: d.type === 'dormant' ? `${nm(d.kind)} CYST` : `${nm(d.kind)} CELL`, tone: INK });
    } else if (d.type === 'heat') {
      const g2 = sp(d.kind);
      if (!g2) return null;
      const pts = rowPts(M.rows(d.kind, 'hot'));
      if (!pts.length) return null;
      const c = centroid(pts);
      P.tone = HOT;
      if (wide) {
        // (water too warm nearly everywhere in view is told by the label and the gauge alone)
        const qs = d.squares.length <= 0.7 * NOTE_TG * NOTE_TG ? quadsOf(d.squares) : [];
        P.draws.push((t) => squares(qs, HOT, t, true));
      } else {
        P.draws.push((t) => zone(pts, HOT, t, true, gridOf(d.kind)));
        P.draws.push((t) => census(pts, 'square', HOT, t - 0.2, nearest(pts, c), glyphOf(d.kind)));
      }
      const deaths = recent('scalded', d.kind, 10);
      crosses(deaths, HOT, 0.4);
      P.anchor = nearest(pts, c);
      P.pts = pts;
      const lo = g2.topt - g2.tol, hi = g2.topt + g2.tol, water = M.water.hi;
      const scale = { min: Math.floor(Math.min(lo, water) / 5) * 5 - 5, max: Math.ceil(Math.max(hi, water) / 5) * 5 + 5 };
      P.label = { tone: HOT, tag: 'Scalding', num: String(d.hot), main: nm(d.kind), data: [`COMFORT ${Math.round(lo)}–${Math.round(hi)}°C · ${d.scalds} DEAD / 30 S`], range: { lo, hi, v: water, ...scale } };
      P.gauge = { v: water, lo, hi, ...scale, sub: `POOL ${F.pool.toFixed(1)}°` };
      P.keys.push({ glyph: 'square', text: wide ? `WATER TOO WARM FOR ${nm(d.kind)}` : 'TOO WARM: SCALDING', tone: HOT });
      if (deaths.length) P.keys.push({ glyph: 'cross', text: 'SCALDED, LAST 10 S', tone: HOT });
      // beside it, a species that bears the same water
      if (d.fine) {
        const f2 = sp(d.fine.kind), fpts = rowPts(M.rows(d.fine.kind));
        if (f2 && fpts.length) {
          const fa = nearest(fpts, c);
          const flo = f2.topt - f2.tol, fhi = f2.topt + f2.tol;
          P.extra = { anchor: fa, pts: fpts, label: { tone: INK, tag: 'Not scalding', num: String(Math.round(d.fine.n * M.stats.scale)), main: nm(d.fine.kind),
            data: [`COMFORT ${Math.round(flo)}–${Math.round(fhi)}°C`], range: { lo: flo, hi: fhi, v: water, min: Math.floor(Math.min(flo, water) / 5) * 5 - 5, max: Math.ceil(Math.max(fhi, water) / 5) * 5 + 5 } } };
          P.draws.push((t) => census(fpts, 'plus', INK, t - 0.6, fa, glyphOf(d.fine.kind)));
          P.keys.push({ glyph: 'plus', text: `${nm(d.fine.kind)} CELL`, tone: INK });
        }
      }
    } else if (d.type === 'cold') {
      const S = M.stats, rows = [];
      for (const s of S.by.values()) for (const i of s.torpidRows) rows.push(i);
      const pts = rowPts(rows);
      if (!pts.length) return null;
      const c = centroid(pts);
      P.tone = CYAN;
      if (wide) {
        const ks = [];
        M.view.ice.forEach((v, k) => { if (v > 0.3) ks.push(k); });
        const qs = quadsOf(ks);
        P.draws.push((t) => squares(qs, CYAN, t, true));
      } else P.draws.push((t) => census(pts, 'ring', CYAN, t, nearest(pts, c)));
      const froze = recent('froze', null, 10);
      crosses(froze, HOT, 0.4);
      P.anchor = nearest(pts, c);
      P.pts = pts;
      const W = M.water;
      P.label = { tone: CYAN, tag: 'Torpid', num: String(Math.round(S.torpid * S.scale)), main: `OF ${Math.round(S.living * S.scale)} CELLS STILLED`,
        data: [`TOO COLD TO MOVE · ${d.species} SPECIES`, `WATER ${W.mean.toFixed(1)}°${W.iced > 0 ? ` · ${Math.round(W.iced * 100)}% ICE` : ''} · ${d.froze} FROZE / 30 S`] };
      P.keys.push(wide ? { glyph: 'square', text: 'ICE', tone: CYAN } : { glyph: 'ring', text: 'TORPID: TOO COLD TO MOVE', tone: CYAN });
      if (froze.length) P.keys.push({ glyph: 'cross', text: 'FROZE, LAST 10 S', tone: HOT });
      const g2 = d.kind >= 0 ? sp(d.kind) : null;
      if (g2) {
        const lo = g2.topt - g2.tol, hi = g2.topt + g2.tol;
        P.gauge = { v: W.mean, lo, hi, min: Math.floor(Math.min(lo, W.mean) / 5) * 5 - 5, max: Math.ceil(Math.max(hi, W.mean) / 5) * 5 + 5, sub: `POOL ${F.pool.toFixed(1)}°` };
      }
      if (d.warm >= 0) {
        const w2 = sp(d.warm), wpts = rowPts(M.rows(d.warm));
        if (w2 && wpts.length) {
          const wa = nearest(wpts, centroid(wpts));
          P.extra = { anchor: wa, pts: wpts, label: { tone: INK, tag: 'Still active', num: String(wpts.length), main: nm(d.warm), data: [`COMFORT ${Math.round(w2.topt - w2.tol)}–${Math.round(w2.topt + w2.tol)}°C`] } };
          P.draws.push((t) => census(wpts, 'plus', INK, t - 0.6, wa, glyphOf(d.warm)));
          P.keys.push({ glyph: 'plus', text: `${nm(d.warm)}: STILL ACTIVE`, tone: INK });
        }
      }
    } else if (d.type === 'starving' || d.type === 'drying') {
      const evs = recent(d.type === 'starving' ? 'starved' : 'dried', d.type === 'starving' ? d.kind : null, 20);
      const pts = [];
      for (const e of evs.slice(0, 40)) { const p = F.project({ x: e.x, y: e.y, vx: 0, vy: 0, t: e.t }, -1); if (p && shows(p)) pts.push(p); }
      if (!pts.length) return null;
      const c = centroid(pts);
      P.tone = HOT;
      for (const p of pts) P.draws.push((t) => pip(p[0], p[1], HOT, t));
      P.anchor = nearest(pts, c);
      P.pts = pts;
      P.label = d.type === 'starving'
        ? { tone: HOT, eye: 'Starving', num: String(d.count), main: nm(d.kind), data: ['STARVED IN 20 S', 'NOTHING TO EAT IN REACH'] }
        : { tone: HOT, tag: 'Stranded', num: String(d.count), main: 'DRYING ON THE MUD', data: [`MOSTLY ${nm(d.kind)}`, 'THE WATER WITHDREW FROM THEM'] };
      P.keys.push({ glyph: 'cross', text: d.type === 'starving' ? 'STARVED, LAST 20 S' : 'DRIED OUT, LAST 20 S', tone: HOT });
    }
    return P.anchor ? P : null;
  }

  /**
   * Draws the notes and the devices around them. F: { now (s), dt (s), notes, model, species(slot), project(sample,
   * kind) -> [sx, sy] | null, radius(kind) css px, open {l, t, r, b} (the world clear of the panels), avoid [rects],
   * mode (the frame's tag), pool (°C), phone, roster (bool) }. Returns the rects it took (for the page's own labels).
   */
  function draw(F) {
    cur = null;
    const M = F.model, taken = [...F.avoid], plans = [];
    g.save();
    const active = new Set();
    for (const n of F.notes) for (const k of [n.data.kind, n.data.akind, n.data.census, n.data.fine?.kind]) if (k != null && k >= 0) active.add(k);
    // the panels of the frame first (where they go), so the marks keep out from under them
    const rosterRows = F.roster && !F.phone && M.stats
      ? M.roster().slice(0, 6).map((r) => ({ ...r, name: F.species(r.kind)?.name || '', guild: F.species(r.kind)?.guild, hot: active.has(r.kind) })).filter((r) => r.name) : [];
    const rosterBox = rosterRows.length ? { l: F.open.r - 12 - 216, t: F.open.t + 26, r: F.open.r - 12, b: F.open.t + 34 + 28 + rosterRows.length * 19 } : null;
    const modeAt = F.mode ? [(F.open.l + F.open.r) / 2, F.open.t + 14] : null;
    // (where the panels go, kept clear of the marks' anchors: the roster, the gauge and the key, whichever show)
    F.block = F.phone ? [] : [rosterBox, { l: F.open.r - 130, t: F.open.b - 154, r: F.open.r, b: F.open.b }, { l: F.open.l, t: F.open.b - 120, r: F.open.l + 280, b: F.open.b }].filter(Boolean);
    const T0 = performance.now();
    for (const n of F.notes) {
      const P = plan(n, M, F);
      if (P) plans.push({ n, P });
    }
    const T1 = performance.now();
    const gaugeP = !F.phone && plans.find(({ P }) => P.gauge);
    const gaugeBox = gaugeP ? { l: F.open.r - 130, t: F.open.b - 154, r: F.open.r, b: F.open.b } : null;
    const keys = [];
    for (const { P } of plans) for (const k of P.keys) if (!keys.some((x) => x.text === k.text)) keys.push(k);
    const keyBox = keys.length && !F.phone ? { l: F.open.l, t: F.open.b - 12 - 17 * Math.min(6, keys.length) - 6, r: F.open.l + 280, b: F.open.b } : null;
    const panels = [rosterBox, gaugeBox, keyBox].filter(Boolean);
    // marks, clipped to the open world less the panels; labels and their leaders lie over them
    g.save();
    g.beginPath();
    g.rect(F.open.l, F.open.t, F.open.r - F.open.l, F.open.b - F.open.t);
    for (const b of panels) { g.moveTo(b.l, b.t); g.lineTo(b.l, b.b); g.lineTo(b.r, b.b); g.lineTo(b.r, b.t); g.closePath(); }
    g.clip('evenodd');
    const allPts = [];
    for (const { n, P } of plans) {
      const t = F.now - n.born, out = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / 0.6, 0, 1) : 1;
      g.globalAlpha = out;
      for (const d of P.draws) d(t);
      g.globalAlpha = 1;
      for (const p of P.pts.slice(0, 120)) allPts.push(p);
    }
    g.restore();
    const T2 = performance.now();
    // the frame's devices: its corners, its mode, the species in view, the water's gauge, the key
    corners(F.open);
    if (modeAt) taken.push(modeTag(F.mode, ...modeAt));
    if (rosterBox) taken.push(roster(rosterRows, rosterBox.r, rosterBox.t + 8, F.now, F.now - (F.since || 0)));
    if (gaugeP) {
      const n = gaugeP.n, G = gaugeP.P.gauge, t = F.now - n.born, x = F.open.r - 64, y = F.open.b - 104;
      g.globalAlpha = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / 0.6, 0, 1) : 1;
      gauge(x, y, G, t);
      g.globalAlpha = 1;
      taken.push(gaugeBox);
    }
    if (keyBox) { key(keys.slice(0, 6), F.open.l + 14, F.open.b - 12); taken.push(keyBox); }
    const T3 = performance.now();
    // labels, the oldest first (they keep their places)
    for (const { n, P } of plans) {
      const t = F.now - n.born, out = n.exitAt != null ? clamp(1 - (F.now - n.exitAt) / 0.6, 0, 1) : 1;
      for (const [k, part] of [[0, P], [1, P.extra]]) {
        if (!part || !part.label) continue;
        const L = norm(part.label);
        const size = labelSize(L);
        const id = n.id * 2 + k;
        const at = place(id, part.anchor, size, taken, F.open, allPts);
        const st = lay.get(id);
        const want = [at.x, at.y];
        // eased toward where it should be, so a label rides smoothly with a moving subject and never jumps sides
        if (!st.at || st.dir !== at.dir) { st.at = want; st.dir = at.dir; }
        else { const f = 1 - Math.exp(-F.dt / 0.18); st.at = [st.at[0] + (want[0] - st.at[0]) * f, st.at[1] + (want[1] - st.at[1]) * f]; }
        const [lx, ly] = st.at;
        g.globalAlpha = out;
        leader(part.anchor[0], part.anchor[1], lx - st.dir * 4, ly + 7, L.tone || INK, t - 0.15 - k * 0.5);
        label(L, lx, ly, st.dir, t - 0.25 - k * 0.5);
        g.globalAlpha = 1;
        taken.push(st.dir > 0 ? { l: lx - 6, t: ly - 14, r: lx + size.w + 6, b: ly + size.h } : { l: lx - size.w - 6, t: ly - 14, r: lx + 6, b: ly + size.h });
        // its leader, as segments the next labels keep off
        const ey = ly + 7, mx = part.anchor[0] + st.dir * Math.min(Math.abs(ey - part.anchor[1]), Math.abs(lx - part.anchor[0]));
        taken.push({ seg: [part.anchor[0], part.anchor[1], mx, ey] }, { seg: [mx, ey, lx, ey] });
      }
    }
    g.restore();
    g.letterSpacing = '0px'; g.fontStretch = 'normal'; g.textAlign = 'left';
    cur = null;
    const T4 = performance.now(), ms = (M.ms.parts ||= { plan: 0, marks: 0, frame: 0, labels: 0 });
    ms.plan += T1 - T0; ms.marks += T2 - T1; ms.frame += T3 - T2; ms.labels += T4 - T3;
    // forget what is no longer drawn
    for (const [id, m] of marks) if (++m.used > 120) marks.delete(id);
    for (const id of lay.keys()) if (!F.notes.some((n) => n.id * 2 === id || n.id * 2 + 1 === id)) lay.delete(id);
    return taken;
  }

  // (for the page's own marks, drawn between frames of this: its font is not this one's)
  const textOut = (...a) => { cur = null; text(...a); cur = null; };
  return { draw, text: textOut, label, labelSize, width: (k, s) => { const w = width(k, s); cur = null; return w; } };
}

