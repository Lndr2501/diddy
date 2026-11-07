# CI and build performance

The Test workflow installs Cinny once, runs type checking and both JavaScript test suites,
builds the production frontend once and smoke-tests that exact bundle with Playwright.
Rust tests run in parallel on macOS. No checks were removed.

## Caches

- Test jobs cache npm downloads keyed by `cinny/package-lock.json`; `npm ci` still installs
  from the lockfile. Publishing builds keep npm caching disabled.
- Rust jobs cache Cargo dependencies/compiled dependency crates for `src-tauri`, separated
  by platform, architecture, toolchain and test/release job. Cargo uses `--locked`.
- iOS keeps the dependency graph in `ios/Package.resolved`. The generated Xcode project gets
  a copy before resolution; CI rejects resolution changes. SwiftPM sources/artifacts and
  Xcode DerivedData are cached separately, with Xcode/architecture/dependency keys and
  source timestamps restored for incremental builds. The archive and IPA are built anew.
  Desktop and iOS default-branch builds warm caches on dependency/workflow changes,
  so future tag builds can restore them; application-only main pushes do not trigger
  these packaging jobs. Tags retain their existing release behavior.
- Nix caches its store per dependency definition set, with older caches as a fallback.
  Build-time inputs are retained in the snapshot; collecting them as garbage before
  saving would force downloads again after source edits. Source changes still produce
  their own derivations. Frontend sources exclude Electron
  and Rust implementation files; shell sources include Electron, icons, the version
  configuration needed by shell tests and the license.
  Default-branch cache warming runs on dependency/workflow definition changes, not every
  application edit. `workflow_dispatch` can warm it explicitly.

A cache miss always performs a full build. Cache entries are an optimization, not the
source of version selection. New actions are pinned by commit SHA.

## Superseded revisions

Test and Nix runs cancel older runs for the same PR or branch. iOS cancels older PR
archives only. Tag and manually requested iOS releases do not cancel one another.
Desktop release/build concurrency is unchanged.

## Updating iOS dependencies

On macOS, after changing the exact versions in `ios/project.yml`:

```sh
cd ios
xcodegen generate
xcodebuild -resolvePackageDependencies -project Diddy.xcodeproj -scheme Diddy \
  -clonedSourcePackagesDirPath build/spm
cp Diddy.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved Package.resolved
```

If an old generated resolution exists, update/remove that generated file deliberately
before resolving the intended new graph. Commit the reviewed `Package.resolved` together
with `project.yml`.

## Measuring changes

Use job/step durations in Actions; compare cold and warm runs of the same workflow and
commit rather than adding parallel jobs. Native installer builds upload timestamped
verbose logs and Cargo HTML timing reports as `build-timings-<platform>` (seven days).
iOS archives request Xcode's build timing summary. Manual Build/iOS runs with no release
tag input produce artifacts only.

Before this change, two successful runs per workflow on 2026-11-07 showed:
macOS package 552–569 s; Linux packages 384–565 s; iOS 280–307 s; Nix 153–165 s;
Rust tests 122–154 s; separate frontend 54–62 s plus browser smoke 90–99 s.
Those are observed job durations, not promised savings. Runner queue time is separate.
