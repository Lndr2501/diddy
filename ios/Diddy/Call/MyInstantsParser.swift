import Foundation

/// Pure parts of the MyInstants import (Foundation only, so it can be tested on its own). The
/// counterpart of `cinny/src/app/plugins/myinstants.ts`: what the user typed, the search URL, and the
/// sound list inside the HTML that myinstants.com answers with.
enum MyInstantsParser {
    static let origin = "https://www.myinstants.com"
    static let hosts: Set<String> = ["www.myinstants.com", "myinstants.com"]
    /// Only links of the sound files themselves are followed.
    private static let soundPath = try! NSRegularExpression(pattern: #"^/media/sounds/[^?#\s'"<>\\]+$"#)

    struct Item: Identifiable, Hashable {
        /// Path of the sound file, e.g. `/media/sounds/xyz.mp3`.
        let path: String
        let name: String
        var id: String { path }
    }

    struct SearchPage: Equatable {
        var items: [Item]
        /// myinstants.com loads further pages while scrolling and has no "next" link, so a page
        /// that is (nearly) full means there may be more.
        var hasNext: Bool
    }

    enum Target: Equatable {
        case search(name: String, page: Int)
        case instant(url: URL)
    }

    /// A normal results page has this many sounds; a clearly shorter page is the last one.
    static let fullPage = 20

    /// A search term, a MyInstants search link, or the link of a single sound.
    static func parseInput(_ input: String) -> Target? {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let lower = text.lowercased()
        guard lower.hasPrefix("http://") || lower.hasPrefix("https://") else {
            return .search(name: String(text.prefix(100)), page: 1)
        }
        guard let url = URL(string: text), let host = url.host?.lowercased(), hosts.contains(host) else { return nil }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let path = components?.percentEncodedPath ?? url.path
        if path.hasSuffix("/search") || path.hasSuffix("/search/") {
            let items = components?.queryItems ?? []
            guard let name = items.first(where: { $0.name == "name" })?.value?
                .trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else { return nil }
            let page = Int(items.first(where: { $0.name == "page" })?.value ?? "") ?? 1
            return .search(name: String(name.prefix(100)), page: max(1, page))
        }
        if path.contains("/instant/"), let page = URL(string: origin + path) {
            return .instant(url: page)
        }
        return nil
    }

    static func searchURL(name: String, page: Int) -> URL? {
        var components = URLComponents(string: origin + "/en/search/")
        components?.queryItems = [URLQueryItem(name: "name", value: name), URLQueryItem(name: "page", value: String(max(1, page)))]
        return components?.url
    }

    /// The https URL of a sound file, or nil for anything that is not a plain myinstants.com sound path.
    static func soundURL(path: String) -> URL? {
        guard isSoundPath(path) else { return nil }
        if let url = URL(string: origin + path) { return url }
        let allowed = CharacterSet.urlPathAllowed.union(CharacterSet(charactersIn: "%"))
        guard let encoded = path.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: origin + encoded)
    }

    static func isSoundPath(_ path: String) -> Bool {
        guard !path.contains(".."), path.utf8.count <= 300 else { return false }
        return soundPath.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)) != nil
    }

    /// The sounds of a search results page, in order, without duplicates.
    static func parseSearch(html: String) -> SearchPage {
        var items: [Item] = []
        var seen = Set<String>()
        // Every sound is a `<div class="instant">` block with a play button and a name link.
        for block in html.components(separatedBy: #"<div class="instant""#).dropFirst() {
            let block = String(block.prefix(4000))
            guard let path = firstCapture(#"play\('([^']+)'"#, in: block), isSoundPath(path),
                  let nameHTML = firstCapture(#"<a [^>]*class="[^"]*instant-link[^"]*"[^>]*>(.*?)</a>"#, in: block)
            else { continue }
            let name = cleanName(nameHTML)
            guard !name.isEmpty, seen.insert(path).inserted else { continue }
            items.append(Item(path: path, name: name))
        }
        let hasNext = html.contains(#"rel="next""#) || items.count >= fullPage
        return SearchPage(items: items, hasNext: hasNext)
    }

    /// The sound on a single sound page (`/en/instant/<slug>/`), or nil.
    static func parseInstantPage(html: String, url: URL) -> Item? {
        guard let path = firstCapture(#"play\('(/media/sounds/[^']+)'"#, in: html), isSoundPath(path) else { return nil }
        var name = ""
        if let heading = firstCapture(#"<h1[^>]*>(.*?)</h1>"#, in: html) { name = cleanName(heading) }
        if name.isEmpty {
            let slug = url.pathComponents.last(where: { $0 != "/" }) ?? "sound"
            name = cleanName(slug.removingPercentEncoding ?? slug)
        }
        return name.isEmpty ? nil : Item(path: path, name: name)
    }

    // MARK: Names

    /// A name for the soundboard: tags and entities resolved, white space collapsed, control and
    /// formatting characters removed, at most 40 characters (like the desktop). Never empty.
    static func clipTitle(_ raw: String) -> String {
        let name = cleanName(raw)
        let title = String(name.prefix(40)).trimmingCharacters(in: .whitespaces)
        return title.isEmpty ? "Clip" : title
    }

    /// Text of an HTML snippet: tags dropped, entities decoded, white space collapsed.
    static func cleanName(_ html: String) -> String {
        var text = html.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
        text = decodeEntities(text)
        let kept = text.unicodeScalars.filter { scalar in
            switch scalar.properties.generalCategory {
            case .control, .format, .lineSeparator, .paragraphSeparator, .surrogate, .privateUse, .unassigned:
                return scalar.properties.isWhitespace   // tabs and line breaks become spaces below
            default:
                return true
            }
        }
        let flat = String(String.UnicodeScalarView(kept))
        return flat.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
    }

    private static let named: [String: String] = [
        "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ",
    ]

    static func decodeEntities(_ text: String) -> String {
        guard text.contains("&") else { return text }
        var result = ""
        var rest = Substring(text)
        while let amp = rest.firstIndex(of: "&") {
            result += rest[..<amp]
            let tail = rest[rest.index(after: amp)...]
            if let semi = tail.prefix(10).firstIndex(of: ";"), let decoded = decode(String(tail[..<semi])) {
                result += decoded
                rest = tail[tail.index(after: semi)...]
            } else {
                result += "&"
                rest = tail
            }
        }
        return result + rest
    }

    private static func decode(_ entity: String) -> String? {
        if let value = named[entity.lowercased()] { return value }
        guard entity.hasPrefix("#") else { return nil }
        let digits = entity.dropFirst()
        let code: UInt32?
        if digits.hasPrefix("x") || digits.hasPrefix("X") {
            code = UInt32(digits.dropFirst(), radix: 16)
        } else {
            code = UInt32(digits, radix: 10)
        }
        guard let code, let scalar = Unicode.Scalar(code) else { return nil }
        return String(Character(scalar))
    }

    private static func firstCapture(_ pattern: String, in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              match.numberOfRanges > 1, let range = Range(match.range(at: 1), in: text)
        else { return nil }
        return String(text[range])
    }
}
