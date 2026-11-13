import Foundation

/// How the share extension (`DiddyShare`) hands what you shared to the app: the files and a small
/// manifest go into the app group's folder, then the extension opens `diddy://share?id=<uuid>`.
/// Without an app group (the signing gave none) text and links still travel inside the link
/// itself: `diddy://share?text=…&url=…`. Foundation only; the extension and the app both use it.
enum ShareHandoff {
    static let scheme = "diddy"

    /// What one share contains, written by the extension as `manifest.json`.
    struct Manifest: Codable, Equatable {
        struct File: Codable, Equatable {
            /// Name inside the share's folder.
            var stored: String
            /// Name to send it under.
            var name: String
            var mime: String
        }
        var files: [File] = []
        var text: String?
        var urls: [String] = []
        /// The type identifiers that came in, for the diagnostics log.
        var types: [String] = []
        var created = Date()
    }

    enum Request: Equatable {
        case stored(id: String)
        case inline(text: String?, urls: [String])
    }

    /// `group.<app bundle id>`: what the sideloader gives app and extension (the extension's id is
    /// the app's plus `.share`).
    static func groupId(bundleId: String) -> String {
        let app = bundleId.hasSuffix(".share") ? String(bundleId.dropLast(".share".count)) : bundleId
        return "group." + app
    }

    static func folder(bundleId: String) -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId(bundleId: bundleId))?
            .appendingPathComponent("Shares", isDirectory: true)
    }

    static func storedURL(id: String) -> URL {
        URL(string: "\(scheme)://share?id=\(id)")!
    }

    /// Text and links inside the link, cut so the whole stays well below URL limits.
    static func inlineURL(text: String?, urls: [String]) -> URL? {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "share"
        var items: [URLQueryItem] = []
        if let text, !text.isEmpty { items.append(URLQueryItem(name: "text", value: String(text.prefix(4000)))) }
        for url in urls.prefix(5) where url.count <= 2000 { items.append(URLQueryItem(name: "url", value: url)) }
        guard !items.isEmpty else { return nil }
        components.queryItems = items
        return components.url
    }

    static func request(from url: URL) -> Request? {
        guard url.scheme == scheme, url.host == "share",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        if let id = items.first(where: { $0.name == "id" })?.value {
            return UUID(uuidString: id) != nil ? .stored(id: id) : nil
        }
        let text = items.first(where: { $0.name == "text" })?.value
        let urls = items.filter { $0.name == "url" }.compactMap(\.value)
        guard text != nil || !urls.isEmpty else { return nil }
        return .inline(text: text, urls: urls)
    }

    /// Only the last path component, never empty.
    static func safeFileName(_ name: String) -> String {
        let last = (name as NSString).lastPathComponent.replacingOccurrences(of: "/", with: "_")
        let trimmed = last.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed == "." || trimmed == ".." ? "file" : String(trimmed.prefix(120))
    }

    // MARK: Folder

    static func write(_ manifest: Manifest, id: String, in folder: URL) throws {
        let dir = folder.appendingPathComponent(id, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(manifest)
        try data.write(to: dir.appendingPathComponent("manifest.json"), options: .atomic)
    }

    static func read(id: String, in folder: URL) -> (manifest: Manifest, dir: URL)? {
        let dir = folder.appendingPathComponent(id, isDirectory: true)
        guard let data = try? Data(contentsOf: dir.appendingPathComponent("manifest.json")),
              let manifest = try? JSONDecoder().decode(Manifest.self, from: data) else { return nil }
        return (manifest, dir)
    }

    /// Shares older than a day are left-overs (the app never opened, or the chat was not chosen).
    static func removeOld(in folder: URL, keeping: String? = nil) {
        guard let entries = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.creationDateKey]) else { return }
        let limit = Date().addingTimeInterval(-86_400)
        for entry in entries where entry.lastPathComponent != keeping {
            let created = (try? entry.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast
            if created < limit { try? FileManager.default.removeItem(at: entry) }
        }
    }
}
