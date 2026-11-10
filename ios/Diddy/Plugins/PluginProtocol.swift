import Foundation

/// Plugins (#132), the pure part: validation, the message contract and the registry rules. A
/// Swift port of `cinny/src/app/plugins/userPlugins.ts` and `localPlugins.ts`; the wire format is
/// the desktop's (docs/plugins.md, apiVersion 1), so the unchanged plugin pages work. It imports
/// nothing but Foundation, so it also compiles in a plain command line test.

struct PluginError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

enum PluginRules {
    static let apiVersion = 1
    static let maxPlugins = 12
    static let maxNameLength = 40
    static let maxURLLength = 2048
    static let maxDescriptionLength = 140
    static let minFrameHeight = 80.0
    static let maxFrameHeight = 600.0
    static let defaultFrameHeight = 240.0
    static let maxCustomCSS = 4000
    static let maxStorageKeys = 50
    static let maxStorageValue = 20000
    static let maxLocalBytes = 512 * 1024
    /// A message from a plugin larger than this is dropped before it is even parsed.
    static let maxMessageLength = 40_000
    static let builtinPrefix = "diddy:builtin/"
    static let localPrefix = "diddy:local/"
    static let reservedKeys: Set<String> = ["__proto__", "constructor", "prototype"]

    static func isValidStorageKey(_ key: String) -> Bool {
        guard !reservedKeys.contains(key), (1...40).contains(key.count) else { return false }
        return key.unicodeScalars.allSatisfy { s in
            (s.value >= 0x61 && s.value <= 0x7A) || (s.value >= 0x30 && s.value <= 0x39) || s == "_" || s == "." || s == "-"
        }
    }

    static func isValidPluginId(_ id: String) -> Bool {
        guard (1...64).contains(id.count) else { return false }
        return id.unicodeScalars.allSatisfy { s in
            (s.value >= 0x41 && s.value <= 0x5A) || (s.value >= 0x61 && s.value <= 0x7A) || (s.value >= 0x30 && s.value <= 0x39) || s == "-"
        }
    }
}

// MARK: - Text

