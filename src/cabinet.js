// The cabinet (docs/hand.md): every species card saved, in every world, kept in this browser beside the saved worlds,
// and the genome a card carries so a species can leave its world: a versioned payload (TMG2, the genome's format
// and length, the species' name and home water, whether its world was touched, the words, its body, a checksum) in
// the card's PNG (a text chunk) and in its QR code (a link that opens Tidemote with the card). Pure but the store.
import { G_WORDS } from './shaders.js';
import { BODY_MAX } from './studio.js';
import { SAVE_VERSION } from './worlds.js';

// a card's link: its payload as digits, which a QR code holds in numeric mode (3.3 bits a digit, against 8 for a
// base64 character in byte mode; qr.js), for a code of fewer, bigger modules a phone reads from further off.
const CARD_URL = 'https://tidemote.com/#c=';
// the genome's format: a card from a world whose genomes differ (another major, another length) is refused
const FORMAT = +SAVE_VERSION.split('.')[0];
const MAGIC = [0x54, 0x4d, 0x47, 0x32]; // TMG2
const FLAG_TOUCHED = 1; // (the other flag bits reserved)

const fnv = (b) => { let h = 0x811c9dc5; for (const x of b) h = Math.imul(h ^ x, 0x01000193) >>> 0; return h; };
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
// (UTF-8 in at most max bytes, cut between characters)
const text = (s, max) => { const b = new Uint8Array(max); return b.subarray(0, new TextEncoder().encodeInto(String(s || ''), b).written); };

// A body (studio.js bodyOf: [{ role, bonds }], or null for single cells) packed: its count of cells, then each
// cell's role (2 bits), how many cells before it it is bonded to (2 bits) and which (5 bits each).
const IX = Math.log2(BODY_MAX);
function packBody(body) {
  const bits = [], put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  for (const c of body || []) { put(c.role, 2); put(c.bonds.length, 2); for (const j of c.bonds) put(j, IX); }
  const out = new Uint8Array(1 + Math.ceil(bits.length / 8));
  out[0] = body ? body.length : 0;
  bits.forEach((v, i) => { out[1 + (i >> 3)] |= v << (7 - (i & 7)); });
  return out;
}
// (the body, and the bytes after it) or null where the bytes hold none that makes sense
function unpackBody(b, o) {
  const n = b[o++];
  if (n > BODY_MAX) return null;
  let at = o * 8;
  const get = (k) => { let v = 0; for (let i = 0; i < k; i++, at++) v = (v << 1) | ((b[at >> 3] >> (7 - (at & 7))) & 1); return v; };
  const body = [];
  for (let i = 0; i < n; i++) {
    const role = get(2), bonds = Array.from({ length: get(2) }, () => get(IX));
    if (at > b.length * 8 || bonds.some((j) => j >= i)) return null;
    body.push({ role, bonds });
  }
  return { body: n ? body : null, end: Math.ceil(at / 8) };
}

