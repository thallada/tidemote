// Whether the cells' drawing records (contactGather's sway: heading, squash, bend) hold NaN, which hides a resolved
// cell (its quad's corners NaN): the built page in Chrome on the GPU, a grown world run on at 1x with the main view
// close enough to resolve cells, then the records of the cells in view read back. Counts records seen in the last
// second with a NaN in their heading, squash, its rate or bend, by the cell's state (cause), and the living in view.
// `node tools/popnan.mjs --html dist/tidemote.html --n 262144 --ppu 60`
import { openPage, cliArgs, aim } from './pagelab.mjs';

const a = cliArgs();
const pg = await openPage({ html: a.html || 'dist/tidemote.html', n: +(a.n || 262144), w: 1280, h: 800, mature: +(a.mature || 60), prefs: { scale: 1 } });
const { page } = pg;
await aim(page, null, +(a.ppu || 60));
await page.evaluate(() => globalThis.__tidemote.setSpeed(1));
await page.waitForTimeout(+(a.wait || 4000));
const res = await page.evaluate(async () => {
  const e = globalThis.__tidemote.eng, d = e.device, N = e.count;
  const read = async (buf, size) => {
    const st = d.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(buf, 0, st, 0, size); d.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ); const out = st.getMappedRange().slice(0); st.destroy(); return out;
  };
  const sw = new Uint32Array(await read(e.b.sway, e.b.sway.size)), swf = new Float32Array(sw.buffer);
  const parts = await read(e.b.parts, N * 40), pu = new Uint32Array(parts);
  const byId = new Map();
  for (let k = 0; k < N; k++) if (pu[k * 10 + 4] >= 5) byId.set(pu[k * 10 + 7], pu[k * 10 + 9] & 15);
  const half = (h) => (h & 0x7c00) === 0x7c00 && (h & 0x3ff) !== 0;
  const nan2 = (w) => half(w & 0xffff) || half(w >>> 16);
  const W = 14, slots = sw.length / W;
  let newest = -Infinity;
  for (let s = 0; s < slots; s++) if (sw[s * W] && Number.isFinite(swf[s * W + 3])) newest = Math.max(newest, swf[s * W + 3]);
  const out = { records: 0, nan: 0, byCause: {} };
  for (let s = 0; s < slots; s++) {
    const id = sw[s * W]; if (!byId.has(id)) continue;
    const t = swf[s * W + 3]; if (!(newest - t < 1)) continue;
    const cause = byId.get(id);
    const bad = [1, 2, 4, 5, 6].some((f) => nan2(sw[s * W + f]));
    out.records++;
    const c = (out.byCause['cause ' + cause] ??= { records: 0, nan: 0 });
    c.records++;
    if (bad) { out.nan++; c.nan++; }
  }
  return out;
});
console.log(JSON.stringify(res));
await pg.close();
