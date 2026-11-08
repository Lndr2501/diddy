import Foundation
import os

/// Call alerts while Diddy is closed, without Apple push (which a free developer account cannot use).
///
/// The callee picks a secret ntfy topic and leaves it in each direct message as an
/// `app.diddy.call_push` state event. When someone rings them from Diddy, the caller's app posts
/// "<name> is calling you" to that topic, and the ntfy app shows it. Calls from other clients
/// send nothing.
enum CallPushSettings {
    static let enabledKey = "diddy.callPush.enabled"
    static let serverKey = "diddy.callPush.server"
    private static let topicKey = "diddy.callPush.topic"
    static let defaultServer = "https://ntfy.sh"

    static var isEnabled: Bool { UserDefaults.standard.bool(forKey: enabledKey) }

    static var server: String {
        let value = UserDefaults.standard.string(forKey: serverKey)?.trimmingCharacters(in: .whitespaces) ?? ""
        return value.isEmpty ? defaultServer : value
    }

    /// Made once per install. Anyone who knows it can send to it, so it is long and random.
    static var topic: String {
        if let topic = UserDefaults.standard.string(forKey: topicKey) { return topic }
        let characters = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        let topic = "diddy_" + String((0..<32).map { _ in characters.randomElement()! })
        UserDefaults.standard.set(topic, forKey: topicKey)
        return topic
    }
}

/// What the state event holds.
struct CallPushTarget: Equatable {
    static let eventType = "app.diddy.call_push"

    let server: String
    let topic: String

    init(server: String, topic: String) {
        self.server = server
        self.topic = topic
    }

    /// Only well-formed targets: the content comes from the other side of the room.
    init?(content: [String: Any]) {
        guard let server = content["server"] as? String, let topic = content["topic"] as? String,
              Self.isAllowed(server: server), topic.range(of: #"^[-_A-Za-z0-9]{1,64}$"#, options: .regularExpression) != nil
        else { return nil }
        self.init(server: server, topic: topic)
    }

    var content: [String: Any] { ["server": server, "topic": topic] }

    /// HTTPS only. Debug builds also reach a local ntfy for testing.
    static func isAllowed(server: String) -> Bool {
        guard let url = URL(string: server), let host = url.host, !host.isEmpty, url.query == nil else { return false }
        if url.scheme == "https" { return true }
        #if DEBUG
        return url.scheme == "http" && (host == "localhost" || host == "127.0.0.1")
        #else
        return false
        #endif
    }
}

@MainActor
final class CallPush {
    static let shared = CallPush()

    private let log = Logger(subsystem: "app.diddy.ios", category: "callpush")
    /// Direct messages being written right now, so a burst of room updates writes each once.
    private var writing: Set<String> = []

    private init() {}

    /// The target this device wants in its direct messages, or nil when alerts are off.
    private var wanted: CallPushTarget? {
        guard CallPushSettings.isEnabled, CallPushTarget.isAllowed(server: CallPushSettings.server) else { return nil }
        return CallPushTarget(server: CallPushSettings.server, topic: CallPushSettings.topic)
    }

    /// Writes the current target into every direct message that does not have it yet, and clears
    /// it again when alerts are switched off. Remembers what it wrote, so it is cheap to call often.
    func publish(account: MatrixAccount) {
        let key = "diddy.callPush.published.\(account.userId)"
        let published = UserDefaults.standard.dictionary(forKey: key) as? [String: String] ?? [:]
        let wanted = wanted
        let marker = wanted.map { "\($0.server)/\($0.topic)" } ?? ""
        for room in account.directMessages where (published[room.id] ?? "") != marker {
            guard !writing.contains(room.id), let matrixRoom = account.room(room.id) else { continue }
            writing.insert(room.id)
            Task {
                defer { writing.remove(room.id) }
                do {
                    let data = try JSONSerialization.data(withJSONObject: wanted?.content ?? [:])
                    _ = try await matrixRoom.sendStateEventRaw(
                        eventType: CallPushTarget.eventType,
                        stateKey: account.userId,
                        content: String(decoding: data, as: UTF8.self),
                        requestConfigOverride: nil
                    )
                    var current = UserDefaults.standard.dictionary(forKey: key) as? [String: String] ?? [:]
                    current[room.id] = marker
                    UserDefaults.standard.set(current, forKey: key)
                } catch {
                    log.error("could not write the call alert target: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    /// Tells the other people in a direct message that you are calling, through their ntfy topic.
    func notify(account: MatrixAccount, roomId: String) async {
        guard let members = try? await account.joinedMembers(of: roomId) else { return }
        for userId in members where userId != account.userId {
            guard let content = try? await account.stateContent(of: roomId, type: CallPushTarget.eventType, stateKey: userId),
                  let target = CallPushTarget(content: content) else { continue }
            await send(to: target, title: "\(account.title) is calling you", message: "Open Diddy to answer.")
        }
    }

    /// Lets you check in Settings that the ntfy app is subscribed.
    func sendTest() async -> Bool {
        guard CallPushTarget.isAllowed(server: CallPushSettings.server) else { return false }
        let target = CallPushTarget(server: CallPushSettings.server, topic: CallPushSettings.topic)
        return await send(to: target, title: "Diddy", message: "Call alerts are working.")
    }

    @discardableResult
    private func send(to target: CallPushTarget, title: String, message: String) async -> Bool {
        // JSON to the server root, so names outside ASCII survive (HTTP headers would not carry them).
        let root = target.server.hasSuffix("/") ? target.server : target.server + "/"
        guard let url = URL(string: root) else { return false }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "topic": target.topic, "title": title, "message": message,
            "priority": 5, "tags": ["telephone_receiver"],
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            log.debug("sent call alert status=\(status)")
            return status == 200
        } catch {
            log.error("could not send the call alert: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }
}
