import Foundation

/// Your own Diddy profile as the iOS editor changes it, and the JSON it writes. Foundation only
/// (with DiddyProfileDecor.swift), so `Tools/profile_editor_check` tests it without the app.
///
/// Follows desktop: the editor in `cinny/src/app/features/settings/diddy/`, `mergeDraft` in
/// `plugins/diddy/profilePreview.ts` and the whitelists of `sanitize.ts`, `profileExtras.ts`,
/// `nameplate.ts`, `profileEffect.ts` and `profileFrame.ts`. Same keys and values as desktop;
/// default values ("none", "default", false, ...) are left out, which every reader treats the same.
///
/// Only the parts changed here are written. Everything else in the stored profile stays exactly as
/// it is, also keys this app does not know, and inside a written part the nested keys this app does
/// not manage are kept too.
struct DiddyProfileDraft: Equatable {
    /// Two-colour text gradient of the name; `angle` is a CSS angle in degrees.
    struct Gradient: Equatable {
        var from: String
        var to: String
        var angle: Double
    }

    /// Profile effect or frame: none, a built-in preset, or the own one uploaded in Diddy desktop
    /// (kept as it is, iOS cannot import those yet).
    enum Choice: Hashable {
        case none
        case preset(String)
        case custom
    }

    /// The top-level keys of the profile the editor writes (desktop's `EDITOR_KEYS` and
    /// `shownBadges`, which desktop saves from its badge list).
    enum Part: String, CaseIterable {
        case nameStyle, card, nameplate, effect, frame, status, bio, about, interests, links, activity, cardLayout, shownBadges
    }

    // Name
    var nameFont = "default"
    var nameEffect = "none"
    var nameBold = false
    var nameItalic = false
    var nameColor: String?
    var nameGradient: Gradient?

    // Card
    var cardFrom: String?
    var cardTo: String?
    var cardAngle = 135.0
    var cardAccent: String?
    var bannerMxc: String?
    var bannerPos: DiddyImagePos?

    // Nameplate
    var plateColor: String?
    var platePreset: String?
    var plateFlow = false
    var plateImageMxc: String?
    var plateVideoMxc: String?
    var plateImagePos: DiddyImagePos?
    var plateFullRow = false

    // Profile effect and frame
    var effect = Choice.none
    var frame = Choice.none

    // Status and card texts
    var status = "online"
    var bio = ""
    /// pronouns, location, age, education, work
    var about: [String: String] = [:]
    var interests: [String] = []
    /// The addresses; the kind (GitHub, website, ...) follows from the address like on desktop.
    var links: [String] = []
    /// "none" or one of `DiddyProfileRules.activityKinds`.
    var activityKind = "none"
    var activityText = ""
    var activityDetail = ""

    // Card layout
    var layout = "standard"
    var hiddenModules: [String] = []
    var moduleOrderSetting: [String] = []
    var cardTheme = "auto"
    var glass = false
    var calm = false
    var bigLayout = "expanded"
    var bigBanner = "tall"
    var bigAvatar = "large"

    /// Badge ids shown next to the name, in order.
    var shownBadges: [String] = []

    init() {}

