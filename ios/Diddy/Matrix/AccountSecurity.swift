import CryptoKit
import Foundation
import MatrixRustSDK

/// One session of your account, as `GET /devices` lists it (desktop: `IMyDevice`).
struct AccountDevice: Identifiable, Hashable {
    let id: String
    let name: String?
    let lastSeen: Date?
    let lastSeenIP: String?
}

/// What signing out of devices needs next (desktop OtherDevices.tsx with ActionUIA).
enum DeviceSignOutResult {
    case done
    /// The server wants your password. `error` is set after a wrong one.
    case needsPassword(UIAChallenge, error: String?)
    /// The server asks for something Diddy cannot do here (email, captcha, ...).
    case unsupported
}

/// The server's key backup (`GET /room_keys/version`), the desktop's "Backup Details".
struct KeyBackupInfo: Equatable {
    let version: String
    let count: Int?
}

/// The client API calls of Settings > Devices, Encryption and Account that the SDK has no
/// method for. Passwords only travel in the request body and are never kept or logged.
extension MatrixAccount {
    static let ed25519Verifier: Ed25519Verifier = { key, signature, message in
        guard let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: key) else { return false }
        return publicKey.isValidSignature(signature, for: message)
    }

    /// Like `clientRequest`, but hands back the status of every answer, which user-interactive
    /// auth (401) and "nothing there" (404) need.
    func securityRequest(_ path: String, body: [String: Any]? = nil, method: String? = nil) async throws -> (status: Int, json: [String: Any]) {
        let session = try client.session()
        let base = session.homeserverUrl.hasSuffix("/") ? String(session.homeserverUrl.dropLast()) : session.homeserverUrl
        guard let url = URL(string: base + path) else { throw DiddyError("Invalid homeserver URL.") }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if let method { request.httpMethod = method }
        if let body {
            if method == nil { request.httpMethod = "POST" }
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        return (status, json)
    }

    static func securityPathComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? value
    }

    private static func refused(_ json: [String: Any]) -> ClientAPIError {
        ClientAPIError(errcode: json["errcode"] as? String, message: json["error"] as? String ?? "The server refused the request.")
    }

    // MARK: Devices

    func accountDevices() async throws -> [AccountDevice] {
        let (status, json) = try await securityRequest("/_matrix/client/v3/devices")
        guard status == 200 else { throw Self.refused(json) }
        return (json["devices"] as? [[String: Any]] ?? []).compactMap { item in
            guard let id = item["device_id"] as? String else { return nil }
            let seen = (item["last_seen_ts"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1000) }
            return AccountDevice(id: id, name: item["display_name"] as? String, lastSeen: seen, lastSeenIP: item["last_seen_ip"] as? String)
        }
        .sorted { ($0.lastSeen ?? .distantPast) > ($1.lastSeen ?? .distantPast) }
    }

    /// Cross-signing trust and ed25519 key of each of your devices. Trust is only worked out
    /// when this session is verified; it starts from the master key the SDK trusts.
    func ownDeviceTrust() async -> (trust: [String: DeviceTrust], keys: [String: String]) {
        let body: [String: Any] = ["device_keys": [userId: [String]()]]
        guard let answer = try? await securityRequest("/_matrix/client/v3/keys/query", body: body),
              answer.status == 200 else { return ([:], [:]) }
        let json = answer.json
        var master: String?
        if verificationState == .verified,
           let identity = try? await client.encryption().userIdentity(userId: userId, fallbackToServer: false),
           identity.isVerified() {
            master = identity.masterKey()
        }
        let trust = CrossSigningCheck.deviceTrust(keysQuery: json, userId: userId, trustedMasterKey: master, verify: Self.ed25519Verifier)
        return (trust, CrossSigningCheck.deviceKeys(keysQuery: json, userId: userId))
    }

    /// The ed25519 key of this device, the desktop's "Device Key".
    func ownDeviceKey() async -> String? {
        await client.encryption().ed25519Key()
    }

    /// Signs out of devices, asking the server for its auth flows first. Pass the challenge and
    /// password on the second round.
    func signOutDevices(_ ids: [String], password: String? = nil, challenge: UIAChallenge? = nil) async throws -> DeviceSignOutResult {
        var body: [String: Any] = ["devices": ids]
        if let password, let challenge {
            body["auth"] = UIAChallenge.passwordAuth(userId: userId, password: password, session: challenge.session)
        }
        let (status, json) = try await securityRequest("/_matrix/client/v3/delete_devices", body: body)
        if status == 200 { return .done }
        if status == 401, let next = UIAChallenge(json: json) {
            guard next.acceptsPassword else { return .unsupported }
            let wrong = password != nil ? (json["error"] as? String ?? "Wrong password.") : nil
            return .needsPassword(next, error: wrong)
        }
        throw Self.refused(json)
    }

    /// The account management page of an OAuth (MAS) account, nil for password accounts.
    func accountManagementURL(_ action: AccountManagementAction?) async -> URL? {
        guard let text = try? await client.accountUrl(action: action), let url = URL(string: text) else { return nil }
        return url
    }

    // MARK: Key backup

    /// Nil when the server has no backup.
    func keyBackupInfo() async throws -> KeyBackupInfo? {
        let (status, json) = try await securityRequest("/_matrix/client/v3/room_keys/version")
        if status == 404 { return nil }
        guard status == 200 else { throw Self.refused(json) }
        guard let version = json["version"] as? String else { return nil }
        return KeyBackupInfo(version: version, count: (json["count"] as? NSNumber)?.intValue)
    }

    // MARK: Account

    func emailAddresses() async throws -> [String] {
        let (status, json) = try await securityRequest("/_matrix/client/v3/account/3pid")
        guard status == 200 else { throw Self.refused(json) }
        return AccountInfo.emails(threePids: json)
    }

    /// The content of a global account data event, nil when you have none of that type.
    func globalAccountData(type: String) async throws -> [String: Any]? {
        let path = "/_matrix/client/v3/user/\(Self.securityPathComponent(userId))/account_data/\(Self.securityPathComponent(type))"
        let (status, json) = try await securityRequest(path)
        if status == 404 { return nil }
        guard status == 200 else { throw Self.refused(json) }
        return json
    }
}

