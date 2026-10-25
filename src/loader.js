// The intro's loading animation: a specimen under the lens. A few score particles of four kinds follow
// a small attraction matrix (each kind clinging to its own), so scattered motes gather into colonies
// as the world will, while a sweep passes over them and the HUD locks onto one. Drawn on a software 2D
// canvas at 30 fps (under about 1 ms a frame), so the GPU stays free to compile the shaders and measure.
// Chosen over a lineage tree, the pool's contours under a scan line and a budding filament (2026-10-23).

const C = {
  line: 'rgba(130, 205, 214, 0.22)', line2: 'rgba(150, 222, 230, 0.55)',
  ink2: '#a3bdbe', ink3: '#6f8a8c', sun: '#f1e3a0', sunLine: 'rgba(241, 227, 160, 0.5)',
};
// the guilds' tints, muted (photosynth, grazer, predator, scavenger)
const KINDS = [['#cfe86a', 'photosynth', 'photo'], ['#7fd6df', 'grazer', 'grazer'], ['#ff8a6a', 'predator', 'pred'], ['#c3a2f0', 'scavenger', 'scav']];
const TAU = Math.PI * 2;
const SWEEP = 1.2; // radians of afterglow behind the sweep
// how the cells move: force to velocity (per second), velocity kept per frame, the most force a cell's
// neighbors add up to (a crowded colony otherwise kicks), and the fastest a cell goes (px a frame)
const GAIN = 10, DAMP = 0.88, FMAX = 0.7, VMAX = 1.6;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, '0');

const font = (ctx) => { ctx.font = "500 9px Saira, 'Bahnschrift', sans-serif"; ctx.letterSpacing = '1.6px'; };
function label(ctx, text, x, y, { color = C.ink3, align = 'left' } = {}) {
  font(ctx);
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
  // (µ stays as it is: uppercased it would read as an M)
  ctx.fillText(text.toUpperCase().replace(/Μ/g, 'µ'), x, y);
}
function line(ctx, x0, y0, x1, y1, color = C.line) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
// corner brackets around a box: the HUD's lock
function brackets(ctx, x, y, w, h, len, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.moveTo(cx + dx * len, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * len);
  }
  ctx.stroke();
}

