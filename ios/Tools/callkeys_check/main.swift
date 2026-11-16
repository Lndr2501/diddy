// Checks for the call media key rules (Diddy/Call/CallKeyLogic.swift). Foundation only.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Call/CallKeyLogic.swift Tools/callkeys_check/main.swift -o /tmp/callkeys_check && /tmp/callkeys_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
typealias K = CallKeyLogic

let now: UInt64 = 1_800_000_000_000
let hour: UInt64 = 60 * 60 * 1000

func membership(device: String = "DEV", created: UInt64? = nil, expires: UInt64? = nil,
                application: String = "m.call", callId: String = "", scope: String? = "m.room",
                focus: String? = #"{"type":"livekit","focus_selection":"oldest_membership"}"#,
                preferred: String = #"[{"type":"livekit","livekit_service_url":"https://lk.hs"}]"#) -> String {
    var parts = [
        #""application":"\#(application)""#,
        #""call_id":"\#(callId)""#,
        #""device_id":"\#(device)""#,
        #""foci_preferred":\#(preferred)"#,
    ]
    if let scope { parts.append(#""scope":"\#(scope)""#) }
    if let focus { parts.append(#""focus_active":\#(focus)"#) }
    if let created { parts.append(#""created_ts":\#(created)"#) }
    if let expires { parts.append(#""expires":\#(expires)"#) }
    return "{" + parts.joined(separator: ",") + "}"
}

func event(_ sender: String, _ device: String, content: String? = nil, stateKey: String? = nil,
           ts: UInt64? = now - 1000) -> CallMemberEvent {
    CallMemberEvent(sender: sender, stateKey: stateKey ?? "_\(sender)_\(device)_m.call",
                    contentJson: content ?? membership(device: device), timestamp: ts)
}

let alice = CallDevice(userId: "@alice:hs", deviceId: "A1")
let bob = CallDevice(userId: "@bob:hs", deviceId: "B1")
let meDesk = CallDevice(userId: "@me:hs", deviceId: "DESK")
let mePhone = CallDevice(userId: "@me:hs", deviceId: "PHONE")

// MARK: Memberships

check(alice.identity == "@alice:hs:A1", "LiveKit identity of a legacy member")
let live = K.member(of: event("@alice:hs", "A1"), now: now)
check(live?.device == alice && live?.createdTs == now - 1000, "live membership, created at the event time")
check(K.member(of: event("@alice:hs", "A1", content: "{}"), now: now) == nil, "empty content = left")
check(K.member(of: event("@alice:hs", "A1", content: "not json"), now: now) == nil, "garbage")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", application: "m.other")), now: now) == nil, "other application")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", callId: "abc")), now: now) == nil, "other call in the room")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", scope: "m.user")), now: now) == nil, "other scope")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", scope: nil)), now: now) != nil, "no scope means the room")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "")), now: now) == nil, "no device")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", focus: #"{"type":"jitsi"}"#)), now: now) == nil, "other focus")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", focus: nil)), now: now) != nil, "no active focus, LiveKit preferred")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", focus: nil, preferred: #"[{"type":"jitsi"}]"#)), now: now) == nil, "no LiveKit focus at all")

// expiry: created_ts (or the event time) + expires (4 h by default)
check(K.member(of: event("@alice:hs", "A1", ts: now - 4 * hour - 1), now: now) == nil, "expired after the default 4 h")
check(K.member(of: event("@alice:hs", "A1", ts: now - 4 * hour + 1000), now: now) != nil, "still live just before 4 h")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", created: now - 2 * hour, expires: hour)), now: now) == nil, "own expiry ran out")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", created: now - 5 * hour, expires: 6 * hour)), now: now)?.createdTs == now - 5 * hour,
      "refreshed membership: created_ts counts, expires grew")
check(K.member(of: event("@alice:hs", "A1", ts: nil), now: now) == nil, "no time at all (stripped state)")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", created: now - hour), ts: nil), now: now) != nil, "created_ts without event time")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "A1", created: now, expires: UInt64.max)), now: now) != nil, "huge expiry does not overflow")

// whose membership it is
check(K.member(of: event("@mallory:hs", "A1", stateKey: "_@alice:hs_A1_m.call"), now: now) == nil, "someone else's state key")
check(K.member(of: event("@alice:hs", "A1", stateKey: "@alice:hs_A1"), now: now) != nil, "state key without underscore prefix")
check(K.member(of: event("@alice:hs", "A1", stateKey: "@alice:hs"), now: now) != nil, "user id as state key")
check(K.member(of: event("@alice:hs", "A1", stateKey: "@alice:hs.evil_A1"), now: now) == nil, "a longer user id is someone else")
check(K.member(of: event("alice", "A1", stateKey: "alice"), now: now) == nil, "no user id")
check(K.member(of: event("@alice:hs", "A1", content: membership(device: "X9")), now: now)?.device == CallDevice(userId: "@alice:hs", deviceId: "X9"),
      "the device comes from the content, the user from the sender")

