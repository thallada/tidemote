// Canvas charts over the census history (life.history): every chart redraws in place, on the same
// axes (values on the left, the clock below), and every one answers the pointer: a canvas remembers
// how it was last drawn (cv._ch: its plot box, how to redraw it, what lies under a point and how to
// name it), and the one hover module below marks what is under the pointer and names it on the plate.
import { cssCol, esc, fmt, fmtClock } from './fmt.js';

const GRID = 'rgba(130,205,214,0.10)';
const BASE = 'rgba(130,205,214,0.22)';
const AXIS = 'rgba(163,189,190,0.85)';
const ERA = 'rgba(241,227,160,0.55)';
const CURSOR = 'rgba(226,241,240,0.5)';
const FONT = '500 10px Saira, system-ui, sans-serif';
const XLAB = 13; // the clock's strip below the plot

export function fit(cv) {
  const r = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
  const g = cv.getContext('2d');
  g.setTransform(r, 0, 0, r, 0, 0);
  g.clearRect(0, 0, w, h);
  g.font = FONT;
  join(cv);
  return { g, w, h };
}

// ------------------------------------------------------------------ axes
// a round step that divides span into about n parts
function niceStep(span, n) {
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
/** A value axis from 0 to a round top over max: { top, ticks }. */
export function linearTicks(max, n = 3) {
  const step = niceStep(max > 0 ? max : 1, n);
  const top = Math.max(step, Math.ceil(max / step - 1e-9) * step);
  const ticks = [];
  for (let k = 0; k * step <= top + step * 1e-6; k++) ticks.push(k * step);
  return { top, ticks };
}
/** A figure short enough for an axis: 950, 1.2k, 34k, 1.5M; fractions as far as step needs. */
export function shortNum(v, step = 1) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(0)}k`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}k`;
  let d = 0;
  while (d < 3 && Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) > 1e-6) d++;
  return String(+v.toFixed(d));
}
/** A value as an axis or the plate shows it, in unit: '%' (a fraction), '°', or a count. */
export function fmtVal(v, unit = '', step = 0) {
  if (unit === '%') return `${shortNum(v * 100, step ? step * 100 : Math.abs(v) < 0.1 ? 0.1 : 1)}%`;
  if (unit === '°') return `${shortNum(v, step || 0.1)}°`;
  if (step) return shortNum(v, step);
  const a = Math.abs(v);
  return a >= 100 ? fmt(Math.round(v)) : String(a >= 1 ? +v.toFixed(a >= 10 ? 1 : 2) : +v.toPrecision(2));
}
// clock ticks a round interval apart, at least minGap px apart
const CLOCK = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
export function timeTicks(t0, t1, px, minGap = 58) {
  const span = t1 - t0;
  if (!(span > 0)) return [];
  const step = CLOCK.find((s) => (s / span) * px >= minGap) || Math.ceil(span / 86400) * 86400;
  const out = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
  return out;
}

/**
 * The plot box for a canvas w × h with value labels yLabels down the left and room for the clock
 * below (bottom: px kept under the plot, top: above it): { l, t, r, b }.
 */
export function plotBox(g, w, h, yLabels, top = 6, bottom = XLAB) {
  let lw = 0;
  for (const s of yLabels) lw = Math.max(lw, g.measureText(s).width);
  return { l: Math.ceil(lw) + 5, t: top, r: w - 1, b: h - bottom };
}
// dotted guides at the value ticks with their labels, the baseline, and the era boundaries
export function grid(g, box, ys) {
  const { l, r } = box;
  g.fillStyle = GRID;
  for (const { y } of ys) { const Y = Math.round(y) + 0.5; for (let x = l; x < r; x += 4) g.fillRect(x, Y - 0.5, 1, 1); }
  g.fillStyle = BASE;
  g.fillRect(l, Math.round(box.b), r - l, 1);
  g.fillStyle = AXIS;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const { y, label } of ys) g.fillText(label, l - 4, Math.max(5, Math.min(box.b, y)));
  g.textBaseline = 'alphabetic';
}
// the clock below the plot, and dotted lines where eras began
export function clock(g, box, t0, t1, eras) {
  const { l, r, t, b } = box;
  const X = (s) => l + ((s - t0) / (t1 - t0)) * (r - l);
  if (eras) {
    g.fillStyle = ERA;
    for (const e of eras) {
      if (e.t <= t0 || e.t > t1) continue;
      const x = Math.round(X(e.t)) + 0.5;
      for (let y = t; y < b; y += 3) g.fillRect(x - 0.5, y, 1, 1.5);
    }
  }
  g.fillStyle = AXIS;
  g.textAlign = 'center';
  for (const s of timeTicks(t0, t1, r - l)) {
    const x = X(s), label = fmtClock(s), hw = g.measureText(label).width / 2;
    g.fillRect(Math.round(x), b + 1, 1, 3);
    g.fillText(label, Math.max(l + hw, Math.min(r - hw, x)), b + XLAB - 2);
  }
}
const histX = (box, n) => (i) => box.l + (n > 1 ? (i / (n - 1)) * (box.r - box.l) : 0);
const histIndex = (box, n, px) => Math.max(0, Math.min(n - 1, Math.round(((px - box.l) / (box.r - box.l)) * (n - 1))));

