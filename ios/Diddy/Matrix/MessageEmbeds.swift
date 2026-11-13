import Foundation

/// Link previews, locations and sticker sizes the way the desktop app shows them. Foundation only,
/// so `Tools/richtext_check` can test it.

enum LinkPreviewURLs {
    /// At most this many previews under one message; desktop shows all, a phone has less room.
    static let limit = 2

    /// The web links of a message body for previews, like desktop's `URL_REG`: `http(s)://` up to
    /// a space or `)`, without trailing punctuation, no repeats and no matrix.to links.
    static func find(in body: String, limit: Int = LinkPreviewURLs.limit) -> [String] {
        let chars = Array(body)
        var found: [String] = []
        var i = 0
        while i < chars.count, found.count < limit {
            guard chars[i] == "h", let scheme = schemeLength(chars, at: i) else {
                i += 1
                continue
            }
            var end = i + scheme
            while end < chars.count, !chars[end].isWhitespace, chars[end] != ")" {
                // `[label](url)` from a Markdown body: the link ends before the label's bracket.
                if chars[end] == "]", end + 1 < chars.count, chars[end + 1] == "(" { break }
                end += 1
            }
            var last = end
            while last > i + scheme, trailing.contains(chars[last - 1]) { last -= 1 }
            if last > i + scheme {
                let url = String(chars[i..<last])
                if !isMatrixTo(url), !found.contains(url) { found.append(url) }
            }
            i = max(end, i + 1)
        }
        return found
    }

    private static let trailing = Set(".,:;!/?()[]")

    private static func schemeLength(_ chars: [Character], at i: Int) -> Int? {
        for prefix in ["https://", "http://"] {
            let count = prefix.count
            if i + count <= chars.count, String(chars[i..<(i + count)]).lowercased() == prefix { return count }
        }
        return nil
    }

    /// Desktop's `testMatrixTo`: links to people, rooms and events are mentions, not web pages.
    static func isMatrixTo(_ url: String) -> Bool {
        let lower = url.lowercased()
        return lower.hasPrefix("https://matrix.to/") || lower.hasPrefix("http://matrix.to/")
    }
}

/// OpenGraph data for a link card: from the homeserver (`/_matrix/client/v1/media/preview_url`) or
/// read by the app itself (`LinkPageMeta`), like desktop's `linkEmbeds.ts` (#197).
struct LinkPreviewData: Hashable {
    var title: String?
    var description: String?
    var siteName: String?
    /// The preview picture: an `mxc://` URL the homeserver stored, or the page's own `https://` picture.
    var imageURL: String?
    /// The page's `theme-color` (`#rrggbb`), the card's accent stripe.
    var color: String?

    init(title: String?, description: String?, siteName: String?, imageURL: String?, color: String? = nil) {
        self.title = title
        self.description = description
        self.siteName = siteName
        self.imageURL = imageURL
        self.color = color
    }

    var isEmpty: Bool { title == nil && description == nil && imageURL == nil }

    init?(json: String) {
        guard let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let fields = object as? [String: Any] else { return nil }
        func text(_ key: String, limit: Int) -> String? {
            guard let value = fields[key] as? String else { return nil }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            return trimmed.count > limit ? String(trimmed.prefix(limit)) + "…" : trimmed
        }
        title = text("og:title", limit: 300)
        description = text("og:description", limit: 600)
        siteName = text("og:site_name", limit: 100)
        if let image = fields["og:image"] as? String, image.hasPrefix("mxc://") { imageURL = image }
        color = nil
        // Desktop shows an empty card too; here nothing at all is less noise.
        if title == nil, description == nil, imageURL == nil { return nil }
    }
}

