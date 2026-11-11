import Foundation

/// The profile effect, profile frame and picture positions of a Diddy profile, checked exactly like
/// desktop does (`sanitize.ts`, `profileEffect.ts`, `profileFrame.ts`, `clientVersion.ts` in
/// `cinny/src/app/plugins/diddy`). Everything here comes from other people: only preset ids from
/// the fixed lists survive, media must be mxc://, numbers are clamped and lists are capped.
///
/// Foundation only, so `Tools/profiledecor_check` can test it without the app. The views that draw
/// it are in `UI/DiddyProfileDecorViews.swift`.
enum DiddySanitize {
    /// A finite JSON number (never a boolean), else nil. `typeof v === 'number'` of desktop.
    static func number(_ value: Any?) -> Double? {
        guard let value, !(value is String), type(of: value) != Bool.self, let number = value as? NSNumber else { return nil }
        #if canImport(ObjectiveC)
        if CFGetTypeID(number) == CFBooleanGetTypeID() { return nil }
        #endif
        let double = number.doubleValue
        return double.isFinite ? double : nil
    }

    static func number(_ value: Any?, fallback: Double) -> Double { number(value) ?? fallback }

    static func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double { min(high, max(low, value)) }

    /// `Math.round` of JavaScript: halves go up (towards +infinity), also for negative numbers.
    static func jsRound(_ value: Double) -> Double { (value + 0.5).rounded(.down) }

    /// `JSON null` and a missing key are both "nullish" for desktop's `a ?? b`.
    static func isNullish(_ value: Any?) -> Bool { value == nil || value is NSNull }

    /// `a ?? b` of desktop: the first value unless it is missing or null.
    static func either(_ first: Any?, _ second: Any?) -> Any? { isNullish(first) ? second : first }

    /// The same check as `safeMxc` (`^mxc://[A-Za-z0-9.\-:[\]]+/[A-Za-z0-9_-]+$`, at most 512 long),
    /// without a Regex so it runs everywhere.
    static func mxc(_ value: Any?) -> String? {
        guard let raw = value as? String, raw.utf16.count <= 512, raw.hasPrefix("mxc://") else { return nil }
        let rest = raw.dropFirst(6).unicodeScalars
        guard let slash = rest.firstIndex(of: "/") else { return nil }
        let server = rest[rest.startIndex..<slash]
        let media = rest[rest.index(after: slash)...]
        guard !server.isEmpty, !media.isEmpty,
              server.allSatisfy({ isAlphanumeric($0) || ".-:[]".unicodeScalars.contains($0) }),
              media.allSatisfy({ isAlphanumeric($0) || $0 == "_" || $0 == "-" }) else { return nil }
        return raw
    }

    /// `[A-Za-z0-9]`
    static func isAlphanumeric(_ s: Unicode.Scalar) -> Bool {
        (0x30...0x39).contains(s.value) || (0x41...0x5A).contains(s.value) || (0x61...0x7A).contains(s.value)
    }

    static func isDigit(_ s: Unicode.Scalar) -> Bool { (0x30...0x39).contains(s.value) }

    /// A JSON `false` (a boolean, not the number 0). Desktop's `v === false`.
    static func isFalse(_ value: Any?) -> Bool {
        guard let value else { return false }
        if type(of: value) == Bool.self { return (value as? Bool) == false }
        #if canImport(ObjectiveC)
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() { return !number.boolValue }
        #endif
        return false
    }

    /// Trimmed text of at most `max` characters (code points) without control characters, or nil
    /// when empty.
    static func text(_ value: Any?, max: Int) -> String? {
        guard let raw = value as? String else { return nil }
        var scalars = String.UnicodeScalarView()
        for scalar in raw.unicodeScalars.prefix(max) {
            scalars.append(scalar.value < 0x20 || scalar.value == 0x7F ? Unicode.Scalar(UInt8(0x20)) : scalar)
        }
        let out = String(scalars).trimmingCharacters(in: .whitespacesAndNewlines)
        return out.isEmpty ? nil : out
    }

