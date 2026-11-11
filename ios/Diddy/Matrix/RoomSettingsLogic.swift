import Foundation

// The rules of desktop's room and space settings (cinny/src/app/features/common-settings,
// hooks/usePowerLevels.ts, hooks/usePowerLevelTags.ts, hooks/useRoomAliases.ts,
// hooks/useMemberFilter.ts, utils/matrix.ts), Foundation only so Tools/roomsettings_check can run
// them on Linux. The views live in Diddy/UI/RoomSettings.

// MARK: - Room versions

enum RoomVersionSupport {
    private static func notIn(_ version: String, upTo last: Int) -> Bool {
        !(1...last).map { String($0) }.contains(version)
    }

    static func knock(_ version: String) -> Bool { notIn(version, upTo: 6) }
    static func restricted(_ version: String) -> Bool { notIn(version, upTo: 7) }
    static func knockRestricted(_ version: String) -> Bool { notIn(version, upTo: 9) }
    static func creators(_ version: String) -> Bool { notIn(version, upTo: 11) }

    /// The versions of the server's `m.room_versions` capability, in a stable order (numbers first,
    /// ascending, then the rest by name). JSON objects lose their order on the way here.
    static func sorted(_ versions: [String]) -> [String] {
        versions.sorted { a, b in
            switch (Int(a), Int(b)) {
            case let (x?, y?): return x < y
            case (.some, nil): return true
            case (nil, .some): return false
            case (nil, nil): return a < b
            }
        }
    }
}

// MARK: - JSON helpers

enum RoomStateJSON {
    /// A JSON number as desktop's `typeof value === 'number'` sees it (whole numbers only).
    static func int(_ value: Any?) -> Int? {
        if let number = value as? Int { return number }
        if let number = value as? Double, number.rounded() == number, abs(number) < 9.0e15 { return Int(number) }
        return nil
    }

    static func string(_ value: Any?) -> String? { value as? String }
}

// MARK: - Join rules

enum RoomJoinRuleKind: String, CaseIterable, Identifiable {
    case invite
    case knock
    case restricted
    case knockRestricted = "knock_restricted"
    case publicRoom = "public"
    case privateRoom = "private"

    var id: String { rawValue }

    /// Desktop `useRoomJoinRuleLabel`.
    var label: String {
        switch self {
        case .invite: return "Invite Only"
        case .knock: return "Knock & Invite"
        case .knockRestricted: return "Space Members or Knock"
        case .restricted: return "Space Members"
        case .publicRoom: return "Public"
        case .privateRoom: return "Invite Only"
        }
    }

    static func parse(_ raw: String?) -> RoomJoinRuleKind {
        raw.flatMap(RoomJoinRuleKind.init(rawValue:)) ?? .invite
    }

    /// The choices of desktop `RoomJoinRules`: restricted ones only inside a space.
    static func options(roomVersion: String, inSpace: Bool) -> [RoomJoinRuleKind] {
        var rules: [RoomJoinRuleKind] = [.invite]
        if RoomVersionSupport.knock(roomVersion) { rules.append(.knock) }
        if RoomVersionSupport.restricted(roomVersion) && inSpace { rules.append(.restricted) }
        if RoomVersionSupport.knockRestricted(roomVersion) && inSpace { rules.append(.knockRestricted) }
        rules.append(.publicRoom)
        return rules
    }

    var isRestricted: Bool { self == .restricted || self == .knockRestricted }

    /// Rules under which "Publish to Directory" can be switched (desktop `RoomPublish`).
    var allowsDirectory: Bool { self == .publicRoom || self == .knock || self == .knockRestricted }
}

enum RoomJoinRules {
    /// The spaces whose members may join a restricted room, chosen like desktop: the room's
    /// `m.space.parent` events that point at a known parent, else every known parent.
    static func allowedSpaces(spaceParents: [String], knownParents: [String]) -> [String] {
        let parents = spaceParents.filter { knownParents.contains($0) }
        if !parents.isEmpty { return parents }
        var result: [String] = []
        for id in knownParents where !result.contains(id) { result.append(id) }
        return result
    }

    /// The `m.room.join_rules` content desktop sends.
    static func content(_ rule: RoomJoinRuleKind, allowedSpaces: [String]) -> [String: Any] {
        var content: [String: Any] = ["join_rule": rule.rawValue]
        if rule.isRestricted && !allowedSpaces.isEmpty {
            content["allow"] = allowedSpaces.map { ["type": "m.room_membership", "room_id": $0] }
        }
        return content
    }

