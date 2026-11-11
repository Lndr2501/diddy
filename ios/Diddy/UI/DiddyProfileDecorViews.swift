import ImageIO
import MatrixRustSDK
import SwiftUI
import UIKit

/// Profile effects (#86) and profile frames (#87) on the profile card, drawn like desktop
/// (`components/diddy/ProfileEffect.tsx`, `ProfileFrame.tsx`). The data is parsed and checked in
/// `Matrix/DiddyProfileDecor.swift`.
///
/// Nothing moves with Reduce Motion or Low Power Mode on: presets stand still, uploaded effects show
/// their still picture (or the first frame of every layer) and animated frame pictures their first
/// frame.

// MARK: - Media

/// A decoded picture of an effect or frame: one frame, or the frames of an animation.
struct DiddyDecorPicture {
    let frames: [UIImage]
    /// seconds of one play
    let duration: Double
    /// how often the animation plays by itself, 0 = forever
    let plays: Int
    /// size of the picture in pixels (for the aspect ratio)
    let size: CGSize
    /// bytes of the downloaded file (desktop's total caps count these)
    let fileBytes: Int
}

/// Downloads and decodes effect and frame pictures with desktop's caps: a file that is too large
/// or is no PNG / WebP / GIF (judged by its bytes) is ignored. Animations are decoded small and
/// keep only as many frames as fit a memory budget, so a card with four layers stays cheap.
actor DiddyDecorMedia {
    static let shared = DiddyDecorMedia()

    enum Kind {
        case effectLayer, effectStill, frameLayer

        var maxBytes: Int {
            switch self {
            case .effectLayer: return DiddyProfileEffect.maxLayerBytes
            case .effectStill: return DiddyProfileEffect.maxStillBytes
            case .frameLayer: return DiddyProfileFrame.maxLayerBytes
            }
        }

        var types: Set<String> {
            switch self {
            case .effectLayer, .effectStill: return DiddyProfileEffect.imageTypes
            case .frameLayer: return DiddyProfileFrame.imageTypes
            }
        }

        /// longest side in pixels; a card is about 350 points wide (1050 pixels)
        var maxPixels: Int { self == .frameLayer ? 1200 : 900 }
    }

    private final class Box {
        let picture: DiddyDecorPicture
        init(_ picture: DiddyDecorPicture) { self.picture = picture }
    }

    private static let maxFrames = 90
    /// decoded bytes one animation may take
    private static let frameBudget = 24 * 1024 * 1024

    private let cache = NSCache<NSString, Box>()
    private var failed: Set<String> = []

    init() {
        cache.countLimit = 24
        cache.totalCostLimit = 96 * 1024 * 1024
    }

    func picture(mxc: String, kind: Kind, animated: Bool, accountId: String, client: Client) async -> DiddyDecorPicture? {
        let key = "\(accountId)|\(mxc)|\(kind)|\(animated)"
        if let cached = cache.object(forKey: key as NSString) { return cached.picture }
        guard !failed.contains(key) else { return nil }
        guard let source = try? MediaSource.fromUrl(url: mxc),
              let data = try? await client.getMediaContent(mediaSource: source),
              data.count > 0, data.count <= kind.maxBytes,
              let type = DiddyImageSniff.mimeType(of: data), kind.types.contains(type),
              let picture = Self.decode(data, animated: animated, maxPixels: kind.maxPixels)
        else {
            failed.insert(key)
            return nil
        }
        let cost = picture.frames.reduce(0) { total, frame in
            total + (frame.cgImage.map { $0.bytesPerRow * $0.height } ?? 0)
        }
        cache.setObject(Box(picture), forKey: key as NSString, cost: cost)
        return picture
    }

    private static func decode(_ data: Data, animated: Bool, maxPixels: Int) -> DiddyDecorPicture? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        func frame(_ index: Int) -> CGImage? {
            CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary)
        }
        guard let first = frame(0) else { return nil }
        let size = CGSize(width: first.width, height: first.height)
        let count = CGImageSourceGetCount(source)
        guard animated, count > 1 else {
            return DiddyDecorPicture(frames: [UIImage(cgImage: first)], duration: 0, plays: 1, size: size, fileBytes: data.count)
        }
        let frameBytes = max(1, first.bytesPerRow * first.height)
        let keep = max(2, min(maxFrames, frameBudget / frameBytes))
        let step = max(1, Int((Double(count) / Double(keep)).rounded(.up)))
        var frames: [UIImage] = []
        var duration = 0.0
        for index in stride(from: 0, to: count, by: step) {
            let decoded: CGImage? = index == 0 ? first : frame(index)
            guard let image = decoded else { continue }
            frames.append(UIImage(cgImage: image))
            // a skipped frame's time goes to the frame kept before it
            for skipped in index..<min(index + step, count) { duration += delay(source, skipped) }
        }
        guard frames.count > 1 else {
            return DiddyDecorPicture(frames: frames, duration: 0, plays: 1, size: size, fileBytes: data.count)
        }
        return DiddyDecorPicture(frames: frames, duration: max(0.05, min(duration, 60)), plays: plays(source),
                                 size: size, fileBytes: data.count)
    }

    /// Frame delay of GIF, APNG or WebP; very short delays play at 100 ms like in browsers.
    private static func delay(_ source: CGImageSource, _ index: Int) -> Double {
        let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
        var value: Double?
        if let gif = properties?[kCGImagePropertyGIFDictionary] as? [CFString: Any] {
            value = (gif[kCGImagePropertyGIFUnclampedDelayTime] as? Double) ?? (gif[kCGImagePropertyGIFDelayTime] as? Double)
        } else if let png = properties?[kCGImagePropertyPNGDictionary] as? [CFString: Any] {
            value = (png[kCGImagePropertyAPNGUnclampedDelayTime] as? Double) ?? (png[kCGImagePropertyAPNGDelayTime] as? Double)
        } else if let webp = properties?[kCGImagePropertyWebPDictionary] as? [CFString: Any] {
            value = (webp[kCGImagePropertyWebPUnclampedDelayTime] as? Double) ?? (webp[kCGImagePropertyWebPDelayTime] as? Double)
        }
        guard let value, value >= 0.02 else { return 0.1 }
        return value
    }

    /// How often an APNG or WebP plays (0 = forever). GIFs loop like most browsers play them.
    private static func plays(_ source: CGImageSource) -> Int {
        let properties = CGImageSourceCopyProperties(source, nil) as? [CFString: Any]
        if let png = properties?[kCGImagePropertyPNGDictionary] as? [CFString: Any],
           let count = png[kCGImagePropertyAPNGLoopCount] as? Int { return max(0, count) }
        if let webp = properties?[kCGImagePropertyWebPDictionary] as? [CFString: Any],
           let count = webp[kCGImagePropertyWebPLoopCount] as? Int { return max(0, count) }
        return 0
    }
}

