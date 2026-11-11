import Foundation

// The online state shown for people, and when to ask the server for it. Foundation only, so
// Tools/presence_check can test it on macOS and Linux.
//
// Simplified Sliding Sync delivers no presence, so this side reads it with
// `GET /_matrix/client/v3/presence/{userId}/status` (see PresenceStore.swift). The decision which
// state to show is the desktop's, `cinny/src/app/utils/presenceState.ts`: the Matrix presence
// says whether someone is connected at all, the status they picked in Diddy refines it.

/// What a status dot shows. Same four states and meaning as desktop's `PresenceState`.
enum PresenceState: String, CaseIterable {
    case online, idle, dnd, offline

    var title: String {
        switch self {
        case .online: return "Online"
        case .idle: return "Idle"
        case .dnd: return "Do Not Disturb"
        case .offline: return "Offline"
        }
    }

    /// The fixed colour of each state, the same in every theme like on desktop
    /// (`PRESENCE_STATE_HEX`).
    var hex: UInt32 {
        switch self {
        case .online: return 0x23A55A
        case .idle: return 0xF0B232
        case .dnd: return 0xF23F43
        case .offline: return 0x80848E
        }
    }
}

/// One answer of `GET /presence/{userId}/status`.
struct MatrixPresence: Equatable {
    /// "online", "unavailable" or "offline"
    var presence: String
    var statusMsg: String?
    /// Milliseconds since the user was last active, as the server said at `receivedAt`.
    var lastActiveAgo: Int64?
    var currentlyActive: Bool?
    var receivedAt: Date

    init(presence: String, statusMsg: String? = nil, lastActiveAgo: Int64? = nil, currentlyActive: Bool? = nil, receivedAt: Date) {
        self.presence = presence
        self.statusMsg = statusMsg
        self.lastActiveAgo = lastActiveAgo
        self.currentlyActive = currentlyActive
        self.receivedAt = receivedAt
    }

    /// Reads the JSON body. Nil for anything that is not a presence answer.
    init?(json: [String: Any], receivedAt: Date) {
        guard let presence = json["presence"] as? String else { return nil }
        self.presence = presence
        statusMsg = json["status_msg"] as? String
        lastActiveAgo = Self.milliseconds(json["last_active_ago"])
        currentlyActive = json["currently_active"] as? Bool
        self.receivedAt = receivedAt
    }

    private static func milliseconds(_ value: Any?) -> Int64? {
        let number: Double?
        if let value = value as? Int { number = Double(value) }
        else if let value = value as? Int64 { number = Double(value) }
        else if let value = value as? Double { number = value }
        else if let value = value as? NSNumber { number = value.doubleValue }
        else { number = nil }
        guard let number, number.isFinite, number >= 0, number < 1e15 else { return nil }
        return Int64(number)
    }

    /// Whether a view would show the same for both answers (the age of the answer aside).
    func showsSame(as other: MatrixPresence?) -> Bool {
        guard let other else { return false }
        return presence == other.presence && statusMsg == other.statusMsg && (lastActive == nil) == (other.lastActive == nil)
    }

    /// When the user was last active, like matrix-js-sdk's `getLastActiveTs`. Nil when the server
    /// never saw them (or has presence turned off): then "offline" means "unknown".
    var lastActive: Date? {
        guard let ago = lastActiveAgo else { return nil }
        return receivedAt.addingTimeInterval(-Double(ago) / 1000)
    }

    /// Whether the answer tells anything. Servers with presence turned off answer "offline"
    /// without `last_active_ago` for everybody.
    var isInformative: Bool {
        switch presence {
        case "online", "unavailable": return true
        case "offline": return lastActive != nil
        default: return false
        }
    }
}

enum PresenceLogic {
    /// Matrix has no DND presence: Diddy sends DND as "online" with this status message
    /// (desktop `DND_STATUS_MSG`).
    static let dndStatusMessage = "Do not disturb"

    static func isDndMessage(_ message: String?) -> Bool {
        message?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == dndStatusMessage.lowercased()
    }

    /// Desktop `resolvePresenceState`. `chosen` is the raw Diddy status from the profile
    /// ("online", "idle", "dnd", "invisible"). Nil when nothing is known: then no view may claim
    /// online or offline.
    static func resolve(_ matrix: MatrixPresence?, chosen: String?) -> PresenceState? {
        guard let matrix else { return nil }
        let known: Set<String> = ["online", "idle", "dnd", "invisible"]
        let chosen: String? = chosen.flatMap { known.contains($0) ? $0 : nil }
        switch matrix.presence {
        case "offline": return matrix.lastActive != nil ? .offline : nil
        case "online", "unavailable": break
        default: return nil
        }
        if chosen == "invisible" { return .offline }
        // The picked status wins over a leftover status message (dnd -> idle keeps the message a
        // while on the server).
        if chosen == "dnd" { return .dnd }
        if chosen == nil && isDndMessage(matrix.statusMsg) { return .dnd }
        if matrix.presence == "unavailable" || chosen == "idle" { return .idle }
        return .online
    }

