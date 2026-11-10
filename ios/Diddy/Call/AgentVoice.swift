import Foundation

/// "Talking to an agent" (#57 on the desktop, #131 here): while someone dictates to an AI agent
/// they mute their microphone and tell the others in the call, who see "Redet mit Agent" on their
/// tile. Wire format of the desktop (`cinny/src/app/plugins/agentVoice/remote.ts`): the to-device
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

    func json() -> String {
        let object: [String: Any] = ["room_id": roomId, "active": active, "ts": Int64(ts)]
        let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
        return String(data: data, encoding: .utf8) ?? "{}"
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

/// Mutes the microphone when talking to the agent starts and undoes that afterwards, but only when
/// Diddy did it and nothing was changed by hand in between (the same rule as the desktop).
struct AgentMuteTracker {
    private var mutedByAgent = false

    /// True when the microphone has to be switched off now.
    mutating func begin(microphoneOn: Bool) -> Bool {
        mutedByAgent = microphoneOn
        return microphoneOn
    }

    /// True when the microphone has to be switched back on now.
    mutating func end(microphoneOn: Bool, deafened: Bool) -> Bool {
        defer { mutedByAgent = false }
        return mutedByAgent && !microphoneOn && !deafened
    }

    /// The person muted, unmuted or deafened by hand: that choice wins.
    mutating func userChangedMicrophone() { mutedByAgent = false }
}

/// The state machine behind the "Mit Agent reden" button, kept apart from the call so it does not
/// grow `CallSession`. The call hands in what it can do as closures.
@MainActor
final class AgentVoiceCoordinator {
    struct Hooks {
        let roomId: String
        let microphoneOn: () -> Bool
        let deafened: () -> Bool
        /// Switches the microphone without any sound (a mute tone would end up in the dictation).
        let setMicrophone: (Bool) async -> Void
        /// Tells the other call devices (`nil`: everyone in the call).
        let broadcast: (AgentVoicePayload, [String]?) -> Void
        /// Members that are in the call besides us.
        let otherMembers: () -> Set<String>
        let changed: () -> Void
    }

    private(set) var talking = false { didSet { if talking != oldValue { hooks.changed() } } }
    private(set) var remote = Set<String>() { didSet { if remote != oldValue { hooks.changed() } } }

    private let hooks: Hooks
    private var tracker = AgentMuteTracker()
    private var remoteVoices = RemoteAgentVoices()
    private var lastSent: Double = 0
    private var safetyTimer: Task<Void, Never>?
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

    // MARK: Own state

    func set(talking on: Bool) async {
        guard on != talking else { return }
        talking = on
        safetyTimer?.cancel()
        if on {
            safetyTimer = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(AgentVoice.maxActive * 1_000_000_000))
                guard !Task.isCancelled else { return }
                await self?.set(talking: false)
            }
            if tracker.begin(microphoneOn: hooks.microphoneOn()) { await hooks.setMicrophone(false) }
        } else {
            safetyTimer = nil
            if tracker.end(microphoneOn: hooks.microphoneOn(), deafened: hooks.deafened()) {
                await hooks.setMicrophone(true)
            }
        }
        hooks.broadcast(makePayload(active: on), nil)
    }

    func userChangedMicrophone() { tracker.userChangedMicrophone() }

    /// Someone joined the call late: they learn that we are still talking to the agent.
    func tellNewcomer(deviceIdentity: String) {
        guard talking else { return }
        hooks.broadcast(makePayload(active: true), [deviceIdentity])
    }

    /// Leaving the call: the others hear the end, the microphone is not touched any more.
    func leave() {
        safetyTimer?.cancel()
        pruning?.cancel()
        if talking {
            talking = false
            hooks.broadcast(makePayload(active: false), nil)
        }
        remoteVoices.clear()
        remote = []
    }

    // MARK: Others

    func receive(message json: String, sender: String) {
        guard let payload = AgentVoicePayload.parse(json), hooks.otherMembers().contains(sender) else { return }
        if remoteVoices.receive(sender: sender, payload: payload, roomId: hooks.roomId) {
            remote = remoteVoices.users
        }
    }

    func prune() {
        if remoteVoices.prune(members: hooks.otherMembers()) { remote = remoteVoices.users }
    }

    private func makePayload(active: Bool) -> AgentVoicePayload {
        // Strictly increasing: the receiver drops anything that is not newer than the last message.
        lastSent = max(Date().timeIntervalSince1970 * 1000, lastSent + 1)
        return AgentVoicePayload(roomId: hooks.roomId, active: active, ts: lastSent.rounded(.down))
    }
}
