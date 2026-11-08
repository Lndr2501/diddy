import AVFoundation
import Combine
import Foundation
import LiveKit
import MatrixRustSDK
import Security
import UIKit

/// Someone in the voice channel, shaped for the UI.
struct CallMember: Identifiable {
    let id: String
    let userId: String
    var name: String
    var avatarUrl: String?
    let isLocal: Bool
    var isSpeaking: Bool
    var microphoneOn: Bool
    var screenShare: LiveKit.VideoTrack?
    var camera: LiveKit.VideoTrack?
    /// In the call according to Matrix, but not connected to the media server (yet).
    var isConnecting = false
}

@MainActor
final class CallManager: ObservableObject {
    @Published private(set) var current: CallSession? {
        didSet {
            Sounds.shared.inCall = current != nil
            // The call takes the audio session over and keeps the app running itself.
            if current != nil { BackgroundKeepAlive.shared.stop(deactivate: false) }
        }
    }
    @Published private(set) var incoming: IncomingCall?
    @Published var error: String?
    /// Shows the call full screen; set when a call starts somewhere that has no call UI of its own.
    @Published var showCallScreen = false
    /// Switches to the account a call came in on, since the call screen shows the active account.
    var onAnswer: ((MatrixAccount) async -> Void)?

    private let incomingWindow = IncomingCallWindow()
    private var ringTimeout: Task<Void, Never>?
    /// Calls that have rung already, until they end. Declining must not ring again on the next update.
    private var rungRooms: Set<String> = []
    /// How long a call rings: the lifetime every notification we send and Element Call's carry.
    private static let ringSeconds: UInt64 = 30

    func join(account: MatrixAccount, roomId: String, roomName: String, showCallScreen present: Bool = false) async {
        if current?.roomId == roomId {
            if present { showCallScreen = true }
            return
        }
        if incoming?.roomId == roomId { endRinging() }
        await leave(silently: true)
        guard let room = account.room(roomId) else {
            error = "Join the channel first."
            return
        }
        let session = CallSession(account: account, room: room, roomName: roomName)
        session.onDropped = { [weak self, weak session] in
            guard let self, let session, self.current === session else { return }
            self.error = "The connection to the voice server was lost."
            Sounds.shared.play(.connectionLost)
            Task { await self.leave(silently: true) }
        }
        session.onDeclined = { [weak self, weak session] userId in
            guard let self, let session, self.current === session else { return }
            self.error = "\(account.name(of: userId)) declined the call."
            Sounds.shared.play(.callDeclined)
            Task { await self.leave(silently: true) }
        }
        current = session
        if present { showCallScreen = true }
        do {
            try await session.connect()
            Sounds.shared.play(.callJoined)
            await session.notifyRoom()
        } catch {
            self.error = error.friendlyMessage
            await session.disconnect()
            if current === session {
                current = nil
                showCallScreen = false
            }
            BackgroundKeepAlive.shared.refresh()
        }
    }

    func leave(silently: Bool = false) async {
        guard let session = current else { return }
        current = nil
        showCallScreen = false
        await session.disconnect()
        // The call released the audio session; in the background, keep running for notifications.
        BackgroundKeepAlive.shared.refresh()
        if !silently { Sounds.shared.play(.callLeft) }
    }

    // MARK: Ringing

    /// Rings when someone starts a call in a direct message. Reads room state rather than waiting
    /// for the notification event, so it also works when that event cannot be decrypted (yet).
    func roomsChanged(account: MatrixAccount, from old: [String: RoomSummary], to new: [RoomSummary]) {
        for room in new where room.isDirect && !room.isSpace && room.isJoined {
            let others = room.callParticipants.filter { $0 != account.userId }
            if others.isEmpty { rungRooms.remove(room.id) }
            if let ringing = incoming, ringing.roomId == room.id {
                // Everyone left, or you picked up on another device.
                if others.isEmpty || room.callParticipants.contains(account.userId) { endRinging() }
                continue
            }
            let hadOthers = old[room.id]?.callParticipants.contains { $0 != account.userId } ?? false
            guard let caller = others.first, !hadOthers, account.canRing,
                  incoming == nil, current?.roomId != room.id, !rungRooms.contains(room.id),
                  !room.callParticipants.contains(account.userId) else { continue }
            startRinging(account: account, roomId: room.id, callerId: caller)
        }
    }

