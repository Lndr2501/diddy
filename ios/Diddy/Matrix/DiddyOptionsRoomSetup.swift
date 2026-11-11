import Foundation
import MatrixRustSDK

/// A room that can become, or already is, the Diddy Options room.
struct DiddyRoomChoice: Identifiable, Hashable {
    let id: String
    let name: String
    let joined: Bool
    /// The server (space) it was found in, for rooms you have not joined.
    let spaceName: String?
    let looksLikeDiddy: Bool
    let via: [String]
}

/// Rooms used as options room in message mode ("Use without admin rights", and the room you joined
/// from the welcome guide). Desktop keeps this list in `localStorage` (`diddyLightRooms`); here it
/// is per account in the app's defaults, the same list the welcome guide writes.
enum DiddyLightRooms {
    private static func key(_ accountId: String) -> String { "diddy.lightOptionsRooms.\(accountId)" }

    static func ids(for accountId: String) -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: key(accountId)) ?? [])
    }

    static func add(_ roomId: String, for accountId: String) {
        var all = ids(for: accountId)
        all.insert(roomId)
        UserDefaults.standard.set(all.sorted(), forKey: key(accountId))
    }

    static func remove(_ roomId: String, for accountId: String) {
        var all = ids(for: accountId)
        all.remove(roomId)
        UserDefaults.standard.set(all.sorted(), forKey: key(accountId))
    }
}

/// Setting up the hidden Diddy Options room like desktop's Settings > Profile and onboarding do:
/// create one, turn an existing room into it, use a room without admin rights (message mode), or
/// join the one of your server.
extension MatrixAccount {
    private static func setupPath(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? value
    }

    /// Rooms used in message mode only on this device.
    var diddyLightRoomIds: Set<String> { DiddyLightRooms.ids(for: id) }

    private var homeServerName: String { (try? client.userIdServerName()) ?? record.serverName }

    // MARK: Choosing a room

