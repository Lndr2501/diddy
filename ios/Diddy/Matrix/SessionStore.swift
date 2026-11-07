import Foundation
import MatrixRustSDK
import Security

/// One saved login. Every account has its own SDK data and cache directory, so logins on different
/// homeservers (or several on the same one) never share a crypto store.
struct AccountRecord: Codable, Identifiable, Hashable {
    var id: String
    var userId: String
    var homeserver: String
    var displayName: String?

    var serverName: String {
        userId.split(separator: ":", maxSplits: 1).last.map(String.init) ?? homeserver
    }

    var dataDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Accounts/\(id)/data", isDirectory: true)
    }

    var cacheDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Accounts/\(id)/cache", isDirectory: true)
    }

    func ensureDirectories() throws {
        try FileManager.default.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    func removeDirectories() {
        try? FileManager.default.removeItem(at: dataDirectory.deletingLastPathComponent())
        try? FileManager.default.removeItem(at: cacheDirectory.deletingLastPathComponent())
    }
}

/// The list of accounts (no secrets) in UserDefaults; access tokens in the Keychain.
enum AccountList {
    private static let key = "diddy.accounts"
    private static let activeKey = "diddy.activeAccount"

    static func load() -> [AccountRecord] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([AccountRecord].self, from: data)) ?? []
    }

    static func save(_ accounts: [AccountRecord]) {
        if let data = try? JSONEncoder().encode(accounts) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static var activeAccountId: String? {
        get { UserDefaults.standard.string(forKey: activeKey) }
        set { UserDefaults.standard.set(newValue, forKey: activeKey) }
    }
}

enum SessionStore {
    private static let service = "app.diddy.ios.session"

    private struct Stored: Codable {
        var accessToken: String
        var refreshToken: String?
        var userId: String
        var deviceId: String
        var homeserverUrl: String
        var oauthData: String?
        var nativeSlidingSync: Bool
    }

    /// Writes the session in place: an existing item is updated, a missing one added. Unlike
    /// delete-then-add, a failed write never leaves the account without its saved session.
    static func save(_ session: Session, accountId: String) throws {
        let stored = Stored(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            userId: session.userId,
            deviceId: session.deviceId,
            homeserverUrl: session.homeserverUrl,
            oauthData: session.oauthData,
            nativeSlidingSync: session.slidingSyncVersion == .native
        )
        let data: Data
        do {
            data = try JSONEncoder().encode(stored)
        } catch {
            throw DiddyError("The login could not be saved: \(error.localizedDescription)")
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: accountId,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item.merge(attributes) { _, new in new }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    static func load(accountId: String) -> Session? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: accountId,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let stored = try? JSONDecoder().decode(Stored.self, from: data)
        else { return nil }
        return Session(
            accessToken: stored.accessToken,
            refreshToken: stored.refreshToken,
            userId: stored.userId,
            deviceId: stored.deviceId,
            homeserverUrl: stored.homeserverUrl,
            oauthData: stored.oauthData,
            slidingSyncVersion: stored.nativeSlidingSync ? .native : .none
        )
    }

    static func delete(accountId: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: accountId,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/// Keeps refreshed OAuth tokens: the SDK hands every new token pair to this delegate.
final class AccountSessionDelegate: ClientSessionDelegate, @unchecked Sendable {
    let accountId: String
    init(accountId: String) { self.accountId = accountId }

    func retrieveSessionFromKeychain(userId: String) throws -> Session {
        guard let session = SessionStore.load(accountId: accountId) else {
            throw DiddyError("No saved session for \(userId).")
        }
        return session
    }

    func saveSessionInKeychain(session: Session) {
        // The SDK gives this callback no way to fail. If the write fails, the previously saved
        // session stays in the Keychain (save never deletes first).
        try? SessionStore.save(session, accountId: accountId)
    }
}

struct DiddyError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// A Keychain call that did not return errSecSuccess.
struct KeychainError: LocalizedError {
    let status: OSStatus
    var errorDescription: String? {
        let reason = SecCopyErrorMessageString(status, nil).map { $0 as String } ?? "OSStatus \(status)"
        return "The login could not be saved in the Keychain: \(reason)"
    }
}

enum ClientFactory {
    static func builder(for record: AccountRecord) throws -> ClientBuilder {
        try record.ensureDirectories()
        return ClientBuilder()
            .sessionPaths(dataPath: record.dataDirectory.path, cachePath: record.cacheDirectory.path)
            .setSessionDelegate(sessionDelegate: AccountSessionDelegate(accountId: record.id))
            .slidingSyncVersionBuilder(versionBuilder: .discoverNative)
            .autoEnableCrossSigning(autoEnableCrossSigning: true)
            .autoEnableBackups(autoEnableBackups: true)
            .userAgent(userAgent: "Diddy iOS/\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1")")
    }
}
