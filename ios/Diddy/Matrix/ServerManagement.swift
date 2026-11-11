import Foundation
import MatrixRustSDK

// What the desktop app does with servers (spaces) beyond joining them: the server rail layout,
// adding and removing channels, suggested channels, creating rooms and servers with all options,
// and the public room directory. The SDK has no calls for most of this, so it goes through the
// client API like the other helpers in MatrixAccount.

extension MatrixAccount {
    private static func escaped(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#&=+"))) ?? value
    }

    var ownServerName: String { (try? client.userIdServerName()) ?? record.serverName }

    // MARK: - Server rail (in.cinny.spaces)

    private func isKnownJoinedSpace(_ roomId: String) -> Bool {
        if spaces.contains(where: { $0.roomId == roomId }) { return true }
        if let summary = summary(for: roomId) { return summary.isSpace && summary.isJoined }
        return false
    }

    /// Reads the layout desktop keeps and applies it to the servers you are in.
    func refreshRail() async {
        var stored: [String: Any]?
        if let text = try? await client.accountData(eventType: ServerRailLayout.eventType),
           let data = text.data(using: .utf8) {
            stored = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        }
        railContent = stored ?? [:]
        let entries = ServerRailLayout.parse(stored, orphanSpaces: spaces.map(\.roomId), isJoinedSpace: { self.isKnownJoinedSpace($0) })
        if entries != railEntries { railEntries = entries }
    }

    /// Shows the new order at once and writes it to the account data, which desktop shows too.
    func saveRail(_ entries: [RailEntry]) async throws {
        let previous = railEntries
        railEntries = entries
        do {
            let content = ServerRailLayout.content(entries, mergedInto: railContent)
            let data = try JSONSerialization.data(withJSONObject: content)
            try await client.setAccountData(eventType: ServerRailLayout.eventType, content: String(decoding: data, as: UTF8.self))
            railContent = content
        } catch {
            railEntries = previous
            throw error
        }
    }

    /// A server's name and picture for the rail, also for those nested deeper than the top level.
    func serverInfo(_ spaceId: String) -> (name: String, avatarUrl: String?) {
        if let space = spaces.first(where: { $0.roomId == spaceId }) { return (space.displayName, space.avatarUrl) }
        if let summary = summary(for: spaceId) { return (summary.name, summary.avatarUrl) }
        return (spaceId, nil)
    }

    // MARK: - Server structure

    /// Where a room can be reached from, for the `via` of its `m.space.child` event.
    func viaServers(for roomId: String) async -> [String] {
        let members = (try? await joinedMembers(of: roomId)) ?? []
        var fallback: [String] = []
        if let server = SpaceChildLinks.serverName(of: roomId) { fallback.append(server) }
        fallback.append(ownServerName)
        return ViaServers.pick(memberIds: members, fallback: fallback)
    }

    private func putSpaceChild(parent: String, child: String, content: [String: Any]) async throws {
        _ = try await clientRequest(
            "/_matrix/client/v3/rooms/\(Self.escaped(parent))/state/m.space.child/\(Self.escaped(child))",
            body: content,
            method: "PUT"
        )
    }

