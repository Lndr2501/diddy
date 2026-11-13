import Foundation
import MatrixRustSDK
import SwiftUI

/// Diddy profile extras (name colour, card, badges, bio, ...) as Diddy desktop shares them, see
/// `cinny/src/app/plugins/diddy/types.ts` and `profiles.ts`.
///
/// They live in a "Diddy Options" room, marked by the state event `app.diddy.options`:
/// - `app.diddy.profile` (state key = user id): that user's profile, valid only from that user.
/// - `app.diddy.badge` (state key = badge id): a custom badge definition.
/// - `app.diddy.badge_award` (state key = `badgeId|userId`): a badge given to someone.
///
/// Rooms where members may not write state, and every encrypted room (state events are never
/// encrypted), get the same data as normal events that carry the key in `content["app.diddy.key"]`
/// ("message mode"). This side reads the state and the newest message-mode events: through the
/// REST API in unencrypted rooms and through a decrypting timeline in encrypted ones
/// (`DiddyOptionsFeed`).
///
/// Everything here is written by other people, so it is checked like desktop does: the sender must
/// be a joined member, content is small, timestamps are plausible and every value is whitelisted.
struct DiddyProfile: Equatable {
    enum Status: String { case online, idle, dnd, invisible }

    struct Link: Hashable {
        let kind: String
        let url: URL
    }

    struct Activity: Equatable {
        let kind: String
        let text: String
        var detail: String?
    }

    var nameColor: String?
    var nameGradient: [String]?
    /// CSS angle of the name gradient in degrees (90 = left to right).
    var nameGradientAngle = 90.0
    var nameFont = "default"
    var nameEffect = "none"
    var nameBold = false
    var nameItalic = false
    var cardFrom: String?
    var cardTo: String?
    var cardAngle = 135.0
    var cardAccent: String?
    var bannerMxc: String?
    /// `card.bannerPos`: the visible part of the banner (only with a banner).
    var bannerPos: DiddyImagePos?
    var nameplate: DiddyNameplate?
    /// `effect`: the animated overlay over the profile card (#86), see DiddyProfileDecor.swift.
    var effect: DiddyProfileEffect?
    /// `frame`: the decorative frame around the profile card (#87).
    var frame: DiddyProfileFrame?
    /// `clientVersion`: the Diddy version the owner runs, shown on the card.
    var clientVersion: String?
    var status: Status?
    var shownBadges: [String] = []
    var bio: String?
    struct Fact: Hashable {
        let field: String
        let value: String
    }

    /// Pronouns, location, age, education, work: in that order, only the ones that are set.
    var about: [Fact] = []
    var interests: [String] = []
    var links: [Link] = []
    var activity: Activity?
    /// The card modules the owner shows, in their order.
    var modules: [String] = DiddyProfile.layoutModules["standard"] ?? []

    static let nameFonts = ["default", "serif", "mono", "rounded", "impact", "script", "fantasy", "marker"]
    static let nameEffects = ["none", "glow", "shadow", "outline"]
    static let aboutFields = ["pronouns", "location", "age", "education", "work"]
    static let modulesAll = ["about", "bio", "activity", "interests", "links", "sharedRooms"]
    static let layoutModules: [String: [String]] = [
        "compact": ["bio"],
        "standard": ["bio", "about", "links", "sharedRooms"],
        "expanded": ["about", "bio", "activity", "interests", "links", "sharedRooms"],
        "tabs": ["about", "bio", "activity", "interests", "links", "sharedRooms"],
    ]
    static let activityKinds = ["music", "game", "working", "learning", "custom"]
    private static let linkHosts: [String: [String]] = [
        "github": ["github.com"],
        "gitlab": ["gitlab.com"],
        "linkedin": ["linkedin.com"],
        "spotify": ["open.spotify.com", "spotify.com"],
        "youtube": ["youtube.com", "youtu.be"],
        "web": [],
    ]

