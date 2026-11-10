import test from 'node:test';
import assert from 'node:assert/strict';

// encode.js in a fake browser: a page canvas that makes blobs, and a worker that fails as it is told to
let fresh = 0;
async function page(workerMode) {
  const made = [];
  globalThis.HTMLCanvasElement = class {};
  globalThis.ImageData = class { constructor(d, w, h) { Object.assign(this, { d, w, h }); } };
  globalThis.document = { createElement: () => {
    const c = { width: 0, height: 0, smoothing: null, toBlob: (cb, type) => { made.push({ type, w: c.width, smoothing: c.smoothing }); cb(new Blob(['x'], { type })); } };
    c.getContext = () => ({ putImageData() {}, drawImage() {}, set imageSmoothingQuality(v) { c.smoothing = v; } });
    return c;
  } };
  globalThis.OffscreenCanvas = class {};
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.Worker = class {
    constructor() {
      if (workerMode === 'throws') throw new Error('blocked');
      setTimeout(() => {
        if (workerMode === 'error') this.onerror({ message: 'could not load' });
        else this.onmessage({ data: { ready: workerMode !== 'cannot' } });
      }, 5);
    }
    postMessage({ id }) { setTimeout(() => this.onmessage({ data: { id, error: 'no' } }), 5); }
    terminate() {}
  };
  const mod = await import(`../src/encode.js?t=${++fresh}`);
  return { mod, made };
}
const px = () => ({ data: new Uint8Array(16).buffer, w: 2, h: 2 });

test('a worker that cannot start or cannot draw leaves the picture to the page, smoothed as the worker would', async () => {
  for (const mode of ['throws', 'error', 'cannot']) {
    const { mod, made } = await page(mode);
    const out = await mod.encodeImages(px(), [{ type: 'image/jpeg', size: 1 }]);
    assert.equal(out.files.length, 1, mode);
    assert.deepEqual(made, [{ type: 'image/jpeg', w: 1, smoothing: 'high' }], mode);
    // (and the next picture too, at once)
    assert.equal((await mod.encodeBytes(px(), 'image/png')).length, 1, mode);
  }
});

test('a picture the worker fails on settles: pixels given up reject, the next picture is the page\'s', async () => {
  const { mod, made } = await page('ok');
  await assert.rejects(mod.encodeImages(px(), [{ type: 'image/png' }]), /no/);
  const out = await mod.encodeImages(px(), [{ type: 'image/png' }]);
  assert.equal(out.files.length, 1);
  assert.equal(made.length, 1);
});
