// Linux media self test (only with DIDDY_MEDIA_SELFTEST=1, see enable_linux_media in lib.rs).
// Runs in the real Diddy page and reports what WebKitGTK offers to Element Call via diag_log.
(async () => {
  const r = {};
  const report = () =>
    window.__TAURI_INTERNALS__
      .invoke('diag_log', { line: 'linux-selftest ' + JSON.stringify(r) })
      .catch(() => {});
  try {
    r.secure = window.isSecureContext;
    r.rtc = typeof RTCPeerConnection;
    r.gumApi = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    r.displayApi = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
      r.gum = stream.getTracks().map((t) => `${t.kind}:${t.readyState}`).join(',');
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      r.gum = `ERR ${e.name} ${e.message}`;
    }
    try {
      r.devices = (await navigator.mediaDevices.enumerateDevices())
        .map((d) => `${d.kind}${d.label ? '+label' : ''}`)
        .join(',');
    } catch (e) {
      r.devices = `ERR ${e.name}`;
    }
  } catch (e) {
    r.error = String(e);
  }
  r.done = true;
  report();
})();
