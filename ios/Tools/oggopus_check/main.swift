import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String) {
    if !condition { failures += 1; print("FAIL: \(message)") }
}
func rejects(_ message: String, _ body: () throws -> Void) {
    do { try body(); check(false, message) } catch {}
}
func le(_ value: UInt64, _ count: Int) -> [UInt8] {
    (0..<count).map { UInt8(truncatingIfNeeded: value >> (8 * $0)) }
}
let head = Array("OpusHead".utf8) + [1, 1] + le(312, 2) + le(48_000, 4) + [0, 0, 0]
let tags = Array("OpusTags".utf8) + le(1, 4) + [65] + le(0, 4)
let packet: [UInt8] = [0xF8, 0xFF, 0xFE] // 20 ms CELT silence
func page(_ sequence: UInt64, _ flags: UInt8, _ granule: UInt64, _ lacing: [UInt8], _ body: [UInt8]) -> [UInt8] {
    var out = Array("OggS".utf8) + [0, flags] + le(granule, 8) + le(1, 4) + le(sequence, 4)
    out += [0, 0, 0, 0, UInt8(lacing.count)] + lacing + body
    out.replaceSubrange(22..<26, with: le(UInt64(OggCRC.checksum(out)), 4))
    return out
}
let headers = page(0, 2, 0, [19], head) + page(1, 0, 0, [UInt8(tags.count)], tags)
let file = headers + page(2, 4, 900, [3], packet)
check(OggCRC.checksum(Array("123456789".utf8)) == 0x89A1897F, "independent CRC check vector")
do {
    let stream = try OpusContainer.parse(file)
    check(stream.header.preSkip == 312 && stream.header.channels == 1, "OpusHead")
    check(stream.tags?.vendor == "A", "OpusTags vendor")
    check(stream.packets == [packet] && stream.sampleCounts == [960], "packet extraction")
    check(stream.playableSamples == 588, "pre-skip and EOS trimming")
    var broken = file; broken[broken.count - 1] ^= 1
    rejects("CRC corruption rejected") { _ = try OpusContainer.parse(broken) }
    rejects("truncation rejected") { _ = try OpusContainer.parse(Array(file.dropLast())) }
    rejects("page sequence gap") { _ = try OpusContainer.parse(headers + page(3, 4, 900, [3], packet)) }
    rejects("unexpected continuation") { _ = try OpusContainer.parse(headers + page(2, 5, 900, [3], packet)) }
    let long = [UInt8(0xF8)] + Array(repeating: UInt8(0), count: 299)
    let spanning = headers + page(2, 0, UInt64.max, [255], Array(long.prefix(255)))
        + page(3, 5, 960, [45], Array(long.suffix(45)))
    check(try OpusContainer.parse(spanning).packets == [long], "packet spanning pages")
    let exact = headers + page(2, 0, UInt64.max, [255], Array(long.prefix(255)))
        + page(3, 5, 960, [0], [])
    check(try OpusContainer.parse(exact).packets[0].count == 255, "zero terminator after 255-byte packet")
    var limits = OpusLimits.standard; limits.maxInputBytes = 20
    rejects("input limit") { _ = try OpusContainer.parse(file, limits: limits) }
    limits = .standard; limits.maxPacketBytes = 2
    rejects("packet limit") { _ = try OpusContainer.parse(file, limits: limits) }
    limits = .standard; limits.maxPackets = 0
    rejects("packet count limit") { _ = try OpusContainer.parse(file, limits: limits) }
} catch { check(false, "Ogg fixtures: \(error)") }
check(OpusPacket.sampleCount([0x80]) == 120, "2.5 ms packet")
check(OpusPacket.sampleCount([0xFB, 0]) == nil, "zero frame count")
check(OpusPacket.sampleCount([0xFB, 63]) == nil, "duration limit")
check(OpusPacket.sampleCount([]) == nil, "empty packet")
var surround = head; surround[18] = 1
rejects("explicit channel map rejected") { _ = try OpusHeader.parse(surround) }
let cookie = Array(OpusDecoderCookie.make(channels: 1, samples: 960, toc: 0xF8))
check(cookie.count == 28 && Array(cookie[8..<12]) == [0, 0, 3, 192], "Core Audio cookie samples and endian")

