// Steam for the desktop shell: achievements, the Workshop, whether Steam Cloud is on, the Steam Deck and its keyboard.
// Steamworks itself never loads in this process: steam-helper/ (MIT, its own program; README.md there) is started as a
// separate process and alone loads steamworks.js and Valve's steam_api, and this file talks to it in plain JSON
// messages over a pipe. That keeps the proprietary SDK out of the GPL program (docs/release.md, License).
// Everything here is optional: without Steam running, without the helper, or if it crashes, the shell runs as a plain
// desktop app and the page hides what needs Steam.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Tidemote's Steam app id, once Steamworks has given it one. Until then (0), the shell starts Steam
// only when launched by Steam or with TIDEMOTE_STEAM_APPID (480, Valve's Spacewar, works for trying
// the Workshop and achievement calls).
export const APP_ID = 0;

// In a packaged app the helper and steamworks.js are unpacked beside app.asar (scripts/package.mjs), so the helper runs
// from real files and needs nothing from the app's archive.
export const HELPER = fileURLToPath(new URL('./steam-helper/helper.cjs', import.meta.url)).replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');

// How long a request may take before it is given up on (ms). Workshop uploads carry a whole save.
const TIMEOUT = { init: 20000, keyboard: 3600000, 'ugc.create': 120000, 'ugc.update': 1800000, 'ugc.unsubscribe': 60000 };
const TIMEOUT_DEFAULT = 10000;

/**
 * Starts the helper the way the packaged app runs it: the app's own executable as plain Node
 * (ELECTRON_RUN_AS_NODE), a separate process with an IPC pipe and nothing of Electron or of this program loaded.
 * Steam's own chatter on stdout and stderr goes to ours.
 */
export function launchHelper(path = HELPER) {
  return fork(path, [], {
    execPath: process.execPath,
    execArgv: [],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    serialization: 'json',
    windowsHide: true,
  });
}

/**
 * A client of the helper's protocol. launch() returns a ChildProcess-like object with an IPC channel (send, on
 * 'message'/'exit'/'error'/'disconnect', connected, kill); tests pass a fake helper.
 */
