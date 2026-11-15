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

if failures > 0 { print("\(failures) broadcast wire check(s) failed"); exit(1) }
print("broadcast wire checks passed")
