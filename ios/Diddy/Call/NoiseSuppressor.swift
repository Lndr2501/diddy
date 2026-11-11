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
        ClipMixer.shared.mix(into: audioBuffer)
    }

    func audioProcessingRelease() {
        lock.lock()
        filters = []
        lock.unlock()
        ClipMixer.shared.release()
    }
}
