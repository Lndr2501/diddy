import Foundation
import MatrixRustSDK

/// Rooms whose badge power levels were checked in this app run.
@MainActor private var diddyBadgePowerChecked: Set<String> = []

/// Creating, giving and deleting badges like desktop's `profiles.ts` (`createCustomBadge`,
/// `awardBadge`, `revokeBadge`, `deleteBadgeDef`). Every write goes through `writeDiddyData`: as
/// state in an unencrypted options room where you may write badge state (admins only since 1.5.3,
/// #168), as a hidden message in every other case, so ordinary members use message mode for badges.
/// Taking a badge back, or deleting one, is an empty event, which readers see as "removed".
extension MatrixAccount {
    private var nowMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    /// Adds a custom badge to the shared library and returns its id. Give it to yourself afterwards.
    func createDiddyBadge(name: String, emoji: String, imageMxc: String?, color: String) async throws -> String {
        try requireDiddyRoom()
        let id = DiddyBadgeLogic.makeBadgeId(userId: userId, now: nowMs, random: DiddyBadgeLogic.randomSuffix())
        let content = DiddyBadgeLogic.definitionContent(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines), emoji: emoji.trimmingCharacters(in: .whitespacesAndNewlines),
            imageMxc: imageMxc, color: color, createdBy: userId
        )
        try await writeDiddyData(type: DiddyEvents.badge, key: id, content: content)
        await loadDiddyProfiles(force: true)
        return id
    }

    /// Gives a badge to someone (to yourself for "Add to me"). The event names you as the giver.
    func awardDiddyBadge(_ badgeId: String, to recipient: String) async throws {
        try requireDiddyRoom()
        try await writeDiddyData(type: DiddyEvents.award,
                                 key: DiddyBadgeLogic.awardKey(badgeId: badgeId, userId: recipient),
                                 content: DiddyBadgeLogic.awardContent(by: userId, at: nowMs))
        await loadDiddyProfiles(force: true)
    }

    /// Takes a badge back: the giver can, and so can the person who has it.
    func revokeDiddyBadge(_ badgeId: String, from recipient: String) async throws {
        try requireDiddyRoom()
        try await writeDiddyData(type: DiddyEvents.award,
                                 key: DiddyBadgeLogic.awardKey(badgeId: badgeId, userId: recipient), content: [:])
        await loadDiddyProfiles(force: true)
    }

    /// Deletes a custom badge from the library for everyone. Only its creator can.
    func deleteDiddyBadge(_ badge: DiddyBadge) async throws {
        try requireDiddyRoom()
        guard DiddyBadgeLogic.canDelete(badge, me: userId) else { throw DiddyError("Only the creator can delete this badge.") }
        try await writeDiddyData(type: DiddyEvents.badge, key: badge.id, content: [:])
        await loadDiddyProfiles(force: true)
    }

    private func requireDiddyRoom() throws {
        if diddyPrimaryRoom == nil { throw DiddyError("No Diddy Options room found.") }
    }

    /// Older options rooms let every member write badge state, so anyone could replace or empty
    /// other people's badges (#168). If you may change the room's permissions, badge state is
    /// limited to admins once per room (`hardenBadgePower`). Never fails loudly: not being allowed
    /// is the normal case for members.
    func hardenDiddyBadgePower() async {
        let joined = Set(rooms.filter(\.isJoined).map(\.id))
        for roomId in diddyOptionsRooms.filter({ joined.contains($0) }).sorted() where !diddyBadgePowerChecked.contains(roomId) {
            diddyBadgePowerChecked.insert(roomId)
            let path = "/_matrix/client/v3/rooms/\(Self.badgePath(roomId))/state/m.room.power_levels"
            guard let levels = try? await clientRequest(path),
                  let next = DiddyOptionsRoomLogic.hardenedPowerLevels(levels) else { continue }
            do {
                _ = try await clientRequest(path, body: next, method: "PUT")
                DiagLog.shared.write("diddy: badge state limited to admins room=\(roomId)")
            } catch {
                DiagLog.shared.write("diddy: could not limit badge state room=\(roomId): \(error.friendlyMessage)")
            }
        }
    }

    private static func badgePath(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? value
    }
}
