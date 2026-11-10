// Switchable app icon (same ids and config file as the Tauri build, src-tauri/src/app_icon.rs).
// X11 shows the window icon; Wayland takes the taskbar icon from the .desktop file, so the choice
// may not change the dock there (it still applies to the window and is kept for the next start).
const fs = require('node:fs');
const path = require('node:path');

const ICON_IDS = ['pink', 'blue', 'purple', 'black', 'magenta'];

const createAppIcons = ({ iconsDir, configDir, nativeImage, windows, log = () => {}, fileSystem = fs }) => {
  const iconFile = () => path.join(configDir(), 'app-icon');

  const saved = () => {
    try {
      const id = fileSystem.readFileSync(iconFile(), 'utf8').trim();
      return ICON_IDS.includes(id) ? id : undefined;
    } catch {
      return undefined;
    }
  };

  const image = (id) => {
    if (!iconsDir) return undefined;
    const loaded = nativeImage.createFromPath(path.join(iconsDir, `${id}.png`));
    return loaded && !loaded.isEmpty() ? loaded : undefined;
  };

  /** Icon for a new window: the saved choice, else the default. */
  const forNewWindow = () => image(saved() ?? 'pink');

  const set = (id, persist) => {
    if (!ICON_IDS.includes(id)) throw new Error(`unknown icon: ${id}`);
    const loaded = image(id);
    if (loaded) windows.forEach((win) => win.setIcon(loaded));
    else log(`app icon: ${id}.png not found in ${iconsDir ?? '(no icons folder)'}`);
    if (persist) {
      fileSystem.mkdirSync(configDir(), { recursive: true });
      fileSystem.writeFileSync(iconFile(), id);
    }
  };

  return { saved, forNewWindow, set };
};

module.exports = { ICON_IDS, createAppIcons };
