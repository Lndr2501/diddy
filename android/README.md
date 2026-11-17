# Diddy for Android

The native Android app: Kotlin and Jetpack Compose, with the same matrix-rust-sdk and LiveKit as
the iPhone app. It follows the iPhone app screen by screen (tabs, chat list, chat, servers,
voice channels), not the desktop layout.

## Install a test build

1. Open the latest run of **Build Android** in GitHub Actions and download the artifact
   `diddy-android`.
2. Unzip it and open the APK on the phone. Android asks once to allow installing apps
   from that source.
3. The debug build is called `app.diddy.android.debug`, so it can sit next to a later release
   build.

## Install a release

Download `Diddy_X.Y.Z_Android.apk` from the [GitHub release](https://github.com/Lndr2501/diddy/releases/latest)
and open it on the phone (Android 8 or later, arm64 or x86_64). Allow installation from that source
when asked. Releases use `app.diddy.android` and a stable signing key, so later APKs update the same
app and keep its data. Test builds with the `.debug` app id remain separate.

`release.yml` runs the Android unit tests, builds and verifies the signed APK, and publishes it
alongside the desktop/iOS packages and `SHA256SUMS`. Release tags require all four repository secrets:
`DIDDY_ANDROID_KEYSTORE` (base64 JKS), `DIDDY_ANDROID_KEYSTORE_PASSWORD`, `DIDDY_ANDROID_KEY_ALIAS`
and `DIDDY_ANDROID_KEY_PASSWORD`. Keep a protected backup of the key and passwords: replacing the
key prevents upgrades of existing installations. Non-tag builds fall back to debug when signing
is not configured.

## Build here

```sh
cd android
echo "sdk.dir=$HOME/android-sdk" > local.properties   # once, path to your Android SDK
./gradlew testDebugUnitTest      # logic tests (no device needed)
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew lintDebug assembleDebugAndroidTest
```

JDK 17, Android SDK platform 37. The build copies the desktop's sound pack and built-in plugins
(`cinny/public/sound/diddy`, `cinny/src/app/plugins/builtin`) and the emoji table of the iPhone app
into the APK, so all apps sound and work the same.

## What is in it

- Login (password, OAuth/MAS, registration), several accounts, themes, Page Zoom
- Chats, servers with categories and voice channels, activity, invites, folders and order of servers
- Chat: rich text and Markdown like desktop, replies, threads, edits, reactions, pins, search,
  jump to date, read receipts, typing, pictures, video, files, voice messages, link previews,
  bot and music cards, custom emoji and stickers, drafts
- Profiles: Diddy profile card, name styles, banner, badges, status, profile editor, Diddy
  Options room setup
- Members with roles, kick, ban, invite; room and server settings; create rooms, channels and
  servers; explore public rooms
- Calls and voice channels (MatrixRTC + LiveKit, Element Call media keys): camera, screen
  sharing, speaker, deafen, per-person volume, ringing in DMs, incoming call screen, soundboard
  with MyInstants search, Watch Together (YouTube with SponsorBlock), the phone as camera and
  microphone for the computer
- Notifications: UnifiedPush (ntfy and others) or a background connection, with message,
  mention, invite and call notifications; ntfy call alerts
- Emoji verification, recovery key, key backup, devices
- Plugins (same contract as desktop and iOS), pinned under You
- Share into a chat from other apps; matrix.to and `matrix:` links open in Diddy

## Notes

- Notifications: either push through a UnifiedPush app such as ntfy (Settings > Notifications >
  Push), or the background connection. Push needs no open connection and saves battery.
- Watch Together, the soundboard with MyInstants search and the phone as camera and microphone
  for the computer (companion) work like on the iPhone.

## Implementation and verification (#233)

The implementation is in `main`; hardware acceptance is a separate requirement, not implied by a
successful build. See [the platform matrix](../docs/plattformen.md), [device checklist](ACCEPTANCE.md) and open
hardware acceptance [#253](https://github.com/Lndr2501/diddy/issues/253).

- MyInstants imports and removals use `app.diddy.soundboard`, the same format as desktop/iOS.
  Pending changes survive offline and are retried on foreground/reconnect. Downloads are limited
  to MyInstants; own audio files stay local. Synced clips and queued changes are separated by account.
  While foregrounded the list refreshes every 30 seconds and immediately after local changes.
- Failed server logout preserves the session and sync. You can retry, cancel, or explicitly remove
  the account from this device while leaving the server session active. Revoked sessions can be removed.
- Encrypted calls share media keys only with current MatrixRTC member devices that are also on the
  media server. Incoming keys require encrypted to-device provenance matching the claimed device.
  Keys rotate when a member leaves Matrix or disconnects from media. The random key replaces the
  existing sender slot without detaching the frame cryptor; the UI shows encryption and
  member-check failures. No plaintext fallback when the room's encryption state cannot be read.
  Matrix membership changes are checked every five seconds during a call; media disconnects rotate
  immediately. Mixed-client rejoin/rotation still needs the hardware interoperability checks below.
- Recovery screens use Android's secure-window flag to keep keys out of screenshots and projection.
- CI runs unit tests, Android lint, debug/instrumentation APK builds and native ELF alignment checks
  for arm64/x86_64. Emulator jobs cover API 26 and the API 35 `google_apis_ps16k` image: real native
  library loading, binary media-key installation, Keystore session storage, cold start and recreation.
  The page size reported by the emulator is included in the report; an x86 image is not proof of
  ARM hardware behavior. Emulator reports contain only synthetic data.

Still outside this implementation: Android system-audio capture, Play/F-Droid publication, and full
parity with every newly added desktop/iOS feature (for example Saved Messages and language import).
UnifiedPush is implemented; FCM is not provided. An attached distributor and actual homeserver/gateway
must be tested end to end. A permanent background connection is an optional fallback, not a push guarantee.
