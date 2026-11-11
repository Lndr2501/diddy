// Checks for Diddy/Call/WatchTogetherLogic.swift (Watch together, #83), the same cases as the
// desktop's cinny/tests/watchTogether.test.cjs. Foundation only (CryptoKit where available).
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Call/WatchTogetherLogic.swift Tools/watchtogether_check/main.swift -o /tmp/watchtogether_check && /tmp/watchtogether_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
func json(_ text: String) -> Any? {
    try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])
}

let ID = "dQw4w9WgXcQ"

// --- links ------------------------------------------------------------------------------------

let goodLinks: [(String, Double)] = [
    ("https://www.youtube.com/watch?v=\(ID)", 0),
    ("https://youtube.com/watch?v=\(ID)&t=90", 90),
    ("youtube.com/watch?feature=share&v=\(ID)&t=1m30s", 90),
    ("https://m.youtube.com/watch?v=\(ID)#t=1h2m3s", 3723),
    ("https://music.youtube.com/watch?v=\(ID)", 0),
    ("https://youtu.be/\(ID)?t=42", 42),
    ("youtu.be/\(ID)", 0),
    ("https://www.youtube.com/shorts/\(ID)", 0),
    ("https://www.youtube.com/embed/\(ID)?start=12", 12),
    ("https://www.youtube-nocookie.com/embed/\(ID)", 0),
    ("https://www.youtube.com/live/\(ID)?si=abc", 0),
    ("  \(ID)  ", 0),
    ("https://youtu.be/\(ID)?t=12.7s", 12),
]
for (link, start) in goodLinks {
    let parsed = WatchYouTube.parseURL(link)
    check(parsed?.videoId == ID && parsed?.start == start, "link \(link) -> \(String(describing: parsed))")
}

let badLinks = [
    "",
    "hello",
    "https://evil.example/watch?v=\(ID)",
    "https://youtube.com.evil.example/watch?v=\(ID)",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQQ",
    "https://www.youtube.com/watch?v=dQw4w9WgX<Q",
    "javascript:alert(1)//youtu.be/\(ID)",
    "ftp://youtu.be/\(ID)",
    "https://www.youtube.com/playlist?list=PL123",
    "https://youtu.be/\(String(repeating: "x", count: 3000))",
]
for link in badLinks {
    check(WatchYouTube.parseURL(link) == nil, "rejects \(link.prefix(80))")
}

check(WatchYouTube.parseStartTime("abc") == 0, "start abc")
check(WatchYouTube.parseStartTime("-5") == 0, "start -5")
check(WatchYouTube.parseStartTime("99999999") == WatchYouTube.maxStart, "start clamped")
check(WatchYouTube.parseStartTime("2m") == 120, "start 2m")
check(WatchYouTube.parseStartTime("1h30") == 0, "start 1h30 is garbage")
check(WatchYouTube.parseStartTime("1h") == 3600, "start 1h")
check(WatchYouTube.parseStartTime("90S") == 90, "start 90S")
check(WatchYouTube.parseStartTime("h") == 0, "start h")

// embed URL
if let text = WatchYouTube.embedURL(videoId: ID, origin: "https://app.diddy.ios", start: 61.9),
   let url = URLComponents(string: text) {
    let q = Dictionary(uniqueKeysWithValues: (url.queryItems ?? []).map { ($0.name, $0.value ?? "") })
    check(url.scheme == "https" && url.host == "www.youtube-nocookie.com", "embed host")
    check(url.path == "/embed/\(ID)", "embed path")
    check(q["enablejsapi"] == "1" && q["playsinline"] == "1", "embed js api")
    check(q["origin"] == "https://app.diddy.ios" && q["widget_referrer"] == "https://app.diddy.ios", "embed origin")
    check(q["start"] == "61", "embed start floored")
    check(text.contains("origin=https%3A%2F%2Fapp.diddy.ios"), "origin form-encoded like URLSearchParams")
} else {
    check(false, "embed URL builds")
}
check(WatchYouTube.embedURL(videoId: ID, origin: "null").map { !$0.contains("origin=") } == true, "no origin for null")
check(WatchYouTube.embedURL(videoId: "../../x", origin: "https://a") == nil, "embed rejects bad id")

