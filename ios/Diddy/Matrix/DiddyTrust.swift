import Foundation

// The trust rules for Diddy badge data, `trust.ts` and the limits of `profiles.ts` on desktop.
// Pure Foundation code, so `ios/Tools/DiddyTrustCheck.swift` can test it on a Mac without the SDK.
//
// Matrix proves who SENT an event, nothing else. So every rule is built on the sender:
// - A custom badge id carries a tag of its creator's user id (`c.<tag>.<time><rand>`); only that
//   user can define it. Older ids without a tag fall back to "the first writer owns it".
// - An award is kept per giver. A giver's own empty event removes their award; so can the
//   recipient's. Nobody else can overwrite or remove somebody else's award.

/// One version of a key, from a state event or a message-mode event. `sender` is the
/// authenticated event sender, never a name written inside the content.
struct DiddyCandidate {
    let content: [String: Any]
    let ts: Int64
    let sender: String
}

enum DiddyTrust {
    static let maxCustomDefsPerSender = 25
    static let maxAwardsPerSender = 200
    static let maxCustomDefs = 300
    static let maxMessagesPerRoom = 2000
    static let messageTrimTarget = 1800
    static let maxMessagesPerSender = 300

    // MARK: Badge ids

    /// The 11 character creator tag of owner-bound badge ids (`ownerTag`, cyrb53 over UTF-16 units).
    static func ownerTag(_ userId: String) -> String {
        var h1: UInt32 = 0xDEADBEEF
        var h2: UInt32 = 0x41C6CE57
        for unit in userId.utf16 {
            h1 = (h1 ^ UInt32(unit)) &* 2_654_435_761
            h2 = (h2 ^ UInt32(unit)) &* 1_597_334_677
        }
        h1 = ((h1 ^ (h1 >> 16)) &* 2_246_822_507) ^ ((h2 ^ (h2 >> 13)) &* 3_266_489_909)
        h2 = ((h2 ^ (h2 >> 16)) &* 2_246_822_507) ^ ((h1 ^ (h1 >> 13)) &* 3_266_489_909)
        let hash = 4_294_967_296 * UInt64(2_097_151 & h2) + UInt64(h1)
        let text = String(hash, radix: 36)
        return String(repeating: "0", count: max(0, 11 - text.count)) + text
    }

    /// The creator tag of an owner-bound badge id, nil for older ids.
    static func badgeIdOwnerTag(_ id: String) -> String? {
        id.wholeMatch(of: #/c\.([0-9a-z]{11})\.[0-9a-z]+/#).map { String($0.1) }
    }

    /// `awardStateKey` / `parseAwardStateKey`: `badgeId|userId`.
    static func parseAwardKey(_ key: String) -> (badgeId: String, userId: String)? {
        guard let bar = key.firstIndex(of: "|"), bar != key.startIndex else { return nil }
        return (String(key[..<bar]), String(key[key.index(after: bar)...]))
    }

    // MARK: Awards

    struct Award: Equatable {
        let by: String
        let at: Int64
        let ts: Int64
    }

    private static func isAward(_ candidate: DiddyCandidate) -> Bool {
        (candidate.content["by"] as? String).map { !$0.isEmpty } ?? false
    }

    /// When an award was given. `content.at` is written by the giver and proves nothing, so it may
    /// only make an award OLDER than its event (a re-announce of an old award keeps its original
    /// time), never newer: anything that is not a finite number in [0, event time] falls back to
    /// the event time, which the homeserver assigned.
    static func awardTime(_ candidate: DiddyCandidate) -> Int64 {
        guard let number = candidate.content["at"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return candidate.ts }
        let at = number.doubleValue
        guard at.isFinite, at >= 0 else { return candidate.ts }
        return at >= Double(candidate.ts) ? candidate.ts : Int64(at)
    }

    /// `resolveAwards`: the awards of one badge for one recipient that are in force, one per giver.
    /// `candidates` are all known events for the key (every sender), in any order.
    static func resolveAwards(recipient: String, _ candidates: [DiddyCandidate]) -> [Award] {
        // newest event per sender; on the same server time a removal beats an award
        var newest: [String: DiddyCandidate] = [:]
        for candidate in candidates {
            if let known = newest[candidate.sender] {
                if candidate.ts > known.ts || (candidate.ts == known.ts && isAward(known) && !isAward(candidate)) {
                    newest[candidate.sender] = candidate
                }
            } else {
                newest[candidate.sender] = candidate
            }
        }
        // the recipient may always remove a badge they were given: their empty event ends every
        // award that is not strictly newer by trusted time
        let recipientRemoved = newest[recipient].flatMap { isAward($0) ? nil : $0.ts }
        var result: [Award] = []
        for candidate in newest.values where isAward(candidate) {
            let at = awardTime(candidate)
            if let recipientRemoved, recipientRemoved >= at { continue }
            result.append(Award(by: candidate.sender, at: at, ts: candidate.ts))
        }
        return result
    }

    // MARK: Definitions

    /// `pickDefinition`: the definition to use for a badge id out of all known versions (every
    /// sender, every source). Ids with a creator tag belong to that creator, older ids to whoever
    /// defined them first. The owner's newest version counts; an invalid (empty) one deletes it.
    static func pickDefinition(id: String, _ candidates: [DiddyCandidate], isValid: (DiddyCandidate) -> Bool) -> DiddyCandidate? {
        let tag = badgeIdOwnerTag(id)
        let possible = candidates.filter { tag == nil || ownerTag($0.sender) == tag }.sorted { $0.ts < $1.ts }
        let owner = tag == nil ? possible.first(where: isValid)?.sender : nil
        let ofOwner = tag == nil ? possible.filter { $0.sender == owner } : possible
        guard let newest = ofOwner.last, isValid(newest) else { return nil }
        return newest
    }

    // MARK: Limits

    /// The newest `max` items of every sender.
    static func capPerSender<T>(_ items: [T], sender: (T) -> String, ts: (T) -> Int64, max: Int) -> [T] {
        var groups: [String: [T]] = [:]
        for item in items { groups[sender(item), default: []].append(item) }
        return groups.values.flatMap { Array($0.sorted { ts($0) > ts($1) }.prefix(max)) }
    }

    /// Keeps the message-mode data of one room small like desktop's cache: nothing happens up to
    /// 2000 entries; above that at most 300 per sender (the newest) stay, then the newest 1800.
    static func trimMessages<T>(_ items: [T], sender: (T) -> String, ts: (T) -> Int64) -> [T] {
        guard items.count > maxMessagesPerRoom else { return items }
        let sorted = items.sorted { ts($0) > ts($1) }
        var perSender: [String: Int] = [:]
        var kept: [T] = []
        for item in sorted {
            let who = sender(item)
            perSender[who, default: 0] += 1
            if perSender[who, default: 0] <= maxMessagesPerSender { kept.append(item) }
        }
        return kept.count > maxMessagesPerRoom ? Array(kept.prefix(messageTrimTarget)) : kept
    }
}
