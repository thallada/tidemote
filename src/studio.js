// A mini-card's portrait drawn alone (docs/hand.md): a species' cells laid out still, as its body holds them (by its
// bonds) or, unbonded, a few side by side, framed to fill what a card shows of its portrait, as records the engine
// draws as it draws a body in the water (setStudio: struct Particle, vsStudio). Pure.
import { FIRST_LIFE } from './shaders.js';

// what a mini-card shows of its portrait (a plate's middle band, as page.css crops it): its share across and down
export const SHOWN = [0.6, 0.38];

// a bond's two cells lie a little closer than touching, as the water holds them (a bud's gap); none closer than this
const BOND = 0.95, APART = 0.9;

/** The bonds among cells [{ partners }] (either way round, each once): [[i, j]], i < j. */
export function bondsOf(cells) {
  const seen = new Set(), out = [];
  cells.forEach((c, i) => { for (const j of c.partners) if (j !== i && j >= 0 && j < cells.length) { const a = Math.min(i, j), b = Math.max(i, j); if (!seen.has(a * 4096 + b)) { seen.add(a * 4096 + b); out.push([a, b]); } } });
  return out;
}

const hash = (i) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * Where each cell lies: cells [{ r (its radius), partners (the indices of the cells it is bonded to) }] -> [[x, y]].
 * Bonded cells sit at their bond's length from their partners, and no two cells overlap much (relaxed from a
 * sunflower spiral, so the same cells always come out the same).
 */
export function layOut(cells) {
  const n = cells.length;
  const rMax = Math.max(...cells.map((c) => c.r));
  const pos = cells.map((c, k) => { const a = k * 2.39996, d = 2.1 * rMax * Math.sqrt(k); return [Math.cos(a) * d, Math.sin(a) * d]; });
  const bonds = bondsOf(cells);
  for (let it = 0; it < 160; it++) {
    // bonds pull their two cells to touching (more gently late, so it settles)
    const k = it < 120 ? 0.5 : 0.25;
    for (const [i, j] of bonds) {
      const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1], d = Math.hypot(dx, dy) || 1e-6;
      const f = (k * (d - BOND * (cells[i].r + cells[j].r))) / d / 2;
      pos[i][0] += dx * f; pos[i][1] += dy * f; pos[j][0] -= dx * f; pos[j][1] -= dy * f;
    }
    // and nothing overlaps
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1], d = Math.hypot(dx, dy) || 1e-6, m = APART * (cells[i].r + cells[j].r);
      if (d >= m) continue;
      const f = (m - d) / d / 2;
      pos[i][0] -= dx * f; pos[i][1] -= dy * f; pos[j][0] += dx * f; pos[j][1] += dy * f;
    }
  }
  return pos;
}

/**
 * The frame that fits cells at pos (radii r) into what a card shows of a size-pixel portrait: { cx, cy, ppu }
 * (its middle, in the same units as pos, and pixels to the unit), a little room at the edges.
 */
export function frameCells(pos, r, size) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  pos.forEach(([x, y], i) => { x0 = Math.min(x0, x - r[i]); x1 = Math.max(x1, x + r[i]); y0 = Math.min(y0, y - r[i]); y1 = Math.max(y1, y + r[i]); });
  const w = (x1 - x0) * 1.2, h = (y1 - y0) * 1.2;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ppu: Math.min((SHOWN[0] * size) / w, (SHOWN[1] * size) / h) };
}

/**
 * The records for the engine: cells [{ e, a, col, info, partners }] at pos (offset by at, world units), each still,
 * a bonded cell facing away from its first partner (as a body's cells face along it), a free one its own way: a
 * Float32Array of 10 words each (struct Particle), the genome the engine has at FIRST_LIFE, and in id the indices of
 * up to three cells it is bonded to, either way round (10 bits each, 1023 none).
 */
export function records(cells, pos, at) {
  const f = new Float32Array(cells.length * 10), u = new Uint32Array(f.buffer);
  const near = cells.map(() => []);
  for (const [i, j] of bondsOf(cells)) { near[i].push(j); near[j].push(i); }
  cells.forEach((c, i) => {
    const o = i * 10, m = near[i][0];
    // (a heading but no speed to speak of: a still cell)
    let th = 2 * Math.PI * hash(i * 7919 + 13);
    if (m != null) th = Math.atan2(pos[i][1] - pos[m][1], pos[i][0] - pos[m][0]);
    f[o] = at[0] + pos[i][0]; f[o + 1] = at[1] + pos[i][1]; f[o + 2] = Math.cos(th) * 1e-5; f[o + 3] = Math.sin(th) * 1e-5;
    u[o + 4] = FIRST_LIFE; f[o + 5] = c.e; f[o + 6] = c.a; u[o + 8] = c.col; u[o + 9] = c.info;
    u[o + 7] = [0, 1, 2].reduce((id, k) => id | ((near[i][k] ?? 1023) << (10 * k)), 0) >>> 0;
  });
  return f;
}
