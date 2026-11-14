import Foundation

/// A shared song, drawn like iMessage's Apple Music lyrics: the chosen lines large on top, then
/// title, artist, the service and a play button for the 30 second preview.
///
/// It travels in a normal text message under `app.diddy.music` (desktop: `plugins/musicCard.ts`),
/// so other Matrix clients show the plain `body` (lines, title, link). Everything in it comes
/// from other people and is checked here; Foundation only, so `Tools/musiccard_check` can test it.
struct MusicCard: Equatable {
    static let key = "app.diddy.music"
    static let maxLines = 8

    var title: String
    var artist: String
    var album: String?
    /// The song on the service (opened on tap).
    var url: URL
    /// Cover, uploaded to the homeserver (mxc://).
    var artwork: String?
    /// The 30 second preview (Apple's or Spotify's audio host only).
    var preview: URL?
    var lyrics: [String] = []
    /// Where the first line starts in the song, in seconds.
    var time: Double?
    /// "apple", "spotify" or "other".
    var service: String = "other"
    /// Cover on the web, only on the sending side until it is uploaded; never sent.
    var remoteArtwork: URL?

    // MARK: Reading

    init(title: String, artist: String, album: String? = nil, url: URL, artwork: String? = nil, preview: URL? = nil,
         lyrics: [String] = [], time: Double? = nil, service: String = "other", remoteArtwork: URL? = nil) {
        self.title = title
        self.artist = artist
        self.album = album
        self.url = url
        self.artwork = artwork
        self.preview = preview
        self.lyrics = lyrics
        self.time = time
        self.service = service
        self.remoteArtwork = remoteArtwork
    }

    /// The card of a message content (`content[app.diddy.music]`), nil when missing or invalid.
    init?(content: [String: Any]) {
        guard let raw = content[Self.key] as? [String: Any], (raw["v"] as? NSNumber)?.intValue == 1,
              let title = Self.text(raw["title"], max: 200),
              let url = Self.webURL(raw["url"]) else { return nil }
        self.title = title
        artist = Self.text(raw["artist"], max: 200) ?? ""
        album = Self.text(raw["album"], max: 200)
        self.url = url
        if let mxc = raw["artwork"] as? String, Self.isMxc(mxc) { artwork = mxc }
        if let preview = Self.webURL(raw["preview"]), Self.previewAllowed(preview) { self.preview = preview }
        if let lines = raw["lyrics"] as? [Any] {
            lyrics = Array(lines.compactMap { Self.text($0, max: 200) }.prefix(Self.maxLines))
        }
        if let seconds = (raw["time"] as? NSNumber)?.doubleValue, seconds.isFinite, seconds >= 0, seconds < 86_400 { time = seconds }
        let service = raw["service"] as? String
        self.service = ["apple", "spotify"].contains(service ?? "") ? service! : "other"
    }

    /// The card of a raw event as the SDK keeps it; an edit's new content wins.
    static func card(originalJson: String?, latestEditJson: String?) -> MusicCard? {
        for json in [latestEditJson, originalJson] {
            guard let json, json.contains(key), let data = json.data(using: .utf8),
                  let event = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let content = event["content"] as? [String: Any] else { continue }
            if let edited = content["m.new_content"] as? [String: Any], let card = MusicCard(content: edited) { return card }
            if let card = MusicCard(content: content) { return card }
        }
        return nil
    }

    static func mightHaveCard(_ json: String?) -> Bool { json?.contains(key) == true }

    // MARK: Writing

    /// The whole message content: the plain text every client shows, and the card.
    func content() -> [String: Any] {
        var card: [String: Any] = ["v": 1, "title": title, "artist": artist, "url": url.absoluteString, "service": service]
        if let album { card["album"] = album }
        if let artwork { card["artwork"] = artwork }
        if let preview { card["preview"] = preview.absoluteString }
        if !lyrics.isEmpty { card["lyrics"] = lyrics }
        if let time { card["time"] = time }
        return ["msgtype": "m.text", "body": body, "format": "org.matrix.custom.html", "formatted_body": html, Self.key: card]
    }

    var heading: String { artist.isEmpty ? title : "\(title) — \(artist)" }

    var body: String {
        var parts: [String] = []
        if !lyrics.isEmpty { parts.append("“" + lyrics.joined(separator: "\n") + "”") }
        parts.append(heading)
        parts.append(url.absoluteString)
        return parts.joined(separator: "\n")
    }

