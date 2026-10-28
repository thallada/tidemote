// The Lineage view's two drawings of a cut (model.js): a Muller plot (each lineage's cells, every
// lineage nested inside the one it branched from, so a clade reads as one shape and a die-off as
// the whole stack falling) and the tree of the same lineages below it, one row each, sharing its
// time axis. Both are canvas charts in charts.js's manner: they answer the pointer through cv._ch.
import { fit, plotBox, grid, clock, linearTicks, shortNum, timeTicks, namePlate } from '../charts.js';
import { memberAt, valAt, packBlocks } from './model.js';
import { fmt, fmtClock } from '../fmt.js';

const OTHER = [0.42, 0.5, 0.52];
const PANEL = '#070b0c', INK = '#e2f1f0', INK2 = '#a3bdbe', INK3 = '#6f8a8c';
const GRID = 'rgba(130,205,214,0.07)', ERA = 'rgba(241,227,160,0.28)';
const LABEL = '500 11px Saira, system-ui, sans-serif', SMALL = '500 10px Saira, system-ui, sans-serif';
const rgba = (c, a = 1, k = 1) => `rgba(${Math.round(c[0] * k * 255)},${Math.round(c[1] * k * 255)},${Math.round(c[2] * k * 255)},${a})`;
const unitKey = (c, u) => (u.other ? 'other' : c.units.indexOf(u));

/** What the unit is called: the species of its strand most numerous at t (or its latest). */
function unitName(u, t) {
  if (u.other) return 'Other lineages';
  const n = t != null && memberAt(u, t);
  return (n || (u.alive ? u.members.findLast((x) => x.alive) || u.members.at(-1) : u.members[0])).name;
}
// the color each unit wears at every sample of the cut: its strand's most numerous species there,
// held until the next one has led for at least minRun samples (or, minRun 0, one color throughout:
// its most numerous species over the span)
// (kept with the cut: pointing redraws the same cut many times)
function colors(c, minRun) {
  c.colors ||= new Map();
  if (c.colors.has(minRun)) return c.colors.get(minRun);
  const col = new Map(), n = c.ts.length;
  c.colors.set(minRun, col);
  for (const u of c.other ? [c.other, ...c.units] : c.units) {
    const a = new Array(n);
    if (u.other) { a.fill(OTHER); col.set(u, a); continue; }
    const lead = new Array(n);
    for (let i = 0; i < n; i++) lead[i] = u.vals[i] > 0 ? memberAt(u, c.ts[i]) : null;
    if (!minRun) {
      const w = new Map();
      for (const nd of lead) if (nd) w.set(nd, (w.get(nd) || 0) + 1);
      let best = u.members[0], bw = 0;
      for (const [nd, k] of w) if (k > bw) { bw = k; best = nd; }
      a.fill(best.rgb);
    } else {
      let cur = u.members[0];
      for (let i = 0; i < n; i++) {
        const nd = lead[i];
        if (nd && nd !== cur) { let k = 1; while (k < minRun && i + k < n && lead[i + k] === nd) k++; if (k >= minRun || i + k >= n) cur = nd; }
        a[i] = cur.rgb;
      }
    }
    col.set(u, a);
  }
  return col;
}
// fill the polygon top[i]..bottom[i] over samples a..b, split where the color changes (each run
// reaches into the next one's first sample, so no seam shows)
function fillRuns(g, X, top, bot, a, b, col, alpha, k) {
  for (let s = a; s <= b;) {
    let e = s;
    while (e < b && col[e + 1] === col[s]) e++;
    const z = Math.min(b, e + 1);
    g.beginPath();
    for (let j = s; j <= z; j++) g.lineTo(X(j), top(j));
    for (let j = z; j >= s; j--) g.lineTo(X(j), bot(j));
    g.closePath();
    g.fillStyle = rgba(col[s], alpha, k);
    g.fill();
    s = e + 1;
  }
}

/**
 * The Muller plot of cut c on canvas cv (sized by CSS): cells on the left axis, the clock below.
 * opts: { hot (unit key to bring forward), minLeft (px kept for the value labels), onHot(key) (the
 * pointer moved to another lineage) }.
 * Returns the plot box, so the tree below can share its time axis.
 */
