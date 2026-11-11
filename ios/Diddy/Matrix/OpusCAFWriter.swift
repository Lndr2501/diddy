import Foundation

// Writes decoded voice messages as 16-bit PCM CAF, which AVAudioPlayer plays. Foundation only
// (checked in `Tools/oggopus_check/main.swift`).

enum OpusCAFWriterError: Error, Equatable {
    case cannotCreate
    case tooLarge
    case badChannelCount
}

/// A canonical 68-byte-header CAF file, written in pieces. The sizes in the header are filled in
/// by `finish()`; until then the file is not a valid CAF, so write to a temporary name and rename.
final class OpusCAFWriter {
    let channels: Int
    let sampleRate: Int
    /// Sample frames written so far.
    private(set) var frames = 0
    private let maxDataBytes: Int
    private let handle: FileHandle
    private var dataBytes = 0
    private var closed = false

    init(url: URL, channels: Int, sampleRate: Int, maxDataBytes: Int) throws {
        guard channels >= 1, channels <= 8 else { throw OpusCAFWriterError.badChannelCount }
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw OpusCAFWriterError.cannotCreate }
        self.channels = channels
        self.sampleRate = sampleRate
        self.maxDataBytes = maxDataBytes
        self.handle = try FileHandle(forWritingTo: url)
        try handle.write(contentsOf: Data(OpusCAFWriter.header(channels: channels, sampleRate: sampleRate, dataBytes: 0)))
    }

    deinit {
        if !closed { try? handle.close() }
    }

    /// `samples` are interleaved: frame 0 channel 0, frame 0 channel 1, frame 1 channel 0 ...
    func append(interleaved samples: [Int16]) throws {
        guard !closed, !samples.isEmpty else { return }
        let bytes = samples.count * 2
        guard dataBytes + bytes <= maxDataBytes else { throw OpusCAFWriterError.tooLarge }
        var data = Data()
        data.reserveCapacity(bytes)
        for sample in samples {
            let value = UInt16(bitPattern: sample)
            data.append(UInt8(value & 0xFF))
            data.append(UInt8(value >> 8))
        }
        try handle.write(contentsOf: data)
        dataBytes += bytes
        frames += samples.count / channels
    }

    /// Fills in the sizes and closes the file.
    func finish() throws {
        guard !closed else { return }
        try handle.seek(toOffset: 0)
        try handle.write(contentsOf: Data(OpusCAFWriter.header(channels: channels, sampleRate: sampleRate, dataBytes: dataBytes)))
        try handle.close()
        closed = true
    }

    /// Closes without fixing the header (after an error); the caller deletes the file.
    func abandon() {
        guard !closed else { return }
        closed = true
        try? handle.close()
    }

    static func header(channels: Int, sampleRate: Int, dataBytes: Int) -> [UInt8] {
        var out: [UInt8] = []
        func text(_ s: String) { out.append(contentsOf: s.utf8) }
        func be(_ value: UInt64, _ bytes: Int) {
            for i in (0..<bytes).reversed() { out.append(UInt8(truncatingIfNeeded: value >> (8 * i))) }
        }
        text("caff"); be(1, 2); be(0, 2)
        text("desc"); be(32, 8)
        be(Double(sampleRate).bitPattern, 8)
        text("lpcm")
        be(2, 4) // CAF integer PCM is signed; bit 1 means little endian.
        be(UInt64(channels * 2), 4); be(1, 4)
        be(UInt64(channels), 4); be(16, 4)
        text("data"); be(UInt64(dataBytes + 4), 8); be(0, 4) // edit count

        return out
    }
}

/// Takes decoded float samples (planar, one array per channel) and writes what is left after
/// the pre-skip and the end padding, with the Opus output gain applied, clipped to 16 bits.
final class OpusPCMSink {
    private let writer: OpusCAFWriter
    private let channels: Int
    private let gain: Float
    private var toSkip: Int
    /// How many sample frames may still be written.
    private(set) var remaining: Int

    var isFull: Bool { remaining <= 0 }
    var writtenFrames: Int { writer.frames }

    init(writer: OpusCAFWriter, preSkip: Int, playableFrames: Int, gain: Float) {
        self.writer = writer
        self.channels = writer.channels
        self.gain = gain
        self.toSkip = max(preSkip, 0)
        self.remaining = max(playableFrames, 0)
    }

    func append(planar: [[Float]]) throws {
        guard planar.count == channels else { throw OpusCAFWriterError.badChannelCount }
        let available = planar.first?.count ?? 0
        guard planar.allSatisfy({ $0.count == available }) else { throw OpusCAFWriterError.badChannelCount }
        var start = 0
        if toSkip > 0 {
            let dropped = min(toSkip, available)
            toSkip -= dropped
            start = dropped
        }
        let take = min(available - start, remaining)
        guard take > 0 else { return }
        var out: [Int16] = []
        out.reserveCapacity(take * channels)
        for i in start..<(start + take) {
            for c in 0..<channels {
                var value = planar[c][i] * gain
                if value.isNaN { value = 0 }
                value = min(max(value, -1), 1)
                out.append(Int16((value * 32767).rounded()))
            }
        }
        try writer.append(interleaved: out)
        remaining -= take
    }
}