    /// The editable part of a stored profile, read with the same whitelists as every reader.
    init(raw: [String: Any]) {
        typealias R = DiddyProfileRules
        if let style = raw["nameStyle"] as? [String: Any] {
            if let font = style["font"] as? String, R.fontIds.contains(font) { nameFont = font }
            if let effect = style["effect"] as? String, R.nameEffectIds.contains(effect) { nameEffect = effect }
            nameBold = R.bool(style["bold"]) ?? false
            nameItalic = R.bool(style["italic"]) ?? false
            nameColor = R.color(style["color"])
            if let gradient = style["gradient"] as? [String: Any],
               let from = R.color(gradient["from"]), let to = R.color(gradient["to"]) {
                nameGradient = Gradient(from: from, to: to, angle: R.angle(gradient["angle"], fallback: 90))
            }
        }
        if let card = raw["card"] as? [String: Any] {
            cardFrom = R.color(card["from"])
            cardTo = R.color(card["to"])
            cardAngle = R.angle(card["angle"], fallback: 135)
            cardAccent = R.color(card["accent"])
            bannerMxc = R.mxc(card["bannerMxc"])
            if bannerMxc != nil { bannerPos = DiddyImagePos(card["bannerPos"]) }
        }
        if let plate = raw["nameplate"] as? [String: Any] {
            plateColor = R.color(plate["color"])
            if let preset = plate["preset"] as? String, R.nameplatePresetIds.contains(preset) { platePreset = preset }
            plateFlow = platePreset != nil && R.bool(plate["flow"]) == true
            plateImageMxc = R.mxc(plate["imageMxc"])
            plateVideoMxc = R.mxc(plate["videoMxc"])
            if plateImageMxc != nil || plateVideoMxc != nil { plateImagePos = DiddyImagePos(plate["imagePos"]) }
            plateFullRow = plate["fit"] as? String == "full"
        }
        effect = R.choice(raw["effect"], presets: R.effectPresetIds)
        frame = R.choice(raw["frame"], presets: R.framePresetIds)
        if let value = raw["status"] as? String, R.statuses.contains(value) { status = value }
        bio = R.text(raw["bio"], max: R.maxBio, controlsToSpace: false) ?? ""
        if let facts = raw["about"] as? [String: Any] {
            for field in R.aboutFields {
                if let value = R.text(facts[field], max: R.aboutMax(field)) { about[field] = value }
            }
        }
        if let items = raw["interests"] as? [Any] {
            for item in items.prefix(R.maxInterests * 2) {
                if let value = R.text(item, max: R.maxInterestLength), !interests.contains(value), interests.count < R.maxInterests {
                    interests.append(value)
                }
            }
        }
        if let items = raw["links"] as? [Any] {
            for case let item as [String: Any] in items.prefix(R.maxLinks * 2) where links.count < R.maxLinks {
                guard let kind = item["kind"] as? String, R.linkKinds.contains(kind),
                      let url = (item["url"] as? String)?.trimmingCharacters(in: .whitespaces),
                      R.safeLink(kind: kind, url) != nil, !links.contains(url) else { continue }
                links.append(url)
            }
        }
        if let activity = raw["activity"] as? [String: Any], let kind = activity["kind"] as? String,
           R.activityKinds.contains(kind), let text = R.text(activity["text"], max: R.maxActivityLength) {
            activityKind = kind
            activityText = text
            activityDetail = R.text(activity["detail"], max: R.maxActivityLength) ?? ""
        }
        if let settings = raw["cardLayout"] as? [String: Any] {
            if let value = settings["layout"] as? String, R.layouts.contains(value) { layout = value }
            hiddenModules = R.moduleList(settings["hidden"])
            moduleOrderSetting = R.moduleList(settings["order"])
            if let value = settings["theme"] as? String, R.cardThemes.contains(value) { cardTheme = value }
            glass = R.bool(settings["glass"]) == true
            calm = R.bool(settings["calm"]) == true
            if let big = settings["big"] as? [String: Any] {
                if let value = big["layout"] as? String, R.bigLayouts.contains(value) { bigLayout = value }
                if let value = big["banner"] as? String, R.bigBanners.contains(value) { bigBanner = value }
                if let value = big["avatar"] as? String, R.bigAvatars.contains(value) { bigAvatar = value }
            }
        }
        if let ids = raw["shownBadges"] as? [Any] {
            shownBadges = Array(ids.prefix(64).compactMap { $0 as? String }
                .filter { !$0.isEmpty && $0.count <= 64 }
                .prefix(R.maxShownBadges))
        }
    }

    // MARK: Editing helpers (the same moves desktop's editor makes)

    /// Solid colour or gradient. A new gradient starts from the name colour, like on desktop.
    mutating func setNameGradient(_ on: Bool) {
        if on {
            if nameGradient == nil { nameGradient = Gradient(from: nameColor ?? "#7aa2f7", to: "#c084fc", angle: 90) }
        } else {
            nameGradient = nil
        }
    }

    /// The modules of the chosen layout in the order they show (`visibleModules` without hiding).
    var moduleOrder: [String] {
        let allowed = DiddyProfileRules.layoutModules[layout] ?? []
        let ordered = moduleOrderSetting.filter { allowed.contains($0) }
        return ordered + allowed.filter { !ordered.contains($0) }
    }

