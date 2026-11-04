// Contours: where a field crosses a level, as closed smooth loops (marching squares, then Chaikin's corner cutting).
// The live annotations draw stretches of the world with them (docs/annotations.md): water too warm, ice, light,
// stone, where a species or a crowd lies; organic shapes that follow what they mark rather than a grid's squares.
// Pure.

/**
 * The loops where field f (nx × ny values, row by row, a point each) crosses `level`, in the field's own coordinates
 * (x across, y down, a unit a point). Points outside the field count as below the level, so every loop closes.
 * Inside is where f >= level. Returns [[x, y], ...] loops.
 */
export function contours(f, nx, ny, level) {
  // (the field padded with a ring below the level, so no loop runs off its edge)
  const W = nx + 2, H = ny + 2, at = (i, j) => (i < 1 || j < 1 || i > nx || j > ny ? -Infinity : f[(j - 1) * nx + (i - 1)]);
  // an edge's crossing: horizontal edges (i, j)-(i+1, j) id 2(jW+i), vertical (i, j)-(i, j+1) id 2(jW+i)+1
  const point = new Map();
  const cross = (id) => {
    let p = point.get(id);
    if (p) return p;
    const h = id % 2 === 0, k = id >> 1, i = k % W, j = Math.floor(k / W);
    const a = at(i, j), b = h ? at(i + 1, j) : at(i, j + 1);
    const t = a === -Infinity ? 1 - 1e-3 : b === -Infinity ? 1e-3 : (level - a) / (b - a);
    p = h ? [i + t - 1, j - 1] : [i - 1, j + t - 1];
    point.set(id, p);
    return p;
  };
  // each square's segments, as pairs of edge ids, oriented so the inside lies to their left
  const next = new Map();
  const seg = (a, b) => next.set(a, b);
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const v0 = at(i, j), v1 = at(i + 1, j), v2 = at(i + 1, j + 1), v3 = at(i, j + 1);
    const c = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const T = 2 * (j * W + i), R = 2 * (j * W + i + 1) + 1, B = 2 * ((j + 1) * W + i), L = 2 * (j * W + i) + 1;
    switch (c) {
      case 1: seg(L, T); break;
      case 2: seg(T, R); break;
      case 3: seg(L, R); break;
      case 4: seg(R, B); break;
      case 5: { const mid = (v0 + v1 + v2 + v3) / 4; if (mid >= level) { seg(L, B); seg(R, T); } else { seg(L, T); seg(R, B); } break; }
      case 6: seg(T, B); break;
      case 7: seg(L, B); break;
      case 8: seg(B, L); break;
      case 9: seg(B, T); break;
      case 10: { const mid = (v0 + v1 + v2 + v3) / 4; if (mid >= level) { seg(T, L); seg(B, R); } else { seg(T, R); seg(B, L); } break; }
      case 11: seg(B, R); break;
      case 12: seg(R, L); break;
      case 13: seg(R, T); break;
      case 14: seg(T, L); break;
    }
  }
  // walked into loops
  const loops = [];
  for (const start of [...next.keys()]) {
    if (!next.has(start)) continue;
    const loop = [];
    let e = start;
    while (next.has(e)) { const n = next.get(e); next.delete(e); loop.push(cross(e)); e = n; }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** A closed loop rounded by Chaikin's corner cutting, `n` times. */
export function smooth(loop, n = 2) {
  let p = loop;
  for (let k = 0; k < n; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    p = q;
  }
  return p;
}

/** A loop's area (positive when it runs anticlockwise in x-right, y-down coordinates: around an inside). */
export function area(loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
