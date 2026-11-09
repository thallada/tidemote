#!/usr/bin/env node
// The text editor (docs/i18n.md): every message of the page, where it sits, and a place to rewrite it, saved as
// it is typed. Rewrites are a locale of their own (locales/en-x-rewrite.json, only what differs from the
// source); each message's state (draft, done, kept, flagged, approved) and its last versions are in
// locales/review/en-x-rewrite.json, and every save is appended to locales/review/en-x-rewrite.journal.jsonl,
// so nothing typed is ever lost. The page itself, in the rewrite's words and marked (node build.mjs --mark),
// is served at /preview: Alt-click any text there to open its message.
//   node tools/i18n/textlab.mjs [--port 4711] [--locale en-x-rewrite]      then open http://localhost:4711
// Screenshots of where each message sits come from a marked tour (tools/i18n/tour.mjs --shots) into
// runs/i18n/shots; the editor's "Capture" runs one (several minutes; the GPU, capped).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { extract, ROOT } from './extract.mjs';
import { checkMessage } from './check.mjs';
import { same } from './textlab/pretty.js';

const { values: opt } = parseArgs({ options: { port: { type: 'string', default: '4711' }, locale: { type: 'string', default: 'en-x-rewrite' }, host: { type: 'string', default: '127.0.0.1' } } });
const L = opt.locale;
const HERE = path.join(ROOT, 'tools/i18n/textlab');
const CAT = path.join(ROOT, 'locales', `${L}.json`);
const REV = path.join(ROOT, 'locales/review', `${L}.json`);
const JOURNAL = path.join(ROOT, 'locales/review', `${L}.journal.jsonl`);
const SHOTS = path.join(ROOT, 'runs/i18n/shots');
const PREVIEW = path.join(ROOT, 'dist/tidemote.textlab.html');
fs.mkdirSync(path.dirname(REV), { recursive: true });

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return d; throw new Error(`${f} does not parse (${e.message}); fix or restore it from the journal before starting`); } };
// written whole to a file beside it, then moved into place: a crash mid-write leaves the old file
const writeJson = (f, v) => { const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(v, null, 2)}\n`); fs.renameSync(tmp, f); };

let src = extract();
if (src.errors.length) console.warn(`the source has message errors (shown in the editor):\n${src.errors.join('\n')}`);
let catalog = readJson(CAT, {});
let review = readJson(REV, {});
if (!fs.existsSync(CAT)) writeJson(CAT, {});

// the catalog in the source's order, only what differs from it
const ordered = () => Object.fromEntries([...src.messages.keys()].filter((id) => id in catalog).map((id) => [id, catalog[id]])
  .concat(Object.keys(catalog).filter((id) => !src.messages.has(id)).map((id) => [id, catalog[id]])));

// the review (tools/i18n/review.mjs) writes the same files while the editor runs: what is on disk is read again
// before each change whenever it is newer than what this server last wrote
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
let wrote = { [CAT]: mtime(CAT), [REV]: mtime(REV) };
function fresh() {
  if (mtime(CAT) > wrote[CAT] + 1) catalog = readJson(CAT, {});
  if (mtime(REV) > wrote[REV] + 1) review = readJson(REV, {});
}
const persist = () => { writeJson(CAT, ordered()); writeJson(REV, review); wrote = { [CAT]: mtime(CAT), [REV]: mtime(REV) }; };

let queue = Promise.resolve();
function save(id, text, status, by = 'editor') {
  fresh();
  const source = src.messages.get(id);
  if (source === undefined) return { ok: false, problems: [{ level: 'error', code: 'id', msg: `No message ${id} in the source.` }] };
  const ctx = shots.boxOf(id) ? { box: shots.boxOf(id), sink: src.context[id]?.refs[0]?.sink } : { sink: src.context[id]?.refs[0]?.sink };
  if (text != null) {
    // the editor lays big choices out a branch a line: kept on one line, the same message, as the source has it
    const compact = text.replace(/\n */g, '');
    if (compact !== text && same(compact, text)) text = compact;
    if (text !== source && same(text, source)) text = source;
  }
  const problems = text == null ? [] : checkMessage(text, source, ctx);
  const was = catalog[id];
  if (text != null) { if (text === source) delete catalog[id]; else catalog[id] = text; }
  const r = review[id] || {};
  if (was !== undefined && was !== catalog[id]) r.prev = [{ text: was, at: r.at }, ...(r.prev || [])].slice(0, 8);
  Object.assign(r, { status: status || r.status || 'draft', at: new Date().toISOString(), source });
  // a finding the viewer has since answered by rewriting: kept for the record, no longer open
  if (r.findings && text != null && was !== catalog[id]) for (const f of r.findings) if (!f.resolved) f.stale = true;
  review[id] = r;
  const line = `${JSON.stringify({ t: r.at, id, text: catalog[id] ?? null, status: r.status, by })}\n`;
  queue = queue.then(() => { fs.appendFileSync(JOURNAL, line); persist(); });
  return { ok: true, problems, review: r };
}

// ---- screenshots: which states show each message, and its box there ----
const shots = {
  index: null,
  load() {
    const f = path.join(SHOTS, 'texts.json');
    const at = {};
    if (fs.existsSync(f)) {
      const { states } = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const [st, rows] of Object.entries(states)) for (const r of rows) for (const id of r.ids || []) {
        if (!r.box) continue;
        const list = (at[id] ||= []);
        // a different place each: the same box at the same size is the same picture again
        const size = st.split('.')[0], key = `${size}:${r.box.join(',')}`;
        if (list.length < 8 && !list.some((x) => x[3] === key)) list.push([st, r.box, r.attr || null, key]);
      }
      this.taken = fs.statSync(f).mtime.toISOString();
    }
    // three at most: the laptop's first, then a phone's, then whatever else
    for (const id of Object.keys(at)) {
      const l = at[id], phone = l.find((x) => x[0].startsWith('phone.'));
      at[id] = [l[0], ...(phone && phone !== l[0] ? [phone] : []), ...l.filter((x) => x !== l[0] && x !== phone)].slice(0, 3);
    }
    this.index = at;
  },
  boxOf(id) { return this.index?.[id]?.[0]?.[1]; },
  job: null,
};
shots.load();

function capture() {
  if (shots.job) return;
  const log = [];
  shots.job = { started: Date.now(), log };
  const run = (cmd, args, env = {}) => new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env } });
    p.stdout.on('data', (d) => log.push(...d.toString().split('\n').filter(Boolean)));
    p.stderr.on('data', (d) => log.push(...d.toString().split('\n').filter(Boolean)));
    p.on('close', (c) => (c ? rej(new Error(`${cmd} exited ${c}`)) : res()));
  });
  const capped = path.join(process.env.HOME, '.local/bin/capped');
  const wsl = (() => { try { return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')); } catch { return false; } })();
  const tour = ['tools/i18n/tour.mjs', '--page', 'dist/tidemote.textlab.capture.html', '--out', 'runs/i18n/shots', '--shots'];
  run('node', ['build.mjs', '--mark', '--out', 'dist/tidemote.textlab.capture.html'])
    // (under WSL the tour runs in Windows Chrome on the GPU through Windows' node, tools/gpu-node.sh)
    .then(() => (wsl ? run('tools/gpu-node.sh', tour) : fs.existsSync(capped) ? run(capped, ['-m', '900M', 'node', ...tour], { TIDEMOTE_VK: '1' }) : run('node', tour)))
    .then(() => { shots.load(); log.push('done'); })
    .catch((e) => log.push(`failed: ${e.message}`))
    .finally(() => { shots.job.done = Date.now(); setTimeout(() => { shots.job = null; }, 60000); });
}

let rebuilding = null;
const rebuild = () => (rebuilding ||= new Promise((res, rej) => {
  const p = spawn('node', ['build.mjs', '--mark', '--locale', L, '--out', 'dist/tidemote.textlab.html'], { cwd: ROOT });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => { rebuilding = null; c ? rej(new Error(err || `build exited ${c}`)) : res(); });
}));

// ---- the editor's own files ----
let appJs = null;
async function bundle() {
  const r = await build({ entryPoints: [path.join(HERE, 'app.js')], bundle: true, write: false, format: 'esm', target: 'es2022', absWorkingDir: ROOT });
  appJs = r.outputFiles[0].text;
}

const json = (res, v, code = 200) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(v)); };
const body = (req) => new Promise((res, rej) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (e) { rej(e); } }); });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(HERE, 'index.html'))); }
    if (p === '/style.css') { res.writeHead(200, { 'content-type': 'text/css', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(HERE, 'style.css'))); }
    if (p === '/app.js') { if (process.env.TEXTLAB_DEV || !appJs) await bundle(); res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return res.end(appJs); }
    if (p === '/overlay.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(HERE, 'overlay.js'))); }
    if (p === '/api/state' && req.method === 'GET') {
      if (url.searchParams.has('fresh')) src = extract();
      fresh();
      return json(res, { root: ROOT, locale: L, order: [...src.messages.keys()], source: Object.fromEntries(src.messages), context: src.context, errors: src.errors,
        catalog, review, shots: { at: shots.index, taken: shots.taken || null, job: shots.job && { started: shots.job.started, done: shots.job.done || null, log: shots.job.log.slice(-6) } } });
    }
    if (p === '/api/msg' && req.method === 'PUT') {
      const { id, text, status } = await body(req);
      return json(res, save(id, text, status));
    }
    if (p === '/api/check' && req.method === 'POST') {
      const { id, text } = await body(req);
      const source = src.messages.get(id);
      return json(res, source === undefined ? [] : checkMessage(text, source, { box: shots.boxOf(id), sink: src.context[id]?.refs[0]?.sink }));
    }
    if (p === '/api/finding' && req.method === 'PUT') {
      // the viewer answers a finding: resolved (fixed or dismissed), with a word on why
      const { id, index, resolved, reply } = await body(req);
      fresh();
      const f = review[id]?.findings?.[index];
      if (!f) return json(res, { ok: false }, 404);
      Object.assign(f, { resolved: !!resolved, reply: reply || f.reply, answeredAt: new Date().toISOString() });
      // every finding answered: back to Done, for the review to see again
      if (review[id].status === 'flagged' && !review[id].findings.some((x) => !x.resolved && !x.stale && (x.level === 'error' || x.level === 'warn'))) review[id].status = 'done';
      queue = queue.then(persist);
      return json(res, { ok: true, review: review[id] });
    }
    if (p === '/api/rebuild' && req.method === 'POST') { await rebuild(); return json(res, { ok: true }); }
    if (p === '/api/capture' && req.method === 'POST') { capture(); return json(res, { ok: true }); }
    if (p === '/preview') {
      if (!fs.existsSync(PREVIEW)) await rebuild();
      const html = fs.readFileSync(PREVIEW, 'utf8').replace(/<\/html>\s*$/, '<script src="/overlay.js"></script>\n</html>');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    const shot = /^\/shots\/([\w.-]+\.png)$/.exec(p);
    if (shot && fs.existsSync(path.join(SHOTS, shot[1]))) { res.writeHead(200, { 'content-type': 'image/png' }); return fs.createReadStream(path.join(SHOTS, shot[1])).pipe(res); }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    console.error(e);
    json(res, { ok: false, error: String(e.message || e) }, 500);
  }
});
await bundle();
server.listen(+opt.port, opt.host, () => console.log(`text editor: http://${opt.host === '0.0.0.0' ? 'localhost' : opt.host}:${opt.port}  (${src.messages.size} messages; rewrites in locales/${L}.json)`));
// a clean stop finishes its writes
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { queue.then(() => process.exit(0)); });
