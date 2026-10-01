// Walk the bond graph outward from one cell. The caller filters to one species.
// u32/f32 hold n packed particles
// (10 words each). Bonds join each cell to its two nearest same-species cells within LR.
const TB = { bins: null, nb: 0 };
export function traceBody(u32, f32, n, startId, W, H, LR) {
  const LR2 = LR * LR;
  // bin every cell into a torus grid of link-radius squares (counting sort)
  const bx = Math.max(3, Math.floor(W / LR)), by = Math.max(3, Math.floor(H / LR));
  const sx = bx / W, sy = by / H;
  const nb = bx * by;
  if (!TB.bins || TB.nb !== nb) { TB.bins = new Int32Array(nb + 1); TB.nb = nb; }
  const start = TB.bins;
  start.fill(0);
  const binOf = new Int32Array(n);
  const X = new Float32Array(n), Y = new Float32Array(n);
  let startIdx = -1;
  for (let i = 0; i < n; i++) {
    const x = f32[i * 10], y = f32[i * 10 + 1];
    X[i] = x; Y[i] = y;
    const b = Math.min(by - 1, Math.floor(y * sy)) * bx + Math.min(bx - 1, Math.floor(x * sx));
    binOf[i] = b;
    start[b + 1]++;
    if (u32[i * 10 + 7] === startId) startIdx = i;
  }
  for (let b = 0; b < nb; b++) start[b + 1] += start[b];
  const fill = start.slice(0, nb);
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[fill[binOf[i]]++] = i;
  if (startIdx < 0) return null;

  const nn1 = new Int32Array(n).fill(-2), nn2 = new Int32Array(n).fill(-2);
  const top2 = (i) => {
    if (nn1[i] !== -2) return;
    const x = X[i], y = Y[i];
    const b = binOf[i], cx = b % bx, cy = (b / bx) | 0;
    let a1 = -1, a2 = -1, d1 = LR2, d2 = LR2;
    for (let oy = -1; oy <= 1; oy++) {
      const row = ((cy + oy + by) % by) * bx;
      for (let ox = -1; ox <= 1; ox++) {
        const c = row + ((cx + ox + bx) % bx);
        for (let k = start[c], e = start[c + 1]; k < e; k++) {
          const j = order[k];
          if (j === i) continue;
          let dx = X[j] - x, dy = Y[j] - y;
          dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; a2 = a1; d1 = d; a1 = j; } else if (d < d2) { d2 = d; a2 = j; }
        }
      }
    }
    nn1[i] = a1; nn2[i] = a2;
  };
  const seen = new Uint8Array(n);
  const stack = [startIdx];
  seen[startIdx] = 1;
  const body = [];
  const visit = (j) => { if (j >= 0 && !seen[j]) { seen[j] = 1; stack.push(j); } };
  while (stack.length) {
    const i = stack.pop();
    body.push(i);
    top2(i);
    visit(nn1[i]); visit(nn2[i]);
    // reverse bonds: neighbours whose own two nearest include i
    const x = X[i], y = Y[i];
    const b = binOf[i], cx = b % bx, cy = (b / bx) | 0;
    for (let oy = -1; oy <= 1; oy++) {
      const row = ((cy + oy + by) % by) * bx;
      for (let ox = -1; ox <= 1; ox++) {
        const c = row + ((cx + ox + bx) % bx);
        for (let k = start[c], e = start[c + 1]; k < e; k++) {
          const j = order[k];
          if (seen[j]) continue;
          let dx = X[j] - x, dy = Y[j] - y;
          dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
          if (dx * dx + dy * dy >= LR2) continue;
          top2(j);
          if (nn1[j] === i || nn2[j] === i) visit(j);
        }
      }
    }
  }
  return { body, X, Y };
}
