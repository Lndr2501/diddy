// Checks for Diddy/Matrix/TimelineLayout.swift. Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc Diddy/Matrix/TimelineLayout.swift Tools/timeline_check/main.swift -o /tmp/timeline_check && /tmp/timeline_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

let t0 = Date(timeIntervalSince1970: 1_800_000_000)
func at(_ minutes: Double) -> Date { t0.addingTimeInterval(minutes * 60) }
typealias Entry = TimelineLayout.Entry

/// The header flags of a row list, the way `TimelineController.rebuild()` computes them.
func headers(_ entries: [Entry]) -> [Bool] {
    var previous: Entry?
    return entries.map { entry -> Bool in
        defer { previous = entry }
        return !TimelineLayout.continuesGroup(entry, after: previous)
    }
}

// MARK: Grouping

let bot = "@music:example.org"
let me = "@luis:example.org"

// The screenshot: the bot invites you (a notice sent by the bot), then writes. Its message must
// show avatar and name although the line above has the same sender.
check(headers([
    Entry(sender: bot, date: at(0), kind: .notice, hasDayDivider: true),
    Entry(sender: bot, date: at(0.1), kind: .message),
]) == [true, true], "first message after a notice of the same sender keeps its header")

// A notice never continues a group, not even after a message of its sender.
check(headers([
    Entry(sender: bot, date: at(0), kind: .message),
    Entry(sender: bot, date: at(0.1), kind: .notice),
]) == [true, true], "a notice after a message is no continuation")

// A burst of messages groups; the window, a reply and a day divider start a new group.
check(headers([
    Entry(sender: bot, date: at(0), kind: .message),
    Entry(sender: bot, date: at(1), kind: .message),
    Entry(sender: bot, date: at(6.9), kind: .message),
]) == [true, false, false], "messages within 7 minutes group")
check(headers([
    Entry(sender: bot, date: at(0), kind: .message),
    Entry(sender: bot, date: at(7), kind: .message),
]) == [true, true], "7 minutes apart start a new group")
check(headers([
    Entry(sender: bot, date: at(0), kind: .message),
    Entry(sender: bot, date: at(1), kind: .message, isReply: true),
]) == [true, true], "a reply shows its header")
check(headers([
    Entry(sender: bot, date: at(0), kind: .message),
    Entry(sender: bot, date: at(1), kind: .message, hasDayDivider: true),
]) == [true, true], "a day divider starts a new group")
check(headers([
    Entry(sender: bot, date: at(0), kind: .message),
    Entry(sender: me, date: at(1), kind: .message),
    Entry(sender: bot, date: at(2), kind: .message),
]) == [true, true, true], "another sender in between starts a new group")
check(headers([Entry(sender: bot, date: at(0), kind: .message)]) == [true], "the first row has a header")
// Clocks of servers differ a little; a message stamped slightly earlier still groups.
check(headers([
    Entry(sender: bot, date: at(1), kind: .message),
    Entry(sender: bot, date: at(0.5), kind: .message),
]) == [true, false], "small negative gap still groups")

// MARK: Membership wording

check(TimelineLayout.Membership.joined.text(name: "Luis") == "Luis joined", "joined text")
check(TimelineLayout.Membership.invited.text(name: "Luis") == "Luis was invited", "invited text")
check(TimelineLayout.Membership.declined.text(name: "Luis") == "Luis declined the invite", "declined text")
check(TimelineLayout.Membership.left.isDeparture && TimelineLayout.Membership.banned.isDeparture
      && TimelineLayout.Membership.removed.isDeparture && TimelineLayout.Membership.declined.isDeparture,
      "leaving changes are departures")
check(!TimelineLayout.Membership.joined.isDeparture && !TimelineLayout.Membership.invited.isDeparture
      && !TimelineLayout.Membership.unbanned.isDeparture, "joins and invites are no departures")

// MARK: Setup lines of a direct message

typealias Item = TimelineLayout.Item
// The screenshot's DM: bot joins, invites you, writes, you join, the bot writes again.
let screenshot: [Item] = [
    .other(at(0)),                     // a call notice or similar, never hidden
    .membership(.joined, at(0)),
    .membership(.invited, at(0)),
    .message(at(0.2)),
    .membership(.joined, at(0.5)),
    .message(at(8)),
]
check(TimelineLayout.hiddenSetupLines(screenshot, isDirect: true, createdAt: at(0)) == [1, 2, 4],
      "creation burst of a DM is hidden, messages and other lines stay")
check(TimelineLayout.hiddenSetupLines(screenshot, isDirect: false, createdAt: at(0)).isEmpty,
      "channels keep every line")
check(TimelineLayout.hiddenSetupLines(screenshot, isDirect: true, createdAt: nil).isEmpty,
      "nothing is hidden while the start of the room is unknown")

// The other person accepts a day later, before anyone wrote: still setup.
check(TimelineLayout.hiddenSetupLines([
    .membership(.joined, at(0)), .membership(.invited, at(0)), .membership(.joined, at(24 * 60)),
], isDirect: true, createdAt: at(0)) == [0, 1, 2], "late accept before the first message is setup")

// After messages and outside the window a join is a real change.
check(TimelineLayout.hiddenSetupLines([
    .membership(.joined, at(0)), .message(at(1)), .membership(.joined, at(60)),
], isDirect: true, createdAt: at(0)) == [0], "a join an hour later after messages stays")

// Leaving is always shown, and a rejoin after it too, even inside the window.
check(TimelineLayout.hiddenSetupLines([
    .membership(.joined, at(0)), .membership(.left, at(1)), .membership(.joined, at(2)),
], isDirect: true, createdAt: at(0)) == [0], "leave and rejoin stay visible")
check(TimelineLayout.hiddenSetupLines([
    .membership(.invited, at(0)), .membership(.declined, at(1)), .membership(.invited, at(2)),
], isDirect: true, createdAt: at(0)) == [0], "a declined invite and the next invite stay")
// Bans and unbans are never setup.
check(TimelineLayout.hiddenSetupLines([
    .membership(.unbanned, at(0)), .membership(.banned, at(1)),
], isDirect: true, createdAt: at(0)).isEmpty, "unban and ban stay")

// The day divider says Today and Yesterday by the calendar day, not by 24 hours.
var utc = Calendar(identifier: .gregorian)
utc.timeZone = TimeZone(identifier: "UTC")!
let noon = Date(timeIntervalSince1970: 1_794_484_800) // 2026-11-12 12:00 UTC
check(TimelineLayout.day(of: noon.addingTimeInterval(-11 * 3600), now: noon, calendar: utc) == .today, "early this morning is today")
check(TimelineLayout.day(of: noon.addingTimeInterval(-13 * 3600), now: noon, calendar: utc) == .yesterday, "late last night is yesterday")
check(TimelineLayout.day(of: noon.addingTimeInterval(-36 * 3600 + 60), now: noon, calendar: utc) == .yesterday, "yesterday morning")
check(TimelineLayout.day(of: noon.addingTimeInterval(-37 * 3600), now: noon, calendar: utc) == .earlier, "the day before yesterday")
check(TimelineLayout.day(of: noon.addingTimeInterval(13 * 3600), now: noon, calendar: utc) == .earlier, "tomorrow is a date")

if failures == 0 { print("ALL OK") } else { print("\(failures) FAILED"); exit(1) }
