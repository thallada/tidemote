// How good a film looks, by recorder setting (docs/film.md, Quality): films the built page headless under
// each variant in turn (in rounds, so each meets the world at several moments), with the auto camera
// moving. The film canvas carries each frame's number as a barcode (film.js, __FILM_PROBE) and keeps every
// 30th frame as a lossless PNG; the film is decoded, those frames found by their barcode, and each
// compared with its original (SSIM and PSNR of luma, the barcode's strip left out). Also: frames kept a
// second, MB a minute, and the page's fps while filming.
//   npm run build && TIDEMOTE_VK=1 tools/capped.sh -m 900M node tools/film-quality.mjs --size 4k --seconds 30 --rounds 3 \
//     --variants '[{"name":"default"},{"name":"vp9","mime":"video/webm;codecs=vp9,opus","bps":7.5e6}]' --out runs/film/q
// A variant: { name, mime, bps, kfi (keyframe interval, ms), look: false (the microscope's look, its grain,
// off) }; the page's own for what it leaves out. --size phone|laptop|4k, --page FILE an older build.
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { arg, openPage, savedFilm } from './film-page.mjs';

const size = arg('size', '4k'), secs = +arg('seconds', 30), rounds = +arg('rounds', 2), out = arg('out', 'runs/film/quality');
const variants = JSON.parse(arg('variants', '[{"name":"default"}]'));
fs.mkdirSync(out, { recursive: true });
const { page, errs, close } = await openPage({ size, html: path.resolve(arg('page', 'dist/tidemote.html')), n: +arg('n', 16384) });
await page.keyboard.press('p'); // the auto camera: the view moves, as a film's usually does
await page.waitForTimeout(5000);

const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
/** Each decoded frame's barcode (the number of the frame the page drew), in order. */
function barcodes(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-fps_mode', 'passthrough', '-vf', 'crop=204:24:0:ih-24,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const W = 204, F = W * 24, codes = [];
  for (let o = 0; o + F <= r.stdout.length; o += F) {
    let v = 0;
    for (let k = 0; k < 16; k++) if (r.stdout[o + 12 * W + 12 + k * 12] > 128) v |= 1 << k;
    codes.push(v);
  }
  return codes;
}
/** SSIM and PSNR (of luma, the barcode's strip cut off) of a decoded frame against its original. */
function compare(ref, dec) {
  const pre = 'format=rgb24,format=gray,crop=iw:ih-24:0:0';
  const r = spawnSync('ffmpeg', ['-v', 'info', '-nostats', '-i', ref, '-i', dec, '-lavfi', `[0]${pre},split[a0][a1];[1]${pre},split[b0][b1];[a0][b0]ssim;[a1][b1]psnr`, '-f', 'null', '-'], { encoding: 'utf8' });
  return { ssim: +(/SSIM .*All:([\d.]+)/.exec(r.stderr)?.[1] ?? NaN), psnr: +(/PSNR .*average:([\d.inf]+)/.exec(r.stderr)?.[1] ?? NaN) };
}

const results = [];
for (let round = 0; round < rounds; round++) {
  for (const v of (round % 2 ? [...variants].reverse() : variants)) {
    const dir = path.join(out, `${v.name}-r${round}`);
    fs.mkdirSync(dir, { recursive: true });
    const film = savedFilm(page, path.join(dir, 'film'));
    await page.evaluate((v) => {
      window.__FILM_OPTS = v; window.__FILM_PROBE = { refs: [] };
      if (v.look === false) globalThis.__tidemote.look.off();
      globalThis.__tidemote.filmAct();
    }, v);
    const fps = [];
    for (let t = 0; t < secs; t += 5) { await page.waitForTimeout(5000); fps.push(await page.evaluate(() => +document.getElementById('sys-fps')?.textContent || 0)); }
    const filmSize = await page.evaluate(() => globalThis.__tidemote.film.size());
    await page.evaluate(() => globalThis.__tidemote.film.stop());
    const video = await film;
    await page.waitForFunction(() => globalThis.__tidemote.film.state === 'idle');
    // the originals, one at a time (all at once runs a capped browser out of memory)
    const nref = await page.evaluate(() => window.__FILM_PROBE.refs.length);
    const refs = new Map();
    for (let j = 0; j < nref; j++) {
      const [k, b64] = await page.evaluate(async (j) => {
        const [k, b] = window.__FILM_PROBE.refs[j];
        const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
        return [k, url.slice(url.indexOf(',') + 1)];
      }, j);
      refs.set(k, path.join(dir, `ref-${k}.png`));
      fs.writeFileSync(refs.get(k), Buffer.from(b64, 'base64'));
    }
    await page.evaluate((v) => { window.__FILM_PROBE = null; window.__FILM_OPTS = null; if (v.look === false) globalThis.__tidemote.look.set(); }, v);
    // the decoded frames those originals are, found by their barcodes and decoded in one pass
    const codes = barcodes(video), at = new Map(codes.map((c, i) => [c, i]));
    const pairs = [...refs].filter(([k]) => at.has(k));
    if (pairs.length) spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-fps_mode', 'passthrough', '-vf', `select='${pairs.map(([k]) => `eq(n\\,${at.get(k)})`).join('+')}'`, path.join(dir, 'dec-%03d.png')]);
    const scores = pairs.map(([k, f], j) => ({ k, ...compare(f, path.join(dir, `dec-${String(j + 1).padStart(3, '0')}.png`)) }));
    const dur = +JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', video]).toString()).format.duration;
    const bytes = fs.statSync(video).size;
    const r = { variant: v.name, round, filmSize, pageFps: +mean(fps).toFixed(1), keptPerS: +(codes.length / dur).toFixed(1), mbps: +((bytes * 8) / dur / 1e6).toFixed(2),
      mbPerMin: +((bytes / 1e6) / (dur / 60)).toFixed(1), found: pairs.length, refs: nref, ssim: +mean(scores.map((x) => x.ssim)).toFixed(4), psnr: +mean(scores.map((x) => x.psnr)).toFixed(2), scores };
    results.push(r);
    console.log(`${`${v.name}-r${round}`.padEnd(22)} ${filmSize?.join('×')}  ${r.mbps} Mb/s (${r.mbPerMin} MB/min)  kept ${r.keptPerS}/s  page ${r.pageFps} fps  SSIM ${r.ssim}  PSNR ${r.psnr} dB  (${r.found}/${nref} frames)`);
    // (one original and its decoded frame kept, to look at)
    for (const f of fs.readdirSync(dir)) if (/^(ref|dec)-/.test(f) && f !== 'dec-001.png' && f !== path.basename(pairs[0]?.[1] || '')) fs.rmSync(path.join(dir, f));
  }
}
console.log('\nby variant:');
for (const v of variants) {
  const rs = results.filter((r) => r.variant === v.name), m = (k) => mean(rs.map((r) => r[k]));
  console.log(`  ${v.name.padEnd(18)} ${m('mbps').toFixed(2)} Mb/s  ${m('mbPerMin').toFixed(1)} MB/min  kept ${m('keptPerS').toFixed(1)}/s  page ${m('pageFps').toFixed(1)} fps  SSIM ${m('ssim').toFixed(4)}  PSNR ${m('psnr').toFixed(2)} dB`);
}
fs.writeFileSync(path.join(out, 'quality.json'), JSON.stringify({ size, secs, rounds, variants, results, errs }, null, 1));
if (errs.length) console.log('page errors:', errs.slice(0, 3).join(' | '));
await close();
