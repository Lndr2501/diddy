// Checks for Diddy/Matrix/RoomListLogic.swift: rail layout (in.cinny.spaces), createRoom body,
// space child links, public room directory. Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/RoomListLogic.swift Tools/roomlist_check/main.swift -o /tmp/roomlist_check && /tmp/roomlist_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

// MARK: Notification levels: desktop's four choices and wording.
check(RoomNotifyLevel.allCases.map(\.title) == ["Default", "All Messages", "Mention & Keywords", "Mute"], "notification level titles as desktop")

// MARK: Rail layout parsing (desktop parseSidebar)
let joined: Set<String> = ["!a:x", "!b:x", "!c:x", "!d:x", "!sub:x"]
let isJoined: (String) -> Bool = { joined.contains($0) }
let stored: [String: Any] = [
    "sidebar": [
        "!b:x",
        ["id": "FOLDERONE", "name": "Games", "content": ["!c:x", "!gone:x", "!c:x"]] as [String: Any],
        "!gone:x",
        "!b:x",
        "!sub:x",
        ["id": "FOLDERONE", "content": ["!a:x"]] as [String: Any],
        42,
    ] as [Any],
    "other": "kept",
]
let parsed = ServerRailLayout.parse(stored, orphanSpaces: ["!a:x", "!b:x", "!c:x", "!d:x"], isJoinedSpace: isJoined)
check(parsed == [
    .space("!b:x"),
    .folder(RailFolder(id: "FOLDERONE", name: "Games", content: ["!c:x"])),
    .space("!sub:x"),
    .space("!a:x"),
    .space("!d:x"),
], "parse keeps order, drops unknown and duplicates, appends orphans: \(parsed)")

let legacy: [String: Any] = ["shortcut": ["!d:x", "!a:x"]]
check(ServerRailLayout.parse(legacy, orphanSpaces: ["!a:x", "!d:x"], isJoinedSpace: isJoined) == [.space("!d:x"), .space("!a:x")], "old shortcut list is read")
check(ServerRailLayout.parse(nil, orphanSpaces: ["!a:x", "!b:x"], isJoinedSpace: isJoined) == [.space("!a:x"), .space("!b:x")], "no account data: orphan order")

// Writing keeps the other keys and the folder format.
let merged = ServerRailLayout.content(parsed, mergedInto: stored)
check(merged["other"] as? String == "kept", "other keys kept")
let sidebar = merged["sidebar"] as? [Any] ?? []
check(sidebar.count == 5, "five entries written")
check(sidebar.first as? String == "!b:x", "space written as plain id")
if let folder = sidebar.dropFirst().first as? [String: Any] {
    check(folder["id"] as? String == "FOLDERONE", "folder id written")
    check(folder["name"] as? String == "Games", "folder name written")
    check(folder["content"] as? [String] == ["!c:x"], "folder content written")
} else {
    check(false, "folder written as object")
}
// Round trip through JSON like the server stores it.
if let data = try? JSONSerialization.data(withJSONObject: merged),
   let back = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
    check(ServerRailLayout.parse(back, orphanSpaces: [], isJoinedSpace: isJoined) == parsed, "JSON round trip")
} else {
    check(false, "content is valid JSON")
}

// Folder ids look like desktop's randomStr.
let folderId = ServerRailLayout.newFolderId()
check(folderId.count == 12 && folderId.allSatisfy { $0 >= "A" && $0 <= "Z" }, "folder id is 12 capitals")

// MARK: Rail editing
let base: [RailEntry] = [.space("!a:x"), .space("!b:x"), .space("!c:x")]
check(ServerRailLayout.moved([1, 2, 3, 4], from: IndexSet(integer: 0), to: 3) == [2, 3, 1, 4], "move down like onMove")
check(ServerRailLayout.moved([1, 2, 3, 4], from: IndexSet(integer: 3), to: 0) == [4, 1, 2, 3], "move up like onMove")
check(ServerRailLayout.moved([1, 2, 3, 4], from: IndexSet([0, 2]), to: 4) == [2, 4, 1, 3], "move several")

