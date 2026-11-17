import Foundation

/// A copy of your own Diddy profile in your account data, next to the copies in the options rooms
/// (desktop `ownProfileBackup.ts`). Without an options room a profile could not be saved at all, so
/// your own devices did not even agree with each other. The account data reaches every device of
/// the account, so the profile is saved there first and takes part in the "newest profile wins"
/// pick like a room. `ts` is the time of the save on the saving device.
enum DiddyOwnProfileBackup {
    static let eventType = "app.diddy.my_profile"
    /// A copy saved with a clock far ahead would win over every later change: such copies are ignored.
    static let maxAheadMs: Int64 = 10 * 60 * 1000

    static func content(_ profile: [String: Any], ts: Int64) -> [String: Any] {
        ["v": 1, "ts": ts, "profile": profile]
    }

    /// The stored copy as a pick candidate, or nil when there is none or it is unusable.
    static func parse(_ json: [String: Any]?, sender: String, nowMs: Int64) -> DiddyCandidate? {
        guard let json, let profile = json["profile"] as? [String: Any],
              let number = json["ts"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let value = number.doubleValue
        guard value.isFinite, value > 0, value <= Double(nowMs + maxAheadMs) else { return nil }
        guard let size = DiddyProfileDraft.encodedSize(profile, key: sender), size <= DiddyEvents.maxContentBytes else { return nil }
        return DiddyCandidate(content: profile, ts: Int64(value), sender: sender)
    }

    static var nowMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}

extension MatrixAccount {
    /// Reads the copy from the account data. `loaded` is false when the server could not be asked.
    func readOwnProfileBackup() async -> (loaded: Bool, candidate: DiddyCandidate?) {
        let text: String?
        do {
            text = try await client.accountData(eventType: DiddyOwnProfileBackup.eventType)
        } catch {
            return (false, nil)
        }
        let json = text.flatMap { $0.data(using: .utf8) }
            .flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
        return (true, DiddyOwnProfileBackup.parse(json, sender: userId, nowMs: DiddyOwnProfileBackup.nowMs))
    }

    /// Saves your profile into the account data and remembers it, so the next read shows it even
    /// before the server's sync brings it back.
    func writeOwnProfileBackup(_ raw: [String: Any]) async throws {
        var profile = raw
        profile[DiddyEvents.keyField] = nil
        let ts = DiddyOwnProfileBackup.nowMs
        let data = try JSONSerialization.data(withJSONObject: DiddyOwnProfileBackup.content(profile, ts: ts))
        try await client.setAccountData(eventType: DiddyOwnProfileBackup.eventType, content: String(decoding: data, as: UTF8.self))
        diddyOwnBackup = DiddyCandidate(content: profile, ts: ts, sender: userId)
        diddyOwnBackupLoaded = true
    }
}
