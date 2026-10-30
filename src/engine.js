import {
  simWGSL, SIM_CLOCK, CULL_WGSL, CULL_SEGS, PICK_WGSL, LISTEN_WGSL, SURVEY_WGSL, SURVEY_WORDS, SURVEY_MAX_TILES, INBOND_WGSL, LISTEN_CAP, LISTEN_HEAD, LISTEN_REC, WATCH_WGSL, WATCH_MAX, DRAW_WGSL, LERP_WGSL, POST_WGSL, SEA_WGSL, SHIFT_W, SHIFT_H, MICRO_WGSL, MICRO_SPECKS, ORGANS, DEFAULT_K,
  MAXK, FIRST_LIFE, MAX_CELLS, META_SLOT, META_POP, META_DEATH, META_ENERGY, META_DIAG, META_CLAIM, SPL_WORDS, SPL_RANGE, SPL_RANGE_SAMPLES, HAND_WORDS, PIPE_MAX, PIPE_TAKE, PIPE_TAKE_W, PIPE_SP, PIPE_IDS, H_TAKEN, H_CUTS, H_IN, H_SP, H_CELLS, H_IDS, H_LINKS, H_OUT, P_BYTES, PICK_WORDS, G_BYTES, LITE_BYTES, LOUPE_FIELD, MIND_BYTES, SWAY_BYTES, TUBE_N, TUBE_K,
} from './shaders.js';
import {
  archetypeGenome, randomGenome, writeGenome, parseParticle,
  packUnorm, ARCHETYPE_TYPES,
} from './genome.js';
import { TIDE_PHASE } from './flow.js';
import { SEA, SEA_N, SEA_CASCADES, seaLayout, seaScales } from './sea.js';
import { seaTuneDefaults, seaSpecOf } from './seatune.js';
import { makeRelief, rankField, makeIceOrder } from './geography.js';
// where the post uniforms' hand words begin (struct Post: the lamp, the lens), after the sea's
const POST_LAMP = 100 + 4 * SEA_CASCADES;

const HDR = 'rgba16float';
const BLOOM_LEVELS = 6;
// absent in a browser without WebGPU, which must still load the page to say so
const U = globalThis.GPUBufferUsage ?? {};
export const PICK_MAX = 131072;
export const FOCUS_MAX = 65536;
const PICK_BYTES = 56 + PICK_MAX * PICK_WORDS * 4;
const LEDGER_HEAD = META_CLAIM * 4;
const CENSUS_BYTES = LEDGER_HEAD + MAXK * G_BYTES;
// every SPL_EVERY-th census also carries the species ledger (SPL_* in shaders.js), for the chronicler
const SPL_EVERY = 3;
const LISTEN_BYTES = (LISTEN_HEAD + LISTEN_REC * LISTEN_CAP) * 4;
const SURVEY_BYTES = SURVEY_MAX_TILES * SURVEY_WORDS * 4;
export { MAXK, FIRST_LIFE, DEFAULT_K };

const mix = (a, b, t) => a + (b - a) * t;
const SIM_STRIDE = 1024;
// the largest sprite radius, in pixels, splatted rather than drawn as a quad (splatMain)
const SPLAT_PX = 1.6;
export const MAX_STEPS = 512;

// --------------------------------------------------------------------- engine
// onProgress(f): the share of the shaders' compile work done (0..1), as each pipeline is ready
// late: return before the pipelines a new world can do without (LATE) are ready; until then coarse
// steps are taken as fine ones and the watched cell's mind waits (the page; headless runs wait for all)
export async function createEngine(device, format, { hasTimestamps = false, K = {}, onProgress = null, late = false } = {}) {
  const unknown = Object.keys(K).filter((k) => !(k in DEFAULT_K));
  if (unknown.length) throw new Error(`unknown tunables: ${unknown.join(', ')} (see DEFAULT_K in shaders.js)`);
  const e = new Engine(device, format, hasTimestamps, { ...DEFAULT_K, ...K }, late);
  const errs = await e.compileErrors();
  if (errs.length) throw new Error('Shader compile failed:\n' + errs.join('\n'));
  await e.pipelinesReady(onProgress);
  return e;
}

// Pipelines are created async: the browser compiles them in parallel, where created one by one it
// compiles them in turn (an uncached start, 2026-10-23, RTX 4070 Ti on D3D12: 20.7 s in turn, 4.7 s
// in parallel). Their rough compile costs there, in units of about 100 ms, weigh the progress shown.
// The longest to compile, and not needed to start a world: coarse steps (fast speeds, low frame rates)
// and the replay of a watched cell's decision.
const LATE = new Set(['lifeMainCoarse', 'mindMain', 'mindMainCoarse', 'rangeMain']);
const COMPILE_COST = { lifeMain: 26, fsPoint: 15, 'fsPointLive+live': 13, fsComposite: 11, fsLoupe: 8, matterMain: 5 };


// how long the sea's wind takes to turn toward the tide's drift (simulated seconds, its time constant)
const SEA_WIND_EASE = 30;

// the real-time clock's period on the GPU (= SIM_WRAP in ANIM_WGSL, which the sway pass corrects for)
const REAL_WRAP = 4096;