/// A decoded picture in a box; animations start at their first frame when the view is created.
private struct DecorPictureView: UIViewRepresentable {
    let picture: DiddyDecorPicture
    var mode: UIView.ContentMode = .scaleAspectFit

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.isUserInteractionEnabled = false
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        show(in: view)
        return view
    }

    func updateUIView(_ view: UIImageView, context: Context) {
        view.contentMode = mode
        // only a new picture restarts the animation
        if view.image !== (picture.frames.count > 1 && picture.plays > 0 ? picture.frames.last : picture.frames.first) {
            show(in: view)
        }
    }

    private func show(in view: UIImageView) {
        view.contentMode = mode
        view.stopAnimating()
        view.animationImages = nil
        guard picture.frames.count > 1 else {
            view.image = picture.frames.first
            return
        }
        // after a limited number of plays the last frame stays, like in a browser
        view.image = picture.plays > 0 ? picture.frames.last : picture.frames.first
        view.animationImages = picture.frames
        view.animationDuration = picture.duration
        view.animationRepeatCount = picture.plays
        view.startAnimating()
    }
}

private extension View {
    /// Places a view at a rectangle of its parent (top-left coordinates).
    func place(_ rect: CGRect) -> some View {
        frame(width: max(0, rect.width), height: max(0, rect.height)).position(x: rect.midX, y: rect.midY)
    }
}

private func diddyMayAnimate(reduceMotion: Bool) -> Bool {
    !reduceMotion && !ProcessInfo.processInfo.isLowPowerModeEnabled
}

// MARK: - Profile effect

/// The profile effect over a card. Put it in an overlay of the card and clip it to the card's
/// shape; it lets every touch through.
struct DiddyProfileEffectOverlay: View {
    let effect: DiddyProfileEffect
    let account: MatrixAccount
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Settings > Chat > Profile effects; off shows the still picture.
    @AppStorage(AvatarPrefs.profileEffectsKey) private var effectsMove = true