    /// `safeVersion` of desktop: `1.5.4` or `1.5.4-beta.1` (`^\d{1,4}\.\d{1,4}\.\d{1,4}(-[0-9A-Za-z.]{1,24})?$`).
    static func version(_ value: Any?) -> String? {
        guard let raw = value as? String, raw.utf16.count <= 40 else { return nil }
        let parts = raw.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        let numbers = parts[0].split(separator: ".", omittingEmptySubsequences: false)
        func digits(_ s: Substring) -> Bool { (1...4).contains(s.count) && s.unicodeScalars.allSatisfy(isDigit) }
        guard numbers.count == 3, numbers.allSatisfy(digits) else { return nil }
        if parts.count == 2 {
            let suffix = parts[1]
            guard (1...24).contains(suffix.count),
                  suffix.unicodeScalars.allSatisfy({ isAlphanumeric($0) || $0 == "." })
            else { return nil }
        }
        return raw
    }
}

/// Which part of a picture shows (`ImagePos`, `sanitizeImagePos`): focal point in percent and a
/// zoom of 1 (cover) to 3.
struct DiddyImagePos: Equatable {
    var x = 50.0
    var y = 50.0
    var zoom = 1.0

    init(x: Double = 50, y: Double = 50, zoom: Double = 1) {
        self.x = x
        self.y = y
        self.zoom = zoom
    }

    init?(_ raw: Any?) {
        guard let dict = raw as? [String: Any], let x = DiddySanitize.number(dict["x"]),
              let y = DiddySanitize.number(dict["y"]), let zoom = DiddySanitize.number(dict["zoom"]) else { return nil }
        self.x = DiddySanitize.clamp(x, 0, 100)
        self.y = DiddySanitize.clamp(y, 0, 100)
        self.zoom = DiddySanitize.clamp(zoom, 1, 3)
    }

    /// Where a picture of `image` size is drawn in a box of `box` size (`positionedImgStyle`): it
    /// covers the box with the focal point at the same relative place, then zooms around it.
    /// Returns x, y, width, height in the box's coordinates.
    func placement(imageWidth: Double, imageHeight: Double, boxWidth: Double, boxHeight: Double) -> (x: Double, y: Double, width: Double, height: Double) {
        guard imageWidth > 0, imageHeight > 0, boxWidth > 0, boxHeight > 0 else { return (0, 0, boxWidth, boxHeight) }
        let cover = max(boxWidth / imageWidth, boxHeight / imageHeight)
        let width = imageWidth * cover
        let height = imageHeight * cover
        // object-position: x % of the free room
        let left = (boxWidth - width) * x / 100
        let top = (boxHeight - height) * y / 100
        // transform: scale(zoom) around the origin x % y % of the box
        let originX = boxWidth * x / 100
        let originY = boxHeight * y / 100
        return (originX + (left - originX) * zoom, originY + (top - originY) * zoom, width * zoom, height * zoom)
    }
}

// MARK: - Profile effect (#86)

/// The animated overlay over a profile card (`ProfileEffect`): one of the original presets, or up
/// to four uploaded layers placed in a 450 x 880 reference box with their own timing.
struct DiddyProfileEffect: Equatable {
    struct Layer: Equatable {
        /// APNG / WebP / GIF
        let mxc: String
        /// ms after the card opened until the layer first shows
        var start = 0.0
        /// ms one play lasts; 0 = the picture loops by itself and is never restarted
        var duration = 0.0
        /// plays again from its first frame after `loopDelay`
        var loop = true
        var loopDelay = 0.0
        /// box in the reference: left, top, width, height
        var x = 0.0
        var y = 0.0
        var w = DiddyProfileEffect.refWidth
        var h = DiddyProfileEffect.refHeight
        /// stacking order between the layers
        var z = 0.0
    }

    struct LayerState: Equatable {
        var visible: Bool
        /// play number: when it changes the picture restarts from its first frame
        var cycle: Int
        /// ms until the state changes next (`.infinity`: never)
        var nextChangeIn: Double
    }

    /// What a card draws for an effect (`resolveProfileEffect`).
    enum Resolved: Equatable {
        case preset(String, animate: Bool)
        case layers([Layer])
        /// Nothing may move: the still picture, else the first frame of every layer.
        case still(stillMxc: String?, layers: [Layer])
    }

