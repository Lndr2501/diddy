// Checks for Diddy/Call/BroadcastWire.swift. Run from the ios folder:
//   swiftc Diddy/Call/BroadcastWire.swift Tools/broadcastwire_check/main.swift -o /tmp/broadcastwire_check && /tmp/broadcastwire_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
typealias W = BroadcastWire

let hello = W.encode(.hello, Data("{\"v\":1}".utf8))
check(hello.count == W.headerSize + 7, "header plus payload")
check([UInt8](hello.prefix(4)) == Array("DDB1".utf8), "magic first")
check(hello[4] == 1, "kind byte")
check([UInt8](hello[5..<9]) == [0, 0, 0, 7], "big-endian length")

// whole messages in one piece
var parser = W.Parser()
let frame = W.encode(.frame, Data(repeating: 0xAB, count: 70_000))
var messages = parser.push(hello + frame + W.encode(.bye))
check(messages.map(\.kind) == [.hello, .frame, .bye], "three messages: \(messages.map(\.kind))")
check(messages[1].payload.count == 70_000 && messages[1].payload.first == 0xAB, "frame payload kept")
check(messages[2].payload.isEmpty, "bye has no payload")

// cut anywhere, as TCP does
parser = W.Parser()
let stream = hello + frame
var collected: [W.Message] = []
var offset = 0
for size in [1, 3, 5, 2, 4096, 13, 100_000] where offset < stream.count {
    let end = min(stream.count, offset + size)
    collected += parser.push(stream.subdata(in: offset..<end))
    offset = end
}
check(collected.map(\.kind) == [.hello, .frame], "pieces: \(collected.map(\.kind))")
check(collected.last?.payload == Data(repeating: 0xAB, count: 70_000), "frame reassembled")
check(!parser.failed, "no failure")

// half a header waits
parser = W.Parser()
check(parser.push(hello.prefix(6)).isEmpty && !parser.failed, "half a header waits")

// broken streams
parser = W.Parser()
check(parser.push(Data("GET / HTTP/1.1\r\n".utf8)).isEmpty && parser.failed, "wrong magic fails")
check(parser.push(hello).isEmpty, "after a failure nothing more")
parser = W.Parser()
var huge = Data(W.magic)
huge.append(2)
huge.append(contentsOf: [0xFF, 0xFF, 0xFF, 0xFF])
check(parser.push(huge).isEmpty && parser.failed, "too large fails")
parser = W.Parser()
var unknown = Data(W.magic)
unknown.append(9)
unknown.append(contentsOf: [0, 0, 0, 0])
check(parser.push(unknown).isEmpty && parser.failed, "unknown kind fails")

// settings from the app
let config = W.Config(maxPixels: 0, fps: 60, quality: 0.9, audio: true)
check(W.Config.decode(config.encoded()) == config, "config round trip")
check(W.Config.decode(W.Config(maxPixels: 100, fps: 500, quality: 3, audio: false).encoded())
      == W.Config(maxPixels: 480, fps: 60, quality: 1, audio: false), "config clamped")
check(W.Config.decode(Data("nope".utf8)) == nil, "broken config refused")
check(W.Config(maxPixels: 1280, fps: 15, quality: 0.6, audio: true).maxBitrate == 1_500_000, "720p15 bitrate")
check(W.Config(maxPixels: 1920, fps: 30, quality: 0.6, audio: true).maxBitrate == 5_000_000, "1080p30 bitrate")
check(W.Config(maxPixels: 0, fps: 60, quality: 0.6, audio: true).maxBitrate == 16_000_000, "native 60 bitrate")
parser = W.Parser()
check(parser.push(W.encode(.config, config.encoded())).first?.kind == .config, "config message")

// sound of other apps
let audioHeader = W.AudioHeader(sampleRate: 44_100, formatID: 0x6C70636D, formatFlags: 0xE, bytesPerPacket: 4,
                                framesPerPacket: 1, bytesPerFrame: 4, channelsPerFrame: 2, bitsPerChannel: 16, frameCount: 3)
let samples = Data((0..<12).map { UInt8($0) })
let payload = audioHeader.encoded() + samples
check(audioHeader.encoded().count == W.AudioHeader.size, "audio header is 40 bytes")
let decoded = W.AudioHeader.decode(payload)
check(decoded?.0 == audioHeader, "audio header round trip")
check(decoded?.1 == samples, "samples kept")
check(W.AudioHeader.decode(audioHeader.encoded() + Data([1, 2])) == nil, "too few samples refused")
check(W.AudioHeader.decode(Data([1, 2, 3])) == nil, "too short refused")
var badRate = audioHeader
badRate.sampleRate = 0
check(W.AudioHeader.decode(badRate.encoded() + samples) == nil, "no sample rate refused")

if failures > 0 { print("\(failures) broadcast wire check(s) failed"); exit(1) }
print("broadcast wire checks passed")
