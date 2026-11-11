import Foundation

// Pure logic of the room list, the server rail and the creation sheets, mirroring the desktop app.
// Foundation only, checked by Tools/roomlist_check.

// MARK: - Notification level per room

/// The choices of desktop's RoomNotificationModeSwitcher (components/RoomNotificationSwitcher.tsx).
/// "Default" removes the room's own push rule; the others are the same push rules desktop writes
/// (room rule that notifies, room rule that does not, override rule that mutes).
enum RoomNotifyLevel: String, CaseIterable, Identifiable {
    case `default`
    case allMessages
    case mentionsAndKeywords
    case mute

    var id: String { rawValue }

    /// Desktop's wording.
    var title: String {
        switch self {
        case .default: return "Default"
        case .allMessages: return "All Messages"
        case .mentionsAndKeywords: return "Mention & Keywords"
        case .mute: return "Mute"
        }
    }

    var systemImage: String {
        switch self {
        case .default: return "bell"
        case .allMessages: return "bell.fill"
        case .mentionsAndKeywords: return "at"
        case .mute: return "bell.slash"
        }
    }
}

// MARK: - Server rail (account data `in.cinny.spaces`, shared with desktop)

/// A folder of servers on the rail, as desktop's `ISidebarFolder`.
struct RailFolder: Equatable {
    var id: String
    var name: String?
    var content: [String]
}

/// One rail item: a server (space id) or a folder of servers.
enum RailEntry: Equatable {
    case space(String)
    case folder(RailFolder)

    var spaceIds: [String] {
        switch self {
        case .space(let id): return [id]
        case .folder(let folder): return folder.content
        }
    }
}

extension RailEntry: Identifiable {
    var id: String {
        switch self {
        case .space(let id): return id
        case .folder(let folder): return "folder-" + folder.id
        }
    }
}

/// Reads and writes the rail layout desktop keeps in the account data `in.cinny.spaces`
/// (hooks/useSidebarItems.ts), so reordering on one device shows on the other.
enum ServerRailLayout {
    static let eventType = "in.cinny.spaces"

    /// Desktop's `parseSidebar`: entries in the stored order, only joined spaces, no duplicates;
    /// top-level spaces the layout does not mention yet are appended at the end.
    static func parse(_ content: [String: Any]?, orphanSpaces: [String], isJoinedSpace: (String) -> Bool) -> [RailEntry] {
        let stored = (content?["sidebar"] as? [Any]) ?? (content?["shortcut"] as? [Any]) ?? []
        var orphans = orphanSpaces
        var result: [RailEntry] = []
        var seenSpaces: Set<String> = []
        var seenFolders: Set<String> = []
        for item in stored {
            if let spaceId = item as? String {
                if isJoinedSpace(spaceId) && !seenSpaces.contains(spaceId) {
                    seenSpaces.insert(spaceId)
                    orphans.removeAll { $0 == spaceId }
                    result.append(.space(spaceId))
                }
                continue
            }
            guard let object = item as? [String: Any],
                  let id = object["id"] as? String,
                  let content = object["content"] as? [Any],
                  !seenFolders.contains(id) else { continue }
            seenFolders.insert(id)
            var safe: [String] = []
            for case let spaceId as String in content where isJoinedSpace(spaceId) && !safe.contains(spaceId) {
                safe.append(spaceId)
            }
            orphans.removeAll { safe.contains($0) }
            result.append(.folder(RailFolder(id: id, name: object["name"] as? String, content: safe)))
        }
        for spaceId in orphans where !result.contains(where: { $0.spaceIds.contains(spaceId) }) {
            result.append(.space(spaceId))
        }
        return result
    }

    /// The `sidebar` array as desktop writes it.
    static func json(_ entries: [RailEntry]) -> [Any] {
        entries.map { entry -> Any in
            switch entry {
            case .space(let id):
                return id
            case .folder(let folder):
                var object: [String: Any] = ["id": folder.id, "content": folder.content]
                if let name = folder.name { object["name"] = name }
                return object
            }
        }
    }

    /// Desktop's `makeCinnySpacesContent`: keeps whatever else the event holds.
    static func content(_ entries: [RailEntry], mergedInto current: [String: Any]) -> [String: Any] {
        var content = current
        content["sidebar"] = json(entries)
        return content
    }

    /// Desktop's `randomStr`: 12 capital letters.
    static func newFolderId() -> String {
        let letters = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        return String((0..<12).map { _ in letters[Int.random(in: 0..<letters.count)] })
    }

