// Right-click menu and keyboard/mouse shortcuts of the Linux shell. Electron has no default context
// menu and Diddy hides the application menu, so what macOS gets from WebKit and the menu bar
// (Cut/Copy/Paste, spelling, Cmd+Q, full screen, Back/Forward) is done here.
// The pure parts (template building, key matching) are exported for tests/shellInput.test.cjs.

const MAX_SUGGESTIONS = 5;
const isWebUrl = (value) => /^https?:\/\//i.test(typeof value === 'string' ? value : '');

/**
 * Menu template for a `context-menu` event. `actions` does the things a template cannot express
 * itself: replaceMisspelling(word), addToDictionary(word), copyLink(url). An empty array means
 * "show nothing".
 */
const buildContextMenuTemplate = (params, actions) => {
  const flags = params.editFlags ?? {};
  const template = [];
  const separate = () => {
    if (template.length && template[template.length - 1].type !== 'separator') template.push({ type: 'separator' });
  };

  if (params.isEditable) {
    const word = params.misspelledWord;
    if (word) {
      const suggestions = (params.dictionarySuggestions ?? []).slice(0, MAX_SUGGESTIONS);
      for (const suggestion of suggestions) {
        template.push({ label: suggestion, click: () => actions.replaceMisspelling(suggestion) });
      }
      if (!suggestions.length) template.push({ label: 'No suggestions', enabled: false });
      template.push({ label: 'Add to dictionary', click: () => actions.addToDictionary(word) });
      separate();
    }
    template.push(
      { role: 'undo', enabled: !!flags.canUndo },
      { role: 'redo', enabled: !!flags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: !!flags.canCut },
      { role: 'copy', enabled: !!flags.canCopy },
      { role: 'paste', enabled: !!flags.canPaste },
      { role: 'selectAll', enabled: !!flags.canSelectAll }
    );
  } else if (typeof params.selectionText === 'string' && params.selectionText.trim()) {
    template.push({ role: 'copy' });
  }

  if (isWebUrl(params.linkURL)) {
    separate();
    template.push({ label: 'Copy link', click: () => actions.copyLink(params.linkURL) });
  }
  return template;
};

/**
 * Which shell shortcut a key press is, if any. Only plain key downs count (no auto-repeat, no IME
 * composition), and extra modifiers disqualify (Ctrl+Shift+Q stays free for the page).
 */
const shortcutFor = (input) => {
  if (!input || input.type !== 'keyDown' || input.isAutoRepeat || input.isComposing) return undefined;
  const { control, alt, shift, meta } = input;
  if (control && !alt && !shift && !meta && String(input.key).toLowerCase() === 'q') return 'quit';
  if (!control && !alt && !shift && !meta && input.key === 'F11') return 'fullscreen';
  if (alt && !control && !shift && !meta) {
    if (input.key === 'ArrowLeft') return 'back';
    if (input.key === 'ArrowRight') return 'forward';
  }
  return undefined;
};

// Windows that listen to the preload's mouse side buttons ('diddy:nav'), by webContents id.
const navWindows = new Set();
let navListening = false;

const navigate = (contents, direction) => {
  const history = contents.navigationHistory;
  if (direction === 'back' && history.canGoBack()) history.goBack();
  else if (direction === 'forward' && history.canGoForward()) history.goForward();
};

const listenForNavigation = (ipcMain, originOf, appOrigin) => {
  if (navListening) return;
  navListening = true;
  ipcMain.on('diddy:nav', (event, direction) => {
    const contents = event.sender;
    if (!navWindows.has(contents.id)) return;
    const frame = event.senderFrame;
    if (!frame || frame !== contents.mainFrame || originOf(frame.url) !== appOrigin) return;
    if (direction === 'back' || direction === 'forward') navigate(contents, direction);
  });
};

/** Hooks the right-click menu and the shortcuts into one Diddy window. */
const installShellInput = (win, { appOrigin, originOf }) => {
  const { app, clipboard, ipcMain, Menu } = require('electron');
  const contents = win.webContents;

  contents.on('context-menu', (_event, params) => {
    // Only Diddy's own pages: the top frame and the same-origin call iframe.
    if (originOf(params.frame?.url ?? params.pageURL ?? '') !== appOrigin) return;
    const template = buildContextMenuTemplate(params, {
      replaceMisspelling: (word) => contents.replaceMisspelling(word),
      addToDictionary: (word) => contents.session.addWordToSpellCheckerDictionary(word),
      copyLink: (url) => clipboard.writeText(url),
    });
    if (template.length) Menu.buildFromTemplate(template).popup({ window: win });
  });

  contents.on('before-input-event', (event, input) => {
    const shortcut = shortcutFor(input);
    if (!shortcut) return;
    if (shortcut === 'quit') app.quit();
    else if (shortcut === 'fullscreen') win.setFullScreen(!win.isFullScreen());
    else navigate(contents, shortcut);
    event.preventDefault();
  });

  const id = contents.id;
  navWindows.add(id);
  listenForNavigation(ipcMain, originOf, appOrigin);
  win.once('closed', () => navWindows.delete(id));
};

module.exports = { buildContextMenuTemplate, shortcutFor, installShellInput };
