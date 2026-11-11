import Foundation
import MatrixRustSDK

/// Online status of people, read and announced through the client API.
///
/// Simplified Sliding Sync delivers no presence, so this asks
/// `GET /_matrix/client/v3/presence/{userId}/status` for the people that matter: everybody a
/// status dot is on screen for, and the partners of your direct messages (kept fresh while the
/// app is open). Your own presence is announced with `PUT .../presence/{me}/status`, following the
/// status you picked in Diddy like desktop does (`cinny/src/app/plugins/diddy/status.ts`).
///
/// The decisions (what to show, when to ask, how long to wait after errors) live in
/// PresenceLogic.swift and are tested by Tools/presence_check.
@MainActor
final class PresenceStore: ObservableObject {
    private static var stores: [String: PresenceStore] = [:]

    /// The store of an account, made on first use.
    static func of(_ account: MatrixAccount) -> PresenceStore {
        if let store = stores[account.id], store.account === account { return store }
        let store = PresenceStore(account: account)
        stores[account.id] = store
        return store
    }

    @Published private(set) var presences: [String: MatrixPresence] = [:]
    /// Nil while unknown, false for servers with presence turned off.
    @Published private(set) var serverHasPresence: Bool?

    private weak var account: MatrixAccount?
    private var probe = PresenceServerProbe() {
        didSet { if serverHasPresence != probe.hasPresence { serverHasPresence = probe.hasPresence } }
    }
    private var entries: [String: PresenceSchedule.Entry] = [:]
    /// How many dots on screen show each user.
    private var watchers: [String: Int] = [:]
    private var inFlight: Set<String> = []
    /// After a 429 nobody is asked until then.
    private var pausedUntil: Date?
    private var kickScheduled = false

    private var foregroundSince: Date?
    private var runGeneration = 0
    private var lastAnnounced: PresenceLogic.Announcement?
    private var lastAnnouncedAt: Date?
    private var announcePausedUntil: Date?
    private var announcing = false
    /// Whether the server keeps you online between announcements (nil until read back once).
    private var serverKeepsPresence: Bool?
    private var ownCheckRetryAt: Date?

    private init(account: MatrixAccount) {
        self.account = account
    }

    // MARK: - What the dots show

    /// The state to show for a user, nil when nothing should be shown.
    func state(of userId: String) -> PresenceState? {
        guard let account else { return nil }
        if userId == account.userId { return PresenceLogic.own(chosen: ownStatus) }
        let chosen = account.diddyProfiles[userId]?.status?.rawValue
        var matrix = presences[userId]
        if let fetched = entries[userId]?.fetchedAt, Date().timeIntervalSince(fetched) > PresenceSchedule.staleAfter {
            matrix = nil // too old to claim anything
        }
        return PresenceLogic.shown(matrix, chosen: chosen, serverHasPresence: serverHasPresence)
    }

    /// The user's own status message, if they set one.
    func message(of userId: String) -> String? {
        guard let account, userId != account.userId else { return nil }
        return PresenceLogic.message(presences[userId]?.statusMsg)
    }

    /// A dot for this user came on screen.
    func watch(_ userId: String) {
        watchers[userId, default: 0] += 1
        if entries[userId] == nil { kick() }
    }

    func unwatch(_ userId: String) {
        guard let count = watchers[userId] else { return }
        watchers[userId] = count > 1 ? count - 1 : nil
    }

    /// For a profile card or a chat header: asks now unless the answer is fresh.
    func refreshNow(_ userId: String) async {
        guard let account, userId != account.userId, foregroundSince != nil else { return }
        if let pausedUntil, Date() < pausedUntil { return }
        guard PresenceSchedule.isDue(entries[userId], now: Date(), maxAge: maxAge(onDemand: true)) else { return }
        await fetch(userId)
    }

    // MARK: - Foreground and background

