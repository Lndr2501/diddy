#!/usr/bin/env python3
"""Compare two unsigned APKs built from the same commit and name every entry that differs.

    python3 android/fdroid/compare-apks.py first.apk second.apk

F-Droid only ships Diddy's own signed APK if its rebuild from source gives the same bytes. When the
CI check (apksigcopier) fails, this names the files that differ; exit code 1 means not reproducible.
A signed and an unsigned APK can be compared too: the signature is not a zip entry.
"""
import hashlib
import sys
import zipfile


def entries(path):
    with zipfile.ZipFile(path) as apk:
        return {info.filename: (hashlib.sha256(apk.read(info)).hexdigest(), info.compress_type) for info in apk.infolist()}


def main(first, second):
    a, b = entries(first), entries(second)
    problems = []
    for name in sorted(a.keys() | b.keys()):
        if name not in a or name not in b:
            problems.append(f"only in {'first' if name in a else 'second'}: {name}")
        elif a[name] != b[name]:
            problems.append(f"differs: {name}")
    with open(first, "rb") as fa, open(second, "rb") as fb:
        same_bytes = fa.read() == fb.read()
    if not problems and not same_bytes:
        problems.append("all entries match, but the zip layout (order, alignment, headers) differs")
    for line in problems:
        print(line)
    print("reproducible" if not problems else f"NOT reproducible: {len(problems)} difference(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2]))
