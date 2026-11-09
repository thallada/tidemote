// The promo editor's local server: the editor page, the library's proxies (byte ranges, for seeking), the catalogue,
// the track (WAV, its grid, its notes and a waveform), EDLs and ratings (paths.mjs), the rendered preview
// (preview.mjs), and renders: a draft of what the editor plays (draft.mjs) or the 4K master (master.mjs).
//   node tools/promo/editor/server.mjs [--port 8642]   then open http://localhost:8642 (from Windows too)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { spawn, spawnSync } from 'node:child_process';
import { makePreview } from './preview.mjs';
import { ROOT, LIB, TRACK, TITLES, EDLS, RATINGS, HERE as PROMO, REPO, cliArgs } from '../paths.mjs';

const HERE = path.join(PROMO, 'editor'), RENDERS = LIB + '/_renders', PORT = +(cliArgs().port ?? 8642);
fs.mkdirSync(EDLS, { recursive: true }); fs.mkdirSync(RENDERS, { recursive: true });
const preview = makePreview();
const THUMBS = LIB + '/_preview/thumb'; fs.mkdirSync(THUMBS, { recursive: true });
// thumbnails made a few at a time (a grid scrolled fast asks for dozens at once)
let thumbsBusy = 0; const thumbWait = [];
const thumbQ = async (fn) => { while (thumbsBusy >= 6) await new Promise((r) => thumbWait.push(r)); thumbsBusy++; try { await fn(); } finally { thumbsBusy--; thumbWait.shift()?.(); } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
// library files are asked for by version (?v=the shot's mtime) and titles rarely change: the browser keeps them, so a
// shot seen once loads from its cache and a re-render of the grid doesn't fetch every poster again
function sendFile(req, res, file, cache = 'no-cache') {
  let st; try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end('not found'); }
  const type = TYPES[path.extname(file)] || 'application/octet-stream', range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range) || []; let a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : st.size - 1;
    if (!m[1] && m[2]) { a = Math.max(0, st.size - +m[2]); b = st.size - 1; }
    b = Math.min(b, st.size - 1);
    if (a > b) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1, 'cache-control': cache });
    return stream(fs.createReadStream(file, { start: a, end: b }), res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': cache });
  stream(fs.createReadStream(file), res);
}
// a read that fails, or a player that hangs up mid-file (every seek does), ends that response and nothing else
function stream(rs, res) { rs.on('error', () => res.destroy()); res.on('close', () => rs.destroy()); rs.pipe(res); }
const json = (res, o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => r(s)); });
const safe = (base, rel) => { const p = path.resolve(base, '.' + path.sep + rel); if (!p.startsWith(base)) throw new Error('outside'); return p; };

// the track's waveform: peaks (max |sample|) of the mixed-down WAV in 10 ms buckets, 0..255
let wave = null;
function waveform() {
  if (wave) return wave;
  const buf = fs.readFileSync(path.join(TRACK, 'track.wav'));
  let off = 12, fmt = null, data = null;
  while (off < buf.length) { const id = buf.toString('ascii', off, off + 4), len = buf.readUInt32LE(off + 4); if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(off + 10), sr: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) }; if (id === 'data') data = [off + 8, len]; off += 8 + len + (len & 1); }
  const per = Math.round(fmt.sr / 100), frame = fmt.ch * 2, n = Math.floor(data[1] / frame), peaks = new Uint8Array(Math.ceil(n / per));
  for (let i = 0; i < n; i++) { let m = 0; for (let c = 0; c < fmt.ch; c++) m = Math.max(m, Math.abs(buf.readInt16LE(data[0] + i * frame + c * 2))); const k = (i / per) | 0; const v = Math.min(255, Math.round(Math.sqrt(m / 32768) * 255)); if (v > peaks[k]) peaks[k] = v; }
  wave = { rate: 100, peaks: Buffer.from(peaks).toString('base64'), duration: n / fmt.sr };
  return wave;
}
// the clip's tracked interface rects (UI shots: where each panel is, every frame), for reframing on a panel
function rects(id) {
  const d = JSON.parse(fs.readFileSync(safe(ROOT, id + '.json'), 'utf8'));
  return { vw: d.vw, vh: d.vh, rects: (d.cam || []).map((c) => c[5] || null) };
}

// renders: one at a time, its log kept
let job = null;
function render(kind, name) {
  if (job && job.code == null) throw new Error('a render is running');
  const edl = path.join(EDLS, name + '.json');
  if (!fs.existsSync(edl)) throw new Error('save the EDL first');
  const out = path.join(RENDERS, `${name}-${kind}`);
  job = { kind, name, out, log: '', code: null, t0: Date.now(), file: kind === 'master' ? path.join(out, 'tidemote-promo-4k.mp4') : path.join(out, 'draft.mp4') };
  const p = spawn('node', [path.join(PROMO, kind === 'master' ? 'master.mjs' : 'draft.mjs'), edl, out], { cwd: REPO });
  const add = (d) => { job.log += d; if (job.log.length > 200000) job.log = job.log.slice(-150000); };
  p.stdout.on('data', add); p.stderr.on('data', add);
  p.on('close', (code) => { job.code = code; job.t1 = Date.now(); });
  return job;
}