    static let presets = ["sparkles", "petals", "embers", "snow", "hearts", "aurora"]
    static let refWidth = 450.0
    static let refHeight = 880.0
    static let maxLayers = 4
    static let maxLayerBytes = 3 * 1024 * 1024
    /// The still (reduced motion) picture and the preview.
    static let maxStillBytes = 1536 * 1024
    static let maxTotalBytes = 8 * 1024 * 1024
    static let minDurationMs = 250.0
    static let maxDurationMs = 30_000.0
    static let maxStartMs = 30_000.0
    static let maxLoopDelayMs = 60_000.0
    static let maxZ = 1000.0
    /// Picture types a layer may have, read from its bytes.
    static let imageTypes: Set<String> = ["image/png", "image/gif", "image/webp"]

    var preset: String?
    var layers: [Layer] = []
    var stillMxc: String?
    var previewMxc: String?
    var name: String?

    /// `sanitizeProfileEffect`: layers win over a preset; nil when neither is valid.
    init?(_ raw: Any?) {
        guard let dict = raw as? [String: Any] else { return nil }
        if let items = dict["layers"] as? [Any] {
            for case let item as [String: Any] in items.prefix(16) where layers.count < Self.maxLayers {
                guard let mxc = DiddySanitize.mxc(item["mxc"]) else { continue }
                layers.append(Self.clampLayer(item, mxc: mxc))
            }
        }
        if !layers.isEmpty {
            stillMxc = DiddySanitize.mxc(dict["stillMxc"])
            previewMxc = DiddySanitize.mxc(dict["previewMxc"])
            name = DiddySanitize.text(dict["name"], max: 48)
            return
        }
        guard let id = dict["preset"] as? String, Self.presets.contains(id) else { return nil }
        preset = id
    }

    init(preset: String) {
        self.preset = preset
    }

    /// `clampLayerTiming`: timing and box of a layer, every number clamped.
    static func clampLayer(_ raw: [String: Any], mxc: String) -> Layer {
        let position: [String: Any]
        if let nested = raw["position"] as? [String: Any] {
            position = nested
        } else if raw["position"] is [Any] {
            position = [:] // an array is an "object" for desktop, without x / y
        } else {
            position = raw
        }
        let rawDuration = DiddySanitize.number(raw["duration"], fallback: 0)
        let duration = rawDuration <= 0 ? 0 : DiddySanitize.jsRound(DiddySanitize.clamp(rawDuration, minDurationMs, maxDurationMs))
        func clamped(_ value: Any?, fallback: Double, _ low: Double, _ high: Double) -> Double {
            DiddySanitize.jsRound(DiddySanitize.clamp(DiddySanitize.number(value, fallback: fallback), low, high))
        }
        var layer = Layer(mxc: mxc)
        layer.start = clamped(raw["start"], fallback: 0, 0, maxStartMs)
        layer.duration = duration
        layer.loop = !DiddySanitize.isFalse(raw["loop"])
        layer.loopDelay = clamped(raw["loopDelay"], fallback: 0, 0, maxLoopDelayMs)
        layer.x = clamped(position["x"], fallback: 0, -refWidth, refWidth)
        layer.y = clamped(position["y"], fallback: 0, -refHeight, refHeight)
        layer.w = clamped(DiddySanitize.either(raw["w"], raw["width"]), fallback: refWidth, 1, refWidth * 2)
        layer.h = clamped(DiddySanitize.either(raw["h"], raw["height"]), fallback: refHeight, 1, refHeight * 2)
        layer.z = clamped(DiddySanitize.either(raw["z"], raw["zIndex"]), fallback: 0, 0, maxZ)
        return layer
    }

