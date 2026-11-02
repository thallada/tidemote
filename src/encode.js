// Pictures made into files off the page's thread, by a worker, in memory: a card's PNG made on the page's held the
// frame it was made in for 50 to 100 ms, and a picture drawn or scaled by the GPU's 2D canvas (its first raster, an
// ImageBitmap's upload or readback) held the GPU, so the world's frames, about as long. Where the worker cannot (no
// OffscreenCanvas there), the page's canvas does.

const SRC = `onmessage = async ({ data: { id, src, outs, bitmap } }) => {
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
let worker, seq = 0;
const waiting = new Map(); // id -> { res, rej }
function encoder() {
  if (worker !== undefined) return worker;
  try {
    worker = typeof OffscreenCanvas === 'undefined' ? null : new Worker(URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' })));
    if (worker) {
      worker.onmessage = ({ data }) => {
        const p = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.files) p?.res({ files: data.files, bitmap: data.bmp }); else p?.rej(new Error(data.error));
      };
    }
  } catch { worker = null; }
  return worker;
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
    if (o.size) { s = document.createElement('canvas'); s.width = s.height = o.size; s.getContext('2d', { willReadFrequently: true }).drawImage(c, 0, 0, o.size, o.size); }
    return new Promise((res, rej) => s.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not make the image.'))), o.type, o.quality));
  }));
  return { files, bitmap: bitmap ? await createImageBitmap(c) : null };
}

/**
 * A picture as files: src a canvas (drawn in memory), an ImageBitmap (in memory: decoded from a file), or raw pixels
 * { data (ArrayBuffer, given up), w, h, bgra (the GPU's order) }; outs [{ type, quality (JPEG), size (made size ×
 * size: src square) }]. Resolves to { files: [Blob], bitmap (with bitmap: the picture, an ImageBitmap in memory) }.
 */
export async function encodeImages(src, outs, bitmap = false) {
  // (a canvas's pixels read here, in memory: a snapshot of it would go up to the GPU and be read back there)
  if (src instanceof HTMLCanvasElement) src = { data: src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height).data.buffer, w: src.width, h: src.height };
  else if (!src.data) src = { bmp: await createImageBitmap(src) };
  const w = encoder();
  if (w) {
    try {
      return await new Promise((res, rej) => {
        const id = ++seq;
        waiting.set(id, { res, rej });
        w.postMessage({ id, src, outs, bitmap }, [src.bmp || src.data]);
      });
    } catch { worker = null; return null; }
  }
  return here(src, outs, bitmap);
}

/** One file of a picture (encodeImages' src), as bytes. */
export const encodeBytes = async (src, type, quality, size) => new Uint8Array(await (await encodeImages(src, [{ type, quality, size }])).files[0].arrayBuffer());
