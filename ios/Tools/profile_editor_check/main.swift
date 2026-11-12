// Checks for Diddy/Matrix/DiddyProfileDraft.swift: the iOS profile editor reads your profile with
// desktop's whitelists, writes the same keys and values as desktop's editor (mergeDraft in
// profilePreview.ts), keeps everything it did not change, and measures the size like desktop.
// Foundation only. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/DiddyJSONSize.swift Diddy/Matrix/DiddyProfileDecor.swift Diddy/Matrix/DiddyProfileDraft.swift Tools/profile_editor_check/main.swift -o /tmp/profile_editor_check && /tmp/profile_editor_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
/// Content as it arrives from the server: parsed by JSONSerialization like in the app.
func object(_ text: String) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
}
/// Sorted JSON of a value, to compare written content.
func text(_ value: Any?) -> String {
    let wrapped: [String: Any] = ["v": value ?? NSNull()]
    guard let data = try? JSONSerialization.data(withJSONObject: wrapped, options: [.sortedKeys, .withoutEscapingSlashes]) else { return "?" }
    return String(decoding: data, as: UTF8.self)
}
func same(_ a: Any?, _ b: Any?) -> Bool { text(a) == text(b) }
/// A JSON object literal with mixed value types.
func d(_ value: [String: Any]) -> [String: Any] { value }

let banner = "mxc://matrix.tllx.eu/Banner0123"
let plate = "mxc://matrix.tllx.eu/Plate0123"
let video = "mxc://matrix.tllx.eu/Video0123"

// A profile as desktop writes it, plus things this app does not know.
let stored = object("""
{"v":1,
 "nameStyle":{"font":"serif","color":"#ABC","gradient":{"from":"#112233","to":"#445566","angle":45},"effect":"glow","bold":true,"italic":false,"future":1},
 "card":{"from":"#101010","to":"#202020","angle":200,"accent":"#7aa2f7","bannerMxc":"\(banner)","bannerPos":{"x":30,"y":70,"zoom":1.5},"later":"x"},
 "nameplate":{"preset":"aurora","flow":true,"imageMxc":"\(plate)","videoMxc":"\(video)","imagePos":{"x":10,"y":20,"zoom":2},"fit":"full","color":"#ff0000"},
 "effect":{"layers":[{"mxc":"mxc://a.b/L1","start":0,"duration":0,"loop":false,"loopDelay":0,"x":0,"y":0,"w":450,"h":880,"z":0}],"name":"Mine","stillMxc":"mxc://a.b/S"},
 "frame":{"preset":"neon"},
 "status":"dnd",
 "shownBadges":["g.star","custom.1","g.fire"],
 "bio":"Hello\\nthere",
 "about":{"pronouns":"she/her","age":"123456789","unknown":"x"},
 "interests":["Music"," Films ","Music","a\\u0007b"],
 "links":[{"kind":"github","url":"https://github.com/me"},{"kind":"github","url":"https://evil.example/x"},{"kind":"web","url":"http://insecure.example"}],
 "activity":{"kind":"game","text":"Legacy","detail":"PIXY"},
 "cardLayout":{"layout":"expanded","hidden":["links","nope"],"order":["bio","about"],"theme":"dark","glass":true,"calm":1,"big":{"banner":"hero","x":1}},
 "clientVersion":"1.5.4",
 "animatedAvatarMxc":"mxc://a.b/old",
 "somethingNew":{"a":1}}
""")

// MARK: Reading, with desktop's whitelists