    /// SwiftUI's `onMove`, without SwiftUI.
    static func moved<T>(_ items: [T], from source: IndexSet, to destination: Int) -> [T] {
        let moving = source.filter { $0 >= 0 && $0 < items.count }.map { items[$0] }
        var rest: [T] = []
        for (index, item) in items.enumerated() where !source.contains(index) { rest.append(item) }
        let shift = source.filter { $0 < destination }.count
        let target = min(max(destination - shift, 0), rest.count)
        rest.insert(contentsOf: moving, at: target)
        return rest
    }

    /// Desktop's "make-child" drop: a server put onto another server makes a folder of both,
    /// put onto a folder joins it.
    static func put(_ spaceId: String, into targetIndex: Int, of entries: [RailEntry]) -> [RailEntry] {
        guard entries.indices.contains(targetIndex) else { return entries }
        let target = entries[targetIndex]
        if case .space(let id) = target, id == spaceId { return entries }
        var result: [RailEntry] = []
        for (index, entry) in entries.enumerated() {
            if index == targetIndex {
                switch entry {
                case .space(let id):
                    result.append(.folder(RailFolder(id: newFolderId(), name: nil, content: [id, spaceId])))
                case .folder(var folder):
                    folder.content.removeAll { $0 == spaceId }
                    folder.content.append(spaceId)
                    result.append(.folder(folder))
                }
                continue
            }
            if let kept = removing(spaceId, from: entry) { result.append(kept) }
        }
        return result
    }

    /// Takes a server out of its folder and places it right after the folder. A folder left
    /// empty disappears, as on desktop.
    static func takeOut(_ spaceId: String, of entries: [RailEntry]) -> [RailEntry] {
        var result: [RailEntry] = []
        for entry in entries {
            guard case .folder(var folder) = entry, folder.content.contains(spaceId) else {
                result.append(entry)
                continue
            }
            folder.content.removeAll { $0 == spaceId }
            if !folder.content.isEmpty { result.append(.folder(folder)) }
            result.append(.space(spaceId))
        }
        return result
    }

    /// Reorders the servers inside one folder.
    static func moveInFolder(_ folderId: String, from source: IndexSet, to destination: Int, of entries: [RailEntry]) -> [RailEntry] {
        entries.map { entry in
            guard case .folder(var folder) = entry, folder.id == folderId else { return entry }
            folder.content = moved(folder.content, from: source, to: destination)
            return .folder(folder)
        }
    }

    /// Renames a folder; an empty name removes the name, as desktop does.
    static func renamed(_ folderId: String, to name: String, in entries: [RailEntry]) -> [RailEntry] {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return entries.map { entry in
            guard case .folder(var folder) = entry, folder.id == folderId else { return entry }
            folder.name = trimmed.isEmpty ? nil : trimmed
            return .folder(folder)
        }
    }

    /// Replaces a folder by its servers, in place.
    static func dissolved(_ folderId: String, in entries: [RailEntry]) -> [RailEntry] {
        var result: [RailEntry] = []
        for entry in entries {
            if case .folder(let folder) = entry, folder.id == folderId {
                result += folder.content.map { RailEntry.space($0) }
            } else {
                result.append(entry)
            }
        }
        return result
    }

    /// A new folder holding one server, put where that server was (after its old folder, if any).
    static func foldered(_ spaceId: String, in entries: [RailEntry]) -> [RailEntry] {
        var result: [RailEntry] = []
        for entry in entries {
            switch entry {
            case .space(let id):
                if id == spaceId {
                    result.append(.folder(RailFolder(id: newFolderId(), name: nil, content: [spaceId])))
                } else {
                    result.append(entry)
                }
            case .folder(var folder):
                if folder.content.contains(spaceId) {
                    folder.content.removeAll { $0 == spaceId }
                    if !folder.content.isEmpty { result.append(.folder(folder)) }
                    result.append(.folder(RailFolder(id: newFolderId(), name: nil, content: [spaceId])))
                } else {
                    result.append(entry)
                }
            }
        }
        return result
    }

    /// Puts a server into an existing folder (by id), out of wherever it was.
    static func put(_ spaceId: String, intoFolder folderId: String, of entries: [RailEntry]) -> [RailEntry] {
        guard let index = entries.firstIndex(where: { if case .folder(let f) = $0 { return f.id == folderId } else { return false } }) else { return entries }
        return put(spaceId, into: index, of: entries)
    }

