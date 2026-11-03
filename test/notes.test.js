import test from 'node:test';
import assert from 'node:assert/strict';
import { Notes, readRing, readView, squareOf, EV, TUNE } from '../src/notes.js';
import { NOTE_MAX, NOTE_W, NOTE_WORDS, NOTE_HEAD, NOTE_REC, NOTE_TG, NOTE_TEMPS, FIRST_LIFE, CYST } from '../src/shaders.js';

const NONE = 0xffffffff;
const WORLD = [100, 100];

// a ring holding the given records, its running count `count` (the last of them written last)
function ring(records, count = records.length) {
  const u = new Uint32Array(NOTE_WORDS), f = new Float32Array(u.buffer);
  u[0] = count;
  records.forEach((r, k) => {
    const o = 4 + (((count - records.length + k) >>> 0) % NOTE_MAX) * NOTE_W;
    u[o] = EV[r.ev] | ((r.kind & 1023) << 5) | (((r.akind ?? 0) & 1023) << 15);
    u[o + 1] = r.id; u[o + 2] = r.aid ?? NONE; f[o + 3] = r.x ?? 0; f[o + 4] = r.y ?? 0; u[o + 5] = r.tick ?? 600;
    f[o + 6] = r.ax ?? 0; f[o + 7] = r.ay ?? 0;
  });
  return u;
}

const halfOf = (v) => {
  const f = new Float32Array([v]), i = new Uint32Array(f.buffer)[0];
  const s = (i >>> 16) & 0x8000, e = ((i >>> 23) & 255) - 112, m = (i >>> 13) & 1023;
  return e <= 0 ? s : s | (e << 10) | m;
};

// a scan of the given cells: { id, x, y, kind, cause, vx, vy, fed, tx, torpid, p1, p2 }
function scan(cells, { simTime = 10, tick = 600, rect = [0, 0, 100, 100], grid = [0, 0, 100 / NOTE_TG], temps = 20, ring: r = ring([]), keep = 1 } = {}) {
  const n = cells.length, u = new Uint32Array(NOTE_HEAD + n * NOTE_REC), f = new Float32Array(u.buffer);
  u[0] = n; u[1] = n; u[2] = n;
  for (let k = 0; k < NOTE_TG * NOTE_TG; k++) f[NOTE_TEMPS + k] = typeof temps === 'function' ? temps(k) : temps;
  cells.forEach((c, i) => {
    const o = NOTE_HEAD + i * NOTE_REC;
    u[o] = c.id; f[o + 1] = c.x; f[o + 2] = c.y;
    u[o + 3] = c.kind | ((c.cause ?? 9) << 10) | ((c.img ?? 0) << 16) | ((c.torpid ? 1 : 0) << 27);
    u[o + 4] = halfOf(c.vx ?? 0) | (halfOf(c.vy ?? 0) << 16);
    u[o + 5] = halfOf(c.fed ?? 0.5) | (halfOf(c.tx ?? 0) << 16);
    u[o + 6] = c.p1 ?? NONE; u[o + 7] = c.p2 ?? NONE;
  });
  return { simTime, stepTime: simTime, tick, rect, grid, keep, inView: n, n, head: u.subarray(0, NOTE_HEAD), u32: u, f32: f, ring: r };
}

const SP = {
  [FIRST_LIFE]: { name: 'Hunter', guild: 'predator', topt: 20, tol: 6 },
  [FIRST_LIFE + 1]: { name: 'Prey', guild: 'grazer', topt: 20, tol: 6 },
  [FIRST_LIFE + 2]: { name: 'Weed', guild: 'producer', topt: 24, tol: 4 },
  [FIRST_LIFE + 3]: { name: 'Hardy', guild: 'producer', topt: 30, tol: 10 },
};
const H = FIRST_LIFE, P = FIRST_LIFE + 1, Wd = FIRST_LIFE + 2, Hd = FIRST_LIFE + 3;
const notes = () => new Notes({ species: (k) => SP[k] || null, world: () => WORLD });
const ctx = (now, o = {}) => ({ now, speed: 1, ppu: 80, phone: false, pool: 20, visible: () => true, ...o });