    private func startRinging(account: MatrixAccount, roomId: String, callerId: String) {
        rungRooms.insert(roomId)
        account.resolveProfiles([callerId], in: roomId)
        let call = IncomingCall(account: account, roomId: roomId, callerId: callerId)
        call.onCancelled = { [weak self, weak call] in
            guard let self, let call, self.incoming === call else { return }
            self.endRinging()
        }
        incoming = call
        // In the background a notification rings instead: it follows the silent switch.
        if !LocalNotifications.shared.announceCall(account: account, roomId: roomId, name: call.name) {
            Sounds.shared.startRinging()
        }
        incomingWindow.show(call, manager: self)
        Task { await call.watchTimeline() }
        ringTimeout = Task { [weak self, weak call] in
            try? await Task.sleep(nanoseconds: Self.ringSeconds * 1_000_000_000)
            guard !Task.isCancelled, let self, let call, self.incoming === call else { return }
            self.endRinging()
        }
    }

    private func endRinging() {
        ringTimeout?.cancel()
        Sounds.shared.stopLoop()
        if let call = incoming { LocalNotifications.shared.removeCall(account: call.account, roomId: call.roomId) }
        incoming?.stopWatching()
        incoming = nil
        incomingWindow.hide()
    }

    func answerIncoming() {
        guard let call = incoming else { return }
        let account = call.account
        let roomId = call.roomId
        let name = call.name
        endRinging()
        Task {
            await onAnswer?(account)
            await join(account: account, roomId: roomId, roomName: name, showCallScreen: true)
        }
    }

    func declineIncoming() async {
        guard let call = incoming else { return }
        endRinging()
        await call.decline()
    }
}

