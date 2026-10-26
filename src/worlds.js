// Saved worlds. A world is the engine's state (eng.readState: the GPU buffers that hold every
// particle, genome, intent and the ledger, with the clock, light, tides and currents) and the page's
// own record of it (names and lineages, the chronicle, the history, the climate's eras), written as one
// gzipped file. The page keeps them in this browser's IndexedDB; a file downloaded from there opens
// on any device with WebGPU.
//
// The file: 'TMWS', a u32 length, a JSON head ({ version, meta, cpu, sizes, cols, page }), then each GPU
// buffer's bytes in the order of sizes. The head keeps Maps and typed arrays (see pack). Files before
// versions ('TMW1', 'TMW2') are worlds of an older format.
//
// A buffer of fixed-size records (the particles, their intents) is kept by columns: each word of
// every record together, and where cols says so, a column's bytes in planes (every record's first
// byte, then every second...), which gzip finds far more alike than records side by side. Floats
// may lose low mantissa bits on the way (encodeWorld's layout), invisible in a world that is never
// bit-reproducible anyway, and the zeros compress. docs/desktop.md has the sizes.

/**
 * The save format's version, MAJOR.MINOR.PATCH (semver), kept in each file's head and its meta.
 *   major: a change older versions cannot read, or this one can no longer read older saves by (a
 *     buffer's layout, what readState keeps, how a column is coded, what the page's record means).
 *     A save opens only in a version of its own major.
 *   minor: something added that a version of the same major can do without (a head field, a buffer it
 *     does not know, both ignored); a save opens in any version of its major, older or newer.
 *   patch: a fix that changes nothing a reader sees.
 * Bump it with every change to the format (docs/desktop.md).
 */
export const SAVE_VERSION = '4.0.0';
const MAGIC = [0x54, 0x4d, 0x57, 0x53]; // TMWS, for every version
const major = (v) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? +v.split('.')[0] : null);

/**
 * Whether this version opens a save of version v (meta.version, or the head's): 'ok', 'newer' (a later
 * major: the save needs a newer Tidemote) or 'older' (an earlier major, or a save from before versions).
 */
export function openable(v) {
  const m = major(v), mine = major(SAVE_VERSION);
  return m == null || m < mine ? 'older' : m > mine ? 'newer' : 'ok';
}
export const WHY_NOT = {
  newer: 'This world was saved by a newer version of Tidemote. Update Tidemote to open it.',
  older: 'This world was saved by an older version of Tidemote, which this one can no longer open.',
};
const TYPED = { Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Int16Array, Uint8Array, Int8Array };

/** JSON that keeps Maps and typed arrays (shared references come back as copies). */
export const pack = (v) => JSON.stringify(v, (_, x) => (x instanceof Map ? { $map: [...x] }
  : ArrayBuffer.isView(x) && x.constructor.name in TYPED ? { $ta: x.constructor.name, v: Array.from(x) } : x));
export const unpack = (s) => JSON.parse(s, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? (x.$map ? new Map(x.$map) : x.$ta ? TYPED[x.$ta].from(x.v) : x) : x));

const pipe = async (blob, stream) => new Uint8Array(await new Response(blob.stream().pipeThrough(stream)).arrayBuffer());

/**
 * Positions (the first two words of each record, floats in a grid of gw x gh units) as the unit cell
 * each lies in, kept as the change from the record before (records lying mostly sorted by cell, it
 * is nearly always 0), and the place within the cell to 2^-bits of a unit, x and y in one word.
 */
function toCells(u, words, { grid: [gw, gh], bits }) {
  const f = new Float32Array(u.buffer), n = u.length / words, s = 1 << bits, X = gw * s, Y = gh * s;
  // a place comes back exactly as a float only while the grid in fixed point fits its 24 bits
  if (bits > 16 || Math.max(X, Y) > 2 ** 24) throw new Error(`positions of a ${gw} x ${gh} grid do not fit ${bits} bits`);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const o = i * words;
    let x = Math.round(f[o] * s) % X, y = Math.round(f[o + 1] * s) % Y;
    if (!(x >= 0)) x = x < 0 ? x + X : 0;
    if (!(y >= 0)) y = y < 0 ? y + Y : 0;
    const c = (y >> bits) * gw + (x >> bits);
    u[o] = (c - prev) >>> 0;
    u[o + 1] = ((x & (s - 1)) | ((y & (s - 1)) << 16)) >>> 0;
    prev = c;
  }
}
function fromCells(u, words, { grid: [gw], bits }) {
  const f = new Float32Array(u.buffer), n = u.length / words, s = 1 << bits;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const o = i * words, at = u[o + 1];
    c = (c + (u[o] | 0)) | 0;
    const cx = c % gw, cy = (c - cx) / gw;
    f[o] = (cx * s + (at & 0xffff)) / s;
    f[o + 1] = (cy * s + (at >>> 16)) / s;
  }
}

/**
 * Records of `words` u32 words as columns: word by word, each column cut to keep[w] mantissa bits (23
 * or more: as it is) and, where planes[w], laid out byte by byte; with cell, the first two words a
 * position kept by its cell (toCells). fromColumns undoes all but the cuts.
 */