export function createSteam({ launch = launchHelper, timeout = TIMEOUT, timeoutDefault = TIMEOUT_DEFAULT } = {}) {
  let child = null;
  let state = { on: false, loaded: false, why: 'not started' }; // i18n-ignore (main process)
  let started = null;
  let n = 0;
  const pending = new Map();

  const fail = (why) => {
    state = { on: false, loaded: state.loaded, why };
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(why)); }
    pending.clear();
    child = null;
  };

  function request(op, args = {}) {
    if (!child?.connected) return Promise.reject(new Error(`Steam helper is not running (${state.why})`)); // i18n-ignore (main process)
    const id = ++n;
    return new Promise((resolve, reject) => {
      const ms = timeout[op] ?? timeoutDefault;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Steam helper: ${op} timed out after ${ms} ms`)); }, ms); // i18n-ignore (main process)
      pending.set(id, { resolve, reject, timer });
      try { child.send({ id, op, args }); } catch (e) { clearTimeout(timer); pending.delete(id); reject(e); }
    });
  }

  function onMessage(msg) {
    if (!msg || typeof msg !== 'object' || msg.id == null) return; // events (hello) carry no id
    const p = pending.get(msg.id);
    if (!p) return; // answered after its time-out
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.value); else p.reject(new Error(String(msg.error)));
  }

  /**
   * Starts the helper and Steam through it. Resolves 'restart' when Steam relaunches the game (the caller quits),
   * else the status; never rejects.
   */
  function start({ appId, restartAppId } = {}) {
    if (started) return started;
    started = (async () => {
      try {
        child = launch();
      } catch (e) {
        fail(`Steam helper did not start: ${e.message || e}`); // i18n-ignore (main process)
        return current();
      }
      const me = child;
      me.on('message', onMessage);
      me.on('error', (e) => { if (child === me) fail(`Steam helper failed: ${e.message || e}`); }); // i18n-ignore (main process)
      me.on('exit', (code, signal) => { if (child === me) fail(`Steam helper exited (${signal || code})`); }); // i18n-ignore (main process)
      try {
        const r = await request('init', { appId, restartAppId });
        if (r?.restart) return 'restart';
        state = { on: !!r?.on, loaded: !!r?.loaded, why: r?.why || '', appId: r?.appId, cloud: !!r?.cloud, user: r?.user || '' };
        if (!state.on) {
          // Steam is not running (or the addon did not load): the helper has nothing more to do
          console.warn(`Steam is not available: ${state.why}`);
          stop(state.why);
        }
      } catch (e) {
        console.warn(`Steam is not available: ${e.message}`);
        if (child === me) stop(e.message);
      }
      return current();
    })();
    return started;
  }

  /** What the page may offer: { on, appId, cloud, user }, or { on: false, loaded, why }. */
  async function status() {
    if (started) await started;
    return current();
  }
  async function current() {
    if (!state.on || !child?.connected) return { on: false, loaded: state.loaded, why: state.why };
    try {
      const s = await request('status');
      if (s?.on) state = { ...state, appId: s.appId, cloud: !!s.cloud, user: s.user || state.user };
    } catch { /* the last known */ }
    return { on: true, appId: state.appId, cloud: state.cloud, user: state.user };
  }

  const on = () => state.on && !!child?.connected;
  // every call waits for start() to settle (a page asking at once gets the answer, not "off")
  const ready = async () => { if (started) await started; return on(); };
  // a call that only means something with Steam on: false (or the fallback) without it, never an error to the page
  const maybe = async (op, args, fallback = false) => { if (!(await ready())) return fallback; try { return await request(op, args); } catch { return fallback; } };

  return {
    start,
    status,
    on,
    ready,
    appId: () => (on() ? state.appId : 0),
    achieve: (name) => (typeof name === 'string' ? maybe('achieve', { name }) : false),
    /**
     * Whether this is a Steam Deck (Steam sets SteamDeck=1 in Game Mode; Steam's own answer besides): the page then
     * draws the Deck's buttons for Steam's virtual pad, which looks to it like any Xbox pad (docs/controller.md).
     */
    deck: async () => process.env.SteamDeck === '1' || !!(await maybe('deck')),
    /**
     * Steam's floating keyboard for a text field the controller focused, kept clear of rect { x, y, w, h } (the field,
     * in the window's pixels): it types into the field as keys. Whether it showed (only in Big Picture or the Deck's
     * Game Mode).
     */
    keyboard: (rect = {}) => maybe('keyboard', { x: rect?.x, y: rect?.y, w: rect?.w, h: rect?.h }),
    // the Workshop (item ids as decimal strings); these reject when Steam is off or the call fails
    ugc: async (op, args) => { if (!(await ready())) throw new Error('Steam is not running.'); return request(`ugc.${op}`, args); }, // i18n-ignore (main process)
    stop,
  };

  /** Asks the helper to quit, and makes sure it does; why stays as the reason Steam is off. */
  function stop(why = 'stopped') {
    const me = child;
    fail(why);
    if (!me) return;
    try { me.send({ id: 0, op: 'quit', args: {} }); } catch { /* gone */ }
    try { me.disconnect(); } catch { /* gone */ }
    setTimeout(() => { try { me.kill(); } catch { /* gone */ } }, 2000).unref?.();
  }
}

// ------------------------------------------------------------ the shell's one client
const steam = createSteam();
export { steam };

/** Starts Steam through the helper: 'restart' when the caller should quit for Steam to relaunch it. */
export function startSteam() {
  const id = Number(process.env.TIDEMOTE_STEAM_APPID) || APP_ID || undefined;
  // a release build relaunches through Steam when started from its folder directly
  const restartAppId = APP_ID && !process.env.TIDEMOTE_STEAM_APPID ? APP_ID : undefined;
  return steam.start({ appId: id, restartAppId });
}
export const status = () => steam.status();
export const achieve = (id) => steam.achieve(id);
export const onDeck = () => steam.deck();
export const keyboard = (rect) => steam.keyboard(rect);
export const stopSteam = () => steam.stop();