/// Which links show a picture or may be read by the app itself; same rules as desktop's
/// `isImageLink` and `isPublicHost` in `linkEmbeds.ts` (#197, #198).
enum LinkEmbedRules {
    private static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "avif", "apng", "bmp"]
    private static let imageHosts: Set<String> = ["i.imgur.com", "media.tenor.com", "media.giphy.com", "i.giphy.com", "pbs.twimg.com"]
    private static let localSuffixes = [".local", ".lan", ".home", ".internal", ".intranet", ".corp", ".home.arpa"]

    /// A link straight to a picture: the chat shows the picture itself.
    static func isImageLink(_ raw: String) -> Bool {
        guard let url = URL(string: raw), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host?.lowercased(), isPublicHost(host) else { return false }
        let ext = url.pathExtension.lowercased()
        if imageExtensions.contains(ext) { return true }
        if host == "pbs.twimg.com" { return url.path.hasPrefix("/media/") }
        return imageHosts.contains(host) && (3...4).contains(ext.count)
    }

    /// Whether the app may fetch from this host: never the user's own network (router, NAS,
    /// `localhost`), whatever a chat link says.
    static func isPublicHost(_ hostname: String) -> Bool {
        var host = hostname.lowercased()
        if host.hasPrefix("[") { host.removeFirst() }
        if host.hasSuffix("]") { host.removeLast() }
        if host.hasSuffix(".") { host.removeLast() }
        if host.isEmpty || host == "localhost" || host.hasSuffix(".localhost") { return false }
        if localSuffixes.contains(where: { host.hasSuffix($0) }) { return false }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        if parts.count == 4, parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isNumber) }) {
            let n = parts.compactMap { Int($0) }
            guard n.count == 4, n.allSatisfy({ (0...255).contains($0) }) else { return false }
            let (a, b) = (n[0], n[1])
            if a == 0 || a == 10 || a == 127 || a >= 224 { return false }
            if a == 169 && b == 254 { return false }
            if a == 172 && (16...31).contains(b) { return false }
            if a == 192 && b == 168 { return false }
            if a == 100 && (64...127).contains(b) { return false }
            return true
        }
        if host.contains(":") {
            if host == "::" || host == "::1" || host.hasPrefix("::ffff:") { return false }
            return !["fc", "fd", "fe8", "fe9", "fea", "feb"].contains(where: { host.hasPrefix($0) })
        }
        return host.contains(".")
    }

    static func isFetchable(_ raw: String) -> Bool {
        guard let url = URL(string: raw), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host else { return false }
        return isPublicHost(host)
    }
}

/// Reads a page's OpenGraph data (with Twitter card, `<title>` and description fallbacks), like
/// desktop's `parseLinkMeta`. The app fetches the page itself in encrypted chats and when the
/// homeserver has no preview (#197).
enum LinkPageMeta {
    private static let headLimit = 512 * 1024

    static func parse(html: String, pageURL: String) -> LinkPreviewData? {
        var head = String(html.prefix(headLimit))
        if let end = head.range(of: "</head", options: .caseInsensitive) ?? head.range(of: "<body", options: .caseInsensitive) {
            head = String(head[..<end.lowerBound])
        }
        var meta: [String: String] = [:]
        for tag in matches(#"<meta\b[^>]*>"#, in: head) {
            let attrs = attributes(tag)
            let key = (attrs["property"] ?? attrs["name"] ?? attrs["itemprop"] ?? "").lowercased()
            if !key.isEmpty, let content = attrs["content"], meta[key] == nil { meta[key] = content }
        }
        let titleTag = firstGroup(#"<title[^>]*>([\s\S]*?)</title>"#, in: head)
        var data = LinkPreviewData(
            title: clean(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, limit: 300),
            description: clean(meta["og:description"] ?? meta["twitter:description"] ?? meta["description"], limit: 600),
            siteName: clean(meta["og:site_name"] ?? meta["application-name"], limit: 100),
            imageURL: absoluteHTTP(meta["og:image"] ?? meta["og:image:url"] ?? meta["og:image:secure_url"] ?? meta["twitter:image"], base: pageURL)
        )
        if let color = meta["theme-color"]?.trimmingCharacters(in: .whitespaces),
           color.range(of: #"^#[0-9a-fA-F]{3,8}$"#, options: .regularExpression) != nil {
            data.color = color
        }
        return data.isEmpty ? nil : data
    }

    static func decodeEntities(_ text: String) -> String {
        guard text.contains("&") else { return text }
        let named = ["amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " "]
        var out = ""
        var rest = Substring(text)
        while let amp = rest.firstIndex(of: "&") {
            out += rest[..<amp]
            let after = rest[rest.index(after: amp)...]
            if let semi = after.firstIndex(of: ";"), after.distance(from: after.startIndex, to: semi) <= 10 {
                let code = String(after[..<semi])
                var replacement: String?
                if code.hasPrefix("#x") || code.hasPrefix("#X") {
                    replacement = UInt32(code.dropFirst(2), radix: 16).flatMap(Unicode.Scalar.init).map { String(Character($0)) }
                } else if code.hasPrefix("#") {
                    replacement = UInt32(code.dropFirst()).flatMap(Unicode.Scalar.init).map { String(Character($0)) }
                } else {
                    replacement = named[code.lowercased()]
                }
                if let replacement {
                    out += replacement
                    rest = after[after.index(after: semi)...]
                    continue
                }
            }
            out += "&"
            rest = after
        }
        return out + rest
    }

    private static func clean(_ value: String?, limit: Int) -> String? {
        guard let value else { return nil }
        let text = decodeEntities(value)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        guard !text.isEmpty else { return nil }
        return text.count > limit ? String(text.prefix(limit)) + "…" : text
    }

    private static func absoluteHTTP(_ value: String?, base: String) -> String? {
        guard let value, let baseURL = URL(string: base),
              let url = URL(string: decodeEntities(value.trimmingCharacters(in: .whitespacesAndNewlines)), relativeTo: baseURL)?.absoluteURL,
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host, LinkEmbedRules.isPublicHost(host) else { return nil }
        return url.absoluteString
    }

    private static func matches(_ pattern: String, in text: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let ns = text as NSString
        return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) }
    }

