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

From the first release after 1.12.0 on, Diddy is also meant for F-Droid. F-Droid rebuilds every tag
from source and ships the same signed APK once its bytes match. F-Droid and GitHub installs are
therefore the same app. See [fdroid/README.md](fdroid/README.md) for how the build stays
reproducible, the recipe, the CI check and the one-time submission.

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
./gradlew lintDebug              # Android lint, also in CI
./gradlew connectedDebugAndroidTest   # smoke test on a connected device or emulator
```

CI (`.github/workflows/android.yml`) runs the unit tests, lint and the build, and starts the app
on two emulators: Android 8 (API 26) and Android 15 with 16 KB memory pages. The smoke test
(`app/src/androidTest`) checks that the native libraries load, the login shows and the Keystore
works. No server or account is involved.

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
  sharing with app sound (Android 10+), speaker, deafen, per-person volume, ringing in DMs,
  Android's call notifications (answer, decline, hang up), soundboard with MyInstants search,
  Watch Together (YouTube with SponsorBlock), the phone as camera and microphone for the computer
- Call encryption: the media key goes only to devices with a MatrixRTC membership, keys are only
  taken from members' own devices, a new key when someone leaves, and the call screen says
  whether it is end-to-end encrypted and whose key is missing
- Notifications: UnifiedPush (ntfy and others) or a background connection, with message,
  mention, invite and call notifications; ntfy call alerts
- Emoji verification, recovery key, key backup, devices
- Plugins (same contract as desktop and iOS), pinned under You
- Share into a chat from other apps; matrix.to and `matrix:` links open in Diddy
- Tablets and open foldables: chat list and chat side by side
- Recovery key views are kept out of screenshots and screen sharing

## Notes

- Notifications: either push through a UnifiedPush app such as ntfy (Settings > Notifications >
  Push), or the background connection. Push needs no open connection and saves battery.
- Watch Together, the soundboard with MyInstants search and the phone as camera and microphone
  for the computer (companion) work like on the iPhone.
- After *Force stop* in Android's settings nothing arrives until Diddy is opened again; some
  manufacturers' battery savers delay push. There is no FCM build (it needs a Firebase project).
- App sound with a shared screen works only for apps that allow recording (not for protected
  videos) and goes with the microphone, so it is silent while you are muted.
- Not on Android yet: Agent Voice, changing the app icon, and what 1.12.0 added elsewhere
  (push to talk, polls, saved messages, send later).

## More

- [Architecture and security decisions](../docs/android-architektur.md)
- [Test protocol: what is checked on devices](../docs/android-testprotokoll.md)
- [Features per platform](../docs/plattformen.md)