function reticle(W, H, ctx) {
  // The lens is centered with readouts either side. Narrow screens (phones) stack them a word to a line,
  // in columns as wide as their longest, and the lens gives up what room they still lack.
  const wide = W >= 2 * (H / 2 - 16) + 220;
  font(ctx);
  const colW = Math.max(...['acquiring', 'specimen', 'cells 00', 'grazer', '000 µm', 'field 01', 'lux 00%', '00.0°'].map((x) => ctx.measureText(x.toUpperCase()).width));
  const gap = 16;
  const R = wide ? H / 2 - 16 : Math.max(36, Math.min(H / 2 - 16, W / 2 - gap - colW - 4));
  const cx = W / 2, cy = H / 2;
  const rnd = Math.random;
  const T = KINDS.length;
  // kin cling (colonies); other kinds are drawn more weakly, or pushed away, so colonies keep their kind
  const KIN = [0.5, 1], OTHER = [-0.6, 0.2];
  // and mostly alike both ways (MUTUAL): one kind drawn to another that flees it sets colonies chasing
  // each other across the lens
  const MUTUAL = 0.6;
  const M = Array.from({ length: T }, (_, a) => Array.from({ length: T }, (_, b) => {
    const [lo, hi] = a === b ? KIN : OTHER;
    return lo + rnd() * (hi - lo);
  }));
  for (let a = 0; a < T; a++) for (let b = 0; b < a; b++) {
    const m = (M[a][b] + M[b][a]) / 2;
    M[a][b] += (m - M[a][b]) * MUTUAL; M[b][a] += (m - M[b][a]) * MUTUAL;
  }
  const Mt = M.map((r) => [...r]);
  const P = Array.from({ length: 120 }, (_, i) => {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * R * 0.9;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: 0, t: i % T };
  });
  let lock = null, lockAt = -9, serial = Math.floor(rnd() * 900) + 100, mutAt = 0;
  const kinOf = (p) => P.filter((q) => q.t === p.t && Math.hypot(q.x - p.x, q.y - p.y) < 16);
  const step = (dt) => {
    const rr = 26;
    for (const p of P) {
      let fx = 0, fy = 0;
      for (const q of P) {
        if (q === p) continue;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d > rr || d < 1e-3) continue;
        const x = d / rr;
        // pushed apart up close, then drawn or pushed by the matrix, fading at the edge of reach
        const f = x < 0.25 ? x / 0.25 - 1 : M[p.t][q.t] * (1 - Math.abs(2 * x - 1.25) / 0.75);
        fx += (dx / d) * f; fy += (dy / d) * f;
      }
      const fm = Math.hypot(fx, fy);
      if (fm > FMAX) { fx *= FMAX / fm; fy *= FMAX / fm; }
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
      // the lens holds them: a wall that stiffens past its edge
      if (d > R * 0.8) { const k = (d - R * 0.8) / (R * 0.1); fx -= (dx / d) * k * k * 2; fy -= (dy / d) * k * k * 2; }
      // a slow current around the field
      fx += (-dy / R) * 0.2; fy += (dx / R) * 0.2;
      p.vx = p.vx * DAMP + fx * GAIN * dt; p.vy = p.vy * DAMP + fy * GAIN * dt;
      const v = Math.hypot(p.vx, p.vy);
      if (v > VMAX) { p.vx *= VMAX / v; p.vy *= VMAX / v; }
    }
    // the rules ease toward their mutated values rather than jump
    for (let a = 0; a < T; a++) for (let b = 0; b < T; b++) M[a][b] += (Mt[a][b] - M[a][b]) * Math.min(1, dt * 0.6);
    for (const p of P) {
      p.x += p.vx; p.y += p.vy;
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), max = R * 0.94;
      if (d > max) { p.x = cx + (dx / d) * max; p.y = cy + (dy / d) * max; p.vx *= 0.5; p.vy *= 0.5; }
    }
  };
  return (t, dt) => {
    step(Math.min(dt, 0.05));
    // now and then the rules mutate a little, so colonies keep re-forming
    if (t - mutAt > 2.5) {
      mutAt = t;
      const a = Math.floor(rnd() * T), b = Math.floor(rnd() * T), [lo, hi] = a === b ? KIN : OTHER;
      const dm = (rnd() - 0.5) * 0.6;
      Mt[a][b] = clamp(Mt[a][b] + dm, lo, hi);
      if (a !== b) Mt[b][a] = clamp(Mt[b][a] + dm * MUTUAL, lo, hi);
    }
    // the lens, its sweep and afterglow
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(127, 214, 223, 0.05)'); g.addColorStop(1, 'rgba(127, 214, 223, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    const sa = t * 0.9;
    const cg = ctx.createConicGradient(sa - SWEEP, cx, cy);
    cg.addColorStop(0, 'rgba(127, 214, 223, 0)'); cg.addColorStop(SWEEP / TAU, 'rgba(127, 214, 223, 0.13)'); cg.addColorStop(SWEEP / TAU + 0.001, 'rgba(127, 214, 223, 0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    line(ctx, cx, cy, cx + Math.cos(sa) * R, cy + Math.sin(sa) * R, 'rgba(127, 214, 223, 0.45)');
    // rings, a turning dashed arc, the bezel's ticks, the center mark
    ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, TAU); ctx.stroke();
    ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(cx, cy, R + 9, -t * 0.15, -t * 0.15 + TAU * 0.7); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU, long = i % 6 === 0, r1 = R + (long ? 6 : 3);
      line(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, long ? C.line2 : C.line);
    }
    line(ctx, cx - 5, cy, cx + 5, cy, C.line2); line(ctx, cx, cy - 5, cx, cy + 5, C.line2);
    // bonds between kin close together, then the cells, brighter as the sweep passes
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const p = P[i], q = P[j];
      if (p.t !== q.t || Math.abs(p.x - q.x) > 11) continue;
      if (Math.hypot(p.x - q.x, p.y - q.y) < 11) { ctx.strokeStyle = KINDS[p.t][0] + '55'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    }
    for (const p of P) {
      const behind = (((sa - Math.atan2(p.y - cy, p.x - cx)) % TAU) + TAU) % TAU;
      ctx.globalAlpha = 0.55 + 0.45 * (behind < SWEEP ? 1 - behind / SWEEP : 0);
      ctx.fillStyle = KINDS[p.t][0];
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.7, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // every few seconds, lock onto the largest colony on the readout's side of the lens
    if (t - lockAt > 3.2 || (lock && lock.x < cx - R * 0.35)) {
      let best = null, bn = 1;
      for (const p of P) {
        if (p.x < cx - R * 0.15) continue;
        const n = kinOf(p).length;
        if (n > bn) { bn = n; best = p; }
      }
      if (best) { lock = best; lockAt = t; serial += 1 + Math.floor(rnd() * 40); }
    }
    const rx = cx + R + (wide ? 22 : gap), ry = cy - 22, lead = wide ? 76 : colW;
    if (lock) {
      const kin = kinOf(lock);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of kin) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      // the brackets close in as the lock takes hold
      const k = clamp((t - lockAt) / 0.5, 0, 1), m = 4 + (1 - k) * 14;
      brackets(ctx, x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m, 4, C.sun);
      // the leader: from the brackets' right edge out past the bezel, then along to the readout
      const ex = x1 + m, ey = (y0 + y1) / 2, bx = cx + R + 12;
      ctx.strokeStyle = C.sunLine; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(Math.min(bx, rx - 2), ry); ctx.lineTo(rx + lead, ry); ctx.stroke();
      // its title above the leader, the rest below it a row apart
      const no = pad(serial, 4), rest = [`cells ${pad(kin.length, 2)}`, KINDS[lock.t][wide ? 1 : 2], `${pad(Math.hypot(x1 - x0, y1 - y0) * 6.6 + 12, 3)} µm`];
      label(ctx, k < 1 ? 'acquiring' : wide ? `specimen ${no}` : 'specimen', rx, ry - 5, { color: C.sun });
      if (!wide && k >= 1) label(ctx, `no ${no}`, rx, ry + 14, { color: C.sun });
      rest.forEach((s, i) => label(ctx, s, rx, ry + 14 * (i + (wide ? 1 : 2))));
    }
    // the field's readouts, mirroring the specimen's
    const lx = cx - R - (wide ? 22 : gap);
    label(ctx, 'field 01', lx, ry - 5, { align: 'right', color: C.ink2 });
    line(ctx, lx - (wide ? 72 : colW), ry, lx + (wide ? 8 : 2), ry);
    [`n ${P.length}`, `${(14.6 + Math.sin(t * 0.3) * 0.4).toFixed(1)}°`, `lux ${pad(18 + Math.sin(t * 0.2) * 3, 2)}%`]
      .forEach((s, i) => label(ctx, s, lx, ry + 14 * (i + 1), { align: 'right' }));
  };
}

