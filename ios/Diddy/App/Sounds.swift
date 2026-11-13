import AVFoundation
import AudioToolbox
import Foundation
import os

/// The app's sounds, all from Diddy's sound pack: the MP3s the desktop app plays too
/// (cinny/public/sound/diddy). The raw value names a bundled CAF that is tried when the pack
/// file is missing.
enum Sound: String, CaseIterable, Identifiable {
    case ringtone, ringback
    case callJoined = "call_joined", callLeft = "call_left"
    case userJoined = "user_joined", userLeft = "user_left"
    case mute, unmute, deafen, undeafen
    case screenShareStarted = "screen_share_started", screenShareStopped = "screen_share_stopped"
    case cameraOn = "camera_on", cameraOff = "camera_off"
    case message, mention, invite
    case callDeclined = "call_declined", noAnswer = "no_answer", connectionLost = "connection_lost"
    case micChange = "mic_change"

    var id: String { rawValue }

    /// Names and descriptions of the desktop's Settings > Sounds (`plugins/sounds.ts`).
    var title: String {
        switch self {
        case .ringtone: return "Incoming call"
        case .ringback: return "Outgoing call"
        case .callJoined: return "You join"
        case .callLeft: return "You leave"
        case .userJoined: return "Someone joins"
        case .userLeft: return "Someone leaves"
        case .mute: return "Microphone off"
        case .unmute: return "Microphone on"
        case .deafen: return "Headphones off"
        case .undeafen: return "Headphones on"
        case .screenShareStarted: return "Stream starts"
        case .screenShareStopped: return "Stream ends"
        case .cameraOn: return "Camera on"
        case .cameraOff: return "Camera off"
        case .message: return "New message"
        case .mention: return "Mention"
        case .invite: return "Invitation"
        case .callDeclined: return "Call declined"
        case .noAnswer: return "No answer"
        case .connectionLost: return "Connection lost"
        case .micChange: return "Microphone changed"
        }
    }

    var detail: String {
        switch self {
        case .ringtone: return "Rings while someone calls you."
        case .ringback: return "Rings while you call someone, until they answer or decline."
        case .callJoined: return "You enter a call."
        case .callLeft: return "You leave the call."
        case .userJoined: return "Another person joins your call."
        case .userLeft: return "Another person leaves your call."
        case .mute: return "You mute yourself."
        case .unmute: return "You unmute yourself."
        case .deafen: return "You deafen yourself."
        case .undeafen: return "You undeafen yourself."
        case .screenShareStarted: return "You start sharing your screen."
        case .screenShareStopped: return "You stop sharing your screen."
        case .cameraOn: return "You turn the camera on."
        case .cameraOff: return "You turn the camera off."
        case .message: return "A message that notifies you."
        case .mention: return "A message that mentions you."
        case .invite: return "You are invited to a room."
        case .callDeclined: return "The person you call declines."
        case .noAnswer: return "The person you call does not answer."
        case .connectionLost: return "Your call loses its connection."
        case .micChange: return "You pick another microphone."
        }
    }

    /// The groups of Settings > Sounds, in the desktop's order.
    static let groups: [(title: String, sounds: [Sound])] = [
        ("Messages", [.message, .mention, .invite]),
        ("Calls", [.ringtone, .ringback, .callJoined, .userJoined, .userLeft, .callLeft, .callDeclined, .noAnswer, .connectionLost]),
        ("Your controls", [.mute, .unmute, .deafen, .undeafen, .cameraOn, .cameraOff, .screenShareStarted, .screenShareStopped, .micChange]),
    ]

    /// The desktop sound pack's file for this sound, if it has one.
    var packFile: String? {
        switch self {
        case .ringtone: return "call_ringing"
        case .ringback: return "call_calling"
        case .callLeft: return "disconnect"
        case .userJoined: return "user_join"
        case .userLeft: return "user_leave"
        case .mute: return "mute"
        case .unmute: return "unmute"
        case .deafen: return "deafen"
        case .undeafen: return "undeafen"
        case .screenShareStarted: return "stream_started"
        case .screenShareStopped: return "stream_ended"
        case .cameraOn: return "camera_on"
        case .cameraOff: return "camera_off"
        case .message: return "message1"
        case .micChange: return "mic_change"
        // Joining yourself sounds like someone else joining, as on the desktop.
        case .callJoined: return "user_join"
        case .mention: return "mention"
        case .invite: return "invite"
        case .callDeclined: return "call_declined"
        case .noAnswer: return "no_answer"
        case .connectionLost: return "connection_lost"
        }
    }

    /// The group switch of older versions; its value is where a sound without a switch of its own starts.
    var group: SoundSetting {
        switch self {
        case .ringtone: return .ringing
        case .message, .mention, .invite: return .messages
        default: return .calls
        }
    }

    /// What the sound announces, for Do Not Disturb (Matrix/DoNotDisturb.swift).
    var alert: DoNotDisturb.Alert {
        switch self {
        case .message: return .message
        case .mention: return .mention
        case .invite: return .invite
        case .ringtone: return .incomingCall
        default: return .other
        }
    }

    /// This sound's own switch (Settings > Sounds).
    var setting: SoundSwitch { SoundSwitch(sound: self) }

    var enabledKey: String { "diddy.sound.enabled.\(rawValue)" }

    /// On unless switched off. Like on the desktop, the invitation sound starts off; a sound whose
    /// old group switch was turned off stays off.
    var isEnabled: Bool {
        if let own = UserDefaults.standard.object(forKey: enabledKey) as? Bool { return own }
        if UserDefaults.standard.object(forKey: group.rawValue) != nil { return group.isOn }
        return self != .invite
    }

    func setEnabled(_ on: Bool) { UserDefaults.standard.set(on, forKey: enabledKey) }
}

/// A sound's own on/off switch.
struct SoundSwitch {
    let sound: Sound
    var isOn: Bool { sound.isEnabled }
}

/// The group switches of older versions (ringing, call sounds, message sounds), still read as the
/// starting value of the per-sound switches.
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
    private var lastPlayed: [Sound: Date] = [:]

    private init() {}

    /// Plays a sound unless it is switched off. The same sound twice within a moment plays once.
    func play(_ sound: Sound) {
        guard sound.isEnabled else { return }
        let now = Date()
        if let last = lastPlayed[sound], now.timeIntervalSince(last) < 0.4 { return }
        lastPlayed[sound] = now
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
        guard Sound.ringtone.isEnabled else { return }
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
        guard Sound.ringback.isEnabled else { return }
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
        if !inCall && !BackgroundKeepAlive.shared.isRunning && !VoiceAudioSession.isBusy {
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
        // An own file replaces the sound; one that cannot be played falls back to Diddy's.
        let custom = CustomSounds.url(for: sound).flatMap { try? AVAudioPlayer(contentsOf: $0) }
        let url = sound.packFile.flatMap { Bundle.main.url(forResource: $0, withExtension: "mp3") }
            ?? Bundle.main.url(forResource: sound.rawValue, withExtension: "caf")
        guard let player = custom ?? url.flatMap({ try? AVAudioPlayer(contentsOf: $0) }) else { return nil }
        player.prepareToPlay()
        players[sound] = player
        return player
    }

    /// Forgets the prepared player, after its own file changed.
    func reload(_ sound: Sound) {
        if looping === players[sound] { stopLoop() }
        players[sound]?.stop()
        players[sound] = nil
    }
}
