# Diddy for Android

The native Android app: Kotlin and Jetpack Compose, with the same matrix-rust-sdk and LiveKit as
the iPhone app. It follows the iPhone app screen by screen (tabs, chat list, chat, servers,
voice channels), not the desktop layout.

## Install a test build

1. Open the latest run of **Build Android** in GitHub Actions and download the artifact
   `diddy-android`.
2. Unzip it and open `app-debug.apk` on the phone. Android asks once to allow installing apps
   from that source.
3. The debug build is called `app.diddy.android.debug`, so it can sit next to a later release
   build.

## Build here

```sh
cd android
echo "sdk.dir=$HOME/android-sdk" > local.properties   # once, path to your Android SDK
./gradlew testDebugUnitTest      # logic tests (no device needed)
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
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
- Notifications: a background connection (Settings > Notifications) with message, mention,
  invite and call notifications; ntfy call alerts
- Emoji verification, recovery key, key backup, devices
- Plugins (same contract as desktop and iOS), pinned under You
- Share into a chat from other apps; matrix.to and `matrix:` links open in Diddy

## Not built yet on Android

- Watch Together
- Using the phone as camera/microphone for the computer (companion)
- MyInstants search in the soundboard
- Push without the background connection (UnifiedPush): notifications need the background
  connection for now
