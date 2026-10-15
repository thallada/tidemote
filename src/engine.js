import {
  simWGSL, CULL_WGSL, CULL_SEGS, PICK_WGSL, LISTEN_WGSL, SURVEY_WGSL, SURVEY_WORDS, SURVEY_MAX_TILES, INBOND_WGSL, LISTEN_CAP, LISTEN_HEAD, LISTEN_REC, WATCH_WGSL, WATCH_MAX, DRAW_WGSL, POST_WGSL, MICRO_WGSL, MICRO_SPECKS, ORGANS, DEFAULT_K,
  MAXK, FIRST_LIFE, MAX_CELLS, META_SLOT, META_POP, META_DEATH, META_ENERGY, META_DIAG, META_CLAIM, P_BYTES, PICK_WORDS, G_BYTES, LITE_BYTES, LOUPE_FIELD, MIND_BYTES,
} from './shaders.js';
import {
  archetypeGenome, writeGenome, parseParticle,
  packUnorm, ARCHETYPE_TYPES,
} from './genome.js';
import { TIDE_PHASE } from './flow.js';

const HDR = 'rgba16float';
const BLOOM_LEVELS = 6;
// absent in a browser without WebGPU, which must still load the page to say so
const U = globalThis.GPUBufferUsage ?? {};
export const PICK_MAX = 131072;
export const FOCUS_MAX = 65536;
const PICK_BYTES = 56 + PICK_MAX * PICK_WORDS * 4;
const LEDGER_HEAD = META_CLAIM * 4;
const CENSUS_BYTES = LEDGER_HEAD + MAXK * G_BYTES;
const LISTEN_BYTES = (LISTEN_HEAD + LISTEN_REC * LISTEN_CAP) * 4;
const SURVEY_BYTES = SURVEY_MAX_TILES * SURVEY_WORDS * 4;
export { MAXK, FIRST_LIFE, DEFAULT_K };