    /// `sanitizeProfile` of desktop: nil unless it is a v1 profile; unknown keys are ignored.
    init?(_ raw: [String: Any]) {
        guard raw["v"] as? Int == 1 else { return nil }
        if let style = raw["nameStyle"] as? [String: Any] {
            nameColor = Self.color(style["color"])
            if let gradient = style["gradient"] as? [String: Any],
               let from = Self.color(gradient["from"]), let to = Self.color(gradient["to"]) {
                nameGradient = [from, to]
                nameGradientAngle = Self.angle(gradient["angle"], fallback: 90)
            }
            if let font = style["font"] as? String, Self.nameFonts.contains(font) { nameFont = font }
            if let effect = style["effect"] as? String, Self.nameEffects.contains(effect) { nameEffect = effect }
            nameBold = style["bold"] as? Bool ?? false
            nameItalic = style["italic"] as? Bool ?? false
        }
        if let card = raw["card"] as? [String: Any] {
            cardFrom = Self.color(card["from"])
            cardTo = Self.color(card["to"])
            cardAngle = Self.angle(card["angle"], fallback: 135)
            cardAccent = Self.color(card["accent"])
            bannerMxc = Self.mxc(card["bannerMxc"])
            if bannerMxc != nil { bannerPos = DiddyImagePos(card["bannerPos"]) }
        }
        if let plate = raw["nameplate"] as? [String: Any] { nameplate = DiddyNameplate(plate) }
        effect = DiddyProfileEffect(raw["effect"])
        frame = DiddyProfileFrame(raw["frame"])
        clientVersion = DiddySanitize.version(raw["clientVersion"])
        status = (raw["status"] as? String).flatMap(Status.init(rawValue:))
        if let ids = raw["shownBadges"] as? [Any] {
            shownBadges = Array(ids.prefix(64).compactMap { $0 as? String }.filter { !$0.isEmpty && $0.count <= 64 }.prefix(4))
        }
        bio = Self.text(raw["bio"], max: 160)
        if let about = raw["about"] as? [String: Any] {
            self.about = Self.aboutFields.compactMap { field in
                Self.text(about[field], max: field == "age" ? 8 : 40).map { Fact(field: field, value: $0) }
            }
        }
        if let items = raw["interests"] as? [Any] {
            for item in items.prefix(24) {
                if let value = Self.text(item, max: 24), !interests.contains(value), interests.count < 12 { interests.append(value) }
            }
        }
        if let items = raw["links"] as? [Any] {
            for case let item as [String: Any] in items.prefix(16) where links.count < 8 {
                guard let kind = item["kind"] as? String, let url = Self.safeLink(kind: kind, raw: item["url"]),
                      !links.contains(where: { $0.url == url }) else { continue }
                links.append(Link(kind: kind, url: url))
            }
        }
        if let activity = raw["activity"] as? [String: Any], let kind = activity["kind"] as? String,
           Self.activityKinds.contains(kind), let text = Self.text(activity["text"], max: 60) {
            self.activity = Activity(kind: kind, text: text, detail: Self.text(activity["detail"], max: 60))
        }
        let layoutSettings = raw["cardLayout"] as? [String: Any]
        let layout = (layoutSettings?["layout"] as? String).flatMap { Self.layoutModules[$0] != nil ? $0 : nil } ?? "standard"
        let allowed = Self.layoutModules[layout] ?? []
        let hidden = Self.moduleList(layoutSettings?["hidden"])
        let order = Self.moduleList(layoutSettings?["order"]).filter { allowed.contains($0) }
        modules = (order + allowed.filter { !order.contains($0) }).filter { !hidden.contains($0) }
    }

    /// True when there is anything worth showing beyond name and avatar.
    var hasCardContent: Bool {
        bio != nil || !about.isEmpty || !interests.isEmpty || !links.isEmpty || activity != nil
    }

    // MARK: Whitelists, as in sanitize.ts / profileExtras.ts

    static func color(_ value: Any?) -> String? {
        guard let raw = value as? String, raw.count <= 16 else { return nil }
        let hex = raw.trimmingCharacters(in: .whitespaces).lowercased()
        guard hex.wholeMatch(of: #/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})/#) != nil else { return nil }
        if hex.count == 4 {
            return "#" + hex.dropFirst().map { "\($0)\($0)" }.joined()
        }
        return hex
    }

    /// A finite number clamped to 0...360 (`safeAngle`).
    static func angle(_ value: Any?, fallback: Double) -> Double {
        guard let raw = value as? NSNumber, CFGetTypeID(raw) != CFBooleanGetTypeID() else { return fallback }
        let number = raw.doubleValue
        return number.isFinite ? min(360, max(0, number)) : fallback
    }

    static func mxc(_ value: Any?) -> String? {
        guard let raw = value as? String, raw.count <= 512,
              raw.wholeMatch(of: #/mxc://[A-Za-z0-9.\-:\[\]]+/[A-Za-z0-9_\-]+/#) != nil else { return nil }
        return raw
    }

    /// Trimmed text of at most `max` characters without control characters, or nil when empty.
    static func text(_ value: Any?, max: Int) -> String? {
        guard let raw = value as? String else { return nil }
        let clean = String(raw.prefix(max * 2).unicodeScalars.map { $0.value < 0x20 || $0.value == 0x7F ? " " : Character($0) })
        let out = String(clean.prefix(max)).trimmingCharacters(in: .whitespacesAndNewlines)
        return out.isEmpty ? nil : out
    }

    /// An https link without credentials whose host fits its kind (a GitHub link must go to GitHub).
    static func safeLink(kind: String, raw: Any?) -> URL? {
        guard let hosts = linkHosts[kind], let text = raw as? String, text.count <= 200,
              let url = URL(string: text.trimmingCharacters(in: .whitespaces)),
              url.scheme?.lowercased() == "https", url.user == nil, url.password == nil,
              let host = url.host?.lowercased(), host.contains(".") else { return nil }
        if kind != "web", !hosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) { return nil }
        return url
    }

    private static func moduleList(_ value: Any?) -> [String] {
        var out: [String] = []
        for case let item as String in (value as? [Any] ?? []).prefix(32) where modulesAll.contains(item) && !out.contains(item) {
            out.append(item)
        }
        return out
    }
}

/// The background someone set for their row in member and DM lists (`sanitizeNameplate` and
/// `nameplate.ts` of desktop): a colour, one of the preset gradients, a picture (also GIF) or a
/// short muted video loop.
struct DiddyNameplate: Equatable {
    var color: String?
    var preset: String?
    /// The preset gradient slowly moves.
    var flow = false
    var imageMxc: String?
    var videoMxc: String?
    /// The visible part of the picture or video (only with one of them).
    var imagePos: DiddyImagePos?
    /// "fade" (default) shows it on the right and fades it out towards the name; "full" covers the row.
    var fitsFullRow = false

