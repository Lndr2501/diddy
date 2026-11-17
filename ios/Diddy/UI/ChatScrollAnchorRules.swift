import Foundation

/// When and how far ChatScrollAnchor moves the chat while older messages are added above. Foundation
/// only, so Tools/scrollanchor_check can test it without UIKit. All values are points of the scroll
/// view: `offset` is `contentOffset.y`, `insetTop`/`insetBottom` the adjusted content insets.
enum ChatScrollAnchorRules {
    /// More moves than this in one turn of the main run loop is a feedback loop, not older messages
    /// arriving: the anchor stops for the rest of the load. Moving the offset makes the lazy list lay
    /// out other rows, whose real heights change the content size again; with SwiftUI's own bottom
    /// anchor answering each move, that never ended and the watchdog killed the app (0x8BADF00D).
    static let maxMovesPerTurn = 4

    /// The new offset for a change of the content height from `oldHeight` to `newHeight`, or nil to
    /// leave the scroll view alone.
    static func adjustedOffset(oldHeight: Double, newHeight: Double, offset: Double, viewHeight: Double,
                               insetTop: Double, insetBottom: Double) -> Double? {
        let values = [oldHeight, newHeight, offset, viewHeight, insetTop, insetBottom]
        guard values.allSatisfy(\.isFinite), oldHeight > 0, viewHeight > 0 else { return nil }
        let delta = newHeight - oldHeight
        guard abs(delta) > 0.5 else { return nil }
        // At (or near) the newest message the chat stays at the bottom by itself (the default
        // scroll anchor and the bottom marker). Moving it here pushes it away from there, and the
        // two corrections answer each other.
        let distanceToEnd = (oldHeight - viewHeight + insetBottom) - offset
        guard distanceToEnd > viewHeight / 2 else { return nil }
        // Never past either end: the offset stays within what can be scrolled.
        let minY = -insetTop
        let maxY = max(newHeight - viewHeight + insetBottom, minY)
        let target = min(max(offset + delta, minY), maxY)
        return abs(target - offset) > 0.5 ? target : nil
    }
}
