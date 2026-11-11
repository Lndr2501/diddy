import Foundation

/// Call settings kept on this device, the counterparts of the desktop's `diddyCallPrefs` and
/// `plugins/call/audioDevices.ts` entries.
enum CallPrefs {
    static let voiceProcessingKey = "diddy.call.voiceProcessing"
    static let shareSystemSoundKey = "diddy.call.shareSystemSound"
    static let inputVolumeKey = "diddy.call.inputVolume"
    static let outputVolumeKey = "diddy.call.outputVolume"

    /// Echo cancellation, auto gain and the system's noise suppression of the microphone. The
    /// desktop starts with this off (it ducks music there). An iPhone is often used on its speaker
    /// and has always run with it, so here it stays on until switched off. Read when a call starts.
    static var voiceProcessing: Bool {
        UserDefaults.standard.object(forKey: voiceProcessingKey) as? Bool ?? true
    }

    /// Share the sound of the device with a screen share (on by default, like before).
    static var shareSystemSound: Bool {
        UserDefaults.standard.object(forKey: shareSystemSoundKey) as? Bool ?? true
    }

    /// Microphone level 0...1 (the desktop's "Input volume").
    static var inputVolume: Double { level(inputVolumeKey) }

    /// Level of everything you hear from the call, 0...1 (the desktop's "Output volume").
    static var outputVolume: Double { level(outputVolumeKey) }

    private static func level(_ key: String) -> Double {
        guard let value = UserDefaults.standard.object(forKey: key) as? Double, value.isFinite else { return 1 }
        return Swift.min(1, Swift.max(0, value))
    }
}

/// The microphone level set under "Input volume", read on WebRTC's audio thread.
final class MicGain: @unchecked Sendable {
    static let shared = MicGain()

    private let lock = NSLock()
    private var value: Float = Float(CallPrefs.inputVolume)

    var gain: Float {
        get {
            lock.lock()
            defer { lock.unlock() }
            return value
        }
        set {
            lock.lock()
            value = Swift.min(1, Swift.max(0, newValue))
            lock.unlock()
        }
    }
}
