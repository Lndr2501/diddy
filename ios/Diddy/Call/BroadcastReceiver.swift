import AVFoundation
import CoreImage
import CoreVideo
import Foundation
import Network

/// The app side of `DiddyBroadcast`: listens on 127.0.0.1 while you share the whole screen,
/// takes one connection, tells the extension how to record (`config`) and turns its JPEG pictures
/// into pixel buffers and its sound into PCM buffers for the call (BroadcastWire.swift).
/// Everything runs on its own queue; `onEvent` and the sinks are called there too.
final class BroadcastReceiver: @unchecked Sendable {
    enum Event {
        case connected
        case ended
    }

    private let queue = DispatchQueue(label: "app.diddy.broadcast.receiver", qos: .userInitiated)
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let lock = NSLock()
    private var listener: NWListener?
    private var connection: NWConnection?
    private var parser = BroadcastWire.Parser()
    private var pool: CVPixelBufferPool?
    private var poolSize = CGSize.zero
    private var frameSink: ((CVPixelBuffer) -> Void)?
    private var audioSink: ((AVAudioPCMBuffer) -> Void)?
    private var finished = false
    private var config: BroadcastWire.Config
    private let onEvent: (Event) -> Void

    init(config: BroadcastWire.Config, onEvent: @escaping (Event) -> Void) {
        self.config = config
        self.onEvent = onEvent
    }

    /// Starts listening. Throws when the port cannot be opened.
    func start() throws {
        guard let port = NWEndpoint.Port(rawValue: BroadcastWire.port) else { return }
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        parameters.allowLocalEndpointReuse = true
        let listener = try NWListener(using: parameters, on: port)
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.stateUpdateHandler = { [weak self] state in
            if case .failed = state { self?.finish() }
        }
        lock.withLock { self.listener = listener }
        listener.start(queue: queue)
    }

    /// Where the pictures go once the call has a track for them; until then they are dropped.
    func setSink(_ sink: ((CVPixelBuffer) -> Void)?) {
        lock.withLock { frameSink = sink }
    }

    /// New settings while sharing (sound of other apps on or off).
    func update(config: BroadcastWire.Config) {
        let connection = lock.withLock { () -> NWConnection? in
            self.config = config
            return self.connection
        }
        connection?.send(content: BroadcastWire.encode(.config, config.encoded()), completion: .contentProcessed { _ in })
    }

    /// Where the sound of other apps goes; nil drops it.
    func setAudioSink(_ sink: ((AVAudioPCMBuffer) -> Void)?) {
        lock.withLock { audioSink = sink }
    }

    /// Closes everything; the extension sees the connection go and ends the broadcast.
    func stop() {
        lock.withLock { finished = true }
        let (listener, connection) = lock.withLock { (self.listener, self.connection) }
        listener?.cancel()
        connection?.cancel()
    }

    private func accept(_ connection: NWConnection) {
        let taken = lock.withLock { () -> Bool in
            guard self.connection == nil, !finished else { return false }
            self.connection = connection
            return true
        }
        // one broadcast at a time; anything else on the port is turned away
        guard taken else {
            connection.cancel()
            return
        }
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled: self?.finish()
            default: break
            }
        }
        connection.start(queue: queue)
        // how to record: the extension cannot read the app's settings itself
        let config = lock.withLock { self.config }
        connection.send(content: BroadcastWire.encode(.config, config.encoded()), completion: .contentProcessed { _ in })
        receive(on: connection)
    }

    private func receive(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 512 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                for message in self.parser.push(data) { self.handle(message) }
            }
            if isComplete || error != nil || self.parser.failed {
                self.finish()
                return
            }
            self.receive(on: connection)
        }
    }

    private func handle(_ message: BroadcastWire.Message) {
        switch message.kind {
        case .hello:
            onEvent(.connected)
        case .frame:
            guard let sink = lock.withLock({ frameSink }), let buffer = pixelBuffer(fromJPEG: message.payload) else { return }
            sink(buffer)
        case .audio:
            guard let sink = lock.withLock({ audioSink }), let buffer = Self.pcmBuffer(fromAudio: message.payload) else { return }
            sink(buffer)
        case .bye:
            finish()
        case .config:
            break // only the app sends these
        }
    }

    /// The sound as the extension recorded it (the mixer converts it to the call's format).
    private static func pcmBuffer(fromAudio payload: Data) -> AVAudioPCMBuffer? {
        guard let decoded = BroadcastWire.AudioHeader.decode(payload) else { return nil }
        let (header, samples) = decoded
        var description = AudioStreamBasicDescription(
            mSampleRate: header.sampleRate, mFormatID: header.formatID, mFormatFlags: header.formatFlags,
            mBytesPerPacket: header.bytesPerPacket, mFramesPerPacket: header.framesPerPacket,
            mBytesPerFrame: header.bytesPerFrame, mChannelsPerFrame: header.channelsPerFrame,
            mBitsPerChannel: header.bitsPerChannel, mReserved: 0
        )
        guard let format = AVAudioFormat(streamDescription: &description), format.isInterleaved,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: header.frameCount) else { return nil }
        buffer.frameLength = header.frameCount
        guard let target = buffer.audioBufferList.pointee.mBuffers.mData else { return nil }
        let count = min(samples.count, Int(buffer.audioBufferList.pointee.mBuffers.mDataByteSize))
        samples.copyBytes(to: target.assumingMemoryBound(to: UInt8.self), count: count)
        return buffer
    }

    private func pixelBuffer(fromJPEG data: Data) -> CVPixelBuffer? {
        guard let image = CIImage(data: data) else { return nil }
        let size = image.extent.size
        if pool == nil || size != poolSize {
            let attributes: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: Int(size.width),
                kCVPixelBufferHeightKey as String: Int(size.height),
                kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            ]
            var created: CVPixelBufferPool?
            CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, attributes as CFDictionary, &created)
            pool = created
            poolSize = size
        }
        guard let pool else { return nil }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer)
        guard let buffer else { return nil }
        context.render(image, to: buffer)
        return buffer
    }

    /// The broadcast is over (ended in the extension, connection lost or stopped here).
    private func finish() {
        let first = lock.withLock { () -> Bool in
            let wasRunning = listener != nil || connection != nil
            let (listener, connection) = (self.listener, self.connection)
            self.listener = nil
            self.connection = nil
            frameSink = nil
            audioSink = nil
            listener?.cancel()
            connection?.cancel()
            return wasRunning
        }
        if first { onEvent(.ended) }
    }
}