/** Starts the animation on canvas; returns stop(). Reduced motion: one still frame, a few seconds in. */
export function startLoader(canvas) {
  // willReadFrequently keeps the canvas on the CPU: none of this is drawn by the GPU
  const ctx = canvas?.getContext('2d', { willReadFrequently: true });
  if (!ctx) return () => {};
  let W = 0, H = 0, draw = null, raf = 0, last = 0, prev = 0, t0 = null;
  // false while hidden (a short screen) or not laid out yet
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    if (Math.round(r.width) === W && Math.round(r.height) === H && draw) return true;
    W = Math.round(r.width); H = Math.round(r.height);
    if (W < 120 || H < 80) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw = reticle(W, H, ctx);
    return true;
  };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / 30 - 2) return;
    last = now;
    t0 ??= now;
    const t = (now - t0) / 1000, dt = Math.min(0.1, t - prev);
    prev = t;
    if (!fit()) return;
    ctx.clearRect(0, 0, W, H);
    draw(t, dt);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (fit()) for (let i = 0; i <= 150; i++) { ctx.clearRect(0, 0, W, H); draw(i / 30, 1 / 30); }
    return () => {};
  }
  // the columns are measured in the page's font: lay out again once it has loaded
  document.fonts?.ready.then(() => { W = 0; });
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
