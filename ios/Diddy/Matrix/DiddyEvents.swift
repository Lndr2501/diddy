import Foundation

/// The event types and limits of the Diddy options room (`cinny/src/app/plugins/diddy/types.ts`).
/// Foundation only, so the check tools can use it. How the data is read and written: DiddyProfiles.swift.
enum DiddyEvents {
    static let marker = "app.diddy.options"
    static let profile = "app.diddy.profile"
    static let badge = "app.diddy.badge"
    static let award = "app.diddy.badge_award"
    static let keyField = "app.diddy.key"
    /// Desktop adds this to the topic of the options room so clients can find it in a server.
    static let topicTag = "[diddy-options]"
    static let maxContentBytes = 4096

    /// The length desktop compares with the limit: `JSON.stringify(content).length`, so UTF-16
    /// units and no escaped slashes. (UTF-8 bytes with `\/` made profiles with many mxc:// links,
    /// umlauts or emoji fail here although desktop accepts them.)
    static func jsonLength(_ content: [String: Any]) -> Int? {
        guard let data = try? JSONSerialization.data(withJSONObject: content, options: [.withoutEscapingSlashes]) else { return nil }
        return String(decoding: data, as: UTF8.self).utf16.count
    }
}

/// A badge as it is shown: built-in or custom (`BadgeDef` of types.ts).
struct DiddyBadge: Hashable, Identifiable {
    let id: String
    let name: String
    var emoji: String?
    var imageMxc: String?
    var color: String?
    /// The user id of the creator (custom badges only), the real sender of the definition.
    var createdBy: String?

    /// A built-in badge (`GLOBAL_BADGES`); custom ones always have a creator.
    var isGlobal: Bool { createdBy == nil && id.hasPrefix("g.") }
}
