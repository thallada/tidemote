// The WebGPU annotations' recording (src/gpunotes.js): what noteview's canvas calls become, without a GPU
import test from 'node:test';
import assert from 'node:assert/strict';

// a device that makes nothing (the recording never reaches it here)
Object.assign(globalThis, { GPUShaderStage: { VERTEX: 1, FRAGMENT: 2 }, GPUBufferUsage: { UNIFORM: 1, COPY_DST: 2, VERTEX: 4, STORAGE: 8 },
  GPUTextureUsage: { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 }, GPUColorWrite: { ALL: 15 } });
const stub = () => ({ createView: () => ({}) });
const device = { createShaderModule: stub, createBindGroupLayout: stub, createPipelineLayout: stub, createRenderPipeline: stub, createBuffer: stub, createTexture: stub, queue: { writeTexture() {}, writeBuffer() {} } };
const { NoteCanvas } = await import('../src/gpunotes.js');
const TAU = Math.PI * 2;
const kinds = (g) => g.cmds.map((c) => `${c.p}×${c.count}`).join(' ');
const inst = (g, i) => Array.from(g.inst.subarray(i * 12, i * 12 + 8));

test('a stroke is a capsule a segment, at the transform\'s scale, its dash cut on the CPU', () => {
  const g = new NoteCanvas(device, 'bgra8unorm');
  g.begin(2);
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,0,0,0.5)';
  g.beginPath(); g.moveTo(10, 10); g.lineTo(20, 10); g.lineTo(20, 30); g.stroke();
  assert.equal(kinds(g), 'instStroke×2');
  assert.deepEqual(inst(g, 0).slice(0, 5), [20, 20, 40, 20, 1.5]);
  // (a dash of 2 on, 2 off in CSS px: 4 device px each along a 20 px segment, five pieces on)
  g.begin(2); g.setLineDash([2, 2]); g.strokeStyle = '#fff';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 0); g.stroke();
  assert.equal(g.nInst, 3);
});

test('a whole circle stays a circle: one ring, dashed or not, and a clip of rectangles and circles', () => {
  const g = new NoteCanvas(device, 'bgra8unorm');
  g.begin(1);
  const P = g.newPath();
  for (let i = 0; i < 50; i++) { P.moveTo(i * 10 + 5, 5); P.arc(i * 10, 5, 5, 0, TAU); }
  g.strokeStyle = '#fff'; g.setLineDash([2, 2]); g.stroke(P);
  assert.equal(g.nInst, 50);
  assert.deepEqual(inst(g, 3).slice(0, 7), [30, 5, 5, 0.5, 2, 2, 0]);
  // the open world less a panel, and the loupe cut out of it
  g.beginPath(); g.rect(0, 0, 100, 100); g.moveTo(10, 10); g.lineTo(10, 20); g.lineTo(20, 20); g.lineTo(20, 10); g.closePath(); g.clip('evenodd');
  g.beginPath(); g.rect(-1e4, -1e4, 2e4, 2e4); g.moveTo(60, 50); g.arc(50, 50, 10, 0, TAU); g.clip('evenodd');
  assert.deepEqual(g.clips, [[[0, 0, 0, 100, 100], [0, 10, 10, 20, 20]], [[0, -1e4, -1e4, 1e4, 1e4], [1, 50, 50, 10, 0]]]);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 5, 5);
  const c = g.instU[(g.nInst - 1) * 12 + 10];
  assert.deepEqual(Array.from(g.clipData.subarray(c - 1, c + 4)), [2, 2, 0, 0, 0]);
});

test('fills: a rectangle one quad, a convex shape its triangles, anything else even-odd by the stencil', () => {
  const g = new NoteCanvas(device, 'bgra8unorm');
  g.begin(1); g.fillStyle = 'rgba(4,7,8,0.8)';
  g.fillRect(0, 0, 10, 10);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(4, -2); g.lineTo(2, 0); g.lineTo(4, 2); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 0); g.lineTo(10, 10); g.closePath(); g.fill();
  assert.equal(kinds(g), 'instPlain×1 triFan×6 instCover×1 triPlain×3');
  // a hatch, worked out in the shader: its origin and its tile's scale in device px
  g.begin(2); g.fillStyle = g.hatch('255,0,0', 3, 4, 9); g.fillRect(0, 0, 10, 10);
  assert.deepEqual(inst(g, 0).slice(4, 7), [6, 8, 3]);
  // a stroke's segments never blend twice: each stroke its own depth, rising
  g.begin(1); g.strokeStyle = '#fff';
  for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(5, 5); g.stroke(); }
  assert.ok(g.inst[11] > 0 && g.inst[23] > g.inst[11]);
});

test('save and restore keep the transform, the clips and the styles; rotate turns what is drawn after', () => {
  const g = new NoteCanvas(device, 'bgra8unorm');
  g.begin(1); g.strokeStyle = '#fff';
  g.save(); g.translate(10, 0); g.rotate(Math.PI / 2); g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(5, 0); g.stroke();
  g.restore();
  const a = inst(g, 0);
  assert.ok(Math.abs(a[0] - 10) < 1e-9 && Math.abs(a[2] - 10) < 1e-9 && Math.abs(a[3] - 5) < 1e-9, JSON.stringify(a));
  assert.equal(g.lineWidth, 1);
  assert.deepEqual(g.m, [1, 0, 0, 1, 0, 0]);
});

test('a rectangle stroked is one frame, its corners mitred; dashed, it is cut into capsules', () => {
  const g = new NoteCanvas(device, 'bgra8unorm');
  g.begin(1); g.strokeStyle = '#fff'; g.lineWidth = 2;
  const P = g.newPath(); P.rect(10, 10, 8, 8); P.rect(30, 10, 8, 8);
  g.stroke(P);
  assert.equal(g.nInst, 2);
  assert.deepEqual(inst(g, 0).slice(0, 5), [9, 9, 19, 19, 2]);
  assert.equal(g.instU[9], 6);
  g.begin(1); g.strokeStyle = '#fff'; g.setLineDash([2, 2]); g.strokeRect(0, 0, 8, 8);
  assert.equal(g.instU[9], 0);
});