    /// The gradient presets, `NAMEPLATE_PRESETS` of nameplate.ts.
    static let presets: [String: [String]] = [
        "aurora": ["#1fa2ff", "#12d8fa", "#a6ffcb"],
        "sunset": ["#ff5f6d", "#ff9966", "#ffc371"],
        "ocean": ["#1a2a6c", "#2c5fa8", "#3ab0d8"],
        "forest": ["#134e5e", "#3f8f6b", "#9bd27a"],
        "ember": ["#8e1b2b", "#e2462f", "#f8b500"],
        "lavender": ["#6a3fd0", "#b06ee8", "#f0c6ff"],
        "candy": ["#ff6fd8", "#a259ff", "#4f3ee0"],
        "mint": ["#00a693", "#4cc9a4", "#b5e88a"],
        "midnight": ["#1c1d2b", "#3b3f72", "#7b6cf6"],
        "gold": ["#8a6418", "#d4a537", "#f7e08a"],
    ]

    /// nil unless there is a colour, a known preset, a picture or a video.
    init?(_ raw: [String: Any]) {
        color = DiddyProfile.color(raw["color"])
        if let id = raw["preset"] as? String, Self.presets[id] != nil { preset = id }
        flow = preset != nil && raw["flow"] as? Bool == true
        imageMxc = DiddyProfile.mxc(raw["imageMxc"])
        videoMxc = DiddyProfile.mxc(raw["videoMxc"])
        if imageMxc != nil || videoMxc != nil { imagePos = DiddyImagePos(raw["imagePos"]) }
        fitsFullRow = raw["fit"] as? String == "full"
        guard color != nil || preset != nil || imageMxc != nil || videoMxc != nil else { return nil }
    }

    /// The gradient stops (a preset) or the colour wash (45 % of the chosen colour) under any media.
    var backgroundColors: [String]? {
        if let preset { return Self.presets[preset] }
        return color.map { [$0, $0] }
    }
}

extension DiddyBadge {
    /// The badges that ship with Diddy and exist on every server (`GLOBAL_BADGES` in types.ts).
    static let global: [DiddyBadge] = [
        ("g.star", "Star", "⭐", "#F0C060"), ("g.heart", "Heart", "💖", "#E5517C"), ("g.fire", "On fire", "🔥", "#F08A3C"),
        ("g.crown", "Crown", "👑", "#F0C060"), ("g.dev", "Developer", "🛠️", "#7AA2F7"), ("g.og", "OG", "🧬", "#85E0BA"),
        ("g.mod", "Moderator", "🛡️", "#BDB6EC"), ("g.gamer", "Gamer", "🎮", "#9B7BFF"), ("g.music", "Music", "🎧", "#4FD1C5"),
        ("g.night", "Night owl", "🦉", "#8A8FD6"), ("g.founder", "Founder", "🏛️", "#E8B04A"), ("g.admin", "Admin", "⚔️", "#E5604D"),
        ("g.helper", "Helper", "🤝", "#5DC9A0"), ("g.vip", "VIP", "💎", "#C58AF9"), ("g.supporter", "Supporter", "🎗️", "#F27BA6"),
        ("g.early", "Early bird", "🐣", "#F5D547"), ("g.designer", "Designer", "🎨", "#F28DB2"), ("g.translator", "Translator", "🌍", "#5BB6E8"),
        ("g.artist", "Artist", "🖌️", "#E58A5B"), ("g.streamer", "Streamer", "📺", "#9146FF"), ("g.reader", "Reader", "📚", "#B68D5E"),
        ("g.coder", "Coder", "💻", "#5CC8A8"), ("g.photo", "Photographer", "📷", "#8FB4D9"), ("g.coffee", "Coffee", "☕", "#A9784F"),
        ("g.early_riser", "Early riser", "🌅", "#F5A25D"), ("g.diamond", "Diamond", "💠", "#5BD1F0"), ("g.rocket", "Rocket", "🚀", "#7AA2F7"),
        ("g.clover", "Clover", "🍀", "#5CC46A"), ("g.skull", "Skull", "💀", "#C9CDD6"), ("g.ghost", "Ghost", "👻", "#B8A9E8"),
        ("g.cat", "Cat", "🐱", "#F2B36B"), ("g.dog", "Dog", "🐶", "#C99A6B"), ("g.pizza", "Pizza", "🍕", "#E8744F"),
        ("g.rainbow", "Rainbow", "🌈", "#F28DB2"), ("g.sparkles", "Sparkles", "✨", "#F5DC7A"), ("g.lightning", "Lightning", "⚡", "#F5D547"),
        ("g.trophy", "Trophy", "🏆", "#E8B04A"), ("g.matrix", "Matrix", "🟩", "#2FBF71"), ("g.linux", "Linux", "🐧", "#E8E8E8"),
        ("g.apple", "Apple", "🍎", "#E5604D"), ("g.opensource", "Open source", "🔓", "#6FCF97"),
    ].map { DiddyBadge(id: $0.0, name: $0.1, emoji: $0.2, imageMxc: nil, color: $0.3.lowercased()) }

