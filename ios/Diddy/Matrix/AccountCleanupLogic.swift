import Foundation

/// Which saved account data has no account any more, and when a logout counts as done. Foundation
/// only, checked by Tools/accountcleanup_check; AccountCleanup (SessionStore.swift) does the deleting.
enum AccountCleanupLogic {
    /// Account ids are lowercased UUIDs (LoginService). A folder or Keychain item with any other
    /// name is not one Diddy made for an account, so it is never deleted.
    static func isAccountId(_ name: String) -> Bool {
        guard let uuid = UUID(uuidString: name) else { return false }
        return uuid.uuidString.lowercased() == name
    }

    /// The ids among `found` (folder names under `Accounts/`, Keychain items) that belong to no
    /// account on the list and to no login that is running right now, sorted and without repeats.
    static func orphans(found: [String], listed: Set<String>, inProgress: Set<String>) -> [String] {
        Set(found.filter { isAccountId($0) && !listed.contains($0) && !inProgress.contains($0) }).sorted()
    }

    /// The server answered the logout with M_UNKNOWN_TOKEN: the session had already ended there
    /// (removed from another device, or expired), so there is nothing left to log out of.
    static func sessionAlreadyEnded(errcode: String?) -> Bool {
        errcode == "M_UNKNOWN_TOKEN"
    }

    /// The SDK reports a refused request as an enum whose text names the Matrix error code (and
    /// `unknownToken`); this finds the one that means "session already ended".
    static func sessionAlreadyEnded(errorText: String) -> Bool {
        errorText.contains("M_UNKNOWN_TOKEN") || errorText.contains("unknownToken")
    }
}