    /// Moves a module up (-1) or down (+1); stores the whole order like desktop's arrows.
    mutating func moveModule(at index: Int, by offset: Int) {
        var next = moduleOrder
        let target = index + offset
        guard next.indices.contains(index), next.indices.contains(target) else { return }
        next.swapAt(index, target)
        moduleOrderSetting = next
    }

    mutating func setModule(_ module: String, visible: Bool) {
        if visible {
            hiddenModules.removeAll { $0 == module }
        } else if !hiddenModules.contains(module) {
            hiddenModules.append(module)
        }
    }

    /// The shown badges you really own, in your order (desktop drops the others when saving).
    func shownBadgeIds(owned: Set<String>) -> [String] {
        shownBadges.filter { owned.contains($0) }
    }

    /// Shows or hides one of your badges; at most `maxShownBadges`, new ones go last.
    mutating func toggleBadge(_ id: String, owned: Set<String>) {
        var shown = shownBadgeIds(owned: owned)
        if let index = shown.firstIndex(of: id) {
            shown.remove(at: index)
        } else if owned.contains(id), shown.count < DiddyProfileRules.maxShownBadges {
            shown.append(id)
        } else {
            return
        }
        shownBadges = shown
    }

    /// What has to be fixed before saving; empty when the draft can be saved.
    var problems: [String] {
        var out: [String] = []
        for (index, url) in links.enumerated() {
            let trimmed = url.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }
            if DiddyProfileRules.safeLink(kind: DiddyProfileRules.guessLinkKind(trimmed), trimmed) == nil {
                out.append("Link \(index + 1) is not a valid https address.")
            }
        }
        if links.count > DiddyProfileRules.maxLinks { out.append("At most \(DiddyProfileRules.maxLinks) links.") }
        return out
    }

    // MARK: Writing

    /// The parts whose JSON differs from `original` (the draft as it was loaded).
    func changedParts(from original: DiddyProfileDraft) -> [Part] {
        Part.allCases.filter { part in
            switch part {
            case .effect: return effect != original.effect
            case .frame: return frame != original.frame
            default:
                return !DiddyProfileRules.sameJSON(self.value(of: part, old: nil), original.value(of: part, old: nil))
            }
        }
    }

    /// The profile to write: `raw` (the stored profile, read again right before writing) with the
    /// parts changed since `original` replaced. Like desktop's `mergeDraft`, plus `v: 1`.
    func apply(to raw: [String: Any], since original: DiddyProfileDraft) -> [String: Any] {
        var out = raw
        for part in changedParts(from: original) {
            if let newValue = self.value(of: part, old: raw[part.rawValue]) {
                out[part.rawValue] = newValue
            } else {
                out.removeValue(forKey: part.rawValue)
            }
        }
        out["v"] = 1
        out.removeValue(forKey: DiddyProfileRules.messageKeyField)
        return out
    }

    /// The JSON value of one part, nil to remove it. `old` is the stored value; its nested keys
    /// that the editor does not manage are kept.
    func value(of part: Part, old: Any?) -> Any? {
        typealias R = DiddyProfileRules
        switch part {
        case .nameStyle:
            var values: [String: Any] = [:]
            if nameFont != "default" { values["font"] = nameFont }
            if let nameColor { values["color"] = nameColor }
            if let gradient = nameGradient {
                let value: [String: Any] = ["from": gradient.from, "to": gradient.to, "angle": R.jsonNumber(gradient.angle)]
                values["gradient"] = value
            }
            if nameEffect != "none" { values["effect"] = nameEffect }
            if nameBold { values["bold"] = true }
            if nameItalic { values["italic"] = true }
            return R.merge(old, managed: ["font", "color", "gradient", "effect", "bold", "italic"], values)
        case .card:
            var values: [String: Any] = [:]
            if let cardFrom { values["from"] = cardFrom }
            if let cardTo { values["to"] = cardTo }
            if cardFrom != nil || cardTo != nil { values["angle"] = R.jsonNumber(cardAngle) }
            if let cardAccent { values["accent"] = cardAccent }
            if let bannerMxc {
                values["bannerMxc"] = bannerMxc
                if let bannerPos { values["bannerPos"] = R.json(bannerPos) }
            }
            return R.merge(old, managed: ["from", "to", "angle", "accent", "bannerMxc", "bannerPos"], values)
        case .nameplate:
            var values: [String: Any] = [:]
            if let plateColor { values["color"] = plateColor }
            if let platePreset {
                values["preset"] = platePreset
                if plateFlow { values["flow"] = true }
            }
            if let plateImageMxc { values["imageMxc"] = plateImageMxc }
            if let plateVideoMxc { values["videoMxc"] = plateVideoMxc }
            if plateImageMxc != nil || plateVideoMxc != nil, let plateImagePos { values["imagePos"] = R.json(plateImagePos) }
            if plateFullRow { values["fit"] = "full" }
            return R.merge(old, managed: ["color", "preset", "flow", "imageMxc", "videoMxc", "imagePos", "fit"], values)
        case .effect:
            return R.choiceValue(effect, old: old)
        case .frame:
            return R.choiceValue(frame, old: old)
        case .status:
            return status
        case .bio:
            let text = R.limit(bio, R.maxBio).trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? nil : text
        case .about:
            var facts: [String: Any] = [:]
            for field in R.aboutFields {
                let text = R.limit(about[field] ?? "", R.aboutMax(field)).trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { facts[field] = text }
            }
            return facts.isEmpty ? nil : facts
        case .interests:
            let list = R.cleanInterests(interests)
            return list.isEmpty ? nil : list
        case .links:
            var list: [[String: Any]] = []
            var seen: Set<String> = []
            for url in links {
                let trimmed = url.trimmingCharacters(in: .whitespaces)
                let kind = R.guessLinkKind(trimmed)
                guard R.safeLink(kind: kind, trimmed) != nil, !seen.contains(trimmed), list.count < R.maxLinks else { continue }
                seen.insert(trimmed)
                list.append(["kind": kind, "url": trimmed])
            }
            return list.isEmpty ? nil : list
        case .activity:
            let text = R.limit(activityText, R.maxActivityLength).trimmingCharacters(in: .whitespacesAndNewlines)
            guard R.activityKinds.contains(activityKind), !text.isEmpty else { return nil }
            var value: [String: Any] = ["kind": activityKind, "text": text]
            let detail = R.limit(activityDetail, R.maxActivityLength).trimmingCharacters(in: .whitespacesAndNewlines)
            if !detail.isEmpty { value["detail"] = detail }
            return value
        case .cardLayout:
            var values: [String: Any] = [:]
            if layout != "standard" { values["layout"] = layout }
            if !hiddenModules.isEmpty { values["hidden"] = hiddenModules }
            if !moduleOrderSetting.isEmpty { values["order"] = moduleOrderSetting }
            if cardTheme != "auto" { values["theme"] = cardTheme }
            if glass { values["glass"] = true }
            if calm { values["calm"] = true }
            var big: [String: Any] = [:]
            if bigLayout != "expanded" { big["layout"] = bigLayout }
            if bigBanner != "tall" { big["banner"] = bigBanner }
            if bigAvatar != "large" { big["avatar"] = bigAvatar }
            if let merged = R.merge((old as? [String: Any])?["big"], managed: ["layout", "banner", "avatar"], big) {
                values["big"] = merged
            }
            return R.merge(old, managed: ["layout", "hidden", "order", "theme", "glass", "calm", "big"], values)
        case .shownBadges:
            return shownBadges
        }
    }

    /// Size of the profile as readers measure it (`JSON.stringify(content).length` of desktop:
    /// UTF-16 units, slashes not escaped), with the message-mode key field like desktop's
    /// `writeDiddyData`, so it never passes here and is dropped by a reader. Nil when it is no JSON.
    static func encodedSize(_ content: [String: Any], key: String) -> Int? {
        var measured = content
        measured[DiddyProfileRules.messageKeyField] = key
        guard JSONSerialization.isValidJSONObject(measured),
              let data = try? JSONSerialization.data(withJSONObject: measured, options: [.withoutEscapingSlashes]) else { return nil }
        return String(decoding: data, as: UTF8.self).utf16.count
    }
}

