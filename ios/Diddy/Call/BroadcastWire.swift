import Foundation

/// How the broadcast extension (`DiddyBroadcast`, "Diddy" in the iOS screen broadcast picker)
/// hands the pictures of the whole screen to the app: a TCP connection on 127.0.0.1. An app group
/// would need the sideloader to set one up for both; a local connection works with any signing.
///
/// A message is `DDB1`, one byte kind, a 4-byte big-endian length and the payload. The extension
/// sends `hello`, then one JPEG per `frame`, and `bye` when the broadcast ends. Foundation only:
/// the app and the extension both compile it, Tools/broadcastwire_check tests it.
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
