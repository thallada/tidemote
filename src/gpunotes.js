// The live annotations drawn by WebGPU, into the world's own frame (docs/annotations.md, What it costs). noteview.js
// draws on a CanvasRenderingContext2D; this is a stand-in for the part of one it uses, recording each frame's drawing
// as instanced quads and triangles that encode() draws over the composite, in one render pass:
// - strokes: a capsule a segment (its distance worked out per pixel: antialiased, round-joined), a whole circle one ring
//   and an axis-aligned rectangle one frame (its corners mitred, as a canvas's), arcs flattened, dashes cut on the CPU;
//   a stroke's own segments never blend twice where they overlap (each stroke its own depth: a later fragment of the
//   same stroke fails the test);
// - fills: an axis-aligned rectangle as one quad; a convex shape as triangles; anything else even-odd by
//   stencil-then-cover (its fan inverts the stencil, its box covers what is odd and clears it); the hatch worked out
//   in the shader;
// - text: glyphs from an atlas each rasterized once by the browser, its fill and its halo (the 3 px stroke noteview's
//   text() puts under it) in two channels, laid out by the browser's own measures (kerning and letter spacing as on a
//   canvas), placed on whole pixels;
// - clips: noteview's are rectangles and circles (the open world less its panels, the loupe in or out), kept as such
//   and tested per pixel.
// Until then the overlay was a 2D canvas the browser rasterized afresh every frame on its GPU process's main thread,
// which runs WebGPU's commands too: a 2M world held still at 87 pixels a unit, annotations on, kept that thread busy
// 963 ms a second (179 with them off) and ran at 37-49 fps (runs/perf/fps20).

const INST_W = 12; // words an instance: a (4), b (4), color, kind, clip, z
const TRI_W = 4; // words a triangle's vertex: x, y, color, clip
const TAU = Math.PI * 2;
const K_SEG = 0, K_GLYPH = 1, K_RECT = 2, K_HATCH = 3, K_RING = 4, K_COVER = 5, K_FRAME = 6;

