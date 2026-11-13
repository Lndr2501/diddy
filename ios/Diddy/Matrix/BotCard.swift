import Foundation

/// Bot cards: a bot (the music bot) sends a normal message (`body` stays the plain text for every
/// other client) plus structured data in `content["dev.diddy.card"]`, which Diddy draws as a card.
/// This is a port of `cinny/src/app/plugins/botCard.ts` and `botCommands.ts` with the same limits.
/// Everything here is untrusted input from the network: only known kinds, strings are cut,
/// numbers must be finite, images only as mxc:// uris, links only http(s). Foundation only, so it
/// can be compiled and checked on its own (`ios/Tools/botcard_check.swift`).
/// Protocol description: docs/bot-cards.md

enum BotCardKeys {
    static let card = "dev.diddy.card"
    /// Set on the message a card button sends, so Diddy does not show it in the chat.
    static let action = "dev.diddy.card_action"
    static let commandsEvent = "dev.diddy.commands"
}

struct BotCardAction: Equatable {
    let label: String
    let send: String
}

struct BotCardQueueItem: Equatable {
    let title: String
    let artist: String?
    let duration: Double?
}

struct BotCardHelpItem: Equatable {
    let usage: String
    let desc: String
}

struct BotCardHelpGroup: Equatable {
    let title: String
    let items: [BotCardHelpItem]
}

struct BotCardChartItem: Equatable {
    let label: String
    let value: Double
    let sub: String?
}

struct BotCardChart: Equatable {
    let title: String
    let unit: String?
    let items: [BotCardChartItem]
}

/// Buttons of the player layout, each a bot command (`!cmd` or `!cmd arg`).
struct BotCardControls: Equatable {
    var prev: String?
    var toggle: String?
    var skip: String?
    /// The client appends the new value: `<volume> 80`.
    var volume: String?
}

struct BotCardUpNext: Equatable {
    let title: String
    let artist: String?
}

enum BotCardTrackState: String, CaseIterable {
    case searching, downloading, playing, paused, stopped, error
}

enum BotCardTone: String, CaseIterable {
    case info, success, warning, error
}

struct BotCardTrack: Equatable {
    let state: BotCardTrackState
    let title: String
    let artist: String?
    /// length in seconds
    let duration: Double?
    /// position in seconds at `startedAt`
    let position: Double?
    /// bot clock (epoch ms) when `position` was measured, so the client can run the bar itself
    let startedAt: Double?
    let thumbnail: String?
    let url: String?
    let source: String?
    let note: String?
    /// bot command for the timeline: a tap sends `<seek> <mm:ss>`, the adjust gesture `<seek> -10` / `+10`
    let seek: String?
    let volume: Double?
    let actions: [BotCardAction]
    // Player layout (docs/bot-cards.md, "Player-Karte"). With `controls` Diddy draws the player
    // and ignores `actions`; without it the card stays the classic one.
    /// room name for the "Now playing in" header
    var room: String? = nil
    /// display name of whoever asked for the track ("Autoplay" for autoplay picks)
    var requestedBy: String? = nil
    var upNext: [BotCardUpNext] = []
    var controls: BotCardControls? = nil
    /// upper end of the volume slider (default 100)
    var volumeMax: Double? = nil
    /// extra commands behind the "⋯" button
    var more: [BotCardAction] = []
}

enum BotCard: Equatable {
    case track(BotCardTrack)
    case queue(now: BotCardQueueItem?, items: [BotCardQueueItem], total: Int, actions: [BotCardAction])
    case help(groups: [BotCardHelpGroup], note: String?)
    case list(title: String, items: [BotCardQueueItem], total: Int, empty: String?, actions: [BotCardAction])
    case stats(title: String, charts: [BotCardChart], actions: [BotCardAction])
    case note(text: String, tone: BotCardTone, icon: String?)
}

enum BotCardParser {
    // MARK: Entry points

    /// The card of an event, from its raw JSON (the whole event, as the SDK's debug info gives it).
    /// An edit replaces the card with the one in its `m.new_content`, like on the desktop.
    static func card(originalJson: String?, latestEditJson: String?) -> BotCard? {
        guard let content = effectiveContent(originalJson: originalJson, latestEditJson: latestEditJson) else { return nil }
        return parse(content: content)
    }

    /// True for a command a card button sent for you (see `isActionMessage`).
    static func isAction(originalJson: String?) -> Bool {
        guard let content = effectiveContent(originalJson: originalJson, latestEditJson: nil) else { return false }
        return isActionMessage(content: content)
    }

    /// Cheap check before any JSON parsing: only text messages can carry a card or an action.
    static func mightHaveCard(_ json: String?) -> Bool {
        json?.contains(BotCardKeys.card) == true
    }