    /// The room ids of an `allow` list.
    static func allowedRoomIds(_ content: [String: Any]?) -> [String] {
        let allow = content?["allow"] as? [[String: Any]] ?? []
        return allow.compactMap { $0["type"] as? String == "m.room_membership" ? $0["room_id"] as? String : nil }
    }
}

// MARK: - History visibility

enum RoomHistoryVisibilityKind: String, CaseIterable, Identifiable {
    case shared
    case invited
    case joined
    case worldReadable = "world_readable"

    var id: String { rawValue }

    /// Desktop `useVisibilityStr`.
    var label: String {
        switch self {
        case .invited: return "After Invite"
        case .joined: return "After Join"
        case .shared: return "All Messages"
        case .worldReadable: return "All Messages (Guests)"
        }
    }

    /// Desktop menu order.
    static let menu: [RoomHistoryVisibilityKind] = [.shared, .invited, .joined, .worldReadable]

    static func parse(_ raw: String?) -> RoomHistoryVisibilityKind {
        raw.flatMap(RoomHistoryVisibilityKind.init(rawValue:)) ?? .shared
    }
}

// MARK: - Power levels

/// Where a permission's power lives in `m.room.power_levels` (desktop `PermissionLocation`).
enum PermissionLocation: Hashable {
    /// `users_default`, or one user's entry in `users`.
    case user(String?)
    /// `invite`, `redact`, `kick`, `ban`, `historical`.
    case action(String)
    /// `notifications.<key>`, e.g. `room` for @room.
    case notification(String)
    /// `events.<type>` for a state event, or `state_default` without a type.
    case state(String?)
    /// `events.<type>` for a message event, or `events_default` without a type.
    case event(String?)
}

struct RoomPowerLevelsModel {
    /// The content as desktop edits it: missing keys filled with the defaults.
    private(set) var content: [String: Any]

    static let defaults: [String: Any] = [
        "users_default": 0,
        "state_default": 50,
        "events_default": 0,
        "invite": 0,
        "redact": 50,
        "kick": 50,
        "ban": 50,
        "historical": 0,
        "events": [String: Any](),
        "users": [String: Any](),
        "notifications": ["room": 50] as [String: Any],
    ]

    /// Desktop `getPowersLevelFromMatrixEvent`: no event means the defaults, a partial one is filled up.
    init(content raw: [String: Any]?) {
        var filled = raw ?? [:]
        for (key, value) in Self.defaults where filled[key] == nil || filled[key] is NSNull {
            filled[key] = value
        }
        if var notifications = filled["notifications"] as? [String: Any], RoomStateJSON.int(notifications["room"]) == nil {
            notifications["room"] = 50
            filled["notifications"] = notifications
        }
        content = filled
    }

    private func number(_ key: String, fallback: Int) -> Int { RoomStateJSON.int(content[key]) ?? fallback }
    private func map(_ key: String) -> [String: Any] { content[key] as? [String: Any] ?? [:] }

    func user(_ userId: String?) -> Int {
        if let userId, let power = RoomStateJSON.int(map("users")[userId]) { return power }
        return number("users_default", fallback: 0)
    }

    func event(_ type: String?) -> Int {
        if let type, let power = RoomStateJSON.int(map("events")[type]) { return power }
        return number("events_default", fallback: 0)
    }

    func state(_ type: String?) -> Int {
        if let type, let power = RoomStateJSON.int(map("events")[type]) { return power }
        return number("state_default", fallback: 50)
    }

    func action(_ name: String) -> Int {
        let fallback = RoomStateJSON.int(Self.defaults[name]) ?? 50
        return number(name, fallback: fallback)
    }

    func notification(_ name: String) -> Int {
        RoomStateJSON.int(map("notifications")[name]) ?? 50
    }

    func power(at location: PermissionLocation) -> Int {
        switch location {
        case .user(let id): return user(id)
        case .action(let name): return action(name)
        case .notification(let name): return notification(name)
        case .state(let type): return state(type)
        case .event(let type): return event(type)
        }
    }

    /// Desktop `applyPermissionPower`.
    mutating func apply(_ power: Int, at location: PermissionLocation) {
        switch location {
        case .user(let id):
            if let id { setInMap("users", entry: id, power) } else { content["users_default"] = power }
        case .action(let name):
            content[name] = power
        case .notification(let name):
            setInMap("notifications", entry: name, power)
        case .state(let type):
            if let type { setInMap("events", entry: type, power) } else { content["state_default"] = power }
        case .event(let type):
            if let type { setInMap("events", entry: type, power) } else { content["events_default"] = power }
        }
    }

