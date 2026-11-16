import Foundation

/// One device in a call: a MatrixRTC membership (`org.matrix.msc3401.call.member`, legacy format).
struct CallDevice: Hashable, Comparable {
    let userId: String
    let deviceId: String

    /// The LiveKit identity of a legacy membership, "@user:server:DEVICE".
    var identity: String { "\(userId):\(deviceId)" }

    static func < (a: CallDevice, b: CallDevice) -> Bool { a.identity < b.identity }
}

/// A `call.member` state event as the SDK hands it over.
struct CallMemberEvent {
    let sender: String
    let stateKey: String
    let contentJson: String
    /// origin_server_ts in ms; nil for stripped state.
    let timestamp: UInt64?
}

/// The rules for the call's media keys, as Element Call 0.20 has them (matrix-js-sdk
/// `RTCEncryptionManager`, one key per device over encrypted to-device messages): who gets our
/// key, when a new one is due, which key slot it goes into, and what the call header says about
/// encryption. Foundation only: Tools/callkeys_check tests it.
enum CallKeyLogic {
    /// Same as matrix-js-sdk's default membership expiry (4 h).
    static let defaultExpiryMs: UInt64 = 4 * 60 * 60 * 1000
    /// Element Call sends a new key first and encrypts with it this much later, so the others
    /// already have it when the first frames arrive.
    static let useKeyDelayMs: UInt64 = 1000
    /// Key slots per participant (LiveKit's key ring, Element Call counts its key index around it).
    static let keyRingSize: Int32 = 256

    // MARK: Memberships

    /// The device of a live membership in this room's call, with its `created_ts`, or nil: left
    /// (empty content), expired, another call or application, no LiveKit focus, or a state key
    /// that belongs to someone other than the sender. The device is the event's sender (checked
    /// by the server) with the `device_id` of the content, like matrix-js-sdk's `CallMembership`.
    static func member(of event: CallMemberEvent, now: UInt64) -> (device: CallDevice, createdTs: UInt64)? {
        guard let data = event.contentJson.data(using: .utf8),
              let content = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              content["application"] as? String == "m.call",
              (content["call_id"] as? String ?? "") == "",
              (content["scope"] as? String ?? "m.room") == "m.room",
              let deviceId = content["device_id"] as? String, !deviceId.isEmpty,
              event.sender.hasPrefix("@"), event.sender.contains(":"),
              ownsStateKey(event.stateKey, sender: event.sender),
              hasLiveKitFocus(content),
              let created = number(content["created_ts"]) ?? event.timestamp
        else { return nil }
        let expires = number(content["expires"]) ?? defaultExpiryMs
        let (end, overflow) = created.addingReportingOverflow(expires)
        guard overflow || end > now else { return nil }
        return (CallDevice(userId: event.sender, deviceId: deviceId), created)
    }

    /// Every live device of the room's call with the `created_ts` of its membership.
    static func members(_ events: [CallMemberEvent], now: UInt64) -> [CallDevice: UInt64] {
        var result: [CallDevice: UInt64] = [:]
        for event in events {
            guard let entry = member(of: event, now: now) else { continue }
            // two state keys for one device (older and newer key format): the newer membership
            result[entry.device] = max(result[entry.device] ?? 0, entry.createdTs)
        }
        return result
    }

    /// Legacy state keys: "_@user:server_DEVICE_m.call", "@user:server_DEVICE" or "@user:server".
    static func ownsStateKey(_ stateKey: String, sender: String) -> Bool {
        stateKey == sender || stateKey.hasPrefix(sender + "_") || stateKey.hasPrefix("_" + sender + "_")
    }

    /// Diddy and Element Call only do LiveKit calls: `focus_active` (or, without it, a preferred
    /// focus) must be LiveKit.
    private static func hasLiveKitFocus(_ content: [String: Any]) -> Bool {
        if let active = content["focus_active"] {
            return (active as? [String: Any])?["type"] as? String == "livekit"
        }
        let preferred = content["foci_preferred"] as? [[String: Any]] ?? []
        return preferred.contains { $0["type"] as? String == "livekit" }
    }

