// Checks for Diddy/Matrix/DiddyOptionsRoomLogic.swift: the request that creates the Diddy Options
// room, the power levels, the topic tag and the room a server's members join, like desktop's
// optionsRoom.ts / badgePower.ts / discover.ts. Foundation only. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/DiddyEvents.swift Diddy/Matrix/DiddyOptionsRoomLogic.swift Tools/optionsroom_check/main.swift -o /tmp/optionsroom_check && /tmp/optionsroom_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
func text(_ value: Any?) -> String {
    let wrapped: [String: Any] = ["v": value ?? NSNull()]
    guard let data = try? JSONSerialization.data(withJSONObject: wrapped, options: [.sortedKeys, .withoutEscapingSlashes]) else { return "?" }
    return String(decoding: data, as: UTF8.self)
}
func object(_ json: String) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]
}
typealias L = DiddyOptionsRoomLogic

// The creating request
let plain = L.createRoomBody(name: "  ", spaceId: nil, serverName: "matrix.tllx.eu")
check(plain["name"] as? String == "Diddy Options", "empty name falls back to the default")
check(plain["topic"] as? String == "Used by Diddy clients to share profiles and badges. Please do not rename or delete. [diddy-options]", "topic with tag")
check(plain["visibility"] as? String == "private" && plain["preset"] as? String == "private_chat", "private room")
let plainState = plain["initial_state"] as? [[String: Any]] ?? []
check(plainState.count == 1 && plainState[0]["type"] as? String == "app.diddy.options" && plainState[0]["state_key"] as? String == "", "marker only")
check(text(plainState.first?["content"]) == #"{"v":{"v":1}}"#, "marker content is {v:1}")
let levels = plain["power_level_content_override"] as? [String: Any] ?? [:]
check(text(levels) == #"{"v":{"events":{"app.diddy.badge":100,"app.diddy.badge_award":100,"app.diddy.options":100,"app.diddy.profile":0,"m.room.name":100}}}"#, "creator power levels: \(text(levels))")
check((levels["users"]) == nil, "the creator is not listed in users (room version 12)")

let named = L.createRoomBody(name: " Hidden ", spaceId: "!space:matrix.tllx.eu", serverName: "matrix.tllx.eu")
check(named["name"] as? String == "Hidden", "name trimmed")
let state = named["initial_state"] as? [[String: Any]] ?? []
check(state.count == 3, "marker, space parent and join rule")
check(state[1]["type"] as? String == "m.space.parent" && state[1]["state_key"] as? String == "!space:matrix.tllx.eu", "space parent")
check(text(state[1]["content"]) == #"{"v":{"canonical":true,"via":["matrix.tllx.eu"]}}"#, "parent content")
check(state[2]["type"] as? String == "m.room.join_rules", "join rules")
check(text(state[2]["content"]) == #"{"v":{"allow":[{"room_id":"!space:matrix.tllx.eu","type":"m.room_membership"}],"join_rule":"restricted"}}"#, "restricted join")
check(text(L.spaceChildContent(serverName: "matrix.tllx.eu")) == #"{"v":{"suggested":false,"via":["matrix.tllx.eu"]}}"#, "space child")
check(JSONSerialization.isValidJSONObject(named), "the body is valid JSON")

// Adopting a room keeps what is there
let existing = object(#"{"users":{"@a:x":100},"events":{"m.room.name":50,"app.diddy.badge":0},"state_default":50,"users_default":0,"ban":50}"#)
let adopted = L.adoptedPowerLevels(existing)
check(text(adopted["events"]) == #"{"v":{"app.diddy.badge":100,"app.diddy.badge_award":100,"app.diddy.profile":0,"m.room.name":50}}"#, "adopted events: \(text(adopted["events"]))")
check(text(adopted["users"]) == text(existing["users"]) && adopted["ban"] as? Int == 50 && adopted["state_default"] as? Int == 50, "rest stays")
check(text(L.adoptedPowerLevels([:])["events"]) == #"{"v":{"app.diddy.badge":100,"app.diddy.badge_award":100,"app.diddy.profile":0}}"#, "adopt an empty content")

// Who may write badge state
check(L.stateLevel(for: "app.diddy.badge", in: [:]) == 50, "default state level is 50")
check(L.stateLevel(for: "app.diddy.badge", in: ["state_default": 70]) == 70, "state_default")
check(L.stateLevel(for: "app.diddy.badge", in: ["state_default": 70, "events": ["app.diddy.badge": 0]]) == 0, "event level wins")
check(L.badgeStateOpenToMembers(object(#"{"events":{"app.diddy.badge":0}}"#)), "open to members")
check(!L.badgeStateOpenToMembers(object(#"{"events":{"app.diddy.badge":100,"app.diddy.badge_award":100}}"#)), "admin only")
check(!L.badgeStateOpenToMembers([:]), "state_default 50 is not open")
check(L.badgeStateOpenToMembers(object(#"{"users_default":60}"#)), "members with a high default level")
check(L.hardenedPowerLevels(object(#"{"events":{"app.diddy.badge":100,"app.diddy.badge_award":100}}"#)) == nil, "already admin only")
let hardened = L.hardenedPowerLevels(object(#"{"events":{"app.diddy.badge":0,"app.diddy.profile":0},"ban":50}"#))
check(text(hardened?["events"]) == #"{"v":{"app.diddy.badge":100,"app.diddy.badge_award":100,"app.diddy.profile":0}}"#, "hardened events: \(text(hardened?["events"]))")
check(hardened?["ban"] as? Int == 50, "hardening keeps the rest")
check(L.hardenedPowerLevels(["state_default": 100]) == nil, "state_default 100 is enough")
check(L.hardenedPowerLevels(object(#"{"events":{"app.diddy.badge":150}, "state_default": 10}"#)) != nil, "award level 10 is raised")
let raised = L.hardenedPowerLevels(object(#"{"events":{"app.diddy.badge":150}}"#))
check((raised?["events"] as? [String: Any])?["app.diddy.badge"] as? Int == 150, "a higher level is not lowered")

// Topic tag
check(L.taggedTopic("Games") == "Games [diddy-options]", "tag appended")
check(L.taggedTopic("") == "[diddy-options]", "tag on an empty topic")
check(L.taggedTopic("Games [diddy-options]") == nil, "tagged already")

// Finding the room of a server
check(L.looksLikeDiddyRoom(name: "Diddy Options", topic: nil), "by name")
check(L.looksLikeDiddyRoom(name: " Diddy Options ", topic: nil), "name is trimmed")
check(L.looksLikeDiddyRoom(name: "x", topic: "Hi [diddy-options]"), "by topic")
check(!L.looksLikeDiddyRoom(name: "diddy options", topic: "nothing"), "name is exact")
let rooms = [
    L.HierarchyRoom(roomId: "!space:x", name: "Diddy Options", topic: nil),
    L.HierarchyRoom(roomId: "!general:x", name: "General", topic: nil),
    L.HierarchyRoom(roomId: "!joined:x", name: "Diddy Options", topic: nil),
    L.HierarchyRoom(roomId: "!left:x", name: "Other", topic: "[diddy-options]"),
    L.HierarchyRoom(roomId: "!new:y", name: "Diddy Options", topic: nil),
]
let pick = L.joinCandidate(in: rooms, spaceId: "!space:x", membership: { $0 == "!joined:x" ? "join" : nil }, leftOnPurpose: { $0 == "!left:x" })
check(pick?.roomId == "!new:y", "skips the space, the joined and the left room: \(pick?.roomId ?? "-")")
check(L.joinCandidate(in: rooms, spaceId: "!space:x", membership: { _ in "ban" }, leftOnPurpose: { _ in false }) == nil, "banned rooms are skipped")
check(L.joinCandidate(in: [], spaceId: "!space:x", membership: { _ in nil }, leftOnPurpose: { _ in false }) == nil, "nothing to join")
check(L.joinCandidate(in: rooms, spaceId: "!space:x", membership: { _ in "leave" }, leftOnPurpose: { _ in false })?.roomId == "!joined:x", "a room you left earlier can be joined again")
check(L.viaServers(roomId: "!a:matrix.org", childVia: ["b.org"]) == ["b.org"], "via of the child entry")
check(L.viaServers(roomId: "!a:matrix.org", childVia: []) == ["matrix.org"], "server of the room id")
check(L.viaServers(roomId: "!a:host:8448", childVia: nil) == ["host:8448"], "server with a port")
check(L.viaServers(roomId: "!nohost", childVia: nil).isEmpty, "no server known")

if failures == 0 { print("optionsroom_check: all checks passed") } else { print("optionsroom_check: \(failures) failure(s)"); exit(1) }
