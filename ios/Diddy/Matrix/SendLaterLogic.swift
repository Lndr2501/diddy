import Foundation

/// "Send later": the rules, like the desktop's sendLaterLogic.ts
/// (cinny/src/app/features/room/send-later/). Foundation only, checked by `Tools/sendlater_check`.
///
/// Two ways to send later:
/// - server: MSC4140 delayed events. The homeserver keeps the event and sends it at the time,
///   even when no Diddy runs. Only in unencrypted chats here: the Rust SDK cannot encrypt an
///   event without sending it, and a delayed event is stored as it is sent.
/// - local: the message waits on this iPhone and goes out when Diddy is open at that time, or the
///   next time it is opened (marked as sent late). iOS does not let the app run in the background.
enum SendLaterLogic {
    static let feature = "org.matrix.msc4140"
    static let delayParam = "org.matrix.msc4140.delay"

    /// At least a minute ahead, at most a year.
    static let minLead: TimeInterval = 60
    static let maxAhead: TimeInterval = 365 * 86_400
    /// A local message that goes out more than this after its time counts as sent late.
    static let lateAfter: TimeInterval = 120
    /// "This evening" is offered while it is at least half an hour away.
    static let eveningMinLead: TimeInterval = 30 * 60
    static let eveningHour = 18
    static let morningHour = 9

    enum Route: String, Codable { case server, local }

    enum Reason: String, Codable {
        case server
        case chosenLocal = "chosen-local"
        case noServerSupport = "no-server-support"
        case tooFarForServer = "too-far-for-server"
        case encryptedLocal = "encrypted-local"
        case serverFailed = "server-failed"
    }

    enum QuickPick: String, CaseIterable {
        case hour, evening, tomorrow

        var title: String {
            switch self {
            case .hour: return "In 1 Hour"
            case .evening: return "This Evening"
            case .tomorrow: return "Tomorrow Morning"
            }
        }
    }

    struct QuickPickTime: Equatable {
        let pick: QuickPick
        let at: Date
    }

    /// `hour:00` local time, `daysAhead` days after the day of `now`.
    static func atLocalHour(_ now: Date, daysAhead: Int, hour: Int, calendar: Calendar = .current) -> Date {
        let day = calendar.date(byAdding: .day, value: daysAhead, to: calendar.startOfDay(for: now)) ?? now
        return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day
    }

    /// In one hour (whole minute), today at 18:00 while it is at least half an hour away, tomorrow at 9:00.
    static func quickPicks(now: Date, calendar: Calendar = .current) -> [QuickPickTime] {
        let inAnHour = Date(timeIntervalSince1970: (floor(now.timeIntervalSince1970 / 60) * 60) + 3600)
        var picks = [QuickPickTime(pick: .hour, at: inAnHour)]
        let evening = atLocalHour(now, daysAhead: 0, hour: eveningHour, calendar: calendar)
        if evening.timeIntervalSince(now) >= eveningMinLead { picks.append(QuickPickTime(pick: .evening, at: evening)) }
        picks.append(QuickPickTime(pick: .tomorrow, at: atLocalHour(now, daysAhead: 1, hour: morningHour, calendar: calendar)))
        return picks
    }

    enum SendAtCheck: Equatable { case ok, past, tooSoon, tooFar }

    static func check(_ at: Date, now: Date) -> SendAtCheck {
        let ahead = at.timeIntervalSince(now)
        if ahead <= 0 { return .past }
        if ahead < minLead { return .tooSoon }
        if ahead > maxAhead { return .tooFar }
        return .ok
    }

    /// The free choice starts at the next full hour that is at least an hour away.
    static func defaultCustomTime(now: Date, calendar: Calendar = .current) -> Date {
        let later = now.addingTimeInterval(3600)
        let parts = calendar.dateComponents([.year, .month, .day, .hour], from: later)
        guard let fullHour = calendar.date(from: parts) else { return later }
        if fullHour == later { return later }
        return calendar.date(byAdding: .hour, value: 1, to: fullHour) ?? later
    }

    struct RouteChoice: Equatable {
        let route: Route
        let reason: Reason
    }