    private static func number(_ value: Any?) -> UInt64? {
        guard let number = value as? NSNumber else { return nil }
        let double = number.doubleValue
        guard double.isFinite, double >= 0, double < 1.8e19 else { return nil }
        return UInt64(double)
    }

    // MARK: Who gets the key

    /// The to-device recipients (user id -> device ids) for `devices`, without this device. Your
    /// own other devices stay in: the iPhone that is your computer's camera and microphone needs
    /// the computer's key, and the computer the phone's (1.11.0).
    static func recipients(_ devices: [CallDevice], excluding own: CallDevice) -> [String: [String]] {
        var result: [String: [String]] = [:]
        for device in Set(devices).sorted() where device != own {
            result[device.userId, default: []].append(device.deviceId)
        }
        return result
    }

    /// A device that had our current key has left, or left and came back (its membership has
    /// another `created_ts`): it could still decrypt us, so a new key is due for everyone else.
    static func needsNewKey(sharedWith: [CallDevice: UInt64], members: [CallDevice: UInt64]) -> Bool {
        sharedWith.contains { device, created in members[device] != created }
    }

    /// Devices in the call that have not had the current key yet (joined since it was sent).
    static func waitingForKey(sharedWith: [CallDevice: UInt64], members: [CallDevice: UInt64]) -> [CallDevice] {
        members.filter { sharedWith[$0.key] != $0.value }.map(\.key).sorted()
    }

    // MARK: Key slots

    /// The slot for a new key. Element Call counts up (0, 1, 2 ... 255, 0) and keeps encrypting
    /// with the old slot until the others have the new key. LiveKit's Swift SDK 2.18 encrypted every
    /// frame with slot 0, whatever index was set (fixed in 2.19), so with `senderFollowsKeyIndex`
    /// off a new key has to replace slot 0, or the old key would stay in use.
    static func nextKeyIndex(after current: Int32, senderFollowsKeyIndex: Bool) -> Int32 {
        guard senderFollowsKeyIndex else { return 0 }
        return (current + 1) % keyRingSize
    }

    /// How long a new key waits after sending before it encrypts. With one slot the old key is
    /// gone at the others the moment the new one arrives, so waiting would only make the gap longer.
    static func useDelayMs(senderFollowsKeyIndex: Bool) -> UInt64 {
        senderFollowsKeyIndex ? useKeyDelayMs : 0
    }

    // MARK: What the call header shows

    enum Encryption: Equatable {
        /// The room is not encrypted: the media is not either.
        case off
        /// Encrypted, and a key has arrived from everyone in the call.
        case on
        /// Encrypted, but the keys of this many devices have not arrived yet (cannot hear or see them).
        case waiting(Int)
    }

    /// `remote` are the LiveKit identities of the others in the call (your own other devices
    /// too), `keysFrom` the identities whose key has arrived.
    static func encryption(roomEncrypted: Bool, remote: [String], keysFrom: Set<String>) -> Encryption {
        guard roomEncrypted else { return .off }
        let missing = Set(remote).subtracting(keysFrom).count
        return missing == 0 ? .on : .waiting(missing)
    }

    static func title(_ encryption: Encryption) -> String {
        switch encryption {
        case .off: return "Not encrypted"
        case .on: return "End-to-end encrypted"
        case .waiting: return "Encrypted, keys missing"
        }
    }

    static func detail(_ encryption: Encryption) -> String {
        switch encryption {
        case .off: return "This room is not encrypted, so the call is not either."
        case .on: return "Only the devices in this call can hear and see it. Everyone's key has arrived."
        case .waiting(let count):
            let devices = count == 1 ? "1 device" : "\(count) devices"
            return "Only the devices in this call can hear and see it. Waiting for the key of \(devices); until it arrives you cannot hear or see it."
        }
    }
}
