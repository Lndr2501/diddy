import Foundation

/// Volumes you gave other people in calls, remembered per person (Matrix user id) on this device,
/// like the desktop's `cinny/src/app/plugins/call/volumeMemory.ts`.
///
/// One store per kind of sound: voices (0–200 %, `diddyUserVolumes`) and screen-share sound
/// (0–100 %, `diddyStreamVolumes`). 100 % and not muted is the default and is never stored. The
/// entries keep the order of use (the last used person last); beyond `maxRemembered` people the
/// ones not heard from for the longest time are dropped.
///
/// Foundation only, so `Tools/call_audio_check` can test it without the app.
struct RememberedVolume: Equatable {
    /// Level restored on unmute: 0 < volume <= 2 for voices, <= 1 for streams.
    var volume: Double
    var muted: Bool
}

enum CallVolumeKind: String {
    /// Voice (microphone) of a person.
    case voice = "diddyUserVolumes"
    /// Screen-share sound of a person.
    case stream = "diddyStreamVolumes"

    /// The loudest level a person can be given: voices go up to 200 % like on the desktop.
    var maxLevel: Double { self == .voice ? 2 : 1 }
}

/// Where the volumes are kept; UserDefaults in the app, a dictionary in the check tool.
protocol CallVolumeStorage: AnyObject {
    func data(forKey key: String) -> Data?
    func set(_ data: Data?, forKey key: String)
}

struct CallVolumeMemory {
    /// At most this many people are remembered per kind; the least recently used go first.
    static let maxRemembered = 500

    let storage: CallVolumeStorage
    let kind: CallVolumeKind
    var max: Int = CallVolumeMemory.maxRemembered

    /// A usable level: 0 < level <= maxLevel, rounded to slider steps (whole percent).
    static func validLevel(_ value: Double?, max: Double) -> Double? {
        guard let value, value.isFinite, value > 0 else { return nil }
        return Swift.min(max, Swift.max(0.01, (value * 100).rounded() / 100))
    }

    private struct Entry: Codable {
        let user: String
        let volume: Double
        let muted: Bool
    }

    /// Everything remembered, oldest use first; broken or foreign entries are left out.
    func all() -> [(userId: String, entry: RememberedVolume)] {
        guard let data = storage.data(forKey: kind.rawValue),
              let entries = try? JSONDecoder().decode([Entry].self, from: data) else { return [] }
        var seen = Set<String>()
        var result: [(userId: String, entry: RememberedVolume)] = []
        for entry in entries.reversed() where entry.user.hasPrefix("@") && !seen.contains(entry.user) {
            guard let volume = Self.validLevel(entry.volume, max: kind.maxLevel) else { continue }
            seen.insert(entry.user)
            result.append((entry.user, RememberedVolume(volume: volume, muted: entry.muted)))
        }
        return result.reversed()
    }

    private func write(_ list: [(userId: String, entry: RememberedVolume)]) {
        if list.isEmpty {
            storage.set(nil, forKey: kind.rawValue)
            return
        }
        let entries = list.map { Entry(user: $0.userId, volume: $0.entry.volume, muted: $0.entry.muted) }
        storage.set(try? JSONEncoder().encode(entries), forKey: kind.rawValue)
    }

    /// The volume remembered for `userId`, if any.
    func remembered(_ userId: String) -> RememberedVolume? {
        all().first { $0.userId == userId }?.entry
    }

    /// What `userId` plays at right now: 0 when muted for me, else the remembered level (1 = 100 %).
    func playbackLevel(_ userId: String) -> Double {
        guard let entry = remembered(userId) else { return 1 }
        return entry.muted ? 0 : entry.volume
    }

    /// Remember `entry` for `userId` (the default, 100 % and not muted, removes the entry). The
    /// person becomes the most recently used one; beyond `max` people the oldest are dropped.
    func remember(_ userId: String, _ entry: RememberedVolume) {
        guard userId.hasPrefix("@") else { return }
        var list = all()
        let volume = Self.validLevel(entry.volume, max: kind.maxLevel) ?? 1
        let had = list.contains { $0.userId == userId }
        list.removeAll { $0.userId == userId }
        if volume == 1 && !entry.muted {
            if !had { return }
        } else {
            list.append((userId, RememberedVolume(volume: volume, muted: entry.muted)))
            let limit = Swift.max(1, max)
            if list.count > limit { list.removeFirst(list.count - limit) }
        }
        write(list)
    }

    /// Sets the level from the slider (0 means muted for me, keeping the level before it).
    func setLevel(_ userId: String, _ level: Double) {
        let current = remembered(userId) ?? RememberedVolume(volume: 1, muted: false)
        if level <= 0 {
            remember(userId, RememberedVolume(volume: current.volume, muted: true))
        } else {
            remember(userId, RememberedVolume(volume: level, muted: false))
        }
    }

    /// "Mute for me" / "Unmute for me": the level stays, unmute returns to it.
    func toggleMuted(_ userId: String) {
        let current = remembered(userId) ?? RememberedVolume(volume: 1, muted: false)
        remember(userId, RememberedVolume(volume: current.volume, muted: !current.muted))
    }

    /// Forget every remembered volume of this kind.
    func clear() { storage.set(nil, forKey: kind.rawValue) }

    /// Forget the volumes of all people, voices and screen shares ("Reset volumes").
    static func clearAll(_ storage: CallVolumeStorage) {
        CallVolumeMemory(storage: storage, kind: .voice).clear()
        CallVolumeMemory(storage: storage, kind: .stream).clear()
    }
}

/// The app's volume store.
final class UserDefaultsVolumeStorage: CallVolumeStorage {
    static let shared = UserDefaultsVolumeStorage()
    func data(forKey key: String) -> Data? { UserDefaults.standard.data(forKey: key) }
    func set(_ data: Data?, forKey key: String) {
        if let data { UserDefaults.standard.set(data, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
    }
}
