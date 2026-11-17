# Android device acceptance

Implementation snapshot: changes for #233, 2026-11-17. **No physical Android device was connected**
during this work (confirmed by Luis). None of the checks below has a recorded hardware pass.
Hardware follow-up: [#253](https://github.com/Lndr2501/diddy/issues/253). Keep this checklist open there when closing the implementation epic.
Use dedicated test accounts, rooms and a test gateway. Never publish tokens, recovery keys, real
messages, endpoint URLs, full logcat dumps or private device identifiers with the report.

Record APK commit/hash/version, device model, OS, ABI/page size, distributor version, result and
sanitized evidence for each case. Cover the minimum Android 8/API 26, a current Pixel/AOSP device
and a device with manufacturer battery restrictions; test real ARM 16-KB hardware where available.

- [ ] Sign in (password and supported OAuth), encrypted messages and media both directions with
  desktop/iOS; verification, recovery and backup; process restart/reboot preserves keys/session.
- [ ] Install a newer APK with the same release signature without uninstalling; verify session,
  history, recovery and files remain usable. Debug installation uses another ID/signature.
- [ ] MyInstants import/delete/re-add across Android and desktop/iOS; repeat offline, reconnect,
  restart, concurrent changes and account switching. No sound list leaks between accounts.
- [ ] Logout offline/server error preserves account, sync, queued changes and call; retry succeeds;
  explicit local-only removal warns that the server session remains. Revoke from another device.
- [ ] UnifiedPush distributor → Matrix gateway → encrypted message and incoming call after normal
  process end, Doze and reboot; tap opens the correct account/room. Repeat endpoint changes, DND,
  read-elsewhere, delayed/cancelled calls, denied notification permission and gateway outage.
  Force-stop is a separate case: no guaranteed delivery until the user starts the app again.
- [ ] Incoming DM call with the app closed: call-style notification with Decline and Answer
  (also via push); Answer opens Diddy and joins. A call push that arrives after the ring expired
  (airplane mode while ringing) does not ring. Hang up from the ongoing-call notification.
- [ ] App sound with a shared screen (Android 10+): a YouTube app and a game are heard by the other
  side; Diddy's own sound (call, soundboard, Watch Together) does not come back; the switch in
  Settings > Calls turns it off.
- [ ] Install from F-Droid over a GitHub install (and the reverse): it updates in place, session kept.
- [ ] Thirty-minute encrypted call with locked screen, app switching and Wi-Fi/mobile handover.
  Check microphone, echo, speaker, Bluetooth/USB/wired route changes and interruption by phone call.
- [ ] Android ↔ desktop ↔ iOS call: camera, remote screen, mute/deafen, volume, reconnect and leaving.
  Verify key rotation on device departure, expiry/kick and rapid rejoin. Removed devices receive no
  new key; a spoofed SFU identity or plaintext/wrong-device to-device message is rejected.
- [ ] MediaProjection permission per session, rotation, revocation, system stop and screen lock.
  Confirm tracks/services stop, audio call remains separately controlled, and recovery/key screens
  are hidden from capture. No microphone/camera remains active after leaving or error.
- [ ] Voice-message formats from each platform; record/play/seek Ogg/Opus, WebM/Opus and M4A where
  Android codecs support them; unsupported or corrupt files report errors without looping downloads.
- [ ] Plugin sandbox attempts file/session/host access, forged bridge messages, popup and navigation.
  Check URI sharing/deep links with wrong account, malformed targets and permission denial.
- [ ] TalkBack, large text, IME, rotation, predictive back, tablet/foldable layout, low storage and
  revoked permissions. Measure battery/CPU/network on hardware for background push and active calls.

Automated coverage is narrower: JVM tests exercise sync merge/tombstones/wire parity, logout
failure/cancellation and key authorization/rotation decisions. Instrumentation tests exercise actual
JNI/Keystore and app recreation. They do not log into a Matrix server or exchange call media/push.
