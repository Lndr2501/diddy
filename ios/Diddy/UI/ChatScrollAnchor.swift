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

    deinit { observation?.invalidate() }

    func attach(_ scrollView: UIScrollView) {
        guard scrollView !== self.scrollView else { return }
        observation?.invalidate()
        self.scrollView = scrollView
        observation = scrollView.observe(\.contentSize, options: [.old, .new]) { [weak self] view, change in
            guard let self, self.holds > 0, let old = change.oldValue, let new = change.newValue else { return }
            let delta = new.height - old.height
            guard abs(delta) > 0.5, old.height > 0 else { return }
            // Never past the end: the offset stays within what can be scrolled.
            let maxY = max(new.height - view.bounds.height + view.adjustedContentInset.bottom, -view.adjustedContentInset.top)
            view.contentOffset.y = min(max(view.contentOffset.y + delta, -view.adjustedContentInset.top), maxY)
        }
    }

    /// Runs `load` (which adds older rows above) and keeps the visible rows still meanwhile and
    /// for a moment after, until the list has laid out the new rows.
    @MainActor
    func keepingPosition(_ load: () async -> Void) async {
        holds += 1
        await load()
        try? await Task.sleep(nanoseconds: 250_000_000)
        holds -= 1
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
