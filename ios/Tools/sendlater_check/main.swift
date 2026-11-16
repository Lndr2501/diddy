// Checks for Diddy/Matrix/SendLaterLogic.swift: quick picks, server vs. this iPhone, due checks
// and the server's delayed-event list, like the desktop's tests/sendLater.test.cjs.
// Foundation only, runs on macOS and Linux. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/SendLaterLogic.swift Tools/sendlater_check/main.swift -o /tmp/sendlater_check && /tmp/sendlater_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

var calendar = Calendar(identifier: .gregorian)
calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!

func local(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int = 0, _ s: Int = 0) -> Date {
    calendar.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi, second: s))!
}

typealias L = SendLaterLogic

// MARK: Quick picks

do {
    let picks = L.quickPicks(now: local(2026, 11, 16, 14, 23, 17), calendar: calendar)
    check(picks.map(\.pick) == [.hour, .evening, .tomorrow], "afternoon: all three picks")
    check(picks[0].at == local(2026, 11, 16, 15, 23), "one hour ahead, seconds dropped")
    check(picks[1].at == local(2026, 11, 16, 18), "this evening at 18:00")
    check(picks[2].at == local(2026, 11, 17, 9), "tomorrow at 9:00")
}
check(L.quickPicks(now: local(2026, 11, 16, 17, 31), calendar: calendar).map(\.pick) == [.hour, .tomorrow],
      "no evening less than half an hour before")
check(L.quickPicks(now: local(2026, 11, 16, 17, 30), calendar: calendar).map(\.pick) == [.hour, .evening, .tomorrow],
      "evening exactly half an hour before")
check(L.quickPicks(now: local(2026, 11, 16, 22), calendar: calendar).map(\.pick) == [.hour, .tomorrow], "no evening at night")
check(L.quickPicks(now: local(2026, 12, 31, 23, 50), calendar: calendar).last?.at == local(2027, 1, 1, 9), "tomorrow crosses the year")
// Daylight saving ends on 25 Oct 2026 in Berlin: tomorrow 9:00 is still 9:00 on the clock.
check(L.quickPicks(now: local(2026, 10, 24, 20), calendar: calendar).last?.at == local(2026, 10, 25, 9), "tomorrow across DST")

// MARK: Times

do {
    let now = local(2026, 11, 16, 12)
    check(L.check(now.addingTimeInterval(-1), now: now) == .past, "past")
    check(L.check(now, now: now) == .past, "now is past")
    check(L.check(now.addingTimeInterval(30), now: now) == .tooSoon, "half a minute is too soon")
    check(L.check(now.addingTimeInterval(60), now: now) == .ok, "a minute is fine")
    check(L.check(now.addingTimeInterval(400 * 86_400), now: now) == .tooFar, "more than a year is too far")
}
check(L.defaultCustomTime(now: local(2026, 11, 16, 12, 10), calendar: calendar) == local(2026, 11, 16, 14), "next full hour an hour away")
check(L.defaultCustomTime(now: local(2026, 11, 16, 12), calendar: calendar) == local(2026, 11, 16, 13), "exactly on the hour")
check(L.defaultCustomTime(now: local(2026, 11, 16, 23, 30), calendar: calendar) == local(2026, 11, 17, 1), "across midnight")

// MARK: Route

func route(support: Bool = true, delay: TimeInterval = 3600, max: TimeInterval? = nil, encrypted: Bool = false,
           ahead: Bool = false, preferLocal: Bool = false) -> L.RouteChoice {
    L.chooseRoute(serverSupport: support, delay: delay, maxDelay: max, encrypted: encrypted, canEncryptAhead: ahead, preferLocal: preferLocal)
}
check(route() == L.RouteChoice(route: .server, reason: .server), "server when it can")
check(route(support: false).reason == .noServerSupport, "no MSC4140")
check(route(delay: 7200, max: 3600).reason == .tooFarForServer, "beyond the server's limit")
check(route(delay: 3600, max: 3600).route == .server, "the limit itself is fine")
check(route(encrypted: true).reason == .encryptedLocal, "encrypted chats stay on the iPhone")
check(route(encrypted: true, ahead: true).route == .server, "with encryption ahead (desktop) the server")
check(route(preferLocal: true).reason == .chosenLocal, "chosen local")