    /// The server when it can, otherwise this device.
    static func chooseRoute(serverSupport: Bool, delay: TimeInterval, maxDelay: TimeInterval?,
                            encrypted: Bool, canEncryptAhead: Bool, preferLocal: Bool) -> RouteChoice {
        if preferLocal { return RouteChoice(route: .local, reason: .chosenLocal) }
        if !serverSupport { return RouteChoice(route: .local, reason: .noServerSupport) }
        if let maxDelay, delay > maxDelay { return RouteChoice(route: .local, reason: .tooFarForServer) }
        if encrypted && !canEncryptAhead { return RouteChoice(route: .local, reason: .encryptedLocal) }
        return RouteChoice(route: .server, reason: .server)
    }

    static func number(_ value: Any?) -> Double? {
        if let value = value as? Int { return Double(value) }
        if let value = value as? Double { return value }
        if let value = value as? NSNumber { return value.doubleValue }
        return nil
    }

    /// A refused delay because it is too long: Synapse answers `M_UNKNOWN` with
    /// `org.matrix.msc4140.errcode: M_MAX_DELAY_EXCEEDED` and `org.matrix.msc4140.max_delay`, the MSC
    /// names `M_MAX_DELAY_EXCEEDED` and `max_delay`. nil for other errors.
    struct MaxDelay: Equatable {
        /// The limit in milliseconds, when the server said it.
        let maxDelayMs: Int?
    }

    static func maxDelayExceeded(_ error: [String: Any]) -> MaxDelay? {
        let code = error["errcode"] as? String
        let unstable = error["\(feature).errcode"] as? String
        guard code == "M_MAX_DELAY_EXCEEDED" || unstable == "M_MAX_DELAY_EXCEEDED" else { return nil }
        let raw = number(error["\(feature).max_delay"]) ?? number(error["max_delay"])
        if let raw, raw > 0 { return MaxDelay(maxDelayMs: Int(raw)) }
        return MaxDelay(maxDelayMs: nil)
    }

    struct ServerMessage: Equatable {
        let delayId: String
        let roomId: String
        let type: String
        /// The plain body; empty for an encrypted one.
        let body: String
        let sendAt: Date
    }

    /// The scheduled timeline messages of `GET /delayed_events` (Synapse: `delayed_events`, the
    /// current MSC: `scheduled`). State events (Element Call's "left the call") are left out.
    static func parseDelayedEvents(_ json: [String: Any]) -> [ServerMessage] {
        let list = (json["scheduled"] as? [Any]) ?? (json["delayed_events"] as? [Any]) ?? []
        var result: [ServerMessage] = []
        for item in list {
            guard let event = item as? [String: Any],
                  let delayId = event["delay_id"] as? String,
                  let roomId = event["room_id"] as? String,
                  let type = event["type"] as? String, type == "m.room.message" || type == "m.room.encrypted",
                  event["state_key"] == nil,
                  let delay = number(event["delay"]),
                  let content = event["content"] as? [String: Any] else { continue }
            let since = number(event["running_since"]) ?? 0
            result.append(ServerMessage(delayId: delayId, roomId: roomId, type: type,
                                        body: content["body"] as? String ?? "",
                                        sendAt: Date(timeIntervalSince1970: (since + delay) / 1000)))
        }
        return result.sorted { $0.sendAt < $1.sendAt }
    }

    /// What this iPhone keeps for every message it scheduled (both routes).
    struct Scheduled: Codable, Equatable, Identifiable {
        var id: String
        var accountId: String
        var roomId: String
        var sendAt: Date
        var createdAt: Date
        var route: Route
        var reason: Reason
        var delayId: String?
        /// The event content as JSON, sent as it is.
        var contentJSON: String
        /// The composer text, put back when editing.
        var draftText: String
        var replyEventId: String?