let made = ServerRailLayout.put("!c:x", into: 0, of: base)
if made.count == 2, case .folder(let folder) = made[0] {
    check(folder.content == ["!a:x", "!c:x"], "new folder holds target then moved server")
    check(made[1] == .space("!b:x"), "rest unchanged")
    let joinedFolder = ServerRailLayout.put("!b:x", into: 0, of: made)
    if joinedFolder.count == 1, case .folder(let bigger) = joinedFolder[0] {
        check(bigger.content == ["!a:x", "!c:x", "!b:x"], "server joins existing folder at the end")
        check(bigger.id == folder.id, "folder keeps its id")
        let out = ServerRailLayout.takeOut("!c:x", of: joinedFolder)
        if out.count == 2, case .folder(let left) = out[0] {
            check(left.content == ["!a:x", "!b:x"], "taken out of folder")
            check(out[1] == .space("!c:x"), "placed after the folder")
        } else {
            check(false, "take out keeps folder and adds server: \(out)")
        }
        let reordered = ServerRailLayout.moveInFolder(bigger.id, from: IndexSet(integer: 2), to: 0, of: joinedFolder)
        if case .folder(let r) = reordered[0] { check(r.content == ["!b:x", "!a:x", "!c:x"], "reorder inside folder") }
    } else {
        check(false, "joining folder: \(joinedFolder)")
    }
} else {
    check(false, "make folder: \(made)")
}
check(ServerRailLayout.put("!a:x", into: 0, of: base) == base, "dropping a server on itself changes nothing")
let single: [RailEntry] = [.folder(RailFolder(id: "F", name: nil, content: ["!a:x"])), .space("!b:x")]
check(ServerRailLayout.takeOut("!a:x", of: single) == [.space("!a:x"), .space("!b:x")], "empty folder disappears")
check(ServerRailLayout.without("!a:x", in: single) == [.space("!b:x")], "sidebarItemWithout drops empty folder")

// MARK: createRoom body (desktop components/create-room/utils.ts)
var channel = NewRoomRequest(name: "general")
channel.parentId = "!space:x"
channel.parentVia = ["x"]
channel.access = .restricted
channel.encryption = true
channel.topic = "hi"
channel.roomVersion = "10"
let body = channel.body()
check(body["name"] as? String == "general", "name")
check(body["topic"] as? String == "hi", "topic")
check(body["room_version"] as? String == "10", "room version")
check(body["room_alias_name"] == nil, "no alias for restricted")
let state = body["initial_state"] as? [[String: Any]] ?? []
check(state.map { $0["type"] as? String ?? "" } == ["m.room.encryption", "m.space.parent", "m.room.join_rules"], "state order as desktop")
let rules = state.last?["content"] as? [String: Any] ?? [:]
check(rules["join_rule"] as? String == "restricted", "restricted join rule")
let allow = rules["allow"] as? [[String: Any]] ?? []
check(allow.first?["room_id"] as? String == "!space:x" && allow.first?["type"] as? String == "m.room_membership", "allow parent members")
check((body["creation_content"] as? [String: Any])?.isEmpty == true, "plain room has empty creation content")
check(body["power_level_content_override"] == nil, "no override for text room")

var knockRestricted = channel
knockRestricted.knock = true
check(knockRestricted.joinRuleContent()["join_rule"] as? String == "knock_restricted", "knock_restricted on v10")
knockRestricted.roomVersion = "9"
check(knockRestricted.joinRuleContent()["join_rule"] as? String == "restricted", "no knock_restricted before v10")
knockRestricted.roomVersion = "7"
check(knockRestricted.effectiveAccess == .private, "restricted needs v8")

var voice = NewRoomRequest(name: "Lounge")
voice.isVoice = true
voice.allowFederation = false
let voiceBody = voice.body()
let creation = voiceBody["creation_content"] as? [String: Any] ?? [:]
check(creation["type"] as? String == "org.matrix.msc3417.call", "voice room type")
check(creation["m.federate"] as? Bool == false, "federation off")
check(((voiceBody["power_level_content_override"] as? [String: Any])?["events"] as? [String: Int])?["org.matrix.msc3401.call.member"] == 0, "members may join calls")
check((voiceBody["initial_state"] as? [[String: Any]] ?? []).contains { $0["type"] as? String == "org.matrix.msc3401.call" }, "call state")
check(((voiceBody["initial_state"] as? [[String: Any]])?.last?["content"] as? [String: Any])?["join_rule"] as? String == "invite", "private is invite only")

var publicSpace = NewRoomRequest(name: "My Server")
publicSpace.isSpace = true
publicSpace.access = .public
publicSpace.encryption = true
publicSpace.aliasLocalPart = "my server"
publicSpace.knock = true
let spaceBody = publicSpace.body()
check((spaceBody["creation_content"] as? [String: Any])?["type"] as? String == "m.space", "space type")
check((spaceBody["power_level_content_override"] as? [String: Any])?["events_default"] as? Int == 50, "space events_default 50")
check(spaceBody["room_alias_name"] as? String == "my-server", "alias spaces become dashes")
check(!(spaceBody["initial_state"] as? [[String: Any]] ?? []).contains { $0["type"] as? String == "m.room.encryption" }, "public never encrypted")
check(publicSpace.joinRuleContent()["join_rule"] as? String == "public", "public join rule")