/// Tells the recovery setup how far it is. Never receives the recovery key itself.
final class RecoveryProgress: EnableRecoveryProgressListener, @unchecked Sendable {
    private let handler: (String) -> Void
    init(_ handler: @escaping (String) -> Void) { self.handler = handler }

    func onUpdate(status: EnableRecoveryProgress) {
        switch status {
        case .starting: handler("Starting…")
        case .creatingBackup: handler("Creating the key backup…")
        case .creatingRecoveryKey: handler("Creating the recovery key…")
        case .backingUp(let done, let total): handler("Backing up keys: \(done) of \(total)")
        case .roomKeyUploadError: handler("Some keys could not be uploaded yet.")
        case .done: handler("Done")
        }
    }
}

/// Recovery key, backup and identity reset, like the desktop's Settings > Devices.
extension MatrixAccount {
    /// Turns on recovery and returns the new recovery key. An empty passphrase means none.
    func enableRecovery(passphrase: String?, progress: @escaping (String) -> Void) async throws -> String {
        let phrase = passphrase.flatMap { $0.isEmpty ? nil : $0 }
        return try await client.encryption().enableRecovery(
            waitForBackupsToUpload: false,
            passphrase: phrase,
            progressListener: RecoveryProgress(progress)
        )
    }

    /// Makes a new recovery key; the old one stops working.
    func changeRecoveryKey() async throws -> String {
        try await client.encryption().resetRecoveryKey()
    }

    func backupStateNow() -> BackupState {
        client.encryption().backupState()
    }

    func enableKeyBackup() async throws {
        try await client.encryption().enableBackups()
    }
}

extension MatrixAccount {
    /// Only for Settings > Developer Tools, behind a warning. Never log or store the result.
    func accessTokenForDeveloper() -> String? {
        try? client.session().accessToken
    }
}
