import AVFoundation
import ImageIO
import MatrixRustSDK
import SwiftUI
import UIKit

/// The nameplate of someone: the background behind their row in member and DM lists, drawn like
/// desktop (`Nameplate.tsx`): a colour wash or preset gradient, optionally a picture (also GIF) or a
/// muted looping video on top, faded out towards the name unless the owner chose to cover the row,
/// and a light veil in the surface colour so the text stays readable.
///
/// Nothing moves with Reduce Motion or Low Power Mode on: GIFs and videos then show a still
/// picture (the video's poster, if it has one) and the preset gradient stands still.
struct DiddyNameplateBackdrop: View {
    let plate: DiddyNameplate
    let account: MatrixAccount
    /// The colour the row sits on; the veil uses it.
    var surface: Color = Theme.sidebar
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var picture: UIImage?
    @State private var videoURL: URL?
    @State private var flowing = false
    /// Settings > Chat > Nameplates; off shows a still picture.
    @AppStorage(AvatarPrefs.nameplatesKey) private var nameplatesMove = true

    private var animate: Bool { nameplatesMove && !reduceMotion && !ProcessInfo.processInfo.isLowPowerModeEnabled }

    var body: some View {
        ZStack {
            layers
                .mask {
                    if plate.fitsFullRow {
                        Rectangle()
                    } else {
                        LinearGradient(stops: [
                            .init(color: .black.opacity(0), location: 0),
                            .init(color: .black.opacity(0.3), location: 0.3),
                            .init(color: .black.opacity(0.85), location: 0.65),
                            .init(color: .black, location: 1),
                        ], startPoint: .leading, endPoint: .trailing)
                    }
                }
            Rectangle().fill(surface.opacity(plate.fitsFullRow ? 0.58 : 0.18))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: plate) { await loadMedia() }
        .onChange(of: nameplatesMove) { _ in Task { await loadMedia() } }
    }

    @ViewBuilder
    private var layers: some View {
        ZStack {
            if let colors = plate.backgroundColors?.compactMap({ Color(diddyHex: $0) }), colors.count > 1 {
                let wash = plate.preset == nil ? colors.map { $0.opacity(0.45) } : colors
                if plate.flow && animate {
                    // A slowly sliding gradient, 220 % wide like the desktop animation.
                    GeometryReader { proxy in
                        LinearGradient(colors: wash, startPoint: .leading, endPoint: .trailing)
                            .frame(width: proxy.size.width * 2.2)
                            .offset(x: flowing ? -proxy.size.width * 1.2 : 0)
                            .animation(.easeInOut(duration: 9).repeatForever(autoreverses: true), value: flowing)
                    }
                    .onAppear { flowing = true }
                } else {
                    LinearGradient(colors: wash, startPoint: .leading, endPoint: .trailing)
                }
            }
            if let videoURL, animate {
                NameplateVideo(url: videoURL)
            } else if let picture {
                if let pos = plate.imagePos {
                    // the part of the picture the owner chose (focal point and zoom)
                    GeometryReader { proxy in
                        let place = pos.placement(imageWidth: picture.size.width, imageHeight: picture.size.height,
                                                  boxWidth: proxy.size.width, boxHeight: proxy.size.height)
                        NameplatePicture(image: picture)
                            .frame(width: place.width, height: place.height)
                            .position(x: place.x + place.width / 2, y: place.y + place.height / 2)
                    }
                } else {
                    NameplatePicture(image: picture)
                }
            }
        }
        .clipped()
    }

    private func loadMedia() async {
        picture = nil
        videoURL = nil
        let media = DiddyNameplateMedia.shared
        if let mxc = plate.videoMxc, animate {
            videoURL = await media.videoFile(mxc: mxc, accountId: account.id, client: account.client)
            // The poster shows until the video runs, and when it cannot be played.
            if let poster = plate.imageMxc {
                picture = await media.picture(mxc: poster, animated: false, accountId: account.id, client: account.client)
            }
        } else if let mxc = plate.imageMxc {
            picture = await media.picture(mxc: mxc, animated: animate, accountId: account.id, client: account.client)
        }
    }
}

extension View {
    /// Draws someone's Diddy nameplate behind a list row. The backdrop reaches over the list's own
    /// insets by `bleed` so it fills the whole row.
    @ViewBuilder
    func diddyNameplate(_ plate: DiddyNameplate?, account: MatrixAccount?, bleed: EdgeInsets = EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)) -> some View {
        if let plate, let account {
            background {
                DiddyNameplateBackdrop(plate: plate, account: account)
                    .padding(EdgeInsets(top: -bleed.top, leading: -bleed.leading, bottom: -bleed.bottom, trailing: -bleed.trailing))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        } else {
            self
        }
    }
}