test('the ring is read from where it was last read, oldest first, across its wrap, with each event\'s sim time', () => {
  const recs = Array.from({ length: 5 }, (_, k) => ({ ev: 'bite', kind: P, akind: H, id: 100 + k, aid: 7, tick: 590 + k }));
  // its running count past 2^32: the five records end at count 3, so they straddle the wrap
  const r = ring(recs, 3);
  const { count, events } = readRing(r, (3 - 5) >>> 0, 600, 10);
  assert.equal(count, 3);
  assert.deepEqual(events.map((e) => e.id), [100, 101, 102, 103, 104]);
  assert.equal(events[0].ev, 'bite');
  assert.equal(events[0].akind, H);
  assert.ok(Math.abs(events[4].t - (10 - 6 / 60)) < 1e-9);
  // the first read takes nothing (what lies in the ring may be old); a read with nothing new, nothing
  assert.equal(readRing(r, null, 600, 10).events.length, 0);
  assert.equal(readRing(r, 3, 600, 10).events.length, 0);
});

test('more events than the ring holds keep the newest NOTE_MAX', () => {
  const r = ring(Array.from({ length: NOTE_MAX }, (_, k) => ({ ev: 'kill', kind: P, id: k })), NOTE_MAX * 3);
  const { events } = readRing(r, 0, 600, 10);
  assert.equal(events.length, NOTE_MAX);
  assert.equal(events[0].id, 0);
});

test('the view reads its cells, their half floats, and its water by squares fixed in the world', () => {
  const v = readView(scan([{ id: 5, x: 99, y: 1, kind: P, vx: 0.25, vy: -1.5, fed: 0.75, tx: 1.25, torpid: true, p1: 9 }], { rect: [90, 95, 20, 20], grid: [96, 96, 2] }), WORLD);
  assert.equal(v.n, 1);
  assert.equal(v.at.get(5), 0);
  assert.equal(v.vx[0], 0.25); assert.equal(v.vy[0], -1.5); assert.equal(v.fed[0], 0.75); assert.equal(v.tx[0], 1.25);
  assert.equal(v.torpid[0], 1); assert.equal(v.p1[0], 9); assert.equal(v.p2[0], NONE);
  // across the world's wrap: x 99 lies in the second square of a grid whose corner is at 96, y 1 in the third
  assert.equal(squareOf(v, 99, 1, WORLD), 2 * NOTE_TG + 1);
  assert.equal(squareOf(v, 50, 1, WORLD), -1);
  // the squares that overlap the view (90..110 by 95..115) are read for its water; those past it are not
  assert.equal(v.sqIn[0], 1); assert.equal(v.sqIn[NOTE_TG - 1], 0); assert.equal(v.sqIn[(NOTE_TG - 1) * NOTE_TG], 0);
});

test('a kill in view is told with its hunter and its quarry, and the same story not again soon', () => {
  const N = notes();
  const cells = [{ id: 1, x: 40, y: 40, kind: H }, { id: 2, x: 41, y: 40, kind: 2, cause: 3 }];
  N.ingest(scan(cells));
  N.ingest(scan(cells, { simTime: 10.1, tick: 606, ring: ring([{ ev: 'kill', kind: P, akind: H, id: 2, aid: 1, x: 41, y: 40, tick: 605 }], 1) }));
  let on = N.update(ctx(100));
  assert.equal(on.length, 1);
  assert.equal(on[0].type, 'hunt');
  assert.equal(on[0].data.actor, 1);
  assert.equal(on[0].data.target, 2);
  assert.equal(on[0].data.kills, 1);
  // a single moment is dropped once read; then its hunter's next kill, soon after, is not told again
  on = N.update(ctx(100 + TUNE.lifeOne + 1));
  assert.ok(on.every((n) => n.exitAt != null));
  N.ingest(scan(cells, { simTime: 30, tick: 1800, ring: ring([{ ev: 'kill', kind: P, akind: H, id: 2, aid: 1, x: 41, y: 40, tick: 1799 }], 2) }));
  on = N.update(ctx(100 + TUNE.lifeOne + 2));
  assert.ok(!on.some((n) => n.exitAt == null && n.type === 'hunt'));
});