    var html: String {
        var out = ""
        if !lyrics.isEmpty { out += "<blockquote>" + lyrics.map(Self.escape).joined(separator: "<br>") + "</blockquote>" }
        let link = Self.escape(url.absoluteString)
        out += "<p><b>\(Self.escape(title))</b>"
        if !artist.isEmpty { out += " — \(Self.escape(artist))" }
        out += "<br><a href=\"\(link)\">\(link)</a></p>"
        return out
    }

    /// "1:05" for the time a line starts.
    static func clock(_ seconds: Double) -> String {
        let whole = Int(seconds.rounded(.down))
        return "\(whole / 60):" + String(format: "%02d", whole % 60)
    }

    // MARK: Apple Music

    /// The song of an Apple Music link: `music.apple.com/<country>/song/<name>/<id>` or an album
    /// link with `?i=<id>`. Nil for other links (albums, playlists, artists).
    static func appleMusicSong(_ url: URL) -> (id: String, country: String)? {
        guard let host = url.host?.lowercased(), host == "music.apple.com" || host == "itunes.apple.com",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = url.pathComponents.filter { $0 != "/" }
        let country = path.first.map { $0.count == 2 ? $0.lowercased() : "us" } ?? "us"
        if let item = components.queryItems?.first(where: { $0.name == "i" })?.value, isDigits(item) { return (item, country) }
        if let index = path.firstIndex(of: "song"), let last = path.last, index < path.count - 1, isDigits(last) { return (last, country) }
        return nil
    }

    /// The iTunes lookup address for a song (free, no account).
    static func lookupURL(id: String, country: String) -> URL? {
        URL(string: "https://itunes.apple.com/lookup?id=\(id)&country=\(country)&entity=song")
    }

    /// A card from the answer of the iTunes lookup.
    static func fromLookup(_ json: [String: Any], link: URL) -> MusicCard? {
        guard let results = json["results"] as? [[String: Any]],
              let song = results.first(where: { $0["wrapperType"] as? String == "track" }) ?? results.first,
              let title = text(song["trackName"], max: 200) else { return nil }
        var card = MusicCard(title: title, artist: text(song["artistName"], max: 200) ?? "", album: text(song["collectionName"], max: 200),
                             url: link, service: "apple")
        if let preview = webURL(song["previewUrl"]), previewAllowed(preview) { card.preview = preview }
        if let small = song["artworkUrl100"] as? String {
            card.remoteArtwork = URL(string: small.replacingOccurrences(of: "100x100bb", with: "600x600bb"))
        }
        return card
    }

    /// The lines someone shared together with a link: everything but the link itself, quotes and
    /// the "— Song by Artist" or "Apple Music" lines a share may add.
    static func lyrics(from text: String, card: MusicCard?) -> [String] {
        var lines: [String] = []
        for raw in text.components(separatedBy: .newlines) {
            var line = raw.trimmingCharacters(in: .whitespaces)
            line = line.trimmingCharacters(in: CharacterSet(charactersIn: "\"“”„«»'"))
            line = line.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty, !line.lowercased().hasPrefix("http") else { continue }
            let lower = line.lowercased()
            if lower == "apple music" || lower.hasSuffix("on apple music") || lower.hasSuffix("bei apple music") { continue }
            if let card {
                let titled = lower.contains(card.title.lowercased())
                let byArtist = !card.artist.isEmpty && lower.contains(card.artist.lowercased())
                if titled && (byArtist || line.hasPrefix("—") || line.hasPrefix("-")) { continue }
            }
            lines.append(String(line.prefix(200)))
        }
        return Array(lines.prefix(maxLines))
    }

    // MARK: Checks

    /// Preview audio may only come from the services' own audio hosts.
    static func previewAllowed(_ url: URL) -> Bool {
        guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
        return host.hasSuffix(".itunes.apple.com") || host.hasSuffix(".mzstatic.com") || host == "p.scdn.co"
    }

    static func text(_ value: Any?, max: Int) -> String? {
        guard let value = value as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(max))
    }

    static func webURL(_ value: Any?) -> URL? {
        guard let string = value as? String, string.count <= 2000, let url = URL(string: string),
              url.scheme == "https", url.host?.isEmpty == false else { return nil }
        return url
    }

    static func isMxc(_ value: String) -> Bool {
        value.hasPrefix("mxc://") && value.count <= 255 && value.dropFirst(6).contains("/")
    }

    private static func isDigits(_ value: String) -> Bool { !value.isEmpty && value.allSatisfy(\.isASCII) && value.allSatisfy(\.isNumber) }

    private static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }
}
