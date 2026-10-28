// The cabinet (docs/hand.md): every species card saved, in every world, kept in this browser beside the saved worlds,
// and the genome a card carries so a species can leave its world: a versioned payload (TMG1, the genome's format
// and length, the species' name and home water, whether its world was touched, the words, a checksum) in the
// card's PNG (a text chunk) and in its QR code (a link that opens Tidemote with the card). Pure but the store.
import { G_WORDS } from './shaders.js';
import { SAVE_VERSION } from './worlds.js';

export const CARD_URL = 'https://tidemote.com/#card=';
// the genome's format: a card from a world whose genomes differ (another major, another length) is refused
const FORMAT = +SAVE_VERSION.split('.')[0];
const MAGIC = [0x54, 0x4d, 0x47, 0x31]; // TMG1
const FLAG_TOUCHED = 1, FLAG_BRED = 2;

const fnv = (b) => { let h = 0x811c9dc5; for (const x of b) h = Math.imul(h ^ x, 0x01000193) >>> 0; return h; };
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const text = (s, max) => new TextEncoder().encode(String(s || '')).slice(0, max);

/** A card's payload: { words (G_WORDS), name, home, touched, bred } -> bytes. */
export function encodeCard({ words, name, home, touched = false, bred = false }) {
  const n = text(name, 48), h = text(home, 48);
  const out = new Uint8Array(4 + 4 + n.length + 1 + h.length + G_WORDS * 4 + 4);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  out[4] = FORMAT; out[5] = G_WORDS; out[6] = (touched ? FLAG_TOUCHED : 0) | (bred ? FLAG_BRED : 0); out[7] = n.length;
  out.set(n, 8);
  let o = 8 + n.length;
  out[o++] = h.length; out.set(h, o); o += h.length;
  words.forEach((w, i) => dv.setUint32(o + i * 4, w >>> 0, true));
  o += G_WORDS * 4;
  dv.setUint32(o, fnv(out.subarray(0, o)), true);
  return out;
}
/** bytes -> { words, name, home, touched, bred }, or throws with why it is refused. */
export function decodeCard(b) {
  if (b.length < 12 || MAGIC.some((m, i) => b[i] !== m)) throw new Error('This is not a Tidemote species card.');
  if (b[4] !== FORMAT || b[5] !== G_WORDS) throw new Error(b[4] > FORMAT ? 'This card is from a newer Tidemote.' : 'This card is from an older Tidemote, whose genomes this one cannot read.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder();
  let o = 8 + b[7];
  const name = dec.decode(b.subarray(8, o));
  const hl = b[o++], home = dec.decode(b.subarray(o, o + hl));
  o += hl;
  if (b.length !== o + G_WORDS * 4 + 4 || dv.getUint32(o + G_WORDS * 4, true) !== fnv(b.subarray(0, o + G_WORDS * 4))) throw new Error('This card is damaged.');
  const words = Array.from({ length: G_WORDS }, (_, i) => dv.getUint32(o + i * 4, true));
  return { words, name, home, touched: !!(b[6] & FLAG_TOUCHED), bred: !!(b[6] & FLAG_BRED) };
}
/** A card's link (its QR code), and the payload read back from one (the page's #card=...), or null. */
export const cardLink = (bytes) => CARD_URL + b64(bytes);
export const cardFromHash = (hash) => { const m = /#card=([A-Za-z0-9_-]+)/.exec(hash || ''); return m ? unb64(m[1]) : null; };

// ---- a PNG's text chunk (tEXt), where a card's PNG keeps its payload
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** png (bytes) with a tEXt chunk key=value put before its end. */
export function pngWithText(png, key, value) {
  const body = new Uint8Array([...new TextEncoder().encode(key), 0, ...new TextEncoder().encode(value)]);
  const chunk = new Uint8Array(12 + body.length), dv = new DataView(chunk.buffer);
  dv.setUint32(0, body.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // tEXt
  chunk.set(body, 8);
  dv.setUint32(8 + body.length, crc(chunk.subarray(4, 8 + body.length)));
  const end = png.length - 12; // IEND is the last chunk, twelve bytes
  return new Uint8Array([...png.subarray(0, end), ...chunk, ...png.subarray(end)]);
}
/** The value of a PNG's tEXt chunk key, or null. */
export function pngText(png, key) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength), dec = new TextDecoder();
  for (let o = 8; o + 12 <= png.length;) {
    const len = dv.getUint32(o), type = dec.decode(png.subarray(o + 4, o + 8));
    if (type === 'tEXt') {
      const body = png.subarray(o + 8, o + 8 + len), z = body.indexOf(0);
      if (dec.decode(body.subarray(0, z)) === key) return dec.decode(body.subarray(z + 1));
    }
    o += 12 + len;
  }
  return null;
}
export const PNG_KEY = 'tidemote-card';
/** A card's payload from its PNG, or null. */
export const cardFromPng = (png) => { const v = pngText(png, PNG_KEY); return v ? unb64(v) : null; };
export const pngKeyValue = (bytes) => b64(bytes);

// ---- the cabinet's cards: { id, serial, name, words, home, world (the seed of its world), savedAt, touched,
// bred, stranger (carried from another world) }
/** The cards that pass the filters: q (search on name and home), from ('any' | 'this' | 'other' | 'bred'), and
 * test(card) for the Species tab's diet and body facets; newest first. */
export function filterCards(cards, { q = '', from = 'any', world = null, test = () => true } = {}) {
  const s = q.trim().toLowerCase();
  return cards.filter((c) => (!s || `${c.name} ${c.home}`.toLowerCase().includes(s))
    && (from === 'any' || (from === 'this' ? c.world === world : from === 'other' ? c.world !== world : c.bred)) && test(c))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** The cabinet kept in this browser (IndexedDB): list(), put(card), remove(id). */
export function createCabinetStore(name = 'tidemote-cabinet') {
  let db = null;
  const open = () => (db ??= new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('cards', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { db = null; rej(r.error); };
  }));
  const tx = async (mode, fn) => {
    const t = (await open()).transaction(['cards'], mode), out = fn(t.objectStore('cards'));
    return new Promise((res, rej) => { t.oncomplete = () => res(out?.result); t.onerror = t.onabort = () => rej(t.error || new Error('The browser refused to keep the card.')); });
  };
  return {
    list: () => tx('readonly', (s) => s.getAll()),
    put: (card) => { navigator.storage?.persist?.().catch(() => {}); return tx('readwrite', (s) => s.put(card)); },
    remove: (id) => tx('readwrite', (s) => s.delete(id)),
  };
}
