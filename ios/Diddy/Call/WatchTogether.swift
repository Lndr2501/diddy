import Combine
import Foundation
import MatrixRustSDK

// Watch together (#83) on iOS, the counterpart of the desktop's state/watchTogether.ts and
// components/WatchTogetherSync.tsx. The shared video state travels between the members of the
// call as short-lived to-device messages `app.diddy.watch_together` to their devices (nothing is
// stored in the room). End-to-end encrypted where the SDK knows the device; devices it does not
// know get the message plain (#171), like the desktop since 1.5.3. Late joiners ask for the state.
// Logic and wire format: WatchTogetherLogic.swift.

/// Your own Watch together settings (this device only), stored like the desktop's
/// `diddyWatchTogether` localStorage entry.
@MainActor
final class WatchTogetherPrefsStore: ObservableObject {
    static let shared = WatchTogetherPrefsStore()

    @Published private(set) var prefs: WatchPrefs

    private init() {
        prefs = WatchPrefs.decode(UserDefaults.standard.data(forKey: WatchPrefs.storageKey))
    }

    func update(_ change: (inout WatchPrefs) -> Void) {
        var next = prefs
        change(&next)
        guard next != prefs else { return }
        prefs = next
        if let data = next.encode() { UserDefaults.standard.set(data, forKey: WatchPrefs.storageKey) }
    }

    func setCategory(_ category: String, on: Bool) {
        update { prefs in
            let rest = prefs.categories.filter { $0 != category }
            prefs.categories = on ? rest + [category] : rest
        }
    }
}

struct WatchToast: Equatable {
    let id: Int
    let text: String
}

/// The shared video of one call. Created by CallSession; `start()` once connected, `stop()` on leave.
@MainActor
final class WatchTogetherSession: ObservableObject {
    /// The transport is there: you are in the call and the feature is on.
    @Published private(set) var available = false
    @Published private(set) var shared: SharedWatch?
    /// The session you closed for yourself (it keeps running for the others).
    @Published private(set) var closedSession: String?
    @Published private(set) var toast: WatchToast?

    let roomId: String
    let ownUserId: String
    private let account: MatrixAccount
    private let devices: () -> [WatchDevice]
    private let isMember: (String) -> Bool
    private let displayName: (String) -> String

    private var started = false
    private var handle: TaskHandle?
    private var retry: Task<Void, Never>?
    private var toastTask: Task<Void, Never>?
    private var toastCounter = 0
    private var prefsObserver: AnyCancellable?

    init(
        account: MatrixAccount,
        roomId: String,
        devices: @escaping () -> [WatchDevice],
        isMember: @escaping (String) -> Bool,
        displayName: @escaping (String) -> String
    ) {
        self.account = account
        self.roomId = roomId
        self.ownUserId = account.userId
        self.devices = devices
        self.isMember = isMember
        self.displayName = displayName
    }

    static var nowMs: Double { Date().timeIntervalSince1970 * 1000 }

    /// Something is playing (or paused) for the call.
    var running: Bool {
        guard let shared else { return false }
        return shared.state != .stopped
    }

    /// Running, but you closed it for yourself.
    var hidden: Bool { running && closedSession == shared?.session }

    // MARK: Lifecycle

    func start() {
        guard !started else { return }
        started = true
        prefsObserver = WatchTogetherPrefsStore.shared.$prefs
            .map(\.enabled)
            .removeDuplicates()
            .sink { [weak self] enabled in
                Task { @MainActor in self?.setActive(enabled) }
            }
    }

    func stop() {
        started = false
        prefsObserver = nil
        setActive(false)
    }

