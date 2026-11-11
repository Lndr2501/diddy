import Foundation

// Message search like the desktop app (cinny/src/app/features/message-search/useMessageSearch.ts
// and searchEdits.ts): the request for POST /_matrix/client/v3/search, reading its answer, and
// folding edited messages into one result per message that shows the latest text (#109).
//
// Foundation only, so Tools/messagesearch_check can test it on macOS and Linux.

/// One event of a search answer, kept as the server sent it.
struct MessageSearchEvent {
    var eventId: String
    var roomId: String
    var sender: String
    var type: String
    var timestamp: Int64
    var content: [String: Any]
    var unsigned: [String: Any]?

    init(eventId: String, roomId: String, sender: String, type: String, timestamp: Int64,
         content: [String: Any], unsigned: [String: Any]? = nil) {
        self.eventId = eventId
        self.roomId = roomId
        self.sender = sender
        self.type = type
        self.timestamp = timestamp
        self.content = content
        self.unsigned = unsigned
    }

    /// An event from the server's JSON; `roomId` fills in a missing `room_id`.
    init?(json: [String: Any], roomId fallbackRoomId: String? = nil) {
        guard let eventId = json["event_id"] as? String,
              let roomId = (json["room_id"] as? String) ?? fallbackRoomId,
              let sender = json["sender"] as? String,
              let type = json["type"] as? String else { return nil }
        self.eventId = eventId
        self.roomId = roomId
        self.sender = sender
        self.type = type
        timestamp = MessageSearch.int64(json["origin_server_ts"]) ?? 0
        content = json["content"] as? [String: Any] ?? [:]
        unsigned = json["unsigned"] as? [String: Any]
    }

    var body: String { content["body"] as? String ?? "" }
    var msgtype: String { content["msgtype"] as? String ?? "" }
    var isRedacted: Bool { MessageSearch.isRedacted(self) }
    /// The message this one answers, if it is a reply.
    var replyToEventId: String? {
        let relation = content["m.relates_to"] as? [String: Any]
        return (relation?["m.in_reply_to"] as? [String: Any])?["event_id"] as? String
    }
}

struct MessageSearchHit {
    var rank: Double
    var event: MessageSearchEvent
}

/// One message as the results show it.
struct MessageSearchItem {
    var rank: Double
    /// The original event, with its content replaced by the latest edit's m.new_content.
    var event: MessageSearchEvent
    /// Event id of the original message (what the timeline shows and "Open" jumps to).
    var originalEventId: String
    var edited: Bool
}

struct MessageSearchGroup: Identifiable {
    var roomId: String
    var items: [MessageSearchItem]
    /// Several groups can belong to one room (results of another room in between).
    var id: String { "\(roomId)|\(items.first?.originalEventId ?? "")" }
}

struct MessageSearchRef: Equatable {
    var roomId: String
    var eventId: String
}

/// One page of a search answer.
struct MessageSearchPage {
    var hits: [MessageSearchHit]
    var nextBatch: String?
    var highlights: [String]
}

enum MessageSearch {
    enum Order: String, CaseIterable, Identifiable {
        case recent
        case rank
        var id: String { rawValue }
        /// The desktop's names: "Recent" and "Relevance".
        var title: String { self == .rank ? "Relevance" : "Recent" }
    }

    /// Results per page, as on desktop.
    static let pageLimit = 20
    static let replace = "m.replace"

    // MARK: Request

    /// The body desktop sends: no context, no profiles, no state.
    static func requestBody(term: String, order: Order, rooms: [String]?, senders: [String]? = nil,
                            limit: Int = pageLimit) -> [String: Any] {
        var filter: [String: Any] = ["limit": limit]
        if let rooms { filter["rooms"] = rooms }
        if let senders { filter["senders"] = senders }
        let roomEvents: [String: Any] = [
            "event_context": ["before_limit": 0, "after_limit": 0, "include_profile": false] as [String: Any],
            "filter": filter,
            "include_state": false,
            "order_by": order.rawValue,
            "search_term": term,
        ]
        return ["search_categories": ["room_events": roomEvents]]
    }

