// Checks for Diddy/Matrix/PresenceLogic.swift: which online state is shown (the desktop's
// resolvePresenceState, cinny/src/app/utils/presenceState.ts), what is announced, and the polling
// and backoff schedule. Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc Diddy/Matrix/PresenceLogic.swift Tools/presence_check/main.swift -o /tmp/presence_check && /tmp/presence_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

let now = Date(timeIntervalSince1970: 1_800_000_000)
func presence(_ value: String, msg: String? = nil, ago: Int64? = 1000) -> MatrixPresence {
    MatrixPresence(presence: value, statusMsg: msg, lastActiveAgo: ago, receivedAt: now)
}

// MARK: Parsing

let parsed = MatrixPresence(json: ["presence": "online", "last_active_ago": 4200, "currently_active": true, "status_msg": "hi"], receivedAt: now)
check(parsed?.presence == "online", "presence read")
check(parsed?.lastActiveAgo == 4200, "last_active_ago read")
check(parsed?.currentlyActive == true, "currently_active read")
check(parsed?.statusMsg == "hi", "status_msg read")
check(parsed?.lastActive == now.addingTimeInterval(-4.2), "last active = received - ago")
check(MatrixPresence(json: ["presence": "offline", "last_active_ago": 2.5e6], receivedAt: now)?.lastActiveAgo == 2_500_000, "double last_active_ago")
check(MatrixPresence(json: ["presence": "offline", "last_active_ago": -5], receivedAt: now)?.lastActiveAgo == nil, "negative ago ignored")
check(MatrixPresence(json: ["presence": "offline", "last_active_ago": "5"], receivedAt: now)?.lastActiveAgo == nil, "string ago ignored")
check(MatrixPresence(json: ["errcode": "M_FORBIDDEN"], receivedAt: now) == nil, "error body is no presence")
check(MatrixPresence(json: ["presence": 3], receivedAt: now) == nil, "non-string presence rejected")

// Servers with presence turned off answer "offline" and nothing else.
let disabledAnswer = MatrixPresence(json: ["presence": "offline"], receivedAt: now)!
check(!disabledAnswer.isInformative, "bare offline tells nothing")
check(presence("offline").isInformative, "offline with last active is real")
check(presence("online", ago: nil).isInformative, "online is informative")
check(presence("unavailable", ago: nil).isInformative, "unavailable is informative")
check(!presence("busy").isInformative, "unknown value is not informative")

// MARK: resolve (desktop resolvePresenceState)

check(PresenceLogic.resolve(nil, chosen: "online") == nil, "nothing known -> nil")
check(PresenceLogic.resolve(disabledAnswer, chosen: "online") == nil, "bare offline -> nil, never a wrong offline")
check(PresenceLogic.resolve(presence("offline"), chosen: nil) == .offline, "offline with last active -> offline")
check(PresenceLogic.resolve(presence("offline"), chosen: "dnd") == .offline, "offline wins over an old dnd profile")
check(PresenceLogic.resolve(presence("online"), chosen: nil) == .online, "online")
check(PresenceLogic.resolve(presence("online"), chosen: "online") == .online, "online + online")
check(PresenceLogic.resolve(presence("online"), chosen: "invisible") == .offline, "invisible looks offline")
check(PresenceLogic.resolve(presence("unavailable"), chosen: "invisible") == .offline, "invisible while idle looks offline")
check(PresenceLogic.resolve(presence("online"), chosen: "dnd") == .dnd, "dnd from profile")
check(PresenceLogic.resolve(presence("unavailable"), chosen: "dnd") == .dnd, "dnd in the background stays dnd")
check(PresenceLogic.resolve(presence("online", msg: "Do not disturb"), chosen: nil) == .dnd, "dnd from status message")
check(PresenceLogic.resolve(presence("online", msg: "  do NOT disturb "), chosen: nil) == .dnd, "dnd message case and spaces")
check(PresenceLogic.resolve(presence("online", msg: "Do not disturb"), chosen: "idle") == .idle, "picked idle beats a leftover dnd message")
check(PresenceLogic.resolve(presence("online", msg: "Do not disturb"), chosen: "online") == .online, "picked online beats a leftover dnd message")
check(PresenceLogic.resolve(presence("unavailable"), chosen: nil) == .idle, "unavailable -> idle")
check(PresenceLogic.resolve(presence("online"), chosen: "idle") == .idle, "picked idle")
check(PresenceLogic.resolve(presence("online"), chosen: "weird") == .online, "unknown picked status ignored")
check(PresenceLogic.resolve(presence("busy"), chosen: "online") == nil, "unknown presence -> nil")

