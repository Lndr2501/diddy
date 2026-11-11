// Checks for the call audio rules (Diddy/Call/CallAudioLogic.swift, CallVolumeMemory.swift,
// CallReactionLogic.swift and the receive side of AgentVoice.swift). Foundation only.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Call/CallAudioLogic.swift Diddy/Call/CallVolumeMemory.swift Diddy/Call/CallReactionLogic.swift Diddy/Call/AgentVoice.swift Tools/call_audio_check/main.swift -o /tmp/call_audio_check && /tmp/call_audio_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

// MARK: SpeakerHold

var hold = SpeakerHold()
check(hold.update(["@a:x"], now: 0) == ["@a:x"], "speaking shows at once")
check(hold.update([], now: 0.3) == ["@a:x"], "still held 0.3 s later")
check(hold.update([], now: 0.59) == ["@a:x"], "still held just before 0.6 s")
check(hold.update([], now: 0.7).isEmpty, "let go after 0.6 s")
check(hold.update(["@a:x"], now: 1.0) == ["@a:x"], "speaks again")
check(hold.update(["@a:x"], now: 1.2) == ["@a:x"], "keeps speaking")
check(hold.update([], now: 1.5) == ["@a:x"], "held after the last speaking moment, not the first")
if let left = hold.expiresIn(now: 1.5) { check(abs(left - 0.3) < 0.001, "expires in 0.3 s (got \(left))") } else { check(false, "has an expiry") }
_ = hold.update([], now: 2.0)
check(hold.expiresIn(now: 2.0) == nil, "nothing left to expire")
_ = hold.update(["@a:x", "@b:x"], now: 3)
check(hold.update(["@b:x"], now: 3.1) == ["@a:x", "@b:x"], "two people, one held")
hold.reset()
check(hold.update([], now: 3.2).isEmpty, "reset forgets everyone")

// MARK: VoiceActivity

check(VoiceActivity.levelDb(rms: 0) == VoiceActivity.silenceDb, "silence")
check(abs(VoiceActivity.levelDb(rms: 1) - 0) < 0.001, "full scale is 0 dB")
check(abs(VoiceActivity.levelDb(rms: 0.1) - (-20)) < 0.001, "0.1 is -20 dB")
check(VoiceActivity.levelDb(rms: .nan) == VoiceActivity.silenceDb, "NaN is silence")
var activity = VoiceActivity()
check(!activity.update(db: -60, now: 0), "quiet is not talking")
check(activity.update(db: -40, now: 0.1), "loud is talking")
check(activity.update(db: -50, now: 0.2), "between the thresholds keeps talking")
check(activity.update(db: -80, now: 0.4), "short pause keeps talking")
check(!activity.update(db: -80, now: 0.7), "long pause stops")
check(!activity.update(db: -50, now: 0.8), "between the thresholds does not start")
activity.reset()
check(!activity.speaking, "reset")

// MARK: CallPing

check(CallPing.bars(forMs: 20) == 3, "20 ms is good")
check(CallPing.bars(forMs: 99) == 3, "99 ms is good")
check(CallPing.bars(forMs: 100) == 2, "100 ms is ok")
check(CallPing.bars(forMs: 249) == 2, "249 ms is ok")
check(CallPing.bars(forMs: 250) == 1, "250 ms is poor")
check(CallPing.label(ms: nil) == "Measuring ping", "no ping yet")
check(CallPing.label(ms: 42) == "Ping 42 ms", "ping label")
check(CallPing.roundTripMs([0.2, 0.05, 0.1]) == 50, "smallest round trip wins")
check(CallPing.roundTripMs([0, -1, .nan]) == nil, "no valid round trip")
check(CallPing.roundTripMs([]) == nil, "empty")

// MARK: CallSwitchText

check(CallSwitchText.title == "Leave your current call?", "switch title")
check(CallSwitchText.message(currentName: "Lobby", targetName: "Games", action: .join) == "You're in a call in Lobby. Joining Games will end it for you.", "join message")
check(CallSwitchText.message(currentName: "Lobby", targetName: "Ann", action: .call).contains("Calling Ann"), "call message")
check(CallSwitchText.confirm(.join) == "Leave and join" && CallSwitchText.confirm(.call) == "Leave and call", "confirm labels")

// MARK: CustomSoundRules

check(CustomSoundRules.problem(byteCount: 800 * 1024) == nil, "800 KB is fine")
check(CustomSoundRules.problem(byteCount: 800 * 1024 + 1) != nil, "800 KB + 1 is too large")
check(CustomSoundRules.problem(byteCount: 0) != nil, "empty file")

// MARK: CallVolumeMemory

final class MemoryStorage: CallVolumeStorage {
    var values: [String: Data] = [:]
    func data(forKey key: String) -> Data? { values[key] }
    func set(_ data: Data?, forKey key: String) { values[key] = data }
}

