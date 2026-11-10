import CryptoKit
import Foundation

/// The plugin list, the HTML of local plugins and the key/value data of every plugin, all on this
/// device (like the desktop's localStorage/IndexedDB; nothing is synced and no Matrix data is
/// involved). Files live in Application Support/Plugins:
///   plugins.json          the list
///   local/<id>.json       content of a local plugin (HTML, hash, origin)
///   data/<id>.json        what the plugin saved through `diddy:storage:set`
@MainActor
final class PluginStore: ObservableObject {
    static let shared = PluginStore()

    /// A built-in plugin from the folder `builtin` in the app bundle (`cinny/src/app/plugins/builtin`).
    struct Builtin: Identifiable {
        let slug: String
        let name: String
        let description: String
        var id: String { slug }
    }

    /// Same catalog as the desktop's `builtinPlugins.ts`.
    static let builtins: [Builtin] = [
        .init(slug: "clock", name: "Clock", description: "Time and date, with a second time zone."),
        .init(slug: "weather", name: "Weather", description: "Current weather and a 4-day forecast."),
        .init(slug: "timer", name: "Focus timer", description: "Pomodoro and a free countdown."),
        .init(slug: "notes", name: "Notes", description: "A quick notepad that saves itself."),
        .init(slug: "todo", name: "To-do", description: "A short task list."),
        .init(slug: "currency", name: "Currency", description: "Convert between common currencies."),
        .init(slug: "dice", name: "Dice", description: "Dice and coin for game nights."),
        .init(slug: "calendar", name: "Calendar", description: "A month at a glance."),
    ]

    struct LocalRecord: Codable, Equatable {
        enum Origin: String, Codable { case file, paste, github, gist }
        var html: String
        var sha256: String
        var size: Int
        var origin: Origin
        var updatedAt: Double
        var fileName: String?
        var sourceUrl: String?
        var rawUrl: String?
    }

    @Published private(set) var plugins: [UserPlugin]
    var activePlugins: [UserPlugin] { plugins.filter(\.enabled) }

    private let root: URL
    private var dataCache: [String: [String: String]] = [:]
    private let writeQueue = DispatchQueue(label: "app.diddy.ios.plugins")

    init(root: URL? = nil) {
        let base = root ?? (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory).appendingPathComponent("Plugins", isDirectory: true)
        self.root = base
        for sub in ["local", "data"] {
            try? FileManager.default.createDirectory(at: base.appendingPathComponent(sub, isDirectory: true), withIntermediateDirectories: true)
        }
        var stored: [UserPlugin] = []
        if let data = try? Data(contentsOf: base.appendingPathComponent("plugins.json")),
           let decoded = try? JSONDecoder().decode([UserPlugin].self, from: data) {
            stored = decoded
        }
        plugins = PluginRegistry.sanitize(stored)
    }

    // MARK: Registry

    private func persist() {
        guard let data = try? JSONEncoder().encode(plugins) else { return }
        let url = root.appendingPathComponent("plugins.json")
        writeQueue.async { try? data.write(to: url, options: .atomic) }
    }

    private func apply(_ result: Result<[UserPlugin], PluginError>) throws {
        plugins = try result.get()
        persist()
    }

    private static var nowMillis: Double { (Date().timeIntervalSince1970 * 1000).rounded() }
    private static func newId() -> String { UUID().uuidString.lowercased() }

    func isAdded(builtin slug: String) -> Bool { plugins.contains { $0.url == PluginRules.builtinPrefix + slug } }

    func addBuiltin(_ item: Builtin) throws {
        try apply(PluginRegistry.addBuiltin(plugins, slug: item.slug, name: item.name, id: Self.newId(), now: Self.nowMillis))
    }

    func addRemote(name: String, address: String) throws {
        try apply(PluginRegistry.add(plugins, name: name, address: address, id: Self.newId(), now: Self.nowMillis))
    }

    /// Adds a plugin without hosting: its HTML is saved on this device. Content is checked first.
    func addLocal(name: String, html: String, origin: LocalRecord.Origin, fileName: String? = nil, link: PluginSourceLink? = nil, sourceUrl: String? = nil) throws {
        let checked = try PluginContent.validate(html).get()
        let id = Self.newId()
        let proposed = PluginText.clean(name).isEmpty
            ? (PluginContent.title(of: checked).nonEmpty ?? fileName.map(PluginContent.name(fromFileName:))?.nonEmpty ?? "Plugin")
            : name
        let next = try PluginRegistry.addLocal(plugins, name: proposed, id: id, now: Self.nowMillis).get()
        let record = LocalRecord(
            html: checked, sha256: Self.sha256(checked), size: checked.utf8.count, origin: origin, updatedAt: Self.nowMillis,
            fileName: fileName, sourceUrl: sourceUrl, rawUrl: link?.rawUrl
        )
        guard let data = try? JSONEncoder().encode(record) else { throw PluginError("Could not save the plugin.") }
        do { try data.write(to: localURL(id), options: .atomic) } catch { throw PluginError("Could not save the plugin on this device.") }
        plugins = next
        persist()
    }

    func setEnabled(_ id: String, _ enabled: Bool) {
        guard let index = plugins.firstIndex(where: { $0.id == id }), plugins[index].enabled != enabled else { return }
        plugins[index].enabled = enabled
        persist()
    }

