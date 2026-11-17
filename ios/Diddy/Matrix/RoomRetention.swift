import Foundation

/// Automatic message deletion per room (#245): the standard `m.room.retention` state event
/// (MSC1763). The homeserver purges expired messages; the app hides them right away, because the
/// server only purges every few minutes. Same rules and cases as desktop `utils/retention.ts`
/// and Android `RoomRetention.kt` (docs/fixtures/retention.json).
enum RoomRetention {
    static let eventType = "m.room.retention"

    private static let minute: Int64 = 60 * 1000
    private static let hour: Int64 = 60 * minute
    private static let day: Int64 = 24 * hour

    /// The lifetimes the room settings offer; the server allows 1 hour to 365 days.
    static let choices: [Int64] = [hour, day, 7 * day, 30 * day]

    /// How long messages stay in the room (ms), or nil when the room keeps its history.
    static func lifetime(_ content: [String: Any]?) -> Int64? {
        // JSON booleans are NSNumbers too; only real numbers count.
        guard let number = content?["max_lifetime"] as? NSNumber,
              CFGetTypeID(number as CFTypeRef) != CFBooleanGetTypeID() else { return nil }
        let double = number.doubleValue
        guard double.isFinite, double >= 1 else { return nil }
        return Int64(double.rounded(.down))
    }

    /// The state event content for a choice; an empty content turns automatic deletion off.
    static func content(_ lifetime: Int64?) -> [String: Any] {
        guard let lifetime else { return [:] }
        return ["max_lifetime": lifetime]
    }

    /// Whether a message sent at `ts` (ms) is past the lifetime. Unknown times never expire.
    static func isExpired(ts: Int64, lifetime: Int64?, now: Int64) -> Bool {
        guard let lifetime, ts > 0 else { return false }
        return now - ts >= lifetime
    }

    enum Unit: String { case days, hours, minutes }

    /// A lifetime in whole days or hours where possible, otherwise in (rounded up) minutes.
    static func label(_ lifetime: Int64) -> (unit: Unit, count: Int64) {
        if lifetime % day == 0 { return (.days, lifetime / day) }
        if lifetime % hour == 0 { return (.hours, lifetime / hour) }
        return (.minutes, (lifetime + minute - 1) / minute)
    }
}
