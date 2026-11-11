import Foundation
#if canImport(CryptoKit)
import CryptoKit
#endif

// Watch together (#83) on iOS: a port of the desktop logic in
// cinny/src/app/plugins/watchTogether/ (youtube.ts, protocol.ts, sponsorBlock.ts, controller.ts).
// Same wire format, same sync rules. Foundation only, checked by Tools/watchtogether_check.

// MARK: - YouTube links and the player's IFrame API messages (youtube.ts)

enum WatchYouTube {
    /// Longest start offset we accept from a link (24 h).
    static let maxStart: Double = 24 * 3600
    /// The privacy-enhanced embed host.
    static let embedOrigin = "https://www.youtube-nocookie.com"
    static let playerOrigins = [embedOrigin, "https://www.youtube.com", "https://youtube.com"]

    /// A YouTube video id: exactly 11 characters from the URL-safe base64 alphabet.
    static func isVideoId(_ value: String?) -> Bool {
        guard let value else { return false }
        let bytes = Array(value.utf8)
        guard bytes.count == 11, value.utf16.count == 11 else { return false }
        return bytes.allSatisfy { b in
            (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || (b >= 0x30 && b <= 0x39) || b == 0x5F || b == 0x2D
        }
    }

    static func isASCIIDigits(_ s: Substring) -> Bool {
        !s.isEmpty && s.utf8.allSatisfy { $0 >= 0x30 && $0 <= 0x39 }
    }

    /// "90", "90s", "1m30s", "1h2m3s" (YouTube's t= / start= formats) in whole seconds.
    static func parseStartTime(_ value: String?) -> Double {
        guard let value, !value.isEmpty else { return 0 }
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var seconds: Double
        if let plain = plainSeconds(text) {
            seconds = plain
        } else {
            guard !text.isEmpty, let hms = hmsSeconds(text) else { return 0 }
            seconds = hms
        }
        if !seconds.isFinite || seconds < 0 { return 0 }
        return min(seconds, maxStart)
    }

    /// `^\d+(\.\d+)?s?$`, floored.
    private static func plainSeconds(_ text: String) -> Double? {
        var body = Substring(text)
        if body.hasSuffix("s") { body = body.dropLast() }
        let parts = body.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 1 || parts.count == 2, parts.allSatisfy(isASCIIDigits) else { return nil }
        guard let number = Double(String(body)) else { return nil }
        return number.rounded(.down)
    }

    /// `^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$`
    private static func hmsSeconds(_ text: String) -> Double? {
        var rest = Substring(text)
        var total: Double = 0
        for (unit, factor) in [("h", 3600.0), ("m", 60.0), ("s", 1.0)] {
            guard let index = rest.firstIndex(where: { !($0.isASCII && $0.isNumber) }) else {
                // digits without a unit at the end do not match
                if rest.isEmpty { break }
                return nil
            }
            let digits = rest[..<index]
            if String(rest[index]) == unit {
                if digits.isEmpty || !isASCIIDigits(digits) { return nil }
                guard let n = Double(String(digits)) else { return nil }
                total += n * factor
                rest = rest[rest.index(after: index)...]
            } else if !digits.isEmpty {
                // digits followed by a later unit: let that unit's turn read them
                continue
            }
        }
        return rest.isEmpty ? total : nil
    }

    private static let youtubeHosts: Set<String> = ["youtube.com", "youtube-nocookie.com"]
    private static let pathIdPrefixes: Set<String> = ["shorts", "embed", "live", "v", "e"]

    /// Reads a video id and an optional start time from what the user pasted: youtube.com/watch?v=,
    /// youtu.be/, /shorts/, /embed/, /live/ (with or without scheme), or a bare 11-character id.
    static func parseURL(_ input: String) -> (videoId: String, start: Double)? {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty || text.utf16.count > 2048 { return nil }
        if isVideoId(text) { return (text, 0) }

        let withScheme = hasScheme(text) ? text : "https://\(text)"
        var components = URLComponents(string: withScheme)
        if components == nil {
            var allowed = CharacterSet.urlFragmentAllowed
            allowed.insert(charactersIn: "#%")
            if let escaped = withScheme.addingPercentEncoding(withAllowedCharacters: allowed) {
                components = URLComponents(string: escaped)
            }
        }
        guard let url = components, let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http", let rawHost = url.host
        else { return nil }
        var host = rawHost.lowercased()
        for prefix in ["www.", "m.", "music."] where host.hasPrefix(prefix) {
            host = String(host.dropFirst(prefix.count))
            break
        }
        let parts = url.percentEncodedPath.split(separator: "/").map(String.init)

        var videoId: String?
        if host == "youtu.be" {
            videoId = parts.first
        } else if youtubeHosts.contains(host) {
            if parts.first == "watch" {
                videoId = queryValue(url, "v")
            } else if parts.count >= 2, pathIdPrefixes.contains(parts[0]) {
                videoId = parts[1]
            }
        }
        guard let id = videoId, isVideoId(id) else { return nil }

        let start = parseStartTime(queryValue(url, "t") ?? queryValue(url, "start") ?? hashTime(url.percentEncodedFragment))
        return (id, start)
    }

    private static func hasScheme(_ text: String) -> Bool {
        // ^[a-z][a-z0-9+.-]*://
        guard let range = text.range(of: "://") else { return false }
        let scheme = text[..<range.lowerBound]
        guard let first = scheme.unicodeScalars.first, first.isASCII, CharacterSet.letters.contains(first) else { return false }
        return scheme.unicodeScalars.allSatisfy { c in
            c.isASCII && (CharacterSet.alphanumerics.contains(c) || c == "+" || c == "." || c == "-")
        }
    }

    /// Like URLSearchParams.get: the first value, "" for a key without one, nil when absent.
    private static func queryValue(_ url: URLComponents, _ name: String) -> String? {
        guard let item = url.queryItems?.first(where: { $0.name == name }) else { return nil }
        return item.value ?? ""
    }

    /// `(?:^|[#&])t=([^&]+)` in the fragment.
    private static func hashTime(_ fragment: String?) -> String? {
        guard let fragment else { return nil }
        for piece in fragment.split(separator: "&", omittingEmptySubsequences: false) {
            var p = Substring(piece)
            while p.hasPrefix("#") { p = p.dropFirst() }
            if p.hasPrefix("t="), p.count > 2 { return String(p.dropFirst(2)) }
        }
        return nil
    }

    /// application/x-www-form-urlencoded, as URLSearchParams writes it.
    static func formEncode(_ value: String) -> String {
        var out = ""
        for byte in value.utf8 {
            switch byte {
            case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, 0x2A, 0x2D, 0x2E, 0x5F:
                out.append(Character(UnicodeScalar(byte)))
            case 0x20:
                out.append("+")
            default:
                out.append(String(format: "%%%02X", byte))
            }
        }
        return out
    }

    /// The embed URL of the official player. `origin` lets the player answer our postMessage calls,
    /// `widget_referrer` tells YouTube where it is embedded (some videos refuse embeds without it).
    static func embedURL(videoId: String, origin: String, start: Double = 0) -> String? {
        guard isVideoId(videoId) else { return nil }
        var params: [(String, String)] = [
            ("enablejsapi", "1"), ("playsinline", "1"), ("rel", "0"), ("iv_load_policy", "3"),
        ]
        if !origin.isEmpty, origin != "null" {
            params.append(("origin", origin))
            params.append(("widget_referrer", origin))
        }
        if start.isFinite {
            let from = start.rounded(.down)
            if from > 0, from <= maxStart { params.append(("start", String(Int(from)))) }
        }
        let query = params.map { "\(formEncode($0.0))=\(formEncode($0.1))" }.joined(separator: "&")
        return "\(embedOrigin)/embed/\(videoId)?\(query)"
    }

    static func watchURL(_ videoId: String) -> URL? {
        var components = URLComponents(string: "https://www.youtube.com/watch")
        components?.queryItems = [URLQueryItem(name: "v", value: videoId)]
        return components?.url
    }

    /// Human text for the player's error codes.
    static func errorText(_ code: Int) -> String {
        switch code {
        case 2: return "This link does not point to a valid video."
        case 5: return "The player cannot play this video here."
        case 100: return "The video was removed or is private."
        case 101, 150: return "The owner of this video does not allow playing it outside YouTube."
        case 152, 153: return "YouTube refused to play the video inside the app (embed configuration)."
        default: return "YouTube could not play the video (error \(code))."
        }
    }

    /// Quality levels the user can ask for; YouTube treats the choice as a hint at most.
    static let qualityChoices = ["auto", "small", "medium", "large", "hd720", "hd1080", "highres"]
    static let qualityLabels: [String: String] = [
        "auto": "Auto", "tiny": "144p", "small": "240p", "medium": "360p", "large": "480p",
        "hd720": "720p", "hd1080": "1080p", "hd1440": "1440p", "hd2160": "2160p", "highres": "Highest",
    ]

    /// A command for the player, in the format the IFrame API uses.
    static func playerCommand(_ function: String, _ args: [Any] = []) -> String {
        let object: [String: Any] = ["event": "command", "func": function, "args": args, "id": 1, "channel": "widget"]
        // NaN or infinity would raise an Objective-C exception in JSONSerialization.
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: data, encoding: .utf8) else { return "{}" }
        return text
    }

