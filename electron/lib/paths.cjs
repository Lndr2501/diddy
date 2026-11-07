// Linux folders of the Electron shell. The config folder is the one the Tauri build uses
// (`$XDG_CONFIG_HOME/app.diddy.desktop`), so saved connections and the icon choice carry over.
// Browser data (logins, keys) lives in its own folder: WebKitGTK's store cannot be read by Chromium.
const path = require('node:path');

const IDENTIFIER = 'app.diddy.desktop';

const home = (env) => env.HOME || '/';

const xdg = (env, name, fallback) =>
  env[name] && path.isAbsolute(env[name]) ? env[name] : path.join(home(env), fallback);

const configDir = (env = process.env) => path.join(xdg(env, 'XDG_CONFIG_HOME', '.config'), IDENTIFIER);

const browserDataDir = (env = process.env) =>
  path.join(xdg(env, 'XDG_DATA_HOME', '.local/share'), IDENTIFIER, 'electron');

/** Same place as the Tauri build: `$XDG_STATE_HOME/diddy` (default ~/.local/state/diddy). */
const logDir = (env = process.env) => path.join(xdg(env, 'XDG_STATE_HOME', '.local/state'), 'diddy');

module.exports = { IDENTIFIER, configDir, browserDataDir, logDir };
