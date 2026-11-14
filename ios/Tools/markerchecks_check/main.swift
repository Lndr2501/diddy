// Checks for Diddy/Matrix/DiddyMarkerChecks.swift. Run from the ios folder:
//   swiftc Diddy/Matrix/DiddyMarkerChecks.swift Tools/markerchecks_check/main.swift -o /tmp/markerchecks_check && /tmp/markerchecks_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

let now = Date(timeIntervalSince1970: 10_000_000)
var entries = DiddyMarkerChecks.merged([:], [("!opt", true), ("!no", false)], now: now)
var known = DiddyMarkerChecks.fresh(entries, now: now)
check(known.options == ["!opt"] && known.checked == ["!opt", "!no"], "answers are kept")
let later = now.addingTimeInterval(DiddyMarkerChecks.noLifetime + 1)
known = DiddyMarkerChecks.fresh(entries, now: later)
check(known.checked == ["!opt"], "a no expires after a week, a yes stays")

let defaults = UserDefaults(suiteName: "markerchecks-check")!
defaults.removePersistentDomain(forName: "markerchecks-check")
DiddyMarkerChecks.remember([("!a", false)], accountId: "acc", now: now, defaults: defaults)
DiddyMarkerChecks.remember([("!b", true)], accountId: "acc", now: now, defaults: defaults)
let stored = DiddyMarkerChecks.load(accountId: "acc", now: now, defaults: defaults)
check(stored.checked == ["!a", "!b"] && stored.options == ["!b"], "stored per account")
check(DiddyMarkerChecks.load(accountId: "other", now: now, defaults: defaults).checked.isEmpty, "other account empty")

var many: [(roomId: String, isOptions: Bool)] = (0..<(DiddyMarkerChecks.maxEntries + 5)).map { ("!r\($0)", false) }
many.append(("!keep", true))
entries = DiddyMarkerChecks.merged([:], many, now: now)
check(entries.count == DiddyMarkerChecks.maxEntries && entries["!keep"]?.options == true, "capped, options rooms kept")

if failures == 0 { print("markerchecks checks passed") } else { print("\(failures) failures"); exit(1) }
