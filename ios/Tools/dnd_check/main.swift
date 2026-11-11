// Checks for Diddy/Matrix/DoNotDisturb.swift: which alerts Do Not Disturb silences, like desktop's
// silencesAlerts (cinny/src/app/plugins/diddy/dnd.ts). Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/DoNotDisturb.swift Tools/dnd_check/main.swift -o /tmp/dnd_check && /tmp/dnd_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

// MARK: Which status is Do Not Disturb

check(DoNotDisturb.isOn("dnd"), "dnd is on")
check(!DoNotDisturb.isOn("online"), "online is not")
check(!DoNotDisturb.isOn("idle"), "idle is not")
check(!DoNotDisturb.isOn("invisible"), "invisible is not")
check(!DoNotDisturb.isOn(nil), "unknown status is not")
check(!DoNotDisturb.isOn("DND"), "the raw value is case sensitive, like Diddy's stored status")

// MARK: Sounds

let every: [DoNotDisturb.Alert] = [.message, .mention, .invite, .incomingCall, .other]
for alert in every {
    check(!DoNotDisturb.silencesSound(alert, status: "online"), "online silences no sound (\(alert))")
    check(!DoNotDisturb.silencesSound(alert, status: "idle"), "idle silences no sound (\(alert))")
    check(!DoNotDisturb.silencesSound(alert, status: nil), "unknown silences no sound (\(alert))")
    check(!DoNotDisturb.silencesNotification(alert, status: "online"), "online silences no notification (\(alert))")
}
check(DoNotDisturb.silencesSound(.message, status: "dnd"), "dnd silences the message sound")
check(DoNotDisturb.silencesSound(.mention, status: "dnd"), "dnd silences the mention sound")
check(DoNotDisturb.silencesSound(.invite, status: "dnd"), "dnd silences the invite sound")
check(DoNotDisturb.silencesSound(.incomingCall, status: "dnd"), "dnd silences the ring")
check(!DoNotDisturb.silencesSound(.other, status: "dnd"), "dnd keeps the other sounds (desktop does not silence them)")

// MARK: Notifications

check(DoNotDisturb.silencesNotification(.message, status: "dnd"), "dnd drops the message notification")
check(DoNotDisturb.silencesNotification(.mention, status: "dnd"), "dnd drops the mention notification")
check(DoNotDisturb.silencesNotification(.invite, status: "dnd"), "dnd drops the invite notification")
check(!DoNotDisturb.silencesNotification(.incomingCall, status: "dnd"), "dnd keeps the call notification, silent")
check(!DoNotDisturb.silencesNotification(.other, status: "dnd"), "dnd keeps other notifications")

if failures == 0 {
    print("dnd_check: all checks passed")
} else {
    print("dnd_check: \(failures) check(s) failed")
    exit(1)
}