const mix = (a, b, t) => a + (b - a) * t;
const SIM_STRIDE = 256;
// the largest sprite radius, in pixels, splatted rather than drawn as a quad (splatMain)
const SPLAT_PX = 1.6;
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
    // particles a cell weighs in a crowd per step (the page's Neighbours setting); a uniform, so it changes live
    this.maxScan = K.maxScan;
    this.capacity = 0;
    this.count = 0;
    this.grid = [3, 3];
    this.simTime = 0;
    this.frameNo = 0;
    this.tick = 0; // 1/60 s ticks simulated: one a step, more a coarse step (the meal cadence counts them)
    this.ticks = 1;
    this.worldGeneration = 0;
    this.season = 1;
    this.abio = 0;
    this.ambient = 0.17;
    this.chargeMul = 1;
    // the water's background temperature: the climate's (temp, eased), an excursion (heat wave or cold
    // snap) on top, and the tide's season (tbg)
    this.temp = 16;
    this.excursion = 0;
    this.tide = new Float32Array([1, 1, 0.021, 1, 2, -1, -0.017, 1, -1, 3, 0.013, 0.7, 1, -2, 0.011, 0]);
    this.tidePh = Float32Array.from(TIDE_PHASE);
    this.seedValue = 1;
    this.censusEvery = 20;
    this.settings = { trails: 0.45, links: true, nodes: true, bloom: 0.012, exposure: 1.0, tide: 1, heat: 1, bands: 0, optics: 1, specks: true, lod: true };
    this.simData = new ArrayBuffer(256);
    this.rock = new Float32Array(4);
    this.simF = new Float32Array(this.simData);
    this.simU = new Uint32Array(this.simData);
    this.waves = new Float32Array(16);
    this.viewData = new ArrayBuffer(96);
    this.viewDataL = new ArrayBuffer(96);
    this.postData = new Float32Array(60);
    this.loupe = null;
    this.focus = { on: 0, roleMask: 7, stateMode: 0, mute: 0.16, memberKind: 0xffffffff, memberN: 0 };
    this.viewDataS = new ArrayBuffer(96);
    this.onGpuTime = null;
    this.onCensus = null;
    this.pickReq = null;
    // Up to two particles followed every frame (the page's selection and the auto camera's subject).
    this.trackId = 0xffffffff;
    this.trackId2 = 0xffffffff;
    // each tracking slot's last sighting, to look for it near there first
    this.trackSeen = [null, null];
    this.onTrack = null;
    // The selected cell's mind (mindMain), replayed every `mindEvery` frames while mindId is set.
    this.mindId = 0xffffffff;
    this.mindEvery = 6;
    this.onMind = null;
    this._mindFrames = 0;
    this.lastCam = null;
    this.accIdx = 0;
    this.size = [0, 0];
    this.b = {};

    const d = device;
    const b = this.b;
    b.sim = d.createBuffer({ size: 256, usage: U.UNIFORM | U.COPY_DST });
    // the heat field: deposits, temperatures and husks per cell, and heatMain's next temperatures (shaders.js)
    b.thermal = d.createBuffer({ size: (K.scent > 0 ? 4 : 3) * MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.heatNext = d.createBuffer({ size: MAX_CELLS * 4, usage: U.STORAGE | U.COPY_SRC });
    b.simRing = d.createBuffer({ size: SIM_STRIDE * MAX_STEPS, usage: U.COPY_SRC | U.COPY_DST });
    this.ringData = new ArrayBuffer(SIM_STRIDE * MAX_STEPS);
    b.view = d.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST });
    b.viewL = d.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST });
    b.viewS = d.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST });
    b.focus = d.createBuffer({ size: (MAXK / 32 + FOCUS_MAX) * 4, usage: U.STORAGE | U.COPY_DST });
    b.post = d.createBuffer({ size: 240, usage: U.UNIFORM | U.COPY_DST });
    b.loupeU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    b.pickU = d.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    // per grid cell: its particles (with K.liveFirst, its matter, then its living)
    b.counts = d.createBuffer({ size: (K.liveFirst ? 2 : 1) * MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST });
    b.stoneGrid = d.createBuffer({ size: MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST });
    // each grid cell's first particle (and one past the last); with K.liveFirst then each one's living count
    b.cellStart = d.createBuffer({ size: ((K.liveFirst ? 2 : 1) * MAX_CELLS + 1) * 4, usage: U.STORAGE });
    b.blockSums = d.createBuffer({ size: (MAX_CELLS / 256) * 4, usage: U.STORAGE });
    b.genomes = d.createBuffer({ size: MAXK * G_BYTES, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.frameCtr = d.createBuffer({ size: 48, usage: U.STORAGE | U.INDIRECT | U.COPY_SRC | U.COPY_DST });
    b.bridgeDraw = d.createBuffer({ size: 16, usage: U.INDIRECT | U.COPY_DST });
    d.queue.writeBuffer(b.bridgeDraw, 0, new Uint32Array([30, 0, 0, 0]));
    b.pickOut = d.createBuffer({ size: PICK_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    // tracking has its own uniforms and output per slot, so both slots and a pick share a frame
    b.trackU = [0, 1].map(() => d.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST }));
    b.trackOut = [0, 1].map(() => d.createBuffer({ size: 56 + PICK_WORDS * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }));
    // the full scan's workgroups, none once the search near where it was expected found it (trackArgs)
    b.trackArgs = [0, 1].map(() => d.createBuffer({ size: 12, usage: U.STORAGE | U.INDIRECT }));
    // watching: up to WATCH_MAX particles found by id every frame (the page sets this.watch to them, each
    // { id, x, y, vx, vy, t } where last seen, to look near there first)
    b.watchU = d.createBuffer({ size: 16 + WATCH_MAX * 20, usage: U.UNIFORM | U.COPY_DST });
    b.watchArgs = d.createBuffer({ size: 12, usage: U.STORAGE | U.INDIRECT | U.COPY_SRC });
    b.watchOut = d.createBuffer({ size: WATCH_MAX * 20, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    // (and after them, the full scan's workgroups: whether it ran)
    this.watchStage = [0, 1, 2, 3].map(() => ({ buf: d.createBuffer({ size: WATCH_MAX * 20 + 4, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    this.watch = [];
    // ids a full scan didn't find (died since they sang): ids aren't reused, so they aren't looked for again
    this.watchGone = new Set();
    this.onWatch = null;
    b.mind = d.createBuffer({ size: MIND_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    this.mindStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: MIND_BYTES, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
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

    const dp4a = !!globalThis.navigator?.gpu?.wgslLanguageFeatures?.has('packed_4x8_integer_dot_product');
    this.simModule = d.createShaderModule({ code: simWGSL(K, { dp4a }), label: 'sim' });
    this.pickModule = d.createShaderModule({ code: PICK_WGSL, label: 'pick' });
    this.listenModule = d.createShaderModule({ code: LISTEN_WGSL, label: 'listen' });
    this.watchModule = d.createShaderModule({ code: WATCH_WGSL, label: 'watch' });
    this.surveyModule = d.createShaderModule({ code: SURVEY_WGSL, label: 'survey' });
    this.drawModule = d.createShaderModule({ code: DRAW_WGSL, label: 'draw' });
    // culling for the main view, the loupe and the specimen (CULL_WGSL): uniforms, segments, draw arguments
    const cullModule = d.createShaderModule({ code: CULL_WGSL, label: 'cull' });
    this.cpCull = d.createComputePipeline({ layout: 'auto', compute: { module: cullModule, entryPoint: 'cullRows' }, label: 'cullRows' });
    this.cull = [0, 1, 2].map(() => {
      const u = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
      const segs = d.createBuffer({ size: CULL_SEGS * 8, usage: U.STORAGE });
      const args = d.createBuffer({ size: 48, usage: U.STORAGE | U.INDIRECT });
      return { u, segs, args, bg: d.createBindGroup({ layout: this.cpCull.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: u } }, { binding: 1, resource: { buffer: b.cellStart } },
        { binding: 2, resource: { buffer: segs } }, { binding: 3, resource: { buffer: args } }] }) };
    });
    // particles are in grid-cell order (cellStart valid) once a step has sorted them
    this.sorted = false;
    b.inbondU = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    const inbond = d.createShaderModule({ code: INBOND_WGSL, label: 'inbond' });
    this.cpInbond = ['inbondReset', 'inbondGather', 'contactGather'].map((entryPoint) => d.createComputePipeline({ layout: 'auto', compute: { module: inbond, entryPoint }, label: entryPoint }));
    this.cpOrgans = d.createComputePipeline({ layout: 'auto', compute: { module: inbond, entryPoint: 'organDirs' }, label: 'organDirs' });
    b.organDir = d.createBuffer({ size: MAXK * ORGANS * 4, usage: U.STORAGE });
    this.postModule = d.createShaderModule({ code: POST_WGSL, label: 'post' });

    const cp = (mod, entryPoint) => d.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint }, label: entryPoint });
    this.cpDefs = {
      seedMain: [0, 1, 9, 10, 11],
      resolveCount: [0, 1, 4, 8, 9, 10, 11, 14, 18],
      scanBlocks: [5, 6, 7],
      scanSums: [6, 7],
      scanAdd: [6, 7],
      scatterMain: [0, 1, 2, 3, 6, 8, 9, 10, 12, 13, 15],
      censusMain: [11, 12, 13],
      matterMain: [0, 1, 2, 9, 10, 11, 13, 14, 16, 18],
      lifeMain: [0, 1, 2, 3, 6, 9, 10, 11, 12, 15, 18],
      heatMain: [0, 14, 18, 19],
      mindMain: [0, 2, 3, 6, 10, 15, 17, 18],
    };
    // K.tissue: bonds pull both ways, through the cells that keep a bond to each (bondsNow holds them)
    if (K.tissue > 0) {
      this.cpDefs.bondBackMain = [0, 2, 12, 20];
    }
    // contact between living cells, in its own pass before lifeMain (contactMain)
    this.contact = !!K.liveFirst && (K.bodyPush > 0 || K.crowdVisc > 0);
    if (this.contact) this.cpDefs.contactMain = [0, 2, 3, 6, 12];
    // coarse steps run their own lifeMain and mindMain (COARSE in simWGSL)
    this.cpDefs.lifeMainCoarse = this.cpDefs.lifeMain;
    this.cpDefs.mindMainCoarse = this.cpDefs.mindMain;
    this.cp = {};
    for (const name of Object.keys(this.cpDefs)) {
      const coarse = name.endsWith('Coarse');
      this.cp[name] = { pipe: coarse ? d.createComputePipeline({ layout: 'auto', compute: { module: this.simModule, entryPoint: name.slice(0, -6), constants: { COARSE: 1 } }, label: name }) : cp(this.simModule, name), bg: null };
    }
    this.cpPick = { pipe: cp(this.pickModule, 'pickMain'), bg: null };
    this.cpTrackNear = cp(this.pickModule, 'trackNear');
    this.cpTrackArgs = cp(this.pickModule, 'trackArgs');
    this.cpListen = { pipe: cp(this.listenModule, 'listenMain'), bg: null };
    this.cpWatch = { pipe: cp(this.watchModule, 'watchMain'), bg: null };
    this.cpWatchNear = cp(this.watchModule, 'watchNear');
    this.cpWatchArgs = cp(this.watchModule, 'watchArgs');
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
    // sprites of a pixel or so, splatted into a buffer and added into the scene (splatMain, fsSplat)
    this.cpSplat = d.createComputePipeline({ layout: 'auto', compute: { module: this.drawModule, entryPoint: 'splatMain' }, label: 'splatMain' });
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
        // 0: start of the frame's first pass, 1: end of its last, 2: end of its last simulation step
        qs: d.createQuerySet({ type: 'timestamp', count: 3 }),
        resolve: d.createBuffer({ size: 24, usage: U.QUERY_RESOLVE | U.COPY_SRC }),
        reads: [0, 1, 2].map(() => ({ buf: d.createBuffer({ size: 24, usage: U.COPY_DST | U.MAP_READ }), busy: false })),
      };
    }
    this.censusStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: CENSUS_BYTES, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    this.pickStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: PICK_BYTES, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    this.trackStage = [0, 1, 2, 3, 4, 5, 6, 7].map(() => ({ buf: d.createBuffer({ size: 56, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    b.reprojU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    // The main view's scene pass also gathers the living alone in a second target (fsPointLive), which
    // the composite lays over matter and stone; its other draws leave that target be.
    const rpLive = (mod, vs, fs, topology, blend, live) => d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: vs },
      fragment: { module: mod, entryPoint: fs, targets: [{ format: HDR, blend }, { format: HDR, blend: additive, writeMask: live ? GPUColorWrite.ALL : 0 }] },
      primitive: { topology },
      label: fs + '+live',
    });
    this.main = {
      point: rpLive(this.drawModule, 'vsPoint', 'fsPointLive', 'triangle-strip', additive, true),
      splat: rpLive(this.drawModule, 'vsFade', 'fsSplat', 'triangle-list', additive, false),
      line: rpLive(this.drawModule, 'vsLine', 'fsLine', 'line-list', additive, false),
      bridge: rpLive(this.drawModule, 'vsBridge', 'fsBridge', 'triangle-strip', additive, false),
      reproj: rpLive(this.postModule, 'vsFull', 'fsReproj', 'triangle-list', undefined, false),
    };
    // Max and coarse speeds: the last drawn world, carried with the camera onto the display frames between draws
    b.holdU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    this.pHold = rp(this.postModule, 'vsFull', 'fsReproj', 'triangle-list', undefined, format);

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
    const names = ['parts', 'sortedFull', 'sortedLite', 'aux', 'intent', 'bondsNow', 'bondsIn', 'touch', 'sway', 'stoneList', 'ledger', 'livingList', 'quads'];
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
    b.bondsNow = d.createBuffer({ size: n * (this.K.tissue > 0 ? 24 : 8), usage: U.STORAGE });
    b.bondsIn = d.createBuffer({ size: n * 20, usage: U.STORAGE });
    // contacts start absent (NONE) until the first gather in view
    b.touch = d.createBuffer({ size: n * 24, usage: U.STORAGE, mappedAtCreation: true });
    new Uint32Array(b.touch.getMappedRange()).fill(0xffffffff);
    b.touch.unmap();
    b.sway = d.createBuffer({ size: n * 24, usage: U.STORAGE });
    b.stoneList = d.createBuffer({ size: n * 4, usage: U.STORAGE });
    b.ledger = d.createBuffer({ size: (META_CLAIM + n) * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.livingList = d.createBuffer({ size: (n + 256) * 4, usage: U.STORAGE | U.COPY_DST });
    // the particles too large to splat (splatMain): the points' draw arguments, then their indices
    b.quads = d.createBuffer({ size: (4 + n) * 4, usage: U.STORAGE | U.INDIRECT | U.COPY_DST });
    const res = {
      0: { buffer: b.sim }, 1: { buffer: b.parts }, 2: { buffer: b.sortedFull }, 3: { buffer: b.sortedLite },
      4: { buffer: b.counts }, 5: { buffer: b.counts }, 6: { buffer: b.cellStart }, 7: { buffer: b.blockSums },
      8: { buffer: b.aux }, 9: { buffer: b.intent }, 10: { buffer: b.genomes }, 11: { buffer: b.ledger },
      12: { buffer: b.livingList }, 13: { buffer: b.frameCtr }, 14: { buffer: b.stoneGrid },
      15: { buffer: b.bondsNow }, 20: { buffer: b.bondsNow }, 16: { buffer: b.stoneList }, 17: { buffer: b.mind }, 18: { buffer: b.thermal }, 19: { buffer: b.heatNext },
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
    this.trackNearBG = [0, 1].map((k) => d.createBindGroup({ layout: this.cpTrackNear.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.trackU[k] } }, { binding: 1, resource: { buffer: b.parts } },
      { binding: 2, resource: { buffer: b.trackOut[k] } }, { binding: 4, resource: { buffer: b.cellStart } }] }));
    this.trackArgsBG = [0, 1].map((k) => d.createBindGroup({ layout: this.cpTrackArgs.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.trackU[k] } }, { binding: 2, resource: { buffer: b.trackOut[k] } },
      { binding: 5, resource: { buffer: b.trackArgs[k] } }] }));
    this.cpWatch.bg = d.createBindGroup({ layout: this.cpWatch.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.watchU } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.watchOut } }] });
    this.watchNearBG = d.createBindGroup({ layout: this.cpWatchNear.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.watchU } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.watchOut } },
      { binding: 3, resource: { buffer: b.cellStart } }] });
    this.watchArgsBG = d.createBindGroup({ layout: this.cpWatchArgs.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.watchU } }, { binding: 2, resource: { buffer: b.watchOut } }, { binding: 4, resource: { buffer: b.watchArgs } }] });
    this.cpListen.bg = d.createBindGroup({ layout: this.cpListen.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.listenU } }, { binding: 1, resource: { buffer: b.parts } },
      { binding: 2, resource: { buffer: b.genomes } }, { binding: 3, resource: { buffer: b.listen } }, { binding: 4, resource: { buffer: b.thermal } }] });
    this.cpSurvey.bg = d.createBindGroup({ layout: this.cpSurvey.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.surveyU } }, { binding: 1, resource: { buffer: b.parts } },
      { binding: 2, resource: { buffer: b.genomes } }, { binding: 3, resource: { buffer: b.cellStart } },
      { binding: 4, resource: { buffer: b.survey } }] });
    const pointBG = (view, k, pipe = this.pPoint) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.genomes } },
      { binding: 3, resource: { buffer: b.intent } },
      { binding: 5, resource: { buffer: b.focus } }, { binding: 6, resource: { buffer: b.bondsIn } },
      { binding: 8, resource: { buffer: b.touch } }, { binding: 9, resource: { buffer: b.sway } },
      { binding: 10, resource: { buffer: b.organDir } }, { binding: 11, resource: { buffer: b.thermal } }, { binding: 12, resource: { buffer: this.cull[k].segs } },
      { binding: 16, resource: { buffer: b.quads } }] });
    this.organsBG = d.createBindGroup({ layout: this.cpOrgans.getBindGroupLayout(0), entries: [
      { binding: 7, resource: { buffer: b.genomes } }, { binding: 9, resource: { buffer: b.organDir } }] });
    const stoneBG = (view) => d.createBindGroup({ layout: this.pStone.getBindGroupLayout(0), entries:
      [[0, view], [1, b.parts], [2, b.genomes], [5, b.focus], [7, b.stoneList], [11, b.thermal]].map(([binding, buffer]) => ({ binding, resource: { buffer } })) });
    this.bgStone = stoneBG(b.view); this.bgStoneL = stoneBG(b.viewL); this.bgStoneS = stoneBG(b.viewS);
    const inbondRes = [null, b.intent, b.parts, b.bondsIn, b.inbondU, b.cellStart, b.touch, b.genomes, b.sway];
    const inbondUse = [[2, 3, 4, 5], [1, 2, 3, 4, 5], [2, 4, 5, 6, 7, 8]];
    this.inbondBG = this.cpInbond.map((pipe, k) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0),
      entries: inbondUse[k].map((binding) => ({ binding, resource: { buffer: inbondRes[binding] } })) }));
    const lineBG = (pipe, view, k) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.genomes } },
      { binding: 3, resource: { buffer: b.intent } }, { binding: 4, resource: { buffer: b.livingList } }, { binding: 5, resource: { buffer: b.focus } },
      { binding: 11, resource: { buffer: b.thermal } }, { binding: 12, resource: { buffer: this.cull[k].segs } }] });
    this.bgPoint = pointBG(b.view, 0);
    this.bgLine = lineBG(this.pLine, b.view, 0);
    // the main view's scene pass (two targets: its pipelines' own layouts)
    this.mainBG = { point: pointBG(b.view, 0, this.main.point), line: lineBG(this.main.line, b.view, 0), bridge: lineBG(this.main.bridge, b.view, 0) };
    this.bgPointL = pointBG(b.viewL, 1);
    this.bgLineL = lineBG(this.pLine, b.viewL, 1);
    this.bgPointS = pointBG(b.viewS, 2);
    this.bgLineS = lineBG(this.pLine, b.viewS, 2);
    this.bgBridge = lineBG(this.pBridge, b.view, 0);
    this.bgBridgeL = lineBG(this.pBridge, b.viewL, 1);
    this.bgBridgeS = lineBG(this.pBridge, b.viewS, 2);
    const verr = await d.popErrorScope();
    const oerr = await d.popErrorScope();
    if (verr || oerr) {
      for (const k of names) { b[k]?.destroy(); b[k] = null; }
      return false;
    }
    this.capacity = n;
    this._splatBGs();
    return true;
  }

  resize(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (this.size[0] === w && this.size[1] === h) return;
    this.size = [w, h];
    const d = this.device;
    // The trails carry over: the last frame's image is reprojected into the new size once (the
    // reprojection samples by texture coordinate), then let go.
    this.carry?.tex.destroy();
    this.carry = null;
    if (this.accum) {
      const keep = this.accum[this.accIdx];
      this.accum[1 - this.accIdx].destroy();
      if (!this.clearAccum && this.lastCam) {
        this.carry = { tex: keep, bg: d.createBindGroup({ layout: this.main.reproj.getBindGroupLayout(0), entries: [
          { binding: 0, resource: this.sampler }, { binding: 1, resource: keep.createView() }, { binding: 5, resource: { buffer: this.b.reprojU } }] }) };
      } else keep.destroy();
      this.bloom.forEach((t) => t.destroy()); this.murkTex.destroy(); this.microTex.destroy();
    }
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
    this.liveTex?.destroy();
    this.liveTex = tex(w, h);
    this.liveView = this.liveTex.createView();
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
      { binding: 10, resource: this.microView }, { binding: 11, resource: { buffer: this.b.thermal } }, { binding: 12, resource: this.liveView }] }));
    this.compBG = compBG(this.pComp);
    this.compClearBG = compBG(this.pCompClear);
    this.reprojBG = this.accumViews.map((v) => d.createBindGroup({ layout: this.main.reproj.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: v }, { binding: 5, resource: { buffer: this.b.reprojU } }] }));
    this.holdTex?.destroy();
    this.holdTex = d.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.holdView = this.holdTex.createView();
    this.holdBG = d.createBindGroup({ layout: this.pHold.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: this.holdView }, { binding: 5, resource: { buffer: this.b.holdU } }] });
    this.holdCam = null;
    this.clearAccum = !this.carry;
    this.b.splat?.destroy();
    this.b.splat = d.createBuffer({ size: w * h * 12, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this._splatBGs();
  }

  _splatBGs() {
    const d = this.device, b = this.b;
    if (!b.splat || !b.parts) return;
    this.splatBG = d.createBindGroup({ layout: this.cpSplat.getBindGroupLayout(0), entries: [[0, b.view], [1, b.parts], [2, b.genomes], [3, b.intent], [5, b.focus], [11, b.thermal], [13, b.splat], [15, b.quads]]
      .map(([binding, buffer]) => ({ binding, resource: { buffer } })) });
    this.splatDrawBG = d.createBindGroup({ layout: this.main.splat.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: b.view } }, { binding: 14, resource: { buffer: b.splat } }] });
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
    this.tick = 0;
    this.seedValue = (rng() * 0xffffffff) >>> 0;
    this.sorted = false;
    this.ambient = mix(0.12, 0.3, rng());
    this.chargeMul = mix(0.8, 1.25, rng());
    this.temp = mix(10, 22, rng());
    this.excursion = 0;
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
    const matterCols = [[0.3, 0.34, 0.46], [0.7, 0.93, 1.0], [0.5, 0.35, 0.25], [0.62, 0.57, 0.5], [0.8, 0.7, 0.45]];
    for (let m = 0; m < FIRST_LIFE; m++) {
      const g = archetypeGenome('plankton', rng, this.K);
      g.col = packUnorm(...matterCols[m]);
      writeGenome(gu, gf, m, g);
    }
    const head = new Uint32Array(META_CLAIM);
    // Each world draws its own founding mix.
    const weights = ARCHETYPE_TYPES.map(() => rng() ** 2);
    const total = weights.reduce((a, b) => a + b, 0);
    const draw = (w, sum) => {
      let pick = rng() * sum, i = 0;
      while (i < w.length - 1 && pick >= w[i]) pick -= w[i++];
      return ARCHETYPE_TYPES[i];
    };
    const plan = Array.from({ length: 24 }, () => draw(weights, total));
    // a world starts as a food pyramid: at most K.foundHunt of its founders eat flesh (the rest redrawn)
    const eatsFlesh = (t) => t === 'hunter' || t === 'crawler';
    const plants = weights.map((w, i) => (eatsFlesh(ARCHETYPE_TYPES[i]) ? 0 : w));
    const plantSum = plants.reduce((a, b) => a + b, 0);
    let hunters = plan.filter(eatsFlesh).length;
    for (let s = 0; s < plan.length && hunters > Math.floor(this.K.foundHunt * plan.length) && plantSum > 0; s++) {
      if (eatsFlesh(plan[s])) { plan[s] = draw(plants, plantSum); hunters--; }
    }
    // K.foundEach: every core niche founded at least this many times (producers, grazers, hunters,
    // scavengers), taking the places of the commonest founding plans; the rest stay as drawn
    if (this.K.foundEach > 0) {
      const niches = [['reef', 'plankton', 'filament'], ['grazer'], ['hunter'], ['scavenger']];
      const nicheOf = (t) => niches.findIndex((n) => n.includes(t));
      for (const n of niches) {
        let have = plan.filter((t) => n.includes(t)).length;
        while (have < this.K.foundEach) {
          // replace one founder of the niche with the most founders (never one this pass still needs)
          const counts = niches.map((m) => plan.filter((t) => m.includes(t)).length);
          const from = counts.indexOf(Math.max(...counts.map((c, i) => (niches[i] === n ? -1 : c))));
          const at = plan.findIndex((t) => nicheOf(t) === from);
          if (at < 0) break;
          plan[at] = n[Math.floor(rng() * n.length)];
          have++;
        }
      }
    }
    head[0] = n;
    head[1] = plan.length;
    // founders suit the water they will live in: the background, warmed a little by life
    const warm = this.temp + 3;
    plan.forEach((type, s) => {
      const g = archetypeGenome(type, rng, this.K, warm);
      g.serial = s + 1;
      writeGenome(gu, gf, FIRST_LIFE + s, g);
      head[META_SLOT + FIRST_LIFE + s] = 1;
    });
    d.queue.writeBuffer(this.b.genomes, 0, gbuf);
    d.queue.writeBuffer(this.b.ledger, 0, head);
    this.founders = plan.length;

    this._writeSim({ seedKinds: plan.length, pSilt: silt, pGlint: glint, pHusk: husk, clump, spread });
    // the water starts at the background everywhere; framboids and crowds warm it within a minute
    const water = new Float32Array(cells).fill(this.tbg);
    d.queue.writeBuffer(this.b.thermal, MAX_CELLS * 4, water);
    const enc = d.createCommandEncoder();
    enc.clearBuffer(this.b.thermal, 0, cells * 4);
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
    this.tide[k * 4 + 2] = (rng() < 0.5 ? -1 : 1) * mix(0.008, 0.03, rng()) * (this.K.tideSpeed ?? 1);
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

  /** The background water temperature: the climate's, the tide's season (±2.5°) and any excursion. */
  get tbg() { return this.temp + (2.5 * (this.season - 0.55)) / 0.45 + this.excursion; }

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
    // a coarse step keeps per-second rates: the per-step abiogenesis chance scales with its length
    f[8] = this.season; f[9] = Math.min(1, this.abio * this.ticks);
    u[10] = (this.seedValue + this.frameNo * 7919) >>> 0; f[11] = this.K.maxSpeed;
    u[12] = extra.seedKinds || 1; f[13] = extra.pSilt || 0; f[14] = extra.pGlint || 0; f[15] = extra.pHusk || 0;
    f[16] = this.ambient; f[17] = this.chargeMul; f[18] = extra.clump || 0; f[19] = extra.spread || 0;
    f.set(this.waves, 20);
    f.set(this.tide, 36);
    f.set(this.tidePh, 52);
    f.set(this.rock, 56);
    u[60] = this.tick; u[61] = this.ticks; f[62] = this.tbg; u[63] = this.maxScan;
  }

  requestPick(center, radius, selId, { kind = 0xffffffff, maxOut = 4096, raw = false } = {}) {
    return new Promise((resolve) => {
      if (this.pickReq) this.pickReq.resolve(null);
      this.pickReq = { center, radius, selId: selId >>> 0, kind, maxOut: Math.max(1, Math.min(Math.ceil(maxOut), PICK_MAX)), raw, resolve };
    });
  }

  /**
   * Encode one simulation step whose uniforms are at `ring` (a slot of b.simRing), or written directly.
   * prof: {qs, names}, to time each dispatch in a pass of its own (profileStep).
   */
  _step(enc, simDt, timestampWrites, ring = -1, prof = null) {
    const b = this.b;
    const N = this.count;
    this.dt = simDt;
    this.simTime += simDt;
    this.frameNo++;
    this.ticks = Math.max(1, Math.round(simDt * 60));
    this.tick += this.ticks;
    if (ring < 0) this._writeSim();
    else {
      this._fillSim();
      new Uint8Array(this.ringData, ring * SIM_STRIDE, this.simData.byteLength).set(new Uint8Array(this.simData));
      enc.copyBufferToBuffer(b.simRing, ring * SIM_STRIDE, b.sim, 0, this.simData.byteLength);
    }
    const cells = this.grid[0] * this.grid[1];
    this.sorted = true;
    enc.clearBuffer(b.counts, 0, cells * 4);
    if (this.K.liveFirst) enc.clearBuffer(b.counts, MAX_CELLS * 4, cells * 4);
    enc.clearBuffer(b.stoneGrid, 0, cells * 4);
    if (this.K.heat) enc.clearBuffer(b.thermal, 2 * MAX_CELLS * 4, cells * 4);
    if (this.K.heat && this.K.scent > 0) enc.clearBuffer(b.thermal, 3 * MAX_CELLS * 4, cells * 4);
    enc.clearBuffer(b.ledger, META_POP * 4, MAXK * 4);
    // K.cycle's litter on the ground (META_DEATH + 60) and K.cyst's cysts per guild (57-59, 61, 62), counted afresh each step
    if (this.K.cycle || this.K.cyst) enc.clearBuffer(b.ledger, (META_DEATH + 57) * 4, 6 * 4);
    enc.clearBuffer(b.frameCtr, 0, 4);
    enc.clearBuffer(b.frameCtr, 36, 4);
    enc.clearBuffer(b.ledger, 48, 12);
    let pass = prof ? null : enc.beginComputePass({ timestampWrites });
    const run = (name, n) => {
      const q = prof ? prof.names.push(name) * 2 - 2 : 0;
      if (prof) pass = enc.beginComputePass({ timestampWrites: { querySet: prof.qs, beginningOfPassWriteIndex: q, endOfPassWriteIndex: q + 1 } });
      const c = this.cp[name];
      pass.setPipeline(c.pipe);
      pass.setBindGroup(0, c.bg);
      if (n == null) pass.dispatchWorkgroupsIndirect(b.frameCtr, 4);
      else pass.dispatchWorkgroups(n);
      if (prof) pass.end();
    };
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
    if (this.contact) run('contactMain', null);
    if (this.K.tissue > 0) run('bondBackMain', null);
    run(this.ticks > 1 ? 'lifeMainCoarse' : 'lifeMain', null);
    if (this.K.heat) run('heatMain', Math.ceil(cells / 64));
    if (!prof) pass.end();
    // the next temperatures become this step's
    if (this.K.heat) enc.copyBufferToBuffer(b.heatNext, 0, b.thermal, MAX_CELLS * 4, cells * 4);
  }

  /** One simulation step with each dispatch timed on the GPU: [[name, ms], ...]. Needs timestamps. */
  async profileStep(simDt = 1 / 60) {
    const d = this.device, U = GPUBufferUsage;
    this.prof ??= { qs: d.createQuerySet({ type: 'timestamp', count: 32 }),
      resolve: d.createBuffer({ size: 256, usage: U.QUERY_RESOLVE | U.COPY_SRC }),
      read: d.createBuffer({ size: 256, usage: U.COPY_DST | U.MAP_READ }) };
    const prof = { qs: this.prof.qs, names: [] };
    const enc = d.createCommandEncoder();
    this._step(enc, simDt, undefined, -1, prof);
    const n = prof.names.length * 2;
    enc.resolveQuerySet(prof.qs, 0, n, this.prof.resolve, 0);
    enc.copyBufferToBuffer(this.prof.resolve, 0, this.prof.read, 0, n * 8);
    d.queue.submit([enc.finish()]);
    await this.prof.read.mapAsync(GPUMapMode.READ);
    const t = new BigUint64Array(this.prof.read.getMappedRange().slice(0, n * 8));
    this.prof.read.unmap();
    return prof.names.map((name, i) => [name, Number(t[i * 2 + 1] - t[i * 2]) / 1e6]);
  }

  /**
   * Headless forks: set the world's state aside on the GPU (particles, genomes, intents and the ledger,
   * with the clock, light and tides), to run the same moment forward again with restore().
   */
  snapshot() {
    const d = this.device, b = this.b, U = GPUBufferUsage;
    const enc = d.createCommandEncoder();
    const keep = { gpu: {} };
    for (const k of ['parts', 'genomes', 'intent', 'ledger', 'thermal']) {
      keep.gpu[k] = d.createBuffer({ size: b[k].size, usage: U.COPY_SRC | U.COPY_DST });
      enc.copyBufferToBuffer(b[k], 0, keep.gpu[k], 0, b[k].size);
    }
    d.queue.submit([enc.finish()]);
    keep.cpu = { simTime: this.simTime, frameNo: this.frameNo, tick: this.tick, season: this.season, abio: this.abio,
      ambient: this.ambient, chargeMul: this.chargeMul, seedValue: this.seedValue, temp: this.temp, excursion: this.excursion,
      tide: this.tide.slice(), tidePh: this.tidePh.slice(), waves: this.waves.slice(), rock: this.rock.slice() };
    return keep;
  }

  restore(keep) {
    const d = this.device, b = this.b;
    const enc = d.createCommandEncoder();
    for (const [k, buf] of Object.entries(keep.gpu)) enc.copyBufferToBuffer(buf, 0, b[k], 0, buf.size);
    d.queue.submit([enc.finish()]);
    const c = keep.cpu;
    Object.assign(this, { simTime: c.simTime, frameNo: c.frameNo, tick: c.tick, season: c.season, abio: c.abio,
      ambient: c.ambient, chargeMul: c.chargeMul, seedValue: c.seedValue, temp: c.temp, excursion: c.excursion });
    this.tide.set(c.tide); this.tidePh.set(c.tidePh); this.waves.set(c.waves); this.rock.set(c.rock);
  }

  /** What snapshot() keeps, as bytes (tools/perf saves worlds to profile them again): { cpu, gpu: {name: ArrayBuffer} }. */
  async readState() {
    const d = this.device, keep = this.snapshot(), gpu = {};
    for (const [k, buf] of Object.entries(keep.gpu)) {
      const st = d.createBuffer({ size: buf.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = d.createCommandEncoder();
      enc.copyBufferToBuffer(buf, 0, st, 0, buf.size);
      d.queue.submit([enc.finish()]);
      await st.mapAsync(GPUMapMode.READ);
      gpu[k] = st.getMappedRange().slice(0);
      st.destroy(); buf.destroy();
    }
    return { cpu: { ...keep.cpu, count: this.count, grid: [...this.grid], founders: this.founders }, gpu };
  }

  /** The bytes of each buffer readState() keeps, for a world of n particles. */
  stateSizes(n) {
    return { parts: n * P_BYTES, genomes: MAXK * G_BYTES, intent: n * 16, ledger: (META_CLAIM + n) * 4, thermal: 3 * MAX_CELLS * 4 };
  }

  /** Put back a world from readState() (allocated for at least its count, the page's grid aside). */
  writeState({ cpu, gpu }) {
    for (const [k, data] of Object.entries(gpu)) this.device.queue.writeBuffer(this.b[k], 0, data);
    this.restore({ gpu: {}, cpu });
    this.count = cpu.count; this.grid = [...cpu.grid];
    if (cpu.founders != null) this.founders = cpu.founders;
    this.sorted = false;
    this.worldGeneration++;
    this.clearAccum = true;
  }

  /** Read every particle now (headless forks): { u32, f32 } views over count records of P_BYTES. */
  async readParticles() {
    const d = this.device, U = GPUBufferUsage, size = this.count * P_BYTES;
    const st = d.createBuffer({ size, usage: U.COPY_DST | U.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyBufferToBuffer(this.b.parts, 0, st, 0, size);
    d.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ);
    const copy = st.getMappedRange().slice(0);
    st.unmap(); st.destroy();
    return { u32: new Uint32Array(copy), f32: new Float32Array(copy) };
  }

  /** Read the water's temperature on each grid cell now (headless diagnostics): a Float32Array of grid[0] * grid[1]. */
  async readThermal() {
    const d = this.device, U = GPUBufferUsage, n = this.grid[0] * this.grid[1];
    const st = d.createBuffer({ size: n * 4, usage: U.COPY_DST | U.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyBufferToBuffer(this.b.thermal, MAX_CELLS * 4, st, 0, n * 4);
    d.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(st.getMappedRange().slice(0));
    st.unmap(); st.destroy();
    return out;
  }

  /** Read the ledger and genomes now (headless forks), in the shape onCensus receives, with K.diag's counters. */
  async readCensus() {
    const d = this.device, U = GPUBufferUsage;
    const st = d.createBuffer({ size: CENSUS_BYTES, usage: U.COPY_DST | U.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyBufferToBuffer(this.b.ledger, 0, st, 0, LEDGER_HEAD);
    enc.copyBufferToBuffer(this.b.genomes, 0, st, LEDGER_HEAD, MAXK * G_BYTES);
    d.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ);
    const copy = st.getMappedRange().slice(0);
    st.unmap(); st.destroy();
    const u = new Uint32Array(copy);
    return { simTime: this.simTime, globals: u.subarray(0, 16), pop: u.subarray(META_POP, META_POP + MAXK),
      demography: u.subarray(META_DEATH, META_DEATH + 64), energy: u.subarray(META_ENERGY, META_ENERGY + 64),
      diag: u.subarray(META_DIAG, META_CLAIM), genomeU32: new Uint32Array(copy, LEDGER_HEAD), genomeF32: new Float32Array(copy, LEDGER_HEAD) };
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
          demography: u.subarray(META_DEATH, META_DEATH + 64), energy: u.subarray(META_ENERGY, META_ENERGY + 64),
          genomeU32: new Uint32Array(copy, LEDGER_HEAD), genomeF32: new Float32Array(copy, LEDGER_HEAD),
        });
      }
    }).catch(() => { st.busy = false; });
  }

  /**
   * One rendered frame after `steps` simulation steps. target: GPUTextureView or null (simulate only).
   * cam: {x,y,ppu}; loupe: {x,y,r (canvas px), ppu, cx, cy (world)} or null.
   * hold (Max and coarse speeds): true draws the world into the held image, false only carries the held
   * image with the camera (a fullscreen blit), so most of the GPU stays on the simulation.
   */
  frame({ target = null, cam = { x: 0, y: 0, ppu: 1 }, paused = false, simDt = 1 / 60, steps = 1, time = 0, dpr = 1, selId = 0xffffffff, loupe = null, specimen = null, hold = null }) {
    const d = this.device;
    const generation = this.worldGeneration;
    const b = this.b;
    const N = this.count;
    const t0 = performance.now();
    const stepping = !paused && N > 0;
    const nSteps = stepping ? Math.min(MAX_STEPS, Math.max(1, steps | 0)) : 0;
    const tm = this.timing;
    // profiling times every pass instead (_profileEncoder)
    const slot = tm && !this.passProfile ? tm.reads.find((r) => !r.busy) : null;
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
    const prof = this.passProfile ? this._profileEncoder(enc) : null;
    const censusJobs = [];
    for (let s = 0; s < nSteps; s++) {
      const last = s === nSteps - 1;
      const endTs = last && slot ? { querySet: tm.qs, endOfPassWriteIndex: target ? 2 : 1 } : undefined;
      const begin = tsBegin();
      this._step(enc, simDt, begin || endTs ? { ...(begin || {}), ...(endTs || {}) } : undefined, nSteps > 1 ? s : -1);
      const job = this._censusCopy(enc);
      if (job) censusJobs.push(job);
    }
    if (nSteps > 1) d.queue.writeBuffer(b.simRing, 0, this.ringData, 0, nSteps * SIM_STRIDE);
    const listenJob = nSteps > 0 ? this._listenCopy(enc, cam) : null;
    const mindJob = this._mindCopy(enc);
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
      trackJobs.push({ st, id, k, simTime: this.simTime });
      const pu = new ArrayBuffer(48);
      const pf = new Float32Array(pu), pv = new Uint32Array(pu);
      // where it is expected: where it was last found, carried on at its velocity
      const seen = this.trackSeen[k]?.id === id && this.sorted ? this.trackSeen[k] : null;
      if (seen) for (let a = 0; a < 2; a++) {
        const g = this.grid[a];
        pf[a] = (((seen.pos[a] + seen.vel[a] * (this.simTime - seen.simTime)) % g) + g) % g;
      }
      pf[2] = 0; pv[3] = id; pv[4] = 0; pv[5] = N; pf[6] = this.grid[0]; pf[7] = this.grid[1]; pv[8] = 0xffffffff;
      d.queue.writeBuffer(b.trackU[k], 0, pu);
      enc.clearBuffer(b.trackOut[k], 0, 56);
      const pass = enc.beginComputePass();
      if (seen) {
        pass.setPipeline(this.cpTrackNear);
        pass.setBindGroup(0, this.trackNearBG[k]);
        pass.dispatchWorkgroups(25);
        pass.setPipeline(this.cpTrackArgs);
        pass.setBindGroup(0, this.trackArgsBG[k]);
        pass.dispatchWorkgroups(1);
      }
      pass.setPipeline(this.cpPick.pipe);
      pass.setBindGroup(0, this.trackBG[k]);
      if (seen) pass.dispatchWorkgroupsIndirect(b.trackArgs[k], 0);
      else pass.dispatchWorkgroups(Math.ceil(N / 256));
      pass.end();
      enc.copyBufferToBuffer(b.trackOut[k], 0, st.buf, 0, 56);
    }
    let watchJob = null;
    const watching = this.watch.filter((c) => !this.watchGone.has(c.id)).slice(0, WATCH_MAX);
    for (const id of this.watchGone) if (!this.watch.some((c) => c.id === id)) this.watchGone.delete(id);
    if (watching.length && N > 0) {
      const st = this.watchStage.find((s) => !s.busy);
      if (st) {
        st.busy = true;
        const cells = watching, ids = cells.map((c) => c.id);
        watchJob = { st, ids, full: !this.sorted, simTime: this.simTime };
        const wu = new ArrayBuffer(16 + WATCH_MAX * 20), wv = new Uint32Array(wu), wf = new Float32Array(wu);
        wv[0] = N; wv[1] = ids.length; wv[2] = this.grid[0]; wv[3] = this.grid[1]; wv.set(ids, 4);
        // where each is expected: where it was last seen, carried on at its velocity
        cells.forEach((c, k) => { for (let a = 0; a < 2; a++) {
          const g = this.grid[a];
          wf[4 + WATCH_MAX + k * 4 + a] = ((((a ? c.y : c.x) + (a ? c.vy : c.vx) * (this.simTime - c.t)) % g) + g) % g;
        } });
        d.queue.writeBuffer(b.watchU, 0, wu);
        enc.clearBuffer(b.watchOut, 0, WATCH_MAX * 20);
        const pass = enc.beginComputePass();
        if (this.sorted) {
          pass.setPipeline(this.cpWatchNear);
          pass.setBindGroup(0, this.watchNearBG);
          pass.dispatchWorkgroups(25, ids.length);
          pass.setPipeline(this.cpWatchArgs);
          pass.setBindGroup(0, this.watchArgsBG);
          pass.dispatchWorkgroups(1);
        }
        pass.setPipeline(this.cpWatch.pipe);
        pass.setBindGroup(0, this.cpWatch.bg);
        if (this.sorted) pass.dispatchWorkgroupsIndirect(b.watchArgs, 0);
        else pass.dispatchWorkgroups(Math.ceil(N / 256));
        pass.end();
        enc.copyBufferToBuffer(b.watchOut, 0, st.buf, 0, WATCH_MAX * 20);
        if (this.sorted) enc.copyBufferToBuffer(b.watchArgs, 0, st.buf, WATCH_MAX * 20, 4);
      }
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

    const tsEndAt1 = slot ? { querySet: tm.qs, endOfPassWriteIndex: 1 } : undefined;
    // whether the world itself is drawn this frame (not just the held image)
    const drew = !!target && (hold == null || hold || !this.holdCam);
    if (target && hold == null) this._render(enc, { target, cam, time, dpr, selId, loupe, specimen, tsBegin, tsEnd: tsEndAt1 });
    else if (target) {
      if (drew) {
        this._render(enc, { target: this.holdView, cam, time, dpr, selId, loupe, specimen, tsBegin, tsEnd: tsEndAt1 });
        this.holdCam = { x: cam.x, y: cam.y, ppu: cam.ppu };
      }
      // the held image, carried to the current camera (the trails' reprojection, unfaded)
      const [W, H] = this.size, lc = this.holdCam;
      const dx = cam.x - lc.x, dy = cam.y - lc.y, gx = this.grid[0], gy = this.grid[1];
      const wx = dx - gx * Math.round(dx / gx), wy = dy - gy * Math.round(dy / gy), ratio = lc.ppu / cam.ppu;
      d.queue.writeBuffer(b.holdU, 0, new Float32Array([ratio, ratio, (wx * lc.ppu) / W, (wy * lc.ppu) / H, 1, 0, 0, 0]));
      const begin = tsBegin();
      const tw = drew ? undefined : begin || tsEndAt1 ? { ...(begin || {}), ...(tsEndAt1 || {}) } : undefined;
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }], timestampWrites: tw });
      pass.setPipeline(this.pHold); pass.setBindGroup(0, this.holdBG); pass.draw(3); pass.end();
    }

    const timed = slot && (stepping || target);
    if (timed) {
      enc.resolveQuerySet(tm.qs, 0, 3, tm.resolve, 0);
      enc.copyBufferToBuffer(tm.resolve, 0, slot.buf, 0, 24);
    }
    if (prof) prof.finish(nSteps, drew, generation);
    d.queue.submit([enc.finish()]);
    if (prof) prof.read();
    if (this.carryDone) { this.carryDone.destroy(); this.carryDone = null; }

    if (timed) {
      slot.busy = true;
      slot.buf.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(slot.buf.getMappedRange());
        const ms = Number(t[1] - t[0]) / 1e6;
        // the simulation's share: up to the end of the last step (the whole frame when nothing is drawn)
        const simMs = !nSteps ? 0 : target ? Number(t[2] - t[0]) / 1e6 : ms;
        slot.buf.unmap();
        slot.busy = false;
        if (generation === this.worldGeneration && ms > 0 && ms < 5000 && this.onGpuTime) this.onGpuTime(ms, N, nSteps, simMs > 0 && simMs <= ms ? simMs : null, drew);
      }).catch(() => { slot.busy = false; });
    } else if (!tm && this.onGpuTime && (stepping || target)) {
      d.queue.onSubmittedWorkDone().then(() => {
        if (generation === this.worldGeneration && this.onGpuTime) this.onGpuTime(performance.now() - t0, N, nSteps, null, drew);
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
        if (found) this.trackSeen[trackJob.k] = { id: trackJob.id, pos: [tracked.x, tracked.y], vel: [tracked.vx, tracked.vy], simTime: trackJob.simTime };
        if (generation === this.worldGeneration && this.onTrack) this.onTrack({ id: trackJob.id, found, tracked, simTime: trackJob.simTime });
      }).catch(() => { st.busy = false; });
    }

    if (watchJob) {
      const { st, ids, full, simTime } = watchJob;
      st.buf.mapAsync(GPUMapMode.READ).then(() => {
        const buf = st.buf.getMappedRange(), f = new Float32Array(buf), u = new Uint32Array(buf);
        const seen = [], scanned = full || u[WATCH_MAX * 5] > 0;
        ids.forEach((id, k) => {
          if (u[WATCH_MAX * 4 + k]) seen.push({ id, x: f[k * 4], y: f[k * 4 + 1], vx: f[k * 4 + 2], vy: f[k * 4 + 3] });
          else if (scanned) this.watchGone.add(id);
        });
        st.buf.unmap();
        st.busy = false;
        if (generation === this.worldGeneration && this.onWatch) this.onWatch({ simTime, seen });
      }).catch(() => { st.busy = false; });
    }
    for (const job of censusJobs) this._censusRead(job, generation);
    if (listenJob) this._listenRead(listenJob, generation);
    if (mindJob) this._mindRead(mindJob, generation);
    if (surveyJob) this._surveyRead(surveyJob, generation);
  }

  /**
   * Profiling (this.passProfile = true, needs timestamps): every pass of the frame timed on its own,
   * named by its pipelines (a simulation step's pass is 'step'). onPassTimes hears
   * [[name, ms], ...] per frame; onGpuTime hears the frame as usual.
   */
  _profileEncoder(enc) {
    const d = this.device, CAP = 4096;
    const P = this._prof ??= { qs: d.createQuerySet({ type: 'timestamp', count: CAP }),
      resolve: d.createBuffer({ size: CAP * 8, usage: U.QUERY_RESOLVE | U.COPY_SRC }), stage: [] };
    const names = [];
    const wrap = (begin) => (desc = {}) => {
      if (names.length * 2 + 2 > CAP) return begin(desc);
      const k = names.push('clear') - 1;
      const pass = begin({ ...desc, timestampWrites: { querySet: P.qs, beginningOfPassWriteIndex: 2 * k, endOfPassWriteIndex: 2 * k + 1 } });
      const set = pass.setPipeline.bind(pass), used = [];
      pass.setPipeline = (p) => {
        if (!used.includes(p.label)) { used.push(p.label); names[k] = used[0] === 'resolveCount' ? 'step' : used.slice(0, 3).join('+'); }
        set(p);
      };
      return pass;
    };
    enc.beginComputePass = wrap(enc.beginComputePass.bind(enc));
    enc.beginRenderPass = wrap(enc.beginRenderPass.bind(enc));
    let job = null;
    return {
      finish: (nSteps, drew, generation) => {
        const n = names.length * 2;
        if (!n) return;
        let st = P.stage.find((s) => !s.busy);
        if (!st) P.stage.push(st = { buf: d.createBuffer({ size: CAP * 8, usage: U.COPY_DST | U.MAP_READ }), busy: false });
        st.busy = true;
        enc.resolveQuerySet(P.qs, 0, n, P.resolve, 0);
        enc.copyBufferToBuffer(P.resolve, 0, st.buf, 0, n * 8);
        job = { st, n, nSteps, drew, generation, names: names.slice() };
      },
      read: () => {
        if (!job) return;
        const { st, n, nSteps, drew, generation, names } = job;
        st.buf.mapAsync(GPUMapMode.READ, 0, n * 8).then(() => {
          const t = new BigUint64Array(st.buf.getMappedRange(0, n * 8).slice(0));
          st.buf.unmap();
          st.busy = false;
          if (generation !== this.worldGeneration) return;
          const times = names.map((name, k) => [name, Number(t[2 * k + 1] - t[2 * k]) / 1e6]);
          const ms = Number(t[n - 1] - t[0]) / 1e6;
          const simMs = times.reduce((a, [name, x]) => a + (name === 'step' ? x : 0), 0);
          if (this.onPassTimes) this.onPassTimes(times, { ms, simMs, nSteps, drew });
          if (ms > 0 && ms < 5000 && this.onGpuTime) this.onGpuTime(ms, this.count, nSteps, nSteps ? simMs : null, drew);
        }).catch(() => { st.busy = false; });
      },
    };
  }

  /**
   * Every mindEvery frames while a cell is watched: replay its last decision (mindMain) after the
   * frame's steps. While paused the replay is of the same step, so it is cheap to repeat.
   */
  _mindCopy(enc) {
    const N = this.count;
    if (this.mindId === 0xffffffff || !N || !this.frameNo || ++this._mindFrames < this.mindEvery) return null;
    const st = this.mindStage.find((s) => !s.busy);
    if (!st) return null;
    this._mindFrames = 0;
    st.busy = true;
    const b = this.b;
    this.device.queue.writeBuffer(b.mind, 0, new Uint32Array([this.mindId]));
    enc.clearBuffer(b.mind, 4, 4);
    const pass = enc.beginComputePass();
    const mind = this.cp[this.ticks > 1 ? 'mindMainCoarse' : 'mindMain'];
    pass.setPipeline(mind.pipe);
    pass.setBindGroup(0, mind.bg);
    pass.dispatchWorkgroups(Math.ceil(N / 256));
    pass.end();
    enc.copyBufferToBuffer(b.mind, 0, st.buf, 0, MIND_BYTES);
    return { st, id: this.mindId, simTime: this.simTime };
  }

  _mindRead(job, generation) {
    const { st } = job;
    st.buf.mapAsync(GPUMapMode.READ).then(() => {
      const copy = st.buf.getMappedRange().slice(0);
      st.buf.unmap();
      st.busy = false;
      if (generation !== this.worldGeneration || !this.onMind) return;
      this.onMind({ id: job.id, simTime: job.simTime, u32: new Uint32Array(copy), f32: new Float32Array(copy) });
    }).catch(() => { st.busy = false; });
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
        records: u.subarray(LISTEN_HEAD, LISTEN_HEAD + LISTEN_REC * n), f32: new Float32Array(u.buffer, LISTEN_HEAD * 4, LISTEN_REC * n),
      });
    }).catch(() => { st.busy = false; });
  }

  // detail: resolve cells as they grow on screen (false keeps the distant sprite at every zoom)
  _writeView(buf, data, cam, W, H, dpr, time, selId, detail = true, culled = false, splat = 0) {
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
    vu[20] = detail ? 1 : 0;
    vu[21] = culled ? 1 : 0;
    v[22] = splat;
    v[23] = K.tissue > 0 ? K.tightFrom : -1;
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

  // pl: the pipelines (the main view's pass carries the living target too, this.main)
  _drawScene(pass, bgLine, bgPoint, bgBridge, data, k, pl = { point: this.pPoint, line: this.pLine, bridge: this.pBridge }) {
    const v = new Float32Array(data);
    const detail = new Uint32Array(data)[20] === 1;
    // culled: only the particles of the grid rows in view (cullRows wrote the draws' arguments)
    const culled = new Uint32Array(data)[21] === 1 ? this.cull[k].args : null;
    // splatting: points only for the particles too large to splat (splatMain listed them)
    const quads = v[22] > 0 ? this.b.quads : null;
    if (this.settings.links) {
      // Crossfade native lines and soft strips in this same pass. The strip has zero
      // contribution at its topology switch, so subpixel line coverage cannot pop.
      if (v[7] < 30 || !detail) {
        pass.setPipeline(pl.line);
        pass.setBindGroup(0, bgLine);
        if (culled) pass.drawIndirect(culled, 16); else pass.drawIndirect(this.b.frameCtr, 16);
      }
      if (v[7] > 6 && detail) {
        pass.setPipeline(pl.bridge);
        pass.setBindGroup(0, bgBridge);
        if (culled) pass.drawIndirect(culled, 32); else pass.drawIndirect(this.b.bridgeDraw, 0);
      }
    }
    if (this.settings.nodes) {
      pass.setPipeline(pl.point);
      pass.setBindGroup(0, bgPoint);
      if (culled) pass.drawIndirect(culled, 0); else if (quads) pass.drawIndirect(quads, 0); else pass.draw(4, this.count);
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

  // Whether view k (main, loupe, specimen), centred on (cx, cy) and reaching hw, hh world units either
  // way, sees little enough of the world to draw only the grid rows it covers; if so, its uniforms for
  // cullRows. Two cells of margin: a cell drifts less than half of one in a step, and its outline
  // reaches about one beyond its centre.
  _cullView(k, cx, cy, hw, hh) {
    const [gw, gh] = this.grid, m = 2;
    const nx = Math.min(gw, Math.ceil(2 * hw) + 2 * m + 1), ny = Math.min(gh, Math.ceil(2 * hh) + 2 * m + 1);
    const fx = Math.floor(cx - hw) - m, fy = Math.floor(cy - hh) - m;
    const segs = ny * (nx < gw && ((fx % gw) + gw) % gw + nx > gw ? 2 : 1);
    const on = this.sorted && nx * ny < 0.5 * gw * gh && segs < CULL_SEGS;
    if (on) this.device.queue.writeBuffer(this.cull[k].u, 0, new Uint32Array([((fx % gw) + gw) % gw, ((fy % gh) + gh) % gh, nx, ny, gw, gh, 0, 0]));
    return on;
  }

  _render(enc, { target, cam, time, dpr, selId, loupe, specimen, tsBegin, tsEnd }) {
    const d = this.device;
    const [W, H] = this.size;
    // the views that see little of the world draw only the rows they cover (CULL_WGSL)
    const culled = [this._cullView(0, cam.x, cam.y, W / (2 * cam.ppu), H / (2 * cam.ppu)),
      !!loupe && this._cullView(1, loupe.cx, loupe.cy, (LOUPE_FIELD * loupe.r) / loupe.ppu, (LOUPE_FIELD * loupe.r) / loupe.ppu),
      !!(specimen && specimen.target) && this._cullView(2, specimen.cx, specimen.cy, specimen.w / (2 * specimen.ppu), specimen.h / (2 * specimen.ppu))];
    if (culled.some(Boolean)) {
      const pass = enc.beginComputePass({ timestampWrites: tsBegin() });
      pass.setPipeline(this.cpCull);
      for (let k = 0; k < 3; k++) if (culled[k]) { pass.setBindGroup(0, this.cull[k].bg); pass.dispatchWorkgroups(1); }
      pass.end();
    }
    // the main view may skip resolving cells (settings.lod); the loupe and the close-up always resolve
    const lod = this.settings.lod;
    // seeing most of the world with particles a pixel or so across, it splats those (splatMain), where
    // there are enough of them to pay for the buffer it clears and adds in (a quarter as many as pixels)
    const ps = Math.max(1.1 * dpr, 0.085 * cam.ppu);
    const splat = !culled[0] && this.settings.nodes && ps <= SPLAT_PX && this.count >= W * H / 4 ? SPLAT_PX : 0;
    this._writeView(this.b.view, this.viewData, cam, W, H, dpr, time, selId, lod, culled[0], splat);
    if (splat) {
      d.queue.writeBuffer(this.b.quads, 0, new Uint32Array([4, 0, 0, 0]));
      enc.clearBuffer(this.b.splat, 0, W * H * 12);
      const pass = enc.beginComputePass({ timestampWrites: tsBegin() });
      pass.setPipeline(this.cpSplat); pass.setBindGroup(0, this.splatBG); pass.dispatchWorkgroups(Math.ceil(this.count / 256));
      pass.end();
    }
    // The simulation's existing indirect args contain the living instance count. Only rendering
    // changes the vertex count; keep all ecology WGSL and buffers' contents untouched.
    if ((lod && new Float32Array(this.viewData)[7] > 6) || loupe || specimen) {
      enc.copyBufferToBuffer(this.b.frameCtr, 20, this.b.bridgeDraw, 4, 4);
    }

    const pd = this.postData;
    pd[0] = W; pd[1] = H; pd[2] = this.settings.bloom; pd[3] = 1.0;
    pd[4] = time; pd[5] = this.season; pd[6] = this.settings.tide; pd[7] = cam.ppu;
    pd[8] = cam.x; pd[9] = cam.y; pd[10] = this.grid[0]; pd[11] = this.grid[1];
    pd[12] = this.simTime; pd[13] = this.ambient; pd[14] = this.settings.optics; pd[15] = this.K.heat ? this.settings.heat : -1;
    pd.set(this.tide, 16);
    pd.set(this.tidePh, 32);
    pd.set(this.waves, 36);
    // ebb and flood (K.ebb) swing the currents as flowAt does, so the drawn mud moves with the water
    if (this.K.ebb > 0) {
      const swing = 1 + this.K.ebb * (Math.cos((2 * Math.PI / this.K.ebbPeriod) * this.simTime) - 1);
      for (let k = 0; k < 4; k++) pd[36 + k * 4 + 3] *= swing;
    }
    // the heat map's span: from a little below the background to framboid-hot
    const tbg = this.tbg;
    pd[52] = tbg; pd[53] = tbg - 2; pd[54] = tbg + 10;
    pd[55] = this.settings.bands;
    // the tide map's glint production: the era's charge, then the hot springs'
    pd[56] = this.K.charge * this.chargeMul; pd[57] = this.K.hotCharge; pd[58] = this.K.hotFrom; pd[59] = this.K.hotTo;
    d.queue.writeBuffer(this.b.post, 0, pd);

    // Cells fuse with their incoming bond partners, and flatten against the cells they press on, only
    // once outlines resolve (vsPoint: detailLOD(pointSize) > 0), so gather both only then, and only
    // for cells in view.
    const mainDetail = lod && new Float32Array(this.viewData)[7] > 2.8;
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
      // after a resize the trails come from the image kept from before it (resize), once
      const carry = this.carry;
      if (carry) { this.carry = null; this.carryDone = carry.tex; }
      const srcI = this.accIdx, dstI = 1 - this.accIdx;
      this.accIdx = dstI;
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.accumViews[dstI], loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
          { view: this.liveView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }],
        timestampWrites: tsBegin(),
      });
      if (!clear) {
        const lc = this.lastCam;
        const dx = cam.x - lc.x, dy = cam.y - lc.y;
        const gx = this.grid[0], gy = this.grid[1];
        const wx = dx - gx * Math.round(dx / gx), wy = dy - gy * Math.round(dy / gy);
        // in the last frame's texture coordinates (its size differs after a resize)
        const sx = (lc.ppu * W) / (cam.ppu * lc.w), sy = (lc.ppu * H) / (cam.ppu * lc.h);
        d.queue.writeBuffer(this.b.reprojU, 0, new Float32Array([sx, sy, (wx * lc.ppu) / lc.w, (wy * lc.ppu) / lc.h, this.settings.trails, 0, 0, 0]));
        pass.setPipeline(this.main.reproj);
        pass.setBindGroup(0, carry ? carry.bg : this.reprojBG[srcI]);
        pass.draw(3);
      }
      if (splat) { pass.setPipeline(this.main.splat); pass.setBindGroup(0, this.splatDrawBG); pass.draw(3); }
      this._drawScene(pass, this.mainBG.line, this.mainBG.point, this.mainBG.bridge, this.viewData, 0, this.main);
      pass.end();
    }
    this._drawStone(enc, this.stoneView, this.bgStone);
    this.lastCam = { x: cam.x, y: cam.y, ppu: cam.ppu, w: W, h: H };
    const cur = this.accIdx;

    if (loupe) {
      // the lens is barrel-distorted: its rim shows LOUPE_FIELD times its radius, so render that much
      const span = loupe.r * 2 * LOUPE_FIELD;
      const L = Math.max(64, Math.min(1024, Math.ceil(span / 32) * 32));
      this._ensureLoupeTex(L);
      const lppu = loupe.ppu * (L / span);
      this._writeView(this.b.viewL, this.viewDataL, { x: loupe.cx, y: loupe.cy, ppu: lppu }, L, L, dpr * (L / span), time, selId, true, culled[1]);
      d.queue.writeBuffer(this.b.loupeU, 0, new Float32Array([loupe.x, loupe.y, loupe.r, 1, W, H, loupe.ppu, 0]));
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.loupeView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      this._drawScene(pass, this.bgLineL, this.bgPointL, this.bgBridgeL, this.viewDataL, 1);
      pass.end();
      this._drawStone(enc, this.loupeStoneView, this.bgStoneL);
    }

    if (specimen && specimen.target) {
      this._ensureSpecTex(specimen.w, specimen.h);
      this._writeView(this.b.viewS, this.viewDataS, { x: specimen.cx, y: specimen.cy, ppu: specimen.ppu }, specimen.w, specimen.h, specimen.dpr, time, selId, true, culled[2]);
      let pass = enc.beginRenderPass({ colorAttachments: [{ view: this.specView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      this._drawScene(pass, this.bgLineS, this.bgPointS, this.bgBridgeS, this.viewDataS, 2);
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

    const micro = this.settings.specks && cam.ppu > Math.max(80, 2 * Math.max(W / this.grid[0], H / this.grid[1]));
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
