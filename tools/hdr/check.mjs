// Checks the display's HDR and wide-color paths (docs/hdr.md) on the built page in Chrome on the GPU, whatever the
// screen: the page is told the screen is HDR and P3 (T.display.set), switches to a float canvas, and what reaches the
// canvas is measured each way (the canvas drawn into a float 2D canvas in linear sRGB, as the browser hands it on):
// SDR never past white, HDR's highlights past it up to the headroom and no further, the mid-tones alike, P3's colors
// reaching outside sRGB; a save's preview stays SDR bytes; no WebGPU errors throughout.
//   npm run build && tools/gpu-node.sh tools/hdr/check.mjs [--peak 4] [--out runs/hdr/NAME]
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { vkOn as vk, retryAdapter } from '../vk.mjs';
import { launchOptions } from '../lib/browser.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PEAK = +arg('peak', 4), OUT = arg('out', null);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.resolve('dist/tidemote.html')).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-webgpu'] }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('tidemote.sound', JSON.stringify({ on: false })); });
if (vk) await ctx.addInitScript(retryAdapter);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || /\[tidemote\]/.test(m.text())) errs.push(m.text()); });
let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
await page.goto(`http://127.0.0.1:${server.address().port}/`);
if (vk) { await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250, timeout: 120000 }); await page.keyboard.press('Shift'); }
await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running' && document.body.classList.contains('live'), null, { polling: 250, timeout: 180000 });
await page.waitForTimeout(8000);
// What the composite writes into the canvas (its texture copied out in the frame, so whatever the screen): decoded
// as the browser decodes it (sRGB's curve, extended; P3's colors converted to sRGB's), in linear sRGB (1: SDR white):
// the share of pixels past white, the brightest (its top and 99.9th percentile), the mean and median luminance, and the
// share outside sRGB's gamut (a channel below 0). (A canvas drawn into a 2D one would not do: on an SDR screen the
// browser clamps an extended canvas to the screen's range there.)
const measure = () => page.evaluate(() => new Promise((resolve) => globalThis.__tidemote.display.onFrame((cv, tex) => {
  const dev = globalThis.__tidemote.eng.device;
  const W = tex.width, H = tex.height, half = tex.format === 'rgba16float', bgra = tex.format.startsWith('bgra');
  const row = Math.ceil((W * (half ? 8 : 4)) / 256) * 256;
  const buf = dev.createBuffer({ size: row * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = dev.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [W, H]);
  dev.queue.submit([enc.finish()]);
  const p3 = globalThis.__tidemote.display.state().config?.colorSpace === 'display-p3';
  buf.mapAsync(GPUMapMode.READ).then(() => {
    const raw = buf.getMappedRange();
    const h2f = (h) => { const e = (h >> 10) & 31, m = h & 1023, sg = h & 32768 ? -1 : 1; return e === 0 ? sg * m * 2 ** -24 : e === 31 ? NaN : sg * (1 + m / 1024) * 2 ** (e - 15); };
    const dec = (v) => { const a = Math.abs(v), l = a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4; return Math.sign(v) * l; };
    const u16 = half ? new Uint16Array(raw) : null, u8 = half ? null : new Uint8Array(raw);
    const lum = [], hi = [];
    let over = 0, out = 0, sum = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      let r, g, b;
      if (half) { const o = (y * row) / 2 + x * 4; r = h2f(u16[o]); g = h2f(u16[o + 1]); b = h2f(u16[o + 2]); }
      else { const o = y * row + x * 4; r = u8[o] / 255; g = u8[o + 1] / 255; b = u8[o + 2] / 255; if (bgra) [r, b] = [b, r]; }
      r = dec(r); g = dec(g); b = dec(b);
      if (p3) [r, g, b] = [1.2249401 * r - 0.2249404 * g, -0.0420569 * r + 1.0420571 * g, -0.0196376 * r - 0.0786361 * g + 1.0982735 * b];
      const m = Math.max(r, g, b), lu = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (m > 1.02) over++;
      if (Math.min(r, g, b) < -0.004) out++;
      sum += lu; lum.push(lu); hi.push(m);
    }
    buf.unmap(); buf.destroy();
    lum.sort((a, b) => a - b); hi.sort((a, b) => a - b);
    const n = lum.length, q = (a, f) => +a[Math.min(n - 1, Math.floor(f * n))].toFixed(4);
    resolve({ over: +(over / n).toFixed(5), outGamut: +(out / n).toFixed(5), top: q(hi, 1), p999: q(hi, 0.999), mean: +(sum / n).toFixed(4), median: q(lum, 0.5), p90: q(lum, 0.9) });
  });
})));
const T = (fn, a) => page.evaluate(([f, x]) => globalThis.__tidemote.display[f](x), [fn, a]);
const state = () => T('state');
// a held frame: paused, so each way measures the same moment of the world
await page.evaluate(() => { globalThis.__tidemote.state.paused = true; });
await page.waitForTimeout(800);
console.log('start', JSON.stringify(await state()));
const sdr = await measure();
console.log('SDR', JSON.stringify(sdr));
check('SDR: nothing past white (but the sensor noise\'s flecks)', sdr.over < 0.0005 && sdr.p999 <= 1.02, JSON.stringify(sdr));
const pv0 = await T('preview');
// the screen taken for an HDR, P3 one
await T('set', { caps: { hdrScreen: true, p3Screen: true }, prefs: { hdr: true, peak: PEAK, wide: 0 } });
await page.waitForFunction(() => globalThis.__tidemote.display.state().format === 'rgba16float', null, { polling: 250, timeout: 120000 });
await page.waitForTimeout(1500);
const st = await state();
console.log('HDR state', JSON.stringify(st));
check('HDR: a float canvas in extended range at the headroom asked', st.format === 'rgba16float' && st.config?.toneMapping === 'extended' && st.display.peak === PEAK, JSON.stringify(st.config));
const hdr = await measure();
console.log('HDR', JSON.stringify(hdr));
check('HDR: highlights past white', hdr.over > 0 && hdr.top > 1.5, JSON.stringify(hdr));
check(`HDR: nothing past the headroom (${PEAK})`, hdr.top <= PEAK * 1.02);
check('HDR: the mid-tones as SDR (median within 3%)', Math.abs(hdr.median - sdr.median) <= 0.03 * Math.max(sdr.median, 1e-3) + 1e-4, `${sdr.median} → ${hdr.median}`);
check('HDR: sRGB colors stay in sRGB with wide color off', hdr.outGamut < 0.001, String(hdr.outGamut));
const pv1 = await T('preview');
// (--out: Settings → Display → Color as an HDR screen shows it, at a laptop's size and a phone's)
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [w, h, name] of [[1280, 720, 'laptop'], [390, 760, 'phone']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    await page.evaluate(() => { if (document.getElementById('settings').hidden) document.getElementById('set-open').click(); document.querySelector('#set-tabs [data-tab="display"]').click(); });
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => { const g = document.getElementById('hdr-cal')?.closest('.block, section') || document.getElementById('hdr-cal'); g?.scrollIntoView({ block: 'center' }); const r = document.getElementById('settings').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await page.waitForTimeout(400);
    const lay = await page.evaluate(() => { const c = document.getElementById('hdr-cal'), p = document.querySelector('.hdr-cal-say'); const r = c?.getBoundingClientRect(), q = p?.getBoundingClientRect(); return { cal: r && [r.width, r.height], say: q && [q.width, q.height], fontPx: p && parseFloat(getComputedStyle(p).fontSize), slider: !!document.getElementById('set-peak'), wide: !!document.querySelector('[data-o="wide"]') }; });
    check(`Settings → Color at a ${name}'s size: HDR's slider, the swatch, wide color`, lay.slider && lay.wide && lay.cal?.[0] > 40 && lay.cal?.[1] >= 40 && lay.fontPx >= 11, JSON.stringify(lay));
    await page.screenshot({ path: path.join(OUT, `settings-${name}.png`), clip: box });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press('Escape');
}
check('a save preview stays SDR bytes on the float canvas', !!pv1 && pv1.n === pv0?.n && Math.abs(pv1.mean - pv0.mean) < 6, `${pv0?.mean?.toFixed(1)} → ${pv1?.mean?.toFixed(1)}`);
await T('set', { prefs: { wide: 3 } });
await page.waitForTimeout(1200);
const wide = await measure();
console.log('HDR + Vivid', JSON.stringify(wide), JSON.stringify((await state()).config));
check('Wide color: saturated colors reach outside sRGB', wide.outGamut > hdr.outGamut, `${hdr.outGamut} → ${wide.outGamut}`);
check('Wide color: the mid-tones kept (median within 5%)', Math.abs(wide.median - hdr.median) <= 0.05 * Math.max(hdr.median, 1e-3) + 1e-4, `${hdr.median} → ${wide.median}`);
// a film's frames: SDR in sRGB's colors on the same canvas
const filmD = await page.evaluate(() => { globalThis.__tidemote.film.start(); return globalThis.__tidemote.display.state().display; });
await page.waitForTimeout(1200);
const filming = await measure();
await page.evaluate(() => globalThis.__tidemote.film.stop());
check('a film: SDR, sRGB colors', filmD.peak === 1 && filmD.wide === 0 && filming.over < 0.0005 && filming.outGamut < 0.001, `${JSON.stringify(filmD)} top ${filming.top}`);
await page.waitForTimeout(1500);
// HDR off: SDR again, in the float canvas
await T('set', { prefs: { hdr: false, wide: 0 } });
await page.waitForTimeout(1000);
const off = await measure();
check('HDR off: SDR again in the float canvas', off.over < 0.0005 && Math.abs(off.median - sdr.median) <= 0.03 * Math.max(sdr.median, 1e-3) + 1e-4, JSON.stringify(off));
// (--zooms 1,8,40: the view's statistics at each zoom, SDR then HDR, the world held: where the highlights are)
const zooms = arg('zooms', '');
for (const z of zooms ? zooms.split(',').map(Number) : []) {
  const row = {};
  for (const h of [false, true]) {
    await T('set', { prefs: { hdr: h, wide: 0 } });
    await page.evaluate((zz) => { const t = globalThis.__tidemote; t.state.follow = false; t.state.auto = false; t.director?.stop?.(); t.cam.zoom = t.cam.zoomTarget = Math.min(zz, t.maxZoom()); }, z);
    await page.waitForTimeout(1500);
    row[h ? 'hdr' : 'sdr'] = await measure();
  }
  console.log(`zoom ${z}`, JSON.stringify(row));
}
// (--tour N: N looks along the auto camera's shots, the world running, SDR and HDR in turn: the highlights where a
// viewer looks)
const tour = +arg('tour', 0);
if (tour) {
  await page.evaluate(() => { const t = globalThis.__tidemote; t.state.paused = false; t.state.auto = true; });
  for (let k = 0; k < tour; k++) {
    await page.waitForTimeout(4000);
    const row = {};
    for (const h of [false, true]) { await T('set', { prefs: { hdr: h, wide: h ? 3 : 0 } }); await page.waitForTimeout(250); row[h ? 'hdr' : 'sdr'] = await measure(); }
    const z = await page.evaluate(() => +globalThis.__tidemote.cam.zoom.toFixed(1));
    console.log(`look ${k} zoom ${z}`, `SDR top ${row.sdr.top} p999 ${row.sdr.p999} | HDR top ${row.hdr.top} p999 ${row.hdr.p999} over ${row.hdr.over} outGamut ${row.hdr.outGamut} | median ${row.sdr.median}/${row.hdr.median}`);
  }
}
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify({ sdr, hdr, wide, filming, off, state: st }, null, 1)); }
const gpuErrs = errs.filter((e) => !/favicon/.test(e));
check('no errors', gpuErrs.length === 0, gpuErrs.slice(0, 5).join(' | '));
await browser.close(); server.close();
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
