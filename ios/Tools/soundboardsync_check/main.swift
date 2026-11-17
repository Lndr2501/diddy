// Checks for Diddy/Call/SoundboardSyncLogic.swift (#248), like the desktop's
// tests/soundboardSync.test.cjs. Foundation only. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Call/SoundboardSyncLogic.swift Tools/soundboardsync_check/main.swift -o /tmp/soundboardsync_check && /tmp/soundboardsync_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

typealias L = SoundboardSyncLogic
let day: Int64 = 24 * 60 * 60 * 1000
let now: Int64 = 100 * day
let a = "/media/sounds/bruh.mp3"
let b = "/media/sounds/vine-boom.mp3"

// Paths and parsing
check(L.isMyInstantsPath(a), "a MyInstants path")
for bad in ["https://evil/x.mp3", "/media/sounds/../x", "/other/x.mp3", "/media/sounds/x?y", "", "/media/sounds/"] {
    check(!L.isMyInstantsPath(bad), "refused: \(bad)")
}
let rawSounds: [[String: Any]] = [
    ["path": a, "name": "  Bruh  ", "added_ts": 5],
    ["path": "https://evil/x.mp3", "name": "x", "added_ts": 5],
    ["path": b, "name": "", "added_ts": 5],
    ["path": b, "name": "Boom", "added_ts": -1],
    ["path": b, "name": "Boom", "added_ts": true],
]
let rawRemoved: [[String: Any]] = [["path": "/media/sounds/../etc", "removed_ts": 1]]
let parsed = L.parse(["sounds": rawSounds, "removed": rawRemoved], now: now)
check(parsed.sounds == [SyncedSound(path: a, name: "Bruh", addedTs: 5)], "only the valid sound, name trimmed")
check(parsed.removed.isEmpty, "invalid marker dropped")

// Add, remove, merge
var state = L.add(SoundboardSyncState(), [(path: a, name: "Bruh"), (path: b, name: "Boom")], now: now)
check(Set(state.sounds.map(\.path)) == [a, b], "both added")
let removed = L.remove(state, path: a, now: now + 1)
check(removed.sounds.map(\.path) == [b] && removed.removed.map(\.path) == [a], "removed with a marker")
let merged = L.merge([state.json, removed.json], now: now + 2)
check(merged.sounds.map(\.path) == [b], "the removal survives a merge with the old list")
state = L.add(removed, [(path: a, name: "Bruh")], now: now - 1000)
check(state.sounds.contains { $0.path == a } && state.removed.isEmpty, "adding again wins with a clock behind")
check(L.add(state, [(path: a, name: "Bruh")], now: now) == state, "already there: unchanged")
check(L.remove(SoundboardSyncState(), path: a, now: now) == SoundboardSyncState(), "removing an unknown sound: unchanged")

// Markers expire, limit
let oldMarkers: [[String: Any]] = [["path": a, "removed_ts": now - 31 * day], ["path": b, "removed_ts": now - day]]
let old = L.parse(["removed": oldMarkers], now: now)
check(old.removed.map(\.path) == [b], "markers older than 30 days are dropped")
let many = (0..<(L.limit + 5)).map { (path: "/media/sounds/s\($0).mp3", name: "s\($0)") }
let full = L.add(SoundboardSyncState(), many, now: now)
check(full.sounds.count == L.limit, "limit")
check(L.add(full, [(path: "/media/sounds/new.mp3", name: "new")], now: now) == full, "full list: unchanged")
if let data = try? JSONSerialization.data(withJSONObject: full.json) { check(data.count < 60_000, "under the account data limit") }

// The plan
let syncedSounds: [[String: Any]] = [
    ["path": a, "name": "Bruh", "added_ts": 3],
    ["path": b, "name": "Vine Boom", "added_ts": 2],
    ["path": "/media/sounds/new.mp3", "name": "New", "added_ts": 1],
]
let syncedRemoved: [[String: Any]] = [["path": "/media/sounds/gone.mp3", "removed_ts": now - day]]
let synced = L.parse(["sounds": syncedSounds, "removed": syncedRemoved], now: now)
let plan = L.plan(synced, clips: [
    SoundboardLocalClip(id: "1", name: "Bruh", myinstants: a),
    SoundboardLocalClip(id: "2", name: "vine boom", myinstants: nil),
    SoundboardLocalClip(id: "3", name: "Gone", myinstants: "/media/sounds/gone.mp3"),
    SoundboardLocalClip(id: "4", name: "Local", myinstants: "/media/sounds/local.mp3"),
    SoundboardLocalClip(id: "5", name: "My own file", myinstants: nil),
])
var expected = SoundboardSyncPlan()
expected.download = [(path: "/media/sounds/new.mp3", name: "New")]
expected.remove = ["3"]
expected.link = [(id: "2", path: b)]
expected.publish = [(path: "/media/sounds/local.mp3", name: "Local")]
check(plan == expected, "download, remove, link and publish")

// Same wire format as the desktop
let wire = L.add(SoundboardSyncState(), [(path: a, name: "Bruh")], now: now).json
check(wire["version"] as? Int == 1, "version 1")
check((wire["sounds"] as? [[String: Any]])?.first?["added_ts"] as? Int64 == now, "added_ts in milliseconds")

if failures > 0 { print("\(failures) soundboard sync check(s) failed"); exit(1) }
print("soundboard sync checks passed")
