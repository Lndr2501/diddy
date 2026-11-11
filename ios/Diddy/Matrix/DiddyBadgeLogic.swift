import Foundation

/// Creating, giving and deleting badges, with desktop's rules (`BadgeEditor.tsx`, `profiles.ts`,
/// `trust.ts`): the event contents, the ids, what makes a badge valid, when it already exists in the
/// library and who may delete it. Foundation only, so `Tools/badge_check` tests it without the app.
/// The writing itself (state for admins, message mode for everyone else) is in `DiddyBadges.swift`.
enum DiddyBadgeLogic {
    static let defaultColor = "#7AA2F7"
    /// `MAX_EMOJI_CODEPOINTS`: one emoji, a few code points for flags and sequences.
    static let maxEmojiCodePoints = 6
    static let maxNameLength = 32
    static let maxShown = DiddyProfileRules.maxShownBadges

    // MARK: Ids and events

    /// `makeBadgeId`: `c.<creator tag>.<time in base 36><random>`, so only the creator can define it.
    static func makeBadgeId(userId: String, now: Int64, random: String) -> String {
        "c.\(DiddyTrust.ownerTag(userId)).\(String(max(0, now), radix: 36))\(random)"
    }

    /// Four base 36 characters like `Math.random().toString(36).slice(2, 6)`.
    static func randomSuffix() -> String {
        let value = Int.random(in: 0..<(36 * 36 * 36 * 36))
        let text = String(value, radix: 36)
        return String(repeating: "0", count: 4 - text.count) + text
    }

    /// `awardStateKey`
    static func awardKey(badgeId: String, userId: String) -> String { "\(badgeId)|\(userId)" }

    /// The content of a new custom badge (`createCustomBadge`): an image replaces the emoji.
    static func definitionContent(name: String, emoji: String, imageMxc: String?, color: String, createdBy: String) -> [String: Any] {
        var out: [String: Any] = ["name": name, "color": color, "createdBy": createdBy]
        if let imageMxc { out["imageMxc"] = imageMxc } else { out["emoji"] = emoji }
        return out
    }

    /// The content of an award (`awardBadge`); an empty object takes it back (`revokeBadge`).
    static func awardContent(by: String, at: Int64) -> [String: Any] { ["by": by, "at": at] }

    // MARK: Creating

    /// Code points, like `Array.from(text).length` of desktop.
    static func emojiTooLong(_ emoji: String) -> Bool {
        emoji.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars.count > maxEmojiCodePoints
    }

    static func normalizedColor(_ color: String?) -> String {
        (color ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// `canCreate` of the editor: a name and an image or a valid emoji.
    static func canCreate(name: String, emoji: String, hasImage: Bool, busy: Bool) -> Bool {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmoji = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmedName.isEmpty && (hasImage || (!trimmedEmoji.isEmpty && !emojiTooLong(emoji))) && !busy
    }

    /// The badge that is the same as the one being created: same name (any case), or the same emoji
    /// in the same colour (no image).
    static func duplicate(name: String, emoji: String, hasImage: Bool, color: String, in library: [DiddyBadge]) -> DiddyBadge? {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmoji = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
        return library.first { badge in
            if !trimmedName.isEmpty,
               badge.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == trimmedName.lowercased() { return true }
            return !hasImage && !trimmedEmoji.isEmpty && badge.emoji == trimmedEmoji
                && normalizedColor(badge.color) == normalizedColor(color)
        }
    }

    // MARK: Library

    /// Only the creator can delete a custom badge (`canDelete`).
    static func canDelete(_ badge: DiddyBadge, me: String) -> Bool {
        !badge.isGlobal && badge.createdBy == me
    }

    static func filtered(_ library: [DiddyBadge], query: String) -> [DiddyBadge] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return needle.isEmpty ? library : library.filter { $0.name.lowercased().contains(needle) }
    }

    /// "Built-in", or "by <name>" with the display name, else the user id's local part.
    static func authorLabel(_ badge: DiddyBadge, displayName: String?) -> String {
        if badge.isGlobal { return "Built-in" }
        guard let creator = badge.createdBy else { return "by unknown" }
        if let displayName, !displayName.isEmpty { return "by \(displayName)" }
        let local = creator.drop(while: { $0 == "@" }).split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        return "by \(local.isEmpty ? creator : local)"
    }

    /// The badges you own, as a short summary line for the library card.
    static func summary(owned: Int, total: Int) -> String {
        "Built-in and community badges. You own \(owned) of \(total)."
    }
}
