// Saved-world files (.tidemote) for the page's own file list, where a system file chooser cannot be used: under
// gamescope (a Steam Deck's Game Mode, Steam's gamescope session anywhere) there is no desktop portal, and the GTK
// chooser Chromium falls back to opens as a window of its own that neither touch nor the controller reaches, and that
// cannot be closed (docs/controller.md, Opening a file). So there the page lists the files in the places a world is
// likely to have been put (Downloads, Documents, the Desktop, the home folder, a memory card or USB drive) and opens
// the one chosen; anywhere else the system's chooser opens as before.
import { app } from 'electron';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { userInfo } from 'node:os';

/** Whether the window is gamescope's (the same test as fullscreen:forced). */
export const gamescope = () => !!process.env.GAMESCOPE_WAYLAND_DISPLAY || process.env.XDG_CURRENT_DESKTOP === 'gamescope';

const EXT = '.tidemote';
const MAX = 200;
const listed = new Set(); // the files list() has shown: read() opens only these

const path = (name) => { try { return app.getPath(name); } catch { return null; } };
// (the folders of a directory, or none)
async function dirsIn(dir) {
  try { return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => join(dir, d.name)); } catch { return []; }
}

// The places to look, each with what the page calls it: the system's own folders, then each removable volume
// (SteamOS mounts a memory card at /run/media/<user>/<label>, or /run/media/<label> on older releases) and its
// Downloads and Documents
async function places() {
  const user = (() => { try { return userInfo().username; } catch { return ''; } })();
  const out = [['downloads', path('downloads')], ['documents', path('documents')], ['desktop', path('desktop')], ['home', path('home')]];
  if (process.platform === 'linux') {
    const vols = [...(user ? await dirsIn(`/run/media/${user}`) : []), ...await dirsIn('/run/media'), ...(user ? await dirsIn(`/media/${user}`) : [])]
      .filter((d) => d !== `/run/media/${user}`);
    for (const v of vols) out.push(['media', v], ['media', join(v, 'Downloads')], ['media', join(v, 'Documents')]); // i18n-ignore (folder names on disk)
  }
  const seen = new Set();
  return out.filter(([, d]) => d && !seen.has(d) && seen.add(d));
}

/**
 * The .tidemote files in those places (not their subfolders), newest first: [{ path, name, where, volume, size, at }],
 * where: downloads, documents, desktop, home or media (volume: its name).
 */
export async function list() {
  const files = [];
  for (const [where, dir] of await places()) {
    let names;
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names) {
      if (!name.toLowerCase().endsWith(EXT)) continue;
      const p = join(dir, name);
      try {
        const s = await stat(p);
        if (s.isFile()) files.push({ path: p, name: name.slice(0, -EXT.length), where, volume: where === 'media' ? basename(dir.replace(/\/(Downloads|Documents)$/, '')) : '', size: s.size, at: s.mtimeMs });
      } catch { /* gone, or not ours to read */ }
    }
  }
  files.sort((a, b) => b.at - a.at);
  const shown = files.slice(0, MAX);
  for (const f of shown) listed.add(f.path);
  return shown;
}

/** A file list() showed, as bytes. */
export async function read(p) {
  if (!listed.has(p)) throw new Error('Not a listed file');
  return new Uint8Array(await readFile(p));
}
