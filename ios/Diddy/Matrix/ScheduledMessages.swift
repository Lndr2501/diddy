import Foundation
import MatrixRustSDK

/// "Send later" for one account: schedules messages on the server (MSC4140 delayed events) or on
/// this iPhone, sends the local ones when they are due and keeps the server ones in line with the
/// server's list. The rules are in SendLaterLogic.swift, like the desktop's sendLaterLogic.ts.
///
/// The Rust SDK has no API for delayed events, so the server calls go over HTTP. It also cannot
/// encrypt an event without sending it: in encrypted chats the message waits on the iPhone and
/// goes out through `Room.sendRaw`, which encrypts with the room's current keys at that time.
@MainActor
final class ScheduledMessageStore: ObservableObject {
    private static var stores: [String: ScheduledMessageStore] = [:]

    static func of(_ account: MatrixAccount) -> ScheduledMessageStore {
        if let store = stores[account.id] { return store }
        let store = ScheduledMessageStore(account: account)
        stores[account.id] = store
        return store
    }

    typealias Scheduled = SendLaterLogic.Scheduled

    @Published private(set) var items: [Scheduled] = []
    /// Scheduled on the server by another device (desktop, another iPhone).
    @Published private(set) var others: [SendLaterLogic.ServerMessage] = []
    /// Whether the homeserver lists MSC4140; nil until asked.
    @Published private(set) var serverSupport: Bool?
    /// Rooms whose encryption is known, for the route shown before scheduling.
    @Published private(set) var encryptedRooms: [String: Bool] = [:]
    /// Rooms where a message went out late, with the text to show there once.
    @Published var lateNotices: [String: String] = [:]

    private weak var account: MatrixAccount?
    private let accountId: String
    private var timer: Timer?
    private var lastServerSync: Date?
    private var syncing = false
    private var sendingIds: Set<String> = []

    private init(account: MatrixAccount) {
        self.account = account
        self.accountId = account.id
        items = Self.load(accountId: account.id)
    }

    // MARK: Storage

    private static func key(_ accountId: String) -> String { "diddy.scheduledMessages.\(accountId)" }

    private static func load(accountId: String) -> [Scheduled] {
        guard let data = UserDefaults.standard.data(forKey: key(accountId)),
              let list = try? JSONDecoder().decode([Scheduled].self, from: data) else { return [] }
        return list
    }

    private func save() {
        if let data = try? JSONEncoder().encode(items) { UserDefaults.standard.set(data, forKey: Self.key(accountId)) }
    }

    private func remove(_ ids: Set<String>) {
        guard items.contains(where: { ids.contains($0.id) }) else { return }
        items.removeAll { ids.contains($0.id) }
        save()
    }

    private var homeserver: String {
        (try? account?.client.session().homeserverUrl) ?? ""
    }

    private var maxDelayKey: String { "diddy.delayedEventsMaxMs.\(homeserver)" }

    /// The longest delay the server accepts, learned from M_MAX_DELAY_EXCEEDED (seconds).
    var knownMaxDelay: TimeInterval? {
        let ms = UserDefaults.standard.double(forKey: maxDelayKey)
        return ms > 0 ? ms / 1000 : nil
    }

    // MARK: Route

    /// Asks the server and the room what is possible (called when a chat opens).
    func prepare(roomId: String) async {
        if serverSupport == nil { serverSupport = await checkServerSupport() }
        if encryptedRooms[roomId] == nil, let room = account?.room(roomId) {
            encryptedRooms[roomId] = await room.isEncrypted()
        }
    }

    func routePreview(roomId: String, sendAt: Date, preferLocal: Bool) -> SendLaterLogic.RouteChoice {
        SendLaterLogic.chooseRoute(serverSupport: serverSupport ?? false, delay: sendAt.timeIntervalSinceNow,
                                   maxDelay: knownMaxDelay, encrypted: encryptedRooms[roomId] ?? true,
                                   canEncryptAhead: false, preferLocal: preferLocal)
    }

