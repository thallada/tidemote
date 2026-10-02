import { DEFAULT_K, G_WORDS } from './shaders.js';

export const KIND = { SILT: 0, GLINT: 1, HUSK: 2 };

// ------------------------------------------------------------ genome helpers
export function hsl2rgb(h, s, l) {
  const k = [0, 8, 4].map((o) => (o + h * 12) % 12);
  const a = s * Math.min(l, 1 - l);
  return k.map((v) => l - a * Math.max(-1, Math.min(1, Math.min(v - 3, 9 - v))));
}
const fract = (x) => x - Math.floor(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const packUnorm = (r, g, b, a = 1) => ((Math.round(clamp(r, 0, 1) * 255))
  | (Math.round(clamp(g, 0, 1) * 255) << 8)
  | (Math.round(clamp(b, 0, 1) * 255) << 16) | (Math.round(clamp(a, 0, 1) * 255) << 24)) >>> 0;
export const unpackUnorm = (u) => [(u & 255) / 255, ((u >>> 8) & 255) / 255, ((u >>> 16) & 255) / 255, ((u >>> 24) & 255) / 255];
export const packSnorm = (a) => a.reduce((acc, v, i) => acc | ((Math.round(clamp(v, -1, 1) * 127) & 255) << (i * 8)), 0) >>> 0;
export const unpackSnorm = (u) => [0, 1, 2, 3].map((i) => Math.max(-1, (((u >>> (i * 8)) & 255) << 24 >> 24) / 127));
const mix = (a, b, t) => a + (b - a) * t;

export function roleColor(g, r) {
  return hsl2rgb(fract(g.hue + r * g.roleHue + 1), g.sat, g.lum * (1 - 0.08 * r));
}

export function affinity(a, ra, b, rb, K = DEFAULT_K) {
  const rec = a.roles[ra].rec, surf = b.roles[rb].surf;
  let s = 0;
  for (let i = 0; i < 8; i++) s += rec[i] * surf[i];
  return clamp(s * K.affScale, -1, 1);
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
    t: (r) => ({ photo: mix(0.8, 1, r()), swim: 0, align: 0, force: mix(4, 7, r()), advect: mix(0.02, 0.08, r()), drag: mix(0.15, 0.3, r()),
      lifespan: mix(260, 460, r()), reproE: mix(0.9, 1.3, r()), share: mix(0.3, 0.4, r()), diet: [0.8, 0.2, 0], size: mix(0.8, 1.3, r()), radius: mix(0.85, 1, r()), beta: mix(0.14, 0.22, r()) }) },
  plankton: { W: [[-0.35, 0, 0], [0, 0, 0], [0, 0, 0]], dev: [[1, 0, 0], [1, 0, 0], [1, 0, 0]],
    t: (r) => ({ photo: mix(0.6, 0.9, r()), swim: mix(0, 0.2, r()), align: 0, force: mix(2, 5, r()), advect: mix(0.8, 1, r()), drag: mix(0.05, 0.12, r()),
      lifespan: mix(60, 140, r()), reproE: mix(0.8, 1.2, r()), share: mix(0.4, 0.5, r()), diet: [1, 0, 0], size: mix(0.45, 0.75, r()), radius: mix(0.45, 0.7, r()) }) },
  grazer: { W: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], dev: [[1, 0, 0], [1, 0, 0], [1, 0, 0]], selfW: [-0.2, 0.2],
    t: (r) => ({ photo: 0, swim: mix(0.6, 1.3, r()), align: mix(0, 0.3, r()), force: mix(4, 9, r()), advect: mix(0.3, 0.7, r()), drag: mix(0.06, 0.15, r()),
      lifespan: mix(90, 180, r()), reproE: mix(1.1, 1.8, r()), share: mix(0.4, 0.5, r()), diet: [0.75, 0.1, 0.22], size: mix(0.7, 1.1, r()), radius: mix(0.6, 0.9, r()) }) },
  crawler: { W: [[0.85, 0.6, 0], [1.0, -0.3, 0], [0, 0, 0]], dev: [[0.55, 0.45, 0], [0.5, 0.5, 0], [1, 0, 0]],
    t: (r) => ({ photo: 0, swim: mix(0.4, 0.9, r()), align: mix(0.6, 0.95, r()), force: mix(7, 12, r()), advect: mix(0.15, 0.4, r()), drag: mix(0.1, 0.2, r()),
      lifespan: mix(140, 260, r()), reproE: mix(1.3, 2.0, r()), share: mix(0.4, 0.5, r()), diet: [0.3, 0.1, 0.8], size: mix(0.9, 1.5, r()), radius: mix(0.8, 1, r()) }) },
  hunter: { W: [[0.55, 0.5, 0.3], [0.5, 0.4, 0.2], [0.8, 0.3, -0.3]], dev: [[0.5, 0.35, 0.15], [0.5, 0.4, 0.1], [0.6, 0.3, 0.1]],
    t: (r) => ({ photo: 0, swim: mix(1.2, 2.2, r()), align: mix(0.7, 1, r()), force: mix(8, 13, r()), advect: mix(0.1, 0.3, r()), drag: mix(0.1, 0.2, r()),
      lifespan: mix(150, 280, r()), reproE: mix(1.8, 2.8, r()), share: mix(0.45, 0.55, r()), diet: [0.05, 0.1, 1], size: mix(1.1, 1.7, r()), radius: mix(0.8, 1, r()) }) },
  scavenger: { W: [[0.35, 0, 0], [0, 0, 0], [0, 0, 0]], dev: [[1, 0, 0], [1, 0, 0], [1, 0, 0]],
    t: (r) => ({ photo: 0, swim: mix(0.2, 0.6, r()), align: mix(0, 0.4, r()), force: mix(3, 7, r()), advect: mix(0.4, 0.8, r()), drag: mix(0.06, 0.14, r()),
      lifespan: mix(100, 200, r()), reproE: mix(1.0, 1.6, r()), share: mix(0.4, 0.5, r()), diet: [0.15, 0.85, 0.05], size: mix(0.6, 1.0, r()), radius: mix(0.6, 0.85, r()) }) },
  filament: { W: [[-0.4, 0.85, 0], [0.85, -0.4, 0], [0, 0, 0]], dev: [[0, 1, 0], [1, 0, 0], [1, 0, 0]],
    t: (r) => ({ photo: mix(0.3, 0.6, r()), swim: mix(0.1, 0.4, r()), align: mix(0.2, 0.5, r()), force: mix(4, 8, r()), advect: mix(0.2, 0.5, r()), drag: mix(0.08, 0.16, r()),
      lifespan: mix(150, 300, r()), reproE: mix(1.1, 1.7, r()), share: mix(0.35, 0.45, r()), diet: [0.7, 0.3, 0], size: mix(0.8, 1.2, r()), radius: mix(0.6, 0.85, r()) }) },
};
const ADHESION = { reef: 0.85, plankton: 0, grazer: 0, crawler: 0.75, hunter: 0.6, scavenger: 0.25, filament: 0.9 };
export const FOUNDING_PLAN = ['reef', 'reef', 'reef', 'reef', 'plankton', 'plankton', 'plankton', 'plankton',
  'grazer', 'grazer', 'grazer', 'grazer', 'crawler', 'crawler', 'crawler', 'crawler',
  'hunter', 'hunter', 'hunter', 'scavenger', 'scavenger', 'filament', 'filament', 'filament'];

