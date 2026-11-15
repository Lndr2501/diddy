import AVFoundation
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Size and a small preview of a picture before it is sent. Other apps (Diddy on the desktop and on
/// iOS, Element) show the preview in the chat and load the original only when it is opened; without
/// one every phone photo was downloaded in full by everyone in the room. Checked by
/// Tools/sentmedia_check.
enum SentMedia {
    /// Longest side of a preview, as Element sends them.
    static let thumbnailMaxPixel = 800

    struct Picture {
        /// Pixel size as shown, with the EXIF orientation applied (a portrait photo is taller).
        let width: Int
        let height: Int
        /// JPEG preview; nil when the picture is small already or animated.
        let thumbnail: Data?
        let thumbnailWidth: Int
        let thumbnailHeight: Int
    }

    /// Nil when the data is no picture ImageIO can read. Runs ImageIO; call it off the main thread.
    static func picture(_ data: Data, mime: String) -> Picture? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let rawWidth = properties[kCGImagePropertyPixelWidth] as? Int,
              let rawHeight = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }
        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        let (width, height) = shownSize(width: rawWidth, height: rawHeight, orientation: orientation)
        let animated = CGImageSourceGetCount(source) > 1 || mime == "image/gif"
        guard needsThumbnail(width: width, height: height, animated: animated) else {
            return Picture(width: width, height: height, thumbnail: nil, thumbnailWidth: 0, thumbnailHeight: 0)
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: thumbnailMaxPixel,
        ]
        guard let preview = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              let jpeg = jpegData(preview), jpeg.count < data.count
        else {
            return Picture(width: width, height: height, thumbnail: nil, thumbnailWidth: 0, thumbnailHeight: 0)
        }
        return Picture(width: width, height: height, thumbnail: jpeg, thumbnailWidth: preview.width, thumbnailHeight: preview.height)
    }

    struct Video {
        let width: Int?
        let height: Int?
        let duration: TimeInterval?
        /// JPEG of the first frame, at most `thumbnailMaxPixel` on the longest side.
        let thumbnail: Data?
        let thumbnailWidth: Int
        let thumbnailHeight: Int
    }

    /// Size, length and first frame of a video. AVFoundation reads from a file, so the data is
    /// written to a temporary one for a moment. Nil fields when something cannot be read; the
    /// video is still sent.
    @available(iOS 16, macOS 13, *) // the app needs iOS 16; the check tool builds on macOS
    static func video(_ data: Data, mime: String) async -> Video {
        let ext = UTType(mimeType: mime)?.preferredFilenameExtension ?? "mp4"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("send-\(UUID().uuidString).\(ext)")
        defer { try? FileManager.default.removeItem(at: url) }
        guard (try? data.write(to: url)) != nil else {
            return Video(width: nil, height: nil, duration: nil, thumbnail: nil, thumbnailWidth: 0, thumbnailHeight: 0)
        }
        let asset = AVURLAsset(url: url)
        var width: Int?
        var height: Int?
        var duration: TimeInterval?
        if let length = try? await asset.load(.duration), length.isNumeric { duration = length.seconds }
        if let track = try? await asset.loadTracks(withMediaType: .video).first,
           let geometry = try? await track.load(.naturalSize, .preferredTransform) {
            let shown = geometry.0.applying(geometry.1)
            width = Int(abs(shown.width).rounded())
            height = Int(abs(shown.height).rounded())
        }
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: thumbnailMaxPixel, height: thumbnailMaxPixel)
        var thumbnail: Data?
        var thumbnailWidth = 0
        var thumbnailHeight = 0
        if let frame = try? await generator.image(at: .zero).image, let jpeg = jpegData(frame) {
            thumbnail = jpeg
            thumbnailWidth = frame.width
            thumbnailHeight = frame.height
        }
        return Video(width: width, height: height, duration: duration, thumbnail: thumbnail,
                     thumbnailWidth: thumbnailWidth, thumbnailHeight: thumbnailHeight)
    }

    /// EXIF orientations 5 to 8 turn the picture by 90 degrees.
    static func shownSize(width: Int, height: Int, orientation: Int) -> (Int, Int) {
        (5...8).contains(orientation) ? (height, width) : (width, height)
    }

    /// A preview only pays off for a still picture larger than one.
    static func needsThumbnail(width: Int, height: Int, animated: Bool) -> Bool {
        !animated && max(width, height) > thumbnailMaxPixel
    }

    private static func jpegData(_ image: CGImage) -> Data? {
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