enum PluginText {
    /// Removes control and bidi characters, collapses whitespace and trims.
    static func clean(_ value: String) -> String {
        let kept = value.unicodeScalars.filter { s in
            let v = s.value
            if v <= 0x1F || (0x7F...0x9F).contains(v) || (0x200B...0x200F).contains(v) { return false }
            if (0x202A...0x202E).contains(v) || (0x2066...0x2069).contains(v) { return false }
            return true
        }
        var scalars = String.UnicodeScalarView()
        scalars.append(contentsOf: kept)
        return String(scalars).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// Normalises a BCP-47 tag from the system, falls back to `en`.
    static func normalizeLocale(_ locale: String?) -> String {
        guard let locale = locale?.trimmingCharacters(in: .whitespaces),
              locale.range(of: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$", options: .regularExpression) != nil
        else { return "en" }
        return locale
    }

    static func clampHeight(_ height: Double) -> Double {
        guard height.isFinite else { return PluginRules.defaultFrameHeight }
        return min(PluginRules.maxFrameHeight, max(PluginRules.minFrameHeight, height.rounded()))
    }
}

// MARK: - Addresses

enum PluginAddress {
    /// A plugin address in canonical form. iOS accepts `https://` only (the desktop's plain
    /// `http://localhost` has no meaning on a phone, and App Transport Security blocks http anyway).
    /// Without a scheme `https://` is assumed. Credentials and `*.localhost` names are refused.
    static func normalize(_ input: String) -> Result<String, PluginError> {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return .failure(.init("Enter the address of the plugin.")) }
        if raw.count > PluginRules.maxURLLength { return .failure(.init("This address is too long.")) }
        if raw.rangeOfCharacter(from: .whitespacesAndNewlines) != nil { return .failure(.init("The address must not contain spaces.")) }
        let withScheme = raw.contains("://") ? raw : "https://\(raw)"
        guard let comps = URLComponents(string: withScheme), let scheme = comps.scheme?.lowercased(),
              let host = comps.host?.lowercased(), !host.isEmpty
        else { return .failure(.init("This is not a valid address.")) }
        if scheme != "https" { return .failure(.init("Only https:// addresses can be added.")) }
        if comps.user != nil || comps.password != nil { return .failure(.init("The address must not contain a user or password.")) }
        if host == "localhost" || host.hasSuffix(".localhost") { return .failure(.init("This address is reserved by the app.")) }
        guard let url = comps.url, url.absoluteString.count <= PluginRules.maxURLLength else {
            return .failure(.init("This address is too long."))
        }
        return .success(url.absoluteString)
    }

    /// A link a plugin asks the app to open in the browser: https only, no credentials.
    static func externalURL(_ input: Any?) -> URL? {
        guard let text = input as? String, text.count <= PluginRules.maxURLLength,
              text.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
              let comps = URLComponents(string: text), comps.scheme?.lowercased() == "https",
              comps.user == nil, comps.password == nil, let host = comps.host, !host.isEmpty
        else { return nil }
        return comps.url
    }

    static func builtinSlug(_ url: String) -> String? {
        guard url.hasPrefix(PluginRules.builtinPrefix) else { return nil }
        let slug = String(url.dropFirst(PluginRules.builtinPrefix.count))
        guard (1...30).contains(slug.count),
              slug.unicodeScalars.allSatisfy({ ($0.value >= 0x61 && $0.value <= 0x7A) || ($0.value >= 0x30 && $0.value <= 0x39) || $0 == "-" })
        else { return nil }
        return slug
    }

    static func localId(_ url: String) -> String? {
        guard url.hasPrefix(PluginRules.localPrefix) else { return nil }
        let id = String(url.dropFirst(PluginRules.localPrefix.count))
        return PluginRules.isValidPluginId(id) ? id : nil
    }
}

// MARK: - Messages

/// A message from a plugin, checked to be exactly one of the known shapes.
enum PluginMessage: Equatable {
    case ready(apiVersion: Int?, manifestDescription: String?, manifestHeight: Double?)
    case resize(height: Double)
    case storageGet(id: String, key: String)
    case storageSet(key: String, value: String)
    case open(url: URL)
}

enum PluginMessageParser {
    private static func number(_ value: Any?) -> Double? {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        let d = n.doubleValue
        return d.isFinite ? d : nil
    }

    private static func hasOnly(_ dict: [String: Any], _ allowed: Set<String>) -> Bool {
        dict.keys.allSatisfy { allowed.contains($0) }
    }

    /// Parses the JSON text the host page forwards. Unknown types, wrong data types and extra
    /// top level fields give `nil`; unknown or malformed manifest fields are just ignored.
    static func parse(json: String) -> PluginMessage? {
        guard json.utf8.count <= PluginRules.maxMessageLength * 4, json.count <= PluginRules.maxMessageLength,
              let data = json.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return nil }
        return parse(object)
    }

    static func parse(_ data: [String: Any]) -> PluginMessage? {
        guard let type = data["type"] as? String else { return nil }
        switch type {
        case "diddy:ready":
            guard hasOnly(data, ["type", "apiVersion", "manifest"]) else { return nil }
            var version: Int?
            if let raw = data["apiVersion"] {
                guard let d = number(raw), d == d.rounded(), d >= 1, d < 1e9 else { return nil }
                version = Int(d)
            }
            var description: String?
            var height: Double?
            if let manifest = data["manifest"] as? [String: Any] {
                if let text = manifest["description"] as? String {
                    let cleaned = String(PluginText.clean(text).prefix(PluginRules.maxDescriptionLength))
                    if !cleaned.isEmpty { description = cleaned }
                }
                if let h = number(manifest["height"]) { height = PluginText.clampHeight(h) }
            }
            return .ready(apiVersion: version, manifestDescription: description, manifestHeight: height)
        case "diddy:resize":
            guard hasOnly(data, ["type", "height"]), let h = number(data["height"]) else { return nil }
            return .resize(height: PluginText.clampHeight(h))
        case "diddy:storage:get":
            guard hasOnly(data, ["type", "id", "key"]),
                  let id = data["id"] as? String, (1...64).contains(id.count),
                  let key = data["key"] as? String, PluginRules.isValidStorageKey(key)
            else { return nil }
            return .storageGet(id: id, key: key)
        case "diddy:storage:set":
            guard hasOnly(data, ["type", "key", "value"]),
                  let key = data["key"] as? String, PluginRules.isValidStorageKey(key),
                  let value = data["value"] as? String, value.count <= PluginRules.maxStorageValue
            else { return nil }
            return .storageSet(key: key, value: value)
        case "diddy:open":
            guard hasOnly(data, ["type", "url"]), let url = PluginAddress.externalURL(data["url"]) else { return nil }
            return .open(url: url)
        default:
            return nil
        }
    }