    private mutating func setInMap(_ name: String, entry: String, _ power: Int) {
        var values = map(name)
        values[entry] = power
        content[name] = values
    }

    /// Every power the content uses anywhere (desktop `getUsedPowers`).
    var usedPowers: Set<Int> {
        var powers: Set<Int> = []
        func walk(_ value: Any) {
            if let dict = value as? [String: Any] {
                for inner in dict.values { walk(inner) }
            } else if !(value is String), !(value is [Any]), let power = RoomStateJSON.int(value) {
                powers.insert(power)
            }
        }
        walk(content)
        return powers
    }
}

/// Desktop `getRoomPermissionsAPI` and `useMemberPowerCompare`: creators (room version 12+) can do anything.
struct RoomPermissionsModel {
    let creators: Set<String>
    let levels: RoomPowerLevelsModel

    func event(_ type: String, _ userId: String) -> Bool {
        creators.contains(userId) || levels.user(userId) >= levels.event(type)
    }

    func stateEvent(_ type: String, _ userId: String) -> Bool {
        creators.contains(userId) || levels.user(userId) >= levels.state(type)
    }

    func action(_ name: String, _ userId: String) -> Bool {
        creators.contains(userId) || levels.user(userId) >= levels.action(name)
    }

    func notification(_ name: String, _ userId: String) -> Bool {
        creators.contains(userId) || levels.user(userId) >= levels.notification(name)
    }

    /// Whether `a` outranks `b`.
    func hasMorePower(_ a: String, than b: String) -> Bool {
        let aCreator = creators.contains(a)
        let bCreator = creators.contains(b)
        if aCreator && bCreator { return false }
        if aCreator { return true }
        if bCreator { return false }
        return levels.user(a) > levels.user(b)
    }

    /// The powers you may hand out (desktop `PowerChip`): creators any, others up to their own.
    func canAssign(_ power: Int, by userId: String) -> Bool {
        creators.contains(userId) || power <= levels.user(userId)
    }
}

enum RoomCreators {
    /// Desktop `getRoomCreators`: the creator and `additional_creators`, from room version 12 on.
    static func from(createContent: [String: Any]?, sender: String?) -> Set<String> {
        let version = createContent?["room_version"] as? String ?? "1"
        guard RoomVersionSupport.creators(version) else { return [] }
        var creators: Set<String> = []
        if let sender { creators.insert(sender) }
        for case let id as String in createContent?["additional_creators"] as? [Any] ?? [] {
            creators.insert(id)
        }
        return creators
    }
}

// MARK: - Permission groups

struct PermissionItemModel: Identifiable {
    let location: PermissionLocation
    let name: String
    var id: String { name }
}

struct PermissionGroupModel: Identifiable {
    let name: String
    let items: [PermissionItemModel]
    var id: String { name }
}