    /// The user's own status message, without the marker Diddy uses for DND (desktop
    /// `presenceMessage`).
    static func message(_ statusMsg: String?) -> String? {
        guard let message = statusMsg?.trimmingCharacters(in: .whitespacesAndNewlines), !message.isEmpty,
              !isDndMessage(message) else { return nil }
        return String(message.prefix(128))
    }

    /// The state to show for someone else. When the server is known to have no presence at all,
    /// the status picked in Diddy is all there is (what this app showed before it read presence);
    /// "invisible" then shows nothing rather than a made-up "offline".
    static func shown(_ matrix: MatrixPresence?, chosen: String?, serverHasPresence: Bool?) -> PresenceState? {
        if let state = resolve(matrix, chosen: chosen) { return state }
        guard serverHasPresence == false else { return nil }
        switch chosen ?? "" {
        case "online": return .online
        case "idle": return .idle
        case "dnd": return .dnd
        default: return nil
        }
    }

    /// Your own dot: you are here, so it is the status you picked (invisible looks offline, as
    /// desktop shows it to you).
    static func own(chosen: String?) -> PresenceState {
        switch chosen ?? "" {
        case "idle": return .idle
        case "dnd": return .dnd
        case "invisible": return .offline
        default: return .online
        }
    }

    struct Announcement: Equatable {
        var presence: String
        var statusMsg: String?

        /// The `PUT /presence/{me}/status` body.
        var body: [String: Any] {
            var body: [String: Any] = ["presence": presence]
            if let statusMsg { body["status_msg"] = statusMsg }
            return body
        }
    }

    /// What to announce as your Matrix presence. In the foreground this is desktop's
    /// `presenceForStatus`; in the background "online" and DND become "unavailable" (DND keeps its
    /// message so other Diddy clients still show DND), invisible stays "offline" and is never
    /// announced as online.
    static func announcement(chosen: String?, foreground: Bool) -> Announcement {
        switch chosen ?? "" {
        case "invisible": return Announcement(presence: "offline")
        case "idle": return Announcement(presence: "unavailable")
        case "dnd": return Announcement(presence: foreground ? "online" : "unavailable", statusMsg: dndStatusMessage)
        default: return Announcement(presence: foreground ? "online" : "unavailable")
        }
    }
}

/// Tells whether the server has presence at all, so a server with presence turned off does not
/// make everybody look offline.
struct PresenceServerProbe: Equatable {
    /// Nil while unknown.
    private(set) var hasPresence: Bool?
    private var uninformativeInARow = 0

    /// After this many answers in a row that tell nothing (and never one that did), the server is
    /// taken to have no presence.
    static let uninformativeLimit = 8

    /// An answer about somebody else.
    mutating func record(informative: Bool) {
        if informative {
            hasPresence = true
            uninformativeInARow = 0
        } else if hasPresence != true {
            uninformativeInARow += 1
            if uninformativeInARow >= Self.uninformativeLimit { hasPresence = false }
        }
    }

    /// Your own presence read back right after announcing "online" or "unavailable": a server
    /// with presence answers with it, one without says "offline" with nothing else.
    mutating func recordOwnAfterAnnouncing(informative: Bool) {
        hasPresence = informative
        uninformativeInARow = 0
    }

    /// The endpoint itself is missing or turned off (404 M_UNRECOGNIZED and the like).
    mutating func recordUnsupported() {
        if hasPresence != true { hasPresence = false }
    }
}

/// When to ask for whom. Everything is plain values, so the schedule can be tested.
enum PresenceSchedule {
    /// One round of the loop while the app is in the foreground.
    static let tick: TimeInterval = 10
    /// How old a known presence may get before it is asked again.
    static let refresh: TimeInterval = 60
    /// A profile card asks again sooner.
    static let onDemandRefresh: TimeInterval = 15
    /// Servers without presence are asked rarely, in case it gets turned on.
    static let noPresenceRefresh: TimeInterval = 15 * 60
    /// Requests per round at most, one after the other (so never more than 36 a minute).
    static let maxPerRound = 6
    /// Direct message partners that are kept fresh even while not on screen.
    static let maxDirectPartners = 25
    /// Answers older than this are not shown any more (the app was away, or asking failed since).
    static let staleAfter: TimeInterval = 10 * 60
    /// Your own "online" is announced again this often while the app is open, so the server's
    /// idle timer (5 min on Synapse) does not turn it into "unavailable".
    static let slowHeartbeat: TimeInterval = 4 * 60
    /// A server that does not count Sliding Sync as being connected marks you offline about 30 s
    /// after the last announcement; then it is sent this often. Synapse allows one presence
    /// change every 10 s.
    static let fastHeartbeat: TimeInterval = 20
    /// How long after announcing "online" your own presence is read back, to learn which of the
    /// two the server needs (and whether it has presence at all).
    static let ownCheckDelay: TimeInterval = 35