var privateKnock = NewRoomRequest(name: "p")
privateKnock.knock = true
check(privateKnock.joinRuleContent()["join_rule"] as? String == "knock", "private with knock")
privateKnock.roomVersion = "6"
check(privateKnock.joinRuleContent()["join_rule"] as? String == "invite", "no knock before v7")
check(NewRoomVersionSupport.defaultVersion(fromCapabilities: ["capabilities": ["m.room_versions": ["default": "10"]]]) == "10", "capabilities default version")

let child = NewRoomRequest.childContent(via: ["x"])
check(child["auto_join"] as? Bool == false && child["suggested"] as? Bool == false && child["via"] as? [String] == ["x"], "space child content as desktop")
if (try? JSONSerialization.data(withJSONObject: spaceBody)) == nil { check(false, "space body is JSON") }
if (try? JSONSerialization.data(withJSONObject: body)) == nil { check(false, "channel body is JSON") }
if (try? JSONSerialization.data(withJSONObject: voiceBody)) == nil { check(false, "voice body is JSON") }

// MARK: Space child links
let hierarchy: [[String: Any]] = [
    ["room_id": "!space:x", "children_state": [
        ["type": "m.space.child", "state_key": "!one:x", "content": ["via": ["x"], "suggested": true] as [String: Any]],
        ["type": "m.space.child", "state_key": "!two:x", "content": ["via": ["x"]]],
        ["type": "m.space.child", "state_key": "!removed:x", "content": [String: Any]()],
        ["type": "m.room.name", "state_key": "", "content": ["name": "x"]],
    ] as [[String: Any]]],
    ["room_id": "!sub:x", "children_state": [
        ["type": "m.space.child", "state_key": "!two:x", "content": ["via": ["y"]]],
    ] as [[String: Any]]],
]
let links = SpaceChildLinks.parse(hierarchyRooms: hierarchy)
check(links["!one:x"] == [SpaceChildLink(parentId: "!space:x", childId: "!one:x", suggested: true, via: ["x"])], "suggested child")
check(links["!two:x"]?.map(\.parentId) == ["!space:x", "!sub:x"], "child in two parents")
check(links["!removed:x"] == nil, "child without via is removed")
check(SpaceChildLinks.toggledSuggested(["via": ["x"], "order": "a"])["suggested"] as? Bool == true, "set suggested")
let unset = SpaceChildLinks.toggledSuggested(["via": ["x"], "suggested": true, "order": "a"])
check(unset["suggested"] as? Bool == false && unset["order"] as? String == "a", "unset keeps the rest")
check(SpaceChildLinks.serverName(of: "@me:example.org") == "example.org", "server of user id")
check(SpaceChildLinks.serverName(of: "nothing") == nil, "no server")

// MARK: Public room directory
check(RoomDirectory.path(server: "example.org", own: "example.org") == "/_matrix/client/v3/publicRooms", "own server without parameter")
check(RoomDirectory.path(server: "matrix.org", own: "example.org") == "/_matrix/client/v3/publicRooms?server=matrix.org", "other server")
let all = RoomDirectory.body(term: "  ", filter: .all, since: nil)
check(all["limit"] as? Int == 24 && all["filter"] == nil && all["since"] == nil, "plain first page")
let rooms = RoomDirectory.body(term: "linux", filter: .rooms, since: "abc")
let roomFilter = rooms["filter"] as? [String: Any] ?? [:]
check(roomFilter["generic_search_term"] as? String == "linux", "search term")
check((roomFilter["room_types"] as? [Any])?.first is NSNull, "rooms filter is [null]")
check(rooms["since"] as? String == "abc", "since token")
if let data = try? JSONSerialization.data(withJSONObject: rooms), let text = String(data: data, encoding: .utf8) {
    check(text.contains("\"room_types\":[null]"), "null encoded as JSON null: \(text)")
} else {
    check(false, "rooms body is JSON")
}
check(((RoomDirectory.body(term: "", filter: .spaces, since: nil)["filter"] as? [String: Any])?["room_types"] as? [String]) == ["m.space"], "spaces filter")

