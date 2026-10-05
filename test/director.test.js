import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomPath, flightTime, Interest, Director } from '../src/director.js';
import { SURVEY, SURVEY_WORDS, PICK_WORDS, FIRST_LIFE } from '../src/shaders.js';

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('zoomPath starts and ends at its views and rises between distant close views', () => {
  for (const [a, b] of [
    [{ x: 0, y: 0, w: 5 }, { x: 80, y: 30, w: 8 }],
    [{ x: 10, y: 10, w: 40 }, { x: 10, y: 10, w: 4 }],
    [{ x: 3, y: -2, w: 100 }, { x: 20, y: 5, w: 6 }],
  ]) {
    const p = zoomPath(a, b);
    const s = p.at(0), e = p.at(1);
    assert.ok(near(s.x, a.x) && near(s.y, a.y) && near(s.w, a.w), 'start');
    assert.ok(near(e.x, b.x) && near(e.y, b.y) && near(e.w, b.w), 'end');
    assert.ok(Number.isFinite(p.S) && flightTime(p.S) >= 9 && flightTime(p.S) <= 32);
  }
  const p = zoomPath({ x: 0, y: 0, w: 5 }, { x: 80, y: 0, w: 5 });
  assert.ok(p.at(0.5).w > 15, 'a long move between close views passes high');
});

function fakeSurvey(tx, ty, tile, hot) {
  const data = new Uint32Array(tx * ty * SURVEY_WORDS);
  for (let i = 0; i < tx * ty; i++) {
    const o = i * SURVEY_WORDS;
    data[o + SURVEY.living] = 20;
    data[o + SURVEY.species] = 1;
    data[o + SURVEY.speed] = 20 * 10;
  }
  const o = hot * SURVEY_WORDS;
  data[o + SURVEY.living] = 400; data[o + SURVEY.births] = 50; data[o + SURVEY.kills] = 20;
  data[o + SURVEY.species] = 0xff; data[o + SURVEY.bonded] = 300; data[o + SURVEY.mutations] = 2;
  return { tiles: [tx, ty], tile, grid: [tx * tile, ty * tile], window: 1, simTime: 0, data };
}

test('interest peaks where life is dense, diverse and busy', () => {
  const I = new Interest();
  const hot = 3 * 10 + 6;
  I.ingest(fakeSurvey(10, 6, 5, hot), 1);
  const sc = I.scores();
  let best = 0;
  for (let i = 1; i < sc.length; i++) if (sc[i] > sc[best]) best = i;
  assert.equal(best, hot);
  assert.deepEqual(I.center(hot), [32.5, 17.5]);
});

// A fake page: a 120 x 70 torus, a 1600 px view, picks that return a few cells.
function fakeIO(clock) {
  const W = 120, H = 70;
  const cells = [];
  const r = rng(3);
  for (let i = 0; i < 300; i++) cells.push({ x: r() * W, y: r() * H, vx: (r() - 0.5) * 0.6, vy: (r() - 0.5) * 0.6, id: i + 1 });
  const io = {
    world: () => [W, H],
    widths: () => [1600 / 360, W],
    now: () => clock.t,
    pick: async (center, radius) => {
      const near = cells.filter((c) => Math.hypot(c.x - center[0], c.y - center[1]) < radius);
      const u32 = new Uint32Array(near.length * PICK_WORDS), f32 = new Float32Array(u32.buffer);
      near.forEach((c, k) => {
        const o = k * PICK_WORDS;
        f32[o] = c.x; f32[o + 1] = c.y; f32[o + 2] = c.vx; f32[o + 3] = c.vy;
        u32[o + 4] = FIRST_LIFE; u32[o + 7] = c.id; u32[o + 10] = k % 2 ? 0xffffffff : 1; u32[o + 11] = 0xffffffff;
      });
      return { raw: { u32, f32, count: near.length }, simTime: clock.t };
    },
    predict: (p, t) => [p.x + p.vx * (clock.t - t), p.y + p.vy * (clock.t - t)],
    species: () => null,
    lifespan: () => 100,
  };
  return io;
}

