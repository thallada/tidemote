import {
  simWGSL, PICK_WGSL, DRAW_WGSL, POST_WGSL, DEFAULT_K,
  MAXK, FIRST_LIFE, MAX_CELLS, META_SLOT, META_POP, META_DEATH, META_CLAIM, P_BYTES, G_BYTES, LITE_BYTES,
} from './shaders.js';
import {
  archetypeGenome, writeGenome, parseParticle,
  packUnorm, FOUNDING_PLAN,
} from './genome.js';

const HDR = 'rgba16float';
const BLOOM_LEVELS = 6;
const U = GPUBufferUsage;
export const PICK_MAX = 131072;
export const FOCUS_MAX = 65536;
const PICK_BYTES = 56 + PICK_MAX * P_BYTES;
const LEDGER_HEAD = META_CLAIM * 4;
const CENSUS_BYTES = LEDGER_HEAD + MAXK * G_BYTES;
export { MAXK, FIRST_LIFE, DEFAULT_K };

const mix = (a, b, t) => a + (b - a) * t;

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
    this.seedValue = 1;
    this.censusEvery = 20;
    this.settings = { trails: 0.45, links: true, nodes: true, bloom: 0.012, exposure: 1.0, tide: 1 };
    this.simData = new ArrayBuffer(208);
    this.simF = new Float32Array(this.simData);
    this.simU = new Uint32Array(this.simData);
    this.waves = new Float32Array(16);
    this.viewData = new ArrayBuffer(80);
    this.viewDataL = new ArrayBuffer(80);
    this.postData = new Float32Array(32);
    this.loupe = null;
    this.focus = { on: 0, roleMask: 7, stateMode: 0, mute: 0.16, memberKind: 0xffffffff, memberN: 0 };
    this.viewDataS = new ArrayBuffer(80);
    this.onGpuTime = null;
    this.onCensus = null;
    this.pickReq = null;
    this.trackId = 0xffffffff;
    this.onTrack = null;
    this.lastCam = null;
    this.accIdx = 0;
    this.size = [0, 0];
    this.b = {};

    const d = device;
    const b = this.b;
    b.sim = d.createBuffer({ size: 208, usage: U.UNIFORM | U.COPY_DST });
    b.view = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    b.viewL = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    b.viewS = d.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
    b.focus = d.createBuffer({ size: (16 + FOCUS_MAX) * 4, usage: U.STORAGE | U.COPY_DST });
    b.post = d.createBuffer({ size: 128, usage: U.UNIFORM | U.COPY_DST });
    b.loupeU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    b.pickU = d.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    b.counts = d.createBuffer({ size: MAX_CELLS * 4, usage: U.STORAGE | U.COPY_DST });
    b.cellStart = d.createBuffer({ size: (MAX_CELLS + 1) * 4, usage: U.STORAGE });
    b.blockSums = d.createBuffer({ size: (MAX_CELLS / 256) * 4, usage: U.STORAGE });
    b.genomes = d.createBuffer({ size: MAXK * G_BYTES, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.frameCtr = d.createBuffer({ size: 32, usage: U.STORAGE | U.INDIRECT | U.COPY_DST });
    b.pickOut = d.createBuffer({ size: PICK_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });

    this.simModule = d.createShaderModule({ code: simWGSL(K), label: 'sim' });
    this.pickModule = d.createShaderModule({ code: PICK_WGSL, label: 'pick' });
    this.drawModule = d.createShaderModule({ code: DRAW_WGSL, label: 'draw' });
    this.postModule = d.createShaderModule({ code: POST_WGSL, label: 'post' });

    const cp = (mod, entryPoint) => d.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint }, label: entryPoint });
    this.cpDefs = {
      seedMain: [0, 1, 10],
      resolveCount: [0, 1, 4, 8, 9, 10, 11],
      scanBlocks: [5, 6, 7],
      scanSums: [6, 7],
      scanAdd: [6, 7],
      scatterMain: [0, 1, 2, 3, 6, 8, 12, 13],
      censusMain: [11, 12, 13],
      matterMain: [0, 1, 2, 10, 11],
      lifeMain: [0, 1, 2, 3, 6, 9, 10, 11, 12],
    };
    this.cp = {};
    for (const name of Object.keys(this.cpDefs)) this.cp[name] = { pipe: cp(this.simModule, name), bg: null };
    this.cpPick = { pipe: cp(this.pickModule, 'pickMain'), bg: null };

    const additive = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
    const fade = { color: { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' }, alpha: { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' } };
    const over = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    const rp = (mod, vs, fs, topology, blend, fmt = HDR) => d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: vs },
      fragment: { module: mod, entryPoint: fs, targets: [{ format: fmt, blend }] },
      primitive: { topology },
      label: fs,
    });
    this.pPoint = rp(this.drawModule, 'vsPoint', 'fsPoint', 'triangle-strip', additive);
    this.pLine = rp(this.drawModule, 'vsLine', 'fsLine', 'line-list', additive);
    this.pFade = rp(this.drawModule, 'vsFade', 'fsFade', 'triangle-list', fade);
    this.pDown = rp(this.postModule, 'vsFull', 'fsDown', 'triangle-list', undefined);
    this.pUp = rp(this.postModule, 'vsFull', 'fsUp', 'triangle-list', additive);
    this.pComp = rp(this.postModule, 'vsFull', 'fsComposite', 'triangle-list', undefined, format);
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
    this.trackStage = [0, 1, 2, 3].map(() => ({ buf: d.createBuffer({ size: 56, usage: U.COPY_DST | U.MAP_READ }), busy: false }));
    b.reprojU = d.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    this.pReproj = rp(this.postModule, 'vsFull', 'fsReproj', 'triangle-list', undefined);
  }

  async compileErrors() {
    const out = [];
    for (const m of [this.simModule, this.pickModule, this.drawModule, this.postModule]) {
      const info = await m.getCompilationInfo();
      for (const msg of info.messages) if (msg.type === 'error') out.push(`${m.label}:${msg.lineNum}:${msg.linePos} ${msg.message}`);
    }
    return out;
  }

  /** Allocate particle storage for exactly n particles. Returns false if the GPU refuses. */
  async allocate(n) {
    const d = this.device;
    const b = this.b;
    const names = ['parts', 'sortedFull', 'sortedLite', 'aux', 'intent', 'ledger', 'livingList'];
    for (const k of names) { b[k]?.destroy(); b[k] = null; }
    this.capacity = 0;
    this.count = 0;
    d.pushErrorScope('out-of-memory');
    d.pushErrorScope('validation');
    b.parts = d.createBuffer({ size: n * P_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    b.sortedFull = d.createBuffer({ size: n * P_BYTES, usage: U.STORAGE });
    b.sortedLite = d.createBuffer({ size: n * LITE_BYTES, usage: U.STORAGE });
    b.aux = d.createBuffer({ size: n * 8, usage: U.STORAGE });
    b.intent = d.createBuffer({ size: n * 16, usage: U.STORAGE | U.COPY_DST });
    b.ledger = d.createBuffer({ size: (META_CLAIM + n) * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.livingList = d.createBuffer({ size: (n + 256) * 4, usage: U.STORAGE | U.COPY_DST });
    const res = {
      0: { buffer: b.sim }, 1: { buffer: b.parts }, 2: { buffer: b.sortedFull }, 3: { buffer: b.sortedLite },
      4: { buffer: b.counts }, 5: { buffer: b.counts }, 6: { buffer: b.cellStart }, 7: { buffer: b.blockSums },
      8: { buffer: b.aux }, 9: { buffer: b.intent }, 10: { buffer: b.genomes }, 11: { buffer: b.ledger },
      12: { buffer: b.livingList }, 13: { buffer: b.frameCtr },
    };
    for (const [name, ids] of Object.entries(this.cpDefs)) {
      const c = this.cp[name];
      c.bg = d.createBindGroup({ layout: c.pipe.getBindGroupLayout(0), entries: ids.map((id) => ({ binding: id, resource: res[id] })) });
    }
    this.cpPick.bg = d.createBindGroup({ layout: this.cpPick.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: b.pickU } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.pickOut } }] });
    const pointBG = (view) => d.createBindGroup({ layout: this.pPoint.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.genomes } },
      { binding: 5, resource: { buffer: b.focus } }] });
    const lineBG = (view) => d.createBindGroup({ layout: this.pLine.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: b.parts } }, { binding: 2, resource: { buffer: b.genomes } },
      { binding: 3, resource: { buffer: b.intent } }, { binding: 4, resource: { buffer: b.livingList } }, { binding: 5, resource: { buffer: b.focus } }] });
    this.bgPoint = pointBG(b.view);
    this.bgLine = lineBG(b.view);
    this.bgPointL = pointBG(b.viewL);
    this.bgLineL = lineBG(b.viewL);
    this.bgPointS = pointBG(b.viewS);
    this.bgLineS = lineBG(b.viewS);
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
    if (this.accum) { this.accum.forEach((t) => t.destroy()); this.bloom.forEach((t) => t.destroy()); }
    const tex = (tw, th) => d.createTexture({ size: [Math.max(1, tw), Math.max(1, th)], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.accum = [tex(w, h), tex(w, h)];
    this.bloom = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) this.bloom.push(tex(w >> (i + 1), h >> (i + 1)));
    this.accumViews = this.accum.map((t) => t.createView());
    this.bloomViews = this.bloom.map((t) => t.createView());
    const sbg = (pipe, view) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: view }] });
    this.downBG = [];
    for (let i = 1; i < BLOOM_LEVELS; i++) this.downBG[i] = sbg(this.pDown, this.bloomViews[i - 1]);
    this.down0BG = this.accumViews.map((v) => sbg(this.pDown, v));
    this.upBG = [];
    for (let i = BLOOM_LEVELS - 1; i > 0; i--) this.upBG.push({ target: i - 1, bg: sbg(this.pUp, this.bloomViews[i]) });
    this.compBG = this.accumViews.map((v) => d.createBindGroup({ layout: this.pComp.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: v },
      { binding: 2, resource: { buffer: this.b.post } }, { binding: 3, resource: this.bloomViews[0] }] }));
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
    this.loupeBG = this.device.createBindGroup({ layout: this.pLoupe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: this.loupeView },
      { binding: 2, resource: { buffer: this.b.post } }, { binding: 4, resource: { buffer: this.b.loupeU } }] });
  }

  /**
   * Focus: kinds = Uint32Array(16) bitmask over genome slots (null = no filter),
   * members = sorted Uint32Array of particle ids to highlight (null = none).
   */
  setFocus({ kinds = null, roleMask = 7, stateMode = 0, mute = 0.16, members = null, memberKind = 0xffffffff } = {}) {
    const f = this.focus;
    f.on = kinds ? 1 : 0;
    f.roleMask = roleMask; f.stateMode = stateMode; f.mute = mute;
    f.memberKind = memberKind;
    f.memberN = members ? Math.min(members.length, FOCUS_MAX) : 0;
    if (kinds) this.device.queue.writeBuffer(this.b.focus, 0, kinds, 0, 16);
    if (f.memberN) this.device.queue.writeBuffer(this.b.focus, 64, members, 0, f.memberN);
  }

  _ensureSpecTex(w, h) {
    if (this.specTex && this.specSize[0] === w && this.specSize[1] === h) return;
    this.specTex?.destroy();
    this.specSize = [w, h];
    this.specTex = this.device.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.specView = this.specTex.createView();
    this.specBG = this.device.createBindGroup({ layout: this.pPlain.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: this.specView }, { binding: 2, resource: { buffer: this.b.post } }] });
  }

  gridFor(n, aspect) {
    const cells = Math.min(n / this.K.density, MAX_CELLS);
    const gw = Math.max(3, Math.round(Math.sqrt(cells * aspect)));
    let gh = Math.max(3, Math.round(cells / gw));
    if (gw * gh > MAX_CELLS) gh = Math.floor(MAX_CELLS / gw);
    return [gw, gh];
  }

  /** Create a new universe of n particles (n <= capacity). */
  seed(n, { aspect = 16 / 9, silt = 0.5, glint = 0.12, husk = 0.04, rng = Math.random } = {}) {
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
    this.ambient = 0.17;
    this.chargeMul = 1;
    this.tide.set([1, 1, 0.021, 1, 2, -1, -0.017, 1, -1, 3, 0.013, 0.7, 1, -2, 0.011, 0]);
    this.randomizeCurrents(rng);

    const gbuf = new ArrayBuffer(MAXK * G_BYTES);
    const gu = new Uint32Array(gbuf);
    const gf = new Float32Array(gbuf);
    const matterCols = [[0.3, 0.34, 0.46], [0.7, 0.93, 1.0], [0.5, 0.35, 0.25]];
    for (let m = 0; m < 3; m++) {
      const g = archetypeGenome('plankton', rng, this.K);
      g.col = packUnorm(...matterCols[m]);
      writeGenome(gu, gf, m, g);
    }
    const head = new Uint32Array(META_CLAIM);
    const plan = FOUNDING_PLAN;
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

    this._writeSim({ seedKinds: plan.length, pSilt: silt, pGlint: glint, pHusk: husk });
    const enc = d.createCommandEncoder();
    enc.clearBuffer(this.b.counts);
    enc.clearBuffer(this.b.ledger, LEDGER_HEAD, n * 4);
    enc.clearBuffer(this.b.frameCtr);
    enc.clearBuffer(this.b.intent);
    const pass = enc.beginComputePass();
    pass.setPipeline(this.cp.seedMain.pipe);
    pass.setBindGroup(0, this.cp.seedMain.bg);
    pass.dispatchWorkgroups(Math.ceil(n / 256));
    pass.end();
    d.queue.submit([enc.finish()]);
    this.clearAccum = true;
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
    const f = this.simF, u = this.simU;
    f[0] = this.grid[0]; f[1] = this.grid[1];
    u[2] = this.grid[0]; u[3] = this.grid[1];
    u[4] = this.count; u[5] = this.frameNo;
    f[6] = this.dt || 1 / 60; f[7] = this.simTime;
    f[8] = this.season; f[9] = this.abio;
    u[10] = (this.seedValue + this.frameNo * 7919) >>> 0; f[11] = this.K.maxSpeed;
    u[12] = extra.seedKinds || 1; f[13] = extra.pSilt || 0; f[14] = extra.pGlint || 0; f[15] = extra.pHusk || 0;
    f[16] = this.ambient; f[17] = this.chargeMul;
    // The vec4 wave tables start at byte 80 after alignment padding.
    f.set(this.waves, 20);
    f.set(this.tide, 36);
    this.device.queue.writeBuffer(this.b.sim, 0, this.simData);
  }

  requestPick(center, radius, selId, { kind = 0xffffffff, maxOut = 4096, raw = false } = {}) {
    return new Promise((resolve) => {
      if (this.pickReq) this.pickReq.resolve(null);
      this.pickReq = { center, radius, selId: selId >>> 0, kind, maxOut: Math.max(1, Math.min(Math.ceil(maxOut), PICK_MAX)), raw, resolve };
    });
  }

  /**
   * One frame. target: GPUTextureView or null (simulate only).
   * cam: {x,y,ppu}; loupe: {x,y,r (canvas px), ppu, cx, cy (world)} or null.
   */
  frame({ target = null, cam = { x: 0, y: 0, ppu: 1 }, paused = false, simDt = 1 / 60, time = 0, dpr = 1, selId = 0xffffffff, loupe = null, specimen = null }) {
    const d = this.device;
    const generation = this.worldGeneration;
    const b = this.b;
    const N = this.count;
    const enc = d.createCommandEncoder();
    const stepping = !paused && N > 0;
    const tm = this.timing;
    const slot = tm ? tm.reads.find((r) => !r.busy) : null;
    let tsFirst = !!slot;
    const tsBegin = () => {
      if (!tsFirst) return undefined;
      tsFirst = false;
      return { querySet: tm.qs, beginningOfPassWriteIndex: 0 };
    };

    if (stepping) {
      this.dt = simDt;
      this.simTime += simDt;
      this.frameNo++;
      this._writeSim();
      const cells = this.grid[0] * this.grid[1];
      enc.clearBuffer(b.counts, 0, cells * 4);
      enc.clearBuffer(b.ledger, META_POP * 4, MAXK * 4);
      enc.clearBuffer(b.frameCtr, 0, 4);
      enc.clearBuffer(b.ledger, 48, 12);
      const endTs = slot && !target ? { querySet: tm.qs, endOfPassWriteIndex: 1 } : undefined;
      const begin = tsBegin();
      const pass = enc.beginComputePass({ timestampWrites: begin || endTs ? { ...(begin || {}), ...(endTs || {}) } : undefined });
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

    // ---- picking
    let pickJob = null;
    let trackJob = null;
    if (!this.pickReq && this.trackId !== 0xffffffff && N > 0) {
      const st = this.trackStage.find((s) => !s.busy);
      if (st) {
        trackJob = { st, id: this.trackId, simTime: this.simTime };
        const pu = new ArrayBuffer(48);
        const pf = new Float32Array(pu), pv = new Uint32Array(pu);
        pf[2] = 0; pv[3] = this.trackId; pv[4] = 0; pv[5] = N; pf[6] = this.grid[0]; pf[7] = this.grid[1]; pv[8] = 0xffffffff;
        d.queue.writeBuffer(b.pickU, 0, pu);
        enc.clearBuffer(b.pickOut, 0, 56);
        const pass = enc.beginComputePass();
        pass.setPipeline(this.cpPick.pipe);
        pass.setBindGroup(0, this.cpPick.bg);
        pass.dispatchWorkgroups(Math.ceil(N / 256));
        pass.end();
        enc.copyBufferToBuffer(b.pickOut, 0, st.buf, 0, 56);
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
        enc.copyBufferToBuffer(b.pickOut, 0, st.buf, 0, 56 + pickJob.req.maxOut * P_BYTES);
      }
    }

    if (target) this._render(enc, { target, cam, time, dpr, selId, loupe, specimen, tsBegin, tsEnd: slot ? { querySet: tm.qs, endOfPassWriteIndex: 1 } : undefined });

    let censusJob = null;
    if (stepping && this.frameNo % this.censusEvery === 0) {
      const st = this.censusStage.find((s) => !s.busy);
      if (st) {
        censusJob = { st, simTime: this.simTime, frameNo: this.frameNo };
        enc.copyBufferToBuffer(b.ledger, 0, st.buf, 0, LEDGER_HEAD);
        enc.copyBufferToBuffer(b.genomes, 0, st.buf, LEDGER_HEAD, MAXK * G_BYTES);
      }
    }

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
        if (generation === this.worldGeneration && ms > 0 && ms < 5000 && this.onGpuTime) this.onGpuTime(ms, N);
      }).catch(() => { slot.busy = false; });
    } else if (!tm && this.onGpuTime && (stepping || target)) {
      const t0 = performance.now();
      d.queue.onSubmittedWorkDone().then(() => {
        if (generation === this.worldGeneration && this.onGpuTime) this.onGpuTime(performance.now() - t0, N);
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
          const copy = buf.slice(56, 56 + count * P_BYTES);
          out.raw = { u32: new Uint32Array(copy), f32: new Float32Array(copy), count };
        } else {
          for (let k = 0; k < count; k++) out.entries.push(parseParticle(u32, f32, 14 + k * 10));
        }
        st.buf.unmap();
        st.busy = false;
        req.resolve(out);
      }).catch(() => { st.busy = false; req.resolve(null); });
    }

    if (trackJob) {
      const { st } = trackJob;
      st.busy = true;
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

    if (censusJob) {
      const { st } = censusJob;
      st.busy = true;
      st.buf.mapAsync(GPUMapMode.READ).then(() => {
        const copy = st.buf.getMappedRange().slice(0);
        st.buf.unmap();
        st.busy = false;
        if (generation !== this.worldGeneration) return;
        if (this.onCensus) {
          const u = new Uint32Array(copy);
          this.onCensus({
            simTime: censusJob.simTime, frameNo: censusJob.frameNo,
            globals: u.subarray(0, 16), slots: u.subarray(META_SLOT, META_SLOT + MAXK), pop: u.subarray(META_POP, META_POP + MAXK),
            demography: u.subarray(META_DEATH, META_DEATH + 20),
            genomeU32: new Uint32Array(copy, LEDGER_HEAD), genomeF32: new Float32Array(copy, LEDGER_HEAD),
          });
        }
      }).catch(() => { st.busy = false; });
    }
  }

  _writeView(buf, data, cam, W, H, dpr, time, selId) {
    const K = this.K;
    const ppu = cam.ppu;
    const pointSize = Math.min(40 * dpr, Math.max(1.1 * dpr, 0.085 * ppu));
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

  _drawScene(pass, bgLine, bgPoint) {
    if (this.settings.links) {
      pass.setPipeline(this.pLine);
      pass.setBindGroup(0, bgLine);
      pass.drawIndirect(this.b.frameCtr, 16);
    }
    if (this.settings.nodes) {
      pass.setPipeline(this.pPoint);
      pass.setBindGroup(0, bgPoint);
      pass.draw(4, this.count);
    }
  }

  _render(enc, { target, cam, time, dpr, selId, loupe, specimen, tsBegin, tsEnd }) {
    const d = this.device;
    const [W, H] = this.size;
    this._writeView(this.b.view, this.viewData, cam, W, H, dpr, time, selId);

    const pd = this.postData;
    pd[0] = W; pd[1] = H; pd[2] = this.settings.bloom; pd[3] = 1.0;
    pd[4] = time; pd[5] = this.season; pd[6] = this.settings.tide; pd[7] = cam.ppu;
    pd[8] = cam.x; pd[9] = cam.y; pd[10] = this.grid[0]; pd[11] = this.grid[1];
    pd[12] = this.simTime; pd[13] = this.ambient;
    pd.set(this.tide, 16);
    d.queue.writeBuffer(this.b.post, 0, pd);

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
      this._drawScene(pass, this.bgLine, this.bgPoint);
      pass.end();
    }
    this.lastCam = { x: cam.x, y: cam.y, ppu: cam.ppu };
    const cur = this.accIdx;

    if (loupe) {
      const L = Math.max(64, Math.min(1024, Math.ceil((loupe.r * 2) / 32) * 32));
      this._ensureLoupeTex(L);
      const lppu = loupe.ppu * (L / (loupe.r * 2));
      this._writeView(this.b.viewL, this.viewDataL, { x: loupe.cx, y: loupe.cy, ppu: lppu }, L, L, dpr * (L / (loupe.r * 2)), time, selId);
      d.queue.writeBuffer(this.b.loupeU, 0, new Float32Array([loupe.x, loupe.y, loupe.r, 1, W, H, 0, 0]));
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.loupeView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      this._drawScene(pass, this.bgLineL, this.bgPointL);
      pass.end();
    }

    if (specimen && specimen.target) {
      this._ensureSpecTex(specimen.w, specimen.h);
      this._writeView(this.b.viewS, this.viewDataS, { x: specimen.cx, y: specimen.cy, ppu: specimen.ppu }, specimen.w, specimen.h, specimen.dpr, time, selId);
      let pass = enc.beginRenderPass({ colorAttachments: [{ view: this.specView, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      this._drawScene(pass, this.bgLineS, this.bgPointS);
      pass.end();
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

    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }],
      timestampWrites: tsEnd,
    });
    pass.setPipeline(this.pComp); pass.setBindGroup(0, this.compBG[cur]); pass.draw(3);
    if (loupe) { pass.setPipeline(this.pLoupe); pass.setBindGroup(0, this.loupeBG); pass.draw(6); }
    pass.end();
  }
}
