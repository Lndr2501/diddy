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
/// Rooms where members may not write state get the same data as normal events that carry the key
/// in `content["app.diddy.key"]` ("message mode"). This side reads the state and, in unencrypted
/// rooms, the newest message-mode events. Message-mode data in encrypted rooms is not read.
///
/// Everything here is written by other people, so it is checked like desktop does: the sender must
/// be a joined member, content is small, timestamps are plausible and every value is whitelisted.
enum DiddyEvents {
    static let marker = "app.diddy.options"
    static let profile = "app.diddy.profile"
    static let badge = "app.diddy.badge"
    static let award = "app.diddy.badge_award"
    static let keyField = "app.diddy.key"
    /// Desktop adds this to the topic of the options room so clients can find it in a server.
    static let topicTag = "[diddy-options]"
    static let maxContentBytes = 4096
}

struct DiddyBadge: Hashable, Identifiable {
    let id: String
    let name: String
    var emoji: String?
    var imageMxc: String?
    var color: String?
}

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
    var nameBold = false
    var nameItalic = false
    var cardFrom: String?
    var cardTo: String?
    var cardAccent: String?
    var bannerMxc: String?
    var nameplateColor: String?
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
            }
            nameBold = style["bold"] as? Bool ?? false
            nameItalic = style["italic"] as? Bool ?? false
        }
        if let card = raw["card"] as? [String: Any] {
            cardFrom = Self.color(card["from"])
            cardTo = Self.color(card["to"])
            cardAccent = Self.color(card["accent"])
            bannerMxc = Self.mxc(card["bannerMxc"])
        }
        if let plate = raw["nameplate"] as? [String: Any] { nameplateColor = Self.color(plate["color"]) }
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

    /// The 11 character creator tag of owner-bound badge ids (`ownerTag` in trust.ts, cyrb53).
    static func ownerTag(_ userId: String) -> String {
        var h1: UInt32 = 0xDEADBEEF
        var h2: UInt32 = 0x41C6CE57
        for unit in userId.utf16 {
            h1 = (h1 ^ UInt32(unit)) &* 2_654_435_761
            h2 = (h2 ^ UInt32(unit)) &* 1_597_334_677
        }
        h1 = ((h1 ^ (h1 >> 16)) &* 2_246_822_507) ^ ((h2 ^ (h2 >> 13)) &* 3_266_489_909)
        h2 = ((h2 ^ (h2 >> 16)) &* 2_246_822_507) ^ ((h1 ^ (h1 >> 13)) &* 3_266_489_909)
        let hash = 4_294_967_296 * UInt64(2_097_151 & h2) + UInt64(h1)
        let text = String(hash, radix: 36)
        return String(repeating: "0", count: max(0, 11 - text.count)) + text
    }
}

