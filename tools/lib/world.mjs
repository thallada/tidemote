// A world as the tools keep it between runs (.bin: runs/perf/worlds, runs/anim/worlds, runs/stone): eng.readState()'s
// buffers raw, after a JSON head ({ cpu, sizes: [[name, bytes], ...] }) and its length as a u32. Raw and unchecked: one
// saved before a buffer's layout changed loads as noise (a page's saved .tidemote, src/worlds.js, is the checked kind).

// (both self-contained: the page runs them too, from their source)
const pack = (s) => {
  const cpu = Object.fromEntries(Object.entries(s.cpu).map(([k, x]) => [k, ArrayBuffer.isView(x) ? Array.from(x) : x]));
  const sizes = Object.entries(s.gpu).map(([k, b]) => [k, b.byteLength]);
  const head = new TextEncoder().encode(JSON.stringify({ cpu, sizes }));
  return [new Uint32Array([head.length]), head, ...Object.values(s.gpu)];
};
const unpack = (buf) => {
  const head = new Uint32Array(buf, 0, 1)[0];
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, head)));
  const gpu = {};
  let at = 4 + head;
  for (const [k, size] of meta.sizes) { gpu[k] = buf.slice(at, at + size); at += size; }
  return { cpu: meta.cpu, gpu };
};

/** A state from eng.readState() as a .bin's bytes (a Node Buffer). */
export const packWorld = (state) => Buffer.concat(pack(state).map((p) => new Uint8Array(p.buffer ?? p, p.byteOffset ?? 0, p.byteLength)));

/** A .bin's bytes (an ArrayBuffer, or a Node Buffer as fs.readFileSync gives) as a state for eng.writeState: { cpu, gpu: { name: ArrayBuffer } }. */
export const unpackWorld = (data) => unpack(data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

const inPage = (page) => page.evaluate(`(globalThis.__packWorld = ${pack}, globalThis.__unpackWorld = ${unpack}, 0)`);

/** Load the .bin at `url` (one the page can fetch: the tool's server's, or a data: URL) into the page's world (__tidemote.loadWorld). */
export async function loadBinWorld(page, url) {
  await inPage(page);
  return page.evaluate(async (url) => globalThis.__tidemote.loadWorld(globalThis.__unpackWorld(await (await fetch(url)).arrayBuffer())), url);
}

/**
 * The page's world as a .bin, PUT to `url` (the tool's server keeps it), or with no url returned as base64 (b64); first the
 * speed set to `speed` if one is given: { simTime, living, species, b64 }.
 */
export async function saveBinWorld(page, url = null, { speed = null } = {}) {
  await inPage(page);
  return page.evaluate(async ({ url, speed }) => {
    const T = globalThis.__tidemote;
    if (speed != null) T.setSpeed(speed);
    const blob = new Blob(globalThis.__packWorld(await T.eng.readState()));
    let b64;
    if (url) await fetch(url, { method: 'PUT', body: blob });
    else { const d = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); }); b64 = d.slice(d.indexOf(',') + 1); }
    const L = T.life();
    return { simTime: T.eng.simTime, living: L.counts[3], species: L.alive, b64 };
  }, { url, speed });
}
