// Checks for Diddy/Call/CompanionProtocol.swift. Run from the ios folder:
//   swiftc Diddy/Call/CompanionProtocol.swift Tools/companion_check/main.swift -o /tmp/companion_check && /tmp/companion_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
typealias C = CompanionProtocol

let request = C.parseRequest(#"{"v":1,"request_id":"r1","room_id":"!abc:hs","room_name":" Gaming ","device_id":"DESK","camera":true,"microphone":true,"screen":false}"#)
check(request?.id == "r1" && request?.roomId == "!abc:hs" && request?.deviceId == "DESK", "request read")
check(request?.roomName == "Gaming", "name trimmed")
check(request?.media == C.Media(camera: true, microphone: true, screen: false), "media read")
check(C.parseRequest(#"{"v":2,"request_id":"r","room_id":"!a:b","device_id":"D","camera":true}"#) == nil, "other version refused")
check(C.parseRequest(#"{"v":1,"request_id":"r","room_id":"#alias:b","device_id":"D","camera":true}"#) == nil, "room alias refused")
check(C.parseRequest(#"{"v":1,"request_id":"r","room_id":"!a:b","device_id":"D"}"#) == nil, "nothing to send refused")
check(C.parseRequest("not json") == nil, "garbage refused")
check(C.parseRequest(#"{"v":1,"request_id":"","room_id":"!a:b","device_id":"D","camera":true}"#) == nil, "empty id refused")

let control = C.parseControl(#"{"v":1,"request_id":"r1","microphone":false}"#)
check(control?.requestId == "r1" && control?.microphone == false && control?.camera == nil && control?.end == false, "control read")
check(C.parseControl(#"{"v":1,"request_id":"r1","end":true}"#)?.end == true, "end read")
check(C.parseControl(#"{"request_id":"r1"}"#) == nil, "control without version refused")

let state = C.state(requestId: "r1", deviceId: "PHONE", joined: true, media: C.Media(camera: false, microphone: true, screen: true))
let parsed = (try? JSONSerialization.jsonObject(with: Data(state.utf8))) as? [String: Any]
check(parsed?["joined"] as? Bool == true && parsed?["device_id"] as? String == "PHONE", "state written")
check(parsed?["microphone"] as? Bool == true && parsed?["camera"] as? Bool == false && parsed?["screen"] as? Bool == true, "state media")
check((parsed?["v"] as? NSNumber)?.intValue == 1, "state version")

check(C.accepts(sender: "@me:hs", ownUserId: "@me:hs", encrypted: true, requestDevice: "DESK", ownDeviceId: "PHONE"), "own other device accepted")
check(!C.accepts(sender: "@other:hs", ownUserId: "@me:hs", encrypted: true, requestDevice: "DESK", ownDeviceId: "PHONE"), "someone else refused")
check(!C.accepts(sender: "@me:hs", ownUserId: "@me:hs", encrypted: false, requestDevice: "DESK", ownDeviceId: "PHONE"), "unencrypted refused")
check(!C.accepts(sender: "@me:hs", ownUserId: "@me:hs", encrypted: true, requestDevice: "PHONE", ownDeviceId: "PHONE"), "own device refused")

if failures > 0 { print("\(failures) companion check(s) failed"); exit(1) }
print("companion checks passed")