test('the director films for half an hour without a jump', async () => {
  const clock = { t: 0 };
  const io = fakeIO(clock);
  const d = new Director(io, rng(11));
  d.survey(fakeSurvey(24, 14, 5, 100), 1);
  d.start({ x: 60, y: 35, w: 120 });
  const dt = 1 / 60;
  let prev = d.view(), maxStep = 0, maxZoom = 0;
  const seen = new Set();
  for (let f = 0; f < 60 * 60 * 30; f++) {
    clock.t += dt;
    const v = d.update(dt);
    if (d.shot.subject) d.onTrack({ id: d.shot.subject.id, found: true, tracked: d.shot.subject.p, simTime: d.shot.subject.t });
    seen.add(d.shot.type);
    // movement per frame, in view widths, and zoom change per frame
    maxStep = Math.max(maxStep, Math.hypot(v.x - prev.x, v.y - prev.y) / Math.min(v.w, prev.w));
    maxZoom = Math.max(maxZoom, Math.abs(Math.log(v.w / prev.w)));
    const [wMin, wMax] = io.widths();
    assert.ok(v.w >= wMin - 1e-9 && v.w <= wMax + 1e-9);
    prev = v;
    if (f % 30 === 0) await new Promise((r) => setImmediate(r));
  }
  for (const t of ['wide', 'scene', 'follow']) assert.ok(seen.has(t), `filmed a ${t} shot`);
  // never faster than a fifth of the view per second, or a doubling of zoom in 2 s
  assert.ok(maxStep < 0.2 / 60, `pan step ${maxStep}`);
  assert.ok(maxZoom < Math.log(2) / 120, `zoom step ${maxZoom}`);
});

test('a lost subject is lingered on (or flown to, if lost on the way), then the director moves on', async () => {
  const clock = { t: 0 };
  const io = fakeIO(clock);
  const d = new Director(io, rng(5));
  d.survey(fakeSurvey(24, 14, 5, 100), 1);
  d.start({ x: 60, y: 35, w: 30 });
  // lost on the way there, with no kin nearby: the flight goes on to where it was
  d.shot = await d.followShot();
  d.trackId = d.shot.subject.id;
  const pick = io.pick;
  io.pick = async () => ({ raw: { u32: new Uint32Array(0), f32: new Float32Array(0), count: 0 }, simTime: clock.t });
  d.onTrack({ id: d.trackId, found: false });
  await new Promise((r) => setImmediate(r));
  io.pick = pick;
  assert.equal(d.shot.type, 'scene');
  assert.ok(d.shot.why.lost);
  // lost once filmed: linger
  d.shot = await d.followShot();
  d.trackId = d.shot.subject.id;
  d.shot.t = d.shot.flight + 1;
  d.onTrack({ id: d.trackId, found: false });
  assert.equal(d.shot.type, 'linger');
  assert.equal(d.trackId, 0xffffffff);
  for (let i = 0; i < 60 * 10; i++) { clock.t += 1 / 60; d.update(1 / 60); await null; }
  await new Promise((r) => setImmediate(r));
  assert.notEqual(d.shot.type, 'linger');
});

test('a hotspot says why: new variants first, then what dominates', () => {
  const I = new Interest();
  const hot = 3 * 10 + 6;
  I.ingest(fakeSurvey(10, 6, 5, hot), 1);
  const { reasons, div } = I.reasons(hot);
  assert.equal(reasons[0].key, 'mutations');
  const keys = reasons.map((r) => r.key);
  assert.ok(keys.includes('kills') && keys.includes('births') && !keys.includes('deaths'));
  assert.equal(div, 8);
  // a quiet tile has no news to report
  const quiet = I.reasons(0);
  assert.ok(!quiet.reasons.some((r) => r.key === 'mutations' || r.key === 'sparks'));
});

