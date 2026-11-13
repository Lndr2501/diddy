import Foundation

/// The rules behind moving around the chat and the extra message actions, the same as the desktop's
/// (RoomTimeline.tsx, RoomViewFollowing.tsx, message/Message.tsx, jump-to-time/JumpToTime.tsx).
/// Foundation only, so `Tools/timelinenav_check` runs them without the Matrix SDK.
enum TimelineNav {
    /// One item of the SDK timeline, oldest first: the event behind it, the chat row shown for it
    /// (nil when the chat hides it), its sender and the people whose read receipt sits on it.
    struct Entry: Equatable {
        var eventId: String?
        var rowId: String?
        var sender: String
        var readers: [String] = []
        /// The thread the event belongs to (`m.relates_to` with `rel_type` `m.thread`).
        var threadRoot: String?
        /// The event the message answers.
        var replyTo: String?

        init(eventId: String?, rowId: String?, sender: String, readers: [String] = [],
             threadRoot: String? = nil, replyTo: String? = nil) {
            self.eventId = eventId
            self.rowId = rowId
            self.sender = sender
            self.readers = readers
            self.threadRoot = threadRoot
            self.replyTo = replyTo
        }
    }

    // MARK: Unread

    /// "New Messages" goes above the first message shown after the event you had read up to when
    /// the room opened. Your own messages do not get it; the line moves on to the next one.
    static func newDividerRowId(_ entries: [Entry], readUpTo: String?, me: String) -> String? {
        guard let readUpTo, !readUpTo.isEmpty else { return nil }
        var passed = false
        for entry in entries {
            if passed, let rowId = entry.rowId, entry.sender != me { return rowId }
            if entry.eventId == readUpTo { passed = true }
        }
        return nil
    }

    // MARK: Read receipts

    /// Everyone who has read up to the event or past it, the latest readers first, like the desktop's
    /// "Seen by" list (useRoomEventReaders.ts).
    static func readers(of eventId: String, in entries: [Entry]) -> [String] {
        guard eventId.hasPrefix("$"), let index = entries.lastIndex(where: { $0.eventId == eventId }) else { return [] }
        var seen = Set<String>()
        var result: [String] = []
        for entry in entries[index...].reversed() {
            for user in entry.readers where seen.insert(user).inserted {
                result.append(user)
            }
        }
        return result
    }

    /// The event of the newest row, whose readers the line under the composer names.
    static func latestShownEventId(_ entries: [Entry]) -> String? {
        entries.last(where: { $0.rowId != nil && ($0.eventId?.hasPrefix("$") ?? false) })?.eventId
    }

    /// The line under the composer (RoomViewFollowing.tsx), as pieces with the names in bold.
    static func following(_ names: [String]) -> [(text: String, bold: Bool)] {
        let tail: (text: String, bold: Bool) = (" are following the conversation.", false)
        switch names.count {
        case 0: return []
        case 1: return [(names[0], true), (" is following the conversation.", false)]
        case 2: return [(names[0], true), (" and ", false), (names[1], true), tail]
        case 3: return [(names[0], true), (", ", false), (names[1], true), (" and ", false), (names[2], true), tail]
        default:
            return [(names[0], true), (", ", false), (names[1], true), (", ", false), (names[2], true),
                    (" and ", false), ("\(names.count - 3) others", true), tail]
        }
    }

    /// Desktop's quiet line under the chat: the name when one person has read the newest message,
    /// the number when several have.
    static func seenBy(_ names: [String]) -> String {
        switch names.count {
        case 0: return ""
        case 1: return "Seen by \(names[0])"
        default: return "Seen by \(names.count)"
        }
    }

    // MARK: Jumping

    /// The row to show for an event: its own, or the next one shown after it when the chat hides
    /// the event itself (a jump to a date can land on a state event).
    static func rowId(for eventId: String, in entries: [Entry]) -> String? {
        guard let index = entries.firstIndex(where: { $0.eventId == eventId }) else { return nil }
        if let rowId = entries[index...].first(where: { $0.rowId != nil })?.rowId { return rowId }
        return entries[..<index].last(where: { $0.rowId != nil })?.rowId
    }

    /// `GET /timestamp_to_event`, forwards from the time like the desktop.
    static func timestampToEventPath(roomId: String, date: Date) -> String {
        let ts = Int64((date.timeIntervalSince1970 * 1000).rounded())
        return "/_matrix/client/v1/rooms/\(pathComponent(roomId))/timestamp_to_event?ts=\(ts)&dir=f"
    }

    /// Midnight of today and yesterday, the desktop's presets.
    static func presets(now: Date, calendar: Calendar) -> (today: Date, yesterday: Date) {
        let today = calendar.startOfDay(for: now)
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today) ?? today.addingTimeInterval(-86_400)
        return (today, yesterday)
    }

    // MARK: Threads

    /// What "Reply in Thread" sends next to the message (RoomInput.tsx `getReplyContent`).
    /// `fallback` is true for a plain message into the thread (the reply link only keeps old clients
    /// working) and false when it answers one message of the thread.
    static func threadRelation(root: String, replyTo: String, fallback: Bool = false) -> [String: Any] {
        [
            "m.relates_to": [
                "m.in_reply_to": ["event_id": replyTo],
                "event_id": root,
                "rel_type": "m.thread",
                "is_falling_back": fallback,
            ] as [String: Any],
        ]
    }

    static func threadRelationJSON(root: String, replyTo: String, fallback: Bool = false) -> String? {
        let relation = threadRelation(root: root, replyTo: replyTo, fallback: fallback)
        guard let data = try? JSONSerialization.data(withJSONObject: relation, options: [.sortedKeys]) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    // MARK: Report

    /// `POST /rooms/{roomId}/report/{eventId}` like matrix-js-sdk's `reportEvent`.
    static func reportPath(roomId: String, eventId: String) -> String {
        "/_matrix/client/v3/rooms/\(pathComponent(roomId))/report/\(pathComponent(eventId))"
    }

    /// The desktop's score and reason: -100 with a reason, -50 and "No reason provided" without.
    static func reportBody(reason: String) -> [String: Any] {
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        return ["score": trimmed.isEmpty ? -50 : -100, "reason": trimmed.isEmpty ? "No reason provided" : trimmed]
    }

    // MARK: Message menu

    /// The desktop shows Delete for others' messages to whoever may redact them, and for your own
    /// when you may redact your own.
    static func canDelete(isOwn: Bool, isRedacted: Bool, canRedactOwn: Bool, canRedactOther: Bool) -> Bool {
        guard !isRedacted else { return false }
        return canRedactOther || (isOwn && canRedactOwn)
    }

    /// The "View Source" text: the event, or the event and its latest replacement under the
    /// desktop's headings.
    static func sourceText(original: String?, latestEdit: String?) -> String {
        guard let original else { return "{}" }
        guard let latestEdit, latestEdit != original else { return pretty(original) }
        let main = jsonObject(original) ?? original
        let edit = jsonObject(latestEdit) ?? latestEdit
        let combined: [String: Any] = ["<== MAIN_EVENT ==>": main, "<== REPLACEMENT_EVENT_1 ==>": edit]
        guard let data = try? JSONSerialization.data(withJSONObject: combined, options: [.prettyPrinted, .sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return original }
        return text
    }

    static func pretty(_ json: String) -> String {
        guard let object = jsonObject(json),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return json }
        return text
    }

    private static func jsonObject(_ json: String) -> Any? {
        guard let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              object is [String: Any] || object is [Any] else { return nil }
        return object
    }

    static func pathComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? value
    }
}