    var body: some View {
        GeometryReader { proxy in
            switch effect.resolved(animate: effectsMove && diddyMayAnimate(reduceMotion: reduceMotion)) {
            case let .preset(id, moving)?:
                DiddyEffectParticles(id: id, animate: moving)
            case let .layers(layers)?:
                DiddyEffectLayers(layers: layers, stillMxc: nil, animate: true, account: account, size: proxy.size)
            case let .still(stillMxc, layers)?:
                DiddyEffectLayers(layers: layers, stillMxc: stillMxc, animate: false, account: account, size: proxy.size)
            case nil:
                EmptyView()
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Uploaded layers in the 450 x 880 reference box, scaled to cover the card from the top.
private struct DiddyEffectLayers: View {
    let layers: [DiddyProfileEffect.Layer]
    let stillMxc: String?
    let animate: Bool
    let account: MatrixAccount
    let size: CGSize
    @State private var pictures: [Int: DiddyDecorPicture] = [:]
    @State private var still: DiddyDecorPicture?
    @State private var startedAt: Date?

    private var scale: CGFloat { CGFloat(DiddyProfileEffect.coverScale(width: Double(size.width), height: Double(size.height))) }
    private var originX: CGFloat { (size.width - CGFloat(DiddyProfileEffect.refWidth) * scale) / 2 }

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let still {
                DecorPictureView(picture: still)
                    .place(CGRect(x: originX, y: 0, width: CGFloat(DiddyProfileEffect.refWidth) * scale,
                                  height: CGFloat(DiddyProfileEffect.refHeight) * scale))
            } else if let startedAt {
                ForEach(Array(layers.enumerated()), id: \.offset) { index, layer in
                    if let picture = pictures[index] {
                        let rect = CGRect(x: originX + CGFloat(layer.x) * scale, y: CGFloat(layer.y) * scale,
                                          width: CGFloat(layer.w) * scale, height: CGFloat(layer.h) * scale)
                        if animate {
                            DiddyEffectLayerView(layer: layer, picture: picture, startedAt: startedAt).place(rect)
                        } else {
                            DecorPictureView(picture: picture).place(rect)
                        }
                    }
                }
            }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .task(id: "\(account.id)|\(animate)|\(stillMxc ?? "")|\(layers.map(\.mxc).joined(separator: " "))") { await load() }
    }

    private func load() async {
        let media = DiddyDecorMedia.shared
        still = nil
        startedAt = nil
        if !animate, let mxc = stillMxc,
           let picture = await media.picture(mxc: mxc, kind: .effectStill, animated: false, accountId: account.id, client: account.client) {
            still = picture
            return
        }
        var loaded: [Int: DiddyDecorPicture] = [:]
        var total = 0
        for (index, layer) in layers.enumerated() {
            guard let picture = await media.picture(mxc: layer.mxc, kind: .effectLayer, animated: animate,
                                                    accountId: account.id, client: account.client) else { continue }
            // layers over the total cap are left out, like on desktop
            total += picture.fileBytes
            if total <= DiddyProfileEffect.maxTotalBytes { loaded[index] = picture }
        }
        guard !Task.isCancelled else { return }
        pictures = loaded
        // the timeline starts once all pictures are there, so the layers stay in step
        startedAt = Date()
    }
}

/// One uploaded layer: hidden until its start, then shown and restarted from its first frame on
/// every loop (`layerStateAt`).
private struct DiddyEffectLayerView: View {
    let layer: DiddyProfileEffect.Layer
    let picture: DiddyDecorPicture
    let startedAt: Date
    @State private var state: DiddyProfileEffect.LayerState

    init(layer: DiddyProfileEffect.Layer, picture: DiddyDecorPicture, startedAt: Date) {
        self.layer = layer
        self.picture = picture
        self.startedAt = startedAt
        _state = State(initialValue: DiddyProfileEffect.state(of: layer, at: Date().timeIntervalSince(startedAt) * 1000))
    }

    var body: some View {
        ZStack {
            if state.visible {
                // a new view for every play starts the animation at its first frame again
                DecorPictureView(picture: picture).id(state.cycle)
            }
        }
        .task(id: startedAt) {
            while !Task.isCancelled {
                let next = DiddyProfileEffect.state(of: layer, at: Date().timeIntervalSince(startedAt) * 1000)
                if next.visible != state.visible || next.cycle != state.cycle { state = next }
                guard next.nextChangeIn.isFinite else { return }
                let wait = max(16, min(next.nextChangeIn + 1, 120_000))
                try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000))
            }
        }
    }
}

/// The original presets (sparkles, petals, embers, snow, hearts, aurora), the same particles as
/// desktop's CSS animations, drawn in a Canvas.
private struct DiddyEffectParticles: View {
    let id: String
    let animate: Bool
    private let particles: [DiddyProfileEffect.Particle]
    @State private var start = Date()

    init(id: String, animate: Bool) {
        self.id = id
        self.animate = animate
        particles = DiddyProfileEffect.particles(id)
    }

