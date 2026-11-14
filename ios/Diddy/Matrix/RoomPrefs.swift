import Foundation
import MatrixRustSDK

// Per-room actions of the room list's context menu, like desktop's RoomNavItem menu: mark as read,
// favourite, notification level, link.

final class NotificationSettingsChanges: NotificationSettingsDelegate, @unchecked Sendable {
    private let handler: () -> Void
    init(_ handler: @escaping () -> Void) { self.handler = handler }
    func settingsDidChange() { handler() }
}

extension MatrixAccount {
    static func notifyLevel(of mode: RoomNotificationMode?) -> RoomNotifyLevel {
        guard let mode else { return .default }
        switch mode {
        case .allMessages: return .allMessages
        case .mentionsAndKeywordsOnly: return .mentionsAndKeywords
        case .mute: return .mute
        }
    }

    /// Reads the rooms' own notification settings (their push rules). A room without one is absent
    /// from the map and counts as "Default".
    func refreshNotifyLevels() async {
        let settings = await client.getNotificationSettings()
        var levels: [String: RoomNotifyLevel] = [:]
        for room in rooms where room.isJoined {
            if let mode = try? await settings.getUserDefinedRoomNotificationMode(roomId: room.id) {
                levels[room.id] = Self.notifyLevel(of: mode)
            }
        }
        if levels != roomNotifyLevels { roomNotifyLevels = levels }
    }

    /// Reads one room's own notification setting. Opening a chat only needs its room; reading all
    /// joined rooms one after the other on every chat switch took a round trip into the SDK per room.
    func refreshNotifyLevel(roomId: String) async {
        let settings = await client.getNotificationSettings()
        let mode = try? await settings.getUserDefinedRoomNotificationMode(roomId: roomId)
        let level = mode.map { Self.notifyLevel(of: $0) }
        if roomNotifyLevels[roomId] != level { roomNotifyLevels[roomId] = level }
    }

    /// Reload when the push rules change elsewhere, such as in the desktop app.
    func watchNotificationSettings() async {
        let settings = await client.getNotificationSettings()
        settings.setDelegate(delegate: NotificationSettingsChanges { [weak self] in
            Task { @MainActor in await self?.refreshNotifyLevels() }
        })
    }

    func notifyLevel(for roomId: String) -> RoomNotifyLevel {
        roomNotifyLevels[roomId] ?? .default
    }

    /// Desktop's RoomNotificationModeSwitcher: "Default" removes the room's rule, the others set it.
    func setNotifyLevel(_ level: RoomNotifyLevel, roomId: String) async throws {
        let settings = await client.getNotificationSettings()
        switch level {
        case .default:
            try await settings.restoreDefaultRoomNotificationMode(roomId: roomId)
        case .allMessages:
            try await settings.setRoomNotificationMode(roomId: roomId, mode: .allMessages)
        case .mentionsAndKeywords:
            try await settings.setRoomNotificationMode(roomId: roomId, mode: .mentionsAndKeywordsOnly)
        case .mute:
            try await settings.setRoomNotificationMode(roomId: roomId, mode: .mute)
        }
        roomNotifyLevels[roomId] = level == .default ? nil : level
    }

    /// Desktop's "Mark as Read": a read receipt on the newest message, and the manual unread mark off.
    func markRoomAsRead(_ roomId: String) async {
        guard let room = room(roomId) else { return }
        let type: ReceiptType = ChatSettings.shareActivity ? .read : .readPrivate
        try? await room.markAsRead(receiptType: type)
        try? await room.setUnreadFlag(newValue: false)
    }

    /// Desktop's "Add to Favourites" / "Remove from Favourites": the `m.favourite` room tag.
    func setFavourite(_ roomId: String, _ on: Bool) async throws {
        guard let room = room(roomId) else { throw DiddyError("This room is not available yet.") }
        try await room.setIsFavourite(isFavourite: on, tagOrder: nil)
    }

    /// Desktop's "Copy Link": a matrix.to link, by alias where the room has one.
    func roomLink(_ roomId: String) async -> String? {
        if let alias = summary(for: roomId)?.canonicalAlias, !alias.isEmpty {
            return "https://matrix.to/#/\(alias)"
        }
        return try? await room(roomId)?.matrixToPermalink()
    }
}
