import Foundation

// Small call rules shared with the desktop, kept apart from LiveKit and SwiftUI so that
// `Tools/call_audio_check` can test them. Foundation only.

/// Keeps a person "speaking" for a short time after the call stops saying so, like the desktop's
/// `plugins/call/speakerHold.ts`: LiveKit's active-speaker flag switches off and on between words,
/// which made the speaking ring flicker. Pure logic, no timers: ask `expiresIn` when to look again.
struct SpeakerHold {
    /// How long somebody still counts as speaking after the last moment the call said so.
    static let holdSeconds: TimeInterval = 0.6

    let hold: TimeInterval
    private var lastSeen: [String: TimeInterval] = [:]

    init(hold: TimeInterval = SpeakerHold.holdSeconds) { self.hold = hold }

    /// Feed who is speaking now (at `now` seconds); returns who counts as speaking.
    mutating func update(_ current: Set<String>, now: TimeInterval) -> Set<String> {
        for id in current { lastSeen[id] = now }
        var result = Set<String>()
        for (id, seen) in lastSeen {
            if current.contains(id) || now - seen < hold {
                result.insert(id)
            } else {
                lastSeen[id] = nil
            }
        }
        return result
    }

    /// Seconds until the next held person lets go, or nil when nobody is only being held.
    func expiresIn(now: TimeInterval) -> TimeInterval? {
        var soonest: TimeInterval?
        for seen in lastSeen.values {
            let left = hold - (now - seen)
            guard left > 0 else { continue }
            if let current = soonest, current <= left { continue }
            soonest = left
        }
        return soonest
    }

    mutating func reset() { lastSeen = [:] }
}

/// Voice activity of your own microphone, from its level, like the desktop's `voiceActivity.ts`.
struct VoiceActivity {
    /// Level (RMS, dBFS) at which you count as talking.
    static let startDb: Double = -45
    /// Below this level the voice has stopped (a little lower: no flicker around the threshold).
    static let stopDb: Double = -52
    /// You keep counting as talking this long after the last loud moment (pauses between words).
    static let holdSeconds: TimeInterval = 0.45
    /// Silence (and a muted or disabled microphone) in dBFS.
    static let silenceDb: Double = -100

    private(set) var speaking = false
    private var lastLoud: TimeInterval = -.infinity

    /// RMS level in dBFS of samples in the -1...1 range (silenceDb for silence or no samples).
    static func levelDb(rms: Double) -> Double {
        guard rms > 0, rms.isFinite else { return silenceDb }
        return Swift.max(silenceDb, 20 * log10(rms))
    }

    /// Feed one level reading (dBFS) taken at `now` (seconds). Returns whether you are talking.
    mutating func update(db: Double, now: TimeInterval) -> Bool {
        if db >= Self.startDb || (speaking && db >= Self.stopDb) {
            speaking = true
            lastLoud = now
        } else if speaking && now - lastLoud > Self.holdSeconds {
            speaking = false
        }
        return speaking
    }

    mutating func reset() {
        speaking = false
        lastLoud = -.infinity
    }
}

/// The signal bars next to the ping in the call panel, like the desktop's `CallPanel.tsx`.
enum CallPing {
    /// Latency (ms) to the call server -> number of lit bars (3 = good).
    static func bars(forMs ms: Int) -> Int {
        if ms < 100 { return 3 }
        if ms < 250 { return 2 }
        return 1
    }

    static func label(ms: Int?) -> String {
        guard let ms else { return "Measuring ping" }
        return "Ping \(ms) ms"
    }

    /// The real round-trip time from WebRTC samples (seconds); the smallest wins, like the desktop.
    static func roundTripMs(_ seconds: [Double]) -> Int? {
        let valid = seconds.filter { $0.isFinite && $0 > 0 }
        guard let best = valid.min() else { return nil }
        return Int((best * 1000).rounded())
    }
}

/// "Leave your current call?" when you join another call while in one (desktop `call-switch`).
enum CallSwitchText {
    enum Action { case call, join }

    static let title = "Leave your current call?"

    static func message(currentName: String, targetName: String, action: Action) -> String {
        switch action {
        case .call: return "You're in a call in \(currentName). Calling \(targetName) will end it for you."
        case .join: return "You're in a call in \(currentName). Joining \(targetName) will end it for you."
        }
    }

    static func confirm(_ action: Action) -> String {
        action == .call ? "Leave and call" : "Leave and join"
    }
}

/// Own sound files under Settings > Sounds, the desktop's limit (`MAX_CUSTOM_SOUND_BYTES`).
enum CustomSoundRules {
    static let maxBytes = 800 * 1024

    /// nil when the file can be used, else the message the desktop shows.
    static func problem(byteCount: Int) -> String? {
        if byteCount > maxBytes {
            return "File too large (max \(maxBytes / 1024) KB). Use a short sound."
        }
        if byteCount <= 0 { return "The file could not be read." }
        return nil
    }
}