let draft = DiddyProfileDraft(raw: stored)
check(draft.nameFont == "serif", "font read")
check(draft.nameColor == "#aabbcc", "#ABC normalised to #aabbcc")
check(draft.nameGradient == DiddyProfileDraft.Gradient(from: "#112233", to: "#445566", angle: 45), "gradient read")
check(draft.nameEffect == "glow" && draft.nameBold && !draft.nameItalic, "effect, bold, italic read")
check(draft.cardFrom == "#101010" && draft.cardTo == "#202020" && draft.cardAngle == 200 && draft.cardAccent == "#7aa2f7", "card colours read")
check(draft.bannerMxc == banner && draft.bannerPos == DiddyImagePos(x: 30, y: 70, zoom: 1.5), "banner and position read")
check(draft.platePreset == "aurora" && draft.plateFlow && draft.plateFullRow && draft.plateColor == "#ff0000", "nameplate read")
check(draft.plateImageMxc == plate && draft.plateVideoMxc == video && draft.plateImagePos == DiddyImagePos(x: 10, y: 20, zoom: 2), "nameplate media read")
check(draft.effect == .custom, "uploaded effect is kept as custom")
check(draft.frame == .preset("neon"), "frame preset read")
check(draft.status == "dnd", "status read")
check(draft.shownBadges == ["g.star", "custom.1", "g.fire"], "shown badges read")
check(draft.bio == "Hello\nthere", "bio keeps its line break")
check(draft.about == ["pronouns": "she/her", "age": "12345678"], "about whitelisted, age cut to 8")
check(draft.interests == ["Music", "Films", "a b"], "interests trimmed, deduplicated, control characters replaced")
check(draft.links == ["https://github.com/me"], "only safe links that fit their kind")
check(draft.activityKind == "game" && draft.activityText == "Legacy" && draft.activityDetail == "PIXY", "activity read")
check(draft.layout == "expanded" && draft.hiddenModules == ["links"] && draft.moduleOrderSetting == ["bio", "about"], "layout read")
check(draft.cardTheme == "dark" && draft.glass && !draft.calm, "calm: 1 is no boolean")
check(draft.bigBanner == "hero", "big banner read")
check(draft.bigLayout == "expanded" && draft.bigAvatar == "large", "big defaults")

