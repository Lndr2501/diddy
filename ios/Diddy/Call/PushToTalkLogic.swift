import Foundation

/// Push-to-talk (Settings > Calls), the same rules as the desktop's `plugins/call/pushToTalk.ts`:
/// - holding the Talk button or the keyboard key opens the microphone;
/// - letting go of the last one closes it after the release delay (pressing again cancels that);
/// - deafen wins: while deafened it never opens and closes at once, and push-to-talk never
///   undeafens you.
/// Pure logic without UIKit or LiveKit, checked by Tools/pushtotalk_check.
enum PushToTalkSource: Hashable {
    case button
    case key
}

struct PushToTalkGate: Equatable {
    /// What the call has to do after an input changed.
    enum Step: Equatable {
        case none
        case open
        case close
        /// close once the release delay has passed, then ask `releaseDelayElapsed()`
        case closeAfterDelay
    }

    private(set) var held: Set<PushToTalkSource> = []
    private(set) var deafened = false
    private(set) var open = false
    /// a delayed close is pending
    private(set) var closing = false

    var isHeld: Bool { !held.isEmpty }

    private var wanted: Bool { !held.isEmpty && !deafened }

    mutating func set(_ source: PushToTalkSource, down: Bool, releaseDelayMs: Int) -> Step {
        if down { held.insert(source) } else { held.remove(source) }
        return update(releaseDelayMs: releaseDelayMs)
    }

    mutating func setDeafened(_ value: Bool) -> Step {
        deafened = value
        return update(releaseDelayMs: 0)
    }

    /// The release delay is over: closes unless something is held again.
    mutating func releaseDelayElapsed() -> Step {
        guard closing else { return .none }
        closing = false
        if wanted || !open { return .none }
        open = false
        return .close
    }

    /// Forgets everything (call left, push-to-talk switched off).
    mutating func reset() {
        held = []
        closing = false
        open = false
    }

    private mutating func update(releaseDelayMs: Int) -> Step {
        if wanted {
            closing = false
            if open { return .none }
            open = true
            return .open
        }
        guard open else {
            closing = false
            return .none
        }
        let delay = deafened ? 0 : PushToTalkPrefs.clampReleaseDelay(releaseDelayMs)
        if delay == 0 {
            closing = false
            open = false
            return .close
        }
        if closing { return .none }
        closing = true
        return .closeAfterDelay
    }
}

enum PushToTalkPrefs {
    static let maxReleaseDelayMs = 500
    static let defaultReleaseDelayMs = 200

    /// Release delay from storage: whole milliseconds between 0 and 500.
    static func clampReleaseDelay(_ value: Int) -> Int {
        Swift.min(maxReleaseDelayMs, Swift.max(0, value))
    }
}

/// The key of a hardware keyboard (iPad) that works like the Talk button. Raw values are stored in
/// UserDefaults; `hidUsage` is the UIKeyboardHIDUsage code (`UIKey.keyCode.rawValue`).
enum PushToTalkKey: String, CaseIterable, Identifiable {
    case none
    case space
    case rightOption
    case leftOption
    case rightCommand
    case leftControl
    case graveAccent

    var id: String { rawValue }

    var title: String {
        switch self {
        case .none: return "None"
        case .space: return "Space"
        case .rightOption: return "Right Option"
        case .leftOption: return "Left Option"
        case .rightCommand: return "Right Command"
        case .leftControl: return "Left Control"
        case .graveAccent: return "` (Grave Accent)"
        }
    }

    var hidUsage: Int? {
        switch self {
        case .none: return nil
        case .space: return 0x2C
        case .rightOption: return 0xE6
        case .leftOption: return 0xE2
        case .rightCommand: return 0xE7
        case .leftControl: return 0xE0
        case .graveAccent: return 0x35
        }
    }

    static func stored(_ raw: String?) -> PushToTalkKey {
        raw.flatMap(PushToTalkKey.init(rawValue:)) ?? PushToTalkKey.none
    }
}