export function drawMuller(cv, c, eras, opts = {}) {
  const f = fit(cv);
  if (!f) return null;
  const { g, w, h } = f;
  const { ts } = c, n = ts.length;
  const roots = c.other ? [c.other, ...c.roots] : c.roots;
  const C = new Map();
  const clade = (u) => { const a = u.vals.slice(); for (const k of u.kids) { const b = clade(k); for (let i = 0; i < n; i++) a[i] += b[i]; } C.set(u, a); return a; };
  const tot = new Float32Array(n);
  for (const r of roots) { const a = clade(r); for (let i = 0; i < n; i++) tot[i] += a[i]; }
  let max = 1;
  for (const v of tot) if (v > max) max = v;
  const ax = linearTicks(max, 2);
  const labels = ax.ticks.map(shortNum);
  const box = plotBox(g, w, h, labels);
  box.l = Math.max(box.l, opts.minLeft || 0);
  const H = box.b - box.t;
  grid(g, box, ax.ticks.map((v, k) => ({ y: box.b - (v / ax.top) * H, label: labels[k] })));
  const X = (i) => box.l + (i / (n - 1)) * (box.r - box.l);
  const perCell = H / ax.top;
  const Y = new Map();
  for (const u of C.keys()) Y.set(u, new Float32Array(n));
  for (let i = 0; i < n; i++) {
    let y = box.b - tot[i] * perCell;
    const place = (u, y0) => { Y.get(u)[i] = y0; let y1 = y0 + (u.vals[i] * perCell) / 2; for (const k of u.kids) { place(k, y1); y1 += C.get(k)[i] * perCell; } };
    for (const r of roots) { place(r, y); y += C.get(r)[i] * perCell; }
  }
  const col = colors(c, 0);
  const order = [];
  const pre = (u) => { order.push(u); u.kids.forEach(pre); };
  roots.forEach(pre);
  const hot = opts.hot;
  for (const u of order) {
    const a = C.get(u), y = Y.get(u);
    let i0 = -1, i1 = -1;
    for (let i = 0; i < n; i++) if (a[i] > 0) { if (i0 < 0) i0 = i; i1 = i; }
    if (i0 < 0) continue;
    const s0 = Math.max(0, i0 - 1), s1 = Math.min(n - 1, i1 + 1);
    const lit = hot == null || hot === unitKey(c, u);
    fillRuns(g, X, (i) => y[i], (i) => y[i] + a[i] * perCell, s0, s1, col.get(u), lit ? 1 : 0.35, u.alive || u.other ? 1 : 0.8);
    // a fine dark seam where a lineage arose inside another
    if (u.parent || u.other) {
      g.strokeStyle = 'rgba(7,11,12,0.6)'; g.lineWidth = 0.6;
      g.beginPath();
      for (let i = s0; i <= s1; i++) g.lineTo(X(i), y[i]);
      for (let i = s1; i >= s0; i--) g.lineTo(X(i), y[i] + a[i] * perCell);
      g.closePath(); g.stroke();
    }
  }
  // era boundaries, thinned where they crowd
  let lastEra = -Infinity;
  clock(g, box, c.t0, c.t1, eras.filter((e) => { const x = box.l + ((e.t - c.t0) / (c.t1 - c.t0)) * (box.r - box.l); if (x - lastEra < 24) return false; lastEra = x; return true; }));
  // the biggest lineages named where they are widest, never overlapping
  g.font = LABEL;
  g.textAlign = 'left';
  const boxes = [];
  const cand = order.map((u) => { let bi = -1, bv = 0; for (let i = 0; i < n; i++) { const v = u.vals[i] * perCell; if (v > bv) { bv = v; bi = i; } } return { u, bi, bv }; })
    .filter((q) => q.bv >= 15).sort((a, b) => b.bv - a.bv);
  for (const { u, bi, bv } of cand) {
    const name = unitName(u, ts[bi]), tw = g.measureText(name).width;
    const x = Math.max(box.l + 2, Math.min(box.r - tw - 2, X(bi) - tw / 2));
    const yy = Y.get(u)[bi] + Math.min(bv / 4, 12) + 4;
    const b = [x - 2, yy - 10, x + tw + 2, yy + 3];
    if (b[1] < box.t || boxes.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]))) continue;
    boxes.push(b);
    g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(7,11,12,0.85)'; g.strokeText(name, x, yy);
    g.fillStyle = u.alive ? INK : INK2; g.fillText(name, x, yy);
  }
  cv._ch = {
    redraw: () => { const hot = cv._hot ? cv._hot.key : null; drawMuller(cv, c, eras, { ...opts, hot }); opts.onHot?.(hot); },
    at(px, py) {
      if (px < box.l || px > box.r || py > box.b) return null;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - box.l) / (box.r - box.l)) * (n - 1))));
      const find = (list) => { for (const u of list) { const y0 = Y.get(u)[i], y1 = y0 + C.get(u)[i] * perCell; if (py >= y0 && py < y1) return find(u.kids) || u; } return null; };
      const u = find(roots);
      if (!u) return null;
      return { key: unitKey(c, u), u, node: u.other ? null : memberAt(u, ts[i]), t: ts[i], pop: u.vals[i] };
    },
    plate: (hit) => namePlate(hit.node ? hit.node.s.genome.col : 0xff8c8070, hit.node ? hit.node.name : 'Other lineages',
      `${fmt(Math.round(hit.pop))} in its lineage · ${fmtClock(hit.t)}${hit.u.count > 1 ? ` · ${fmt(hit.u.count)} species` : ''}`),
  };
  return box;
}