let store = MemoryStorage()
let voices = CallVolumeMemory(storage: store, kind: .voice)
check(voices.playbackLevel("@a:x") == 1, "default 100 %")
voices.setLevel("@a:x", 1.5)
check(voices.playbackLevel("@a:x") == 1.5, "boosted to 150 %")
voices.setLevel("@a:x", 5)
check(voices.playbackLevel("@a:x") == 2, "capped at 200 %")
voices.setLevel("@a:x", 0.6)
voices.toggleMuted("@a:x")
check(voices.playbackLevel("@a:x") == 0, "muted for me")
voices.toggleMuted("@a:x")
check(voices.playbackLevel("@a:x") == 0.6, "unmute returns to the level")
voices.setLevel("@a:x", 0)
check(voices.playbackLevel("@a:x") == 0 && voices.remembered("@a:x")?.volume == 0.6, "slider to 0 mutes and keeps the level")
voices.setLevel("@a:x", 1)
check(voices.remembered("@a:x") == nil, "100 % and not muted is not stored")
voices.remember("not-a-user", RememberedVolume(volume: 0.5, muted: false))
check(voices.all().isEmpty, "ids that are not users are ignored")

let streams = CallVolumeMemory(storage: store, kind: .stream)
streams.setLevel("@a:x", 1.8)
check(streams.playbackLevel("@a:x") == 1, "stream volume is capped at 100 %")
streams.setLevel("@a:x", 0.4)
check(streams.playbackLevel("@a:x") == 0.4, "stream volume")
check(voices.remembered("@a:x") == nil, "voices and streams are separate")

// Order of use and the limit.
let small = CallVolumeMemory(storage: MemoryStorage(), kind: .voice, max: 3)
for (index, name) in ["@a:x", "@b:x", "@c:x", "@d:x"].enumerated() { small.setLevel(name, 0.5 + Double(index) / 10) }
check(small.all().map { $0.userId } == ["@b:x", "@c:x", "@d:x"], "the oldest is dropped beyond the limit")
small.setLevel("@b:x", 0.9)
check(small.all().map { $0.userId } == ["@c:x", "@d:x", "@b:x"], "a changed person becomes the newest")

// Broken storage never crashes and reads as empty.
let broken = MemoryStorage()
broken.values["diddyUserVolumes"] = Data("not json".utf8)
check(CallVolumeMemory(storage: broken, kind: .voice).all().isEmpty, "broken data reads as empty")
broken.values["diddyUserVolumes"] = Data(#"[{"user":"@a:x","volume":-3,"muted":false},{"user":"x","volume":1.5,"muted":false},{"user":"@b:x","volume":1.5,"muted":true}]"#.utf8)
let cleaned = CallVolumeMemory(storage: broken, kind: .voice).all()
check(cleaned.count == 1 && cleaned[0].userId == "@b:x" && cleaned[0].entry.muted, "invalid entries are skipped")

CallVolumeMemory.clearAll(store)
check(store.values.isEmpty, "reset volumes clears both stores")

// MARK: Call reactions

check(CallReactions.eventType == "io.element.call.reaction", "event type")
check(CallReactions.options.count == 16, "16 reactions")
check(Set(CallReactions.options.map(\.name)).count == 16, "names are unique")
if let thumbs = CallReactions.options.first, let json = CallReactions.content(for: thumbs, membershipEventId: "$mem"),
   let object = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] {
    check(object["emoji"] as? String == "\u{1F44D}" && object["name"] as? String == "thumbsup", "reaction content")
    let relation = object["m.relates_to"] as? [String: Any]
    check(relation?["rel_type"] as? String == "m.reference" && relation?["event_id"] as? String == "$mem", "reaction relates to the membership")
} else { check(false, "reaction content builds") }

