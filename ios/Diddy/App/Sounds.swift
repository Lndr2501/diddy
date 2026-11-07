import AVFoundation
import AudioToolbox
import Foundation
import os

/// The app's sounds, made by Tools/make_sounds.py. The raw value is the file name.
enum Sound: String, CaseIterable, Identifiable {
    case ringtone, ringback
    case callJoined = "call_joined", callLeft = "call_left"
    case userJoined = "user_joined", userLeft = "user_left"
    case mute, unmute, deafen, undeafen
    case screenShareStarted = "screen_share_started", screenShareStopped = "screen_share_stopped"
    case cameraOn = "camera_on", cameraOff = "camera_off"
    case message, mention, invite
    case callDeclined = "call_declined", noAnswer = "no_answer", connectionLost = "connection_lost"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .ringtone: return "Incoming call"
        case .ringback: return "Outgoing call"
        case .callJoined: return "You joined"
        case .callLeft: return "You left"
        case .userJoined: return "Someone joined"
        case .userLeft: return "Someone left"
        case .mute: return "Mute"
        case .unmute: return "Unmute"
        case .deafen: return "Deafen"
        case .undeafen: return "Undeafen"
        case .screenShareStarted: return "Screen share started"
        case .screenShareStopped: return "Screen share stopped"
        case .cameraOn: return "Camera on"
        case .cameraOff: return "Camera off"
        case .message: return "New message"
        case .mention: return "Mention"
        case .invite: return "Invite"
        case .callDeclined: return "Call declined"
        case .noAnswer: return "No answer"
        case .connectionLost: return "Connection lost"
        }
    }

    var setting: SoundSetting {
        switch self {
        case .ringtone: return .ringing
        case .message, .mention, .invite: return .messages
        default: return .calls
        }
    }
}

/// The switches under Settings > Sounds. All are on by default.
enum SoundSetting: String, CaseIterable, Identifiable {
    case ringing = "diddy.sounds.ringing"
    case calls = "diddy.sounds.calls"
    case messages = "diddy.sounds.messages"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .ringing: return "Ring for incoming calls"
        case .calls: return "Call sounds"
        case .messages: return "Message sounds"
        }
    }

    var isOn: Bool { UserDefaults.standard.object(forKey: rawValue) as? Bool ?? true }
}

@MainActor
final class Sounds {
    static let shared = Sounds()

    /// A call owns the audio session then; sounds play through whatever it set up.
    var inCall = false
    /// The chat on screen, which has no need to announce its own messages.
    var openRoomId: String?

    private let log = Logger(subsystem: "app.diddy.ios", category: "sound")
    private var players: [Sound: AVAudioPlayer] = [:]
    private var looping: AVAudioPlayer?
    private var vibration: Task<Void, Never>?
    private var lastAlert = Date.distantPast

    private init() {}

    func play(_ sound: Sound) {
        guard sound.setting.isOn else { return }
        start(sound, loops: 0)
    }

    /// Plays a sound regardless of its switch, for trying it out in Settings.
    func preview(_ sound: Sound) {
        stopLoop()
        start(sound, loops: 0)
    }

    /// New messages can arrive in bursts; one sound stands for all of them.
    func playAlert(_ sound: Sound) {
        guard Date().timeIntervalSince(lastAlert) > 1 else { return }
        lastAlert = Date()
        play(sound)
    }

    func startRinging() {
        stopLoop()
        guard Sound.ringtone.setting.isOn else { return }
        looping = start(.ringtone, loops: -1)
        // The ringtone honours the silent switch, as a ringing phone does. This still gets through.
        vibration = Task {
            while !Task.isCancelled {
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    func startRingback() {
        stopLoop()
        guard Sound.ringback.setting.isOn else { return }
        looping = start(.ringback, loops: -1)
    }

    func stopLoop() {
        vibration?.cancel()
        vibration = nil
        looping?.stop()
        looping?.currentTime = 0
        looping = nil
    }

    @discardableResult
    private func start(_ sound: Sound, loops: Int) -> AVAudioPlayer? {
        if !inCall && !BackgroundKeepAlive.shared.isRunning {
            // Ambient mixes with the user's music and stays quiet on the silent switch.
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(.ambient)
            try? session.setActive(true)
        }
        guard let player = player(for: sound) else {
            log.error("no player for \(sound.rawValue, privacy: .public)")
            return nil
        }
        player.numberOfLoops = loops
        player.currentTime = 0
        let started = player.play()
        log.debug("\(sound.rawValue, privacy: .public) played=\(started) loops=\(loops) inCall=\(self.inCall)")
        return player
    }

    private func player(for sound: Sound) -> AVAudioPlayer? {
        if let player = players[sound] { return player }
        guard let url = Bundle.main.url(forResource: sound.rawValue, withExtension: "caf"),
              let player = try? AVAudioPlayer(contentsOf: url) else { return nil }
        player.prepareToPlay()
        players[sound] = player
        return player
    }
}
