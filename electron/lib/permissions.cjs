// Which browser permissions Diddy's own pages (and Element Call, served from the same origin) get.
// Microphone ('media', also for voice messages), camera, screen, notifications; nothing else, and
// nothing for any other origin.
const MEDIA_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'notifications',
  'fullscreen',
  'clipboard-sanitized-write',
  'speaker-selection',
]);

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

const isAllowed = (permission, requestingUrl, appOrigin) =>
  MEDIA_PERMISSIONS.has(permission) && originOf(requestingUrl) === appOrigin;

/** Installs request and check handlers on an Electron session. */
const configurePermissions = (ses, appOrigin) => {
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(isAllowed(permission, details?.requestingUrl, appOrigin));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => isAllowed(permission, requestingOrigin, appOrigin));
};

module.exports = { MEDIA_PERMISSIONS, originOf, isAllowed, configurePermissions };
