import Foundation

/// Which picture a room or person shows. Foundation only, checked by Tools/avatar_check.
enum AvatarChoice {
    /// An avatar URL worth loading: `avatar_url: ""` (some clients write it to remove a picture)
    /// and blanks count as no picture, so a fallback can still apply.
    static func usable(_ url: String?) -> String? {
        guard let trimmed = url?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    /// The picture of a room in the room list, in the desktop's order (`getDirectRoomAvatarUrl`):
    /// a direct message with exactly one other person shows that person's avatar, everything else
    /// (and a direct message whose partner has none) the room's own `m.room.avatar`.
    /// Direct messages almost never have a room avatar, so without this they only showed initials.
    /// `otherPeople` are the avatars of the room's heroes (everyone but you).
    static func room(roomAvatar: String?, isDirect: Bool, otherPeople: [String?]) -> String? {
        if isDirect, otherPeople.count == 1, let person = usable(otherPeople[0]) { return person }
        return usable(roomAvatar)
    }

    /// Seconds to wait before the next attempt after a failed avatar download, or nil to give up.
    /// A row drawn while the connection is still coming up (app start, back from background)
    /// would otherwise keep its initials until it is drawn again.
    static func retryDelay(afterAttempt attempt: Int) -> UInt64? {
        switch attempt {
        case 1: return 2
        case 2: return 8
        default: return nil
        }
    }
}
