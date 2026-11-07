// Diddy on Linux: the same frontend as the Tauri build, in Electron (Chromium) instead of WebKitGTK.
//
// Why: WebKitGTK does WebRTC through GStreamer instead of libwebrtc and cannot run Element Call
// properly: offers without a BUNDLE group (rejected by LiveKit), a deadlock in its network process
// ICE agent, broken receive transceivers, and above all no working RTCRtpScriptTransform, so
// encrypted calls are impossible. Chromium uses libwebrtc like Safari/WKWebView on macOS.
//
// The page talks to this process through the same tiny API as in Tauri
// (`__TAURI_INTERNALS__.invoke`, see preload.cjs), so the frontend does not know the difference.
const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  desktopCapturer,
  dialog,
  ipcMain,
  nativeImage,
  screen,
  session,
  shell,
} = require('electron');
const { configDir, browserDataDir } = require('./lib/paths.cjs');
const diag = require('./lib/diag.cjs');
const connections = require('./lib/connections.cjs');
const myinstants = require('./lib/myinstants.cjs');
const { fitIntoArea, parseWindowState } = require('./lib/windowFit.cjs');
const { startStaticServer } = require('./lib/staticServer.cjs');
const { parseAgentVoiceLaunch, createAgentVoiceTrigger } = require('./lib/agentVoice.cjs');

const APP_PORT = 44548;
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
  } catch {
    return 'dev';
  }
})();
const ICON_IDS = ['pink', 'blue', 'purple', 'black', 'magenta'];
const MEDIA_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'notifications',
  'fullscreen',
  'clipboard-sanitized-write',
  'speaker-selection',
]);

const firstExisting = (candidates) => candidates.find((dir) => dir && fs.existsSync(dir));
const frontendDir = firstExisting([
  process.env.DIDDY_FRONTEND_DIR,
  path.join(__dirname, '..', 'frontend'),
  path.join(__dirname, '..', 'cinny', 'dist'),
]);
const iconsDir = firstExisting([
  process.env.DIDDY_ICONS_DIR,
  path.join(__dirname, '..', 'app-icons'),
  path.join(__dirname, '..', 'src-tauri', 'app-icons'),
]);
// DIDDY_DEV_URL=http://localhost:8080 loads the Vite dev server instead of the built frontend.
const appUrl = process.env.DIDDY_DEV_URL || `http://localhost:${APP_PORT}`;
const appOrigin = new URL(appUrl).origin;

app.setName('Diddy');
app.setPath('userData', browserDataDir());
// Same as the Tauri build on Linux: call sounds and remote audio may play without a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Screen sharing on Wayland goes through the desktop portal (PipeWire).
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');

/** label ("main" or "connection-<id>") -> BrowserWindow */
const windows = new Map();
/** webContents id -> connection profile of a separate login */
const profilesByContents = new Map();
const configuredSessions = new WeakSet();
const opening = new Set();

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

// ---- window state -------------------------------------------------------------------------

const windowStateFile = () => path.join(configDir(), 'electron-window-state.json');

const readWindowStates = () => {
  try {
    const all = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'));
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
};

const restoredBounds = (label) => {
  const saved = parseWindowState(JSON.stringify(readWindowStates()[label] ?? null));
  if (!saved) return { width: 1200, height: 800, maximized: false };
  const area = screen.getDisplayMatching(saved).workArea;
  const fitted = fitIntoArea(saved, area);
  if (fitted.width !== saved.width || fitted.height !== saved.height || fitted.x !== saved.x || fitted.y !== saved.y) {
    diag.writeLine(`window: restored rect ${JSON.stringify(saved)} did not fit the screen, now ${JSON.stringify(fitted)}`);
  }
  return { ...fitted, maximized: saved.maximized };
};

const saveWindowState = (label, win) => {
  try {
    const all = readWindowStates();
    all[label] = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(windowStateFile(), JSON.stringify(all));
  } catch {
    // not worth failing for
  }
};

// ---- app icon -------------------------------------------------------------------------------

const iconFile = () => path.join(configDir(), 'app-icon');

const savedIconId = () => {
  try {
    const id = fs.readFileSync(iconFile(), 'utf8').trim();
    return ICON_IDS.includes(id) ? id : undefined;
  } catch {
    return undefined;
  }
};

const iconImage = (id) => (iconsDir ? nativeImage.createFromPath(path.join(iconsDir, `${id}.png`)) : undefined);

const setAppIcon = (id, persist) => {
  if (!ICON_IDS.includes(id)) throw new Error(`unknown icon: ${id}`);
  const image = iconImage(id);
  if (image && !image.isEmpty()) windows.forEach((win) => win.setIcon(image));
  if (persist) {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(iconFile(), id);
  }
};

// ---- sessions: permissions and screen sharing -----------------------------------------------

const configureSession = (ses) => {
  if (configuredSessions.has(ses)) return;
  configuredSessions.add(ses);
  // Microphone, camera, screen and notifications only for Diddy's own pages (incl. Element Call,
  // which is served from the same origin); everything else is denied.
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(MEDIA_PERMISSIONS.has(permission) && originOf(details.requestingUrl) === appOrigin);
  });
  ses.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      MEDIA_PERMISSIONS.has(permission) && originOf(requestingOrigin) === appOrigin
  );
  // getDisplayMedia(): on Wayland the desktop portal lets the user pick a screen or window and
  // returns exactly that source; elsewhere the first screen is shared.
  ses.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (originOf(request.securityOrigin ?? request.frame?.url ?? '') !== appOrigin) {
        callback({});
        return;
      }
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources) => callback(sources.length > 0 ? { video: sources[0] } : {}))
        .catch((error) => {
          diag.writeLine(`screenshare: no source (${error.message})`);
          callback({});
        });
    },
    { useSystemPicker: true }
  );
};

