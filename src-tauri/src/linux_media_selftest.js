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
    if (r.rtc === 'function') {
      // two peer connections in this page: offer/answer, ICE and a data channel message
      try {
        const a = new RTCPeerConnection();
        const b = new RTCPeerConnection();
        a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
        b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
        const channel = a.createDataChannel('selftest');
        const received = new Promise((resolve) => {
          b.ondatachannel = (e) => {
            e.channel.onmessage = (m) => resolve(m.data);
          };
        });
        channel.onopen = () => channel.send('pong');
        await a.setLocalDescription(await a.createOffer());
        await b.setRemoteDescription(a.localDescription);
        await b.setLocalDescription(await b.createAnswer());
        await a.setRemoteDescription(b.localDescription);
        r.loopback = await Promise.race([
          received,
          new Promise((resolve) => setTimeout(() => resolve('timeout'), 15000)),
        ]);
        a.close();
        b.close();
      } catch (e) {
        r.loopback = `ERR ${e.name} ${e.message}`;
      }
    }
  } catch (e) {
    r.error = String(e);
  }
  r.done = true;
  report();
})();
