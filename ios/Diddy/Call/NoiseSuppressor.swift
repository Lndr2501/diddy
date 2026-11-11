import Foundation
import LiveKit

/// The noise suppression setting: on unless the user turned it off.
enum NoiseSuppression {
    static let settingKey = "noiseSuppression"

    static var isEnabled: Bool {
        UserDefaults.standard.object(forKey: settingKey) as? Bool ?? true
    }

    /// Takes effect at once, also during a call. The processor stays installed either way, because
    /// it also mixes soundboard clips into the microphone; the setting only switches RNNoise.
    static func apply() {
        processor.denoise = isEnabled
        AudioManager.shared.capturePostProcessingDelegate = processor
    }

    private static let processor = CaptureProcessor()
}

/// Works on the microphone before LiveKit sends it, on WebRTC's audio thread: RNNoise first (if on),
/// then the soundboard clip. Works with a self-hosted LiveKit server: nothing here talks to a server.
/// If RNNoise cannot start, audio passes unchanged.
private final class CaptureProcessor: NSObject, AudioCustomProcessingDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var filters: [RNNoiseFilter] = []
    private var _denoise = true

    var denoise: Bool {
        get { lock.lock(); defer { lock.unlock() }; return _denoise }
        set { lock.lock(); _denoise = newValue; lock.unlock() }
    }

    func audioProcessingInitialize(sampleRate sampleRateHz: Int, channels: Int) {
        let created = (0..<max(channels, 0)).compactMap { _ in RNNoiseFilter() }
        lock.lock()
        filters = created
        lock.unlock()
        ClipMixer.shared.configure(sampleRate: sampleRateHz)
    }

    func audioProcessingProcess(audioBuffer: LKAudioBuffer) {
        lock.lock()
        if _denoise {
            for channel in 0..<min(audioBuffer.channels, filters.count) {
                filters[channel].process(audioBuffer.rawBuffer(forChannel: channel), count: audioBuffer.frames)
            }
        }
        lock.unlock()
        // Your voice, after RNNoise and before any soundboard clip: the level meter and the speaking
        // ring of your own tile (desktop voiceActivity.ts) read it.
        if audioBuffer.channels > 0, audioBuffer.frames > 0 {
            let samples = audioBuffer.rawBuffer(forChannel: 0)
            var sum: Float = 0
            for index in 0..<audioBuffer.frames {
                let value = samples[index] / 32768
                sum += value * value
            }
            MicLevel.shared.report(rms: Double((sum / Float(audioBuffer.frames)).squareRoot()))
        }
        ClipMixer.shared.mix(into: audioBuffer)
    }

    func audioProcessingRelease() {
        lock.lock()
        filters = []
        lock.unlock()
        ClipMixer.shared.release()
    }
}

/// The newest level of your microphone (RMS, 0...1), written on WebRTC's audio thread and read on
/// the main thread. Stale readings (the microphone stopped) count as silence.
final class MicLevel: @unchecked Sendable {
    static let shared = MicLevel()

    private let lock = NSLock()
    private var rms: Double = 0
    private var at: TimeInterval = 0

    func report(rms value: Double) {
        let now = ProcessInfo.processInfo.systemUptime
        lock.lock()
        rms = value
        at = now
        lock.unlock()
    }

    /// The level, or 0 when nothing was captured during the last 0.3 seconds.
    var current: Double {
        let now = ProcessInfo.processInfo.systemUptime
        lock.lock()
        defer { lock.unlock() }
        return now - at < 0.3 ? rms : 0
    }
}
