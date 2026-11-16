// Checks for Diddy/Call/PushToTalkLogic.swift. Run from the ios folder:
//   swiftc Diddy/Call/PushToTalkLogic.swift Tools/pushtotalk_check/main.swift -o /tmp/pushtotalk_check && /tmp/pushtotalk_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

// holding opens, letting go closes after the delay
var gate = PushToTalkGate()
check(gate.set(.button, down: true, releaseDelayMs: 200) == .open, "press opens")
check(gate.open, "open while held")
check(gate.set(.button, down: true, releaseDelayMs: 200) == .none, "a second press changes nothing")
check(gate.set(.button, down: false, releaseDelayMs: 200) == .closeAfterDelay, "release waits")
check(gate.open, "still open during the delay")
check(gate.releaseDelayElapsed() == .close, "closes after the delay")
check(!gate.open, "closed")
check(gate.releaseDelayElapsed() == .none, "a late timer does nothing")

// pressing again during the delay keeps it open
gate = PushToTalkGate()
_ = gate.set(.key, down: true, releaseDelayMs: 300)
_ = gate.set(.key, down: false, releaseDelayMs: 300)
check(gate.set(.key, down: true, releaseDelayMs: 300) == .none, "pressed again: stays open, no flicker")
check(gate.releaseDelayElapsed() == .none, "the old timer does not close it")
check(gate.open, "still open")

// no delay, and two sources add up
gate = PushToTalkGate()
_ = gate.set(.key, down: true, releaseDelayMs: 0)
_ = gate.set(.button, down: true, releaseDelayMs: 0)
check(gate.set(.key, down: false, releaseDelayMs: 0) == .none, "the button still holds it")
check(gate.set(.button, down: false, releaseDelayMs: 0) == .close, "no delay closes at once")

// deafen wins
gate = PushToTalkGate()
check(gate.setDeafened(true) == .none, "deafen while closed")
check(gate.set(.button, down: true, releaseDelayMs: 200) == .none, "holding does not undeafen or open")
check(!gate.open, "closed while deafened")
check(gate.setDeafened(false) == .open, "undeafened yourself while holding: talking")
check(gate.setDeafened(true) == .close, "deafen closes at once, without the delay")
_ = gate.set(.button, down: false, releaseDelayMs: 200)
check(gate.setDeafened(false) == .none, "nothing held: stays closed")

// deafen during the release delay
gate = PushToTalkGate()
_ = gate.set(.button, down: true, releaseDelayMs: 500)
_ = gate.set(.button, down: false, releaseDelayMs: 500)
check(gate.setDeafened(true) == .close, "deafen during the delay closes at once")
check(gate.releaseDelayElapsed() == .none, "the timer then does nothing")

// reset
gate = PushToTalkGate()
_ = gate.set(.key, down: true, releaseDelayMs: 200)
gate.reset()
check(!gate.open && !gate.isHeld, "reset forgets everything")

// delay clamp and keys
check(PushToTalkPrefs.clampReleaseDelay(-1) == 0, "no negative delay")
check(PushToTalkPrefs.clampReleaseDelay(60_000) == 500, "at most 500 ms")
check(PushToTalkPrefs.clampReleaseDelay(150) == 150, "in range kept")
check(PushToTalkKey.stored("rightOption") == .rightOption, "stored key read")
check(PushToTalkKey.stored("bogus") == PushToTalkKey.none && PushToTalkKey.stored(nil) == PushToTalkKey.none, "unknown key is none")
check(PushToTalkKey.space.hidUsage == 0x2C && PushToTalkKey.none.hidUsage == nil, "HID usage codes")
check(Set(PushToTalkKey.allCases.compactMap(\.hidUsage)).count == PushToTalkKey.allCases.count - 1, "codes are distinct")

if failures > 0 {
    print("\(failures) push-to-talk check(s) failed")
    exit(1)
}
print("push-to-talk checks passed")
