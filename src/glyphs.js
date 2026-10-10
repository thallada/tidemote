// Small polygonal emblems for a cell shape family (cellShape) and for matter; the live
// specimen view shows the actual individual.
import { cssCol } from './fmt.js';

export const OUTLINES = [
  'M-.8,-.3 L-.4,-.8 L.2,-.7 L.7,-.3 L.6,.4 L.1,.9 L-.6,.6 Z',
  'M-.9,-.4 L-.3,-.3 L-.2,-.9 L.1,-.3 L.8,-.6 L.4,-.1 L.9,.3 L.3,.3 L.1,.9 L-.2,.3 L-.8,.6 L-.4,0 Z',
  'M-.3,-.8 L0,-.5 L.2,-.1 L.9,.1 L.6,.4 L.1,.3 L-.4,.9 L-.5,.6 L-.2,.1 L-.5,-.4 Z',
  'M-.1,0 L-.3,-.8 L-.6,-.5 L-.9,-.6 L-.8,0 L-.9,.4 L-.4,.7 L-.1,.1 L.1,.1 L.4,.8 L.7,.5 L.9,.6 L.8,0 L.9,-.3 L.3,-.7 L.1,0 Z',
  'M-.6,-.2 L-.3,-.6 L-.1,-1 L.2,-.5 L.5,-.3 L.5,.2 L.7,.8 L.2,.5 L-.1,.9 L-.2,.3 L-.6,.2 Z',
  'M-1,.1 L-.4,-.5 L.1,-.3 L.5,-.4 L1,-.1 L.5,.3 L0,.2 L-.5,.4 Z',
  'M-.9,-.2 L-.6,-.5 L.2,-.5 L.8,-.2 L.9,.2 L.5,.4 L.2,.1 L-.2,.5 L-.7,.3 Z',
  'M-.7,0 L-.5,-.5 L0,-.7 L.5,-.5 L.8,0 L.6,.5 L.2,.6 L0,.3 L-.4,.5 Z',
  'M-.8,-.3 L-.4,-.8 L.4,-.6 L.8,-.1 L.7,.6 L0,.8 L-.6,.5 Z M-.1,-.3 L.4,-.3 L.5,.2 L.2,.5 L-.1,.2 Z',
  'M-.9,.3 L-.7,0 L-.2,-.1 L.3,-.8 L.8,-.6 L.6,0 L.8,.7 L.2,.5 L-.2,.1 L-.6,.2 Z',
  'M-1,-.1 L-.8,-.4 L-.4,-.3 L-.2,-.5 L.1,-.4 L.3,-.1 L.7,-.3 L1,0 L.8,.4 L.5,.3 L.2,.2 L-.1,.4 L-.4,.2 L-.7,.3 Z',
  'M-1,.2 L-.3,-.6 L.1,-.4 L.9,-.2 L.4,.3 L-.2,.7 Z',
];
// matter emblems: husk ring, glint spark, stone/silt chip, framboid (a raspberry of crystals); shapes
// 16 + k are the kinds of stone grain (STONE_KINDS in shaders.js)
export const MATTER_GLYPH = [[14, 0xff796056], [13, 0xffffe6b9], [12, 0xff47628a], [14, 0xff9faeb8], [15, 0xff73b3cc]];

export function paintGlyph(g, size, shape, col) {
  const c = cssCol(col);
  const R = size * 0.36;
  g.clearRect(0, 0, size, size);
  g.save();
  g.fillStyle = c; g.strokeStyle = c;
  g.shadowColor = c; g.shadowBlur = size * 0.16;
  g.translate(size / 2, size / 2); g.scale(R, R);
  if (shape < 12) g.fill(new Path2D(OUTLINES[shape]), 'evenodd');
  else if (shape === 12) { g.lineWidth = 0.22; g.beginPath(); g.ellipse(0, 0, 0.65, 0.5, 0.4, 0, Math.PI * 2); g.stroke(); }
  else if (shape === 13) g.fill(new Path2D('M0,-1 L.15,-.15 L1,0 L.15,.15 L0,1 L-.15,.15 L-1,0 L-.15,-.15 Z'));
  else if (shape === 15) {
    g.beginPath();
    for (const [x, y] of [[0, 0], [0.5, 0], [-0.5, 0], [0.25, 0.43], [-0.25, 0.43], [0.25, -0.43], [-0.25, -0.43]]) { g.moveTo(x + 0.22, y); g.arc(x, y, 0.22, 0, Math.PI * 2); }
    g.fill();
  }
  else if (shape >= 16) stoneGlyph(g, shape - 16);
  else g.fill(new Path2D('M-.7,-.5 L.2,-.8 L.8,-.2 L.5,.6 L-.5,.8 L-.9,.1 Z'));
  g.restore();
}