    static let listeningMessage = #"{"event":"listening","id":1,"channel":"widget"}"#
}

/// The YouTube player's states (IFrame API).
enum WatchPlayerState {
    static let unstarted = -1
    static let ended = 0
    static let playing = 1
    static let paused = 2
    static let buffering = 3
    static let cued = 5
}

struct WatchPlayerInfo: Equatable {
    var currentTime: Double?
    var duration: Double?
    var playerState: Int?
    var playbackRate: Double?
    var playbackQuality: String?
    var availableQualityLevels: [String]?
}

enum WatchPlayerMessage: Equatable {
    case ready
    case state(Int)
    case error(Int)
    case rate(Double)
    case quality(String)
    case info(WatchPlayerInfo)
}

/// A JSON number that is not a boolean (JSONSerialization gives both as NSNumber).
func watchNumber(_ value: Any?) -> Double? {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
    let double = number.doubleValue
    return double.isFinite ? double : nil
}

/// Player states and error codes are integers; anything else matches no known state.
private func watchInt(_ value: Double) -> Int {
    Int(exactly: value) ?? Int.min
}

enum WatchPlayerMessages {
    static func isQuality(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        guard (1...16).contains(bytes.count) else { return false }
        return bytes.allSatisfy { ($0 >= 0x61 && $0 <= 0x7A) || ($0 >= 0x30 && $0 <= 0x39) || $0 == 0x5F }
    }

