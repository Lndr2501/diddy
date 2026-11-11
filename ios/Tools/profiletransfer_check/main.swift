// Checks for Diddy/Matrix/DiddyProfileTransfer.swift: the profile file (export / import, desktop's
// profileTransfer.ts and its tests), "Reset to default" and the Diddy version in the profile
// (clientVersion.ts). Foundation only. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/DiddyProfileDecor.swift Diddy/Matrix/DiddyProfileDraft.swift Diddy/Matrix/DiddyProfileTransfer.swift Tools/profiletransfer_check/main.swift -o /tmp/profiletransfer_check && /tmp/profiletransfer_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
func text(_ value: Any?) -> String {
    let wrapped: [String: Any] = ["v": value ?? NSNull()]
    guard let data = try? JSONSerialization.data(withJSONObject: wrapped, options: [.sortedKeys, .withoutEscapingSlashes]) else { return "?" }
    return String(decoding: data, as: UTF8.self)
}
func object(_ json: String) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]
}
typealias T = DiddyProfileTransfer

func imported(_ result: T.ImportResult) -> DiddyProfileDraft? {
    if case .imported(let draft) = result { return draft }
    return nil
}
func failure(_ result: T.ImportResult) -> String? {
    if case .failed(let message) = result { return message }
    return nil
}

var draft = DiddyProfileDraft()
draft.nameFont = "serif"; draft.nameBold = true; draft.nameColor = "#aabbcc"
draft.cardFrom = "#112233"; draft.cardTo = "#445566"; draft.cardAccent = "#778899"
draft.platePreset = "aurora"; draft.plateFlow = true
draft.effect = .preset("sparkles"); draft.frame = .preset("gold")
draft.bio = "Hello there"; draft.about["pronouns"] = "she/her"; draft.interests = ["Music", "Films"]
draft.links = ["https://github.com/luis"]; draft.activityKind = "music"; draft.activityText = "Lo-fi"
draft.layout = "expanded"; draft.glass = true
draft.status = "dnd"; draft.shownBadges = ["g.star"]

// The file
let file = T.export(draft, stored: [:])
let parsed = object(file)
check(parsed["kind"] as? String == "diddy-profile-customization" && parsed["v"] as? Int == 1, "wrapper")
let profile = parsed["profile"] as? [String: Any] ?? [:]
check(Set(profile.keys) == ["v", "nameStyle", "card", "nameplate", "effect", "frame", "bio", "about", "interests", "links", "activity", "cardLayout"],
      "carried parts: \(profile.keys.sorted())")
