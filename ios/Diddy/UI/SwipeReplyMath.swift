import Foundation

/// Rules of the swipe-to-reply gesture in the chat (see SwipeToReply.swift). Foundation only, so
/// Tools/swipereply_check can test them without UIKit. All distances are points; `translationX`
/// is the raw horizontal finger travel, negative to the left. `side` is the direction the swipe
/// goes: -1 to the left (the default, everywhere), +1 to the right (iPad only, #190).
enum SwipeReplyMath {
    /// Finger travel to the left that arms the reply (one haptic tick when crossed).
    static let threshold: Double = 60
    /// Dragging back this far below the threshold disarms it again, so jitter does not re-tick.
    static let disarmMargin: Double = 8
    /// The row never moves further left than this, however far the finger goes.
    static let maxOffset: Double = 90
    /// How much more horizontal than vertical a pan must be to start the swipe.
    static let directionRatio: Double = 1.5
    /// A swipe to the right must start further than this from the leading screen edge, so it never
    /// competes with the system's edge gestures (back, sidebar).
    static let leadingEdgeGuard: Double = 32

    /// The side a pan swipes to: -1 left, +1 right, 0 when it does not count as one. Right only
    /// counts when `allowRight` is set and the finger started clear of the leading edge.
    static func side(velocityX: Double, velocityY: Double, translationX: Double, translationY: Double,
                     allowRight: Bool = false, startX: Double = .infinity) -> Double {
        let useVelocity = abs(velocityX) + abs(velocityY) > 1
        let x = useVelocity ? velocityX : translationX
        let y = useVelocity ? velocityY : translationY
        guard abs(x) > abs(y) * directionRatio else { return 0 }
        if x < 0, translationX <= 0 { return -1 }
        if allowRight, x > 0, translationX >= 0, startX > leadingEdgeGuard { return 1 }
        return 0
    }

    /// Whether a pan may start the swipe: clearly horizontal and to the left. Uses the velocity,
    /// or the travel so far when the finger has (almost) stopped. Everything else, above all
    /// vertical drags, is left to the scroll view.
    static func shouldBegin(velocityX: Double, velocityY: Double, translationX: Double, translationY: Double,
                            allowRight: Bool = false, startX: Double = .infinity) -> Bool {
        side(velocityX: velocityX, velocityY: velocityY, translationX: translationX, translationY: translationY,
             allowRight: allowRight, startX: startX) != 0
    }

    /// Finger travel in the swipe's direction; a drag back past the start counts as none.
    static func distance(translationX: Double, side: Double = -1) -> Double {
        max(0, translationX * side)
    }

    /// Horizontal offset of the row (zero, negative to the left, positive to the right): follows
    /// the finger with growing resistance and approaches `maxOffset` without reaching it.
    static func offset(translationX: Double, side: Double = -1) -> Double {
        let d = distance(translationX: translationX, side: side)
        return side * maxOffset * (1 - exp(-d / maxOffset))
    }

    /// 0 at rest, 1 at the threshold and beyond: drives the reply arrow's fade and scale.
    static func progress(translationX: Double, side: Double = -1) -> Double {
        min(1, distance(translationX: translationX, side: side) / threshold)
    }

    /// Whether letting go now replies. Arms at the threshold and only disarms a little below it.
    static func isArmed(translationX: Double, wasArmed: Bool, side: Double = -1) -> Bool {
        let d = distance(translationX: translationX, side: side)
        return wasArmed ? d >= threshold - disarmMargin : d >= threshold
    }
}
