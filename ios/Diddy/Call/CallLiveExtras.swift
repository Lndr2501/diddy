import Foundation
import LiveKit
import MatrixRustSDK

/// Hands the reaction events of the call room to a closure.
final class CallReactionListener: RoomMessageLikeEventsListener, @unchecked Sendable {
    private let handler: (RoomMessageLikeEvent) -> Void
    init(_ handler: @escaping (RoomMessageLikeEvent) -> Void) { self.handler = handler }
    func onEvent(event: RoomMessageLikeEvent) { handler(event) }
}

/// What the call shows besides the tiles themselves: the ping, emoji reactions, who speaks (held
/// for a moment so the ring does not flicker), the volumes you gave people and the device levels.
/// One per call; `CallSession` feeds it and the call screen observes it.
@MainActor
final class CallLiveExtras: ObservableObject {
    /// Round trip to the voice server in ms; nil until measured.
    @Published private(set) var pingMs: Int?
    @Published private(set) var reactions = ActiveCallReactions()
    /// Your own microphone is picking up your voice (from its level, not from the server).
    @Published private(set) var ownSpeaking = false
    /// Bumped when a person's volume changed, so menus showing it read it again.
    @Published private(set) var volumeRevision = 0
    @Published private(set) var shareSystemSound = CallPrefs.shareSystemSound
    @Published private(set) var inputVolume = CallPrefs.inputVolume
    @Published private(set) var outputVolume = CallPrefs.outputVolume

    /// Asks the session to draw its tiles again.
    var refresh: (() -> Void)?
    /// Asks the session to play everybody at the levels set here.
    var applyVolumes: (() -> Void)?

    let voices = CallVolumeMemory(storage: UserDefaultsVolumeStorage.shared, kind: .voice)
    let streams = CallVolumeMemory(storage: UserDefaultsVolumeStorage.shared, kind: .stream)

    private var hold = SpeakerHold()
    private var holdTimer: Task<Void, Never>?
    private var activity = VoiceActivity()
    private var meter: Task<Void, Never>?
    private var pingTask: Task<Void, Never>?
    private var reactionTimer: Task<Void, Never>?

    private static var now: TimeInterval { ProcessInfo.processInfo.systemUptime }

    // MARK: Speaking

    /// Who counts as speaking: those the call says speak now, and those who stopped less than
    /// 0.6 s ago (desktop `speakerHold.ts`). `current` holds LiveKit identities.
    func speakers(_ current: Set<String>) -> Set<String> {
        let now = Self.now
        let held = hold.update(current, now: now)
        holdTimer?.cancel()
        holdTimer = nil
        if let wait = hold.expiresIn(now: now) {
            holdTimer = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64((wait + 0.02) * 1_000_000_000))
                guard !Task.isCancelled else { return }
                self?.refresh?()
            }
        }
        return held
    }

    /// Watches the level of your microphone, ten times a second (desktop `voiceActivity.ts`).
    func startMeter(microphoneOn: @escaping () -> Bool) {
        meter?.cancel()
        activity.reset()
        meter = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000)
                guard let self, !Task.isCancelled else { return }
                let db = microphoneOn() ? VoiceActivity.levelDb(rms: MicLevel.shared.current) : VoiceActivity.silenceDb
                let speaking = self.activity.update(db: db, now: Self.now)
                if speaking != self.ownSpeaking {
                    self.ownSpeaking = speaking
                    self.refresh?()
                }
            }
        }
    }

    // MARK: Ping

    /// Measures the round trip to the voice server every two seconds, from the statistics of
    /// your microphone track (desktop `streamStats.ts`).
    func startPing(room: LiveKit.Room) {
        pingTask?.cancel()
        pingTask = Task { [weak self, weak room] in
            var asked: ObjectIdentifier?
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard let self, let room, !Task.isCancelled else { return }
                let microphone = room.localParticipant.trackPublications.values.first { $0.source == .microphone }
                guard let track = microphone?.track else { continue }
                if asked != ObjectIdentifier(track) {
                    await track.set(reportStatistics: true)
                    asked = ObjectIdentifier(track)
                }
                if let ms = Self.roundTripMs(track.statistics), ms != self.pingMs { self.pingMs = ms }
            }
        }
    }

    private static func roundTripMs(_ statistics: TrackStatistics?) -> Int? {
        guard let statistics else { return nil }
        var seconds: [Double] = statistics.iceCandidatePair.compactMap { $0.currentRoundTripTime }
        seconds += statistics.remoteInboundRtpStream.compactMap { $0.roundTripTime }
        return CallPing.roundTripMs(seconds)
    }

    // MARK: Reactions

    /// A reaction on `userId`'s tile for three seconds.
    func receiveReaction(from userId: String, emoji: String) {
        var next = reactions
        guard next.add(sender: userId, emoji: emoji, now: Self.now) else { return }
        reactions = next
        guard reactionTimer == nil else { return }
        reactionTimer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard let self, !Task.isCancelled else { return }
                var current = self.reactions
                if current.prune(now: Self.now) { self.reactions = current }
                if self.reactions.isEmpty {
                    self.reactionTimer = nil
                    return
                }
            }
        }
    }

    func reaction(for userId: String) -> String? { reactions.emoji(for: userId) }

    // MARK: Volumes

    /// The level shown on the slider (kept while muted for me).
    func level(of userId: String, kind: CallVolumeKind) -> Double {
        memory(kind).remembered(userId)?.volume ?? 1
    }

    func isMuted(_ userId: String, kind: CallVolumeKind) -> Bool {
        memory(kind).remembered(userId)?.muted ?? false
    }

    func setLevel(_ level: Double, of userId: String, kind: CallVolumeKind) {
        memory(kind).setLevel(userId, level)
        volumesChanged()
    }

    func toggleMuted(_ userId: String, kind: CallVolumeKind) {
        memory(kind).toggleMuted(userId)
        volumesChanged()
    }

    /// "Reset volumes": everybody back to 100 %, voices and screen shares.
    func resetVolumes() {
        CallVolumeMemory.clearAll(UserDefaultsVolumeStorage.shared)
        volumesChanged()
    }

    private func memory(_ kind: CallVolumeKind) -> CallVolumeMemory { kind == .voice ? voices : streams }

    private func volumesChanged() {
        volumeRevision += 1
        applyVolumes?()
    }

    // MARK: Device levels and sharing

    func setInputVolume(_ value: Double) {
        let level = Swift.min(1, Swift.max(0, value))
        inputVolume = level
        UserDefaults.standard.set(level, forKey: CallPrefs.inputVolumeKey)
        MicGain.shared.gain = Float(level)
    }

    func setOutputVolume(_ value: Double) {
        let level = Swift.min(1, Swift.max(0, value))
        outputVolume = level
        UserDefaults.standard.set(level, forKey: CallPrefs.outputVolumeKey)
        applyVolumes?()
    }

    func setShareSystemSound(_ on: Bool) {
        shareSystemSound = on
        UserDefaults.standard.set(on, forKey: CallPrefs.shareSystemSoundKey)
    }

    // MARK: End

    func stop() {
        holdTimer?.cancel()
        meter?.cancel()
        pingTask?.cancel()
        reactionTimer?.cancel()
        holdTimer = nil
        meter = nil
        pingTask = nil
        reactionTimer = nil
        hold.reset()
        activity.reset()
        ownSpeaking = false
        reactions = ActiveCallReactions()
        refresh = nil
        applyVolumes = nil
    }
}
