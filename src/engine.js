import {
  simWGSL, PICK_WGSL, DRAW_WGSL, POST_WGSL, DEFAULT_K,
  MAXK, FIRST_LIFE, MAX_CELLS, META_SLOT, META_POP, META_CLAIM, P_BYTES, G_BYTES, G_WORDS, LITE_BYTES,
} from './shaders.js';

const HDR = 'rgba16float';
const BLOOM_LEVELS = 6;
const U = GPUBufferUsage;
export const PICK_MAX = 131072;
export const FOCUS_MAX = 65536;
const PICK_BYTES = 56 + PICK_MAX * P_BYTES;
const LEDGER_HEAD = META_CLAIM * 4;
const CENSUS_BYTES = LEDGER_HEAD + MAXK * G_BYTES;
export const KIND = { SILT: 0, GLINT: 1, HUSK: 2 };
export { MAXK, FIRST_LIFE, DEFAULT_K };

// ------------------------------------------------------------ genome helpers
export function hsl2rgb(h, s, l) {
  const k = [0, 8, 4].map((o) => (o + h * 12) % 12);
  const a = s * Math.min(l, 1 - l);
  return k.map((v) => l - a * Math.max(-1, Math.min(1, Math.min(v - 3, 9 - v))));
}
const fract = (x) => x - Math.floor(x);
const eclamp = (x, a, b) => Math.max(a, Math.min(b, x));
const packUnorm = (r, g, b, a = 1) => ((Math.round(eclamp(r, 0, 1) * 255))
  | (Math.round(eclamp(g, 0, 1) * 255) << 8)
  | (Math.round(eclamp(b, 0, 1) * 255) << 16) | (Math.round(eclamp(a, 0, 1) * 255) << 24)) >>> 0;
export const unpackUnorm = (u) => [(u & 255) / 255, ((u >>> 8) & 255) / 255, ((u >>> 16) & 255) / 255, ((u >>> 24) & 255) / 255];
const packSnorm = (a) => a.reduce((acc, v, i) => acc | ((Math.round(eclamp(v, -1, 1) * 127) & 255) << (i * 8)), 0) >>> 0;
const unpackSnorm = (u) => [0, 1, 2, 3].map((i) => Math.max(-1, (((u >>> (i * 8)) & 255) << 24 >> 24) / 127));
const emix = (a, b, t) => a + (b - a) * t;

export function roleColor(g, r) {
  return hsl2rgb(fract(g.hue + r * g.roleHue + 1), g.sat, g.lum * (1 - 0.08 * r));
}

export function affinity(a, ra, b, rb, K = DEFAULT_K) {
  const rec = a.roles[ra].rec, surf = b.roles[rb].surf;
  let s = 0;
  for (let i = 0; i < 8; i++) s += rec[i] * surf[i];
  return eclamp(s * K.affScale, -1, 1);
}

// Stationary share of each role implied by the developmental matrix.
export function roleShares(g) {
  let v = [1, 0, 0];
  for (let it = 0; it < 40; it++) {
    const n = [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      const row = g.dev[r];
      const s = row[0] + row[1] + row[2] || 1;
      for (let k = 0; k < 3; k++) n[k] += v[r] * (row[k] / s);
    }
    v = n;
  }
  return v;
}

const randSig = (r) => Array.from({ length: 8 }, () => r() * 2 - 1);

/**
 * Founding body plans. W[r][s] is how strongly role r is drawn to role s of its own kind.
 */
