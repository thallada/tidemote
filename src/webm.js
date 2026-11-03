// A film's WebM made whole as it is written (docs/film.md). MediaRecorder writes WebM live: a segment
// of unknown size, no duration and no index of where its keyframes lie, so players show no length and
// seek by reading up to the time asked. createWebmFix() takes the recorder's bytes in order and hands
// back what to write: the head (the segment's start) rewritten once, with room kept for a duration and
// for a pointer to an index, then every later byte as it came while it notes where each cluster starts
// and where the video's keyframes fall. end() gives the index (Cues) to write after the last byte and
// the few bytes to write over the head: the duration and the pointer. (The segment keeps its unknown
// size: its clusters have unknown sizes too, which a sized segment may not hold.) Until end() the
// file written is a live WebM as before (the room kept is Void, which readers skip), so a film cut off
// partway still plays.
//
// Pure: no DOM, tested in test/webm.test.js. Anything it cannot read (another layout, unknown sizes where
// it needs them) sends it to passing bytes through untouched (`ok` false), never to a broken file.

const ID = { EBML: 0x1a45dfa3, Segment: 0x18538067, SeekHead: 0x114d9b74,
  Info: 0x1549a966, TimecodeScale: 0x2ad7b1, Duration: 0x4489, Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackType: 0x83,
  Cluster: 0x1f43b675, Timecode: 0xe7, SimpleBlock: 0xa3, Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3,
  CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1, Void: 0xec, Tags: 0x1254c367 };
const LEVEL1 = new Set([ID.SeekHead, ID.Info, ID.Tracks, ID.Cluster, ID.Cues, ID.Tags, ID.Void, 0x1941a469 /* Attachments */, 0x1043a770 /* Chapters */]);
const UNKNOWN = -1;

/** An element header at b[i]: { id, size (UNKNOWN when all ones), len (header bytes) }, or null if b ends first. */
export function readHeader(b, i) {
  if (i >= b.length) return null;
  const f = b[i];
  const il = f >= 0x80 ? 1 : f >= 0x40 ? 2 : f >= 0x20 ? 3 : f >= 0x10 ? 4 : 0;
  if (!il) throw new Error('bad element id');
  if (i + il >= b.length) return null;
  let id = 0;
  for (let k = 0; k < il; k++) id = id * 256 + b[i + k];
  const s0 = b[i + il];
  let sl = 1;
  while (sl <= 8 && !(s0 & (0x80 >> (sl - 1)))) sl++;
  if (sl > 8) throw new Error('bad element size');
  if (i + il + sl > b.length) return null;
  let size = s0 & (0xff >> sl), ones = size === (0xff >> sl);
  for (let k = 1; k < sl; k++) { const v = b[i + il + k]; size = size * 256 + v; ones = ones && v === 0xff; }
  return { id, size: ones ? UNKNOWN : size, len: il + sl };
}

const idBytes = (id) => { const o = []; for (let v = id; v > 0; v = Math.floor(v / 256)) o.unshift(v & 255); return o; };
/** A size as an EBML vint of `len` bytes (8 by default: room for any size, so it can be written over later). */
const uintBytes = (n, len = 8) => { const o = new Array(len); for (let k = len - 1; k >= 0; k--) { o[k] = n % 256; n = Math.floor(n / 256); } return o; };
const sizeBytes = (n, len = 8) => { const o = uintBytes(n, len); o[0] |= 0x80 >> (len - 1); return o; };
const minUint = (n) => { const o = []; do { o.unshift(n % 256); n = Math.floor(n / 256); } while (n > 0); return o; };
const el = (id, body) => [...idBytes(id), ...sizeBytes(body.length, body.length < 127 ? 1 : 8), ...body];
const readUint = (b, i, n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + b[i + k]; return v; };
/** A Void element `n` bytes long in all (n >= 2). */
const voidOf = (n) => [ID.Void, 0x80 | (n - 2), ...new Array(n - 2).fill(0)];
const SEEK_LEN = 21; // a Seek to one element with an 8-byte position, whole: 4DBB 93 | 53AB 84 id4 | 53AC 88 pos8
const seekOf = (id, pos) => [0x4d, 0xbb, 0x80 | 18, 0x53, 0xab, 0x84, ...idBytes(id), 0x53, 0xac, 0x88, ...uintBytes(pos)];
const DUR_LEN = 11; // Duration as a float64, whole: 4489 88 f8
const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

