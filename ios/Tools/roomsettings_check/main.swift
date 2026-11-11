// Checks for Diddy/Matrix/RoomSettingsLogic.swift: the room/space settings rules taken from
// desktop (usePowerLevels.ts, usePowerLevelTags.ts, useRoomAliases.ts, useMemberFilter.ts, ...).
// Foundation only, runs on macOS and Linux. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/RoomSettingsLogic.swift Tools/roomsettings_check/main.swift -o /tmp/roomsettings_check && /tmp/roomsettings_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

/// Parses JSON like the app does, so numbers arrive as NSNumber.
func json(_ text: String) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]) ?? [:]
}
func jsonArray(_ text: String) -> [[String: Any]] {
    (try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [[String: Any]]) ?? []
}
/// Round trip through JSON, as the server would see the content.
func roundTrip(_ content: [String: Any]) -> [String: Any] {
    guard let data = try? JSONSerialization.data(withJSONObject: content) else { return [:] }
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
}

// MARK: Room versions

check(!RoomVersionSupport.knock("6") && RoomVersionSupport.knock("7"), "knock from v7")
check(!RoomVersionSupport.restricted("7") && RoomVersionSupport.restricted("8"), "restricted from v8")
check(!RoomVersionSupport.knockRestricted("9") && RoomVersionSupport.knockRestricted("10"), "knock_restricted from v10")
check(!RoomVersionSupport.creators("11") && RoomVersionSupport.creators("12"), "creators from v12")
check(RoomVersionSupport.creators("org.example.custom"), "unknown versions count as new, like desktop")
check(RoomVersionSupport.sorted(["10", "9", "12", "1", "org.x"]) == ["1", "9", "10", "12", "org.x"], "versions sorted numerically")

// MARK: Join rules

check(RoomJoinRuleKind.options(roomVersion: "12", inSpace: true) == [.invite, .knock, .restricted, .knockRestricted, .publicRoom], "all rules in a space")
check(RoomJoinRuleKind.options(roomVersion: "12", inSpace: false) == [.invite, .knock, .publicRoom], "no restricted rules outside a space")
check(RoomJoinRuleKind.options(roomVersion: "6", inSpace: true) == [.invite, .publicRoom], "old rooms: invite and public only")
check(RoomJoinRuleKind.options(roomVersion: "8", inSpace: true) == [.invite, .knock, .restricted, .publicRoom], "v8: no knock_restricted")
check(RoomJoinRuleKind.parse(nil) == .invite, "missing rule is invite")
check(RoomJoinRuleKind.parse("knock_restricted") == .knockRestricted, "knock_restricted parses")
check(RoomJoinRuleKind.publicRoom.label == "Public" && RoomJoinRuleKind.knock.label == "Knock & Invite", "desktop labels")
check(RoomJoinRuleKind.knockRestricted.label == "Space Members or Knock" && RoomJoinRuleKind.restricted.label == "Space Members", "desktop labels for restricted")
check(RoomJoinRuleKind.knock.allowsDirectory && !RoomJoinRuleKind.invite.allowsDirectory && !RoomJoinRuleKind.restricted.allowsDirectory, "directory only for public/knock rules")

check(RoomJoinRules.allowedSpaces(spaceParents: ["!a", "!x"], knownParents: ["!b", "!a"]) == ["!a"], "known m.space.parent wins")
check(RoomJoinRules.allowedSpaces(spaceParents: ["!x"], knownParents: ["!b", "!a", "!b"]) == ["!b", "!a"], "else every known parent, once")
let restricted = roundTrip(RoomJoinRules.content(.restricted, allowedSpaces: ["!space:s"]))
check(restricted["join_rule"] as? String == "restricted", "restricted rule written")
check(RoomJoinRules.allowedRoomIds(restricted) == ["!space:s"], "allow list round trip")
check((restricted["allow"] as? [[String: Any]])?.first?["type"] as? String == "m.room_membership", "allow type")
check(RoomJoinRules.content(.publicRoom, allowedSpaces: ["!space:s"])["allow"] == nil, "no allow list for public")
check(RoomJoinRules.content(.restricted, allowedSpaces: [])["allow"] == nil, "no empty allow list")