    /// `sanitizeBadgeDef` of desktop.
    init?(id: String, content: [String: Any]) {
        guard let name = DiddyProfile.text(content["name"], max: 32) else { return nil }
        self.init(id: id, name: name, emoji: DiddyProfile.text(content["emoji"], max: 8),
                  imageMxc: DiddyProfile.mxc(content["imageMxc"]), color: DiddyProfile.color(content["color"]))
    }
}

/// What one options room holds, already reduced to trusted candidates.
private struct OptionsRoomData {
    var byKey: [String: [String: [DiddyCandidate]]] = [:] // type → key → candidates

    mutating func add(type: String, key: String, _ candidate: DiddyCandidate) {
        byKey[type, default: [:]][key, default: []].append(candidate)
    }

    func newest(type: String, key: String, from sender: String) -> DiddyCandidate? {
        byKey[type]?[key]?.filter { $0.sender == sender }.max { $0.ts < $1.ts }
    }
}

/// A trusted-so-far message-mode event waiting for the per-room limits.
private struct PendingMessage {
    let type: String
    let key: String
    let candidate: DiddyCandidate
}

extension MatrixAccount {
    /// Reads the Diddy profiles of everyone in the options rooms. Cheap to call often: it runs at
    /// most once a minute unless `force` is set.
    func loadDiddyProfiles(force: Bool = false) async {
        guard !diddyLoading, !rooms.isEmpty else { return }
        if !force, let last = diddyLoadedAt, Date().timeIntervalSince(last) < 60 { return }
        diddyLoading = true
        defer { diddyLoading = false }
        diddyLoadedAt = Date()

        // The marker is checked once per room and session; most rooms answer "not found". Only
        // the marker counts, like desktop's `isOptionsRoom`: a room that merely carries the topic
        // tag is no options room there, and reading it here would change which room comes first.
        let candidates = rooms.filter { $0.isJoined && !$0.isSpace && !$0.isDirect && !diddyCheckedRooms.contains($0.id) }
        for room in candidates.prefix(300) {
            do {
                _ = try await clientRequest("/_matrix/client/v3/rooms/\(Self.pathComponent(room.id))/state/\(DiddyEvents.marker)/")
                diddyOptionsRooms.insert(room.id)
                diddyCheckedRooms.insert(room.id)
            } catch let error as ClientAPIError where error.errcode == "M_NOT_FOUND" {
                diddyCheckedRooms.insert(room.id)
            } catch {
                // Offline or similar: asked again on the next load.
            }
        }
        let joined = Set(rooms.filter(\.isJoined).map(\.id))
        // Desktop's order (`localeCompare`), so the same room wins here and gets your writes.
        let optionsRooms = DiddyOptionsRoomLogic.sortedLikeDesktop(diddyOptionsRooms.union(diddyLightRoomIds).filter { joined.contains($0) })

        var loaded: [(id: String, data: OptionsRoomData, encrypted: Bool)] = []
        for roomId in optionsRooms {
            if let room = await loadOptionsRoom(roomId) { loaded.append((roomId, room.data, room.encrypted)) }
        }
        diddyPrimaryRoom = loaded.first.map { (id: $0.id, encrypted: $0.encrypted) }

        // Profiles: the first room (in desktop's order) with a valid profile of that user wins.
        var profiles: [String: DiddyProfile] = [:]
        var ownRaw: [String: Any]?
        var rejected: Set<String> = []
        for room in loaded {
            for (userId, _) in room.data.byKey[DiddyEvents.profile] ?? [:] where profiles[userId] == nil {
                guard let newest = room.data.newest(type: DiddyEvents.profile, key: userId, from: userId),
                      let profile = DiddyProfile(newest.content) else { rejected.insert(userId); continue }
                profiles[userId] = profile
                if userId == self.userId { ownRaw = newest.content }
            }
        }

        // Awards: one per giver and badge, at most 200 per giver (the newest).
        struct AwardRecord { let badgeId: String; let userId: String; let by: String; let ts: Int64 }
        var awards: [AwardRecord] = []
        var defCandidates: [String: [DiddyCandidate]] = [:]
        let globalIds = Set(DiddyBadge.global.map(\.id))
        for room in loaded {
            for (id, list) in room.data.byKey[DiddyEvents.badge] ?? [:] where id.count <= 64 && !globalIds.contains(id) {
                defCandidates[id, default: []] += list
            }
            for (key, list) in room.data.byKey[DiddyEvents.award] ?? [:] {
                guard let parsed = DiddyTrust.parseAwardKey(key) else { continue }
                for award in DiddyTrust.resolveAwards(recipient: parsed.userId, list) {
                    awards.append(AwardRecord(badgeId: parsed.badgeId, userId: parsed.userId, by: award.by, ts: award.ts))
                }
            }
        }
        awards = DiddyTrust.capPerSender(awards, sender: \.by, ts: \.ts, max: DiddyTrust.maxAwardsPerSender)
        var owned: [String: Set<String>] = [:] // user → badge ids
        for award in awards { owned[award.userId, default: []].insert(award.badgeId) }
        let awardedIds = Set(awards.map(\.badgeId))

        // Definitions: at most 25 per creator and 300 overall (newest first), but one somebody was
        // awarded is never dropped.
        struct DefinitionRecord { let badge: DiddyBadge; let ts: Int64; let sender: String }
        var records: [DefinitionRecord] = []
        for (id, list) in defCandidates {
            guard let chosen = Self.pickDefinition(id: id, list), let badge = DiddyBadge(id: id, content: chosen.content) else { continue }
            records.append(DefinitionRecord(badge: badge, ts: chosen.ts, sender: chosen.sender))
        }
        records = DiddyTrust.capPerSender(records, sender: \.sender, ts: \.ts, max: DiddyTrust.maxCustomDefsPerSender)
            .sorted { $0.ts > $1.ts }
        var slots = DiddyTrust.maxCustomDefs - records.filter { awardedIds.contains($0.badge.id) }.count
        var definitions = Dictionary(uniqueKeysWithValues: DiddyBadge.global.map { ($0.id, $0) })
        for record in records {
            var badge = record.badge
            badge.createdBy = record.sender
            if awardedIds.contains(badge.id) {
                definitions[badge.id] = badge
            } else if slots > 0 {
                slots -= 1
                definitions[badge.id] = badge
            }
        }
        var badges: [String: [DiddyBadge]] = [:]
        for (userId, profile) in profiles {
            let mine = owned[userId] ?? []
            let shown = profile.shownBadges.filter { mine.contains($0) }.compactMap { definitions[$0] }
            if !shown.isEmpty { badges[userId] = Array(shown.prefix(4)) }
        }

        if diddyProfiles != profiles { diddyProfiles = profiles }
        if diddyBadges != badges { diddyBadges = badges }
        // One line when the picture changes, so a missing profile can be traced in Diagnostics.
        rejected.subtract(profiles.keys)
        let summary = "diddy: options rooms=\(optionsRooms.count) read=\(loaded.count) encrypted=\(loaded.filter(\.encrypted).count) "
            + "profiles=\(profiles.count) unreadable=\(rejected.sorted().joined(separator: ","))"
        if summary != diddyLastSummary {
            diddyLastSummary = summary
            DiagLog.shared.write(summary)
        }
        // Every badge you were given, for the editor's "shown badges" (built-in ones first).
        let ownBadges = (owned[self.userId] ?? []).compactMap { definitions[$0] }.sorted { a, b in
            if a.id.hasPrefix("g.") != b.id.hasPrefix("g.") { return a.id.hasPrefix("g.") }
            return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
        if diddyOwnBadges != ownBadges { diddyOwnBadges = ownBadges }
        // The whole library for the badge screen: built-in ones first, then the custom ones by name.
        let library = DiddyBadge.global + definitions.values.filter { !$0.isGlobal }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        if diddyBadgeLibrary != library { diddyBadgeLibrary = library }
        diddyOwnProfileRaw = ownRaw
        // No options room yet: join the one of your servers, like desktop does after the first sync.
        if diddyPrimaryRoom == nil {
            Task { await self.joinDiddyOptionsRoomAutomatically() }
        } else {
            Task { await self.hardenDiddyBadgePower() }
        }
    }

    /// Whether your own profile can be changed here without losing what desktop wrote: the
    /// primary options room must be one this side can read completely. In an encrypted room that
    /// means the messages were read, and none of yours is still waiting for its key.
    var canEditDiddyProfile: Bool {
        guard let primary = diddyPrimaryRoom else { return false }
        if !primary.encrypted || diddyOwnProfileRaw != nil { return true }
        return diddyFeeds[primary.id]?.isCompleteFor(sender: userId) == true
    }

    /// Changes some fields of your Diddy profile and keeps all others, including ones this app does
    /// not know. `nil` removes a field.
    func updateDiddyProfile(_ changes: [String: Any?]) async throws {
        try await updateDiddyProfile(build: { stored in
            var content = stored
            for (key, value) in changes { content[key] = value }
            return content
        })
    }

    /// Writes your profile as `build` makes it from the stored one, which is read again right
    /// before (after any load still running), so nothing written elsewhere meanwhile is lost.
    /// Refuses to write while your stored profile is not known, and content that readers would
    /// drop for its size (desktop's limit and message, see `DiddyProfileDraft.encodedSize`).
    func updateDiddyProfile(build: ([String: Any]) -> [String: Any]) async throws {
        await reloadDiddyProfilesForWrite()
        guard diddyPrimaryRoom != nil, canEditDiddyProfile else {
            throw DiddyError("No Diddy Options room was found. Set one up in the profile editor first.")
        }
        var content = build(diddyOwnProfileRaw ?? [:])
        content["v"] = 1
        try await writeDiddyData(type: DiddyEvents.profile, key: userId, content: content)
        await loadDiddyProfiles(force: true)
    }

    /// Writes one Diddy event (`writeDiddyData` of desktop): an unencrypted room that carries the
    /// marker keeps its data in state events, which every member receives when they join. In every
    /// other case (encrypted room, no permission, a room used without admin rights) the data is
    /// sent as a normal event with the key in `content["app.diddy.key"]`, encrypted like any message
    /// when the room is. Refuses content readers would drop for its size.
    func writeDiddyData(type: String, key: String, content raw: [String: Any]) async throws {
        guard let primary = diddyPrimaryRoom else { throw DiddyError("No Diddy Options room found.") }
        var content = raw
        content[DiddyEvents.keyField] = nil
        guard let size = DiddyProfileDraft.encodedSize(content, key: key) else {
            throw DiddyError("Your data could not be saved: it contains a value that is not valid JSON.")
        }
        if size > DiddyEvents.maxContentBytes {
            throw DiddyError("Too much data to save (\(size) of \(DiddyEvents.maxContentBytes) characters). Shorten links or texts.")
        }
        let path = "/_matrix/client/v3/rooms/\(Self.pathComponent(primary.id))/state/\(Self.pathComponent(type))/\(Self.pathComponent(key))"
        // State events are never encrypted, so desktop only uses them in unencrypted, marked rooms.
        let messageOnly = diddyLightRoomIds.contains(primary.id) && !diddyOptionsRooms.contains(primary.id)
        var asState = !primary.encrypted && !messageOnly
        if asState {
            do {
                _ = try await clientRequest(path, body: content, method: "PUT")
            } catch let error as ClientAPIError where error.errcode == "M_FORBIDDEN" {
                asState = false
            }
        }
        if !asState {
            // Message mode: a normal event carrying the key, encrypted like any message.
            guard let room = room(primary.id) else { throw DiddyError("The Diddy Options room is not available yet.") }
            content[DiddyEvents.keyField] = key
            let data = try JSONSerialization.data(withJSONObject: content)
            do {
                _ = try await room.sendRaw(eventType: type, content: String(decoding: data, as: UTF8.self))
            } catch {
                throw DiddyError("Could not send your data to the Diddy Options room: \(error.friendlyMessage)")
            }
            // The timeline has no decrypted JSON for a local echo: remember it until it comes back.
            diddyFeeds[primary.id]?.addLocal(type: type, sender: userId, content: content)
        }
    }

    /// Hidden from channel lists like on desktop, where it only shows with developer tools on.
    func isDiddyOptionsRoom(_ roomId: String, topic: String? = nil) -> Bool {
        diddyOptionsRooms.contains(roomId) || diddyLightRoomIds.contains(roomId) || topic?.contains(DiddyEvents.topicTag) == true
    }

    // MARK: Reading one room

    private func loadOptionsRoom(_ roomId: String) async -> (data: OptionsRoomData, encrypted: Bool)? {
        let base = "/_matrix/client/v3/rooms/\(Self.pathComponent(roomId))"
        guard let state = try? await clientRequestArray(base + "/state") else { return nil }
        var joined: Set<String> = []
        var encrypted = false
        for event in state {
            guard let type = event["type"] as? String else { continue }
            if type == "m.room.member", let key = event["state_key"] as? String,
               (event["content"] as? [String: Any])?["membership"] as? String == "join" {
                joined.insert(key)
            }
            if type == "m.room.encryption" { encrypted = true }
        }
        var data = OptionsRoomData()
        let now = Int64(Date().timeIntervalSince1970 * 1000)

        /// The checks every Diddy event passes, state or message: a known type, a sane key, a
        /// joined sender, a plausible time, small content. Returns nil when one fails.
        func trusted(type: String, key: String?, sender: String?, ts: Int64?, content: [String: Any]?) -> PendingMessage? {
            guard [DiddyEvents.profile, DiddyEvents.badge, DiddyEvents.award].contains(type),
                  let key, !key.isEmpty, key.count <= 300,
                  let sender, joined.contains(sender),
                  let ts, ts <= now + 86_400_000,
                  var content = content
            else { return nil }
            let size = DiddyEvents.jsonLength(content)
            guard let size, size <= DiddyEvents.maxContentBytes else {
                if type == DiddyEvents.profile {
                    DiagLog.shared.write("diddy: profile dropped user=\(sender) room=\(roomId) size=\(size.map { String($0) } ?? "invalid")")
                }
                return nil
            }
            // A profile only ever belongs to the person who sent it, an award needs `badge|user`.
            if type == DiddyEvents.profile && key != sender { return nil }
            if type == DiddyEvents.award && DiddyTrust.parseAwardKey(key) == nil { return nil }
            content[DiddyEvents.keyField] = nil
            return PendingMessage(type: type, key: key, candidate: DiddyCandidate(content: content, ts: ts, sender: sender))
        }

        for event in state {
            guard let type = event["type"] as? String,
                  let pending = trusted(type: type, key: event["state_key"] as? String, sender: event["sender"] as? String,
                                        ts: (event["origin_server_ts"] as? NSNumber)?.int64Value, content: event["content"] as? [String: Any])
            else { continue }
            data.add(type: pending.type, key: pending.key, pending.candidate)
        }

        // Message mode: unencrypted rooms are asked for the Diddy types only; an encrypted room's
        // ciphertext says nothing, so its decrypting timeline is read instead.
        var messages: [PendingMessage] = []
        if encrypted {
            let feed = diddyFeeds[roomId] ?? DiddyOptionsFeed(roomId: roomId)
            if diddyFeeds[roomId] == nil {
                feed.onChange = { [weak self] in
                    guard let self else { return }
                    Task { await self.loadDiddyProfiles(force: true) }
                }
                diddyFeeds[roomId] = feed
            }
            if let room = room(roomId) { await feed.start(room: room) }
            for event in feed.events {
                if let pending = trusted(type: event.type, key: event.content[DiddyEvents.keyField] as? String, sender: event.sender,
                                         ts: event.ts, content: event.content) {
                    messages.append(pending)
                }
            }
        } else {
            let filter = #"{"types":["app.diddy.profile","app.diddy.badge","app.diddy.badge_award"]}"#
            let query = filter.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
            if let page = try? await clientRequest(base + "/messages?dir=b&limit=300&filter=\(query)") {
                for case let event as [String: Any] in page["chunk"] as? [Any] ?? [] where event["state_key"] == nil {
                    let content = event["content"] as? [String: Any]
                    if let type = event["type"] as? String,
                       let pending = trusted(type: type, key: content?[DiddyEvents.keyField] as? String, sender: event["sender"] as? String,
                                             ts: (event["origin_server_ts"] as? NSNumber)?.int64Value, content: content) {
                        messages.append(pending)
                    }
                }
            }
        }
        for pending in DiddyTrust.trimMessages(messages, sender: { $0.candidate.sender }, ts: { $0.candidate.ts }) {
            data.add(type: pending.type, key: pending.key, pending.candidate)
        }
        return (data, encrypted)
    }

    /// `pickDefinition` with desktop's validity check: the content is a badge and the creator it
    /// names, if any, is the real sender.
    private static func pickDefinition(id: String, _ candidates: [DiddyCandidate]) -> DiddyCandidate? {
        DiddyTrust.pickDefinition(id: id, candidates) { candidate in
            DiddyBadge(id: id, content: candidate.content) != nil
                && (candidate.content["createdBy"] == nil || candidate.content["createdBy"] as? String == candidate.sender)
        }
    }

    private static func pathComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? value
    }
}

// MARK: - Showing it

extension Color {
    /// `#rrggbb` or `#rrggbbaa`, already checked by `DiddyProfile.color`.
    init?(diddyHex hex: String?) {
        guard let hex, hex.hasPrefix("#"), let value = UInt64(hex.dropFirst(), radix: 16) else { return nil }
        let hasAlpha = hex.count == 9
        let rgb = hasAlpha ? value >> 8 : value
        self.init(.sRGB,
                  red: Double((rgb >> 16) & 0xFF) / 255,
                  green: Double((rgb >> 8) & 0xFF) / 255,
                  blue: Double(rgb & 0xFF) / 255,
                  opacity: hasAlpha ? Double(value & 0xFF) / 255 : 1)
    }
}

extension UnitPoint {
    /// Start and end of a CSS `linear-gradient(<angle>deg, ...)` (0 = to the top, 90 = to the right).
    static func cssGradient(angle: Double) -> (start: UnitPoint, end: UnitPoint) {
        let radians = angle * .pi / 180
        let dx = sin(radians) / 2
        let dy = -cos(radians) / 2
        return (UnitPoint(x: 0.5 - dx, y: 0.5 - dy), UnitPoint(x: 0.5 + dx, y: 0.5 + dy))
    }
}

/// A display name in the colour, gradient, font, effect and weight the person chose in Diddy.
struct DiddyName: View {
    let name: String
    let profile: DiddyProfile?
    var font: Font = .body
    /// Point size, used by the fonts of the name style that have no system equivalent.
    var size: CGFloat = 17
    /// Used when there is no Diddy name colour.
    var fallback: Color = Theme.text

