// Checks for Diddy/Matrix/TimelineNavLogic.swift. Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/TimelineNavLogic.swift Tools/timelinenav_check/main.swift -o /tmp/timelinenav_check && /tmp/timelinenav_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

typealias E = TimelineNav.Entry
let me = "@me:x"

// A hidden state event, then messages: "$b" was read last.
let entries: [E] = [
    E(eventId: "$a", rowId: "ra", sender: "@x:x"),
    E(eventId: "$b", rowId: "rb", sender: "@x:x", readers: ["@me:x"]),
    E(eventId: "$state", rowId: nil, sender: "@y:x"),
    E(eventId: "$c", rowId: "rc", sender: me),
    E(eventId: "$d", rowId: "rd", sender: "@y:x", readers: ["@y:x", "@z:x"]),
    E(eventId: "$e", rowId: "re", sender: "@x:x", readers: ["@x:x"]),
]

// New Messages: skips the hidden event and your own message, like the desktop.
check(TimelineNav.newDividerRowId(entries, readUpTo: "$b", me: me) == "rd", "divider above the first shown message of someone else")
check(TimelineNav.newDividerRowId(entries, readUpTo: "$e", me: me) == nil, "no divider when the newest is read")
check(TimelineNav.newDividerRowId(entries, readUpTo: nil, me: me) == nil, "no divider without receipt")
check(TimelineNav.newDividerRowId(entries, readUpTo: "$a", me: me) == "rb", "divider right after the read message")

// Seen by: everyone at the event or later, latest first, once each.
check(TimelineNav.readers(of: "$d", in: entries) == ["@x:x", "@y:x", "@z:x"], "readers of $d: \(TimelineNav.readers(of: "$d", in: entries))")
check(TimelineNav.readers(of: "$e", in: entries) == ["@x:x"], "readers of the newest")
check(TimelineNav.readers(of: "$a", in: entries).count == 4, "readers of the oldest include everyone")
check(TimelineNav.readers(of: "~txn", in: entries).isEmpty, "no readers for local echo")
check(TimelineNav.readers(of: "$missing", in: entries).isEmpty, "no readers for unknown event")
check(TimelineNav.latestShownEventId(entries) == "$e", "latest shown event")
check(TimelineNav.latestShownEventId(entries + [E(eventId: "$hidden", rowId: nil, sender: "@x:x")]) == "$e", "latest shown skips hidden")

// The following line, word for word like the desktop.
func joined(_ names: [String]) -> String { TimelineNav.following(names).map { $0.text }.joined() }
check(joined([]) == "", "nobody")
check(joined(["A"]) == "A is following the conversation.", joined(["A"]))
check(joined(["A", "B"]) == "A and B are following the conversation.", joined(["A", "B"]))
check(joined(["A", "B", "C"]) == "A, B and C are following the conversation.", joined(["A", "B", "C"]))
check(joined(["A", "B", "C", "D", "E"]) == "A, B, C and 2 others are following the conversation.", joined(["A", "B", "C", "D", "E"]))
check(TimelineNav.following(["A", "B"]).filter { $0.bold }.map { $0.text } == ["A", "B"], "names in bold")

// The quiet "Seen by" line, like the desktop: one name, else the count.
check(TimelineNav.seenBy([]) == "", "nobody has read it")
check(TimelineNav.seenBy(["Anton"]) == "Seen by Anton", TimelineNav.seenBy(["Anton"]))
check(TimelineNav.seenBy(["A", "B", "C", "D"]) == "Seen by 4", TimelineNav.seenBy(["A", "B", "C", "D"]))

// Jumping to a hidden event lands on the next shown row, or the one before at the end.
check(TimelineNav.rowId(for: "$c", in: entries) == "rc", "own row")
check(TimelineNav.rowId(for: "$state", in: entries) == "rc", "next shown row")
check(TimelineNav.rowId(for: "$x", in: entries) == nil, "unknown event")
check(TimelineNav.rowId(for: "$h", in: [E(eventId: "$a", rowId: "ra", sender: "@x:x"), E(eventId: "$h", rowId: nil, sender: "@x:x")]) == "ra", "hidden last event")