const ARCHETYPES = {
  reef: { W: [[1.0, 0.8, 0.2], [0.8, 0.55, 0.3], [0.5, 0.5, -0.2]], dev: [[0.65, 0.3, 0.05], [0.4, 0.55, 0.05], [0.6, 0.4, 0]],
    t: (r) => ({ photo: emix(0.8, 1, r()), swim: 0, align: 0, force: emix(4, 7, r()), advect: emix(0.02, 0.08, r()), drag: emix(0.15, 0.3, r()),
      lifespan: emix(260, 460, r()), reproE: emix(0.9, 1.3, r()), share: emix(0.3, 0.4, r()), diet: [0.8, 0.2, 0], size: emix(0.8, 1.3, r()), radius: emix(0.85, 1, r()), beta: emix(0.14, 0.22, r()) }) },
  plankton: { W: [[-0.35, 0, 0], [0, 0, 0], [0, 0, 0]], dev: [[1, 0, 0], [1, 0, 0], [1, 0, 0]],
    t: (r) => ({ photo: emix(0.6, 0.9, r()), swim: emix(0, 0.2, r()), align: 0, force: emix(2, 5, r()), advect: emix(0.8, 1, r()), drag: emix(0.05, 0.12, r()),
      lifespan: emix(60, 140, r()), reproE: emix(0.8, 1.2, r()), share: emix(0.4, 0.5, r()), diet: [1, 0, 0], size: emix(0.45, 0.75, r()), radius: emix(0.45, 0.7, r()) }) },
  grazer: { W: [[emix(-0.2, 0.2, Math.random()), 0, 0], [0, 0, 0], [0, 0, 0]], dev: [[1, 0, 0], [1, 0, 0], [1, 0, 0]],
    t: (r) => ({ photo: 0, swim: emix(0.6, 1.3, r()), align: emix(0, 0.3, r()), force: emix(4, 9, r()), advect: emix(0.3, 0.7, r()), drag: emix(0.06, 0.15, r()),
      lifespan: emix(90, 180, r()), reproE: emix(1.1, 1.8, r()), share: emix(0.4, 0.5, r()), diet: [0.75, 0.1, 0.22], size: emix(0.7, 1.1, r()), radius: emix(0.6, 0.9, r()) }) },
  crawler: { W: [[0.85, 0.6, 0], [1.0, -0.3, 0], [0, 0, 0]], dev: [[0.55, 0.45, 0], [0.5, 0.5, 0], [1, 0, 0]],
    t: (r) => ({ photo: 0, swim: emix(0.4, 0.9, r()), align: emix(0.6, 0.95, r()), force: emix(7, 12, r()), advect: emix(0.15, 0.4, r()), drag: emix(0.1, 0.2, r()),
      lifespan: emix(140, 260, r()), reproE: emix(1.3, 2.0, r()), share: emix(0.4, 0.5, r()), diet: [0.3, 0.1, 0.8], size: emix(0.9, 1.5, r()), radius: emix(0.8, 1, r()) }) },
  hunter: { W: [[0.55, 0.5, 0.3], [0.5, 0.4, 0.2], [0.8, 0.3, -0.3]], dev: [[0.5, 0.35, 0.15], [0.5, 0.4, 0.1], [0.6, 0.3, 0.1]],
    t: (r) => ({ photo: 0, swim: emix(1.2, 2.2, r()), align: emix(0.7, 1, r()), force: emix(8, 13, r()), advect: emix(0.1, 0.3, r()), drag: emix(0.1, 0.2, r()),
      lifespan: emix(150, 280, r()), reproE: emix(1.8, 2.8, r()), share: emix(0.45, 0.55, r()), diet: [0.05, 0.1, 1], size: emix(1.1, 1.7, r()), radius: emix(0.8, 1, r()) }) },
  scavenger: { W: [[0.35, 0, 0], [0, 0, 0], [0, 0, 0]], dev: [[1, 0, 0], [1, 0, 0], [1, 0, 0]],
    t: (r) => ({ photo: 0, swim: emix(0.2, 0.6, r()), align: emix(0, 0.4, r()), force: emix(3, 7, r()), advect: emix(0.4, 0.8, r()), drag: emix(0.06, 0.14, r()),
      lifespan: emix(100, 200, r()), reproE: emix(1.0, 1.6, r()), share: emix(0.4, 0.5, r()), diet: [0.15, 0.85, 0.05], size: emix(0.6, 1.0, r()), radius: emix(0.6, 0.85, r()) }) },
  filament: { W: [[-0.4, 0.85, 0], [0.85, -0.4, 0], [0, 0, 0]], dev: [[0, 1, 0], [1, 0, 0], [1, 0, 0]],
    t: (r) => ({ photo: emix(0.3, 0.6, r()), swim: emix(0.1, 0.4, r()), align: emix(0.2, 0.5, r()), force: emix(4, 8, r()), advect: emix(0.2, 0.5, r()), drag: emix(0.08, 0.16, r()),
      lifespan: emix(150, 300, r()), reproE: emix(1.1, 1.7, r()), share: emix(0.35, 0.45, r()), diet: [0.7, 0.3, 0], size: emix(0.8, 1.2, r()), radius: emix(0.6, 0.85, r()) }) },
};
const ADHESION = { reef: 0.85, plankton: 0, grazer: 0, crawler: 0.75, hunter: 0.6, scavenger: 0.25, filament: 0.9 };
export const FOUNDING_PLAN = ['reef', 'reef', 'reef', 'reef', 'plankton', 'plankton', 'plankton', 'plankton',
  'grazer', 'grazer', 'grazer', 'grazer', 'crawler', 'crawler', 'crawler', 'crawler',
  'hunter', 'hunter', 'hunter', 'scavenger', 'scavenger', 'filament', 'filament', 'filament'];