// ---- windows --------------------------------------------------------------------------------

const revealWindow = (win) => {
  if (win.isDestroyed() || win.isVisible()) return;
  win.show();
  win.focus();
};

const createClientWindow = (label, profile) => {
  const bounds = restoredBounds(label);
  const partition = profile ? `persist:connection-${profile.id}` : undefined;
  const win = new BrowserWindow({
    title: profile ? `Diddy · ${profile.server}` : 'Diddy',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 480,
    minHeight: 400,
    show: false,
    backgroundColor: '#140812',
    icon: iconImage(savedIconId() ?? 'pink'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      // Calls keep running while the window is in the background (Tauri: throttling disabled).
      backgroundThrottling: false,
    },
  });
  if (bounds.maximized) win.maximize();
  windows.set(label, win);
  if (profile) profilesByContents.set(win.webContents.id, profile);
  configureSession(win.webContents.session);

  const contentsId = win.webContents.id;
  win.once('ready-to-show', () => revealWindow(win));
  // Never stay invisible if the page hangs while loading (#25).
  setTimeout(() => revealWindow(win), 10000);
  const persistState = () => saveWindowState(label, win);
  win.on('resized', persistState);
  win.on('moved', persistState);
  win.on('close', persistState);
  win.on('closed', () => {
    windows.delete(label);
    profilesByContents.delete(contentsId);
  });

  // Links open in the system browser; the window itself never leaves Diddy.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (originOf(url) === appOrigin) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => undefined);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    diag.writeLine(`window: renderer gone label=${label} reason=${details.reason} code=${details.exitCode}`);
  });

  win.loadURL(appUrl).catch((error) => diag.writeLine(`window: load failed label=${label}: ${error.message}`));
  return win;
};

const focusWindow = (win) => {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
};

const focusOrReopenMain = () => {
  const main = windows.get('main');
  if (main) focusWindow(main);
  else createClientWindow('main');
};

// ---- separate logins (connection profiles) --------------------------------------------------

const openConnectionProfile = ({ id, server }) => {
  if (id === 'main') {
    if (server !== undefined && server !== null) throw new Error('Die ursprüngliche Anmeldung wird nicht verändert.');
    focusOrReopenMain();
    return;
  }
  connections.checkProfileId(id);
  const dir = configDir();
  const profiles = connections.readProfiles(dir);
  let profile = profiles.find((saved) => saved.id === id);
  let isNew = false;
  if (profile) {
    if (server !== undefined && server !== null && connections.normalizeServer(server) !== profile.server) {
      throw new Error('Für einen anderen Server bitte eine neue Verbindung anlegen.');
    }
  } else {
    if (profiles.length >= connections.MAX_PROFILES) throw new Error('Es sind bereits 20 Verbindungen gespeichert.');
    if (server === undefined || server === null) throw new Error('Diese Verbindung ist nicht gespeichert.');
    profile = { id, server: connections.normalizeServer(server) };
    isNew = true;
  }
  const label = `connection-${id}`;
  const existing = windows.get(label);
  if (existing) {
    focusWindow(existing);
    return;
  }
  if (opening.has(label)) throw new Error('Das Verbindungsfenster wird gerade geöffnet.');
  opening.add(label);
  try {
    createClientWindow(label, profile);
  } finally {
    opening.delete(label);
  }
  if (isNew) {
    const current = connections.readProfiles(dir);
    if (!current.some((saved) => saved.id === id)) {
      connections.saveProfiles(dir, [...current, profile]);
    }
  }
  diag.writeLine(`connection: opened profile ${id}`);
};