    /// Runs while the app is in the foreground: announces your presence and keeps the dots fresh.
    /// Ends when the task is cancelled.
    func runForeground() async {
        runGeneration += 1
        let generation = runGeneration
        foregroundSince = Date()
        // A server rule or a different network may have changed while the app was away.
        announcePausedUntil = nil
        while !Task.isCancelled {
            await announce(foreground: true)
            await checkOwnPresence()
            await pollRound()
            try? await Task.sleep(nanoseconds: UInt64(PresenceSchedule.tick * 1_000_000_000))
        }
        // Another account was opened, or the app went away (a newer run may already have started).
        if runGeneration == generation { foregroundSince = nil }
    }

    /// The app went to the background: "unavailable" (or "offline" for invisible).
    func enterBackground() async {
        runGeneration += 1
        foregroundSince = nil
        for _ in 0..<30 where announcing {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        announcePausedUntil = nil
        await announce(foreground: false)
    }

    /// Your status changed (here or on another device): announce it right away.
    func ownStatusChanged() async {
        guard foregroundSince != nil else { return }
        await announce(foreground: true)
    }

    // MARK: - Your own presence

    private var ownStatusKey: String { "diddy.presence.status.\(account?.id ?? "")" }

    /// The status you picked in Diddy. Nil while it cannot be known yet, so somebody who is
    /// invisible is never announced as online just because their profile has not loaded.
    /// Do Not Disturb reads it too (DoNotDisturb.swift).
    var ownStatus: String? {
        guard let account else { return nil }
        if let status = account.diddyProfiles[account.userId]?.status?.rawValue { return status }
        let cached = UserDefaults.standard.string(forKey: ownStatusKey)
        if account.diddyLoadedAt != nil, !account.diddyLoading { return cached ?? "online" }
        if let cached { return cached }
        // No options room to read it from (or it takes long): online, like desktop's default.
        if let since = foregroundSince, Date().timeIntervalSince(since) > 30 { return "online" }
        return nil
    }

    private func announce(foreground: Bool) async {
        guard let account, !announcing, let chosen = ownStatus else { return }
        if let status = account.diddyProfiles[account.userId]?.status?.rawValue {
            UserDefaults.standard.set(status, forKey: ownStatusKey)
        }
        let now = Date()
        if let announcePausedUntil, now < announcePausedUntil { return }
        let wanted = PresenceLogic.announcement(chosen: chosen, foreground: foreground)
        let heartbeat = PresenceSchedule.heartbeat(serverKeepsPresence: serverKeepsPresence)
        guard PresenceSchedule.shouldAnnounce(wanted, last: lastAnnounced, lastAt: lastAnnouncedAt, now: now, heartbeat: heartbeat) else { return }
        announcing = true
        defer { announcing = false }
        let response = await request("PUT", path: statusPath(account.userId), body: wanted.body)
        switch PresenceSchedule.outcome(status: response.status, errcode: response.errcode) {
        case .ok:
            lastAnnounced = wanted
            lastAnnouncedAt = Date()
        case .rateLimited:
            announcePausedUntil = Date().addingTimeInterval(PresenceSchedule.rateLimitWait(response.retryAfter))
        case .refused:
            // Presence turned off or not allowed: try again much later.
            announcePausedUntil = Date().addingTimeInterval(PresenceSchedule.maxBackoff)
        case .failed:
            announcePausedUntil = Date().addingTimeInterval(PresenceSchedule.refresh)
        }
    }

    /// Reads your own presence back once after announcing "online", to learn whether the server
    /// keeps it (and has presence at all).
    private func checkOwnPresence() async {
        guard let account, serverKeepsPresence == nil, lastAnnounced?.presence == "online",
              let at = lastAnnouncedAt, Date().timeIntervalSince(at) >= PresenceSchedule.ownCheckDelay else { return }
        if let ownCheckRetryAt, Date() < ownCheckRetryAt { return }
        let response = await request("GET", path: statusPath(account.userId))
        guard response.status == 200, let json = response.json,
              let own = MatrixPresence(json: json, receivedAt: Date()) else {
            ownCheckRetryAt = Date().addingTimeInterval(PresenceSchedule.refresh)
            return
        }
        let verdict = PresenceSchedule.ownCheck(own)
        probe.recordOwnAfterAnnouncing(informative: verdict.hasPresence)
        serverKeepsPresence = verdict.keepsPresence
        if !verdict.keepsPresence {
            // It already dropped you: say "online" again now, then every few seconds.
            await announceAgain()
        }
    }

    private func announceAgain() async {
        lastAnnouncedAt = nil
        await announce(foreground: foregroundSince != nil)
    }

    // MARK: - Asking for others

    private func maxAge(onDemand: Bool) -> TimeInterval {
        if serverHasPresence == false { return PresenceSchedule.noPresenceRefresh }
        return onDemand ? PresenceSchedule.onDemandRefresh : PresenceSchedule.refresh
    }

    /// Asks soon for users that just came on screen, instead of waiting for the next round.
    private func kick() {
        guard !kickScheduled, foregroundSince != nil else { return }
        kickScheduled = true
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard let self else { return }
            self.kickScheduled = false
            await self.pollRound()
        }
    }

