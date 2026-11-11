import Foundation

// What Do Not Disturb silences on iOS. Foundation only, so Tools/dnd_check tests it on macOS and Linux.
//
// The rule is desktop's: `silencesAlerts` in cinny/src/app/plugins/diddy/dnd.ts, applied in
// pages/client/ClientNonUIFeatures.tsx (message, mention and invite notifications: no system
// notification and no sound) and in components/CallEmbedProvider.tsx (the incoming call does not
// ring, but stays on screen). Badges and the sounds of a call that is going on are not silenced.

enum DoNotDisturb {
    /// The alerts Diddy makes, by what they announce.
    enum Alert: Equatable {
        /// A new message, a mention or an invite.
        case message, mention, invite
        /// An incoming call: the ring.
        case incomingCall
        /// Every other sound (joining a call, mute, camera, ...). Desktop does not silence those.
        case other
    }

    /// Whether a Diddy status ("online", "idle", "dnd", "invisible") is Do Not Disturb. An unknown
    /// status (nil, not loaded yet) is not.
    static func isOn(_ status: String?) -> Bool {
        status == "dnd"
    }

    /// Whether the sound of an alert is silenced.
    static func silencesSound(_ alert: Alert, status: String?) -> Bool {
        guard isOn(status) else { return false }
        return alert != .other
    }

    /// Whether the system notification of an alert is not posted. An incoming call keeps its
    /// notification, without the ring, so it stays visible like on desktop.
    static func silencesNotification(_ alert: Alert, status: String?) -> Bool {
        guard isOn(status) else { return false }
        switch alert {
        case .message, .mention, .invite:
            return true
        case .incomingCall, .other:
            return false
        }
    }
}