    /// The search endpoint, with the token of the next page if there is one.
    static func searchPath(nextBatch: String?) -> String {
        let base = "/_matrix/client/v3/search"
        guard let nextBatch, !nextBatch.isEmpty else { return base }
        return base + "?next_batch=" + queryValue(nextBatch)
    }

    /// GET path of one event of a room.
    static func eventPath(roomId: String, eventId: String) -> String {
        "/_matrix/client/v3/rooms/\(pathComponent(roomId))/event/\(pathComponent(eventId))"
    }

    /// GET path of the messages around an event (no lazy-loading filter needed for plain text).
    static func contextPath(roomId: String, eventId: String, limit: Int) -> String {
        "/_matrix/client/v3/rooms/\(pathComponent(roomId))/context/\(pathComponent(eventId))?limit=\(limit)"
    }

    static func pathComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
    }

    static func queryValue(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
    }

    /// RFC 3986 unreserved characters; everything else is escaped.
    private static let unreserved = CharacterSet(charactersIn:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    // MARK: Answer

    static func parsePage(_ json: [String: Any]) -> MessageSearchPage {
        let categories = json["search_categories"] as? [String: Any]
        let roomEvents = categories?["room_events"] as? [String: Any]
        let results = roomEvents?["results"] as? [[String: Any]] ?? []
        var hits: [MessageSearchHit] = []
        for item in results {
            guard let result = item["result"] as? [String: Any], let event = MessageSearchEvent(json: result) else { continue }
            hits.append(MessageSearchHit(rank: double(item["rank"]) ?? 0, event: event))
        }
        let next = roomEvents?["next_batch"] as? String
        return MessageSearchPage(
            hits: hits,
            nextBatch: (next?.isEmpty ?? true) ? nil : next,
            highlights: (roomEvents?["highlights"] as? [String]) ?? []
        )
    }

    static func int64(_ value: Any?) -> Int64? {
        if let value = value as? Int64 { return value }
        if let value = value as? Int { return Int64(value) }
        if let value = value as? Double { return Int64(value) }
        if let value = value as? NSNumber { return value.int64Value }
        return nil
    }

    static func double(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? Int64 { return Double(value) }
        if let value = value as? NSNumber { return value.doubleValue }
        return nil
    }

    // MARK: Edits (#109)

    /// Event id an m.replace edit points to, or nil if the event is not an edit.
    static func replaceTarget(_ event: MessageSearchEvent) -> String? {
        guard let relation = event.content["m.relates_to"] as? [String: Any],
              relation["rel_type"] as? String == replace else { return nil }
        return relation["event_id"] as? String
    }

    static func isReplaceEvent(_ event: MessageSearchEvent) -> Bool { replaceTarget(event) != nil }

    static func isRedacted(_ event: MessageSearchEvent) -> Bool {
        guard let because = event.unsigned?["redacted_because"] else { return false }
        return !(because is NSNull)
    }

    /// The server-chosen latest edit bundled in unsigned["m.relations"]["m.replace"], if any.
    private static func bundledEdit(_ event: MessageSearchEvent) -> [String: Any]? {
        let relations = event.unsigned?["m.relations"] as? [String: Any]
        guard let bundled = relations?[replace] as? [String: Any], bundled["event_id"] is String else { return nil }
        return bundled
    }

    private static func newContent(_ event: MessageSearchEvent) -> [String: Any]? {
        event.content["m.new_content"] as? [String: Any]
    }

    /// Same room, same sender, same type, pointing at the original, carrying m.new_content. Edits
    /// of redacted messages and edits of edits are ignored (Matrix spec).
    static func isValidEdit(original: MessageSearchEvent, edit: MessageSearchEvent) -> Bool {
        !isReplaceEvent(original) &&
            !isRedacted(original) &&
            !isRedacted(edit) &&
            replaceTarget(edit) == original.eventId &&
            edit.roomId == original.roomId &&
            edit.sender == original.sender &&
            edit.type == original.type &&
            newContent(edit) != nil
    }

    private static func isLater(_ a: MessageSearchEvent, _ b: MessageSearchEvent) -> Bool {
        a.timestamp != b.timestamp ? a.timestamp > b.timestamp : a.eventId > b.eventId
    }

    /// Latest valid edit of `original` among `candidates` (timestamp, then event id breaks ties).
    static func latestEdit(of original: MessageSearchEvent, among candidates: [MessageSearchEvent]) -> MessageSearchEvent? {
        var latest: MessageSearchEvent?
        for edit in candidates where isValidEdit(original: original, edit: edit) {
            if let current = latest, !isLater(edit, current) { continue }
            latest = edit
        }
        return latest
    }

    private static func normalized(_ text: String) -> String {
        let decomposed = text.decomposedStringWithCompatibilityMapping
        var scalars = String.UnicodeScalarView()
        for scalar in decomposed.unicodeScalars where !(0x300...0x36F).contains(scalar.value) {
            scalars.append(scalar)
        }
        return String(scalars).lowercased()
    }

    private static func isWordScalar(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
             .decimalNumber, .letterNumber, .otherNumber:
            return true
        default:
            return false
        }
    }

    /// Runs of letters and digits, like the desktop's /[\p{L}\p{N}]+/gu.
    static func words(_ text: String) -> [String] {
        var result: [String] = []
        var current = String.UnicodeScalarView()
        for scalar in normalized(text).unicodeScalars {
            if isWordScalar(scalar) {
                current.append(scalar)
            } else if !current.isEmpty {
                result.append(String(current))
                current = String.UnicodeScalarView()
            }
        }
        if !current.isEmpty { result.append(String(current)) }
        return result
    }

    /// Approximates the server's full-text match: every word of the term must start a word of the
    /// text ("or" switches to any word, a leading "-" excludes a word). Only used to decide whether
    /// an edited message still contains a term that matched its old text.
    static func textMatchesTerm(_ text: String, _ term: String) -> Bool {
        let textWords = words(text)
        func hasWord(_ word: String) -> Bool { textWords.contains { $0.hasPrefix(word) } }
        var positive: [String] = []
        var negative: [String] = []
        var anyMode = false
        let parts = term.replacingOccurrences(of: "\"", with: " ")
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
        for raw in parts {
            let lower = raw.lowercased()
            if lower == "or" { anyMode = true; continue }
            if lower == "and" { continue }
            if raw.hasPrefix("-") && raw.count > 1 {
                negative.append(contentsOf: words(raw))
            } else {
                positive.append(contentsOf: words(raw))
            }
        }
        if negative.contains(where: hasWord) { return false }
        if positive.isEmpty { return false }
        return anyMode ? positive.contains(where: hasWord) : positive.allSatisfy(hasWord)
    }

    private static func contentBody(_ content: [String: Any]?) -> String {
        content?["body"] as? String ?? ""
    }

    /// Originals of edit hits that are neither hits nor already known.
    static func missingOriginals(_ hits: [MessageSearchHit], known: [MessageSearchEvent] = []) -> [MessageSearchRef] {
        let have = Set(hits.map(\.event.eventId) + known.map(\.eventId))
        var refs: [MessageSearchRef] = []
        var added: Set<String> = []
        for hit in hits {
            guard let target = replaceTarget(hit.event), !have.contains(target), !added.contains(target) else { continue }
            added.insert(target)
            refs.append(MessageSearchRef(roomId: hit.event.roomId, eventId: target))
        }
        return refs
    }

    /// Latest edits the server bundled by reference only on the given originals.
    static func missingBundledEdits(_ originals: [MessageSearchEvent], known: [MessageSearchEvent]) -> [MessageSearchRef] {
        let have = Set(known.map(\.eventId))
        var refs: [MessageSearchRef] = []
        var added: Set<String> = []
        for original in originals {
            if isReplaceEvent(original) || isRedacted(original) { continue }
            guard let bundled = bundledEdit(original), let id = bundled["event_id"] as? String else { continue }
            if have.contains(id) || bundled["content"] != nil { continue }
            if let sender = bundled["sender"] as? String, !sender.isEmpty, sender != original.sender { continue }
            if added.contains(id) { continue }
            added.insert(id)
            refs.append(MessageSearchRef(roomId: original.roomId, eventId: id))
        }
        return refs
    }

    private static func bundledAsEvent(_ original: MessageSearchEvent) -> MessageSearchEvent? {
        guard let bundled = bundledEdit(original),
              let content = bundled["content"] as? [String: Any],
              let id = bundled["event_id"] as? String else { return nil }
        return MessageSearchEvent(
            eventId: id,
            roomId: bundled["room_id"] as? String ?? original.roomId,
            sender: bundled["sender"] as? String ?? "",
            type: bundled["type"] as? String ?? original.type,
            timestamp: int64(bundled["origin_server_ts"]) ?? 0,
            content: content,
            unsigned: bundled["unsigned"] as? [String: Any]
        )
    }

    /// The original event shown with the content of `edit` (keeping the original's relations).
    private static func displayEvent(_ original: MessageSearchEvent, edit: MessageSearchEvent) -> MessageSearchEvent {
        var content = newContent(edit) ?? [:]
        content["m.relates_to"] = nil
        if let relation = original.content["m.relates_to"] { content["m.relates_to"] = relation }
        var shown = original
        shown.content = content
        return shown
    }

    /// Folds one page of hits into one result per original message.
    /// - Parameters:
    ///   - hits: search results in server order
    ///   - extraEvents: originals and edits fetched separately; never results on their own
    ///   - term: the search term (hides hits whose current text no longer matches)
    static func resolveHits(_ hits: [MessageSearchHit], extraEvents: [MessageSearchEvent], term: String) -> [MessageSearchItem] {
        let hitIds = Set(hits.map(\.event.eventId))
        var originals: [String: MessageSearchEvent] = [:]
        var editsByTarget: [String: [MessageSearchEvent]] = [:]
        var knownIds: Set<String> = []
        for event in hits.map(\.event) + extraEvents {
            if knownIds.contains(event.eventId) { continue }
            knownIds.insert(event.eventId)
            if let target = replaceTarget(event) {
                editsByTarget[target, default: []].append(event)
            } else {
                originals[event.eventId] = event
            }
        }

        var seen: Set<String> = []
        var resolved: [MessageSearchItem] = []
        for hit in hits {
            let target = replaceTarget(hit.event)
            let originalId = target ?? hit.event.eventId
            if seen.contains(originalId) { continue }
            // An edit whose original we cannot see cannot be verified (sender, room): drop it.
            guard let original = originals[originalId] else { continue }

            var candidates = editsByTarget[originalId] ?? []
            if let bundled = bundledAsEvent(original), !knownIds.contains(bundled.eventId) {
                candidates.append(bundled)
            }
            let latest = latestEdit(of: original, among: candidates)

            // The server knows of a newer edit than any we could load: current text unknown.
            if let reference = bundledEdit(original), let referenceId = reference["event_id"] as? String,
               !isRedacted(original) {
                let referenceSender = reference["sender"] as? String ?? ""
                let trusted = referenceSender.isEmpty || referenceSender == original.sender
                let loaded = candidates.contains { $0.eventId == referenceId && isValidEdit(original: original, edit: $0) }
                let newer: Bool
                if let latest {
                    newer = int64(reference["origin_server_ts"]).map { $0 > latest.timestamp } ?? true
                } else {
                    newer = true
                }
                if trusted && !loaded && newer { continue }
            }

            if target != nil {
                // The hit is an edit. Untrusted edits (other sender, room, type) are ignored.
                guard let latest else { continue }
                if latest.eventId != hit.event.eventId {
                    // An older edit matched: show the message only if its current text still
                    // matches, unless the latest edit is a hit itself (handled when we get to it).
                    if hitIds.contains(latest.eventId) { continue }
                    if !textMatchesTerm(contentBody(newContent(latest)), term) { continue }
                }
            } else if let latest, !hitIds.contains(latest.eventId) {
                // The original matched but has been edited: only the old text matched unless the
                // current text still contains the term.
                if !textMatchesTerm(contentBody(newContent(latest)), term) { continue }
            }

            seen.insert(originalId)
            resolved.append(MessageSearchItem(
                rank: hit.rank,
                event: latest.map { displayEvent(original, edit: $0) } ?? original,
                originalEventId: originalId,
                edited: latest != nil
            ))
        }
        return resolved
    }

    /// Concatenates resolved pages, each message once, grouping consecutive results of a room.
    static func mergePages(_ pages: [[MessageSearchItem]]) -> [MessageSearchGroup] {
        var seen: Set<String> = []
        var groups: [MessageSearchGroup] = []
        for page in pages {
            for item in page {
                if seen.contains(item.originalEventId) { continue }
                seen.insert(item.originalEventId)
                let roomId = item.event.roomId
                if let last = groups.indices.last, groups[last].roomId == roomId {
                    groups[last].items.append(item)
                } else {
                    groups.append(MessageSearchGroup(roomId: roomId, items: [item]))
                }
            }
        }
        return groups
    }

    /// The server's highlight words of all pages, each once, in order.
    static func mergeHighlights(_ pages: [[String]]) -> [String] {
        var seen: Set<String> = []
        var result: [String] = []
        for word in pages.flatMap({ $0 }) where !seen.contains(word) {
            seen.insert(word)
            result.append(word)
        }
        return result
    }

    // MARK: Context

    /// The answer of GET /rooms/{roomId}/context/{eventId} in reading order (events_before comes
    /// newest first), each event once.
    static func contextEvents(_ json: [String: Any], roomId: String) -> [MessageSearchEvent] {
        let before = (json["events_before"] as? [[String: Any]] ?? []).reversed()
        let center = (json["event"] as? [String: Any]).map { [$0] } ?? []
        let after = json["events_after"] as? [[String: Any]] ?? []
        var seen: Set<String> = []
        var result: [MessageSearchEvent] = []
        for item in Array(before) + center + after {
            guard let event = MessageSearchEvent(json: item, roomId: roomId), !seen.contains(event.eventId) else { continue }
            seen.insert(event.eventId)
            result.append(event)
        }
        return result
    }

    // MARK: Highlighting

    struct Segment: Equatable {
        var text: String
        var highlighted: Bool
    }

    /// The text cut into plain and highlighted parts: any highlight word, ignoring case, like the
    /// desktop's makeHighlightRegex.
    static func highlightSegments(_ text: String, highlights: [String]) -> [Segment] {
        let words = highlights.filter { !$0.isEmpty }
        guard !words.isEmpty, !text.isEmpty else { return text.isEmpty ? [] : [Segment(text: text, highlighted: false)] }
        let pattern = words.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "|")
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return [Segment(text: text, highlighted: false)]
        }
        let whole = NSRange(text.startIndex..<text.endIndex, in: text)
        var segments: [Segment] = []
        var cursor = text.startIndex
        for match in regex.matches(in: text, options: [], range: whole) {
            guard match.range.length > 0, let range = Range(match.range, in: text), range.lowerBound >= cursor else { continue }
            if cursor < range.lowerBound {
                segments.append(Segment(text: String(text[cursor..<range.lowerBound]), highlighted: false))
            }
            segments.append(Segment(text: String(text[range]), highlighted: true))
            cursor = range.upperBound
        }
        if cursor < text.endIndex {
            segments.append(Segment(text: String(text[cursor...]), highlighted: false))
        }
        return segments
    }
}
