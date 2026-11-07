// Gives the page the same small desktop API the Tauri build injects (see cinny/src/app/plugins/tauri.ts):
// `window.__TAURI_INTERNALS__.invoke(cmd, args)`, plus `window.__DIDDY_CONNECTION__` in windows of a
// separate login. Runs sandboxed in the top frame only; the commands themselves live in main.cjs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__TAURI_INTERNALS__', {
  invoke: async (cmd, args) => {
    const result = await ipcRenderer.invoke('diddy:invoke', String(cmd), args ?? {});
    // Tauri rejects with the plain error text; the page shows it to the user.
    if (!result.ok) throw result.error;
    return result.value;
  },
});

const connection = ipcRenderer.sendSync('diddy:connection');
if (connection) {
  contextBridge.exposeInMainWorld('__DIDDY_CONNECTION__', Object.freeze(connection));
}
