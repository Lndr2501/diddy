import Foundation

/// User mentions as the different clients send them, turned into the one form the chat renders:
/// a Markdown link to `https://matrix.to/#/@user:server`.
///
/// - Diddy desktop (Cinny) writes the bare user id into the plain body (`ey @lndr:matrix.tllx.eu`)
///   and the link only into the HTML body.
/// - Element writes the display name into the plain body and the link into the HTML body.
/// - Diddy for iOS writes the Markdown link into the plain body.
enum MentionText {
    static let linkPrefix = "https://matrix.to/#/"

    /// A Matrix user id that stands on its own, not inside a link or an email-like word. Swift's
    /// own regexes have no lookbehind, hence NSRegularExpression.
    private static let bareUserId = try? NSRegularExpression(
        pattern: #"(?<![\w/\[(#@])@[a-z0-9._=\-/+]+:[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*(?::[0-9]{1,5})?"#
    )

    /// Replaces every bare user id, from the end so earlier ranges stay valid.
    private static func replacingBareIds(in text: String, with replacement: (String) -> String) -> String {
        guard let regex = bareUserId else { return text }
        var result = text
        let matches = regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
        for match in matches.reversed() {
            guard let range = Range(match.range, in: result) else { continue }
            result.replaceSubrange(range, with: replacement(String(result[range])))
        }
        return result
    }

    /// The user a matrix.to link points at, if it is a user and not a room or event.
    static func userId(in url: URL) -> String? {
        let text = url.absoluteString
        guard text.hasPrefix(linkPrefix) else { return nil }
        var id = String(text.dropFirst(linkPrefix.count))
        id = id.removingPercentEncoding ?? id
        if let end = id.firstIndex(where: { $0 == "?" || $0 == "/" }) { id = String(id[..<end]) }
        guard id.hasPrefix("@"), id.contains(":"), id.count <= 255 else { return nil }
        return id
    }

    static func link(to userId: String) -> String {
        let encoded = userId.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed) ?? userId
        return linkPrefix + encoded
    }

    /// Text that Markdown shows as it is, for a display name inside `[...]`.
    static func escaped(_ name: String) -> String {
        var out = ""
        for char in name {
            if "\\[]()*_`~<>".contains(char) { out.append("\\") }
            out.append(char)
        }
        return out
    }

    /// Every user mentioned in a message, as a link or a bare id.
    static func userIds(in text: String) -> [String] {
        var found: [String] = []
        for match in text.matches(of: #/https://matrix\.to/\#/(@[^)\s?/]+|%40[^)\s?/]+)/#) {
            let id = String(match.1).removingPercentEncoding ?? String(match.1)
            if !found.contains(id) { found.append(id) }
        }
        _ = replacingBareIds(in: text) { id in
            if !found.contains(id) { found.append(id) }
            return id
        }
        return found
    }

    /// Bare user ids become links named after the person, so they read like a mention.
    static func linkingBareIds(in text: String, name: (String) -> String) -> String {
        replacingBareIds(in: text) { id in "[\(escaped("@" + name(id)))](\(link(to: id)))" }
    }

    /// The HTML body of a message as Markdown, but only when it carries a mention the plain body
    /// may lack (Element). Everything else keeps using the plain body, which every client fills.
    static func markdown(fromHTML html: String) -> String? {
        guard html.contains("matrix.to/#/@") || html.contains("matrix.to/#/%40") else { return nil }
        var text = html
        // The quoted message of a reply is shown separately.
        text = text.replacing(#/(?s)<mx-reply>.*?</mx-reply>/#, with: "")
        text = text.replacing(#/(?i)<br\s*/?>/#, with: "\n")
        text = text.replacing(#/(?i)</p>\s*<p>/#, with: "\n\n")
        text = text.replacing(#/(?i)<li>/#, with: "• ")
        text = text.replacing(#/(?i)</(li|p|blockquote|pre|h[1-6])>/#, with: "\n")
        text = text.replacing(#/(?i)</?(strong|b)>/#, with: "**")
        text = text.replacing(#/(?i)</?(em|i)>/#, with: "_")
        text = text.replacing(#/(?i)</?(del|s|strike)>/#, with: "~~")
        text = text.replacing(#/(?i)</?code>/#, with: "`")
        text = text.replacing(#/(?is)<a\s[^>]*href="([^"]*)"[^>]*>(.*?)</a>/#) { match in
            let label = String(match.2).replacing(#/<[^>]+>/#, with: "")
            return "[\(label)](\(match.1))"
        }
        text = text.replacing(#/<[^>]+>/#, with: "")
        for (entity, char) in [("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&#x27;", "'"), ("&nbsp;", " "), ("&amp;", "&")] {
            text = text.replacingOccurrences(of: entity, with: char)
        }
        text = text.replacing(#/\n{3,}/#, with: "\n\n")
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// For one-line previews: `@lndr:matrix.tllx.eu` and Markdown mention links read as `@Lndr`.
    static func readable(_ text: String, name: (String) -> String) -> String {
        let links = text.replacing(#/\[([^\]]+)\]\(https://matrix\.to/\#/@[^)\s]+\)/#) { match in
            let label = String(match.1).replacingOccurrences(of: "\\", with: "")
            return label.hasPrefix("@") ? label : "@" + label
        }
        return replacingBareIds(in: links) { "@" + name($0) }
    }
}
