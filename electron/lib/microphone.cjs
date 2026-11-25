// The system's microphone permission for Diddy. On Windows, Settings > Privacy & security >
// Microphone > "Let desktop apps access your microphone" decides whether Chromium gets the
// microphone at all; switched off, the call joins without sound or getUserMedia fails, and before
// nobody told the user why. Electron objects are injected, so this runs headless in the tests.
const ANSWERS = new Set(['granted', 'denied', 'restricted', 'not-determined']);
const SETTINGS_URI = 'ms-settings:privacy-microphone';

const createMicrophoneAccess = ({ platform, systemPreferences, shell, log = () => {} }) => {
  let lastLogged;
  /** 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown' (other systems, errors) */
  const microphoneAccess = () => {
    if (platform !== 'win32' || typeof systemPreferences?.getMediaAccessStatus !== 'function') return 'unknown';
    let answer;
    try {
      answer = String(systemPreferences.getMediaAccessStatus('microphone'));
    } catch (error) {
      answer = 'unknown';
      log(`microphone access: query failed: ${error?.message ?? error}`);
    }
    const access = ANSWERS.has(answer) ? answer : 'unknown';
    // logged once per change, not on every call join
    if (access !== lastLogged) {
      lastLogged = access;
      log(`microphone access (Windows privacy settings): ${access}`);
    }
    return access;
  };
  const openMicrophoneSettings = async () => {
    if (platform !== 'win32') throw new Error('Only on Windows');
    await shell.openExternal(SETTINGS_URI);
  };
  return { microphoneAccess, openMicrophoneSettings };
};

module.exports = { createMicrophoneAccess, SETTINGS_URI };
