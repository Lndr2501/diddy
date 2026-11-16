import Foundation
import CoreFoundation

// MyInstants sounds of the soundboard in the account data (#248). Same format and merge rules as
// cinny/src/app/utils/soundboardSync.ts: only the MyInstants path and the clip name are stored (no
// audio, no own files), each device downloads missing sounds itself, and per sound the newer of
// "added" and "removed" wins. Foundation only, checked by Tools/soundboardsync_check.

struct SyncedSound: Equatable {
    let path: String
    let name: String
    let addedTs: Int64
    var json: [String: Any] { ["path": path, "name": name, "added_ts": addedTs] }
}

struct RemovedSound: Equatable {
    let path: String
    let removedTs: Int64
    var json: [String: Any] { ["path": path, "removed_ts": removedTs] }
}

struct SoundboardSyncState: Equatable {
    var sounds: [SyncedSound] = []
    var removed: [RemovedSound] = []
    var json: [String: Any] {
        ["version": 1, "sounds": sounds.map(\.json), "removed": removed.map(\.json)]
    }
}

/// A clip of this device as the sync sees it.
struct SoundboardLocalClip: Equatable {
    let id: String
    let name: String
    let myinstants: String?
}

struct SoundboardSyncPlan: Equatable {
    /// Synced sounds this device does not have yet: download them from MyInstants.
    var download: [(path: String, name: String)] = []
    /// Clips removed on another device.
    var remove: [String] = []
    /// Clips imported before the sync (no path stored) that match a synced sound by name.
    var link: [(id: String, path: String)] = []
    /// MyInstants clips of this device that the account does not know yet.
    var publish: [(path: String, name: String)] = []

    static func == (a: SoundboardSyncPlan, b: SoundboardSyncPlan) -> Bool {
        a.download.map { $0.path + "\u{0}" + $0.name } == b.download.map { $0.path + "\u{0}" + $0.name }
            && a.remove == b.remove
            && a.link.map { $0.id + "\u{0}" + $0.path } == b.link.map { $0.id + "\u{0}" + $0.path }
            && a.publish.map { $0.path + "\u{0}" + $0.name } == b.publish.map { $0.path + "\u{0}" + $0.name }
    }
}

enum SoundboardSyncLogic {
    static let type = "app.diddy.soundboard"
    static let limit = 200
    static let removedLimit = 100
    static let removedKeepMs: Int64 = 30 * 24 * 60 * 60 * 1000
    static let nameMax = 40
    static var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    /// A MyInstants sound file path, the only thing the sync may make a device download.
    static func isMyInstantsPath(_ value: String) -> Bool {
        guard value.count <= 300, value.hasPrefix("/media/sounds/"), value.count > "/media/sounds/".count,
              !value.contains(".."), !value.contains("?"), !value.contains("#"), !value.contains("\\") else { return false }
        return true
    }

    static func cleanName(_ value: String) -> String {
        let collapsed = value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return String(collapsed.prefix(nameMax))
    }

