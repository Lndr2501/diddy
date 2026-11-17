#!/usr/bin/env python3
"""Run F-Droid's scanner like its build server does: over the source tree and the built APK.

    python3 -m venv fd && fd/bin/pip install fdroidserver==2.4.5
    fd/bin/python android/fdroid/scan.py <repository root>

Needs a release build first (android: ./gradlew assembleRelease). The source scan looks for
non-free libraries, binaries and unknown Maven repositories in the Gradle files; the APK scan for
known non-free or tracking code. Exit code 1 if anything is found. F-Droid's scanner deletes what
it flags (as it does before building), so this scans a copy and leaves the checkout alone.
"""
import os
import shutil
import sys
import tempfile

from fdroidserver import common, metadata, scanner

# Build output and local files that a fresh F-Droid checkout does not have.
NOT_IN_CHECKOUT = shutil.ignore_patterns("build", ".gradle", ".kotlin", "node_modules", "local.properties")


def main(root):
    common.get_config()
    apk = os.path.join(root, "android/app/build/outputs/apk/release/app-release-unsigned.apk")
    if not os.path.isfile(apk):
        sys.exit(f"{apk} is missing: run ./gradlew assembleRelease in android/ first")
    problems = scanner.scan_binary(apk)
    with tempfile.TemporaryDirectory() as tmp:
        source = os.path.join(tmp, "source")
        shutil.copytree(root, source, symlinks=True, ignore=NOT_IN_CHECKOUT)
        problems += scanner.scan_source(source, metadata.Build())
    print(f"F-Droid scanner: {problems} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
