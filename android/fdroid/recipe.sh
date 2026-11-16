#!/usr/bin/env bash
# Prints the F-Droid build recipe (fdroiddata metadata/app.diddy.android.yml) for one release.
#   android/fdroid/recipe.sh v1.13.0 > app.diddy.android.yml
# The version and versionCode come from android/app/build.gradle.kts at that tag, the commit is the
# tag's commit. F-Droid builds the APK from source, checks that it matches the signed APK of the
# GitHub release byte for byte, and then ships Diddy's own signed APK (see README.md here).
set -euo pipefail
ref=${1:?usage: recipe.sh <tag or commit>}
cd "$(git rev-parse --show-toplevel)"
commit=$(git rev-parse "$ref^{commit}")
gradle=$(git show "$commit:android/app/build.gradle.kts")
version=$(sed -n 's/^val diddyVersion = "\(.*\)"/\1/p' <<<"$gradle")
code=$(sed -n 's/^val diddyVersionCode = \([0-9]*\)$/\1/p' <<<"$gradle")
[ -n "$version" ] && [ -n "$code" ] || { echo "no diddyVersion/diddyVersionCode at $ref" >&2; exit 1; }

cat <<YAML
AntiFeatures:
  NonFreeNet:
    en-US: 'Optional features use non-free services when you use them: Watch Together plays YouTube
      videos, the soundboard imports sounds from MyInstants, and Apple Music links show song cards
      from the iTunes catalog.'
Categories:
  - Internet
  - Messaging
  - Voice & Video Chat
License: AGPL-3.0-only
SourceCode: https://github.com/Lndr2501/diddy
IssueTracker: https://github.com/Lndr2501/diddy/issues
Changelog: https://github.com/Lndr2501/diddy/blob/HEAD/CHANGELOG.md

AutoName: Diddy

RepoType: git
Repo: https://github.com/Lndr2501/diddy.git
Binaries: https://github.com/Lndr2501/diddy/releases/download/v%v/Diddy_%v_Android.apk

Builds:
  - versionName: $version
    versionCode: $code
    commit: $commit
    subdir: android/app
    gradle:
      - yes

AllowedAPKSigningKeys: c77c1e6161dd1f69dce0af1baf2f286a59d4bb07ceeb69b8fa5825a07e831484

AutoUpdateMode: Version
UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$
UpdateCheckData: android/app/build.gradle.kts|val diddyVersionCode = (\d+)|android/app/build.gradle.kts|val
  diddyVersion = "(.+)"
CurrentVersion: $version
CurrentVersionCode: $code
YAML