    private static func readInfo(_ raw: Any?) -> WatchPlayerInfo {
        guard let r = raw as? [String: Any] else { return WatchPlayerInfo() }
        var info = WatchPlayerInfo()
        if let t = watchNumber(r["currentTime"]), t >= 0 { info.currentTime = t }
        if let d = watchNumber(r["duration"]), d >= 0 { info.duration = d }
        if let s = watchNumber(r["playerState"]) { info.playerState = watchInt(s) }
        if let rate = watchNumber(r["playbackRate"]), rate > 0 { info.playbackRate = rate }
        if let q = r["playbackQuality"] as? String, isQuality(q) { info.playbackQuality = q }
        if let levels = r["availableQualityLevels"] as? [Any] {
            info.availableQualityLevels = Array(levels.compactMap { $0 as? String }.filter(isQuality).prefix(16))
        }
        return info
    }

    /// Reads one message the player posted to us (a JSON string); unknown messages give nil.
    static func parse(_ data: String) -> WatchPlayerMessage? {
        guard data.utf16.count <= 100_000, let bytes = data.data(using: .utf8),
              let msg = (try? JSONSerialization.jsonObject(with: bytes, options: [.fragmentsAllowed])) as? [String: Any]
        else { return nil }
        switch msg["event"] as? String {
        case "onReady":
            return .ready
        case "onStateChange":
            return watchNumber(msg["info"]).map { .state(watchInt($0)) }
        case "onError":
            return watchNumber(msg["info"]).map { .error(watchInt($0)) }
        case "onPlaybackRateChange":
            guard let rate = watchNumber(msg["info"]), rate > 0 else { return nil }
            return .rate(rate)
        case "onPlaybackQualityChange":
            guard let q = msg["info"] as? String, isQuality(q) else { return nil }
            return .quality(q)
        case "initialDelivery", "infoDelivery":
            return .info(readInfo(msg["info"]))
        default:
            return nil
        }
    }
}

