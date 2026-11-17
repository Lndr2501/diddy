import SwiftUI
import UIKit

/// Keeps the messages on screen in place while older ones are added above them.
///
/// A SwiftUI scroll view keeps its offset when rows are inserted at the top, so everything on
/// screen moves down by the height of the new rows. Jumping back with `ScrollViewProxy.scrollTo`
/// fought a fast fling and landed at a wrong place, because the lazy list only estimates the
/// height of rows it has not drawn. Instead, while older messages are being added, every change
/// of the content height moves the offset by the same amount, right in the layout pass, like a
/// chat built on UIKit. A running fling keeps going.
final class ChatScrollAnchor {
    private weak var scrollView: UIScrollView?
    private var observation: NSKeyValueObservation?
    private var holds = 0
    /// Set while the anchor itself moves the offset: the content size changes this causes are the
    /// move's own and are not answered again.
    private var moving = false
    /// Moves in this turn of the main run loop (ChatScrollAnchorRules.maxMovesPerTurn).
    private var movesThisTurn = 0
    /// The anchor found itself in a loop and rests until the load is over.
    private var resting = false

    deinit { observation?.invalidate() }

    func attach(_ scrollView: UIScrollView) {
        guard scrollView !== self.scrollView else { return }
        observation?.invalidate()
        self.scrollView = scrollView
        observation = scrollView.observe(\.contentSize, options: [.old, .new]) { [weak self] view, change in
            guard let old = change.oldValue, let new = change.newValue else { return }
            self?.contentSizeChanged(view, old: old, new: new)
        }
    }

    private func contentSizeChanged(_ view: UIScrollView, old: CGSize, new: CGSize) {
        guard holds > 0, !moving, !resting,
              let target = ChatScrollAnchorRules.adjustedOffset(
                  oldHeight: Double(old.height), newHeight: Double(new.height),
                  offset: Double(view.contentOffset.y), viewHeight: Double(view.bounds.height),
                  insetTop: Double(view.adjustedContentInset.top), insetBottom: Double(view.adjustedContentInset.bottom)
              ) else { return }
        if movesThisTurn == 0 {
            DispatchQueue.main.async { [weak self] in self?.movesThisTurn = 0 }
        }
        movesThisTurn += 1
        guard movesThisTurn <= ChatScrollAnchorRules.maxMovesPerTurn else {
            resting = true
            DiagLog.shared.write("chat scroll anchor: feedback loop, resting until the load ends")
            return
        }
        moving = true
        defer { moving = false }
        view.contentOffset.y = CGFloat(target)
    }

    /// Runs `load` (which adds older rows above) and keeps the visible rows still meanwhile and
    /// for a moment after, until the list has laid out the new rows.
    @MainActor
    func keepingPosition(_ load: () async -> Void) async {
        holds += 1
        await load()
        try? await Task.sleep(nanoseconds: 250_000_000)
        holds -= 1
        if holds == 0 { resting = false }
    }
}

/// Finds the scroll view around the chat and hands it to the anchor. It sits in the background
/// of the message list, so its view is inside the scroll view's content.
struct ChatScrollAnchorView: UIViewRepresentable {
    let anchor: ChatScrollAnchor

    func makeUIView(context: Context) -> LocatorView {
        let view = LocatorView()
        view.anchor = anchor
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: LocatorView, context: Context) {
        view.anchor = anchor
        view.locate()
    }

    final class LocatorView: UIView {
        var anchor: ChatScrollAnchor?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            locate()
        }

        func locate() {
            var view = superview
            while let current = view {
                if let scrollView = current as? UIScrollView {
                    anchor?.attach(scrollView)
                    return
                }
                view = current.superview
            }
        }
    }
}