const handler = async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(HERE, 'editor.html'));
    if (p.startsWith('/static/')) return sendFile(req, res, safe(HERE, p.slice(8)));
    if (p.startsWith('/lib/')) return sendFile(req, res, safe(LIB, p.slice(5)), u.searchParams.has('v') ? 'public, max-age=604800, immutable' : 'no-cache');
    // a poster as a 320 px thumbnail (the grid's cards, the timeline's cuts): a tenth of the bytes, made once on first ask
    if (p.startsWith('/thumb/')) {
      const rel = p.slice(7), src = safe(LIB, rel), out = path.join(THUMBS, rel.replace(/[\/]/g, '__'));
      if (!fs.existsSync(out)) await thumbQ(() => new Promise((ok) => { const q = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-vf', 'scale=320:-2', '-q:v', '4', out + '.tmp.jpg']); q.on('close', (c) => { if (!c) fs.renameSync(out + '.tmp.jpg', out); ok(); }); }));
      return sendFile(req, res, fs.existsSync(out) ? out : src, u.searchParams.has('v') ? 'public, max-age=604800, immutable' : 'no-cache');
    }
    if (p.startsWith('/titles/')) return sendFile(req, res, safe(TITLES, p.slice(8)), 'public, max-age=3600');
    if (p.startsWith('/renders/')) return sendFile(req, res, safe(RENDERS, p.slice(9)));
    if (p === '/track.wav') return sendFile(req, res, path.join(TRACK, 'track.wav'));
    // the same samples losslessly at about half the bytes, for a viewer across the tailnet (made once, again if the WAV changes)
    if (p === '/track.flac') {
      const wav = path.join(TRACK, 'track.wav'), flac = LIB + '/_preview/track.flac';
      if (!fs.existsSync(flac) || fs.statSync(flac).mtimeMs < fs.statSync(wav).mtimeMs) { const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'flac', '-compression_level', '8', flac]); if (r.status) throw new Error('flac: ' + r.stderr); }
      return sendFile(req, res, flac);
    }
    if (p === '/api/catalog') return sendFile(req, res, path.join(LIB, 'catalog.json'));
    if (p === '/api/track') return json(res, { times: JSON.parse(fs.readFileSync(path.join(TRACK, 'times.json'))), events: JSON.parse(fs.readFileSync(path.join(TRACK, 'events.json'))), accent: fs.existsSync(path.join(TRACK, 'accent.json')) ? JSON.parse(fs.readFileSync(path.join(TRACK, 'accent.json'))).steps : null, wave: waveform() });
    if (p === '/api/rects') return json(res, rects(u.searchParams.get('id')));
    if (p === '/api/titles') return json(res, fs.readdirSync(TITLES).filter((f) => f.endsWith('.png')));
    if (p === '/api/ratings') {
      if (req.method === 'PUT') { const b = await body(req); JSON.parse(b); if (fs.existsSync(RATINGS)) fs.copyFileSync(RATINGS, RATINGS + '.bak'); fs.writeFileSync(RATINGS + '.tmp', b); fs.renameSync(RATINGS + '.tmp', RATINGS); return json(res, { ok: true }); }
      return json(res, fs.existsSync(RATINGS) ? JSON.parse(fs.readFileSync(RATINGS, 'utf8')) : {});
    }
    if (p === '/api/edls') return json(res, fs.readdirSync(EDLS).filter((f) => f.endsWith('.json')).map((f) => ({ name: f.slice(0, -5), mtime: fs.statSync(path.join(EDLS, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime));
    if (p.startsWith('/api/edl/')) {
      const name = p.slice(9).replace(/[^\w.-]/g, '');
      if (!name) throw new Error('a name, please');
      const f = path.join(EDLS, name + '.json');
      if (req.method === 'PUT') { const s = await body(req); JSON.parse(s); fs.writeFileSync(f, s); return json(res, { ok: true, name }); }
      return sendFile(req, res, f);
    }
    // what the viewer met while playing (waits, the link's rate, the browser), one JSON line each: so a stutter on a
    // laptop across the tailnet can be looked into from here
    if (p === '/api/clientlog' && req.method === 'POST') { const line = (await body(req)).slice(0, 4000).replace(/\n/g, ' '); fs.appendFileSync(path.join(LIB, 'editor-client.log'), `${new Date().toISOString()} ${line}\n`); return json(res, { ok: true }); }
    // the rendered preview of the EDL as it stands in the editor (saved or not): POST it, then GET for progress
    if (p === '/api/preview' && req.method === 'POST') { const o = JSON.parse(await body(req)); return json(res, preview.request(o.edl, +o.at || 0)); }
    if (p === '/api/preview') return json(res, preview.status());
    if (p === '/api/render' && req.method === 'POST') { const o = JSON.parse(await body(req)); const j = render(o.kind, o.name.replace(/[^\w.-]/g, '')); return json(res, { ok: true, out: j.out }); }
    if (p === '/api/render') {
      if (!job) return json(res, { job: null });
      const rel = fs.existsSync(job.file) && job.code === 0 ? '/renders/' + path.relative(RENDERS, job.file) : null;
      return json(res, { job: { kind: job.kind, name: job.name, code: job.code, secs: Math.round(((job.t1 || Date.now()) - job.t0) / 1000), log: job.log.slice(-6000), file: rel } });
    }
    res.writeHead(404); res.end('not found');
  } catch (e) { if (res.headersSent) res.destroy(); else json(res, { error: String(e.message || e) }, 500); }
};
// loopback only, both families (Windows' localhost reaches WSL either way); `tailscale serve` proxies the tailnet's
// https://dynamo-wsl…:8642 to 127.0.0.1:8642 and holds the port on the tailnet address, so a wildcard bind would collide
for (const host of ['127.0.0.1', '::1']) http.createServer(handler).listen(PORT, host, () => console.log(`promo editor on http://${host.includes(':') ? `[${host}]` : host}:${PORT}`)).on('error', (e) => console.log(host, e.message));
