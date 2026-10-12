// Saved worlds. A world is the engine's state (eng.readState: the GPU buffers that hold every
// particle, genome, intent and the ledger, with the clock, light, tides and currents) and the page's
// own record of it (names and lineages, the chronicle, the history, the climate's eras), written as one
// gzipped file. The page keeps them in this browser's IndexedDB; a file downloaded from there opens
// on any device with WebGPU.
//
// The file: 'TMW1', a u32 length, a JSON head ({ format, meta, cpu, sizes, page }), then each GPU
// buffer's bytes in the order of sizes. The head keeps Maps and typed arrays (see pack).

export const FORMAT = 1;
const MAGIC = [0x54, 0x4d, 0x57, 0x31]; // TMW1
const TYPED = { Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Int16Array, Uint8Array, Int8Array };

/** JSON that keeps Maps and typed arrays (shared references come back as copies). */
export const pack = (v) => JSON.stringify(v, (_, x) => (x instanceof Map ? { $map: [...x] }
  : ArrayBuffer.isView(x) && x.constructor.name in TYPED ? { $ta: x.constructor.name, v: Array.from(x) } : x));
export const unpack = (s) => JSON.parse(s, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? (x.$map ? new Map(x.$map) : x.$ta ? TYPED[x.$ta].from(x.v) : x) : x));

const pipe = async (blob, stream) => new Uint8Array(await new Response(blob.stream().pipeThrough(stream)).arrayBuffer());

/** One world as file bytes: meta describes it for a list, page is the page's record (any value pack keeps). */
export async function encodeWorld({ meta, cpu, gpu, page }) {
  const sizes = Object.entries(gpu).map(([k, b]) => [k, b.byteLength]);
  const head = new TextEncoder().encode(pack({ format: FORMAT, meta, cpu, sizes, page }));
  const len = new Uint8Array(new Uint32Array([head.length]).buffer);
  return pipe(new Blob([new Uint8Array(MAGIC), len, head, ...Object.values(gpu)]), new CompressionStream('gzip'));
}

/** decodeWorld(encodeWorld(w)) is w, its GPU buffers as ArrayBuffers. Throws on a file that is not a world. */
export async function decodeWorld(data) {
  let b; // a fresh buffer: offsets into it are offsets into b
  try { b = await pipe(new Blob([data]), new DecompressionStream('gzip')); } catch { throw new Error('Not a Tidemote world.'); }
  if (b.length < 8 || MAGIC.some((c, i) => b[i] !== c)) throw new Error('Not a Tidemote world.');
  const n = new DataView(b.buffer).getUint32(4, true);
  const head = unpack(new TextDecoder().decode(b.subarray(8, 8 + n)));
  if (head.format !== FORMAT) throw new Error('This world was saved by another version of Tidemote.');
  const gpu = {};
  let at = 8 + n;
  for (const [k, size] of head.sizes) { gpu[k] = b.buffer.slice(at, at + size); at += size; }
  if (at > b.length) throw new Error('This world’s file is incomplete.');
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