    private func checkServerSupport() async -> Bool {
        guard let account,
              let json = try? await account.clientRequest("/_matrix/client/versions"),
              let features = json["unstable_features"] as? [String: Any] else { return false }
        return features[SendLaterLogic.feature] as? Bool ?? false
    }

    // MARK: Scheduling

    /// Schedules a text message; returns where it waits.
    @discardableResult
    func schedule(roomId: String, content: [String: Any], draftText: String, replyEventId: String?,
                  sendAt: Date, preferLocal: Bool) async -> SendLaterLogic.RouteChoice {
        await prepare(roomId: roomId)
        var choice = routePreview(roomId: roomId, sendAt: sendAt, preferLocal: preferLocal)
        var delayId: String?
        if choice.route == .server {
            do {
                delayId = try await scheduleOnServer(roomId: roomId, content: content, delay: sendAt.timeIntervalSinceNow)
            } catch let error as ClientAPIError where error.maxDelay != nil {
                let limit = error.maxDelay?.maxDelayMs.map { Double($0) } ?? max(0, sendAt.timeIntervalSinceNow * 1000 - 1)
                UserDefaults.standard.set(limit, forKey: maxDelayKey)
                choice = SendLaterLogic.RouteChoice(route: .local, reason: .tooFarForServer)
            } catch {
                choice = SendLaterLogic.RouteChoice(route: .local, reason: .serverFailed)
            }
        }
        let now = Date()
        items.append(Scheduled(id: UUID().uuidString, accountId: accountId, roomId: roomId, sendAt: sendAt, createdAt: now,
                               route: choice.route, reason: choice.reason, delayId: delayId,
                               contentJSON: SendLaterLogic.json(content), draftText: draftText, replyEventId: replyEventId))
        save()
        wake()
        return choice
    }

    private static func path(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? value
    }

    private func scheduleOnServer(roomId: String, content: [String: Any], delay: TimeInterval) async throws -> String {
        guard let account else { throw DiddyError(L("ios.errorsExtra.notSignedIn")) }
        let txnId = "diddy-later-\(UUID().uuidString)"
        let ms = max(0, Int((delay * 1000).rounded()))
        // The delay parameter on the normal send endpoint, as Synapse and matrix-js-sdk do it.
        let path = "/_matrix/client/v3/rooms/\(Self.path(roomId))/send/m.room.message/\(Self.path(txnId))?\(SendLaterLogic.delayParam)=\(ms)"
        let json = try await account.clientRequest(path, body: content, method: "PUT")
        guard let delayId = json["delay_id"] as? String else {
            // A server that ignored the parameter would have sent it already.
            throw DiddyError(L("ios.errorsExtra.theServerDidNotScheduleTheMessage"))
        }
        return delayId
    }

    private static let delayedPrefix = "/_matrix/client/unstable/org.matrix.msc4140/delayed_events"

    /// Sends or cancels a server message. Newer servers take `/{id}/{action}`, Synapse the action in the body.
    private func updateOnServer(_ delayId: String, action: String) async throws {
        guard let account else { return }
        do {
            _ = try await account.clientRequest("\(Self.delayedPrefix)/\(Self.path(delayId))", body: ["action": action])
        } catch let error as ClientAPIError where error.errcode == "M_UNRECOGNIZED" {
            _ = try await account.clientRequest("\(Self.delayedPrefix)/\(Self.path(delayId))/\(action)", body: [:])
        }
    }

    /// Thrown when the server no longer has the message: it was sent or cancelled already.
    struct AlreadyGone: LocalizedError {
        var errorDescription: String? { "The server already sent or cancelled this message." }
    }

    func sendNow(_ item: Scheduled) async throws {
        if item.route == .server, let delayId = item.delayId {
            try await serverAction(delayId, action: "send") { self.remove([item.id]) }
        } else {
            remove([item.id])
            await sendLocal(item)
        }
    }

