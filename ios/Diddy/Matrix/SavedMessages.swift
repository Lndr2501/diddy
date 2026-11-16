import Combine
import CoreFoundation
import Foundation

// Same account-data format and merge rules as cinny/src/app/utils/savedMessages.ts.
// Account data is NOT encrypted: only event identifiers and timestamps belong here.
struct SavedMessage: Identifiable, Equatable {
    let roomId: String
    let eventId: String
    let savedTs: Int64
    var id: String { roomId + "\u{0}" + eventId }
    var json: [String: Any] { ["room_id": roomId, "event_id": eventId, "saved_ts": savedTs] }
}

struct SavedRemoval: Equatable {
    let roomId: String
    let eventId: String
    let removedTs: Int64
    var id: String { roomId + "\u{0}" + eventId }
    var json: [String: Any] { ["room_id": roomId, "event_id": eventId, "removed_ts": removedTs] }
}

struct SavedMessagesState {
    var saved: [SavedMessage] = []
    var removed: [SavedRemoval] = []
    var json: [String: Any] {
        ["version": 1, "saved": saved.map(\.json), "removed": removed.map(\.json)]
    }
    func contains(_ roomId: String, _ eventId: String) -> Bool {
        saved.contains { $0.roomId == roomId && $0.eventId == eventId }
    }
}

enum SavedMessagesLogic {
    static let type = "app.diddy.saved_messages"
    static let limit = 300
    static let removedLimit = 100
    static let removedKeepMs: Int64 = 30 * 24 * 60 * 60 * 1000
    static var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    private static func valid(_ raw: [String: Any], time: String) -> (String, String, Int64)? {
        guard let room = raw["room_id"] as? String, room.hasPrefix("!"), room.count <= 255, room.count > 1,
              let event = raw["event_id"] as? String, event.hasPrefix("$"), event.count <= 255, event.count > 1,
              let number = raw[time] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let timestamp = number.int64Value
        guard timestamp >= 0, number.doubleValue == Double(timestamp) else { return nil }
        return (room, event, timestamp)
    }

    static func parse(_ raw: [String: Any]?, now: Int64) -> SavedMessagesState {
        merge([raw ?? [:]], now: now)
    }

    static func merge(_ sources: [[String: Any]], now: Int64) -> SavedMessagesState {
        var saves: [String: SavedMessage] = [:]
        var removals: [String: SavedRemoval] = [:]
        for source in sources {
            for raw in source["saved"] as? [[String: Any]] ?? [] {
                guard let (room, event, ts) = valid(raw, time: "saved_ts") else { continue }
                let item = SavedMessage(roomId: room, eventId: event, savedTs: ts)
                if ts > (saves[item.id]?.savedTs ?? -1) { saves[item.id] = item }
            }
            for raw in source["removed"] as? [[String: Any]] ?? [] {
                guard let (room, event, ts) = valid(raw, time: "removed_ts") else { continue }
                let item = SavedRemoval(roomId: room, eventId: event, removedTs: ts)
                if ts > (removals[item.id]?.removedTs ?? -1) { removals[item.id] = item }
            }
        }
        let saved = saves.values.filter { $0.savedTs > (removals[$0.id]?.removedTs ?? -1) }
            .sorted { $0.savedTs == $1.savedTs ? $0.id < $1.id : $0.savedTs > $1.savedTs }
        let removed = removals.values.filter {
            $0.removedTs >= (saves[$0.id]?.savedTs ?? -1) && now - $0.removedTs <= removedKeepMs
        }.sorted { $0.removedTs == $1.removedTs ? $0.id < $1.id : $0.removedTs > $1.removedTs }
        return SavedMessagesState(saved: Array(saved.prefix(limit)), removed: Array(removed.prefix(removedLimit)))
    }