export function archetypeGenome(type, r = Math.random) {
  const A = ARCHETYPES[type];
  const surfs = [randSig(r), randSig(r), randSig(r)];
  const roles = surfs.map((surf, i) => {
    const rec = Array.from({ length: 8 }, (_, d) => {
      let v = (r() * 2 - 1) * 0.22;
      for (let s = 0; s < 3; s++) v += A.W[i][s] * surfs[s][d] * 0.85;
      return eclamp(v, -1, 1);
    });
    return { surf, rec };
  });
  const t = A.t(r);
  const g = {
    roles, dev: A.dev.map((row) => row.map((v) => eclamp(v + (r() - 0.5) * 0.1, 0, 1))),
    radius: t.radius, beta: t.beta ?? emix(0.2, 0.35, r()), force: t.force, drag: t.drag,
    lifespan: t.lifespan, reproE: t.reproE, share: t.share,
    dGlint: t.diet[0], dHusk: t.diet[1], dFlesh: t.diet[2],
    mutRate: emix(0.008, 0.025, r()), hue: r(), sat: emix(0.6, 1, r()), lum: emix(0.52, 0.72, r()),
    size: t.size, shape: Math.floor(r() * 5), pulse: r() < 0.3 ? emix(0.4, 0.9, r()) : r() * 0.2,
    roleHue: (r() - 0.5) * 0.35, advect: t.advect, swim: t.swim, align: t.align, photo: t.photo,
    parent: 0, serial: 0, born: 0, depth: 0, archetype: type,
    adhesion: ADHESION[type] ?? 0,
  };
  return finalizeGenome(g);
}

export function finalizeGenome(g, K = DEFAULT_K) {
  const s = Math.max(g.dGlint + g.dHusk + g.dFlesh, 1e-3);
  g.dGlint /= s; g.dHusk /= s; g.dFlesh /= s;
  g.metab = (0.012 + 0.0032 * g.force + 0.012 * g.radius + 0.00012 * g.lifespan
    + (K.anchorCost ?? 0) * (1 - g.advect) + 0.004 * g.size + (K.swimCost ?? 0.018) * g.swim * (1 - g.photo) + 0.006 * g.align + 0.004 * (g.adhesion || 0)) * K.metab;
  g.col = packUnorm(...roleColor(g, 0));
  return g;
}

export function writeGenome(u32, f32, slot, g) {
  const o = slot * G_WORDS;
  for (let r = 0; r < 3; r++) {
    const R = g.roles[r];
    u32[o + r * 4] = packSnorm(R.surf.slice(0, 4)); u32[o + r * 4 + 1] = packSnorm(R.surf.slice(4, 8));
    u32[o + r * 4 + 2] = packSnorm(R.rec.slice(0, 4)); u32[o + r * 4 + 3] = packSnorm(R.rec.slice(4, 8));
    u32[o + 12 + r] = packUnorm(g.dev[r][0], g.dev[r][1], g.dev[r][2], 0);
  }
  const fl = ['radius', 'beta', 'force', 'drag', 'metab', 'lifespan', 'reproE', 'share',
    'dGlint', 'dHusk', 'dFlesh', 'mutRate', 'hue', 'sat', 'lum', 'size', 'shape', 'pulse', 'roleHue', 'advect', 'swim', 'align', 'photo'];
  fl.forEach((k, i) => { f32[o + 16 + i] = g[k] ?? 0; });
  u32[o + 39] = g.col >>> 0;
  u32[o + 40] = g.parent >>> 0; u32[o + 41] = g.serial >>> 0; f32[o + 42] = g.born || 0; u32[o + 43] = g.depth >>> 0;
  f32[o + 44] = g.adhesion || 0;
}

