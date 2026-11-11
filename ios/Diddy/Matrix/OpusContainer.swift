import Foundation

// Reads the Opus packets out of an Ogg (`audio/ogg`, RFC 3533 / RFC 7845) or WebM (`audio/webm`,
// Matroska) file. Foundation only, so it also builds and is checked on Linux
// (`Tools/oggopus_check/main.swift`). The packets are decoded in `OpusTranscoder.swift`.
//
// Desktop voice messages are recorded with the browser's MediaRecorder (see
// `cinny/src/app/plugins/voiceMessage.ts`, RECORDER_MIMES, in this order of preference):
//   audio/ogg;codecs=opus   where MediaRecorder supports it           -> Ogg/Opus
//   audio/webm;codecs=opus  Chromium / Electron fallback              -> WebM/Opus
//   audio/mp4               Safari / WKWebView (macOS app)               -> AAC, iOS plays it itself
// Element Android and other clients also send Ogg/Opus. Everything in here treats the file as
// hostile: sizes are bounded, offsets are checked before they are used, nothing traps.

/// Why a voice file could not be turned into something iOS plays.
enum OpusContainerError: Error, Equatable {
    /// Neither Ogg nor WebM, or no Opus stream in it (Vorbis, FLAC, video only ...).
    case notOpus
    /// A valid file with something this code does not handle (surround sound, laced WebM blocks ...).
    case unsupported(String)
    case corrupt(String)
    case tooLarge
    case empty

    var userMessage: String {
        switch self {
        case .notOpus: return "This audio format is not supported on iOS."
        case .unsupported(let what): return "This audio uses \(what), which iOS cannot play."
        case .corrupt: return "This audio file is damaged and cannot be played."
        case .tooLarge: return "This audio is too long to play on iOS."
        case .empty: return "This audio file is empty."
        }
    }
}

/// Upper bounds against files built to exhaust memory or time.
struct OpusLimits {
    var maxInputBytes = 100 * 1024 * 1024
    /// 400 000 packets are more than two hours of the usual 20 ms packets.
    var maxPackets = 400_000
    /// The largest legal Opus packet is 48 frames of 1275 bytes = 61 200 bytes.
    var maxPacketBytes = 61_440
    /// Decoded 16-bit PCM that is written to disk.
    var maxPCMBytes = 256 * 1024 * 1024

    static let standard = OpusLimits()
}

// MARK: Little-endian reading

private enum LE {
    static func u16(_ b: [UInt8], _ at: Int) -> Int {
        let low = Int(b[at])
        let high = Int(b[at + 1]) << 8
        return low | high
    }

    static func u32(_ b: [UInt8], _ at: Int) -> UInt32 {
        var value: UInt32 = 0
        for i in 0..<4 { value |= UInt32(b[at + i]) << UInt32(8 * i) }
        return value
    }

    static func u64(_ b: [UInt8], _ at: Int) -> UInt64 {
        var value: UInt64 = 0
        for i in 0..<8 { value |= UInt64(b[at + i]) << UInt64(8 * i) }
        return value
    }
}

private let opusHeadMagic: [UInt8] = Array("OpusHead".utf8)
private let opusTagsMagic: [UInt8] = Array("OpusTags".utf8)

// MARK: Headers

/// The `OpusHead` identification header (RFC 7845 section 5.1).
struct OpusHeader: Equatable {
    let channels: Int
    /// Samples at 48 kHz the decoder produces before the audio starts.
    let preSkip: Int
    /// The rate of the original recording; informational only, decoding is always 48 kHz.
    let inputSampleRate: Int
    /// Q7.8 fixed point dB.
    let outputGainQ8: Int
    let mappingFamily: Int

    /// Linear factor for `outputGainQ8`.
    var outputGain: Float {
        outputGainQ8 == 0 ? 1 : Float(pow(10.0, Double(outputGainQ8) / (20.0 * 256.0)))
    }

