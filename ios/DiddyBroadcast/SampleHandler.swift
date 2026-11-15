import CoreImage
import ImageIO
import Network
import ReplayKit

/// "Diddy" in the iOS screen broadcast picker: records the whole screen, also while you are in
/// another app, and hands the pictures and the sound of other apps to the Diddy app over
/// 127.0.0.1 (BroadcastWire.swift), which shares them in the call. Without the extension iOS 26
/// and older only let Diddy record itself, and the share froze as soon as you left the app.
///
/// Resolution, frame rate, quality and sound come from the app (Settings > Calls > Screen
/// Sharing) as a `config` message. Extensions have about 50 MB: a picture is encoded only once the
/// previous one went out, so a slow moment drops pictures instead of piling them up.
final class SampleHandler: RPBroadcastSampleHandler {
    private let queue = DispatchQueue(label: "app.diddy.broadcast")
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let lock = NSLock()
    private var connection: NWConnection?
    private var parser = BroadcastWire.Parser()
    private var config = BroadcastWire.Config.standard
    private var sending = false
    private var ended = false
    private var lastSent: CFTimeInterval = 0

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        guard let port = NWEndpoint.Port(rawValue: BroadcastWire.port) else { return }
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        let connection = NWConnection(host: "127.0.0.1", port: port, using: parameters)
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.receive(on: connection)
            case .waiting, .failed:
                // nobody listens: Diddy is not in a call (or did not ask for this broadcast)
                self?.end("Start sharing from a voice channel in Diddy, then choose Diddy here.")
            case .cancelled:
                self?.end("Diddy stopped sharing your screen.")
            default:
                break
            }
        }
        lock.withLock { self.connection = connection }
        connection.start(queue: queue)
        connection.send(content: BroadcastWire.encode(.hello, Data("{\"v\":2}".utf8)), completion: .contentProcessed { _ in })
    }

    override func broadcastFinished() {
        let connection = lock.withLock { () -> NWConnection? in
            ended = true
            return self.connection
        }
        connection?.send(content: BroadcastWire.encode(.bye), completion: .contentProcessed { _ in connection?.cancel() })
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        switch sampleBufferType {
        case .video: sendPicture(sampleBuffer)
        case .audioApp: sendSound(sampleBuffer)
        default: break // your microphone is the call's own
        }
    }

    // MARK: Pictures

    private func sendPicture(_ sampleBuffer: CMSampleBuffer) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let now = CACurrentMediaTime()
        let taken: (NWConnection, BroadcastWire.Config)? = lock.withLock {
            guard !ended, !sending, now - lastSent >= 1 / Double(config.fps) - 0.002,
                  let connection = self.connection, connection.state == .ready else { return nil }
            sending = true
            lastSent = now
            return (connection, config)
        }
        guard let taken else { return }
        let (connection, config) = taken
        guard let jpeg = encode(pixelBuffer, orientation: Self.orientation(of: sampleBuffer), config: config) else {
            lock.withLock { sending = false }
            return
        }
        connection.send(content: BroadcastWire.encode(.frame, jpeg), completion: .contentProcessed { [weak self] _ in
            self?.lock.withLock { self?.sending = false }
        })
    }

    /// Upright, at most `maxPixels` on the longest side (0: as recorded), as JPEG.
    private func encode(_ pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation, config: BroadcastWire.Config) -> Data? {
        autoreleasepool {
            var image = CIImage(cvPixelBuffer: pixelBuffer).oriented(orientation)
            let longest = max(image.extent.width, image.extent.height)
            if config.maxPixels > 0, longest > CGFloat(config.maxPixels) {
                let scale = CGFloat(config.maxPixels) / longest
                image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            }
            image = image.transformed(by: CGAffineTransform(translationX: -image.extent.origin.x, y: -image.extent.origin.y))
            let options: [CIImageRepresentationOption: Any] = [
                CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): config.quality,
            ]
            return context.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(), options: options)
        }
    }

    private static func orientation(of sampleBuffer: CMSampleBuffer) -> CGImagePropertyOrientation {
        let value = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber
        return value.flatMap { CGImagePropertyOrientation(rawValue: $0.uint32Value) } ?? .up
    }

    // MARK: Sound of other apps

    private func sendSound(_ sampleBuffer: CMSampleBuffer) {
        let connection: NWConnection? = lock.withLock {
            guard !ended, config.audio, let connection = self.connection, connection.state == .ready else { return nil }
            return connection
        }
        guard let connection,
              let description = CMSampleBufferGetFormatDescription(sampleBuffer),
              let basic = CMAudioFormatDescriptionGetStreamBasicDescription(description)?.pointee,
              basic.mFormatID == kAudioFormatLinearPCM,
              let block = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }
        var length = 0
        var pointer: UnsafeMutablePointer<Int8>?
        guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length,
                                          dataPointerOut: &pointer) == kCMBlockBufferNoErr, let pointer, length > 0 else { return }
        let header = BroadcastWire.AudioHeader(
            sampleRate: basic.mSampleRate, formatID: basic.mFormatID, formatFlags: basic.mFormatFlags,
            bytesPerPacket: basic.mBytesPerPacket, framesPerPacket: basic.mFramesPerPacket,
            bytesPerFrame: basic.mBytesPerFrame, channelsPerFrame: basic.mChannelsPerFrame,
            bitsPerChannel: basic.mBitsPerChannel, frameCount: UInt32(CMSampleBufferGetNumSamples(sampleBuffer))
        )
        let payload = header.encoded() + Data(bytes: pointer, count: length)
        connection.send(content: BroadcastWire.encode(.audio, payload), completion: .contentProcessed { _ in })
    }

    // MARK: Connection

    /// Settings from the app, and the close when you stop sharing there or leave the call.
    private func receive(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                let messages = self.lock.withLock { self.parser.push(data) }
                for message in messages where message.kind == .config {
                    if let config = BroadcastWire.Config.decode(message.payload) {
                        self.lock.withLock { self.config = config }
                    }
                }
            }
            if isComplete || error != nil {
                self.end("Diddy stopped sharing your screen.")
            } else {
                self.receive(on: connection)
            }
        }
    }

    private func end(_ message: String) {
        let connection = lock.withLock { () -> NWConnection?? in
            guard !ended else { return nil }
            ended = true
            return .some(self.connection)
        }
        guard let connection else { return }
        connection?.cancel()
        finishBroadcastWithError(NSError(domain: "app.diddy.broadcast", code: 1,
                                         userInfo: [NSLocalizedDescriptionKey: message]))
    }
}
