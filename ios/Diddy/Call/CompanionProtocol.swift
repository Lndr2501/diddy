import Foundation

/// "Use iPhone as Camera & Mic": the computer (desktop app) asks your own iPhone to join its call
/// as a second device of yours that sends camera, microphone and/or screen and plays no sound.
/// Three encrypted to-device messages between your own devices (desktop:
/// `cinny/src/app/plugins/call/companion.ts`), no server of our own. Foundation only:
/// Tools/companion_check tests it.
enum CompanionProtocol {
    static let requestType = "app.diddy.call.companion.request"
    static let stateType = "app.diddy.call.companion.state"
    static let controlType = "app.diddy.call.companion.control"
    /// LiveKit attribute of the phone's participant: the device it works for.
    static let attribute = "diddy.companion_of"

    struct Media: Equatable {
        var camera: Bool
        var microphone: Bool
        var screen: Bool
    }

    /// The computer asks: join `roomId` for its device `deviceId` and send `media`.
    struct Request: Equatable, Identifiable {
        var id: String
        var roomId: String
        var roomName: String
        var deviceId: String
        var media: Media
    }

    /// The computer changes what the phone sends, or ends it.
    struct Control: Equatable {
        var requestId: String
        var microphone: Bool?
        var camera: Bool?
        var end: Bool
    }

    static func parseRequest(_ json: String) -> Request? {
        guard let content = object(json), (content["v"] as? NSNumber)?.intValue == 1,
              let id = text(content["request_id"], max: 64),
              let roomId = text(content["room_id"], max: 255), roomId.hasPrefix("!"),
              let deviceId = text(content["device_id"], max: 255)
        else { return nil }
        let media = Media(camera: content["camera"] as? Bool ?? false,
                          microphone: content["microphone"] as? Bool ?? false,
                          screen: content["screen"] as? Bool ?? false)
        guard media.camera || media.microphone || media.screen else { return nil }
        return Request(id: id, roomId: roomId, roomName: text(content["room_name"], max: 200) ?? "",
                       deviceId: deviceId, media: media)
    }

    static func parseControl(_ json: String) -> Control? {
        guard let content = object(json), (content["v"] as? NSNumber)?.intValue == 1,
              let id = text(content["request_id"], max: 64) else { return nil }
        return Control(requestId: id, microphone: content["microphone"] as? Bool,
                       camera: content["camera"] as? Bool, end: content["end"] as? Bool ?? false)
    }

    /// What the phone tells the computer: joined or not, and what it sends right now.
    static func state(requestId: String, deviceId: String, joined: Bool, media: Media) -> String {
        let content: [String: Any] = [
            "v": 1,
            "request_id": requestId,
            "device_id": deviceId,
            "joined": joined,
            "camera": media.camera,
            "microphone": media.microphone,
            "screen": media.screen,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: content, options: [.sortedKeys]) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }

    /// Only your own other devices may ask, and only encrypted (the sender is then attested).
    static func accepts(sender: String, ownUserId: String, encrypted: Bool, requestDevice: String, ownDeviceId: String) -> Bool {
        encrypted && sender == ownUserId && requestDevice != ownDeviceId
    }

    private static func object(_ json: String) -> [String: Any]? {
        guard let data = json.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private static func text(_ value: Any?, max: Int) -> String? {
        guard let string = value as? String else { return nil }
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= max else { return nil }
        return trimmed
    }
}
