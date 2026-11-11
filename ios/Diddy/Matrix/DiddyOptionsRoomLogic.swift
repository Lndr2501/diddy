import Foundation

/// How the hidden "Diddy Options" room is set up, as desktop does it
/// (`cinny/src/app/plugins/diddy/optionsRoom.ts`, `badgePower.ts`, `discover.ts`): the request that
/// creates it, the power levels, the topic tag, and which room of a server to join. Foundation
/// only, so `Tools/optionsroom_check` tests it without the app. The calls themselves are in
/// `DiddyOptionsRoomSetup.swift`.
enum DiddyOptionsRoomLogic {
    /// Name the room is created with; also used to find it in a space (`OPTIONS_ROOM_NAME`).
    static let roomName = "Diddy Options"
    /// Power level needed to write badge state (`BADGE_STATE_LEVEL`): the same as renaming the room.
    static let badgeStateLevel = 100
    static let badgeEventTypes = [DiddyEvents.badge, DiddyEvents.award]

    /// The topic of a new options room, ending in the tag other Diddy clients look for.
    static var roomTopic: String {
        "Used by Diddy clients to share profiles and badges. Please do not rename or delete. \(DiddyEvents.topicTag)"
    }

    // MARK: Creating

    /// `createRoomPowerLevels`: every member writes their profile as state (its key is their user
    /// id, so the homeserver protects it); badge state is admin only (#168). The creator is left
    /// out on purpose: in room version 12 listing them is an error.
    static func createPowerLevels() -> [String: Any] {
        [
            "events": [
                DiddyEvents.profile: 0,
                DiddyEvents.badge: badgeStateLevel,
                DiddyEvents.award: badgeStateLevel,
                DiddyEvents.marker: 100,
                "m.room.name": 100,
            ] as [String: Any],
        ]
    }

    /// The body of `POST /createRoom`. With a space the room becomes a child of it and every
    /// member of the space may join it (restricted join rule).
    static func createRoomBody(name: String, spaceId: String?, serverName: String) -> [String: Any] {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        var state: [[String: Any]] = [
            ["type": DiddyEvents.marker, "state_key": "", "content": ["v": 1]],
        ]
        if let spaceId, !spaceId.isEmpty {
            state.append(["type": "m.space.parent", "state_key": spaceId,
                          "content": ["via": [serverName], "canonical": true] as [String: Any]])
            state.append(["type": "m.room.join_rules", "state_key": "",
                          "content": ["join_rule": "restricted",
                                      "allow": [["type": "m.room_membership", "room_id": spaceId]]] as [String: Any]])
        }
        return [
            "name": trimmed.isEmpty ? roomName : trimmed,
            "topic": roomTopic,
            "visibility": "private",
            "preset": "private_chat",
            "initial_state": state,
            "power_level_content_override": createPowerLevels(),
        ]
    }

    /// The `m.space.child` entry that adds the new room to its space.
    static func spaceChildContent(serverName: String) -> [String: Any] {
        ["via": [serverName], "suggested": false]
    }

    // MARK: Using an existing room

    private static func number(_ value: Any?) -> Int? {
        guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else { return nil }
        let double = value.doubleValue
        return double.isFinite ? Int(max(-1_000_000_000, min(1_000_000_000, double))) : nil
    }

    /// Level needed to send state of this type (`stateLevelFor`; the Matrix default is 50).
    static func stateLevel(for type: String, in powerLevels: [String: Any]) -> Int {
        let events = powerLevels["events"] as? [String: Any]
        return number(events?[type]) ?? number(powerLevels["state_default"]) ?? 50
    }

    /// True when an ordinary member may write badge state, which lets them overwrite other
    /// people's (`badgeStateOpenToMembers`).
    static func badgeStateOpenToMembers(_ powerLevels: [String: Any]) -> Bool {
        let member = number(powerLevels["users_default"]) ?? 0
        return badgeEventTypes.contains { stateLevel(for: $0, in: powerLevels) <= member }
    }

    /// The power levels with badge state limited to admins, or nil when they already are
    /// (`hardenBadgePowerLevels`). Everything else stays as it is.
    static func hardenedPowerLevels(_ powerLevels: [String: Any]) -> [String: Any]? {
        if badgeEventTypes.allSatisfy({ stateLevel(for: $0, in: powerLevels) >= badgeStateLevel }) { return nil }
        var events = powerLevels["events"] as? [String: Any] ?? [:]
        for type in badgeEventTypes {
            events[type] = max(stateLevel(for: type, in: powerLevels), badgeStateLevel)
        }
        var out = powerLevels
        out["events"] = events
        return out
    }

    /// The power levels of a room that becomes the options room (`adoptRoomAsOptionsRoom`): all
    /// existing levels stay, the profile may be written by everyone, badge state only by admins.
    static func adoptedPowerLevels(_ powerLevels: [String: Any]) -> [String: Any] {
        var events = powerLevels["events"] as? [String: Any] ?? [:]
        events[DiddyEvents.profile] = 0
        events[DiddyEvents.badge] = badgeStateLevel
        events[DiddyEvents.award] = badgeStateLevel
        var out = powerLevels
        out["events"] = events
        return out
    }

    /// The topic with the tag other clients look for, or nil when it has it already.
    static func taggedTopic(_ topic: String) -> String? {
        if topic.contains(DiddyEvents.topicTag) { return nil }
        return "\(topic) \(DiddyEvents.topicTag)".trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Finding

    /// True when the name or topic marks a room as the Diddy options room (`looksLikeDiddyRoom`).
    static func looksLikeDiddyRoom(name: String?, topic: String?) -> Bool {
        (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines) == roomName || (topic ?? "").contains(DiddyEvents.topicTag)
    }

    /// One room of a space's hierarchy.
    struct HierarchyRoom: Equatable {
        let roomId: String
        let name: String?
        let topic: String?
    }

    /// The room of a server to join (`joinOptionsRoomOfSpace`): named like the options room or
    /// tagged in its topic, not the space itself, not joined or banned already, not left on purpose.
    static func joinCandidate(in rooms: [HierarchyRoom], spaceId: String, membership: (String) -> String?,
                              leftOnPurpose: (String) -> Bool) -> HierarchyRoom? {
        rooms.first { room in
            if room.roomId == spaceId { return false }
            if !looksLikeDiddyRoom(name: room.name, topic: room.topic) { return false }
            let state = membership(room.roomId)
            if state == "join" || state == "ban" { return false }
            return !leftOnPurpose(room.roomId)
        }
    }

    /// The servers to join through: the `via` of the space's child entry, else the room id's server.
    static func viaServers(roomId: String, childVia: [String]?) -> [String] {
        if let childVia, !childVia.isEmpty { return childVia }
        let parts = roomId.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: true)
        if parts.count == 2 { return [String(parts[1])] }
        return []
    }
}