    /// The families desktop offers, as fonts iOS ships with (`NAME_FONTS` in types.ts).
    private static let families: [String: String] = [
        "serif": "Georgia", "mono": "Menlo", "rounded": "ArialRoundedMTBold", "impact": "AvenirNextCondensed-Heavy",
        "script": "SnellRoundhand-Bold", "fantasy": "Papyrus", "marker": "MarkerFelt-Wide",
    ]

    private var resolvedFont: Font {
        guard let family = profile.flatMap({ Self.families[$0.nameFont] }), UIFont(name: family, size: size) != nil else { return font }
        return .custom(family, size: size, relativeTo: .body)
    }

    private var effectColor: Color {
        if let gradient = profile?.nameGradient, let from = Color(diddyHex: gradient.first) { return from }
        return Color(diddyHex: profile?.nameColor) ?? fallback
    }

    var body: some View {
        let text = Text(name)
            .font(resolvedFont)
            .fontWeight(profile?.nameBold == true ? .bold : nil)
            .italic(profile?.nameItalic == true)
        filled(text).modifier(DiddyNameEffect(effect: profile?.nameEffect ?? "none", color: effectColor))
    }

    @ViewBuilder
    private func filled(_ text: Text) -> some View {
        if let profile, let gradient = profile.nameGradient, let from = Color(diddyHex: gradient.first), let to = Color(diddyHex: gradient.last) {
            let points = UnitPoint.cssGradient(angle: profile.nameGradientAngle)
            text.foregroundStyle(LinearGradient(colors: [from, to], startPoint: points.start, endPoint: points.end))
        } else {
            text.foregroundStyle(Color(diddyHex: profile?.nameColor) ?? fallback)
        }
    }
}

/// Glow, shadow and outline of a name. SwiftUI cannot stroke text, so the outline is a tight halo.
private struct DiddyNameEffect: ViewModifier {
    let effect: String
    let color: Color