    /// `layerStateAt`: hidden until `start`, then shown for `duration`; a looping layer pauses
    /// `loopDelay` and plays again from its first frame, a single play goes away. Duration 0: shown
    /// from `start` on and never restarted. `t` is ms since the card opened.
    static func state(of layer: Layer, at t: Double) -> LayerState {
        let elapsed = t - layer.start
        if elapsed < 0 { return LayerState(visible: false, cycle: 0, nextChangeIn: -elapsed) }
        if layer.duration <= 0 { return LayerState(visible: true, cycle: 0, nextChangeIn: .infinity) }
        if !layer.loop {
            return elapsed < layer.duration
                ? LayerState(visible: true, cycle: 0, nextChangeIn: layer.duration - elapsed)
                : LayerState(visible: false, cycle: 0, nextChangeIn: .infinity)
        }
        let period = max(minDurationMs, layer.duration + layer.loopDelay)
        let cycle = (elapsed / period).rounded(.down)
        let within = elapsed - cycle * period
        // a cycle count beyond Int is impossible in practice (period >= 250 ms)
        let count = cycle < Double(Int.max) ? Int(cycle) : Int.max
        if within < layer.duration { return LayerState(visible: true, cycle: count, nextChangeIn: layer.duration - within) }
        return LayerState(visible: false, cycle: count, nextChangeIn: period - within)
    }

    /// `resolveProfileEffect`: layers sorted by `z` (stable); with `animate` false presets stand
    /// still and uploaded effects show their still picture.
    func resolved(animate: Bool) -> Resolved? {
        let sorted = layers.enumerated().sorted { $0.element.z != $1.element.z ? $0.element.z < $1.element.z : $0.offset < $1.offset }.map(\.element)
        if !sorted.isEmpty { return animate ? .layers(sorted) : .still(stillMxc: stillMxc, layers: sorted) }
        if let preset, Self.presets.contains(preset) { return .preset(preset, animate: animate) }
        return nil
    }

    /// Scale of the reference box so it covers a card of this size, anchored at the top centre.
    static func coverScale(width: Double, height: Double) -> Double {
        guard width > 0, height > 0 else { return 0 }
        return max(width / refWidth, height / refHeight)
    }

    // MARK: Built-in presets: deterministic particles (`presetParticles`)

    struct Particle: Equatable {
        /// horizontal / vertical position in percent of the card
        var x: Double
        var y: Double
        /// points
        var size: Double
        /// s, negative so every particle is already somewhere when the card opens
        var delay: Double
        /// s
        var duration: Double
        /// points of sideways drift
        var drift: Double
        /// degrees
        var spin: Double
        /// 0-1, picks a colour variant
        var tone: Double
    }

    private static let particleCount: [String: Int] = ["sparkles": 16, "petals": 12, "embers": 16, "snow": 22, "hearts": 10, "aurora": 3]
    private static let speed: [String: (Double, Double)] = [
        "sparkles": (1.6, 3.2), "petals": (7, 12), "embers": (4, 8), "snow": (8, 14), "hearts": (6, 10), "aurora": (10, 16),
    ]
    private static let sizes: [String: (Double, Double)] = [
        "sparkles": (9, 18), "petals": (9, 15), "embers": (2, 5), "snow": (2, 6), "hearts": (8, 14), "aurora": (60, 90),
    ]

    /// The particles of a preset, the same numbers desktop draws (same seeded PRNG, mulberry32).
    static func particles(_ id: String) -> [Particle] {
        guard presets.contains(id), let count = particleCount[id], let speedRange = speed[id], let sizeRange = sizes[id] else { return [] }
        let (minSpeed, maxSpeed) = speedRange
        let (minSize, maxSize) = sizeRange
        var seed: UInt32 = 2_166_136_261
        for scalar in id.unicodeScalars { seed = (seed ^ scalar.value) &* 16_777_619 }
        var state = seed
        func rnd() -> Double {
            state = state &+ 0x6D2B_79F5
            var t = state
            t = (t ^ (t >> 15)) &* (t | 1)
            t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
            return Double(t ^ (t >> 14)) / 4_294_967_296
        }
        func round(_ value: Double, _ scale: Double) -> Double { DiddySanitize.jsRound(value * scale) / scale }
        return (0..<count).map { i in
            var x = rnd() * 100
            if id == "sparkles" {
                // left or right edge band, alternating
                let band = rnd() * 22
                x = i % 2 == 0 ? 2 + band : 98 - band
            }
            if id == "aurora" { x = Double(i) / Double(count) * 100 + rnd() * 10 }
            let duration = minSpeed + rnd() * (maxSpeed - minSpeed)
            return Particle(
                x: round(x, 10),
                y: DiddySanitize.jsRound(rnd() * 1000) / 10,
                size: DiddySanitize.jsRound(minSize + rnd() * (maxSize - minSize)),
                delay: -DiddySanitize.jsRound(rnd() * duration * 100) / 100,
                duration: round(duration, 100),
                drift: DiddySanitize.jsRound((rnd() - 0.5) * 60),
                spin: DiddySanitize.jsRound((rnd() - 0.5) * 720),
                tone: DiddySanitize.jsRound(rnd() * 100) / 100
            )
        }
    }
}

