// A species' portrait drawn on the GPU without a world (docs/hand.md, The cabinet): the card page's (a card's link
// opened) studio. Only what drawing a still species alone takes: its organelles' directions (organDirs), its cells
// (vsStudio, fsPoint: the engine's studio) and the close-up's finish (fsPlain), three pipelines of the page's many,
// on a device of its own that is gone once the portrait is read back. The cells are drawn as the engine draws a
// mini-card's portrait (setStudio), on no stone, so fsPlain reads their light alone.
import { DRAW_WGSL, POST_WGSL, INBOND_WGSL, DEFAULT_K, FIRST_LIFE, G_BYTES, P_BYTES, STUDIO_N, ORGANS } from './shaders.js';
import { viewWords, VIEW_BYTES, POST_WORDS, POST_LOOK, HDR } from './engine.js';
import { DARKFIELD, packLook } from './look.js';
import { stage } from './studio.js';

// the studio's world: big enough that its cells never wrap; its portrait's side (pixels; a row a multiple of 256 bytes, as
// a texture copy needs: the page's PORTRAIT)
const GRID = [64, 64];
export const STUDIO_SIZE = 1280;

/**
 * The portrait of genome g (its words: G_WORDS) as cells [{ e, a, col, info, partners }] show it, at STUDIO_SIZE
 * square: { data (RGBA bytes), w, h }. step(name) names each stage as it begins: 'gpu' (a device asked for),
 * 'compile' (the studio's shaders), 'draw'. Throws (its message saying why) where it fails, with noGpu set where
 * there is no GPU to draw on.
 */
export async function studioPortrait(words, g, cells, step = () => {}) {
  step('gpu');
  // (noGpu: there is no GPU to draw on, rather than a failure drawing on it)
  const noGpu = (message) => Object.assign(new Error(message), { noGpu: true });
  if (!navigator.gpu) throw noGpu('This browser has no WebGPU.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw noGpu('WebGPU offered no graphics adapter (hardware acceleration may be off).');
  const d = await adapter.requestDevice();
  try {
    step('compile');
    const mod = (code, label) => d.createShaderModule({ code, label });
    const draw = mod(DRAW_WGSL, 'draw'), post = mod(POST_WGSL, 'post');
    const [organs, cellsP, plain] = await Promise.all([
      d.createComputePipelineAsync({ layout: 'auto', compute: { module: mod(INBOND_WGSL, 'inbond'), entryPoint: 'organDirs' } }),
      d.createRenderPipelineAsync({ layout: 'auto', primitive: { topology: 'triangle-strip' },
        vertex: { module: draw, entryPoint: 'vsStudio' },
        fragment: { module: draw, entryPoint: 'fsPoint', targets: [{ format: HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] } }),
      d.createRenderPipelineAsync({ layout: 'auto', primitive: { topology: 'triangle-list' },
        vertex: { module: post, entryPoint: 'vsFull' }, fragment: { module: post, entryPoint: 'fsPlain', targets: [{ format: 'rgba8unorm' }] } }),
    ]);

    step('draw');
    const S = STUDIO_SIZE, U = GPUBufferUsage, T = GPUTextureUsage;
    const buf = (size, usage, data) => { const b = d.createBuffer({ size, usage: usage | U.COPY_DST }); if (data) d.queue.writeBuffer(b, 0, data); return b; };
    const { parts, ppu } = stage(g, cells, S, [GRID[0] / 2, GRID[1] / 2]);
    // (all of the parts buffer: vsStudio looks through every record for the cells each touches, the rest none)
    const all = new Float32Array(STUDIO_N * P_BYTES / 4);
    all.set(parts.subarray(0, all.length));
    const genome = new Uint32Array((FIRST_LIFE + 1) * G_BYTES / 4);
    genome.set(words, FIRST_LIFE * G_BYTES / 4);
    const view = new ArrayBuffer(VIEW_BYTES);
    viewWords(view, DEFAULT_K, { cam: { x: GRID[0] / 2, y: GRID[1] / 2, ppu }, W: S, H: S, dpr: 1, time: 0, selId: 0xffffffff }, {
      grid: GRID, exposure: 1, focus: { on: 0, roleMask: 7, stateMode: 0, mute: 0.16, memberKind: 0xffffffff, memberN: 0 },
      level: 1, interiors: true, tide: new Float32Array(16), tidePh: new Float32Array(4), season: 1, ambient: 0.17, sky: 1, t: 0, hand: new Float32Array(4) });
    // fsPlain's: the frame's size, the exposure, the world's size, and the look as the page opens with it
    const pd = new Float32Array(POST_WORDS);
    pd[0] = S; pd[1] = S; pd[3] = 1; pd[10] = GRID[0]; pd[11] = GRID[1];
    pd.set(packLook({ ...DARKFIELD, grain: 0.25 }, 1), POST_LOOK);
    const b = {
      view: buf(VIEW_BYTES, U.UNIFORM, view), post: buf(POST_WORDS * 4, U.UNIFORM, pd),
      parts: buf(all.byteLength, U.STORAGE, all), genomes: buf(genome.byteLength, U.STORAGE, genome),
      organs: buf((FIRST_LIFE + 1) * ORGANS * 4, U.STORAGE),
    };
    const lit = d.createTexture({ size: [S, S], format: HDR, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    const out = d.createTexture({ size: [S, S], format: 'rgba8unorm', usage: T.RENDER_ATTACHMENT | T.COPY_SRC });
    const read = d.createBuffer({ size: S * S * 4, usage: U.COPY_DST | U.MAP_READ });
    const group = (p, entries) => d.createBindGroup({ layout: p.getBindGroupLayout(0), entries: entries.map(([binding, resource]) => ({ binding, resource: resource.size ? { buffer: resource } : resource })) });

    const enc = d.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(organs); cp.setBindGroup(0, group(organs, [[7, b.genomes], [9, b.organs]]));
    cp.dispatchWorkgroups(Math.ceil(((FIRST_LIFE + 1) * ORGANS) / 64)); cp.end();
    let pass = enc.beginRenderPass({ colorAttachments: [{ view: lit.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
    pass.setPipeline(cellsP); pass.setBindGroup(0, group(cellsP, [[0, b.view], [1, b.parts], [2, b.genomes], [10, b.organs]]));
    pass.draw(4, cells.length); pass.end();
    pass = enc.beginRenderPass({ colorAttachments: [{ view: out.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
    pass.setPipeline(plain);
    pass.setBindGroup(0, group(plain, [[0, d.createSampler({ magFilter: 'linear', minFilter: 'linear' })], [1, lit.createView()], [2, b.post], [6, b.view]]));
    pass.draw(3); pass.end();
    enc.copyTextureToBuffer({ texture: out }, { buffer: read, bytesPerRow: S * 4 }, [S, S]);
    d.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    return { data: new Uint8ClampedArray(read.getMappedRange().slice(0)), w: S, h: S };
  } finally {
    d.destroy();
  }
}