/// Lists and whitelists of the Diddy profile, as on desktop.
enum DiddyProfileRules {
    /// Every reader drops larger profile events.
    static let maxContentBytes = 4096
    static let messageKeyField = "app.diddy.key"
    static let maxShownBadges = 4
    static let maxInterests = 12
    static let maxInterestLength = 24
    static let maxLinks = 8
    static let maxLinkLength = 200
    static let maxBio = 160
    static let maxActivityLength = 60

    /// `NAME_FONTS` of types.ts.
    static let fonts: [(id: String, label: String)] = [
        ("default", "Default"), ("serif", "Serif"), ("mono", "Monospace"), ("rounded", "Rounded"),
        ("impact", "Impact"), ("script", "Script"), ("fantasy", "Fantasy"), ("marker", "Marker"),
    ]
    static let nameEffects: [(id: String, label: String)] = [
        ("none", "None"), ("glow", "Glow"), ("shadow", "Shadow"), ("outline", "Outline"),
    ]
    /// `NAMEPLATE_PRESETS` of nameplate.ts.
    static let nameplatePresets: [(id: String, label: String)] = [
        ("aurora", "Aurora"), ("sunset", "Sunset"), ("ocean", "Ocean"), ("forest", "Forest"), ("ember", "Ember"),
        ("lavender", "Lavender"), ("candy", "Candy"), ("mint", "Mint"), ("midnight", "Midnight"), ("gold", "Gold"),
    ]
    /// `PROFILE_EFFECT_PRESETS` of profileEffect.ts (ids as in `DiddyProfileEffect.presets`).
    static let effectPresets: [(id: String, label: String)] = [
        ("sparkles", "Sparkles"), ("petals", "Petals"), ("embers", "Embers"), ("snow", "Snow"),
        ("hearts", "Hearts"), ("aurora", "Aurora"),
    ]
    /// `PROFILE_FRAME_PRESETS` of profileFrame.ts (ids as in `DiddyProfileFrame.presets`).
    static let framePresets: [(id: String, label: String)] = [
        ("glow", "Soft glow"), ("gold", "Gold"), ("vines", "Vines"), ("neon", "Neon"), ("pixel", "Pixel"),
    ]
    static var fontIds: [String] { fonts.map { $0.id } }
    static var nameEffectIds: [String] { nameEffects.map { $0.id } }
    static var nameplatePresetIds: [String] { nameplatePresets.map { $0.id } }
    static var effectPresetIds: [String] { effectPresets.map { $0.id } }
    static var framePresetIds: [String] { framePresets.map { $0.id } }