class Engine {
  constructor(device, format, hasTimestamps, K, late = false) {
    this.device = device;
    this.format = format;
    this.K = K;
    // particles a cell weighs in a crowd per step (the page's Neighbors setting); a uniform, so it changes live
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
    // the water's background temperature: the climate's (temp, eased), an excursion (heat wave or cold
    // snap) on top, and the tide's season (tbg)
    this.temp = 16;
    this.excursion = 0;
    this.tide = new Float32Array([1, 1, 0.021, 1, 2, -1, -0.017, 1, -1, 3, 0.013, 0.7, 1, -2, 0.011, 0]);
    this.tidePh = Float32Array.from(TIDE_PHASE);
    this.seedValue = 1;
    this.censusEvery = 20;
    this.settings = { trails: 0.45, links: true, nodes: true, bloom: 0.012, exposure: 1.0, tide: 1, heat: 1, bands: 0, optics: 1, specks: true, lod: true };
    this.simData = new ArrayBuffer(848);
    // the viewer's hand (docs/hand.md; the page's src/hand.js sets it): Hand in simWGSL, its words as floats and
    // as ids. Zero, its ids NONE, in every headless run.
    this.hand = new Float32Array(116);
    this.handU = new Uint32Array(this.hand.buffer);
    this.handU.fill(0xffffffff, 20, 22);
    // the pool (docs/catastrophes.md), set by the climate: the water level (a quantile of the floor's relief; 1: all
    // wet), rain (0..1), the sky (light ×), how fast it is drying (0..1), the currents' strength, floating duckweed
    // (center, length, darkness; angle, seed, width) and up to four raindrops' ring waves (center, time, strength)
    this.level = 1; this.rain = 0; this.sky = 1; this.evap = 0; this.turb = 1; this.frost = 0; this.freezing = 0; this.mudRain = 0; this.parch = 0;
    this.duck = new Float32Array(8); this.drops = new Float64Array(16); // their times absolute (the GPU's are on its wrapped clock)
    this.relief = null;
    this.rock = new Float32Array(4);
    this.simF = new Float32Array(this.simData);
    this.simU = new Uint32Array(this.simData);
    this.waves = new Float32Array(16);
    this.viewData = new ArrayBuffer(112);
    this.viewDataL = new ArrayBuffer(112);
    // (after the sea's: the hand's lamp, the warm stage's lens, the instrument)
    this.postData = new Float32Array(POST_LAMP + 16);
    // the warm stage's or cold probe's lens (center, radius, 1 shown), set by the page: the thermal camera inside the
    // tool's reach
    this.lens = new Float32Array(4);
    // the instrument in hand seen in the water (set by the page): its tip, its shaft's way; its kind (1 the needle,
    // 2 the pipette, 3 the cold probe, 4 Touch's rod; 0 none), how far it is in focus (0 raised over the water, 1 in
    // it), its frost, the rod's radius
    this.tool = new Float32Array(8);
    this.loupe = null;
    this.focus = { on: 0, roleMask: 7, stateMode: 0, mute: 0.16, memberKind: 0xffffffff, memberN: 0 };
    this.viewDataS = new ArrayBuffer(112);
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
    b.sim = d.createBuffer({ size: 848, usage: U.UNIFORM | U.COPY_DST });
    // the heat field: deposits, temperatures and husks per cell, and heatMain's next temperatures (shaders.js); then
    // the pool's floor, each cell's relief quantile (src/geography.js)
    b.thermal = d.createBuffer({ size: 3 * MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.heatNext = d.createBuffer({ size: MAX_CELLS * 4, usage: U.STORAGE | U.COPY_SRC });
    b.simRing = d.createBuffer({ size: SIM_STRIDE * MAX_STEPS, usage: U.COPY_SRC | U.COPY_DST });
    this.ringData = new ArrayBuffer(SIM_STRIDE * MAX_STEPS);
    b.view = d.createBuffer({ size: 112, usage: U.UNIFORM | U.COPY_DST });
    b.viewL = d.createBuffer({ size: 112, usage: U.UNIFORM | U.COPY_DST });
    b.viewS = d.createBuffer({ size: 112, usage: U.UNIFORM | U.COPY_DST });
    b.focus = d.createBuffer({ size: (MAXK / 32 + FOCUS_MAX) * 4, usage: U.STORAGE | U.COPY_DST });
    b.post = d.createBuffer({ size: (POST_LAMP + 16) * 4, usage: U.UNIFORM | U.COPY_DST });
    // the sea (SEA_WGSL, src/sea.js): its uniforms, and every cascade's slope and displacement, mipmapped (its
    // amplitudes and working buffer are made with the first frame: _seaBuffers)
    b.seaU = d.createBuffer({ size: 128, usage: U.UNIFORM | U.COPY_DST });
    this.seaTex = d.createTexture({ size: [SEA_N, SEA_N, SEA_CASCADES], format: 'rgba16float', mipLevelCount: Math.log2(SEA_N) + 1,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING, label: 'sea' });
    this.seaView = this.seaTex.createView({ dimension: '2d-array' });
    this.seaSampler = d.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8 });
    this.seaData = new ArrayBuffer(128);
    this._seaOn = false;
    // the sea's tunables (src/seatune.js; Settings → Display sets its height and pace): its look, its pace, calm
    // water's share of a storm's, its waves (seaRebuild after changing those)
    this.seaTune = seaTuneDefaults(SEA);
    this.seaSpec = seaSpecOf(SEA, this.seaTune);
    this._seaVer = 0;
    b.loupeU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    b.pickU = d.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    // per grid cell: its matter, then its living
    b.counts = d.createBuffer({ size: 2 * MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST });
    b.stoneGrid = d.createBuffer({ size: MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST });
    // each grid cell's first particle (and one past the last); then each one's living count
    b.cellStart = d.createBuffer({ size: (2 * MAX_CELLS + 1) * 4, usage: U.STORAGE });
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

    // every pipeline below is a promise until pipelinesReady() puts the pipeline in its place
    this._pipes = [];
    const track = (pr, label) => { this._pipes.push({ pr, w: COMPILE_COST[label] ?? 1.5 }); return pr; };
    const cPipe = (desc) => track(d.createComputePipelineAsync(desc), desc.label);
    const rPipe = (desc) => track(d.createRenderPipelineAsync(desc), desc.label);
    const dp4a = !!globalThis.navigator?.gpu?.wgslLanguageFeatures?.has('packed_4x8_integer_dot_product');
    this.simModule = d.createShaderModule({ code: simWGSL(K, { dp4a }), label: 'sim' });
    this.pickModule = d.createShaderModule({ code: PICK_WGSL, label: 'pick' });
    this.listenModule = d.createShaderModule({ code: LISTEN_WGSL, label: 'listen' });
    this.watchModule = d.createShaderModule({ code: WATCH_WGSL, label: 'watch' });
    this.surveyModule = d.createShaderModule({ code: SURVEY_WGSL, label: 'survey' });
    this.drawModule = d.createShaderModule({ code: DRAW_WGSL, label: 'draw' });
    // coarse steps drawn in between (LERP_WGSL): this.lerp is how far along the last step to draw the world, or null
    const lerpModule = d.createShaderModule({ code: LERP_WGSL, label: 'lerp' });
    this.cpLerp = cPipe({ layout: 'auto', compute: { module: lerpModule, entryPoint: 'lerpApply' }, label: 'lerpApply' });
    this.cpLerpBack = cPipe({ layout: 'auto', compute: { module: lerpModule, entryPoint: 'lerpRestore' }, label: 'lerpRestore' });
    this.lerp = null;
    this._lerpN = 0;
    this._lerpOk = false;
    // culling for the main view, the loupe and the specimen (CULL_WGSL): uniforms, segments, draw arguments
    const cullModule = d.createShaderModule({ code: CULL_WGSL, label: 'cull' });
    this.cpCull = cPipe({ layout: 'auto', compute: { module: cullModule, entryPoint: 'cullRows' }, label: 'cullRows' });
    this.cull = [0, 1, 2].map(() => {
      const u = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
      const segs = d.createBuffer({ size: CULL_SEGS * 8, usage: U.STORAGE });
      const args = d.createBuffer({ size: 48, usage: U.STORAGE | U.INDIRECT });
      return { u, segs, args, bg: null };
    });
    // particles are in grid-cell order (cellStart valid) once a step has sorted them
    this.sorted = false;
    b.inbondU = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    const inbond = d.createShaderModule({ code: INBOND_WGSL, label: 'inbond' });
    this.cpInbond = ['inbondReset', 'inbondGather', 'contactGather'].map((entryPoint) => cPipe({ layout: 'auto', compute: { module: inbond, entryPoint }, label: entryPoint }));
    this.cpOrgans = cPipe({ layout: 'auto', compute: { module: inbond, entryPoint: 'organDirs' }, label: 'organDirs' });
    b.organDir = d.createBuffer({ size: MAXK * ORGANS * 4, usage: U.STORAGE });
    // the pipette's bore drawn as cells (setTube): its own parts, genomes and organelle directions
    b.tubeParts = d.createBuffer({ size: TUBE_N * P_BYTES, usage: U.STORAGE | U.COPY_DST });
    b.tubeGenomes = d.createBuffer({ size: (FIRST_LIFE + TUBE_K) * G_BYTES, usage: U.STORAGE | U.COPY_DST });
    b.tubeOrgans = d.createBuffer({ size: (FIRST_LIFE + TUBE_K) * ORGANS * 4, usage: U.STORAGE });
    this.tubeN = 0;
    this.postModule = d.createShaderModule({ code: POST_WGSL, label: 'post' });

    const cp = (mod, entryPoint) => cPipe({ layout: 'auto', compute: { module: mod, entryPoint }, label: entryPoint });
    this.cpDefs = {
      seedMain: [0, 1, 9, 10, 11],
      resolveCount: [0, 1, 4, 8, 9, 10, 11, 14],
      scanBlocks: [5, 6, 7],
      scanSums: [6, 7],
      scanAdd: [6, 7],
      scatterMain: [0, 1, 2, 3, 6, 8, 9, 10, 12, 13, 15],
      censusMain: [11, 12, 13],
      rangeMain: [0, 1, 11],
      matterMain: [0, 1, 2, 9, 10, 11, 13, 16, 18, 22],
      lifeMain: [0, 1, 2, 3, 6, 9, 10, 11, 12, 15, 18],
      heatMain: [0, 11, 18, 19, 22],
      mindMain: [0, 2, 3, 6, 10, 11, 15, 17, 18],
    };
    // bonds pull both ways, through the cells that keep a bond to each (bondsNow holds them)
    this.cpDefs.bondBackMain = [0, 2, 12, 20];
    // contact between living cells, in its own pass before lifeMain (contactMain)
    this.cpDefs.contactMain = [0, 2, 3, 6, 12];
    // what the pipette sets down, between steps (genomeWords: the genomes, as words)
    this.cpDefs.injectSlots = [0, 11, 23];
    this.cpDefs.injectCells = [0, 1, 9, 11];
    this.cpDefs.injectBonds = [9, 11];
    // coarse steps run their own lifeMain and mindMain (COARSE in simWGSL)
    this.cpDefs.lifeMainCoarse = this.cpDefs.lifeMain;
    this.cpDefs.mindMainCoarse = this.cpDefs.mindMain;
    this.cp = {};
    for (const name of Object.keys(this.cpDefs)) {
      const coarse = name.endsWith('Coarse');
      const desc = { layout: 'auto', compute: { module: this.simModule, entryPoint: coarse ? name.slice(0, -6) : name, ...(coarse ? { constants: { COARSE: 1 } } : {}) }, label: name };
      if (late && LATE.has(name)) {
        // compiles on after the engine is returned: in place (with its bind group, once particles are allocated) when ready
        const c = (this.cp[name] = { pipe: null, bg: null });
        d.createComputePipelineAsync(desc).then((p) => { c.pipe = p; if (this._cpRes) this._cpBind(name); })
          .catch((e) => console.error('[tidemote] pipeline', name, e?.message || e));
      } else this.cp[name] = { pipe: cPipe(desc), bg: null };
    }
    this.cpPick = { pipe: cp(this.pickModule, 'pickMain'), bg: null };
    this.cpTrackNear = cp(this.pickModule, 'trackNear');
    this.cpTrackArgs = cp(this.pickModule, 'trackArgs');
    this.cpListen = { pipe: cp(this.listenModule, 'listenMain'), bg: null };
    this.cpWatch = { pipe: cp(this.watchModule, 'watchMain'), bg: null };
    this.cpWatchNear = cp(this.watchModule, 'watchNear');
    this.cpWatchArgs = cp(this.watchModule, 'watchArgs');
    this.cpSurvey = { pipe: cp(this.surveyModule, 'surveyMain'), bg: null };
    const seaModule = d.createShaderModule({ code: SEA_WGSL, label: 'sea' });
    // the water's bend over the main view, read back for the page's overlays (seaShiftMap; seaShift)
    this.cpShift = cp(this.postModule, 'seaShiftMap');
    b.shiftMap = d.createBuffer({ size: SHIFT_W * SHIFT_H * 8, usage: U.STORAGE | U.COPY_SRC });
    this.shiftRead = [0, 1, 2].map(() => ({ buf: d.createBuffer({ size: SHIFT_W * SHIFT_H * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false }));
    // the last two grids read back: { data (pixels of the view drawn then), cam: { x, y, ppu, w, h }, at (ms) }
    this.seaShifts = [];
    this.seaPipes = { init: cp(seaModule, 'seaInit'), spectrum: cp(seaModule, 'seaSpectrum'), rows: cp(seaModule, 'fftRows'), cols: cp(seaModule, 'fftCols'), mip: cp(seaModule, 'seaMip') };

    const additive = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
    // the main view's draws into the trails: additive, weighted per frame by the blend constant (_render)
    const trail = { color: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' } };
    const over = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    const rp = (mod, vs, fs, topology, blend, fmt = HDR, constants = {}) => rPipe({
      layout: 'auto',
      vertex: { module: mod, entryPoint: vs },
      fragment: { module: mod, entryPoint: fs, targets: [{ format: fmt, blend }], constants },
      primitive: { topology },
      label: fs,
    });
    this.pPoint = rp(this.drawModule, 'vsPoint', 'fsPoint', 'triangle-strip', additive);
    // sprites of a pixel or so, splatted into a buffer and added into the scene (splatMain, fsSplat)
    this.cpSplat = cPipe({ layout: 'auto', compute: { module: this.drawModule, entryPoint: 'splatMain' }, label: 'splatMain' });
    this.pLine = rp(this.drawModule, 'vsLine', 'fsLine', 'line-list', additive);
    // stone: the highest cobble at each pixel wins the depth test and writes its color and surface (vsStone)
    this.pStone = rPipe({ layout: 'auto', label: 'fsStone', primitive: { topology: 'triangle-strip' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      vertex: { module: this.drawModule, entryPoint: 'vsStone' },
      fragment: { module: this.drawModule, entryPoint: 'fsStone', targets: [{ format: HDR }, { format: HDR }] } });
    this.pBridge = rp(this.drawModule, 'vsBridge', 'fsBridge', 'triangle-strip', additive);
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
    this.censusStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: CENSUS_BYTES + SPL_WORDS * 4, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    this.censusN = 0;
    this.pickStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: PICK_BYTES, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    // the pipette (docs/hand.md): the cells taken at its tip, and what came of setting cells down
    this.takeStage = [0, 1].map(() => ({ buf: d.createBuffer({ size: (2 + PIPE_TAKE * PIPE_TAKE_W) * 4, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    this.setDownStage = d.createBuffer({ size: (1 + PIPE_SP + PIPE_MAX) * 4, usage: U.COPY_DST | U.MAP_READ });
    this.setDownJob = null; // one at a time (set, then sent, until read back)
    this.trackStage = [0, 1, 2, 3, 4, 5, 6, 7].map(() => ({ buf: d.createBuffer({ size: 56, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    b.reprojU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    // The main view's scene pass also gathers the living alone in a second target (fsPointLive), which
    // the composite lays over matter and stone; its other draws leave that target be.
    const rpLive = (mod, vs, fs, topology, blend, live) => rPipe({
      layout: 'auto',
      vertex: { module: mod, entryPoint: vs },
      fragment: { module: mod, entryPoint: fs, targets: [{ format: HDR, blend }, { format: HDR, blend: additive, writeMask: live ? GPUColorWrite.ALL : 0 }] },
      primitive: { topology },
      label: fs + '+live',
    });
    this.main = {
      point: rpLive(this.drawModule, 'vsPoint', 'fsPointLive', 'triangle-strip', trail, true),
      splat: rpLive(this.drawModule, 'vsFade', 'fsSplat', 'triangle-list', trail, false),
      line: rpLive(this.drawModule, 'vsLine', 'fsLine', 'line-list', trail, false),
      bridge: rpLive(this.drawModule, 'vsBridge', 'fsBridge', 'triangle-strip', trail, false),
      reproj: rpLive(this.postModule, 'vsFull', 'fsReproj', 'triangle-list', undefined, false),
      tube: rpLive(this.drawModule, 'vsTube', 'fsTubeLive', 'triangle-strip', trail, true),
    };
    // Max and coarse speeds: the last drawn world, carried with the camera onto the display frames between draws
    b.holdU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    this.pHold = rp(this.postModule, 'vsFull', 'fsReproj', 'triangle-list', undefined, format);

    // the main view's micro-suspension: specks found per frame, then drawn as quads (MICRO_WGSL)
    this.microModule = d.createShaderModule({ code: MICRO_WGSL, label: 'micro' });
    this.cpMicro = cPipe({ layout: 'auto', compute: { module: this.microModule, entryPoint: 'microSpecks' }, label: 'microSpecks' });
    this.pSpeck = rp(this.microModule, 'vsSpeck', 'fsSpeck', 'triangle-strip', additive);
    b.microU = d.createBuffer({ size: 256, usage: U.UNIFORM | U.COPY_DST });
    b.specks = d.createBuffer({ size: MICRO_SPECKS * 64, usage: U.STORAGE });
    b.microArgs = d.createBuffer({ size: 16, usage: U.STORAGE | U.INDIRECT | U.COPY_DST });
    this.microData = new ArrayBuffer(256);
  }

  // Waits for every pipeline the constructor started, puts each in its place (fields, arrays and
  // objects one or two deep that hold a promise), then makes the bind groups that need their layouts.
  async pipelinesReady(onProgress) {
    const total = this._pipes.reduce((a, p) => a + p.w, 0);
    let done = 0;
    onProgress?.(0);
    try {
      await Promise.all(this._pipes.map((p) => p.pr.then(() => { done += p.w; onProgress?.(done / total); })));
    } catch (e) {
      // a pipeline that fails validation is a shader error; anything else (a lost device) may pass on a retry
      throw new Error(e?.reason === 'validation' ? `Shader compile failed:\n${e.message}` : String(e?.message || e));
    }
    this._pipes = null;
    const plain = (v) => v && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype);
    const settle = async (o, depth) => {
      for (const k of Object.keys(o)) {
        if (o[k] instanceof Promise) o[k] = await o[k];
        else if (depth > 0 && plain(o[k])) await settle(o[k], depth - 1);
      }
    };
    await settle(this, 2);
    const d = this.device, b = this.b;
    for (const c of this.cull) c.bg = d.createBindGroup({ layout: this.cpCull.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: c.u } }, { binding: 1, resource: { buffer: b.cellStart } },
      { binding: 2, resource: { buffer: c.segs } }, { binding: 3, resource: { buffer: c.args } }] });
    this.cpShiftBG = d.createBindGroup({ layout: this.cpShift.getBindGroupLayout(0), entries: [
      { binding: 2, resource: { buffer: b.post } }, { binding: 11, resource: { buffer: b.thermal } },
      { binding: 13, resource: this.seaView }, { binding: 14, resource: this.seaSampler }, { binding: 15, resource: { buffer: b.shiftMap } }] });
    this.cpMicroBG = d.createBindGroup({ layout: this.cpMicro.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.post } }, { binding: 1, resource: { buffer: b.microU } },
      { binding: 2, resource: { buffer: b.specks } }, { binding: 3, resource: { buffer: b.microArgs } }] });
  }

  _cpBind(name) {
    const c = this.cp[name], res = this._cpRes;
    c.bg = this.device.createBindGroup({ layout: c.pipe.getBindGroupLayout(0), entries: this.cpDefs[name].map((id) => ({ binding: id, resource: res[id] })) });
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
    b.lerpEnd?.destroy();
    b.lerpEnd = d.createBuffer({ size: n * 8, usage: U.STORAGE });
    b.lerpU ??= d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    this._lerpN = 0; this._lerpOk = false;
    b.sortedLite = d.createBuffer({ size: n * LITE_BYTES, usage: U.STORAGE });
    b.aux = d.createBuffer({ size: n * 8, usage: U.STORAGE });
    b.intent = d.createBuffer({ size: n * 16, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    b.bondsNow = d.createBuffer({ size: n * 36, usage: U.STORAGE | U.COPY_SRC });
    b.bondsIn = d.createBuffer({ size: n * 20, usage: U.STORAGE });
    // contacts start absent (NONE) until the first gather in view
    b.touch = d.createBuffer({ size: n * 24, usage: U.STORAGE, mappedAtCreation: true });
    new Uint32Array(b.touch.getMappedRange()).fill(0xffffffff);
    b.touch.unmap();
    // each cell's drawn motion and recent events, by ID (contactGather): only cells in view need a slot
    b.sway = d.createBuffer({ size: Math.min(n, 1 << 20) * SWAY_BYTES, usage: U.STORAGE | U.COPY_SRC });
    b.stoneList = d.createBuffer({ size: n * 4, usage: U.STORAGE });
    // the claims, then the species ledger (observational), the hand's words (the pipette's, PIPE_* in shaders.js),
    // then the step's heat deposits and husk piles (heatAccAt in SIM_WGSL); only the head and the claims are saved
    b.ledger = d.createBuffer({ size: (META_CLAIM + n + SPL_WORDS + HAND_WORDS + 2 * MAX_CELLS) * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.livingList = d.createBuffer({ size: (n + 256) * 4, usage: U.STORAGE | U.COPY_DST });
    // the particles too large to splat (splatMain): the points' draw arguments, then their indices
    b.quads = d.createBuffer({ size: (4 + n) * 4, usage: U.STORAGE | U.INDIRECT | U.COPY_DST });
    const res = {
      0: { buffer: b.sim }, 1: { buffer: b.parts }, 2: { buffer: b.sortedFull }, 3: { buffer: b.sortedLite },
      4: { buffer: b.counts }, 5: { buffer: b.counts }, 6: { buffer: b.cellStart }, 7: { buffer: b.blockSums },
      8: { buffer: b.aux }, 9: { buffer: b.intent }, 10: { buffer: b.genomes }, 11: { buffer: b.ledger },
      12: { buffer: b.livingList }, 13: { buffer: b.frameCtr }, 14: { buffer: b.stoneGrid },
      15: { buffer: b.bondsNow }, 20: { buffer: b.bondsNow }, 16: { buffer: b.stoneList }, 17: { buffer: b.mind }, 18: { buffer: b.thermal }, 19: { buffer: b.heatNext },
      22: { buffer: b.stoneGrid }, 23: { buffer: b.genomes },
    };
    this._cpRes = res;
    for (const name of Object.keys(this.cpDefs)) if (this.cp[name].pipe) this._cpBind(name);
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
    const inbondUse = [[2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 4, 5, 6, 7, 8]];
    this.inbondBG = this.cpInbond.map((pipe, k) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0),
      entries: inbondUse[k].map((binding) => ({ binding, resource: { buffer: inbondRes[binding] } })) }));
    // (vsBridge sizes cells as vsPoint does, so it reads sway; vsLine doesn't)
    const lineBG = (pipe, view, k, sway = false) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.genomes } },
      { binding: 3, resource: { buffer: b.intent } }, { binding: 4, resource: { buffer: b.livingList } }, { binding: 5, resource: { buffer: b.focus } },
      ...(sway ? [{ binding: 9, resource: { buffer: b.sway } }] : []), { binding: 11, resource: { buffer: b.thermal } }, { binding: 12, resource: { buffer: this.cull[k].segs } }] });
    this.bgPoint = pointBG(b.view, 0);
    this.bgLine = lineBG(this.pLine, b.view, 0);
    // the main view's scene pass (two targets: its pipelines' own layouts)
    this.mainBG = { point: pointBG(b.view, 0, this.main.point), line: lineBG(this.main.line, b.view, 0), bridge: lineBG(this.main.bridge, b.view, 0, true) };
    const bufs = (pipe, list) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: list.map(([binding, buffer]) => ({ binding, resource: { buffer } })) });
    this.tubeBG = bufs(this.main.tube, [[0, b.view], [1, b.tubeParts], [2, b.tubeGenomes], [10, b.tubeOrgans]]);
    this.tubeOrgansBG = bufs(this.cpOrgans, [[7, b.tubeGenomes], [9, b.tubeOrgans]]);
    this.bgPointL = pointBG(b.viewL, 1);
    this.bgLineL = lineBG(this.pLine, b.viewL, 1);
    this.bgPointS = pointBG(b.viewS, 2);
    this.bgLineS = lineBG(this.pLine, b.viewS, 2);
    this.bgBridge = lineBG(this.pBridge, b.view, 0, true);
    this.bgBridgeL = lineBG(this.pBridge, b.viewL, 1, true);
    this.bgBridgeS = lineBG(this.pBridge, b.viewS, 2, true);
    const verr = await d.popErrorScope();
    const oerr = await d.popErrorScope();
    if (verr || oerr) {
      if (verr) console.warn(`allocate: ${verr.message}`);
      for (const k of names) { b[k]?.destroy(); b[k] = null; }
      return false;
    }
    this.capacity = n;
    this._splatBGs();
    return true;
  }

  // the look lab (tools/looklab.mjs) swaps in a new composite shader while the page runs
  hotComposite(code) {
    const d = this.device;
    const mod = d.createShaderModule({ code, label: 'post' });
    const rp = (constants) => d.createRenderPipeline({ layout: 'auto', label: 'fsComposite', primitive: { topology: 'triangle-list' },
      vertex: { module: mod, entryPoint: 'vsFull' }, fragment: { module: mod, entryPoint: 'fsComposite', targets: [{ format: this.format }], constants } });
    this.pComp = rp({}); this.pCompClear = rp({ MICRO_SUSPENSION: 0 });
    this.compBG = this.compBGOf(this.pComp); this.compClearBG = this.compBGOf(this.pCompClear);
    return mod.getCompilationInfo().then((i) => i.messages.filter((m) => m.type === 'error').map((m) => `${m.lineNum}:${m.linePos} ${m.message}`));
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
      { binding: 10, resource: this.microView }, { binding: 11, resource: { buffer: this.b.thermal } }, { binding: 12, resource: this.liveView },
      { binding: 13, resource: this.seaView }, { binding: 14, resource: this.seaSampler }] }));
    this.compBG = compBG(this.pComp);
    this.compClearBG = compBG(this.pCompClear);
    this.compBGOf = compBG;
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
    this.b.splat = d.createBuffer({ size: w * h * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this._splatBGs();
  }

  _splatBGs() {
    const d = this.device, b = this.b;
    if (!b.splat || !b.parts) return;
    this.splatBG = d.createBindGroup({ layout: this.cpSplat.getBindGroupLayout(0), entries: [[0, b.view], [1, b.parts], [2, b.genomes], [3, b.intent], [5, b.focus], [9, b.sway], [11, b.thermal], [13, b.splat], [15, b.quads]]
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
      { binding: 6, resource: { buffer: this.b.viewL } }, { binding: 7, resource: this.loupeStoneView[0] }, { binding: 8, resource: this.loupeStoneView[1] },
      { binding: 11, resource: { buffer: this.b.thermal } }, { binding: 13, resource: this.seaView }, { binding: 14, resource: this.seaSampler }] });
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
   * opening light, husks and founding community. Life starts sparse: K.foundLife of the particles, in
   * K.foundColonies small colonies in empty water, as a world recovering from a collapse begins again.
   */
  seed(n, { aspect = 16 / 9, rng = Math.random } = {}) {
    this._lerpN = 0; this._lerpOk = false;
    const d = this.device;
    this.worldGeneration++;
    this._dropSetDown();
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
    this.temp = mix(10, 22, rng());
    this.excursion = 0;
    this.randomizeTide(rng);
    this.randomizeCurrents(rng);
    const husk = mix(0.02, 0.06, rng()), silt = 1 - husk - this.K.foundLife;
    // Bedrock outcrops: from none to about 8% of the area, as chains of discs a few cells across.
    const cells = this.grid[0] * this.grid[1];
    const rockR = mix(1.2, 3.0, rng());
    const cover = rng() ** 1.5 * 0.08 * this.K.rocks;
    this.rock.set([Math.min(256, Math.round((cover * cells) / (10 * rockR * rockR))), rockR, 0, 0]);

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
    const plan = Array.from({ length: Math.min(MAXK - FIRST_LIFE, Math.round(this.K.foundKinds)) }, () => draw(weights, total));
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
    // each world draws the share of its founders that are random sparks (as abiogenesis makes) rather
    // than designed body plans, so worlds begin differently
    const randomShare = rng();
    plan.forEach((type, s) => {
      const g = rng() < randomShare ? randomGenome(rng, this.K, warm) : archetypeGenome(type, rng, this.K, warm);
      g.serial = s + 1;
      writeGenome(gu, gf, FIRST_LIFE + s, g);
      head[META_SLOT + FIRST_LIFE + s] = 1;
    });
    d.queue.writeBuffer(this.b.genomes, 0, gbuf);
    d.queue.writeBuffer(this.b.ledger, 0, head);
    this.founders = plan.length;

    this._writeSim({ seedKinds: plan.length, pSilt: silt, pHusk: husk });
    // the water starts at the background everywhere; framboids and crowds warm it within a minute
    const water = new Float32Array(cells).fill(this.tbg);
    d.queue.writeBuffer(this.b.thermal, 0, water);
    // the pool's floor, from the world's seed, and the order in which it freezes
    this.relief = makeRelief(this.grid[0], this.grid[1], this.seedValue);
    this.floor = null;
    d.queue.writeBuffer(this.b.thermal, MAX_CELLS * 4, this.relief);
    d.queue.writeBuffer(this.b.thermal, 2 * MAX_CELLS * 4, (this.iceOrder = makeIceOrder(this.grid[0], this.grid[1], this.seedValue, this.relief)));
    this.level = 1; this.rain = 0; this.sky = 1; this.evap = 0; this.turb = 1; this.frost = 0; this.freezing = 0; this.mudRain = 0; this.parch = 0; this.duck.fill(0); this.drops.fill(0);
    const enc = d.createCommandEncoder();
    enc.clearBuffer(this.b.ledger, this._heatAccAt(), cells * 4);
    enc.clearBuffer(this.b.counts);
    enc.clearBuffer(this.b.ledger, LEDGER_HEAD, n * 4);
    enc.clearBuffer(this.b.ledger, this._splAt(), SPL_WORDS * 4);
    enc.clearBuffer(this.b.frameCtr);
    const pass = enc.beginComputePass();
    pass.setPipeline(this.cp.seedMain.pipe);
    pass.setBindGroup(0, this.cp.seedMain.bg);
    pass.dispatchWorkgroups(Math.ceil(n / 256));
    pass.end();
    d.queue.submit([enc.finish()]);
    this.clearAccum = true;
  }

  /**
   * The floor shifts (moving geography, docs/catastrophes.md): toward the floor of epoch `k` (a share `drift` of it
   * redrawn from the seed and k), easing there over `secs` simulated seconds (stepFloor uploads it each frame
   * the time moves, so the shore creeps rather than jumps).
   */
  shiftFloor(k, drift, secs = 120) {
    if (!this.relief || !(drift > 0)) return;
    const [gw, gh] = this.grid;
    if (!this.reliefBase || this.reliefBase.length !== gw * gh || this.reliefSeed !== this.seedValue) { this.reliefBase = makeRelief(gw, gh, this.seedValue); this.reliefSeed = this.seedValue; }
    const a = this.reliefBase, b = makeRelief(gw, gh, (this.seedValue ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);
    const to = rankField(a.map((x, i) => x * (1 - drift) + b[i] * drift));
    this.floor = { from: this.relief.slice(), to, t0: this.simTime, secs, at: -Infinity };
  }
  stepFloor() {
    const f = this.floor;
    if (!f) return;
    // under a full pool nothing reads or draws the floor: it takes its new shape at once. Easing, it is
    // uploaded (the whole field) four times a simulated second, creep enough for the shore
    const u = this.level < 1 ? Math.min(1, (this.simTime - f.t0) / f.secs) : 1;
    if (u < 1 && this.simTime - f.at < 0.25) return;
    f.at = this.simTime;
    const e = u * u * (3 - 2 * u);
    for (let i = 0; i < f.to.length; i++) this.relief[i] = f.from[i] + (f.to[i] - f.from[i]) * e;
    this.device.queue.writeBuffer(this.b.thermal, MAX_CELLS * 4, this.relief);
    if (u >= 1) this.floor = null;
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

  // The GPU's clock: simulated time modulo SIM_CLOCK (shaders.js), and what it wraps off folded into the
  // tide's and the currents' phases here, in f64, so the light and the flow are continuous across a wrap.
  // Raindrops' times go relative to it. The real-time clock (drawing) wraps at REAL_WRAP.
  _clock() {
    const base = Math.floor(this.simTime / SIM_CLOCK) * SIM_CLOCK, c = (this._clk ??= { tidePh: new Float32Array(4), wavePh: new Float32Array(4), drops: new Float32Array(16) });
    for (let k = 0; k < 4; k++) {
      c.tidePh[k] = (this.tidePh[k] + this.tide[k * 4 + 2] * base) % (2 * Math.PI);
      c.wavePh[k] = (k * 1.7 + this.waves[k * 4 + 2] * base) % (2 * Math.PI);
      c.drops.set([this.drops[k * 4], this.drops[k * 4 + 1], this.drops[k * 4 + 2] - base, this.drops[k * 4 + 3]], k * 4);
    }
    c.t = this.simTime - base;
    return c;
  }

  // How rough the sea is, 0 calm to 1 a full storm: the rain, more with the storm's currents (turb), unless the tunables
  // hold it.
  get seaRough() {
    if (this.seaTune.rough >= 0) return this.seaTune.rough;
    return Math.min(1, this.rain * (0.6 + 0.65 * Math.min(1, Math.max(0, (this.turb - 1) / 1.6))));
  }

  // The sea made again from the tunables' waves (src/seatune.js); reroll: a new sea and wind too.
  seaRebuild(reroll = false) {
    this.seaSpec = seaSpecOf(SEA, this.seaTune);
    this._seaVer++;
    if (reroll) this._seaRoll = (this._seaRoll ?? 0) + 1;
  }

  /**
   * Where world point (wx, wy) shows in the main view, as an offset from where it lies (device pixels of the view
   * drawn now at ppu): the water bends the view (fsComposite: the pixel at x shows the scene at x + shift(x)), so a
   * point lying at c shows at the x with x + shift(x) = c, found in two steps of x = c - shift(x). From the grids the
   * GPU last drew (seaShiftMap), each sampled where the point lay in its own view and carried on to now from the two,
   * as they come back a frame or two late. [0, 0] without the water.
   */
  seaShift(wx, wy, cam) {
    const S = this.seaShifts;
    if (!S.length) return [0, 0];
    const [W, H] = this.grid;
    const at = (m, ox, oy) => {
      const c = m.cam;
      let dx = wx - c.x, dy = wy - c.y;
      dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H);
      // (in that view's pixels, then the grid's cells)
      const gx = ((dx * c.ppu + c.w / 2 + ox * (c.ppu / cam.ppu)) / c.w) * SHIFT_W - 0.5, gy = ((dy * c.ppu + c.h / 2 + oy * (c.ppu / cam.ppu)) / c.h) * SHIFT_H - 0.5;
      const x0 = Math.max(0, Math.min(SHIFT_W - 1, Math.floor(gx))), y0 = Math.max(0, Math.min(SHIFT_H - 1, Math.floor(gy)));
      const x1 = Math.min(SHIFT_W - 1, x0 + 1), y1 = Math.min(SHIFT_H - 1, y0 + 1), fx = Math.max(0, Math.min(1, gx - x0)), fy = Math.max(0, Math.min(1, gy - y0));
      const v = (x, y, k) => m.data[(y * SHIFT_W + x) * 2 + k];
      const lerp = (k) => (v(x0, y0, k) * (1 - fx) + v(x1, y0, k) * fx) * (1 - fy) + (v(x0, y1, k) * (1 - fx) + v(x1, y1, k) * fx) * fy;
      // (that view's pixels, as world units, to this one's)
      return [lerp(0) * (cam.ppu / c.ppu), lerp(1) * (cam.ppu / c.ppu)];
    };
    const now = performance.now(), b = S[S.length - 1], a = S.length > 1 ? S[0] : null;
    const k = a && b.at > a.at ? Math.min(3, (now - b.at) / (b.at - a.at)) : 0;
    const shift = (ox, oy) => {
      const q = at(b, ox, oy);
      if (!k) return q;
      const p = at(a, ox, oy);
      return [q[0] + (q[0] - p[0]) * k, q[1] + (q[1] - p[1]) * k];
    };
    let s = shift(0, 0);
    s = shift(-s[0], -s[1]);
    return [-s[0], -s[1]];
  }

  // The way the tide's light bands drift, as the sea's prevailing wind (radians): their crests' velocities (each wave's
  // -w k/|k|^2, from its wave numbers across the world and its drift), weighted by its strength; null while they
  // cancel.
  get tideWind() {
    const [wx, wy] = this.grid;
    let vx = 0, vy = 0;
    for (let k = 0; k < 4; k++) {
      const kx = (2 * Math.PI * this.tide[k * 4]) / wx, ky = (2 * Math.PI * this.tide[k * 4 + 1]) / wy, w = this.tide[k * 4 + 2], a = this.tide[k * 4 + 3];
      const k2 = kx * kx + ky * ky;
      if (k2 > 0) { vx -= (a * w * kx) / k2; vy -= (a * w * ky) / k2; }
    }
    return Math.hypot(vx, vy) > 1e-6 ? Math.atan2(vy, vx) : null;
  }

  // The sea's amplitudes and the FFT's working buffer, made with the first frame, and the passes' bind groups.
  _seaBuffers() {
    const d = this.device, b = this.b, P = this.seaPipes, U = GPUBufferUsage;
    const bytes = SEA_CASCADES * SEA_N * SEA_N * 16;
    b.seaH0 = d.createBuffer({ size: bytes, usage: U.STORAGE, label: 'seaH0' });
    b.seaWork = d.createBuffer({ size: bytes, usage: U.STORAGE, label: 'seaWork' });
    const bg = (pipe, entries) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: entries.map(([binding, resource]) => ({ binding, resource })) });
    const level = (l) => this.seaTex.createView({ dimension: '2d-array', baseMipLevel: l, mipLevelCount: 1 });
    this.seaBG = {
      init: bg(P.init, [[0, { buffer: b.seaU }], [1, { buffer: b.seaH0 }]]),
      spectrum: bg(P.spectrum, [[0, { buffer: b.seaU }], [1, { buffer: b.seaH0 }], [2, { buffer: b.seaWork }]]),
      rows: bg(P.rows, [[2, { buffer: b.seaWork }]]),
      cols: bg(P.cols, [[2, { buffer: b.seaWork }], [3, level(0)]]),
      mips: Array.from({ length: Math.log2(SEA_N) }, (_, i) => bg(P.mip, [[3, level(i + 1)], [4, level(i)]])),
    };
  }

  // The sea (src/sea.js, SEA_WGSL), always: its own for each world (its random draws from the world's seed, made
  // again when the world changes size; its wind the tide's drift); then each frame its spectrum turned to now, inverted into the sea texture,
  // and mipmapped. Its clock runs with simulated time at the sea's pace (slow in calm water, full speed in a storm),
  // summed frame by frame so a change of pace never jumps its phase, and kept modulo the period it loops over, in f64.
  _sea(enc) {
    const d = this.device, P = this.seaPipes, N = SEA_N;
    // no sea (Water surface off): no passes, and its clock held still
    if (this.seaTune.view === 3) { this._seaLast = this.simTime; this._seaReal = performance.now(); return; }
    if (!this.seaBG) this._seaBuffers();
    const f = new Float32Array(this.seaData), u = new Uint32Array(this.seaData);
    const key = `${this.grid.join('x')}:${this.seedValue}:${this._seaRoll ?? 0}`;
    const fresh = !this._seaOn || this._seaKey !== key || this._seaBuilt !== this._seaVer;
    if (fresh) {
      if (this._seaKey !== key) { this._seaT = 0; this._seaLast = this.simTime; this._seaReal = performance.now(); this._seaWind = null; }
      this._seaOn = true;
      this._seaKey = key;
      this._seaBuilt = this._seaVer;
      let h = (this.seedValue ^ Math.imul(this._seaRoll ?? 0, 0x85ebca6b)) >>> 0;
      const rnd = () => ((h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 2 ** 32);
      const P = this.seaSpec, layout = seaLayout(this.grid, P), scale = seaScales(layout, P), S = 4 * SEA_CASCADES, Y = S + 4 * P.systems.length;
      layout.forEach((c, i) => f.set([c.L[0], c.L[1], c.k0, c.k1], i * 4));
      P.systems.forEach((sys, j) => f.set([(2 * Math.PI) / sys.lp, scale[j], sys.spread, 0], S + j * 4));
      f.set([0, P.p, P.gamma, (2 * Math.PI) / P.lmin], Y);
      this._seaWindAt = Y;
      if (this._seaWind == null) this._seaWind = this.tideWind ?? 0;
      f.set([0, (2 * Math.PI) / P.T, (2 * Math.PI) / P.Tp, (2 * Math.PI) / P.systems[0].lp], Y + 4);
      f.set([P.beta, 0, 0, 0], Y + 8);
      u[Y + 12] = (rnd() * 2 ** 32) >>> 0;
      this._seaClock = Y + 4;
    }
    // how much time the sea's clock covers this frame: the real time passed, times the sim's speed (simulated time over
    // real time) to the power `follow` (1: simulated time; 0: real time, whatever the speed)
    const t = this.seaTune, now = performance.now();
    const sim = this.simTime - this._seaLast, real = Math.min(0.25, (now - (this._seaReal ?? now)) / 1000);
    this._seaLast = this.simTime;
    this._seaReal = now;
    const dt = t.follow >= 1 ? sim : real > 0 ? real * Math.max(0, sim / real) ** t.follow : 0;
    if (dt > 0) this._seaT = (this._seaT + dt * t.pace * (t.calmPace + (1 - t.calmPace) * this.seaRough)) % SEA.T;
    // the wind turns toward the tide's prevailing drift (tideWind) by the shorter way, easing over about SEA_WIND_EASE
    // simulated seconds: across a change of era (the tide's waves themselves fading in and out over a minute) and
    // whenever the tide's waves nearly cancel and their drift's direction swings
    const to = this.tideWind;
    if (to != null && sim > 0) {
      const turn = Math.atan2(Math.sin(to - this._seaWind), Math.cos(to - this._seaWind));
      this._seaWind = (this._seaWind + turn * Math.min(1, sim / SEA_WIND_EASE)) % (2 * Math.PI);
    }
    // (turned half a circle: a wave of wavenumber k runs toward -k here, h0 e^{iwt} across e^{ik.x}, so the spread
    // favors the wavenumbers against the wind for the waves to run with it)
    f[this._seaWindAt] = this._seaWind + Math.PI;
    f[this._seaClock] = this._seaT;
    d.queue.writeBuffer(this.b.seaU, 0, this.seaData);
    const pass = enc.beginComputePass({ label: 'sea' });
    if (fresh) { pass.setPipeline(P.init); pass.setBindGroup(0, this.seaBG.init); pass.dispatchWorkgroups(N / 16, N / 16, SEA_CASCADES); }
    pass.setPipeline(P.spectrum); pass.setBindGroup(0, this.seaBG.spectrum); pass.dispatchWorkgroups(N / 16, N / 16, SEA_CASCADES);
    pass.setPipeline(P.rows); pass.setBindGroup(0, this.seaBG.rows); pass.dispatchWorkgroups(N, SEA_CASCADES);
    pass.setPipeline(P.cols); pass.setBindGroup(0, this.seaBG.cols); pass.dispatchWorkgroups(N, SEA_CASCADES);
    pass.setPipeline(P.mip);
    this.seaBG.mips.forEach((g, i) => { const n = Math.max(1, N >> (i + 1)); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8), SEA_CASCADES); });
    pass.end();
  }

  // The sea for the post pass, into pd from 92: how strongly its slope shades the view, how far below it lie the focal
  // plane its slope bends the view of and the plane it focuses the lamp's light onto (units), all as high as the sea
  // (a share of a storm's in calm water: seaTune.calm); and each cascade's patch, how far it carries the water toward
  // its crests (a storm's choppy waves, none in calm water's gentle swell), and whether it holds any waves (a cascade
  // whose band lies past the damping holds next to none).
  _seaPost(pd) {
    pd.fill(0, 92);
    if (!this._seaOn) return;
    const t = this.seaTune, r = this.seaRough, a = (t.calm + (1 - t.calm) * r) * t.height;
    pd[92] = t.tilt * a; pd[93] = t.refract * a; pd[94] = t.view === 3 ? 0 : 1; pd[95] = t.caustic * a;
    const kc = (2 * Math.PI) / this.seaSpec.lmin;
    seaLayout(this.grid, this.seaSpec).forEach((c, i) => pd.set([c.L[0], c.L[1], t.chop * r * t.height, c.k0 < 2.5 * kc ? 1 : 0], 96 + i * 4));
    // how the caustics' focus is softened and capped, and what is drawn (seaTune.view)
    pd.set([t.lightSoft, t.lightCap, t.view, 0], 96 + 4 * SEA_CASCADES);
  }

  _writeSim(extra = {}) {
    this._fillSim(extra);
    this.device.queue.writeBuffer(this.b.sim, 0, this.simData);
  }

  _fillSim(extra = {}) {
    const f = this.simF, u = this.simU, clk = this._clock();
    f[0] = this.grid[0]; f[1] = this.grid[1];
    u[2] = this.grid[0]; u[3] = this.grid[1];
    u[4] = this.count; u[5] = this.frameNo;
    f[6] = this.dt || 1 / 60; f[7] = clk.t;
    // a coarse step keeps per-second rates: the per-step abiogenesis chance scales with its length
    f[8] = this.season; f[9] = Math.min(1, this.abio * this.ticks);
    u[10] = (this.seedValue + this.frameNo * 7919) >>> 0; f[11] = this.K.maxSpeed;
    u[12] = extra.seedKinds || 1; f[13] = extra.pSilt || 0; f[14] = clk.wavePh[0]; f[15] = extra.pHusk || 0;
    f[16] = this.ambient; f[17] = clk.wavePh[1]; f[18] = clk.wavePh[2]; f[19] = clk.wavePh[3];
    f.set(this.waves, 20);
    f.set(this.tide, 36);
    f.set(clk.tidePh, 52);
    f.set(this.rock, 56);
    u[60] = this.tick; u[61] = this.ticks; f[62] = this.tbg; u[63] = this.maxScan;
    f[64] = this.level; f[65] = this.rain; f[66] = this.sky; f[67] = this.evap;
    f[68] = this.turb; f[69] = this.frost; f[70] = this.freezing; f[71] = 0;
    f.set(this.duck, 72);
    f.set(clk.drops, 80);
    u.set(this.handU, 96);
    // the needle pricks once
    this.handU[20] = 0xffffffff;
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
    this._lerpOk = true;
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
    enc.clearBuffer(b.counts, MAX_CELLS * 4, cells * 4);
    enc.clearBuffer(b.stoneGrid, 0, cells * 4);
    if (this.K.heat) enc.clearBuffer(b.ledger, this._heatAccAt() + MAX_CELLS * 4, cells * 4);
    enc.clearBuffer(b.ledger, META_POP * 4, MAXK * 4);
    // litter on the ground (META_DEATH + 60) and cysts per guild (57-59, 61, 62), counted afresh each step
    enc.clearBuffer(b.ledger, (META_DEATH + 57) * 4, 6 * 4);
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
    run('contactMain', null);
    run('bondBackMain', null);
    run(this.ticks > 1 ? 'lifeMainCoarse' : 'lifeMain', null);
    if (this.K.heat) run('heatMain', Math.ceil(cells / 64));
    if (!prof) pass.end();
    // the next temperatures become this step's
    if (this.K.heat) enc.copyBufferToBuffer(b.heatNext, 0, b.thermal, 0, cells * 4);
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
    this._lerpBack();
    const d = this.device, b = this.b, U = GPUBufferUsage;
    const enc = d.createCommandEncoder();
    const keep = { gpu: {} };
    for (const k of ['parts', 'genomes', 'intent', 'ledger', 'thermal']) {
      // the ledger without the species ledger at its end (observational: a world's record does not keep it)
      const size = k === 'ledger' ? this._splAt() : b[k].size;
      keep.gpu[k] = d.createBuffer({ size, usage: U.COPY_SRC | U.COPY_DST });
      enc.copyBufferToBuffer(b[k], 0, keep.gpu[k], 0, size);
    }
    d.queue.submit([enc.finish()]);
    keep.cpu = { simTime: this.simTime, frameNo: this.frameNo, tick: this.tick, season: this.season, abio: this.abio,
      ambient: this.ambient, seedValue: this.seedValue, temp: this.temp, excursion: this.excursion,
      tide: this.tide.slice(), tidePh: this.tidePh.slice(), waves: this.waves.slice(), rock: this.rock.slice(),
      level: this.level, rain: this.rain, sky: this.sky, evap: this.evap, turb: this.turb, frost: this.frost, freezing: this.freezing, duck: this.duck.slice(), drops: this.drops.slice() };
    return keep;
  }

  restore(keep) {
    const d = this.device, b = this.b;
    const enc = d.createCommandEncoder();
    for (const [k, buf] of Object.entries(keep.gpu)) enc.copyBufferToBuffer(buf, 0, b[k], 0, buf.size);
    d.queue.submit([enc.finish()]);
    const c = keep.cpu;
    Object.assign(this, { simTime: c.simTime, frameNo: c.frameNo, tick: c.tick, season: c.season, abio: c.abio,
      ambient: c.ambient, seedValue: c.seedValue, temp: c.temp, excursion: c.excursion,
      level: c.level ?? 1, rain: c.rain ?? 0, sky: c.sky ?? 1, evap: c.evap ?? 0, turb: c.turb ?? 1, frost: c.frost ?? 0, freezing: c.freezing ?? 0 });
    this.tide.set(c.tide); this.tidePh.set(c.tidePh); this.waves.set(c.waves); this.rock.set(c.rock);
    this.relief = makeRelief(this.grid[0], this.grid[1], this.seedValue);
    if (c.duck) this.duck.set(c.duck);
    if (c.drops) this.drops.set(c.drops);
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
    this._lerpN = 0; this._lerpOk = false;
    for (const [k, data] of Object.entries(gpu)) this.device.queue.writeBuffer(this.b[k], 0, data);
    // the species ledger starts afresh with the world put in place
    const enc = this.device.createCommandEncoder();
    enc.clearBuffer(this.b.ledger, this._splAt(), SPL_WORDS * 4);
    this.device.queue.submit([enc.finish()]);
    this.restore({ gpu: {}, cpu });
    this.count = cpu.count; this.grid = [...cpu.grid];
    if (cpu.founders != null) this.founders = cpu.founders;
    if (gpu.thermal) {
      // the floor as the world left it (eras move it), and the order it freezes in, which a save does
      // not keep (compactState): built again from the seed, as seed() builds it
      const [gw, gh] = this.grid, t = new Float32Array(gpu.thermal);
      this.relief = t.slice(MAX_CELLS, MAX_CELLS + gw * gh);
      this.floor = null;
      this.iceOrder = makeIceOrder(gw, gh, this.seedValue, makeRelief(gw, gh, this.seedValue));
      this.device.queue.writeBuffer(this.b.thermal, 2 * MAX_CELLS * 4, this.iceOrder);
    }
    this.sorted = false;
    this.worldGeneration++;
    this._dropSetDown();
    this.clearAccum = true;
    // the scans' windows start afresh: the last scan's time belongs to the world before
    this._listenSim = this._surveySim = null;
  }

  /** Read every particle now (headless forks): { u32, f32 } views over count records of P_BYTES. */
  // the true positions back in place of those drawn in between steps, for what reads the world itself
  _lerpBack() {
    if (!this._lerpN) return;
    const d = this.device, lu = new Uint32Array(8);
    lu[4] = this._lerpN;
    d.queue.writeBuffer(this.b.lerpU, 0, lu);
    const enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.cpLerpBack); pass.setBindGroup(0, this._lerpBG.back); pass.dispatchWorkgroups(Math.ceil(this._lerpN / 256)); pass.end();
    d.queue.submit([enc.finish()]);
    this._lerpN = 0;
  }

  async readParticles() {
    this._lerpBack();
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

  /**
   * The water's temperature at a few world points (the hand's sound: what the stage and probe are doing to it), or
   * null while the last read is still out. Each point reads its grid cell; at most 16.
   */
  tempsAt(points) {
    if (this.tempBusy || !points.length) return Promise.resolve(null);
    const d = this.device, [W, H] = this.grid, n = Math.min(16, points.length);
    this.tempStage ||= d.createBuffer({ size: 16 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    this.tempBusy = true;
    const enc = d.createCommandEncoder();
    for (let k = 0; k < n; k++) {
      const [x, y] = points[k], cx = ((Math.floor(x) % W) + W) % W, cy = ((Math.floor(y) % H) + H) % H;
      enc.copyBufferToBuffer(this.b.thermal, (cy * W + cx) * 4, this.tempStage, k * 4, 4);
    }
    d.queue.submit([enc.finish()]);
    return this.tempStage.mapAsync(GPUMapMode.READ).then(() => {
      const out = new Float32Array(this.tempStage.getMappedRange(0, n * 4).slice(0));
      this.tempStage.unmap();
      return out;
    }).catch(() => null).finally(() => { this.tempBusy = false; });
  }

  /** Read the water's temperature on each grid cell now (headless diagnostics): a Float32Array of grid[0] * grid[1]. */
  async readThermal() {
    const d = this.device, U = GPUBufferUsage, n = this.grid[0] * this.grid[1];
    const st = d.createBuffer({ size: n * 4, usage: U.COPY_DST | U.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyBufferToBuffer(this.b.thermal, 0, st, 0, n * 4);
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

  /** Where the species ledger starts in the ledger buffer (bytes): after the claims. */
  _splAt() { return (META_CLAIM + this.capacity) * 4; }
  // the hand's words (bytes): after the species ledger
  _handAt() { return this._splAt() + SPL_WORDS * 4; }
  _heatAccAt() { return this._handAt() + HAND_WORDS * 4; }

  /**
   * The pipette's bore drawn as cells in the main view (vsTube, docs/hand.md): n records laid out as struct Particle
   * (where each lies, its heading as vel, kind FIRST_LIFE + k for the k-th of the genomes), and the genomes' words
   * (G_WORDS each, as the GPU keeps them) when they change.
   */
  setTube(parts, n, genomes = null) {
    const d = this.device;
    this.tubeN = Math.min(n, TUBE_N);
    if (this.tubeN) d.queue.writeBuffer(this.b.tubeParts, 0, parts, 0, this.tubeN * P_BYTES);
    if (!genomes) return;
    d.queue.writeBuffer(this.b.tubeGenomes, FIRST_LIFE * G_BYTES, genomes);
    const enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.cpOrgans); pass.setBindGroup(0, this.tubeOrgansBG);
    pass.dispatchWorkgroups(Math.ceil(((FIRST_LIFE + TUBE_K) * ORGANS) / 64));
    pass.end();
    d.queue.submit([enc.finish()]);
  }
  /** The cells the pipette draws toward its tip (their IDs, the first PIPE_MAX), its tip and pull in hand.suck. */
  setDrawn(ids) {
    const v = Uint32Array.from(ids).subarray(0, PIPE_MAX).sort();
    if (v.length) this.device.queue.writeBuffer(this.b.ledger, this._handAt(), v);
    this.handU[23] = v.length;
  }
  /**
   * Set cells down between this frame's steps (docs/hand.md): { at: [x, y], take, species: [{ words (G_WORDS),
   * slot, stranger }], cells: [{ sp, dx, dy, vx, vy, energy, age, col, info }], earlier: [IDs of cells set down
   * before], bonds: [[keeper, partner, slot]] (each end a cell's index, or PIPE_EARLIER + an index of earlier) },
   * made of grains of silt from anywhere, each taken with the chance take. Resolves to { placed, slots, ids } (how many cells were placed, in order;
   * each species' slot or NONE; each placed cell's new ID), or null (a new world, or one still unresolved).
   */
  setDown(job) {
    if (this.setDownJob) return Promise.resolve(null);
    return new Promise((resolve) => { this.setDownJob = { ...job, resolve }; });
  }
  // a set-down not yet sent belongs to the world before
  _dropSetDown() {
    const j = this.setDownJob;
    if (j && !j.sent) { this.setDownJob = null; j.resolve(null); }
  }
  _setDown(enc, job) {
    const n = Math.min(job.cells.length, PIPE_MAX), m = Math.min(job.species.length, PIPE_SP);
    const earlier = (job.earlier || []).slice(0, PIPE_IDS), bonds = (job.bonds || []).slice(0, 2 * PIPE_MAX);
    const head = new Uint32Array(8), hf = new Float32Array(head.buffer);
    head[0] = n; head[1] = m; hf[2] = job.take; hf[3] = job.at[0]; hf[4] = job.at[1]; head[5] = earlier.length; head[6] = bonds.length;
    const sp = new Uint32Array(m * 58);
    job.species.slice(0, m).forEach((x, j) => { sp.set(x.words, j * 58); sp[j * 58 + 56] = x.slot ?? 0xffffffff; sp[j * 58 + 57] = x.stranger ? 1 : 0; });
    const cells = new Uint32Array(n * 9), cf = new Float32Array(cells.buffer);
    job.cells.slice(0, n).forEach((c, k) => {
      const o = k * 9;
      cells[o] = c.sp; cf.set([c.dx, c.dy, c.vx || 0, c.vy || 0, c.energy, c.age], o + 1); cells[o + 7] = c.col; cells[o + 8] = c.info;
    });
    const ids = new Uint32Array(2 * PIPE_IDS).fill(0xffffffff);
    ids.set(earlier);
    const links = Uint32Array.from(bonds, ([a, o, q]) => (a & 0x7fff) | ((o & 0x7fff) << 15) | ((q & 1) << 30));
    const q = this.device.queue, L = this._handAt();
    q.writeBuffer(this.b.ledger, L + H_IN * 4, head);
    if (m) q.writeBuffer(this.b.ledger, L + H_SP * 4, sp);
    if (n) q.writeBuffer(this.b.ledger, L + H_CELLS * 4, cells);
    q.writeBuffer(this.b.ledger, L + H_IDS * 4, ids);
    if (links.length) q.writeBuffer(this.b.ledger, L + H_LINKS * 4, links);
    enc.clearBuffer(this.b.ledger, L + H_OUT * 4, 4);
    const pass = enc.beginComputePass();
    for (const [name, wg] of [['injectSlots', 1], ['injectCells', Math.ceil(this.count / 256)], ['injectBonds', Math.ceil(links.length / 64)]]) {
      if (!wg) continue;
      pass.setPipeline(this.cp[name].pipe); pass.setBindGroup(0, this.cp[name].bg); pass.dispatchWorkgroups(wg);
    }
    pass.end();
    // what came of it: the count and slots, then the new IDs (past the cells' indices)
    enc.copyBufferToBuffer(this.b.ledger, L + H_OUT * 4, this.setDownStage, 0, (1 + PIPE_SP) * 4);
    if (n) enc.copyBufferToBuffer(this.b.ledger, L + (H_OUT + 1 + PIPE_SP + PIPE_MAX) * 4, this.setDownStage, (1 + PIPE_SP) * 4, n * 4);
    this.sorted = false;
    job.sent = true;
    return { n, m, job };
  }
  _setDownRead(done, generation) {
    const end = (v) => { if (this.setDownJob === done.job) this.setDownJob = null; done.job.resolve(v); };
    this.setDownStage.mapAsync(GPUMapMode.READ).then(() => {
      const u = new Uint32Array(this.setDownStage.getMappedRange().slice(0));
      this.setDownStage.unmap();
      const placed = Math.min(u[0], done.n), at = 1 + PIPE_SP;
      end(generation === this.worldGeneration ? { placed, slots: [...u.subarray(1, 1 + done.m)], ids: [...u.subarray(at, at + placed)] } : null);
    }).catch(() => end(null));
  }
  // the cells taken at the pipette's tip since the last copy (read back: onTaken), and the bonds the needle cut
  // (onCut), the counts cleared
  _takenCopy(enc) {
    const st = this.takeStage.find((x) => !x.busy);
    if (!st) return null;
    st.busy = true;
    const at = this._handAt() + H_TAKEN * 4, cuts = this._handAt() + H_CUTS * 4;
    enc.copyBufferToBuffer(this.b.ledger, at, st.buf, 0, (1 + PIPE_TAKE * PIPE_TAKE_W) * 4);
    enc.copyBufferToBuffer(this.b.ledger, cuts, st.buf, (1 + PIPE_TAKE * PIPE_TAKE_W) * 4, 4);
    enc.clearBuffer(this.b.ledger, at, 4);
    enc.clearBuffer(this.b.ledger, cuts, 4);
    return st;
  }
  _takenRead(st, generation) {
    st.buf.mapAsync(GPUMapMode.READ).then(() => {
      const copy = st.buf.getMappedRange().slice(0);
      st.buf.unmap();
      st.busy = false;
      const u = new Uint32Array(copy), f = new Float32Array(copy), n = Math.min(u[0], PIPE_TAKE);
      if (generation !== this.worldGeneration) return;
      const cut = u[1 + PIPE_TAKE * PIPE_TAKE_W];
      if (cut && this.onCut) this.onCut(cut);
      if (!n || !this.onTaken) return;
      const out = [];
      for (let k = 0; k < n; k++) {
        const o = 1 + k * PIPE_TAKE_W;
        out.push({ kind: u[o], energy: f[o + 1], age: f[o + 2], id: u[o + 3], col: u[o + 4], info: u[o + 5], partners: [u[o + 6], u[o + 7]] });
      }
      this.onTaken(out);
    }).catch(() => { st.busy = false; });
  }

  /**
   * The page's watch map for the species ledger: map[slot] = watched index + 1 (0: not watched), at
   * most SPL_WATCH species. version comes back with every census that carries the species ledger.
   */
  setWatch(version, map) {
    const w = new Uint32Array(1 + MAXK);
    w[0] = version >>> 0;
    w.set(map.subarray(0, MAXK), 1);
    this.device.queue.writeBuffer(this.b.ledger, this._splAt(), w);
  }

  /** On a census step, copy the ledger and genomes into a free staging buffer (every SPL_EVERY-th, the species ledger too). */
  _censusCopy(enc) {
    if (this.frameNo % this.censusEvery !== 0) return null;
    const st = this.censusStage.find((s) => !s.busy);
    if (!st) return null;
    st.busy = true;
    enc.copyBufferToBuffer(this.b.ledger, 0, st.buf, 0, LEDGER_HEAD);
    enc.copyBufferToBuffer(this.b.genomes, 0, st.buf, LEDGER_HEAD, MAXK * G_BYTES);
    const range = this.cp.rangeMain;
    const spl = this.censusN++ % SPL_EVERY === 0 && !!range.pipe && !!range.bg && this.count > 0;
    if (spl) {
      const base = this._splAt();
      // where each species is: sampled afresh (rangeMain)
      enc.clearBuffer(this.b.ledger, base + SPL_RANGE * 4, (SPL_WORDS - SPL_RANGE) * 4);
      const pass = enc.beginComputePass();
      pass.setPipeline(range.pipe);
      pass.setBindGroup(0, range.bg);
      pass.dispatchWorkgroups(Math.ceil(Math.min(this.count, SPL_RANGE_SAMPLES) / 256) + 1);
      pass.end();
      enc.copyBufferToBuffer(this.b.ledger, base, st.buf, CENSUS_BYTES, SPL_WORDS * 4);
    }
    return { st, simTime: this.simTime, frameNo: this.frameNo, spl };
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
          genomeU32: new Uint32Array(copy, LEDGER_HEAD, MAXK * G_BYTES / 4), genomeF32: new Float32Array(copy, LEDGER_HEAD, MAXK * G_BYTES / 4),
          spl: job.spl ? new Uint32Array(copy, CENSUS_BYTES, SPL_WORDS) : null,
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
    // until coarse steps have compiled (late), a coarse step is taken as that many fine ones
    const coarse = Math.round(simDt * 60);
    if (coarse > 1 && !this.cp.lifeMainCoarse.bg) { steps *= coarse; simDt /= coarse; }
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
    // the ends a frame drawn in between steps moved back, put back before anything else runs;
    // this frame's own blend is decided now, so one uniform write serves both
    const lerpN = this.lerp != null && this._lerpOk && target && (hold == null || hold) && N > 0 ? N : 0;
    if (this._lerpN || lerpN) {
      if (this._lerpBG?.parts !== b.parts) {
        const bg = (pipe) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: b.lerpU } }, { binding: 1, resource: { buffer: b.parts } },
          ...(pipe === this.cpLerp ? [{ binding: 2, resource: { buffer: b.sortedFull } }] : []), { binding: 3, resource: { buffer: b.lerpEnd } }] });
        this._lerpBG = { parts: b.parts, apply: bg(this.cpLerp), back: bg(this.cpLerpBack) };
      }
      const lu = new ArrayBuffer(32), lv = new Uint32Array(lu), lf = new Float32Array(lu);
      lv[0] = lerpN; lf[1] = Math.min(1, Math.max(0, this.lerp ?? 1)); lf[2] = this.grid[0]; lf[3] = this.grid[1]; lv[4] = this._lerpN;
      d.queue.writeBuffer(b.lerpU, 0, lu);
    }
    if (this._lerpN) {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.cpLerpBack); pass.setBindGroup(0, this._lerpBG.back); pass.dispatchWorkgroups(Math.ceil(this._lerpN / 256)); pass.end();
      this._lerpN = 0;
    }
    const censusJobs = [];
    // the pipette's set-down, between the last frame's steps and this one's (one at a time)
    const setDown = N > 0 && this.setDownJob && !this.setDownJob.sent ? this._setDown(enc, this.setDownJob) : null;
    for (let s = 0; s < nSteps; s++) {
      const last = s === nSteps - 1;
      const endTs = last && slot ? { querySet: tm.qs, endOfPassWriteIndex: target ? 2 : 1 } : undefined;
      const begin = tsBegin();
      this._step(enc, simDt, begin || endTs ? { ...(begin || {}), ...(endTs || {}) } : undefined, nSteps > 1 ? s : -1);
      const job = this._censusCopy(enc);
      if (job) censusJobs.push(job);
    }
    if (nSteps > 1) d.queue.writeBuffer(b.simRing, 0, this.ringData, 0, nSteps * SIM_STRIDE);
    // while the pipette draws, what its tip took; while the needle cuts, how many bonds
    const takeJob = nSteps > 0 && (this.hand[26] > 0 || this.hand[17] > 0) ? this._takenCopy(enc) : null;
    const listenJob = nSteps > 0 ? this._listenCopy(enc, cam) : null;
    const mindJob = this._mindCopy(enc);
    const surveyJob = nSteps > 0 ? this._surveyCopy(enc) : null;
    // drawn in between steps: moved now, so what is picked, tracked and watched below is
    // where it is drawn, sampled at the moment drawn (shownTime)
    if (lerpN) {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.cpLerp); pass.setBindGroup(0, this._lerpBG.apply); pass.dispatchWorkgroups(Math.ceil(lerpN / 256)); pass.end();
      this._lerpN = lerpN;
    }
    const shownTime = this.simTime - (lerpN ? (1 - Math.min(1, Math.max(0, this.lerp))) * this.dt : 0);

    // ---- picking
    let pickJob = null;
    const trackJobs = [];
    for (let k = 0; k < 2 && N > 0; k++) {
      const id = k ? this.trackId2 : this.trackId;
      if (id === 0xffffffff || (k && id === this.trackId)) continue;
      const st = this.trackStage.find((s) => !s.busy);
      if (!st) break;
      st.busy = true;
      trackJobs.push({ st, id, k, simTime: shownTime });
      const pu = new ArrayBuffer(48);
      const pf = new Float32Array(pu), pv = new Uint32Array(pu);
      // where it is expected: where it was last found, carried on at its velocity
      const seen = this.trackSeen[k]?.id === id && this.sorted ? this.trackSeen[k] : null;
      if (seen) for (let a = 0; a < 2; a++) {
        const g = this.grid[a];
        pf[a] = (((seen.pos[a] + seen.vel[a] * (shownTime - seen.simTime)) % g) + g) % g;
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
        watchJob = { st, ids, full: !this.sorted, simTime: shownTime };
        const wu = new ArrayBuffer(16 + WATCH_MAX * 20), wv = new Uint32Array(wu), wf = new Float32Array(wu);
        wv[0] = N; wv[1] = ids.length; wv[2] = this.grid[0]; wv[3] = this.grid[1]; wv.set(ids, 4);
        // where each is expected: where it was last seen, carried on at its velocity
        cells.forEach((c, k) => { for (let a = 0; a < 2; a++) {
          const g = this.grid[a];
          wf[4 + WATCH_MAX + k * 4 + a] = ((((a ? c.y : c.x) + (a ? c.vy : c.vx) * (shownTime - c.t)) % g) + g) % g;
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
        pickJob = { req: this.pickReq, st, simTime: shownTime };
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
    const sh = this._shiftPending;
    if (sh) {
      this._shiftPending = null;
      sh.slot.busy = true;
      sh.slot.buf.mapAsync(GPUMapMode.READ).then(() => {
        const data = new Float32Array(sh.slot.buf.getMappedRange().slice(0));
        sh.slot.buf.unmap();
        sh.slot.busy = false;
        if (sh.gen !== this.worldGeneration) return;
        this.seaShifts.push({ data, cam: sh.cam, at: sh.at });
        if (this.seaShifts.length > 2) this.seaShifts.shift();
      }).catch(() => { sh.slot.busy = false; });
    }
    if (this.carryDone) { this.carryDone.destroy(); this.carryDone = null; }
    if (setDown) this._setDownRead(setDown, generation);
    if (takeJob) this._takenRead(takeJob, generation);

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
    const mind = this.cp[this.ticks > 1 ? 'mindMainCoarse' : 'mindMain'];
    const st = this.mindStage.find((s) => !s.busy);
    if (!st || !mind.bg) return null;
    this._mindFrames = 0;
    st.busy = true;
    const b = this.b;
    this.device.queue.writeBuffer(b.mind, 0, new Uint32Array([this.mindId]));
    enc.clearBuffer(b.mind, 4, 4);
    const pass = enc.beginComputePass();
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
    f[5] = this._clock().t; f[6] = window; f[7] = this.K.adhMin;
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
    f[8] = this._clock().t; f[9] = window; f[10] = L.vscale || 1; w[11] = L.selKind ?? 0xffffffff;
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
    const lineCov = (K.density * 0.25 * dpr) / ppu;
    const v = new Float32Array(data);
    const vu = new Uint32Array(data);
    v[0] = cam.x; v[1] = cam.y; v[2] = this.grid[0]; v[3] = this.grid[1];
    v[4] = W; v[5] = H; v[6] = ppu; v[7] = pointSize;
    v[8] = 0.95 * this.settings.exposure;
    v[9] = (0.55 / (1 + lineCov * 0.6)) * this.settings.exposure;
    v[10] = K.linkR; v[11] = time; vu[12] = selId >>> 0;
    v[13] = (0.075 / (1 + overlapAll * 0.9)) * this.settings.exposure;
    const f = this.focus;
    vu[14] = f.on; vu[15] = f.roleMask; vu[16] = f.stateMode; v[17] = f.mute; vu[18] = f.memberKind; vu[19] = f.memberN;
    vu[20] = detail ? 1 : 0;
    vu[21] = culled ? 1 : 0;
    v[22] = splat;
    v[23] = K.tightFrom;
    v[24] = K.pond ? this.level : 1; v[25] = K.pond ? this.frost : 0;
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

  // Whether view k (main, loupe, specimen), centered on (cx, cy) and reaching hw, hh world units either
  // way, sees little enough of the world to draw only the grid rows it covers; if so, its uniforms for
  // cullRows. Two cells of margin: a cell drifts less than half of one in a step, and its outline
  // reaches about one beyond its center.
  _cullView(k, cx, cy, hw, hh) {
    const [gw, gh] = this.grid, m = 2;
    const nx = Math.min(gw, Math.ceil(2 * hw) + 2 * m + 1), ny = Math.min(gh, Math.ceil(2 * hh) + 2 * m + 1);
    const fx = Math.floor(cx - hw) - m, fy = Math.floor(cy - hh) - m;
    const segs = ny * (nx < gw && ((fx % gw) + gw) % gw + nx > gw ? 2 : 1);
    const on = this.sorted && nx * ny < 0.5 * gw * gh && segs < CULL_SEGS;
    if (on) this.device.queue.writeBuffer(this.cull[k].u, 0, new Uint32Array([((fx % gw) + gw) % gw, ((fy % gh) + gh) % gh, nx, ny, gw, gh, 0, 0]));
    return on;
  }

  _render(enc, { target, cam, time: realT, dpr, selId, loupe, specimen, tsBegin, tsEnd }) {
    const d = this.device;
    // real time as the GPU holds it: modulo REAL_WRAP, as an f32 of days of seconds steps by 1/32 s or more
    const time = realT % REAL_WRAP;
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
    this._sea(enc);
    // the main view may skip resolving cells (settings.lod); the loupe and the close-up always resolve
    const lod = this.settings.lod;
    // seeing most of the world with particles a pixel or so across, it splats those (splatMain), where
    // there are enough of them to pay for the buffer it clears and adds in (a quarter as many as pixels)
    const ps = Math.max(1.1 * dpr, 0.085 * cam.ppu);
    const splat = !culled[0] && this.settings.nodes && ps <= SPLAT_PX && this.count >= W * H / 4 ? SPLAT_PX : 0;
    this._writeView(this.b.view, this.viewData, cam, W, H, dpr, time, selId, lod, culled[0], splat);
    if (splat) {
      d.queue.writeBuffer(this.b.quads, 0, new Uint32Array([4, 0, 0, 0]));
      enc.clearBuffer(this.b.splat, 0, W * H * 16);
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
    const clk = this._clock();
    pd[12] = clk.t; pd[13] = this.ambient; pd[14] = this.settings.optics; pd[15] = this.K.heat ? this.settings.heat : -1;
    pd.set(this.tide, 16);
    pd.set(clk.tidePh, 32);
    pd.set(this.waves, 36);
    // the heat map's span: from a little below the background to framboid-hot
    const tbg = this.tbg;
    pd[52] = tbg; pd[53] = tbg - 2; pd[54] = tbg + 10;
    pd[55] = this.settings.bands;
    pd[56] = this.K.pond ? this.level : 1; pd[57] = this.rain; pd[58] = this.sky; pd[59] = this.evap;
    pd[60] = this.turb; pd[61] = this.K.pond ? this.frost : 0; pd[62] = this.freezing; pd[63] = this.K.pond ? this.mudRain : 0;
    pd.set(this.duck, 64);
    pd.set(clk.drops, 72);
    pd[88] = this.K.pond ? this.parch : 0;
    this._seaPost(pd);
    pd.set(this.hand.subarray(0, 4), POST_LAMP);
    pd.set(this.lens, POST_LAMP + 4);
    pd.set(this.tool, POST_LAMP + 8);
    d.queue.writeBuffer(this.b.post, 0, pd);
    // the water's bend on a coarse grid of the main view, for the page's overlays (read back after the submit)
    this._shiftPending = null;
    if (this._seaOn && pd[94] > 0 && this.cpShiftBG) {
      const slot = this.shiftRead.find((x) => !x.busy);
      if (slot) {
        const pass = enc.beginComputePass({ label: 'seaShift' });
        pass.setPipeline(this.cpShift); pass.setBindGroup(0, this.cpShiftBG);
        pass.dispatchWorkgroups(Math.ceil(SHIFT_W / 8), Math.ceil(SHIFT_H / 8));
        pass.end();
        enc.copyBufferToBuffer(this.b.shiftMap, 0, slot.buf, 0, SHIFT_W * SHIFT_H * 8);
        this._shiftPending = { slot, cam: { x: cam.x, y: cam.y, ppu: cam.ppu, w: W, h: H }, at: performance.now(), gen: this.worldGeneration };
      }
    } else if (!(pd[94] > 0)) this.seaShifts.length = 0;

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
      u[16] = gw; u[17] = gh; new Float32Array(u.buffer)[18] = time; new Float32Array(u.buffer)[19] = this.simTime % 4096;
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
      let gain = 1; // the light a new frame adds; a cleared image starts from one frame
      if (!clear) {
        const lc = this.lastCam;
        const dx = cam.x - lc.x, dy = cam.y - lc.y;
        const gx = this.grid[0], gy = this.grid[1];
        const wx = dx - gx * Math.round(dx / gx), wy = dy - gy * Math.round(dy / gy);
        // in the last frame's texture coordinates (its size differs after a resize)
        const sx = (lc.ppu * W) / (cam.ppu * lc.w), sy = (lc.ppu * H) / (cam.ppu * lc.h);
        // trails is the fraction kept per 60 Hz frame; raised to the frames elapsed, the fade lasts the
        // same time at any frame rate (and across the gaps between held frames). Each new frame adds
        // (1 - keep) / (1 - trails) of its light, so the image's brightness stays the same however
        // unevenly frames arrive (a busy GPU's 17, 25, 33 ms gaps made it pulse). A repeated draw at
        // the same moment counts as a 60 Hz frame.
        const t = this.settings.trails;
        const keep = Math.pow(t, 60 * (realT > lc.t ? Math.min(0.5, realT - lc.t) : 1 / 60));
        gain = (1 - keep) / (1 - t);
        d.queue.writeBuffer(this.b.reprojU, 0, new Float32Array([sx, sy, (wx * lc.ppu) / lc.w, (wy * lc.ppu) / lc.h, keep, 0, 0, 0]));
        pass.setPipeline(this.main.reproj);
        pass.setBindGroup(0, carry ? carry.bg : this.reprojBG[srcI]);
        pass.draw(3);
      }
      pass.setBlendConstant([gain, gain, gain, gain]);
      if (splat) { pass.setPipeline(this.main.splat); pass.setBindGroup(0, this.splatDrawBG); pass.draw(3); }
      this._drawScene(pass, this.mainBG.line, this.mainBG.point, this.mainBG.bridge, this.viewData, 0, this.main);
      if (this.tubeN) { pass.setPipeline(this.main.tube); pass.setBindGroup(0, this.tubeBG); pass.draw(4, this.tubeN); }
      pass.end();
    }
    this._drawStone(enc, this.stoneView, this.bgStone);
    this.lastCam = { x: cam.x, y: cam.y, ppu: cam.ppu, w: W, h: H, t: realT };
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

/**
 * readState() made smaller to keep as a file (worlds.js encodeWorld): { gpu, layout }.
 * - An intent's action words (x, y) are read only by the next step's resolveCount, through a claim
 *   pending in the ledger, so only claimers keep theirs; bonds (z, w) stay.
 * - Silt takes new ids, in the order it lies, after every id given so far (ledger[0] counts them):
 *   an id seeds only a grain's random draws and how it is drawn up close (its outline and turn), and
 *   ids in order cost almost nothing where 3 million in no order cost 9 MB.
 * - Of the heat buffer, the ice order is built from the seed (writeState builds it again): temperatures
 *   and relief are kept.
 * - The particles go by columns: positions as their grid cell (the change from the particle before;
 *   particles lie sorted by cell) and the place within it to 2^-10 of a unit (0.06 µm; a cell is
 *   about 10 µm across); velocity, energy and age cut to 10 mantissa bits (a thousandth of
 *   themselves); intents exact.
 */
export function compactState({ cpu, gpu }) {
  const intent = new Uint32Array(gpu.intent.slice(0)), n = intent.length / 4;
  const pu = new Uint32Array(gpu.parts.slice(0)), W = P_BYTES / 4;
  const ledger = new Uint32Array(gpu.ledger.slice(0));
  // the counter is a u32 (newId in the WGSL): it wraps, and skips 0xffffffff (NONE)
  let next = ledger[0];
  for (let i = 0; i < n; i++) if (pu[i * W + 4] === 0) {
    if (next === 0xffffffff) next = 0;
    pu[i * W + 7] = next;
    next = (next + 1) >>> 0;
  }
  ledger[0] = next;
  const thermal = gpu.thermal && new Uint32Array(gpu.thermal.slice(0)), per = thermal ? thermal.length / 3 : 0;
  if (thermal) thermal.fill(0, 2 * per);
  const claims = new Uint32Array(gpu.ledger, META_CLAIM * 4, Math.min(n, gpu.ledger.byteLength / 4 - META_CLAIM));
  const claimer = new Uint8Array(n);
  for (const c of claims) if (c && !(c & 0x80000000) && c <= n) claimer[c - 1] = 1;
  for (let i = 0; i < n; i++) if (!claimer[i]) { intent[i * 4] = 0; intent[i * 4 + 1] = 0; }
  const layout = {
    parts: { words: W, keep: [32, 32, 10, 10, 32, 10, 10, 32, 32, 32], planes: [1, 1, 1, 1, 1, 1, 1, 1, 0, 1], cell: { grid: [...cpu.grid], bits: 10 } },
    intent: { words: 4 },
  };
  return { gpu: { ...gpu, parts: pu.buffer, intent: intent.buffer, ledger: ledger.buffer, ...(thermal ? { thermal: thermal.buffer } : {}) }, layout };
}
