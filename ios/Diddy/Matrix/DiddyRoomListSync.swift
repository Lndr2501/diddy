import Foundation

/// An options room profiles and badges are written into (all of them, not only the first).
struct DiddyWriteRoom: Equatable {
    let id: String
    let encrypted: Bool
    /// Joined members when the room was read, so a badge goes where the person can see it.
    let members: Set<String>
}

/// Which rooms are options rooms without the marker (message mode) and which ones you left on
/// purpose, shared by all devices of the account in the account data `app.diddy.options_rooms`
/// (desktop's `roomListSync.ts`, same format and rules):
///  - nothing stored on the account yet: this device's lists are written there
///  - the first time this device sees the stored lists: both are joined
///  - afterwards the stored lists win, unless this device changed its lists since it last synced
enum DiddyRoomListSync {
    static let eventType = "app.diddy.options_rooms"
    static let maxIds = 200

    struct Lists: Equatable {
        var light: [String]
        var left: [String]
    }

    static func clean(_ value: Any?) -> [String] {
        guard let list = value as? [Any] else { return [] }
        var out: [String] = []
        for case let id as String in list where id.hasPrefix("!") && id.count <= 255 && !out.contains(id) {
            out.append(id)
        }
        return Array(out.suffix(maxIds))
    }

    static func parse(_ content: [String: Any]?) -> Lists? {
        guard let content, content["light"] is [Any] || content["left"] is [Any] else { return nil }
        return Lists(light: clean(content["light"]), left: clean(content["left"]))
    }

    static func content(_ lists: Lists) -> [String: Any] {
        ["v": 1, "light": clean(lists.light), "left": clean(lists.left)]
    }

    static func same(_ a: Lists, _ b: Lists) -> Bool {
        Set(a.light) == Set(b.light) && Set(a.left) == Set(b.left)
    }

    /// What this device keeps and whether the account data has to be written. `merged`: this
    /// device joined its lists with the stored ones before; `changedHere`: it changed them since.
    static func reconcile(local: Lists, remote: Lists?, merged: Bool, changedHere: Bool) -> (next: Lists, write: Bool) {
        let mine = Lists(light: clean(local.light), left: clean(local.left))
        guard let remote else { return (mine, !mine.light.isEmpty || !mine.left.isEmpty) }
        if merged && changedHere { return (mine, !same(mine, remote)) }
        if merged { return (remote, false) }
        func union(_ a: [String], _ b: [String]) -> [String] { clean(b + a.filter { !b.contains($0) }) }
        let next = Lists(light: union(mine.light, remote.light), left: union(mine.left, remote.left))
        return (next, !same(next, remote))
    }
}

extension MatrixAccount {
    private var roomListsMergedKey: String { "diddy.roomListsMerged.\(id)" }
    static let leftOptionsRoomsKey = "diddyLeftOptionsRooms"

    /// Brings this device's lists and the account's in step (see DiddyRoomListSync).
    func syncDiddyRoomLists() async {
        let defaults = UserDefaults.standard
        let local = DiddyRoomListSync.Lists(
            light: DiddyLightRooms.ids(for: id).sorted(),
            left: defaults.stringArray(forKey: Self.leftOptionsRoomsKey) ?? []
        )
        let text: String?
        do {
            text = try await client.accountData(eventType: DiddyRoomListSync.eventType)
        } catch {
            // Offline: try again on the next load, never replace anything blindly.
            return
        }
        let stored = text.flatMap { $0.data(using: .utf8) }
            .flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
        let result = DiddyRoomListSync.reconcile(
            local: local, remote: DiddyRoomListSync.parse(stored),
            merged: defaults.bool(forKey: roomListsMergedKey), changedHere: DiddyLightRooms.changedHere(for: id)
        )
        if !DiddyRoomListSync.same(result.next, local) {
            DiddyLightRooms.replace(Set(result.next.light), for: id)
            defaults.set(result.next.left, forKey: Self.leftOptionsRoomsKey)
            DiagLog.shared.write("diddy: options room lists taken from the account light=\(result.next.light.count) left=\(result.next.left.count)")
        }
        if result.write {
            do {
                let data = try JSONSerialization.data(withJSONObject: DiddyRoomListSync.content(result.next))
                try await client.setAccountData(eventType: DiddyRoomListSync.eventType, content: String(decoding: data, as: UTF8.self))
            } catch {
                DiagLog.shared.write("diddy: could not save the options room lists: \(error.friendlyMessage)")
                return
            }
        }
        defaults.set(true, forKey: roomListsMergedKey)
        DiddyLightRooms.clearChangedHere(for: id)
    }
}