// MARK: - The sync messages (protocol.ts)

enum WatchPlayback: String, Equatable {
    case playing, paused, stopped
}

/// The shared state of the video in one call.
struct SharedWatch: Equatable {
    /// random id of one "watch together" run (a new video starts a new session)
    var session: String
    var videoId: String
    var state: WatchPlayback
    /// position in seconds at `ts`
    var position: Double
    var rate: Double
    /// sender's wall clock (ms) at which `position` was right
    var ts: Double
    /// grows with every change; the highest wins (ties: the larger sender id)
    var seq: Int
    /// who made this change
    var sender: String
}

struct WatchStateMessage: Equatable {
    var room: String
    var session: String
    var videoId: String
    var state: WatchPlayback
    var position: Double
    var rate: Double
    var ts: Double
    var seq: Int
}

enum WatchMessage: Equatable {
    case state(WatchStateMessage)
    case request(room: String)
}

/// A change to the shared state (what the user did in the player).
struct WatchPatch: Equatable {
    var state: WatchPlayback?
    var position: Double?
    var rate: Double?
}

/// One device of the call (to-device recipient).
struct WatchDevice: Hashable {
    let userId: String
    let deviceId: String
}

enum WatchProtocol {
    static let eventType = "app.diddy.watch_together"
    static let version = 1
    static let minRate = 0.25
    static let maxRate = 2.0
    static let maxSeq = 1_000_000_000_000
    /// Messages whose clock is further off than this get the receive time instead.
    static let maxClockSkewMs: Double = 60_000

    /// ^[A-Za-z0-9]{8,32}$
    static func isSession(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        guard (8...32).contains(bytes.count) else { return false }
        return bytes.allSatisfy { ($0 >= 0x41 && $0 <= 0x5A) || ($0 >= 0x61 && $0 <= 0x7A) || ($0 >= 0x30 && $0 <= 0x39) }
    }

    /// JavaScript's `\s`.
    private static let jsWhitespace: Set<UInt32> = [
        0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
        0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF,
    ]

    /// ^![^\s]{1,254}$
    static func isRoomId(_ value: String) -> Bool {
        guard value.hasPrefix("!") else { return false }
        let rest = value.dropFirst()
        guard (1...254).contains(rest.utf16.count) else { return false }
        return !rest.unicodeScalars.contains { jsWhitespace.contains($0.value) }
    }

    /// Validates an incoming message (parsed JSON); anything malformed gives nil.
    static func parse(_ content: Any?) -> WatchMessage? {
        guard let c = content as? [String: Any] else { return nil }
        guard let v = watchNumber(c["v"]), v == Double(version) else { return nil }
        guard let room = c["room_id"] as? String, isRoomId(room) else { return nil }
        let kind = c["kind"] as? String
        if kind == "request" { return .request(room: room) }
        guard kind == "state" else { return nil }
        guard let session = c["session"] as? String, isSession(session) else { return nil }
        guard let videoId = c["video_id"] as? String, WatchYouTube.isVideoId(videoId) else { return nil }
        guard let stateText = c["state"] as? String, let state = WatchPlayback(rawValue: stateText) else { return nil }
        guard let position = watchNumber(c["position"]), position >= 0, position <= WatchYouTube.maxStart else { return nil }
        guard let rate = watchNumber(c["rate"]), rate >= minRate, rate <= maxRate else { return nil }
        guard let ts = watchNumber(c["ts"]), ts > 0, ts <= 1e14 else { return nil }
        guard let seqValue = watchNumber(c["seq"]), seqValue.rounded() == seqValue,
              seqValue >= 0, seqValue <= Double(maxSeq) else { return nil }
        return .state(WatchStateMessage(
            room: room, session: session, videoId: videoId, state: state,
            position: position, rate: rate, ts: ts, seq: Int(seqValue)
        ))
    }

