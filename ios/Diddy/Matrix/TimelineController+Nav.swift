import Foundation
import MatrixRustSDK

/// One earlier version of an edited message.
struct MessageEditVersion: Identifiable {
    let id: Int
    let text: String
    let date: Date?
}

extension MessageRow {
    /// The id the server knows the message by; nothing while it is still being sent.
    var remoteEventId: String? {
        if case .eventId(let id)? = eventId { return id }
        return nil
    }

    var isRedactedMessage: Bool {
        if case .redacted = body { return true }
        return false
    }

    /// Whether the message menu offers the extra actions (a notice line or a pending message has no event to act on).
    var hasServerEvent: Bool {
        if case .notice = body { return false }
        return remoteEventId != nil
    }
}

extension TimelineController {
    /// The chat row of an event, loading older messages first when it is further back than what is
    /// shown. Nil when it cannot be found, for example a very old event.
    func loadRowId(forEvent eventId: String, maxPages: Int = 60) async -> String? {
        var stalls = 0
        for _ in 0..<maxPages {
            if let id = TimelineNav.rowId(for: eventId, in: nav.snapshot.entries) { return id }
            if reachedStart { return nil }
            let before = nav.snapshot.entries.count
            while loading && !Task.isCancelled { try? await Task.sleep(nanoseconds: 100_000_000) }
            await paginate()
            // The items arrive through the listener a moment after the page loaded.
            try? await Task.sleep(nanoseconds: 250_000_000)
            if nav.snapshot.entries.count == before {
                stalls += 1
                if stalls >= 3 { break }
            } else {
                stalls = 0
            }
        }
        return TimelineNav.rowId(for: eventId, in: nav.snapshot.entries)
    }

    // MARK: Pins

    func setPinned(eventId: String, pinned: Bool) async {
        guard let timeline else { return }
        do {
            if pinned {
                _ = try await timeline.pinEvent(eventId: eventId)
            } else {
                _ = try await timeline.unpinEvent(eventId: eventId)
            }
            nav.setPinned(eventId, pinned)
        } catch {
            sendError = error.friendlyMessage
        }
    }

    // MARK: Deleting

    /// Deletes a message with an optional reason, your own or, with the power for it, someone else's.
    func redact(_ row: MessageRow, reason: String) async -> Bool {
        guard let timeline, let id = row.eventId else { return false }
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await timeline.redactEvent(eventOrTransactionId: id, reason: trimmed.isEmpty ? nil : trimmed)
            return true
        } catch {
            sendError = error.friendlyMessage
            return false
        }
    }

    // MARK: Links, source and history

    func permalink(of eventId: String) async -> String? {
        try? await room.matrixToEventPermalink(eventId: eventId)
    }

    /// The event as the client got it, and its newest replacement when it was edited.
    func sourceText(of row: MessageRow) -> String {
        guard let event = items.first(where: { $0.uniqueId().id == row.id })?.asEvent() else { return "{}" }
        let info = event.lazyProvider.debugInfo()
        return TimelineNav.sourceText(original: info.originalJson, latestEdit: info.latestEditJson)
    }

    func editHistory(of row: MessageRow) async -> [MessageEditVersion]? {
        guard let timeline, let id = row.remoteEventId else { return nil }
        guard let revisions = try? await timeline.editRevisions(eventId: id) else { return nil }
        var result: [MessageEditVersion] = []
        for (index, revision) in revisions.enumerated() {
            var date: Date?
            if let ts = revision.timestamp { date = Date(timeIntervalSince1970: TimeInterval(ts) / 1000) }
            result.append(MessageEditVersion(id: index, text: Self.preview(of: revision.content) ?? "", date: date))
        }
        return result
    }

    // MARK: Threads

    /// Sends a message into the thread of this (thread focused) timeline: `m.thread` to the root,
    /// answering the newest message there so clients without threads still read it as a reply.
    func sendInThread(text: String, root: String) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let timeline, !trimmed.isEmpty else { return false }
        let newest = nav.snapshot.entries.last(where: { ($0.eventId?.hasPrefix("$") ?? false) })?.eventId ?? root
        guard let relation = TimelineNav.threadRelationJSON(root: root, replyTo: newest, fallback: true) else { return false }
        let content = messageEventContentFromMarkdown(md: trimmed)
        setTyping(false)
        do {
            _ = try await timeline.sendWithExtraContent(msg: content, extraContentJson: relation)
            return true
        } catch {
            sendError = error.friendlyMessage
            return false
        }
    }
}
