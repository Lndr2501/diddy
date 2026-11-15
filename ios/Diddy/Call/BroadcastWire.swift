import Foundation

/// How the broadcast extension (`DiddyBroadcast`, "Diddy" in the iOS screen broadcast picker)
/// hands the pictures of the whole screen to the app: a TCP connection on 127.0.0.1. An app group
/// would need the sideloader to set one up for both; a local connection works with any signing.
///
/// A message is `DDB1`, one byte kind, a 4-byte big-endian length and the payload. The extension
/// sends `hello`, then one JPEG per `frame`, the sound of other apps as `audio`, and `bye` when the
/// broadcast ends. The app answers with `config` (resolution, frame rate, quality, sound: Settings >
/// Calls > Screen Sharing), which the extension cannot read itself without an app group.
/// Foundation only: the app and the extension both compile it, Tools/broadcastwire_check tests it.
enum BroadcastWire {
    /// Port on 127.0.0.1 the app listens on while it waits for or receives a broadcast.
    static let port: UInt16 = 47_812
    static let magic: [UInt8] = Array("DDB1".utf8)
    static let headerSize = 9
    /// One frame of a phone screen as JPEG stays far below this; anything larger is a broken stream.
    static let maxPayload = 8 * 1024 * 1024

    enum Kind: UInt8 {
        case hello = 1
        case frame = 2
        case bye = 3
        case config = 4
        case audio = 5
    }

    /// How the extension records, chosen in the app.
    struct Config: Codable, Equatable {
        /// Longest side of a picture in pixels; 0 keeps the screen's own size.
        var maxPixels: Int
        var fps: Int
        /// JPEG quality between the extension and the app, 0.3 to 1.
        var quality: Double
        /// Also the sound of other apps.
        var audio: Bool

        static let standard = Config(maxPixels: 1920, fps: 30, quality: 0.75, audio: true)

        /// Values from the other side are kept within what the extension can handle (about 50 MB).
        var clamped: Config {
            Config(maxPixels: maxPixels <= 0 ? 0 : min(max(maxPixels, 480), 4096),
                   fps: min(max(fps, 5), 60),
                   quality: min(max(quality.isFinite ? quality : 0.75, 0.3), 1),
                   audio: audio)
        }

        /// Bits per second the call may use for the share: more pixels and frames need more.
        var maxBitrate: Int {
            let base: Int
            switch maxPixels {
            case 1...1280: base = 2_500_000
            case 1281...1920: base = 5_000_000
            case 1921...2560: base = 8_000_000
            default: base = 10_000_000 // the screen's own size
            }
            let factor = fps <= 15 ? 0.6 : (fps <= 30 ? 1.0 : 1.6)
            return Int(Double(base) * factor)
        }

        func encoded() -> Data { (try? JSONEncoder().encode(self)) ?? Data() }

        static func decode(_ data: Data) -> Config? {
            (try? JSONDecoder().decode(Config.self, from: data))?.clamped
        }
    }

    /// The PCM format of an `audio` message, as in `AudioStreamBasicDescription`, and how many
    /// frames follow. 40 bytes, big-endian, before the samples themselves.
    struct AudioHeader: Equatable {
        var sampleRate: Double
        var formatID: UInt32
        var formatFlags: UInt32
        var bytesPerPacket: UInt32
        var framesPerPacket: UInt32
        var bytesPerFrame: UInt32
        var channelsPerFrame: UInt32
        var bitsPerChannel: UInt32
        var frameCount: UInt32

        static let size = 40

        func encoded() -> Data {
            var data = Data()
            appendBigEndian(sampleRate.bitPattern, to: &data)
            for value in [formatID, formatFlags, bytesPerPacket, framesPerPacket, bytesPerFrame, channelsPerFrame, bitsPerChannel, frameCount] {
                appendBigEndian(value, to: &data)
            }
            return data
        }

        /// The header and the samples of an `audio` payload; nil when it is too short or the samples
        /// do not fill the frames it claims.
        static func decode(_ payload: Data) -> (AudioHeader, Data)? {
            guard payload.count >= size else { return nil }
            let bytes = [UInt8](payload.prefix(size))
            func u32(_ offset: Int) -> UInt32 { bytes[offset..<offset + 4].reduce(0) { ($0 << 8) | UInt32($1) } }
            let rate = bytes[0..<8].reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
            let header = AudioHeader(sampleRate: Double(bitPattern: rate), formatID: u32(8), formatFlags: u32(12),
                                     bytesPerPacket: u32(16), framesPerPacket: u32(20), bytesPerFrame: u32(24),
                                     channelsPerFrame: u32(28), bitsPerChannel: u32(32), frameCount: u32(36))
            let samples = payload.subdata(in: (payload.startIndex + size)..<payload.endIndex)
            guard header.sampleRate > 0, header.sampleRate <= 192_000, header.channelsPerFrame > 0, header.channelsPerFrame <= 8,
                  header.bytesPerFrame > 0, Int(header.bytesPerFrame) * Int(header.frameCount) <= samples.count else { return nil }
            return (header, samples)
        }

        private func appendBigEndian<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
            withUnsafeBytes(of: value.bigEndian) { data.append(contentsOf: $0) }
        }
    }

    struct Message: Equatable {
        let kind: Kind
        let payload: Data
    }

    static func encode(_ kind: Kind, _ payload: Data = Data()) -> Data {
        var data = Data(magic)
        data.append(kind.rawValue)
        let length = UInt32(payload.count)
        data.append(contentsOf: [UInt8(length >> 24 & 0xFF), UInt8(length >> 16 & 0xFF), UInt8(length >> 8 & 0xFF), UInt8(length & 0xFF)])
        data.append(payload)
        return data
    }

    /// Collects the bytes as they arrive (TCP cuts them anywhere) and hands out whole messages.
    /// A stream that does not follow the format sets `failed`; the connection is then dropped.
    struct Parser {
        private var buffer = Data()
        private(set) var failed = false

        mutating func push(_ bytes: Data) -> [Message] {
            guard !failed else { return [] }
            buffer.append(bytes)
            var messages: [Message] = []
            while buffer.count >= BroadcastWire.headerSize {
                let header = [UInt8](buffer.prefix(BroadcastWire.headerSize))
                guard Array(header[0..<4]) == BroadcastWire.magic, let kind = Kind(rawValue: header[4]) else {
                    fail()
                    return messages
                }
                let length = header[5..<9].reduce(0) { ($0 << 8) | Int($1) }
                guard length <= BroadcastWire.maxPayload else {
                    fail()
                    return messages
                }
                let total = BroadcastWire.headerSize + length
                guard buffer.count >= total else { break }
                let start = buffer.startIndex
                let payload = buffer.subdata(in: (start + BroadcastWire.headerSize)..<(start + total))
                buffer = buffer.subdata(in: (start + total)..<buffer.endIndex)
                messages.append(Message(kind: kind, payload: payload))
            }
            return messages
        }

        private mutating func fail() {
            failed = true
            buffer = Data()
        }
    }
}