export function archetypeGenome(type, r = Math.random, K = DEFAULT_K) {
  const A = ARCHETYPES[type];
  const W = A.selfW ? A.W.map((row, i) => (i === 0 ? [mix(A.selfW[0], A.selfW[1], r()), row[1], row[2]] : row)) : A.W;
  const surfs = [randSig(r), randSig(r), randSig(r)];
  const roles = surfs.map((surf, i) => {
    const rec = Array.from({ length: 8 }, (_, d) => {
      let v = (r() * 2 - 1) * 0.22;
      for (let s = 0; s < 3; s++) v += W[i][s] * surfs[s][d] * 0.85;
      return clamp(v, -1, 1);
    });
    return { surf, rec };
  });
  const t = A.t(r);
  const g = {
    roles, dev: A.dev.map((row) => row.map((v) => clamp(v + (r() - 0.5) * 0.1, 0, 1))),
    radius: t.radius, beta: t.beta ?? mix(0.2, 0.35, r()), force: t.force, drag: t.drag,
    lifespan: t.lifespan, reproE: t.reproE, share: t.share,
    dGlint: t.diet[0], dHusk: t.diet[1], dFlesh: t.diet[2],
    mutRate: mix(0.008, 0.025, r()), hue: r(), sat: mix(0.6, 1, r()), lum: mix(0.52, 0.72, r()),
    size: t.size, shape: Math.floor(r() * 5), pulse: r() < 0.3 ? mix(0.4, 0.9, r()) : r() * 0.2,
    roleHue: (r() - 0.5) * 0.35, advect: t.advect, swim: t.swim, align: t.align, photo: t.photo,
    parent: 0, serial: 0, born: 0, depth: 0, archetype: type,
    adhesion: ADHESION[type] ?? 0,
  };
  return finalizeGenome(g, K);
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

export const genomeSerial = (u32, slot) => u32[slot * G_WORDS + 41];

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
    cause: info & 15, role: (info >>> 4) & 3, gen: info >>> 16,
  };
}

export function dietGuild(g) {
  return g.photo > 0.55 ? 'producer' : g.dFlesh > 0.55 ? 'predator'
    : g.dHusk > 0.55 ? 'scavenger' : g.dGlint > 0.55 ? 'grazer' : 'omnivore';
}

export function mobilityGuild(g) {
  const swim = g.swim * (1 - g.photo);
  return g.advect < 0.2 && swim < 0.2 ? 'sessile' : swim >= 0.8 ? 'swimmer'
    : g.advect > 0.7 && swim < 0.4 ? 'drifter' : 'crawler';
}
