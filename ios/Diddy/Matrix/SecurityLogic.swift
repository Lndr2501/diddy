import Foundation

// Pure logic behind Settings > Devices and Encryption: canonical JSON, cross-signing checks of
// your own devices, user-interactive auth, and the small parsers. Foundation only, so
// Tools/security_check can test it on macOS and Linux. Nothing here logs or keeps secrets.

/// Matrix canonical JSON (spec appendix "Canonical JSON"): keys sorted by code point, no
/// whitespace, UTF-8, integers only. Signed objects are verified over exactly these bytes.
enum CanonicalJSON {
    /// Nil when the value holds something canonical JSON cannot express (floats, other types).
    static func encode(_ value: Any) -> String? {
        var out = ""
        return append(value, to: &out) ? out : nil
    }

    static func data(_ value: Any) -> Data? {
        encode(value).map { Data($0.utf8) }
    }

    private static func append(_ value: Any, to out: inout String) -> Bool {
        if value is NSNull { out += "null"; return true }
        if let string = value as? String { appendString(string, to: &out); return true }
        if let number = value as? NSNumber {
            let type = String(cString: number.objCType)
            if type == "c" || type == "B" {
                out += number.boolValue ? "true" : "false"
                return true
            }
            if type == "d" || type == "f" {
                let double = number.doubleValue
                guard double.isFinite, double == double.rounded(), abs(double) < 9_007_199_254_740_992 else { return false }
                out += String(Int64(double))
                return true
            }
            out += String(number.int64Value)
            return true
        }
        if let bool = value as? Bool { out += bool ? "true" : "false"; return true }
        if let int = value as? Int { out += String(int); return true }
        if let array = value as? [Any] {
            out += "["
            for (index, item) in array.enumerated() {
                if index > 0 { out += "," }
                guard append(item, to: &out) else { return false }
            }
            out += "]"
            return true
        }
        if let object = value as? [String: Any] {
            out += "{"
            let keys = object.keys.sorted(by: codePointLess)
            for (index, key) in keys.enumerated() {
                if index > 0 { out += "," }
                appendString(key, to: &out)
                out += ":"
                guard let item = object[key], append(item, to: &out) else { return false }
            }
            out += "}"
            return true
        }
        return false
    }

    static func codePointLess(_ a: String, _ b: String) -> Bool {
        a.unicodeScalars.lexicographicallyPrecedes(b.unicodeScalars) { $0.value < $1.value }
    }

    private static func appendString(_ string: String, to out: inout String) {
        out += "\""
        for scalar in string.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    let hex = String(scalar.value, radix: 16)
                    out += "\\u" + String(repeating: "0", count: 4 - hex.count) + hex
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        out += "\""
    }
}

/// Unpadded base64 as Matrix uses it for keys and signatures.
enum MatrixBase64 {
    static func decode(_ text: String) -> Data? {
        var value = text.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = value.count % 4
        if remainder == 1 { return nil }
        if remainder > 0 { value += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: value)
    }
}

/// Checks an ed25519 signature: public key, signature, signed bytes. The app passes CryptoKit's.
typealias Ed25519Verifier = (_ publicKey: Data, _ signature: Data, _ message: Data) -> Bool

/// Whether one of your own devices is cross-signed by your identity, like the desktop's
/// "Verified"/"Unverified" per device (`useDeviceVerificationStatus`). Worked out from
/// `/keys/query`, starting from the master key the SDK trusts, never from the server alone.
enum DeviceTrust: Equatable {
    case verified
    case unverified
    /// Not known: your own session is not verified, the keys are missing, or the check failed.
    case unknown
}

enum CrossSigningCheck {
    /// The object a signature covers: everything but `signatures` and `unsigned`.
    static func signedPart(of object: [String: Any]) -> [String: Any] {
        var copy = object
        copy.removeValue(forKey: "signatures")
        copy.removeValue(forKey: "unsigned")
        return copy
    }

    /// True when `object` carries a valid signature of `signer` by the ed25519 key `keyId`
    /// (`ed25519:<id>`) whose public part is `publicKey`.
    static func isSigned(_ object: [String: Any], by signer: String, keyId: String, publicKey: String, verify: Ed25519Verifier) -> Bool {
        guard let signatures = object["signatures"] as? [String: Any],
              let mine = signatures[signer] as? [String: Any],
              let signatureText = mine[keyId] as? String,
              let signature = MatrixBase64.decode(signatureText),
              let key = MatrixBase64.decode(publicKey), key.count == 32,
              let message = CanonicalJSON.data(signedPart(of: object)) else { return false }
        return verify(key, signature, message)
    }

    /// The single ed25519 key of a cross-signing key object (`keys: {"ed25519:<pub>": "<pub>"}`).
    static func publicKey(of keyObject: [String: Any]) -> String? {
        guard let keys = keyObject["keys"] as? [String: Any] else { return nil }
        for (id, value) in keys where id.hasPrefix("ed25519:") {
            if let key = value as? String { return key }
        }
        return nil
    }

