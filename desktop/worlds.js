// Saved worlds as files, for the desktop shell: the page's world store (src/worlds.js has the browser's,
// in IndexedDB) with the same list/put/get/remove. Each save is three files in userData/worlds:
// ID.tidemote (the world), ID.jpg (a preview, for the Workshop) and ID.json (its meta, written last so
// a list never shows a save half written). Steam Cloud keeps that folder in sync (Auto-Cloud, set up
// in Steamworks; docs/desktop.md). Worlds subscribed to on the Workshop list with them, ids 'ws' and
// the item's id, each from the folder Steam installs it in.
import { app, shell } from 'electron';
import { mkdir, readdir, readFile, rename, rm, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { steam } from './steam.js';

const dir = () => join(app.getPath('userData'), 'worlds');
const ID = /^[\w-]{1,64}$/;
const WS = /^ws(\d{1,20})$/;
const check = (id) => { if (typeof id !== 'string' || !ID.test(id)) throw new Error('Not a saved world.'); return id; };

async function writeAtomic(file, data) {
  await writeFile(`${file}.part`, data);
  await rename(`${file}.part`, file);
}
const readMeta = async (file) => JSON.parse(await readFile(file, 'utf8'));

// ------------------------------------------------------------ own saves
async function own() {
  await mkdir(dir(), { recursive: true });
  const out = [];
  for (const f of await readdir(dir())) {
    if (!f.endsWith('.json')) continue;
    try { out.push(await readMeta(join(dir(), f))); } catch { /* a file Steam is still syncing */ }
  }
  return out;
}
async function put(meta, bytes, preview) {
  const id = check(meta?.id);
  await mkdir(dir(), { recursive: true });
  await writeAtomic(join(dir(), `${id}.tidemote`), Buffer.from(bytes));
  if (preview) await writeAtomic(join(dir(), `${id}.jpg`), Buffer.from(preview));
  await writeAtomic(join(dir(), `${id}.json`), JSON.stringify({ ...meta, preview: !!preview || existsSync(join(dir(), `${id}.jpg`)) }));
}
async function setMeta(id, patch) {
  const file = join(dir(), `${check(id)}.json`);
  const meta = { ...(await readMeta(file)), ...patch };
  await writeAtomic(file, JSON.stringify(meta));
  return meta;
}

// ------------------------------------------------------------ the Workshop's
// A Workshop item's folder holds world.tidemote and world.json (its meta when shared).
const ITEM_FILE = 'world.tidemote', ITEM_META = 'world.json';
async function subscribed() {
  const s = steam();
  if (!s) return [];
  const out = [];
  for (const item of s.workshop.getSubscribedItems()) {
    const id = `ws${item}`, info = s.workshop.installInfo(item);
    if (!info || !existsSync(join(info.folder, ITEM_META))) {
      s.workshop.download(item, true);
      const d = s.workshop.downloadInfo(item);
      out.push({ id, from: 'workshop', workshop: String(item), downloading: d && d.total ? Number(d.current) / Number(d.total) : 0, name: 'Downloading from the Workshop', savedAt: 0, cols: [] });
      continue;
    }
    try {
      const meta = await readMeta(join(info.folder, ITEM_META));
      out.push({ ...meta, id, from: 'workshop', workshop: String(item), savedAt: info.timestamp * 1000 });
    } catch { /* an item that is not a world */ }
  }
  return out;
}
const itemFolder = (id) => {
  const s = steam(), m = WS.exec(id);
  const info = s && m && s.workshop.installInfo(BigInt(m[1]));
  if (!info) throw new Error('This world has not finished downloading.');
  return info.folder;
};

/**
 * Share a save on the Workshop (or update the item it was shared as): { title, description } the
 * page's words for it. Resolves { id, url, agreement } (agreement: Steam asks the viewer to accept the
 * Workshop's legal agreement first, and the item stays hidden until they do).
 */
async function share(id, { title, description } = {}) {
  const s = steam();
  if (!s) throw new Error('Steam is not running.');
  check(id);
  const meta = await readMeta(join(dir(), `${id}.json`));
  let item = meta.workshop ? BigInt(meta.workshop) : null, agreement = false;
  const first = !item;
  if (first) {
    const made = await s.workshop.createItem();
    item = made.itemId;
    agreement = made.needsToAcceptAgreement;
    await setMeta(id, { workshop: String(item) });
  }
  // what the item holds: the world and its meta (without the sharer's own bookkeeping)
  const stage = join(app.getPath('temp'), 'tidemote-workshop', id);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await copyFile(join(dir(), `${id}.tidemote`), join(stage, ITEM_FILE));
  const { workshop, preview, ...shared } = meta;
  await writeFile(join(stage, ITEM_META), JSON.stringify(shared));
  const previewPath = join(dir(), `${id}.jpg`);
  const r = await s.workshop.updateItem(item, {
    title: String(title || meta.name).slice(0, 128),
    description: String(description || '').slice(0, 8000),
    contentPath: stage,
    previewPath: existsSync(previewPath) ? previewPath : undefined,
    changeNote: first ? 'Shared from Tidemote' : 'Updated from Tidemote',
    ...(first ? { visibility: 0 } : {}), // public; later visibility is the sharer's to change on Steam
  });
  await rm(stage, { recursive: true, force: true });
  agreement ||= r.needsToAcceptAgreement;
  return { id: String(item), url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item}`, agreement };
}

// ------------------------------------------------------------ the page's store
export const worlds = {
  async list() {
    return [...await own(), ...await subscribed()].sort((a, b) => b.savedAt - a.savedAt);
  },
  put,
  async get(id) {
    if (WS.test(id)) return readFile(join(itemFolder(id), ITEM_FILE));
    return readFile(join(dir(), `${check(id)}.tidemote`));
  },
  async remove(id) {
    const m = WS.exec(id);
    if (m) { await steam()?.workshop.unsubscribe(BigInt(m[1])); return; }
    check(id);
    // the meta first: a save with its meta gone no longer lists, whatever else is left
    for (const ext of ['json', 'tidemote', 'jpg']) await rm(join(dir(), `${id}.${ext}`), { force: true });
  },
};
export const workshop = {
  share,
  // the Workshop's pages open in Steam itself (the overlay is unreliable in Electron)
  browse: () => { const s = steam(); if (s) shell.openExternal(`steam://url/SteamWorkshopPage/${s.appId}`); },
  open: (item) => { if (/^\d{1,20}$/.test(String(item))) shell.openExternal(`steam://url/CommunityFilePage/${item}`); },
};
