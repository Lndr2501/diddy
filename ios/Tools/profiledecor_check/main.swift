// Checks for Diddy/Matrix/DiddyProfileDecor.swift: profile effects (#86), profile frames (#87),
// picture positions and the client version are parsed exactly like desktop's sanitize.ts,
// profileEffect.ts and profileFrame.ts (expected numbers come from cinny/tests and the desktop code).
// Foundation only. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/DiddyProfileDecor.swift Tools/profiledecor_check/main.swift -o /tmp/profiledecor_check && /tmp/profiledecor_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
/// Content as it arrives from the server: parsed by JSONSerialization like in the app.
func json(_ text: String) -> Any? {
    try? JSONSerialization.jsonObject(with: Data(text.utf8))
}

let mxc = "mxc://matrix.tllx.eu/AbCdEf0123456789AbCdEf01"

// MARK: mxc, text, version

check(DiddySanitize.mxc(mxc) == mxc, "plain mxc accepted")
check(DiddySanitize.mxc("mxc://[::1]:8448/abc_DEF-1") != nil, "IPv6 server with port accepted")
for bad in ["https://evil.example/x.png", "mxc://evil/../../x", "mxc://a.b/c/d", "mxc:///abc", "mxc://a.b/", "mxc://a b/c",
            "javascript:alert(1)", "mxc://ä.de/x", "mxc://a.b/c?x=1", "MXC://a.b/c"] {
    check(DiddySanitize.mxc(bad) == nil, "mxc refused: \(bad)")
}
check(DiddySanitize.mxc("mxc://a.b/" + String(repeating: "x", count: 600)) == nil, "overlong mxc refused")
check(DiddySanitize.mxc(5) == nil, "a number is no mxc")
check(DiddySanitize.text("  hi\u{0007}there  ", max: 48) == "hi there", "control characters become spaces, trimmed")
check(DiddySanitize.text(String(repeating: "x", count: 500), max: 48)?.count == 48, "text cut to 48")
check(DiddySanitize.text("   ", max: 48) == nil, "blank text is nil")
for (raw, expected) in [("1.5.4", "1.5.4"), ("1.5.4-beta.1", "1.5.4-beta.1"), ("01.2.3", "01.2.3"), ("1.5", nil), ("v1.5.4", nil),
                        ("1.5.4-" + String(repeating: "a", count: 25), nil), ("1.5.4-", nil), ("12345.1.1", nil), ("1.5.4-b_1", nil)] as [(String, String?)] {
    check(DiddySanitize.version(raw) == expected, "version \(raw)")
}