    /// Parses the JSON string of a to-device message.
    static func parse(json: String) -> WatchMessage? {
        guard json.utf8.count <= 65_536, let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) else { return nil }
        return parse(object)
    }

    /// The wire format of a shared state (sent as to-device content).
    static func stateContent(room: String, _ s: SharedWatch) -> [String: Any] {
        [
            "v": version,
            "kind": "state",
            "room_id": room,
            "session": s.session,
            "video_id": s.videoId,
            "state": s.state.rawValue,
            "position": (s.position * 1000).rounded() / 1000,
            "rate": s.rate,
            "ts": Int64(s.ts.rounded()),
            "seq": s.seq,
        ]
    }

    static func requestContent(room: String) -> [String: Any] {
        ["v": version, "kind": "request", "room_id": room]
    }

    static func json(_ object: [String: Any]) -> String? {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Turns a received state message into the shared state; a clock far off is replaced by `now`.
    static func fromMessage(_ msg: WatchStateMessage, sender: String, now: Double) -> SharedWatch {
        SharedWatch(
            session: msg.session, videoId: msg.videoId, state: msg.state, position: msg.position,
            rate: msg.rate,
            ts: msg.ts > now || now - msg.ts > maxClockSkewMs ? now : msg.ts,
            seq: msg.seq, sender: sender
        )
    }

    /// JavaScript string order (UTF-16 code units).
    static func jsGreater(_ a: String, _ b: String) -> Bool {
        b.utf16.lexicographicallyPrecedes(a.utf16)
    }

    /// Last writer wins: a higher seq, or the same seq from the larger sender id.
    static func isNewer(_ next: SharedWatch, than current: SharedWatch?) -> Bool {
        guard let current else { return true }
        if next.seq != current.seq { return next.seq > current.seq }
        if next.sender != current.sender { return jsGreater(next.sender, current.sender) }
        return false
    }

    /// Where the video should be now (seconds).
    static func expectedPosition(_ s: SharedWatch, now: Double) -> Double {
        guard s.state == .playing else { return s.position }
        let elapsed = max(0, now - s.ts) / 1000
        return min(WatchYouTube.maxStart, s.position + elapsed * s.rate)
    }

    /// The same state, restated at `now` (for answers to late joiners).
    static func rebase(_ s: SharedWatch, now: Double) -> SharedWatch {
        var next = s
        next.position = expectedPosition(s, now: now)
        next.ts = now
        return next
    }

    /// A local change: one higher than everything seen so far.
    static func nextChange(_ current: SharedWatch, patch: WatchPatch, sender: String, now: Double) -> SharedWatch {
        var next = rebase(current, now: now)
        if let state = patch.state { next.state = state }
        if let position = patch.position { next.position = position }
        next.rate = min(maxRate, max(minRate, patch.rate ?? current.rate))
        next.ts = now
        next.seq = current.seq + 1
        next.sender = sender
        return next
    }

    /// A random session id (letters and digits).
    static func newSessionId(random: () -> Double = { Double.random(in: 0..<1) }) -> String {
        let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
        return String((0..<16).map { _ in chars[min(chars.count - 1, max(0, Int((random() * Double(chars.count)).rounded(.down))))] })
    }

    static func startWatch(
        videoId: String, start: Double, previous: SharedWatch?, sender: String, now: Double,
        random: () -> Double = { Double.random(in: 0..<1) }
    ) -> SharedWatch {
        SharedWatch(
            session: newSessionId(random: random), videoId: videoId, state: .playing,
            position: min(WatchYouTube.maxStart, max(0, start)), rate: 1, ts: now,
            seq: (previous?.seq ?? 0) + 1, sender: sender
        )
    }

    /// The call devices to tell, as the `user id -> device ids` map to-device sending wants:
    /// every other call member's device, never one of our own (like the desktop).
    static func recipients(_ devices: [WatchDevice], ownUserId: String, onlyUser: String? = nil) -> [String: [String]] {
        var map: [String: [String]] = [:]
        for device in devices where device.userId != ownUserId && !device.deviceId.isEmpty {
            if let onlyUser, device.userId != onlyUser { continue }
            if map[device.userId]?.contains(device.deviceId) == true { continue }
            map[device.userId, default: []].append(device.deviceId)
        }
        return map
    }

    /// `messages` body of a plain `PUT /sendToDevice`: the same content for every device.
    static func plainMessages(_ recipients: [String: [String]], content: [String: Any]) -> [String: Any] {
        var messages: [String: Any] = [:]
        for (user, devices) in recipients where !devices.isEmpty {
            var perDevice: [String: Any] = [:]
            for device in devices { perDevice[device] = content }
            messages[user] = perDevice
        }
        return messages
    }

    static func deviceCount(_ recipients: [String: [String]]) -> Int {
        recipients.values.reduce(0) { $0 + $1.count }
    }
}