// Jump to time.
let path = TimelineNav.timestampToEventPath(roomId: "!r/x:s", date: Date(timeIntervalSince1970: 1_700_000_000.5))
check(path == "/_matrix/client/v1/rooms/!r%2Fx:s/timestamp_to_event?ts=1700000000500&dir=f", path)
var calendar = Calendar(identifier: .gregorian)
calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
let presets = TimelineNav.presets(now: Date(timeIntervalSince1970: 1_700_000_000), calendar: calendar)
check(presets.today.timeIntervalSince1970 == 1_699_916_400, "today midnight: \(presets.today.timeIntervalSince1970)")
check(presets.yesterday.timeIntervalSince1970 == 1_699_830_000, "yesterday midnight")

// Thread relation like RoomInput.tsx.
let relation = TimelineNav.threadRelationJSON(root: "$root", replyTo: "$root")
check(relation == #"{"m.relates_to":{"event_id":"$root","is_falling_back":false,"m.in_reply_to":{"event_id":"$root"},"rel_type":"m.thread"}}"#, relation ?? "nil")
let plain = TimelineNav.threadRelationJSON(root: "$root", replyTo: "$last", fallback: true)
check(plain == #"{"m.relates_to":{"event_id":"$root","is_falling_back":true,"m.in_reply_to":{"event_id":"$last"},"rel_type":"m.thread"}}"#, plain ?? "nil")

// Report.
check(TimelineNav.reportPath(roomId: "!a:b", eventId: "$e/v?") == "/_matrix/client/v3/rooms/!a:b/report/$e%2Fv%3F", TimelineNav.reportPath(roomId: "!a:b", eventId: "$e/v?"))
check(TimelineNav.reportBody(reason: " spam ")["score"] as? Int == -100, "score with reason")
check(TimelineNav.reportBody(reason: " spam ")["reason"] as? String == "spam", "trimmed reason")
check(TimelineNav.reportBody(reason: "  ")["score"] as? Int == -50, "score without reason")
check(TimelineNav.reportBody(reason: "")["reason"] as? String == "No reason provided", "default reason")

// Delete permissions.
check(TimelineNav.canDelete(isOwn: true, isRedacted: false, canRedactOwn: true, canRedactOther: false), "own")
check(!TimelineNav.canDelete(isOwn: false, isRedacted: false, canRedactOwn: true, canRedactOther: false), "others' without power")
check(TimelineNav.canDelete(isOwn: false, isRedacted: false, canRedactOwn: false, canRedactOther: true), "moderator")
check(!TimelineNav.canDelete(isOwn: true, isRedacted: true, canRedactOwn: true, canRedactOther: true), "already deleted")
check(!TimelineNav.canDelete(isOwn: true, isRedacted: false, canRedactOwn: false, canRedactOther: false), "own without power")

// View Source.
check(TimelineNav.sourceText(original: nil, latestEdit: nil) == "{}", "no source")
check(TimelineNav.sourceText(original: "not json", latestEdit: nil) == "not json", "raw text kept")
let single = TimelineNav.sourceText(original: #"{"type":"m.room.message","content":{"body":"hi"}}"#, latestEdit: nil)
check(single.contains("\"body\" : \"hi\"") && single.contains("\n"), "pretty printed: \(single)")
let both = TimelineNav.sourceText(original: #"{"a":1}"#, latestEdit: #"{"b":2}"#)
check(both.contains("<== MAIN_EVENT ==>") && both.contains("<== REPLACEMENT_EVENT_1 ==>"), "edit headings")
if let main = both.range(of: "MAIN_EVENT"), let edit = both.range(of: "REPLACEMENT_EVENT_1") {
    check(main.lowerBound < edit.lowerBound, "main event first")
}
check(!TimelineNav.sourceText(original: #"{"a":1}"#, latestEdit: #"{"a":1}"#).contains("MAIN_EVENT"), "same edit not repeated")

if failures == 0 {
    print("timelinenav_check: all passed")
} else {
    print("timelinenav_check: \(failures) failure(s)")
    exit(1)
}