/// One version of a key, from a state event or a message-mode event.
private struct DiddyCandidate {
    let content: [String: Any]
    let ts: Int64
    let sender: String
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

extension MatrixAccount {
    /// Reads the Diddy profiles of everyone in the options rooms. Cheap to call often: it runs at
    /// most once a minute unless `force` is set.
    func loadDiddyProfiles(force: Bool = false) async {
        guard !diddyLoading else { return }
        if !force, let last = diddyLoadedAt, Date().timeIntervalSince(last) < 60 { return }
        diddyLoading = true
        defer { diddyLoading = false }
        diddyLoadedAt = Date()

        // The marker is checked once per room and session; most rooms answer "not found".
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
        let optionsRooms = diddyOptionsRooms.filter { joined.contains($0) }.sorted()

        var loaded: [(id: String, data: OptionsRoomData, encrypted: Bool)] = []
        for roomId in optionsRooms {
            if let room = await loadOptionsRoom(roomId) { loaded.append((roomId, room.data, room.encrypted)) }
        }
        diddyPrimaryRoom = loaded.first.map { (id: $0.id, encrypted: $0.encrypted) }

        // Profiles: the first room (by id, like desktop) with a valid profile of that user wins.
        var profiles: [String: DiddyProfile] = [:]
        var ownRaw: [String: Any]?
        for room in loaded {
            for (userId, _) in room.data.byKey[DiddyEvents.profile] ?? [:] where profiles[userId] == nil {
                guard let newest = room.data.newest(type: DiddyEvents.profile, key: userId, from: userId),
                      let profile = DiddyProfile(newest.content) else { continue }
                profiles[userId] = profile
                if userId == self.userId { ownRaw = newest.content }
            }
        }

        // Badges: definitions (global ones cannot be redefined) and the awards still in force.
        var definitions = Dictionary(uniqueKeysWithValues: DiddyBadge.global.map { ($0.id, $0) })
        var defCandidates: [String: [DiddyCandidate]] = [:]
        var owned: [String: Set<String>] = [:] // user → badge ids
        for room in loaded {
            for (id, list) in room.data.byKey[DiddyEvents.badge] ?? [:] where id.count <= 64 && definitions[id] == nil {
                defCandidates[id, default: []] += list
            }
            for (key, list) in room.data.byKey[DiddyEvents.award] ?? [:] {
                guard let bar = key.firstIndex(of: "|"), bar != key.startIndex else { continue }
                let badgeId = String(key[..<bar])
                let recipient = String(key[key.index(after: bar)...])
                if Self.awardInForce(recipient: recipient, list) { owned[recipient, default: []].insert(badgeId) }
            }
        }
        for (id, list) in defCandidates {
            if let def = Self.pickDefinition(id: id, list) { definitions[id] = def }
        }
        var badges: [String: [DiddyBadge]] = [:]
        for (userId, profile) in profiles {
            let mine = owned[userId] ?? []
            let shown = profile.shownBadges.filter { mine.contains($0) }.compactMap { definitions[$0] }
            if !shown.isEmpty { badges[userId] = Array(shown.prefix(4)) }
        }

        if diddyProfiles != profiles { diddyProfiles = profiles }
        if diddyBadges != badges { diddyBadges = badges }
        diddyOwnProfileRaw = ownRaw
    }

    /// Whether your own profile can be changed here without losing what desktop wrote: the
    /// primary options room must be one this side can read completely.
    var canEditDiddyProfile: Bool {
        guard let primary = diddyPrimaryRoom else { return false }
        return !primary.encrypted || diddyOwnProfileRaw != nil
    }

    /// Changes some fields of your Diddy profile and keeps all others, including ones this app does
    /// not know. `nil` removes a field.
    func updateDiddyProfile(_ changes: [String: Any?]) async throws {
        await loadDiddyProfiles(force: true)
        guard let primary = diddyPrimaryRoom, canEditDiddyProfile else {
            throw DiddyError("No Diddy Options room was found. Set one up in Diddy desktop first.")
        }
        var content = diddyOwnProfileRaw ?? [:]
        for (key, value) in changes { content[key] = value }
        content["v"] = 1
        content[DiddyEvents.keyField] = nil
        let path = "/_matrix/client/v3/rooms/\(Self.pathComponent(primary.id))/state/\(DiddyEvents.profile)/\(Self.pathComponent(userId))"
        // State events are never encrypted, so desktop only uses them in unencrypted rooms.
        var asState = !primary.encrypted
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
            content[DiddyEvents.keyField] = userId
            let data = try JSONSerialization.data(withJSONObject: content)
            _ = try await room.sendRaw(eventType: DiddyEvents.profile, content: String(decoding: data, as: UTF8.self))
        }
        await loadDiddyProfiles(force: true)
    }

    /// Hidden from channel lists like on desktop, where it only shows with developer tools on.
    func isDiddyOptionsRoom(_ roomId: String, topic: String? = nil) -> Bool {
        diddyOptionsRooms.contains(roomId) || topic?.contains(DiddyEvents.topicTag) == true
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
        func ingest(_ event: [String: Any], key: String?) {
            guard let type = event["type"] as? String, [DiddyEvents.profile, DiddyEvents.badge, DiddyEvents.award].contains(type),
                  let key, !key.isEmpty, key.count <= 300,
                  let sender = event["sender"] as? String, joined.contains(sender),
                  let ts = (event["origin_server_ts"] as? NSNumber)?.int64Value, ts <= now + 86_400_000,
                  var content = event["content"] as? [String: Any],
                  let size = try? JSONSerialization.data(withJSONObject: content).count, size <= DiddyEvents.maxContentBytes
            else { return }
            // A profile only ever belongs to the person who sent it.
            if type == DiddyEvents.profile && key != sender { return }
            content[DiddyEvents.keyField] = nil
            data.add(type: type, key: key, DiddyCandidate(content: content, ts: ts, sender: sender))
        }
        for event in state { ingest(event, key: event["state_key"] as? String) }
        if !encrypted {
            let filter = #"{"types":["app.diddy.profile","app.diddy.badge","app.diddy.badge_award"]}"#
            let query = filter.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
            if let page = try? await clientRequest(base + "/messages?dir=b&limit=300&filter=\(query)") {
                for case let event as [String: Any] in page["chunk"] as? [Any] ?? [] where event["state_key"] == nil {
                    ingest(event, key: (event["content"] as? [String: Any])?[DiddyEvents.keyField] as? String)
                }
            }
        }
        return (data, encrypted)
    }