let pageJSON = """
{"chunk":[{"room_id":"!r:x","name":"Linux","topic":"Talk","canonical_alias":"#linux:x","num_joined_members":1200,"room_type":"m.space","join_rule":"public","avatar_url":""},
{"room_id":"!s:x","num_joined_members":3}],"next_batch":"n1","total_room_count_estimate":2}
"""
if let json = (try? JSONSerialization.jsonObject(with: Data(pageJSON.utf8))) as? [String: Any] {
    let page = RoomDirectory.parse(json)
    check(page.rooms.count == 2, "two rooms")
    check(page.rooms.first?.memberCount == 1200 && page.rooms.first?.isSpace == true, "members and space type")
    check(page.rooms.first?.avatarUrl == nil, "empty avatar ignored")
    check(page.rooms.first?.joinTarget == "#linux:x", "join by alias")
    check(page.rooms.last?.displayName == "!s:x" && page.rooms.last?.joinTarget == "!s:x", "fallback to id")
    check(page.nextBatch == "n1" && page.prevBatch == nil && page.total == 2, "paging tokens")
} else {
    check(false, "page JSON parses")
}
check(RoomDirectory.cleanServerName(" https://Matrix.org/ ") == "matrix.org", "server name cleaned")
check(RoomDirectory.cleanServerName("a b") == nil, "space rejected")
check(RoomDirectory.otherServers(own: "matrix.org") == ["matrixrooms.info", "mozilla.org", "unredacted.org"], "own server not listed twice")

// The featured lists match desktop's config.json, when the repo has it.
if let data = FileManager.default.contents(atPath: "../config.json"),
   let config = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
   let featured = config["featuredCommunities"] as? [String: Any] {
    check(featured["spaces"] as? [String] == RoomDirectory.featuredSpaces, "featured spaces match config.json")
    check(featured["rooms"] as? [String] == RoomDirectory.featuredRooms, "featured rooms match config.json")
    check(featured["servers"] as? [String] == RoomDirectory.featuredServers, "featured servers match config.json")
} else {
    print("config.json not found, featured lists not compared")
}


// MARK: Via servers (desktop getViaServers)
check(ViaServers.pick(memberIds: ["@a:one.org", "@b:two.org", "@c:two.org", "@d:three.org", "@e:four.org"], fallback: ["own.org"]) == ["two.org", "one.org", "three.org"], "via: most populous first, at most three")
check(ViaServers.pick(memberIds: [], fallback: ["a.org", "b.org"]) == ["a.org", "b.org"], "via: fallback without members")
check(ViaServers.pick(memberIds: ["@a:one.org"], fallback: ["one.org", "own.org"]) == ["one.org", "own.org"], "via: no duplicates from the fallback")

// MARK: Server tree
let treeRooms: [[String: Any]] = [
    ["room_id": "!root:x", "name": "Root", "room_type": "m.space", "children_state": [
        ["type": "m.space.child", "state_key": "!late:x", "origin_server_ts": 20, "content": ["via": ["x"]]],
        ["type": "m.space.child", "state_key": "!sub:x", "origin_server_ts": 30, "content": ["via": ["x"], "order": "a"]],
        ["type": "m.space.child", "state_key": "!early:x", "origin_server_ts": 10, "content": ["via": ["x"], "suggested": true]],
        ["type": "m.space.child", "state_key": "!gone:x", "origin_server_ts": 5, "content": [String: Any]()],
    ]],
    ["room_id": "!sub:x", "name": "Sub", "room_type": "m.space", "children_state": [
        ["type": "m.space.child", "state_key": "!inner:x", "content": ["via": ["x"]]],
        ["type": "m.space.child", "state_key": "!root:x", "content": ["via": ["x"]]],
    ]],
    ["room_id": "!early:x", "name": "early", "num_joined_members": 4],
    ["room_id": "!late:x", "name": "", "canonical_alias": "#late:x", "room_type": "org.matrix.msc3417.call"],
    ["room_id": "!inner:x", "name": "inner"],
    ["room_id": "!gone:x", "name": "gone"],
]
let rows = ServerHierarchy.flatten(hierarchyRooms: treeRooms, rootId: "!root:x")
check(rows.map(\.roomId) == ["!sub:x", "!inner:x", "!early:x", "!late:x"], "tree order: order string first, then age; nested; loop and removed child skipped; got \(rows.map(\.roomId))")
check(rows.map(\.depth) == [0, 1, 0, 0], "tree depth")
check(rows[2].suggested && rows[2].memberCount == 4, "suggested flag and member count")
check(rows[3].name == "#late:x" && rows[3].isVoice, "empty name falls back to the alias; voice type")
check(rows[1].parentId == "!sub:x", "parent of nested row")
check(ServerHierarchy.addable(["!a", "!b", "!root"], alreadyInside: ["!a"], serverId: "!root") == ["!b"], "addable rooms")

