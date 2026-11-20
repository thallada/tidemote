// SPDX-License-Identifier: MIT
// Copyright (c) Tyler Hallada
//
// Tidemote's Steam helper: a small program of its own, run as a separate process, and the only one that loads
// steamworks.js and Valve's steam_api library. It speaks the plain JSON messages described in README.md over the
// IPC pipe its parent opened, and depends on nothing but Node's built-ins and steamworks.js (MIT). It must never
// import code from the rest of the Tidemote repository (GPL); see README.md and LICENSE.
'use strict';

const PROTOCOL = 1;

if (typeof process.send !== 'function') {
  process.stderr.write('steam-helper: run me with an IPC channel (child_process.fork or spawn with "ipc")\n');
  process.exit(2);
}

let steamworks = null; // the module, once it loaded
let client = null; // the initialized API, once Steam answered
let loaded = false;
let why = '';

const send = (msg) => { try { process.send(msg); } catch { /* the parent is gone */ } };
const str = (v) => (v == null ? v : String(v));
const item = (v) => {
  const s = String(v ?? '');
  if (!/^\d{1,20}$/.test(s)) throw new Error(`not a Workshop item id: ${s}`);
  return BigInt(s);
};
const need = () => { if (!client) throw new Error('Steam is not running'); return client; };
const box = (n) => Math.max(0, Math.round(Number(n) || 0));

function status() {
  if (!client) return { loaded, on: false, why };
  let cloud = false, user = '';
  try { cloud = client.cloud.isEnabledForAccount() && client.cloud.isEnabledForApp(); } catch { /* off */ }
  try { user = client.localplayer.getName(); } catch { /* unknown */ }
  return { loaded, on: true, appId: client.utils.getAppId(), cloud, user };
}

const ops = {
  // { appId?, restartAppId? } -> { protocol, loaded, on, why?, restart?, appId?, cloud?, user? }
  init({ appId, restartAppId } = {}) {
    if (client) return { protocol: PROTOCOL, ...status() };
    try {
      steamworks = require('steamworks.js');
      loaded = true;
      // Started outside Steam: Steam relaunches the game, and the parent quits.
      if (restartAppId && steamworks.restartAppIfNecessary(Number(restartAppId))) return { protocol: PROTOCOL, loaded, on: false, restart: true };
      client = steamworks.init(Number(appId) || undefined);
    } catch (e) {
      why = String((e && e.message) || e);
      client = null;
    }
    return { protocol: PROTOCOL, ...status() };
  },
  status,
  // { name } -> whether the achievement is (now) unlocked
  achieve({ name }) {
    const c = need();
    if (typeof name !== 'string' || !name) throw new Error('achievement name');
    if (c.achievement.isActivated(name)) return true;
    const ok = c.achievement.activate(name);
    if (ok) c.stats.store(); // sent to Steam now, not when the game quits
    return ok;
  },
  deck() {
    try { return !!(client && client.utils.isSteamRunningOnSteamDeck()); } catch { return false; }
  },
  // { x, y, w, h } (a text field, in the window's pixels) -> whether Steam's floating keyboard showed
  async keyboard({ x, y, w, h } = {}) {
    if (!client) return false;
    return !!(await client.utils.showFloatingGamepadTextInput(0, box(x), box(y), box(w), box(h)));
  },
  // -> [item id, ...] as decimal strings
  'ugc.subscribed'() { return need().workshop.getSubscribedItems().map(String); },
  // { item } -> { folder, timestamp, size } | null
  'ugc.installInfo'({ item: id }) {
    const i = need().workshop.installInfo(item(id));
    return i ? { folder: i.folder, timestamp: Number(i.timestamp), size: str(i.sizeOnDisk) } : null;
  },
  // { item, high } -> whether the download was queued
  'ugc.download'({ item: id, high }) { return !!need().workshop.download(item(id), !!high); },
  // { item } -> { current, total } (bytes) | null
  'ugc.downloadInfo'({ item: id }) {
    const d = need().workshop.downloadInfo(item(id));
    return d ? { current: Number(d.current), total: Number(d.total) } : null;
  },
  // -> { item, needsToAcceptAgreement }
  async 'ugc.create'() {
    const r = await need().workshop.createItem();
    return { item: String(r.itemId), needsToAcceptAgreement: !!r.needsToAcceptAgreement };
  },
  // { item, title?, description?, changeNote?, contentPath?, previewPath?, visibility? } -> { item, needsToAcceptAgreement }
  async 'ugc.update'({ item: id, title, description, changeNote, contentPath, previewPath, visibility }) {
    const details = {};
    for (const [k, v] of Object.entries({ title, description, changeNote, contentPath, previewPath })) if (typeof v === 'string') details[k] = v;
    if (Number.isInteger(visibility)) details.visibility = visibility;
    const r = await need().workshop.updateItem(item(id), details);
    return { item: String(r.itemId), needsToAcceptAgreement: !!r.needsToAcceptAgreement };
  },
  // { item } -> null
  async 'ugc.unsubscribe'({ item: id }) { await need().workshop.unsubscribe(item(id)); return null; },
  // -> null, then the helper exits
  quit() { setImmediate(() => process.exit(0)); return null; },
};

process.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;
  const { id, op, args } = msg;
  const fn = Object.prototype.hasOwnProperty.call(ops, op) ? ops[op] : null;
  try {
    if (!fn) throw new Error(`unknown op: ${op}`);
    send({ id, ok: true, value: await fn(args || {}) });
  } catch (e) {
    send({ id, ok: false, error: String((e && e.message) || e) });
  }
});
// The parent closed the pipe (it quit or crashed): Steam must not see the game as still running.
process.on('disconnect', () => process.exit(0));

send({ event: 'hello', protocol: PROTOCOL, pid: process.pid });