// MARK: - SponsorBlock (sponsorBlock.ts)

struct WatchSkipSegment: Equatable {
    let start: Double
    let end: Double
    let category: String
    let uuid: String
}

enum WatchSponsorBlock {
    static let api = "https://sponsor.ajay.app"
    static let categories = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic", "filler"]
    static let defaultCategories = ["sponsor", "selfpromo", "interaction"]
    static let labels: [String: String] = [
        "sponsor": "Sponsor",
        "selfpromo": "Self promotion",
        "interaction": "Interaction reminder (subscribe, like)",
        "intro": "Intro animation",
        "outro": "Endcards and credits",
        "preview": "Preview and recap",
        "music_offtopic": "Non-music part in music videos",
        "filler": "Filler tangent",
    ]

    static func isCategory(_ value: String) -> Bool { categories.contains(value) }

    #if canImport(CryptoKit)
    /// First 4 hex characters of sha256(videoId).
    static func hashPrefix(_ videoId: String) -> String {
        let digest = SHA256.hash(data: Data(videoId.utf8))
        return digest.prefix(2).map { String(format: "%02x", $0) }.joined()
    }
    #endif

    /// The hash-prefix query; nil when there is nothing to ask for.
    static func requestURL(prefix: String, categories chosen: [String]) -> URL? {
        let valid = chosen.filter(isCategory)
        let categoriesJSON = "[" + valid.map { "\"\($0)\"" }.joined(separator: ",") + "]"
        let query = "categories=\(WatchYouTube.formEncode(categoriesJSON))&actionTypes=\(WatchYouTube.formEncode("[\"skip\"]"))"
        return URL(string: "\(api)/api/skipSegments/\(prefix)?\(query)")
    }

    private static func numberText(_ value: Double) -> String {
        if value.rounded() == value, abs(value) < 1e15 { return String(Int64(value)) }
        return String(value)
    }

    /// Picks the skippable segments of one video out of a hash-prefix answer.
    static func selectSegments(_ body: Any?, videoId: String, categories chosen: [String]) -> [WatchSkipSegment] {
        guard let list = body as? [Any] else { return [] }
        let entry = list.first { ($0 as? [String: Any])?["videoID"] as? String == videoId } as? [String: Any]
        guard let raw = entry?["segments"] as? [Any] else { return [] }
        var segments: [(Int, WatchSkipSegment)] = []
        for (index, item) in raw.prefix(200).enumerated() {
            guard let s = item as? [String: Any] else { continue }
            guard let category = s["category"] as? String, isCategory(category), chosen.contains(category) else { continue }
            if let action = s["actionType"], (action as? String) != "skip" { continue }
            guard let pair = s["segment"] as? [Any], pair.count == 2,
                  let start = watchNumber(pair[0]), let end = watchNumber(pair[1]) else { continue }
            if start < 0 || end > WatchYouTube.maxStart || end - start < 1 { continue }
            let uuid = (s["UUID"] as? String).map { String($0.prefix(128)) } ?? "\(numberText(start))-\(numberText(end))"
            segments.append((index, WatchSkipSegment(start: start, end: end, category: category, uuid: uuid)))
        }
        return segments.sorted { a, b in a.1.start != b.1.start ? a.1.start < b.1.start : a.0 < b.0 }.map(\.1)
    }

    /// Stop skipping this close to the end of a segment (already past it, practically).
    static let endMargin = 0.5

    /// The segment to skip at `position`, unless it was skipped already. A segment counts again
    /// once the position is before its start (someone seeked back).
    static func segmentToSkip(_ segments: [WatchSkipSegment], position: Double, skipped: inout Set<String>) -> WatchSkipSegment? {
        for s in segments where position < s.start - 1 { skipped.remove(s.uuid) }
        let done = skipped
        return segments.first { position >= $0.start && position < $0.end - endMargin && !done.contains($0.uuid) }
    }
}