// MARK: Server answers

let synapseError: [String: Any] = ["errcode": "M_UNKNOWN", "error": "too long",
                                   "org.matrix.msc4140.errcode": "M_MAX_DELAY_EXCEEDED",
                                   "org.matrix.msc4140.max_delay": 86_400_000]
check(L.maxDelayExceeded(synapseError) == L.MaxDelay(maxDelayMs: 86_400_000), "Synapse's limit")
let mscError: [String: Any] = ["errcode": "M_MAX_DELAY_EXCEEDED", "max_delay": 3_600_000]
check(L.maxDelayExceeded(mscError) == L.MaxDelay(maxDelayMs: 3_600_000), "MSC limit")
check(L.maxDelayExceeded(["errcode": "M_MAX_DELAY_EXCEEDED"]) == L.MaxDelay(maxDelayMs: nil), "limit not stated")
check(L.maxDelayExceeded(["errcode": "M_FORBIDDEN"]) == nil, "other errors")

do {
    let messageContent: [String: Any] = ["msgtype": "m.text", "body": "later"]
    let message: [String: Any] = ["delay_id": "b", "room_id": "!r:x", "type": "m.room.message", "delay": 7_200_000,
                                  "running_since": 1000, "content": messageContent]
    let encrypted: [String: Any] = ["delay_id": "a", "room_id": "!r:x", "type": "m.room.encrypted", "delay": 60_000,
                                    "running_since": 1000, "content": ["ciphertext": "x"] as [String: Any]]
    let callLeave: [String: Any] = ["delay_id": "c", "room_id": "!r:x", "type": "org.matrix.msc3401.call.member",
                                    "state_key": "_@me:x_DEV", "delay": 8000, "running_since": 1000, "content": [String: Any]()]
    let stateMessage: [String: Any] = ["delay_id": "d", "room_id": "!r:x", "type": "m.room.message", "state_key": "",
                                       "delay": 1, "content": [String: Any]()]
    let noDelay: [String: Any] = ["delay_id": "e", "room_id": "!r:x", "type": "m.room.message", "content": [String: Any]()]
    let list: [Any] = [message, encrypted, callLeave, stateMessage, noDelay, "junk"]
    let answer: [String: Any] = ["delayed_events": list]
    let parsed = L.parseDelayedEvents(answer)
    check(parsed.map(\.delayId) == ["a", "b"], "only scheduled messages, earliest first: \(parsed.map(\.delayId))")
    check(parsed.last?.body == "later", "plain body read")
    check(parsed.first?.sendAt == Date(timeIntervalSince1970: 61), "send time = running_since + delay")
    let newer: [String: Any] = ["scheduled": [message] as [Any], "finalised": [Any]()]
    check(L.parseDelayedEvents(newer).count == 1, "newer MSC shape")
    check(L.parseDelayedEvents([:]).isEmpty, "empty answer")
}

// MARK: Due and reconcile