    /// The label of an id in one of the lists above (the id itself when unknown).
    static func label(_ id: String, in list: [(id: String, label: String)]) -> String {
        list.first { $0.id == id }?.label ?? id
    }

    static let statuses = ["online", "idle", "dnd", "invisible"]
    static let aboutFields = ["pronouns", "location", "age", "education", "work"]
    static func aboutMax(_ field: String) -> Int { field == "age" ? 8 : 40 }
    static let activityKinds = ["music", "game", "working", "learning", "custom"]
    static let layouts = ["compact", "standard", "expanded", "tabs"]
    static let modules = ["about", "bio", "activity", "interests", "links", "sharedRooms"]
    /// `LAYOUT_MODULES` of profileExtras.ts.
    static let layoutModules: [String: [String]] = [
        "compact": ["bio"],
        "standard": ["bio", "about", "links", "sharedRooms"],
        "expanded": ["about", "bio", "activity", "interests", "links", "sharedRooms"],
        "tabs": ["about", "bio", "activity", "interests", "links", "sharedRooms"],
    ]
    static let cardThemes = ["auto", "light", "dark"]
    static let bigLayouts = ["expanded", "tabs"]
    static let bigBanners = ["normal", "tall", "hero"]
    static let bigAvatars = ["normal", "large"]
    static let linkKinds = ["github", "gitlab", "linkedin", "spotify", "youtube", "web"]
    private static let linkHosts: [(kind: String, hosts: [String])] = [
        ("github", ["github.com"]),
        ("gitlab", ["gitlab.com"]),
        ("linkedin", ["linkedin.com"]),
        ("spotify", ["open.spotify.com", "spotify.com"]),
        ("youtube", ["youtube.com", "youtu.be"]),
    ]

