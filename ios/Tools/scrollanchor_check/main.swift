// Checks for Diddy/UI/ChatScrollAnchorRules.swift (keeping the chat still while older messages
// load). Foundation only, runs on macOS and Linux. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/UI/ChatScrollAnchorRules.swift Tools/scrollanchor_check/main.swift -o /tmp/scrollanchor_check && /tmp/scrollanchor_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

typealias R = ChatScrollAnchorRules

func move(old: Double, new: Double, offset: Double, view: Double = 700, top: Double = 100, bottom: Double = 34) -> Double? {
    R.adjustedOffset(oldHeight: old, newHeight: new, offset: offset, viewHeight: view, insetTop: top, insetBottom: bottom)
}

// Reading near the top: rows added above move the offset by their height.
check(move(old: 5000, new: 6200, offset: 0) == 1200, "older rows above keep the visible rows still")
check(move(old: 5000, new: 4800, offset: 900) == 700, "a row above that shrinks moves the offset back")

// At the newest message nothing moves: the chat follows the bottom by itself.
let end = 5000.0 - 700 + 34
check(move(old: 5000, new: 6200, offset: end) == nil, "at the bottom the anchor stays out")
check(move(old: 5000, new: 6200, offset: end - 200) == nil, "close to the bottom the anchor stays out")
check(move(old: 5000, new: 6200, offset: end - 400) != nil, "half a screen and more above the bottom it moves")

// A chat shorter than the screen is always at its end.
check(move(old: 400, new: 900, offset: -100) == nil, "short chat: nothing to keep still")

// Never above the top (the inset), even when more shrinks than lies above.
check(move(old: 5000, new: 3000, offset: 1500) == -100, "never above the top")

// Tiny or impossible changes are ignored.
check(move(old: 5000, new: 5000.3, offset: 0) == nil, "half a point is no change")
check(move(old: 0, new: 6000, offset: 0) == nil, "the first layout is no change")
check(move(old: .nan, new: 6000, offset: 0) == nil, "NaN height is ignored")
check(move(old: 5000, new: .infinity, offset: 0) == nil, "infinite height is ignored")
check(move(old: 5000, new: 6000, offset: 0, view: 0) == nil, "no view height, no move")

// The per-turn limit is small: a real load changes the height a few times, a loop many times.
check((2...8).contains(R.maxMovesPerTurn), "moves per turn: \(R.maxMovesPerTurn)")

if failures > 0 {
    print("\(failures) scroll anchor check(s) failed")
    exit(1)
}
print("scroll anchor checks passed")