const WGSL = /* wgsl */ ` // i18n-ignore (WGSL)
struct U { size: vec2f, _p: vec2f }
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> clipBuf: array<f32>;
@group(0) @binding(2) var atlas: texture_2d<f32>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) p: vec2f,
  @location(1) @interpolate(flat) a: vec4f,
  @location(2) @interpolate(flat) b: vec4f,
  @location(3) @interpolate(flat) col: vec4f,
  @location(4) @interpolate(flat) kc: vec2u,
  @location(5) uv: vec2f,
}

// the share of the pixel about p an axis-aligned rectangle (x0, y0, x1, y1) covers, exactly
fn covRect(p: vec2f, r: vec4f) -> f32 {
  let x = clamp(min(p.x + 0.5, r.z) - max(p.x - 0.5, r.x), 0.0, 1.0);
  let y = clamp(min(p.y + 0.5, r.w) - max(p.y - 0.5, r.y), 0.0, 1.0);
  return x * y;
}

fn ndc(p: vec2f, z: f32) -> vec4f { return vec4f(p.x / u.size.x * 2.0 - 1.0, 1.0 - p.y / u.size.y * 2.0, z, 1.0); }

// inside every clip of the set at word c - 1 (0: none): each a list of rectangles and circles, inside when an odd
// number of them hold the point
fn clipCov(p: vec2f, c: u32) -> f32 {
  if (c == 0u) { return 1.0; }
  var o = c - 1u;
  let n = u32(clipBuf[o]);
  o = o + 1u;
  var cov = 1.0;
  for (var l = 0u; l < n; l = l + 1u) {
    let cnt = u32(clipBuf[o]);
    o = o + 1u;
    var inside = false;
    for (var i = 0u; i < cnt; i = i + 1u) {
      let k = clipBuf[o];
      let a = vec4f(clipBuf[o + 1u], clipBuf[o + 2u], clipBuf[o + 3u], clipBuf[o + 4u]);
      o = o + 5u;
      var hit = false;
      if (k < 0.5) { hit = p.x >= a.x && p.y >= a.y && p.x < a.z && p.y < a.w; } else { hit = distance(p, a.xy) < a.z; }
      if (hit) { inside = !inside; }
    }
    if (!inside) { cov = 0.0; }
  }
  return cov;
}

@vertex fn vsInst(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f, @location(2) col: u32,
    @location(3) kind: u32, @location(4) clip: u32, @location(5) z: f32) -> VO {
  var C = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1), vec2f(0, 1));
  let c = C[vi];
  var o: VO;
  var p: vec2f;
  if (kind == ${K_RING}u) {
    let e = a.z + a.w + 1.0;
    p = a.xy + (c * 2.0 - 1.0) * e;
  } else if (kind == ${K_SEG}u) {
    let d = a.zw - a.xy;
    let len = length(d);
    let dir = select(vec2f(1, 0), d / max(len, 1e-6), len > 1e-6);
    let nrm = vec2f(-dir.y, dir.x);
    let e = b.x + 1.0;
    p = a.xy + dir * (-e + c.x * (len + 2.0 * e)) + nrm * (-e + c.y * 2.0 * e);
  } else if (kind == ${K_RECT}u || kind == ${K_FRAME}u) {
    // (a pixel more about it, for its soft edge)
    p = mix(a.xy - 1.0, a.zw + 1.0, c);
  } else {
    p = mix(a.xy, a.zw, c);
    o.uv = b.xy + c * (a.zw - a.xy);
  }
  o.pos = ndc(p, z);
  o.p = p;
  o.a = a;
  o.b = b;
  o.col = unpack4x8unorm(col);
  o.kc = vec2u(kind, clip);
  return o;
}

struct FO { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 }
@fragment fn fsInst(in: VO) -> FO {
  var cov = clipCov(in.p, in.kc.y);
  // (a stroke's depth: its own where it covers the pixel whole, under it on its soft edge by how little it covers, so a
  // later segment of the same stroke that covers a pixel more still draws over an earlier one's edge, and nothing draws
  // twice over its whole: a thin line is all edge, and the first segment to reach a joint held it at its own share)
  var under = 0.0;
  let kind = in.kc.x;
  if (kind == ${K_SEG}u) {
    let pa = in.p - in.a.xy;
    let ba = in.a.zw - in.a.xy;
    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    let d = length(pa - ba * h);
    let s = clamp(in.b.x - d + 0.5, 0.0, 1.0);
    if (s <= 0.0) { discard; }
    under = 1.0 - s;
    cov = cov * s;
  } else if (kind == ${K_RING}u) {
    // a circle stroked: its distance from the circle; dashed by the length along it from angle 0 (where a canvas's arc
    // begins it), b.xy the dash's on and off
    let q = in.p - in.a.xy;
    let s = clamp(in.a.w - abs(length(q) - in.a.z) + 0.5, 0.0, 1.0);
    if (s <= 0.0) { discard; }
    if (in.b.x > 0.0) {
      var an = atan2(q.y, q.x);
      if (an < 0.0) { an = an + 6.2831853; }
      let L = an * in.a.z;
      let P = in.b.x + in.b.y;
      if (L - P * floor(L / P) >= in.b.x) { discard; }
    }
    under = 1.0 - s;
    cov = cov * s;
  } else if (kind == ${K_RECT}u) {
    cov = cov * covRect(in.p, in.a);
  } else if (kind == ${K_FRAME}u) {
    // a rectangle stroked with mitred corners, as a canvas strokes one: its outer edge's cover less its inner's
    let w = in.b.x;
    let hollow = in.a.z - in.a.x > 2.0 * w && in.a.w - in.a.y > 2.0 * w;
    let s = covRect(in.p, in.a) - select(0.0, covRect(in.p, in.a + vec4f(w, w, -w, -w)), hollow);
    if (s <= 0.0) { discard; }
    under = 1.0 - s;
    cov = cov * s;
  } else if (kind == ${K_GLYPH}u) {
    let t = textureLoad(atlas, vec2i(floor(in.uv)), 0);
    cov = cov * select(t.r, t.g, in.b.z > 0.5);
  } else if (kind == ${K_HATCH}u) {
    // lines x + y = 0 (mod 6) of a 6-unit tile, 1 of it wide, about its origin and at its scale (b.z px a unit)
    let q = (in.p - in.b.xy) / in.b.z;
    let m = (q.x + q.y) - 6.0 * floor((q.x + q.y) / 6.0);
    let dist = min(m, 6.0 - m) * 0.70710678 * in.b.z;
    cov = cov * 0.7 * clamp(0.5 * in.b.z - dist + 0.5, 0.0, 1.0);
  }
  let a = in.col.a * cov;
  var o: FO;
  o.color = vec4f(in.col.rgb * a, a);
  o.depth = in.pos.z - under * ${0.5 / 262144};
  return o;
}

struct TO { @builtin(position) pos: vec4f, @location(0) p: vec2f, @location(1) @interpolate(flat) col: vec4f, @location(2) @interpolate(flat) clip: u32 }
@vertex fn vsTri(@location(0) p: vec2f, @location(1) col: u32, @location(2) clip: u32) -> TO {
  var o: TO;
  o.pos = ndc(p, 0.0);
  o.p = p;
  o.col = unpack4x8unorm(col);
  o.clip = clip;
  return o;
}
@fragment fn fsTri(in: TO) -> @location(0) vec4f {
  let a = in.col.a * clipCov(in.p, in.clip);
  return vec4f(in.col.rgb * a, a);
}
`;