// A kind of stone grain, simplified: built of pieces (facets, slabs, chambers, ribs) parted by thin
// sutures, each shaded by how it faces the light (from the upper left), as the grain is drawn.
const LIGHT = [-0.6, -0.8];
const ring = (pts) => `M${pts.map(([x, y]) => `${x},${y}`).join(' L')} Z`;
const disc = (x, y, r) => `M${x + r},${y} A${r},${r} 0 1,1 ${x - r},${y} A${r},${r} 0 1,1 ${x + r},${y} Z`;
// the facets of a crystal seen from above: each edge of its outline sloping up to the matching edge of a
// smaller top face; shaded by the edge's outward normal
const facets = (out, top) => [...out.map((a, i) => {
  const b = out[(i + 1) % out.length];
  const n = [b[1] - a[1], a[0] - b[0]], l = Math.hypot(...n);
  return [ring([a, b, top[(i + 1) % out.length], top[i]]), 0.9 * (n[0] * LIGHT[0] + n[1] * LIGHT[1]) / l];
}), [ring(top), 0.25]];
const QUARTZ = [[-0.72, -0.38], [-0.1, -0.86], [0.66, -0.5], [0.82, 0.2], [0.2, 0.82], [-0.62, 0.6]];
const GRAIN = [
  facets(QUARTZ, QUARTZ.map(([x, y]) => [0.42 * x + 0.04, 0.42 * y - 0.06])), // quartz
  [ // feldspar: a block seen at an angle, its top lit, its sides stepped along the cleavage
    [ring([[-0.8, -0.28], [0.3, -0.62], [0.86, -0.34], [-0.24, 0.0]]), 0.45],
    [ring([[-0.8, -0.28], [-0.24, 0.0], [-0.24, 0.28], [-0.8, 0.0]]), -0.35],
    [ring([[-0.8, 0.0], [-0.24, 0.28], [-0.24, 0.62], [-0.8, 0.32]]), -0.5],
    [ring([[-0.24, 0.0], [0.86, -0.34], [0.86, -0.02], [-0.24, 0.3]]), 0.0],
    [ring([[-0.24, 0.3], [0.86, -0.02], [0.86, 0.32], [-0.24, 0.62]]), -0.15],
  ],
  [ // hornblende: a long prism, three faces of its six showing
    [ring([[-0.95, -0.05], [-0.62, -0.4], [0.62, -0.4], [0.95, -0.05]]), 0.55],
    [ring([[-0.95, -0.05], [0.95, -0.05], [0.75, 0.16], [-0.75, 0.16]]), 0.0],
    [ring([[-0.75, 0.16], [0.75, 0.16], [0.6, 0.38], [-0.6, 0.38]]), -0.5],
  ],
  null, // sand: a worn oval, shaded round (below)
  null, // foraminifer: chambers (below)
  null, // diatom: a pored disc with a rim (below)
  [ // shell fragment: a fan of ribs from its hinge, alternately lit
    ...[-3, -2, -1, 0, 1, 2].map((i) => {
      const a0 = -Math.PI / 2 + i * 0.36, a1 = a0 + 0.36;
      return [`M0,0.82 L${(0.92 * Math.cos(a0)).toFixed(3)},${(0.82 + 1.5 * Math.sin(a0)).toFixed(3)} L${(0.92 * Math.cos(a1)).toFixed(3)},${(0.82 + 1.5 * Math.sin(a1)).toFixed(3)} Z`, i % 2 ? 0.3 : -0.15];
    }),
  ],
  [['M-1,0.16 Q0,-0.44 1,-0.16 Q0,-0.06 -1,0.16 Z', 0.35], ['M-1,0.16 Q0,-0.06 1,-0.16 Q0,0.36 -1,0.16 Z', -0.4]], // sponge spicule: a rod, lit above
];
// a foraminifer's chambers, each larger than the last on a log spiral, fitted to the emblem
const FORAM = (() => {
  const cs = Array.from({ length: 10 }, (_, i) => { const r = 0.1 * Math.exp(0.19 * i), a = i * 0.8; return [Math.cos(a) * r, Math.sin(a) * r, r * 0.62]; });
  const lo = [0, 1].map((d) => Math.min(...cs.map((c) => c[d] - c[2]))), hi = [0, 1].map((d) => Math.max(...cs.map((c) => c[d] + c[2])));
  const k = 1.7 / Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  return cs.map(([x, y, r]) => [(x - (lo[0] + hi[0]) / 2) * k, (y - (lo[1] + hi[1]) / 2) * k, r * k]);
})();
function stoneGlyph(g, k) {
  const glow = g.shadowBlur;
  // a piece: parted from what lies under it by a thin suture, filled, then lit or shaded
  const piece = (d, tone = 0, cut = true) => {
    const p = new Path2D(d);
    g.shadowBlur = 0;
    if (cut) { g.globalCompositeOperation = 'destination-out'; g.stroke(p); }
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = glow;
    g.fill(p);
    shade(p, tone);
  };
  const shade = (p, tone) => {
    if (!tone) return;
    g.save();
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tone > 0 ? `rgba(255,255,255,${0.4 * tone})` : `rgba(0,0,0,${-0.55 * tone})`;
    g.fill(p);
    g.restore();
  };
  // rounded: lit toward the light, dark away from it
  const round = (d) => {
    g.save();
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createRadialGradient(-0.35, -0.35, 0.05, 0, 0, 1);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = gr;
    g.fill(new Path2D(d));
    g.restore();
  };
  g.lineWidth = 0.08;
  if (k === 3) {
    const d = 'M0.8,0 A0.8,0.6 0 1,1 -0.8,0 A0.8,0.6 0 1,1 0.8,0 Z';
    piece(d, 0, false); round(d);
  } else if (k === 4) {
    FORAM.forEach(([x, y, r], i) => { const d = disc(x, y, r); piece(d, 0, i > 0); round(d); });
  } else if (k === 5) {
    piece(disc(0, 0, 0.82), 0, false); round(disc(0, 0, 0.82));
    g.globalCompositeOperation = 'destination-out';
    g.shadowBlur = 0;
    g.lineWidth = 0.05;
    g.stroke(new Path2D(disc(0, 0, 0.66)));
    const pores = new Path2D();
    for (let i = 0; i < 12; i++) for (const r of [0.3, 0.5]) { const a = i * Math.PI / 6 + r * 1.5, x = Math.cos(a) * r, y = Math.sin(a) * r, q = 0.035 + r * 0.03; pores.moveTo(x + q, y); pores.arc(x, y, q, 0, Math.PI * 2); }
    g.fill(pores);
    g.globalCompositeOperation = 'source-over';
  } else {
    GRAIN[k].forEach(([d, tone], i) => piece(d, tone, i > 0));
  }
}

const urls = new Map();
let scratch = null;
export function glyphURL(shape, col) {
  const k = `${shape}:${col}`;
  let u = urls.get(k);
  if (u) return u;
  scratch = scratch || document.createElement('canvas');
  scratch.width = scratch.height = 52;
  paintGlyph(scratch.getContext('2d'), 52, shape, col);
  u = scratch.toDataURL();
  if (urls.size > 600) urls.clear();
  urls.set(k, u);
  return u;
}
