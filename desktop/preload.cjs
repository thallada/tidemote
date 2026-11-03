// What the page sees of the desktop shell: window.tidemoteDesktop (the page checks for it). Every call
// goes to the main process (main.js), which holds the files and Steam.
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('tidemoteDesktop', {
  worlds: { list: call('worlds:list'), put: call('worlds:put'), get: call('worlds:get'), remove: call('worlds:remove') },
  steam: call('steam:status'),
  achieve: call('steam:achieve'),
  workshop: { share: call('workshop:share'), browse: call('workshop:browse'), open: call('workshop:open') },
  // a film written as it is made, into Videos/Tidemote (src/film.js): open(name) -> { id, free }, then
  // write(id, bytes) in order, patch(id, at, bytes), close(id) -> its path
  film: { open: call('film:open'), write: call('film:write'), patch: call('film:patch'), close: call('film:close'), abort: call('film:abort') },
});
