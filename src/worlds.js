// Saved worlds. A world is the engine's state (eng.readState: the GPU buffers that hold every
// particle, genome, intent and the ledger, with the clock, light, tides and currents) and the page's
// own record of it (names and lineages, the chronicle, the history, the climate's eras), written as one
// gzipped file. The page keeps them in this browser's IndexedDB; a file downloaded from there opens
// on any device with WebGPU.
//
// The file: 'TMW2', a u32 length, a JSON head ({ format, meta, cpu, sizes, cols, page }), then each GPU
// buffer's bytes in the order of sizes. The head keeps Maps and typed arrays (see pack).
//
// A buffer of fixed-size records (the particles, their intents) is kept by columns: each word of
// every record together, and where cols says so, a column's bytes in planes (every record's first
// byte, then every second...), which gzip finds far more alike than records side by side. Floats
// may lose low mantissa bits on the way (encodeWorld's layout), invisible in a world that is never
// bit-reproducible anyway, and the zeros compress. docs/desktop.md has the sizes.

export const FORMAT = 2;
const MAGIC = [0x54, 0x4d, 0x57, 0x32]; // TMW2
const TYPED = { Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Int16Array, Uint8Array, Int8Array };

/** JSON that keeps Maps and typed arrays (shared references come back as copies). */
export const pack = (v) => JSON.stringify(v, (_, x) => (x instanceof Map ? { $map: [...x] }
  : ArrayBuffer.isView(x) && x.constructor.name in TYPED ? { $ta: x.constructor.name, v: Array.from(x) } : x));
export const unpack = (s) => JSON.parse(s, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? (x.$map ? new Map(x.$map) : x.$ta ? TYPED[x.$ta].from(x.v) : x) : x));

const pipe = async (blob, stream) => new Uint8Array(await new Response(blob.stream().pipeThrough(stream)).arrayBuffer());

/**
 * Records of `words` u32 words as columns: word by word, each column cut to keep[w] mantissa bits (23
 * or more: as it is) and, where planes[w], laid out byte by byte. fromColumns undoes all but the cut.
 */
export function toColumns(buf, { words, keep = [], planes = [] }) {
  const u = new Uint32Array(buf), n = u.length / words, out = new Uint8Array(buf.byteLength);
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
export function fromColumns(bytes, { words, planes = [] }) {
  const n = bytes.byteLength / 4 / words, u = new Uint32Array(n * words);
  const col = new Uint32Array(n), cb = new Uint8Array(col.buffer);
  for (let w = 0; w < words; w++) {
    const at = w * n * 4;
    if (planes[w]) for (let j = 0; j < 4; j++) { const o = at + j * n; for (let i = 0; i < n; i++) cb[i * 4 + j] = bytes[o + i]; }
    else cb.set(bytes.subarray(at, at + n * 4));
    for (let i = 0; i < n; i++) u[i * words + w] = col[i];
  }
  return u.buffer;
}

/**
 * One world as file bytes: meta describes it for a list, page is the page's record (any value pack
 * keeps), layout ({ buffer: { words, keep, planes } }, optional) the buffers kept by columns.
 */
export async function encodeWorld({ meta, cpu, gpu, page, layout = {} }) {
  const sizes = Object.entries(gpu).map(([k, b]) => [k, b.byteLength]);
  const cols = Object.fromEntries(Object.entries(layout).filter(([k]) => gpu[k]).map(([k, l]) => [k, { words: l.words, planes: l.planes || [] }]));
  const bufs = Object.entries(gpu).map(([k, b]) => (layout[k] ? toColumns(b, layout[k]) : b));
  const head = new TextEncoder().encode(pack({ format: FORMAT, meta, cpu, sizes, cols, page }));
  const len = new Uint8Array(new Uint32Array([head.length]).buffer);
  return pipe(new Blob([new Uint8Array(MAGIC), len, head, ...bufs]), new CompressionStream('gzip'));
}

/** decodeWorld(encodeWorld(w)) is w, its GPU buffers as ArrayBuffers. Throws on a file that is not a world. */
export async function decodeWorld(data) {
  let b; // a fresh buffer: offsets into it are offsets into b
  try { b = await pipe(new Blob([data]), new DecompressionStream('gzip')); } catch { throw new Error('Not a Tidemote world.'); }
  if (b.length < 8 || MAGIC.slice(0, 3).some((c, i) => b[i] !== c)) throw new Error('Not a Tidemote world.');
  // TMW and another version's digit: a world, but not one this version reads
  if (b[3] !== MAGIC[3]) throw new Error('This world was saved by another version of Tidemote.');
  const n = new DataView(b.buffer).getUint32(4, true);
  const head = unpack(new TextDecoder().decode(b.subarray(8, 8 + n)));
  if (head.format !== FORMAT) throw new Error('This world was saved by another version of Tidemote.');
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
