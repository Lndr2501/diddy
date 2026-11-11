#!/bin/bash
# Compiles PluginProtocol.swift + PluginHost.swift with the test and runs it on the Mac.
set -e
cd "$(dirname "$0")"
OUT="$(mktemp -d)"
swiftc -swift-version 5 -o "$OUT/plugtest" main.swift ../../Diddy/Plugins/PluginProtocol.swift ../../Diddy/Plugins/PluginHost.swift
"$OUT/plugtest" "$(cd ../../../cinny/src/app/plugins/builtin && pwd)" | tee "$OUT/out.txt"
grep -q "^ALL OK" "$OUT/out.txt"
