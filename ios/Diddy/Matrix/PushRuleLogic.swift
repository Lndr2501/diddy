import Foundation

/// The desktop's notification levels (Settings > Notifications): Sound, Silent or Off per push
/// rule, read from and written to the account's push rules exactly like desktop
/// (`useNotificationMode.ts`, `usePushRule.ts`), so both apps show and change the same thing.
/// Foundation only, checked by `Tools/pushrules_check`.
enum NotificationLevel: String, CaseIterable, Identifiable {
    case loud = "NotifyLoud"
    case silent = "Notify"
    case off = "OFF"

    var id: String { rawValue }

    /// The segmented control's labels on desktop.
    var shortTitle: String {
        switch self {
        case .loud: return "Sound"
        case .silent: return "Silent"
        case .off: return "Off"
        }
    }

    /// The long names desktop shows as tooltip.
    var title: String {
        switch self {
        case .loud: return "Notify Loud"
        case .silent: return "Notify Silent"
        case .off: return "Disable"
        }
    }
}

enum PushRuleLogic {
    /// The rule sets of a push rule, in the order desktop searches them.
    static let kinds = ["override", "content", "room", "sender", "underride"]

    // The rule ids desktop changes (matrix-js-sdk `RuleId`).
    static let oneToOne = ".m.rule.room_one_to_one"
    static let encryptedOneToOne = ".m.rule.encrypted_room_one_to_one"
    static let message = ".m.rule.message"
    static let encrypted = ".m.rule.encrypted"
    static let isUserMention = ".m.rule.is_user_mention"
    static let containsDisplayName = ".m.rule.contains_display_name"
    static let containsUserName = ".m.rule.contains_user_name"
    static let isRoomMention = ".m.rule.is_room_mention"
    static let atRoom = ".m.rule.roomnotif"

    struct Rule: Equatable {
        let kind: String
        let ruleId: String
        let level: NotificationLevel
        let pattern: String?
        let isDefault: Bool
    }

    /// One row of the settings: the rule, where desktop expects it if the server has none, and the
    /// level desktop assumes then.
    struct Spec: Equatable {
        let ruleId: String
        let kind: String
        let fallback: NotificationLevel
        /// Mentions and keywords also highlight, like desktop's `{ highlight: true }`.
        let highlight: Bool
    }

    struct Row: Identifiable {
        let title: String
        let spec: Spec
        var id: String { spec.ruleId }
        init(_ title: String, _ spec: Spec) {
            self.title = title
            self.spec = spec
        }
    }

    /// Desktop's All Messages section, in its order.
    static let allMessages: [Row] = [
        Row("1-to-1 Chats", Spec(ruleId: oneToOne, kind: "underride", fallback: .loud, highlight: false)),
        Row("1-to-1 Chats (Encrypted)", Spec(ruleId: encryptedOneToOne, kind: "underride", fallback: .loud, highlight: false)),
        Row("Rooms", Spec(ruleId: message, kind: "underride", fallback: .loud, highlight: false)),
        Row("Rooms (Encrypted)", Spec(ruleId: encrypted, kind: "underride", fallback: .loud, highlight: false)),
    ]

    /// Desktop's Mentions section, in its order.
    static let mentions: [Row] = [
        Row("Mention User ID", Spec(ruleId: isUserMention, kind: "override", fallback: .loud, highlight: true)),
        Row("Contains Display Name", Spec(ruleId: containsDisplayName, kind: "override", fallback: .loud, highlight: true)),
        Row("Contains Username", Spec(ruleId: containsUserName, kind: "content", fallback: .loud, highlight: true)),
        Row("Mention @room", Spec(ruleId: isRoomMention, kind: "override", fallback: .silent, highlight: true)),
        Row("Contains @room", Spec(ruleId: atRoom, kind: "override", fallback: .silent, highlight: true)),
    ]

    /// Desktop's `getNotificationMode`: notify plus a sound tweak is Sound, notify alone Silent,
    /// anything else Off.
    static func level(of actions: [Any]) -> NotificationLevel {
        var notify = false
        var sound = false
        for action in actions {
            if let name = action as? String, name == "notify" { notify = true }
            if let tweak = action as? [String: Any], tweak["set_tweak"] as? String == "sound" { sound = true }
        }
        if notify && sound { return .loud }
        if notify { return .silent }
        return .off
    }

