import Foundation

/// "Talking to an agent" (#57 on the desktop): while someone dictates to an AI agent they mute
/// their microphone and tell the others in the call, who see "Redet mit Agent" on their tile.
/// iOS only shows this for others; it does not send it (talking to an agent makes no sense on a phone).
/// Wire format of the desktop (`cinny/src/app/plugins/agentVoice/remote.ts`): the to-device
/// event `app.diddy.agent_voice` with `{"room_id": "!room:server", "active": true, "ts": <ms>}`,
/// sent to the devices of the other call members. It is ephemeral: nothing is stored in the room.
enum AgentVoice {
    static let eventType = "app.diddy.agent_voice"
    /// Nobody dictates this long: a lost "stopped" message or a forgotten toggle must not stick.
    static let maxActive: TimeInterval = 5 * 60
}

struct AgentVoicePayload: Equatable {
    let roomId: String
    let active: Bool
    /// Milliseconds since 1970, as the desktop sends it. Newer messages of a sender win.
    let ts: Double

    /// Remote content is hostile: wrong types, an odd room id or a non-finite timestamp are ignored.
    static func parse(_ json: String) -> AgentVoicePayload? {
        guard let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let roomId = object["room_id"] as? String, roomId.hasPrefix("!"), roomId.count <= 255,
              let active = object["active"] as? NSNumber, isBoolean(active),
              let ts = object["ts"] as? NSNumber, !isBoolean(ts), ts.doubleValue.isFinite
        else { return nil }
        return AgentVoicePayload(roomId: roomId, active: active.boolValue, ts: ts.doubleValue)
    }

    private static func isBoolean(_ number: NSNumber) -> Bool {
        CFGetTypeID(number) == CFBooleanGetTypeID()
    }
}

/// Who of the others in the call currently talks to an agent. The newest message per sender wins,
/// and an active state expires (a lost "stopped" message must not stick).
struct RemoteAgentVoices {
    private var until: [String: Date] = [:]
    private var lastTs: [String: Double] = [:]

    var users: Set<String> { Set(until.keys) }

    /// Returns true when the set of talking users changed.
    mutating func receive(sender: String, payload: AgentVoicePayload, roomId: String, now: Date = Date()) -> Bool {
        guard payload.roomId == roomId else { return false }
        if let last = lastTs[sender], payload.ts <= last { return false }
        lastTs[sender] = payload.ts
        let had = until[sender] != nil
        if payload.active {
            until[sender] = now.addingTimeInterval(AgentVoice.maxActive)
        } else {
            until[sender] = nil
        }
        return had != payload.active
    }

    /// Keeps only call members and drops expired entries. Returns true when something changed.
    mutating func prune(members: Set<String>, now: Date = Date()) -> Bool {
        var changed = false
        for (user, expiry) in until where expiry <= now || !members.contains(user) {
            until[user] = nil
            changed = true
        }
        return changed
    }

    mutating func clear() {
        until = [:]
        lastTs = [:]
    }
}

/// Who of the others in the call talks to an agent right now, fed by the to-device messages of the
/// desktop. The call hands in what it needs as closures.
@MainActor
final class RemoteAgentVoiceWatcher {
    struct Hooks {
        let roomId: String
        /// Members that are in the call besides us.
        let otherMembers: () -> Set<String>
        let changed: () -> Void
    }

    private(set) var remote = Set<String>() { didSet { if remote != oldValue { hooks.changed() } } }

    private let hooks: Hooks
    private var voices = RemoteAgentVoices()
    private var pruning: Task<Void, Never>?

    init(hooks: Hooks) {
        self.hooks = hooks
        pruning = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                self?.prune()
            }
        }
    }

    deinit { pruning?.cancel() }

    func receive(message json: String, sender: String) {
        guard let payload = AgentVoicePayload.parse(json), hooks.otherMembers().contains(sender) else { return }
        if voices.receive(sender: sender, payload: payload, roomId: hooks.roomId) {
            remote = voices.users
        }
    }

    func prune() {
        if voices.prune(members: hooks.otherMembers()) { remote = voices.users }
    }

    /// Leaving the call: forget everybody.
    func leave() {
        pruning?.cancel()
        voices.clear()
        remote = []
    }
}
