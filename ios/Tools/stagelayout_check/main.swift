// Checks for Diddy/Call/CallStageLayout.swift: the call grid and the thumbnail strip.
// Foundation only, runs on macOS and Linux. Run from the ios folder:
//   swiftc Diddy/Call/CallStageLayout.swift Tools/stagelayout_check/main.swift -o /tmp/stagelayout_check && /tmp/stagelayout_check
import Foundation
// On macOS, CGSize's Equatable conformance and .zero come from CoreGraphics, not Foundation.
#if canImport(CoreGraphics)
import CoreGraphics
#endif

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

/// Height the grid needs for all rows.
func gridHeight(_ g: StageGridLayout, spacing: CGFloat) -> CGFloat {
    CGFloat(g.rows) * g.cellHeight + CGFloat(g.rows - 1) * spacing
}

let spacing: CGFloat = 8

// iPhone in landscape (stage about 750 x 340): everybody in one screen, no scrolling.
let landscape = CGSize(width: 750, height: 340)
for count in 1...8 {
    let g = StageGridLayout.make(count: count, size: landscape, spacing: spacing, minCellHeight: 64)
    check(g.columns * g.rows >= count, "\(count) people: room for all")
    check(gridHeight(g, spacing: spacing) <= landscape.height + 0.5, "\(count) people in landscape do not scroll")
}
let five = StageGridLayout.make(count: 5, size: landscape, spacing: spacing, minCellHeight: 64)
check(five.columns == 3 && five.rows == 2, "5 people in landscape: 3 + 2, got \(five.columns)x\(five.rows)")
let two = StageGridLayout.make(count: 2, size: landscape, spacing: spacing, minCellHeight: 64)
check(two.columns == 2 && two.rows == 1, "2 people in landscape: side by side")
let eight = StageGridLayout.make(count: 8, size: landscape, spacing: spacing, minCellHeight: 64)
check(eight.columns == 4 && eight.rows == 2, "8 people in landscape: 4 x 2, got \(eight.columns)x\(eight.rows)")

// The old bug: a short stage with the portrait minimum made every column count equal, and one
// full-width column won. Even with the large minimum, several columns must win now.
let short = StageGridLayout.make(count: 5, size: CGSize(width: 775, height: 167), spacing: spacing, minCellHeight: 110)
check(short.columns >= 3, "short wide stage: several columns, got \(short.columns)")

// iPhone in portrait (stage about 366 x 560): unchanged, two columns for 5 and 8.
let portrait = CGSize(width: 366, height: 560)
check(StageGridLayout.make(count: 1, size: portrait, spacing: spacing, minCellHeight: 110).columns == 1, "1 person in portrait: one tile")
check(StageGridLayout.make(count: 5, size: portrait, spacing: spacing, minCellHeight: 110).columns == 2, "5 people in portrait: two columns")
let eightPortrait = StageGridLayout.make(count: 8, size: portrait, spacing: spacing, minCellHeight: 110)
check(eightPortrait.columns == 2 && eightPortrait.rows == 4, "8 people in portrait: 2 x 4")
check(gridHeight(eightPortrait, spacing: spacing) <= portrait.height + 0.5, "8 people in portrait do not scroll")

// Too many for the height: the cells keep the minimum (the grid scrolls), never less.
let crowded = StageGridLayout.make(count: 30, size: CGSize(width: 366, height: 300), spacing: spacing, minCellHeight: 110)
check(crowded.cellHeight >= 110, "cells keep the minimum height")

// Strip in landscape: beside the large tile, inside the stage, no thumbnail cut off.
for count in [1, 4, 5, 8] {
    let s = StageStripLayout.make(count: count, size: landscape, spacing: spacing)
    check(s.beside, "\(count) thumbnails in landscape stand beside")
    check(s.focus.width + spacing + s.strip.width <= landscape.width + 0.5, "\(count): large tile and strip fit the width")
    check(s.focus.height == landscape.height, "\(count): the large tile gets the full height")
    check(s.thumb.width == s.strip.width, "\(count): thumbnails as wide as the strip")
    check(min(s.focus.width / s.focus.height / (16.0 / 9.0), 1) >= 0.95, "\(count): a 16:9 share fills nearly the whole height")
}
let fiveThumbs = StageStripLayout.make(count: 5, size: landscape, spacing: spacing)
check(5 * fiveThumbs.thumb.height + 4 * spacing <= landscape.height + 0.5, "5 thumbnails fit without scrolling")

// Strip in portrait: under the large tile, as before.
let portraitStrip = StageStripLayout.make(count: 5, size: portrait, spacing: spacing)
check(!portraitStrip.beside, "portrait strip stands below")
check(portraitStrip.thumb.height == 104, "portrait thumbnails keep their height")
check(portraitStrip.focus.height == portrait.height - 104 - spacing, "portrait large tile above the strip")
let fewThumbs = StageStripLayout.make(count: 2, size: portrait, spacing: spacing)
check(fewThumbs.thumb.width == 104 * 1.6, "few thumbnails keep 16:10")
check(portraitStrip.thumb.width >= 104 * 1.2, "many thumbnails shrink only so far, then scroll")

// A big stage that is only a little wider than tall (iPad): the strip stays below when the
// picture is bigger there.
let tablet = StageStripLayout.make(count: 4, size: CGSize(width: 800, height: 600), spacing: spacing)
check(!tablet.beside, "iPad-like stage keeps the strip below")

// No thumbnails: the large tile is the whole stage.
let alone = StageStripLayout.make(count: 0, size: landscape, spacing: spacing)
check(alone.focus == landscape && alone.strip == .zero, "alone: whole stage")

if failures > 0 {
    print("\(failures) stage layout check(s) failed")
    exit(1)
}
print("stage layout checks passed")