// JSON booleans are never numbers.
let booleans = json(#"{"t": true, "f": false, "one": 1, "zero": 0, "half": 2.5, "s": "3"}"#) as? [String: Any] ?? [:]
check(DiddySanitize.number(booleans["t"]) == nil, "true is not a number")
check(DiddySanitize.number(booleans["one"]) == 1, "1 is a number")
check(DiddySanitize.number(booleans["zero"]) == 0, "0 is a number")
check(DiddySanitize.number(booleans["half"]) == 2.5, "2.5 is a number")
check(DiddySanitize.number(booleans["s"]) == nil, "a string is not a number")
check(DiddySanitize.isFalse(booleans["f"]), "false is false")
check(!DiddySanitize.isFalse(booleans["zero"]), "0 is not false")
check(DiddySanitize.jsRound(-7.5) == -7 && DiddySanitize.jsRound(10.5) == 11 && DiddySanitize.jsRound(-10.5) == -10, "JavaScript rounding")

// MARK: picture position

let pos = DiddyImagePos(json(#"{"x": 150, "y": -4, "zoom": 9}"#))
check(pos == DiddyImagePos(x: 100, y: 0, zoom: 3), "position clamped")
check(DiddyImagePos(json(#"{"x": 10, "y": 10}"#)) == nil, "position without zoom refused")
check(DiddyImagePos(json(#"{"x": true, "y": 10, "zoom": 1}"#)) == nil, "boolean position refused")
let centred = DiddyImagePos().placement(imageWidth: 200, imageHeight: 100, boxWidth: 100, boxHeight: 100)
check(centred.x == -50 && centred.y == 0 && centred.width == 200 && centred.height == 100, "cover, centred")
let left = DiddyImagePos(x: 0, y: 50, zoom: 1).placement(imageWidth: 200, imageHeight: 100, boxWidth: 100, boxHeight: 100)
check(left.x == 0, "focal point on the left edge")
let zoomed = DiddyImagePos(x: 100, y: 100, zoom: 2).placement(imageWidth: 100, imageHeight: 100, boxWidth: 100, boxHeight: 100)
check(zoomed.x == -100 && zoomed.y == -100 && zoomed.width == 200, "zoom keeps the focal corner in place")

// MARK: effect: presets

check(DiddyProfileEffect(json(#"{"preset": "petals"}"#))?.preset == "petals", "preset kept")
for bad in [#"{"preset": "evil"}"#, #"{"preset": "url(javascript:alert(1))"}"#, #"{"preset": ["sparkles"]}"#, #""sparkles""#, "null", "[]"] {
    check(DiddyProfileEffect(json(bad)) == nil, "effect refused: \(bad)")
}

// MARK: effect: layers (cinny/tests/profileEffect.test.cjs)

let layerJSON = #"{"mxc": "\#(mxc)", "start": 0, "duration": 2960, "loop": true, "loopDelay": 0, "x": 0, "y": 0, "w": 450, "h": 880, "z": 100}"#
let hostile = json(#"""
{"preset": "snow", "name": "  \#(String(repeating: "x", count: 200))", "stillMxc": "https://evil.example/still.png", "previewMxc": "\#(mxc)",
 "layers": [
   {"mxc": "javascript:alert(1)"}, {"mxc": "mxc://evil/../../x"}, "not a layer",
   {"mxc": "\#(mxc)", "start": -5, "duration": 1, "loopDelay": 1e12, "x": 1e9, "y": -1e9, "w": 1e300, "h": "tall", "z": "NaN", "loop": "yes", "onload": "alert(1)"},
   \#(layerJSON), \#(layerJSON), \#(layerJSON), \#(layerJSON)
 ]}
"""#)
if let effect = DiddyProfileEffect(hostile) {
    check(effect.preset == nil, "layers win over the preset")
    check(effect.stillMxc == nil, "https still refused")
    check(effect.previewMxc == mxc, "preview kept")
    check((effect.name?.count ?? 0) > 0 && (effect.name?.count ?? 99) <= 48, "name cut")
    check(effect.layers.count == 4, "at most four layers")
    let first = effect.layers[0]
    check(first.start == 0 && first.duration == 250 && first.loop && first.loopDelay == 60_000, "timing clamped: \(first)")
    check(first.x == 450 && first.y == -880 && first.w == 900 && first.h == 880 && first.z == 0, "box clamped: \(first)")
} else {
    check(false, "hostile effect still has valid layers")
}
check(DiddyProfileEffect(json(#"{"preset": "aurora", "layers": [{"mxc": "x"}]}"#))?.preset == "aurora", "no valid layer: preset")
check(DiddyProfileEffect(json(#"{"layers": [{"mxc": "x"}], "stillMxc": "\#(mxc)"}"#)) == nil, "no valid layer, no preset: nothing")

// Desktop: clampLayerTiming({start:-0.5,duration:2500.5,x:-10.5,y:10.5,w:'a',width:300,h:null,height:200,zIndex:true,z:null,loop:0})
// = {start:0,duration:2501,loop:true,loopDelay:0,x:-10,y:11,w:450,h:200,z:0}
if let raw = json(#"{"start": -0.5, "duration": 2500.5, "x": -10.5, "y": 10.5, "w": "a", "width": 300, "h": null, "height": 200, "zIndex": true, "z": null, "loop": 0}"#) as? [String: Any] {
    let l = DiddyProfileEffect.clampLayer(raw, mxc: mxc)
    check(l.start == 0 && l.duration == 2501 && l.loop && l.loopDelay == 0, "timing like desktop: \(l)")
    check(l.x == -10 && l.y == 11 && l.w == 450 && l.h == 200 && l.z == 0, "box like desktop: \(l)")
}
if let raw = json(#"{"position": {"x": 12.4, "y": -30}, "zIndex": 101}"#) as? [String: Any] {
    let l = DiddyProfileEffect.clampLayer(raw, mxc: mxc)
    check(l.x == 12 && l.y == -30 && l.w == 450 && l.h == 880 && l.z == 101 && l.duration == 0, "nested position: \(l)")
}
if let raw = json(#"{"position": [1, 2], "x": 5, "loop": false}"#) as? [String: Any] {
    let l = DiddyProfileEffect.clampLayer(raw, mxc: mxc)
    check(l.x == 0 && !l.loop, "an array position has no x; loop false kept")
}
if let raw = json(#"{"duration": "9e9", "start": "1"}"#) as? [String: Any] {
    let l = DiddyProfileEffect.clampLayer(raw, mxc: mxc)
    check(l.duration == 0 && l.start == 0, "strings are no numbers")
}

// MARK: effect: timing (layerStateAt)

var second = DiddyProfileEffect.Layer(mxc: mxc)
second.start = 5920; second.duration = 2880; second.loopDelay = 4320
check(DiddyProfileEffect.state(of: second, at: 0) == .init(visible: false, cycle: 0, nextChangeIn: 5920), "hidden until start")
check(DiddyProfileEffect.state(of: second, at: 5920) == .init(visible: true, cycle: 0, nextChangeIn: 2880), "shown at start")
check(DiddyProfileEffect.state(of: second, at: 8800) == .init(visible: false, cycle: 0, nextChangeIn: 4320), "paused")
check(DiddyProfileEffect.state(of: second, at: 13120) == .init(visible: true, cycle: 1, nextChangeIn: 2880), "restarted")
var once = DiddyProfileEffect.Layer(mxc: mxc)
once.start = 100; once.duration = 1000; once.loop = false
check(DiddyProfileEffect.state(of: once, at: 500).visible, "single play visible")
check(DiddyProfileEffect.state(of: once, at: 1100) == .init(visible: false, cycle: 0, nextChangeIn: .infinity), "single play gone")
let forever = DiddyProfileEffect.Layer(mxc: mxc)
check(DiddyProfileEffect.state(of: forever, at: 1e9) == .init(visible: true, cycle: 0, nextChangeIn: .infinity), "duration 0 never restarts")
var loop = DiddyProfileEffect.Layer(mxc: mxc)
loop.duration = 2960
check(DiddyProfileEffect.state(of: loop, at: 2960).cycle == 1 && DiddyProfileEffect.state(of: loop, at: 2960).visible, "loop without pause")
if let raw = json(#"{"duration": 0.0001, "loopDelay": -10, "start": -1}"#) as? [String: Any] {
    let fast = DiddyProfileEffect.clampLayer(raw, mxc: mxc)
    check(fast.duration == 250, "minimum duration")
    var t = 0.0
    while t < 5000 { check(DiddyProfileEffect.state(of: fast, at: t).nextChangeIn > 0, "always waits at \(t)"); t += 37 }
}

// MARK: effect: resolve

var a = DiddyProfileEffect.Layer(mxc: mxc); a.z = 5
var b = DiddyProfileEffect.Layer(mxc: mxc + "2"); b.z = 1
var both = DiddyProfileEffect(preset: "snow")
both.preset = nil; both.layers = [a, b]; both.stillMxc = mxc
check(both.resolved(animate: true) == .layers([b, a]), "layers sorted by z")
check(both.resolved(animate: false) == .still(stillMxc: mxc, layers: [b, a]), "still without motion")
check(DiddyProfileEffect(preset: "snow").resolved(animate: false) == .preset("snow", animate: false), "preset stands still")
check(DiddyProfileEffect(preset: "evil").resolved(animate: true) == nil, "unknown preset resolves to nothing")
check(DiddyProfileEffect.coverScale(width: 450, height: 440) == 1 && DiddyProfileEffect.coverScale(width: 225, height: 1760) == 2, "cover scale")

// MARK: effect: preset particles, the same numbers as desktop's presetParticles()

typealias P = DiddyProfileEffect.Particle
let expectedParticles: [String: (count: Int, first: P, last: P)] = [
    "sparkles": (16, P(x: 21.3, y: 51, size: 15, delay: -0.8, duration: 3.14, drift: -20, spin: 63, tone: 0.76),
                 P(x: 91.5, y: 85.3, size: 18, delay: -2.53, duration: 2.83, drift: 19, spin: 37, tone: 0.3)),
    "petals": (12, P(x: 76, y: 26.3, size: 11, delay: -9.11, duration: 11.68, drift: -5, spin: -52, tone: 0.96),
               P(x: 61.9, y: 60.1, size: 12, delay: -4.82, duration: 11.15, drift: -3, spin: -111, tone: 0.91)),
    "embers": (16, P(x: 30.6, y: 73.2, size: 4, delay: -5.53, duration: 7.69, drift: 1, spin: 14, tone: 0.79),
               P(x: 93.9, y: 51.1, size: 2, delay: -2.13, duration: 4.07, drift: 15, spin: 81, tone: 0.33)),
    "snow": (22, P(x: 93.3, y: 89.6, size: 3, delay: -0.64, duration: 10.9, drift: -28, spin: -118, tone: 0.09),
             P(x: 72.4, y: 43.7, size: 5, delay: -5.21, duration: 13.93, drift: 26, spin: -15, tone: 0.21)),
    "hearts": (10, P(x: 55, y: 12.9, size: 13, delay: -2.27, duration: 8.96, drift: 2, spin: -12, tone: 0.69),
               P(x: 51.3, y: 38.8, size: 9, delay: -6.48, duration: 9.62, drift: -19, spin: -254, tone: 0.93)),
    "aurora": (3, P(x: 4.5, y: 32.2, size: 81, delay: -2.67, duration: 10.04, drift: -10, spin: -29, tone: 0.1),
               P(x: 72.2, y: 92.1, size: 83, delay: -8.53, duration: 14.74, drift: -4, spin: -240, tone: 0.9)),
]
func close(_ p: DiddyProfileEffect.Particle, _ q: DiddyProfileEffect.Particle) -> Bool {
    let pairs = [(p.x, q.x), (p.y, q.y), (p.size, q.size), (p.delay, q.delay), (p.duration, q.duration), (p.drift, q.drift), (p.spin, q.spin), (p.tone, q.tone)]
    return pairs.allSatisfy { abs($0.0 - $0.1) < 1e-9 }
}
for id in DiddyProfileEffect.presets {
    let particles = DiddyProfileEffect.particles(id)
    guard let expected = expectedParticles[id], let first = particles.first, let last = particles.last else {
        check(false, "particles for \(id)"); continue
    }
    check(particles.count == expected.count, "\(id): \(particles.count) particles")
    check(close(first, expected.first), "\(id) first particle \(first)")
    check(close(last, expected.last), "\(id) last particle \(last)")
    check(particles == DiddyProfileEffect.particles(id), "\(id) deterministic")
}
check(DiddyProfileEffect.particles("evil").isEmpty, "no particles for unknown presets")

// MARK: frame (cinny/tests/profileFrame.test.cjs)

check(DiddyProfileFrame(json(#"{"preset": "gold"}"#))?.preset == "gold", "frame preset kept")
for bad in [#"{"preset": "javascript:alert(1)"}"#, #"{"preset": "__proto__"}"#, #""gold""#, "null", #"[{"preset": "gold"}]"#] {
    check(DiddyProfileFrame(json(bad)) == nil, "frame refused: \(bad)")
}
if let frame = DiddyProfileFrame(json(#"""
{"layers": [
  {"mxc": "https://evil.example/x.png", "order": "front", "anchor": "top"},
  {"mxc": "\#(mxc)", "order": "behind<script>", "anchor": "everywhere"},
  {"mxc": "\#(mxc)", "order": "back", "anchor": "bottom", "style": "position:fixed"},
  "nope", {"mxc": "\#(mxc)"}, {"mxc": "\#(mxc)"}, {"mxc": "\#(mxc)"}, {"mxc": "\#(mxc)"}
 ], "name": "\#(String(repeating: "x", count: 500))", "preset": "gold"}
"""#)) {
    check(frame.layers.count == 4, "at most four frame layers")
    check(frame.layers[0] == .init(mxc: mxc, order: "front", anchor: "fill"), "unknown order / anchor fall back")
    check(frame.layers[1] == .init(mxc: mxc, order: "back", anchor: "bottom"), "known order / anchor kept")
    check(frame.name?.count == 48, "frame name cut")
    check(frame.preset == nil, "layers win over a preset")
} else {
    check(false, "frame with valid layers")
}
if let frame = DiddyProfileFrame(json(#"{"layers": [{"mxc": "\#(mxc)", "anchor": "top"}], "innerWidth": 1e9, "overflowTop": -50, "overflowBottom": 1e400, "overflowHorizontal": "56"}"#)) {
    check(frame.geometry == .init(innerWidth: 2000, overflowTop: 0, overflowBottom: 0, overflowHorizontal: 0), "hostile geometry clamped: \(frame.geometry)")
} else {
    // 1e400 is not valid JSON for some parsers: test without it
    let fallback = DiddyProfileFrame(json(#"{"layers": [{"mxc": "\#(mxc)"}], "innerWidth": 1e9, "overflowTop": -50, "overflowHorizontal": "56"}"#))
    check(fallback?.geometry == .init(innerWidth: 2000, overflowTop: 0, overflowBottom: 0, overflowHorizontal: 0), "hostile geometry clamped")
}
let tiny = DiddyProfileFrame(json(#"{"layers": [{"mxc": "\#(mxc)"}], "innerWidth": 5, "overflowTop": 9999}"#))
check(tiny?.geometry.innerWidth == 300 && tiny?.geometry.overflowTop == 400, "tiny frame clamped")
let roses = DiddyProfileFrame.clampGeometry(["inner_width": 1200, "overflow_top": 211, "overflow_bottom": 186, "overflow_horizontal": 56])
check(roses == .init(innerWidth: 1200, overflowTop: 211, overflowBottom: 186, overflowHorizontal: 56), "snake_case of frame packs")
check(DiddyProfileFrame.factors(roses) == .init(top: 0.1758, bottom: 0.155, side: 0.0467), "factors like desktop")
check(abs(DiddyProfileFrame.cardWidth(available: 353 * (1 + 2 * 0.0467), geometry: roses) - 353) < 1e-9, "card width leaves room for the sides")
check(DiddyProfileFrame.cardWidth(available: 1000, preferred: 340, geometry: roses) == 340, "never wider than preferred")
check(DiddyProfileFrame(preset: "gold").resolved == .preset("gold", .init(overflowTop: 24, overflowBottom: 24, overflowHorizontal: 24)), "preset geometry")
check(DiddyProfileFrame(preset: "nope").resolved == nil, "unknown preset resolves to nothing")
check(Set(DiddyProfileFrame.presets) == Set(DiddyProfileFrame.presetGeometry.keys), "every preset has a geometry")

// MARK: picture sniffing

check(DiddyImageSniff.mimeType(of: Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] + [UInt8](repeating: 0, count: 8))) == "image/png", "PNG")
check(DiddyImageSniff.mimeType(of: Data(Array("GIF89a".utf8) + [UInt8](repeating: 0, count: 10))) == "image/gif", "GIF")
check(DiddyImageSniff.mimeType(of: Data(Array("RIFF".utf8) + [0, 0, 0, 0] + Array("WEBPVP8 ".utf8))) == "image/webp", "WebP")
check(DiddyImageSniff.mimeType(of: Data(Array("<svg onload=alert(1)>".utf8))) == nil, "SVG refused")
check(DiddyImageSniff.mimeType(of: Data([0x89, 0x50])) == nil, "too short")

if failures > 0 {
    print("\(failures) check(s) failed")
    exit(1)
}
print("profile decor checks passed")
