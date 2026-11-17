import Foundation

/// Texts and the server read for automatic message deletion (#245); the rules are in RoomRetention.
enum RoomRetentionText {
    /// "1 hour", "7 days" ... in the app language.
    static func duration(_ lifetime: Int64) -> String {
        let (unit, count) = RoomRetention.label(lifetime)
        let values = ["count": String(count)]
        switch unit {
        case .days: return L("room.retention.days", values)
        case .hours: return L("room.retention.hours", values)
        case .minutes: return L("room.retention.minutes", values)
        }
    }

    /// The line in the chat header, e.g. "Auto-delete: 1 day".
    static func header(_ lifetime: Int64) -> String {
        L("room.retention.header", ["duration": duration(lifetime)])
    }
}

extension MatrixAccount {
    /// The room's message lifetime read from the server: `.some(nil)` when the room keeps its
    /// history, nil when the server could not be asked (keep what was known).
    func roomRetention(_ roomId: String) async -> Int64?? {
        do {
            let content = try await clientRequest(
                RoomSettingsAPI.rooms(roomId, "/state/\(RoomSettingsAPI.enc(RoomRetention.eventType))/"),
                method: "GET")
            let lifetime = RoomRetention.lifetime(content)
            rememberRetention(lifetime, roomId)
            return .some(lifetime)
        } catch let error as ClientAPIError where error.errcode == "M_NOT_FOUND" {
            rememberRetention(nil, roomId)
            return .some(nil)
        } catch {
            return nil
        }
    }

    private func rememberRetention(_ lifetime: Int64?, _ roomId: String) {
        guard retentionLifetimes[roomId] != lifetime else { return }
        retentionLifetimes[roomId] = lifetime
        objectWillChange.send()
    }

    /// Reads the lifetime of newly joined rooms one after another, in the background.
    func loadRetentions(_ roomIds: Set<String>) async {
        for roomId in roomIds.sorted() {
            if Task.isCancelled { return }
            _ = await roomRetention(roomId)
        }
    }

    /// The chat list preview, or nil once the newest message has expired in a room with
    /// automatic deletion.
    func shownLastMessage(_ room: RoomSummary) -> String? {
        guard let text = room.lastMessage else { return nil }
        guard let lifetime = retentionLifetimes[room.id], let date = room.lastActivity else { return text }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        return RoomRetention.isExpired(ts: Int64(date.timeIntervalSince1970 * 1000), lifetime: lifetime, now: now) ? nil : text
    }
}