// player messages
check(WatchPlayerMessages.parse(#"{"event":"onReady"}"#) == .ready, "onReady")
check(WatchPlayerMessages.parse(#"{"event":"onStateChange","info":1}"#) == .state(1), "onStateChange")
check(WatchPlayerMessages.parse(#"{"event":"onError","info":150}"#) == .error(150), "onError")
check(WatchPlayerMessages.parse(#"{"event":"onPlaybackRateChange","info":1.5}"#) == .rate(1.5), "rate")
check(WatchPlayerMessages.parse(#"{"event":"onPlaybackQualityChange","info":"hd720"}"#) == .quality("hd720"), "quality")
let info = WatchPlayerMessages.parse(#"{"event":"infoDelivery","info":{"currentTime":12.5,"playerState":1,"duration":"x","playbackQuality":"hd720","availableQualityLevels":["hd720","<b>",3]}}"#)
check(info == .info(WatchPlayerInfo(currentTime: 12.5, duration: nil, playerState: 1, playbackRate: nil, playbackQuality: "hd720", availableQualityLevels: ["hd720"])), "infoDelivery: \(String(describing: info))")
for bad in ["42", "not json", "[]", #"{"event":"onStateChange","info":"1"}"#, #"{"event":"x"}"#, #"{"event":"onStateChange","info":true}"#] {
    check(WatchPlayerMessages.parse(bad) == nil, "ignores player message \(bad)")
}
let command = WatchYouTube.playerCommand("seekTo", [12.5, true])
if let object = json(command) as? [String: Any] {
    check(object["event"] as? String == "command" && object["func"] as? String == "seekTo", "command shape")
    check(object["channel"] as? String == "widget" && (object["args"] as? [Any])?.count == 2, "command args")
} else {
    check(false, "command is JSON")
}
check(WatchYouTube.playerCommand("seekTo", [Double.nan]) == "{}", "NaN does not crash")

// --- messages -----------------------------------------------------------------------------------

let ROOM = "!room:example.org"
func goodState(_ change: (inout [String: Any]) -> Void = { _ in }) -> [String: Any] {
    var c: [String: Any] = [
        "v": 1, "kind": "state", "room_id": ROOM, "session": "abcdEFGH1234", "video_id": ID,
        "state": "playing", "position": 12.5, "rate": 1, "ts": 1_700_000_000_000 as Int64, "seq": 3,
    ]
    change(&c)
    return c
}
let parsedGood = WatchProtocol.parse(goodState())
check(parsedGood == .state(WatchStateMessage(room: ROOM, session: "abcdEFGH1234", videoId: ID, state: .playing, position: 12.5, rate: 1, ts: 1_700_000_000_000, seq: 3)), "good state")
let requestMessage: [String: Any] = ["v": 1, "kind": "request", "room_id": ROOM]
check(WatchProtocol.parse(requestMessage) == .request(room: ROOM), "request")
check(WatchProtocol.parse(json: #"{"v":1,"kind":"state","room_id":"!room:example.org","session":"abcdEFGH1234","video_id":"dQw4w9WgXcQ","state":"paused","position":3,"rate":1.5,"ts":1700000000000,"seq":7}"#) != nil, "desktop JSON")

let badMessages: [(String, Any?)] = [
    ("nil", nil), ("string", "x"), ("array", [Any]()),
    ("v2", goodState { $0["v"] = 2 }),
    ("v true", goodState { $0["v"] = true }),
    ("kind eval", goodState { $0["kind"] = "eval" }),
    ("room", goodState { $0["room_id"] = "room" }),
    ("room space", goodState { $0["room_id"] = "!a b" }),
    ("video short", goodState { $0["video_id"] = "abc" }),
    ("video long", goodState { $0["video_id"] = "\(ID)x" }),
    ("video number", goodState { $0["video_id"] = 12345678901 }),
    ("session space", goodState { $0["session"] = "a b" }),
    ("session short", goodState { $0["session"] = "short" }),
    ("state", goodState { $0["state"] = "rewinding" }),
    ("position -1", goodState { $0["position"] = -1 }),
    ("position huge", goodState { $0["position"] = 1e12 }),
    ("position string", goodState { $0["position"] = "12" }),
    ("rate 100", goodState { $0["rate"] = 100 }),
    ("rate 0", goodState { $0["rate"] = 0 }),
    ("ts 0", goodState { $0["ts"] = 0 }),
    ("ts huge", goodState { $0["ts"] = 1e15 }),
    ("seq 1.5", goodState { $0["seq"] = 1.5 }),
    ("seq -1", goodState { $0["seq"] = -1 }),
    ("seq 1e15", goodState { $0["seq"] = 1e15 }),
    ("seq bool", goodState { $0["seq"] = true }),
]
for (name, message) in badMessages {
    check(WatchProtocol.parse(message) == nil, "drops \(name)")
}

// round trip through JSON
let started = WatchProtocol.startWatch(videoId: ID, start: 30, previous: nil, sender: "@a:x", now: 1000, random: { 0.5 })
if let text = WatchProtocol.json(WatchProtocol.stateContent(room: ROOM, started)),
   case .state(let back)? = WatchProtocol.parse(json: text) {
    check(back.session == started.session && back.position == 30 && back.seq == 1, "round trip")
    check(back.ts == 1000 && back.videoId == ID && back.state == .playing, "round trip fields")
} else {
    check(false, "round trip parses")
}
check(WatchProtocol.json(WatchProtocol.requestContent(room: ROOM)).flatMap { WatchProtocol.parse(json: $0) } == .request(room: ROOM), "request round trip")
check(started.session == String(repeating: "f", count: 16), "session from random 0.5 like desktop")

// last writer wins
var a = WatchProtocol.startWatch(videoId: ID, start: 0, previous: nil, sender: "@a:x", now: 1000)
a.seq = 5
var b = a
b.seq = 6
check(WatchProtocol.isNewer(b, than: a), "higher seq wins")
b.seq = 4
check(!WatchProtocol.isNewer(b, than: a), "lower seq loses")
b = a; b.sender = "@b:x"
check(WatchProtocol.isNewer(b, than: a), "larger sender wins tie")
b.sender = "@0:x"
check(!WatchProtocol.isNewer(b, than: a), "smaller sender loses tie")
check(!WatchProtocol.isNewer(a, than: a), "same is no change")
check(WatchProtocol.isNewer(a, than: nil), "anything beats nothing")

// expected position and clocks
var s2 = WatchProtocol.startWatch(videoId: ID, start: 10, previous: nil, sender: "@a:x", now: 1000)
s2.rate = 2
check(WatchProtocol.expectedPosition(s2, now: 4000) == 16, "expected while playing")
var paused = s2; paused.state = .paused
check(WatchProtocol.expectedPosition(paused, now: 4000) == 10, "expected while paused")
check(WatchProtocol.expectedPosition(s2, now: 0) == 10, "clock behind")
if case .state(let msg)? = parsedGood {
    check(WatchProtocol.fromMessage(msg, sender: "@a:x", now: msg.ts + 500).ts == msg.ts, "close clock kept")
    check(WatchProtocol.fromMessage(msg, sender: "@a:x", now: msg.ts - 5000).ts == msg.ts - 5000, "future clock replaced")
    check(WatchProtocol.fromMessage(msg, sender: "@a:x", now: msg.ts + 3_600_000).ts == msg.ts + 3_600_000, "old clock replaced")
}
let rebased = WatchProtocol.rebase(s2, now: 2000)
check(rebased.position == 12 && rebased.ts == 2000, "rebase")

// local changes
var previous = a; previous.seq = 7
let s3 = WatchProtocol.startWatch(videoId: ID, start: 0, previous: previous, sender: "@a:x", now: 0)
check(s3.seq == 8, "start one above previous")
let next = WatchProtocol.nextChange(s3, patch: WatchPatch(state: .paused, position: 5), sender: "@b:x", now: 9000)
check(next.seq == 9 && next.sender == "@b:x" && next.position == 5 && next.session == s3.session, "next change")
check(WatchProtocol.nextChange(s3, patch: WatchPatch(rate: 50), sender: "@b:x", now: 0).rate == WatchProtocol.maxRate, "rate clamped")
let sid = WatchProtocol.newSessionId()
check(sid.count == 16 && WatchProtocol.isSession(sid), "session id shape")

// recipients
let devices = [
    WatchDevice(userId: "@me:x", deviceId: "OTHER"),
    WatchDevice(userId: "@b:x", deviceId: "B1"),
    WatchDevice(userId: "@b:x", deviceId: "B1"),
    WatchDevice(userId: "@b:x", deviceId: "B2"),
    WatchDevice(userId: "@c:x", deviceId: "C1"),
]
let recipients = WatchProtocol.recipients(devices, ownUserId: "@me:x")
check(recipients["@me:x"] == nil, "never ourselves")
check(recipients["@b:x"] == ["B1", "B2"] && recipients["@c:x"] == ["C1"], "deduped devices")
check(WatchProtocol.recipients(devices, ownUserId: "@me:x", onlyUser: "@c:x") == ["@c:x": ["C1"]], "only one user")
let plainBody = WatchProtocol.plainMessages(["@b:x": ["B2"]], content: ["v": 1])
check(((plainBody["@b:x"] as? [String: Any])?["B2"] as? [String: Any])?["v"] as? Int == 1, "plain body shape")

// --- sync logic ---------------------------------------------------------------------------------

func shared(_ change: (inout SharedWatch) -> Void = { _ in }) -> SharedWatch {
    var s = SharedWatch(session: "abcdEFGH1234", videoId: ID, state: .playing, position: 100, rate: 1, ts: 10_000, seq: 1, sender: "@a:x")
    change(&s)
    return s
}
func sample(_ position: Double, _ state: Int, _ at: Double, rate: Double = 1, duration: Double? = nil) -> WatchPlayerSample {
    WatchPlayerSample(position: position, state: state, rate: rate, duration: duration, at: at)
}
typealias P = WatchPlayerState

do { // late joiner
    let c = WatchController()
    c.setShared(shared())
    let r = c.tick(sample(0, P.unstarted, 20_000), now: 20_000)
    check(r.commands == [.seek(110), .play] && r.change == nil, "late joiner seeks and plays: \(r)")
}
do { // drift
    let c = WatchController()
    c.setShared(shared())
    check(c.tick(sample(111.2, P.playing, 20_000), now: 20_000).commands.isEmpty, "small drift ignored")
    let c2 = WatchController()
    c2.setShared(shared())
    check(c2.tick(sample(108, P.playing, 20_000), now: 20_000).commands == [.seek(110)], "drift corrected")
}
do { // buffering stall
    let c = WatchController()
    c.setShared(shared { $0.ts = 20_000; $0.position = 110 })
    _ = c.tick(sample(110, P.playing, 20_000), now: 20_000)
    _ = c.tick(sample(110.2, P.buffering, 20_500), now: 20_500)
    _ = c.tick(sample(110.2, P.buffering, 21_000), now: 21_000)
    let r = c.tick(sample(110.2, P.buffering, 22_000), now: 22_000)
    check(r.change == nil && r.commands == [.seek(112)], "stall corrected, not a seek: \(r)")
}
do { // user seek
    let c = WatchController()
    c.setShared(shared { $0.ts = 20_000; $0.position = 110 })
    _ = c.tick(sample(110, P.playing, 20_000), now: 20_000)
    let r = c.tick(sample(300, P.buffering, 20_500), now: 20_500)
    check(r.change == WatchPatch(position: 300) && r.commands.isEmpty, "jump is a seek for everybody")
    let p = WatchController()
    p.setShared(shared { $0.state = .paused; $0.position = 50 })
    _ = p.tick(sample(50, P.paused, 20_000), now: 20_000)
    check(p.tick(sample(20, P.paused, 20_500), now: 20_500).change == WatchPatch(position: 20), "paused scrub back")
}
do { // start-up jumps
    let c = WatchController()
    c.setShared(shared { $0.ts = 20_000; $0.position = 45 })
    check(c.tick(sample(0, P.buffering, 20_000), now: 20_000).commands == [.seek(45)], "start-up seek")
    _ = c.tick(sample(0, P.buffering, 20_500), now: 20_500)
    _ = c.tick(sample(0, P.buffering, 21_000), now: 21_000)
    let r = c.tick(sample(30, P.playing, 21_500), now: 21_500)
    check(r.change == nil && r.commands == [.seek(46.5)], "start-up jump is not a user seek: \(r)")
}
do { // no echo
    let c = WatchController()
    c.setShared(shared { $0.ts = 20_000; $0.position = 110 })
    _ = c.tick(sample(110, P.playing, 20_000), now: 20_000)
    c.setShared(shared { $0.ts = 20_400; $0.position = 400; $0.seq = 2; $0.sender = "@b:x" })
    let r = c.tick(sample(110.4, P.playing, 20_500), now: 20_500)
    if case .seek(let to)? = r.commands.first, r.commands.count == 1 {
        check(abs(to - 400.1) < 1e-9, "follows remote seek")
    } else {
        check(false, "follows remote seek: \(r)")
    }
    check(c.tick(sample(400.2, P.playing, 21_000), now: 21_000).change == nil, "own seek not echoed")
    check(c.onPlayerState(P.buffering, position: 400, now: 21_000) == nil, "own state not echoed")
    check(c.tick(sample(401.7, P.playing, 23_000), now: 23_000).change == nil, "follows normally afterwards")
}
do { // play / pause
    let c = WatchController()
    c.setShared(shared())
    check(c.onPlayerState(P.paused, position: 105, now: 20_000) == WatchPatch(state: .paused, position: 105), "pause in player")
    check(c.onPlayerState(P.playing, position: 105, now: 20_000) == nil, "echo of playing")
    c.setShared(shared { $0.state = .paused })
    check(c.onPlayerState(P.playing, position: 100, now: 20_000) == WatchPatch(state: .playing, position: 100), "play in player")
    _ = c.tick(sample(100, P.playing, 20_000), now: 20_000)
    check(c.onPlayerState(P.playing, position: 100, now: 20_100) == nil, "suppressed after command")
    check(c.onPlayerRate(1.5, now: 20_100) == nil, "rate suppressed after command")
    check(c.onPlayerRate(1.5, now: 30_000) == WatchPatch(rate: 1.5), "rate change")
    check(c.onPlayerRate(16, now: 30_000) == nil, "rate out of range")
}
do { // follow shared state
    let c = WatchController()
    c.setShared(shared { $0.state = .paused })
    check(c.tick(sample(100, P.playing, 20_000, rate: 2), now: 20_000).commands == [.pause, .rate(1)], "pause and rate")
    let e = WatchController()
    e.setShared(shared())
    check(e.tick(sample(200, P.ended, 400_000, duration: 200), now: 400_000).commands.isEmpty, "end of video")
    let s = WatchController()
    s.setShared(shared { $0.state = .stopped })
    check(s.tick(sample(0, P.playing, 20_000), now: 20_000).commands.isEmpty, "stopped")
}
do { // autoplay retry
    let c = WatchController(playRetryMs: 2500)
    c.setShared(shared { $0.ts = 20_000; $0.position = 0 })
    check(c.tick(sample(0, P.unstarted, 20_000), now: 20_000).commands == [.play], "first play")
    check(c.tick(sample(0, P.unstarted, 20_000), now: 20_000).commands.isEmpty, "no immediate retry")
    let r = c.tick(sample(0, P.unstarted, 22_600), now: 22_600)
    if r.commands.count == 2, case .seek(let to) = r.commands[0], r.commands[1] == .play {
        check(abs(to - 2.6) < 1e-9, "retry seek")
    } else {
        check(false, "retry after 2.5 s: \(r)")
    }
}

// --- SponsorBlock -------------------------------------------------------------------------------

#if canImport(CryptoKit)
// sha256("dQw4w9WgXcQ") starts with 5f6b (checked with node:crypto)
check(WatchSponsorBlock.hashPrefix(ID).count == 4, "hash prefix length")
check(WatchSponsorBlock.hashPrefix(ID) == "5f6b", "hash prefix value: \(WatchSponsorBlock.hashPrefix(ID))")
#endif

let answer = json("""
[
  {"videoID": "otherVideo1", "segments": [{"category": "sponsor", "segment": [0, 50], "UUID": "x"}]},
  {"videoID": "\(ID)", "segments": [
    {"category": "selfpromo", "segment": [300, 320], "UUID": "b", "actionType": "skip"},
    {"category": "sponsor", "segment": [60, 90], "UUID": "a", "actionType": "skip"},
    {"category": "intro", "segment": [0, 10], "UUID": "c", "actionType": "skip"},
    {"category": "sponsor", "segment": [100, 120], "UUID": "d", "actionType": "mute"},
    {"category": "sponsor", "segment": [130, 130.5], "UUID": "e"},
    {"category": "sponsor", "segment": ["1", 20], "UUID": "f"},
    {"category": "sponsor", "segment": [5000000, 5000010], "UUID": "g"},
    {"category": "evil", "segment": [1, 20], "UUID": "h"}
  ]}
]
""")
let segs = WatchSponsorBlock.selectSegments(answer, videoId: ID, categories: WatchSponsorBlock.defaultCategories)
check(segs.map(\.uuid) == ["a", "b"] && segs.first?.start == 60 && segs.first?.end == 90, "segments picked: \(segs.map(\.uuid))")
check(WatchSponsorBlock.selectSegments(answer, videoId: ID, categories: ["intro"]).map(\.uuid) == ["c"], "intro only")
check(WatchSponsorBlock.selectSegments(json("{}"), videoId: ID, categories: ["sponsor"]).isEmpty, "not a list")
check(WatchSponsorBlock.selectSegments(answer, videoId: "nothingHere", categories: ["sponsor"]).isEmpty, "other video")

if let url = WatchSponsorBlock.requestURL(prefix: "5f6b", categories: ["sponsor", "evil"])?.absoluteString {
    check(url.hasPrefix("https://sponsor.ajay.app/api/skipSegments/5f6b?"), "request URL prefix")
    check(!url.contains(ID), "video id not sent")
    check(url.contains("categories=%5B%22sponsor%22%5D"), "categories JSON: \(url)")
    check(url.contains("actionTypes=%5B%22skip%22%5D"), "action types")
} else {
    check(false, "request URL builds")
}

do {
    var skipped = Set<String>()
    check(WatchSponsorBlock.segmentToSkip(segs, position: 50, skipped: &skipped) == nil, "before segment")
    check(WatchSponsorBlock.segmentToSkip(segs, position: 61, skipped: &skipped)?.uuid == "a", "in segment")
    skipped.insert("a")
    check(WatchSponsorBlock.segmentToSkip(segs, position: 70, skipped: &skipped) == nil, "skipped once")
    check(WatchSponsorBlock.segmentToSkip(segs, position: 89.8, skipped: &skipped) == nil, "end margin")
    check(WatchSponsorBlock.segmentToSkip(segs, position: 30, skipped: &skipped) == nil, "seek back")
    check(WatchSponsorBlock.segmentToSkip(segs, position: 61, skipped: &skipped)?.uuid == "a", "again after seeking back")
}
do {
    let sponsor = WatchSponsorBlock.selectSegments(answer, videoId: ID, categories: ["sponsor"])
    let c = WatchController()
    c.setShared(shared { $0.ts = 20_000; $0.position = 60.5 })
    let r = c.tick(sample(60.5, P.playing, 20_000), now: 20_000, segments: sponsor)
    check(r.commands == [.seek(90)] && r.change == WatchPatch(position: 90) && r.skipped?.uuid == "a", "controller skips: \(r)")
    c.setShared(shared { $0.ts = 20_000; $0.position = 90; $0.seq = 2 })
    check(c.tick(sample(91, P.playing, 21_000), now: 21_000, segments: sponsor).skipped == nil, "no second skip")
}

// --- preferences --------------------------------------------------------------------------------

check(WatchPrefs.decode(nil) == WatchPrefs(), "default prefs")
let prefs = WatchPrefs.decode(Data(#"{"enabled":false,"categories":["intro","evil","intro"],"volume":140.4,"muted":true,"quality":"hd720"}"#.utf8))
check(!prefs.enabled && prefs.categories == ["intro"] && prefs.volume == 100 && prefs.muted && prefs.quality == "hd720", "prefs read: \(prefs)")
check(WatchPrefs.decode(Data(#"{"enabled":1,"quality":"8k"}"#.utf8)) == WatchPrefs(), "bad prefs ignored")
check(WatchPrefs.decode(prefs.encode()) == prefs, "prefs round trip")

if failures == 0 {
    print("watchtogether_check: all checks passed")
} else {
    print("watchtogether_check: \(failures) failure(s)")
    exit(1)
}