    /// Desktop's `sidebarItemWithout`.
    static func without(_ spaceId: String, in entries: [RailEntry]) -> [RailEntry] {
        entries.compactMap { removing(spaceId, from: $0) }
    }

    private static func removing(_ spaceId: String, from entry: RailEntry) -> RailEntry? {
        switch entry {
        case .space(let id):
            return id == spaceId ? nil : entry
        case .folder(var folder):
            guard folder.content.contains(spaceId) else { return entry }
            folder.content.removeAll { $0 == spaceId }
            return folder.content.isEmpty ? nil : .folder(folder)
        }
    }
}

// MARK: - Creating rooms and servers (features/create-room, create-space)

/// Desktop's `CreateRoomAccess`, in the order its selector shows them.
enum NewRoomAccess: String, CaseIterable, Identifiable {
    case restricted
    case `private`
    case `public`

    var id: String { rawValue }

    var title: String {
        switch self {
        case .restricted: return "Restricted"
        case .private: return "Private"
        case .public: return "Public"
        }
    }

    var detail: String {
        switch self {
        case .restricted: return "Only member of parent space can join."
        case .private: return "Only people with invite can join."
        case .public: return "Anyone with the address can join."
        }
    }
}

/// Which join rules a room version allows (utils/matrix.ts). An unknown version counts as new.
enum NewRoomVersionSupport {
    private static func number(_ version: String?) -> Int? {
        guard let version else { return nil }
        return Int(version)
    }

    private static func atLeast(_ version: String?, _ minimum: Int) -> Bool {
        guard let version else { return true }
        // Only the numbered versions 1 to 11 are old; anything else (12, custom ids) is new.
        guard let value = number(version) else { return true }
        return value >= minimum
    }

    static func restricted(_ version: String?) -> Bool { atLeast(version, 8) }
    static func knock(_ version: String?) -> Bool { atLeast(version, 7) }
    static func knockRestricted(_ version: String?) -> Bool { atLeast(version, 10) }

    /// The versions the server lists as available, newest number first (desktop's version picker).
    static func availableVersions(fromCapabilities json: [String: Any]) -> [String] {
        let capabilities = json["capabilities"] as? [String: Any]
        let versions = capabilities?["m.room_versions"] as? [String: Any]
        let available = (versions?["available"] as? [String: Any]).map { Array($0.keys) } ?? []
        return available.sorted { lhs, rhs in
            switch (Int(lhs), Int(rhs)) {
            case let (x?, y?): return x > y
            case (_?, nil): return true
            case (nil, _?): return false
            default: return lhs < rhs
            }
        }
    }

    /// `m.room_versions.default` from the client API's capabilities answer.
    static func defaultVersion(fromCapabilities json: [String: Any]) -> String? {
        let capabilities = json["capabilities"] as? [String: Any]
        let versions = capabilities?["m.room_versions"] as? [String: Any]
        return versions?["default"] as? String
    }
}

/// The createRoom request desktop sends (components/create-room/utils.ts `createRoom`).
struct NewRoomRequest {
    var name: String
    var topic: String = ""
    var isSpace = false
    var isVoice = false
    var parentId: String?
    /// Servers to reach the parent through, for its `m.space.parent` event.
    var parentVia: [String] = []
    var access: NewRoomAccess = .private
    var aliasLocalPart = ""
    var encryption = false
    var knock = false
    var allowFederation = true
    var roomVersion: String?

    static let voiceRoomType = "org.matrix.msc3417.call"
    static let spaceRoomType = "m.space"

    /// What is really sent: encryption and knocking only where desktop allows them.
    var effectiveAccess: NewRoomAccess {
        access == .restricted && (parentId == nil || !NewRoomVersionSupport.restricted(roomVersion)) ? .private : access
    }

    var effectiveKnock: Bool {
        switch effectiveAccess {
        case .private: return knock && NewRoomVersionSupport.knock(roomVersion)
        case .restricted: return knock && NewRoomVersionSupport.knockRestricted(roomVersion)
        case .public: return false
        }
    }

    var effectiveEncryption: Bool { !isSpace && effectiveAccess != .public && encryption }

    /// Desktop's `replaceSpaceWithDash`, only for public rooms.
    var effectiveAlias: String? {
        guard effectiveAccess == .public else { return nil }
        let trimmed = aliasLocalPart.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed.replacingOccurrences(of: " ", with: "-")
    }