    /// The trust of every device of `userId` in a `/keys/query` answer. `trustedMasterKey` is the
    /// master key the SDK holds for your identity; nil when your own session is not verified.
    static func deviceTrust(
        keysQuery json: [String: Any],
        userId: String,
        trustedMasterKey: String?,
        verify: Ed25519Verifier
    ) -> [String: DeviceTrust] {
        let devices = (json["device_keys"] as? [String: Any])?[userId] as? [String: Any] ?? [:]
        var result: [String: DeviceTrust] = [:]
        for id in devices.keys { result[id] = .unknown }
        guard let trustedMasterKey, !trustedMasterKey.isEmpty,
              let master = (json["master_keys"] as? [String: Any])?[userId] as? [String: Any],
              publicKey(of: master) == trustedMasterKey,
              let selfSigning = (json["self_signing_keys"] as? [String: Any])?[userId] as? [String: Any],
              let selfSigningKey = publicKey(of: selfSigning),
              (selfSigning["user_id"] as? String) == userId,
              isSigned(selfSigning, by: userId, keyId: "ed25519:\(trustedMasterKey)", publicKey: trustedMasterKey, verify: verify)
        else { return result }
        for (id, value) in devices {
            guard let device = value as? [String: Any],
                  (device["device_id"] as? String) == id,
                  (device["user_id"] as? String) == userId else { continue }
            let signed = isSigned(device, by: userId, keyId: "ed25519:\(selfSigningKey)", publicKey: selfSigningKey, verify: verify)
            result[id] = signed ? .verified : .unverified
        }
        return result
    }

    /// The ed25519 key ("device key", the fingerprint) of each device in a `/keys/query` answer.
    static func deviceKeys(keysQuery json: [String: Any], userId: String) -> [String: String] {
        let devices = (json["device_keys"] as? [String: Any])?[userId] as? [String: Any] ?? [:]
        var result: [String: String] = [:]
        for (id, value) in devices {
            if let keys = (value as? [String: Any])?["keys"] as? [String: Any], let key = keys["ed25519:\(id)"] as? String {
                result[id] = key
            }
        }
        return result
    }

    /// The desktop's badge next to "Device Verification": Unverified, "N Unverified" or Verified.
    static func unverifiedCount(_ trust: [String: DeviceTrust], otherDevices: [String]) -> Int {
        otherDevices.filter { trust[$0] == .unverified }.count
    }
}

/// A `401` answer of user-interactive authentication (spec "User-interactive API").
struct UIAChallenge: Equatable {
    let session: String?
    let flows: [[String]]
    let completed: [String]

    init?(json: [String: Any]) {
        guard let rawFlows = json["flows"] as? [[String: Any]] else { return nil }
        flows = rawFlows.map { ($0["stages"] as? [String]) ?? [] }
        session = json["session"] as? String
        completed = json["completed"] as? [String] ?? []
    }

    /// Diddy can only ask for a password, like the desktop's ActionUIA for this case.
    var acceptsPassword: Bool {
        flows.contains { flow in
            let remaining = flow.filter { !completed.contains($0) }
            return remaining == ["m.login.password"]
        }
    }

    /// The `auth` dictionary for `m.login.password`.
    static func passwordAuth(userId: String, password: String, session: String?) -> [String: Any] {
        var auth: [String: Any] = [
            "type": "m.login.password",
            "identifier": ["type": "m.id.user", "user": userId],
            "password": password,
        ]
        if let session { auth["session"] = session }
        return auth
    }
}

enum AccountInfo {
    /// The email addresses of `GET /account/3pid`, like the desktop's Contact Information.
    static func emails(threePids json: [String: Any]) -> [String] {
        let items = json["threepids"] as? [[String: Any]] ?? []
        return items.compactMap { item in
            guard item["medium"] as? String == "email" else { return nil }
            return item["address"] as? String
        }
    }

    /// The desktop's `isUserId`: `@local:server` without whitespace.
    static func isUserId(_ text: String) -> Bool {
        guard text.hasPrefix("@"), let colon = text.firstIndex(of: ":") else { return false }
        let local = text[text.index(after: text.startIndex)..<colon]
        let server = text[text.index(after: colon)...]
        guard !local.isEmpty, !server.isEmpty else { return false }
        if local.contains(":") { return false }
        return !text.unicodeScalars.contains { CharacterSet.whitespacesAndNewlines.contains($0) }
    }

    /// Global account data types Diddy and other clients use; the viewer looks each one up,
    /// since a client cannot list all of them without a full sync.
    static let knownAccountDataTypes = [
        "m.direct",
        "m.ignored_user_list",
        "m.push_rules",
        "m.secret_storage.default_key",
        "m.cross_signing.master",
        "m.cross_signing.self",
        "m.cross_signing.user",
        "m.megolm_backup.v1",
        "m.identity_server",
        "m.widgets",
        "m.accepted_terms",
        "in.cinny.spaces",
        "io.element.recent_emoji",
        "im.ponies.user_emotes",
        "im.ponies.emote_rooms",
    ]

    /// Pretty JSON for the account data viewer; sorted keys so it reads the same every time.
    static func prettyJSON(_ object: Any) -> String {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]) else {
            return "\(object)"
        }
        return String(decoding: data, as: UTF8.self)
    }

    /// The desktop shows a hidden recovery key as stars, keeping the spaces between groups.
    static func masked(_ key: String) -> String {
        String(key.map { $0 == " " || $0 == "\n" ? $0 : "*" })
    }
}
