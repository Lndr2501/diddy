import SwiftUI

/// Discord's layout and density with Diddy's colours, switchable to the desktop's other themes
/// (see `DiddyTheme`). The roles keep their names; each reads the theme that is current.
enum Theme {
    static var rail: Color { DiddyTheme.current.rail }
    static var sidebar: Color { DiddyTheme.current.sidebar }
    static var chat: Color { DiddyTheme.current.chat }
    static var elevated: Color { DiddyTheme.current.elevated }
    static var input: Color { DiddyTheme.current.input }
    static var accent: Color { DiddyTheme.current.accent }
    static var online: Color { DiddyTheme.current.online }
    static var danger: Color { DiddyTheme.current.danger }
    static var text: Color { DiddyTheme.current.text }
    static var muted: Color { DiddyTheme.current.muted }
    static var faint: Color { DiddyTheme.current.faint }
    /// Text and icons on an `accent` fill.
    static var onAccent: Color { DiddyTheme.current.onAccent }

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
