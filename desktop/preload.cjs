// What the page sees of the desktop shell: window.tidemoteDesktop (the page checks for it). Every call
// goes to the main process (main.js), which holds the files and Steam.
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('tidemoteDesktop', {
  worlds: { list: call('worlds:list'), put: call('worlds:put'), get: call('worlds:get'), remove: call('worlds:remove') },
  steam: call('steam:status'),
  achieve: call('steam:achieve'),
  // a controller (docs/controller.md): deck() -> whether this is a Steam Deck; keyboard({ x, y, w, h }) -> whether Steam's
  // floating keyboard showed for the text field there
  deck: call('steam:deck'),
  keyboard: call('steam:keyboard'),
  workshop: { share: call('workshop:share'), browse: call('workshop:browse'), open: call('workshop:open') },
  // the window's full screen (F11's too): toggle(), get() -> on, on(fn) calls fn(on) whenever it changes; forced() ->
  // whether the screen is the window's anyway (gamescope: a Steam Deck's Game Mode), and full screen means nothing
  fullscreen: { toggle: call('fullscreen:toggle'), get: call('fullscreen:get'), forced: call('fullscreen:forced'), on: (fn) => { ipcRenderer.on('fullscreen', (_, on) => fn(on)); } },
  // the app closed (the menu's Quit), and the window about to close (its ✕, Alt+F4): fn() keeps the world first and then
  // calls quit(); a page that never asks is closed at once
  quit: call('app:quit'),
  // saved-world files where the system's file chooser cannot be used (gamescope): own() -> whether the page lists them
  // itself, list() -> [{ path, name, where, volume, size, at }], read(path) -> its bytes
  files: { own: call('files:own'), list: call('files:list'), read: call('files:read') },
  onClosing: (fn) => { ipcRenderer.on('closing', () => fn()); ipcRenderer.send('closing:listen'); },
  // a film written as it is made, into Videos/Tidemote (src/film.js): open(name) -> { id, free }, then
  // write(id, bytes) in order, patch(id, at, bytes), close(id) -> its path
  film: { open: call('film:open'), write: call('film:write'), patch: call('film:patch'), close: call('film:close'), abort: call('film:abort') },
});
