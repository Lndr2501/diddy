const path = require('node:path');

/**
 * Options for `desktopCapturer.getSources`. Only X11 shows our picker with thumbnails. On Wayland the
 * portal dialog chooses and the first source is taken as is, so no thumbnails are captured there
 * (0×0 tells Electron to skip grabbing a frame of every screen and window).
 */
const screenSourceOptions = (wayland) => ({
  types: ['screen', 'window'],
  thumbnailSize: wayland ? { width: 0, height: 0 } : { width: 320, height: 180 },
});

function createScreenPicker({ BrowserWindow, ipcMain }) {
  const requests = new Map();
  ipcMain.handle('diddy:screen-sources', (event) => {
    const request = requests.get(event.sender.id);
    return request?.sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() })) ?? [];
  });
  ipcMain.on('diddy:screen-select', (event, id) => {
    const request = requests.get(event.sender.id);
    if (request) request.finish(request.sources.find((source) => source.id === id));
  });
  return (sources, owner) => new Promise((resolve) => {
    const picker = new BrowserWindow({
      parent: owner, modal: !!owner,
      title: 'Bildschirm oder Fenster teilen', width: 760, height: 580,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, '..', 'pickerPreload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const id = picker.webContents.id;
    const onParentClosed = () => finish(undefined);
    const finish = (source) => {
      if (!requests.delete(id)) return;
      owner?.removeListener('closed', onParentClosed);
      resolve(source);
      if (!picker.isDestroyed()) picker.close();
    };
    requests.set(id, { sources, finish });
    owner?.once('closed', onParentClosed);
    picker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    picker.webContents.on('will-navigate', (event) => event.preventDefault());
    picker.once('closed', () => finish(undefined));
    picker.loadFile(path.join(__dirname, '..', 'picker.html')).catch(() => finish(undefined));
  });
}
module.exports = { createScreenPicker, screenSourceOptions };