check(NewRoomVersionSupport.availableVersions(fromCapabilities: ["capabilities": ["m.room_versions": ["default": "10", "available": ["1": "stable", "10": "stable", "9": "stable", "org.example": "unstable"]]]]) == ["10", "9", "1", "org.example"], "available versions sorted")

// MARK: Rail editing helpers
let railBase: [RailEntry] = [.space("!a"), .folder(RailFolder(id: "F1", name: "Games", content: ["!b", "!c"])), .space("!d")]
check(ServerRailLayout.json(ServerRailLayout.renamed("F1", to: " Fun ", in: railBase)).count == 3, "rename keeps the entries")
if case .folder(let renamedFolder) = ServerRailLayout.renamed("F1", to: " Fun ", in: railBase)[1] { check(renamedFolder.name == "Fun", "rename trims") } else { check(false, "rename keeps the folder") }
if case .folder(let unnamedFolder) = ServerRailLayout.renamed("F1", to: "  ", in: railBase)[1] { check(unnamedFolder.name == nil, "empty name removes the name") } else { check(false, "rename keeps the folder") }
check(ServerRailLayout.dissolved("F1", in: railBase) == [.space("!a"), .space("!b"), .space("!c"), .space("!d")], "dissolve puts the servers in place")
let foldered = ServerRailLayout.foldered("!a", in: railBase)
check(foldered.count == 3, "foldered keeps the count")
if case .folder(let newFolder) = foldered[0] { check(newFolder.content == ["!a"] && newFolder.id.count == 12, "foldered makes a folder at the same place") } else { check(false, "foldered first entry is a folder") }
let intoFolder = ServerRailLayout.put("!d", intoFolder: "F1", of: railBase)
check(intoFolder.count == 2, "put into folder removes the server from the rail")
if case .folder(let grown) = intoFolder[1] { check(grown.content == ["!b", "!c", "!d"], "put into folder appends") } else { check(false, "folder stays") }
check(ServerRailLayout.put("!zzz", intoFolder: "nope", of: railBase) == railBase, "unknown folder changes nothing")

let folderedFromFolder = ServerRailLayout.foldered("!b", in: railBase)
check(folderedFromFolder.count == 4, "foldered out of a folder keeps the server: \(folderedFromFolder.count)")
check(folderedFromFolder.flatMap(\.spaceIds) == ["!a", "!c", "!b", "!d"], "foldered out of a folder order")

// MARK: Chat list

check(ChatListLogic.preview("hi", isOwn: true, isDirect: false, senderName: "Luis") == "You: hi", "own message says You")
check(ChatListLogic.preview("hi", isOwn: false, isDirect: true, senderName: "Mia") == "hi", "a DM shows the bare text")
check(ChatListLogic.preview("hi", isOwn: false, isDirect: false, senderName: "Mia") == "Mia: hi", "a group names the sender")
check(ChatListLogic.preview("hi", isOwn: false, isDirect: false, senderName: "") == "hi", "no name, no prefix")

var listCalendar = Calendar(identifier: .gregorian)
listCalendar.timeZone = TimeZone(identifier: "UTC")!
let listNow = Date(timeIntervalSince1970: 1_794_484_800) // Thu 2026-11-12 12:00 UTC
func listLabel(_ hoursAgo: Double) -> String {
    ChatListLogic.timeLabel(listNow.addingTimeInterval(-hoursAgo * 3600), now: listNow, calendar: listCalendar,
                            clock: { _ in "clock" }, weekday: { _ in "weekday" }, short: { _ in "date" })
}
check(listLabel(11) == "clock", "earlier today shows the time")
check(listLabel(13) == "Yesterday", "last night is Yesterday")
check(listLabel(24 * 3) == "weekday", "three days ago shows the weekday")
check(listLabel(24 * 6) == "weekday", "six days ago still shows the weekday")
check(listLabel(24 * 8) == "date", "more than a week ago shows the date")
check(listLabel(-2) == "clock", "a clock running behind still shows the time")

let dated: [(String, Date?)] = [("a", nil), ("b", listNow), ("c", listNow.addingTimeInterval(60)), ("d", nil), ("e", listNow)]
check(ChatListLogic.sortedByActivity(dated, date: { $0.1 }).map(\.0) == ["c", "b", "e", "a", "d"], "newest first, ties and unknown keep their order")

if failures == 0 {
    print("roomlist_check: all checks passed")
} else {
    print("roomlist_check: \(failures) failure(s)")
    exit(1)
}
