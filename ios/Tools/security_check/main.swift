// Checks for Diddy/Matrix/SecurityLogic.swift: canonical JSON, cross-signing of own devices,
// user-interactive auth, 3PIDs and user IDs. Foundation only; the signature part also runs real
// ed25519 through CryptoKit where it exists (macOS).
// Run from the ios folder:
//   swiftc Diddy/Matrix/SecurityLogic.swift Tools/security_check/main.swift -o /tmp/security_check && /tmp/security_check
import Foundation
#if canImport(CryptoKit)
import CryptoKit
#endif

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

// MARK: Canonical JSON (examples from the Matrix spec appendix)

check(CanonicalJSON.encode([String: Any]()) == "{}", "empty object")
check(CanonicalJSON.encode(["one": 1, "two": "Two"] as [String: Any]) == "{\"one\":1,\"two\":\"Two\"}", "two keys")
check(CanonicalJSON.encode(["b": "2", "a": "1"]) == "{\"a\":\"1\",\"b\":\"2\"}", "keys sorted")
let nested: [String: Any] = [
    "auth": [
        "success": true,
        "mxid": "@john.doe:example.com",
        "profile": [
            "display_name": "John Doe",
            "three_pids": [
                ["medium": "email", "address": "john.doe@example.org"],
                ["medium": "msisdn", "address": "123456789"],
            ],
        ],
    ],
]
check(
    CanonicalJSON.encode(nested) == "{\"auth\":{\"mxid\":\"@john.doe:example.com\",\"profile\":{\"display_name\":\"John Doe\",\"three_pids\":[{\"address\":\"john.doe@example.org\",\"medium\":\"email\"},{\"address\":\"123456789\",\"medium\":\"msisdn\"}]},\"success\":true}}",
    "spec example with nesting and a boolean"
)
check(CanonicalJSON.encode(["a": "日本語"]) == "{\"a\":\"日本語\"}", "non-ASCII stays UTF-8")
check(CanonicalJSON.encode(["本": 2, "日": 1]) == "{\"日\":1,\"本\":2}", "sorted by code point")
check(CanonicalJSON.encode(["a": "\u{1F}\"\\\n"]) == "{\"a\":\"\\u001f\\\"\\\\\\n\"}", "escapes")
check(CanonicalJSON.encode(["a": NSNull()]) == "{\"a\":null}", "null")
check(CanonicalJSON.encode(["a": 1.5]) == nil, "floats are refused")
check(CanonicalJSON.encode(["a": -7]) == "{\"a\":-7}", "negative integer")
// Parsed JSON (NSNumber booleans and integers) encodes the same as Swift literals.
if let parsed = try? JSONSerialization.jsonObject(with: Data("{\"z\":true,\"a\":false,\"n\":42}".utf8)) {
    check(CanonicalJSON.encode(parsed) == "{\"a\":false,\"n\":42,\"z\":true}", "parsed booleans and numbers")
} else {
    check(false, "test JSON parses")
}

// MARK: Base64

check(MatrixBase64.decode("YWJj") == Data("abc".utf8), "padded length")
check(MatrixBase64.decode("YWI") == Data("ab".utf8), "unpadded")
check(MatrixBase64.decode("YQ") == Data("a".utf8), "unpadded, two chars")
check(MatrixBase64.decode("Y") == nil, "impossible length")

// MARK: Cross-signing

let me = "@me:example.org"
check(CrossSigningCheck.signedPart(of: ["a": 1, "signatures": [String: Any](), "unsigned": [String: Any]()]).keys.sorted() == ["a"], "signed part drops signatures and unsigned")

// Without your own verified identity nothing is claimed.
let emptyQuery: [String: Any] = ["device_keys": [me: ["DEV": ["device_id": "DEV", "user_id": me, "keys": ["ed25519:DEV": "abc"]]]]]
let noTrust = CrossSigningCheck.deviceTrust(keysQuery: emptyQuery, userId: me, trustedMasterKey: nil) { _, _, _ in true }
check(noTrust == ["DEV": .unknown], "no trusted master key: unknown")
check(CrossSigningCheck.deviceKeys(keysQuery: emptyQuery, userId: me) == ["DEV": "abc"], "device key read")

#if canImport(CryptoKit)
func b64(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "=", with: "") }
func sign(_ object: [String: Any], with key: Curve25519.Signing.PrivateKey) -> String {
    let message = CanonicalJSON.data(CrossSigningCheck.signedPart(of: object))!
    return b64(try! key.signature(for: message))
}
let cryptoKit: Ed25519Verifier = { key, signature, message in
    guard let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: key) else { return false }
    return publicKey.isValidSignature(signature, for: message)
}

let masterPrivate = Curve25519.Signing.PrivateKey()
let selfSigningPrivate = Curve25519.Signing.PrivateKey()
let otherPrivate = Curve25519.Signing.PrivateKey()
let masterPub = b64(masterPrivate.publicKey.rawRepresentation)
let sskPub = b64(selfSigningPrivate.publicKey.rawRepresentation)

let master: [String: Any] = ["user_id": me, "usage": ["master"], "keys": ["ed25519:\(masterPub)": masterPub]]
var selfSigning: [String: Any] = ["user_id": me, "usage": ["self_signing"], "keys": ["ed25519:\(sskPub)": sskPub]]
selfSigning["signatures"] = [me: ["ed25519:\(masterPub)": sign(selfSigning, with: masterPrivate)]]

