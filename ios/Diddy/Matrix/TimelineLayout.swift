import Foundation

/// How the chat lays out its rows: which messages start a new group (avatar, name and time) and
/// which membership changes are left out. Foundation only, so `Tools/timeline_check` can test it
/// on Linux; `TimelineController.rebuild()` feeds it the timeline.
enum TimelineLayout {
    /// Discord groups messages of one sender that follow within this time.
    static let groupWindow: TimeInterval = 7 * 60
    /// How long after a direct message was created its joins and invites count as setup.
    static let directSetupWindow: TimeInterval = 10 * 60

    enum Kind: Equatable {
        /// Something someone wrote: text, picture, file, voice, or the placeholder of a deleted
        /// or not yet decryptable message (still that person's message).
        case message
        /// A line about the room: membership change, call started.
        case notice
    }

    struct Entry: Equatable {
        var sender: String
        var date: Date
        var kind: Kind
        var isReply = false
        /// A day divider is drawn right above this row.
        var hasDayDivider = false
    }

    /// Whether `current` joins the group of the row above it, which hides its avatar and name.
    /// Only a message directly after a message of the same sender does: a notice is no message
    /// even though it has a sender (the inviter of "Luis was invited"), so the first message after
    /// one always shows who wrote it.
    static func continuesGroup(_ current: Entry, after previous: Entry?) -> Bool {
        guard let previous,
              current.kind == .message, previous.kind == .message,
              !current.hasDayDivider, !current.isReply,
              previous.sender == current.sender else { return false }
        return current.date.timeIntervalSince(previous.date) < groupWindow
    }

    /// What the day divider above a row says, like the desktop: "Today", "Yesterday" or the date.
    enum Day: Equatable { case today, yesterday, earlier }

    static func day(of date: Date, now: Date = Date(), calendar: Calendar = .current) -> Day {
        if calendar.isDate(date, inSameDayAs: now) { return .today }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday) { return .yesterday }
        return .earlier
    }

    /// The changes the chat writes a line for (others, like profile edits, are left out).
    enum Membership: Equatable {
        case joined, invited, left, removed, banned, unbanned, declined

        /// Desktop's wording, shortened to Discord's.
        func text(name: String) -> String {
            switch self {
            case .joined: return "\(name) joined"
            case .invited: return "\(name) was invited"
            case .left: return "\(name) left"
            case .removed: return "\(name) was removed"
            case .banned: return "\(name) was banned"
            case .unbanned: return "\(name) was unbanned"
            case .declined: return "\(name) declined the invite"
            }
        }

        /// Someone is gone afterwards; joins after this are real changes again.
        var isDeparture: Bool {
            switch self {
            case .left, .removed, .banned, .declined: return true
            case .joined, .invited, .unbanned: return false
            }
        }
    }

    enum Item: Equatable {
        case message(Date)
        case membership(Membership, Date)
        case other(Date)
    }

    /// Indices of the membership lines that only set up a direct message ("music joined", "Luis
    /// was invited", "Luis joined"). Discord shows none of this in a DM. Hidden are joins and
    /// invites before anyone left, made before the first message or within `directSetupWindow`
    /// of the creation. `createdAt` is nil while the start of the room is not loaded: then it is
    /// unknown whether a join was the setup, and nothing is hidden.
    static func hiddenSetupLines(_ items: [Item], isDirect: Bool, createdAt: Date?) -> Set<Int> {
        guard isDirect, let createdAt else { return [] }
        var hidden: Set<Int> = []
        var seenMessage = false
        var someoneLeft = false
        for (index, item) in items.enumerated() {
            switch item {
            case .message:
                seenMessage = true
            case .membership(let change, let date):
                if change.isDeparture { someoneLeft = true; continue }
                guard !someoneLeft, change == .joined || change == .invited else { continue }
                if !seenMessage || date.timeIntervalSince(createdAt) <= directSetupWindow {
                    hidden.insert(index)
                }
            case .other:
                break
            }
        }
        return hidden
    }
}