    func body() -> [String: Any] {
        var state: [[String: Any]] = []
        if effectiveEncryption {
            state.append(["type": "m.room.encryption", "state_key": "", "content": ["algorithm": "m.megolm.v1.aes-sha2"]])
        }
        if let parentId {
            state.append(["type": "m.space.parent", "state_key": parentId, "content": ["canonical": true, "via": parentVia]])
        }
        if isVoice && !isSpace {
            state.append(["type": "org.matrix.msc3401.call", "state_key": "", "content": [String: Any]()])
        }
        state.append(["type": "m.room.join_rules", "state_key": "", "content": joinRuleContent()])

        var body: [String: Any] = ["name": name, "initial_state": state]
        if let roomVersion { body["room_version"] = roomVersion }
        if !topic.isEmpty { body["topic"] = topic }
        if let alias = effectiveAlias { body["room_alias_name"] = alias }
        var creation: [String: Any] = [:]
        if isSpace {
            creation["type"] = Self.spaceRoomType
        } else if isVoice {
            creation["type"] = Self.voiceRoomType
        }
        if !allowFederation { creation["m.federate"] = false }
        body["creation_content"] = creation
        if isSpace {
            body["power_level_content_override"] = ["events_default": 50]
        } else if isVoice {
            body["power_level_content_override"] = ["events": ["org.matrix.msc3401.call.member": 0]]
        }
        return body
    }

    func joinRuleContent() -> [String: Any] {
        switch effectiveAccess {
        case .public:
            return ["join_rule": "public"]
        case .restricted:
            return [
                "join_rule": effectiveKnock ? "knock_restricted" : "restricted",
                "allow": [["type": "m.room_membership", "room_id": parentId ?? ""]],
            ]
        case .private:
            return ["join_rule": effectiveKnock ? "knock" : "invite"]
        }
    }

    /// The `m.space.child` content desktop writes into the parent after creating.
    static func childContent(via: [String]) -> [String: Any] {
        ["auto_join": false, "suggested": false, "via": via]
    }
}

// MARK: - Server structure (m.space.child)

/// One `m.space.child` link of a server, read from the server's hierarchy.
struct SpaceChildLink: Equatable {
    let parentId: String
    let childId: String
    let suggested: Bool
    let via: [String]
}

enum SpaceChildLinks {
    /// Links by child id from the `rooms` of `/hierarchy` pages. Only children with `via` count,
    /// as the spec says; an emptied `m.space.child` is a removed child.
    static func parse(hierarchyRooms rooms: [[String: Any]]) -> [String: [SpaceChildLink]] {
        var result: [String: [SpaceChildLink]] = [:]
        for room in rooms {
            guard let parentId = room["room_id"] as? String else { continue }
            for event in room["children_state"] as? [[String: Any]] ?? [] {
                guard event["type"] as? String == "m.space.child",
                      let childId = event["state_key"] as? String,
                      let content = event["content"] as? [String: Any],
                      let via = content["via"] as? [String], !via.isEmpty else { continue }
                let link = SpaceChildLink(parentId: parentId, childId: childId, suggested: content["suggested"] as? Bool ?? false, via: via)
                result[childId, default: []].append(link)
            }
        }
        return result
    }

    /// Desktop's "Set Suggested" / "Unset Suggested": the same content with `suggested` flipped.
    static func toggledSuggested(_ content: [String: Any]) -> [String: Any] {
        var next = content
        next["suggested"] = !((content["suggested"] as? Bool) ?? false)
        return next
    }

    /// Desktop's "Add Existing": a child that is not auto-joined and not suggested.
    static func addedChildContent(via: [String]) -> [String: Any] {
        NewRoomRequest.childContent(via: via)
    }

    /// The server part of a user id or alias, for `via`.
    static func serverName(of id: String) -> String? {
        guard let colon = id.firstIndex(of: ":") else { return nil }
        let server = String(id[id.index(after: colon)...])
        return server.isEmpty ? nil : server
    }
}

// MARK: - Explore (public room directory)

/// Desktop's room type filter on the explore page.
enum PublicRoomTypeFilter: String, CaseIterable, Identifiable {
    case all
    case spaces
    case rooms

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "All"
        case .spaces: return "Spaces"
        case .rooms: return "Rooms"
        }
    }
}

struct PublicRoomEntry: Identifiable, Equatable {
    let roomId: String
    var name: String?
    var topic: String?
    var canonicalAlias: String?
    var avatarUrl: String?
    var memberCount: Int
    var roomType: String?
    var joinRule: String?

    var id: String { roomId }
    var isSpace: Bool { roomType == "m.space" }
    var displayName: String { name ?? canonicalAlias ?? roomId }
    /// What to join with: the alias where there is one, as desktop does.
    var joinTarget: String { canonicalAlias ?? roomId }
}