// a text's width in px in a font
let mg = null;
const measure = (text, font) => { mg ||= document.createElement('canvas').getContext('2d'); mg.font = font; return mg.measureText(text).width; };

/**
 * Rows for the tree of cut c across [l, r] px: { items, lanes, h, rh }. A row keeps its lane until its
 * name and pill have room, so names never run into the next row's.
 */
export function layoutTree(c, l, r, rh = 30) {
  const units = c.other ? [c.other, ...c.units] : c.units;
  const perPx = (c.t1 - c.t0) / Math.max(1, r - l);
  const items = units.map((u) => {
    const born = Math.max(c.t0, u.born), end = Math.min(c.t1, u.end);
    const px = measure(unitName(u, u.alive ? c.t1 : null), LABEL) + measure(pillText(u), SMALL) + 26;
    // a name that would run off the right edge is drawn back from it
    return { u, parent: null, born, end, from: Math.min(born, c.t1 - px * perPx), reach: born + px * perPx };
  });
  const of = new Map(items.map((it) => [it.u, it]));
  for (const it of items) it.parent = it.u.parent ? of.get(it.u.parent) : null;
  const lanes = packBlocks(items, 12 * perPx);
  return { items, lanes, h: lanes * rh + 8, rh };
}
const pillText = (u) => `${u.alive ? '' : '† '}${fmt(u.count)} sp`;

/**
 * The tree of cut c on cv (its CSS height set to lay.h): each lineage a band as thick as its cells,
 * in the color of its most numerous species, with a tick where its strand passed from one species
 * to the next, hung from the lineage it branched from. A pill after each name counts the species it
 * holds and follows the lineage (hit.follow). opts: { hot, l, r (the Muller's plot box edges), onHot }.
 */