    private static func effectiveContent(originalJson: String?, latestEditJson: String?) -> [String: Any]? {
        func content(of json: String?) -> [String: Any]? {
            guard let json, let data = json.data(using: .utf8),
                  let event = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            else { return nil }
            return event["content"] as? [String: Any]
        }
        if let edit = content(of: latestEditJson), let replacement = edit["m.new_content"] as? [String: Any] {
            return replacement
        }
        return content(of: originalJson)
    }

    // MARK: Helpers (the `text`, `num`, `httpUrl`, `actions` of botCard.ts)

    /// Printable text, one piece, cut to `max` characters.
    static func text(_ value: Any?, _ max: Int) -> String? {
        guard let string = value as? String else { return nil }
        // Same set as the desktop: control characters other than tab, line feed and carriage return.
        let cleaned = String(String.UnicodeScalarView(string.unicodeScalars.filter { scalar in
            let v = scalar.value
            return !((v <= 0x08) || v == 0x0B || v == 0x0C || (v >= 0x0E && v <= 0x1F) || v == 0x7F)
        }))
        let trimmed = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        return trimmed.count > max ? String(trimmed.prefix(max - 1)) + "…" : trimmed
    }

    static func number(_ value: Any?, max: Double = 1e9) -> Double? {
        guard let n = value as? NSNumber, !isBool(n) else { return nil }
        let d = n.doubleValue
        return d.isFinite && d >= 0 && d <= max ? d : nil
    }

    static func isBool(_ value: Any?) -> Bool {
        guard let n = value as? NSNumber else { return false }
        return CFGetTypeID(n) == CFBooleanGetTypeID()
    }

    static func httpUrl(_ value: Any?) -> String? {
        guard let string = value as? String, string.count <= 2000,
              let components = URLComponents(string: string),
              let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = components.host, !host.isEmpty
        else { return nil }
        return string
    }

    /// `mxc://server/media`, nothing else.
    static func mxcUrl(_ value: Any?) -> String? {
        guard let string = value as? String, string.hasPrefix("mxc://") else { return nil }
        let rest = string.dropFirst("mxc://".count)
        let parts = rest.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        for part in parts where part.isEmpty || part.count > 255 || part.contains(where: { $0.isWhitespace }) { return nil }
        return string
    }

    private static func noWhitespace(_ string: String) -> Bool {
        !string.contains { $0.isWhitespace || $0.isNewline }
    }

    /// `^[!/][^\s]{1,max}$`
    private static func looksLikeCommand(_ string: String, tail: ClosedRange<Int>) -> Bool {
        guard let first = string.first, first == "!" || first == "/" else { return false }
        let rest = string.dropFirst()
        return tail.contains(rest.count) && noWhitespace(String(rest))
    }

    static func actions(_ value: Any?) -> [BotCardAction] {
        guard let list = value as? [Any] else { return [] }
        var out: [BotCardAction] = []
        for case let item as [String: Any] in list.prefix(10) {
            guard let label = text(item["label"], 24), let send = text(item["send"], 120) else { continue }
            // A button only types a bot command into the chat for you: it has to look like one.
            if looksLikeCommand(send, tail: 1...Int.max) { out.append(BotCardAction(label: label, send: send)) }
        }
        return out
    }

    /// A player button's command: `^[!/][^\s]{1,30}( [^\s]{1,20})?$`, at most 60 characters, so it
    /// still counts as a hidden card action after the client appends one argument (the volume).
    static func playerCommand(_ value: Any?) -> String? {
        guard let string = value as? String, string.count <= 60 else { return nil }
        let parts = string.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
        guard (1...2).contains(parts.count), looksLikeCommand(parts[0], tail: 1...30) else { return nil }
        if parts.count == 2, !((1...20).contains(parts[1].count) && noWhitespace(parts[1])) { return nil }
        return string
    }

    static func controls(_ value: Any?) -> BotCardControls? {
        guard let object = value as? [String: Any] else { return nil }
        return BotCardControls(prev: playerCommand(object["prev"]), toggle: playerCommand(object["toggle"]),
                               skip: playerCommand(object["skip"]), volume: playerCommand(object["volume"]))
    }

    static func upNext(_ value: Any?) -> [BotCardUpNext] {
        guard let list = value as? [Any] else { return [] }
        var out: [BotCardUpNext] = []
        for case let item as [String: Any] in list.prefix(20) where out.count < 3 {
            if let title = text(item["title"], 160) { out.append(BotCardUpNext(title: title, artist: text(item["artist"], 120))) }
        }
        return out
    }

