import CryptoKit
import ImageIO
import MatrixRustSDK
import SwiftUI
import UIKit

/// Animated profile pictures (GIF, animated WebP, APNG) move like on desktop. The Matrix avatar is
/// the uploaded file itself, but the server's thumbnail of it stands still, so the original is
/// fetched once and checked. A still picture is remembered on disk and never fetched again (an
/// mxc:// address never changes its content); an animated one is kept in the caches folder.
actor AnimatedAvatarMedia {
    static let shared = AnimatedAvatarMedia()

    /// Larger originals are left alone; the still thumbnail stays.
    private static let maxBytes = 8 * 1024 * 1024
    private static let maxFrames = 48
    /// Decoded frames of one picture, in bytes; long animations skip frames to stay below.
    private static let frameBudget = 6 * 1024 * 1024
    private static let maxRemembered = 4000

    private static let folder: URL = {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let url = caches.appendingPathComponent("AnimatedAvatars", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()
    private static var stillsFile: URL { folder.appendingPathComponent("still.json") }

    private let cache = NSCache<NSString, UIImage>()
    private var stills: [String] = []
    private var stillSet: Set<String> = []
    private var running: [String: Task<Data?, Never>] = [:]
    private var loaded = false

    init() { cache.totalCostLimit = 64 * 1024 * 1024 }

    /// The moving picture, or nil when it is a still picture (or cannot be fetched right now).
    func picture(mxc: String, pixels: Int, client: Client) async -> UIImage? {
        loadStills()
        guard !stillSet.contains(mxc) else { return nil }
        let key = "\(mxc)|\(pixels)" as NSString
        if let cached = cache.object(forKey: key) { return cached }
        guard let data = await original(mxc: mxc, client: client) else { return nil }
        guard data.count <= Self.maxBytes, let image = Self.decode(data, maxPixels: pixels) else {
            rememberStill(mxc)
            return nil
        }
        let cost = (image.images ?? [image]).reduce(0) { total, frame in
            total + (frame.cgImage.map { $0.bytesPerRow * $0.height } ?? 0)
        }
        cache.setObject(image, forKey: key, cost: cost)
        return image
    }

    // MARK: Fetching

    private func file(for mxc: String) -> URL {
        let name = SHA256.hash(data: Data(mxc.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
        return Self.folder.appendingPathComponent(name)
    }

    /// The original file: from the caches folder, else downloaded once (several views asking for
    /// the same picture share one download). Nil only when the download failed.
    private func original(mxc: String, client: Client) async -> Data? {
        let url = file(for: mxc)
        if let data = try? Data(contentsOf: url) { return data }
        if let task = running[mxc] { return await task.value }
        let task = Task<Data?, Never> {
            guard let source = try? MediaSource.fromUrl(url: mxc),
                  let data = try? await client.getMediaContent(mediaSource: source), !data.isEmpty else { return nil }
            return data
        }
        running[mxc] = task
        let data = await task.value
        running[mxc] = nil
        // Only animations are kept; for a still picture its address in the list is enough.
        if let data, data.count <= Self.maxBytes, Self.frameCount(data) > 1 {
            try? data.write(to: url, options: .atomic)
        }
        return data
    }

    private func loadStills() {
        guard !loaded else { return }
        loaded = true
        if let data = try? Data(contentsOf: Self.stillsFile), let list = try? JSONDecoder().decode([String].self, from: data) {
            stills = list
            stillSet = Set(list)
        }
    }

    private func rememberStill(_ mxc: String) {
        guard stillSet.insert(mxc).inserted else { return }
        stills.append(mxc)
        if stills.count > Self.maxRemembered {
            let dropped = stills.prefix(stills.count - Self.maxRemembered)
            stillSet.subtract(dropped)
            stills.removeFirst(dropped.count)
        }
        if let data = try? JSONEncoder().encode(stills) { try? data.write(to: Self.stillsFile, options: .atomic) }
    }

    // MARK: Decoding

    private static func frameCount(_ data: Data) -> Int {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return 0 }
        return CGImageSourceGetCount(source)
    }

    /// An animated image with the file's own timing, small enough for the place it is shown in;
    /// nil for a still picture.
    private static func decode(_ data: Data, maxPixels: Int) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let count = CGImageSourceGetCount(source)
        guard count > 1 else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        func frame(_ index: Int) -> CGImage? { CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary) }
        guard let first = frame(0) else { return nil }
        let frameBytes = max(1, first.bytesPerRow * first.height)
        let keep = max(2, min(maxFrames, frameBudget / frameBytes))
        let step = max(1, Int((Double(count) / Double(keep)).rounded(.up)))
        var frames: [UIImage] = []
        var duration = 0.0
        for index in stride(from: 0, to: count, by: step) {
            guard let image = index == 0 ? first : frame(index) else { continue }
            frames.append(UIImage(cgImage: image))
            // A skipped frame's time goes to the frame kept before it.
            for skipped in index..<min(index + step, count) { duration += delay(source, skipped) }
        }
        guard frames.count > 1 else { return nil }
        return UIImage.animatedImage(with: frames, duration: max(0.2, min(duration, 30)))
    }

    private static func delay(_ source: CGImageSource, _ index: Int) -> Double {
        let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any] ?? [:]
        let formats: [(CFString, CFString, CFString)] = [
            (kCGImagePropertyGIFDictionary, kCGImagePropertyGIFUnclampedDelayTime, kCGImagePropertyGIFDelayTime),
            (kCGImagePropertyPNGDictionary, kCGImagePropertyAPNGUnclampedDelayTime, kCGImagePropertyAPNGDelayTime),
            (kCGImagePropertyWebPDictionary, kCGImagePropertyWebPUnclampedDelayTime, kCGImagePropertyWebPDelayTime),
        ]
        for (dictionary, unclamped, clamped) in formats {
            guard let values = properties[dictionary] as? [CFString: Any] else { continue }
            if let value = (values[unclamped] as? Double) ?? (values[clamped] as? Double) {
                // Browsers treat very short delays as 0.1 s too.
                return value < 0.02 ? 0.1 : value
            }
        }
        return 0.1
    }
}

/// A moving picture filling its box (`object-fit: cover`). SwiftUI's `Image` shows only the
/// first frame of an animated `UIImage`, so this is a `UIImageView`.
struct AnimatedPictureView: UIViewRepresentable {
    let image: UIImage

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.contentMode = .scaleAspectFill
        view.clipsToBounds = true
        view.isUserInteractionEnabled = false
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        return view
    }

    func updateUIView(_ view: UIImageView, context: Context) {
        if view.image !== image { view.image = image }
        if image.images != nil, !view.isAnimating { view.startAnimating() }
    }
}
