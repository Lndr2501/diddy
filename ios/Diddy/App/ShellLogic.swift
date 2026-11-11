import Foundation

// Pure rules of the app shell (user panel, plugin dock, sync banner, update notice, matrix.to
// links, keyboard navigation, welcome guide). Foundation only, so Tools/shell_check tests them on
// macOS and Linux. Each part names the desktop file it follows.

// MARK: - Own status (components/user-panel/UserPanelFace.tsx, STATUS_OPTIONS)

struct OwnStatusOption: Equatable {
    let status: String
    let label: String
    /// For the narrow user panel line, where "Do Not Disturb" would be cut (desktop #155).
    let short: String?
    let description: String?

    var shownLabel: String { short ?? label }
}

enum OwnStatusOptions {
    static let all: [OwnStatusOption] = [
        OwnStatusOption(status: "online", label: "Online", short: nil, description: nil),
        OwnStatusOption(status: "idle", label: "Idle", short: nil, description: nil),
        OwnStatusOption(status: "dnd", label: "Do Not Disturb", short: "Busy",
                        description: "Mutes sounds and notifications. Unread badges stay."),
        OwnStatusOption(status: "invisible", label: "Invisible", short: nil, description: nil),
    ]

    /// The option of a status; unknown or missing is "online" like on desktop.
    static func info(_ status: String?) -> OwnStatusOption {
        all.first { $0.status == status } ?? all[0]
    }
}

// MARK: - Sync banner (plugins/syncBanner.ts, pages/client/SyncStatus.tsx)

enum SyncBannerKind: Equatable {
    case connecting, reconnecting, error

    /// Desktop's texts, word for word.
    var text: String {
        switch self {
        case .connecting: return "Connecting..."
        case .reconnecting: return "Verbindung verloren – erneuter Versuch …"
        case .error: return "Homeserver nicht erreichbar"
        }
    }
}

enum SyncBannerLogic {
    /// `state` is the name of the SDK's `SyncServiceState` case (idle, running, terminated, error,
    /// offline). `started`: the account's sync was started. `everRan`: sync has been running at
    /// least once since then. Running is connected; idle before the first run is "connecting";
    /// offline is the SDK retrying by itself; error is the sync that stopped. A deliberate stop
    /// (terminated) and idle after a run (app in the background) show nothing.
    static func banner(state: String, started: Bool, everRan: Bool) -> SyncBannerKind? {
        guard started else { return nil }
        switch state {
        case "running", "terminated": return nil
        case "offline": return .reconnecting
        case "error": return .error
        default: return everRan ? nil : .connecting
        }
    }
}

// MARK: - Update check (utils/updateCheck.ts, utils/version.ts)

struct UpdateRelease: Equatable {
    let version: String
    /// The GitHub release page.
    let pageUrl: String
    /// The IPA on that release, if there is one.
    let ipaUrl: String?
}

enum UpdateCheckLogic {
    static let repo = "Lndr2501/diddy"
    /// Every release, not only "latest": iOS-only releases (`ios-v*`) are never marked latest, and
    /// desktop releases (`v*`) carry the IPA too.
    static let releasesApiUrl = "https://api.github.com/repos/\(repo)/releases?per_page=30"
    static let releasesPageUrl = "https://github.com/\(repo)/releases"