    /// The tree of a server with the data of every link, as the manage screen shows it.
    func serverTree(_ spaceId: String) async throws -> [HierarchyRow] {
        var rooms: [[String: Any]] = []
        var next: String?
        for _ in 0..<10 {
            var path = "/_matrix/client/v1/rooms/\(Self.escaped(spaceId))/hierarchy?limit=200"
            if let next, let token = next.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+"))) {
                path += "&from=\(token)"
            }
            let json = try await clientRequest(path)
            rooms += json["rooms"] as? [[String: Any]] ?? []
            next = json["next_batch"] as? String
            if next == nil { break }
        }
        return ServerHierarchy.flatten(hierarchyRooms: rooms, rootId: spaceId)
    }

    /// Desktop's "Add Existing": every picked room becomes a child that is not auto-joined and not
    /// suggested. Returns how many could not be added.
    func addExistingRooms(_ roomIds: [String], to spaceId: String) async -> Int {
        var failed = 0
        for roomId in roomIds {
            do {
                let via = await viaServers(for: roomId)
                try await putSpaceChild(parent: spaceId, child: roomId, content: SpaceChildLinks.addedChildContent(via: via))
            } catch { failed += 1 }
        }
        await refreshAfterStructureChange()
        return failed
    }

    /// Desktop's "Remove": an emptied `m.space.child` event.
    func removeChild(_ childId: String, from spaceId: String) async throws {
        try await putSpaceChild(parent: spaceId, child: childId, content: [:])
        await refreshAfterStructureChange()
    }

    /// Desktop's "Set Suggested" / "Unset Suggested".
    func toggleSuggested(_ row: HierarchyRow) async throws {
        try await putSpaceChild(parent: row.parentId, child: row.roomId, content: SpaceChildLinks.toggledSuggested(row.childContent))
        await refreshAfterStructureChange()
    }

    private func refreshAfterStructureChange() async {
        await reloadSpaces()
        await loadAllChannels()
        await refreshRail()
    }

    /// Rooms you could add to a server: joined rooms (spaces too, for sub-servers), not the server itself.
    func addableRooms(to spaceId: String, spacesOnly: Bool, alreadyInside: Set<String>) -> [RoomSummary] {
        let ids = ServerHierarchy.addable(rooms.map(\.id), alreadyInside: alreadyInside, serverId: spaceId)
        let allowed = Set(ids)
        return rooms
            .filter { allowed.contains($0.id) && $0.isJoined && $0.isSpace == spacesOnly && !$0.isDirect && !isDiddyOptionsRoom($0.id, topic: $0.topic) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Marks every channel of a server read.
    func markServerAsRead(_ spaceId: String) async {
        let ids = (categories[spaceId] ?? []).flatMap { $0.channels.map(\.roomId) }
        for id in ids where isJoined(id) { await markRoomAsRead(id) }
    }

    private func isJoined(_ roomId: String) -> Bool { summary(for: roomId)?.isJoined ?? false }

    // MARK: - Creating rooms and servers

    /// The room versions the server offers and its default, for the creation sheets.
    func roomVersionChoices() async -> (defaultVersion: String?, available: [String]) {
        guard let json = try? await clientRequest("/_matrix/client/v3/capabilities") else { return (nil, []) }
        return (NewRoomVersionSupport.defaultVersion(fromCapabilities: json), NewRoomVersionSupport.availableVersions(fromCapabilities: json))
    }

    /// Creates a room or server like desktop's create dialogs. With a parent it is also listed as
    /// that server's child, as desktop does after creating.
    func createRoom(_ request: NewRoomRequest) async throws -> String {
        var request = request
        if let parentId = request.parentId, request.parentVia.isEmpty {
            let via = await viaServers(for: parentId)
            request.parentVia = via.isEmpty ? [ownServerName] : via
        }
        let json = try await clientRequest("/_matrix/client/v3/createRoom", body: request.body())
        guard let id = json["room_id"] as? String else { throw DiddyError("The server could not create the room.") }
        if request.isVoice { markVoiceRoom(id) }
        if let parentId = request.parentId {
            try await putSpaceChild(parent: parentId, child: id, content: NewRoomRequest.childContent(via: request.parentVia))
        }
        try? await waitForRoom(id)
        await refreshAfterStructureChange()
        return id
    }

    // MARK: - Public room directory

    func publicRooms(server: String?, term: String, filter: PublicRoomTypeFilter, since: String?) async throws -> PublicRoomsPage {
        let path = RoomDirectory.path(server: server, own: ownServerName)
        let json = try await clientRequest(path, body: RoomDirectory.body(term: term, filter: filter, since: since))
        return RoomDirectory.parse(json)
    }

    /// What a room or server shows before you join (desktop's RoomSummaryLoader): the room summary
    /// of the client API, in its stable and its older unstable form.
    func roomPreview(_ idOrAlias: String, via: [String] = []) async -> PublicRoomEntry? {
        var query = ""
        let servers = via.compactMap { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+"))) }
        if !servers.isEmpty { query = "?" + servers.map { "via=\($0)" }.joined(separator: "&") }
        for prefix in ["/_matrix/client/v1/room_summary/", "/_matrix/client/unstable/im.nheko.summary/summary/"] {
            guard let json = try? await clientRequest(prefix + Self.escaped(idOrAlias) + query),
                  json["room_id"] is String else { continue }
            return RoomDirectory.parse(["chunk": [json]]).rooms.first
        }
        return nil
    }

    /// Joins by id or alias and brings the room list and servers up to date. Returns the room id.
    func joinRoom(_ idOrAlias: String, via: [String]) async throws -> String {
        let room = try await client.joinRoomByIdOrAlias(roomIdOrAlias: idOrAlias, serverNames: via)
        await reloadSpaces()
        await loadAllChannels()
        await refreshRail()
        return room.id()
    }

    /// Knocking on a room that wants an invitation first.
    func knockOnRoom(_ idOrAlias: String, via: [String]) async throws {
        _ = try await client.knock(roomIdOrAlias: idOrAlias, reason: nil, serverNames: via)
    }
}