check(profile["status"] == nil && profile["shownBadges"] == nil && profile["clientVersion"] == nil, "no status, badges or version in the file")
check(text(profile["nameStyle"]) == #"{"v":{"bold":true,"color":"#aabbcc","font":"serif"}}"#, "name style: \(text(profile["nameStyle"]))")
check(text(profile["effect"]) == #"{"v":{"preset":"sparkles"}}"#, "preset effect")
check(file.contains("\n  "), "the file is indented like desktop's")
check(!file.contains("\\/"), "slashes are not escaped")

// Importing it again
switch T.importProfile(file) {
case .failed(let message): check(false, "round trip failed: \(message)")
case .imported(let back):
    check(Set(back.changedParts(from: draft)) == [.status, .shownBadges], "only status and badges differ: \(back.changedParts(from: draft))")
    check(back.status == "online" && back.shownBadges.isEmpty, "status and badges are not imported")
    check(back.nameFont == "serif" && back.nameBold && back.nameColor == "#aabbcc" && back.bio == "Hello there", "values")
}
let bare = imported(T.importProfile(#"{"v":1,"bio":"Hello"}"#))
check(bare?.bio == "Hello", "a bare profile object works")

// Refusals
check(failure(T.importProfile("this is not json")) == "This is not a Diddy profile file (not valid JSON).", "not json")
check(failure(T.importProfile(#"{"v":2,"bio":"x"}"#)) == "This is not a Diddy profile file.", "other version")
check(failure(T.importProfile("[1,2]")) == "This is not a Diddy profile file.", "an array")
check(failure(T.importProfile("42")) == "This is not a Diddy profile file.", "a number")
check(failure(T.importProfile(#"{"v":true,"bio":"x"}"#)) == "This is not a Diddy profile file.", "true is not version 1")
check(failure(T.importProfile(#"{"kind":"diddy-profile-customization","v":1}"#)) == "This is not a Diddy profile file.", "wrapper without a profile")
check(failure(T.importProfile(#"{"kind":"diddy-profile-customization","v":1,"profile":{"v":1}}"#)) == "The file contains no profile settings.", "empty profile")
check(failure(T.importProfile(#"{"v":1,"status":"dnd","shownBadges":["g.star"],"clientVersion":"1.6.0"}"#)) == "The file contains no profile settings.", "status, badges and version do not count")
check(failure(T.importProfile(String(repeating: "a", count: T.maxFileBytes + 1))) == "This file is too big to be a Diddy profile.", "too big")

// Hostile values are dropped like for every profile
let hostile = imported(T.importProfile(#"{"v":1,"bio":"ok","nameStyle":{"color":"red","font":"comic"},"links":[{"kind":"web","url":"http://insecure.example"}],"nameplate":{"imageMxc":"https://evil.example/a.png"}}"#))
check(hostile?.bio == "ok" && hostile?.nameColor == nil && hostile?.nameFont == "default", "bad colour and font")
check(hostile?.links.isEmpty == true && hostile?.plateImageMxc == nil, "bad link and picture")

// An own effect travels with its pictures
let ownEffect = imported(T.importProfile(#"{"v":1,"effect":{"layers":[{"mxc":"mxc://h/AAA","start":5,"duration":0,"w":300}],"stillMxc":"mxc://h/SSS","name":"Mine"}}"#))
check(ownEffect != nil, "an own effect is a setting")
if let ownEffect {
    check(text(ownEffect.value(of: .effect, old: nil)) == #"{"v":{"layers":[{"duration":0,"h":880,"loop":true,"loopDelay":0,"mxc":"mxc://h/AAA","start":5,"w":300,"x":0,"y":0,"z":0}],"name":"Mine","stillMxc":"mxc://h/SSS"}}"#,
          "own effect value: \(text(ownEffect.value(of: .effect, old: nil)))")
    check(DiddyProfileEffect(ownEffect.value(of: .effect, old: nil))?.layers.count == 1, "readers accept it")
    check(DiddyProfileRules.ownName(ownEffect.effect) == "Mine", "its name")
}
let ownFrame = imported(T.importProfile(#"{"v":1,"frame":{"inner_width":1000,"overflowTop":20,"layers":[{"mxc":"mxc://h/F1","order":"back","anchor":"center"}],"name":"Gold"}}"#))
check(text(ownFrame?.value(of: .frame, old: nil)) == #"{"v":{"innerWidth":1000,"layers":[{"anchor":"center","mxc":"mxc://h/F1","order":"back"}],"name":"Gold","overflowBottom":0,"overflowHorizontal":0,"overflowTop":20}}"#,
      "own frame value: \(text(ownFrame?.value(of: .frame, old: nil)))")
let tooMany = imported(T.importProfile(#"{"v":1,"effect":{"preset":"sparkles","layers":[{"mxc":"not-an-mxc"}]}}"#))
check(tooMany?.effect == .preset("sparkles"), "layers without a valid picture fall back to the preset")

// Exporting a stored own effect keeps it
let storedEffect = object(#"{"layers":[{"mxc":"mxc://h/AAA","start":0,"duration":0,"loop":true,"loopDelay":0,"x":0,"y":0,"w":450,"h":880,"z":0}],"name":"Kept"}"#)
let stored: [String: Any] = ["v": 1, "effect": storedEffect, "bio": "x"]
let storedDraft = DiddyProfileDraft(raw: stored)
check(storedDraft.effect == .custom, "a stored own effect is kept as it is")
let exportedKept = object(T.export(storedDraft, stored: stored))
check(text((exportedKept["profile"] as? [String: Any])?["effect"]) == text(storedEffect), "the file carries the stored own effect")
var withOwn = DiddyProfileDraft()
withOwn.effect = DiddyProfileRules.ownChoice(storedEffect) ?? .none
check(withOwn.effect != .none && DiddyProfileRules.ownName(withOwn.effect) == "Kept", "imported choice")
let exportedOwn = object(T.export(withOwn, stored: [:]))
let ownProfile = exportedOwn["profile"] as? [String: Any]
check(text(ownProfile?["effect"]) == text(storedEffect), "the file carries an imported effect")
check(DiddyProfileRules.ownChoice(storedEffect) == DiddyProfileRules.ownChoice(storedEffect), "equal values are equal choices")

// Reset to default
check(!T.canReset(DiddyProfileDraft()), "nothing to reset")
check(T.canReset(draft), "something to reset")
let fresh = T.reset(draft)
check(fresh.shownBadges == ["g.star"] && fresh.status == "online", "badges stay, status online")
check(fresh.nameFont == "default" && fresh.bio.isEmpty && fresh.effect == .none && fresh.links.isEmpty && fresh.layout == "standard", "everything else is back to default")
check(Set(fresh.changedParts(from: draft)).isSuperset(of: [.nameStyle, .card, .nameplate, .effect, .frame, .bio, .about, .interests, .links, .activity, .cardLayout, .status]), "saving it removes the parts")
let resetWrite = fresh.apply(to: ["v": 1, "bio": "old", "nameStyle": ["color": "#ffffff"], "clientVersion": "1.5.0", "unknownKey": 5], since: draft)
check(resetWrite["bio"] == nil && resetWrite["nameStyle"] == nil && resetWrite["unknownKey"] as? Int == 5 && resetWrite["clientVersion"] as? String == "1.5.0", "removed parts are gone, the rest stays")

// The Diddy version
let base: [String: Any] = ["v": 1, "bio": "x", "clientVersion": "1.5.0"]
check(T.stampVersion(base, version: "1.6.0", share: true)["clientVersion"] as? String == "1.6.0", "version shared")
check(T.stampVersion(base, version: "1.6.0", share: false)["clientVersion"] == nil, "version switched off is removed")
check(T.stampVersion(base, version: "v1.6", share: true)["clientVersion"] == nil, "an unsafe version is left out")
check(T.stampVersion(base, version: nil, share: true)["clientVersion"] == nil, "no version")
check(T.stampVersion(base, version: "1.6.0-beta.1", share: true)["clientVersion"] as? String == "1.6.0-beta.1", "beta version")
check(T.stampVersion(base, version: "1.6.0", share: true)["bio"] as? String == "x", "the rest stays")
check(DiddySanitize.version("1.6.0") != nil, "the marketing version of the app is a safe version")

if failures == 0 { print("profiletransfer_check: all checks passed") } else { print("profiletransfer_check: \(failures) failure(s)"); exit(1) }
