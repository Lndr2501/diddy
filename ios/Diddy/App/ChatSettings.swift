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

    /// Desktop's Settings > General > Messages > Message Layout, with the same numbers.
    enum MessageLayout: Int, CaseIterable, Identifiable {
        case modern = 0, compact = 1, bubble = 2
        var id: Int { rawValue }

        var title: String {
            switch self {
            case .modern: return "Modern"
            case .compact: return "Compact"
            case .bubble: return "Bubble"
            }
        }
    }

    /// Desktop's Message Spacing: the gap above a message that starts a group, in points (the
    /// folds spacing steps S0 to S500). Continued messages keep a small gap.
    enum MessageSpacing: String, CaseIterable, Identifiable {
        case none = "0", ultraSmall = "100", extraSmall = "200", small = "300", normal = "400", large = "500"
        var id: String { rawValue }

        var title: String {
            switch self {
            case .none: return "None"
            case .ultraSmall: return "Ultra Small"
            case .extraSmall: return "Extra Small"
            case .small: return "Small"
            case .normal: return "Normal"
            case .large: return "Large"
            }
        }

        var points: Double {
            switch self {
            case .none: return 0
            case .ultraSmall: return 2
            case .extraSmall: return 4
            case .small: return 8
            case .normal: return 12
            case .large: return 16
            }
        }
    }

    static let timeFormatKey = "chat.timeFormat"
    static let dateFormatKey = "chat.dateFormat"
    static let showMembershipKey = "chat.showMembershipEvents"
    static let hideProfileChangesKey = "chat.hideProfileChanges"
    static let showHiddenEventsKey = "chat.showHiddenEvents"
    static let shareActivityKey = "chat.shareTypingAndReceipts"
    static let autoLoadMediaKey = "chat.autoLoadMedia"
    static let enterForNewlineKey = "chat.enterForNewline"
    static let markdownKey = "chat.markdown"
    static let editorToolbarKey = "chat.editorToolbar"
    static let urlPreviewsKey = "chat.urlPreviews"
    static let encryptedUrlPreviewsKey = "chat.encryptedUrlPreviews"
    static let messageLayoutKey = "chat.messageLayout"
    static let messageSpacingKey = "chat.messageSpacing"
    static let legacyUsernameColorKey = "chat.legacyUsernameColor"

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

    /// "Lndr changed their name" and "... changed their profile picture" stay hidden, like the
    /// desktop's Hide Profile Change (on by default there too).
    static var hideProfileChanges: Bool { bool(hideProfileChangesKey) }

    /// Desktop's Show Hidden Events: state changes and events Diddy has no view for, as a line.
    static var showHiddenEvents: Bool { bool(showHiddenEventsKey, default: false) }

    /// Return makes a new line; sending is the send button only (desktop: Ctrl/Cmd + Enter).
    static var enterForNewline: Bool { bool(enterForNewlineKey, default: false) }

    /// Messages are sent with Markdown formatting (desktop's Markdown Formatting, on by default).
    static var markdown: Bool { bool(markdownKey) }

    /// The formatting bar above the composer (desktop's editor toolbar, off by default).
    static var editorToolbar: Bool { bool(editorToolbarKey, default: false) }

    /// Link previews in chats without encryption (desktop's Url Preview, on by default).
    static var urlPreviews: Bool { bool(urlPreviewsKey) }

    /// Link previews in encrypted chats. The app reads the pages itself there, the homeserver never
    /// learns the links, so they are on by default like on desktop (#197).
    static var encryptedUrlPreviews: Bool { bool(encryptedUrlPreviewsKey) }

    /// Whether link previews show in a chat, by its encryption.
    static func urlPreviews(encrypted: Bool) -> Bool {
        encrypted ? encryptedUrlPreviews : urlPreviews
    }

    static var messageLayout: MessageLayout {
        (UserDefaults.standard.object(forKey: messageLayoutKey) as? Int).flatMap(MessageLayout.init(rawValue:)) ?? .modern
    }

    static var messageSpacing: MessageSpacing {
        UserDefaults.standard.string(forKey: messageSpacingKey).flatMap(MessageSpacing.init(rawValue:)) ?? .normal
    }

    /// Names in the colour of the user ID instead of the role colour (desktop's Legacy Username Color).
    static var legacyUsernameColor: Bool { bool(legacyUsernameColorKey, default: false) }

    /// The desktop's date format (dayjs tokens, for example `D MMM YYYY`).
    static var dateFormat: String {
        let stored = UserDefaults.standard.string(forKey: dateFormatKey) ?? ""
        return stored.isEmpty ? DateFormatRules.defaultFormat : stored
    }

    /// A date in the chosen date format, for example "11 Nov 2026".
    static func date(_ date: Date) -> String {
        DateFormatRules.string(from: date, format: dateFormat)
    }

    private static func bool(_ key: String, default fallback: Bool = true) -> Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? fallback
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