    /// `resolveAwards` of trust.ts: one award per giver; the giver's or the recipient's newer empty
    /// event takes it back.
    private static func awardInForce(recipient: String, _ candidates: [DiddyCandidate]) -> Bool {
        var newest: [String: DiddyCandidate] = [:]
        for candidate in candidates where (newest[candidate.sender]?.ts ?? .min) < candidate.ts {
            newest[candidate.sender] = candidate
        }
        func isAward(_ candidate: DiddyCandidate) -> Bool { (candidate.content["by"] as? String).map { !$0.isEmpty } ?? false }
        let removed = newest[recipient].flatMap { isAward($0) ? nil : $0.ts }
        return newest.values.contains { candidate in
            guard isAward(candidate) else { return false }
            let at = (candidate.content["at"] as? NSNumber)?.int64Value ?? candidate.ts
            return removed.map { $0 <= at } ?? true
        }
    }

    /// `pickDefinition` of trust.ts: ids with a creator tag belong to that creator, older ids to
    /// whoever defined them first. The owner's newest version counts; an empty one deletes it.
    private static func pickDefinition(id: String, _ candidates: [DiddyCandidate]) -> DiddyBadge? {
        let tag = id.wholeMatch(of: #/c\.([0-9a-z]{11})\.[0-9a-z]+/#).map { String($0.1) }
        func isValid(_ candidate: DiddyCandidate) -> Bool {
            DiddyBadge(id: id, content: candidate.content) != nil
                && (candidate.content["createdBy"] == nil || candidate.content["createdBy"] as? String == candidate.sender)
        }
        let possible = candidates.filter { tag == nil || DiddyBadge.ownerTag($0.sender) == tag }.sorted { $0.ts < $1.ts }
        let owner = tag == nil ? possible.first(where: isValid)?.sender : nil
        let ofOwner = tag == nil ? possible.filter { $0.sender == owner } : possible
        guard let newest = ofOwner.last, isValid(newest) else { return nil }
        return DiddyBadge(id: id, content: newest.content)
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

/// A display name in the colour, gradient and weight the person chose in Diddy.
struct DiddyName: View {
    let name: String
    let profile: DiddyProfile?
    var font: Font = .body
    /// Used when there is no Diddy name colour.
    var fallback: Color = Theme.text

    var body: some View {
        let text = Text(name)
            .font(font)
            .fontWeight(profile?.nameBold == true ? .bold : nil)
            .italic(profile?.nameItalic == true)
        if let gradient = profile?.nameGradient, let from = Color(diddyHex: gradient.first), let to = Color(diddyHex: gradient.last) {
            text.foregroundStyle(LinearGradient(colors: [from, to], startPoint: .leading, endPoint: .trailing))
        } else {
            text.foregroundStyle(Color(diddyHex: profile?.nameColor) ?? fallback)
        }
    }
}

/// The badges someone chose to show next to their name.
struct DiddyBadges: View {
    let badges: [DiddyBadge]
    var size: CGFloat = 14
    var account: MatrixAccount?

    var body: some View {
        HStack(spacing: 3) {
            ForEach(badges) { badge in
                Group {
                    if let mxc = badge.imageMxc {
                        AvatarView(url: mxc, name: badge.name, size: size, cornerRadius: 3, account: account)
                    } else {
                        Text(badge.emoji ?? String(badge.name.prefix(1))).font(.system(size: size * 0.85))
                    }
                }
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
