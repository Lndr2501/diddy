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
    case pttOn = "ptt_on", pttOff = "ptt_off"

    var id: String { rawValue }

    /// Names and descriptions of the desktop's Settings > Sounds (`plugins/sounds.ts`).
    var title: String {
        switch self {
        case .ringtone: return L("ios.soundLabels.incomingCall")
        case .ringback: return L("ios.soundLabels.outgoingCall")
        case .callJoined: return L("ios.soundLabels.youJoin")
        case .callLeft: return L("ios.soundLabels.youLeave")
        case .userJoined: return L("ios.soundLabels.someoneJoins")
        case .userLeft: return L("ios.soundLabels.someoneLeaves")
        case .mute: return L("ios.soundLabels.microphoneOff")
        case .unmute: return L("ios.soundLabels.microphoneOn")
        case .deafen: return L("ios.soundLabels.headphonesOff")
        case .undeafen: return L("ios.soundLabels.headphonesOn")
        case .screenShareStarted: return L("ios.soundLabels.streamStarts")
        case .screenShareStopped: return L("ios.soundLabels.streamEnds")
        case .cameraOn: return L("ios.soundLabels.cameraOn")
        case .cameraOff: return L("ios.soundLabels.cameraOff")
        case .message: return L("ios.soundLabels.newMessage")
        case .mention: return L("ios.soundLabels.mention")
        case .invite: return L("ios.soundLabels.invitation")
        case .callDeclined: return L("ios.soundLabels.callDeclined")
        case .noAnswer: return L("ios.soundLabels.noAnswer")
        case .connectionLost: return L("ios.soundLabels.connectionLost")
        case .micChange: return L("ios.soundLabels.microphoneChanged")
        case .pttOn: return L("ios.soundLabels.pushToTalkOpens")
        case .pttOff: return L("ios.soundLabels.pushToTalkCloses")
        }
    }

    var detail: String {
        switch self {
        case .ringtone: return L("ios.soundLabels.ringsWhileSomeoneCallsYou")
        case .ringback: return L("ios.soundLabels.ringsWhileYouCallSomeoneUntilTheyAnswerOrDecline")
        case .callJoined: return L("ios.soundLabels.youEnterACall")
        case .callLeft: return L("ios.soundLabels.youLeaveTheCall")
        case .userJoined: return L("ios.soundLabels.anotherPersonJoinsYourCall")
        case .userLeft: return L("ios.soundLabels.anotherPersonLeavesYourCall")
        case .mute: return L("ios.soundLabels.youMuteYourself")
        case .unmute: return L("ios.soundLabels.youUnmuteYourself")
        case .deafen: return L("ios.soundLabels.youDeafenYourself")
        case .undeafen: return L("ios.soundLabels.youUndeafenYourself")
        case .screenShareStarted: return L("ios.soundLabels.youStartSharingYourScreen")
        case .screenShareStopped: return L("ios.soundLabels.youStopSharingYourScreen")
        case .cameraOn: return L("ios.soundLabels.youTurnTheCameraOn")
        case .cameraOff: return L("ios.soundLabels.youTurnTheCameraOff")
        case .message: return L("ios.soundLabels.aMessageThatNotifiesYou")
        case .mention: return L("ios.soundLabels.aMessageThatMentionsYou")
        case .invite: return L("ios.soundLabels.youAreInvitedToARoom")
        case .callDeclined: return L("ios.soundLabels.thePersonYouCallDeclines")
        case .noAnswer: return L("ios.soundLabels.thePersonYouCallDoesNotAnswer")
        case .connectionLost: return L("ios.soundLabels.yourCallLosesItsConnection")
        case .micChange: return L("ios.soundLabels.youPickAnotherMicrophone")
        case .pttOn: return L("ios.soundLabels.aSoftClickWhenHoldingTalkOpensYourMicrophone")
        case .pttOff: return L("ios.soundLabels.aSoftClickWhenLettingGoClosesYourMicrophoneAgain")
        }
    }

    /// The groups of Settings > Sounds, in the desktop's order.
    static let groups: [(title: String, sounds: [Sound])] = [
        ("Messages", [.message, .mention, .invite]),
        ("Calls", [.ringtone, .ringback, .callJoined, .userJoined, .userLeft, .callLeft, .callDeclined, .noAnswer, .connectionLost]),
        ("Your controls", [.mute, .unmute, .deafen, .undeafen, .cameraOn, .cameraOff, .screenShareStarted, .screenShareStopped, .micChange, .pttOn, .pttOff]),
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
        // push-to-talk: the mute sounds, played softer (`volume`)
        case .pttOn: return "unmute"
        case .pttOff: return "mute"
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

    /// How loud it plays; the push-to-talk clicks come often, so they are soft.
    var volume: Float {
        switch self {
        case .pttOn, .pttOff: return 0.4
        default: return 1
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
        case .ringing: return L("ios.soundLabels.ringForIncomingCalls")
        case .calls: return L("ios.soundLabels.callSounds")
        case .messages: return L("ios.soundLabels.messageSounds")
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
        player.volume = sound.volume
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
