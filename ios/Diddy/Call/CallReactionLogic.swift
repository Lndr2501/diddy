import Foundation

/// Emoji reactions inside a call, the protocol of Element Call 0.20 (what Diddy desktop's call
/// shows behind its "Reactions" button): a room event `io.element.call.reaction` with
/// `{"m.relates_to": {"rel_type": "m.reference", "event_id": <own call membership event>},
///   "emoji": "👍", "name": "thumbsup"}`. Each reaction floats on the sender's tile for 3 seconds;
/// while one of a person's reactions is showing, further ones of that person are ignored.
/// Foundation only, so `Tools/call_audio_check` can test it.
enum CallReactions {
    static let eventType = "io.element.call.reaction"
    /// Element Call's `REACTION_ACTIVE_TIME_MS`.
    static let activeSeconds: TimeInterval = 3

    struct Option: Equatable, Identifiable {
        let emoji: String
        let name: String
        var id: String { name }
    }

    /// Element Call's `ReactionSet`, in its order (the first five are its always visible row).
    static let options: [Option] = [
        Option(emoji: "\u{1F44D}", name: "thumbsup"),
        Option(emoji: "\u{1F389}", name: "party"),
        Option(emoji: "\u{1F44F}", name: "clapping"),
        Option(emoji: "\u{1F436}", name: "dog"),
        Option(emoji: "\u{1F431}", name: "cat"),
        Option(emoji: "\u{1F4A1}", name: "lightbulb"),
        Option(emoji: "\u{1F997}", name: "crickets"),
        Option(emoji: "\u{1F44E}", name: "thumbsdown"),
        Option(emoji: "\u{1F635}\u{200D}\u{1F4AB}", name: "dizzy"),
        Option(emoji: "\u{1F44C}", name: "ok"),
        Option(emoji: "\u{1F970}", name: "heart"),
        Option(emoji: "\u{1F604}", name: "laugh"),
        Option(emoji: "\u{1F98C}", name: "deer"),
        Option(emoji: "\u{1F918}", name: "rock"),
        Option(emoji: "\u{1F44B}", name: "wave"),
        Option(emoji: "\u{1F941}", name: "drum"),
    ]

    /// The content to send for `option`, relating to our own membership event.
    static func content(for option: Option, membershipEventId: String) -> String? {
        let object: [String: Any] = [
            "m.relates_to": ["rel_type": "m.reference", "event_id": membershipEventId],
            "emoji": option.emoji,
            "name": option.name,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    struct Received: Equatable {
        let sender: String
        let emoji: String
        /// Milliseconds since 1970 (server time).
        let ts: Double
    }

    /// Reads a whole event (the decrypted JSON the SDK keeps). Remote content is hostile: anything
    /// that is not a reaction to a membership event with an emoji is ignored. Like Element Call,
    /// only the first character counts, and a known name shows its own emoji.
    static func parse(eventJson json: String) -> Received? {
        guard let data = json.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              object["type"] as? String == eventType,
              let sender = object["sender"] as? String, sender.hasPrefix("@"),
              let content = object["content"] as? [String: Any],
              let relation = content["m.relates_to"] as? [String: Any],
              relation["rel_type"] as? String == "m.reference",
              let target = relation["event_id"] as? String, target.hasPrefix("$"),
              let raw = content["emoji"] as? String
        else { return nil }
        let ts = (object["origin_server_ts"] as? NSNumber)?.doubleValue ?? 0
        if let name = content["name"] as? String, let known = options.first(where: { $0.name == name }) {
            return Received(sender: sender, emoji: known.emoji, ts: ts)
        }
        guard let first = raw.first, !String(first).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return Received(sender: sender, emoji: String(first), ts: ts)
    }
}

/// Which reaction shows on whose tile right now.
struct ActiveCallReactions {
    private(set) var active: [String: (emoji: String, until: TimeInterval)] = [:]

    /// Adds a reaction at `now` (seconds). False when that person's last one is still showing.
    mutating func add(sender: String, emoji: String, now: TimeInterval) -> Bool {
        if let current = active[sender], current.until > now { return false }
        active[sender] = (emoji, now + CallReactions.activeSeconds)
        return true
    }

    /// Drops what has expired. True when something changed.
    mutating func prune(now: TimeInterval) -> Bool {
        let before = active.count
        active = active.filter { $0.value.until > now }
        return active.count != before
    }

    func emoji(for userId: String) -> String? { active[userId]?.emoji }

    var isEmpty: Bool { active.isEmpty }
}