func element(_ id: [UInt8], _ body: [UInt8]) -> [UInt8] {
    precondition(body.count < 127)
    return id + [0x80 | UInt8(body.count)] + body
}
let track = element([0xAE], element([0xD7], [1]) + element([0x86], Array("A_OPUS".utf8)) + element([0x63, 0xA2], head))
let tracks = element([0x16, 0x54, 0xAE, 0x6B], track)
let block = element([0xA3], [0x81, 0, 0, 0x80] + packet)
let webm = element([0x1A, 0x45, 0xDF, 0xA3], []) + [0x18, 0x53, 0x80, 0x67, 0xFF]
    + tracks + element([0x1F, 0x43, 0xB6, 0x75], block)
do {
    let stream = try OpusContainer.parse(webm)
    check(stream.packets == [packet] && stream.playableSamples == 648, "live WebM SimpleBlock")
    let group = element([0xA0], element([0xA1], [0x81, 0, 0, 0] + packet)
        + element([0x75, 0xA2], [0x0F, 0x42, 0x40])) // 1ms padding
    let grouped = Array(webm.prefix(webm.count - block.count - 5)) + element([0x1F, 0x43, 0xB6, 0x75], group)
    check(try OpusContainer.parse(grouped).playableSamples == 600, "WebM BlockGroup discard padding")
    let laced = Array(webm.dropLast(block.count + 5)) + element([0x1F, 0x43, 0xB6, 0x75], element([0xA3], [0x81, 0, 0, 0x82] + packet))
    rejects("WebM lacing fails clearly") { _ = try OpusContainer.parse(laced) }
} catch { check(false, "WebM fixtures: \(error)") }
// Fixed-seed malformed bytes exercise bounds without depending on random test input.
var seed: UInt64 = 17
for size in 0..<256 {
    var junk: [UInt8] = []
    for _ in 0..<size {
        seed = seed &* 6364136223846793005 &+ 1
        junk.append(UInt8(truncatingIfNeeded: seed >> 32))
    }
    for magic in [Array("OggS".utf8), [0x1A, 0x45, 0xDF, 0xA3]] {
        _ = try? OpusContainer.parse(magic + junk)
    }
}
let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("opus-check-\(UUID().uuidString).caf")
defer { try? FileManager.default.removeItem(at: temporary) }
do {
    let writer = try OpusCAFWriter(url: temporary, channels: 2, sampleRate: 48_000, maxDataBytes: 16)
    let sink = OpusPCMSink(writer: writer, preSkip: 1, playableFrames: 2, gain: 2)
    try sink.append(planar: [[0, 1, -1, 0], [0, 0.25, -0.25, 0]])
    check(sink.isFull && sink.writtenFrames == 2, "PCM trim and stereo frames")
    try writer.finish()
    let bytes = Array(try Data(contentsOf: temporary))
    check(bytes.count == 76 && Array(bytes.prefix(4)) == Array("caff".utf8), "CAF header and length")
    check(Array(bytes.suffix(8)) == [255, 127, 0, 64, 1, 128, 0, 192], "gain clipping and interleaving")
    if let output = ProcessInfo.processInfo.environment["OPUS_CHECK_CAF_OUTPUT"] {
        try Data(bytes).write(to: URL(fileURLWithPath: output))
    }
    let capped = try OpusCAFWriter(url: temporary, channels: 1, sampleRate: 48_000, maxDataBytes: 1)
    rejects("PCM byte limit") { try capped.append(interleaved: [1]) }
    capped.abandon()
} catch { check(false, "PCM fixtures: \(error)") }
// Optional real encoder fixtures, generated without user media.
for path in CommandLine.arguments.dropFirst() {
    do {
        let stream = try OpusContainer.parse(Array(Data(contentsOf: URL(fileURLWithPath: path))))
        check(stream.playableSamples > 0, "real fixture \(path)")
        print("\(path): \(stream.packets.count) packets, \(stream.duration)s")
    } catch { check(false, "real fixture \(path): \(error)") }
}
if failures > 0 { print("\(failures) failures"); exit(1) }
print("Opus container and CAF checks passed")
