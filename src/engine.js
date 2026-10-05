import {
  simWGSL, PICK_WGSL, LISTEN_WGSL, SURVEY_WGSL, SURVEY_WORDS, SURVEY_MAX_TILES, INBOND_WGSL, LISTEN_CAP, LISTEN_HEAD, DRAW_WGSL, POST_WGSL, MICRO_WGSL, MICRO_SPECKS, ORGANS, DEFAULT_K,
  MAXK, FIRST_LIFE, MAX_CELLS, META_SLOT, META_POP, META_DEATH, META_ENERGY, META_CLAIM, P_BYTES, PICK_WORDS, G_BYTES, LITE_BYTES, LOUPE_FIELD,
} from './shaders.js';
import {
  archetypeGenome, writeGenome, parseParticle,
  packUnorm, ARCHETYPE_TYPES,
} from './genome.js';
import { TIDE_PHASE } from './flow.js';

const HDR = 'rgba16float';
const BLOOM_LEVELS = 6;
const U = GPUBufferUsage;
export const PICK_MAX = 131072;
export const FOCUS_MAX = 65536;
const PICK_BYTES = 56 + PICK_MAX * PICK_WORDS * 4;
const LEDGER_HEAD = META_CLAIM * 4;
const CENSUS_BYTES = LEDGER_HEAD + MAXK * G_BYTES;
const LISTEN_BYTES = (LISTEN_HEAD + 4 * LISTEN_CAP) * 4;
const SURVEY_BYTES = SURVEY_MAX_TILES * SURVEY_WORDS * 4;
export { MAXK, FIRST_LIFE, DEFAULT_K };

const mix = (a, b, t) => a + (b - a) * t;
const SIM_STRIDE = 256;
export const MAX_STEPS = 512;

// --------------------------------------------------------------------- engine
export async function createEngine(device, format, { hasTimestamps = false, K = {} } = {}) {
  const unknown = Object.keys(K).filter((k) => !(k in DEFAULT_K));
  if (unknown.length) throw new Error(`unknown tunables: ${unknown.join(', ')} (see DEFAULT_K in shaders.js)`);
  const e = new Engine(device, format, hasTimestamps, { ...DEFAULT_K, ...K });
  const errs = await e.compileErrors();
  if (errs.length) throw new Error('Shader compile failed:\n' + errs.join('\n'));
  return e;
}

