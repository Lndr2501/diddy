#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-report
adb shell getconf PAGE_SIZE > emulator-report/page-size.txt
adb shell getprop ro.build.fingerprint > emulator-report/build.txt
app=$(find emulator-apks -name app-debug.apk -print -quit)
tests=$(find emulator-apks -name app-debug-androidTest.apk -print -quit)
test -n "$app" && test -n "$tests"
adb install -r "$app"
adb install -r "$tests"
adb logcat -c
trap 'adb logcat -d -s AndroidRuntime:E DEBUG:E > emulator-report/crashes.txt' EXIT
adb shell am instrument -w -r app.diddy.android.debug.test/androidx.test.runner.AndroidJUnitRunner | tee emulator-report/instrumentation.txt
grep -q 'OK (3 tests)' emulator-report/instrumentation.txt
! grep -qE 'FAILURES|INSTRUMENTATION_FAILED|Process crashed' emulator-report/instrumentation.txt