    private static func timestamp(_ value: Any?) -> Int64? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let ts = number.int64Value
        guard ts >= 0, number.doubleValue == Double(ts) else { return nil }
        return ts
    }

    private struct Entry {
        var name: String?
        var addedTs: Int64 = -1
        var removedTs: Int64 = -1
    }

    static func parse(_ raw: [String: Any]?, now: Int64) -> SoundboardSyncState {
        merge([raw ?? [:]], now: now)
    }

    static func merge(_ sources: [[String: Any]], now: Int64) -> SoundboardSyncState {
        var entries: [String: Entry] = [:]
        for source in sources {
            for raw in source["sounds"] as? [[String: Any]] ?? [] {
                guard let path = raw["path"] as? String, isMyInstantsPath(path),
                      let rawName = raw["name"] as? String, case let name = cleanName(rawName), !name.isEmpty,
                      let ts = timestamp(raw["added_ts"]) else { continue }
                var entry = entries[path] ?? Entry()
                if ts > entry.addedTs {
                    entry.addedTs = ts
                    entry.name = name
                }
                entries[path] = entry
            }
            for raw in source["removed"] as? [[String: Any]] ?? [] {
                guard let path = raw["path"] as? String, isMyInstantsPath(path),
                      let ts = timestamp(raw["removed_ts"]) else { continue }
                var entry = entries[path] ?? Entry()
                entry.removedTs = max(entry.removedTs, ts)
                entries[path] = entry
            }
        }
        var sounds: [SyncedSound] = []
        var removed: [RemovedSound] = []
        for (path, entry) in entries {
            if entry.addedTs > entry.removedTs, let name = entry.name {
                sounds.append(SyncedSound(path: path, name: name, addedTs: entry.addedTs))
            } else if entry.removedTs >= 0, now - entry.removedTs <= removedKeepMs {
                removed.append(RemovedSound(path: path, removedTs: entry.removedTs))
            }
        }
        sounds.sort { $0.addedTs == $1.addedTs ? $0.path < $1.path : $0.addedTs > $1.addedTs }
        removed.sort { $0.removedTs == $1.removedTs ? $0.path < $1.path : $0.removedTs > $1.removedTs }
        return SoundboardSyncState(sounds: Array(sounds.prefix(limit)), removed: Array(removed.prefix(removedLimit)))
    }

    /// Adds sounds (newer than an earlier removal even with a clock behind the other device's).
    static func add(_ state: SoundboardSyncState, _ items: [(path: String, name: String)], now: Int64) -> SoundboardSyncState {
        let fresh = items.filter { item in isMyInstantsPath(item.path) && !state.sounds.contains { $0.path == item.path } }
        let room = limit - state.sounds.count
        guard !fresh.isEmpty, room > 0 else { return state }
        let added: [[String: Any]] = fresh.prefix(room).map { item in
            let marker = state.removed.first { $0.path == item.path }?.removedTs ?? -1
            let name = cleanName(item.name)
            return SyncedSound(path: item.path, name: name.isEmpty ? "sound" : name, addedTs: max(now, marker + 1)).json
        }
        return merge([state.json, ["sounds": added]], now: now)
    }

    /// Removes a sound everywhere: a marker newer than its entry.
    static func remove(_ state: SoundboardSyncState, path: String, now: Int64) -> SoundboardSyncState {
        guard let current = state.sounds.first(where: { $0.path == path }) else { return state }
        let marker = RemovedSound(path: path, removedTs: max(now, current.addedTs + 1))
        return merge([state.json, ["removed": [marker.json]]], now: now)
    }

    /// What this device has to do so that its soundboard matches the account.
    static func plan(_ state: SoundboardSyncState, clips: [SoundboardLocalClip]) -> SoundboardSyncPlan {
        var plan = SoundboardSyncPlan()
        var byPath: [String: SoundboardLocalClip] = [:]
        for clip in clips { if let path = clip.myinstants { byPath[path] = clip } }
        var linked = Set<String>()
        for sound in state.sounds where byPath[sound.path] == nil {
            let wanted = sound.name.lowercased()
            if let same = clips.first(where: { $0.myinstants == nil && !linked.contains($0.id) && $0.name.lowercased() == wanted }) {
                linked.insert(same.id)
                plan.link.append((id: same.id, path: sound.path))
            } else {
                plan.download.append((path: sound.path, name: sound.name))
            }
        }
        let removedPaths = Set(state.removed.map(\.path))
        let syncedPaths = Set(state.sounds.map(\.path))
        for clip in clips {
            guard let path = clip.myinstants else { continue }
            if removedPaths.contains(path) {
                plan.remove.append(clip.id)
            } else if !syncedPaths.contains(path) {
                plan.publish.append((path: path, name: clip.name))
            }
        }
        return plan
    }
}
