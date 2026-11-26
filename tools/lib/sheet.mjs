// Contact sheets of screenshots, laid out and photographed by a browser, so a tool needs no ImageMagick on any OS it runs
// on (Windows' Node under tools/gpu-node.sh, macOS, Linux): each picture cropped about its middle (or whole), scaled,
// captioned, in a grid. tools/bondlab.mjs.
import fs from 'node:fs'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { launchOptions } from './browser.mjs';

/** A PNG's width and height, from its header. */
const pngSize = (file) => { const b = Buffer.alloc(24); const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

/** A browser for sheets alone (installed Chrome on Windows and macOS, else Playwright's Chromium), headless. */
export const sheetBrowser = async () => {
  const b = await chromium.launch(launchOptions({ browser: process.platform === 'linux' ? 'chromium' : 'chrome', vk: false, headless: true }));
  return { ctx: await b.newContext({ deviceScaleFactor: 1 }), close: () => b.close() };
};

/**
 * Write a sheet of `cells` ([{ file, label }], a missing file left blank) to `out` (PNG): `cols` a row, each picture's
 * middle `crop` [w, h] pixels (null: whole), shown at `scale`, under an optional `title`; in the browser context `ctx`.
 */
export async function contactSheet(ctx, cells, out, { cols = 4, crop = [560, 350], scale = 1, title = '' } = {}) {
  const files = cells.map((c) => (c.file && fs.existsSync(c.file) ? c.file : null));
  const server = http.createServer((req, res) => {
    const f = files[+req.url.slice(1)];
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'image/png' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const tiles = cells.map((c, i) => {
    const f = files[i];
    if (!f) return `<figure><div class="pic" style="width:${(crop?.[0] ?? 320) * scale}px;height:${(crop?.[1] ?? 200) * scale}px"></div><figcaption>${esc(c.label ?? '')} (none)</figcaption></figure>`;
    const [w, h] = pngSize(f), [cw, ch] = crop ? [Math.min(crop[0], w), Math.min(crop[1], h)] : [w, h];
    return `<figure><div class="pic" style="width:${cw * scale}px;height:${ch * scale}px"><img src="${base}/${i}" style="width:${w * scale}px;height:${h * scale}px;margin:${-((h - ch) / 2) * scale}px 0 0 ${-((w - cw) / 2) * scale}px"></div><figcaption>${esc(c.label ?? '')}</figcaption></figure>`;
  });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><style>body{margin:0;padding:6px;background:#111;color:#ddd;font:15px DejaVu Sans,Segoe UI,sans-serif;width:max-content}
    h1{font-size:17px;margin:2px 4px 8px}main{display:grid;grid-template-columns:repeat(${cols},max-content);gap:6px}figure{margin:0}
    .pic{overflow:hidden;background:#000}.pic img{display:block}figcaption{padding:3px 2px}</style>
    ${title ? `<h1>${esc(title)}</h1>` : ''}<main>${tiles.join('')}</main>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.setViewportSize(await page.evaluate(() => ({ width: Math.ceil(document.body.scrollWidth), height: Math.min(4000, Math.ceil(document.body.scrollHeight)) })));
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  server.close();
}