enum RoomPermissionGroups {
    /// Desktop room-settings/permissions/usePermissionItems.ts.
    static let room: [PermissionGroupModel] = [
        PermissionGroupModel(name: "Messages", items: [
            PermissionItemModel(location: .event("m.room.message"), name: "Send Messages"),
            PermissionItemModel(location: .event("m.sticker"), name: "Send Stickers"),
            PermissionItemModel(location: .event("m.reaction"), name: "Send Reactions"),
            PermissionItemModel(location: .notification("room"), name: "Ping @room"),
            PermissionItemModel(location: .state("m.room.pinned_events"), name: "Pin Messages"),
            PermissionItemModel(location: .event(nil), name: "Other Message Events"),
        ]),
        PermissionGroupModel(name: "Calls", items: [
            PermissionItemModel(location: .state("org.matrix.msc3401.call.member"), name: "Start or Join Call"),
        ]),
        PermissionGroupModel(name: "Moderation", items: [
            PermissionItemModel(location: .action("invite"), name: "Invite"),
            PermissionItemModel(location: .action("kick"), name: "Kick"),
            PermissionItemModel(location: .action("ban"), name: "Ban"),
            PermissionItemModel(location: .action("redact"), name: "Delete Others Messages"),
            PermissionItemModel(location: .event("m.room.redaction"), name: "Delete Self Messages"),
        ]),
        PermissionGroupModel(name: "Room Overview", items: [
            PermissionItemModel(location: .state("m.room.avatar"), name: "Room Avatar"),
            PermissionItemModel(location: .state("m.room.name"), name: "Room Name"),
            PermissionItemModel(location: .state("m.room.topic"), name: "Room Topic"),
        ]),
        PermissionGroupModel(name: "Settings", items: [
            PermissionItemModel(location: .state("m.room.join_rules"), name: "Change Room Access"),
            PermissionItemModel(location: .state("m.room.canonical_alias"), name: "Publish Address"),
            PermissionItemModel(location: .state("m.room.power_levels"), name: "Change All Permission"),
            PermissionItemModel(location: .state(RoomPowerTags.eventType), name: "Edit Power Levels"),
            PermissionItemModel(location: .state("m.room.encryption"), name: "Enable Encryption"),
            PermissionItemModel(location: .state("m.room.history_visibility"), name: "History Visibility"),
            PermissionItemModel(location: .state("m.room.tombstone"), name: "Upgrade Room"),
            PermissionItemModel(location: .state(nil), name: "Other Settings"),
        ]),
        PermissionGroupModel(name: "Other", items: [
            PermissionItemModel(location: .state("im.ponies.room_emotes"), name: "Manage Emojis & Stickers"),
            PermissionItemModel(location: .state("m.room.server_acl"), name: "Change Server ACLs"),
            PermissionItemModel(location: .state("im.vector.modular.widgets"), name: "Modify Widgets"),
        ]),
    ]

    /// Desktop space-settings/permissions/usePermissionItems.ts.
    static let space: [PermissionGroupModel] = [
        PermissionGroupModel(name: "Manage", items: [
            PermissionItemModel(location: .state("m.space.child"), name: "Manage space rooms"),
            PermissionItemModel(location: .event(nil), name: "Message Events"),
        ]),
        PermissionGroupModel(name: "Moderation", items: [
            PermissionItemModel(location: .action("invite"), name: "Invite"),
            PermissionItemModel(location: .action("kick"), name: "Kick"),
            PermissionItemModel(location: .action("ban"), name: "Ban"),
        ]),
        PermissionGroupModel(name: "Space Overview", items: [
            PermissionItemModel(location: .state("m.room.avatar"), name: "Space Avatar"),
            PermissionItemModel(location: .state("m.room.name"), name: "Space Name"),
            PermissionItemModel(location: .state("m.room.topic"), name: "Space Topic"),
        ]),
        PermissionGroupModel(name: "Settings", items: [
            PermissionItemModel(location: .state("m.room.join_rules"), name: "Change Space Access"),
            PermissionItemModel(location: .state("m.room.canonical_alias"), name: "Publish Address"),
            PermissionItemModel(location: .state("m.room.power_levels"), name: "Change All Permission"),
            PermissionItemModel(location: .state(RoomPowerTags.eventType), name: "Edit Power Levels"),
            PermissionItemModel(location: .state("m.room.tombstone"), name: "Upgrade Space"),
            PermissionItemModel(location: .state(nil), name: "Other Settings"),
        ]),
        PermissionGroupModel(name: "Other", items: [
            PermissionItemModel(location: .state("im.ponies.room_emotes"), name: "Manage Emojis & Stickers"),
            PermissionItemModel(location: .state("m.room.server_acl"), name: "Change Server ACLs"),
        ]),
    ]

    static func groups(isSpace: Bool) -> [PermissionGroupModel] { isSpace ? space : room }

    /// The power levels content desktop's `PermissionGroups` sends: every listed permission written
    /// out with its current power, then the changes on top.
    static func applying(_ changes: [PermissionLocation: Int], to levels: RoomPowerLevelsModel, groups: [PermissionGroupModel]) -> [String: Any] {
        var edited = levels
        for group in groups {
            for item in group.items {
                edited.apply(levels.power(at: item.location), at: item.location)
            }
        }
        for (location, power) in changes {
            edited.apply(power, at: location)
        }
        return edited.content
    }
}

// MARK: - Power level tags (roles)

/// A named power level, desktop `MemberPowerTag` in the `in.cinny.room.power_level_tags` state event.
struct RoomPowerTag: Equatable {
    var name: String
    var color: String?
    /// `icon.key`: an emoji or an mxc:// picture.
    var iconKey: String?
    /// The whole `icon` object as written (with `info`), kept as long as the key is unchanged.
    var iconRaw: [String: Any]?