    private static func queueItem(_ value: Any?) -> BotCardQueueItem? {
        guard let object = value as? [String: Any], let title = text(object["title"], 160) else { return nil }
        return BotCardQueueItem(title: title, artist: text(object["artist"], 120), duration: number(object["duration"], max: 86400 * 7))
    }

    // MARK: Parsing

    static func parse(content: [String: Any]) -> BotCard? {
        guard let raw = content[BotCardKeys.card] as? [String: Any],
              let version = raw["v"] as? NSNumber, !isBool(version), version.doubleValue == 1,
              let kind = raw["kind"] as? String
        else { return nil }

        switch kind {
        case "track":
            guard let title = text(raw["title"], 200),
                  let state = (raw["state"] as? String).flatMap(BotCardTrackState.init(rawValue:))
            else { return nil }
            let seek = (raw["seek"] as? String).flatMap { looksLikeCommand($0, tail: 1...30) ? $0 : nil }
            return .track(BotCardTrack(
                state: state,
                title: title,
                artist: text(raw["artist"], 120),
                duration: number(raw["duration"], max: 86400 * 7),
                position: number(raw["position"], max: 86400 * 7),
                startedAt: number(raw["startedAt"], max: 4e12),
                thumbnail: mxcUrl(raw["thumbnail"]),
                url: httpUrl(raw["url"]),
                source: text(raw["source"], 30),
                note: text(raw["note"], 200),
                seek: seek,
                volume: number(raw["volume"], max: 1000),
                actions: actions(raw["actions"]),
                room: text(raw["room"], 80),
                requestedBy: text(raw["requestedBy"], 80),
                upNext: upNext(raw["upNext"]),
                controls: controls(raw["controls"]),
                volumeMax: number(raw["volumeMax"], max: 1000).flatMap { $0 > 0 ? $0 : nil },
                more: actions(raw["more"])
            ))

        case "queue":
            let items = ((raw["items"] as? [Any]) ?? []).prefix(50).compactMap(queueItem)
            let total = number(raw["total"], max: 1e6).map { Int($0) } ?? items.count
            return .queue(now: queueItem(raw["now"]), items: Array(items), total: total, actions: actions(raw["actions"]))

        case "help":
            var groups: [BotCardHelpGroup] = []
            for case let group as [String: Any] in ((raw["groups"] as? [Any]) ?? []).prefix(12) {
                guard let title = text(group["title"], 60) else { continue }
                var items: [BotCardHelpItem] = []
                for case let item as [String: Any] in ((group["items"] as? [Any]) ?? []).prefix(20) {
                    if let usage = text(item["usage"], 120), let desc = text(item["desc"], 200) {
                        items.append(BotCardHelpItem(usage: usage, desc: desc))
                    }
                }
                if !items.isEmpty { groups.append(BotCardHelpGroup(title: title, items: items)) }
            }
            if groups.isEmpty { return nil }
            return .help(groups: groups, note: text(raw["note"], 400))

        case "list":
            guard let title = text(raw["title"], 100) else { return nil }
            let items = ((raw["items"] as? [Any]) ?? []).prefix(50).compactMap { entry -> BotCardQueueItem? in
                guard let object = entry as? [String: Any], let t = text(object["title"], 160) else { return nil }
                return BotCardQueueItem(title: t, artist: text(object["subtitle"], 120), duration: number(object["duration"], max: 86400 * 7))
            }
            let total = number(raw["total"], max: 1e6).map { Int($0) } ?? items.count
            return .list(title: title, items: Array(items), total: total, empty: text(raw["empty"], 200), actions: actions(raw["actions"]))

        case "stats":
            var charts: [BotCardChart] = []
            for case let chart as [String: Any] in ((raw["charts"] as? [Any]) ?? []).prefix(6) {
                guard let chartTitle = text(chart["title"], 80) else { continue }
                var items: [BotCardChartItem] = []
                for case let item as [String: Any] in ((chart["items"] as? [Any]) ?? []).prefix(15) {
                    if let label = text(item["label"], 120), let value = number(item["value"], max: 1e12) {
                        items.append(BotCardChartItem(label: label, value: value, sub: text(item["sub"], 60)))
                    }
                }
                if !items.isEmpty { charts.append(BotCardChart(title: chartTitle, unit: text(chart["unit"], 12), items: items)) }
            }
            guard let title = text(raw["title"], 100), !charts.isEmpty else { return nil }
            return .stats(title: title, charts: charts, actions: actions(raw["actions"]))

        case "note":
            guard let body = text(raw["text"], 300) else { return nil }
            let tone = (raw["tone"] as? String).flatMap(BotCardTone.init(rawValue:)) ?? .info
            return .note(text: body, tone: tone, icon: text(raw["icon"], 8))

        default:
            return nil
        }
    }

