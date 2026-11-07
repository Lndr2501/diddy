import AVFoundation
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
}

@MainActor
final class CallManager: ObservableObject {
    @Published private(set) var current: CallSession?
    @Published var error: String?

    func join(account: MatrixAccount, roomId: String, roomName: String) async {
        if current?.roomId == roomId { return }
        await leave()
        guard let room = account.room(roomId) else {
            error = "Join the channel first."
            return
        }
        let session = CallSession(account: account, room: room, roomName: roomName)
        current = session
        do {
            try await session.connect()
        } catch {
            self.error = error.localizedDescription
            await session.disconnect()
            if current === session { current = nil }
        }
    }

    func leave() async {
        guard let session = current else { return }
        current = nil
        await session.disconnect()
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
    @Published var lastError: String?

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
    private var names: [String: (name: String, avatar: String?)] = [:]

    private static let memberEventType = "org.matrix.msc3401.call.member"
    private static let keysEventType = "io.element.call.encryption_keys"
    /// Same as matrix-js-sdk's default membership expiry (4 h); refreshed before it runs out.
    private static let membershipExpiryMs: UInt64 = 4 * 60 * 60 * 1000

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
            ownKey = Self.randomKey()
            toDeviceHandle = account.client.subscribeToCustomToDeviceMessages(
                eventTypes: [Self.keysEventType],
                listener: ToDeviceListener { [weak self] message in
                    Task { @MainActor in self?.receiveKeys(message) }
                }
            )
        }

        let roomOptions = LiveKit.RoomOptions(
            defaultScreenShareCaptureOptions: LiveKit.ScreenShareCaptureOptions(dimensions: .h1080_169, fps: 15, appAudio: true),
            adaptiveStream: true,
            dynacast: true,
            e2eeOptions: encrypted ? LiveKit.E2EEOptions(keyProvider: keyProvider) : nil
        )
        state = "Connecting…"
        try configureAudioSession()
        try await liveKitRoom.connect(url: sfu.url, token: sfu.jwt, roomOptions: roomOptions)

        if encrypted {
            keyProvider.setKey(keyData: ownKey, participantId: liveKitRoom.localParticipant.identity?.stringValue ?? ownIdentity, index: ownKeyIndex)
        }
        try await sendMembership()
        if encrypted { await distributeKey(to: Array(liveKitRoom.remoteParticipants.values)) }

        _ = try await liveKitRoom.localParticipant.setMicrophone(enabled: true)
        connected = true
        state = "Voice connected"
        scheduleMembershipRefresh()
        await loadNames()
        refreshMembers()
    }

    func disconnect() async {
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
        if enable && deafened { deafened = false; applyDeafen() }
        do {
            _ = try await liveKitRoom.localParticipant.setMicrophone(enabled: enable)
            microphoneOn = enable
        } catch { lastError = error.localizedDescription }
        refreshMembers()
    }

    /// Discord semantics: deafen silences everyone and mutes the microphone; undeafen restores both.
    func toggleDeafen() async {
        deafened.toggle()
        applyDeafen()
        do {
            _ = try await liveKitRoom.localParticipant.setMicrophone(enabled: !deafened)
            microphoneOn = !deafened
        } catch { lastError = error.localizedDescription }
        refreshMembers()
    }

    func toggleCamera() async {
        do {
            _ = try await liveKitRoom.localParticipant.setCamera(enabled: !cameraOn)
            cameraOn.toggle()
        } catch { lastError = error.localizedDescription }
        refreshMembers()
    }

    /// iOS 16–26: starts the ReplayKit broadcast picker (DiddyBroadcast extension, whole screen).
    /// iOS 27+: LiveKit captures in-process with ScreenCaptureKit.
    func toggleScreenShare() async {
        do {
            _ = try await liveKitRoom.localParticipant.setScreenShare(enabled: !screenSharing)
            screenSharing = liveKitRoom.localParticipant.isScreenShareEnabled()
        } catch { lastError = error.localizedDescription }
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
        _ = try await matrixRoom.sendStateEventRaw(eventType: Self.memberEventType, stateKey: stateKey, content: json, requestConfigOverride: nil)
        membershipCreatedTs = created
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

    private static func randomKey() -> Data {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
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
            lastError = "Could not share the call key: \(error.localizedDescription)"
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

    /// Element Call sends unpadded base64.
    private static func decodeBase64(_ string: String) -> Data? {
        var padded = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while padded.count % 4 != 0 { padded += "=" }
        return Data(base64Encoded: padded)
    }

    // MARK: Members

    private func loadNames() async {
        guard let iterator = try? await matrixRoom.membersNoSync() else { return }
        while let chunk = iterator.nextChunk(chunkSize: 200) {
            for member in chunk {
                names[member.userId] = (member.displayName ?? member.userId, member.avatarUrl)
            }
            if chunk.isEmpty { break }
        }
    }

    fileprivate func refreshMembers() {
        var result: [CallMember] = []
        let local = liveKitRoom.localParticipant
        result.append(member(for: local, isLocal: true))
        for participant in liveKitRoom.remoteParticipants.values.sorted(by: { ($0.identity?.stringValue ?? "") < ($1.identity?.stringValue ?? "") }) {
            result.append(member(for: participant, isLocal: false))
        }
        members = result
        screenSharing = local.isScreenShareEnabled()
    }

    private func member(for participant: LiveKit.Participant, isLocal: Bool) -> CallMember {
        let identity = participant.identity?.stringValue ?? UUID().uuidString
        let userId = Self.split(identity: identity)?.userId ?? identity
        let profile = names[userId]
        var screen: LiveKit.VideoTrack?
        var camera: LiveKit.VideoTrack?
        for publication in participant.videoTracks {
            guard let track = publication.track as? LiveKit.VideoTrack, !publication.isMuted else { continue }
            if publication.source == .screenShareVideo { screen = track } else if publication.source == .camera { camera = track }
        }
        return CallMember(
            id: identity,
            userId: userId,
            name: profile?.name ?? participant.name.flatMap { $0.isEmpty ? nil : $0 } ?? userId,
            avatarUrl: profile?.avatar,
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
            await self.loadNames()
            self.refreshMembers()
        }
    }

    nonisolated func room(_ room: LiveKit.Room, participantDidDisconnect participant: LiveKit.RemoteParticipant) {
        Task { @MainActor in self.refreshMembers() }
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