func event(sender: String = "@a:x", type: String = CallReactions.eventType, content: String) -> String {
    #"{"type":"\#(type)","sender":"\#(sender)","origin_server_ts":1700000000000,"content":\#(content)}"#
}
let good = event(content: #"{"m.relates_to":{"rel_type":"m.reference","event_id":"$m"},"emoji":"\#u{1F44E}","name":"thumbsdown"}"#)
check(CallReactions.parse(eventJson: good)?.emoji == "\u{1F44E}" && CallReactions.parse(eventJson: good)?.sender == "@a:x", "parse a reaction")
let renamed = event(content: #"{"m.relates_to":{"rel_type":"m.reference","event_id":"$m"},"emoji":"x","name":"party"}"#)
check(CallReactions.parse(eventJson: renamed)?.emoji == "\u{1F389}", "a known name shows its own emoji")
let custom = event(content: #"{"m.relates_to":{"rel_type":"m.reference","event_id":"$m"},"emoji":"\#u{1F680}\#u{1F680}"}"#)
check(CallReactions.parse(eventJson: custom)?.emoji == "\u{1F680}", "only the first character counts")
check(CallReactions.parse(eventJson: event(type: "m.room.message", content: #"{"body":"x"}"#)) == nil, "other events are ignored")
check(CallReactions.parse(eventJson: event(content: #"{"emoji":"\#u{1F44D}"}"#)) == nil, "no relation")
check(CallReactions.parse(eventJson: event(content: #"{"m.relates_to":{"rel_type":"m.annotation","event_id":"$m"},"emoji":"\#u{1F44D}"}"#)) == nil, "wrong relation type")
check(CallReactions.parse(eventJson: event(content: #"{"m.relates_to":{"rel_type":"m.reference","event_id":"$m"},"emoji":"  "}"#)) == nil, "blank emoji")
check(CallReactions.parse(eventJson: event(sender: "bad", content: #"{"m.relates_to":{"rel_type":"m.reference","event_id":"$m"},"emoji":"\#u{1F44D}"}"#)) == nil, "bad sender")
check(CallReactions.parse(eventJson: "not json") == nil, "not json")
check(CallReactions.parse(sender: "@a:x", contentJson: #"{"m.relates_to":{"rel_type":"m.reference","event_id":"$m"},"emoji":"\#u{1F44D}","name":"thumbsup"}"#)?.emoji == "\u{1F44D}", "parse the content only")
check(CallReactions.parse(sender: "@a:x", contentJson: "{}") == nil, "empty content")

var shown = ActiveCallReactions()
check(shown.add(sender: "@a:x", emoji: "\u{1F44D}", now: 10), "first reaction shows")
check(!shown.add(sender: "@a:x", emoji: "\u{1F389}", now: 11), "a second one of the same person is ignored while showing")
check(shown.emoji(for: "@a:x") == "\u{1F44D}", "first stays")
check(shown.add(sender: "@b:x", emoji: "\u{1F389}", now: 11), "another person is independent")
check(!shown.prune(now: 12), "nothing expired yet")
check(shown.prune(now: 13.5) && shown.emoji(for: "@a:x") == nil && shown.emoji(for: "@b:x") != nil, "a expires after 3 s, b not yet")
check(shown.add(sender: "@a:x", emoji: "\u{1F389}", now: 13.6), "shows again after expiry")
_ = shown.prune(now: 100)
check(shown.isEmpty, "all gone")

// MARK: Desktop agent talkers (receive side only)

check(AgentVoicePayload.parse(#"{"room_id":"!r:x","active":true,"ts":1000}"#) == AgentVoicePayload(roomId: "!r:x", active: true, ts: 1000), "parse a payload")
check(AgentVoicePayload.parse(#"{"room_id":"r:x","active":true,"ts":1000}"#) == nil, "room id must start with !")
check(AgentVoicePayload.parse(#"{"room_id":"!r:x","active":1,"ts":1000}"#) == nil, "active must be a boolean")
check(AgentVoicePayload.parse(#"{"room_id":"!r:x","active":true,"ts":true}"#) == nil, "ts must not be a boolean")
check(AgentVoicePayload.parse("nope") == nil, "not json")
var talkers = RemoteAgentVoices()
let start = Date()
check(talkers.receive(sender: "@a:x", payload: AgentVoicePayload(roomId: "!r:x", active: true, ts: 10), roomId: "!r:x", now: start), "a starts")
check(talkers.users == ["@a:x"], "a is talking")
check(!talkers.receive(sender: "@a:x", payload: AgentVoicePayload(roomId: "!r:x", active: false, ts: 5), roomId: "!r:x", now: start), "an older message is ignored")
check(!talkers.receive(sender: "@b:x", payload: AgentVoicePayload(roomId: "!other:x", active: true, ts: 10), roomId: "!r:x", now: start), "another room is ignored")
check(talkers.receive(sender: "@a:x", payload: AgentVoicePayload(roomId: "!r:x", active: false, ts: 20), roomId: "!r:x", now: start), "a stops")
check(talkers.users.isEmpty, "nobody talks")
_ = talkers.receive(sender: "@a:x", payload: AgentVoicePayload(roomId: "!r:x", active: true, ts: 30), roomId: "!r:x", now: start)
check(!talkers.prune(members: ["@a:x"], now: start.addingTimeInterval(60)), "still talking after a minute")
check(talkers.prune(members: ["@a:x"], now: start.addingTimeInterval(AgentVoice.maxActive + 1)) && talkers.users.isEmpty, "expires after 5 minutes")
_ = talkers.receive(sender: "@a:x", payload: AgentVoicePayload(roomId: "!r:x", active: true, ts: 40), roomId: "!r:x", now: start)
check(talkers.prune(members: [], now: start) && talkers.users.isEmpty, "someone who left the call stops talking")

if failures == 0 { print("call audio checks passed") } else { print("\(failures) check(s) failed"); exit(1) }
