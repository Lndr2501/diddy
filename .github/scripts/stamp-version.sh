#!/usr/bin/env bash
# Release builds: show the version of the pushed tag in the app.
# cinny/src/app/appInfo.ts carries the version the About page, the login footer and the update
# notice use. On a tag run it is set from the tag in the build checkout (never committed), so a
# release cannot show a stale number. Without a tag nothing is changed.
set -euo pipefail
ref="${GITHUB_REF:-}"
case "$ref" in refs/tags/v*) ;; *) exit 0 ;; esac
version="${ref#refs/tags/v}"
file=cinny/src/app/appInfo.ts
current=$(sed -n "s/^export const APP_VERSION = '\(.*\)';/\1/p" "$file")
if [ "$current" != "$version" ]; then
  echo "::warning file=$file::APP_VERSION is '$current' in the repository; building with '$version' from the tag. Update $file in the repository."
  # -i.bak: works with GNU sed (Linux) and BSD sed (macOS)
  sed -i.bak "s/^export const APP_VERSION = '.*';/export const APP_VERSION = '$version';/" "$file"
  rm -f "$file.bak"
fi
grep -n "APP_VERSION =" "$file"
