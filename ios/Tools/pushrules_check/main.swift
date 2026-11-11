// Checks for Diddy/Matrix/PushRuleLogic.swift (notification levels like desktop). Foundation only.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/PushRuleLogic.swift Tools/pushrules_check/main.swift -o /tmp/pushrules_check && /tmp/pushrules_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

/// Compares JSON values by their sorted serialization.
func json(_ value: Any) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return "?" }
    return String(decoding: data, as: UTF8.self)
}

// Actions per level, exactly desktop's getNotificationModeActions.
check(json(PushRuleLogic.actions(for: .off, highlight: true)) == "[]", "off has no actions")
check(json(PushRuleLogic.actions(for: .silent, highlight: false)) == #"["notify"]"#, "silent")
check(json(PushRuleLogic.actions(for: .loud, highlight: false)) == #"["notify",{"set_tweak":"sound","value":"default"}]"#,
      "loud: \(json(PushRuleLogic.actions(for: .loud, highlight: false)))")
check(json(PushRuleLogic.actions(for: .loud, highlight: true)) == #"["notify",{"set_tweak":"sound","value":"default"},{"set_tweak":"highlight","value":true}]"#,
      "loud with highlight")
check(json(PushRuleLogic.actions(for: .silent, highlight: true)) == #"["notify",{"set_tweak":"highlight","value":true}]"#,
      "silent with highlight")

// Reading levels back, including what other clients write.
for level in NotificationLevel.allCases {
    check(PushRuleLogic.level(of: PushRuleLogic.actions(for: level, highlight: true)) == level, "round trip \(level)")
    check(PushRuleLogic.level(of: PushRuleLogic.actions(for: level, highlight: false)) == level, "round trip \(level) without highlight")
}
check(PushRuleLogic.level(of: ["dont_notify"]) == .off, "dont_notify is off")
check(PushRuleLogic.level(of: ["notify", ["set_tweak": "sound", "value": "ring"]]) == .loud, "any sound is loud")
check(PushRuleLogic.level(of: [["set_tweak": "sound", "value": "default"]]) == .off, "a sound without notify is off")
check(PushRuleLogic.level(of: ["coalesce", "notify"]) == .silent, "unknown actions are ignored")

// A push rules answer like Synapse's.
let sound: [String: Any] = ["set_tweak": "sound", "value": "default"]
let highlight: [String: Any] = ["set_tweak": "highlight", "value": true]
func rule(_ id: String, isDefault: Bool, actions: [Any], pattern: String? = nil) -> [String: Any] {
    var raw: [String: Any] = ["rule_id": id, "default": isDefault, "enabled": true, "actions": actions]
    if let pattern { raw["pattern"] = pattern }
    return raw
}
let overrideRules: [[String: Any]] = [
    rule(".m.rule.master", isDefault: true, actions: []),
    rule(".m.rule.is_user_mention", isDefault: true, actions: ["notify", ["set_tweak": "highlight"], sound]),
    rule(".m.rule.is_room_mention", isDefault: true, actions: []),
]
var noPattern = rule("no pattern", isDefault: false, actions: ["notify"])
noPattern["pattern"] = nil
let content: [[String: Any]] = [
    rule(".m.rule.contains_user_name", isDefault: true, actions: ["notify"], pattern: "lndr"),
    rule("diddy", isDefault: false, actions: ["notify", highlight], pattern: "diddy"),
    noPattern,
    rule("ümlaut & co", isDefault: false, actions: [], pattern: "ümlaut & co"),
]
let underride: [[String: Any]] = [
    rule(".m.rule.room_one_to_one", isDefault: true, actions: ["notify", sound]),
    rule(".m.rule.message", isDefault: true, actions: ["notify"]),
]
let global: [String: Any] = ["override": overrideRules, "content": content, "underride": underride]
let rules: [String: Any] = ["global": global]

check(PushRuleLogic.find(PushRuleLogic.isUserMention, in: rules)?.level == .loud, "user mention is loud")
check(PushRuleLogic.find(PushRuleLogic.isUserMention, in: rules)?.kind == "override", "user mention is an override")
check(PushRuleLogic.find(PushRuleLogic.containsUserName, in: rules)?.kind == "content", "user name is a content rule")
check(PushRuleLogic.find(PushRuleLogic.message, in: rules)?.level == .silent, "rooms are silent here")
check(PushRuleLogic.find(PushRuleLogic.isRoomMention, in: rules)?.level == .off, "@room mention is off here")
check(PushRuleLogic.find(".m.rule.nothing", in: rules) == nil, "missing rule")
check(PushRuleLogic.find(PushRuleLogic.message, in: [:]) == nil, "empty answer")

// Defaults when the server has no such rule, like desktop's default rule data.
let encrypted = PushRuleLogic.allMessages[3].spec
check(encrypted.ruleId == ".m.rule.encrypted", "4th all-messages row is encrypted rooms")
let resolvedEncrypted = PushRuleLogic.resolve(encrypted, in: rules)
check(resolvedEncrypted.kind == "underride" && resolvedEncrypted.level == .loud, "missing encrypted rule: underride, loud")
let atRoom = PushRuleLogic.mentions[4].spec
check(atRoom.ruleId == ".m.rule.roomnotif", "last mention row is Contains @room")
let resolvedAtRoom = PushRuleLogic.resolve(atRoom, in: rules)
check(resolvedAtRoom.kind == "override" && resolvedAtRoom.level == .silent, "missing @room rule: override, silent")
let resolvedMention = PushRuleLogic.resolve(PushRuleLogic.mentions[0].spec, in: rules)
check(resolvedMention.kind == "override" && resolvedMention.level == .loud, "found rule wins")
check(PushRuleLogic.allMessages.allSatisfy { !$0.spec.highlight }, "all messages never highlight")
check(PushRuleLogic.mentions.allSatisfy { $0.spec.highlight }, "mentions always highlight")
check(PushRuleLogic.allMessages.map(\.title) == ["1-to-1 Chats", "1-to-1 Chats (Encrypted)", "Rooms", "Rooms (Encrypted)"], "titles")

// Keywords: only own content rules with a pattern.
let keywords = PushRuleLogic.keywords(in: rules)
check(keywords.map(\.ruleId) == ["diddy", "ümlaut & co"], "keywords: \(keywords.map(\.ruleId))")
check(keywords.first?.level == .silent, "keyword level")
check(json(PushRuleLogic.keywordBody("hi")) == #"{"actions":["notify",{"set_tweak":"highlight","value":true}],"pattern":"hi"}"#,
      "new keyword body: \(json(PushRuleLogic.keywordBody("hi")))")

// Paths escape the rule id.
check(PushRuleLogic.path(kind: "override", ruleId: ".m.rule.is_user_mention") == "/_matrix/client/v3/pushrules/global/override/.m.rule.is_user_mention", "path")
check(PushRuleLogic.path(kind: "content", ruleId: "a/b c?") == "/_matrix/client/v3/pushrules/global/content/a%2Fb%20c%3F", "escaped path: \(PushRuleLogic.path(kind: "content", ruleId: "a/b c?"))")

// Email notifications.
let threepids: [[String: Any]] = [
    ["medium": "msisdn", "address": "4912345"],
    ["medium": "email", "address": "a@example.org"],
    ["medium": "email", "address": "b@example.org"],
]
check(PushRuleLogic.emailState(threepids: [], pushers: []) == PushRuleLogic.EmailState(email: nil, enabled: false), "no email")
check(PushRuleLogic.emailState(threepids: threepids, pushers: []) == PushRuleLogic.EmailState(email: "a@example.org", enabled: false), "first address, off")
check(PushRuleLogic.emailState(threepids: threepids, pushers: [["app_id": "m.email", "pushkey": "b@example.org"]]) == PushRuleLogic.EmailState(email: "b@example.org", enabled: true), "pusher on second address")
check(PushRuleLogic.emailState(threepids: threepids, pushers: [["app_id": "m.email", "pushkey": "old@example.org"]]) == PushRuleLogic.EmailState(email: "a@example.org", enabled: false), "pusher for an address no longer on the account")
check(PushRuleLogic.emailState(threepids: threepids, pushers: [["app_id": "dev.diddy", "pushkey": "a@example.org"]]) == PushRuleLogic.EmailState(email: "a@example.org", enabled: false), "other pushers do not count")
check(json(PushRuleLogic.emailPusherBody(email: "a@example.org", enable: false)) == #"{"app_id":"m.email","kind":null,"pushkey":"a@example.org"}"#, "disable body")
let on = PushRuleLogic.emailPusherBody(email: "a@example.org", enable: true)
check(on["kind"] as? String == "email" && on["app_display_name"] as? String == "Email Notifications" && on["lang"] as? String == "en", "enable body")
check((on["data"] as? [String: Any])?["brand"] as? String == "Diddy", "brand")

check(NotificationLevel.allCases.map(\.shortTitle) == ["Sound", "Silent", "Off"], "order and labels like desktop")

if failures == 0 {
    print("pushrules_check: all checks passed")
} else {
    print("pushrules_check: \(failures) failure(s)")
    exit(1)
}