    static func parse(_ b: [UInt8]) throws -> OpusHeader {
        guard b.starts(with: opusHeadMagic) else { throw OpusContainerError.notOpus }
        guard b.count >= 19 else { throw OpusContainerError.corrupt("short OpusHead") }
        guard b[8] > 0, b[8] >> 4 == 0 else { throw OpusContainerError.unsupported("a newer Opus version") }
        let channels = Int(b[9])
        guard channels >= 1 else { throw OpusContainerError.corrupt("no channels") }
        let preSkip = LE.u16(b, 10)
        let rate = Int(LE.u32(b, 12))
        let gain = Int(Int16(bitPattern: UInt16(truncatingIfNeeded: LE.u16(b, 16))))
        let family = Int(b[18])
        // Only mapping family 0 has an implicit mono/stereo channel layout.
        // Surround layouts (and the ambisonic and discrete families) are not supported.
        guard channels <= 2, family == 0 else {
            throw OpusContainerError.unsupported("surround sound")
        }
        return OpusHeader(channels: channels, preSkip: preSkip, inputSampleRate: rate, outputGainQ8: gain, mappingFamily: family)
    }
}

/// The `OpusTags` comment header. Nothing depends on it; it is only parsed (bounded) for completeness.
struct OpusTags: Equatable {
    let vendor: String
    let comments: [String]

    static func parse(_ b: [UInt8]) -> OpusTags? {
        guard b.starts(with: opusTagsMagic) else { return nil }
        var pos = 8
        func readString() -> String? {
            guard b.count - pos >= 4 else { return nil }
            let length = Int(LE.u32(b, pos))
            pos += 4
            guard length <= b.count - pos else { return nil }
            let text = String(decoding: b[pos..<(pos + length)], as: UTF8.self)
            pos += length
            return text
        }
        guard let vendor = readString() else { return nil }
        guard b.count - pos >= 4 else { return nil }
        let count = Int(LE.u32(b, pos))
        pos += 4
        var comments: [String] = []
        guard count <= (b.count - pos) / 4 else { return nil }
        for index in 0..<count {
            guard let comment = readString() else { return nil }
            if index < 1024 { comments.append(comment) }
        }
        return OpusTags(vendor: vendor, comments: comments)
    }
}

// MARK: Packets

enum OpusPacket {
    /// Longest packet the format allows: 120 ms at 48 kHz.
    static let maxSamples = 5760

    /// How many 48 kHz samples a packet decodes to, from its TOC byte (RFC 6716 section 3.1).
    /// Nil for an empty or malformed packet.
    static func sampleCount(_ packet: [UInt8]) -> Int? {
        guard let toc = packet.first else { return nil }
        let config = Int(toc >> 3)
        let perFrame: Int
        switch config {
        case 0...11: perFrame = [480, 960, 1920, 2880][config % 4]      // SILK: 10, 20, 40, 60 ms
        case 12...15: perFrame = [480, 960][config % 2]                 // hybrid: 10, 20 ms
        default: perFrame = [120, 240, 480, 960][config % 4]            // CELT: 2.5, 5, 10, 20 ms
        }
        let frames: Int
        switch toc & 0x03 {
        case 0: frames = 1
        case 1, 2: frames = 2
        default:
            guard packet.count >= 2 else { return nil }
            frames = Int(packet[1] & 0x3F)
            guard frames >= 1 else { return nil }
        }
        let total = perFrame * frames
        return total <= maxSamples ? total : nil
    }
}

/// Everything the decoder needs.
struct OpusStream {
    let header: OpusHeader
    let tags: OpusTags?
    let packets: [[UInt8]]
    /// Samples (48 kHz) per packet, same order as `packets`.
    let sampleCounts: [Int]
    /// Audio length from the last Ogg granule position (minus pre-skip); nil for WebM, or when
    /// the stream gave no usable one.
    let declaredSamples: Int?

    var totalSamples: Int { sampleCounts.reduce(0, +) }

    /// Samples to keep after dropping the pre-skip and the padding of the last packet.
    var playableSamples: Int {
        var samples = totalSamples - header.preSkip
        if let declared = declaredSamples { samples = min(samples, declared) }
        return max(samples, 0)
    }

    var duration: TimeInterval { Double(playableSamples) / 48_000 }


}

// MARK: Ogg