    func body(content: Content) -> some View {
        switch effect {
        case "glow": content.shadow(color: color.opacity(0.9), radius: 5)
        case "shadow": content.shadow(color: .black.opacity(0.6), radius: 2, x: 0, y: 2)
        case "outline": content.shadow(color: color, radius: 0.6).shadow(color: color, radius: 0.6)
        default: content
        }
    }
}

/// The badges someone chose to show next to their name, as small tinted chips like on desktop.
struct DiddyBadges: View {
    let badges: [DiddyBadge]
    var size: CGFloat = 14
    var account: MatrixAccount?

    var body: some View {
        HStack(spacing: 3) {
            ForEach(badges) { badge in
                let tint = Color(diddyHex: badge.color) ?? Color(diddyHex: "#9b9baa") ?? Theme.muted
                let side = size * 1.3
                ZStack {
                    if let mxc = badge.imageMxc {
                        AvatarView(url: mxc, name: badge.name, size: size, cornerRadius: 3, account: account)
                    } else {
                        Text(badge.emoji ?? String(badge.name.prefix(1)).uppercased()).font(.system(size: size * 0.85))
                    }
                }
                .frame(width: side, height: side)
                .background(RoundedRectangle(cornerRadius: side * 0.32).fill(tint.opacity(0.22)))
                .overlay(RoundedRectangle(cornerRadius: side * 0.32).stroke(tint.opacity(0.45), lineWidth: 1))
                .accessibilityLabel(badge.name)
            }
        }
    }
}

extension DiddyProfile.Status {
    var color: Color? {
        switch self {
        case .online: return Theme.online
        case .idle: return Color(red: 0.94, green: 0.69, blue: 0.20)
        case .dnd: return Theme.danger
        case .invisible: return nil
        }
    }

    var title: String {
        switch self {
        case .online: return "Online"
        case .idle: return "Idle"
        case .dnd: return "Do Not Disturb"
        case .invisible: return "Invisible"
        }
    }
}