// MARK: - Profile frame (#87)

/// The decorative frame around a profile card (`ProfileFrame`): one of the original presets, or up
/// to four uploaded pictures hung on the card's edges. Geometry is in the units of the pictures:
/// the card is `innerWidth` wide and the frame sticks out by the overflows; on screen everything is
/// scaled by cardWidth / innerWidth.
struct DiddyProfileFrame: Equatable {
    struct Geometry: Equatable {
        var innerWidth = DiddyProfileFrame.defaultInnerWidth
        var overflowTop = 0.0
        var overflowBottom = 0.0
        var overflowHorizontal = 0.0
    }

    struct Layer: Equatable {
        /// PNG / APNG / WebP
        let mxc: String
        /// "front" (over the card) or "back" (behind it)
        var order = "front"
        /// "top", "bottom", "center" or "fill" (stretched over the card and its overhangs)
        var anchor = "fill"
    }

    enum Resolved: Equatable {
        case preset(String, Geometry)
        case layers([Layer], Geometry)

        var geometry: Geometry {
            switch self {
            case let .preset(_, geometry), let .layers(_, geometry): return geometry
            }
        }
    }

    /// Overhangs as fractions of the card width.
    struct Factors: Equatable {
        var top: Double
        var bottom: Double
        var side: Double
    }

    static let maxLayers = 4
    static let maxLayerBytes = 2 * 1024 * 1024
    static let maxTotalBytes = 6 * 1024 * 1024
    static let maxOverflow = 400.0
    static let minInnerWidth = 300.0
    static let maxInnerWidth = 2000.0
    static let defaultInnerWidth = 1200.0
    static let orders = ["front", "back"]
    static let anchors = ["top", "bottom", "center", "fill"]
    /// PNG (also APNG) and WebP, read from the bytes.
    static let imageTypes: Set<String> = ["image/png", "image/webp"]
    /// `PROFILE_FRAME_PRESETS`: id → overflow top, bottom, side (inner width 1200).
    static let presetGeometry: [String: Geometry] = [
        "glow": Geometry(overflowTop: 40, overflowBottom: 40, overflowHorizontal: 40),
        "gold": Geometry(overflowTop: 24, overflowBottom: 24, overflowHorizontal: 24),
        "vines": Geometry(overflowTop: 110, overflowBottom: 110, overflowHorizontal: 56),
        "neon": Geometry(overflowTop: 48, overflowBottom: 48, overflowHorizontal: 48),
        "pixel": Geometry(overflowTop: 28, overflowBottom: 28, overflowHorizontal: 28),
    ]
    static let presets = ["glow", "gold", "vines", "neon", "pixel"]

    var preset: String?
    var layers: [Layer] = []
    var geometry = Geometry()
    var name: String?

    /// `sanitizeProfileFrame`: layers (with clamped geometry) win over a preset; nil when neither.
    init?(_ raw: Any?) {
        guard let dict = raw as? [String: Any] else { return nil }
        if let items = dict["layers"] as? [Any] {
            for case let item as [String: Any] in items.prefix(16) where layers.count < Self.maxLayers {
                guard let mxc = DiddySanitize.mxc(item["mxc"]) else { continue }
                layers.append(Self.clampLayer(item, mxc: mxc))
            }
        }
        if !layers.isEmpty {
            geometry = Self.clampGeometry(dict)
            name = DiddySanitize.text(dict["name"], max: 48)
            return
        }
        guard let id = dict["preset"] as? String, Self.presets.contains(id) else { return nil }
        preset = id
    }

