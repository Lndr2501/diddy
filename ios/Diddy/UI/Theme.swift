import SwiftUI

/// Discord's layout and density with Diddy's colours: deep violet surfaces and the pink accent of
/// the desktop "Diddy" theme.
enum Theme {
    static let rail = Color(red: 0x0F / 255, green: 0x07 / 255, blue: 0x11 / 255)
    static let sidebar = Color(red: 0x18 / 255, green: 0x0B / 255, blue: 0x1B / 255)
    static let chat = Color(red: 0x20 / 255, green: 0x0F / 255, blue: 0x23 / 255)
    static let elevated = Color(red: 0x2B / 255, green: 0x16 / 255, blue: 0x2F / 255)
    static let input = Color(red: 0x2F / 255, green: 0x1A / 255, blue: 0x33 / 255)
    static let accent = Color(red: 0xE5 / 255, green: 0x51 / 255, blue: 0x7C / 255)
    static let online = Color(red: 0x23 / 255, green: 0xA5 / 255, blue: 0x5A / 255)
    static let danger = Color(red: 0xF2 / 255, green: 0x3F / 255, blue: 0x43 / 255)
    static let text = Color(white: 0.95)
    static let muted = Color(white: 0.68)
    static let faint = Color(white: 0.45)

    private static let palette: [Color] = [
        Color(red: 0.89, green: 0.32, blue: 0.49), Color(red: 0.35, green: 0.40, blue: 0.95),
        Color(red: 0.58, green: 0.33, blue: 0.86), Color(red: 0.15, green: 0.65, blue: 0.55),
        Color(red: 0.93, green: 0.55, blue: 0.20), Color(red: 0.20, green: 0.60, blue: 0.86),
    ]

    /// Stable colour per user / room, like Discord's default avatars.
    static func color(for seed: String) -> Color {
        let sum = seed.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
        return palette[sum % palette.count]
    }
}

extension Date {
    var chatTimestamp: String {
        let calendar = Calendar.current
        let time = ChatSettings.time(self)
        if calendar.isDateInToday(self) { return "Today at \(time)" }
        if calendar.isDateInYesterday(self) { return "Yesterday at \(time)" }
        return "\(formatted(date: .numeric, time: .omitted)) \(time)"
    }
}

/// Small red unread pill.
struct UnreadBadge: View {
    let count: UInt64
    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .frame(minWidth: 16, minHeight: 16)
            .background(Capsule().fill(Theme.danger))
    }
}
