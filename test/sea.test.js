import test from 'node:test';
import assert from 'node:assert/strict';
import { SEA, SEA_N, SEA_CASCADES, seaLayout, seaScales, seaRadial } from '../src/sea.js';
import { SEA_WGSL, POST_WGSL } from '../src/shaders.js';

const world = [146, 82];

test('the cascades divide the world and hold contiguous bands', () => {
  const L = seaLayout(world);
  assert.equal(L.length, SEA_CASCADES);
  L.forEach((c, i) => {
    // a whole number of patches across the world each way, so the sea tiles it
    assert.ok(Math.abs(world[0] / c.L[0] - 4 ** i) < 1e-9 && Math.abs(world[1] / c.L[1] - 4 ** i) < 1e-9);
    assert.ok(c.k0 < c.k1);
    if (i) assert.equal(c.k0, L[i - 1].k1);
  });
  const last = L[SEA_CASCADES - 1];
  assert.ok(last.k1 <= (Math.PI * SEA_N) / Math.max(...last.L) / 2 + 1e-9);
});

test('the sea as the GPU samples it (on the cascades\' wavenumber grids) is as steep as asked', () => {
  const layout = seaLayout(world), scale = seaScales(layout);
  let v = 0;
  for (const c of layout) {
    const dk = ((2 * Math.PI) / c.L[0]) * ((2 * Math.PI) / c.L[1]);
    for (let j = 0; j < SEA_N; j++) for (let i = 0; i < SEA_N; i++) {
      const kx = ((2 * Math.PI) * (i < SEA_N / 2 ? i : i - SEA_N)) / c.L[0], ky = ((2 * Math.PI) * (j < SEA_N / 2 ? j : j - SEA_N)) / c.L[1];
      const k = Math.hypot(kx, ky);
      if (!(k >= c.k0 && k < c.k1)) continue;
      const off = Math.abs(Math.cos(Math.atan2(ky, kx) / 2)); // the wind along x
      SEA.systems.forEach((s, n) => { v += k * k * scale[n] * seaRadial(k, (2 * Math.PI) / s.lp) * off ** (2 * s.spread) * dk; });
    }
  }
  const want = SEA.systems.reduce((a, s) => a + s.slope ** 2, 0);
  assert.ok(Math.abs(v / want - 1) < 0.1, `slope variance ${v} vs ${want}`);
});

test('nothing a third of the damping length or shorter is left', () => {
  const kc = (2 * Math.PI) / SEA.lmin;
  const kp = (2 * Math.PI) / SEA.systems[1].lp;
  assert.ok(seaRadial(3 * kc, kp) * (3 * kc) ** 4 < 1e-3 * seaRadial(kp, kp) * kp ** 4);
});

test('the sea WGSL expands', () => {
  assert.doesNotMatch(SEA_WGSL, /\$\{/);
  assert.match(SEA_WGSL, /fn fftRows/);
  assert.match(POST_WGSL, /fn seaSurface/);
});

test('the tunables\' defaults are the sea as it ships', async () => {
  const { seaTuneDefaults, seaSpecOf } = await import('../src/seatune.js');
  assert.deepEqual(seaSpecOf(SEA, seaTuneDefaults(SEA)), { ...SEA, systems: SEA.systems.map((s) => ({ ...s })) });
});