export function readGenome(u32, f32, slot) {
  const o = slot * G_WORDS;
  const roles = [0, 1, 2].map((r) => ({
    surf: [...unpackSnorm(u32[o + r * 4]), ...unpackSnorm(u32[o + r * 4 + 1])],
    rec: [...unpackSnorm(u32[o + r * 4 + 2]), ...unpackSnorm(u32[o + r * 4 + 3])],
  }));
  const dev = [0, 1, 2].map((r) => unpackUnorm(u32[o + 12 + r]).slice(0, 3));
  const F = (i) => f32[o + 16 + i];
  return {
    slot, roles, dev,
    radius: F(0), beta: F(1), force: F(2), drag: F(3), metab: F(4), lifespan: F(5), reproE: F(6), share: F(7),
    dGlint: F(8), dHusk: F(9), dFlesh: F(10), mutRate: F(11), hue: F(12), sat: F(13), lum: F(14), size: F(15),
    shape: F(16), pulse: F(17), roleHue: F(18), advect: F(19), swim: F(20), align: F(21), photo: F(22),
    col: u32[o + 39], parent: u32[o + 40], serial: u32[o + 41], born: f32[o + 42], depth: u32[o + 43],
    adhesion: f32[o + 44],
  };
}

export function parseParticle(u32, f32, o) {
  const info = u32[o + 9];
  return {
    x: f32[o], y: f32[o + 1], vx: f32[o + 2], vy: f32[o + 3], kind: u32[o + 4],
    energy: f32[o + 5], age: f32[o + 6], id: u32[o + 7], col: u32[o + 8], info,
    cause: info & 15, role: (info >>> 4) & 3, gen: info >>> 6,
  };
}

