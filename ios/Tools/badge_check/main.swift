// Checks for Diddy/Matrix/DiddyBadgeLogic.swift: badge ids, event contents, validity, duplicates and
// who may delete, like desktop's BadgeEditor.tsx / profiles.ts / trust.ts. Foundation only. Run from
// the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/DiddyJSONSize.swift Diddy/Matrix/DiddyEvents.swift Diddy/Matrix/DiddyTrust.swift Diddy/Matrix/DiddyProfileDecor.swift Diddy/Matrix/DiddyProfileDraft.swift Diddy/Matrix/DiddyBadgeLogic.swift Tools/badge_check/main.swift -o /tmp/badge_check && /tmp/badge_check
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
typealias L = DiddyBadgeLogic

let alice = "@alice:example.org"
let bob = "@bob:example.org"

// Ids: the same as desktop's makeBadgeId (c.<tag>.<time base 36><random>)
let id = L.makeBadgeId(userId: alice, now: 1_700_000_000_000, random: "ab12")
check(id == "c.0w169j7w2jh.\(String(1_700_000_000_000, radix: 36))ab12", "badge id: \(id)")
check(id.hasPrefix("c.0w169j7w2jh.") && id.hasSuffix("ab12"), "badge id has the creator tag")
check(DiddyTrust.badgeIdOwnerTag(id) == DiddyTrust.ownerTag(alice), "only the creator's tag fits the id")
check(DiddyTrust.badgeIdOwnerTag(id) != DiddyTrust.ownerTag(bob), "another user's tag does not fit")
for _ in 0..<50 {
    let random = L.randomSuffix()
    check(random.count == 4 && random.allSatisfy { "0123456789abcdefghijklmnopqrstuvwxyz".contains($0) }, "random part: \(random)")
}
check(L.awardKey(badgeId: "c.x.y", userId: bob) == "c.x.y|@bob:example.org", "award key")
let parsed = DiddyTrust.parseAwardKey(L.awardKey(badgeId: id, userId: bob))
check(parsed?.badgeId == id && parsed?.userId == bob, "award key parses back")

// Contents
check(text(L.definitionContent(name: "Star", emoji: "⭐", imageMxc: nil, color: "#7aa2f7", createdBy: alice))
      == ##"{"v":{"color":"#7aa2f7","createdBy":"@alice:example.org","emoji":"⭐","name":"Star"}}"##, "definition with an emoji")
check(text(L.definitionContent(name: "Pic", emoji: "x", imageMxc: "mxc://example.org/abc", color: "#7aa2f7", createdBy: alice))
      == ##"{"v":{"color":"#7aa2f7","createdBy":"@alice:example.org","imageMxc":"mxc://example.org/abc","name":"Pic"}}"##, "an image replaces the emoji")
check(text(L.awardContent(by: alice, at: 1_700_000_000_123)) == #"{"v":{"at":1700000000123,"by":"@alice:example.org"}}"#, "award content")
let definition = L.definitionContent(name: "Star", emoji: "⭐", imageMxc: nil, color: "#7aa2f7", createdBy: alice)
check(DiddyEvents.jsonLength(definition) ?? 99999 < DiddyEvents.maxContentBytes, "a badge is small")
check(DiddyProfileRules.color("#7AA2F7") == "#7aa2f7", "the default colour is a valid colour")
check(L.defaultColor == "#7AA2F7", "default colour as on desktop")

// Valid badges
check(!L.emojiTooLong("⭐"), "one emoji")
check(!L.emojiTooLong("🏳️‍🌈"), "a flag sequence is 4 code points")
check(L.emojiTooLong("1234567"), "seven code points are too many")
check(!L.emojiTooLong("123456"), "six code points are fine")
check(!L.emojiTooLong("  ⭐  "), "spaces do not count")
check(L.canCreate(name: "Star", emoji: "⭐", hasImage: false, busy: false), "name and emoji")
check(L.canCreate(name: "Star", emoji: "", hasImage: true, busy: false), "name and image")
check(!L.canCreate(name: "  ", emoji: "⭐", hasImage: false, busy: false), "no name")
check(!L.canCreate(name: "Star", emoji: "", hasImage: false, busy: false), "no emoji or image")
check(!L.canCreate(name: "Star", emoji: "1234567", hasImage: false, busy: false), "emoji too long")
check(!L.canCreate(name: "Star", emoji: "⭐", hasImage: false, busy: true), "busy")

// Duplicates
let library = [
    DiddyBadge(id: "g.star", name: "Star", emoji: "⭐", imageMxc: nil, color: "#f0c060"),
    DiddyBadge(id: "c.a.b", name: "Pixel", emoji: "🟦", imageMxc: nil, color: "#1122aa", createdBy: alice),
]
check(L.duplicate(name: "star", emoji: "x", hasImage: false, color: "#000000", in: library)?.id == "g.star", "same name in any case")
check(L.duplicate(name: " STAR ", emoji: "", hasImage: true, color: "#000000", in: library)?.id == "g.star", "name is trimmed")
check(L.duplicate(name: "New", emoji: "🟦", hasImage: false, color: "#1122AA", in: library)?.id == "c.a.b", "same emoji and colour")
check(L.duplicate(name: "New", emoji: "🟦", hasImage: false, color: "#1122ab", in: library) == nil, "another colour is a new badge")
check(L.duplicate(name: "New", emoji: "🟦", hasImage: true, color: "#1122aa", in: library) == nil, "an image never matches by emoji")
check(L.duplicate(name: "", emoji: "", hasImage: false, color: "", in: library) == nil, "nothing typed")

// Deleting and showing
check(!L.canDelete(library[0], me: alice), "built-in badges cannot be deleted")
check(L.canDelete(library[1], me: alice), "the creator can delete")
check(!L.canDelete(library[1], me: bob), "somebody else cannot")
check(library[0].isGlobal && !library[1].isGlobal, "isGlobal")
check(L.filtered(library, query: " pix ").map { $0.id } == ["c.a.b"], "search")
check(L.filtered(library, query: "").count == 2, "empty search shows everything")
check(L.authorLabel(library[0], displayName: nil) == "Built-in", "built-in label")
check(L.authorLabel(library[1], displayName: "Alice") == "by Alice", "label with name")
check(L.authorLabel(library[1], displayName: nil) == "by alice", "label from the user id")
check(L.authorLabel(DiddyBadge(id: "x", name: "x", emoji: nil, imageMxc: nil, color: nil), displayName: nil) == "by unknown", "no creator")
check(L.summary(owned: 2, total: 41) == "Built-in and community badges. You own 2 of 41.", "summary")
check(L.maxShown == 4, "four badges are shown")

if failures == 0 { print("badge_check: all checks passed") } else { print("badge_check: \(failures) failure(s)"); exit(1) }
