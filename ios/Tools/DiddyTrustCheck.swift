// Checks Diddy/Matrix/DiddyTrust.swift against the vectors of cinny/tests/trust.test.cjs.
// Run on a Mac (from ios/), the check must be the main file of its module:
//   d=$(mktemp -d) && cp Tools/DiddyTrustCheck.swift $d/main.swift && swiftc -o $d/check Diddy/Matrix/DiddyTrust.swift $d/main.swift && $d/check
import Foundation

var failures = 0
func check(_ ok: Bool, _ what: String, line: Int = #line) {
    if !ok { failures += 1; print("FAIL line \(line): \(what)") }
}

let alice = "@alice:example.org", bob = "@bob:example.org", mallory = "@mallory:example.org"
func award(_ sender: String, _ ts: Int64, at: Int64? = nil) -> DiddyCandidate {
    DiddyCandidate(content: ["by": sender, "at": NSNumber(value: at ?? ts)], ts: ts, sender: sender)
}
func revoke(_ sender: String, _ ts: Int64) -> DiddyCandidate { DiddyCandidate(content: [:], ts: ts, sender: sender) }
func def(_ sender: String, _ ts: Int64, _ name: String = "Badge") -> DiddyCandidate {
    DiddyCandidate(content: ["name": name, "createdBy": sender], ts: ts, sender: sender)
}
func givers(_ recipient: String, _ list: [DiddyCandidate]) -> [String] {
    DiddyTrust.resolveAwards(recipient: recipient, list).map(\.by).sorted()
}

// owner tags, computed with the JavaScript implementation of trust.ts
check(DiddyTrust.ownerTag(alice) == "0w169j7w2jh", "tag alice")
check(DiddyTrust.ownerTag(bob) == "142l88jqz4a", "tag bob")
check(DiddyTrust.ownerTag("@ünï:matrix.tllx.eu") == "0d602esljm2", "tag non-ASCII")
check(DiddyTrust.ownerTag("@a:b") == "0ca73oxdt8c", "tag short")

// awards
check(givers(bob, [award(alice, 100), revoke(mallory, 200), award(mallory, 300)]) == [alice, mallory].sorted(), "outsider cannot remove")
check(givers(bob, [award(alice, 100), revoke(mallory, 200)]) == [alice], "outsider revoke does nothing")
check(givers(bob, [award(alice, 100), revoke(alice, 200)]).isEmpty, "giver removes")
check(givers(bob, [award(alice, 100), revoke(alice, 200), award(alice, 300)]).count == 1, "giver re-gives")
check(givers(bob, [award(alice, 100), revoke(bob, 200)]).isEmpty, "recipient removes")
check(givers(bob, [award(alice, 900, at: 100), revoke(bob, 200)]).isEmpty, "re-announce keeps old time")
check(givers(bob, [award(alice, 300, at: 300), revoke(bob, 200)]).count == 1, "new award after removal")
check(givers(bob, [award(bob, 100)]).count == 1, "self award")
// `at` may never be newer than the event: a future `at` cannot beat the recipient's removal
check(givers(bob, [award(alice, 300, at: 9_999_999), revoke(bob, 400)]).isEmpty, "future at is clamped")
check(DiddyTrust.awardTime(award(alice, 300, at: -5)) == 300, "negative at")
// same server time: removal beats award regardless of order
check(givers(bob, [award(alice, 100), revoke(alice, 100)]).isEmpty, "tie, removal wins")
check(givers(bob, [revoke(alice, 100), award(alice, 100)]).isEmpty, "tie, removal wins (order)")

// definitions
let always: (DiddyCandidate) -> Bool = { _ in true }
let id = "c.\(DiddyTrust.ownerTag(alice)).abc12"
check(DiddyTrust.badgeIdOwnerTag(id) == DiddyTrust.ownerTag(alice), "id tag")
check(DiddyTrust.badgeIdOwnerTag("c.lq3x8f2k9a1b") == nil, "old id has no tag")
check(DiddyTrust.pickDefinition(id: id, [def(mallory, 50, "Fake"), def(alice, 100, "Real")], isValid: always)?.sender == alice, "owner-bound")
check(DiddyTrust.pickDefinition(id: id, [def(mallory, 50, "Fake")], isValid: always) == nil, "only forger")
check(DiddyTrust.pickDefinition(id: id, [def(alice, 100, "v1"), def(alice, 900, "v2")], isValid: always)?.content["name"] as? String == "v2", "newest of owner")
check(DiddyTrust.pickDefinition(id: "c.lq3x8f2k9a1b", [def(mallory, 500), def(alice, 100)], isValid: always)?.sender == alice, "first writer")
let valid: (DiddyCandidate) -> Bool = { $0.content["name"] is String }
check(DiddyTrust.pickDefinition(id: id, [def(alice, 100), revoke(alice, 200)], isValid: valid) == nil, "deleted")
check(DiddyTrust.pickDefinition(id: id, [def(alice, 100), revoke(alice, 200), def(alice, 300, "Again")], isValid: valid)?.content["name"] as? String == "Again", "recreated")

// limits
let many = (0..<30).map { DiddyCandidate(content: [:], ts: Int64($0), sender: alice) }
let capped = DiddyTrust.capPerSender(many, sender: \.sender, ts: \.ts, max: 25)
check(capped.count == 25 && capped.map(\.ts).min() == 5, "per-sender cap keeps the newest")
let flood = (0..<2100).map { DiddyCandidate(content: [:], ts: Int64($0), sender: "@u\($0 % 5):x") }
let trimmed = DiddyTrust.trimMessages(flood, sender: \.sender, ts: \.ts)
check(trimmed.count <= 1500, "room trim (5 senders x 300)")
check(DiddyTrust.trimMessages(many, sender: \.sender, ts: \.ts).count == 30, "small rooms are untouched")

print(failures == 0 ? "OK" : "\(failures) failure(s)")
exit(failures == 0 ? 0 : 1)