    /// Desktop's `compareVersions`: dotted numbers, a missing part counts as 0.
    static func compareVersions(_ a: String, _ b: String) -> Int {
        func parse(_ v: String) -> [Int] {
            v.split(separator: ".", omittingEmptySubsequences: false).map { part in
                Int(String(part.prefix { $0.isASCII && $0.isNumber })) ?? 0
            }
        }
        let pa = parse(a), pb = parse(b)
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : 0
            let y = i < pb.count ? pb[i] : 0
            if x != y { return x > y ? 1 : -1 }
        }
        return 0
    }

    /// Only GitHub hosts may serve a release page or download (desktop `isGithubUrl`).
    static func isGithubUrl(_ raw: String) -> Bool {
        guard let url = URL(string: raw), url.scheme == "https", url.user == nil, url.password == nil, let host = url.host?.lowercased() else { return false }
        return host == "github.com" || host.hasSuffix(".github.com") || host.hasSuffix(".githubusercontent.com")
    }

    /// "v1.6.0" and "ios-v1.6.1" give the version; anything else (betas, other tags) nil.
    static func version(fromTag tag: String) -> String? {
        var text = tag.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("ios-v") {
            text = String(text.dropFirst(5))
        } else if text.hasPrefix("v") {
            text = String(text.dropFirst())
        } else { return nil }
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard !parts.isEmpty, parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy { $0.isASCII && $0.isNumber } }) else { return nil }
        return text
    }

    /// One release of the GitHub list. Drafts, pre-releases and releases without an IPA give nil.
    static func parseRelease(_ data: Any) -> UpdateRelease? {
        guard let d = data as? [String: Any] else { return nil }
        if d["draft"] as? Bool == true || d["prerelease"] as? Bool == true { return nil }
        guard let tag = d["tag_name"] as? String, let version = version(fromTag: tag) else { return nil }
        var ipas: [String: String] = [:]
        for case let asset as [String: Any] in (d["assets"] as? [Any]) ?? [] {
            guard let name = asset["name"] as? String, let url = asset["browser_download_url"] as? String,
                  name.lowercased().hasSuffix(".ipa"), isGithubUrl(url) else { continue }
            ipas[name] = url
        }
        guard !ipas.isEmpty else { return nil }
        // The unsigned IPA is the one AltStore, SideStore and Sideloadly install.
        let names = ipas.keys.sorted()
        let pick = names.first { $0.lowercased().contains("unsigned") } ?? names[0]
        let html = d["html_url"] as? String
        let page = html.flatMap { isGithubUrl($0) ? $0 : nil } ?? releasesPageUrl
        return UpdateRelease(version: version, pageUrl: page, ipaUrl: ipas[pick])
    }

    /// The newest usable release of the list `GET /repos/{repo}/releases` answers with.
    static func newest(in data: Any) -> UpdateRelease? {
        guard let list = data as? [Any] else { return nil }
        var best: UpdateRelease?
        for item in list {
            guard let release = parseRelease(item) else { continue }
            if let current = best, compareVersions(release.version, current.version) <= 0 { continue }
            best = release
        }
        return best
    }

    /// True when `latest` is newer than `current` and the user has not dismissed it.
    static func isUpdateWanted(latest: String, current: String, skipped: String) -> Bool {
        compareVersions(latest, current) > 0 && latest != skipped
    }
}

// MARK: - matrix.to links (plugins/matrix-to.ts)

enum MatrixToLink: Equatable {
    case user(String)
    case room(String, via: [String])
    case event(String, eventId: String, via: [String])

    private static func regex(_ pattern: String) -> NSRegularExpression? {
        try? NSRegularExpression(pattern: pattern)
    }