const removeConnectionProfile = async ({ id }) => {
  const dir = configDir();
  const kept = connections.removeProfile(connections.readProfiles(dir), id);
  const label = `connection-${id}`;
  if (opening.has(label)) throw new Error('Das Verbindungsfenster wird gerade geöffnet; bitte danach erneut versuchen.');
  windows.get(label)?.destroy();
  connections.saveProfiles(dir, kept);
  try {
    const ses = session.fromPartition(`persist:connection-${id}`);
    await ses.clearStorageData();
    await ses.clearCache();
    fs.rmSync(path.join(app.getPath('userData'), 'Partitions', `connection-${id}`), { recursive: true, force: true });
    diag.writeLine(`connection: removed profile ${id}`);
  } catch (error) {
    diag.writeLine(`connection: removed profile ${id} but data cleanup failed: ${error.message}`);
    throw new Error('Der Datenspeicher der Verbindung konnte nicht gelöscht werden.');
  }
};

const agentVoice = createAgentVoiceTrigger();

/** `diddy --agent-voice start|stop|toggle` (#57). True when the launch was one of these. */
const handleAgentVoiceLaunch = (argv) => {
  const parsed = parseAgentVoiceLaunch(argv);
  if (!parsed) return false;
  if (parsed.error) diag.writeLine(`agent voice: ${parsed.error}`);
  else agentVoice.apply(parsed.command);
  return true;
};

const handleLaunch = (argv) => {
  let request;
  try {
    request = connections.parseLaunch(argv);
  } catch {
    diag.writeLine('connection: rejected invalid launch options');
    return true;
  }
  if (!request) return false;
  try {
    openConnectionProfile(request);
  } catch (error) {
    diag.writeLine(`connection: launch failed: ${error.message}`);
  }
  return true;
};

// ---- commands of the page (same names and arguments as the Tauri commands) ----------------

const commands = {
  diag_log: ({ line }) => diag.writeLine(String(line ?? '')),
  log_path: () => diag.logFile(),
  open_log_folder: async () => {
    const dir = path.dirname(diag.logFile());
    fs.mkdirSync(dir, { recursive: true });
    const error = await shell.openPath(dir);
    if (error) throw new Error(error);
  },
  myinstants_fetch_text: ({ url }) => myinstants.fetchText(String(url)),
  myinstants_fetch_audio: ({ url }) => myinstants.fetchAudio(String(url)),
  connection_profiles: () => connections.readProfiles(configDir()),
  open_connection_profile: (args) => openConnectionProfile(args),
  remove_connection_profile: (args) => removeConnectionProfile(args),
  set_app_icon: ({ id }) => setAppIcon(String(id), true),
  agent_voice_state: () => agentVoice.state(),
};

ipcMain.handle('diddy:invoke', async (event, cmd, args) => {
  // Only Diddy's own top-level page may call these (not Element Call's frame, not other sites).
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame || originOf(frame.url) !== appOrigin) {
    return { ok: false, error: 'not allowed' };
  }
  const command = Object.prototype.hasOwnProperty.call(commands, cmd) ? commands[cmd] : undefined;
  if (!command) return { ok: false, error: `unknown command: ${cmd}` };
  try {
    const value = await command(args && typeof args === 'object' ? args : {});
    return { ok: true, value: value ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.on('diddy:connection', (event) => {
  event.returnValue = profilesByContents.get(event.sender.id) ?? null;
});

// ---- start ----------------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  // Another Diddy runs: it receives our arguments through 'second-instance'.
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Agent-voice triggers come in while the user dictates elsewhere: never focus Diddy.
    if (handleAgentVoiceLaunch(argv)) return;
    if (!handleLaunch(argv)) focusOrReopenMain();
  });

  app.whenReady().then(async () => {
    diag.writeLine(
      `---- Diddy ${VERSION} started (linux ${process.arch}, electron ${process.versions.electron}, chromium ${process.versions.chrome}) ----`
    );
    Menu.setApplicationMenu(null);
    if (!process.env.DIDDY_DEV_URL) {
      if (!frontendDir) {
        dialog.showErrorBox('Diddy', 'Die Diddy-Oberfläche wurde nicht gefunden (DIDDY_FRONTEND_DIR).');
        app.quit();
        return;
      }
      try {
        await startStaticServer(frontendDir, APP_PORT);
      } catch (error) {
        diag.writeLine(`startup: port ${APP_PORT} not available: ${error.message}`);
        dialog.showErrorBox(
          'Diddy',
          `Diddy braucht den lokalen Port ${APP_PORT}, er ist aber belegt (läuft Diddy schon in einer anderen Version?).`
        );
        app.quit();
        return;
      }
    }
    createClientWindow('main');
    handleLaunch(process.argv);
  });

  app.on('window-all-closed', () => app.quit());
}
