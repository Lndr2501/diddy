// Checks for Diddy/UI/SwipeReplyMath.swift (swipe to reply in the chat). Foundation only, runs on
// macOS and Linux. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/UI/SwipeReplyMath.swift Tools/swipereply_check/main.swift -o /tmp/swipereply_check && /tmp/swipereply_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

typealias M = SwipeReplyMath

// Only a clearly horizontal pan to the left starts the swipe.
check(M.shouldBegin(velocityX: -400, velocityY: 50, translationX: -12, translationY: 2), "fast left swipe begins")
check(M.shouldBegin(velocityX: -300, velocityY: 150, translationX: -10, translationY: 4), "left with a little drift begins")
check(!M.shouldBegin(velocityX: -300, velocityY: 200, translationX: -10, translationY: 7), "diagonal (ratio 1.5) does not begin")
check(!M.shouldBegin(velocityX: 400, velocityY: 0, translationX: 12, translationY: 0), "right swipe (back gesture side) does not begin")
check(!M.shouldBegin(velocityX: 0, velocityY: -800, translationX: 0, translationY: -15), "scrolling up is left to the list")
check(!M.shouldBegin(velocityX: 20, velocityY: 900, translationX: 1, translationY: 14), "scrolling down is left to the list")
check(!M.shouldBegin(velocityX: -50, velocityY: 600, translationX: -3, translationY: 12), "mostly vertical with a left lean does not begin")
check(!M.shouldBegin(velocityX: -400, velocityY: 0, translationX: 5, translationY: 0), "travel to the right never begins")
// A finger that has (almost) stopped is judged by its travel.
check(M.shouldBegin(velocityX: 0, velocityY: 0, translationX: -12, translationY: 1), "slow left drag begins")
check(!M.shouldBegin(velocityX: 0, velocityY: 0, translationX: -2, translationY: 12), "slow vertical drag does not begin")
check(!M.shouldBegin(velocityX: 0, velocityY: 0, translationX: 0, translationY: 0), "no movement does not begin")

// The row follows the finger to the left with resistance and stops short of the limit.
check(M.offset(translationX: 0) == 0, "rest at zero")
check(M.offset(translationX: 40) == 0, "dragging right does not move the row")
var previous = 0.0
for d in stride(from: 5.0, through: 600, by: 5) {
    let o = M.offset(translationX: -d)
    check(o < previous, "offset keeps growing at \(d)")
    check(-o < d, "resistance: row moves less than the finger at \(d)")
    check(-o < M.maxOffset, "never past the limit at \(d)")
    previous = o
}
check(-M.offset(translationX: -10) > 9, "almost 1:1 at the start")
check(-M.offset(translationX: -M.threshold) > M.threshold * 0.6, "threshold is visibly reached")

// The arrow fades in until the threshold.
check(M.progress(translationX: 0) == 0, "no arrow at rest")
check(M.progress(translationX: 30) == 0, "no arrow when dragging right")
check(abs(M.progress(translationX: -M.threshold / 2) - 0.5) < 1e-9, "half way")
check(M.progress(translationX: -M.threshold) == 1, "full at the threshold")
check(M.progress(translationX: -500) == 1, "capped at 1")

// Arming: at the threshold, disarming only a little below it (no repeated haptic on jitter).
check(!M.isArmed(translationX: -(M.threshold - 1), wasArmed: false), "not armed below the threshold")
check(M.isArmed(translationX: -M.threshold, wasArmed: false), "armed at the threshold")
check(M.isArmed(translationX: -(M.threshold - 3), wasArmed: true), "stays armed on small jitter back")
check(!M.isArmed(translationX: -(M.threshold - M.disarmMargin - 1), wasArmed: true), "disarms when dragged back")
check(!M.isArmed(translationX: 20, wasArmed: true), "dragging past the start disarms")

// A whole swipe ticks once and replies; a short one only springs back.
func simulate(_ path: [Double]) -> (ticks: Int, reply: Bool) {
    var armed = false
    var ticks = 0
    for x in path {
        let now = M.isArmed(translationX: x, wasArmed: armed)
        if now && !armed { ticks += 1 }
        armed = now
    }
    return (ticks, armed)
}
let full = simulate([-10, -30, -55, -61, -59, -63, -80, -75])
check(full.ticks == 1 && full.reply, "long swipe: one tick, replies")
let short = simulate([-10, -25, -40, -50])
check(short.ticks == 0 && !short.reply, "short swipe: no tick, no reply")
let back = simulate([-10, -40, -70, -40, -20])
check(back.ticks == 1 && !back.reply, "dragged back before letting go: no reply")

// Swipe to the right (iPad only, #190): off by default, never from the leading screen edge.
check(!M.shouldBegin(velocityX: 400, velocityY: 0, translationX: 12, translationY: 0, allowRight: false, startX: 200), "right swipe stays off on iPhone")
check(M.shouldBegin(velocityX: 400, velocityY: 30, translationX: 12, translationY: 1, allowRight: true, startX: 200), "right swipe begins on iPad")
check(!M.shouldBegin(velocityX: 400, velocityY: 0, translationX: 12, translationY: 0, allowRight: true, startX: 10), "right swipe from the screen edge is left to the system")
check(!M.shouldBegin(velocityX: 300, velocityY: 250, translationX: 10, translationY: 8, allowRight: true, startX: 200), "diagonal right does not begin")
check(!M.shouldBegin(velocityX: 0, velocityY: 700, translationX: 1, translationY: 14, allowRight: true, startX: 200), "scrolling is left to the list on iPad too")
check(M.side(velocityX: -400, velocityY: 0, translationX: -12, translationY: 0, allowRight: true, startX: 200) == -1, "left stays left on iPad")
check(M.side(velocityX: 400, velocityY: 0, translationX: 12, translationY: 0, allowRight: true, startX: 200) == 1, "right is +1")
check(M.offset(translationX: 40, side: 1) > 0 && M.offset(translationX: 40, side: 1) < 40, "row follows a right swipe with resistance")
check(M.offset(translationX: -40, side: 1) == 0, "dragging back past the start does not move the row")
check(M.offset(translationX: 600, side: 1) < M.maxOffset, "right swipe stops short of the limit")
check(M.progress(translationX: M.threshold, side: 1) == 1, "full arrow at the threshold to the right")
check(M.isArmed(translationX: M.threshold, wasArmed: false, side: 1), "armed at the threshold to the right")
check(!M.isArmed(translationX: -M.threshold, wasArmed: false, side: 1), "a leftward drag does not arm a right swipe")

if failures == 0 { print("ALL OK") } else { print("\(failures) FAILED"); exit(1) }
