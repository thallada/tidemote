// Films the built page headless and measures what filming costs: the bytes the encoder hands over (MB a
// minute), the memory of the browser's processes as the film grows, what it put on disk (its blob store,
// its private files), and the film it saves, probed with ffmpeg (duration, frames, a seek's bytes). docs/film.md.
//   npm run build && TIDEMOTE_VK=1 ~/.local/bin/capped -m 900M node tools/film-check.mjs --size laptop --minutes 5 --out runs/film/NAME
// --size phone|laptop|4k (tools/film-page.mjs), --page FILE an older build, --n particles (16384), --memory
// without the private files (the memory sink), --cap BYTES a lower limit (to see it stop itself), --opts JSON
// the recorder's format and bitrate ({ mime, bps, kfi }). Writes NAME/SIZE.json and the film beside it.
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { arg, openPage, savedFilm } from './film-page.mjs';

const size = arg('size', 'laptop'), memory = process.argv.includes('--memory'), tag = memory ? `${size}-memory` : size;
const minutes = +arg('minutes', 5), out = arg('out', 'runs/film/check');
const opts = { ...JSON.parse(arg('opts', '{}')), ...(arg('cap') ? { cap: +arg('cap') } : {}) };
fs.mkdirSync(out, { recursive: true });

const { page, prof, errs, close } = await openPage({ size, html: path.resolve(arg('page', 'dist/tidemote.html')), n: +arg('n', 16384),
  initArg: [memory, opts],
  init: ([memory, opts]) => {
    window.__FILM_OPTS = opts;
    if (memory && globalThis.FileSystemFileHandle) delete FileSystemFileHandle.prototype.createWritable;
    // the recorder's chunks, tallied (as any build makes them)
    const MR = window.MediaRecorder; window.__chunks = [];
    if (MR) window.MediaRecorder = class extends MR {
      constructor(...a) { super(...a); window.__mr = { mime: this.mimeType, vbps: this.videoBitsPerSecond }; this.addEventListener('dataavailable', (e) => window.__chunks.push(e.data.size)); }
    };
  } });

// the browser's processes (those started with this profile, and theirs): their proportional set sizes
const pids = () => {
  const all = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)), par = new Map();
  for (const p of all) { try { par.set(p, fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ')[1]); } catch { /* gone */ } }
  const mine = new Set(all.filter((p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').includes(prof); } catch { return false; } }));
  for (let grew = true; grew;) { grew = false; for (const [p, pp] of par) if (!mine.has(p) && mine.has(pp)) { mine.add(p); grew = true; } }
  return [...mine];
};
const pss = () => pids().reduce((s, p) => { try { return s + +(/Pss:\s+(\d+)/.exec(fs.readFileSync(`/proc/${p}/smaps_rollup`, 'utf8'))?.[1] || 0) * 1024; } catch { return s; } }, 0);
const du = (d) => { try { return fs.existsSync(d) ? +execFileSync('du', ['-sb', d], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\t')[0] : 0; } catch { return 0; } };
const MB = (b) => +(b / 1e6).toFixed(1);
const fps = () => page.evaluate(() => +document.getElementById('sys-fps')?.textContent || null);

await page.waitForTimeout(8000);
const fps0 = await fps();
const film = savedFilm(page, path.join(out, tag));
await page.evaluate(() => globalThis.__tidemote.filmAct('now'));
const samples = [], t0 = Date.now(), base = pss();
console.log(`${tag}: ${fps0} fps before filming; filming ${minutes} min`);
while ((Date.now() - t0) / 60000 < minutes) {
  await page.waitForTimeout(10000);
  const s = await page.evaluate(() => ({ state: globalThis.__tidemote.film.state, bytes: window.__chunks.reduce((a, x) => a + x, 0), shown: globalThis.__tidemote.film.bytes?.() ?? 0 }));
  const row = { t: Math.round((Date.now() - t0) / 1000), fps: await fps(), ...s, pss: pss(), blobDir: du(path.join(prof, 'Default', 'blob_storage')), opfs: du(path.join(prof, 'Default', 'File System')) };
  samples.push(row);
  console.log(`  ${row.t}s  ${row.fps} fps  film ${MB(row.bytes)} MB  shown ${MB(row.shown)}  browser PSS ${MB(row.pss)} MB (+${MB(row.pss - base)})  blob dir ${MB(row.blobDir)}  private files ${MB(row.opfs)}  ${s.state}`);
  if (s.state === 'idle') break; // stopped itself at its limit
}
const info = await page.evaluate(() => ({ mime: window.__mr?.mime, vbps: window.__mr?.vbps, filmSize: globalThis.__tidemote.film.size?.() }));
await page.evaluate(() => { if (globalThis.__tidemote.film.state === 'recording') globalThis.__tidemote.film.stop(); });
const saved = await film;
await page.waitForFunction(() => globalThis.__tidemote.film.state === 'idle');
const shown = await page.evaluate(() => globalThis.__tidemote.film.bytes?.() ?? 0);
const flashed = await page.evaluate(() => document.getElementById('flash')?.textContent || '');
const last = samples.at(-1) || { t: 1, bytes: 0 };
const res = { size, ...info, fps0, mbPerMin: +(last.bytes / 1e6 / (last.t / 60)).toFixed(1), samples, errs, saved, shown, fileBytes: fs.statSync(saved).size, flashed };
try {
  const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_packets', '-show_format', '-show_streams', '-of', 'json', saved]).toString());
  const v = p.streams.find((x) => x.codec_type === 'video');
  res.probe = { duration: +p.format.duration || null, codec: v.codec_name, w: v.width, h: v.height, frames: +v.nb_read_packets };
} catch (e) { res.probe = { error: String(e.message).slice(0, 300) }; }
// a seek to 90% in: with an index (or MP4's fragments) ffmpeg jumps there; without one it reads the file up to it
const at = Math.max(1, Math.floor((res.probe.duration || last.t) * 0.9)), ts = Date.now();
const sk = spawnSync('ffmpeg', ['-v', 'debug', '-ss', String(at), '-i', saved, '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
res.seek = { ms: Date.now() - ts, read: +(/Statistics: (\d+) bytes read/.exec(sk.stderr)?.[1] || NaN) };
fs.writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(res, null, 1));
const q = res.probe;
console.log(`${tag}: “${flashed}”; ${res.mime} at ${res.vbps} b/s asked; ${res.mbPerMin} MB/min; file ${MB(res.fileBytes)} MB (shown ${MB(shown)}); ${q.codec} ${q.w}×${q.h}, ${q.duration} s, ${q.frames} frames (${(q.frames / q.duration).toFixed(1)}/s); a seek to 90% read ${MB(res.seek.read)} MB in ${res.seek.ms} ms${errs.length ? `; errors: ${errs.join(' | ')}` : ''}`);
await close();
