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

// A kind of stone grain, simplified: its silhouette, with its telling detail cut out of it.
const GRAIN = [
  ['M-.7,-.4 L-.1,-.85 L.65,-.5 L.8,.2 L.2,.8 L-.6,.6 Z', 'M-.25,-.35 L.3,-.3 L.35,.2 L-.15,.3 Z M-.25,-.35 L-.7,-.4 M.3,-.3 L.65,-.5 M.35,.2 L.8,.2 M-.15,.3 L-.6,.6'], // quartz: facets
  ['M-.8,-.45 L.6,-.62 L.85,-.35 L.85,.35 L-.7,.55 Z', 'M-.75,-.1 L.85,-.28 M-.72,.24 L.85,.06'], // feldspar: cleavage steps
  ['M-.95,0 L-.6,-.38 L.6,-.38 L.95,0 L.6,.38 L-.6,.38 Z', 'M-.95,0 L.95,0'], // hornblende: a prism's ridge
  ['M.8,0 A.8,.6 0 1,1 -.8,0 A.8,.6 0 1,1 .8,0 Z', ''], // sand: a worn oval
  [null, null], // foraminifer: coiled chambers (drawn below)
  ['M.8,0 A.8,.8 0 1,1 -.8,0 A.8,.8 0 1,1 .8,0 Z', null], // diatom: a pored disc (pores below)
  ['M0,.85 L-.85,-.3 Q0,-1 .85,-.3 Z', 'M0,.85 L-.45,-.6 M0,.85 L0,-.66 M0,.85 L.45,-.6 M-.55,-.05 Q0,-.4 .55,-.05'], // shell: ribs and a growth line
  ['M-1,.14 Q0,-.38 1,-.14 Q0,.3 -1,.14 Z', 'M-.7,.07 Q0,-.12 .7,-.06'], // spicule: a needle and its canal
];
// a foraminifer's chambers, each larger than the last on a log spiral, fitted to the emblem
const FORAM = (() => {
  const cs = Array.from({ length: 10 }, (_, i) => { const r = 0.1 * Math.exp(0.19 * i), a = i * 0.8; return [Math.cos(a) * r, Math.sin(a) * r, r * 0.62]; });
  const lo = [0, 1].map((d) => Math.min(...cs.map((c) => c[d] - c[2]))), hi = [0, 1].map((d) => Math.max(...cs.map((c) => c[d] + c[2])));
  const k = 1.7 / Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  return cs.map(([x, y, r]) => [(x - (lo[0] + hi[0]) / 2) * k, (y - (lo[1] + hi[1]) / 2) * k, r * k]);
})();
function stoneGlyph(g, k) {
  const [body, cuts] = GRAIN[k];
  const circles = (cs) => { const p = new Path2D(); for (const [x, y, r] of cs) { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); } return p; };
  g.lineWidth = 0.1;
  if (k === 4) {
    // oldest first, each newer chamber parting from the older ones it covers by a thin suture
    for (const [i, c] of FORAM.entries()) {
      if (i) { g.globalCompositeOperation = 'destination-out'; g.stroke(circles([c])); g.globalCompositeOperation = 'source-over'; }
      g.fill(circles([c]));
    }
    return;
  }
  g.fill(new Path2D(body));
  g.globalCompositeOperation = 'destination-out';
  g.shadowBlur = 0;
  if (k === 5) g.fill(circles(Array.from({ length: 10 }, (_, i) => [Math.cos(i * 0.628) * 0.52, Math.sin(i * 0.628) * 0.52, 0.09]).concat([[0, 0, 0.14]])));
  else if (cuts) g.stroke(new Path2D(cuts));
  g.globalCompositeOperation = 'source-over';
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