    // MARK: Values

    /// Lowercase `#rrggbb` / `#rrggbbaa` (`#rgb` expanded), else nil (`safeColor`).
    static func color(_ value: Any?) -> String? {
        guard let raw = value as? String, raw.count <= 16 else { return nil }
        let hex = raw.trimmingCharacters(in: .whitespaces).lowercased()
        guard hex.hasPrefix("#") else { return nil }
        let digits = hex.dropFirst()
        guard [3, 6, 8].contains(digits.count), digits.allSatisfy({ "0123456789abcdef".contains($0) }) else { return nil }
        if digits.count == 3 { return "#" + digits.map { "\($0)\($0)" }.joined() }
        return hex
    }

    /// A JSON boolean, nil for anything else (numbers 0 / 1 included, like desktop).
    static func bool(_ value: Any?) -> Bool? {
        guard let value else { return nil }
        if type(of: value) == Bool.self { return value as? Bool }
        #if canImport(ObjectiveC)
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() { return number.boolValue }
        #endif
        return nil
    }

    /// `safeAngle`: a number clamped to 0...360, else the fallback.
    static func angle(_ value: Any?, fallback: Double) -> Double {
        min(360, max(0, DiddySanitize.number(value) ?? fallback))
    }

    /// An mxc:// URI with a plain server name and media id (`safeMxc`).
    static func mxc(_ value: Any?) -> String? { DiddySanitize.mxc(value) }

    static func json(_ pos: DiddyImagePos) -> [String: Any] {
        ["x": jsonNumber(pos.x), "y": jsonNumber(pos.y), "zoom": jsonNumber(pos.zoom)]
    }

    /// Whole numbers as integers, so 90 is written as `90` like desktop's sliders.
    static func jsonNumber(_ value: Double) -> Any {
        guard value.isFinite else { return 0 }
        if value == value.rounded(), abs(value) < 1e9 { return Int(value) }
        return value
    }

    /// At most `max` Unicode scalars (code points, like desktop's `Array.from`).
    static func limit(_ text: String, _ max: Int) -> String {
        var scalars = String.UnicodeScalarView()
        scalars.append(contentsOf: text.unicodeScalars.prefix(max))
        return String(scalars)
    }

    /// Trimmed text of at most `max` code points, nil when empty. `controlsToSpace` replaces
    /// control characters (profileExtras.ts does, the bio keeps its line breaks).
    static func text(_ value: Any?, max: Int, controlsToSpace: Bool = true) -> String? {
        guard let raw = value as? String else { return nil }
        var scalars = String.UnicodeScalarView()
        for scalar in raw.unicodeScalars.prefix(max) {
            if controlsToSpace, scalar.value < 0x20 || scalar.value == 0x7F {
                scalars.append(" ")
            } else {
                scalars.append(scalar)
            }
        }
        let out = String(scalars).trimmingCharacters(in: .whitespacesAndNewlines)
        return out.isEmpty ? nil : out
    }

    /// Interests as they are stored: trimmed, at most 24 characters each, no doubles, at most 12.
    static func cleanInterests(_ list: [String]) -> [String] {
        var out: [String] = []
        for item in list {
            guard let value = self.text(item, max: maxInterestLength), !out.contains(value) else { continue }
            out.append(value)
            if out.count == maxInterests { break }
        }
        return out
    }

    /// Interests typed as "a, b, c" (desktop's input splits at commas).
    static func interests(from text: String) -> [String] {
        cleanInterests(text.split(separator: ",").map(String.init))
    }