// ------------------------------------------------------------------ living cells by species
// each thriving species' population at every sample, and the chart's scale
function stack(hist) {
  let max = 1;
  for (const s of hist) if (s.living > max) max = s.living;
  const by = new Map();
  hist.forEach((s, i) => {
    for (const [k, p] of s.sp) {
      let e = by.get(k);
      if (!e) by.set(k, (e = { vals: new Float32Array(hist.length), a: i, b: i }));
      e.vals[i] = p; e.b = i;
    }
  });
  return { max, by, order: [...by.keys()].sort((a, b) => a - b) };
}

/**
 * Living cells stacked by thriving species (in their colours), the rest of life as a pale band on
 * top. Pointing names a band's species (hit: { serial, pop, t }) and brings it forward.
 */
export function drawLiving(cv, hist, reg, eras) {
  const f = fit(cv);
  if (!f) return;
  const { g, w, h } = f;
  const { max, by, order } = stack(hist);
  const ax = linearTicks(max, 2);
  const labels = ax.ticks.map((v) => shortNum(v));
  const box = plotBox(g, w, h, labels);
  const y = (v) => box.b - (v / ax.top) * (box.b - box.t);
  grid(g, box, ax.ticks.map((v, k) => ({ y: y(v), label: labels[k] })));
  const hot = cv._hot && cv._hot.serial;
  cv._ch = {
    redraw: () => drawLiving(cv, hist, reg, eras),
    at(px, py) {
      if (hist.length < 2) return null;
      const i = histIndex(box, hist.length, px), v = ((box.b - py) / (box.b - box.t)) * ax.top;
      if (v < 0) return null;
      let base = 0;
      for (const serial of order) {
        const p = by.get(serial).vals[i];
        if (p > 0 && v >= base && v < base + p) return reg.get(serial) ? { key: serial, serial, pop: p, t: hist[i].t } : null;
        base += p;
      }
      return null;
    },
    plate(hit) {
      const sp = reg.get(hit.serial);
      return sp && namePlate(sp.genome.col, sp.name, `${fmt(hit.pop)} · ${fmtClock(hit.t)}${sp.alive ? '' : ' · extinct'}`);
    },
  };
  if (hist.length < 2) return;
  clock(g, box, hist[0].t, hist[hist.length - 1].t, eras);
  const x = histX(box, hist.length);
  const base = new Float32Array(hist.length);
  const band = (vals, fill, a = 0, b = hist.length - 1) => {
    g.beginPath();
    for (let i = a; i <= b; i++) g.lineTo(x(i), y(base[i] + vals[i]));
    for (let i = b; i >= a; i--) g.lineTo(x(i), y(base[i]));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    for (let i = a; i <= b; i++) base[i] += vals[i];
  };
  for (const serial of order) {
    const sp = reg.get(serial), e = by.get(serial);
    const a = hot == null || hot === serial ? 0.9 : 0.35;
    band(e.vals, sp ? cssCol(sp.genome.col, a) : `rgba(255,200,140,${a * 0.9})`, Math.max(0, e.a - 1), Math.min(hist.length - 1, e.b + 1));
  }
  band(hist.map((s) => Math.max(0, s.living - s.sp.reduce((a, q) => a + q[1], 0))), 'rgba(226,241,240,0.16)');
  g.strokeStyle = 'rgba(226,241,240,0.55)'; g.lineWidth = 1;
  g.beginPath();
  hist.forEach((s, i) => g.lineTo(x(i), y(s.living)));
  g.stroke();
}