// MARK: - Keeping the local player on the shared state (controller.ts)

/// What the player reports, read at `at` (ms).
struct WatchPlayerSample: Equatable {
    var position: Double
    var state: Int
    var rate: Double
    var duration: Double?
    var at: Double
}

enum WatchPlayerCommand: Equatable {
    case play
    case pause
    case seek(Double)
    case rate(Double)
}

struct WatchTickResult: Equatable {
    var commands: [WatchPlayerCommand] = []
    /// a change the local user made (to send to everybody)
    var change: WatchPatch?
    /// set when the change is a SponsorBlock skip
    var skipped: WatchSkipSegment?
}

/// Keeps the local player on the shared state and turns what the user does in the player into
/// changes for everybody. Pure logic (no player, no timers).
final class WatchController {
    private var shared: SharedWatch?
    private var suppressUntil: Double = 0
    private var lastSample: WatchPlayerSample?
    private var lastPlayCommand = -Double.infinity
    /// the player matched the shared state at the last quiet tick (only then a jump is the user)
    private var synced = false
    private let driftLimit: Double
    private let suppressMs: Double
    private let playRetryMs: Double
    private(set) var skipped = Set<String>()

    init(driftLimit: Double = 1.5, suppressMs: Double = 1200, playRetryMs: Double = 2500) {
        self.driftLimit = driftLimit
        self.suppressMs = suppressMs
        self.playRetryMs = playRetryMs
    }

    private static func isRunning(_ state: Int) -> Bool {
        state == WatchPlayerState.playing || state == WatchPlayerState.buffering
    }

    func setShared(_ next: SharedWatch?) {
        if next?.session != shared?.session {
            skipped.removeAll()
            lastSample = nil
            synced = false
        }
        shared = next
    }

    func isSuppressed(_ now: Double) -> Bool { now < suppressUntil }

    private func commanded(_ now: Double) {
        suppressUntil = now + suppressMs
        lastSample = nil
        synced = false
    }

    /// The player changed its state. Returns a change for everybody when the user pressed play or
    /// pause in the player; our own commands (and their echo) are ignored.
    func onPlayerState(_ state: Int, position: Double, now: Double) -> WatchPatch? {
        guard let shared, shared.state != .stopped, !isSuppressed(now) else { return nil }
        if state == WatchPlayerState.playing && shared.state == .paused {
            return WatchPatch(state: .playing, position: position)
        }
        if state == WatchPlayerState.paused && shared.state == .playing {
            return WatchPatch(state: .paused, position: position)
        }
        return nil
    }

    /// The user changed the speed in the player.
    func onPlayerRate(_ rate: Double, now: Double) -> WatchPatch? {
        guard let shared, shared.state != .stopped, !isSuppressed(now) else { return nil }
        if rate < WatchProtocol.minRate || rate > WatchProtocol.maxRate || abs(rate - shared.rate) < 0.01 { return nil }
        return WatchPatch(rate: rate)
    }