struct PublicRoomsPage: Equatable {
    var rooms: [PublicRoomEntry]
    var nextBatch: String?
    var prevBatch: String?
    var total: Int?
}

enum RoomDirectory {
    /// Desktop's page size.
    static let pageSize = 24

    /// The servers desktop's config.json lists under `featuredCommunities` (repo root config.json).
    static let featuredSpaces = [
        "#cinny:matrix.org",
        "#community:matrix.org",
        "#space:unredacted.org",
        "#librewolf-community:matrix.org",
        "#stickers-and-emojis:tastytea.de",
        "#videogames:waywardinn.com",
        "#science-space:matrix.org",
        "#libregaming-games:tchncs.de",
        "#mathematics-on:matrix.org",
    ]
    static let featuredRooms = [
        "#tuwunel:grin.hu",
        "#freesoftware:matrix.org",
        "#gentoo:matrix.org",
    ]
    static let featuredServers = ["matrixrooms.info", "matrix.org", "mozilla.org", "unredacted.org"]

    /// Desktop's explore list: the featured servers without your own (which is listed first).
    static func otherServers(own: String?) -> [String] {
        featuredServers.filter { $0 != own }
    }

    /// The path of the `/publicRooms` POST; your own server needs no `server` parameter.
    static func path(server: String?, own: String?) -> String {
        var path = "/_matrix/client/v3/publicRooms"
        if let server, !server.isEmpty, server != own,
           let encoded = server.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+"))) {
            path += "?server=\(encoded)"
        }
        return path
    }

    /// The request body desktop sends (pages/client/explore/Server.tsx).
    static func body(term: String, filter: PublicRoomTypeFilter, since: String?, limit: Int = pageSize) -> [String: Any] {
        var body: [String: Any] = ["limit": limit]
        if let since { body["since"] = since }
        var search: [String: Any] = [:]
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { search["generic_search_term"] = trimmed }
        switch filter {
        case .all: break
        case .spaces: search["room_types"] = ["m.space"]
        case .rooms: search["room_types"] = [NSNull()]
        }
        if !search.isEmpty { body["filter"] = search }
        return body
    }

    static func parse(_ json: [String: Any]) -> PublicRoomsPage {
        var rooms: [PublicRoomEntry] = []
        for chunk in json["chunk"] as? [[String: Any]] ?? [] {
            guard let roomId = chunk["room_id"] as? String else { continue }
            rooms.append(PublicRoomEntry(
                roomId: roomId,
                name: nonEmpty(chunk["name"] as? String),
                topic: nonEmpty(chunk["topic"] as? String),
                canonicalAlias: nonEmpty(chunk["canonical_alias"] as? String),
                avatarUrl: nonEmpty(chunk["avatar_url"] as? String),
                memberCount: integer(chunk["num_joined_members"]) ?? 0,
                roomType: chunk["room_type"] as? String,
                joinRule: chunk["join_rule"] as? String
            ))
        }
        return PublicRoomsPage(
            rooms: rooms,
            nextBatch: nonEmpty(json["next_batch"] as? String),
            prevBatch: nonEmpty(json["prev_batch"] as? String),
            total: integer(json["total_room_count_estimate"])
        )
    }

    /// A server name as typed: no scheme, no slashes, no spaces.
    static func cleanServerName(_ input: String) -> String? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for prefix in ["https://", "http://"] where text.hasPrefix(prefix) { text.removeFirst(prefix.count) }
        while text.hasSuffix("/") { text.removeLast() }
        guard !text.isEmpty, !text.contains("/"), !text.contains(" ") else { return nil }
        return text
    }

    private static func integer(_ value: Any?) -> Int? {
        if let number = value as? Int { return number }
        if let number = value as? NSNumber { return number.intValue }
        return nil
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return value
    }
}

// MARK: - Via servers and the server tree

enum ViaServers {
    /// Desktop's `getViaServers` without the creator: the servers most of the members are on, at
    /// most three. `fallback` (the room's own server, yours) fills in when the member list is unknown.
    static func pick(memberIds: [String], fallback: [String]) -> [String] {
        var population: [String: Int] = [:]
        var firstSeen: [String: Int] = [:]
        for (index, member) in memberIds.enumerated() {
            guard let server = SpaceChildLinks.serverName(of: member) else { continue }
            population[server, default: 0] += 1
            if firstSeen[server] == nil { firstSeen[server] = index }
        }
        let sorted = population.keys.sorted { lhs, rhs in
            let a = population[lhs] ?? 0
            let b = population[rhs] ?? 0
            if a != b { return a > b }
            return (firstSeen[lhs] ?? 0) < (firstSeen[rhs] ?? 0)
        }
        var result = Array(sorted.prefix(3))
        for server in fallback where result.count < 3 && !result.contains(server) { result.append(server) }
        return result
    }
}