    /// `safeLinkUrl`: an https address without credentials whose host fits the kind.
    static func safeLink(kind: String, _ raw: String) -> URL? {
        guard linkKinds.contains(kind), raw.utf16.count <= maxLinkLength,
              let url = URL(string: raw.trimmingCharacters(in: .whitespaces)),
              url.scheme?.lowercased() == "https", url.user == nil, url.password == nil,
              let host = url.host?.lowercased(), host.contains(".") else { return nil }
        if kind == "web" { return url }
        guard let hosts = linkHosts.first(where: { $0.kind == kind })?.hosts,
              hosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) else { return nil }
        return url
    }

    /// `guessLinkKind`: the platform the address belongs to, else "web".
    static func guessLinkKind(_ raw: String) -> String {
        guard let host = URL(string: raw.trimmingCharacters(in: .whitespaces))?.host?.lowercased() else { return "web" }
        return linkHosts.first { entry in entry.hosts.contains { host == $0 || host.hasSuffix("." + $0) } }?.kind ?? "web"
    }

    static func moduleList(_ value: Any?) -> [String] {
        var out: [String] = []
        for case let item as String in (value as? [Any] ?? []).prefix(32) where modules.contains(item) && !out.contains(item) {
            out.append(item)
        }
        return out
    }

    /// `sanitizeProfileEffect` / `sanitizeProfileFrame` reduced to what the editor offers.
    static func choice(_ value: Any?, presets: [String]) -> DiddyProfileDraft.Choice {
        guard let raw = value as? [String: Any] else { return .none }
        if let layers = raw["layers"] as? [Any],
           layers.contains(where: { mxc(($0 as? [String: Any])?["mxc"]) != nil }) {
            return .custom
        }
        if let preset = raw["preset"] as? String, presets.contains(preset) { return .preset(preset) }
        return .none
    }

    static func choiceValue(_ choice: DiddyProfileDraft.Choice, old: Any?) -> Any? {
        switch choice {
        case .none: return nil
        case .preset(let id): return ["preset": id]
        case .custom: return old
        }
    }

    /// `old` without the managed keys, plus `values`; nil when nothing is left.
    static func merge(_ old: Any?, managed: [String], _ values: [String: Any]) -> [String: Any]? {
        var out = old as? [String: Any] ?? [:]
        for key in managed { out.removeValue(forKey: key) }
        for (key, value) in values { out[key] = value }
        return out.isEmpty ? nil : out
    }

    /// Whether two JSON values serialise the same (keys sorted).
    static func sameJSON(_ a: Any?, _ b: Any?) -> Bool {
        let left: [String: Any] = ["v": a ?? NSNull()]
        let right: [String: Any] = ["v": b ?? NSNull()]
        guard JSONSerialization.isValidJSONObject(left), JSONSerialization.isValidJSONObject(right),
              let l = try? JSONSerialization.data(withJSONObject: left, options: [.sortedKeys]),
              let r = try? JSONSerialization.data(withJSONObject: right, options: [.sortedKeys]) else { return false }
        return l == r
    }
}

/// Pictures for the profile: file type and limits. (How a picture fills its box with its position:
/// `DiddyImagePos.placement` in DiddyProfileDecor.swift.)
enum DiddyMediaRules {
    /// Diddy's own limit for profile media (desktop `MAX_DIDDY_MEDIA_BYTES`); a lower server limit wins.
    static let maxBytes = 8 * 1024 * 1024
    /// A nameplate video is a short loop (`MAX_NAMEPLATE_VIDEO_SECONDS`).
    static let maxVideoSeconds = 15.0

    /// The picture type from the first bytes: GIF, PNG, JPEG or WebP (the ones every Diddy shows),
    /// nil for anything else (HEIC, ...), which is converted before uploading.
    static func imageType(of data: Data) -> (mimeType: String, ext: String)? {
        let bytes = [UInt8](data.prefix(12))
        func starts(_ prefix: [UInt8]) -> Bool { bytes.count >= prefix.count && Array(bytes.prefix(prefix.count)) == prefix }
        if starts(Array("GIF87a".utf8)) || starts(Array("GIF89a".utf8)) { return ("image/gif", "gif") }
        if starts([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return ("image/png", "png") }
        if starts([0xFF, 0xD8, 0xFF]) { return ("image/jpeg", "jpg") }
        if bytes.count >= 12, starts(Array("RIFF".utf8)), Array(bytes[8..<12]) == Array("WEBP".utf8) { return ("image/webp", "webp") }
        return nil
    }

}