    /// The `diddy:init` the host sends in answer to `diddy:ready` and on every change of look.
    static func initMessage(theme: String, locale: String?, compact: Bool, customCss: String?) -> [String: Any] {
        var message: [String: Any] = [
            "type": "diddy:init",
            "apiVersion": PluginRules.apiVersion,
            "theme": theme == "light" ? "light" : "dark",
            "locale": PluginText.normalizeLocale(locale),
            "layout": compact ? "compact" : "full",
        ]
        if let css = customCss, !css.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            message["customCss"] = String(css.prefix(PluginRules.maxCustomCSS))
        }
        return message
    }

    /// Applies one storage write, enforcing the key and size limits. `nil` when refused.
    static func applyStorageSet(_ data: [String: String], key: String, value: String) -> [String: String]? {
        guard PluginRules.isValidStorageKey(key), value.count <= PluginRules.maxStorageValue else { return nil }
        if data[key] == nil, data.count >= PluginRules.maxStorageKeys { return nil }
        var next = data
        next[key] = value
        return next
    }
}

// MARK: - Registry

struct UserPlugin: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    /// `https://…`, `diddy:builtin/<slug>` or `diddy:local/<id>`
    var url: String
    var enabled: Bool
    var addedAt: Double
    /// the user's own CSS, sent as `customCss` in `diddy:init`
    var customCss: String?
}

enum PluginRegistry {
    static func validName(_ input: String) -> Result<String, PluginError> {
        let name = PluginText.clean(input)
        if name.isEmpty { return .failure(.init("Enter a name for the plugin.")) }
        if name.count > PluginRules.maxNameLength {
            return .failure(.init("The name can be at most \(PluginRules.maxNameLength) characters long."))
        }
        return .success(name)
    }

    private static func append(_ plugins: [UserPlugin], id: String, name: String, url: String, now: Double) -> Result<[UserPlugin], PluginError> {
        if plugins.count >= PluginRules.maxPlugins {
            return .failure(.init("You can add at most \(PluginRules.maxPlugins) plugins. Remove one first."))
        }
        if plugins.contains(where: { $0.url == url }) { return .failure(.init("This plugin has already been added.")) }
        if plugins.contains(where: { $0.name.lowercased() == name.lowercased() }) {
            return .failure(.init("A plugin with this name already exists."))
        }
        if !PluginRules.isValidPluginId(id) || plugins.contains(where: { $0.id == id }) {
            return .failure(.init("Could not add the plugin."))
        }
        return .success(plugins + [UserPlugin(id: id, name: name, url: url, enabled: true, addedAt: now)])
    }

    static func add(_ plugins: [UserPlugin], name: String, address: String, id: String, now: Double) -> Result<[UserPlugin], PluginError> {
        switch (validName(name), PluginAddress.normalize(address)) {
        case (.failure(let e), _), (_, .failure(let e)): return .failure(e)
        case (.success(let n), .success(let u)): return append(plugins, id: id, name: n, url: u, now: now)
        }
    }

    static func addBuiltin(_ plugins: [UserPlugin], slug: String, name: String, id: String, now: Double) -> Result<[UserPlugin], PluginError> {
        guard let n = try? validName(name).get() else { return .failure(.init("Could not add the plugin.")) }
        return append(plugins, id: id, name: n, url: PluginRules.builtinPrefix + slug, now: now)
    }

    static func addLocal(_ plugins: [UserPlugin], name: String, id: String, now: Double) -> Result<[UserPlugin], PluginError> {
        switch validName(name) {
        case .failure(let e): return .failure(e)
        case .success(let n): return append(plugins, id: id, name: n, url: PluginRules.localPrefix + id, now: now)
        }
    }