// MARK: History visibility

check(RoomHistoryVisibilityKind.menu.map(\.rawValue) == ["shared", "invited", "joined", "world_readable"], "desktop menu order")
check(RoomHistoryVisibilityKind.parse(nil) == .shared, "missing visibility is shared")
check(RoomHistoryVisibilityKind.worldReadable.label == "All Messages (Guests)", "desktop label")

// MARK: Power levels

let emptyLevels = RoomPowerLevelsModel(content: nil)
check(emptyLevels.user("@a:s") == 0 && emptyLevels.state("m.room.name") == 50 && emptyLevels.event("m.room.message") == 0, "defaults without an event")
check(emptyLevels.action("invite") == 0 && emptyLevels.action("kick") == 50 && emptyLevels.notification("room") == 50, "action defaults")

let levelsJSON = json("""
{"users":{"@admin:s":100,"@mod:s":50,"@bot:s":42},"users_default":0,"events":{"m.room.name":75,"m.room.message":10},
 "state_default":50,"ban":75,"notifications":{}}
""")
var levels = RoomPowerLevelsModel(content: levelsJSON)
check(levels.user("@admin:s") == 100 && levels.user("@nobody:s") == 0, "user powers")
check(levels.state("m.room.name") == 75 && levels.state("m.room.topic") == 50, "state powers")
check(levels.event("m.room.message") == 10 && levels.event("m.reaction") == 0, "event powers")
check(levels.action("ban") == 75 && levels.action("redact") == 50, "action powers")
check(levels.notification("room") == 50, "notifications.room filled in")
check(levels.power(at: .state(nil)) == 50 && levels.power(at: .event(nil)) == 0 && levels.power(at: .user(nil)) == 0, "defaults by location")
check(levels.usedPowers == [100, 50, 42, 0, 75, 10], "used powers: \(levels.usedPowers.sorted())")

levels.apply(60, at: .user("@bot:s"))
levels.apply(5, at: .user(nil))
levels.apply(80, at: .state("m.room.topic"))
levels.apply(1, at: .event("m.reaction"))
levels.apply(99, at: .notification("room"))
levels.apply(20, at: .action("invite"))
levels.apply(55, at: .state(nil))
levels.apply(3, at: .event(nil))
let applied = roundTrip(levels.content)
let reread = RoomPowerLevelsModel(content: applied)
check(reread.user("@bot:s") == 60 && reread.user("@admin:s") == 100, "user power set, others kept")
check(reread.user("@x:s") == 5, "users_default set")
check(reread.state("m.room.topic") == 80 && reread.state("m.room.name") == 75, "state power set")
check(reread.event("m.reaction") == 1, "event power set")
check(reread.notification("room") == 99 && reread.action("invite") == 20, "notification and action set")
check(reread.state("m.room.avatar") == 55 && reread.event("m.sticker") == 3, "defaults set")
check(applied["kick"] as? Int == 50 && applied["historical"] as? Int == 0, "missing keys filled like desktop")

// Desktop writes every listed permission out with its power, then the changes.
let groupsContent = roundTrip(RoomPermissionGroups.applying([.action("kick"): 90], to: RoomPowerLevelsModel(content: levelsJSON), groups: RoomPermissionGroups.room))
let groupEvents = groupsContent["events"] as? [String: Any] ?? [:]
check(groupsContent["kick"] as? Int == 90, "change applied")
check(groupEvents["m.room.pinned_events"] as? Int == 50, "listed state permission written out")
check(groupEvents["m.sticker"] as? Int == 0, "listed event permission written out")
check(groupEvents["m.room.name"] as? Int == 75, "existing permission kept")
check((groupsContent["users"] as? [String: Any])?["@admin:s"] as? Int == 100, "users kept")
check(RoomPermissionGroups.room.map(\.name) == ["Messages", "Calls", "Moderation", "Room Overview", "Settings", "Other"], "room groups like desktop")
check(RoomPermissionGroups.space.map(\.name) == ["Manage", "Moderation", "Space Overview", "Settings", "Other"], "space groups like desktop")