    private static let tints: [String: [Color]] = [
        "sparkles": [Color(diddyHex: "#ffe9a8"), Color(diddyHex: "#c9b8ff"), Color(diddyHex: "#9fe8ff")].compactMap { $0 },
        "petals": [Color(diddyHex: "#ff8fb4"), Color(diddyHex: "#ff6f9f"), Color(diddyHex: "#f7a8c8")].compactMap { $0 },
        "embers": [Color(diddyHex: "#ff9d3c"), Color(diddyHex: "#ffb347"), Color(diddyHex: "#ff6a2b")].compactMap { $0 },
        "snow": [Color.white],
        "hearts": [Color(diddyHex: "#ff6f9f")].compactMap { $0 },
        "aurora": [Color(.sRGB, red: 90 / 255, green: 1, blue: 190 / 255, opacity: 0.5),
                   Color(.sRGB, red: 110 / 255, green: 160 / 255, blue: 1, opacity: 0.45),
                   Color(.sRGB, red: 200 / 255, green: 120 / 255, blue: 1, opacity: 0.4)],
    ]

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !animate)) { timeline in
            let t = animate ? timeline.date.timeIntervalSince(start) : 0
            Canvas { context, size in draw(in: &context, size: size, time: t) }
        }
    }

    /// CSS ease-in-out, close enough
    private static func ease(_ u: Double) -> Double {
        let x = min(1, max(0, u))
        return x * x * (3 - 2 * x)
    }

    /// 0...1 of a running CSS animation with a (negative) delay
    private static func phase(_ t: Double, delay: Double, duration: Double) -> Double {
        guard duration > 0 else { return 0 }
        let p = (t - delay) / duration
        return p - p.rounded(.down)
    }

    /// 0 → 1 → 0 over one play, eased like the 0 % / 50 % / 100 % keyframes
    private static func swing(_ phase: Double) -> Double { ease(phase < 0.5 ? phase * 2 : (1 - phase) * 2) }

    private func draw(in context: inout GraphicsContext, size: CGSize, time t: Double) {
        let tints = Self.tints[id] ?? [Color.white]
        let w = Double(size.width)
        let h = Double(size.height)
        for p in particles {
            let tint = tints[Int(p.tone * Double(tints.count)) % max(1, tints.count)]
            let dur2 = DiddySanitize.jsRound(p.duration / 3 * 100) / 100
            var g = context
            switch id {
            case "sparkles":
                let k = Self.swing(Self.phase(t, delay: p.delay, duration: p.duration))
                g.translateBy(x: p.x / 100 * w, y: p.y / 100 * h + p.size / 2)
                g.rotate(by: .degrees(45 * k))
                g.scaleBy(x: 0.2 + 0.8 * k, y: 0.2 + 0.8 * k)
                g.opacity = k
                Self.sparkle(in: &g, size: p.size, tint: tint)
            case "aurora":
                let k = Self.swing(Self.phase(t, delay: p.delay, duration: p.duration))
                let width = p.size / 100 * w
                let height = 0.46 * h
                g.blendMode = .screen
                g.opacity = 0.35 + 0.4 * k
                // centre of the band, moved by -18 % ... 18 % of its width and stretched 0.9 ... 1.1
                g.translateBy(x: (p.x - p.size / 2) / 100 * w + width / 2 + (-0.18 + 0.36 * k) * width, y: -0.08 * h + height / 2)
                g.scaleBy(x: 1, y: 0.9 + 0.2 * k)
                Self.aurora(in: &g, width: width, height: height, tint: tint)
            default:
                // falling or rising track over the whole card
                let rises = id == "embers" || id == "hearts"
                let progress = Self.phase(t, delay: p.delay, duration: p.duration)
                let top = rises ? (1.04 - 1.16 * progress) * h : (-0.12 + 1.16 * progress) * h
                let x = p.x / 100 * w
                if id == "embers" {
                    let f = Self.phase(t, delay: p.delay, duration: dur2)
                    g.opacity = Self.flicker(f)
                    let side = p.size * 3
                    g.translateBy(x: x - p.size / 2 + side / 2, y: top + side / 2)
                    Self.glow(in: &g, radius: side / 2, stops: [
                        .init(color: Color(diddyHex: "#fff4c2") ?? .white, location: 0),
                        .init(color: tint, location: 0.3),
                        .init(color: tint.opacity(0), location: 0.7),
                    ])
                } else {
                    let k = Self.swing(Self.phase(t, delay: p.delay, duration: dur2))
                    let height = id == "petals" ? p.size * 0.7 : p.size
                    g.translateBy(x: x + (-1 + 2 * k) * p.drift, y: top + height / 2)
                    g.rotate(by: .degrees(p.spin * k))
                    switch id {
                    case "petals":
                        g.opacity = 0.9
                        Self.petal(in: &g, width: p.size, height: height, tint: tint)
                    case "snow":
                        Self.glow(in: &g, radius: p.size / 2, stops: [
                            .init(color: .white, location: 0),
                            .init(color: .white.opacity(0.85), location: 0.45),
                            .init(color: .white.opacity(0), location: 0.7),
                        ])
                    default:
                        g.opacity = 0.85
                        Self.heart(in: &g, size: p.size, tint: tint)
                    }
                }
            }
        }
    }

    /// Flicker keyframes: 0 % 0, 15 % 1, 70 % 0.8, 100 % 0.
    private static func flicker(_ f: Double) -> Double {
        if f < 0.15 { return ease(f / 0.15) }
        if f < 0.7 { return 1 - 0.2 * ease((f - 0.15) / 0.55) }
        return 0.8 * (1 - ease((f - 0.7) / 0.3))
    }

    /// A square of `radius * 2` with a circular gradient; like CSS the stops are measured to the
    /// corner (radius * 1.414).
    private static func glow(in g: inout GraphicsContext, radius: Double, stops: [Gradient.Stop]) {
        let rect = CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2)
        g.fill(Path(rect), with: .radialGradient(Gradient(stops: stops), center: .zero, startRadius: 0, endRadius: radius * 1.414))
    }

    private static func sparkle(in g: inout GraphicsContext, size: Double, tint: Color) {
        let points: [(Double, Double)] = [(50, 0), (61, 39), (100, 50), (61, 61), (50, 100), (39, 61), (0, 50), (39, 39)]
        var path = Path()
        for (index, point) in points.enumerated() {
            let at = CGPoint(x: (point.0 / 100 - 0.5) * size, y: (point.1 / 100 - 0.5) * size)
            if index == 0 { path.move(to: at) } else { path.addLine(to: at) }
        }
        path.closeSubpath()
        let corner = size / 2 * 1.414
        g.fill(path, with: .radialGradient(Gradient(stops: [
            .init(color: .white, location: 0), .init(color: tint, location: 0.55), .init(color: tint.opacity(0), location: 0.72),
        ]), center: .zero, startRadius: 0, endRadius: corner))
    }

    /// `border-radius: 80% 0 80% 0` with a 135° gradient.
    private static func petal(in g: inout GraphicsContext, width: Double, height: Double, tint: Color) {
        let left = -width / 2
        let top = -height / 2
        var path = Path()
        path.move(to: CGPoint(x: left, y: top + 0.8 * height))
        path.addQuadCurve(to: CGPoint(x: left + 0.8 * width, y: top), control: CGPoint(x: left, y: top))
        path.addLine(to: CGPoint(x: left + width, y: top))
        path.addLine(to: CGPoint(x: left + width, y: top + 0.2 * height))
        path.addQuadCurve(to: CGPoint(x: left + 0.2 * width, y: top + height), control: CGPoint(x: left + width, y: top + height))
        path.addLine(to: CGPoint(x: left, y: top + height))
        path.closeSubpath()
        g.fill(path, with: .linearGradient(Gradient(colors: [Color(diddyHex: "#ffd1e1") ?? .pink, tint]),
                                           startPoint: CGPoint(x: left, y: top), endPoint: CGPoint(x: left + width, y: top + height)))
    }

    /// The heart of desktop's SVG (24 x 22), fitted into a `size` square.
    private static func heart(in g: inout GraphicsContext, size: Double, tint: Color) {
        let s = size / 24
        func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: (x - 12) * s, y: (y - 11) * s) }
        var path = Path()
        path.move(to: p(12, 21.4))
        path.addLine(to: p(10.6, 20))
        path.addCurve(to: p(2, 8.5), control1: p(5.4, 15.4), control2: p(2, 12.3))
        path.addCurve(to: p(7.5, 3), control1: p(2, 5.4), control2: p(4.4, 3))
        path.addCurve(to: p(12, 5.1), control1: p(9.2, 3), control2: p(10.9, 3.8))
        path.addCurve(to: p(16.5, 3), control1: p(13.1, 3.8), control2: p(14.8, 3))
        path.addCurve(to: p(22, 8.5), control1: p(19.6, 3), control2: p(22, 5.4))
        path.addCurve(to: p(13.4, 20), control1: p(22, 12.3), control2: p(18.6, 15.4))
        path.closeSubpath()
        g.fill(path, with: .color(tint))
    }

    /// `radial-gradient(ellipse at 50% 0%, tint, transparent 68%)` in a band centred on the origin.
    private static func aurora(in g: inout GraphicsContext, width: Double, height: Double, tint: Color) {
        let rect = CGRect(x: -width / 2, y: -height / 2, width: width, height: height)
        var inner = g
        inner.clip(to: Path(rect))
        // an ellipse gradient: a circle gradient in a squeezed coordinate system
        inner.translateBy(x: 0, y: -height / 2)
        inner.scaleBy(x: width / 2 * 1.414, y: height * 1.414)
        inner.fill(Path(CGRect(x: -1, y: -0.1, width: 2, height: 1.2)), with: .radialGradient(
            Gradient(stops: [.init(color: tint, location: 0), .init(color: tint.opacity(0), location: 0.68)]),
            center: .zero, startRadius: 0, endRadius: 1))
    }
}