test('shots carry their reasons: scenes learn their species, follows their subject, lingers its fate', async () => {
  const clock = { t: 0 };
  const io = fakeIO(clock);
  io.species = (slot) => ({ serial: 1000 + slot, pop: 10 });
  const d = new Director(io, rng(9));
  d.survey(fakeSurvey(24, 14, 5, 100), 1);
  d.start({ x: 60, y: 35, w: 120 });
  const sc = d.scene();
  assert.equal(sc.why.kind, 'scene');
  assert.ok(sc.why.reasons.length > 0);
  d.shot = sc;
  sc.t = sc.flight;
  d.update(1 / 60);
  await new Promise((r) => setImmediate(r));
  assert.equal(sc.whyVer, 1);
  assert.deepEqual(sc.why.species.map((x) => x.serial), [1000 + FIRST_LIFE]);
  const f = await d.followShot();
  assert.equal(f.why.kind, 'follow');
  assert.equal(f.why.serial, 1000 + FIRST_LIFE);
  assert.ok(f.why.cells >= 1);
  d.shot = f; d.trackId = f.subject.id; f.t = f.flight + 1;
  const husk = { ...f.subject.p, kind: 2, cause: 3 };
  d.onTrack({ id: f.subject.id, found: true, tracked: husk, simTime: 1 });
  assert.equal(d.shot.why.kind, 'linger');
  assert.equal(d.shot.why.fate, husk);
  assert.equal(d.shot.why.serial, 1000 + FIRST_LIFE);
});

test('a followed body outlives its cells: the camera moves to another of them', async () => {
  const clock = { t: 0 };
  const io = fakeIO(clock);
  const d = new Director(io, rng(4));
  d.survey(fakeSurvey(24, 14, 5, 100), 1);
  d.start({ x: 60, y: 35, w: 30 });
  const f = await d.followShot();
  f.why.cells = 5; f.t = f.flight + 1;
  d.shot = f; d.trackId = f.subject.id;
  const first = f.subject.id;
  // a cell bonded into the same body, beside the one that dies
  io.pick = async () => {
    const u32 = new Uint32Array(PICK_WORDS), f32 = new Float32Array(u32.buffer);
    f32[0] = f.subject.p.x + 0.3; f32[1] = f.subject.p.y; u32[4] = FIRST_LIFE; u32[7] = 9999; u32[10] = first; u32[11] = 0xffffffff;
    return { raw: { u32, f32, count: 1 }, simTime: clock.t };
  };
  d.onTrack({ id: first, found: true, tracked: { ...f.subject.p, kind: 2, cause: 1 }, simTime: 1 });
  assert.equal(d.trackId, 0xffffffff);
  await new Promise((r) => setImmediate(r));
  assert.equal(d.shot, f, 'still the same take');
  assert.equal(f.subject.id, 9999);
  assert.equal(d.trackId, f.subject.id);
});

test('a lone cell lost on the way is swapped for a kin nearby; once filmed, its death is shown', async () => {
  const clock = { t: 0 };
  const io = fakeIO(clock);
  const d = new Director(io, rng(4));
  d.survey(fakeSurvey(24, 14, 5, 100), 1);
  d.start({ x: 60, y: 35, w: 30 });
  const f = await d.followShot();
  f.why.cells = 1;
  d.shot = f; d.trackId = f.subject.id;
  io.pick = async () => {
    const u32 = new Uint32Array(PICK_WORDS), f32 = new Float32Array(u32.buffer);
    f32[0] = f.subject.p.x + 1; f32[1] = f.subject.p.y; u32[4] = FIRST_LIFE; u32[7] = 4242; u32[10] = u32[11] = 0xffffffff;
    return { raw: { u32, f32, count: 1 }, simTime: clock.t };
  };
  d.onTrack({ id: f.subject.id, found: false });
  await new Promise((r) => setImmediate(r));
  assert.equal(d.shot, f);
  assert.equal(f.subject.id, 4242);
  f.t = f.flight + 1;
  d.onTrack({ id: 4242, found: true, tracked: { ...f.subject.p, kind: 0, cause: 3 }, simTime: 2 });
  assert.equal(d.shot.why.kind, 'linger');
});