let empty = DiddyProfileDraft(raw: [:])
check(empty == DiddyProfileDraft(), "an empty profile is the default draft")
check(DiddyProfileDraft(raw: object(#"{"v":1,"nameStyle":{"bold":1,"font":"comic"},"status":"away","effect":{"preset":"nope"}}"#)) == DiddyProfileDraft(),
      "unknown values are dropped")

// MARK: Nothing changed: nothing is rewritten

check(draft.changedParts(from: draft).isEmpty, "no changes")
let unchanged = draft.apply(to: stored, since: draft)
check(same(unchanged, stored), "an unchanged draft writes the stored profile unchanged")

// The stored parts the draft reads are equal to what it would write, so loading never shows a change.
let reloaded = DiddyProfileDraft(raw: draft.apply(to: stored, since: DiddyProfileDraft()))
check(reloaded == draft, "writing everything and reading it back gives the same draft")

// MARK: Changing one part keeps the rest

var edited = draft
edited.nameColor = "#00ff00"
check(edited.changedParts(from: draft) == [.nameStyle], "only the name style changed")
var written = edited.apply(to: stored, since: draft)
let style = written["nameStyle"] as? [String: Any] ?? [:]
check(style["color"] as? String == "#00ff00", "new colour written")
check(style["font"] as? String == "serif" && style["effect"] as? String == "glow" && style["bold"] as? Bool == true, "rest of the style kept")
check(style["italic"] == nil, "italic false is left out (desktop readers treat it the same)")
check(style["future"] as? Int == 1, "unknown key inside the name style kept")
check(same(style["gradient"], d(["from": "#112233", "to": "#445566", "angle": 45])), "gradient written like desktop")
check(same(written["links"], stored["links"]), "links not rewritten (the bad ones stay as stored, readers drop them)")
check(same(written["somethingNew"], stored["somethingNew"]) && written["clientVersion"] as? String == "1.5.4"
      && written["animatedAvatarMxc"] as? String == "mxc://a.b/old", "keys this app does not know are kept")
check(written["v"] as? Int == 1, "v is 1")

// Gradient on / off like desktop.
var gradientDraft = DiddyProfileDraft()
gradientDraft.nameColor = "#123456"
gradientDraft.setNameGradient(true)
check(gradientDraft.nameGradient == DiddyProfileDraft.Gradient(from: "#123456", to: "#c084fc", angle: 90), "new gradient starts from the colour")
written = gradientDraft.apply(to: ["v": 1], since: DiddyProfileDraft())
check(same(written["nameStyle"], d(["color": "#123456", "gradient": d(["from": "#123456", "to": "#c084fc", "angle": 90])])),
      "gradient keeps the colour like desktop")
gradientDraft.setNameGradient(false)
check(gradientDraft.nameGradient == nil, "solid removes the gradient")
var fractional = DiddyProfileDraft()
fractional.nameGradient = DiddyProfileDraft.Gradient(from: "#000000", to: "#ffffff", angle: 45.5)
check(same((fractional.value(of: .nameStyle, old: nil) as? [String: Any])?["gradient"], d(["from": "#000000", "to": "#ffffff", "angle": 45.5])),
      "a fractional angle stays a number")

// Card: clearing the header removes colours and angle, banner position only with a banner.
var card = draft
card.cardFrom = nil
card.cardTo = nil
card.bannerMxc = nil
written = card.apply(to: stored, since: draft)
let cardValue = written["card"] as? [String: Any] ?? [:]
check(cardValue["from"] == nil && cardValue["to"] == nil && cardValue["angle"] == nil, "header cleared with its angle")
check(cardValue["bannerMxc"] == nil && cardValue["bannerPos"] == nil, "banner and its position removed")
check(cardValue["accent"] as? String == "#7aa2f7" && cardValue["later"] as? String == "x", "accent and unknown key kept")
var noCard = DiddyProfileDraft()
noCard.cardAccent = "#ffffff"
noCard.cardAccent = nil
check(noCard.value(of: .card, old: nil) == nil, "an empty card is removed")

// Nameplate: flow only with a preset, position only with media, fade is the default.
var nameplate = DiddyProfileDraft()
nameplate.plateFlow = true
nameplate.plateImagePos = DiddyImagePos(x: 1, y: 2, zoom: 1)
nameplate.plateColor = "#336699"
check(same(nameplate.value(of: .nameplate, old: nil), ["color": "#336699"]), "no flow without preset, no position without media")
nameplate.platePreset = "sunset"
nameplate.plateImageMxc = plate
nameplate.plateFullRow = true
check(same(nameplate.value(of: .nameplate, old: nil),
           d(["color": "#336699", "preset": "sunset", "flow": true, "imageMxc": plate, "imagePos": ["x": 1, "y": 2, "zoom": 1], "fit": "full"])),
      "nameplate written like desktop")
check(DiddyProfileDraft().value(of: .nameplate, old: nil) == nil, "no nameplate when nothing is set")

// Effect and frame.
var effect = draft
effect.effect = .preset("snow")
written = effect.apply(to: stored, since: draft)
check(same(written["effect"], ["preset": "snow"]), "a preset replaces an uploaded effect")
effect.effect = .none
written = effect.apply(to: stored, since: draft)
check(written["effect"] == nil, "none removes the effect")
effect.effect = .custom
check(effect.changedParts(from: draft).isEmpty, "back to the own effect: unchanged")
check(same(effect.apply(to: stored, since: draft)["effect"], stored["effect"]), "own effect kept as stored")
var frame = draft
frame.frame = .preset("vines")
check(same(frame.apply(to: stored, since: draft)["frame"], ["preset": "vines"]), "frame preset written")
check(DiddyProfileRules.effectPresetIds == DiddyProfileEffect.presets, "effect presets match the display side")
check(DiddyProfileRules.framePresetIds == DiddyProfileFrame.presets, "frame presets match the display side")

// Texts.
var texts = DiddyProfileDraft()
texts.bio = String(repeating: "x", count: 170) + "  "
check((texts.value(of: .bio, old: nil) as? String)?.count == 160, "bio cut to 160 and trimmed")
texts.bio = "   "
check(texts.value(of: .bio, old: nil) == nil, "empty bio removed")
texts.about = ["pronouns": " he/him ", "work": "", "age": "1234567890"]
check(same(texts.value(of: .about, old: nil), ["pronouns": "he/him", "age": "12345678"]), "facts trimmed and cut, empty ones left out")
texts.activityKind = "music"
texts.activityText = "  "
check(texts.value(of: .activity, old: nil) == nil, "activity without text is not written")
texts.activityText = "Song"
check(same(texts.value(of: .activity, old: nil), ["kind": "music", "text": "Song"]), "activity without detail")
texts.activityKind = "none"
check(texts.value(of: .activity, old: nil) == nil, "no activity")

// Interests typed with commas.
check(DiddyProfileRules.interests(from: " a, b ,, a ,c") == ["a", "b", "c"], "interests split at commas")
check(DiddyProfileRules.interests(from: (1...20).map { "i\($0)" }.joined(separator: ",")).count == 12, "at most 12 interests")
check(DiddyProfileRules.interests(from: String(repeating: "y", count: 40)) == [String(repeating: "y", count: 24)], "interest cut to 24")

// Links: kind from the address, only valid https ones.
check(DiddyProfileRules.guessLinkKind("https://www.github.com/me") == "github", "github subdomain")
check(DiddyProfileRules.guessLinkKind("https://youtu.be/x") == "youtube", "youtu.be")
check(DiddyProfileRules.guessLinkKind("https://example.org") == "web", "own website")
check(DiddyProfileRules.guessLinkKind("https://notgithub.com/x") == "web", "notgithub.com is no GitHub")
check(DiddyProfileRules.safeLink(kind: "web", "https://user:pw@example.org") == nil, "credentials refused")
check(DiddyProfileRules.safeLink(kind: "web", "http://example.org") == nil, "http refused")
check(DiddyProfileRules.safeLink(kind: "web", "https://localhost/x") == nil, "host without dot refused")
check(DiddyProfileRules.safeLink(kind: "github", "https://gitlab.com/x") == nil, "host must fit the kind")
check(DiddyProfileRules.safeLink(kind: "web", "https://example.org/" + String(repeating: "a", count: 200)) == nil, "too long refused")
var links = DiddyProfileDraft()
links.links = ["https://github.com/me", "", "https://example.org", "https://github.com/me"]
check(links.problems.isEmpty, "empty rows are no problem")
check(same(links.value(of: .links, old: nil), [["kind": "github", "url": "https://github.com/me"], ["kind": "web", "url": "https://example.org"]]),
      "links written with their kind, empty and double ones left out")
links.links.append("http://bad.example")
check(links.problems.count == 1, "an invalid link blocks saving")
links.links = [""]
check(links.value(of: .links, old: nil) == nil && links.changedParts(from: DiddyProfileDraft()).isEmpty, "only an empty row: nothing changed")

// Layout and modules.
var layout = DiddyProfileDraft()
check(layout.moduleOrder == ["bio", "about", "links", "sharedRooms"], "standard modules")
layout.moveModule(at: 0, by: 1)
check(layout.moduleOrderSetting == ["about", "bio", "links", "sharedRooms"], "move stores the whole order")
layout.moveModule(at: 0, by: -1)
check(layout.moduleOrderSetting == ["about", "bio", "links", "sharedRooms"], "moving out of range does nothing")
layout.setModule("links", visible: false)
layout.setModule("links", visible: false)
check(layout.hiddenModules == ["links"], "hidden once")
layout.layout = "compact"
check(layout.moduleOrder == ["bio"], "compact shows only the bio")
layout.bigBanner = "hero"
check(same(layout.value(of: .cardLayout, old: d(["glass": true, "keep": 1])),
           d(["layout": "compact", "hidden": ["links"], "order": ["about", "bio", "links", "sharedRooms"], "big": ["banner": "hero"], "keep": 1])),
      "card layout written, defaults left out, glass switched off, unknown key kept")
layout.setModule("links", visible: true)
check(layout.hiddenModules.isEmpty, "shown again")

// Badges: at most 4, only owned ones, new ones last.
var badges = DiddyProfileDraft(raw: stored)
let owned: Set<String> = ["g.star", "g.fire", "g.crown", "g.dev", "g.og"]
check(badges.shownBadgeIds(owned: owned) == ["g.star", "g.fire"], "shown badges you do not own are not shown")
badges.toggleBadge("g.crown", owned: owned)
check(badges.shownBadges == ["g.star", "g.fire", "g.crown"], "badge added last, unowned one dropped like desktop")
badges.toggleBadge("g.dev", owned: owned)
badges.toggleBadge("g.og", owned: owned)
check(badges.shownBadges.count == 4 && !badges.shownBadges.contains("g.og"), "at most 4")
badges.toggleBadge("g.star", owned: owned)
check(badges.shownBadges == ["g.fire", "g.crown", "g.dev"], "badge removed")
badges.toggleBadge("custom.2", owned: owned)
check(badges.shownBadges == ["g.fire", "g.crown", "g.dev"], "a badge you do not own cannot be shown")
check(badges.changedParts(from: draft) == [.shownBadges], "only the badges changed")

// Status: online is the default and equal to no status.
var status = DiddyProfileDraft()
check(status.changedParts(from: DiddyProfileDraft(raw: ["v": 1])).isEmpty, "no status reads as online")
status.status = "idle"
check(status.apply(to: ["v": 1], since: DiddyProfileDraft())["status"] as? String == "idle", "status written")

// MARK: Size, measured like desktop (JSON.stringify(...).length with the message-mode key)

let key = "@someone:matrix.tllx.eu"
let small: [String: Any] = ["v": 1, "bio": "hi"]
let expected = #"{"v":1,"bio":"hi","app.diddy.key":"@someone:matrix.tllx.eu"}"#.utf16.count
check(DiddyProfileDraft.encodedSize(small, key: key) == expected, "size includes the key field")
let slashes: [String: Any] = ["v": 1, "card": ["bannerMxc": banner]]
let slashSize = DiddyProfileDraft.encodedSize(slashes, key: key) ?? 0
check(slashSize == #"{"v":1,"card":{"bannerMxc":"mxc://matrix.tllx.eu/Banner0123"},"app.diddy.key":"@someone:matrix.tllx.eu"}"#.utf16.count,
      "slashes are not escaped")
check(DiddyProfileDraft.encodedSize(["v": 1, "bio": "ä😀"], key: "k") == #"{"v":1,"bio":"ä😀","app.diddy.key":"k"}"#.utf16.count,
      "UTF-16 units like JavaScript")
let big: [String: Any] = ["v": 1, "bio": String(repeating: "x", count: 5000)]
check((DiddyProfileDraft.encodedSize(big, key: key) ?? 0) > DiddyProfileRules.maxContentBytes, "a too large profile is detected")
check(DiddyProfileDraft.encodedSize(["v": Double.nan], key: key) == nil, "no JSON: nil instead of a crash")

// Numbers count as JavaScript prints them (`JSON.stringify`), never with the 17 digits Apple's
// JSONSerialization may write: a big profile with picture positions would count as too large.
// Expected values from Node.
let jsNumbers: [(Double, String)] = [
    (37.3, "37.3"), (1.15, "1.15"), (5, "5"), (100, "100"), (0.5, "0.5"), (0.05, "0.05"), (1e-6, "0.000001"), (1e-7, "1e-7"),
    (1.2345e20, "123450000000000000000"), (1e21, "1e+21"), (123456789012345680000, "123456789012345680000"), (-2.5, "-2.5"),
    (1_700_000_000_123, "1700000000123"), (33.333333333333336, "33.333333333333336"), (0.1 + 0.2, "0.30000000000000004"),
    (9007199254740993, "9007199254740992"), (-0.0, "0"), (1e16, "10000000000000000"),
]
for (value, expected) in jsNumbers {
    check(DiddyJSONSize.javaScriptNumber(value) == expected, "JS number \(value): \(DiddyJSONSize.javaScriptNumber(value) ?? "nil") != \(expected)")
}
check(DiddyJSONSize.javaScriptNumber(.infinity) == nil && DiddyJSONSize.javaScriptNumber(.nan) == nil, "no JSON numbers")
let positioned: [String: Any] = [
    "v": 1,
    "card": ["bannerMxc": "mxc://matrix.tllx.eu/Banner0123", "bannerPos": ["x": 37.3, "y": 62.7, "zoom": 1.15]],
    "nameplate": ["preset": "aurora", "flow": true, "imagePos": ["x": 12.1, "y": 0, "zoom": 2.35]],
    "bio": "Grüße 😀 \"zitat\" \\ a\nb\u{1}",
    "links": [Any](), "interests": ["a", "b"], "status": NSNull(),
]
check(DiddyJSONSize.length(positioned) == 278, "length like JSON.stringify: \(DiddyJSONSize.length(positioned) ?? -1)")
// (parsed booleans are only told apart from numbers on Apple platforms, so none here)
let parsedJSON = #"{"v":1,"card":{"bannerPos":{"x":37.3,"y":62.7,"zoom":1.15}},"nameplate":{"imagePos":{"x":0.05,"y":100,"zoom":2.35}}}"#
let parsedPositioned = (try? JSONSerialization.jsonObject(with: Data(parsedJSON.utf8))) as? [String: Any] ?? [:]
check(DiddyJSONSize.length(parsedPositioned) == parsedJSON.utf16.count,
      "parsed JSON keeps its length: \(DiddyJSONSize.length(parsedPositioned) ?? -1)")
check(DiddyJSONSize.length(["d": Date()]) == nil, "other types are no JSON")

// MARK: Media

check(DiddyMediaRules.imageType(of: Data("GIF89a....".utf8))?.mimeType == "image/gif", "GIF")
check(DiddyMediaRules.imageType(of: Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]))?.mimeType == "image/png", "PNG")
check(DiddyMediaRules.imageType(of: Data([0xFF, 0xD8, 0xFF, 0xE0]))?.mimeType == "image/jpeg", "JPEG")
check(DiddyMediaRules.imageType(of: Data("RIFF\u{0}\u{0}\u{0}\u{0}WEBPVP8 ".utf8))?.mimeType == "image/webp", "WebP")
check(DiddyMediaRules.imageType(of: Data("....ftypheic".utf8)) == nil, "HEIC is converted")
check(DiddyMediaRules.imageType(of: Data()) == nil, "empty")