    private func setActive(_ on: Bool) {
        let active = on && started
        if active == (handle != nil) { return }
        if active {
            handle = account.client.subscribeToCustomToDeviceMessages(
                eventTypes: [WatchProtocol.eventType],
                listener: ToDeviceListener { [weak self] message in
                    Task { @MainActor in self?.receive(message) }
                }
            )
            available = true
            // late join: ask whoever is there; once more a little later in case the call list was empty
            ask()
            retry = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                guard !Task.isCancelled, let self, self.handle != nil, self.shared == nil else { return }
                self.ask()
            }
        } else {
            handle?.cancel()
            handle = nil
            retry?.cancel()
            retry = nil
            toastTask?.cancel()
            toastTask = nil
            available = false
            shared = nil
            closedSession = nil
            toast = nil
        }
    }

    // MARK: Receiving

    private func receive(_ message: ToDeviceMessage) {
        guard handle != nil, message.eventType == WatchProtocol.eventType, message.senderId != ownUserId,
              let msg = WatchProtocol.parse(json: message.content) else { return }
        let sender = message.senderId
        switch msg {
        case .request(let room):
            guard room == roomId, isMember(sender) else { return }
            if let shared, shared.state != .stopped {
                send(WatchProtocol.stateContent(room: roomId, WatchProtocol.rebase(shared, now: Self.nowMs)), onlyUser: sender)
            }
        case .state(let state):
            guard state.room == roomId, isMember(sender) else { return }
            let previous = shared
            let next = WatchProtocol.fromMessage(state, sender: sender, now: Self.nowMs)
            guard WatchProtocol.isNewer(next, than: previous) else { return }
            shared = next
            if next.state != .stopped && previous?.session != next.session {
                showToast("\(displayName(sender)) started watching together")
            } else if next.state == .stopped, let previous, previous.state != .stopped {
                showToast("\(displayName(sender)) stopped the video")
            }
        }
    }

    // MARK: Changes of your own

    func startWatching(videoId: String, start: Double) {
        guard handle != nil else { return }
        publish(WatchProtocol.startWatch(videoId: videoId, start: start, previous: shared, sender: ownUserId, now: Self.nowMs))
        closedSession = nil
    }

    /// A change you made in the player (play, pause, seek, speed, skip).
    func change(_ patch: WatchPatch) {
        guard handle != nil, let shared, shared.state != .stopped else { return }
        publish(WatchProtocol.nextChange(shared, patch: patch, sender: ownUserId, now: Self.nowMs))
    }

    func stopForEveryone() {
        change(WatchPatch(state: .stopped))
    }

    func closeForMe() {
        if let shared { closedSession = shared.session }
    }

    func reopen() {
        closedSession = nil
    }

    func showToast(_ text: String) {
        toastCounter += 1
        let id = toastCounter
        toast = WatchToast(id: id, text: text)
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled, let self, self.toast?.id == id else { return }
            self.toast = nil
        }
    }

    private func publish(_ next: SharedWatch) {
        shared = next
        send(WatchProtocol.stateContent(room: roomId, next))
    }

    private func ask() {
        send(WatchProtocol.requestContent(room: roomId))
    }

    // MARK: Sending

    /// Sends to the devices of the call members (all of them, or one user), never to ourselves.
    /// Encrypted for every device the SDK knows; the ones it could not serve get it plain (#171).
    private func send(_ content: [String: Any], onlyUser: String? = nil) {
        let recipients = WatchProtocol.recipients(devices(), ownUserId: ownUserId, onlyUser: onlyUser)
        guard !recipients.isEmpty else {
            DiagLog.shared.write("watchTogether: no other call device to send to")
            return
        }
        guard let json = WatchProtocol.json(content) else { return }
        let messages = { (targets: [String: [String]]) in WatchProtocol.plainMessages(targets, content: content) }
        let client = account.client
        Task { [weak self] in
            var plain: [String: [String]]
            do {
                let outcome = try await client.sendEncryptedToDeviceMessage(
                    eventType: WatchProtocol.eventType, recipients: recipients, content: json
                )
                plain = outcome.failures
                if !plain.isEmpty {
                    DiagLog.shared.write("watchTogether: \(WatchProtocol.deviceCount(plain)) device(s) without keys, sending plain")
                }
            } catch {
                DiagLog.shared.write("watchTogether: encrypted send failed, sending plain: \(error.localizedDescription)")
                plain = recipients
            }
            guard WatchProtocol.deviceCount(plain) > 0, let self else { return }
            await self.sendPlain(messages(plain))
        }
    }

    /// `PUT /sendToDevice`: the SDK only sends to-device messages encrypted.
    private func sendPlain(_ messages: [String: Any]) async {
        let txnId = "diddywatch\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        do {
            _ = try await account.clientRequest(
                "/_matrix/client/v3/sendToDevice/\(WatchProtocol.eventType)/\(txnId)",
                body: ["messages": messages],
                method: "PUT"
            )
        } catch {
            DiagLog.shared.write("watchTogether: send failed: \(error.localizedDescription)")
        }
    }
}