// MARK: shown (fallback for servers without presence)

check(PresenceLogic.shown(nil, chosen: "dnd", serverHasPresence: nil) == nil, "unknown server: nothing until asked")
check(PresenceLogic.shown(nil, chosen: "dnd", serverHasPresence: true) == nil, "server has presence but no answer: nothing")
check(PresenceLogic.shown(disabledAnswer, chosen: "dnd", serverHasPresence: false) == .dnd, "no presence on server: picked dnd")
check(PresenceLogic.shown(disabledAnswer, chosen: "online", serverHasPresence: false) == .online, "no presence on server: picked online")
check(PresenceLogic.shown(disabledAnswer, chosen: "idle", serverHasPresence: false) == .idle, "no presence on server: picked idle")
check(PresenceLogic.shown(disabledAnswer, chosen: "invisible", serverHasPresence: false) == nil, "no presence on server: invisible shows nothing")
check(PresenceLogic.shown(disabledAnswer, chosen: nil, serverHasPresence: false) == nil, "no presence, no profile: nothing")
check(PresenceLogic.shown(presence("online"), chosen: "idle", serverHasPresence: false) == .idle, "a real answer still wins")

check(PresenceLogic.own(chosen: nil) == .online, "own default online")
check(PresenceLogic.own(chosen: "invisible") == .offline, "own invisible")
check(PresenceLogic.own(chosen: "dnd") == .dnd, "own dnd")
check(PresenceLogic.own(chosen: "idle") == .idle, "own idle")

check(PresenceLogic.message("Do not disturb") == nil, "dnd marker is no message")
check(PresenceLogic.message("  ") == nil, "blank message")
check(PresenceLogic.message(" at lunch ") == "at lunch", "message trimmed")
check(PresenceLogic.message(String(repeating: "x", count: 500))?.count == 128, "message capped")

// MARK: announcement (desktop presenceForStatus in the foreground)

typealias A = PresenceLogic.Announcement
check(PresenceLogic.announcement(chosen: "online", foreground: true) == A(presence: "online"), "online")
check(PresenceLogic.announcement(chosen: nil, foreground: true) == A(presence: "online"), "default online")
check(PresenceLogic.announcement(chosen: "idle", foreground: true) == A(presence: "unavailable"), "idle")
check(PresenceLogic.announcement(chosen: "dnd", foreground: true) == A(presence: "online", statusMsg: "Do not disturb"), "dnd")
check(PresenceLogic.announcement(chosen: "invisible", foreground: true) == A(presence: "offline"), "invisible never online")
check(PresenceLogic.announcement(chosen: "online", foreground: false) == A(presence: "unavailable"), "background online -> unavailable")
check(PresenceLogic.announcement(chosen: "dnd", foreground: false) == A(presence: "unavailable", statusMsg: "Do not disturb"), "background dnd keeps marker")
check(PresenceLogic.announcement(chosen: "invisible", foreground: false) == A(presence: "offline"), "background invisible")
check(PresenceLogic.announcement(chosen: "idle", foreground: false) == A(presence: "unavailable"), "background idle")
for chosen in ["online", "idle", "dnd", "invisible", nil] as [String?] {
    for foreground in [true, false] {
        let announced = PresenceLogic.announcement(chosen: chosen, foreground: foreground)
        let readBack = MatrixPresence(presence: announced.presence, statusMsg: announced.statusMsg, lastActiveAgo: 0, receivedAt: now)
        // What we announce reads back (by desktop rules) as the picked state, except that the
        // background turns online into idle.
        var expected = PresenceLogic.own(chosen: chosen)
        if !foreground && expected == .online { expected = .idle }
        check(PresenceLogic.resolve(readBack, chosen: chosen) == expected, "round trip \(chosen ?? "nil") fg=\(foreground)")
        if chosen != nil {
            // Desktop without the profile only has the message to go on.
            let withoutProfile = PresenceLogic.resolve(readBack, chosen: nil)
            if chosen == "dnd" { check(withoutProfile == .dnd, "dnd readable without profile") }
            if chosen == "invisible" { check(withoutProfile == .offline, "invisible reads offline without profile") }
        }
    }
}
check(A(presence: "online", statusMsg: "x").body["status_msg"] as? String == "x", "body carries status_msg")
check(A(presence: "online").body["status_msg"] == nil, "body without status_msg")

