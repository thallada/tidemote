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
// matter emblems: husk ring, glint spark, stone/silt chip, framboid (a raspberry of crystals)
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
  else g.fill(new Path2D('M-.7,-.5 L.2,-.8 L.8,-.2 L.5,.6 L-.5,.8 L-.9,.1 Z'));
  g.restore();
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