// MARK: - Profile frame

/// A profile card with its frame around it. The frame sticks out over the card, so the box keeps
/// room for it: the card gets the width that leaves space for the side overhangs within
/// `available`, and padding above and below. Nothing in or around the box may clip it.
struct DiddyProfileFrameBox<Content: View>: View {
    let frame: DiddyProfileFrame?
    let account: MatrixAccount
    /// width the card and its side overhangs may take
    let available: CGFloat
    var cornerRadius: CGFloat = 16
    let content: Content
    /// Settings > Chat > Profile frames; off draws none.
    @AppStorage(AvatarPrefs.profileFramesKey) private var showFrames = true

    init(frame: DiddyProfileFrame?, account: MatrixAccount, available: CGFloat, cornerRadius: CGFloat = 16,
         @ViewBuilder content: () -> Content) {
        self.frame = frame
        self.account = account
        self.available = available
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        let resolved = showFrames ? frame?.resolved : nil
        let geometry = resolved?.geometry ?? DiddyProfileFrame.Geometry()
        let factors = DiddyProfileFrame.factors(geometry)
        let width = CGFloat(DiddyProfileFrame.cardWidth(available: Double(max(0, available)), geometry: geometry))
        content
            .frame(width: width)
            .background {
                if let resolved { DiddyFrameLayers(resolved: resolved, front: false, account: account, cornerRadius: cornerRadius) }
            }
            .overlay {
                if let resolved { DiddyFrameLayers(resolved: resolved, front: true, account: account, cornerRadius: cornerRadius) }
            }
            .padding(.top, CGFloat(factors.top) * width)
            .padding(.bottom, CGFloat(factors.bottom) * width)
            .padding(.horizontal, CGFloat(factors.side) * width)
    }
}