// MARK: Server probe

var probe = PresenceServerProbe()
check(probe.hasPresence == nil, "probe starts unknown")
for _ in 0..<(PresenceServerProbe.uninformativeLimit - 1) { probe.record(informative: false) }
check(probe.hasPresence == nil, "not decided before the limit")
probe.record(informative: false)
check(probe.hasPresence == false, "decided after the limit")
probe.record(informative: true)
check(probe.hasPresence == true, "one real answer turns it on")
for _ in 0..<20 { probe.record(informative: false) }
check(probe.hasPresence == true, "stays on: offline users without last active are normal")
var own = PresenceServerProbe()
own.recordOwnAfterAnnouncing(informative: false)
check(own.hasPresence == false, "own read back tells nothing -> no presence")
own.recordOwnAfterAnnouncing(informative: true)
check(own.hasPresence == true, "own read back works -> presence")
var unsupported = PresenceServerProbe()
unsupported.recordUnsupported()
check(unsupported.hasPresence == false, "missing endpoint -> no presence")
unsupported.record(informative: true)
unsupported.recordUnsupported()
check(unsupported.hasPresence == true, "a real answer is not undone by one odd error")

// MARK: Schedule

func verdict(_ v: (hasPresence: Bool, keepsPresence: Bool)) -> [Bool] { [v.hasPresence, v.keepsPresence] }

typealias S = PresenceSchedule
check(S.backoff(failures: 0) == 0, "no failure, no wait")
check(S.backoff(failures: 1) == 60, "first failure 1 min")
check(S.backoff(failures: 2) == 120, "second 2 min")
check(S.backoff(failures: 3) == 240, "third 4 min")
check(S.backoff(failures: 50) == S.maxBackoff, "capped")
var previous: TimeInterval = 0
for n in 1...20 {
    let wait = S.backoff(failures: n)
    check(wait >= previous && wait <= S.maxBackoff, "backoff grows and is capped at \(n)")
    previous = wait
}
check(S.rateLimitWait(nil) == S.refresh, "429 without hint waits a minute")
check(S.rateLimitWait(0.2) == 5, "429 waits at least 5 s")
check(S.rateLimitWait(99_999) == S.maxBackoff, "429 wait capped")
check(S.rateLimitWait(42) == 42, "429 hint honoured")
check(S.retryAfter(json: ["retry_after_ms": 1500], header: nil) == 1.5, "retry_after_ms")
check(S.retryAfter(json: nil, header: " 7 ") == 7, "Retry-After header")
check(S.retryAfter(json: ["errcode": "M_LIMIT_EXCEEDED"], header: "soon") == nil, "no usable hint")

check(S.outcome(status: 200, errcode: nil) == .ok, "200 ok")
check(S.outcome(status: 429, errcode: "M_LIMIT_EXCEEDED") == .rateLimited(retryAfter: nil), "429")
check(S.outcome(status: 400, errcode: "M_LIMIT_EXCEEDED") == .rateLimited(retryAfter: nil), "limit errcode")
check(S.outcome(status: 403, errcode: "M_FORBIDDEN") == .refused, "403 refused")
check(S.outcome(status: 404, errcode: "M_UNRECOGNIZED") == .refused, "404 refused")
check(S.outcome(status: 502, errcode: nil) == .failed, "5xx failed")
check(S.outcome(status: 0, errcode: nil) == .failed, "no answer failed")