/// A voice channel connection: MatrixRTC membership (`org.matrix.msc3401.call.member`, the
/// legacy session format Element Call 0.20 uses by default), LiveKit media, and Element Call's
/// per-participant media encryption keys over encrypted to-device messages.
@MainActor
final class CallSession: NSObject, ObservableObject {
    @Published private(set) var members: [CallMember] = []
    @Published private(set) var state: String = "Connecting…"
    @Published private(set) var connected = false
    @Published private(set) var microphoneOn = true
    @Published private(set) var deafened = false
    @Published private(set) var cameraOn = false
    @Published private(set) var screenSharing = false
    @Published private(set) var speakerOn = true
    @Published private(set) var outgoing: OutgoingRing = .none
    /// A hint under the tiles that clears itself, so an old problem does not look like a current one.
    @Published var lastError: String? {
        didSet {
            errorDismissal?.cancel()
            guard lastError != nil else { return }
            errorDismissal = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                if !Task.isCancelled { self?.lastError = nil }
            }
        }
    }
    private var errorDismissal: Task<Void, Never>?
    var onDropped: (() -> Void)?
    var onDeclined: ((String) -> Void)?

    enum OutgoingRing { case none, ringing, noAnswer }

    let roomId: String
    let roomName: String
    let accountId: String

    private let account: MatrixAccount
    private let matrixRoom: MatrixRustSDK.Room
    private let liveKitRoom: LiveKit.Room
    private let keyProvider: LiveKit.BaseKeyProvider
    private var encrypted = false
    private var ownKey = Data()
    private let ownKeyIndex: Int32 = 0
    private var toDeviceHandle: TaskHandle?
    private var membershipRefresh: Task<Void, Never>?
    private var membershipCreatedTs: UInt64?
    private var transport: (serviceUrl: String, alias: String)?
    private var mutedBeforeDeafen = false
    private var leaving = false
    private var observers: Set<AnyCancellable> = []
    private var membershipEventId: String?
    private var declineHandle: TaskHandle?
    private var ringTimeout: Task<Void, Never>?

    private static let memberEventType = "org.matrix.msc3401.call.member"
    private static let keysEventType = "io.element.call.encryption_keys"
    /// Same as matrix-js-sdk's default membership expiry (4 h); refreshed before it runs out.
    private static let membershipExpiryMs: UInt64 = 4 * 60 * 60 * 1000
    /// MSC4075, what Diddy desktop and Element Call send and listen for.
    private static let notificationEventType = "org.matrix.msc4075.rtc.notification"
    private static let ringLifetimeMs: UInt64 = 30_000

    init(account: MatrixAccount, room: MatrixRustSDK.Room, roomName: String) {
        self.account = account
        self.matrixRoom = room
        self.roomId = room.id()
        self.roomName = roomName
        self.accountId = account.id
        // Element Call: per-participant keys, HKDF derivation, ratchet window 10, 256 key slots.
        keyProvider = LiveKit.BaseKeyProvider(options: LiveKit.KeyProviderOptions(
            sharedKey: false,
            ratchetWindowSize: 10,
            keyRingSize: 256,
            keyDerivationAlgorithm: .hkdf
        ))
        liveKitRoom = LiveKit.Room()
        super.init()
        liveKitRoom.add(delegate: self)
        // Names arrive after the first tile is drawn, and people show up in Matrix before LiveKit.
        account.$profiles.dropFirst().receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshMembers() }.store(in: &observers)
        account.$rooms.dropFirst().receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshMembers() }.store(in: &observers)
        refreshMembers()
    }

    private var ownUserId: String { account.userId }
    private var ownDeviceId: String { account.deviceId }
    private var ownIdentity: String { "\(ownUserId):\(ownDeviceId)" }
    private var stateKey: String { "_\(ownUserId)_\(ownDeviceId)_m.call" }

    // MARK: Connect / disconnect

    func connect() async throws {
        encrypted = await matrixRoom.isEncrypted()
        let transport = try await chooseTransport()
        self.transport = transport
        state = "Getting voice server access…"
        let sfu = try await requestSFUConfig(serviceUrl: transport.serviceUrl)

        if encrypted {
            ownKey = try Self.randomKey()
            toDeviceHandle = account.client.subscribeToCustomToDeviceMessages(
                eventTypes: [Self.keysEventType],
                listener: ToDeviceListener { [weak self] message in
                    Task { @MainActor in self?.receiveKeys(message) }
                }
            )
        }

        let roomOptions = LiveKit.RoomOptions(
            // No broadcast extension (a second App ID would cost sideloaders one of their few free ones):
            // iOS 27+ captures the whole screen in-process with ScreenCaptureKit, older iOS only Diddy itself.
            defaultScreenShareCaptureOptions: LiveKit.ScreenShareCaptureOptions(
                dimensions: .h1080_169, fps: 15, appAudio: true,
                useBroadcastExtension: false, useScreenCaptureKit: true
            ),
            adaptiveStream: true,
            dynacast: true,
            e2eeOptions: encrypted ? LiveKit.E2EEOptions(keyProvider: keyProvider) : nil
        )
        state = "Connecting…"
        try configureAudioSession()
        NoiseSuppression.apply()
        try await liveKitRoom.connect(url: sfu.url, token: sfu.jwt, roomOptions: roomOptions)

        if encrypted {
            keyProvider.setKey(keyData: ownKey, participantId: liveKitRoom.localParticipant.identity?.stringValue ?? ownIdentity, index: ownKeyIndex)
        }
        refreshMembers()
        do {
            try await sendMembership()
        } catch {
            throw DiddyError("You do not have permission to join a call in this room. An admin has to allow it.")
        }
        if encrypted { await distributeKey(to: Array(liveKitRoom.remoteParticipants.values)) }

        // Without microphone access you still join and listen, as on Discord.
        if await AVCaptureDevice.requestAccess(for: .audio) {
            do {
                _ = try await liveKitRoom.localParticipant.setMicrophone(enabled: true)
            } catch {
                microphoneOn = false
                lastError = "The microphone could not be started: \(error.friendlyMessage)"
            }
        } else {
            microphoneOn = false
            lastError = "Microphone access is off. You can listen, and turn it on under Settings > Diddy."
        }
        connected = true
        state = "Voice connected"
        scheduleMembershipRefresh()
        refreshMembers()
    }

    func disconnect() async {
        leaving = true
        stopOutgoingRing()
        errorDismissal?.cancel()
        observers.removeAll()
        membershipRefresh?.cancel()
        toDeviceHandle?.cancel()
        toDeviceHandle = nil
        if connected || membershipCreatedTs != nil {
            // An empty content ends our membership for everyone else.
            _ = try? await matrixRoom.sendStateEventRaw(eventType: Self.memberEventType, stateKey: stateKey, content: "{}", requestConfigOverride: nil)
        }
        await liveKitRoom.disconnect()
        connected = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: Controls

    func toggleMicrophone() async {
        let enable = !microphoneOn
        if enable {
            guard await AVCaptureDevice.requestAccess(for: .audio) else {
                lastError = "Microphone access is off. Turn it on under Settings > Diddy."
                return
            }
            if deafened { deafened = false; applyDeafen() }
        }
        do {
            _ = try await liveKitRoom.localParticipant.setMicrophone(enabled: enable)
            microphoneOn = enable
            Sounds.shared.play(enable ? .unmute : .mute)
        } catch { lastError = error.friendlyMessage }
        refreshMembers()
    }

    /// Discord semantics: deafen silences everyone and mutes the microphone; undeafen restores
    /// both, but stays muted if you had muted yourself before.
    func toggleDeafen() async {
        if !deafened { mutedBeforeDeafen = !microphoneOn }
        deafened.toggle()
        applyDeafen()
        Sounds.shared.play(deafened ? .deafen : .undeafen)
        let enable = !deafened && !mutedBeforeDeafen
        do {
            _ = try await liveKitRoom.localParticipant.setMicrophone(enabled: enable)
            microphoneOn = enable
        } catch { lastError = error.friendlyMessage }
        refreshMembers()
    }

    func toggleSpeaker() {
        speakerOn.toggle()
        AudioManager.shared.isSpeakerOutputPreferred = speakerOn
    }

    func toggleCamera() async {
        do {
            _ = try await liveKitRoom.localParticipant.setCamera(enabled: !cameraOn)
            cameraOn.toggle()
            Sounds.shared.play(cameraOn ? .cameraOn : .cameraOff)
        } catch {
            lastError = "The camera could not be started. Check that Diddy may use it under Settings > Diddy."
        }
        refreshMembers()
    }

    /// iOS 27+: the system picker, then ScreenCaptureKit in-process (whole screen, other apps too).
    /// iOS 16–26: in-app ReplayKit capture, which only sees Diddy itself (Apple allows whole-screen
    /// capture there only from a broadcast extension, which this app deliberately does not have).
    func toggleScreenShare() async {
        do {
            _ = try await liveKitRoom.localParticipant.setScreenShare(enabled: !screenSharing)
            let sharing = liveKitRoom.localParticipant.isScreenShareEnabled()
            if sharing != screenSharing {
                Sounds.shared.play(sharing ? .screenShareStarted : .screenShareStopped)
            } else if !sharing {
                // Cancelling the system prompt, or a device that cannot capture, ends here without an error.
                lastError = "Screen sharing did not start."
            }
            screenSharing = sharing
        } catch { lastError = "Screen sharing did not start: \(error.friendlyMessage)" }
        refreshMembers()
    }

    private func applyDeafen() {
        for participant in liveKitRoom.remoteParticipants.values {
            for publication in participant.audioTracks {
                (publication.track as? LiveKit.RemoteAudioTrack)?.volume = deafened ? 0 : 1
            }
        }
    }

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker])
    }

    // MARK: MatrixRTC

    /// Element Call's "oldest_membership" focus selection: everybody uses the LiveKit service of
    /// whoever has been in the call longest. Without anyone in the call, our homeserver's own
    /// MatrixRTC transport (MSC4143) is used.
    private func chooseTransport() async throws -> (serviceUrl: String, alias: String) {
        state = "Finding voice server…"
        let now = UInt64(Date().timeIntervalSince1970 * 1000)
        var oldest: (created: UInt64, url: String, alias: String)?
        for event in (try? await matrixRoom.stateEvents(eventType: .callMember)) ?? [] {
            guard let data = event.contentJson.data(using: .utf8),
                  let content = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  content["application"] as? String == "m.call",
                  let foci = content["foci_preferred"] as? [[String: Any]],
                  let focus = foci.first(where: { $0["type"] as? String == "livekit" }),
                  let url = focus["livekit_service_url"] as? String
            else { continue }
            let created = (content["created_ts"] as? NSNumber)?.uint64Value ?? event.timestamp ?? now
            let expires = (content["expires"] as? NSNumber)?.uint64Value ?? Self.membershipExpiryMs
            if created + expires < now { continue }
            if event.stateKey == stateKey { continue }
            if oldest == nil || created < oldest!.created {
                oldest = (created, url, focus["livekit_alias"] as? String ?? roomId)
            }
        }
        if let oldest { return (oldest.url, oldest.alias) }

        let transports = try await account.client.discoverRtcTransports() ?? []
        for transport in transports {
            if case .liveKit(let serviceUrl) = transport { return (serviceUrl, roomId) }
        }
        throw DiddyError("Your homeserver does not offer a MatrixRTC voice server (MSC4143 rtc_foci / LiveKit). Voice channels need one, like on the desktop app.")
    }

    private struct SFUConfig: Decodable { let url: String; let jwt: String }

    /// The JWT service's legacy endpoint (what Element Call uses for its own connection in the
    /// default mode): our LiveKit identity becomes "@user:server:DEVICE".
    private func requestSFUConfig(serviceUrl: String) async throws -> SFUConfig {
        let token = try await account.client.requestOpenidToken()
        let body: [String: Any] = [
            "room": roomId,
            "openid_token": [
                "access_token": token.accessToken,
                "token_type": token.tokenType,
                "matrix_server_name": token.matrixServerName,
                "expires_in": token.expiresInSeconds,
            ],
            "device_id": ownDeviceId,
        ]
        let base = serviceUrl.hasSuffix("/") ? String(serviceUrl.dropLast()) : serviceUrl
        guard let url = URL(string: base + "/sfu/get") else { throw DiddyError("Invalid voice server URL.") }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw DiddyError("The voice server refused access (\((response as? HTTPURLResponse)?.statusCode ?? 0)). \(text.prefix(200))")
        }
        return try JSONDecoder().decode(SFUConfig.self, from: data)
    }

    private func sendMembership() async throws {
        guard let transport else { return }
        let now = UInt64(Date().timeIntervalSince1970 * 1000)
        let created = membershipCreatedTs ?? now
        var content: [String: Any] = [
            "application": "m.call",
            "call_id": "",
            "scope": "m.room",
            "device_id": ownDeviceId,
            "membershipID": ownIdentity,
            "expires": (now - created) + Self.membershipExpiryMs,
            "focus_active": ["type": "livekit", "focus_selection": "oldest_membership"],
            "foci_preferred": [[
                "type": "livekit",
                "livekit_service_url": transport.serviceUrl,
                "livekit_alias": transport.alias,
            ]],
        ]
        if membershipCreatedTs != nil { content["created_ts"] = created }
        let json = String(data: try JSONSerialization.data(withJSONObject: content), encoding: .utf8) ?? "{}"
        membershipEventId = try await matrixRoom.sendStateEventRaw(eventType: Self.memberEventType, stateKey: stateKey, content: json, requestConfigOverride: nil)
        membershipCreatedTs = created
    }

    // MARK: Ringing others

    /// Starting a call tells the room, as Diddy desktop does: a direct message rings, a text channel
    /// gets a quiet notification. Voice channels stay silent, being in one is the whole point.
    func notifyRoom() async {
        guard let membershipEventId, !account.isVoiceChannel(roomId), !someoneElseIsHere,
              let summary = account.summary(for: roomId) else { return }
        let content: [String: Any] = [
            "m.mentions": ["user_ids": [String](), "room": true],
            "notification_type": summary.isDirect ? "ring" : "notification",
            "m.relates_to": ["event_id": membershipEventId, "rel_type": "m.reference"],
            "sender_ts": UInt64(Date().timeIntervalSince1970 * 1000),
            "lifetime": Self.ringLifetimeMs,
            "m.call.intent": "audio",
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: content),
              let eventId = try? await matrixRoom.sendRaw(
                eventType: Self.notificationEventType,
                content: String(decoding: data, as: UTF8.self),
                requestConfigOverride: nil
              ),
              summary.isDirect, !leaving else { return }

        outgoing = .ringing
        Sounds.shared.startRingback()
        // Reaches the other person while their Diddy is closed, if they set up call alerts.
        Task { [account, roomId] in await CallPush.shared.notify(account: account, roomId: roomId) }
        let ownUserId = ownUserId
        declineHandle = try? matrixRoom.subscribeToCallDeclineEvents(
            rtcNotificationEventId: eventId,
            listener: CallDeclineUpdates { [weak self] userId in
                guard userId != ownUserId else { return }
                Task { @MainActor in
                    guard let self, self.outgoing != .none else { return }
                    self.stopOutgoingRing()
                    self.onDeclined?(userId)
                }
            }
        )
        ringTimeout = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.ringLifetimeMs * 1_000_000)
            guard !Task.isCancelled, let self, self.outgoing == .ringing else { return }
            self.stopOutgoingRing()
            self.outgoing = .noAnswer
            Sounds.shared.play(.noAnswer)
        }
    }

    private var someoneElseIsHere: Bool {
        !liveKitRoom.remoteParticipants.isEmpty
            || (account.summary(for: roomId)?.callParticipants.contains { $0 != ownUserId } ?? false)
    }

    private func stopOutgoingRing() {
        ringTimeout?.cancel()
        declineHandle?.cancel()
        declineHandle = nil
        if outgoing == .ringing { Sounds.shared.stopLoop() }
        outgoing = .none
    }

    private func scheduleMembershipRefresh() {
        membershipRefresh?.cancel()
        membershipRefresh = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3 * 60 * 60 * 1_000_000_000)
                guard !Task.isCancelled else { return }
                try? await self?.sendMembership()
            }
        }
    }

    // MARK: Media keys

    /// Fails instead of returning a predictable (all-zero) key when the system RNG reports an error.
    private static func randomKey() throws -> Data {
        var bytes = [UInt8](repeating: 0, count: 16)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else {
            throw DiddyError("Could not create the call encryption key (OSStatus \(status)).")
        }
        return Data(bytes)
    }

    /// LiveKit identities of legacy members are "@user:server:DEVICE"; device ids have no colon.
    private static func split(identity: String) -> (userId: String, deviceId: String)? {
        guard let index = identity.lastIndex(of: ":"), identity.hasPrefix("@") else { return nil }
        let userId = String(identity[..<index])
        let deviceId = String(identity[identity.index(after: index)...])
        guard userId.contains(":"), !deviceId.isEmpty else { return nil }
        return (userId, deviceId)
    }

    private func distributeKey(to participants: [LiveKit.RemoteParticipant]) async {
        guard encrypted, !ownKey.isEmpty else { return }
        var recipients: [String: [String]] = [:]
        for participant in participants {
            guard let identity = participant.identity?.stringValue, let parts = Self.split(identity: identity) else { continue }
            recipients[parts.userId, default: []].append(parts.deviceId)
        }
        guard !recipients.isEmpty else { return }
        let content: [String: Any] = [
            "keys": ["index": ownKeyIndex, "key": ownKey.base64EncodedString()],
            "room_id": roomId,
            "member": ["claimed_device_id": ownDeviceId, "id": ownIdentity],
            "session": ["call_id": "", "application": "m.call", "scope": "m.room"],
            "sent_ts": UInt64(Date().timeIntervalSince1970 * 1000),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: content),
              let json = String(data: data, encoding: .utf8) else { return }
        do {
            _ = try await account.client.sendEncryptedToDeviceMessage(eventType: Self.keysEventType, recipients: recipients, content: json)
        } catch {
            lastError = "Could not share the call key: \(error.friendlyMessage)"
        }
    }

    private func receiveKeys(_ message: ToDeviceMessage) {
        guard message.eventType == Self.keysEventType,
              let data = message.content.data(using: .utf8),
              let content = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              content["room_id"] as? String == roomId,
              let keys = content["keys"] as? [String: Any],
              let keyBase64 = keys["key"] as? String,
              let key = Self.decodeBase64(keyBase64),
              let index = (keys["index"] as? NSNumber)?.int32Value,
              let member = content["member"] as? [String: Any],
              let device = member["claimed_device_id"] as? String
        else { return }
        // Element Call maps the key to the sender's LiveKit identity for legacy members.
        keyProvider.setKey(keyData: key, participantId: "\(message.senderId):\(device)", index: index)
    }

    /// Whether this iOS can share the whole screen without an extension.
    static var sharesWholeScreen: Bool {
        if #available(iOS 27.0, *) { return true }
        return false
    }

    /// Element Call sends unpadded base64.
    private static func decodeBase64(_ string: String) -> Data? {
        var padded = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while padded.count % 4 != 0 { padded += "=" }
        return Data(base64Encoded: padded)
    }

    // MARK: Members

    /// What other people do. Deafened means silence, and the join itself is not news to anyone.
    fileprivate func playForOthers(_ sound: Sound) {
        guard connected, !leaving, !deafened else { return }
        Sounds.shared.play(sound)
    }

    fileprivate func refreshMembers() {
        var result: [CallMember] = []
        let local = liveKitRoom.localParticipant
        result.append(member(for: local, isLocal: true))
        for participant in liveKitRoom.remoteParticipants.values.sorted(by: { ($0.identity?.stringValue ?? "") < ($1.identity?.stringValue ?? "") }) {
            result.append(member(for: participant, isLocal: false))
        }
        // Whoever Matrix says is in the call but LiveKit has not delivered. Without this they are
        // simply missing from the call. Identities we cannot read could be any of them, so then
        // nothing is added rather than showing somebody twice.
        let unreadable = liveKitRoom.remoteParticipants.values.contains { participant in
            participant.identity.flatMap { Self.split(identity: $0.stringValue) } == nil
        }
        if !unreadable {
            let present = Set(result.map(\.userId))
            for userId in account.summary(for: roomId)?.callParticipants ?? [] where !present.contains(userId) {
                let profile = account.profiles[userId]
                result.append(CallMember(
                    id: "matrix:\(userId)", userId: userId,
                    name: account.name(of: userId), avatarUrl: profile?.avatarUrl,
                    isLocal: false, isSpeaking: false, microphoneOn: true, isConnecting: true
                ))
            }
        }
        account.resolveProfiles(result.map(\.userId), in: roomId)
        members = result
        screenSharing = local.isScreenShareEnabled()
        if outgoing != .none, someoneElseIsHere { stopOutgoingRing() }
    }

    private func member(for participant: LiveKit.Participant, isLocal: Bool) -> CallMember {
        let identity = participant.identity?.stringValue ?? (isLocal ? ownIdentity : UUID().uuidString)
        let userId = Self.split(identity: identity)?.userId ?? identity
        let known = account.profiles[userId]
        var screen: LiveKit.VideoTrack?
        var camera: LiveKit.VideoTrack?
        for publication in participant.videoTracks {
            guard let track = publication.track as? LiveKit.VideoTrack, !publication.isMuted else { continue }
            if publication.source == .screenShareVideo { screen = track } else if publication.source == .camera { camera = track }
        }
        return CallMember(
            id: identity,
            userId: userId,
            name: known?.name ?? participant.name.flatMap { $0.isEmpty ? nil : $0 } ?? account.name(of: userId),
            avatarUrl: known?.avatarUrl,
            isLocal: isLocal,
            isSpeaking: participant.isSpeaking,
            microphoneOn: isLocal ? microphoneOn : participant.isMicrophoneEnabled(),
            screenShare: screen,
            camera: camera
        )
    }
}

