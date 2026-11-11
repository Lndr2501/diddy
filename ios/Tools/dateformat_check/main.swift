// Checks for Diddy/App/DateFormatRules.swift (desktop date formats on iOS). Foundation only.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/App/DateFormatRules.swift Tools/dateformat_check/main.swift -o /tmp/dateformat_check && /tmp/dateformat_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

let utc = TimeZone(identifier: "UTC")!
var calendar = Calendar(identifier: .gregorian)
calendar.timeZone = utc
// Wednesday, 11 November 2026, 14:05:09 UTC; and Sunday, 3 May 2026 for single digits.
let date = calendar.date(from: DateComponents(year: 2026, month: 11, day: 11, hour: 14, minute: 5, second: 9))!
let sunday = calendar.date(from: DateComponents(year: 2026, month: 5, day: 3, hour: 9, minute: 7))!

func format(_ f: String, _ d: Date = date) -> String { DateFormatRules.string(from: d, format: f, timeZone: utc) }

// The desktop presets.
check(format("D MMM YYYY") == "11 Nov 2026", "D MMM YYYY: \(format("D MMM YYYY"))")
check(format("DD/MM/YYYY") == "11/11/2026", "DD/MM/YYYY: \(format("DD/MM/YYYY"))")
check(format("MM/DD/YYYY") == "11/11/2026", "MM/DD/YYYY")
check(format("YYYY/MM/DD") == "2026/11/11", "YYYY/MM/DD")
check(format("YYYY-MM-DD") == "2026-11-11", "YYYY-MM-DD")
check(format("D MMM YYYY", sunday) == "3 May 2026", "single-digit day: \(format("D MMM YYYY", sunday))")
check(format("DD/MM/YY", sunday) == "03/05/26", "padded day and month, two-digit year: \(format("DD/MM/YY", sunday))")
check(format("") == "11 Nov 2026", "empty format falls back to the default")
check(DateFormatRules.presets.first == DateFormatRules.defaultFormat, "default is the first preset")

// Every token from the desktop's formatting help.
check(format("M") == "11", "M")
check(format("MMMM") == "November", "MMMM: \(format("MMMM"))")
check(format("d") == "3", "d is Sunday = 0, Wednesday = 3: \(format("d"))")
check(format("d", sunday) == "0", "d on a Sunday is 0")
check(format("dd") == "We", "dd is a two-letter day name: \(format("dd"))")
check(format("ddd") == "Wed", "ddd: \(format("ddd"))")
check(format("dddd") == "Wednesday", "dddd: \(format("dddd"))")
check(format("dddd, D MMMM") == "Wednesday, 11 November", "full day and month names")

// Times, escapes and letters that are not tokens.
check(format("HH:mm:ss") == "14:05:09", "time: \(format("HH:mm:ss"))")
check(format("h A") == "2 PM", "12-hour with AM/PM: \(format("h A"))")
check(format("[Week] D") == "Week 11", "bracketed text is literal: \(format("[Week] D"))")
check(format("D [o'clock]") == "11 o'clock", "quote inside escaped text: \(format("D [o'clock]"))")
check(format("YYYY x") == "2026 x", "a letter that is no token stays text: \(format("YYYY x"))")
check(format("D.M.YYYY") == "11.11.2026", "dots: \(format("D.M.YYYY"))")
check(format("[DD") == "[11", "an unclosed bracket is text, the rest still formats: \(format("[DD"))")

// Pieces.
check(DateFormatRules.pieces("D MMM") == [.field("d"), .text(" "), .field("MMM")], "pieces of D MMM")
check(DateFormatRules.pieces("MMMMD") == [.field("MMMM"), .field("d")], "longest token first")
check(DateFormatRules.quoted("ab'c") == "'ab''c'", "quoting doubles quotes")
check(DateFormatRules.quoted("/-. ") == "/-. ", "no quotes without letters")

if failures == 0 {
    print("dateformat_check: all checks passed")
} else {
    print("dateformat_check: \(failures) failure(s)")
    exit(1)
}