// MARK: Creators and permissions

check(RoomCreators.from(createContent: json(#"{"room_version":"11"}"#), sender: "@c:s").isEmpty, "no creators before v12")
let creators = RoomCreators.from(createContent: json(#"{"room_version":"12","additional_creators":["@d:s",5]}"#), sender: "@c:s")
check(creators == ["@c:s", "@d:s"], "creator and additional creators")
let permissions = RoomPermissionsModel(creators: ["@c:s"], levels: RoomPowerLevelsModel(content: levelsJSON))
check(permissions.stateEvent("m.room.power_levels", "@c:s"), "creator can do anything")
check(permissions.stateEvent("m.room.name", "@admin:s") && !permissions.stateEvent("m.room.name", "@mod:s"), "state permission by power")
check(permissions.action("kick", "@mod:s") && !permissions.action("ban", "@mod:s"), "action permission by power")
check(permissions.hasMorePower("@admin:s", than: "@mod:s") && !permissions.hasMorePower("@mod:s", than: "@mod:s"), "power compare")
check(permissions.hasMorePower("@c:s", than: "@admin:s") && !permissions.hasMorePower("@admin:s", than: "@c:s"), "creators outrank")
check(permissions.canAssign(50, by: "@mod:s") && !permissions.canAssign(51, by: "@mod:s") && permissions.canAssign(9001, by: "@c:s"), "assignable powers")

// MARK: Moderation options (desktop UserRoomProfile)

let modJoined = RoomModerationOptions.compute(permissions: permissions, me: "@admin:s", target: "@mod:s", membership: "join")
check(modJoined.canKick && modJoined.canBan && !modJoined.canInvite && !modJoined.canUnban, "joined: kick and ban")
let modLeft = RoomModerationOptions.compute(permissions: permissions, me: "@admin:s", target: "@x:s", membership: nil)
check(modLeft.canInvite && !modLeft.canKick && modLeft.canBan, "never joined: invite and ban")
let modBanned = RoomModerationOptions.compute(permissions: permissions, me: "@admin:s", target: "@x:s", membership: "ban")
check(modBanned.canUnban && !modBanned.canBan && !modBanned.canInvite, "banned: unban")
let modInvited = RoomModerationOptions.compute(permissions: permissions, me: "@admin:s", target: "@x:s", membership: "invite")
check(modInvited.canCancelInvite && !modInvited.canKick, "invited: cancel invite")
let modUp = RoomModerationOptions.compute(permissions: permissions, me: "@mod:s", target: "@admin:s", membership: "join")
check(!modUp.canKick && !modUp.canBan, "no moderation upwards")
check(RoomModerationOptions.compute(permissions: permissions, me: "@admin:s", target: "@admin:s", membership: "join") == RoomModerationOptions(), "nothing for yourself")

// MARK: Power level tags

let tagLevels = RoomPowerLevelsModel(content: json(#"{"users":{"@a:s":100,"@b:s":42}}"#))
let defaultTags = RoomPowerTags.tags(content: nil, levels: tagLevels)
check(defaultTags[100]?.name == "Admin" && defaultTags[100]?.color == "#0088ff", "default admin tag")
check(defaultTags[50]?.name == "Moderator" && defaultTags[0]?.name == "Member", "default tags for used powers")
check(defaultTags[42]?.name == "Member 42" && defaultTags[42]?.color == nil, "fallback named after the next lower default")
check(defaultTags[9001] == nil, "unused defaults not shown")
check(RoomPowerTags.fallback([:], power: 7).name == "Team 7", "fallback without tags")
check(RoomPowerTags.tag(for: 75, in: defaultTags).name == "Moderator 75", "tag for an unknown power")
check(RoomPowerTags.powers(defaultTags) == [100, 50, 42, 0], "powers highest first")

let customContent = json(##"{"100":{"name":"Boss","color":"#123456","icon":{"key":"mxc://s/i","info":{"w":32}}},"20":{"name":"Helper"},"x":{"name":"bad"},"30":{"color":"#fff"}}"##)
var customTags = RoomPowerTags.tags(content: customContent, levels: tagLevels)
check(customTags[100]?.name == "Boss" && customTags[100]?.iconKey == "mxc://s/i", "custom tag read")
check(customTags[20]?.name == "Helper", "unused custom tag kept")
check(customTags[30] == nil, "tag without a name ignored")
customTags[20] = RoomPowerTag(name: "Helpers", color: "#abcdef")
let tagsOut = roundTrip(RoomPowerTags.content(customTags, deleting: [0]))
check(tagsOut["0"] == nil, "deleted tag removed")
check((tagsOut["20"] as? [String: Any])?["name"] as? String == "Helpers", "edited tag written")
let bossIcon = (tagsOut["100"] as? [String: Any])?["icon"] as? [String: Any]
check(bossIcon?["key"] as? String == "mxc://s/i" && bossIcon?["info"] != nil, "icon info kept while unchanged")
check((tagsOut["50"] as? [String: Any])?["name"] as? String == "Moderator", "shown default tags written like desktop")
var renamedIcon = customTags[100]!
renamedIcon.iconKey = "😀"
check((renamedIcon.json["icon"] as? [String: Any])?.count == 1, "new icon drops the old info")
renamedIcon.iconKey = nil
check(renamedIcon.json["icon"] == nil && renamedIcon.json["color"] as? String == "#123456", "removed icon")
check(RoomPowerTags.normalizedHex("#ABCDEF") == "#abcdef" && RoomPowerTags.normalizedHex("12ab34") == "#12ab34", "hex colours")
check(RoomPowerTags.normalizedHex("#abc") == nil && RoomPowerTags.normalizedHex("zzzzzz") == nil, "bad colours rejected")

// MARK: Addresses

let alias = RoomCanonicalAliasModel(content: json(##"{"alias":"#main:s","alt_aliases":["#b:s","#c:s",3]}"##))
check(alias.published == ["#main:s", "#b:s", "#c:s"], "published addresses, main first")
let mainB = RoomCanonicalAliasModel(content: roundTrip(alias.settingMain("#b:s")))
check(mainB.alias == "#b:s" && mainB.altAliases == ["#main:s", "#c:s"], "set main moves the old main to the alternatives")
let unset = roundTrip(alias.settingMain(nil))
check(unset["alias"] == nil && (unset["alt_aliases"] as? [String]) == ["#main:s", "#b:s", "#c:s"], "unset main")
let published = RoomCanonicalAliasModel(content: roundTrip(alias.publishing(["#d:s", "#b:s"])))
check(published.alias == "#main:s" && published.altAliases == ["#b:s", "#c:s", "#d:s"], "publish adds once")
let unpublished = RoomCanonicalAliasModel(content: roundTrip(alias.unpublishing(["#b:s", "#main:s"])))
check(unpublished.alias == "#main:s" && unpublished.altAliases == ["#c:s"], "unpublish only touches alternatives, like desktop")
check(RoomCanonicalAliasModel(content: nil).published.isEmpty, "no addresses")

check(RoomLocalAddress.server(of: "@luis:example.org:8448") == "example.org:8448", "server with port")
check(RoomLocalAddress.server(of: "@luis") == nil, "no server")
check(RoomLocalAddress.localAlias(" my room ", server: "s.org") == "#my-room:s.org", "spaces become dashes")
check(RoomLocalAddress.localAlias("#lobby:other", server: "s.org") == "#lobby:s.org", "own server only")
check(RoomLocalAddress.localAlias("  ", server: "s.org") == nil, "empty alias")

// MARK: Room state and members

let state = RoomStateSnapshot(events: jsonArray("""
[
 {"type":"m.room.create","state_key":"","sender":"@c:s","content":{"room_version":"12","type":"m.space","predecessor":{"room_id":"!old:s"}}},
 {"type":"m.room.power_levels","state_key":"","sender":"@c:s","content":{"users":{"@a:s":100}}},
 {"type":"m.room.join_rules","state_key":"","sender":"@c:s","content":{"join_rule":"restricted","allow":[{"type":"m.room_membership","room_id":"!sp:s"}]}},
 {"type":"m.room.history_visibility","state_key":"","sender":"@c:s","content":{"history_visibility":"joined"}},
 {"type":"m.room.encryption","state_key":"","sender":"@c:s","content":{"algorithm":"m.megolm.v1.aes-sha2"}},
 {"type":"m.room.avatar","state_key":"","sender":"@c:s","content":{}},
 {"type":"m.room.name","state_key":"","sender":"@c:s","content":{"name":"Lobby"}},
 {"type":"m.room.tombstone","state_key":"","sender":"@c:s","content":{"replacement_room":"!new:s","body":""}},
 {"type":"m.space.parent","state_key":"!p1:s","sender":"@c:s","content":{"via":["s"]}},
 {"type":"m.space.parent","state_key":"!p2:s","sender":"@c:s","content":{}},
 {"type":"m.room.member","state_key":"@a:s","sender":"@a:s","origin_server_ts":1700000000000,"content":{"membership":"join","displayname":"Anna"}},
 {"type":"m.room.member","state_key":"@k:s","sender":"@a:s","content":{"membership":"leave","reason":" spam "}},
 {"type":"m.room.member","state_key":"@l:s","sender":"@l:s","content":{"membership":"leave"}},
 {"type":"m.room.member","state_key":"@b:s","sender":"@a:s","content":{"membership":"ban","reason":""}},
 {"type":"m.room.member","state_key":"@i:s","sender":"@a:s","content":{"membership":"invite"}},
 {"type":"m.room.member","state_key":"@n:s","sender":"@n:s","content":{"membership":"knock","reason":"let me in"}}
]
"""))
check(state.roomVersion == "12" && state.isSpace, "create content read")
check(state.creators == ["@c:s"], "creators from the create event")
check(state.permissions.stateEvent("m.room.name", "@c:s") && state.permissions.stateEvent("m.room.name", "@a:s"), "permissions from state")
check(state.joinRule == .restricted && state.allowedSpaces == ["!sp:s"], "join rule read")
check(state.historyVisibility == .joined, "history read")
check(state.isEncrypted, "encryption read")
check(state.avatarUrl == nil && state.name == "Lobby", "empty avatar is none")
check(state.tombstone?.replacement == "!new:s" && state.tombstone?.body == nil, "tombstone read, empty body is none")
check(state.predecessor == "!old:s", "predecessor read")
check(state.spaceParents == ["!p1:s"], "removed space parent ignored")
check(state.member("@a:s")?.timestamp == 1_700_000_000_000 && state.member("@a:s")?.displayName == "Anna", "member read")
check(state.member("@k:s")?.filter == .kicked && state.member("@k:s")?.reason == "spam", "kicked with trimmed reason")
check(state.member("@l:s")?.filter == .left, "left on their own")
check(state.member("@b:s")?.filter == .banned && state.member("@b:s")?.reason == nil, "banned, empty reason is none")
check(state.member("@i:s")?.filter == .invited, "invited")
check(state.member("@n:s")?.filter == .knocking && state.member("@n:s")?.reason == "let me in", "knocking")
check(Set(state.members.map(\.userId)) == ["@a:s", "@b:s", "@i:s", "@k:s", "@l:s", "@n:s"], "every member read")
check(RoomMembershipFilter.allCases.map(\.title) == ["Joined", "Invited", "Left", "Kicked", "Banned", "Knocking"], "filter titles")
check(RoomStateSnapshot(events: []).joinRule == .invite && !RoomStateSnapshot(events: []).isEncrypted, "empty state")

// MARK: Upgrade

check(RoomUpgradeRequest.defaultAdditionalCreators(["@me:s", "@b:s", "@a:s"], me: "@me:s") == ["@a:s", "@b:s"], "creators kept without yourself")
let upgrade12 = roundTrip(RoomUpgradeRequest.body(version: "12", additionalCreators: ["@a:s", "@me:s", "@a:s"], me: "@me:s"))
check(upgrade12["new_version"] as? String == "12" && (upgrade12["additional_creators"] as? [String]) == ["@a:s"], "v12 upgrade with creators")
check(RoomUpgradeRequest.body(version: "11", additionalCreators: ["@a:s"], me: "@me:s")["additional_creators"] == nil, "older versions without creators")

// MARK: Encryption

check(RoomEncryptionRule.content["algorithm"] as? String == "m.megolm.v1.aes-sha2", "megolm")

// MARK: Moderation

check(RoomModerationAction.kick.title == "Kick" && RoomModerationAction.ban.text.contains("cannot rejoin until unbanned"), "moderation texts")
check(RoomModerationAction.kick.endpoint == "kick" && RoomModerationAction.unban.endpoint == "unban", "moderation endpoints")
check(RoomModerationAction.kick.asksForReason && RoomModerationAction.ban.asksForReason && !RoomModerationAction.unban.asksForReason, "reason asked for kick and ban only")
let kickBody = RoomModerationAction.kick.body(userId: "@a:s", reason: "  spam  ")
check(kickBody["user_id"] as? String == "@a:s" && kickBody["reason"] as? String == "spam", "reason trimmed")
check(RoomModerationAction.ban.body(userId: "@a:s", reason: "   ")["reason"] == nil, "empty reason left out")
check(RoomModerationAction.ban.body(userId: "@a:s", reason: nil)["reason"] == nil, "no reason left out")

// MARK: Roles

let roleLevels = RoomPowerLevelsModel(content: json(##"{"users":{"@me:s":100,"@mod:s":50,"@low:s":0},"state_default":50}"##))
let rolePerms = RoomPermissionsModel(creators: [], levels: roleLevels)
check(RoomRoleChange.outcome(power: 50, target: "@low:s", me: "@me:s", permissions: rolePerms) == .apply, "promote a lower member")
check(RoomRoleChange.outcome(power: 100, target: "@low:s", me: "@me:s", permissions: rolePerms) == .confirmSharedPower, "same power as yourself asks first")
check(RoomRoleChange.outcome(power: 50, target: "@me:s", me: "@me:s", permissions: rolePerms) == .confirmSelfDemote, "demoting yourself asks first")
check(RoomRoleChange.outcome(power: 100, target: "@me:s", me: "@me:s", permissions: rolePerms) == .unchanged, "same power is unchanged")
check(RoomRoleChange.outcome(power: 0, target: "@mod:s", me: "@low:s", permissions: rolePerms) == .refused, "no power to change roles")
check(RoomRoleChange.outcome(power: 150, target: "@low:s", me: "@me:s", permissions: rolePerms) == .refused, "cannot hand out more than your own power")
check(RoomRoleChange.outcome(power: 100, target: "@low:s", me: "@me:s", permissions: RoomPermissionsModel(creators: ["@me:s"], levels: roleLevels)) == .apply, "creators share power without asking")
let roleContent = roundTrip(RoomRoleChange.content(levels: roleLevels, userId: "@low:s", power: 50))
check((roleContent["users"] as? [String: Any])?["@low:s"] as? Int == 50 && (roleContent["users"] as? [String: Any])?["@me:s"] as? Int == 100, "power set, others kept")

// MARK: Local state change

var changing = RoomStateSnapshot(events: jsonArray(##"[{"type":"m.room.name","state_key":"","sender":"@a:s","content":{"name":"Old"}},{"type":"m.room.avatar","state_key":"","sender":"@a:s","content":{"url":"mxc://s/x"}}]"##))
changing.setting("m.room.name", content: ["name": "New"], sender: "@me:s")
check(changing.name == "New" && changing.event("m.room.name")?["sender"] as? String == "@me:s", "name replaced locally")
changing.setting("m.room.avatar", content: [:], sender: "@me:s")
check(changing.avatarUrl == nil, "emptied avatar reads as none")
changing.setting("m.room.topic", content: ["topic": "Hi"], sender: "@me:s")
check(changing.topic == "Hi" && changing.event("m.room.topic")?["state_key"] as? String == "", "new event added locally")

if failures == 0 {
    print("roomsettings_check: all checks passed")
} else {
    print("roomsettings_check: \(failures) failure(s)")
    exit(1)
}