export function createWebmFix() {
  let mode = 'head'; // head (gathering it) | body (passing bytes, reading as they pass) | raw (untouched)
  let head = []; // the bytes gathered before the first cluster, as chunks
  let written = 0; // bytes handed out so far
  let segStart = 0; // the file offset where the segment's data begins
  let scale = 1e6, video = 1, durAt = -1, cuesSeekAt = -1;
  // reading the body: where each element starts (a segment position), and what is still to skip
  let pend = new Uint8Array(0); // bytes held back to read a header across chunk ends
  let skip = 0; // payload bytes still to pass before the next header
  let cluster = null; // { pos, end (its end's position, or UNKNOWN), time }
  let lastTime = 0;
  const cues = [];
  let lastCue = -Infinity;
  let block = null; // a SimpleBlock whose first bytes are still to read: { cluster, size }

  const segPos = () => written - segStart;
  const joined = () => (head.length === 1 ? head[0] : head.reduce(concat, new Uint8Array(0)));

  function rewriteHead(b) {
    // EBML header, then the segment's header, then its level-1 elements up to the first cluster
    const eh = readHeader(b, 0);
    if (!eh || eh.id !== ID.EBML || eh.size === UNKNOWN) return null;
    let i = eh.len + eh.size;
    const sh = readHeader(b, i);
    if (!sh || sh.id !== ID.Segment) return null;
    const out = [...b.subarray(0, i)];
    out.push(...idBytes(ID.Segment), 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff); // unknown size
    segStart = out.length;
    i += sh.len;
    // our SeekHead: Info, Tracks, and room for Cues
    const kept = []; // [id, bytes]
    let firstCluster = -1;
    while (i < b.length) {
      const h = readHeader(b, i);
      if (!h) return null;
      if (h.id === ID.Cluster) { firstCluster = i; break; }
      if (h.size === UNKNOWN) return null;
      const body = b.subarray(i + h.len, i + h.len + h.size);
      if (h.id === ID.Info) {
        const inner = [];
        for (let j = 0; j < body.length;) {
          const c = readHeader(body, j);
          if (!c) return null;
          if (c.id === ID.TimecodeScale) scale = readUint(body, j + c.len, c.size);
          if (c.id !== ID.Duration) inner.push(...body.subarray(j, j + c.len + c.size));
          j += c.len + c.size;
        }
        kept.push([ID.Info, inner]);
      } else if (h.id === ID.Tracks) {
        for (let j = 0; j < body.length;) {
          const t = readHeader(body, j);
          if (!t) return null;
          if (t.id === ID.TrackEntry) {
            let num = 0, type = 0;
            for (let k = j + t.len; k < j + t.len + t.size;) {
              const c = readHeader(body, k);
              if (!c) return null;
              if (c.id === ID.TrackNumber) num = readUint(body, k + c.len, c.size);
              if (c.id === ID.TrackType) type = readUint(body, k + c.len, c.size);
              k += c.len + c.size;
            }
            if (type === 1) video = num;
          }
          j += t.len + t.size;
        }
        kept.push([ID.Tracks, [...b.subarray(i, i + h.len + h.size)]]);
      } else if (h.id !== ID.SeekHead && h.id !== ID.Void && h.id !== ID.Cues) kept.push([h.id, [...b.subarray(i, i + h.len + h.size)]]);
      i += h.len + h.size;
    }
    if (firstCluster < 0) return null;
    // lay out: SeekHead (3 seeks), then the kept elements in order (Info with its duration's room)
    const seekBody = 3 * SEEK_LEN, seekHeadLen = 4 + 1 + seekBody;
    const pieces = kept.map(([id, bytes]) => (id === ID.Info ? [...idBytes(ID.Info), ...sizeBytes(bytes.length + DUR_LEN), ...bytes, ...voidOf(DUR_LEN)] : bytes));
    let pos = seekHeadLen;
    const at = {};
    kept.forEach(([id], k) => { if (at[id] == null) at[id] = pos; pos += pieces[k].length; });
    if (at[ID.Info] == null || at[ID.Tracks] == null) return null;
    out.push(...idBytes(ID.SeekHead), 0x80 | seekBody, ...seekOf(ID.Info, at[ID.Info]), ...seekOf(ID.Tracks, at[ID.Tracks]));
    cuesSeekAt = out.length;
    out.push(...voidOf(SEEK_LEN));
    kept.forEach(([id], k) => {
      if (id === ID.Info) durAt = out.length + pieces[k].length - DUR_LEN;
      out.push(...pieces[k]);
    });
    return { head: Uint8Array.from(out), rest: b.subarray(firstCluster) };
  }

  // read the body's elements as they pass: clusters, their timecodes, the video's keyframes
  function read(b) {
    let i = 0;
    const base = segPos() - pend.length; // the segment position of buf[0]
    const buf = pend.length ? concat(pend, b) : b;
    pend = new Uint8Array(0);
    const posOf = (k) => base + k;
    while (i < buf.length) {
      if (skip > 0) { const n = Math.min(skip, buf.length - i); skip -= n; i += n; continue; }
      if (block) {
        // a block's first bytes: track (a vint), timecode (int16), flags
        if (buf.length - i < 4) { pend = buf.slice(i); return; }
        const tl = buf[i] >= 0x80 ? 1 : buf[i] >= 0x40 ? 2 : 3;
        if (buf.length - i < tl + 3) { pend = buf.slice(i); return; }
        let track = buf[i] & (0xff >> tl);
        for (let k = 1; k < tl; k++) track = track * 256 + buf[i + k];
        let rel = buf[i + tl] * 256 + buf[i + tl + 1];
        if (rel > 32767) rel -= 65536;
        const key = (buf[i + tl + 2] & 0x80) !== 0;
        const t = block.cluster.time + rel;
        if (t > lastTime) lastTime = t;
        if (key && track === video && t - lastCue >= 500e6 / scale) { cues.push([t, block.cluster.pos]); lastCue = t; }
        skip = block.size; block = null; continue; // the whole block, from its first byte
      }
      if (cluster && cluster.end !== UNKNOWN && posOf(i) >= cluster.end) cluster = null;
      const h = (() => { try { return readHeader(buf, i); } catch { return undefined; } })();
      if (h === undefined) { mode = 'raw'; return; }
      if (!h) { pend = buf.slice(i); return; }
      if (h.id === ID.Cluster) {
        cluster = { pos: posOf(i), end: h.size === UNKNOWN ? UNKNOWN : posOf(i) + h.len + h.size, time: 0 };
        i += h.len; continue;
      }
      if (cluster && h.id === ID.Timecode) {
        if (buf.length - i < h.len + h.size) { pend = buf.slice(i); return; }
        cluster.time = readUint(buf, i + h.len, h.size);
        i += h.len + h.size; continue;
      }
      if (cluster && h.id === ID.SimpleBlock) { block = { cluster, size: h.size }; i += h.len; continue; }
      if (h.size === UNKNOWN) { mode = 'raw'; return; }
      if (LEVEL1.has(h.id)) cluster = null;
      skip = h.size; i += h.len;
    }
  }

  return {
    get ok() { return mode !== 'raw'; },
    /** The recorder's next bytes: returns the bytes to write next, in order (the same array when unchanged). */
    push(b) {
      if (mode === 'raw') return [b];
      if (mode === 'head') {
        head.push(b);
        const all = joined();
        let r;
        try { r = rewriteHead(all); } catch { r = null; }
        if (!r) {
          // not yet a whole head: wait for more (up to a few MB), else give up and pass it all through
          if (all.length < 4e6) return [];
          mode = 'raw'; head = []; written += all.length; return [all];
        }
        head = [];
        mode = 'body';
        written += r.head.length;
        if (r.rest.length) { read(r.rest); written += r.rest.length; }
        return r.rest.length ? [r.head, r.rest] : [r.head];
      }
      read(b);
      written += b.length;
      return [b];
    },
    /** Bytes handed out so far. */
    get bytes() { return written + (mode === 'head' ? head.reduce((s, x) => s + x.length, 0) : 0); },
    /**
     * The recording ended: { tail (bytes to write after the last), patches: [{ at, bytes }] to write over the head },
     * or null when the file cannot be mended (it is then left as written, a live WebM).
     */
    end(frameNs = 1e9 / 30) {
      if (mode === 'head' && head.length) return { tail: joined(), patches: [] };
      if (mode !== 'body') return null;
      const cuesPos = segPos();
      const points = [];
      for (const [t, pos] of cues) points.push(...el(ID.CuePoint, [...el(ID.CueTime, minUint(t)), ...el(ID.CueTrackPositions, [...el(ID.CueTrack, minUint(video)), ...el(ID.CueClusterPosition, minUint(pos))])]));
      const tail = cues.length ? Uint8Array.from([...idBytes(ID.Cues), ...sizeBytes(points.length), ...points]) : new Uint8Array(0);
      const dur = new Uint8Array(8);
      new DataView(dur.buffer).setFloat64(0, lastTime + frameNs / scale);
      const patches = [{ at: durAt, bytes: Uint8Array.from([0x44, 0x89, 0x88, ...dur]) }];
      if (cues.length) patches.push({ at: cuesSeekAt, bytes: Uint8Array.from(seekOf(ID.Cues, cuesPos)) });
      return { tail, patches, duration: (lastTime * scale + frameNs) / 1e9, cues: cues.length };
    },
  };
}