/// One row of a server's tree as the manage screen lists it.
struct HierarchyRow: Identifiable, Equatable {
    let roomId: String
    let parentId: String
    let depth: Int
    var name: String
    var isSpace: Bool
    var isVoice: Bool
    var suggested: Bool
    var via: [String]
    var memberCount: Int
    /// The `m.space.child` content as stored, so toggling `suggested` keeps `order` and the rest.
    var childContent: [String: Any]

    var id: String { parentId + "|" + roomId }

    static func == (lhs: HierarchyRow, rhs: HierarchyRow) -> Bool {
        lhs.id == rhs.id && lhs.depth == rhs.depth && lhs.name == rhs.name && lhs.isSpace == rhs.isSpace
            && lhs.isVoice == rhs.isVoice && lhs.suggested == rhs.suggested && lhs.via == rhs.via
            && lhs.memberCount == rhs.memberCount
    }
}

enum ServerHierarchy {
    static let voiceRoomType = "org.matrix.msc3417.call"

    /// The rows below `rootId` in the order the spec gives children: `order` strings first, then
    /// the age of the link, then the room id. Rooms not listed by the server are skipped; a room that
    /// is a child of two servers of the tree shows under both. Loops stop at the first repeat.
    static func flatten(hierarchyRooms rooms: [[String: Any]], rootId: String) -> [HierarchyRow] {
        var byId: [String: [String: Any]] = [:]
        for room in rooms {
            if let id = room["room_id"] as? String { byId[id] = room }
        }
        var rows: [HierarchyRow] = []
        func visit(_ spaceId: String, depth: Int, path: Set<String>) {
            guard let space = byId[spaceId] else { return }
            let events = (space["children_state"] as? [[String: Any]] ?? []).filter { event in
                guard event["type"] as? String == "m.space.child",
                      let content = event["content"] as? [String: Any],
                      let via = content["via"] as? [String], !via.isEmpty else { return false }
                return true
            }
            for event in events.sorted(by: childBefore) {
                guard let childId = event["state_key"] as? String,
                      let child = byId[childId],
                      let content = event["content"] as? [String: Any],
                      !path.contains(childId) else { continue }
                let type = child["room_type"] as? String
                let isSpace = type == "m.space"
                rows.append(HierarchyRow(
                    roomId: childId,
                    parentId: spaceId,
                    depth: depth,
                    name: (child["name"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                        ?? (child["canonical_alias"] as? String) ?? childId,
                    isSpace: isSpace,
                    isVoice: type == voiceRoomType,
                    suggested: content["suggested"] as? Bool ?? false,
                    via: content["via"] as? [String] ?? [],
                    memberCount: (child["num_joined_members"] as? NSNumber)?.intValue ?? 0,
                    childContent: content
                ))
                if isSpace { visit(childId, depth: depth + 1, path: path.union([childId])) }
            }
        }
        visit(rootId, depth: 0, path: [rootId])
        return rows
    }

    private static func childBefore(_ a: [String: Any], _ b: [String: Any]) -> Bool {
        func order(_ event: [String: Any]) -> String? {
            guard let content = event["content"] as? [String: Any], let order = content["order"] as? String,
                  !order.isEmpty, order.count <= 50,
                  order.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value <= 0x7E }) else { return nil }
            return order
        }
        func timestamp(_ event: [String: Any]) -> Int {
            (event["origin_server_ts"] as? NSNumber)?.intValue ?? 0
        }
        let oa = order(a), ob = order(b)
        switch (oa, ob) {
        case let (x?, y?) where x != y: return x < y
        case (_?, nil): return true
        case (nil, _?): return false
        default: break
        }
        if timestamp(a) != timestamp(b) { return timestamp(a) < timestamp(b) }
        return (a["state_key"] as? String ?? "") < (b["state_key"] as? String ?? "")
    }

    /// Rooms of a list that are not yet below the server, for "Add Existing".
    static func addable(_ candidates: [String], alreadyInside: Set<String>, serverId: String) -> [String] {
        candidates.filter { $0 != serverId && !alreadyInside.contains($0) }
    }
}