    init(preset: String) {
        self.preset = preset
    }

    /// `clampFrameGeometry`: camelCase or the snake_case of frame packs, clamped.
    static func clampGeometry(_ raw: [String: Any]) -> Geometry {
        func value(_ camel: String, _ snake: String, fallback: Double) -> Double {
            DiddySanitize.number(DiddySanitize.either(raw[camel], raw[snake]), fallback: fallback)
        }
        return clamped(Geometry(
            innerWidth: value("innerWidth", "inner_width", fallback: defaultInnerWidth),
            overflowTop: value("overflowTop", "overflow_top", fallback: 0),
            overflowBottom: value("overflowBottom", "overflow_bottom", fallback: 0),
            overflowHorizontal: value("overflowHorizontal", "overflow_horizontal", fallback: 0)
        ))
    }

    /// The same clamping for a geometry that is already numbers (non-finite ones fall back).
    static func clamped(_ g: Geometry) -> Geometry {
        func overflow(_ v: Double) -> Double { DiddySanitize.jsRound(DiddySanitize.clamp(v.isFinite ? v : 0, 0, maxOverflow)) }
        let inner = g.innerWidth.isFinite ? g.innerWidth : defaultInnerWidth
        return Geometry(innerWidth: DiddySanitize.jsRound(DiddySanitize.clamp(inner, minInnerWidth, maxInnerWidth)),
                        overflowTop: overflow(g.overflowTop), overflowBottom: overflow(g.overflowBottom),
                        overflowHorizontal: overflow(g.overflowHorizontal))
    }

    /// `clampFrameLayer`: anything unknown becomes a front overlay over the whole frame.
    static func clampLayer(_ raw: [String: Any], mxc: String) -> Layer {
        Layer(
            mxc: mxc,
            order: (raw["order"] as? String).flatMap { orders.contains($0) ? $0 : nil } ?? "front",
            anchor: (raw["anchor"] as? String).flatMap { anchors.contains($0) ? $0 : nil } ?? "fill"
        )
    }

    /// `resolveProfileFrame`: what the card draws, nil when there is nothing.
    var resolved: Resolved? {
        if !layers.isEmpty { return .layers(Array(layers.prefix(Self.maxLayers)), Self.clamped(geometry)) }
        if let preset, let geometry = Self.presetGeometry[preset] { return .preset(preset, geometry) }
        return nil
    }

    /// `frameFactors`: the overhangs as fractions of the card width, rounded to 4 places.
    static func factors(_ geometry: Geometry) -> Factors {
        let g = clamped(geometry)
        func round4(_ value: Double) -> Double { DiddySanitize.jsRound(value * 10000) / 10000 }
        return Factors(top: round4(g.overflowTop / g.innerWidth), bottom: round4(g.overflowBottom / g.innerWidth),
                       side: round4(g.overflowHorizontal / g.innerWidth))
    }

    /// The card width that, with both side overhangs, fits into `available` (never wider than `preferred`).
    static func cardWidth(available: Double, preferred: Double = .infinity, geometry: Geometry) -> Double {
        let side = factors(geometry).side
        return max(0, min(preferred, available / (1 + 2 * side)))
    }
}

// MARK: - Picture types

/// The type of a picture from its first bytes (`imageInfo` of desktop, without the animation
/// details), never from its name or what a server says.
enum DiddyImageSniff {
    static func type(of data: Data) -> String? {
        guard data.count >= 16 else { return nil }
        let b = [UInt8](data.prefix(16))
        if b.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return "image/png" }
        if b.starts(with: [0x47, 0x49, 0x46, 0x38]) { return "image/gif" }
        if b.starts(with: [0x52, 0x49, 0x46, 0x46]), b[8..<12].elementsEqual([0x57, 0x45, 0x42, 0x50]) { return "image/webp" }
        if b.starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
        return nil
    }
}