// MARK: - Media

/// A still or animated picture filling its box (`object-fit: cover`).
private struct NameplatePicture: UIViewRepresentable {
    let image: UIImage

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.contentMode = .scaleAspectFill
        view.clipsToBounds = true
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        return view
    }

    func updateUIView(_ view: UIImageView, context: Context) {
        view.image = image
        if image.images != nil { view.startAnimating() }
    }
}

/// A muted, looping, inline video.
private struct NameplateVideo: UIViewRepresentable {
    let url: URL

    final class PlayerView: UIView {
        override static var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
        var looper: AVPlayerLooper?
    }

    func makeUIView(context: Context) -> PlayerView {
        let view = PlayerView()
        view.clipsToBounds = true
        let player = AVQueuePlayer()
        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = false
        view.looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        player.play()
        return view
    }

    func updateUIView(_ view: PlayerView, context: Context) {}

    static func dismantleUIView(_ view: PlayerView, coordinator: ()) {
        view.playerLayer.player?.pause()
        view.looper?.disableLooping()
        view.playerLayer.player = nil
    }
}

/// Downloads and keeps the pictures and videos of nameplates. Same limits as desktop: a nameplate
/// is a short loop, at most 8 MB; larger files are ignored. Pictures are decoded small (a row is a
/// few hundred points wide) and GIFs keep at most 60 frames, so a list of nameplates stays cheap.
actor DiddyNameplateMedia {
    static let shared = DiddyNameplateMedia()

    private static let maxBytes = 8 * 1024 * 1024
    private static let maxPixels = 480
    private static let maxFrames = 60

    private let cache = NSCache<NSString, UIImage>()
    private var files: [String: URL] = [:]
    private var failed: Set<String> = []

    init() { cache.countLimit = 60 }

    func picture(mxc: String, animated: Bool, accountId: String, client: Client) async -> UIImage? {
        let key = "\(accountId)|\(mxc)|\(animated)"
        if let cached = cache.object(forKey: key as NSString) { return cached }
        guard !failed.contains(key), let data = await download(mxc: mxc, client: client) else {
            failed.insert(key)
            return nil
        }
        guard let image = Self.decode(data, animated: animated) else {
            failed.insert(key)
            return nil
        }
        cache.setObject(image, forKey: key as NSString)
        return image
    }

    func videoFile(mxc: String, accountId: String, client: Client) async -> URL? {
        let key = "\(accountId)|\(mxc)"
        if let url = files[key], FileManager.default.fileExists(atPath: url.path) { return url }
        guard !failed.contains(key), let data = await download(mxc: mxc, client: client) else {
            failed.insert(key)
            return nil
        }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("DiddyNameplates", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let name = String(mxc.unicodeScalars.map { $0.properties.isAlphabetic || ("0"..."9").contains($0) ? Character($0) : "_" })
        let url = folder.appendingPathComponent("\(accountId.prefix(8))-\(name).mp4")
        guard (try? data.write(to: url, options: .atomic)) != nil else {
            failed.insert(key)
            return nil
        }
        files[key] = url
        return url
    }

    private func download(mxc: String, client: Client) async -> Data? {
        guard let source = try? MediaSource.fromUrl(url: mxc),
              let data = try? await client.getMediaContent(mediaSource: source), data.count <= Self.maxBytes else { return nil }
        return data
    }

    /// A still first frame, or (for animated formats) an animated image with the file's own timing.
    private static func decode(_ data: Data, animated: Bool) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        func frame(_ index: Int) -> UIImage? {
            CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary).map { UIImage(cgImage: $0) }
        }
        let count = CGImageSourceGetCount(source)
        guard animated, count > 1 else { return frame(0) }
        let step = max(1, Int((Double(count) / Double(maxFrames)).rounded(.up)))
        var frames: [UIImage] = []
        var duration = 0.0
        for index in stride(from: 0, to: count, by: step) {
            guard let image = frame(index) else { continue }
            frames.append(image)
            duration += delay(source, index) * Double(min(step, count - index))
        }
        guard frames.count > 1 else { return frames.first }
        return UIImage.animatedImage(with: frames, duration: max(0.2, min(duration, 20)))
    }

    private static func delay(_ source: CGImageSource, _ index: Int) -> Double {
        let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
        let gif = properties?[kCGImagePropertyGIFDictionary] as? [CFString: Any]
        let value = (gif?[kCGImagePropertyGIFUnclampedDelayTime] as? Double)
            ?? (gif?[kCGImagePropertyGIFDelayTime] as? Double) ?? 0.1
        return value < 0.02 ? 0.1 : value
    }
}