export function toColumns(buf, { words, keep = [], planes = [], cell = null }) {
  let u = new Uint32Array(buf);
  const n = u.length / words, out = new Uint8Array(buf.byteLength);
  if (cell) { u = u.slice(); toCells(u, words, cell); }
  const col = new Uint32Array(n), cb = new Uint8Array(col.buffer);
  for (let w = 0; w < words; w++) {
    const k = keep[w] ?? 32, mask = k >= 23 ? 0xffffffff : (0xffffffff << (23 - k)) >>> 0;
    for (let i = 0; i < n; i++) col[i] = u[i * words + w] & mask;
    const at = w * n * 4;
    if (planes[w]) for (let j = 0; j < 4; j++) { const o = at + j * n; for (let i = 0; i < n; i++) out[o + i] = cb[i * 4 + j]; }
    else out.set(cb, at);
  }
  return out;
}
export function fromColumns(bytes, { words, planes = [], cell = null }) {
  const n = bytes.byteLength / 4 / words, u = new Uint32Array(n * words);
  const col = new Uint32Array(n), cb = new Uint8Array(col.buffer);
  for (let w = 0; w < words; w++) {
    const at = w * n * 4;
    if (planes[w]) for (let j = 0; j < 4; j++) { const o = at + j * n; for (let i = 0; i < n; i++) cb[i * 4 + j] = bytes[o + i]; }
    else cb.set(bytes.subarray(at, at + n * 4));
    for (let i = 0; i < n; i++) u[i * words + w] = col[i];
  }
  if (cell) fromCells(u, words, cell);
  return u.buffer;
}

/**
 * One world as file bytes: meta describes it for a list, page is the page's record (any value pack
 * keeps), layout ({ buffer: { words, keep, planes } }, optional) the buffers kept by columns.
 */
export async function encodeWorld({ meta, cpu, gpu, page, layout = {} }) {
  const sizes = Object.entries(gpu).map(([k, b]) => [k, b.byteLength]);
  const cols = Object.fromEntries(Object.entries(layout).filter(([k]) => gpu[k]).map(([k, l]) => [k, { words: l.words, planes: l.planes || [], ...(l.cell ? { cell: l.cell } : {}) }]));
  const bufs = Object.entries(gpu).map(([k, b]) => (layout[k] ? toColumns(b, layout[k]) : b));
  const head = new TextEncoder().encode(pack({ version: SAVE_VERSION, meta: { ...meta, version: SAVE_VERSION }, cpu, sizes, cols, page }));
  const len = new Uint8Array(new Uint32Array([head.length]).buffer);
  return pipe(new Blob([new Uint8Array(MAGIC), len, head, ...bufs]), new CompressionStream('gzip'));
}

/**
 * decodeWorld(encodeWorld(w)) is w (its floats as cut), its GPU buffers as ArrayBuffers. Throws on a
 * file that is not a world, or one of a version this one cannot open (WHY_NOT).
 */
export async function decodeWorld(data) {
  let b; // a fresh buffer: offsets into it are offsets into b
  try { b = await pipe(new Blob([data]), new DecompressionStream('gzip')); } catch { throw new Error('Not a Tidemote world.'); }
  if (b.length < 8 || MAGIC.slice(0, 3).some((c, i) => b[i] !== c)) throw new Error('Not a Tidemote world.');
  // TMW1 and TMW2: the formats before versions
  if (b[3] !== MAGIC[3]) throw new Error(WHY_NOT.older);
  const n = new DataView(b.buffer).getUint32(4, true);
  const head = unpack(new TextDecoder().decode(b.subarray(8, 8 + n)));
  const can = openable(head.version);
  if (can !== 'ok') throw new Error(WHY_NOT[can]);
  const gpu = {};
  let at = 8 + n;
  for (const [k, size] of head.sizes) {
    if (at + size > b.length) throw new Error('This world’s file is incomplete.');
    gpu[k] = head.cols?.[k] ? fromColumns(b.subarray(at, at + size), head.cols[k]) : b.buffer.slice(at, at + size);
    at += size;
  }
  return { meta: head.meta, cpu: head.cpu, gpu, page: head.page };
}

/**
 * The saves kept in this browser: a list of each one's meta (newest first) and its file bytes,
 * apart, so the list opens without reading the worlds.
 */
export function createWorldStore(name = 'tidemote') {
  let db = null;
  const open = () => (db ??= new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('saves', { keyPath: 'id' });
      r.result.createObjectStore('files');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { db = null; rej(r.error); };
  }));
  async function tx(stores, mode, fn) {
    const t = (await open()).transaction(stores, mode);
    const out = fn(...stores.map((s) => t.objectStore(s)));
    return new Promise((res, rej) => {
      t.oncomplete = () => res(out && 'result' in out ? out.result : out);
      t.onerror = t.onabort = () => rej(t.error || new Error('The browser refused to store the world.'));
    });
  }
  return {
    async list() {
      const all = await tx(['saves'], 'readonly', (s) => s.getAll());
      return all.sort((a, b) => b.savedAt - a.savedAt);
    },
    async put(meta, bytes) {
      // a first save asks the browser to keep this site's storage when space runs short
      navigator.storage?.persist?.().catch(() => {});
      await tx(['saves', 'files'], 'readwrite', (s, f) => { s.put(meta); f.put(bytes, meta.id); });
    },
    get: (id) => tx(['files'], 'readonly', (f) => f.get(id)),
    remove: (id) => tx(['saves', 'files'], 'readwrite', (s, f) => { s.delete(id); f.delete(id); }),
  };
}