    init(name: String, color: String? = nil, iconKey: String? = nil, iconRaw: [String: Any]? = nil) {
        self.name = name
        self.color = color
        self.iconKey = iconKey
        self.iconRaw = iconRaw
    }

    init?(json: Any?) {
        guard let dict = json as? [String: Any], let name = dict["name"] as? String else { return nil }
        self.name = name
        color = dict["color"] as? String
        let icon = dict["icon"] as? [String: Any]
        iconKey = icon?["key"] as? String
        iconRaw = icon
    }

    var json: [String: Any] {
        var dict: [String: Any] = ["name": name]
        if let color { dict["color"] = color }
        if let iconKey {
            var icon = iconRaw ?? [:]
            if icon["key"] as? String != iconKey { icon = ["key": iconKey] }
            dict["icon"] = icon
        }
        return dict
    }

    static func == (lhs: RoomPowerTag, rhs: RoomPowerTag) -> Bool {
        lhs.name == rhs.name && lhs.color == rhs.color && lhs.iconKey == rhs.iconKey
    }
}

enum RoomPowerTags {
    static let eventType = "in.cinny.room.power_level_tags"

    /// Desktop `DEFAULT_TAGS`.
    static let defaults: [Int: RoomPowerTag] = [
        9001: RoomPowerTag(name: "Goku", color: "#ff6a00"),
        150: RoomPowerTag(name: "Manager", color: "#ff6a7f"),
        101: RoomPowerTag(name: "Founder", color: "#0000ff"),
        100: RoomPowerTag(name: "Admin", color: "#0088ff"),
        50: RoomPowerTag(name: "Moderator", color: "#1fd81f"),
        0: RoomPowerTag(name: "Member", color: "#91cfdf"),
        -1: RoomPowerTag(name: "Muted", color: "#888888"),
    ]

    /// Desktop `useRoomCreatorsTag`.
    static let creators = RoomPowerTag(name: "Founder", color: "#0000ff")

    /// Highest first (desktop `getPowers`).
    static func powers(_ tags: [Int: RoomPowerTag]) -> [Int] { tags.keys.sorted(by: >) }

    /// Desktop `generateFallbackTag`: named after the next lower tag, else "Team <power>".
    static func fallback(_ tags: [Int: RoomPowerTag], power: Int) -> RoomPowerTag {
        if let lower = powers(tags).first(where: { $0 < power }), let tag = tags[lower] {
            return RoomPowerTag(name: "\(tag.name) \(power)")
        }
        return RoomPowerTag(name: "Team \(power)")
    }

    /// Desktop `usePowerLevelTags`: the room's tags, plus a default or fallback for every used power.
    static func tags(content: [String: Any]?, levels: RoomPowerLevelsModel) -> [Int: RoomPowerTag] {
        var tags: [Int: RoomPowerTag] = [:]
        for (key, value) in content ?? [:] {
            guard let power = Int(key), let tag = RoomPowerTag(json: value) else { continue }
            tags[power] = tag
        }
        for power in levels.usedPowers where tags[power] == nil {
            tags[power] = defaults[power] ?? fallback(defaults, power: power)
        }
        return tags
    }

    /// Desktop `getPowerLevelTag`.
    static func tag(for power: Int, in tags: [Int: RoomPowerTag]) -> RoomPowerTag {
        tags[power] ?? fallback(tags, power: power)
    }

    /// The content desktop's `PowersEditor` sends: all shown tags minus the deleted ones.
    static func content(_ tags: [Int: RoomPowerTag], deleting deleted: Set<Int>) -> [String: Any] {
        var content: [String: Any] = [:]
        for (power, tag) in tags where !deleted.contains(power) {
            content[String(power)] = tag.json
        }
        return content
    }

    /// A `#rrggbb` colour, as desktop's colour picker writes it, or nil.
    static func normalizedHex(_ raw: String?) -> String? {
        guard var text = raw?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, text.allSatisfy({ $0.isHexDigit }) else { return nil }
        return "#" + text.lowercased()
    }
}

// MARK: - Addresses

struct RoomCanonicalAliasModel: Equatable {
    var alias: String?
    var altAliases: [String]

    init(alias: String?, altAliases: [String]) {
        self.alias = alias
        self.altAliases = altAliases
    }

    init(content: [String: Any]?) {
        alias = content?["alias"] as? String
        altAliases = (content?["alt_aliases"] as? [Any] ?? []).compactMap { $0 as? String }
    }