// ------------------------------------------------------------------ lines
/**
 * Line chart of history fields; series [{ k, label, col }] (or get: (sample) => value in place of
 * k), values in unit ('%' fractions, '°', or counts). Pointing marks the moment under it and
 * names every series' value there.
 */
export function drawLines(cv, hist, series, eras, unit = '') {
  const f = fit(cv);
  if (!f) return;
  const { g, w, h } = f;
  const val = series.map((s) => s.get || ((p) => p[s.k] ?? 0));
  let max = 0;
  for (const v of val) for (const p of hist) { const q = v(p); if (q > max) max = q; }
  const ax = linearTicks(max, h < 90 ? 2 : 3), step = ax.ticks[1] - ax.ticks[0];
  const labels = ax.ticks.map((v) => fmtVal(v, unit, step));
  const box = plotBox(g, w, h, labels);
  const Y = (v) => box.b - (v / ax.top) * (box.b - box.t);
  grid(g, box, ax.ticks.map((v, k) => ({ y: Y(v), label: labels[k] })));
  cv._ch = {
    redraw: () => drawLines(cv, hist, series, eras, unit),
    at: (px) => { if (hist.length < 2) return null; const i = histIndex(box, hist.length, px); return { key: i, i }; },
    plate: (hit) => {
      const p = hist[hit.i];
      return p && `<b class="pl-t">${fmtClock(p.t)}</b>${series.map((s, k) => `<i style="background:${s.col}"></i><span>${esc(s.label)}</span><em>${fmtVal(val[k](p), unit)}</em>`).join('')}`;
    },
    rows: true,
  };
  if (hist.length < 2) {
    g.fillStyle = AXIS; g.textAlign = 'left';
    g.fillText('collecting samples…', box.l + 4, box.t + 10);
    return;
  }
  clock(g, box, hist[0].t, hist[hist.length - 1].t, eras);
  const X = histX(box, hist.length);
  series.forEach((s, k) => {
    g.strokeStyle = s.col; g.lineWidth = 1.4; g.beginPath();
    hist.forEach((p, i) => { if (i) g.lineTo(X(i), Y(val[k](p))); else g.moveTo(X(i), Y(val[k](p))); });
    g.stroke();
  });
  const hot = cv._hot && hist[cv._hot.i] ? cv._hot.i : null;
  if (hot != null) {
    const x = Math.round(X(hot)) + 0.5;
    g.fillStyle = CURSOR;
    g.fillRect(x - 0.5, box.t, 1, box.b - box.t);
    series.forEach((s, k) => {
      g.fillStyle = s.col; g.strokeStyle = 'rgba(6,9,10,0.9)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, Y(val[k](hist[hot])), 3, 0, Math.PI * 2); g.stroke(); g.fill();
    });
  }
}

// each history sample's species by serial, built once per sample (samples never change once taken)
const spIndex = new WeakMap();
function spOf(s) {
  let m = spIndex.get(s);
  if (!m) { m = new Map(s.sp); spIndex.set(s, m); }
  return m;
}
/** A species' population at each history sample (0 while it was not thriving). */
export const popOf = (serial) => (s) => spOf(s).get(serial) ?? 0;