    /// The rooms to pick from: your own, and the ones inside your servers that you have not joined
    /// yet (`discoverSpaceRooms`), Diddy rooms marked.
    func diddyRoomChoices() async -> [DiddyRoomChoice] {
        var out: [DiddyRoomChoice] = []
        var seen: Set<String> = []
        for room in rooms where room.isJoined && !room.isSpace && !room.isDirect {
            let marked = diddyOptionsRooms.contains(room.id)
                || DiddyOptionsRoomLogic.looksLikeDiddyRoom(name: room.name, topic: room.topic)
            out.append(DiddyRoomChoice(id: room.id, name: room.name, joined: true, spaceName: nil, looksLikeDiddy: marked, via: []))
            seen.insert(room.id)
        }
        let joinedIds = Set(rooms.filter(\.isJoined).map(\.id))
        for space in spaces {
            for found in await hierarchyRooms(of: space.roomId) where !joinedIds.contains(found.room.roomId) && !seen.contains(found.room.roomId) {
                seen.insert(found.room.roomId)
                let name = found.room.name ?? found.room.roomId
                out.append(DiddyRoomChoice(
                    id: found.room.roomId, name: name, joined: false, spaceName: space.displayName,
                    looksLikeDiddy: DiddyOptionsRoomLogic.looksLikeDiddyRoom(name: found.room.name, topic: found.room.topic),
                    via: found.via
                ))
            }
        }
        return out.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// The rooms of one space, up to three pages, without sub-spaces. Errors of a space are ignored
    /// (no permission, federation problems, ...).
    private func hierarchyRooms(of spaceId: String) async -> [(room: DiddyOptionsRoomLogic.HierarchyRoom, via: [String])] {
        var out: [(room: DiddyOptionsRoomLogic.HierarchyRoom, via: [String])] = []
        var childVia: [String: [String]] = [:]
        var token: String?
        for _ in 0..<3 {
            var path = "/_matrix/client/v1/rooms/\(Self.setupPath(spaceId))/hierarchy?limit=100&max_depth=1"
            if let token, let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { path += "&from=\(encoded)" }
            guard let json = try? await clientRequest(path) else { break }
            for entry in json["rooms"] as? [[String: Any]] ?? [] {
                guard let roomId = entry["room_id"] as? String else { continue }
                if roomId == spaceId {
                    for child in entry["children_state"] as? [[String: Any]] ?? [] {
                        if let key = child["state_key"] as? String,
                           let via = (child["content"] as? [String: Any])?["via"] as? [String], !via.isEmpty {
                            childVia[key] = via
                        }
                    }
                    continue
                }
                if entry["room_type"] as? String == "m.space" { continue }
                let name = (entry["name"] as? String) ?? (entry["canonical_alias"] as? String)
                out.append((DiddyOptionsRoomLogic.HierarchyRoom(roomId: roomId, name: name, topic: entry["topic"] as? String), []))
            }
            token = json["next_batch"] as? String
            if token == nil { break }
        }
        return out.map { (room: $0.room, via: DiddyOptionsRoomLogic.viaServers(roomId: $0.room.roomId, childVia: childVia[$0.room.roomId])) }
    }

    // MARK: Create, adopt, use, join

    /// Creates the hidden room. With a space it becomes a child of it that every member of the
    /// space can join, so their Diddy finds it by itself.
    func createDiddyOptionsRoom(name: String, spaceId: String?) async throws {
        let domain = homeServerName
        let body = DiddyOptionsRoomLogic.createRoomBody(name: name, spaceId: spaceId, serverName: domain)
        let json: [String: Any]
        do {
            json = try await clientRequest("/_matrix/client/v3/createRoom", body: body)
        } catch {
            throw DiddyError("Could not create the room: \(error.friendlyMessage)")
        }
        guard let roomId = json["room_id"] as? String else { throw DiddyError("The server could not create the room.") }
        if let spaceId, !spaceId.isEmpty {
            // The room exists and works without the space child entry, so a failure here is ignored.
            _ = try? await clientRequest(
                "/_matrix/client/v3/rooms/\(Self.setupPath(spaceId))/state/m.space.child/\(Self.setupPath(roomId))",
                body: DiddyOptionsRoomLogic.spaceChildContent(serverName: domain), method: "PUT"
            )
        }
        await registerDiddyRoom(roomId)
    }

    /// Turns a room into the options room: everyone may write their profile there, badges only
    /// admins. Needs permission to change the room's settings. Joins it first when needed.
    func adoptRoomAsDiddyOptions(roomId: String, via: [String] = [], tagTopic: Bool) async throws {
        try await joinForDiddy(roomId, via: via)
        let base = "/_matrix/client/v3/rooms/\(Self.setupPath(roomId))"
        var current: [String: Any]?
        for _ in 0..<10 {
            current = try? await clientRequest(base + "/state/m.room.power_levels")
            if current != nil { break }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        guard let levels = current else { throw DiddyError("Could not read this room's permissions yet. Try again in a moment.") }
        do {
            _ = try await clientRequest(base + "/state/m.room.power_levels", body: DiddyOptionsRoomLogic.adoptedPowerLevels(levels), method: "PUT")
            _ = try await clientRequest(base + "/state/\(DiddyEvents.marker)", body: ["v": 1], method: "PUT")
        } catch {
            throw DiddyError("Could not use this room: you need permission to change its settings. (\(error.friendlyMessage))")
        }
        if tagTopic {
            let topic = (try? await clientRequest(base + "/state/m.room.topic"))?["topic"] as? String ?? ""
            if let tagged = DiddyOptionsRoomLogic.taggedTopic(topic) {
                _ = try? await clientRequest(base + "/state/m.room.topic", body: ["topic": tagged], method: "PUT")
            }
        }
        DiddyLightRooms.remove(roomId, for: id)
        await registerDiddyRoom(roomId)
    }

    /// Uses a room in message mode: no admin rights needed, but everyone has to choose the same
    /// room themselves. The profile is stored as hidden messages in it.
    func useDiddyRoomWithoutAdmin(roomId: String, via: [String] = []) async throws {
        try await joinForDiddy(roomId, via: via)
        DiddyLightRooms.add(roomId, for: id)
        await registerDiddyRoom(roomId)
    }

    /// Joins an options room of a server and connects it (onboarding's `joinAndConnect`): when it
    /// is not marked yet it is adopted, or used without admin rights if that is refused.
    func connectDiddyRoom(roomId: String, via: [String]) async throws {
        try await joinForDiddy(roomId, via: via)
        var marked = diddyOptionsRooms.contains(roomId)
        if !marked { marked = await hasDiddyMarker(roomId) }
        if marked {
            diddyOptionsRooms.insert(roomId)
            await registerDiddyRoom(roomId)
            return
        }
        do {
            try await adoptRoomAsDiddyOptions(roomId: roomId, tagTopic: false)
        } catch {
            DiddyLightRooms.add(roomId, for: id)
            await registerDiddyRoom(roomId)
        }
    }

    /// The options room of one of your servers that you have not joined (`joinOptionsRoomOfSpace`),
    /// nil when there is none.
    func findDiddyRoom(ofServer spaceId: String) async -> DiddyRoomChoice? {
        let left = Set(UserDefaults.standard.stringArray(forKey: "diddyLeftOptionsRooms") ?? [])
        let found = await hierarchyRooms(of: spaceId)
        let joined = Set(rooms.filter(\.isJoined).map(\.id))
        let candidate = DiddyOptionsRoomLogic.joinCandidate(
            in: found.map { $0.room }, spaceId: spaceId,
            membership: { joined.contains($0) ? "join" : nil },
            leftOnPurpose: { left.contains($0) }
        )
        guard let pick = candidate, let entry = found.first(where: { $0.room.roomId == pick.roomId }) else { return nil }
        return DiddyRoomChoice(id: pick.roomId, name: pick.name ?? pick.roomId, joined: false,
                               spaceName: spaces.first { $0.roomId == spaceId }?.displayName, looksLikeDiddy: true, via: entry.via)
    }

    /// Joins the options room of your servers when you have none yet: what desktop does by itself
    /// after the first sync. Asks the servers at most every ten minutes and never fails loudly.
    func joinDiddyOptionsRoomAutomatically() async {
        guard diddyPrimaryRoom == nil, diddyOptionsRooms.isEmpty, diddyLightRoomIds.isEmpty, !spaces.isEmpty else { return }
        let key = "diddyAutoJoinAt.\(userId)"
        let last = UserDefaults.standard.double(forKey: key)
        if last > 0, Date().timeIntervalSince1970 - last < 600 { return }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: key)
        for space in spaces {
            guard let choice = await findDiddyRoom(ofServer: space.roomId) else { continue }
            do {
                try await connectDiddyRoom(roomId: choice.id, via: choice.via)
                return
            } catch {
                DiagLog.shared.write("diddy: joining the options room of a server failed: \(error.friendlyMessage)")
            }
        }
    }

    // MARK: Helpers

    /// Whether the room carries the `app.diddy.options` marker (desktop's `isOptionsRoom`).
    private func hasDiddyMarker(_ roomId: String) async -> Bool {
        (try? await clientRequest("/_matrix/client/v3/rooms/\(Self.setupPath(roomId))/state/\(DiddyEvents.marker)/")) != nil
    }

    private func joinForDiddy(_ roomId: String, via: [String]) async throws {
        if rooms.contains(where: { $0.id == roomId && $0.isJoined }) { return }
        do {
            _ = try await client.joinRoomByIdOrAlias(roomIdOrAlias: roomId, serverNames: via)
        } catch {
            throw DiddyError("Could not join the room. \(error.friendlyMessage)")
        }
        for _ in 0..<40 {
            if rooms.contains(where: { $0.id == roomId && $0.isJoined }) { return }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        throw DiddyError("Joining the room takes too long. Try again in a moment.")
    }

    /// Makes the new room known and reads it, so the profile can be saved right away.
    private func registerDiddyRoom(_ roomId: String) async {
        for _ in 0..<40 {
            if rooms.contains(where: { $0.id == roomId && $0.isJoined }) { break }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        if !DiddyLightRooms.ids(for: id).contains(roomId) { diddyOptionsRooms.insert(roomId) }
        diddyCheckedRooms.insert(roomId)
        await reloadDiddyProfilesForWrite()
    }
}