    private static let userPattern = regex(##"^https?://matrix\.to/#/(@[^:\s]+:[^?/\s]+)/?$"##)
    private static let roomPattern = regex(##"^https?://matrix\.to/#/([#!][^?/\s]+)/?(\?\S*)?$"##)
    private static let eventPattern = regex(##"^https?://matrix\.to/#/([#!][^?/\s]+)/(\$[^?/\s]+)/?(\?\S*)?$"##)

    private static func groups(_ regex: NSRegularExpression?, _ text: String) -> [String?]? {
        guard let regex, let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        return (0..<match.numberOfRanges).map { index in
            Range(match.range(at: index), in: text).map { String(text[$0]) }
        }
    }

    /// The `via` values of a query like "?via=a.org&via=b.org".
    static func viaServers(_ query: String?) -> [String] {
        guard var query, !query.isEmpty else { return [] }
        if query.hasPrefix("?") { query.removeFirst() }
        return query.split(separator: "&").compactMap { pair in
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard parts.count == 2, parts[0] == "via", !parts[1].isEmpty else { return nil }
            let value = String(parts[1])
            return value.removingPercentEncoding ?? value
        }
    }

    /// A matrix.to link of a user, room or message. The link is percent-decoded first, like the
    /// desktop's join prompt does.
    static func parse(_ href: String) -> MatrixToLink? {
        let raw = href.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = raw.removingPercentEncoding ?? raw
        if let g = groups(userPattern, text), g.count > 1, let user = g[1] { return .user(user) }
        if let g = groups(roomPattern, text), g.count > 2, let room = g[1] {
            return .room(room, via: viaServers(g[2]))
        }
        if let g = groups(eventPattern, text), g.count > 3, let room = g[1], let event = g[2] {
            return .event(room, eventId: event, via: viaServers(g[3]))
        }
        return nil
    }
}

// MARK: - Plugin dock (state/pluginDock.ts)

struct PluginDockLook: Equatable {
    var height: Int?
    var zoom: Int?
}

/// Which plugins are pinned to the sidebar dock, which dock cards are collapsed, and the card
/// height and zoom per plugin. Same JSON as desktop's `diddyPluginDock` (the custom CSS lives on
/// the plugin itself on iOS, `UserPlugin.customCss`).
struct PluginDockState: Equatable {
    static let minHeight = 60
    static let maxHeight = 320
    static let defaultHeight = 96
    static let minZoom = 50
    static let maxZoom = 100

    var pinned: [String] = []
    var collapsed: [String] = []
    var styles: [String: PluginDockLook] = [:]

    static func clamp(_ value: Any?, min lower: Int, max upper: Int) -> Int? {
        let number: Double
        if let v = value as? Int {
            number = Double(v)
        } else if let v = value as? Double {
            number = v
        } else {
            return nil
        }
        guard number.isFinite else { return nil }
        return Swift.min(upper, Swift.max(lower, Int(Swift.min(Double(upper), Swift.max(Double(lower), number)).rounded())))
    }

    static func cleanLook(_ raw: Any?) -> PluginDockLook {
        let r = raw as? [String: Any] ?? [:]
        return PluginDockLook(
            height: clamp(r["height"], min: minHeight, max: maxHeight),
            zoom: clamp(r["zoom"], min: minZoom, max: maxZoom)
        )
    }

    /// Reads stored JSON; anything broken gives the empty state, like desktop's `read`.
    static func decode(_ data: Data?) -> PluginDockState {
        guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return PluginDockState() }
        func strings(_ value: Any?) -> [String] { (value as? [Any])?.compactMap { $0 as? String } ?? [] }
        var state = PluginDockState(pinned: strings(json["pinned"]), collapsed: strings(json["collapsed"]))
        if let styles = json["styles"] as? [String: Any] {
            for (id, raw) in styles { state.styles[id] = cleanLook(raw) }
        }
        return state
    }

    func encoded() -> Data? {
        var styleJson: [String: Any] = [:]
        for (id, look) in styles {
            var entry: [String: Any] = [:]
            if let height = look.height { entry["height"] = height }
            if let zoom = look.zoom { entry["zoom"] = zoom }
            styleJson[id] = entry
        }
        let json: [String: Any] = ["pinned": pinned, "collapsed": collapsed, "styles": styleJson]
        return try? JSONSerialization.data(withJSONObject: json, options: [.sortedKeys])
    }

    private static func toggle(_ list: [String], _ id: String, _ on: Bool) -> [String] {
        let without = list.filter { $0 != id }
        return on ? without + [id] : without
    }

    mutating func setPinned(_ id: String, _ on: Bool) { pinned = Self.toggle(pinned, id, on) }
    mutating func setCollapsed(_ id: String, _ on: Bool) { collapsed = Self.toggle(collapsed, id, on) }

    mutating func setHeight(_ id: String, _ value: Double) {
        var look = styles[id] ?? PluginDockLook()
        look.height = Self.clamp(value, min: Self.minHeight, max: Self.maxHeight)
        styles[id] = look
    }

    mutating func setZoom(_ id: String, _ value: Double) {
        var look = styles[id] ?? PluginDockLook()
        look.zoom = Self.clamp(value, min: Self.minZoom, max: Self.maxZoom)
        styles[id] = look
    }

    func height(of id: String) -> Int { styles[id]?.height ?? Self.defaultHeight }
    func zoom(of id: String) -> Int { styles[id]?.zoom ?? Self.maxZoom }

    /// Height of a dock card's frame: the plugin's own height, capped at the user's, then zoomed
    /// (desktop `PluginFrame` compact).
    static func frameHeight(pluginHeight: Double, look: Int, zoom: Int) -> Double {
        Swift.min(pluginHeight, Double(look)) * Double(zoom) / 100
    }
}

// MARK: - Keyboard navigation

enum ShellNavigation {
    /// The room `step` places away from `current` in the shown list, without wrapping around.
    /// With nothing open, down picks the first room and up the last.
    static func neighbor(of current: String?, in ids: [String], step: Int) -> String? {
        guard !ids.isEmpty, step != 0 else { return nil }
        guard let current, let index = ids.firstIndex(of: current) else {
            return step > 0 ? ids.first : ids.last
        }
        let next = index + step
        return ids.indices.contains(next) ? ids[next] : nil
    }
}

// MARK: - Welcome guide (plugins/diddy/onboarding.ts, plugins/diddy/intro.ts)

struct OnboardingStored: Equatable {
    var done = false
    var dismissedSpaces: [String] = []

    static func decode(_ data: Data?) -> OnboardingStored {
        guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return OnboardingStored() }
        return OnboardingStored(
            done: json["done"] as? Bool == true,
            dismissedSpaces: (json["dismissedSpaces"] as? [Any])?.compactMap { $0 as? String } ?? []
        )
    }

    func encoded() -> Data? {
        try? JSONSerialization.data(withJSONObject: ["done": done, "dismissedSpaces": dismissedSpaces] as [String: Any], options: [.sortedKeys])
    }

    mutating func dismiss(_ keys: [String]) {
        for key in keys where !dismissedSpaces.contains(key) { dismissedSpaces.append(key) }
    }
}

enum OnboardingShow: Equatable {
    case welcome
    case server
}

enum OnboardingLogic {
    static let optionsRoomName = "Diddy Options"

