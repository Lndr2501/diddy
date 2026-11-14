import Foundation

/// Which rooms carry the Diddy options marker, remembered on the device so a cold start does not ask
/// the server about every room again (docs/performance.md #8). A "yes" is kept; a "no" for a week,
/// because an admin can turn an existing room into the options room. Foundation only, so
/// `Tools/markerchecks_check` can test it.
enum DiddyMarkerChecks {
    static let noLifetime: TimeInterval = 7 * 24 * 3600
    static let maxEntries = 2000

    struct Entry: Codable, Equatable {
        var options: Bool
        var at: TimeInterval
    }

    private static func key(_ accountId: String) -> String { "diddy.markerChecks.\(accountId)" }

    static func load(accountId: String, now: Date = Date(), defaults: UserDefaults = .standard) -> (options: Set<String>, checked: Set<String>) {
        guard let data = defaults.data(forKey: key(accountId)),
              let entries = try? JSONDecoder().decode([String: Entry].self, from: data) else { return ([], []) }
        return fresh(entries, now: now)
    }

    static func remember(_ answers: [(roomId: String, isOptions: Bool)], accountId: String, now: Date = Date(),
                         defaults: UserDefaults = .standard) {
        var entries: [String: Entry] = [:]
        if let data = defaults.data(forKey: key(accountId)),
           let stored = try? JSONDecoder().decode([String: Entry].self, from: data) {
            entries = stored
        }
        entries = merged(entries, answers, now: now)
        if let data = try? JSONEncoder().encode(entries) { defaults.set(data, forKey: key(accountId)) }
    }

    /// The rooms known to be options rooms, and every room whose answer is still valid.
    static func fresh(_ entries: [String: Entry], now: Date) -> (options: Set<String>, checked: Set<String>) {
        var options: Set<String> = []
        var checked: Set<String> = []
        for (roomId, entry) in entries {
            if entry.options {
                options.insert(roomId)
                checked.insert(roomId)
            } else if now.timeIntervalSince1970 - entry.at < noLifetime {
                checked.insert(roomId)
            }
        }
        return (options, checked)
    }

    /// New answers over the old ones, at most `maxEntries` (the oldest "no" go first).
    static func merged(_ entries: [String: Entry], _ answers: [(roomId: String, isOptions: Bool)], now: Date) -> [String: Entry] {
        var out = entries
        for answer in answers { out[answer.roomId] = Entry(options: answer.isOptions, at: now.timeIntervalSince1970) }
        if out.count > maxEntries {
            let drop = out.filter { !$0.value.options }.sorted { $0.value.at < $1.value.at }.prefix(out.count - maxEntries)
            drop.forEach { out.removeValue(forKey: $0.key) }
        }
        return out
    }
}