    func cancel(_ item: Scheduled) async throws {
        if item.route == .server, let delayId = item.delayId {
            try await serverAction(delayId, action: "cancel") { self.remove([item.id]) }
        } else {
            remove([item.id])
        }
    }

    func sendNow(other: SendLaterLogic.ServerMessage) async throws {
        try await serverAction(other.delayId, action: "send") { self.others.removeAll { $0.delayId == other.delayId } }
    }

    func cancel(other: SendLaterLogic.ServerMessage) async throws {
        try await serverAction(other.delayId, action: "cancel") { self.others.removeAll { $0.delayId == other.delayId } }
    }

    private func serverAction(_ delayId: String, action: String, done: () -> Void) async throws {
        do {
            try await updateOnServer(delayId, action: action)
            done()
        } catch let error as ClientAPIError where error.errcode == "M_NOT_FOUND" {
            done()
            throw AlreadyGone()
        }
        lastServerSync = nil
        wake()
    }

    // MARK: Running

    /// Sends what is due and plans the next check. Called on start, when sync runs and when the app comes back.
    func wake() {
        timer?.invalidate()
        timer = nil
        guard let account, account.syncState == .running else { return }
        sendDue()
        if lastServerSync.map({ Date().timeIntervalSince($0) > 60 }) ?? true { Task { await syncServer() } }
        let wait = SendLaterLogic.nextDueIn(items.filter { !sendingIds.contains($0.id) }, now: Date()) ?? 60
        timer = Timer.scheduledTimer(withTimeInterval: min(max(wait + 0.05, 1), 30), repeats: false) { [weak self] _ in
            Task { @MainActor in self?.wake() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func sendDue() {
        let now = Date()
        let due = SendLaterLogic.due(items, now: now).filter { !sendingIds.contains($0.id) }
        guard !due.isEmpty else { return }
        due.forEach { sendingIds.insert($0.id) }
        remove(Set(due.map(\.id)))
        for item in due {
            Task {
                await sendLocal(item)
                if SendLaterLogic.wasSentLate(sendAt: item.sendAt, sentAt: now) {
                    let when = SendLaterLogic.formatSendAt(item.sendAt, now: now, clock: ChatSettings.time)
                    lateNotices[item.roomId] = "A scheduled message was sent late: it was due \(when), but Diddy was not open."
                }
                sendingIds.remove(item.id)
            }
        }
    }

    private func sendLocal(_ item: Scheduled) async {
        guard let room = account?.room(item.roomId), room.membership() == .joined else {
            lateNotices[item.roomId] = "A scheduled message could not be sent: you are no longer in this chat."
            return
        }
        do {
            _ = try await room.sendRaw(eventType: "m.room.message", content: item.contentJSON, requestConfigOverride: nil)
        } catch {
            // Keep it and try again in a minute (no network, sync not ready yet).
            var retry = item
            retry.sendAt = Date().addingTimeInterval(60)
            items.append(retry)
            save()
            lateNotices[item.roomId] = "A scheduled message could not be sent yet (\(error.friendlyMessage)). Diddy tries again in a minute."
        }
    }

    private func syncServer() async {
        guard !syncing, let account else { return }
        if serverSupport == nil { serverSupport = await checkServerSupport() }
        guard serverSupport == true else { return }
        syncing = true
        defer { syncing = false }
        let requestedAt = Date()
        guard let json = try? await account.clientRequest(Self.delayedPrefix) else { return }
        lastServerSync = Date()
        let result = SendLaterLogic.reconcile(items, server: SendLaterLogic.parseDelayedEvents(json), requestedAt: requestedAt)
        remove(Set(result.gone.map(\.id)))
        // Encrypted ones from other devices cannot be read here (and may be Element Call's).
        others = result.others.filter { $0.type == "m.room.message" }
    }
}
