import Foundation
import LiveKit

/// The noise suppression setting: on unless the user turned it off.
enum NoiseSuppression {
    static let settingKey = "noiseSuppression"

    static var isEnabled: Bool {
        UserDefaults.standard.object(forKey: settingKey) as? Bool ?? true
    }

    /// Takes effect at once, also during a call.
    static func apply() {
        AudioManager.shared.capturePostProcessingDelegate = isEnabled ? processor : nil
    }

    private static let processor = NoiseSuppressor()
}

/// Cleans the microphone before LiveKit sends it, on WebRTC's audio thread. Works with a self-hosted
/// LiveKit server: nothing here talks to a server. If RNNoise cannot start, audio passes unchanged.
private final class NoiseSuppressor: NSObject, AudioCustomProcessingDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var filters: [RNNoiseFilter] = []

    func audioProcessingInitialize(sampleRate sampleRateHz: Int, channels: Int) {
        let created = (0..<max(channels, 0)).compactMap { _ in RNNoiseFilter() }
        lock.lock()
        filters = created
        lock.unlock()
    }

    func audioProcessingProcess(audioBuffer: LKAudioBuffer) {
        lock.lock()
        defer { lock.unlock() }
        for channel in 0..<min(audioBuffer.channels, filters.count) {
            filters[channel].process(audioBuffer.rawBuffer(forChannel: channel), count: audioBuffer.frames)
        }
    }

    func audioProcessingRelease() {
        lock.lock()
        filters = []
        lock.unlock()
    }
}
