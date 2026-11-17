import Foundation

/// Call settings kept on this device, the counterparts of the desktop's `diddyCallPrefs` and
/// `plugins/call/audioDevices.ts` entries.
enum CallPrefs {
    static let voiceProcessingKey = "diddy.call.voiceProcessing"
    static let shareSystemSoundKey = "diddy.call.shareSystemSound"
    static let inputVolumeKey = "diddy.call.inputVolume"
    static let outputVolumeKey = "diddy.call.outputVolume"
    static let shareResolutionKey = "diddy.call.shareResolution"
    static let shareFpsKey = "diddy.call.shareFps"
    static let shareQualityKey = "diddy.call.shareQuality"
    static let pushToTalkKey = "diddy.call.pushToTalk"
    static let pushToTalkDelayKey = "diddy.call.pushToTalkDelay"
    static let pushToTalkKeyboardKey = "diddy.call.pushToTalkKeyboard"

    /// Push-to-talk instead of voice activity (Settings > Calls), off by default like on the
    /// desktop: the microphone is open only while the Talk button (or the keyboard key) is held.
    static var pushToTalk: Bool { UserDefaults.standard.bool(forKey: pushToTalkKey) }

    /// How long the microphone stays open after letting go, 0...500 ms.
    static var pushToTalkDelayMs: Int {
        let stored = UserDefaults.standard.object(forKey: pushToTalkDelayKey) as? Int
        return PushToTalkPrefs.clampReleaseDelay(stored ?? PushToTalkPrefs.defaultReleaseDelayMs)
    }

    /// The hardware keyboard key (iPad) that works like the Talk button.
    static var pushToTalkKeyboard: PushToTalkKey {
        PushToTalkKey.stored(UserDefaults.standard.string(forKey: pushToTalkKeyboardKey))
    }

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

    /// Whole-screen sharing (the broadcast extension): longest side in pixels (0: the screen's own),
    /// frames per second and picture quality, from Settings > Calls > Screen Sharing.
    static var broadcastConfig: BroadcastWire.Config {
        let defaults = UserDefaults.standard
        let standard = BroadcastWire.Config.standard
        return BroadcastWire.Config(
            maxPixels: defaults.object(forKey: shareResolutionKey) as? Int ?? standard.maxPixels,
            fps: defaults.object(forKey: shareFpsKey) as? Int ?? standard.fps,
            quality: defaults.object(forKey: shareQualityKey) as? Double ?? standard.quality,
            audio: shareSystemSound
        ).clamped
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