func device(_ id: String, signedBy key: Curve25519.Signing.PrivateKey?, extra: [String: Any] = [:]) -> [String: Any] {
    var object: [String: Any] = [
        "user_id": me,
        "device_id": id,
        "algorithms": ["m.olm.v1.curve25519-aes-sha2", "m.megolm.v1.aes-sha2"],
        "keys": ["ed25519:\(id)": "edkey\(id)", "curve25519:\(id)": "cukey\(id)"],
        "unsigned": ["device_display_name": "Phone"],
    ]
    for (k, v) in extra { object[k] = v }
    if let key {
        object["signatures"] = [me: ["ed25519:\(sskPub)": sign(object, with: key)]]
    }
    return object
}
var tampered = device("TAMPER", signedBy: selfSigningPrivate)
tampered["keys"] = ["ed25519:TAMPER": "evilkey"]
let query: [String: Any] = [
    "device_keys": [me: [
        "GOOD": device("GOOD", signedBy: selfSigningPrivate),
        "DEHYD": device("DEHYD", signedBy: selfSigningPrivate, extra: ["dehydrated": true]),
        "NOSIG": device("NOSIG", signedBy: nil),
        "WRONG": device("WRONG", signedBy: otherPrivate),
        "TAMPER": tampered,
    ]],
    "master_keys": [me: master],
    "self_signing_keys": [me: selfSigning],
]
// Round trip through JSON text, as the server answer arrives.
let wire = try! JSONSerialization.jsonObject(with: try! JSONSerialization.data(withJSONObject: query)) as! [String: Any]
let trust = CrossSigningCheck.deviceTrust(keysQuery: wire, userId: me, trustedMasterKey: masterPub, verify: cryptoKit)
check(trust["GOOD"] == .verified, "cross-signed device is verified")
check(trust["DEHYD"] == .verified, "boolean field is covered by the signature")
check(trust["NOSIG"] == .unverified, "unsigned device is unverified")
check(trust["WRONG"] == .unverified, "device signed by another key is unverified")
check(trust["TAMPER"] == .unverified, "changed device keys break the signature")
check(CrossSigningCheck.unverifiedCount(trust, otherDevices: ["GOOD", "NOSIG", "WRONG"]) == 2, "unverified count")

// A master key the SDK does not trust (a server swapping keys) verifies nothing.
let otherMaster = b64(otherPrivate.publicKey.rawRepresentation)
let swapped = CrossSigningCheck.deviceTrust(keysQuery: wire, userId: me, trustedMasterKey: otherMaster, verify: cryptoKit)
check(swapped["GOOD"] == .unknown, "untrusted master key: unknown")
// A self-signing key not signed by the master key verifies nothing either.
var badQuery = wire
var badSsk = selfSigning
badSsk["signatures"] = [me: ["ed25519:\(masterPub)": sign(selfSigning, with: otherPrivate)]]
badQuery["self_signing_keys"] = [me: badSsk]
let badTrust = CrossSigningCheck.deviceTrust(keysQuery: badQuery, userId: me, trustedMasterKey: masterPub, verify: cryptoKit)
check(badTrust["GOOD"] == .unknown, "self-signing key without master signature: unknown")
#else
print("CryptoKit not available: signature checks skipped")
#endif

// MARK: User-interactive auth

let challenge = UIAChallenge(json: [
    "session": "abc",
    "flows": [["stages": ["m.login.password"]], ["stages": ["m.login.email.identity", "m.login.password"]]],
    "params": [String: Any](),
])
check(challenge?.session == "abc", "session read")
check(challenge?.acceptsPassword == true, "password-only flow accepted")
let emailOnly = UIAChallenge(json: ["flows": [["stages": ["m.login.email.identity"]]]])
check(emailOnly?.acceptsPassword == false, "email flow not supported")
let partly = UIAChallenge(json: ["flows": [["stages": ["m.login.email.identity", "m.login.password"]]], "completed": ["m.login.email.identity"]])
check(partly?.acceptsPassword == true, "remaining password stage accepted")
check(UIAChallenge(json: ["errcode": "M_FORBIDDEN"]) == nil, "no flows: not a challenge")
let auth = UIAChallenge.passwordAuth(userId: me, password: "pw", session: "abc")
check(auth["type"] as? String == "m.login.password", "auth type")
check((auth["identifier"] as? [String: String]) == ["type": "m.id.user", "user": me], "auth identifier")
check(auth["session"] as? String == "abc", "auth session")

// MARK: Account

check(AccountInfo.emails(threePids: ["threepids": [
    ["medium": "email", "address": "a@b.c"],
    ["medium": "msisdn", "address": "123"],
    ["medium": "email", "address": "d@e.f"],
]]) == ["a@b.c", "d@e.f"], "emails only")
check(AccountInfo.emails(threePids: [:]).isEmpty, "no threepids")
check(AccountInfo.isUserId("@alice:example.org"), "user id")
check(AccountInfo.isUserId("@alice:example.org:8448"), "user id with port")
check(!AccountInfo.isUserId("alice:example.org"), "missing @")
check(!AccountInfo.isUserId("@alice"), "missing server")
check(!AccountInfo.isUserId("@:example.org"), "empty localpart")
check(!AccountInfo.isUserId("@al ice:example.org"), "whitespace")
check(!AccountInfo.isUserId("#room:example.org"), "room alias")
check(AccountInfo.masked("EsTc 1234\nabcd") == "**** ****\n****", "mask keeps spaces")
check(AccountInfo.prettyJSON(["b": 1, "a": 2]).hasPrefix("{\n  \"a\""), "pretty JSON sorted")

if failures == 0 { print("ALL OK") } else { print("\(failures) FAILED"); exit(1) }