    private static func firstGroup(_ pattern: String, in text: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let ns = text as NSString
        guard let m = re.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)), m.numberOfRanges > 1,
              m.range(at: 1).location != NSNotFound else { return nil }
        return ns.substring(with: m.range(at: 1))
    }

    private static func attributes(_ tag: String) -> [String: String] {
        guard let re = try? NSRegularExpression(pattern: #"([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))"#) else { return [:] }
        let ns = tag as NSString
        var found: [String: String] = [:]
        for m in re.matches(in: tag, range: NSRange(location: 0, length: ns.length)) {
            let name = ns.substring(with: m.range(at: 1)).lowercased()
            for group in 3...5 where m.range(at: group).location != NSNotFound {
                found[name] = ns.substring(with: m.range(at: group))
                break
            }
            if found[name] == nil { found[name] = "" }
        }
        return found
    }
}

/// `m.location` (desktop `MLocation`): `geo:52.52,13.40;u=35`.
struct GeoLocation: Hashable {
    let latitude: Double
    let longitude: Double

    init?(geoURI: String) {
        let trimmed = geoURI.trimmingCharacters(in: .whitespaces)
        guard trimmed.lowercased().hasPrefix("geo:") else { return nil }
        let data = trimmed.dropFirst(4)
        let coordinates = data.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first ?? ""
        let parts = coordinates.split(separator: ",", omittingEmptySubsequences: false)
        guard parts.count >= 2,
              let latitude = Double(parts[0].trimmingCharacters(in: .whitespaces)),
              let longitude = Double(parts[1].trimmingCharacters(in: .whitespaces)),
              latitude.isFinite, longitude.isFinite,
              (-90...90).contains(latitude), (-180...180).contains(longitude) else { return nil }
        self.latitude = latitude
        self.longitude = longitude
    }

    /// The same map desktop opens.
    var openStreetMapURL: URL? {
        URL(string: "https://www.openstreetmap.org/?mlat=\(latitude)&mlon=\(longitude)#map=16/\(latitude)/\(longitude)")
    }

    func appleMapsURL(label: String?) -> URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        var items = [URLQueryItem(name: "ll", value: "\(latitude),\(longitude)")]
        if let label, !label.isEmpty { items.append(URLQueryItem(name: "q", value: label)) }
        components?.queryItems = items
        return components?.url
    }
}

enum MessageMediaSize {
    /// Desktop's `MSticker`: 152 points wide, the height to scale, at least 48.
    static func sticker(width: Double?, height: Double?) -> (width: Double, height: Double) {
        let w = (width ?? 0) > 0 ? width! : 152
        let h = (height ?? 0) > 0 ? height! : 152
        let scaled = 152 / w * h
        guard scaled.isFinite else { return (152, 152) }
        // Very tall stickers would fill the chat; desktop has no cap, three widths is plenty.
        return (152, min(max(scaled, 48), 456))
    }

    /// Width over height of a picture or video, sane when the sender gave odd or no sizes.
    static func aspect(width: Double?, height: Double?) -> Double {
        guard let width, let height, width > 0, height > 0 else { return 4.0 / 3.0 }
        let ratio = width / height
        guard ratio.isFinite else { return 4.0 / 3.0 }
        return min(max(ratio, 0.4), 3)
    }
}
