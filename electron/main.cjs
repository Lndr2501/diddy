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
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session,
  shell,
} = require('electron');
const { configDir, browserDataDir } = require('./lib/paths.cjs');
const diag = require('./lib/diag.cjs');
const connections = require('./lib/connections.cjs');
const { createConnectionWindows, partitionOf } = require('./lib/connectionWindows.cjs');
const { createAppIcons } = require('./lib/appIcon.cjs');
const { originOf, configurePermissions } = require('./lib/permissions.cjs');
const myinstants = require('./lib/myinstants.cjs');
const { fitIntoArea, parseWindowState, guardWindowBounds } = require('./lib/windowFit.cjs');
const { addFeatureSwitch } = require('./lib/commandLine.cjs');
const { createStartupGate } = require('./lib/startupGate.cjs');
const { shouldReloadAfter, createRateLimiter, describeError } = require('./lib/crashGuard.cjs');
const { startStaticServer } = require('./lib/staticServer.cjs');
const { isSsoStart, openSsoWindow } = require('./lib/ssoWindow.cjs');
const { createSystemAudio } = require('./lib/systemAudio.cjs');
const { createScreenPicker } = require('./lib/screenPicker.cjs');
const { parseAgentVoiceLaunch, createAgentVoiceTrigger } = require('./lib/agentVoice.cjs');
const { createAgentVoiceHotkey } = require('./lib/agentVoiceHotkey.cjs');
const { sanitizeHotkey } = require('./lib/globalHotkey.cjs');
const { startPortalShortcut } = require('./lib/portalShortcut.cjs');
const { installShellInput } = require('./lib/shellInput.cjs');

const APP_PORT = 44548;
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
  } catch {
    return 'dev';
  }
})();

const firstExisting = (candidates) => candidates.find((dir) => dir && fs.existsSync(dir));
const frontendDir = firstExisting([
  process.env.DIDDY_FRONTEND_DIR,
  path.join(process.resourcesPath, 'frontend'),
  path.join(__dirname, '..', 'frontend'),
  path.join(__dirname, '..', 'cinny', 'dist'),
]);
const iconsDir = firstExisting([
  process.env.DIDDY_ICONS_DIR,
  path.join(process.resourcesPath, 'app-icons'),
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
const isWayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
// Merged, not appended: a wrapper may already pass --enable-features (NixOS: WaylandWindowDecorations).
addFeatureSwitch(app.commandLine, isWayland ? 'enable-features' : 'disable-features', 'WebRTCPipeWireCapturer');

// ---- crash handling ---------------------------------------------------------------------------

// Errors that nobody caught are written to the log (like the panic hook on macOS). The app keeps
// running: a stray rejection in a helper must not kill an ongoing call, and without a handler
// Electron would show an error dialog. A burst (more than 10 in 10 s) means the main process is
// stuck in a loop, then it exits instead of spinning.
const uncaughtLimiter = createRateLimiter({ max: 10, windowMs: 10000 });
const logUncaught = (kind, error) => {
  diag.writeLine(`main: ${kind}: ${describeError(error)}`);
  if (!uncaughtLimiter.allow()) {
    diag.writeLine('main: too many uncaught errors, exiting');
    app.exit(1);
  }
};
process.on('uncaughtException', (error) => logUncaught('uncaughtException', error));
process.on('unhandledRejection', (reason) => logUncaught('unhandledRejection', reason));
// GPU, network and utility processes: Chromium restarts them, the log shows why a call froze.
app.on('child-process-gone', (_event, details) => {
  diag.writeLine(`child process gone: type=${details.type} reason=${details.reason} code=${details.exitCode} name=${details.name ?? ''}`);
});
let quitting = false;
app.on('before-quit', () => { quitting = true; });
/** At most 3 renderer reloads per window and minute, so a page that dies on load does not loop. */
const reloadLimiters = new WeakMap();

/** label ("main" or "connection-<id>") -> BrowserWindow */
const windows = new Map();
/** webContents id -> connection profile of a separate login */
const profilesByContents = new Map();
const configuredSessions = new WeakSet();
const opening = new Set();

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

const appIcons = createAppIcons({
  iconsDir,
  configDir,
  nativeImage,
  windows,
  log: (line) => diag.writeLine(line),
});

// ---- sessions: permissions and screen sharing -----------------------------------------------

const pickScreen = createScreenPicker({ BrowserWindow, ipcMain });
let picking = false;
const configureSession = (ses) => {
  if (configuredSessions.has(ses)) return;
  configuredSessions.add(ses);
  // Microphone, camera, screen and notifications only for Diddy's own pages (incl. Element Call,
  // which is served from the same origin); everything else is denied.
  configurePermissions(ses, appOrigin);
  // PipeWire owns the chooser on Wayland. X11 needs our explicit source picker.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (picking || originOf(request.securityOrigin ?? request.frame?.url ?? '') !== appOrigin) {
      callback(null);
      return;
    }
    picking = true;
    let source;
    try {
      const owner = BrowserWindow.getAllWindows().find((win) => win.webContents.mainFrame === request.frame?.top);
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
      diag.writeLine(`screenshare: ${sources.length} sources (${isWayland ? 'Wayland' : 'X11'})`);
      if (owner && !owner.isDestroyed() && sources.length) source = isWayland ? sources[0] : await pickScreen(sources, owner);
    } catch (error) {
      diag.writeLine(`screenshare: source selection failed: ${error.message}`);
    } finally { picking = false; }
    callback(source ? { video: source } : null);
  });
};