func item(_ id: String, _ route: L.Route, _ sendAt: TimeInterval, delayId: String? = nil, createdAt: TimeInterval = 1) -> L.Scheduled {
    L.Scheduled(id: id, accountId: "acc", roomId: "!r", sendAt: Date(timeIntervalSince1970: sendAt),
                createdAt: Date(timeIntervalSince1970: createdAt), route: route, reason: route == .server ? .server : .chosenLocal,
                delayId: delayId, contentJSON: "{\"body\":\"hi\"}", draftText: "hi", replyEventId: nil)
}
do {
    let items = [item("1", .local, 300), item("2", .server, 100, delayId: "d"), item("3", .local, 100), item("4", .local, 900)]
    check(L.due(items, now: Date(timeIntervalSince1970: 300)).map(\.id) == ["3", "1"], "due local ones, oldest first")
    check(L.due(items, now: Date(timeIntervalSince1970: 99)).isEmpty, "nothing due yet")
    check(L.nextDueIn(items, now: Date(timeIntervalSince1970: 50)) == 50, "next local in 50 s")
    check(L.nextDueIn(items, now: Date(timeIntervalSince1970: 1000)) == 0, "overdue: now")
    check(L.nextDueIn([item("s", .server, 5, delayId: "x")], now: Date(timeIntervalSince1970: 0)) == nil, "server ones are not timed here")
    check(items[0].body == "hi", "body from the content")
}
check(!L.wasSentLate(sendAt: Date(timeIntervalSince1970: 0), sentAt: Date(timeIntervalSince1970: 120)), "two minutes is on time")
check(L.wasSentLate(sendAt: Date(timeIntervalSince1970: 0), sentAt: Date(timeIntervalSince1970: 121)), "later is late")
do {
    let items = [item("l", .local, 1), item("s1", .server, 1, delayId: "d1"), item("s2", .server, 1, delayId: "d2"),
                 item("s3", .server, 1, delayId: "d3", createdAt: 50)]
    let server = [L.ServerMessage(delayId: "d1", roomId: "!r", type: "m.room.message", body: "", sendAt: Date()),
                  L.ServerMessage(delayId: "d9", roomId: "!r", type: "m.room.message", body: "", sendAt: Date())]
    let r = L.reconcile(items, server: server, requestedAt: Date(timeIntervalSince1970: 50))
    check(r.keep.map(\.id) == ["l", "s1", "s3"], "kept: \(r.keep.map(\.id))")
    check(r.gone.map(\.id) == ["s2"], "gone from the server")
    check(r.others.map(\.delayId) == ["d9"], "scheduled elsewhere")
}

// MARK: Texts

check(L.countLabel(1) == "1 scheduled message", "one")
check(L.countLabel(3) == "3 scheduled messages", "many")
check(L.preview("\n  hello\nworld") == "hello", "first line")
check(L.preview(String(repeating: "x", count: 100), max: 10) == String(repeating: "x", count: 9) + "…", "shortened")
do {
    let now = local(2026, 11, 16, 14)
    let clock: (Date) -> String = { date in
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }
    check(L.formatSendAt(local(2026, 11, 16, 18), now: now, clock: clock, calendar: calendar) == "Today, 18:00", "today")
    check(L.formatSendAt(local(2026, 11, 17, 9), now: now, clock: clock, calendar: calendar) == "Tomorrow, 09:00", "tomorrow")
    check(L.formatSendAt(local(2026, 11, 20, 12, 30), now: now, clock: clock, calendar: calendar) == "Fri 20 Nov, 12:30", "weekday")
    check(L.formatSendAt(local(2027, 1, 4, 8), now: now, clock: clock, calendar: calendar) == "Mon 4 Jan 2027, 08:00", "other year")
}
check(L.formatDuration(86_400) == "1 day", "a day")
check(L.formatDuration(7 * 86_400) == "7 days", "days")
check(L.formatDuration(5400) == "1 hour", "hours")
check(L.formatDuration(1800) == "30 minutes", "minutes")

// MARK: Content

do {
    let content = L.messageContent(body: "hi **you**", html: "hi <strong>you</strong>", msgtype: "m.text",
                                   mentionedUserIds: ["@a:x"], replyEventId: "$e")
    check(content["msgtype"] as? String == "m.text", "msgtype")
    check(content["format"] as? String == "org.matrix.custom.html", "format with HTML")
    check(((content["m.relates_to"] as? [String: Any])?["m.in_reply_to"] as? [String: Any])?["event_id"] as? String == "$e", "reply")
    check((content["m.mentions"] as? [String: Any])?["user_ids"] as? [String] == ["@a:x"], "mentions")
    let plain = L.messageContent(body: "hi", html: nil, msgtype: "m.emote", mentionedUserIds: [], replyEventId: nil)
    check(plain["format"] == nil && plain["m.relates_to"] == nil, "plain message without HTML or reply")
    let small: [String: Any] = ["b": 1, "a": "x"]
    check(L.json(small) == "{\"a\":\"x\",\"b\":1}", "sorted JSON")
}

if failures > 0 {
    print("\(failures) send-later check(s) failed")
    exit(1)
}
print("send-later checks passed")
