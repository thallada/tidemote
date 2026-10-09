// Canvas charts over the census history (life.history): every chart redraws in place.
import { cssCol, fmt, fmtClock } from './fmt.js';

const GRID = 'rgba(130,205,214,0.10)';
const AXIS = 'rgba(163,189,190,0.85)';
const ERA = 'rgba(241,227,160,0.55)';

export function fit(cv) {
  const r = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
  const g = cv.getContext('2d');
  g.setTransform(r, 0, 0, r, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

// dotted horizontal guides and era boundaries
function frame(g, w, h, top, hist, eras) {
  g.fillStyle = GRID;
  for (let k = 0; k <= 4; k++) {
    const y = Math.round(top + ((h - 1 - top) * k) / 4) + 0.5;
    for (let x = 0; x < w; x += 4) g.fillRect(x, y, 1, 1);
  }
  if (!eras || hist.length < 2) return;
  const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
  g.fillStyle = ERA;
  for (const e of eras) {
    if (e.t <= t0 || e.t > t1) continue;
    const x = Math.round(((e.t - t0) / (t1 - t0)) * (w - 1)) + 0.5;
    for (let y = top; y < h; y += 3) g.fillRect(x - 0.5, y, 1, 1.5);
  }
}

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

/** The species under a point of drawLiving's chart (CSS px from its top left): { serial, pop, t, x } or null. */
export function livingAt(cv, hist, px, py) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (hist.length < 2 || !w || !h) return null;
  const { max, by, order } = stack(hist);
  const i = Math.max(0, Math.min(hist.length - 1, Math.round((px / w) * (hist.length - 1))));
  const v = ((h - py) / (h - 4)) * max;
  if (v < 0) return null;
  let base = 0;
  for (const serial of order) {
    const p = by.get(serial).vals[i];
    if (p > 0 && v >= base && v < base + p) return { serial, pop: p, t: hist[i].t, x: (i / (hist.length - 1)) * w };
    base += p;
  }
  return null;
}

/** Living cells stacked by thriving species (in their colours), the rest of life as a pale band on top. Hot: a species brought forward. */
export function drawLiving(cv, hist, reg, eras, hot = null) {
  const f = fit(cv);
  if (!f) return;
  const { g, w, h } = f;
  frame(g, w, h, 2, hist, eras);
  if (hist.length < 2) return;
  const { max, by, order } = stack(hist);
  const x = (i) => (i / (hist.length - 1)) * w;
  const y = (v) => h - (v / max) * (h - 4);
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

/** Line chart of history fields; series [{k, col}]. */
export function drawLines(cv, hist, series, eras, unit = '') {
  const f = fit(cv);
  if (!f) return;
  const { g, w, h } = f;
  const top = 16;
  frame(g, w, h, top, hist, eras);
  g.font = '500 10px Saira, system-ui, sans-serif';
  g.fillStyle = AXIS;
  if (hist.length < 2) { g.fillText('collecting samples…', 0, 11); return; }
  let max = 1e-6;
  for (const s of series) for (const p of hist) if ((p[s.k] ?? 0) > max) max = p[s.k];
  for (const s of series) {
    g.strokeStyle = s.col; g.lineWidth = 1.4; g.beginPath();
    hist.forEach((p, i) => { const X = (i / (hist.length - 1)) * w; const Y = h - 2 - ((p[s.k] ?? 0) / max) * (h - top - 4); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.stroke();
  }
  g.fillStyle = AXIS;
  g.textAlign = 'left';
  g.fillText(`${max >= 10 ? fmt(Math.round(max)) : max < 1.5 && max > 0.01 && unit === '%' ? `${Math.round(max * 100)}%` : max.toFixed(2)}${unit && unit !== '%' ? ` ${unit}` : ''}`, 0, 10);
  g.textAlign = 'right';
  g.fillText(`${fmtClock(hist[0].t)} – ${fmtClock(hist[hist.length - 1].t)}`, w, 10);
}

export function sparkPath(hist, serial, w, h) {
  if (hist.length < 2) return '';
  let max = 1;
  const vals = hist.map((s) => { const e = s.sp.find((q) => q[0] === serial); const v = e ? e[1] : 0; if (v > max) max = v; return v; });
  return vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 1 - (v / max) * (h - 2)).toFixed(1)}`).join('');
}

/**
 * Thermal niches: each living species as a dot at its preferred temperature (x, 0..45°) and its
 * population (y, log), sized by its tolerance and ringed if it makes heat, over a histogram of the
 * warmth the living feel (felt: counts per bin of binW degrees). A line marks the background water.
 */
export function drawNiches(cv, species, tbg, felt, binW) {
  const f = fit(cv);
  if (!f) return;
  const { g, w, h } = f;
  const top = 16, bot = 14, X = (t) => (Math.max(0, Math.min(45, t)) / 45) * (w - 1);
  frame(g, w, h - bot, top, [], null);
  g.font = '500 10px Saira, system-ui, sans-serif';
  g.fillStyle = AXIS;
  const fmax = Math.max(1, ...felt);
  g.fillStyle = 'rgba(255,138,58,0.16)';
  felt.forEach((n, b) => { const bh = (n / fmax) * (h - bot - top); g.fillRect(X(b * binW) + 1, h - bot - bh, X(binW) - X(0) - 2, bh); });
  g.fillStyle = 'rgba(255,138,58,0.8)';
  for (let y = top; y < h - bot; y += 3) g.fillRect(Math.round(X(tbg)), y, 1, 1.5);
  const pmax = Math.max(10, ...species.map((s) => s.pop));
  const Y = (p) => h - bot - 3 - (Math.log10(Math.max(1, p)) / Math.log10(pmax)) * (h - bot - top - 6);
  for (const s of species) {
    const r = 1.5 + (s.tol / 15) * 4;
    g.globalAlpha = 0.85;
    g.fillStyle = cssCol(s.col);
    g.beginPath(); g.arc(X(s.topt), Y(s.pop), r, 0, Math.PI * 2); g.fill();
    if (s.maker) { g.strokeStyle = '#ff8a3a'; g.lineWidth = 1; g.beginPath(); g.arc(X(s.topt), Y(s.pop), r + 2.5, 0, Math.PI * 2); g.stroke(); }
  }
  g.globalAlpha = 1;
  g.fillStyle = AXIS;
  g.textAlign = 'left';
  g.fillText(`${fmt(pmax)} cells`, 0, 10);
  for (const t of [0, 10, 20, 30, 40]) { g.textAlign = t ? 'center' : 'left'; g.fillText(`${t}°`, X(t), h - 2); }
  g.textAlign = 'right';
  g.fillText(`temperature ${Math.round(tbg)}°`, w, 10);
}