/// The Ogg page checksum: CRC-32 with polynomial 0x04C11DB7, initial value 0, no reflection and
/// no final xor. (Check value for "123456789": 0x89A1897F.)
enum OggCRC {
    static let table: [UInt32] = (0..<256).map { (i: Int) -> UInt32 in
        var r = UInt32(i) << 24
        for _ in 0..<8 {
            r = (r & 0x8000_0000) != 0 ? (r << 1) ^ 0x04C1_1DB7 : r << 1
        }
        return r
    }

    static func checksum(_ bytes: [UInt8]) -> UInt32 {
        checksum(bytes, from: 0, count: bytes.count, zeroing: nil)
    }

    /// `count` bytes from `start`; the offsets in `zeroing` (relative to `start`) are read as 0.
    /// An Ogg page is checked with its own checksum field (offsets 22..<26) zeroed.
    static func checksum(_ bytes: [UInt8], from start: Int, count: Int, zeroing: Range<Int>?) -> UInt32 {
        var crc: UInt32 = 0
        for i in 0..<count {
            var byte = bytes[start + i]
            if let zeroing = zeroing, zeroing.contains(i) { byte = 0 }
            crc = (crc << 8) ^ table[Int((crc >> 24) ^ UInt32(byte))]
        }
        return crc
    }
}

enum OggOpusDemuxer {
    static func looksLikeOgg(_ b: [UInt8]) -> Bool { b.starts(with: [0x4F, 0x67, 0x67, 0x53]) }

    /// Headers (OpusTags can carry cover art) may be bigger than an audio packet.
    private static let maxHeaderPacketBytes = 1024 * 1024

