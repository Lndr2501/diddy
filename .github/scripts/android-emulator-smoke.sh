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
# API 26 images refuse to clear the main log; the dump below then simply holds a bit more boot noise.
adb logcat -c 2>/dev/null || true
report() {
  adb logcat -d -b all -v threadtime > emulator-report/logcat.txt 2>&1 || true
  grep -E 'FATAL EXCEPTION|AndroidRuntime|DEBUG +:|libc +:|F DEBUG|ActivityManager.*(app\.diddy|crash|ANR|Killing)|lowmemorykiller' \
    emulator-report/logcat.txt > emulator-report/crashes.txt || true
  adb shell run-as app.diddy.android.debug cat files/logs/app.log > emulator-report/app-log.txt 2>&1 || true
}
trap report EXIT
adb shell am instrument -w -r app.diddy.android.debug.test/androidx.test.runner.AndroidJUnitRunner | tee emulator-report/instrumentation.txt
grep -q 'OK (3 tests)' emulator-report/instrumentation.txt
! grep -qE 'FAILURES|INSTRUMENTATION_FAILED|Process crashed' emulator-report/instrumentation.txt
