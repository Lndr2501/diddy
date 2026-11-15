// Checks for Diddy/Matrix/RegistrationLogic.swift. Run from the ios folder:
//   swiftc Diddy/Matrix/RegistrationLogic.swift Tools/registration_check/main.swift -o /tmp/registration_check && /tmp/registration_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
typealias R = RegistrationLogic

// The 401 answer of /register
let answer = """
{"session":"abc","completed":["m.login.dummy"],
 "flows":[{"stages":["m.login.email.identity","m.login.dummy"]},{"stages":["m.login.recaptcha","m.login.terms","m.login.dummy"]},{"stages":["m.login.dummy"]}],
 "params":{"m.login.terms":{"policies":{"privacy":{"version":"1","en":{"name":"Privacy Policy","url":"https://hs.example/privacy"},"de":{"name":"Datenschutz","url":"https://hs.example/datenschutz"}},
  "tos":{"version":"2","fr":{"name":"Conditions","url":"https://hs.example/fr"}},"bad":{"en":{"name":"X","url":"javascript:alert(1)"}}}}},
 "errcode":"M_UNAUTHORIZED","error":"Invalid token"}
""".data(using: .utf8)!
let challenge = R.parseChallenge(answer, language: "de")
check(challenge?.session == "abc", "session read")
check(challenge?.completed == ["m.login.dummy"], "completed read")
check(challenge?.flows.count == 3, "flows read")
check(challenge?.errcode == "M_UNAUTHORIZED" && challenge?.error == "Invalid token", "error of the last step read")
check(challenge?.policies.map(\.name) == ["Datenschutz", "Conditions"], "policies in the user's language, else any, unsafe links dropped: \(challenge?.policies.map(\.name) ?? [])")
check(R.parseChallenge(Data("{}".utf8)) == nil, "no flows: no challenge")
check(R.parseChallenge(Data("not json".utf8)) == nil, "not JSON: no challenge")

// Which flow
check(R.pickFlow([["m.login.email.identity", "m.login.dummy"], ["m.login.recaptcha", "m.login.terms", "m.login.dummy"]]) == ["m.login.recaptcha", "m.login.terms", "m.login.dummy"], "a flow without email wins")
check(R.pickFlow([["m.login.recaptcha", "m.login.dummy"], ["m.login.dummy"]]) == ["m.login.dummy"], "then the shortest")
check(R.pickFlow([["a", "b"], ["c", "d"]]) == ["a", "b"], "ties: the server's order")
check(R.pickFlow([["m.login.email.identity"]]) == ["m.login.email.identity"], "email when nothing else")
check(R.pickFlow([]) == nil, "no flows: nothing")

// Next step
check(R.nextStage(flow: ["m.login.recaptcha", "m.login.terms", "m.login.dummy"], completed: ["m.login.recaptcha"]) == "m.login.terms", "first open step")
check(R.nextStage(flow: ["m.login.dummy"], completed: ["m.login.dummy"]) == nil, "all done")
check(R.isNative("m.login.terms") && R.isNative("m.login.registration_token") && R.isNative("org.matrix.msc3231.login.registration_token"), "shown in the app")
check(!R.isNative("m.login.recaptcha") && !R.isNative("org.example.x"), "captcha and unknown steps on the server's page")

// Fallback page
let fallback = R.fallbackURL(homeserver: URL(string: "https://hs.example/")!, stage: "m.login.recaptcha", session: "a b/c")
check(fallback?.absoluteString == "https://hs.example/_matrix/client/v3/auth/m.login.recaptcha/fallback/web?session=a%20b/c", "fallback address: \(fallback?.absoluteString ?? "nil")")
let odd = R.fallbackURL(homeserver: URL(string: "https://hs.example/base")!, stage: "org.x/y", session: "s")
check(odd?.absoluteString == "https://hs.example/base/_matrix/client/v3/auth/org.x%2Fy/fallback/web?session=s", "stage escaped: \(odd?.absoluteString ?? "nil")")

// Names
check(R.localpart("  @Bob:matrix.org ") == "bob", "@name:server becomes the lowercase local part")
check(R.localpart("alice") == "alice", "plain name stays")
check(R.usernameProblem("") != nil, "empty name refused")
check(R.usernameProblem("bob smith") != nil && R.usernameProblem("bob!") != nil, "spaces and symbols refused")
check(R.usernameProblem("bob.smith_1=2-3/4") == nil, "allowed characters accepted")

// Request body
let first = R.registerBody(username: "bob", password: "pw", deviceName: "Diddy iPhone", auth: nil)
check(first["auth"] == nil && first["inhibit_login"] as? Bool == true && first["username"] as? String == "bob", "first request: no auth, no login")
let next = R.registerBody(username: "bob", password: "pw", deviceName: "d", auth: ["type": "m.login.dummy", "session": "abc"])
check((next["auth"] as? [String: Any])?["session"] as? String == "abc", "later requests carry the session")

// Messages
check(R.message(errcode: "M_USER_IN_USE", error: nil).contains("taken"), "taken")
check(R.message(errcode: "M_FORBIDDEN", error: nil).contains("does not accept new accounts"), "registration closed")
check(R.message(errcode: "M_WEAK_PASSWORD", error: "too simple").contains("too simple"), "server's reason kept")
check(R.message(errcode: "X", error: "Something") == "Something", "unknown: server's text")

if failures > 0 { print("\(failures) registration check(s) failed"); exit(1) }
print("registration checks passed")
