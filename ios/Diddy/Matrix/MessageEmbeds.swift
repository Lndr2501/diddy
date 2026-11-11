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

/// The homeserver's OpenGraph data for a link (`/_matrix/client/v1/media/preview_url`).
struct LinkPreviewData: Hashable {
    var title: String?
    var description: String?
    var siteName: String?
    /// The preview picture, an `mxc://` URL the homeserver stored.
    var imageURL: String?

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
        // Desktop shows an empty card too; here nothing at all is less noise.
        if title == nil, description == nil, imageURL == nil { return nil }
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
