import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layOut, frameCells, records, bondsOf, SHOWN } from '../src/studio.js';
import { FIRST_LIFE } from '../src/shaders.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('bonds are counted either way round, once', () => {
  // (as the pipette keeps them: each cell lists the bonds it keeps, not those kept to it)
  assert.deepEqual(bondsOf([{ partners: [] }, { partners: [0] }, { partners: [1, 0] }, { partners: [2, 9] }]), [[0, 1], [1, 2], [0, 2], [2, 3]]);
});

test('a body is laid out by its bonds: partners at a bond\'s length, none overlapping much, the same every time', () => {
  // a branched body: 0-1-2-3, 1-4-5 (some bonds listed only by the later cell), and 6 alone
  const partners = [[1], [2], [], [2], [1, 5], [], []];
  const cells = partners.map((p, i) => ({ r: i === 3 ? 0.12 : 0.08, partners: p }));
  const pos = layOut(cells);
  for (const [i, j] of bondsOf(cells)) {
    const d = dist(pos[i], pos[j]), m = cells[i].r + cells[j].r;
    assert.ok(d > 0.85 * m && d < 1.1 * m, `bond ${i}-${j}: ${d.toFixed(3)} for ${m.toFixed(3)}`);
  }
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) assert.ok(dist(pos[i], pos[j]) > 0.85 * (cells[i].r + cells[j].r), `${i} and ${j} overlap`);
  assert.deepEqual(layOut(cells), pos);
});

test('unbonded cells lie side by side', () => {
  const cells = Array.from({ length: 5 }, () => ({ r: 0.1, partners: [] }));
  const pos = layOut(cells);
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.ok(dist(pos[i], pos[j]) >= 0.19);
  // and close: within a few cells of each other
  for (const p of pos) assert.ok(Math.hypot(...p) < 0.6);
});

test('the frame fits the cells inside what a card shows', () => {
  const pos = [[-1, 0], [1, 0.2], [0.5, -0.3]], r = [0.1, 0.1, 0.2], S = 192;
  const { cx, cy, ppu } = frameCells(pos, r, S);
  pos.forEach(([x, y], i) => {
    assert.ok(Math.abs((x - cx) * ppu) + r[i] * ppu <= (SHOWN[0] * S) / 2 + 1e-6);
    assert.ok(Math.abs((y - cy) * ppu) + r[i] * ppu <= (SHOWN[1] * S) / 2 + 1e-6);
  });
  // a lone cell fills the band's height, less its margin
  const one = frameCells([[0, 0]], [0.1], S);
  assert.ok(Math.abs(one.ppu * 0.2 * 1.2 - SHOWN[1] * S) < 1e-6);
});

test('the records are still cells of the studio genome, where they were laid out', () => {
  const cells = [{ e: 1.5, a: 3, col: 0xff112233, info: 0x25, partners: [] }, { e: 0.5, a: 0, col: 7, info: 0, partners: [0] }, { e: 1, a: 1, col: 7, info: 0, partners: [] }];
  const f = records(cells, [[0.1, 0.2], [-0.3, 0.2], [2, 2]], [10, 20]), u = new Uint32Array(f.buffer);
  assert.equal(f.length, 30);
  assert.ok(Math.abs(f[0] - 10.1) < 1e-5 && Math.abs(f[1] - 20.2) < 1e-5 && Math.abs(f[10] - 9.7) < 1e-5);
  assert.ok(Math.hypot(f[2], f[3]) < 1e-4 && Math.hypot(f[2], f[3]) > 0);
  assert.deepEqual([u[4], f[5], f[6], u[8], u[9]], [FIRST_LIFE, 1.5, 3, 0xff112233, 0x25]);
  assert.equal(u[14], FIRST_LIFE);
  // bonded either way round: 0 and 1 each name the other, 2 names none; 1 faces away from 0 (along -x)
  const none = 1023 | (1023 << 10) | (1023 << 20);
  assert.equal(u[7], (1 | (1023 << 10) | (1023 << 20)) >>> 0);
  assert.equal(u[17], (0 | (1023 << 10) | (1023 << 20)) >>> 0);
  assert.equal(u[27], none >>> 0);
  assert.ok(f[12] < 0 && Math.abs(f[13]) < 1e-9);
});
