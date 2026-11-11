import Foundation

/// Rules of the swipe-to-reply gesture in the chat (see SwipeToReply.swift). Foundation only, so
/// Tools/swipereply_check can test them without UIKit. All distances are points; `translationX`
/// is the raw horizontal finger travel, negative to the left.
enum SwipeReplyMath {
    /// Finger travel to the left that arms the reply (one haptic tick when crossed).
    static let threshold: Double = 60
    /// Dragging back this far below the threshold disarms it again, so jitter does not re-tick.
    static let disarmMargin: Double = 8
    /// The row never moves further left than this, however far the finger goes.
    static let maxOffset: Double = 90
    /// How much more horizontal than vertical a pan must be to start the swipe.
    static let directionRatio: Double = 1.5

    /// Whether a pan may start the swipe: clearly horizontal and to the left. Uses the velocity,
    /// or the travel so far when the finger has (almost) stopped. Everything else, above all
    /// vertical drags, is left to the scroll view.
    static func shouldBegin(velocityX: Double, velocityY: Double, translationX: Double, translationY: Double) -> Bool {
        let useVelocity = abs(velocityX) + abs(velocityY) > 1
        let x = useVelocity ? velocityX : translationX
        let y = useVelocity ? velocityY : translationY
        guard x < 0, translationX <= 0 else { return false }
        return abs(x) > abs(y) * directionRatio
    }

    /// Leftward finger travel; a drag back past the start counts as none.
    static func distance(translationX: Double) -> Double {
        max(0, -translationX)
    }

    /// Horizontal offset of the row (zero or negative): follows the finger with growing
    /// resistance and approaches `-maxOffset` without reaching it.
    static func offset(translationX: Double) -> Double {
        let d = distance(translationX: translationX)
        return -maxOffset * (1 - exp(-d / maxOffset))
    }

    /// 0 at rest, 1 at the threshold and beyond: drives the reply arrow's fade and scale.
    static func progress(translationX: Double) -> Double {
        min(1, distance(translationX: translationX) / threshold)
    }

    /// Whether letting go now replies. Arms at the threshold and only disarms a little below it.
    static func isArmed(translationX: Double, wasArmed: Bool) -> Bool {
        let d = distance(translationX: translationX)
        return wasArmed ? d >= threshold - disarmMargin : d >= threshold
    }
}