    // MARK: Hidden action messages

    /// A command that a card button sent for you ("!pause", "!seek 1:23", "!volume -10"): Diddy hides
    /// it in the timeline, the card itself changes instead. The flag alone is not enough, anybody
    /// could set it on any message, so only short bot-command-shaped texts count.
    static func isActionMessage(content: [String: Any]) -> Bool {
        guard content[BotCardKeys.action] as? Bool == true, isBool(content[BotCardKeys.action]),
              content["msgtype"] as? String == "m.text",
              let body = content["body"] as? String, body.count <= 60
        else { return false }
        let parts = body.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
        guard (1...3).contains(parts.count), looksLikeCommand(parts[0], tail: 1...30) else { return false }
        return parts.dropFirst().allSatisfy { (1...20).contains($0.count) && noWhitespace($0) }
    }

    /// Whether a text body could be a card action; only then the raw event is looked at.
    static func looksLikeActionBody(_ body: String) -> Bool {
        body.count <= 60 && (body.hasPrefix("!") || body.hasPrefix("/"))
    }

    /// The wire format of a card button or the seek bar, the same as the desktop sends.
    static func actionContent(_ command: String) -> String? {
        let object: [String: Any] = ["msgtype": "m.text", "body": command, BotCardKeys.action: true]
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: Time

    /// 3:17 or 1:02:03
    static func formatTime(_ seconds: Double) -> String {
        let s = Int(max(0, seconds).rounded(.down))
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }

    /// Playback position of a "playing" track now, in seconds (clamped to the length).
    static func livePosition(_ track: BotCardTrack, now: Date) -> Double? {
        guard let position = track.position else { return nil }
        var elapsed = 0.0
        if track.state == .playing, let startedAt = track.startedAt {
            elapsed = max(0, now.timeIntervalSince1970 - startedAt / 1000)
        }
        let live = position + elapsed
        return track.duration.map { min(live, $0) } ?? live
    }
}

// MARK: - Bot commands

struct BotCommand: Equatable, Identifiable {
    let name: String
    let usage: String
    let desc: String
    let prefix: String
    var id: String { prefix + name }
}

struct BotCommandList: Equatable {
    let prefix: String
    let commands: [BotCommand]
}

enum BotCommandParser {
    private static let prefixChars = Set("!%$.,;~?+*-")

    private static func short(_ value: Any?, _ max: Int) -> String? {
        guard let string = value as? String else { return nil }
        let cleaned = String(String.UnicodeScalarView(string.unicodeScalars.filter { $0.value > 0x1F && $0.value != 0x7F }))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.isEmpty { return nil }
        return cleaned.count > max ? String(cleaned.prefix(max - 1)) + "…" : cleaned
    }

    private static func isNamePart(_ scalar: Unicode.Scalar) -> Bool {
        if scalar == "_" || scalar == "/" || scalar == "-" { return true }
        switch scalar.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
             .decimalNumber, .letterNumber, .otherNumber:
            return true
        default:
            return false
        }
    }

    /// The command list of a `dev.diddy.commands` state event content, or nil when empty / invalid.
    static func parse(content: [String: Any]) -> BotCommandList? {
        guard let version = content["v"] as? NSNumber, !BotCardParser.isBool(version), version.doubleValue == 1,
              let prefix = content["prefix"] as? String,
              (1...2).contains(prefix.count), prefix.allSatisfy({ prefixChars.contains($0) })
        else { return nil }
        var commands: [BotCommand] = []
        for case let entry as [String: Any] in ((content["commands"] as? [Any]) ?? []).prefix(100) {
            guard let name = short(entry["name"], 30), name.unicodeScalars.allSatisfy(isNamePart) else { continue }
            commands.append(BotCommand(
                name: name,
                usage: short(entry["usage"], 120) ?? "\(prefix)\(name)",
                desc: short(entry["desc"], 160) ?? "",
                prefix: prefix
            ))
        }
        return commands.isEmpty ? nil : BotCommandList(prefix: prefix, commands: commands)
    }

    /// Suggestions for what is typed so far (including the prefix), best matches first.
    static func match(_ lists: [BotCommandList], typed: String, max: Int = 8) -> [BotCommand] {
        var out: [BotCommand] = []
        for list in lists where typed.hasPrefix(list.prefix) {
            let word = typed.dropFirst(list.prefix.count).lowercased()
            for command in list.commands where command.name.lowercased().hasPrefix(word) { out.append(command) }
        }
        // A typed word that equals a command exactly needs no suggestion any more.
        if out.count == 1, typed.dropFirst(out[0].prefix.count).lowercased() == out[0].name.lowercased() { return [] }
        return Array(out.prefix(max))
    }
}