// ---- windows --------------------------------------------------------------------------------

const revealWindow = (win) => {
  if (win.isDestroyed() || win.isVisible()) return;
  win.show();
  win.focus();
};

const createClientWindow = (label, profile) => {
  const bounds = restoredBounds(label);
  const partition = profile ? partitionOf(profile.id) : undefined;
  const win = new BrowserWindow({
    title: profile ? `Diddy · ${profile.server}` : 'Diddy',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 480,
    minHeight: 360,
    show: false,
    backgroundColor: '#140812',
    icon: appIcons.forNewWindow(),
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
  installShellInput(win, { appOrigin, originOf });
  win.webContents.on('will-navigate', (event, url) => {
    if (originOf(url) === appOrigin) return;
    event.preventDefault();
    // single sign-on must finish inside the app, the system browser would log in itself
    if (isSsoStart(url)) {
      openSsoWindow({ BrowserWindow, shell, parent: win, url, appOrigin, originOf, log: (l) => diag.writeLine(l) });
      return;
    }
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => undefined);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    diag.writeLine(`window: renderer gone label=${label} reason=${details.reason} code=${details.exitCode}`);
    if (quitting || win.isDestroyed() || !shouldReloadAfter(details.reason)) return;
    if (!reloadLimiters.has(win)) reloadLimiters.set(win, createRateLimiter({ max: 3, windowMs: 60000 }));
    if (!reloadLimiters.get(win).allow()) {
      diag.writeLine(`window: renderer keeps crashing, not reloading label=${label}`);
      return;
    }
    setTimeout(() => {
      if (win.isDestroyed()) return;
      diag.writeLine(`window: reloading after crash label=${label}`);
      win.webContents.reload();
      revealWindow(win);
    }, 500);
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

// ---- window guard (#143 on macOS) -------------------------------------------------------------

// Unplugging a display or changing its resolution can leave a window outside every screen. Windows
// are fitted at creation only otherwise. On Wayland a client can neither read nor set its position
// (the compositor places it), so there only the size is limited.
const guardWindows = () => {
  const primary = screen.getPrimaryDisplay();
  const areas = [primary, ...screen.getAllDisplays().filter((display) => display.id !== primary.id)].map((display) => display.workArea);
  windows.forEach((win, label) => {
    if (win.isDestroyed() || win.isMaximized() || win.isFullScreen() || win.isMinimized()) return;
    const fixed = guardWindowBounds(win.getBounds(), areas, { positionReliable: !isWayland });
    if (!fixed) return;
    diag.writeLine(`window: ${label} no longer on a screen, now ${JSON.stringify(fixed)}`);
    win.setBounds(fixed);
  });
};

const watchDisplays = () => {
  let timer;
  // Display events come in bursts while a monitor is (un)plugged; wait until they settle.
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(guardWindows, 500);
  };
  screen.on('display-removed', schedule);
  screen.on('display-metrics-changed', schedule);
};

// ---- separate logins (connection profiles) --------------------------------------------------

const connectionWindows = createConnectionWindows({
  connections,
  configDir,
  windows,
  opening,
  createWindow: createClientWindow,
  focusWindow,
  focusMain: focusOrReopenMain,
  session,
  userDataDir: () => app.getPath('userData'),
  log: (line) => diag.writeLine(line),
});
const openConnectionProfile = (request) => connectionWindows.open(request);
const removeConnectionProfile = (request) => connectionWindows.remove(request);

const agentVoice = createAgentVoiceTrigger();
// Global hotkey (#135): portal helper on Wayland / KDE / newer GNOME, Electron globalShortcut on X11.
const shortcutHelper = process.env.DIDDY_SHORTCUT_HELPER || path.join(process.resourcesPath, 'diddy-global-shortcut');
const agentVoiceHotkey = createAgentVoiceHotkey({
  trigger: agentVoice,
  globalShortcut,
  helper: shortcutHelper,
  helperAvailable: () => fs.existsSync(shortcutHelper),
  startPortal: startPortalShortcut,
  log: (line) => diag.writeLine(line),
});

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
  account_labels: () => connections.readAccountLabels(configDir()),
  set_account_label: ({ id, user }) => connections.setAccountLabel(configDir(), id, user),
  open_connection_profile: (args) => openConnectionProfile(args),
  remove_connection_profile: (args) => removeConnectionProfile(args),
  set_app_icon: ({ id }) => appIcons.set(String(id), true),
  agent_voice_state: () => agentVoice.state(),
  // Binds the page's hotkey globally (null: unbind). Answers { path: 'portal' | 'x11' | 'window', trigger?, reason? }.
  agent_voice_bind: ({ hotkey }) => agentVoiceHotkey.bind(sanitizeHotkey(hotkey)),
  agent_voice_hotkey_info: () => agentVoiceHotkey.info(),
  // The update check belongs to the macOS shell; Linux has no native updater (the UI still sends this).
  updater_set_config: () => null,
};

const audioCaptures = new Map();
const trusted = (event) => event.senderFrame && event.senderFrame === event.sender.mainFrame && originOf(event.senderFrame.url) === appOrigin;
const audioFor = (contents) => {
  if (!audioCaptures.has(contents.id)) {
    const helper = process.env.DIDDY_AUDIO_HELPER || path.join(process.resourcesPath, 'diddy-system-audio');
    const audio = createSystemAudio({ helper, log: (line) => diag.writeLine(line), send: (message) => { if (!contents.isDestroyed()) contents.send('diddy:audio-data', message); } });
    audioCaptures.set(contents.id, audio);
    contents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) audio.close(); });
    contents.on('render-process-gone', () => audio.close());
    contents.once('destroyed', () => { audio.close(); audioCaptures.delete(contents.id); });
  }
  return audioCaptures.get(contents.id);
};
ipcMain.handle('diddy:audio-start', (event) => {
  if (!trusted(event)) throw new Error('not allowed');
  return audioFor(event.sender).start();
});
ipcMain.handle('diddy:audio-stop', (event, id) => {
  if (trusted(event)) audioCaptures.get(event.sender.id)?.stop(id);
});
ipcMain.on('diddy:audio-ack', (event, id) => {
  if (trusted(event)) audioCaptures.get(event.sender.id)?.ack(id);
});
app.on('before-quit', () => audioCaptures.forEach((audio) => audio.close()));
app.on('will-quit', () => agentVoiceHotkey.close());

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
  // A second launch can arrive before startup (ready, local server) is done; windows are only
  // opened for it once the main window exists.
  const launches = createStartupGate(
    (argv) => {
      if (!handleLaunch(argv)) focusOrReopenMain();
    },
    { onError: (error) => diag.writeLine(`second launch failed: ${error.message}`) }
  );
  app.on('second-instance', (_event, argv) => {
    // Agent-voice triggers come in while the user dictates elsewhere: never focus Diddy. They only
    // flip a flag, so they apply at once, also during startup.
    if (handleAgentVoiceLaunch(argv)) return;
    launches.submit(argv);
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
    // `diddy --agent-voice start` as the first launch: the page reads the flag once it has loaded.
    handleAgentVoiceLaunch(process.argv);
    createClientWindow('main');
    handleLaunch(process.argv);
    launches.open();
    watchDisplays();
  });

  app.on('window-all-closed', () => app.quit());
}