    static func parse(_ bytes: [UInt8], limits: OpusLimits = .standard) throws -> OpusStream {
        guard looksLikeOgg(bytes) else { throw OpusContainerError.notOpus }
        guard bytes.count <= limits.maxInputBytes else { throw OpusContainerError.tooLarge }

        var pos = 0
        var serial: UInt32?
        var nextSequence: UInt32?
        var stage = 0   // 0: waiting for OpusHead, 1: for OpusTags, 2: audio
        var parsedHeader: OpusHeader?
        var parsedTags: OpusTags?
        var packets: [[UInt8]] = []
        var counts: [Int] = []
        var pending: [UInt8] = []
        var hasPending = false
        var lastGranule: Int64 = -1
        var finished = false

        func complete(_ packet: [UInt8]) throws {
            switch stage {
            case 0:
                parsedHeader = try OpusHeader.parse(packet)
                stage = 1
            case 1:
                guard packet.starts(with: opusTagsMagic) else { throw OpusContainerError.corrupt("missing OpusTags") }
                guard let tags = OpusTags.parse(packet) else { throw OpusContainerError.corrupt("bad OpusTags") }
                parsedTags = tags
                stage = 2
            default:
                guard let samples = OpusPacket.sampleCount(packet) else { throw OpusContainerError.corrupt("bad Opus packet") }
                guard packets.count < limits.maxPackets else { throw OpusContainerError.tooLarge }
                packets.append(packet)
                counts.append(samples)
            }
        }

        while pos < bytes.count && !finished {
            // Reject truncation rather than silently caching a partial voice message.
            guard bytes.count - pos >= 27 else { throw OpusContainerError.corrupt("short page") }
            guard bytes[pos] == 0x4F, bytes[pos + 1] == 0x67, bytes[pos + 2] == 0x67, bytes[pos + 3] == 0x53 else {
                throw OpusContainerError.corrupt("lost page sync")
            }
            guard bytes[pos + 4] == 0 else { throw OpusContainerError.unsupported("an unknown Ogg version") }
            let flags = bytes[pos + 5]
            let granule = Int64(bitPattern: LE.u64(bytes, pos + 6))
            let pageSerial = LE.u32(bytes, pos + 14)
            let sequence = LE.u32(bytes, pos + 18)
            let storedCRC = LE.u32(bytes, pos + 22)
            let segmentCount = Int(bytes[pos + 26])
            let headerLength = 27 + segmentCount
            guard bytes.count - pos >= headerLength else { throw OpusContainerError.corrupt("short lacing table") }
            var bodyLength = 0
            for i in 0..<segmentCount { bodyLength += Int(bytes[pos + 27 + i]) }
            let pageLength = headerLength + bodyLength
            // A page that is cut off cannot pass CRC validation.
            guard bytes.count - pos >= pageLength else { throw OpusContainerError.corrupt("short page body") }
            let bodyStart = pos + headerLength

            // The first stream that opens with OpusHead is the one that is played; pages of other
            // logical streams (multiplexed files) are skipped.
            if serial == nil {
                let opensWithOpusHead = flags & 0x02 != 0 && bodyLength >= 8
                    && Array(bytes[bodyStart..<(bodyStart + 8)]) == opusHeadMagic
                if opensWithOpusHead {
                    serial = pageSerial
                } else {
                    pos += pageLength
                    continue
                }
            }
            guard serial == pageSerial else {
                pos += pageLength
                continue
            }
            // A second BOS page of the same stream starts a chained file: only the first part plays.
            if flags & 0x02 != 0 && nextSequence != nil { break }

            let computed = OggCRC.checksum(bytes, from: pos, count: pageLength, zeroing: 22..<26)
            guard computed == storedCRC else { throw OpusContainerError.corrupt("page checksum") }
            if let expected = nextSequence, expected != sequence {
                throw OpusContainerError.corrupt("missing page")
            }
            nextSequence = sequence &+ 1

            let continued = flags & 0x01 != 0
            guard continued == hasPending else { throw OpusContainerError.corrupt("broken packet continuation") }

            var offset = bodyStart
            for i in 0..<segmentCount {
                let length = Int(bytes[pos + 27 + i])
                pending.append(contentsOf: bytes[offset..<(offset + length)])
                offset += length
                hasPending = true
                let cap = stage < 2 ? maxHeaderPacketBytes : limits.maxPacketBytes
                guard pending.count <= cap else { throw OpusContainerError.corrupt("packet too large") }
                if length < 255 {
                    let packet = pending
                    pending = []
                    hasPending = false
                    try complete(packet)
                }
            }
            if granule >= 0 {
                guard lastGranule <= granule else { throw OpusContainerError.corrupt("backward granule") }
                lastGranule = granule
            }
            if flags & 0x04 != 0 { finished = true }
            pos += pageLength
        }

        guard let header = parsedHeader else { throw OpusContainerError.notOpus }
        guard stage >= 2 else { throw OpusContainerError.corrupt("missing OpusTags") }
        guard !hasPending else { throw OpusContainerError.corrupt("unfinished packet") }
        guard !packets.isEmpty else { throw OpusContainerError.empty }
        var declared: Int?
        if lastGranule >= Int64(header.preSkip) {
            declared = Int(min(lastGranule, Int64(1) << 40)) - header.preSkip
        }
        return OpusStream(header: header, tags: parsedTags, packets: packets, sampleCounts: counts, declaredSamples: declared)
    }
}

// MARK: WebM

/// Reads Opus out of a Matroska/WebM file, the way Chromium's MediaRecorder writes it: the
/// Segment and the Clusters may have an unknown size (live recording), blocks are SimpleBlocks
/// or Blocks in a BlockGroup, one frame per block. The file is scanned flat: the master elements
/// that matter are entered (their size is not needed), everything else is skipped by its size.
enum WebMOpusDemuxer {
    static func looksLikeWebM(_ b: [UInt8]) -> Bool { b.starts(with: [0x1A, 0x45, 0xDF, 0xA3]) }

    private struct Track {
        var number = -1
        var codecID = ""
        var codecPrivate: [UInt8] = []
        var codecDelayNs = 0
        var channels = 1
        var isOpus: Bool { codecID == "A_OPUS" }
    }

    // Segment, Tracks, TrackEntry, Audio, Cluster, BlockGroup
    private static let enterIDs: Set<Int> = [0x1853_8067, 0x1654_AE6B, 0xAE, 0xE1, 0x1F43_B675, 0xA0]