    private func pollRound() async {
        guard let account, foregroundSince != nil else { return }
        if let pausedUntil, Date() < pausedUntil { return }
        let me = account.userId
        let watched = watchers.keys.sorted()
        let partners = account.directMessages.compactMap(\.dmUserId).prefix(PresenceSchedule.maxDirectPartners)
        let ordered = (watched + partners).filter { $0 != me && $0.hasPrefix("@") && $0.contains(":") }
        let due = PresenceSchedule.pick(ordered, entries: entries, now: Date(), maxAge: maxAge(onDemand: false))
        for userId in due {
            guard !Task.isCancelled, foregroundSince != nil else { return }
            if let pausedUntil, Date() < pausedUntil { return }
            await fetch(userId)
        }
    }

    private func fetch(_ userId: String) async {
        guard !inFlight.contains(userId) else { return }
        inFlight.insert(userId)
        defer { inFlight.remove(userId) }
        let response = await request("GET", path: statusPath(userId))
        var outcome = PresenceSchedule.outcome(status: response.status, errcode: response.errcode)
        if case .rateLimited = outcome {
            outcome = .rateLimited(retryAfter: response.retryAfter)
            pausedUntil = Date().addingTimeInterval(PresenceSchedule.rateLimitWait(response.retryAfter))
        }
        if outcome == .ok {
            if let json = response.json, let presence = MatrixPresence(json: json, receivedAt: Date()) {
                if !presence.showsSame(as: presences[userId]) { presences[userId] = presence }
                probe.record(informative: presence.isInformative)
            } else {
                outcome = .failed
            }
        } else if response.errcode == "M_UNRECOGNIZED" {
            probe.recordUnsupported() // the server has no presence endpoint
        }
        // A failed request keeps the last answer; `state(of:)` drops it once it is too old.
        entries[userId] = PresenceSchedule.update(entries[userId] ?? PresenceSchedule.Entry(), outcome: outcome, now: Date())
    }

    // MARK: - HTTP

    private struct Response {
        var status = 0
        var json: [String: Any]?
        var errcode: String?
        var retryAfter: TimeInterval?
    }

    private func statusPath(_ userId: String) -> String {
        let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))
        let encoded = userId.addingPercentEncoding(withAllowedCharacters: allowed) ?? userId
        return "/_matrix/client/v3/presence/\(encoded)/status"
    }

    /// Like `MatrixAccount.clientRequest`, but with a short timeout and the status code, so 429s
    /// and refusals can be told apart. Never throws: status 0 means no answer.
    private func request(_ method: String, path: String, body: [String: Any]? = nil) async -> Response {
        guard let account, let session = try? account.client.session() else { return Response() }
        let base = session.homeserverUrl.hasSuffix("/") ? String(session.homeserverUrl.dropLast()) : session.homeserverUrl
        guard let url = URL(string: base + path) else { return Response() }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpMethod = method
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let http = response as? HTTPURLResponse
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            return Response(
                status: http?.statusCode ?? 0,
                json: json,
                errcode: json?["errcode"] as? String,
                retryAfter: PresenceSchedule.retryAfter(json: json, header: http?.value(forHTTPHeaderField: "Retry-After"))
            )
        } catch {
            return Response()
        }
    }
}