    /// Desktop's `getNotificationModeActions`.
    static func actions(for level: NotificationLevel, highlight: Bool) -> [Any] {
        if level == .off { return [] }
        var actions: [Any] = ["notify"]
        if level == .loud { actions.append(["set_tweak": "sound", "value": "default"] as [String: Any]) }
        if highlight { actions.append(["set_tweak": "highlight", "value": true] as [String: Any]) }
        return actions
    }

    /// The rule with this id in a `GET /pushrules/` answer, searched like desktop's `getPushRule`.
    static func find(_ ruleId: String, in rules: [String: Any]) -> Rule? {
        guard let global = rules["global"] as? [String: Any] else { return nil }
        for kind in kinds {
            guard let list = global[kind] as? [[String: Any]] else { continue }
            if let raw = list.first(where: { $0["rule_id"] as? String == ruleId }) {
                return rule(raw, kind: kind)
            }
        }
        return nil
    }

    /// Where a row's rule is and what level it has, with desktop's defaults when the server has
    /// no such rule.
    static func resolve(_ spec: Spec, in rules: [String: Any]) -> (kind: String, level: NotificationLevel) {
        if let found = find(spec.ruleId, in: rules) { return (found.kind, found.level) }
        return (spec.kind, spec.fallback)
    }

    /// The keywords you added (content rules that are not server defaults), like desktop.
    static func keywords(in rules: [String: Any]) -> [Rule] {
        guard let global = rules["global"] as? [String: Any],
              let content = global["content"] as? [[String: Any]] else { return [] }
        return content.compactMap { raw in
            guard raw["default"] as? Bool == false, raw["pattern"] is String else { return nil }
            return rule(raw, kind: "content")
        }
    }

    private static func rule(_ raw: [String: Any], kind: String) -> Rule? {
        guard let ruleId = raw["rule_id"] as? String else { return nil }
        return Rule(
            kind: kind,
            ruleId: ruleId,
            level: level(of: raw["actions"] as? [Any] ?? []),
            pattern: raw["pattern"] as? String,
            isDefault: raw["default"] as? Bool ?? false
        )
    }

    /// `/_matrix/client/v3/pushrules/global/<kind>/<ruleId>`; rule ids are escaped, keywords can
    /// hold any character.
    static func path(kind: String, ruleId: String) -> String {
        "/_matrix/client/v3/pushrules/global/\(kind)/\(escape(ruleId))"
    }

    static func escape(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    /// The body for a new keyword: desktop adds it as Silent with highlight.
    static func keywordBody(_ keyword: String) -> [String: Any] {
        ["actions": actions(for: .silent, highlight: true), "pattern": keyword]
    }

    // MARK: Email notifications (desktop's `useEmailNotifications`)

    struct EmailState: Equatable {
        /// The address the switch is for; nil when the account has none.
        let email: String?
        let enabled: Bool
    }

    /// From `GET /account/3pid` and `GET /pushers`: the email pusher of one of your addresses,
    /// else your first address, switched off.
    static func emailState(threepids: [[String: Any]], pushers: [[String: Any]]) -> EmailState {
        var addresses: [String] = []
        for threepid in threepids where threepid["medium"] as? String == "email" {
            if let address = threepid["address"] as? String { addresses.append(address) }
        }
        guard let first = addresses.first else { return EmailState(email: nil, enabled: false) }
        for pusher in pushers where pusher["app_id"] as? String == "m.email" {
            if let key = pusher["pushkey"] as? String, !key.isEmpty, addresses.contains(key) {
                return EmailState(email: key, enabled: true)
            }
        }
        return EmailState(email: first, enabled: false)
    }

    /// `POST /pushers/set` bodies exactly like desktop: switching on adds an email pusher,
    /// switching off sends `kind: null` for it.
    static func emailPusherBody(email: String, enable: Bool) -> [String: Any] {
        if enable {
            return [
                "kind": "email",
                "app_id": "m.email",
                "pushkey": email,
                "app_display_name": "Email Notifications",
                "device_display_name": email,
                "lang": "en",
                "data": ["brand": "Diddy"] as [String: Any],
            ]
        }
        return ["pushkey": email, "app_id": "m.email", "kind": NSNull()]
    }
}
