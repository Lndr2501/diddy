// Single sign-on in the Linux shell. The login page sends the window to the homeserver's
// /login/sso/redirect, which leads through the identity provider back to Diddy with a
// `loginToken`. The main window must not leave Diddy, and handing the flow to the system browser
// logs in the browser instead of the app. So the flow runs in a child window with the same
// session; when it comes back to Diddy's own address, that address is loaded in the main window.

/** True for the homeserver address that starts single sign-on (any client API version). */
const isSsoStart = (url) => {
  try {
    const u = new URL(url);
    return (
      (u.protocol === 'https:' || u.protocol === 'http:') &&
      /\/_matrix\/client\/[^/]+\/login\/sso\/redirect(\/[^/]+)?$/.test(u.pathname)
    );
  } catch {
    return false;
  }
};

/**
 * Opens the sign-on flow next to `parent`. `onReturn(url)` gets the first address on `appOrigin`
 * (it carries the login token); the child window closes then.
 */
const openSsoWindow = ({ BrowserWindow, shell, parent, url, appOrigin, originOf, log = () => {} }) => {
  const child = new BrowserWindow({
    parent,
    width: 520,
    height: 720,
    title: 'Sign in',
    autoHideMenuBar: true,
    webPreferences: {
      session: parent.webContents.session,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  let done = false;
  const intercept = (event, target) => {
    if (done || originOf(target) !== appOrigin) return;
    event.preventDefault();
    done = true;
    log('sso: returned to the app');
    if (!parent.isDestroyed()) parent.loadURL(target).catch(() => undefined);
    if (!child.isDestroyed()) child.close();
  };
  child.webContents.on('will-navigate', intercept);
  child.webContents.on('will-redirect', intercept);
  child.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) shell.openExternal(target).catch(() => undefined);
    return { action: 'deny' };
  });
  log('sso: started');
  child.loadURL(url).catch(() => undefined);
  return child;
};

module.exports = { isSsoStart, openSsoWindow };
