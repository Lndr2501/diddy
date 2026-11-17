import Foundation

// Checks RoomRetention against the cases desktop and Android share (docs/fixtures/retention.json).
// Run from ios/: swiftc Diddy/Matrix/RoomRetention.swift Tools/retention_check/main.swift
var failures = 0
func check(_ ok: Bool, _ message: @autoclosure () -> String) {
    if !ok { failures += 1; print("FAIL: \(message())") }
}

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "../docs/fixtures/retention.json"
let data = try Data(contentsOf: URL(fileURLWithPath: path))
let fixtures = try JSONSerialization.jsonObject(with: data) as! [String: Any]
func int64(_ value: Any?) -> Int64? { (value as? NSNumber).map { $0.int64Value } }

for case let item as [String: Any] in fixtures["lifetime"] as! [Any] {
    let got = RoomRetention.lifetime(item["content"] as? [String: Any])
    check(got == int64(item["lifetime"]), "lifetime \(String(describing: item["content"])) -> \(String(describing: got))")
}
for case let item as [String: Any] in fixtures["expired"] as! [Any] {
    let got = RoomRetention.isExpired(ts: int64(item["ts"])!, lifetime: int64(item["lifetime"]), now: int64(item["now"])!)
    check(got == (item["expired"] as! Bool), "expired \(item)")
}
for case let item as [String: Any] in fixtures["label"] as! [Any] {
    let got = RoomRetention.label(int64(item["lifetime"])!)
    check(got.unit.rawValue == item["unit"] as! String && got.count == int64(item["count"])!, "label \(item) -> \(got)")
}
check(RoomRetention.choices == (fixtures["choices"] as! [Any]).compactMap(int64), "choices")
check(RoomRetention.lifetime(RoomRetention.content(86_400_000)) == 86_400_000, "content round trip")
check(RoomRetention.content(nil).isEmpty, "off is an empty content")
check(RoomRetention.lifetime(["max_lifetime": true]) == nil, "a boolean is no lifetime")

if failures > 0 { print("\(failures) retention check(s) failed"); exit(1) }
print("retention: all checks passed")
