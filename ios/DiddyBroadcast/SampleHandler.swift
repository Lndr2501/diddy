import CoreImage
import ImageIO
import Network
import ReplayKit

/// "Diddy" in the iOS screen broadcast picker: records the whole screen, also while you are in
/// another app, and hands the pictures to the Diddy app over 127.0.0.1 (BroadcastWire.swift),
/// which shares them in the call. Without the extension iOS 26 and older only let Diddy record
/// itself, and the share froze as soon as you left the app.
///
/// Extensions have about 50 MB: every picture is made at most 1280 px on its longest side and
/// sent as JPEG, 15 per second at most, and a new one only once the previous one went out.
final class SampleHandler: RPBroadcastSampleHandler {
    private static let maxPixels: CGFloat = 1280
    private static let minInterval: CFTimeInterval = 1.0 / 15
    private static let quality: CGFloat = 0.6

    private let queue = DispatchQueue(label: "app.diddy.broadcast")
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let lock = NSLock()
    private var connection: NWConnection?
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
                self?.watchForClose(connection)
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
        connection.send(content: BroadcastWire.encode(.hello, Data("{\"v\":1}".utf8)), completion: .contentProcessed { _ in })
    }

    override func broadcastFinished() {
        let connection = lock.withLock { () -> NWConnection? in
            ended = true
            return self.connection
        }
        connection?.send(content: BroadcastWire.encode(.bye), completion: .contentProcessed { _ in connection?.cancel() })
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let now = CACurrentMediaTime()
        let connection: NWConnection? = lock.withLock {
            guard !ended, !sending, now - lastSent >= Self.minInterval,
                  let connection = self.connection, connection.state == .ready else { return nil }
            sending = true
            lastSent = now
            return connection
        }
        guard let connection else { return }
        guard let jpeg = encode(pixelBuffer, orientation: Self.orientation(of: sampleBuffer)) else {
            lock.withLock { sending = false }
            return
        }
        connection.send(content: BroadcastWire.encode(.frame, jpeg), completion: .contentProcessed { [weak self] _ in
            self?.lock.withLock { self?.sending = false }
        })
    }

    /// Upright, at most `maxPixels` on the longest side, as JPEG.
    private func encode(_ pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) -> Data? {
        var image = CIImage(cvPixelBuffer: pixelBuffer).oriented(orientation)
        let longest = max(image.extent.width, image.extent.height)
        if longest > Self.maxPixels {
            let scale = Self.maxPixels / longest
            image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        }
        image = image.transformed(by: CGAffineTransform(translationX: -image.extent.origin.x, y: -image.extent.origin.y))
        let options: [CIImageRepresentationOption: Any] = [
            CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): Self.quality,
        ]
        return autoreleasepool {
            context.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(), options: options)
        }
    }

    private static func orientation(of sampleBuffer: CMSampleBuffer) -> CGImagePropertyOrientation {
        let value = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber
        return value.flatMap { CGImagePropertyOrientation(rawValue: $0.uint32Value) } ?? .up
    }

    /// Diddy closes the connection when you stop sharing there or leave the call.
    private func watchForClose(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1024) { [weak self] _, _, isComplete, error in
            if isComplete || error != nil {
                self?.end("Diddy stopped sharing your screen.")
            } else {
                self?.watchForClose(connection)
            }
        }
    }

    private func end(_ message: String) {
        let shouldEnd = lock.withLock { () -> Bool in
            guard !ended else { return false }
            ended = true
            return true
        }
        guard shouldEnd else { return }
        connection?.cancel()
        finishBroadcastWithError(NSError(domain: "app.diddy.broadcast", code: 1,
                                         userInfo: [NSLocalizedDescriptionKey: message]))
    }
}