let members = K.members([
    event("@alice:hs", "A1"),
    event("@bob:hs", "B1", content: "{}"),
    event("@me:hs", "DESK"),
    event("@me:hs", "PHONE", ts: now - 5 * hour),
    event("@alice:hs", "A1", stateKey: "@alice:hs_A1", ts: now - 500),
], now: now)
check(members == [alice: now - 500, meDesk: now - 1000], "left, expired and duplicate devices (newer wins)")

// MARK: Who gets the key

let everyone = [alice, bob, meDesk, mePhone]
let toPhone = K.recipients(everyone, excluding: mePhone)
check(toPhone == ["@alice:hs": ["A1"], "@bob:hs": ["B1"], "@me:hs": ["DESK"]], "everyone but this device, own computer included (1.11.0)")
check(K.recipients([alice, alice], excluding: mePhone) == ["@alice:hs": ["A1"]], "each device once")
check(K.recipients([mePhone], excluding: mePhone).isEmpty, "alone: nobody")
check(K.recipients([meDesk, mePhone, CallDevice(userId: "@me:hs", deviceId: "IPAD")], excluding: mePhone)["@me:hs"] == ["DESK", "IPAD"], "several own devices, sorted")

// a LiveKit participant without a membership is not in `members`, so it never gets the key
let liveKitOnly = CallDevice(userId: "@eve:hs", deviceId: "E1")
check(K.recipients(Array(members.keys), excluding: mePhone)["@eve:hs"] == nil && members[liveKitOnly] == nil, "no membership, no key")

// MARK: Rotation

let shared: [CallDevice: UInt64] = [alice: 10, bob: 20, meDesk: 30]
check(!K.needsNewKey(sharedWith: shared, members: shared), "nobody left")
check(!K.needsNewKey(sharedWith: shared, members: shared.merging([mePhone: 40]) { a, _ in a }), "someone joined: no new key")
check(K.needsNewKey(sharedWith: shared, members: [alice: 10, meDesk: 30]), "bob left")
check(K.needsNewKey(sharedWith: shared, members: [alice: 10, bob: 99, meDesk: 30]), "bob left and came back")
check(K.needsNewKey(sharedWith: shared, members: [alice: 10, bob: 20]), "own computer left: new key too")
check(!K.needsNewKey(sharedWith: [:], members: shared), "first key: nothing to rotate")
check(K.waitingForKey(sharedWith: shared, members: shared.merging([mePhone: 40]) { a, _ in a }) == [mePhone], "the new device gets the current key")
check(K.waitingForKey(sharedWith: [:], members: [bob: 1, alice: 2]) == [alice, bob], "first key: everyone, sorted")
check(K.waitingForKey(sharedWith: shared, members: [alice: 10, bob: 99]) == [bob], "came back: needs it again")
check(K.waitingForKey(sharedWith: shared, members: shared).isEmpty, "everyone has it")

// key slots: LiveKit 2.18 encrypts with slot 0 only, so a new key replaces it, without delay
check(K.nextKeyIndex(after: 0, senderFollowsKeyIndex: false) == 0, "2.18: always slot 0")
check(K.nextKeyIndex(after: 7, senderFollowsKeyIndex: false) == 0, "2.18: back to slot 0")
check(K.useDelayMs(senderFollowsKeyIndex: false) == 0, "2.18: used right away")
check(K.nextKeyIndex(after: 0, senderFollowsKeyIndex: true) == 1, "Element Call: next slot")
check(K.nextKeyIndex(after: 255, senderFollowsKeyIndex: true) == 0, "Element Call: wraps at 256")
check(K.useDelayMs(senderFollowsKeyIndex: true) == 1000, "Element Call: 1 s before use")

// MARK: Call header

check(K.encryption(roomEncrypted: false, remote: ["@a:hs:A"], keysFrom: []) == .off, "unencrypted room")
check(K.encryption(roomEncrypted: true, remote: [], keysFrom: []) == .on, "alone and encrypted")
check(K.encryption(roomEncrypted: true, remote: ["@a:hs:A", "@me:hs:DESK"], keysFrom: ["@a:hs:A", "@me:hs:DESK", "@gone:hs:G"]) == .on, "all keys there")
check(K.encryption(roomEncrypted: true, remote: ["@a:hs:A", "@b:hs:B", "@b:hs:B"], keysFrom: ["@a:hs:A"]) == .waiting(1), "one key missing, counted per device")
check(K.title(.off) == "Not encrypted" && K.title(.on) == "End-to-end encrypted", "titles")
check(K.detail(.waiting(1)).contains("1 device;") && K.detail(.waiting(2)).contains("2 devices"), "detail counts devices")

if failures > 0 { print("\(failures) call key check(s) failed"); exit(1) }
print("call key checks passed")