    static func heartbeat(serverKeepsPresence: Bool?) -> TimeInterval {
        serverKeepsPresence == false ? fastHeartbeat : slowHeartbeat
    }

    /// What reading your own presence back `ownCheckDelay` after announcing "online" says:
    /// still online (or idle) means the server keeps you connected; "offline" with a last active
    /// time means it needs the fast heartbeat; "offline" with nothing else means it has no presence.
    static func ownCheck(_ own: MatrixPresence) -> (hasPresence: Bool, keepsPresence: Bool) {
        guard own.isInformative else { return (false, true) }
        return (true, own.presence != "offline")
    }
    /// Longest wait after errors.
    static let maxBackoff: TimeInterval = 30 * 60

    struct Entry: Equatable {
        var fetchedAt: Date?
        var failures = 0
        var retryAt: Date?
    }

    enum Outcome: Equatable {
        case ok
        /// 429, with the wait the server asked for (if any).
        case rateLimited(retryAfter: TimeInterval?)
        /// 403 (no shared room) or 404: asking again soon will not help.
        case refused
        /// Network trouble, 5xx and anything else.
        case failed
    }

    /// Wait after `failures` failed requests in a row: 1 min, 2, 4 ... up to 30 min.
    static func backoff(failures: Int) -> TimeInterval {
        guard failures > 0 else { return 0 }
        let exponent = min(failures - 1, 10)
        return min(refresh * pow(2, Double(exponent)), maxBackoff)
    }

    /// The wait a 429 asks for, kept between 5 s and the longest backoff.
    static func rateLimitWait(_ retryAfter: TimeInterval?) -> TimeInterval {
        min(max(retryAfter ?? refresh, 5), maxBackoff)
    }

    /// The entry after a request ended with `outcome` at `now`.
    static func update(_ entry: Entry, outcome: Outcome, now: Date) -> Entry {
        var next = entry
        switch outcome {
        case .ok:
            next.fetchedAt = now
            next.failures = 0
            next.retryAt = nil
        case .rateLimited(let retryAfter):
            next.retryAt = now.addingTimeInterval(rateLimitWait(retryAfter))
        case .refused:
            next.failures += 1
            next.retryAt = now.addingTimeInterval(maxBackoff)
        case .failed:
            next.failures += 1
            next.retryAt = now.addingTimeInterval(backoff(failures: next.failures))
        }
        return next
    }

    /// Whether a user should be asked now, given how fresh the answer must be.
    static func isDue(_ entry: Entry?, now: Date, maxAge: TimeInterval) -> Bool {
        guard let entry else { return true }
        if let retryAt = entry.retryAt, now < retryAt { return false }
        guard let fetchedAt = entry.fetchedAt else { return true }
        return now.timeIntervalSince(fetchedAt) >= maxAge
    }

    /// The users to ask this round: `ordered` is by priority (on screen first, then direct message
    /// partners), duplicates and users not due are skipped, at most `limit`.
    static func pick(_ ordered: [String], entries: [String: Entry], now: Date, maxAge: TimeInterval, limit: Int = maxPerRound) -> [String] {
        var seen: Set<String> = []
        var result: [String] = []
        for userId in ordered where result.count < limit {
            guard seen.insert(userId).inserted else { continue }
            if isDue(entries[userId], now: now, maxAge: maxAge) { result.append(userId) }
        }
        return result
    }

    /// Whether to send your presence now: when it changed, or the last one is getting old.
    static func shouldAnnounce(_ wanted: PresenceLogic.Announcement, last: PresenceLogic.Announcement?, lastAt: Date?, now: Date, heartbeat: TimeInterval) -> Bool {
        guard let last, let lastAt, last == wanted else { return true }
        // Only "online" is kept alive; "unavailable" and "offline" stay as they are.
        if wanted.presence != "online" { return false }
        return now.timeIntervalSince(lastAt) >= heartbeat
    }

    /// Reads `retry_after_ms` from a 429 body, or the `Retry-After` header (seconds).
    static func retryAfter(json: [String: Any]?, header: String?) -> TimeInterval? {
        if let ms = json?["retry_after_ms"] as? NSNumber, ms.doubleValue >= 0 { return ms.doubleValue / 1000 }
        if let header, let seconds = Double(header.trimmingCharacters(in: .whitespaces)), seconds >= 0 { return seconds }
        return nil
    }

    /// Sorts an HTTP answer into an outcome.
    static func outcome(status: Int, errcode: String?) -> Outcome {
        switch status {
        case 200: return .ok
        case 429: return .rateLimited(retryAfter: nil)
        case 403, 404: return .refused
        default: return errcode == "M_LIMIT_EXCEEDED" ? .rateLimited(retryAfter: nil) : .failed
        }
    }
}