    private static func readID(_ b: [UInt8], _ pos: Int) -> (id: Int, length: Int)? {
        guard pos < b.count else { return nil }
        let first = b[pos]
        let length = first.leadingZeroBitCount + 1
        guard length <= 4, pos + length <= b.count else { return nil }
        var value = Int(first)
        for i in 1..<length { value = (value << 8) | Int(b[pos + i]) }
        return (value, length)
    }

    /// An EBML variable-length integer with its marker bit removed; `unknown` when all value bits are 1.
    private static func readSize(_ b: [UInt8], _ pos: Int) -> (value: Int, length: Int, unknown: Bool)? {
        guard pos < b.count else { return nil }
        let first = b[pos]
        let length = first.leadingZeroBitCount + 1
        guard length <= 8, pos + length <= b.count else { return nil }
        var value = Int(first) & ((1 << (8 - length)) - 1)
        for i in 1..<length { value = (value << 8) | Int(b[pos + i]) }
        return (value, length, value == (1 << (7 * length)) - 1)
    }

    private static func unsigned(_ b: [UInt8], _ from: Int, _ to: Int) -> Int {
        var value = 0
        for i in from..<min(to, from + 7) { value = (value << 8) | Int(b[i]) }
        return value
    }

    static func parse(_ bytes: [UInt8], limits: OpusLimits = .standard) throws -> OpusStream {
        guard looksLikeWebM(bytes) else { throw OpusContainerError.notOpus }
        guard bytes.count <= limits.maxInputBytes else { throw OpusContainerError.tooLarge }

        var tracks: [Track] = []
        var frames: [[UInt8]] = []
        var pos = 0
        var ends: [Int] = []
        var discardSamples = 0
        while pos < bytes.count {
            while let end = ends.last, pos == end { ends.removeLast() }
            let parentEnd = ends.last ?? bytes.count
            guard let element = readID(bytes, pos), let size = readSize(bytes, pos + element.length) else { break }
            let dataStart = pos + element.length + size.length
            guard dataStart <= parentEnd else { throw OpusContainerError.corrupt("element header bounds") }
            if enterIDs.contains(element.id) {
                guard size.unknown || size.value <= parentEnd - dataStart else {
                    throw OpusContainerError.corrupt("master element bounds")
                }
                guard ends.count < 16 else { throw OpusContainerError.tooLarge }
                if !size.unknown { ends.append(dataStart + size.value) }
                if element.id == 0xAE {
                    guard tracks.count < 64 else { throw OpusContainerError.tooLarge }
                    tracks.append(Track())
                }
                pos = dataStart
                continue
            }
            guard !size.unknown else { throw OpusContainerError.corrupt("unknown-size element") }
            // A cut-off last element: everything before it is kept.
            guard size.value <= parentEnd - dataStart else { throw OpusContainerError.corrupt("element bounds") }
            let end = dataStart + size.value

            switch element.id {
            case 0x75A2: // DiscardPadding, signed nanoseconds (positive = trim end).
                if size.value > 0, size.value <= 8, bytes[dataStart] & 0x80 == 0 {
                    var ns: UInt64 = 0
                    for i in dataStart..<end { ns = (ns << 8) | UInt64(bytes[i]) }
                    discardSamples = Int(min(ns, 1_000_000_000) * 48 / 1_000_000)
                }
            case 0xD7:   // TrackNumber
                if !tracks.isEmpty { tracks[tracks.count - 1].number = unsigned(bytes, dataStart, end) }
            case 0x86:   // CodecID
                if !tracks.isEmpty { tracks[tracks.count - 1].codecID = String(decoding: bytes[dataStart..<end], as: UTF8.self) }
            case 0x63A2: // CodecPrivate
                if !tracks.isEmpty && size.value <= 4096 { tracks[tracks.count - 1].codecPrivate = Array(bytes[dataStart..<end]) }
            case 0x56AA: // CodecDelay (ns)
                if !tracks.isEmpty { tracks[tracks.count - 1].codecDelayNs = unsigned(bytes, dataStart, end) }
            case 0x9F:   // Channels
                if !tracks.isEmpty { tracks[tracks.count - 1].channels = unsigned(bytes, dataStart, end) }
            case 0xA3, 0xA1:   // SimpleBlock, Block
                guard let number = readSize(bytes, dataStart), dataStart + number.length + 3 <= end else { break }
                guard let opus = tracks.first(where: { $0.isOpus }), opus.number == number.value else { break }
                let flags = bytes[dataStart + number.length + 2]
                guard (flags >> 1) & 0x03 == 0 else { throw OpusContainerError.unsupported("laced WebM blocks") }
                let payloadStart = dataStart + number.length + 3
                guard frames.count < limits.maxPackets, end - payloadStart <= limits.maxPacketBytes else {
                    throw OpusContainerError.tooLarge
                }
                frames.append(Array(bytes[payloadStart..<end]))
            default:
                break
            }
            pos = end
        }

        guard let track = tracks.first(where: { $0.isOpus }) else { throw OpusContainerError.notOpus }
        let header: OpusHeader
        if track.codecPrivate.starts(with: opusHeadMagic) {
            header = try OpusHeader.parse(track.codecPrivate)
        } else {
            guard track.channels >= 1 && track.channels <= 2 else { throw OpusContainerError.unsupported("surround sound") }
            let delayNs = min(max(track.codecDelayNs, 0), 1_000_000_000)
            header = OpusHeader(channels: track.channels, preSkip: delayNs * 48 / 1_000_000,
                                inputSampleRate: 48_000, outputGainQ8: 0, mappingFamily: 0)
        }
        guard !frames.isEmpty else { throw OpusContainerError.empty }
        var counts: [Int] = []
        counts.reserveCapacity(frames.count)
        for frame in frames {
            guard let samples = OpusPacket.sampleCount(frame) else { throw OpusContainerError.corrupt("bad Opus packet") }
            counts.append(samples)
        }
        return OpusStream(header: header, tags: nil, packets: frames, sampleCounts: counts,
                          declaredSamples: max(0, counts.reduce(0, +) - header.preSkip - discardSamples))
    }
}