    func setCustomCss(_ id: String, _ css: String) {
        guard let index = plugins.firstIndex(where: { $0.id == id }) else { return }
        let trimmed = String(css.prefix(PluginRules.maxCustomCSS))
        plugins[index].customCss = trimmed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : trimmed
        persist()
    }

    /// Removes the plugin together with its saved content and data.
    func remove(_ id: String) {
        guard PluginRules.isValidPluginId(id) else { return }
        plugins.removeAll { $0.id == id }
        dataCache[id] = nil
        let local = localURL(id), data = dataURL(id)
        writeQueue.async {
            try? FileManager.default.removeItem(at: local)
            try? FileManager.default.removeItem(at: data)
        }
        persist()
    }

    // MARK: Content

    private func localURL(_ id: String) -> URL { root.appendingPathComponent("local/\(id).json") }
    private func dataURL(_ id: String) -> URL { root.appendingPathComponent("data/\(id).json") }

    static func sha256(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func localRecord(_ id: String) -> LocalRecord? {
        guard PluginRules.isValidPluginId(id), let data = try? Data(contentsOf: localURL(id)) else { return nil }
        return try? JSONDecoder().decode(LocalRecord.self, from: data)
    }

    static func builtinHtml(_ slug: String) -> String? {
        guard Self.builtins.contains(where: { $0.slug == slug }),
              let url = Bundle.main.url(forResource: slug, withExtension: "html", subdirectory: "builtin")
        else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    private static func notice(_ text: String) -> String {
        "<!doctype html><meta charset=\"utf-8\"><meta name=\"color-scheme\" content=\"light dark\"><body style=\"font:13px system-ui;padding:12px;color:gray\">\(text)</body>"
    }

    /// What to show for a plugin: its stored page, or a notice if the content is missing.
    func source(for plugin: UserPlugin) -> PluginHost.Source {
        if let slug = PluginAddress.builtinSlug(plugin.url) {
            return .html(Self.builtinHtml(slug) ?? Self.notice("This built-in plugin is not part of this version of Diddy."))
        }
        if let id = PluginAddress.localId(plugin.url) {
            return .html(localRecord(id)?.html ?? Self.notice("The content of this plugin is missing on this device. Remove it and add it again."))
        }
        if let url = URL(string: plugin.url) { return .url(url) }
        return .html(Self.notice("This plugin has no valid address."))
    }

    // MARK: Plugin data (`diddy:storage:*`)

    private func data(for id: String) -> [String: String] {
        if let cached = dataCache[id] { return cached }
        var loaded: [String: String] = [:]
        if PluginRules.isValidPluginId(id), let raw = try? Data(contentsOf: dataURL(id)),
           let decoded = try? JSONDecoder().decode([String: String].self, from: raw) {
            loaded = decoded.filter { PluginRules.isValidStorageKey($0.key) && $0.value.count <= PluginRules.maxStorageValue }
        }
        dataCache[id] = loaded
        return loaded
    }

    func pluginValue(_ id: String, key: String) -> String? { data(for: id)[key] }

    func setPluginValue(_ id: String, key: String, value: String) {
        guard let next = PluginMessageParser.applyStorageSet(data(for: id), key: key, value: value) else { return }
        dataCache[id] = next
        guard let raw = try? JSONEncoder().encode(next) else { return }
        let url = dataURL(id)
        writeQueue.async { try? raw.write(to: url, options: .atomic) }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

// MARK: - GitHub import

/// One-time download of a public GitHub file or Gist: no cookies, no referrer, no redirects,
/// 512 KB cap, 15 second limit, https and the four allowed hosts only.
enum PluginGitHubFetcher {
    private final class NoRedirect: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    static func fetch(_ link: PluginSourceLink) async throws -> String {
        // checked again: only the address the rules produce may be fetched
        guard let again = try? PluginGitHub.rawURL(from: link.rawUrl).get(), again.rawUrl == link.rawUrl, let url = URL(string: link.rawUrl) else {
            throw PluginError("This address cannot be fetched.")
        }
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 15
        let session = URLSession(configuration: config, delegate: NoRedirect(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue(nil, forHTTPHeaderField: "Referer")
        let tooLarge = PluginError("The plugin is too large (at most \(PluginRules.maxLocalBytes / 1024) KB).")
        do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse else { throw PluginError("Could not load the file. Check the address and your connection.") }
            guard (200..<300).contains(http.statusCode) else {
                throw PluginError(http.statusCode == 404 ? "The file was not found (is the repository public?)." : "GitHub answered with an error (\(http.statusCode)).")
            }
            if http.expectedContentLength > Int64(PluginRules.maxLocalBytes) { throw tooLarge }
            var data = Data()
            for try await byte in bytes {
                data.append(byte)
                if data.count > PluginRules.maxLocalBytes { throw tooLarge }
            }
            guard let text = String(data: data, encoding: .utf8) else { throw PluginError("This is not an HTML page.") }
            return try PluginContent.validate(text).get()
        } catch let error as PluginError {
            throw error
        } catch let error as URLError where error.code == .timedOut {
            throw PluginError("Loading took too long. Try again.")
        } catch {
            throw PluginError("Could not load the file. Check the address and your connection.")
        }
    }
}
