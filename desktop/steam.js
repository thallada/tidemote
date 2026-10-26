// Steamworks (steamworks.js) for the desktop shell: achievements, the Workshop, and whether Steam
// Cloud is on. Everything here is optional: without Steam running (or outside Steam altogether) the
// shell runs as a plain desktop app and the page hides what needs Steam.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Tidemote's Steam app id, once Steamworks has given it one. Until then (0), the shell starts Steam
// only when launched by Steam or with TIDEMOTE_STEAM_APPID (480, Valve's Spacewar, works for trying
// the Workshop and achievement calls).
export const APP_ID = 0;

let client = null;
export function startSteam() {
  const id = Number(process.env.TIDEMOTE_STEAM_APPID) || APP_ID || undefined;
  try {
    const steamworks = require('steamworks.js');
    // a release build relaunches through Steam when started from its folder directly
    if (APP_ID && !process.env.TIDEMOTE_STEAM_APPID && steamworks.restartAppIfNecessary(APP_ID)) return 'restart';
    client = steamworks.init(id);
    client.appId = client.utils.getAppId();
  } catch (e) {
    console.warn(`Steam is not available: ${e.message || e}`);
    client = null;
  }
  return client;
}
export const steam = () => client;

/** What the page may offer: { on, appId, cloud, user }. */
export function status() {
  if (!client) return { on: false };
  let cloud = false;
  try { cloud = client.cloud.isEnabledForAccount() && client.cloud.isEnabledForApp(); } catch { /* off */ }
  return { on: true, appId: client.appId, cloud, user: client.localplayer.getName() };
}

export function achieve(id) {
  if (!client || typeof id !== 'string') return false;
  if (client.achievement.isActivated(id)) return true;
  const ok = client.achievement.activate(id);
  if (ok) client.stats.store(); // sent to Steam now, not when the game quits
  return ok;
}
