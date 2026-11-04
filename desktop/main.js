// Tidemote's desktop shell: the built page (dist/tidemote.html, staged as page/index.html) in its own
// window. The page is served from app://tidemote/ rather than file://, so it has an origin of its own
// for localStorage (settings), kept in Electron's userData directory. Saved worlds are files there
// (worlds.js), which Steam Cloud syncs; Steam (steam.js) adds achievements and the Workshop. The page
// reaches both through preload.cjs.
//
// The shell's few words stay in English (each marked i18n-ignore): this main process is packaged from desktop/ alone
// (scripts/package.mjs), without ../src/i18n.js or intl-messageformat, and the page shows its own words.
import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { open as openFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startSteam, status, achieve } from './steam.js';
import { worlds, workshop } from './worlds.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PAGE_DIR = join(HERE, 'page');
const ORIGIN = 'app://tidemote';

// Chromium keeps the page's compiled WebGPU pipelines in userData/DawnWebGPUCache, so a launch after the
// first finds them (the world starts in about 0.5 s rather than 4). But once one version's set is in it,
// the large pipelines of a changed page (lifeMain, each about a third of the compile) are never stored
// beside them, and every launch after an update compiled them again. So when the page changes, its old
// shaders go before Chromium opens the cache: the first launch of each version compiles, the rest don't.
{
  const stamp = join(app.getPath('userData'), 'shader-cache-page');
  const page = createHash('sha256').update(readFileSync(join(PAGE_DIR, 'index.html'))).digest('hex');
  let was = '';
  try { was = readFileSync(stamp, 'utf8'); } catch { /* first launch */ }
  if (was !== page) {
    rmSync(join(app.getPath('userData'), 'DawnWebGPUCache'), { recursive: true, force: true });
    try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(stamp, page); } catch (e) { console.warn('[tidemote] shader cache stamp:', e.message); }
  }
}

// The page is local and never loads remote content, so WebGPU can skip Chrome's GPU blocklist. On
// Linux, Chrome has not turned WebGPU on by default for every GPU; Vulkan is the backend it runs on
// there (as tools/perf/bench.mjs --linux and the headless gate use).
app.commandLine.appendSwitch('enable-unsafe-webgpu');
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'Vulkan'); // i18n-ignore (a Chromium feature)
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const serve = (req) => {
  const { pathname } = new URL(req.url);
  const file = join(PAGE_DIR, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
  if (!file.startsWith(PAGE_DIR)) return new Response('not found', { status: 404 }); // i18n-ignore (an HTTP body)
  return net.fetch(pathToFileURL(file).toString());
};

const open = () => {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 640, minHeight: 400,
    show: false, backgroundColor: '#06090a', title: 'Tidemote', // i18n-ignore (the product's name; the page's title follows)
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: join(HERE, 'preload.cjs') },
  });
  win.once('ready-to-show', () => win.show());
  // Links leave for the system browser; the window itself never navigates away from the page.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  // F11 as in a browser; the page's own fullscreen button (requestFullscreen) fills the screen too.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // Arguments after `--` pass DEFAULT_K overrides as the page's #k= hash: `electron . -- --k '{...}'`.
  const k = process.argv.indexOf('--k');
  win.loadURL(`${ORIGIN}/${k > 0 ? `#k=${encodeURIComponent(process.argv[k + 1])}` : ''}`);
};

// Only the page itself may call the shell.
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => {
  if (!e.senderFrame?.url.startsWith(ORIGIN)) throw new Error('not the page');
  return fn(...a);
});
handle('worlds:list', worlds.list);
handle('worlds:put', worlds.put);
handle('worlds:get', worlds.get);
handle('worlds:remove', worlds.remove);
handle('steam:status', status);
handle('steam:achieve', achieve);
handle('workshop:share', workshop.share);
handle('workshop:browse', workshop.browse);
handle('workshop:open', workshop.open);

// Films (src/film.js): written as they are made into Videos/Tidemote, as NAME.part until closed (a film
// cut off by a crash stays there, playable, as .part).
const films = new Map();
let filmN = 0;
handle('film:open', async (name) => {
  const dir = join(app.getPath('videos'), 'Tidemote'); // i18n-ignore (a folder's name)
  mkdirSync(dir, { recursive: true });
  const stem = basename(String(name)).replace(/[^\w.\- ]+/g, '_');
  let path = join(dir, stem);
  for (let k = 2; existsSync(path); k++) path = join(dir, stem.replace(/(\.\w+)?$/, ` (${k})$1`));
  const fh = await openFile(`${path}.part`, 'w');
  const id = ++filmN;
  films.set(id, { fh, path });
  let free = null;
  try { const s = statfsSync(dir); free = s.bavail * s.bsize; } catch { /* unknown */ }
  return { id, free };
});
const film = (id) => { const f = films.get(id); if (!f) throw new Error('no such film'); return f; };
handle('film:write', async (id, bytes) => { await film(id).fh.write(bytes); });
handle('film:patch', async (id, at, bytes) => { await film(id).fh.write(bytes, 0, bytes.length, at); });
handle('film:close', async (id) => {
  const f = film(id);
  await f.fh.close();
  renameSync(`${f.path}.part`, f.path);
  films.delete(id);
  return f.path;
});
handle('film:abort', async (id) => { const f = films.get(id); if (!f) return; films.delete(id); await f.fh.close(); rmSync(`${f.path}.part`, { force: true }); });

if (startSteam() === 'restart') app.exit(0);

app.whenReady().then(() => {
  protocol.handle('app', serve);
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  open();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