// a CSS color as RGBA8 words (r in the low byte), straight alpha
const colors = new Map();
function parseColor(s) {
  let c = colors.get(s);
  if (c !== undefined) return c;
  let r = 0, g = 0, b = 0, a = 1;
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) { const v = m[1].split(',').map(Number); [r, g, b] = v; a = v.length > 3 ? v[3] : 1; }
  else if (s[0] === '#') {
    const h = s.length === 4 ? s.slice(1).split('').map((x) => x + x).join('') : s.slice(1, 7);
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  }
  c = [r, g, b, a];
  if (colors.size > 2000) colors.clear();
  colors.set(s, c);
  return c;
}

// A path as noteview builds one: subpaths of points, each closed or not, a circle or a rectangle kept as such
class GPath {
  constructor(xf = null) { this.subs = []; this.cur = null; this.xf = xf; }
  _pt(x, y) { const m = this.xf; return m ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] : [x, y]; }
  _scale() { const m = this.xf; return m ? Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : 1; }
  moveTo(x, y) { const [px, py] = this._pt(x, y); this.cur = { pts: [px, py], closed: false, circle: null, rect: false }; this.subs.push(this.cur); }
  lineTo(x, y) { if (!this.cur) return this.moveTo(x, y); const [px, py] = this._pt(x, y); this.cur.pts.push(px, py); this.cur.circle = null; this.cur.rect = false; }
  closePath() { if (this.cur) { this.cur.closed = true; const p = this.cur.pts; this.cur = { pts: [p[0], p[1]], closed: false, circle: null, rect: false }; this.subs.push(this.cur); } }
  rect(x, y, w, h) {
    this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h);
    this.cur.closed = true; this.cur.rect = true;
    this.cur = null;
  }
  arc(x, y, r, a0, a1, ccw = false) {
    let sweep = a1 - a0;
    if (!ccw) { if (sweep >= TAU) sweep = TAU; else { sweep %= TAU; if (sweep < 0) sweep += TAU; } }
    else { if (-sweep >= TAU) sweep = -TAU; else { sweep %= TAU; if (sweep > 0) sweep -= TAU; } }
    const sx = x + r * Math.cos(a0), sy = y + r * Math.sin(a0);
    const [psx, psy] = this._pt(sx, sy), c = this.cur;
    // (a full circle begun where the subpath was just moved to: kept as a circle, for clips)
    const fresh = c && c.pts.length === 2 && Math.abs(c.pts[0] - psx) < 1e-3 && Math.abs(c.pts[1] - psy) < 1e-3;
    if (!c) this.moveTo(sx, sy); else if (!fresh) this.lineTo(sx, sy);
    const n = Math.max(6, Math.min(256, Math.ceil((Math.abs(sweep) * r * this._scale()) / 2)));
    for (let i = 1; i <= n; i++) { const a = a0 + (sweep * i) / n, [px, py] = this._pt(x + r * Math.cos(a), y + r * Math.sin(a)); this.cur.pts.push(px, py); }
    this.cur.rect = false;
    // (in the space its points are: a path drawn through a transform keeps them in device pixels)
    const [cx, cy] = this._pt(x, y);
    this.cur.circle = (fresh || !c) && Math.abs(sweep) >= TAU - 1e-6 ? { x: cx, y: cy, r: r * this._scale() } : null;
    if (this.cur.circle) this.cur.closed = true;
  }
}

