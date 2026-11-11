// Checks for Diddy/Call/StreamZoom.swift (same rules as cinny/tests/streamZoom.test.cjs).
// Foundation only, runs on macOS and Linux. Run from the ios folder:
//   swiftc Diddy/Call/StreamZoom.swift Tools/streamzoom_check/main.swift -o /tmp/streamzoom_check && /tmp/streamzoom_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
func near(_ a: Double, _ b: Double, _ message: String, line: Int = #line) {
    check(abs(a - b) < 1e-9, "\(message): \(a) != \(b)", line: line)
}

// Zooming keeps the point under the fingers in place.
let a = StreamZoom.none.zoomed(by: 2, px: 0.25, py: 0.75)
near(a.scale, 2, "scale")
near((0.25 - a.x) / a.scale, 0.25, "x stays under the fingers")
near((0.75 - a.y) / a.scale, 0.75, "y stays under the fingers")
let b = a.zoomed(by: 1.5, px: 0.6, py: 0.4)
near((0.6 - b.x) / b.scale, (0.6 - a.x) / a.scale, "second zoom keeps x")
near((0.4 - b.y) / b.scale, (0.4 - a.y) / a.scale, "second zoom keeps y")

// Between 1x and the maximum, snaps back to none.
check(StreamZoom.none.zoomed(by: 0.5) == .none, "cannot zoom out below 1x")
near(StreamZoom.none.zoomed(by: 1000).scale, StreamZoom.maxScale, "capped at the maximum")
let almost = StreamZoom.none.zoomed(by: 2).zoomed(by: 0.502)
check(almost == .none && !almost.isZoomed, "almost 1x snaps to none")

// The picture always covers the tile.
let corner = StreamZoom.none.zoomed(by: 2, px: 0, py: 0)
near(corner.x, 0, "corner x")
near(corner.y, 0, "corner y")
let far = corner.panned(dx: -5, dy: 5)
near(far.x, -1, "pan stops at the right edge")
near(far.y, 0, "pan stops at the top edge")
let back = far.zoomed(by: 0.75)
check(back.x >= 1 - back.scale && back.x <= 0, "zooming out pulls x back in")
check(back.y >= 1 - back.scale && back.y <= 0, "zooming out pulls y back in")

// Bad input changes nothing or resets.
check(a.zoomed(by: .nan) == a, "NaN factor")
check(a.zoomed(by: 0) == a, "zero factor")
check(a.zoomed(by: -1) == a, "negative factor")
check(a.panned(dx: .infinity, dy: 0) == a, "infinite pan")
check(StreamZoom(scale: .nan, x: 0, y: 0).clamped() == .none, "NaN scale")

// Double tap toggles.
let tapped = StreamZoom.none.doubleTapped(px: 0.5, py: 0.5)
near(tapped.scale, StreamZoom.doubleTapScale, "double tap zooms in")
check(tapped.doubleTapped(px: 0.1, py: 0.1) == .none, "double tap zooms back out")
check(StreamZoom(scale: 1.5625, x: 0, y: 0).percent == 156, "percent")

if failures > 0 {
    print("\(failures) stream zoom check(s) failed")
    exit(1)
}
print("stream zoom checks passed")