extension CallSession: LiveKit.RoomDelegate {
    nonisolated func room(_ room: LiveKit.Room, participantDidConnect participant: LiveKit.RemoteParticipant) {
        Task { @MainActor in
            await self.distributeKey(to: [participant])
            self.refreshMembers()
            self.playForOthers(.userJoined)
        }
    }

    nonisolated func room(_ room: LiveKit.Room, participantDidDisconnect participant: LiveKit.RemoteParticipant) {
        Task { @MainActor in
            self.refreshMembers()
            self.playForOthers(.userLeft)
        }
    }

    nonisolated func room(_ room: LiveKit.Room, didUpdateSpeakingParticipants participants: [LiveKit.Participant]) {
        Task { @MainActor in self.refreshMembers() }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: LiveKit.RemoteParticipant, didSubscribeTrack publication: LiveKit.RemoteTrackPublication) {
        Task { @MainActor in
            if self.deafened { self.applyDeafen() }
            self.refreshMembers()
        }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: LiveKit.RemoteParticipant, didUnsubscribeTrack publication: LiveKit.RemoteTrackPublication) {
        Task { @MainActor in self.refreshMembers() }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: LiveKit.Participant, trackPublication: LiveKit.TrackPublication, didUpdateIsMuted isMuted: Bool) {
        Task { @MainActor in self.refreshMembers() }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: LiveKit.Participant, didUpdateName name: String) {
        Task { @MainActor in self.refreshMembers() }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: LiveKit.RemoteParticipant, didPublishTrack publication: LiveKit.RemoteTrackPublication) {
        Task { @MainActor in
            self.refreshMembers()
            if publication.source == .screenShareVideo { self.playForOthers(.screenShareStarted) }
        }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: LiveKit.RemoteParticipant, didUnpublishTrack publication: LiveKit.RemoteTrackPublication) {
        Task { @MainActor in
            self.refreshMembers()
            if publication.source == .screenShareVideo { self.playForOthers(.screenShareStopped) }
        }
    }

    nonisolated func room(_ room: LiveKit.Room, didDisconnectWithError error: LiveKit.LiveKitError?) {
        Task { @MainActor in
            // LiveKit has given up reconnecting. Without this the call UI would stay up, silently dead.
            guard self.connected, !self.leaving else { return }
            self.onDropped?()
        }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: LiveKit.LocalParticipant, didPublishTrack publication: LiveKit.LocalTrackPublication) {
        Task { @MainActor in self.refreshMembers() }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: LiveKit.LocalParticipant, didUnpublishTrack publication: LiveKit.LocalTrackPublication) {
        Task { @MainActor in self.refreshMembers() }
    }

    nonisolated func room(_ room: LiveKit.Room, didUpdateConnectionState connectionState: LiveKit.ConnectionState, from oldConnectionState: LiveKit.ConnectionState) {
        Task { @MainActor in
            switch connectionState {
            case .connected: self.state = "Voice connected"
            case .reconnecting: self.state = "Reconnecting…"
            case .disconnected: self.state = "Disconnected"
            default: break
            }
        }
    }
}