/** A card's payload: { words (G_WORDS), name, home, touched, body } -> bytes. */
export function encodeCard({ words, name, home, touched = false, body = null }) {
  const n = text(name, 48), h = text(home, 48), bd = packBody(body);
  const out = new Uint8Array(4 + 4 + n.length + 1 + h.length + G_WORDS * 4 + bd.length + 4);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  out[4] = FORMAT; out[5] = G_WORDS; out[6] = touched ? FLAG_TOUCHED : 0; out[7] = n.length;
  out.set(n, 8);
  let o = 8 + n.length;
  out[o++] = h.length; out.set(h, o); o += h.length;
  words.forEach((w, i) => dv.setUint32(o + i * 4, w >>> 0, true));
  o += G_WORDS * 4;
  out.set(bd, o); o += bd.length;
  dv.setUint32(o, fnv(out.subarray(0, o)), true);
  return out;
}
/** bytes -> { words, name, home, touched, body }, or throws with why it is refused. */
export function decodeCard(b) {
  if (b.length < 12 || MAGIC.some((m, i) => b[i] !== m)) throw new Error('This is not a Tidemote species card.');
  if (b[4] !== FORMAT || b[5] !== G_WORDS) throw new Error(b[4] > FORMAT ? 'This card is from a newer Tidemote.' : 'This card is from an older Tidemote, whose genomes this one cannot read.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder();
  let o = 8 + b[7];
  const name = dec.decode(b.subarray(8, o));
  const hl = b[o++], home = dec.decode(b.subarray(o, o + hl));
  o += hl;
  const bd = o + G_WORDS * 4 < b.length ? unpackBody(b, o + G_WORDS * 4) : null;
  if (!bd || b.length !== bd.end + 4 || dv.getUint32(bd.end, true) !== fnv(b.subarray(0, bd.end))) throw new Error('This card is damaged.');
  const words = Array.from({ length: G_WORDS }, (_, i) => dv.getUint32(o + i * 4, true));
  return { words, name, home, touched: !!(b[6] & FLAG_TOUCHED), body: bd.body };
}
// bytes as digits: seven bytes (56 bits) in seventeen digits, a last few in as many as they need (DIGITS[n]); each
// length its own, so the digits say how many bytes they hold
const DIGITS = [0, 3, 5, 8, 10, 13, 15, 17];
function toDigits(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 7) {
    const c = u8.subarray(i, i + 7);
    s += c.reduce((n, b) => (n << 8n) | BigInt(b), 0n).toString().padStart(DIGITS[c.length], '0');
  }
  return s;
}
function fromDigits(s) {
  const full = Math.floor(s.length / 17), rest = DIGITS.indexOf(s.length - full * 17);
  if (rest < 0) return null;
  const out = new Uint8Array(full * 7 + rest);
  for (let i = 0, o = 0; o < out.length; i += 17) {
    const n = Math.min(7, out.length - o);
    let v = BigInt(s.slice(i, i + DIGITS[n]));
    if (v >> BigInt(8 * n)) return null;
    for (let k = n - 1; k >= 0; k--) { out[o + k] = Number(v & 255n); v >>= 8n; }
    o += n;
  }
  return out;
}
/** A card's link (its QR code), and the payload read back from one (the page's #c=...), or null. */
export const cardLink = (bytes) => CARD_URL + toDigits(bytes);
export const cardFromHash = (hash) => { const m = /#c=(\d+)/.exec(hash || ''); return m ? fromDigits(m[1]) : null; };

// ---- a PNG's text chunk (tEXt), where a card's PNG keeps its payload
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** png (bytes) with a tEXt chunk key=value put before its end. */
function pngWithText(png, key, value) {
  const body = new Uint8Array([...new TextEncoder().encode(key), 0, ...new TextEncoder().encode(value)]);
  const chunk = new Uint8Array(12 + body.length), dv = new DataView(chunk.buffer);
  dv.setUint32(0, body.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // tEXt
  chunk.set(body, 8);
  dv.setUint32(8 + body.length, crc(chunk.subarray(4, 8 + body.length)));
  const end = png.length - 12; // IEND is the last chunk, twelve bytes
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, end)); out.set(chunk, end); out.set(png.subarray(end), end + chunk.length);
  return out;
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
const PNG_KEY = 'tidemote-card';
/** A card's payload from its PNG, or null. */
export const cardFromPng = (png) => { const v = pngText(png, PNG_KEY); return v ? unb64(v) : null; };
// a card's PNG (bytes) with its payload (card bytes) in it
export const cardIntoPng = (png, bytes) => pngWithText(png, PNG_KEY, b64(bytes));

// ---- the cabinet's cards: { id, serial, name, words, home, world (the seed of its world), savedAt, touched,
// stranger (carried from another world) }
/** The cards that pass the filters: q (search on name and home), from ('any' | 'this' | 'other'), and
 * test(card) for the Species tab's diet and body facets; newest first. */
export function filterCards(cards, { q = '', from = 'any', world = null, test = () => true } = {}) {
  const s = q.trim().toLowerCase();
  return cards.filter((c) => (!s || `${c.name} ${c.home}`.toLowerCase().includes(s))
    && (from === 'any' || (from === 'this' ? c.world === world : c.world !== world)) && test(c))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** The cabinet kept in this browser (IndexedDB): list(), put(card), remove(id). */
export function createCabinetStore() {
  let db = null;
  const open = () => (db ??= new Promise((res, rej) => {
    const r = indexedDB.open('tidemote-cabinet', 1);
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
