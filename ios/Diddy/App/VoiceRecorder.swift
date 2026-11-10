import AVFoundation
import Foundation
import os

/// Pure helpers for the waveform of a voice message, the same numbers as the desktop
/// (`cinny/src/app/plugins/voiceMessage.ts`): 64 bars, integers 0...1024 with the loudest bar at
/// 1024, at most 256 values on the wire.
enum VoiceWaveform {
    static let bins = 64
    static let maxValue = 1024
    static let maxLength = 256
    static let minDuration: TimeInterval = 0.5
    static let maxDuration: TimeInterval = 15 * 60

    /// Averages loudness samples (0...1) into `bins` integers, loudest = 1024.
    static func wire(fromLevels levels: [Float], bins: Int = VoiceWaveform.bins) -> [Int] {
        let clean = levels.map { $0.isFinite ? min(max($0, 0), 1) : 0 }
        guard !clean.isEmpty, bins > 0 else { return [] }
        let averaged: [Float] = (0..<bins).map { i in
            let from = i * clean.count / bins
            let to = max(from + 1, (i + 1) * clean.count / bins)
            let part = clean[from..<min(to, clean.count)]
            return part.isEmpty ? 0 : part.reduce(0, +) / Float(part.count)
        }
        let peak = averaged.max() ?? 0
        guard peak > 0 else { return averaged.map { _ in 0 } }
        return averaged.map { Int(($0 / peak * Float(maxValue)).rounded()) }
    }

    /// Received values (untrusted) as bar heights 0...1: clamped, at most `maxLength` of them.
    static func normalized(_ wire: [UInt16]) -> [Float] {
        wire.prefix(maxLength).map { min(Float($0), Float(maxValue)) / Float(maxValue) }
    }

    /// `count` bar heights for drawing; a missing waveform becomes a flat line of small bars.
    static func bars(_ values: [Float], count: Int) -> [Float] {
        guard count > 0 else { return [] }
        guard !values.isEmpty else { return Array(repeating: 0.15, count: count) }
        return (0..<count).map { i in
            let from = i * values.count / count
            let to = max(from + 1, (i + 1) * values.count / count)
            let part = values[from..<min(to, values.count)]
            let average = part.reduce(0, +) / Float(max(part.count, 1))
            return min(max(average, 0.08), 1)
        }
    }

