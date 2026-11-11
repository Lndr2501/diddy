import AVFoundation
import CoreTransferable
import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

/// Writing your own Diddy profile: a fresh read before writing, and the pictures and videos of the
/// profile (banner, nameplate) uploaded like desktop's `media.ts` does.
extension MatrixAccount {
    /// Reads the profiles again for a write. A load that is still running is waited for first
    /// (`loadDiddyProfiles` returns at once while one runs), so the write never starts from an
    /// older or not yet loaded profile.
    func reloadDiddyProfilesForWrite() async {
        var waited = 0
        while diddyLoading && waited < 200 {
            try? await Task.sleep(nanoseconds: 100_000_000)
            waited += 1
        }
        await loadDiddyProfiles(force: true)
    }

    /// The upload limit for profile media: 8 MB like desktop, or the server's when it is lower.
    func diddyUploadLimit() async -> Int {
        for path in ["/_matrix/client/v1/media/config", "/_matrix/media/v3/config"] {
            guard let json = try? await clientRequest(path) else { continue }
            if let max = (json["m.upload.size"] as? NSNumber)?.intValue, max > 0 {
                return min(DiddyMediaRules.maxBytes, max)
            }
            return DiddyMediaRules.maxBytes
        }
        return DiddyMediaRules.maxBytes
    }

    /// Uploads a file to the media repository (`POST /_matrix/media/v3/upload`, like desktop's
    /// `uploadContent`) and returns its mxc:// URI. Profile media is public like avatars, so it is
    /// not encrypted.
    func uploadDiddyMedia(_ data: Data, mimeType: String, filename: String) async throws -> String {
        let session = try client.session()
        let base = session.homeserverUrl.hasSuffix("/") ? String(session.homeserverUrl.dropLast()) : session.homeserverUrl
        let name = filename.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: ".-_"))) ?? "upload"
        guard let url = URL(string: base + "/_matrix/media/v3/upload?filename=" + name) else {
            throw DiddyError("Invalid homeserver URL.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        let (body, response) = try await URLSession.shared.upload(for: request, from: data)
        let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let uri = json["content_uri"] as? String, DiddySanitize.mxc(uri) != nil else {
            throw DiddyError(json["error"] as? String ?? "The upload failed.")
        }
        return uri
    }
}

/// Getting pictures and videos ready for the profile.
enum DiddyMediaPrep {
    struct File {
        let data: Data
        let mimeType: String
        let ext: String
    }

    /// A picture as it is uploaded: GIF, PNG, JPEG and WebP unchanged (animations stay), other
    /// formats (HEIC, ...) and too large still pictures as JPEG, which every Diddy can show.
    static func picture(_ data: Data, limit: Int) throws -> File {
        let type = DiddyMediaRules.imageType(of: data)
        if let type, data.count <= limit { return File(data: data, mimeType: type.mimeType, ext: type.ext) }
        if isAnimated(data) {
            throw DiddyError("This animation is too large (max \(megabytes(limit)) MB).")
        }
        guard let image = UIImage(data: data) else { throw DiddyError("This picture could not be read.") }
        for side in [2560.0, 1600.0, 1024.0] {
            if let jpeg = scaled(image, maxSide: side).jpegData(compressionQuality: 0.85), jpeg.count <= limit {
                return File(data: jpeg, mimeType: "image/jpeg", ext: "jpg")
            }
        }
        throw DiddyError("This picture is too large (max \(megabytes(limit)) MB).")
    }

    /// A nameplate loop (desktop `uploadNameplateMedia`): at most 15 seconds, as MP4 (H.264, which
    /// desktop on macOS and Linux plays), and its first frame as the still picture.
    static func nameplateVideo(_ source: URL, limit: Int) async throws -> (video: File, poster: File) {
        let asset = AVURLAsset(url: source)
        let duration = try await asset.load(.duration).seconds
        guard duration.isFinite, duration > 0 else { throw DiddyError("This video cannot be played here.") }
        guard duration <= DiddyMediaRules.maxVideoSeconds else {
            throw DiddyError("Video too long (max \(Int(DiddyMediaRules.maxVideoSeconds)) seconds).")
        }

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 960, height: 960)
        let frame = try await generator.image(at: CMTime(seconds: min(0.05, duration / 2), preferredTimescale: 600)).image
        guard let poster = UIImage(cgImage: frame).pngData() else { throw DiddyError("This video cannot be played here.") }

        let output = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("mp4")
        defer { try? FileManager.default.removeItem(at: output) }
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetMediumQuality) else {
            throw DiddyError("This video cannot be converted.")
        }
        export.outputURL = output
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            export.exportAsynchronously { continuation.resume() }
        }
        guard export.status == .completed else {
            throw DiddyError(export.error?.localizedDescription ?? "This video cannot be converted.")
        }
        let video = try Data(contentsOf: output)
        guard video.count <= limit, poster.count <= limit else {
            throw DiddyError("This video is too large (max \(megabytes(limit)) MB).")
        }
        return (File(data: video, mimeType: "video/mp4", ext: "mp4"), File(data: poster, mimeType: "image/png", ext: "png"))
    }

    private static func isAnimated(_ data: Data) -> Bool {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return false }
        return CGImageSourceGetCount(source) > 1
    }

    private static func scaled(_ image: UIImage, maxSide: Double) -> UIImage {
        let longest = Double(max(image.size.width, image.size.height))
        guard longest > maxSide, longest > 0 else { return image }
        let factor = maxSide / longest
        let size = CGSize(width: (Double(image.size.width) * factor).rounded(), height: (Double(image.size.height) * factor).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    private static func megabytes(_ bytes: Int) -> Int { max(1, bytes / (1024 * 1024)) }
}

/// A video picked in Photos, copied to a temporary file (PhotosPicker hands out files only for
/// the moment of the import).
struct DiddyPickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let ext = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return Self(url: copy)
        }
    }
}