class Engine {
  constructor(device, format, hasTimestamps, K) {
    this.device = device;
    this.format = format;
    this.K = K;
    this.capacity = 0;
    this.count = 0;
    this.grid = [3, 3];
    this.simTime = 0;
    this.frameNo = 0;
    this.worldGeneration = 0;
    this.season = 1;
    this.abio = 0;
    this.ambient = 0.17;
    this.chargeMul = 1;
    this.tide = new Float32Array([1, 1, 0.021, 1, 2, -1, -0.017, 1, -1, 3, 0.013, 0.7, 1, -2, 0.011, 0]);
    this.tidePh = Float32Array.from(TIDE_PHASE);
    this.seedValue = 1;
    this.censusEvery = 20;
    this.settings = { trails: 0.45, links: true, nodes: true, bloom: 0.012, exposure: 1.0, tide: 1, optics: 1 };
    this.simData = new ArrayBuffer(240);
    this.rock = new Float32Array(4);
    this.simF = new Float32Array(this.simData);
    this.simU = new Uint32Array(this.simData);
    this.waves = new Float32Array(16);
    this.viewData = new ArrayBuffer(80);
    this.viewDataL = new ArrayBuffer(80);
    this.postData = new Float32Array(52);
    this.loupe = null;
    this.focus = { on: 0, roleMask: 7, stateMode: 0, mute: 0.16, memberKind: 0xffffffff, memberN: 0 };
    this.viewDataS = new ArrayBuffer(80);
    this.onGpuTime = null;
    this.onCensus = null;
    this.pickReq = null;
    // Up to two particles followed every frame (the page's selection and the auto camera's subject).
    this.trackId = 0xffffffff;
    this.trackId2 = 0xffffffff;
    this.onTrack = null;
    this.lastCam = null;
    this.accIdx = 0;
    this.size = [0, 0];
    this.b = {};

    const d = device;
    const b = this.b;
    b.sim = d.createBuffer({ size: 240, usage: U.UNIFORM | U.COPY_DST });
    b.simRing = d.createBuffer({ size: SIM_STRIDE * MAX_STEPS, usage: U.COPY_SRC | U.COPY_DST });
    this.ringData = new ArrayBuffer(SIM_STRIDE * MAX_STEPS);
    b.view = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    b.viewL = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    b.viewS = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    b.focus = d.createBuffer({ size: (MAXK / 32 + FOCUS_MAX) * 4, usage: U.STORAGE | U.COPY_DST });
    b.post = d.createBuffer({ size: 208, usage: U.UNIFORM | U.COPY_DST });
    b.loupeU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    b.pickU = d.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    b.counts = d.createBuffer({ size: MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST });
    b.stoneGrid = d.createBuffer({ size: MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST });
    b.cellStart = d.createBuffer({ size: (MAX_CELLS + 1) * 4, usage: U.STORAGE });
    b.blockSums = d.createBuffer({ size: (MAX_CELLS / 256) * 4, usage: U.STORAGE });
    b.genomes = d.createBuffer({ size: MAXK * G_BYTES, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.frameCtr = d.createBuffer({ size: 48, usage: U.STORAGE | U.INDIRECT | U.COPY_SRC | U.COPY_DST });
    b.bridgeDraw = d.createBuffer({ size: 16, usage: U.INDIRECT | U.COPY_DST });
    d.queue.writeBuffer(b.bridgeDraw, 0, new Uint32Array([30, 0, 0, 0]));
    b.pickOut = d.createBuffer({ size: PICK_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    // tracking has its own uniforms and output per slot, so both slots and a pick share a frame
    b.trackU = [0, 1].map(() => d.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST }));
    b.trackOut = [0, 1].map(() => d.createBuffer({ size: 56 + PICK_WORDS * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }));
    b.listenU = d.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST });
    b.listen = d.createBuffer({ size: LISTEN_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    this.listenStage = [0, 1, 2].map(() => ({ buf: d.createBuffer({ size: LISTEN_BYTES, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    // The soundtrack's ears (see LISTEN_WGSL). Off until the page sets { every, keep[8], vscale }.
    this.listen = null;
    this.onListen = null;
    this._listenFrames = 0;
    this._listenSim = null;
    b.surveyU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    b.survey = d.createBuffer({ size: SURVEY_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    this.surveyStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: SURVEY_BYTES, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    // The auto camera's survey of the whole world (see SURVEY_WGSL). Off until the page sets { every }.
    this.survey = null;
    this.onSurvey = null;
    this._surveyFrames = 0;
    this._surveySim = null;

    this.simModule = d.createShaderModule({ code: simWGSL(K), label: 'sim' });
    this.pickModule = d.createShaderModule({ code: PICK_WGSL, label: 'pick' });
    this.listenModule = d.createShaderModule({ code: LISTEN_WGSL, label: 'listen' });
    this.surveyModule = d.createShaderModule({ code: SURVEY_WGSL, label: 'survey' });
    this.drawModule = d.createShaderModule({ code: DRAW_WGSL, label: 'draw' });
    b.inbondU = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    const inbond = d.createShaderModule({ code: INBOND_WGSL, label: 'inbond' });
    this.cpInbond = ['inbondReset', 'inbondGather', 'contactGather'].map((entryPoint) => d.createComputePipeline({ layout: 'auto', compute: { module: inbond, entryPoint }, label: entryPoint }));
    this.cpOrgans = d.createComputePipeline({ layout: 'auto', compute: { module: inbond, entryPoint: 'organDirs' }, label: 'organDirs' });
    b.organDir = d.createBuffer({ size: MAXK * ORGANS * 4, usage: U.STORAGE });
    this.postModule = d.createShaderModule({ code: POST_WGSL, label: 'post' });

    const cp = (mod, entryPoint) => d.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint }, label: entryPoint });
    this.cpDefs = {
      seedMain: [0, 1, 9, 10],
      resolveCount: [0, 1, 4, 8, 9, 10, 11, 14],
      scanBlocks: [5, 6, 7],
      scanSums: [6, 7],
      scanAdd: [6, 7],
      scatterMain: [0, 1, 2, 3, 6, 8, 9, 10, 12, 13, 15],
      censusMain: [11, 12, 13],
      matterMain: [0, 1, 2, 9, 10, 11, 13, 14, 16],
      lifeMain: [0, 1, 2, 3, 6, 9, 10, 11, 12, 15],
    };
    this.cp = {};
    for (const name of Object.keys(this.cpDefs)) this.cp[name] = { pipe: cp(this.simModule, name), bg: null };
    this.cpPick = { pipe: cp(this.pickModule, 'pickMain'), bg: null };
    this.cpListen = { pipe: cp(this.listenModule, 'listenMain'), bg: null };
    this.cpSurvey = { pipe: cp(this.surveyModule, 'surveyMain'), bg: null };

    const additive = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
    const fade = { color: { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' }, alpha: { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' } };
    const over = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    const rp = (mod, vs, fs, topology, blend, fmt = HDR, constants = {}) => d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: vs },
      fragment: { module: mod, entryPoint: fs, targets: [{ format: fmt, blend }], constants },
      primitive: { topology },
      label: fs,
    });
    this.pPoint = rp(this.drawModule, 'vsPoint', 'fsPoint', 'triangle-strip', additive);
    this.pLine = rp(this.drawModule, 'vsLine', 'fsLine', 'line-list', additive);
    // stone: the highest cobble at each pixel wins the depth test and writes its colour and surface (vsStone)
    this.pStone = d.createRenderPipeline({ layout: 'auto', label: 'fsStone', primitive: { topology: 'triangle-strip' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      vertex: { module: this.drawModule, entryPoint: 'vsStone' },
      fragment: { module: this.drawModule, entryPoint: 'fsStone', targets: [{ format: HDR }, { format: HDR }] } });
    this.pBridge = rp(this.drawModule, 'vsBridge', 'fsBridge', 'triangle-strip', additive);
    this.pFade = rp(this.drawModule, 'vsFade', 'fsFade', 'triangle-list', fade);
    this.pDown = rp(this.postModule, 'vsFull', 'fsDown', 'triangle-list', undefined);
    this.pUp = rp(this.postModule, 'vsFull', 'fsUp', 'triangle-list', additive);
    this.pMurk = rp(this.postModule, 'vsFull', 'fsMurk', 'triangle-list', undefined);
    this.pComp = rp(this.postModule, 'vsFull', 'fsComposite', 'triangle-list', undefined, format);
    this.pCompClear = rp(this.postModule, 'vsFull', 'fsComposite', 'triangle-list', undefined, format, { MICRO_SUSPENSION: 0 });
    this.pLoupe = rp(this.postModule, 'vsLoupe', 'fsLoupe', 'triangle-list', over, format);
    this.pPlain = rp(this.postModule, 'vsFull', 'fsPlain', 'triangle-list', undefined, format);
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    this.timing = null;
    if (hasTimestamps) {
      this.timing = {
        qs: d.createQuerySet({ type: 'timestamp', count: 2 }),
        resolve: d.createBuffer({ size: 16, usage: U.QUERY_RESOLVE | U.COPY_SRC }),
        reads: [0, 1, 2].map(() => ({ buf: d.createBuffer({ size: 16, usage: U.COPY_DST | U.MAP_READ }), busy: false })),
      };
    }
    this.censusStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: CENSUS_BYTES, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    this.pickStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: PICK_BYTES, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    this.trackStage = [0, 1, 2, 3, 4, 5, 6, 7].map(() => ({ buf: d.createBuffer({ size: 56, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    b.reprojU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    this.pReproj = rp(this.postModule, 'vsFull', 'fsReproj', 'triangle-list', undefined);

    // the main view's micro-suspension: specks found per frame, then drawn as quads (MICRO_WGSL)
    this.microModule = d.createShaderModule({ code: MICRO_WGSL, label: 'micro' });
    this.cpMicro = d.createComputePipeline({ layout: 'auto', compute: { module: this.microModule, entryPoint: 'microSpecks' }, label: 'microSpecks' });
    this.pSpeck = rp(this.microModule, 'vsSpeck', 'fsSpeck', 'triangle-strip', additive);
    b.microU = d.createBuffer({ size: 256, usage: U.UNIFORM | U.COPY_DST });
    b.specks = d.createBuffer({ size: MICRO_SPECKS * 64, usage: U.STORAGE });
    b.microArgs = d.createBuffer({ size: 16, usage: U.STORAGE | U.INDIRECT | U.COPY_DST });
    this.microData = new ArrayBuffer(256);
    this.cpMicroBG = d.createBindGroup({ layout: this.cpMicro.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.post } }, { binding: 1, resource: { buffer: b.microU } },
      { binding: 2, resource: { buffer: b.specks } }, { binding: 3, resource: { buffer: b.microArgs } }] });
  }

  async compileErrors() {
    const out = [];
    for (const m of [this.simModule, this.pickModule, this.drawModule, this.postModule, this.microModule]) {
      const info = await m.getCompilationInfo();
      for (const msg of info.messages) if (msg.type === 'error') out.push(`${m.label}:${msg.lineNum}:${msg.linePos} ${msg.message}`);
    }
    return out;
  }

  /** Allocate particle storage for exactly n particles. Returns false if the GPU refuses. */
  async allocate(n) {
    const d = this.device;
    const b = this.b;
    const names = ['parts', 'sortedFull', 'sortedLite', 'aux', 'intent', 'bondsNow', 'bondsIn', 'touch', 'sway', 'stoneList', 'ledger', 'livingList'];
    for (const k of names) { b[k]?.destroy(); b[k] = null; }
    this.capacity = 0;
    this.count = 0;
    d.pushErrorScope('out-of-memory');
    d.pushErrorScope('validation');
    b.parts = d.createBuffer({ size: n * P_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    b.sortedFull = d.createBuffer({ size: n * P_BYTES, usage: U.STORAGE });
    b.sortedLite = d.createBuffer({ size: n * LITE_BYTES, usage: U.STORAGE });
    b.aux = d.createBuffer({ size: n * 8, usage: U.STORAGE });
    b.intent = d.createBuffer({ size: n * 16, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    b.bondsNow = d.createBuffer({ size: n * 8, usage: U.STORAGE });
    b.bondsIn = d.createBuffer({ size: n * 20, usage: U.STORAGE });
    // contacts start absent (NONE) until the first gather in view
    b.touch = d.createBuffer({ size: n * 24, usage: U.STORAGE, mappedAtCreation: true });
    new Uint32Array(b.touch.getMappedRange()).fill(0xffffffff);
    b.touch.unmap();
    b.sway = d.createBuffer({ size: n * 24, usage: U.STORAGE });
    b.stoneList = d.createBuffer({ size: n * 4, usage: U.STORAGE });
    b.ledger = d.createBuffer({ size: (META_CLAIM + n) * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.livingList = d.createBuffer({ size: (n + 256) * 4, usage: U.STORAGE | U.COPY_DST });
    const res = {
      0: { buffer: b.sim }, 1: { buffer: b.parts }, 2: { buffer: b.sortedFull }, 3: { buffer: b.sortedLite },
      4: { buffer: b.counts }, 5: { buffer: b.counts }, 6: { buffer: b.cellStart }, 7: { buffer: b.blockSums },
      8: { buffer: b.aux }, 9: { buffer: b.intent }, 10: { buffer: b.genomes }, 11: { buffer: b.ledger },
      12: { buffer: b.livingList }, 13: { buffer: b.frameCtr }, 14: { buffer: b.stoneGrid },
      15: { buffer: b.bondsNow }, 16: { buffer: b.stoneList },
    };
    for (const [name, ids] of Object.entries(this.cpDefs)) {
      const c = this.cp[name];
      c.bg = d.createBindGroup({ layout: c.pipe.getBindGroupLayout(0), entries: ids.map((id) => ({ binding: id, resource: res[id] })) });
    }
    this.cpPick.bg = d.createBindGroup({ layout: this.cpPick.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.pickU } }, { binding: 1, resource: { buffer: b.parts } },
      { binding: 2, resource: { buffer: b.pickOut } }, { binding: 3, resource: { buffer: b.intent } }] });
    this.trackBG = [0, 1].map((k) => d.createBindGroup({ layout: this.cpPick.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.trackU[k] } }, { binding: 1, resource: { buffer: b.parts } },
      { binding: 2, resource: { buffer: b.trackOut[k] } }, { binding: 3, resource: { buffer: b.intent } }] }));
    this.cpListen.bg = d.createBindGroup({ layout: this.cpListen.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.listenU } }, { binding: 1, resource: { buffer: b.parts } },
      { binding: 2, resource: { buffer: b.genomes } }, { binding: 3, resource: { buffer: b.listen } }] });
    this.cpSurvey.bg = d.createBindGroup({ layout: this.cpSurvey.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.surveyU } }, { binding: 1, resource: { buffer: b.parts } },
      { binding: 2, resource: { buffer: b.genomes } }, { binding: 3, resource: { buffer: b.cellStart } },
      { binding: 4, resource: { buffer: b.survey } }] });
    const pointBG = (view) => d.createBindGroup({ layout: this.pPoint.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.genomes } },
      { binding: 3, resource: { buffer: b.intent } },
      { binding: 5, resource: { buffer: b.focus } }, { binding: 6, resource: { buffer: b.bondsIn } },
      { binding: 8, resource: { buffer: b.touch } }, { binding: 9, resource: { buffer: b.sway } },
      { binding: 10, resource: { buffer: b.organDir } }] });
    this.organsBG = d.createBindGroup({ layout: this.cpOrgans.getBindGroupLayout(0), entries: [
      { binding: 7, resource: { buffer: b.genomes } }, { binding: 9, resource: { buffer: b.organDir } }] });
    const stoneBG = (view) => d.createBindGroup({ layout: this.pStone.getBindGroupLayout(0), entries:
      [[0, view], [1, b.parts], [2, b.genomes], [5, b.focus], [7, b.stoneList]].map(([binding, buffer]) => ({ binding, resource: { buffer } })) });
    this.bgStone = stoneBG(b.view); this.bgStoneL = stoneBG(b.viewL); this.bgStoneS = stoneBG(b.viewS);
    const inbondRes = [null, b.intent, b.parts, b.bondsIn, b.inbondU, b.cellStart, b.touch, b.genomes, b.sway];
    const inbondUse = [[2, 3, 4, 5], [1, 2, 3, 4, 5], [2, 4, 5, 6, 7, 8]];
    this.inbondBG = this.cpInbond.map((pipe, k) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0),
      entries: inbondUse[k].map((binding) => ({ binding, resource: { buffer: inbondRes[binding] } })) }));
    const lineBG = (view) => d.createBindGroup({ layout: this.pLine.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.genomes } },
      { binding: 3, resource: { buffer: b.intent } }, { binding: 4, resource: { buffer: b.livingList } }, { binding: 5, resource: { buffer: b.focus } }] });
    this.bgPoint = pointBG(b.view);
    this.bgLine = lineBG(b.view);
    this.bgPointL = pointBG(b.viewL);
    this.bgLineL = lineBG(b.viewL);
    this.bgPointS = pointBG(b.viewS);
    this.bgLineS = lineBG(b.viewS);
    const bridgeBG = (view) => d.createBindGroup({ layout: this.pBridge.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.genomes } },
      { binding: 3, resource: { buffer: b.intent } }, { binding: 4, resource: { buffer: b.livingList } }, { binding: 5, resource: { buffer: b.focus } }] });
    this.bgBridge = bridgeBG(b.view);
    this.bgBridgeL = bridgeBG(b.viewL);
    this.bgBridgeS = bridgeBG(b.viewS);
    const verr = await d.popErrorScope();
    const oerr = await d.popErrorScope();
    if (verr || oerr) {
      for (const k of names) { b[k]?.destroy(); b[k] = null; }
      return false;
    }
    this.capacity = n;
    return true;
  }

  resize(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (this.size[0] === w && this.size[1] === h) return;
    this.size = [w, h];
    const d = this.device;
    if (this.accum) { this.accum.forEach((t) => t.destroy()); this.bloom.forEach((t) => t.destroy()); this.murkTex.destroy(); this.microTex.destroy(); }
    const tex = (tw, th) => d.createTexture({ size: [Math.max(1, tw), Math.max(1, th)], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.accum = [tex(w, h), tex(w, h)];
    this.stoneTex?.forEach((t) => t.destroy());
    this.stoneTex = [tex(w, h), tex(w, h), d.createTexture({ size: [w, h], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT })];
    this.stoneView = this.stoneTex.map((t) => t.createView());
    this.bloom = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) this.bloom.push(tex(w >> (i + 1), h >> (i + 1)));
    this.murkTex = tex(w >> 2, h >> 2);
    this.murkView = this.murkTex.createView();
    this.microTex = tex(w, h);
    this.microView = this.microTex.createView();
    this.speckBG = d.createBindGroup({ layout: this.pSpeck.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.b.post } }, { binding: 1, resource: { buffer: this.b.microU } },
      { binding: 4, resource: { buffer: this.b.specks } }, { binding: 5, resource: this.sampler }, { binding: 6, resource: this.murkView }] });
    this.murkBG = d.createBindGroup({ layout: this.pMurk.getBindGroupLayout(0), entries: [{ binding: 2, resource: { buffer: this.b.post } }] });
    this.accumViews = this.accum.map((t) => t.createView());
    this.bloomViews = this.bloom.map((t) => t.createView());
    const sbg = (pipe, view) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: view }] });
    this.downBG = [];
    for (let i = 1; i < BLOOM_LEVELS; i++) this.downBG[i] = sbg(this.pDown, this.bloomViews[i - 1]);
    this.down0BG = this.accumViews.map((v) => sbg(this.pDown, v));
    this.upBG = [];
    for (let i = BLOOM_LEVELS - 1; i > 0; i--) this.upBG.push({ target: i - 1, bg: sbg(this.pUp, this.bloomViews[i]) });
    const compBG = (pipe) => this.accumViews.map((v) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: v },
      { binding: 2, resource: { buffer: this.b.post } }, { binding: 3, resource: this.bloomViews[0] },
      { binding: 7, resource: this.stoneView[0] }, { binding: 8, resource: this.stoneView[1] }, { binding: 9, resource: this.murkView },
      { binding: 10, resource: this.microView }] }));
    this.compBG = compBG(this.pComp);
    this.compClearBG = compBG(this.pCompClear);
    this.reprojBG = this.accumViews.map((v) => d.createBindGroup({ layout: this.pReproj.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: v }, { binding: 5, resource: { buffer: this.b.reprojU } }] }));
    this.clearAccum = true;
  }

  _ensureLoupeTex(L) {
    if (this.loupeTex && this.loupeSize === L) return;
    this.loupeTex?.destroy();
    this.loupeSize = L;
    this.loupeTex = this.device.createTexture({ size: [L, L], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.loupeView = this.loupeTex.createView();
    this.loupeStoneTex?.forEach((t) => t.destroy());
    this.loupeStoneTex = [HDR, HDR, 'depth32float'].map((format) => this.device.createTexture({ size: [L, L], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | (format === HDR ? GPUTextureUsage.TEXTURE_BINDING : 0) }));
    this.loupeStoneView = this.loupeStoneTex.map((t) => t.createView());
    this.loupeBG = this.device.createBindGroup({ layout: this.pLoupe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: this.loupeView },
      { binding: 2, resource: { buffer: this.b.post } }, { binding: 4, resource: { buffer: this.b.loupeU } },
      { binding: 6, resource: { buffer: this.b.viewL } }, { binding: 7, resource: this.loupeStoneView[0] }, { binding: 8, resource: this.loupeStoneView[1] }] });
  }

  /**
   * Focus: kinds = Uint32Array(MAXK / 32) bitmask over genome slots (null = no filter),
   * members = sorted Uint32Array of particle ids to highlight (null = none).
   */
  setFocus({ kinds = null, roleMask = 7, stateMode = 0, mute = 0.16, members = null, memberKind = 0xffffffff } = {}) {
    const f = this.focus;
    f.on = kinds ? 1 : 0;
    f.roleMask = roleMask; f.stateMode = stateMode; f.mute = mute;
    f.memberKind = memberKind;
    f.memberN = members ? Math.min(members.length, FOCUS_MAX) : 0;
    if (kinds) this.device.queue.writeBuffer(this.b.focus, 0, kinds, 0, MAXK / 32);
    if (f.memberN) this.device.queue.writeBuffer(this.b.focus, MAXK / 32 * 4, members, 0, f.memberN);
  }

  _ensureSpecTex(w, h) {
    if (this.specTex && this.specSize[0] === w && this.specSize[1] === h) return;
    this.specTex?.destroy();
    this.specSize = [w, h];
    this.specTex = this.device.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.specView = this.specTex.createView();
    this.specStoneTex?.forEach((t) => t.destroy());
    this.specStoneTex = [HDR, HDR, 'depth32float'].map((format) => this.device.createTexture({ size: [w, h], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | (format === HDR ? GPUTextureUsage.TEXTURE_BINDING : 0) }));
    this.specStoneView = this.specStoneTex.map((t) => t.createView());
    this.specBG = this.device.createBindGroup({ layout: this.pPlain.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: this.specView },
      { binding: 2, resource: { buffer: this.b.post } }, { binding: 6, resource: { buffer: this.b.viewS } },
      { binding: 7, resource: this.specStoneView[0] }, { binding: 8, resource: this.specStoneView[1] }] });
  }

  gridFor(n, aspect) {
    const cells = Math.min(n / this.K.density, MAX_CELLS);
    const gw = Math.max(3, Math.round(Math.sqrt(cells * aspect)));
    let gh = Math.max(3, Math.round(cells / gw));
    if (gw * gh > MAX_CELLS) gh = Math.floor(MAX_CELLS / gw);
    return [gw, gh];
  }

  /**
   * Create a new universe of n particles (n <= capacity). Each world draws its own tide pattern,
   * opening light and glint charge, matter mix, and how clumped its founders start.
   */
  seed(n, { aspect = 16 / 9, rng = Math.random } = {}) {
    const d = this.device;
    this.worldGeneration++;
    this.abio = 0;
    this.season = 1;
    n = Math.min(n, this.capacity);
    this.count = n;
    this.grid = this.gridFor(n, aspect);
    this.simTime = 0;
    this.frameNo = 0;
    this.seedValue = (rng() * 0xffffffff) >>> 0;
    this.ambient = mix(0.12, 0.3, rng());
    this.chargeMul = mix(0.8, 1.25, rng());
    this.randomizeTide(rng);
    this.randomizeCurrents(rng);
    const silt = mix(0.42, 0.58, rng()), glint = mix(0.06, 0.18, rng()), husk = mix(0.02, 0.06, rng());
    // Founders: a share of each species starts in a few colonies, the rest scattered. Colony size
    // follows the world so a colony is `conc` times denser in its species than an even spread.
    // Bedrock outcrops: from none to about 8% of the area, as chains of discs a few cells across.
    const cells = this.grid[0] * this.grid[1];
    const rockR = mix(1.2, 3.0, rng());
    const cover = rng() ** 1.5 * 0.08 * this.K.rocks;
    this.rock.set([Math.min(256, Math.round((cover * cells) / (10 * rockR * rockR))), rockR, 0, 0]);
    const clump = rng();
    const conc = mix(3, 10, rng());
    const spread = Math.sqrt((this.grid[0] * this.grid[1]) / (conc * 2.5 * 2 * Math.PI));

    const gbuf = new ArrayBuffer(MAXK * G_BYTES);
    const gu = new Uint32Array(gbuf);
    const gf = new Float32Array(gbuf);
    const matterCols = [[0.3, 0.34, 0.46], [0.7, 0.93, 1.0], [0.5, 0.35, 0.25], [0.62, 0.57, 0.5]];
    for (let m = 0; m < 4; m++) {
      const g = archetypeGenome('plankton', rng, this.K);
      g.col = packUnorm(...matterCols[m]);
      writeGenome(gu, gf, m, g);
    }
    const head = new Uint32Array(META_CLAIM);
    // Each world draws its own founding mix.
    const weights = ARCHETYPE_TYPES.map(() => rng() ** 2);
    const total = weights.reduce((a, b) => a + b, 0);
    const plan = Array.from({ length: 24 }, () => {
      let pick = rng() * total, i = 0;
      while (i < weights.length - 1 && pick >= weights[i]) pick -= weights[i++];
      return ARCHETYPE_TYPES[i];
    });
    head[0] = n;
    head[1] = plan.length;
    plan.forEach((type, s) => {
      const g = archetypeGenome(type, rng, this.K);
      g.serial = s + 1;
      writeGenome(gu, gf, FIRST_LIFE + s, g);
      head[META_SLOT + FIRST_LIFE + s] = 1;
    });
    d.queue.writeBuffer(this.b.genomes, 0, gbuf);
    d.queue.writeBuffer(this.b.ledger, 0, head);
    this.founders = plan.length;

    this._writeSim({ seedKinds: plan.length, pSilt: silt, pGlint: glint, pHusk: husk, clump, spread });
    const enc = d.createCommandEncoder();
    enc.clearBuffer(this.b.counts);
    enc.clearBuffer(this.b.ledger, LEDGER_HEAD, n * 4);
    enc.clearBuffer(this.b.frameCtr);
    const pass = enc.beginComputePass();
    pass.setPipeline(this.cp.seedMain.pipe);
    pass.setBindGroup(0, this.cp.seedMain.bg);
    pass.dispatchWorkgroups(Math.ceil(n / 256));
    pass.end();
    d.queue.submit([enc.finish()]);
    this.clearAccum = true;
  }

  /** Three active tide waves (the fourth is left idle for the first climate era to raise) with random phases. */
  randomizeTide(rng = Math.random) {
    for (let k = 0; k < 4; k++) {
      this.newTideWave(k, rng);
      this.tide[k * 4 + 3] = k < 3 ? mix(0.6, 1.1, rng()) : 0;
    }
  }

  /** A torus-periodic tide wave in slot k (amplitude untouched): integer wave numbers, a slow drift, a phase. */
  newTideWave(k, rng = Math.random) {
    let a = 0, b = 0;
    while (a === 0 && b === 0) { a = Math.round(mix(-3, 3, rng())); b = Math.round(mix(-3, 3, rng())); }
    this.tide[k * 4] = a;
    this.tide[k * 4 + 1] = b;
    this.tide[k * 4 + 2] = (rng() < 0.5 ? -1 : 1) * mix(0.008, 0.03, rng());
    this.tidePh[k] = rng() * Math.PI * 2;
  }

  /** Divergence-free, torus-periodic currents. Returns the new wave table. */
  randomizeCurrents(rng = Math.random, into = this.waves) {
    const [W, H] = this.grid;
    for (let k = 0; k < 4; k++) {
      const L = mix(14, 34, rng());
      const th = rng() * Math.PI * 2;
      let kx = Math.round((W / L) * Math.cos(th));
      const ky = Math.round((H / L) * Math.sin(th));
      if (kx === 0 && ky === 0) kx = 1;
      into[k * 4] = (Math.PI * 2 * kx) / W;
      into[k * 4 + 1] = (Math.PI * 2 * ky) / H;
      into[k * 4 + 2] = (rng() < 0.5 ? -1 : 1) * mix(0.04, 0.12, rng());
      into[k * 4 + 3] = mix(0.08, 0.16, rng());
    }
    return into;
  }

  _writeSim(extra = {}) {
    this._fillSim(extra);
    this.device.queue.writeBuffer(this.b.sim, 0, this.simData);
  }

  _fillSim(extra = {}) {
    const f = this.simF, u = this.simU;
    f[0] = this.grid[0]; f[1] = this.grid[1];
    u[2] = this.grid[0]; u[3] = this.grid[1];
    u[4] = this.count; u[5] = this.frameNo;
    f[6] = this.dt || 1 / 60; f[7] = this.simTime;
    f[8] = this.season; f[9] = this.abio;
    u[10] = (this.seedValue + this.frameNo * 7919) >>> 0; f[11] = this.K.maxSpeed;
    u[12] = extra.seedKinds || 1; f[13] = extra.pSilt || 0; f[14] = extra.pGlint || 0; f[15] = extra.pHusk || 0;
    f[16] = this.ambient; f[17] = this.chargeMul; f[18] = extra.clump || 0; f[19] = extra.spread || 0;
    f.set(this.waves, 20);
    f.set(this.tide, 36);
    f.set(this.tidePh, 52);
    f.set(this.rock, 56);
  }

  requestPick(center, radius, selId, { kind = 0xffffffff, maxOut = 4096, raw = false } = {}) {
    return new Promise((resolve) => {
      if (this.pickReq) this.pickReq.resolve(null);
      this.pickReq = { center, radius, selId: selId >>> 0, kind, maxOut: Math.max(1, Math.min(Math.ceil(maxOut), PICK_MAX)), raw, resolve };
    });
  }

  /** Encode one simulation step whose uniforms are at `ring` (a slot of b.simRing), or written directly. */
  _step(enc, simDt, timestampWrites, ring = -1) {
    const b = this.b;
    const N = this.count;
    this.dt = simDt;
    this.simTime += simDt;
    this.frameNo++;
    if (ring < 0) this._writeSim();
    else {
      this._fillSim();
      new Uint8Array(this.ringData, ring * SIM_STRIDE, this.simData.byteLength).set(new Uint8Array(this.simData));
      enc.copyBufferToBuffer(b.simRing, ring * SIM_STRIDE, b.sim, 0, this.simData.byteLength);
    }
    const cells = this.grid[0] * this.grid[1];
    enc.clearBuffer(b.counts, 0, cells * 4);
    enc.clearBuffer(b.stoneGrid, 0, cells * 4);
    enc.clearBuffer(b.ledger, META_POP * 4, MAXK * 4);
    enc.clearBuffer(b.frameCtr, 0, 4);
    enc.clearBuffer(b.frameCtr, 36, 4);
    enc.clearBuffer(b.ledger, 48, 12);
    const pass = enc.beginComputePass({ timestampWrites });
    const run = (name, n) => { const c = this.cp[name]; pass.setPipeline(c.pipe); pass.setBindGroup(0, c.bg); pass.dispatchWorkgroups(n); };
    const wg = Math.ceil(N / 256);
    run('resolveCount', wg);
    // Scan only the cells in use (+1 for the one-past-the-end start of the last cell; when the grid
    // fills MAX_CELLS exactly, scanSums writes that final entry itself).
    const scanWG = Math.min(MAX_CELLS / 256, Math.ceil((cells + 1) / 256));
    run('scanBlocks', scanWG);
    run('scanSums', 1);
    run('scanAdd', scanWG);
    run('scatterMain', wg);
    run('censusMain', Math.ceil(MAXK / 256));
    run('matterMain', wg);
    pass.setPipeline(this.cp.lifeMain.pipe);
    pass.setBindGroup(0, this.cp.lifeMain.bg);
    pass.dispatchWorkgroupsIndirect(b.frameCtr, 4);
    pass.end();
  }

  /** On a census step, copy the ledger and genomes into a free staging buffer. */
  _censusCopy(enc) {
    if (this.frameNo % this.censusEvery !== 0) return null;
    const st = this.censusStage.find((s) => !s.busy);
    if (!st) return null;
    st.busy = true;
    enc.copyBufferToBuffer(this.b.ledger, 0, st.buf, 0, LEDGER_HEAD);
    enc.copyBufferToBuffer(this.b.genomes, 0, st.buf, LEDGER_HEAD, MAXK * G_BYTES);
    return { st, simTime: this.simTime, frameNo: this.frameNo };
  }

  /** Read a census back after its submit. */
  _censusRead(job, generation) {
    if (!job) return;
    const { st } = job;
    st.buf.mapAsync(GPUMapMode.READ).then(() => {
      const copy = st.buf.getMappedRange().slice(0);
      st.buf.unmap();
      st.busy = false;
      if (generation !== this.worldGeneration) return;
      if (this.onCensus) {
        const u = new Uint32Array(copy);
        this.onCensus({
          simTime: job.simTime, frameNo: job.frameNo,
          globals: u.subarray(0, 16), slots: u.subarray(META_SLOT, META_SLOT + MAXK), pop: u.subarray(META_POP, META_POP + MAXK),
          demography: u.subarray(META_DEATH, META_DEATH + 57), energy: u.subarray(META_ENERGY, META_ENERGY + 40),
          genomeU32: new Uint32Array(copy, LEDGER_HEAD), genomeF32: new Float32Array(copy, LEDGER_HEAD),
        });
      }
    }).catch(() => { st.busy = false; });
  }

  /**
   * One rendered frame after `steps` simulation steps. target: GPUTextureView or null (simulate only).
   * cam: {x,y,ppu}; loupe: {x,y,r (canvas px), ppu, cx, cy (world)} or null.
   */
  frame({ target = null, cam = { x: 0, y: 0, ppu: 1 }, paused = false, simDt = 1 / 60, steps = 1, time = 0, dpr = 1, selId = 0xffffffff, loupe = null, specimen = null }) {
    const d = this.device;
    const generation = this.worldGeneration;
    const b = this.b;
    const N = this.count;
    const t0 = performance.now();
    const stepping = !paused && N > 0;
    const nSteps = stepping ? Math.min(MAX_STEPS, Math.max(1, steps | 0)) : 0;
    const tm = this.timing;
    const slot = tm ? tm.reads.find((r) => !r.busy) : null;
    let tsFirst = !!slot;
    const tsBegin = () => {
      if (!tsFirst) return undefined;
      tsFirst = false;
      return { querySet: tm.qs, beginningOfPassWriteIndex: 0 };
    };

    // All steps go into one submit. Each step's uniforms (frame number, time, RNG seed) are staged in
    // b.simRing and copied into b.sim between passes: a queue.writeBuffer would land before the whole
    // submit.
    const enc = d.createCommandEncoder();
    const censusJobs = [];
    for (let s = 0; s < nSteps; s++) {
      const last = s === nSteps - 1;
      const endTs = last && slot && !target ? { querySet: tm.qs, endOfPassWriteIndex: 1 } : undefined;
      const begin = tsBegin();
      this._step(enc, simDt, begin || endTs ? { ...(begin || {}), ...(endTs || {}) } : undefined, nSteps > 1 ? s : -1);
      const job = this._censusCopy(enc);
      if (job) censusJobs.push(job);
    }
    if (nSteps > 1) d.queue.writeBuffer(b.simRing, 0, this.ringData, 0, nSteps * SIM_STRIDE);
    const listenJob = nSteps > 0 ? this._listenCopy(enc, cam) : null;
    const surveyJob = nSteps > 0 ? this._surveyCopy(enc) : null;

    // ---- picking
    let pickJob = null;
    const trackJobs = [];
    for (let k = 0; k < 2 && N > 0; k++) {
      const id = k ? this.trackId2 : this.trackId;
      if (id === 0xffffffff || (k && id === this.trackId)) continue;
      const st = this.trackStage.find((s) => !s.busy);
      if (!st) break;
      st.busy = true;
      trackJobs.push({ st, id, simTime: this.simTime });
      const pu = new ArrayBuffer(48);
      const pf = new Float32Array(pu), pv = new Uint32Array(pu);
      pf[2] = 0; pv[3] = id; pv[4] = 0; pv[5] = N; pf[6] = this.grid[0]; pf[7] = this.grid[1]; pv[8] = 0xffffffff;
      d.queue.writeBuffer(b.trackU[k], 0, pu);
      enc.clearBuffer(b.trackOut[k], 0, 56);
      const pass = enc.beginComputePass();
      pass.setPipeline(this.cpPick.pipe);
      pass.setBindGroup(0, this.trackBG[k]);
      pass.dispatchWorkgroups(Math.ceil(N / 256));
      pass.end();
      enc.copyBufferToBuffer(b.trackOut[k], 0, st.buf, 0, 56);
    }
    if (this.pickReq && N > 0) {
      const st = this.pickStage.find((s) => !s.busy);
      if (st) {
        pickJob = { req: this.pickReq, st, simTime: this.simTime };
        this.pickReq = null;
        const pu = new ArrayBuffer(48);
        const pf = new Float32Array(pu), pv = new Uint32Array(pu);
        pf[0] = pickJob.req.center[0]; pf[1] = pickJob.req.center[1]; pf[2] = pickJob.req.radius;
        pv[3] = pickJob.req.selId; pv[4] = pickJob.req.maxOut; pv[5] = N; pf[6] = this.grid[0]; pf[7] = this.grid[1]; pv[8] = pickJob.req.kind;
        d.queue.writeBuffer(b.pickU, 0, pu);
        enc.clearBuffer(b.pickOut, 0, 56);
        const pass = enc.beginComputePass();
        pass.setPipeline(this.cpPick.pipe);
        pass.setBindGroup(0, this.cpPick.bg);
        pass.dispatchWorkgroups(Math.ceil(N / 256));
        pass.end();
        enc.copyBufferToBuffer(b.pickOut, 0, st.buf, 0, 56 + pickJob.req.maxOut * PICK_WORDS * 4);
      }
    }

    if (target) this._render(enc, { target, cam, time, dpr, selId, loupe, specimen, tsBegin, tsEnd: slot ? { querySet: tm.qs, endOfPassWriteIndex: 1 } : undefined });

    const timed = slot && (stepping || target);
    if (timed) {
      enc.resolveQuerySet(tm.qs, 0, 2, tm.resolve, 0);
      enc.copyBufferToBuffer(tm.resolve, 0, slot.buf, 0, 16);
    }
    d.queue.submit([enc.finish()]);

    if (timed) {
      slot.busy = true;
      slot.buf.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(slot.buf.getMappedRange());
        const ms = Number(t[1] - t[0]) / 1e6;
        slot.buf.unmap();
        slot.busy = false;
        if (generation === this.worldGeneration && ms > 0 && ms < 5000 && this.onGpuTime) this.onGpuTime(ms, N, nSteps);
      }).catch(() => { slot.busy = false; });
    } else if (!tm && this.onGpuTime && (stepping || target)) {
      d.queue.onSubmittedWorkDone().then(() => {
        if (generation === this.worldGeneration && this.onGpuTime) this.onGpuTime(performance.now() - t0, N, nSteps);
      });
    }

    if (pickJob) {
      const { st, req } = pickJob;
      st.busy = true;
      st.buf.mapAsync(GPUMapMode.READ).then(() => {
        if (generation !== this.worldGeneration) {
          st.buf.unmap();
          st.busy = false;
          req.resolve(null);
          return;
        }
        const buf = st.buf.getMappedRange();
        const u32 = new Uint32Array(buf), f32 = new Float32Array(buf);
        const count = Math.min(u32[0], req.maxOut);
        const found = u32[1] === 1;
        const out = { total: u32[0], truncated: u32[0] > req.maxOut, found, tracked: found ? parseParticle(u32, f32, 4) : null, entries: [], center: req.center, radius: req.radius, simTime: pickJob.simTime };
        if (req.raw) {
          const copy = buf.slice(56, 56 + count * PICK_WORDS * 4);
          out.raw = { u32: new Uint32Array(copy), f32: new Float32Array(copy), count };
        } else {
          for (let k = 0; k < count; k++) out.entries.push(parseParticle(u32, f32, 14 + k * PICK_WORDS));
        }
        st.buf.unmap();
        st.busy = false;
        req.resolve(out);
      }).catch(() => { st.busy = false; req.resolve(null); });
    }

    for (const trackJob of trackJobs) {
      const { st } = trackJob;
      st.buf.mapAsync(GPUMapMode.READ).then(() => {
        const buf = st.buf.getMappedRange();
        const u32 = new Uint32Array(buf), f32 = new Float32Array(buf);
        const found = u32[1] === 1;
        const tracked = found ? parseParticle(u32, f32, 4) : null;
        st.buf.unmap();
        st.busy = false;
        if (generation === this.worldGeneration && this.onTrack) this.onTrack({ id: trackJob.id, found, tracked, simTime: trackJob.simTime });
      }).catch(() => { st.busy = false; });
    }

    for (const job of censusJobs) this._censusRead(job, generation);
    if (listenJob) this._listenRead(listenJob, generation);
    if (surveyJob) this._surveyRead(surveyJob, generation);
  }

  /** Every so many frames while surveying: what happened in each tile of the world since the last survey. */
  _surveyCopy(enc) {
    const S = this.survey;
    if (!S) { this._surveySim = null; return null; }
    if (this._surveySim == null || this._surveySim > this.simTime) this._surveySim = this.simTime - 1 / 60;
    if (++this._surveyFrames < (S.every || 60)) return null;
    const st = this.surveyStage.find((s) => !s.busy);
    if (!st) return null;
    this._surveyFrames = 0;
    st.busy = true;
    const b = this.b;
    const [gw, gh] = this.grid;
    // tiles of at least 4 grid cells, no more than SURVEY_MAX_TILES of them
    let tile = Math.max(4, Math.ceil(Math.max(gw, gh) / 48));
    while (Math.ceil(gw / tile) * Math.ceil(gh / tile) > SURVEY_MAX_TILES) tile++;
    const tiles = [Math.ceil(gw / tile), Math.ceil(gh / tile)];
    const window = this.simTime - this._surveySim;
    this._surveySim = this.simTime;
    const u = new ArrayBuffer(32), f = new Float32Array(u), w = new Uint32Array(u);
    w[0] = gw; w[1] = gh; w[2] = tiles[0]; w[3] = tiles[1]; w[4] = tile;
    f[5] = this.simTime; f[6] = window; f[7] = this.K.adhMin;
    this.device.queue.writeBuffer(b.surveyU, 0, u);
    const bytes = tiles[0] * tiles[1] * SURVEY_WORDS * 4;
    enc.clearBuffer(b.survey, 0, bytes);
    const pass = enc.beginComputePass();
    pass.setPipeline(this.cpSurvey.pipe);
    pass.setBindGroup(0, this.cpSurvey.bg);
    pass.dispatchWorkgroups(Math.ceil((gw * gh) / 64));
    pass.end();
    enc.copyBufferToBuffer(b.survey, 0, st.buf, 0, bytes);
    return { st, bytes, simTime: this.simTime, window, tiles, tile };
  }

  _surveyRead(job, generation) {
    const { st } = job;
    st.buf.mapAsync(GPUMapMode.READ, 0, job.bytes).then(() => {
      const u = new Uint32Array(st.buf.getMappedRange(0, job.bytes).slice(0));
      st.buf.unmap();
      st.busy = false;
      if (generation !== this.worldGeneration || !this.onSurvey) return;
      this.onSurvey({ simTime: job.simTime, window: job.window, tiles: job.tiles, tile: job.tile, grid: [...this.grid], data: u });
    }).catch(() => { st.busy = false; });
  }

  /** Every few frames while listening: scan for events since the last scan (observational). */
  _listenCopy(enc, cam) {
    const L = this.listen;
    if (!L) { this._listenSim = null; return null; }
    if (this._listenSim == null || this._listenSim > this.simTime) this._listenSim = this.simTime - 1 / 60;
    if (++this._listenFrames < (L.every || 6)) return null;
    const st = this.listenStage.find((s) => !s.busy);
    if (!st) return null;
    this._listenFrames = 0;
    st.busy = true;
    const b = this.b;
    const [W, H] = this.size, ppu = Math.max(cam.ppu, 1e-6);
    const view = { x: cam.x, y: cam.y, hx: W > 0 ? W / (2 * ppu) : this.grid[0], hy: H > 0 ? H / (2 * ppu) : this.grid[1] };
    const window = this.simTime - this._listenSim;
    this._listenSim = this.simTime;
    const u = new ArrayBuffer(96), f = new Float32Array(u), w = new Uint32Array(u);
    f[0] = view.x; f[1] = view.y; f[2] = view.hx; f[3] = view.hy; f[4] = this.grid[0]; f[5] = this.grid[1];
    w[6] = this.count; w[7] = (Math.random() * 4294967295) >>> 0;
    f[8] = this.simTime; f[9] = window; f[10] = L.vscale || 1; w[11] = L.selKind ?? 0xffffffff;
    for (let t = 0; t < 9; t++) f[12 + t] = L.keep ? L.keep[t] : t === 8 ? 0.05 : 1;
    this.device.queue.writeBuffer(b.listenU, 0, u);
    enc.clearBuffer(b.listen, 0, LISTEN_HEAD * 4);
    const pass = enc.beginComputePass();
    pass.setPipeline(this.cpListen.pipe);
    pass.setBindGroup(0, this.cpListen.bg);
    pass.dispatchWorkgroups(Math.ceil(this.count / 256));
    pass.end();
    enc.copyBufferToBuffer(b.listen, 0, st.buf, 0, LISTEN_BYTES);
    return { st, simTime: this.simTime, window, view };
  }

  _listenRead(job, generation) {
    const { st } = job;
    st.buf.mapAsync(GPUMapMode.READ).then(() => {
      const u = new Uint32Array(st.buf.getMappedRange().slice(0));
      st.buf.unmap();
      st.busy = false;
      if (generation !== this.worldGeneration || !this.onListen) return;
      const n = Math.min(u[21], LISTEN_CAP);
      this.onListen({
        simTime: job.simTime, window: job.window, view: job.view,
        inView: u.subarray(0, 8), outView: u.subarray(8, 16),
        living: u[16], speed: u[17] / 1000 / Math.max(1, u[16]), livingAll: u[18], speedAll: u[19] / 1000 / Math.max(1, u[18]),
        particles: u[20], found: u[21],
        records: u.subarray(LISTEN_HEAD, LISTEN_HEAD + 4 * n), f32: new Float32Array(u.buffer, LISTEN_HEAD * 4, 4 * n),
      });
    }).catch(() => { st.busy = false; });
  }

  _writeView(buf, data, cam, W, H, dpr, time, selId) {
    const K = this.K;
    const ppu = cam.ppu;
    // a cell keeps one world size at every zoom, so zooming in only resolves it
    const pointSize = Math.max(1.1 * dpr, 0.085 * ppu);
    const perArea = K.density / (ppu * ppu);
    const overlapAll = perArea * pointSize * pointSize * 0.5;
    const overlapLife = overlapAll * 0.4;
    const lineCov = (K.density * 0.25 * dpr) / ppu;
    const v = new Float32Array(data);
    const vu = new Uint32Array(data);
    v[0] = cam.x; v[1] = cam.y; v[2] = this.grid[0]; v[3] = this.grid[1];
    v[4] = W; v[5] = H; v[6] = ppu; v[7] = pointSize;
    v[8] = (0.95 / (1 + overlapLife * 0.8)) * this.settings.exposure;
    v[9] = (0.55 / (1 + lineCov * 0.6)) * this.settings.exposure;
    v[10] = K.linkR; v[11] = time; vu[12] = selId >>> 0;
    v[13] = (0.075 / (1 + overlapAll * 0.9)) * this.settings.exposure;
    const f = this.focus;
    vu[14] = f.on; vu[15] = f.roleMask; vu[16] = f.stateMode; v[17] = f.mute; vu[18] = f.memberKind; vu[19] = f.memberN;
    this.device.queue.writeBuffer(buf, 0, data);
  }

  // the stone field for one view: every grain of stone adds its kernel (see vsStone)
  _drawStone(enc, views, bg) {
    const pass = enc.beginRenderPass({
      colorAttachments: views.slice(0, 2).map((view) => ({ view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' })),
      depthStencilAttachment: { view: views[2], depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
    pass.setPipeline(this.pStone);
    pass.setBindGroup(0, bg);
    pass.drawIndirect(this.b.frameCtr, 32);
    pass.end();
  }

  _drawScene(pass, bgLine, bgPoint, bgBridge, data) {
    const v = new Float32Array(data);
    if (this.settings.links) {
      // Crossfade native lines and soft strips in this same pass. The strip has zero
      // contribution at its topology switch, so subpixel line coverage cannot pop.
      if (v[7] < 30) {
        pass.setPipeline(this.pLine);
        pass.setBindGroup(0, bgLine);
        pass.drawIndirect(this.b.frameCtr, 16);
      }
      if (v[7] > 6) {
        pass.setPipeline(this.pBridge);
        pass.setBindGroup(0, bgBridge);
        pass.drawIndirect(this.b.bridgeDraw, 0);
      }
    }
    if (this.settings.nodes) {
      pass.setPipeline(this.pPoint);
      pass.setBindGroup(0, bgPoint);
      pass.draw(4, this.count);
    }
  }

  // The micro-suspension's specks for the main view (MICRO_WGSL): for each phase and resolved octave
  // of pondMicro, the block of lattice slots whose objects can land in view.
  _drawSpecks(enc, cam, W, H) {
    const d = this.device;
    const [gw, gh] = this.grid;
    const ppu = cam.ppu, t = this.simTime;
    let vmax = 0;
    for (let k = 0; k < 4; k++) vmax += Math.abs(this.waves[k * 4 + 3]);
    const hw = W / (2 * ppu), hh = H / (2 * ppu);
    const iv = new Int32Array(this.microData), fv = new Float32Array(this.microData), uv = new Uint32Array(this.microData);
    let n = 0, total = 0;
    for (let phase = 0; phase < 2; phase++) {
      const clock = t / 4 + phase * 0.5;
      const age = clock - Math.floor(clock);
      const weight = 1 - Math.abs(2 * age - 1);
      if (weight <= 0.001) continue;
      const tau = age * 4;
      for (let oct = 0; oct < 3; oct++) {
        const spacing = [0.055, 0.035, 0.008][oct], depth = oct === 0 ? 0.72 : 1;
        if (spacing * 1.55 * 0.075 * ppu <= 0.6) continue;
        const wx = gw * depth, wy = gh * depth;
        const th = 0.618033989 + oct * 2.39996323, ax = Math.cos(th), ay = Math.sin(th);
        const r0 = [Math.round(ax * wx / spacing), Math.round(ay * wy / spacing)];
        const r1 = [Math.round((-ay + ax * 0.37) * wx / spacing), Math.round((ax + ay * 0.37) * wy / spacing)];
        // the looked-up point: the view shifted to this plane's depth, give or take the drift
        const pad = tau * vmax * depth;
        const cx = cam.x * depth, cy = cam.y * depth;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const ux = (cx + sx * (hw + pad)) / wx, uy = (cy + sy * (hh + pad)) / wy;
          const px = r0[0] * ux + r0[1] * uy + oct * 17.3, py = r1[0] * ux + r1[1] * uy + oct * 9.7;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
        // the warp moves a slot up to 0.65, an object sits up to one slot from its corner, and reaches half a slot
        const m = 0.65 + 1.6;
        const sx0 = Math.floor(x0 - m), sy0 = Math.floor(y0 - m);
        const cols = Math.ceil(x1 + m) - sx0 + 1, rows = Math.ceil(y1 + m) - sy0 + 1;
        iv.set([sx0, sy0, cols, rows], n * 4);
        fv.set([weight, tau, Math.floor(clock) + phase * 131, oct], 24 + n * 4);
        uv[48 + n] = total;
        total += cols * rows;
        n++;
      }
    }
    uv[56] = total; uv[57] = n; fv[58] = ppu; uv[59] = MICRO_SPECKS;
    fv[60] = W; fv[61] = H; fv[62] = cam.x; fv[63] = cam.y;
    d.queue.writeBuffer(this.b.microU, 0, this.microData);
    d.queue.writeBuffer(this.b.microArgs, 0, new Uint32Array([4, 0, 0, 0]));
    if (total > 0) {
      const wg = Math.ceil(total / 64);
      const pass = enc.beginComputePass();
      pass.setPipeline(this.cpMicro);
      pass.setBindGroup(0, this.cpMicroBG);
      pass.dispatchWorkgroups(Math.min(wg, 65535), Math.ceil(wg / 65535));
      pass.end();
    }
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.microView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
    if (total > 0) {
      pass.setPipeline(this.pSpeck);
      pass.setBindGroup(0, this.speckBG);
      pass.drawIndirect(this.b.microArgs, 0);
    }
    pass.end();
  }

  _render(enc, { target, cam, time, dpr, selId, loupe, specimen, tsBegin, tsEnd }) {
    const d = this.device;
    const [W, H] = this.size;
    this._writeView(this.b.view, this.viewData, cam, W, H, dpr, time, selId);
    // The simulation's existing indirect args contain the living instance count. Only rendering
    // changes the vertex count; keep all ecology WGSL and buffers' contents untouched.
    if (new Float32Array(this.viewData)[7] > 6 || loupe || specimen) {
      enc.copyBufferToBuffer(this.b.frameCtr, 20, this.b.bridgeDraw, 4, 4);
    }

    const pd = this.postData;
    pd[0] = W; pd[1] = H; pd[2] = this.settings.bloom; pd[3] = 1.0;
    pd[4] = time; pd[5] = this.season; pd[6] = this.settings.tide; pd[7] = cam.ppu;
    pd[8] = cam.x; pd[9] = cam.y; pd[10] = this.grid[0]; pd[11] = this.grid[1];
    pd[12] = this.simTime; pd[13] = this.ambient; pd[14] = this.settings.optics;
    pd.set(this.tide, 16);
    pd.set(this.tidePh, 32);
    pd.set(this.waves, 36);
    d.queue.writeBuffer(this.b.post, 0, pd);

    // Cells fuse with their incoming bond partners, and flatten against the cells they press on, only
    // once outlines resolve (vsPoint: detailLOD(pointSize) > 0), so gather both only then, and only
    // for cells in view.
    const mainDetail = new Float32Array(this.viewData)[7] > 2.8;
    if (mainDetail || loupe || specimen) {
      // the grid cells each view covers, with a cell of margin so partners just outside still fuse
      const [gw, gh] = this.grid;
      const u = new Int32Array(20);
      const rect = (v, cx, cy, hw, hh) => {
        const x0 = Math.floor(cx - hw) - 1, y0 = Math.floor(cy - hh) - 1;
        u[v * 4] = x0; u[v * 4 + 1] = y0;
        u[8 + v * 4] = Math.min(gw, Math.floor(cx + hw) + 2 - x0); u[8 + v * 4 + 1] = Math.min(gh, Math.floor(cy + hh) + 2 - y0);
      };
      // the loupe lies inside the main view; alone (main view too distant for detail) it is the view
      if (mainDetail) rect(0, cam.x, cam.y, W / (2 * cam.ppu), H / (2 * cam.ppu));
      else if (loupe) rect(0, loupe.cx, loupe.cy, LOUPE_FIELD * loupe.r / loupe.ppu, LOUPE_FIELD * loupe.r / loupe.ppu);
      if (specimen) rect(1, specimen.cx, specimen.cy, specimen.w / (2 * specimen.ppu), specimen.h / (2 * specimen.ppu));
      u[16] = gw; u[17] = gh; new Float32Array(u.buffer)[18] = time;
      d.queue.writeBuffer(this.b.inbondU, 0, u);
      const pass = enc.beginComputePass({ timestampWrites: tsBegin() });
      for (let k = 0; k < 3; k++) {
        pass.setPipeline(this.cpInbond[k]);
        pass.setBindGroup(0, this.inbondBG[k]);
        pass.dispatchWorkgroups(Math.max(u[8], u[12]), Math.max(u[9], u[13]), specimen ? 2 : 1);
      }
      pass.setPipeline(this.cpOrgans);
      pass.setBindGroup(0, this.organsBG);
      pass.dispatchWorkgroups(Math.ceil((MAXK * ORGANS) / 64));
      pass.end();
    }
    {
      const clear = this.clearAccum || this.settings.trails <= 0 || !this.lastCam;
      this.clearAccum = false;
      const srcI = this.accIdx, dstI = 1 - this.accIdx;
      this.accIdx = dstI;
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.accumViews[dstI], loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }],
        timestampWrites: tsBegin(),
      });
      if (!clear) {
        const lc = this.lastCam;
        const dx = cam.x - lc.x, dy = cam.y - lc.y;
        const gx = this.grid[0], gy = this.grid[1];
        const wx = dx - gx * Math.round(dx / gx), wy = dy - gy * Math.round(dy / gy);
        const ratio = lc.ppu / cam.ppu;
        d.queue.writeBuffer(this.b.reprojU, 0, new Float32Array([ratio, ratio, (wx * lc.ppu) / W, (wy * lc.ppu) / H, this.settings.trails, 0, 0, 0]));
        pass.setPipeline(this.pReproj);
        pass.setBindGroup(0, this.reprojBG[srcI]);
        pass.draw(3);
      }
      this._drawScene(pass, this.bgLine, this.bgPoint, this.bgBridge, this.viewData);
      pass.end();
    }
    this._drawStone(enc, this.stoneView, this.bgStone);
    this.lastCam = { x: cam.x, y: cam.y, ppu: cam.ppu };
    const cur = this.accIdx;

    if (loupe) {
      // the lens is barrel-distorted: its rim shows LOUPE_FIELD times its radius, so render that much
      const span = loupe.r * 2 * LOUPE_FIELD;
      const L = Math.max(64, Math.min(1024, Math.ceil(span / 32) * 32));
      this._ensureLoupeTex(L);
      const lppu = loupe.ppu * (L / span);
      this._writeView(this.b.viewL, this.viewDataL, { x: loupe.cx, y: loupe.cy, ppu: lppu }, L, L, dpr * (L / span), time, selId);
      d.queue.writeBuffer(this.b.loupeU, 0, new Float32Array([loupe.x, loupe.y, loupe.r, 1, W, H, loupe.ppu, 0]));
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.loupeView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      this._drawScene(pass, this.bgLineL, this.bgPointL, this.bgBridgeL, this.viewDataL);
      pass.end();
      this._drawStone(enc, this.loupeStoneView, this.bgStoneL);
    }

    if (specimen && specimen.target) {
      this._ensureSpecTex(specimen.w, specimen.h);
      this._writeView(this.b.viewS, this.viewDataS, { x: specimen.cx, y: specimen.cy, ppu: specimen.ppu }, specimen.w, specimen.h, specimen.dpr, time, selId);
      let pass = enc.beginRenderPass({ colorAttachments: [{ view: this.specView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      this._drawScene(pass, this.bgLineS, this.bgPointS, this.bgBridgeS, this.viewDataS);
      pass.end();
      this._drawStone(enc, this.specStoneView, this.bgStoneS);
      pass = enc.beginRenderPass({ colorAttachments: [{ view: specimen.target, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
      pass.setPipeline(this.pPlain); pass.setBindGroup(0, this.specBG); pass.draw(3); pass.end();
    }

    if (this.settings.bloom > 0) {
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.bloomViews[i], loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
        pass.setPipeline(this.pDown); pass.setBindGroup(0, i === 0 ? this.down0BG[cur] : this.downBG[i]); pass.draw(3); pass.end();
      }
      for (const u of this.upBG) {
        const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.bloomViews[u.target], loadOp: 'load', storeOp: 'store' }] });
        pass.setPipeline(this.pUp); pass.setBindGroup(0, u.bg); pass.draw(3); pass.end();
      }
    } else {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.bloomViews[0], loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      pass.end();
    }

    if (this.settings.optics > 0) {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.murkView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      pass.setPipeline(this.pMurk); pass.setBindGroup(0, this.murkBG); pass.draw(3); pass.end();
    }

    const micro = cam.ppu > Math.max(80, 2 * Math.max(W / this.grid[0], H / this.grid[1]));
    if (micro) this._drawSpecks(enc, cam, W, H);

    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }],
      timestampWrites: tsEnd,
    });
    pass.setPipeline(micro ? this.pComp : this.pCompClear);
    pass.setBindGroup(0, micro ? this.compBG[cur] : this.compClearBG[cur]); pass.draw(3);
    if (loupe) { pass.setPipeline(this.pLoupe); pass.setBindGroup(0, this.loupeBG); pass.draw(6); }
    pass.end();
  }
}