// MARK: Values

check(DiddyProfileRules.color("#FFF") == "#ffffff" && DiddyProfileRules.color(" #12345678 ") == "#12345678", "colours normalised")
let badColors: [Any] = ["red", "#12", "#1234", "#ggg", "#1234567", 5, true]
for bad in badColors {
    check(DiddyProfileRules.color(bad) == nil, "no colour: \(bad)")
}
check(DiddyProfileRules.angle(400, fallback: 90) == 360 && DiddyProfileRules.angle(-5, fallback: 90) == 0, "angle clamped")
check(DiddyProfileRules.angle(true, fallback: 90) == 90 && DiddyProfileRules.angle("45", fallback: 90) == 90, "angle must be a number")
check(DiddyProfileRules.bool(object(#"{"a":true}"#)["a"]) == true && DiddyProfileRules.bool(object(#"{"a":1}"#)["a"]) == nil, "JSON booleans only")
check(DiddyProfileRules.limit("😀😀😀", 2) == "😀😀", "limit counts code points")
check(same(DiddyProfileRules.jsonNumber(90), 90) && same(DiddyProfileRules.jsonNumber(1.25), 1.25), "whole numbers as integers")

if failures == 0 { print("ALL OK") } else { print("\(failures) FAILED"); exit(1) }
