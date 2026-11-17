#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-report
if ! adb shell getconf PAGE_SIZE > emulator-report/page-size.txt 2>/dev/null; then
  # API 26 has no getconf. Read the cat process's own mapping, without assuming a page size.
  adb shell cat /proc/self/smaps | awk '
    /^KernelPageSize:/ && !size { size = $2 * 1024 }
    END { if (!size) exit 1; print size }
  ' > emulator-report/page-size.txt
fi
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