    /// The extra content fields desktop and Element read (`org.matrix.msc3245.voice` and
    /// `org.matrix.msc1767.audio`), as a JSON object for the SDK's `extraContentJson`.
    static func contentJSON(duration: TimeInterval, wire: [Int]) -> String? {
        let object: [String: Any] = [
            "org.matrix.msc3245.voice": [String: Any](),
            "org.matrix.msc1767.audio": [
                "duration": Int((duration * 1000).rounded()),
                "waveform": Array(wire.prefix(maxLength)),
            ] as [String: Any],
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

/// Shared audio session for recording and for playing voice messages. A call owns the session
/// while it runs (it is already play-and-record, so recording and playback work as they are):
/// then nothing is changed here, and nothing is switched off afterwards.
@MainActor
enum VoiceAudioSession {
    private static var users = 0
    private static var recording = false

    /// True while a voice message is recorded or played; the app sounds then leave the session alone.
    static var isBusy: Bool { users > 0 }

    static func acquire(recording wantsRecording: Bool) throws {
        users += 1
        if wantsRecording { recording = true }
        guard !Sounds.shared.inCall else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            if recording {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            } else {
                try session.setCategory(.playback, mode: .default)
            }
            try session.setActive(true)
        } catch {
            release(recording: wantsRecording)
            throw error
        }
    }

    static func release(recording wasRecording: Bool) {
        users = max(0, users - 1)
        if wasRecording { recording = false }
        if users == 0, !Sounds.shared.inCall {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}

/// A finished recording, ready to send.
struct VoiceRecording {
    let url: URL
    let duration: TimeInterval
    let waveform: [Int]
    let size: UInt64
}

/// Records a voice message as AAC in an m4a file (`audio/mp4`, the same as Safari and the macOS
/// desktop app) and samples the loudness every 100 ms for the waveform, like the desktop.
@MainActor
final class VoiceRecorder: ObservableObject {
    enum State: Equatable { case idle, starting, recording }

    @Published private(set) var state: State = .idle
    @Published private(set) var elapsed: TimeInterval = 0
    /// The last loudness values (0...1) for the live meter.
    @Published private(set) var recentLevels: [Float] = []
    @Published var error: String?
    /// Set when the length limit stopped the recording by itself; `stop()` then hands it over.
    @Published private(set) var pending: VoiceRecording?

    private let log = Logger(subsystem: "app.diddy.ios", category: "voice")
    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var levels: [Float] = []
    private var fileURL: URL?
    private static let interval: TimeInterval = 0.1

    /// True from the first tap until the message is sent or thrown away.
    var isActive: Bool { state == .recording || pending != nil }

    func start() async {
        guard state == .idle else { return }
        state = .starting
        error = nil
        guard await Self.requestPermission() else {
            state = .idle
            error = "Microphone access is off. Turn it on under Settings > Diddy."
            return
        }
        // A voice message that is still playing would end up in the recording.
        VoicePlayer.shared.stop()
        do {
            try VoiceAudioSession.acquire(recording: true)
        } catch {
            state = .idle
            self.error = "The microphone is not available right now."
            log.error("session: \(error.localizedDescription, privacy: .public)")
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64_000,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        do {
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.isMeteringEnabled = true
            guard recorder.record() else { throw DiddyError("Recording did not start.") }
            self.recorder = recorder
            fileURL = url
        } catch {
            VoiceAudioSession.release(recording: true)
            state = .idle
            self.error = "Could not start recording."
            log.error("record: \(error.localizedDescription, privacy: .public)")
            return
        }
        levels = []
        recentLevels = []
        elapsed = 0
        pending = nil
        state = .recording
        timer = Timer.scheduledTimer(withTimeInterval: Self.interval, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    /// Ends the recording. Nil when it was too short or something went wrong (then `error` says why).
    func stop() -> VoiceRecording? {
        if let pending {
            self.pending = nil
            return pending
        }
        guard state == .recording else { return nil }
        return finish(keep: true)
    }

    /// Puts a recording back after sending it failed, so it is not lost.
    func restore(_ recording: VoiceRecording) {
        guard state == .idle, pending == nil else { try? FileManager.default.removeItem(at: recording.url); return }
        pending = recording
        elapsed = recording.duration
    }

    /// Throws the recording away.
    func cancel() {
        if let pending { try? FileManager.default.removeItem(at: pending.url) }
        pending = nil
        if state == .recording { _ = finish(keep: false) }
    }

    private func tick() {
        guard let recorder, state == .recording else { return }
        recorder.updateMeters()
        // Peak power in dB (about -160...0) to a linear 0...1 level.
        let level = Float(pow(10, Double(recorder.peakPower(forChannel: 0)) / 20))
        levels.append(level.isFinite ? min(max(level, 0), 1) : 0)
        recentLevels = Array(levels.suffix(40))
        elapsed = recorder.currentTime
        if elapsed >= VoiceWaveform.maxDuration, let recording = finish(keep: true) {
            pending = recording
        }
    }

    private func finish(keep: Bool) -> VoiceRecording? {
        timer?.invalidate()
        timer = nil
        let duration = recorder?.currentTime ?? elapsed
        recorder?.stop()
        recorder = nil
        VoiceAudioSession.release(recording: true)
        state = .idle
        elapsed = duration
        let url = fileURL
        fileURL = nil
        let collected = levels
        levels = []
        recentLevels = []
        guard keep, let url else {
            if let url { try? FileManager.default.removeItem(at: url) }
            return nil
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? UInt64) ?? 0
        guard duration >= VoiceWaveform.minDuration, size > 0 else {
            try? FileManager.default.removeItem(at: url)
            error = "Hold on a little longer to record a voice message."
            return nil
        }
        return VoiceRecording(url: url, duration: duration, waveform: VoiceWaveform.wire(fromLevels: collected), size: size)
    }

    private static func requestPermission() async -> Bool {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return true
            case .denied: return false
            default: return await AVAudioApplication.requestRecordPermission()
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted: return true
            case .denied: return false
            default:
                return await withCheckedContinuation { continuation in
                    AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
                }
            }
        }
    }
}