    /// Desktop `usePublishedAliases`: the main address first, then the alternatives.
    var published: [String] {
        var result: [String] = []
        if let alias { result.append(alias) }
        result.append(contentsOf: altAliases)
        return result
    }

    private static func content(alias: String?, alt: [String]) -> [String: Any] {
        var content: [String: Any] = ["alt_aliases": alt]
        if let alias { content["alias"] = alias }
        return content
    }

    /// Desktop `useSetMainAlias`; nil unsets the main address.
    func settingMain(_ main: String?) -> [String: Any] {
        var alt: [String] = []
        if let alias, alias != main { alt.append(alias) }
        for other in altAliases where other != main { alt.append(other) }
        return Self.content(alias: main, alt: alt)
    }

    /// Desktop `publishAliases`.
    func publishing(_ aliases: [String]) -> [String: Any] {
        var alt = altAliases
        for alias in aliases where !alt.contains(alias) { alt.append(alias) }
        return Self.content(alias: alias, alt: alt)
    }

    /// Desktop `unpublishAliases`.
    func unpublishing(_ aliases: [String]) -> [String: Any] {
        Self.content(alias: alias, alt: altAliases.filter { !aliases.contains($0) })
    }
}

enum RoomLocalAddress {
    /// The server part of a Matrix ID.
    static func server(of userId: String) -> String? {
        guard let colon = userId.firstIndex(of: ":") else { return nil }
        let server = String(userId[userId.index(after: colon)...])
        return server.isEmpty ? nil : server
    }

    /// Desktop `LocalAddressInput`: spaces become dashes, the own homeserver is appended.
    static func localAlias(_ input: String, server: String) -> String? {
        var name = input.trimmingCharacters(in: .whitespaces)
        if name.hasPrefix("#") { name.removeFirst() }
        if let colon = name.firstIndex(of: ":") { name = String(name[..<colon]) }
        name = name.replacingOccurrences(of: " ", with: "-")
        guard !name.isEmpty else { return nil }
        return "#\(name):\(server)"
    }
}

// MARK: - Members

/// Desktop `useMembershipFilterMenu`, plus the people asking to join (knock), which desktop's
/// member list does not show.
enum RoomMembershipFilter: String, CaseIterable, Identifiable {
    case joined, invited, left, kicked, banned, knocking
    var id: String { rawValue }

    var title: String {
        switch self {
        case .joined: return "Joined"
        case .invited: return "Invited"
        case .left: return "Left"
        case .kicked: return "Kicked"
        case .banned: return "Banned"
        case .knocking: return "Knocking"
        }
    }
}

struct RoomMemberState: Identifiable, Equatable {
    let userId: String
    let membership: String
    let sender: String?
    let reason: String?
    /// Milliseconds since 1970, from `origin_server_ts`.
    let timestamp: Int64?
    let displayName: String?
    let avatarUrl: String?
    var id: String { userId }

    /// Desktop `MembershipFilter`: leaving on your own is "Left", being removed "Kicked".
    var filter: RoomMembershipFilter? {
        switch membership {
        case "join": return .joined
        case "invite": return .invited
        case "ban": return .banned
        case "knock": return .knocking
        case "leave": return sender == nil || sender == userId ? .left : .kicked
        default: return nil
        }
    }

    init(userId: String, membership: String, sender: String?, reason: String?, timestamp: Int64?, displayName: String?, avatarUrl: String?) {
        self.userId = userId
        self.membership = membership
        self.sender = sender
        self.reason = reason
        self.timestamp = timestamp
        self.displayName = displayName
        self.avatarUrl = avatarUrl
    }