    /// Called regularly with what the player reports: notices seeks of the user, skips SponsorBlock
    /// segments and brings the player back to the shared state (play / pause / seek / speed).
    func tick(_ sample: WatchPlayerSample, now: Double, segments: [WatchSkipSegment] = []) -> WatchTickResult {
        guard let shared, shared.state != .stopped else { return WatchTickResult() }
        let suppressed = isSuppressed(now)
        let last = lastSample
        lastSample = sample
        let loaded = sample.state != WatchPlayerState.unstarted && sample.state != WatchPlayerState.cued

        // 1. a jump in the player's own timeline that we did not cause: the user seeked (only once
        //    the player was in sync, so jumps while it starts up or loads are not taken for seeks)
        if !suppressed && synced && loaded, let last {
            let elapsed = max(0, sample.at - last.at) / 1000
            let moved = sample.position - last.position
            let allowed = Self.isRunning(last.state) ? elapsed * max(last.rate, shared.rate) : 0
            if moved < -driftLimit || moved > allowed + driftLimit {
                return WatchTickResult(commands: [], change: WatchPatch(position: sample.position))
            }
        }

        // 2. SponsorBlock: skipping is a seek for everybody
        if !suppressed && shared.state == .playing && sample.state == WatchPlayerState.playing {
            if let segment = WatchSponsorBlock.segmentToSkip(segments, position: sample.position, skipped: &skipped) {
                skipped.insert(segment.uuid)
                commanded(now)
                return WatchTickResult(commands: [.seek(segment.end)], change: WatchPatch(position: segment.end), skipped: segment)
            }
        }

        // 3. follow the shared state
        var commands: [WatchPlayerCommand] = []
        var expected = WatchProtocol.expectedPosition(shared, now: now)
        var atEnd = false
        if let duration = sample.duration, duration > 0 {
            atEnd = expected >= duration - driftLimit
            expected = min(expected, duration)
        }
        let ended = sample.state == WatchPlayerState.ended
        if !(ended && atEnd) && abs(sample.position - expected) > driftLimit {
            commands.append(.seek(expected))
        }
        if shared.state == .playing && !Self.isRunning(sample.state) && !(ended && atEnd) {
            if now - lastPlayCommand >= playRetryMs {
                commands.append(.play)
                lastPlayCommand = now
            }
        } else if shared.state == .paused && Self.isRunning(sample.state) {
            commands.append(.pause)
        }
        if loaded && abs(sample.rate - shared.rate) >= 0.01 {
            commands.append(.rate(shared.rate))
        }
        if !commands.isEmpty {
            commanded(now)
        } else if !suppressed && loaded {
            synced = true
        }
        return WatchTickResult(commands: commands)
    }
}

// MARK: - Preferences (state/watchTogether.ts), stored like the desktop's localStorage entry

struct WatchPrefs: Equatable {
    var enabled = true
    var categories: [String] = WatchSponsorBlock.defaultCategories
    /// 0...100, your own volume of the player
    var volume = 80
    var muted = false
    /// asked of YouTube; it may pick another quality
    var quality = "auto"

    static let storageKey = "diddyWatchTogether"

    static func decode(_ data: Data?) -> WatchPrefs {
        var prefs = WatchPrefs()
        guard let data, let s = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return prefs }
        if let enabled = s["enabled"] as? NSNumber, CFGetTypeID(enabled) == CFBooleanGetTypeID() { prefs.enabled = enabled.boolValue }
        if let list = s["categories"] as? [Any] {
            var seen: [String] = []
            for case let c as String in list where WatchSponsorBlock.isCategory(c) && !seen.contains(c) { seen.append(c) }
            prefs.categories = seen
        }
        if let volume = watchNumber(s["volume"]) { prefs.volume = Int(min(100, max(0, volume.rounded()))) }
        if let muted = s["muted"] as? NSNumber, CFGetTypeID(muted) == CFBooleanGetTypeID() { prefs.muted = muted.boolValue }
        if let quality = s["quality"] as? String, WatchYouTube.qualityChoices.contains(quality) { prefs.quality = quality }
        return prefs
    }

    func encode() -> Data? {
        let object: [String: Any] = [
            "enabled": enabled, "categories": categories, "volume": volume, "muted": muted, "quality": quality,
        ]
        guard JSONSerialization.isValidJSONObject(object) else { return nil }
        return try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }
}