/// The layers of a frame behind (`front` false) or in front of the card.
private struct DiddyFrameLayers: View {
    let resolved: DiddyProfileFrame.Resolved
    let front: Bool
    let account: MatrixAccount
    let cornerRadius: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pictures: [String: DiddyDecorPicture] = [:]

    var body: some View {
        GeometryReader { proxy in
            switch resolved {
            case let .preset(id, _):
                DiddyFramePreset(id: id, front: front, cardSize: proxy.size, cornerRadius: cornerRadius)
            case let .layers(layers, geometry):
                let mine = layers.filter { ($0.order == "front") == front }
                ZStack(alignment: .topLeading) {
                    ForEach(Array(mine.enumerated()), id: \.offset) { _, layer in
                        if let picture = pictures[layer.mxc] {
                            DecorPictureView(picture: picture, mode: layer.anchor == "fill" ? .scaleToFill : .scaleAspectFit)
                                .place(Self.rect(layer.anchor, geometry: geometry, picture: picture.size, card: proxy.size))
                        }
                    }
                }
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
                .task(id: "\(account.id)|\(diddyMayAnimate(reduceMotion: reduceMotion))|\(mine.map(\.mxc).joined(separator: " "))") {
                    await load(mine)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// `frameLayerCss`: as wide as the card plus both overhangs, hung on an edge, centred or
    /// stretched over the card and its overhangs.
    static func rect(_ anchor: String, geometry: DiddyProfileFrame.Geometry, picture: CGSize, card: CGSize) -> CGRect {
        let f = DiddyProfileFrame.factors(geometry)
        let side = CGFloat(f.side) * card.width
        let top = CGFloat(f.top) * card.width
        let bottom = CGFloat(f.bottom) * card.width
        let width = card.width + 2 * side
        let height = picture.width > 0 ? width * picture.height / picture.width : 0
        switch anchor {
        case "top": return CGRect(x: -side, y: -top, width: width, height: height)
        case "bottom": return CGRect(x: -side, y: card.height + bottom - height, width: width, height: height)
        case "center": return CGRect(x: -side, y: card.height / 2 - height / 2, width: width, height: height)
        default: return CGRect(x: -side, y: -top, width: width, height: card.height + top + bottom)
        }
    }

    private func load(_ layers: [DiddyProfileFrame.Layer]) async {
        let animated = diddyMayAnimate(reduceMotion: reduceMotion)
        var loaded: [String: DiddyDecorPicture] = [:]
        var total = 0
        for layer in layers where loaded[layer.mxc] == nil {
            guard let picture = await DiddyDecorMedia.shared.picture(mxc: layer.mxc, kind: .frameLayer, animated: animated,
                                                                     accountId: account.id, client: account.client) else { continue }
            total += picture.fileBytes
            if total <= DiddyProfileFrame.maxTotalBytes { loaded[layer.mxc] = picture }
        }
        guard !Task.isCancelled else { return }
        pictures = loaded
    }
}

/// The original frame presets of desktop (`ProfileFrame.css.ts`), drawn around a card of
/// `cardSize`. Glow and pixel lie behind the card, the others in front of it.
private struct DiddyFramePreset: View {
    let id: String
    let front: Bool
    let cardSize: CGSize
    let cornerRadius: CGFloat

    private static func hex(_ value: String) -> Color { Color(diddyHex: value) ?? .clear }
    private static func rgba(_ r: Double, _ g: Double, _ b: Double, _ a: Double) -> Color {
        Color(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: a)
    }

    var body: some View {
        let w = cardSize.width
        let r = cornerRadius
        ZStack(alignment: .topLeading) {
            switch (id, front) {
            case ("glow", false):
                RoundedRectangle(cornerRadius: r + 1.5, style: .continuous)
                    .fill(Self.rgba(214, 200, 255, 0.95))
                    .padding(-1.5)
                    .shadow(color: Self.rgba(150, 110, 255, 0.75), radius: 6)
                    .shadow(color: Self.rgba(110, 80, 255, 0.35), radius: 14)
            case ("gold", true):
                let out = 0.017 * w
                ZStack {
                    RoundedRectangle(cornerRadius: r + out + 1, style: .continuous).strokeBorder(Self.hex("#7a5514"), lineWidth: 1).padding(-1)
                    RoundedRectangle(cornerRadius: r + out, style: .continuous).strokeBorder(Self.hex("#e9c766"), lineWidth: 2)
                    RoundedRectangle(cornerRadius: max(0, r + out - 2), style: .continuous).strokeBorder(Self.hex("#f6dc8f"), lineWidth: 2).padding(2)
                    RoundedRectangle(cornerRadius: max(0, r + out - 2), style: .continuous).strokeBorder(Self.hex("#6b4a12"), lineWidth: 1).padding(2)
                }
                .padding(-out)
                .shadow(color: .black.opacity(0.35), radius: 5, y: 2)
                ZStack {
                    RoundedRectangle(cornerRadius: r, style: .continuous).strokeBorder(Self.rgba(107, 74, 18, 0.6), lineWidth: 3)
                    RoundedRectangle(cornerRadius: r, style: .continuous).strokeBorder(Self.hex("#e9c766"), lineWidth: 1.5)
                }
            case ("neon", true):
                let out = 0.02 * w
                let pink = Self.hex("#ff4fd8")
                RoundedRectangle(cornerRadius: r + out, style: .continuous)
                    .strokeBorder(pink, lineWidth: 2)
                    .shadow(color: pink, radius: 4)
                    .shadow(color: pink.opacity(0.6), radius: 9)
                    .padding(-out)
                RoundedRectangle(cornerRadius: r + 1.5, style: .continuous)
                    .strokeBorder(Self.hex("#3ff2ff"), lineWidth: 1.5)
                    .shadow(color: Self.rgba(63, 242, 255, 0.6), radius: 5)
                    .padding(-1.5)
            case ("pixel", false):
                let out = 0.0233 * w
                Canvas { context, size in Self.pixel(in: &context, size: size) }
                    .padding(-out)
            case ("vines", true):
                let side = w * 0.5
                let height = side * 400 / 600
                DiddyVineCorner()
                    .frame(width: side, height: height)
                    .position(x: -0.0467 * w + side / 2, y: -0.0917 * w + height / 2)
                DiddyVineCorner()
                    .frame(width: side, height: height)
                    .rotationEffect(.degrees(180))
                    .position(x: w + 0.0467 * w - side / 2, y: cardSize.height + 0.0917 * w - height / 2)
            default:
                EmptyView()
            }
        }
        .frame(width: cardSize.width, height: cardSize.height, alignment: .topLeading)
    }

    /// A dark plate with a striped green border, corners cut in pixel steps.
    private static func pixel(in context: inout GraphicsContext, size: CGSize) {
        let w = size.width
        let h = size.height
        var outline = Path()
        let steps: [(CGFloat, CGFloat)] = [
            (0, 12), (6, 12), (6, 6), (12, 6), (12, 0), (w - 12, 0), (w - 12, 6), (w - 6, 6), (w - 6, 12), (w, 12),
            (w, h - 12), (w - 6, h - 12), (w - 6, h - 6), (w - 12, h - 6), (w - 12, h), (12, h), (12, h - 6), (6, h - 6),
            (6, h - 12), (0, h - 12),
        ]
        for (index, point) in steps.enumerated() {
            let at = CGPoint(x: point.0, y: point.1)
            if index == 0 { outline.move(to: at) } else { outline.addLine(to: at) }
        }
        outline.closeSubpath()
        var g = context
        g.clip(to: outline)
        var x: CGFloat = 0
        var light = true
        while x < w {
            g.fill(Path(CGRect(x: x, y: 0, width: min(8, w - x), height: h)), with: .color(hex(light ? "#8bd450" : "#5fae3a")))
            x += 8
            light.toggle()
        }
        g.fill(Path(CGRect(x: 6, y: 6, width: max(0, w - 12), height: max(0, h - 12))), with: .color(hex("#1d2033")))
    }
}

/// Desktop's original corner flourish of the vines preset: a curling stem with leaves and small
/// flowers, drawn in its 600 x 400 units.
private struct DiddyVineCorner: View {
    private static let leaves: [(Double, Double, Double)] = [
        (120, 104, -30), (190, 116, 20), (270, 100, -25), (350, 114, 15), (430, 104, -20), (62, 170, 110), (48, 240, 70), (64, 310, 110),
    ]
    private static let flowers: [(Double, Double, Double)] = [(92, 112, 40), (236, 108, 28), (56, 215, 26)]

    private static func color(_ hex: String) -> Color { Color(diddyHex: hex) ?? .green }

    var body: some View {
        Canvas { context, size in
            var g = context
            g.scaleBy(x: size.width / 600, y: size.height / 400)
            Self.draw(in: &g)
        }
        .allowsHitTesting(false)
    }

    private static func draw(in g: inout GraphicsContext) {
        var stem = Path()
        stem.move(to: CGPoint(x: 56, y: 380))
        stem.addCurve(to: CGPoint(x: 56, y: 180), control1: CGPoint(x: 40, y: 300), control2: CGPoint(x: 72, y: 250))
        stem.addCurve(to: CGPoint(x: 120, y: 110), control1: CGPoint(x: 44, y: 130), control2: CGPoint(x: 70, y: 104))
        stem.addCurve(to: CGPoint(x: 330, y: 108), control1: CGPoint(x: 200, y: 120), control2: CGPoint(x: 260, y: 92))
        stem.addCurve(to: CGPoint(x: 540, y: 108), control1: CGPoint(x: 400, y: 124), control2: CGPoint(x: 460, y: 96))
        var curl = Path()
        curl.move(to: CGPoint(x: 540, y: 108))
        curl.addCurve(to: CGPoint(x: 554, y: 72), control1: CGPoint(x: 566, y: 104), control2: CGPoint(x: 574, y: 78))
        curl.addCurve(to: CGPoint(x: 546, y: 86), control1: CGPoint(x: 540, y: 68), control2: CGPoint(x: 534, y: 82))
        var foot = Path()
        foot.move(to: CGPoint(x: 56, y: 380))
        foot.addCurve(to: CGPoint(x: 42, y: 388), control1: CGPoint(x: 60, y: 394), control2: CGPoint(x: 46, y: 398))
        let dark = color("#2f6b3a")
        let light = color("#5fa86a")
        g.stroke(stem, with: .color(dark), style: StrokeStyle(lineWidth: 16, lineCap: .round))
        g.stroke(stem, with: .color(light), style: StrokeStyle(lineWidth: 7, lineCap: .round))
        g.stroke(curl, with: .color(light), style: StrokeStyle(lineWidth: 7, lineCap: .round))
        g.stroke(foot, with: .color(light), style: StrokeStyle(lineWidth: 7, lineCap: .round))

        var leaf = Path()
        leaf.move(to: .zero)
        leaf.addCurve(to: CGPoint(x: 40, y: 0), control1: CGPoint(x: 10, y: -12), control2: CGPoint(x: 30, y: -12))
        leaf.addCurve(to: .zero, control1: CGPoint(x: 30, y: 12), control2: CGPoint(x: 10, y: 12))
        leaf.closeSubpath()
        for (x, y, angle) in leaves {
            var l = g
            l.translateBy(x: x, y: y)
            l.rotate(by: .degrees(angle))
            l.scaleBy(x: 1.9, y: 1.9)
            l.fill(leaf, with: .color(color("#4f9a5a")))
            l.stroke(leaf, with: .color(dark), lineWidth: 2)
        }

        for (x, y, s) in flowers {
            var f = g
            f.translateBy(x: x, y: y)
            for angle in stride(from: 0.0, to: 360.0, by: 72.0) {
                var petal = f
                petal.rotate(by: .degrees(angle))
                let ellipse = Path(ellipseIn: CGRect(x: -s * 0.45, y: -s * 0.6 - s * 0.7, width: s * 0.9, height: s * 1.4))
                petal.fill(ellipse, with: .color(color("#f2a7c4")))
                petal.stroke(ellipse, with: .color(color("#b8547e")), lineWidth: 1.5)
            }
            let centre = Path(ellipseIn: CGRect(x: -s * 0.35, y: -s * 0.35, width: s * 0.7, height: s * 0.7))
            f.fill(centre, with: .color(color("#ffd66b")))
            f.stroke(centre, with: .color(color("#c99a2e")), lineWidth: 1.5)
        }
    }
}