test('past four times speed a single moment is not told; what holds for a while still is', () => {
  const N = notes();
  const cells = [{ id: 1, x: 40, y: 40, kind: H }, { id: 2, x: 41, y: 40, kind: 2, cause: 3 }];
  N.ingest(scan(cells));
  N.ingest(scan(cells, { simTime: 10.1, tick: 606, ring: ring([{ ev: 'kill', kind: P, akind: H, id: 2, aid: 1, x: 41, y: 40, tick: 605 }], 1) }));
  assert.equal(N.update(ctx(100, { speed: 16 })).length, 0);
});

test('grazing is told once a pair has bitten often enough, with the grazers counted', () => {
  const N = notes();
  const cells = [];
  for (let k = 0; k < 5; k++) cells.push({ id: 10 + k, x: 30 + k, y: 30, kind: P }, { id: 20 + k, x: 30 + k, y: 31, kind: Wd });
  N.ingest(scan(cells));
  const bites = Array.from({ length: 6 }, (_, k) => ({ ev: k === 5 ? 'grazed' : 'bite', kind: Wd, akind: P, id: 20 + (k % 5), aid: 10 + (k % 5), x: 30, y: 31, tick: 600 + k }));
  N.ingest(scan(cells, { simTime: 10.2, tick: 612, ring: ring(bites, 6) }));
  const on = N.update(ctx(100));
  assert.equal(on.length, 1);
  assert.equal(on[0].type, 'graze');
  assert.equal(on[0].data.bites, 6);
  assert.equal(on[0].data.dead, 1);
  assert.equal(on[0].data.census, P);
});

test('a species in water warmer than it bears is told scalding, beside one that bears it', () => {
  const N = notes();
  const cells = [];
  // the water at 31°: past Weed's 24 + 0.8 · 4, inside Hardy's 30 ± 10
  for (let k = 0; k < 8; k++) cells.push({ id: 10 + k, x: 20 + k, y: 20, kind: Wd, tx: 1.75 }, { id: 30 + k, x: 20 + k, y: 21, kind: Hd, tx: 0.1 });
  N.ingest(scan(cells, { temps: 31 }));
  N.ingest(scan(cells, { temps: 31, simTime: 10.2, tick: 612, ring: ring([0, 1, 2].map((k) => ({ ev: 'scalded', kind: Wd, id: 50 + k, x: 22, y: 20, tick: 610 })), 3) }));
  const on = N.update(ctx(100));
  assert.equal(on.length, 1);
  assert.equal(on[0].type, 'heat');
  assert.equal(on[0].data.kind, Wd);
  assert.equal(on[0].data.scalds, 3);
  assert.equal(on[0].data.fine.kind, Hd);
});

test('the cold: most cells torpid', () => {
  const N = notes();
  const cells = Array.from({ length: 10 }, (_, k) => ({ id: k + 1, x: 10 + k, y: 10, kind: k < 8 ? Wd : Hd, torpid: k < 8 }));
  N.ingest(scan(cells, { temps: 0 }));
  N.ingest(scan(cells, { temps: 0, simTime: 10.2 }));
  const on = N.update(ctx(100));
  assert.equal(on[0].type, 'cold');
  assert.equal(on[0].data.torpid, 8);
  assert.equal(on[0].data.kind, Wd);
});

