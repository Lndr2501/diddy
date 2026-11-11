import AVFoundation
import AudioToolbox
import Foundation

/// Runs off the UI actor. iOS 16's Opus decoder expects a fixed packet duration and the
/// 28-byte Core Audio cookie, not the Ogg OpusHead. See Tools/oggopus_check/README.md.
enum OpusTranscoder {
    static func convert(_ data: Data, to destination: URL) throws {
        let limits = OpusLimits.standard
        guard data.count <= limits.maxInputBytes else { throw OpusContainerError.tooLarge }
        let stream = try OpusContainer.parse(Array(data), limits: limits)
        guard let samples = stream.sampleCounts.first, stream.sampleCounts.allSatisfy({ $0 == samples }) else {
            throw OpusContainerError.unsupported("changing Opus packet durations")
        }
        guard stream.playableSamples > 0 else { throw OpusContainerError.empty }
        guard stream.totalSamples <= limits.maxPCMBytes / (stream.header.channels * 2) else {
            throw OpusContainerError.tooLarge
        }
        var description = AudioStreamBasicDescription()
        description.mSampleRate = 48_000
        description.mFormatID = kAudioFormatOpus
        description.mFramesPerPacket = UInt32(samples)
        description.mChannelsPerFrame = UInt32(stream.header.channels)
        guard let input = AVAudioFormat(streamDescription: &description),
              let output = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: UInt32(stream.header.channels)),
              let converter = AVAudioConverter(from: input, to: output),
              let pcm = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: UInt32(OpusPacket.maxSamples)) else {
            throw OpusContainerError.unsupported("an unavailable Opus decoder")
        }
        converter.magicCookie = OpusDecoderCookie.make(channels: stream.header.channels,
                                                       samples: samples, toc: stream.packets[0][0])
        let compressed = AVAudioCompressedBuffer(format: input, packetCapacity: 1,
                                                 maximumPacketSize: limits.maxPacketBytes)
        guard let packetDescriptions = compressed.packetDescriptions else {
            throw OpusContainerError.unsupported("missing Opus packet descriptions")
        }
        let temporary = destination.deletingLastPathComponent().appendingPathComponent("\(UUID().uuidString).caf")
        defer { try? FileManager.default.removeItem(at: temporary) }
        let writer = try OpusCAFWriter(url: temporary, channels: stream.header.channels, sampleRate: 48_000,
                                      maxDataBytes: limits.maxPCMBytes)
        let sink = OpusPCMSink(writer: writer, preSkip: stream.header.preSkip,
                               playableFrames: stream.playableSamples, gain: stream.header.outputGain)
        var index = 0
        var idle = 0
        while !sink.isFull {
            try Task.checkCancellation()
            pcm.frameLength = 0
            var failure: NSError?
            let previousIndex = index
            let status = converter.convert(to: pcm, error: &failure) { _, state in
                guard index < stream.packets.count else {
                    state.pointee = .endOfStream
                    return nil
                }
                let packet = stream.packets[index]
                packet.withUnsafeBytes { raw in
                    if let base = raw.baseAddress { compressed.data.copyMemory(from: base, byteCount: raw.count) }
                }
                compressed.byteLength = UInt32(packet.count)
                compressed.packetCount = 1
                packetDescriptions[0] = AudioStreamPacketDescription(mStartOffset: 0,
                    mVariableFramesInPacket: UInt32(samples), mDataByteSize: UInt32(packet.count))
                index += 1
                state.pointee = .haveData
                return compressed
            }
            if let failure { throw failure }
            guard status != .error else { throw OpusContainerError.corrupt("Opus decode failed") }
            if pcm.frameLength > 0 {
                guard let planes = pcm.floatChannelData else { throw OpusContainerError.corrupt("missing PCM") }
                let planar = (0..<stream.header.channels).map {
                    Array(UnsafeBufferPointer(start: planes[$0], count: Int(pcm.frameLength)))
                }
                try sink.append(planar: planar)
            }
            if status == .endOfStream { break }
            idle = pcm.frameLength == 0 && index == previousIndex ? idle + 1 : 0
            guard idle < 4 else { throw OpusContainerError.corrupt("stalled Opus decoder") }
        }
        guard sink.isFull, sink.writtenFrames > 0 else { throw OpusContainerError.corrupt("short Opus decode") }
        try writer.finish()
        try FileManager.default.moveItem(at: temporary, to: destination)
    }
}