// --------------------------------------------------------------------- engine
export async function createEngine(device, format, { hasTimestamps = false, K = {} } = {}) {
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
    this.season = 1;
    this.abio = 0;
    this.turbid = 1; // light reaching plants after the shade of all plant cover (set from the census)
    this.immig = null;
    this.dietCost = new Float32Array([1, 1, 1, 1]);
    this.mobCost = new Float32Array([1, 1, 1, 1]);
    this.guildShare = null;
    this.immigration = true;
    this.nextImmig = 40;
    this.onImmigrate = null;
    this.ambient = 0.17;
    this.chargeMul = 1;
    this.tide = new Float32Array([1, 1, 0.021, 1, 2, -1, -0.017, 1, -1, 3, 0.013, 0.7, 1, -2, 0.011, 0]);
    this.seedValue = 1;
    this.censusEvery = 20;
    this.settings = { trails: 0.45, links: true, nodes: true, bloom: 0.012, exposure: 1.0, tide: 1 };
    this.simData = new ArrayBuffer(256);
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
    b.sim = d.createBuffer({ size: 256, usage: U.UNIFORM | U.COPY_DST });
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
      censusMain: [0, 10, 11, 12, 13],
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
    d.pushErrorScope('out-of-memory');
    d.pushErrorScope('validation');
    b.parts = d.createBuffer({ size: n * P_BYTES, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    b.sortedFull = d.createBuffer({ size: n * P_BYTES, usage: U.STORAGE });
    b.sortedLite = d.createBuffer({ size: n * LITE_BYTES, usage: U.STORAGE });
    b.aux = d.createBuffer({ size: n * 8, usage: U.STORAGE });
    b.intent = d.createBuffer({ size: n * 16, usage: U.STORAGE | U.COPY_DST });
    b.ledger = d.createBuffer({ size: (META_CLAIM + n) * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    b.livingList = d.createBuffer({ size: (n + 256) * 4, usage: U.STORAGE | U.COPY_DST });
    const verr = await d.popErrorScope();
    const oerr = await d.popErrorScope();
    if (verr || oerr) {
      for (const k of names) { b[k]?.destroy(); b[k] = null; }
      return false;
    }
    this.capacity = n;
    this.count = 0;
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
      const g = archetypeGenome('plankton', rng);
      g.col = packUnorm(...matterCols[m]);
      writeGenome(gu, gf, m, g);
    }
    const head = new Uint32Array(META_CLAIM);
    const plan = FOUNDING_PLAN;
    head[0] = n;
    head[1] = plan.length;
    this.founderTypes = {};
    plan.forEach((type, s) => {
      const g = archetypeGenome(type, rng);
      g.serial = s + 1;
      writeGenome(gu, gf, FIRST_LIFE + s, g);
      head[META_SLOT + FIRST_LIFE + s] = 1;
      this.founderTypes[s + 1] = type;
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
  /**
   * Immigration keeps every way of life represented: when a guild becomes rare, a small founding
   * colony of that type settles out of the water somewhere. Checked from the census.
   */
  _guildTick(u, gf) {
    const G = (s, i) => gf[s * G_WORDS + 16 + i];
    const diet = [0, 0, 0, 0], mob = [0, 0, 0, 0];
    let living = 0;
    for (let s = FIRST_LIFE; s < MAXK; s++) {
      const n = u[META_POP + s];
      if (!n) continue;
      living += n;
      const photo = G(s, 22), dF = G(s, 10), dH = G(s, 9), adv = G(s, 19), swim = G(s, 20) * (1 - photo);
      diet[photo > 0.55 ? 0 : dF > 0.55 ? 2 : dH > 0.55 ? 3 : 1] += n;
      mob[adv < 0.2 && swim < 0.2 ? 0 : swim >= 0.8 ? 2 : adv > 0.7 && swim < 0.4 ? 3 : 1] += n;
    }
    const K = this.K;
    const cost = (n) => 1 + K.guildBlight * Math.max(0, n / Math.max(1, living) - K.guildCap);
    for (let i = 0; i < 4; i++) {
      this.dietCost[i] += (cost(diet[i]) - this.dietCost[i]) * 0.5;
      this.mobCost[i] += (cost(mob[i]) - this.mobCost[i]) * 0.5;
    }
    this.guildShare = { diet: diet.map((n) => n / Math.max(1, living)), mob: mob.map((n) => n / Math.max(1, living)) };
  }

  _immigrationTick(u, gf, t) {
    if (this.immig || t < this.nextImmig) return;
    this.nextImmig = t + this.K.immigEvery * (0.7 + 0.6 * Math.random());
    const G = (s, i) => gf[s * G_WORDS + 16 + i];
    let living = 0;
    const share = { predator: 0, scavenger: 0, grazer: 0, producer: 0, sessile: 0, bodies: 0, swimmer: 0 };
    for (let s = FIRST_LIFE; s < MAXK; s++) {
      const n = u[META_POP + s];
      if (!n) continue;
      living += n;
      const photo = G(s, 22), dG = G(s, 8), dH = G(s, 9), dF = G(s, 10), adv = G(s, 19), swim = G(s, 20) * (1 - photo), adh = gf[s * G_WORDS + 44];
      if (photo > 0.55) share.producer += n;
      else if (dF > 0.55) share.predator += n;
      else if (dH > 0.55) share.scavenger += n;
      else if (dG > 0.55) share.grazer += n;
      if (adv < 0.2 && swim < 0.2) share.sessile += n;
      if (swim >= 0.8) share.swimmer += n;
      if (adh > this.K.adhMin) share.bodies += n;
    }
    if (living < this.count * 0.01) return;
    const want = { predator: 0.08, scavenger: 0.05, grazer: 0.12, producer: 0.2, sessile: 0.08, bodies: 0.25, swimmer: 0.06 };
    // choose among the rare guilds, weighted by how rare, and rotate rather than retrying one guild forever
    const cands = [];
    let total = 0;
    for (const k in want) {
      const r = share[k] / living / want[k];
      if (r >= 1) continue;
      const w = (1 - r) * (k === this.lastImmigGuild ? 0.25 : 1);
      cands.push([k, w]); total += w;
    }
    if (!cands.length) return;
    let pickW = Math.random() * total, worst = cands[0][0];
    for (const [k, w] of cands) { pickW -= w; if (pickW <= 0) { worst = k; break; } }
    this.lastImmigGuild = worst;
    const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
    const type = { predator: pickOne(['hunter', 'crawler']), scavenger: 'scavenger', grazer: 'grazer', producer: pickOne(['reef', 'plankton', 'filament']),
      sessile: 'reef', bodies: pickOne(['reef', 'crawler', 'filament', 'hunter']), swimmer: pickOne(['hunter', 'grazer']) }[worst];
    const g = archetypeGenome(type);
    const big = worst === 'sessile' || worst === 'bodies' || type === 'reef';
    this.immigrate(g, { cells: Math.round((big ? 60 : 30) + 40 * Math.random()) });
    if (this.immig && this.onImmigrate) this.onImmigrate({ type, guild: worst, slot: this.immig.slot, x: this.immig.x, y: this.immig.y, t });
  }

  immigrate(g, { x, y, r = 2.2, cells = 50, frames = 90 } = {}) {
    if (!this.lastSlots) return false;
    const free = [];
    for (let k = FIRST_LIFE; k < MAXK; k++) if (!this.lastSlots[k] && !this.lastPop[k]) free.push(k);
    if (free.length < 8) return false;
    const slot = free[Math.floor(free.length * (0.5 + 0.5 * Math.random()))];
    g.parent = 0; g.serial = 0; g.born = 0; g.depth = 0;
    finalizeGenome(g, this.K);
    const buf = new ArrayBuffer(G_BYTES);
    writeGenome(new Uint32Array(buf), new Float32Array(buf), 0, g);
    this.device.queue.writeBuffer(this.b.genomes, slot * G_BYTES, buf);
    this.device.queue.writeBuffer(this.b.ledger, (META_SLOT + slot) * 4, new Uint32Array([1]));
    const [W, H] = this.grid;
    const matter = this.lastPop ? (this.lastPop[0] + this.lastPop[1]) / Math.max(1, this.count) : 0.5;
    const pool = Math.PI * r * r * this.K.density * Math.max(0.05, matter);
    this.immig = { slot, x: x ?? Math.random() * W, y: y ?? Math.random() * H, r, p: Math.min(0.5, cells / (frames * pool)), frames };
    return true;
  }

  randomizeCurrents(rng = Math.random, into = this.waves) {
    const [W, H] = this.grid;
    for (let k = 0; k < 4; k++) {
      const L = emix(14, 34, rng());
      const th = rng() * Math.PI * 2;
      let kx = Math.round((W / L) * Math.cos(th));
      const ky = Math.round((H / L) * Math.sin(th));
      if (kx === 0 && ky === 0) kx = 1;
      into[k * 4] = (Math.PI * 2 * kx) / W;
      into[k * 4 + 1] = (Math.PI * 2 * ky) / H;
      into[k * 4 + 2] = (rng() < 0.5 ? -1 : 1) * emix(0.04, 0.12, rng());
      into[k * 4 + 3] = emix(0.08, 0.16, rng());
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
    f[16] = this.ambient; f[17] = this.chargeMul; f[18] = this.turbid;
    const im = this.immig;
    u[19] = im ? im.slot : 0xffffffff;
    if (im) { f[52] = im.x; f[53] = im.y; f[54] = im.r; f[55] = im.p; }
    f.set(this.dietCost, 56);
    f.set(this.mobCost, 60);
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
      if (this.immig && --this.immig.frames <= 0) this.immig = null;
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
      run('scanBlocks', MAX_CELLS / 256);
      run('scanSums', 1);
      run('scanAdd', MAX_CELLS / 256);
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
        if (ms > 0 && ms < 5000 && this.onGpuTime) this.onGpuTime(ms, N);
      }).catch(() => { slot.busy = false; });
    } else if (!tm && this.onGpuTime && (stepping || target)) {
      const t0 = performance.now();
      d.queue.onSubmittedWorkDone().then(() => this.onGpuTime(performance.now() - t0, N));
    }

    if (pickJob) {
      const { st, req } = pickJob;
      st.busy = true;
      st.buf.mapAsync(GPUMapMode.READ).then(() => {
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
        if (this.onTrack) this.onTrack({ id: trackJob.id, found, tracked, simTime: trackJob.simTime });
      }).catch(() => { st.busy = false; });
    }

    if (censusJob) {
      const { st } = censusJob;
      st.busy = true;
      st.buf.mapAsync(GPUMapMode.READ).then(() => {
        const copy = st.buf.getMappedRange().slice(0);
        st.buf.unmap();
        st.busy = false;
        {
          // Plant cover clouds the water: the more of the world is photosynthesising cells, the less light each gets.
          const u = new Uint32Array(copy), gf = new Float32Array(copy, LEDGER_HEAD);
          let plant = 0;
          for (let s = 4; s < MAXK; s++) { const n = u[META_POP + s]; if (n) plant += n * gf[s * G_WORDS + 38]; }
          const frac = plant / Math.max(1, this.count);
          const target = 1 / (1 + this.K.turbid * Math.max(0, frac - this.K.turbidAt));
          this.plantFrac = frac;
          this.turbid += (target - this.turbid) * 0.5;
          this._guildTick(u, gf);
          this.lastSlots = u.slice(META_SLOT, META_SLOT + MAXK);
          this.lastPop = u.slice(META_POP, META_POP + MAXK);
          if (this.immigration) this._immigrationTick(u, gf, censusJob.simTime);
        }
        if (this.onCensus) {
          const u = new Uint32Array(copy);
          this.onCensus({
            simTime: censusJob.simTime, frameNo: censusJob.frameNo,
            globals: u.subarray(0, 16), slots: u.subarray(META_SLOT, META_SLOT + MAXK), pop: u.subarray(META_POP, META_POP + MAXK),
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