    static func save(_ state: SavedMessagesState, roomId: String, eventId: String, now: Int64) -> SavedMessagesState? {
        if state.contains(roomId, eventId) { return state }
        if state.saved.count >= limit { return nil }
        let previous = state.removed.first { $0.roomId == roomId && $0.eventId == eventId }?.removedTs ?? -1
        let item = SavedMessage(roomId: roomId, eventId: eventId, savedTs: max(now, previous + 1))
        return merge([state.json, ["saved": [item.json]]], now: now)
    }

    static func remove(_ state: SavedMessagesState, roomId: String, eventId: String, now: Int64) -> SavedMessagesState {
        guard let current = state.saved.first(where: { $0.roomId == roomId && $0.eventId == eventId }) else { return state }
        let marker = SavedRemoval(roomId: roomId, eventId: eventId, removedTs: max(now, current.savedTs + 1))
        return merge([state.json, ["removed": [marker.json]]], now: now)
    }
}

/// One store per signed-in account; changes are serialized on this device. Every mutation reads the
/// server first; a read after writing reconciles a crossed write from another device (best effort:
/// Matrix account data has no compare-and-swap operation).
@MainActor
final class SavedMessagesStore: ObservableObject {
    @Published private(set) var state = SavedMessagesState()
    @Published var error: String?
    @Published private(set) var loaded = false
    private var accountId: String?
    private var pending: Task<Void, Never>?

    func refresh(account: MatrixAccount) async {
        if accountId != account.id {
            accountId = account.id
            state = SavedMessagesState()
            loaded = false
        }
        do {
            let remote = try await account.globalAccountData(type: SavedMessagesLogic.type)
            guard accountId == account.id else { return }
            state = SavedMessagesLogic.parse(remote, now: SavedMessagesLogic.now)
            loaded = true
        } catch { self.error = error.friendlyMessage }
    }

    func toggle(account: MatrixAccount, roomId: String, eventId: String) {
        let removing = state.contains(roomId, eventId)
        change(account: account, roomId: roomId, eventId: eventId, removing: removing)
    }

    func remove(account: MatrixAccount, item: SavedMessage) {
        change(account: account, roomId: item.roomId, eventId: item.eventId, removing: true)
    }

    private func change(account: MatrixAccount, roomId: String, eventId: String, removing: Bool) {
        if accountId != account.id {
            accountId = account.id
            state = SavedMessagesState()
            loaded = false
            pending = nil
        }
        let previous = pending
        pending = Task {
            await previous?.value
            do {
                let remote = try await account.globalAccountData(type: SavedMessagesLogic.type)
                let base = SavedMessagesLogic.parse(remote, now: SavedMessagesLogic.now)
                let next: SavedMessagesState
                if removing {
                    next = SavedMessagesLogic.remove(base, roomId: roomId, eventId: eventId, now: SavedMessagesLogic.now)
                } else {
                    guard let saved = SavedMessagesLogic.save(base, roomId: roomId, eventId: eventId, now: SavedMessagesLogic.now) else {
                        error = "You can save up to \(SavedMessagesLogic.limit) messages. Remove one from Saved first."
                        return
                    }
                    next = saved
                }
                guard accountId == account.id else { return }
                if next.saved == base.saved && next.removed == base.removed {
                    state = base
                    loaded = true
                    return
                }
                try await write(account: account, state: next)
                state = next
                loaded = true
                let after = try await account.globalAccountData(type: SavedMessagesLogic.type)
                let merged = SavedMessagesLogic.merge([after ?? [:], next.json], now: SavedMessagesLogic.now)
                let observed = SavedMessagesLogic.parse(after, now: SavedMessagesLogic.now)
                if merged.saved != observed.saved || merged.removed != observed.removed {
                    try await write(account: account, state: merged)
                }
                state = merged
            } catch { self.error = error.friendlyMessage }
        }
    }

    private func write(account: MatrixAccount, state: SavedMessagesState) async throws {
        let user = MatrixAccount.securityPathComponent(account.userId)
        let type = MatrixAccount.securityPathComponent(SavedMessagesLogic.type)
        _ = try await account.clientRequest("/_matrix/client/v3/user/\(user)/account_data/\(type)", body: state.json, method: "PUT")
    }
}