export function sparkPath(hist, serial, w, h) {
  if (hist.length < 2) return '';
  // at most one point per pixel, each the highest of the samples it stands for (peaks survive)
  const n = Math.min(hist.length, Math.max(2, Math.round(w)));
  const at = popOf(serial), vals = new Array(n).fill(0);
  let max = 1;
  for (let i = 0; i < hist.length; i++) {
    const k = Math.round((i / (hist.length - 1)) * (n - 1)), v = at(hist[i]);
    if (v > vals[k]) vals[k] = v;
    if (v > max) max = v;
  }
  return vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * w).toFixed(1)},${(h - 1 - (v / max) * (h - 2)).toFixed(1)}`).join('');
}

// ------------------------------------------------------------------ thermal niches
/**
 * Thermal niches: each living species ({ serial, name, topt, tol, pop, maker, col }) as a dot at its
 * preferred temperature (x, 0..45°) and its population (y, log), sized by its tolerance and ringed
 * if it makes heat, over a histogram of the warmth the living feel (felt: counts per bin of binW
 * degrees). A line marks the background water. Pointing at a dot names its species.
 */
export function drawNiches(cv, species, tbg, felt, binW) {
  const f = fit(cv);
  if (!f) return;
  const { g, w, h } = f;
  const pmax = Math.max(10, ...species.map((s) => s.pop));
  const decades = Math.ceil(Math.log10(pmax) - 1e-9), every = decades > 4 ? 2 : 1;
  const ticks = [];
  for (let d = 0; d <= decades; d += every) ticks.push(10 ** d);
  const labels = ticks.map((v) => shortNum(v));
  const box = plotBox(g, w, h, labels, 18);
  const X = (t) => box.l + (Math.max(0, Math.min(45, t)) / 45) * (box.r - box.l);
  const Y = (p) => box.b - 3 - (Math.log10(Math.max(1, p)) / decades) * (box.b - box.t - 3);
  grid(g, box, ticks.map((v, k) => ({ y: Y(v), label: labels[k] })));
  const fmax = Math.max(1, ...felt);
  g.fillStyle = 'rgba(255,138,58,0.16)';
  felt.forEach((n, b) => { const bh = (n / fmax) * (box.b - box.t); g.fillRect(X(b * binW) + 1, box.b - bh, X(binW) - X(0) - 2, bh); });
  g.fillStyle = 'rgba(255,138,58,0.8)';
  for (let y = box.t; y < box.b; y += 3) g.fillRect(Math.round(X(tbg)), y, 1, 1.5);
  const R = (s) => 1.5 + (s.tol / 15) * 4;
  const hot = cv._hot && cv._hot.serial;
  let hotS = null;
  for (const s of species) {
    if (s.serial === hot) { hotS = s; continue; }
    dot(s, hot == null ? 0.85 : 0.45);
  }
  if (hotS) {
    dot(hotS, 1);
    g.strokeStyle = 'rgba(226,241,240,0.95)'; g.lineWidth = 1.25;
    g.beginPath(); g.arc(X(hotS.topt), Y(hotS.pop), R(hotS) + (hotS.maker ? 5 : 2.5), 0, Math.PI * 2); g.stroke();
  }
  function dot(s, a) {
    const r = R(s);
    g.globalAlpha = a;
    g.fillStyle = cssCol(s.col);
    g.beginPath(); g.arc(X(s.topt), Y(s.pop), r, 0, Math.PI * 2); g.fill();
    if (s.maker) { g.strokeStyle = '#ff8a3a'; g.lineWidth = 1; g.beginPath(); g.arc(X(s.topt), Y(s.pop), r + 2.5, 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = 1;
  }
  g.fillStyle = AXIS;
  g.textAlign = 'center';
  for (const t of [0, 10, 20, 30, 40]) {
    const label = `${t}°`, hw = g.measureText(label).width / 2;
    g.fillRect(Math.round(X(t)), box.b + 1, 1, 3);
    g.fillText(label, Math.max(box.l + hw, X(t)), h - 2);
  }
  g.textAlign = 'left';
  g.fillText('cells (log) by preferred temperature', 0, 10);
  g.textAlign = 'right';
  g.fillText(`water ${Math.round(tbg)}°`, w, 10);
  cv._ch = {
    redraw: () => drawNiches(cv, species, tbg, felt, binW),
    // the dot nearest the pointer, within a few px of its edge
    at(px, py) {
      let best = null, bd = Infinity;
      for (const s of species) {
        const d = Math.hypot(px - X(s.topt), py - Y(s.pop)) - R(s);
        if (d < 6 && d < bd) { bd = d; best = s; }
      }
      return best && { key: best.serial, serial: best.serial, s: best };
    },
    plate: ({ s }) => namePlate(s.col, s.name, `${Math.round(s.topt)}° ± ${Math.round(s.tol)}° · ${fmt(s.pop)}${s.maker ? ' · heat-maker' : ''}`),
  };
}

// ------------------------------------------------------------------ pointing
/**
 * Call fn(e) on a tap or click on el: the pointer pressed and lifted in about the same place within a
 * moment, not a drag or a scroll the browser took over.
 */
export function onTap(el, fn) {
  let down = null;
  el.addEventListener('pointerdown', (e) => { down = e.button === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp } : null; });
  el.addEventListener('pointermove', (e) => { if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down = null; });
  el.addEventListener('pointercancel', () => { down = null; });
  el.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (d && e.pointerId === d.id && e.timeStamp - d.t < 600) fn(e);
  });
}

let join = () => {}; // set by chartPointer: every chart joins it as it is drawn
export const namePlate = (col, name, sub) => `<i style="background:${cssCol(col)}"></i><span>${esc(name)}</span><small>${sub}</small>`;

/**
 * The charts' pointer: a mouse names what is under it on the plate (a species' name plate, or the
 * values at a moment) and marks it on the chart; a click on a species opens it (onPick(serial)). On
 * touch a tap shows the plate and a second tap on the same species opens it; the plate stays after
 * the finger lifts, like a tapped term's hint, until the next tap anywhere else, Esc, or the chart
 * leaving the screen (check(), every frame or so). Every chart this module draws joins it.
 */
export function chartPointer(plate, onPick) {
  let hot = null; // the canvas the plate is naming
  const bound = new WeakSet();
  function point(cv, e) {
    const r = cv.getBoundingClientRect();
    const hit = cv._ch && cv._ch.at(e.clientX - r.left, e.clientY - r.top);
    const html = hit && cv._ch.plate(hit);
    const prev = cv._hot ? cv._hot.key : null;
    if (hot && hot !== cv) leave();
    cv._hot = html ? hit : null;
    hot = html ? cv : null;
    if (html) {
      plate.innerHTML = html;
      plate.classList.toggle('rows', !!cv._ch.rows);
      plate.hidden = false;
      // beside the pointer, or above the finger; flipped or held back at the screen's edges
      const pw = plate.offsetWidth, ph = plate.offsetHeight, touch = e.pointerType !== 'mouse';
      let x = e.clientX + 14;
      if (x + pw > innerWidth - 8) x = touch ? innerWidth - pw - 8 : e.clientX - 14 - pw;
      const y = touch ? e.clientY - ph - 28 : cv._ch.rows ? e.clientY - ph / 2 : e.clientY - 26;
      plate.style.left = `${Math.round(Math.max(8, x))}px`;
      plate.style.top = `${Math.round(Math.max(8, Math.min(innerHeight - ph - 8, y)))}px`;
    } else plate.hidden = true;
    if ((cv._hot ? cv._hot.key : null) !== prev) cv._ch.redraw();
    return prev;
  }
  function leave() {
    plate.hidden = true;
    const cv = hot;
    hot = null;
    if (cv && cv._hot) { cv._hot = null; if (cv._ch) cv._ch.redraw(); }
  }
  function bind(cv) {
    if (bound.has(cv)) return;
    bound.add(cv);
    cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && cv._ch) point(cv, e); });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && hot === cv) leave(); });
    // a mouse picks as it presses; a finger only by tapping, so a scroll that starts on a chart
    // neither names nor opens what it began on
    cv.addEventListener('pointerdown', (e) => {
      if (!cv._ch || e.pointerType !== 'mouse') return;
      point(cv, e);
      const hit = cv._hot;
      if (hit && hit.serial != null) onPick(hit.serial);
    });
    onTap(cv, (e) => {
      if (e.pointerType === 'mouse' || !cv._ch) return;
      const prev = point(cv, e), hit = cv._hot;
      if (hit && hit.serial != null && prev === hit.key) { onPick(hit.serial); leave(); }
    });
  }
  document.addEventListener('pointerdown', (e) => { if (hot && e.target !== hot) leave(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && hot) leave(); }, true);
  join = bind;
  return {
    /** Close the plate once its chart has left the screen. */
    check() { if (hot && (!hot.isConnected || !hot.offsetParent || !hot._hot)) leave(); },
    hot: () => hot,
  };
}