        var body: String {
            guard let data = contentJSON.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return draftText }
            return json["body"] as? String ?? draftText
        }
    }

    /// Local messages whose time has come, oldest first.
    static func due(_ items: [Scheduled], now: Date) -> [Scheduled] {
        items.filter { $0.route == .local && $0.sendAt <= now }.sorted { $0.sendAt < $1.sendAt }
    }

    /// Seconds until the next local message is due, nil without one.
    static func nextDueIn(_ items: [Scheduled], now: Date) -> TimeInterval? {
        guard let next = items.filter({ $0.route == .local }).map(\.sendAt).min() else { return nil }
        return max(0, next.timeIntervalSince(now))
    }

    static func wasSentLate(sendAt: Date, sentAt: Date) -> Bool {
        sentAt.timeIntervalSince(sendAt) > lateAfter
    }

    struct Reconciled: Equatable {
        var keep: [Scheduled]
        var gone: [Scheduled]
        var others: [ServerMessage]
    }

    /// Compares the records with the server's list (only with a list the server really returned).
    /// Records made after the list was asked for may be missing from it and stay.
    static func reconcile(_ items: [Scheduled], server: [ServerMessage], requestedAt: Date) -> Reconciled {
        let serverIds = Set(server.map(\.delayId))
        var known: Set<String> = []
        var result = Reconciled(keep: [], gone: [], others: [])
        for item in items {
            guard item.route == .server, let delayId = item.delayId else { result.keep.append(item); continue }
            known.insert(delayId)
            if serverIds.contains(delayId) || item.createdAt >= requestedAt { result.keep.append(item) } else { result.gone.append(item) }
        }
        result.others = server.filter { !known.contains($0.delayId) }
        return result
    }

    static func countLabel(_ count: Int) -> String {
        "\(count) scheduled message\(count == 1 ? "" : "s")"
    }

    /// First non-empty line, shortened.
    static func preview(_ body: String, max: Int = 80) -> String {
        let line = body.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty } ?? ""
        guard line.count > max else { return line }
        return String(line.prefix(max - 1)).trimmingCharacters(in: .whitespaces) + "…"
    }

    /// "Today, 18:00", "Tomorrow, 09:00", "Mon 17 Nov, 09:00" (year added when it differs).
    static func formatSendAt(_ at: Date, now: Date, clock: (Date) -> String, calendar: Calendar = .current) -> String {
        let time = clock(at)
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: at)).day ?? 0
        if days == 0 { return "Today, \(time)" }
        if days == 1 { return "Tomorrow, \(time)" }
        if days == -1 { return "Yesterday, \(time)" }
        let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let parts = calendar.dateComponents([.weekday, .day, .month, .year], from: at)
        let year = parts.year != calendar.component(.year, from: now) ? " \(parts.year ?? 0)" : ""
        let weekday = weekdays[((parts.weekday ?? 1) - 1) % 7]
        let month = months[((parts.month ?? 1) - 1) % 12]
        return "\(weekday) \(parts.day ?? 1) \(month)\(year), \(time)"
    }

    /// "1 day", "12 hours", "30 minutes": the server's limit.
    static func formatDuration(_ seconds: TimeInterval) -> String {
        func unit(_ n: Int, _ word: String) -> String { "\(n) \(word)\(n == 1 ? "" : "s")" }
        let s = Int(seconds)
        if s >= 86_400, s % 86_400 == 0 { return unit(s / 86_400, "day") }
        if s >= 3600 { return unit(s / 3600, "hour") }
        return unit(Swift.max(1, s / 60), "minute")
    }

    /// The text message as the desktop builds it: body, HTML when it says more, mentions, reply.
    static func messageContent(body: String, html: String?, msgtype: String, mentionedUserIds: [String],
                               replyEventId: String?) -> [String: Any] {
        var content: [String: Any] = ["msgtype": msgtype, "body": body]
        content["m.mentions"] = ["user_ids": mentionedUserIds]
        if let html {
            content["format"] = "org.matrix.custom.html"
            content["formatted_body"] = html
        }
        if let replyEventId {
            content["m.relates_to"] = ["m.in_reply_to": ["event_id": replyEventId]]
        }
        return content
    }

    static func json(_ object: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }

    /// What the route means, for the menu and the overview.
    static func explanation(_ choice: RouteChoice, maxDelay: TimeInterval?) -> (title: String, text: String) {
        if choice.route == .server {
            return ("Sent by the server", "Your homeserver sends it at that time, even if Diddy is closed.")
        }
        let local = "Sent by this iPhone when Diddy is open at that time; otherwise as soon as you open Diddy again (marked as sent late)."
        let why: String
        switch choice.reason {
        case .noServerSupport: why = "Your homeserver does not support scheduled messages. "
        case .tooFarForServer:
            why = maxDelay.map { "Your homeserver schedules at most \(formatDuration($0)) ahead. " } ?? "Your homeserver does not accept such a long delay. "
        case .encryptedLocal: why = "Encrypted chat: the iPhone app cannot encrypt a message ahead of time. "
        case .serverFailed: why = "Your homeserver could not schedule it. "
        case .server, .chosenLocal: why = ""
        }
        return ("Only while Diddy runs", why + local)
    }
}