    /// Named like the options room, or its topic carries the tag (`isDiddyMarkedRoom`).
    static func isDiddyRoom(name: String?, topic: String?, tag: String) -> Bool {
        if let name, name.trimmingCharacters(in: .whitespaces).lowercased() == optionsRoomName.lowercased() { return true }
        return topic?.contains(tag) == true
    }

    /// What to show: the guide until it was finished or skipped, later the short server prompt
    /// while a Diddy room waits that was not dismissed. `pendingKeys` are the dismiss keys of the
    /// rooms not joined yet (`dismissKeyOf`: the space, or the room itself).
    static func show(stored: OnboardingStored, pendingKeys: [String]) -> OnboardingShow? {
        if !stored.done { return .welcome }
        return pendingKeys.contains { !stored.dismissedSpaces.contains($0) } ? .server : nil
    }
}

// MARK: - Matrix intro for Discord users (features/intro/introSteps.ts)

struct IntroStep: Equatable {
    struct Point: Equatable {
        let label: String
        let text: String
    }

    let title: String
    let lead: String
    let points: [Point]
}

enum IntroSteps {
    /// Desktop's `INTRO_STEPS`, word for word (German like on desktop).
    static let all: [IntroStep] = [
        IntroStep(
            title: "Willkommen bei Matrix",
            lead: "Diddy ist ein Chat-Programm für Matrix. Matrix ist ein offenes Netzwerk, das nicht einer Firma gehört – ähnlich wie E-Mail.",
            points: [
                .init(label: "Server", text: "Dein Konto liegt auf einem Server (z. B. matrix.tllx.eu). Der Server gehört nicht Diddy."),
                .init(label: "Dein Name", text: "Du heißt @name:server. Der Teil nach dem Doppelpunkt ist dein Server."),
                .init(label: "Offen", text: "Du kannst auch mit Leuten auf anderen Matrix-Servern schreiben (Föderation)."),
            ]
        ),
        IntroStep(
            title: "Discord auf Matrix übersetzt",
            lead: "Vieles kennst du schon, es heißt nur anders.",
            points: [
                .init(label: "Discord-Server → Space", text: "Ein „Space“ bündelt Räume, wie ein Discord-Server."),
                .init(label: "Kanal → Raum", text: "Text- und Sprachkanäle sind „Räume“. Es gibt Räume mit Anruf (Call-Räume) für Sprache, Kamera und Bildschirm."),
                .init(label: "DM → Direktnachricht", text: "Eins-zu-eins-Chats funktionieren wie auf Discord."),
                .init(label: "Rollen → Berechtigungen", text: "Statt Rollen gibt es Rechte-Stufen (z. B. Admin, Moderator) pro Raum."),
            ]
        ),
        IntroStep(
            title: "Verschlüsselung und Schlüssel",
            lead: "Private Räume sind Ende-zu-Ende verschlüsselt. Das ist sicherer, hat aber eine Eigenheit.",
            points: [
                .init(label: "Nur Teilnehmer lesen mit", text: "Auch der Server-Admin kann verschlüsselte Nachrichten nicht lesen."),
                .init(label: "Geräte verifizieren", text: "Bestätige dein Gerät (Einstellungen → Geräte), damit alte Nachrichten lesbar bleiben."),
                .init(label: "Wiederherstellungsschlüssel", text: "Speichere ihn gut. Ohne ihn und ohne ein anderes angemeldetes Gerät sind verschlüsselte Nachrichten verloren."),
            ]
        ),
        IntroStep(
            title: "Was Diddy kann",
            lead: "Diddy ergänzt Matrix um Dinge, die du von Discord kennst.",
            points: [
                .init(label: "Anrufe", text: "Sprach-, Video- und Bildschirm-Anrufe mit Ton in Call-Räumen."),
                .init(label: "Profil", text: "Eigene Profilkarte mit Banner, Badges, Schriftart und Status – sichtbar für andere Diddy-Nutzer."),
                .init(label: "Sprachnachrichten", text: "Aufnehmen und senden direkt im Eingabefeld."),
            ]
        ),
        IntroStep(
            title: "Was anders ist",
            lead: "Ehrlich gesagt: Einiges gibt es auf Matrix nicht oder anders.",
            points: [
                .init(label: "Kein Nitro, keine Server-Boosts", text: "Es gibt keine bezahlten Extras des Netzwerks."),
                .init(label: "Profil nur bei Diddy", text: "Banner, Badges und Profilkarte sehen nur Nutzer, die auch Diddy mit demselben Datenraum nutzen. Andere Clients zeigen Name und Bild."),
                .init(label: "Server entscheidet mit", text: "Dein Server legt fest, wer Räume erstellen darf, wie groß Dateien sein dürfen und ob Anrufe möglich sind."),
                .init(label: "Kein globaler Status", text: "Online-Status und Aktivitäten sind begrenzt und hängen vom Server ab."),
            ]
        ),
    ]
}
