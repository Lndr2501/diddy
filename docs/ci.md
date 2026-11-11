# CI and build performance

The Test workflow installs Cinny once, runs type checking and both JavaScript test suites,
builds the production frontend once and smoke-tests that exact bundle with Playwright.
Playwright also checks the voice-recorder hook using synthetic audio and Chromium’s real
WebM encoder, decoder, playback and seeking; this does not replace Linux device tests.
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

## Nix source trees

The Nix build runs the unit tests of `cinny/` and `electron/` in source trees that contain only
the paths listed in `nix/package.nix` (`frontendSrc`, `shellSrc`). A test that reads a file
outside its tree (for example `.github/scripts` or `electron/` from a cinny test) passes in the
normal checkout and only breaks Nix. Nix runs on `main` only for dependency changes, so the Test
workflow repeats those trees on every push: `node .github/scripts/nix-tree-tests.cjs`. Such a
test must skip itself when the file is missing (see `cinny/tests/altstoreSource.test.cjs`).

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

## Native audio regression tests

Linux reports compilation/Electron tests, PulseAudio and PipeWire as separate steps.
`electron/tests/native-audio.py` starts private sound servers with per-run XDG and
Pulse/PipeWire sockets. It polls server and player discovery and the helper READY
handshake (30 s), then measures a full second of newly received PCM after discarding
half a second of frames. Tone discovery has a 60 s budget; individual PCM waits are
bounded to 30 s. Synthetic players use 200 ms playback latency to allow scheduling
headroom on CI runners. Tone thresholds and the Diddy exclusion check are unchanged.
Sink moves must be observed, and removal must leave the other player audible.
Any failure prints server/player logs, helper stderr, child exit codes and `pactl`
state before cleanup. Hardware-free Python wait/PCM tests also run in the Cinny suite.

On 2026-11-11, release run 43015204159 attempt 1 passed PulseAudio but timed out
waiting for PipeWire's second tone (660 Hz amplitude 0.028, required >0.05) after
8 s; attempt 2 passed unchanged. The logs show monitoring began, but lack server
state to distinguish policy settling from playback underruns. Previous failures
on 5e27b80 and 868a594 were deterministic Electron command-parity failures
(`account_labels`, `set_account_label`), before either sound-server test ran.

Validation for this fix: TypeScript, 544 Cinny tests (including six hardware-free
Python cases), 84 Electron tests, native helper compilation, and real PulseAudio /
PipeWire runs in an isolated Debian 12 container passed. Both servers also passed
concurrently with a shared inherited runtime path and a two-CPU container limit.
An injected helper failure verified the diagnostic output. The original eight-second
failure was not reproduced locally; exact Ubuntu 22.04 runner validation remains open
(the additional container's package installation did not complete).

## Per-person voice boost

`npm start` and `npm run build` generate `.element-call/`, a disposable copy of the
pinned Element Call distribution. `scripts/patch-element-call.cjs` extends only the
remote voice slider to 200 % and adds a checked hook to LiveKit's audio volume setter.
Upstream hook changes stop the build. The dependency itself stays unchanged.
`voiceBoost.ts` uses LiveKit's existing Web Audio graph and the app's shared output
context when a voice first exceeds 100 %. Subsequent levels, mute, deafen and output
volume all scale that graph; the original audio element stays silent to avoid echo.
Screen-share volume retains its existing range. Regression tests cover the shipped
setter, gain scaling, replacement elements, persistence, mute and rejoin.
