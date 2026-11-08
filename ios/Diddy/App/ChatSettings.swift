import Foundation

/// The chat options under Settings > Chat, stored on this device like the desktop app's settings.
enum ChatSettings {
    enum TimeFormat: String, CaseIterable, Identifiable {
        case system, twelve, twentyFour
        var id: String { rawValue }

        var title: String {
            switch self {
            case .system: return "System"
            case .twelve: return "12-hour"
            case .twentyFour: return "24-hour"
            }
        }
    }

    static let timeFormatKey = "chat.timeFormat"
    static let showMembershipKey = "chat.showMembershipEvents"
    static let shareActivityKey = "chat.shareTypingAndReceipts"
    static let autoLoadMediaKey = "chat.autoLoadMedia"

    static var timeFormat: TimeFormat {
        UserDefaults.standard.string(forKey: timeFormatKey).flatMap(TimeFormat.init(rawValue:)) ?? .system
    }

    /// "Lndr joined" and "Lndr left" lines in the chat.
    static var showMembership: Bool { bool(showMembershipKey) }

    /// Others see that you are typing and how far you have read. Off, Diddy still marks chats as
    /// read for you, with a private receipt.
    static var shareActivity: Bool { bool(shareActivityKey) }

    /// Off, pictures in the chat load only when tapped, to save mobile data.
    static var autoLoadMedia: Bool { bool(autoLoadMediaKey) }

    private static func bool(_ key: String) -> Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? true
    }

    private static let twelveHour: DateFormatter = {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("hmma")
        return formatter
    }()

    private static let twentyFourHour: DateFormatter = {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("HHmm")
        return formatter
    }()

    static func time(_ date: Date) -> String {
        switch timeFormat {
        case .system: return date.formatted(date: .omitted, time: .shortened)
        case .twelve: return twelveHour.string(from: date)
        case .twentyFour: return twentyFourHour.string(from: date)
        }
    }
}