test('the budget: a few at a time, one arriving at a time, a wide view only the water\'s stories', () => {
  const N = notes();
  const cells = [];
  for (let k = 0; k < 12; k++) for (const kind of [H, P, Wd, Hd]) cells.push({ id: 1000 * kind + k, x: 10 + k * 3, y: 10 + kind, kind, cause: kind === Wd && k < 6 ? CYST : 9, tx: kind === Wd ? 1.5 : 0 });
  const evs = [];
  for (let k = 0; k < 6; k++) evs.push({ ev: 'birth', kind: H, akind: H, id: 5000 + k, aid: 1000 * H, tick: 605 }, { ev: 'cyst', kind: Wd, id: 1000 * Wd + k, tick: 605 }, { ev: 'scalded', kind: Wd, id: 6000 + k, tick: 605 });
  N.ingest(scan(cells));
  N.ingest(scan(cells, { simTime: 10.2, tick: 612, ring: ring(evs, evs.length) }));
  assert.equal(N.update(ctx(100)).length, 1);
  assert.equal(N.notes[0].type, 'heat');
  // the next waits its gap
  assert.equal(N.update(ctx(100 + TUNE.gap / 2)).filter((n) => n.exitAt == null).length, 1);
  assert.equal(N.update(ctx(100 + TUNE.gap + 0.1)).filter((n) => n.exitAt == null).length, 2);
  // zoomed out: only the water's story stays
  const wide = N.update(ctx(101 + TUNE.gap, { ppu: 5 })).filter((n) => n.exitAt == null);
  assert.deepEqual(wide.map((n) => n.type), ['heat']);
  assert.equal(N.eventMask(5) & (1 << EV.bite), 0);
  assert.notEqual(N.eventMask(80) & (1 << EV.bite), 0);
});

test('a coarse step\'s bite names no grazer: it goes to the nearest in reach whose last meal was that species', () => {
  const N = notes();
  const cells = [];
  for (let k = 0; k < 5; k++) cells.push({ id: 20 + k, x: 30 + 0.1 * k, y: 30, kind: Wd });
  // two of Prey that last ate Weed, beside the plants; a Hunter that last ate Weed too, but out of reach; a Prey that ate nothing
  cells.push({ id: 1, x: 30.3, y: 30.2, kind: P, img: Wd }, { id: 2, x: 30.1, y: 29.8, kind: P, img: Wd }, { id: 3, x: 33, y: 30, kind: H, img: Wd }, { id: 4, x: 30.05, y: 30, kind: P });
  N.ingest(scan(cells));
  const bites = Array.from({ length: 5 }, (_, k) => ({ ev: 'bite', kind: Wd, id: 20 + k, x: 30 + 0.1 * k, y: 30, tick: 600 + k }));
  N.ingest(scan(cells, { simTime: 10.2, tick: 612, ring: ring(bites, 5) }));
  const on = N.update(ctx(100));
  assert.equal(on.length, 1);
  assert.equal(on[0].data.akind, P);
  assert.equal(on[0].data.bites, 5);
});

test('a crowd biting faster than the ring is read: a share of bites is asked for, and each written counts for those left out', () => {
  const N = notes();
  const cells = [];
  for (let k = 0; k < 5; k++) cells.push({ id: 10 + k, x: 30 + k, y: 30, kind: P }, { id: 20 + k, x: 30 + k, y: 31, kind: Wd });
  N.ingest(scan(cells));
  // more than half the ring in one read: half as many bites asked for next
  N.ingest(scan(cells, { simTime: 10.1, ring: ring([], NOTE_MAX) }));
  assert.equal(N.biteKeep, 0.5);
  // read at a quarter: each bite stands for four
  const bites = Array.from({ length: 3 }, (_, k) => ({ ev: 'bite', kind: Wd, akind: P, id: 20 + k, aid: 10 + k, x: 30, y: 31, tick: 600 }));
  const s = scan(cells, { simTime: 10.2, ring: ring(bites, NOTE_MAX + 3) });
  s.biteKeep = 0.25;
  N.ingest(s);
  const on = N.update(ctx(100));
  assert.equal(on[0].type, 'graze');
  assert.equal(on[0].data.bites, 12);
  // a quiet read asks for more again
  assert.ok(N.biteKeep > 0.5);
});
