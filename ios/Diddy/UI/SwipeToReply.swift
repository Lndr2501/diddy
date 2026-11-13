import SwiftUI
import UIKit

extension View {
    /// Discord's swipe to reply: drag a message to the left, past the threshold it replies.
    /// Left, because a right swipe from the edge is the navigation back gesture. On iPad (regular
    /// width, where the sidebar stays on screen and there is no back swipe) a swipe to the right
    /// replies too, as long as it does not start at the screen edge (#190). Needs iOS 18
    /// (a UIKit pan through UIGestureRecognizerRepresentable); before that only the long-press
    /// menu and the accessibility action reply. Rules in SwipeReplyMath.swift.
    func swipeToReply(_ onReply: @escaping () -> Void) -> some View {
        modifier(SwipeToReply(onReply: onReply))
    }
}

private struct SwipeToReply: ViewModifier {
    let onReply: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    /// Raw horizontal finger travel of the running swipe, zero at rest.
    @State private var dragX: Double = 0
    /// Direction of the running swipe: -1 left, +1 right.
    @State private var side: Double = -1
    @State private var armed = false
    /// Reduce Motion: a short highlight instead of the rubber band.
    @State private var highlighted = false

    @ViewBuilder
    func body(content: Content) -> some View {
        let shaped = content
            .accessibilityAction(named: Text("Reply"), onReply)
        if #available(iOS 18.0, *) {
            shaped
                // Full width and hit-testable, so a swipe can start on the empty part of a row.
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .offset(x: reduceMotion ? 0 : CGFloat(SwipeReplyMath.offset(translationX: dragX, side: side)))
                .background(highlighted ? Theme.accent.opacity(0.15) : Color.clear)
                .overlay(alignment: side > 0 ? .leading : .trailing) {
                    if dragX * side > 0 { arrow }
                }
                .gesture(SwipeReplyPan(
                    allowRight: horizontalSizeClass == .regular,
                    onChange: { translationX, swipeSide, isArmed in
                        side = swipeSide
                        dragX = translationX
                        armed = isArmed
                    },
                    onEnd: { finish(reply: $0) }
                ))
                .onDisappear {
                    dragX = 0
                    armed = false
                }
        } else {
            shaped
        }
    }

    private var arrow: some View {
        let progress = SwipeReplyMath.progress(translationX: dragX, side: side)
        return Image(systemName: "arrowshape.turn.up.left")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(armed ? Theme.onAccent : Theme.muted)
            .frame(width: 34, height: 34)
            .background(Circle().fill(armed ? Theme.accent : Theme.elevated))
            .scaleEffect(reduceMotion ? 1 : CGFloat(0.5 + 0.5 * progress))
            .opacity(progress)
            .padding(side > 0 ? .leading : .trailing, 16)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private func finish(reply: Bool) {
        if reply { onReply() }
        if reduceMotion {
            dragX = 0
            armed = false
            if reply {
                highlighted = true
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 350_000_000)
                    highlighted = false
                }
            }
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                dragX = 0
                armed = false
            }
        }
    }
}

/// The pan behind the swipe. A UIKit recognizer, because a SwiftUI DragGesture on rows takes
/// vertical scrolling away from the ScrollView on iOS 18 and later (FB14688465). The delegate
/// only lets a clearly horizontal pan begin (leftward, and rightward when `allowRight`); vertical
/// drags fail it at once.
@available(iOS 18.0, *)
private struct SwipeReplyPan: UIGestureRecognizerRepresentable {
    /// Whether a swipe to the right counts too (iPad).
    let allowRight: Bool
    /// Raw horizontal travel, the swipe's side (-1 left, +1 right) and whether letting go now would reply.
    let onChange: (Double, Double, Bool) -> Void
    /// Called once per swipe; true when it should reply.
    let onEnd: (Bool) -> Void

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        let haptic: UIImpactFeedbackGenerator
        var armed = false
        var allowRight = false
        /// Side of the running swipe, fixed when the pan begins.
        var side: Double = -1

        override init() {
            haptic = UIImpactFeedbackGenerator(style: .light)
            super.init()
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            let translation = pan.translation(in: pan.view)
            // Where the finger first touched, for the leading edge guard of a swipe to the right.
            let startX = Double(pan.location(in: pan.view).x - translation.x)
            return SwipeReplyMath.shouldBegin(
                velocityX: Double(velocity.x),
                velocityY: Double(velocity.y),
                translationX: Double(translation.x),
                translationY: Double(translation.y),
                allowRight: allowRight,
                startX: startX
            )
        }

        /// Never takes the touch from anything else: the vertical scroll view cannot scroll
        /// sideways and does not start on a horizontal pan anyway, and the chat's own drag
        /// tracking (userScrolled) must still see the drag end.
        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator {
        let coordinator = Coordinator()
        coordinator.allowRight = allowRight
        return coordinator
    }

    func updateUIGestureRecognizer(_ recognizer: UIPanGestureRecognizer, context: Context) {
        context.coordinator.allowRight = allowRight
    }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.maximumNumberOfTouches = 1
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        let coordinator = context.coordinator
        switch recognizer.state {
        case .began:
            coordinator.armed = false
            coordinator.haptic.prepare()
            let translationX = Double(recognizer.translation(in: recognizer.view).x)
            // the swipe keeps the side it began on, even when the finger crosses back over the start
            coordinator.side = translationX > 0 ? 1 : -1
            onChange(translationX, coordinator.side, false)
        case .changed:
            let translationX = Double(recognizer.translation(in: recognizer.view).x)
            let armed = SwipeReplyMath.isArmed(translationX: translationX, wasArmed: coordinator.armed, side: coordinator.side)
            if armed && !coordinator.armed { coordinator.haptic.impactOccurred() }
            coordinator.armed = armed
            onChange(translationX, coordinator.side, armed)
        case .ended:
            let reply = coordinator.armed
            coordinator.armed = false
            onEnd(reply)
        case .cancelled, .failed:
            coordinator.armed = false
            onEnd(false)
        default:
            break
        }
    }
}
