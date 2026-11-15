// Folders of the Electron shell.
//
// Linux: the config folder is the one the Tauri build uses (`$XDG_CONFIG_HOME/app.diddy.desktop`),
// so saved connections and the icon choice carry over. Browser data (logins, keys) lives in its own
// folder: WebKitGTK's store cannot be read by Chromium.
//
// Windows: settings in the roaming profile (`%APPDATA%\app.diddy.desktop`), browser data and the log
// in the local one (`%LOCALAPPDATA%\app.diddy.desktop`): keys and caches must not roam.
const path = require('node:path');

const IDENTIFIER = 'app.diddy.desktop';

const isWindows = (platform) => platform === 'win32';

const home = (env) => env.HOME || env.USERPROFILE || '/';

const xdg = (env, name, fallback) =>
  env[name] && path.posix.isAbsolute(env[name]) ? env[name] : path.posix.join(home(env), fallback);

/** A Windows profile folder from the environment, else the usual place below the user folder. */
const windowsDir = (env, name, fallback) =>
  env[name] && path.win32.isAbsolute(env[name])
    ? env[name]
    : path.win32.join(env.USERPROFILE || 'C:\\', fallback);

const configDir = (env = process.env, platform = process.platform) =>
  isWindows(platform)
    ? path.win32.join(windowsDir(env, 'APPDATA', 'AppData\\Roaming'), IDENTIFIER)
    : path.posix.join(xdg(env, 'XDG_CONFIG_HOME', '.config'), IDENTIFIER);

const browserDataDir = (env = process.env, platform = process.platform) =>
  isWindows(platform)
    ? path.win32.join(windowsDir(env, 'LOCALAPPDATA', 'AppData\\Local'), IDENTIFIER, 'electron')
    : path.posix.join(xdg(env, 'XDG_DATA_HOME', '.local/share'), IDENTIFIER, 'electron');

/** Linux: same place as the Tauri build, `$XDG_STATE_HOME/diddy` (default ~/.local/state/diddy). */
const logDir = (env = process.env, platform = process.platform) =>
  isWindows(platform)
    ? path.win32.join(windowsDir(env, 'LOCALAPPDATA', 'AppData\\Local'), IDENTIFIER, 'logs')
    : path.posix.join(xdg(env, 'XDG_STATE_HOME', '.local/state'), 'diddy');

module.exports = { IDENTIFIER, configDir, browserDataDir, logDir };
