import Foundation

/// Zoom into a screen share on the call stage, with the same rules as the desktop
/// (`cinny/src/app/plugins/call/streamZoom.ts`): pinch zooms towards the fingers and stays, a drag
/// moves the zoomed picture, a double tap zooms in at that point or back out.
///
/// All values are fractions of the tile, not points: `x` / `y` are the picture's offset (0 to
/// `1 - scale`, so its edges never come into view), a position is 0...1 across the tile. That keeps
/// the zoom right when the tile changes size, for example on rotating the device.
/// Foundation only, so `Tools/streamzoom_check` can test it without UIKit.
struct StreamZoom: Equatable {
    var scale: Double
    var x: Double
    var y: Double

    static let none = StreamZoom(scale: 1, x: 0, y: 0)
    static let maxScale: Double = 8
    /// What a double tap on an unzoomed stream zooms to.
    static let doubleTapScale: Double = 2.5
    /// Closer to 1 than this counts as not zoomed.
    private static let snap: Double = 1.01

    var isZoomed: Bool { scale > 1 }
    var percent: Int { Int((scale * 100).rounded()) }

    private static func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double {
        min(high, max(low, value))
    }

    /// Scale within 1...maxScale and the picture covering the whole tile.
    func clamped() -> StreamZoom {
        guard scale.isFinite, x.isFinite, y.isFinite else { return .none }
        let s = Self.clamp(scale, 1, Self.maxScale)
        if s < Self.snap { return .none }
        return StreamZoom(scale: s, x: Self.clamp(x, 1 - s, 0), y: Self.clamp(y, 1 - s, 0))
    }

    /// Zoom by `factor` so that the point of the picture under (`px`, `py`) stays where it is.
    func zoomed(by factor: Double, px: Double = 0.5, py: Double = 0.5) -> StreamZoom {
        guard factor.isFinite, factor > 0, px.isFinite, py.isFinite else { return self }
        let s = Self.clamp(scale * factor, 1, Self.maxScale)
        // the point of the picture under the fingers, in the picture's own 0...1 coordinates
        let cx = (px - x) / scale
        let cy = (py - y) / scale
        return StreamZoom(scale: s, x: px - cx * s, y: py - cy * s).clamped()
    }

    /// Move the zoomed picture by (`dx`, `dy`), fractions of the tile.
    func panned(dx: Double, dy: Double) -> StreamZoom {
        guard dx.isFinite, dy.isFinite else { return self }
        return StreamZoom(scale: scale, x: x + dx, y: y + dy).clamped()
    }

    /// Double tap: zoomed in → back out, otherwise zoom in at the tapped point.
    func doubleTapped(px: Double, py: Double) -> StreamZoom {
        isZoomed ? .none : zoomed(by: Self.doubleTapScale, px: px, py: py)
    }
}