check(S.isDue(nil, now: now, maxAge: 60), "never asked -> due")
var entry = S.update(S.Entry(), outcome: .ok, now: now)
check(entry.fetchedAt == now && entry.failures == 0 && entry.retryAt == nil, "ok entry")
check(!S.isDue(entry, now: now.addingTimeInterval(59), maxAge: 60), "fresh -> not due")
check(S.isDue(entry, now: now.addingTimeInterval(60), maxAge: 60), "old -> due")
check(S.isDue(entry, now: now.addingTimeInterval(15), maxAge: S.onDemandRefresh), "on demand asks sooner")
entry = S.update(entry, outcome: .failed, now: now)
check(entry.failures == 1 && entry.fetchedAt == now, "failure counted, last answer kept")
check(!S.isDue(entry, now: now.addingTimeInterval(59), maxAge: 0), "backoff blocks even on demand")
check(S.isDue(entry, now: now.addingTimeInterval(61), maxAge: 60), "due after backoff")
entry = S.update(entry, outcome: .failed, now: now)
check(entry.retryAt == now.addingTimeInterval(120), "second failure 2 min")
entry = S.update(entry, outcome: .ok, now: now.addingTimeInterval(200))
check(entry.failures == 0 && entry.retryAt == nil, "ok resets")
let refused = S.update(S.Entry(), outcome: .refused, now: now)
check(refused.retryAt == now.addingTimeInterval(S.maxBackoff), "refused waits long")
let limited = S.update(S.Entry(), outcome: .rateLimited(retryAfter: 30), now: now)
check(limited.retryAt == now.addingTimeInterval(30) && limited.failures == 0, "429 waits as told")

var entries: [String: S.Entry] = [:]
entries["@fresh:x"] = S.update(S.Entry(), outcome: .ok, now: now)
entries["@waiting:x"] = S.update(S.Entry(), outcome: .failed, now: now)
let ordered = ["@a:x", "@fresh:x", "@b:x", "@a:x", "@waiting:x", "@c:x"]
check(S.pick(ordered, entries: entries, now: now, maxAge: 60) == ["@a:x", "@b:x", "@c:x"], "pick skips fresh, waiting and duplicates")
check(S.pick(ordered, entries: entries, now: now, maxAge: 60, limit: 2) == ["@a:x", "@b:x"], "pick keeps priority order and limit")
let many = (0..<100).map { "@u\($0):x" }
check(S.pick(many, entries: [:], now: now, maxAge: 60).count == S.maxPerRound, "one round is limited")
check(Double(S.maxPerRound) * 60 / S.tick <= 40, "at most 40 requests a minute")

let online = A(presence: "online")
check(S.shouldAnnounce(online, last: nil, lastAt: nil, now: now, heartbeat: 20), "first announcement")
check(S.shouldAnnounce(online, last: A(presence: "unavailable"), lastAt: now, now: now, heartbeat: 20), "changed -> announce")
check(!S.shouldAnnounce(online, last: online, lastAt: now, now: now.addingTimeInterval(19), heartbeat: 20), "no heartbeat yet")
check(S.shouldAnnounce(online, last: online, lastAt: now, now: now.addingTimeInterval(20), heartbeat: 20), "heartbeat")
check(!S.shouldAnnounce(A(presence: "offline"), last: A(presence: "offline"), lastAt: now, now: now.addingTimeInterval(9999), heartbeat: 20), "offline is not repeated")
check(!S.shouldAnnounce(A(presence: "unavailable"), last: A(presence: "unavailable"), lastAt: now, now: now.addingTimeInterval(9999), heartbeat: 20), "unavailable is not repeated")
check(S.shouldAnnounce(A(presence: "online", statusMsg: "Do not disturb"), last: online, lastAt: now, now: now, heartbeat: 20), "dnd change announced")
check(S.heartbeat(serverKeepsPresence: nil) == S.slowHeartbeat, "slow until known")
check(S.heartbeat(serverKeepsPresence: true) == S.slowHeartbeat, "slow when kept")
check(S.heartbeat(serverKeepsPresence: false) == S.fastHeartbeat, "fast when dropped")
check(S.fastHeartbeat >= 10, "Synapse allows one presence change per 10 s")
check(S.fastHeartbeat < 30, "fast heartbeat beats the 30 s offline timeout")
check(S.slowHeartbeat < 5 * 60, "slow heartbeat beats the 5 min idle timer")
check(S.ownCheckDelay > 30, "own check waits past the 30 s offline timeout")
check(S.ownCheckDelay < S.slowHeartbeat, "own check happens before the next heartbeat")
check(verdict(S.ownCheck(presence("online"))) == [true, true], "still online -> kept")
check(verdict(S.ownCheck(presence("unavailable"))) == [true, true], "idle -> kept")
check(verdict(S.ownCheck(presence("offline", ago: 35_000))) == [true, false], "dropped -> fast heartbeat")
check(verdict(S.ownCheck(disabledAnswer)) == [false, true], "no presence -> no heartbeat needed")

if failures > 0 {
    print("\(failures) presence check(s) failed")
    exit(1)
}
print("presence checks passed")
