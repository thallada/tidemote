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

/** Living cells stacked by thriving species (in their colours), the rest of life as a pale band on top. */
export function drawLiving(cv, hist, reg, eras) {
  const f = fit(cv);
  if (!f) return;
  const { g, w, h } = f;
  frame(g, w, h, 2, hist, eras);
  if (hist.length < 2) return;
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
  for (const serial of [...by.keys()].sort((a, b) => a - b)) {
    const sp = reg.get(serial), e = by.get(serial);
    band(e.vals, sp ? cssCol(sp.genome.col, 0.9) : 'rgba(255,200,140,0.8)', Math.max(0, e.a - 1), Math.min(hist.length - 1, e.b + 1));
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
