// Pictures made into files off the page's thread, by a worker, in memory: a card's PNG made on the page's held the
// frame it was made in for 50 to 100 ms, and a picture drawn or scaled by the GPU's 2D canvas (its first raster, an
// ImageBitmap's upload or readback) held the GPU, so the world's frames, about as long. Where the worker cannot (no
// OffscreenCanvas there, or a worker that will not start), the page's canvas does.

// (it says first whether it can: a 2D OffscreenCanvas)
const SRC = `postMessage({ ready: typeof OffscreenCanvas === 'function' && !!new OffscreenCanvas(1, 1).getContext('2d') });
onmessage = async ({ data: { id, src, outs, bitmap } }) => {
  try {
    const w = src.bmp ? src.bmp.width : src.w, h = src.bmp ? src.bmp.height : src.h;
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
    if (src.bmp) { g.drawImage(src.bmp, 0, 0); src.bmp.close(); }
    else {
      const px = new Uint8ClampedArray(src.data);
      for (let i = 0; i < px.length; i += 4) { if (src.bgra) { const b = px[i]; px[i] = px[i + 2]; px[i + 2] = b; } px[i + 3] = 255; }
      g.putImageData(new ImageData(px, w, h), 0, 0);
    }
    const files = [];
    for (const o of outs) {
      let s = c;
      if (o.size) { s = new OffscreenCanvas(o.size, o.size); const sg = s.getContext('2d', { willReadFrequently: true }); sg.imageSmoothingQuality = 'high'; sg.drawImage(c, 0, 0, o.size, o.size); }
      files.push(await s.convertToBlob({ type: o.type, quality: o.quality }));
    }
    const bmp = bitmap ? c.transferToImageBitmap() : null;
    postMessage({ id, files, bmp }, bmp ? [bmp] : []);
  } catch (e) { postMessage({ id, error: String(e) }); }
};`;
let ready = null, seq = 0; // ready: a promise of the worker once it has said it can, or of null (the page's canvas)
const waiting = new Map(); // id -> { res, rej }
function encoder() {
  if (ready) return ready;
  return (ready = new Promise((res) => {
    let w = null;
    try { if (typeof OffscreenCanvas !== 'undefined') w = new Worker(URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }))); } catch { w = null; }
    if (!w) { res(null); return; }
    // (a worker that cannot start, or dies: what it was given fails, so its callers fall back; the page's canvas from then on)
    const fail = (err) => {
      ready = Promise.resolve(null); res(null); w.terminate();
      for (const p of waiting.values()) p.rej(err);
      waiting.clear();
    };
    w.onerror = (e) => { e.preventDefault?.(); fail(new Error(e.message || 'The image worker failed.')); };
    w.onmessage = ({ data }) => {
      if ('ready' in data) { if (data.ready) res(w); else fail(new Error('The image worker cannot draw.')); return; }
      const p = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.files) p?.res({ files: data.files, bitmap: data.bmp }); else p?.rej(new Error(data.error));
    };
  }));
}

// (on the page's thread)
async function here(src, outs, bitmap) {
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  if (src.bmp) { c.width = src.bmp.width; c.height = src.bmp.height; g.drawImage(src.bmp, 0, 0); }
  else {
    c.width = src.w; c.height = src.h;
    const px = new Uint8ClampedArray(src.data);
    for (let i = 0; i < px.length; i += 4) { if (src.bgra) { const b = px[i]; px[i] = px[i + 2]; px[i + 2] = b; } px[i + 3] = 255; }
    g.putImageData(new ImageData(px, src.w, src.h), 0, 0);
  }
  const files = await Promise.all(outs.map((o) => {
    let s = c;
    if (o.size) { s = document.createElement('canvas'); s.width = s.height = o.size; const sg = s.getContext('2d', { willReadFrequently: true }); sg.imageSmoothingQuality = 'high'; sg.drawImage(c, 0, 0, o.size, o.size); }
    return new Promise((res, rej) => s.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not make the image.'))), o.type, o.quality));
  }));
  return { files, bitmap: bitmap ? await createImageBitmap(c) : null };
}

/**
 * A picture as files: src a canvas (drawn in memory), an ImageBitmap (in memory: decoded from a file), or raw pixels
 * { data (ArrayBuffer, given up), w, h, bgra (the GPU's order) }; outs [{ type, quality (JPEG), size (made size ×
 * size: src square) }]. Resolves to { files: [Blob], bitmap (with bitmap: the picture, an ImageBitmap in memory) }.
 * Rejects where neither can make it (raw pixels the worker failed on are gone with it).
 */
export async function encodeImages(src, outs, bitmap = false) {
  // (a canvas's pixels read here, in memory: a snapshot of it would go up to the GPU and be read back there)
  const read = async (s) => (s instanceof HTMLCanvasElement ? { data: s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height).data.buffer, w: s.width, h: s.height }
    : s.data ? s : { bmp: await createImageBitmap(s) });
  let got = await read(src);
  const w = await encoder();
  if (w) {
    try {
      return await new Promise((res, rej) => {
        const id = ++seq;
        waiting.set(id, { res, rej });
        w.postMessage({ id, src: got, outs, bitmap }, [got.bmp || got.data]);
      });
    } catch (err) {
      // (what the worker could not make, the page's canvas makes from then on; pixels given up went with it)
      ready = Promise.resolve(null);
      if (src.data) throw err;
      got = await read(src);
    }
  }
  return here(got, outs, bitmap);
}

/** One file of a picture (encodeImages' src), as bytes. */
export const encodeBytes = async (src, type, quality, size) => new Uint8Array(await (await encodeImages(src, [{ type, quality, size }])).files[0].arrayBuffer());
