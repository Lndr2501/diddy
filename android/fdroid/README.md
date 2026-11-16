# Diddy on F-Droid

Diddy goes to the official F-Droid repository as a **reproducible build with the developer's
signature**, the same way Element X does it:

1. A tag `vX.Y.Z` builds and signs `Diddy_X.Y.Z_Android.apk` in `release.yml`, as before.
2. F-Droid builds the same tag from source (recipe: `recipe.sh`). It checks that its unsigned
   APK has the same bytes as the GitHub APK, apart from the signature.
3. If they match, F-Droid ships **Diddy's own signed APK**. F-Droid and GitHub installs are then
   the same app and update each other. If they differ, F-Droid ships nothing for that version.

No Google parts are in the app: push runs over UnifiedPush, and FCM is not built in. All libraries
are free and come from Maven Central, Google's Maven and JitPack. These include the prebuilt
matrix-rust-sdk, LiveKit and WebRTC libraries, which F-Droid accepts for Element X too.

## What keeps the build reproducible

- `vcsInfo.include = false` and no dependency-info block (`dependenciesInfo`). F-Droid refuses
  that encrypted block. Both are set in `app/build.gradle.kts`.
- No R8/minify, no timestamps, fixed versions for every library (`gradle/libs.versions.toml`).
  The shared sounds, plugins and emoji come from the same commit.
- F-Droid deletes the `signingConfigs` block before it builds. The release build then simply
  stays unsigned.
- `diddyVersionCode` is a plain number, because F-Droid's update check reads it from the
  build file.

The CI job **F-Droid (reproducible build, scanner)** in `android.yml` runs F-Droid's own check on
every pull request:

- One release build signed by Gradle with a throwaway key (as `release.yml` signs with the real one).
- One unsigned build in another path, with its own Gradle home and Gradle on Java 21.
- `apksigcopier compare` copies the signature onto the unsigned APK and verifies it.
  If that fails, `compare-apks.py` names the files that differ.
- F-Droid's scanner checks the source and the APK (`scan.py`).

Checked by hand on 16.11.2026 with fdroidserver 2.4.5:

- `fdroid build` with the recipe builds without errors, and the scanner finds 0 problems.
- `apksigcopier compare` between a Gradle-signed build and the F-Droid build gives a match.

## One-time: get Diddy into F-Droid

This needs the first release that contains `diddyVersionCode`, so any release after 1.12.0.

1. After that release: `android/fdroid/recipe.sh vX.Y.Z > app.diddy.android.yml`.
2. On GitLab, fork [fdroid/fdroiddata](https://gitlab.com/fdroid/fdroiddata) and add the file as
   `metadata/app.diddy.android.yml`.
3. Open a merge request named "New app: Diddy" using the "App inclusion" template. F-Droid's CI
   builds the recipe; the reviewers answer in the merge request.
4. Once it is merged, F-Droid adds every new tag by itself (`AutoUpdateMode: Version`).
   No further merge request is needed.

The recipe declares the anti-feature **NonFreeNet**. Watch Together plays YouTube videos, the
soundboard can import from MyInstants, and Apple Music links are looked up on iTunes. All three
are optional. Should the reviewers see that differently, remove it in the merge request.

## Every release

- Set both `diddyVersion` and `diddyVersionCode` in `app/build.gradle.kts`. The build and the
  release check fail if they do not match.
- Add the F-Droid release notes `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`
  and `.../de-DE/...`, each at most 500 characters. The release check warns if they are missing.
- Store texts, the icon and later screenshots live in `fastlane/metadata/android/`.
  F-Droid reads them from the tag.

## Check it yourself

```sh
python3 -m venv fd && fd/bin/pip install fdroidserver==2.4.5
cd android && ./gradlew assembleRelease && cd ..
ANDROID_HOME=/path/to/sdk fd/bin/python android/fdroid/scan.py .   # needs dexdump from the SDK
mkdir -p fdd/metadata && android/fdroid/recipe.sh HEAD > fdd/metadata/app.diddy.android.yml
(cd fdd && ../fd/bin/fdroid lint app.diddy.android && ../fd/bin/fdroid rewritemeta app.diddy.android)
```

`fdroid lint` needs `config/categories.yml` and `config/antiFeatures.yml` from fdroiddata in
`fdd/config/`. `rewritemeta` must leave the file unchanged.

The scanner warns about `cinny/public/sound/invite.ogg` and `notification.ogg` ("possibly code").
Both are plain Vorbis audio from the desktop app and do not end up in the APK. These are warnings,
not errors.