    /// Reads the stored list: every entry is checked again, duplicates and overflow are dropped.
    static func sanitize(_ stored: [UserPlugin]) -> [UserPlugin] {
        var result: [UserPlugin] = []
        for entry in stored where result.count < PluginRules.maxPlugins {
            guard PluginRules.isValidPluginId(entry.id), let name = try? validName(entry.name).get() else { continue }
            let url: String
            if entry.url.hasPrefix(PluginRules.localPrefix) {
                guard PluginAddress.localId(entry.url) == entry.id else { continue }
                url = entry.url
            } else if PluginAddress.builtinSlug(entry.url) != nil {
                url = entry.url
            } else if let normalized = try? PluginAddress.normalize(entry.url).get() {
                url = normalized
            } else { continue }
            if result.contains(where: { $0.id == entry.id || $0.url == url || $0.name.lowercased() == name.lowercased() }) { continue }
            var copy = entry
            copy.name = name
            copy.url = url
            copy.customCss = entry.customCss.map { String($0.prefix(PluginRules.maxCustomCSS)) }
            result.append(copy)
        }
        return result
    }
}

// MARK: - Local content and GitHub sources

enum PluginContent {
    /// Checks pasted, loaded or fetched content: not empty, within the size cap, no binary data,
    /// and it looks like an HTML page. Returns the content without a leading byte order mark.
    static func validate(_ input: String) -> Result<String, PluginError> {
        var html = input
        if html.hasPrefix("\u{FEFF}") { html.removeFirst() }
        if html.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .failure(.init("The plugin is empty.")) }
        if html.utf8.count > PluginRules.maxLocalBytes {
            return .failure(.init("The plugin is too large (at most \(PluginRules.maxLocalBytes / 1024) KB)."))
        }
        if html.contains("\u{0}") { return .failure(.init("This looks like a binary file, not an HTML page.")) }
        let tags = "<(!doctype\\s+html|html|head|body|meta|title|script|style|link|main|div|section|article|template|canvas|svg|button|span|p|h[1-6]|ul|table)[\\s>/]"
        if !html.drop(while: { $0.isWhitespace }).hasPrefix("<") || html.range(of: tags, options: [.regularExpression, .caseInsensitive]) == nil {
            return .failure(.init("This does not look like an HTML page."))
        }
        return .success(html)
    }

    /// The page's `<title>`, cleaned and cut to `max` characters ('' if none).
    static func title(of html: String, max: Int = PluginRules.maxNameLength) -> String {
        let head = String(html.prefix(20000))
        guard let range = head.range(of: "<title[^>]*>[\\s\\S]{0,400}?</title>", options: [.regularExpression, .caseInsensitive]) else { return "" }
        var text = String(head[range])
        text = text.replacingOccurrences(of: "<title[^>]*>", with: "", options: [.regularExpression, .caseInsensitive])
        text = text.replacingOccurrences(of: "</title>", with: "", options: .caseInsensitive)
        for (entity, char) in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&apos;", "'")] {
            text = text.replacingOccurrences(of: entity, with: char)
        }
        return String(PluginText.clean(text).prefix(max)).trimmingCharacters(in: .whitespaces)
    }

    /// `my-weather.html` -> `my-weather`.
    static func name(fromFileName fileName: String) -> String {
        let base = fileName.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? fileName
        let stem = base.replacingOccurrences(of: "\\.html?$", with: "", options: [.regularExpression, .caseInsensitive])
        return String(PluginText.clean(stem).prefix(PluginRules.maxNameLength))
    }
}

struct PluginSourceLink: Equatable {
    enum Kind: String, Codable { case github, gist }
    let kind: Kind
    let rawUrl: String
    let label: String
}