export class NoteCanvas {
  constructor(device, format) {
    this.device = device;
    this.format = format;
    // (canvases for measuring and rasterizing text; none under Node, where only the shapes are tested)
    const canvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : typeof document !== 'undefined' ? document.createElement('canvas') : null);
    this.mctx = canvas(8, 8)?.getContext('2d');
    this.gctx = canvas(64, 64)?.getContext('2d', { willReadFrequently: true });
    this.inst = new Float32Array(INST_W * 4096); this.instU = new Uint32Array(this.inst.buffer);
    this.tri = new Float32Array(TRI_W * 4096); this.triU = new Uint32Array(this.tri.buffer);
    this.clipData = new Float32Array(1024);
    this.layouts = new Map();
    this.glyphs = new Map();
    this.atlasSize = 2048;
    this._pipelines();
    this.begin(1);
    if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => { this.layouts.clear(); this._resetAtlas(); });
  }

  _pipelines() {
    const d = this.device, mod = d.createShaderModule({ code: WGSL, label: 'noteDraw' });
    this.bgl = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ] });
    const layout = d.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
    const blend = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
    const inst = { arrayStride: INST_W * 4, stepMode: 'instance', attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' },
      { shaderLocation: 2, offset: 32, format: 'uint32' }, { shaderLocation: 3, offset: 36, format: 'uint32' },
      { shaderLocation: 4, offset: 40, format: 'uint32' }, { shaderLocation: 5, offset: 44, format: 'float32' }] };
    const tri = { arrayStride: TRI_W * 4, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x2' }, { shaderLocation: 1, offset: 8, format: 'uint32' }, { shaderLocation: 2, offset: 12, format: 'uint32' }] };
    const keep = { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' };
    const ds = (o = {}) => ({ format: 'depth24plus-stencil8', depthWriteEnabled: !!o.depth, depthCompare: o.depth ? 'greater' : 'always',
      stencilFront: o.stencil || keep, stencilBack: o.stencil || keep, stencilReadMask: 0xff, stencilWriteMask: o.stencil ? 0xff : 0 });
    const make = (label, vs, fs, buf, o = {}) => d.createRenderPipeline({ label, layout,
      vertex: { module: mod, entryPoint: vs, buffers: [buf] },
      fragment: { module: mod, entryPoint: fs, targets: [{ format: this.format, blend, writeMask: o.noColor ? 0 : GPUColorWrite.ALL }] },
      primitive: { topology: 'triangle-list' }, depthStencil: ds(o) });
    this.pipes = {
      instPlain: make('noteInst', 'vsInst', 'fsInst', inst),
      instStroke: make('noteStroke', 'vsInst', 'fsInst', inst, { depth: true }),
      instCover: make('noteCover', 'vsInst', 'fsInst', inst, { stencil: { compare: 'not-equal', passOp: 'zero', failOp: 'keep', depthFailOp: 'keep' } }),
      triPlain: make('noteTri', 'vsTri', 'fsTri', tri),
      triFan: make('noteFan', 'vsTri', 'fsTri', tri, { noColor: true, stencil: { compare: 'always', passOp: 'invert', failOp: 'keep', depthFailOp: 'keep' } }),
    };
    this.ubuf = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.atlas = d.createTexture({ size: [this.atlasSize, this.atlasSize], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this._resetAtlas();
    this.bufs = { inst: null, tri: null, clip: null };
    this.bg = null;
  }

  _resetAtlas() { this.glyphs.clear(); this.shelf = { x: 0, y: 0, h: 0 }; }

  // ------------------------------------------------------------------ a frame's recording
  /** A new frame's drawing, at `scale` device pixels a CSS pixel (the overlay's transform). */
  begin(scale) {
    this.nInst = 0; this.nTri = 0; this.nClip = 0; this.cmds = [];
    this.strokes = 0;
    this.m = [scale, 0, 0, scale, 0, 0];
    this.base = scale;
    this.stack = [];
    this.clips = [];
    this.clipAt = 0; this.clipOf = null;
    this.path = new GPath(this.m);
    this.globalAlpha = 1; this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.lineJoin = 'miter';
    this.textAlign = 'start'; this.fontStretch = 'normal'; this.letterSpacing = '0px';
    this.font = '10px sans-serif'; // i18n-ignore (a canvas's default font)
    this.dash = [];
  }
  get count() { return this.cmds.length; }

  save() { this.stack.push({ m: this.m.slice(), clips: this.clips, globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth,
    lineJoin: this.lineJoin, textAlign: this.textAlign, font: this.font, fontStretch: this.fontStretch, letterSpacing: this.letterSpacing, dash: this.dash }); }
  restore() { const s = this.stack.pop(); if (!s) return; Object.assign(this, s); this.path.xf = this.m; }
  translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  rotate(t) { const m = this.m, c = Math.cos(t), s = Math.sin(t); this.m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, m[2] * c - m[0] * s, m[3] * c - m[1] * s, m[4], m[5]]; this.path.xf = this.m; }
  setLineDash(d) { this.dash = d && d.length ? d.slice() : []; }

  newPath() { return new GPath(); }
  beginPath() { this.path = new GPath(this.m); }
  moveTo(x, y) { this.path.moveTo(x, y); }
  lineTo(x, y) { this.path.lineTo(x, y); }
  closePath() { this.path.closePath(); }
  rect(x, y, w, h) { this.path.rect(x, y, w, h); }
  arc(x, y, r, a0, a1, ccw) { this.path.arc(x, y, r, a0, a1, ccw); }

  // a path's subpaths in device pixels: the current path's are already; a Path2D's taken through the transform now
  _subs(P) {
    if (!P || P === this.path) return this.path.subs;
    const m = this.m, k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    return P.subs.map((s) => {
      const pts = new Array(s.pts.length);
      for (let i = 0; i < s.pts.length; i += 2) { const x = s.pts[i], y = s.pts[i + 1]; pts[i] = m[0] * x + m[2] * y + m[4]; pts[i + 1] = m[1] * x + m[3] * y + m[5]; }
      return { pts, closed: s.closed, rect: s.rect, circle: s.circle && { x: m[0] * s.circle.x + m[2] * s.circle.y + m[4], y: m[1] * s.circle.x + m[3] * s.circle.y + m[5], r: s.circle.r * k } };
    });
  }

  // ------------------------------------------------------------------ emitting
  _cmd(p, first, buf) {
    const last = this.cmds[this.cmds.length - 1];
    // (a fill's fan is followed by its cover, so fans of two fills never run together)
    if (last && last.p === p && last.first + last.count === first) { last.count++; return; }
    this.cmds.push({ p, first, count: 1, buf });
  }
  _growInst() { const a = new Float32Array(this.inst.length * 2); a.set(this.inst); this.inst = a; this.instU = new Uint32Array(a.buffer); }
  _growTri() { const a = new Float32Array(this.tri.length * 2); a.set(this.tri); this.tri = a; this.triU = new Uint32Array(a.buffer); }
  _rgba(style, alpha = 1) {
    const [r, g, b, a] = parseColor(style), A = Math.round(Math.max(0, Math.min(1, a * this.globalAlpha * alpha)) * 255);
    return (r | (g << 8) | (b << 16) | (A << 24)) >>> 0;
  }
  // the clip set the next draws are under (written once each time the clips change), as a word offset + 1 (0: none)
  _clip() {
    if (!this.clips.length) return 0;
    if (this.clipOf === this.clips) return this.clipAt;
    let need = 1;
    for (const L of this.clips) need += 1 + L.length * 5;
    while (this.nClip + need > this.clipData.length) { const a = new Float32Array(this.clipData.length * 2); a.set(this.clipData); this.clipData = a; }
    const o = this.nClip, D = this.clipData;
    let w = o;
    D[w++] = this.clips.length;
    for (const L of this.clips) { D[w++] = L.length; for (const q of L) { D[w++] = q[0]; D[w++] = q[1]; D[w++] = q[2]; D[w++] = q[3]; D[w++] = q[4]; } }
    this.nClip = w;
    this.clipOf = this.clips; this.clipAt = o + 1;
    return this.clipAt;
  }
  _inst(p, kind, a0, a1, a2, a3, b0, b1, b2, b3, col, z = 0) {
    if ((this.nInst + 1) * INST_W > this.inst.length) this._growInst();
    const o = this.nInst * INST_W, F = this.inst, W = this.instU;
    F[o] = a0; F[o + 1] = a1; F[o + 2] = a2; F[o + 3] = a3; F[o + 4] = b0; F[o + 5] = b1; F[o + 6] = b2; F[o + 7] = b3;
    W[o + 8] = col; W[o + 9] = kind; W[o + 10] = this._clip(); F[o + 11] = z;
    this._cmd(p, this.nInst++, 'inst');
  }
  _triV(p, x, y, col, clip) {
    if ((this.nTri + 1) * TRI_W > this.tri.length) this._growTri();
    const o = this.nTri * TRI_W;
    this.tri[o] = x; this.tri[o + 1] = y; this.triU[o + 2] = col; this.triU[o + 3] = clip;
    this._cmd(p, this.nTri++, 'tri');
  }

  stroke(P) {
    const subs = this._subs(P), col = this._rgba(this.strokeStyle);
    if (!(col >>> 24)) return;
    const k = Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2])), hw = (this.lineWidth * k) / 2;
    const z = ++this.strokes / 262144;
    const dash = this.dash.length ? this.dash.map((x) => x * k) : null, dashSum = dash ? dash.reduce((a, b) => a + b, 0) : 0;
    for (const s of subs) {
      // (an axis-aligned rectangle, undashed: one frame, its corners mitred as a canvas's)
      if (s.rect && !dash && this._axisRect(s.pts)) { const r = this._bbox([s]); this._inst('instStroke', K_FRAME, r[0] - hw, r[1] - hw, r[2] + hw, r[3] + hw, 2 * hw, 0, 0, 0, col, z); continue; }
      // (a whole circle, undashed or dashed on and off: one ring, worked out per pixel)
      if (s.circle && (!dash || dash.length === 2)) { this._inst('instStroke', K_RING, s.circle.x, s.circle.y, s.circle.r, hw, dash ? dash[0] : 0, dash ? dash[1] : 0, 0, 0, col, z); continue; }
      const p = s.pts, n = p.length / 2;
      if (n < 2) continue;
      let di = 0, dleft = dash ? dash[0] : 0, on = true;
      const segs = s.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const x0 = p[2 * i], y0 = p[2 * i + 1], j = (i + 1) % n, x1 = p[2 * j], y1 = p[2 * j + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len < 1e-6) continue;
        if (!dash || dashSum <= 0) { this._inst('instStroke', K_SEG, x0, y0, x1, y1, hw, 0, 0, 0, col, z); continue; }
        // (the dash runs on along the subpath, cut where it turns off)
        let t = 0;
        while (t < len) {
          const step = Math.min(dleft, len - t);
          if (on && step > 0) { const u0 = t / len, u1 = (t + step) / len; this._inst('instStroke', K_SEG, x0 + (x1 - x0) * u0, y0 + (y1 - y0) * u0, x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1, hw, 0, 0, 0, col, z); }
          t += step; dleft -= step;
          if (dleft <= 1e-6) { di = (di + 1) % dash.length; dleft = dash[di]; on = !on; }
        }
      }
    }
  }

  fill(P) {
    if (typeof P === 'string') P = null;
    const subs = this._subs(P).filter((s) => s.pts.length >= 6);
    if (!subs.length) return;
    const st = this.fillStyle, hatch = typeof st === 'object' && st && st.hatch ? st : null;
    const col = this._rgba(hatch ? hatch.color : st);
    if (!(col >>> 24)) return;
    // one axis-aligned rectangle: a quad
    if (subs.length === 1 && subs[0].rect && this._axisRect(subs[0].pts)) {
      const r = this._bbox(subs);
      if (hatch) this._inst('instPlain', K_HATCH, r[0], r[1], r[2], r[3], hatch.x * this.base, hatch.y * this.base, (hatch.px / 6) * this.base, 0, col);
      else this._inst('instPlain', K_RECT, r[0], r[1], r[2], r[3], 0, 0, 0, 0, col);
      return;
    }
    // one convex shape, plainly colored: its triangles
    const clip = this._clip();
    if (!hatch && subs.length === 1 && this._convex(subs[0].pts)) {
      const p = subs[0].pts, n = p.length / 2;
      for (let i = 1; i < n - 1; i++) { this._triV('triPlain', p[0], p[1], col, clip); this._triV('triPlain', p[2 * i], p[2 * i + 1], col, clip); this._triV('triPlain', p[2 * i + 2], p[2 * i + 3], col, clip); }
      return;
    }
    // anything else even-odd: its fan into the stencil, then its box over what is odd
    for (const s of subs) {
      const p = s.pts, n = p.length / 2;
      for (let i = 1; i < n - 1; i++) { this._triV('triFan', p[0], p[1], 0, 0); this._triV('triFan', p[2 * i], p[2 * i + 1], 0, 0); this._triV('triFan', p[2 * i + 2], p[2 * i + 3], 0, 0); }
    }
    const r = this._bbox(subs);
    if (hatch) this._inst('instCover', K_HATCH, r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1, hatch.x * this.base, hatch.y * this.base, (hatch.px / 6) * this.base, 0, col);
    else this._inst('instCover', K_COVER, r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1, 0, 0, 0, 0, col);
  }
  _bbox(subs) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of subs) for (let i = 0; i < s.pts.length; i += 2) { const x = s.pts[i], y = s.pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
  }
  _axisRect(p) { return p.length === 8 && ((p[1] === p[3] && p[2] === p[4] && p[5] === p[7] && p[6] === p[0]) || (p[0] === p[2] && p[3] === p[5] && p[4] === p[6] && p[7] === p[1])); }
  _convex(p) {
    const n = p.length / 2;
    if (n < 3 || n > 300) return false;
    let sign = 0;
    for (let i = 0; i < n; i++) {
      const a = i, b = (i + 1) % n, c = (i + 2) % n;
      const cr = (p[2 * b] - p[2 * a]) * (p[2 * c + 1] - p[2 * b + 1]) - (p[2 * b + 1] - p[2 * a + 1]) * (p[2 * c] - p[2 * b]);
      if (Math.abs(cr) < 1e-9) continue;
      const sg = cr > 0 ? 1 : -1;
      if (sign && sg !== sign) return false;
      sign = sg;
    }
    return true;
  }
  fillRect(x, y, w, h) { const P = new GPath(); P.rect(x, y, w, h); this.fill(P); }
  strokeRect(x, y, w, h) { const P = new GPath(); P.rect(x, y, w, h); this.stroke(P); }

  clip(P) {
    if (typeof P === 'string') P = null;
    const L = [];
    for (const s of this._subs(P)) {
      if (s.circle) { L.push([1, s.circle.x, s.circle.y, s.circle.r, 0]); continue; }
      if (s.pts.length < 6) continue;
      const r = this._bbox([s]);
      L.push([0, r[0], r[1], r[2], r[3]]);
    }
    this.clips = [...this.clips, L];
  }

  // a fill style of hatching (noteview's zones): lines of a tone at 45°, through (x, y), a tile px on a side
  hatch(tone, x, y, px) { return { hatch: true, color: `rgba(${tone},0.55)`, x, y, px }; }

  // ------------------------------------------------------------------ text
  _font(ctx, k = 1) {
    const f = k === 1 ? this.font : this.font.replace(/([\d.]+)px/, (_, n) => `${+n * k}px`);
    if (ctx.font !== f) ctx.font = f;
    ctx.fontStretch = this.fontStretch;
    return f;
  }
  measureText(s) { this._font(this.mctx); this.mctx.letterSpacing = this.letterSpacing; return this.mctx.measureText(s); }
  // each glyph's place along a string, as the browser lays it out (cached by its font and words)
  _layout(s) {
    const key = `${this.font}|${this.fontStretch}|${this.letterSpacing}|${s}`;
    let L = this.layouts.get(key);
    if (L) return L;
    const c = this.mctx;
    this._font(c); c.letterSpacing = this.letterSpacing;
    const xs = new Float32Array(s.length);
    for (let i = 1; i < s.length; i++) xs[i] = c.measureText(s.slice(0, i)).width;
    L = { xs, w: c.measureText(s).width };
    if (this.layouts.size > 4000) this.layouts.clear();
    this.layouts.set(key, L);
    return L;
  }
  // a glyph's place in the atlas: its fill (red) and its 3 px halo (green), rasterized once at this scale
  _glyph(ch, k) {
    const key = `${this.font}|${this.fontStretch}|${k}|${ch}`;
    let g = this.glyphs.get(key);
    if (g !== undefined) return g;
    const c = this.gctx;
    this._font(c, k);
    c.letterSpacing = '0px';
    const mt = c.measureText(ch), pad = Math.ceil(2 * k) + 1;
    const l = Math.ceil(mt.actualBoundingBoxLeft || 0), r = Math.ceil(mt.actualBoundingBoxRight || 0), asc = Math.ceil(mt.actualBoundingBoxAscent || 0), desc = Math.ceil(mt.actualBoundingBoxDescent || 0);
    const w = l + r + 2 * pad, h = asc + desc + 2 * pad;
    if (r + l <= 0 || w > 256 || h > 256) { this.glyphs.set(key, null); return null; }
    const S = this.shelf;
    if (S.x + w > this.atlasSize) { S.x = 0; S.y += S.h; S.h = 0; }
    if (S.y + h > this.atlasSize) { this._resetAtlas(); return this._glyph(ch, k); }
    if (c.canvas.width < w || c.canvas.height < h) { c.canvas.width = Math.max(c.canvas.width, w); c.canvas.height = Math.max(c.canvas.height, h); this._font(c, k); c.letterSpacing = '0px'; }
    const ox = pad + l, oy = pad + asc, out = new Uint8Array(w * h * 4);
    for (const ch2 of [1, 0]) {
      c.clearRect(0, 0, w, h);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      if (ch2) { c.lineJoin = 'round'; c.lineWidth = 3 * k; c.strokeStyle = '#fff'; c.strokeText(ch, ox, oy); }
      else { c.fillStyle = '#fff'; c.fillText(ch, ox, oy); }
      const px = c.getImageData(0, 0, w, h).data;
      for (let i = 0; i < w * h; i++) out[i * 4 + ch2] = px[i * 4 + 3];
    }
    for (let i = 0; i < w * h; i++) out[i * 4 + 3] = 255;
    this.device.queue.writeTexture({ texture: this.atlas, origin: [S.x, S.y] }, out, { bytesPerRow: w * 4 }, [w, h]);
    g = { ax: S.x, ay: S.y, w, h, ox, oy };
    S.x += w; S.h = Math.max(S.h, h);
    this.glyphs.set(key, g);
    return g;
  }
  _text(s, x, y, halo) {
    if (!s) return;
    const col = this._rgba(halo ? this.strokeStyle : this.fillStyle);
    if (!(col >>> 24)) return;
    const L = this._layout(s), m = this.m, k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const al = this.textAlign, x0 = al === 'center' ? x - L.w / 2 : al === 'right' || al === 'end' ? x - L.w : x;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === ' ') continue;
      const g = this._glyph(ch, k);
      if (!g) continue;
      const gx = x0 + L.xs[i], dx = Math.round(m[0] * gx + m[2] * y + m[4]), dy = Math.round(m[1] * gx + m[3] * y + m[5]);
      const qx = dx - g.ox, qy = dy - g.oy;
      this._inst('instPlain', K_GLYPH, qx, qy, qx + g.w, qy + g.h, g.ax, g.ay, halo ? 1 : 0, 0, col);
    }
  }
  fillText(s, x, y) { this._text(s, x, y, false); }
  strokeText(s, x, y) { this._text(s, x, y, true); }

  // ------------------------------------------------------------------ the GPU's
  /** Draws the frame's recording over target (a GPUTextureView of w x h), in a pass of its own. */
  encode(enc, target, w, h) {
    if (!this.cmds.length) return;
    const d = this.device, U = GPUBufferUsage;
    if (!this.ds || this.ds.width !== w || this.ds.height !== h) {
      this.ds?.destroy();
      this.ds = d.createTexture({ size: [w, h], format: 'depth24plus-stencil8', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      this.dsView = this.ds.createView();
    }
    const fit = (name, bytes, usage) => {
      const b = this.bufs[name];
      if (b && b.size >= bytes) return b;
      b?.destroy();
      this.bg = null;
      return (this.bufs[name] = d.createBuffer({ size: Math.max(4096, 2 ** Math.ceil(Math.log2(bytes))), usage }));
    };
    const ib = fit('inst', Math.max(16, this.nInst * INST_W * 4), U.VERTEX | U.COPY_DST);
    const tb = fit('tri', Math.max(16, this.nTri * TRI_W * 4), U.VERTEX | U.COPY_DST);
    const cb = fit('clip', Math.max(16, this.nClip * 4), U.STORAGE | U.COPY_DST);
    if (this.nInst) d.queue.writeBuffer(ib, 0, this.inst, 0, this.nInst * INST_W);
    if (this.nTri) d.queue.writeBuffer(tb, 0, this.tri, 0, this.nTri * TRI_W);
    if (this.nClip) d.queue.writeBuffer(cb, 0, this.clipData, 0, this.nClip);
    d.queue.writeBuffer(this.ubuf, 0, new Float32Array([w, h, 0, 0]));
    this.bg ??= d.createBindGroup({ layout: this.bgl, entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: cb } }, { binding: 2, resource: this.atlas.createView() }] });
    const pass = enc.beginRenderPass({ label: 'notes', colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: this.dsView, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard', stencilClearValue: 0, stencilLoadOp: 'clear', stencilStoreOp: 'discard' } });
    pass.setBindGroup(0, this.bg);
    pass.setStencilReference(0);
    let cur = null;
    for (const c of this.cmds) {
      if (c.p !== cur) { pass.setPipeline(this.pipes[c.p]); pass.setVertexBuffer(0, c.buf === 'inst' ? ib : tb); cur = c.p; }
      if (c.buf === 'inst') pass.draw(6, c.count, 0, c.first);
      else pass.draw(c.count, 1, c.first, 0);
    }
    pass.end();
  }
}
