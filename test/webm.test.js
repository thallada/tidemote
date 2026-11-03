// src/webm.js: a live WebM (as MediaRecorder writes it) mended as it streams: a duration, a SeekHead
// that points where its elements are, Cues at the video's keyframes; the same whatever the chunking.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWebmFix, readHeader } from '../src/webm.js';

const ids = (id) => { const o = []; for (let v = id; v > 0; v = Math.floor(v / 256)) o.unshift(v & 255); return o; };
const sz = (n) => [0x08, 0, 0, 0, 0, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].map((v, i) => (i === 0 ? 0x01 : v)); // 8-byte size
const el = (id, body) => [...ids(id), ...sz(body.length), ...body];
const UNK = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const uint = (n, len) => { const o = []; for (let k = 0; k < len; k++) o.unshift((n >> (8 * k)) & 255); return o; };
const block = (track, rel, key, n) => el(0xa3, [0x80 | track, (rel >> 8) & 255, rel & 255, key ? 0x80 : 0, ...new Array(n).fill(7)]);

/** A WebM as Chrome's recorder lays it out: unknown-size segment and clusters, ms timecodes, two tracks. */
function liveWebm(clusters = 6) {
  const out = [...el(0x1a45dfa3, [...el(0x4282, [...'webm'].map((c) => c.charCodeAt(0)))]), ...ids(0x18538067), ...UNK];
  out.push(...el(0x1549a966, [...el(0x2ad7b1, uint(1e6, 3)), ...el(0x4d80, [...'Chrome'].map((c) => c.charCodeAt(0)))]));
  out.push(...el(0x1654ae6b, [...el(0xae, [...el(0xd7, [1]), ...el(0x83, [2])]), ...el(0xae, [...el(0xd7, [2]), ...el(0x83, [1])])]));
  const clusterAt = [];
  for (let c = 0; c < clusters; c++) {
    clusterAt.push(out.length);
    out.push(...ids(0x1f43b675), ...UNK, ...el(0xe7, uint(c * 3000, 2)));
    for (let f = 0; f < 90; f++) {
      out.push(...block(2, f * 33, f === 0, 300 + ((f * 37) % 200))); // video: a keyframe first
      if (f % 3 === 0) out.push(...block(1, f * 33 + 5, true, 120)); // audio: every block a "keyframe"
    }
  }
  return { bytes: Uint8Array.from(out), clusterAt, lastMs: (clusters - 1) * 3000 + 89 * 33 }; // the last video block
}

/** Runs the fix over `src` cut into chunks of `step` bytes: the file it writes. */
function mend(src, step) {
  const fx = createWebmFix(), parts = [];
  for (let i = 0; i < src.length; i += step) parts.push(...fx.push(src.subarray(i, i + step)));
  const e = fx.end();
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0) + e.tail.length);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  out.set(e.tail, o);
  for (const p of e.patches) out.set(p.bytes, p.at);
  assert.equal(fx.ok, true);
  assert.equal(fx.bytes + e.tail.length, out.length, 'bytes counts what was written');
  return { out, e };
}

/** The segment's level-1 elements: [{ id, pos (in the segment), at (in the file), h }]. */
function level1(b) {
  const eh = readHeader(b, 0), segAt = eh.len + eh.size, sh = readHeader(b, segAt), start = segAt + sh.len;
  const els = [];
  for (let i = start; i < b.length;) {
    const h = readHeader(b, i);
    els.push({ id: h.id, pos: i - start, at: i, h });
    if (h.size < 0) { // an unknown-size cluster: to the next level-1 id
      let j = i + h.len;
      for (;;) { const c = readHeader(b, j); if (!c || c.id === 0x1f43b675 || c.id === 0x1c53bb6b) break; j += c.len + c.size; }
      i = j;
    } else i += h.len + h.size;
  }
  return { start, els };
}
const children = (b, at, h) => { const o = []; for (let i = at + h.len; i < at + h.len + h.size;) { const c = readHeader(b, i); o.push({ ...c, at: i }); i += c.len + c.size; } return o; };
const uintAt = (b, i, n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + b[i + k]; return v; };