    /// From an `m.room.member` state event.
    init?(event: [String: Any]) {
        guard event["type"] as? String == "m.room.member",
              let userId = event["state_key"] as? String,
              let content = event["content"] as? [String: Any],
              let membership = content["membership"] as? String else { return nil }
        self.userId = userId
        self.membership = membership
        sender = event["sender"] as? String
        let reason = (content["reason"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.reason = reason?.isEmpty == false ? reason : nil
        timestamp = RoomStateJSON.int(event["origin_server_ts"]).map { Int64($0) }
        displayName = content["displayname"] as? String
        avatarUrl = content["avatar_url"] as? String
    }
}

/// What the profile card offers a moderator (desktop `UserRoomProfile`).
struct RoomModerationOptions: Equatable {
    var canInvite = false
    var canKick = false
    var canBan = false
    var canUnban = false
    /// Withdrawing an invite is a kick of an invited member.
    var canCancelInvite = false

    /// `membership` is nil when the user has never been in the room (desktop treats it as "leave").
    static func compute(permissions: RoomPermissionsModel, me: String, target: String, membership: String?) -> RoomModerationOptions {
        var options = RoomModerationOptions()
        guard me != target else { return options }
        let state = membership ?? "leave"
        let outranks = permissions.hasMorePower(me, than: target)
        let kick = permissions.action("kick", me) && outranks
        let ban = permissions.action("ban", me) && outranks
        options.canInvite = permissions.action("invite", me) && state == "leave"
        options.canKick = kick && state == "join"
        options.canBan = ban && state != "ban"
        options.canUnban = permissions.action("ban", me) && state == "ban"
        options.canCancelInvite = kick && state == "invite"
        return options
    }
}

// MARK: - The room's state

/// A room's whole state from `GET /rooms/{id}/state`, read the way desktop reads its synced state.
struct RoomStateSnapshot {
    private var events: [String: [String: [String: Any]]] = [:]

    init(events list: [[String: Any]]) {
        for event in list {
            guard let type = event["type"] as? String, let key = event["state_key"] as? String else { continue }
            events[type, default: [:]][key] = event
        }
    }

    func event(_ type: String, _ key: String = "") -> [String: Any]? { events[type]?[key] }

    /// The state after a successful `PUT /rooms/{id}/state/{type}/{key}`, so the screens do not have
    /// to read a big room's whole state again after every change.
    mutating func setting(_ type: String, key: String = "", content: [String: Any], sender: String) {
        var event = events[type]?[key] ?? ["type": type, "state_key": key]
        event["content"] = content
        event["sender"] = sender
        event["origin_server_ts"] = Int(Date().timeIntervalSince1970 * 1000)
        events[type, default: [:]][key] = event
    }

    /// The content, or nil when the event is missing or emptied (redacted or removed).
    func content(_ type: String, _ key: String = "") -> [String: Any]? {
        guard let content = event(type, key)?["content"] as? [String: Any], !content.isEmpty else { return nil }
        return content
    }

    func stateKeys(_ type: String) -> [String] { Array((events[type] ?? [:]).keys).sorted() }

    var createContent: [String: Any]? { content("m.room.create") }
    var roomVersion: String { createContent?["room_version"] as? String ?? "1" }
    var isSpace: Bool { createContent?["type"] as? String == "m.space" }
    var creators: Set<String> {
        RoomCreators.from(createContent: createContent, sender: event("m.room.create")?["sender"] as? String)
    }

    var powerLevels: RoomPowerLevelsModel { RoomPowerLevelsModel(content: content("m.room.power_levels")) }
    var permissions: RoomPermissionsModel { RoomPermissionsModel(creators: creators, levels: powerLevels) }
    var powerTags: [Int: RoomPowerTag] { RoomPowerTags.tags(content: content(RoomPowerTags.eventType), levels: powerLevels) }

    var name: String? { content("m.room.name")?["name"] as? String }
    var topic: String? { content("m.room.topic")?["topic"] as? String }
    var avatarUrl: String? {
        guard let url = content("m.room.avatar")?["url"] as? String, !url.isEmpty else { return nil }
        return url
    }

    var joinRule: RoomJoinRuleKind { RoomJoinRuleKind.parse(content("m.room.join_rules")?["join_rule"] as? String) }
    var allowedSpaces: [String] { RoomJoinRules.allowedRoomIds(content("m.room.join_rules")) }
    var historyVisibility: RoomHistoryVisibilityKind {
        RoomHistoryVisibilityKind.parse(content("m.room.history_visibility")?["history_visibility"] as? String)
    }

    /// Desktop `RoomEncryption`: only Megolm counts as on.
    var isEncrypted: Bool { content("m.room.encryption")?["algorithm"] as? String == RoomEncryptionRule.algorithm }

    var canonicalAlias: RoomCanonicalAliasModel { RoomCanonicalAliasModel(content: content("m.room.canonical_alias")) }

    var spaceParents: [String] { stateKeys("m.space.parent").filter { content("m.space.parent", $0) != nil } }

    /// The replacement room of an upgraded room and the reason given.
    var tombstone: (replacement: String, body: String?)? {
        guard let content = content("m.room.tombstone"), let replacement = content["replacement_room"] as? String,
              !replacement.isEmpty else { return nil }
        let body = content["body"] as? String
        return (replacement, body?.isEmpty == false ? body : nil)
    }

    var predecessor: String? {
        (createContent?["predecessor"] as? [String: Any])?["room_id"] as? String
    }

    var members: [RoomMemberState] {
        (events["m.room.member"] ?? [:]).values.compactMap { RoomMemberState(event: $0) }
            .sorted { ($0.displayName ?? $0.userId).localizedCaseInsensitiveCompare($1.displayName ?? $1.userId) == .orderedAscending }
    }

    func member(_ userId: String) -> RoomMemberState? {
        event("m.room.member", userId).flatMap { RoomMemberState(event: $0) }
    }
}

enum RoomEncryptionRule {
    static let algorithm = "m.megolm.v1.aes-sha2"
    static var content: [String: Any] { ["algorithm": algorithm] }
}

/// Desktop `RoomUpgradeDialog`: the body of `POST /rooms/{id}/upgrade`.
enum RoomUpgradeRequest {
    /// The creators kept by default: everyone but yourself.
    static func defaultAdditionalCreators(_ creators: Set<String>, me: String) -> [String] {
        creators.filter { $0 != me }.sorted()
    }

    static func body(version: String, additionalCreators: [String], me: String) -> [String: Any] {
        var body: [String: Any] = ["new_version": version]
        if RoomVersionSupport.creators(version) {
            var list: [String] = []
            for id in additionalCreators where id != me && !list.contains(id) { list.append(id) }
            body["additional_creators"] = list
        }
        return body
    }
}

// MARK: - Moderation requests

/// The four membership requests of the profile card and the member lists
/// (`POST /rooms/{id}/invite|kick|ban|unban`). The texts are desktop's `ACTION_TEXT`.
enum RoomModerationAction: String, Identifiable {
    case invite, kick, ban, unban
    var id: String { rawValue }

    /// The path segment after `/rooms/{id}/`.
    var endpoint: String { rawValue }

    var title: String {
        switch self {
        case .invite: return "Invite"
        case .kick: return "Kick"
        case .ban: return "Ban"
        case .unban: return "Unban"
        }
    }

    var text: String {
        switch self {
        case .invite: return "will be invited back to this room."
        case .kick: return "will be removed from this room. They can rejoin if the room allows it."
        case .ban: return "will be removed from this room and cannot rejoin until unbanned."
        case .unban: return "will be able to join this room again."
        }
    }

    /// Kick and ban ask for a reason first; inviting back and unbanning go straight through.
    var asksForReason: Bool { self == .kick || self == .ban || self == .invite }

    /// `reason` is optional: trimmed, and left out when empty (desktop `value.trim() || undefined`).
    func body(userId: String, reason: String?) -> [String: Any] {
        var body: [String: Any] = ["user_id": userId]
        if let reason = reason?.trimmingCharacters(in: .whitespacesAndNewlines), !reason.isEmpty {
            body["reason"] = reason
        }
        return body
    }
}

// MARK: - Changing someone's role

/// Desktop `PowerChip`: what changing the power of a member needs.
enum RoomRoleChange {
    enum Outcome: Equatable {
        /// You may not change this member's power.
        case refused
        /// Already at this power.
        case unchanged
        /// Demoting yourself: asks first, "You will not be able to regain this power yourself".
        case confirmSelfDemote
        /// Giving someone your own power: asks first, you cannot change theirs afterwards.
        case confirmSharedPower
        case apply
    }

    static let powerLevelsType = "m.room.power_levels"

    static func canChange(me: String, target: String, permissions: RoomPermissionsModel) -> Bool {
        permissions.stateEvent(powerLevelsType, me) && (me == target ? true : permissions.hasMorePower(me, than: target))
    }

    static func outcome(power: Int, target: String, me: String, permissions: RoomPermissionsModel) -> Outcome {
        guard canChange(me: me, target: target, permissions: permissions) else { return .refused }
        guard permissions.canAssign(power, by: me) else { return .refused }
        let levels = permissions.levels
        if power == levels.user(target) { return .unchanged }
        if target == me { return .confirmSelfDemote }
        if !permissions.creators.contains(me) && power == levels.user(me) { return .confirmSharedPower }
        return .apply
    }

    /// The `m.room.power_levels` content with the member's power set (js-sdk `setPowerLevel`).
    static func content(levels: RoomPowerLevelsModel, userId: String, power: Int) -> [String: Any] {
        var edited = levels
        edited.apply(power, at: .user(userId))
        return edited.content
    }
}