export function drawTree(cv, c, lay, eras, opts = {}) {
  const f = fit(cv);
  if (!f) return;
  const { g, w, h } = f;
  const { ts } = c, n = ts.length, { items, rh } = lay;
  const l = opts.l ?? 4, r = opts.r ?? w - 4;
  const X = (t) => l + ((t - c.t0) / (c.t1 - c.t0)) * (r - l);
  const Xi = (i) => l + (i / (n - 1)) * (r - l);
  const Y = (lane) => 4 + lane * rh + rh * 0.62;
  g.fillStyle = GRID;
  for (const t of timeTicks(c.t0, c.t1, r - l)) g.fillRect(Math.round(X(t)), 0, 1, h);
  // era boundaries, thinned where they crowd (the plot above shows every one)
  g.fillStyle = ERA;
  let lastEra = -Infinity;
  for (const e of eras) {
    if (e.t <= c.t0 || e.t >= c.t1) continue;
    const x = Math.round(X(e.t)) + 0.5;
    if (x - lastEra < 24) continue;
    lastEra = x;
    for (let y = 0; y < h; y += 4) g.fillRect(x - 0.5, y, 1, 1);
  }
  const hot = opts.hot;
  const lit = (it) => hot == null || hot === unitKey(c, it.u);
  let peak = 1;
  for (const it of items) if (it.u.peak > peak) peak = it.u.peak;
  const k = (rh * 0.3) / Math.sqrt(peak);
  g.strokeStyle = 'rgba(163,189,190,0.3)'; g.lineWidth = 1;
  g.beginPath();
  for (const it of items) if (it.parent && it.u.born >= c.t0) { const x = Math.round(X(it.u.born)) + 0.5; g.moveTo(x, Y(it.parent.lane)); g.lineTo(x, Y(it.lane)); }
  g.stroke();
  const col = colors(c, Math.max(2, Math.round((n / (r - l)) * 6)));
  for (const it of items) {
    const u = it.u, y = Y(it.lane), a = lit(it) ? 1 : 0.35;
    let s0 = -1, s1 = -1;
    for (let i = 0; i < n; i++) if (u.vals[i] > 0) { if (s0 < 0) s0 = i; s1 = i; }
    if (s0 >= 0) fillRuns(g, Xi, (i) => y - 0.75 - Math.sqrt(u.vals[i]) * k, (i) => y + 0.75 + Math.sqrt(u.vals[i]) * k, Math.max(0, s0 - 1), Math.min(n - 1, s1 + 1), col.get(u), (u.alive ? 0.92 : 0.6) * a, 1);
    const c0 = u.other ? OTHER : u.members[0].rgb, x0 = X(it.born);
    g.fillStyle = rgba(c0, (u.alive ? 1 : 0.55) * a);
    g.fillRect(x0, y - 0.5, Math.max(2, X(it.end) - x0), 1);
    if (u.born >= c.t0) { g.beginPath(); g.arc(x0, y, 2.4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = `rgba(226,241,240,${0.45 * a})`;
    for (const nd of u.members.slice(1)) if (nd.born > c.t0 && nd.born < c.t1) g.fillRect(Math.round(X(nd.born)), y + 4, 1, 3);
  }
  // names, and the pill that follows each lineage
  for (const it of items) {
    const u = it.u, y = Y(it.lane) - 8, a = lit(it) ? 1 : 0.45;
    const name = unitName(u, u.alive ? c.t1 : null);
    g.font = LABEL;
    const tw = g.measureText(name).width;
    const pill = pillText(u);
    g.font = SMALL;
    const pw = g.measureText(pill).width + 10;
    const x = Math.max(2, Math.min(X(it.born) + 3, w - tw - pw - 10));
    g.font = LABEL;
    g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = PANEL; g.strokeText(name, x, y);
    g.globalAlpha = a; g.fillStyle = u.alive ? INK : INK2; g.fillText(name, x, y); g.globalAlpha = 1;
    // a line the viewer rode (docs/hand.md), underlined in the sun color
    if (opts.rode && u.members.some((m) => opts.rode.has(m.serial))) { g.fillStyle = 'rgba(241,227,160,0.9)'; g.fillRect(x, y + 3, tw, 1); }
    it.pill = [x + tw + 6, y - 10, pw, 14];
    const follow = !u.other && (u.hidden > 0 || u.kids.length > 0 || u.members.length > 1);
    it.follow = follow;
    g.fillStyle = PANEL; g.fillRect(...it.pill);
    if (follow) { g.strokeStyle = hot === unitKey(c, u) && opts.hotPill ? 'rgba(150,222,230,0.9)' : 'rgba(130,205,214,0.35)'; g.lineWidth = 1; g.strokeRect(it.pill[0] + 0.5, it.pill[1] + 0.5, it.pill[2] - 1, it.pill[3] - 1); }
    g.font = SMALL; g.fillStyle = follow ? (u.alive ? INK2 : INK3) : INK3;
    g.globalAlpha = a; g.fillText(pill, it.pill[0] + 5, y); g.globalAlpha = 1;
  }
  cv._ch = {
    redraw: () => { const hot = cv._hot ? cv._hot.key : null; drawTree(cv, c, lay, eras, { ...opts, hot, hotPill: cv._hot && cv._hot.follow }); opts.onHot?.(hot); },
    at(px, py) {
      const lane = Math.floor((py - 4) / rh);
      const it = items.find((q) => q.lane === lane && px >= X(q.born) - 4 && px <= Math.max(X(q.end), q.pill[0] + q.pill[2]) + 4);
      if (!it) return null;
      const u = it.u, p = it.pill;
      const onPill = px >= p[0] - 2 && px <= p[0] + p[2] + 2 && py >= p[1] - 3 && py <= p[1] + p[3] + 3;
      const tt = Math.max(it.born, Math.min(it.end, c.t0 + ((px - l) / (r - l)) * (c.t1 - c.t0)));
      const sp = u.other ? null : memberAt(u, tt) || u.members.findLast((nd) => nd.born <= tt) || u.members[0];
      const i = Math.max(0, Math.min(n - 1, Math.round(((tt - c.t0) / (c.t1 - c.t0)) * (n - 1))));
      if (onPill && it.follow) return { key: unitKey(c, u), u, follow: true, t: tt };
      return { key: unitKey(c, u), u, node: sp, t: tt, pop: u.vals[i] };
    },
    plate(hit) {
      const u = hit.u;
      if (hit.follow) return namePlate(u.members[0].s.genome.col, `Follow ${unitName(u, null)}`, `its lineage: ${fmt(u.count)} species · arose ${fmtClock(u.born)}${u.alive ? '' : ` · gone ${fmtClock(u.end)}`}`);
      if (!hit.node) return namePlate(0xff8c8070, 'Other lineages', `${fmt(u.count)} species whose ancestors are not shown`);
      const nd = hit.node;
      return namePlate(nd.s.genome.col, nd.name, `${fmt(Math.round(valAt(nd, hit.t)))} · ${fmtClock(hit.t)} · arose ${fmtClock(nd.born)}${nd.alive ? '' : ` · extinct ${fmtClock(nd.end)}`}`);
    },
  };
}