test('a live WebM gains a duration, a SeekHead that points true, and Cues at its keyframes', () => {
  const { bytes, lastMs } = liveWebm();
  const { out, e } = mend(bytes, bytes.length);
  const { els } = level1(out);
  assert.deepEqual(els.slice(0, 3).map((x) => x.id), [0x114d9b74, 0x1549a966, 0x1654ae6b]);
  assert.equal(els.at(-1).id, 0x1c53bb6b, 'Cues last');
  // the SeekHead: each Seek's position is where that element is
  const seeks = children(out, els[0].at, els[0].h).filter((c) => c.id === 0x4dbb);
  assert.equal(seeks.length, 3);
  for (const s of seeks) {
    const [sid, spos] = children(out, s.at, s);
    const id = uintAt(out, sid.at + sid.len, sid.size), pos = uintAt(out, spos.at + spos.len, spos.size);
    assert.equal(els.find((x) => x.pos === pos)?.id, id);
  }
  // the duration, in ms (the timecode scale), a frame past the last block
  const dur = children(out, els[1].at, els[1].h).find((c) => c.id === 0x4489);
  const ms = new DataView(out.buffer, dur.at + dur.len, 8).getFloat64(0);
  assert.ok(Math.abs(ms - (lastMs + 1000 / 30)) < 1e-6, String(ms));
  assert.ok(Math.abs(e.duration - ms / 1000) < 1e-9);
  // a cue per cluster (its keyframe), each at a cluster, its time the cluster's
  const clusters = els.filter((x) => x.id === 0x1f43b675);
  const cues = children(out, els.at(-1).at, els.at(-1).h);
  assert.equal(cues.length, clusters.length);
  cues.forEach((cp, k) => {
    const [t, tp] = children(out, cp.at, cp);
    assert.equal(uintAt(out, t.at + t.len, t.size), k * 3000);
    const [track, cpos] = children(out, tp.at, tp);
    assert.equal(uintAt(out, track.at + track.len, track.size), 2, 'the video track');
    assert.equal(uintAt(out, cpos.at + cpos.len, cpos.size), clusters[k].pos);
  });
});

test('the same file however the bytes arrive, and every cluster passed through as it came', () => {
  const { bytes, clusterAt } = liveWebm();
  const whole = mend(bytes, bytes.length).out;
  for (const step of [1, 7, 4096, 65536]) assert.deepEqual(mend(bytes, step).out, whole, `in chunks of ${step}`);
  const body = bytes.subarray(clusterAt[0]);
  const { els } = level1(whole);
  const c0 = els.find((x) => x.id === 0x1f43b675).at;
  assert.deepEqual(whole.subarray(c0, c0 + body.length), body);
});

test('until it ends, the file written is a playable live WebM (its room kept as Void)', () => {
  const { bytes } = liveWebm();
  const fx = createWebmFix(), parts = [];
  parts.push(...fx.push(bytes));
  const b = parts[0];
  const { els } = level1(Uint8Array.from([...b, ...parts.slice(1).flatMap((p) => [...p])]));
  const info = els.find((x) => x.id === 0x1549a966);
  assert.equal(children(b, info.at, info.h).at(-1).id, 0xec, 'Void where the duration goes');
  assert.ok(!children(b, info.at, info.h).some((c) => c.id === 0x4489));
});

test('not WebM: passed through untouched', () => {
  const junk = Uint8Array.from({ length: 5e6 }, (_, i) => (i * 31) & 255);
  junk[0] = 0x00;
  const fx = createWebmFix();
  let out = 0;
  for (let i = 0; i < junk.length; i += 1e6) for (const p of fx.push(junk.subarray(i, i + 1e6))) out += p.length;
  assert.equal(out, junk.length);
  assert.equal(fx.ok, false);
  assert.equal(fx.end(), null);
});

// a film Chrome recorded (tools/film-check.mjs), where one is at hand
const real = 'runs/film/smoke/laptop.webm';
test('a film Chrome recorded: Cues at its keyframes, a duration near its length', { skip: !fs.existsSync(real) }, () => {
  const src = new Uint8Array(fs.readFileSync(real));
  const { out, e } = mend(src, 1 << 20);
  assert.ok(e.cues >= 5, `${e.cues} cues`);
  assert.ok(e.duration > 55 && e.duration < 65, String(e.duration));
  assert.equal(level1(out).els.at(-1).id, 0x1c53bb6b);
});