// MARK: Entry point

enum OpusContainer {
    enum Kind: Equatable { case ogg, webm }

    /// What the first bytes of a file say it is. Voice files are recognised by content, not by
    /// the mime type the sender put in the event.
    static func kind(ofPrefix prefix: [UInt8]) -> Kind? {
        if OggOpusDemuxer.looksLikeOgg(prefix) { return .ogg }
        if WebMOpusDemuxer.looksLikeWebM(prefix) { return .webm }
        return nil
    }

    static func parse(_ bytes: [UInt8], limits: OpusLimits = .standard) throws -> OpusStream {
        switch kind(ofPrefix: Array(bytes.prefix(4))) {
        case .ogg: return try OggOpusDemuxer.parse(bytes, limits: limits)
        case .webm: return try WebMOpusDemuxer.parse(bytes, limits: limits)
        case nil: throw OpusContainerError.notOpus
        }
    }
}

/// Core Audio's iOS 16 Opus cookie: seven big-endian 32-bit fields. The OpusHead gain and
/// pre-skip are applied by OpusPCMSink. Layout follows Apple's WebKit implementation:
/// Source/WebCore/platform/graphics/cocoa/WebMAudioUtilitiesCocoa.mm, CoreAudioOpusHeader.
enum OpusDecoderCookie {
    static func make(channels: Int, samples: Int, toc: UInt8) -> Data {
        let config = Int(toc >> 3)
        let bandwidth: UInt32
        switch config {
        case 0...3, 16...19: bandwidth = 1101
        case 4...7: bandwidth = 1102
        case 8...11, 20...23: bandwidth = 1103
        case 12...13, 24...27: bandwidth = 1104
        default: bandwidth = 1105
        }
        let fields: [UInt32] = [2049, 48_000, UInt32(samples), bandwidth, UInt32(channels), 1, 0]
        return Data(fields.flatMap { value in
            [UInt8(truncatingIfNeeded: value >> 24), UInt8(truncatingIfNeeded: value >> 16),
             UInt8(truncatingIfNeeded: value >> 8), UInt8(truncatingIfNeeded: value)]
        })
    }
}