enum PluginGitHub {
    static let hosts: Set<String> = ["github.com", "raw.githubusercontent.com", "gist.github.com", "gist.githubusercontent.com"]

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }
    private static func segmentsOk(_ segments: [String]) -> Bool {
        !segments.isEmpty && segments.allSatisfy { matches($0, "^[A-Za-z0-9._-]{1,100}$") && $0 != "." && $0 != ".." }
    }

    /// Turns a GitHub file or Gist link into the raw address to fetch (same rules as the desktop):
    /// only https, only the four exact hosts, no user/password, no port, no `..`, no encoded
    /// slashes or dots; query and fragment are dropped.
    static func rawURL(from input: String) -> Result<PluginSourceLink, PluginError> {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return .failure(.init("Enter the address of a GitHub file or Gist.")) }
        if raw.count > PluginRules.maxURLLength { return .failure(.init("This address is too long.")) }
        if raw.rangeOfCharacter(from: .whitespacesAndNewlines) != nil { return .failure(.init("The address must not contain spaces.")) }
        if raw.contains("\\") { return .failure(.init("This is not a valid address.")) }
        guard let comps = URLComponents(string: raw.contains("://") ? raw : "https://\(raw)"), let host = comps.host?.lowercased()
        else { return .failure(.init("This is not a valid address.")) }
        if comps.scheme?.lowercased() != "https" { return .failure(.init("Only https:// addresses can be imported.")) }
        if comps.user != nil || comps.password != nil { return .failure(.init("The address must not contain a user or password.")) }
        if comps.port != nil { return .failure(.init("The address must not contain a port.")) }
        if !hosts.contains(host) { return .failure(.init("Only github.com, raw.githubusercontent.com and Gist links can be imported.")) }
        let path = comps.percentEncodedPath
        let noQuery = raw.split(whereSeparator: { $0 == "?" || $0 == "#" }).first.map(String.init) ?? raw
        if matches(path.lowercased(), "%2e|%2f|%5c|%00") || matches(noQuery, "(^|/)\\.\\.?(/|$)") {
            return .failure(.init("This path is not allowed."))
        }
        var parts = path.split(separator: "/", omittingEmptySubsequences: false).dropFirst().map(String.init)
        if parts.last == "" { parts.removeLast() }
        if !segmentsOk(parts) { return .failure(.init("This path is not allowed.")) }
        let owner = "^[A-Za-z0-9][A-Za-z0-9-]{0,38}$"
        let gistId = "^[A-Fa-f0-9]{1,64}$"
        let isHtml = { (file: String) in matches(file, "(?i)\\.html?$") }

        if host == "github.com" || host == "raw.githubusercontent.com" {
            let rest: [String]
            if host == "github.com" {
                guard parts.count >= 5, parts[2] == "blob" || parts[2] == "raw" else {
                    return .failure(.init("Use the link of a single file, e.g. github.com/user/repo/blob/main/plugin.html."))
                }
                rest = Array(parts[3...])
            } else {
                guard parts.count >= 4 else { return .failure(.init("Use the link of a single file.")) }
                rest = Array(parts[2...])
            }
            guard matches(parts[0], owner) else { return .failure(.init("This is not a valid GitHub user.")) }
            guard let file = rest.last, isHtml(file) else { return .failure(.init("Only .html or .htm files can be imported.")) }
            let tail = ([parts[0], parts[1]] + rest).joined(separator: "/")
            return .success(.init(kind: .github, rawUrl: "https://raw.githubusercontent.com/\(tail)", label: tail))
        }
        if host == "gist.github.com" {
            guard parts.count >= 2 else { return .failure(.init("Use the link of a Gist, e.g. gist.github.com/user/<id>.")) }
            let rest = Array(parts.dropFirst(2))
            guard matches(parts[0], owner), matches(parts[1], gistId), rest.isEmpty || (rest[0] == "raw" && rest.count <= 3) else {
                return .failure(.init("This is not a valid Gist link."))
            }
            let tail = ([parts[0], parts[1], "raw"] + rest.dropFirst()).joined(separator: "/")
            return .success(.init(kind: .gist, rawUrl: "https://gist.githubusercontent.com/\(tail)", label: "\(parts[0])/\(parts[1])"))
        }
        // gist.githubusercontent.com/<user>/<id>/raw[/<revision>][/<file>]
        guard parts.count >= 3, matches(parts[0], owner), matches(parts[1], gistId), parts[2] == "raw", parts.count <= 5 else {
            return .failure(.init("This is not a valid Gist link."))
        }
        let tail = parts.joined(separator: "/")
        return .success(.init(kind: .gist, rawUrl: "https://gist.githubusercontent.com/\(tail)", label: "\(parts[0])/\(parts[1])"))
    }
}
